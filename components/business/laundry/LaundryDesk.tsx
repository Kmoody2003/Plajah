// LaundryDesk - board tool for the laundromat: scan a bag tag (camera, USB wedge scanner, or typed) at ANY stage to
// find/move/open the ticket, "where is it" lookup, today's due/overdue list, route list, commercial accounts, settings.
// Plugged into TicketsBoard via TicketConfig.ui.boardTools = ['laundry-desk'] (components/business/ticketPlugins.tsx).
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import BarcodeScanner from '../../inventory/BarcodeScanner';
import { allowedNext, stageById, stageKind, type Ticket } from '../../../services/ticketCore';
import { dueAtOf, isOverdue, parseScan, unclaimedActions, whereIs, pickUpTags, readyAtOf } from '../../../services/laundryCore';
import { useLaundry, useRun, Err, Ok, GRAD, inp, lbl, pill, money, type ToolProps } from './shared';

const AccountsTab = lazy(() => import('./AccountsTab'));
const RouteTab = lazy(() => import('./RouteTab'));
const SettingsTab = lazy(() => import('./SettingsTab'));
type Tab = 'scan' | 'today' | 'route' | 'accounts' | 'settings';

export default function LaundryDesk(props: ToolProps) {
  const { api, cfg, tickets, onOpenTicket, onChanged } = props;
  const { laundry, settings } = useLaundry(api);
  const { busy, err, setErr, msg, setMsg, run } = useRun();
  const [open, setOpen] = useState(false); const [tab, setTab] = useState<Tab>('scan');
  const [code, setCode] = useState(''); const [cam, setCam] = useState(false);
  const [found, setFound] = useState<{ ticket: Ticket; tag?: string } | null>(null);
  const inRef = useRef<HTMLInputElement>(null);

  const lookup = async (raw: string) => {
    setErr(''); setMsg(''); setFound(null);
    const p = parseScan(raw, cfg.prefix); if (!p) return setErr('That does not look like a ticket number or bag tag.');
    let t = tickets.find(x => x.number === p.ticketNumber) || null;
    if (!t) { try { t = (await api.list(p.ticketNumber)).find(x => x.number === p.ticketNumber) || null; } catch { /* fall through */ } }
    if (!t) return setErr(`No ticket ${p.ticketNumber} here.`);
    setFound({ ticket: t, ...(p.n ? { tag: `${p.ticketNumber}-${p.n}` } : {}) }); setCode('');
  };
  useEffect(() => { if (open && tab === 'scan') inRef.current?.focus(); }, [open, tab]);

  const w = found ? whereIs(found.ticket, cfg) : null;
  const next = found ? allowedNext(cfg, found.ticket.stage).map(id => stageById(cfg, id)!).filter(s => s && s.kind !== 'CANCELLED') : [];
  const move = (to: string) => found && run(() => api.transition(found.ticket.id, to), r => { setFound({ ...found, ticket: r.ticket }); onChanged(); setMsg(`Moved to ${stageById(cfg, to)?.label}.`); });
  const handOver = () => found?.tag && run(async () => {
    const r = pickUpTags(found.ticket.subject, [found.tag!]);
    return api.update(found.ticket.id, { subject: { picked_tags: r.subject.picked_tags || [], missing_tags: r.subject.missing_tags || [] } });
  }, nt => { setFound({ ...found!, ticket: nt }); onChanged(); setMsg(`${found!.tag} handed over.`); });

  const now = Date.now();
  const active = useMemo(() => tickets.filter(t => !['DONE', 'CANCELLED'].includes(stageKind(cfg, t.stage) || '')), [tickets, cfg]);
  const overdue = active.filter(t => stageKind(cfg, t.stage) !== 'READY' && isOverdue(dueAtOf(t), now)).sort((a, b) => (dueAtOf(a) || 0) - (dueAtOf(b) || 0));
  const dueSoon = active.filter(t => stageKind(cfg, t.stage) !== 'READY' && !isOverdue(dueAtOf(t), now) && (dueAtOf(t) || Infinity) - now < 8 * 3_600_000);
  const unclaimed = unclaimedActions(tickets, cfg, now, {}, settings.unclaimed);
  const waiting = active.filter(t => stageKind(cfg, t.stage) === 'READY');

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => <button onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${tab === id ? 'bg-white text-black' : 'bg-white/5 text-white/50'}`}>{label}</button>;
  const Row = ({ t, extra }: { t: Ticket; extra?: string }) => (
    <button onClick={() => onOpenTicket(t)} className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2 text-sm flex items-center gap-2">
      <b className="font-black italic">{t.number}</b><span className="truncate">{t.customer.name}</span>{t.subject.rack ? <span className="text-[10px] text-white/40">rack {String(t.subject.rack)}</span> : null}<span className="ml-auto text-[10px] text-white/50">{extra}</span>
    </button>);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 space-y-3" data-testid="laundry-desk">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={lbl}>Laundry desk</span>
        <form className="flex-1 min-w-[220px] flex gap-2" onSubmit={e => { e.preventDefault(); setOpen(true); setTab('scan'); if (code.trim()) lookup(code.trim()); }}>
          <input ref={inRef} value={code} onChange={e => setCode(e.target.value)} placeholder="Scan or type a bag tag (WF-217-2)" aria-label="Scan bag tag" className={inp} autoComplete="off" />
          <button type="submit" className={pill}>Find</button>
          <button type="button" onClick={() => setCam(true)} className={pill}>Camera</button>
        </form>
        <button onClick={() => setOpen(!open)} className={pill} aria-expanded={open}>{open ? 'Hide' : 'More'}</button>
        {(overdue.length > 0 || unclaimed.length > 0) && <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-[#D40055]/25 text-[#ff7aa8]">{overdue.length} late · {unclaimed.length} unclaimed</span>}
      </div>
      <Err text={err} /><Ok text={msg} />
      {found && w && (
        <div className="rounded-2xl p-3 space-y-2" style={{ background: 'linear-gradient(135deg,#6B009922,#D4005522)' }} data-testid="scan-result">
          <div className="flex items-start justify-between gap-2"><div><div className="text-xl font-black italic leading-none">{w.number} <span className="text-sm not-italic font-bold">{w.customer}</span></div><div className="text-xs text-white/70 mt-1">{w.summary}</div></div>
            <button onClick={() => setFound(null)} className="text-white/40 text-xs">x</button></div>
          {found.tag && <div className="text-xs">Scanned bag <b className="font-mono">{found.tag}</b>: {w.bags.find(b => b.code === found.tag)?.state?.replace('_', ' ').toLowerCase() || 'not on this ticket'}</div>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onOpenTicket(found.ticket)} className={pill}>Open ticket</button>
            {next.map(s => <button key={s.id} disabled={busy} onClick={() => move(s.id)} className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ background: GRAD }}>{s.kind === 'DONE' ? 'Complete (needs payment)' : `Move to ${s.label}`}</button>)}
            {found.tag && stageKind(cfg, found.ticket.stage) === 'READY' && w.bags.find(b => b.code === found.tag)?.state === 'IN_STORE' && <button disabled={busy} onClick={handOver} className={pill}>Hand over this bag</button>}
          </div>
        </div>)}
      {open && (
        <>
          <div className="flex gap-1.5 flex-wrap"><TabBtn id="scan" label="Scan" /><TabBtn id="today" label="Today" /><TabBtn id="route" label="Route" /><TabBtn id="accounts" label="Accounts" /><TabBtn id="settings" label="Settings" /></div>
          {tab === 'scan' && <div className="text-xs text-white/50">Scan any bag tag at any stage: the ticket opens, you see where it is, and you can move it to the next stage in one tap. A USB barcode scanner types into the box above like a keyboard.</div>}
          {tab === 'today' && (
            <div className="space-y-3">
              <div className="space-y-1"><div className={lbl}>Late ({overdue.length})</div>{overdue.map(t => <Row key={t.id} t={t} extra={`was due ${new Date(dueAtOf(t)!).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`} />)}{!overdue.length && <div className="text-xs text-white/40">Nothing late.</div>}</div>
              <div className="space-y-1"><div className={lbl}>Due in the next 8 hours ({dueSoon.length})</div>{dueSoon.map(t => <Row key={t.id} t={t} extra={new Date(dueAtOf(t)!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + (t.subject.rush === 'Rush' ? ' · RUSH' : '')} />)}</div>
              <div className="space-y-1"><div className={lbl}>Waiting for pickup ({waiting.length})</div>{waiting.map(t => { const ra = readyAtOf(t, cfg); return <Row key={t.id} t={t} extra={ra ? `${Math.floor((now - ra) / 86_400_000)}d ready` : ''} />; })}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-white/50">{unclaimed.length} ticket(s) need a nudge today.</span>
                {laundry && <button disabled={busy} onClick={() => run(() => laundry.runReminders(), r => setMsg(`Sent ${r.sent.length} reminder(s) (push/email; SMS is not enabled).${r.ownerReview.length ? ` Past ${settings.unclaimed.disposalDays} days, review: ${r.ownerReview.join(', ')}.` : ''}`))} className={pill}>Send reminders now</button>}
              </div>
            </div>)}
          <Suspense fallback={<div className="text-xs text-white/40">Loading...</div>}>
            {tab === 'route' && <RouteTab {...props} />}
            {tab === 'accounts' && <AccountsTab {...props} />}
            {tab === 'settings' && <SettingsTab {...props} />}
          </Suspense>
        </>)}
      {cam && <BarcodeScanner title="Scan a bag tag" hint="Point the camera at the barcode or QR on the tag" onDetect={c => { setCam(false); setOpen(true); lookup(c); }} onClose={() => setCam(false)} />}
    </div>
  );
}
void money;
