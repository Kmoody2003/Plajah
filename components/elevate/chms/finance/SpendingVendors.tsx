// SpendingVendors — vendor list with W-9 upload, 1099 flag, saved defaults (category/fund) and 1099-NEC tracking/export.
import React, { useMemo, useRef, useState } from 'react';
import { Download, FileCheck2, Plus, Search, Upload } from 'lucide-react';
import type { Organization, OrgMembership, AcctVendor } from '../../../../types';
import { EXPENSE_CATEGORIES, categoryId, categoryName, nec1099Csv, saveVendor, threshold1099, todayISO, uploadFinanceFile, usd, vendor1099 } from '../../../../services/acctSpending';
import { downloadText } from '../../../../services/chmsFinanceReports';
import { card, field, fieldSm, label, heading, btnPrimary, btnGhost, Empty, Pill } from './shared';
import { SkeletonRows, useDo, useHotkeys, useSpendingBundle } from './SpendingUi';

const SpendingVendors: React.FC<{ org: Organization; member: OrgMembership | null }> = ({ org, member }) => {
  const { bundle, perms, loading } = useSpendingBundle(org, member);
  const act = useDo(); const year = new Date().getFullYear();
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<Partial<AcctVendor> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useHotkeys({ '/': () => searchRef.current?.focus(), n: () => perms.canManage && setEdit({ name: '', active: true }) });
  const w9Ref = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => vendor1099(bundle?.vendors || [], bundle?.expenses || [], year), [bundle, year]);
  const ytdOf = (id: string) => rows.find(r => r.vendorId === id);
  if (loading && !bundle) return <SkeletonRows rows={3} />;
  if (!perms.canViewBooks) return <Empty>Vendors are visible to finance roles.</Empty>;
  const vendors = (bundle?.vendors || []).filter(v => !q.trim() || v.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const cats = (bundle?.accounts.filter(a => a.type === 'EXPENSE' && a.active && !a.systemKey).map(a => ({ id: a.id, name: a.name })) || []);
  const catList = cats.length ? cats : EXPENSE_CATEGORIES.map(c => ({ id: categoryId(org.id, c.code), name: c.name }));
  const need = rows.filter(r => r.needsW9).length;
  const necRows = rows.filter(r => r.flagged && r.over);

  const save = () => act.run(async () => {
    if (!edit?.name?.trim()) throw new Error('Give the vendor a name.');
    await saveVendor(org, edit as any); setEdit(null);
  }, 'Vendor saved');
  const uploadW9 = async (f?: File | null) => { if (!f) return; await act.run(async () => { const url = await uploadFinanceFile(org, f, 'w9'); setEdit(v => ({ ...(v || {}), w9Url: url })); }, 'W-9 attached — remember to save'); };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[10rem]"><Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" /><input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search vendors  ( / )" className={`${fieldSm} pl-8 w-full`} /></div>
        {perms.canManage && <button onClick={() => setEdit({ name: '', active: true })} className={btnPrimary}><Plus size={12} /> New vendor</button>}
      </div>

      {need > 0 && <div className="px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">{need} vendor{need === 1 ? '' : 's'} flagged for 1099 (or over {usd(threshold1099(year))}) without a W-9 or tax ID on file. Collect them before January.</div>}

      {edit && perms.canManage && (
        <div className={`${card} p-5 space-y-3`}>
          <h3 className={heading}>{edit.id ? 'Edit vendor' : 'New vendor'}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><p className={`${label} mb-1`}>Name</p><input value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} className={field} /></div>
            <div><p className={`${label} mb-1`}>Email</p><input value={edit.email || ''} onChange={e => setEdit({ ...edit, email: e.target.value })} className={field} /></div>
            <div><p className={`${label} mb-1`}>Default category</p><select value={edit.defaultAccountId || ''} onChange={e => setEdit({ ...edit, defaultAccountId: e.target.value || undefined })} className={field}><option value="">None</option>{catList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><p className={`${label} mb-1`}>Default fund</p><select value={edit.defaultFundId || ''} onChange={e => setEdit({ ...edit, defaultFundId: e.target.value || undefined })} className={field}><option value="">General</option>{(org.givingFunds || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div><p className={`${label} mb-1`}>Tax ID (EIN / SSN) — for 1099s</p><input value={edit.taxId || ''} onChange={e => setEdit({ ...edit, taxId: e.target.value })} className={field} /></div>
            <div><p className={`${label} mb-1`}>Mailing address</p><input value={edit.address?.line1 || ''} onChange={e => setEdit({ ...edit, address: { ...(edit.address || {}), line1: e.target.value } })} placeholder="Street, city, state ZIP" className={field} /></div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={!!edit.is1099} onChange={e => setEdit({ ...edit, is1099: e.target.checked })} /> Needs a 1099 (contractor / non-corporate)</label>
            <input ref={w9Ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { uploadW9(e.target.files?.[0]); e.target.value = ''; }} />
            <button onClick={() => w9Ref.current?.click()} className={btnGhost}><Upload size={12} /> {edit.w9Url ? 'Replace W-9' : 'Upload W-9'}</button>
            {edit.w9Url && <a href={edit.w9Url} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase tracking-widest text-emerald-300 inline-flex items-center gap-1"><FileCheck2 size={11} /> On file</a>}
          </div>
          <div className="flex gap-2"><button onClick={save} disabled={act.busy} className={btnPrimary}>Save vendor</button><button onClick={() => setEdit(null)} className={btnGhost}>Cancel</button></div>
        </div>
      )}

      {!vendors.length ? <div className={`${card} p-8 text-center`}><p className="text-sm font-black text-white">{q ? 'No vendors match' : 'No vendors yet'}</p><p className="text-[11px] text-white/50 mt-1">{q ? 'Try a different search.' : 'They’re added automatically the first time you pay a bill — or add one now to save its defaults and W-9.'}</p></div> : (
        <div className="space-y-2">{vendors.map(v => { const r = ytdOf(v.id); return (
          <button key={v.id} disabled={!perms.canManage} onClick={() => setEdit(v)} className={`${card} p-4 w-full text-left flex items-center gap-3 hover:bg-white/[0.06] transition-all`}>
            <div className="min-w-0 flex-1"><p className="text-xs font-black text-white truncate">{v.name}</p><p className="text-[10px] text-white/40 truncate">{v.defaultAccountId ? categoryName(org.id, v.defaultAccountId, bundle?.accounts) : 'No default category'}{v.email ? ` · ${v.email}` : ''}</p></div>
            {v.is1099 && <Pill tone={r?.needsW9 ? 'warn' : 'info'}>1099</Pill>}
            {v.w9Url && <Pill tone="ok">W-9</Pill>}
            <div className="text-right"><p className="text-xs font-black text-white tabular-nums">{usd(r?.ytd || 0)}</p><p className="text-[9px] text-white/30 uppercase tracking-widest">{year} paid</p></div>
          </button>); })}</div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-3 mb-2"><div><h3 className={heading}>1099-NEC {year}</h3><p className="text-[10px] text-white/40 -mt-2">Threshold {usd(threshold1099(year))}. Card and online payments are excluded (the processor reports those on a 1099-K).</p></div>
          <button disabled={!necRows.length} onClick={() => downloadText(`1099-nec-${year}-${todayISO()}.csv`, nec1099Csv(rows, year))} className={btnGhost}><Download size={12} /> Export CSV</button></div>
        {!necRows.length ? <Empty>No 1099-flagged vendor is over the threshold yet.</Empty> : <table className="w-full text-xs"><thead><tr>{['Recipient', 'TIN', 'Paid', 'W-9'].map(h => <th key={h} className={`${label} text-left py-2 px-2`}>{h}</th>)}</tr></thead><tbody>{necRows.map(r => <tr key={r.vendorId} className="border-t border-white/5"><td className="py-2 px-2 text-white/80">{r.name}</td><td className="py-2 px-2 text-white/50">{r.taxId ? '••••' + r.taxId.slice(-4) : '—'}</td><td className="py-2 px-2 tabular-nums text-white">{usd(r.ytd)}</td><td className="py-2 px-2">{r.needsW9 ? <Pill tone="warn">Missing</Pill> : <Pill tone="ok">On file</Pill>}</td></tr>)}</tbody></table>}
      </div>
    </div>
  );
};

export default SpendingVendors;
