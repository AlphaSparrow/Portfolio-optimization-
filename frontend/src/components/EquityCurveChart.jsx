import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';

export default function EquityCurveChart({ backtestData }) {
  const [showUnderwater, setShowUnderwater] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState(() => new Set());

  if (!backtestData || !backtestData.equity_curves) {
    return (
      <div className="h-80 flex items-center justify-center text-fintech-textMuted text-xs font-mono border border-fintech-border rounded-xl bg-fintech-card shadow-fintech-card">
        Run Walk-Forward backtest to generate comparative multi-strategy equity curves.
      </div>
    );
  }

  const { dates, equity_curves, drawdowns } = backtestData;

  const chartData = dates.map((date, idx) => {
    const item = { date };
    Object.keys(equity_curves).forEach((strat) => {
      item[strat] = equity_curves[strat][idx];
      if (drawdowns && drawdowns[strat]) {
        item[`${strat}_dd`] = drawdowns[strat][idx];
      }
    });
    return item;
  });

  const colors = {
    'RMT Trend Momentum (Default)': '#059669',
    'Maximum Sharpe': '#2563EB',
    'Minimum Variance': '#059669',
    'Risk Parity': '#0891B2',
    'Hierarchical Risk Parity': '#7C3AED',
    'NSGA-II Multi-Objective': '#9333EA',
    'Genetic Algorithm': '#DB2777',
    'Black-Litterman': '#D97706',
    'Equal Weight': '#475569',
    'NIFTY 500': '#10B981',
    'NIFTY 150 Midcap': '#F59E0B',
    'Bank FD (7.1%)': '#94A3B8',
    'Flexi-Cap Mutual Fund': '#6366F1'
  };

  const toggleSeries = (key) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const showAll = () => setHiddenSeries(new Set());

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const visiblePayload = payload.filter((entry) => !hiddenSeries.has(entry.name));
      if (!visiblePayload.length) return null;

      return (
        <div className="bg-fintech-card border border-fintech-border p-3 rounded-lg shadow-xl text-xs font-mono">
          <div className="text-fintech-textHeading font-bold mb-2 pb-1 border-b border-fintech-border">{label}</div>
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {visiblePayload.map((entry, index) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
                <span className="text-fintech-textHeading font-bold tabular-nums">
                  {showUnderwater ? `${entry.value}%` : `₹${Number(entry.value).toLocaleString('en-IN')}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const activeStrategies = showUnderwater
    ? Object.keys(equity_curves).slice(0, 5)
    : Object.keys(equity_curves);

  return (
    <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fintech-textHeading">
            {showUnderwater ? 'Underwater Drawdown History (%)' : 'Comparative Walk-Forward Growth (₹10,00,000 Base)'}
          </h3>
          <p className="text-[11px] text-fintech-textMuted">Point-in-time walk-forward simulation with Indian taxes & transaction costs (10 bps)</p>
        </div>
        <div className="flex items-center gap-1 bg-fintech-subtle p-1 rounded-lg border border-fintech-border">
          <button
            onClick={() => setShowUnderwater(false)}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
              !showUnderwater ? 'bg-fintech-card text-blue-600 shadow-sm border border-fintech-border' : 'text-fintech-textMuted hover:text-fintech-textHeading'
            }`}
          >
            NAV Curves
          </button>
          <button
            onClick={() => setShowUnderwater(true)}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
              showUnderwater ? 'bg-fintech-card text-blue-600 shadow-sm border border-fintech-border' : 'text-fintech-textMuted hover:text-fintech-textHeading'
            }`}
          >
            Drawdowns
          </button>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {showUnderwater ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                domain={['auto', 0]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              {activeStrategies.map((strat) => (
                <Area
                  key={`${strat}_dd`}
                  type="monotone"
                  dataKey={`${strat}_dd`}
                  name={strat}
                  stroke={colors[strat] || '#2563EB'}
                  fill={colors[strat] || '#2563EB'}
                  fillOpacity={0.15}
                  hide={hiddenSeries.has(strat)}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
              {activeStrategies.map((strat) => (
                <Line
                  key={strat}
                  type="monotone"
                  dataKey={strat}
                  name={strat}
                  stroke={colors[strat] || '#64748b'}
                  strokeWidth={strat.includes('Sharpe') || strat.includes('NSGA') ? 2.5 : 1.5}
                  dot={false}
                  hide={hiddenSeries.has(strat)}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Interactive Legend: Click to toggle curves */}
      <div className="pt-3 mt-3 border-t border-fintech-border/50">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] uppercase font-bold text-fintech-textMuted tracking-wider font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Click below to hide / show any curve
          </span>
          {hiddenSeries.size > 0 && (
            <button
              type="button"
              onClick={showAll}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold cursor-pointer underline underline-offset-2"
            >
              Show All ({hiddenSeries.size} hidden)
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {activeStrategies.map((strat) => {
            const isHidden = hiddenSeries.has(strat);
            const color = colors[strat] || '#64748b';
            return (
              <button
                key={strat}
                type="button"
                onClick={() => toggleSeries(strat)}
                title={isHidden ? `Click to show ${strat}` : `Click to hide ${strat}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-all border cursor-pointer select-none ${
                  isHidden
                    ? 'bg-fintech-subtle/40 text-fintech-textMuted/40 border-dashed border-fintech-border line-through opacity-40 hover:opacity-75'
                    : 'bg-fintech-subtle text-fintech-textHeading border-fintech-border hover:bg-fintech-card hover:border-blue-400/80 shadow-2xs font-medium'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0 transition-all"
                  style={{ backgroundColor: isHidden ? '#cbd5e1' : color }}
                />
                <span className="truncate max-w-[170px]">{strat}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
