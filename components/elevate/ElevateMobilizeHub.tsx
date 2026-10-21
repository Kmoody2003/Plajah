import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  Flame,
  Gift,
  Globe,
  HandHeart,
  Layers,
  Mail,
  MapPin,
  Megaphone,
  Mic,
  MonitorPlay,
  Music,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import type {
  ChmsPerson,
  ElevateCampaignJurisdiction,
  ElevateCampaignTaxClassification,
  ElevateCivicCampaignComplianceConfig,
  ElevateExternalCrmProvider,
  ElevatePetitionDrive,
  ElevateShiftDrive,
  ElevateShiftSignup,
  ElevateShiftSlot,
  ElevateSpokeHostEvent,
  Organization,
} from '../../types';
import {
  applyToHostElevateSpoke,
  buildCampaignDisclaimerBox,
  buildNonSmsReminderPayload,
  buildPetitionTelaDossierMarkdown,
  cancelOrReleaseElevateShift,
  checkInElevateShiftVolunteer,
  computeElevateImpactPassport,
  computeSpokeCampaignRollup,
  confirmElevateShiftAttendance24h,
  exportCampaignFinanceComplianceCsv,
  exportElevateMobilizeToCrmCsv,
  getActionHubVerticalConfig,
  getDefaultCivicCampaignComplianceConfig,
  getDefaultElevateReminderCadence,
  loadElevateMobilizeBundleLocal,
  mapExternalCrmCsvToElevateChms,
  reviewElevateSpokeHostEvent,
  rsvpToElevateSpokeEvent,
  signElevatePetition,
  signUpForElevateShift,
  syncElevateMobilizeBundleToFirestore,
  validateAndRecordCampaignContribution,
  validateCivicCampaignCoalitionFirewall,
  validateCivicCampaignRewardGuard,
  type ActionHubVerticalKind,
  type ElevateMobilizeBundle,
  type NonSmsReminderNotificationPayload,
} from '../../services/elevateMobilizeService';
import { Button, Surface, Eyebrow, Chip } from '../ui';
import { EV, EvLabel, EvKpiStrip } from './vellum';
import { isDemoOrg } from '../../services/elevateTruth';

/** Quiet empty state used by every tab when the organization has not added anything yet. */
const HubEmpty: React.FC<{ title: string; detail?: string; action?: React.ReactNode }> = ({ title, detail, action }) => (
  <div className="ev-panel rounded-3xl p-8 text-center space-y-2">
    <div className="text-base font-bold text-white">{title}</div>
    {detail && <p className="m-0 text-xs text-[#A49CB2] leading-relaxed max-w-md mx-auto">{detail}</p>}
    {action && <div className="pt-2 flex justify-center">{action}</div>}
  </div>
);

export interface ElevateMobilizeHubProps {
  org: Organization;
  currentUserId?: string;
  currentUserName?: string;
  currentUserEmail?: string;
  /** When true, exposes Admin/Operations tabs (Reminder Cadence Studio, Host Vetting, CRM Sync Bridge, Drive Creator). */
  canManage?: boolean;
  /** Default view context: 'public' | 'member' | 'ops'. */
  initialContext?: 'public' | 'member' | 'ops';
  /** Optional vertical override to preview how Academia, Clubs, or Businesses use the same engine. */
  verticalOverride?: ActionHubVerticalKind;
}

type MobilizeTabId =
  | 'SHIFTS'
  | 'PETITIONS'
  | 'SPOKES'
  | 'PASSPORT'
  | 'REMINDERS_SYNERGY'
  | 'CRM_COALITION'
  | 'CIVIC_COMPLIANCE';

export const ElevateMobilizeHub: React.FC<ElevateMobilizeHubProps> = ({
  org,
  currentUserId: currentUserIdProp,
  currentUserName: currentUserNameProp,
  currentUserEmail: currentUserEmailProp,
  canManage = false,
  initialContext = 'public',
  verticalOverride,
}) => {
  // Only the demo church may fall back to its sample member; a real org uses the signed-in person.
  const isDemo = isDemoOrg(org);
  const currentUserId = currentUserIdProp || (isDemo ? 'demo-member-elena' : 'guest');
  const currentUserName = currentUserNameProp || (isDemo ? 'Elena Sterling' : 'You');
  const currentUserEmail = currentUserEmailProp || (isDemo ? 'elena.sterling@example.org' : undefined);
  const orgCityLabel = org.location?.city
    ? [org.location.city, (org.location as { state?: string }).state].filter(Boolean).join(', ')
    : '';
  const [bundle, setBundle] = useState<ElevateMobilizeBundle>(() =>
    loadElevateMobilizeBundleLocal(org)
  );
  const [verticalLens, setVerticalLens] = useState<ActionHubVerticalKind | undefined>(verticalOverride);
  const vConfig = useMemo(
    () => getActionHubVerticalConfig(verticalLens || org.orgType),
    [verticalLens, org.orgType]
  );
  const [activeTab, setActiveTab] = useState<MobilizeTabId>(
    initialContext === 'member' ? 'PASSPORT' : 'SHIFTS'
  );
  const [toastBanner, setToastBanner] = useState<{
    title: string;
    detail: string;
    tone?: 'purple' | 'emerald' | 'amber';
  } | null>(null);

  // Petition signing state
  const [selectedPetitionId, setSelectedPetitionId] = useState<string | null>(null);
  const [sigComment, setSigComment] = useState('');
  const [sigCity, setSigCity] = useState(orgCityLabel || (isDemo ? 'Atlanta, GA' : ''));
  const [sigTestimonyKind, setSigTestimonyKind] = useState<'TEXT' | 'VOICE_30S' | 'VIDEO_30S'>('VOICE_30S');
  const [sigPledgedHours, setSigPledgedHours] = useState<number>(10);
  const [telaDossierModal, setTelaDossierModal] = useState<{ title: string; markdown: string } | null>(null);

  // Spoke Host application state
  const [showHostModal, setShowHostModal] = useState(false);
  const [hostDraft, setHostDraft] = useState({
    title: '',
    city: org.location?.city || (isDemo ? 'Atlanta, GA' : ''),
    neighborhood: '',
    venueKind: 'HOME_SANCTUARY' as ElevateSpokeHostEvent['venueKind'],
    dateISO: '2026-11-02',
    timeLabel: '06:30 PM',
    capacity: 20,
    notes: '',
  });

  // Admin: New Shift Slot quick creator
  const [showNewSlotModal, setShowNewSlotModal] = useState(false);
  const [newSlotDraft, setNewSlotDraft] = useState({
    driveId: '',
    roleTitle: '',
    dateISO: '2026-11-01',
    startTime: '09:00 AM',
    endTime: '12:00 PM',
    durationHours: 3,
    locationLabel: isDemo ? 'Main Sanctuary Commons' : '',
    capacity: 10,
  });

  // Non-SMS Reminder preview state
  const [previewStage, setPreviewStage] = useState<NonSmsReminderNotificationPayload['stage']>('24H_CONFIRM');
  const [dispatchedReminders, setDispatchedReminders] = useState<NonSmsReminderNotificationPayload[]>([]);

  // CRM Sync state
  const [selectedCrmProvider, setSelectedCrmProvider] = useState<ElevateExternalCrmProvider>('PLANNING_CENTER');
  const [csvImportInput, setCsvImportInput] = useState(
    isDemo
      ? 'first_name,last_name,email,phone,tags,external_id\nNaomi,Osei,naomi.osei@example.org,555-310-8821,Choir;Hospitality,pco_991\nDavid,Kowalski,david.k@example.org,555-419-2044,Youth Mentor;Deacon,pco_992'
      : 'first_name,last_name,email,phone,tags,external_id\n'
  );
  const [importedChmsPeople, setImportedChmsPeople] = useState<ChmsPerson[]>([]);
  const [exportedCsvPreview, setExportedCsvPreview] = useState<string>('');

  // Grassroots & Civic Campaign Compliance Simulator state
  const civicCompliance = useMemo<ElevateCivicCampaignComplianceConfig>(
    () => bundle.civicCompliance || getDefaultCivicCampaignComplianceConfig(org.name),
    [bundle.civicCompliance, org.name]
  );
  const campaignContributions = useMemo(
    () => bundle.campaignContributions || [],
    [bundle.campaignContributions]
  );
  const [contribDraft, setContribDraft] = useState(() =>
    isDemo
      ? {
          donorFullName: 'Devon A. Brooks',
          donorEmail: 'devon.brooks@example.org',
          streetAddress: '742 Euclid Ave NE',
          city: 'Atlanta',
          state: 'GA',
          postalCode: '30307',
          occupation: 'High School History Teacher',
          employer: 'DeKalb County School District',
          amountUsd: 100,
          isUsCitizenOrPermanentResident: true,
          isPersonalFunds: true,
          isNotFederalOrMunicipalContractor: true,
          isPersonalCardNotCorporate: true,
          isAtLeast18: true,
        }
      : {
          donorFullName: '',
          donorEmail: '',
          streetAddress: '',
          city: '',
          state: '',
          postalCode: '',
          occupation: '',
          employer: '',
          amountUsd: 0,
          isUsCitizenOrPermanentResident: false,
          isPersonalFunds: false,
          isNotFederalOrMunicipalContractor: false,
          isPersonalCardNotCorporate: false,
          isAtLeast18: false,
        }
  );
  const [contribErrors, setContribErrors] = useState<string[]>([]);
  const [complianceCsvPreview, setComplianceCsvPreview] = useState<string>('');
  const [rewardGuardTestAction, setRewardGuardTestAction] = useState<
    'VOLUNTEER_LABOR_SHIFT' | 'VOTER_REGISTRATION' | 'VOTE_PLEDGE' | 'BALLOT_RETURN'
  >('VOLUNTEER_LABOR_SHIFT');

  useEffect(() => {
    setBundle(loadElevateMobilizeBundleLocal(org));
  }, [org.id]);

  const updateBundle = (next: ElevateMobilizeBundle) => {
    setBundle(next);
    void syncElevateMobilizeBundleToFirestore(next);
  };

  const updateCivicCompliance = (patch: Partial<ElevateCivicCampaignComplianceConfig>) => {
    const nextConfig: ElevateCivicCampaignComplianceConfig = {
      ...civicCompliance,
      ...patch,
    };
    updateBundle({
      ...bundle,
      civicCompliance: nextConfig,
    });
  };

  const showToast = (
    title: string,
    detail: string,
    tone: 'purple' | 'emerald' | 'amber' = 'purple'
  ) => {
    setToastBanner({ title, detail, tone });
  };

  const passport = useMemo(
    () =>
      computeElevateImpactPassport(
        currentUserId,
        org.id,
        bundle.shiftDrives,
        bundle.shiftSignups,
        bundle.petitions,
        bundle.petitionSignatures,
        bundle.spokeCampaigns
      ),
    [bundle, currentUserId, org.id]
  );

  // Aggregate metrics across the org
  const summaryStats = useMemo(() => {
    const totalSlots = bundle.shiftDrives.reduce((s, d) => s + d.slots.length, 0);
    const totalConfirmed = bundle.shiftDrives.reduce(
      (s, d) => s + d.slots.reduce((acc, sl) => acc + sl.confirmedCount, 0),
      0
    );
    const totalWaitlisted = bundle.shiftDrives.reduce(
      (s, d) => s + d.slots.reduce((acc, sl) => acc + sl.waitlistCount, 0),
      0
    );
    const totalVerifiedHours = bundle.shiftSignups.reduce(
      (s, sig) => s + (sig.verifiedHours || 0),
      0
    );
    const totalPetitionSigs = bundle.petitions.reduce((s, p) => s + p.signatureCount, 0);
    const totalPledgedHours = bundle.petitions.reduce((s, p) => s + p.totalPledgedHours, 0);
    const spokeRollup = bundle.spokeCampaigns[0]
      ? computeSpokeCampaignRollup(bundle.spokeCampaigns[0])
      : { totalSpokes: 0, approvedLiveSpokes: 0, pendingVettingSpokes: 0, totalRsvps: 0, totalCheckedIn: 0, totalCapacity: 0, citiesReached: [] };

    return {
      totalSlots,
      totalConfirmed,
      totalWaitlisted,
      // The demo church carries a sample year-to-date baseline; real orgs count only their own hours.
      totalVerifiedHours: totalVerifiedHours + (isDemo ? 340 : 0),
      totalPetitionSigs,
      totalPledgedHours,
      spokeRollup,
    };
  }, [bundle, isDemo]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSignUpSlot = (drive: ElevateShiftDrive, slot: ElevateShiftSlot) => {
    try {
      const res = signUpForElevateShift(drive, bundle.shiftSignups, {
        slotId: slot.id,
        uid: currentUserId,
        userName: currentUserName,
        userEmail: currentUserEmail,
      });
      const nextBundle: ElevateMobilizeBundle = {
        ...bundle,
        shiftDrives: bundle.shiftDrives.map(d => (d.id === drive.id ? res.drive : d)),
        shiftSignups: res.signups,
      };
      updateBundle(nextBundle);
      if (res.reminderNotifications.length > 0) {
        setDispatchedReminders(prev => [...res.reminderNotifications, ...prev]);
      }

      if (res.createdSignup.status === 'WAITLISTED') {
        showToast(
          'Added to Automatic Waitlist',
          `You are on the auto-promote waitlist for "${slot.roleTitle}". If any confirmed volunteer releases their seat, Plajah will automatically confirm you via In-App Push & Post Man Email.`,
          'amber'
        );
      } else {
        showToast(
          'Shift Confirmed + Non-SMS Cadence Scheduled!',
          `You are confirmed for "${slot.roleTitle}" (${slot.dateISO}, ${slot.startTime}). 72h Prep, 24h 1-Tap Confirm, and .ICS Calendar passes are queued.`,
          'emerald'
        );
      }
    } catch (err) {
      showToast('Could not sign up', (err as Error).message, 'amber');
    }
  };

  const handleCancelOrReleaseSlot = (drive: ElevateShiftDrive, signup: ElevateShiftSignup) => {
    const res = cancelOrReleaseElevateShift(drive, bundle.shiftSignups, signup.id);
    const nextBundle: ElevateMobilizeBundle = {
      ...bundle,
      shiftDrives: bundle.shiftDrives.map(d => (d.id === drive.id ? res.drive : d)),
      shiftSignups: res.signups,
    };
    updateBundle(nextBundle);

    if (res.promotedSignup && res.promotionNotification) {
      setDispatchedReminders(prev => [res.promotionNotification!, ...prev]);
      showToast(
        `Seat Released → Waitlist Auto-Promoted ${res.promotedSignup.userName}!`,
        `${res.promotedSignup.userName} was automatically promoted from WAITLISTED to CONFIRMED and notified via Plajah In-App Push & The Post Man Email.`,
        'emerald'
      );
    } else {
      showToast(
        'Shift Seat Released',
        `Removed ${signup.userName} from the shift roster.`,
        'purple'
      );
    }
  };

  const handleConfirm24h = (signupId: string) => {
    const updatedSignups = confirmElevateShiftAttendance24h(bundle.shiftSignups, signupId);
    updateBundle({ ...bundle, shiftSignups: updatedSignups });
    showToast(
      '24-Hour Attendance Confirmed (1-Tap)',
      'Your ministry coordinator sees your green confirmed badge on the live sanctuary roster.',
      'emerald'
    );
  };

  const handleCheckInVolunteer = (
    drive: ElevateShiftDrive,
    signup: ElevateShiftSignup,
    method: 'QR_PASS' | 'SANCTUARY_GEOFENCE' | 'LEADER_ROSTER'
  ) => {
    const res = checkInElevateShiftVolunteer(drive, bundle.shiftSignups, signup.id, method);
    const nextBundle: ElevateMobilizeBundle = {
      ...bundle,
      shiftDrives: bundle.shiftDrives.map(d => (d.id === drive.id ? res.drive : d)),
      shiftSignups: res.signups,
    };
    updateBundle(nextBundle);
    setDispatchedReminders(prev => [res.postEventNotification, ...prev]);
    showToast(
      `Checked In (${method.replace(/_/g, ' ')}) · +${res.completedSignup.verifiedHours}h Verified`,
      `${signup.userName}'s ${res.completedSignup.verifiedHours}h of service is recorded on their impact passport. Thank you for serving.`,
      'emerald'
    );
  };

  const handleSignPetition = (petition: ElevatePetitionDrive) => {
    const res = signElevatePetition(petition, bundle.petitionSignatures, {
      uid: currentUserId,
      signerName: currentUserName,
      signerCity: sigCity,
      signerRoleBadge: `Verified Member · ${org.name}`,
      comment: sigComment.trim() || undefined,
      testimonyKind: sigTestimonyKind,
      testimonyDurationSec: sigTestimonyKind === 'TEXT' ? undefined : 29,
      pledgedHours: sigPledgedHours,
      isVerifiedMember: true,
    });

    const nextBundle: ElevateMobilizeBundle = {
      ...bundle,
      petitions: bundle.petitions.map(p => (p.id === petition.id ? res.petition : p)),
      petitionSignatures: res.signatures,
    };
    updateBundle(nextBundle);
    setSigComment('');

    if (res.newlyUnlockedMilestones.length > 0) {
      const ms = res.newlyUnlockedMilestones[0];
      showToast(
        `Goal reached: ${ms.targetSignatures} signers`,
        `Your signature helped "${petition.title}" reach ${res.petition.signatureCount} signers.`,
        'emerald'
      );
    } else {
      showToast(
        'Verified Signature & Testimony Recorded!',
        `Added your verified Plajah signature${
          sigTestimonyKind !== 'TEXT' ? ` + 30s ${sigTestimonyKind === 'VOICE_30S' ? 'Voice' : 'Video'} Testimony` : ''
        } (+${sigPledgedHours}h pledged).`,
        'emerald'
      );
    }
  };

  const handleSimulateMilestoneUnlock = (petition: ElevatePetitionDrive) => {
    // Demo church only: adds sample signers so visitors can watch a goal being reached.
    if (!isDemo) return;
    const nextLocked = petition.milestones.find(m => !m.unlocked);
    if (!nextLocked) return;
    let curPetition = petition;
    let curSigs = bundle.petitionSignatures;
    const needed = Math.max(1, nextLocked.targetSignatures - curPetition.signatureCount);
    let unlockedLabel = '';

    for (let i = 0; i < needed; i++) {
      const res = signElevatePetition(curPetition, curSigs, {
        uid: `coalition_signer_${Date.now()}_${i}`,
        signerName: i === 0 ? 'Elder Miriam Vance' : `Coalition Neighbor #${curPetition.signatureCount + 1}`,
        signerCity: 'Atlanta, GA',
        signerRoleBadge: 'Verified Sanctuary Member',
        comment: 'Signing with our household to unlock the benevolence matching grant!',
        testimonyKind: 'VOICE_30S',
        testimonyDurationSec: 26,
        pledgedHours: 5,
      });
      curPetition = res.petition;
      curSigs = res.signatures;
      if (res.newlyUnlockedMilestones.length > 0) {
        unlockedLabel = res.newlyUnlockedMilestones[0].title;
      }
    }

    updateBundle({
      ...bundle,
      petitions: bundle.petitions.map(p => (p.id === petition.id ? curPetition : p)),
      petitionSignatures: curSigs,
    });

    showToast(
      unlockedLabel ? `Goal reached: ${nextLocked.targetSignatures} signers` : 'Sample signatures added',
      `"${petition.title}" now has ${curPetition.signatureCount} signers (demo).`,
      'emerald'
    );
  };

  const handleApplySpokeHost = () => {
    const campaign = bundle.spokeCampaigns[0];
    if (!campaign || !hostDraft.title.trim()) return;
    const res = applyToHostElevateSpoke(campaign, {
      hostUid: currentUserId,
      hostName: currentUserName,
      hostRoleBadge: `Verified Member · ${org.name}`,
      title: hostDraft.title.trim(),
      city: hostDraft.city.trim() || (isDemo ? 'Atlanta, GA' : ''),
      neighborhood: hostDraft.neighborhood.trim() || (isDemo ? 'Downtown' : ''),
      venueKind: hostDraft.venueKind,
      dateISO: hostDraft.dateISO,
      timeLabel: hostDraft.timeLabel,
      capacity: Number(hostDraft.capacity) || 20,
      notes: hostDraft.notes.trim(),
    });

    updateBundle({
      ...bundle,
      spokeCampaigns: bundle.spokeCampaigns.map(c => (c.id === campaign.id ? res.campaign : c)),
    });
    setShowHostModal(false);
    setHostDraft({ ...hostDraft, title: '', neighborhood: '', notes: '' });
    showToast(
      res.createdSpoke.status === 'APPROVED_LIVE'
        ? 'Spoke Event Live + Screening License Issued!'
        : 'Host Application Submitted for Vetting',
      `Your spoke "${res.createdSpoke.title}" is now in the Elevate Spoke Directory with Community Screening License ${campaign.screeningLicense?.licenseCode || 'INCLUDED'}.`,
      'emerald'
    );
  };

  const handleReviewSpoke = (spokeId: string, decision: 'APPROVE' | 'DECLINE') => {
    const campaign = bundle.spokeCampaigns[0];
    if (!campaign) return;
    const updated = reviewElevateSpokeHostEvent(campaign, spokeId, decision);
    updateBundle({
      ...bundle,
      spokeCampaigns: bundle.spokeCampaigns.map(c => (c.id === campaign.id ? updated : c)),
    });
    showToast(
      decision === 'APPROVE'
        ? 'Spoke Host Approved & Screening License Activated!'
        : 'Spoke Application Declined',
      decision === 'APPROVE'
        ? 'Host now has access to the synchronized Reello stream, Stage Follow-Along deck, and RSVP roster.'
        : 'Host application was declined.',
      decision === 'APPROVE' ? 'emerald' : 'amber'
    );
  };

  const handleRsvpSpoke = (spokeId: string, title: string) => {
    const campaign = bundle.spokeCampaigns[0];
    if (!campaign) return;
    const updated = rsvpToElevateSpokeEvent(campaign, spokeId);
    updateBundle({
      ...bundle,
      spokeCampaigns: bundle.spokeCampaigns.map(c => (c.id === campaign.id ? updated : c)),
    });
    showToast(
      `RSVP Confirmed for "${title}"`,
      'Added to your Elevate Calendar with Stage Mobile Follow-Along link and Post Man email confirmation.',
      'emerald'
    );
  };

  const handleCreateNewShiftSlot = () => {
    if (!newSlotDraft.roleTitle.trim()) return;
    const existingDrive =
      bundle.shiftDrives.find(d => d.id === newSlotDraft.driveId) || bundle.shiftDrives[0];
    // First shift for this org: open a simple "Volunteer shifts" drive to hold it.
    const now = Date.now();
    const targetDrive: ElevateShiftDrive = existingDrive || {
      id: `${org.id}_drive_${now}`,
      orgId: org.id,
      title: 'Volunteer shifts',
      subtitle: '',
      category: 'COMMUNITY_OUTREACH',
      coordinatorName: currentUserNameProp || '',
      slots: [],
      reminderCadence: getDefaultElevateReminderCadence(),
      createdAt: now,
      updatedAt: now,
    };

    const newSlot: ElevateShiftSlot = {
      id: `${org.id}_slot_${Date.now()}`,
      driveId: targetDrive.id,
      orgId: org.id,
      roleTitle: newSlotDraft.roleTitle.trim(),
      description: '',
      dateISO: newSlotDraft.dateISO,
      startTime: newSlotDraft.startTime,
      endTime: newSlotDraft.endTime,
      durationHours: Number(newSlotDraft.durationHours) || 2,
      locationLabel: newSlotDraft.locationLabel,
      capacity: Number(newSlotDraft.capacity) || 8,
      confirmedCount: 0,
      waitlistCount: 0,
      checkedInCount: 0,
      waitlistEnabled: true,
    };

    const updatedDrive: ElevateShiftDrive = {
      ...targetDrive,
      slots: [...targetDrive.slots, newSlot],
      updatedAt: Date.now(),
    };

    updateBundle({
      ...bundle,
      shiftDrives: existingDrive
        ? bundle.shiftDrives.map(d => (d.id === targetDrive.id ? updatedDrive : d))
        : [...bundle.shiftDrives, updatedDrive],
    });
    setShowNewSlotModal(false);
    setNewSlotDraft({ ...newSlotDraft, roleTitle: '' });
    showToast(
      'New Multi-Shift Slot Published',
      `Added "${newSlot.roleTitle}" (${newSlot.capacity} seats + auto-waitlist).`,
      'emerald'
    );
  };

  const navItems: {
    id: MobilizeTabId;
    label: string;
    badge?: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    {
      id: 'SHIFTS',
      label: vConfig.shiftsTabLabel,
      badge: `${summaryStats.totalSlots} Slots`,
      icon: Calendar,
    },
    {
      id: 'PETITIONS',
      label: vConfig.petitionsTabLabel,
      badge: `${summaryStats.totalPetitionSigs}`,
      icon: ScrollText,
    },
    {
      id: 'SPOKES',
      label: vConfig.spokesTabLabel,
      badge: `${summaryStats.spokeRollup.totalSpokes} Live`,
      icon: Globe,
    },
    {
      id: 'PASSPORT',
      label: vConfig.passportTabLabel,
      badge: `${passport.verifiedVolunteerHours}h`,
      icon: Award,
    },
    {
      id: 'REMINDERS_SYNERGY',
      label: vConfig.remindersTabLabel,
      badge: 'No-SMS Native',
      icon: Bell,
    },
    ...(canManage
      ? [
          {
            id: 'CRM_COALITION' as const,
            label: vConfig.crmTabLabel,
            badge: 'VAN · PCO · CSV',
            icon: FileSpreadsheet,
          },
          {
            id: 'CIVIC_COMPLIANCE' as const,
            label: 'Grassroots & Civic Compliance',
            badge: civicCompliance.enabled ? 'ACTIVE' : 'Opt-In',
            icon: ShieldCheck,
          },
        ]
      : civicCompliance.enabled || verticalLens === 'CIVIC_CAMPAIGN'
      ? [
          {
            id: 'CIVIC_COMPLIANCE' as const,
            label: 'Campaign Compliance & Disclaimers',
            badge: 'FEC / Local',
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  const VERTICAL_LENSES: { id: ActionHubVerticalKind; label: string }[] = [
    { id: 'ELEVATE_FAITH', label: 'Faith & Churches' },
    { id: 'ELEVATE_NONPROFIT', label: 'Nonprofits & Causes' },
    { id: 'ELEVATE_CULTURAL', label: 'Cultural Orgs' },
    { id: 'CIVIC_CAMPAIGN', label: 'Grassroots & Civic' },
    { id: 'ACADEMIA', label: 'Academia' },
    { id: 'CLUB', label: 'Clubs' },
    { id: 'BUSINESS', label: 'Business & Brands' },
  ];

  const disclaimerBox = useMemo(
    () => buildCampaignDisclaimerBox(civicCompliance),
    [civicCompliance]
  );
  const firewallStatus = useMemo(
    () =>
      validateCivicCampaignCoalitionFirewall(
        civicCompliance.taxClassification,
        ['501C3_PUBLIC_CHARITY'],
        civicCompliance.johnsonAmendmentFirewallActive
      ),
    [civicCompliance.taxClassification, civicCompliance.johnsonAmendmentFirewallActive]
  );
  const rewardGuardStatus = useMemo(
    () =>
      validateCivicCampaignRewardGuard(
        rewardGuardTestAction,
        true,
        civicCompliance.antiVoteBuyingRewardGuardActive
      ),
    [rewardGuardTestAction, civicCompliance.antiVoteBuyingRewardGuardActive]
  );

  const handleRecordCampaignContribution = () => {
    const res = validateAndRecordCampaignContribution(
      civicCompliance,
      campaignContributions,
      {
        orgId: org.id,
        donorFullName: contribDraft.donorFullName,
        donorEmail: contribDraft.donorEmail,
        streetAddress: contribDraft.streetAddress,
        city: contribDraft.city,
        state: contribDraft.state,
        postalCode: contribDraft.postalCode,
        occupation: contribDraft.occupation,
        employer: contribDraft.employer,
        amountUsd: Number(contribDraft.amountUsd),
        electionCycle: civicCompliance.electionCycleLabel,
        attestation: {
          isUsCitizenOrPermanentResident: contribDraft.isUsCitizenOrPermanentResident,
          isPersonalFunds: contribDraft.isPersonalFunds,
          isNotFederalOrMunicipalContractor: contribDraft.isNotFederalOrMunicipalContractor,
          isPersonalCardNotCorporate: contribDraft.isPersonalCardNotCorporate,
          isAtLeast18: contribDraft.isAtLeast18,
        },
      }
    );
    setContribErrors(res.errors);
    if (!res.ok || !res.record) {
      showToast(
        'Contribution Blocked by Compliance Gate',
        res.errors[0] || 'Check donor occupation, employer, street address, or aggregate cap.',
        'amber'
      );
      return;
    }
    updateBundle({
      ...bundle,
      campaignContributions: res.updatedContributions,
    });
    showToast(
      `Compliant Contribution Recorded ($${res.record.amountUsd})`,
      `Cycle-to-date aggregate for ${res.record.donorFullName}: $${res.record.aggregateCycleToDateUsd} / $${civicCompliance.perDonorElectionLimitUsd}. Non-tax-deductible receipt issued.`,
      'emerald'
    );
  };

  const handleExportCampaignComplianceCsv = () => {
    const csv = exportCampaignFinanceComplianceCsv(civicCompliance, campaignContributions);
    setComplianceCsvPreview(csv);
    showToast(
      'Treasurer & FEC Form 3 Compliance CSV Generated',
      `Exported ${campaignContributions.length} itemized contributions with occupation, employer, street address, and 5-point attestations.`,
      'emerald'
    );
  };

  const sampleDrive = bundle.shiftDrives.find(d => d.slots.length > 0);
  const sampleSlot = sampleDrive?.slots[0];
  const sampleSignup = (isDemo
    ? bundle.shiftSignups[0]
    : bundle.shiftSignups.find(s => s.uid === currentUserId && s.slotId === sampleSlot?.id)) || {
    id: 'sample_sig',
    driveId: sampleDrive?.id || 'd1',
    slotId: sampleSlot?.id || 's1',
    orgId: org.id,
    uid: currentUserId,
    userName: currentUserName,
    userEmail: currentUserEmail,
    status: 'CONFIRMED' as const,
    signedUpAt: Date.now(),
    verifiedHours: 0,
  };
  const liveReminderPreview =
    sampleDrive && sampleSlot
      ? buildNonSmsReminderPayload(sampleDrive, sampleSlot, sampleSignup, previewStage)
      : null;

  return (
    <div className="space-y-6 text-white">
      {/* ── Serve header: who we are serving with, today's word for the team, the numbers that matter ── */}
      <div className="flex flex-wrap gap-6 items-end justify-between">
        <div className="min-w-0" style={{ flex: '999 1 420px' }}>
          <EvLabel>Serve · {org.name}</EvLabel>
          <h2 className="m-0 mt-2 ev-display text-white" style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.25rem)' }}>
            {canManage ? vConfig.heroHeadlineSuffix : 'Serve with us.'}
          </h2>
          <p className="m-0 mt-3 text-[15px] leading-relaxed text-[#A49CB2] max-w-xl">
            Pick up a shift, bring a friend, and every hour you give is kept on your impact passport.
          </p>
        </div>
        <aside aria-label="Before you serve" className="ev-sheet p-5 sm:p-6 flex flex-col gap-1.5" style={{ flex: '1 1 300px', maxWidth: 420, borderRadius: 20 }}>
          <EvLabel>Verse · before you serve</EvLabel>
          <p className="m-0 ev-scripture text-[19px] leading-[1.45]">“Whatever you do, work heartily, as for the Lord, and not for men.”</p>
          <span className="text-xs ev-muted">Colossians 3:23</span>
        </aside>
      </div>

      <EvKpiStrip items={[
        { label: 'Confirmed on shifts', value: String(summaryStats.totalConfirmed), note: summaryStats.totalWaitlisted ? `+${summaryStats.totalWaitlisted} on the waitlist` : undefined },
        { label: 'Verified hours', value: `${summaryStats.totalVerifiedHours.toLocaleString()}h`, note: 'Stamped to impact passports', tone: 'up' },
        { label: 'Pledges & letters', value: summaryStats.totalPetitionSigs.toLocaleString(), note: `${summaryStats.totalPledgedHours.toLocaleString()}h pledged` },
        { label: 'Host chapters', value: String(summaryStats.spokeRollup.approvedLiveSpokes), note: `${summaryStats.spokeRollup.totalRsvps} RSVPs` },
      ]} />

      {canManage && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] text-[#A49CB2] mr-1">Vocabulary</span>
          {VERTICAL_LENSES.map(lens => (
            <Button key={lens.id} size="xs" variant={vConfig.vertical === lens.id ? 'accent' : 'ghost'} onClick={() => setVerticalLens(lens.id)}>
              {lens.label}
            </Button>
          ))}
        </div>
      )}

      {/* Live Toast Feedback Banner */}
      {toastBanner && (
        <Surface
          level={3}
          padded={false}
          className="p-4 flex items-start justify-between gap-3"
          style={{
            borderColor:
              toastBanner.tone === 'emerald'
                ? 'var(--pj-success)'
                : toastBanner.tone === 'amber'
                ? 'var(--pj-orange)'
                : 'var(--pj-magenta)',
          }}
        >
          <div className="space-y-0.5">
            <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-brand-orange">
              <Sparkles size={13} />
              <span>{toastBanner.title}</span>
            </div>
            <p className="text-xs text-white/85 leading-relaxed">{toastBanner.detail}</p>
          </div>
          <Button size="xs" variant="secondary" onClick={() => setToastBanner(null)}>
            Dismiss
          </Button>
        </Surface>
      )}

      {/* ── SUB-NAVIGATION TABS (Plajah DS Control Scale) ── */}
      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b" style={{ borderColor: EV.line }} role="tablist">
        {navItems.map(item => (
          <button key={item.id} role="tab" aria-selected={activeTab === item.id} aria-current={activeTab === item.id ? 'page' : undefined}
            onClick={() => setActiveTab(item.id)} className="ev-tab">
            {item.label}
          </button>
        ))}

        {canManage && (
          <Button
            size="sm"
            variant="accent"
            icon={<Plus />}
            className="ml-auto shrink-0"
            onClick={() => {
              setNewSlotDraft(d => ({
                ...d,
                driveId: bundle.shiftDrives[0]?.id || '',
              }));
              setShowNewSlotModal(true);
            }}
          >
            Add Shift Slot
          </Button>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 1: MULTI-SHIFT VOLUNTEER SCHEDULING, WAITLISTS & CHECK-IN
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'SHIFTS' && (
        <div className="space-y-6">
          {summaryStats.totalSlots === 0 && (
            <HubEmpty
              title="No shifts posted yet"
              detail={
                canManage
                  ? 'Post the first volunteer shift and members can sign up here.'
                  : 'When your leaders post volunteer shifts, they will show up here.'
              }
              action={
                canManage ? (
                  <Button
                    size="sm"
                    variant="accent"
                    icon={<Plus />}
                    onClick={() => {
                      setNewSlotDraft(d => ({ ...d, driveId: bundle.shiftDrives[0]?.id || '' }));
                      setShowNewSlotModal(true);
                    }}
                  >
                    Add Shift Slot
                  </Button>
                ) : undefined
              }
            />
          )}
          {bundle.shiftDrives.filter(drive => drive.slots.length > 0).map(drive => (
            <div
              key={drive.id}
              className="rounded-3xl p-5 sm:p-6 border border-white/12 bg-[#18141F]/90 space-y-5"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E2C27E]">
                      {drive.category.replace(/_/g, ' ')}
                    </span>
                    {drive.coalitionPartnerOrgIds && drive.coalitionPartnerOrgIds.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-[#7A1FC0]/25 text-[#D0BCFF] border border-[#7A1FC0]/40">
                        Coalition Co-Hosted ({drive.coalitionPartnerOrgIds.length + 1} Elevate Orgs)
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                      Non-SMS Cadence: Push + Post Man Email + .ICS
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-1">{drive.title}</h3>
                  {drive.subtitle && <p className="text-xs text-white/65 mt-0.5">{drive.subtitle}</p>}
                </div>

                {drive.coordinatorName && (
                  <div className="text-xs text-white/60 shrink-0">
                    <div>
                      Coordinator: <b className="text-white">{drive.coordinatorName}</b>
                    </div>
                    {drive.coordinatorRole && (
                      <div className="text-[10.5px] text-[#E2C27E]">{drive.coordinatorRole}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Shift Slots Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {drive.slots.map(slot => {
                  const slotSignups = bundle.shiftSignups.filter(
                    s => s.slotId === slot.id && s.status !== 'CANCELLED'
                  );
                  const mySignup = slotSignups.find(s => s.uid === currentUserId);
                  const isFull = slot.confirmedCount >= slot.capacity;
                  const fillPct = Math.min(
                    100,
                    Math.round((slot.confirmedCount / Math.max(1, slot.capacity)) * 100)
                  );

                  return (
                    <div
                      key={slot.id}
                      className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-mono uppercase text-[#E2C27E] flex items-center gap-1.5">
                              <Clock size={11} />
                              <span>
                                {slot.dateISO} · {slot.startTime} – {slot.endTime} ({slot.durationHours}h)
                              </span>
                            </div>
                            <h4 className="text-base font-bold text-white mt-1 leading-snug">
                              {slot.roleTitle}
                            </h4>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${
                              isFull
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                            }`}
                          >
                            {isFull
                              ? `Full · ${slot.waitlistCount} Waitlist`
                              : `${slot.capacity - slot.confirmedCount} Spots Open`}
                          </span>
                        </div>

                        {slot.description && (
                          <p className="text-xs text-white/65 leading-relaxed">{slot.description}</p>
                        )}

                        {slot.locationLabel && (
                          <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                            <MapPin size={11} className="text-[#E2C27E] shrink-0" />
                            <span className="truncate">{slot.locationLabel}</span>
                          </div>
                        )}

                        {/* Capacity Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-white/60">
                            <span>
                              Confirmed: <b className="text-white">{slot.confirmedCount}</b> /{' '}
                              {slot.capacity}
                            </span>
                            <span>
                              Checked In: <b className="text-emerald-400">{slot.checkedInCount}</b>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${fillPct}%`,
                                background: isFull
                                  ? 'linear-gradient(90deg, #F59E0B, #D40055)'
                                  : 'linear-gradient(90deg, #7A1FC0, #06D6A0)',
                              }}
                            />
                          </div>
                        </div>

                        {/* Active Roster Chips (allows testing Waitlist Auto-Promotion & Leader Check-In) */}
                        {slotSignups.length > 0 && (
                          <div className="pt-2 border-t border-white/10 space-y-1.5">
                            <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/45">
                              Shift Roster &amp; Waitlist Queue ({slotSignups.length})
                            </div>
                            <div className="space-y-1">
                              {slotSignups.map(sig => (
                                <div
                                  key={sig.id}
                                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px]"
                                >
                                  <div className="min-w-0 flex items-center gap-1.5">
                                    <span className="font-bold text-white truncate">
                                      {sig.userName}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase ${
                                        sig.status === 'COMPLETED'
                                          ? 'bg-emerald-500/25 text-emerald-300'
                                          : sig.status === 'WAITLISTED'
                                          ? 'bg-amber-500/25 text-amber-300'
                                          : 'bg-[#7A1FC0]/25 text-[#D0BCFF]'
                                      }`}
                                    >
                                      {sig.status}
                                      {sig.promotedFromWaitlistAt ? ' (Auto-Promoted)' : ''}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {sig.status !== 'COMPLETED' && sig.status !== 'WAITLISTED' && (
                                      <button
                                        onClick={() =>
                                          handleCheckInVolunteer(drive, sig, 'QR_PASS')
                                        }
                                        className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 text-[9.5px] font-bold"
                                        title="Verify Check-In & Stamp Hours"
                                      >
                                        Check In
                                      </button>
                                    )}
                                    {sig.status !== 'COMPLETED' && (
                                      <button
                                        onClick={() => handleCancelOrReleaseSlot(drive, sig)}
                                        className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 text-[9.5px] font-bold"
                                        title="Release Seat (Auto-promotes Waitlist if full)"
                                      >
                                        Release
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Primary Action Footer */}
                      <div className="pt-2 border-t border-white/10">
                        {mySignup ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-[#E2C27E]">
                                Your Status: {mySignup.status}
                              </span>
                              {mySignup.confirmedAttendance24h && (
                                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 size={11} /> 24h Confirmed
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {mySignup.status !== 'COMPLETED' && (
                                <button
                                  onClick={() =>
                                    handleCheckInVolunteer(drive, mySignup, 'SANCTUARY_GEOFENCE')
                                  }
                                  className="py-2 px-3 rounded-xl bg-emerald-500 text-black text-[11px] font-black flex items-center justify-center gap-1"
                                >
                                  <QrCode size={12} />
                                  <span>Check In (+{slot.durationHours}h)</span>
                                </button>
                              )}
                              {!mySignup.confirmedAttendance24h &&
                                mySignup.status === 'CONFIRMED' && (
                                  <button
                                    onClick={() => handleConfirm24h(mySignup.id)}
                                    className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold"
                                  >
                                    1-Tap 24h Confirm
                                  </button>
                                )}
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSignUpSlot(drive, slot)}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover:brightness-110"
                            style={{
                              background: isFull
                                ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                                : 'linear-gradient(135deg, #7A1FC0, #D40055)',
                              color: isFull ? '#000' : '#fff',
                            }}
                          >
                            <UserCheck size={14} />
                            <span>
                              {isFull
                                ? 'Join Auto-Promote Waitlist'
                                : `Sign Up for Shift (+${slot.durationHours}h)`}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 2: PETITIONS, OPEN LETTERS, COVENANTS & ACTION PLEDGES
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'PETITIONS' && (
        <div className="space-y-6">
          {bundle.petitions.length === 0 && (
            <HubEmpty
              title="No petitions yet"
              detail="Covenants, petitions and open letters your organization starts will appear here for members to sign."
            />
          )}
          {bundle.petitions.map(pet => {
            const pct = Math.min(
              100,
              Math.round((pet.signatureCount / Math.max(1, pet.goalSignatures)) * 100)
            );
            const petSigs = bundle.petitionSignatures.filter(s => s.petitionId === pet.id);
            const isSigningThis = selectedPetitionId === pet.id;

            return (
              <div
                key={pet.id}
                className="rounded-3xl p-6 border border-[#E2C27E]/30 bg-[#18141F]/90 space-y-5"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 max-w-3xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-widest bg-[#E2C27E] text-black">
                        {pet.kind.replace(/_/g, ' ')}
                      </span>
                      {pet.recipientTarget && (
                        <span className="text-xs text-white/60">
                          To: <b className="text-white">{pet.recipientTarget}</b>
                        </span>
                      )}
                      {pet.telaExportReady && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[#7A1FC0]/25 text-[#D0BCFF] border border-[#7A1FC0]/40">
                          Tela Studio Dossier Ready
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl font-black text-white">{pet.title}</h3>
                    <p className="text-xs sm:text-sm text-white/75 leading-relaxed">
                      {pet.summary}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setTelaDossierModal({
                          title: pet.title,
                          markdown: buildPetitionTelaDossierMarkdown(pet, bundle.petitionSignatures),
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-[#D8D2E2] flex items-center gap-1.5"
                    >
                      <FileText size={13} />
                      <span>Export to Tela Dossier</span>
                    </button>
                    <button
                      onClick={() =>
                        setSelectedPetitionId(isSigningThis ? null : pet.id)
                      }
                      className="px-4 py-2 rounded-xl text-xs font-black text-black bg-[#E2C27E] hover:brightness-110 flex items-center gap-1.5"
                    >
                      <Flame size={13} />
                      <span>{isSigningThis ? 'Close Signer Drawer' : 'Sign & Add Voice Testimony'}</span>
                    </button>
                  </div>
                </div>

                {/* Progress Bar & Plajah Milestone Unlocks */}
                <div className="p-4 rounded-2xl bg-black/45 border border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>
                        <b className="text-[#E2C27E] text-base font-black tabular-nums">
                          {pet.signatureCount.toLocaleString()}
                        </b>{' '}
                        / {pet.goalSignatures.toLocaleString()} Signatures ({pct}%)
                      </span>
                      <span className="text-white/60">
                        🎙️ <b className="text-white">{pet.voiceTestimonyCount}</b> Voice/Video Testimonies
                      </span>
                      <span className="text-white/60">
                        ⏱️ <b className="text-emerald-400">{pet.totalPledgedHours.toLocaleString()}h</b> Pledged
                      </span>
                    </div>

                    {isDemo && pet.milestones.some(m => !m.unlocked) && (
                      <button
                        onClick={() => handleSimulateMilestoneUnlock(pet)}
                        className="px-3 py-1 rounded-lg bg-[#7A1FC0]/60 hover:bg-[#7A1FC0] border border-[#E2C27E]/40 text-[10.5px] font-bold text-[#F0D9A6]"
                      >
                        ⚡ Simulate Reaching Next Milestone
                      </button>
                    )}
                  </div>

                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, #7A1FC0, #D40055, #E2C27E)',
                      }}
                    />
                  </div>

                  {/* Milestones Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    {pet.milestones.map(ms => (
                      <div
                        key={ms.id}
                        className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-1 ${
                          ms.unlocked
                            ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
                            : 'bg-white/[0.03] border-white/10 text-white/65'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-[10px] uppercase tracking-wider">
                            Goal: {ms.targetSignatures} Signers
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase ${
                              ms.unlocked
                                ? 'bg-emerald-400 text-black'
                                : 'bg-white/10 text-white/60'
                            }`}
                          >
                            {ms.unlocked ? 'Reached ✓' : 'In progress'}
                          </span>
                        </div>
                        <div className="font-bold text-white">{ms.title}</div>
                        <p className="text-[11px] opacity-80 leading-snug">{ms.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Signer Drawer with 30s Voice/Video Testimony & Action Hours */}
                {isSigningThis && (
                  <div className="p-5 rounded-2xl bg-[#7A1FC0]/25 border border-[#E2C27E]/50 space-y-4">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-[#E2C27E]">
                      Add Your Verified Plajah Signature &amp; 30-Second Testimony
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-white/65 block mb-1">
                          Your City / Neighborhood
                        </label>
                        <input
                          value={sigCity}
                          onChange={e => setSigCity(e.target.value)}
                          className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-white/65 block mb-1">
                          Attach Plajah Testimony Format
                        </label>
                        <div className="flex gap-1.5">
                          {(
                            [
                              ['VOICE_30S', '🎙️ 30s Voice'],
                              ['VIDEO_30S', '🎬 30s Video'],
                              ['TEXT', '✍️ Written'],
                            ] as const
                          ).map(([k, lbl]) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setSigTestimonyKind(k)}
                              className={`flex-1 py-2 px-2 rounded-xl text-[10.5px] font-bold border ${
                                sigTestimonyKind === k
                                  ? 'bg-[#E2C27E] text-black border-[#E2C27E]'
                                  : 'bg-black/40 text-white/70 border-white/15'
                              }`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-white/65 block mb-1">
                          Pledged Action / Service Hours
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={sigPledgedHours}
                          onChange={e => setSigPledgedHours(Number(e.target.value))}
                          className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-white/65 block mb-1">
                        Public Covenant Reflection / Testimony Quote
                      </label>
                      <textarea
                        rows={2}
                        value={sigComment}
                        onChange={e => setSigComment(e.target.value)}
                        placeholder="Why are you signing this covenant or open letter?"
                        className="w-full rounded-xl bg-black/50 border border-white/15 p-3 text-xs text-white"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleSignPetition(pet)}
                        className="px-5 py-2.5 rounded-xl bg-[#E2C27E] text-black text-xs font-black flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={14} />
                        <span>Sign &amp; Stamp Verified Signature</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Recent Verified Signatures & Voice Testimonies Wall */}
                <div className="space-y-2">
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/50">
                    Living Testimony Wall ({petSigs.length} Featured Signers)
                  </div>
                  {petSigs.length === 0 && (
                    <p className="m-0 text-xs text-[#A49CB2]">No signatures yet. Be the first to sign.</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {petSigs.slice(0, 6).map(sig => (
                      <div
                        key={sig.id}
                        className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white">{sig.signerName}</span>
                          {sig.testimonyKind && sig.testimonyKind !== 'TEXT' && (
                            <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-[#D40055]/30 text-[#FFB3C6] border border-[#D40055]/50 flex items-center gap-1">
                              {sig.testimonyKind === 'VOICE_30S' ? (
                                <Mic size={9} />
                              ) : (
                                <Video size={9} />
                              )}
                              <span>{sig.testimonyDurationSec || 30}s Testimony</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#E2C27E] font-semibold">
                          {[sig.signerRoleBadge, sig.signerCity].filter(Boolean).join(' · ')}
                        </div>
                        {sig.comment && (
                          <p className="text-[11px] text-white/75 italic leading-snug">
                            “{sig.comment}”
                          </p>
                        )}
                        {sig.pledgedHours ? (
                          <div className="text-[10px] font-mono text-emerald-400 pt-1 border-t border-white/10">
                            Pledged: +{sig.pledgedHours}h of service
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 3: DISTRIBUTED PEER-TO-PEER SPOKE HOSTING & COMMUNITY SCREENINGS
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'SPOKES' && (
        <div className="space-y-6">
          {bundle.spokeCampaigns.length === 0 && (
            <HubEmpty
              title="No host chapters yet"
              detail="Home groups, watch parties and local chapters your organization opens for hosting will be listed here."
            />
          )}
          {bundle.spokeCampaigns.map(camp => {
            const rollup = computeSpokeCampaignRollup(camp);
            return (
              <div
                key={camp.id}
                className="rounded-3xl p-6 border border-white/12 bg-[#18141F]/90 space-y-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div className="space-y-2 max-w-3xl">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FF8C00]">
                      Distributed Peer-to-Peer Chapter &amp; Watch Party Engine
                    </div>
                    <h3 className="text-2xl font-black text-white">{camp.title}</h3>
                    <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
                      {camp.subtitle}
                    </p>
                  </div>

                  <button
                    onClick={() => setShowHostModal(true)}
                    className="px-4 py-2.5 rounded-2xl text-xs font-black text-black bg-[#E2C27E] hover:brightness-110 flex items-center gap-1.5 shrink-0"
                  >
                    <Plus size={14} />
                    <span>Apply to Host a Local Spoke / Watch Party</span>
                  </button>
                </div>

                {/* Plajah-Exclusive Community Screening License Banner */}
                {camp.screeningLicense && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-[#7A1FC0]/40 via-[#D40055]/25 to-black/60 border border-[#E2C27E]/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#E2C27E]">
                        <Film size={13} />
                        <span>
                          Plajah-Exclusive Community Screening License Included for Vetted Hosts
                        </span>
                      </div>
                      <div className="text-base font-bold text-white">
                        {camp.screeningLicense.assetTitle}
                      </div>
                      <div className="text-xs text-white/70">
                        License Key:{' '}
                        <code className="px-1.5 py-0.5 rounded bg-black/50 text-[#F0D9A6] font-mono">
                          {camp.screeningLicense.licenseCode}
                        </code>{' '}
                        · Includes Synchronized Stage Follow-Along Slide Deck + Tela Discussion Guide
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <div className="px-3 py-2 rounded-xl bg-black/45 border border-white/10 text-center">
                        <div className="text-[9px] uppercase text-white/50">Approved Spokes</div>
                        <div className="text-lg font-black text-emerald-400">
                          {rollup.approvedLiveSpokes}
                        </div>
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-black/45 border border-white/10 text-center">
                        <div className="text-[9px] uppercase text-white/50">Total RSVPs</div>
                        <div className="text-lg font-black text-white">{rollup.totalRsvps}</div>
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-black/45 border border-white/10 text-center">
                        <div className="text-[9px] uppercase text-white/50">Cities</div>
                        <div className="text-lg font-black text-[#E2C27E]">
                          {rollup.citiesReached.length}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Spoke Host Cards */}
                {camp.spokes.length === 0 && (
                  <p className="m-0 text-xs text-[#A49CB2]">No hosts yet. Apply above to host the first one.</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {camp.spokes.map(spoke => (
                    <div
                      key={spoke.id}
                      className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-white/10 text-[#D8D2E2]">
                            {spoke.venueKind.replace(/_/g, ' ')}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              spoke.status === 'APPROVED_LIVE'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                : spoke.status === 'PENDING_VETTING'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {spoke.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-white leading-snug">
                          {spoke.title}
                        </h4>

                        <div className="text-xs text-white/70">
                          Host: <b className="text-white">{spoke.hostName}</b>
                          <div className="text-[10px] text-[#E2C27E]">{spoke.hostRoleBadge}</div>
                        </div>

                        <div className="text-[11px] text-white/60 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={11} className="text-[#E2C27E]" />
                            <span>
                              {[spoke.neighborhood, spoke.city].filter(Boolean).join(' · ') || 'Location to be announced'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock size={11} className="text-[#E2C27E]" />
                            <span>
                              {spoke.dateISO} · {spoke.timeLabel}
                            </span>
                          </div>
                        </div>

                        {spoke.notes && (
                          <p className="text-[11px] text-white/60 italic bg-black/35 p-2.5 rounded-xl border border-white/5">
                            “{spoke.notes}”
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <div className="flex justify-between text-[10.5px] font-mono text-white/65">
                          <span>
                            RSVPs: <b className="text-white">{spoke.rsvpCount}</b> / {spoke.capacity}
                          </span>
                          {spoke.hostVetted && (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <ShieldCheck size={11} /> Vetted Host
                            </span>
                          )}
                        </div>

                        {spoke.status === 'APPROVED_LIVE' && (
                          <button
                            onClick={() => handleRsvpSpoke(spoke.id, spoke.title)}
                            className="w-full py-2 rounded-xl bg-[#7A1FC0] hover:bg-[#7A1FC0] text-white text-xs font-black transition-all"
                          >
                            RSVP to Local Spoke ({spoke.capacity - spoke.rsvpCount} seats left)
                          </button>
                        )}

                        {spoke.status === 'PENDING_VETTING' && (canManage || isDemo) && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReviewSpoke(spoke.id, 'APPROVE')}
                              className="flex-1 py-2 rounded-xl bg-emerald-500 text-black text-xs font-black"
                            >
                              Approve &amp; Issue License
                            </button>
                            <button
                              onClick={() => handleReviewSpoke(spoke.id, 'DECLINE')}
                              className="py-2 px-3 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-bold"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 4: MY IMPACT PASSPORT (computed only from this org's real shifts & signatures)
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'PASSPORT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-12 rounded-3xl p-6 border border-[#E2C27E]/35 bg-[#18141F]/90 space-y-5">
            <div>
              <EvLabel>Service record · {org.name}</EvLabel>
              <h3 className="text-2xl font-black text-white mt-1">
                {currentUserNameProp || isDemo ? `${currentUserName}’s impact passport` : 'Your impact passport'}
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10">
                <div className="text-[10px] uppercase text-white/50 font-bold">Verified Hours</div>
                <div className="text-2xl font-black text-emerald-400 mt-1">{passport.verifiedVolunteerHours}h</div>
                <div className="text-[10px] text-white/50">From checked-in shifts</div>
              </div>
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10">
                <div className="text-[10px] uppercase text-white/50 font-bold">Completed Shifts</div>
                <div className="text-2xl font-black text-white mt-1">{passport.completedShiftsCount}</div>
                <div className="text-[10px] text-white/50">{passport.upcomingShiftsCount} upcoming</div>
              </div>
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10">
                <div className="text-[10px] uppercase text-white/50 font-bold">Petitions Signed</div>
                <div className="text-2xl font-black text-white mt-1">{passport.petitionsSignedCount}</div>
                <div className="text-[10px] text-white/50">Covenants, letters &amp; pledges</div>
              </div>
              <div className="p-4 rounded-2xl bg-black/45 border border-white/10">
                <div className="text-[10px] uppercase text-white/50 font-bold">Gatherings Hosted</div>
                <div className="text-2xl font-black text-white mt-1">{passport.spokesHostedCount}</div>
                <div className="text-[10px] text-white/50">Home groups &amp; watch parties</div>
              </div>
            </div>

            {passport.verifiedVolunteerHours === 0 &&
              passport.upcomingShiftsCount === 0 &&
              passport.petitionsSignedCount === 0 &&
              passport.spokesHostedCount === 0 && (
                <p className="m-0 text-xs text-[#A49CB2] leading-relaxed">
                  Nothing recorded yet. Sign up for a shift and check in when you serve; your hours are added here.
                </p>
              )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 5: NON-SMS REMINDER CADENCE & POST-EVENT ARIA SYNERGY STUDIO
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'REMINDERS_SYNERGY' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 Cols: Cadence Controls */}
          <div className="lg:col-span-5 rounded-3xl p-6 border border-white/12 bg-[#18141F]/90 space-y-5">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E2C27E]">
                100% Non-SMS Native Mobilization Loop
              </div>
              <h3 className="text-xl font-black text-white mt-1">
                In-App Push + The Post Man Email + ARIA Post-Event Synergy
              </h3>
              <p className="text-xs text-white/65 mt-1 leading-relaxed">
                Replaces expensive external SMS blasts with interactive Plajah Notification Center
                quick-actions, RFC 8058 compliant Post Man emails, and automatic post-event content
                repurposing.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/60">
                Select Stage to Preview &amp; Test Dispatch
              </div>
              {(
                [
                  ['72H_PREP', '1. 72h Prior · Role Prep & Ministry Room Brief'],
                  ['24H_CONFIRM', '2. 24h Prior · 1-Tap Confirm or Auto-Promote Waitlist'],
                  ['WAITLIST_PROMOTED', '3. Instant · Automatic Waitlist Promotion Alert'],
                  ['1H_DOORS', '4. 1h Prior · Sanctuary Geofence & QR Check-In Pass'],
                  ['POST_EVENT_SYNERGY', '5. Post-Shift · Impact Receipt + Photo Pool + ARIA Brief'],
                ] as const
              ).map(([st, lbl]) => (
                <button
                  key={st}
                  onClick={() => setPreviewStage(st)}
                  className={`w-full text-left p-3 rounded-2xl border text-xs font-bold transition-all ${
                    previewStage === st
                      ? 'bg-[#7A1FC0]/50 border-[#E2C27E] text-white'
                      : 'bg-white/[0.03] border-white/10 text-white/65 hover:text-white'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Right 7 Cols: Interactive Preview of In-App Quick Actions + Post Man Email + ARIA Job */}
          <div className="lg:col-span-7 rounded-3xl p-6 border border-[#E2C27E]/35 bg-[#18141F]/90 space-y-5">
            {!liveReminderPreview && (
              <p className="m-0 text-xs text-[#A49CB2] leading-relaxed">
                Reminder previews appear here once a shift is posted.
              </p>
            )}
            {liveReminderPreview && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-[#E2C27E]">
                    Live Multi-Channel Payload Preview ({liveReminderPreview.stage})
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {liveReminderPreview.channels.map(ch => (
                      <span
                        key={ch}
                        className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-white/10 text-[#D8D2E2]"
                      >
                        {ch.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Simulated Plajah In-App Notification Card with 1-Tap Quick Actions */}
                <div className="p-4 rounded-2xl bg-black/55 border border-[#7A1FC0]/45 space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#D0BCFF]">
                    <span className="flex items-center gap-1.5">
                      <Bell size={12} className="text-[#E2C27E]" /> Plajah Notification Center (In-App Push)
                    </span>
                    <span>Interactive Quick-Actions</span>
                  </div>
                  <div className="text-sm font-black text-white">{liveReminderPreview.title}</div>
                  <p className="text-xs text-white/75 leading-relaxed">
                    {liveReminderPreview.body}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {liveReminderPreview.quickActions.map(qa => (
                      <button
                        key={qa.action}
                        onClick={() =>
                          showToast(
                            `Executed Quick-Action: ${qa.label}`,
                            `Triggered ${qa.action} directly from the notification card.`,
                            'emerald'
                          )
                        }
                        className="px-3 py-1.5 rounded-xl bg-[#E2C27E] text-black text-[11px] font-black"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Simulated The Post Man Email Preview */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <Mail size={12} /> The Post Man Email Campaign (RFC 8058 List-Unsubscribe + .ICS)
                    </span>
                    <span>CAN-SPAM Compliant</span>
                  </div>
                  <div className="text-xs font-bold text-white">
                    Subject: {liveReminderPreview.postManEmailSubject}
                  </div>
                  <div
                    className="text-xs text-white/70 bg-white/[0.03] p-3 rounded-xl border border-white/5"
                    dangerouslySetInnerHTML={{ __html: liveReminderPreview.postManHtmlPreview }}
                  />
                </div>

                {/* Post-Event ARIA Repurpose & Photo Pool Synergy */}
                {liveReminderPreview.ariaRepurposeJobDraft && (
                  <div className="p-4 rounded-2xl bg-[#7A1FC0]/25 border border-[#E2C27E]/40 space-y-1.5">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#E2C27E] flex items-center gap-1.5">
                      <Sparkles size={12} /> Plajah Post-Event ARIA &amp; Community Photo Pool Synergy
                    </div>
                    <p className="text-xs text-white/85">
                      Automatically queues ARIA Content Repurpose Job{' '}
                      <b>“{liveReminderPreview.ariaRepurposeJobDraft.sourceTitle}”</b> (turning the
                      service/drive into an article, newsletter recap, and podcast clip) and prompts
                      volunteers to upload photos to the shared <b>Event Photo Pool</b>.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 6: COALITION CO-HOSTING & EXTERNAL CRM SYNC BRIDGE (ADMIN)
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'CRM_COALITION' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 6 Cols: Connected CRM Profiles */}
          <div className="lg:col-span-6 rounded-3xl p-6 border border-white/12 bg-[#18141F]/90 space-y-4">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E2C27E]">
                Bi-Directional ChMS &amp; Civic CRM Sync Bridge
              </div>
              <h3 className="text-xl font-black text-white mt-1">
                Planning Center · NGP VAN / EveryAction · Servant Keeper · NationBuilder
              </h3>
            </div>

            <div className="space-y-3">
              {bundle.crmProfiles.length === 0 && (
                <p className="m-0 text-xs text-[#A49CB2] leading-relaxed">
                  No CRM connections yet. Use the CSV bridge to import or export people, shifts and signatures.
                </p>
              )}
              {bundle.crmProfiles.map(prof => (
                <div
                  key={prof.id}
                  onClick={() => setSelectedCrmProvider(prof.provider)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    selectedCrmProvider === prof.provider
                      ? 'bg-[#7A1FC0]/40 border-[#E2C27E]'
                      : 'bg-white/[0.03] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">{prof.label}</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      {prof.direction} · {prof.status}
                    </span>
                  </div>
                  {prof.webhookEndpoint && (
                    <div className="text-[10px] font-mono text-white/50 mt-1 truncate">
                      Webhook: {prof.webhookEndpoint}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-[#D8D2E2]">
                    {prof.syncPeopleToChms && <span>✓ ChmsPerson</span>}
                    {prof.syncShiftsToAttendance && <span>✓ ChmsAttendance</span>}
                    {prof.syncPetitionsToTags && <span>✓ Petition Tags</span>}
                    {prof.syncGivingToPledges && <span>✓ ChmsPledge</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right 6 Cols: Interactive CSV Import / Export Tester */}
          <div className="lg:col-span-6 rounded-3xl p-6 border border-[#E2C27E]/35 bg-[#18141F]/90 space-y-4">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#E2C27E]">
              Interactive CRM Import / Export Bridge ({selectedCrmProvider})
            </div>

            <div className="space-y-2">
              <label className="text-[10.5px] font-bold uppercase text-white/65 block">
                Paste External CRM CSV to Map into Elevate ChmsPerson
              </label>
              <textarea
                rows={4}
                value={csvImportInput}
                onChange={e => setCsvImportInput(e.target.value)}
                className="w-full rounded-xl bg-black/50 border border-white/15 p-3 text-xs font-mono text-white"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const mapped = mapExternalCrmCsvToElevateChms(
                      selectedCrmProvider,
                      csvImportInput,
                      org.id
                    );
                    setImportedChmsPeople(mapped);
                    showToast(
                      `Imported ${mapped.length} Records into Elevate ChMS`,
                      `Mapped ${selectedCrmProvider} CSV rows into ChmsPerson records with ministry & activist tags.`,
                      'emerald'
                    );
                  }}
                  className="px-4 py-2 rounded-xl bg-[#E2C27E] text-black text-xs font-black flex items-center gap-1.5"
                >
                  <Upload size={13} />
                  <span>Import CSV into ChMS</span>
                </button>

                <button
                  onClick={() => {
                    const csv = exportElevateMobilizeToCrmCsv(
                      selectedCrmProvider,
                      org.id,
                      bundle.shiftSignups,
                      bundle.petitionSignatures
                    );
                    setExportedCsvPreview(csv);
                    showToast(
                      `Generated ${selectedCrmProvider} Export CSV`,
                      `Exported ${bundle.shiftSignups.length} volunteer shifts and ${bundle.petitionSignatures.length} petition signatures.`,
                      'emerald'
                    );
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5"
                >
                  <Download size={13} />
                  <span>Export Shifts &amp; Petitions CSV</span>
                </button>
              </div>
            </div>

            {importedChmsPeople.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-black/45 border border-emerald-400/35 space-y-2">
                <div className="text-[10px] font-black uppercase text-emerald-400">
                  Imported ChmsPerson Records ({importedChmsPeople.length})
                </div>
                {importedChmsPeople.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs border-b border-white/10 pb-1.5 last:border-0"
                  >
                    <span className="font-bold text-white">
                      {p.firstName} {p.lastName} ({p.email})
                    </span>
                    <span className="text-[10px] font-mono text-[#E2C27E]">
                      {p.tags?.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {exportedCsvPreview && (
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-[#D8D2E2]">
                  Exported CRM Sync CSV Preview
                </div>
                <pre className="p-3 rounded-xl bg-black/60 border border-white/10 text-[10px] font-mono text-white/80 overflow-x-auto">
                  {exportedCsvPreview}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 7: GRASSROOTS & LOCAL CIVIC CAMPAIGN COMPLIANCE MODE (OPT-IN)
      ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'CIVIC_COMPLIANCE' && (
        <div className="space-y-6">
          {/* Header & Opt-In Mode Switch */}
          <Surface level={3} shape="sheet" brand>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-3xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <Chip selected={civicCompliance.enabled} className="text-[10px] uppercase tracking-wider">
                    <ShieldCheck size={12} />{' '}
                    {civicCompliance.enabled
                      ? 'Grassroots & Civic Campaign Compliance Mode: ACTIVE'
                      : 'Grassroots & Civic Campaign Compliance Mode: OPT-IN STANDBY'}
                  </Chip>
                  <Chip className="text-[10px] uppercase tracking-wider">
                    FEC 11 CFR § 104.7 · 11 CFR § 110.11 · 26 U.S.C. § 501(c)(3) · 18 U.S.C. § 597
                  </Chip>
                </div>
                <Eyebrow>BUILT FOR GRASSROOTS CANDIDATES, SCHOOL BOARDS, CITY COUNCILS &amp; LOCAL BALLOT DRIVES</Eyebrow>
                <h3
                  className="text-xl sm:text-2xl font-black tracking-tight text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Turnkey Campaign Finance, Disclaimer &amp; Firewall Shield
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  Grassroots candidates shouldn’t have to spend $1,500+/month stitching together separate enterprise political tools.
                  Enabling this mode locks on statutory <b className="text-brand-orange">“Paid for by…” box disclaimers</b>,{' '}
                  <b className="text-state-success">Occupation / Employer / Physical Street Address contribution gates</b>,{' '}
                  <b className="text-brand-cyan">501(c)(3) Johnson Amendment coalition firewalls</b>, and{' '}
                  <b className="text-brand-lilac">18 U.S.C. § 597 volunteer-only reward guards</b>.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <Button
                  variant={civicCompliance.enabled ? 'secondary' : 'primary'}
                  size="md"
                  onClick={() => {
                    const nextEnabled = !civicCompliance.enabled;
                    updateCivicCompliance({ enabled: nextEnabled });
                    if (nextEnabled) {
                      setVerticalLens('CIVIC_CAMPAIGN');
                    }
                    showToast(
                      nextEnabled
                        ? 'Grassroots & Civic Campaign Compliance Mode Enabled'
                        : 'Civic Campaign Compliance Mode Set to Standby',
                      nextEnabled
                        ? 'Statutory Paid-For-By box, non-deductible tax notices, 501(c)(3) coalition firewall, and FEC/local donor gates are now active.'
                        : 'Reverted workspace to standard 501(c)(3) / organizational mode.',
                      nextEnabled ? 'emerald' : 'purple'
                    );
                  }}
                >
                  {civicCompliance.enabled ? 'Disable Campaign Mode' : 'Enable Grassroots Campaign Mode'}
                </Button>
              </div>
            </div>

            {/* Live Statutory "Paid for by..." Box Preview (11 CFR § 110.11) */}
            <div className="mt-5 p-4 rounded-2xl bg-black/60 border-2 border-white/80 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-orange">
                  Statutory Bordered Box Disclaimer Preview (11 CFR § 110.11 / Local Election Code)
                </span>
                <span className="text-[10px] font-mono text-state-success">
                  Auto-injected on Campaign Pages, Post Man Emails, Reello Lower-Thirds &amp; Tela PDFs
                </span>
              </div>
              <div className="p-3 border border-white/90 text-xs font-mono font-bold text-white tracking-wide">
                {disclaimerBox.headlineBoxText}
              </div>
              <div className="text-[11px] text-amber-300 font-semibold">
                {disclaimerBox.taxNotice}
              </div>
              <div className="text-[11px] text-white/65">
                <b className="text-white">0% Plajah Platform Fee + FEC 11 CFR § 100.52(d) Merchant Pass-Through Rule:</b>{' '}
                Plajah charges 0% platform markup on contributions. Standard Stripe merchant processing rates (2.9% + $0.30) are deducted directly from the Committee’s connected Stripe account (or optionally covered by the donor within their aggregate limit) so no prohibited corporate in-kind fee subsidy occurs.
              </div>
              {disclaimerBox.syntheticMediaNotice && (
                <div className="text-[11px] text-brand-cyan">
                  {disclaimerBox.syntheticMediaNotice}
                </div>
              )}
            </div>
          </Surface>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* LEFT COLUMN: Committee & Guardrail Configuration */}
            <Surface level={2} shape="sheet" className="lg:col-span-6 space-y-4">
              <div>
                <Eyebrow>COMMITTEE REGISTRATION &amp; JURISDICTION</Eyebrow>
                <h4 className="text-base font-black text-white">
                  1. Candidate / Committee Identity &amp; Contribution Caps
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold uppercase text-white/60 block mb-1">
                    Jurisdiction Level
                  </label>
                  <select
                    value={civicCompliance.jurisdiction}
                    onChange={e =>
                      updateCivicCompliance({
                        jurisdiction: e.target.value as ElevateCampaignJurisdiction,
                      })
                    }
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  >
                    <option value="GRASSROOTS_MUNICIPAL">Grassroots Municipal (City Council / Mayor)</option>
                    <option value="SCHOOL_BOARD_COUNTY">School Board / County Commission</option>
                    <option value="BALLOT_MEASURE">Local Ballot Measure / Referendum</option>
                    <option value="STATE_LEGISLATIVE">State House / State Senate</option>
                    <option value="FEDERAL_FEC">Federal (U.S. House / Senate · FEC)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-white/60 block mb-1">
                    Tax / Legal Classification
                  </label>
                  <select
                    value={civicCompliance.taxClassification}
                    onChange={e =>
                      updateCivicCompliance({
                        taxClassification: e.target.value as ElevateCampaignTaxClassification,
                      })
                    }
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  >
                    <option value="527_CANDIDATE_COMMITTEE">527 Candidate Campaign Committee</option>
                    <option value="BALLOT_QUESTION_COMMITTEE">Ballot Question / Initiative Committee</option>
                    <option value="501C4_CIVIC_ACTION">501(c)(4) Civic Social Welfare Org</option>
                    <option value="501C3_PUBLIC_CHARITY">501(c)(3) Nonpartisan Voter Ed Charity</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-white/60 block mb-1">
                    Committee Legal Name
                  </label>
                  <input
                    value={civicCompliance.committeeLegalName}
                    onChange={e => updateCivicCompliance({ committeeLegalName: e.target.value })}
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-white/60 block mb-1">
                    Treasurer Full Name &amp; Contact
                  </label>
                  <input
                    value={civicCompliance.treasurerFullName}
                    onChange={e => updateCivicCompliance({ treasurerFullName: e.target.value })}
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-white/60 block mb-1">
                    Candidate Name &amp; Office Sought
                  </label>
                  <input
                    value={civicCompliance.candidateName || ''}
                    onChange={e => updateCivicCompliance({ candidateName: e.target.value })}
                    placeholder="e.g. Candidate name · Office"
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-white/60 block mb-1">
                    Per-Donor Election Limit (USD)
                  </label>
                  <input
                    type="number"
                    value={civicCompliance.perDonorElectionLimitUsd}
                    onChange={e =>
                      updateCivicCompliance({
                        perDonorElectionLimitUsd: Math.max(25, Number(e.target.value) || 3300),
                      })
                    }
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Automated Statutory Firewalls */}
              <div className="pt-2 space-y-2.5 border-t border-white/10">
                <div className="text-xs font-extrabold uppercase tracking-wider text-brand-orange">
                  Active Statutory Firewalls &amp; Verifiers
                </div>

                <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      26 U.S.C. § 501(c)(3) “Johnson Amendment” Coalition Firewall
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        !firewallStatus.allowed
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : 'bg-white/10 text-white/75'
                      }`}
                    >
                      {!firewallStatus.allowed ? '501(c)(3) Co-Hosting Blocked' : 'Nonpartisan Safe'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/65 leading-relaxed">{firewallStatus.reason}</p>
                </div>

                <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">
                      18 U.S.C. § 597 Anti-Vote-Buying Reward Guardrail
                    </span>
                    <select
                      value={rewardGuardTestAction}
                      onChange={e =>
                        setRewardGuardTestAction(
                          e.target.value as
                            | 'VOLUNTEER_LABOR_SHIFT'
                            | 'VOTER_REGISTRATION'
                            | 'VOTE_PLEDGE'
                            | 'BALLOT_RETURN'
                        )
                      }
                      className="rounded-lg bg-black/60 border border-white/20 px-2.5 py-1 text-[10px] text-white"
                    >
                      <option value="VOLUNTEER_LABOR_SHIFT">Test: Canvass / Phonebank Shift</option>
                      <option value="VOTER_REGISTRATION">Test: Voter Registration</option>
                      <option value="VOTE_PLEDGE">Test: Pledge to Vote</option>
                      <option value="BALLOT_RETURN">Test: Ballot Return</option>
                    </select>
                  </div>
                  <p
                    className={`text-[11px] leading-relaxed ${
                      rewardGuardStatus.allowed ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {rewardGuardStatus.reason}
                  </p>
                </div>
              </div>
            </Surface>

            {/* RIGHT COLUMN: Compliant Grassroots Contribution Gate & FEC/Treasurer CSV Export */}
            <Surface level={2} shape="sheet" className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <Eyebrow>11 CFR § 104.7 BEST-EFFORTS GATE</Eyebrow>
                  <h4 className="text-base font-black text-white">
                    2. Grassroots Contribution Gate &amp; Treasurer Ledger
                  </h4>
                </div>
                <Button size="xs" variant="secondary" onClick={handleExportCampaignComplianceCsv}>
                  <Download size={13} /> Export Treasurer / FEC CSV
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <input
                  value={contribDraft.donorFullName}
                  onChange={e => setContribDraft({ ...contribDraft, donorFullName: e.target.value })}
                  placeholder="Donor Full Legal Name *"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  value={contribDraft.donorEmail}
                  onChange={e => setContribDraft({ ...contribDraft, donorEmail: e.target.value })}
                  placeholder="Donor Email *"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  value={contribDraft.streetAddress}
                  onChange={e => setContribDraft({ ...contribDraft, streetAddress: e.target.value })}
                  placeholder="Physical Street Address (No P.O. Box) *"
                  className="sm:col-span-2 rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                  <input
                    value={contribDraft.city}
                    onChange={e => setContribDraft({ ...contribDraft, city: e.target.value })}
                    placeholder="City *"
                    className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                  <input
                    value={contribDraft.state}
                    onChange={e => setContribDraft({ ...contribDraft, state: e.target.value })}
                    placeholder="State *"
                    className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                  <input
                    value={contribDraft.postalCode}
                    onChange={e => setContribDraft({ ...contribDraft, postalCode: e.target.value })}
                    placeholder="ZIP *"
                    className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                </div>
                <input
                  value={contribDraft.occupation}
                  onChange={e => setContribDraft({ ...contribDraft, occupation: e.target.value })}
                  placeholder="Occupation (Required by Law) *"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  value={contribDraft.employer}
                  onChange={e => setContribDraft({ ...contribDraft, employer: e.target.value })}
                  placeholder="Employer (Required by Law) *"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <div className="sm:col-span-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-white/75">Amount (USD):</span>
                  <input
                    type="number"
                    value={contribDraft.amountUsd}
                    onChange={e =>
                      setContribDraft({ ...contribDraft, amountUsd: Number(e.target.value) })
                    }
                    className="w-32 rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white font-mono"
                  />
                  <span className="text-[11px] text-white/55">
                    Cycle Cap: ${civicCompliance.perDonorElectionLimitUsd.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* 5-Point Statutory Donor Attestation */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-1.5 text-[11px] text-white/80">
                <div className="font-extrabold uppercase tracking-wider text-brand-lilac text-[10px]">
                  Mandatory 5-Point Donor Eligibility Attestation
                </div>
                {[
                  {
                    key: 'isUsCitizenOrPermanentResident' as const,
                    label: 'I am a U.S. citizen or lawfully admitted permanent resident (green card holder).',
                  },
                  {
                    key: 'isPersonalFunds' as const,
                    label: 'This contribution is made from my own personal funds, not provided by another person or entity.',
                  },
                  {
                    key: 'isNotFederalOrMunicipalContractor' as const,
                    label: 'I am not a federal or prohibited municipal government contractor.',
                  },
                  {
                    key: 'isPersonalCardNotCorporate' as const,
                    label: 'I am making this contribution with my personal credit/debit card, not a corporate or business card.',
                  },
                  {
                    key: 'isAtLeast18' as const,
                    label: 'I am at least 18 years old.',
                  },
                ].map(item => (
                  <label key={item.key} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={contribDraft[item.key]}
                      onChange={e =>
                        setContribDraft({ ...contribDraft, [item.key]: e.target.checked })
                      }
                      className="mt-0.5"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              {contribErrors.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-400/40 text-xs text-amber-200 space-y-1">
                  {contribErrors.map((err, i) => (
                    <div key={i}>• {err}</div>
                  ))}
                </div>
              )}

              <Button variant="accent" size="sm" onClick={handleRecordCampaignContribution}>
                <CheckCircle2 size={14} /> Validate &amp; Record Compliant Contribution
              </Button>

              {/* Itemized Contribution Ledger */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/60">
                  Itemized Campaign Contribution Ledger ({campaignContributions.length} Records)
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {campaignContributions.length === 0 && (
                    <p className="m-0 text-xs text-[#A49CB2]">No contributions recorded.</p>
                  )}
                  {campaignContributions.map(c => (
                    <div
                      key={c.id}
                      className="p-2.5 rounded-xl bg-black/45 border border-white/10 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">
                          {c.donorFullName} · <span className="text-brand-orange">${c.amountUsd}</span>{' '}
                          <span className="text-[10px] text-white/50 font-mono">
                            (Cycle Aggregate: ${c.aggregateCycleToDateUsd})
                          </span>
                        </div>
                        <div className="text-[10px] text-white/60">
                          {c.occupation} @ {c.employer} · {c.streetAddress}, {c.city}, {c.state} {c.postalCode}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                        5/5 Attested
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {complianceCsvPreview && (
                <div className="space-y-1">
                  <div className="text-[10px] font-extrabold uppercase text-brand-cyan">
                    FEC Form 3 / Local Treasurer Compliance CSV Preview
                  </div>
                  <pre className="p-3 rounded-xl bg-black/60 border border-white/10 text-[10px] font-mono text-white/80 overflow-x-auto">
                    {complianceCsvPreview}
                  </pre>
                </div>
              )}
            </Surface>
          </div>
        </div>
      )}

      {/* ── MODAL: APPLY TO HOST A LOCAL SPOKE / WATCH PARTY ── */}
      {showHostModal && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl p-6 bg-[#18141F] border border-[#E2C27E]/45 space-y-4 text-white">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">
                Host a Local Spoke Event / Licensed Watch Party
              </h3>
              <button
                onClick={() => setShowHostModal(false)}
                className="text-xs text-white/60 hover:text-white"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-white/70">
              Approved hosts receive our <b>Plajah Community Screening License</b> (Reello Stream +
              Stage Follow-Along Slide Deck + Discussion Guide) and appear on our congregation map.
            </p>
            <div className="space-y-3">
              <input
                value={hostDraft.title}
                onChange={e => setHostDraft({ ...hostDraft, title: e.target.value })}
                placeholder="Spoke Title (e.g. Eastside Home Sanctuary Watch Party)"
                className="w-full rounded-xl bg-black/50 border border-white/15 px-3.5 py-2.5 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={hostDraft.city}
                  onChange={e => setHostDraft({ ...hostDraft, city: e.target.value })}
                  placeholder="City"
                  className="w-full rounded-xl bg-black/50 border border-white/15 px-3.5 py-2.5 text-xs text-white"
                />
                <input
                  value={hostDraft.neighborhood}
                  onChange={e => setHostDraft({ ...hostDraft, neighborhood: e.target.value })}
                  placeholder="Neighborhood / Campus"
                  className="w-full rounded-xl bg-black/50 border border-white/15 px-3.5 py-2.5 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={hostDraft.venueKind}
                  onChange={e =>
                    setHostDraft({
                      ...hostDraft,
                      venueKind: e.target.value as ElevateSpokeHostEvent['venueKind'],
                    })
                  }
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                >
                  <option value="HOME_SANCTUARY">Home Sanctuary</option>
                  <option value="CAMPUS_CHAPTER">Campus Chapter</option>
                  <option value="ALLIED_CHURCH">Allied Church</option>
                  <option value="COMMUNITY_CENTER">Community Center</option>
                </select>
                <input
                  type="date"
                  value={hostDraft.dateISO}
                  onChange={e => setHostDraft({ ...hostDraft, dateISO: e.target.value })}
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  type="number"
                  value={hostDraft.capacity}
                  onChange={e => setHostDraft({ ...hostDraft, capacity: Number(e.target.value) })}
                  placeholder="Capacity"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
              </div>
              <textarea
                rows={2}
                value={hostDraft.notes}
                onChange={e => setHostDraft({ ...hostDraft, notes: e.target.value })}
                placeholder="Notes for guests (childcare, parking, accessibility, food)…"
                className="w-full rounded-xl bg-black/50 border border-white/15 p-3 text-xs text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowHostModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySpokeHost}
                className="px-5 py-2 rounded-xl bg-[#E2C27E] text-black text-xs font-black"
              >
                Submit Spoke Host Application
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD NEW MULTI-SHIFT SLOT (ADMIN) ── */}
      {showNewSlotModal && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl p-6 bg-[#18141F] border border-[#E2C27E]/45 space-y-4 text-white">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">Add Structured Volunteer Shift Slot</h3>
              <button
                onClick={() => setShowNewSlotModal(false)}
                className="text-xs text-white/60 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={newSlotDraft.roleTitle}
                onChange={e => setNewSlotDraft({ ...newSlotDraft, roleTitle: e.target.value })}
                placeholder="Shift Role Title (e.g. Youth Check-In Lead)"
                className="w-full rounded-xl bg-black/50 border border-white/15 px-3.5 py-2.5 text-xs text-white"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="date"
                  value={newSlotDraft.dateISO}
                  onChange={e => setNewSlotDraft({ ...newSlotDraft, dateISO: e.target.value })}
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  value={newSlotDraft.startTime}
                  onChange={e => setNewSlotDraft({ ...newSlotDraft, startTime: e.target.value })}
                  placeholder="Start (09:00 AM)"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  value={newSlotDraft.endTime}
                  onChange={e => setNewSlotDraft({ ...newSlotDraft, endTime: e.target.value })}
                  placeholder="End (12:00 PM)"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  value={newSlotDraft.capacity}
                  onChange={e =>
                    setNewSlotDraft({ ...newSlotDraft, capacity: Number(e.target.value) })
                  }
                  placeholder="Capacity"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  type="number"
                  value={newSlotDraft.durationHours}
                  onChange={e =>
                    setNewSlotDraft({ ...newSlotDraft, durationHours: Number(e.target.value) })
                  }
                  placeholder="Hours"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  value={newSlotDraft.locationLabel}
                  onChange={e => setNewSlotDraft({ ...newSlotDraft, locationLabel: e.target.value })}
                  placeholder="Location"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewSlotModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewShiftSlot}
                className="px-5 py-2 rounded-xl bg-[#E2C27E] text-black text-xs font-black"
              >
                Publish Shift Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: TELA STUDIO OPEN LETTER / COVENANT DOSSIER PREVIEW ── */}
      {telaDossierModal && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl p-6 bg-[#18141F] border border-[#E2C27E]/45 space-y-4 text-white max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#E2C27E]">
                  Plajah Tela Studio · Print &amp; Civic Publication Dossier
                </div>
                <h3 className="text-lg font-black">{telaDossierModal.title}</h3>
              </div>
              <button
                onClick={() => setTelaDossierModal(null)}
                className="px-3 py-1 rounded-lg bg-white/10 text-xs font-bold"
              >
                Close
              </button>
            </div>
            <pre className="flex-1 overflow-y-auto p-4 rounded-2xl bg-black/60 border border-white/10 text-xs font-mono text-white/85 whitespace-pre-wrap">
              {telaDossierModal.markdown}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('NAVIGATE', {
                      detail: { target: 'TELA_STUDIO', title: telaDossierModal.title },
                    })
                  );
                  setTelaDossierModal(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-[#E2C27E] text-black text-xs font-black"
              >
                Open in Tela Studio →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ElevateMobilizeHub;
