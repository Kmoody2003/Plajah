// The lesson as a live class's stage: the real document, drawn on each viewer's own device in its own
// template. It isn't video, so it stays sharp at any size, a student can read ahead and come back, and the
// teacher's place in it travels as a small message instead of a screen share.

import React, { useEffect, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import type { IngestedCurriculumUnit } from '../../services/curriculumIngestionService';
import { getDefaultLivingTemplateForUnit } from '../../services/council/livingDocumentTemplates';
import { LivingTemplateBespokeRenderer } from '../desk/LivingTemplateBespokeRenderer';
import LayoutPages from '../desk/LayoutPages';

export default function LectureLessonStage({ unit, followY, onScrollY, answers, onAnswer, note, children }: {
  unit: IngestedCurriculumUnit | null;
  /** Students: the teacher's place, 0–1 down the document. */
  followY?: number | null;
  /** Teacher: reports their place as they scroll. */
  onScrollY?: (y: number) => void;
  answers?: Record<string, string>;
  /** Present when this viewer can write: their own copy, or the class's shared one. */
  onAnswer?: (questionId: string, value: string) => void;
  /** Says whose copy this is. */
  note?: string;
  /** The teacher's camera and anyone called on, floated over the page. */
  children?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [wandered, setWandered] = useState(false);
  const leading = !!onScrollY;

  const goToTeacher = () => {
    const el = scroller.current;
    if (el && followY != null) el.scrollTop = followY * Math.max(0, el.scrollHeight - el.clientHeight);
  };
  useEffect(() => { if (!leading && !wandered && followY !== undefined) goToTeacher(); }, [followY, unit?.id, wandered]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setWandered(false); if (scroller.current) scroller.current.scrollTop = 0; }, [unit?.id]);

  const reportScroll = () => {
    const el = scroller.current;
    if (!el || !onScrollY) return;
    const room = el.scrollHeight - el.clientHeight;
    onScrollY(room > 0 ? el.scrollTop / room : 0);
  };
  // Only the reader's own hand counts as leaving the teacher: following scrolls this box too.
  const wander = () => { if (!leading && followY !== undefined) setWandered(true); };

  return (
    <div className="lh-lesson">
      {note && <p className="lh-note">{note}</p>}
      <div
        ref={scroller}
        className="lh-paper"
        tabIndex={0}
        aria-label={unit ? `Lesson: ${unit.title}` : 'Lesson'}
        onScroll={reportScroll}
        onWheel={wander}
        onTouchMove={wander}
        onKeyDown={e => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) wander(); }}
      >
        {!unit ? (
          <p className="lh-paper-wait">Getting the lesson…</p>
        ) : unit.layoutPages?.length && !unit.questions.length ? (
          <LayoutPages pages={unit.layoutPages} title={unit.title} />
        ) : (
          <LivingTemplateBespokeRenderer
            templateId={unit.livingTemplateId || getDefaultLivingTemplateForUnit(unit).id}
            unit={unit}
            answers={answers || {}}
            onUpdateAnswer={onAnswer || (() => {})}
            supplements={[]}
            readOnly={!onAnswer}
          />
        )}
      </div>
      {children && <div className="lh-pips">{children}</div>}
      {wandered && (
        <button type="button" className="lh-back" onClick={() => setWandered(false)}>
          <CornerDownLeft size={14} /> Back to the teacher’s place
        </button>
      )}
    </div>
  );
}
