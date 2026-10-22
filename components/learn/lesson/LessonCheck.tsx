import React, { useEffect, useState } from 'react';
import { loadBank } from '../../../data/practice';
import { FLAGGED } from '../../../data/practice/verificationData';
import type { Question } from '../../../data/practice/types';
import { useActiveSupports } from '../../../hooks/useLearningSupport';
import { canReadAloud, readPassages, stopReading, useReading } from '../../../services/readAloud';

/**
 * "Check your thinking": one question from the lesson's own verified practice bank, asked right after the reading, with
 * instant feedback and the bank's explanation. Withheld (flagged) questions are never shown. Nothing is scored or stored;
 * it is a pause to test the idea, not a grade. Renders nothing when the lesson has no eligible question.
 * Learning supports: Listen reads the question and answers (automatically under "read questions aloud"), and
 * "fewer choices" removes one wrong answer from multiple choice.
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
  const sup = useActiveSupports();
  const key = `check:${lessonId}`;
  const reading = useReading(key);
  // Original indices of the answers shown; under "fewer choices" one wrong answer (stable per question) is dropped.
  const shown = React.useMemo(() => {
    if (!q) return [] as number[];
    const all = (q.kind === 'tf' ? ['True', 'False'] : q.choices!).map((_, i) => i);
    if (!sup.fewerChoices || all.length < 3) return all;
    const wrong = all.filter(i => i !== q.answer);
    const drop = wrong[(q.id || '').length % wrong.length];
    return all.filter(i => i !== drop);
  }, [q, sup.fewerChoices]);
  const labels = q ? (q.kind === 'tf' ? ['True', 'False'] : q.choices!) : [];
  const say = () => q && void readPassages(key, [q.prompt, ...shown.map((i, n) => `${String.fromCharCode(65 + n)}. ${labels[i]}`)], { rate: sup.readRate });
  useEffect(() => { if (q && sup.readQuestions && canReadAloud()) say(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q?.id, sup.readQuestions]);
  useEffect(() => () => stopReading(), [lessonId]);
  if (!q) return null;
  const done = pick !== null, right = pick === q.answer;
  return (
    <section className="fcheck folio-controls" aria-label="Check your thinking">
      <div className="fl">Check your thinking{canReadAloud() && <button type="button" className="fcr" aria-pressed={reading >= 0} onClick={() => (reading >= 0 ? stopReading() : say())}>{reading >= 0 ? 'Stop' : 'Listen'}</button>}</div>
      <p className={`fcq${reading === 0 ? ' freading' : ''}`}>{q.prompt}</p>
      <div role="group" aria-label="Answers" className="fca">
        {shown.map((i, n) => {
          const state = !done ? '' : i === q.answer ? ' ok' : i === pick ? ' no' : '';
          return <button key={i} type="button" disabled={done && i !== pick && i !== q.answer} aria-pressed={pick === i} className={`fcc${state}${reading === n + 1 ? ' freading' : ''}`} onClick={() => !done && setPick(i)}>{labels[i]}</button>;
        })}
      </div>
      <div aria-live="polite" className="fcx">
        {done && <><b>{right ? 'Yes.' : sup.retryFree ? 'Not yet, and that is fine.' : 'Not quite.'}</b> {q.explanation}{' '}<button type="button" className="fcr" onClick={() => setPick(null)}>Try again</button></>}
        {!done && q.hint && <span style={{ opacity: .7 }}>Hint: {q.hint}</span>}
      </div>
    </section>
  );
};
export default LessonCheck;
