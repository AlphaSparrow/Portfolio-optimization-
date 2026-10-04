import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function AllocationDonut({ weights = {}, sectorAllocations = {} }) {
  const [viewMode, setViewMode] = useState('assets'); // 'assets' | 'sectors'

  const COLORS = [
    '#2563EB', '#059669', '#D97706', '#7C3AED', '#0891B2',
    '#DC2626', '#4F46E5', '#16A34A', '#CA8A04', '#9333EA',
    '#64748B', '#0284C7'
  ];

  const assetData = Object.entries(weights)
    .filter(([_, w]) => w > 0.005)
    .map(([symbol, weight]) => ({
      name: symbol.replace('.NS', ''),
      value: Math.round(weight * 1000) / 10
    }))
    .sort((a, b) => b.value - a.value);

  const sectorData = Object.entries(sectorAllocations)
    .filter(([_, w]) => w > 0.005)
    .map(([sector, weight]) => ({
      name: sector,
      value: Math.round(weight * 1000) / 10
    }))
    .sort((a, b) => b.value - a.value);

  const displayData = viewMode === 'assets' ? assetData : sectorData;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-fintech-card border border-fintech-border p-2.5 rounded-lg shadow-xl text-xs font-mono">
          <div className="text-fintech-textHeading font-bold">{data.name}</div>
          <div className="text-blue-600 font-semibold">{data.value}% allocation</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fintech-textHeading">Target Allocation</h3>
          <p className="text-[11px] text-fintech-textMuted">Active asset and sector weights</p>
        </div>
        <div className="flex items-center gap-1 bg-fintech-subtle p-1 rounded-lg border border-fintech-border">
          <button
            onClick={() => setViewMode('assets')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
              viewMode === 'assets' ? 'bg-fintech-card text-blue-600 shadow-sm border border-fintech-border' : 'text-fintech-textMuted hover:text-fintech-textHeading'
            }`}
          >
            Assets
          </button>
          <button
            onClick={() => setViewMode('sectors')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
              viewMode === 'sectors' ? 'bg-fintech-card text-blue-600 shadow-sm border border-fintech-border' : 'text-fintech-textMuted hover:text-fintech-textHeading'
            }`}
          >
            Sectors
          </button>
        </div>
      </div>

      {displayData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-fintech-textMuted text-xs font-mono">
          No active allocations to display.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Donut Chart */}
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomTooltip />} />
                <Pie
                  data={displayData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {displayData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Allocation Legend List */}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {displayData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 truncate pr-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-fintech-textBody truncate font-medium">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-fintech-subtle rounded-full overflow-hidden border border-fintech-border">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(item.value * 2, 100)}%`,
                        backgroundColor: COLORS[index % COLORS.length]
                      }}
                    />
                  </div>
                  <span className="text-fintech-textHeading font-semibold w-12 text-right tabular-nums">{item.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
