// RosterManager — operational roster: Pastoral / Leadership / Staff / Volunteers / Members + Pending approvals.
// Supports multi-department memberships (`ministryIds`) and multi-role assignments (`roleKeys` + `ministryRoles`),
// including `DEPARTMENT_HEAD`, `DEPARTMENT_ADMIN` (Department Administrator), `INSTRUCTOR` (Non-Credentialed
// Church/Org Class Instructor, distinct from Academia `TEACHER`), and `DEPARTMENT_VOLUNTEER`.
import { UserAvatar } from '../avatar/UserAvatar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ChevronUp, ChevronDown, Pencil, Check, X, Loader2, UserPlus, Star, GraduationCap } from 'lucide-react';
import type { Organization, OrgMembership, OrgMembershipOnboarding, RosterGroup, UserProfile } from '../../types';
import {
  DEPARTMENT_SCOPED_ROLE_KEYS,
  ELEVATE_ROLES,
  canAssignRole,
  elevateCan,
  isProtectedRole,
  getElevateRole,
  memberDepartmentIds,
  memberRoleKeys,
} from '../../services/elevateRoles';
import {
  assignRole,
  setProtectedRole,
  recomputeOrgRoleIndex,
  rosterFor,
  updateRosterEntry,
} from '../../services/elevateService';
import { fetchOrgMembers, acceptOrgMember, declineOrgMember, addOrgMember, fetchOnboardingVault } from '../../services/organizationService';
import { searchUserProfiles } from '../../services/backendService';
import { provisionAccount } from '../../services/elevateAccounts';
import MemberAccessEditor from './MemberAccessEditor';
import { savePerson } from '../../services/chmsPeople';

export interface RosterManagerProps {
  org: Organization;
  myMembership: OrgMembership | null;
  onClose?: () => void;
  onChanged?: () => void;
  /** People workspace splits the roster: 'roles' = role groups only, 'requests' = pending join requests only. */
  only?: 'roles' | 'requests';
  /** Open this person's full directory profile (People workspace). Returns false when they have no record. */
  onOpenPerson?: (m: OrgMembership) => boolean | void;
}

type Tab = RosterGroup | 'PENDING';
const TABS: { key: Tab; label: string }[] = [
  { key: 'PASTORAL', label: 'Pastoral' }, { key: 'LEADERSHIP', label: 'Leadership' }, { key: 'STAFF', label: 'Staff' },
  { key: 'VOLUNTEER', label: 'Volunteers & Instructors' }, { key: 'MEMBER', label: 'Members' }, { key: 'PENDING', label: 'Pending' },
];
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const pill = 'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all';

const RosterManager: React.FC<RosterManagerProps> = ({ org, myMembership, onClose, onChanged, only, onOpenPerson }) => {
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [pendingVaults, setPendingVaults] = useState<Record<string, OrgMembershipOnboarding>>({});
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>(only === 'requests' ? 'PENDING' : 'PASTORAL');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [addRole, setAddRole] = useState('INSTRUCTOR');
  const [addMinistry, setAddMinistry] = useState('');
  // "Pre-provision": no Plajah user yet — create the congregation record + a claimable seat in one go.
  const [addMode, setAddMode] = useState<'search' | 'provision'>('search');
  const [pre, setPre] = useState({ first: '', last: '', email: '', memberNumber: '' });
  const [preMsg, setPreMsg] = useState('');

  const canManage = elevateCan(myMembership, org, 'MANAGE_ROSTER') || elevateCan(myMembership, org, 'ASSIGN_ROLES');
  const assignable = useMemo(() => ELEVATE_ROLES.filter(r => canAssignRole(myMembership, org, r.key)), [myMembership, org]);
  const ministries = org.ministries || [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ms = await fetchOrgMembers(org.id);
      setMembers(ms);
      const pend = ms.filter(m => m.status === 'PENDING');
      if (pend.length) {
        const entries = await Promise.all(
          pend.map(async p => [p.id, await fetchOnboardingVault(p.id)] as const),
        );
        const vMap: Record<string, OrgMembershipOnboarding> = {};
        for (const [id, v] of entries) {
          if (v) vMap[id] = v;
        }
        setPendingVaults(vMap);
      }
    } catch (e: any) { setErr(e?.message || 'Could not load roster.'); }
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

  const move = (m: OrgMembership, dir: -1 | 1) => {
    const i = list.findIndex(x => x.id === m.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map(x => x.id); [ids[i], ids[j]] = [ids[j], ids[i]];
    return run(m.id, async () => { await Promise.all(ids.map((id, idx) => updateRosterEntry(id, { rosterOrder: idx }))); });
  };

  const startEdit = (m: OrgMembership) => setEditId(m.id);
  const approve = (m: OrgMembership) => run(m.id, async () => {
    const chosenRoleKey = pendingRoles[m.id] || m.onboarding?.requestedRoleKey || m.roleKey || 'MEMBER';
    await acceptOrgMember(m.id, undefined, chosenRoleKey);
    await recomputeOrgRoleIndex(org.id);
  });
  const decline = (m: OrgMembership) => run(m.id, async () => { await declineOrgMember(m.id); });

  const addPerson = (u: UserProfile) => run('add', async () => {
    const existing = members.find(m => m.userId === u.uid);
    let target = existing;
    if (!target) {
      const created = await addOrgMember(org.id, { userId: u.uid, displayName: u.displayName, photoUrl: u.photoURL, role: 'MEMBER' });
      if (!created) throw new Error('Could not add that person.');
      target = created;
    }
    await assignRole(org, myMembership, target, addRole, { ministryId: addMinistry || undefined, title: getElevateRole(addRole)?.label, keepExistingInMinistry: true });
    if (addRole === 'SENIOR_PASTOR') await updateRosterEntry(target.id, { isSenior: true });
    setQ(''); setResults([]);
  });

  const preProvision = () => run('add', async () => {
    if (!pre.first.trim() || !pre.last.trim()) throw new Error('First and last name are required.');
    const person = await savePerson(org.id, { firstName: pre.first.trim(), lastName: pre.last.trim(), email: pre.email.trim() || undefined, memberNumber: pre.memberNumber.trim().toUpperCase() || undefined, status: 'MEMBER', ministryIds: addMinistry ? [addMinistry] : undefined });
    const r = await provisionAccount(org, person, {
      roleKey: addRole,
      roleKeys: addRole === 'INSTRUCTOR' ? ['INSTRUCTOR', 'DEPARTMENT_VOLUNTEER', 'MEMBER'] : [addRole, 'MEMBER'],
      ministryIds: addMinistry ? [addMinistry] : undefined,
    });
    // A seat doesn't carry IT Admin or finance powers until the server records them.
    if (r && isProtectedRole(addRole)) await setProtectedRole(org.id, r.membership.id, addRole, true);
    setPreMsg(r ? `${person.firstName} ${person.lastName} is on the roster as ${getElevateRole(addRole)?.label}. Member ID ${r.membership.memberNumber} — they claim the account with it (+ last name) or by signing in with ${pre.email.trim() || 'their email'}.` : 'Already provisioned.');
    setPre({ first: '', last: '', email: '', memberNumber: '' });
  });

  return (
    <div className="space-y-4">
      {onClose && !only && (
        <div className="flex justify-end">
          <button onClick={onClose} className={`${pill} bg-white/5 border-white/10 text-white/60 hover:bg-white/10`}>Close</button>
        </div>
      )}
      {only !== 'requests' && (
        <p className="text-xs text-white/45 flex items-start gap-2">
          <GraduationCap size={14} className="text-emerald-300 shrink-0 mt-0.5" />
          <span>Anyone can hold several roles and belong to several departments. Tap the pencil to change a person's roles. <span className="text-white/30">Instructor = church / org class teacher; Teacher = credentialed Academia educator.</span></span>
        </p>
      )}

      {err && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2">{err}</div>}

      {only !== 'requests' && <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.filter(t => only === 'roles' ? t.key !== 'PENDING' : true).map(t => {
          const n = t.key === 'PENDING' ? pending.length : rosterFor(members, t.key).length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`${pill} whitespace-nowrap ${tab === t.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
              {t.label} {n > 0 && <span className="opacity-60">{n}</span>}
            </button>
          );
        })}
      </div>}

      {tab !== 'PENDING' && assignable.length > 0 && !showAdd && (
        <button onClick={() => setShowAdd(true)} className={`${pill} bg-small-orange text-black border-small-orange flex items-center gap-1.5`}><UserPlus size={12} /> Give someone a role</button>
      )}
      {tab !== 'PENDING' && assignable.length > 0 && showAdd && (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><UserPlus size={12} /> Give someone a role</p>
            <button onClick={() => setShowAdd(false)} className="text-white/40 hover:text-white" aria-label="Close"><X size={14} /></button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select className={field + ' !w-auto flex-1 min-w-[180px]'} value={addRole} onChange={e => setAddRole(e.target.value)}>
              {assignable.map(r => (
                <option key={r.key} value={r.key}>
                  {r.label}{r.key === 'INSTRUCTOR' ? ' (Non-Credentialed Church Class)' : ''}
                </option>
              ))}
            </select>
            {ministries.length > 0 && (
              <select className={field + ' !w-auto flex-1 min-w-[180px]'} value={addMinistry} onChange={e => setAddMinistry(e.target.value)}>
                <option value="">Org-wide{(DEPARTMENT_SCOPED_ROLE_KEYS as readonly string[]).includes(addRole) ? ' (pick a department!)' : ''}</option>
                {ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
          <div className="flex gap-1.5">
            {([['search', 'Existing Plajah user'], ['provision', 'Pre-provision an account']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setAddMode(k)} className={`${pill} ${addMode === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{l}</button>
            ))}
          </div>
          {addMode === 'provision' && (
            <div className="space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                <input className={field} placeholder="First name" value={pre.first} onChange={e => setPre(p => ({ ...p, first: e.target.value }))} />
                <input className={field} placeholder="Last name" value={pre.last} onChange={e => setPre(p => ({ ...p, last: e.target.value }))} />
                <input className={field} type="email" placeholder="Email on file (lets them claim by signing in)" value={pre.email} onChange={e => setPre(p => ({ ...p, email: e.target.value }))} />
                <input className={field} placeholder="Member ID (optional — generated if blank)" value={pre.memberNumber} onChange={e => setPre(p => ({ ...p, memberNumber: e.target.value }))} />
              </div>
              <p className="text-[11px] text-white/40">Creates their Plajah account and seat now with the role and department above. They claim it by signing in with their email or Member ID.</p>
              <button onClick={preProvision} disabled={busy === 'add'} className={`${pill} bg-small-orange text-black border-small-orange flex items-center gap-1.5`}>{busy === 'add' ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Provision account</button>
              {preMsg && <p className="text-[11px] text-sky-300">{preMsg}</p>}
            </div>
          )}
          {addMode === 'search' && <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input className={field + ' pl-10'} placeholder="Search Plajah users…" value={q} onChange={e => setQ(e.target.value)} />
          </div>}
          {addMode === 'search' && results.map(u => (
            <button key={u.uid} onClick={() => addPerson(u)} disabled={busy === 'add'} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-white/10">
              <span className="w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0">{u.photoURL && <UserAvatar uid={u.uid} src={u.photoURL} alt="" className="w-full h-full object-cover" />}</span>
              <span className="text-sm text-white flex-1">{u.displayName}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-small-orange">{busy === 'add' ? '…' : 'Assign Role'}</span>
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
              const allRoleKeys = memberRoleKeys(m);
              const allDeptIds = memberDepartmentIds(m);
              const photo = m.orgPhotoUrl || m.photoUrl;
              const vault = pendingVaults[m.id];
              const chosenPendingRole = pendingRoles[m.id] || m.onboarding?.requestedRoleKey || m.roleKey || 'MEMBER';
              return (
                <div key={m.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-3">
                  <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <span className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0 grid place-items-center text-sm font-black text-white/50">
                      {photo ? <UserAvatar uid={m.userId} src={photo} alt="" className="w-full h-full object-cover" /> : m.displayName.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-bold text-white truncate flex items-center gap-1.5 flex-wrap">
                        {m.displayName}
                        {m.isSenior && <Star size={12} className="text-amber-300" fill="currentColor" />}
                        {m.memberNumber && (
                          <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-white/70 text-[9px] font-mono">
                            ID: {m.memberNumber}
                          </span>
                        )}
                        {m.employeeNumber && (
                          <span className="px-1.5 py-0.5 rounded-md bg-purple-500/15 border border-purple-400/30 text-purple-200 text-[9px] font-mono">
                            EMP: {m.employeeNumber}
                          </span>
                        )}
                        {m.isProvisioned && (
                          <span title={`Pre-provisioned — claim with name/email or ID ${m.memberNumber || ''}`} className="px-1.5 py-0.5 rounded-full bg-sky-400/15 border border-sky-300/30 text-sky-200 text-[8px] font-black uppercase tracking-widest">
                            Ready to claim{m.memberNumber ? ` · ${m.memberNumber}` : ''}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-white/45 truncate">{m.title || def?.label || 'Member'}</p>

                      {/* Multi-Role & Multi-Department Badges */}
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {allRoleKeys.map(rk => {
                          const rDef = getElevateRole(rk);
                          const isInstructor = rk === 'INSTRUCTOR';
                          return (
                            <span
                              key={`rk_${rk}`}
                              title={isInstructor ? 'Non-Credentialed Church/Org Class Instructor (distinct from Academia Teacher)' : rDef?.description}
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                isInstructor
                                  ? 'bg-emerald-500/20 border-emerald-400/35 text-emerald-200'
                                  : 'bg-white/[0.06] border-white/10 text-white/75'
                              }`}
                            >
                              {rDef?.label || rk}
                              {isInstructor ? ' · Non-Credentialed' : ''}
                            </span>
                          );
                        })}
                        {(m.ministryRoles || []).map((mr, i) => {
                          const minName = ministries.find(min => min.id === mr.ministryId)?.name || mr.ministryId;
                          const rLabel = getElevateRole(mr.roleKey)?.label || mr.roleKey;
                          return (
                            <span
                              key={`mr_${mr.ministryId}_${mr.roleKey}_${i}`}
                              className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/15 border border-sky-400/30 text-sky-200"
                            >
                              {minName} · {rLabel}
                            </span>
                          );
                        })}
                        {allDeptIds
                          .filter(dId => !(m.ministryRoles || []).some(mr => mr.ministryId === dId))
                          .map(dId => {
                            const minName = ministries.find(min => min.id === dId)?.name || dId;
                            return (
                              <span
                                key={`dept_${dId}`}
                                className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-500/15 border border-indigo-400/30 text-indigo-200"
                              >
                                Dept: {minName}
                              </span>
                            );
                          })}
                      </div>
                    </div>
                    {tab === 'PENDING' ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select
                          value={chosenPendingRole}
                          onChange={e => setPendingRoles(prev => ({ ...prev, [m.id]: e.target.value }))}
                          className="bg-black/40 border border-white/15 rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                          title="Assign role upon approval"
                        >
                          {ELEVATE_ROLES.map(r => (
                            <option key={r.key} value={r.key} className="bg-[#0e0e11]">{r.label}</option>
                          ))}
                        </select>
                        <button onClick={() => approve(m)} disabled={busy === m.id} className={`${pill} bg-emerald-500/20 border-emerald-400/30 text-emerald-200 flex items-center gap-1`}><Check size={12} /> Approve</button>
                        <button onClick={() => decline(m)} disabled={busy === m.id} className={`${pill} bg-red-500/10 border-red-400/20 text-red-300 flex items-center gap-1`}><X size={12} /> Decline</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => move(m, -1)} disabled={idx === 0 || !!busy} className="p-1.5 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move up"><ChevronUp size={14} /></button>
                        <button onClick={() => move(m, 1)} disabled={idx === list.length - 1 || !!busy} className="p-1.5 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move down"><ChevronDown size={14} /></button>
                        {onOpenPerson && <button onClick={() => onOpenPerson(m)} className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10" title="Open full profile">Profile</button>}
                        <button onClick={() => (editing ? setEditId(null) : startEdit(m))} className="p-1.5 text-white/40 hover:text-white" aria-label="Edit roles"><Pencil size={14} /></button>
                      </div>
                    )}
                    {busy === m.id && <Loader2 size={14} className="animate-spin text-white/40" />}
                  </div>

                  {tab === 'PENDING' && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1.5 text-[11px] text-white/60">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-500/10 border border-emerald-400/25 px-2 py-0.5 rounded-full">
                          🔒 Private Sanctuary Onboarding Vault · Populates ChMS on Approval
                        </span>
                        <span className="text-[10px] text-purple-300 font-bold">
                          Member ID &amp; Employment # auto-generate on approval
                        </span>
                      </div>
                      {(m.onboarding || vault) && (
                        <>
                          <p className="flex flex-wrap gap-x-4 gap-y-1">
                            {(vault?.email || m.onboarding?.email) && (
                              <span>Private Email: <span className="text-white/85 font-semibold">{vault?.email || m.onboarding?.email}</span></span>
                            )}
                            {(vault?.phone || m.onboarding?.phone) && (
                              <span>Private Phone: <span className="text-white/85 font-semibold">{vault?.phone || m.onboarding?.phone}</span></span>
                            )}
                            {(vault?.memberNumber || m.onboarding?.memberNumber) && (
                              <span>Provided Member ID: <span className="text-sky-300 font-bold">{vault?.memberNumber || m.onboarding?.memberNumber}</span></span>
                            )}
                            {(vault?.employeeNumber || m.onboarding?.employeeNumber) && (
                              <span>Provided Emp #: <span className="text-purple-300 font-bold">{vault?.employeeNumber || m.onboarding?.employeeNumber}</span></span>
                            )}
                            {(vault?.isExistingCongregant ?? m.onboarding?.isExistingCongregant) && (
                              <span className="text-emerald-300 font-bold">· Existing Congregation / Staff Member</span>
                            )}
                          </p>
                          {(vault?.address || m.onboarding?.address) && (
                            <p>
                              Private Address:{' '}
                              <span className="text-white/80">
                                {[
                                  (vault?.address || m.onboarding?.address)?.line1,
                                  (vault?.address || m.onboarding?.address)?.city,
                                  (vault?.address || m.onboarding?.address)?.region,
                                  (vault?.address || m.onboarding?.address)?.postal,
                                ].filter(Boolean).join(', ')}
                              </span>
                            </p>
                          )}
                          {!!(vault?.familyMembers || m.onboarding?.familyMembers)?.length && (
                            <p>
                              Household / Family:{' '}
                              <span className="text-white/85">
                                {(() => {
                                  const raw = (vault?.familyMembers || m.onboarding?.familyMembers) as unknown;
                                  if (typeof raw === 'string') return raw;
                                  if (Array.isArray(raw)) return raw.map((fm: any) => typeof fm === 'string' ? fm : `${fm.name} (${fm.relation})`).join(' · ');
                                  return '';
                                })()}
                              </span>
                            </p>
                          )}
                          {!!(vault?.skills || m.onboarding?.skills)?.length && (
                            <p>
                              Gifts &amp; Skills:{' '}
                              <span className="text-white/80">
                                {(vault?.skills || m.onboarding?.skills || []).join(', ')}
                              </span>
                            </p>
                          )}
                          {!!(vault?.ministryIds || m.onboarding?.ministryIds)?.length && (
                            <p>
                              Ministries:{' '}
                              <span className="text-white/80">
                                {(vault?.ministryIds || m.onboarding?.ministryIds || [])
                                  .map(id => ministries.find(min => min.id === id)?.name || id)
                                  .join(', ')}
                              </span>
                            </p>
                          )}
                          {(vault?.note || m.onboarding?.note) && (
                            <p className="italic text-white/60">"{vault?.note || m.onboarding?.note}"</p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {editing && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <MemberAccessEditor org={org} myMembership={myMembership} member={m}
                        onChanged={async () => { await load(); onChanged?.(); }}
                        onRemoved={() => setEditId(null)}
                        onDone={() => setEditId(null)} />
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
