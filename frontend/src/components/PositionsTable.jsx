import React from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';

export default function PositionsTable({ holdings = [], onTradeClick }) {
  if (!holdings || holdings.length === 0) {
    return (
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-8 text-center shadow-fintech-card">
        <TrendingUp className="w-8 h-8 text-fintech-textMuted mx-auto mb-2 opacity-50" />
        <p className="text-fintech-textHeading text-xs font-semibold">No open positions in portfolio ledger.</p>
        <p className="text-[11px] text-fintech-textMuted mt-1">Deploy an optimizer target allocation or submit an order to initialize holdings.</p>
      </div>
    );
  }

  return (
    <div className="bg-fintech-card border border-fintech-border rounded-xl overflow-hidden shadow-fintech-card">
      <div className="px-4 py-3 border-b border-fintech-border flex items-center justify-between bg-fintech-card">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fintech-textHeading">Portfolio Holdings</h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-fintech-subtle text-fintech-textMuted border border-fintech-border">
            {holdings.length} Assets Active
          </span>
        </div>
        <span className="text-[11px] text-fintech-textMuted font-mono">Live Mark-to-Market</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-fintech-subtle text-fintech-textMuted uppercase tracking-wider border-b border-fintech-border text-[10px]">
            <tr>
              <th className="py-2.5 px-4 font-semibold">Instrument</th>
              <th className="py-2.5 px-4 text-right font-semibold">Shares</th>
              <th className="py-2.5 px-4 text-right font-semibold">Avg Cost</th>
              <th className="py-2.5 px-4 text-right font-semibold">LTP (₹)</th>
              <th className="py-2.5 px-4 text-right font-semibold">Value (₹)</th>
              <th className="py-2.5 px-4 text-right font-semibold">Unrealized P&L</th>
              <th className="py-2.5 px-4 text-right font-semibold">Weight</th>
              <th className="py-2.5 px-4 text-center font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fintech-border">
            {holdings.map((pos) => {
              const isProfit = pos.unrealized_pnl >= 0;
              return (
                <tr key={pos.symbol} className="hover:bg-fintech-cardHover transition-colors">
                  <td className="py-2.5 px-4 font-semibold text-fintech-textHeading">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{pos.symbol.replace('.NS', '')}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-fintech-subtle text-fintech-textMuted border border-fintech-border font-sans">
                        EQ
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-fintech-textBody">
                    {pos.shares}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-fintech-textMuted">
                    ₹{pos.avg_price?.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-fintech-textHeading">
                    ₹{pos.current_price?.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-fintech-textHeading">
                    ₹{pos.market_value?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
                        isProfit 
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                          : 'text-rose-700 bg-rose-50 border-rose-200'
                      }`}
                    >
                      {isProfit ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      ₹{Math.abs(pos.unrealized_pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({pos.unrealized_pnl_pct}%)
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-fintech-textBody font-medium">
                    {(pos.weight * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <button
                      onClick={() => onTradeClick && onTradeClick(pos.symbol)}
                      className="px-2.5 py-1 rounded bg-fintech-subtle hover:bg-blue-600 hover:text-white text-fintech-textMuted border border-fintech-border hover:border-blue-600 transition-all text-[11px] font-medium"
                    >
                      Trade
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
