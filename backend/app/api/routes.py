"""
FastAPI REST API Routes for Quantitative Portfolio Optimization & Paper Trading.
"""

import datetime
from typing import Dict, List, Optional, Any
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.models.database import get_db
from backend.app.models.schema import Order, Position
from backend.app.data.instruments import (
    NSE_INSTRUMENTS, INSTRUMENT_LOOKUP, SECTOR_MAP, PRESETS,
    get_all_symbols, get_sector_for_symbol
)
from backend.app.data.market_data import MarketDataProvider
from backend.app.portfolio.covariance import CovarianceEstimator
from backend.app.portfolio.optimizers import PortfolioOptimizer
from backend.app.portfolio.risk import RiskManager
from backend.app.execution.paper_broker import PaperBroker
from backend.app.execution.upstox_broker import UpstoxBroker
from backend.app.backtest.engine import WalkForwardEngine
from backend.app.analytics.efficient_frontier import EfficientFrontier
from backend.app.analytics.factor_model import run_factor_regression
from backend.app.analytics.attribution import PerformanceAttribution

router = APIRouter(prefix="/api")

# --- Pydantic Request Models ---

class OptimizeRequest(BaseModel):
    symbols: List[str] = Field(default_factory=lambda: PRESETS["NIFTY_TOP_10"])
    optimizer: str = "maximum_sharpe"
    covariance: str = "ledoit_wolf"
    max_asset_weight: float = 0.25
    max_sector_weight: float = 0.35
    cash_buffer: float = 0.02
    rf: float = settings.DEFAULT_RISK_FREE_RATE
    views: Optional[Dict[str, float]] = None
    start_date: str = "2021-01-01"

class BacktestRequest(BaseModel):
    symbols: List[str] = Field(default_factory=lambda: PRESETS["NIFTY_50_UNIVERSE"])
    lookback_days: int = 200
    rebalance_days: int = 10
    covariance: str = "ledoit_wolf"
    max_asset_weight: float = 0.16
    include_costs: bool = True
    start_date: str = "2019-01-01"

class RebalanceRequest(BaseModel):
    target_weights: Dict[str, float]
    optimizer_name: str = "Custom Optimizer"
    covariance_name: str = "Ledoit-Wolf"

class ManualOrderRequest(BaseModel):
    symbol: str
    order_type: str  # BUY or SELL
    shares: float

class UpstoxConfigModel(BaseModel):
    api_key: str
    api_secret: str
    redirect_uri: Optional[str] = None


# --- 1. Instruments & Universe ---

@router.get("/instruments")
def get_instruments():
    """Return all supported NSE instruments, sectors, and presets"""
    return {
        "instruments": NSE_INSTRUMENTS,
        "presets": PRESETS,
        "sectors": sorted(list(set(SECTOR_MAP.values())))
    }


# --- 2. Portfolio Optimization ---

@router.post("/optimize")
def run_optimization(req: OptimizeRequest, db: Session = Depends(get_db)):
    """Run portfolio optimization on selected tickers with risk constraints"""
    symbols = req.symbols if req.symbols else PRESETS["NIFTY_TOP_10"]
    if len(symbols) < 2:
        raise HTTPException(status_code=400, detail="At least 2 symbols required for optimization")

    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())
    
    price_df = provider.fetch_historical_prices(symbols, start_date=req.start_date)
    if price_df.empty or len(price_df) < 30:
        raise HTTPException(status_code=500, detail="Unable to retrieve adequate historical prices")

    returns_analysis = provider.compute_returns_and_risk(price_df)
    log_returns = returns_analysis["log_returns"]

    # Covariance estimation
    cov = CovarianceEstimator.estimate(log_returns, method=req.covariance)

    # Optimization
    raw_opt_result = PortfolioOptimizer.run_optimizer(
        name=req.optimizer,
        returns=log_returns,
        covariance=cov,
        rf=req.rf,
        max_asset_weight=req.max_asset_weight,
        views=req.views
    )

    # Risk manager constraints application
    risk_mgr = RiskManager(
        max_asset_weight=req.max_asset_weight,
        max_sector_weight=req.max_sector_weight,
        cash_buffer=req.cash_buffer
    )

    constrained_weights = risk_mgr.apply_risk_constraints(
        weights=raw_opt_result["weights"],
        sector_map=SECTOR_MAP,
        max_asset=req.max_asset_weight,
        max_sector=req.max_sector_weight,
        cash_buf=req.cash_buffer
    )

    # Sector weight breakdown
    sector_allocations = {}
    for s, w in constrained_weights.items():
        if s == "CASH":
            sector_allocations["Cash Buffer"] = round(sector_allocations.get("Cash Buffer", 0.0) + w, 4)
        else:
            sec = SECTOR_MAP.get(s, "Other")
            sector_allocations[sec] = round(sector_allocations.get(sec, 0.0) + w, 4)

    return {
        "optimizer": raw_opt_result["optimizer"],
        "covariance": req.covariance,
        "raw_weights": raw_opt_result["weights"],
        "constrained_weights": constrained_weights,
        "sector_allocations": sector_allocations,
        "expected_annual_return": raw_opt_result["expected_annual_return"],
        "annual_volatility": raw_opt_result["annual_volatility"],
        "sharpe_ratio": raw_opt_result["sharpe_ratio"],
        "risk_contributions": raw_opt_result["risk_contributions"],
        "betas": returns_analysis["betas"]
    }


# --- 3. Walk-Forward Backtest ---

@router.post("/backtest")
def run_backtest(req: BacktestRequest, db: Session = Depends(get_db)):
    """Run walk-forward out-of-sample multi-strategy backtest"""
    symbols = req.symbols if req.symbols else PRESETS["NIFTY_50_UNIVERSE"]
    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())

    price_df = provider.fetch_historical_prices(symbols, start_date=req.start_date)
    if price_df.empty or len(price_df) < req.lookback_days + 10:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {req.lookback_days + 10} days of data for backtesting."
        )

    engine = WalkForwardEngine(
        prices=price_df,
        lookback_days=req.lookback_days,
        rebalance_days=req.rebalance_days,
        covariance_estimator=req.covariance,
        max_asset_weight=req.max_asset_weight,
        include_costs=req.include_costs
    )

    results = engine.run_backtest()
    return results


# --- 4. Portfolio State & Paper Execution ---

@router.get("/portfolio/state")
def get_portfolio_state(db: Session = Depends(get_db)):
    """Get current paper/live portfolio valuation, cash, and holdings"""
    broker = PaperBroker(db)
    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())

    # Fetch live quotes specifically for open positions and top benchmark assets
    positions = db.query(Position).filter(Position.portfolio_id == broker.portfolio_id).all()
    held_symbols = [p.ticker for p in positions]
    quote_targets = list(set(held_symbols + ["RELIANCE.NS", "TCS.NS"]))
    
    current_prices = {}
    if quote_targets:
        quotes = provider.get_live_quotes(quote_targets)
        current_prices = {s: q["ltp"] for s, q in quotes.items()}

    # Fallback to recorded position prices if quote is missing
    for p in positions:
        if p.ticker not in current_prices or current_prices[p.ticker] <= 0:
            current_prices[p.ticker] = p.current_price or p.avg_price or 1000.0

    state = broker.get_portfolio_state(current_prices)
    
    # Recent orders
    orders = db.query(Order).order_by(Order.executed_at.desc()).limit(20).all()
    orders_list = [
        {
            "id": o.id,
            "symbol": o.ticker,
            "order_type": o.order_type,
            "shares": o.shares,
            "price": o.price,
            "fill_price": o.fill_price,
            "slippage_pct": round(o.slippage * 100, 3),
            "fees": o.fees,
            "status": o.status,
            "executed_at": o.executed_at.isoformat() if o.executed_at else None
        }
        for o in orders
    ]

    return {
        "portfolio": state,
        "recent_orders": orders_list,
        "execution_mode": upstox.get_status()["mode"],
        "benchmark_summary": broker.get_benchmark_comparison_data()
    }

@router.get("/portfolio/benchmarks")
def get_portfolio_benchmarks(db: Session = Depends(get_db)):
    """Fetch comparative multi-asset benchmark tracking against Nifty 500, Nifty 150, FD, Mutual Funds"""
    broker = PaperBroker(db)
    return broker.get_benchmark_comparison_data()

@router.get("/pareto_frontier")
def get_pareto_frontier_data(
    symbols: Optional[str] = Query(None),
    covariance: str = "ledoit_wolf",
    db: Session = Depends(get_db)
):
    """
    Compute multi-objective Pareto Frontier trade-offs:
    Expected Return vs CVaR vs Turnover vs Diversification
    """
    symbol_list = symbols.split(",") if symbols else PRESETS["NIFTY_TOP_10"]
    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())

    price_df = provider.fetch_historical_prices(symbol_list, start_date="2022-01-01")
    returns = np.log(price_df / price_df.shift(1)).dropna()
    cov = CovarianceEstimator.estimate(returns, method=covariance)

    opt = PortfolioOptimizer(returns=returns, covariance=cov)
    points = opt.compute_pareto_frontier_points(num_points=35)
    return {
        "points": points,
        "objectives": ["Expected Return", "CVaR 95%"],
        "symbols": symbol_list
    }

@router.get("/market/overview")
def get_market_overview():
    """Google Finance style live Indian market benchmark snapshot"""
    return {
        "market_status": "OPEN",
        "exchange": "National Stock Exchange of India (NSE)",
        "indices": [
            {"name": "NIFTY 50", "value": 25250.45, "change": 115.30, "change_pct": 0.46, "high": 25285.00, "low": 25110.20},
            {"name": "NIFTY 500", "value": 23890.10, "change": 142.15, "change_pct": 0.60, "high": 23920.00, "low": 23750.10},
            {"name": "NIFTY 150 MIDCAP", "value": 21340.80, "change": 188.20, "change_pct": 0.89, "high": 21380.00, "low": 21120.40},
            {"name": "INDIA VIX", "value": 13.42, "change": -0.35, "change_pct": -2.54, "high": 13.95, "low": 13.20},
            {"name": "10Y G-SEC YIELD", "value": 6.82, "change": -0.02, "change_pct": -0.29, "unit": "%"},
            {"name": "BANK FD (1Y-3Y)", "value": 7.10, "change": 0.00, "change_pct": 0.00, "unit": "% Risk-Free"}
        ]
    }

@router.post("/portfolio/rebalance")
async def rebalance_portfolio(req: RebalanceRequest, db: Session = Depends(get_db)):
    """Execute target weights rebalancing through paper/Upstox broker"""
    broker = PaperBroker(db)
    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())

    # Include BOTH target weights symbols AND existing position tickers so liquidations work
    positions = db.query(Position).filter(Position.portfolio_id == broker.portfolio_id).all()
    existing_syms = [p.ticker for p in positions]
    target_syms = [s for s in req.target_weights.keys() if s != "CASH"]
    all_needed_syms = list(set(target_syms + existing_syms))

    current_prices = {}
    if all_needed_syms:
        quotes = provider.get_live_quotes(all_needed_syms)
        current_prices = {s: q["ltp"] for s, q in quotes.items()}

    # Fallback to existing position recorded price if quote is missing or zero
    for p in positions:
        if p.ticker not in current_prices or current_prices[p.ticker] <= 0:
            current_prices[p.ticker] = p.current_price or p.avg_price or 1000.0

    result = broker.execute_rebalance(
        target_weights=req.target_weights,
        current_prices=current_prices,
        optimizer_name=req.optimizer_name,
        covariance_name=req.covariance_name
    )
    return result

@router.post("/portfolio/order")
def execute_manual_order(req: ManualOrderRequest, db: Session = Depends(get_db)):
    """Execute manual BUY or SELL paper order"""
    broker = PaperBroker(db)
    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())

    quotes = provider.get_live_quotes([req.symbol])
    price = quotes.get(req.symbol, {}).get("ltp", 1000.0)

    res = broker.execute_order(
        symbol=req.symbol,
        order_type=req.order_type,
        shares=req.shares,
        current_price=price
    )
    return res

@router.post("/portfolio/reset")
def reset_portfolio(db: Session = Depends(get_db)):
    """Reset paper trading portfolio back to ₹10,00,000 cash"""
    broker = PaperBroker(db)
    broker.reset_portfolio(settings.DEFAULT_INITIAL_CASH)
    return {"status": "SUCCESS", "message": "Portfolio reset to ₹10,00,000 cash."}


# --- 5. Analytics: Frontier, Factor Model, Attribution ---

@router.get("/analytics/frontier")
def get_efficient_frontier(
    symbols: Optional[str] = Query(None),
    covariance: str = "ledoit_wolf",
    db: Session = Depends(get_db)
):
    """Compute 50-point Efficient Frontier, Tangency Portfolio, and CAL"""
    symbol_list = symbols.split(",") if symbols else PRESETS["NIFTY_TOP_10"]
    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())

    price_df = provider.fetch_historical_prices(symbol_list, start_date="2022-01-01")
    returns = np.log(price_df / price_df.shift(1)).dropna()

    cov = CovarianceEstimator.estimate(returns, method=covariance)
    ef = EfficientFrontier(returns, cov)
    return ef.compute_frontier()

@router.get("/analytics/attribution")
def get_attribution(symbols: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Compute Brinson-Hood-Beebower Attribution and Crisis Stress Replay against NIFTY 50 benchmark"""
    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())

    # 1. Determine portfolio weights
    paper_broker = PaperBroker(db)
    positions = db.query(Position).filter(Position.portfolio_id == paper_broker.portfolio_id).all()
    
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()] if symbols else []
    
    port_weights = {}
    if not symbol_list and positions:
        # Use actual positions in PaperBroker if no custom symbol list specified
        pos_values = {p.ticker: p.shares * (p.current_price or p.avg_price or 1000.0) for p in positions if p.ticker != "CASH"}
        tot_val = sum(pos_values.values())
        if tot_val > 0:
            port_weights = {k: v / tot_val for k, v in pos_values.items()}
            symbol_list = list(port_weights.keys())
    
    # If no custom positions, default to the top momentum qualified assets of the active strategy
    if not port_weights:
        if symbol_list:
            matching_positions = {p.ticker: p.shares * (p.current_price or p.avg_price or 1000.0) for p in positions if p.ticker in symbol_list}
            tot_matching = sum(matching_positions.values())
            if tot_matching > 0 and len(matching_positions) == len(symbol_list):
                port_weights = {s: matching_positions[s] / tot_matching for s in symbol_list}
            else:
                n = len(symbol_list)
                port_weights = {s: 1.0 / n for s in symbol_list}
        else:
            # Active Kinetic RMT Momentum Top 10 assets
            master_prices = provider.fetch_historical_prices(PRESETS["NIFTY_50_UNIVERSE"])
            sma = master_prices.rolling(window=min(200, len(master_prices)-10)).mean()
            ewm20 = master_prices.ewm(span=20, adjust=False).mean()
            dydx = ewm20.diff()
            d2ydx2 = dydx.diff()
            struct_mom = master_prices.pct_change(min(126, len(master_prices)-10)).fillna(0.0)
            sig = (master_prices > sma) & (dydx > 0) & (d2ydx2 > 0)
            trig = sig.iloc[-1]
            qual = trig[trig].index.tolist()
            if not qual:
                qual = struct_mom.iloc[-1].nlargest(10).index.tolist()
            ranks = struct_mom.iloc[-1].loc[qual]
            top_10 = ranks.nlargest(min(10, len(qual))).index.tolist()
            port_weights = {s: 1.0 / len(top_10) for s in top_10}
            symbol_list = top_10

    # 2. Benchmark universe: NIFTY 50 representative sector basket
    bm_sectors = {
        "Financial Services": (0.33, ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS"]),
        "Information Technology": (0.14, ["TCS.NS", "INFY.NS"]),
        "Energy & Oil": (0.11, ["RELIANCE.NS", "ONGC.NS"]),
        "Consumer Goods": (0.09, ["HINDUNILVR.NS", "ITC.NS"]),
        "Automobile": (0.08, ["MARUTI.NS", "M&M.NS"]),
        "Capital Goods": (0.05, ["LT.NS"]),
        "Healthcare": (0.04, ["SUNPHARMA.NS", "CIPLA.NS"]),
        "Telecommunication": (0.04, ["BHARTIARTL.NS"]),
        "Metals & Mining": (0.04, ["TATASTEEL.NS"]),
        "Power & Utilities": (0.04, ["NTPC.NS", "POWERGRID.NS"]),
        "Materials": (0.04, ["ULTRACEMCO.NS"])
    }

    bm_weights = {}
    for sec, (sec_w, syms) in bm_sectors.items():
        sub_w = sec_w / len(syms)
        for s in syms:
            bm_weights[s] = sub_w

    all_symbols = sorted(list(set(list(port_weights.keys()) + list(bm_weights.keys()))))
    price_df = provider.fetch_historical_prices(all_symbols)
    returns = price_df.pct_change().dropna()
    mean_rets = (returns.mean() * 252).to_dict()

    brinson = PerformanceAttribution.brinson_attribution(
        portfolio_weights=port_weights,
        portfolio_returns=mean_rets,
        benchmark_weights=bm_weights,
        benchmark_returns=mean_rets,
        sector_mapping=SECTOR_MAP
    )

    stress_tests = PerformanceAttribution.run_crisis_stress_tests(port_weights)

    # 3-Factor regression on portfolio asset weighted series
    port_cols = [s for s in port_weights.keys() if s in returns.columns]
    if port_cols:
        w_series = [port_weights[s] for s in port_cols]
        w_sum = sum(w_series)
        norm_w = [w / w_sum for w in w_series]
        port_series = (returns[port_cols] * norm_w).sum(axis=1)
    else:
        port_series = returns.mean(axis=1)

    mkt_returns = returns.mean(axis=1)
    factor_results = run_factor_regression(port_series, market_returns=mkt_returns)

    return {
        "brinson": brinson,
        "stress_tests": stress_tests,
        "factor_regression": factor_results
    }


# --- 6. Upstox API v2 OAuth2 Endpoints ---

@router.get("/upstox/status")
def get_upstox_status(db: Session = Depends(get_db)):
    """Check Upstox connection and authentication mode"""
    upstox = UpstoxBroker(db)
    return upstox.get_status()

@router.get("/upstox/authorize")
def authorize_upstox(db: Session = Depends(get_db)):
    """Redirect user to Upstox OAuth2 login dialog"""
    upstox = UpstoxBroker(db)
    url = upstox.get_authorization_url()
    return RedirectResponse(url)

@router.get("/upstox/callback")
async def upstox_oauth_callback(code: str, db: Session = Depends(get_db)):
    """OAuth2 callback from Upstox with authorization code"""
    upstox = UpstoxBroker(db)
    result = await upstox.exchange_code_for_token(code)
    # Relative redirect to frontend so it works on port 8000, 5173, and cloud hosts
    return RedirectResponse(url=f"/upstox-connect?status={result.get('status')}")

@router.post("/upstox/config")
def configure_upstox(cfg: UpstoxConfigModel):
    """Dynamically set or update Upstox API credentials"""
    settings.UPSTOX_API_KEY = cfg.api_key.strip()
    settings.UPSTOX_API_SECRET = cfg.api_secret.strip()
    if cfg.redirect_uri:
        settings.UPSTOX_REDIRECT_URI = cfg.redirect_uri.strip()
    
    # Optionally persist to .env if writable
    try:
        from pathlib import Path
        _root = Path(__file__).resolve().parents[2]
        env_file = _root / ".env"
        lines = []
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if not any(line.startswith(k) for k in ["UPSTOX_API_KEY=", "UPSTOX_API_SECRET=", "UPSTOX_REDIRECT_URI="]):
                    lines.append(line)
        lines.append(f"UPSTOX_API_KEY={settings.UPSTOX_API_KEY}")
        lines.append(f"UPSTOX_API_SECRET={settings.UPSTOX_API_SECRET}")
        lines.append(f"UPSTOX_REDIRECT_URI={settings.UPSTOX_REDIRECT_URI}")
        env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception:
        pass

    return {"status": "UPDATED", "api_key": settings.UPSTOX_API_KEY, "redirect_uri": settings.UPSTOX_REDIRECT_URI}


# --- 7. Custom Trading Strategies Engine ---

class RunStrategyRequest(BaseModel):
    strategy_id: str = "my_custom_strategy"
    symbols: List[str] = Field(default_factory=lambda: PRESETS["NIFTY_TOP_10"])
    cash_buffer: float = 0.02
    start_date: str = "2023-01-01"

@router.get("/strategies")
def get_strategies_list():
    """List all registered custom quantitative strategies"""
    from backend.app.strategies.registry import list_strategies
    return {"strategies": list_strategies()}

@router.post("/strategies/run")
def execute_strategy(req: RunStrategyRequest, db: Session = Depends(get_db)):
    """Run a custom quantitative trading strategy on selected tickers"""
    from backend.app.strategies.registry import get_strategy
    strat = get_strategy(req.strategy_id)
    
    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())
    price_df = provider.fetch_historical_prices(req.symbols, start_date=req.start_date)
    
    weights = strat.generate_weights(price_df, cash_buffer=req.cash_buffer)
    
    returns = np.log(price_df / price_df.shift(1)).dropna()
    mean_ret = returns.mean().values * 252.0
    cov = returns.cov().values * 252.0
    
    clean_w = np.array([weights.get(s, 0.0) for s in price_df.columns])
    port_ret = float(clean_w @ mean_ret)
    port_vol = float(np.sqrt(max(clean_w @ cov @ clean_w, 1e-8)))
    sharpe = (port_ret - settings.DEFAULT_RISK_FREE_RATE) / port_vol if port_vol > 0 else 0.0
    
    return {
        "strategy_id": strat.id,
        "strategy_name": strat.name,
        "category": strat.category,
        "weights": weights,
        "expected_return": round(port_ret * 100, 2),
        "volatility": round(port_vol * 100, 2),
        "sharpe": round(sharpe, 2)
    }

# --- 8. Custom Python Strategy Studio Execution ---

class ExecuteCustomCodeRequest(BaseModel):
    code: str
    symbols: List[str] = Field(default_factory=lambda: PRESETS["NIFTY_TOP_10"])
    cash_buffer: float = 0.02
    start_date: str = "2023-01-01"

@router.get("/strategies/custom-code/templates")
def get_custom_code_templates():
    """Retrieve starter templates for writing custom quantitative strategies"""
    from backend.app.strategies.code_executor import DEFAULT_PYTHON_STRATEGY_TEMPLATE
    return {
        "default": DEFAULT_PYTHON_STRATEGY_TEMPLATE,
        "templates": [
            {
                "id": "kinetic_rmt",
                "name": "Kinetic RMT Momentum (Default Strategy)",
                "description": "200-SMA + 20-EMA 2nd-derivative trend acceleration, Marchenko-Pastur RMT noise cleaning & utility maximization",
                "code": DEFAULT_PYTHON_STRATEGY_TEMPLATE
            },
            {
                "id": "equal_weight_top10",
                "name": "Equal-Weight Momentum Top 10",
                "description": "Selects top 10 assets by 126-day structural momentum and equal-weights them",
                "code": '''def generate_weights(prices_df, returns_df):
    """Equal-Weight Top 10 6-Month Momentum"""
    lookback = min(126, len(prices_df) - 1)
    cum_returns = prices_df.pct_change(lookback).iloc[-1].dropna()
    top_10 = cum_returns.nlargest(10).index.tolist()
    print(f"Top 10 Momentum assets selected: {', '.join(top_10)}")
    return {s: 1.0 / len(top_10) for s in top_10}
'''
            },
            {
                "id": "inverse_vol",
                "name": "Inverse-Volatility Risk Parity",
                "description": "Allocates weights inversely proportional to 60-day historical volatility",
                "code": '''def generate_weights(prices_df, returns_df):
    """Inverse Volatility Allocation across qualified universe"""
    vol = returns_df.iloc[-60:].std() * (252 ** 0.5)
    inv_vol = 1.0 / np.maximum(vol, 1e-4)
    weights = inv_vol / inv_vol.sum()
    print("Inverse-volatility risk weights generated.")
    return weights.to_dict()
'''
            }
        ]
    }

@router.post("/strategies/custom-code/execute")
def execute_custom_strategy_code_endpoint(req: ExecuteCustomCodeRequest, db: Session = Depends(get_db)):
    """Safely execute custom Python strategy code on historical market data and compute metrics"""
    from backend.app.strategies.code_executor import execute_user_strategy_code

    upstox = UpstoxBroker(db)
    provider = MarketDataProvider(upstox_token=upstox.get_active_token())
    price_df = provider.fetch_historical_prices(req.symbols, start_date=req.start_date)

    if price_df.empty or len(price_df) < 30:
        raise HTTPException(status_code=400, detail="Insufficient price data to execute strategy")

    returns_df = price_df.pct_change().dropna()

    result = execute_user_strategy_code(
        code_str=req.code,
        prices_df=price_df,
        returns_df=returns_df,
        cash_buffer=req.cash_buffer
    )

    if result.get("status") == "ERROR":
        raise HTTPException(status_code=422, detail=result.get("error", "Code execution failed"))

    return result
