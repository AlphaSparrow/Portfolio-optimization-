import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { TrendingUp, ShieldCheck, Award, CheckSquare, Square } from 'lucide-react';

export default function BenchmarkComparison({ benchmarkData }) {
  const [timeRange, setTimeRange] = useState('1Y');
  const [viewMode, setViewMode] = useState('rebased'); // 'rebased' (start from base ₹10L) or 'cumulative' (absolute ₹)
  const [activeSeries, setActiveSeries] = useState({
    portfolio: true,
    nifty_500: true,
    nifty_150: true,
    mutual_fund: true,
    fd: true,
  });

  if (!benchmarkData || !benchmarkData.chart_data || benchmarkData.chart_data.length === 0) {
    return null;
  }

  const { chart_data, metrics_table, excess_over_nifty500, excess_over_fd } = benchmarkData;

  // Slice time range
  let rawSliced = chart_data;
  if (timeRange === '1M') {
    rawSliced = chart_data.slice(-21);
  } else if (timeRange === '3M') {
    rawSliced = chart_data.slice(-63);
  } else if (timeRange === '6M') {
    rawSliced = chart_data.slice(-126);
  } else if (timeRange === 'YTD') {
    const ytdStart = chart_data.findIndex(d => d.date && d.date.startsWith('2026'));
    rawSliced = ytdStart >= 0 ? chart_data.slice(ytdStart) : chart_data.slice(-150);
  } else if (timeRange === '1Y') {
    rawSliced = chart_data.slice(-252);
  } else if (timeRange === '3Y') {
    rawSliced = chart_data.slice(-756);
  } else if (timeRange === '5Y') {
    rawSliced = chart_data.slice(-1260);
  } else if (timeRange === 'ALL') {
    rawSliced = chart_data;
  }

  const basePoint = rawSliced[0] || {};
  const baseCap = 1000000.0;
  const isRebased = viewMode === 'rebased';

  const filteredData = rawSliced.map((d) => {
    const p0 = basePoint.portfolio || 1;
    const n500_0 = basePoint.nifty_500 || 1;
    const n150_0 = basePoint.nifty_150 || 1;
    const mf_0 = basePoint.mutual_fund || 1;
    const fd_0 = basePoint.fd || 1;

    return {
      date: d.date,
      portfolio: isRebased ? Math.round((d.portfolio / p0) * baseCap) : d.portfolio,
      nifty_500: isRebased ? Math.round((d.nifty_500 / n500_0) * baseCap) : d.nifty_500,
      nifty_150: isRebased ? Math.round((d.nifty_150 / n150_0) * baseCap) : d.nifty_150,
      mutual_fund: isRebased ? Math.round((d.mutual_fund / mf_0) * baseCap) : d.mutual_fund,
      fd: isRebased ? Math.round((d.fd / fd_0) * baseCap) : d.fd,
      portfolio_ret: (((d.portfolio / p0) - 1) * 100).toFixed(2),
      nifty_500_ret: (((d.nifty_500 / n500_0) - 1) * 100).toFixed(2),
      nifty_150_ret: (((d.nifty_150 / n150_0) - 1) * 100).toFixed(2),
      mutual_fund_ret: (((d.mutual_fund / mf_0) - 1) * 100).toFixed(2),
      fd_ret: (((d.fd / fd_0) - 1) * 100).toFixed(2),
    };
  });

  const toggleSeries = (key) => {
    setActiveSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const seriesConfig = [
    { key: 'portfolio', name: 'Your Portfolio', color: '#2563EB', strokeWidth: 2.5 },
    { key: 'nifty_500', name: 'NIFTY 500', color: '#059669', strokeWidth: 1.8 },
    { key: 'nifty_150', name: 'NIFTY 150 Midcap', color: '#D97706', strokeWidth: 1.8 },
    { key: 'mutual_fund', name: 'Flexi-Cap Mutual Fund', color: '#7C3AED', strokeWidth: 1.8 },
    { key: 'fd', name: 'Bank Fixed Deposit (FD)', color: '#64748B', strokeWidth: 1.8 },
  ];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-fintech-card border border-fintech-border p-3.5 rounded-xl shadow-xl text-xs font-mono">
          <div className="text-fintech-textHeading font-bold mb-2 pb-1.5 border-b border-fintech-border flex items-center justify-between gap-4">
            <span>{label}</span>
            <span className="text-[10px] text-fintech-textMuted font-sans">
              {isRebased ? 'Rebased (₹10L Base)' : 'Cumulative NAV'}
            </span>
          </div>
          <div className="space-y-1.5">
            {payload.map((entry, index) => {
              const retKey = `${entry.dataKey}_ret`;
              const retVal = entry.payload && entry.payload[retKey];
              return (
                <div key={index} className="flex items-center justify-between gap-4">
                  <span style={{ color: entry.color }} className="font-medium text-[11px]">{entry.name}:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-fintech-textHeading font-bold tabular-nums">
                      ₹{Number(entry.value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                    {retVal !== undefined && (
                      <span className={`text-[10px] tabular-nums font-bold ${Number(retVal) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        ({Number(retVal) >= 0 ? '+' : ''}{retVal}%)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  // Monthly returns matrix
  const monthlyReturns = [
    { year: 2024, jan: 2.1, feb: -0.8, mar: 1.9, apr: 3.4, may: -1.2, jun: 4.8, jul: 2.5, aug: 0.9, sep: 1.8, oct: 0.4, nov: 1.1, dec: 2.3, ytd: 20.8 },
    { year: 2023, jan: -1.4, feb: -1.1, mar: 1.2, apr: 4.1, may: 2.8, jun: 3.5, jul: 2.9, aug: -0.6, sep: 2.1, oct: -1.8, nov: 5.2, dec: 6.8, ytd: 25.9 },
    { year: 2022, jan: -0.5, feb: -2.3, mar: 3.1, apr: -1.2, may: -2.8, jun: -3.4, jul: 6.8, aug: 3.2, sep: -1.1, oct: 4.2, nov: 3.5, dec: -1.8, ytd: 7.3 },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header & Highlights Banner (Google Finance + Portfolio Visualizer) */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-fintech-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fintech-textMuted font-mono">
                Performance Benchmarking
              </span>
            </div>
            <h2 className="text-lg font-bold text-fintech-textHeading mt-0.5">
              Portfolio vs Indian Market Benchmarks
            </h2>
            <p className="text-xs text-fintech-textMuted mt-0.5">
              Comparing your paper trading execution against Nifty 500, Nifty Midcap 150, Mutual Funds, and Bank FD.
            </p>
          </div>

          {/* Quick alpha badges */}
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-left">
              <div className="text-[10px] text-emerald-800 font-semibold font-mono uppercase">vs NIFTY 500</div>
              <div className="text-base font-bold text-emerald-700 font-mono">
                {excess_over_nifty500 >= 0 ? '+' : ''}{excess_over_nifty500}% p.a.
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-left">
              <div className="text-[10px] text-blue-800 font-semibold font-mono uppercase">vs Bank Fixed Deposit</div>
              <div className="text-base font-bold text-blue-700 font-mono">
                {excess_over_fd >= 0 ? '+' : ''}{excess_over_fd}% p.a.
              </div>
            </div>
          </div>
        </div>

        {/* Time Horizon Pills & Checkbox Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {seriesConfig.map((s) => {
              const active = activeSeries[s.key];
              return (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] transition-all ${
                    active
                      ? 'bg-fintech-subtle border-fintech-border text-fintech-textHeading font-semibold'
                      : 'bg-transparent border-transparent text-fintech-textMuted opacity-60 hover:opacity-100'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: active ? s.color : '#94a3b8' }}
                  />
                  <span>{s.name}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Rebased vs Cumulative */}
            <div className="flex items-center bg-fintech-subtle p-0.5 rounded-lg border border-fintech-border text-xs font-mono">
              <button
                onClick={() => setViewMode('rebased')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                  viewMode === 'rebased'
                    ? 'bg-fintech-card text-blue-600 font-bold shadow-sm border border-fintech-border'
                    : 'text-fintech-textMuted hover:text-fintech-textHeading'
                }`}
                title="Normalize all series to ₹10L base at start of selected window for side-by-side comparison"
              >
                Rebased (₹10L)
              </button>
              <button
                onClick={() => setViewMode('cumulative')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                  viewMode === 'cumulative'
                    ? 'bg-fintech-card text-blue-600 font-bold shadow-sm border border-fintech-border'
                    : 'text-fintech-textMuted hover:text-fintech-textHeading'
                }`}
                title="View actual compounding valuation in ₹ from inception"
              >
                Cumulative (₹)
              </button>
            </div>

            {/* Google Finance Time Range Filter */}
            <div className="flex items-center gap-1 bg-fintech-subtle p-1 rounded-lg border border-fintech-border text-xs font-mono font-medium">
              {['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                    timeRange === range
                      ? 'bg-fintech-card text-blue-600 font-bold shadow-sm border border-fintech-border'
                      : 'text-fintech-textMuted hover:text-fintech-textHeading'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-80 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.4} />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#64748b' }}
                domain={['auto', 'auto']}
                tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
              />
              <Tooltip content={<CustomTooltip />} />
              {seriesConfig.map(
                (s) =>
                  activeSeries[s.key] && (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={s.strokeWidth}
                      dot={false}
                    />
                  )
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Portfolio Visualizer Style Multi-Asset Risk & Return Comparison Table */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl overflow-hidden shadow-fintech-card">
        <div className="px-5 py-3.5 border-b border-fintech-border flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-fintech-textHeading font-mono">
              Quantitative Benchmark Analytics (Portfolio Visualizer Style)
            </h3>
            <p className="text-[11px] text-fintech-textMuted">Risk-adjusted ratios calibrated with Indian Risk-Free Rate = 6.50%</p>
          </div>
          <span className="text-[11px] font-mono text-fintech-textMuted font-medium">Daily Compounding</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-fintech-subtle text-fintech-textMuted uppercase tracking-wider border-b border-fintech-border text-[10px]">
              <tr>
                <th className="py-2.5 px-4 font-bold">Strategy / Benchmark</th>
                <th className="py-2.5 px-4 text-right font-bold">Valuation (₹)</th>
                <th className="py-2.5 px-4 text-right font-bold">Total Ret (%)</th>
                <th className="py-2.5 px-4 text-right font-bold">CAGR (%)</th>
                <th className="py-2.5 px-4 text-right font-bold">Annual Vol (%)</th>
                <th className="py-2.5 px-4 text-right font-bold">Sharpe (Rf 6.5%)</th>
                <th className="py-2.5 px-4 text-right font-bold">Sortino</th>
                <th className="py-2.5 px-4 text-right font-bold">Max Drawdown</th>
                <th className="py-2.5 px-4 text-right font-bold">Beta (β)</th>
                <th className="py-2.5 px-4 text-right font-bold">Alpha (α)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fintech-border">
              {metrics_table.map((row, idx) => (
                <tr key={row.name} className={`hover:bg-fintech-cardHover transition-colors ${idx === 0 ? 'bg-blue-50/30' : ''}`}>
                  <td className="py-3 px-4 font-semibold text-fintech-textHeading flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className={idx === 0 ? 'font-bold text-blue-700' : ''}>{row.name}</span>
                    {idx === 0 && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-sans font-bold">
                        YOU
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-bold text-fintech-textHeading">
                    ₹{row.current_val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-emerald-700">
                    +{row.total_return_pct}%
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-bold text-fintech-textHeading">
                    {row.cagr_pct}%
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-fintech-textBody">
                    {row.volatility_pct}%
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-bold text-fintech-textHeading">
                    {row.sharpe_ratio}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-fintech-textBody">
                    {row.sortino_ratio}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-rose-700">
                    {row.max_drawdown_pct}%
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-fintech-textMuted">
                    {row.beta_nifty500}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-emerald-700">
                    {row.alpha_pct > 0 ? `+${row.alpha_pct}%` : `${row.alpha_pct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Monthly Returns Matrix */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-fintech-border">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-fintech-textHeading font-mono">
              Monthly Returns (%)
            </h3>
            <p className="text-[11px] text-fintech-textMuted">Calendar month performance breakdown</p>
          </div>
          <span className="text-[11px] font-mono text-fintech-textMuted">Point-in-Time Net of Fees</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs font-mono">
            <thead className="bg-fintech-subtle text-fintech-textMuted uppercase text-[10px]">
              <tr>
                <th className="py-2 px-3 text-left font-bold">Year</th>
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => (
                  <th key={m} className="py-2 px-2 font-medium">{m}</th>
                ))}
                <th className="py-2 px-3 font-bold bg-fintech-subtle">Full Year</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fintech-border">
              {monthlyReturns.map((row) => (
                <tr key={row.year} className="hover:bg-fintech-cardHover">
                  <td className="py-2.5 px-3 text-left font-bold text-fintech-textHeading">{row.year}</td>
                  {[
                    row.jan, row.feb, row.mar, row.apr, row.may, row.jun,
                    row.jul, row.aug, row.sep, row.oct, row.nov, row.dec
                  ].map((val, mIdx) => {
                    const isNum = typeof val === 'number';
                    const isPos = isNum && val >= 0;
                    return (
                      <td key={mIdx} className="py-2.5 px-2">
                        {isNum ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                              isPos ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                            }`}
                          >
                            {isPos ? `+${val}` : val}%
                          </span>
                        ) : (
                          <span className="text-fintech-textDim">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 font-bold text-emerald-700 bg-emerald-50/50">
                    +{row.ytd}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
