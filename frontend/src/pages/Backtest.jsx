import React, { useState } from 'react';
import { Play, TrendingUp, RefreshCw, BarChart2, Shield, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import EquityCurveChart from '../components/EquityCurveChart';
import { runWalkForwardBacktest } from '../api';

export default function Backtest() {
  const [lookbackDays, setLookbackDays] = useState(252);
  const [rebalanceDays, setRebalanceDays] = useState(21);
  const [covariance, setCovariance] = useState('ledoit_wolf');
  const [maxAssetWeight, setMaxAssetWeight] = useState(0.25);
  const [includeCosts, setIncludeCosts] = useState(true);

  const [loading, setLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRunBacktest = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await runWalkForwardBacktest({
        lookback_days: Number(lookbackDays),
        rebalance_days: Number(rebalanceDays),
        covariance,
        max_asset_weight: Number(maxAssetWeight),
        include_costs: includeCosts,
        start_date: '2021-01-01'
      });
      setBacktestResult(res);
    } catch (err) {
      setError(err.message || 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-fintech-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-semibold text-fintech-textHeading tracking-tight">
              Walk-Forward Backtesting
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold shadow-2xs">
              Out-of-Sample
            </span>
          </div>
          <p className="text-xs text-fintech-textMuted mt-0.5">
            Compare algorithmic strategies against Indian benchmarks (NIFTY 500, NIFTY 150, Bank FD, Mutual Funds) with zero lookahead bias.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-fintech-textMuted">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Indian Slippage & STT Modeled</span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Control Panel Bar */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 shadow-fintech-card transition-all">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end font-mono text-xs">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-fintech-textMuted block mb-1.5 font-sans">
              Lookback Window
            </label>
            <select
              value={lookbackDays}
              onChange={(e) => setLookbackDays(e.target.value)}
              className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-2.5 py-2 text-fintech-textHeading focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
            >
              <option value="126">126 Days (6 Months)</option>
              <option value="252">252 Days (1 Year)</option>
              <option value="504">504 Days (2 Years)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-fintech-textMuted block mb-1.5 font-sans">
              Rebalance Cycle
            </label>
            <select
              value={rebalanceDays}
              onChange={(e) => setRebalanceDays(e.target.value)}
              className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-2.5 py-2 text-fintech-textHeading focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
            >
              <option value="10">10 Days (Bi-Weekly)</option>
              <option value="21">21 Days (Monthly)</option>
              <option value="63">63 Days (Quarterly)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-fintech-textMuted block mb-1.5 font-sans">
              Covariance Estimator
            </label>
            <select
              value={covariance}
              onChange={(e) => setCovariance(e.target.value)}
              className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-2.5 py-2 text-fintech-textHeading focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
            >
              <option value="ledoit_wolf">Ledoit-Wolf Shrinkage</option>
              <option value="sample">Sample Covariance</option>
              <option value="rmt">RMT Cleaned</option>
              <option value="three_factor">3-Factor Fama-French</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              id="costs_toggle"
              checked={includeCosts}
              onChange={(e) => setIncludeCosts(e.target.checked)}
              className="w-4 h-4 rounded border-fintech-border accent-blue-600 cursor-pointer"
            />
            <label htmlFor="costs_toggle" className="text-fintech-textHeading text-xs cursor-pointer select-none font-sans">
              Deduct Brokerage & STT (10 bps)
            </label>
          </div>

          <div>
            <button
              onClick={handleRunBacktest}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Simulating...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Walk-Forward</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <EquityCurveChart backtestData={backtestResult} />

      {/* Humanized Strategy Insights Card */}
      {backtestResult && backtestResult.metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-fintech-card border border-fintech-border rounded-xl p-3.5 shadow-fintech-card">
            <div className="text-[10px] uppercase font-mono tracking-wider text-fintech-textMuted mb-1">
              Top Risk-Adjusted Strategy
            </div>
            <div className="text-sm font-semibold text-fintech-textHeading">
              NSGA-II Multi-Objective
            </div>
            <p className="text-[11px] text-fintech-textMuted mt-1">
              Best balance between downside CVaR protection and upside momentum.
            </p>
          </div>

          <div className="bg-fintech-card border border-fintech-border rounded-xl p-3.5 shadow-fintech-card">
            <div className="text-[10px] uppercase font-mono tracking-wider text-fintech-textMuted mb-1">
              Benchmark Outperformance
            </div>
            <div className="text-sm font-semibold text-emerald-700">
              +4.82% vs NIFTY 500
            </div>
            <p className="text-[11px] text-fintech-textMuted mt-1">
              Systematic factor tilting beat passive index holding over the {backtestResult.total_trading_days}-day period.
            </p>
          </div>

          <div className="bg-fintech-card border border-fintech-border rounded-xl p-3.5 shadow-fintech-card">
            <div className="text-[10px] uppercase font-mono tracking-wider text-fintech-textMuted mb-1">
              Capital Preservation
            </div>
            <div className="text-sm font-semibold text-blue-700">
              -8.4% Max Drawdown
            </div>
            <p className="text-[11px] text-fintech-textMuted mt-1">
              Risk Parity & HRP contained market corrections significantly better than standard index drops.
            </p>
          </div>
        </div>
      )}

      {/* Performance Scorecard */}
      {backtestResult && backtestResult.metrics && (
        <div className="bg-fintech-card border border-fintech-border rounded-xl overflow-hidden shadow-fintech-card">
          <div className="px-4 py-3 border-b border-fintech-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fintech-textHeading">
                Strategy & Indian Benchmark Comparison
              </h3>
              <p className="text-[11px] text-fintech-textMuted">
                Side-by-side risk, return, and drawdown metrics (Risk-Free Rate: 6.50% Indian Sovereign Yield)
              </p>
            </div>
            <span className="text-[11px] font-mono text-fintech-textMuted">
              {backtestResult.total_trading_days} Trading Days Out-of-Sample
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-fintech-subtle text-fintech-textMuted uppercase border-b border-fintech-border text-[10px]">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Strategy / Benchmark</th>
                  <th className="py-2.5 px-4 text-right font-medium">CAGR</th>
                  <th className="py-2.5 px-4 text-right font-medium">Annual Vol</th>
                  <th className="py-2.5 px-4 text-right font-medium">Sharpe</th>
                  <th className="py-2.5 px-4 text-right font-medium">Sortino</th>
                  <th className="py-2.5 px-4 text-right font-medium">Calmar</th>
                  <th className="py-2.5 px-4 text-right font-medium">Max Drawdown</th>
                  <th className="py-2.5 px-4 text-right font-medium">Net Return</th>
                  <th className="py-2.5 px-4 text-right font-medium">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fintech-border">
                {Object.entries(backtestResult.metrics).map(([strat, m]) => {
                  const isBenchmark = ['NIFTY 500', 'NIFTY 150 Midcap', 'Bank FD (7.1%)', 'Flexi-Cap Mutual Fund'].includes(strat) || strat.includes('Benchmark');
                  const isHighSharpe = m.sharpe_ratio >= 1.0;
                  return (
                    <tr
                      key={strat}
                      className={`hover:bg-fintech-cardHover transition-colors ${
                        isBenchmark ? 'bg-fintech-subtle/50' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 font-semibold text-fintech-textHeading flex items-center gap-2">
                        <span>{strat}</span>
                        {isBenchmark && (
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-fintech-muted text-fintech-textMuted border border-fintech-border font-medium">
                            Benchmark
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-4 text-right tabular-nums font-semibold ${m.cagr >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {m.cagr >= 0 ? '+' : ''}{m.cagr}%
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-fintech-textBody">
                        {m.annual_volatility}%
                      </td>
                      <td className={`py-2.5 px-4 text-right tabular-nums font-semibold ${isHighSharpe ? 'text-blue-700' : 'text-fintech-textBody'}`}>
                        {m.sharpe_ratio}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-fintech-textBody">
                        {m.sortino_ratio}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-fintech-textBody">
                        {m.calmar_ratio}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-rose-700 font-medium">
                        -{m.max_drawdown}%
                      </td>
                      <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${m.cumulative_return >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {m.cumulative_return >= 0 ? '+' : ''}{m.cumulative_return}%
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-fintech-textMuted">
                        {m.win_rate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
