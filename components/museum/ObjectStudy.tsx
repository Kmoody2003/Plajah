import React, { useEffect, useState } from 'react';
import { searchMuseums, SOURCE_LABEL, type MuseumObject } from '../../services/museum';
import { studyQueriesFor, STUDY_STEPS } from '../../data/museumStudyMap';
import { callGemini } from '../../services/geminiService';

/**
 * "Study this object": pick a real work from the open museum collections for a topic, then work
 * through the five-move looking protocol. Responses stay in the learner's browser (localStorage)
 * unless the host passes onSave. `educationSafe` keeps the fail-closed K-12 filter on.
 */
const storeKey = (id: string) => `objstudy:${id}`;

const ObjectStudy: React.FC<{ topic: string; educationSafe?: boolean; onSave?: (o: MuseumObject, answers: Record<string, string>) => void }> = ({ topic, educationSafe = true, onSave }) => {
  const [objs, setObjs] = useState<MuseumObject[] | null>(null);
  const [cur, setCur] = useState<MuseumObject | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [coach, setCoach] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setObjs(null); setCur(null);
    (async () => {
      const { queries, region } = studyQueriesFor(topic);
      const lists = await Promise.all(queries.slice(0, 3).map(q => searchMuseums(q, { limit: 6, educationSafe, region })));
      const seen = new Set<string>();
      const all = lists.flat().filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true)));
      if (live) { setObjs(all); setCur(all[0] ?? null); }
    })();
    return () => { live = false; };
  }, [topic, educationSafe]);

  useEffect(() => {
    if (!cur) return;
    try { setAnswers(JSON.parse(localStorage.getItem(storeKey(cur.id)) || '{}')); } catch { setAnswers({}); }
    setCoach('');
  }, [cur?.id]);

  const set = (id: string, v: string) => {
    const next = { ...answers, [id]: v }; setAnswers(next);
    if (cur) try { localStorage.setItem(storeKey(cur.id), JSON.stringify(next)); } catch { /* private mode */ }
  };

  const askCoach = async () => {
    if (!cur || busy) return; setBusy(true);
    try {
      const notes = STUDY_STEPS.map(s => `${s.title}: ${answers[s.id] || '(blank)'}`).join('\n');
      const text = await callGemini(`You are a museum educator. A student is studying "${cur.title}" (${cur.culture}${cur.date ? `, ${cur.date}` : ''}; ${cur.medium}; ${cur.source}). Their notes:\n${notes}\n\nIn under 90 words: name one thing they saw well, ask one open question that pushes their looking further, and do NOT state facts about the object that are not in the catalogue line above.`);
      setCoach(String(text || '').trim());
    } catch { setCoach('The coach is unavailable right now — try again in a moment.'); }
    setBusy(false);
  };

  if (objs === null) return <p role="status">Searching the world's collections for “{topic}”…</p>;
  if (!cur) return <p>No open-access objects found for “{topic}” yet.</p>;
  return (
    <section aria-label={`Study an object: ${topic}`} style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {objs.map(o => (
          <button key={o.id} onClick={() => setCur(o)} aria-pressed={o.id === cur.id} aria-label={o.title}
            style={{ flex: '0 0 auto', padding: 0, border: o.id === cur.id ? '2px solid currentColor' : '2px solid transparent', borderRadius: 6, background: 'none' }}>
            <img src={o.thumbUrl} alt="" loading="lazy" style={{ height: 72, width: 72, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
          </button>
        ))}
      </div>
      <figure style={{ margin: 0 }}>
        <img src={cur.imageUrl || cur.thumbUrl} alt={`${cur.title}${cur.culture ? `, ${cur.culture}` : ''}`} style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }} />
        <figcaption style={{ fontSize: 13, opacity: 0.8 }}>
          <strong>{cur.title}</strong> — {cur.culture}{cur.date ? `, ${cur.date}` : ''}{cur.medium ? `. ${cur.medium}` : ''}. <a href={cur.sourceUrl} target="_blank" rel="noreferrer">View at {SOURCE_LABEL[cur.source] ?? cur.source}</a>
        </figcaption>
      </figure>
      {STUDY_STEPS.map((s, i) => (
        <label key={s.id} style={{ display: 'grid', gap: 4 }}>
          <span><strong>{i + 1}. {s.title}</strong> — {s.prompt}</span>
          <textarea rows={3} value={answers[s.id] || ''} onChange={e => set(s.id, e.target.value)} />
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={askCoach} disabled={busy}>{busy ? 'Thinking…' : 'Ask the coach'}</button>
        {onSave && <button onClick={() => onSave(cur, answers)}>Save to portfolio</button>}
      </div>
      {coach && <p role="status" style={{ fontStyle: 'italic' }}>{coach}</p>}
    </section>
  );
};

export default ObjectStudy;
