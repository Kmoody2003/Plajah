import React, { useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Church,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Gift,
  Globe,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Landmark,
  Layers,
  Mic,
  MonitorPlay,
  Music,
  Printer,
  ScrollText,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import Logo from '../Logo';
import { Button, IconButton, Surface, Actions, Eyebrow, Chip } from '../ui';

export interface ElevateOneSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExploreDemo?: () => void;
  onCreateOrg?: () => void;
}

type AudienceFilter = 'ALL' | 'NONPROFIT' | 'FAITH' | 'CULTURAL';

interface PillarSpec {
  id: Exclude<AudienceFilter, 'ALL'>;
  badge: string;
  title: string;
  subtitle: string;
  accentVar: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  actionTabName: string;
  signatureQuote: string;
  capabilities: {
    title: string;
    detail: string;
  }[];
  volunteerEdge: string;
}

const PILLAR_SPECS: PillarSpec[] = [
  {
    id: 'NONPROFIT',
    badge: 'NONPROFITS · FOUNDATIONS · CAUSES',
    title: 'Mission Scale Without Tool Fragmentation',
    subtitle:
      'Replace disconnected volunteer shift apps, petition forms, livestream tools, and high-fee donation pages with one connected civic & community engine.',
    accentVar: 'var(--pj-success)',
    icon: HeartHandshake,
    actionTabName: 'Take Action',
    signatureQuote:
      'Every volunteer shift, petition signature, and donor dollar lives in one verified profile — with matching grants and print-ready dossiers.',
    capabilities: [
      {
        title: 'Multi-Shift Field Drives & Automatic Waitlists',
        detail:
          'Role-based shift slots with capacity caps, automatic waitlist promotion the second a seat opens, and QR / geofence check-in.',
      },
      {
        title: 'Petitions & Open Letters with 30s Voice/Video Testimonies',
        detail:
          'Supporters attach 30-second voice or video stories; milestones trigger SeedRaiser sponsor matching grants and Tela Studio bound PDF dossiers.',
      },
      {
        title: 'Distributed Chapter & Salon Hosting with Screening Rights',
        detail:
          'Supporters apply to host neighborhood watch parties or chapter actions with a one-click Community Screening License for your Cinema films & live broadcasts.',
      },
      {
        title: 'Zero-Platform-Fee Mission Funds & Dual-Signature Treasury',
        detail:
          'Designated campaign funds, instant tax-ready receipts, dual-signature expense approvals, and 2-way CSV/webhook sync with NGP VAN, EveryAction & Salesforce.',
      },
    ],
    volunteerEdge:
      'Volunteers earn verified Impact Passport hours (exportable for university credit or corporate matching), recorded at check-in.',
  },
  {
    id: 'FAITH',
    badge: 'CHURCHES · MINISTRIES · GLOBAL FAITH TRADITIONS',
    title: 'From Sunday Sanctuary to Seven-Day Service',
    subtitle:
      'Unite sanctuary stage projection, live broadcast, scripture study, pastoral prayer, tithes, and congregation-wide volunteer action in one sacred home.',
    accentVar: 'var(--pj-purple)',
    icon: Church,
    actionTabName: 'Serve & Action',
    signatureQuote:
      'The same platform that projects scripture on your sanctuary wall on Sunday morning coordinates your neighborhood pantry shifts and house-church watch parties all week.',
    capabilities: [
      {
        title: 'Stage Sanctuary Stage + Mobile Follow-Along',
        detail:
          'Drive sanctuary walls, stage confidence monitors, and live scripture/lyric Follow-Along cards on every congregant phone straight from the browser.',
      },
      {
        title: 'Serve & Action: Ministry Rosters & Mercy Drives',
        detail:
          'Schedule Sunday Greeters, AV/Stage crews, Choir rehearsals, and Saturday outreach drives with automatic waitlists and non-SMS Push + Post Man Email cadences.',
      },
      {
        title: 'Congregation Covenants with Spoken Testimonies',
        detail:
          'Launch 1,000-hour neighborhood service covenants where members pledge hours, record 30s voice testimonies, and unlock Trustee benevolence matching funds.',
      },
      {
        title: 'Zero-Platform-Fee Tithes, ChMS Import & Prayer Routing',
        detail:
          'Multi-fund giving (Tithes, Missions, Building, Youth), 1-click import from Planning Center / Servant Keeper / Breeze, and moderated Prayer Wall routing.',
      },
    ],
    volunteerEdge:
      'Every shift served is checked in and kept on the volunteer’s verified service record and in your ChMS.',
  },
  {
    id: 'CULTURAL',
    badge: 'MUSEUMS · HERITAGE CENTERS · ARTS INSTITUTIONS',
    title: 'Living Archives, Docent Corps & Patron Salons',
    subtitle:
      'Transform static museum websites into living cultural sanctuaries with interactive exhibitions, docent scheduling, and licensed neighborhood salons.',
    accentVar: 'var(--pj-orange)',
    icon: Landmark,
    actionTabName: 'Docents & Action',
    signatureQuote:
      'Curate exhibitions in Lorea & Cinema, schedule your docent corps with automatic waitlists, and license patron salons to screen premieres worldwide.',
    capabilities: [
      {
        title: 'Docent & Exhibition Crew Shift Scheduling',
        detail:
          'Manage gallery docents, opening-night ushers, and archival conservation volunteers with skill tags, capacity caps, and automatic waitlist promotion.',
      },
      {
        title: 'Licensed Patron Salons & Screening Circles',
        detail:
          'Grant vetted patrons and university chapters a Community Screening License to host synchronized Cinema documentary screenings with Stage lecture slides.',
      },
      {
        title: 'Lorea Living Archives & 12 Heritage Text Plates',
        detail:
          'Publish interactive exhibition catalogs, musical scores, oral histories, and high-resolution archival plates with synchronized audio commentary.',
      },
      {
        title: 'Patron Charters, Endowment Giving & Tax Receipts',
        detail:
          'Run cultural preservation charters, exhibition sponsorship funds, museum store drops, and automated household tax statements.',
      },
    ],
    volunteerEdge:
      'Docents and cultural stewards build a verified service record of hours and roles that travels with them.',
  },
];

const SIX_CLOSED_GAPS = [
  {
    code: '01',
    title: 'Multi-Shift Scheduling & Auto-Waitlists',
    tag: 'SHIFTS & ROSTERS',
    accent: 'var(--pj-orange)',
    icon: Calendar,
    summary:
      'Role-specific shifts with capacity caps, skill tags, instant automatic waitlist promotion when a confirmed volunteer cancels, and 1-tap QR / Sanctuary Geofence check-in.',
    plajahExclusive:
      'Directly linked to your Org Roster, Ministry/Program spaces, and live event run-of-show.',
  },
  {
    code: '02',
    title: 'Verified Service Records',
    tag: 'TRUST & RECORDS',
    accent: 'var(--pj-magenta)',
    icon: Sparkles,
    summary:
      'Every completed shift is checked in and recorded — hours, roles and history — on a verified record the volunteer and your staff can both trust.',
    plajahExclusive:
      'Shift records live beside your roster, giving and member care — not in a separate sign-up tool.',
  },
  {
    code: '03',
    title: 'Peer Chapter Hosting + Media Screening Licenses',
    tag: 'DISTRIBUTED SPOKES',
    accent: 'var(--pj-cyan)',
    icon: Globe,
    summary:
      'Members apply to host neighborhood watch parties, house chapters, or salon circles with host vetting, capacity rollups, and an official Community Screening License.',
    plajahExclusive:
      'Hosts receive synchronized Reello livestream + Cinema film playback + Stage mobile Follow-Along slides.',
  },
  {
    code: '04',
    title: 'Petitions & Covenants with 30s Voice Testimonies',
    tag: 'CIVIC & SPIRITUAL VOICE',
    accent: 'var(--pj-lilac)',
    icon: Mic,
    summary:
      'Collect verified signatures alongside 30-second voice or video testimonies, pledged volunteer hours, and SeedRaiser sponsor matching grant milestones.',
    plajahExclusive:
      '1-click export to Plajah Tela Studio generates a typeset, print-ready bound PDF dossier with QR testimony links.',
  },
  {
    code: '05',
    title: 'No-SMS Native Cadence + ARIA Post-Event Loop',
    tag: 'ZERO CARRIER FEES',
    accent: 'var(--pj-success)',
    icon: Bell,
    summary:
      'Automated 72h Prep Brief, 24h 1-Tap Attendance Confirm, and 1h Doors Pass via In-App Push, Post Man Rich HTML Email, and .ICS Calendar.',
    plajahExclusive:
      'After check-in, ARIA automatically packages event photos and testimonies into social reels, threads, and newsletters.',
  },
  {
    code: '06',
    title: 'Verified Impact Passport + Coalition CRM Bridge',
    tag: 'PORTABLE CREDENTIALS',
    accent: 'var(--pj-purple)',
    icon: ShieldCheck,
    summary:
      'Every member builds a tamper-evident Impact Passport of verified hours across co-hosting organizations, plus 2-way CSV/webhook sync.',
    plajahExclusive:
      'Native presets for Planning Center, Servant Keeper, Breeze, NGP VAN, EveryAction, and Salesforce Nonprofit.',
  },
];

const STACK_CONSOLIDATION_ROWS = [
  {
    category: 'Volunteer Shifts, Waitlists & Check-In',
    legacyTools: 'Mobilize / SignUpGenius / TimeCounts ($150–$800+/mo)',
    plajahElevate: 'Native Action & Shifts Engine + Verified Service Records',
  },
  {
    category: 'Stage Projection & Mobile Follow-Along',
    legacyTools: 'ProPresenter + Custom Church/Museum App ($80–$300/mo)',
    plajahElevate: 'Stage Browser Stage + Instant Phone Follow-Along',
  },
  {
    category: 'Livestreaming, Film Screenings & Audio',
    legacyTools: 'Vimeo Enterprise / BoxCast / SoundCloud ($100–$500/mo)',
    plajahElevate: 'Reello Live + Cinema + Chora Audio Stems & Scores',
  },
  {
    category: 'Petitions, Pledges & Advocacy Dossiers',
    legacyTools: 'ActionNetwork / Change.org / InDesign ($100–$400/mo)',
    plajahElevate: '30s Voice/Video Covenants + SeedRaiser Match + Tela PDF Dossier',
  },
  {
    category: 'Donations, Tithes & Campaign Contributions',
    legacyTools: 'Pushpay / Tithe.ly / ActBlue (1–5% platform markup + processor fees)',
    plajahElevate: '0% Plajah Platform Fee (Standard Stripe Processing Only) + Dual-Signature / FEC Desk',
  },
  {
    category: 'Member Roster, ChMS & Reminder Cadence',
    legacyTools: 'Planning Center / Breeze + Mailchimp ($100–$350/mo)',
    plajahElevate: 'Pre-Provisioned Member IDs + Push, Post Man Email & .ICS Cadence',
  },
];

const CROSS_VERTICAL_MATRIX = [
  {
    vertical: 'Plajah Elevate',
    sub: 'Nonprofits · Faith · Cultural',
    tabLabel: 'Serve & Action · Take Action · Docents',
    shiftsUse: 'Outreach drives, Sunday greeters, AV crew, museum docents',
    spokesUse: 'House-church watch parties, chapter actions, patron film salons',
    petitionsUse: 'Mercy covenants, civic open letters, cultural charters',
    passportUse: 'Service statements and ministry history',
  },
  {
    vertical: 'Plajah Academia',
    sub: 'Universities · K-12 · Seminars',
    tabLabel: 'Service & Chapters',
    shiftsUse: 'Service-learning practicums, lab TA slots, campus orientation crew',
    spokesUse: 'Regional alumni chapters, peer study groups, lecture screenings',
    petitionsUse: 'Student senate resolutions, honor code pledges, faculty letters',
    passportUse: 'Co-Curricular Service Transcript + Verified Academic Hours',
  },
  {
    vertical: 'Plajah Clubs',
    sub: 'Fan Clubs · Guilds · Run/Book Clubs',
    tabLabel: 'Meetups & Crew',
    shiftsUse: 'Event moderators, stage hands, tournament marshals, street teams',
    spokesUse: 'City-by-city album listening parties & premiere watch parties',
    petitionsUse: 'Club bylaw votes, charity drives, "Bring Tour to My City" pledges',
    passportUse: 'Verified crew history and role credits',
  },
  {
    vertical: 'Plajah Business',
    sub: 'Brands · Studios · Creators',
    tabLabel: 'Ambassadors & Pop-Ups',
    shiftsUse: 'Pop-up retail staff, street-team sampling shifts, creator booth slots',
    spokesUse: 'Licensed community pop-ups, micro-influencer launch parties',
    petitionsUse: 'B-Corp sustainability pledges, co-design votes, cause matches',
    passportUse: 'Verified ambassador hours and roles',
  },
];

export const ElevateOneSheetModal: React.FC<ElevateOneSheetModalProps> = ({
  isOpen,
  onClose,
  onExploreDemo,
  onCreateOrg,
}) => {
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('ALL');
  const [copiedState, setCopiedState] = useState<'NONE' | 'LINK' | 'BRIEF'>('NONE');

  if (!isOpen) return null;

  const visiblePillars =
    audienceFilter === 'ALL'
      ? PILLAR_SPECS
      : PILLAR_SPECS.filter(p => p.id === audienceFilter);

  const handleCopyBrief = () => {
    const text = [
      'PLAJAH ELEVATE — EXECUTIVE ONE-SHEET (NONPROFITS, FAITH & CULTURAL INSTITUTIONS)',
      '================================================================================',
      'One connected home for Sanctuary & Stage Broadcast, Zero-Platform-Fee Giving, Member Rosters, and Full-Spectrum Volunteer Action & Shifts.',
      '',
      'WHY PLAJAH ELEVATE REPLACES STANDALONE VOLUNTEER & ORG TOOLS:',
      '1. Multi-Shift Scheduling & Automatic Waitlists: Role-based shift slots, automatic waitlist promotion, and QR / geofence check-in.',
      '2. Verified Service Records: every check-in is recorded — hours, roles and history — on the volunteer’s service record and in your ChMS.',
      '3. Distributed Chapter & Watch Party Hosting: Vetted members host neighborhood watch parties or salons with an official Community Screening License (Reello Live + Cinema Film + synced Stage mobile slides).',
      '4. Petitions, Covenants & Open Letters with 30s Voice/Video Testimonies: Milestone sponsor matching grants (SeedRaiser) + 1-click print-ready bound PDF dossiers via Tela Studio.',
      '5. No-SMS Native Reminder Cadence + ARIA Loop: 72h Prep Brief, 24h 1-Tap Confirm, and 1h Doors Pass via Push, Post Man HTML Email & .ICS, followed by ARIA social/newsletter repurposing.',
      '6. Verified Impact Passports + CRM Bridge: Portable verified volunteer transcripts + 2-way CSV/webhook sync with Planning Center, Servant Keeper, Breeze, NGP VAN, EveryAction & Salesforce.',
      '',
      `Shareable One-Sheet URL: ${window.location.origin}/plajah-elevate-one-sheet.html`,
    ].join('\n');

    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedState('BRIEF');
    setTimeout(() => setCopiedState('NONE'), 2600);
  };

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}/plajah-elevate-one-sheet.html`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedState('LINK');
    setTimeout(() => setCopiedState('NONE'), 2600);
  };

  const handleOpenPrintableOneSheet = () => {
    window.open('/plajah-elevate-one-sheet.html', '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      style={{
        backgroundColor: 'rgba(2, 2, 2, 0.86)',
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Plajah Elevate Executive One-Sheet"
    >
      <Surface
        level={5}
        shape="hero"
        brand
        padded={false}
        className="w-full max-w-6xl max-h-[92dvh] flex flex-col overflow-hidden text-white"
        style={{ backgroundColor: 'var(--bg-color, #020202)' }}
      >
        {/* ── STICKY TOP COMMAND BAR ── */}
        <div
          className="px-5 sm:px-8 py-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0"
          style={{
            borderColor: 'var(--pj-border-strong)',
            background: 'rgba(12, 6, 22, 0.92)',
          }}
        >
          <div className="flex items-center gap-3">
            <Logo size={34} />
            <div>
              <div className="flex items-center gap-2">
                <span className="pj-eyebrow">PLAJAH ELEVATE · EXECUTIVE ONE-SHEET</span>
                <Chip selected className="text-[10px] uppercase tracking-widest">
                  Colleague Share Edition
                </Chip>
              </div>
              <p className="text-xs text-white/65" style={{ fontFamily: 'var(--font-body)' }}>
                For Nonprofits, Churches &amp; Faith Traditions, and Cultural Institutions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              icon={copiedState === 'BRIEF' ? <Check /> : <Copy />}
              onClick={handleCopyBrief}
            >
              {copiedState === 'BRIEF' ? 'Copied Executive Pitch' : 'Copy Pitch Text'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={copiedState === 'LINK' ? <Check /> : <Share2 />}
              onClick={handleCopyShareLink}
            >
              {copiedState === 'LINK' ? 'Link Copied' : 'Copy Share URL'}
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Printer />}
              iconRight={<ExternalLink />}
              onClick={handleOpenPrintableOneSheet}
            >
              Print / PDF One-Sheet
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Close Executive One-Sheet"
              onClick={onClose}
            >
              <X />
            </IconButton>
          </div>
        </div>

        {/* ── SCROLLABLE ONE-SHEET BODY ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-8 scrollbar-hide">
          {/* 1. HERO STATEMENT */}
          <Surface
            level={3}
            shape="hero"
            className="relative overflow-hidden"
            style={{
              background:
                'radial-gradient(circle at 88% 18%, rgba(255,140,0,0.18) 0%, rgba(212,0,85,0.16) 38%, rgba(107,0,153,0.22) 72%, rgba(2,2,2,0.96) 100%)',
              borderColor: 'var(--pj-border-strong)',
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-8 space-y-3">
                <Eyebrow>ONE CONNECTED HOME · ZERO PLATFORM CUT ON GENEROSITY</Eyebrow>
                <h1
                  className="text-3xl sm:text-5xl font-black tracking-tight leading-[0.98]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Where Broadcast, Generosity &amp;{' '}
                  <span className="pj-text-ember">Volunteer Action</span> Live Together.
                </h1>
                <p
                  className="text-sm sm:text-base text-white/75 leading-relaxed max-w-3xl"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  Most organizations duct-tape 6 to 8 disconnected tools together: one for volunteer shifts,
                  one for stage projection, one for livestreaming, one for donations, one for petitions, and
                  another for member rosters. <strong className="text-white">Plajah Elevate</strong> unites all
                  of them in a single ecosystem — turning every volunteer shift, watch party, and signature
                  into living media, verified credentials, and measurable community impact.
                </p>

                {/* Audience Filter Bar */}
                <div className="pt-2 flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-bold uppercase tracking-widest text-white/50 mr-1"
                    style={{ fontFamily: 'var(--font-label)' }}
                  >
                    Filter One-Sheet Lens:
                  </span>
                  {(
                    [
                      { id: 'ALL', label: 'All 3 Pillars' },
                      { id: 'NONPROFIT', label: 'Nonprofits & Causes' },
                      { id: 'FAITH', label: 'Churches & Faith' },
                      { id: 'CULTURAL', label: 'Cultural & Museums' },
                    ] as { id: AudienceFilter; label: string }[]
                  ).map(tab => (
                    <Button
                      key={tab.id}
                      size="xs"
                      variant={audienceFilter === tab.id ? 'accent' : 'secondary'}
                      onClick={() => setAudienceFilter(tab.id)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 4 Key Proof Metrics */}
              <div className="lg:col-span-4 grid grid-cols-2 gap-3">
                <Surface level={2} padded={false} className="p-4">
                  <div className="text-xs font-extrabold uppercase tracking-widest text-state-success">
                    Plajah Platform Fee
                  </div>
                  <div
                    className="text-3xl font-black text-white mt-1"
                    style={{ fontFamily: 'var(--font-mono-tech)' }}
                  >
                    0%
                  </div>
                  <div className="text-xs text-white/60 mt-0.5">
                    0% Plajah markup · standard Stripe processing only
                  </div>
                </Surface>

                <Surface level={2} padded={false} className="p-4">
                  <div className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">
                    Shift Show-Up Lift
                  </div>
                  <div
                    className="text-3xl font-black text-white mt-1"
                    style={{ fontFamily: 'var(--font-mono-tech)' }}
                  >
                    3-Stage
                  </div>
                  <div className="text-xs text-white/60 mt-0.5">
                    72h Prep · 24h 1-Tap · 1h Pass (No-SMS)
                  </div>
                </Surface>

                <Surface level={2} padded={false} className="p-4">
                  <div className="text-xs font-extrabold uppercase tracking-widest text-brand-cyan">
                    Spoke Licensing
                  </div>
                  <div
                    className="text-3xl font-black text-white mt-1"
                    style={{ fontFamily: 'var(--font-mono-tech)' }}
                  >
                    1-Click
                  </div>
                  <div className="text-xs text-white/60 mt-0.5">
                    Reello + Cinema + Stage Watch Parties
                  </div>
                </Surface>

                <Surface level={2} padded={false} className="p-4">
                  <div className="text-xs font-extrabold uppercase tracking-widest text-brand-lilac">
                    CRM &amp; ChMS Sync
                  </div>
                  <div
                    className="text-3xl font-black text-white mt-1"
                    style={{ fontFamily: 'var(--font-mono-tech)' }}
                  >
                    6 Presets
                  </div>
                  <div className="text-xs text-white/60 mt-0.5">
                    PCO · Breeze · Servant Keeper · VAN · SF
                  </div>
                </Surface>
              </div>
            </div>
          </Surface>

          {/* 2. THE THREE INSTITUTIONAL PILLARS */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <Eyebrow>TAILORED BY INSTITUTION TYPE</Eyebrow>
                <h2
                  className="text-2xl sm:text-3xl font-black tracking-tight"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Built for Nonprofits, Faith Traditions &amp; Cultural Orgs
                </h2>
              </div>
              <p className="text-xs text-white/60">
                Adaptive terminology automatically matches each institution&apos;s culture — never a generic template.
              </p>
            </div>

            <div
              className={`grid grid-cols-1 ${
                visiblePillars.length === 1 ? 'lg:grid-cols-1' : 'lg:grid-cols-3'
              } gap-4`}
            >
              {visiblePillars.map(pillar => {
                const Icon = pillar.icon;
                return (
                  <Surface
                    key={pillar.id}
                    level={2}
                    shape="sheet"
                    className="flex flex-col justify-between gap-5"
                    style={{ borderTop: `3px solid ${pillar.accentVar}` }}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-xs font-extrabold uppercase tracking-widest"
                          style={{ color: pillar.accentVar, fontFamily: 'var(--font-label)' }}
                        >
                          {pillar.badge}
                        </span>
                        <Chip className="text-xs">
                          Tab: {pillar.actionTabName}
                        </Chip>
                      </div>

                      <div className="flex items-start gap-3">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border"
                          style={{
                            borderColor: pillar.accentVar,
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            color: pillar.accentVar,
                          }}
                        >
                          <Icon size={22} />
                        </div>
                        <div>
                          <h3
                            className="text-xl font-black tracking-tight text-white"
                            style={{ fontFamily: 'var(--font-display)' }}
                          >
                            {pillar.title}
                          </h3>
                          <p className="text-xs text-white/65 mt-1 leading-relaxed">
                            {pillar.subtitle}
                          </p>
                        </div>
                      </div>

                      <Surface level={1} padded={false} className="p-3.5">
                        <p className="text-xs italic text-white/85 leading-relaxed">
                          &ldquo;{pillar.signatureQuote}&rdquo;
                        </p>
                      </Surface>

                      <div className="space-y-3">
                        {pillar.capabilities.map((cap, idx) => (
                          <div key={idx} className="flex items-start gap-2.5">
                            <CheckCircle2
                              size={16}
                              className="shrink-0 mt-0.5"
                              style={{ color: pillar.accentVar }}
                            />
                            <div>
                              <div className="text-xs font-bold text-white">{cap.title}</div>
                              <p className="text-xs text-white/65 leading-relaxed mt-0.5">
                                {cap.detail}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      className="pt-3 border-t text-xs text-white/75"
                      style={{ borderColor: 'var(--pj-border)' }}
                    >
                      <strong className="text-brand-orange uppercase tracking-wider text-xs block mb-0.5">
                        Volunteer Retention Edge:
                      </strong>
                      {pillar.volunteerEdge}
                    </div>
                  </Surface>
                );
              })}
            </div>
          </div>

          {/* 3. THE 6 CLOSED VOLUNTEER & ACTION GAPS (ONLY POSSIBLE ON PLAJAH) */}
          <div className="space-y-4">
            <div>
              <Eyebrow>CLOSING THE VOLUNTEER &amp; ACTION GAP</Eyebrow>
              <h2
                className="text-2xl sm:text-3xl font-black tracking-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Six Capabilities Standalone Volunteer Platforms Can&apos;t Match
              </h2>
              <p className="text-xs sm:text-sm text-white/65 mt-1">
                Because Plajah natively houses your audio (<b className="text-white">Chora</b>), film &amp;
                broadcast (<b className="text-white">Cinema &amp; Reello</b>), sanctuary stage (
                <b className="text-white">Stage</b>), publishing (<b className="text-white">Lorea &amp; Tela</b>),
                mail (<b className="text-white">Post Man</b>), and AI co-director (<b className="text-white">ARIA</b>),
                volunteer action is woven directly into your cultural and spiritual output.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {SIX_CLOSED_GAPS.map(gap => {
                const Icon = gap.icon;
                return (
                  <Surface key={gap.code} level={2} shape="card" className="flex flex-col justify-between gap-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-xs font-extrabold uppercase tracking-widest"
                          style={{ color: gap.accent, fontFamily: 'var(--font-mono-tech)' }}
                        >
                          [{gap.code}] · {gap.tag}
                        </span>
                        <Icon size={18} style={{ color: gap.accent }} />
                      </div>
                      <h3
                        className="text-lg font-black tracking-tight text-white"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {gap.title}
                      </h3>
                      <p className="text-xs text-white/70 leading-relaxed">{gap.summary}</p>
                    </div>

                    <Surface level={1} padded={false} className="p-3">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-brand-orange">
                        Only on Plajah:
                      </div>
                      <p className="text-xs text-white/80 mt-0.5 leading-relaxed">
                        {gap.plajahExclusive}
                      </p>
                    </Surface>
                  </Surface>
                );
              })}
            </div>
          </div>

          {/* 4. STACK CONSOLIDATION COMPARISON TABLE */}
          <Surface level={2} shape="sheet" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <Eyebrow>STACK CONSOLIDATION &amp; COST SAVINGS</Eyebrow>
                <h2
                  className="text-2xl font-black tracking-tight"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Replace 6+ Disconnected Subscriptions with Plajah Elevate
                </h2>
              </div>
              <Chip selected className="text-xs">
                Single Sign-On · Single Member ID · Unified Ledger
              </Chip>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="border-b text-xs font-extrabold uppercase tracking-wider text-white/55"
                    style={{ borderColor: 'var(--pj-border-strong)' }}
                  >
                    <th className="py-3 pr-4">Operational Need</th>
                    <th className="py-3 px-4">Legacy Fragmented Stack</th>
                    <th className="py-3 pl-4 text-brand-orange">Plajah Elevate Unified Native</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs" style={{ borderColor: 'var(--pj-border)' }}>
                  {STACK_CONSOLIDATION_ROWS.map((row, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--pj-border)' }}>
                      <td className="py-3 pr-4 font-bold text-white">{row.category}</td>
                      <td className="py-3 px-4 text-white/55">{row.legacyTools}</td>
                      <td className="py-3 pl-4 font-semibold text-state-success">
                        {row.plajahElevate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>

          {/* 5. CROSS-VERTICAL ARCHITECTURE (ACADEMIA, CLUBS, BUSINESS) */}
          <Surface level={2} shape="sheet" className="space-y-4">
            <div>
              <Eyebrow>ONE ENGINE ACROSS EVERY PLAJAH VERTICAL</Eyebrow>
              <h2
                className="text-2xl font-black tracking-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                How the Same Action &amp; Shifts Primitives Power Academia, Clubs &amp; Brands
              </h2>
              <p className="text-xs text-white/65 mt-1">
                Colleagues running university departments, fan clubs, or brand ambassador programs use the
                exact same underlying engine — automatically adapted to their vertical vocabulary.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {CROSS_VERTICAL_MATRIX.map(item => (
                <Surface key={item.vertical} level={1} padded={false} className="p-4 space-y-2.5">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">
                      {item.sub}
                    </div>
                    <h3
                      className="text-base font-black text-white mt-0.5"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {item.vertical}
                    </h3>
                    <div className="text-xs text-brand-lilac font-semibold mt-0.5">
                      UI Tab: &ldquo;{item.tabLabel}&rdquo;
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-white/75 pt-1 border-t" style={{ borderColor: 'var(--pj-border)' }}>
                    <div>
                      <b className="text-white">Shifts:</b> {item.shiftsUse}
                    </div>
                    <div>
                      <b className="text-white">Chapters:</b> {item.spokesUse}
                    </div>
                    <div>
                      <b className="text-white">Pledges:</b> {item.petitionsUse}
                    </div>
                    <div>
                      <b className="text-white">Unlocks:</b> {item.passportUse}
                    </div>
                  </div>
                </Surface>
              ))}
            </div>
          </Surface>
        </div>

        {/* ── FOOTER ACTIONS (Plajah DS canonical <Actions>) ── */}
        <div
          className="px-5 sm:px-8 py-4 border-t shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            borderColor: 'var(--pj-border-strong)',
            background: 'rgba(12, 6, 22, 0.94)',
          }}
        >
          <div className="text-xs text-white/60">
            Ready to share with boards, pastors, executive directors, or curatorial colleagues.
          </div>
          <Actions>
            <Button size="md" variant="ghost" onClick={onClose}>
              Close
            </Button>
            {onExploreDemo && (
              <Button
                size="md"
                variant="secondary"
                icon={<Sparkles />}
                onClick={() => {
                  onClose();
                  onExploreDemo();
                }}
              >
                Open Live Interactive Demo
              </Button>
            )}
            {onCreateOrg && (
              <Button
                size="md"
                variant="accent"
                icon={<Zap />}
                onClick={() => {
                  onClose();
                  onCreateOrg();
                }}
              >
                Launch Your Organization
              </Button>
            )}
          </Actions>
        </div>
      </Surface>
    </div>
  );
};

export default ElevateOneSheetModal;
