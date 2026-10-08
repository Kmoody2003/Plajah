// Groups / ministries: ChmsPerson.ministryIds ↔ org.ministries. Leaders only see/edit their own ministries.
import React, { useMemo, useState } from 'react';
import { Plus, X, Mail } from 'lucide-react';
import { bulkEditPeople, fullName, weeksSince, lastAttendanceByPerson } from '../../../services/chmsPeople';
import { usePeople, card, fieldSm, btn, Empty, h2, StatusPill } from './PeopleUI';

const PeopleGroups: React.FC = () => {
  const { org, people, attendance, access, reload, openPerson } = usePeople();
  const all = (org.ministries || []).filter(m => !access.ministryScope || access.ministryScope.includes(m.id));
  const [sel, setSel] = useState(all[0]?.id || '');
  const [addId, setAddId] = useState('');
  const m = all.find(x => x.id === sel);
  const roster = useMemo(() => people.filter(p => p.ministryIds?.includes(sel)), [people, sel]);
  const last = useMemo(() => lastAttendanceByPerson(attendance), [attendance]);
  const canEdit = access.staff || (!!access.ministryScope && access.ministryScope.includes(sel));
  const candidates = people.filter(p => !p.ministryIds?.includes(sel) && p.status !== 'DECEASED' && p.status !== 'TRANSFERRED').slice(0, 500);

  if (!all.length) return <Empty>No ministries yet — create them under Ministries in Operations, then assign people here.</Empty>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {all.map(x => <button key={x.id} onClick={() => setSel(x.id)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${sel === x.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{x.iconEmoji} {x.name} <span className="opacity-50">{people.filter(p => p.ministryIds?.includes(x.id)).length}</span></button>)}
      </div>
      {m && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className={h2}>{m.name}</h3><p className="text-[10px] text-white/40 mt-0.5">{m.meetingTime || 'No meeting time set'}{m.leaderName ? ` · led by ${m.leaderName}` : ''}</p></div>
            <a className={btn} href={`mailto:?bcc=${encodeURIComponent(roster.map(p => p.email).filter(Boolean).join(','))}&subject=${encodeURIComponent(m.name)}`}><Mail size={12} /> Email group</a>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <select value={addId} onChange={e => setAddId(e.target.value)} className={`${fieldSm} flex-1`}><option value="">Add a person to {m.name}…</option>{candidates.map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select>
              <button className={btn} disabled={!addId} onClick={async () => { const p = people.find(x => x.id === addId); if (p) { await bulkEditPeople([p], { addMinistry: sel }); setAddId(''); await reload(); } }}><Plus size={13} /> Add</button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-1.5">
            {roster.map(p => {
              const w = weeksSince(last.get(p.id));
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
                  <button className="font-bold text-white flex-1 text-left truncate hover:text-small-orange" onClick={() => openPerson(p.id)}>{fullName(p)}</button>
                  <StatusPill s={p.status} /><span className="text-white/30 w-14 text-right">{w === null ? '—' : `${w}w`}</span>
                  {canEdit && <button title="Remove from group" className="text-white/30 hover:text-red-400" onClick={async () => { await bulkEditPeople([p], { removeMinistry: sel }); await reload(); }}><X size={13} /></button>}
                </div>
              );
            })}
            {!roster.length && <p className="text-[11px] text-white/30">No one assigned yet.</p>}
          </div>
          <p className="text-[9px] text-white/30">This list is the congregation directory roster for the ministry. Platform role holders (leaders, volunteers with Plajah accounts) are managed under People &amp; Roster.</p>
        </div>
      )}
    </div>
  );
};

export default PeopleGroups;
