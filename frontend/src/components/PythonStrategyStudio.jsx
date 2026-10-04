import React, { useState, useEffect } from 'react';
import {
  Code2,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Layers,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import AllocationDonut from './AllocationDonut';
import { getCustomCodeTemplates, executeCustomStrategyCode, rebalancePortfolio } from '../api';

const DEFAULT_FALLBACK_CODE = `def generate_weights(prices_df, returns_df):
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
`;

export default function PythonStrategyStudio({
  selectedSymbols,
  cashBuffer,
  onRebalanceDone,
  setActiveTab
}) {
  const [code, setCode] = useState(() => {
    return sessionStorage.getItem('quant_custom_code') || DEFAULT_FALLBACK_CODE;
  });
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('kinetic_rmt');
  const [loading, setLoading] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [deploySuccessMsg, setDeploySuccessMsg] = useState(null);
  const [error, setError] = useState(null);

  const [result, setResult] = useState(() => {
    try {
      const saved = sessionStorage.getItem('quant_custom_code_result');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('quant_custom_code', code);
    } catch {}
  }, [code]);

  useEffect(() => {
    getCustomCodeTemplates()
      .then((res) => {
        if (res?.templates) setTemplates(res.templates);
      })
      .catch((err) => console.warn('Could not load code templates:', err));
  }, []);

  const handleTemplateChange = (tmplId) => {
    setSelectedTemplateId(tmplId);
    const tmpl = templates.find((t) => t.id === tmplId);
    if (tmpl?.code) {
      setCode(tmpl.code);
    } else if (tmplId === 'kinetic_rmt') {
      setCode(DEFAULT_FALLBACK_CODE);
    }
  };

  const handleRunStrategyCode = async () => {
    setLoading(true);
    setError(null);
    setDeploySuccessMsg(null);

    try {
      const res = await executeCustomStrategyCode({
        code: code.trim(),
        symbols: selectedSymbols,
        cash_buffer: Number(cashBuffer || 0.02)
      });
      setResult(res);
      try {
        sessionStorage.setItem('quant_custom_code_result', JSON.stringify(res));
      } catch {}
    } catch (err) {
      console.error('Custom code run failed:', err);
      const detail = err.response?.data?.detail || err.message || 'Execution error';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleDeployStrategy = async () => {
    if (!result?.constrained_weights) return;
    setRebalancing(true);
    setError(null);
    try {
      const deployRes = await rebalancePortfolio({
        target_weights: result.constrained_weights,
        optimizer_name: 'Custom Python Strategy',
        covariance_name: 'Custom Script Covariance'
      });
      setDeploySuccessMsg(`Successfully deployed custom strategy! Executed ${deployRes.orders_count} orders.`);
      if (onRebalanceDone) onRebalanceDone();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Deployment failed');
    } finally {
      setRebalancing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const nextCode = code.substring(0, start) + '    ' + code.substring(end);
      setCode(nextCode);
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 4;
      }, 0);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-fintech-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-mono flex items-center gap-1">
                <Code2 className="w-3.5 h-3.5" />
                Python Strategy Studio
              </span>
              <span className="text-xs text-fintech-textMuted font-mono">Live Script Engine</span>
            </div>
            <h3 className="text-sm font-bold text-fintech-textHeading mt-1">
              Custom Quantitative Code & Direct Deployment
            </h3>
          </div>

          {/* Template Switcher & Actions */}
          <div className="flex items-center gap-2">
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="bg-fintech-subtle border border-fintech-border text-xs rounded-lg px-2.5 py-1.5 text-fintech-textHeading font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="kinetic_rmt">Kinetic RMT Momentum (Default)</option>
              <option value="equal_weight_top10">Equal-Weight Top 10 Momentum</option>
              <option value="inverse_vol">Inverse-Volatility Risk Parity</option>
            </select>

            <button
              onClick={() => setCode(DEFAULT_FALLBACK_CODE)}
              title="Reset Code"
              className="px-2.5 py-1.5 rounded-lg border border-fintech-border hover:bg-fintech-subtle text-xs text-fintech-textMuted transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleRunStrategyCode}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : 'fill-current'}`} />
              <span>{loading ? 'Evaluating...' : 'Run & Calculate Metrics'}</span>
            </button>
          </div>
        </div>

        {/* Code Editor Box */}
        <div className="mt-4 rounded-xl border border-slate-700 overflow-hidden shadow-inner bg-[#0f172a]">
          <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span className="ml-2 font-semibold text-slate-300">strategy.py</span>
            </div>
            <span className="text-[11px] text-slate-500">Python 3.11 • pandas, numpy, scipy available</span>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={18}
            spellCheck={false}
            className="w-full bg-[#0f172a] text-slate-200 font-mono text-xs p-4 focus:outline-none resize-y selection:bg-blue-500/30 leading-relaxed tracking-wide"
            placeholder="Write your custom quantitative strategy here..."
          />
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {deploySuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{deploySuccessMsg}</span>
          </div>
          {setActiveTab && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className="underline font-bold text-emerald-900"
            >
              View Paper Ledger →
            </button>
          )}
        </div>
      )}

      {/* Execution Results & Direct Deployment */}
      {result && (
        <div className="space-y-6 animate-fade-in">
          {/* 3 Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 text-center shadow-fintech-card">
              <span className="text-[10px] text-fintech-textMuted uppercase font-semibold block mb-1">
                Expected Annual Return
              </span>
              <span className="text-2xl font-bold font-mono text-emerald-700 tabular-nums">
                +{(result.expected_annual_return * 100).toFixed(2)}%
              </span>
            </div>
            <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 text-center shadow-fintech-card">
              <span className="text-[10px] text-fintech-textMuted uppercase font-semibold block mb-1">
                Annual Volatility
              </span>
              <span className="text-2xl font-bold font-mono text-fintech-textHeading tabular-nums">
                {(result.annual_volatility * 100).toFixed(2)}%
              </span>
            </div>
            <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 text-center shadow-fintech-card">
              <span className="text-[10px] text-fintech-textMuted uppercase font-semibold block mb-1">
                Sharpe Ratio
              </span>
              <span className="text-2xl font-bold font-mono text-blue-700 tabular-nums">
                {result.sharpe_ratio}
              </span>
            </div>
          </div>

          {/* Allocation & Deployment Area */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Donut Chart & Deploy (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
                <AllocationDonut
                  weights={result.weights}
                  sectorAllocations={result.sector_allocations}
                />
              </div>

              {/* Direct Deploy Button Box */}
              <div className="bg-fintech-card border border-emerald-300 rounded-xl p-4 shadow-fintech-card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800">Deploy Strategy to Paper Ledger</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Direct Order Routing
                  </span>
                </div>
                <p className="text-[11px] text-fintech-textMuted">
                  Executes virtual portfolio rebalance with statutory STT, brokerage and realistic slippage.
                </p>
                <button
                  onClick={handleDeployStrategy}
                  disabled={rebalancing}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{rebalancing ? 'Deploying Orders...' : 'Deploy Allocation to Paper Ledger'}</span>
                </button>
              </div>
            </div>

            {/* Weights Table & Execution Output (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Weights Table */}
              <div className="bg-fintech-card border border-fintech-border rounded-xl overflow-hidden shadow-fintech-card">
                <div className="px-4 py-3 border-b border-fintech-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-fintech-textHeading font-mono">
                      Target Strategy Weights
                    </h4>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-fintech-subtle border border-fintech-border text-fintech-textMuted">
                      {result.holdings_count} Assets
                    </span>
                  </div>
                  <span className="text-[11px] text-fintech-textMuted font-mono">Normalized Sum: 100%</span>
                </div>

                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-fintech-subtle text-fintech-textMuted uppercase text-[10px] border-b border-fintech-border">
                      <tr>
                        <th className="py-2 px-4 font-semibold">Instrument</th>
                        <th className="py-2 px-4 text-right font-semibold">Target Weight</th>
                        <th className="py-2 px-4 text-right font-semibold">Allocation (10L Base)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-fintech-border">
                      {Object.entries(result.weights || {})
                        .filter(([_, w]) => w > 0.001)
                        .sort(([_, a], [__, b]) => b - a)
                        .map(([sym, w]) => (
                          <tr key={sym} className="hover:bg-fintech-cardHover transition-colors">
                            <td className="py-2 px-4 font-bold text-fintech-textHeading">
                              {sym.replace('.NS', '')}
                            </td>
                            <td className="py-2 px-4 text-right font-bold text-blue-700">
                              {(w * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 px-4 text-right text-fintech-textMuted tabular-nums">
                              ₹{(w * 1000000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Execution Console Logs */}
              {result.logs && result.logs.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 space-y-1">
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800 pb-1">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Script Output Logs</span>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-0.5 text-[11px] text-emerald-400">
                    {result.logs.map((log, i) => (
                      <div key={i}>&gt; {log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
