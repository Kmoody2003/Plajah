// ErrorReportsPanel — admin view of platform-wide errors. Live list from errorReports; group by
// message (with counts + affected users) or view the raw stream; filter by user (email/uid/name) or
// message; expand any report for the stack, URL, user, and agent. Admin-only (Firestore rule).

import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/backendService';
import { AlertTriangle, Search, Layers, List as ListIcon, X, LogIn } from 'lucide-react';

interface Report {
  id: string; message: string; stack?: string; source: string; context?: string;
  severity?: string; url?: string; userId?: string | null; userEmail?: string | null;
  userName?: string | null; userAgent?: string | null; createdAt: number;
  // User-filed bug reports (source 'user-report')
  userMessage?: string; currentView?: string; traceText?: string; viewport?: string; screen?: string;
}

interface LoginIssue {
  id: string; provider: string; code?: string; message: string; email?: string;
  url?: string; userAgent?: string; createdAt: number;
}

const T = { panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', red: '#e2473b', amber: '#e2a13b' };
const ago = (ms: number) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };

const ErrorReportsPanel: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [logins, setLogins] = useState<LoginIssue[]>([]);
  const [filter, setFilter] = useState('');
  // Feature-context quick filter — 'chora-next' shows only the Chora Next beta feedback.
  const [ctxFilter, setCtxFilter] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(true);
  const [sel, setSel] = useState<Report | null>(null);
  const [selLogin, setSelLogin] = useState<LoginIssue | null>(null);
  const [showLogins, setShowLogins] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'errorReports'), orderBy('createdAt', 'desc'), limit(400)),
      snap => setReports(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      e => setErr(e?.message || 'Failed to load (admin only).'),
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'loginIssues'), orderBy('createdAt', 'desc'), limit(200)),
      snap => setLogins(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      () => { /* non-fatal — the main error feed still loads */ },
    );
    return unsub;
  }, []);

  const recentLogins = useMemo(
    () => logins.filter(l => Date.now() - l.createdAt < 24 * 3600 * 1000),
    [logins],
  );

  const filtered = useMemo(() => {
    const base = ctxFilter ? reports.filter(r => r.context === ctxFilter) : reports;
    const f = filter.trim().toLowerCase();
    if (!f) return base;
    return base.filter(r =>
      (r.userEmail || '').toLowerCase().includes(f) || (r.userId || '').toLowerCase().includes(f) ||
      (r.userName || '').toLowerCase().includes(f) || (r.message || '').toLowerCase().includes(f) ||
      (r.source || '').toLowerCase().includes(f) || (r.context || '').toLowerCase().includes(f));
  }, [reports, filter, ctxFilter]);

  const choraNextCount = useMemo(() => reports.filter(r => r.context === 'chora-next').length, [reports]);

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
        {/* Chora Next beta-feedback quick filter */}
        <button
          onClick={() => setCtxFilter(c => (c === 'chora-next' ? null : 'chora-next'))}
          title="Show only Chora Next beta feedback"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, border: ctxFilter === 'chora-next' ? '1px solid transparent' : `1px solid ${T.border}`, background: ctxFilter === 'chora-next' ? 'linear-gradient(120deg,#6B0099,#00DAF3)' : 'transparent', color: T.ink }}
        >
          💿 Chora Next
          <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 6, padding: '1px 6px', background: ctxFilter === 'chora-next' ? 'rgba(0,0,0,0.3)' : `${T.orange}22`, color: ctxFilter === 'chora-next' ? '#fff' : T.orange }}>{choraNextCount}</span>
        </button>
        <button onClick={() => setGrouped(g => !g)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {grouped ? <><Layers size={13} /> Grouped</> : <><ListIcon size={13} /> Stream</>}
        </button>
      </div>

      {err && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

      {/* Login-trouble alert feed — surfaces users who couldn't sign in (captured while logged out). */}
      {recentLogins.length > 0 && (
        <div style={{ marginBottom: 12, border: `1px solid ${T.red}55`, background: `${T.red}12`, borderRadius: 12, overflow: 'hidden' }}>
          <button onClick={() => setShowLogins(s => !s)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'transparent', border: 'none', color: T.ink, cursor: 'pointer' }}>
            <LogIn size={17} style={{ color: T.red }} />
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>Login trouble</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: T.red, background: `${T.red}22`, borderRadius: 6, padding: '2px 8px' }}>{recentLogins.length} in 24h</span>
            <span style={{ fontSize: 11, color: T.muted }}>{[...new Set(recentLogins.map(l => l.email || 'unknown'))].filter(e => e !== 'unknown').length} known email{[...new Set(recentLogins.map(l => l.email).filter(Boolean))].length === 1 ? '' : 's'}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: T.muted }}>{showLogins ? 'Hide' : 'Show'}</span>
          </button>
          {showLogins && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 10px 10px', maxHeight: '30vh', overflowY: 'auto' }}>
              {recentLogins.map(l => (
                <button key={l.id} onClick={() => setSelLogin(l)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.panel, color: T.ink, cursor: 'pointer' }}>
                  <span style={{ minWidth: 62, fontSize: 10.5, fontWeight: 800, color: T.amber, textTransform: 'uppercase' }}>{l.provider}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.email || 'unknown user'} · {l.code || 'error'}</div>
                    <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.message} · {ago(l.createdAt)} ago</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>
                {r.source}{r.context ? <span style={{ color: '#00DAF3', fontWeight: 800 }}> · {r.context}</span> : null} · {r.userEmail || r.userName || r.userId || 'anon'} · {ago(r.createdAt)} ago
              </div>
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
            {sel.source === 'user-report' && (
              <div style={{ marginTop: 10, display: 'inline-block', padding: '3px 9px', borderRadius: 999, background: `${T.orange}22`, color: T.orange, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>User Report</div>
            )}
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '90px 1fr', gap: '6px 10px', fontSize: 12 }}>
              {[
                ['Source', sel.source],
                ...(sel.currentView ? [['View', sel.currentView]] : []),
                ['Context', sel.context || '—'],
                ['User', sel.userEmail || sel.userName || sel.userId || 'anon'],
                ['UID', sel.userId || '—'],
                ['URL', sel.url || '—'],
                ...(sel.viewport ? [['Viewport', `${sel.viewport}${sel.screen ? ` (screen ${sel.screen})` : ''}`]] : []),
                ['When', new Date(sel.createdAt).toLocaleString()],
                ['Agent', sel.userAgent || '—'],
              ].map(([k, v]) => (
                <React.Fragment key={k as string}><span style={{ color: T.muted, fontWeight: 700 }}>{k}</span><span style={{ wordBreak: 'break-word' }}>{v as string}</span></React.Fragment>
              ))}
            </div>
            {sel.traceText && (
              <>
                <div style={{ marginTop: 14, marginBottom: 6, fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Session trail — last 5 minutes</div>
                <pre style={{ padding: 10, background: '#0c0c12', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 10.5, color: '#9fd', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260 }}>{sel.traceText}</pre>
              </>
            )}
            {sel.stack && <pre style={{ marginTop: 12, padding: 10, background: '#0c0c12', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, color: '#cbb', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{sel.stack}</pre>}
          </div>
        </div>
      )}

      {selLogin && (
        <div onClick={() => setSelLogin(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 9999, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogIn size={18} style={{ color: T.red }} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>Login failure — {selLogin.provider}</div>
              <button onClick={() => setSelLogin(null)} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '90px 1fr', gap: '6px 10px', fontSize: 12 }}>
              {[
                ['Provider', selLogin.provider],
                ['Email', selLogin.email || '— (not provided)'],
                ['Code', selLogin.code || '—'],
                ['Message', selLogin.message],
                ['URL', selLogin.url || '—'],
                ['When', new Date(selLogin.createdAt).toLocaleString()],
                ['Agent', selLogin.userAgent || '—'],
              ].map(([k, v]) => (
                <React.Fragment key={k as string}><span style={{ color: T.muted, fontWeight: 700 }}>{k}</span><span style={{ wordBreak: 'break-word' }}>{v as string}</span></React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorReportsPanel;
