// components/elevate/VolunteerMemberManageHub.tsx
// Personal Organization Manage Hub for Elevate Volunteers, Non-Staff Instructors, and Congregation Members.
// Unlike the Staff Back-Office (ElevateOps), this Manage view lets a member/volunteer:
//   1. Manage their user settings, profile, notifications, and availability for this organization.
//   2. Access their Household Giving & Financial Statements Dashboard (including 4-scope IRS 501(c)(3) statements).
//   3. Manage their uploads to the departments they belong to (e.g., Christian Education, Music, Youth).
//   4. Manage their photos uploaded to the organization and its departments.

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UserCog,
  Wallet,
  FolderUp,
  Image as ImageIcon,
  Check,
  Loader2,
  Trash2,
  Upload,
  Plus,
  Calendar,
  Bell,
  Users,
  Lock,
  Unlock,
  ShieldCheck,
  Printer,
  HeartHandshake,
  FileText,
  ExternalLink,
  Camera,
  Sparkles,
} from 'lucide-react';
import type { Organization, OrgMembership, ChmsTaxStatementScope } from '../../types';
import { updateRosterEntry } from '../../services/elevateService';
import { ROLE_LABELS, getMemberEffectiveRoleKeys } from '../../services/elevateRoles';
import {
  listHqAssets,
  addHqAsset,
  deleteHqAsset,
  humanFileSize,
  type OrgAsset,
} from '../../services/orgAssets';
import {
  getDemoHouseholdKinshipGraph,
  getLocalExtendedKinshipOptIn,
  setLocalExtendedKinshipOptIn,
} from '../../services/chmsKinshipAndStatements';
import { money, openPrintWindow, statementsHtml, yearRange } from '../../services/chmsFinanceReports';
import { isDemoOrg } from '../../services/elevateTruth';

const MyGivingPanel = lazy(() => import('./chms/finance/MyGivingPanel'));

export type VolunteerManageTab =
  | 'USER_SETTINGS'
  | 'GIVING_AND_STATEMENTS'
  | 'DEPARTMENT_UPLOADS'
  | 'MY_ORG_PHOTOS';

interface OrgUserLocalPrefs {
  orgDisplayName: string;
  orgTitle: string;
  orgBio: string;
  orgAvatarUrl: string;
  preferredDays: string[];
  blockoutDates: string[];
  notifyScheduleReminders: boolean;
  notifySubRequests: boolean;
  notifyDepartmentUploads: boolean;
  notifyGivingReceipts: boolean;
}

interface LocalOrgPhotoItem {
  id: string;
  orgId: string;
  uploadedByUid: string;
  uploaderName: string;
  caption: string;
  departmentId: string;
  departmentName: string;
  dataUrl: string;
  fileName: string;
  uploadedAt: number;
}

interface LocalDeptUploadItem {
  id: string;
  orgId: string;
  uploadedByUid: string;
  name: string;
  departmentId: string;
  departmentName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedAt: number;
}

const PREFS_KEY = (orgId: string, uid: string) => `plajah_org_member_prefs_v1_${orgId}_${uid}`;
const PHOTOS_KEY = (orgId: string, uid: string) => `plajah_org_member_photos_v1_${orgId}_${uid}`;
const DEPT_UPLOADS_KEY = (orgId: string, uid: string) => `plajah_org_member_dept_uploads_v1_${orgId}_${uid}`;

export interface VolunteerMemberManageHubProps {
  org: Organization;
  membership: OrgMembership | null;
  user: any;
  onOpenGive?: () => void;
  onMembershipUpdated?: () => void;
  initialTab?: VolunteerManageTab;
}

const fieldClass =
  'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#E2C27E]/60 transition-all placeholder:text-white/30';

export const VolunteerMemberManageHub: React.FC<VolunteerMemberManageHubProps> = ({
  org,
  membership,
  user,
  onOpenGive,
  onMembershipUpdated,
  initialTab = 'USER_SETTINGS',
}) => {
  const uid = user?.uid || membership?.userId || 'member_guest';
  const demo = isDemoOrg(org);

  const [activeTab, setActiveTab] = useState<VolunteerManageTab>(initialTab);

  // Resolve departments this user belongs to (falls back to all public ministries if none assigned yet)
  const myDepartments = useMemo(() => {
    const allDepts = (org.ministries || []).filter(m => !m.isInternal);
    const assignedIds = new Set<string>([
      ...(membership?.ministryIds || []),
      ...Object.keys(membership?.ministryRoles || {}),
    ]);
    const matched = allDepts.filter(d => assignedIds.has(d.id));
    return matched.length > 0 ? matched : allDepts;
  }, [org.ministries, membership]);

  const effectiveRoles = useMemo(() => getMemberEffectiveRoleKeys(membership), [membership]);

  // ── TAB 1: User Settings for this Organization ───────────────────────────
  const [prefs, setPrefs] = useState<OrgUserLocalPrefs>(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY(org.id, uid));
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      orgDisplayName: membership?.displayName || user?.displayName || '',
      orgTitle: membership?.title || '',
      orgBio: membership?.bio || '',
      orgAvatarUrl: membership?.avatarUrl || user?.photoURL || '',
      preferredDays: ['Sunday Morning', 'Wednesday Evening'],
      blockoutDates: [],
      notifyScheduleReminders: true,
      notifySubRequests: true,
      notifyDepartmentUploads: true,
      notifyGivingReceipts: true,
    };
  });
  const [newBlockoutDate, setNewBlockoutDate] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettingsToast, setSavedSettingsToast] = useState(false);

  const handleSaveOrgUserSettings = async () => {
    setSavingSettings(true);
    setSavedSettingsToast(false);
    try {
      localStorage.setItem(PREFS_KEY(org.id, uid), JSON.stringify(prefs));
      if (membership?.id) {
        await updateRosterEntry(membership.id, {
          displayName: prefs.orgDisplayName.trim() || membership.displayName,
          title: prefs.orgTitle.trim(),
          bio: prefs.orgBio.trim(),
          avatarUrl: prefs.orgAvatarUrl.trim() || undefined,
        }).catch(() => {});
        onMembershipUpdated?.();
      }
      setSavedSettingsToast(true);
      setTimeout(() => setSavedSettingsToast(false), 2600);
    } finally {
      setSavingSettings(false);
    }
  };

  const togglePreferredDay = (slot: string) => {
    setPrefs(prev => ({
      ...prev,
      preferredDays: prev.preferredDays.includes(slot)
        ? prev.preferredDays.filter(s => s !== slot)
        : [...prev.preferredDays, slot],
    }));
  };

  // ── TAB 2: Household Giving & Financial Statements Dashboard ─────────────
  const kinshipDemo = useMemo(() => getDemoHouseholdKinshipGraph(org.id), [org.id]);
  const [allowExtendedKinship, setAllowExtendedKinship] = useState<boolean>(() =>
    getLocalExtendedKinshipOptIn(uid)
  );
  const [taxScope, setTaxScope] = useState<ChmsTaxStatementScope>('JOINT_HOUSEHOLD');

  const handleToggleExtendedPrivacy = (next: boolean) => {
    setAllowExtendedKinship(next);
    setLocalExtendedKinshipOptIn(uid, next);
  };

  const handlePrintSampleTaxStatement = () => {
    const yr = new Date().getFullYear() - 1;
    const range = yearRange(yr);
    const totalHousehold = kinshipDemo.nuclearMembers.reduce((a, m) => a + m.ytdGiving, 0);
    const sampleStmt = {
      key: `hh_${org.id}`,
      name:
        taxScope === 'INDIVIDUAL'
          ? prefs.orgDisplayName || kinshipDemo.nuclearMembers[0].name
          : `${prefs.orgDisplayName || 'Household'} (${kinshipDemo.householdName})`,
      address: {
        line1: '742 Sanctuary Way, Suite 4B',
        city: 'Atlanta',
        region: 'GA',
        postal: '30308',
      },
      personIds: kinshipDemo.nuclearMembers.map(m => m.id),
      householdId: kinshipDemo.householdId,
      email: user?.email || membership?.email || 'member@plajah.org',
      linkedUids: uid ? [uid] : [],
      lines: [
        {
          date: `${yr}-03-15`,
          fund: 'General Sanctuary Tithe',
          amount: 4200,
          method: 'ACH',
          memo: 'Head of Household',
        },
        {
          date: `${yr}-06-22`,
          fund: 'Christian Education & Youth Fund',
          amount: 2800,
          method: 'ONLINE',
          memo: 'Spouse Contribution',
        },
        {
          date: `${yr}-10-08`,
          fund: 'Global Missions & Outreach',
          amount: 4250,
          method: 'ACH',
          memo: 'Joint Household Gift',
        },
        ...(taxScope === 'JOINT_HOUSEHOLD' || taxScope === 'FAMILY_PACKET'
          ? [
              {
                date: `${yr}-11-19`,
                fund: 'Youth Missions Offering',
                amount: 230,
                method: 'CARD',
                memo: 'Dependent Children',
              },
            ]
          : []),
      ],
      total:
        taxScope === 'INDIVIDUAL'
          ? kinshipDemo.nuclearMembers[0].ytdGiving
          : taxScope === 'HEAD_AND_SPOUSE'
          ? 8450 + 4200
          : totalHousehold,
      byFund: {
        'General Sanctuary Tithe': 4200,
        'Christian Education & Youth Fund': 2800,
        'Global Missions & Outreach': 4250,
        ...(taxScope === 'JOINT_HOUSEHOLD' || taxScope === 'FAMILY_PACKET'
          ? { 'Youth Missions Offering': 230 }
          : {}),
      },
      range,
    };

    openPrintWindow(
      statementsHtml([sampleStmt], {
        name: org.name,
        legalName: org.legalName || `${org.name} Inc.`,
        ein: org.ein || '58-1948271',
      }),
      `${org.name} — ${taxScope} Tax Statement (${yr})`
    );
  };

  // ── TAB 3: My Department Uploads ─────────────────────────────────────────
  const [selectedDeptId, setSelectedDeptId] = useState<string>(() => myDepartments[0]?.id || 'ALL');
  const [hqAssets, setHqAssets] = useState<OrgAsset[]>([]);
  const [localDeptUploads, setLocalDeptUploads] = useState<LocalDeptUploadItem[]>(() => {
    try {
      const raw = localStorage.getItem(DEPT_UPLOADS_KEY(org.id, uid));
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });
  const [uploadingDeptFile, setUploadingDeptFile] = useState(false);
  const deptFileInputRef = useRef<HTMLInputElement>(null);

  const loadMyDeptAssets = useCallback(async () => {
    const all = await listHqAssets({ kind: 'org', id: org.id, label: org.name }).catch(() => []);
    setHqAssets(all.filter(a => a.uploadedByUid === uid || a.departmentName));
  }, [org.id, org.name, uid]);

  useEffect(() => {
    loadMyDeptAssets();
  }, [loadMyDeptAssets]);

  const handleUploadDepartmentFile = async (file: File) => {
    const targetDept =
      myDepartments.find(d => d.id === selectedDeptId) ||
      myDepartments[0] || { id: 'dept-general', name: 'General Ministry' };
    setUploadingDeptFile(true);
    try {
      // Try full Content HQ upload first
      const uploaded = await addHqAsset(
        { kind: 'org', id: org.id, label: org.name },
        file,
        targetDept.name
      ).catch(() => null);

      if (uploaded) {
        await loadMyDeptAssets();
      } else {
        // Fallback local department upload entry
        const entry: LocalDeptUploadItem = {
          id: `dept_up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          orgId: org.id,
          uploadedByUid: uid,
          name: file.name,
          departmentId: targetDept.id,
          departmentName: targetDept.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          url: URL.createObjectURL(file),
          uploadedAt: Date.now(),
        };
        const next = [entry, ...localDeptUploads];
        setLocalDeptUploads(next);
        try {
          localStorage.setItem(DEPT_UPLOADS_KEY(org.id, uid), JSON.stringify(next));
        } catch {}
      }
    } finally {
      setUploadingDeptFile(false);
    }
  };

  const handleDeleteDeptUpload = async (itemId: string, hqAsset?: OrgAsset) => {
    if (hqAsset) {
      await deleteHqAsset(hqAsset).catch(() => {});
      await loadMyDeptAssets();
      return;
    }
    const next = localDeptUploads.filter(x => x.id !== itemId);
    setLocalDeptUploads(next);
    try {
      localStorage.setItem(DEPT_UPLOADS_KEY(org.id, uid), JSON.stringify(next));
    } catch {}
  };

  const visibleDeptUploads = useMemo(() => {
    const targetDept = myDepartments.find(d => d.id === selectedDeptId);
    const fromHq: LocalDeptUploadItem[] = hqAssets
      .filter(a => a.kind !== 'image' && (a.uploadedByUid === uid || a.departmentName))
      .map(a => ({
        id: a.id,
        orgId: org.id,
        uploadedByUid: a.uploadedByUid,
        name: a.name,
        departmentId: a.departmentId || '',
        departmentName: a.folder || a.departmentName || 'General',
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        url: a.url,
        uploadedAt: a.uploadedAt,
      }));
    const combined = [...localDeptUploads, ...fromHq];
    if (selectedDeptId === 'ALL' || !targetDept) return combined;
    return combined.filter(
      u =>
        u.departmentId === targetDept.id ||
        u.departmentName.toLowerCase() === targetDept.name.toLowerCase()
    );
  }, [hqAssets, localDeptUploads, myDepartments, org.id, selectedDeptId, uid]);

  // ── TAB 4: My Uploaded Organization Photos ───────────────────────────────
  const [photos, setPhotos] = useState<LocalOrgPhotoItem[]>(() => {
    try {
      const raw = localStorage.getItem(PHOTOS_KEY(org.id, uid));
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });
  const [photoDeptId, setPhotoDeptId] = useState<string>(() => myDepartments[0]?.id || 'ORG_GENERAL');
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });
      const dept = myDepartments.find(d => d.id === photoDeptId);
      const newPhoto: LocalOrgPhotoItem = {
        id: `org_photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        orgId: org.id,
        uploadedByUid: uid,
        uploaderName: prefs.orgDisplayName || user?.displayName || 'Volunteer',
        caption: photoCaption.trim() || file.name.replace(/\.[^.]+$/, ''),
        departmentId: dept?.id || 'ORG_GENERAL',
        departmentName: dept?.name || org.name,
        dataUrl,
        fileName: file.name,
        uploadedAt: Date.now(),
      };
      const next = [newPhoto, ...photos];
      setPhotos(next);
      setPhotoCaption('');
      try {
        localStorage.setItem(PHOTOS_KEY(org.id, uid), JSON.stringify(next));
      } catch {}
      // Also upload to Content HQ org assets in the background (best-effort)
      void addHqAsset(
        { kind: 'org', id: org.id, label: org.name },
        file,
        dept?.name ? `${dept.name} Photos` : 'Organization Photos'
      ).catch(() => {});
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = (photoId: string) => {
    const next = photos.filter(p => p.id !== photoId);
    setPhotos(next);
    try {
      localStorage.setItem(PHOTOS_KEY(org.id, uid), JSON.stringify(next));
    } catch {}
  };

  const handleUpdatePhotoCaption = (photoId: string, caption: string) => {
    const next = photos.map(p => (p.id === photoId ? { ...p, caption } : p));
    setPhotos(next);
    try {
      localStorage.setItem(PHOTOS_KEY(org.id, uid), JSON.stringify(next));
    } catch {}
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 space-y-6 text-white">
      {/* Header Banner */}
      <div className="rounded-3xl border border-white/12 bg-gradient-to-r from-[#170b2c] via-[#120824] to-[#1a0d2e] p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#E2C27E]/20 text-[#E2C27E] border border-[#E2C27E]/30">
              My Organization Manage Hub
            </span>
            {effectiveRoles.map(rk => (
              <span
                key={rk}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/80"
              >
                {ROLE_LABELS[rk] || rk}
              </span>
            ))}
          </div>
          <h2 className="text-2xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {prefs.orgDisplayName || user?.displayName || 'Member'} · {org.name}
          </h2>
          <p className="text-xs text-white/65 max-w-2xl">
            Manage your personal profile &amp; availability for {org.name}, view your Household Giving &amp; IRS tax statements, and manage your department uploads and organization photos.
          </p>
        </div>

        {/* Assigned Departments Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {myDepartments.map(d => (
            <span
              key={d.id}
              className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/[0.06] border border-white/12 text-white/90"
            >
              {d.iconEmoji || '🏛️'} {d.name}
            </span>
          ))}
        </div>
      </div>

      {/* 4-Pillar Navigation Bar */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            {
              id: 'USER_SETTINGS',
              label: 'My Org Settings & Availability',
              icon: UserCog,
            },
            {
              id: 'GIVING_AND_STATEMENTS',
              label: 'Household Giving & Tax Statements',
              icon: Wallet,
            },
            {
              id: 'DEPARTMENT_UPLOADS',
              label: `My Department Uploads (${visibleDeptUploads.length})`,
              icon: FolderUp,
            },
            {
              id: 'MY_ORG_PHOTOS',
              label: `My Uploaded Photos (${photos.length})`,
              icon: ImageIcon,
            },
          ] as const
        ).map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-2 transition-all border ${
                active
                  ? 'bg-[#E2C27E] text-black border-[#E2C27E] shadow-lg'
                  : 'bg-white/[0.04] text-white/75 border-white/10 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 1: MY ORGANIZATION USER SETTINGS & AVAILABILITY
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'USER_SETTINGS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Organization Profile Identity */}
          <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#E2C27E]">
                Organization Member Profile
              </span>
              <h3 className="text-lg font-black text-white mt-0.5">
                How You Appear in {org.name}
              </h3>
              <p className="text-xs text-white/60 mt-0.5">
                Customize your display name, ministry title, bio, and profile photo for {org.name} rosters and classes.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1.5">
                  Display Name in Organization
                </label>
                <input
                  value={prefs.orgDisplayName}
                  onChange={e => setPrefs(p => ({ ...p, orgDisplayName: e.target.value }))}
                  placeholder="Your name"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1.5">
                  Department / Ministry Title
                </label>
                <input
                  value={prefs.orgTitle}
                  onChange={e => setPrefs(p => ({ ...p, orgTitle: e.target.value }))}
                  placeholder="e.g. Christian Education Instructor · Volunteer"
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1.5">
                Organization Headshot / Avatar URL
              </label>
              <input
                value={prefs.orgAvatarUrl}
                onChange={e => setPrefs(p => ({ ...p, orgAvatarUrl: e.target.value }))}
                placeholder="https://..."
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1.5">
                Short Bio / Serving Notes
              </label>
              <textarea
                rows={3}
                value={prefs.orgBio}
                onChange={e => setPrefs(p => ({ ...p, orgBio: e.target.value }))}
                placeholder="Share your background, classes you instruct, or departments you serve with..."
                className={`${fieldClass} resize-none`}
              />
            </div>

            {/* Notification Preferences */}
            <div className="pt-3 border-t border-white/10 space-y-2.5">
              <div className="text-xs font-black uppercase tracking-wider text-[#E2C27E] flex items-center gap-1.5">
                <Bell size={13} /> Organization Notification Preferences
              </div>
              {(
                [
                  ['notifyScheduleReminders', 'Service & Classroom Schedule Reminders'],
                  ['notifySubRequests', 'Substitute Instructor / Volunteer Coverage Requests'],
                  ['notifyDepartmentUploads', 'New Department Curriculum & Resource Uploads'],
                  ['notifyGivingReceipts', 'Instant Giving & Tax Statement Receipts'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-3 rounded-2xl bg-black/30 border border-white/10 cursor-pointer"
                >
                  <span className="text-xs font-semibold text-white/85">{label}</span>
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    onChange={e => setPrefs(p => ({ ...p, [key]: e.target.checked }))}
                    className="h-4 w-4 accent-[#E2C27E]"
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="text-xs text-emerald-300 font-bold">
                {savedSettingsToast && (
                  <span className="inline-flex items-center gap-1.5">
                    <Check size={14} /> Saved your organization user settings!
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveOrgUserSettings}
                className="px-6 py-3 rounded-full bg-[#E2C27E] text-black text-xs font-black uppercase tracking-widest inline-flex items-center gap-2 hover:brightness-110 disabled:opacity-50"
              >
                {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Save My Org Settings</span>
              </button>
            </div>
          </div>

          {/* Right 5 Cols: Volunteer Availability & Blockout Dates (Feeds Central Calendar Sub AI) */}
          <div className="lg:col-span-5 rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-sky-300">
                Central Calendar &amp; Substitute AI Sync
              </span>
              <h3 className="text-lg font-black text-white mt-0.5 flex items-center gap-2">
                <Calendar size={18} className="text-sky-300" /> My Serving Availability &amp; Blockouts
              </h3>
              <p className="text-xs text-white/60 mt-0.5">
                Used by the Organization Central Calendar to prevent scheduling conflicts and suggest weighted substitutes when you are away.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/50">
                Preferred Serving Windows
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  'Sunday Early (8:00 AM)',
                  'Sunday Morning (9:30 AM)',
                  'Sunday Main (11:00 AM)',
                  'Wednesday Evening (7:00 PM)',
                  'Thursday Rehearsal',
                  'Saturday Outreach',
                ].map(slot => {
                  const active = prefs.preferredDays.includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => togglePreferredDay(slot)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        active
                          ? 'bg-sky-400/20 border-sky-400 text-sky-200'
                          : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                      }`}
                    >
                      {active ? '✓ ' : ''}{slot}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/50">
                Blockout / Away Dates
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newBlockoutDate}
                  onChange={e => setNewBlockoutDate(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newBlockoutDate && !prefs.blockoutDates.includes(newBlockoutDate)) {
                      const next = { ...prefs, blockoutDates: [...prefs.blockoutDates, newBlockoutDate] };
                      setPrefs(next);
                      localStorage.setItem(PREFS_KEY(org.id, uid), JSON.stringify(next));
                      setNewBlockoutDate('');
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black text-white inline-flex items-center gap-1"
                >
                  <Plus size={13} /> Add Date
                </button>
              </div>
              {prefs.blockoutDates.length === 0 ? (
                <p className="text-xs text-white/45">No upcoming blockout dates added.</p>
              ) : (
                <div className="space-y-1.5">
                  {prefs.blockoutDates.map(d => (
                    <div
                      key={d}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs"
                    >
                      <span className="font-mono text-amber-200">{d}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = {
                            ...prefs,
                            blockoutDates: prefs.blockoutDates.filter(x => x !== d),
                          };
                          setPrefs(next);
                          localStorage.setItem(PREFS_KEY(org.id, uid), JSON.stringify(next));
                        }}
                        className="text-white/40 hover:text-rose-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: HOUSEHOLD GIVING & FINANCIAL STATEMENTS DASHBOARD
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'GIVING_AND_STATEMENTS' && (
        <div className="space-y-6">
          {/* Live Personal & Household Giving Ledger */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#E2C27E]">
                  Personal &amp; Household Financial Dashboard
                </span>
                <h3 className="text-xl font-black text-white mt-0.5">
                  My Giving Ledger, Recurring Gifts &amp; Annual Statements
                </h3>
              </div>
              {onOpenGive && (
                <button
                  type="button"
                  onClick={onOpenGive}
                  className="px-5 py-2.5 rounded-full bg-[#E2C27E] text-black text-xs font-black uppercase tracking-widest inline-flex items-center gap-2 hover:brightness-110"
                >
                  <HeartHandshake size={14} /> Give to {org.name}
                </button>
              )}
            </div>

            {user?.uid ? (
              <Suspense fallback={<div className="text-xs text-white/50 py-6">Loading your giving ledger…</div>}>
                <MyGivingPanel orgId={org.id} uid={user.uid} />
              </Suspense>
            ) : (
              <div className="text-xs text-white/60 py-4">
                Sign in with your claimed organization email to view your live contribution rows.
              </div>
            )}
          </div>

          {/* Household Kinship & 4-Scope IRS 501(c)(3) Tax Statement Generator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Cols: Household Family & Extended Kinship Privacy */}
            <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                  Household &amp; Extended Family Settings
                </div>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  {demo ? kinshipDemo.householdName : `${prefs.orgDisplayName || 'My'} Household`} — Family &amp; Kinship
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {kinshipDemo.nuclearMembers.map(m => (
                  <div
                    key={m.id}
                    className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">{m.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-[#E2C27E] text-black">
                        {m.roleLabel}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#D8D2E2]/80">
                      Departments: {m.departments.join(' · ')}
                    </div>
                    <div className="text-[10.5px] font-mono text-[#E2C27E] pt-1 border-t border-white/10 flex justify-between">
                      <span>YTD Deductible Gifts ({m.giftCount}):</span>
                      <b>{money(m.ytdGiving)}</b>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      {allowExtendedKinship ? (
                        <Unlock size={14} className="text-emerald-400" />
                      ) : (
                        <Lock size={14} className="text-amber-400" />
                      )}
                      <span>Extended Family Kinship Visibility</span>
                    </div>
                    <p className="text-[11px] text-white/60 mt-0.5">
                      Control whether extended family ties across households are visible to pastoral care.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleExtendedPrivacy(!allowExtendedKinship)}
                    className={`px-3 py-1.5 rounded-xl text-[10.5px] font-black flex items-center gap-1.5 border transition-all ${
                      allowExtendedKinship
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    }`}
                  >
                    {allowExtendedKinship ? <Unlock size={12} /> : <Lock size={12} />}
                    <span>
                      {allowExtendedKinship ? 'Visible to Leadership' : 'Opted Out (Private)'}
                    </span>
                  </button>
                </div>
                {!allowExtendedKinship && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs text-amber-200 flex items-center gap-2">
                    <ShieldCheck size={15} className="shrink-0" />
                    <span>Extended family kinship visibility is currently private.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 Cols: 4-Scope Family & Individual Tax Statement Generator */}
            <div className="lg:col-span-5 rounded-3xl border border-[#E2C27E]/30 bg-white/[0.03] p-6 flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                    IRS 501(c)(3) Financial Statements
                  </div>
                  <h3 className="text-xl font-bold text-white mt-0.5">
                    Household &amp; Individual Statement Generator
                  </h3>
                </div>

                <div className="space-y-2">
                  {(
                    [
                      {
                        id: 'JOINT_HOUSEHOLD',
                        title: '1. Joint Family Household Statement',
                        desc: 'Combines Head of Household, Spouse, and Dependent Children on one itemized statement.',
                        amount: 12880,
                      },
                      {
                        id: 'HEAD_AND_SPOUSE',
                        title: '2. Head & Spouse Joint Statement Only',
                        desc: 'Combines Head & Spouse on a joint married filing receipt.',
                        amount: 12650,
                      },
                      {
                        id: 'INDIVIDUAL',
                        title: '3. Individual Member Tax Statement',
                        desc: 'Generates a separate individual IRS tax statement for your personal gifts only.',
                        amount: 8450,
                      },
                      {
                        id: 'FAMILY_PACKET',
                        title: '4. Complete Family Tax Packet',
                        desc: 'Prints the Household Cover Summary Sheet + individual member schedules.',
                        amount: 12880,
                      },
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTaxScope(opt.id)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                        taxScope === opt.id
                          ? 'bg-[#7A1FC0]/45 border-[#E2C27E] text-white'
                          : 'bg-white/[0.03] border-white/10 text-white/70 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{opt.title}</span>
                        <span className="text-xs font-mono font-black text-[#E2C27E]">
                          {money(opt.amount)}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-white/65 mt-1 leading-snug">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handlePrintSampleTaxStatement}
                className="w-full py-3 rounded-xl text-xs font-black text-black flex items-center justify-center gap-2 hover:brightness-110 transition-all"
                style={{ background: '#E2C27E' }}
              >
                <Printer size={14} />
                <span>Generate &amp; Print {taxScope.replace(/_/g, ' ')} Statement (PDF)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 3: MY DEPARTMENT UPLOADS
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'DEPARTMENT_UPLOADS' && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                Department Files, Slides, Handouts &amp; Lesson Materials
              </span>
              <h3 className="text-xl font-black text-white mt-0.5">
                Manage My Uploads to My Departments
              </h3>
              <p className="text-xs text-white/60 mt-0.5">
                Upload and manage files, PDFs, Word lesson guides, slides, and resources for the departments you belong to.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={deptFileInputRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadDepartmentFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploadingDeptFile}
                onClick={() => deptFileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-full bg-emerald-400 text-black text-xs font-black uppercase tracking-widest inline-flex items-center gap-2 hover:brightness-110 disabled:opacity-50"
              >
                {uploadingDeptFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>{uploadingDeptFile ? 'Uploading…' : 'Upload to Department'}</span>
              </button>
            </div>
          </div>

          {/* Department Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDeptId('ALL')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                selectedDeptId === 'ALL'
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 text-white/70 border-white/10 hover:text-white'
              }`}
            >
              All My Departments ({myDepartments.length})
            </button>
            {myDepartments.map(dept => (
              <button
                key={dept.id}
                type="button"
                onClick={() => setSelectedDeptId(dept.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                  selectedDeptId === dept.id
                    ? 'bg-emerald-400 text-black border-emerald-400'
                    : 'bg-white/5 text-white/70 border-white/10 hover:text-white'
                }`}
              >
                {dept.iconEmoji || '📁'} {dept.name}
              </button>
            ))}
          </div>

          {/* Uploaded Files List */}
          {visibleDeptUploads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 p-8 text-center space-y-2">
              <FileText size={28} className="mx-auto text-white/35" />
              <p className="text-sm font-bold text-white/80">No department files uploaded yet</p>
              <p className="text-xs text-white/50 max-w-md mx-auto">
                Select one of your departments above and click &ldquo;Upload to Department&rdquo; to share lesson handouts, slides, or rehearsal files.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleDeptUploads.map(item => {
                const matchingHq = hqAssets.find(a => a.id === item.id);
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300">
                          {item.departmentName}
                        </span>
                        <span className="text-[10px] font-mono text-white/45">
                          {humanFileSize(item.sizeBytes)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-white/45">
                        Uploaded {new Date(item.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {matchingHq?.telaDocId && (
                        <button
                          type="button"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('plajah:openTela', {
                                detail: { docId: matchingHq.telaDocId },
                              })
                            )
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-400/20 text-emerald-200 text-[10px] font-black inline-flex items-center gap-1"
                        >
                          <Sparkles size={11} /> Tela
                        </button>
                      )}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/75"
                          title="Open file"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteDeptUpload(item.id, matchingHq)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-300"
                        title="Delete upload"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 4: MY UPLOADED ORGANIZATION PHOTOS
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'MY_ORG_PHOTOS' && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                Organization &amp; Department Photo Gallery
              </span>
              <h3 className="text-xl font-black text-white mt-0.5">
                Manage My Photos Uploaded to {org.name}
              </h3>
              <p className="text-xs text-white/60 mt-0.5">
                Upload, caption, tag by department, or remove photos you have shared with {org.name}.
              </p>
            </div>
          </div>

          {/* Photo Upload Bar */}
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <div className="md:col-span-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
                Department / Album Tag
              </label>
              <select
                value={photoDeptId}
                onChange={e => setPhotoDeptId(e.target.value)}
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white"
              >
                <option value="ORG_GENERAL">{org.name} · General Fellowship</option>
                {myDepartments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.iconEmoji || '🏛️'} {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-5">
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
                Photo Caption
              </label>
              <input
                value={photoCaption}
                onChange={e => setPhotoCaption(e.target.value)}
                placeholder="e.g. Sunday morning Christian Education class fellowship"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white"
              />
            </div>

            <div className="md:col-span-3 pt-4 md:pt-5">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handlePhotoSelect(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={() => photoInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-xl bg-[#E2C27E] text-black text-xs font-black uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:brightness-110"
              >
                {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                <span>{uploadingPhoto ? 'Uploading…' : 'Upload Photo'}</span>
              </button>
            </div>
          </div>

          {/* Photo Grid */}
          {photos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 p-8 text-center space-y-2">
              <ImageIcon size={28} className="mx-auto text-white/35" />
              <p className="text-sm font-bold text-white/80">You haven&apos;t uploaded any organization photos yet</p>
              <p className="text-xs text-white/50 max-w-md mx-auto">
                Upload photos from your classes, choir rehearsals, or fellowship events and manage them anytime here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {photos.map(photo => (
                <div
                  key={photo.id}
                  className="rounded-2xl border border-white/10 bg-black/45 overflow-hidden flex flex-col justify-between"
                >
                  <div className="aspect-video bg-black relative overflow-hidden">
                    <img
                      src={photo.dataUrl}
                      alt={photo.caption}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-black/75 text-[#E2C27E] border border-white/15">
                      {photo.departmentName}
                    </span>
                  </div>
                  <div className="p-3.5 space-y-2">
                    <input
                      value={photo.caption}
                      onChange={e => handleUpdatePhotoCaption(photo.id, e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold"
                      placeholder="Photo caption..."
                    />
                    <div className="flex items-center justify-between text-[10px] text-white/45">
                      <span>{new Date(photo.uploadedAt).toLocaleDateString()}</span>
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="text-rose-300/80 hover:text-rose-300 inline-flex items-center gap-1 font-bold"
                      >
                        <Trash2 size={12} /> Remove Photo
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VolunteerMemberManageHub;
