import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Play,
  CheckCircle2,
  TrendingUp,
  Percent,
  ShieldAlert,
  ArrowRight,
  Info,
  RefreshCw,
  Code,
  Sparkles,
  Layers,
  Terminal,
  FileCode2,
  Award,
  Cpu
} from 'lucide-react';
import EfficientFrontierChart from '../components/EfficientFrontierChart';
import AllocationDonut from '../components/AllocationDonut';
import ParetoFrontierExplorer from '../components/ParetoFrontierExplorer';
import PythonStrategyStudio from '../components/PythonStrategyStudio';
import {
  fetchInstruments,
  optimizePortfolio,
  getEfficientFrontier,
  rebalancePortfolio,
  fetchStrategies,
  runStrategy
} from '../api';

export default function Optimizer({ setActiveTab, onRebalanceDone }) {
  const [activeMode, setActiveMode] = useState('math'); // 'math' | 'strategy' | 'pareto'
  const [instruments, setInstruments] = useState([]);
  const [presets, setPresets] = useState({});
  const [selectedSymbols, setSelectedSymbols] = useState(() => {
    try {
      const saved = sessionStorage.getItem('quant_selected_symbols');
      return saved ? JSON.parse(saved) : [
        'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
        'HINDUNILVR.NS', 'ITC.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'LT.NS'
      ];
    } catch {
      return [
        'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
        'HINDUNILVR.NS', 'ITC.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'LT.NS'
      ];
    }
  });
  const [optimizer, setOptimizer] = useState(() => {
    return sessionStorage.getItem('quant_optimizer') || 'rmt_momentum';
  });
  const [covariance, setCovariance] = useState(() => {
    return sessionStorage.getItem('quant_covariance') || 'ledoit_wolf';
  });
  const [maxAssetWeight, setMaxAssetWeight] = useState(0.25);
  const [maxSectorWeight, setMaxSectorWeight] = useState(0.35);
  const [cashBuffer, setCashBuffer] = useState(0.02);

  // Black-Litterman views state
  const [viewSymbol, setViewSymbol] = useState('INFY.NS');
  const [viewExpectedReturn, setViewExpectedReturn] = useState(0.20);
  const [views, setViews] = useState({});

  // Custom strategies state
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('rmt_momentum_default');
  const [strategyResult, setStrategyResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [optResult, setOptResult] = useState(() => {
    try {
      const saved = sessionStorage.getItem('quant_opt_result');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [frontierData, setFrontierData] = useState(() => {
    try {
      const saved = sessionStorage.getItem('quant_frontier_data');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [rebalanceMsg, setRebalanceMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('quant_selected_symbols', JSON.stringify(selectedSymbols));
    } catch {}
  }, [selectedSymbols]);

  useEffect(() => {
    try {
      sessionStorage.setItem('quant_optimizer', optimizer);
    } catch {}
  }, [optimizer]);

  useEffect(() => {
    try {
      sessionStorage.setItem('quant_covariance', covariance);
    } catch {}
  }, [covariance]);

  useEffect(() => {
    fetchInstruments()
      .then((res) => {
        setInstruments(res.instruments || []);
        setPresets(res.presets || {});
      })
      .catch((err) => console.error(err));

    fetchStrategies()
      .then((res) => {
        setAvailableStrategies(res.strategies || []);
      })
      .catch((err) => console.error(err));
  }, []);

  const handleSelectPreset = (presetKey) => {
    if (presets[presetKey]) {
      setSelectedSymbols(presets[presetKey]);
    }
  };

  const toggleSymbol = (sym) => {
    if (selectedSymbols.includes(sym)) {
      if (selectedSymbols.length > 2) {
        setSelectedSymbols(selectedSymbols.filter((s) => s !== sym));
      }
    } else {
      setSelectedSymbols([...selectedSymbols, sym]);
    }
  };

  const handleAddView = () => {
    if (viewSymbol) {
      setViews({ ...views, [viewSymbol]: Number(viewExpectedReturn) });
    }
  };

  const handleRemoveView = (sym) => {
    const newViews = { ...views };
    delete newViews[sym];
    setViews(newViews);
  };

  const handleRunOptimization = async () => {
    setLoading(true);
    setError(null);
    setRebalanceMsg(null);

    try {
      const [res, frontierRes] = await Promise.all([
        optimizePortfolio({
          symbols: selectedSymbols,
          optimizer,
          covariance,
          max_asset_weight: Number(maxAssetWeight),
          max_sector_weight: Number(maxSectorWeight),
          cash_buffer: Number(cashBuffer),
          views: Object.keys(views).length > 0 ? views : undefined
        }),
        getEfficientFrontier(selectedSymbols, covariance).catch((err) => {
          console.warn('Frontier fetch notice:', err);
          return null;
        })
      ]);
      setOptResult(res);
      try {
        sessionStorage.setItem('quant_opt_result', JSON.stringify(res));
      } catch {}
      if (frontierRes) {
        setFrontierData(frontierRes);
        try {
          sessionStorage.setItem('quant_frontier_data', JSON.stringify(frontierRes));
        } catch {}
      }
    } catch (err) {
      setError(err.message || 'Optimization failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRunStrategy = async () => {
    setLoading(true);
    setError(null);
    setRebalanceMsg(null);

    try {
      const res = await runStrategy({
        strategy_id: selectedStrategyId,
        symbols: selectedSymbols,
        cash_buffer: Number(cashBuffer)
      });
      setStrategyResult(res);
    } catch (err) {
      setError(err.message || 'Strategy execution failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeployToPortfolio = async (weightsToDeploy, optName, covName) => {
    if (!weightsToDeploy) return;
    setRebalancing(true);
    try {
      const res = await rebalancePortfolio({
        target_weights: weightsToDeploy,
        optimizer_name: optName,
        covariance_name: covName
      });
      setRebalanceMsg(`Rebalanced successfully! Executed ${res.orders_count} orders.`);
      if (onRebalanceDone) onRebalanceDone();
    } catch (err) {
      setError(err.message || 'Rebalancing failed');
    } finally {
      setRebalancing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-fintech-border">
        <div>
          <h1 className="text-base font-bold text-fintech-textHeading tracking-tight">
            Portfolio Optimization
          </h1>
          <p className="text-xs text-fintech-textMuted">
            Quantitative allocation models, risk parity & multi-objective algorithms
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1 bg-fintech-card p-1 rounded-xl border border-fintech-border shadow-sm">
          <button
            onClick={() => setActiveMode('math')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeMode === 'math'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-fintech-textMuted hover:text-fintech-textHeading hover:bg-fintech-subtle'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Quantitative Optimizers</span>
          </button>
          <button
            onClick={() => setActiveMode('pareto')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeMode === 'pareto'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-fintech-textMuted hover:text-fintech-textHeading hover:bg-fintech-subtle'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pareto Frontier Explorer</span>
          </button>
          <button
            onClick={() => setActiveMode('strategy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeMode === 'strategy'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-fintech-textMuted hover:text-fintech-textHeading hover:bg-fintech-subtle'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Python Strategy Studio</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
          {error}
        </div>
      )}

      {rebalanceMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center justify-between">
          <span>{rebalanceMsg}</span>
          <button
            onClick={() => setActiveTab('dashboard')}
            className="underline font-bold text-emerald-900"
          >
            View Paper Ledger →
          </button>
        </div>
      )}

      {/* Mode 1: Quantitative Optimizers */}
      {activeMode === 'math' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Controls (4 cols) */}
          <div className="lg:col-span-4 bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-fintech-textHeading font-mono">
              Optimizer Setup
            </h3>

            {/* Universe Presets */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-fintech-textMuted block mb-1.5">
                Quick Basket Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(presets).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectPreset(key)}
                    className="px-2 py-1 rounded bg-fintech-subtle hover:bg-fintech-card border border-fintech-border text-[11px] font-mono text-fintech-textBody hover:text-blue-600 transition-colors"
                  >
                    {key.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Select */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-fintech-textMuted block mb-1.5">
                Optimization Algorithm
              </label>
              <select
                value={optimizer}
                onChange={(e) => setOptimizer(e.target.value)}
                className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-xs font-mono text-fintech-textHeading focus:border-blue-600 outline-none"
              >
                <option value="rmt_momentum">RMT Trend Momentum (Default)</option>
                <option value="maximum_sharpe">Maximum Sharpe Ratio (Tangency, Rf = 6.5%)</option>
                <option value="minimum_variance">Minimum Variance (Quadratic QP)</option>
                <option value="risk_parity">Risk Parity / Equal Risk Contribution (ERC)</option>
                <option value="hierarchical_risk_parity">Hierarchical Risk Parity (HRP)</option>
                <option value="black_litterman">Black-Litterman (Bayesian Views)</option>
                <option value="cvar">CVaR (95% Expected Shortfall)</option>
                <option value="nsga2">NSGA-II (Multi-Objective: Return, CVaR, Turnover, Diversification)</option>
                <option value="genetic_algorithm">Genetic Algorithm (Evolutionary Search)</option>
                <option value="entropy_pooling">Entropy Pooling (Meucci View-Conditioned)</option>
                <option value="moead">MOEA/D (Decomposition Tchebycheff Subproblems)</option>
                <option value="spea2">SPEA2 (Strength Pareto Density Estimation)</option>
                <option value="mopso">MOPSO (Multi-Objective Particle Swarm)</option>
              </select>
            </div>

            {/* Covariance Estimation */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-fintech-textMuted block mb-1.5">
                Covariance & Risk Estimator
              </label>
              <select
                value={covariance}
                onChange={(e) => setCovariance(e.target.value)}
                className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-xs font-mono text-fintech-textHeading focus:border-blue-600 outline-none"
              >
                <option value="ledoit_wolf">Ledoit-Wolf Analytic Shrinkage</option>
                <option value="sample">Sample Covariance (Annualized)</option>
                <option value="rmt">Random Matrix Theory (Marchenko-Pastur RMT)</option>
                <option value="three_factor">3-Factor Structured (Market, SMB, HML)</option>
              </select>
            </div>

            {/* Constraints Sliders */}
            <div className="space-y-3 pt-2 border-t border-fintech-border">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-fintech-textMuted">Max Single Asset Weight:</span>
                  <span className="text-fintech-textHeading font-bold">{Math.round(maxAssetWeight * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.50"
                  step="0.05"
                  value={maxAssetWeight}
                  onChange={(e) => setMaxAssetWeight(e.target.value)}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-fintech-textMuted">Max Sector Cap:</span>
                  <span className="text-fintech-textHeading font-bold">{Math.round(maxSectorWeight * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.60"
                  step="0.05"
                  value={maxSectorWeight}
                  onChange={(e) => setMaxSectorWeight(e.target.value)}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-fintech-textMuted">Cash Buffer:</span>
                  <span className="text-fintech-textHeading font-bold">{Math.round(cashBuffer * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="0.10"
                  step="0.01"
                  value={cashBuffer}
                  onChange={(e) => setCashBuffer(e.target.value)}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Black-Litterman Views */}
            {optimizer === 'black_litterman' && (
              <div className="p-3 bg-fintech-subtle rounded-lg border border-fintech-border space-y-2">
                <span className="text-[10px] font-bold text-amber-700 uppercase block">Investor Views</span>
                <div className="flex gap-2">
                  <select
                    value={viewSymbol}
                    onChange={(e) => setViewSymbol(e.target.value)}
                    className="bg-fintech-card border border-fintech-border rounded px-2 py-1 text-xs text-fintech-textHeading font-mono"
                  >
                    {selectedSymbols.map((s) => (
                      <option key={s} value={s}>{s.replace('.NS', '')}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={viewExpectedReturn}
                    onChange={(e) => setViewExpectedReturn(e.target.value)}
                    placeholder="Return"
                    className="w-20 bg-fintech-card border border-fintech-border rounded px-2 py-1 text-xs text-fintech-textHeading font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddView}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white font-bold"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={handleRunOptimization}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Solving Optimizer...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute {optimizer.replace(/_/g, ' ').toUpperCase()}</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: Universe & Results (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Ticker Badges Selector */}
            <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 shadow-fintech-card">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-fintech-textHeading font-mono">
                  Asset Universe ({selectedSymbols.length} Selected)
                </span>
                <button
                  onClick={() => setSelectedSymbols(instruments.map((i) => i.symbol))}
                  className="text-[11px] text-blue-600 hover:underline font-mono font-medium"
                >
                  Select All
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {instruments.map((inst) => {
                  const isSelected = selectedSymbols.includes(inst.symbol);
                  return (
                    <button
                      key={inst.symbol}
                      onClick={() => toggleSymbol(inst.symbol)}
                      className={`px-2 py-1 rounded text-xs font-mono font-semibold transition-colors border ${
                        isSelected
                          ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
                          : 'bg-fintech-subtle text-fintech-textMuted border-fintech-border hover:bg-fintech-card hover:text-fintech-textHeading'
                      }`}
                    >
                      {inst.symbol.replace('.NS', '')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Results Display */}
            {optResult && (
              <div className="space-y-6">
                {/* 3 Metric Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-fintech-card border border-fintech-border rounded-xl p-3.5 text-center shadow-fintech-card">
                    <span className="text-[10px] text-fintech-textMuted uppercase font-semibold block mb-0.5">Expected Annual Return</span>
                    <span className="text-xl font-bold font-mono text-emerald-700 tabular-nums">
                      +{(optResult.expected_annual_return * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="bg-fintech-card border border-fintech-border rounded-xl p-3.5 text-center shadow-fintech-card">
                    <span className="text-[10px] text-fintech-textMuted uppercase font-semibold block mb-0.5">Annual Volatility</span>
                    <span className="text-xl font-bold font-mono text-fintech-textHeading tabular-nums">
                      {(optResult.annual_volatility * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="bg-fintech-card border border-fintech-border rounded-xl p-3.5 text-center shadow-fintech-card">
                    <span className="text-[10px] text-fintech-textMuted uppercase font-semibold block mb-0.5">Sharpe Ratio</span>
                    <span className="text-xl font-bold font-mono text-blue-700 tabular-nums">
                      {optResult.sharpe_ratio}
                    </span>
                  </div>
                </div>

                {/* Research Algorithm Meta Badge (If evolutionary / multi-objective) */}
                {optResult.meta && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between text-xs font-mono text-purple-900">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-purple-700" />
                      <span className="font-bold">{optResult.meta.algorithm} Diagnostics:</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px]">
                      {Object.entries(optResult.meta)
                        .filter(([k]) => k !== 'algorithm' && typeof optResult.meta[k] !== 'object')
                        .map(([k, v]) => (
                          <span key={k}>
                            {k.replace(/_/g, ' ')}: <strong className="text-purple-950">{String(v)}</strong>
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Efficient Frontier Chart */}
                <EfficientFrontierChart frontierData={frontierData} />

                {/* Allocation Donut & Weights Table */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <AllocationDonut
                    weights={optResult.constrained_weights}
                    sectorAllocations={optResult.sector_allocations}
                  />

                  {/* Weights Table */}
                  <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 overflow-hidden shadow-fintech-card">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-fintech-textHeading mb-2.5 font-mono">
                      Target Optimized Weights
                    </h3>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-fintech-subtle text-fintech-textMuted uppercase sticky top-0 text-[10px]">
                          <tr>
                            <th className="py-2 px-3">Asset</th>
                            <th className="py-2 px-3 text-right">Weight</th>
                            <th className="py-2 px-3 text-right">Risk %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-fintech-border">
                          {Object.entries(optResult.constrained_weights).map(([sym, w]) => {
                            const rc = optResult.risk_contributions ? optResult.risk_contributions[sym] : 0.0;
                            return (
                              <tr key={sym} className="hover:bg-fintech-cardHover">
                                <td className="py-1.5 px-3 font-bold text-fintech-textHeading">{sym.replace('.NS', '')}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-fintech-textHeading font-semibold">
                                  {(w * 100).toFixed(1)}%
                                </td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-blue-700 font-semibold">
                                  {rc ? `${(rc * 100).toFixed(1)}%` : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Deploy Button */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-emerald-950 text-xs">Deploy Allocation to Live Paper Ledger</h4>
                    <p className="text-[11px] text-emerald-800">
                      Executes portfolio rebalance with statutory brokerage, STT and market impact slippage.
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeployToPortfolio(optResult.constrained_weights, optResult.optimizer, optResult.covariance)}
                    disabled={rebalancing}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {rebalancing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Rebalancing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Deploy Target Weights</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Pareto Frontier Explorer */}
      {activeMode === 'pareto' && (
        <ParetoFrontierExplorer
          selectedSymbols={selectedSymbols}
          covariance={covariance}
        />
      )}

      {/* Mode 3: Custom Python Strategy Studio */}
      {activeMode === 'strategy' && (
        <PythonStrategyStudio
          selectedSymbols={selectedSymbols}
          cashBuffer={cashBuffer}
          onRebalanceDone={onRebalanceDone}
          setActiveTab={setActiveTab}
        />
      )}
    </div>
  );
}
