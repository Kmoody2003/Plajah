// Bank & Reconciliation — import a bank CSV, auto-match deposits / Stripe payouts / checks with confidence scores,
// turn leftovers into entries (Aria suggests the category), then reconcile to the statement balance.
import React, { useMemo, useRef, useState } from 'react';
import { Check, FileUp, Landmark, Plus, Sparkles, Wand2 } from 'lucide-react';
import type { AcctBankAccount, AcctBankTxn } from '../../../../types';
import { money, round2, todayStr } from '../../../../services/chmsFinanceReports';
import {
  acceptMatches, ariaCategorize, createEntryFromTxn, finishReconciliation, ignoreTxn, importBankLines, previewBankCsv, saveBankAccount, unmatchTxn, type ImportPreview,
} from '../../../../services/acctService';
import { HIGH_CONFIDENCE, autoMatch, buildCategoryMemory, suggestCategory, type CategoryGuess, type MatchCandidate } from '../../../../services/acctBank';
import { AccountSelect, Empty, Help, NextStep, Pill, ReadOnlyNote, btnGhost, btnPrimary, card, field, fieldSm, heading, label, useBooks, useDo } from './shared';

export const BankAccountForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { org, books, reload } = useBooks(); const { busy, run } = useDo();
  const cashAccts = books.accounts.filter(a => a.type === 'ASSET' || a.type === 'LIABILITY');
  const [f, setF] = useState({ name: '', last4: '', kind: 'CHECKING' as AcctBankAccount['kind'], accountId: '', openingBalance: '' });
  const defaultAcct = (k: string) => k === 'SAVINGS' ? books.accounts.find(a => a.code === '1010')?.id : k === 'CREDIT_CARD' ? books.accounts.find(a => a.code === '2200')?.id : books.sys.CASH_OPERATING;
  const acctId = f.accountId || defaultAcct(f.kind) || '';
  return (
    <div className={`${card} p-5 space-y-3`}>
      <p className={heading}>Add a bank account</p>
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2"><p className={label}>Name</p><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Main Checking — First National" className={field} /></div>
        <div><p className={label}>Last 4 digits</p><input value={f.last4} maxLength={4} onChange={e => setF({ ...f, last4: e.target.value.replace(/\D/g, '') })} className={field} /></div>
        <div><p className={label}>Type</p><select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as any, accountId: '' })} className={`${fieldSm} w-full`}><option value="CHECKING">Checking</option><option value="SAVINGS">Savings</option><option value="CREDIT_CARD">Credit card</option></select></div>
        <div className="sm:col-span-2"><p className={label}>Posts to ledger account</p><AccountSelect value={acctId} onChange={v => setF({ ...f, accountId: v })} accounts={cashAccts} className="w-full" /></div>
        <div><p className={label}>Balance when you start (optional)</p><input inputMode="decimal" value={f.openingBalance} onChange={e => setF({ ...f, openingBalance: e.target.value })} className={field} placeholder="0.00" /></div>
      </div>
      <p className="text-[10px] text-white/40">The opening balance is the amount on your first statement; it only sets the starting point for reconciling. Post it to the books in Setup › Opening balances.</p>
      <div className="flex justify-end gap-2"><button onClick={onDone} className={btnGhost}>Cancel</button>
        <button disabled={busy || !f.name.trim() || !acctId} onClick={() => run(async () => { await saveBankAccount(org.id, { name: f.name, last4: f.last4, kind: f.kind, accountId: acctId, openingBalance: f.openingBalance ? Number(f.openingBalance) : undefined }); await reload(); onDone(); }, 'Bank account added.')} className={btnPrimary}>Save</button></div>
    </div>
  );
};

type Sub = 'match' | 'import' | 'reconcile';

const BankTab: React.FC = () => {
  const { org, books, canManage } = useBooks();
  const banks =books.bankAccounts.filter(b => b.active);
  const [bankId, setBankId] = useState<string>(banks[0]?.id || ''); const [sub, setSub] = useState<Sub>('match'); const [adding, setAdding] = useState(false);
  const bank = banks.find(b => b.id === bankId) || banks[0];

  if (!banks.length || adding) return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      {adding ? <BankAccountForm onDone={() => setAdding(false)} /> : <NextStep title="Connect your first bank account" body="Add the account, then import a CSV from your bank's website. We match deposits, Stripe payouts and checks automatically." action={canManage ? { label: 'Add bank account', onClick: () => setAdding(true) } : undefined} />}
    </div>
  );

  const txns = books.bankTxns.filter(t => t.bankAccountId === bank.id).sort((a, b) => b.date.localeCompare(a.date));
  const unmatched = txns.filter(t => t.status === 'UNMATCHED');
  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <div className="flex flex-wrap items-center gap-2">
        <select value={bank.id} onChange={e => setBankId(e.target.value)} className={fieldSm} aria-label="Bank account">{banks.map(b => <option key={b.id} value={b.id}>{b.name}{b.last4 ? ` ····${b.last4}` : ''}</option>)}</select>
        <div className="flex gap-1.5">{(['match', 'import', 'reconcile'] as Sub[]).map(s => <button key={s} onClick={() => setSub(s)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${sub === s ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>{s === 'match' ? `Match${unmatched.length ? ` (${unmatched.length})` : ''}` : s === 'import' ? 'Import CSV' : 'Reconcile'}</button>)}</div>
        {canManage && <button onClick={() => setAdding(true)} className={`${btnGhost} ml-auto`}><Plus size={12} /> Account</button>}
      </div>
      {sub === 'import' && <ImportPane bank={bank} onDone={() => setSub('match')} />}
      {sub === 'match' && <MatchPane bank={bank} txns={txns} goImport={() => setSub('import')} />}
      {sub === 'reconcile' && <ReconcilePane bank={bank} txns={txns} />}
      <p className="text-[10px] text-white/30"><Landmark size={10} className="inline mr-1" />{org.name} · bank lines stay inside your Plajah account.</p>
    </div>
  );
};

// ── Import ─────────────────────────────────────────────────────────────────────
const ImportPane: React.FC<{ bank: AcctBankAccount; onDone: () => void }> = ({ bank, onDone }) => {
  const { org, books, canManage, reload } = useBooks(); const { busy, run } = useDo();
  const [text, setText] = useState(''); const [fileName, setFileName] = useState(''); const [flip, setFlip] = useState(false); const [err, setErr] = useState(''); const input = useRef<HTMLInputElement>(null);
  const preview: ImportPreview | null = useMemo(() => { if (!text) return null; try { setErr(''); return previewBankCsv(text, flip); } catch (e: any) { setErr(e.message); return null; } }, [text, flip]);   // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = preview ? preview.lines.length : 0;
  if (!canManage) return <ReadOnlyNote />;
  return (
    <div className={`${card} p-5 space-y-4`}>
      <p className={heading}>Import a bank statement</p>
      <p className="text-xs text-white/50">Download a CSV from your bank (any bank — we detect the date, description and amount columns). Importing the same file twice is safe: duplicates are skipped.</p>
      <div className="flex gap-2 items-center flex-wrap">
        <input ref={input} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); setText(await f.text()); } }} />
        <button onClick={() => input.current?.click()} className={btnPrimary}><FileUp size={12} /> Choose CSV file</button>
        {fileName && <span className="text-xs text-white/50">{fileName}</span>}
        <label className="text-[10px] text-white/50 flex items-center gap-1.5 ml-auto"><input type="checkbox" checked={flip} onChange={e => setFlip(e.target.checked)} /> Flip signs (credit-card exports)</label>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {preview && (
        <>
          <p className="text-xs text-white/70">Found <b className="text-white">{preview.lines.length}</b> lines{preview.skipped ? ` (${preview.skipped} skipped — blank or unreadable)` : ''}. Dates {preview.lines.length ? `${preview.lines.reduce((m, l) => l.date < m ? l.date : m, '9999')} → ${preview.lines.reduce((m, l) => l.date > m ? l.date : m, '0000')}` : ''}.</p>
          <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr><th className={`${label} text-left py-1`}>Date</th><th className={`${label} text-left py-1`}>Description</th><th className={`${label} text-right py-1`}>Amount</th></tr></thead>
            <tbody>{preview.lines.slice(0, 6).map((l, i) => <tr key={i} className="border-t border-white/5 text-white/75"><td className="py-1 tabular-nums">{l.date}</td><td className="py-1 truncate max-w-[320px]">{l.description}</td><td className={`py-1 text-right tabular-nums ${l.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>{money(l.amount)}</td></tr>)}</tbody></table></div>
          <p className="text-[10px] text-white/40">Money in should be positive (green) and money out negative (red). If it looks backwards, tick "Flip signs".</p>
          <div className="flex justify-end gap-2"><button onClick={() => { setText(''); setFileName(''); }} className={btnGhost}>Clear</button>
            <button disabled={busy || !fresh} onClick={() => run(async () => { const r = await importBankLines(org.id, bank.id, preview.lines, books.bankTxns); await reload(); onDone(); return r; }, r => `Imported ${r.added} new line${r.added === 1 ? '' : 's'}${r.duplicates ? ` · ${r.duplicates} duplicate${r.duplicates === 1 ? '' : 's'} skipped` : ''}.`)} className={btnPrimary}>Import {fresh} lines</button></div>
        </>
      )}
    </div>
  );
};

// ── Match ──────────────────────────────────────────────────────────────────────
const MatchPane: React.FC<{ bank: AcctBankAccount; txns: AcctBankTxn[]; goImport: () => void }> = ({ bank, txns, goImport }) => {
  const { org, books, canManage, reload } = useBooks(); const { busy, run } = useDo();
  const cands = useMemo(() => autoMatch(txns, bank, books.journals, books.payouts, books.expenses, books.bankTxns), [txns, bank, books]);
  const high = cands.filter(c => c.confidence >= HIGH_CONFIDENCE);
  const candByTxn = new Map(cands.map(c => [c.txnId, c]));
  const unmatched = txns.filter(t => t.status === 'UNMATCHED');
  const memory = useMemo(() => buildCategoryMemory(books.bankTxns, books.journals, new Set(books.bankAccounts.map(b => b.accountId))), [books]);
  const [creating, setCreating] = useState<string | null>(null); const [show, setShow] = useState<'todo' | 'done' | 'ignored'>('todo');
  const [form, setForm] = useState<{ accountId: string; fundId: string; deptId: string; memo: string; note?: string }>({ accountId: '', fundId: '', deptId: '', memo: '' });
  const [aria, setAria] = useState(false);
  const jById = useMemo(() => new Map(books.journals.map(j => [j.id, j])), [books.journals]);

  const startCreate = (t: AcctBankTxn) => {
    const g = suggestCategory(t.description, t.amount, memory, books.accounts);
    setCreating(t.id); setForm({ accountId: g?.accountId || '', fundId: g?.fundId || '', deptId: g?.deptId || '', memo: t.description, note: g?.note });
  };
  const askAria = async (t: AcctBankTxn) => { setAria(true); const g: CategoryGuess | null = await ariaCategorize(t.description, t.amount, books.accounts); setAria(false); if (g) setForm(f => ({ ...f, accountId: g.accountId, note: g.note })); else setForm(f => ({ ...f, note: 'Aria had no suggestion — choose a category.' })); };
  const list = txns.filter(t => show === 'todo' ? t.status === 'UNMATCHED' : show === 'done' ? t.status === 'MATCHED' : t.status === 'IGNORED');

  if (!txns.length) return <NextStep title="No bank lines yet" body="Import a CSV from your bank to start matching. Your deposits, Stripe payouts and checks will match themselves." action={canManage ? { label: 'Import a statement', onClick: goImport } : undefined} />;

  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <Wand2 size={16} className="text-small-orange" />
        <div className="flex-1 min-w-[200px]"><p className="text-sm font-black text-white">{high.length ? `${high.length} match${high.length === 1 ? '' : 'es'} we are confident about` : cands.length ? 'Some possible matches need a look' : 'Nothing to auto-match right now'}</p><p className="text-[10px] text-white/40">Same amount within a few days, check numbers, and Stripe payouts. {unmatched.length} line{unmatched.length === 1 ? '' : 's'} still open.</p></div>
        {canManage && <button disabled={busy || !high.length} onClick={() => run(() => acceptMatches(org.id, high).then(async n => { await reload(); return n; }), n => `Matched ${n} line${n === 1 ? '' : 's'}.`)} className={btnPrimary}><Check size={12} /> Accept all {high.length} high-confidence</button>}
      </div>
      <div className="flex gap-1.5">{([['todo', `To review (${unmatched.length})`], ['done', 'Matched'], ['ignored', 'Ignored']] as const).map(([k, l]) => <button key={k} onClick={() => setShow(k)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${show === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>{l}</button>)}</div>
      {list.length === 0 ? <Empty>{show === 'todo' ? 'All caught up — every bank line is matched. Head to Reconcile to finish the month.' : 'Nothing here.'}</Empty> : (
        <div className={`${card} p-2`}>
          {list.slice(0, 200).map(t => {
            const c = candByTxn.get(t.id); const j = t.matchedJournalId ? jById.get(t.matchedJournalId) : undefined;
            return (
              <div key={t.id} className="border-b border-white/5 last:border-0 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-white/40 w-20 shrink-0 tabular-nums">{t.date}</span>
                  <span className="flex-1 min-w-0 text-xs text-white/85 truncate">{t.description}</span>
                  <span className={`text-xs font-bold tabular-nums w-24 text-right ${t.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>{money(t.amount)}</span>
                </div>
                {show === 'todo' && (
                  <div className="mt-1.5 pl-[92px] flex flex-wrap items-center gap-2">
                    {c && <><span className={`text-[10px] font-black ${c.confidence >= HIGH_CONFIDENCE ? 'text-green-400' : 'text-amber-300'}`}>{Math.round(c.confidence * 100)}%</span><span className="text-[11px] text-white/60 truncate max-w-[320px]">{c.label} <span className="text-white/30">({c.reasons.join(', ')})</span></span>
                      {canManage && <button disabled={busy} onClick={() => run(async () => { await acceptMatches(org.id, [c]); await reload(); }, 'Matched.')} className="text-[10px] font-black uppercase tracking-widest text-green-400 hover:text-green-300">Accept</button>}</>}
                    {canManage && <button onClick={() => creating === t.id ? setCreating(null) : startCreate(t)} className="text-[10px] font-black uppercase tracking-widest text-small-orange">{c ? 'Or create entry' : 'Create entry'}</button>}
                    {canManage && <button onClick={() => run(async () => { await ignoreTxn(org.id, t); await reload(); }, 'Ignored (you can restore it).')} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Ignore</button>}
                  </div>
                )}
                {show === 'done' && <div className="pl-[92px] mt-1 flex items-center gap-2 text-[11px] text-white/50">{j ? j.memo : t.matchedPayoutId ? 'Stripe payout' : 'Matched'}{t.reconciledAt ? <Pill tone="ok">reconciled</Pill> : canManage && <button onClick={() => run(async () => { await unmatchTxn(org.id, t); await reload(); }, 'Unmatched.')} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Unmatch</button>}</div>}
                {show === 'ignored' && canManage && <div className="pl-[92px] mt-1"><button onClick={() => run(async () => { await ignoreTxn(org.id, t, false); await reload(); }, 'Restored.')} className="text-[10px] font-black uppercase tracking-widest text-small-orange">Restore</button></div>}
                {creating === t.id && canManage && (
                  <div className="mt-2 ml-[92px] bg-black/30 border border-white/10 rounded-2xl p-3 space-y-2">
                    <p className="text-[10px] text-white/50">{t.amount < 0 ? 'Money out — pick the spending category' : 'Money in — pick where it came from'}{form.note && <span className="text-small-orange"> · {form.note}</span>}</p>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <AccountSelect value={form.accountId} onChange={v => setForm(f => ({ ...f, accountId: v }))} accounts={books.accounts.filter(a => a.id !== bank.accountId)} types={t.amount < 0 ? ['EXPENSE', 'LIABILITY', 'ASSET'] : ['REVENUE', 'LIABILITY', 'ASSET', 'NET_ASSET']} className="w-full" autoFocus />
                      <select value={form.fundId} onChange={e => setForm(f => ({ ...f, fundId: e.target.value }))} className={fieldSm}><option value="">Fund (optional)</option>{(org.givingFunds || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                      <select value={form.deptId} onChange={e => setForm(f => ({ ...f, deptId: e.target.value }))} className={fieldSm}><option value="">Department (optional)</option>{(org.ministries || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                    </div>
                    <input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} className={`${fieldSm} w-full`} aria-label="Memo" />
                    <div className="flex gap-2 justify-end flex-wrap">
                      <button disabled={aria} onClick={() => askAria(t)} className={btnGhost}><Sparkles size={12} /> {aria ? 'Thinking…' : 'Ask Aria'}</button>
                      <button onClick={() => setCreating(null)} className={btnGhost}>Cancel</button>
                      <button disabled={busy || !form.accountId} onClick={() => run(async () => { await createEntryFromTxn(org.id, t, bank, { accountId: form.accountId, fundId: form.fundId || undefined, deptId: form.deptId || undefined, memo: form.memo }); setCreating(null); await reload(); }, 'Entry created and matched. Next time we will remember this one.')} className={btnPrimary}>Create & match</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {list.length > 200 && <p className="text-[10px] text-white/30 p-2">Showing 200 of {list.length}.</p>}
        </div>
      )}
      <p className="text-[10px] text-white/30"><Help term="reconcile">What is matching?</Help></p>
    </div>
  );
};

// ── Reconcile ──────────────────────────────────────────────────────────────────
const ReconcilePane: React.FC<{ bank: AcctBankAccount; txns: AcctBankTxn[] }> = ({ bank, txns }) => {
  const { org, books, canManage, reload } = useBooks(); const { busy, run } = useDo();
  const [date, setDate] = useState(todayStr()); const [endBal, setEndBal] = useState('');
  const last = bank.lastReconciled; const opening = last ? last.balance : bank.openingBalance || 0;
  const cleared = txns.filter(t => t.status === 'MATCHED' && !t.reconciledAt && t.date <= date);
  const openLines = txns.filter(t => t.status === 'UNMATCHED' && t.date <= date);
  const clearedBal = round2(opening + cleared.reduce((s, t) => s + t.amount, 0));
  const stmt = endBal === '' ? null : Number(endBal);
  const diff = stmt === null || isNaN(stmt) ? null : round2(stmt - clearedBal);
  const bookBal = round2(books.journals.filter(j => j.date <= date).reduce((s, j) => s + j.lines.filter(l => l.accountId === bank.accountId).reduce((a, l) => a + l.debit - l.credit, 0), 0));
  const adj = diff !== null && diff !== 0;
  return (
    <div className={`${card} p-5 space-y-4`}>
      <p className={heading}>Reconcile {bank.name} <Help term="reconcile" /></p>
      {!canManage && <ReadOnlyNote />}
      <div className="grid sm:grid-cols-3 gap-3">
        <div><p className={label}>Statement ending date</p><input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></div>
        <div><p className={label}>Statement ending balance</p><input inputMode="decimal" value={endBal} onChange={e => setEndBal(e.target.value)} placeholder="0.00" className={field} autoFocus /></div>
        <div><p className={label}>Last reconciled</p><p className="text-sm text-white/70 py-3">{last ? `${last.date} · ${money(last.balance)}` : 'Never — starting at ' + money(opening)}</p></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[['Starting balance', money(opening)], [`Cleared (${cleared.length} lines)`, money(round2(cleared.reduce((s, t) => s + t.amount, 0)))], ['Cleared balance', money(clearedBal)], ['Books say', money(bookBal)]].map(([l, v]) => <div key={l} className="bg-white/[0.03] border border-white/10 rounded-2xl p-3"><p className={label}>{l}</p><p className="text-sm font-black text-white mt-1">{v}</p></div>)}
      </div>
      <div className={`rounded-2xl p-4 text-center border ${diff === null ? 'border-white/10 bg-white/[0.02]' : diff === 0 ? 'border-green-500/30 bg-green-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
        <p className={label}>Difference</p>
        <p className={`text-2xl font-black ${diff === 0 ? 'text-green-400' : 'text-white'}`}>{diff === null ? 'Enter the statement balance' : diff === 0 ? '$0.00 — you are balanced' : money(diff)}</p>
        {diff !== null && diff !== 0 && <p className="text-[11px] text-white/50 mt-1">{openLines.length ? `${openLines.length} unmatched bank line${openLines.length === 1 ? '' : 's'} before ${date} could explain this — match them first.` : 'Look for a missing entry, or finish with an adjustment (posted to Reconciliation Discrepancies).'}</p>}
      </div>
      {openLines.length > 0 && <p className="text-xs text-amber-300">{openLines.length} bank line{openLines.length === 1 ? ' is' : 's are'} not matched yet — use the Match tab.</p>}
      {canManage && <div className="flex justify-end gap-2">
        <button disabled={busy || stmt === null || isNaN(stmt as number) || cleared.length === 0 && !adj} onClick={() => run(async () => { if (adj && !window.confirm(`Post a ${money(diff!)} adjustment to Reconciliation Discrepancies and finish?`)) return; await finishReconciliation(org.id, bank, date, stmt!, cleared.map(t => t.id), adj ? { amount: diff! } : undefined); await reload(); }, `Reconciled through ${date}. Those lines are now locked.`)} className={btnPrimary}>{adj ? 'Finish with adjustment' : 'Finish reconciliation'}</button>
      </div>}
      <p className="text-[10px] text-white/30">Finishing locks the cleared lines so they cannot be un-matched by accident. Cleared = bank lines you matched to an entry, dated on or before the statement date.</p>
    </div>
  );
};

export default BankTab;
