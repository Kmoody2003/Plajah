// HandwritingWorkshopView — Penna, the handwriting workshop. A full-screen Academia experience:
// the child traces each glowing stroke in order, the engine grades form (start · direction ·
// sequence · corridor), and correct form paints in the reward — never speed or finishing. Pen and
// touch use PointerEvent pressure for real ink; a mouse works too. Difficulty is set by a parent or
// teacher and otherwise auto-adapts to the learner's progress; a learner can't change their own.
//
// Design language: the Academia dark portal (bg #0a0a0f, age-scaled tap targets/rounding) with
// Penna's amber accent. Scoring/tuning logic lives in services/handwritingFormEngine (pure, tested).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, PenLine, RotateCcw, SlidersHorizontal, Lock, Star, Sparkles, Check, ChevronRight,
} from 'lucide-react';
import type { UserProfile } from '../types';
import { ageTokensFor } from '../data/ageScaling';
import { isChildAccount } from '../services/contentSafety';
import { HANDWRITING_LETTERS } from '../data/handwritingLetters';
import {
  scoreStroke, effectiveStrictness, levelForStrictness, TUNING_LEVELS, DEFAULT_TUNING,
  type HandwritingTuning, type Pt, type LetterModel, type LetterCategory, type AgeBandKey,
} from '../services/handwritingFormEngine';
import {
  loadHandwritingProgress, saveHandwritingProgress, awardHandwritingPoints, HANDWRITING_CATEGORIES,
} from '../services/handwritingProgressService';
import { loadLearnerTuning, saveLearnerTuning } from '../services/handwritingSettingsService';

const ACCENT = '#C9871F';
const GUIDE_BLUE = '#5b8fd6';
const GUIDE_RED = '#d0674f';

type Scaffold = 'corridor' | 'dotted' | 'faded' | 'blank';
type Role = 'teacher' | 'parent' | 'student';

const roleOf = (p?: UserProfile | null): Role => {
  const t = (p as any)?.accountType;
  if (t === 'TEACHER') return 'teacher';
  if (t === 'PARENT') return 'parent';
  return 'student';
};

const CATEGORY_LABEL: Record<LetterCategory, string> = {
  prewriting: 'Pre-writing', capital: 'Capitals', lowercase: 'Lowercase', number: 'Numbers',
};

/** Mastery % per category from the set of mastered letter keys. */
function masteryFromMastered(mastered: string[]): Record<LetterCategory, number> {
  const out = Object.fromEntries(HANDWRITING_CATEGORIES.map(c => [c, 0])) as Record<LetterCategory, number>;
  for (const cat of HANDWRITING_CATEGORIES) {
    const inCat = HANDWRITING_LETTERS.filter(l => l.category === cat);
    if (!inCat.length) continue;
    const got = inCat.filter(l => mastered.includes(l.key)).length;
    out[cat] = Math.round((got / inCat.length) * 100);
  }
  return out;
}

const HandwritingWorkshopView: React.FC<{
  onBack?: () => void;
  user?: any;
  profile?: UserProfile | null;
}> = ({ onBack, user, profile }) => {
  const age = ageTokensFor(profile);
  const band = age.band as AgeBandKey;
  const role = roleOf(profile);
  const canTune = role === 'teacher' || role === 'parent';
  const isChild = isChildAccount(profile);
  const uid: string = (profile as any)?.uid || (user as any)?.uid || '';
  const learnerName = (profile?.displayName || '').split(' ')[0] || 'this learner';
  const reduceMotion = useRef(false);

  // ── state ──
  const [letterIdx, setLetterIdx] = useState(0);
  const letter: LetterModel = HANDWRITING_LETTERS[letterIdx];
  const [strokeIndex, setStrokeIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [userStrokes, setUserStrokes] = useState<Pt[][]>([]);
  const [scaffold, setScaffold] = useState<Scaffold>(band === 'early' ? 'corridor' : 'faded');
  const [coach, setCoach] = useState<{ text: string; tone: 'idle' | 'good' | 'bad' }>({
    text: 'Trace the glowing stroke — start on the red dot.', tone: 'idle',
  });
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [penKind, setPenKind] = useState<'pen' | 'touch' | 'mouse' | null>(null);

  const [mastered, setMastered] = useState<string[]>([]);
  const [xp, setXp] = useState(0);
  const [tuning, setTuning] = useState<HandwritingTuning>(DEFAULT_TUNING);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [savingTune, setSavingTune] = useState(false);

  const strictness = effectiveStrictness(band, tuning, mastered.length);
  const levelLabel = levelForStrictness(strictness).label;

  // ── refs (canvas + transient capture) ──
  const wrapRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const tf = useRef({ s: 1, ox: 0, oy: 0, w: 0, h: 0 });
  const drawing = useRef(false);
  const raw = useRef<Pt[]>([]);
  const widths = useRef<number[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);
  const drawRef = useRef<() => void>(() => {});

  // ── load persisted progress + tuning ──
  useEffect(() => {
    reduceMotion.current = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!uid) return;
    let alive = true;
    (async () => {
      const [prog, tune] = await Promise.all([loadHandwritingProgress(uid), loadLearnerTuning(uid)]);
      if (!alive) return;
      if (prog) { setMastered(prog.masteredLetters); setXp(prog.xp); }
      if (tune) setTuning(tune);
    })();
    return () => { alive = false; };
  }, [uid]);

  // ── coordinate transforms ──
  const N2C = (p: Pt) => ({ x: tf.current.ox + p.x * tf.current.s, y: tf.current.oy + p.y * tf.current.s });
  const C2N = (p: { x: number; y: number }) => ({ x: (p.x - tf.current.ox) / tf.current.s, y: (p.y - tf.current.oy) / tf.current.s });

  // ── render the writing surface ──
  const draw = useCallback(() => {
    const cvs = padRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d'); if (!ctx) return;
    const { w, h } = tf.current;
    ctx.clearRect(0, 0, w, h);

    const gLine = (yN: number, color: string, dash: number[] | null, alpha: number) => {
      const y = N2C({ x: 0, y: yN }).y;
      const x0 = N2C({ x: -3, y: 0 }).x, x1 = N2C({ x: 103, y: 0 }).x;
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1.4;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.restore();
    };
    gLine(15, GUIDE_BLUE, null, 0.35);
    gLine(75, GUIDE_RED, [5, 6], 0.5);
    gLine(125, GUIDE_BLUE, null, 0.6);

    const polyN = (pts: Pt[], width: number, color: string, alpha = 1, dash: number[] | null = null) => {
      if (pts.length < 2) return;
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); const p0 = N2C(pts[0]); ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i++) { const p = N2C(pts[i]); ctx.lineTo(p.x, p.y); }
      ctx.stroke(); ctx.restore();
    };

    letter.strokes.forEach((st, i) => {
      if (i < strokeIndex) return;
      const isCurrent = i === strokeIndex && !done;
      const ghost = 'rgba(255,255,255,0.12)';
      if (scaffold === 'corridor') polyN(st.points, 16 * tf.current.s, ghost, 1);
      else if (scaffold === 'faded') polyN(st.points, 6 * tf.current.s, ghost, isCurrent ? 0.9 : 0.5);
      else if (scaffold === 'dotted') polyN(st.points, 3, ghost, 0.9, [1, 9]);
      // blank: only the current stroke gets a hint
      if (isCurrent) {
        polyN(st.points, 4, ACCENT, 0.9);
        const s0 = N2C(st.points[0]);
        ctx.save(); ctx.fillStyle = GUIDE_RED;
        ctx.beginPath(); ctx.arc(s0.x, s0.y, 7, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(s0.x, s0.y, 13, 0, 7); ctx.fill(); ctx.restore();
        const a = N2C(st.points[0]); const b = N2C(st.points[Math.min(3, st.points.length - 1)]);
        const ang = Math.atan2(b.y - a.y, b.x - a.x), mx = a.x + Math.cos(ang) * 26, my = a.y + Math.sin(ang) * 26;
        ctx.save(); ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(mx, my);
        ctx.lineTo(mx - Math.cos(ang - 0.5) * 9, my - Math.sin(ang - 0.5) * 9); ctx.moveTo(mx, my);
        ctx.lineTo(mx - Math.cos(ang + 0.5) * 9, my - Math.sin(ang + 0.5) * 9); ctx.stroke(); ctx.restore();
      }
    });

    userStrokes.forEach(u => polyN(u, 7, ACCENT, 1));
  }, [letter, scaffold, strokeIndex, userStrokes, done]);

  useEffect(() => { drawRef.current = draw; draw(); }, [draw]);

  // ── size the canvas to its box (DPR-aware) ──
  useEffect(() => {
    const size = () => {
      const cvs = padRef.current; if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      cvs.width = Math.round(rect.width * dpr); cvs.height = Math.round(rect.height * dpr);
      const ctx = cvs.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const padY = Math.max(26, rect.height * 0.1);
      const s = (rect.height - padY * 2) / 140;
      tf.current = { s, ox: (rect.width - 100 * s) / 2, oy: padY, w: rect.width, h: rect.height };
      drawRef.current();
    };
    size();
    window.addEventListener('resize', size);
    return () => window.removeEventListener('resize', size);
  }, []);

  // ── pointer capture (pen / touch / mouse) ──
  const localPt = (e: React.PointerEvent) => {
    const r = padRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const penWidth = (e: React.PointerEvent, type: string) => {
    const p = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : (type === 'pen' ? 0.4 : 0.55);
    return 3 + p * 8;
  };

  const onDown = (e: React.PointerEvent) => {
    if (done) return;
    e.preventDefault();
    padRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const type = (e.pointerType as any) || 'mouse';
    setPenKind(type === 'pen' ? 'pen' : type === 'touch' ? 'touch' : 'mouse');
    const p = localPt(e);
    raw.current = [C2N(p)]; widths.current = [penWidth(e, type)]; last.current = p;
    draw(); // fresh base
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const cvs = padRef.current!, ctx = cvs.getContext('2d')!;
    const evs = (e.nativeEvent as any).getCoalescedEvents ? (e.nativeEvent as any).getCoalescedEvents() : [e.nativeEvent];
    ctx.save(); ctx.strokeStyle = '#f4f4f2'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const ne of evs) {
      const r = cvs.getBoundingClientRect();
      const p = { x: ne.clientX - r.left, y: ne.clientY - r.top };
      const w = 3 + ((ne.pressure && ne.pressure > 0 && ne.pressure !== 0.5) ? ne.pressure : 0.5) * 8;
      raw.current.push(C2N(p)); widths.current.push(w);
      const lp = last.current || p;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(lp.x, lp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last.current = p;
    }
    ctx.restore();
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    if (raw.current.length < 3) { draw(); return; }
    const res = scoreStroke(raw.current, letter, strokeIndex, strictness);
    setLastScore(res.score);

    if (res.pass) {
      const accepted = raw.current.slice();
      const nextStrokes = [...userStrokes, accepted];
      const nextIndex = strokeIndex + 1;
      setUserStrokes(nextStrokes);
      setStrokeIndex(nextIndex);
      if (nextIndex >= letter.strokes.length) completeLetter();
      else setCoach({ text: pickCheer(), tone: 'good' });
    } else {
      // flash the failed attempt red, then clear back to the base
      const ctx = padRef.current!.getContext('2d')!;
      ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#e0685a'; ctx.lineCap = 'round'; ctx.lineWidth = 5;
      ctx.beginPath(); const p0 = N2C(raw.current[0]); ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < raw.current.length; i++) { const p = N2C(raw.current[i]); ctx.lineTo(p.x, p.y); }
      ctx.stroke(); ctx.restore();
      setCoach({ text: coachFor(res), tone: 'bad' });
      window.setTimeout(() => draw(), 430);
    }
  };

  const completeLetter = () => {
    setDone(true);
    setCoach({ text: `You wrote ${letter.glyph} beautifully! ✦`, tone: 'good' });
    burst();
    // mastery + reward (form-correct only)
    setMastered(prev => {
      if (prev.includes(letter.key)) return prev;
      const next = [...prev, letter.key];
      const nextXp = xp + 3;
      setXp(nextXp);
      if (uid) {
        awardHandwritingPoints(uid, 'letter', letter.key);
        saveHandwritingProgress(uid, {
          mastery: masteryFromMastered(next), masteredLetters: next, booksCompleted: [], xp: nextXp,
        });
      }
      return next;
    });
  };

  const resetLetter = (idx = letterIdx) => {
    setLetterIdx(idx);
    setStrokeIndex(0); setDone(false); setUserStrokes([]); setLastScore(null);
    setCoach({ text: 'Trace the glowing stroke — start on the red dot.', tone: 'idle' });
  };

  const nextLetter = () => resetLetter((letterIdx + 1) % HANDWRITING_LETTERS.length);

  // ── celebratory confetti ──
  const burst = () => {
    if (reduceMotion.current) return;
    const cvs = confettiRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d')!; const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = window.innerWidth * dpr; cvs.height = window.innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = [ACCENT, '#5fd17f', '#36c5f0', '#e0685a'];
    const cx = window.innerWidth * 0.5, cy = window.innerHeight * 0.42;
    const P = Array.from({ length: 110 }, (_, i) => {
      const a = (i / 110) * Math.PI * 2 + (i % 7), sp = 4 + (i % 9);
      return { x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, r: 3 + (i % 4), c: cols[i % 4], rot: i, vr: (i % 5 - 2) * 0.12, life: 1 };
    });
    let t0 = 0;
    const loop = (t: number) => {
      if (!t0) t0 = t;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = false;
      for (const p of P) {
        p.vy += 0.28; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr; p.life -= 0.007;
        if (p.life > 0 && p.y < window.innerHeight + 20) {
          alive = true;
          ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2.6); ctx.restore();
        }
      }
      if (alive && t - t0 < 3800) requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    requestAnimationFrame(loop);
  };

  // ── tuning persistence ──
  const applyTuning = (next: HandwritingTuning) => {
    setTuning(next);
    if (uid && canTune) { setSavingTune(true); saveLearnerTuning(uid, next, uid).finally(() => setSavingTune(false)); }
  };

  // ── UI ──
  const totalStrokes = letter.strokes.length;

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white" style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <style>{`
        @keyframes pennaPop { 0%{transform:scale(.3);opacity:0} 60%{transform:scale(1.18)} 100%{transform:scale(1);opacity:1} }
        .penna-pop{ animation: pennaPop .42s cubic-bezier(.2,.9,.3,1.3) both; }
        @media (prefers-reduced-motion: reduce){ .penna-pop{ animation:none } }
      `}</style>
      <canvas ref={confettiRef} className="fixed inset-0 w-full h-full pointer-events-none z-[60]" aria-hidden="true" />

      <div className="max-w-5xl mx-auto px-5 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/5 grid place-items-center text-white/60 hover:text-white hover:bg-white/10 transition-colors" aria-label="Back">
              <ArrowLeft size={17} />
            </button>
          )}
          <div className="flex items-center gap-2" style={{ color: ACCENT }}>
            <PenLine size={18} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Penna · Handwriting</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white/55 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              <Star size={11} style={{ color: ACCENT }} /> {xp} XP
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold rounded-full px-3 py-1 border" style={{ color: ACCENT, background: `${ACCENT}18`, borderColor: `${ACCENT}44` }}>
              {tuning.mode === 'manual' ? 'Level' : 'Auto'} · {levelLabel}
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
          {/* ── Writing surface ── */}
          <div className={`bg-white/[0.04] border border-white/10 ${age.radius} p-4`} ref={wrapRef}>
            {/* letter picker */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {HANDWRITING_LETTERS.map((l, i) => {
                const on = i === letterIdx;
                const isMastered = mastered.includes(l.key);
                return (
                  <button key={l.key} onClick={() => resetLetter(i)} title={CATEGORY_LABEL[l.category]}
                    style={{ minWidth: 40, minHeight: 40, borderColor: on ? ACCENT : undefined, color: on ? ACCENT : undefined, background: on ? `${ACCENT}18` : undefined }}
                    className={`relative px-2 rounded-xl border text-[18px] font-bold grid place-items-center transition-colors ${on ? '' : 'border-white/10 text-white/55 bg-white/[0.02] hover:text-white'}`}>
                    {l.glyph}
                    {isMastered && <Check size={11} className="absolute -top-1 -right-1 rounded-full bg-[#5fd17f] text-black p-[1px]" />}
                  </button>
                );
              })}
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-white/10" style={{ background: '#f6f7f2' }}>
              <canvas
                ref={padRef}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                className="block w-full touch-none"
                style={{ height: 'min(56vh, 520px)', cursor: 'crosshair' }}
                aria-label={`Trace the letter ${letter.glyph}`}
              />
              <span className="absolute top-3 left-3 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-black/8 text-black/50 border border-black/10">
                {penKind === 'pen' ? '✎ Pen · pressure on' : penKind === 'touch' ? '☝ Finger' : penKind === 'mouse' ? '🖱 Mouse' : CATEGORY_LABEL[letter.category]}
              </span>
              <span className="absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-black/8 border border-black/10" style={{ color: GUIDE_BLUE }}>
                {done ? 'Done ✦' : `Stroke ${strokeIndex + 1} of ${totalStrokes}`}
              </span>
            </div>

            {/* scaffold + reset */}
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <div className="flex items-center gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-1">
                {(['corridor', 'dotted', 'faded', 'blank'] as Scaffold[]).map(s => (
                  <button key={s} onClick={() => setScaffold(s)}
                    style={{ background: scaffold === s ? ACCENT : undefined, color: scaffold === s ? '#1a1205' : undefined }}
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg capitalize ${scaffold === s ? '' : 'text-white/55 hover:text-white'}`}>{s}</button>
                ))}
              </div>
              <span className="text-[10px] text-white/35 uppercase tracking-wider font-bold">Fades the guide as they grow</span>
              <button onClick={() => resetLetter()} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-white/60 hover:text-white bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <RotateCcw size={12} /> Start over
              </button>
            </div>
          </div>

          {/* ── Coaching + reward + tuning ── */}
          <div className="flex flex-col gap-4">
            {/* coach */}
            <div className={`${age.radius} border p-4`} style={{
              background: coach.tone === 'good' ? 'rgba(95,209,127,0.08)' : coach.tone === 'bad' ? 'rgba(224,104,90,0.08)' : 'rgba(255,255,255,0.04)',
              borderColor: coach.tone === 'good' ? 'rgba(95,209,127,0.35)' : coach.tone === 'bad' ? 'rgba(224,104,90,0.35)' : 'rgba(255,255,255,0.10)',
            }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Aria says</span>
                {lastScore != null && (
                  <span className="text-[22px] font-black tabular-nums" style={{ color: lastScore >= 80 ? '#5fd17f' : lastScore >= 55 ? ACCENT : '#e0685a' }}>{lastScore}</span>
                )}
              </div>
              <p className="text-[15px] font-semibold" style={{ color: coach.tone === 'good' ? '#8fe3a6' : coach.tone === 'bad' ? '#f0a99e' : '#e9ece4' }}>{coach.text}</p>
              {done && (
                <button onClick={nextLetter} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-black uppercase tracking-widest rounded-full px-4 py-2" style={{ background: ACCENT, color: '#1a1205' }}>
                  Next <ChevronRight size={13} />
                </button>
              )}
            </div>

            {/* reward strip */}
            <div className={`${age.radius} border border-white/10 bg-white/[0.04] p-4`}>
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/45 mb-3">
                <span>Painted by correct form</span>
                <span style={{ color: ACCENT }}>{strokeIndex} / {totalStrokes}</span>
              </div>
              <div className="flex items-center gap-2.5">
                {letter.strokes.map((_, i) => {
                  const filled = i < strokeIndex;
                  return (
                    <div key={i} className={`w-11 h-11 rounded-2xl grid place-items-center border ${filled ? 'penna-pop' : ''}`}
                      style={{ background: filled ? `${ACCENT}22` : 'rgba(255,255,255,0.03)', borderColor: filled ? `${ACCENT}66` : 'rgba(255,255,255,0.10)' }}>
                      <Star size={filled ? 20 : 15} style={{ color: filled ? ACCENT : 'rgba(255,255,255,0.18)' }} fill={filled ? ACCENT : 'none'} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* tuning */}
            <div className={`${age.radius} border border-white/10 bg-white/[0.04] overflow-hidden`}>
              <button onClick={() => setTuneOpen(o => !o)} className="w-full flex items-center gap-2.5 p-4 text-left hover:bg-white/[0.02]">
                <SlidersHorizontal size={15} style={{ color: ACCENT }} />
                <div className="flex-1">
                  <p className="text-[13px] font-bold">Difficulty · {levelLabel}</p>
                  <p className="text-[11px] text-white/45">{tuning.mode === 'manual' ? 'Set by an adult' : 'Auto-adapts to progress'}</p>
                </div>
                {!canTune && <Lock size={13} className="text-white/35" />}
                <ChevronRight size={15} className={`text-white/35 transition-transform ${tuneOpen ? 'rotate-90' : ''}`} />
              </button>

              {tuneOpen && (
                <div className="px-4 pb-4 border-t border-white/8 pt-3">
                  {!canTune ? (
                    <p className="text-[12px] text-white/50 flex items-start gap-2">
                      <Lock size={13} className="mt-0.5 shrink-0" />
                      Your teacher or parent sets how strict this is. It gets a little tougher as you master more letters.
                    </p>
                  ) : (
                    <>
                      <p className="text-[11.5px] text-white/50 mb-3">Setting difficulty for <b className="text-white/80">{learnerName}</b>. Students can’t change this themselves.</p>
                      <div className="flex items-center gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-1 mb-3">
                        <button onClick={() => applyTuning({ ...tuning, mode: 'auto' })}
                          style={{ background: tuning.mode === 'auto' ? ACCENT : undefined, color: tuning.mode === 'auto' ? '#1a1205' : undefined }}
                          className={`flex-1 text-[12px] font-bold px-3 py-1.5 rounded-lg ${tuning.mode === 'auto' ? '' : 'text-white/55 hover:text-white'}`}>Auto-adapt</button>
                        <button onClick={() => applyTuning({ ...tuning, mode: 'manual' })}
                          style={{ background: tuning.mode === 'manual' ? ACCENT : undefined, color: tuning.mode === 'manual' ? '#1a1205' : undefined }}
                          className={`flex-1 text-[12px] font-bold px-3 py-1.5 rounded-lg ${tuning.mode === 'manual' ? '' : 'text-white/55 hover:text-white'}`}>Set a level</button>
                      </div>

                      {tuning.mode === 'auto' ? (
                        <p className="text-[12px] text-white/50 flex items-center gap-2">
                          <Sparkles size={13} style={{ color: ACCENT }} />
                          Starts forgiving for {age.label.toLowerCase()}s and tightens as {learnerName} masters more letters. Now: <b className="text-white/80">{levelLabel}</b>.
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-1.5 mb-3">
                            {TUNING_LEVELS.map(lv => {
                              const on = levelForStrictness(tuning.manual).key === lv.key;
                              return (
                                <button key={lv.key} onClick={() => applyTuning({ mode: 'manual', manual: lv.strictness })}
                                  style={{ borderColor: on ? ACCENT : undefined, background: on ? `${ACCENT}18` : undefined }}
                                  className={`text-left rounded-xl border p-2.5 ${on ? '' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                                  <p className="text-[12.5px] font-bold" style={{ color: on ? ACCENT : '#e9ece4' }}>{lv.label}</p>
                                  <p className="text-[10.5px] text-white/45 leading-tight mt-0.5">{lv.hint}</p>
                                </button>
                              );
                            })}
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-white/50">
                            Fine-tune
                            <input type="range" min={0} max={100} value={Math.round(tuning.manual * 100)}
                              onChange={e => applyTuning({ mode: 'manual', manual: +e.target.value / 100 })}
                              className="flex-1" style={{ accentColor: ACCENT }} />
                          </label>
                        </>
                      )}
                      {savingTune && <p className="text-[10px] text-white/35 mt-2">Saving…</p>}
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="text-[10px] text-white/30 leading-relaxed px-1">
              Runs on-device. Best with a pen or finger — pressure varies the ink — and works fine with a mouse. Rewards are earned by correct form only, never speed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function pickCheer(): string {
  const c = ['Beautiful form! ✦', 'Perfect — that’s it!', 'Lovely stroke!', 'You’ve got it!'];
  return c[Math.floor((Date.now() / 900) % c.length)];
}
function coachFor(res: { startOk: boolean; directionOk: boolean; sequenceOk: boolean; corridorOk: boolean; reversed: boolean }): string {
  if (!res.sequenceOk) return 'Start with the glowing stroke first.';
  if (!res.startOk) return 'Start right on the red dot — at the top.';
  if (res.reversed || !res.directionOk) return 'Go the other way — follow the arrow.';
  if (!res.corridorOk) return 'Close! Try to stay inside the line.';
  return 'Almost — give it another go.';
}

export default HandwritingWorkshopView;
