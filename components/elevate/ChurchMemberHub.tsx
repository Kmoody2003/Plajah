// components/elevate/ChurchMemberHub.tsx
// Plajah Elevate — Church & Worship Organization Member Profile Hub
// Locked-In Edition I ("Royal Sanctuary Studio"):
//   · Top Live Stream & Ministry TV Channel Carousel + Inline Rello Church Viewer Mode
//   · Auto-Mounting Lectio Mini-Bible (Ambo Production Team Sync + Speech ASR Detection)
//   · Timestamped Stream & Video Notes ([MM:SS])
//   · Schedule + GPS In-Service Lectio Auto-Engage
//   · Ministry Activities & Assigned Departments + Recent Lessons
//   · Articles & Vespers Service Review Briefs from Previous Visits
//   · Daily Sanctuary Devotional System + 365-Day Read the Bible in a Year System
//   · Public-Domain Hymns (with Provenance & SATB Accompaniment Scores) + Catholic & Orthodox Prayers (Lorea)
//   · 12 Art Council Non-Scripture Sacred Text Plates (Lectio + Lorea)
//   · Smart Household & Extended Family Kinship CRM (with Per-Member Privacy Opt-Out) + 4-Scope Finance Tax Statements

import React, { useEffect, useMemo, useState } from 'react';
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
  CATHOLIC_AND_ORTHODOX_PRAYERS,
  openHymnOrPrayerInLorea,
} from '../../data/sacredHymnsAndPrayers';
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

type HubStudioSection =
  | 'SANCTUARY_STUDIO'
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

const STUDIO_NAV_ITEMS: Array<{
  id: HubStudioSection;
  label: string;
  badge?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'SANCTUARY_STUDIO', label: 'Sanctuary & Rello Live', badge: 'LIVE', icon: Sparkles },
  { id: 'DEVOTIONAL_AND_BIBLE_365', label: 'Devotional & Bible 365', badge: 'DAY 289', icon: Flame },
  { id: 'RECENT_LESSONS_AND_VESPERS', label: 'Lessons & Service Briefs', icon: GraduationCap },
  { id: 'HYMNS_PRAYERS_AND_SCORES', label: 'Hymns, Scores & Prayers', badge: 'LOREA', icon: Music },
  { id: 'COUNCIL_12_PLATES', label: '12 Sacred Text Plates', badge: 'COUNCIL', icon: ScrollText },
  { id: 'FAMILY_CRM_AND_TAX_STATEMENTS', label: 'Family Kinship & Tax Statements', icon: Users },
];

export const ChurchMemberHub: React.FC<ChurchMemberHubProps> = ({
  org,
  membership,
  user,
  onOpenGive,
  onOpenMinistry,
}) => {
  const [section, setSection] = useState<HubStudioSection>('SANCTUARY_STUDIO');

  // Schedule + GPS Sanctuary Auto-Engage State
  const [simulateInSanctuary, setSimulateInSanctuary] = useState<boolean>(true);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [fullLectioRef, setFullLectioRef] = useState<ScriptureRef | null>(null);
  const [vespersOpen, setVespersOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation && !simulateInSanctuary) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, [simulateInSanctuary]);

  const autoEngageStatus = useMemo(
    () => evaluateSanctuaryAutoEngage(org, { userCoords, simulateInSanctuary }),
    [org, userCoords, simulateInSanctuary]
  );

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
        dateLabel: 'Last Sunday · 11:00 AM Choral Eucharist',
        title: 'Beholding the Uncreated Light in Earthen Vessels',
        speaker: 'Rev. Dr. Elias Vance',
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
        dateLabel: 'Wednesday Vespers · 7:00 PM Lamplighting Office',
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
    []
  );

  // Assigned Ministries & Departments
  const assignedMinistries = useMemo(() => {
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
        name: 'Ambo Sanctuary Production & Broadcast Guild',
        iconEmoji: '📡',
        description: 'Live Kairos scripture cues, Rello stream direction & speech ASR operators.',
        meetingTime: 'Sundays · 8:00 AM Call Time · Broadcast Booth',
      },
    ];
  }, [org.ministries]);

  const displayName =
    membership?.displayName || user?.displayName || 'Marcus Sterling';
  const memberRoleTitle =
    membership?.title || membership?.role || 'Covenant Member · Head of Household';

  return (
    <div
      className="rounded-[2rem] border overflow-hidden shadow-2xl my-6"
      style={{
        background:
          'radial-gradient(120% 90% at 15% 0%, rgba(107, 0, 153, 0.28) 0%, rgba(212, 0, 85, 0.12) 32%, #0B0516 70%, #06020C 100%)',
        borderColor: 'rgba(232, 193, 112, 0.32)',
      }}
    >
      {/* ── EDITION I: ROYAL SANCTUARY STUDIO HEADER BAR ── */}
      <div
        className="px-6 py-5 border-b flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        style={{
          borderColor: 'rgba(224, 206, 255, 0.14)',
          background:
            'linear-gradient(90deg, rgba(107,0,153,0.32) 0%, rgba(20,9,38,0.92) 55%, rgba(212,0,85,0.22) 100%)',
        }}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-[0.22em] bg-[#E8C170] text-black">
              Edition I · Royal Sanctuary Studio
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-widest bg-[#6B0099]/60 border border-[#E0CEFF]/30 text-[#E0CEFF]">
              Plajah Elevate · Congregant Member Hub
            </span>
          </div>
          <h2
            className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
            style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
          >
            Welcome home to {org.name}, <span className="text-[#E8C170]">{displayName}</span>
          </h2>
          <p className="text-xs text-[#E0CEFF]/75 flex items-center gap-2 flex-wrap">
            <span>{memberRoleTitle}</span>
            <span>·</span>
            <span>The Sterling Household (Head + Spouse + 2 Children)</span>
          </p>
        </div>

        {/* In-Service Schedule + GPS Sanctuary Auto-Engage Pill */}
        <div
          className="rounded-2xl p-3.5 border flex flex-col sm:flex-row sm:items-center gap-3"
          style={{
            background: autoEngageStatus.autoEngaged
              ? 'rgba(16, 185, 129, 0.12)'
              : 'rgba(255, 255, 255, 0.04)',
            borderColor: autoEngageStatus.autoEngaged
              ? 'rgba(52, 211, 153, 0.45)'
              : 'rgba(255, 255, 255, 0.15)',
          }}
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
              <Navigation size={11} />
              <span>
                {autoEngageStatus.autoEngaged
                  ? 'In-Service Schedule + GPS Auto-Engage: ACTIVE'
                  : 'Schedule + GPS Auto-Engage: Standby'}
              </span>
            </div>
            <div className="text-[11px] text-white/85 font-medium">
              {autoEngageStatus.activeServiceLabel}
            </div>
            <div className="text-[10px] font-mono text-[#E0CEFF]/65 flex items-center gap-1">
              <MapPin size={10} className="text-[#E8C170]" />
              <span>{autoEngageStatus.coordinatesLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSimulateInSanctuary(v => !v)}
              className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold border border-white/15 bg-black/40 text-white/80 hover:text-white"
              title="Toggle simulated physical presence inside the Sanctuary geofence"
            >
              {simulateInSanctuary ? 'In-Sanctuary GPS' : 'Remote GPS'}
            </button>
            <button
              onClick={() =>
                setFullLectioRef({ book: 47, bookName: '2 Corinthians', chapter: 4, verse: 6 })
              }
              className="px-3 py-1.5 rounded-xl text-[10.5px] font-black text-black flex items-center gap-1.5 whitespace-nowrap"
              style={{ background: '#E8C170' }}
            >
              <BookOpen size={12} />
              <span>Open Lectio Sanctuary View</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── STUDIO NAVIGATION RIBBON ── */}
      <div className="px-6 py-3 border-b border-white/10 bg-black/40 flex items-center gap-2 overflow-x-auto custom-scrollbar">
        {STUDIO_NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap border transition-all ${
                active
                  ? 'bg-[#6B0099] text-white border-[#E8C170]/60 shadow-[0_0_20px_rgba(107,0,153,0.5)]'
                  : 'bg-white/[0.04] text-[#E0CEFF]/70 border-white/10 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Icon size={14} className={active ? 'text-[#E8C170]' : 'text-[#E0CEFF]/60'} />
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase ${
                    active ? 'bg-[#E8C170] text-black' : 'bg-white/10 text-[#E0CEFF]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── MAIN STUDIO BODY ── */}
      <div className="p-6 space-y-8">
        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: SANCTUARY STUDIO OVERVIEW + TOP LIVE STREAM CAROUSEL + RELLO VIEWER
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'SANCTUARY_STUDIO' && (
          <div className="space-y-8">
            {/* Top Live Stream & Ministry TV Channel Carousel + Inline Rello Church Viewer Mode */}
            <RelloChurchViewer
              org={org}
              inSanctuaryAutoEngaged={autoEngageStatus.autoEngaged}
              onOpenFullLectio={ref => setFullLectioRef(ref)}
            />

            {/* Assigned Departments, Ministry Activities & Quick Actions Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* My Assigned Departments & Ministry Activities (7 cols) */}
              <div
                className="lg:col-span-7 rounded-3xl p-5 border space-y-4"
                style={{
                  background: 'rgba(18, 9, 36, 0.78)',
                  borderColor: 'rgba(224, 206, 255, 0.18)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E8C170]">
                      My Covenant Departments & Ministry Roster
                    </div>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      Active Ministry Activities & Upcoming Shifts
                    </h3>
                  </div>
                  {onOpenGive && (
                    <button
                      onClick={onOpenGive}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-black text-black flex items-center gap-1.5"
                      style={{ background: '#E8C170' }}
                    >
                      <HeartHandshake size={13} />
                      <span>Sanctuary Giving</span>
                    </button>
                  )}
                </div>

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
                          <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-[#6B0099]/60 text-[#E0CEFF] border border-[#E0CEFF]/25">
                            Active Member
                          </span>
                        </div>
                        {m.description && (
                          <p className="text-xs text-white/65 mt-1 leading-snug">{m.description}</p>
                        )}
                      </div>
                      {m.meetingTime && (
                        <div className="text-[10px] font-mono text-[#E8C170] flex items-center gap-1 pt-1 border-t border-white/10">
                          <Clock size={10} />
                          <span>{m.meetingTime}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's Devotional & 365-Day Bible Snapshot Card (5 cols) */}
              <div
                className="lg:col-span-5 rounded-3xl p-5 border flex flex-col justify-between gap-4"
                style={{
                  background:
                    'linear-gradient(155deg, rgba(107,0,153,0.28) 0%, rgba(16,8,32,0.92) 100%)',
                  borderColor: 'rgba(232, 193, 112, 0.3)',
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E8C170]">
                      {activeDevo.liturgicalHour}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-[#E8C170]/15 text-[#FFE399] border border-[#E8C170]/35">
                      Bible in a Year · Day {todayDayNum} / 365
                    </span>
                  </div>
                  <h3
                    className="text-xl font-bold text-white leading-snug"
                    style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                  >
                    {activeDevo.title}
                  </h3>
                  <blockquote className="p-3 rounded-xl bg-black/40 border-l-2 border-[#E8C170] text-xs italic text-[#E0CEFF]/90 font-serif">
                    “{activeDevo.scriptureQuote}” —{' '}
                    <b className="not-italic text-[#E8C170]">{activeDevo.scriptureDisplay}</b>
                  </blockquote>
                  <p className="text-xs text-white/75 leading-relaxed line-clamp-3">
                    {activeDevo.reflectionParagraphs[0]}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => setSection('DEVOTIONAL_AND_BIBLE_365')}
                    className="px-3.5 py-2 rounded-xl text-xs font-black text-black flex items-center gap-1.5"
                    style={{ background: '#E8C170' }}
                  >
                    <Flame size={13} />
                    <span>Open Devotional & 365-Day Plan</span>
                  </button>
                  <button
                    onClick={() => setSection('COUNCIL_12_PLATES')}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-[#E0CEFF] bg-white/5 hover:bg-white/10 border border-white/15"
                  >
                    12 Sacred Plates →
                  </button>
                </div>
              </div>
            </div>
          </div>
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
                background: 'rgba(18, 9, 36, 0.85)',
                borderColor: 'rgba(232, 193, 112, 0.3)',
              }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170]">
                    Sanctuary Daily Office & Devotional System
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
                          ? 'bg-[#E8C170] text-black border-[#E8C170]'
                          : 'bg-white/5 text-white/65 border-white/10 hover:text-white'
                      }`}
                    >
                      {d.liturgicalHour.split(' · ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/45 border border-[#E8C170]/35 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#E8C170]">{activeDevo.scriptureDisplay}</span>
                  <button
                    onClick={() => setFullLectioRef(activeDevo.scriptureRef)}
                    className="text-[10.5px] font-bold text-[#E0CEFF] hover:underline flex items-center gap-1"
                  >
                    <BookOpen size={11} />
                    <span>Read Chapter in Lectio</span>
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

              <div className="p-4 rounded-2xl bg-[#6B0099]/20 border border-[#E0CEFF]/25 space-y-1">
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#E8C170]">
                  Collect Prayer of the Day
                </div>
                <p className="text-xs font-serif italic text-[#E0CEFF] leading-relaxed">
                  {activeDevo.collectPrayer}
                </p>
              </div>

              {/* Personal Devotional Reflection Note */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <label className="text-[10.5px] font-bold uppercase tracking-wider text-[#E0CEFF]/80 block">
                  My Sanctuary Examen & Prayer Journal (Saved Locally)
                </label>
                <textarea
                  rows={3}
                  value={devoNote}
                  onChange={e => {
                    setDevoNote(e.target.value);
                    saveDevotionalReflectionNote(activeDevo.id, e.target.value);
                  }}
                  placeholder="Write your prayer reflection or response to today’s devotional…"
                  className="w-full rounded-xl bg-black/40 border border-white/15 p-3 text-xs text-white placeholder:text-white/35 outline-none focus:border-[#E8C170]"
                />
              </div>
            </div>

            {/* Right 6 Cols: 365-Day Read the Bible in a Year Canonical System */}
            <div
              className="lg:col-span-6 rounded-3xl p-6 border space-y-5"
              style={{
                background: 'rgba(18, 9, 36, 0.85)',
                borderColor: 'rgba(224, 206, 255, 0.22)',
              }}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170]">
                    365-Day Canonical Reading Plan · OT · NT · Psalms · Proverbs
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
                  <span className="px-3 py-1 rounded-lg bg-[#6B0099]/50 border border-[#E0CEFF]/30 text-xs font-mono font-bold text-white">
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
                    Theme: <b className="text-[#E8C170]">{activeBibleYearDay.canonicalTheme}</b>
                  </span>
                  <span className="font-mono text-[#E8C170] font-bold">
                    {completedDays.length} / 365 Days Completed (
                    {Math.round((completedDays.length / 365) * 100)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(4, (completedDays.length / 365) * 100))}%`,
                      background: 'linear-gradient(90deg, #6B0099, #D40055, #E8C170)',
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
                      <span className="text-[9.5px] font-extrabold uppercase tracking-widest text-[#E8C170] block">
                        {p.category.replace('_', ' ')}
                      </span>
                      <span className="text-sm font-bold text-white">{p.label}</span>
                    </div>
                    <button
                      onClick={() => setFullLectioRef(p.ref)}
                      className="px-3 py-1.5 rounded-xl bg-[#E8C170]/15 hover:bg-[#E8C170]/25 border border-[#E8C170]/40 text-[#FFE399] text-xs font-bold flex items-center gap-1.5"
                    >
                      <BookOpen size={12} />
                      <span>Read in Lectio</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  onClick={() => setSelectedDayNum(todayDayNum)}
                  className="text-xs text-[#E0CEFF]/75 hover:text-white underline"
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
                      : { background: '#E8C170', color: '#000' }
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
          <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170]">
                  Previous Sanctuary Visits · Vespers & ARIA Service Review Briefs
                </div>
                <h3
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                >
                  Service Review Briefs, Articles & Recent Lessons
                </h3>
              </div>
              <button
                onClick={() => setVespersOpen(v => !v)}
                className="px-4 py-2 rounded-xl text-xs font-black text-black flex items-center gap-1.5"
                style={{ background: '#E8C170' }}
              >
                <ScrollText size={13} />
                <span>{vespersOpen ? 'Hide Live Vespers Recap' : 'Open Live Vespers Service Recap'}</span>
              </button>
            </div>

            {vespersOpen && (
              <div className="rounded-3xl p-5 bg-black/50 border border-[#E8C170]/35">
                <VespersRecap
                  recapId={sessionIdFor(org.id)}
                  onBack={() => setVespersOpen(false)}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {previousServiceBriefs.map(b => (
                <div
                  key={b.id}
                  className="rounded-3xl p-5 border border-[#E0CEFF]/20 bg-[#140A28]/85 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono text-[#E8C170] uppercase tracking-wider">
                      {b.dateLabel} · {b.speaker}
                    </div>
                    <h4 className="text-lg font-bold text-white">{b.title}</h4>
                    <p className="text-xs text-white/75 leading-relaxed">{b.ariaBrief}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {b.keyScriptures.map(ks => (
                        <button
                          key={ks.label}
                          onClick={() => setFullLectioRef(ks.ref)}
                          className="px-2.5 py-1 rounded-lg bg-[#6B0099]/40 border border-[#E0CEFF]/25 text-[10.5px] font-bold text-[#E0CEFF] hover:bg-[#6B0099]"
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
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170] mb-3">
                Recent Catechism, Classes & Bible Studies
              </div>
              <ChurchEducation church={org} canEdit={false} />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 4: PUBLIC-DOMAIN HYMNS (WITH SCORES & HISTORY) + CATHOLIC & ORTHODOX PRAYERS
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'HYMNS_PRAYERS_AND_SCORES' && (
          <div className="space-y-8">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170]">
                Ambo & Lorea Sacred Music & Prayer Database
              </div>
              <h3
                className="text-2xl font-bold text-white"
                style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
              >
                Public-Domain Hymns (with Historical Provenance & SATB Scores) + Catholic & Orthodox Prayers
              </h3>
            </div>

            {/* Public Domain Hymns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {PUBLIC_DOMAIN_HYMNS.map(hymn => (
                <div
                  key={hymn.id}
                  className="rounded-3xl p-5 border border-[#E8C170]/30 bg-[#140926]/90 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#E8C170]">
                      <span>{hymn.year}</span>
                      {hymn.score && (
                        <span>
                          Tune: {hymn.score.tuneName} · {hymn.score.defaultKey} ({hymn.score.timeSignature})
                        </span>
                      )}
                    </div>
                    <h4 className="text-lg font-bold text-white">{hymn.title}</h4>
                    <div className="text-xs text-[#E0CEFF]/75">{hymn.author}</div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-serif text-white/90 whitespace-pre-line">
                      {hymn.stanzas[0]}
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#E8C170]">
                        Provenance · {hymn.historyTitle}
                      </div>
                      <p className="text-[11px] text-white/75 leading-relaxed line-clamp-3">
                        {hymn.historyEssay}
                      </p>
                    </div>

                    {hymn.score && (
                      <div className="p-2.5 rounded-xl bg-[#E8C170]/10 border border-[#E8C170]/30 text-[10.5px] font-mono text-[#FFE399] space-y-1">
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
                      style={{ background: '#E8C170' }}
                    >
                      <BookOpen size={13} />
                      <span>Open Hymn, History & Score in Lorea</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Catholic & Eastern Orthodox Liturgical Prayers */}
            <div className="space-y-4">
              <h4 className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#E0CEFF]">
                Catholic & Eastern Orthodox Liturgical Prayers · Parallel Ancient & English
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {CATHOLIC_AND_ORTHODOX_PRAYERS.map(prayer => (
                  <div
                    key={prayer.id}
                    className="rounded-3xl p-5 border border-[#E0CEFF]/25 bg-[#140926]/90 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#E0CEFF]">
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
                          <div className="italic text-[#E0CEFF]/85 border-b sm:border-b-0 sm:border-r border-white/10 pb-2 sm:pb-0 sm:pr-2">
                            <span className="text-[9px] font-mono uppercase not-italic text-[#E8C170] block mb-0.5">
                              {prayer.originalLanguage || 'Ancient'}
                            </span>
                            {prayer.originalStanzas[0]}
                          </div>
                        )}
                        <div className="text-white/90">
                          <span className="text-[9px] font-mono uppercase text-[#E8C170] block mb-0.5">
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
                        style={{ background: '#E0CEFF' }}
                      >
                        <BookOpen size={13} />
                        <span>Open Prayer & History in Lorea</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 5: 12 ART COUNCIL NON-SCRIPTURE SACRED TEXT PLATES (LECTIO + LOREA)
            ═══════════════════════════════════════════════════════════════════════ */}
        {section === 'COUNCIL_12_PLATES' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170]">
                  Plajah Art Council · 6 Creative Lenses × 12 Distinct Architectural Geometries
                </div>
                <h3
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                >
                  12 Sacred Text Plates for Non-Scripture Religious Texts (Lectio & Lorea)
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
                        ? 'bg-[#E8C170] text-black'
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
        {section === 'FAMILY_CRM_AND_TAX_STATEMENTS' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Nuclear Household (Head, Spouse, Children) + Extended Family Kinship Graph */}
              <div
                className="lg:col-span-7 rounded-3xl p-6 border space-y-6"
                style={{
                  background: 'rgba(18, 9, 36, 0.85)',
                  borderColor: 'rgba(224, 206, 255, 0.22)',
                }}
              >
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170]">
                    Smart Church Kinship CRM · Nuclear Household & Extended Relatives
                  </div>
                  <h3
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: 'var(--font-display, "Outfit", "Space Grotesk", "Inter", sans-serif)', letterSpacing: '-0.02em' }}
                  >
                    {kinshipDemo.householdName} — Family & Kinship Graph
                  </h3>
                  <p className="text-xs text-[#E0CEFF]/70 mt-0.5">
                    {kinshipDemo.filingStatus} · {kinshipDemo.address}
                  </p>
                </div>

                {/* Nuclear Family Members (Head of Household, Spouse, Dependent Children) */}
                <div className="space-y-2.5">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-[#E8C170]">
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
                                ? 'bg-[#E8C170] text-black'
                                : m.role === 'SPOUSE'
                                ? 'bg-[#D40055] text-white'
                                : 'bg-[#6B0099] text-[#E0CEFF]'
                            }`}
                          >
                            {m.roleLabel}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-white/65">{m.maritalStatus}</div>
                        <div className="text-[10px] text-[#E0CEFF]/80">
                          Departments: {m.departments.join(' · ')}
                        </div>
                        <div className="text-[10.5px] font-mono text-[#E8C170] pt-1 border-t border-white/10 flex justify-between">
                          <span>YTD Deductible Gifts ({m.giftCount}):</span>
                          <b>{money(m.ytdGiving)}</b>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Extended Family Kinship Graph + Per-Member Privacy Opt-Out Control */}
                <div className="p-4 rounded-2xl bg-black/40 border border-[#E0CEFF]/20 space-y-4">
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
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-[#6B0099]/50 text-[#E8C170]">
                              {rel.relationship}
                            </span>
                          </div>
                          {rel.relativeOptedIn ? (
                            <>
                              <div className="text-[10.5px] text-white/70">
                                {rel.relationshipLabel}
                              </div>
                              <div className="text-[9.5px] text-[#E0CEFF]/60 font-mono">
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
                  background: 'rgba(18, 9, 36, 0.85)',
                  borderColor: 'rgba(232, 193, 112, 0.3)',
                }}
              >
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170]">
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
                    <label className="text-[10.5px] font-bold uppercase tracking-wider text-[#E0CEFF]/80 block">
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
                            ? 'bg-[#6B0099]/45 border-[#E8C170] text-white'
                            : 'bg-white/[0.03] border-white/10 text-white/70 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white">{opt.title}</span>
                          <span className="text-xs font-mono font-black text-[#E8C170]">
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
                    style={{ background: '#E8C170' }}
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
        <div className="fixed inset-0 z-[130] bg-[#07040E] flex flex-col">
          <div className="px-5 py-2.5 border-b border-white/10 bg-black/60 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#E8C170]">
              <BookOpen size={14} />
              <span>
                Lectio Sanctuary Reader · {fullLectioRef.bookName} {fullLectioRef.chapter}
                {fullLectioRef.verse ? `:${fullLectioRef.verse}` : ''}
              </span>
            </div>
            <button
              onClick={() => setFullLectioRef(null)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1"
            >
              <X size={13} />
              <span>Return to Member Hub</span>
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
