// RosterManager — operational roster: Pastoral / Leadership / Staff / Volunteers / Members + Pending approvals.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ChevronUp, ChevronDown, Pencil, Check, X, Loader2, Camera, UserPlus, Star } from 'lucide-react';
import type { Organization, OrgMembership, RosterGroup, UserProfile } from '../../types';
import { ELEVATE_ROLES, canAssignRole, elevateCan, getElevateRole } from '../../services/elevateRoles';
import { assignRole, updateRosterEntry, rosterFor, recomputeOrgRoleIndex } from '../../services/elevateService';
import { fetchOrgMembers, acceptOrgMember, declineOrgMember, addOrgMember, removeOrgMember } from '../../services/organizationService';
import { searchUserProfiles, uploadFile } from '../../services/backendService';

export interface RosterManagerProps {
  org: Organization;
  myMembership: OrgMembership | null;
  onClose?: () => void;
  onChanged?: () => void;
}

type Tab = RosterGroup | 'PENDING';
const TABS: { key: Tab; label: string }[] = [
  { key: 'PASTORAL', label: 'Pastoral' }, { key: 'LEADERSHIP', label: 'Leadership' }, { key: 'STAFF', label: 'Staff' },
  { key: 'VOLUNTEER', label: 'Volunteers' }, { key: 'MEMBER', label: 'Members' }, { key: 'PENDING', label: 'Pending' },
];
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const pill = 'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all';

const RosterManager: React.FC<RosterManagerProps> = ({ org, myMembership, onClose, onChanged }) => {
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [tab, setTab] = useState<Tab>('PASTORAL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ about: string; title: string; photo?: string }>({ about: '', title: '' });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [addRole, setAddRole] = useState('VOLUNTEER');
  const [addMinistry, setAddMinistry] = useState('');

  const canManage = elevateCan(myMembership, org, 'MANAGE_ROSTER') || elevateCan(myMembership, org, 'ASSIGN_ROLES');
  const assignable = useMemo(() => ELEVATE_ROLES.filter(r => canAssignRole(myMembership, org, r.key)), [myMembership, org]);
  const ministries = org.ministries || [];

  const load = useCallback(async () => {
    setLoading(true);
    try { setMembers(await fetchOrgMembers(org.id)); } catch (e: any) { setErr(e?.message || 'Could not load roster.'); }
    setLoading(false);
  }, [org.id]);

  useEffect(() => { load(); }, [load]);
  // Heal the denormalized role index when an authorised viewer opens the roster.
  useEffect(() => { if (canManage) recomputeOrgRoleIndex(org.id); }, [org.id, canManage]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { searchUserProfiles(q.trim()).then(r => setResults((r || []).slice(0, 6))).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!canManage) return <div className="p-6 text-sm text-white/50">You do not have permission to manage the roster.</div>;

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); setErr(null);
    try { await fn(); await load(); onChanged?.(); } catch (e: any) { setErr(e?.message || 'Something went wrong.'); }
    setBusy(null);
  };

  const pending = members.filter(m => m.status === 'PENDING');
  const list = tab === 'PENDING' ? pending : rosterFor(members, tab);

  const changeRole = (m: OrgMembership, roleKey: string, ministryId?: string) => run(m.id, async () => {
    const def = getElevateRole(roleKey);
    await assignRole(org, myMembership, m, roleKey, { ministryId: ministryId || undefined, title: def?.label });
    if (roleKey === 'SENIOR_PASTOR') await updateRosterEntry(m.id, { isSenior: true });
  });

  const move = (m: OrgMembership, dir: -1 | 1) => {
    const i = list.findIndex(x => x.id === m.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map(x => x.id); [ids[i], ids[j]] = [ids[j], ids[i]];
    return run(m.id, async () => { await Promise.all(ids.map((id, idx) => updateRosterEntry(id, { rosterOrder: idx }))); });
  };

  const startEdit = (m: OrgMembership) => { setEditId(m.id); setDraft({ about: m.aboutInOrg || '', title: m.title || '', photo: m.orgPhotoUrl }); };
  const saveEdit = (m: OrgMembership) => run(m.id, async () => {
    await updateRosterEntry(m.id, { aboutInOrg: draft.about, title: draft.title || undefined, orgPhotoUrl: draft.photo });
    setEditId(null);
  });
  const uploadPhoto = async (m: OrgMembership, f?: File | null) => {
    if (!f) return;
    setBusy(m.id);
    try { const url = await uploadFile(`orgs/${org.id}/roster/${m.id}_${Date.now()}.${(f.name.split('.').pop() || 'jpg')}`, f); setDraft(d => ({ ...d, photo: url })); }
    catch (e: any) { setErr(e?.message || 'Upload failed.'); }
    setBusy(null);
  };

  const approve = (m: OrgMembership) => run(m.id, async () => { await acceptOrgMember(m.id); await recomputeOrgRoleIndex(org.id); });
  const decline = (m: OrgMembership) => run(m.id, async () => { await declineOrgMember(m.id); });

  const addPerson = (u: UserProfile) => run('add', async () => {
    const existing = members.find(m => m.userId === u.uid);
    let target = existing;
    if (!target) {
      const created = await addOrgMember(org.id, { userId: u.uid, displayName: u.displayName, photoUrl: u.photoURL, role: 'MEMBER' });
      if (!created) throw new Error('Could not add that person.');
      target = created;
    }
    await assignRole(org, myMembership, target, addRole, { ministryId: addMinistry || undefined, title: getElevateRole(addRole)?.label });
    if (addRole === 'SENIOR_PASTOR') await updateRosterEntry(target.id, { isSenior: true });
    setQ(''); setResults([]);
  });

  const remove = (m: OrgMembership) => {
    if (!window.confirm(`Remove ${m.displayName} from ${org.name}?`)) return;
    run(m.id, async () => { await removeOrgMember(m.id); await recomputeOrgRoleIndex(org.id); });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">Roster</h3>
          <p className="text-xs text-white/40">Pastors, leaders, staff and volunteers. Pastoral, Leadership and Staff show on the public page.</p>
        </div>
        {onClose && <button onClick={onClose} className={`${pill} bg-white/5 border-white/10 text-white/60 hover:bg-white/10`}>Close</button>}
      </div>
      {err && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2">{err}</div>}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(t => {
          const n = t.key === 'PENDING' ? pending.length : rosterFor(members, t.key).length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`${pill} whitespace-nowrap ${tab === t.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
              {t.label} {n > 0 && <span className="opacity-60">{n}</span>}
            </button>
          );
        })}
      </div>

      {tab !== 'PENDING' && assignable.length > 0 && (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><UserPlus size={12} /> Add a person</p>
          <div className="flex gap-2 flex-wrap">
            <select className={field + ' !w-auto flex-1 min-w-[150px]'} value={addRole} onChange={e => setAddRole(e.target.value)}>
              {assignable.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            {ministries.length > 0 && (
              <select className={field + ' !w-auto flex-1 min-w-[150px]'} value={addMinistry} onChange={e => setAddMinistry(e.target.value)}>
                <option value="">Org-wide{addRole === 'DEPARTMENT_HEAD' ? ' (pick a ministry!)' : ''}</option>
                {ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input className={field + ' pl-10'} placeholder="Search Plajah users…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {results.map(u => (
            <button key={u.uid} onClick={() => addPerson(u)} disabled={busy === 'add'} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-white/10">
              <span className="w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0">{u.photoURL && <img src={u.photoURL} alt="" className="w-full h-full object-cover" />}</span>
              <span className="text-sm text-white flex-1">{u.displayName}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-small-orange">{busy === 'add' ? '…' : 'Add'}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? <div className="py-10 grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div>
        : list.length === 0 ? <p className="text-sm text-white/35 py-8 text-center">{tab === 'PENDING' ? 'No pending requests.' : 'No one here yet.'}</p>
        : (
          <div className="space-y-2">
            {list.map((m, idx) => {
              const editing = editId === m.id;
              const def = getElevateRole(m.roleKey);
              const photo = m.orgPhotoUrl || m.photoUrl;
              return (
                <div key={m.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0 grid place-items-center text-sm font-black text-white/50">
                      {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : m.displayName.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">{m.displayName}{m.isSenior && <Star size={12} className="text-amber-300" fill="currentColor" />}</p>
                      <p className="text-[11px] text-white/45 truncate">{m.title || def?.label || 'Member'}</p>
                    </div>
                    {tab === 'PENDING' ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => approve(m)} disabled={busy === m.id} className={`${pill} bg-emerald-500/20 border-emerald-400/30 text-emerald-200 flex items-center gap-1`}><Check size={12} /> Approve</button>
                        <button onClick={() => decline(m)} disabled={busy === m.id} className={`${pill} bg-red-500/10 border-red-400/20 text-red-300 flex items-center gap-1`}><X size={12} /> Decline</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => move(m, -1)} disabled={idx === 0 || !!busy} className="p-1.5 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move up"><ChevronUp size={14} /></button>
                        <button onClick={() => move(m, 1)} disabled={idx === list.length - 1 || !!busy} className="p-1.5 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move down"><ChevronDown size={14} /></button>
                        <button onClick={() => (editing ? setEditId(null) : startEdit(m))} className="p-1.5 text-white/40 hover:text-white" aria-label="Edit"><Pencil size={14} /></button>
                      </div>
                    )}
                    {busy === m.id && <Loader2 size={14} className="animate-spin text-white/40" />}
                  </div>

                  {tab === 'PENDING' && (def || m.title) && <p className="text-[11px] text-white/40 mt-2">Requested role: {m.title || def?.label}</p>}

                  {editing && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-2.5">
                      <div className="flex gap-2 flex-wrap">
                        <select className={field + ' !w-auto flex-1 min-w-[150px]'} value={m.roleKey || ''} onChange={e => e.target.value && changeRole(m, e.target.value)}>
                          <option value="">Role…</option>
                          {assignable.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                        {ministries.length > 0 && assignable.some(r => r.key === 'DEPARTMENT_HEAD') && (
                          <select className={field + ' !w-auto flex-1 min-w-[150px]'} value="" onChange={e => e.target.value && changeRole(m, 'DEPARTMENT_HEAD', e.target.value)}>
                            <option value="">Make Department Head of…</option>
                            {ministries.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        )}
                      </div>
                      <input className={field} placeholder="Title shown on the roster" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                      <textarea rows={4} className={field + ' resize-none'} placeholder={`About ${m.displayName.split(' ')[0]} at ${org.name}…`} value={draft.about} onChange={e => setDraft(d => ({ ...d, about: e.target.value }))} />
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className={`${pill} bg-white/5 border-white/10 text-white/60 cursor-pointer flex items-center gap-1.5 hover:bg-white/10`}>
                          <Camera size={12} /> {draft.photo ? 'Change headshot' : 'Org headshot'}
                          <input type="file" accept="image/*" className="hidden" onChange={e => uploadPhoto(m, e.target.files?.[0])} />
                        </label>
                        {draft.photo && <img src={draft.photo} alt="" className="w-9 h-9 rounded-full object-cover" />}
                        {draft.photo && <button onClick={() => setDraft(d => ({ ...d, photo: undefined }))} className="text-[10px] text-white/40 underline">Remove</button>}
                        {tab === 'PASTORAL' && (
                          <button onClick={() => run(m.id, async () => { await updateRosterEntry(m.id, { isSenior: !m.isSenior }); })}
                            className={`${pill} ${m.isSenior ? 'bg-amber-400/20 border-amber-300/40 text-amber-200' : 'bg-white/5 border-white/10 text-white/50'}`}>
                            {m.isSenior ? 'Senior pastor' : 'Mark as senior'}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2 justify-between">
                        <button onClick={() => remove(m)} className="text-[10px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-400">Remove from org</button>
                        <button onClick={() => saveEdit(m)} className={`${pill} bg-white text-black border-white`}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

export default RosterManager;
