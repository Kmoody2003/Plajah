// components/elevate/ElevateTypeTabs.tsx
// The Elevate landing's per-audience tabs: an Overview explainer plus one tab per kind of
// organization (church, other faith communities, nonprofits, charities, cultural institutions).
// The church tab keeps the Stage/Grace Chapel tour that lives in PlajahElevate itself; every other
// tab is rendered here from ELEVATE_TABS. Copy only names features Elevate actually ships — the
// departments listed per type are the ones services/elevateTemplates.ts seeds at launch.
import React from 'react';
import {
  Landmark, Church, HeartHandshake, Globe, Heart, LayoutGrid, Users, KeyRound, Gift, Wallet,
  MonitorPlay, Calendar, MessagesSquare, ShoppingBag, BookOpen, FileText, ShieldCheck, Megaphone,
  Palette, Receipt, Upload, ArrowRight, Plus, HandHeart, Radio, GraduationCap, CheckCircle2,
} from 'lucide-react';

export type ElevateTabKey = 'overview' | 'church' | 'faith' | 'nonprofit' | 'charity' | 'cultural';

type Icon = React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>;

interface Feature { icon: Icon; title: string; desc: string }
interface Moment { when: string; title: string; desc: string }

export interface ElevateTabDef {
  key: ElevateTabKey;
  label: string;
  short: string;
  icon: Icon;
  accent: string;
  /** Directory section key in PlajahElevate (spiritual / religious / nonprofit / cultural). */
  directoryKey: string | 'all';
  examples?: string;
  eyebrow?: string;
  headline?: React.ReactNode;
  sub?: string;
  leaderTitle?: string;
  departments?: string[];
  features?: Feature[];
  moments?: Moment[];
  ctaTitle?: string;
  ctaSub?: string;
}

export const ELEVATE_TABS: ElevateTabDef[] = [
  { key: 'overview', label: 'Overview', short: 'Overview', icon: LayoutGrid, accent: '#D40055', directoryKey: 'all' },
  {
    key: 'church', label: 'Churches', short: 'Churches', icon: Church, accent: '#8B5CF6', directoryKey: 'spiritual',
    examples: 'Congregations, parishes, ministries and church plants',
  },
  {
    key: 'faith', label: 'Faith communities', short: 'Faith', icon: Globe, accent: '#00DAF3', directoryKey: 'religious',
    examples: 'Mosques, synagogues, temples, gurdwaras and fellowships',
    eyebrow: 'Elevate for faith communities',
    headline: <>Your tradition, your words, <span style={{ color: '#00DAF3' }}>one home</span> for the community.</>,
    sub: 'The same operational stack churches use — members, giving, departments, live services — with your own names for everything. Elevate never puts church vocabulary on a mosque, synagogue or temple.',
    leaderTitle: 'Senior leader',
    departments: ['Finance', 'Media', 'Education', 'Music', 'Hospitality', 'Youth', 'Women', 'Men', 'Seniors', 'Outreach', 'Prayer team'],
    features: [
      { icon: BookOpen, title: 'Sacred Library', desc: 'World faith texts with audio narration and study notes, open to every member from the community page.' },
      { icon: MonitorPlay, title: 'Stage for services', desc: 'Readings, translations, announcements and lower-thirds on your screens, streamed live to members at home.' },
      { icon: Gift, title: 'Designated giving', desc: 'Name your own funds — general, building, education, relief. 0% Plajah platform fee; standard Stripe processing applies.' },
      { icon: Users, title: 'Departments you rename', desc: 'Every department gets its own chat room, roster and feed. Rename, add or remove any of them to match how you are organized.' },
      { icon: KeyRound, title: 'Member seats & claim', desc: 'Import your roster; members claim their seat with a member ID, join link or QR card.' },
      { icon: GraduationCap, title: 'Classes & study', desc: 'Weekend school, study circles and youth classes with schedules, rosters and shared materials.' },
    ],
    moments: [
      { when: 'Before the service', title: 'Readings queued on Stage', desc: 'Volunteers load the readings and translations; the screens and the livestream follow the same cue.' },
      { when: 'During the week', title: 'Classes and committees', desc: 'Each class or committee works in its own room — posts, files and a roster that stays private.' },
      { when: 'Month end', title: 'Clean books for the board', desc: 'Fund balances, approvals and giving statements in the Finance Hub, ready for your treasurer.' },
    ],
    ctaTitle: 'Bring your community onto Elevate',
    ctaSub: 'Choose “Religious” when you launch, name your community type, and rename departments to fit your tradition.',
  },
  {
    key: 'nonprofit', label: 'Nonprofits', short: 'Nonprofits', icon: HeartHandshake, accent: '#06D6A0', directoryKey: 'nonprofit',
    examples: 'Community organizations, foundations, associations and service agencies',
    eyebrow: 'Elevate for nonprofits',
    headline: <>Run programs, people and money <span style={{ color: '#06D6A0' }}>in one place.</span></>,
    sub: 'Staff, board, volunteers and the people you serve each get the right door. Programs have their own spaces, volunteers sign up for shifts, and the books stay audit-ready.',
    leaderTitle: 'Executive Director',
    departments: ['Finance', 'Communications', 'Programs', 'Fundraising', 'Volunteers'],
    features: [
      { icon: Calendar, title: 'Volunteer shifts', desc: 'Capacity-capped shifts with automatic waitlist promotion, QR check-in and 72h · 24h · 1h reminders by push and email.' },
      { icon: Users, title: 'Program spaces', desc: 'Every program gets a public or private page, roster, chat room and feed — so the food pantry and the tutoring program don’t share one inbox.' },
      { icon: Wallet, title: 'Finance Hub', desc: 'Dual-signature spending approvals, receipts, reconciliation and an audit trail your board and auditor can follow.' },
      { icon: Gift, title: 'Donations & funds', desc: 'Designated funds with 0% Plajah platform fee (Stripe processing applies), instant receipts and year-end statements.' },
      { icon: Upload, title: 'Roster & payroll import', desc: 'Bring members and staff from a spreadsheet or your CRM; pre-provisioned seats are claimed with a join link or QR.' },
      { icon: Radio, title: 'Live & on-demand', desc: 'Stream town halls, trainings and events; recordings stay on your page for anyone who missed them.' },
    ],
    moments: [
      { when: 'Monday', title: 'Shifts filled for the week', desc: 'Volunteers pick shifts from the program page; full shifts roll to a waitlist automatically.' },
      { when: 'Board meeting', title: 'Numbers without the scramble', desc: 'Approved spending, fund balances and receipts come straight from the Finance Hub.' },
      { when: 'Any day', title: 'Staff and board in their own rooms', desc: 'Internal departments stay internal; programs can open their feed to followers.' },
    ],
    ctaTitle: 'Launch your nonprofit on Elevate',
    ctaSub: 'Programs, Fundraising, Volunteers, Communications and Finance are set up for you. Free to launch.',
  },
  {
    key: 'charity', label: 'Charities', short: 'Charities', icon: Heart, accent: '#FF5C8A', directoryKey: 'nonprofit',
    examples: 'Relief funds, food banks, mutual aid and grant-making charities',
    eyebrow: 'Elevate for charities',
    headline: <>Every gift goes where <span style={{ color: '#FF5C8A' }}>the donor meant it.</span></>,
    sub: 'Campaigns people can share, receipts that arrive instantly, and restricted funds that can’t be spent on the wrong thing. Donors see the cause; your treasurer sees a clean ledger.',
    leaderTitle: 'Executive Director',
    departments: ['Finance', 'Communications', 'Programs', 'Fundraising', 'Volunteers'],
    features: [
      { icon: Megaphone, title: 'Campaigns & causes', desc: 'Publish fundraisers to the Plajah Charity hub and your own page, with goals and progress people can share.' },
      { icon: ShieldCheck, title: 'Restricted-fund guardrail', desc: 'Money given to a restricted fund can only be spent against that fund — the approval desk blocks anything else.' },
      { icon: Receipt, title: 'Receipts & statements', desc: 'Donors get a receipt the moment they give and a PDF giving statement at year end; their history lives in My Giving.' },
      { icon: Gift, title: '0% platform fee', desc: 'Plajah adds no markup on donations. Standard Stripe processing applies, paid straight to your connected account.' },
      { icon: HandHeart, title: 'Pay It Forward', desc: 'Pay-It-Forward drives let neighbors cover needs in your community, right from the Charity hub.' },
      { icon: Calendar, title: 'Volunteers on call', desc: 'Drive days, distributions and sorting shifts with waitlists, QR check-in and reminders.' },
    ],
    moments: [
      { when: 'Campaign launch', title: 'One link, everywhere', desc: 'Share the campaign page; gifts land in the right fund with a receipt in the donor’s inbox.' },
      { when: 'Distribution day', title: 'Volunteers checked in', desc: 'Shift rosters fill from the page and check in by QR at the door.' },
      { when: 'Year end', title: 'Statements in one click', desc: 'Every donor gets a PDF statement; restricted funds reconcile on their own lines.' },
    ],
    ctaTitle: 'Start your charity on Elevate',
    ctaSub: 'Launch as a non-profit, connect Stripe, and open your first campaign. Free to launch.',
  },
  {
    key: 'cultural', label: 'Cultural institutions', short: 'Cultural', icon: Landmark, accent: '#FF8C00', directoryKey: 'cultural',
    examples: 'Museums, cultural centers, heritage societies, theaters and arts organizations',
    eyebrow: 'Elevate for cultural institutions',
    headline: <>Exhibits, members and docents, <span style={{ color: '#FF8C00' }}>all under one roof.</span></>,
    sub: 'Programs and exhibits get pages your public can follow. Members, patrons and docents get a home. Development, store and publications run alongside.',
    leaderTitle: 'Director',
    departments: ['Finance & Development', 'Media & Communications', 'Programs & Exhibits', 'Education', 'Volunteers & Docents'],
    features: [
      { icon: Palette, title: 'Programs & exhibits', desc: 'Each exhibit, season or program gets its own page, feed and followers — a running record of what’s on.' },
      { icon: Users, title: 'Members & patrons', desc: 'Import your membership list; members claim their seat and get updates, events and their own giving history.' },
      { icon: Calendar, title: 'Docents & volunteers', desc: 'Tour and front-desk shifts with waitlists, QR check-in and reminders.' },
      { icon: ShoppingBag, title: 'Store', desc: 'Sell catalogs, prints and merch from your page alongside your programs.' },
      { icon: FileText, title: 'Publications', desc: 'Design programs, catalogs and newsletters in Tela and export press-ready PDFs.' },
      { icon: Radio, title: 'Talks & performances live', desc: 'Stream lectures, openings and performances, with recordings kept on your page.' },
    ],
    moments: [
      { when: 'Opening night', title: 'The exhibit page goes live', desc: 'Followers get the post; the opening talk streams for members who can’t attend.' },
      { when: 'Every weekend', title: 'Docent shifts covered', desc: 'Docents sign up from their room; open slots fill from the waitlist.' },
      { when: 'Annual appeal', title: 'Development in the Finance Hub', desc: 'Designated funds, receipts and approvals sit with Finance & Development.' },
    ],
    ctaTitle: 'Bring your institution onto Elevate',
    ctaSub: 'Choose “Cultural” when you launch — Programs & Exhibits, Education and Docents are set up for you.',
  },
];

export const tabDef = (key: ElevateTabKey) => ELEVATE_TABS.find(t => t.key === key) || ELEVATE_TABS[0];

const OUTFIT: React.CSSProperties = { fontFamily: 'Outfit, sans-serif' };
const BRAND_GRADIENT = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';

/** Sticky tab strip under the Elevate nav bar. */
export const ElevateTabBar: React.FC<{ active: ElevateTabKey; onChange: (k: ElevateTabKey) => void }> = ({ active, onChange }) => (
  <div className="sticky top-14 sm:top-16 z-30 bg-[#0a0612]/90 backdrop-blur-xl border-b border-white/[0.08]">
    <div role="tablist" aria-label="Organization type" className="max-w-6xl mx-auto px-3.5 sm:px-6 flex gap-1 overflow-x-auto no-scrollbar">
      {ELEVATE_TABS.map(t => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`relative shrink-0 flex items-center gap-1.5 h-11 sm:h-12 px-3 sm:px-3.5 text-[12.5px] sm:text-[13px] font-bold transition-colors ${on ? 'text-white' : 'text-white/50 hover:text-white/85'}`}
          >
            <t.icon size={14} style={{ color: on ? t.accent : undefined }} />
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
            {on && <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full" style={{ background: t.accent }} />}
          </button>
        );
      })}
    </div>
  </div>
);

const Eyebrow: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <div className="text-[10px] font-black uppercase tracking-[0.35em] sm:tracking-[0.45em]" style={{ ...OUTFIT, color }}>{children}</div>
);

const FeatureGrid: React.FC<{ features: Feature[]; accent?: string }> = ({ features, accent }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
    {features.map(f => (
      <article key={f.title} className="p-5 sm:p-6 rounded-[24px] border border-white/10 bg-white/[0.03] flex flex-col gap-2.5">
        <span className="w-10 h-10 rounded-2xl grid place-items-center border" style={{ background: `${accent || '#8B5CF6'}1f`, borderColor: `${accent || '#8B5CF6'}55`, color: accent || '#8B5CF6' }}>
          <f.icon size={19} />
        </span>
        <h3 className="font-black text-[17px] tracking-tight text-white" style={OUTFIT}>{f.title}</h3>
        <p className="text-[13.5px] text-white/60 leading-relaxed">{f.desc}</p>
      </article>
    ))}
  </div>
);

/** What every Elevate organization gets, whatever its type. */
const SHARED_FEATURES: Feature[] = [
  { icon: Users, title: 'Departments & rooms', desc: 'Each department, ministry or program gets a chat room, roster and feed — internal or open to followers.' },
  { icon: KeyRound, title: 'Pre-provisioned seats', desc: 'Import your people; they claim their account with a member ID, join link or QR card. You approve who gets in.' },
  { icon: Gift, title: 'Giving with 0% platform fee', desc: 'Designated funds paid straight to your Stripe account. Standard Stripe processing applies — Plajah adds nothing.' },
  { icon: Wallet, title: 'Finance Hub', desc: 'Spending approvals with two signatures, receipts, reconciliation, restricted-fund guardrails and PDF statements.' },
  { icon: Calendar, title: 'Volunteers & shifts', desc: 'Capacity-capped shifts, automatic waitlists, QR check-in and push/email reminders — no SMS fees.' },
  { icon: MonitorPlay, title: 'Stage & live', desc: 'Run your screens from a browser and stream services, talks and events to everyone at home.' },
  { icon: MessagesSquare, title: 'Announcements', desc: 'Posts, push and email to the whole organization or just one department.' },
  { icon: ShoppingBag, title: 'Store', desc: 'Books, merch and catalogs sold from your own page.' },
  { icon: ShieldCheck, title: 'Roles & security', desc: 'Owner, admin, staff and member roles with per-action permissions and an audit trail.' },
];

const STEPS = [
  { n: '1', title: 'Launch', desc: 'Pick your organization type. Departments, a leadership seat and giving funds are set up for you in about two minutes.' },
  { n: '2', title: 'Bring your people', desc: 'Import a roster or spreadsheet. Everyone gets a pre-provisioned seat they claim with a member ID, link or QR.' },
  { n: '3', title: 'Open the doors', desc: 'Connect Stripe for giving, open volunteer shifts, go live, and share your page.' },
];

/** The Overview explainer: who Elevate is for, what every org gets, and how to start. */
export const ElevateOverview: React.FC<{
  onPickTab: (k: ElevateTabKey) => void;
  onCreate: () => void;
  onClaim: () => void;
  counts: Record<string, number>;
  isSignedIn: boolean;
}> = ({ onPickTab, onCreate, onClaim, counts, isSignedIn }) => (
  <div>
    <header className="relative overflow-hidden border-b border-white/[0.08]">
      <div className="pointer-events-none absolute -top-24 right-0 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-40" style={{ background: 'radial-gradient(closest-side,rgba(212,0,85,.35),transparent)' }} />
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <Eyebrow color="#FF8C00">Plajah Elevate · for organizations that serve people</Eyebrow>
        <h1 className="font-black tracking-[-0.045em] leading-[0.94] mt-4 max-w-4xl" style={{ ...OUTFIT, fontSize: 'clamp(34px,6.4vw,80px)' }}>
          One home for the places that <span className="text-[#D40055]">hold a community together.</span>
        </h1>
        <p className="text-white/65 text-[15px] sm:text-[18px] leading-relaxed mt-5 max-w-[58ch]">
          Elevate gives churches, faith communities, nonprofits, charities and cultural institutions a public page,
          a private home for members and staff, giving with no platform fee, and the back office to run it — books, volunteers, rosters and live services.
        </p>
        <div className="flex flex-wrap gap-2.5 sm:gap-3 mt-6 sm:mt-8">
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center gap-2 h-12 px-6 rounded-full text-[13px] font-black tracking-tight text-white hover:-translate-y-0.5 transition-transform"
            style={{ ...OUTFIT, background: BRAND_GRADIENT, boxShadow: '0 10px 30px rgba(212,0,85,.38)' }}
          >
            <Plus size={16} /> {isSignedIn ? 'Launch your organization' : 'Start free'}
          </button>
          <button
            type="button"
            onClick={onClaim}
            className="flex items-center gap-2 h-12 px-6 rounded-full text-[13px] font-black tracking-tight text-white border border-white/20 bg-white/[0.04] hover:border-[#8B5CF6] transition-colors"
            style={OUTFIT}
          >
            <KeyRound size={15} /> I have a member ID
          </button>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6 text-[12px] text-white/50">
          {['Free to launch', '0% Plajah fee on giving', 'Import from your current system', 'Works on phone, web and the Windows app'].map(s => (
            <span key={s} className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-[#06D6A0]" /> {s}</span>
          ))}
        </div>
      </div>
    </header>

    {/* Who it's for — each card opens that type's tab */}
    <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-b border-white/[0.08]">
      <Eyebrow color="#FF8C00">Who it’s for</Eyebrow>
      <h2 className="font-black tracking-[-0.035em] leading-[0.98] mt-3 max-w-2xl" style={{ ...OUTFIT, fontSize: 'clamp(28px,4.4vw,48px)' }}>
        Pick your kind of organization.
      </h2>
      <p className="text-white/55 text-[14px] sm:text-[15px] mt-3 max-w-[60ch]">Each one launches with its own departments, leadership titles and wording. Open a tab to see what yours gets.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-7">
        {ELEVATE_TABS.filter(t => t.key !== 'overview').map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => onPickTab(t.key)}
            className="group text-left p-5 rounded-[24px] border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:-translate-y-1 transition-all flex flex-col gap-3 min-h-[200px]"
            style={{ borderTopColor: t.accent, borderTopWidth: 3 }}
          >
            <span className="w-10 h-10 rounded-2xl grid place-items-center" style={{ background: `${t.accent}22`, color: t.accent }}><t.icon size={19} /></span>
            <span className="font-black text-[17px] text-white tracking-tight" style={OUTFIT}>{t.label}</span>
            <span className="text-[12.5px] text-white/55 leading-snug">{t.examples}</span>
            <span className="mt-auto flex items-center justify-between text-[11px] font-black uppercase tracking-widest" style={{ color: t.accent }}>
              Explore <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
            {t.directoryKey !== 'all' && counts[t.directoryKey] > 0 && t.key !== 'charity' && (
              <span className="text-[10.5px] text-white/40 -mt-1.5">{counts[t.directoryKey]} on Elevate now</span>
            )}
          </button>
        ))}
      </div>
    </section>

    {/* What every org gets */}
    <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-b border-white/[0.08]">
      <Eyebrow color="#06D6A0">Included for every organization</Eyebrow>
      <h2 className="font-black tracking-[-0.035em] leading-[0.98] mt-3 mb-7 max-w-2xl" style={{ ...OUTFIT, fontSize: 'clamp(28px,4.4vw,48px)' }}>
        The front door and the back office.
      </h2>
      <FeatureGrid features={SHARED_FEATURES} accent="#06D6A0" />
    </section>

    {/* Three doors in */}
    <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-b border-white/[0.08]">
      <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-8 lg:gap-12">
        <div>
          <Eyebrow color="#8B5CF6">Three doors, one organization</Eyebrow>
          <h2 className="font-black tracking-[-0.035em] leading-[0.98] mt-3" style={{ ...OUTFIT, fontSize: 'clamp(26px,3.8vw,42px)' }}>
            Everyone lands in the right place.
          </h2>
          <p className="text-white/55 text-[14px] sm:text-[15px] mt-3 leading-relaxed">
            The public sees your page. Members get their own home. Staff and leaders get the operations desk. Same organization, three views — and nobody sees what they shouldn’t.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { t: 'Public page', d: 'Follow, give, watch live, sign up to volunteer, shop the store.', c: '#FF8C00', i: Globe },
            { t: 'Member home', d: 'Your departments, schedule, giving history, chat and announcements.', c: '#8B5CF6', i: Users },
            { t: 'Staff & leaders', d: 'Rosters, approvals, finance, shifts, Stage and settings.', c: '#06D6A0', i: ShieldCheck },
          ].map(x => (
            <div key={x.t} className="p-5 rounded-[22px] border border-white/10 bg-white/[0.03]">
              <x.i size={18} style={{ color: x.c }} />
              <div className="font-black text-[15px] mt-3" style={OUTFIT}>{x.t}</div>
              <div className="text-[12.5px] text-white/55 mt-1 leading-snug">{x.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* How to start */}
    <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-b border-white/[0.08]">
      <Eyebrow color="#FF8C00">Getting started</Eyebrow>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-6">
        {STEPS.map(s => (
          <div key={s.n} className="p-6 rounded-[24px] border border-white/10 bg-white/[0.03]">
            <span className="w-9 h-9 rounded-full grid place-items-center text-[15px] font-black text-white" style={{ ...OUTFIT, background: BRAND_GRADIENT }}>{s.n}</span>
            <div className="font-black text-[19px] mt-4 tracking-tight" style={OUTFIT}>{s.title}</div>
            <p className="text-[13.5px] text-white/60 mt-1.5 leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  </div>
);

/** One organization-type tab (everything except Overview and Churches). */
export const ElevateTypePanel: React.FC<{
  tab: ElevateTabDef;
  onCreate: () => void;
  onClaim: () => void;
  extraAction?: { label: string; onClick: () => void };
  isSignedIn: boolean;
}> = ({ tab, onCreate, onClaim, extraAction, isSignedIn }) => (
  <div>
    <header className="relative overflow-hidden border-b border-white/[0.08]">
      <div className="pointer-events-none absolute -top-24 right-0 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-35" style={{ background: `radial-gradient(closest-side,${tab.accent}55,transparent)` }} />
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-12 items-center">
        <div>
          <Eyebrow color={tab.accent}>{tab.eyebrow}</Eyebrow>
          <h1 className="font-black tracking-[-0.045em] leading-[0.95] mt-4" style={{ ...OUTFIT, fontSize: 'clamp(32px,5.6vw,68px)' }}>{tab.headline}</h1>
          <p className="text-white/65 text-[15px] sm:text-[17px] leading-relaxed mt-5 max-w-[54ch]">{tab.sub}</p>
          <div className="flex flex-wrap gap-2.5 mt-6 sm:mt-7">
            <button
              type="button"
              onClick={onCreate}
              className="flex items-center gap-2 h-12 px-6 rounded-full text-[13px] font-black tracking-tight text-black hover:-translate-y-0.5 transition-transform"
              style={{ ...OUTFIT, background: tab.accent }}
            >
              <Plus size={16} /> {isSignedIn ? 'Launch yours' : 'Start free'}
            </button>
            <button type="button" onClick={onClaim} className="flex items-center gap-2 h-12 px-6 rounded-full text-[13px] font-black tracking-tight text-white border border-white/20 bg-white/[0.04] hover:bg-white/[0.08] transition-colors" style={OUTFIT}>
              <KeyRound size={15} /> Claim member ID
            </button>
            {extraAction && (
              <button type="button" onClick={extraAction.onClick} className="flex items-center gap-2 h-12 px-5 rounded-full text-[13px] font-bold text-white/75 hover:text-white transition-colors" style={OUTFIT}>
                {extraAction.label} <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* What launches with it */}
        <aside className="rounded-[26px] border p-5 sm:p-6" style={{ borderColor: `${tab.accent}44`, background: `linear-gradient(160deg, ${tab.accent}1c, rgba(15,6,28,0.92))` }}>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50" style={OUTFIT}>Set up for you at launch</div>
          <div className="mt-4 flex items-center gap-3 p-3 rounded-2xl bg-black/30 border border-white/10">
            <span className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: `${tab.accent}33`, color: tab.accent }}><ShieldCheck size={17} /></span>
            <div>
              <div className="text-[13px] font-bold text-white">{tab.leaderTitle}</div>
              <div className="text-[11.5px] text-white/50">Leadership seat for whoever launches it</div>
            </div>
          </div>
          <div className="mt-4 text-[11px] font-bold text-white/45">Departments</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tab.departments?.map(d => (
              <span key={d} className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold text-white/80 bg-white/[0.06] border border-white/10">{d}</span>
            ))}
          </div>
          <p className="text-[11.5px] text-white/45 mt-4 leading-relaxed">Rename, add or remove any department after launch. Each one gets its own room, roster and feed.</p>
        </aside>
      </div>
    </header>

    <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-b border-white/[0.08]">
      <Eyebrow color={tab.accent}>What you get</Eyebrow>
      <h2 className="font-black tracking-[-0.035em] leading-[0.98] mt-3 mb-7 max-w-2xl" style={{ ...OUTFIT, fontSize: 'clamp(26px,4vw,44px)' }}>
        Built for {tab.label.toLowerCase()}.
      </h2>
      <FeatureGrid features={tab.features || []} accent={tab.accent} />
    </section>

    <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-b border-white/[0.08]">
      <Eyebrow color={tab.accent}>How it plays out</Eyebrow>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-6">
        {tab.moments?.map(m => (
          <div key={m.title} className="p-6 rounded-[24px] border border-white/10 bg-white/[0.03]">
            <div className="text-[10.5px] font-mono uppercase tracking-[0.2em]" style={{ color: tab.accent }}>{m.when}</div>
            <div className="font-black text-[18px] mt-2.5 tracking-tight" style={OUTFIT}>{m.title}</div>
            <p className="text-[13.5px] text-white/60 mt-1.5 leading-relaxed">{m.desc}</p>
          </div>
        ))}
      </div>
    </section>
  </div>
);

/** Closing call-to-action, tinted per tab. */
export const ElevateTabCta: React.FC<{ tab: ElevateTabDef; onCreate: () => void; secondary?: { label: string; onClick: () => void } }> = ({ tab, onCreate, secondary }) => (
  <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 pb-12 sm:pb-20">
    <div
      className="relative overflow-hidden rounded-[32px] border border-white/15 px-6 sm:px-10 py-12 sm:py-14 text-center text-white"
      style={{ background: `linear-gradient(135deg,${tab.accent}40,rgba(212,0,85,.16) 55%,rgba(255,140,0,.12))` }}
    >
      <h2 className="relative font-black leading-[0.95] tracking-[-0.03em]" style={{ ...OUTFIT, fontSize: 'clamp(28px,4.6vw,52px)' }}>{tab.ctaTitle}</h2>
      <p className="relative text-white/70 text-[15px] sm:text-[16px] mt-4 max-w-xl mx-auto leading-relaxed">{tab.ctaSub}</p>
      <div className="relative mt-7 flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-2.5 h-13 px-7 py-3.5 rounded-full text-[15px] font-black tracking-tight text-white hover:-translate-y-0.5 transition-transform"
          style={{ ...OUTFIT, background: BRAND_GRADIENT, boxShadow: '0 10px 34px rgba(212,0,85,.38)' }}
        >
          <ArrowRight size={18} /> Launch your organization
        </button>
        {secondary && (
          <button type="button" onClick={secondary.onClick} className="flex items-center gap-2 px-7 py-3.5 rounded-full text-[15px] font-black tracking-tight bg-white/[0.06] border border-white/15 text-white hover:bg-white/10 transition-colors" style={OUTFIT}>
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  </section>
);


