import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lightbulb, Check, XCircle, ArrowRight, RotateCcw } from 'lucide-react';
import { levelFor, levelMeta, loadMastery, recordSet, type SkillMap, type RecordOpts } from '../../services/mastery';
import { reportProblem } from '../../services/contentIntegrity';

/**
 * A practice session — the Khan-style core loop. Shows one question at a time with a hint, instant
 * right/wrong feedback and a short explanation, then a summary of how the skill's mastery moved.
 * Overlay is portaled to <body> (ancestor transforms re-anchor position:fixed otherwise).
 */
export interface PracticeItem {
  id: string;
  prompt: string;
  choices: string[];
  /** Index into choices. */
  answer: number;
  hint?: string;
  explanation?: string;
  level?: 1 | 2 | 3;
  /** Where this idea lives elsewhere on Plajah (shown after answering). */
  connect?: { label: string; view: string };
}

interface Props {
  title: string;
  subtitle?: string;
  accent?: string;
  skillKey: string;
  /** Course/curriculum id, so a problem report can be routed. */
  courseId?: string;
  /** Pool to draw a set from. A fresh set is drawn each "Practice again". */
  pool: PracticeItem[] | (() => PracticeItem[]);
  setSize?: number;
  record?: RecordOpts;
  uid?: string;
  /** Opens a connected school/studio from the "where this shows up" link. */
  onConnect?: (view: string) => void;
  onClose: (map?: SkillMap) => void;
}

const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const PracticeView: React.FC<Props> = ({ title, subtitle, accent = '#FF8C00', skillKey, courseId, pool, setSize = 5, record, uid, onConnect, onClose }) => {
  const draw = () => {
    const src = typeof pool === 'function' ? pool() : pool;
    // Easy → hard within a random draw, like a mastery ladder.
    return shuffle(src).slice(0, setSize).sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
  };
  const [items, setItems] = useState<PracticeItem[]>(draw);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [hinted, setHinted] = useState(false);
  const [results, setResults] = useState<Array<{ correct: boolean; level?: 1 | 2 | 3 }>>([]);
  const [before, setBefore] = useState<SkillMap>({});
  const [after, setAfter] = useState<SkillMap | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [reportMsg, setReportMsg] = useState('');

  useEffect(() => { let a = true; loadMastery(uid).then(m => a && setBefore(m)); return () => { a = false; }; }, [uid, skillKey]);

  const q = items[i];
  const done = i >= items.length;
  const checked = picked !== null;
  const isRight = checked && picked === q?.answer;

  const check = (idx: number) => { if (!checked) setPicked(idx); };
  const sendReport = async () => {
    if (!q || reportNote.trim().length < 3) return;
    const ok = await reportProblem({ kind: 'question', ref: q.id, courseId, note: reportNote, excerpt: `${q.prompt} | answer: ${q.choices[q.answer]}` });
    setReportMsg(ok ? 'Thank you. This question has been sent for review.' : 'Saved on this device and will be sent when you are online. Thank you.');
    setReporting(false); setReportNote('');
  };
  const next = async () => {
    setReporting(false); setReportMsg('');
    const r = [...results, { correct: isRight, level: hinted ? 1 as const : q.level }];
    setResults(r); setPicked(null); setHinted(false);
    if (i + 1 >= items.length) {
      const map = await recordSet(skillKey, r, before, record, uid);
      setAfter(map);
    }
    setI(i + 1);
  };
  const again = () => { setItems(draw()); setI(0); setPicked(null); setHinted(false); setResults([]); if (after) setBefore(after); setAfter(null); };

  const correctCount = results.filter(r => r.correct).length;
  const lvBefore = levelMeta(levelFor(before[skillKey]));
  const lvAfter = after ? levelMeta(levelFor(after[skillKey])) : lvBefore;
  const ptsAfter = Math.round(after?.[skillKey]?.points ?? 0);
  const pctBar = useMemo(() => Math.round((Math.min(i, items.length) / Math.max(1, items.length)) * 100), [i, items.length]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Practice: ${title}`} className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm grid place-items-center p-3" onClick={() => onClose(after || undefined)}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0e0b16] text-white p-5 sm:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: accent }}>Practice</p>
            <h2 className="text-lg font-black leading-tight truncate">{title}</h2>
            {subtitle && <p className="text-[12px] text-white/50 truncate">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Close practice" onClick={() => onClose(after || undefined)} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10 text-white/60"><X size={18} /></button>
        </div>

        {!done && q && (
          <>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1"><div className="h-full transition-all" style={{ width: `${pctBar}%`, background: accent }} /></div>
            <p className="text-[11px] text-white/45 mb-4">Question {i + 1} of {items.length}</p>
            <p className="text-[17px] font-bold leading-snug mb-4 whitespace-pre-line">{q.prompt}</p>

            <div className="grid gap-2">
              {q.choices.map((c, idx) => {
                const isPick = picked === idx; const isAns = q.answer === idx;
                const cls = !checked ? 'border-white/12 bg-white/[0.04] hover:bg-white/[0.09]'
                  : isAns ? 'border-emerald-400/60 bg-emerald-400/15' : isPick ? 'border-rose-400/60 bg-rose-400/15' : 'border-white/8 bg-white/[0.02] opacity-60';
                return (
                  <button key={idx} type="button" disabled={checked} onClick={() => check(idx)}
                    className={`text-left rounded-2xl border px-4 py-3 text-[14px] font-semibold transition-colors flex items-center gap-3 ${cls}`}>
                    <span className="w-6 h-6 rounded-full border border-white/20 grid place-items-center text-[11px] font-black shrink-0">{checked && isAns ? <Check size={13} /> : checked && isPick ? <XCircle size={13} /> : String.fromCharCode(65 + idx)}</span>
                    <span className="min-w-0">{c}</span>
                  </button>
                );
              })}
            </div>

            {!checked && q.hint && (
              hinted
                ? <p className="mt-3 text-[13px] text-amber-200/90 bg-amber-400/10 border border-amber-400/25 rounded-xl px-3 py-2 flex gap-2"><Lightbulb size={15} className="shrink-0 mt-0.5" />{q.hint}</p>
                : <button type="button" onClick={() => setHinted(true)} className="mt-3 text-[12px] font-black text-amber-300/80 hover:text-amber-200 inline-flex items-center gap-1.5"><Lightbulb size={14} /> Show a hint</button>
            )}

            {checked && (
              <div className={`mt-4 rounded-2xl border px-4 py-3 ${isRight ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-rose-400/40 bg-rose-400/10'}`}>
                <p className="font-black text-[14px]">{isRight ? 'Correct!' : 'Not quite.'}</p>
                {q.explanation && <p className="text-[13px] text-white/75 mt-1 leading-snug">{q.explanation}</p>}
                {q.connect && onConnect && (
                  <button type="button" onClick={() => onConnect(q.connect!.view)} className="mt-2 text-[12px] font-black text-white/70 hover:text-white underline underline-offset-2">Where this shows up: {q.connect.label} →</button>
                )}
                <div className="mt-3">
                  {reportMsg ? <p className="text-[11px] text-white/55">{reportMsg}</p>
                    : reporting ? (
                      <div className="grid gap-2">
                        <textarea value={reportNote} onChange={e => setReportNote(e.target.value)} rows={2} placeholder="What looks wrong? (the answer, a fact, the wording)" aria-label="Describe the problem" className="rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-[12px] text-white placeholder:text-white/35" />
                        <div className="flex gap-2"><button type="button" onClick={sendReport} className="rounded-full px-3 py-1 text-[11px] font-black bg-white text-black">Send report</button><button type="button" onClick={() => setReporting(false)} className="rounded-full px-3 py-1 text-[11px] font-black border border-white/20">Cancel</button></div>
                      </div>
                    ) : <button type="button" onClick={() => setReporting(true)} className="text-[11px] text-white/45 hover:text-white underline underline-offset-2">Report a problem with this question</button>}
                </div>
                <button type="button" onClick={next} className="mt-3 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[12px] font-black text-black" style={{ background: accent }}>{i + 1 >= items.length ? 'Finish' : 'Next'} <ArrowRight size={14} /></button>
              </div>
            )}
          </>
        )}

        {done && (
          <div className="text-center py-2">
            <p className="text-4xl mb-1">{correctCount === items.length ? '🌟' : correctCount >= Math.ceil(items.length * 0.6) ? '👏' : '💪'}</p>
            <p className="text-xl font-black">{correctCount} of {items.length} correct</p>
            <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/10 p-4 text-left">
              <div className="flex items-center justify-between text-[12px] mb-2"><span className="text-white/50">Mastery</span><span className="font-black" style={{ color: lvAfter.color }}>{lvAfter.label} · {ptsAfter}%</span></div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full transition-all duration-700" style={{ width: `${ptsAfter}%`, background: lvAfter.color }} /></div>
              {lvAfter.id !== lvBefore.id && lvBefore.id !== 'new' && <p className="text-[12px] mt-2 text-white/70">Up from {lvBefore.label}. Nice work.</p>}
              {ptsAfter < 100 && <p className="text-[11px] mt-2 text-white/40">Keep practicing to reach {ptsAfter < 50 ? 'Familiar' : ptsAfter < 80 ? 'Proficient' : 'Mastered'}.</p>}
            </div>
            <div className="flex gap-2 justify-center mt-5">
              <button type="button" onClick={again} className="rounded-full px-5 py-2.5 text-[12px] font-black border border-white/15 hover:bg-white/10 inline-flex items-center gap-1.5"><RotateCcw size={14} /> Practice again</button>
              <button type="button" onClick={() => onClose(after || undefined)} className="rounded-full px-5 py-2.5 text-[12px] font-black text-black" style={{ background: accent }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PracticeView;
