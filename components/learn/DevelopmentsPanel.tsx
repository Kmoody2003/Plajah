import React, { useState } from 'react';
import { Radar, ExternalLink, AlertTriangle } from 'lucide-react';
import type { Impact } from '../../services/livingKnowledge/types';

/**
 * "Recent developments" for a lesson or a course. These are links to the original source (a court
 * opinion, a PubMed record, an agency notice) that the living-knowledge job matched to what the
 * lesson teaches. Plajah does not summarise them: it shows the source's own title and says plainly
 * when something could change the lesson. Nothing here is advice.
 */
const DevelopmentsPanel: React.FC<{ rows: Impact[]; domain: 'law' | 'medicine'; accent: string; compact?: boolean }> = ({ rows, domain, accent, compact }) => {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const review = rows.filter(r => r.severity === 'review');
  const shown = (all ? rows : [...review, ...rows.filter(r => r.severity !== 'review')].slice(0, compact ? 3 : 5));
  const noun = domain === 'law' ? 'rulings and legal developments' : 'research and clinical updates';
  return (
    <section aria-label="Recent developments" className="rounded-2xl border p-4 my-5" style={{ borderColor: review.length ? '#f59e0b66' : `${accent}44`, background: review.length ? '#f59e0b0f' : `${accent}0d` }}>
      <p className="text-[11px] font-black uppercase tracking-[0.2em] inline-flex items-center gap-1.5" style={{ color: review.length ? '#fbbf24' : accent }}>
        {review.length ? <AlertTriangle size={13} /> : <Radar size={13} />} {review.length ? 'This may be out of date' : 'Recent developments'}
      </p>
      <p className="text-[12px] text-white/60 mt-1 mb-3">
        {review.length
          ? `New ${noun} may change what is taught here. We have flagged it for review. Read the source before relying on the lesson.`
          : `Newer ${noun} that connect to this topic. These are links to the original source, not Plajah's summary.`}
      </p>
      <ul className="grid gap-2">
        {shown.map(r => (
          <li key={r.id}>
            <a href={r.itemUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-black/25 hover:bg-white/10 px-3 py-2 transition-colors">
              <span className="block text-[13px] font-bold leading-snug text-white/90">{r.itemTitle} <ExternalLink size={11} className="inline -mt-0.5 text-white/40" /></span>
              <span className="block text-[11px] text-white/50 mt-0.5">{r.itemDate}{r.severity === 'review' ? ' · needs review' : ''} · {r.reason}</span>
            </a>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && <button type="button" onClick={() => setAll(true)} className="mt-2 text-[12px] font-black underline underline-offset-2 text-white/70">Show all {rows.length}</button>}
    </section>
  );
};

export default DevelopmentsPanel;
