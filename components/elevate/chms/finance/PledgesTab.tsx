// Pledges & campaigns — track fulfillment %, behind-pace alerts, auto-attached matching gifts, pledge statements.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Link2, Printer, Plus } from 'lucide-react';
import type { ChmsPledge } from '../../../../types';
import { attachMatchingGifts, savePledge } from '../../../../services/chmsFinance';
import { money, pledgeProgress, searchPeople, todayStr, addDays, NO_GOODS_TEXT, type PledgeProgress } from '../../../../services/chmsFinanceReports';
import { card, field, fieldSm, btnPrimary, btnGhost, heading, Pill, Empty, useAction, Busy, printHtml, type TabProps } from './shared';

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const PledgesTab: React.FC<TabProps> = ({ org, snap, reload, canManage }) => {
  const funds = (org.givingFunds || []).filter(f => !f.inactive);
  const [f, setF] = useState({ q: '', personId: '', fundId: funds[0]?.id || '', amount: '', frequency: 'MONTHLY' as ChmsPledge['frequency'], start: todayStr(), end: addDays(todayStr(), 365) });
  const [show, setShow] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const act = useAction();
  const matches = f.personId ? [] : searchPeople(snap.people, snap.households, f.q, 5);

  const prog = useMemo(() => snap.pledges.map(p => pledgeProgress(p, snap.ledger, snap.idx)).sort((a, b) => Number(b.isBehind) - Number(a.isBehind) || b.pledge.createdAt - a.pledge.createdAt), [snap.pledges, snap.ledger, snap.idx]);
  const shown = prog.filter(p => show === 'ALL' || p.pledge.status === 'ACTIVE');
  const campaigns = useMemo(() => {
    const m = new Map<string, { name: string; pledged: number; given: number; n: number }>();
    prog.filter(p => p.pledge.status !== 'CANCELLED').forEach(p => { const c = m.get(p.pledge.fundId) || { name: p.pledge.fundName, pledged: 0, given: 0, n: 0 }; c.pledged += p.pledge.amount; c.given += p.given; c.n++; m.set(p.pledge.fundId, c); });
    return [...m.values()];
  }, [prog]);

  const create = () => act.run(async () => {
    const fund = funds.find(x => x.id === f.fundId); const person = snap.people.find(p => p.id === f.personId);
    if (!fund || !(Number(f.amount) > 0)) { alert('Choose a fund and a pledge amount.'); return; }
    if (!person && !f.q.trim()) { alert('Choose who is pledging.'); return; }
    await savePledge(org, { personId: person?.id, householdId: person?.householdId, giverName: person ? undefined : f.q.trim(), fundId: fund.id, fundName: fund.name, amount: Number(f.amount), frequency: f.frequency, startDate: f.start, endDate: f.end || undefined, status: 'ACTIVE' });
    setF(v => ({ ...v, q: '', personId: '', amount: '' })); await reload();
  });
  const setStatus = (p: ChmsPledge, status: ChmsPledge['status']) => act.run(async () => { await savePledge(org, { ...p, status }); await reload(); });
  const attach = (p: ChmsPledge) => act.run(async () => { const n = await attachMatchingGifts(org, p, snap.ledger); alert(n ? `Attached ${n} matching gift(s) to this pledge.` : 'No unattached matching gifts found.'); await reload(); });

  const statement = (x: PledgeProgress) => {
    const gifts = snap.ledger.filter(r => r.status !== 'VOID' && (r.pledgeId === x.pledge.id)).sort((a, b) => a.date.localeCompare(b.date));
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Pledge statement</title><style>body{font-family:Georgia,serif;padding:48px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}th,td{border-bottom:1px solid #ccc;padding:5px;text-align:left}.r{text-align:right}p{font-size:12px}</style></head><body>
<h1>${esc(org.legalName || org.name)}</h1>${org.ein ? `<p>EIN ${esc(org.ein)}</p>` : ''}<h2>Pledge Statement &mdash; ${esc(x.pledge.fundName)}</h2><p>${esc(x.name)} &middot; as of ${todayStr()}</p>
<p>Pledged <b>${money(x.pledge.amount)}</b> (${esc(x.pledge.frequency.toLowerCase())}, ${esc(x.pledge.startDate)} to ${esc(x.endDate)}) &middot; Received <b>${money(x.given)}</b> &middot; Remaining <b>${money(x.remaining)}</b> &middot; ${x.pct}% fulfilled</p>
<table><thead><tr><th>Date</th><th>Fund</th><th class="r">Amount</th></tr></thead><tbody>${gifts.map(g => `<tr><td>${esc(g.date)}</td><td>${esc(g.fundName)}</td><td class="r">${money(g.amount)}</td></tr>`).join('') || '<tr><td colspan="3">No payments recorded.</td></tr>'}</tbody></table>
<p><i>${esc(NO_GOODS_TEXT(true))} A pledge is a statement of intent and is not itself a tax-deductible contribution until paid.</i></p></body></html>`);
  };

  return (
    <div className="space-y-6">
      {campaigns.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={heading}>Campaigns (by fund)</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {campaigns.map(c => (
              <div key={c.name} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="flex justify-between text-xs font-bold text-white mb-1"><span>{c.name}</span><span className="text-white/40">{c.n} pledges</span></div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1"><div className="h-full bg-small-orange" style={{ width: `${Math.min(100, c.pledged ? (c.given / c.pledged) * 100 : 0)}%` }} /></div>
                <p className="text-[10px] text-white/50">{money(c.given)} received of {money(c.pledged)} pledged</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <div className={`${card} p-5`}>
          <h3 className={heading}>New pledge</h3>
          <div className="flex flex-wrap gap-2 items-start">
            <div className="relative flex-1 min-w-[180px]">
              <input value={f.q} onChange={e => setF(v => ({ ...v, q: e.target.value, personId: '' }))} placeholder="Giver — name or envelope #" className={field} />
              {matches.length > 0 && <div className="absolute z-20 left-0 right-0 mt-1 rounded-2xl bg-[#14141a] border border-white/15 overflow-hidden">{matches.map(m => <button key={m.id} onMouseDown={e => { e.preventDefault(); setF(v => ({ ...v, personId: m.id, q: `${m.firstName} ${m.lastName}` })); }} className="block w-full text-left px-4 py-2 text-xs text-white hover:bg-white/10">{m.firstName} {m.lastName} <span className="text-white/30">{snap.idx.householdNameOf(m.householdId)}</span></button>)}</div>}
            </div>
            <select value={f.fundId} onChange={e => setF(v => ({ ...v, fundId: e.target.value }))} className={`${field} w-44`}>{funds.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <input value={f.amount} onChange={e => setF(v => ({ ...v, amount: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="Total pledged $" className={`${field} w-36`} />
            <select value={f.frequency} onChange={e => setF(v => ({ ...v, frequency: e.target.value as ChmsPledge['frequency'] }))} className={`${field} w-36`}>{['ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'].map(x => <option key={x}>{x}</option>)}</select>
            <input type="date" value={f.start} onChange={e => setF(v => ({ ...v, start: e.target.value }))} className={`${field} w-40`} />
            <input type="date" value={f.end} onChange={e => setF(v => ({ ...v, end: e.target.value }))} className={`${field} w-40`} />
            <button onClick={create} disabled={act.busy} className={btnPrimary}><Busy on={act.busy}><Plus size={12} /> Add pledge</Busy></button>
          </div>
          <p className="text-[9px] text-white/30 mt-2">Amount is the total commitment over the date range; frequency sets the expected pace. Matching gifts (same giver or family + fund + dates) attach automatically at entry.</p>
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3"><h3 className={`${heading} !mb-0`}>Pledges</h3>
          <div className="flex gap-1.5">{(['ACTIVE', 'ALL'] as const).map(k => <button key={k} onClick={() => setShow(k)} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${show === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{k}</button>)}</div></div>
        {shown.length === 0 ? <Empty>No pledges.</Empty> : (
          <div className="space-y-2">
            {shown.map(x => (
              <div key={x.pledge.id} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm font-black text-white flex-1">{x.name} <span className="text-white/40 font-medium">· {x.pledge.fundName}</span></span>
                  {x.isBehind && <Pill tone="warn"><AlertTriangle size={9} className="inline mr-1" />behind {money(x.behind)}</Pill>}
                  <Pill tone={x.pledge.status === 'ACTIVE' ? 'info' : x.pledge.status === 'FULFILLED' ? 'ok' : 'bad'}>{x.pledge.status}</Pill>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5"><div className="h-full bg-small-orange" style={{ width: `${x.pct}%` }} /></div>
                <div className="flex flex-wrap justify-between gap-2 text-[10px] text-white/50">
                  <span>{money(x.given)} of {money(x.pledge.amount)} ({x.pct}%) · {x.pledge.frequency.toLowerCase()} · {x.pledge.startDate} → {x.endDate}</span>
                  <span className="flex gap-3">
                    <button onClick={() => statement(x)} className="hover:text-white inline-flex items-center gap-1"><Printer size={10} /> Statement</button>
                    {canManage && x.pledge.status === 'ACTIVE' && <>
                      <button onClick={() => attach(x.pledge)} className="hover:text-white inline-flex items-center gap-1"><Link2 size={10} /> Attach gifts</button>
                      <button onClick={() => setStatus(x.pledge, 'FULFILLED')} className="hover:text-green-400">Mark fulfilled</button>
                      <button onClick={() => setStatus(x.pledge, 'CANCELLED')} className="hover:text-red-400">Cancel</button></>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PledgesTab;
