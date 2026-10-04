"""
Portfolio Optimization Engine.
Implements:
1. Minimum Variance (Quadratic Programming via SciPy SLSQP / CVXPY)
2. Maximum Sharpe Ratio (Tangency Portfolio with Indian Rf = 6.5%)
3. Risk Parity / Equal Risk Contribution (Spinu Algorithm / SQP)
4. Hierarchical Risk Parity (HRP from scratch: Clustering, Quasi-Diagonalization, Recursive Bisection)
5. Black-Litterman Model (Equilibrium Prior + Investor Views -> Bayesian Posterior)
6. CVaR (Expected Shortfall) Convex Optimization (Rockafellar & Uryasev formulation)

Advanced Multi-Objective & Evolutionary Algorithms:
7. Genetic Algorithm (Evolutionary Portfolio Optimization with crossover, mutation & Sharpe fitness)
8. Entropy Pooling (Meucci's relative entropy view-conditioned scenario optimization)
9. NSGA-II (Non-dominated Sorting Genetic Algorithm II for Return, CVaR, Turnover & Diversification)
10. MOEA/D (Decomposition-Based Multi-Objective Evolutionary Algorithm with Tchebycheff scalarization)
11. SPEA2 (Strength Pareto Evolutionary Algorithm 2 with density estimation)
12. MOPSO (Multi-Objective Particle Swarm Optimization with external Pareto archive)
"""

import logging
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.spatial.distance import pdist, squareform
from scipy.cluster.hierarchy import linkage

try:
    import cvxpy as cp
except ImportError:
    cp = None

from backend.app.config import settings

logger = logging.getLogger(__name__)

class PortfolioOptimizer:
    def __init__(
        self,
        returns: pd.DataFrame,
        covariance: np.ndarray,
        expected_returns: Optional[np.ndarray] = None,
        rf: float = settings.DEFAULT_RISK_FREE_RATE,
        max_asset_weight: float = settings.DEFAULT_MAX_ASSET_WEIGHT
    ):
        self.returns = returns
        self.symbols = list(returns.columns)
        self.num_assets = len(self.symbols)
        self.cov = covariance
        self.rf = rf
        self.max_weight = max_asset_weight

        # Ensure valid expected returns
        if expected_returns is None:
            self.mu = returns.mean().values * 252.0
        else:
            self.mu = expected_returns

    def optimize_minimum_variance(self) -> Dict[str, Any]:
        """
        Minimum Variance Portfolio:
        min w^T Sigma w  s.t. sum(w) = 1, 0 <= w_i <= max_weight
        """
        effective_max = max(self.max_weight, 1.0 / self.num_assets)
        if cp is not None:
            try:
                w = cp.Variable(self.num_assets)
                risk = cp.quad_form(w, self.cov)
                constraints = [
                    cp.sum(w) == 1.0,
                    w >= 0.0,
                    w <= effective_max
                ]
                prob = cp.Problem(cp.Minimize(risk), constraints)
                prob.solve(solver=cp.OSQP, eps_abs=1e-6, eps_rel=1e-6)
                if w.value is not None:
                    weights = np.array(w.value).flatten()
                    weights = self._clean_and_normalize_weights(weights)
                    return self._format_result("Minimum Variance", weights)
            except Exception as e:
                logger.warning(f"CVXPY min variance failed: {e}. Falling back to SLSQP.")

        weights = self._scipy_min_var(effective_max)
        weights = self._clean_and_normalize_weights(weights)
        return self._format_result("Minimum Variance", weights)

    def _scipy_min_var(self, max_weight: float) -> np.ndarray:
        def obj(w):
            val = float(w @ self.cov @ w)
            grad = 2.0 * (self.cov @ w)
            return val, grad
        w0 = np.ones(self.num_assets) / self.num_assets
        bnds = [(0.0, max_weight) for _ in range(self.num_assets)]
        cons = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
        res = minimize(obj, w0, method='SLSQP', jac=True, bounds=bnds, constraints=cons, options={'ftol': 1e-7, 'maxiter': 60})
        return res.x if res.success else w0

    def optimize_maximum_sharpe(self, w0: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """
        Maximum Sharpe Ratio (Tangency Portfolio):
        max (w^T mu - Rf) / sqrt(w^T Sigma w) s.t. sum(w) = 1, 0 <= w_i <= max_weight
        """
        effective_max = max(self.max_weight, 1.0 / self.num_assets)

        def neg_sharpe(w):
            port_return = float(w @ self.mu)
            port_vol = float(np.sqrt(np.maximum(w @ self.cov @ w, 1e-8)))
            return - (port_return - self.rf) / port_vol

        if w0 is None or len(w0) != self.num_assets or not np.all(np.isfinite(w0)):
            w0 = np.ones(self.num_assets) / self.num_assets
        else:
            w0 = np.clip(w0, 0.0, effective_max)
            s = np.sum(w0)
            w0 = w0 / s if s > 1e-6 else np.ones(self.num_assets) / self.num_assets

        bounds = [(0.0, effective_max) for _ in range(self.num_assets)]
        constraints = [{'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0}]

        res = minimize(
            neg_sharpe,
            w0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'ftol': 1e-6, 'maxiter': 150}
        )

        weights = res.x if res.success else w0
        weights = self._clean_and_normalize_weights(weights)
        return self._format_result("Maximum Sharpe Ratio", weights)

    def optimize_risk_parity(self, w0: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """
        Risk Parity / Equal Risk Contribution (ERC):
        Spinu (2013) convex formulation / Cyclical risk contribution matching:
        w_i * (Sigma * w)_i = (1/N) * (w^T Sigma w)
        """
        effective_max = max(self.max_weight, 1.0 / self.num_assets)

        def risk_parity_objective(w):
            port_vol = np.sqrt(np.maximum(w @ self.cov @ w, 1e-8))
            marginal_risk = (self.cov @ w) / port_vol
            risk_contributions = w * marginal_risk
            target_risk = port_vol / self.num_assets
            return float(np.sum((risk_contributions - target_risk) ** 2))

        if w0 is None or len(w0) != self.num_assets or not np.all(np.isfinite(w0)):
            w0 = np.ones(self.num_assets) / self.num_assets
        else:
            w0 = np.clip(w0, 0.001, effective_max)
            s = np.sum(w0)
            w0 = w0 / s if s > 1e-6 else np.ones(self.num_assets) / self.num_assets

        bounds = [(0.001, effective_max) for _ in range(self.num_assets)]
        constraints = [{'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0}]

        res = minimize(
            risk_parity_objective,
            w0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'ftol': 1e-6, 'maxiter': 150}
        )

        weights = res.x if res.success else w0
        weights = self._clean_and_normalize_weights(weights)
        return self._format_result("Risk Parity (ERC)", weights)

    def optimize_hierarchical_risk_parity(self) -> Dict[str, Any]:
        """
        Hierarchical Risk Parity (HRP) from scratch:
        1. Tree clustering using correlation distance matrix
        2. Quasi-diagonalization of covariance matrix
        3. Recursive bisection allocating inversely proportional to cluster variance
        """
        corr = self.returns.corr().values
        cov = self.cov.copy()

        # Step 1: Distance matrix D_ij = sqrt(0.5 * (1 - rho_ij))
        dist = np.sqrt(np.maximum(0.5 * (1.0 - corr), 0.0))
        np.fill_diagonal(dist, 0.0)

        # Step 2: Hierarchical Clustering (Linkage)
        condensed_dist = squareform(dist, checks=False)
        link = linkage(condensed_dist, method='single')

        # Step 3: Quasi-Diagonalization (Dendrogram leaf ordering)
        sort_order = self._get_quasi_diag_order(link, self.num_assets)
        sorted_cov = cov[np.ix_(sort_order, sort_order)]

        # Step 4: Recursive Bisection
        weights_sorted = pd.Series(1.0, index=range(self.num_assets))
        cluster_list = [list(range(self.num_assets))]

        while len(cluster_list) > 0:
            cluster_list = [
                c[j:k]
                for c in cluster_list
                for j, k in ((0, len(c) // 2), (len(c) // 2, len(c)))
                if len(c) > 1
            ]
            for i in range(0, len(cluster_list), 2):
                c1 = cluster_list[i]
                c2 = cluster_list[i + 1]
                v1 = self._get_cluster_variance(sorted_cov, c1)
                v2 = self._get_cluster_variance(sorted_cov, c2)
                alpha = 1.0 - v1 / (v1 + v2) if (v1 + v2) > 0 else 0.5
                weights_sorted.iloc[c1] *= alpha
                weights_sorted.iloc[c2] *= (1.0 - alpha)

        weights = np.zeros(self.num_assets)
        for sorted_idx, orig_idx in enumerate(sort_order):
            weights[orig_idx] = weights_sorted.iloc[sorted_idx]

        effective_max = max(self.max_weight, 1.0 / self.num_assets)
        weights = np.clip(weights, 0.0, effective_max)
        weights = self._clean_and_normalize_weights(weights)

        return self._format_result("Hierarchical Risk Parity", weights)

    def _get_quasi_diag_order(self, link: np.ndarray, num_assets: int) -> List[int]:
        def get_leaves(node_id):
            if node_id < num_assets:
                return [node_id]
            left = int(link[node_id - num_assets, 0])
            right = int(link[node_id - num_assets, 1])
            return get_leaves(left) + get_leaves(right)

        root_id = 2 * num_assets - 2
        return get_leaves(root_id)

    def _get_cluster_variance(self, cov: np.ndarray, cluster_indices: List[int]) -> float:
        sub_cov = cov[np.ix_(cluster_indices, cluster_indices)]
        inv_diag = 1.0 / np.maximum(np.diag(sub_cov), 1e-8)
        w = inv_diag / np.sum(inv_diag)
        return float(w @ sub_cov @ w)

    def optimize_black_litterman(
        self,
        views: Optional[Dict[str, float]] = None,
        view_confidences: Optional[Dict[str, float]] = None,
        tau: float = 0.05,
        risk_aversion: float = 3.0
    ) -> Dict[str, Any]:
        """
        Black-Litterman Model:
        Prior Equilibrium Returns: Pi = lambda * Sigma * w_mkt
        Investor Views: P * mu = Q + epsilon, epsilon ~ N(0, Omega)
        Posterior expected returns and covariance fed into Mean-Variance optimizer.
        """
        w_mkt = np.ones(self.num_assets) / self.num_assets
        pi = risk_aversion * (self.cov @ w_mkt)
        effective_max = max(self.max_weight, 1.0 / self.num_assets)

        if not views:
            views = {}
            for i, sym in enumerate(self.symbols):
                if self.mu[i] > np.median(self.mu):
                    views[sym] = float(self.mu[i] * 1.1)

        view_symbols = [s for s in views.keys() if s in self.symbols]
        k = len(view_symbols)

        if k == 0:
            posterior_mu = pi
            posterior_cov = self.cov
        else:
            P = np.zeros((k, self.num_assets))
            Q = np.zeros(k)
            omega_diag = []

            for row_idx, sym in enumerate(view_symbols):
                asset_idx = self.symbols.index(sym)
                P[row_idx, asset_idx] = 1.0
                Q[row_idx] = views[sym]
                conf = view_confidences.get(sym, 0.5) if view_confidences else 0.5
                conf = np.clip(conf, 0.1, 0.99)
                var_view = (1.0 - conf) / conf * (tau * self.cov[asset_idx, asset_idx])
                omega_diag.append(max(var_view, 1e-6))

            Omega = np.diag(omega_diag)
            tau_cov = tau * self.cov
            tau_cov_inv = np.linalg.pinv(tau_cov)
            omega_inv = np.linalg.pinv(Omega)

            precision = tau_cov_inv + P.T @ omega_inv @ P
            posterior_cov_m = np.linalg.pinv(precision)
            posterior_mu = posterior_cov_m @ (tau_cov_inv @ pi + P.T @ omega_inv @ Q)
            posterior_cov = self.cov + posterior_cov_m

        # Scipy Quadratic utility maximization
        def neg_utility(w):
            ret = float(posterior_mu @ w)
            risk = float(w @ posterior_cov @ w)
            val = -(ret - (risk_aversion / 2.0) * risk)
            grad = - posterior_mu + risk_aversion * (posterior_cov @ w)
            return val, grad

        w0 = np.ones(self.num_assets) / self.num_assets
        bnds = [(0.0, effective_max) for _ in range(self.num_assets)]
        cons = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
        res = minimize(neg_utility, w0, method='SLSQP', jac=True, bounds=bnds, constraints=cons, options={'ftol': 1e-7, 'maxiter': 60})
        weights = res.x if res.success else w0

        weights = self._clean_and_normalize_weights(weights)
        result = self._format_result("Black-Litterman", weights)
        result["posterior_expected_returns"] = {
            self.symbols[i]: round(float(posterior_mu[i]), 4) for i in range(self.num_assets)
        }
        return result

    def optimize_cvar(self, alpha: float = 0.95) -> Dict[str, Any]:
        """
        Conditional Value at Risk (CVaR / Expected Shortfall) Optimization:
        Rockafellar & Uryasev (2000) Convex Formulation
        min zeta + 1 / ((1 - alpha) * T) * sum(u_t)
        """
        R = self.returns.values  # (T, N)
        T, N = R.shape
        effective_max = max(self.max_weight, 1.0 / self.num_assets)

        # Objective: var zeta + (1 / ((1 - alpha) * T)) * sum(max(0, -R @ w - zeta))
        def cvar_obj(x):
            w = x[:N]
            zeta = x[N]
            portfolio_losses = - R @ w
            excess_losses = np.maximum(0.0, portfolio_losses - zeta)
            return float(zeta + (1.0 / ((1.0 - alpha) * T)) * np.sum(excess_losses))

        w0 = np.ones(N) / N
        initial_zeta = float(np.percentile(- R @ w0, 100.0 * alpha))
        x0 = np.append(w0, initial_zeta)

        bounds = [(0.0, effective_max) for _ in range(N)] + [(None, None)]
        constraints = [{'type': 'eq', 'fun': lambda x: np.sum(x[:N]) - 1.0}]

        res = minimize(cvar_obj, x0, method='SLSQP', bounds=bounds, constraints=constraints, options={'ftol': 1e-7, 'maxiter': 300})
        if res.success:
            weights = res.x[:N]
            cvar_value = float(res.fun)
        else:
            return self.optimize_minimum_variance()

        weights = self._clean_and_normalize_weights(weights)
        result = self._format_result("CVaR (Expected Shortfall)", weights)
        result["cvar_95"] = round(cvar_value * np.sqrt(252), 4)
        return result

    def optimize_rmt_momentum(
        self,
        risk_aversion: float = 1.5,
        min_weight: float = 0.04,
        max_weight: float = 0.16
    ) -> Dict[str, Any]:
        """
        Default Strategy: Kinetic RMT Trend Acceleration & Momentum Utility Optimization.
        Selects Top 10 momentum assets from qualified accelerating trend universe,
        denoises covariance using Random Matrix Theory (RMT), and maximizes mean-variance utility.
        """
        N = self.num_assets
        T = len(self.returns) if self.returns is not None else 126

        # 1. Structural Momentum Ranking over universe
        if self.returns is not None:
            win = min(126, len(self.returns))
            cum_ret = (1.0 + self.returns.iloc[-win:]).prod(axis=0) - 1.0
        else:
            cum_ret = pd.Series(self.mu, index=self.symbols)

        # Select Top 10 momentum assets
        top_k = min(10, N)
        top_assets = cum_ret.nlargest(top_k).index.tolist()
        top_indices = [self.symbols.index(s) for s in top_assets]

        # Momentum-conditioned expected returns for top 10: mu = 0.10 + 0.02 * rank
        top_ranks = cum_ret.loc[top_assets].rank().values
        mu_top = 0.10 + 0.02 * top_ranks

        # Sub-covariance for top 10
        cov_sub = self.cov[np.ix_(top_indices, top_indices)]
        std_devs = np.sqrt(np.diag(cov_sub))
        std_devs = np.where(std_devs == 0, 1e-8, std_devs)
        corr_sub = cov_sub / np.outer(std_devs, std_devs)

        eigenvalues, eigenvectors = np.linalg.eigh(corr_sub)
        lambda_plus = (1.0 + np.sqrt(top_k / max(T, top_k + 1))) ** 2

        noise_eigenvals = eigenvalues[eigenvalues < lambda_plus]
        if len(noise_eigenvals) > 0:
            mean_noise = float(np.mean(noise_eigenvals))
            denoised_eigenvalues = np.where(eigenvalues < lambda_plus, mean_noise, eigenvalues)
        else:
            denoised_eigenvalues = eigenvalues

        denoised_corr = eigenvectors @ np.diag(denoised_eigenvalues) @ eigenvectors.T
        np.fill_diagonal(denoised_corr, 1.0)
        cov_rmt = np.diag(std_devs) @ denoised_corr @ np.diag(std_devs)

        # 2. Utility Optimization over top assets
        def mv_utility_obj(w):
            p_ret = float(np.dot(w, mu_top))
            p_vol = float(np.dot(w.T, np.dot(cov_rmt, w)))
            return - (p_ret - 0.5 * risk_aversion * p_vol)

        min_w = min_weight
        max_w = max_weight
        if min_w * top_k > 1.0:
            min_w = 1.0 / top_k
        if max_w * top_k < 1.0:
            max_w = 1.0 / top_k

        bnds = tuple((min_w, max_w) for _ in range(top_k))
        cons = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
        init_w = np.ones(top_k) / top_k

        res = minimize(mv_utility_obj, init_w, method='SLSQP', bounds=bnds, constraints=cons)
        optimal_sub_w = res.x if res.success else init_w

        # Map back to full asset universe
        full_weights = np.zeros(N)
        for i, idx in enumerate(top_indices):
            full_weights[idx] = optimal_sub_w[i]

        weights_dict = {self.symbols[i]: round(float(full_weights[i]), 5) for i in range(N)}
        
        # Calculate performance metrics matching user's exact formula
        port_ret = float(np.dot(optimal_sub_w, mu_top))
        port_vol = float(np.sqrt(max(float(optimal_sub_w.T @ cov_rmt @ optimal_sub_w), 1e-8)))
        sharpe = round(port_ret / max(port_vol, 1e-4), 4)

        risk_contribs = {}
        for i, idx in enumerate(top_indices):
            sym = self.symbols[idx]
            rc = float(optimal_sub_w[i] * (cov_rmt @ optimal_sub_w)[i] / max(port_vol**2, 1e-8))
            risk_contribs[sym] = round(rc * 100, 2)
        for sym in self.symbols:
            if sym not in risk_contribs:
                risk_contribs[sym] = 0.0

        return {
            "optimizer": "RMT Trend Momentum (Default)",
            "weights": weights_dict,
            "expected_annual_return": round(port_ret, 4),
            "expected_return": round(port_ret, 4),
            "annual_volatility": round(port_vol, 4),
            "volatility": round(port_vol, 4),
            "sharpe_ratio": sharpe,
            "risk_contributions": risk_contribs
        }

    # -------------------------------------------------------------------------
    # 6 ADVANCED MULTI-OBJECTIVE & EVOLUTIONARY OPTIMIZERS
    # -------------------------------------------------------------------------

    def optimize_genetic_algorithm(
        self,
        population_size: int = 60,
        generations: int = 40,
        mutation_rate: float = 0.15,
        elite_ratio: float = 0.15
    ) -> Dict[str, Any]:
        """
        1. Genetic Algorithm — Evolutionary Portfolio Optimization
        Optimizes weights under risk-return trade-off and diversification constraint using
        chromosomal representation, blend crossover, and Gaussian mutation.
        """
        effective_max = max(self.max_weight, 1.0 / self.num_assets)
        N = self.num_assets

        # Initialize population on simplex
        np.random.seed(42)
        pop = np.random.uniform(0.01, effective_max, size=(population_size, N))
        pop = pop / np.sum(pop, axis=1, keepdims=True)

        def fitness(w):
            ret = float(w @ self.mu)
            vol = float(np.sqrt(max(w @ self.cov @ w, 1e-8)))
            sharpe = (ret - self.rf) / vol if vol > 1e-8 else 0.0
            # Penalty for exceeding max weight
            penalty = 10.0 * np.sum(np.maximum(0.0, w - effective_max) ** 2)
            # Bonus for diversification (entropy)
            div_bonus = 0.05 * (- np.sum(w * np.log(np.maximum(w, 1e-6))))
            return sharpe - penalty + div_bonus

        elite_count = max(2, int(population_size * elite_ratio))
        best_w = pop[0]
        best_fit = -1e9

        for gen in range(generations):
            scores = np.array([fitness(ind) for ind in pop])
            idx_sorted = np.argsort(scores)[::-1]
            pop = pop[idx_sorted]
            scores = scores[idx_sorted]

            if scores[0] > best_fit:
                best_fit = scores[0]
                best_w = pop[0].copy()

            # Next generation
            new_pop = list(pop[:elite_count])
            while len(new_pop) < population_size:
                # Tournament selection
                i1, i2 = np.random.choice(population_size // 2, 2, replace=False)
                p1 = pop[min(i1, i2)]
                i3, i4 = np.random.choice(population_size // 2, 2, replace=False)
                p2 = pop[min(i3, i4)]

                # Arithmetic Crossover
                gamma = np.random.uniform(0.2, 0.8)
                child = gamma * p1 + (1.0 - gamma) * p2

                # Mutation
                if np.random.rand() < mutation_rate:
                    mut_idx = np.random.choice(N, size=max(1, N // 3), replace=False)
                    child[mut_idx] += np.random.normal(0, 0.05, size=len(mut_idx))
                    child = np.clip(child, 0.0, effective_max)

                # Re-normalize
                s = np.sum(child)
                child = child / s if s > 1e-6 else np.ones(N) / N
                new_pop.append(child)

            pop = np.array(new_pop)

        best_w = self._clean_and_normalize_weights(best_w)
        res = self._format_result("Genetic Algorithm (Evolutionary)", best_w)
        res["meta"] = {
            "algorithm": "Genetic Algorithm",
            "generations": generations,
            "population": population_size,
            "best_fitness_score": round(float(best_fit), 4)
        }
        return res

    def optimize_entropy_pooling(
        self,
        scenario_views: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        2. Entropy Pooling — View-Conditioned Portfolio Optimization (Meucci 2008)
        Minimizes relative entropy (Kullback-Leibler divergence) between prior distribution
        and view-conditioned posterior scenario probabilities, updating return expectations.
        """
        T, N = self.returns.values.shape
        effective_max = max(self.max_weight, 1.0 / self.num_assets)
        R = self.returns.values

        # Prior probability distribution over historical scenarios: uniform p_0 = 1/T
        p_0 = np.ones(T) / T

        # Default views if none supplied: Market outperformance view on top momentum assets
        if not scenario_views:
            scenario_views = {}
            for i, sym in enumerate(self.symbols):
                if self.mu[i] > np.median(self.mu):
                    scenario_views[sym] = float(self.mu[i] * 1.08)

        # Build view matrix A_eq @ p = b_eq
        view_syms = [s for s in scenario_views.keys() if s in self.symbols]
        if len(view_syms) == 0:
            view_syms = [self.symbols[0]]
            scenario_views = {self.symbols[0]: float(self.mu[0] * 1.05)}

        K = len(view_syms)
        A_eq = np.zeros((K, T))
        b_eq = np.zeros(K)

        for k, sym in enumerate(view_syms):
            col_idx = self.symbols.index(sym)
            A_eq[k, :] = R[:, col_idx] * 252.0  # Annualized scenario return
            b_eq[k] = scenario_views[sym]

        # Meucci Relative Entropy Minimization:
        # min sum(p_t * ln(p_t / p_0_t)) s.t. sum(p_t) = 1, A_eq @ p = b_eq, p_t >= 1e-6
        def kl_divergence(p):
            p = np.maximum(p, 1e-9)
            return float(np.sum(p * np.log(p / p_0)))

        p_init = p_0.copy()
        bounds = [(1e-6, 1.0) for _ in range(T)]
        constraints = [
            {'type': 'eq', 'fun': lambda p: np.sum(p) - 1.0},
            {'type': 'eq', 'fun': lambda p: A_eq @ p - b_eq}
        ]

        res = minimize(kl_divergence, p_init, method='SLSQP', bounds=bounds, constraints=constraints, options={'maxiter': 200, 'ftol': 1e-7})
        p_post = res.x if res.success else p_0
        p_post = np.maximum(p_post, 0.0)
        p_post = p_post / np.sum(p_post)

        # Posterior expected return and covariance under updated scenario probabilities
        mu_post = np.sum(R * p_post[:, None], axis=0) * 252.0
        # Centered scenario returns
        R_centered = R - (mu_post / 252.0)
        cov_post = (R_centered.T @ np.diag(p_post) @ R_centered) * 252.0

        # Mean-Variance Tangency Portfolio under posterior parameters
        def obj(w):
            port_ret = float(w @ mu_post)
            port_vol = float(np.sqrt(max(w @ cov_post @ w, 1e-8)))
            return - (port_ret - self.rf) / port_vol

        w0 = np.ones(N) / N
        bnds = [(0.0, effective_max) for _ in range(N)]
        cons = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
        opt_res = minimize(obj, w0, method='SLSQP', bounds=bnds, constraints=cons)
        weights = opt_res.x if opt_res.success else w0

        weights = self._clean_and_normalize_weights(weights)
        result = self._format_result("Entropy Pooling (Meucci Views)", weights)
        result["meta"] = {
            "views_applied": scenario_views,
            "kl_entropy_distance": round(float(np.sum(p_post * np.log(np.maximum(p_post / p_0, 1e-9)))), 5),
            "effective_scenarios": round(float(np.exp(-np.sum(p_post * np.log(np.maximum(p_post, 1e-9))))), 1)
        }
        return result

    def _eval_multi_objectives(self, w: np.ndarray, w_prior: Optional[np.ndarray] = None) -> Tuple[float, float, float, float]:
        """
        Evaluate the 4 core objectives:
        1. Expected Return (to maximize -> minimize -return)
        2. CVaR 95% (to minimize)
        3. Turnover (to minimize)
        4. Diversification (Herfindahl Index to minimize = maximize diversification)
        """
        N = self.num_assets
        if w_prior is None:
            w_prior = np.ones(N) / N

        # Objective 1: Return
        ret = float(w @ self.mu)
        f1 = - ret  # Minimize negative return

        # Objective 2: CVaR (95%)
        port_losses = - self.returns.values @ w
        zeta = float(np.percentile(port_losses, 95))
        cvar_95 = float(zeta + (1.0 / (0.05 * len(port_losses))) * np.sum(np.maximum(0.0, port_losses - zeta))) * np.sqrt(252)
        f2 = cvar_95  # Minimize CVaR

        # Objective 3: Turnover vs prior
        turnover = float(0.5 * np.sum(np.abs(w - w_prior)))
        f3 = turnover  # Minimize turnover

        # Objective 4: Concentration (Herfindahl-Hirschman Index = sum(w_i^2))
        hhi = float(np.sum(w ** 2))
        f4 = hhi  # Minimize HHI (maximize diversification)

        return f1, f2, f3, f4

    def _eval_multi_objectives_batch(self, pop: np.ndarray, w_prior: Optional[np.ndarray] = None) -> np.ndarray:
        """
        Vectorized evaluation of the 4 core objectives across an entire population matrix (P, N).
        Dramatically accelerates NSGA-II from seconds to milliseconds.
        """
        P, N = pop.shape
        if w_prior is None:
            w_prior = np.ones(N) / N

        # Objective 1: Return (minimize negative return)
        rets = pop @ self.mu
        f1 = - rets

        # Objective 2: CVaR (95%)
        R = self.returns.values
        T = len(R)
        port_losses = - R @ pop.T  # shape (T, P)
        zeta = np.percentile(port_losses, 95, axis=0)  # shape (P,)
        excess = np.maximum(0.0, port_losses - zeta)
        cvar_95 = (zeta + (1.0 / (0.05 * T)) * np.sum(excess, axis=0)) * np.sqrt(252)
        f2 = cvar_95

        # Objective 3: Turnover vs prior
        turnover = 0.5 * np.sum(np.abs(pop - w_prior), axis=1)
        f3 = turnover

        # Objective 4: Concentration (HHI)
        hhi = np.sum(pop ** 2, axis=1)
        f4 = hhi

        return np.column_stack([f1, f2, f3, f4])

    def optimize_nsga2(
        self,
        population_size: int = 50,
        generations: int = 35
    ) -> Dict[str, Any]:
        """
        3. NSGA-II — Multi-Objective Portfolio Optimization
        Pareto ranking and crowding distance to simultaneously optimize:
        Expected Return ↑ | CVaR ↓ | Turnover ↓ | Diversification ↑
        Accelerated with vectorized matrix evaluations and O(1) tournament selection.
        """
        effective_max = max(self.max_weight, 1.0 / self.num_assets)
        N = self.num_assets
        w_prior = np.ones(N) / N

        # Initialize population
        np.random.seed(123)
        pop = np.random.uniform(0.01, effective_max, size=(population_size, N))
        pop = pop / np.sum(pop, axis=1, keepdims=True)

        # Vectorized evaluation of initial population
        pop_objs = self._eval_multi_objectives_batch(pop, w_prior)

        for gen in range(generations):
            # Non-dominated Sorting
            fronts = self._fast_non_dominated_sort(pop_objs)
            crowding_distances = self._compute_crowding_distance(pop_objs, fronts)

            # Build O(1) rank lookup
            rank_map = np.full(population_size, len(fronts), dtype=int)
            for r_idx, front in enumerate(fronts):
                for idx in front:
                    if idx < population_size:
                        rank_map[idx] = r_idx

            # Generate offspring
            offspring = []
            while len(offspring) < population_size:
                # Fast tournament selection
                i1, i2 = np.random.choice(population_size, 2, replace=False)
                r1, r2 = rank_map[i1], rank_map[i2]
                p1_idx = i1 if (r1 < r2 or (r1 == r2 and crowding_distances[i1] >= crowding_distances[i2])) else i2

                i3, i4 = np.random.choice(population_size, 2, replace=False)
                r3, r4 = rank_map[i3], rank_map[i4]
                p2_idx = i3 if (r3 < r4 or (r3 == r4 and crowding_distances[i3] >= crowding_distances[i4])) else i4

                p1, p2 = pop[p1_idx], pop[p2_idx]

                alpha = np.random.uniform(0.1, 0.9)
                child = alpha * p1 + (1.0 - alpha) * p2

                if np.random.rand() < 0.2:
                    child += np.random.normal(0, 0.04, size=N)
                    child = np.clip(child, 0.0, effective_max)

                s = np.sum(child)
                child = child / s if s > 1e-6 else np.ones(N) / N
                offspring.append(child)

            offspring = np.array(offspring)
            offspring_objs = self._eval_multi_objectives_batch(offspring, w_prior)

            # Combine parent + offspring (2N) without re-evaluating parents
            combined_pop = np.vstack([pop, offspring])
            combined_objs = np.vstack([pop_objs, offspring_objs])
            combined_fronts = self._fast_non_dominated_sort(combined_objs)
            combined_cd = self._compute_crowding_distance(combined_objs, combined_fronts)

            new_pop = []
            for front in combined_fronts:
                if len(new_pop) + len(front) <= population_size:
                    new_pop.extend(front)
                else:
                    needed = population_size - len(new_pop)
                    front_cd = [combined_cd[i] for i in front]
                    sorted_front = [front[i] for i in np.argsort(front_cd)[::-1]]
                    new_pop.extend(sorted_front[:needed])
                    break

            pop = combined_pop[new_pop]
            pop_objs = combined_objs[new_pop]

        # Select Knee-point / Best Compromise from Rank-1 Pareto Front
        rank1 = self._fast_non_dominated_sort(pop_objs)[0]
        rank1_pop = pop[rank1]
        rank1_objs = pop_objs[rank1]

        # Compromise solution (highest Sharpe / knee point)
        best_idx = 0
        best_ratio = -1e9
        for i, w in enumerate(rank1_pop):
            ret = float(w @ self.mu)
            cvar = rank1_objs[i, 1]
            ratio = (ret - self.rf) / max(cvar, 0.05)
            if ratio > best_ratio:
                best_ratio = ratio
                best_idx = i

        chosen_w = self._clean_and_normalize_weights(rank1_pop[best_idx])
        res = self._format_result("NSGA-II Multi-Objective", chosen_w)
        res["pareto_frontier_count"] = len(rank1)
        res["meta"] = {
            "algorithm": "NSGA-II",
            "pareto_solutions_found": len(rank1),
            "objectives_optimized": ["Expected Return", "CVaR 95%", "Turnover", "Diversification (1-HHI)"],
            "compromise_cvar": round(float(rank1_objs[best_idx, 1]), 4),
            "compromise_turnover": round(float(rank1_objs[best_idx, 2]), 4),
            "diversification_index": round(1.0 - float(rank1_objs[best_idx, 3]), 4)
        }
        return res

    def optimize_moead(
        self,
        population_size: int = 40,
        generations: int = 30,
        neighborhood_size: int = 8
    ) -> Dict[str, Any]:
        """
        4. MOEA/D — Decomposition-Based Portfolio Optimization
        Decomposes multi-objective problem into scalar subproblems using Tchebycheff aggregation.
        """
        effective_max = max(self.max_weight, 1.0 / self.num_assets)
        N = self.num_assets
        M = 4  # 4 objectives

        # Generate uniform weight vectors for subproblems
        np.random.seed(321)
        weights_sub = np.random.dirichlet(np.ones(M), size=population_size)

        # Compute Euclidean distance between subproblem weight vectors to find neighbors
        dist_mat = squareform(pdist(weights_sub))
        neighborhoods = np.argsort(dist_mat, axis=1)[:, :neighborhood_size]

        # Population
        pop = np.random.uniform(0.01, effective_max, size=(population_size, N))
        pop = pop / np.sum(pop, axis=1, keepdims=True)
        objs = np.array([self._eval_multi_objectives(ind) for ind in pop])

        # Ideal reference point z*
        z_star = np.min(objs, axis=0)

        # Evolution loop
        for gen in range(generations):
            for i in range(population_size):
                # Select parents from neighborhood
                p1_idx, p2_idx = np.random.choice(neighborhoods[i], 2, replace=False)
                child = 0.5 * (pop[p1_idx] + pop[p2_idx])
                if np.random.rand() < 0.2:
                    child += np.random.normal(0, 0.04, size=N)
                    child = np.clip(child, 0.0, effective_max)
                child = child / np.sum(child)

                child_obj = np.array(self._eval_multi_objectives(child))
                z_star = np.minimum(z_star, child_obj)

                # Update neighbors using Tchebycheff scalarizing function
                for j in neighborhoods[i]:
                    lambda_j = weights_sub[j]
                    current_tch = np.max(lambda_j * np.abs(objs[j] - z_star))
                    child_tch = np.max(lambda_j * np.abs(child_obj - z_star))
                    if child_tch < current_tch:
                        pop[j] = child
                        objs[j] = child_obj

        # Pick best compromise
        best_idx = np.argmax([(ind @ self.mu - self.rf) / np.sqrt(max(ind @ self.cov @ ind, 1e-8)) for ind in pop])
        chosen_w = self._clean_and_normalize_weights(pop[best_idx])
        res = self._format_result("MOEA/D (Decomposition-Based)", chosen_w)
        res["meta"] = {
            "algorithm": "MOEA/D",
            "subproblems": population_size,
            "neighborhood_size": neighborhood_size,
            "scalarization": "Tchebycheff"
        }
        return res

    def optimize_spea2(
        self,
        population_size: int = 40,
        archive_size: int = 20,
        generations: int = 30
    ) -> Dict[str, Any]:
        """
        5. SPEA2 — Strength Pareto Evolutionary Optimization
        Pareto dominance, fine-grained strength assignment, and k-NN density estimation.
        """
        effective_max = max(self.max_weight, 1.0 / self.num_assets)
        N = self.num_assets

        np.random.seed(555)
        pop = np.random.uniform(0.01, effective_max, size=(population_size, N))
        pop = pop / np.sum(pop, axis=1, keepdims=True)
        archive = pop[:archive_size].copy()

        for gen in range(generations):
            # Combined population
            combined = np.vstack([pop, archive])
            comb_objs = np.array([self._eval_multi_objectives(ind) for ind in combined])
            M_total = len(combined)

            # Strength: number of individuals i dominates
            strength = np.zeros(M_total)
            for i in range(M_total):
                for j in range(M_total):
                    if i != j and np.all(comb_objs[i] <= comb_objs[j]) and np.any(comb_objs[i] < comb_objs[j]):
                        strength[i] += 1

            # Raw fitness R(i) = sum of strengths of individuals dominating i
            raw_fitness = np.zeros(M_total)
            for i in range(M_total):
                for j in range(M_total):
                    if i != j and np.all(comb_objs[j] <= comb_objs[i]) and np.any(comb_objs[j] < comb_objs[i]):
                        raw_fitness[i] += strength[j]

            # Density D(i) via k-th nearest neighbor
            k_nn = int(np.sqrt(M_total))
            dist_obj = squareform(pdist(comb_objs))
            sorted_dist = np.sort(dist_obj, axis=1)
            sigma_k = sorted_dist[:, k_nn]
            density = 1.0 / (sigma_k + 2.0)

            total_fitness = raw_fitness + density

            # Update archive with non-dominated individuals (raw fitness < 1)
            archive_idx = np.argsort(total_fitness)[:archive_size]
            archive = combined[archive_idx]

            # Create new population from archive
            new_pop = []
            while len(new_pop) < population_size:
                idx1, idx2 = np.random.choice(archive_size, 2, replace=False)
                p1, p2 = archive[idx1], archive[idx2]
                child = 0.5 * (p1 + p2)
                if np.random.rand() < 0.2:
                    child += np.random.normal(0, 0.04, size=N)
                    child = np.clip(child, 0.0, effective_max)
                child = child / np.sum(child)
                new_pop.append(child)
            pop = np.array(new_pop)

        # Select best compromise from archive
        best_idx = np.argmax([(ind @ self.mu - self.rf) / np.sqrt(max(ind @ self.cov @ ind, 1e-8)) for ind in archive])
        chosen_w = self._clean_and_normalize_weights(archive[best_idx])
        res = self._format_result("SPEA2 (Strength Pareto)", chosen_w)
        res["meta"] = {
            "algorithm": "SPEA2",
            "archive_size": archive_size,
            "density_estimator": "k-NN"
        }
        return res

    def optimize_mopso(
        self,
        swarm_size: int = 40,
        iterations: int = 30,
        archive_size: int = 25
    ) -> Dict[str, Any]:
        """
        6. MOPSO — Multi-Objective Particle Swarm Optimization
        Swarm intelligence exploring Pareto archive across Return, CVaR, Turnover, Diversification.
        """
        effective_max = max(self.max_weight, 1.0 / self.num_assets)
        N = self.num_assets

        np.random.seed(777)
        positions = np.random.uniform(0.01, effective_max, size=(swarm_size, N))
        positions = positions / np.sum(positions, axis=1, keepdims=True)
        velocities = np.zeros((swarm_size, N))

        p_best = positions.copy()
        p_best_objs = np.array([self._eval_multi_objectives(ind) for ind in p_best])

        # Pareto Archive
        archive = [p_best[0]]
        archive_objs = [p_best_objs[0]]

        w_inertia = 0.5
        c1, c2 = 1.4, 1.4

        for it in range(iterations):
            for i in range(swarm_size):
                # Leader selection from archive
                leader = archive[np.random.choice(len(archive))]

                # Velocity update
                r1, r2 = np.random.rand(N), np.random.rand(N)
                velocities[i] = (
                    w_inertia * velocities[i]
                    + c1 * r1 * (p_best[i] - positions[i])
                    + c2 * r2 * (leader - positions[i])
                )

                # Position update
                positions[i] = positions[i] + velocities[i]
                positions[i] = np.clip(positions[i], 0.0, effective_max)
                s = np.sum(positions[i])
                positions[i] = positions[i] / s if s > 1e-6 else np.ones(N) / N

                # Evaluate
                curr_obj = np.array(self._eval_multi_objectives(positions[i]))

                # Personal best update
                if np.all(curr_obj <= p_best_objs[i]) and np.any(curr_obj < p_best_objs[i]):
                    p_best[i] = positions[i].copy()
                    p_best_objs[i] = curr_obj

                # Archive update
                is_dominated = False
                for a_obj in archive_objs:
                    if np.all(a_obj <= curr_obj) and np.any(a_obj < curr_obj):
                        is_dominated = True
                        break
                if not is_dominated:
                    # Remove any archive items dominated by new solution
                    kept_arch = []
                    kept_objs = []
                    for idx, a_obj in enumerate(archive_objs):
                        if not (np.all(curr_obj <= a_obj) and np.any(curr_obj < a_obj)):
                            kept_arch.append(archive[idx])
                            kept_objs.append(a_obj)
                    kept_arch.append(positions[i].copy())
                    kept_objs.append(curr_obj)
                    if len(kept_arch) > archive_size:
                        kept_arch = kept_arch[:archive_size]
                        kept_objs = kept_objs[:archive_size]
                    archive = kept_arch
                    archive_objs = kept_objs

        # Select best compromise from archive
        best_idx = np.argmax([(ind @ self.mu - self.rf) / np.sqrt(max(ind @ self.cov @ ind, 1e-8)) for ind in archive])
        chosen_w = self._clean_and_normalize_weights(archive[best_idx])
        res = self._format_result("MOPSO (Particle Swarm)", chosen_w)
        res["meta"] = {
            "algorithm": "MOPSO",
            "swarm_size": swarm_size,
            "archive_size": len(archive),
            "iterations": iterations
        }
        return res

    def compute_pareto_frontier_points(self, num_points: int = 30) -> List[Dict[str, Any]]:
        """
        Extract high-resolution Pareto Frontier points spanning Return vs CVaR vs Turnover vs Diversification.
        """
        # Run NSGA-II sampling
        nsga = self.optimize_nsga2(population_size=num_points * 2, generations=25)
        w_prior = np.ones(self.num_assets) / self.num_assets

        # Sample across range
        points = []
        # Target returns from min variance to max expected return
        min_var = self.optimize_minimum_variance()
        max_sharpe = self.optimize_maximum_sharpe()
        min_ret = min_var["expected_annual_return"]
        max_ret = max_sharpe["expected_annual_return"] * 1.15

        target_rets = np.linspace(min_ret, max_ret, num_points)
        effective_max = max(self.max_weight, 1.0 / self.num_assets)

        for tr in target_rets:
            def obj(w):
                return float(w @ self.cov @ w)
            bnds = [(0.0, effective_max) for _ in range(self.num_assets)]
            cons = [
                {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0},
                {'type': 'eq', 'fun': lambda w: float(w @ self.mu) - tr}
            ]
            w0 = np.ones(self.num_assets) / self.num_assets
            r = minimize(obj, w0, method='SLSQP', bounds=bnds, constraints=cons)
            if r.success:
                w_opt = self._clean_and_normalize_weights(r.x)
                f1, f2, f3, f4 = self._eval_multi_objectives(w_opt, w_prior)
                vol = np.sqrt(float(w_opt @ self.cov @ w_opt))
                points.append({
                    "return": round(float(w_opt @ self.mu), 4),
                    "volatility": round(float(vol), 4),
                    "cvar_95": round(float(f2), 4),
                    "turnover": round(float(f3), 4),
                    "diversification_hhi": round(1.0 - float(f4), 4),
                    "sharpe_ratio": round((float(w_opt @ self.mu) - self.rf) / max(vol, 1e-4), 4),
                    "weights": {self.symbols[i]: round(float(w_opt[i]), 4) for i in range(self.num_assets)}
                })

        return points

    # -------------------------------------------------------------------------
    # Helper & Dispatch Methods
    # -------------------------------------------------------------------------

    def _fast_non_dominated_sort(self, objs: np.ndarray) -> List[List[int]]:
        """Fast non-dominated sorting algorithm for NSGA-II"""
        N = len(objs)
        domination_counts = np.zeros(N, dtype=int)
        dominated_indices = [[] for _ in range(N)]
        fronts = [[]]

        for p in range(N):
            for q in range(N):
                if p == q:
                    continue
                # Minimize all objectives
                if np.all(objs[p] <= objs[q]) and np.any(objs[p] < objs[q]):
                    dominated_indices[p].append(q)
                elif np.all(objs[q] <= objs[p]) and np.any(objs[q] < objs[p]):
                    domination_counts[p] += 1

            if domination_counts[p] == 0:
                fronts[0].append(p)

        i = 0
        while len(fronts[i]) > 0:
            next_front = []
            for p in fronts[i]:
                for q in dominated_indices[p]:
                    domination_counts[q] -= 1
                    if domination_counts[q] == 0:
                        next_front.append(q)
            i += 1
            fronts.append(next_front)

        return [f for f in fronts if len(f) > 0]

    def _compute_crowding_distance(self, objs: np.ndarray, fronts: List[List[int]]) -> np.ndarray:
        N, M = objs.shape
        crowding = np.zeros(N)

        for front in fronts:
            if len(front) == 0:
                continue
            if len(front) <= 2:
                for idx in front:
                    crowding[idx] = 1e6
                continue

            for m in range(M):
                obj_vals = objs[front, m]
                sorted_idx = np.argsort(obj_vals)
                front_sorted = [front[i] for i in sorted_idx]

                crowding[front_sorted[0]] = 1e6
                crowding[front_sorted[-1]] = 1e6

                val_range = obj_vals[sorted_idx[-1]] - obj_vals[sorted_idx[0]]
                if val_range > 1e-8:
                    for i in range(1, len(front) - 1):
                        diff = obj_vals[sorted_idx[i + 1]] - obj_vals[sorted_idx[i - 1]]
                        crowding[front_sorted[i]] += diff / val_range

        return crowding

    def _tournament_select(self, fronts: List[List[int]], cd: np.ndarray, pop_size: int) -> int:
        i1, i2 = np.random.choice(pop_size, 2, replace=False)
        # Find which front each belongs to
        rank1, rank2 = 1e6, 1e6
        for r, f in enumerate(fronts):
            if i1 in f:
                rank1 = r
            if i2 in f:
                rank2 = r
        if rank1 < rank2:
            return i1
        elif rank2 < rank1:
            return i2
        else:
            return i1 if cd[i1] >= cd[i2] else i2

    def _clean_and_normalize_weights(self, weights: np.ndarray) -> np.ndarray:
        """Ensure no NaNs, negative values, and sum exactly equals 1.0"""
        w = np.nan_to_num(weights, nan=0.0)
        w = np.maximum(w, 0.0)
        total = np.sum(w)
        if total > 1e-7:
            w = w / total
        else:
            w = np.ones(self.num_assets) / self.num_assets
        return w

    def _format_result(self, name: str, weights: np.ndarray) -> Dict[str, Any]:
        """Compute portfolio expected return, volatility, Sharpe ratio, and risk contributions"""
        port_return = float(weights @ self.mu)
        port_variance = float(weights @ self.cov @ weights)
        port_vol = float(np.sqrt(max(port_variance, 1e-8)))
        sharpe = float((port_return - self.rf) / port_vol) if port_vol > 1e-8 else 0.0

        marginal_risk = (self.cov @ weights) / port_vol if port_vol > 1e-8 else np.zeros(self.num_assets)
        risk_contributions = weights * marginal_risk
        pct_risk_contributions = risk_contributions / port_vol if port_vol > 1e-8 else np.zeros(self.num_assets)

        weights_dict = {self.symbols[i]: round(float(weights[i]), 5) for i in range(self.num_assets)}
        risk_contrib_dict = {
            self.symbols[i]: round(float(pct_risk_contributions[i]), 5) for i in range(self.num_assets)
        }

        return {
            "optimizer": name,
            "weights": weights_dict,
            "expected_annual_return": round(port_return, 4),
            "annual_volatility": round(port_vol, 4),
            "sharpe_ratio": round(sharpe, 4),
            "risk_contributions": risk_contrib_dict
        }

    @classmethod
    def run_optimizer(
        cls,
        name: str,
        returns: pd.DataFrame,
        covariance: np.ndarray,
        rf: float = settings.DEFAULT_RISK_FREE_RATE,
        max_asset_weight: float = settings.DEFAULT_MAX_ASSET_WEIGHT,
        views: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """Unified dispatch for all 12 quantitative and evolutionary optimizers"""
        opt = cls(returns=returns, covariance=covariance, rf=rf, max_asset_weight=max_asset_weight)
        key = name.lower().replace("-", "_").replace(" ", "_")

        # Default Strategy: RMT Trend Momentum
        if key in ["rmt_momentum", "default", "rmt", "kinetic_rmt"]:
            return opt.optimize_rmt_momentum()
        elif key in ["min_variance", "minimum_variance", "min_var"]:
            return opt.optimize_minimum_variance()
        elif key in ["max_sharpe", "maximum_sharpe", "tangency"]:
            return opt.optimize_maximum_sharpe()
        elif key in ["risk_parity", "equal_risk_contribution", "erc"]:
            return opt.optimize_risk_parity()
        elif key in ["hrp", "hierarchical_risk_parity", "hierarchical"]:
            return opt.optimize_hierarchical_risk_parity()
        elif key in ["black_litterman", "bl"]:
            return opt.optimize_black_litterman(views=views)
        elif key in ["cvar", "expected_shortfall"]:
            return opt.optimize_cvar()

        # Advanced Multi-Objective & Evolutionary Algorithms
        elif key in ["genetic_algorithm", "ga", "evolutionary"]:
            return opt.optimize_genetic_algorithm()
        elif key in ["entropy_pooling", "meucci", "view_conditioned"]:
            return opt.optimize_entropy_pooling(scenario_views=views)
        elif key in ["nsga2", "nsga_ii", "multi_objective"]:
            return opt.optimize_nsga2()
        elif key in ["moead", "moea_d", "decomposition"]:
            return opt.optimize_moead()
        elif key in ["spea2", "strength_pareto"]:
            return opt.optimize_spea2()
        elif key in ["mopso", "particle_swarm", "swarm"]:
            return opt.optimize_mopso()
        else:
            return opt.optimize_maximum_sharpe()
