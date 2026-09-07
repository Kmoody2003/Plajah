import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cleanDescription } from '../../utils/description';
import { Radio, Tv, Play, ChevronLeft, ChevronRight, FlaskConical, Clock } from 'lucide-react';
import type { LiveFeed } from '../../types';
import { fetchFastChannelSchedule, fetchFastChannelVideos, fetchVideoById, type FastChannelListing } from '../../services/backendService';
import { activeDaySlots, dayAnchoredPosition, linearPositionMidnight, slotDurationSec, resolveSlotMedia, backfillScheduleDurations } from '../../services/fastChannelTimeline';
import { exactDurationSec } from '../../services/mediaTimebase';
import { now as clockNow } from '../../services/platformClock';
import { ACTIVE_SCIENCE_STREAMS } from '../scienceStreams';
import { PLAJAH_CHANNELS, UNNUMBERED, guideSortKey, plajahNumber } from '../../services/fast/channelNumbers';

/**
 * PlajahEpgGuide — a full traditional cable-TV programme guide, in the Plajah aesthetic. Channels run
 * down the left as rows; a time ruler runs across the top; each programme is a time-positioned block.
 * A gorgeous fade-out PREVIEW of the selected programme sits on the far left with its description
 * (pulled from the Reello/Taleo item). Fully keyboard/D-pad navigable (↑↓ channels, ←→ programmes,
 * Enter tunes in), and tunable to any station.
 */

const ORANGE = '#FF8C00';
const PURPLE = '#6B0099';
const MAGENTA = '#D40055';

const WINDOW_MIN = 150;                 // 2.5h visible
const SLOT_MIN = 30;                    // ruler granularity
const DAY_MS = 86400000;

interface GuideChannel {
  id: string;
  number: string;
  name: string;
  logo?: string;
  accent: string;
  kind: 'fast' | 'live' | 'science';
  ownerId?: string;
  feed?: any;
  sciDesc?: string;
  sciSource?: string;
  /** First-party channel in the reserved band — no owner account behind it. */
  plajahId?: string;
}
interface Program { title: string; startMs: number; endMs: number; isNow: boolean; videoId?: string; thumbnail?: string; kind: string; }

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isOnPlatform = (f: any) => f?.streamSource === 'webrtc' || /[?&]stream=/.test(f?.url || '');

interface Props {
  feeds: LiveFeed[];
  fastChannels: FastChannelListing[];
  onTune: (ch: GuideChannel) => void;
}

const PlajahEpgGuide: React.FC<Props> = ({ feeds, fastChannels, onTune }) => {
  const [nowTick, setNowTick] = useState(clockNow());
  useEffect(() => { const t = setInterval(() => setNowTick(clockNow()), 30000); return () => clearInterval(t); }, []);

  // Window anchored to the current half-hour.
  const windowStart = Math.floor(nowTick / (SLOT_MIN * 60000)) * (SLOT_MIN * 60000);
  const windowEnd = windowStart + WINDOW_MIN * 60000;
  const cols = WINDOW_MIN / SLOT_MIN;
  const pctOf = (ms: number) => ((Math.min(windowEnd, Math.max(windowStart, ms)) - windowStart) / (WINDOW_MIN * 60000)) * 100;

  // ── Build the channel lineup (FAST + live + a few science) ──────────────────
  const channels = useMemo<GuideChannel[]>(() => {
    const out: GuideChannel[] = [];
    fastChannels.forEach(fc => out.push({
      id: `fast_${fc.ownerId}`, number: fc.number != null ? String(fc.number) : UNNUMBERED, name: fc.name || 'Channel',
      logo: fc.logoUrl, accent: ORANGE, kind: 'fast', ownerId: fc.ownerId,
    }));
    (feeds || []).filter(f => (f as any).status !== 'ENDED' && (f as any).status !== 'OFFLINE').forEach(f => {
      out.push({ id: `live_${f.id}`, number: (f as any).channelNumber != null ? String((f as any).channelNumber) : '•', name: (f as any).ownerName || f.title || 'Live', logo: (f as any).ownerPhoto, accent: MAGENTA, kind: 'live', feed: f });
    });
    // Plajah's own channels, in the reserved band. They carry no owner account, so they are
    // added here rather than coming out of `fastChannels`.
    PLAJAH_CHANNELS.forEach(pc => out.push({
      id: `plajah_${pc.id}`, number: plajahNumber(pc), name: pc.name,
      logo: undefined, accent: ORANGE, kind: 'fast', plajahId: pc.id,
    }));
    // Curated science feeds (the 90x rows). Empty while SCIENCE_BAND_ENABLED is off — the
    // third-party YouTube embeds behind them are broken, so the guide omits the block entirely.
    ACTIVE_SCIENCE_STREAMS.filter(s => s.isLive).slice(0, 8).forEach((s, i) => out.push({
      id: `sci_${s.id}`, number: `90${i + 1}`, name: s.title, logo: undefined, accent: s.accent || PURPLE, kind: 'science', sciDesc: s.description, sciSource: s.source, feed: { id: s.id, title: s.title, url: s.embedUrl, ownerName: s.source },
    }));
    // guideSortKey rather than parseFloat: "1.10" must sort after "1.2", and parseFloat reads
    // those as 1.1 and 1.2 and puts them the wrong way round.
    return out.sort((a, b) => guideSortKey(a.number) - guideSortKey(b.number) || a.name.localeCompare(b.name));
  }, [fastChannels, feeds]);

  // ── Per-channel programme rows (FAST schedules fetched + cached lazily) ──────
  const [rows, setRows] = useState<Record<string, Program[]>>({});
  const schedCache = useRef<Map<string, any>>(new Map());

  const buildFastRow = useCallback((sched: any): Program[] => {
    const slots = activeDaySlots(sched, windowStart);
    if (!slots.length) return [];
    const pos = sched?.midnightAnchored ? linearPositionMidnight(slots, windowStart) : dayAnchoredPosition(slots, windowStart);
    if ('offAir' in pos && pos.offAir) return [];
    let cursor = windowStart - pos.offsetSec * 1000;
    let i = pos.index, guard = 0;
    const out: Program[] = [];
    while (cursor < windowEnd && guard < 240) {
      const s = slots[i % slots.length];
      const dur = slotDurationSec(s) * 1000;
      // FM blocks are real scheduled programming, so they get their own guide row like any show.
      if (s.type === 'VIDEO' || s.type === 'PUBLIC_DOMAIN' || s.type === 'LIVE_INTERRUPT' || s.type === 'FM_BLOCK') {
        const m = resolveSlotMedia(s);
        out.push({ title: m.title, startMs: cursor, endMs: cursor + dur, isNow: cursor <= nowTick && nowTick < cursor + dur, videoId: s.videoId, thumbnail: m.thumbnail || (m.muxPlaybackId ? `https://image.mux.com/${m.muxPlaybackId}/thumbnail.jpg?width=480&time=5` : undefined), kind: s.type });
      } else if (out.length) {
        out[out.length - 1].endMs += dur; // roll ad/bumper into the previous programme so time stays continuous
      }
      cursor += dur; i++; guard++;
    }
    return out;
  }, [windowStart, windowEnd, nowTick]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, Program[]> = {};
      for (const ch of channels) {
        if (ch.kind === 'fast' && ch.ownerId) {
          let sched = schedCache.current.get(ch.ownerId);
          if (sched === undefined) {
            const [s, vids] = await Promise.all([
              fetchFastChannelSchedule(ch.ownerId).catch(() => null),
              fetchFastChannelVideos(ch.ownerId).catch(() => [] as any[]),
            ]);
            const durMap = new Map((vids as any[]).map(v => [v.id, Math.round(exactDurationSec(v))]));
            sched = s ? backfillScheduleDurations(s, durMap) : null;
            schedCache.current.set(ch.ownerId, sched);
          }
          next[ch.id] = buildFastRow(sched);
        } else if (ch.kind === 'live') {
          next[ch.id] = [{ title: ch.feed?.title || 'Live now', startMs: windowStart, endMs: windowEnd + DAY_MS, isNow: true, kind: 'LIVE' }];
        } else {
          next[ch.id] = [{ title: ch.name, startMs: windowStart, endMs: windowEnd + DAY_MS, isNow: true, kind: 'SCIENCE' }];
        }
      }
      if (alive) setRows(next);
    })();
    return () => { alive = false; };
  }, [channels, buildFastRow, windowStart, windowEnd]);

  // ── Selection + preview ─────────────────────────────────────────────────────
  const [chIdx, setChIdx] = useState(0);
  const [progIdx, setProgIdx] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const selChannel = channels[chIdx] || null;
  const selRow = selChannel ? (rows[selChannel.id] || []) : [];
  const selProgram = selRow[Math.min(progIdx, Math.max(0, selRow.length - 1))] || selRow.find(p => p.isNow) || selRow[0] || null;

  // Lazy description from the Reello/Taleo item behind the selected programme.
  const [desc, setDesc] = useState<string>('');
  const descCache = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    setDesc('');
    const vid = selProgram?.videoId;
    if (!vid) return;
    if (descCache.current.has(vid)) { setDesc(descCache.current.get(vid)!); return; }
    let alive = true;
    fetchVideoById(vid).then(v => {
      const d = cleanDescription((v as any)?.description);
      descCache.current.set(vid, d);
      if (alive) setDesc(d);
    }).catch(() => {});
    return () => { alive = false; };
  }, [selProgram?.videoId]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setChIdx(i => Math.min(channels.length - 1, i + 1)); setProgIdx(0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setChIdx(i => Math.max(0, i - 1)); setProgIdx(0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setProgIdx(i => Math.min((selRow.length || 1) - 1, i + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setProgIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && selChannel) { e.preventDefault(); onTune(selChannel); }
  }, [channels.length, selRow.length, selChannel, onTune]);
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onKey]);

  useEffect(() => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-ch="${chIdx}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chIdx]);

  const timeCols = Array.from({ length: cols }, (_, k) => windowStart + k * SLOT_MIN * 60000);
  const nowPct = pctOf(nowTick);

  return (
    <div className="absolute inset-0 flex flex-col md:flex-row overflow-hidden" style={{ background: 'radial-gradient(140% 120% at 15% -10%, #1a0033 0%, #0a0512 55%, #04030a 100%)' }}>
      {/* ── Far-left fade PREVIEW ─────────────────────────────────────────── */}
      <div className="relative w-full md:w-[34%] lg:w-[30%] shrink-0 overflow-hidden border-b md:border-b-0 md:border-r border-white/10">
        {selProgram?.thumbnail || selChannel?.logo ? (
          <img src={selProgram?.thumbnail || selChannel?.logo} className="absolute inset-0 w-full h-full object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${selChannel?.accent || PURPLE}55, #04030a)` }} />
        )}
        {/* fade-out toward the guide */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(4,3,10,0.15) 0%, rgba(4,3,10,0.55) 55%, rgba(4,3,10,0.97) 100%), linear-gradient(0deg, rgba(4,3,10,0.95) 0%, transparent 55%)' }} />

        <div className="relative h-full flex flex-col justify-end p-6 md:p-8 gap-3">
          {selChannel && (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-black tabular-nums" style={{ background: selChannel.accent, color: '#000' }}>{selChannel.number}</span>
              <span className="text-[11px] font-black uppercase tracking-[0.35em] text-white/70">{selChannel.name}</span>
              {selProgram?.isNow && <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> On Now</span>}
            </div>
          )}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-[0.9] text-white line-clamp-3">{selProgram?.title || selChannel?.name || 'Plajah Live'}</h1>
          {selProgram && selProgram.kind !== 'LIVE' && selProgram.kind !== 'SCIENCE' && (
            <p className="text-[11px] font-black uppercase tracking-widest text-white/40">{fmtTime(selProgram.startMs)} – {fmtTime(selProgram.endMs)}</p>
          )}
          <p className="text-sm text-white/55 leading-relaxed line-clamp-4 max-w-md">{desc || selChannel?.sciDesc || 'Tune in to watch this channel live on Plajah.'}</p>
          {selChannel && (
            <button onClick={() => onTune(selChannel)} className="mt-2 w-fit flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-black hover:opacity-90 transition-opacity" style={{ background: `linear-gradient(100deg, ${ORANGE}, ${MAGENTA})` }}>
              <Play size={16} fill="#000" /> Tune In
            </button>
          )}
        </div>
      </div>

      {/* ── Guide grid ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* header */}
        <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-3">
          <Tv size={16} style={{ color: ORANGE }} />
          <span className="text-[12px] font-black uppercase tracking-[0.4em]">Programme Guide</span>
        </div>
        {/* time ruler */}
        <div className="shrink-0 flex items-stretch pr-4 pl-[136px] border-b border-white/10">
          {timeCols.map((ms, k) => (
            <div key={k} className="flex-1 px-2 py-2 text-[10px] font-black uppercase tracking-widest text-white/45 border-l border-white/5">{fmtTime(ms)}</div>
          ))}
        </div>

        {/* rows */}
        <div ref={gridRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="relative">
            {/* now line */}
            <div className="pointer-events-none absolute top-0 bottom-0 z-20" style={{ left: `calc(136px + ${nowPct}% * (100% - 136px) / 100)` }}>
              <div className="w-px h-full" style={{ background: ORANGE, boxShadow: `0 0 12px ${ORANGE}` }} />
            </div>

            {channels.map((ch, ci) => {
              const row = rows[ch.id] || [];
              const isSelRow = ci === chIdx;
              return (
                <div key={ch.id} data-ch={ci} className={`relative flex items-stretch border-b border-white/5 ${isSelRow ? 'bg-white/[0.05]' : ''}`} style={{ height: 74 }}>
                  {/* channel label */}
                  <button onClick={() => { setChIdx(ci); setProgIdx(0); onTune(ch); }} className="w-[136px] shrink-0 flex items-center gap-2.5 px-3 border-r border-white/10 text-left hover:bg-white/5">
                    <span className="px-2 py-1 rounded-lg text-[11px] font-black tabular-nums shrink-0" style={{ background: isSelRow ? ch.accent : 'rgba(255,255,255,0.08)', color: isSelRow ? '#000' : 'rgba(255,255,255,0.6)' }}>{ch.number}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-tight text-white truncate leading-tight">{ch.name}</p>
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/30">{ch.kind === 'live' ? 'Live' : ch.kind === 'science' ? 'Science' : 'FAST'}</p>
                    </div>
                  </button>
                  {/* programme track */}
                  <div className="relative flex-1 min-w-0">
                    {row.length === 0 && <div className="absolute inset-1.5 rounded-xl bg-white/[0.03] border border-white/5 grid place-items-center"><span className="text-[9px] font-black uppercase tracking-widest text-white/20">No schedule</span></div>}
                    {row.map((p, pi) => {
                      const left = pctOf(p.startMs);
                      const width = Math.max(0, pctOf(p.endMs) - left);
                      if (width <= 0.5) return null;
                      const sel = isSelRow && p === selProgram;
                      return (
                        <button key={pi} onClick={() => { setChIdx(ci); setProgIdx(pi); }} onDoubleClick={() => onTune(ch)}
                          className={`absolute top-1.5 bottom-1.5 rounded-xl px-3 flex flex-col justify-center overflow-hidden text-left transition-all ${sel ? 'ring-2 z-10' : 'hover:brightness-125'}`}
                          style={{ left: `${left}%`, width: `${width}%`, background: p.isNow ? `linear-gradient(120deg, ${ch.accent}33, rgba(255,255,255,0.04))` : 'rgba(255,255,255,0.035)', borderLeft: `3px solid ${p.isNow ? ch.accent : 'rgba(255,255,255,0.12)'}`, ...(sel ? { boxShadow: `0 0 0 2px ${ch.accent}` } as any : {}) }}>
                          <span className="text-[11px] font-black uppercase tracking-tight text-white truncate">{p.title}</span>
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/35">{p.kind === 'LIVE' ? 'Live now' : p.kind === 'SCIENCE' ? '24/7' : fmtTime(p.startMs)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {channels.length === 0 && (
              <div className="py-32 text-center text-white/30 flex flex-col items-center gap-3">
                <Radio size={40} /> <p className="text-[11px] font-black uppercase tracking-widest">No channels on air right now</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlajahEpgGuide;
