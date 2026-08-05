// AdminUserHealth — per-user experience-health dashboard. Live from userHealth/{uid}.
// Surfaces load times, jank, failed requests, JS errors, connection, memory, threat
// signals and a 0-100 health score per user, worst first. Admin-only (Firestore rule).

import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../services/backendService';
import { Activity, Search, AlertTriangle, ShieldAlert, Gauge, Zap, WifiOff, X } from 'lucide-react';

interface HealthDoc {
  uid: string; email?: string | null; displayName?: string | null;
  score: number; loadMs?: number | null; ttfbMs?: number | null; lcpMs?: number | null;
  longTasks?: number; longTaskMs?: number; failedRequests?: number; errorCount?: number;
  effectiveType?: string; memoryUsedMB?: number | null; threats?: string[]; healedCount?: number;
  userAgent?: string; url?: string; updatedAt: number;
}

const T = { panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', good: '#06D6A0', warn: '#e2a13b', bad: '#e2473b' };
const ago = (ms: number) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const scoreColor = (s: number) => (s >= 75 ? T.good : s >= 45 ? T.warn : T.bad);
const ms = (n?: number | null) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);

const AdminUserHealth: React.FC = () => {
  const [docs, setDocs] = useState<HealthDoc[]>([]);
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<HealthDoc | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'userHealth'), orderBy('updatedAt', 'desc'), limit(500)),
      snap => setDocs(snap.docs.map(d => ({ ...(d.data() as any) }))),
      e => setErr(e?.message || 'Failed to load (admin only).'),
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f ? docs.filter(d =>
      (d.email || '').toLowerCase().includes(f) || (d.displayName || '').toLowerCase().includes(f) ||
      (d.uid || '').toLowerCase().includes(f) || (d.threats || []).some(t => t.toLowerCase().includes(f))) : docs;
    return [...list].sort((a, b) => a.score - b.score); // worst first
  }, [docs, filter]);

  const agg = useMemo(() => {
    const n = docs.length || 1;
    const avg = Math.round(docs.reduce((s, d) => s + (d.score || 0), 0) / n);
    const degraded = docs.filter(d => d.score < 45).length;
    const threats = docs.filter(d => (d.threats || []).length > 0).length;
    const avgLoad = Math.round(docs.filter(d => d.loadMs != null).reduce((s, d) => s + (d.loadMs || 0), 0) / (docs.filter(d => d.loadMs != null).length || 1));
    return { avg, degraded, threats, avgLoad, total: docs.length };
  }, [docs]);

  const Kpi = ({ icon: Icon, label, value, color }: any) => (
    <div style={{ flex: 1, minWidth: 130, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: T.muted, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
        <Icon size={13} style={{ color }} /> {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ color: T.ink, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Activity size={18} style={{ color: '#FF8C00' }} />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>User Health</h2>
        <span style={{ fontSize: 12, color: T.muted }}>{filtered.length} of {docs.length}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0c0c12', border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px' }}>
          <Search size={13} color={T.muted} />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by user, email, threat…" style={{ background: 'transparent', border: 'none', color: T.ink, fontSize: 12.5, outline: 'none', width: 220 }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi icon={Gauge} label="Avg health" value={`${agg.avg}`} color={scoreColor(agg.avg)} />
        <Kpi icon={AlertTriangle} label="Degraded" value={agg.degraded} color={agg.degraded ? T.bad : T.good} />
        <Kpi icon={ShieldAlert} label="With threats" value={agg.threats} color={agg.threats ? T.warn : T.good} />
        <Kpi icon={Zap} label="Avg load" value={ms(agg.avgLoad)} color={T.ink} />
        <Kpi icon={Activity} label="Reporting" value={agg.total} color={T.ink} />
      </div>

      {err && <div style={{ color: T.bad, fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '58vh', overflowY: 'auto' }}>
        {filtered.map(d => (
          <button key={d.uid} onClick={() => setSel(d)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.panel, color: T.ink, cursor: 'pointer' }}>
            <span style={{ minWidth: 40, height: 40, borderRadius: 10, background: `${scoreColor(d.score)}22`, color: scoreColor(d.score), fontSize: 15, fontWeight: 900, display: 'grid', placeItems: 'center' }}>{d.score}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.displayName || d.email || d.uid}</div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>
                load {ms(d.loadMs)} · LCP {ms(d.lcpMs)} · {d.failedRequests || 0} failed · {d.errorCount || 0} errors · {d.effectiveType || '—'} · {ago(d.updatedAt)} ago
              </div>
            </div>
            {(d.threats || []).length > 0 && <ShieldAlert size={15} style={{ color: T.warn, flexShrink: 0 }} />}
            {(d.errorCount || 0) >= 3 && <AlertTriangle size={15} style={{ color: T.bad, flexShrink: 0 }} />}
          </button>
        ))}
        {!filtered.length && !err && <div style={{ color: T.muted, fontSize: 12.5, padding: 20, textAlign: 'center', fontStyle: 'italic' }}>No health data yet — snapshots appear as users browse.</div>}
      </div>

      {sel && (
        <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 9999, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ minWidth: 48, height: 48, borderRadius: 12, background: `${scoreColor(sel.score)}22`, color: scoreColor(sel.score), fontSize: 18, fontWeight: 900, display: 'grid', placeItems: 'center' }}>{sel.score}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{sel.displayName || sel.email || sel.uid}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{sel.email || sel.uid} · updated {ago(sel.updatedAt)} ago</div>
              </div>
              <button onClick={() => setSel(null)} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 10px', fontSize: 12 }}>
              {[
                ['Page load', ms(sel.loadMs)], ['TTFB', ms(sel.ttfbMs)], ['LCP', ms(sel.lcpMs)],
                ['Long tasks', `${sel.longTasks || 0} (${ms(sel.longTaskMs)})`],
                ['Failed requests', String(sel.failedRequests || 0)], ['JS errors', String(sel.errorCount || 0)],
                ['Connection', sel.effectiveType || '—'], ['Memory', sel.memoryUsedMB != null ? `${sel.memoryUsedMB} MB` : '—'],
                ['Auto-healed', String(sel.healedCount || 0)],
                ['URL', sel.url || '—'], ['Agent', sel.userAgent || '—'],
              ].map(([k, v]) => (
                <React.Fragment key={k as string}><span style={{ color: T.muted, fontWeight: 700 }}>{k}</span><span style={{ wordBreak: 'break-word' }}>{v as string}</span></React.Fragment>
              ))}
            </div>
            {(sel.threats || []).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.warn, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><WifiOff size={13} /> Threat signals</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sel.threats!.map(t => <span key={t} style={{ padding: '3px 9px', borderRadius: 999, background: `${T.warn}22`, color: T.warn, fontSize: 11, fontWeight: 700 }}>{t}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserHealth;
