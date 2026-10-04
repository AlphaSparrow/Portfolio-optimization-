import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function StatCard({
  title,
  value,
  subValue,
  change,
  isPositive,
  icon: Icon,
  suffix = '',
  prefix = ''
}) {
  return (
    <div className="bg-fintech-card border border-fintech-border rounded-xl p-4.5 flex flex-col justify-between shadow-fintech-card hover:border-blue-400/50 hover:shadow-fintech-hover transition-all duration-200">
      <div className="flex items-center justify-between text-fintech-textMuted mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className="w-7 h-7 rounded-lg bg-fintech-subtle flex items-center justify-center border border-fintech-border">
            <Icon className="w-3.5 h-3.5 text-fintech-textMuted" />
          </div>
        )}
      </div>

      <div className="my-1">
        <div className="text-2xl font-bold font-mono text-fintech-textHeading tracking-tight tabular-nums">
          {prefix}{value}{suffix}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-fintech-border text-xs">
        {change !== undefined ? (() => {
          const rawNum = typeof change === 'number' ? change : parseFloat(String(change || '0').replace(/^[+-]/, ''));
          const absVal = isNaN(rawNum) ? '0.00' : Math.abs(rawNum).toFixed(2);
          const positive = isPositive !== undefined ? isPositive : rawNum >= 0;
          return (
            <div
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                positive 
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                  : 'text-rose-700 bg-rose-50 border-rose-200'
              }`}
            >
              {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{positive ? '+' : '-'}{absVal}%</span>
            </div>
          );
        })() : (
          <span className="text-[11px] font-mono text-fintech-textMuted">{subValue}</span>
        )}
        {subValue && change !== undefined && (
          <span className="text-[11px] font-mono text-fintech-textMuted">{subValue}</span>
        )}
      </div>
    </div>
  );
}
