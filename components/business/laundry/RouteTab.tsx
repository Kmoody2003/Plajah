// RouteTab - the day's pickup & delivery stops (sorted by window, optionally one driver), printable, plus
// "generate this week" for standing commercial pickup schedules. No maps / routing optimisation (deferred).
// Server hook for automation: POST /api/laundry/schedule/generate {businessUid, from, to} from any daily cron.
import React, { useMemo, useState } from 'react';
import { computeTicketTotals } from '../../../services/ticketCore';
import { routeListHtml, routeStops } from '../../../services/laundryCore';
import { printHtml } from '../../../services/laundryPrint';
import { isoDate } from '../../../services/commercialCore';
import { useLaundry, useRun, Err, Ok, inp, lbl, pill, type ToolProps } from './shared';

export default function RouteTab({ api, cfg, tickets, onOpenTicket, onChanged, businessName }: ToolProps) {
  const { laundry, settings } = useLaundry(api);
  const { busy, err, msg, setMsg, run } = useRun();
  const [date, setDate] = useState(() => isoDate(Date.now(), settings.tzOffsetMin)); const [driver, setDriver] = useState('');
  const drivers = useMemo(() => [...new Map(tickets.filter(t => t.assignedTo).map(t => [t.assignedTo!.id, t.assignedTo!.name])).entries()], [tickets]);
  const stops = routeStops(tickets.filter(t => !['picked_up', 'cancelled'].includes(t.stage) || t.subject.dl_date === date), date, { driverId: driver || undefined, balanceCents: t => (t.saleOrderId ? 0 : computeTicketTotals(t, cfg).balanceCents) });
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Route date" className={inp + ' !w-auto'} />
        <select value={driver} onChange={e => setDriver(e.target.value)} aria-label="Driver filter" className={inp + ' !w-auto'}><option value="">All drivers</option>{drivers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <button onClick={() => { if (!printHtml(routeListHtml(stops, { date, businessName, title: 'Route list' }))) setMsg('Allow pop-ups to print.'); }} className={pill}>Print route list</button>
        {laundry && <button disabled={busy} onClick={() => run(() => laundry.generateSchedule({}), r => { setMsg(`Created ${r.created.length} draft ticket(s) for ${r.from} to ${r.to}.`); onChanged(); })} className={pill}>Generate this week's pickups</button>}
      </div>
      <Err text={err} /><Ok text={msg} />
      <div className={lbl}>{stops.length} stop(s) on {date} · sorted by window · no map routing yet</div>
      {stops.map(s => (
        <button key={`${s.ticketId}${s.kind}`} onClick={() => { const t = tickets.find(x => x.id === s.ticketId); if (t) onOpenTicket(t); }} className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2 text-sm">
          <div className="flex items-center gap-2"><b className="font-mono text-xs">{[s.start, s.end].filter(Boolean).join('-') || 'anytime'}</b><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${s.kind === 'PICKUP' ? 'bg-[#00B4D8]/25 text-[#7fe3f5]' : 'bg-[#06D6A0]/25 text-emerald-200'}`}>{s.kind === 'PICKUP' ? 'pick up' : 'deliver'}</span><b>{s.number}</b><span className="truncate">{s.customer}</span><span className="ml-auto text-[10px] text-white/50">{s.driverName || 'unassigned'}</span></div>
          <div className="text-xs text-white/50 truncate">{s.address || 'No address yet'}{s.balanceNote ? ` · ${s.balanceNote}` : ''}</div>
        </button>))}
      {!stops.length && <div className="text-xs text-white/40">No stops that day. Set a ticket's Pickup & delivery panel (date, window, driver) and it shows up here.</div>}
    </div>
  );
}
