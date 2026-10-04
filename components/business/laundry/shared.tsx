// Shared bits for the laundromat plug-ins (ticket panels + board desk). Nothing here is laundry-engine logic:
// rules live in services/laundryCore.ts / weighedCore.ts / commercialCore.ts / walletPromoCore.ts.
import React, { useCallback, useEffect, useState } from 'react';
import type { Ticket, TicketConfig } from '../../../services/ticketCore';
import type { TicketApi } from '../../../services/ticketService';
import { laundryApiFor, type LaundryApi } from '../../../services/laundryService';
import { DEFAULT_LAUNDRY, type LaundrySettings } from '../../../services/laundryDefaults';

export const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
export const money = (c: number) => `$${(Math.max(0, c) / 100).toFixed(2)}`;
export const toCents = (s: string) => { const v = Math.round(parseFloat(s) * 100); return Number.isFinite(v) ? v : 0; };
export const inp = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-white/30 w-full text-white';
export const lbl = 'text-[10px] font-black uppercase tracking-widest text-white/40';
export const pill = 'px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-widest disabled:opacity-40';
export const primary = 'px-4 py-2 rounded-lg text-xs font-black uppercase text-white disabled:opacity-40';

/** Props every ticket-detail panel receives from components/business/ticketPlugins.tsx. */
export interface PanelProps { api: TicketApi; cfg: TicketConfig; ticket: Ticket; apply: (t: Ticket) => void; closed: boolean }
/** Props every board tool receives. */
export interface ToolProps { api: TicketApi; cfg: TicketConfig; tickets: Ticket[]; onOpenTicket: (t: Ticket) => void; onChanged: () => void; businessName?: string }

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2"><div className={lbl}>{title}</div>{right}</div>
      {children}
    </section>
  );
}

export function useRun() {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const run = useCallback(async <T,>(fn: () => Promise<T>, after?: (r: T) => void): Promise<T | undefined> => {
    setBusy(true); setErr('');
    try { const r = await fn(); after?.(r); return r; } catch (e: any) { setErr(e?.message || 'Something went wrong.'); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, err, setErr, msg, setMsg, run };
}

export function useLaundry(api: TicketApi): { laundry: LaundryApi | null; settings: LaundrySettings; ready: boolean } {
  const laundry = laundryApiFor(api);
  const [settings, setSettings] = useState<LaundrySettings>(DEFAULT_LAUNDRY); const [ready, setReady] = useState(false);
  useEffect(() => { let on = true; if (!laundry) return; laundry.settings().then(s => on && setSettings(s)).catch(() => {}).finally(() => on && setReady(true)); return () => { on = false; }; }, [laundry]);
  return { laundry, settings, ready };
}

export const Err = ({ text }: { text: string }) => (text ? <div role="alert" className="rounded-xl border border-[#D40055]/50 bg-[#D40055]/10 p-2.5 text-xs font-bold text-[#ff7aa8]">{text}</div> : null);
export const Ok = ({ text }: { text: string }) => (text ? <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-2.5 text-xs font-bold text-emerald-200">{text}</div> : null);
