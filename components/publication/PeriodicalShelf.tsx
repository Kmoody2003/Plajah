/**
 * PeriodicalShelf — newspapers and magazines published on Plajah, newest first, with the ones you
 * follow pulled to the front. Lives in Lorea's library and on the Newsstand.
 */
import React, { useEffect, useState } from 'react';
import { Newspaper, Star } from 'lucide-react';
import type { PeriodicalIssue } from '../../services/publication/types';

const PeriodicalShelf: React.FC<{ title?: string; max?: number }> = ({ title = 'Periodicals — newspapers & magazines', max = 18 }) => {
  const [issues, setIssues] = useState<PeriodicalIssue[] | null>(null);
  const [followed, setFollowed] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    import('../../services/publication/periodicalStore').then(async s => {
      const [list, f] = await Promise.all([s.listPublishedIssues(60), s.followedPublicationIds()]);
      if (!alive) return;
      setFollowed(f);
      setIssues([...list].sort((a, b) => Number(f.includes(b.publicationId)) - Number(f.includes(a.publicationId))).slice(0, max));
    }).catch(() => alive && setIssues([]));
    return () => { alive = false; };
  }, [max]);
  if (!issues || !issues.length) return null;
  return (
    <section className="my-6" data-testid="periodical-shelf">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/80"><Newspaper size={15} /> {title}</h3>
      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
        {issues.map(i => (
          <button key={i.id} onClick={() => window.dispatchEvent(new CustomEvent('plajah:openIssue', { detail: { issueId: i.id } }))}
            className="group relative w-[150px] shrink-0 text-left">
            <div className="flex aspect-[11/17] flex-col rounded-md bg-[#f6f0e3] p-2.5 text-[#1a1612] shadow-lg transition group-hover:-translate-y-1">
              <p className="text-[7px] font-bold uppercase tracking-wider text-[#8a3324]">Vol. {i.volume} · No. {i.number}</p>
              <p className="mt-1 border-b-2 border-double border-[#1a1612] pb-1 font-serif text-[15px] font-black leading-tight">{i.publicationName}</p>
              <p className="mt-2 font-serif text-[10px] font-bold leading-snug line-clamp-4">{i.coverLine || i.stories[0]?.headline || ''}</p>
              <p className="mt-auto text-[8px] text-[#6b6258]">{i.date} · {i.published?.pageCount || i.flatplan.length} pp</p>
            </div>
            {followed.includes(i.publicationId) && <Star size={12} className="absolute right-1.5 top-1.5 text-amber-500" fill="currentColor" />}
            <p className="mt-1.5 truncate text-[11px] text-white/60">{i.tier === 'student' ? 'Student press' : i.kind}</p>
          </button>
        ))}
      </div>
    </section>
  );
};

export default PeriodicalShelf;
