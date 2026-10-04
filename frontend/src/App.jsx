import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Optimizer from './pages/Optimizer';
import Backtest from './pages/Backtest';
import Analytics from './pages/Analytics';
import UpstoxConnect from './pages/UpstoxConnect';
import { getUpstoxStatus, getPortfolioState } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return sessionStorage.getItem('quant_active_tab') || 'dashboard';
  });
  const [upstoxStatus, setUpstoxStatus] = useState(null);
  const [portfolioNav, setPortfolioNav] = useState(1000000);
  const [portfolioRefreshTrigger, setPortfolioRefreshTrigger] = useState(0);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem('quant_active_tab', tab);
    } catch (e) {
      console.warn('Could not save active tab:', e);
    }
  };

  const refreshGlobalState = async () => {
    try {
      const [uStatus, pState] = await Promise.all([
        getUpstoxStatus().catch(() => null),
        getPortfolioState().catch(() => null),
      ]);
      if (uStatus) setUpstoxStatus(uStatus);
      if (pState?.portfolio?.nav) setPortfolioNav(pState.portfolio.nav);
    } catch (err) {
      console.error('Failed to sync global state:', err);
    }
  };

  const handleRebalanceComplete = () => {
    setPortfolioRefreshTrigger((prev) => prev + 1);
    refreshGlobalState();
  };

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'SUCCESS' || window.location.pathname.includes('upstox')) {
      handleTabChange('upstox');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    refreshGlobalState();
    const interval = setInterval(refreshGlobalState, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-fintech-bg text-fintech-textBody flex flex-col font-sans selection:bg-blue-500/20">
      {/* Top Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        upstoxStatus={upstoxStatus}
        portfolioNav={portfolioNav}
      />

      {/* Main Content Area - Preserving component state across all sections */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 animate-fade-in">
        <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
          <Dashboard
            setActiveTab={handleTabChange}
            upstoxStatus={upstoxStatus}
            refreshTrigger={portfolioRefreshTrigger}
          />
        </div>
        <div style={{ display: activeTab === 'optimizer' ? 'block' : 'none' }}>
          <Optimizer
            setActiveTab={handleTabChange}
            onRebalanceDone={handleRebalanceComplete}
          />
        </div>
        <div style={{ display: activeTab === 'backtest' ? 'block' : 'none' }}>
          <Backtest />
        </div>
        <div style={{ display: activeTab === 'analytics' ? 'block' : 'none' }}>
          <Analytics />
        </div>
        <div style={{ display: activeTab === 'upstox' ? 'block' : 'none' }}>
          <UpstoxConnect
            onStatusChange={refreshGlobalState}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-fintech-border bg-fintech-card/90 py-3.5 px-6 text-xs text-fintech-textMuted font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-fintech-textHeading font-medium">Portfolio Optimizer</span>
            <span>|</span>
            <span>NSE Universe • Benchmark Suite (Nifty 500, Nifty 150, FD, Mutual Funds)</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-fintech-textDim">
            <span>Rf: <strong className="text-fintech-textHeading">6.50%</strong></span>
            <span>Microstructure Impact: <strong className="text-emerald-600">Active</strong></span>
            <span>Multi-Objective Models: <strong className="text-purple-600">6 Active</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
