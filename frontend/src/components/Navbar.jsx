import React from 'react';
import { Activity, Sliders, TrendingUp, BarChart3, Radio } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'dashboard', label: 'Paper Portfolio', icon: Activity },
    { id: 'optimizer', label: 'Optimizer & Research', icon: Sliders },
    { id: 'backtest', label: 'Walk-Forward Backtest', icon: TrendingUp },
    { id: 'analytics', label: 'Risk & Attribution', icon: BarChart3 },
    { id: 'upstox', label: 'Live Paper Trading', icon: Radio },
  ];

  return (
    <header className="border-b border-fintech-border bg-fintech-card sticky top-0 z-50">
      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
        {/* Brand */}
        <div className="shrink-0">
          <span className="font-bold text-base tracking-tight text-fintech-textHeading font-sans">
            Portfolio Optimizer
          </span>
        </div>

        {/* Center-Shifted Navigation Tabs */}
        <div className="flex-1 flex justify-center">
          <nav className="flex items-center gap-1 bg-fintech-subtle p-1 rounded-xl border border-fintech-border shadow-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-fintech-card text-blue-600 font-semibold shadow-sm border border-fintech-border'
                      : 'text-fintech-textMuted hover:text-fintech-textHeading hover:bg-fintech-card/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-fintech-textMuted'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right balance spacer to visually center the nav box */}
        <div className="hidden lg:block shrink-0 w-[140px]" />
      </div>
    </header>
  );
}
