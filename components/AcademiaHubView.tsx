'use client';
import React, { useState, useMemo } from 'react';

/**
 * AcademiaHubView — the Academia course-directory LANDING (the page before you enter a course).
 * Ledger × Marquee hybrid: cinematic live-class marquee + featured spotlight on top, the honest
 * mastery/PISA momentum console in the middle, catalog rails below. Role (student/teacher/parent/
 * life) derives from accountType but can be toggled to preview. Demo Quests are intentionally NOT
 * in the catalog — they live per-subject and on the student dashboard's Quest section.
 *
 * Design ported 1:1 from the verified artifact (Academia Hub). Uses a scoped <style> block so the
 * Plajah tokens/CSS carry over exactly; brand triad matches styles/plajah-ds.css.
 */

type Role = 'student' | 'teacher' | 'parent' | 'life';

interface AcademiaHubViewProps {
  profile?: any;
  user?: any;
  onNavigate?: (view: string) => void;
  /** Opens the full functional catalog/grid (ClassroomsView). */
  onBrowseAll?: () => void;
  /** Opens a specific Labs module directly (e.g. 'HUMAN_BODY'). */
  onOpenModule?: (moduleUrl: string) => void;
  onBack?: () => void;
}

function roleFromProfile(p: any): Role {
  const t = p?.accountType;
  if (t === 'TEACHER' || p?.isSchoolAdmin || (p?.teacherVerification && p.teacherVerification !== 'UNVERIFIED')) return 'teacher';
  if (t === 'PARENT') return 'parent';
  if (t === 'STUDENT' || t === 'CHILD' || p?.provisionedByTeacherUid || p?.childState === 'SCHOOL_PROVISIONED') return 'student';
  return 'life'; // regular / adult learners
}

const HUE: Record<string, string> = {
  reading: '#D40055', math: '#3B82F6', science: '#8B5CF6', history: '#FF8C00',
  language: '#06D6A0', art: '#EC4899', music: '#00DAF3',
};
const shade = (hex: string) => {
  if (hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * 0.5)},${Math.round(((n >> 8) & 255) * 0.45)},${Math.round((n & 255) * 0.7)})`;
};
const gr = (c: string) => `linear-gradient(135deg,${c},${shade(c)})`;
const col = (h: string) => HUE[h] || h;

const SUBJECTS = [
  { id: 'reading', ico: '📖', name: 'Reading & Literacy', blurb: 'Decoding to close reading.' },
  { id: 'math', ico: '📐', name: 'Mathematics', blurb: 'Number sense to trig.' },
  { id: 'science', ico: '🔬', name: 'Science', blurb: 'Observe, model, explain.' },
  { id: 'history', ico: '🏛️', name: 'History & Civics', blurb: 'Sources & timelines.' },
  { id: 'language', ico: '🗣️', name: 'World Languages', blurb: 'CEFR-benchmarked.' },
  { id: 'art', ico: '🎨', name: 'Art & Design', blurb: 'Studio practice.' },
  { id: 'music', ico: '🎵', name: 'Music', blurb: 'Theory & production.' },
];

// Each subject routes into a real functional surface where its courses / modules / Quest live.
const SUBJECT_NAV: Record<string, string> = {
  reading: 'READING_QUEST', math: 'MATH_CLASSROOM', science: 'SCIENCE_QUEST',
  history: 'HISTORY_QUEST', language: 'LANGUAGE_QUEST', art: 'ART_GALLERY', music: 'MUSIC',
};

const RAILS = [
  {
    key: 'core', title: 'Core academics', sub: 'Standards-aligned · free textbooks', cards: [
      { t: 'Algebra & Trigonometry', prov: 'OpenStax', kind: '📐', hue: 'math', badge: 'Free textbook', meta: ['G8–12', 'CCSS'], enrolled: true },
      { t: 'Physics', prov: 'OpenStax', kind: '⚛️', hue: 'science', badge: 'Free textbook', meta: ['HS', 'NGSS'] },
      { t: 'Reading Foundations', prov: 'Plajah', kind: '📖', hue: 'reading', badge: 'Academic', meta: ['PreK–G7', 'Ledger'], enrolled: true },
      { t: 'World History: Sources', prov: 'Plajah', kind: '🏛️', hue: 'history', badge: 'Academic', meta: ['G6–12', 'DBQ'] },
      { t: 'Biology for AP', prov: 'OpenStax', kind: '🧬', hue: 'science', badge: 'Free textbook', meta: ['AP', 'CC'] },
      { t: 'Spanish A1 → A2', prov: 'Plajah', kind: '🗣️', hue: 'language', badge: 'CEFR', meta: ['Beginner'], enrolled: true },
    ]
  },
  {
    key: 'creative', title: 'Taught by creators', sub: 'Masterclasses — portfolio, not just theory', cards: [
      { t: 'Beat Making in Melos', prov: 'Kenne', kind: '🎛️', hue: 'music', badge: 'Masterclass', meta: ['All levels'] },
      { t: 'Intro to Film Editing', prov: 'Fabula', kind: '🎬', hue: 'art', badge: 'Masterclass', meta: ['Portfolio'] },
      { t: 'Songwriting in Chora', prov: 'Guest', kind: '🎼', hue: 'music', badge: 'Masterclass', meta: ['Release'] },
      { t: 'Digital Illustration', prov: 'Studio', kind: '🖌️', hue: 'art', badge: 'Masterclass', meta: ['Studio'] },
      { t: 'Photography Basics', prov: 'Reello', kind: '📷', hue: 'history', badge: 'Masterclass', meta: ['Field'] },
    ]
  },
  {
    key: 'module', title: 'Interactive Labs modules', sub: 'Explore, simulate, build', cards: [
      { t: 'The Human Body', prov: 'Museion', kind: '🫀', hue: 'science', badge: '3D module', meta: ['Systems'], nav: 'HUMAN_BODY' },
      { t: 'The Solar System', prov: 'Museion', kind: '🪐', hue: 'science', badge: 'Sim', meta: ['Orbit'], nav: 'SOLAR_SYSTEM' },
      { t: 'Plant Biology', prov: 'Museion', kind: '🌱', hue: 'language', badge: '3D module', meta: ['Anatomy'], nav: 'PLANT_BIOLOGY' },
      { t: 'Architecture in Time', prov: 'Museion', kind: '🏗️', hue: 'history', badge: 'Tour', meta: ['3D'], nav: 'ARCHITECTURE' },
    ]
  },
];

interface RoleData {
  eyebrow: string; headline: React.ReactNode; sub: string;
  actions: [string, string, string?][]; // [cls, label, navTarget?]
  onair: string;
  tiles: { hue: string; ico: string; live: string; kicker: string; t: string; s: string; cap: string }[];
  kpis: { l: string; v: string; s: string; hue: string; ico: string; sp: number[] }[];
  focus: { kick: string; h: string; p: string; std: string; cta: [string, string] };
  bentoTitle: string; bentoSub: string; showMastery: boolean;
  feature: { chips: string[]; hot: string; ico: string; hue: string; title: string; desc: string; facts: [string, string][]; actions: [string, string][] };
  mastery: Record<string, number>; enrolledLabel: boolean;
  credTitle: string; credBody: string; credCta: string;
}

const ROLES: Record<Role, RoleData> = {
  student: {
    eyebrow: 'Your hub · today', headline: <>Class is<br /><span className="g">in session.</span></>,
    sub: 'Live now up top, your record just below. Two checks from Turbo Reading — and your class is live.',
    actions: [['btn-primary', '▶ Resume Reading', 'READING_QUEST'], ['btn-ghost', 'Today’s Quest', 'READING_QUEST'], ['btn-ghost', 'My Passport', 'LEARNER_LEDGER']],
    onair: 'Happening now',
    tiles: [{ hue: 'reading', ico: '📖', live: 'Live', kicker: 'Your class', t: 'Literacy circle', s: '18 here now', cap: 'Hover to peek · click to join' },
    { hue: 'language', ico: '🗣️', live: 'Live', kicker: 'Study room', t: 'Spanish practice', s: 'Peer · review due', cap: 'Hover to peek' }],
    kpis: [{ l: 'Streak', v: '12', s: 'best 18', hue: '#FF8C00', ico: '🔥', sp: [4, 6, 5, 7, 8, 9, 11, 12] }, { l: 'Mastery', v: '78%', s: '+6 wk', hue: '#06D6A0', ico: '📈', sp: [60, 63, 66, 68, 70, 74, 76, 78] }, { l: 'Standards', v: '41', s: '4 subjects', hue: '#8B5CF6', ico: '✅', sp: [30, 32, 34, 36, 37, 39, 40, 41] }, { l: 'Badges', v: '5', s: 'verifiable', hue: '#00DAF3', ico: '🏅', sp: [1, 2, 2, 3, 4, 4, 5, 5] }],
    focus: { kick: '🎯 Closest to done', h: '2 standards from Turbo Reading', p: 'Finish Author’s Craft + one close-reading check and the acceleration track opens.', std: 'CCSS.ELA-LITERACY.RL.6.5 · 82%', cta: ['btn-accent', 'Unlock the last two →'] },
    bentoTitle: 'Your subjects', bentoSub: 'Each subject holds its courses, modules and its Quest — Quests live here and on your dashboard, not in the catalog.', showMastery: true,
    feature: { chips: ['Continue', 'Reading'], hot: '2 to Turbo', ico: '📖', hue: 'reading', title: 'Author’s Craft', desc: 'You’re 82% through the unit that opens Turbo Reading. Deeper, not just faster.', facts: [['82%', 'Complete'], ['Lvl 4', 'PISA'], ['+6', 'This week']], actions: [['btn-accent', 'Resume unit →'], ['btn-ghost', 'What unlocks']] },
    mastery: { reading: 82, math: 55, science: 66, history: 60, language: 48, art: 35, music: 40 }, enrolledLabel: true,
    credTitle: 'Everything you learn, provably yours', credBody: 'A portable, verifiable academic record — anchored like a passport, exportable as Open Badges 3.0.', credCta: 'Open my Academic Passport →',
  },
  teacher: {
    eyebrow: 'Your hub · live class', headline: <>Your class,<br /><span className="g">on the marquee.</span></>,
    sub: 'The room you’re teaching up top, your class’s live mastery just below. Plan from what they actually know.',
    actions: [['btn-primary', 'Plan from mastery', 'TEACHER_TOOLS'], ['btn-ghost', 'Gradebook', 'TEACHER_TOOLS'], ['btn-ghost', '+ New class', 'CLASSROOMS']],
    onair: 'Your room · live',
    tiles: [{ hue: 'math', ico: '🍎', live: 'Live', kicker: 'You’re teaching', t: 'Room 4B · Maths', s: '24 present · 2 to grade', cap: 'Hover to preview the room' },
    { hue: 'science', ico: '🔬', live: 'Queued', kicker: 'Assigned', t: 'Science check', s: 'Auto-grades to ledger', cap: 'Hover to preview' }],
    kpis: [{ l: 'Weakest', v: '55%', s: 'fractions', hue: '#EF4444', ico: '🎯', sp: [52, 54, 53, 55, 54, 55, 55, 55] }, { l: 'Turned in', v: '19/24', s: '2 late', hue: '#06D6A0', ico: '📥', sp: [10, 12, 14, 16, 17, 18, 19, 19] }, { l: 'At-risk', v: '2', s: 'evidenced', hue: '#F59E0B', ico: '⚠️', sp: [4, 3, 3, 3, 2, 2, 2, 2] }, { l: 'Apps', v: '5→1', s: 'replaced', hue: '#8B5CF6', ico: '🧩', sp: [5, 5, 4, 3, 3, 2, 1, 1] }],
    focus: { kick: '🎯 Plan-from-mastery', h: 'Fractions is weakest at 55%', p: 'Auto-drafted: Support group of 6, On-Level for 15, Turbo depth for 3 — each pre-loaded + ledger-checked.', std: 'IB PYP · fractions equivalence', cta: ['btn-accent', 'Review the plan →'] },
    bentoTitle: 'Your departments', bentoSub: 'Each subject rolls up to a standards heatmap. Bars are your class’s current mastery.', showMastery: true,
    feature: { chips: ['Plan', 'Maths'], hot: 'Weakest · 55%', ico: '🎯', hue: 'math', title: 'Fractions equivalence', desc: 'Your class’s weakest standard, from real work. The plan is drafted and grouped.', facts: [['55%', 'Mastery'], ['3', 'Groups'], ['19/24', 'In']], actions: [['btn-accent', 'Review plan →'], ['btn-ghost', 'Heatmap']] },
    mastery: { reading: 80, math: 55, science: 66, history: 63, language: 52, art: 44, music: 41 }, enrolledLabel: false,
    credTitle: 'Free for teachers. Always.', credBody: 'Provision students, assign standards-aligned work, push grades to Google Classroom, LTI, OneRoster or QTI.', credCta: 'Set up my classroom →',
  },
  parent: {
    eyebrow: 'Your hub · this week', headline: <>Front-row seat<br /><span className="g">to their week.</span></>,
    sub: 'What’s live in their class up top, their real proficiency just below — and you’re copied on every message.',
    actions: [['btn-primary', 'This week’s summary', 'LEARNER_LEDGER'], ['btn-ghost', 'Message a teacher', 'CHAT'], ['btn-ghost', 'Family settings', 'DASHBOARD']],
    onair: 'Live in their class',
    tiles: [{ hue: 'reading', ico: '📖', live: 'Live', kicker: 'Maya’s class', t: 'Literacy circle', s: 'Ms. Rivera now', cap: 'Hover to see the room' },
    { hue: 'cyan', ico: '✉️', live: 'New', kicker: 'You’re copied on this', t: 'Message from Ms. Rivera', s: 'About Maya', cap: 'Full transparency by design' }],
    kpis: [{ l: 'Active', v: '6/7', s: 'both kids', hue: '#FF8C00', ico: '📅', sp: [4, 5, 5, 6, 6, 6, 6, 6] }, { l: 'Mastery ↑', v: '+9%', s: 'Maya · mo', hue: '#06D6A0', ico: '📈', sp: [62, 64, 66, 68, 70, 72, 76, 78] }, { l: 'Messages', v: '4', s: 'CC’d on all', hue: '#00DAF3', ico: '✉️', sp: [1, 1, 2, 2, 3, 3, 4, 4] }, { l: 'Screen', v: '42m', s: 'in limits', hue: '#8B5CF6', ico: '⏱️', sp: [50, 48, 45, 44, 43, 42, 42, 42] }],
    focus: { kick: '🛡️ Full transparency', h: 'Copied on every message — automatically', p: 'When a teacher messages Maya, you’re on the thread. Children can only message teachers and you.', std: 'Parent CC · verified this week ✓', cta: ['btn-ghost', 'See the message log →'] },
    bentoTitle: 'What they’re studying', bentoSub: 'Each subject shows your child’s proficiency in plain language.', showMastery: true,
    feature: { chips: ['This week', 'Maya'], hot: 'Thriving', ico: '📖', hue: 'reading', title: 'Maya read at Level 4', desc: 'Above grade, 12-day streak, two new reading standards this week — all from real work.', facts: [['Lvl 4', 'PISA'], ['12', 'Streak'], ['4', 'Msgs CC’d']], actions: [['btn-accent', 'Read summary →'], ['btn-ghost', 'Message log']] },
    mastery: { reading: 78, math: 64, science: 66, history: 60, language: 48, art: 35, music: 40 }, enrolledLabel: false,
    credTitle: 'A record they’ll own for life', credBody: 'Portable and learner-owned. Move, switch schools, or homeschool — their verified proficiency travels with them.', credCta: 'View the family passport →',
  },
  life: {
    eyebrow: 'Your hub · self-paced', headline: <>School’s out.<br /><span className="g">Class never closes.</span></>,
    sub: 'Live workshops up top, your skill record just below. One credential away from Audio Production.',
    actions: [['btn-primary', 'Browse masterclasses', 'CLASSROOMS'], ['btn-ghost', 'Set a goal', 'DASHBOARD'], ['btn-ghost', 'Skill passport', 'LEARNER_LEDGER']],
    onair: 'Live workshops',
    tiles: [{ hue: 'music', ico: '🎛️', live: 'Live', kicker: 'Creator workshop', t: 'Mixing masterclass', s: 'Kenne · live Q&A', cap: 'Hover to peek · click to join' },
    { hue: 'language', ico: '🗣️', live: 'Open', kicker: 'Conversation room', t: 'Spanish B1', s: 'Drop-in · streak 9', cap: 'Hover to peek' }],
    kpis: [{ l: 'This week', v: '2.5h', s: '3 tracks', hue: '#FF8C00', ico: '⏳', sp: [1, 2, 2, 3, 2, 3, 4, 5] }, { l: 'Badges', v: '11', s: 'verifiable', hue: '#00DAF3', ico: '🏅', sp: [6, 7, 8, 9, 9, 10, 11, 11] }, { l: 'Done', v: '23', s: 'lifetime', hue: '#06D6A0', ico: '✅', sp: [15, 17, 18, 19, 20, 21, 22, 23] }, { l: 'Goal', v: '68%', s: 'Spanish B1', hue: '#8B5CF6', ico: '🎯', sp: [40, 45, 50, 55, 60, 63, 66, 68] }],
    focus: { kick: '✦ One credential away', h: '2 lessons unlocks Audio Production', p: 'Finish mixing & mastering in Melos and Academia mints an Open Badge 3.0 — anchored, shareable.', std: 'Creator credential · Audio Production', cta: ['btn-accent', 'Finish the track →'] },
    bentoTitle: 'Learn anything', bentoSub: 'No grade levels — subjects and skills, beginner to university, each writing to the record you own.', showMastery: false,
    feature: { chips: ['One away', 'Audio'], hot: 'Almost minted', ico: '🎛️', hue: 'music', title: 'Audio Production', desc: 'Two lessons from a verifiable credential, cryptographically anchored and shareable to any employer.', facts: [['84%', 'Complete'], ['2', 'Left'], ['11', 'Held']], actions: [['btn-accent', 'Finish →'], ['btn-ghost', 'Preview badge']] },
    mastery: { reading: 20, math: 10, science: 37, history: 15, language: 68, art: 30, music: 84 }, enrolledLabel: true,
    credTitle: 'A CV that verifies itself', credBody: 'Every course, masterclass and skill mints a verifiable credential anchored on-chain — no institution required.', credCta: 'Build my skill passport →',
  },
};

const ROLE_TABS: { id: Role; ico: string; label: string }[] = [
  { id: 'student', ico: '🎒', label: 'Student' },
  { id: 'teacher', ico: '🍎', label: 'Teacher' },
  { id: 'parent', ico: '👪', label: 'Parent' },
  { id: 'life', ico: '✦', label: 'Life Learning' },
];

function waveBars() {
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < 16; i++) bars.push(<i key={i} style={{ animationDelay: `${(i * 0.07).toFixed(2)}s`, height: `${30 + ((i * 37) % 60)}%` }} />);
  return bars;
}

const AcademiaHubView: React.FC<AcademiaHubViewProps> = ({ profile, onNavigate, onBrowseAll, onOpenModule, onBack }) => {
  const [role, setRole] = useState<Role>(() => roleFromProfile(profile));
  const d = ROLES[role];
  const firstName = useMemo(() => (profile?.displayName || profile?.username || '').split(' ')[0] || '', [profile]);
  const nav = (v?: string) => { if (v && onNavigate) onNavigate(v); };

  return (
    <div className="pj-academia-hub">
      <style>{HUB_CSS}</style>

      <div className="topbar"><div className="wrap">
        <button className="back" onClick={onBack}>← Academia</button>
        <div className="mark"><span className="dot">🎓</span>Plajah<small>Academia · Hub</small></div>
        <div className="spacer" />
        <div className="roleswitch" role="tablist" aria-label="Choose your view">
          {ROLE_TABS.map(rt => (
            <button key={rt.id} role="tab" aria-selected={role === rt.id} onClick={() => setRole(rt.id)}>
              <span>{rt.ico}</span><span className="lbl">{rt.label}</span>
            </button>
          ))}
        </div>
      </div></div>

      <main className="wrap">
        {/* MARQUEE hero */}
        <section className="marquee">
          <div className="mgrid">
            <div>
              <span className="eyebrow">{d.eyebrow}</span>
              <h1>{firstName && role === 'student' ? <>Welcome back, {firstName}.<br /><span className="g">You’re in session.</span></> : d.headline}</h1>
              <p className="sub">{d.sub}</p>
              <div className="actions">
                {d.actions.map(([cls, label, target], i) => (
                  <button key={i} className={`btn ${cls}`} onClick={() => target ? nav(target) : onBrowseAll?.()}>{label}</button>
                ))}
              </div>
            </div>
            <div className="live-col">
              <div className="onair"><span className="rec" />{d.onair}</div>
              {d.tiles.map((t, i) => {
                const c = col(t.hue);
                return (
                  <div className="tile" key={i}>
                    <div className="thumb" style={{ background: gr(c) }}><span className="live">{t.live}</span>{t.ico}</div>
                    <div className="body"><div className="kicker">{t.kicker}</div><div className="t">{t.t}</div><div className="s">{t.s}</div><div className="wave">{waveBars()}</div></div>
                    <div className="cap">{t.cap}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Ledger console spine */}
          <div className="console">
            <div className="kpis">
              {d.kpis.map((k, i) => {
                const mx = Math.max(...k.sp);
                return (
                  <div className="kpi" key={i}>
                    <div className="top"><span className="l">{k.l}</span><span className="chip" style={{ background: `${k.hue}22`, color: k.hue, boxShadow: `inset 0 0 0 1px ${k.hue}44` }}>{k.ico}</span></div>
                    <div className="val">{k.v}</div><div className="s">{k.s}</div>
                    <div className="spark">{k.sp.map((v, j) => <i key={j} style={{ height: `${Math.max(12, v / mx * 100)}%`, background: k.hue }} />)}</div>
                  </div>
                );
              })}
            </div>
            <div className="focus">
              <span className="kick">{d.focus.kick}</span><h3>{d.focus.h}</h3><p>{d.focus.p}</p>
              <div className="std">{d.focus.std}</div>
              <div className="cta"><button className={`btn ${d.focus.cta[0]}`} onClick={() => nav('LEARNER_LEDGER')}>{d.focus.cta[1]}</button></div>
            </div>
          </div>
        </section>

        {/* SUBJECT BENTO */}
        <section className="block">
          <div className="block-hd"><h2 className="sec-title"><span className="h-bar" />{d.bentoTitle}</h2><p>{d.bentoSub}</p></div>
          <div className="bento">
            {SUBJECTS.map((s, i) => {
              const c = col(s.id); const m = d.mastery[s.id];
              return (
                <div className={`subj${i === 0 ? ' big' : ''}`} key={s.id} onClick={() => nav(SUBJECT_NAV[s.id])} role="button" tabIndex={0}>
                  <div className="top-line" style={{ background: gr(c) }} /><div className="arrow">↗</div>
                  <div className="ico" style={{ background: `${c}22`, color: c, boxShadow: `inset 0 0 0 1px ${c}44` }}>{s.ico}</div>
                  <h3>{s.name}</h3><div className="blurb">{s.blurb}</div>
                  <div className="foot">
                    {d.showMastery
                      ? <><div className="mastered"><i style={{ width: `${m}%`, background: gr(c) }} /></div><span className="tag">{m}%</span></>
                      : <><span className="tag">6 courses</span><span className="tag">9 modules</span></>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* FEATURED */}
        <section className="block">
          <div className="feature">
            <div className="cover" style={{ background: gr(col(d.feature.hue)) }}>{d.feature.ico}<span className="play">▶</span></div>
            <div className="fbody">
              <div className="chiprow">{d.feature.chips.map((c, i) => <span className="fchip2" key={i}>{c}</span>)}<span className="fchip2 hot">{d.feature.hot}</span></div>
              <h3>{d.feature.title}</h3><p>{d.feature.desc}</p>
              <div className="facts">{d.feature.facts.map((x, i) => <div className="f" key={i}><div className="v">{x[0]}</div><div className="l">{x[1]}</div></div>)}</div>
              <div className="fact-actions">{d.feature.actions.map((a, i) => <button key={i} className={`btn ${a[0]}`} onClick={() => nav('LEARNER_LEDGER')}>{a[1]}</button>)}</div>
            </div>
          </div>
        </section>

        {/* RAILS */}
        {RAILS.map(rail => (
          <section className="block" key={rail.key}>
            <div className="rail-hd"><div><h2 className="sec-title">{rail.title}</h2><p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', marginTop: 7 }}>{rail.sub}</p></div><span className="all" onClick={() => onBrowseAll?.()} style={{ cursor: 'pointer' }}>See all →</span></div>
            <div className="rail">
              {rail.cards.map((c: any, i) => {
                const cc = col(c.hue);
                return (
                  <div className="card" key={i} onClick={() => (c.nav && onOpenModule ? onOpenModule(c.nav) : onBrowseAll?.())} role="button" tabIndex={0}>
                    <div className="cover" style={{ background: gr(cc) }}><span className="badge">{c.badge}</span><span className="kind">{c.kind}</span><h4>{c.t}</h4>{d.enrolledLabel && c.enrolled && <span className="enrolled">Enrolled</span>}</div>
                    <div className="cbody"><div className="meta">{c.meta.map((m: string, j: number) => <React.Fragment key={j}>{j > 0 && <span style={{ opacity: .4 }}>·</span>}<span>{m}</span></React.Fragment>)}</div>
                      <div className="prov"><span className="av">{c.prov[0]}</span>{c.prov}</div></div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* CREDENTIAL STRIP */}
        <section>
          <div className="credstrip"><div className="inner">
            <div className="m"><h3>{d.credTitle}</h3><p>{d.credBody}</p>
              <div className="badges"><span>Open Badges 3.0</span><span>W3C Verifiable Credentials</span><span>PISA</span><span>CEFR</span><span>FERPA · COPPA</span></div></div>
            <div><button className="btn btn-primary" onClick={() => nav('LEARNER_LEDGER')}>{d.credCta}</button></div>
          </div></div>
        </section>
        <p className="foot-note">Academia Hub — the cinematic marquee and the honest record in one page. Quests live inside each subject and on your dashboard.</p>
      </main>
    </div>
  );
};

const HUB_CSS = `
.pj-academia-hub{
  --purple:#6B0099;--magenta:#D40055;--orange:#FF8C00;--cyan:#00DAF3;--lilac:#D0BCFF;
  --success:#06D6A0;--warning:#F59E0B;--danger:#EF4444;
  --grad-brand:linear-gradient(135deg,#6B0099,#D40055);
  --grad-warm:linear-gradient(120deg,#6B0099 0%,#D40055 52%,#FF8C00 100%);
  --grad-ember:linear-gradient(135deg,#D40055,#FF8C00);
  --bg:#09070e;--ink:#f6f1f5;--ink-dim:rgba(246,241,245,.65);--ink-faint:rgba(246,241,245,.42);
  --g1:rgba(255,255,255,.04);--g2:rgba(255,255,255,.07);--g3:rgba(255,255,255,.11);
  --bd:rgba(255,255,255,.10);--bd-str:rgba(255,255,255,.17);
  --r-md:16px;--r-lg:24px;--r-xl:28px;--r-2xl:36px;
  --font-d:"Outfit","Space Grotesk",sans-serif;--font-b:"Inter",system-ui,sans-serif;--font-m:"JetBrains Mono",monospace;
  --glow-brand:0 6px 22px rgba(212,0,85,.34);--glow-orange:0 6px 24px rgba(255,140,0,.3);--elev-3:0 14px 34px rgba(0,0,0,.5);
  font-family:var(--font-b);color:var(--ink);background:var(--bg);line-height:1.55;min-height:100%;
  background-image:radial-gradient(110% 70% at 8% -6%,rgba(107,0,153,.36),transparent 52%),radial-gradient(90% 70% at 96% 0%,rgba(212,0,85,.22),transparent 50%),radial-gradient(80% 60% at 60% 118%,rgba(255,140,0,.13),transparent 60%);
}
.pj-academia-hub *{box-sizing:border-box}
.pj-academia-hub .wrap{max-width:1340px;margin:0 auto;padding:0 clamp(16px,4vw,44px)}
.pj-academia-hub .eyebrow{font-family:var(--font-d);font-weight:800;font-size:.68rem;letter-spacing:.28em;text-transform:uppercase;color:var(--ink-faint)}
.pj-academia-hub .sec-title{font-family:var(--font-d);font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.01em;font-size:clamp(1.3rem,3vw,1.85rem);display:flex;align-items:center;gap:12px}
.pj-academia-hub .sec-title::before{content:"";width:6px;height:24px;border-radius:99px;background:var(--grad-warm)}
.pj-academia-hub .h-bar{display:none}
.pj-academia-hub .topbar{position:sticky;top:0;z-index:50;backdrop-filter:blur(22px) saturate(180%);background:color-mix(in srgb,var(--bg) 72%,transparent);border-bottom:1px solid var(--bd)}
.pj-academia-hub .topbar .wrap{display:flex;align-items:center;gap:14px;height:64px}
.pj-academia-hub .back{appearance:none;border:1px solid var(--bd);background:var(--g2);color:var(--ink-dim);cursor:pointer;font-family:var(--font-d);font-weight:700;font-size:.8rem;height:36px;padding:0 14px;border-radius:99px}
.pj-academia-hub .back:hover{background:var(--g3);color:var(--ink)}
.pj-academia-hub .mark{font-family:var(--font-d);font-weight:900;font-size:1.05rem;letter-spacing:-.02em;display:flex;align-items:center;gap:9px}
.pj-academia-hub .mark .dot{width:22px;height:22px;border-radius:7px;background:var(--grad-warm);box-shadow:var(--glow-brand);display:grid;place-items:center;font-size:12px}
.pj-academia-hub .mark small{font-weight:600;font-size:.66rem;letter-spacing:.24em;text-transform:uppercase;color:var(--ink-faint);font-family:var(--font-d)}
.pj-academia-hub .spacer{flex:1}
.pj-academia-hub .roleswitch{display:flex;gap:4px;padding:5px;border-radius:99px;background:var(--g2);border:1px solid var(--bd-str);backdrop-filter:blur(20px)}
.pj-academia-hub .roleswitch button{appearance:none;border:0;background:transparent;color:var(--ink-dim);cursor:pointer;font-family:var(--font-d);font-weight:700;font-size:.78rem;padding:0 14px;height:34px;border-radius:99px;white-space:nowrap;transition:.2s;display:flex;align-items:center;gap:7px}
.pj-academia-hub .roleswitch button[aria-selected="true"]{background:var(--grad-warm);color:#fff;box-shadow:var(--glow-brand)}
.pj-academia-hub .roleswitch button:not([aria-selected="true"]):hover{color:var(--ink);background:var(--g3)}
@media(max-width:820px){.pj-academia-hub .roleswitch button span.lbl{display:none}.pj-academia-hub .roleswitch button{padding:0 12px}.pj-academia-hub .mark small{display:none}}
.pj-academia-hub .btn{appearance:none;border:1px solid transparent;cursor:pointer;font-family:var(--font-d);font-weight:700;height:46px;padding:0 22px;border-radius:99px;font-size:.9rem;display:inline-flex;align-items:center;gap:9px;transition:.18s}
.pj-academia-hub .btn-primary{background-image:var(--grad-warm);color:#fff;box-shadow:var(--glow-brand)}
.pj-academia-hub .btn-primary:hover{filter:brightness(1.1)}
.pj-academia-hub .btn-accent{background:var(--orange);color:#160b02;box-shadow:var(--glow-orange)}
.pj-academia-hub .btn-ghost{background:var(--g2);color:var(--ink);border-color:var(--bd);backdrop-filter:blur(8px)}
.pj-academia-hub .btn-ghost:hover{background:var(--g3);border-color:var(--bd-str)}
.pj-academia-hub .marquee{position:relative;padding:clamp(26px,4vw,44px) 0 10px}
.pj-academia-hub .mgrid{display:grid;gap:22px;grid-template-columns:1fr}
@media(min-width:1020px){.pj-academia-hub .mgrid{grid-template-columns:1.06fr .94fr;align-items:center}}
.pj-academia-hub .marquee h1{font-family:var(--font-d);font-weight:900;font-style:italic;text-transform:uppercase;line-height:.92;letter-spacing:-.02em;font-size:clamp(2.1rem,5.6vw,3.7rem);margin-top:12px;text-wrap:balance}
.pj-academia-hub .marquee h1 .g{background:var(--grad-ember);-webkit-background-clip:text;background-clip:text;color:transparent}
.pj-academia-hub .marquee .sub{color:var(--ink-dim);max-width:48ch;margin-top:14px;font-size:clamp(.98rem,1.4vw,1.1rem)}
.pj-academia-hub .marquee .actions{display:flex;gap:11px;flex-wrap:wrap;margin-top:22px}
.pj-academia-hub .live-col{display:flex;flex-direction:column;gap:12px}
.pj-academia-hub .onair{display:flex;align-items:center;gap:9px;font-family:var(--font-d);font-weight:800;font-size:.68rem;letter-spacing:.18em;text-transform:uppercase;color:var(--orange)}
.pj-academia-hub .onair .rec{width:9px;height:9px;border-radius:99px;background:var(--orange);box-shadow:0 0 10px var(--orange);animation:pjPulse 1.6s infinite}
@keyframes pjPulse{0%,100%{opacity:1}50%{opacity:.35}}
.pj-academia-hub .tile{position:relative;display:flex;overflow:hidden;border-radius:var(--r-lg);border:1px solid var(--bd);background:var(--g1);cursor:pointer;transition:transform .22s,border-color .22s,box-shadow .22s;min-height:108px}
.pj-academia-hub .tile:hover{transform:translateY(-3px);border-color:var(--bd-str);box-shadow:var(--elev-3)}
.pj-academia-hub .tile .thumb{width:124px;flex-shrink:0;position:relative;display:grid;place-items:center;color:#fff;font-size:30px}
.pj-academia-hub .tile .thumb .live{position:absolute;top:8px;left:8px;font-size:.56rem;font-weight:800;font-family:var(--font-d);letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;border-radius:6px;background:rgba(0,0,0,.5);color:#fff;display:flex;align-items:center;gap:5px}
.pj-academia-hub .tile .thumb .live::before{content:"";width:6px;height:6px;border-radius:99px;background:var(--orange);box-shadow:0 0 6px var(--orange)}
.pj-academia-hub .tile .body{padding:13px 15px;flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
.pj-academia-hub .tile .kicker{font-size:.6rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);font-family:var(--font-d)}
.pj-academia-hub .tile .t{font-family:var(--font-d);font-weight:800;font-size:1rem;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pj-academia-hub .tile .s{font-size:.77rem;color:var(--ink-dim);margin-top:2px}
.pj-academia-hub .wave{display:flex;align-items:flex-end;gap:2px;height:15px;margin-top:8px}
.pj-academia-hub .wave i{width:3px;border-radius:2px;background:var(--cyan);opacity:.7;animation:pjBob 1.1s ease-in-out infinite}
.pj-academia-hub .tile:hover .wave i{opacity:1}
@keyframes pjBob{0%,100%{height:30%}50%{height:100%}}
.pj-academia-hub .tile .cap{position:absolute;left:139px;right:14px;bottom:9px;font-size:.68rem;color:var(--cyan);opacity:0;transform:translateY(6px);transition:.25s;font-weight:600}
.pj-academia-hub .tile:hover .cap{opacity:1;transform:translateY(0)}
@media(max-width:520px){.pj-academia-hub .tile .cap{display:none}}
.pj-academia-hub .console{display:grid;gap:14px;grid-template-columns:1fr;margin-top:10px}
@media(min-width:960px){.pj-academia-hub .console{grid-template-columns:1.5fr 1fr}}
.pj-academia-hub .kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
@media(min-width:560px){.pj-academia-hub .kpis{grid-template-columns:repeat(4,1fr)}}
.pj-academia-hub .kpi{position:relative;overflow:hidden;padding:15px;border-radius:var(--r-md);border:1px solid var(--bd);background:var(--g1)}
.pj-academia-hub .kpi .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.pj-academia-hub .kpi .l{font-size:.58rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-faint);font-family:var(--font-d)}
.pj-academia-hub .kpi .chip{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:13px}
.pj-academia-hub .kpi .val{font-family:var(--font-d);font-weight:900;font-size:1.7rem;line-height:1;font-variant-numeric:tabular-nums}
.pj-academia-hub .kpi .s{font-size:.72rem;color:var(--ink-dim);margin-top:5px}
.pj-academia-hub .spark{display:flex;align-items:flex-end;gap:3px;height:22px;margin-top:8px}
.pj-academia-hub .spark i{flex:1;border-radius:2px 2px 0 0;opacity:.85}
.pj-academia-hub .focus{position:relative;overflow:hidden;padding:20px;border-radius:var(--r-lg);border:1px solid var(--bd-str);background:linear-gradient(140deg,rgba(107,0,153,.24),rgba(255,140,0,.08) 70%,transparent)}
.pj-academia-hub .focus .kick{display:inline-flex;align-items:center;gap:8px;font-size:.64rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--orange);font-family:var(--font-d)}
.pj-academia-hub .focus h3{font-family:var(--font-d);font-weight:800;font-size:1.25rem;line-height:1.12;margin:10px 0 7px;letter-spacing:-.01em}
.pj-academia-hub .focus p{color:var(--ink-dim);font-size:.86rem;max-width:42ch}
.pj-academia-hub .focus .std{display:inline-block;margin-top:12px;font-family:var(--font-m);font-size:.7rem;color:var(--ink-dim);background:var(--g2);border:1px solid var(--bd);padding:5px 9px;border-radius:8px}
.pj-academia-hub .focus .cta{margin-top:14px}
.pj-academia-hub .block{padding:32px 0}
.pj-academia-hub .block-hd{margin-bottom:18px}.pj-academia-hub .block-hd p{color:var(--ink-dim);font-size:.9rem;max-width:58ch;margin-top:7px}
.pj-academia-hub .bento{display:grid;gap:13px;grid-template-columns:repeat(2,1fr)}
@media(min-width:820px){.pj-academia-hub .bento{grid-template-columns:repeat(4,1fr)}}
.pj-academia-hub .subj{position:relative;overflow:hidden;border-radius:var(--r-lg);border:1px solid var(--bd);background:var(--g1);padding:16px;min-height:150px;display:flex;flex-direction:column;cursor:pointer;transition:transform .25s,box-shadow .25s,border-color .25s}
.pj-academia-hub .subj:hover{transform:translateY(-5px);box-shadow:var(--elev-3);border-color:var(--bd-str)}
.pj-academia-hub .subj .top-line{position:absolute;inset:0 0 auto 0;height:3px}
.pj-academia-hub .subj.big{grid-column:span 2}
.pj-academia-hub .subj .ico{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:19px;margin-bottom:auto}
.pj-academia-hub .subj h3{font-family:var(--font-d);font-weight:800;font-size:1.05rem;margin-top:12px;letter-spacing:-.01em}
.pj-academia-hub .subj .blurb{font-size:.8rem;color:var(--ink-dim);margin-top:4px}
.pj-academia-hub .subj .foot{display:flex;align-items:center;gap:9px;margin-top:12px;flex-wrap:wrap}
.pj-academia-hub .tag{font-size:.64rem;font-weight:700;font-family:var(--font-d);padding:4px 8px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);color:var(--ink-dim)}
.pj-academia-hub .mastered{height:5px;border-radius:99px;background:var(--g3);overflow:hidden;flex:1;min-width:60px}.pj-academia-hub .mastered i{display:block;height:100%;border-radius:99px}
.pj-academia-hub .subj .arrow{position:absolute;top:16px;right:16px;color:var(--ink-faint);transition:.2s}.pj-academia-hub .subj:hover .arrow{color:var(--ink);transform:translate(2px,-2px)}
.pj-academia-hub .feature{position:relative;overflow:hidden;border-radius:var(--r-2xl);border:1px solid var(--bd-str);display:grid;grid-template-columns:1fr;background:linear-gradient(120deg,rgba(255,255,255,.07),rgba(255,255,255,.02))}
@media(min-width:820px){.pj-academia-hub .feature{grid-template-columns:.85fr 1.15fr}}
.pj-academia-hub .feature .cover{position:relative;min-height:210px;display:grid;place-items:center;font-size:60px;color:#fff}
.pj-academia-hub .feature .cover .play{position:absolute;width:60px;height:60px;border-radius:99px;background:rgba(0,0,0,.4);backdrop-filter:blur(6px);display:grid;place-items:center;font-size:22px;border:1px solid rgba(255,255,255,.35)}
.pj-academia-hub .feature .fbody{padding:clamp(20px,3vw,32px);display:flex;flex-direction:column;justify-content:center}
.pj-academia-hub .chiprow{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.pj-academia-hub .fchip2{font-size:.62rem;font-weight:800;font-family:var(--font-d);letter-spacing:.06em;text-transform:uppercase;padding:5px 10px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);color:var(--ink-dim)}
.pj-academia-hub .fchip2.hot{background:rgba(255,140,0,.16);color:var(--orange);border-color:transparent}
.pj-academia-hub .feature h3{font-family:var(--font-d);font-weight:900;font-style:italic;font-size:clamp(1.4rem,3vw,2.1rem);line-height:1.03;letter-spacing:-.01em}
.pj-academia-hub .feature p{color:var(--ink-dim);margin-top:11px;max-width:48ch;font-size:.92rem}
.pj-academia-hub .facts{display:flex;gap:20px;margin-top:16px;flex-wrap:wrap}.pj-academia-hub .facts .f .v{font-family:var(--font-d);font-weight:800;font-size:1.1rem}.pj-academia-hub .facts .f .l{font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);font-family:var(--font-d)}
.pj-academia-hub .fact-actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
.pj-academia-hub .rail-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}
.pj-academia-hub .rail-hd .all{font-size:.76rem;font-weight:700;font-family:var(--font-d);color:var(--ink-dim)}
.pj-academia-hub .rail{display:flex;gap:13px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 14px}
.pj-academia-hub .rail::-webkit-scrollbar{height:8px}.pj-academia-hub .rail::-webkit-scrollbar-thumb{background:var(--g3);border-radius:99px}
.pj-academia-hub .card{scroll-snap-align:start;flex:0 0 232px;position:relative;border-radius:var(--r-md);overflow:hidden;border:1px solid var(--bd);background:var(--g1);cursor:pointer;transition:transform .25s,box-shadow .25s}
.pj-academia-hub .card:hover{transform:translateY(-6px);box-shadow:var(--elev-3)}
.pj-academia-hub .card .cover{aspect-ratio:16/10;position:relative;display:flex;align-items:flex-end;padding:12px;color:#fff}
.pj-academia-hub .card .cover .badge{position:absolute;top:10px;left:10px;font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-family:var(--font-d);padding:4px 8px;border-radius:7px;background:rgba(0,0,0,.42);backdrop-filter:blur(6px)}
.pj-academia-hub .card .cover .kind{position:absolute;top:10px;right:10px;font-size:1.1rem}
.pj-academia-hub .card .cover h4{font-family:var(--font-d);font-weight:800;font-size:1rem;line-height:1.12;text-shadow:0 2px 10px rgba(0,0,0,.5)}
.pj-academia-hub .card .cbody{padding:11px 13px 13px}.pj-academia-hub .card .meta{display:flex;gap:7px;font-size:.72rem;color:var(--ink-faint);flex-wrap:wrap;align-items:center}
.pj-academia-hub .card .prov{display:flex;align-items:center;gap:7px;margin-top:8px;font-size:.72rem;color:var(--ink-dim)}.pj-academia-hub .card .prov .av{width:20px;height:20px;border-radius:99px;background:var(--grad-warm);display:grid;place-items:center;font-size:.6rem;font-weight:800}
.pj-academia-hub .card .enrolled{position:absolute;bottom:12px;right:12px;font-size:.6rem;font-weight:800;font-family:var(--font-d);padding:3px 8px;border-radius:99px;background:rgba(6,214,160,.16);color:var(--success);border:1px solid rgba(6,214,160,.3)}
.pj-academia-hub .credstrip{margin:16px 0 60px;border-radius:var(--r-2xl);border:1px solid var(--bd-str);overflow:hidden;position:relative;background:linear-gradient(120deg,rgba(107,0,153,.28),rgba(255,140,0,.14))}
.pj-academia-hub .credstrip .inner{padding:clamp(24px,4vw,40px);display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.pj-academia-hub .credstrip .m{flex:1;min-width:260px}
.pj-academia-hub .credstrip h3{font-family:var(--font-d);font-weight:900;font-style:italic;text-transform:uppercase;font-size:clamp(1.35rem,3vw,2rem);line-height:1.02}
.pj-academia-hub .credstrip p{color:var(--ink-dim);margin-top:10px;max-width:52ch}
.pj-academia-hub .credstrip .badges{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.pj-academia-hub .credstrip .badges span{font-size:.68rem;font-weight:700;font-family:var(--font-d);padding:6px 11px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);color:var(--ink-dim)}
.pj-academia-hub .foot-note{text-align:center;color:var(--ink-faint);font-size:.78rem;padding:0 0 40px}
@media(prefers-reduced-motion:reduce){.pj-academia-hub *{animation:none!important;transition:none!important}}
`;

export default AcademiaHubView;
