"""
Quantitative Strategies for Paper Trading & Backtesting.
Includes:
1. RMTMomentumStrategy (Kinetic 200 SMA + 20 EMA 2nd-Derivative + RMT Marchenko-Pastur Denoising - DEFAULT)
2. Cross-Sectional Momentum Strategy (Top Quintile Momentum)
3. Dual Moving Average Trend Strategy (Fast/Slow SMA Crossover)
4. Mean Reversion RSI Strategy (Oversold Blue-Chip Rebound)
5. UserStrategyTemplate (Plug-and-play custom user code template)
"""

from typing import Dict, List, Optional, Any
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from backend.app.strategies.base import BaseStrategy

class RMTMomentumStrategy(BaseStrategy):
    """
    Default Kinetic RMT Momentum & Acceleration Strategy.
    
    1. Trend & Acceleration Filter:
       - Price > 200 SMA
       - 20 EMA 1st derivative dy/dx > 0 (Positive velocity)
       - 20 EMA 2nd derivative d2y/dx2 > 0 (Positive acceleration)
    2. Structural Momentum:
       - 126-day price percentage change (6-month momentum)
       - Selects top 10 qualified assets
    3. Random Matrix Theory (RMT) Denoised Covariance:
       - Computes 126-day sample covariance and correlation
       - Marchenko-Pastur threshold: lambda_plus = (1 + sqrt(N/T))^2
       - Denoises noise eigenvalues below threshold with mean noise level
       - Reconstructs cleaned correlation and covariance matrix
    4. Mean-Variance Utility Optimization:
       - Momentum-conditioned returns: mu = 0.10 + 0.02 * rank
       - Maximize: w.T @ mu - 0.5 * 1.5 * w.T @ cov_rmt @ w
       - Constraints: Sum(w) = 1, Bounds: [0.04, 0.16] per asset
    5. Execution & Risk:
       - 10-day rebalance cycle
       - 15% trailing stop-loss from entry
    """
    id = "rmt_momentum_default"
    name = "RMT Trend Momentum (Default)"
    description = "Kinetic 200-SMA + 20-EMA 2nd-derivative trend acceleration, RMT Marchenko-Pastur spectral cleaning & utility optimization."
    category = "Kinetic Momentum & RMT"

    def __init__(
        self,
        lookback_sma: int = 200,
        span_ema: int = 20,
        momentum_window: int = 126,
        top_k: int = 10,
        risk_aversion: float = 1.5,
        min_weight: float = 0.04,
        max_weight: float = 0.16,
        stop_loss_pct: float = 0.15
    ):
        self.lookback_sma = lookback_sma
        self.span_ema = span_ema
        self.momentum_window = momentum_window
        self.top_k = top_k
        self.risk_aversion = risk_aversion
        self.min_weight = min_weight
        self.max_weight = max_weight
        self.stop_loss_pct = stop_loss_pct

    def generate_weights(
        self,
        prices: pd.DataFrame,
        current_positions: Optional[Dict[str, float]] = None,
        cash_buffer: float = 0.02,
        **kwargs
    ) -> Dict[str, float]:
        T, N = prices.shape
        if T < 20:
            return self.clean_and_normalize({c: 1.0 / N for c in prices.columns}, cash_buffer)

        # 1. Technical filters
        sma_window = min(self.lookback_sma, max(10, T - 5))
        sma_series = prices.rolling(window=sma_window).mean()
        trend_line = prices.ewm(span=min(self.span_ema, max(5, T // 2)), adjust=False).mean()
        dy_dx = trend_line.diff()
        d2y_dx2 = dy_dx.diff()

        mom_win = min(self.momentum_window, max(10, T - 5))
        structural_momentum = prices.pct_change(mom_win)

        # Kinetic acceleration condition
        signal_matrix = (prices > sma_series) & (dy_dx > 0) & (d2y_dx2 > 0)
        latest_signals = signal_matrix.iloc[-1]
        qualified_assets = latest_signals[latest_signals].index.tolist()

        if len(qualified_assets) == 0:
            # Fallback to broad momentum if strict acceleration filter filters all
            qualified_assets = prices.columns.tolist()

        # Rank by structural momentum
        latest_mom = structural_momentum.iloc[-1].loc[qualified_assets].dropna()
        if len(latest_mom) == 0:
            latest_mom = prices.pct_change(min(20, T - 1)).iloc[-1].loc[qualified_assets].dropna()

        top_targets = latest_mom.nlargest(min(self.top_k, len(latest_mom))).index.tolist()

        returns = prices.pct_change().dropna()
        hist_returns = returns.tail(min(self.momentum_window, len(returns)))
        valid_targets = [t for t in top_targets if t in hist_returns.columns]

        if len(valid_targets) < 2 or hist_returns.shape[0] < 10:
            raw_w = {t: 1.0 / len(top_targets) for t in top_targets}
            for c in prices.columns:
                if c not in raw_w:
                    raw_w[c] = 0.0
            return self.clean_and_normalize(raw_w, cash_buffer)

        # 2. RMT Denoised Covariance
        hist_targets = hist_returns[valid_targets]
        cov_sample = hist_targets.cov().values * 252.0
        std_devs = np.sqrt(np.diag(cov_sample))
        std_devs = np.where(std_devs == 0, 1e-8, std_devs)
        corr_sample = cov_sample / np.outer(std_devs, std_devs)

        t_sub, n_sub = hist_targets.shape
        eigenvalues, eigenvectors = np.linalg.eigh(corr_sample)
        lambda_plus = (1.0 + np.sqrt(n_sub / t_sub)) ** 2

        noise_eigenvals = eigenvalues[eigenvalues < lambda_plus]
        if len(noise_eigenvals) > 0:
            mean_noise = float(np.mean(noise_eigenvals))
            denoised_eigenvalues = np.where(eigenvalues < lambda_plus, mean_noise, eigenvalues)
        else:
            denoised_eigenvalues = eigenvalues

        denoised_corr = eigenvectors @ np.diag(denoised_eigenvalues) @ eigenvectors.T
        np.fill_diagonal(denoised_corr, 1.0)
        cov_rmt = np.diag(std_devs) @ denoised_corr @ np.diag(std_devs)

        # 3. Momentum-Conditioned Expected Returns
        ranks = latest_mom.loc[valid_targets].rank().values
        mu = 0.10 + 0.02 * ranks

        # 4. Mean-Variance Utility Optimization
        def mv_utility_obj(w):
            p_ret = float(np.dot(w, mu))
            p_vol = float(np.dot(w.T, np.dot(cov_rmt, w)))
            return - (p_ret - 0.5 * self.risk_aversion * p_vol)

        n_assets = len(valid_targets)
        min_w = self.min_weight
        max_w = self.max_weight
        if min_w * n_assets > 1.0:
            min_w = 1.0 / n_assets
        if max_w * n_assets < 1.0:
            max_w = 1.0 / n_assets

        bnds = tuple((min_w, max_w) for _ in range(n_assets))
        cons = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
        init_w = np.ones(n_assets) / n_assets

        res = minimize(mv_utility_obj, init_w, method='SLSQP', bounds=bnds, constraints=cons)
        if res.success:
            optimal_w = res.x
        else:
            optimal_w = init_w

        raw_weights = {valid_targets[i]: float(optimal_w[i]) for i in range(n_assets)}
        for c in prices.columns:
            if c not in raw_weights:
                raw_weights[c] = 0.0

        return self.clean_and_normalize(raw_weights, cash_buffer)


class CrossSectionalMomentumStrategy(BaseStrategy):
    id = "cross_sectional_momentum"
    name = "60-Day Cross-Sectional Momentum"
    description = "Ranks NSE assets by 60-day momentum and allocates capital to the top performing quintile."
    category = "Momentum"

    def __init__(self, lookback_period: int = 60, top_k: int = 4):
        self.lookback = lookback_period
        self.top_k = top_k

    def generate_weights(
        self,
        prices: pd.DataFrame,
        current_positions: Optional[Dict[str, float]] = None,
        cash_buffer: float = 0.02,
        **kwargs
    ) -> Dict[str, float]:
        if len(prices) < self.lookback:
            return self.clean_and_normalize({col: 1.0 / len(prices.columns) for col in prices.columns}, cash_buffer)

        start_p = prices.iloc[-self.lookback]
        end_p = prices.iloc[-1]
        momentum_scores = (end_p / start_p) - 1.0

        top_assets = momentum_scores.sort_values(ascending=False).head(self.top_k)

        raw_weights = {sym: 1.0 / self.top_k for sym in top_assets.index}
        for sym in prices.columns:
            if sym not in raw_weights:
                raw_weights[sym] = 0.0

        return self.clean_and_normalize(raw_weights, cash_buffer)


class MovingAverageTrendStrategy(BaseStrategy):
    id = "sma_trend_crossover"
    name = "Dual Moving Average Trend Following"
    description = "Allocates to stocks where 20-day SMA is above 50-day SMA with positive trend slope."
    category = "Trend Following"

    def __init__(self, fast_window: int = 20, slow_window: int = 50):
        self.fast = fast_window
        self.slow = slow_window

    def generate_weights(
        self,
        prices: pd.DataFrame,
        current_positions: Optional[Dict[str, float]] = None,
        cash_buffer: float = 0.02,
        **kwargs
    ) -> Dict[str, float]:
        if len(prices) < self.slow:
            return self.clean_and_normalize({col: 1.0 / len(prices.columns) for col in prices.columns}, cash_buffer)

        sma_fast = prices.rolling(window=self.fast).mean().iloc[-1]
        sma_slow = prices.rolling(window=self.slow).mean().iloc[-1]

        bullish_mask = sma_fast > sma_slow
        bullish_symbols = bullish_mask[bullish_mask].index.tolist()

        if len(bullish_symbols) == 0:
            return {"CASH": 1.0}

        vols = prices[bullish_symbols].pct_change().rolling(30).std().iloc[-1]
        inv_vols = 1.0 / np.maximum(vols, 1e-4)
        weights_series = inv_vols / inv_vols.sum()

        raw_weights = {s: float(weights_series[s]) for s in bullish_symbols}
        for s in prices.columns:
            if s not in raw_weights:
                raw_weights[s] = 0.0

        return self.clean_and_normalize(raw_weights, cash_buffer)


class MeanReversionRSIStrategy(BaseStrategy):
    id = "rsi_mean_reversion"
    name = "RSI 14 Mean-Reversion"
    description = "Identifies oversold blue-chip stocks (RSI < 40) positioned for statistical rebound."
    category = "Mean Reversion"

    def __init__(self, rsi_period: int = 14, oversold_threshold: float = 40.0):
        self.rsi_period = rsi_period
        self.threshold = oversold_threshold

    def _compute_rsi(self, series: pd.Series) -> float:
        delta = series.diff().dropna()
        gains = delta.clip(lower=0)
        losses = -delta.clip(upper=0)
        avg_gain = gains.tail(self.rsi_period).mean()
        avg_loss = losses.tail(self.rsi_period).mean()
        if avg_loss <= 1e-7:
            return 100.0
        rs = avg_gain / avg_loss
        return float(100.0 - (100.0 / (1.0 + rs)))

    def generate_weights(
        self,
        prices: pd.DataFrame,
        current_positions: Optional[Dict[str, float]] = None,
        cash_buffer: float = 0.02,
        **kwargs
    ) -> Dict[str, float]:
        if len(prices) < self.rsi_period + 5:
            return self.clean_and_normalize({col: 1.0 / len(prices.columns) for col in prices.columns}, cash_buffer)

        rsi_values = {}
        for col in prices.columns:
            rsi_values[col] = self._compute_rsi(prices[col])

        oversold = {sym: (self.threshold - rsi) for sym, rsi in rsi_values.items() if rsi < self.threshold}

        if not oversold:
            lowest_3 = sorted(rsi_values.items(), key=lambda x: x[1])[:3]
            raw_weights = {s[0]: 1.0 / len(lowest_3) for s in lowest_3}
        else:
            total_gap = sum(oversold.values())
            raw_weights = {sym: gap / total_gap for sym, gap in oversold.items()}

        for sym in prices.columns:
            if sym not in raw_weights:
                raw_weights[sym] = 0.0

        return self.clean_and_normalize(raw_weights, cash_buffer)


class MyCustomStrategy(RMTMomentumStrategy):
    """
    User Custom Strategy defaults to the Kinetic RMT Trend Momentum Engine.
    """
    id = "my_custom_strategy"
    name = "RMT Trend Momentum (Default)"
    description = "Kinetic 200-SMA + 20-EMA 2nd-derivative trend acceleration, RMT Marchenko-Pastur spectral cleaning & utility optimization."
    category = "Kinetic Momentum & RMT"
