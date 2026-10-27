// components/elevate/ChurchMemberHub.tsx
// Plajah Elevate — Church member home.
// Truth rule: only the demo church (isDemoOrg) shows sample people, households, briefs, stats and
// promo copy; a real church shows its own data (ministries the member is actually in, its own service
// times) or a quiet empty state. Tradition rule: devotional/service wording comes from churchVocabulary.
// Sections: live stream viewer · today's reading · my ministries · devotional & Bible in a year ·
// service recaps & lessons · music, hymns & (tradition-gated) prayers · sacred text plates ·
// household & giving statements.

import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  BookOpen,
  Music,
  ScrollText,
  Users,
  FileText,
  Calendar,
  CheckCircle2,
  MapPin,
  Navigation,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Printer,
  ShieldCheck,
  Flame,
  GraduationCap,
  HeartHandshake,
  Clock,
  Maximize2,
  X,
  Megaphone,
} from 'lucide-react';
import type { Organization, OrgMembership, ChmsTaxStatementScope } from '../../types';
import type { ScriptureRef } from '../../services/scriptureRef';
import RelloChurchViewer from './RelloChurchViewer';
import {
  SANCTUARY_DAILY_DEVOTIONALS,
  getDayOfYear,
  getBibleInAYearDay,
  getCompletedBibleYearDays,
  toggleBibleYearDayCompletion,
  getDevotionalReflectionNote,
  saveDevotionalReflectionNote,
  evaluateSanctuaryAutoEngage,
} from '../../services/churchDevotionalService';
import {
  PUBLIC_DOMAIN_HYMNS,
  PUBLIC_DOMAIN_GOSPEL_SONGS,
  CATHOLIC_AND_ORTHODOX_PRAYERS,
  openHymnOrPrayerInLorea,
} from '../../data/sacredHymnsAndPrayers';
import { ChurchMusicDepartmentHub } from './ChurchMusicDepartmentHub';
import {
  LECTIO_COUNCIL_PLATES,
  openCouncilPlateInLorea,
  getActiveLectioCouncilPlateId,
  setActiveLectioCouncilPlateId,
  type ArtCouncilLens,
} from '../../services/lectioNonScriptureCouncil';
import { CouncilPlatePreviewCard } from '../scripture/LectioCouncilPlatesModal';
import {
  getDemoHouseholdKinshipGraph,
  getLocalExtendedKinshipOptIn,
  setLocalExtendedKinshipOptIn,
} from '../../services/chmsKinshipAndStatements';
import { money, openPrintWindow, statementsHtml, yearRange } from '../../services/chmsFinanceReports';
import ChurchEducation from '../church/ChurchEducation';
import LectioReader from '../scripture/LectioReader';
import VespersRecap from '../scripture/VespersRecap';
import { sessionIdFor } from '../../services/kairosService';
import ElevateMobilizeHub from './ElevateMobilizeHub';
import MyOrgTasksAndDepartments from './MyOrgTasksAndDepartments';
import { EV, EvLabel, EvLectioSheet } from './vellum';
import { elevateCan } from '../../services/elevateRoles';
import { useFaithContentScope } from '../../hooks/useFaithContentScope';
import {
  isDemoOrg,
  churchVocabulary,
  churchTradition,
  isLiturgical,
  traditionAllows,
  type ChurchVocabulary,
} from '../../services/elevateTruth';

/** Devotional hour labels follow the church's tradition (the library itself is generic). */
function devotionalHourLabel(
  hour: string,
  vocab: ChurchVocabulary,
  liturgical: boolean
): string {
  if (hour.startsWith('LAUDS')) return vocab.morningPrayer;
  if (hour.startsWith('VESPERS')) return vocab.eveningPrayer;
  return liturgical ? 'Sext · Midday prayer' : 'Midday pause';
}

const prettyRole = (role?: string) =>
  role ? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ') : '';

type HubStudioSection =
  | 'SANCTUARY_STUDIO'
  | 'MOBILIZE_AND_SHIFTS'
  | 'DEVOTIONAL_AND_BIBLE_365'
  | 'RECENT_LESSONS_AND_VESPERS'
  | 'HYMNS_PRAYERS_AND_SCORES'
  | 'COUNCIL_12_PLATES'
  | 'FAMILY_CRM_AND_TAX_STATEMENTS';

interface ChurchMemberHubProps {
  org: Organization;
  membership?: OrgMembership | null;
  user?: any;
  onOpenGive?: () => void;
  onOpenMinistry?: (ministryId: string) => void;
}

function getStudioNavItems(orgType: Organization['orgType'] | undefined, vocab: ChurchVocabulary): Array<{
  id: HubStudioSection;
  label: string;
  badge?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> {
  if (orgType === 'CULTURAL') {
    return [
      { id: 'SANCTUARY_STUDIO', label: 'Institution Hub & Live TV', badge: 'LIVE', icon: Sparkles },
      { id: 'MOBILIZE_AND_SHIFTS', label: 'Docent Shifts, Spokes & Impact', badge: 'SHIFTS', icon: Calendar },
      { id: 'DEVOTIONAL_AND_BIBLE_365', label: 'Daily Reflection & Reading 365', badge: 'DAY 289', icon: Flame },
      { id: 'RECENT_LESSONS_AND_VESPERS', label: 'Lectures & Exhibition Briefs', icon: GraduationCap },
      { id: 'HYMNS_PRAYERS_AND_SCORES', label: 'Repertoire, Scores & Archives', badge: 'LOREA', icon: Music },
      { id: 'COUNCIL_12_PLATES', label: '12 Heritage Text Plates', badge: 'COUNCIL', icon: ScrollText },
      { id: 'FAMILY_CRM_AND_TAX_STATEMENTS', label: 'Household & Tax Receipts', icon: Users },
    ];
  }
  if (orgType === 'NONPROFIT') {
    return [
      { id: 'SANCTUARY_STUDIO', label: 'Mission Hub & Live TV', badge: 'LIVE', icon: Sparkles },
      { id: 'MOBILIZE_AND_SHIFTS', label: 'Action, Shifts & Petitions', badge: 'ACTION', icon: Calendar },
      { id: 'DEVOTIONAL_AND_BIBLE_365', label: 'Daily Mission & Reading 365', badge: 'DAY 289', icon: Flame },
      { id: 'RECENT_LESSONS_AND_VESPERS', label: 'Trainings & Field Briefs', icon: GraduationCap },
      { id: 'HYMNS_PRAYERS_AND_SCORES', label: 'Anthems, Media & Stories', badge: 'LOREA', icon: Music },
      { id: 'COUNCIL_12_PLATES', label: '12 Charter & Wisdom Plates', badge: 'COUNCIL', icon: ScrollText },
      { id: 'FAMILY_CRM_AND_TAX_STATEMENTS', label: 'Household & Tax Receipts', icon: Users },
    ];
  }
  return [
    { id: 'SANCTUARY_STUDIO', label: 'Home', icon: Sparkles },
    { id: 'MOBILIZE_AND_SHIFTS', label: 'Serve & shifts', icon: Calendar },
    { id: 'DEVOTIONAL_AND_BIBLE_365', label: `${vocab.dailyDevotional} · Bible in a year`, icon: Flame },
    { id: 'RECENT_LESSONS_AND_VESPERS', label: `${vocab.serviceRecap}s & lessons`, icon: GraduationCap },
    { id: 'HYMNS_PRAYERS_AND_SCORES', label: vocab.prayersCollection, icon: Music },
    { id: 'COUNCIL_12_PLATES', label: 'Sacred text plates', icon: ScrollText },
    { id: 'FAMILY_CRM_AND_TAX_STATEMENTS', label: 'Household & giving statements', icon: Users },
  ];
}

// A member's own gifts + statement PDF (reads only rows linked to their uid — Firestore rules enforce it).
const MyGivingPanel = lazy(() => import('./chms/finance/MyGivingPanel'));

export const ChurchMemberHub: React.FC<ChurchMemberHubProps> = ({
  org,
  membership,
  user,
  onOpenGive,
  onOpenMinistry,
}) => {
  const demo = isDemoOrg(org);
  // Editing classes and music is for staff with content rights (the demo tour stays editable).
  const canEditContent = demo || elevateCan(membership, org, 'MANAGE_CONTENT');
  const vocab = useMemo(() => churchVocabulary(org), [org.denomination, org.category]);
  const tradition = churchTradition(org);
  const liturgical = isLiturgical(tradition);
  /** Demo keeps its showcase copy; a real church gets plain member-facing wording. */
  const t = (demoText: string, realText: string) => (demo ? demoText : realText);

  const [section, setSection] = useState<HubStudioSection>('SANCTUARY_STUDIO');
  const studioNavItems = useMemo(() => getStudioNavItems(org.orgType, vocab), [org.orgType, vocab]);

  // Tailored to the church's tradition by default; a member can choose to see every tradition (saved on their profile).
  const [faithScope, setFaithScope] = useFaithContentScope(user?.uid);
  const allTraditions = faithScope === 'ALL';
  const hymns = useMemo(
    () => [...PUBLIC_DOMAIN_HYMNS, ...PUBLIC_DOMAIN_GOSPEL_SONGS].filter(h => traditionAllows(h.tradition, tradition, faithScope)),
    [tradition, faithScope],
  );

  // Traditional prayers only for liturgical churches that use them, filtered to their own tradition.
  const traditionalPrayers = useMemo(() => {
    if (allTraditions) return CATHOLIC_AND_ORTHODOX_PRAYERS;
    if (!vocab.showTraditionalPrayers) return [];
    if (tradition === 'CATHOLIC')
      return CATHOLIC_AND_ORTHODOX_PRAYERS.filter(p => p.tradition === 'CATHOLIC' || p.tradition === 'PATRISTIC');
    if (tradition === 'ORTHODOX')
      return CATHOLIC_AND_ORTHODOX_PRAYERS.filter(p => p.tradition === 'EASTERN_ORTHODOX' || p.tradition === 'PATRISTIC');
    return CATHOLIC_AND_ORTHODOX_PRAYERS;
  }, [vocab.showTraditionalPrayers, tradition, allTraditions]);
  const traditionalPrayersTitle = allTraditions
    ? 'Prayers from every tradition · original language & English'
    : tradition === 'CATHOLIC'
      ? 'Catholic prayers · original language & English'
      : tradition === 'ORTHODOX'
      ? 'Orthodox prayers · original language & English'
      : 'Traditional prayers · original language & English';

  // Schedule + GPS presence. The presence engine uses a showcase campus anchor, so it only drives the
  // demo church; a real church shows its own service times instead of an invented "in the sanctuary" state.
  const [simulateInSanctuary, setSimulateInSanctuary] = useState<boolean>(demo);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [fullLectioRef, setFullLectioRef] = useState<ScriptureRef | null>(null);
  const [vespersOpen, setVespersOpen] = useState<boolean>(false);

  useEffect(() => {
    if (demo && typeof navigator !== 'undefined' && navigator.geolocation && !simulateInSanctuary) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, [simulateInSanctuary, demo]);

  const autoEngageStatus = useMemo(
    () => evaluateSanctuaryAutoEngage(org, { userCoords, simulateInSanctuary }),
    [org, userCoords, simulateInSanctuary]
  );
  const inServiceNow = demo && autoEngageStatus.autoEngaged;
  const nextServiceLabel = (org.serviceTimes || [])
    .map(st => `${st.label || vocab.mainService} · ${st.day} ${st.time}`)
    .join('  ·  ');

  // Devotional & 365-Day Bible in a Year state
  const todayDayNum = useMemo(() => getDayOfYear(), []);
  const [selectedDayNum, setSelectedDayNum] = useState<number>(todayDayNum);
  const [completedDays, setCompletedDays] = useState<number[]>(() =>
    getCompletedBibleYearDays(org.id)
  );
  const [selectedDevoId, setSelectedDevoId] = useState<string>(SANCTUARY_DAILY_DEVOTIONALS[0].id);
  const activeDevo = useMemo(
    () =>
      SANCTUARY_DAILY_DEVOTIONALS.find(d => d.id === selectedDevoId) ??
      SANCTUARY_DAILY_DEVOTIONALS[0],
    [selectedDevoId]
  );
  const [devoNote, setDevoNote] = useState<string>(() =>
    getDevotionalReflectionNote(SANCTUARY_DAILY_DEVOTIONALS[0].id)
  );

  useEffect(() => {
    setDevoNote(getDevotionalReflectionNote(activeDevo.id));
  }, [activeDevo.id]);

  const activeBibleYearDay = useMemo(
    () => getBibleInAYearDay(selectedDayNum),
    [selectedDayNum]
  );

  // 12 Art Council Sacred Text Plates state
  const [lensFilter, setLensFilter] = useState<'ALL' | ArtCouncilLens>('ALL');
  const [activePlateId, setActivePlateId] = useState<string>(() =>
    getActiveLectioCouncilPlateId()
  );

  // Family Kinship CRM & Tax Statement Scope state
  const kinshipDemo = useMemo(() => getDemoHouseholdKinshipGraph(org.id), [org.id]);
  const [allowExtendedKinship, setAllowExtendedKinship] = useState<boolean>(() =>
    getLocalExtendedKinshipOptIn(user?.uid || 'self')
  );
  const [taxScope, setTaxScope] = useState<ChmsTaxStatementScope>('JOINT_HOUSEHOLD');

  const handleToggleExtendedPrivacy = (next: boolean) => {
    setAllowExtendedKinship(next);
    setLocalExtendedKinshipOptIn(user?.uid || 'self', next);
  };

  const handlePrintSampleTaxStatement = () => {
    const yr = new Date().getFullYear() - 1;
    const range = yearRange(yr);
    const totalHousehold = kinshipDemo.nuclearMembers.reduce((a, m) => a + m.ytdGiving, 0);
    const sampleStmt = {
      key: `hh_${org.id}`,
      name:
        taxScope === 'INDIVIDUAL'
          ? kinshipDemo.nuclearMembers[0].name
          : 'Marcus & Elena Sterling (The Sterling Household)',
      address: {
        line1: '742 Sanctuary Way, Suite 4B',
        city: 'Atlanta',
        region: 'GA',
        postal: '30308',
      },
      personIds: kinshipDemo.nuclearMembers.map(m => m.id),
      householdId: kinshipDemo.householdId,
      email: user?.email || 'sterling.household@plajah.org',
      linkedUids: user?.uid ? [user.uid] : [],
      lines: [
        {
          date: `${yr}-03-15`,
          fund: 'General Sanctuary Tithe',
          amount: 4200,
          method: 'ACH',
          memo: 'Marcus Sterling (HEAD)',
        },
        {
          date: `${yr}-06-22`,
          fund: 'Sacred Music & Organ Endowment',
          amount: 2800,
          method: 'ONLINE',
          memo: 'Elena Sterling (SPOUSE)',
        },
        {
          date: `${yr}-10-08`,
          fund: 'Global Missions & Mercy Clinic',
          amount: 4250,
          method: 'ACH',
          memo: 'Marcus & Elena Sterling (JOINT)',
        },
        ...(taxScope === 'JOINT_HOUSEHOLD' || taxScope === 'FAMILY_PACKET'
          ? [
              {
                date: `${yr}-11-19`,
                fund: 'Youth Missions Offering',
                amount: 230,
                method: 'CARD',
                memo: 'Micah & Noelle Sterling (DEPENDENT CHILDREN)',
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
        'Sacred Music & Organ Endowment': 2800,
        'Global Missions & Mercy Clinic': 4250,
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
        address: org.location?.address || 'Atlanta, GA',
        faith: true,
      })
    );
  };

  // Previous Service Review Briefs (Vespers + ARIA recaps)
  const previousServiceBriefs = useMemo(
    () => [
      {
        id: 'brief-1',
        dateLabel: `Last Sunday · 11:00 AM ${vocab.mainService}`,
        title: 'Beholding the Uncreated Light in Earthen Vessels',
        speaker: 'Pastor Daniel Reyes',
        keyScriptures: [
          { label: '2 Corinthians 4:6', ref: { book: 47, bookName: '2 Corinthians', chapter: 4, verse: 6 } },
          { label: 'Isaiah 6:1-3', ref: { book: 23, bookName: 'Isaiah', chapter: 6, verse: 1 } },
          { label: 'Psalm 27:4', ref: { book: 19, bookName: 'Psalms', chapter: 27, verse: 4 } },
        ],
        ariaBrief:
          'Explored Paul’s theology of illumination in 2 Corinthians 4 alongside the seraphic sanctus of Isaiah 6. You stamped 2 timestamped stream notes and sang “Be Thou My Vision” (Tune: SLANE).',
        pairedHymnId: 'pd-hymn-be-thou-my-vision',
      },
      {
        id: 'brief-2',
        dateLabel: liturgical ? 'Wednesday Vespers · 7:00 PM Lamplighting Office' : 'Wednesday · 7:00 PM Midweek service',
        title: 'The Guarding of the Heart & The Evening Sacrifice',
        speaker: 'Elder Hannah Okafor',
        keyScriptures: [
          { label: 'Psalm 141:2', ref: { book: 19, bookName: 'Psalms', chapter: 141, verse: 2 } },
          { label: 'John 1:4-5', ref: { book: 43, bookName: 'John', chapter: 1, verse: 4 } },
        ],
        ariaBrief:
          'Historical walkthrough of the 3rd-century hymn Phos Hilaron ("O Gladsome Light") and St. Basil the Great’s defense of the evening lamp thanksgiving.',
        pairedHymnId: 'prayer-orthodox-phos-hilaron',
      },
    ],
    [vocab.mainService, liturgical]
  );

  // Assigned Ministries & Departments
  // Real church: only ministries this member actually belongs to (roster ids + held ministry roles).
  const memberMinistryIds = useMemo(() => {
    const ids = new Set<string>(membership?.ministryIds || []);
    (membership?.ministryRoles || []).forEach(r => ids.add(r.ministryId));
    return ids;
  }, [membership?.ministryIds, membership?.ministryRoles]);
  const assignedMinistries = useMemo(() => {
    if (!demo) {
      return (org.ministries || []).filter(m => memberMinistryIds.has(m.id));
    }
    if (org.ministries && org.ministries.length > 0) {
      return org.ministries.slice(0, 4);
    }
    return [
      {
        id: 'min-schola-choir',
        name: 'Cathedral Schola & Sacred Music',
        iconEmoji: '🎼',
        description: 'Choral Eucharist rehearsals, SATB hymnal preparation & organ vespers.',
        meetingTime: 'Thursdays · 7:00 PM · Choir Loft',
      },
      {
        id: 'min-deacon-mercy',
        name: 'Deacon Board & Parish Benevolence',
        iconEmoji: '🕯️',
        description: 'Household visitation, bereavement care, and community benevolence grants.',
        meetingTime: '1st & 3rd Sundays · 1:15 PM · Chapter Room',
      },
      {
        id: 'min-ambo-media',
        name: 'Stage Sanctuary Production & Broadcast Guild',
        iconEmoji: '📡',
        description: 'Live Kairos scripture cues, Reello stream direction & speech ASR operators.',
        meetingTime: 'Sundays · 8:00 AM Call Time · Broadcast Booth',
      },
    ];
  }, [org.ministries, demo, memberMinistryIds]);

  const displayName: string = demo
    ? membership?.displayName || user?.displayName || 'Elena Sterling'
    : membership?.displayName || user?.displayName || '';
  const memberRoleTitle: string = demo
    ? membership?.title || membership?.role || 'Covenant member'
    : membership?.status === 'PENDING'
    ? 'Membership pending'
    : membership?.title || prettyRole(membership?.role);
  const firstName = String(displayName).split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const greetingLine = firstName ? `${greeting}, ${firstName}.` : `Good ${greeting.toLowerCase()}.`;

  return (
    <div className="my-2 space-y-8">
      {/* ── Greeting + in-service presence (schedule + GPS auto-engage drives Lectio follow-along) ── */}
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div className="min-w-0">
          <EvLabel>{memberRoleTitle ? `${memberRoleTitle} · ` : ''}{org.name}</EvLabel>
          <h1 className="m-0 mt-2 ev-display text-white" style={{ fontSize: 'clamp(2.5rem, 5vw, 3.75rem)' }}>
            {greetingLine}
          </h1>
        </div>
        {demo ? (
          <button
            onClick={() => setSimulateInSanctuary(v => !v)}
            className="ev-btn ev-btn-ghost"
            title={`${autoEngageStatus.activeServiceLabel} · ${autoEngageStatus.coordinatesLabel}`}
          >
            {autoEngageStatus.autoEngaged
              ? <><span className="ev-live-dot" /> In the sanctuary · Verse follows the service</>
              : <><Navigation size={14} className="text-[#A49CB2]" /> Away · Verse on standby</>}
          </button>
        ) : nextServiceLabel ? (
          <div className="flex items-center gap-2 text-[13px] text-[#A49CB2]">
            <Clock size={14} /> {nextServiceLabel}
          </div>
        ) : null}
        {!demo && membership?.status === 'ACTIVE' && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('plajah:open-stage-upload', { detail: { orgId: org.id } }))}
            className="ev-btn ev-btn-ghost"
            title="Send an announcement image, video or backing track to the Stage operator"
          >
            <Megaphone size={14} className="text-[#FF8C00]" /> Send to Stage
          </button>
        )}
      </div>

      {/* ── Member home navigation ── */}
      <nav aria-label="Member home" className="flex gap-6 overflow-x-auto scrollbar-hide border-b" style={{ borderColor: EV.line }}>
        {studioNavItems.map(item => (
          <button key={item.id} onClick={() => setSection(item.id)} className="ev-tab" aria-current={section === item.id ? 'page' : undefined}>
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── MAIN STUDIO BODY ── */}
      <div className="space-y-8">
        {/* PERSISTENT LIVE STREAM & MINISTRY TV CHANNEL CAROUSEL (Always mounted under the tabs so switching tabs never interrupts watching) */}
        <RelloChurchViewer
          org={org}
          inSanctuaryAutoEngaged={inServiceNow}
          onOpenFullLectio={ref => setFullLectioRef(ref)}
          defaultPlayerExpanded={false}
          viewerIsOrgMember={membership?.status === 'ACTIVE'}
        />

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: SANCTUARY STUDIO OVERVIEW
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'SANCTUARY_STUDIO' && (
          <div className="ev-fade space-y-8">
            {/* Verse · today's reading on Vellum. Demo: sample church plan with Sunday's Stage cues in the
                margin. Real church: today's devotional passage only — no invented notes, plan or progress. */}
            {!demo ? (
              <EvLectioSheet
                planLabel={`Verse · ${vocab.dailyDevotional}`}
                reference={activeDevo.scriptureDisplay}
                verses={[{ n: activeDevo.scriptureRef.verse ?? 1, text: activeDevo.scriptureQuote }]}
                onContinue={() => setFullLectioRef(activeDevo.scriptureRef)}
              />
            ) : (
            <EvLectioSheet
              planLabel="Verse · Through John with the church"
              progressLabel="Gospel of John · 38%"
              reference="John 8:12–14"
              verses={[
                { n: 12, text: 'Again, therefore, Jesus spoke to them, saying, “I am the light of the world. He who follows me will not walk in the darkness, but will have the light of life.”', highlight: true },
                { n: 13, text: 'The Pharisees therefore said to him, “You testify about yourself. Your testimony is not valid.”' },
                { n: 14, text: 'Jesus answered them, “Even if I testify about myself, my testimony is true, for I know where I came from, and where I am going…”' },
              ]}
              notes={[
                { src: 'Stage · Sunday 14:20', text: 'Light isn’t a lamp we carry — it’s a Person we follow.' },
                { src: 'Cross-reference', text: 'Isaiah 9:2 — “the people who walked in darkness have seen a great light.”' },
                { src: 'Your note', text: 'Where am I still walking in the dark this week?' },
              ]}
              onContinue={() => setFullLectioRef({ book: 43, bookName: 'John', chapter: 8, verse: 12 })}
              onAddNote={() => setFullLectioRef({ book: 43, bookName: 'John', chapter: 8, verse: 12 })}
              footnote="Day 23 of 60 · 212 of the church read this today"
            />
            )}

            {/* Assigned Departments, Ministry Activities & Quick Actions Grid */}
            <MyOrgTasksAndDepartments
              org={org}
              membership={membership}
              onOpenDepartment={deptId => onOpenMinistry?.(deptId)}
              onOpenEducation={() => setSection('RECENT_LESSONS_AND_VESPERS')}
            />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* My Assigned Departments & Ministry Activities (7 cols) */}
              <div
                className="lg:col-span-7 rounded-3xl p-5 border space-y-4"
                style={{
                  background: 'rgba(24, 20, 31, 0.78)',
                  borderColor: 'rgba(216, 210, 226, 0.18)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E2C27E]">
                      {t('My Covenant Departments & Ministry Roster', 'My ministries')}
                    </div>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      {t('Active Ministry Activities & Upcoming Shifts', 'Where you serve')}
                    </h3>
                  </div>
                  {onOpenGive && (
                    <button
                      onClick={onOpenGive}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-black text-black flex items-center gap-1.5"
                      style={{ background: '#E2C27E' }}
                    >
                      <HeartHandshake size={13} />
                      <span>{t('Sanctuary Giving', 'Give')}</span>
                    </button>
                  )}
                </div>

                {assignedMinistries.length === 0 && (
                  <div className="ev-panel p-6 text-[15px] text-[#A49CB2] space-y-3">
                    <div>You haven&apos;t joined a ministry yet.</div>
                    {(org.ministries || []).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {(org.ministries || []).filter(m => !m.parentId && !m.isInternal).slice(0, 8).map(m => (
                          <button
                            key={m.id}
                            onClick={() => onOpenMinistry?.(m.id)}
                            className="ev-btn ev-btn-ghost"
                            style={{ minHeight: 32, fontSize: 13 }}
                          >
                            {m.iconEmoji ? `${m.iconEmoji} ` : ''}{m.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[13px]">{org.name} hasn&apos;t listed its ministries here yet.</div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {assignedMinistries.map(m => (
                    <div
                      key={m.id}
                      onClick={() => onOpenMinistry?.(m.id)}
                      className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 cursor-pointer transition-all flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-white">
                            {m.iconEmoji ? `${m.iconEmoji} ` : ''}
                            {m.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-[#7A1FC0]/60 text-[#D8D2E2] border border-[#D8D2E2]/25">
                            {t('Active Member', 'Member')}
                          </span>
                        </div>
                        {m.description && (
                          <p className="text-xs text-white/65 mt-1 leading-snug">{m.description}</p>
                        )}
                      </div>
                      {m.meetingTime && (
                        <div className="text-[10px] font-mono text-[#E2C27E] flex items-center gap-1 pt-1 border-t border-white/10">
                          <Clock size={10} />
                          <span>{m.meetingTime}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-white/65">
                    {t(
                      'Multi-shift volunteer scheduling, automatic waitlists, covenants & spoke watch parties:',
                      'Volunteer shifts and ways to serve'
                    )}
                  </span>
                  <button
                    onClick={() => setSection('MOBILIZE_AND_SHIFTS')}
                    className="px-3.5 py-2 rounded-xl text-xs font-black text-white bg-[#7A1FC0] hover:bg-[#7A1FC0] border border-[#E2C27E]/50 flex items-center gap-1.5"
                  >
                    <Calendar size={13} className="text-[#E2C27E]" />
                    <span>{t('Open Shifts, Covenants & Impact Passport →', 'Serve & shifts →')}</span>
                  </button>
                </div>
              </div>

              {/* Today's Devotional & 365-Day Bible Snapshot Card (5 cols) */}
              <div
                className="lg:col-span-5 rounded-3xl p-5 border flex flex-col justify-between gap-4"
                style={{
                  background:
                    'linear-gradient(155deg, rgba(122, 31, 192,0.28) 0%, rgba(16,8,32,0.92) 100%)',
                  borderColor: 'rgba(226, 194, 126, 0.3)',
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E2C27E]">
                      {devotionalHourLabel(activeDevo.liturgicalHour, vocab, liturgical)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-[#E2C27E]/15 text-[#F0D9A6] border border-[#E2C27E]/35">
                      Bible in a Year · Day {todayDayNum} / 365
                    </span>
                  </div>
                  <h3
                    className="text-xl font-bold text-white leading-snug"
                    style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                  >
                    {activeDevo.title}
                  </h3>
                  {demo ? (
                    <blockquote className="p-3 rounded-xl bg-black/40 border-l-2 border-[#E2C27E] text-xs italic text-[#D8D2E2]/90 font-serif">
                      “{activeDevo.scriptureQuote}” —{' '}
                      <b className="not-italic text-[#E2C27E]">{activeDevo.scriptureDisplay}</b>
                    </blockquote>
                  ) : (
                    // The reading sheet above already carries the devotional passage; list today's plan instead.
                    <div className="flex flex-wrap gap-1.5">
                      {getBibleInAYearDay(todayDayNum).passages.map(p => (
                        <button
                          key={p.category}
                          onClick={() => setFullLectioRef(p.ref)}
                          className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-[11px] font-bold text-[#D8D2E2] hover:text-white"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-white/75 leading-relaxed line-clamp-3">
                    {activeDevo.reflectionParagraphs[0]}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => setSection('DEVOTIONAL_AND_BIBLE_365')}
                    className="px-3.5 py-2 rounded-xl text-xs font-black text-black flex items-center gap-1.5"
                    style={{ background: '#E2C27E' }}
                  >
                    <Flame size={13} />
                    <span>{t('Open Devotional & 365-Day Plan', 'Open devotional & reading plan')}</span>
                  </button>
                  <button
                    onClick={() => setSection('COUNCIL_12_PLATES')}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-[#D8D2E2] bg-white/5 hover:bg-white/10 border border-white/15"
                  >
                    {t('12 Sacred Plates →', 'Sacred text plates →')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1B: MOBILIZE, VOLUNTEER SHIFTS, SPOKE HOSTING & IMPACT PASSPORT
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'MOBILIZE_AND_SHIFTS' && (
          <ElevateMobilizeHub
            org={org}
            currentUserId={demo ? user?.uid || 'demo-member-elena' : user?.uid || ''}
            currentUserName={demo ? displayName : displayName || user?.email || 'Member'}
            currentUserEmail={demo ? user?.email || 'elena.sterling@example.org' : user?.email || ''}
            canManage={false}
            initialContext="member"
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: DAILY DEVOTIONAL SYSTEM & 365-DAY READ THE BIBLE IN A YEAR
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'DEVOTIONAL_AND_BIBLE_365' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 6 Cols: Daily Sanctuary Breviary & Devotional Journal */}
            <div
              className="lg:col-span-6 rounded-3xl p-6 border space-y-5"
              style={{
                background: 'rgba(24, 20, 31, 0.85)',
                borderColor: 'rgba(226, 194, 126, 0.3)',
              }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                    {vocab.dailyDevotional}
                  </div>
                  <h3
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                  >
                    {activeDevo.title}
                  </h3>
                </div>
                <div className="flex gap-1.5">
                  {SANCTUARY_DAILY_DEVOTIONALS.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDevoId(d.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        d.id === activeDevo.id
                          ? 'bg-[#E2C27E] text-black border-[#E2C27E]'
                          : 'bg-white/5 text-white/65 border-white/10 hover:text-white'
                      }`}
                    >
                      {devotionalHourLabel(d.liturgicalHour, vocab, liturgical).split(' · ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/45 border border-[#E2C27E]/35 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#E2C27E]">{activeDevo.scriptureDisplay}</span>
                  <button
                    onClick={() => setFullLectioRef(activeDevo.scriptureRef)}
                    className="text-[10.5px] font-bold text-[#D8D2E2] hover:underline flex items-center gap-1"
                  >
                    <BookOpen size={11} />
                    <span>Read Chapter in Verse</span>
                  </button>
                </div>
                <p className="text-sm font-serif italic text-white leading-relaxed">
                  “{activeDevo.scriptureQuote}”
                </p>
              </div>

              <div className="space-y-3 text-xs text-white/85 leading-relaxed">
                {activeDevo.reflectionParagraphs.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-[#7A1FC0]/20 border border-[#D8D2E2]/25 space-y-1">
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#E2C27E]">
                  {liturgical ? 'Collect of the day' : 'Prayer for today'}
                </div>
                <p className="text-xs font-serif italic text-[#D8D2E2] leading-relaxed">
                  {activeDevo.collectPrayer}
                </p>
              </div>

              {/* Personal Devotional Reflection Note */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <label className="text-[10.5px] font-bold uppercase tracking-wider text-[#D8D2E2]/80 block">
                  {vocab.prayerJournal} · saved on this device
                </label>
                <textarea
                  rows={3}
                  value={devoNote}
                  onChange={e => {
                    setDevoNote(e.target.value);
                    saveDevotionalReflectionNote(activeDevo.id, e.target.value);
                  }}
                  placeholder="Write your prayer reflection or response to today’s devotional…"
                  className="w-full rounded-xl bg-black/40 border border-white/15 p-3 text-xs text-white placeholder:text-white/35 outline-none focus:border-[#E2C27E]"
                />
              </div>
            </div>

            {/* Right 6 Cols: 365-Day Read the Bible in a Year Canonical System */}
            <div
              className="lg:col-span-6 rounded-3xl p-6 border space-y-5"
              style={{
                background: 'rgba(24, 20, 31, 0.85)',
                borderColor: 'rgba(216, 210, 226, 0.22)',
              }}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                    365-day reading plan · Old Testament · New Testament · Psalms · Proverbs
                  </div>
                  <h3
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                  >
                    Read the Bible in a Year
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedDayNum(d => Math.max(1, d - 1))}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white"
                    title="Previous Day"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="px-3 py-1 rounded-lg bg-[#7A1FC0]/50 border border-[#D8D2E2]/30 text-xs font-mono font-bold text-white">
                    Day {activeBibleYearDay.dayNumber} / 365 ({activeBibleYearDay.dateLabel})
                  </span>
                  <button
                    onClick={() => setSelectedDayNum(d => Math.min(365, d + 1))}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white"
                    title="Next Day"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Annual Progress Bar */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/80 font-semibold">
                    Theme: <b className="text-[#E2C27E]">{activeBibleYearDay.canonicalTheme}</b>
                  </span>
                  <span className="font-mono text-[#E2C27E] font-bold">
                    {completedDays.length} / 365 Days Completed (
                    {Math.round((completedDays.length / 365) * 100)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(4, (completedDays.length / 365) * 100))}%`,
                      background: 'linear-gradient(90deg, #7A1FC0, #D40055, #E2C27E)',
                    }}
                  />
                </div>
              </div>

              {/* 4 Daily Canonical Passages (OT, NT, Psalms, Proverbs) */}
              <div className="space-y-2.5">
                {activeBibleYearDay.passages.map(p => (
                  <div
                    key={p.category}
                    className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="text-[9.5px] font-extrabold uppercase tracking-widest text-[#E2C27E] block">
                        {p.category.replace('_', ' ')}
                      </span>
                      <span className="text-sm font-bold text-white">{p.label}</span>
                    </div>
                    <button
                      onClick={() => setFullLectioRef(p.ref)}
                      className="px-3 py-1.5 rounded-xl bg-[#E2C27E]/15 hover:bg-[#E2C27E]/25 border border-[#E2C27E]/40 text-[#F0D9A6] text-xs font-bold flex items-center gap-1.5"
                    >
                      <BookOpen size={12} />
                      <span>Read in Verse</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  onClick={() => setSelectedDayNum(todayDayNum)}
                  className="text-xs text-[#D8D2E2]/75 hover:text-white underline"
                >
                  Jump to Today (Day {todayDayNum})
                </button>

                <button
                  onClick={() => {
                    const updated = toggleBibleYearDayCompletion(
                      activeBibleYearDay.dayNumber,
                      org.id
                    );
                    setCompletedDays(updated);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all"
                  style={
                    completedDays.includes(activeBibleYearDay.dayNumber)
                      ? { background: '#10B981', color: '#000' }
                      : { background: '#E2C27E', color: '#000' }
                  }
                >
                  <CheckCircle2 size={14} />
                  <span>
                    {completedDays.includes(activeBibleYearDay.dayNumber)
                      ? `Day ${activeBibleYearDay.dayNumber} Completed`
                      : `Mark Day ${activeBibleYearDay.dayNumber} Complete`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 3: RECENT LESSONS, ARTICLES & VESPERS SERVICE REVIEW BRIEFS
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'RECENT_LESSONS_AND_VESPERS' && (
          <div className="ev-fade space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                  {vocab.serviceRecap}s
                </div>
                <h3
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                >
                  {t('Service Review Briefs, Articles & Recent Lessons', 'Recaps & recent lessons')}
                </h3>
              </div>
              <button
                onClick={() => setVespersOpen(v => !v)}
                className="px-4 py-2 rounded-xl text-xs font-black text-black flex items-center gap-1.5"
                style={{ background: '#E2C27E' }}
              >
                <ScrollText size={13} />
                <span>{vespersOpen ? `Hide ${vocab.serviceRecap}` : `Open live ${vocab.serviceRecap}`}</span>
              </button>
            </div>

            {vespersOpen && (
              <div className="rounded-3xl p-5 bg-black/50 border border-[#E2C27E]/35">
                <VespersRecap
                  recapId={sessionIdFor(org.id)}
                  onBack={() => setVespersOpen(false)}
                />
              </div>
            )}

            {!demo && (
              <div className="ev-panel p-6 text-[15px] text-[#A49CB2]">
                Recaps of {org.name}&apos;s services appear here once they&apos;re published.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(demo ? previousServiceBriefs : []).map(b => (
                <div
                  key={b.id}
                  className="rounded-3xl p-5 border border-[#D8D2E2]/20 bg-[#18141F]/85 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono text-[#E2C27E] uppercase tracking-wider">
                      {b.dateLabel} · {b.speaker}
                    </div>
                    <h4 className="text-lg font-bold text-white">{b.title}</h4>
                    <p className="text-xs text-white/75 leading-relaxed">{b.ariaBrief}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {b.keyScriptures.map(ks => (
                        <button
                          key={ks.label}
                          onClick={() => setFullLectioRef(ks.ref)}
                          className="px-2.5 py-1 rounded-lg bg-[#7A1FC0]/40 border border-[#D8D2E2]/25 text-[10.5px] font-bold text-[#D8D2E2] hover:bg-[#7A1FC0]"
                        >
                          {ks.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Church Education / Recent Lessons */}
            <div className="rounded-3xl p-6 border border-white/10 bg-black/35">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E] mb-3">
                {t(
                  'Christian Education · 7 Default Templated Classrooms, Dedicated Class Chat & Academia Ed-Tech Stack',
                  'Classes & Christian education'
                )}
              </div>
              <ChurchEducation
                church={org}
                canEdit={canEditContent || assignedMinistries.some(m => /christian\s*ed|education|sunday\s*school|discipleship/i.test(m.name))}
              />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 4: MUSIC DEPARTMENT (CHORA SCRATCHPAD, SETLISTS, GLOBAL SCORES) + HYMNS, GOSPEL & PRAYERS
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'HYMNS_PRAYERS_AND_SCORES' && (
          <div className="ev-fade space-y-8">
            <ChurchMusicDepartmentHub church={org} canEdit={canEditContent} />

            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                {vocab.prayersCollection}
              </div>
              <h3
                className="text-2xl font-bold text-white"
                style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
              >
                Public-domain hymns &amp; gospel songs, with history and scores
              </h3>
              <label className="mt-3 inline-flex items-center gap-2.5 text-[13px] text-[#A49CB2] cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#7A1FC0]"
                  checked={allTraditions}
                  onChange={e => setFaithScope(e.target.checked ? 'ALL' : 'ORG')}
                />
                Show hymns &amp; prayers from every tradition
                <span className="text-[#A49CB2]/70">· {allTraditions ? 'saved to your profile' : `tailored to ${org.name}`}</span>
              </label>
            </div>

            {/* Public Domain Hymns & Gospel Songs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {hymns.map(hymn => (
                <div
                  key={hymn.id}
                  className="rounded-3xl p-5 border border-[#E2C27E]/30 bg-[#18141F]/90 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#E2C27E]">
                      <span>{hymn.year}</span>
                      {hymn.score && (
                        <span>
                          Tune: {hymn.score.tuneName} · {hymn.score.defaultKey} ({hymn.score.timeSignature})
                        </span>
                      )}
                    </div>
                    <h4 className="text-lg font-bold text-white">{hymn.title}</h4>
                    <div className="text-xs text-[#D8D2E2]/75">{hymn.author}</div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-serif text-white/90 whitespace-pre-line">
                      {hymn.stanzas[0]}
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#E2C27E]">
                        Provenance · {hymn.historyTitle}
                      </div>
                      <p className="text-[11px] text-white/75 leading-relaxed line-clamp-3">
                        {hymn.historyEssay}
                      </p>
                    </div>

                    {hymn.score && (
                      <div className="p-2.5 rounded-xl bg-[#E2C27E]/10 border border-[#E2C27E]/30 text-[10.5px] font-mono text-[#F0D9A6] space-y-1">
                        <div>
                          <b>Accompaniment Score:</b> {hymn.score.arrangement} · Meter {hymn.score.meter} ·{' '}
                          {hymn.score.tempoMarking}
                        </div>
                        <div>
                          <b>Transposition Keys:</b> {hymn.score.availableKeys.join(' · ')} |{' '}
                          <b>Cadence:</b> {hymn.score.chordProgression.join(' → ')}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="text-[10px] text-white/50">
                      Scripture: {hymn.scriptureRefs.slice(0, 2).join(' · ')}
                    </span>
                    <button
                      onClick={() => openHymnOrPrayerInLorea(hymn)}
                      className="px-3.5 py-2 rounded-xl text-xs font-black text-black flex items-center gap-1.5 hover:brightness-110"
                      style={{ background: '#E2C27E' }}
                    >
                      <BookOpen size={13} />
                      <span>Open Hymn, History & Score in Lorea</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Traditional prayers — only for Catholic / Orthodox churches, filtered to their tradition */}
            {traditionalPrayers.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#D8D2E2]">
                {traditionalPrayersTitle}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {traditionalPrayers.map(prayer => (
                  <div
                    key={prayer.id}
                    className="rounded-3xl p-5 border border-[#D8D2E2]/25 bg-[#18141F]/90 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#D8D2E2]">
                        <span>{prayer.tradition}</span>
                        <span>{prayer.year}</span>
                      </div>
                      <h4 className="text-lg font-bold text-white">
                        {prayer.title}{' '}
                        {prayer.originalTitle ? (
                          <span className="text-white/55 font-normal">({prayer.originalTitle})</span>
                        ) : null}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-serif">
                        {prayer.originalStanzas?.[0] && (
                          <div className="italic text-[#D8D2E2]/85 border-b sm:border-b-0 sm:border-r border-white/10 pb-2 sm:pb-0 sm:pr-2">
                            <span className="text-[9px] font-mono uppercase not-italic text-[#E2C27E] block mb-0.5">
                              {prayer.originalLanguage || 'Ancient'}
                            </span>
                            {prayer.originalStanzas[0]}
                          </div>
                        )}
                        <div className="text-white/90">
                          <span className="text-[9px] font-mono uppercase text-[#E2C27E] block mb-0.5">
                            English Liturgical
                          </span>
                          {prayer.stanzas[0]}
                        </div>
                      </div>
                      <p className="text-[11px] text-white/75 leading-relaxed line-clamp-3">
                        {prayer.historyEssay}
                      </p>
                    </div>
                    <div className="flex justify-end pt-2 border-t border-white/10">
                      <button
                        onClick={() => openHymnOrPrayerInLorea(prayer)}
                        className="px-3.5 py-2 rounded-xl text-xs font-black text-black flex items-center gap-1.5"
                        style={{ background: '#D8D2E2' }}
                      >
                        <BookOpen size={13} />
                        <span>Open Prayer & History in Lorea</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 5: 12 ART COUNCIL NON-SCRIPTURE SACRED TEXT PLATES (LECTIO + LOREA)
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'COUNCIL_12_PLATES' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                  {t('Plajah Art Council · 6 Creative Lenses × 12 Distinct Architectural Geometries', 'Sacred text plates')}
                </div>
                <h3
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                >
                  {t(
                    '12 Sacred Text Plates for Non-Scripture Religious Texts (Verse & Lorea)',
                    'Page designs for prayers, creeds and other sacred texts'
                  )}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    ['ALL', 'All 12 Plates'],
                    ['CLASSICAL', 'Classical'],
                    ['RADICAL_MINIMAL', 'Radical Minimal'],
                    ['REBEL', 'Rebel'],
                    ['WORLD_ECLECTIC', 'World Eclectic'],
                    ['FUTURIST', 'Futurist'],
                    ['BAROQUE', 'Baroque'],
                  ] as const
                ).map(([id, lbl]) => (
                  <button
                    key={id}
                    onClick={() => setLensFilter(id)}
                    className={`px-3 py-1 rounded-full text-[10.5px] font-bold transition-all ${
                      lensFilter === id
                        ? 'bg-[#E2C27E] text-black'
                        : 'bg-white/5 text-white/70 border border-white/10 hover:text-white'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {LECTIO_COUNCIL_PLATES.filter(
                p => lensFilter === 'ALL' || p.lens === lensFilter
              ).map(plate => (
                <CouncilPlatePreviewCard
                  key={plate.id}
                  plate={plate}
                  isSelected={activePlateId === plate.id}
                  onSelect={pl => {
                    setActiveLectioCouncilPlateId(pl.id);
                    setActivePlateId(pl.id);
                  }}
                  onOpenLorea={openCouncilPlateInLorea}
                />
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 6: SMART HOUSEHOLD & EXTENDED KINSHIP CRM + 4-SCOPE TAX STATEMENTS
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'FAMILY_CRM_AND_TAX_STATEMENTS' && !demo && (
          <div className="ev-panel p-6 text-[15px] text-[#A49CB2] space-y-4">
            {user?.uid ? (
              <Suspense fallback={<div>Loading your giving…</div>}>
                <MyGivingPanel orgId={org.id} uid={user.uid} />
              </Suspense>
            ) : (
              <div>Sign in to see your giving and download your statements.</div>
            )}
            {onOpenGive && (
              <button onClick={onOpenGive} className="ev-btn ev-btn-ghost" style={{ minHeight: 36, fontSize: 13 }}>
                <HeartHandshake size={14} /> Give
              </button>
            )}
          </div>
        )}
        {section === 'FAMILY_CRM_AND_TAX_STATEMENTS' && demo && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Nuclear Household (Head, Spouse, Children) + Extended Family Kinship Graph */}
              <div
                className="lg:col-span-7 rounded-3xl p-6 border space-y-6"
                style={{
                  background: 'rgba(24, 20, 31, 0.85)',
                  borderColor: 'rgba(216, 210, 226, 0.22)',
                }}
              >
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                    Smart Church Kinship CRM · Nuclear Household & Extended Relatives
                  </div>
                  <h3
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                  >
                    {kinshipDemo.householdName} — Family & Kinship Graph
                  </h3>
                  <p className="text-xs text-[#D8D2E2]/70 mt-0.5">
                    {kinshipDemo.filingStatus} · {kinshipDemo.address}
                  </p>
                </div>

                {/* Nuclear Family Members (Head of Household, Spouse, Dependent Children) */}
                <div className="space-y-2.5">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-[#E2C27E]">
                    Nuclear Household Roles (Head of Household · Spouse · Dependent Children)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {kinshipDemo.nuclearMembers.map(m => (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-white">{m.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              m.role === 'HEAD'
                                ? 'bg-[#E2C27E] text-black'
                                : m.role === 'SPOUSE'
                                ? 'bg-[#D40055] text-white'
                                : 'bg-[#7A1FC0] text-[#D8D2E2]'
                            }`}
                          >
                            {m.roleLabel}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-white/65">{m.maritalStatus}</div>
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
                </div>

                {/* Extended Family Kinship Graph + Per-Member Privacy Opt-Out Control */}
                <div className="p-4 rounded-2xl bg-black/40 border border-[#D8D2E2]/20 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        {allowExtendedKinship ? (
                          <Unlock size={14} className="text-emerald-400" />
                        ) : (
                          <Lock size={14} className="text-amber-400" />
                        )}
                        <span>
                          Extended Family Kinship (Brothers, Sisters, Aunts, Uncles, Grandparents)
                        </span>
                      </div>
                      <p className="text-[11px] text-white/65 mt-0.5 max-w-xl">
                        Helps church leadership understand extended family ties across households for
                        pastoral care, bereavement, and youth pickup—while letting any family member
                        opt out of extended kinship visibility at any time.
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleExtendedPrivacy(!allowExtendedKinship)}
                      className={`px-3 py-1.5 rounded-xl text-[10.5px] font-black flex items-center gap-1.5 border transition-all ${
                        allowExtendedKinship
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                      }`}
                    >
                      {allowExtendedKinship ? <Unlock size={12} /> : <Lock size={12} />}
                      <span>
                        {allowExtendedKinship
                          ? 'Extended Kinship: Visible to Leadership'
                          : 'Extended Kinship: Opted Out (Private)'}
                      </span>
                    </button>
                  </div>

                  {!allowExtendedKinship ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs text-amber-200 flex items-center gap-2">
                      <ShieldCheck size={16} className="shrink-0" />
                      <span>
                        You have opted out of sharing extended family relationships. Church leadership
                        will only see your nuclear household (Head, Spouse, Children) and cannot see
                        brothers, sisters, aunts, or uncles.
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {kinshipDemo.extendedRelatives.map(rel => (
                        <div
                          key={rel.id}
                          className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex flex-col justify-between gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white">
                              {rel.relativeOptedIn ? rel.name : 'Extended Relative (Opted Out)'}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-[#7A1FC0]/50 text-[#E2C27E]">
                              {rel.relationship}
                            </span>
                          </div>
                          {rel.relativeOptedIn ? (
                            <>
                              <div className="text-[10.5px] text-white/70">
                                {rel.relationshipLabel}
                              </div>
                              <div className="text-[9.5px] text-[#D8D2E2]/60 font-mono">
                                {rel.householdName} · {rel.department}
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] text-amber-300/80 flex items-center gap-1">
                              <Lock size={10} />
                              <span>
                                This family member chose not to allow extended relationship visibility.
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right 5 Cols: 4-Scope Family & Individual Tax Statement Generator */}
              <div
                className="lg:col-span-5 rounded-3xl p-6 border flex flex-col justify-between gap-5"
                style={{
                  background: 'rgba(24, 20, 31, 0.85)',
                  borderColor: 'rgba(226, 194, 126, 0.3)',
                }}
              >
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E2C27E]">
                      Church Finance Department · IRS 501(c)(3) Tax Receipts
                    </div>
                    <h3
                      className="text-2xl font-bold text-white"
                      style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                    >
                      Family & Individual Giving Statement Generator
                    </h3>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10.5px] font-bold uppercase tracking-wider text-[#D8D2E2]/80 block">
                      Select Statement Scope (Family / Spousal / Individual)
                    </label>
                    {(
                      [
                        {
                          id: 'JOINT_HOUSEHOLD',
                          title: '1. Joint Family Household Statement',
                          desc: 'Combines Head of Household (Marcus), Spouse (Elena), and Dependent Children (Micah & Noelle) with itemized sub-ledgers.',
                          amount: 12880,
                        },
                        {
                          id: 'HEAD_AND_SPOUSE',
                          title: '2. Head & Spouse Joint Statement Only',
                          desc: 'Combines Marcus & Elena Sterling ($12,650) on a joint married filing receipt; children receive separate youth receipts.',
                          amount: 12650,
                        },
                        {
                          id: 'INDIVIDUAL',
                          title: '3. Individual Member Tax Statement',
                          desc: 'Generates a separate individual IRS tax statement for each family member.',
                          amount: 8450,
                        },
                        {
                          id: 'FAMILY_PACKET',
                          title: '4. Complete Family Tax Packet',
                          desc: 'Prints the Household Cover Summary Sheet + all 4 individual member schedules in one packet.',
                          amount: 12880,
                        },
                      ] as const
                    ).map(opt => (
                      <button
                        key={opt.id}
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

                <div className="space-y-3 pt-3 border-t border-white/10">
                  <div className="text-[10.5px] text-white/60 leading-snug">
                    Includes official IRS 501(c)(3) acknowledgment (“No goods or services were
                    provided in exchange for these contributions, other than intangible religious
                    benefits”) and church EIN.
                  </div>
                  <button
                    onClick={handlePrintSampleTaxStatement}
                    className="w-full py-3 rounded-xl text-xs font-black text-black flex items-center justify-center gap-2 hover:brightness-110 transition-all"
                    style={{ background: '#E2C27E' }}
                  >
                    <Printer size={14} />
                    <span>
                      Generate & Print {taxScope.replace(/_/g, ' ')} Tax Statement (PDF)
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Lectio Reader Modal when opened from Mini-Bible or 365-Day Plan */}
      {fullLectioRef && (
        <div className="fixed inset-0 z-[130] flex flex-col" style={{ background: EV.chrome }}>
          <div className="px-4 sm:px-8 border-b flex items-center justify-between gap-4" style={{ borderColor: EV.line }}>
            <div className="flex items-baseline gap-3 py-3.5">
              <span className="ev-title text-lg text-white" style={{ fontWeight: 700 }}>Verse</span>
              <span className="text-sm" style={{ color: EV.gold }}>
                {fullLectioRef.bookName} {fullLectioRef.chapter}
                {fullLectioRef.verse ? `:${fullLectioRef.verse}` : ''}
              </span>
            </div>
            <button onClick={() => setFullLectioRef(null)} className="ev-btn ev-btn-ghost" style={{ minHeight: 36, fontSize: 13 }}>
              <X size={14} /> Back to Member home
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LectioReader openAt={fullLectioRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChurchMemberHub;
