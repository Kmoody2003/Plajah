// elevateMobilizeService — Plajah Elevate's native Mobilization, Multi-Shift Volunteer
// Scheduling, Waitlist Auto-Promotion, Non-SMS Reminder Synergy Loops, Peer-to-Peer Spoke
// Hosting (with Community Screening Licenses), Petitions/Covenants, and Coalition/CRM Sync.
//
// Designed specifically for Plajah Elevate (Churches, Ministries, Nonprofits, Cultural
// Institutions, Interfaith & Community Organizations). Excludes SMS by design (handled by
// a separate platform-wide SMS architecture) and instead uses Plajah's native In-App Push
// Quick-Actions, The Post Man compliant Email Campaigns, Ministry Rooms, Sanctuary Unlocks,
// ARIA Content Repurpose briefs, and Tela Studio Open Letter publications.

import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  ChmsAttendance,
  ChmsPerson,
  ContentRepurposeJob,
  ElevateCampaignContributionRecord,
  ElevateCampaignDonorAttestation,
  ElevateCampaignJurisdiction,
  ElevateCampaignTaxClassification,
  ElevateCivicCampaignComplianceConfig,
  ElevateCrmSyncProfile,
  ElevateExternalCrmProvider,
  ElevateImpactPassport,
  ElevatePetitionDrive,
  ElevatePetitionKind,
  ElevatePetitionSignature,
  ElevateReminderQuickAction,
  ElevateShiftDrive,
  ElevateShiftSignup,
  ElevateShiftSlot,
  ElevateSpokeCampaign,
  ElevateSpokeHostEvent,
  Organization,
} from '../types';
import { isDemoOrg } from './elevateTruth';

export function stripUndefined<T>(val: T): T {
  if (Array.isArray(val)) return val.map(stripUndefined) as unknown as T;
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return val;
}

const STORAGE_PREFIX = 'plajah_elevate_mobilize_v1_';

export interface ElevateMobilizeBundle {
  orgId: string;
  shiftDrives: ElevateShiftDrive[];
  shiftSignups: ElevateShiftSignup[];
  petitions: ElevatePetitionDrive[];
  petitionSignatures: ElevatePetitionSignature[];
  spokeCampaigns: ElevateSpokeCampaign[];
  crmProfiles: ElevateCrmSyncProfile[];
  civicCompliance?: ElevateCivicCampaignComplianceConfig;
  campaignContributions?: ElevateCampaignContributionRecord[];
}

export interface NonSmsReminderNotificationPayload {
  id: string;
  orgId: string;
  recipientUid: string;
  recipientEmail?: string;
  stage: '72H_PREP' | '24H_CONFIRM' | '1H_DOORS' | 'WAITLIST_PROMOTED' | 'POST_EVENT_SYNERGY';
  channels: ('IN_APP_PUSH' | 'POST_MAN_EMAIL' | 'MINISTRY_ROOM_PING' | 'CALENDAR_ICS')[];
  title: string;
  body: string;
  quickActions: {
    action: ElevateReminderQuickAction;
    label: string;
  }[];
  postManEmailSubject: string;
  postManHtmlPreview: string;
  icsCalendarSummary?: string;
  ariaRepurposeJobDraft?: Partial<ContentRepurposeJob>;
  photoPoolPrompt?: {
    eventId: string;
    promptTitle: string;
  };
}

export type ActionHubVerticalKind =
  | 'ELEVATE_FAITH'
  | 'ELEVATE_NONPROFIT'
  | 'ELEVATE_CULTURAL'
  | 'CIVIC_CAMPAIGN'
  | 'ACADEMIA'
  | 'CLUB'
  | 'BUSINESS';

export interface ActionHubVerticalConfig {
  vertical: ActionHubVerticalKind;
  publicTabLabel: string;
  memberTabLabel: string;
  adminNavLabel: string;
  heroBadgeLabel: string;
  heroHeadlineSuffix: string;
  shiftsTabLabel: string;
  petitionsTabLabel: string;
  spokesTabLabel: string;
  passportTabLabel: string;
  remindersTabLabel: string;
  crmTabLabel: string;
  spokeHostCtaLabel: string;
}

/**
 * Returns the adaptive vocabulary for the shared Action & Shifts engine so each vertical
 * speaks its native language (never using "Mobilize" as a brand or feature name).
 */
export function getActionHubVerticalConfig(
  orgType?: Organization['orgType'] | 'ACADEMIA' | 'CLUB' | 'CIVIC_CAMPAIGN'
): ActionHubVerticalConfig {
  if (orgType === 'CIVIC_CAMPAIGN') {
    return {
      vertical: 'CIVIC_CAMPAIGN',
      publicTabLabel: 'Volunteer & Canvass',
      memberTabLabel: 'Canvass Shifts, Endorsements & House Parties',
      adminNavLabel: 'Grassroots Field & Compliance',
      heroBadgeLabel: 'Grassroots Canvassing, Phonebanks, House Parties & Campaign Compliance',
      heroHeadlineSuffix: 'Canvass, Host Locally & Mobilize Voters',
      shiftsTabLabel: 'Canvassing, Phonebanks & Poll-Greeting Shifts',
      petitionsTabLabel: 'Endorsements, Ballot Petitions & Constituent Letters',
      spokesTabLabel: 'Neighborhood House Parties & Debate Watch Parties',
      passportTabLabel: 'Field Organizer & Volunteer Credential',
      remindersTabLabel: 'Non-SMS Turnout Cadence & ARIA Rapid-Response Loop',
      crmTabLabel: 'NGP VAN / Voter File & Treasurer Compliance Sync',
      spokeHostCtaLabel: 'Apply to Host a Neighborhood Meet-and-Greet / Watch Party',
    };
  }
  if (orgType === 'ACADEMIA') {
    return {
      vertical: 'ACADEMIA',
      publicTabLabel: 'Service & Chapters',
      memberTabLabel: 'Service Hours & Co-Curricular Transcript',
      adminNavLabel: 'Service Learning & Shifts',
      heroBadgeLabel: 'Campus Service, Lab Shifts & Student Chapters',
      heroHeadlineSuffix: 'Service Learning, Chapters & Campus Action',
      shiftsTabLabel: 'Service-Learning, Lab & TA Shifts',
      petitionsTabLabel: 'Student Senate Petitions & Honor Pledges',
      spokesTabLabel: 'Study Pods, Chapters & Alumni Watch Parties',
      passportTabLabel: 'Co-Curricular Service Transcript',
      remindersTabLabel: 'Non-SMS Prep & ARIA Lecture Synergy',
      crmTabLabel: 'SIS / Campus & Coalition Sync',
      spokeHostCtaLabel: 'Start a Study Pod / Campus Chapter',
    };
  }
  if (orgType === 'CLUB') {
    return {
      vertical: 'CLUB',
      publicTabLabel: 'Meetups & Crew',
      memberTabLabel: 'Meetup Crew & Challenges',
      adminNavLabel: 'Crew & Chapters',
      heroBadgeLabel: 'Club Chapters, Crew Shifts & Community Challenges',
      heroHeadlineSuffix: 'Meetups, Crew Roles & Local Chapters',
      shiftsTabLabel: 'Meetup Crew Roles & Waitlists',
      petitionsTabLabel: 'Club Charters, Polls & Challenges',
      spokesTabLabel: 'Local City Chapters & Watch Parties',
      passportTabLabel: 'Member Passport',
      remindersTabLabel: 'Non-SMS Meetup Cadence & ARIA Highlights',
      crmTabLabel: 'Partner Clubs & Member Sync',
      spokeHostCtaLabel: 'Apply to Host a Local City Meetup',
    };
  }
  if (orgType === 'BUSINESS' || orgType === 'BRAND' || orgType === 'LABEL' || orgType === 'TEAM') {
    return {
      vertical: 'BUSINESS',
      publicTabLabel: 'Ambassadors & Pop-Ups',
      memberTabLabel: 'Ambassador Shifts & Votes',
      adminNavLabel: 'Street Team & Pop-Ups',
      heroBadgeLabel: 'Street Team Shifts, Pop-Up Hosting & Customer Drives',
      heroHeadlineSuffix: 'Ambassadors, Pop-Ups & Community Drives',
      shiftsTabLabel: 'Pop-Up & Street Team Shifts',
      petitionsTabLabel: '"Bring to My City" Drives & Product Votes',
      spokesTabLabel: 'Hosted Tasting, Trunk & Listening Parties',
      passportTabLabel: 'Ambassador Passport',
      remindersTabLabel: 'Non-SMS VIP Cadence & ARIA Promo Loop',
      crmTabLabel: 'Co-Brand Partners & CRM Sync',
      spokeHostCtaLabel: 'Apply to Host a Local Pop-Up / Listening Party',
    };
  }
  if (orgType === 'CULTURAL' || orgType === 'CULTURAL_ORG') {
    return {
      vertical: 'ELEVATE_CULTURAL',
      publicTabLabel: 'Docents & Action',
      memberTabLabel: 'Docent Shifts, Salons & Impact',
      adminNavLabel: 'Action & Shifts',
      heroBadgeLabel: 'Docent Rotations, Salon Screenings & Patron Letters',
      heroHeadlineSuffix: 'Docents, Salons & Community Action',
      shiftsTabLabel: 'Docent & Gallery Shifts',
      petitionsTabLabel: 'Patron Open Letters & Pledges',
      spokesTabLabel: 'Salon Screenings & Local Chapters',
      passportTabLabel: 'Patron Impact Passport',
      remindersTabLabel: 'Non-SMS Cadence & ARIA Exhibition Synergy',
      crmTabLabel: 'Coalition & Cultural CRM Sync',
      spokeHostCtaLabel: 'Apply to Host a Licensed Salon / Screening',
    };
  }
  if (orgType === 'NONPROFIT') {
    return {
      vertical: 'ELEVATE_NONPROFIT',
      publicTabLabel: 'Take Action',
      memberTabLabel: 'Action, Shifts & Impact Passport',
      adminNavLabel: 'Action & Shifts',
      heroBadgeLabel: 'Volunteer Shifts, Petitions & Distributed Chapters',
      heroHeadlineSuffix: 'Take Action, Serve & Host Locally',
      shiftsTabLabel: 'Volunteer Shifts & Waitlists',
      petitionsTabLabel: 'Petitions, Open Letters & Action Pledges',
      spokesTabLabel: 'Peer Spoke Chapters & Watch Parties',
      passportTabLabel: 'My Impact Passport',
      remindersTabLabel: 'Non-SMS Cadence & ARIA Synergy Loop',
      crmTabLabel: 'Coalition & External CRM Sync',
      spokeHostCtaLabel: 'Apply to Host a Local Chapter / Screening',
    };
  }
  return {
    vertical: 'ELEVATE_FAITH',
    publicTabLabel: 'Serve & Action',
    memberTabLabel: 'Serve, Shifts & Impact Passport',
    adminNavLabel: 'Action & Shifts',
    heroBadgeLabel: 'Ministry Shifts, Covenants & Home Sanctuaries',
    heroHeadlineSuffix: 'Serve, Covenant & Gather Everywhere',
    shiftsTabLabel: 'Ministry Shifts & Waitlists',
    petitionsTabLabel: 'Covenants, Petitions & Open Letters',
    spokesTabLabel: 'Home Sanctuaries & Watch Parties',
    passportTabLabel: 'My Impact Passport',
    remindersTabLabel: 'Non-SMS Cadence & ARIA Synergy Loop',
    crmTabLabel: 'Coalition & ChMS / CRM Sync',
    spokeHostCtaLabel: 'Apply to Host a Home Sanctuary / Watch Party',
  };
}

// ─── Seed Generator per Elevate Organization ─────────────────────────────────

type MobilizeOrgPick = Pick<Organization, 'id' | 'name' | 'orgType' | 'ministries' | 'campuses'> &
  Partial<Pick<Organization, 'isDemo'>>;

/**
 * Starting bundle for an organization. Only the demo church (Grace Chapel) is seeded with sample
 * drives, people, petitions, chapters and CRM connections; every real organization starts empty
 * and fills the hub with its own data.
 */
export function getDefaultElevateMobilizeBundle(org: MobilizeOrgPick): ElevateMobilizeBundle {
  if (isDemoOrg(org)) return buildSampleElevateMobilizeBundle(org);
  return getEmptyElevateMobilizeBundle(org);
}

/** An honest empty bundle for a real organization (no sample people, shifts or petitions). */
export function getEmptyElevateMobilizeBundle(org: MobilizeOrgPick): ElevateMobilizeBundle {
  return {
    orgId: org.id,
    shiftDrives: [],
    shiftSignups: [],
    petitions: [],
    petitionSignatures: [],
    spokeCampaigns: [],
    crmProfiles: [],
    civicCompliance: getBlankCivicCampaignComplianceConfig(org.name),
    campaignContributions: [],
  };
}

/** Civic compliance defaults with no sample candidate, treasurer or registration filled in. */
function getBlankCivicCampaignComplianceConfig(orgName?: string): ElevateCivicCampaignComplianceConfig {
  return {
    ...getDefaultCivicCampaignComplianceConfig(orgName || ''),
    committeeLegalName: orgName?.trim() || '',
    candidateName: '',
    officeSought: '',
    treasurerFullName: '',
    committeeRegistrationId: '',
    electionCycleLabel: '',
  };
}

/** Default non-SMS reminder cadence for a newly created shift drive. */
export function getDefaultElevateReminderCadence(): ElevateShiftDrive['reminderCadence'] {
  return buildSampleElevateMobilizeBundle({ id: 'cadence', name: '' }).shiftDrives[0].reminderCadence;
}

/**
 * Sample (demo-only) bundle: Grace Chapel's showcase drives, people, petitions, chapters and
 * CRM connections. Never shown to a real organization.
 */
export function buildSampleElevateMobilizeBundle(
  org: Pick<Organization, 'id' | 'name'> & Partial<Pick<Organization, 'orgType' | 'ministries' | 'campuses'>>
): ElevateMobilizeBundle {
  const orgId = org.id || 'demo-church-grace';
  const orgName = org.name || 'Grace Chapel';
  const isCultural = org.orgType === 'CULTURAL_ORG';
  const isNonprofit = org.orgType === 'NONPROFIT';
  const firstMinistryId = org.ministries?.[0]?.id || 'min-outreach';
  const secondMinistryId = org.ministries?.[1]?.id || 'min-worship';
  const primaryCampusId = org.campuses?.[0]?.id || 'campus-main';
  const now = 1760900000000;

  const shiftDrives: ElevateShiftDrive[] = [
    {
      id: `${orgId}_drive_sunday_ops`,
      orgId,
      ministryId: secondMinistryId,
      title: isCultural
        ? 'Exhibition Opening & Living Archive Docent Corps'
        : isNonprofit
        ? 'Weekly Neighborhood Resource & Sanctuary Hub Shifts'
        : 'Sunday Sanctuary, Stage & Hospitality Corps',
      subtitle: isCultural
        ? 'Multi-shift docent, audio-guide, and gallery hospitality rotations.'
        : 'Structured multi-shift ministry scheduling with automatic waitlist promotion.',
      category: isCultural ? 'CULTURAL_DOCENT' : 'SUNDAY_SANCTUARY',
      coordinatorName: 'Deacon Marcus Sterling',
      coordinatorRole: 'Hospitality & Sanctuary Operations Lead',
      coalitionPartnerOrgIds: ['org-mercy-kitchen', 'org-atlanta-interfaith'],
      reminderCadence: {
        enabled: true,
        channels: ['IN_APP_PUSH', 'POST_MAN_EMAIL', 'MINISTRY_ROOM_PING', 'CALENDAR_ICS'],
        send72hPrepBrief: true,
        send24hConfirmPing: true,
        send1hDoorsPass: true,
        postEventSynergy: {
          sendImpactReceipt: true,
          promptCommunityPhotoPool: true,
          autoQueueAriaRepurposeBrief: true,
          nextStepCta: 'JOIN_MINISTRY',
        },
      },
      slots: [
        {
          id: `${orgId}_slot_ambo_prep`,
          driveId: `${orgId}_drive_sunday_ops`,
          orgId,
          ministryId: secondMinistryId,
          campusId: primaryCampusId,
          roleTitle: isCultural ? 'Gallery Lighting & Living Book Kiosk Setup' : 'Early Sanctuary & Stage Cue Prep',
          description: 'Calibrate Stage Follow-Along scripture cues, stage monitors, and sanctuary welcome packets.',
          dateISO: '2026-10-25',
          startTime: '07:30 AM',
          endTime: '09:30 AM',
          durationHours: 2,
          locationLabel: 'Main Sanctuary · Stage Control Booth',
          capacity: 5,
          confirmedCount: 3,
          waitlistCount: 0,
          checkedInCount: 1,
          waitlistEnabled: true,
          skillsRequired: ['Plajah Stage', 'AV / Stage Cue'],
          rewardUnlock: {
            plajahPoints: 120,
            badgeTitle: 'Stage Sanctuary Steward',
            sanctuaryUnlockKind: 'CHORA_STEMS',
            sanctuaryUnlockTitle: 'Chora Worship Choir Multi-Track Stems (Sunday Set)',
            sanctuaryAssetId: 'chora-pack-sunday-stems',
            stampOraGoalProvenance: true,
          },
        },
        {
          id: `${orgId}_slot_greeter_full`,
          driveId: `${orgId}_drive_sunday_ops`,
          orgId,
          ministryId: firstMinistryId,
          campusId: primaryCampusId,
          roleTitle: 'First-Impression Greeters & Family Check-In Desk',
          description: 'Welcome first-time visitors, assist families with youth check-in, and hand out NFC/QR pew passes.',
          dateISO: '2026-10-25',
          startTime: '09:30 AM',
          endTime: '12:00 PM',
          durationHours: 2.5,
          locationLabel: 'Narthex & Family Welcome Atrium',
          capacity: 2,
          confirmedCount: 2,
          waitlistCount: 1,
          checkedInCount: 0,
          waitlistEnabled: true,
          skillsRequired: ['Hospitality', 'Family Check-In'],
          rewardUnlock: {
            plajahPoints: 150,
            badgeTitle: 'Pillar of Hospitality',
            sanctuaryUnlockKind: 'LOREA_LIVING_BOOK',
            sanctuaryUnlockTitle: 'Annotated Study Edition: The Hospitality of the Early Church',
            sanctuaryAssetId: 'lorea-hospitality-edition',
            stampOraGoalProvenance: true,
          },
        },
        {
          id: `${orgId}_slot_fellowship_table`,
          driveId: `${orgId}_drive_sunday_ops`,
          orgId,
          ministryId: firstMinistryId,
          campusId: primaryCampusId,
          roleTitle: 'Agape Community Meal & Sanctuary Reset Team',
          description: 'Serve post-service fellowship lunch, pack take-home meals for seniors, and reset the hall.',
          dateISO: '2026-10-25',
          startTime: '12:15 PM',
          endTime: '02:45 PM',
          durationHours: 2.5,
          locationLabel: 'Fellowship Commons & Kitchen',
          capacity: 8,
          confirmedCount: 4,
          waitlistCount: 0,
          checkedInCount: 0,
          waitlistEnabled: true,
          skillsRequired: ['Food Service', 'Community Care'],
          rewardUnlock: {
            plajahPoints: 150,
            badgeTitle: 'Common Table Servant',
            sanctuaryUnlockKind: 'TALEO_SCREENING_PASS',
            sanctuaryUnlockTitle: 'Cinema Community Screening Pass: "Voices of the Sanctuary"',
            sanctuaryAssetId: 'taleo-doc-voices',
            stampOraGoalProvenance: true,
          },
        },
      ],
      createdAt: now - 86400000 * 5,
      updatedAt: now - 3600000,
    },
    {
      id: `${orgId}_drive_harvest_pantry`,
      orgId,
      ministryId: firstMinistryId,
      title: 'Coalition Harvest Pantry & Elder Care Drive',
      subtitle: `Co-hosted by ${orgName} and 2 allied Elevate community organizations — every verified hour counts toward your Impact Passport.`,
      category: 'COMMUNITY_OUTREACH',
      coordinatorName: 'Sister Priya Nair',
      coordinatorRole: 'Missions & Mercy Action Director',
      coalitionPartnerOrgIds: ['org-hope-pantry-atl', 'org-st-lukes-fellowship'],
      reminderCadence: {
        enabled: true,
        channels: ['IN_APP_PUSH', 'POST_MAN_EMAIL', 'CALENDAR_ICS'],
        send72hPrepBrief: true,
        send24hConfirmPing: true,
        send1hDoorsPass: true,
        postEventSynergy: {
          sendImpactReceipt: true,
          promptCommunityPhotoPool: true,
          autoQueueAriaRepurposeBrief: true,
          nextStepCta: 'SIGN_COVENANT',
        },
      },
      slots: [
        {
          id: `${orgId}_slot_pantry_pack`,
          driveId: `${orgId}_drive_harvest_pantry`,
          orgId,
          ministryId: firstMinistryId,
          campusId: primaryCampusId,
          roleTitle: 'Morning Produce Sorting & Family Box Assembly',
          description: 'Sort fresh local produce and pack 250 family nutrition boxes with prayer & resource cards.',
          dateISO: '2026-10-28',
          startTime: '08:30 AM',
          endTime: '11:30 AM',
          durationHours: 3,
          locationLabel: 'Outreach Warehouse · Bay B',
          capacity: 12,
          confirmedCount: 7,
          waitlistCount: 0,
          checkedInCount: 2,
          waitlistEnabled: true,
          skillsRequired: ['Packing', 'Inventory'],
          rewardUnlock: {
            plajahPoints: 200,
            badgeTitle: 'Harvest Coalition Builder',
            sanctuaryUnlockKind: 'SANCTUARY_BADGE',
            sanctuaryUnlockTitle: 'Verified Impact Seal on Elevate Member Profile',
            stampOraGoalProvenance: true,
          },
        },
        {
          id: `${orgId}_slot_elder_delivery`,
          driveId: `${orgId}_drive_harvest_pantry`,
          orgId,
          ministryId: firstMinistryId,
          campusId: primaryCampusId,
          roleTitle: 'Homebound Elder & Young Family Delivery Drivers',
          description: 'Deliver curated pantry boxes and devotional packets directly to homebound congregants and neighbors.',
          dateISO: '2026-10-28',
          startTime: '11:30 AM',
          endTime: '02:30 PM',
          durationHours: 3,
          locationLabel: 'North & Downtown Dispatch Loop',
          capacity: 6,
          confirmedCount: 4,
          waitlistCount: 0,
          checkedInCount: 0,
          waitlistEnabled: true,
          skillsRequired: ['Driver', 'Pastoral Care'],
          rewardUnlock: {
            plajahPoints: 240,
            badgeTitle: 'Mercy Courier',
            sanctuaryUnlockKind: 'LOREA_LIVING_BOOK',
            sanctuaryUnlockTitle: 'Lorea Audio & Text Breviary: Songs for the Road',
            sanctuaryAssetId: 'lorea-breviary-road',
            stampOraGoalProvenance: true,
          },
        },
      ],
      createdAt: now - 86400000 * 3,
      updatedAt: now - 1800000,
    },
  ];

  const shiftSignups: ElevateShiftSignup[] = [
    {
      id: `${orgId}_signup_1`,
      driveId: `${orgId}_drive_sunday_ops`,
      slotId: `${orgId}_slot_ambo_prep`,
      orgId,
      uid: 'demo-member-elena',
      userName: 'Elena Sterling',
      userEmail: 'elena.sterling@example.org',
      status: 'COMPLETED',
      confirmedAttendance24h: true,
      signedUpAt: now - 86400000 * 4,
      checkedInAt: now - 86400000 * 1,
      completedAt: now - 86400000 * 1 + 7200000,
      verifiedHours: 2,
      checkInMethod: 'SANCTUARY_GEOFENCE',
    },
    {
      id: `${orgId}_signup_2`,
      driveId: `${orgId}_drive_sunday_ops`,
      slotId: `${orgId}_slot_greeter_full`,
      orgId,
      uid: 'demo-member-marcus',
      userName: 'Marcus Bell',
      userEmail: 'marcus.b@example.org',
      status: 'CONFIRMED',
      confirmedAttendance24h: true,
      signedUpAt: now - 86400000 * 3,
      verifiedHours: 0,
    },
    {
      id: `${orgId}_signup_3`,
      driveId: `${orgId}_drive_sunday_ops`,
      slotId: `${orgId}_slot_greeter_full`,
      orgId,
      uid: 'demo-member-jordan',
      userName: 'Jordan Ellis',
      userEmail: 'jordan.ellis@example.org',
      status: 'CONFIRMED',
      confirmedAttendance24h: false,
      signedUpAt: now - 86400000 * 2,
      verifiedHours: 0,
    },
    {
      id: `${orgId}_signup_4_waitlist`,
      driveId: `${orgId}_drive_sunday_ops`,
      slotId: `${orgId}_slot_greeter_full`,
      orgId,
      uid: 'demo-member-grace',
      userName: 'Grace Okafor',
      userEmail: 'g.okafor@example.org',
      status: 'WAITLISTED',
      signedUpAt: now - 86400000 * 1,
      verifiedHours: 0,
    },
  ];

  const petitions: ElevatePetitionDrive[] = [
    {
      id: `${orgId}_petition_covenant`,
      orgId,
      ministryId: firstMinistryId,
      kind: 'COVENANT',
      title: `${orgName} 1,000-Hour Neighbor Mercy & Mentorship Covenant`,
      summary:
        'Join our congregation-wide action pledge to contribute 1,000 verified hours of youth literacy mentoring, elder visitation, and food security this season.',
      bodyMarkdown: `### Our Sacred Commitment to the City\nWe, the members and friends of **${orgName}**, covenant together to stand in the gap for our neighborhood.\n\n1. **Presence Over Distance:** Each signer pledges concrete hours of service in youth reading circles, pantry distribution, or elder care.\n2. **Shared Testimony:** Signers may attach a 30-second voice or video reflection to encourage the body.\n3. **Sponsor Matching Impact:** When we reach **250 covenant signers**, our Board of Trustees & Allied Sponsors unlock a **\\$5,000 Benevolence & Youth Scholarship Match**.`,
      recipientTarget: `${orgName} Elders & Community Coalition Board`,
      goalSignatures: 250,
      signatureCount: 248,
      verifiedMemberCount: 219,
      voiceTestimonyCount: 42,
      totalPledgedHours: 1420,
      telaExportReady: true,
      coalitionPartnerOrgIds: ['org-mercy-kitchen'],
      milestones: [
        {
          id: 'ms-100',
          targetSignatures: 100,
          title: '100 Signers · Covenant read aloud on Sunday',
          description: 'The covenant and every signer is read aloud during Sunday worship.',
          unlockType: 'SANCTUARY_MEDIA_DROP',
          unlocked: true,
          unlockedAt: now - 86400000 * 6,
        },
        {
          id: 'ms-250',
          targetSignatures: 250,
          title: '250 Signers · $5,000 Trustee & SeedRaiser Benevolence Match',
          description: 'Every signature up to 250 triggers a $5,000 matching grant into the Neighborhood Benevolence Fund.',
          unlockType: 'SPONSOR_GIVING_MATCH',
          matchAmountUsd: 5000,
          sponsorName: 'Grace Trustees & Mercy Foundation',
          unlocked: false,
        },
        {
          id: 'ms-500',
          targetSignatures: 500,
          title: '500 Signers · Commemorative Tela Living Book Publication',
          description: 'Compiles all member signatures and transcribed testimonies into a commemorative Tela Studio volume.',
          unlockType: 'TELA_DOSSIER_PUBLICATION',
          unlocked: false,
        },
      ],
      createdAt: now - 86400000 * 10,
      updatedAt: now - 7200000,
    },
    {
      id: `${orgId}_petition_open_letter`,
      orgId,
      ministryId: firstMinistryId,
      kind: 'OPEN_LETTER',
      title: 'Interfaith & Cultural Coalition Open Letter: Safe Youth Corridors & Family Housing',
      summary:
        'A joint public open letter co-signed by clergy, cultural leaders, and verified congregants calling for safe after-school transit corridors and family housing preservation.',
      bodyMarkdown: `### Joint Open Letter from the Plajah Elevate Coalition\nTo the Municipal Planning Council & Regional Housing Authority:\n\nRepresenting congregations, cultural centers, and neighborhood nonprofits across the metro area, we urge immediate adoption of the **Safe Youth Transit & Family Preservation Accord**.\n\n* **Verified Constituent Voices:** Every signature below is backed by a verified member or neighbor in the district.\n* **Print-Ready Civic Dossier:** Exportable directly via **Plajah Tela Studio** with QR links to video and voice testimonies.`,
      recipientTarget: 'Metro City Council & Regional Housing Authority',
      goalSignatures: 500,
      signatureCount: 384,
      verifiedMemberCount: 310,
      voiceTestimonyCount: 67,
      totalPledgedHours: 640,
      telaExportReady: true,
      coalitionPartnerOrgIds: ['org-atlanta-interfaith', 'org-harlem-cultural-house'],
      milestones: [
        {
          id: 'ms-letter-250',
          targetSignatures: 250,
          title: '250 Verified Signers · Coalition Press Brief via ARIA',
          description: 'Generates a multi-org press packet and audio brief.',
          unlockType: 'TELA_DOSSIER_PUBLICATION',
          unlocked: true,
          unlockedAt: now - 86400000 * 3,
        },
        {
          id: 'ms-letter-500',
          targetSignatures: 500,
          title: '500 Signers · Official Tela Bound Dossier Delivery',
          description: 'Delivers the typeset Open Letter with embedded QR voice testimonies to City Hall.',
          unlockType: 'CITY_COUNCIL_DELIVERY',
          unlocked: false,
        },
      ],
      createdAt: now - 86400000 * 14,
      updatedAt: now - 5400000,
    },
  ];

  const petitionSignatures: ElevatePetitionSignature[] = [
    {
      id: `${orgId}_sig_1`,
      petitionId: `${orgId}_petition_covenant`,
      orgId,
      uid: 'demo-pastor-1',
      signerName: 'Rev. Dr. Samuel Vance',
      signerCity: 'Atlanta, GA',
      signerRoleBadge: `Senior Pastor · ${orgName}`,
      comment: 'Our sanctuary doors do not end at the parking lot. I pledge 25 hours of youth mentoring this quarter.',
      testimonyKind: 'VOICE_30S',
      testimonyDurationSec: 28,
      pledgedHours: 25,
      isPublic: true,
      createdAt: now - 86400000 * 9,
    },
    {
      id: `${orgId}_sig_2`,
      petitionId: `${orgId}_petition_covenant`,
      orgId,
      uid: 'demo-member-priya',
      signerName: 'Priya Nair',
      signerCity: 'Decatur, GA',
      signerRoleBadge: 'Missions Lead · Verified Member',
      comment: 'Signing with our entire Wednesday small group — 15 hours pledged for the Saturday Harvest Pantry.',
      testimonyKind: 'VIDEO_30S',
      testimonyDurationSec: 30,
      pledgedHours: 15,
      isPublic: true,
      createdAt: now - 86400000 * 5,
    },
    {
      id: `${orgId}_sig_3`,
      petitionId: `${orgId}_petition_open_letter`,
      orgId,
      sourceOrgId: 'org-atlanta-interfaith',
      uid: 'demo-ally-1',
      signerName: 'Deaconess Angela Brooks',
      signerCity: 'Atlanta, GA',
      signerRoleBadge: 'Trustee · Coalition Co-Host',
      comment: 'Our youth deserve safe sidewalks and lighting between school, the arts center, and evening choir rehearsal.',
      testimonyKind: 'VOICE_30S',
      testimonyDurationSec: 24,
      pledgedHours: 10,
      isPublic: true,
      createdAt: now - 86400000 * 2,
    },
  ];

  const spokeCampaigns: ElevateSpokeCampaign[] = [
    {
      id: `${orgId}_spoke_watch_party`,
      orgId,
      title: 'Host a Neighborhood Sanctuary Watch Party & Discussion Circle',
      subtitle:
        'Turn any living room, campus lounge, or allied chapel into a synchronized Plajah Elevate spoke — complete with a licensed Reello stream and Stage Follow-Along slides.',
      description:
        'Unlike generic event platforms where distributed hosts only get a static RSVP page, Plajah Elevate grants approved spoke hosts a one-click Community Screening License for our live broadcast, documentary, or worship night, plus synced scripture/lyric cues.',
      toolkitSummary: [
        'Official Community Screening License (Reello Live Stream + Cinema Documentary)',
        'Synchronized Stage Mobile Follow-Along link for every guest in your living room',
        'Printable Host Discussion Guide & Prayer / Action Cards (via Tela)',
        'Automatic RSVP check-in that rolls up into our congregation-wide impact map',
      ],
      screeningLicense: {
        assetKind: 'REELLO_LIVE_STREAM',
        assetId: 'reello-sunday-revival-special',
        assetTitle: `${orgName} · Autumn Revival & Justice Forum Broadcast`,
        licenseCode: `PLAJAH-SPOKE-${orgId.slice(0, 6).toUpperCase()}-2026`,
        includesAmboSlideDeck: true,
        includesDiscussionGuide: true,
      },
      requireHostVetting: true,
      spokes: [
        {
          id: `${orgId}_spoke_evt_1`,
          campaignId: `${orgId}_spoke_watch_party`,
          parentOrgId: orgId,
          hostUid: 'demo-host-alvarez',
          hostName: 'Carlos & Maria Alvarez',
          hostRoleBadge: 'Small Group Leaders · Verified Host',
          title: 'Westside Home Sanctuary Watch Party & Potluck',
          city: 'Atlanta, GA',
          neighborhood: 'West End / BeltLine',
          venueKind: 'HOME_SANCTUARY',
          dateISO: '2026-10-27',
          timeLabel: '06:30 PM EDT',
          capacity: 18,
          rsvpCount: 14,
          checkedInCount: 12,
          status: 'APPROVED_LIVE',
          hostVetted: true,
          notes: 'Childcare provided; bilingual English/Spanish Stage follow-along enabled.',
          createdAt: now - 86400000 * 6,
        },
        {
          id: `${orgId}_spoke_evt_2`,
          campaignId: `${orgId}_spoke_watch_party`,
          parentOrgId: orgId,
          hostUid: 'demo-host-campus',
          hostName: 'Micah Sterling & Campus Fellowship',
          hostRoleBadge: 'Youth & College Chapter Lead',
          title: 'Midtown University Student Union Screening & Q&A',
          city: 'Atlanta, GA',
          neighborhood: 'Midtown Campus',
          venueKind: 'CAMPUS_CHAPTER',
          dateISO: '2026-10-27',
          timeLabel: '07:00 PM EDT',
          capacity: 45,
          rsvpCount: 39,
          checkedInCount: 31,
          status: 'APPROVED_LIVE',
          hostVetted: true,
          notes: 'Student ID required at union entrance; pizza & Chora acoustic worship after.',
          createdAt: now - 86400000 * 4,
        },
        {
          id: `${orgId}_spoke_evt_3_pending`,
          campaignId: `${orgId}_spoke_watch_party`,
          parentOrgId: orgId,
          hostUid: 'demo-host-new',
          hostName: 'Devon & Tasha Brooks',
          hostRoleBadge: 'Congregation Member',
          title: 'Decatur Courtyard Screening & Neighbor Meet-Up',
          city: 'Decatur, GA',
          neighborhood: 'Oakhurst',
          venueKind: 'HOME_SANCTUARY',
          dateISO: '2026-10-29',
          timeLabel: '07:00 PM EDT',
          capacity: 20,
          rsvpCount: 5,
          checkedInCount: 0,
          status: 'PENDING_VETTING',
          hostVetted: false,
          notes: 'Outdoor projector setup in our covered courtyard.',
          createdAt: now - 3600000 * 5,
        },
      ],
      createdAt: now - 86400000 * 8,
    },
  ];

  const crmProfiles: ElevateCrmSyncProfile[] = [
    {
      id: `${orgId}_crm_pco`,
      orgId,
      provider: 'PLANNING_CENTER',
      label: 'Planning Center (People, Check-Ins & Giving)',
      direction: 'BIDIRECTIONAL',
      syncPeopleToChms: true,
      syncShiftsToAttendance: true,
      syncPetitionsToTags: true,
      syncGivingToPledges: true,
      webhookEndpoint: `https://api.plajah.org/v1/elevate/${orgId}/webhooks/planning-center`,
      lastSyncedAt: now - 3600000 * 2,
      lastSyncedRecordCount: 842,
      status: 'CONNECTED',
    },
    {
      id: `${orgId}_crm_van`,
      orgId,
      provider: 'NGP_VAN_EVERYACTION',
      label: 'Bonterra EveryAction / NGP VAN (Advocacy, Shifts & Petitions)',
      direction: 'BIDIRECTIONAL',
      syncPeopleToChms: true,
      syncShiftsToAttendance: true,
      syncPetitionsToTags: true,
      syncGivingToPledges: false,
      webhookEndpoint: `https://api.plajah.org/v1/elevate/${orgId}/webhooks/everyaction`,
      lastSyncedAt: now - 3600000 * 6,
      lastSyncedRecordCount: 512,
      status: 'CONNECTED',
    },
    {
      id: `${orgId}_crm_sk`,
      orgId,
      provider: 'SERVANT_KEEPER',
      label: 'Servant Keeper ChMS (Households, Sacraments & Attendance)',
      direction: 'IMPORT',
      syncPeopleToChms: true,
      syncShiftsToAttendance: true,
      syncPetitionsToTags: false,
      syncGivingToPledges: true,
      lastSyncedAt: now - 86400000 * 3,
      lastSyncedRecordCount: 620,
      status: 'READY_CSV',
    },
    {
      id: `${orgId}_crm_nb`,
      orgId,
      provider: 'NATIONBUILDER',
      label: 'NationBuilder / Salesforce Nonprofit Cloud',
      direction: 'BIDIRECTIONAL',
      syncPeopleToChms: true,
      syncShiftsToAttendance: true,
      syncPetitionsToTags: true,
      syncGivingToPledges: true,
      webhookEndpoint: `https://api.plajah.org/v1/elevate/${orgId}/webhooks/nationbuilder`,
      status: 'READY_CSV',
    },
  ];

  const civicCompliance = getDefaultCivicCampaignComplianceConfig(orgName);

  const campaignContributions: ElevateCampaignContributionRecord[] = [
    {
      id: `${orgId}_contrib_seed_1`,
      orgId,
      donorFullName: 'Elena Vance-Morales',
      donorEmail: 'elena.morales@example.org',
      streetAddress: '412 Peachtree Hills Ave NE',
      city: 'Atlanta',
      state: 'GA',
      postalCode: '30305',
      occupation: 'Public School Teacher',
      employer: 'Atlanta Public Schools',
      amountUsd: 50,
      aggregateCycleToDateUsd: 50,
      electionCycle: civicCompliance.electionCycleLabel,
      attestation: {
        isUsCitizenOrPermanentResident: true,
        isPersonalFunds: true,
        isNotFederalOrMunicipalContractor: true,
        isPersonalCardNotCorporate: true,
        isAtLeast18: true,
      },
      receiptNotice:
        `Contributions or gifts to ${civicCompliance.committeeLegalName} are not tax-deductible for federal or state income tax purposes.`,
      createdAt: now - 86400000 * 2,
    },
    {
      id: `${orgId}_contrib_seed_2`,
      orgId,
      donorFullName: 'Marcus T. Holloway',
      donorEmail: 'mholloway@example.org',
      streetAddress: '889 Briarcliff Rd NE Apt 4B',
      city: 'Atlanta',
      state: 'GA',
      postalCode: '30306',
      occupation: 'Civil Engineer',
      employer: 'Peachtree Transit Partners',
      amountUsd: 250,
      aggregateCycleToDateUsd: 250,
      electionCycle: civicCompliance.electionCycleLabel,
      attestation: {
        isUsCitizenOrPermanentResident: true,
        isPersonalFunds: true,
        isNotFederalOrMunicipalContractor: true,
        isPersonalCardNotCorporate: true,
        isAtLeast18: true,
      },
      receiptNotice:
        `Contributions or gifts to ${civicCompliance.committeeLegalName} are not tax-deductible for federal or state income tax purposes.`,
      createdAt: now - 86400000,
    },
  ];

  return {
    orgId,
    shiftDrives,
    shiftSignups,
    petitions,
    petitionSignatures,
    spokeCampaigns,
    crmProfiles,
    civicCompliance,
    campaignContributions,
  };
}

// ─── LocalStorage + Firestore Persistence Helpers ────────────────────────────

export function loadElevateMobilizeBundleLocal(org: MobilizeOrgPick): ElevateMobilizeBundle {
  const key = `${STORAGE_PREFIX}${org.id}`;
  const demo = isDemoOrg(org);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as ElevateMobilizeBundle;
        if (parsed && Array.isArray(parsed.shiftDrives)) {
          if (!demo) {
            const cleaned = stripSeededElevateMobilizeItems(org, parsed);
            // Delete leftover sample items for good, not just hide them.
            const json = JSON.stringify(cleaned);
            if (json !== raw) window.localStorage.setItem(key, json);
            return cleaned;
          }
          const fallback = getDefaultElevateMobilizeBundle(org);
          return {
            ...parsed,
            civicCompliance: parsed.civicCompliance || fallback.civicCompliance,
            campaignContributions: parsed.campaignContributions || fallback.campaignContributions,
          };
        }
      }
    } catch {
      // Fall back to the default bundle
    }
  }
  return getDefaultElevateMobilizeBundle(org);
}

/**
 * Real organizations used to be seeded with the demo bundle. Remove any of those sample items
 * (matched by id against the seed for this org) that are still sitting in local storage, while
 * keeping everything the organization created itself.
 */
function stripSeededElevateMobilizeItems(
  org: MobilizeOrgPick,
  stored: ElevateMobilizeBundle
): ElevateMobilizeBundle {
  const seed = buildSampleElevateMobilizeBundle(org);
  const ids = <T extends { id: string }>(arr: T[] | undefined) => new Set((arr || []).map(x => x.id));
  const seedDriveIds = ids(seed.shiftDrives);
  const seedSlotIds = new Set(seed.shiftDrives.flatMap(d => d.slots.map(sl => sl.id)));
  const seedSignupIds = ids(seed.shiftSignups);
  const seedPetitionIds = ids(seed.petitions);
  const seedSignatureIds = ids(seed.petitionSignatures);
  const seedSpokeCampaignIds = ids(seed.spokeCampaigns);
  const seedCrmIds = ids(seed.crmProfiles);
  const seedContributionIds = ids(seed.campaignContributions);

  const shiftDrives: ElevateShiftDrive[] = [];
  for (const drive of stored.shiftDrives || []) {
    const ownSlots = (drive.slots || []).filter(sl => !seedSlotIds.has(sl.id));
    if (!seedDriveIds.has(drive.id)) {
      shiftDrives.push({ ...drive, slots: ownSlots });
    } else if (ownSlots.length > 0) {
      // A sample drive the org added its own slots to: keep the slots, drop the sample framing.
      shiftDrives.push({
        ...drive,
        title: 'Volunteer shifts',
        subtitle: '',
        coordinatorName: '',
        coordinatorRole: undefined,
        coalitionPartnerOrgIds: [],
        slots: ownSlots,
      });
    }
  }

  const shiftSignups = (stored.shiftSignups || []).filter(
    sig => !seedSignupIds.has(sig.id) && !seedSlotIds.has(sig.slotId)
  );
  const petitions = (stored.petitions || []).filter(p => !seedPetitionIds.has(p.id));
  const petitionSignatures = (stored.petitionSignatures || []).filter(
    sig => !seedSignatureIds.has(sig.id) && !seedPetitionIds.has(sig.petitionId)
  );
  const spokeCampaigns = (stored.spokeCampaigns || []).filter(c => !seedSpokeCampaignIds.has(c.id));
  const crmProfiles = (stored.crmProfiles || []).filter(c => !seedCrmIds.has(c.id));
  const campaignContributions = (stored.campaignContributions || []).filter(
    c => !seedContributionIds.has(c.id)
  );

  const blank = getBlankCivicCampaignComplianceConfig(org.name);
  let civicCompliance = stored.civicCompliance || blank;
  const seedCivic = seed.civicCompliance;
  if (seedCivic) {
    const sampleFields = [
      'committeeLegalName',
      'candidateName',
      'officeSought',
      'treasurerFullName',
      'committeeRegistrationId',
      'electionCycleLabel',
    ] as const;
    const patch: Partial<ElevateCivicCampaignComplianceConfig> = {};
    for (const f of sampleFields) {
      if (civicCompliance[f] === seedCivic[f]) patch[f] = blank[f];
    }
    civicCompliance = { ...civicCompliance, ...patch };
  }

  return {
    ...stored,
    orgId: org.id,
    shiftDrives,
    shiftSignups,
    petitions,
    petitionSignatures,
    spokeCampaigns,
    crmProfiles,
    civicCompliance,
    campaignContributions,
  };
}

export function saveElevateMobilizeBundleLocal(bundle: ElevateMobilizeBundle): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${bundle.orgId}`, JSON.stringify(bundle));
    } catch {
      // Ignore storage quota errors
    }
  }
}

/** Optional background sync to Firestore using single-equality orgId queries + stripUndefined. */
export async function syncElevateMobilizeBundleToFirestore(
  bundle: ElevateMobilizeBundle
): Promise<void> {
  saveElevateMobilizeBundleLocal(bundle);
  try {
    const ref = doc(db, 'elevate_mobilize_bundles', bundle.orgId);
    await setDoc(ref, stripUndefined({ ...bundle, updatedAt: Date.now() }), { merge: true });
  } catch {
    // Offline or demo mode: local state already persisted
  }
}

export async function fetchElevateMobilizeChatsOrDrivesFromFirestore(
  orgId: string
): Promise<ElevateShiftDrive[] | null> {
  try {
    const q = query(collection(db, 'elevate_shift_drives'), where('orgId', '==', orgId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs
      .map(d => d.data() as ElevateShiftDrive)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return null;
  }
}

// ─── 1. Multi-Shift Volunteer Scheduling & Automatic Waitlist Promotion ──────

export interface ShiftSignupResult {
  drive: ElevateShiftDrive;
  signups: ElevateShiftSignup[];
  createdSignup: ElevateShiftSignup;
  reminderNotifications: NonSmsReminderNotificationPayload[];
}

export function signUpForElevateShift(
  drive: ElevateShiftDrive,
  existingSignups: ElevateShiftSignup[],
  params: {
    slotId: string;
    uid: string;
    userName: string;
    userEmail?: string;
    userAvatar?: string;
    sourceOrgId?: string;
    now?: number;
  }
): ShiftSignupResult {
  const now = params.now ?? Date.now();
  const slot = drive.slots.find(s => s.id === params.slotId);
  if (!slot) {
    throw new Error(`Shift slot ${params.slotId} not found in drive ${drive.id}`);
  }

  // Prevent duplicate active signup for the same user + slot
  const existingActive = existingSignups.find(
    s => s.slotId === params.slotId && s.uid === params.uid && s.status !== 'CANCELLED'
  );
  if (existingActive) {
    return {
      drive,
      signups: existingSignups,
      createdSignup: existingActive,
      reminderNotifications: [],
    };
  }

  const hasCapacity = slot.confirmedCount < slot.capacity;
  if (!hasCapacity && !slot.waitlistEnabled) {
    throw new Error('Shift slot is at full capacity and waitlist is disabled.');
  }

  const status: ElevateShiftSignup['status'] = hasCapacity ? 'CONFIRMED' : 'WAITLISTED';
  const createdSignup: ElevateShiftSignup = {
    id: `signup_${params.slotId}_${params.uid}_${now}`,
    driveId: drive.id,
    slotId: slot.id,
    orgId: drive.orgId,
    sourceOrgId: params.sourceOrgId,
    uid: params.uid,
    userName: params.userName,
    userEmail: params.userEmail,
    userAvatar: params.userAvatar,
    status,
    confirmedAttendance24h: false,
    signedUpAt: now,
    verifiedHours: 0,
  };

  const updatedSlots: ElevateShiftSlot[] = drive.slots.map(s => {
    if (s.id !== slot.id) return s;
    return {
      ...s,
      confirmedCount: status === 'CONFIRMED' ? s.confirmedCount + 1 : s.confirmedCount,
      waitlistCount: status === 'WAITLISTED' ? s.waitlistCount + 1 : s.waitlistCount,
    };
  });

  const updatedDrive: ElevateShiftDrive = {
    ...drive,
    slots: updatedSlots,
    updatedAt: now,
  };

  const updatedSlot = updatedSlots.find(s => s.id === slot.id)!;
  const reminderNotifications: NonSmsReminderNotificationPayload[] = [];
  if (drive.reminderCadence.enabled && status === 'CONFIRMED') {
    if (drive.reminderCadence.send72hPrepBrief) {
      reminderNotifications.push(
        buildNonSmsReminderPayload(updatedDrive, updatedSlot, createdSignup, '72H_PREP')
      );
    }
    if (drive.reminderCadence.send24hConfirmPing) {
      reminderNotifications.push(
        buildNonSmsReminderPayload(updatedDrive, updatedSlot, createdSignup, '24H_CONFIRM')
      );
    }
    if (drive.reminderCadence.send1hDoorsPass) {
      reminderNotifications.push(
        buildNonSmsReminderPayload(updatedDrive, updatedSlot, createdSignup, '1H_DOORS')
      );
    }
  }

  return {
    drive: updatedDrive,
    signups: [...existingSignups, createdSignup],
    createdSignup,
    reminderNotifications,
  };
}

export interface ShiftCancellationResult {
  drive: ElevateShiftDrive;
  signups: ElevateShiftSignup[];
  cancelledSignup: ElevateShiftSignup;
  promotedSignup?: ElevateShiftSignup;
  promotionNotification?: NonSmsReminderNotificationPayload;
}

/**
 * Cancels a shift signup (or handles a 24h "Release Seat" quick-action) and
 * automatically promotes the earliest waitlisted volunteer if a confirmed seat opened up.
 */
export function cancelOrReleaseElevateShift(
  drive: ElevateShiftDrive,
  existingSignups: ElevateShiftSignup[],
  signupId: string,
  now: number = Date.now()
): ShiftCancellationResult {
  const target = existingSignups.find(s => s.id === signupId);
  if (!target) {
    throw new Error(`Signup ${signupId} not found`);
  }
  if (target.status === 'CANCELLED') {
    return { drive, signups: existingSignups, cancelledSignup: target };
  }

  const wasConfirmed = target.status === 'CONFIRMED' || target.status === 'CHECKED_IN';
  const wasWaitlisted = target.status === 'WAITLISTED';

  // Find earliest waitlisted signup for the same slot if a confirmed spot opened
  const waitlistedQueue = existingSignups
    .filter(s => s.slotId === target.slotId && s.status === 'WAITLISTED' && s.id !== target.id)
    .sort((a, b) => a.signedUpAt - b.signedUpAt);

  const nextOnWaitlist = wasConfirmed ? waitlistedQueue[0] : undefined;

  let promotedSignup: ElevateShiftSignup | undefined;
  const updatedSignups = existingSignups.map(s => {
    if (s.id === target.id) {
      return { ...s, status: 'CANCELLED' as const };
    }
    if (nextOnWaitlist && s.id === nextOnWaitlist.id) {
      promotedSignup = {
        ...s,
        status: 'CONFIRMED',
        promotedFromWaitlistAt: now,
      };
      return promotedSignup;
    }
    return s;
  });

  const updatedSlots = drive.slots.map(slot => {
    if (slot.id !== target.slotId) return slot;
    if (wasConfirmed) {
      if (promotedSignup) {
        // Confirmed stays same (one out, one promoted), waitlist decreases by 1
        return {
          ...slot,
          waitlistCount: Math.max(0, slot.waitlistCount - 1),
        };
      }
      return {
        ...slot,
        confirmedCount: Math.max(0, slot.confirmedCount - 1),
      };
    }
    if (wasWaitlisted) {
      return {
        ...slot,
        waitlistCount: Math.max(0, slot.waitlistCount - 1),
      };
    }
    return slot;
  });

  const updatedDrive: ElevateShiftDrive = {
    ...drive,
    slots: updatedSlots,
    updatedAt: now,
  };

  const slotObj = updatedSlots.find(s => s.id === target.slotId)!;
  const promotionNotification = promotedSignup
    ? buildNonSmsReminderPayload(updatedDrive, slotObj, promotedSignup, 'WAITLIST_PROMOTED')
    : undefined;

  return {
    drive: updatedDrive,
    signups: updatedSignups,
    cancelledSignup: { ...target, status: 'CANCELLED' },
    promotedSignup,
    promotionNotification,
  };
}

/** 1-tap attendance confirmation from the 24h non-SMS reminder. */
export function confirmElevateShiftAttendance24h(
  existingSignups: ElevateShiftSignup[],
  signupId: string
): ElevateShiftSignup[] {
  return existingSignups.map(s =>
    s.id === signupId ? { ...s, confirmedAttendance24h: true } : s
  );
}

export interface ShiftCheckInResult {
  drive: ElevateShiftDrive;
  signups: ElevateShiftSignup[];
  completedSignup: ElevateShiftSignup;
  chmsAttendanceRecord: ChmsAttendance;
  postEventNotification: NonSmsReminderNotificationPayload;
}

/**
 * Checks in and verifies a volunteer's shift completion, stamping verified hours,
 * unlocking Sanctuary rewards ("Volunteer-to-Unlock"), and generating a ChmsAttendance record.
 */
export function checkInElevateShiftVolunteer(
  drive: ElevateShiftDrive,
  existingSignups: ElevateShiftSignup[],
  signupId: string,
  method: 'QR_PASS' | 'SANCTUARY_GEOFENCE' | 'LEADER_ROSTER' = 'QR_PASS',
  now: number = Date.now()
): ShiftCheckInResult {
  const target = existingSignups.find(s => s.id === signupId);
  if (!target) {
    throw new Error(`Signup ${signupId} not found`);
  }
  const slot = drive.slots.find(s => s.id === target.slotId);
  if (!slot) {
    throw new Error(`Slot ${target.slotId} not found`);
  }

  const alreadyCheckedIn = target.status === 'COMPLETED' || target.status === 'CHECKED_IN';
  const completedSignup: ElevateShiftSignup = {
    ...target,
    status: 'COMPLETED',
    confirmedAttendance24h: true,
    checkedInAt: target.checkedInAt || now,
    completedAt: now,
    verifiedHours: slot.durationHours,
    checkInMethod: method,
    unlockedRewardTitle: slot.rewardUnlock?.sanctuaryUnlockTitle || slot.rewardUnlock?.badgeTitle,
  };

  const updatedSignups = existingSignups.map(s => (s.id === signupId ? completedSignup : s));
  const updatedSlots = drive.slots.map(s => {
    if (s.id !== slot.id) return s;
    return {
      ...s,
      checkedInCount: alreadyCheckedIn ? s.checkedInCount : s.checkedInCount + 1,
    };
  });

  const updatedDrive: ElevateShiftDrive = {
    ...drive,
    slots: updatedSlots,
    updatedAt: now,
  };

  const chmsAttendanceRecord: ChmsAttendance = {
    id: `att_${slot.id}_${target.uid}`,
    orgId: drive.orgId,
    serviceDate: slot.dateISO,
    serviceLabel: `${drive.title} · ${slot.roleTitle}`,
    personId: target.uid,
    personName: target.userName,
    campusId: slot.campusId,
    method: method === 'QR_PASS' ? 'QR' : 'MANUAL',
    createdAt: now,
  };

  const postEventNotification = buildNonSmsReminderPayload(
    updatedDrive,
    slot,
    completedSignup,
    'POST_EVENT_SYNERGY'
  );

  return {
    drive: updatedDrive,
    signups: updatedSignups,
    completedSignup,
    chmsAttendanceRecord,
    postEventNotification,
  };
}

// ─── 2. Non-SMS Reminder & Post-Event Plajah Synergy Builder ─────────────────

export function buildNonSmsReminderPayload(
  drive: ElevateShiftDrive,
  slot: ElevateShiftSlot,
  signup: ElevateShiftSignup,
  stage: NonSmsReminderNotificationPayload['stage']
): NonSmsReminderNotificationPayload {
  // Volunteer hours are recorded, never traded for media or points.
  const rewardLine = 'Counts toward your verified Elevate Impact Passport.';

  if (stage === '72H_PREP') {
    return {
      id: `rem_72h_${signup.id}`,
      orgId: drive.orgId,
      recipientUid: signup.uid,
      recipientEmail: signup.userEmail,
      stage,
      channels: drive.reminderCadence.channels,
      title: `72h Shift Prep · ${slot.roleTitle}`,
      body: `Hi ${signup.userName}, your shift for "${drive.title}" is coming up on ${slot.dateISO} (${slot.startTime}–${slot.endTime}) at ${slot.locationLabel}. ${rewardLine}`,
      quickActions: [
        { action: 'JOIN_MINISTRY_ROOM', label: 'Open Ministry Prep Room' },
        { action: 'BRING_A_FRIEND', label: 'Invite a Friend to Serve' },
      ],
      postManEmailSubject: `[Prep Brief] ${slot.roleTitle} — ${drive.title} (${slot.dateISO})`,
      postManHtmlPreview: `<p>Grace and peace ${signup.userName},</p><p>Here is your 72-hour preparation packet for <b>${slot.roleTitle}</b> at <b>${slot.locationLabel}</b> (${slot.dateISO}, ${slot.startTime}–${slot.endTime}).</p><p>${rewardLine}</p>`,
      icsCalendarSummary: `${slot.roleTitle} — ${drive.title}`,
    };
  }

  if (stage === '24H_CONFIRM') {
    return {
      id: `rem_24h_${signup.id}`,
      orgId: drive.orgId,
      recipientUid: signup.uid,
      recipientEmail: signup.userEmail,
      stage,
      channels: drive.reminderCadence.channels,
      title: `1-Tap Confirm for Tomorrow · ${slot.roleTitle}`,
      body: `Can you still make your ${slot.startTime} shift tomorrow at ${slot.locationLabel}? Confirm in one tap, or release your seat so the waitlist can auto-promote a neighbor.`,
      quickActions: [
        { action: 'CONFIRM_SHIFT', label: 'Confirm I’m Coming (1-Tap)' },
        { action: 'RELEASE_SEAT_TO_WAITLIST', label: 'Can’t Make It — Release to Waitlist' },
      ],
      postManEmailSubject: `[Action Required] 1-Tap Confirm: ${slot.roleTitle} Tomorrow at ${slot.startTime}`,
      postManHtmlPreview: `<p>Hi ${signup.userName},</p><p>Your shift <b>${slot.roleTitle}</b> starts tomorrow (${slot.dateISO}) at <b>${slot.startTime}</b>. Please click <b>Confirm Shift</b> or <b>Release Seat to Waitlist</b> so our ministry team has an accurate count.</p>`,
    };
  }

  if (stage === 'WAITLIST_PROMOTED') {
    return {
      id: `rem_promoted_${signup.id}`,
      orgId: drive.orgId,
      recipientUid: signup.uid,
      recipientEmail: signup.userEmail,
      stage,
      channels: drive.reminderCadence.channels,
      title: `You’re In! Promoted from Waitlist · ${slot.roleTitle}`,
      body: `A spot just opened in "${slot.roleTitle}" on ${slot.dateISO} (${slot.startTime}–${slot.endTime}) and you have been automatically promoted to CONFIRMED!`,
      quickActions: [
        { action: 'CONFIRM_SHIFT', label: 'Lock In My Seat' },
        { action: 'OPEN_CHECKIN_PASS', label: 'Open Sanctuary QR Pass' },
      ],
      postManEmailSubject: `Spot Confirmed! You’ve been promoted from the waitlist for ${slot.roleTitle}`,
      postManHtmlPreview: `<p>Great news ${signup.userName}!</p><p>A seat opened for <b>${slot.roleTitle}</b> (${slot.dateISO}, ${slot.startTime}–${slot.endTime}) and our waitlist engine automatically confirmed your spot.</p>`,
      icsCalendarSummary: `${slot.roleTitle} — ${drive.title}`,
    };
  }

  if (stage === '1H_DOORS') {
    return {
      id: `rem_1h_${signup.id}`,
      orgId: drive.orgId,
      recipientUid: signup.uid,
      recipientEmail: signup.userEmail,
      stage,
      channels: drive.reminderCadence.channels,
      title: `Starting in 1 Hour · Sanctuary QR & Geofence Pass Ready`,
      body: `${slot.roleTitle} begins at ${slot.startTime} (${slot.locationLabel}). Your Sanctuary Geofence & QR check-in pass is active now.`,
      quickActions: [
        { action: 'OPEN_CHECKIN_PASS', label: 'Open QR / Geofence Check-In' },
        { action: 'JOIN_MINISTRY_ROOM', label: 'Open Live Team Channel' },
      ],
      postManEmailSubject: `Starting in 1 Hour: ${slot.roleTitle} Check-In Pass`,
      postManHtmlPreview: `<p>See you in an hour, ${signup.userName}!</p><p>Check in at <b>${slot.locationLabel}</b> using your Plajah Elevate QR Pass or automatic Sanctuary Geofence.</p>`,
    };
  }

  // POST_EVENT_SYNERGY
  return {
    id: `rem_post_${signup.id}`,
    orgId: drive.orgId,
    recipientUid: signup.uid,
    recipientEmail: signup.userEmail,
    stage: 'POST_EVENT_SYNERGY',
    channels: drive.reminderCadence.channels,
    title: `Verified: +${slot.durationHours}h Credited`,
    body: `Thank you for serving in "${slot.roleTitle}", ${signup.userName}! +${slot.durationHours} verified hours have been stamped to your Elevate Impact Passport & Ora Goals. ${rewardLine}`,
    quickActions: [
      { action: 'UPLOAD_TO_PHOTO_POOL', label: 'Add Photos to Community Pool' },
      { action: 'BRING_A_FRIEND', label: 'Share Impact Badge' },
    ],
    postManEmailSubject: `Thank You for Serving! +${slot.durationHours} Verified Impact Hours Receipt`,
    postManHtmlPreview: `<p>Thank you ${signup.userName}!</p><p>We’ve credited <b>${slot.durationHours} verified hours</b> to your Plajah Elevate Impact Passport. ${rewardLine}</p><p>Drop your favorite moments into the <b>Community Photo Pool</b> and read the ARIA Service Brief!</p>`,
    ariaRepurposeJobDraft: drive.reminderCadence.postEventSynergy.autoQueueAriaRepurposeBrief
      ? {
          id: `aria_repurpose_${drive.id}_${slot.id}`,
          sourceType: 'SERMON',
          sourceTitle: `${drive.title} — ${slot.roleTitle} Impact Recap`,
          status: 'COMPLETED',
          createdAt: Date.now(),
        }
      : undefined,
    photoPoolPrompt: drive.reminderCadence.postEventSynergy.promptCommunityPhotoPool
      ? {
          eventId: drive.linkedEventId || drive.id,
          promptTitle: `Share photos from ${drive.title} (${slot.roleTitle})`,
        }
      : undefined,
  };
}

// ─── 3. Petitions, Open Letters, Covenants & Milestone Unlocks ───────────────

export interface SignPetitionResult {
  petition: ElevatePetitionDrive;
  signatures: ElevatePetitionSignature[];
  createdSignature: ElevatePetitionSignature;
  newlyUnlockedMilestones: ElevatePetitionDrive['milestones'];
}

export function signElevatePetition(
  petition: ElevatePetitionDrive,
  existingSignatures: ElevatePetitionSignature[],
  params: {
    uid: string;
    signerName: string;
    signerCity?: string;
    signerRoleBadge?: string;
    comment?: string;
    testimonyKind?: 'TEXT' | 'VOICE_30S' | 'VIDEO_30S';
    testimonyMediaUrl?: string;
    testimonyDurationSec?: number;
    pledgedHours?: number;
    sourceOrgId?: string;
    isVerifiedMember?: boolean;
    now?: number;
  }
): SignPetitionResult {
  const now = params.now ?? Date.now();
  const alreadySigned = existingSignatures.find(
    s => s.petitionId === petition.id && s.uid === params.uid
  );
  if (alreadySigned) {
    return {
      petition,
      signatures: existingSignatures,
      createdSignature: alreadySigned,
      newlyUnlockedMilestones: [],
    };
  }

  const hasVoiceOrVideo =
    params.testimonyKind === 'VOICE_30S' || params.testimonyKind === 'VIDEO_30S';
  const pledgedHours = Math.max(0, Number(params.pledgedHours || 0));

  const createdSignature: ElevatePetitionSignature = {
    id: `sig_${petition.id}_${params.uid}_${now}`,
    petitionId: petition.id,
    orgId: petition.orgId,
    sourceOrgId: params.sourceOrgId,
    uid: params.uid,
    signerName: params.signerName,
    signerCity: params.signerCity || '',
    signerRoleBadge: params.signerRoleBadge || 'Verified Member',
    comment: params.comment,
    testimonyKind: params.testimonyKind || 'TEXT',
    testimonyMediaUrl: params.testimonyMediaUrl,
    testimonyDurationSec: params.testimonyDurationSec,
    pledgedHours,
    isPublic: true,
    createdAt: now,
  };

  const newSignatureCount = petition.signatureCount + 1;
  const newlyUnlockedMilestones: ElevatePetitionDrive['milestones'] = [];

  const updatedMilestones = petition.milestones.map(ms => {
    if (!ms.unlocked && newSignatureCount >= ms.targetSignatures) {
      const unlockedMs = { ...ms, unlocked: true, unlockedAt: now };
      newlyUnlockedMilestones.push(unlockedMs);
      return unlockedMs;
    }
    return ms;
  });

  const updatedPetition: ElevatePetitionDrive = {
    ...petition,
    signatureCount: newSignatureCount,
    verifiedMemberCount:
      params.isVerifiedMember !== false
        ? petition.verifiedMemberCount + 1
        : petition.verifiedMemberCount,
    voiceTestimonyCount: hasVoiceOrVideo
      ? petition.voiceTestimonyCount + 1
      : petition.voiceTestimonyCount,
    totalPledgedHours: petition.totalPledgedHours + pledgedHours,
    milestones: updatedMilestones,
    updatedAt: now,
  };

  return {
    petition: updatedPetition,
    signatures: [createdSignature, ...existingSignatures],
    createdSignature,
    newlyUnlockedMilestones,
  };
}

/** Formats a Petition / Open Letter / Covenant into a print-ready Tela Studio Dossier markdown document. */
export function buildPetitionTelaDossierMarkdown(
  petition: ElevatePetitionDrive,
  signatures: ElevatePetitionSignature[]
): string {
  const petitionSigs = signatures.filter(s => s.petitionId === petition.id);
  const unlockedMatches = petition.milestones
    .filter(m => m.unlocked && m.matchAmountUsd)
    .reduce((sum, m) => sum + (m.matchAmountUsd || 0), 0);

  const lines: string[] = [
    `# ${petition.title}`,
    `**Kind:** ${petition.kind.replace(/_/g, ' ')} · **Recipient:** ${petition.recipientTarget || 'Congregation & Civic Leadership'}`,
    `**Verified Signatures:** ${petition.signatureCount.toLocaleString()} / ${petition.goalSignatures.toLocaleString()} · **Voice/Video Testimonies:** ${petition.voiceTestimonyCount} · **Pledged Action Hours:** ${petition.totalPledgedHours.toLocaleString()}h`,
    unlockedMatches > 0
      ? `**Unlocked Sponsor Matching Funds:** $${unlockedMatches.toLocaleString()} USD`
      : '',
    '',
    '---',
    '',
    petition.bodyMarkdown,
    '',
    '---',
    '## Featured Verified Signers & Voice Testimonies',
    ...petitionSigs.slice(0, 25).map((s, idx) => {
      const badge = s.signerRoleBadge ? ` (${s.signerRoleBadge})` : '';
      const mediaTag =
        s.testimonyKind === 'VOICE_30S'
          ? ' [🎙️ 30s Voice Testimony Attached]'
          : s.testimonyKind === 'VIDEO_30S'
          ? ' [🎬 30s Video Testimony Attached]'
          : '';
      const hoursTag = s.pledgedHours ? ` — *Pledged ${s.pledgedHours}h*` : '';
      return `${idx + 1}. **${s.signerName}**${badge}, ${s.signerCity || ''}${mediaTag}${hoursTag}${
        s.comment ? `\n   > "${s.comment}"` : ''
      }`;
    }),
  ];

  return lines.filter(Boolean).join('\n');
}

// ─── 4. Distributed Peer-to-Peer Spoke Event Hosting & Rollups ───────────────

export function applyToHostElevateSpoke(
  campaign: ElevateSpokeCampaign,
  draft: {
    hostUid: string;
    hostName: string;
    hostRoleBadge?: string;
    title: string;
    city: string;
    neighborhood: string;
    venueKind: ElevateSpokeHostEvent['venueKind'];
    dateISO: string;
    timeLabel: string;
    capacity: number;
    notes?: string;
  },
  now: number = Date.now()
): { campaign: ElevateSpokeCampaign; createdSpoke: ElevateSpokeHostEvent } {
  const autoApprove = !campaign.requireHostVetting;
  const createdSpoke: ElevateSpokeHostEvent = {
    id: `spoke_${campaign.id}_${now}`,
    campaignId: campaign.id,
    parentOrgId: campaign.orgId,
    hostUid: draft.hostUid,
    hostName: draft.hostName,
    hostRoleBadge: draft.hostRoleBadge || 'Congregation Member Host',
    title: draft.title,
    city: draft.city,
    neighborhood: draft.neighborhood,
    venueKind: draft.venueKind,
    dateISO: draft.dateISO,
    timeLabel: draft.timeLabel,
    capacity: Math.max(2, draft.capacity || 15),
    rsvpCount: 1,
    checkedInCount: 0,
    status: autoApprove ? 'APPROVED_LIVE' : 'PENDING_VETTING',
    hostVetted: autoApprove,
    notes: draft.notes,
    createdAt: now,
  };

  return {
    campaign: {
      ...campaign,
      spokes: [createdSpoke, ...campaign.spokes],
    },
    createdSpoke,
  };
}

export function reviewElevateSpokeHostEvent(
  campaign: ElevateSpokeCampaign,
  spokeId: string,
  decision: 'APPROVE' | 'DECLINE'
): ElevateSpokeCampaign {
  return {
    ...campaign,
    spokes: campaign.spokes.map(sp => {
      if (sp.id !== spokeId) return sp;
      return {
        ...sp,
        status: decision === 'APPROVE' ? 'APPROVED_LIVE' : 'DECLINED',
        hostVetted: decision === 'APPROVE',
      };
    }),
  };
}

export function rsvpToElevateSpokeEvent(
  campaign: ElevateSpokeCampaign,
  spokeId: string
): ElevateSpokeCampaign {
  return {
    ...campaign,
    spokes: campaign.spokes.map(sp => {
      if (sp.id !== spokeId) return sp;
      if (sp.rsvpCount >= sp.capacity) return sp;
      return {
        ...sp,
        rsvpCount: sp.rsvpCount + 1,
      };
    }),
  };
}

export interface SpokeCampaignRollupMetrics {
  totalSpokes: number;
  approvedLiveSpokes: number;
  pendingVettingSpokes: number;
  totalRsvps: number;
  totalCheckedIn: number;
  totalCapacity: number;
  citiesReached: string[];
}

export function computeSpokeCampaignRollup(
  campaign: ElevateSpokeCampaign
): SpokeCampaignRollupMetrics {
  const activeSpokes = campaign.spokes.filter(s => s.status !== 'DECLINED');
  const approvedLiveSpokes = campaign.spokes.filter(
    s => s.status === 'APPROVED_LIVE' || s.status === 'COMPLETED'
  ).length;
  const pendingVettingSpokes = campaign.spokes.filter(
    s => s.status === 'PENDING_VETTING'
  ).length;
  const totalRsvps = activeSpokes.reduce((sum, s) => sum + s.rsvpCount, 0);
  const totalCheckedIn = activeSpokes.reduce((sum, s) => sum + s.checkedInCount, 0);
  const totalCapacity = activeSpokes.reduce((sum, s) => sum + s.capacity, 0);
  const citiesReached = Array.from(new Set(activeSpokes.map(s => s.city).filter(Boolean)));

  return {
    totalSpokes: activeSpokes.length,
    approvedLiveSpokes,
    pendingVettingSpokes,
    totalRsvps,
    totalCheckedIn,
    totalCapacity,
    citiesReached,
  };
}

// ─── 5. Member Impact Passport & Coalition / External CRM Sync Bridge ────────

export function computeElevateImpactPassport(
  uid: string,
  orgId: string,
  drives: ElevateShiftDrive[],
  signups: ElevateShiftSignup[],
  petitions: ElevatePetitionDrive[],
  signatures: ElevatePetitionSignature[],
  spokeCampaigns: ElevateSpokeCampaign[]
): ElevateImpactPassport {
  const slotMap = new Map<string, ElevateShiftSlot>();
  drives.forEach(d => d.slots.forEach(s => slotMap.set(s.id, s)));

  const userSignups = signups.filter(s => s.uid === uid && s.status !== 'CANCELLED');
  const completedSignups = userSignups.filter(s => s.status === 'COMPLETED');
  const upcomingSignups = userSignups.filter(
    s => s.status === 'CONFIRMED' || s.status === 'WAITLISTED'
  );

  const verifiedVolunteerHours = completedSignups.reduce(
    (sum, s) => sum + (s.verifiedHours || slotMap.get(s.slotId)?.durationHours || 0),
    0
  );

  let plajahPointsEarned = 0;
  const unlockedRewards: string[] = [];
  const badges: string[] = [];

  completedSignups.forEach(s => {
    const slot = slotMap.get(s.slotId);
    if (slot?.rewardUnlock) {
      plajahPointsEarned += slot.rewardUnlock.plajahPoints || 0;
      if (slot.rewardUnlock.sanctuaryUnlockTitle) {
        unlockedRewards.push(slot.rewardUnlock.sanctuaryUnlockTitle);
      }
      if (slot.rewardUnlock.badgeTitle) {
        badges.push(slot.rewardUnlock.badgeTitle);
      }
    }
  });

  const userSignatures = signatures.filter(s => s.uid === uid);
  plajahPointsEarned += userSignatures.length * 50;

  const userSpokes = spokeCampaigns.flatMap(c =>
    c.spokes.filter(sp => sp.hostUid === uid && sp.status !== 'DECLINED')
  );
  plajahPointsEarned += userSpokes.length * 250;
  if (userSpokes.length > 0) {
    badges.push('Certified Spoke Sanctuary Host');
  }

  return {
    uid,
    orgId,
    verifiedVolunteerHours,
    completedShiftsCount: completedSignups.length,
    upcomingShiftsCount: upcomingSignups.length,
    petitionsSignedCount: userSignatures.length,
    spokesHostedCount: userSpokes.length,
    plajahPointsEarned,
    unlockedRewards: Array.from(new Set(unlockedRewards)),
    badges: Array.from(new Set(badges)),
  };
}

/**
 * Bi-directional External CRM CSV Mapper:
 * Maps CSV exports from NGP VAN / EveryAction, Planning Center, Servant Keeper,
 * NationBuilder, or Salesforce Nonprofit into Elevate `ChmsPerson` records.
 */
export function mapExternalCrmCsvToElevateChms(
  provider: ElevateExternalCrmProvider,
  csvText: string,
  orgId: string,
  now: number = Date.now()
): ChmsPerson[] {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idxOf = (candidates: string[]) =>
    headers.findIndex(h => candidates.some(c => h.includes(c)));

  const firstIdx = idxOf(['first_name', 'firstname', 'given_name', 'first']);
  const lastIdx = idxOf(['last_name', 'lastname', 'family_name', 'last']);
  const fullIdx = idxOf(['full_name', 'name', 'supporter_name']);
  const emailIdx = idxOf(['email', 'primary_email', 'email_address']);
  const phoneIdx = idxOf(['phone', 'mobile', 'cell']);
  const tagIdx = idxOf(['tags', 'activist_code', 'ministry', 'committee', 'role']);
  const extIdIdx = idxOf(['vanid', 'pco_id', 'external_id', 'supporter_id', 'id']);

  const people: ChmsPerson[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    let firstName = firstIdx >= 0 ? cols[firstIdx] || '' : '';
    let lastName = lastIdx >= 0 ? cols[lastIdx] || '' : '';

    if ((!firstName || !lastName) && fullIdx >= 0 && cols[fullIdx]) {
      const parts = cols[fullIdx].split(/\s+/);
      firstName = parts[0] || 'Member';
      lastName = parts.slice(1).join(' ') || '';
    }
    if (!firstName) continue;

    const rawTags = tagIdx >= 0 && cols[tagIdx] ? cols[tagIdx].split(/[;|]/).map(t => t.trim()) : [];
    const extId = extIdIdx >= 0 && cols[extIdIdx] ? cols[extIdIdx] : `${provider.toLowerCase()}_${i}`;

    people.push({
      id: `chms_${orgId}_${extId}`,
      orgId,
      firstName,
      lastName,
      email: emailIdx >= 0 ? cols[emailIdx] || undefined : undefined,
      phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
      memberStatus: 'MEMBER',
      tags: Array.from(new Set([`CRM:${provider}`, ...rawTags.filter(Boolean)])),
      externalId: extId,
      createdAt: now,
      updatedAt: now,
    });
  }

  return people;
}

/**
 * Exports Elevate Volunteer Shift Signups & Petition Signatures to a standardized CSV
 * ready for NGP VAN / EveryAction, Planning Center, NationBuilder, or Salesforce import.
 */
export function exportElevateMobilizeToCrmCsv(
  provider: ElevateExternalCrmProvider,
  orgId: string,
  signups: ElevateShiftSignup[],
  signatures: ElevatePetitionSignature[]
): string {
  const header =
    provider === 'NGP_VAN_EVERYACTION'
      ? 'ExternalID,FullName,Email,ActionType,ShiftOrPetitionID,Status,VerifiedHours,SourceOrgID,TimestampISO'
      : 'PersonID,Name,Email,ActivityKind,ReferenceID,Status,VerifiedHours,CoalitionSourceOrg,DateISO';

  const rows: string[] = [header];

  signups.forEach(s => {
    rows.push(
      [
        s.uid,
        `"${(s.userName || '').replace(/"/g, '""')}"`,
        s.userEmail || '',
        'VOLUNTEER_SHIFT',
        s.slotId,
        s.status,
        String(s.verifiedHours || 0),
        s.sourceOrgId || orgId,
        new Date(s.signedUpAt).toISOString(),
      ].join(',')
    );
  });

  signatures.forEach(sig => {
    rows.push(
      [
        sig.uid,
        `"${(sig.signerName || '').replace(/"/g, '""')}"`,
        '',
        'PETITION_COVENANT_SIGNATURE',
        sig.petitionId,
        sig.testimonyKind || 'TEXT',
        String(sig.pledgedHours || 0),
        sig.sourceOrgId || orgId,
        new Date(sig.createdAt).toISOString(),
      ].join(',')
    );
  });

  return rows.join('\n');
}

// ─── Dedicated Grassroots & Local Civic Campaign Compliance Engine ───────────

/**
 * Default opt-in compliance configuration for Grassroots Candidates, School Board /
 * City Council races, Local Ballot Committees, and 501(c)(4) / 527 organizations.
 * Disabled by default on 501(c)(3) church/nonprofit workspaces until toggled on.
 */
export function getDefaultCivicCampaignComplianceConfig(
  orgName: string = 'Neighbors for District 4'
): ElevateCivicCampaignComplianceConfig {
  const cleanName = orgName.trim() || 'Neighbors for District 4';
  return {
    enabled: false,
    taxClassification: '527_CANDIDATE_COMMITTEE',
    jurisdiction: 'GRASSROOTS_MUNICIPAL',
    committeeLegalName: `Friends of ${cleanName} Committee`,
    candidateName: 'Jordan Vance',
    officeSought: 'City Council · District 4',
    treasurerFullName: 'patricia.okafor@example.org · Patricia Okafor, CPA',
    committeeRegistrationId: 'MUN-2026-D4-0819',
    authorizedByCandidate: true,
    perDonorElectionLimitUsd: 3300,
    itemizationThresholdUsd: 100,
    electionCycleLabel: '2026 Municipal General Election',
    johnsonAmendmentFirewallActive: true,
    antiVoteBuyingRewardGuardActive: true,
    blockCorporateInKindMatchActive: true,
    syntheticMediaDisclosureActive: true,
    taxDeductibleReceiptsDisabled: true,
  };
}

/**
 * Generates the statutory "Paid for by..." box disclaimer (11 CFR § 110.11 / state & municipal
 * election codes), non-deductible tax notice (26 U.S.C. § 6113), and AI synthetic media notice.
 */
export function buildCampaignDisclaimerBox(
  config: ElevateCivicCampaignComplianceConfig
): {
  headlineBoxText: string;
  broadcastSubline: string;
  syntheticMediaNotice?: string;
  taxNotice: string;
} {
  const committee = config.committeeLegalName.trim() || 'Authorized Campaign Committee';
  const treasurer = config.treasurerFullName.trim() || 'Campaign Treasurer';
  const authClause =
    config.taxClassification === 'BALLOT_QUESTION_COMMITTEE'
      ? `Ballot Measure Committee (${config.electionCycleLabel}). Not authorized by any candidate or candidate's committee.`
      : config.authorizedByCandidate
      ? `Authorized by ${config.candidateName || committee}${
          config.officeSought ? ` for ${config.officeSought}` : ''
        }.`
      : 'Not authorized by any candidate or candidate’s committee.';

  const regSuffix = config.committeeRegistrationId
    ? ` Committee ID: ${config.committeeRegistrationId}.`
    : '';

  const headlineBoxText = `PAID FOR BY ${committee.toUpperCase()}, ${treasurer.toUpperCase()}, TREASURER. ${authClause}${regSuffix}`;

  const broadcastSubline = `Paid for by ${committee} · Treasurer: ${treasurer} · ${config.electionCycleLabel}`;

  const syntheticMediaNotice = config.syntheticMediaDisclosureActive
    ? `Statutory AI / Synthetic Media Notice: Audio or video clips generated or translated via Plajah ARIA / Fabula include assistive AI synthesis authorized by ${committee}.`
    : undefined;

  const taxNotice =
    config.taxClassification === '501C3_PUBLIC_CHARITY' && !config.taxDeductibleReceiptsDisabled
      ? 'Contributions are tax-deductible to the extent permitted by 26 U.S.C. § 501(c)(3).'
      : `Contributions or gifts to ${committee} are NOT tax-deductible for federal or state income tax purposes.`;

  return {
    headlineBoxText,
    broadcastSubline,
    syntheticMediaNotice,
    taxNotice,
  };
}

/**
 * Enforces the IRS 26 U.S.C. § 501(c)(3) "Johnson Amendment" Firewall:
 * A 501(c)(3) church, charity, or cultural institution can NEVER co-host a partisan
 * candidate drive or share supporter lists with a 527 candidate committee.
 */
export function validateCivicCampaignCoalitionFirewall(
  primaryTaxClass: ElevateCampaignTaxClassification,
  partnerTaxClasses: ElevateCampaignTaxClassification[],
  firewallActive: boolean = true
): {
  allowed: boolean;
  blockedCount: number;
  reason: string;
} {
  if (!firewallActive) {
    return {
      allowed: true,
      blockedCount: 0,
      reason: 'Coalition firewall check bypassed by administrator.',
    };
  }

  const involves501c3 =
    primaryTaxClass === '501C3_PUBLIC_CHARITY' ||
    partnerTaxClasses.includes('501C3_PUBLIC_CHARITY');
  const involvesPartisan527 =
    primaryTaxClass === '527_CANDIDATE_COMMITTEE' ||
    partnerTaxClasses.includes('527_CANDIDATE_COMMITTEE');

  if (involves501c3 && involvesPartisan527) {
    const blockedCount = partnerTaxClasses.filter(
      t =>
        (primaryTaxClass === '527_CANDIDATE_COMMITTEE' && t === '501C3_PUBLIC_CHARITY') ||
        (primaryTaxClass === '501C3_PUBLIC_CHARITY' && t === '527_CANDIDATE_COMMITTEE')
    ).length;

    return {
      allowed: false,
      blockedCount: Math.max(1, blockedCount),
      reason:
        'IRS 26 U.S.C. § 501(c)(3) Johnson Amendment Firewall: A 501(c)(3) church, charity, or cultural institution cannot co-host a partisan candidate campaign drive or share member rosters with a 527 candidate committee.',
    };
  }

  return {
    allowed: true,
    blockedCount: 0,
    reason:
      'Coalition tax-status check passed: no prohibited 501(c)(3) ↔ 527 partisan co-hosting or list commingling detected.',
  };
}

/**
 * Enforces 18 U.S.C. § 597 Anti-Vote-Buying Guard:
 * Complete-to-Unlock rewards (Chora stems, Lorea books, Taleo passes, Plajah Points)
 * are legally permitted ONLY on volunteer labor shifts (canvassing, phonebanking, hosting),
 * and strictly blocked on voting, voter registration, or ballot return actions.
 */
export function validateCivicCampaignRewardGuard(
  actionType: 'VOLUNTEER_LABOR_SHIFT' | 'VOTER_REGISTRATION' | 'VOTE_PLEDGE' | 'BALLOT_RETURN',
  hasRewardUnlock: boolean,
  guardActive: boolean = true
): {
  allowed: boolean;
  reason: string;
} {
  if (!hasRewardUnlock || !guardActive) {
    return {
      allowed: true,
      reason: 'No financial or media inducement attached to protected voting activity.',
    };
  }

  if (actionType !== 'VOLUNTEER_LABOR_SHIFT') {
    return {
      allowed: false,
      reason:
        '18 U.S.C. § 597 Anti-Vote-Buying Guardrail: Media unlocks, Plajah Points, or material rewards cannot be conditioned on registering to vote, pledging to vote, or casting a ballot. Rewards are restricted strictly to verified volunteer labor shifts (canvassing, phonebanking, or event hosting).',
    };
  }

  return {
    allowed: true,
    reason:
      'Compliant volunteer labor recognition: Complete-to-Unlock rewards are permitted for verified canvassing, phonebank, or event-hosting volunteer shifts.',
  };
}

/**
 * Validates and records a grassroots campaign contribution under FEC 11 CFR § 104.7 & state/local
 * campaign finance rules:
 *  - Requires donor full legal name, physical street address (no P.O. Box), occupation, and employer
 *  - Requires all 5 statutory eligibility attestations
 *  - Enforces per-donor aggregate election-cycle limit
 *  - Issues a non-tax-deductible compliance receipt
 */
export function validateAndRecordCampaignContribution(
  config: ElevateCivicCampaignComplianceConfig,
  existingContributions: ElevateCampaignContributionRecord[],
  draft: Omit<
    ElevateCampaignContributionRecord,
    'id' | 'aggregateCycleToDateUsd' | 'receiptNotice' | 'createdAt'
  >,
  now: number = Date.now()
): {
  ok: boolean;
  errors: string[];
  record?: ElevateCampaignContributionRecord;
  updatedContributions: ElevateCampaignContributionRecord[];
} {
  const errors: string[] = [];

  const fullName = (draft.donorFullName || '').trim();
  const email = (draft.donorEmail || '').trim().toLowerCase();
  const street = (draft.streetAddress || '').trim();
  const city = (draft.city || '').trim();
  const state = (draft.state || '').trim();
  const zip = (draft.postalCode || '').trim();
  const occupation = (draft.occupation || '').trim();
  const employer = (draft.employer || '').trim();
  const amount = Number(draft.amountUsd || 0);

  if (!fullName || fullName.split(/\s+/).length < 2) {
    errors.push('Full legal first and last name is required for campaign finance disclosure.');
  }
  if (!street || !city || !state || !zip) {
    errors.push('Complete physical residential street address, city, state, and ZIP code are required.');
  } else if (/\bp\.?\s*o\.?\s*box\b/i.test(street)) {
    errors.push('Physical residential street address is required (P.O. Boxes are not permitted under FEC / local disclosure rules).');
  }
  if (!occupation) {
    errors.push('Occupation is required under 11 CFR § 104.7 Best-Efforts disclosure (use "Retired", "Student", or "Not Employed" if applicable).');
  }
  if (!employer) {
    errors.push('Employer is required under 11 CFR § 104.7 Best-Efforts disclosure (use "Self-Employed" or "None" if applicable).');
  }
  if (!(amount > 0)) {
    errors.push('Contribution amount must be greater than $0.');
  }

  const att = draft.attestation;
  if (
    !att?.isUsCitizenOrPermanentResident ||
    !att?.isPersonalFunds ||
    !att?.isNotFederalOrMunicipalContractor ||
    !att?.isPersonalCardNotCorporate ||
    !att?.isAtLeast18
  ) {
    errors.push('All 5 statutory donor eligibility attestations (U.S. citizen/permanent resident, personal funds, non-contractor, personal card, 18+) must be confirmed.');
  }

  const priorDonorTotal = existingContributions
    .filter(
      c =>
        c.electionCycle === draft.electionCycle &&
        ((email && c.donorEmail.toLowerCase() === email) ||
          c.donorFullName.trim().toLowerCase() === fullName.toLowerCase())
    )
    .reduce((sum, c) => sum + c.amountUsd, 0);

  const aggregateCycleToDateUsd = priorDonorTotal + amount;
  if (aggregateCycleToDateUsd > config.perDonorElectionLimitUsd) {
    errors.push(
      `Contribution exceeds the $${config.perDonorElectionLimitUsd.toLocaleString()} per-donor aggregate limit for ${config.electionCycleLabel} (prior cycle total: $${priorDonorTotal.toLocaleString()}, attempted total: $${aggregateCycleToDateUsd.toLocaleString()}).`
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      updatedContributions: existingContributions,
    };
  }

  const disclaimer = buildCampaignDisclaimerBox(config);
  const record: ElevateCampaignContributionRecord = {
    id: `${draft.orgId}_contrib_${now}`,
    orgId: draft.orgId,
    donorFullName: fullName,
    donorEmail: email,
    streetAddress: street,
    city,
    state: state.toUpperCase(),
    postalCode: zip,
    occupation,
    employer,
    amountUsd: amount,
    aggregateCycleToDateUsd,
    electionCycle: draft.electionCycle || config.electionCycleLabel,
    attestation: { ...draft.attestation },
    receiptNotice: `${disclaimer.taxNotice} ${disclaimer.headlineBoxText}`,
    createdAt: now,
  };

  return {
    ok: true,
    errors: [],
    record,
    updatedContributions: [record, ...existingContributions],
  };
}

/**
 * Exports an itemized FEC Form 3 / Municipal Campaign Treasurer compliance CSV
 * containing donor occupation, employer, physical address, aggregate election-cycle totals,
 * and 5-point eligibility attestation audit flags.
 */
export function exportCampaignFinanceComplianceCsv(
  config: ElevateCivicCampaignComplianceConfig,
  contributions: ElevateCampaignContributionRecord[]
): string {
  const header = [
    'ContributionID',
    'CommitteeLegalName',
    'CommitteeRegistrationID',
    'Jurisdiction',
    'ElectionCycle',
    'DonorFullName',
    'DonorEmail',
    'StreetAddress',
    'City',
    'State',
    'PostalCode',
    'Occupation',
    'Employer',
    'AmountUSD',
    'AggregateCycleToDateUSD',
    'ItemizedRequired',
    'USCitizenOrPR',
    'PersonalFunds',
    'NotGovernmentContractor',
    'PersonalCardNotCorporate',
    'AtLeast18',
    'TimestampISO',
  ].join(',');

  const rows: string[] = [header];
  const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;

  contributions.forEach(c => {
    const itemized = c.aggregateCycleToDateUsd >= config.itemizationThresholdUsd ? 'YES' : 'NO';
    rows.push(
      [
        c.id,
        esc(config.committeeLegalName),
        esc(config.committeeRegistrationId || ''),
        config.jurisdiction,
        esc(c.electionCycle),
        esc(c.donorFullName),
        esc(c.donorEmail),
        esc(c.streetAddress),
        esc(c.city),
        esc(c.state),
        esc(c.postalCode),
        esc(c.occupation),
        esc(c.employer),
        c.amountUsd.toFixed(2),
        c.aggregateCycleToDateUsd.toFixed(2),
        itemized,
        c.attestation.isUsCitizenOrPermanentResident ? 'TRUE' : 'FALSE',
        c.attestation.isPersonalFunds ? 'TRUE' : 'FALSE',
        c.attestation.isNotFederalOrMunicipalContractor ? 'TRUE' : 'FALSE',
        c.attestation.isPersonalCardNotCorporate ? 'TRUE' : 'FALSE',
        c.attestation.isAtLeast18 ? 'TRUE' : 'FALSE',
        new Date(c.createdAt).toISOString(),
      ].join(',')
    );
  });

  return rows.join('\n');
}

