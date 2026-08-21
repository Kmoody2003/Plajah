import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, UserPlus, Check, Loader2, Trash2, ShieldCheck, Clock, IdCard } from 'lucide-react';
import { useContextMenu, type MenuNode } from '../ui/ContextMenu';
import {
  fetchOrgMembers, createManagedEmployee, acceptOrgMember, declineOrgMember,
  setOrgMemberRole, removeOrgMember,
} from '../../services/organizationService';
import { orgCan } from '../../services/orgPermissions';
import { logOrgAction } from '../../services/orgAudit';
import { buildEmployeeBadge } from '../../services/statCardService';
import StatCard from '../statcard/StatCard';
import type { Organization, OrgMembership, OrgRole } from '../../types';

// Roles this org delegates come from its template (org.roleDefs). Fallback to the base tiers.
const FALLBACK_ROLES: { key: string; label: string; baseRole: OrgRole }[] = [
  { key: 'ADMIN', label: 'Admin', baseRole: 'ADMIN' },
  { key: 'STAFF', label: 'Staff', baseRole: 'STAFF' },
  { key: 'MEMBER', label: 'Member', baseRole: 'MEMBER' },
];

const EmployeeManager: React.FC<{
  org: Organization;
  myMembership?: OrgMembership | null;
  onClose?: () => void;
}> = ({ org, myMembership, onClose }) => {
  const roleDefs = (org.roleDefs && org.roleDefs.length ? org.roleDefs : FALLBACK_ROLES);
  const canManage = orgCan(myMembership, org, 'MANAGE_EMPLOYEES');

  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [roleKey, setRoleKey] = useState(roleDefs[0]?.key || 'STAFF');
  const [busy, setBusy] = useState(false);
  const [badge, setBadge] = useState<OrgMembership | null>(null);  // work-badge preview
  const [badgeFlip, setBadgeFlip] = useState(false);

  const load = async () => {
    setLoading(true);
    setMembers(await fetchOrgMembers(org.id));
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org.id]);

  const roleFor = (key?: string) => roleDefs.find(r => r.key === key);
  const baseRoleFor = (key: string): OrgRole => roleFor(key)?.baseRole || 'STAFF';

  const addEmployee = async () => {
    if (!name.trim() || !canManage) return;
    setBusy(true);
    const res = await createManagedEmployee(org.id, { displayName: name.trim(), roleKey, role: baseRoleFor(roleKey) });
    if (res) await logOrgAction(org.id, 'EMPLOYEE_ADDED', { targetId: res.membership.id, targetName: name.trim(), meta: { roleKey } });
    setBusy(false); setName('');
    load();
  };

  const accept = async (m: OrgMembership) => {
    await acceptOrgMember(m.id, m.roleKey ? baseRoleFor(m.roleKey) : m.role);
    await logOrgAction(org.id, 'MEMBER_ACCEPTED', { targetId: m.id, targetName: m.displayName });
    load();
  };
  const decline = async (m: OrgMembership) => {
    await declineOrgMember(m.id);
    await logOrgAction(org.id, 'MEMBER_DECLINED', { targetId: m.id, targetName: m.displayName });
    load();
  };
  const changeRole = async (m: OrgMembership, key: string) => {
    await setOrgMemberRole(m.id, baseRoleFor(key), roleFor(key)?.label);
    await logOrgAction(org.id, 'ROLE_CHANGED', { targetId: m.id, targetName: m.displayName, meta: { roleKey: key } });
    load();
  };
  const remove = async (m: OrgMembership) => {
    if (!window.confirm(`Remove ${m.displayName} from ${org.name}?`)) return;
    await removeOrgMember(m.id);
    await logOrgAction(org.id, 'EMPLOYEE_REMOVED', { targetId: m.id, targetName: m.displayName });
    load();
  };

  const active = members.filter(m => m.status === 'ACTIVE');
  const pending = members.filter(m => m.status === 'PENDING');
  const field = 'bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#0070FF]/50 transition-all placeholder:text-white/25';

  // Right-click / long-press a roster member — the shared design-system menu.
  const memberMenu = useContextMenu<OrgMembership>((m) => {
    const isOwnerRow = m.role === 'OWNER' || org.creatorId === m.userId;
    const items: MenuNode<OrgMembership>[] = [
      { kind: 'header', label: m.displayName },
      { id: 'badge', label: 'View work badge', icon: <IdCard size={14} />, onSelect: (mem) => { setBadge(mem); setBadgeFlip(false); } },
    ];
    if (canManage && !isOwnerRow) {
      items.push({
        id: 'role', label: 'Change role', submenu: roleDefs.filter(r => r.key !== 'OWNER').map(r => ({
          id: `role-${r.key}`, label: r.label, checked: (m.roleKey || m.role) === r.key, onSelect: (mem: OrgMembership) => changeRole(mem, r.key),
        })),
      });
      items.push({ kind: 'separator' }, { id: 'remove', label: 'Remove from team', danger: true, icon: <Trash2 size={14} />, onSelect: (mem) => remove(mem) });
    }
    return items;
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[320] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl bg-[#0a0a0d] border border-white/10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 sticky top-0 bg-[#0a0a0d] z-10">
          <IdCard size={18} className="text-[#0070FF]" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">Employees</p>
            <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">{org.name}</p>
          </div>
          {onClose && <button onClick={onClose} className="ml-auto w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>}
        </div>

        <div className="p-5 space-y-5">
          {memberMenu.node}
          {!canManage && (
            <p className="text-[10px] font-bold text-amber-400/80 px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/20">You can view the roster but need the Manage-Employees permission to make changes.</p>
          )}

          {/* Add managed employee */}
          {canManage && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><UserPlus size={12} /> Add an employee</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Employee name" className={`${field} flex-1`} />
                <select value={roleKey} onChange={e => setRoleKey(e.target.value)} className={field}>
                  {roleDefs.filter(r => r.key !== 'OWNER').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
                <button onClick={addEmployee} disabled={busy || !name.trim()} className="px-5 py-3 rounded-2xl text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
                </button>
              </div>
              <p className="text-[9px] text-white/30">Creates a managed work profile + badge. The person can later claim it to link it to their own account.</p>
            </div>
          )}

          {/* Pending applicants */}
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><Clock size={12} /> Pending ({pending.length})</p>
              {pending.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl bg-amber-400/[0.06] border border-amber-400/15">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.displayName}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{roleFor(m.roleKey)?.label || m.role} · applied</p>
                  </div>
                  {canManage && <>
                    <button onClick={() => accept(m)} className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/25"><Check size={15} /></button>
                    <button onClick={() => decline(m)} className="w-8 h-8 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white"><X size={15} /></button>
                  </>}
                </div>
              ))}
            </div>
          )}

          {/* Active roster */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><ShieldCheck size={12} /> Team ({active.length})</p>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-white/40" /></div>
            ) : active.map(m => {
              const isOwnerRow = m.role === 'OWNER' || org.creatorId === m.userId;
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8" {...memberMenu.bind(m)}>
                  {/* Rectangular work-badge avatar */}
                  <div className="w-10 h-12 rounded-lg overflow-hidden bg-white/10 shrink-0 border border-white/10">
                    {m.photoUrl ? <img src={m.photoUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/30"><IdCard size={16} /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.displayName}{m.isEmployee && <span className="ml-1.5 text-[8px] font-black uppercase tracking-widest text-[#FFD400]/80">Badge</span>}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{roleFor(m.roleKey)?.label || m.role}</p>
                  </div>
                  <button onClick={() => { setBadge(m); setBadgeFlip(false); }} title="View work badge" className="w-8 h-8 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-[#FFD400]"><IdCard size={14} /></button>
                  {canManage && !isOwnerRow && (
                    <>
                      <select value={m.roleKey || m.role} onChange={e => changeRole(m, e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-2 py-1.5 text-[10px] font-bold text-white/70 outline-none">
                        {roleDefs.filter(r => r.key !== 'OWNER').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                      <button onClick={() => remove(m)} className="w-8 h-8 rounded-full bg-white/5 text-white/30 flex items-center justify-center hover:text-red-400"><Trash2 size={14} /></button>
                    </>
                  )}
                  {isOwnerRow && <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Owner</span>}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Work-badge preview — tap the card to flip it */}
      {badge && (
        <div className="fixed inset-0 z-[330] bg-black/85 flex items-center justify-center p-4" onClick={() => setBadge(null)}>
          <div onClick={e => { e.stopPropagation(); setBadgeFlip(f => !f); }} style={{ cursor: 'pointer' }}>
            <StatCard data={buildEmployeeBadge(badge, org)} flipped={badgeFlip} />
            <p className="text-center text-[9px] font-black uppercase tracking-widest text-white/40 mt-3">Tap card to flip · tap outside to close</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default EmployeeManager;
