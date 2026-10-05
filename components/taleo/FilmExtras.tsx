import React, { useEffect, useMemo, useState } from 'react';
import { Film, Sparkles } from 'lucide-react';
import type { Album, Video } from '../../types';
import { fetchAllPublicAlbums, fetchAllVideos } from '../../services/backendService';
import { fetchStoryReport, type TaleoAnalysisJob, type StoryReport } from '../../services/storyIntelService';
import HoverPreviewThumb, { previewSourceFor } from '../HoverPreviewThumb';
import ContentStatusBadge from '../ContentStatusBadge';
import { inferStory, relatedScore, formatRuntime, type InferredStory } from './storyInference';

type Film = Video | Album;

/** Best available art for a film, in priority order. */
export const filmArt = (x: any): string | undefined =>
  x?.coverImage || x?.headerImage || x?.thumbnailUrl || x?.coverImageUrl || x?.posterUrl ||
  x?.promoKit?.tvBillboardUrl || x?.promoKit?.keyArtUrl || x?.keyArtUrl || undefined;

const isFilm = (x: any) => {
  const st = x?.subType;
  if (st === 'MOVIE' || st === 'TV_SERIES') return true;
  return x?.type === 'VIDEO' && !!x?.seasons;
};

let catalogPromise: Promise<Film[]> | null = null;
let catalogAt = 0;
function loadCatalog(): Promise<Film[]> {
  if (catalogPromise && Date.now() - catalogAt < 5 * 60_000) return catalogPromise;
  catalogAt = Date.now();
  catalogPromise = Promise.all([
    fetchAllPublicAlbums().catch(() => [] as Album[]),
    fetchAllVideos().catch(() => [] as Video[]),
  ]).then(([albums, videos]) => [
    ...albums.filter(a => a.type === 'VIDEO' && isFilm(a)),
    ...videos.filter(v => isFilm(v)),
  ] as Film[]);
  return catalogPromise;
}

/** Films similar to `item` (same world / maker / genre / tags), best first. Excludes `item`. */
export function useRelatedFilms(item: Film, limit = 12): Film[] {
  const [all, setAll] = useState<Film[]>([]);
  useEffect(() => {
    let alive = true;
    loadCatalog().then(c => { if (alive) setAll(c); }).catch(() => {});
    return () => { alive = false; };
  }, [item.id]);
  return useMemo(() => {
    const base = item as any;
    return all
      .map(c => ({ c, s: relatedScore(
        { id: base.id, genre: base.genre, tags: base.tags, worldId: base.worldId, ownerId: base.ownerId },
        { id: (c as any).id, genre: (c as any).genre, tags: (c as any).tags, worldId: (c as any).worldId, ownerId: (c as any).ownerId },
      ) }))
      .filter(x => x.s > 0 && filmArt(x.c))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(x => x.c);
  }, [all, item, limit]);
}

const Heading: React.FC<{ eyebrow: string; title: string; accent?: string; children?: React.ReactNode }> = ({ eyebrow, title, accent = '#D0BCFF', children }) => (
  <div className="flex items-end justify-between gap-3">
    <div className="pl-3 border-l-2" style={{ borderColor: accent }}>
      <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: accent }}>{eyebrow}</p>
      <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">{title}</h3>
    </div>
    {children}
  </div>
);

export const MoreLikeThis: React.FC<{ related: Film[]; onOpenItem?: (i: Film) => void }> = ({ related, onOpenItem }) => {
  if (!related.length) return null;
  return (
    <section className="mt-14 space-y-5" data-testid="more-like-this">
      <Heading eyebrow="Taleo" title="More Like This" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {related.slice(0, 8).map((c: any) => (
          <HoverPreviewThumb
            key={c.id}
            poster={filmArt(c)}
            title={c.title}
            subtitle={c.genre || (c.subType === 'TV_SERIES' ? 'Series' : 'Film')}
            preview={previewSourceFor(c)}
            accent="#D0BCFF"
            fallbackIcon={<Film size={18} className="text-white/20" />}
            onClick={() => onOpenItem?.(c)}
          />
        ))}
      </div>
    </section>
  );
};

const Chips: React.FC<{ label: string; items: string[] }> = ({ label, items }) => items.length === 0 ? null : (
  <div>
    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35 mb-2">{label}</p>
    <div className="flex flex-wrap gap-2">
      {items.map(t => <span key={t} className="px-3 py-1 rounded-full text-[11px] font-bold text-white/80 bg-white/[0.06] border border-white/10">{t}</span>)}
    </div>
  </div>
);

function fromReport(r: StoryReport): InferredStory {
  const moments = [...r.scenes].sort((a, b) => a.index - b.index);
  const acts = r.structure?.acts || [];
  return {
    summary: r.logline || r.synopsis,
    themes: (r.themes || []).slice(0, 6),
    tone: Array.from(new Set(moments.map(s => s.mood).filter(Boolean) as string[])).slice(0, 4),
    keyMoments: acts.map(a => a.turningPoint ? `${a.title}: ${a.turningPoint}` : '').filter(Boolean).slice(0, 4),
    contentNotes: [],
    facts: [
      r.characters?.length ? `${r.characters.length} characters` : '',
      r.scenes?.length ? `${r.scenes.length} scenes` : '',
      r.locations?.length ? `${r.locations.length} locations` : '',
    ].filter(Boolean),
  };
}

/** Story breakdown: stored report when readable (owner), otherwise inferred from film details. */
export const StoryBreakdown: React.FC<{ item: Film; job?: TaleoAnalysisJob | null }> = ({ item, job }) => {
  const [report, setReport] = useState<StoryReport | null>(null);
  const ready = job && (job.status === 'READY' || job.status === 'PARTIAL');
  useEffect(() => {
    let alive = true;
    setReport(null);
    if (job && ready) fetchStoryReport(job).then(r => { if (alive) setReport(r); }).catch(() => {});
    return () => { alive = false; };
  }, [job?.status, (item as any).id]); // eslint-disable-line react-hooks/exhaustive-deps

  const it: any = item;
  const inferred = useMemo(() => inferStory({
    title: it.title,
    description: it.description,
    tagline: it.movieMetadata?.tagline,
    genre: it.genre,
    tags: it.tags,
    runtimeSec: it.duration || it.durationSec || it.runtime,
    castNames: (it.movieMetadata?.castMembers || []).map((m: any) => m.actorName).filter(Boolean),
    characterNames: (it.movieMetadata?.castMembers || []).map((m: any) => m.characterName).filter(Boolean),
    credits: (it.movieMetadata?.productionCredits || []).map((c: any) => [c.name || c.person, c.role].filter(Boolean).join(', ')).filter(Boolean),
    rating: it.filmDistribution?.contentRating,
  }), [it]);

  const data = report ? fromReport(report) : inferred;
  if (!data) return null;
  const stored = !!report;

  return (
    <section className="mt-14 space-y-5" data-testid="story-breakdown">
      <Heading eyebrow="Story intelligence" title="The Story">
        {stored ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#D0BCFF]"><Sparkles size={11} /> Analysed</span>
        ) : (
          <ContentStatusBadge status="UNDER_REVIEW" />
        )}
      </Heading>
      <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5 sm:p-6 space-y-5">
        {!stored && <p className="text-[11px] text-white/40">Auto-generated from the film details, not yet reviewed.</p>}
        {data.summary && <p className="text-sm sm:text-base text-white/80 leading-relaxed">{data.summary}</p>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Chips label="Themes" items={data.themes} />
          <Chips label="Tone" items={data.tone} />
        </div>
        {data.keyMoments.length > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35 mb-2">Key moments</p>
            <ul className="space-y-2">
              {data.keyMoments.map((m, i) => (
                <li key={i} className="flex gap-3 text-sm text-white/70"><span className="text-[#D0BCFF] font-black">{i + 1}</span><span>{m}</span></li>
              ))}
            </ul>
          </div>
        )}
        <Chips label="Content notes" items={data.contentNotes} />
        {data.facts.length > 0 && <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{data.facts.join('  ·  ')}</p>}
      </div>
    </section>
  );
};

export { formatRuntime };
