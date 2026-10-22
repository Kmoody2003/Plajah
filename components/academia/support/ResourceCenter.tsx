import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, ExternalLink, Headphones, Square } from 'lucide-react';
import { RESOURCE_TOPICS, SUPPORT_RESOURCES, resourcesFor, type ResourceAudience, type ResourceTopic, type SupportResource } from '../../../data/supportResources';
import { canReadAloud, readPassages, stopReading, useReading } from '../../../services/readAloud';
import { useActiveSupports } from '../../../hooks/useLearningSupport';
import { eyebrow } from './ProfileEditors';

/** The resource center: guides for parents, teachers and learners, filterable by audience and topic, each readable aloud. */
const AUDIENCES: Array<{ id: ResourceAudience | 'all'; label: string }> = [
  { id: 'all', label: 'Everyone' }, { id: 'parent', label: 'Parents & carers' }, { id: 'teacher', label: 'Teachers' }, { id: 'learner', label: 'Learners' },
];
const topicOf = (id: ResourceTopic) => RESOURCE_TOPICS.find(t => t.id === id)!;

const Reader: React.FC<{ r: SupportResource; onBack: () => void }> = ({ r, onBack }) => {
  const sup = useActiveSupports();
  const key = `res:${r.id}`;
  const reading = useReading(key);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); return () => stopReading(); }, [r.id]);
  const passages = useMemo(() => [r.title, r.summary, ...r.sections.flatMap(s => [s.heading, ...(s.body || []), ...(s.bullets || [])])], [r]);
  let n = 1; // passage counter matching `passages` order (0 = title, 1 = summary)
  const hl = (i: number) => (reading === i ? ' bg-[#00DAF3]/12 ring-4 ring-[#00DAF3]/12 rounded' : '');
  const t = topicOf(r.topic);
  return (
    <article ref={top} className="max-w-[760px] scroll-mt-20" aria-labelledby="res-title">
      <button type="button" onClick={onBack} className="min-h-[44px] -ml-2 px-2 rounded-full text-[13px] font-bold text-white/70 hover:text-white inline-flex items-center gap-1.5"><ArrowLeft size={16} /> All resources</button>
      <p className={`${eyebrow} mt-4`} style={{ color: t.color }}>{t.label} · {r.minutes} min read</p>
      <div className="flex items-start gap-3 mt-1">
        <h2 id="res-title" className={`text-[28px] sm:text-[34px] font-black leading-tight flex-1${hl(0)}`} style={{ fontFamily: 'Outfit, system-ui' }}>{r.title}</h2>
        {canReadAloud() && (
          <button type="button" onClick={() => (reading >= 0 ? stopReading() : void readPassages(key, passages, { rate: sup.readRate }))} aria-pressed={reading >= 0}
            className={`shrink-0 mt-1 min-h-[44px] px-4 rounded-full border text-[13px] font-bold inline-flex items-center gap-2 ${reading >= 0 ? 'border-[#00DAF3] text-[#00DAF3]' : 'border-white/20 hover:bg-white/10'}`}>
            {reading >= 0 ? <><Square size={13} /> Stop</> : <><Headphones size={15} /> Listen</>}
          </button>
        )}
      </div>
      <p className={`text-[17px] text-white/75 mt-3 leading-relaxed${hl(1)}`}>{r.summary}</p>
      <div className="mt-6 grid gap-6 text-[16px] leading-[1.7] text-white/85">
        {r.sections.map((s, si) => (
          <section key={si}>
            <h3 className={`text-[19px] font-black mb-2${hl(++n)}`}>{s.heading}</h3>
            {(s.body || []).map((p, pi) => <p key={pi} className={`mb-3${hl(++n)}`}>{p}</p>)}
            {s.bullets && <ul className="grid gap-2 pl-0">{s.bullets.map((b, bi) => <li key={bi} className={`flex gap-2.5${hl(++n)}`}><span aria-hidden="true" className="mt-[0.7em] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.color }} />{b}</li>)}</ul>}
          </section>
        ))}
      </div>
      <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-label="Sources and further reading">
        <p className={`${eyebrow} text-white/60`}>Sources & further reading</p>
        <ul className="mt-2 grid gap-1.5">
          {r.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[14px] text-[#00DAF3] hover:underline inline-flex items-center gap-1.5">{s.label} <ExternalLink size={12} /></a></li>)}
        </ul>
        <p className="text-[12px] text-white/45 mt-3">General information, not legal or medical advice.</p>
      </section>
    </article>
  );
};

const ResourceCenter: React.FC<{ defaultAudience?: ResourceAudience | 'all' }> = ({ defaultAudience = 'all' }) => {
  const [aud, setAud] = useState<ResourceAudience | 'all'>(defaultAudience);
  const [topic, setTopic] = useState<ResourceTopic | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const list = resourcesFor(aud, topic);
  const r = open ? SUPPORT_RESOURCES.find(x => x.id === open) : null;
  if (r) return <Reader r={r} onBack={() => setOpen(null)} />;
  const pill = (on: boolean) => `min-h-[40px] px-3.5 rounded-full border text-[13px] font-semibold whitespace-nowrap ${on ? 'bg-white text-black border-white' : 'border-white/15 text-white/70 hover:border-white/35'}`;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="For whom">
        {AUDIENCES.map(a => <button key={a.id} type="button" aria-pressed={aud === a.id} onClick={() => setAud(a.id)} className={pill(aud === a.id)}>{a.label}</button>)}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1" role="group" aria-label="Topic">
        <button type="button" aria-pressed={topic === 'all'} onClick={() => setTopic('all')} className={pill(topic === 'all')}>All topics</button>
        {RESOURCE_TOPICS.map(t => <button key={t.id} type="button" aria-pressed={topic === t.id} onClick={() => setTopic(t.id)} className="min-h-[40px] px-3.5 rounded-full border text-[13px] font-semibold whitespace-nowrap" style={topic === t.id ? { background: t.color, color: '#0a0a0f', borderColor: t.color } : { borderColor: `${t.color}55`, color: t.color }}>{t.label}</button>)}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))' }}>
        {list.map(x => {
          const t = topicOf(x.topic);
          return (
            <button key={x.id} type="button" onClick={() => setOpen(x.id)} className="text-left rounded-3xl border bg-white/[0.03] p-5 flex flex-col gap-2 transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.05]" style={{ borderColor: `${t.color}33` }}>
              <span className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: t.color }}>{t.label}</span>
              <span className="text-[17px] font-black leading-snug">{x.title}</span>
              <span className="text-[13px] text-white/60 leading-snug flex-1">{x.summary}</span>
              <span className="text-[12px] text-white/45 inline-flex items-center gap-1.5 mt-1"><Clock size={12} /> {x.minutes} min · for {x.audience.map(a => (a === 'parent' ? 'parents' : a === 'teacher' ? 'teachers' : 'learners')).join(', ')}</span>
            </button>
          );
        })}
      </div>
      {list.length === 0 && <p className="text-[14px] text-white/50">No guides for that combination yet. Try another topic.</p>}
    </div>
  );
};
export default ResourceCenter;
