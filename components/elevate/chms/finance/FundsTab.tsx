// Funds — goals, YTD / lifetime / period totals, restricted vs unrestricted, budget vs actual,
// paired fund transfers. Extends org.givingFunds additively (restricted, budget, accountCode, inactive).
import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Lock, Plus } from 'lucide-react';
import type { GivingFund } from '../../../../types';
import { recordTransfer, saveFunds } from '../../../../services/chmsFinance';
import { fundSummaries, money, todayStr } from '../../../../services/chmsFinanceReports';
import { card, field, fieldSm, btnPrimary, btnGhost, heading, label, Pill, RangePicker, useAction, Busy, type TabProps } from './shared';

const Bar: React.FC<{ pct: number; over?: boolean }> = ({ pct, over }) => (
  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className={`h-full ${over ? 'bg-green-400' : 'bg-small-orange'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>
);

const FundsTab: React.FC<TabProps> = ({ org, snap, reload, canManage, setOrg }) => {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`); const [to, setTo] = useState(todayStr());
  const [edit, setEdit] = useState<GivingFund[] | null>(null);
  const [nf, setNf] = useState({ name: '', goal: '', budget: '', restricted: false, code: '' });
  const [tr, setTr] = useState({ from: '', to: '', amount: '', date: todayStr(), reason: '' });
  const act = useAction();

  const sums = useMemo(() => fundSummaries(org.givingFunds || [], snap.ledger, snap.transfers, { from, to, label: 'Selected' }, year), [org.givingFunds, snap.ledger, snap.transfers, from, to, year]);
  const funds = edit || org.givingFunds || [];
  const totalBal = sums.reduce((a, s) => a + s.balance, 0);
  const restrictedBal = sums.filter(s => s.restricted).reduce((a, s) => a + s.balance, 0);

  const patch = (id: string, p: Partial<GivingFund>) => setEdit((edit || org.givingFunds || []).map(f => f.id === id ? { ...f, ...p } : f));
  const save = () => edit && act.run(async () => { await saveFunds(org, edit); setOrg({ ...org, givingFunds: edit }); setEdit(null); await reload(); });
  const addFund = () => {
    if (!nf.name.trim()) return;
    const f: GivingFund = { id: Math.random().toString(36).slice(2, 9), name: nf.name.trim(), goal: nf.goal ? Number(nf.goal) : undefined, budget: nf.budget ? Number(nf.budget) : undefined, restricted: nf.restricted || undefined, accountCode: nf.code.trim() || undefined, raised: 0 };
    setEdit([...(edit || org.givingFunds || []), f]); setNf({ name: '', goal: '', budget: '', restricted: false, code: '' });
  };
  const doTransfer = () => act.run(async () => {
    const a = (org.givingFunds || []).find(f => f.id === tr.from), b = (org.givingFunds || []).find(f => f.id === tr.to);
    if (!a || !b) { alert('Choose both funds.'); return; }
    await recordTransfer(org, a, b, Number(tr.amount), tr.date, tr.reason);
    setTr(v => ({ ...v, amount: '', reason: '' })); await reload();
  });
  const pairs = useMemo(() => { const m = new Map<string, typeof snap.transfers>(); snap.transfers.forEach(t => (m.get(t.pairId) || m.set(t.pairId, []).get(t.pairId)!).push(t)); return [...m.values()].sort((a, b) => b[0].date.localeCompare(a[0].date)); }, [snap.transfers]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className={`${card} p-5`}><p className={label}>Total fund balances</p><p className="text-2xl font-black text-white mt-1">{money(totalBal)}</p></div>
        <div className={`${card} p-5`}><p className={label}>Restricted</p><p className="text-2xl font-black text-white mt-1">{money(restrictedBal)}</p></div>
        <div className={`${card} p-5 col-span-2 lg:col-span-1`}><p className={`${label} mb-2`}>Period</p><RangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Funds</h3>
        <div className="space-y-3">
          {sums.map(s => {
            const f = funds.find(x => x.id === s.fund.id) || s.fund; const inOrg = (org.givingFunds || []).some(x => x.id === f.id);
            return (
              <div key={f.id} className={`rounded-2xl bg-white/[0.04] border border-white/10 p-4 ${f.inactive ? 'opacity-50' : ''}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm font-black text-white flex-1">{f.name}</span>
                  {s.restricted ? <Pill tone="warn"><Lock size={9} className="inline mr-1" />restricted</Pill> : <Pill>unrestricted</Pill>}
                  {f.accountCode && <Pill>{f.accountCode}</Pill>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                  <div><p className={label}>{year} YTD</p><p className="font-black text-white tabular-nums">{money(s.ytd)}</p></div>
                  <div><p className={label}>Period</p><p className="font-black text-white tabular-nums">{money(s.period)}</p></div>
                  <div><p className={label}>Lifetime</p><p className="font-black text-white tabular-nums">{money(s.lifetime)}</p></div>
                  <div><p className={label}>Transfers</p><p className={`font-black tabular-nums ${s.transfersNet < 0 ? 'text-red-400' : 'text-white'}`}>{money(s.transfersNet)}</p></div>
                  <div><p className={label}>Balance</p><p className="font-black text-white tabular-nums">{money(s.balance)}</p></div>
                </div>
                {f.budget != null && f.budget > 0 && <div className="mt-3"><div className="flex justify-between text-[10px] text-white/50 mb-1"><span>Budget vs actual</span><span>{money(s.ytd)} of {money(f.budget)} ({s.budgetPct}%)</span></div><Bar pct={s.budgetPct || 0} over={(s.budgetPct || 0) >= 100} /></div>}
                {f.goal != null && f.goal > 0 && <div className="mt-2"><div className="flex justify-between text-[10px] text-white/50 mb-1"><span>Goal</span><span>{money(s.lifetime)} of {money(f.goal)} ({s.goalPct}%)</span></div><Bar pct={s.goalPct || 0} over={(s.goalPct || 0) >= 100} /></div>}
                {canManage && inOrg && (
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/5">
                    <label className="flex items-center gap-1.5 text-[10px] text-white/50"><input type="checkbox" checked={!!f.restricted} onChange={e => patch(f.id, { restricted: e.target.checked })} /> Restricted</label>
                    <input defaultValue={f.budget || ''} onBlur={e => patch(f.id, { budget: Number(e.target.value) || undefined })} placeholder="Budget $" className={`${fieldSm} w-24`} />
                    <input defaultValue={f.goal || ''} onBlur={e => patch(f.id, { goal: Number(e.target.value) || undefined })} placeholder="Goal $" className={`${fieldSm} w-24`} />
                    <input defaultValue={f.accountCode || ''} onBlur={e => patch(f.id, { accountCode: e.target.value.trim() || undefined })} placeholder="GL / QB class" className={`${fieldSm} w-32`} />
                    <label className="flex items-center gap-1.5 text-[10px] text-white/50"><input type="checkbox" checked={!!f.inactive} onChange={e => patch(f.id, { inactive: e.target.checked })} /> Inactive</label>
                  </div>
                )}
              </div>
            );
          })}
          {sums.length === 0 && <p className="text-xs text-white/40 text-center py-4">No funds yet.</p>}
        </div>
        {canManage && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex flex-wrap gap-2">
              <input value={nf.name} onChange={e => setNf(v => ({ ...v, name: e.target.value }))} placeholder="New fund name" className={`${field} flex-1 min-w-[160px]`} />
              <input value={nf.goal} onChange={e => setNf(v => ({ ...v, goal: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Goal $" className={`${field} w-28`} />
              <input value={nf.budget} onChange={e => setNf(v => ({ ...v, budget: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Budget $" className={`${field} w-28`} />
              <input value={nf.code} onChange={e => setNf(v => ({ ...v, code: e.target.value }))} placeholder="GL code" className={`${field} w-28`} />
              <label className="flex items-center gap-1.5 text-[11px] text-white/60"><input type="checkbox" checked={nf.restricted} onChange={e => setNf(v => ({ ...v, restricted: e.target.checked }))} /> Restricted</label>
              <button onClick={addFund} className={btnGhost}><Plus size={12} /> Add</button>
            </div>
            {edit && <div className="flex gap-2 mt-3"><button onClick={save} disabled={act.busy} className={btnPrimary}><Busy on={act.busy}>Save fund changes</Busy></button><button onClick={() => setEdit(null)} className={btnGhost}>Discard</button></div>}
          </div>
        )}
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}><ArrowRightLeft size={12} className="inline mr-1.5" />Fund transfers</h3>
        {canManage && (
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={tr.from} onChange={e => setTr(v => ({ ...v, from: e.target.value }))} className={fieldSm}><option value="">From fund…</option>{(org.givingFunds || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            <select value={tr.to} onChange={e => setTr(v => ({ ...v, to: e.target.value }))} className={fieldSm}><option value="">To fund…</option>{(org.givingFunds || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            <input value={tr.amount} onChange={e => setTr(v => ({ ...v, amount: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="$" className={`${fieldSm} w-24`} />
            <input type="date" value={tr.date} onChange={e => setTr(v => ({ ...v, date: e.target.value }))} className={fieldSm} />
            <input value={tr.reason} onChange={e => setTr(v => ({ ...v, reason: e.target.value }))} placeholder="Reason / board authority (required)" className={`${fieldSm} flex-1 min-w-[180px]`} />
            <button onClick={doTransfer} disabled={act.busy} className={btnPrimary}><Busy on={act.busy}>Record transfer</Busy></button>
          </div>
        )}
        {pairs.length === 0 ? <p className="text-[11px] text-white/40">No transfers recorded. Each transfer is stored as a paired out/in entry and is audited.</p> : (
          <div className="space-y-1">{pairs.map(p => { const out = p.find(x => x.amount < 0), inn = p.find(x => x.amount > 0); return (
            <div key={p[0].pairId} className="flex gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03]"><span className="text-white/40 w-20">{p[0].date}</span><span className="flex-1 text-white">{out?.fundName} → {inn?.fundName} <span className="text-white/30">· {p[0].reason}</span></span><span className="tabular-nums text-white">{money(Math.abs(out?.amount || 0))}</span></div>); })}</div>
        )}
      </div>
    </div>
  );
};

export default FundsTab;
