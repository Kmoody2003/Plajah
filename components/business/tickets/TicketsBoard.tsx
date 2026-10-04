// TicketsBoard - kanban-by-stage + list + search + counts for the generic ticket engine, with the quick
// "New ticket" intake (the pack's subject-field schema drives the form). Detail opens in TicketDetail.
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { countsByStage, computeTicketTotals, matchesQuery, stageById, type Ticket, type TicketConfig, type FieldDef } from '../../../services/ticketCore';
import type { TicketApi } from '../../../services/ticketService';
import TicketDetail from './TicketDetail';
import { BoardTools } from '../ticketPlugins';
import { intakePanels, boardPanels } from './panelRegistry';   // pack plug-ins (cfg.intakePanel / cfg.panels)

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (c: number) => `$${(Math.max(0, c) / 100).toFixed(2)}`;
const inp = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-white/30 w-full text-white';
const KIND_COLOR: Record<string, string> = { INTAKE: '#00B4D8', ESTIMATE: '#FFD166', AWAITING_APPROVAL: '#FF8C00', APPROVED: '#06D6A0', IN_PROGRESS: '#6B0099', READY: '#06D6A0', DONE: '#ffffff55', CANCELLED: '#D40055' };

function Field({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  const common = { 'aria-label': f.label, className: inp } as const;
  if (f.type === 'select') return <select {...common} value={value ?? ''} onChange={e => onChange(e.target.value)}><option value="">{f.label}</option>{f.options?.map(o => <option key={o}>{o}</option>)}</select>;
  return <input {...common} value={value ?? ''} inputMode={f.type === 'number' ? 'decimal' : undefined} placeholder={`${f.label}${f.unit ? ` (${f.unit})` : ''}${f.required ? ' *' : ''}`}
    onChange={e => onChange(f.type === 'number' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)} title={f.hint} />;
}

function Intake({ api, cfg, onClose, onCreated }: { api: TicketApi; cfg: TicketConfig; onClose: () => void; onCreated: (t: Ticket) => void }) {
  const [c, setC] = useState({ name: '', phone: '', email: '' });
  const [subj, setSubj] = useState<Record<string, any>>({});
  const [tpl, setTpl] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const t = await api.create({ customer: { name: c.name.trim(), ...(c.phone ? { phone: c.phone } : {}), ...(c.email ? { email: c.email } : {}) }, subject: subj, templates: tpl });
      onCreated(t);
    } catch (e: any) { setErr(e?.message || 'Could not create the ticket.'); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={`New ${cfg.noun}`}>
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#12121a]/95 backdrop-blur-xl border border-white/10 text-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-black italic uppercase" style={{ fontFamily: 'Outfit, sans-serif' }}>New {cfg.noun}</div>
          <button onClick={onClose} className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">Cancel</button>
        </div>
        {err && <div role="alert" className="rounded-xl border border-[#D40055]/50 bg-[#D40055]/10 p-3 text-sm font-bold text-[#ff7aa8]">{err}</div>}
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Customer</div>
        <input className={inp} placeholder="Name *" aria-label="Customer name" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Phone" aria-label="Customer phone" inputMode="tel" value={c.phone} onChange={e => setC({ ...c, phone: e.target.value })} />
          <input className={inp} placeholder="Email" aria-label="Customer email" inputMode="email" value={c.email} onChange={e => setC({ ...c, email: e.target.value })} />
        </div>
        {cfg.intakePanel && intakePanels[cfg.intakePanel] && (() => { const IP = intakePanels[cfg.intakePanel!]; return <Suspense fallback={null}><IP api={api} cfg={cfg} subject={subj} onSubject={p => setSubj(s => ({ ...s, ...p }))} /></Suspense>; })()}
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40">{cfg.subjectLabel}</div>
        <div className="grid grid-cols-2 gap-2">{cfg.subjectFields.filter(f => !f.hidden).map(f => <div key={f.id} className={f.type === 'text' && f.id === 'complaint' || f.id === 'care' ? 'col-span-2' : ''}><Field f={f} value={subj[f.id]} onChange={v => setSubj({ ...subj, [f.id]: v })} /></div>)}</div>
        {!!cfg.lineTemplates?.length && <>
          <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Start with</div>
          <div className="flex flex-wrap gap-1.5">{cfg.lineTemplates.filter(x => x.unitPriceCents > 0).map(x => {
            const on = tpl.includes(x.key);
            return <button key={x.key} onClick={() => setTpl(on ? tpl.filter(k => k !== x.key) : [...tpl, x.key])} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${on ? 'text-white' : 'bg-white/10 text-white/70'}`} style={on ? { background: GRAD } : undefined}>{x.label} · {money(x.unitPriceCents)}{x.unit ? `/${x.unit}` : ''}</button>;
          })}</div>
        </>}
        <button disabled={busy || !c.name.trim()} onClick={submit} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ background: GRAD }}>{busy ? 'Creating...' : `Create ${cfg.noun}`}</button>
      </div>
    </div>,
    document.body,
  );
}

interface Props { api: TicketApi; cfg: TicketConfig; businessName?: string; canOverride?: boolean }

export default function TicketsBoard({ api, cfg, businessName, canOverride }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'board' | 'list'>(() => { try { return (localStorage.getItem('ticketsView') as any) === 'list' ? 'list' : 'board'; } catch { return 'board'; } });
  const [stageFilter, setStageFilter] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [intake, setIntake] = useState(false);

  const load = useCallback(async () => {
    try { setTickets(await api.list()); setErr(''); } catch (e: any) { setErr(e?.message || 'Could not load tickets.'); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); const i = setInterval(load, 25_000); return () => clearInterval(i); }, [load]);
  const setV = (v: 'board' | 'list') => { setView(v); try { localStorage.setItem('ticketsView', v); } catch { /* optional */ } };

  const counts = useMemo(() => countsByStage(tickets, cfg), [tickets, cfg]);
  const shown = useMemo(() => tickets.filter(t => matchesQuery(t, q) && (!stageFilter || t.stage === stageFilter)), [tickets, q, stageFilter]);
  const open = tickets.find(t => t.id === openId) || null;
  const upsert = (t: Ticket) => setTickets(ts => (ts.some(x => x.id === t.id) ? ts.map(x => (x.id === t.id ? t : x)) : [t, ...ts]));
  const cols = cfg.stages.filter(s => s.kind !== 'CANCELLED');

  const Card = ({ t }: { t: Ticket }) => {
    const tot = computeTicketTotals(t, cfg);
    const st = stageById(cfg, t.stage);
    const subj = cfg.subjectFields.filter(f => !f.hidden).map(f => t.subject[f.id]).filter(v => v !== undefined && v !== '').slice(0, 3).map(v => (Array.isArray(v) ? v.join(' ') : String(v))).join(' · ');
    return (
      <button onClick={() => setOpenId(t.id)} data-testid="ticket-card" className="w-full text-left rounded-2xl bg-white/[0.06] hover:bg-white/10 border border-white/10 p-3 space-y-1 transition">
        <div className="flex items-center justify-between gap-2"><span className="font-black italic text-lg leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>{t.number}</span><span className="text-sm font-black">{money(tot.estimate.totalCents)}</span></div>
        <div className="text-sm font-bold truncate">{t.customer.name}</div>
        {subj && <div className="text-xs text-white/50 truncate">{subj}</div>}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {view === 'list' && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ color: KIND_COLOR[st?.kind || 'INTAKE'], background: (KIND_COLOR[st?.kind || 'INTAKE'] || '#fff') + '22' }}>{st?.label}</span>}
          {cfg.requireApproval && tot.pendingCount > 0 && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#FF8C00]/20 text-[#FF8C00]">{tot.pendingCount} to approve</span>}
          {t.saleOrderId && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300">paid</span>}
          {t.assignedTo && <span className="text-[9px] font-bold text-white/50">{t.assignedTo.name}</span>}
          {tot.balanceCents > 0 && !t.saleOrderId && tot.approvedCount > 0 && <span className="text-[9px] font-bold text-white/40 ml-auto">due {money(tot.balanceCents)}</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-3xl md:text-5xl font-black italic uppercase leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>{cfg.nounPlural}</h2>
          {businessName && <div className="text-[11px] font-bold uppercase tracking-widest text-white/40 mt-1">{businessName}</div>}
        </div>
        <button onClick={() => setIntake(true)} className="px-5 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-white" style={{ background: GRAD }}>+ New {cfg.noun}</button>
      </div>

      {(cfg.panels || []).map(id => { const BP = boardPanels[id]; return BP ? <Suspense key={id} fallback={null}><BP api={api} cfg={cfg} /></Suspense> : null; })}

      <BoardTools ids={cfg.ui?.boardTools} api={api} cfg={cfg} tickets={tickets} businessName={businessName} onChanged={load} onOpenTicket={t => { upsert(t); setOpenId(t.id); }} />

      <div className="flex gap-2 items-center flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${cfg.nounPlural}, customers, ${cfg.subjectLabel.toLowerCase()}...`} aria-label="Search tickets" className={inp + ' !w-auto flex-1 min-w-[200px]'} />
        <div className="flex rounded-full bg-white/5 p-1">
          {(['board', 'list'] as const).map(v => <button key={v} onClick={() => setV(v)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${view === v ? 'bg-white text-black' : 'text-white/50'}`}>{v}</button>)}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setStageFilter('')} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${!stageFilter ? 'bg-white text-black' : 'bg-white/5 text-white/50'}`}>All {tickets.length}</button>
        {cfg.stages.map(s => <button key={s.id} onClick={() => setStageFilter(stageFilter === s.id ? '' : s.id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${stageFilter === s.id ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>{s.label} <b>{counts[s.id] || 0}</b></button>)}
      </div>

      {err && <div role="alert" className="rounded-xl border border-[#D40055]/50 bg-[#D40055]/10 p-3 text-sm font-bold text-[#ff7aa8]">{err}</div>}
      {loading && <div className="text-white/40 text-sm py-8 text-center">Loading...</div>}
      {!loading && !tickets.length && !err && (
        <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center space-y-2">
          <div className="text-xl font-black italic uppercase" style={{ fontFamily: 'Outfit, sans-serif' }}>No {cfg.nounPlural} yet</div>
          <div className="text-sm text-white/50">Start one when a customer drops off.</div>
        </div>
      )}

      {!loading && tickets.length > 0 && (view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
          {cols.map(s => {
            const items = shown.filter(t => t.stage === s.id);
            if (stageFilter && stageFilter !== s.id) return null;
            return (
              <div key={s.id} className="snap-start shrink-0 w-[260px] rounded-3xl bg-white/[0.04] border border-white/10 p-2.5 space-y-2" data-testid={`col-${s.id}`}>
                <div className="flex items-center justify-between px-1.5 pt-1"><span className="text-[10px] font-black uppercase tracking-widest" style={{ color: KIND_COLOR[s.kind] }}>{s.label}</span><span className="text-xs font-black text-white/50">{items.length}</span></div>
                {items.map(t => <Card key={t.id} t={t} />)}
                {!items.length && <div className="text-[11px] text-white/25 text-center py-4">Empty</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{shown.map(t => <Card key={t.id} t={t} />)}{!shown.length && <div className="text-sm text-white/40 py-6">Nothing matches.</div>}</div>
      ))}

      {intake && <Intake api={api} cfg={cfg} onClose={() => setIntake(false)} onCreated={t => { upsert(t); setIntake(false); setOpenId(t.id); }} />}
      {open && <TicketDetail key={open.id} api={api} cfg={cfg} ticket={open} canOverride={canOverride} onClose={() => { setOpenId(null); load(); }} onChanged={upsert} />}
    </div>
  );
}
