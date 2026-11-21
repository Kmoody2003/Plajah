// A Themed Show inside a social post (post.assetEmbed.type === 'THEMED_SHOW').
//
// Feed-fast: only the cover image and title are drawn until the viewer taps play. Then the player
// (and the show runtime with its three.js renderers) loads, plays the timeline, and the viewer can
// switch to the interactive live show. Nothing is rendered to video: the post stores just the ref.

import React, { Suspense, lazy, useState } from 'react';
import { Play, ExternalLink, Loader2, Images } from 'lucide-react';
import { Button } from '../../ui';
import { showRefFromEmbed } from '../../../services/slideshow/showPosts';
import { showLink } from '../../../services/slideshow/cloudShows';
import type { ShowPlayMode } from './ShowPlayer';

const ShowPlayer = lazy(() => import('./ShowPlayer'));

export interface ShowPostCardProps {
  embed: { id?: string; owner?: string; title?: string; imageUrl?: string };
  /** Start on this mode when played (default timeline). */
  mode?: ShowPlayMode;
}

export default function ShowPostCard({ embed, mode = 'timeline' }: ShowPostCardProps) {
  const ref = showRefFromEmbed(embed);
  const [playing, setPlaying] = useState(false);
  if (!ref) return null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="mt-3 flex flex-col gap-2" onClick={stop} onPointerDown={stop} data-show-post={`${ref.owner}/${ref.id}`}>
      {playing ? (
        <Suspense fallback={<div className="w-full aspect-video rounded-card bg-black flex items-center justify-center gap-2 type-body-md"><Loader2 className="animate-spin" size={18} /> Loading the player…</div>}>
          <ShowPlayer showRef={ref} mode={mode} autoPlay allowModeSwitch controls="full" />
        </Suspense>
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`Play the show ${ref.title || ''}`}
          className="group relative w-full aspect-video rounded-card overflow-hidden bg-black ring-1 ring-[var(--m3-border)] text-left">
          {ref.cover
            ? <img src={ref.cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
            : <span className="absolute inset-0 flex items-center justify-center"><Images size={40} style={{ color: 'var(--on-surface-variant)' }} /></span>}
          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="pj-btn pj-btn--accent pj-btn--xl pj-btn--icon shadow-[var(--pj-glow-orange)] group-hover:scale-105 transition-transform"><Play size={28} /></span>
          </span>
          <span className="absolute left-3 right-3 bottom-2.5 flex flex-col gap-0.5">
            <span className="pj-eyebrow">Themed Show</span>
            <span className="type-title-md text-white truncate">{ref.title || 'Photo show'}</span>
          </span>
        </button>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="type-body-sm flex-1" style={{ color: 'var(--on-surface-variant)' }}>
          {playing ? 'Switch to Interactive to tap any photo.' : 'Plays here as a timeline, or interactively.'}
        </span>
        <Button as="a" href={showLink(ref)} target="_blank" rel="noopener" size="xs" variant="ghost" icon={<ExternalLink />}>Open</Button>
      </div>
    </div>
  );
}
