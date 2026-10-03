// Directory — fast search/filter, sortable table, bulk edit, add person, duplicate merge entry point.
import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Search, Plus, Download, GitMerge, Tag, Archive, X } from 'lucide-react';
import type { ChmsPerson, ChmsMemberStatus } from '../../../types';
import {
  ageBand, ageOf, AGE_BANDS, bulkEditPeople, fullName, lastAttendanceByPerson, weeksSince, toCSV, downloadText, newId,
} from '../../../services/chmsPeople';
import { logOrgAction } from '../../../services/orgAudit';
import { usePeople, card, fieldSm, btn, btnPrimary, StatusPill, STATUSES, Empty, label } from './PeopleUI';

const PeopleProfile = lazy(() => import('./PeopleProfile'));
const PeopleMerge = lazy(() => import('./PeopleMerge'));

type SortKey = 'name' | 'status' | 'age' | 'since' | 'last';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PeopleDirectory: React.FC<{ initialPersonId?: string | null }> = ({ initialPersonId }) => {
  const { org, people, attendance, access, reload, gaveFlags } = usePeople();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | ChmsMemberStatus>('');
  const [tag, setTag] = useState('');
  const [band, setBand] = useState('');
  const [ministry, setMinistry] = useState('');
  const [bmonth, setBmonth] = useState('');
  const [skill, setSkill] = useState('');
  const [att, setAtt] = useState('');   // '' | never | 4 | 8 | lapsed4
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(initialPersonId || null);
  const [showMerge, setShowMerge] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [busy, setBusy] = useState(false);

  const last = useMemo(() => lastAttendanceByPerson(attendance), [attendance]);
  const allTags = useMemo(() => Array.from(new Set(people.flatMap(p => p.tags || []))).sort(), [people]);
  const ministries = org.ministries || [];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = people.filter(p => {
      if (needle && !`${fullName(p)} ${p.firstName} ${p.email || ''} ${p.phone || ''} ${(p.tags || []).join(' ')} ${p.address?.city || ''}`.toLowerCase().includes(needle)) return false;
      if (status && p.status !== status) return false;
      if (tag && !(p.tags || []).includes(tag)) return false;
      if (band && ageBand(p) !== band) return false;
      if (ministry && !(p.ministryIds || []).includes(ministry)) return false;
      if (bmonth && !(p.birthDate && Number(p.birthDate.slice(5, 7)) === Number(bmonth))) return false;
      if (skill && !(p.skills || []).some(s => s.toLowerCase().includes(skill.toLowerCase()))) return false;
      if (att) {
        const w = weeksSince(last.get(p.id));
        if (att === 'never' && w !== null) return false;
        if (att === '4' && (w === null || w >= 4)) return false;
        if (att === '8' && (w === null || w >= 8)) return false;
        if (att === 'lapsed4' && (w === null || w < 4)) return false;
      }
      return true;
    });
    const v = (p: ChmsPerson): string | number => sort.key === 'name' ? `${p.lastName} ${p.firstName}`.toLowerCase() : sort.key === 'status' ? p.status : sort.key === 'age' ? (ageOf(p) ?? -1) : sort.key === 'since' ? (p.memberSince || '') : (last.get(p.id) || '');
    return [...f].sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * sort.dir);
  }, [people, q, status, tag, band, ministry, bmonth, skill, att, sort, last]);

  const toggleSort = (key: SortKey) => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const th = (key: SortKey, text: string, cls = '') => (
    <th className={`px-3 py-2 text-left cursor-pointer select-none ${cls}`} onClick={() => toggleSort(key)}>
      <span className={label}>{text}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
    </th>
  );
  const selected = rows.filter(p => sel.has(p.id));

  const bulk = async (patch: Parameters<typeof bulkEditPeople>[1], confirmMsg?: string) => {
    if (!selected.length || (confirmMsg && !confirm(confirmMsg))) return;
    setBusy(true);
    try { await bulkEditPeople(selected, patch); setSel(new Set()); await reload(); } catch (e: any) { alert(e?.message || 'Bulk edit failed.'); }
    setBusy(false);
  };
  const exportCsv = () => {
    logOrgAction(org.id, 'CHMS_EXPORT', { meta: { what: 'directory', rows: rows.length } });
    downloadText('directory.csv', toCSV([['Last', 'First', 'Status', 'Email', 'Phone', 'City', 'Birth date', 'Member since', 'Tags', 'Ministries'],
      ...rows.map(p => [p.lastName, p.firstName, p.status, p.email || '', p.phone || '', p.address?.city || '', p.birthDate || '', p.memberSince || '', (p.tags || []).join(';'), (p.ministryIds || []).map(id => ministries.find(m => m.id === id)?.name || id).join(';')])]));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, phone, tag, city…" className={`${fieldSm} w-full pl-8 py-2.5`} />
        </div>
        {access.staff && <button className={btnPrimary} onClick={() => setOpen('new')}><Plus size={13} /> Add person</button>}
        {access.staff && <button className={btn} onClick={() => setShowMerge(true)}><GitMerge size={13} /> Duplicates</button>}
        <button className={btn} onClick={exportCsv}><Download size={13} /> CSV</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={status} onChange={e => setStatus(e.target.value as any)} className={fieldSm}><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={band} onChange={e => setBand(e.target.value)} className={fieldSm}><option value="">Any age</option>{AGE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}</select>
        <select value={ministry} onChange={e => setMinistry(e.target.value)} className={fieldSm}><option value="">Any ministry</option>{ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select value={tag} onChange={e => setTag(e.target.value)} className={fieldSm}><option value="">Any tag</option>{allTags.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select value={bmonth} onChange={e => setBmonth(e.target.value)} className={fieldSm}><option value="">Birthday month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select value={att} onChange={e => setAtt(e.target.value)} className={fieldSm}>
          <option value="">Any attendance</option><option value="4">Attended last 4 wks</option><option value="8">Attended last 8 wks</option>
          <option value="lapsed4">Away 4+ weeks</option><option value="never">Never attended</option>
        </select>
        <input value={skill} onChange={e => setSkill(e.target.value)} placeholder="Skill / gift" className={`${fieldSm} w-32`} />
        {(status || band || ministry || tag || bmonth || att || skill || q) && (
          <button className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white flex items-center gap-1" onClick={() => { setStatus(''); setBand(''); setMinistry(''); setTag(''); setBmonth(''); setAtt(''); setSkill(''); setQ(''); }}><X size={11} /> Clear</button>
        )}
      </div>

      {selected.length > 0 && access.staff && (
        <div className={`${card} p-3 flex flex-wrap items-center gap-2`}>
          <span className="text-[10px] font-black text-small-orange uppercase tracking-widest">{selected.length} selected</span>
          <select disabled={busy} onChange={e => { if (e.target.value) bulk({ status: e.target.value as ChmsMemberStatus }, `Set ${selected.length} people to ${e.target.value}?`); e.target.value = ''; }} className={fieldSm} defaultValue="">
            <option value="">Set status…</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select disabled={busy} onChange={e => { if (e.target.value) bulk({ addMinistry: e.target.value }); e.target.value = ''; }} className={fieldSm} defaultValue="">
            <option value="">Add to ministry…</option>{ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder="tag" className={`${fieldSm} w-24`} />
          <button className={btn} disabled={!bulkTag.trim() || busy} onClick={() => { bulk({ addTags: [bulkTag.trim()] }); setBulkTag(''); }}><Tag size={12} /> Add</button>
          <button className={btn} disabled={!bulkTag.trim() || busy} onClick={() => { bulk({ removeTags: [bulkTag.trim()] }); setBulkTag(''); }}>Remove</button>
          <button className={btn} disabled={busy} onClick={() => bulk({ archive: true }, `Archive ${selected.length} people? They can be restored later.`)}><Archive size={12} /> Archive</button>
        </div>
      )}

      <p className="text-[10px] text-white/40 font-bold">{rows.length} of {people.length} people{access.ministryScope ? ' · limited to ministries you lead' : ''}{access.financeOnly ? ' · directory view (no notes)' : ''}</p>

      {rows.length === 0 ? <Empty>No people match. {access.staff ? 'Add someone or import your Servant Keeper data from the Import tab.' : ''}</Empty> : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-xs">
            <thead className="border-b border-white/10"><tr>
              <th className="px-3 py-2 w-8"><input type="checkbox" checked={selected.length === rows.length && rows.length > 0} onChange={e => setSel(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} /></th>
              {th('name', 'Name')}{th('status', 'Status')}{th('age', 'Age', 'hidden sm:table-cell')}
              <th className="px-3 py-2 text-left hidden md:table-cell"><span className={label}>Contact</span></th>
              {th('since', 'Member since', 'hidden lg:table-cell')}{th('last', 'Last seen', 'hidden sm:table-cell')}
            </tr></thead>
            <tbody>
              {rows.slice(0, 500).map(p => {
                const w = weeksSince(last.get(p.id));
                return (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.04] cursor-pointer" onClick={() => setOpen(p.id)}>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(p.id)} onChange={e => setSel(s => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} /></td>
                    <td className="px-3 py-2 font-bold text-white">{fullName(p)}{p.linkedUid && <span title="Linked Plajah account" className="ml-1.5 text-[8px] text-emerald-400">●</span>}{gaveFlags?.has(p.id) && <span title="Gave in last 12 months" className="ml-1 text-[8px] text-amber-300">$</span>}</td>
                    <td className="px-3 py-2"><StatusPill s={p.status} /></td>
                    <td className="px-3 py-2 text-white/50 hidden sm:table-cell">{ageOf(p) ?? ''}</td>
                    <td className="px-3 py-2 text-white/50 hidden md:table-cell truncate max-w-[220px]">{p.email || p.phone || ''}</td>
                    <td className="px-3 py-2 text-white/50 hidden lg:table-cell">{p.memberSince || ''}</td>
                    <td className={`px-3 py-2 hidden sm:table-cell ${w !== null && w >= 4 ? 'text-amber-300' : 'text-white/50'}`}>{w === null ? '—' : w === 0 ? 'This week' : `${w} wk ago`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 500 && <p className="p-3 text-[10px] text-white/40">Showing first 500 — refine the filters.</p>}
        </div>
      )}

      <Suspense fallback={null}>
        {open && <PeopleProfile personId={open === 'new' ? null : open} onClose={() => setOpen(null)} onSaved={reload} draftKey={open === 'new' ? newId('draft') : undefined} />}
        {showMerge && <PeopleMerge onClose={() => setShowMerge(false)} />}
      </Suspense>
    </div>
  );
};

export default PeopleDirectory;
