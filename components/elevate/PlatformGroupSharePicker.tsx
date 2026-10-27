// PlatformGroupSharePicker — Universal feed, department, sub-group & community destination picker
// for the Platform Share UI (`ShareButton`, `ShareToPlajahComposer`, `PostCard` Send-to-Group).
//
// Enables:
// 1. Organizations (and org leaders/members) to choose which org feeds a share goes to:
//    • Public feed (`PUBLIC`)
//    • Members feed (`MEMBERS` — public read, members comment)
//    • Members-Only Non-Public feed (`INTERNAL` — private to org members)
//    • Specific Department(s) (dropdown of departments)
//    • Specific Sub-Group(s) (dropdown of ministry groups, department sub-rooms, roster groups, channels)
// 2. ANY account to share directly to any group they are part of from a dropdown in the Platform Share UI:
//    • Clubs they belong to
//    • Organization Departments & Sub-Groups / Ministries / Rooms / Roster Groups they belong to
//    • Sanctuaries they run or belong to
//    • Business pages they manage

import React, { useEffect, useMemo, useState } from 'react';
import {
  Globe, Users, Lock, Building2, Layers, Gem, ChevronDown, Check, X, Sparkles, Search,
} from 'lucide-react';
import { auth } from '../../services/firebase';
import { createPost, createClubPost, createOrgPost, fetchUserClubs } from '../../services/backendService';
import { createSanctuaryPost, fetchUserSanctuaries } from '../../services/sanctuaryService';
import { fetchUserOrganizations, fetchUserMemberships } from '../../services/organizationService';
import { fetchMyBusinessPages } from '../../services/businessService';
import { elevateCan, getElevateRole } from '../../services/elevateRoles';
import { useActiveIdentity } from '../../contexts/ActiveIdentityContext';
import type { Club, Organization, OrgMembership, Post, RosterGroup } from '../../types';
import {
  extractOrgDepartmentsAndGroups,
  getMemberMinistryIdSet,
  isOrgFeedAdminOrLeader,
} from './OrgAudienceToggle';

export interface ShareDestinationItem {
  key: string;
  kind:
    | 'personal_feed'
    | 'org_public'
    | 'org_members'
    | 'org_internal'
    | 'org_department'
    | 'org_subgroup'
    | 'club'
    | 'sanctuary'
    | 'business';
  label: string;
  sublabel?: string;
  orgId?: string;
  orgName?: string;
  orgPhoto?: string;
  postAsOrg?: boolean;
  departmentId?: string;
  groupId?: string;
  rosterGroup?: RosterGroup;
  roomId?: string;
  clubId?: string;
  sanctuaryId?: string;
  businessId?: string;
  businessPhoto?: string;
}

export interface SharePayload {
  text: string;
  url?: string;
  title?: string;
  imageUrl?: string;
  media?: Post['media'];
  poll?: any;
  tags?: string[];
}

export async function publishToShareDestinations(
  destinations: ShareDestinationItem[],
  payload: SharePayload,
): Promise<void> {
  const user = auth.currentUser;
  if (!user || destinations.length === 0) return;

  const baseText = payload.url && !payload.text.includes(payload.url)
    ? `${payload.text ? `${payload.text}\n\n` : ''}${payload.url}`
    : payload.text;

  const media: Post['media'] = payload.media?.length
    ? payload.media
    : payload.imageUrl
    ? [{ type: 'PHOTO', url: payload.imageUrl, title: payload.title }]
    : undefined;

  // Group org targets by (orgId + audience category) so multiple departments/sub-groups in the same org
  // can be combined cleanly into a single targeted org post instead of spamming duplicates.
  const orgInternalGroups = new Map<
    string,
    {
      orgId: string;
      orgName: string;
      orgPhoto: string;
      postAsOrg: boolean;
      departmentIds: string[];
      groupIds: string[];
      rosterGroups: RosterGroup[];
      roomId?: string;
      labels: string[];
       includeAllMembers: boolean;
    }
  >();

  const tasks: Promise<any>[] = [];

  for (const dest of destinations) {
    if (dest.kind === 'personal_feed') {
      tasks.push(
        createPost({
          text: baseText,
          isPublic: true,
          ...(media ? { media } : {}),
          ...(payload.tags?.length ? { tags: payload.tags } : {}),
        } as Partial<Post>),
      );
    } else if (dest.kind === 'org_public' && dest.orgId) {
      tasks.push(
        createOrgPost(dest.orgId, dest.orgName || 'Organization', dest.orgPhoto || '', {
          text: baseText,
          isPublic: true,
          orgAudience: 'PUBLIC',
          ...(media ? { media } : {}),
          ...(payload.tags?.length ? { tags: payload.tags } : {}),
        }),
      );
    } else if (dest.kind === 'org_members' && dest.orgId) {
      tasks.push(
        createOrgPost(dest.orgId, dest.orgName || 'Organization', dest.orgPhoto || '', {
          text: baseText,
          isPublic: true,
          orgAudience: 'MEMBERS',
          orgTargetLabels: ['Members'],
          ...(media ? { media } : {}),
          ...(payload.tags?.length ? { tags: payload.tags } : {}),
        }),
      );
    } else if (
      (dest.kind === 'org_internal' ||
        dest.kind === 'org_department' ||
        dest.kind === 'org_subgroup') &&
      dest.orgId
    ) {
      const existing = orgInternalGroups.get(dest.orgId) || {
        orgId: dest.orgId,
        orgName: dest.orgName || 'Organization',
        orgPhoto: dest.orgPhoto || '',
        postAsOrg: !!dest.postAsOrg,
        departmentIds: [],
        groupIds: [],
        rosterGroups: [],
        labels: [],
        includeAllMembers: false,
      };
      if (dest.kind === 'org_internal') {
        existing.includeAllMembers = true;
        existing.labels.push('Members Only');
      } else if (dest.kind === 'org_department' && dest.departmentId) {
        if (!existing.departmentIds.includes(dest.departmentId)) {
          existing.departmentIds.push(dest.departmentId);
        }
        existing.labels.push(dest.label);
      } else if (dest.kind === 'org_subgroup' && dest.groupId) {
        if (!existing.groupIds.includes(dest.groupId)) {
          existing.groupIds.push(dest.groupId);
        }
        if (dest.rosterGroup && !existing.rosterGroups.includes(dest.rosterGroup)) {
          existing.rosterGroups.push(dest.rosterGroup);
        }
        if (dest.roomId) existing.roomId = dest.roomId;
        existing.labels.push(dest.label);
      }
      orgInternalGroups.set(dest.orgId, existing);
    } else if (dest.kind === 'club' && dest.clubId) {
      const attachments = media?.map(m => ({
        type: (m.type === 'PHOTO' || m.type === 'VIDEO' || m.type === 'AUDIO' ? m.type : 'LINK') as any,
        url: m.url || payload.url || '',
        title: m.title || payload.title,
        thumbnailUrl: m.thumbnail,
      }));
      tasks.push(
        createClubPost({
          clubId: dest.clubId,
          content: baseText,
          type: 'POST',
          ...(attachments?.length ? { attachments } : {}),
        }),
      );
    } else if (dest.kind === 'sanctuary' && dest.sanctuaryId) {
      const attachments = media?.map(m => ({
        type: m.type as any,
        url: m.url || payload.url || '',
        title: m.title || payload.title,
        thumbnailUrl: m.thumbnail,
      }));
      tasks.push(
        createSanctuaryPost({
          sanctuaryId: dest.sanctuaryId,
          content: baseText,
          accessType: 'FREE',
          ...(attachments?.length ? { attachments } : {}),
        }),
      );
    } else if (dest.kind === 'business' && dest.businessId) {
      tasks.push(
        createOrgPost(dest.businessId, dest.label, dest.businessPhoto || '', {
          text: baseText,
          isPublic: true,
          ...(media ? { media } : {}),
        }),
      );
    }
  }

  for (const grp of orgInternalGroups.values()) {
    const authorName = grp.postAsOrg
      ? grp.orgName
      : user.displayName || grp.orgName;
    const authorPhoto = grp.postAsOrg
      ? grp.orgPhoto
      : user.photoURL || grp.orgPhoto;

    // If "Members Only (All)" was selected without restricting to specific depts/groups, keep it org-wide internal;
    // if specific departments or sub-groups were chosen, attach their IDs so it targets those feeds.
    tasks.push(
      createOrgPost(grp.orgId, authorName, authorPhoto, {
        text: baseText,
        isPublic: false,
        orgAudience: 'INTERNAL',
        ...(grp.departmentIds[0] ? { orgDepartmentId: grp.departmentIds[0] } : {}),
        ...(grp.departmentIds.length ? { orgDepartmentIds: grp.departmentIds } : {}),
        ...(grp.groupIds.length ? { orgGroupIds: grp.groupIds } : {}),
        ...(grp.rosterGroups.length ? { orgRosterGroups: grp.rosterGroups } : {}),
        ...(grp.roomId ? { orgRoomId: grp.roomId } : {}),
        orgTargetLabels: Array.from(new Set(grp.labels)),
        ...(media ? { media } : {}),
        ...(payload.tags?.length ? { tags: payload.tags } : {}),
      }),
    );
  }

  await Promise.all(tasks);
}

interface PlatformGroupSharePickerProps {
  selected: ShareDestinationItem[];
  onChange: (items: ShareDestinationItem[]) => void;
  /** Compact layout for ShareButton modal */
  compact?: boolean;
  /** Default select personal feed or active org feed on mount */
  autoSelectDefault?: boolean;
}

export const PlatformGroupSharePicker: React.FC<PlatformGroupSharePickerProps> = ({
  selected,
  onChange,
  compact = false,
  autoSelectDefault = true,
}) => {
  const { activeOrg } = useActiveIdentity();
  const uid = auth.currentUser?.uid;

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [sanctuaries, setSanctuaries] = useState<{ id: string; name: string }[]>([]);
  const [businesses, setBusinesses] = useState<{ id: string; name: string; photo?: string }[]>([]);

  const [selectedOrgId, setSelectedOrgId] = useState<string>(activeOrg?.id || '');
  const [deptDropOpen, setDeptDropOpen] = useState(false);
  const [subGroupDropOpen, setSubGroupDropOpen] = useState(false);
  const [anyGroupDropOpen, setAnyGroupDropOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    Promise.all([
      fetchUserOrganizations(uid).catch(() => []),
      fetchUserMemberships(uid).catch(() => []),
      fetchUserClubs(uid).catch(() => []),
      fetchUserSanctuaries(uid).catch(() => []),
      fetchMyBusinessPages().catch(() => []),
    ]).then(([orgList, memList, clubList, sancList, bizList]) => {
      if (!alive) return;
      setOrgs(orgList);
      setMemberships(memList.filter(m => m.status === 'ACTIVE'));
      setClubs(clubList);
      setSanctuaries(sancList.map(s => ({ id: s.id, name: s.name })));
      setBusinesses(bizList.map(b => ({ id: b.id, name: b.businessName, photo: b.logoUrl })));

      const initialOrg = activeOrg || orgList[0];
      if (initialOrg && !selectedOrgId) {
        setSelectedOrgId(initialOrg.id);
      }

      if (autoSelectDefault && selected.length === 0) {
        if (activeOrg) {
          onChange([
            {
              key: `org_public:${activeOrg.id}`,
              kind: 'org_public',
              label: `${activeOrg.name} · Public`,
              orgId: activeOrg.id,
              orgName: activeOrg.name,
              orgPhoto: activeOrg.logoUrl,
              postAsOrg: true,
            },
          ]);
        } else {
          onChange([
            {
              key: 'personal_feed',
              kind: 'personal_feed',
              label: 'My Public Feed',
            },
          ]);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [uid, activeOrg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentOrg = useMemo(
    () => orgs.find(o => o.id === selectedOrgId) || activeOrg || orgs[0] || null,
    [orgs, selectedOrgId, activeOrg],
  );

  const currentMembership = useMemo(
    () => (currentOrg ? memberships.find(m => m.orgId === currentOrg.id) || null : null),
    [memberships, currentOrg],
  );

  const canPostAsCurrentOrg = useMemo(() => {
    if (!currentOrg || !uid) return false;
    if (isOrgFeedAdminOrLeader(currentMembership, currentOrg, uid)) return true;
    return elevateCan(currentMembership, currentOrg, 'POST_AS_ORG');
  }, [currentOrg, currentMembership, uid]);

  // Extract departments and sub-groups for the currently focused org (filtered to those the user belongs to unless leader/admin)
  const { orgDepartments, orgSubGroups } = useMemo(() => {
    if (!currentOrg) return { orgDepartments: [], orgSubGroups: [] };
    const { departments, subGroups } = extractOrgDepartmentsAndGroups(currentOrg);
    const isLeader = isOrgFeedAdminOrLeader(currentMembership, currentOrg, uid) || canPostAsCurrentOrg;
    if (isLeader) {
      return { orgDepartments: departments, orgSubGroups: subGroups };
    }
    const myMinIds = getMemberMinistryIdSet(currentMembership, currentOrg, uid);
    const myRoster =
      currentMembership?.rosterGroup ||
      getElevateRole(currentMembership?.roleKey)?.rosterGroup ||
      'MEMBER';
    return {
      orgDepartments: departments.filter(d => myMinIds.has(d.id)),
      orgSubGroups: subGroups.filter(sg => {
        if (sg.category === 'ROSTER') return sg.rosterGroup === myRoster || sg.rosterGroup === 'MEMBER';
        if (sg.departmentId) return myMinIds.has(sg.departmentId);
        return true;
      }),
    };
  }, [currentOrg, currentMembership, uid, canPostAsCurrentOrg]);

  // Build universal list of ALL groups the account belongs to across all orgs, clubs, sanctuaries, businesses
  const allAccountGroupOptions = useMemo(() => {
    const items: ShareDestinationItem[] = [];
    for (const o of orgs) {
      const mem = memberships.find(m => m.orgId === o.id) || null;
      const isLeader = isOrgFeedAdminOrLeader(mem, o, uid) || elevateCan(mem, o, 'POST_AS_ORG');
      const myMinIds = getMemberMinistryIdSet(mem, o, uid);
      const { departments, subGroups } = extractOrgDepartmentsAndGroups(o);

      // Org Members-Only Feed
      items.push({
        key: `org_internal:${o.id}`,
        kind: 'org_internal',
        label: `${o.name} · Members Only`,
        sublabel: 'Organization Members Feed',
        orgId: o.id,
        orgName: o.name,
        orgPhoto: o.logoUrl,
        postAsOrg: isLeader,
      });

      // Org Departments user belongs to
      for (const d of departments) {
        if (isLeader || myMinIds.has(d.id)) {
          items.push({
            key: `org_dept:${o.id}:${d.id}`,
            kind: 'org_department',
            label: `${d.iconEmoji ? `${d.iconEmoji} ` : ''}${d.name}`,
            sublabel: `${o.name} · Department`,
            orgId: o.id,
            orgName: o.name,
            orgPhoto: o.logoUrl,
            postAsOrg: isLeader,
            departmentId: d.id,
          });
        }
      }

      // Org Sub-Groups user belongs to
      for (const sg of subGroups) {
        const allowed =
          isLeader ||
          (sg.departmentId ? myMinIds.has(sg.departmentId) : true);
        if (allowed) {
          items.push({
            key: `org_sub:${o.id}:${sg.id}`,
            kind: 'org_subgroup',
            label: sg.label,
            sublabel: `${o.name} · ${sg.categoryLabel}`,
            orgId: o.id,
            orgName: o.name,
            orgPhoto: o.logoUrl,
            postAsOrg: isLeader,
            groupId: sg.id,
            rosterGroup: sg.rosterGroup,
            roomId: sg.roomId,
          });
        }
      }
    }

    // Clubs user belongs to
    for (const c of clubs) {
      items.push({
        key: `club:${c.id}`,
        kind: 'club',
        label: c.name,
        sublabel: 'Club Group',
        clubId: c.id,
      });
    }

    // Sanctuaries
    for (const s of sanctuaries) {
      items.push({
        key: `sanctuary:${s.id}`,
        kind: 'sanctuary',
        label: s.name,
        sublabel: 'Sanctuary Community',
        sanctuaryId: s.id,
      });
    }

    // Businesses
    for (const b of businesses) {
      items.push({
        key: `business:${b.id}`,
        kind: 'business',
        label: b.name,
        sublabel: 'Business Page',
        businessId: b.id,
        businessPhoto: b.photo,
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      i =>
        i.label.toLowerCase().includes(q) ||
        (i.sublabel && i.sublabel.toLowerCase().includes(q)),
    );
  }, [orgs, memberships, clubs, sanctuaries, businesses, uid, searchQuery]);

  const isSelected = (key: string) => selected.some(s => s.key === key);

  const toggleItem = (item: ShareDestinationItem) => {
    if (isSelected(item.key)) {
      onChange(selected.filter(s => s.key !== item.key));
    } else {
      onChange([...selected, item]);
    }
  };

  return (
    <div className="space-y-2.5 text-left">
      {/* Top Row: Personal Feed + Organization Feed Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/45">
          Share to Feeds & Groups
        </span>
        {orgs.length > 1 && (
          <select
            value={currentOrg?.id || ''}
            onChange={e => setSelectedOrgId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-2 py-1 text-[10px] font-bold text-white outline-none"
          >
            {orgs.map(o => (
              <option key={o.id} value={o.id} className="bg-[#121218] text-white">
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Primary Feed Pills: My Feed + Org Public / Members / Members-Only / Departments / Sub-Groups */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() =>
            toggleItem({
              key: 'personal_feed',
              kind: 'personal_feed',
              label: 'My Public Feed',
            })
          }
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
            isSelected('personal_feed')
              ? 'bg-small-orange text-black border-small-orange'
              : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
          }`}
        >
          <Sparkles size={10} /> My Feed
        </button>

        {currentOrg && canPostAsCurrentOrg && (
          <>
            <button
              type="button"
              onClick={() =>
                toggleItem({
                  key: `org_public:${currentOrg.id}`,
                  kind: 'org_public',
                  label: `${currentOrg.name} · Public`,
                  orgId: currentOrg.id,
                  orgName: currentOrg.name,
                  orgPhoto: currentOrg.logoUrl,
                  postAsOrg: true,
                })
              }
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                isSelected(`org_public:${currentOrg.id}`)
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              <Globe size={10} /> Org Public
            </button>

            <button
              type="button"
              onClick={() =>
                toggleItem({
                  key: `org_members:${currentOrg.id}`,
                  kind: 'org_members',
                  label: `${currentOrg.name} · Members`,
                  orgId: currentOrg.id,
                  orgName: currentOrg.name,
                  orgPhoto: currentOrg.logoUrl,
                  postAsOrg: true,
                })
              }
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                isSelected(`org_members:${currentOrg.id}`)
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              <Users size={10} /> Members
            </button>
          </>
        )}

        {currentOrg && (
          <>
            <button
              type="button"
              onClick={() =>
                toggleItem({
                  key: `org_internal:${currentOrg.id}`,
                  kind: 'org_internal',
                  label: `${currentOrg.name} · Members Only`,
                  orgId: currentOrg.id,
                  orgName: currentOrg.name,
                  orgPhoto: currentOrg.logoUrl,
                  postAsOrg: canPostAsCurrentOrg,
                })
              }
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                isSelected(`org_internal:${currentOrg.id}`)
                  ? 'bg-[#7A1FC0] text-white border-[#D0BCFF]/60'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              <Lock size={10} /> Members Only
            </button>

            {/* Departments Dropdown Trigger */}
            {orgDepartments.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDeptDropOpen(v => !v);
                  setSubGroupDropOpen(false);
                  setAnyGroupDropOpen(false);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                  deptDropOpen || selected.some(s => s.kind === 'org_department' && s.orgId === currentOrg.id)
                    ? 'bg-[#7A1FC0] text-white border-[#D0BCFF]/60'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                <Building2 size={10} /> Departments <ChevronDown size={10} />
              </button>
            )}

            {/* Sub-Groups Dropdown Trigger */}
            {orgSubGroups.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSubGroupDropOpen(v => !v);
                  setDeptDropOpen(false);
                  setAnyGroupDropOpen(false);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                  subGroupDropOpen || selected.some(s => s.kind === 'org_subgroup' && s.orgId === currentOrg.id)
                    ? 'bg-[#7A1FC0] text-white border-[#D0BCFF]/60'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                <Layers size={10} /> Sub-Groups <ChevronDown size={10} />
              </button>
            )}
          </>
        )}

        {/* Universal "My Groups & Communities" Dropdown for ANY account */}
        <button
          type="button"
          onClick={() => {
            setAnyGroupDropOpen(v => !v);
            setDeptDropOpen(false);
            setSubGroupDropOpen(false);
          }}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
            anyGroupDropOpen || selected.some(s => s.kind === 'club' || s.kind === 'sanctuary' || s.kind === 'business')
              ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
              : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
          }`}
        >
          <Users size={10} /> All My Groups <ChevronDown size={10} />
        </button>
      </div>

      {/* Departments Dropdown List */}
      {deptDropOpen && currentOrg && (
        <div className="rounded-2xl bg-[#14121D] border border-[#D0BCFF]/25 p-2.5 space-y-1 max-h-44 overflow-y-auto">
          <div className="flex items-center justify-between px-1 pb-1 border-b border-white/10">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#D0BCFF]">
              {currentOrg.name} · Departments
            </span>
            <button type="button" onClick={() => setDeptDropOpen(false)} className="text-white/40 hover:text-white">
              <X size={12} />
            </button>
          </div>
          {orgDepartments.map(d => {
            const key = `org_dept:${currentOrg.id}:${d.id}`;
            const on = isSelected(key);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() =>
                  toggleItem({
                    key,
                    kind: 'org_department',
                    label: `${d.iconEmoji ? `${d.iconEmoji} ` : ''}${d.name}`,
                    sublabel: `${currentOrg.name} · Department`,
                    orgId: currentOrg.id,
                    orgName: currentOrg.name,
                    orgPhoto: currentOrg.logoUrl,
                    postAsOrg: canPostAsCurrentOrg,
                    departmentId: d.id,
                  })
                }
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-[11px] font-bold transition-all ${
                  on ? 'bg-[#7A1FC0]/35 text-white' : 'text-white/75 hover:bg-white/5'
                }`}
              >
                <span className="truncate">
                  {d.iconEmoji ? `${d.iconEmoji} ` : ''}
                  {d.name}
                </span>
                {on && <Check size={12} className="text-[#D0BCFF] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Sub-Groups Dropdown List */}
      {subGroupDropOpen && currentOrg && (
        <div className="rounded-2xl bg-[#14121D] border border-[#D0BCFF]/25 p-2.5 space-y-1 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-1 pb-1 border-b border-white/10">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#D0BCFF]">
              {currentOrg.name} · Sub-Groups & Ministries
            </span>
            <button type="button" onClick={() => setSubGroupDropOpen(false)} className="text-white/40 hover:text-white">
              <X size={12} />
            </button>
          </div>
          {orgSubGroups.map(sg => {
            const key = `org_sub:${currentOrg.id}:${sg.id}`;
            const on = isSelected(key);
            return (
              <button
                key={sg.id}
                type="button"
                onClick={() =>
                  toggleItem({
                    key,
                    kind: 'org_subgroup',
                    label: sg.label,
                    sublabel: `${currentOrg.name} · ${sg.categoryLabel}`,
                    orgId: currentOrg.id,
                    orgName: currentOrg.name,
                    orgPhoto: currentOrg.logoUrl,
                    postAsOrg: canPostAsCurrentOrg,
                    groupId: sg.id,
                    rosterGroup: sg.rosterGroup,
                    roomId: sg.roomId,
                  })
                }
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-[11px] font-bold transition-all ${
                  on ? 'bg-[#7A1FC0]/35 text-white' : 'text-white/75 hover:bg-white/5'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{sg.label}</p>
                  <p className="text-[8px] uppercase tracking-widest text-white/35 truncate">{sg.categoryLabel}</p>
                </div>
                {on && <Check size={12} className="text-[#D0BCFF] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Universal "All My Groups" Dropdown for ANY account */}
      {anyGroupDropOpen && (
        <div className="rounded-2xl bg-[#12131A] border border-white/15 p-2.5 space-y-2 max-h-56 overflow-y-auto">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/5 border border-white/10">
            <Search size={12} className="text-white/35 shrink-0" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search your groups, departments, clubs, sanctuaries…"
              className="flex-1 bg-transparent text-[11px] text-white placeholder:text-white/30 outline-none"
            />
            <button type="button" onClick={() => setAnyGroupDropOpen(false)} className="text-white/40 hover:text-white">
              <X size={12} />
            </button>
          </div>
          {allAccountGroupOptions.length === 0 ? (
            <p className="text-[10px] text-white/35 text-center py-3">
              No matching groups found.
            </p>
          ) : (
            <div className="space-y-1">
              {allAccountGroupOptions.map(item => {
                const on = isSelected(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleItem(item)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left text-[11px] font-bold transition-all ${
                      on ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{item.label}</p>
                      {item.sublabel && (
                        <p className="text-[8px] uppercase tracking-widest text-white/35 truncate">
                          {item.sublabel}
                        </p>
                      )}
                    </div>
                    {on && <Check size={12} className="text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected Destination Chips */}
      {selected.length > 0 && !compact && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {selected.map(item => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-white/10 border border-white/15 text-[9px] font-bold text-white/85"
            >
              {item.kind === 'sanctuary' ? (
                <Gem size={9} className="text-[#C9A55C]" />
              ) : item.kind.startsWith('org_') ? (
                <Building2 size={9} className="text-[#D0BCFF]" />
              ) : (
                <Users size={9} className="text-small-orange" />
              )}
              <span className="truncate max-w-[160px]">{item.label}</span>
              <button
                type="button"
                onClick={() => toggleItem(item)}
                className="w-3.5 h-3.5 rounded-full hover:bg-white/20 flex items-center justify-center"
              >
                <X size={8} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlatformGroupSharePicker;
