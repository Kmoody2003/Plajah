// HistoryQuestView — the third standards-aligned cartridge on the Reading/Science Quest
// chassis (blueprint Part 5B). Same shape as ScienceQuestView deliberately: band picker →
// lab map of games → question run → proficiency bars + global standing → Turbo → class
// progress. Demoable as any demo student (awards the class story) or as the signed-in
// learner (real Plajah Points + Firestore ledger).
//
// Two things are specific to History:
//  · Content is GENERATED from data/worldHistoryData.ts (the shipped World History
//    discipline seed) via data/historyQuestData.ts — no new historical claims here.
//  · Alignment is to the NCSS C3 Framework Dimension 2 (History) indicators, whose codes
//    and statements were verified verbatim against the published standard pages. C3 is not
//    yet in data/educationStandards.ts STANDARDS, so ledger domain roll-ups will show these
//    under "General" until it is — the record itself is written correctly either way.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Landmark, Star } from 'lucide-react';
import { DEMO_CLASS } from '../data/demoClassroom';
import { useClassroom, classroomStore } from '../data/classroomStore';
import { bandFor, masteryToPISABand } from '../data/educationStandards';
import {
  HISTORY_BANDS, HISTORY_PILLARS, HISTORY_GAMES, HISTORY_TURBO,
  standardForPillar, C3_SPAN_FOR_BAND,
  type HistoryBandId, type HistoryPillar, type HistoryGame, type HistoryQuestion,
} from '../data/historyQuestData';
import { appendRecord } from '../services/learningLedgerService';
import { loadReadingProgress, saveReadingProgress } from '../services/readingQuestService';
import { addPoints } from '../services/pointsService';

const T = {
  bg: '#0a0a0f', card: '#12121a', cardAlt: '#15151f', border: '#20202c',
  ink: '#ffffff', muted: '#9a9aa6', green: '#5fd17f', gold: '#FFD24A', red: '#ff8080',
  blue: '#36c5f0', amber: '#e0a24a', sepia: '#c98b5e',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const ME = '__me__';
const PROGRESS_KEY = 'history'; // distinct namespace inside the shared progress doc store

const seedMastery = (i: number): Record<HistoryPillar, number> => {
  const base = [54, 48, 44, 50];
  const shift = [6, -8, 10, 2, -4, 12][i % 6];
  return Object.fromEntries(
    HISTORY_PILLARS.map((p, k) => [p, Math.max(8, Math.min(100, base[k] + shift))])
  ) as Record<HistoryPillar, number>;
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
const primaryBtn = (ghost?: boolean): React.CSSProperties => ({ cursor: 'pointer', padding: '11px 22px', borderRadius: 10, border: ghost ? `1px solid ${T.border}` : 'none', background: ghost ? 'transparent' : T.amber, color: ghost ? T.muted : '#0a0a0f', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 });

type Tab = 'play' | 'turbo' | 'class';

const HistoryQuestView: React.FC<{ onBack?: () => void; user?: any }> = ({ onBack, user }) => {
  const uid: string | null = user?.uid || null;
  const { students } = useClassroom();
  const [tab, setTab] = useState<Tab>('play');
  const [band, setBand] = useState<HistoryBandId>('g34');
  const [studentId, setStudentId] = useState<string>(uid ? ME : DEMO_CLASS.students[0].id);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [questStart, setQuestStart] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  // A fresh seed per run so replaying a game draws a different paper from the same data.
  const [seed, setSeed] = useState(() => Date.now() & 0xffff);
  const [mastery, setMastery] = useState<Record<string, Record<HistoryPillar, number>>>(() =>
    Object.fromEntries(DEMO_CLASS.students.map((s, i) => [s.id, seedMastery(i)]))
  );
  const [myMast, setMyMast] = useState<Record<HistoryPillar, number>>(() =>
    Object.fromEntries(HISTORY_PILLARS.map(p => [p, 0])) as Record<HistoryPillar, number>
  );
  const [myXp, setMyXp] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    // Reuse the readingProgress doc store under a history-namespaced key so the three
    // cartridges don't collide (same approach ScienceQuestView takes).
    loadReadingProgress(`${uid}__${PROGRESS_KEY}`).then(p => {
      if (alive && p) { setMyMast(m => ({ ...m, ...(p.mastery as any) })); setMyXp(p.xp || 0); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  const isMe = studentId === ME;
  const demoStudent = students.find(s => s.id === studentId) || students[0];
  const myMastery: Record<HistoryPillar, number> = isMe ? myMast : mastery[studentId];
  const headerPts = isMe ? myXp : demoStudent.points;
  const players = uid ? [{ id: ME, name: 'You', color: T.amber }, ...students] : students;
  const turboReady = HISTORY_PILLARS.every(p => myMastery[p] >= 90);

  const recordToLedger = (pillar: HistoryPillar, before: number, after: number) => {
    if (!isMe || !uid) return;
    const std = standardForPillar(pillar, band);
    if (!std) return;   // no indicator for this band → skip silently rather than write junk
    appendRecord({
      studentId: uid,
      standardId: std.id,
      framework: std.framework,
      source: 'school-lesson',   // no 'history-quest' source in LearningRecordSource yet
      masteryBefore: before,
      masteryAfter: after,
      evidence: `history-quest:${pillar}`,
    }).catch(() => {});
  };

  const launchGame = (gameId: string) => {
    const g = HISTORY_GAMES.find(x => x.id === gameId);
    if (g && isMe) setQuestStart(myMast[g.pillar]);
    setSeed(s => (s * 31 + 17) & 0xffff);
    setActiveGame(gameId);
  };

  const bump = (pillar: HistoryPillar, n: number) => {
    if (isMe) setMyMast(m => ({ ...m, [pillar]: Math.min(100, m[pillar] + n) }));
    else setMastery(m => ({ ...m, [studentId]: { ...m[studentId], [pillar]: Math.min(100, m[studentId][pillar] + n) } }));
  };

  const completeQuest = (gameId: string) => {
    const g = HISTORY_GAMES.find(x => x.id === gameId);
    if (isMe && uid) {
      const nextXp = myXp + 3;
      setMyXp(nextXp);
      saveReadingProgress(`${uid}__${PROGRESS_KEY}`, { mastery: myMast as any, completedQuests: [...done, gameId], xp: nextXp })
        .catch(() => {});
      addPoints(uid, 3, 'DAILY_ACTIVITY', 'history-quest', gameId).catch(() => {});
      if (g) recordToLedger(g.pillar, questStart, myMast[g.pillar]);
    } else {
      // DEMO_BEHAVIORS has no 'history' behavior yet; 'partic' (Participating) is the
      // closest shipped positive. Adding a 'history' behavior would be the nicer wiring.
      classroomStore.award(studentId, 'partic');
    }
    setDone(d => d.includes(gameId) ? d : [...d, gameId]);
    setActiveGame(null);
  };

  const activeGameObj = HISTORY_GAMES.find(g => g.id === activeGame) || null;

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '20px 16px 70px', fontFamily: T.font }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#e0a24a,#c98b5e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Landmark size={22} color="#0a0a0f" /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>History Quest</h1>
              <span style={{ background: '#111', color: T.gold, fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2, padding: '3px 8px', borderRadius: 12, border: '1px solid rgba(255,210,74,0.4)' }}>BETA · C3</span>
            </div>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12.5 }}>{isMe ? 'Signed in · earns Plajah Points + writes your ledger' : `${DEMO_CLASS.name} · awards the class story`}</p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.amber, fontSize: 18, fontWeight: 900 }}><Star size={15} fill={T.amber} /> {headerPts} pts</div>
        </div>

        <div style={{ ...cardStyle, padding: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: T.muted }}>Playing as</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {players.map(s => {
              const on = s.id === studentId, me = s.id === ME;
              return (
                <button key={s.id} onClick={() => setStudentId(s.id)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 6px', borderRadius: 99, border: `1px solid ${on ? T.amber : T.border}`, background: on ? 'rgba(224,162,74,0.14)' : 'transparent', color: T.ink }}>
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
                style={{ cursor: 'pointer', padding: '8px 15px', borderRadius: 10, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, border: `1px solid ${lit ? T.amber : (isTurbo && turboReady ? T.amber : T.border)}`, background: lit ? T.amber : 'transparent', color: lit ? '#0a0a0f' : (isTurbo && turboReady ? T.amber : T.muted) }}>{l}</button>
            );
          })}
        </div>

        {tab === 'play' && !activeGameObj && <PlayHome band={band} setBand={setBand} done={done} myMastery={myMastery} launch={launchGame} />}
        {tab === 'play' && activeGameObj && (
          <GamePlay
            band={band} game={activeGameObj} seed={seed} isMe={isMe}
            onCorrect={(p) => bump(p, 6)}
            onComplete={() => completeQuest(activeGameObj.id)}
            back={() => setActiveGame(null)}
          />
        )}
        {tab === 'turbo' && <TurboTab myMastery={myMastery} ready={turboReady} />}
        {tab === 'class' && <ClassProgress students={students} mastery={mastery} />}
      </div>
    </div>
  );
};

const PlayHome: React.FC<{
  band: HistoryBandId; setBand: (b: HistoryBandId) => void; done: string[];
  myMastery: Record<HistoryPillar, number>; launch: (id: string) => void;
}> = ({ band, setBand, done, myMastery, launch }) => {
  const bandObj = HISTORY_BANDS.find(b => b.id === band)!;
  const overall = Math.round(HISTORY_PILLARS.reduce((a, p) => a + myMastery[p], 0) / HISTORY_PILLARS.length);
  const ob = bandFor(overall);
  return (
    <div>
      <Eyebrow>Choose your level</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 22 }}>
        {HISTORY_BANDS.map(b => (
          <button key={b.id} onClick={() => setBand(b.id)} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', padding: '11px 13px', color: T.ink, borderColor: band === b.id ? T.amber : T.border, boxShadow: band === b.id ? `0 0 0 1px ${T.amber}` : 'none' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{b.label}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{b.sub}</div>
          </button>
        ))}
      </div>

      <Eyebrow color={T.amber}>✦ {bandObj.label} · The Archive · C3 {C3_SPAN_FOR_BAND[band]}</Eyebrow>
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 12 }}>
          {HISTORY_GAMES.map(g => {
            const isDone = done.includes(g.id);
            const std = standardForPillar(g.pillar, band);
            return (
              <button key={g.id} onClick={() => launch(g.id)} style={{ cursor: 'pointer', textAlign: 'left', padding: 15, borderRadius: 12, color: T.ink, border: `1px solid ${isDone ? T.green : T.border}`, background: isDone ? 'rgba(95,209,127,0.08)' : T.cardAlt, position: 'relative' }}>
                <div style={{ fontSize: 26 }}>{g.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4 }}>{g.title}</div>
                <div style={{ fontSize: 12.5, color: T.muted }}>{g.blurb}</div>
                <div style={{ marginTop: 8, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, color: T.amber }}>{g.pillar}</div>
                {std && <div style={{ marginTop: 3, fontSize: 8.5, letterSpacing: '0.06em', color: T.muted, fontWeight: 700 }}>{std.id}</div>}
                {isDone && <div style={{ position: 'absolute', top: 12, right: 14, color: T.green }}>✓</div>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>My historical thinking</Eyebrow>
        {HISTORY_PILLARS.map(p => {
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

const GamePlay: React.FC<{
  band: HistoryBandId; game: HistoryGame; seed: number; isMe: boolean;
  onCorrect: (p: HistoryPillar) => void; onComplete: () => void; back: () => void;
}> = ({ band, game, seed, isMe, onCorrect, onComplete, back }) => {
  // Questions are derived from the shipped World History data — memoised on
  // (game, band, seed) so a run is stable but a replay draws a new paper.
  const questions: HistoryQuestion[] = useMemo(() => game.make(band, seed), [game, band, seed]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const std = standardForPillar(game.pillar, band);
  const finished = idx >= questions.length;
  const q = finished ? null : questions[idx];

  // No content for this band (shouldn't happen, but degrade instead of crashing).
  if (questions.length === 0) return (
    <div style={{ ...cardStyle, padding: 28, textAlign: 'center', color: T.muted }}>
      Nothing to study here yet.
      <div style={{ marginTop: 16 }}><button onClick={back} style={primaryBtn(true)}>← The Archive</button></div>
    </div>
  );

  const pick = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    if (i === q.answer) { setCorrect(c => c + 1); onCorrect(game.pillar); }
  };

  if (finished) return (
    <div style={{ ...cardStyle, padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>{game.icon}</div>
      <div style={{ fontWeight: 900, fontSize: 24, margin: '8px 0' }}>Dossier closed</div>
      <div style={{ color: T.muted, marginBottom: 18 }}>{game.title} · {correct}/{questions.length} correct</div>
      <div style={{ display: 'inline-flex', gap: 18, fontSize: 13, marginBottom: 22, color: T.muted, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: T.amber, fontWeight: 800 }}>★ +3 {isMe ? 'Plajah Points' : 'Class pts'}</span>
        <span style={{ color: T.green }}>▲ {game.pillar} up</span>
      </div>
      {std && (
        <div style={{ maxWidth: 520, margin: '0 auto 22px', fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
          <b style={{ color: T.sepia }}>{std.id}</b> — {std.statement}
        </div>
      )}
      <div><button onClick={onComplete} style={primaryBtn()}>Back to the archive →</button></div>
    </div>
  );

  return (
    <div>
      <button onClick={back} style={{ cursor: 'pointer', background: 'none', border: 'none', color: T.muted, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 800 }}>← The Archive</button>
      <div style={{ ...cardStyle, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 800, gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: T.amber }}>{game.icon} {game.title} · {game.pillar}</span>
          <span style={{ color: T.muted }}>{HISTORY_BANDS.find(b => b.id === band)!.label} · {idx + 1}/{questions.length}</span>
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 18, lineHeight: 1.35 }}>{q!.prompt}</div>
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
          <div style={{ marginTop: 18 }}>
            {q!.note && <div style={{ fontSize: 12.5, color: T.sepia, marginBottom: 12, lineHeight: 1.5 }}>{q!.note}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: picked === q!.answer ? T.green : T.red }}>{picked === q!.answer ? 'Correct — good reading of the record' : 'Good try — check the evidence again'}</span>
              <button onClick={() => { setPicked(null); setIdx(v => v + 1); }} style={primaryBtn()}>{idx + 1 < questions.length ? 'Next →' : 'Finish →'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TurboTab: React.FC<{ myMastery: Record<HistoryPillar, number>; ready: boolean }> = ({ myMastery, ready }) => {
  const overall = Math.round(HISTORY_PILLARS.reduce((a, p) => a + myMastery[p], 0) / HISTORY_PILLARS.length);
  const KIND: Record<string, { label: string; color: string; icon: string }> = {
    acceleration: { label: 'Accelerate', color: T.amber, icon: '🚀' },
    depth: { label: 'Go Deeper', color: T.blue, icon: '🕯️' },
    transfer: { label: 'Transfer', color: T.green, icon: '🧩' },
    creative: { label: 'Create', color: '#d957c6', icon: '✒️' },
  };
  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 16, borderColor: ready ? T.amber : T.border, boxShadow: ready ? `0 0 0 1px ${T.amber}` : 'none' }}>
        <Eyebrow color={ready ? T.amber : T.muted}>⚡ Turbo · beyond grade level</Eyebrow>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 6 }}>{ready ? "You're ready to argue with the record" : 'Turbo unlocks at mastery'}</div>
        <p style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>Historians don't memorise faster — they read <b style={{ color: T.ink }}>against the grain</b>. Turbo adds sourcing, counterfactuals, and argument.</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5, color: T.muted }}><span>Readiness (avg of the four skills)</span><span style={{ color: ready ? T.amber : T.muted, fontWeight: 700 }}>{overall}% / 90%</span></div>
          <Bar value={Math.min(100, Math.round((overall / 90) * 100))} color={ready ? T.amber : T.muted} />
        </div>
      </div>
      {!ready && <div style={{ ...cardStyle, padding: 16, color: T.muted, fontSize: 13.5, lineHeight: 1.5 }}>Keep practising — when all four historical-thinking skills reach 90%+, Turbo opens. Preview:</div>}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, opacity: ready ? 1 : 0.55 }}>
        {HISTORY_TURBO.map(c => {
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

const ClassProgress: React.FC<{
  students: { id: string; name: string; color: string; points: number }[];
  mastery: Record<string, Record<HistoryPillar, number>>;
}> = ({ students, mastery }) => (
  <div>
    <div style={{ ...cardStyle, padding: 18, marginBottom: 16 }}>
      <Eyebrow color={T.amber}>History · live progress</Eyebrow>
      <div style={{ fontWeight: 800, fontSize: 20 }}>{DEMO_CLASS.name}</div>
      <div style={{ fontSize: 13, color: T.muted }}>{DEMO_CLASS.teacherName} · {students.length} students · C3 historical-thinking mastery</div>
    </div>
    <div style={{ ...cardStyle, padding: 18, overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 0.7fr', gap: 10, minWidth: 660, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, paddingBottom: 10, borderBottom: `1px solid ${T.border}`, fontWeight: 800 }}>
        <span>Student</span><span>Chronology</span><span>Perspectives</span><span>Sources</span><span>Causation</span><span>Class pts</span>
      </div>
      {students.map(s => {
        const m = mastery[s.id];
        if (!m) return null;
        const avg = HISTORY_PILLARS.reduce((a, p) => a + m[p], 0) / HISTORY_PILLARS.length;
        return (
          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 0.7fr', gap: 10, minWidth: 660, alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, flexShrink: 0 }}>{s.name.charAt(0)}</span>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name} {avg < 50 && <span style={{ color: T.red }}>▲</span>}</div>
            </div>
            {HISTORY_PILLARS.map(p => (
              <div key={p}><Bar value={m[p]} color={m[p] < 50 ? T.amber : T.green} /><div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{m[p]}%</div></div>
            ))}
            <div style={{ fontSize: 13, color: T.amber, fontWeight: 800 }}>★ {s.points}</div>
          </div>
        );
      })}
    </div>
  </div>
);

export default HistoryQuestView;
