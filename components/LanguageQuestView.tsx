// LanguageQuestView — Phase E: the Duolingo-style languages cartridge. Pick a language, work
// themed A1 lessons, and learn through a mix of exercises (learn → translate → listen), with
// Web-Speech listen/repeat, SM-2-lite spaced repetition, daily streaks, and XP. Signed-in
// learners persist to Firestore + earn real Plajah Points; guests play fully in-memory.
// Woven into Academia via the "Languages" tile. Themed to the classroom (dark / violet accent).

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Volume2, Flame, Star, Check, X, RotateCcw, GraduationCap, ChevronRight } from 'lucide-react';
import { LANGUAGES, languageById, allCardsFor, cardKey, type Language, type LangLesson, type LangCard } from '../data/languageDecks';
import {
  loadLanguageProgress, saveLanguageProgress, awardLanguagePoints, reviewCard, bumpStreak,
  dueCount, newCount, emptyProgress, type LanguageProgress,
} from '../services/languageQuestService';
import { ageTokensFor } from '../data/ageScaling';

const V = '#7a2bd6';   // languages accent (matches the Academia "Languages" tile)
const GREEN = '#2bd67a';
const RED = '#ff6b6b';

type Mode = 'pick' | 'lessons' | 'session' | 'summary';
type Ex = { card: LangCard; type: 'learn' | 'translate' | 'listen'; options: string[] };
type Result = { cardId: string; correct: boolean };

const shuffle = <T,>(a: T[]): T[] => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

function speak(text: string, voice: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice;
    const match = window.speechSynthesis.getVoices().find(v => v.lang === voice || v.lang.startsWith(voice.slice(0, 2)));
    if (match) u.voice = match;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* TTS unsupported — silent */ }
}

// Build a session: each card becomes an exercise. Never-seen → learn; seen → translate/listen.
function buildSession(lang: Language, lesson: LangLesson, srs: LanguageProgress['srs']): Ex[] {
  const pool = allCardsFor(lang);
  const distractors = (correct: string) => {
    const others = shuffle(pool.map(c => c.translation).filter(t => t !== correct)).slice(0, 3);
    return shuffle([correct, ...others]);
  };
  return lesson.cards.map((card, i) => {
    const seen = !!srs[cardKey(lang.id, card.id)];
    const type: Ex['type'] = !seen ? 'learn' : (i % 2 === 0 ? 'translate' : 'listen');
    return { card, type, options: type === 'learn' ? [] : distractors(card.translation) };
  });
}

const LanguageQuestView: React.FC<{ user?: any; profile?: any; onBack?: () => void }> = ({ user, profile, onBack }) => {
  const uid: string | undefined = user?.uid;
  const age = ageTokensFor(profile);            // Phase F — scale term size + tap targets by age band
  const termClass = age.playful ? 'text-5xl' : 'text-4xl';
  const [progress, setProgress] = useState<LanguageProgress>(() => emptyProgress(uid || 'guest'));
  const [mode, setMode] = useState<Mode>('pick');
  const [langId, setLangId] = useState<string>('es');
  const [lesson, setLesson] = useState<LangLesson | null>(null);

  // session state
  const [queue, setQueue] = useState<Ex[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);   // learn-card flip
  const [results, setResults] = useState<Result[]>([]);
  const [summary, setSummary] = useState<{ xp: number; correct: number; total: number; streak: number } | null>(null);

  const lang = languageById(langId)!;

  // Load persisted progress for signed-in users.
  useEffect(() => {
    let cancelled = false;
    if (!uid) { setProgress(emptyProgress('guest')); return; }
    loadLanguageProgress(uid).then(p => { if (!cancelled && p) setProgress(p); });
    // Warm the TTS voice list (some browsers populate async).
    try { window.speechSynthesis?.getVoices(); } catch { /* */ }
    return () => { cancelled = true; };
  }, [uid]);

  const now = Date.now();
  const keysFor = (l: LangLesson) => l.cards.map(c => cardKey(langId, c.id));
  const lessonLearned = (l: LangLesson) => l.cards.filter(c => (progress.srs[cardKey(langId, c.id)]?.reps ?? 0) > 0).length;

  const startLesson = (l: LangLesson) => {
    setLesson(l); setQueue(buildSession(lang, l, progress.srs));
    setIdx(0); setPicked(null); setRevealed(false); setResults([]);
    setMode('session');
  };

  const current = queue[idx];

  const answer = (choice: string) => {
    if (picked) return;
    setPicked(choice);
    const correct = choice === current.card.translation;
    setResults(r => [...r, { cardId: current.card.id, correct }]);
  };

  const next = async () => {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1); setPicked(null); setRevealed(false);
      return;
    }
    // finish → fold results into SRS + streak + xp, persist, award.
    const t = Date.now();
    const srs = { ...progress.srs };
    // Each card is unique within a lesson: learn cards count as a correct first exposure;
    // graded cards take their answered result (a card left unanswered counts as missed).
    const merged: Result[] = queue.map(ex =>
      ex.type === 'learn'
        ? { cardId: ex.card.id, correct: true }
        : (results.find(r => r.cardId === ex.card.id) || { cardId: ex.card.id, correct: false })
    );
    merged.forEach(r => { const k = cardKey(langId, r.cardId); srs[k] = reviewCard(srs[k], r.correct, t); });
    const { streak, lastDay } = bumpStreak(progress.streak, progress.lastDay, t);
    const correctCount = merged.filter(r => r.correct).length;
    const gainedXp = correctCount * 10;
    const nextProgress: LanguageProgress = { ...progress, srs, streak, lastDay, xp: progress.xp + gainedXp };
    setProgress(nextProgress);
    if (uid) {
      await saveLanguageProgress(nextProgress);
      await awardLanguagePoints(uid, `${langId}:${lesson?.id || ''}`);
      // Record CEFR mastery on the Learner Ledger. Standards live in
      // data/educationStandards.ts as CEFR.<level>.<lesson id>. Accuracy on the
      // session drives how far mastery moves, so a shaky run records honestly.
      const lessonId = lesson?.id;
      if (lessonId && queue.length) {
        const standardId = `CEFR.${lesson?.cefr || 'A1'}.${lessonId}`;
        const accuracy = correctCount / queue.length;
        void (async () => {
          try {
            const { appendRecord, loadProficiency } = await import('../services/learningLedgerService');
            const prof = await loadProficiency(uid);
            const before = prof?.byStandard?.[standardId] ?? 0;
            const target = Math.round(accuracy * 100);
            const after = Math.round(Math.max(before, before + (target - before) * 0.5) * 100) / 100;
            if (after <= before) return;
            await appendRecord({
              studentId: uid, standardId, framework: 'CEFR', source: 'school-lesson',
              masteryBefore: before, masteryAfter: after, byUid: uid,
              evidence: `Language Quest — ${langId} · ${lessonId} (${correctCount}/${queue.length})`,
            });
          } catch { /* additive only; never block the session summary */ }
        })();
      }
    }
    setSummary({ xp: gainedXp, correct: correctCount, total: queue.length, streak });
    setMode('summary');
  };

  // ── Shared header ──
  const Header = (
    <div className="flex items-center justify-between mb-6">
      <button onClick={() => { if (mode === 'session' || mode === 'summary') { setMode('lessons'); } else if (mode === 'lessons') { setMode('pick'); } else { onBack?.(); } }}
        className="flex items-center gap-1.5 text-white/50 hover:text-white text-[12px] font-bold"><ArrowLeft size={16} /> Back</button>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-[13px] font-black" style={{ color: '#FF8C00' }}><Flame size={15} /> {progress.streak}</span>
        <span className="flex items-center gap-1 text-[13px] font-black" style={{ color: V }}><Star size={15} /> {progress.xp} XP</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white">
      <div className="max-w-2xl mx-auto px-5 py-8">
        {Header}

        {/* Language picker */}
        {mode === 'pick' && (
          <>
            <div className="flex items-center gap-2 mb-2" style={{ color: V }}><GraduationCap size={18} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Language Quest</span></div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-1">Learn a language.</h1>
            <p className="text-white/50 text-sm mb-7">Bite-size lessons, listen &amp; repeat, and a streak that keeps you going.</p>
            <div className="grid gap-3">
              {LANGUAGES.map(l => {
                const keys = allCardsFor(l).map(c => cardKey(l.id, c.id));
                const learned = keys.filter(k => (progress.srs[k]?.reps ?? 0) > 0).length;
                return (
                  <button key={l.id} onClick={() => { setLangId(l.id); setMode('lessons'); }}
                    className="flex items-center gap-4 rounded-2xl bg-white/[0.04] border border-white/10 p-4 hover:bg-white/[0.07] transition-colors text-left">
                    <span className="text-4xl">{l.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-black">{l.label}</p>
                      <p className="text-[12px] text-white/45">{l.blurb}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-black" style={{ color: V }}>{learned}/{keys.length}</p>
                      <p className="text-[9px] text-white/30 uppercase tracking-wider">learned</p>
                    </div>
                    <ChevronRight size={18} className="text-white/30" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Lesson list */}
        {mode === 'lessons' && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <span className="text-4xl">{lang.flag}</span>
              <div><h1 className="text-2xl font-black">{lang.label}</h1><p className="text-[12px] text-white/45">{lang.blurb}</p></div>
            </div>
            <div className="grid gap-3">
              {lang.lessons.map(l => {
                const total = l.cards.length; const learned = lessonLearned(l);
                const due = dueCount(progress.srs, keysFor(l), now);
                const fresh = newCount(progress.srs, keysFor(l));
                const pct = Math.round((learned / total) * 100);
                return (
                  <button key={l.id} onClick={() => startLesson(l)} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 hover:bg-white/[0.07] transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{l.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[15px] font-black">{l.title}</p>
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: `${V}22`, color: V }}>{l.cefr}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: V }} /></div>
                          <span className="text-[10px] font-bold text-white/40">{learned}/{total}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2.5 pl-[52px]">
                      {due > 0 && <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: '#FF8C0022', color: '#FF8C00' }}>{due} to review</span>}
                      {fresh > 0 && <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: `${GREEN}22`, color: GREEN }}>{fresh} new</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Session */}
        {mode === 'session' && current && (
          <div>
            {/* progress bar */}
            <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-7"><div className="h-full rounded-full transition-all" style={{ width: `${(idx / queue.length) * 100}%`, background: V }} /></div>

            {current.type === 'learn' ? (
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-6">New word</p>
                <div className="text-6xl mb-4">{current.card.emoji || '📘'}</div>
                <button onClick={() => speak(current.card.term, lang.voice)} className="inline-flex items-center gap-2 mb-2">
                  <span className={`${termClass} font-black`}>{current.card.term}</span>
                  <Volume2 size={22} style={{ color: V }} />
                </button>
                {revealed ? (
                  <>
                    <p className="text-xl text-white/70 mt-2">{current.card.translation}</p>
                    {current.card.example && <p className="text-[13px] text-white/40 mt-3 italic">“{current.card.example}” — {current.card.exampleEn}</p>}
                    <button onClick={next} className="mt-8 w-full py-3.5 rounded-xl font-black uppercase tracking-widest text-[13px]" style={{ background: V, color: '#fff' }}>Got it</button>
                  </>
                ) : (
                  <button onClick={() => { setRevealed(true); speak(current.card.term, lang.voice); }} className="mt-6 w-full py-3.5 rounded-xl font-black uppercase tracking-widest text-[13px] border border-white/15 hover:bg-white/5">Show meaning</button>
                )}
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-4">{current.type === 'listen' ? 'Listen & choose' : 'What does this mean?'}</p>
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-7 mb-6 text-center">
                  {current.type === 'listen' ? (
                    <button onClick={() => speak(current.card.term, lang.voice)} className="inline-flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-full grid place-items-center" style={{ background: `${V}22` }}><Volume2 size={30} style={{ color: V }} /></div>
                      <span className="text-[11px] text-white/40">Tap to hear again</span>
                    </button>
                  ) : (
                    <button onClick={() => speak(current.card.term, lang.voice)} className="inline-flex items-center gap-2">
                      <span className={`${termClass} font-black`}>{current.card.term}</span>
                      <Volume2 size={20} style={{ color: V }} />
                    </button>
                  )}
                </div>
                <div className="grid gap-2.5">
                  {current.options.map(opt => {
                    const isCorrect = opt === current.card.translation;
                    const chosen = picked === opt;
                    let style: React.CSSProperties = { borderColor: 'rgba(255,255,255,0.12)' };
                    if (picked) {
                      if (isCorrect) style = { borderColor: GREEN, background: `${GREEN}18` };
                      else if (chosen) style = { borderColor: RED, background: `${RED}18` };
                    }
                    return (
                      <button key={opt} disabled={!!picked} onClick={() => answer(opt)}
                        style={{ ...style, minHeight: age.tapMin }}
                        className="flex items-center justify-between px-4 py-3.5 rounded-xl border text-left text-[15px] font-bold transition-colors disabled:cursor-default">
                        {opt}
                        {picked && isCorrect && <Check size={18} style={{ color: GREEN }} />}
                        {picked && chosen && !isCorrect && <X size={18} style={{ color: RED }} />}
                      </button>
                    );
                  })}
                </div>
                {picked && (
                  <button onClick={next} className="mt-6 w-full py-3.5 rounded-xl font-black uppercase tracking-widest text-[13px]"
                    style={{ background: picked === current.card.translation ? GREEN : V, color: '#08130c' }}>
                    {idx + 1 < queue.length ? 'Continue' : 'Finish'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {mode === 'summary' && summary && (
          <div className="text-center py-6">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-3xl font-black mb-1">Lesson complete!</h1>
            <p className="text-white/50 mb-8">{summary.correct}/{summary.total} correct</p>
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4"><p className="text-2xl font-black" style={{ color: V }}>+{summary.xp}</p><p className="text-[10px] uppercase tracking-wider text-white/40">XP</p></div>
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4"><p className="text-2xl font-black" style={{ color: '#FF8C00' }}>{summary.streak}</p><p className="text-[10px] uppercase tracking-wider text-white/40">day streak</p></div>
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4"><p className="text-2xl font-black" style={{ color: GREEN }}>{Math.round((summary.correct / summary.total) * 100)}%</p><p className="text-[10px] uppercase tracking-wider text-white/40">accuracy</p></div>
            </div>
            {!uid && <p className="text-[11px] text-white/35 mb-4">Sign in to save your streak and earn Plajah Points.</p>}
            <div className="flex gap-3">
              <button onClick={() => setMode('lessons')} className="flex-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-[13px] border border-white/15 hover:bg-white/5">More lessons</button>
              <button onClick={() => lesson && startLesson(lesson)} className="flex-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-[13px] inline-flex items-center justify-center gap-1.5" style={{ background: V, color: '#fff' }}><RotateCcw size={15} /> Again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LanguageQuestView;
