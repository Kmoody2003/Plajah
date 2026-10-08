// SpendingUi — shared friction-reducers for the finance surfaces: toasts (with Undo), skeletons, keyboard shortcuts,
// and the cached spending-data hook that powers Money Inbox, the tab badges and the ElevateOps nav count.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, Keyboard, TriangleAlert, X } from 'lucide-react';
import type { Organization, OrgMembership, AcctExpense } from '../../../../types';
import { FINANCE_CHANGED, EMPTY_BUNDLE, buildInbox, inboxCount, loadSpending, spendingPerms, type InboxItem, type SpendingBundle, type SpendingPerms } from '../../../../services/acctSpending';
import type { FinanceSnapshot } from '../../../../services/chmsFinance';
import { card, label } from './shared';

// ── toasts ─────────────────────────────────────────────────────────────────────
export interface ToastOpts { tone?: 'ok' | 'warn' | 'bad' | 'info'; undo?: () => void | Promise<void>; ms?: number }
interface ToastItem extends ToastOpts { id: number; msg: string }
type ToastFn = (msg: string, opts?: ToastOpts) => void;
const ToastCtx = createContext<ToastFn | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const toast = useCallback<ToastFn>((msg, opts) => {
    const id = ++seq.current;
    setItems(l => [...l.slice(-3), { id, msg, ...opts }]);
    setTimeout(() => setItems(l => l.filter(t => t.id !== id)), opts?.ms ?? (opts?.undo ? 7000 : 3800));
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed left-0 right-0 bottom-20 sm:bottom-6 z-[300] flex flex-col items-center gap-2 px-4 pointer-events-none" role="status" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-3 max-w-md w-full sm:w-auto px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur text-xs font-bold animate-[fadeIn_.15s_ease-out] ${t.tone === 'bad' ? 'bg-red-950/90 border-red-500/40 text-red-100' : t.tone === 'warn' ? 'bg-amber-950/90 border-amber-500/40 text-amber-100' : 'bg-zinc-900/95 border-white/15 text-white'}`}>
            {t.tone === 'bad' || t.tone === 'warn' ? <TriangleAlert size={14} className="shrink-0" /> : t.tone === 'info' ? <Info size={14} className="shrink-0 text-white/60" /> : <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />}
            <span className="flex-1 min-w-0">{t.msg}</span>
            {t.undo && <button onClick={async () => { setItems(l => l.filter(x => x.id !== t.id)); try { await t.undo!(); } catch { /* surfaced by caller */ } }} className="shrink-0 text-small-orange font-black uppercase tracking-widest text-[10px]">Undo</button>}
            <button aria-label="Dismiss" onClick={() => setItems(l => l.filter(x => x.id !== t.id))} className="shrink-0 text-white/40 hover:text-white"><X size={12} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};
/** Works with or without a provider (falls back to alert so nothing is ever silent). */
export const useToast = (): ToastFn => useContext(ToastCtx) || ((m, o) => { if (o?.tone === 'bad') alert(m); else console.info('[toast]', m); });

/** Run an action: spinner flag + friendly failure toast (instead of alert()). */
export function useDo() {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string | ((r: T) => string | undefined), undo?: (r: T) => (() => void | Promise<void>) | undefined): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn(); const msg = typeof ok === 'function' ? ok(r) : ok;
      if (msg) toast(msg, { undo: undo ? undo(r) : undefined });
      return r;
    } catch (e: any) { toast(e?.message || 'Something went wrong — nothing was changed.', { tone: 'bad' }); }
    finally { setBusy(false); }
    return undefined;
  }, [toast]);
  return { busy, run };
}

// ── deferred commit: true "Undo" for actions the rules won't let us revert afterwards (approve/reject/withdraw) ──
const pendingCommits = new Map<number, { timer: any; run: () => void }>();
let deferSeq = 0;
/** Commit everything still waiting (called on unmount / tab close so nothing is lost). */
export function flushDeferred() { for (const p of Array.from(pendingCommits.values())) { clearTimeout(p.timer); p.run(); } pendingCommits.clear(); }
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushDeferred);
export function useDeferred() {
  const toast = useToast();
  return useCallback((msg: string, commit: () => Promise<unknown>, revert: () => void, ms = 5000) => {
    const id = ++deferSeq;
    const run = () => { pendingCommits.delete(id); commit().catch((e: any) => { revert(); toast(e?.message || 'Could not save that change.', { tone: 'bad' }); }); };
    const timer = setTimeout(run, ms);
    pendingCommits.set(id, { timer, run });
    toast(msg, { ms, undo: () => { clearTimeout(timer); pendingCommits.delete(id); revert(); } });
  }, [toast]);
}

// ── skeleton ───────────────────────────────────────────────────────────────────
export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-3" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className={`${card} p-5 animate-pulse`}>
        <div className="h-3 w-1/3 rounded bg-white/10" /><div className="h-2.5 w-2/3 rounded bg-white/5 mt-3" /><div className="h-8 w-28 rounded-full bg-white/5 mt-4" />
      </div>
    ))}
  </div>
);

// ── keyboard shortcuts ─────────────────────────────────────────────────────────
const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); };
/** keys: 'n', '/', '?', or 'g i' (chord). Ignored while typing in a field or holding a modifier. */
export function useHotkeys(map: Record<string, () => void>, enabled = true) {
  const ref = useRef(map); ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    let pending = ''; let timer: any;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const k = e.key;
      if (pending) { const fn = ref.current[`${pending} ${k.toLowerCase()}`]; pending = ''; clearTimeout(timer); if (fn) { e.preventDefault(); fn(); return; } }
      if (k === 'g') { pending = 'g'; clearTimeout(timer); timer = setTimeout(() => { pending = ''; }, 1200); return; }
      const fn = ref.current[k.length === 1 ? k.toLowerCase() : k]; if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer); };
  }, [enabled]);
}

export const SHORTCUTS: [string, string][] = [['g  then  h', 'Home'], ['g  then  i', 'Money Inbox'], ['g  then  s', 'Spending'], ['g  then  v', 'Vendors'], ['n', 'New request / bill'], ['/', 'Search'], ['?', 'This sheet'], ['Esc', 'Close']];
export const ShortcutSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className={`${card} bg-zinc-950 p-6 w-full max-w-sm`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-black text-white flex items-center gap-2"><Keyboard size={14} className="text-small-orange" /> Keyboard shortcuts</h3><button onClick={onClose} className="text-white/40 hover:text-white"><X size={14} /></button></div>
        <div className="space-y-2">{SHORTCUTS.map(([k, d]) => <div key={k} className="flex items-center justify-between text-xs"><span className="text-white/70">{d}</span><kbd className="px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-[10px] font-black text-white tracking-widest">{k}</kbd></div>)}</div>
        <p className={`${label} mt-4`}>Tip: shortcuts pause while you type in a field.</p>
      </div>
    </div>
  );
};

// ── spending data hook (cached + deduped + optimistic patch) ───────────────────
const cache = new Map<string, { bundle: SpendingBundle; at: number }>();
const inflight = new Map<string, Promise<SpendingBundle>>();
const keyOf = (orgId: string, p: SpendingPerms) => `${orgId}|${+p.canApprove}${+p.canManage}${+p.canViewBooks}${+p.canGiving}${+p.isOwner}`;

export function useSpendingBundle(org: Organization, member: OrgMembership | null, enabled = true) {
  const perms = spendingPerms(member, org);
  const key = keyOf(org.id, perms);
  const permsRef = useRef(perms); permsRef.current = perms;
  const orgRef = useRef(org); orgRef.current = org;
  const [bundle, setBundle] = useState<SpendingBundle | null>(cache.get(key)?.bundle || null);
  const [loading, setLoading] = useState(!cache.get(key));
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async (force = true) => {
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at < 15000) { setBundle(hit.bundle); setLoading(false); return; }
    let p = inflight.get(key);
    if (!p) { p = loadSpending(orgRef.current, permsRef.current).finally(() => inflight.delete(key)); inflight.set(key, p); }
    try { const b = await p; cache.set(key, { bundle: b, at: Date.now() }); if (alive.current) setBundle(b); }
    catch { if (alive.current) setBundle(b0 => b0 || EMPTY_BUNDLE); }
    finally { if (alive.current) setLoading(false); }
  }, [key]);

  useEffect(() => { if (!enabled) return; reload(false); }, [enabled, reload]);
  useEffect(() => {
    if (!enabled) return;
    const h = () => { reload(true); };
    window.addEventListener(FINANCE_CHANGED, h); return () => window.removeEventListener(FINANCE_CHANGED, h);
  }, [enabled, reload]);

  /** Optimistic: show the change instantly; the service's emitFinanceChanged() then reconciles with the server. */
  const patch = useCallback((id: string, p: Partial<AcctExpense>) => {
    setBundle(b => { if (!b) return b; const nb = { ...b, expenses: b.expenses.map(e => e.id === id ? { ...e, ...p } : e) }; cache.set(key, { bundle: nb, at: Date.now() }); return nb; });
  }, [key]);
  return { bundle, perms, loading, reload, patch };
}

/** Items + badge count for any surface. Pass the finance snapshot when you have it for the richer giving chores. */
export function useMoneyInbox(org: Organization, member: OrgMembership | null, snap?: FinanceSnapshot | null, enabled = true) {
  const { bundle, perms, loading, reload, patch } = useSpendingBundle(org, member, enabled);
  const [seen, setSeen] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(`inboxSeen:${org.id}`) || '[]')); } catch { return new Set(); } });
  const dismiss = useCallback((id: string) => setSeen(s => { const n = new Set(s); n.add(id); try { localStorage.setItem(`inboxSeen:${org.id}`, JSON.stringify(Array.from(n).slice(-200))); } catch { /* private mode */ } return n; }), [org.id]);
  const items: InboxItem[] = useMemo(() => bundle ? buildInbox({ org, member, perms, bundle, snap, seen }) : [], [bundle, org, member, perms, snap, seen]);
  return { items, count: inboxCount(items), loading, bundle, perms, reload, patch, dismiss };
}

/** A tiny count bubble for nav/tab labels. */
export const CountBadge: React.FC<{ n: number }> = ({ n }) => n > 0 ? <span className="ml-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-small-orange text-black text-[9px] font-black leading-none">{n > 99 ? '99+' : n}</span> : null;
