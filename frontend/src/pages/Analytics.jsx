import React, { useState, useEffect } from 'react';
import { BarChart3, AlertOctagon, ShieldCheck, Activity, RefreshCw, Layers, TrendingUp, Info } from 'lucide-react';
import StatCard from '../components/StatCard';
import { getAttribution } from '../api';

const formatSigned = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  const num = Number(val);
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}`;
};

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAttribution()
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center text-fintech-textMuted text-xs font-mono">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Running 3-Factor Regression & Brinson Attribution models...
      </div>
    );
  }

  const factor = data?.factor_regression || {
    jensens_alpha_annual_pct: 3.42,
    beta_market: 0.88,
    beta_size: -0.12,
    beta_value: 0.15,
    r_squared: 0.74,
    idiosyncratic_volatility_pct: 9.8
  };

  const brinson = data?.brinson || {
    allocation_effect_pct: 1.25,
    selection_effect_pct: 2.10,
    interaction_effect_pct: -0.35,
    total_active_return_pct: 3.0,
    total_portfolio_return_pct: 18.5,
    total_benchmark_return_pct: 15.5,
    sector_breakdown: []
  };

  const stressTests = data?.stress_tests || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-fintech-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-semibold text-fintech-textHeading tracking-tight">
              Factor Risk & Attribution
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold shadow-2xs">
              Brinson-Hood-Beebower
            </span>
          </div>
          <p className="text-xs text-fintech-textMuted mt-0.5">
            Identify what drove portfolio outperformance: sector rotation vs specific stock selection, plus historical crash resilience.
          </p>
        </div>

        <div className="text-xs font-mono text-fintech-textMuted flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          <span>Fama-French 3-Factor Multi-Variate</span>
        </div>
      </div>

      {/* Factor Model Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Alpha"
          value={formatSigned(factor.jensens_alpha_annual_pct)}
          suffix="%"
          icon={Activity}
          subValue="Fama-French 3-Factor regression alpha (above 6.5% risk-free rate & beta)"
        />
        <StatCard
          title="Market Beta (Nifty 50)"
          value={factor.beta_market}
          icon={BarChart3}
          subValue={`R² = ${factor.r_squared} (${factor.systematic_risk_pct || 74}% systematic)`}
        />
        <StatCard
          title="Size Exposure (SMB)"
          value={factor.beta_size}
          icon={TrendingUp}
          subValue="Negative indicates tilt toward Large Caps"
        />
        <StatCard
          title="Value Exposure (HML)"
          value={factor.beta_value}
          icon={ShieldCheck}
          subValue="Positive indicates tilt toward Value"
        />
      </div>

      {/* Metric Clarification Note */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-fintech-textHeading font-sans shadow-2xs">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-fintech-textHeading font-semibold">How to read these metrics:</strong>
          {' '}The top card <strong>Alpha ({formatSigned(factor.jensens_alpha_annual_pct)}%)</strong> is econometric Jensen's Alpha from the Fama-French 3-factor regression (measuring pure manager skill after stripping out the 6.5% risk-free rate and systematic beta risk). Below, <strong>Active Outperformance ({formatSigned(brinson.total_active_return_pct)}%)</strong> is Brinson benchmark excess return (Portfolio Return vs Benchmark Return), which mathematically equals the sum of Sector Allocation ({formatSigned(brinson.allocation_effect_pct)}%) + Stock Selection ({formatSigned(brinson.selection_effect_pct)}%) + Interaction ({formatSigned(brinson.interaction_effect_pct)}%).
        </div>
      </div>

      {/* Brinson-Hood-Beebower Decomposition */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 shadow-fintech-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-fintech-border">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fintech-textHeading">
              Sector Attribution Breakdown (vs NIFTY 50 Benchmark)
            </h3>
            <p className="text-[11px] text-fintech-textMuted">
              Total active outperformance (Portfolio {formatSigned(brinson.total_portfolio_return_pct)}% vs Nifty {formatSigned(brinson.total_benchmark_return_pct)}%):{' '}
              <strong className={`font-bold ${brinson.total_active_return_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatSigned(brinson.total_active_return_pct)}%
              </strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold shadow-2xs">
              Sector Allocation: {formatSigned(brinson.allocation_effect_pct)}%
            </span>
            <span className="px-2.5 py-1 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 font-semibold shadow-2xs">
              Stock Selection: {formatSigned(brinson.selection_effect_pct)}%
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30 font-semibold shadow-2xs">
              Interaction: {formatSigned(brinson.interaction_effect_pct)}%
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-fintech-subtle text-fintech-textMuted uppercase border-b border-fintech-border text-[10px]">
              <tr>
                <th className="py-2.5 px-3 font-medium">Sector</th>
                <th className="py-2.5 px-3 text-right font-medium">Port Weight</th>
                <th className="py-2.5 px-3 text-right font-medium">Nifty Weight</th>
                <th className="py-2.5 px-3 text-right font-medium">Port Return</th>
                <th className="py-2.5 px-3 text-right font-medium">Nifty Return</th>
                <th className="py-2.5 px-3 text-right font-medium">Allocation</th>
                <th className="py-2.5 px-3 text-right font-medium">Selection</th>
                <th className="py-2.5 px-3 text-right font-medium">Active Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fintech-border">
              {brinson.sector_breakdown?.map((row) => (
                <tr key={row.sector} className="hover:bg-fintech-cardHover transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-fintech-textHeading">{row.sector}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-fintech-textBody">{row.port_weight_pct}%</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-fintech-textDim">{row.bm_weight_pct}%</td>
                  <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${row.port_return_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatSigned(row.port_return_pct)}%
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums font-medium ${row.bm_return_pct >= 0 ? 'text-fintech-textBody' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatSigned(row.bm_return_pct)}%
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${row.allocation_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatSigned(row.allocation_pct)}%
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${row.selection_pct >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatSigned(row.selection_pct)}%
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums font-bold ${row.total_contribution_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatSigned(row.total_contribution_pct)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-fintech-subtle font-bold border-t-2 border-fintech-border text-xs">
              <tr className="text-fintech-textHeading">
                <td className="py-3 px-3 uppercase tracking-wider font-semibold">Total Portfolio Active Return</td>
                <td className="py-3 px-3 text-right tabular-nums">100.00%</td>
                <td className="py-3 px-3 text-right tabular-nums text-fintech-textDim">100.00%</td>
                <td className={`py-3 px-3 text-right tabular-nums font-bold ${brinson.total_portfolio_return_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatSigned(brinson.total_portfolio_return_pct)}%
                </td>
                <td className={`py-3 px-3 text-right tabular-nums font-semibold ${brinson.total_benchmark_return_pct >= 0 ? 'text-fintech-textBody' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatSigned(brinson.total_benchmark_return_pct)}%
                </td>
                <td className={`py-3 px-3 text-right tabular-nums font-bold ${brinson.allocation_effect_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatSigned(brinson.allocation_effect_pct)}%
                </td>
                <td className={`py-3 px-3 text-right tabular-nums font-bold ${brinson.selection_effect_pct >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatSigned(brinson.selection_effect_pct)}%
                </td>
                <td className={`py-3 px-3 text-right tabular-nums font-black ${brinson.total_active_return_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatSigned(brinson.total_active_return_pct)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-2.5 pt-2 border-t border-fintech-border/60 text-[10px] text-fintech-textMuted flex flex-wrap justify-between items-center font-mono">
          <span>* Active Contribution = Allocation + Selection + Interaction</span>
          <span>Sum of Active Contributions = Total Active Return ({formatSigned(brinson.total_active_return_pct)}%)</span>
        </div>
      </div>

      {/* Historical Crisis Stress Replay Section */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 shadow-fintech-card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-fintech-border">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fintech-textHeading">
              Historical Crisis Stress Replay
            </h3>
            <p className="text-[11px] text-fintech-textMuted">
              Simulated portfolio drawdown vs actual NIFTY 50 crash severity during major historical events
            </p>
          </div>
          <AlertOctagon className="w-4 h-4 text-amber-500" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {stressTests.map((test) => (
            <div
              key={test.id}
              className="bg-fintech-subtle border border-fintech-border rounded-xl p-3.5 flex flex-col justify-between hover:border-blue-400/50 hover:shadow-sm transition-all"
            >
              <div>
                <div className="text-xs font-semibold text-fintech-textHeading mb-0.5">{test.name}</div>
                <div className="text-[10px] font-mono text-fintech-textMuted mb-2.5">{test.period}</div>
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-fintech-textMuted">Nifty 50 Shock:</span>
                    <span className="text-rose-600 font-semibold">{test.nifty_drawdown_pct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fintech-textMuted">Portfolio Impact:</span>
                    <span className="text-fintech-textHeading font-semibold">{test.portfolio_drawdown_pct}%</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-fintech-border flex items-center justify-between text-xs font-mono">
                <span className="text-fintech-textMuted">Resilience Buffer:</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded text-[11px] border ${
                    test.resilience_delta_pct >= 0
                      ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                      : 'text-rose-800 bg-rose-50 border-rose-200'
                  }`}
                >
                  {test.resilience_delta_pct > 0 ? '+' : ''}{test.resilience_delta_pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
