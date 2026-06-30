// ErrorReportsPanel — admin view of platform-wide errors. Live list from errorReports; group by
// message (with counts + affected users) or view the raw stream; filter by user (email/uid/name) or
// message; expand any report for the stack, URL, user, and agent. Admin-only (Firestore rule).

import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/backendService';
import { AlertTriangle, Search, Layers, List as ListIcon, X } from 'lucide-react';

interface Report {
  id: string; message: string; stack?: string; source: string; context?: string;
  severity?: string; url?: string; userId?: string | null; userEmail?: string | null;
  userName?: string | null; userAgent?: string | null; createdAt: number;
}

const T = { panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', red: '#e2473b', amber: '#e2a13b' };
const ago = (ms: number) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };

const ErrorReportsPanel: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState('');
  const [grouped, setGrouped] = useState(true);
  const [sel, setSel] = useState<Report | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'errorReports'), orderBy('createdAt', 'desc'), limit(400)),
      snap => setReports(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      e => setErr(e?.message || 'Failed to load (admin only).'),
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return reports;
    return reports.filter(r =>
      (r.userEmail || '').toLowerCase().includes(f) || (r.userId || '').toLowerCase().includes(f) ||
      (r.userName || '').toLowerCase().includes(f) || (r.message || '').toLowerCase().includes(f) ||
      (r.source || '').toLowerCase().includes(f));
  }, [reports, filter]);

  const groups = useMemo(() => {
    const m = new Map<string, { message: string; count: number; latest: number; users: Set<string>; source: string; sample: Report }>();
    for (const r of filtered) {
      const g = m.get(r.message) || { message: r.message, count: 0, latest: 0, users: new Set<string>(), source: r.source, sample: r };
      g.count++; g.latest = Math.max(g.latest, r.createdAt); if (r.userId) g.users.add(r.userId);
      m.set(r.message, g);
    }
    return [...m.values()].sort((a, b) => b.latest - a.latest);
  }, [filtered]);

  const sevColor = (s?: string) => (s === 'warning' ? T.amber : T.red);

  return (
    <div style={{ color: T.ink, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <AlertTriangle size={18} style={{ color: T.orange }} />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Error Reports</h2>
        <span style={{ fontSize: 12, color: T.muted }}>{filtered.length} of {reports.length}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0c0c12', border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px' }}>
          <Search size={13} color={T.muted} />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by user, email, message…" style={{ background: 'transparent', border: 'none', color: T.ink, fontSize: 12.5, outline: 'none', width: 220 }} />
        </div>
        <button onClick={() => setGrouped(g => !g)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {grouped ? <><Layers size={13} /> Grouped</> : <><ListIcon size={13} /> Stream</>}
        </button>
      </div>

      {err && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '64vh', overflowY: 'auto' }}>
        {grouped ? groups.map(g => (
          <button key={g.message} onClick={() => setSel(g.sample)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.panel, color: T.ink, cursor: 'pointer' }}>
            <span style={{ minWidth: 34, height: 22, borderRadius: 6, background: `${sevColor(g.sample.severity)}22`, color: sevColor(g.sample.severity), fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{g.count}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.message}</div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{g.source} · {g.users.size} user{g.users.size === 1 ? '' : 's'} · {ago(g.latest)} ago</div>
            </div>
          </button>
        )) : filtered.map(r => (
          <button key={r.id} onClick={() => setSel(r)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.panel, color: T.ink, cursor: 'pointer' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: sevColor(r.severity), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.message}</div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{r.source} · {r.userEmail || r.userName || r.userId || 'anon'} · {ago(r.createdAt)} ago</div>
            </div>
          </button>
        ))}
        {!filtered.length && !err && <div style={{ color: T.muted, fontSize: 12.5, padding: 20, textAlign: 'center', fontStyle: 'italic' }}>No errors reported. 🎉</div>}
      </div>

      {sel && (
        <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 9999, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
              <AlertTriangle size={18} style={{ color: sevColor(sel.severity), marginTop: 2 }} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>{sel.message}</div>
              <button onClick={() => setSel(null)} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '90px 1fr', gap: '6px 10px', fontSize: 12 }}>
              {[['Source', sel.source], ['Context', sel.context || '—'], ['User', sel.userEmail || sel.userName || sel.userId || 'anon'], ['UID', sel.userId || '—'], ['URL', sel.url || '—'], ['When', new Date(sel.createdAt).toLocaleString()], ['Agent', sel.userAgent || '—']].map(([k, v]) => (
                <React.Fragment key={k as string}><span style={{ color: T.muted, fontWeight: 700 }}>{k}</span><span style={{ wordBreak: 'break-word' }}>{v as string}</span></React.Fragment>
              ))}
            </div>
            {sel.stack && <pre style={{ marginTop: 12, padding: 10, background: '#0c0c12', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, color: '#cbb', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{sel.stack}</pre>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorReportsPanel;
