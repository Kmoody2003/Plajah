// ScienceQuestView — the second standards-aligned cartridge on the same chassis as Reading
// Quest: NGSS-aligned science practice that writes the Learner Ledger, shows proficiency bands +
// a global (PISA) standing, and unlocks Turbo (depth/transfer/creative) beyond grade. Demoable
// as any demo student (awards the ClassDojo class story) or as the signed-in learner (real
// Plajah Points + Firestore ledger). Lean by design — quiz games + proficiency + Turbo.

import React, { useEffect, useState } from 'react';
import { ArrowLeft, FlaskConical, Star } from 'lucide-react';
import { DEMO_CLASS } from '../data/demoClassroom';
import { useClassroom, classroomStore } from '../data/classroomStore';
import {
  SCIENCE_PILLARS, standardsForPillar, BAND_TO_GRADES, bandFor, masteryToPISABand,
  turboTrackFor, type GradeId,
} from '../data/educationStandards';
import { appendRecord } from '../services/learningLedgerService';
import { loadReadingProgress, saveReadingProgress } from '../services/readingQuestService';
import { addPoints } from '../services/pointsService';

const T = {
  bg: '#0a0a0f', card: '#12121a', cardAlt: '#15151f', border: '#20202c',
  ink: '#ffffff', muted: '#9a9aa6', orange: '#FF8C00', green: '#5fd17f', gold: '#FFD24A', red: '#ff8080', blue: '#36c5f0', violet: '#8166e6',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

type BandId = 'prek' | 'g12' | 'g34' | 'g57';
type Pillar = typeof SCIENCE_PILLARS[number];
const ME = '__me__';
const PROGRESS_KEY = 'science'; // distinct Firestore doc namespace (see note in saveProgress)

const BANDS: { id: BandId; label: string; sub: string }[] = [
  { id: 'prek', label: 'Pre-K · K', sub: 'Observe the world' },
  { id: 'g12', label: 'Grades 1–2', sub: 'Sort & compare' },
  { id: 'g34', label: 'Grades 3–4', sub: 'Energy & systems' },
  { id: 'g57', label: 'Grades 5–7', sub: 'Models & evidence' },
];

interface Question { prompt: string; options: string[]; answer: number; }
interface Game { id: string; title: string; icon: string; pillar: Pillar; blurb: string; q: Record<BandId, Question[]>; }

const GAMES: Game[] = [
  {
    id: 'observe', title: 'Observe & Explain', icon: '🔬', pillar: 'Observe & Question', blurb: 'Look closely, ask why.',
    q: {
      prek: [
        { prompt: 'A plant needs sunlight and ___ to grow.', options: ['water', 'candy', 'toys'], answer: 0 },
        { prompt: 'Which is a living thing?', options: ['a rock', 'a dog', 'a cup'], answer: 1 },
        { prompt: 'What do animals need to live?', options: ['food and water', 'television', 'shoes'], answer: 0 },
      ],
      g12: [
        { prompt: 'Which property can you observe with your eyes?', options: ['color', 'taste', 'smell'], answer: 0 },
        { prompt: 'Two materials that are both hard:', options: ['rock and metal', 'water and air', 'milk and juice'], answer: 0 },
        { prompt: 'Baby animals usually look ___ their parents.', options: ['exactly like', 'a little like', 'nothing like'], answer: 1 },
      ],
      g34: [
        { prompt: 'Which tool measures temperature?', options: ['thermometer', 'ruler', 'scale'], answer: 0 },
        { prompt: 'A good scientific observation is:', options: ['"The leaf is green and 4 cm long"', '"The leaf is pretty"', '"I like leaves"'], answer: 0 },
        { prompt: 'Energy from the sun reaches us mostly as:', options: ['light and heat', 'sound', 'electricity'], answer: 0 },
      ],
      g57: [
        { prompt: 'Living things are all made of:', options: ['cells', 'metal', 'plastic'], answer: 0 },
        { prompt: 'Which is a testable question?', options: ['Does more sunlight grow taller plants?', 'Is the sky pretty?', 'Do you like science?'], answer: 0 },
        { prompt: 'A hypothesis is best described as:', options: ['a testable prediction', 'a proven fact', 'a wild guess with no reason'], answer: 0 },
      ],
    },
  },
  {
    id: 'data', title: 'Data Lab', icon: '📊', pillar: 'Analyze Data', blurb: 'Find the pattern in the evidence.',
    q: {
      prek: [
        { prompt: 'Which group has MORE?', options: ['🍎🍎🍎', '🍎', '🍎🍎'], answer: 0 },
        { prompt: 'Which does NOT belong with the red things?', options: ['🍓', '🌹', '🫐'], answer: 2 },
        { prompt: 'Which is the biggest?', options: ['🐜', '🐕', '🐘'], answer: 2 },
      ],
      g12: [
        { prompt: 'A chart shows 5 sunny days and 2 rainy days. There were more:', options: ['sunny days', 'rainy days', 'cloudy days'], answer: 0 },
        { prompt: 'Young plants resemble their parents because of:', options: ['inherited traits', 'luck', 'the weather'], answer: 0 },
        { prompt: 'The tallest bar on a graph means:', options: ['the most', 'the least', 'the middle'], answer: 0 },
      ],
      g34: [
        { prompt: 'Data shows a river bank shrinking. The land is being:', options: ['worn away (erosion)', 'built up', 'frozen'], answer: 0 },
        { prompt: 'Which one is data?', options: ['"It rained 3 cm today"', '"Rain is annoying"', '"I hope it rains"'], answer: 0 },
        { prompt: 'Finding a pattern in data helps you:', options: ['make a prediction', 'ignore results', 'change the question'], answer: 0 },
      ],
      g57: [
        { prompt: 'Bubbles and heat when two liquids mix is evidence of:', options: ['a chemical reaction', 'melting', 'freezing'], answer: 0 },
        { prompt: 'To trust a result, scientists:', options: ['repeat the test', 'do it once', 'guess'], answer: 0 },
        { prompt: 'A controlled experiment changes:', options: ['one variable at a time', 'everything at once', 'nothing'], answer: 0 },
      ],
    },
  },
  {
    id: 'explain', title: 'Explain It', icon: '🧩', pillar: 'Explain', blurb: 'Use evidence to say why.',
    q: {
      prek: [
        { prompt: 'Why do we wear coats in winter?', options: ['to stay warm', 'to look tall', 'to run fast'], answer: 0 },
        { prompt: 'A push or a pull can make a toy car:', options: ['move', 'disappear', 'grow'], answer: 0 },
        { prompt: 'Ice turns to water when it gets:', options: ['warmer', 'colder', 'darker'], answer: 0 },
      ],
      g12: [
        { prompt: 'Why does a ball roll down a ramp?', options: ['gravity pulls it', 'it is alive', 'it is scared'], answer: 0 },
        { prompt: 'Sound is made when something:', options: ['vibrates', 'freezes', 'glows'], answer: 0 },
        { prompt: 'Shadows form because light is:', options: ['blocked', 'bent down', 'gone'], answer: 0 },
      ],
      g34: [
        { prompt: 'A flashlight turns electrical energy into:', options: ['light energy', 'sound only', 'no energy'], answer: 0 },
        { prompt: 'Why does a metal spoon get hot in soup?', options: ['heat transfers through it', 'it is magic', 'it is alive'], answer: 0 },
        { prompt: 'Why do life cycles repeat?', options: ['organisms reproduce', 'they get bored', 'the sun tells them'], answer: 0 },
      ],
      g57: [
        { prompt: 'Why can we say living things are made of cells?', options: ['microscopes show cells in them', 'they look alive', 'they move'], answer: 0 },
        { prompt: 'A model is useful because it:', options: ["explains something we can't see directly", 'is always perfect', 'replaces evidence'], answer: 0 },
        { prompt: 'Best evidence a chemical reaction happened:', options: ['a new substance formed', 'it got wet', 'it moved'], answer: 0 },
      ],
    },
  },
];

const seedMastery = (i: number): Record<Pillar, number> => {
  const base = [58, 46, 52, 44, 50];
  const shift = [8, -6, 4, 12, -4, 6][i % 6];
  return Object.fromEntries(SCIENCE_PILLARS.map((p, k) => [p, Math.max(8, Math.min(100, base[k] + shift))])) as Record<Pillar, number>;
};

const cardStyle: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14 };
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, color: color || T.muted, marginBottom: 8 }}>{children}</div>
);
const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div style={{ height: 8, borderRadius: 99, background: '#000', overflow: 'hidden', border: `1px solid ${T.border}` }}>
    <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, transition: 'width .5s ease' }} />
  </div>
);
const primaryBtn = (ghost?: boolean): React.CSSProperties => ({ cursor: 'pointer', padding: '11px 22px', borderRadius: 10, border: ghost ? `1px solid ${T.border}` : 'none', background: ghost ? 'transparent' : T.violet, color: ghost ? T.muted : '#fff', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 });

type Tab = 'play' | 'turbo' | 'class';
const CORE: Pillar[] = ['Observe & Question', 'Analyze Data', 'Explain'];

const ScienceQuestView: React.FC<{ onBack?: () => void; user?: any }> = ({ onBack, user }) => {
  const uid: string | null = user?.uid || null;
  const { students } = useClassroom();
  const [tab, setTab] = useState<Tab>('play');
  const [band, setBand] = useState<BandId>('g34');
  const [studentId, setStudentId] = useState<string>(uid ? ME : DEMO_CLASS.students[0].id);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [questStart, setQuestStart] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [mastery, setMastery] = useState<Record<string, Record<Pillar, number>>>(() =>
    Object.fromEntries(DEMO_CLASS.students.map((s, i) => [s.id, seedMastery(i)]))
  );
  const [myMast, setMyMast] = useState<Record<Pillar, number>>(() => Object.fromEntries(SCIENCE_PILLARS.map(p => [p, 0])) as Record<Pillar, number>);
  const [myXp, setMyXp] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    // Reuse the readingProgress doc store but under a science-namespaced key per pillar so the
    // two cartridges don't collide. (A dedicated scienceProgress collection is a later cleanup.)
    loadReadingProgress(`${uid}__${PROGRESS_KEY}`).then(p => {
      if (alive && p) { setMyMast(m => ({ ...m, ...(p.mastery as any) })); setMyXp(p.xp || 0); }
    });
    return () => { alive = false; };
  }, [uid]);

  const isMe = studentId === ME;
  const demoStudent = students.find(s => s.id === studentId) || students[0];
  const myMastery: Record<Pillar, number> = isMe ? myMast : mastery[studentId];
  const headerPts = isMe ? myXp : demoStudent.points;
  const players = uid ? [{ id: ME, name: 'You', color: T.violet }, ...students] : students;
  const turboReady = CORE.every(p => myMastery[p] >= 90);

  const recordToLedger = (pillar: Pillar, before: number, after: number) => {
    if (!isMe || !uid) return;
    const grades = BAND_TO_GRADES[band] || [];
    const cands = standardsForPillar(pillar, 'NGSS');
    const std = cands.find(s => grades.includes(s.grade)) || cands[0];
    if (std) appendRecord({ studentId: uid, standardId: std.id, framework: std.framework, source: 'science-quest', masteryBefore: before, masteryAfter: after });
  };

  const launchGame = (gameId: string) => {
    const g = GAMES.find(x => x.id === gameId);
    if (g && isMe) setQuestStart(myMast[g.pillar]);
    setActiveGame(gameId);
  };

  const bump = (pillar: Pillar, n: number) => {
    if (isMe) setMyMast(m => ({ ...m, [pillar]: Math.min(100, m[pillar] + n) }));
    else setMastery(m => ({ ...m, [studentId]: { ...m[studentId], [pillar]: Math.min(100, m[studentId][pillar] + n) } }));
  };

  const completeQuest = (gameId: string) => {
    const g = GAMES.find(x => x.id === gameId);
    if (isMe && uid) {
      const nextXp = myXp + 3;
      setMyXp(nextXp);
      const masteryNow = g ? { ...myMast, [g.pillar]: Math.min(100, myMast[g.pillar]) } : myMast;
      saveReadingProgress(`${uid}__${PROGRESS_KEY}`, { mastery: masteryNow as any, completedQuests: [...done, gameId], xp: nextXp });
      addPoints(uid, 3, 'DAILY_ACTIVITY', 'science-quest', gameId).catch(() => {});
      if (g) recordToLedger(g.pillar, questStart, myMast[g.pillar]);
    } else {
      classroomStore.award(studentId, 'science');
    }
    setDone(d => d.includes(gameId) ? d : [...d, gameId]);
    setActiveGame(null);
  };

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '20px 16px 70px', fontFamily: T.font }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#8166e6,#36c5f0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FlaskConical size={22} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>Science Quest</h1>
              <span style={{ background: '#111', color: T.gold, fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2, padding: '3px 8px', borderRadius: 12, border: '1px solid rgba(255,210,74,0.4)' }}>BETA · NGSS</span>
            </div>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12.5 }}>{isMe ? 'Signed in · earns Plajah Points + writes your ledger' : `${DEMO_CLASS.name} · awards the ClassDojo class story`}</p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.violet, fontSize: 18, fontWeight: 900 }}><Star size={15} fill={T.violet} /> {headerPts} pts</div>
        </div>

        <div style={{ ...cardStyle, padding: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: T.muted }}>Playing as</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {players.map(s => {
              const on = s.id === studentId, me = s.id === ME;
              return (
                <button key={s.id} onClick={() => setStudentId(s.id)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 6px', borderRadius: 99, border: `1px solid ${on ? T.violet : T.border}`, background: on ? 'rgba(129,102,230,0.14)' : 'transparent', color: T.ink }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11 }}>{me ? '🙂' : s.name.charAt(0)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{s.name}{me ? ' · real' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '16px 0 20px', flexWrap: 'wrap' }}>
          {([['play', 'Quests'], ['turbo', turboReady ? '⚡ Turbo' : 'Turbo'], ['class', 'Class Progress']] as [Tab, string][]).map(([v, l]) => {
            const lit = tab === v, isTurbo = v === 'turbo';
            return (
              <button key={v} onClick={() => { setTab(v); setActiveGame(null); }}
                style={{ cursor: 'pointer', padding: '8px 15px', borderRadius: 10, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, border: `1px solid ${lit ? T.violet : (isTurbo && turboReady ? T.violet : T.border)}`, background: lit ? T.violet : 'transparent', color: lit ? '#fff' : (isTurbo && turboReady ? T.violet : T.muted) }}>{l}</button>
            );
          })}
        </div>

        {tab === 'play' && !activeGame && <PlayHome band={band} setBand={setBand} done={done} myMastery={myMastery} launch={launchGame} />}
        {tab === 'play' && activeGame && (
          <GamePlay band={band} game={GAMES.find(g => g.id === activeGame)!} isMe={isMe} onCorrect={(p) => bump(p, 6)} onComplete={() => completeQuest(activeGame)} back={() => setActiveGame(null)} />
        )}
        {tab === 'turbo' && <TurboTab band={band} myMastery={myMastery} ready={turboReady} />}
        {tab === 'class' && <ClassProgress students={students} mastery={mastery} />}
      </div>
    </div>
  );
};

const PlayHome: React.FC<{ band: BandId; setBand: (b: BandId) => void; done: string[]; myMastery: Record<Pillar, number>; launch: (id: string) => void }> = ({ band, setBand, done, myMastery, launch }) => {
  const bandObj = BANDS.find(b => b.id === band)!;
  const overall = Math.round(SCIENCE_PILLARS.reduce((a, p) => a + myMastery[p], 0) / SCIENCE_PILLARS.length);
  const ob = bandFor(overall);
  return (
    <div>
      <Eyebrow>Choose your level</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 22 }}>
        {BANDS.map(b => (
          <button key={b.id} onClick={() => setBand(b.id)} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', padding: '11px 13px', color: T.ink, borderColor: band === b.id ? T.violet : T.border, boxShadow: band === b.id ? `0 0 0 1px ${T.violet}` : 'none' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{b.label}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{b.sub}</div>
          </button>
        ))}
      </div>

      <Eyebrow color={T.violet}>✦ {bandObj.label} · Lab Map</Eyebrow>
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 12 }}>
          {GAMES.map(g => {
            const isDone = done.includes(g.id);
            return (
              <button key={g.id} onClick={() => launch(g.id)} style={{ cursor: 'pointer', textAlign: 'left', padding: 15, borderRadius: 12, color: T.ink, border: `1px solid ${isDone ? T.green : T.border}`, background: isDone ? 'rgba(95,209,127,0.08)' : T.cardAlt, position: 'relative' }}>
                <div style={{ fontSize: 26 }}>{g.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4 }}>{g.title}</div>
                <div style={{ fontSize: 12.5, color: T.muted }}>{g.blurb}</div>
                <div style={{ marginTop: 8, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, color: T.violet }}>Practice · {g.pillar}</div>
                {isDone && <div style={{ position: 'absolute', top: 12, right: 14, color: T.green }}>✓</div>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>My science practices</Eyebrow>
        {SCIENCE_PILLARS.map(p => {
          const b = bandFor(myMastery[p]);
          return (
            <div key={p} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span>{p}</span><span style={{ fontSize: 10.5, color: b.color, fontWeight: 700 }}>{b.label} · {myMastery[p]}%</span></div>
              <Bar value={myMastery[p]} color={b.color} />
            </div>
          );
        })}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, color: T.muted }}>Global standing</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: ob.color }}>{ob.label} · PISA band {masteryToPISABand(overall)}/6</span>
        </div>
      </div>
    </div>
  );
};

const GamePlay: React.FC<{ band: BandId; game: Game; isMe: boolean; onCorrect: (p: Pillar) => void; onComplete: () => void; back: () => void }> = ({ band, game, isMe, onCorrect, onComplete, back }) => {
  const questions = game.q[band];
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const finished = idx >= questions.length;
  const q = finished ? null : questions[idx];

  const pick = (i: number) => { if (picked !== null || !q) return; setPicked(i); if (i === q.answer) { setCorrect(c => c + 1); onCorrect(game.pillar); } };

  if (finished) return (
    <div style={{ ...cardStyle, padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>🔬</div>
      <div style={{ fontWeight: 900, fontSize: 24, margin: '8px 0' }}>Lab complete</div>
      <div style={{ color: T.muted, marginBottom: 18 }}>{game.title} · {correct}/{questions.length} correct</div>
      <div style={{ display: 'inline-flex', gap: 18, fontSize: 13, marginBottom: 22, color: T.muted }}>
        <span style={{ color: T.violet, fontWeight: 800 }}>★ +3 {isMe ? 'Plajah Points' : 'Dojo pts'}</span><span style={{ color: T.green }}>▲ {game.pillar} up</span>
      </div>
      <div><button onClick={onComplete} style={primaryBtn()}>Back to lab map →</button></div>
    </div>
  );

  return (
    <div>
      <button onClick={back} style={{ cursor: 'pointer', background: 'none', border: 'none', color: T.muted, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 800 }}>← Lab map</button>
      <div style={{ ...cardStyle, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 800 }}>
          <span style={{ color: T.violet }}>{game.icon} {game.title} · {game.pillar}</span>
          <span style={{ color: T.muted }}>{BANDS.find(b => b.id === band)!.label} · {idx + 1}/{questions.length}</span>
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 18, lineHeight: 1.3 }}>{q!.prompt}</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {q!.options.map((opt, i) => {
            const isPicked = picked === i, isAnswer = i === q!.answer;
            let border = T.border, bg = T.cardAlt;
            if (picked !== null) { if (isAnswer) { border = T.green; bg = 'rgba(95,209,127,0.12)'; } else if (isPicked) { border = T.red; bg = 'rgba(255,128,128,0.12)'; } }
            return (
              <button key={i} onClick={() => pick(i)} disabled={picked !== null} style={{ cursor: picked === null ? 'pointer' : 'default', textAlign: 'left', padding: '14px 16px', borderRadius: 10, border: `1px solid ${border}`, background: bg, color: T.ink, fontSize: 16, fontWeight: 600 }}>
                {opt}
                {picked !== null && isAnswer && <span style={{ float: 'right', color: T.green }}>✓</span>}
                {picked !== null && isPicked && !isAnswer && <span style={{ float: 'right', color: T.red }}>✕</span>}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: picked === q!.answer ? T.green : T.red }}>{picked === q!.answer ? 'Correct — nice reasoning!' : 'Good try — think it through'}</span>
            <button onClick={() => { setPicked(null); setIdx(v => v + 1); }} style={primaryBtn()}>{idx + 1 < questions.length ? 'Next →' : 'Finish →'}</button>
          </div>
        )}
      </div>
    </div>
  );
};

const TurboTab: React.FC<{ band: BandId; myMastery: Record<Pillar, number>; ready: boolean }> = ({ band, myMastery, ready }) => {
  const grade = (BAND_TO_GRADES[band] || ['g3'])[0] as GradeId;
  const track = turboTrackFor('SCIENCE', grade) || turboTrackFor('SCIENCE', 'g3');
  const overall = Math.round(CORE.reduce((a, p) => a + myMastery[p], 0) / CORE.length);
  const KIND: Record<string, { label: string; color: string; icon: string }> = {
    acceleration: { label: 'Accelerate', color: T.violet, icon: '🚀' }, depth: { label: 'Go Deeper', color: T.blue, icon: '🔬' },
    transfer: { label: 'Transfer', color: T.green, icon: '🧩' }, creative: { label: 'Create', color: '#d957c6', icon: '🎨' },
  };
  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 16, borderColor: ready ? T.violet : T.border, boxShadow: ready ? `0 0 0 1px ${T.violet}` : 'none' }}>
        <Eyebrow color={ready ? T.violet : T.muted}>⚡ Turbo · beyond grade level</Eyebrow>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 6 }}>{ready ? "You're ready to go beyond" : 'Turbo unlocks at mastery'}</div>
        <p style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>Real scientists go <b style={{ color: T.ink }}>deeper</b>, not just faster — Turbo adds depth, transfer, and design challenges.</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5, color: T.muted }}><span>Readiness (avg of core practices)</span><span style={{ color: ready ? T.violet : T.muted, fontWeight: 700 }}>{overall}% / 90%</span></div>
          <Bar value={Math.min(100, Math.round((overall / 90) * 100))} color={ready ? T.violet : T.muted} />
        </div>
      </div>
      {!ready && <div style={{ ...cardStyle, padding: 16, color: T.muted, fontSize: 13.5, lineHeight: 1.5 }}>Keep practicing — when your core science practices reach 90%+, Turbo opens. Preview:</div>}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, opacity: ready ? 1 : 0.55 }}>
        {(track?.challenges || []).map(c => {
          const k = KIND[c.kind] || KIND.depth;
          return (
            <div key={c.id} style={{ ...cardStyle, padding: 16, borderColor: ready ? k.color : T.border }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 22 }}>{k.icon}</span><span style={{ fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, color: k.color }}>{k.label}</span></div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.45 }}>{c.prompt}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ClassProgress: React.FC<{ students: { id: string; name: string; color: string; points: number }[]; mastery: Record<string, Record<Pillar, number>> }> = ({ students, mastery }) => {
  const cols: Pillar[] = ['Observe & Question', 'Analyze Data', 'Explain'];
  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 16 }}>
        <Eyebrow color={T.violet}>Science · live progress</Eyebrow>
        <div style={{ fontWeight: 800, fontSize: 20 }}>{DEMO_CLASS.name}</div>
        <div style={{ fontSize: 13, color: T.muted }}>{DEMO_CLASS.teacherName} · {students.length} students · NGSS practice mastery</div>
      </div>
      <div style={{ ...cardStyle, padding: 18, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.7fr', gap: 10, minWidth: 560, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, paddingBottom: 10, borderBottom: `1px solid ${T.border}`, fontWeight: 800 }}>
          <span>Student</span><span>Observe</span><span>Data</span><span>Explain</span><span>Dojo pts</span>
        </div>
        {students.map(s => {
          const m = mastery[s.id];
          const avg = cols.reduce((a, p) => a + m[p], 0) / cols.length;
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.7fr', gap: 10, minWidth: 560, alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, flexShrink: 0 }}>{s.name.charAt(0)}</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name} {avg < 50 && <span style={{ color: T.red }}>▲</span>}</div>
              </div>
              {cols.map(p => (<div key={p}><Bar value={m[p]} color={m[p] < 50 ? T.violet : T.green} /><div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{m[p]}%</div></div>))}
              <div style={{ fontSize: 13, color: T.violet, fontWeight: 800 }}>★ {s.points}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScienceQuestView;
