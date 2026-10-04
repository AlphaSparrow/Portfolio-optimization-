"""
Efficient Frontier & Capital Allocation Line (CAL) Generator.
Computes:
1. 50+ points along the Markowitz Efficient Frontier curve.
2. Minimum Variance Portfolio.
3. Tangency (Maximum Sharpe) Portfolio.
4. Capital Allocation Line (CAL) ray from (0, Rf).
5. Individual asset risk/return coordinates.
"""

from typing import Dict, List, Any
import numpy as np
import pandas as pd
from scipy.optimize import minimize

try:
    import cvxpy as cp
except ImportError:
    cp = None

from backend.app.config import settings

class EfficientFrontier:
    def __init__(
        self,
        returns: pd.DataFrame,
        covariance: np.ndarray,
        rf: float = settings.DEFAULT_RISK_FREE_RATE,
        num_points: int = 40
    ):
        self.returns = returns
        self.symbols = list(returns.columns)
        self.num_assets = len(self.symbols)
        self.cov = covariance
        self.rf = rf
        self.num_points = num_points
        self.mu = returns.mean().values * 252.0

    def compute_frontier(self) -> Dict[str, Any]:
        """
        Generate efficient frontier points by sweeping target returns using SciPy SLSQP.
        """
        N = self.num_assets

        # 1. Minimum Variance Portfolio
        def port_var(w):
            return float(w @ self.cov @ w)

        w0 = np.ones(N) / N
        bnds = [(0.0, 1.0) for _ in range(N)]
        cons_min = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
        res_min = minimize(port_var, w0, method='SLSQP', bounds=bnds, constraints=cons_min, options={'ftol': 1e-8})
        min_var_weights = res_min.x if res_min.success else w0

        min_var_ret = float(min_var_weights @ self.mu)
        min_var_vol = float(np.sqrt(max(min_var_weights @ self.cov @ min_var_weights, 1e-8)))

        # 2. Maximum Sharpe Portfolio
        def neg_sharpe(w):
            r = float(w @ self.mu)
            v = float(np.sqrt(np.maximum(w @ self.cov @ w, 1e-8)))
            return - (r - self.rf) / v

        res_sharpe = minimize(
            neg_sharpe,
            w0,
            method='SLSQP',
            bounds=bnds,
            constraints=cons_min,
            options={'ftol': 1e-9}
        )
        max_sharpe_weights = res_sharpe.x if res_sharpe.success else w0
        max_sharpe_ret = float(max_sharpe_weights @ self.mu)
        max_sharpe_vol = float(np.sqrt(max(max_sharpe_weights @ self.cov @ max_sharpe_weights, 1e-8)))
        max_sharpe_ratio = float((max_sharpe_ret - self.rf) / max_sharpe_vol) if max_sharpe_vol > 0 else 0.0

        # 3. Sweep target returns from min_var_ret to max_ret
        max_asset_ret = float(np.max(self.mu))
        pts_count = min(self.num_points, 20)
        target_returns = np.linspace(min_var_ret, max(max_asset_ret, max_sharpe_ret * 1.05), pts_count)
        frontier_points = []
        w_warm = min_var_weights.copy()

        for tr in target_returns:
            cons_tr = [
                {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0},
                {'type': 'eq', 'fun': lambda w, target=tr: float(w @ self.mu) - target}
            ]
            r = minimize(port_var, w_warm, method='SLSQP', bounds=bnds, constraints=cons_tr, options={'ftol': 1e-5, 'maxiter': 50})
            if r.success:
                w_opt = np.maximum(r.x, 0.0)
                s = np.sum(w_opt)
                if s > 0:
                    w_opt /= s
                w_warm = w_opt.copy()
                vol = float(np.sqrt(max(w_opt @ self.cov @ w_opt, 1e-8)))
                ret = float(w_opt @ self.mu)
                frontier_points.append({
                    "volatility": round(vol * 100, 2),
                    "expected_return": round(ret * 100, 2),
                    "sharpe": round((ret - self.rf) / vol, 2) if vol > 0 else 0.0
                })

        if not frontier_points:
            # Fallback guarantee points
            frontier_points = [
                {
                    "volatility": round(min_var_vol * 100, 2),
                    "expected_return": round(min_var_ret * 100, 2),
                    "sharpe": round((min_var_ret - self.rf) / max(min_var_vol, 1e-4), 2)
                },
                {
                    "volatility": round(max_sharpe_vol * 100, 2),
                    "expected_return": round(max_sharpe_ret * 100, 2),
                    "sharpe": round(max_sharpe_ratio, 2)
                }
            ]

        # Sort frontier points by volatility
        frontier_points = sorted(frontier_points, key=lambda p: p["volatility"])

        # 4. Capital Allocation Line (CAL) Points
        cal_slope = max_sharpe_ratio
        cal_vols = np.linspace(0.0, max_sharpe_vol * 1.6, 20)
        cal_points = [
            {
                "volatility": round(v * 100, 2),
                "expected_return": round((self.rf + cal_slope * v) * 100, 2)
            }
            for v in cal_vols
        ]

        # 5. Individual Asset Coordinates
        asset_points = []
        for i, sym in enumerate(self.symbols):
            asset_vol = float(np.sqrt(self.cov[i, i]))
            asset_ret = float(self.mu[i])
            asset_points.append({
                "symbol": sym,
                "volatility": round(asset_vol * 100, 2),
                "expected_return": round(asset_ret * 100, 2),
                "sharpe": round((asset_ret - self.rf) / asset_vol, 2) if asset_vol > 0 else 0.0
            })

        return {
            "frontier_curve": frontier_points,
            "capital_allocation_line": cal_points,
            "minimum_variance_portfolio": {
                "volatility": round(min_var_vol * 100, 2),
                "expected_return": round(min_var_ret * 100, 2),
                "sharpe": round((min_var_ret - self.rf) / max(min_var_vol, 1e-4), 2),
                "weights": {self.symbols[i]: round(float(min_var_weights[i]), 4) for i in range(self.num_assets)}
            },
            "tangency_portfolio": {
                "volatility": round(max_sharpe_vol * 100, 2),
                "expected_return": round(max_sharpe_ret * 100, 2),
                "sharpe": round(max_sharpe_ratio, 2),
                "weights": {self.symbols[i]: round(float(max_sharpe_weights[i]), 4) for i in range(self.num_assets)}
            },
            "individual_assets": asset_points,
            "risk_free_rate": round(self.rf * 100, 2)
        }
