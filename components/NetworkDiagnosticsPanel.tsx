import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, Wifi, WifiOff, Download, Upload, Gauge, Waves, ShieldCheck, Loader2, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { useNetworkMonitor } from '../contexts/NetworkMonitorContext';
import { levelLabel, type NetworkLevel, type NetworkSample } from '../services/networkDiagnostics';

const LEVEL_COLOR: Record<NetworkLevel, { text: string; bg: string; dot: string }> = {
  good:     { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  fair:     { text: 'text-lime-400',    bg: 'bg-lime-500/10 border-lime-500/30',       dot: 'bg-lime-400' },
  poor:     { text: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',     dot: 'bg-amber-400' },
  critical: { text: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',         dot: 'bg-red-400' },
  offline:  { text: 'text-white/50',    bg: 'bg-white/5 border-white/15',              dot: 'bg-white/40' },
};

const fmtMs = (v: number | null) => (v == null ? '—' : `${Math.round(v)} ms`);
const fmtMbps = (v: number | null) => (v == null ? '—' : `${v >= 100 ? Math.round(v) : v.toFixed(1)} Mbps`);
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({ icon, label, value, hint }) => (
  <div className="flex flex-col gap-1 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
    <div className="flex items-center gap-2 text-white/40">{icon}<span className="text-[9px] font-black uppercase tracking-widest">{label}</span></div>
    <div className="text-lg font-black tabular-nums">{value}</div>
    {hint && <div className="text-[9px] font-bold text-white/25 uppercase tracking-widest">{hint}</div>}
  </div>
);

/** Tiny inline sparkline of recent latency, colored by drops. */
const Sparkline: React.FC<{ history: NetworkSample[] }> = ({ history }) => {
  if (history.length < 2) return null;
  const vals = history.map(s => (s.online ? (s.rttMs ?? 0) : 1000));
  const max = Math.max(120, ...vals);
  const w = 100, h = 28;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - (Math.min(v, max) / max) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-8">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-small-orange" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const NetworkDiagnosticsPanel: React.FC = () => {
  const { sample, prefs, setPrefs, refresh, runFullTest, testing } = useNetworkMonitor();
  const [history, setHistory] = useState<NetworkSample[]>([]);
  const seen = useRef<number>(0);

  // Keep a rolling window of samples for the sparkline.
  useEffect(() => {
    if (sample && sample.at !== seen.current) {
      seen.current = sample.at;
      setHistory(prev => [...prev, sample].slice(-40));
    }
  }, [sample]);

  const level = sample?.level ?? 'offline';
  const c = LEVEL_COLOR[level];

  return (
    <div className="flex flex-col gap-6">
      {/* Header / status */}
      <div className={`flex items-center justify-between gap-4 p-5 rounded-3xl border ${c.bg}`}>
        <div className="flex items-center gap-4">
          <div className="relative">
            {level === 'offline' ? <WifiOff size={28} className={c.text} /> : <Wifi size={28} className={c.text} />}
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${c.dot} ring-2 ring-black`} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">Network Health</p>
            <h3 className={`text-xl font-black uppercase tracking-tight ${c.text}`}>{levelLabel(level)}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="tap p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 transition-colors" title="Re-check latency">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={runFullTest}
            disabled={testing || !prefs.throughputEnabled}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-small-orange text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
            title={prefs.throughputEnabled ? 'Measure download & upload speed' : 'Enable speed tests below first'}
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
            {testing ? 'Testing…' : 'Speed test'}
          </button>
        </div>
      </div>

      {/* Live metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat icon={<Activity size={13} />} label="Latency" value={sample ? fmtMs(sample.rttMs) : '—'} hint="Round-trip ping" />
        <Stat icon={<Waves size={13} />} label="Jitter" value={sample ? fmtMs(sample.jitterMs) : '—'} hint="Ping variation" />
        <Stat icon={<AlertTriangle size={13} />} label="Drops" value={sample ? fmtPct(sample.dropRate) : '—'} hint="Failed probes" />
        <Stat icon={<Download size={13} />} label="Download" value={fmtMbps(sample?.downMbps ?? null)} hint={sample?.downMbps == null ? 'Run a speed test' : undefined} />
        <Stat icon={<Upload size={13} />} label="Upload" value={fmtMbps(sample?.upMbps ?? null)} hint={sample?.upMbps == null ? 'Run a speed test' : undefined} />
        <Stat icon={<Gauge size={13} />} label="Connection" value={(sample?.effectiveType || 'unknown').toUpperCase()} hint={sample?.saveData ? 'Data saver on' : undefined} />
      </div>

      {/* Latency trend */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Latency trend</span>
          <span className="text-[9px] font-bold text-white/25 uppercase tracking-widest">{history.length} samples</span>
        </div>
        <Sparkline history={history} />
      </div>

      {/* Preferences */}
      <div className="flex flex-col gap-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Settings</p>
        <Toggle label="Monitor my connection" desc="Runs lightweight same-origin latency checks" on={prefs.enabled} onChange={v => setPrefs({ enabled: v })} />
        <Toggle label="Allow speed tests" desc="Periodic download/upload tests (skipped on metered / data-saver)" on={prefs.throughputEnabled} onChange={v => setPrefs({ throughputEnabled: v })} />
        <Toggle label="Warn me when it degrades" desc="Pops a notification with a severity level" on={prefs.notify} onChange={v => setPrefs({ notify: v })} />
      </div>

      {/* Privacy note */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
        <ShieldCheck size={16} className="text-small-orange mt-0.5 shrink-0" />
        <p className="text-[10px] text-white/40 leading-relaxed">
          <span className="text-white/70 font-bold">Private by design.</span> All checks run against Plajah's own servers — never a third-party speed test — so no one else learns you're online or how your link performs. Results stay on this device and are never uploaded. Speed tests send throwaway random bytes, never your data.
        </p>
      </div>
    </div>
  );
};

const Toggle: React.FC<{ label: string; desc: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, desc, on, onChange }) => (
  <button onClick={() => onChange(!on)} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] transition-colors text-left">
    <div className="min-w-0">
      <p className="text-xs font-black uppercase tracking-widest">{label}</p>
      <p className="text-[10px] font-medium text-white/30 mt-0.5">{desc}</p>
    </div>
    <div className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-small-orange' : 'bg-white/10'}`}>
      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </div>
  </button>
);

export default NetworkDiagnosticsPanel;
