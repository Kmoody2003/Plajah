// Journal — every entry in the books, newest first. Post adjusting entries; reverse (never delete) mistakes.
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Undo2 } from 'lucide-react';
import { money, round2, todayStr } from '../../../../services/chmsFinanceReports';
import { postManualJournal, reverseJournal } from '../../../../services/acctService';
import type { ManualLineInput } from '../../../../services/acctReports';
import type { AcctJournal } from '../../../../types';
import { AccountSelect, Empty, Help, NextStep, ReadOnlyNote, btnGhost, btnPrimary, card, field, fieldSm, heading, label, Pill, useBooks, useDo, useWords } from './shared';

const emptyLine = (): ManualLineInput => ({ accountId: '', debit: 0, credit: 0 });

const JournalTab: React.FC = () => {
  const { org, books, ctx, canManage, simple, reload } = useBooks();
  const t = useWords(); const { busy, run } = useDo();
  const [q, setQ] = useState(''); const [period, setPeriod] = useState(''); const [open, setOpen] = useState<string | null>(null); const [limit, setLimit] = useState(100);
  const [composer, setComposer] = useState(false);
  const [date, setDate] = useState(todayStr()); const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<ManualLineInput[]>([emptyLine(), emptyLine()]);
  const [quick, setQuick] = useState({ from: '', to: '', amount: '', fundId: '', deptId: '' });
  const [revFor, setRevFor] = useState<string | null>(null); const [revReason, setRevReason] = useState('');
  const acct = useMemo(() => new Map(books.accounts.map(a => [a.id, a])), [books.accounts]);
  const funds = org.givingFunds || [];
  const periods = useMemo(() => [...new Set(books.journals.map(j => j.period))].sort().reverse(), [books.journals]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...books.journals].filter(j => (!period || j.period === period) && (!s || j.memo.toLowerCase().includes(s) || j.source.kind.toLowerCase().includes(s) || j.lines.some(l => (acct.get(l.accountId)?.name || '').toLowerCase().includes(s)))).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [books.journals, q, period, acct]);

  const diff = round2(lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0));
  const setLine = (i: number, p: Partial<ManualLineInput>) => setLines(ls => ls.map((l, x) => x === i ? { ...l, ...p } : l));
  const reset = () => { setComposer(false); setMemo(''); setLines([emptyLine(), emptyLine()]); setQuick({ from: '', to: '', amount: '', fundId: '', deptId: '' }); };

  const submit = () => run(async () => {
    const ls: ManualLineInput[] = simple
      ? (() => { const a = Number(quick.amount); if (!quick.from || !quick.to) throw new Error('Choose both accounts.'); if (quick.from === quick.to) throw new Error('Choose two different accounts.'); if (!(a > 0)) throw new Error('Enter an amount above zero.');
          return [{ accountId: quick.to, debit: a, credit: 0, fundId: quick.fundId || undefined, deptId: quick.deptId || undefined }, { accountId: quick.from, debit: 0, credit: a, fundId: quick.fundId || undefined }]; })()
      : lines;
    const r = await postManualJournal(org.id, { date, memo, lines: ls });
    reset(); await reload(); return r;
  }, 'Entry posted. You can reverse it any time.');

  const doReverse = (j: AcctJournal) => run(async () => { await reverseJournal(org.id, j, revReason); setRevFor(null); setRevReason(''); await reload(); }, 'Reversed — the original stays on record and the books net to zero.');

  const describe = (j: AcctJournal) => {
    const inflow = j.lines.filter(l => l.debit > 0), outflow = j.lines.filter(l => l.credit > 0);
    const total = round2(inflow.reduce((s, l) => s + l.debit, 0));
    const nm = (ls: typeof inflow) => ls.map(l => acct.get(l.accountId)?.name || '?').join(' + ');
    return { total, text: `${nm(outflow)} → ${nm(inflow)}` };
  };

  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={e => { setQ(e.target.value); setLimit(100); }} placeholder="Search memo, account, source…" className={`${fieldSm} flex-1 min-w-[180px]`} aria-label="Search entries" />
        <select value={period} onChange={e => setPeriod(e.target.value)} className={fieldSm} aria-label="Month"><option value="">All months</option>{periods.map(p => <option key={p} value={p}>{p}{books.closed.has(p) ? ' · locked' : ''}</option>)}</select>
        {canManage && <button onClick={() => setComposer(c => !c)} className={btnPrimary}><Plus size={12} /> {simple ? 'Record a transfer / adjustment' : 'New journal entry'}</button>}
      </div>

      {composer && canManage && (
        <div className={`${card} p-5 space-y-3`}>
          <p className={heading}>{simple ? 'Move money between categories' : 'Adjusting journal entry'} <Help term="journal" /></p>
          <div className="grid sm:grid-cols-[140px_1fr] gap-3">
            <div><p className={label}>Date</p><input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></div>
            <div><p className={label}>Memo (required)</p><input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Why does this entry exist? e.g. Move $500 from savings to checking" className={field} /></div>
          </div>
          {simple ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <div><p className={label}>Money comes from</p><AccountSelect value={quick.from} onChange={v => setQuick({ ...quick, from: v })} accounts={books.accounts} className="w-full" /></div>
              <div><p className={label}>Money goes to</p><AccountSelect value={quick.to} onChange={v => setQuick({ ...quick, to: v })} accounts={books.accounts} className="w-full" /></div>
              <div><p className={label}>Amount</p><input inputMode="decimal" value={quick.amount} onChange={e => setQuick({ ...quick, amount: e.target.value })} placeholder="0.00" className={field} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><p className={label}>Fund (optional)</p><select value={quick.fundId} onChange={e => setQuick({ ...quick, fundId: e.target.value })} className={`${fieldSm} w-full`}><option value="">—</option>{funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
                <div><p className={label}>Department (optional)</p><select value={quick.deptId} onChange={e => setQuick({ ...quick, deptId: e.target.value })} className={`${fieldSm} w-full`}><option value="">—</option>{(org.ministries || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_96px_96px_auto] sm:grid-cols-[1.4fr_1fr_1fr_96px_96px_auto] gap-2 items-center">
                  <AccountSelect value={l.accountId} onChange={v => setLine(i, { accountId: v })} accounts={books.accounts} className="w-full col-span-4 sm:col-span-1" />
                  <select value={l.fundId || ''} onChange={e => setLine(i, { fundId: e.target.value || undefined })} className={`${fieldSm} hidden sm:block`} aria-label="Fund"><option value="">Fund…</option>{funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                  <select value={l.deptId || ''} onChange={e => setLine(i, { deptId: e.target.value || undefined })} className={`${fieldSm} hidden sm:block`} aria-label="Department"><option value="">Dept…</option>{(org.ministries || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  <input inputMode="decimal" placeholder="Debit" value={l.debit || ''} onChange={e => setLine(i, { debit: Number(e.target.value) || 0, credit: 0 })} className={`${fieldSm} text-right`} aria-label="Debit" />
                  <input inputMode="decimal" placeholder="Credit" value={l.credit || ''} onChange={e => setLine(i, { credit: Number(e.target.value) || 0, debit: 0 })} className={`${fieldSm} text-right`} aria-label="Credit" />
                  <button onClick={() => setLines(ls => ls.length > 2 ? ls.filter((_, x) => x !== i) : ls)} className="p-2 text-white/30 hover:text-red-400" aria-label="Remove line"><Trash2 size={13} /></button>
                </div>
              ))}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button onClick={() => setLines(ls => [...ls, emptyLine()])} className={btnGhost}><Plus size={12} /> Add line</button>
                <p className={`text-xs font-bold ${diff === 0 ? 'text-green-400' : 'text-amber-300'}`}>{diff === 0 ? 'Balanced ✓' : `Out of balance by ${money(Math.abs(diff))} — ${diff > 0 ? 'add a credit' : 'add a debit'}`} <Help term="debit" /></p>
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end"><button onClick={reset} className={btnGhost}>Cancel</button><button onClick={submit} disabled={busy || !memo.trim() || (!simple && diff !== 0)} className={btnPrimary}>Post entry</button></div>
        </div>
      )}

      {rows.length === 0 ? (
        books.journals.length === 0
          ? <NextStep title="No entries yet" body="Gifts, deposits and Stripe payouts post themselves. You can also record an adjustment or import a bank statement to get going." action={canManage ? { label: simple ? 'Record a transfer' : 'New journal entry', onClick: () => setComposer(true) } : undefined} />
          : <Empty>No entries match. Try clearing the search or month filter.</Empty>
      ) : (
        <div className={`${card} p-2`}>
          {rows.slice(0, limit).map(j => {
            const d = describe(j); const isOpen = open === j.id; const rev = j.status === 'REVERSED'; const locked = books.closed.has(j.period);
            return (
              <div key={j.id} className="border-b border-white/5 last:border-0">
                <button onClick={() => setOpen(isOpen ? null : j.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] rounded-xl" aria-expanded={isOpen}>
                  {isOpen ? <ChevronDown size={13} className="text-white/40" /> : <ChevronRight size={13} className="text-white/40" />}
                  <span className="text-[10px] text-white/40 w-20 shrink-0 tabular-nums">{j.date}</span>
                  <span className={`flex-1 min-w-0 text-xs truncate ${rev ? 'line-through text-white/40' : 'text-white/85'}`}>{j.memo}{simple && <span className="text-white/30"> · {d.text}</span>}</span>
                  <Pill>{j.source.kind.replace('_', ' ').toLowerCase()}</Pill>
                  {rev && <Pill tone="warn">reversed</Pill>}{j.reversalOf && <Pill tone="info">reversal</Pill>}{locked && <Pill>locked</Pill>}
                  <span className="text-xs font-bold text-white tabular-nums w-24 text-right">{money(d.total)}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 pl-10">
                    {simple ? (
                      <p className="text-xs text-white/60">{money(d.total)} moved: {d.text}.</p>
                    ) : (
                      <table className="w-full text-[11px]"><thead><tr><th className={`${label} text-left py-1`}>Account</th><th className={`${label} text-left py-1`}>Fund / dept</th><th className={`${label} text-right py-1`}>{t('Debit', 'In')}</th><th className={`${label} text-right py-1`}>{t('Credit', 'Out')}</th></tr></thead>
                        <tbody>{j.lines.map((l, i) => <tr key={i} className="border-t border-white/5 text-white/75"><td className="py-1">{acct.get(l.accountId) ? `${acct.get(l.accountId)!.code} · ${acct.get(l.accountId)!.name}` : l.accountId}</td><td className="py-1 text-white/40">{[l.fundId && (funds.find(f => f.id === l.fundId)?.name || l.fundId), l.deptId && ((org.ministries || []).find(m => m.id === l.deptId)?.name || l.deptId)].filter(Boolean).join(' / ')}</td><td className="py-1 text-right tabular-nums">{l.debit ? money(l.debit) : ''}</td><td className="py-1 text-right tabular-nums">{l.credit ? money(l.credit) : ''}</td></tr>)}</tbody></table>
                    )}
                    <p className="text-[10px] text-white/30 mt-2">Posted {new Date(j.createdAt).toLocaleString()} by {j.createdBy === 'stripe' ? 'the Stripe sync' : j.createdBy.slice(0, 6)}{j.key ? ` · ${j.key}` : ''}</p>
                    {canManage && !rev && !j.reversalOf && (
                      revFor === j.id ? (
                        <div className="flex gap-2 mt-2 items-center flex-wrap">
                          <input autoFocus value={revReason} onChange={e => setRevReason(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doReverse(j); if (e.key === 'Escape') setRevFor(null); }} placeholder="Reason (optional) — Enter to confirm" className={`${fieldSm} flex-1 min-w-[200px]`} />
                          <button onClick={() => doReverse(j)} disabled={busy} className={btnPrimary}>Reverse</button><button onClick={() => setRevFor(null)} className={btnGhost}>Cancel</button>
                        </div>
                      ) : <button onClick={() => setRevFor(j.id)} className={`${btnGhost} mt-2`}><Undo2 size={12} /> Undo (reverse) <Help term="reversal" /></button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {rows.length > limit && <button onClick={() => setLimit(l => l + 200)} className={`${btnGhost} w-full mt-2`}>Show more ({rows.length - limit} older)</button>}
        </div>
      )}
      <p className="text-[10px] text-white/30">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · entries are never deleted — mistakes are reversed so the audit trail stays complete.</p>
    </div>
  );
};
export default JournalTab;
