import React, { useState, useEffect } from 'react';
import {
  Radio,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  HelpCircle,
  KeyRound,
  ShieldAlert,
  Terminal,
  LogOut,
  Zap
} from 'lucide-react';
import { getUpstoxStatus, updateUpstoxConfig, setDirectUpstoxToken, disconnectUpstox } from '../api';

export default function UpstoxConnect({ onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState(
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/upstox/callback`
      : 'http://localhost:8000/api/upstox/callback'
  );
  const [manualCode, setManualCode] = useState('');
  const [directToken, setDirectToken] = useState('');
  const [directUserId, setDirectUserId] = useState('');
  const [activatingToken, setActivatingToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await getUpstoxStatus();
      setStatus(res);
      if (res.redirect_uri) setRedirectUri(res.redirect_uri);
      if (res.api_key) setApiKey(res.api_key);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleCopyUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMsg(null);

    try {
      await updateUpstoxConfig({
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
        redirect_uri: redirectUri.trim()
      });
      setMsg('Upstox API credentials saved successfully.');
      loadStatus();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      setError(err.message || 'Failed to update credentials');
    } finally {
      setSaving(false);
    }
  };

  const handleExchangeManualCode = (e) => {
    e.preventDefault();
    if (!manualCode) return;
    window.location.href = `/api/upstox/callback?code=${manualCode.trim()}`;
  };

  const handleActivateDirectToken = async (e) => {
    e.preventDefault();
    if (!directToken.trim()) return;
    setActivatingToken(true);
    setError(null);
    setMsg(null);
    try {
      const res = await setDirectUpstoxToken({
        access_token: directToken.trim(),
        user_id: directUserId.trim() || 'upstox_trader'
      });
      setMsg(res.message || 'Direct Access Token activated! Live Mode is now active.');
      setDirectToken('');
      await loadStatus();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      setError(err.message || 'Failed to activate direct token');
    } finally {
      setActivatingToken(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await disconnectUpstox();
      setMsg(res.message || 'Disconnected from Upstox. Switched to Paper Trading Simulator.');
      await loadStatus();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      setError(err.message || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  const isLive = status?.is_live;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-fintech-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-semibold text-fintech-textHeading tracking-tight">
              Broker Gateway & Execution
            </h1>
            <span
              className={`text-[11px] px-2.5 py-1 rounded-md font-mono font-semibold border shadow-2xs ${
                isLive
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {isLive ? 'LIVE UPSTOX BROKER' : 'PAPER SIMULATOR ACTIVE'}
            </span>
          </div>
          <p className="text-xs text-fintech-textMuted mt-0.5">
            NSE direct execution, order routing, and live quotes via Upstox API v2
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isLive ? (
            <button
              onClick={handleDisconnect}
              className="px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect Live Session</span>
            </button>
          ) : (
            <a
              href="/api/upstox/authorize"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <span>Connect Upstox OAuth</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{msg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Gateway Status Summary */}
      <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-fintech-border">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                isLive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-fintech-textHeading flex items-center gap-2">
                <span>{isLive ? 'Active Live Broker Connection' : 'Paper Trading Simulator Active'}</span>
                <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </div>
              <p className="text-xs text-fintech-textMuted">
                {isLive
                  ? `Authenticated User ID: ${status?.user_id || 'Upstox Trader'}`
                  : 'Realistically models NSE slippage (15 bps), STT, and exchange clearing fees for paper orders'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadStatus}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-fintech-subtle hover:bg-fintech-muted text-fintech-textHeading text-xs border border-fintech-border transition-colors font-mono"
            >
              Refresh Status
            </button>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs font-mono">
          <div className="bg-fintech-subtle p-3 rounded-lg border border-fintech-border">
            <span className="text-fintech-textMuted text-[11px] block mb-0.5">Execution Engine</span>
            <span className="text-fintech-textHeading font-semibold">
              {isLive ? 'Direct Upstox v2 API' : 'NSE Paper Execution Engine'}
            </span>
          </div>
          <div className="bg-fintech-subtle p-3 rounded-lg border border-fintech-border">
            <span className="text-fintech-textMuted text-[11px] block mb-0.5">Market Data Stream</span>
            <span className="text-fintech-textHeading font-semibold">
              {isLive ? 'Upstox WebSocket Stream' : 'NSE Ribbon / Cache'}
            </span>
          </div>
          <div className="bg-fintech-subtle p-3 rounded-lg border border-fintech-border">
            <span className="text-fintech-textMuted text-[11px] block mb-0.5">Auth Session Token</span>
            <span className={`font-semibold ${isLive ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isLive ? 'Active & Valid' : 'Not Connected (Safe Simulation)'}
            </span>
          </div>
        </div>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Credentials Form */}
        <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-fintech-border">
            <h3 className="text-xs font-semibold text-fintech-textHeading uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              API Credentials
            </h3>
            <a
              href="https://account.upstox.com/developer/apps"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1 font-mono"
            >
              Upstox Dev Console <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-3.5 text-xs font-mono">
            <div>
              <label className="text-fintech-textMuted block mb-1">API Key (Client ID)</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter Upstox API Key"
                className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-fintech-textHeading focus:border-blue-500 outline-none text-xs"
                required
              />
            </div>

            <div>
              <label className="text-fintech-textMuted block mb-1">API Secret</label>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter secret to update"
                className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-fintech-textHeading focus:border-blue-500 outline-none text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-fintech-textMuted">Redirect URI</label>
                <button
                  type="button"
                  onClick={handleCopyUri}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <input
                type="text"
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-fintech-textHeading focus:border-blue-500 outline-none text-xs"
                required
              />
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setRedirectUri('http://localhost:8000/api/upstox/callback')}
                  className="px-2 py-0.5 rounded bg-fintech-subtle hover:bg-fintech-muted text-fintech-textMuted text-[10px] border border-fintech-border transition-colors"
                >
                  localhost:8000
                </button>
                <button
                  type="button"
                  onClick={() => setRedirectUri('http://127.0.0.1:8000/api/upstox/callback')}
                  className="px-2 py-0.5 rounded bg-fintech-subtle hover:bg-fintech-muted text-fintech-textMuted text-[10px] border border-fintech-border transition-colors"
                >
                  127.0.0.1:8000
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </form>
        </div>

        {/* Right column: Direct Access Token & Auth code exchange */}
        <div className="space-y-4">
          {/* Direct Access Token (Recommended / 1-Click) */}
          <div className="bg-fintech-card border border-emerald-500/30 rounded-xl p-5 shadow-fintech-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-fintech-textHeading uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                Direct Access Token (1-Click Live)
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Recommended
              </span>
            </div>
            <p className="text-xs text-fintech-textMuted mb-3">
              Generated an Access Token from your Upstox Developer Console or Python script? Paste it here to bypass OAuth redirects and activate Live Mode immediately:
            </p>

            <form onSubmit={handleActivateDirectToken} className="space-y-2.5 text-xs font-mono">
              <div>
                <input
                  type="password"
                  value={directToken}
                  onChange={(e) => setDirectToken(e.target.value)}
                  placeholder="Paste Upstox Access Token (eyJhbGciOi...)"
                  className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-fintech-textHeading focus:border-emerald-500 outline-none text-xs"
                  required
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directUserId}
                  onChange={(e) => setDirectUserId(e.target.value)}
                  placeholder="User ID / UCC (e.g. 504281)"
                  className="w-1/2 bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-fintech-textHeading focus:border-emerald-500 outline-none text-xs"
                />
                <button
                  type="submit"
                  disabled={activatingToken || !directToken.trim()}
                  className="w-1/2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {activatingToken ? 'Activating...' : 'Activate Live Mode'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-fintech-card border border-fintech-border rounded-xl p-5 shadow-fintech-card">
            <h3 className="text-xs font-semibold text-fintech-textHeading uppercase tracking-wider mb-2">
              Manual Auth Code Exchange
            </h3>
            <p className="text-xs text-fintech-textMuted mb-3">
              If your callback landed with a <code className="text-blue-600 dark:text-blue-400 font-mono">?code=...</code> URL parameter, paste it below:
            </p>

            <form onSubmit={handleExchangeManualCode} className="space-y-2.5 text-xs font-mono">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Paste code parameter"
                className="w-full bg-fintech-subtle border border-fintech-border rounded-lg px-3 py-2 text-fintech-textHeading focus:border-blue-500 outline-none text-xs"
              />
              <button
                type="submit"
                disabled={!manualCode}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                Exchange Code for Token
              </button>
            </form>
          </div>

          <div className="bg-fintech-card border border-fintech-border rounded-xl p-4 shadow-fintech-card">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-fintech-textHeading">
              <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Redirect URL Discrepancy Note</span>
            </div>
            <p className="text-[11px] text-fintech-textMuted leading-relaxed">
              Ensure the exact Redirect URL registered in your Upstox Developer Console matches <code className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">{redirectUri}</code>. Discrepancies between <code className="text-fintech-textHeading font-mono">localhost</code> and <code className="text-fintech-textHeading font-mono">127.0.0.1</code> will trigger error code UDAPI100068.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
