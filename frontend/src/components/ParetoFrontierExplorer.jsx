import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';
import { Sparkles, Layers, Sliders, ArrowUpRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { getParetoFrontier } from '../api';

export default function ParetoFrontierExplorer({ selectedSymbols, covariance }) {
  const [loading, setLoading] = useState(false);
  const [frontierPoints, setFrontierPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [activeObjectiveX, setActiveObjectiveX] = useState('cvar_95'); // 'cvar_95' | 'volatility' | 'turnover'
  const [activeObjectiveY, setActiveObjectiveY] = useState('return');

  const loadFrontier = async () => {
    setLoading(true);
    try {
      const res = await getParetoFrontier(selectedSymbols, covariance);
      if (res?.points) {
        setFrontierPoints(res.points);
        if (res.points.length > 0) {
          setSelectedPoint(res.points[Math.floor(res.points.length / 2)]);
        }
      }
    } catch (err) {
      console.error('Failed to load Pareto frontier:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFrontier();
  }, [covariance]);

  const chartData = frontierPoints.map((p, idx) => ({
    id: idx,
    return: Math.round(p.return * 1000) / 10,
    volatility: Math.round(p.volatility * 1000) / 10,
    cvar_95: Math.round(p.cvar_95 * 1000) / 10,
    turnover: Math.round(p.turnover * 1000) / 10,
    diversification: Math.round(p.diversification_hhi * 1000) / 10,
    sharpe: p.sharpe_ratio,
    weights: p.weights
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-fintech-card border border-fintech-border p-3 rounded-xl shadow-xl text-xs font-mono">
          <div className="font-bold text-fintech-textHeading mb-1 pb-1 border-b border-fintech-border flex items-center justify-between gap-4">
            <span>Pareto Solution #{d.id + 1}</span>
            <span className="text-emerald-700 font-bold">Sharpe: {d.sharpe}</span>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between gap-3">
              <span className="text-fintech-textMuted">Expected Return:</span>
              <span className="font-bold text-emerald-700">+{d.return}%</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-fintech-textMuted">95% CVaR (Tail Risk):</span>
              <span className="font-bold text-rose-700">{d.cvar_95}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-fintech-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 font-mono">
              Multi-Objective Pareto Suite
            </span>
            <span className="text-xs text-fintech-textMuted font-mono">2-Objective Frontier</span>
          </div>
          <h3 className="text-sm font-bold text-fintech-textHeading mt-1">
            Pareto Frontier Explorer (Expected Return ↑ | CVaR ↓)
          </h3>
        </div>

        <button
          onClick={loadFrontier}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fintech-subtle hover:bg-fintech-card border border-fintech-border text-xs font-semibold text-fintech-textHeading transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh Frontier</span>
        </button>
      </div>

      {/* Axis Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-fintech-textMuted">Horizontal Axis (Risk Metric):</span>
          <div className="flex items-center gap-1 bg-fintech-subtle p-1 rounded-lg border border-fintech-border">
            {[
              { id: 'cvar_95', label: '95% CVaR' },
              { id: 'volatility', label: 'Volatility' }
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setActiveObjectiveX(btn.id)}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                  activeObjectiveX === btn.id
                    ? 'bg-fintech-card text-purple-700 shadow-sm border border-fintech-border'
                    : 'text-fintech-textMuted hover:text-fintech-textHeading'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-fintech-textMuted font-sans">
          Click any point to inspect candidate portfolio allocation
        </div>
      </div>

      {/* Scatter Chart & Point Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Scatter Chart (8 cols) */}
        <div className="lg:col-span-8 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.4} />
              <XAxis
                type="number"
                dataKey={activeObjectiveX}
                name={activeObjectiveX === 'cvar_95' ? 'CVaR 95% (%)' : activeObjectiveX}
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                unit="%"
              />
              <YAxis
                type="number"
                dataKey="return"
                name="Expected Return (%)"
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                unit="%"
              />
              <Tooltip content={<CustomTooltip />} />
              <Scatter
                data={chartData}
                onClick={(node) => setSelectedPoint(node.payload)}
                cursor="pointer"
              >
                {chartData.map((entry) => (
                  <Cell
                    key={`cell-${entry.id}`}
                    fill={selectedPoint?.id === entry.id ? '#2563EB' : '#7C3AED'}
                    stroke={selectedPoint?.id === entry.id ? '#0f172a' : '#ffffff'}
                    strokeWidth={selectedPoint?.id === entry.id ? 2 : 1}
                    r={selectedPoint?.id === entry.id ? 7 : 5}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Selected Point Inspection Panel (4 cols) */}
        <div className="lg:col-span-4 bg-fintech-subtle border border-fintech-border rounded-xl p-4 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-fintech-border">
            <span className="font-bold text-fintech-textHeading">
              {selectedPoint ? `Pareto Point #${selectedPoint.id + 1}` : 'Selected Solution'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
              NON-DOMINATED
            </span>
          </div>

          {selectedPoint ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="bg-fintech-card p-2 rounded-lg border border-fintech-border">
                  <span className="text-fintech-textMuted text-[10px] block">Return</span>
                  <span className="font-bold text-emerald-700">+{selectedPoint.return}%</span>
                </div>
                <div className="bg-fintech-card p-2 rounded-lg border border-fintech-border">
                  <span className="text-fintech-textMuted text-[10px] block">95% CVaR</span>
                  <span className="font-bold text-rose-700">{selectedPoint.cvar_95}%</span>
                </div>
                <div className="bg-fintech-card p-2 rounded-lg border border-fintech-border">
                  <span className="text-fintech-textMuted text-[10px] block">Sharpe</span>
                  <span className="font-bold text-blue-700">{selectedPoint.sharpe}</span>
                </div>
              </div>

              {/* Top weights in this solution */}
              <div>
                <span className="text-[10px] uppercase font-bold text-fintech-textMuted block mb-1">
                  Candidate Allocation Weights
                </span>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {selectedPoint.weights &&
                    Object.entries(selectedPoint.weights)
                      .filter(([_, w]) => w > 0.01)
                      .sort(([_, a], [__, b]) => b - a)
                      .map(([sym, w]) => (
                        <div key={sym} className="flex justify-between items-center text-[11px]">
                          <span className="font-semibold text-fintech-textHeading">{sym.replace('.NS', '')}</span>
                          <span className="font-bold text-blue-700">{(w * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-fintech-textMuted text-xs">
              Click a point on the chart to inspect candidate allocation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
