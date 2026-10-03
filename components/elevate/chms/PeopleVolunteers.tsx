// Volunteers: skills finder + service/event scheduling (positions, matching, availability, confirm/decline/swap, reminders).
import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Bell, Sparkles } from 'lucide-react';
import type { ChmsShift, ShiftPosition } from '../../../services/chmsPeople';
import { saveShift, deleteShift, assignVolunteer, respondToShift, sendShiftReminders, matchVolunteers, fullName, todayISO, newId } from '../../../services/chmsPeople';
import { usePeople, card, field, fieldSm, btn, btnPrimary, h2, label, Empty, Modal } from './PeopleUI';

const PeopleVolunteers: React.FC = () => {
  const { org, people, shifts, access, reload } = usePeople();
  const [skillQ, setSkillQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: 'Sunday Service', date: todayISO(), time: '9:00 AM', ministryId: '', positions: [{ id: newId('pos'), name: 'Greeter', needed: 2, skill: '' }] as ShiftPosition[] });
  const [assignFor, setAssignFor] = useState<{ shift: ChmsShift; pos: ShiftPosition } | null>(null);
  const [msg, setMsg] = useState('');
  const canEdit = access.staff;
  const upcoming = shifts.filter(s => s.date >= todayISO());
  const past = shifts.filter(s => s.date < todayISO()).slice(-5).reverse();

  const skillHits = useMemo(() => skillQ.trim().length < 2 ? [] : people.filter(p => (p.skills || []).some(s => s.toLowerCase().includes(skillQ.toLowerCase()))).slice(0, 30), [people, skillQ]);
  const swaps = upcoming.flatMap(s => s.assignments.filter(a => a.swapRequested).map(a => ({ s, a })));

  const create = async () => {
    if (!draft.title.trim() || !draft.positions.length) return;
    await saveShift(org.id, { title: draft.title.trim(), date: draft.date, time: draft.time || undefined, ministryId: draft.ministryId || undefined, positions: draft.positions.filter(p => p.name.trim()) });
    setCreating(false); await reload();
  };
  const remind = async () => { const n = await sendShiftReminders(upcoming, 3); setMsg(`${n} reminder notification(s) sent (to volunteers with linked Plajah accounts).`); await reload(); };
  const unlink = (s: ChmsShift, pid: string) => saveShift(org.id, { ...s, assignments: s.assignments.filter(a => a.personId !== pid) }).then(reload);

  return (
    <div className="space-y-6">
      {msg && <p className="text-[11px] font-bold text-emerald-300">{msg}</p>}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <input value={skillQ} onChange={e => setSkillQ(e.target.value)} placeholder="Find volunteers by skill (audio, nursery, teaching…)" className={`${field} max-w-md`} />
        {canEdit && <div className="flex gap-2"><button className={btn} onClick={remind}><Bell size={13} /> Send reminders</button><button className={btnPrimary} onClick={() => setCreating(true)}><Plus size={13} /> New schedule</button></div>}
      </div>
      {skillHits.length > 0 && (
        <div className={`${card} p-4 flex flex-wrap gap-2`}>{skillHits.map(p => <span key={p.id} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">{fullName(p)} <span className="text-white/30">{(p.skills || []).join(', ')}</span></span>)}</div>
      )}

      {swaps.length > 0 && (
        <div className={`${card} p-4 border-amber-500/30`}>
          <h3 className={`${h2} mb-2`}>Swap requests</h3>
          {swaps.map(({ s, a }) => <p key={s.id + a.personId} className="text-xs text-white/70">{a.personName} asked to swap out of {s.title} ({s.date}){a.swapNote ? ` — "${a.swapNote}"` : ''}
            {canEdit && <button className="ml-2 text-[9px] font-black uppercase text-small-orange" onClick={async () => { await saveShift(org.id, { ...s, assignments: s.assignments.filter(x => x.personId !== a.personId) }); await reload(); }}>Release spot</button>}</p>)}
        </div>
      )}

      {upcoming.length === 0 ? <Empty>No upcoming volunteer schedules.{canEdit ? ' Create one to start filling positions.' : ''}</Empty> : upcoming.map(s => (
        <div key={s.id} className={`${card} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-black text-white">{s.title}</h3><p className="text-[10px] text-white/40">{s.date}{s.time ? ` · ${s.time}` : ''}{s.ministryId ? ` · ${org.ministries?.find(m => m.id === s.ministryId)?.name || ''}` : ''}</p></div>
            {canEdit && <button className="text-white/30 hover:text-red-400" onClick={async () => { if (confirm('Delete this schedule?')) { await deleteShift(s.id); await reload(); } }}><Trash2 size={14} /></button>}
          </div>
          {s.positions.map(pos => {
            const as = s.assignments.filter(a => a.positionId === pos.id);
            const open = pos.needed - as.filter(a => a.status !== 'DECLINED').length;
            return (
              <div key={pos.id} className="border-t border-white/5 pt-3">
                <div className="flex items-center gap-2 mb-1.5"><p className={label}>{pos.name}{pos.skill ? ` · needs ${pos.skill}` : ''}</p>
                  <span className={`text-[9px] font-black ${open > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{open > 0 ? `${open} open` : 'filled'}</span>
                  {canEdit && open > 0 && <button className="ml-auto text-[9px] font-black uppercase tracking-widest text-small-orange flex items-center gap-1" onClick={() => setAssignFor({ shift: s, pos })}><Sparkles size={11} /> Suggest</button>}</div>
                <div className="flex flex-wrap gap-1.5">
                  {as.map(a => (
                    <span key={a.personId} className={`px-3 py-1.5 rounded-full text-xs border ${a.status === 'CONFIRMED' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : a.status === 'DECLINED' ? 'bg-red-500/10 border-red-500/30 text-red-300 line-through' : 'bg-white/5 border-white/10 text-white/70'}`}>
                      {a.personName}{a.swapRequested ? ' ↔' : ''}
                      {canEdit && <>
                        <button className="ml-2 text-[9px] font-black text-white/40 hover:text-white" onClick={async () => { await respondToShift(s, a.personId, { status: 'CONFIRMED', swapRequested: false }); await reload(); }}>✓</button>
                        <button className="ml-1 text-[9px] font-black text-white/40 hover:text-red-400" onClick={() => unlink(s, a.personId)}>✕</button></>}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {past.length > 0 && <p className="text-[10px] text-white/30">Recent past: {past.map(s => `${s.title} (${s.date})`).join(' · ')}</p>}

      {assignFor && (
        <Modal title={`Fill ${assignFor.pos.name} — ${assignFor.shift.date}`} onClose={() => setAssignFor(null)}>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {matchVolunteers(people, assignFor.shift, assignFor.pos, shifts).slice(0, 25).map(({ person, why }) => (
              <div key={person.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
                <span className="font-bold text-white flex-1">{fullName(person)}</span><span className="text-white/40 text-[10px]">{why.join(' · ')}</span>
                <button className={btn} onClick={async () => { await assignVolunteer(assignFor.shift, assignFor.pos.id, person); await reload(); setAssignFor(null); }}>Assign</button>
              </div>
            ))}
            <p className="text-[10px] text-white/30 pt-2">Ranked by skill, ministry, availability (set per person: "Sun, Wed") and no double-booking. Volunteers with a linked Plajah account get a notification to confirm or request a swap.</p>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal title="New volunteer schedule" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} className={field} placeholder="Service / event" />
            <div className="grid grid-cols-3 gap-2"><input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} className={field} />
              <input value={draft.time} onChange={e => setDraft(d => ({ ...d, time: e.target.value }))} className={field} placeholder="Time" />
              <select value={draft.ministryId} onChange={e => setDraft(d => ({ ...d, ministryId: e.target.value }))} className={field}><option value="">Any ministry</option>{(org.ministries || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            {draft.positions.map((p, i) => (
              <div key={p.id} className="flex gap-2"><input value={p.name} onChange={e => setDraft(d => ({ ...d, positions: d.positions.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} className={`${fieldSm} flex-1`} placeholder="Position" />
                <input type="number" min={1} value={p.needed} onChange={e => setDraft(d => ({ ...d, positions: d.positions.map((x, j) => j === i ? { ...x, needed: Number(e.target.value) || 1 } : x) }))} className={`${fieldSm} w-16`} />
                <input value={p.skill || ''} onChange={e => setDraft(d => ({ ...d, positions: d.positions.map((x, j) => j === i ? { ...x, skill: e.target.value } : x) }))} className={`${fieldSm} w-28`} placeholder="skill" /></div>
            ))}
            <button className={btn} onClick={() => setDraft(d => ({ ...d, positions: [...d.positions, { id: newId('pos'), name: '', needed: 1 }] }))}><Plus size={12} /> Position</button>
            <button className={`${btnPrimary} w-full`} onClick={create}>Create schedule</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PeopleVolunteers;
