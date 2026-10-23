// MusicIntelRail — Music Intelligence's "on air" host, in the album page's side rail between
// the now-playing / lyrics card and the listening-party card. Host mode reads like a public-radio
// music host talking over the song: the card for this moment of the track leads, the next ones
// wait below with their timestamps (tap to jump there). Off, it's a single quiet insight card.
import React, { useMemo, useState } from 'react';
import { Radio, Sparkles, Loader2, Mic2, Music2, SlidersHorizontal, Heart, BookOpen, Film } from 'lucide-react';
import type { HostCard, HostCardKind, MusicIntelBundle } from '../../../services/musicIntelService';

const SERIF = 'Newsreader, Georgia, serif';
const HOST_MODE_KEY = 'chora_music_intel_host_mode';

const KIND_META: Record<HostCardKind, { label: string; icon: React.ComponentType<{ size?: number }>; color: string }> = {
  intro: { label: 'Intro', icon: Radio, color: '#FFB86B' },
  lyric: { label: 'The words', icon: BookOpen, color: '#F9A8D4' },
  composition: { label: 'The writing', icon: Music2, color: '#93C5FD' },
  mix: { label: 'The mix', icon: SlidersHorizontal, color: '#86EFAC' },
  emotion: { label: 'The feeling', icon: Heart, color: '#FCA5A5' },
  context: { label: 'Context', icon: Film, color: '#D0BCFF' },
  outro: { label: 'Outro', icon: Mic2, color: '#FFB86B' },
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function readHostMode(): boolean {
  try { return localStorage.getItem(HOST_MODE_KEY) !== 'off'; } catch { return true; }
}

interface Props {
  bundle: MusicIntelBundle | null;
  trackId?: string;
  trackTitle?: string;
  /** Seconds into the current track — only meaningful while this album is the one playing. */
  currentTime: number;
  playingHere: boolean;
  onSeek?: (sec: number) => void;
  isOwner: boolean;
  onRun?: () => void;
  onOpenBreakdown?: () => void;
}

const MusicIntelRail: React.FC<Props> = ({ bundle, trackId, trackTitle, currentTime, playingHere, onSeek, isOwner, onRun, onOpenBreakdown }) => {
  const [hostMode, setHostMode] = useState(readHostMode);
  const toggleHost = () => setHostMode(v => {
    try { localStorage.setItem(HOST_MODE_KEY, v ? 'off' : 'on'); } catch { /* per-viewer nicety only */ }
    return !v;
  });

  const job = bundle?.job;
  const track = trackId ? bundle?.tracks?.[trackId] : undefined;

  // The running order of cards for this song: album intro first on the opener, then the song's
  // own cards (pinned ones by time), closing with the album outro on the last song.
  const { live, next } = useMemo(() => {
    const cards: HostCard[] = track?.hostCards?.length ? [...track.hostCards] : (job?.album?.hostCards || []);
    const pinned = cards.filter(c => typeof c.atSec === 'number').sort((a, b) => a.atSec! - b.atSec!);
    const loose = cards.filter(c => typeof c.atSec !== 'number');
    const t = playingHere ? currentTime : -1;
    const passed = pinned.filter(c => c.atSec! <= t);
    const live = passed[passed.length - 1] || loose.find(c => c.kind === 'intro') || loose[0] || pinned[0];
    const rest = [...pinned.filter(c => c.atSec! > t), ...loose].filter(c => c !== live);
    return { live, next: rest.slice(0, 2) };
  }, [track, job, playingHere, currentTime]);

  if (!job) {
    if (!isOwner || !onRun) return null;
    return (
      <div className="rounded-3xl px-5 py-4 flex items-center gap-4 bg-white/[0.04] border border-white/10">
        <Radio size={20} className="shrink-0 text-[#FFB86B]" />
        <p className="flex-1 min-w-0 text-sm text-white/80 leading-snug">Music Intelligence can listen to this album and write insight, liner notes and host commentary.</p>
        <button type="button" onClick={onRun} className="shrink-0 h-11 px-4 rounded-full border border-white/35 text-sm font-bold text-white hover:bg-white/10 transition-colors">Analyze</button>
      </div>
    );
  }

  const running = ['QUEUED', 'LISTENING', 'SYNTHESIZING'].includes(job.status);
  const pct = job.progress?.total ? Math.round((100 * job.progress.done) / job.progress.total) : 0;

  return (
    <section aria-label="Music Intelligence" className="rounded-3xl overflow-hidden border" style={{ background: 'linear-gradient(160deg, rgba(255,140,0,0.10), rgba(255,255,255,0.03) 45%)', borderColor: 'rgba(255,184,107,0.22)' }}>
      <header className="flex items-center justify-between gap-3 px-5 pt-4">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
          <span className="relative flex w-2 h-2">
            {hostMode && playingHere && <span className="absolute inline-flex w-full h-full rounded-full bg-[#FF8C00] opacity-60 animate-ping" />}
            <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: hostMode && playingHere ? '#FF8C00' : 'rgba(255,255,255,0.35)' }} />
          </span>
          {hostMode ? 'On air · Music Intelligence' : 'Music Intelligence'}
        </span>
        <button type="button" onClick={toggleHost} aria-pressed={hostMode} title="Host mode: radio-style commentary that follows the song"
          className={`h-8 px-3 rounded-full text-[12px] font-semibold border transition-colors ${hostMode ? 'text-[#FFD19A] border-[#FF8C00]/50 bg-[#FF8C00]/12' : 'text-white/60 border-white/15 hover:text-white'}`}>
          Host mode
        </button>
      </header>

      {running && (
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 text-[12px] text-white/60">
            <Loader2 size={13} className="animate-spin text-[#FF8C00]" />
            <span className="truncate">{job.progress?.note || 'Listening'} · {job.progress?.done ?? 0} of {job.progress?.total ?? 0}</span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#FF8C00] transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      <div className="px-5 pt-3 pb-4">
        {!track && !job.album ? (
          <p className="text-white/55" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 16 }}>
            {running ? `Still listening${trackTitle ? ` — “${trackTitle}” is coming up` : ''}.` : 'No read for this song yet.'}
          </p>
        ) : hostMode && live ? (
          <>
            <HostCardView card={live} lead onSeek={onSeek} />
            {next.map((c, i) => <HostCardView key={i} card={c} onSeek={onSeek} />)}
          </>
        ) : (
          <p className="text-[15px] leading-relaxed text-white/80" style={{ fontFamily: SERIF }}>
            {track?.summary || job.album?.overview}
          </p>
        )}
        {track && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[track.composition.key, track.composition.tempoBpm ? `${Math.round(track.composition.tempoBpm)} BPM` : '', track.mood.primary, ...track.genreTags.slice(0, 2)].filter(Boolean).map(t => (
              <span key={t} className="h-7 px-2.5 rounded-full inline-flex items-center text-[12px] text-white/70 border border-white/12 bg-white/[0.03]">{t}</span>
            ))}
          </div>
        )}
        {onOpenBreakdown && (track || job.album) && (
          <button type="button" onClick={onOpenBreakdown} className="mt-2 h-11 px-1 text-sm font-semibold text-[#FFB86B] hover:text-[#FF8C00] transition-colors inline-flex items-center gap-1.5">
            <Sparkles size={14} /> Full breakdown →
          </button>
        )}
      </div>
    </section>
  );
};

const HostCardView: React.FC<{ card: HostCard; lead?: boolean; onSeek?: (s: number) => void }> = ({ card, lead, onSeek }) => {
  const meta = KIND_META[card.kind] || KIND_META.context;
  const Icon = meta.icon;
  const pinned = typeof card.atSec === 'number';
  return (
    <article className={lead ? 'pb-3' : 'mt-2 pt-3 border-t border-white/[0.08] opacity-75'}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: meta.color }}>
        <Icon size={12} /> {meta.label}
        {pinned && (
          <button type="button" onClick={() => onSeek?.(card.atSec!)} disabled={!onSeek} title="Jump to this moment"
            className="ml-auto font-mono normal-case tracking-normal text-white/50 hover:text-white disabled:hover:text-white/50">
            {lead ? '' : 'at '}{fmt(card.atSec!)}
          </button>
        )}
      </div>
      {card.title && <h4 className={`mt-1 font-semibold text-white ${lead ? 'text-[15px]' : 'text-sm'}`}>{card.title}</h4>}
      <p className={`mt-1 text-white/80 leading-relaxed ${lead ? '' : 'line-clamp-2'}`} style={{ fontFamily: SERIF, fontSize: lead ? 17 : 15 }}>{card.text}</p>
    </article>
  );
};

export default MusicIntelRail;
