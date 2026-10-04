import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceDot
} from 'recharts';

export default function EfficientFrontierChart({ frontierData, paretoPoints }) {
  if (!frontierData || !frontierData.frontier_curve) {
    return (
      <div className="h-80 flex items-center justify-center text-fintech-textMuted text-xs font-mono border border-fintech-border rounded-xl bg-fintech-card shadow-fintech-card">
        Run optimization to plot the Markowitz & Pareto Frontiers.
      </div>
    );
  }

  const {
    frontier_curve,
    capital_allocation_line,
    minimum_variance_portfolio,
    tangency_portfolio,
    individual_assets,
    risk_free_rate
  } = frontierData;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-fintech-card border border-fintech-border p-3 rounded-lg shadow-xl text-xs font-mono">
          {data.symbol && <div className="text-fintech-textHeading font-bold mb-1">{data.symbol}</div>}
          <div className="text-fintech-textMuted">Volatility (Risk): <span className="text-fintech-textHeading font-bold">{data.volatility}%</span></div>
          <div className="text-fintech-textMuted">Expected Return: <span className="text-emerald-600 font-bold">+{data.expected_return}%</span></div>
          {data.sharpe !== undefined && (
            <div className="text-fintech-textMuted">Sharpe Ratio: <span className="text-blue-600 font-bold">{data.sharpe}</span></div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-fintech-textHeading font-mono">
            Efficient Frontier & Capital Allocation Line (CAL)
          </h3>
          <p className="text-[11px] text-fintech-textMuted">Risk-return trade-off curve with Indian Rf = {risk_free_rate}%</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span className="text-fintech-textMuted">Min Variance ({minimum_variance_portfolio?.volatility}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <span className="text-fintech-textMuted">Tangency ({tangency_portfolio?.volatility}%)</span>
          </div>
        </div>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" strokeOpacity={0.4} />
            <XAxis
              type="number"
              dataKey="volatility"
              name="Volatility (%)"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
              domain={['auto', 'auto']}
              unit="%"
            />
            <YAxis
              type="number"
              dataKey="expected_return"
              name="Return (%)"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
              domain={['auto', 'auto']}
              unit="%"
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Capital Allocation Line */}
            <Line
              data={capital_allocation_line}
              dataKey="expected_return"
              stroke="#2563EB"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="Capital Allocation Line"
            />

            {/* Efficient Frontier Curve */}
            <Line
              data={frontier_curve}
              dataKey="expected_return"
              stroke="#059669"
              strokeWidth={2.5}
              dot={false}
              name="Efficient Frontier"
            />

            {/* Individual Assets */}
            <Scatter
              data={individual_assets}
              dataKey="expected_return"
              fill="#D97706"
              name="NSE Universe Assets"
            />

            {/* Minimum Variance Dot */}
            {minimum_variance_portfolio && (
              <ReferenceDot
                x={minimum_variance_portfolio.volatility}
                y={minimum_variance_portfolio.expected_return}
                r={6}
                fill="#059669"
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}

            {/* Tangency Portfolio Dot */}
            {tangency_portfolio && (
              <ReferenceDot
                x={tangency_portfolio.volatility}
                y={tangency_portfolio.expected_return}
                r={6}
                fill="#2563EB"
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
