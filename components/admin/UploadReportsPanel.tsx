// UploadReportsPanel — admin view of the upload-attempt ledger (services/uploadReports.ts).
//
// The point of this panel is the STALLED row: an upload that opened, moved bytes, and then
// simply stopped reporting. Those never reach errorReports, because a tab close or a deploy
// mid-transfer fires no error handler — the app is gone. Here they are the loudest thing on
// the screen, with the creator, the file, the size, how far it got, and how long ago.
//
// "Published empty" rows (role PUBLISH) are the other half: a film that went live with no
// video attached. That is what happened to Pumpkin Patch (Oct 2025).

import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/backendService';
import { outcomeOf, STALE_AFTER_MS } from '../../services/uploadReports';
import { UploadCloud, AlertTriangle, Search, X, Film, Music, Image as ImageIcon, BookOpen } from 'lucide-react';

interface Attempt {
  id: string;
  status: string;
  surface?: string;
  role?: string;
  fileName?: string;
  sizeBytes?: number | null;
  contentType?: string;
  transport?: string;
  targetId?: string | null;
  targetTitle?: string;
  percent?: number;
  bytesTransferred?: number;
  ownerId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  userAgent?: string;
  url?: string;
  connection?: { effectiveType?: string; downlinkMbps?: number | null; saveData?: boolean };
  errorCode?: string;
  errorMessage?: string;
  resumable?: boolean;
  kind?: string;
  startedAt: number;
  lastBeatAt?: number;
  endedAt?: number | null;
  durationMs?: number;
}

const T = { panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', red: '#e2473b', amber: '#e2a13b', green: '#3bbf6e' };

const ago = (ms?: number) => {
  if (!ms) return '—';
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};
const mb = (b?: number | null) => (typeof b === 'number' && b > 0 ? `${(b / 1024 / 1024).toFixed(0)} MB` : '—');
const dur = (ms?: number) => (!ms ? '—' : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`);

const OUTCOME_COLOR: Record<string, string> = {
  STALLED: T.red, FAILED: T.red, UPLOADING: T.amber, COMPLETED: T.green, CANCELLED: T.muted,
};

const SURFACE_ICON: Record<string, React.ReactNode> = {
  TALEO: <Film size={13} />, CHORA: <Music size={13} />, REELLO: <Film size={13} />,
  PHOTOS: <ImageIcon size={13} />, LOREA: <BookOpen size={13} />,
};

const UploadReportsPanel: React.FC = () => {
  const [rows, setRows] = useState<Attempt[]>([]);
  const [filter, setFilter] = useState('');
  const [surface, setSurface] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [sel, setSel] = useState<Attempt | null>(null);
  const [err, setErr] = useState('');
  // Stalled-ness is time-derived, so the list must re-evaluate on a clock, not only on
  // snapshot. Without this a row that goes stale while you watch never changes colour.
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'uploadAttempts'), orderBy('startedAt', 'desc'), limit(400)),
      snap => setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      e => setErr(e?.message || 'Failed to load (admin only).'),
    );
    return unsub;
  }, []);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return rows.filter(r => {
      const o = outcomeOf(r);
      if (onlyProblems && (o === 'COMPLETED' || o === 'UPLOADING')) return false;
      if (surface && r.surface !== surface) return false;
      if (!f) return true;
      return [r.fileName, r.targetTitle, r.userEmail, r.userName, r.ownerId, r.errorMessage, r.errorCode]
        .some(v => String(v || '').toLowerCase().includes(f));
    });
  }, [rows, filter, surface, onlyProblems]);

  const counts = useMemo(() => {
    const c = { STALLED: 0, FAILED: 0, UPLOADING: 0, COMPLETED: 0, CANCELLED: 0 } as Record<string, number>;
    rows.forEach(r => { c[outcomeOf(r)] = (c[outcomeOf(r)] || 0) + 1; });
    return c;
  }, [rows]);

  const surfaces = useMemo(
    () => Array.from(new Set(rows.map(r => r.surface).filter(Boolean))) as string[],
    [rows],
  );

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic leading-none">Upload Reports</h1>
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest">
          Every large-media upload, and what became of it. A <span style={{ color: T.red }}>stalled</span> row is an upload
          that died without reporting — a closed tab, a dropped network, a deploy mid-transfer.
        </p>
      </header>

      {err && (
        <div className="p-4 rounded-2xl border text-xs font-bold" style={{ borderColor: T.red, color: T.red }}>{err}</div>
      )}

      {/* Outcome tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['STALLED', 'FAILED', 'UPLOADING', 'COMPLETED', 'CANCELLED'] as const).map(k => (
          <div key={k} className="px-4 py-3 rounded-2xl border" style={{ background: T.panel, borderColor: T.border }}>
            <div className="text-[8px] font-black uppercase tracking-widest" style={{ color: T.muted }}>{k}</div>
            <div className="text-2xl font-black" style={{ color: OUTCOME_COLOR[k] }}>{counts[k] || 0}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by file, title, creator, or error…"
            className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold outline-none focus:ring-2 ring-white/20"
          />
        </div>
        <button
          onClick={() => setOnlyProblems(v => !v)}
          className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all"
          style={{
            background: onlyProblems ? T.red : 'transparent',
            borderColor: onlyProblems ? T.red : T.border,
            color: onlyProblems ? '#fff' : T.muted,
          }}
        >
          {onlyProblems ? 'Problems only' : 'All attempts'}
        </button>
        {surfaces.map(s => (
          <button
            key={s}
            onClick={() => setSurface(cur => (cur === s ? null : s))}
            className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2 transition-all"
            style={{
              background: surface === s ? '#fff' : 'transparent',
              borderColor: surface === s ? '#fff' : T.border,
              color: surface === s ? '#000' : T.muted,
            }}
          >
            {SURFACE_ICON[s] || <UploadCloud size={13} />}{s}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {shown.length === 0 && (
          <div className="p-8 text-center text-white/30 text-xs font-black uppercase tracking-widest">
            Nothing to report.
          </div>
        )}
        {shown.map(r => {
          const o = outcomeOf(r);
          const empty = r.errorCode === 'empty-publish';
          return (
            <button
              key={r.id}
              onClick={() => setSel(r)}
              className="w-full text-left p-4 rounded-2xl border flex items-center gap-4 hover:bg-white/5 transition-all"
              style={{ background: T.panel, borderColor: o === 'STALLED' || o === 'FAILED' ? T.red + '55' : T.border }}
            >
              <div className="shrink-0" style={{ color: OUTCOME_COLOR[o] }}>
                {empty ? <AlertTriangle size={18} /> : SURFACE_ICON[r.surface || ''] || <UploadCloud size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">
                  {empty ? `Published with no video — ${r.targetTitle || r.targetId}` : (r.fileName || '(unnamed)')}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest truncate" style={{ color: T.muted }}>
                  {r.surface} · {r.role} · {r.userName || r.userEmail || r.ownerId || 'unknown'}
                  {r.targetTitle && !empty ? ` · ${r.targetTitle}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: OUTCOME_COLOR[o] }}>{o}</p>
                <p className="text-[9px] font-bold" style={{ color: T.muted }}>
                  {o === 'STALLED' ? `${Math.round(r.percent || 0)}% · stopped ${ago(r.lastBeatAt)} ago` : `${mb(r.sizeBytes)} · ${ago(r.startedAt)} ago`}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail */}
      {sel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setSel(null)}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[2rem] border p-8 space-y-5"
            style={{ background: T.panel, borderColor: T.border }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: OUTCOME_COLOR[outcomeOf(sel)] }}>
                  {outcomeOf(sel)}
                  {sel.resumable ? ' · resumable' : ''}
                </p>
                <h3 className="text-xl font-black uppercase tracking-tight break-words">{sel.fileName}</h3>
              </div>
              <button onClick={() => setSel(null)} className="shrink-0 text-white/40 hover:text-white"><X size={20} /></button>
            </div>

            {outcomeOf(sel) === 'STALLED' && (
              <div className="p-4 rounded-2xl text-xs font-bold leading-relaxed" style={{ background: T.red + '18', color: T.red }}>
                This upload stopped sending after {Math.round(sel.percent || 0)}% and never reported an outcome.
                Its last heartbeat was {ago(sel.lastBeatAt)} ago (anything over {Math.round(STALE_AFTER_MS / 60000)} minutes is treated as dead).
                The creator almost certainly does not know it failed.
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              {([
                ['Creator', sel.userName || sel.userEmail || sel.ownerId],
                ['Email', sel.userEmail],
                ['Surface', `${sel.surface} · ${sel.role}`],
                ['Target', sel.targetTitle || sel.targetId],
                ['Size', mb(sel.sizeBytes)],
                ['Sent', `${Math.round(sel.percent || 0)}% (${mb(sel.bytesTransferred)})`],
                ['Content type', sel.contentType],
                ['Transport', sel.transport],
                ['Started', new Date(sel.startedAt).toLocaleString()],
                ['Last beat', sel.lastBeatAt ? new Date(sel.lastBeatAt).toLocaleString() : '—'],
                ['Duration', dur(sel.durationMs)],
                ['Network', sel.connection?.effectiveType ? `${sel.connection.effectiveType} · ${sel.connection.downlinkMbps ?? '?'} Mbps` : '—'],
              ] as [string, any][]).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[8px] font-black uppercase tracking-widest" style={{ color: T.muted }}>{k}</dt>
                  <dd className="font-bold break-words">{v || '—'}</dd>
                </div>
              ))}
            </dl>

            {sel.errorMessage && (
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: T.muted }}>Error {sel.errorCode ? `(${sel.errorCode})` : ''}</p>
                <pre className="text-[11px] whitespace-pre-wrap break-words p-4 rounded-2xl bg-black/40">{sel.errorMessage}</pre>
              </div>
            )}

            {sel.userAgent && (
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: T.muted }}>Agent</p>
                <p className="text-[10px] break-words" style={{ color: T.muted }}>{sel.userAgent}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadReportsPanel;
