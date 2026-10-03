// acctPulseLive — the Firebase side of Budget Pulse: the realtime hook, projects, alert acknowledgement,
// per-user alert preferences and the "run the sweep now" call. All maths lives in services/acctPulse.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, auth } from './firebase';
import { onSnapshot } from './safeSnapshot';
import { callGemini } from './geminiService';
import type { AcctAccount, AcctAlert, AcctBudget, AcctExpense, AcctJournal, AcctProject, Organization } from '../types';
import { computePulse, type AlertPref, type DeptPulse, type PulseAlert, type PulseReport, type PulseScope, deriveAlerts, fiscalYearOfDate, deptHeadline, usd0 } from './acctPulse';

const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
export const localToday = (d = new Date()) => d.toLocaleDateString('en-CA');   // YYYY-MM-DD in the viewer's own timezone

export interface PulseAccess { full: boolean; headOf: string[]; canRaiseBudget: boolean; isDeptHead: boolean }
/** What this viewer may see — mirrors firestore.rules (journals: finance/accounting/pastor only; heads: budgets + expenses). */
export function pulseAccess(org: Organization, uid: string): PulseAccess {
  const inL = (k: keyof Organization) => Array.isArray((org as any)[k]) && (org as any)[k].includes(uid);
  const full = org.creatorId === uid || inL('admins') || inL('financeUids') || inL('accountingUids') || inL('accountingViewUids') || inL('pastorUids');
  const headOf = (org.ministries || []).filter(m => m.headUids?.includes(uid)).map(m => m.id);
  return { full, headOf, canRaiseBudget: org.creatorId === uid || inL('admins') || inL('financeUids') || inL('accountingUids'), isDeptHead: !full && (headOf.length > 0 || inL('leaderUids')) };
}

export interface LivePulse {
  report: PulseReport | null; alerts: PulseAlert[];
  loading: boolean; updatedAt: number; restricted: boolean; errors: string[];
  access: PulseAccess; data: { accounts: AcctAccount[]; journals: AcctJournal[]; expenses: AcctExpense[]; budgets: AcctBudget[]; projects: AcctProject[] };
  fiscalYear: number;
}

/**
 * Realtime Budget Pulse. Listens to journals, expenses, budgets, accounts and projects, coalesces bursts
 * (350 ms) and recomputes with useMemo, so a posted journal / approved expense / Stripe gift / budget edit
 * shows up within seconds. Denied listeners degrade: heads get a department-only view built from budgets +
 * expenses; anything else unreadable is simply left out (and `restricted` says so).
 */
export function useBudgetPulse(org: Organization, fiscalYear?: number, scope: PulseScope = 'YEAR'): LivePulse {
  const uid = auth.currentUser?.uid || '';
  const access = useMemo(() => pulseAccess(org, uid), [org, uid]);
  const [data, setData] = useState<LivePulse['data']>({ accounts: [], journals: [], expenses: [], budgets: [], projects: [] });
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [updatedAt, setUpdatedAt] = useState(0);
  const [today, setToday] = useState(localToday());
  const buf = useRef<Partial<LivePulse['data']>>({});
  const timer = useRef<any>(null);

  useEffect(() => {
    setData({ accounts: [], journals: [], expenses: [], budgets: [], projects: [] }); setLoaded({}); setErrors({}); buf.current = {};
    const flush = () => { timer.current = null; const b = buf.current; buf.current = {}; setData(prev => ({ ...prev, ...b })); setUpdatedAt(Date.now()); };
    const sched = () => { if (!timer.current) timer.current = setTimeout(flush, 350); };
    const sub = (name: keyof LivePulse['data'], col: string, map?: (x: any) => any) => onSnapshot(
      query(collection(db, col), where('orgId', '==', org.id)),
      s => { (buf.current as any)[name] = s.docs.map(d => ({ id: d.id, ...d.data() })).map(map || (x => x)); setLoaded(p => ({ ...p, [name]: true })); setErrors(p => { if (!p[name]) return p; const n = { ...p }; delete n[name]; return n; }); sched(); },
      e => { setLoaded(p => ({ ...p, [name]: true })); setErrors(p => ({ ...p, [name]: (e as any)?.code || 'error' })); },
    );
    const unsubs = [
      sub('budgets', 'acctBudgets'), sub('accounts', 'acctAccounts'), sub('expenses', 'acctExpenses'), sub('projects', 'acctProjects'),
      // Journals are finance/pastor-only by rule; a department head's listener is skipped (never fires a denied error).
      ...(access.full ? [sub('journals', 'acctJournals')] : []),
    ];
    if (!access.full) setLoaded(p => ({ ...p, journals: true }));
    const day = setInterval(() => setToday(localToday()), 5 * 60_000);
    return () => { unsubs.forEach(u => u()); clearInterval(day); if (timer.current) clearTimeout(timer.current); };
  }, [org.id, access.full]);

  const fy = fiscalYear ?? fiscalYearOfDate(today, org.financeSettings?.fiscalYearStartMonth || 1);
  const mode = access.full && !errors.journals ? 'FULL' : 'EXPENSES_ONLY';
  const input = useMemo(() => ({
    orgId: org.id, today, fiscalYear: fy, scope, accounts: data.accounts, journals: data.journals, expenses: data.expenses, budgets: data.budgets,
    ministries: org.ministries || [], funds: org.givingFunds || [], projects: data.projects, recurring: org.financeSettings?.recurringBills, settings: org.financeSettings || null,
    mode: mode as 'FULL' | 'EXPENSES_ONLY', visibleDeptIds: access.full ? undefined : access.headOf,
  }), [org, today, fy, scope, data, mode, access]);
  const ready = !!loaded.budgets && !!loaded.expenses && !!loaded.journals;
  const report = useMemo(() => (ready ? computePulse(input) : null), [ready, input]);
  const alerts = useMemo(() => (ready && !org.financeSettings?.pulseAlertsOff ? deriveAlerts(input) : []), [ready, input, org.financeSettings?.pulseAlertsOff]);
  return {
    report, alerts, loading: !ready, updatedAt, access, data, fiscalYear: fy,
    restricted: !access.full || !!errors.journals, errors: Object.entries(errors).map(([k, v]) => `${k}: ${v}`),
  };
}

// ── Projects ───────────────────────────────────────────────────────────────────────────────────
export const projectDocId = (orgId: string, slug: string) => `p_${orgId.replace(/[^A-Za-z0-9_-]/g, '_')}_${slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}_${Date.now().toString(36)}`;
export async function saveProject(orgId: string, p: Partial<AcctProject> & { name: string; budget: number; startDate: string; endDate: string }): Promise<string> {
  const uid = auth.currentUser?.uid; if (!uid) throw new Error('Sign in required');
  if (!(p.budget >= 0) || p.endDate < p.startDate) throw new Error('Check the budget and dates.');
  const id = p.id || projectDocId(orgId, p.name);
  const now = Date.now();
  await setDoc(doc(db, 'acctProjects', id), strip({ status: 'ACTIVE', createdBy: uid, createdAt: now, ...p, id, orgId, updatedAt: now }), { merge: true });
  return id;
}

// ── Alert acknowledgement / snooze (persisted per user: on the alert doc when possible, always locally) ────
const lsKey = (uid: string, orgId: string) => `pulseAck:${uid}:${orgId}`;
export type AckMap = Record<string, { ack?: number; snooze?: number }>;
const readLs = (uid: string, orgId: string): AckMap => { try { return JSON.parse(localStorage.getItem(lsKey(uid, orgId)) || '{}'); } catch { return {}; } };
export function useAlertAcks(orgId: string): { acks: AckMap; stored: AcctAlert[]; ack: (id: string, snoozeUntil?: number) => Promise<void> } {
  const uid = auth.currentUser?.uid || '';
  const [acks, setAcks] = useState<AckMap>(() => readLs(uid, orgId));
  const [stored, setStored] = useState<AcctAlert[]>([]);
  useEffect(() => {
    setAcks(readLs(uid, orgId));
    // Server-created alerts (readable by finance via acctRead and by heads via audienceUids). Merge their per-user ack state.
    const u1 = onSnapshot(query(collection(db, 'acctAlerts'), where('orgId', '==', orgId)), s => setStored(s.docs.map(d => ({ id: d.id, ...d.data() } as AcctAlert))), () => {
      // Not a finance reader: fall back to alerts addressed to me.
      onSnapshot(query(collection(db, 'acctAlerts'), where('orgId', '==', orgId), where('audienceUids', 'array-contains', uid)), s => setStored(s.docs.map(d => ({ id: d.id, ...d.data() } as AcctAlert))), () => {});
    });
    return () => u1();
  }, [orgId, uid]);
  const merged = useMemo<AckMap>(() => {
    const m: AckMap = { ...acks };
    stored.forEach(a => { const x = a.acknowledgedBy?.[uid], sn = a.snoozedUntil?.[uid]; if (x || sn) m[a.id] = { ack: Math.max(m[a.id]?.ack || 0, x || 0) || undefined, snooze: Math.max(m[a.id]?.snooze || 0, sn || 0) || undefined }; });
    return m;
  }, [acks, stored, uid]);
  const ack = async (id: string, snoozeUntil?: number) => {
    const now = Date.now();
    const next = { ...readLs(uid, orgId), [id]: snoozeUntil ? { snooze: snoozeUntil } : { ack: now } };
    try { localStorage.setItem(lsKey(uid, orgId), JSON.stringify(next)); } catch { /* private mode */ }
    setAcks(next);
    if (stored.some(a => a.id === id)) {
      try { await updateDoc(doc(db, 'acctAlerts', id), snoozeUntil ? { [`snoozedUntil.${uid}`]: snoozeUntil } : { [`acknowledgedBy.${uid}`]: now }); } catch { /* local copy is enough */ }
    }
  };
  return { acks: merged, stored, ack };
}
/** Visible = not acknowledged-after-creation and not currently snoozed. */
export const isMuted = (m: AckMap, id: string, now = Date.now()) => !!m[id] && ((m[id].ack ?? 0) > 0 || (m[id].snooze ?? 0) > now);

// ── Per-user notification level (users/{uid}.elevateAlertPrefs.{orgId}) ──────────────────────────
export async function setAlertPref(orgId: string, level: AlertPref): Promise<void> {
  const uid = auth.currentUser?.uid; if (!uid) throw new Error('Sign in required');
  await updateDoc(doc(db, 'users', uid), { [`elevateAlertPrefs.${orgId}`]: level });
}

export async function getAlertPref(orgId: string): Promise<AlertPref> {
  const uid = auth.currentUser?.uid; if (!uid) return 'WATCH';
  try { const s = await getDoc(doc(db, 'users', uid)); return ((s.data() as any)?.elevateAlertPrefs?.[orgId] as AlertPref) || 'WATCH'; } catch { return 'WATCH'; }
}

// ── Server sweep (creates the deduped alert docs + notifications even when nobody has the page open) ──
export async function requestAlertSweep(orgId: string): Promise<{ created: number; notified: number } | null> {
  try {
    const k = `pulseSweep:${orgId}`;
    const last = Number(localStorage.getItem(k) || 0);
    if (Date.now() - last < 30 * 60_000) return null;
    localStorage.setItem(k, String(Date.now()));
    const token = await auth.currentUser?.getIdToken(); if (!token) return null;
    const res = await fetch('/api/elevate/budget-alerts/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ orgId }) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// ── ARIA: narrates drivers that were ALREADY computed deterministically; falls back to the same facts. ──
export async function askAriaWhy(org: Organization, d: DeptPulse): Promise<string> {
  const facts = [`Department: ${d.name}`, deptHeadline(d), ...d.narrative, ...d.drivers.map(x => `Driver: ${x.label} — ${x.note}`)].join('\n');
  const fallback = [deptHeadline(d), ...d.narrative.slice(0, 4)].join(' ');
  try {
    const txt = await callGemini(
      `You are ARIA, the finance assistant for ${org.name}. In 2-4 calm, plain sentences for a non-accountant, explain why this department's budget looks the way it does and the single most useful next step. Use ONLY these facts; do not invent numbers.\n\n${facts}`,
      { temperature: 0.3 });
    const out = String(txt || '').trim();
    return out.length > 20 ? out : fallback;
  } catch { return fallback; }
}
export { usd0 };
