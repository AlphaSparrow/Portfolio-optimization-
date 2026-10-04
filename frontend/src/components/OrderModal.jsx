import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { placeManualOrder } from '../api';

export default function OrderModal({ isOpen, onClose, defaultSymbol = 'RELIANCE.NS', onOrderSuccess }) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [orderType, setOrderType] = useState('BUY');
  const [shares, setShares] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await placeManualOrder({
        symbol,
        order_type: orderType,
        shares: Number(shares)
      });
      if (res.status === 'FILLED') {
        setSuccessMsg(`Filled ${shares} shares of ${symbol} at ₹${res.fill_price}. Fees: ₹${res.fees?.total_fees}`);
        if (onOrderSuccess) onOrderSuccess();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(res.reason || 'Order execution failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-fintech-card border border-fintech-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between pb-4 border-b border-fintech-border">
          <div>
            <h3 className="font-bold text-fintech-textHeading text-base">Execute Paper Order</h3>
            <p className="text-xs text-fintech-textMuted">Simulated trade with statutory fees and slippage</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-fintech-subtle text-fintech-textMuted hover:text-fintech-textHeading transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 font-mono text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-fintech-textMuted uppercase mb-1 font-semibold">Instrument</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-fintech-textHeading font-semibold focus:border-blue-500 outline-none"
              placeholder="e.g. RELIANCE.NS"
              required
            />
          </div>

          <div>
            <label className="block text-fintech-textMuted uppercase mb-1 font-semibold">Order Side</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderType('BUY')}
                className={`py-2 rounded-lg font-bold transition-all ${
                  orderType === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-fintech-subtle text-fintech-textMuted border border-fintech-border hover:text-fintech-textHeading'
                }`}
              >
                BUY / DELIV
              </button>
              <button
                type="button"
                onClick={() => setOrderType('SELL')}
                className={`py-2 rounded-lg font-bold transition-all ${
                  orderType === 'SELL'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-fintech-subtle text-fintech-textMuted border border-fintech-border hover:text-fintech-textHeading'
                }`}
              >
                SELL / EXIT
              </button>
            </div>
          </div>

          <div>
            <label className="block text-fintech-textMuted uppercase mb-1 font-semibold">Quantity (Shares)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-fintech-textHeading font-semibold focus:border-blue-500 outline-none"
              required
            />
          </div>

          <div className="p-3 rounded-lg bg-fintech-subtle border border-fintech-border text-[11px] text-fintech-textMuted space-y-1">
            <div className="flex justify-between">
              <span>Brokerage:</span>
              <span>min(0.03%, ₹20)</span>
            </div>
            <div className="flex justify-between">
              <span>STT / CTT:</span>
              <span>0.1% on sell</span>
            </div>
            <div className="flex justify-between">
              <span>Market Impact:</span>
              <span>Square-Root Law applied</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-sm disabled:opacity-50"
          >
            {loading ? 'Routing Order...' : `Confirm ${orderType} Order`}
          </button>
        </form>
      </div>
    </div>
  );
}
