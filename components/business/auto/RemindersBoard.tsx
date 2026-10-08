// RemindersBoard - shop-wide "service due" list for auto repair. Predictions are computed in the browser from each
// vehicle's own odometer + service history with SHOP-DEFAULT intervals (not OEM schedules; licensed OEM data is a
// planned paid add-on). Reminders go out as push / email through the server; SMS is a disabled seam.
import React, { useEffect, useMemo, useState } from 'react';
import { predictNextService, resolveIntervals, INTERVALS_DISCLAIMER, type ServicePrediction } from '../../../services/serviceReminderCore';
import { describeVehicle, type Vehicle } from '../../../services/vehicleCore';
import { autoApiFor } from './autoApi';
import type { BoardPanelProps } from '../tickets/panelRegistry';

const COLOR: Record<string, string> = { OVERDUE: '#D40055', DUE_SOON: '#FF8C00' };
const fmt = (t?: number) => (t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

export default function RemindersBoard({ api, cfg }: BoardPanelProps) {
  const auto = useMemo(() => autoApiFor(api), [api]);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => { if (open && auto) auto.listVehicles().then(setVehicles).catch(() => setVehicles([])); }, [open, auto]);
  const rows = useMemo(() => {
    const out: { v: Vehicle; p: ServicePrediction }[] = [];
    for (const v of vehicles || []) for (const p of predictNextService({ mileage: v.mileage, services: v.services, intervals: resolveIntervals((cfg.panelConfig as any)?.reminders?.intervals, v.intervalOverrides) })) if (p.status === 'OVERDUE' || p.status === 'DUE_SOON') out.push({ v, p });
    return out.sort((a, b) => (a.p.status === b.p.status ? (a.p.estimatedDueDate ?? 0) - (b.p.estimatedDueDate ?? 0) : a.p.status === 'OVERDUE' ? -1 : 1));
  }, [vehicles, cfg]);
  if (!auto) return null;
  const send = async (v: Vehicle, p: ServicePrediction) => {
    const k = `${v.id}_${p.key}`; setMsg(m => ({ ...m, [k]: 'Sending...' }));
    try { const r = await auto.sendReminder(v.id, p.key); setMsg(m => ({ ...m, [k]: r.reachable ? `Sent${r.sent.push ? ' (push)' : ''}${r.sent.email ? ' (email)' : ''}` : 'No push or email on file for this customer. Call them.' })); }
    catch (e: any) { setMsg(m => ({ ...m, [k]: e?.message || 'Could not send.' })); }
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]" data-testid="reminders-board">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full min-h-[48px] px-4 flex items-center gap-2 text-left">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/50 flex-1">Service reminders {vehicles ? `· ${rows.length} due` : ''}</span><span className="text-white/40">{open ? '−' : '+'}</span></button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {!vehicles && <div className="text-xs text-white/40">Loading...</div>}
          {vehicles && !rows.length && <div className="text-xs text-white/50">Nothing is due. Reminders appear after vehicles have a service recorded (use "Add to customer's vehicle history" on finished tickets).</div>}
          {rows.map(({ v, p }) => {
            const k = `${v.id}_${p.key}`;
            return (
              <div key={k} className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLOR[p.status] }} />
                <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{describeVehicle(v)} · {p.label}</div>
                  <div className="text-[11px] text-white/50 truncate">{v.ownerCustomerName || 'Customer'} · {p.status === 'OVERDUE' ? 'overdue' : 'due soon'}{p.estimatedDueDate ? ` · ~${fmt(p.estimatedDueDate)}` : ''}{p.milesLeft !== undefined ? ` · ${p.milesLeft > 0 ? `${Math.round(p.milesLeft / 50) * 50} mi left` : `${Math.round(-p.milesLeft / 50) * 50} mi over`}` : ''} · {p.rateSource === 'HISTORY' ? 'own driving rate' : 'default rate'}</div>
                  {msg[k] && <div className="text-[11px] text-amber-200">{msg[k]}</div>}</div>
                <button onClick={() => send(v, p)} className="shrink-0 min-h-[40px] px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase">Remind</button>
              </div>
            );
          })}
          <div className="text-[10px] text-white/40">{INTERVALS_DISCLAIMER} Text messages are not enabled yet (push and email only).</div>
        </div>
      )}
    </div>
  );
}
