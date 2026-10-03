// Enter Gifts — keyboard-first contribution grid (lookup by name / envelope # / family), splits, anonymous,
// tributes, mobile check capture (Gemini → pre-fill → human confirm) and recurring schedules.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Plus, Repeat, Split, Trash2, Zap } from 'lucide-react';
import type { ChmsBatch, ChmsGiftMethod, ChmsPerson } from '../../../../types';
import { createBatch, enterGifts, extractCheck, runRecurring, saveRecurring, validateDraft, type GiftDraft, type GiftSplit } from '../../../../services/chmsFinance';
import { batchTotals, envelopeOf, money, searchPeople, todayStr, type RecurringSpec } from '../../../../services/chmsFinanceReports';
import { card, field, fieldSm, btnPrimary, btnGhost, heading, label, Pill, useAction, Busy, type TabProps } from './shared';

const METHODS: ChmsGiftMethod[] = ['CHECK', 'CASH', 'CARD', 'ACH', 'ONLINE', 'STOCK', 'INKIND', 'OTHER'];

const EnterTab: React.FC<TabProps> = ({ org, snap, reload, canManage }) => {
  const funds = useMemo(() => (org.givingFunds || []).filter(f => !f.inactive), [org.givingFunds]);
  const openBatches = snap.batches.filter(b => b.status === 'OPEN' || b.status === 'BALANCED');
  const [batchId, setBatchId] = useState<string>(openBatches[0]?.id || '');
  const batch: ChmsBatch | undefined = snap.batches.find(b => b.id === batchId);
  const [newName, setNewName] = useState(''); const [newTotal, setNewTotal] = useState(''); const [newCount, setNewCount] = useState('');

  // entry state
  const [q, setQ] = useState(''); const [person, setPerson] = useState<ChmsPerson | null>(null);
  const [hi, setHi] = useState(0); const [anon, setAnon] = useState(false);
  const [fundId, setFundId] = useState(funds[0]?.id || ''); const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ChmsGiftMethod>('CHECK'); const [checkNo, setCheckNo] = useState('');
  const [date, setDate] = useState(batch?.date || todayStr()); const [memo, setMemo] = useState(''); const [tribute, setTribute] = useState('');
  const [deductible, setDeductible] = useState(true);
  const [split, setSplit] = useState(false); const [splits, setSplits] = useState<GiftSplit[]>([]);
  const [flash, setFlash] = useState(''); const [aiMsg, setAiMsg] = useState('');
  const searchRef = useRef<HTMLInputElement>(null); const amountRef = useRef<HTMLInputElement>(null);
  const add = useAction(); const mk = useAction(); const ocr = useAction(); const rec = useAction();

  useEffect(() => { if (batch) setDate(batch.date); }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!batchId && openBatches[0]) setBatchId(openBatches[0].id); }, [openBatches.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!fundId && funds[0]) setFundId(funds[0].id); }, [funds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => (person ? [] : searchPeople(snap.people, snap.households, q)), [q, person, snap.people, snap.households]);
  const fundOf = (id: string) => funds.find(f => f.id === id);
  const bt = batch ? batchTotals(batch, snap.ledger) : null;
  const batchRows = batch ? snap.ledger.filter(r => r.batchId === batch.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 12) : [];

  const splitTotal = splits.reduce((a, s) => a + (s.amount || 0), 0);
  const total = split ? splitTotal : Number(amount) || 0;

  const pick = (p: ChmsPerson) => { setPerson(p); setQ(`${p.firstName} ${p.lastName}`); setAnon(false); setTimeout(() => amountRef.current?.focus(), 0); };
  const reset = () => { setPerson(null); setQ(''); setAmount(''); setCheckNo(''); setMemo(''); setTribute(''); setSplit(false); setSplits([]); setAnon(false); setHi(0); setTimeout(() => searchRef.current?.focus(), 0); };

  const commit = () => add.run(async () => {
    if (!batch) { alert('Open or choose a batch first — gifts are entered into batches so they can be balanced against the deposit slip.'); return; }
    const lines: GiftSplit[] = split ? splits.filter(s => s.amount > 0) : (() => { const f = fundOf(fundId); return f ? [{ fundId: f.id, fundName: f.name, amount: Number(amount) }] : []; })();
    const draft: GiftDraft = { personId: person?.id, giverName: person ? undefined : q.trim() || undefined, anonymous: anon || undefined, envelope: person ? envelopeOf(person) || undefined : undefined, splits: lines, date, method, checkNumber: checkNo, memo, tributeNote: tribute, deductible, batchId: batch.id };
    const err = validateDraft(draft); if (err) { alert(err); return; }
    await enterGifts(org, [draft], snap.people, snap.pledges, snap.batches);
    setFlash(`Added ${money(lines.reduce((a, s) => a + s.amount, 0))}${person ? ` · ${person.firstName} ${person.lastName}` : ''}`);
    setTimeout(() => setFlash(''), 2500);
    reset(); await reload();
  });

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(matches.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[hi]) pick(matches[hi]); else amountRef.current?.focus(); }
    else if (e.key === 'Escape') { setQ(''); setPerson(null); }
  };
  const onCommitKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } };

  const onCheckPhoto = (f?: File | null) => f && ocr.run(async () => {
    const r = await extractCheck(f);
    if (!r.ok || !r.data) { setAiMsg(r.message || 'Could not read the check.'); return; }
    const d = r.data; setMethod('CHECK');
    if (d.amount) setAmount(String(d.amount)); if (d.date) setDate(d.date); if (d.checkNumber) setCheckNo(d.checkNumber); if (d.memo) setMemo(d.memo);
    if (d.payer) { const hit = searchPeople(snap.people, snap.households, d.payer, 1)[0]; if (hit) pick(hit); else { setQ(d.payer); setPerson(null); } }
    setAiMsg('Check read — verify every field below against the check before adding. Nothing is saved until you confirm.');
  });

  const doNewBatch = () => mk.run(async () => {
    const b = await createBatch(org, newName, todayStr(), newTotal ? Number(newTotal) : undefined, newCount ? Number(newCount) : undefined);
    setBatchId(b.id); setNewName(''); setNewTotal(''); setNewCount(''); await reload();
  });

  // recurring
  const [rc, setRc] = useState({ q: '', personId: '', fundId: funds[0]?.id || '', amount: '', method: 'ACH' as ChmsGiftMethod, frequency: 'MONTHLY' as RecurringSpec['frequency'], start: todayStr() });
  const rcMatches = rc.personId ? [] : searchPeople(snap.people, snap.households, rc.q, 5);
  const addRecurring = () => rec.run(async () => {
    const f = fundOf(rc.fundId); if (!f || !(Number(rc.amount) > 0)) { alert('Pick a fund and amount.'); return; }
    if (!rc.personId && !rc.q.trim()) { alert('Pick a giver.'); return; }
    await saveRecurring(org, { personId: rc.personId || undefined, giverName: rc.personId ? undefined : rc.q.trim(), fundId: f.id, fundName: f.name, amount: Number(rc.amount), method: rc.method, frequency: rc.frequency, startDate: rc.start, active: true });
    setRc(v => ({ ...v, q: '', personId: '', amount: '' })); await reload();
  });
  const runDue = () => rec.run(async () => {
    if (!batch) { alert('Choose a batch to receive the recurring gifts.'); return; }
    const n = await runRecurring(org, snap.recurring, snap.people, snap.pledges, snap.batches, batch.id);
    setFlash(n ? `Generated ${n} recurring gift(s) into ${batch.name}` : 'No recurring gifts are due.'); await reload();
  });
  const toggleRecurring = (r: RecurringSpec) => rec.run(async () => { await saveRecurring(org, { ...r, active: !r.active }); await reload(); });

  if (!canManage) return <p className="text-xs text-white/40">Gift entry is limited to finance roles.</p>;
  if (!funds.length) return <p className="text-xs text-white/50">Add at least one fund (Funds tab) before entering gifts.</p>;

  return (
    <div className="space-y-6">
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <p className={`${label} mb-1`}>Batch</p>
            <select value={batchId} onChange={e => setBatchId(e.target.value)} className={field}>
              <option value="">— choose an open batch —</option>
              {openBatches.map(b => <option key={b.id} value={b.id}>{b.name} · {b.date}</option>)}
            </select>
          </div>
          {bt && (
            <div className="text-xs text-white/70 pb-2">
              <span className="font-black text-white">{bt.count}</span> items · <span className="font-black text-white">{money(bt.total)}</span>
              {bt.expectedTotal != null && <> of {money(bt.expectedTotal)} <Pill tone={bt.balanced ? 'ok' : 'warn'}>{bt.balanced ? 'balanced' : `off ${money(bt.variance)}`}</Pill></>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New batch name (e.g. Sunday 10/4)" className={`${fieldSm} flex-1 min-w-[160px]`} />
          <input value={newTotal} onChange={e => setNewTotal(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Slip total $" className={`${fieldSm} w-28`} />
          <input value={newCount} onChange={e => setNewCount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="# items" className={`${fieldSm} w-20`} />
          <button onClick={doNewBatch} disabled={mk.busy} className={btnGhost}><Busy on={mk.busy}><Plus size={12} /> Open batch</Busy></button>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`${heading} !mb-0`}><Zap size={12} className="inline mr-1.5" />Enter gift</h3>
          <label className={`${btnGhost} cursor-pointer`}>
            <Busy on={ocr.busy}><Camera size={12} /> Scan check</Busy>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { onCheckPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        {aiMsg && <p className="text-[11px] text-amber-300 mb-3">{aiMsg}</p>}
        <div className="grid md:grid-cols-12 gap-2">
          <div className="md:col-span-5 relative">
            <input ref={searchRef} autoFocus value={q} disabled={anon} onChange={e => { setQ(e.target.value); setPerson(null); setHi(0); }} onKeyDown={onSearchKey} placeholder={anon ? 'Anonymous gift' : 'Giver — name, envelope #, or family'} className={field} />
            {matches.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 rounded-2xl bg-[#14141a] border border-white/15 shadow-xl overflow-hidden">
                {matches.map((m, i) => (
                  <button key={m.id} onMouseDown={e => { e.preventDefault(); pick(m); }} className={`w-full text-left px-4 py-2 text-xs flex justify-between gap-2 ${i === hi ? 'bg-white/10' : ''}`}>
                    <span className="text-white font-bold">{m.firstName} {m.lastName}<span className="text-white/40 font-normal"> {snap.idx.householdNameOf(m.householdId)}</span></span>
                    <span className="text-white/40">{envelopeOf(m) ? `#${envelopeOf(m)}` : m.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {!split && (
            <>
              <select value={fundId} onChange={e => setFundId(e.target.value)} className={`${field} md:col-span-3`}>{funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <input ref={amountRef} value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={onCommitKey} placeholder="Amount" className={`${field} md:col-span-2 tabular-nums`} />
            </>
          )}
          <select value={method} onChange={e => setMethod(e.target.value as ChmsGiftMethod)} className={`${field} ${split ? 'md:col-span-4' : 'md:col-span-2'}`}>{METHODS.map(m => <option key={m}>{m}</option>)}</select>

          {split && (
            <div className="md:col-span-12 space-y-2">
              {splits.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <select value={s.fundId} onChange={e => setSplits(a => a.map((x, j) => j === i ? { ...x, fundId: e.target.value, fundName: fundOf(e.target.value)?.name || '' } : x))} className={field}>{funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                  <input value={s.amount || ''} inputMode="decimal" onChange={e => setSplits(a => a.map((x, j) => j === i ? { ...x, amount: Number(e.target.value.replace(/[^0-9.]/g, '')) } : x))} onKeyDown={onCommitKey} placeholder="Amount" className={`${field} max-w-[9rem] tabular-nums`} />
                  <button onClick={() => setSplits(a => a.filter((_, j) => j !== i))} className="text-white/30 hover:text-red-400 px-2"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={() => setSplits(a => [...a, { fundId: funds[0].id, fundName: funds[0].name, amount: 0 }])} className={btnGhost}><Plus size={12} /> Add fund line</button>
            </div>
          )}

          {method === 'CHECK' && <input value={checkNo} onChange={e => setCheckNo(e.target.value)} onKeyDown={onCommitKey} placeholder="Check #" className={`${field} md:col-span-2`} />}
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${field} md:col-span-3`} />
          <input value={memo} onChange={e => setMemo(e.target.value)} onKeyDown={onCommitKey} placeholder="Memo" className={`${field} md:col-span-3`} />
          <input value={tribute} onChange={e => setTribute(e.target.value)} onKeyDown={onCommitKey} placeholder="In memory / honor of (optional)" className={`${field} md:col-span-4`} />
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <label className="flex items-center gap-1.5 text-[11px] text-white/60"><input type="checkbox" checked={anon} onChange={e => { setAnon(e.target.checked); if (e.target.checked) { setPerson(null); setQ(''); } }} /> Anonymous</label>
          <label className="flex items-center gap-1.5 text-[11px] text-white/60"><input type="checkbox" checked={deductible} onChange={e => setDeductible(e.target.checked)} /> Tax-deductible</label>
          <button onClick={() => { setSplit(s => { if (!s && !splits.length) setSplits([{ fundId, fundName: fundOf(fundId)?.name || '', amount: Number(amount) || 0 }]); return !s; }); }} className={`${btnGhost} ${split ? '!bg-white !text-black' : ''}`}><Split size={12} /> Split across funds</button>
          <span className="flex-1" />
          {flash && <span className="text-[11px] text-green-400">{flash}</span>}
          <span className="text-xs text-white/50 tabular-nums">{total ? money(total) : ''}</span>
          <button onClick={commit} disabled={add.busy} className={btnPrimary}><Busy on={add.busy}>Add gift ↵</Busy></button>
        </div>
        <p className="text-[9px] text-white/25 mt-2">Tip: type a name or envelope number → Enter to pick → amount → Enter to save. Focus returns to the giver box.</p>
      </div>

      {batchRows.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={heading}>Latest in this batch</h3>
          <div className="space-y-1">
            {batchRows.map(r => (
              <div key={r.id} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03] ${r.status === 'VOID' ? 'opacity-40 line-through' : ''}`}>
                <span className="text-white/40 w-20 shrink-0">{r.date}</span>
                <span className="flex-1 text-white truncate">{r.anonymous ? 'Anonymous' : snap.idx.nameOf(r.personId, r.giverName)} <span className="text-white/30">· {r.fundName} · {r.method}{r.checkNumber ? ` #${r.checkNumber}` : ''}</span></span>
                <span className="tabular-nums text-white">{money(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`${card} p-5`}>
        <h3 className={heading}><Repeat size={12} className="inline mr-1.5" />Recurring gifts</h3>
        <div className="space-y-1 mb-3">
          {snap.recurring.length === 0 && <p className="text-[11px] text-white/40">No recurring schedules. Add weekly / bi-weekly / monthly gifts (ACH, standing checks) and generate the due ones into a batch.</p>}
          {snap.recurring.map(r => (
            <div key={r.id} className="flex items-center gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03]">
              <span className="flex-1 text-white">{snap.idx.nameOf(r.personId, r.giverName)} <span className="text-white/30">· {r.fundName} · {r.frequency.toLowerCase()} · from {r.startDate}{r.lastGenerated ? ` · through ${r.lastGenerated}` : ''}</span></span>
              <span className="tabular-nums text-white">{money(r.amount)}</span>
              <button onClick={() => toggleRecurring(r)} className="text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white">{r.active ? 'Pause' : 'Resume'}</button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <div className="relative flex-1 min-w-[160px]">
            <input value={rc.q} onChange={e => setRc(v => ({ ...v, q: e.target.value, personId: '' }))} placeholder="Giver" className={`${fieldSm} w-full`} />
            {rcMatches.length > 0 && <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-[#14141a] border border-white/15">{rcMatches.map(m => <button key={m.id} onMouseDown={e => { e.preventDefault(); setRc(v => ({ ...v, personId: m.id, q: `${m.firstName} ${m.lastName}` })); }} className="block w-full text-left px-3 py-1.5 text-xs text-white hover:bg-white/10">{m.firstName} {m.lastName}</button>)}</div>}
          </div>
          <select value={rc.fundId} onChange={e => setRc(v => ({ ...v, fundId: e.target.value }))} className={fieldSm}>{funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <input value={rc.amount} onChange={e => setRc(v => ({ ...v, amount: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="$" className={`${fieldSm} w-20`} />
          <select value={rc.method} onChange={e => setRc(v => ({ ...v, method: e.target.value as ChmsGiftMethod }))} className={fieldSm}>{METHODS.map(m => <option key={m}>{m}</option>)}</select>
          <select value={rc.frequency} onChange={e => setRc(v => ({ ...v, frequency: e.target.value as RecurringSpec['frequency'] }))} className={fieldSm}><option>WEEKLY</option><option>BIWEEKLY</option><option>MONTHLY</option></select>
          <input type="date" value={rc.start} onChange={e => setRc(v => ({ ...v, start: e.target.value }))} className={fieldSm} />
          <button onClick={addRecurring} disabled={rec.busy} className={btnGhost}>Add</button>
          <button onClick={runDue} disabled={rec.busy || !snap.recurring.length} className={btnPrimary}>Generate due → batch</button>
        </div>
      </div>
    </div>
  );
};

export default EnterTab;
