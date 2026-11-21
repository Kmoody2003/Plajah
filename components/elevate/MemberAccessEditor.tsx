// MemberAccessEditor — the ONE editor for a person's place in an org: primary role, extra roles,
// department roles, roster title / bio / org headshot, senior flag, and remove-from-org.
// Used by the People → Roles & Access list (RosterManager) and by a person's profile
// (PersonAccountCard, once they've claimed their account), so both places edit the same thing the same way.
import React, { useState } from 'react';
import { Camera, Check, Layers, Loader2, Plus, X } from 'lucide-react';
import type { Organization, OrgMembership } from '../../types';
import {
  DEPARTMENT_SCOPED_ROLE_KEYS,
  ELEVATE_ROLES,
  canAssignRole,
  elevateCan,
  getElevateRole,
  memberRoleKeys,
} from '../../services/elevateRoles';
import {
  addDepartmentRole,
  assignRole,
  recomputeOrgRoleIndex,
  removeDepartmentRole,
  toggleOrgRoleKey,
  updateRosterEntry,
} from '../../services/elevateService';
import { removeOrgMember } from '../../services/organizationService';
import { uploadFile } from '../../services/backendService';

const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const pill = 'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/45';

export interface MemberAccessEditorProps {
  org: Organization;
  myMembership: OrgMembership | null;
  member: OrgMembership;
  /** Called after every saved change (reload lists). */
  onChanged?: () => Promise<void> | void;
  /** Called after the person was removed from the org. */
  onRemoved?: () => void;
  /** Close / collapse the editor after "Save". */
  onDone?: () => void;
}

const MemberAccessEditor: React.FC<MemberAccessEditorProps> = ({ org, myMembership, member: m, onChanged, onRemoved, onDone }) => {
  const ministries = org.ministries || [];
  const assignable = ELEVATE_ROLES.filter(r => canAssignRole(myMembership, org, r.key));
  const canManage = elevateCan(myMembership, org, 'MANAGE_ROSTER') || elevateCan(myMembership, org, 'ASSIGN_ROLES');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState('');
  const [draft, setDraft] = useState<{ about: string; title: string; photo?: string }>({ about: m.aboutInOrg || '', title: m.title || '', photo: m.orgPhotoUrl });
  const [pick, setPick] = useState<{ ministryId: string; roleKey: string }>({ ministryId: ministries[0]?.id || '', roleKey: 'INSTRUCTOR' });
  const allRoleKeys = memberRoleKeys(m);

  if (!canManage) return <p className="text-[11px] text-white/40">Only roster staff can change roles.</p>;

  const run = async (fn: () => Promise<unknown>, okMsg = '') => {
    setBusy(true); setErr(null); setOk('');
    try { await fn(); await onChanged?.(); if (okMsg) setOk(okMsg); } catch (e: any) { setErr(e?.message || 'Something went wrong.'); }
    setBusy(false);
  };

  const changeRole = (roleKey: string) => run(async () => {
    await assignRole(org, myMembership, m, roleKey, { title: getElevateRole(roleKey)?.label });
    if (roleKey === 'SENIOR_PASTOR') await updateRosterEntry(m.id, { isSenior: true });
  });
  const uploadPhoto = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { const url = await uploadFile(`uploads/organizations/${org.id}/roster/${m.id}_${Date.now()}.${(f.name.split('.').pop() || 'jpg')}`, f); setDraft(d => ({ ...d, photo: url })); }
    catch (e: any) { setErr(e?.message || 'Upload failed.'); }
    setBusy(false);
  };
  const remove = () => {
    if (!window.confirm(`Remove ${m.displayName} from ${org.name}? Their directory record stays; they lose access.`)) return;
    run(async () => { await removeOrgMember(m.id); await recomputeOrgRoleIndex(org.id); onRemoved?.(); });
  };

  return (
    <div className="space-y-3">
      {err && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2">{err}</div>}

      <div className="space-y-1">
        <p className={label}>Main role</p>
        <select className={field} value={m.roleKey || ''} disabled={busy} onChange={e => e.target.value && changeRole(e.target.value)}>
          <option value="">Choose a role…</option>
          {assignable.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={`${label} flex items-center gap-1`}><Layers size={11} /> Also serves as</p>
        <div className="flex flex-wrap gap-1.5">
          {assignable.map(r => {
            const on = allRoleKeys.includes(r.key);
            return (
              <button key={r.key} type="button" disabled={busy} onClick={() => run(() => toggleOrgRoleKey(org, myMembership, m, r.key))}
                title={r.key === 'INSTRUCTOR' ? 'Church / org class instructor (not a credentialed Academia teacher)' : r.description}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${on ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                {on ? '✓ ' : '+ '}{r.label}
              </button>
            );
          })}
        </div>
      </div>

      {ministries.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">Departments</p>
          <div className="flex flex-wrap gap-1.5">
            {(m.ministryRoles || []).map((mr, i) => (
              <span key={`${mr.ministryId}_${mr.roleKey}_${i}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-500/15 border border-sky-400/30 text-sky-200">
                {ministries.find(x => x.id === mr.ministryId)?.name || mr.ministryId} · {getElevateRole(mr.roleKey)?.label || mr.roleKey}
                <button type="button" disabled={busy} onClick={() => run(() => removeDepartmentRole(org, myMembership, m, { ministryId: mr.ministryId, roleKey: mr.roleKey }))} className="hover:text-red-300" title="Remove"><X size={11} /></button>
              </span>
            ))}
            {(m.ministryRoles || []).length === 0 && <span className="text-[11px] text-white/40">Not in a department yet.</span>}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <select value={pick.ministryId} onChange={e => setPick(p => ({ ...p, ministryId: e.target.value }))} className="bg-black/50 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white flex-1 min-w-[140px]">
              <option value="">Department…</option>
              {ministries.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <select value={pick.roleKey} onChange={e => setPick(p => ({ ...p, roleKey: e.target.value }))} className="bg-black/50 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white flex-1 min-w-[140px]">
              {DEPARTMENT_SCOPED_ROLE_KEYS.map(rk => <option key={rk} value={rk}>{getElevateRole(rk)?.label || rk}</option>)}
            </select>
            <button type="button" disabled={busy || !pick.ministryId} onClick={() => run(() => addDepartmentRole(org, myMembership, m, pick))}
              className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 text-sky-200 text-xs font-black uppercase tracking-wider flex items-center gap-1 disabled:opacity-40">
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className={label}>On the public roster</p>
        <input className={field} placeholder="Title (e.g. Youth Pastor)" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
        <textarea rows={3} className={field + ' resize-none'} placeholder={`About ${m.displayName.split(' ')[0]} at ${org.name}…`} value={draft.about} onChange={e => setDraft(d => ({ ...d, about: e.target.value }))} />
        <div className="flex items-center gap-3 flex-wrap">
          <label className={`${pill} bg-white/5 border-white/10 text-white/60 cursor-pointer flex items-center gap-1.5 hover:bg-white/10`}>
            <Camera size={12} /> {draft.photo ? 'Change headshot' : 'Add headshot'}
            <input type="file" accept="image/*" className="hidden" onChange={e => uploadPhoto(e.target.files?.[0])} />
          </label>
          {draft.photo && <img src={draft.photo} alt="" className="w-9 h-9 rounded-full object-cover" />}
          {draft.photo && <button onClick={() => setDraft(d => ({ ...d, photo: undefined }))} className="text-[10px] text-white/40 underline">Remove</button>}
          {(m.rosterGroup || getElevateRole(m.roleKey)?.rosterGroup) === 'PASTORAL' && (
            <button disabled={busy} onClick={() => run(() => updateRosterEntry(m.id, { isSenior: !m.isSenior }))}
              className={`${pill} ${m.isSenior ? 'bg-amber-400/20 border-amber-300/40 text-amber-200' : 'bg-white/5 border-white/10 text-white/50'}`}>
              {m.isSenior ? 'Senior pastor' : 'Mark as senior'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-between items-center pt-1">
        <button onClick={remove} disabled={busy} className="text-[10px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-400">Remove from org</button>
        <div className="flex items-center gap-2">
          {ok && <span className="text-[11px] text-emerald-300">{ok}</span>}
          {busy && <Loader2 size={14} className="animate-spin text-white/40" />}
          <button disabled={busy} onClick={() => run(async () => {
            await updateRosterEntry(m.id, { aboutInOrg: draft.about, title: draft.title || undefined, orgPhotoUrl: draft.photo });
            onDone?.();
          }, 'Saved.')} className={`${pill} bg-white text-black border-white flex items-center gap-1`}><Check size={12} /> Save</button>
        </div>
      </div>
    </div>
  );
};

export default MemberAccessEditor;
