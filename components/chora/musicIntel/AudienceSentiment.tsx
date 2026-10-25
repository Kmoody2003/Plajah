// AudienceSentiment — what listening parties actually felt, shown to everyone who opens the liner notes
// (no party needed). Data facts + point cards, a per-song energy graph, and the best timestamped
// comments / GIFs. All of it is arithmetic over what people did in a party — see
// services/musicIntel/audience.ts. Cards that carry a moment seek the song to it.

import React, { useEffect, useState } from 'react';
import { BarChart3, Flame, Heart, MessageCircle, Play, Star, Users } from 'lucide-react';
import { fetchAudienceSentiment, type AudienceCard, type AudienceSentimentBundle } from '../../../services/musicIntelService';
import { formatMoment } from '../../../services/partyEngagement';
import { emoteById } from '../../../services/emotes/emoteLibrary';
import { EmoteGlyph } from '../../emotes/EmoteGlyph';
import PartyEnergyGraph from '../../party/PartyEnergyGraph';

export function useAudienceSentiment(albumId: string | undefined) {
  const [data, setData] = useState<AudienceSentimentBundle | null>(null);
  useEffect(() => {
    setData(null);
    if (!albumId) return;
    let alive = true;
    fetchAudienceSentiment(albumId).then(b => { if (alive) setData(b); });
    return () => { alive = false; };
  }, [albumId]);
  return data;
}

const ICON: Record<AudienceCard['kind'], React.ReactNode> = {
  fact: <Users size={13} />, point: <Star size={13} />, comment: <MessageCircle size={13} />, energy: <Flame size={13} />, poll: <BarChart3 size={13} />,
};

const Card: React.FC<{ c: AudienceCard; onPlayAt?: (trackId: string, sec?: number) => void }> = ({ c, onPlayAt }) => {
  const emote = c.emoteId ? emoteById(c.emoteId) : null;
  const seekable = !!(onPlayAt && c.trackId && typeof c.atSec === 'number');
  const Tag: any = seekable ? 'button' : 'div';
  const isQuote = c.kind === 'comment';
  return (
    <Tag
      {...(seekable ? { type: 'button', onClick: () => onPlayAt!(c.trackId!, c.atSec), 'aria-label': `${c.title}: ${c.text || 'GIF'} — play at ${formatMoment(c.atSec)}` } : {})}
      className={`text-left rounded-2xl p-4 border transition-colors ${seekable ? 'hover:bg-white/[0.07] cursor-pointer' : ''} ${isQuote ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-gradient-to-br from-[#d40055]/[0.14] to-[#ff8c00]/[0.07] border-white/12'}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FFB86B]">
        {ICON[c.kind]} <span className="truncate">{c.title}</span>
        {typeof c.atSec === 'number' && <span className="ml-auto shrink-0 inline-flex items-center gap-1 normal-case tracking-normal text-white/55 tabular-nums">{seekable && <Play size={10} />}{formatMoment(c.atSec)}</span>}
      </div>
      {c.stat && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-3xl font-black text-white tabular-nums leading-none">{c.stat}</span>
          {emote && <EmoteGlyph def={emote} size={30} animate />}
        </div>
      )}
      {c.gifUrl && <img src={c.gifUrl} alt="A listener's GIF" loading="lazy" referrerPolicy="no-referrer" className="mt-2 max-h-36 rounded-xl" />}
      {c.text && <p className={`mt-1.5 leading-relaxed ${isQuote ? 'text-white/85 text-[15px] italic' : 'text-white/72 text-[14px]'}`}>{isQuote ? `“${c.text}”` : c.text}</p>}
    </Tag>
  );
};

/** Album-level read: headline facts, the energy graph across the album, then the headline cards. */
export const AudienceSentimentAlbum: React.FC<{
  data: AudienceSentimentBundle | null;
  onPlayAt?: (trackId: string, sec?: number) => void;
  currentTrackId?: string;
}> = ({ data, onPlayAt, currentTrackId }) => {
  if (!data) return null;
  const head = data.cards.filter(c => c.scope === 'album');
  const hasEnergy = data.energy.some(e => e.total > 0);
  return (
    <section className="space-y-5" aria-label="Audience sentiment">
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#FFB86B]">Audience sentiment</h3>
        <span className="inline-flex items-center gap-1 text-[12px] text-white/45"><Heart size={11} /> from listening parties</span>
      </div>
      {hasEnergy && (
        <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.08]">
          <div className="text-[12px] font-semibold text-white/50 mb-2">Room energy, song by song — tap to jump</div>
          <PartyEnergyGraph
            songs={data.energy.map(e => ({ trackId: e.trackId, title: e.title, durationSec: e.durationSec, series: e.series, bucketSec: e.bucketSec }))}
            currentTrackId={currentTrackId}
            height={110}
            onSeek={onPlayAt ? (id, sec) => onPlayAt(id, sec) : undefined}
          />
        </div>
      )}
      {head.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{head.map(c => <Card key={c.id} c={c} onPlayAt={onPlayAt} />)}</div>}
    </section>
  );
};

/** One song's audience cards (rating, mood, energy peak, the room's comments). */
export const AudienceSentimentTrack: React.FC<{
  data: AudienceSentimentBundle | null;
  trackId: string;
  onPlayAt?: (trackId: string, sec?: number) => void;
}> = ({ data, trackId, onPlayAt }) => {
  const cards = data?.cards.filter(c => c.scope === 'track' && c.trackId === trackId) || [];
  if (!cards.length) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#FFB86B]">Audience sentiment</h3>
      <div className="grid gap-3 sm:grid-cols-2">{cards.map(c => <Card key={c.id} c={c} onPlayAt={onPlayAt} />)}</div>
    </div>
  );
};
