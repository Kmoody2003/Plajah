// Admin → API Keys: a countdown for credentials that expire on a schedule (services/keyRotation.ts).
//
// The SAM.gov API key lapses after 90 days and nothing warns you — the contracts feature just goes dark.
// This panel shows days left, how to rotate, and one button to record "I rotated it today". The banner
// is shown across the whole admin dashboard once a key is within two weeks of lapsing.
// Only dates are stored; the key itself never passes through the app.
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Loader2, RotateCw } from 'lucide-react';
import { auth } from '../../services/firebase';

type State = 'unknown' | 'ok' | 'soon' | 'urgent' | 'overdue';
interface KeyRow {
  id: string; label: string; powers: string; intervalDays: number; envVar: string; rotateUrl: string; steps: string[];
  configured: boolean; rotatedAt?: number; rotatedBy?: string; lastFailureAt?: number; history: number[];
  status: { state: State; dueAt?: number; daysLeft?: number; ageDays?: number };
}
interface Payload { keys: KeyRow[]; worst: State; now: number }

async function authed<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

const TONE: Record<State, { color: string; label: string }> = {
  ok: { color: '#3DD68C', label: 'On schedule' },
  soon: { color: '#E8B33D', label: 'Rotate soon' },
  urgent: { color: '#FF8C00', label: 'Rotate now' },
  overdue: { color: '#FF4D4D', label: 'Expired' },
  unknown: { color: '#8B93A7', label: 'Not tracked yet' },
};
const fmt = (t?: number) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

function useKeys() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => authed<Payload>('/api/admin/key-rotation').then(d => { setData(d); setError(null); }).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

/** Shown above every admin tab once any key needs attention. Renders nothing while all is well. */
export const KeyRotationBanner: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { data } = useKeys();
  if (!data || data.worst === 'ok') return null;
  const k = data.keys.filter(x => x.status.state !== 'ok').sort((a, b) => (a.status.daysLeft ?? -999) - (b.status.daysLeft ?? -999))[0];
  const t = TONE[k.status.state];
  const text = k.status.state === 'unknown' ? `${k.label}: set when it was created so the 90-day countdown can start.`
    : k.status.state === 'overdue' ? `${k.label} expired ${Math.abs(k.status.daysLeft!)} day${Math.abs(k.status.daysLeft!) === 1 ? '' : 's'} ago. ${k.powers.split(':')[0]} is down until it is rotated.`
    : `${k.label} lapses in ${k.status.daysLeft} day${k.status.daysLeft === 1 ? '' : 's'} (${fmt(k.status.dueAt)}).`;
  return (
    <button onClick={onOpen} className="w-full mb-6 text-left rounded-2xl px-5 py-4 flex items-center gap-3 border" style={{ borderColor: `${t.color}66`, background: `${t.color}14` }}>
      <AlertTriangle size={18} style={{ color: t.color }} className="shrink-0" />
      <span className="text-sm text-white/90"><b style={{ color: t.color }}>{t.label}.</b> {text}</span>
      <span className="ml-auto text-[11px] font-bold shrink-0" style={{ color: t.color }}>Open</span>
    </button>
  );
};

const Card: React.FC<{ k: KeyRow; onDone: () => void }> = ({ k, onDone }) => {
  const t = TONE[k.status.state];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [showDate, setShowDate] = useState(k.status.state === 'unknown');
  const pct = k.status.daysLeft === undefined ? 0 : Math.max(0, Math.min(100, (k.status.daysLeft / k.intervalDays) * 100));

  const record = async () => {
    setBusy(true); setErr(null);
    try {
      await authed(`/api/admin/key-rotation/${k.id}/rotated`, { method: 'POST', body: JSON.stringify(date ? { rotatedAt: date } : {}) });
      setDate(''); setShowDate(false); onDone();
    } catch (e: any) { setErr(e?.message || 'Could not save'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${t.color}22`, color: t.color }}><KeyRound size={22} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-white">{k.label}</p>
          <p className="text-[12px] text-white/50 mt-0.5">{k.powers}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-4xl font-black tabular-nums leading-none" style={{ color: t.color }}>{k.status.daysLeft === undefined ? '—' : k.status.daysLeft < 0 ? `+${Math.abs(k.status.daysLeft)}` : k.status.daysLeft}</p>
          <p className="text-[10px] font-black uppercase tracking-widest mt-1" style={{ color: t.color }}>{k.status.daysLeft !== undefined && k.status.daysLeft < 0 ? 'days overdue' : 'days left'}</p>
        </div>
      </div>

      <div className="mt-5 h-2 rounded-full bg-white/10 overflow-hidden" aria-hidden>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: t.color }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 mt-2 text-[11px] text-white/45">
        <span>{t.label} · rotated {fmt(k.rotatedAt)}</span>
        <span>Lapses {fmt(k.status.dueAt)} (every {k.intervalDays} days)</span>
      </div>

      {!k.configured && (
        <p className="mt-4 text-[12px] flex gap-2 text-amber-300"><AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span><b>{k.envVar}</b> is not set on this server, so the feature is off. The countdown still tracks the key you plan to use.</span></p>
      )}
      {k.lastFailureAt && (!k.rotatedAt || k.lastFailureAt > k.rotatedAt) && (
        <p className="mt-4 text-[12px] flex gap-2 text-red-300"><AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>SAM.gov rejected the key on {fmt(k.lastFailureAt)}. It may already have lapsed or been revoked: rotate it now.</span></p>
      )}

      <div className="mt-5 rounded-2xl bg-black/30 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><RotateCw size={11} /> How to rotate</p>
        <ol className="mt-2 space-y-1.5 list-decimal pl-5">{k.steps.map(s => <li key={s} className="text-[12px] text-white/70 leading-relaxed">{s}</li>)}</ol>
        <a href={k.rotateUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-sky-300">Open SAM.gov <ExternalLink size={11} /></a>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button disabled={busy} onClick={record}
                className="px-5 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-widest bg-white text-black disabled:opacity-40 inline-flex items-center gap-2">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} {date ? 'Save this date' : 'I rotated it today'}
        </button>
        {!showDate && <button onClick={() => setShowDate(true)} className="text-[12px] text-white/50 underline underline-offset-2">It was a different day</button>}
        {showDate && (
          <label className="text-[12px] text-white/50 flex items-center gap-2">
            the key was created on
            <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)}
                   className="rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-white text-[12px]" />
          </label>
        )}
        {err && <span role="alert" className="text-[12px] text-red-300">{err}</span>}
      </div>
      {k.history.length > 0 && <p className="mt-4 text-[11px] text-white/30">Earlier rotations: {k.history.map(fmt).join(', ')}</p>}
    </div>
  );
};

export const AdminKeyRotation: React.FC = () => {
  const { data, error, reload } = useKeys();
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-3xl font-black text-white tracking-tight">API Keys</h2>
        <p className="text-sm text-white/50 mt-2 leading-relaxed">
          Some keys stop working on a schedule and nothing tells you. Record the day you rotate each one; the countdown starts a warning two weeks before it lapses.
          Only dates are stored here, never the key.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {!data && !error && <p className="text-sm text-white/40 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>}
      {data?.keys.map(k => <Card key={k.id} k={k} onDone={reload} />)}
    </div>
  );
};

export default AdminKeyRotation;
