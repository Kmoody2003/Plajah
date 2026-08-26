/**
 * AcademiaLandingView — the public/creator-facing Plajah Academia landing (for NON-education
 * accounts; education accounts get the role portal, AcademiaHomeView).
 *
 * Rebuilt 2026-08-25 as "Front Row Academy", ported from the verified artifact. The previous
 * landing surfaced 6 modules and a courses link while Praxis, Film School, the Chora
 * Conservatory, Music Theory, Combat Atlas, Terra, the Learner Ledger, the Sky and the Sacred
 * Library were all shipped and all invisible from it — discoverability was the real bug, not
 * content (see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md).
 *
 * Structure: a hero with the PreK→Professional scaler (every school re-describes itself for the
 * selected band) → the Schools front row → the live Museums & Labs rail → the Telescoping Text
 * spotlight (the Civics Hall signature mechanic) → why educators switch → the credential strip.
 *
 * Design ported 1:1 from the artifact; uses a scoped <style> block so it renders independently of
 * global CSS, matching AcademiaHubView.
 */
import React, { useEffect, useRef, useState } from 'react';
import AcademiaDemosView, { type DemoRole } from './academia/AcademiaDemosView';

type Band = 'prek' | 'el' | 'ms' | 'hs' | 'col' | 'pro';

const BANDS: [Band, string][] = [
  ['prek', 'PreK–2'], ['el', '3–5'], ['ms', '6–8'], ['hs', '9–12'], ['col', 'College'], ['pro', 'Professional'],
];

interface School {
  t: string; ic: string; a: string; b: string; badge: string; live?: boolean;
  tags: string[]; ladder: string[]; nav: string; d: Record<Band, string>;
}

/** The flagship schools. `nav` points at the real shipped surface. */
const SCHOOLS: School[] = [
  {
    t: 'The Business School', ic: '🚀', a: '#8B5CF6', b: '#2a1650', badge: 'Praxis · LIVE NOW', live: true,
    tags: ['Simulator', 'Real launch'], ladder: ['Spark', 'Validate', 'Form', 'Books', 'Operate', 'Fund', 'Grow'], nav: 'PRAXIS',
    d: {
      prek: 'Run the class store — earn, count, and share. Business as play.',
      el: 'Your first lemonade-stand venture: price it, cost it, count the profit.',
      ms: 'Build a venture with a real P&L — and learn why margin beats revenue.',
      hs: 'The full Praxis journey: form an entity, keep books, fund and grow — for real or simulated.',
      col: 'Launch an actual business page: EIN, entity choice, compliance calendar, capital ladder.',
      pro: 'Operate with your own double-entry books, unit economics, and a coached raise — Aria watching your deadlines.',
    },
  },
  {
    t: 'School of Money', ic: '💰', a: '#F59E0B', b: '#4a2b00', badge: 'Financial Literacy · LIVE NOW', live: true,
    tags: ['FDIC + CFPB spine', '30-state ready'], ladder: ['Earn', 'Spend', 'Save', 'Credit', 'Risk', 'CFO'], nav: 'MONEY_SCHOOL',
    d: {
      prek: 'Coins, choices, and waiting for what you want — money habits start here.',
      el: 'Budget your allowance, set a goal, watch saving grow.',
      ms: 'Credit, compound interest, and your first practice portfolio.',
      hs: 'The state-mandate course, done right: credit scores, investing, insurance, taxes — every standard tagged.',
      col: 'Adult money mastery: renting to owning, debt strategy, investing — education, never sales.',
      pro: 'The CFO ladder: small-business books → accounting → corporate finance → cost of capital on your own venture.',
    },
  },
  {
    t: 'Real Estate School', ic: '🏘️', a: '#06D6A0', b: '#0a3d30', badge: 'Terra-powered · LIVE NOW', live: true,
    tags: ['Real Detroit parcels', 'First open licensure track'], ladder: ['Adopt a Parcel', 'First Home', 'License', 'Pro Forma', 'Capital Markets'], nav: 'REAL_ESTATE_SCHOOL',
    d: {
      prek: 'What is a home? Who owns the park? Property as neighbourhood.',
      el: 'Adopt a real Detroit parcel — its size, its value, its story, on a live map.',
      ms: 'What makes a house worth money? Play the comps game on real sales.',
      hs: 'The whole homebuying journey with the government’s own toolkit — then a real Loan Estimate at today’s rates.',
      col: 'Underwrite an actual building: multi-year pro forma, real taxes, real rents, defend buy or pass.',
      pro: 'Capital markets, REITs and securitisation — and a site assembly in a real corridor with live zoning.',
    },
  },
  {
    t: 'Civics Hall', ic: '🏛️', a: '#D40055', b: '#3d0018', badge: 'The Long Argument of Liberty · LIVE NOW', live: true,
    tags: ['Primary sources', '7 nations'], ladder: ['Foundations', 'Structure', 'Rights', 'Action', 'Living Constitution'], nav: 'CIVICS_HALL',
    d: {
      prek: 'Rules we make together — a class constitution everyone signs.',
      el: 'Magna Carta as a story, three branches as a game, one amendment a week.',
      ms: 'Read Locke and Montesquieu for yourself (in plain English) — then hold a mock trial.',
      hs: 'The full canon, 1215→1791: the writings that formed America before America — and the Federalist debates verbatim.',
      col: 'Clause-by-clause with the case law; read the world’s constitutions side-by-side.',
      pro: 'Comparative government: seven nations’ founding texts — what they promise, and how it’s kept.',
    },
  },
  {
    t: 'School of Economics', ic: '📈', a: '#3B82F6', b: '#0f2246', badge: 'Live-data powered · LIVE NOW', live: true,
    tags: ['Real Fed data', 'AP-aligned'], ladder: ['Choice', 'Markets', 'Macro', 'The Fed', 'Data'], nav: 'ECON_SCHOOL',
    d: {
      prek: 'Goods, services, and why we can’t have everything — scarcity as a game.',
      el: 'Graph a real price over time. Yes, a real one, from the Fed’s own data.',
      ms: 'Supply and demand with your own venture’s prices — plus this month’s actual inflation, live.',
      hs: 'AP Micro & Macro with real data labs: replay 2008 and 2020 from the actual series.',
      col: 'The modern principles sequence — hosted open texts plus the most current open economics in the world.',
      pro: 'Graduate lectures and empirical projects on live data; publish your analysis to the Findings layer.',
    },
  },
  {
    t: 'School of Philosophy', ic: '🦉', a: '#A78BFA', b: '#2a1650', badge: 'The Examined Life · LIVE NOW', live: true,
    tags: ['Age 4 → seminar', 'Ethics Bowl'], ladder: ['Wonder', 'Inquiry', 'Logic', 'Ethics', 'History'], nav: 'PHILOSOPHY_SCHOOL',
    d: {
      prek: 'Wonder circles: is it ever OK to break a rule? Could a robot be your friend?',
      el: 'The question of the week — argued kindly, with reasons.',
      ms: 'Spot the fallacy; stage Socrates’ trial as a play, from the actual dialogue.',
      hs: 'Ethics Bowl cases, formal logic proofs, and the moderns in readable English.',
      col: 'The full history sequence — Ancient to nineteenth century — from the original texts.',
      pro: 'Branch seminars: epistemology, political philosophy (shared with Civics Hall), advanced logic.',
    },
  },
  {
    t: 'Music Conservatory', ic: '🎼', a: '#00DAF3', b: '#04324a', badge: 'Chora Conservatory · LIVE NOW', live: true,
    tags: ['6 curriculum tracks', 'Ear training'], ladder: ['Hall', 'History', 'Theory', 'Instruments', 'Repertoire', 'Produce'], nav: 'CHORA_CONSERVATORY',
    d: {
      prek: 'Clap the beat, find the pattern — rhythm play.',
      el: 'First notes, first melodies — theory through games, not worksheets.',
      ms: 'Scales, chords and song form — then build a beat in the studio yourself.',
      hs: 'Compose and produce in a real in-browser studio: instruments, arrangement, mixing.',
      col: 'Harmony, orchestration, production technique — release your work to a real audience.',
      pro: 'The full studio craft: mastering, spatial audio, publishing — the conservatory that ships records.',
    },
  },
  {
    t: 'Film School', ic: '🎬', a: '#EC4899', b: '#3d0a26', badge: '8 tracks · LIVE NOW', live: true,
    tags: ['Public-domain watch-alongs', 'Real editor'], ladder: ['Foundations', 'Writing', 'Cinematography', 'Editing', 'Directing', 'Acting'], nav: 'FILM_SCHOOL',
    d: {
      prek: 'Tell a story in three pictures — beginning, middle, end.',
      el: 'How movies trick your eyes: shots, cuts, and sound.',
      ms: 'Edit your first scene in a real editor — rhythm, continuity, story.',
      hs: 'Film language and history, then a short film cut with real tools.',
      col: 'Direction, cinematography, post — a portfolio piece, publicly screened.',
      pro: 'The full pipeline: production, colour, titles, distribution on the platform’s own channels.',
    },
  },
];

/** Museums and modules that are LIVE on Plajah today. */
const LABS: { t: string; ic: string; a: string; b: string; m: string; nav: string }[] = [
  { t: 'The Human Body', ic: '🫀', a: '#8B5CF6', b: '#2a1650', m: 'Real 3D anatomy · 7 systems', nav: 'ACADEMIA_COURSES' },
  { t: 'The Solar System', ic: '🪐', a: '#3B82F6', b: '#0f2246', m: 'Orbital simulation', nav: 'ACADEMIA_COURSES' },
  { t: 'Plant Biology', ic: '🌱', a: '#06D6A0', b: '#0a3d30', m: 'Botany studio', nav: 'ACADEMIA_COURSES' },
  { t: 'Combat Atlas', ic: '🥋', a: '#EF4444', b: '#3d0f0f', m: 'Martial-arts museum · real mocap', nav: 'PLAJAH_LABS' },
  { t: 'Science Studios', ic: '🔬', a: '#00DAF3', b: '#04324a', m: '12 data-driven disciplines', nav: 'PLAJAH_LABS' },
  { t: 'Art Galleries', ic: '🖼️', a: '#EC4899', b: '#3d0a26', m: 'Open-access museum art', nav: 'ART_GALLERY' },
  { t: 'Reading Quest', ic: '📖', a: '#D40055', b: '#3d0018', m: 'PreK–G7 · ledger-wired', nav: 'READING_QUEST' },
  { t: 'Math Classroom', ic: '🔢', a: '#3B82F6', b: '#0f2246', m: 'Grades 1–8 · standards-tagged', nav: 'MATH_CLASSROOM' },
  { t: 'Science Quest', ic: '🧪', a: '#8B5CF6', b: '#2a1650', m: 'NGSS practices', nav: 'SCIENCE_QUEST' },
  { t: 'World Languages', ic: '🗣️', a: '#06D6A0', b: '#0a3d30', m: 'CEFR · spaced repetition', nav: 'LANGUAGE_QUEST' },
  { t: 'Music Theory', ic: '🎹', a: '#00DAF3', b: '#04324a', m: '7 lessons · ear training', nav: 'MUSIC_THEORY' },
  { t: 'The Sky', ic: '✨', a: '#A78BFA', b: '#2a1650', m: 'Your mastery as constellations', nav: 'ACADEMIA_SKY' },
];

const EDU = [
  { ic: '🧭', c: '#00DAF3', t: 'Standards, pre-tagged', d: 'C3, CEE and Jump$tart, Common Core, NGSS, CEFR, National Core Arts — every lesson carries its alignment, and mastery rolls up automatically.' },
  { ic: '🗽', c: '#D40055', t: 'The mandate wave, turnkey', d: '30 states now require personal finance to graduate. Plajah’s course is ready on day one — free.' },
  { ic: '📜', c: '#FFD24A', t: '“This text belongs to everyone”', d: 'A public-domain spine — FDIC, CFPB, the founding documents, the classics. Print it, remix it, re-share it. Zero permission anxiety.' },
  { ic: '🧪', c: '#06D6A0', t: 'Learn by running the real thing', d: 'Accounting on your own venture’s books. Real estate on live city parcels. Film cut in a real editor. Music that ships.' },
  { ic: '🍎', c: '#FF8C00', t: 'Teacher tools, free forever', d: 'Plan from live mastery, rubric grading, a standards gradebook, and push to Google Classroom, LTI, OneRoster or QTI.' },
  { ic: '🎓', c: '#8B5CF6', t: 'A record learners own', d: 'Mastery becomes verifiable credentials on a portable ledger — it travels between schools, countries, and jobs.' },
];

/** The Telescoping Text demo — one document, five zoom levels. */
const TELE: Record<string, { l: string; doc: React.ReactNode }> = {
  prek: { l: 'K–2', doc: <><span className="glow">“We the People…”</span><br /><br />Fifty-two words that start a promise. We chant them, we draw them, and we sign our own class version.</> },
  el: { l: '3–5', doc: <>“We the People of the United States, in Order to form a more perfect Union…”<br /><br />Who is <span className="glow">We</span>? What does a government promise the people it serves?</> },
  ms: { l: '6–8', doc: <>The full Preamble, annotated: <span className="glow">establish Justice… promote the general Welfare… secure the Blessings of Liberty</span> — six purposes, each traced to something in your life today.</> },
  hs: { l: '9–12', doc: <>The Preamble beside <span className="glow">Federalist 51</span>: “If men were angels, no government would be necessary.” Why the framers built friction into the machine — in their own words.</> },
  col: { l: 'College', doc: <>The Preamble with its case-law apparatus — what a court may and may not build on fifty-two words. Clause by clause, with the annotations.</> },
};

const grad = (a: string, b: string) => `linear-gradient(150deg,${a},${b})`;

const AcademiaLandingView: React.FC<{
  onNavigate: (view: string) => void;
  onEnterCourses: () => void;
  profile?: any;
  onOpenTour: (role?: DemoRole) => void;
}> = ({ onNavigate, onEnterCourses, profile, onOpenTour }) => {
  const [band, setBand] = useState<Band>('hs');
  const [tab, setTab] = useState<'FRONT_ROW' | 'DEMOS'>('FRONT_ROW');
  const [zoom, setZoom] = useState<Band | 'col'>('prek');
  const rowRef = useRef<HTMLDivElement>(null);
  const isEducationAccount =
    ['TEACHER', 'PARENT', 'STUDENT', 'CHILD'].includes(profile?.accountType) || !!profile?.isSchoolAdmin;

  // Gently cycle the Telescoping Text so the mechanic explains itself.
  useEffect(() => {
    const keys = Object.keys(TELE);
    const id = setInterval(() => setZoom(z => keys[(keys.indexOf(z as string) + 1) % keys.length] as Band), 5200);
    return () => clearInterval(id);
  }, []);

  const scrollRow = (dir: 1 | -1) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.7, 560), behavior: 'smooth' });
  };

  const go = (view: string) => {
    if (view === 'ACADEMIA_COURSES') onEnterCourses();
    else onNavigate(view);
  };

  return (
    <div className="pj-frontrow">
      <style>{FRONTROW_CSS}</style>

      <div className="wrap">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="hero">
          <div className="top">
            <div>
              <span className="eyebrow">The learning front row</span>
              <h1>Every subject,<br /><span className="g">every age, for real.</span></h1>
              <p className="sub">
                Full schools — business, money, real estate, civics, economics, philosophy, music, film — that
                scale from PreK to professional. Slide the dial and watch each one meet you where you are.
              </p>
            </div>
            <div className="issue">
              <span className="live">Live</span> · Praxis venture school open · 3D anatomy · new module weekly
            </div>
          </div>

          <div className="tabs">
            <button aria-selected={tab === 'FRONT_ROW'} onClick={() => setTab('FRONT_ROW')}>Front row</button>
            <button aria-selected={tab === 'DEMOS'} onClick={() => setTab('DEMOS')}>Try a demo</button>
            {isEducationAccount && (
              <button className="portal" onClick={() => onNavigate('ACADEMIA_HOME')}>🎓 Open my Academia →</button>
            )}
          </div>

          {tab === 'FRONT_ROW' && (
            <>
              <div className="scaler">
                <span className="lab">Teach me at</span>
                <div className="bands">
                  {BANDS.map(([id, label]) => (
                    <button key={id} aria-selected={band === id} onClick={() => setBand(id)}>{label}</button>
                  ))}
                </div>
                <span className="note">Every school re-writes itself for the learner’s level.</span>
              </div>

              <div className="frontrow">
                <div className="arrows">
                  <button onClick={() => scrollRow(-1)} aria-label="Scroll left">←</button>
                  <button onClick={() => scrollRow(1)} aria-label="Scroll right">→</button>
                </div>
                <div className="rowscroll" ref={rowRef}>
                  {SCHOOLS.map(m => (
                    <div key={m.t} className="cover" style={{ background: grad(m.a, m.b) }} role="button" tabIndex={0}
                      onClick={() => go(m.nav)}
                      onKeyDown={e => { if (e.key === 'Enter') go(m.nav); }}>
                      <div className="art">{m.ic}</div>
                      <div className="scrim" />
                      <div className="tags">{m.tags.map(t => <span key={t}>{t}</span>)}</div>
                      <div className="meta">
                        <span className={`badge ${m.live ? 'live' : ''}`}>{m.badge}</span>
                        <h3>{m.t}</h3>
                        <div className="desc">{m.d[band]}</div>
                        <div className="ladder">{m.ladder.map(x => <span key={x}>{x}</span>)}</div>
                        <span className="enter">{m.live ? 'Enter — it’s live ▶' : 'Explore ▶'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {tab === 'DEMOS' ? (
          <section className="block">
            <AcademiaDemosView onBack={() => setTab('FRONT_ROW')} onNavigate={onNavigate} onOpenTour={onOpenTour} />
          </section>
        ) : (
          <>
            {/* ── Live museums & labs ───────────────────────────────────────── */}
            <section className="block">
              <div className="block-hd">
                <div>
                  <h2 className="sec-title">Museums &amp; Labs — open now</h2>
                  <p>Not mockups — these are live on Plajah today: real 3D anatomy, orbital mechanics, martial-arts mocap, data-driven science studios.</p>
                </div>
                <button className="btn btn-ghost" onClick={() => onNavigate('PLAJAH_LABS')}>See all →</button>
              </div>
              <div className="rail">
                {LABS.map(l => (
                  <div key={l.t} className="card" role="button" tabIndex={0}
                    onClick={() => go(l.nav)}
                    onKeyDown={e => { if (e.key === 'Enter') go(l.nav); }}>
                    <div className="cv" style={{ background: grad(l.a, l.b) }}>
                      <span className="lv">Live</span>{l.ic}<span className="k">{l.t}</span>
                    </div>
                    <div className="cb"><div className="m">{l.m}</div></div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── The Telescoping Text ──────────────────────────────────────── */}
            <section className="block">
              <div className="tele"><div className="inner">
                <div>
                  <span className="eyebrow cy">Civics Hall · signature mechanic</span>
                  <h3>The Telescoping Text</h3>
                  <p>
                    Every founding document lives once on Plajah — readable at five zoom levels. A kindergartner
                    chants the Preamble; a senior parses Federalist 51; a parent reads the case-law annotations.
                    Same document, same permalink, an age-appropriate lens.
                  </p>
                  <p className="small"><b>This text belongs to everyone</b> — print it, remix it, keep it. No permission required, ever.</p>
                </div>
                <div className="zoom">
                  <div className="zbands">
                    {Object.entries(TELE).map(([id, z]) => (
                      <button key={id} aria-selected={zoom === id} onClick={() => setZoom(id as Band)}>{z.l}</button>
                    ))}
                  </div>
                  <div className="doc">{TELE[zoom as string]?.doc}</div>
                  <div className="src"><span>U.S. National Archives · public domain</span><span>preamble-1787</span></div>
                </div>
              </div></div>
            </section>

            {/* ── Why educators switch ──────────────────────────────────────── */}
            <section className="block">
              <div className="block-hd">
                <div>
                  <h2 className="sec-title">Why educators switch</h2>
                  <p>Grounded in the frameworks you already answer to — with hooks no one else has.</p>
                </div>
              </div>
              <div className="edu">
                {EDU.map(e => (
                  <div key={e.t} className="ecard">
                    <div className="ic" style={{ background: `${e.c}22`, color: e.c, boxShadow: `inset 0 0 0 1px ${e.c}55` }}>{e.ic}</div>
                    <h3>{e.t}</h3><p>{e.d}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Credential strip ──────────────────────────────────────────── */}
            <section className="block">
              <div className="credstrip"><div className="inner">
                <div className="m">
                  <h3>Everything you learn, provably yours</h3>
                  <p>
                    Standards-aligned mastery becomes a portable, verifiable record — benchmarked globally,
                    CEFR for languages. Change schools, change countries, keep your proficiency.
                  </p>
                </div>
                <div className="ctas">
                  <button className="btn btn-primary" onClick={() => onNavigate('LEARNER_LEDGER')}>🎓 Open my Academic Passport →</button>
                  <button className="btn btn-ghost" onClick={onEnterCourses}>Browse all courses</button>
                </div>
              </div></div>
            </section>

            <p className="foot">Front Row Academy — the whole platform behind every door. Built beside your school, never in place of it.</p>
          </>
        )}
      </div>
    </div>
  );
};

const FRONTROW_CSS = `
.pj-frontrow{
  --purple:#6B0099;--magenta:#D40055;--orange:#FF8C00;--cyan:#00DAF3;--lilac:#D0BCFF;--success:#06D6A0;
  --grad-warm:linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00);
  --bg:#07060c;--ink:#f5f1f7;--dim:rgba(245,241,247,.66);--faint:rgba(245,241,247,.42);
  --g1:rgba(255,255,255,.04);--g2:rgba(255,255,255,.07);--g3:rgba(255,255,255,.11);
  --bd:rgba(255,255,255,.1);--bd2:rgba(255,255,255,.17);
  --fd:"Outfit",sans-serif;--fb:"Inter",system-ui,sans-serif;--fm:"JetBrains Mono",monospace;
  font-family:var(--fb);color:var(--ink);background:var(--bg);line-height:1.55;min-height:100%;
  background-image:radial-gradient(90% 55% at 12% -6%,rgba(107,0,153,.34),transparent 55%),radial-gradient(80% 55% at 92% 2%,rgba(0,218,243,.14),transparent 55%),radial-gradient(70% 50% at 60% 116%,rgba(255,140,0,.1),transparent 60%);
}
.pj-frontrow *{box-sizing:border-box}
.pj-frontrow .wrap{max-width:1380px;margin:0 auto;padding:0 clamp(16px,4vw,44px) 40px}
.pj-frontrow .eyebrow{font-family:var(--fd);font-weight:800;font-size:.66rem;letter-spacing:.28em;text-transform:uppercase;color:var(--faint)}
.pj-frontrow .eyebrow.cy{color:var(--cyan)}
.pj-frontrow .sec-title{font-family:var(--fd);font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.01em;font-size:clamp(1.4rem,3vw,2rem);display:flex;align-items:center;gap:12px;margin:0}
.pj-frontrow .sec-title::before{content:"";width:6px;height:24px;border-radius:99px;background:var(--grad-warm)}
.pj-frontrow .btn{appearance:none;border:1px solid transparent;cursor:pointer;font-family:var(--fd);font-weight:800;height:44px;padding:0 20px;border-radius:99px;font-size:.88rem;display:inline-flex;align-items:center;gap:8px;transition:.16s}
.pj-frontrow .btn-ghost{background:var(--g2);color:var(--ink);border-color:var(--bd)}
.pj-frontrow .btn-ghost:hover{background:var(--g3)}
.pj-frontrow .btn-primary{background-image:var(--grad-warm);color:#fff;box-shadow:0 8px 24px rgba(212,0,85,.34)}
.pj-frontrow .btn-primary:hover{filter:brightness(1.1)}

.pj-frontrow .hero{padding:clamp(20px,4vw,40px) 0 6px}
.pj-frontrow .hero .top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.pj-frontrow .hero h1{font-family:var(--fd);font-weight:900;font-style:italic;text-transform:uppercase;line-height:.92;letter-spacing:-.02em;font-size:clamp(2.1rem,6vw,4.2rem);margin:10px 0 0;text-wrap:balance}
.pj-frontrow .hero h1 .g{background:var(--grad-warm);-webkit-background-clip:text;background-clip:text;color:transparent}
.pj-frontrow .hero .sub{color:var(--dim);max-width:48ch;margin-top:12px;font-size:clamp(.98rem,1.4vw,1.12rem)}
.pj-frontrow .issue{display:flex;align-items:center;gap:10px;font-family:var(--fm);font-size:.74rem;color:var(--faint)}
.pj-frontrow .issue .live{display:inline-flex;align-items:center;gap:6px;color:var(--orange)}
.pj-frontrow .issue .live::before{content:"";width:7px;height:7px;border-radius:99px;background:var(--orange);box-shadow:0 0 8px var(--orange);animation:pjBlink 1.6s infinite}
@keyframes pjBlink{0%,100%{opacity:1}50%{opacity:.35}}

.pj-frontrow .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 4px}
.pj-frontrow .tabs button{appearance:none;border:1px solid var(--bd);background:var(--g1);color:var(--dim);cursor:pointer;font-family:var(--fd);font-weight:800;font-size:.8rem;height:38px;padding:0 18px;border-radius:99px;transition:.15s}
.pj-frontrow .tabs button[aria-selected="true"]{background:var(--grad-warm);color:#fff;border-color:transparent}
.pj-frontrow .tabs button.portal{margin-left:auto;background:rgba(0,218,243,.14);color:var(--cyan);border-color:rgba(0,218,243,.3)}

.pj-frontrow .scaler{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 18px;padding:12px 14px;border-radius:18px;background:var(--g1);border:1px solid var(--bd2)}
.pj-frontrow .scaler .lab{font-family:var(--fd);font-weight:800;font-size:.62rem;letter-spacing:.2em;text-transform:uppercase;color:var(--cyan)}
.pj-frontrow .scaler .bands{display:flex;gap:5px;flex-wrap:wrap}
.pj-frontrow .scaler button{appearance:none;border:1px solid var(--bd);background:var(--g1);color:var(--dim);cursor:pointer;font-family:var(--fd);font-weight:800;font-size:.76rem;height:36px;padding:0 15px;border-radius:99px;transition:.18s}
.pj-frontrow .scaler button[aria-selected="true"]{background:linear-gradient(135deg,#00DAF3,#3B82F6);color:#03202b;border-color:transparent;box-shadow:0 4px 16px rgba(0,218,243,.3)}
.pj-frontrow .scaler button:not([aria-selected="true"]):hover{background:var(--g3);color:var(--ink)}
.pj-frontrow .scaler .note{font-size:.74rem;color:var(--faint);margin-left:auto}

.pj-frontrow .frontrow{position:relative;margin-top:2px}
.pj-frontrow .rowscroll{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 2px 18px}
.pj-frontrow .rowscroll::-webkit-scrollbar{height:8px}
.pj-frontrow .rowscroll::-webkit-scrollbar-thumb{background:var(--g3);border-radius:99px}
.pj-frontrow .cover{scroll-snap-align:center;flex:0 0 clamp(290px,44vw,540px);height:clamp(340px,44vw,460px);border-radius:26px;position:relative;overflow:hidden;border:1px solid var(--bd2);cursor:pointer;transition:transform .4s cubic-bezier(.2,.7,.2,1)}
.pj-frontrow .cover:hover{transform:translateY(-8px)}
.pj-frontrow .cover .art{position:absolute;inset:0;display:grid;place-items:center;font-size:clamp(4.6rem,11vw,9rem);opacity:.9}
.pj-frontrow .cover .scrim{position:absolute;inset:0;background:linear-gradient(to top,rgba(4,3,8,.95) 10%,rgba(4,3,8,.3) 48%,transparent 75%)}
.pj-frontrow .cover .meta{position:absolute;left:0;right:0;bottom:0;padding:20px 22px;z-index:2}
.pj-frontrow .cover .badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--fd);font-weight:800;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:5px 10px;border-radius:8px;background:rgba(0,0,0,.5);backdrop-filter:blur(6px);color:#fff;margin-bottom:10px}
.pj-frontrow .cover .badge.live{background:rgba(6,214,160,.85);color:#04140e}
.pj-frontrow .cover h3{font-family:var(--fd);font-weight:900;font-style:italic;text-transform:uppercase;font-size:clamp(1.4rem,2.8vw,2rem);line-height:.98;letter-spacing:-.01em;margin:0}
.pj-frontrow .cover .desc{color:rgba(255,255,255,.75);font-size:.86rem;margin-top:8px;max-width:40ch;min-height:3.6em}
.pj-frontrow .cover .ladder{display:flex;gap:5px;margin-top:10px;flex-wrap:wrap}
.pj-frontrow .cover .ladder span{font-size:.6rem;font-weight:700;font-family:var(--fd);padding:3px 8px;border-radius:99px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.8)}
.pj-frontrow .cover .enter{margin-top:12px;display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 17px;border-radius:99px;background:#fff;color:#120a1c;font-family:var(--fd);font-weight:800;font-size:.8rem}
.pj-frontrow .cover .tags{position:absolute;top:16px;right:16px;display:flex;gap:6px;z-index:2}
.pj-frontrow .cover .tags span{font-size:.62rem;font-weight:700;font-family:var(--fd);padding:4px 9px;border-radius:99px;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);color:#fff}
.pj-frontrow .arrows{position:absolute;top:-52px;right:2px;display:flex;gap:8px}
.pj-frontrow .arrows button{width:40px;height:40px;border-radius:99px;border:1px solid var(--bd);background:var(--g2);color:var(--ink);cursor:pointer;font-size:16px;display:grid;place-items:center}
.pj-frontrow .arrows button:hover{background:var(--g3)}

.pj-frontrow section.block{padding:34px 0}
.pj-frontrow .block-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.pj-frontrow .block-hd p{color:var(--dim);font-size:.9rem;margin-top:6px;max-width:60ch}
.pj-frontrow .rail{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 12px}
.pj-frontrow .rail::-webkit-scrollbar{height:8px}
.pj-frontrow .rail::-webkit-scrollbar-thumb{background:var(--g3);border-radius:99px}
.pj-frontrow .card{scroll-snap-align:start;flex:0 0 226px;border-radius:18px;overflow:hidden;border:1px solid var(--bd);background:var(--g1);cursor:pointer;transition:transform .25s,box-shadow .25s}
.pj-frontrow .card:hover{transform:translateY(-6px);box-shadow:0 18px 40px rgba(0,0,0,.5)}
.pj-frontrow .card .cv{aspect-ratio:4/3;position:relative;display:grid;place-items:center;font-size:2.8rem;color:#fff}
.pj-frontrow .card .cv .k{position:absolute;bottom:10px;left:12px;right:12px;font-family:var(--fd);font-weight:800;font-size:.92rem;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.pj-frontrow .card .cv .lv{position:absolute;top:10px;left:10px;font-size:.56rem;font-weight:800;font-family:var(--fd);letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:7px;background:rgba(6,214,160,.85);color:#04140e}
.pj-frontrow .card .cb{padding:10px 13px}
.pj-frontrow .card .cb .m{font-size:.72rem;color:var(--faint)}

.pj-frontrow .tele{border-radius:28px;border:1px solid var(--bd2);overflow:hidden;background:linear-gradient(120deg,rgba(107,0,153,.24),rgba(0,218,243,.1))}
.pj-frontrow .tele .inner{padding:clamp(22px,4vw,40px);display:grid;gap:26px;grid-template-columns:1fr}
@media(min-width:920px){.pj-frontrow .tele .inner{grid-template-columns:1fr 1fr;align-items:center}}
.pj-frontrow .tele h3{font-family:var(--fd);font-weight:900;font-style:italic;text-transform:uppercase;font-size:clamp(1.5rem,3vw,2.2rem);line-height:1;margin:8px 0 0}
.pj-frontrow .tele p{color:var(--dim);margin-top:12px;max-width:52ch}
.pj-frontrow .tele p.small{font-size:.84rem}
.pj-frontrow .tele p.small b{color:var(--ink)}
.pj-frontrow .tele .zoom{border:1px solid var(--bd);border-radius:18px;background:rgba(4,3,10,.6);padding:18px}
.pj-frontrow .tele .zbands{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px}
.pj-frontrow .tele .zbands button{appearance:none;border:1px solid var(--bd);background:var(--g1);color:var(--dim);cursor:pointer;font-family:var(--fd);font-weight:800;font-size:.7rem;height:30px;padding:0 11px;border-radius:99px}
.pj-frontrow .tele .zbands button[aria-selected="true"]{background:var(--grad-warm);color:#fff;border-color:transparent}
.pj-frontrow .tele .doc{font-family:Georgia,'Times New Roman',serif;font-size:1.02rem;line-height:1.7;color:rgba(255,255,255,.86);min-height:9.5em}
.pj-frontrow .tele .doc .glow{color:#FFD24A}
.pj-frontrow .tele .src{margin-top:12px;font-family:var(--fm);font-size:.66rem;color:var(--faint);display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px}

.pj-frontrow .edu{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(255px,1fr))}
.pj-frontrow .ecard{border:1px solid var(--bd);background:var(--g1);border-radius:20px;padding:20px}
.pj-frontrow .ecard .ic{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;font-size:21px;margin-bottom:13px}
.pj-frontrow .ecard h3{font-family:var(--fd);font-weight:800;font-size:1.06rem;letter-spacing:-.01em;margin:0}
.pj-frontrow .ecard p{color:var(--dim);font-size:.85rem;margin-top:6px}

.pj-frontrow .credstrip{border-radius:28px;border:1px solid var(--bd2);overflow:hidden;background:linear-gradient(120deg,rgba(107,0,153,.28),rgba(255,140,0,.13))}
.pj-frontrow .credstrip .inner{padding:clamp(24px,4vw,40px);display:flex;gap:22px;align-items:center;flex-wrap:wrap}
.pj-frontrow .credstrip .m{flex:1;min-width:260px}
.pj-frontrow .credstrip h3{font-family:var(--fd);font-weight:900;font-style:italic;text-transform:uppercase;font-size:clamp(1.4rem,3vw,2rem);line-height:1.02;margin:0}
.pj-frontrow .credstrip p{color:var(--dim);margin-top:10px;max-width:54ch}
.pj-frontrow .credstrip .ctas{display:flex;gap:10px;flex-wrap:wrap}
.pj-frontrow .foot{text-align:center;color:var(--faint);font-size:.78rem;padding:10px 0 30px}
@media(prefers-reduced-motion:reduce){.pj-frontrow *{animation:none!important;transition:none!important}}
`;

export default AcademiaLandingView;
