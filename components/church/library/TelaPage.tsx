// A lesson-library item drawn as the Tela page students work on: paper, title, reading blocks, numbered
// questions with their answer space. `size="thumb"` is the card preview (a scaled-down page), `"full"` the
// readable page in the preview panel. The answer key never renders here.
import React, { useEffect, useRef, useState } from 'react';
import type { IngestedCurriculumUnit, LessonLibraryCategory } from '../../../services/curriculumIngestionService';

export const KIND_META: Record<LessonLibraryCategory, { label: string; color: string }> = {
  ASSIGNMENT: { label: 'Assignment', color: '#06D6A0' },
  QUIZ_EXAM: { label: 'Quiz / exam', color: '#B983FF' },
  COURSE_RESOURCE: { label: 'Resource', color: '#00DAF3' },
  SYLLABUS: { label: 'Syllabus', color: '#FF8C00' },
  MASTER_SOURCE_DOC: { label: 'Source doc', color: '#FF8C00' },
  ANSWER_KEY: { label: 'Answer key', color: '#FF5470' },
};

export const kindOf = (u: IngestedCurriculumUnit): LessonLibraryCategory =>
  u.libraryCategory || (u.kind === 'QUIZ' || u.kind === 'TEST' ? 'QUIZ_EXAM' : 'ASSIGNMENT');

/** Rendered once by whoever shows pages (the Lesson Library). */
export const TELA_PAGE_CSS = `
.tp{background:#fbf8f1;color:#221c2b;border-radius:6px;box-shadow:0 1px 0 rgba(0,0,0,.06),0 10px 28px rgba(0,0,0,.35);font-family:"Inter",system-ui,sans-serif;position:relative;overflow:hidden}
.tp .tp-band{height:6px}
.tp .tp-in{padding:26px 30px 30px}
.tp h1{font:800 22px/1.2 "Outfit","Inter",system-ui,sans-serif;margin:0 0 4px;color:#1a1423;text-wrap:balance}
.tp .tp-sub{font-size:12.5px;color:#6d6478;margin-bottom:14px}
.tp .tp-meta{display:flex;gap:14px;font:600 10.5px/1 "JetBrains Mono",ui-monospace,monospace;color:#8a8194;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e6dfd2;padding-bottom:10px;margin-bottom:14px}
.tp .tp-name{display:flex;gap:10px;font-size:11px;color:#8a8194;margin-bottom:16px}
.tp .tp-name span{flex:1;border-bottom:1px solid #cfc6b8;padding-bottom:2px}
.tp h2{font:800 15px/1.3 "Outfit","Inter",system-ui,sans-serif;margin:14px 0 6px;color:#1a1423}
.tp p{font-size:13px;line-height:1.55;margin:0 0 8px;color:#3a3245}
.tp blockquote{margin:6px 0 10px;padding:8px 12px;border-left:3px solid #D40055;background:#f3ede2;font-style:italic;font-size:12.5px;color:#4a4055}
.tp .tp-call{margin:6px 0 10px;padding:8px 12px;border-radius:8px;background:#efe9fb;font-size:12.5px;color:#43306b}
.tp .tp-q{margin:0 0 14px;break-inside:avoid}
.tp .tp-qh{display:flex;gap:8px;font-size:13px;font-weight:600;color:#221c2b}
.tp .tp-qn{flex-shrink:0;width:22px;height:22px;border-radius:99px;display:grid;place-items:center;font:800 11px/1 "Outfit",system-ui,sans-serif;color:#fff}
.tp .tp-pts{margin-left:auto;flex-shrink:0;font:600 10.5px/22px "JetBrains Mono",ui-monospace,monospace;color:#8a8194}
.tp .tp-opts{display:grid;gap:4px;margin:6px 0 0 30px}
.tp .tp-opt{display:flex;gap:8px;align-items:center;font-size:12.5px;color:#3a3245}
.tp .tp-opt i{width:12px;height:12px;border:1.5px solid #a99fb5;border-radius:99px;flex-shrink:0}
.tp .tp-lines{margin:8px 0 0 30px;display:grid;gap:14px}
.tp .tp-lines i{display:block;border-bottom:1px solid #d6cdbf;height:1px}
.tp .tp-more{font-size:12px;color:#8a8194;text-align:center;margin-top:6px}
.tp-thumb{position:relative;aspect-ratio:8.5/10;overflow:hidden;border-radius:6px;background:#fbf8f1}
.tp-thumb .tp{box-shadow:none;border-radius:0}
.tp-thumb{box-shadow:0 1px 0 rgba(0,0,0,.06),0 10px 28px rgba(0,0,0,.35)}
.tp-thumb .tp{position:absolute;top:0;left:0;width:510px;transform-origin:top left;pointer-events:none}
.tp-thumb::after{content:"";position:absolute;left:0;right:0;bottom:0;height:34%;background:linear-gradient(transparent,rgba(251,248,241,.96));border-radius:0 0 6px 6px}
`;

const LINES: Record<string, number> = { 'short-answer': 2, essay: 4, 'scripture-reflection': 3, numeric: 1 };

/** Card thumbnails draw the real 510px page and scale it to the card's width. */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.45);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setScale(Math.max(0.2, e.contentRect.width / 510)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, scale };
}

export default function TelaPage({ unit, size = 'full', maxQuestions }: {
  unit: IngestedCurriculumUnit;
  size?: 'thumb' | 'full';
  maxQuestions?: number;
}) {
  const fit = useFitScale();
  const scale = fit.scale;
  const color = KIND_META[kindOf(unit)]?.color || '#D40055';
  const thumb = size === 'thumb';
  const blocks = unit.lessonBlocks.filter(b => b.kind !== 'h1').slice(0, thumb ? 2 : 40);
  const qMax = maxQuestions ?? (thumb ? 3 : unit.questions.length);
  const qs = unit.questions.slice(0, qMax);
  const page = (
    <div className="tp" style={thumb ? { transform: `scale(${scale})` } : undefined} aria-hidden={thumb || undefined}>
      <div className="tp-band" style={{ background: `linear-gradient(90deg, ${color}, #D40055)` }} />
      {/* Thumbnails leave ~46 card-pixels clear at the top for the select box and kind badge. */}
      <div className="tp-in" style={thumb ? { paddingTop: Math.round(46 / scale) } : undefined}>
        <h1>{unit.title}</h1>
        {unit.subtitle && <div className="tp-sub">{unit.subtitle}</div>}
        <div className="tp-meta">
          <span>{KIND_META[kindOf(unit)]?.label}</span>
          {unit.questions.length > 0 && <span>{unit.questions.length} questions</span>}
          {unit.totalPoints > 0 && <span>{unit.totalPoints} pts</span>}
        </div>
        {unit.questions.length > 0 && (
          <div className="tp-name"><span>Name</span><span>Date</span></div>
        )}
        {blocks.map(b =>
          b.kind === 'h2' ? <h2 key={b.id}>{b.text}</h2>
          : b.kind === 'quote' ? <blockquote key={b.id}>{b.text}{b.scripturePassage ? ` — ${b.scripturePassage}` : ''}</blockquote>
          : b.kind === 'callout' || b.kind === 'check' ? <div key={b.id} className="tp-call">{b.text}</div>
          : <p key={b.id}>{b.text}</p>
        )}
        {qs.map(q => (
          <div key={q.id} className="tp-q">
            <div className="tp-qh">
              <span className="tp-qn" style={{ background: color }}>{q.number}</span>
              <span>{q.prompt}</span>
              {q.points > 0 && <span className="tp-pts">{q.points} pt{q.points === 1 ? '' : 's'}</span>}
            </div>
            {q.options?.length ? (
              <div className="tp-opts">{q.options.map((o, i) => <div key={i} className="tp-opt"><i />{o}</div>)}</div>
            ) : q.type === 'true-false' ? (
              <div className="tp-opts"><div className="tp-opt"><i />True</div><div className="tp-opt"><i />False</div></div>
            ) : (
              <div className="tp-lines">{Array.from({ length: LINES[q.type] || 2 }, (_, i) => <i key={i} />)}</div>
            )}
          </div>
        ))}
        {!thumb && unit.questions.length > qs.length && <div className="tp-more">+ {unit.questions.length - qs.length} more questions</div>}
        {!blocks.length && !qs.length && <p style={{ color: '#8a8194' }}>This item has no page content yet. Open the original to see the file.</p>}
      </div>
    </div>
  );
  return thumb ? <div className="tp-thumb" ref={fit.ref}>{page}</div> : page;
}
