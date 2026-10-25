/**
 * MuseumStudy — "Study this object". Resolves a lesson's museum refs through the shared museum
 * layer and shows the real objects with the question to bring to each. Fail-closed for minors:
 * figure refs are withheld and everything else is education-safe filtered (see audience.ts).
 */
import React, { useEffect, useState } from 'react';
import { ExternalLink, Landmark, Box, Lock } from 'lucide-react';
import { resolveStudy, type StudyQuery, type StudyResult } from '../../services/artCollege/studyObjects';
import type { ArtAudience } from '../../services/artCollege/audience';

const SOURCE_NAME: Record<string, string> = {
  met: 'The Met', artic: 'Art Institute of Chicago', cleveland: 'Cleveland Museum of Art', smithsonian: 'Smithsonian',
  europeana: 'Europeana', opencontext: 'Open Context', commons: 'Wikimedia Commons', loc: 'Library of Congress', harvard: 'Harvard Art Museums',
};

const RefCard: React.FC<{ r: StudyQuery; audience: ArtAudience; accent: string }> = ({ r, audience, accent }) => {
  const [res, setRes] = useState<StudyResult | null>(null);
  useEffect(() => {
    let live = true;
    setRes(null);
    resolveStudy(r, audience, 6).then(x => live && setRes(x)).catch(() => live && setRes({ objects: [], withheld: false }));
    return () => { live = false; };
  }, [r.query, r.sources?.join(','), r.figure, r.threeD, audience]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="museum-ref">
      <p className="text-[13px] text-white/80 leading-relaxed">{r.why}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-white/35 mt-1.5">Search: {r.query}</p>
      {res === null && <p className="text-[12px] text-white/40 mt-3">Opening the collections…</p>}
      {res?.withheld && (
        <p className="text-[12px] text-white/50 mt-3 flex items-center gap-2"><Lock size={13} /> Figure studies are for verified adult learners. Use the alternative studio brief.</p>
      )}
      {res && !res.withheld && !res.objects.length && (
        <p className="text-[12px] text-white/45 mt-3">
          {audience === 'adult' ? 'No open-access objects matched right now.' : 'No education-safe objects matched this search.'}
        </p>
      )}
      {res && res.objects.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {res.objects.map(o => (
            <a key={o.id} href={o.sourceUrl} target="_blank" rel="noreferrer"
              className="group rounded-xl overflow-hidden border border-white/10 bg-black/30 hover:border-white/30 transition-colors">
              <div className="aspect-square bg-black/40 overflow-hidden">
                {o.thumbUrl ? <img src={o.thumbUrl} alt={o.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" /> : null}
              </div>
              <div className="p-2">
                <p className="text-[11px] font-bold text-white/85 leading-snug line-clamp-2">{o.title}</p>
                <p className="text-[10px] text-white/45 mt-0.5 line-clamp-1">{[o.culture, o.date].filter(Boolean).join(' · ')}</p>
                <p className="text-[9px] uppercase tracking-widest mt-1 flex items-center gap-1" style={{ color: accent }}>
                  {o.model3dUrl ? <Box size={10} /> : <ExternalLink size={9} />} {SOURCE_NAME[o.source] ?? o.source}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const MuseumStudy: React.FC<{ refs: StudyQuery[]; audience: ArtAudience; accent: string }> = ({ refs, audience, accent }) => {
  if (!refs.length) return null;
  return (
    <section className="mt-8">
      <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-3 flex items-center gap-2" style={{ color: accent }}>
        <Landmark size={12} /> Study this object — from real museum collections
      </p>
      <div className="space-y-3">
        {refs.map((r, i) => <RefCard key={`${r.query}-${i}`} r={r} audience={audience} accent={accent} />)}
      </div>
    </section>
  );
};

export default MuseumStudy;
