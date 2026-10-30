// components/desk/LivingTemplateBespokeRenderer.tsx
// True Bespoke Art-Council Architectural Renderer for the 10 Living Worksheet (6) & Test/Quiz (4) Designs.
// Every template ID renders a genuinely different spatial layout, surface physics (ivory parchment, Kente loom,
// rotating brass astrolabe, 2-page stitched botanical field journal, tilted Risograph newsprint zine,
// 0px Swiss Müller-Brockmann blueprint grid, Gothic stained-glass triptych, single-card wax-seal spotlight,
// Mission-Control SVG radar HUD, and Zenith dawn-alabaster breathing sanctuary).

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Hand } from 'lucide-react';
import type {
  IngestedCurriculumUnit,
  StudentUnitSubmission,
} from '../../services/curriculumIngestionService';
import type { SacredLibrarySupplementItem } from '../../services/sacredLibraryCurriculumBridge';

const ANSWER_CSS = `
.la-ans{display:block;width:100%;min-height:46px;position:relative;cursor:text;white-space:pre-wrap;text-align:left}
.la-ans .la-txt{display:block;max-height:3.2em;overflow:hidden}
.la-ans.has .la-txt{-webkit-mask-image:linear-gradient(#000 50%,transparent);mask-image:linear-gradient(#000 50%,transparent)}
.la-ans .la-blank{opacity:.55;font-style:italic}
.la-ans.ro{cursor:default;background-image:repeating-linear-gradient(transparent 0 1.55em,currentColor 1.55em calc(1.55em + 1px));opacity:.5}
.la-ans:focus-visible{outline:2px solid currentColor;outline-offset:2px}
textarea.la-edit{display:block;width:100%;resize:none;overflow:hidden;min-height:88px;transition:height .22s ease}
@media(prefers-reduced-motion:reduce){textarea.la-edit{transition:none}}
`;

/**
 * An open answer. At rest it is a short preview of what was written (or the blank); double-click it
 * (tap on a touch screen, or Enter) to write, and it grows to hold the whole response. Moving on to the
 * next question collapses it again. Every keystroke is saved through `onChange`.
 */
export function AnswerArea({ value, onChange, disabled, readOnly, className }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('la-answer-css')) return;
    const tag = document.createElement('style');
    tag.id = 'la-answer-css';
    tag.textContent = ANSWER_CSS;
    document.head.appendChild(tag);
  }, []);
  const fit = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } };
  useLayoutEffect(() => { if (editing) fit(); }, [editing, value]);
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    el?.focus();
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  const locked = disabled || readOnly;
  const start = () => { if (!locked) setEditing(true); };
  if (editing && !locked) {
    return (
      <textarea
        ref={ref}
        className={`${className || ''} la-edit`}
        value={value}
        onChange={e => { onChange(e.target.value); fit(); }}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }}
        aria-label="Your answer"
      />
    );
  }
  return (
    <div
      role={locked ? undefined : 'button'}
      tabIndex={locked ? -1 : 0}
      aria-label={locked ? undefined : value ? 'Edit your answer' : 'Write your answer'}
      className={`${className || ''} la-ans${value ? ' has' : ''}${readOnly ? ' ro' : ''}`}
      onDoubleClick={start}
      onPointerUp={e => { if (e.pointerType === 'touch') start(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } }}
    >
      <span className="la-txt">{value || (readOnly ? '\u00a0' : <span className="la-blank">Double-click to write your answer</span>)}</span>
    </div>
  );
}

/** A part's prompt, with its question's own text ("Fill in the Blanks:") above the first part, as on the paper. */
export function promptWithStem(q: { id: string; prompt: string; group?: string }, all: Array<{ id: string; group?: string }>): React.ReactNode {
  const i = all.findIndex(x => x.id === q.id);
  if (!q.group || (i > 0 && all[i - 1].group === q.group)) return q.prompt;
  return <><span style={{ display: 'block', whiteSpace: 'pre-wrap', fontWeight: 800, marginBottom: 4 }}>{q.group}</span>{q.prompt}</>;
}

/** The question's number as the original prints it: 7, or 7a / 5.1 for parts. `pad` keeps a theme's 0-padding for whole numbers. */
const qLabel = (q: { number: number; label?: string }, pad = false) => (q.label ? q.label : pad && q.number < 10 ? `0${q.number}` : String(q.number));

export interface LivingTemplateBespokeRendererProps {
  templateId: string;
  unit: IngestedCurriculumUnit;
  answers: Record<string, string>;
  onUpdateAnswer: (questionId: string, value: string) => void;
  supplements: SacredLibrarySupplementItem[];
  isTurnedIn?: boolean;
  submission?: StudentUnitSubmission | null;
  showAnswerKey?: boolean;
  flaggedQuestionIds?: string[];
  onToggleFlagQuestion?: (questionId: string) => void;
  /** Read mode (a teacher viewing the lesson): the page as students get it, nothing to fill in. */
  readOnly?: boolean;
}

export const LivingTemplateBespokeRenderer: React.FC<LivingTemplateBespokeRendererProps> = ({
  templateId,
  unit,
  answers,
  onUpdateAnswer,
  isTurnedIn = false,
  submission,
  showAnswerKey = false,
  flaggedQuestionIds = [],
  onToggleFlagQuestion,
  readOnly = false,
}) => {
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const questions = unit.questions || [];
  // Every template shows only the original — its title, header fields, own text and questions, numbered as
  // printed. A template changes the look (colors, type, frame), never the content: no banners, invented
  // quotes, progress gadgets, section labels or themed numbering ("Quaestio 3", "WEFT 03").
  const readingBlocks = unit.lessonBlocks.filter(b => b.kind !== 'h1' || b.text.trim() !== unit.title.trim());
  /** The original's own heading: title, header fields, then its text. `c` = class names for each part. */
  const pageHead = (c: { title: string; fields: string; text: string; wrap?: string }) => (
    <div className={c.wrap ?? 'space-y-3'}>
      <h3 className={c.title}>{unit.title}</h3>
      {detailRow(c.fields)}
      {readingBlocks.map(b =>
        b.kind === 'h2' ? <h4 key={b.id} className={`${c.text} font-bold`}>{b.text}</h4>
        : <p key={b.id} className={c.text} style={{ whiteSpace: 'pre-wrap' }}>{b.text}</p>
      )}
    </div>
  );
  /** The original's header fields (NAME, COUNSELOR, DATE …) as lines to write on, never as questions. */
  const detailRow = (cls: string) =>
    unit.detailFields?.length ? (
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-[11px] uppercase tracking-[0.14em]">
        {unit.detailFields.map(f => (
          <span key={f} className={`flex-1 min-w-[140px] border-b pb-1 ${cls}`}>{f}</span>
        ))}
      </div>
    ) : null;

  const renderInputControl = (
    q: IngestedCurriculumUnit['questions'][number],
    btnClass: (selected: boolean) => string,
    inputClass: string
  ) => {
    const val = answers[q.id] || '';
    const choices = q.options && q.options.length > 0 ? q.options : q.type === 'true-false' ? ['True', 'False'] : null;
    if (choices) {
      return (
        <div className="grid sm:grid-cols-2 gap-2">
          {choices.map(opt => {
            const selected = val === opt || val === opt.match(/^([A-F])\)/i)?.[1];
            return (
              <button
                key={opt}
                type="button"
                disabled={isTurnedIn || readOnly}
                aria-pressed={Boolean(selected)}
                onClick={() => onUpdateAnswer(q.id, opt)}
                className={btnClass(Boolean(selected))}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    return <AnswerArea value={val} onChange={v => onUpdateAnswer(q.id, v)} disabled={isTurnedIn} readOnly={readOnly} className={inputClass} />;
  };

  const renderFeedback = (
    q: IngestedCurriculumUnit['questions'][number],
    darkText = false
  ) => {
    const qResult = submission?.questionScores?.[q.id];
    if (!showAnswerKey && !isTurnedIn && !qResult) return null;
    return (
      <div
        className={`rounded-xl border p-2.5 text-xs space-y-1 mt-2 ${
          darkText
            ? 'bg-amber-50/90 border-amber-700/40 text-stone-900'
            : 'bg-black/60 border-white/15 text-white'
        }`}
      >
        {qResult && (
          <div className="font-black text-emerald-500">
            {qResult.pending
              ? 'Waiting for your teacher to check this one'
              : qResult.correct
              ? `✓ Correct (+${qResult.earnedPoints}/${qResult.maxPoints} pts)`
              : `✦ Reviewed (+${qResult.earnedPoints}/${qResult.maxPoints} pts)`}
          </div>
        )}
        {(q.correctAnswer || qResult?.expected) && (
          <div>
            <strong>Answer Key:</strong> {q.correctAnswer || qResult?.expected}
          </div>
        )}
        {q.explanation && (
          <div className="opacity-85">
            <strong>Rubric / Explanation:</strong> {q.explanation}
          </div>
        )}
      </div>
    );
  };

  // ===========================================================================
  // 01. MEDIEVAL SCRIPTORIUM 3-COLUMN CODEX FOLIO (Warm Cream Parchment + Menorah)
  // ===========================================================================
  if (templateId === 'ws-sanctuary-vellum') {
    return (
      <div
        className="rounded-2xl border-4 border-[#8B5A2B] bg-[#F5EEDB] text-[#2B1A10] p-5 sm:p-7 shadow-2xl"
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          boxShadow: 'inset 0 0 55px rgba(139, 90, 43, 0.25)',
        }}
      >
        <div className="border-2 border-[#B48327] p-4 sm:p-6 space-y-5">
          {pageHead({
            wrap: 'space-y-3 border-b-2 border-[#991B1B] pb-4',
            title: 'text-xl sm:text-2xl font-black text-[#2B1A10]',
            fields: 'border-[#8B5A2B] text-[#573B26]',
            text: 'text-xs sm:text-sm text-[#2B1A10] leading-relaxed',
          })}
          <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              {questions.map(q => (
                <div
                  key={q.id}
                  className="bg-[#EFE5CC] border-2 border-[#8B5A2B] p-3.5 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-black text-[#991B1B]">
                    <span>{qLabel(q)}.</span>
                    <span>{q.points} pts</span>
                  </div>
                  <p className="text-xs font-bold text-[#2B1A10] leading-relaxed">{promptWithStem(q, questions)}</p>
                  {renderInputControl(
                    q,
                    selected =>
                      `text-left px-3 py-2 border text-xs transition ${
                        selected
                          ? 'bg-[#991B1B] text-[#FAF4E4] border-[#450A0A] font-bold shadow'
                          : 'bg-[#FAF4E4] text-[#2B1A10] border-[#B48327] hover:bg-[#E8D8B5]'
                      }`,
                    'w-full bg-[#FAF4E4] border border-[#8B5A2B] p-2.5 text-xs text-[#2B1A10]'
                  )}
                  {renderFeedback(q, true)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 02. ROYAL ASHANTI KENTE LOOM & STAGGERED CHECKERBOARD WEAVE
  // ===========================================================================
  if (templateId === 'ws-kente-sovereign') {
    const kenteBandStyle: React.CSSProperties = {
      background:
        'repeating-linear-gradient(90deg, #F59E0B 0px, #F59E0B 14px, #111827 14px, #111827 20px, #BE123C 20px, #BE123C 34px, #059669 34px, #059669 44px, #7E22CE 44px, #7E22CE 58px)',
    };
    return (
      <div className="rounded-3xl border-2 border-amber-400 overflow-hidden bg-[#0E0918] text-white shadow-2xl">
        <div className="h-4" style={kenteBandStyle} />
        <div className="p-5 sm:p-7 space-y-6">
          {pageHead({
            wrap: 'space-y-3 border-b border-amber-400/30 pb-5',
            title: 'text-xl sm:text-2xl font-black',
            fields: 'border-amber-400/60 text-amber-200/80',
            text: 'text-xs sm:text-sm text-amber-100/90 leading-relaxed',
          })}

          {/* Staggered Zig-Zag Tapestry Question Strips */}
          <div className="space-y-4">
            {questions.map(q => {
              return (
                <div key={q.id} className="grid lg:grid-cols-12 gap-3 items-center">
                  <div className="lg:col-span-12 rounded-2xl border-2 border-amber-400/60 bg-[#161024] p-4 pl-6 relative overflow-hidden space-y-2.5">
                    <div
                      className="w-2.5 absolute top-0 bottom-0 left-0"
                      style={kenteBandStyle}
                    />
                    <div className="flex items-center justify-between text-xs font-black text-amber-300">
                      <span>{qLabel(q)}.</span>
                      <span>{q.points} pts</span>
                    </div>
                    <p className="text-xs sm:text-sm font-black text-white">{promptWithStem(q, questions)}</p>
                    {renderInputControl(
                      q,
                      selected =>
                        `text-left px-3.5 py-2.5 rounded-xl border text-xs font-bold transition ${
                          selected
                            ? 'bg-gradient-to-r from-amber-400 via-pink-500 to-purple-600 text-black font-black border-white shadow-lg'
                            : 'bg-black/50 border-white/15 text-white/80 hover:border-amber-400'
                        }`,
                      'w-full bg-black/60 border border-amber-400/40 rounded-xl p-2.5 text-xs text-white'
                    )}
                    {renderFeedback(q)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="h-4" style={kenteBandStyle} />
      </div>
    );
  }

  // ===========================================================================
  // 03. CELESTIAL ASTROLABE DIAL & ORBITAL STAR CHART
  // ===========================================================================
  if (templateId === 'ws-celestial-astrolabe') {
    const q0 = Boolean(questions[0] && (answers[questions[0].id] || '').trim());
    const q1 = Boolean(questions[1] && (answers[questions[1].id] || '').trim());
    const q2 = Boolean(questions[2] && (answers[questions[2].id] || '').trim());
    return (
      <div
        className="rounded-3xl border-2 border-sky-400/50 p-5 sm:p-7 text-white shadow-2xl space-y-5"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, #102048 0%, #070D24 55%, #040714 100%)',
        }}
      >
        {pageHead({
          wrap: 'space-y-3 border-b border-sky-400/30 pb-4',
          title: 'text-xl sm:text-2xl font-black text-white',
          fields: 'border-sky-400/50 text-sky-200/80',
          text: 'text-xs sm:text-sm text-sky-100/90 leading-relaxed',
        })}

        <div className="grid lg:grid-cols-12 gap-6 items-center">
          {/* Center-Left Brass & Sapphire SVG Astrolabe */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 rounded-3xl border border-amber-400/35 bg-[#091330]/80">
            <svg width="240" height="240" viewBox="0 0 290 290">
              <circle
                cx="145"
                cy="145"
                r="132"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2"
                strokeOpacity="0.65"
              />
              <circle
                cx="145"
                cy="145"
                r="116"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <circle
                cx="145"
                cy="145"
                r="88"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.2"
                strokeDasharray="10 6"
              />
              <line
                x1="78"
                y1="92"
                x2="205"
                y2="84"
                stroke={q0 && q1 ? '#FBBF24' : 'rgba(255,255,255,0.2)'}
                strokeWidth={q0 && q1 ? '3' : '1.2'}
              />
              <line
                x1="205"
                y1="84"
                x2="152"
                y2="210"
                stroke={q1 && q2 ? '#38BDF8' : 'rgba(255,255,255,0.2)'}
                strokeWidth={q1 && q2 ? '3' : '1.2'}
              />
              <circle
                cx="78"
                cy="92"
                r={q0 ? 11 : 7}
                fill={q0 ? '#FBBF24' : '#1E293B'}
                stroke="#38BDF8"
                strokeWidth="2"
              />
              <circle
                cx="205"
                cy="84"
                r={q1 ? 11 : 7}
                fill={q1 ? '#38BDF8' : '#1E293B'}
                stroke="#FBBF24"
                strokeWidth="2"
              />
              <circle
                cx="152"
                cy="210"
                r={q2 ? 11 : 7}
                fill={q2 ? '#34D399' : '#1E293B'}
                stroke="#FBBF24"
                strokeWidth="2"
              />
            </svg>
          </div>

          {/* Right Orbiting Constellation Question Pods */}
          <div className="lg:col-span-7 space-y-3.5">
            {questions.map(q => (
              <div
                key={q.id}
                className="rounded-3xl border border-sky-400/40 bg-[#0B1739]/90 p-4 space-y-2.5 shadow-lg"
              >
                <div className="flex items-center justify-between font-mono text-xs text-amber-300">
                  <span>{qLabel(q)}.</span>
                  <span>{q.points} pts</span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-white">{promptWithStem(q, questions)}</p>
                {renderInputControl(
                  q,
                  selected =>
                    `text-left px-3 py-2 rounded-2xl border text-xs font-semibold transition ${
                      selected
                        ? 'bg-gradient-to-r from-sky-400 to-amber-300 text-black font-black border-white shadow'
                        : 'bg-[#060D24] border-sky-400/25 text-sky-100 hover:border-sky-300'
                    }`,
                  'w-full bg-[#060D24] border border-sky-400/35 rounded-2xl p-2.5 text-xs text-white'
                )}
                {renderFeedback(q)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 04. EDEN BOTANICAL OPEN 2-PAGE HERBARIUM NOTEBOOK & WINDING VINE
  // ===========================================================================
  if (templateId === 'ws-botanical-atelier') {
    return (
      <div className="rounded-3xl border-4 border-[#2D4F3E] bg-[#F2F5EC] text-[#142B1F] shadow-2xl overflow-hidden">
        <div className="grid lg:grid-cols-12">
          {/* Left Page: Herbarium Specimen & Taped Field Notes */}
          <div className="lg:col-span-5 p-5 sm:p-7 border-b lg:border-b-0 lg:border-r-4 border-double border-[#2D4F3E]/50 bg-[#EBF1E4] space-y-4">
            {pageHead({
              title: 'text-xl font-black text-[#142B1F] font-serif',
              fields: 'border-[#2D4F3E] text-[#2D4F3E]',
              text: 'text-xs text-[#2B3D34] leading-relaxed font-serif',
            })}
          </div>

          {/* Right Page: Winding Vine Inquiry Path */}
          <div className="lg:col-span-7 p-5 sm:p-7 space-y-4">
            <div className="relative pl-7 border-l-4 border-[#1B4332] space-y-4">
              {questions.map(q => {
                const hasAns = Boolean((answers[q.id] || '').trim());
                return (
                  <div
                    key={q.id}
                    className="relative bg-[#FAFDF7] border-2 border-[#40916C] rounded-2xl p-4 shadow-sm space-y-2"
                  >
                    <div
                      className={`w-7 h-7 rounded-full border-2 border-[#1B4332] flex items-center justify-center text-xs absolute -left-11 top-4 ${
                        hasAns ? 'bg-[#40916C] text-white' : 'bg-[#E9F2E2] text-[#1B4332]'
                      }`}
                    >
                      {hasAns ? '🌸' : '🌱'}
                    </div>
                    <div className="flex justify-between text-xs font-bold text-[#1B4332]">
                      <span>{qLabel(q)}.</span>
                      <span>{q.points} pts</span>
                    </div>
                    <p
                      className="text-xs sm:text-sm font-bold text-[#142B1F]"
                      style={{ fontFamily: 'Georgia, serif' }}
                    >
                      {promptWithStem(q, questions)}
                    </p>
                    {renderInputControl(
                      q,
                      selected =>
                        `text-left px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                          selected
                            ? 'bg-[#1B4332] text-[#D8F3DC] border-[#081C15] font-black shadow'
                            : 'bg-[#F2F5EC] text-[#142B1F] border-[#74C69D] hover:bg-[#D8F3DC]'
                        }`,
                      'w-full bg-[#F2F5EC] border border-[#40916C] rounded-xl p-2.5 text-xs text-[#142B1F]'
                    )}
                    {renderFeedback(q, true)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 05. BRUTALIST RISOGRAPH PRINTMAKER ZINE & RUBBER INK STAMPS
  // ===========================================================================
  if (templateId === 'ws-risograph-studio') {
    return (
      <div
        className="rounded-none border-4 border-black bg-[#FAF5E8] text-black p-5 sm:p-7 space-y-6"
        style={{ boxShadow: '10px 10px 0px #FF2A5F' }}
      >
        <div
          className="bg-black text-white p-5 border-4 border-[#FF2A5F]"
          style={{ boxShadow: '7px 7px 0px #FACC15' }}
        >
          {pageHead({
            title: 'text-xl sm:text-2xl font-black',
            fields: 'border-[#FACC15] text-[#FACC15] font-mono',
            text: 'text-xs text-[#FACC15] font-mono',
          })}
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {questions.map((q, idx) => {
            const hasAns = Boolean((answers[q.id] || '').trim());
            const shadowColors = ['#1D4ED8', '#FF2A5F', '#0D9488'];
            return (
              <div
                key={q.id}
                className="bg-white border-4 border-black p-4 space-y-3 relative"
                style={{ boxShadow: `6px 6px 0px ${shadowColors[idx % 3]}` }}
              >
                <div className="font-mono text-xs font-black bg-black text-[#FACC15] px-2 py-0.5 inline-block">
                  {qLabel(q)}. · {q.points} pts{hasAns ? ' ★' : ''}
                </div>
                <p className="text-xs sm:text-sm font-black text-black">{promptWithStem(q, questions)}</p>
                {renderInputControl(
                  q,
                  selected =>
                    `text-left px-2.5 py-2 border-2 border-black text-xs font-bold transition ${
                      selected
                        ? 'bg-[#FF2A5F] text-white font-black'
                        : 'bg-[#FAF5E8] text-black hover:bg-[#FACC15]'
                    }`,
                  'w-full bg-[#FAF5E8] border-2 border-black p-2.5 text-xs text-black font-bold'
                )}
                {renderFeedback(q, true)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 06. SWISS MÜLLER-BROCKMANN EXPOSED HAIRLINE BLUEPRINT MATRIX
  // ===========================================================================
  if (templateId === 'ws-swiss-kinetic') {
    return (
      <div className="rounded-none border-2 border-black bg-[#F4F4F0] text-black shadow-2xl overflow-hidden">
        <div className="grid grid-cols-12 border-b-2 border-black">
          <div className="col-span-12 sm:col-span-3 bg-[#FF4F00]" aria-hidden />
          <div className="col-span-12 sm:col-span-9 p-4 bg-white">
            {pageHead({
              title: 'text-xl font-black tracking-tight',
              fields: 'border-black text-black/60 font-mono',
              text: 'text-xs text-black/80',
            })}
          </div>
        </div>

        <div className="divide-y-2 divide-black">
          {questions.map(q => {
            const hasAns = Boolean((answers[q.id] || '').trim());
            return (
              <div key={q.id} className="grid lg:grid-cols-12">
                <div
                  className={`lg:col-span-2 p-4 border-b lg:border-b-0 lg:border-r-2 border-black flex flex-col justify-between ${
                    hasAns ? 'bg-[#FACC15] text-black' : 'bg-white text-black'
                  }`}
                >
                  <span className="font-mono text-xs font-bold">{q.points} pts</span>
                  <span className="text-4xl font-black tracking-tighter">{qLabel(q)}</span>
                </div>
                <div className="lg:col-span-4 p-4 border-b lg:border-b-0 lg:border-r-2 border-black bg-white">
                  <p className="text-xs sm:text-sm font-black text-black">{promptWithStem(q, questions)}</p>
                  {renderFeedback(q, true)}
                </div>
                <div className="lg:col-span-6 p-3 bg-[#F4F4F0]">
                  {renderInputControl(
                    q,
                    selected =>
                      `text-left p-3 border border-black text-xs font-bold transition ${
                        selected
                          ? 'bg-black text-[#FACC15] font-black'
                          : 'bg-white text-black hover:bg-[#E5E5E0]'
                      }`,
                    'w-full bg-white border-2 border-black p-2.5 text-xs text-black'
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 07. CATHEDRAL STAINED-GLASS ROSE WINDOW TRIPTYCH
  // ===========================================================================
  if (templateId === 'tq-cathedral-mastery') {
    const q0 = Boolean(questions[0] && (answers[questions[0].id] || '').trim());
    const q1 = Boolean(questions[1] && (answers[questions[1].id] || '').trim());
    const q2 = Boolean(questions[2] && (answers[questions[2].id] || '').trim());
    return (
      <div
        className="rounded-t-[110px] rounded-b-3xl border-4 border-purple-400/60 bg-[#10081C] text-white p-6 sm:p-8 shadow-2xl space-y-6"
        style={{
          background:
            'radial-gradient(circle at 50% 10%, rgba(168, 85, 247, 0.35) 0%, rgba(219, 39, 119, 0.18) 38%, #0B0614 75%)',
        }}
      >
        <div className="flex flex-col items-center text-center space-y-2 border-b border-purple-400/30 pb-5">
          <svg width="136" height="136" viewBox="0 0 170 170">
            <circle cx="85" cy="85" r="78" fill="#1A0E2E" stroke="#F59E0B" strokeWidth="3" />
            <path
              d="M85 85 L45 20 A75 75 0 0 1 125 20 Z"
              fill={q0 ? '#EC4899' : '#2E1C44'}
              stroke="#FDE68A"
              strokeWidth="2"
            />
            <path
              d="M85 85 L155 110 A75 75 0 0 1 85 160 Z"
              fill={q1 ? '#38BDF8' : '#2E1C44'}
              stroke="#FDE68A"
              strokeWidth="2"
            />
            <path
              d="M85 85 L85 160 A75 75 0 0 1 15 110 Z"
              fill={q2 ? '#F59E0B' : '#2E1C44'}
              stroke="#FDE68A"
              strokeWidth="2"
            />
            <circle cx="85" cy="85" r="20" fill="#FDE68A" />
          </svg>
          {pageHead({
            wrap: 'space-y-3 w-full',
            title: 'text-xl sm:text-2xl font-black font-serif',
            fields: 'border-purple-300/60 text-purple-200/80 text-left',
            text: 'text-xs sm:text-sm text-purple-100/90 leading-relaxed',
          })}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {questions.map(q => (
            <div
              key={q.id}
              className="rounded-t-[64px] rounded-b-2xl border-2 border-purple-400/50 bg-[#180C29] p-5 pt-9 flex flex-col justify-between gap-3 shadow-xl"
            >
              <div className="space-y-1.5 text-center">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-xs font-black">
                  {qLabel(q)}.
                </span>
                <p className="text-xs sm:text-sm font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>
                  {promptWithStem(q, questions)}
                </p>
              </div>
              {renderInputControl(
                q,
                selected =>
                  `w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                    selected
                      ? 'bg-gradient-to-r from-amber-300 via-pink-300 to-purple-300 text-black font-black border-white'
                      : 'bg-black/55 border-white/15 text-white/85 hover:border-amber-300'
                  }`,
                'w-full bg-black/60 border border-purple-400/40 rounded-xl p-2.5 text-xs text-white'
              )}
              {renderFeedback(q)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 08. SCHOLAR'S TRIAL SINGLE-CARD SPOTLIGHT STAGE & 3D WAX SEAL
  // ===========================================================================
  if (templateId === 'tq-scholar-quest') {
    const safeIdx = Math.min(spotlightIdx, Math.max(0, questions.length - 1));
    const activeQ = questions[safeIdx];
    const isSealed = activeQ && Boolean((answers[activeQ.id] || '').trim());
    return (
      <div
        className="rounded-3xl border-2 border-amber-400/60 bg-[#230E12] text-white p-5 sm:p-7 shadow-2xl space-y-5"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/30 pb-3">
          {pageHead({
            wrap: 'space-y-3 flex-1 min-w-[240px]',
            title: 'text-lg sm:text-xl font-black',
            fields: 'border-amber-300/60 text-amber-200/80',
            text: 'text-xs sm:text-sm text-amber-100/90 leading-relaxed',
          })}
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q, idx) => {
              const sealed = Boolean((answers[q.id] || '').trim());
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSpotlightIdx(idx)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-black transition ${
                    idx === safeIdx
                      ? 'bg-amber-400 text-black border-white shadow'
                      : sealed
                      ? 'bg-red-800 text-amber-200 border-amber-400'
                      : 'bg-black/40 text-white/60 border-white/20'
                  }`}
                >
                  {sealed ? '✓ ' : ''}{qLabel(q)}
                </button>
              );
            })}
          </div>
        </div>

        {activeQ && (
          <div className="rounded-3xl border-2 border-amber-300/60 bg-[#FAF2E1] text-[#2B1410] p-5 sm:p-7 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-[#881337]/25 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded bg-[#881337] text-amber-200 text-xs font-black uppercase">
                  {qLabel(activeQ)}. · {activeQ.points} pts
                </span>
                <p className="text-sm sm:text-base font-black text-[#2B1410] mt-2">
                  {promptWithStem(activeQ, questions)}
                </p>
              </div>
              <div className="shrink-0 text-center">
                <div
                  className={`w-14 h-14 rounded-full border-2 border-amber-300 flex items-center justify-center text-xs font-black shadow-md ${
                    isSealed ? 'bg-[#B91C1C] text-amber-200' : 'bg-stone-400 text-stone-800'
                  }`}
                >
                  {isSealed ? '✓' : ''}
                </div>
              </div>
            </div>

            {renderInputControl(
              activeQ,
              selected =>
                `text-left p-3 rounded-2xl border-2 text-xs font-bold transition ${
                  selected
                    ? 'bg-[#881337] text-[#FEF3C7] border-[#F59E0B] shadow-lg'
                    : 'bg-white text-[#2B1410] border-[#D6C29F] hover:border-[#881337]'
                }`,
              'w-full bg-white border-2 border-[#881337] rounded-2xl p-3 text-xs text-[#2B1410]'
            )}
            {renderFeedback(activeQ, true)}

            <div className="flex items-center justify-between pt-3 border-t border-[#881337]/20 text-xs font-bold">
              <button
                type="button"
                onClick={() =>
                  setSpotlightIdx((safeIdx - 1 + questions.length) % questions.length)
                }
                className="px-3.5 py-1.5 rounded-xl bg-[#2B1410] text-amber-200"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => setSpotlightIdx((safeIdx + 1) % questions.length)}
                className="px-3.5 py-1.5 rounded-xl bg-[#881337] text-amber-200"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 09. LUMINA MISSION-CONTROL TELEMETRY HUD & RADAR POLYGON
  // ===========================================================================
  if (templateId === 'tq-observatory-benchmark') {
    const r0 = questions[0] && (answers[questions[0].id] || '').trim() ? 72 : 28;
    const r1 = questions[1] && (answers[questions[1].id] || '').trim() ? 72 : 28;
    const r2 = questions[2] && (answers[questions[2].id] || '').trim() ? 72 : 28;
    const poly = `100,${100 - r0} ${100 + r1 * 0.86},${100 + r1 * 0.5} ${100 - r2 * 0.86},${100 + r2 * 0.5}`;

    return (
      <div className="rounded-2xl border-2 border-teal-400/60 bg-[#05101A] text-teal-100 p-5 sm:p-7 shadow-2xl space-y-5 font-mono">
        {pageHead({
          wrap: 'space-y-3 border-b border-teal-400/30 pb-4 font-sans',
          title: 'text-xl font-black text-teal-50',
          fields: 'border-teal-400/50 text-teal-300/80 font-mono',
          text: 'text-xs sm:text-sm text-teal-100/90 leading-relaxed',
        })}

        <div className="grid lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 rounded-2xl border border-teal-400/40 bg-[#081A2B] p-4 flex flex-col items-center">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="75"
                fill="none"
                stroke="rgba(45,212,191,0.25)"
                strokeWidth="1"
              />
              <circle
                cx="100"
                cy="100"
                r="45"
                fill="none"
                stroke="rgba(45,212,191,0.25)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <polygon
                points={poly}
                fill="rgba(45,212,191,0.32)"
                stroke="#2DD4BF"
                strokeWidth="2.5"
              />
            </svg>
          </div>

          <div className="lg:col-span-8 space-y-3 font-sans">
            {questions.map(q => (
              <div
                key={q.id}
                className="rounded-xl border border-teal-400/40 bg-[#081A2B] p-4 space-y-2"
              >
                <div className="flex justify-between font-mono text-xs text-teal-300">
                  <span>{qLabel(q)}.</span>
                  <span>{q.points} pts</span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-white">{promptWithStem(q, questions)}</p>
                {renderInputControl(
                  q,
                  selected =>
                    `text-left px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                      selected
                        ? 'bg-teal-400 text-black font-black border-white'
                        : 'bg-[#040D16] border-teal-400/25 text-teal-100 hover:border-teal-300'
                    }`,
                  'w-full bg-[#040D16] border border-teal-400/35 rounded-lg p-2.5 text-xs text-white'
                )}
                {renderFeedback(q)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 11. CORNELL IVY ACADEMIC NOTE SYSTEM (30% Cue Rail + 70% Notes + Bottom Summary)
  // ===========================================================================
  if (templateId === 'std-ws-cornell-ivy') {
    return (
      <div className="rounded-xl border border-[#E2DFD7] bg-[#FDFCF9] text-[#111827] shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b-2 border-[#111827] bg-white">
          {pageHead({
            title: 'text-xl sm:text-2xl font-bold text-[#111827] font-serif',
            fields: 'border-[#111827] text-slate-500 font-mono',
            text: 'text-xs sm:text-sm text-slate-700 leading-relaxed font-serif',
          })}
        </div>
        <div className="p-6 space-y-4">
          {questions.map(q => (
            <div key={q.id} className="grid sm:grid-cols-12 gap-3 rounded-lg border border-[#E5E2DC] bg-white p-4 shadow-sm">
              <div className="sm:col-span-3 sm:border-r border-[#E2DFD7] sm:pr-3 font-mono text-xs font-bold text-[#1E3A8A] flex sm:flex-col justify-between">
                <span>{qLabel(q)}.</span>
                <span className="text-slate-500">{q.points} pts</span>
              </div>
              <div className="sm:col-span-9 space-y-2.5">
                <p className="text-sm font-bold text-[#111827]">{promptWithStem(q, questions)}</p>
                {renderInputControl(
                  q,
                  selected =>
                    `text-left px-3 py-2 rounded-md border text-xs font-semibold transition ${
                      selected
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-sm'
                        : 'bg-[#FDFCF9] text-slate-800 border-slate-300 hover:border-[#1E3A8A]'
                    }`,
                  'w-full bg-[#FDFCF9] border border-slate-300 rounded-md p-2.5 text-xs text-slate-900 focus:border-[#1E3A8A] focus:outline-none'
                )}
                {renderFeedback(q, true)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 12. KINFOLK EDITORIAL MAGAZINE SPREAD (Nordic 2-Column Print + Pull-Quote Gutter)
  // ===========================================================================
  if (templateId === 'std-ws-kinfolk-editorial') {
    return (
      <div className="rounded-lg border border-[#E6E1D6] bg-[#FAF8F5] text-[#1C1917] p-6 sm:p-10 shadow-xl space-y-7">
        {pageHead({
          wrap: 'space-y-4 border-b border-[#E5E0D8] pb-7',
          title: 'text-2xl sm:text-4xl font-normal tracking-tight text-[#1C1917] leading-tight font-serif',
          fields: 'border-[#1C1917] text-[#78716C]',
          text: 'text-sm text-[#44403C] leading-relaxed font-serif',
        })}

        {/* 2-Column Editorial Spread of Prompts */}
        <div className="grid md:grid-cols-2 gap-6">
          {questions.map(q => (
            <div
              key={q.id}
              className="bg-white border border-[#E5E0D8] p-5 space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-[#F0ECE1] pb-2">
                <span
                  className="text-lg italic text-[#9A3412]"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  {qLabel(q)}.
                </span>
                <span className="font-mono text-[11px] text-[#78716C]">{q.points} pts</span>
              </div>
              <p className="text-sm font-semibold text-[#1C1917] leading-relaxed">{promptWithStem(q, questions)}</p>
              {renderInputControl(
                q,
                selected =>
                  `text-left px-3 py-2 border text-xs font-medium transition ${
                    selected
                      ? 'bg-[#1C1917] text-[#FAF8F5] border-[#1C1917] font-semibold'
                      : 'bg-[#FAF8F5] text-[#1C1917] border-[#D6D0C4] hover:border-[#9A3412]'
                  }`,
                'w-full bg-[#FAF8F5] border border-[#D6D0C4] p-3 text-xs text-[#1C1917] focus:border-[#9A3412] focus:outline-none'
              )}
              {renderFeedback(q, true)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 13. BAUHAUS LINEAR STUDIO WORKBOOK (Dieter Rams Braun × Linear Industrial Grid)
  // ===========================================================================
  if (templateId === 'std-ws-linear-studio') {
    return (
      <div className="rounded-xl border border-[#D4D4D0] bg-[#F4F4F2] text-[#18181B] p-5 sm:p-7 shadow-xl space-y-5">
        <div className="bg-white border border-[#D4D4D0] rounded-lg p-5">
          {pageHead({
            title: 'text-xl font-black tracking-tight text-zinc-900',
            fields: 'border-zinc-400 text-zinc-500 font-mono',
            text: 'text-xs text-zinc-600 leading-relaxed',
          })}
        </div>

        {/* Precision Spec Cards */}
        <div className="space-y-3">
          {questions.map(q => {
            const done = Boolean((answers[q.id] || '').trim());
            return (
              <div
                key={q.id}
                className="bg-white border border-[#D4D4D0] rounded-lg p-4 grid lg:grid-cols-12 gap-4 items-start"
              >
                <div className="lg:col-span-5 space-y-1.5">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        done ? 'bg-emerald-500' : 'bg-[#FF5500]'
                      }`}
                    />
                    <span className="font-bold text-zinc-900">{qLabel(q)}.</span>
                    <span className="text-zinc-400">· {q.points} pts</span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-zinc-900">{promptWithStem(q, questions)}</p>
                  {renderFeedback(q, true)}
                </div>
                <div className="lg:col-span-7">
                  {renderInputControl(
                    q,
                    selected =>
                      `text-left px-3 py-2 rounded-md border font-mono text-xs font-semibold transition ${
                        selected
                          ? 'bg-[#18181B] text-white border-[#18181B]'
                          : 'bg-[#F4F4F2] text-zinc-800 border-zinc-300 hover:border-[#FF5500]'
                      }`,
                    'w-full bg-[#F4F4F2] border border-zinc-300 rounded-md p-2.5 text-xs text-zinc-900 font-mono focus:border-[#FF5500] focus:outline-none'
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 14. APPLE BENTO MODULAR CASE CANVAS (12-Column Rounded Bento Architecture)
  // ===========================================================================
  if (templateId === 'std-ws-bento-canvas') {
    return (
      <div className="rounded-[28px] border border-slate-200/90 bg-[#F1F5F9] text-[#0F172A] p-5 sm:p-7 shadow-xl space-y-4">
        <div className="rounded-[22px] bg-white border border-slate-200/80 p-6 shadow-sm">
          {pageHead({
            title: 'text-xl sm:text-2xl font-black tracking-tight text-slate-900',
            fields: 'border-slate-300 text-slate-500',
            text: 'text-xs sm:text-sm text-slate-600 leading-relaxed',
          })}
        </div>

        {/* Asymmetric 12-Col Bento Question Tiles */}
        <div className="grid lg:grid-cols-12 gap-4">
          {questions.map((q, idx) => {
            const spanClass =
              idx % 3 === 0 ? 'lg:col-span-7' : idx % 3 === 1 ? 'lg:col-span-5' : 'lg:col-span-12';
            return (
              <div
                key={q.id}
                className={`${spanClass} rounded-[22px] bg-white border border-slate-200/80 p-5 shadow-sm space-y-3`}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">
                    {qLabel(q)}.
                  </span>
                  <span className="text-xs font-semibold text-blue-600">{q.points} pts</span>
                </div>
                <p className="text-sm font-bold text-slate-900">{promptWithStem(q, questions)}</p>
                {renderInputControl(
                  q,
                  selected =>
                    `text-left px-3.5 py-2.5 rounded-2xl border text-xs font-semibold transition ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-blue-400'
                    }`,
                  'w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none'
                )}
                {renderFeedback(q, true)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 15. SOCRATIC DUAL-PERSPECTIVE MATRIX (Comparative Dialectic Columns + Synthesis)
  // ===========================================================================
  if (templateId === 'std-ws-socratic-columns') {
    return (
      <div className="rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] p-6 sm:p-8 shadow-xl space-y-6">
        <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
          {pageHead({
            title: 'text-xl sm:text-2xl font-bold text-slate-900 font-serif',
            fields: 'border-slate-300 text-slate-500',
            text: 'text-xs sm:text-sm text-slate-600 leading-relaxed',
          })}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {questions.map((q, i) => (
            <div key={q.id} className={`rounded-xl border-t-4 ${i % 2 ? 'border-indigo-700' : 'border-emerald-700'} bg-white p-5 shadow-sm space-y-2`}>
              <div className={`text-xs font-bold ${i % 2 ? 'text-indigo-700' : 'text-emerald-700'}`}>
                {qLabel(q)}. ({q.points} pts)
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-900">{promptWithStem(q, questions)}</p>
              {renderInputControl(
                q,
                selected =>
                  `text-left px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                    selected
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-emerald-600'
                  }`,
                'w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900'
              )}
              {renderFeedback(q, true)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 16. ATELIER EXECUTIVE CASE & TIMELINE (Monocle / FT Salmon Brief + Vertical Stepper)
  // ===========================================================================
  if (templateId === 'std-ws-executive-timeline') {
    return (
      <div className="rounded-2xl border border-[#E5DEC9] bg-[#FBF7F2] text-[#1E1B18] p-6 sm:p-8 shadow-xl space-y-6">
        <div className="border-b-2 border-[#1E1B18] pb-4">
          {pageHead({
            title: 'text-2xl font-bold text-[#1E1B18] font-serif',
            fields: 'border-[#1E1B18] text-[#B45309] font-mono',
            text: 'text-xs sm:text-sm text-[#3F3A34] leading-relaxed',
          })}
        </div>

        {/* Connected Vertical Stepper Spine */}
        <div className="relative pl-6 sm:pl-8 border-l-2 border-[#B45309]/50 space-y-6">
          {questions.map(q => {
            const done = Boolean((answers[q.id] || '').trim());
            return (
              <div key={q.id} className="relative bg-white border border-[#E5DEC9] rounded-xl p-5 shadow-sm space-y-3">
                <div
                  className={`absolute -left-[35px] sm:-left-[43px] top-5 w-6 h-6 rounded-full border-2 flex items-center justify-center font-mono text-[10px] font-bold ${
                    done
                      ? 'bg-[#B45309] text-white border-[#B45309]'
                      : 'bg-[#FBF7F2] text-[#B45309] border-[#B45309]'
                  }`}
                >
                  {qLabel(q)}
                </div>
                <div className="flex items-center justify-end text-xs">
                  <span className="font-mono text-stone-500">{q.points} pts</span>
                </div>
                <p className="text-sm font-bold text-[#1E1B18]">{promptWithStem(q, questions)}</p>
                {renderInputControl(
                  q,
                  selected =>
                    `text-left px-3.5 py-2 rounded-lg border text-xs font-semibold transition ${
                      selected
                        ? 'bg-[#B45309] text-white border-[#B45309]'
                        : 'bg-[#FBF7F2] text-[#1E1B18] border-[#D6CEBF] hover:border-[#B45309]'
                    }`,
                  'w-full bg-[#FBF7F2] border border-[#D6CEBF] rounded-lg p-3 text-xs text-[#1E1B18]'
                )}
                {renderFeedback(q, true)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 17. NORDIC CLARITY MODERN ASSESSMENT (Snow-White Scandinavian + Keycap Badges)
  // ===========================================================================
  if (templateId === 'std-tq-nordic-clarity') {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] bg-white text-[#0F172A] p-6 sm:p-8 shadow-xl space-y-6">
        {/* Segmented Progress Pill Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          {pageHead({
            wrap: 'space-y-3 flex-1 min-w-[240px]',
            title: 'text-xl sm:text-2xl font-extrabold text-slate-900',
            fields: 'border-slate-300 text-slate-500',
            text: 'text-xs sm:text-sm text-slate-600 leading-relaxed',
          })}
          <div className="flex items-center gap-1.5">
            {questions.map(q => {
              const done = Boolean((answers[q.id] || '').trim());
              return (
                <span
                  key={q.id}
                  className={`w-8 h-2.5 rounded-full transition ${
                    done ? 'bg-[#0D9488]' : 'bg-slate-200'
                  }`}
                  title={`Question ${qLabel(q)}`}
                />
              );
            })}
          </div>
        </div>

        {/* Clean Scandinavian Question Stack */}
        <div className="space-y-4">
          {questions.map(q => (
            <div
              key={q.id}
              className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-mono text-xs font-bold">
                  {qLabel(q)}.
                </span>
                <span className="font-mono text-xs text-slate-500">{q.points} pts</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-slate-900">{promptWithStem(q, questions)}</p>
              {renderInputControl(
                q,
                selected =>
                  `text-left px-4 py-2.5 rounded-xl border text-xs font-semibold transition ${
                    selected
                      ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-[#0D9488]'
                  }`,
                'w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:border-[#0D9488] focus:outline-none'
              )}
              {renderFeedback(q, true)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 18. OXFORD COLLEGIATE HONORS PAPER (Formal Cotton-Bond Exam + Right Marks Margin)
  // ===========================================================================
  if (templateId === 'std-tq-oxford-honors') {
    return (
      <div
        className="rounded-lg border-2 border-[#1E293B] bg-[#FCFBF7] text-[#0F172A] p-6 sm:p-10 shadow-xl space-y-6"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        {/* Double-Rule Formal Examination Masthead */}
        <div className="border-b-4 border-double border-[#1E293B] pb-5">
          {pageHead({
            title: 'text-2xl sm:text-3xl font-bold text-[#0F172A] text-center',
            fields: 'border-[#1E293B] text-slate-600 font-mono',
            text: 'text-xs sm:text-sm text-slate-700 leading-relaxed',
          })}
        </div>

        {/* Numbered Exam Questions with Right-Hand [Marks] Column */}
        <div className="divide-y divide-[#D6D2C4]">
          {questions.map(q => (
            <div key={q.id} className="py-5 grid lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-10 space-y-3">
                <p className="text-sm sm:text-base font-bold text-[#0F172A]">
                  <span className="font-mono text-[#1E3A8A] mr-2">{qLabel(q)}.</span>
                  {promptWithStem(q, questions)}
                </p>
                <div className="font-sans">
                  {renderInputControl(
                    q,
                    selected =>
                      `text-left px-3.5 py-2 border text-xs font-semibold transition ${
                        selected
                          ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                          : 'bg-white text-slate-900 border-[#CBD5E1] hover:border-[#1E3A8A]'
                      }`,
                    'w-full bg-white border border-[#CBD5E1] p-3 text-xs text-slate-900'
                  )}
                  {renderFeedback(q, true)}
                </div>
              </div>
              <div className="lg:col-span-2 lg:text-right font-mono">
                <span className="inline-block px-2.5 py-1 rounded border border-[#1E293B] bg-[#F4F1EA] text-xs font-bold text-[#1E293B]">
                  [{q.points}]
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 19. CONTEMPORARY GLASS FOCUS CAROUSEL (Frosted Acrylic Single-Card Slide Stage)
  // ===========================================================================
  if (templateId === 'std-tq-glass-focus') {
    const safeIdx = Math.min(spotlightIdx, Math.max(0, questions.length - 1));
    const activeQ = questions[safeIdx];
    return (
      <div
        className="rounded-3xl border border-indigo-200 p-6 sm:p-8 shadow-xl space-y-6 text-[#1E1B4B]"
        style={{
          background:
            'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 52%, #F0FDFA 100%)',
        }}
      >
        {/* Top Segmented Pill Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {pageHead({
            wrap: 'space-y-3 flex-1 min-w-[240px]',
            title: 'text-lg sm:text-xl font-black text-indigo-950',
            fields: 'border-indigo-300 text-indigo-700/80',
            text: 'text-xs sm:text-sm text-slate-700 leading-relaxed',
          })}
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q, idx) => {
              const done = Boolean((answers[q.id] || '').trim());
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSpotlightIdx(idx)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                    idx === safeIdx
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                      : done
                      ? 'bg-white text-indigo-700 border-indigo-300'
                      : 'bg-white/60 text-slate-600 border-white'
                  }`}
                >
                  {done ? '✓ ' : ''}{qLabel(q)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Frosted Acrylic Center Card */}
        {activeQ && (
          <div className="rounded-3xl bg-white/85 backdrop-blur-md border border-white shadow-lg p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-600">
              <span>{qLabel(activeQ)}.</span>
              <span>{activeQ.points} pts</span>
            </div>
            <p className="text-base sm:text-lg font-extrabold text-slate-900">{promptWithStem(activeQ, questions)}</p>
            {renderInputControl(
              activeQ,
              selected =>
                `text-left px-4 py-3 rounded-2xl border text-xs font-bold transition ${
                  selected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-white text-slate-800 border-indigo-100 hover:border-indigo-400'
                }`,
              'w-full bg-white border border-indigo-200 rounded-2xl p-3.5 text-xs text-slate-900'
            )}
            {renderFeedback(activeQ, true)}

            <div className="flex items-center justify-between pt-3 border-t border-indigo-100">
              <button
                type="button"
                onClick={() => setSpotlightIdx((safeIdx - 1 + questions.length) % questions.length)}
                className="px-4 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => setSpotlightIdx((safeIdx + 1) % questions.length)}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 20. STRIPE MASTERY & CONFIDENCE MATRIX (Prompt + 3-Tier Confidence Calibration)
  // ===========================================================================
  if (templateId === 'std-tq-mastery-rubric') {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          {pageHead({
            wrap: 'space-y-3 w-full',
            title: 'text-xl sm:text-2xl font-black text-slate-900',
            fields: 'border-slate-300 text-slate-500 font-mono',
            text: 'text-xs sm:text-sm text-slate-600 leading-relaxed',
          })}
        </div>

        <div className="space-y-4">
          {questions.map(q => {
            return (
              <div
                key={q.id}
                className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 font-mono text-xs text-violet-700 font-bold">
                    <span>{qLabel(q)}.</span>
                    <span>· {q.points} pts</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{promptWithStem(q, questions)}</p>
                  {renderInputControl(
                    q,
                    selected =>
                      `text-left px-3.5 py-2 rounded-xl border text-xs font-semibold transition ${
                        selected
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                          : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-violet-400'
                      }`,
                    'w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900'
                  )}
                  {renderFeedback(q, true)}
                </div>

              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 10. ZENITH BREATHING SANCTUARY (Warm Dawn Alabaster Canvas + Breathing Pacer)
  // ===========================================================================
  return (
    <div
      className="rounded-[36px] border-2 border-violet-300 p-6 sm:p-10 shadow-2xl space-y-6"
      style={{
        background: 'linear-gradient(160deg, #FBF9FF 0%, #F1ECFA 52%, #FDF6F0 100%)',
        color: '#231D35',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-violet-200 pb-5">
        {pageHead({
          wrap: 'space-y-3 w-full',
          title: 'text-xl sm:text-2xl font-black text-[#231D35]',
          fields: 'border-violet-300 text-[#6E638A]',
          text: 'text-xs sm:text-sm text-[#544B6E] leading-relaxed',
        })}
      </div>

      <div className="max-w-3xl mx-auto space-y-4">
        {questions.map(q => (
          <div
            key={q.id}
            className="rounded-[26px] bg-white/90 border border-violet-200 p-5 shadow-sm space-y-3"
          >
            <div className="flex justify-between text-xs font-bold text-violet-700">
              <span>{qLabel(q)}.</span>
              <span>{q.points} pts</span>
            </div>
            <p className="text-sm font-bold text-[#231D35] leading-relaxed">{promptWithStem(q, questions)}</p>
            {renderInputControl(
              q,
              selected =>
                `w-full text-left px-4 py-2.5 rounded-2xl border text-xs font-semibold transition ${
                  selected
                    ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold border-violet-700 shadow'
                    : 'bg-[#F8F6FC] text-[#2E2742] border-violet-200 hover:bg-violet-50'
                }`,
              'w-full bg-[#F8F6FC] border border-violet-300 rounded-2xl p-3 text-xs text-[#231D35]'
            )}
            {renderFeedback(q, true)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LivingTemplateBespokeRenderer;
