// Setup — "Set up your books in 5 minutes": chart, fiscal year, bank accounts, opening balances, funds, catch-up.
import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { money, round2, todayStr } from '../../../../services/chmsFinanceReports';
import { saveFinanceSettings, saveFunds, settingsOf } from '../../../../services/chmsFinance';
import { backfillGiftJournals, ensureChart, postOpeningBalances } from '../../../../services/acctService';
import { planGiftJournals } from '../../../../services/acctReports';
import { BankAccountForm } from './BankTab';
import { Help, Pill, btnGhost, btnPrimary, card, fieldSm, heading, label, useBooks, useDo } from './shared';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const Step: React.FC<{ n: number; title: string; done: boolean; optional?: boolean; children: React.ReactNode }> = ({ n, title, done, optional, children }) => (
  <div className={`${card} p-5`}>
    <div className="flex items-center gap-3 mb-3">{done ? <CheckCircle2 size={18} className="text-green-400" /> : <Circle size={18} className="text-white/20" />}
      <p className="text-sm font-black text-white flex-1">{n}. {title}</p>{optional && <Pill>optional</Pill>}</div>
    {children}
  </div>
);

const SetupTab: React.FC = () => {
  const { org, books, facts, reload, go, setOrg } = useBooks();
  const { busy, run } = useDo();
  const st = settingsOf(org);
  const [addBank, setAddBank] = useState(false);
  const [openDate, setOpenDate] = useState(`${todayStr().slice(0, 4)}-01-01`);
  const bsAccts = useMemo(() => books.accounts.filter(a => a.active && (a.type === 'ASSET' || a.type === 'LIABILITY' || (a.type === 'NET_ASSET' && !a.systemKey))).sort((a, b) => a.code.localeCompare(b.code)), [books.accounts]);
  const [bal, setBal] = useState<Record<string, string>>({});
  const openingPosted = books.journals.some(j => j.source.kind === 'OPENING');
  const plan = useMemo(() => planGiftJournals({ contributions: facts.contributions, batches: facts.batches, journals: books.journals, sys: books.sys }), [facts, books]);
  const funds = org.givingFunds || [];
  // plug preview: assets − liabilities − net assets
  const plug = round2(bsAccts.reduce((s, a) => { const v = Number(bal[a.id]) || 0; return s + (a.type === 'ASSET' ? v : -v); }, 0));

  const skip = () => { try { localStorage.setItem(`books_setup_skip_${org.id}`, '1'); } catch { /* */ } go('overview'); };

  return (
    <div className="space-y-4">
      <div className={`${card} p-5 border-small-orange/30`}>
        <p className="text-sm font-black text-white">Set up your books in 5 minutes</p>
        <p className="text-xs text-white/50 mt-1">Do the steps in any order. Gifts, deposits and Stripe payouts post on their own once the chart exists — you never type them twice.</p>
      </div>

      <Step n={1} title="Chart of accounts" done={books.accounts.length > 0}>
        <p className="text-xs text-white/60">{books.accounts.length ? `${books.accounts.length} accounts are ready (a standard church chart: checking, savings, Stripe clearing, contributions, ministry expenses, restricted & unrestricted net assets).` : 'We will create a standard church chart for you.'}</p>
        <button disabled={busy} onClick={() => run(async () => { const r = await ensureChart(org.id); await reload(); return r; }, r => r.seeded ? `Added ${r.seeded} standard account(s).` : 'Chart is complete — nothing to add.')} className={`${btnGhost} mt-3`}>Check / add missing standard accounts</button>
        <button onClick={() => go('chart')} className={`${btnGhost} mt-3 ml-2`}>Review & rename</button>
      </Step>

      <Step n={2} title="Fiscal year" done>
        <div className="flex items-center gap-3 flex-wrap"><p className="text-xs text-white/60">Our year starts in</p>
          <select value={st.fiscalYearStartMonth} onChange={e => run(async () => { const out = await saveFinanceSettings(org, { financeSettings: { ...(org.financeSettings || {}), fiscalYearStartMonth: Number(e.target.value) } }); setOrg({ ...org, ...out }); await reload(); }, 'Fiscal year saved.')} className={fieldSm}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          <span className="text-[10px] text-white/40">Most churches use January. Budgets and year-end follow this.</span></div>
      </Step>

      <Step n={3} title="Bank accounts" done={books.bankAccounts.length > 0}>
        {books.bankAccounts.map(b => <p key={b.id} className="text-xs text-white/70 py-1">{b.name}{b.last4 ? ` ····${b.last4}` : ''} <span className="text-white/30">· {b.kind.toLowerCase().replace('_', ' ')}</span></p>)}
        {addBank ? <div className="mt-2"><BankAccountForm onDone={() => setAddBank(false)} /></div> : <button onClick={() => setAddBank(true)} className={`${btnGhost} mt-3`}><Plus size={12} /> Add bank account</button>}
      </Step>

      <Step n={4} title="Opening balances" done={openingPosted} optional>
        {openingPosted ? <p className="text-xs text-white/60">Opening balances are posted. To redo them, reverse the entry in the Journal tab.</p> : (
          <>
            <p className="text-xs text-white/60">Moving mid-year? Enter what you had on the day you start using Books (from your last statements). Skip this if you are starting on a fresh fiscal year with nothing carried over.</p>
            <div className="flex items-center gap-3 mt-3"><p className={label}>As of</p><input type="date" value={openDate} onChange={e => setOpenDate(e.target.value)} className={fieldSm} /></div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
              {bsAccts.map(a => <div key={a.id} className="flex items-center gap-2"><span className="flex-1 text-xs text-white/70 truncate">{a.code} · {a.name}</span><input inputMode="decimal" value={bal[a.id] || ''} onChange={e => setBal({ ...bal, [a.id]: e.target.value })} placeholder="0.00" className={`${fieldSm} w-28 text-right`} aria-label={a.name} /></div>)}
            </div>
            <p className="text-[10px] text-white/40 mt-2">{plug === 0 ? 'Balanced.' : `The difference (${money(plug)}) goes to Opening Balance Equity — that is normal; it is your starting net assets.`} <Help term="netassets" /></p>
            <button disabled={busy || !Object.values(bal).some(v => Number(v))} onClick={() => run(async () => { await postOpeningBalances(org.id, openDate, bsAccts.map(a => ({ accountId: a.id, amount: Number(bal[a.id]) || 0 }))); await reload(); }, 'Opening balances posted.')} className={`${btnPrimary} mt-3`}>Post opening balances</button>
          </>
        )}
      </Step>

      <Step n={5} title="Giving funds → books" done={funds.length > 0}>
        <p className="text-xs text-white/60">Every gift posts to Contributions with its fund attached, so you can report income and spending per fund. Mark a fund <b>donor-restricted</b> and its money is reported under "net assets with donor restrictions" automatically. <Help term="restricted" /></p>
        {funds.length === 0 ? <p className="text-xs text-white/40 mt-2">No giving funds yet — add them in Finance Hub › Funds.</p> : (
          <div className="mt-3 space-y-1">{funds.map(f => (
            <label key={f.id} className="flex items-center gap-3 text-xs text-white/80 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2"><span className="flex-1">{f.name}</span>
              <span className="text-[10px] text-white/40">{f.restricted ? 'with donor restrictions' : 'without donor restrictions'}</span>
              <input type="checkbox" checked={!!f.restricted} disabled={busy} onChange={() => run(async () => { const next = funds.map(x => x.id === f.id ? { ...x, restricted: !x.restricted } : x); await saveFunds(org, next); setOrg({ ...org, givingFunds: next }); }, `${f.name} is now ${f.restricted ? 'unrestricted' : 'donor-restricted'}.`)} aria-label={`${f.name} restricted`} /></label>))}</div>
        )}
      </Step>

      <Step n={6} title="Catch up your giving history" done={plan.drafts.length === 0 && plan.reversals.length === 0}>
        <p className="text-xs text-white/60">{plan.drafts.length || plan.reversals.length ? `${plan.drafts.length} gift/deposit entr${plan.drafts.length === 1 ? 'y is' : 'ies are'} not in the books yet${plan.reversals.length ? ` and ${plan.reversals.length} voided gift(s) need reversing` : ''}${plan.waiting ? ` (${plan.waiting} more wait for their batch to post)` : ''}.` : 'Every posted gift and deposit is in the books.'}</p>
        {(plan.drafts.length > 0 || plan.reversals.length > 0) && <button disabled={busy} onClick={() => run(async () => { const r = await backfillGiftJournals(org.id); await reload(); return r; }, r => `Posted ${r.posted} entr${r.posted === 1 ? 'y' : 'ies'}${r.reversed ? `, reversed ${r.reversed}` : ''}${r.closedSkipped ? ` · ${r.closedSkipped} skipped in locked periods` : ''}.`)} className={`${btnPrimary} mt-3`}>Post them now</button>}
        {plan.errors.length > 0 && <p className="text-[11px] text-red-400 mt-2">{plan.errors[0]}</p>}
      </Step>

      <div className="flex justify-between flex-wrap gap-2"><button onClick={skip} className={btnGhost}>Skip setup for now</button><button onClick={() => go('overview')} className={btnPrimary}>Go to Overview</button></div>
      <p className="text-[10px] text-white/30">Nothing here is permanent: accounts can be renamed or hidden, and every entry can be reversed.</p>
    </div>
  );
};
export default SetupTab;
