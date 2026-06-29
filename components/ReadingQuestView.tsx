// ReadingQuestView — gamified, grade-scalable reading practice that lives inside Classrooms
// and plugs into the ClassDojo-style feature set. You play AS a student from the shared demo
// class; finishing a quest or a Phoneme Beat round awards Dojo points through the shared
// classroomStore, so the achievement shows up live in the Dojo class story and the parent view.
//
// Ported from two chat-mode prototypes (reading-quest shell + rhythm/teacher-studio) onto the
// real Plajah classroom theme (dark + orange, the Dojo's visual language). Tone.js is not a
// dependency here, so the rhythm beat uses a tiny native WebAudio click. Clearly DEMO — the
// reading "mastery" model is local/in-memory; only the Dojo point awards are shared.

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Star } from 'lucide-react';
import { DEMO_CLASS } from '../data/demoClassroom';
import { useClassroom, classroomStore } from '../data/classroomStore';
import { loadReadingProgress, saveReadingProgress, awardReadingPoints } from '../services/readingQuestService';

/* ---------- theme (matches ClassroomDojoView) ---------- */
const T = {
  bg: '#0a0a0f', card: '#12121a', cardAlt: '#15151f', border: '#20202c',
  ink: '#ffffff', muted: '#9a9aa6', faint: '#777777',
  orange: '#FF8C00', green: '#5fd17f', gold: '#FFD24A', red: '#ff8080', blue: '#36c5f0',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

type BandId = 'prek' | 'g12' | 'g34' | 'g57';

const BANDS: { id: BandId; label: string; sub: string }[] = [
  { id: 'prek', label: 'Pre-K · K', sub: 'Letters & sounds' },
  { id: 'g12', label: 'Grades 1–2', sub: 'Blending & sight words' },
  { id: 'g34', label: 'Grades 3–4', sub: 'Vocabulary & fluency' },
  { id: 'g57', label: 'Grades 5–7', sub: 'Comprehension & analysis' },
];

const PILLARS = ['Phonemic Awareness', 'Phonics', 'Fluency', 'Vocabulary', 'Comprehension'] as const;
type Pillar = typeof PILLARS[number];

const WORLDS: Record<string, { name: string; chip: string; glow: string; avatar: string; motif: string }> = {
  storybook: { name: 'Storybook', chip: '🏰', glow: '#e0833a', avatar: '🧚', motif: '✦' },
  arcade: { name: 'Arcade', chip: '🕹️', glow: '#d957c6', avatar: '🤖', motif: '◆' },
  cosmos: { name: 'Cosmos', chip: '🚀', glow: '#8166e6', avatar: '👩‍🚀', motif: '★' },
};

interface Question { prompt: string; options: string[]; answer: number; }
interface Game {
  id: string; title: string; icon: string; pillar: Pillar; blurb: string;
  passage?: Record<BandId, string>;
  q: Record<BandId, Question[]>;
}

const GAMES: Game[] = [
  {
    id: 'phonics', title: 'Sound Forge', icon: '🔤', pillar: 'Phonics', blurb: 'Hear it, spot it, build it.',
    q: {
      prek: [
        { prompt: 'Which word starts with the /b/ sound?', options: ['🏀 ball', '☀️ sun', '🐱 cat'], answer: 0 },
        { prompt: 'Which one makes the /m/ sound?', options: ['🌙 moon', '🐶 dog', '🍎 apple'], answer: 0 },
      ],
      g12: [
        { prompt: 'Which word has the /sh/ sound?', options: ['ship', 'sit', 'sip'], answer: 0 },
        { prompt: 'Which word rhymes with “cake”?', options: ['lake', 'cat', 'cup'], answer: 0 },
      ],
      g34: [
        { prompt: 'Which word has a long “a” sound?', options: ['rain', 'ran', 'rat'], answer: 0 },
        { prompt: 'Add a prefix so “happy” means the opposite:', options: ['unhappy', 'rehappy', 'happyful'], answer: 0 },
      ],
      g57: [
        { prompt: 'The root “aqua” in “aquarium” means:', options: ['water', 'air', 'fire'], answer: 0 },
        { prompt: 'The prefix “mis-” in “misjudge” means:', options: ['wrongly', 'again', 'before'], answer: 0 },
      ],
    },
  },
  {
    id: 'vocab', title: 'Meaning Match', icon: '💡', pillar: 'Vocabulary', blurb: 'Connect words to what they mean.',
    q: {
      prek: [
        { prompt: 'Find the dog.', options: ['🐶', '🐟', '🌳'], answer: 0 },
        { prompt: 'Find the sun.', options: ['☀️', '🚗', '🧦'], answer: 0 },
      ],
      g12: [
        { prompt: 'What is a “pond”?', options: ['A small body of water', 'A tall tree', 'A fast car'], answer: 0 },
        { prompt: 'What does “gigantic” mean?', options: ['Very big', 'Very small', 'Very loud'], answer: 0 },
      ],
      g34: [
        { prompt: 'Best meaning of “enormous”:', options: ['Very large', 'Very small', 'Very quiet'], answer: 0 },
        { prompt: 'Something “fragile” will…', options: ['Break easily', 'Run fast', 'Smell good'], answer: 0 },
      ],
      g57: [
        { prompt: '“The hikers were famished, so they ate everything.” Famished means:', options: ['Very hungry', 'Very tired', 'Very lost'], answer: 0 },
        { prompt: '“Her tone was so sincere no one doubted her.” Sincere means:', options: ['Honest and genuine', 'Funny', 'Loud'], answer: 0 },
      ],
    },
  },
  {
    id: 'story', title: 'Story Quest', icon: '📖', pillar: 'Comprehension', blurb: 'Read the passage, then answer.',
    passage: {
      prek: 'Sam has a red hat. Sam runs in the sun. Sam is happy.',
      g12: 'The little frog wanted to cross the pond. He hopped on a lily pad, then on a log. At last he reached the other side and found his friends.',
      g34: 'Maya forgot her umbrella, and dark clouds rolled in. She walked faster, glancing at the sky. Just as the first drops fell, her brother pulled up in the car and waved her in.',
      g57: 'Devon practiced the same passage every night, even when his fingers ached and the notes blurred. The recital was weeks away, but he refused to skip a single evening. When the night finally came, his hands were steady.',
    },
    q: {
      prek: [
        { prompt: 'What color is Sam’s hat?', options: ['Red', 'Blue', 'Green'], answer: 0 },
        { prompt: 'Where does Sam run?', options: ['In the sun', 'In the rain', 'In the snow'], answer: 0 },
      ],
      g12: [
        { prompt: 'How did the frog cross the pond?', options: ['Hopping on lily pads and a log', 'Swimming fast', 'Flying'], answer: 0 },
        { prompt: 'What did the frog find?', options: ['His friends', 'A snack', 'A boat'], answer: 0 },
      ],
      g34: [
        { prompt: 'Why did Maya walk faster?', options: ['She saw it was about to rain', 'She was late', 'She wanted exercise'], answer: 0 },
        { prompt: 'How did Maya likely feel when her brother arrived?', options: ['Relieved', 'Angry', 'Bored'], answer: 0 },
      ],
      g57: [
        { prompt: 'What is the main idea?', options: ['Consistent practice leads to success', 'Recitals are stressful', 'Music is hard'], answer: 0 },
        { prompt: 'Why were Devon’s hands steady?', options: ['He practiced consistently', 'He was lucky', 'He skipped practice'], answer: 0 },
      ],
    },
  },
];

// Plajah Chora — kid-safe sample catalog with BPM that drives the rhythm groove.
const CHORA = [
  { id: 't1', title: 'Count With Me', artist: 'Plajah Kids', bpm: 96, tag: 'Kids' },
  { id: 't2', title: 'Detroit Sunrise', artist: 'K. Moody', bpm: 88, tag: 'Lo-fi' },
  { id: 't3', title: "In My Father's Hands", artist: 'Plajah Worship', bpm: 72, tag: 'Worship' },
  { id: 't4', title: 'Motor City Bounce', artist: 'Plajah Sessions', bpm: 110, tag: 'Afrobeat' },
];
type Track = typeof CHORA[number];

const RHYTHM: Record<BandId, { pillar: Pillar; words: string[][] }> = {
  prek: { pillar: 'Phonemic Awareness', words: [['c', 'a', 't'], ['s', 'u', 'n'], ['d', 'o', 'g']] },
  g12: { pillar: 'Phonics', words: [['sh', 'i', 'p'], ['f', 'r', 'o', 'g'], ['r', 'ai', 'n']] },
  g34: { pillar: 'Fluency', words: [['rab', 'bit'], ['pic', 'nic'], ['sun', 'set']] },
  g57: { pillar: 'Vocabulary', words: [['ad', 'ven', 'ture'], ['cel', 'e', 'brate'], ['im', 'por', 'tant']] },
};

// Seed reading mastery per demo student (0–100 per pillar). Quests nudge these in-session.
const seedMastery = (i: number): Record<Pillar, number> => {
  const base = [62, 48, 40, 55, 50];
  const shift = [6, -4, 10, -8, 14, 2][i % 6];
  return Object.fromEntries(PILLARS.map((p, k) => [p, Math.max(8, Math.min(100, base[k] + shift))])) as Record<Pillar, number>;
};

/* ---------- native WebAudio click (no Tone.js dependency) ---------- */
let actx: AudioContext | null = null;
function ensureAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* audio optional */ }
}
function click(strong: boolean) {
  if (!actx) return;
  try {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'square';
    o.frequency.value = strong ? 220 : 440;
    const t0 = actx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(strong ? 0.3 : 0.18, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g); g.connect(actx.destination);
    o.start(t0); o.stop(t0 + 0.13);
  } catch { /* ignore */ }
}
function say(word: string) {
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  } catch { /* tts optional */ }
}

/* ---------- shared little UI bits ---------- */
const cardStyle: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14 };
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, color: color || T.muted, marginBottom: 8 }}>{children}</div>
);
const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div style={{ height: 8, borderRadius: 99, background: '#000', overflow: 'hidden', border: `1px solid ${T.border}` }}>
    <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, transition: 'width .5s ease' }} />
  </div>
);
const chip = (on: boolean): React.CSSProperties => ({ cursor: 'pointer', padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: `1px solid ${on ? T.orange : T.border}`, background: on ? 'rgba(255,140,0,0.14)' : 'transparent', color: on ? T.orange : T.ink });
const primaryBtn = (ghost?: boolean): React.CSSProperties => ({ cursor: 'pointer', padding: '11px 22px', borderRadius: 10, border: ghost ? `1px solid ${T.border}` : 'none', background: ghost ? 'transparent' : T.orange, color: ghost ? T.muted : '#1a1a1a', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 });
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.ink, fontSize: 14, boxSizing: 'border-box', fontFamily: T.font };

type Tab = 'play' | 'rhythm' | 'studio' | 'class';
const ME = '__me__'; // sentinel id for the signed-in player (real Firestore + points)
const zeroMastery = (): Record<Pillar, number> => Object.fromEntries(PILLARS.map(p => [p, 0])) as Record<Pillar, number>;

/* ============================================================ */
const ReadingQuestView: React.FC<{ onBack?: () => void; user?: any }> = ({ onBack, user }) => {
  const uid: string | null = user?.uid || null;
  const { students } = useClassroom();
  const [tab, setTab] = useState<Tab>('play');
  const [band, setBand] = useState<BandId>('g12');
  const [worldKey, setWorldKey] = useState('storybook');
  const [studentId, setStudentId] = useState<string>(uid ? ME : DEMO_CLASS.students[0].id);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]); // demo-student completions (session only)
  const [mastery, setMastery] = useState<Record<string, Record<Pillar, number>>>(() =>
    Object.fromEntries(DEMO_CLASS.students.map((s, i) => [s.id, seedMastery(i)]))
  );
  // Signed-in player's own progress — persisted to Firestore via readingQuestService.
  const [myProgress, setMyProgress] = useState<{ mastery: Record<Pillar, number>; completedQuests: string[]; xp: number }>(
    () => ({ mastery: zeroMastery(), completedQuests: [], xp: 0 })
  );
  const [customQuests, setCustomQuests] = useState<any[]>([]);

  // Load the signed-in user's saved progress once.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    loadReadingProgress(uid).then(p => {
      if (alive && p) setMyProgress({ mastery: { ...zeroMastery(), ...p.mastery }, completedQuests: p.completedQuests, xp: p.xp });
    });
    return () => { alive = false; };
  }, [uid]);

  const isMe = studentId === ME;
  const world = WORLDS[worldKey];
  const demoStudent = students.find(s => s.id === studentId) || students[0];
  const myMastery: Record<Pillar, number> = isMe ? myProgress.mastery : mastery[studentId];
  const doneList = isMe ? myProgress.completedQuests : done;
  const headerPts = isMe ? myProgress.xp : demoStudent.points;
  const playerName = isMe ? 'You' : demoStudent.name;
  const players = uid ? [{ id: ME, name: 'You', color: T.orange }, ...students] : students;

  const bump = (pillar: Pillar, n: number) => {
    if (isMe) {
      setMyProgress(prev => ({ ...prev, mastery: { ...prev.mastery, [pillar]: Math.min(100, prev.mastery[pillar] + n), Fluency: Math.min(100, prev.mastery.Fluency + Math.round(n / 3)) } }));
    } else {
      setMastery(m => ({ ...m, [studentId]: { ...m[studentId], [pillar]: Math.min(100, m[studentId][pillar] + n), Fluency: Math.min(100, m[studentId].Fluency + Math.round(n / 3)) } }));
    }
  };

  // Quest finished. Signed-in player: persist progress + award REAL Plajah Points.
  // Demo student: award through the shared store so it lands in the ClassDojo class story.
  const completeQuest = (gameId: string) => {
    if (isMe && uid) {
      const completedQuests = myProgress.completedQuests.includes(gameId) ? myProgress.completedQuests : [...myProgress.completedQuests, gameId];
      const next = { mastery: myProgress.mastery, completedQuests, xp: myProgress.xp + 3 };
      setMyProgress(next);
      saveReadingProgress(uid, next);
      awardReadingPoints(uid, 'quest', gameId);
    } else {
      setDone(d => d.includes(gameId) ? d : [...d, gameId]);
      classroomStore.award(studentId, 'reading');
    }
    setActiveGame(null);
  };

  const completePhoneme = (pillar: Pillar) => {
    if (isMe && uid) {
      const nextMastery = { ...myProgress.mastery, [pillar]: Math.min(100, myProgress.mastery[pillar] + 5), Fluency: Math.min(100, myProgress.mastery.Fluency + 2) };
      const next = { mastery: nextMastery, completedQuests: myProgress.completedQuests, xp: myProgress.xp + 2 };
      setMyProgress(next);
      saveReadingProgress(uid, next);
      awardReadingPoints(uid, 'phoneme', `phoneme-${pillar}`);
    } else {
      bump(pillar, 5);
      classroomStore.award(studentId, 'phoneme');
    }
  };

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '20px 16px 70px', fontFamily: T.font }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BookOpen size={22} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>Reading Quest</h1>
              <span style={{ background: '#111', color: T.gold, fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2, padding: '3px 8px', borderRadius: 12, border: '1px solid rgba(255,210,74,0.4)' }}>BETA · DEMO</span>
            </div>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12.5 }}>{isMe ? 'Signed in · earns real Plajah Points, progress saved to your account' : `${DEMO_CLASS.name} · awards points to the ClassDojo class story`}</p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.orange, fontSize: 18, fontWeight: 900 }}><Star size={15} fill={T.orange} /> {headerPts} pts</div>
        </div>

        {/* who's playing — the Dojo bridge */}
        <div style={{ ...cardStyle, padding: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: T.muted }}>Playing as</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {players.map(s => {
              const on = s.id === studentId;
              const me = s.id === ME;
              return (
                <button key={s.id} onClick={() => setStudentId(s.id)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 6px', borderRadius: 99, border: `1px solid ${on ? T.orange : T.border}`, background: on ? 'rgba(255,140,0,0.12)' : 'transparent', color: T.ink }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11 }}>{me ? '🙂' : s.name.charAt(0)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{s.name}{me ? ' · real' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 8, margin: '16px 0 20px', flexWrap: 'wrap' }}>
          {([['play', 'Quests'], ['rhythm', 'Rhythm'], ['studio', 'Teacher Studio'], ['class', 'Class Progress']] as [Tab, string][]).map(([v, l]) => (
            <button key={v} onClick={() => { setTab(v); setActiveGame(null); }}
              style={{ cursor: 'pointer', padding: '8px 15px', borderRadius: 10, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, border: `1px solid ${tab === v ? T.orange : T.border}`, background: tab === v ? T.orange : 'transparent', color: tab === v ? '#1a1a1a' : T.muted }}>{l}</button>
          ))}
        </div>

        {tab === 'play' && !activeGame && (
          <PlayHome {...{ world, worldKey, setWorldKey, band, setBand, done: doneList, myMastery, setActiveGame }} />
        )}
        {tab === 'play' && activeGame && (
          <GamePlay
            world={world} band={band} game={GAMES.find(g => g.id === activeGame)!}
            isMe={isMe}
            onCorrect={(pillar) => bump(pillar, 6)}
            onComplete={() => completeQuest(activeGame)}
            back={() => setActiveGame(null)}
          />
        )}
        {tab === 'rhythm' && (
          <RhythmTab band={band} setBand={setBand} isMe={isMe} onComplete={(pillar) => completePhoneme(pillar)} studentName={playerName} />
        )}
        {tab === 'studio' && <TeacherStudio customQuests={customQuests} setCustomQuests={setCustomQuests} />}
        {tab === 'class' && <ClassProgress students={students} mastery={mastery} />}
      </div>
    </div>
  );
};

/* ---------- Quests home (avatar, band, quest map) ---------- */
const PlayHome: React.FC<any> = ({ world, worldKey, setWorldKey, band, setBand, done, myMastery, setActiveGame }) => {
  const bandObj = BANDS.find(b => b.id === band)!;
  return (
    <div>
      {/* world skin + avatar */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 60, height: 60, borderRadius: 14, background: `${world.glow}22`, border: `1px solid ${world.glow}`, display: 'grid', placeItems: 'center', fontSize: 32, flexShrink: 0 }}>{world.avatar}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Eyebrow>World</Eyebrow>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(WORLDS).map(([k, wd]) => (
              <button key={k} onClick={() => setWorldKey(k)}
                style={{ cursor: 'pointer', padding: '7px 11px', borderRadius: 8, fontSize: 16, background: worldKey === k ? T.cardAlt : 'transparent', border: `1px solid ${worldKey === k ? wd.glow : T.border}`, boxShadow: worldKey === k ? `0 0 0 1px ${wd.glow}` : 'none' }}>{wd.chip}</button>
            ))}
          </div>
        </div>
      </div>

      {/* grade band */}
      <Eyebrow>Choose your level</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 22 }}>
        {BANDS.map(b => (
          <button key={b.id} onClick={() => setBand(b.id)}
            style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', padding: '11px 13px', color: T.ink, borderColor: band === b.id ? T.orange : T.border, boxShadow: band === b.id ? `0 0 0 1px ${T.orange}` : 'none' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{b.label}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{b.sub}</div>
          </button>
        ))}
      </div>

      {/* quest map */}
      <Eyebrow color={world.glow}>{world.motif} {bandObj.label} · Quest Map</Eyebrow>
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 12 }}>
          {GAMES.map(g => {
            const isDone = done.includes(g.id);
            return (
              <button key={g.id} onClick={() => setActiveGame(g.id)}
                style={{ cursor: 'pointer', textAlign: 'left', padding: 15, borderRadius: 12, color: T.ink, border: `1px solid ${isDone ? T.green : T.border}`, background: isDone ? 'rgba(95,209,127,0.08)' : T.cardAlt, position: 'relative' }}>
                <div style={{ fontSize: 26 }}>{g.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4 }}>{g.title}</div>
                <div style={{ fontSize: 12.5, color: T.muted }}>{g.blurb}</div>
                <div style={{ marginTop: 8, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, color: T.orange }}>Pillar · {g.pillar}</div>
                {isDone && <div style={{ position: 'absolute', top: 12, right: 14, color: T.green }}>✓</div>}
              </button>
            );
          })}
          {[['🔢', 'Math Quest'], ['🔬', 'Science Quest']].map(([icon, name]) => (
            <div key={name} style={{ padding: 15, borderRadius: 12, border: `1px dashed ${T.border}`, opacity: 0.5 }}>
              <div style={{ fontSize: 26 }}>{icon}</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4 }}>{name}</div>
              <div style={{ fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, marginTop: 6, fontWeight: 800 }}>Same engine · next</div>
            </div>
          ))}
        </div>
      </div>

      {/* my pillars */}
      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>My reading pillars</Eyebrow>
        {PILLARS.map(p => (
          <div key={p} style={{ marginBottom: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span>{p}</span><span style={{ fontSize: 11, color: T.muted }}>{myMastery[p]}%</span></div>
            <Bar value={myMastery[p]} color={myMastery[p] < 50 ? T.orange : T.green} />
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------- quiz gameplay ---------- */
const GamePlay: React.FC<{ world: any; band: BandId; game: Game; isMe: boolean; onCorrect: (p: Pillar) => void; onComplete: () => void; back: () => void }> = ({ world, band, game, isMe, onCorrect, onComplete, back }) => {
  const questions = game.q[band];
  const passage = game.passage ? game.passage[band] : null;
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const finished = idx >= questions.length;
  const q = finished ? null : questions[idx];

  const pick = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    if (i === q.answer) { setCorrectCount(c => c + 1); onCorrect(game.pillar); }
  };
  const next = () => { setPicked(null); setIdx(v => v + 1); };

  if (finished) {
    return (
      <div style={{ ...cardStyle, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>{world.motif}</div>
        <div style={{ fontWeight: 900, fontSize: 24, margin: '8px 0' }}>Quest complete</div>
        <div style={{ color: T.muted, marginBottom: 18 }}>{game.title} · {correctCount}/{questions.length} correct</div>
        <div style={{ display: 'inline-flex', gap: 18, fontSize: 13, marginBottom: 22, color: T.muted }}>
          <span style={{ color: T.orange, fontWeight: 800 }}>★ +3 {isMe ? 'Plajah Points' : 'Dojo pts'}</span><span style={{ color: T.green }}>▲ {game.pillar} up</span>
        </div>
        <div>
          <button onClick={onComplete} style={primaryBtn()}>Back to map →</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={back} style={{ cursor: 'pointer', background: 'none', border: 'none', color: T.muted, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 800 }}>← Quest map</button>
      <div style={{ ...cardStyle, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 800 }}>
          <span style={{ color: T.orange }}>{game.icon} {game.title} · {game.pillar}</span>
          <span style={{ color: T.muted }}>{BANDS.find(b => b.id === band)!.label} · {idx + 1}/{questions.length}</span>
        </div>

        {passage && (
          <div style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.orange}`, borderRadius: 8, padding: 16, marginBottom: 18, fontSize: 16, lineHeight: 1.55, fontStyle: 'italic' }}>{passage}</div>
        )}

        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 18, lineHeight: 1.3 }}>{q!.prompt}</div>

        <div style={{ display: 'grid', gap: 10 }}>
          {q!.options.map((opt, i) => {
            const isPicked = picked === i, isAnswer = i === q!.answer;
            let border = T.border, bg = T.cardAlt;
            if (picked !== null) {
              if (isAnswer) { border = T.green; bg = 'rgba(95,209,127,0.12)'; }
              else if (isPicked) { border = T.red; bg = 'rgba(255,128,128,0.12)'; }
            }
            return (
              <button key={i} onClick={() => pick(i)} disabled={picked !== null}
                style={{ cursor: picked === null ? 'pointer' : 'default', textAlign: 'left', padding: '14px 16px', borderRadius: 10, border: `1px solid ${border}`, background: bg, color: T.ink, fontSize: 16, fontWeight: 600 }}>
                {opt}
                {picked !== null && isAnswer && <span style={{ float: 'right', color: T.green }}>✓</span>}
                {picked !== null && isPicked && !isAnswer && <span style={{ float: 'right', color: T.red }}>✕</span>}
              </button>
            );
          })}
        </div>

        {picked !== null && (
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: picked === q!.answer ? T.green : T.red }}>
              {picked === q!.answer ? 'Nice! Pillar strengthened' : 'Good try — keep going'}
            </span>
            <button onClick={next} style={primaryBtn()}>{idx + 1 < questions.length ? 'Next →' : 'Finish →'}</button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------- rhythm tab + Phoneme Beat ---------- */
const RhythmTab: React.FC<{ band: BandId; setBand: (b: BandId) => void; isMe: boolean; onComplete: (p: Pillar) => void; studentName: string }> = ({ band, setBand, isMe, onComplete, studentName }) => {
  const [track, setTrack] = useState<Track>(CHORA[0]);
  return (
    <div>
      <Eyebrow>Level</Eyebrow>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {BANDS.map(b => <button key={b.id} onClick={() => setBand(b.id)} style={chip(band === b.id)}>{b.label}</button>)}
      </div>

      {/* Chora picker */}
      <div style={{ ...cardStyle, padding: 14, marginBottom: 16 }}>
        <Eyebrow color={T.orange}>♪ Plajah Chora · backing track</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 8 }}>
          {CHORA.map(tk => {
            const on = track.id === tk.id;
            return (
              <button key={tk.id} onClick={() => setTrack(tk)}
                style={{ cursor: 'pointer', textAlign: 'left', padding: '10px 12px', borderRadius: 10, background: on ? T.cardAlt : 'transparent', border: `1px solid ${on ? T.orange : T.border}`, color: T.ink }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{tk.title}</span>
                  <span style={{ fontSize: 10, color: T.muted }}>{tk.bpm} BPM</span>
                </div>
                <div style={{ fontSize: 12, color: T.muted }}>{tk.artist} · <span style={{ color: T.green }}>{tk.tag}</span> · <span style={{ color: T.green }}>✓ kid-safe</span></div>
              </button>
            );
          })}
        </div>
      </div>

      <PhonemeBeat band={band} track={track} isMe={isMe} onComplete={onComplete} studentName={studentName} />

      <div style={{ ...cardStyle, padding: 16, marginTop: 16 }}>
        <Eyebrow>More rhythm modes (same engine)</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
          {[
            ['🥁 Phoneme Beat', 'Blend sounds on the beat', 'playable now'],
            ['🎤 Read-Aloud Karaoke', 'Lyrics light up to a Chora track — read along for fluency', 'next'],
            ['💧 Rhyme Drop', 'Tap only the words that rhyme as they fall on the beat', 'next'],
            ['⚡ Sight-Word Groove', 'Tap when the target word flashes on beat', 'next'],
            ['🔡 Beat Spelling', 'Spell the word, one letter per beat', 'next'],
          ].map(([t, d, s]) => (
            <div key={t} style={{ padding: 12, borderRadius: 10, border: `1px ${s === 'playable now' ? 'solid ' + T.green : 'dashed ' + T.border}`, background: s === 'playable now' ? 'rgba(95,209,127,0.06)' : 'transparent' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div>
              <div style={{ fontSize: 12, color: T.muted, margin: '2px 0 6px' }}>{d}</div>
              <div style={{ fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, color: s === 'playable now' ? T.green : T.muted }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const PhonemeBeat: React.FC<{ band: BandId; track: Track; isMe: boolean; onComplete: (p: Pillar) => void; studentName: string }> = ({ band, track, isMe, onComplete, studentName }) => {
  const words = RHYTHM[band].words;
  const pillar = RHYTHM[band].pillar;
  const bpm = track.bpm || 96;
  const beatMs = Math.round(60000 / bpm);

  const [phase, setPhase] = useState<'idle' | 'count' | 'play' | 'done'>('idle');
  const [wordIdx, setWordIdx] = useState(0);
  const [lit, setLit] = useState(-1);
  const [hits, setHits] = useState<Record<string, boolean>>({});
  const [count, setCount] = useState(3);
  const [score, setScore] = useState({ hit: 0, total: 0 });

  const litRef = useRef(-1);
  const wordRef = useRef(0);
  const hitsRef = useRef<Record<string, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const start = () => {
    ensureAudio();
    setHits({}); hitsRef.current = {};
    setScore({ hit: 0, total: words.reduce((a, w) => a + w.length, 0) });
    setWordIdx(0); wordRef.current = 0;
    setLit(-1); litRef.current = -1;
    setCount(3); setPhase('count');
    loop(3);
  };

  // self-rescheduling beat clock: countdown → play
  const loop = (c: number) => {
    click(true);
    if (c > 1) { setCount(c - 1); timerRef.current = setTimeout(() => loop(c - 1), beatMs); return; }
    setPhase('play');
    litRef.current = 0; setLit(0);
    timerRef.current = setTimeout(stepBeat, beatMs);
  };

  const stepBeat = () => {
    const w = words[wordRef.current];
    const nextLit = litRef.current + 1;
    if (nextLit < w.length) {
      litRef.current = nextLit; setLit(nextLit); click(false);
      timerRef.current = setTimeout(stepBeat, beatMs);
    } else {
      litRef.current = -1; setLit(-1);
      say(w.join(''));
      const nextWord = wordRef.current + 1;
      if (nextWord < words.length) {
        wordRef.current = nextWord;
        timerRef.current = setTimeout(() => {
          setWordIdx(nextWord);
          litRef.current = 0; setLit(0); click(false);
          timerRef.current = setTimeout(stepBeat, beatMs);
        }, beatMs);
      } else {
        timerRef.current = setTimeout(() => {
          const totalHits = Object.keys(hitsRef.current).length;
          setScore(s => ({ ...s, hit: totalHits }));
          if (totalHits > 0) onComplete(pillar);
          setPhase('done');
        }, beatMs);
      }
    }
  };

  const tapTile = (i: number) => {
    if (phase !== 'play') return;
    if (i !== litRef.current) return;
    const key = `${wordRef.current}-${i}`;
    if (hitsRef.current[key]) return;
    hitsRef.current = { ...hitsRef.current, [key]: true };
    setHits({ ...hitsRef.current });
    click(false);
  };

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase('idle'); setLit(-1); litRef.current = -1; setWordIdx(0); wordRef.current = 0;
  };

  const word = words[wordIdx];

  return (
    <div style={{ ...cardStyle, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800 }}>
        <span style={{ color: T.orange }}>🥁 Phoneme Beat · {pillar}</span>
        <span style={{ color: T.muted }}>{track.title} · {bpm} BPM</span>
      </div>

      {phase === 'idle' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 20, marginBottom: 8, fontWeight: 800 }}>Tap each sound on the beat to build the word</div>
          <div style={{ color: T.muted, marginBottom: 20, fontSize: 14 }}>The groove follows your Chora track. {studentName}, ready?</div>
          <button onClick={start} style={primaryBtn()}>▶ Start to the beat</button>
        </div>
      )}

      {phase === 'count' && (
        <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 64, fontWeight: 900, color: T.orange }}>{count}</div>
      )}

      {(phase === 'play' || phase === 'done') && (
        <div>
          <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, marginBottom: 14, fontWeight: 700 }}>Word {Math.min(wordIdx + 1, words.length)} of {words.length}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            {word.map((tile, i) => {
              const key = `${wordIdx}-${i}`;
              const isLit = lit === i, isHit = hits[key];
              let bg = T.cardAlt, border = T.border, scale = 1;
              if (isHit) { bg = 'rgba(95,209,127,0.18)'; border = T.green; }
              if (isLit) { border = T.orange; bg = 'rgba(255,140,0,0.18)'; scale = 1.12; }
              return (
                <button key={i} onClick={() => tapTile(i)}
                  style={{ cursor: 'pointer', minWidth: 64, padding: '20px 18px', borderRadius: 14, border: `2px solid ${border}`, background: bg, color: T.ink, fontWeight: 800, fontSize: 30, transform: `scale(${scale})`, transition: 'transform .12s, background .12s, border-color .12s' }}>{tile}</button>
              );
            })}
          </div>
          {phase === 'play' && lit === -1 && (
            <div style={{ textAlign: 'center', fontSize: 32, fontWeight: 800, color: T.green }}>{word.join('')} ✓</div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: 900, fontSize: 22 }}>Great rhythm!</div>
          <div style={{ color: T.muted, margin: '6px 0 16px' }}>You hit {score.hit} of {score.total} beats · <span style={{ color: T.orange }}>★ +2 {isMe ? 'Plajah Points' : 'Dojo pts'}</span></div>
          <button onClick={reset} style={primaryBtn()}>Play again</button>
        </div>
      )}
    </div>
  );
};

/* ---------- Teacher Studio (authoring) ---------- */
const TeacherStudio: React.FC<{ customQuests: any[]; setCustomQuests: React.Dispatch<React.SetStateAction<any[]>> }> = ({ customQuests, setCustomQuests }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'quiz' | 'rhythm' | 'karaoke'>('quiz');
  const [band, setBand] = useState<BandId>('g12');
  const [pillar, setPillar] = useState<Pillar>('Phonics');
  const [track, setTrack] = useState<Track>(CHORA[0]);
  const [questions, setQuestions] = useState<Question[]>([{ prompt: '', options: ['', '', ''], answer: 0 }]);
  const [words, setWords] = useState('ship, frog, rain');
  const [passage, setPassage] = useState('');

  const addQ = () => setQuestions(q => [...q, { prompt: '', options: ['', '', ''], answer: 0 }]);
  const setQ = (i: number, patch: Partial<Question>) => setQuestions(q => q.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  const setOpt = (i: number, oi: number, val: string) => setQuestions(q => q.map((row, idx) => idx === i ? { ...row, options: row.options.map((o, j) => j === oi ? val : o) } : row));
  const delQ = (i: number) => setQuestions(q => q.filter((_, idx) => idx !== i));

  const summary = () => {
    if (type === 'quiz') return `${questions.filter(q => q.prompt).length} questions`;
    if (type === 'rhythm') return `${words.split(',').filter(w => w.trim()).length} words · ${track.title}`;
    return `Karaoke · ${track.title}`;
  };
  const valid = () => {
    if (!name.trim()) return false;
    if (type === 'quiz') return questions.some(q => q.prompt.trim());
    if (type === 'rhythm') return words.trim().length > 0;
    return passage.trim().length > 0;
  };
  const save = () => {
    setCustomQuests(c => [{ id: Date.now(), name, type, band, pillar, track: type !== 'quiz' ? track.title : null, summary: summary() }, ...c]);
    setName(''); setQuestions([{ prompt: '', options: ['', '', ''], answer: 0 }]); setPassage('');
  };

  const label: React.CSSProperties = { fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.muted, marginBottom: 6, fontWeight: 800 };

  return (
    <div>
      <div style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
        <Eyebrow color={T.orange}>Quest Builder</Eyebrow>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 16 }}>Create a custom quest or test</div>

        <div style={{ marginBottom: 14 }}>
          <div style={label}>Quest name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Friday Phonics Challenge" style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={label}>Game type</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([['quiz', 'Quiz'], ['rhythm', 'Rhythm'], ['karaoke', 'Karaoke']] as ['quiz' | 'rhythm' | 'karaoke', string][]).map(([v, l]) => (
                <button key={v} onClick={() => setType(v)} style={chip(type === v)}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={label}>Grade band</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BANDS.map(b => <button key={b.id} onClick={() => setBand(b.id)} style={chip(band === b.id)}>{b.label}</button>)}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={label}>Reading pillar</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PILLARS.map(p => <button key={p} onClick={() => setPillar(p)} style={chip(pillar === p)}>{p}</button>)}
          </div>
        </div>

        {type === 'quiz' && (
          <div style={{ marginBottom: 8 }}>
            <div style={label}>Questions</div>
            {questions.map((q, i) => (
              <div key={i} style={{ ...cardStyle, padding: 12, marginBottom: 10, background: T.cardAlt }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={q.prompt} onChange={e => setQ(i, { prompt: e.target.value })} placeholder={`Question ${i + 1}`} style={inputStyle} />
                  {questions.length > 1 && <button onClick={() => delQ(i)} style={{ ...primaryBtn(true), padding: '0 10px', color: T.red }}>✕</button>}
                </div>
                {q.options.map((o, oi) => (
                  <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <button onClick={() => setQ(i, { answer: oi })} title="Mark correct"
                      style={{ cursor: 'pointer', width: 22, height: 22, borderRadius: 99, flexShrink: 0, border: `2px solid ${q.answer === oi ? T.green : T.border}`, background: q.answer === oi ? T.green : 'transparent', color: '#0c0a08', fontSize: 12 }}>{q.answer === oi ? '✓' : ''}</button>
                    <input value={o} onChange={e => setOpt(i, oi, e.target.value)} placeholder={`Option ${oi + 1}`} style={inputStyle} />
                  </div>
                ))}
              </div>
            ))}
            <button onClick={addQ} style={{ ...primaryBtn(true), border: `1px dashed ${T.border}` }}>+ Add question</button>
          </div>
        )}

        {type === 'rhythm' && (
          <div style={{ marginBottom: 8 }}>
            <div style={label}>Target words (comma-separated · use “/” to set beat tiles, e.g. ad/ven/ture)</div>
            <input value={words} onChange={e => setWords(e.target.value)} style={inputStyle} />
            <div style={{ marginTop: 12, fontSize: 11, color: T.muted }}>Backing track: <b style={{ color: T.ink }}>{track.title}</b> · {track.bpm} BPM</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {CHORA.map(tk => <button key={tk.id} onClick={() => setTrack(tk)} style={chip(track.id === tk.id)}>{tk.title}</button>)}
            </div>
          </div>
        )}

        {type === 'karaoke' && (
          <div style={{ marginBottom: 8 }}>
            <div style={label}>Passage / lyrics to read along</div>
            <textarea value={passage} onChange={e => setPassage(e.target.value)} rows={4} placeholder="Paste the lines students will read in time with the track…" style={{ ...inputStyle, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {CHORA.map(tk => <button key={tk.id} onClick={() => setTrack(tk)} style={chip(track.id === tk.id)}>{tk.title}</button>)}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={save} disabled={!valid()} style={{ ...primaryBtn(), opacity: valid() ? 1 : 0.4, cursor: valid() ? 'pointer' : 'not-allowed' }}>Save &amp; assign</button>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 18 }}>
        <Eyebrow>Your custom quests</Eyebrow>
        {customQuests.length === 0 && <div style={{ color: T.muted, fontSize: 14 }}>Nothing yet — build one above and it lands here, ready to assign to your class.</div>}
        {customQuests.map(q => (
          <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${T.border}`, gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{q.name}</div>
              <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, marginTop: 2, fontWeight: 700 }}>{q.type} · {BANDS.find(b => b.id === q.band)!.label} · {q.pillar} · {q.summary}</div>
            </div>
            <span style={{ fontSize: 10, color: T.green, border: `1px solid ${T.green}`, borderRadius: 99, padding: '4px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>assignable</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------- Class Progress (teacher dashboard) ---------- */
const ClassProgress: React.FC<{ students: { id: string; name: string; color: string; points: number }[]; mastery: Record<string, Record<Pillar, number>> }> = ({ students, mastery }) => {
  const cols: Pillar[] = ['Phonics', 'Vocabulary', 'Comprehension'];
  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 16 }}>
        <Eyebrow color={T.orange}>Reading · live progress</Eyebrow>
        <div style={{ fontWeight: 800, fontSize: 20 }}>{DEMO_CLASS.name}</div>
        <div style={{ fontSize: 13, color: T.muted }}>{DEMO_CLASS.teacherName} · {students.length} students · reading mastery by pillar</div>
      </div>
      <div style={{ ...cardStyle, padding: 18, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.7fr', gap: 10, minWidth: 560, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, paddingBottom: 10, borderBottom: `1px solid ${T.border}`, fontWeight: 800 }}>
          <span>Student</span><span>Phonics</span><span>Vocab</span><span>Compreh.</span><span>Dojo pts</span>
        </div>
        {students.map(s => {
          const m = mastery[s.id];
          const avg = cols.reduce((a, p) => a + m[p], 0) / cols.length;
          const flag = avg < 50;
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.7fr', gap: 10, minWidth: 560, alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, flexShrink: 0 }}>{s.name.charAt(0)}</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name} {flag && <span style={{ color: T.red }} title="Needs support">▲</span>}</div>
              </div>
              {cols.map(p => (
                <div key={p}><Bar value={m[p]} color={m[p] < 50 ? T.orange : T.green} /><div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{m[p]}%</div></div>
              ))}
              <div style={{ fontSize: 13, color: T.orange, fontWeight: 800 }}>★ {s.points}</div>
            </div>
          );
        })}
        <div style={{ marginTop: 14, fontSize: 10, color: T.muted, lineHeight: 1.6 }}>▲ = below 50% average reading mastery, auto-flagged for targeted practice. Dojo points update live as students finish quests.</div>
      </div>
    </div>
  );
};

export default ReadingQuestView;
