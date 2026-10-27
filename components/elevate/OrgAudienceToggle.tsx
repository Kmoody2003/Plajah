// OrgAudienceToggle — Universal Organization Feed, Department & Sub-Group Audience Picker.
// Allows an organization (or authorized member/leader) to route posts and shares to:
//   • Public            — public timeline + org page; anyone signed in can comment
//   • Members Comment   — readable on the org page; only members & followers can comment
//   • Members Only      — non-public (INTERNAL) feed visible only to active org members & leaders
//   • Departments       — non-public feed targeted to one or more specific departments
//   • Sub-Groups        — non-public feed targeted to specific sub-groups (ministry groups, department rooms, roster groups)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Users, Lock, Building2, Layers, ChevronDown, Check, Plus, X } from 'lucide-react';
import type { Organization, OrgMembership, Ministry, Post, RosterGroup } from '../../types';
import { elevateCan, getElevateRole } from '../../services/elevateRoles';
import { saveMinistries, newMinistry } from '../../services/elevateService';
import { fetchOrganization } from '../../services/organizationService';
import { auth } from '../../services/firebase';

export type OrgPostAudience = 'PUBLIC' | 'MEMBERS' | 'INTERNAL' | 'DEPARTMENT';

export type OrgFeedScopeMode =
  | 'PUBLIC'
  | 'MEMBERS'
  | 'INTERNAL'
  | 'DEPARTMENTS'
  | 'SUBGROUPS';

export interface OrgPostTarget {
  mode: OrgFeedScopeMode;
  orgAudience: OrgPostAudience;
  departmentIds: string[];
  groupIds: string[];
  rosterGroups: RosterGroup[];
  roomId?: string;
  targetLabels: string[];
}

export interface OrgSubGroupOption {
  id: string;
  label: string;
  category: 'MINISTRY' | 'ROOM' | 'ROSTER' | 'CHANNEL';
  categoryLabel: string;
  departmentId?: string;
  roomId?: string;
  rosterGroup?: RosterGroup;
}

export const ROSTER_GROUP_OPTIONS: { key: RosterGroup; label: string; churchLabel: string }[] = [
  { key: 'PASTORAL', label: 'Executive / Lead Team', churchLabel: 'Pastoral Team' },
  { key: 'LEADERSHIP', label: 'Leadership & Board', churchLabel: 'Leadership & Elders' },
  { key: 'STAFF', label: 'Staff & Operations', churchLabel: 'Church Staff' },
  { key: 'VOLUNTEER', label: 'Volunteers & Teams', churchLabel: 'Volunteers & Serve Teams' },
  { key: 'MEMBER', label: 'General Members', churchLabel: 'Congregation Members' },
];

export function defaultOrgPostTarget(
  audience: OrgPostAudience = 'PUBLIC',
  ministry?: Ministry,
): OrgPostTarget {
  if (ministry) {
    const isDept = ministry.kind === 'DEPARTMENT';
    const isPrivate = ministry.threadAudience === 'DEPARTMENT';
    if (isPrivate) {
      return {
        mode: isDept ? 'DEPARTMENTS' : 'SUBGROUPS',
        orgAudience: 'INTERNAL',
        departmentIds: isDept ? [ministry.id] : [],
        groupIds: isDept ? [] : [ministry.id],
        rosterGroups: [],
        targetLabels: [ministry.name],
      };
    }
  }
  if (audience === 'INTERNAL') {
    return {
      mode: 'INTERNAL',
      orgAudience: 'INTERNAL',
      departmentIds: [],
      groupIds: [],
      rosterGroups: [],
      targetLabels: ['Members Only'],
    };
  }
  if (audience === 'DEPARTMENT' && ministry) {
    return {
      mode: 'DEPARTMENTS',
      orgAudience: 'INTERNAL',
      departmentIds: [ministry.id],
      groupIds: [],
      rosterGroups: [],
      targetLabels: [ministry.name],
    };
  }
  return {
    mode: audience === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC',
    orgAudience: audience === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC',
    departmentIds: ministry ? [ministry.id] : [],
    groupIds: [],
    rosterGroups: [],
    targetLabels: ministry ? [ministry.name] : [],
  };
}

/**
 * Convert an OrgPostTarget into the fields stored on a Post document in Firestore.
 * Note: All non-public org feeds (Members-Only, Department-targeted, Sub-Group-targeted)
 * store `orgAudience: 'INTERNAL'` and `isPublic: false` so Firestore's `orgIsMember` rule
 * authorizes both creation and member queries without composite-index or rule failures,
 * while `orgDepartmentId`, `orgDepartmentIds`, `orgGroupIds`, `orgRosterGroups`, and `orgRoomId`
 * scope the post to the exact department(s) and sub-group(s).
 */
export function orgTargetToPostFields(target: OrgPostTarget): Partial<Post> {
  if (target.mode === 'PUBLIC') {
    return {
      isPublic: true,
      orgAudience: 'PUBLIC',
      ...(target.departmentIds[0] ? { orgDepartmentId: target.departmentIds[0] } : {}),
      ...(target.targetLabels.length ? { orgTargetLabels: target.targetLabels } : {}),
    };
  }
  if (target.mode === 'MEMBERS') {
    return {
      isPublic: true,
      orgAudience: 'MEMBERS',
      ...(target.departmentIds[0] ? { orgDepartmentId: target.departmentIds[0] } : {}),
      ...(target.targetLabels.length ? { orgTargetLabels: target.targetLabels } : {}),
    };
  }
  // Non-public feeds: INTERNAL, DEPARTMENTS, SUBGROUPS
  const primaryDept = target.departmentIds[0];
  return {
    isPublic: false,
    orgAudience: 'INTERNAL',
    ...(primaryDept ? { orgDepartmentId: primaryDept } : {}),
    ...(target.departmentIds.length ? { orgDepartmentIds: target.departmentIds } : {}),
    ...(target.groupIds.length ? { orgGroupIds: target.groupIds } : {}),
    ...(target.rosterGroups.length ? { orgRosterGroups: target.rosterGroups } : {}),
    ...(target.roomId ? { orgRoomId: target.roomId } : {}),
    orgTargetLabels: target.targetLabels.length ? target.targetLabels : ['Members Only'],
  };
}

/** Extract all selectable Departments and Sub-Groups from an Organization. */
export function extractOrgDepartmentsAndGroups(org?: Organization | null): {
  departments: Ministry[];
  subGroups: OrgSubGroupOption[];
} {
  if (!org) return { departments: [], subGroups: [] };
  const ministries = org.ministries || [];
  const isChurch = !org.orgType || org.orgType === 'CHURCH';

  // Departments: ministries marked kind === 'DEPARTMENT' (or top-level ministries if none have kind set)
  const explicitDepts = ministries.filter(m => m.kind === 'DEPARTMENT');
  const departments = explicitDepts.length > 0
    ? explicitDepts
    : ministries.filter(m => !m.parentId);

  const subGroups: OrgSubGroupOption[] = [];

  // 1. Ministry / Fellowship / Small Groups (plus any sub-ministries with parentId)
  const ministryGroups = ministries.filter(m => m.kind !== 'DEPARTMENT' || !!m.parentId);
  // If all ministries were marked DEPARTMENT, also expose them under sub-groups only via their rooms,
  // while non-department ministries appear as Ministry Groups.
  for (const m of ministryGroups) {
    const parent = m.parentId ? ministries.find(p => p.id === m.parentId) : undefined;
    subGroups.push({
      id: m.id,
      label: parent ? `${parent.name} · ${m.name}` : `${m.iconEmoji ? `${m.iconEmoji} ` : ''}${m.name}`,
      category: 'MINISTRY',
      categoryLabel: isChurch ? 'Ministries & Small Groups' : 'Groups & Committees',
      departmentId: m.id,
    });
  }

  // 2. Department & Ministry Sub-Rooms (e.g. Worship Team, Media Booth, Youth Leaders)
  for (const m of ministries) {
    for (const room of m.rooms || []) {
      subGroups.push({
        id: `room:${m.id}:${room.id}`,
        label: `${m.name} · #${room.name}`,
        category: 'ROOM',
        categoryLabel: 'Department Sub-Groups & Rooms',
        departmentId: m.id,
        roomId: room.id,
      });
    }
  }

  // 3. Roster / Role Sub-Groups (Pastoral, Leadership, Staff, Volunteers, Members)
  for (const r of ROSTER_GROUP_OPTIONS) {
    subGroups.push({
      id: `roster:${r.key}`,
      label: isChurch ? r.churchLabel : r.label,
      category: 'ROSTER',
      categoryLabel: 'Role & Roster Groups',
      rosterGroup: r.key,
    });
  }

  // 4. Organization Channels (if any)
  for (const ch of org.channels || []) {
    subGroups.push({
      id: `channel:${ch.id}`,
      label: `#${ch.name}`,
      category: 'CHANNEL',
      categoryLabel: 'Channels',
    });
  }

  return { departments, subGroups };
}

/** Get the set of all department & ministry IDs a member belongs to in an org. */
export function getMemberMinistryIdSet(
  membership: OrgMembership | null | undefined,
  org: Organization,
  viewerUid?: string,
): Set<string> {
  const ids = new Set<string>();
  const uid = viewerUid || membership?.userId;
  if (membership && membership.status === 'ACTIVE') {
    for (const id of membership.ministryIds || []) if (id) ids.add(id);
    for (const r of membership.ministryRoles || []) if (r.ministryId) ids.add(r.ministryId);
  }
  if (uid) {
    for (const m of org.ministries || []) {
      if (m.headUids?.includes(uid)) ids.add(m.id);
    }
  }
  return ids;
}

/** Check whether the viewer has full leadership/moderation visibility across all org feeds. */
export function isOrgFeedAdminOrLeader(
  membership: OrgMembership | null | undefined,
  org: Organization,
  viewerUid?: string,
): boolean {
  const uid = viewerUid || membership?.userId;
  if (!uid) return false;
  if (
    org.ownerId === uid ||
    org.accountUid === uid ||
    org.adminUids?.includes(uid) ||
    org.pastorUids?.includes(uid)
  ) {
    return true;
  }
  return (
    elevateCan(membership, org, 'MODERATE_THREADS') ||
    elevateCan(membership, org, 'MANAGE_MINISTRIES') ||
    elevateCan(membership, org, 'MANAGE_ROSTER')
  );
}

/**
 * Determine whether a viewer can see a specific org post (enforcing Members-Only,
 * Department-specific, and Sub-Group / Roster-Group targeting).
 */
export function canViewerSeeOrgPost(
  post: Post,
  viewerUid: string | undefined,
  membership: OrgMembership | null | undefined,
  org: Organization,
): boolean {
  const isNonPublic =
    post.orgAudience === 'INTERNAL' ||
    post.orgAudience === 'DEPARTMENT' ||
    post.isPublic === false;

  if (!isNonPublic) return true;
  if (!viewerUid) return false;
  if (post.authorId === viewerUid) return true;
  if (isOrgFeedAdminOrLeader(membership, org, viewerUid)) return true;

  const isActiveMember = membership?.status === 'ACTIVE';
  if (!isActiveMember) return false;

  const deptIds = new Set<string>([
    ...(post.orgDepartmentIds || []),
    ...(post.orgDepartmentId ? [post.orgDepartmentId] : []),
  ]);
  const groupIds = post.orgGroupIds || [];
  const rosterGroups = post.orgRosterGroups || [];

  // If no specific department, group, or roster group is targeted, it's an org-wide Members-Only post
  if (deptIds.size === 0 && groupIds.length === 0 && rosterGroups.length === 0) {
    return true;
  }

  const memberMinistries = getMemberMinistryIdSet(membership, org, viewerUid);

  // Check department match
  for (const dId of deptIds) {
    if (memberMinistries.has(dId)) return true;
  }

  // Check group / sub-group match
  for (const gId of groupIds) {
    if (gId.startsWith('room:')) {
      const parts = gId.split(':');
      const deptId = parts[1];
      if (deptId && memberMinistries.has(deptId)) return true;
    } else if (gId.startsWith('roster:')) {
      const rKey = gId.replace('roster:', '') as RosterGroup;
      const myRoster = membership?.rosterGroup || getElevateRole(membership?.roleKey)?.rosterGroup || 'MEMBER';
      if (myRoster === rKey) return true;
    } else if (gId.startsWith('channel:')) {
      return true;
    } else if (memberMinistries.has(gId)) {
      return true;
    }
  }

  // Check roster group match
  if (rosterGroups.length > 0) {
    const myRoster = membership?.rosterGroup || getElevateRole(membership?.roleKey)?.rosterGroup || 'MEMBER';
    if (rosterGroups.includes(myRoster)) return true;
  }

  return false;
}

interface OrgAudienceToggleProps {
  value: OrgPostAudience;
  onChange: (v: OrgPostAudience) => void;
  /** Optional organization object (or orgId via `orgId` prop) to load departments & sub-groups. */
  org?: Organization | null;
  orgId?: string;
  /** Rich target state for department & sub-group selection. */
  target?: OrgPostTarget;
  onTargetChange?: (target: OrgPostTarget) => void;
  onOrgUpdated?: (org: Organization) => void;
  className?: string;
}

const OrgAudienceToggle: React.FC<OrgAudienceToggleProps> = ({
  value,
  onChange,
  org: orgProp,
  orgId,
  target: controlledTarget,
  onTargetChange,
  onOrgUpdated,
  className = '',
}) => {
  const [loadedOrg, setLoadedOrg] = useState<Organization | null>(orgProp || null);
  const org = orgProp || loadedOrg;

  useEffect(() => {
    if (orgProp) {
      setLoadedOrg(orgProp);
      return;
    }
    const idToLoad = orgId;
    if (!idToLoad) return;
    let alive = true;
    fetchOrganization(idToLoad)
      .then(o => { if (alive && o) setLoadedOrg(o); })
      .catch(() => {});
    return () => { alive = false; };
  }, [orgProp, orgId]);

  const [internalTarget, setInternalTarget] = useState<OrgPostTarget>(() =>
    controlledTarget || defaultOrgPostTarget(value)
  );
  const target = controlledTarget || internalTarget;

  const [openMenu, setOpenMenu] = useState<null | 'DEPARTMENTS' | 'SUBGROUPS'>(null);
  const [newItemName, setNewItemName] = useState('');
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenu]);

  const { departments, subGroups } = useMemo(() => extractOrgDepartmentsAndGroups(org), [org]);

  const canManageMinistries = useMemo(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !org) return false;
    return (
      org.ownerId === uid ||
      org.accountUid === uid ||
      !!org.adminUids?.includes(uid) ||
      !!org.pastorUids?.includes(uid)
    );
  }, [org]);

  const updateTarget = (next: OrgPostTarget) => {
    setInternalTarget(next);
    onTargetChange?.(next);
    onChange(next.orgAudience);
  };

  const computeLabels = (
    deptIds: string[],
    grpIds: string[],
    rostGroups: RosterGroup[],
  ): string[] => {
    const labels: string[] = [];
    for (const id of deptIds) {
      const d = departments.find(x => x.id === id) || org?.ministries?.find(x => x.id === id);
      if (d) labels.push(d.name);
    }
    for (const id of grpIds) {
      const g = subGroups.find(x => x.id === id);
      if (g) labels.push(g.label);
    }
    for (const r of rostGroups) {
      const ro = ROSTER_GROUP_OPTIONS.find(x => x.key === r);
      if (ro && !grpIds.includes(`roster:${r}`)) {
        labels.push(!org?.orgType || org.orgType === 'CHURCH' ? ro.churchLabel : ro.label);
      }
    }
    return labels;
  };

  const selectSimpleMode = (mode: 'PUBLIC' | 'MEMBERS' | 'INTERNAL') => {
    setOpenMenu(null);
    const orgAudience: OrgPostAudience =
      mode === 'PUBLIC' ? 'PUBLIC' : mode === 'MEMBERS' ? 'MEMBERS' : 'INTERNAL';
    updateTarget({
      mode,
      orgAudience,
      departmentIds: [],
      groupIds: [],
      rosterGroups: [],
      targetLabels: mode === 'INTERNAL' ? ['Members Only'] : [],
    });
  };

  const toggleDepartment = (deptId: string) => {
    const exists = target.departmentIds.includes(deptId);
    const nextDepts = exists
      ? target.departmentIds.filter(id => id !== deptId)
      : [...target.departmentIds, deptId];
    const nextLabels = computeLabels(nextDepts, target.groupIds, target.rosterGroups);
    updateTarget({
      mode: 'DEPARTMENTS',
      orgAudience: 'INTERNAL',
      departmentIds: nextDepts,
      groupIds: target.groupIds,
      rosterGroups: target.rosterGroups,
      targetLabels: nextLabels,
    });
  };

  const toggleSubGroup = (opt: OrgSubGroupOption) => {
    const exists = target.groupIds.includes(opt.id);
    const nextGroups = exists
      ? target.groupIds.filter(id => id !== opt.id)
      : [...target.groupIds, opt.id];
    let nextRosters = [...target.rosterGroups];
    if (opt.rosterGroup) {
      nextRosters = exists
        ? nextRosters.filter(r => r !== opt.rosterGroup)
        : Array.from(new Set([...nextRosters, opt.rosterGroup]));
    }
    const nextLabels = computeLabels(target.departmentIds, nextGroups, nextRosters);
    updateTarget({
      mode: 'SUBGROUPS',
      orgAudience: 'INTERNAL',
      departmentIds: target.departmentIds,
      groupIds: nextGroups,
      rosterGroups: nextRosters,
      roomId: opt.roomId || target.roomId,
      targetLabels: nextLabels,
    });
  };

  const handleQuickCreate = async (kind: 'DEPARTMENT' | 'MINISTRY') => {
    if (!org || !newItemName.trim() || creating) return;
    setCreating(true);
    try {
      const created = newMinistry(newItemName.trim(), kind, {
        threadAudience: 'DEPARTMENT',
      });
      const updatedMinistries = [...(org.ministries || []), created];
      await saveMinistries(org.id, updatedMinistries);
      const updatedOrg = { ...org, ministries: updatedMinistries };
      setLoadedOrg(updatedOrg);
      onOrgUpdated?.(updatedOrg);
      setNewItemName('');
      if (kind === 'DEPARTMENT') {
        const nextDepts = [...target.departmentIds, created.id];
        updateTarget({
          mode: 'DEPARTMENTS',
          orgAudience: 'INTERNAL',
          departmentIds: nextDepts,
          groupIds: target.groupIds,
          rosterGroups: target.rosterGroups,
          targetLabels: [...target.targetLabels, created.name],
        });
      } else {
        const nextGroups = [...target.groupIds, created.id];
        updateTarget({
          mode: 'SUBGROUPS',
          orgAudience: 'INTERNAL',
          departmentIds: target.departmentIds,
          groupIds: nextGroups,
          rosterGroups: target.rosterGroups,
          targetLabels: [...target.targetLabels, created.name],
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const groupedSubGroups = useMemo(() => {
    const map = new Map<string, OrgSubGroupOption[]>();
    for (const item of subGroups) {
      const list = map.get(item.categoryLabel) || [];
      list.push(item);
      map.set(item.categoryLabel, list);
    }
    return Array.from(map.entries());
  }, [subGroups]);

  return (
    <div ref={wrapRef} className={`relative space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/40 mr-1">
          Feed Target
        </span>

        {/* 1. Public */}
        <button
          type="button"
          onClick={() => selectSimpleMode('PUBLIC')}
          title="Public: appears on the public timeline & org page; anyone signed in can comment."
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
            target.mode === 'PUBLIC'
              ? 'bg-white text-black border-white'
              : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
          }`}
        >
          <Globe size={10} /> Public
        </button>

        {/* 2. Public + Members Comment */}
        <button
          type="button"
          onClick={() => selectSimpleMode('MEMBERS')}
          title="Members Comment: readable on the org page; only members & followers may comment."
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
            target.mode === 'MEMBERS'
              ? 'bg-white text-black border-white'
              : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
          }`}
        >
          <Users size={10} /> Members
        </button>

        {/* 3. Members Only (Non-Public) */}
        <button
          type="button"
          onClick={() => selectSimpleMode('INTERNAL')}
          title="Members Only (Non-Public): private to active members & leaders of this organization."
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
            target.mode === 'INTERNAL'
              ? 'bg-[#7A1FC0] text-white border-[#D0BCFF]/60'
              : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
          }`}
        >
          <Lock size={10} /> Members Only
        </button>

        {/* 4. Specific Departments Dropdown */}
        <button
          type="button"
          onClick={() => {
            setOpenMenu(m => (m === 'DEPARTMENTS' ? null : 'DEPARTMENTS'));
            if (target.mode !== 'DEPARTMENTS') {
              updateTarget({
                ...target,
                mode: 'DEPARTMENTS',
                orgAudience: 'INTERNAL',
              });
            }
          }}
          title="Share to one or more specific Departments (non-public)."
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
            target.mode === 'DEPARTMENTS' || target.departmentIds.length > 0
              ? 'bg-[#7A1FC0] text-white border-[#D0BCFF]/60'
              : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
          }`}
        >
          <Building2 size={10} />
          Departments
          {target.departmentIds.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-black/35 text-[#D0BCFF] text-[8px]">
              {target.departmentIds.length}
            </span>
          )}
          <ChevronDown size={10} />
        </button>

        {/* 5. Specific Sub-Groups / Ministry Groups / Roster Groups Dropdown */}
        <button
          type="button"
          onClick={() => {
            setOpenMenu(m => (m === 'SUBGROUPS' ? null : 'SUBGROUPS'));
            if (target.mode !== 'SUBGROUPS') {
              updateTarget({
                ...target,
                mode: 'SUBGROUPS',
                orgAudience: 'INTERNAL',
              });
            }
          }}
          title="Share to specific Sub-Groups (Ministry Groups, Department Rooms, Leadership/Staff/Volunteer Groups)."
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
            target.mode === 'SUBGROUPS' || target.groupIds.length > 0 || target.rosterGroups.length > 0
              ? 'bg-[#7A1FC0] text-white border-[#D0BCFF]/60'
              : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
          }`}
        >
          <Layers size={10} />
          Sub-Groups
          {target.groupIds.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-black/35 text-[#D0BCFF] text-[8px]">
              {target.groupIds.length}
            </span>
          )}
          <ChevronDown size={10} />
        </button>
      </div>

      {/* Selected Department / Sub-Group Chips */}
      {(target.departmentIds.length > 0 || target.groupIds.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF]/70">
            Sharing to:
          </span>
          {target.departmentIds.map(dId => {
            const dept = departments.find(d => d.id === dId) || org?.ministries?.find(d => d.id === dId);
            const label = dept ? `${dept.iconEmoji ? `${dept.iconEmoji} ` : ''}${dept.name}` : dId;
            return (
              <span
                key={`dept-${dId}`}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-[#7A1FC0]/30 border border-[#D0BCFF]/40 text-[9px] font-bold text-[#EADDFF]"
              >
                <Building2 size={9} />
                {label}
                <button
                  type="button"
                  onClick={() => toggleDepartment(dId)}
                  className="w-3.5 h-3.5 rounded-full hover:bg-white/20 flex items-center justify-center"
                >
                  <X size={8} />
                </button>
              </span>
            );
          })}
          {target.groupIds.map(gId => {
            const grp = subGroups.find(g => g.id === gId);
            const label = grp?.label || gId;
            return (
              <span
                key={`grp-${gId}`}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-[#7A1FC0]/30 border border-[#D0BCFF]/40 text-[9px] font-bold text-[#EADDFF]"
              >
                <Layers size={9} />
                {label}
                <button
                  type="button"
                  onClick={() => grp && toggleSubGroup(grp)}
                  className="w-3.5 h-3.5 rounded-full hover:bg-white/20 flex items-center justify-center"
                >
                  <X size={8} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown Popover for Departments */}
      {openMenu === 'DEPARTMENTS' && (
        <div className="z-50 mt-1 w-full max-w-md rounded-2xl bg-[#13111C] border border-[#D0BCFF]/25 shadow-2xl p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white">
                Select Department Feed(s)
              </p>
              <p className="text-[9px] text-white/45">
                Only members & leaders of the selected department(s) can view
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenMenu(null)}
              className="p-1 text-white/40 hover:text-white rounded-lg"
            >
              <X size={13} />
            </button>
          </div>

          {departments.length === 0 ? (
            <p className="text-[11px] text-white/45 py-2">
              No departments configured yet.
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
              {departments.map(dept => {
                const checked = target.departmentIds.includes(dept.id);
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => toggleDepartment(dept.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold transition-all ${
                      checked
                        ? 'bg-[#7A1FC0]/30 text-white border border-[#D0BCFF]/40'
                        : 'bg-white/[0.03] text-white/75 hover:bg-white/[0.07] border border-transparent'
                    }`}
                  >
                    <span className="truncate">
                      {dept.iconEmoji ? `${dept.iconEmoji} ` : ''}
                      {dept.name}
                    </span>
                    <span
                      className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                        checked
                          ? 'bg-[#D0BCFF] border-[#D0BCFF] text-black'
                          : 'border-white/25'
                      }`}
                    >
                      {checked && <Check size={10} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {canManageMinistries && org && (
            <div className="pt-2 border-t border-white/10 flex items-center gap-1.5">
              <input
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleQuickCreate('DEPARTMENT');
                  }
                }}
                placeholder="New department name…"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 outline-none"
              />
              <button
                type="button"
                disabled={!newItemName.trim() || creating}
                onClick={() => void handleQuickCreate('DEPARTMENT')}
                className="px-2.5 py-1.5 rounded-xl bg-[#D0BCFF] text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1"
              >
                <Plus size={11} /> Add
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dropdown Popover for Sub-Groups */}
      {openMenu === 'SUBGROUPS' && (
        <div className="z-50 mt-1 w-full max-w-md rounded-2xl bg-[#13111C] border border-[#D0BCFF]/25 shadow-2xl p-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white">
                Select Sub-Group(s) & Ministry Feeds
              </p>
              <p className="text-[9px] text-white/45">
                Share directly with specific ministries, sub-rooms, or role groups
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenMenu(null)}
              className="p-1 text-white/40 hover:text-white rounded-lg"
            >
              <X size={13} />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
            {groupedSubGroups.map(([catLabel, items]) => (
              <div key={catLabel} className="space-y-1">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#D0BCFF]/60 px-1">
                  {catLabel}
                </p>
                {items.map(opt => {
                  const checked = target.groupIds.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleSubGroup(opt)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold transition-all ${
                        checked
                          ? 'bg-[#7A1FC0]/30 text-white border border-[#D0BCFF]/40'
                          : 'bg-white/[0.03] text-white/75 hover:bg-white/[0.07] border border-transparent'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      <span
                        className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                          checked
                            ? 'bg-[#D0BCFF] border-[#D0BCFF] text-black'
                            : 'border-white/25'
                        }`}
                      >
                        {checked && <Check size={10} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {canManageMinistries && org && (
            <div className="pt-2 border-t border-white/10 flex items-center gap-1.5">
              <input
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleQuickCreate('MINISTRY');
                  }
                }}
                placeholder="New ministry / sub-group name…"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 outline-none"
              />
              <button
                type="button"
                disabled={!newItemName.trim() || creating}
                onClick={() => void handleQuickCreate('MINISTRY')}
                className="px-2.5 py-1.5 rounded-xl bg-[#D0BCFF] text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1"
              >
                <Plus size={11} /> Add Group
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrgAudienceToggle;
