// Households: create/edit, move members, shared address (propagates), household giving flag (yes/no only).
import React, { useMemo, useState } from 'react';
import { Plus, Home, UserPlus, X } from 'lucide-react';
import type { ChmsHousehold, ChmsPerson } from '../../../types';
import { saveHousehold, moveToHousehold, setHouseholdAddress, getGivingFlags, fullName, ageOf } from '../../../services/chmsPeople';
import { usePeople, card, field, fieldSm, btn, btnPrimary, Empty, h2 } from './PeopleUI';

const PeopleHouseholds: React.FC = () => {
  const { org, people, households, access, reload } = usePeople();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [addr, setAddr] = useState<NonNullable<ChmsHousehold['address']>>({});
  const [hhGave, setHhGave] = useState<Set<string> | null | undefined>(undefined);
  const [addId, setAddId] = useState('');
  const canEdit = access.staff;

  const visible = useMemo(() => households.filter(h => !q.trim() || h.name.toLowerCase().includes(q.toLowerCase()) || people.some(p => p.householdId === h.id && fullName(p).toLowerCase().includes(q.toLowerCase()))), [households, people, q]);
  const h = households.find(x => x.id === sel) || null;
  const members = h ? people.filter(p => p.householdId === h.id) : [];
  const unassigned = people.filter(p => !p.householdId).slice(0, 400);

  const pick = (x: ChmsHousehold | null) => { setSel(x?.id || null); setAddr(x?.address || {}); setName(x?.name || ''); if (x && hhGave === undefined) getGivingFlags(org.id).then(g => setHhGave(g ? g.households : null)); };
  const create = async () => {
    const n = name.trim(); if (!n) return;
    const nh = await saveHousehold(org.id, { name: n }); await reload(); pick(nh);
  };
  const saveInfo = async () => { if (!h) return; await saveHousehold(org.id, { ...h, name: name.trim() || h.name }); await setHouseholdAddress(h, members, addr); await reload(); };
  const setHead = async (p: ChmsPerson) => { if (!h) return; await saveHousehold(org.id, { ...h, headPersonId: p.id }); await moveToHousehold(p, h.id, 'HEAD'); await reload(); };
  const move = async (p: ChmsPerson, role: ChmsPerson['householdRole'], hid: string | null) => { await moveToHousehold(p, hid, role, hid && h?.address ? h.address : undefined); await reload(); };

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-5">
      <div className="space-y-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search households…" className={field} />
        {canEdit && (
          <div className="flex gap-2"><input value={sel ? '' : name} onChange={e => { setSel(null); setName(e.target.value); }} placeholder="New household name" className={fieldSm + ' flex-1'} />
            <button className={btnPrimary} onClick={create} disabled={!!sel || !name.trim()}><Plus size={13} /></button></div>
        )}
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {visible.map(x => (
            <button key={x.id} onClick={() => pick(x)} className={`w-full text-left px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${sel === x.id ? 'bg-white text-black' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
              <Home size={13} /> <span className="truncate">{x.name}</span><span className="ml-auto opacity-50">{people.filter(p => p.householdId === x.id).length}</span>
            </button>
          ))}
          {!visible.length && <Empty>No households yet.</Empty>}
        </div>
      </div>

      {h ? (
        <div className={`${card} p-5 space-y-4`}>
          <h3 className={h2}>{h.name} {hhGave && hhGave.has(h.id) && <span title="Household gave in the last 12 months" className="ml-2 text-amber-300">$ giving household</span>}</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            <input disabled={!canEdit} value={name} onChange={e => setName(e.target.value)} className={field} placeholder="Household name" />
            <input disabled={!canEdit} value={addr.line1 || ''} onChange={e => setAddr(a => ({ ...a, line1: e.target.value }))} className={field} placeholder="Street" />
            <input disabled={!canEdit} value={addr.city || ''} onChange={e => setAddr(a => ({ ...a, city: e.target.value }))} className={field} placeholder="City" />
            <div className="flex gap-2"><input disabled={!canEdit} value={addr.region || ''} onChange={e => setAddr(a => ({ ...a, region: e.target.value }))} className={field} placeholder="State" />
              <input disabled={!canEdit} value={addr.postal || ''} onChange={e => setAddr(a => ({ ...a, postal: e.target.value }))} className={field} placeholder="Zip" /></div>
          </div>
          {canEdit && <button className={btn} onClick={saveInfo}>Save &amp; apply address to all members</button>}

          <div className="space-y-1.5">
            {members.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
                <span className="font-bold text-white flex-1 truncate">{fullName(p)}{h.headPersonId === p.id && <span className="ml-2 text-[9px] text-small-orange font-black">HEAD</span>}</span>
                <span className="text-white/30">{ageOf(p) ?? ''}</span>
                {canEdit && <>
                  <select value={p.householdRole || ''} onChange={e => move(p, (e.target.value || undefined) as any, h.id)} className={fieldSm}><option value="">role</option><option>HEAD</option><option>SPOUSE</option><option>CHILD</option><option>OTHER</option></select>
                  {h.headPersonId !== p.id && <button className="text-[9px] font-black uppercase text-white/40 hover:text-white" onClick={() => setHead(p)}>Make head</button>}
                  <button title="Remove from household" className="text-white/30 hover:text-red-400" onClick={() => move(p, undefined, null)}><X size={13} /></button>
                </>}
              </div>
            ))}
            {!members.length && <p className="text-[11px] text-white/30">No members yet.</p>}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <select value={addId} onChange={e => setAddId(e.target.value)} className={`${fieldSm} flex-1`}><option value="">Add a person…</option>
                {unassigned.map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select>
              <button className={btn} disabled={!addId} onClick={async () => { const p = people.find(x => x.id === addId); if (p) { await move(p, 'OTHER', h.id); setAddId(''); } }}><UserPlus size={13} /> Add</button>
            </div>
          )}
        </div>
      ) : <Empty>Select or create a household.</Empty>}
    </div>
  );
};

export default PeopleHouseholds;
