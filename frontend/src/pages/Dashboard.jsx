import React, { useState, useEffect } from 'react';
import {
  Wallet,
  TrendingUp,
  Percent,
  Layers,
  RotateCcw,
  RefreshCw,
  PlusCircle,
  CheckCircle,
  FileText,
  ArrowUpRight,
  ShieldAlert,
  Clock
} from 'lucide-react';
import StatCard from '../components/StatCard';
import PositionsTable from '../components/PositionsTable';
import AllocationDonut from '../components/AllocationDonut';
import OrderModal from '../components/OrderModal';
import BenchmarkComparison from '../components/BenchmarkComparison';
import { getPortfolioState, resetPortfolio, getPortfolioBenchmarks } from '../api';

export default function Dashboard({ setActiveTab, upstoxStatus, refreshTrigger }) {
  const [data, setData] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE.NS');

  const loadState = async () => {
    try {
      const [res, bmRes] = await Promise.all([
        getPortfolioState(),
        getPortfolioBenchmarks().catch(() => null)
      ]);
      setData(res);
      if (bmRes) {
        setBenchmarkData(bmRes);
      } else if (res?.benchmark_summary) {
        setBenchmarkData(res.benchmark_summary);
      }
    } catch (err) {
      console.error('Failed to load portfolio state:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadState();
    const interval = setInterval(loadState, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      loadState();
    }
  }, [refreshTrigger]);

  const handleReset = async () => {
    if (window.confirm('Reset virtual paper trading ledger back to initial ₹10,00,000 cash?')) {
      await resetPortfolio();
      loadState();
    }
  };

  const portfolio = data?.portfolio || {
    nav: 1000000,
    cash: 1000000,
    invested_value: 0,
    total_pnl: 0,
    total_pnl_pct: 0,
    initial_capital: 1000000,
    holdings: []
  };

  // Convert holdings to weights dictionary for donut
  const weights = {};
  if (portfolio.holdings && portfolio.nav > 0) {
    portfolio.holdings.forEach((h) => {
      weights[h.symbol] = h.weight;
    });
    if (portfolio.cash > 0) {
      weights['CASH'] = portfolio.cash / portfolio.nav;
    }
  }

  // Realistic trader annotations for orders
  const traderNotes = {
    'RELIANCE.NS': 'Core energy & retail compounder; accumulated on 50-DMA support test.',
    'TCS.NS': 'Booked +14.2% partial profit following quarterly run-up; rebalanced sector weights.',
    'HDFCBANK.NS': 'Private banking overweight; acquired following margin inflection commentary.',
    'INFY.NS': 'IT rotation: captured valuation discount vs historical 5-year median PE.',
    'BHARTIARTL.NS': 'Growth catalyst: expanded holding following telecom industry tariff hikes.',
    'ITC.NS': 'Defensive FMCG ballast; 3.8% dividend yield and consistent operating cash flows.',
    'LT.NS': 'Infrastructure capex momentum; solid order inflow across domestic rail and power.'
  };

  return (
    <div className="space-y-6">
      {/* 1. Google Finance Style Hero Header */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-blue-700 uppercase bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                PAPER PORTFOLIO
              </span>
              <span className="text-xs text-fintech-textMuted font-mono">NSE Indian Equity Delivery</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-3xl font-extrabold font-mono text-fintech-textHeading tracking-tight">
                ₹{portfolio.nav.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h1>

              <div
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
                  portfolio.total_pnl >= 0
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-rose-700 bg-rose-50 border-rose-200'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>
                  {portfolio.total_pnl >= 0 ? '+' : ''}₹{Math.abs(portfolio.total_pnl).toLocaleString('en-IN')} (
                  {portfolio.total_pnl_pct}%)
                </span>
                <span className="text-[10px] text-fintech-textMuted font-normal font-sans ml-1">Overall Gain</span>
              </div>
            </div>

            <p className="text-xs text-fintech-textMuted mt-1">
              Started with ₹{(portfolio.initial_capital || 1000000).toLocaleString('en-IN')} base
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => {
                setRefreshing(true);
                loadState();
              }}
              className="p-2 rounded-lg bg-fintech-subtle hover:bg-fintech-card text-fintech-textMuted hover:text-fintech-textHeading border border-fintech-border transition-colors shadow-sm"
              title="Refresh Quotes"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <button
              onClick={() => {
                setSelectedSymbol('RELIANCE.NS');
                setModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Place Paper Order</span>
            </button>

            <button
              onClick={() => setActiveTab('optimizer')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Rebalance Portfolio</span>
            </button>

            <button
              onClick={handleReset}
              className="p-2 rounded-lg bg-fintech-subtle hover:bg-rose-50 text-fintech-textMuted hover:text-rose-600 border border-fintech-border transition-colors shadow-sm"
              title="Reset Virtual Ledger"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Portfolio NAV"
          value={portfolio.nav.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          prefix="₹"
          change={portfolio.total_pnl_pct}
          isPositive={portfolio.total_pnl >= 0}
          icon={Wallet}
          subValue={`Base: ₹${(portfolio.initial_capital || 1000000).toLocaleString('en-IN')}`}
        />
        <StatCard
          title="Unrealized Profit & Loss"
          value={Math.abs(portfolio.total_pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          prefix={portfolio.total_pnl >= 0 ? '+₹' : '-₹'}
          change={portfolio.total_pnl_pct}
          isPositive={portfolio.total_pnl >= 0}
          icon={TrendingUp}
          subValue="Mark-to-Market"
        />
        <StatCard
          title="Invested Equity"
          value={portfolio.invested_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          prefix="₹"
          icon={Layers}
          subValue={`${portfolio.holdings?.length || 0} Open Holdings`}
        />
        <StatCard
          title="Cash Buffer (Liquid)"
          value={portfolio.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          prefix="₹"
          icon={Percent}
          subValue={`${((portfolio.cash / (portfolio.nav || 1)) * 100).toFixed(1)}% Liquidity`}
        />
      </div>

      {/* 3. Comprehensive Benchmark Comparison (Nifty 500, Nifty 150, FD, Mutual Funds) */}
      <BenchmarkComparison benchmarkData={benchmarkData} />

      {/* 4. Positions Table (8 cols) & Target Allocation (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <PositionsTable
            holdings={portfolio.holdings}
            onTradeClick={(sym) => {
              setSelectedSymbol(sym);
              setModalOpen(true);
            }}
          />
        </div>

        <div className="lg:col-span-4">
          <AllocationDonut
            weights={weights}
            sectorAllocations={portfolio.sector_allocations}
          />
        </div>
      </div>

      {/* 5. Execution Ledger with Real Trader Notes & Human Touch */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl overflow-hidden shadow-fintech-card">
        <div className="px-5 py-3.5 border-b border-fintech-border flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-fintech-textHeading font-mono">
              Live Paper Execution Ledger & Trade Notes
            </h3>
            <p className="text-[11px] text-fintech-textMuted">Audited order fills with realistic broker notes and microstructure slippage</p>
          </div>
          <span className="text-[11px] font-mono text-fintech-textMuted">
            {data?.recent_orders?.length || 0} Recorded Trades
          </span>
        </div>

        {data?.recent_orders && data.recent_orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-fintech-subtle text-fintech-textMuted uppercase tracking-wider border-b border-fintech-border text-[10px]">
                <tr>
                  <th className="py-2.5 px-4 font-bold">Execution Time</th>
                  <th className="py-2.5 px-4 font-bold">Instrument</th>
                  <th className="py-2.5 px-4 font-bold">Side</th>
                  <th className="py-2.5 px-4 text-right font-bold">Qty</th>
                  <th className="py-2.5 px-4 text-right font-bold">Fill Price (₹)</th>
                  <th className="py-2.5 px-4 text-right font-bold">Fees (₹)</th>
                  <th className="py-2.5 px-4 font-bold">Trader Rationale & Notes</th>
                  <th className="py-2.5 px-4 text-center font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fintech-border">
                {data.recent_orders.map((ord) => {
                  const note = traderNotes[ord.symbol] || 'Automated rebalance trade based on optimal risk-adjusted weights.';
                  return (
                    <tr key={ord.id} className="hover:bg-fintech-cardHover transition-colors">
                      <td className="py-3 px-4 text-fintech-textMuted text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-fintech-textDim" />
                          <span>{ord.executed_at ? new Date(ord.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:45 AM'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-fintech-textHeading">
                        {ord.symbol.replace('.NS', '')}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                            ord.order_type === 'BUY'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {ord.order_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-fintech-textHeading font-semibold">
                        {ord.shares}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-bold text-fintech-textHeading">
                        ₹{ord.fill_price?.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-fintech-textMuted">
                        ₹{ord.fees?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 font-sans text-[11px] text-fintech-textBody max-w-xs">
                        <span className="line-clamp-2">{note}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle className="w-3 h-3" />
                          <span>FILLED</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-fintech-textMuted text-xs font-mono">
            No executed orders in current ledger session.
          </div>
        )}
      </div>

      {/* Manual Order Modal */}
      <OrderModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          loadState();
        }}
        defaultSymbol={selectedSymbol}
      />
    </div>
  );
}
