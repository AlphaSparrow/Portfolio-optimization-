"""
Python Strategy Code Execution Engine.
Safely executes user-defined portfolio optimization algorithms and custom alpha signals,
calculating risk/return metrics, sector distributions, and deployable target weights.
"""

import sys
import io
import traceback
import logging
from typing import Dict, List, Any, Optional
import numpy as np
import pandas as pd
import scipy
from scipy.optimize import minimize

from backend.app.config import settings
from backend.app.data.instruments import SECTOR_MAP
from backend.app.portfolio.risk import RiskManager

logger = logging.getLogger(__name__)

DEFAULT_PYTHON_STRATEGY_TEMPLATE = '''def generate_weights(prices_df, returns_df):
    """
    Kinetic RMT Momentum & Trend Acceleration Strategy.
    200 SMA + 20 EMA 2nd derivative signal matrix, Top 10 momentum assets,
    Random Matrix Theory (RMT) Marchenko-Pastur covariance denoising,
    and mean-variance utility optimization.
    """
    import numpy as np
    import pandas as pd
    from scipy.optimize import minimize

    # 1. Kinetic Trend Acceleration Signals
    sma200 = prices_df.rolling(window=min(200, len(prices_df))).mean()
    trend_line = prices_df.ewm(span=20, adjust=False).mean()
    dy_dx = trend_line.diff()
    d2y_dx2 = dy_dx.diff()

    # 126-day structural momentum
    lookback = min(126, len(prices_df) - 1)
    structural_momentum = prices_df.pct_change(lookback)

    signal_matrix = (prices_df > sma200) & (dy_dx > 0) & (d2y_dx2 > 0)
    latest_signals = signal_matrix.iloc[-1]
    qualified_assets = latest_signals[latest_signals].index.tolist()

    if not qualified_assets:
        qualified_assets = prices_df.columns.tolist()

    asset_ranks = structural_momentum.iloc[-1].loc[qualified_assets].dropna()
    top_targets = asset_ranks.nlargest(10).index.tolist()

    # 2. RMT Denoised Covariance for Top Assets
    hist_returns = returns_df.iloc[-lookback:][top_targets].dropna(axis=1)
    valid_targets = hist_returns.columns.tolist()
    N = len(valid_targets)
    T = len(hist_returns)

    if N <= 1 or T <= N:
        return {col: 1.0 / len(prices_df.columns) for col in prices_df.columns}

    cov_sample = hist_returns.cov().values * 252.0
    std_devs = np.sqrt(np.diag(cov_sample))
    std_devs = np.where(std_devs == 0, 1e-8, std_devs)
    corr_sample = cov_sample / np.outer(std_devs, std_devs)

    eigenvalues, eigenvectors = np.linalg.eigh(corr_sample)
    lambda_plus = (1.0 + np.sqrt(N / T)) ** 2
    noise_eigenvals = eigenvalues[eigenvalues < lambda_plus]
    mean_noise = float(np.mean(noise_eigenvals)) if len(noise_eigenvals) > 0 else 1.0
    denoised_eigenvals = np.where(eigenvalues < lambda_plus, mean_noise, eigenvalues)

    denoised_corr = eigenvectors @ np.diag(denoised_eigenvals) @ eigenvectors.T
    np.fill_diagonal(denoised_corr, 1.0)
    cov_rmt = np.diag(std_devs) @ denoised_corr @ np.diag(std_devs)

    # 3. Utility Optimization with Bounds [0.04, 0.16]
    ranks = asset_ranks.loc[valid_targets].rank().values
    mu = 0.10 + 0.02 * ranks

    def mv_utility(w):
        return - (np.dot(w, mu) - 0.75 * np.dot(w.T, np.dot(cov_rmt, w)))

    cons = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
    bnds = tuple((0.04, 0.16) for _ in range(N))
    init_w = np.ones(N) / N

    res = minimize(mv_utility, init_w, method='SLSQP', bounds=bnds, constraints=cons)
    opt_w = res.x if res.success else init_w

    weights = {sym: float(opt_w[i]) for i, sym in enumerate(valid_targets)}
    return weights
'''

def execute_user_strategy_code(
    code_str: str,
    prices_df: pd.DataFrame,
    returns_df: pd.DataFrame,
    cash_buffer: float = 0.02
) -> Dict[str, Any]:
    """
    Executes user strategy Python code within an isolated scope and evaluates portfolio metrics.
    """
    output_buffer = io.StringIO()
    logs: List[str] = []

    def safe_print(*args, **kwargs):
        msg = " ".join(str(a) for a in args)
        logs.append(msg)

    ALLOWED_MODULES = {
        "numpy", "np", "pandas", "pd", "scipy", "math", "datetime",
        "collections", "itertools", "scipy.optimize", "warnings"
    }

    def safe_import(name, *args, **kwargs):
        root_pkg = name.split(".")[0]
        if root_pkg in ALLOWED_MODULES or name in ALLOWED_MODULES:
            return __import__(name, *args, **kwargs)
        raise ImportError(f"Security: Import of module '{name}' is restricted in quantitative sandbox.")

    # Isolated execution environment
    exec_globals = {
        "__builtins__": {
            "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
            "enumerate": enumerate, "float": float, "int": int, "len": len,
            "list": list, "max": max, "min": min, "range": range, "round": round,
            "set": set, "str": str, "sum": sum, "tuple": tuple, "zip": zip,
            "print": safe_print, "isinstance": isinstance, "Exception": Exception,
            "ValueError": ValueError, "TypeError": TypeError, "__import__": safe_import
        },
        "np": np,
        "pd": pd,
        "scipy": scipy,
        "minimize": minimize,
        "prices_df": prices_df,
        "prices": prices_df,
        "returns_df": returns_df,
        "returns": returns_df,
        "symbols": list(prices_df.columns)
    }

    raw_weights = None

    try:
        # Check for disallowed dangerous keywords
        for forbidden in ["import os", "import sys", "subprocess", "open(", "eval(", "exec(", "shutil"]:
            if forbidden in code_str:
                raise ValueError(f"Security Policy: Use of '{forbidden}' is restricted in quantitative strategy scripts.")

        compiled_code = compile(code_str, "<custom_strategy>", "exec")
        exec(compiled_code, exec_globals)

        # Check if generate_weights function is defined
        if "generate_weights" in exec_globals and callable(exec_globals["generate_weights"]):
            fn = exec_globals["generate_weights"]
            try:
                raw_weights = fn(prices_df, returns_df)
            except TypeError:
                raw_weights = fn(prices_df)
        elif "weights" in exec_globals:
            raw_weights = exec_globals["weights"]
        elif "target_weights" in exec_globals:
            raw_weights = exec_globals["target_weights"]
        else:
            raise ValueError("Your code must define a function 'generate_weights(prices_df, returns_df)' or a 'weights' dictionary.")

    except Exception as e:
        err_msg = traceback.format_exc()
        logger.error(f"Custom strategy execution error: {e}")
        return {
            "status": "ERROR",
            "error": str(e),
            "traceback": err_msg,
            "logs": logs
        }

    # Normalize weights output
    weights_dict: Dict[str, float] = {}
    if isinstance(raw_weights, dict):
        weights_dict = {str(k): float(v) for k, v in raw_weights.items() if float(v) > 0.0001}
    elif isinstance(raw_weights, pd.Series):
        weights_dict = {str(k): float(v) for k, v in raw_weights.items() if float(v) > 0.0001}
    elif isinstance(raw_weights, (list, np.ndarray)):
        cols = list(prices_df.columns)
        for i, w in enumerate(raw_weights):
            if i < len(cols) and float(w) > 0.0001:
                weights_dict[cols[i]] = float(w)
    else:
        return {
            "status": "ERROR",
            "error": f"Invalid return type from strategy: expected dict or pandas Series, got {type(raw_weights).__name__}",
            "logs": logs
        }

    if not weights_dict:
        # Fallback to equal weight across qualified symbols
        weights_dict = {s: 1.0 / len(prices_df.columns) for s in prices_df.columns}

    # Normalize weights so sum of equity = 1.0 - cash_buffer
    total_w = sum(weights_dict.values())
    if total_w <= 0:
        total_w = 1.0
        weights_dict = {s: 1.0 / len(weights_dict) for s in weights_dict}

    equity_target = max(0.0, 1.0 - cash_buffer)
    normalized_weights = {s: round((w / total_w) * equity_target, 5) for s, w in weights_dict.items()}
    if cash_buffer > 0:
        normalized_weights["CASH"] = round(cash_buffer, 4)

    # Compute expected return & volatility
    selected_symbols = [s for s in normalized_weights if s != "CASH" and s in prices_df.columns]
    if len(selected_symbols) == 0:
        selected_symbols = list(prices_df.columns)

    sub_returns = returns_df[selected_symbols]
    mean_ret = sub_returns.mean().values * 252.0
    cov = sub_returns.cov().values * 252.0

    w_vec = np.array([normalized_weights.get(s, 0.0) for s in selected_symbols])
    w_sum = np.sum(w_vec)
    if w_sum > 0:
        w_norm = w_vec / w_sum
    else:
        w_norm = np.ones(len(selected_symbols)) / len(selected_symbols)

    port_ret = float(np.dot(w_norm, mean_ret))
    port_vol = float(np.sqrt(max(float(w_norm.T @ cov @ w_norm), 1e-8)))

    # For momentum strategies with positive returns, compute realistic Sharpe
    sharpe = round(port_ret / max(port_vol, 1e-4), 2) if port_vol > 0 else 0.0

    # Sector Breakdown
    sector_allocations: Dict[str, float] = {}
    for s, w in normalized_weights.items():
        if s == "CASH":
            sector_allocations["Cash Buffer"] = round(sector_allocations.get("Cash Buffer", 0.0) + w, 4)
        else:
            sec = SECTOR_MAP.get(s, "Other")
            sector_allocations[sec] = round(sector_allocations.get(sec, 0.0) + w, 4)

    return {
        "status": "SUCCESS",
        "strategy_name": "Custom Python Strategy",
        "weights": normalized_weights,
        "constrained_weights": normalized_weights,
        "expected_annual_return": round(port_ret, 4),
        "annual_volatility": round(port_vol, 4),
        "sharpe_ratio": sharpe,
        "holdings_count": len([s for s in normalized_weights if s != "CASH" and normalized_weights[s] > 0.001]),
        "sector_allocations": sector_allocations,
        "logs": logs
    }
