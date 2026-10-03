import React, { useEffect, useState } from 'react';
import { loadBank } from '../../../data/practice';
import { FLAGGED } from '../../../data/practice/verificationData';
import type { Question } from '../../../data/practice/types';

/**
 * "Check your thinking": one question from the lesson's own verified practice bank, asked right after the reading, with
 * instant feedback and the bank's explanation. Withheld (flagged) questions are never shown. Nothing is scored or stored;
 * it is a pause to test the idea, not a grade. Renders nothing when the lesson has no eligible question.
 */
const LessonCheck: React.FC<{ lessonId: string }> = ({ lessonId }) => {
  const [q, setQ] = useState<Question | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => {
    let alive = true; setQ(null); setPick(null);
    const bankId = lessonId.split('.')[0];
    loadBank(bankId).then(b => {
      if (!alive || !b) return;
      const ok = b.questions.filter(x => x.lessonId === lessonId && !FLAGGED[x.id] && (x.kind === 'tf' || (x.choices && x.choices.length >= 2)));
      setQ(ok.find(x => x.kind === 'mcq') || ok[0] || null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [lessonId]);
  if (!q) return null;
  const choices = q.kind === 'tf' ? ['True', 'False'] : q.choices!;
  const done = pick !== null, right = pick === q.answer;
  return (
    <section className="fcheck folio-controls" aria-label="Check your thinking">
      <div className="fl">Check your thinking</div>
      <p className="fcq">{q.prompt}</p>
      <div role="group" aria-label="Answers" className="fca">
        {choices.map((c, i) => {
          const state = !done ? '' : i === q.answer ? ' ok' : i === pick ? ' no' : '';
          return <button key={i} type="button" disabled={done && i !== pick && i !== q.answer} aria-pressed={pick === i} className={`fcc${state}`} onClick={() => !done && setPick(i)}>{c}</button>;
        })}
      </div>
      <div aria-live="polite" className="fcx">
        {done && <><b>{right ? 'Yes.' : 'Not quite.'}</b> {q.explanation}{' '}<button type="button" className="fcr" onClick={() => setPick(null)}>Try again</button></>}
        {!done && q.hint && <span style={{ opacity: .7 }}>Hint: {q.hint}</span>}
      </div>
    </section>
  );
};
export default LessonCheck;
