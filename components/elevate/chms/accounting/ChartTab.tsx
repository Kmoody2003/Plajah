// Chart of Accounts — the church's categories. Seeded automatically; rename, add and hide freely (system accounts keep their code).
import React, { useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { AcctAccount, AcctAccountType } from '../../../../types';
import { money } from '../../../../services/chmsFinanceReports';
import { saveAccount } from '../../../../services/acctService';
import { Help, Pill, ReadOnlyNote, btnGhost, btnPrimary, card, field, fieldSm, heading, label, useBooks, useDo, useWords } from './shared';

const TYPES: { t: AcctAccountType; pro: string; easy: string; next: string }[] = [
  { t: 'ASSET', pro: 'Assets', easy: 'What we have', next: '1' }, { t: 'LIABILITY', pro: 'Liabilities', easy: 'What we owe', next: '2' },
  { t: 'NET_ASSET', pro: 'Net assets', easy: 'Our savings / equity', next: '3' }, { t: 'REVENUE', pro: 'Revenue', easy: 'Income categories', next: '4' }, { t: 'EXPENSE', pro: 'Expenses', easy: 'Spending categories', next: '5' },
];

const ChartTab: React.FC = () => {
  const { org, books, canManage, reload } = useBooks(); const w = useWords(); const { busy, run } = useDo();
  const [edit, setEdit] = useState<Partial<AcctAccount> | null>(null); const [showInactive, setShowInactive] = useState(false);
  const bal = useMemo(() => { const m = new Map<string, number>(); books.journals.forEach(j => j.lines.forEach(l => m.set(l.accountId, (m.get(l.accountId) || 0) + Math.round(l.debit * 100) - Math.round(l.credit * 100)))); return m; }, [books.journals]);
  const natural = (a: AcctAccount) => (bal.get(a.id) || 0) / 100 * (a.type === 'ASSET' || a.type === 'EXPENSE' ? 1 : -1);
  const nextCode = (t: AcctAccountType) => { const pre = TYPES.find(x => x.t === t)!.next; const used = new Set(books.accounts.map(a => a.code)); for (let n = 10; n < 1000; n += 10) { const c = `${pre}${String(n).padStart(3, '0')}`; if (!used.has(c)) return c; } return `${pre}999`; };

  const save = () => run(async () => { if (!edit) return; await saveAccount(org.id, edit as any); setEdit(null); await reload(); }, 'Saved.');

  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-white/50">{w('Your chart of accounts is ready-made for churches. Rename anything; hide what you do not use.', 'These are your categories. Rename anything and hide what you do not use.')}</p>
        <div className="flex gap-2 items-center"><label className="text-[10px] text-white/50 flex items-center gap-1.5"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show hidden</label>{canManage && <button onClick={() => setEdit({ type: 'EXPENSE', code: nextCode('EXPENSE'), name: '', active: true })} className={btnPrimary}><Plus size={12} /> Add</button>}</div>
      </div>

      {edit && canManage && (
        <div className={`${card} p-5 space-y-3`}>
          <p className={heading}>{edit.id ? 'Edit account' : 'New account'}</p>
          <div className="grid sm:grid-cols-4 gap-3">
            <div><p className={label}>Type</p><select disabled={!!edit.id} value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value as AcctAccountType, code: edit.id ? edit.code : nextCode(e.target.value as AcctAccountType) })} className={`${fieldSm} w-full`}>{TYPES.map(t => <option key={t.t} value={t.t}>{w(t.pro, t.easy)}</option>)}</select></div>
            <div><p className={label}>Code</p><input disabled={!!edit.id} value={edit.code || ''} onChange={e => setEdit({ ...edit, code: e.target.value })} className={field} /></div>
            <div className="sm:col-span-2"><p className={label}>Name</p><input autoFocus value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && edit.name && save()} className={field} /></div>
            {edit.type === 'EXPENSE' && <div className="sm:col-span-2"><p className={label}>Counts as <Help term="functional" /></p><select value={edit.functionalClass || ''} onChange={e => setEdit({ ...edit, functionalClass: (e.target.value || undefined) as any })} className={`${fieldSm} w-full`}><option value="">Management & general (default)</option><option value="PROGRAM">Program / ministry</option><option value="FUNDRAISING">Fundraising</option></select></div>}
            {edit.type === 'ASSET' && <div className="sm:col-span-2"><p className={label}>Kind</p><select value={edit.subtype || ''} onChange={e => setEdit({ ...edit, subtype: e.target.value || undefined })} className={`${fieldSm} w-full`}><option value="">Other asset</option><option value="cash">Bank / cash</option><option value="fixed">Property & equipment</option><option value="clearing">Clearing (in transit)</option></select></div>}
          </div>
          <div className="flex justify-end gap-2"><button onClick={() => setEdit(null)} className={btnGhost}>Cancel</button><button onClick={save} disabled={busy || !edit.name?.trim() || !edit.code?.trim()} className={btnPrimary}>Save</button></div>
        </div>
      )}

      {TYPES.map(g => {
        const list = books.accounts.filter(a => a.type === g.t && (showInactive || a.active)).sort((a, b) => a.code.localeCompare(b.code));
        if (!list.length) return null;
        return (
          <div key={g.t} className={`${card} p-4`}>
            <p className={heading}>{w(g.pro, g.easy)}</p>
            {list.map(a => (
              <div key={a.id} className={`flex items-center gap-3 py-2 border-b border-white/5 last:border-0 ${a.active ? '' : 'opacity-40'}`}>
                <span className="text-[10px] text-white/30 w-12 tabular-nums">{a.code}</span>
                <span className="flex-1 min-w-0 text-xs text-white/85 truncate">{a.name}</span>
                {a.subtype === 'restricted' && <Pill tone="warn">restricted</Pill>}{a.isSystem && <Pill>automatic</Pill>}{a.functionalClass && <Pill>{a.functionalClass.toLowerCase()}</Pill>}
                <span className="text-xs tabular-nums w-24 text-right text-white/70">{money(natural(a))}</span>
                {canManage && <><button onClick={() => setEdit(a)} className="p-1.5 text-white/40 hover:text-white" aria-label={`Edit ${a.name}`}><Pencil size={12} /></button>
                  {!a.isSystem && <button onClick={() => run(async () => { await saveAccount(org.id, { ...a, active: !a.active }); await reload(); }, a.active ? 'Hidden from pickers (history kept).' : 'Visible again.')} className="text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">{a.active ? 'Hide' : 'Show'}</button>}</>}
              </div>
            ))}
          </div>
        );
      })}
      <p className="text-[10px] text-white/30">"Automatic" accounts receive gifts, fees and payouts for you — rename them if you like, but keep them.</p>
    </div>
  );
};
export default ChartTab;
