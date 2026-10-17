// AmboLyricsControl — Chora lyric sync to Ambo's screens.
//
// A button on the audio bar opens the panel: which player the lyrics follow
// (audio playlist or DJ deck), which look (ten council-credited typography
// designs), a live preview, and Take / Clear. While lyrics are on Program this
// stays mounted and keeps the layer's clock anchor honest — it re-anchors only
// when the music actually jumps (seek, pause, tempo, next song).

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Captions, X, Radio, AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { LayerContent } from '../../services/ambo/showModel';
import {
  LYRIC_STYLES, SAMPLE_LYRICS, lyricStyleById, renderLyricFrame, type LyricStyle,
} from '../../services/ambo/lyricStyles';
import {
  getLiveLyricsPrefs, getLiveLyricsState, subscribeLiveLyrics, setLiveLyricsPrefs, startLiveLyrics, stopLiveLyrics,
  listLiveAudioStreams, type LiveLyricSource,
} from '../../services/ambo/liveLyrics';
import { listAudioInputs } from '../../services/ambo/liveTranscriber';
import {
  nextLyricsContent, readFeed, subscribeLyricClocks, lyricClocksVersion, getLyricClock, type LyricSourceId,
} from '../../services/ambo/lyricFeed';
import { getLyricsProgram, setLyricsProgram, subscribeLyricsProgram } from '../../services/ambo/lyricsProgram';

type LyricsContent = Extract<LayerContent, { kind: 'LYRICS' }>;

interface Props {
  /** The LYRICS content currently on Program, if any. */
  live: LyricsContent | null;
  onSet: (content: LyricsContent | null) => void;
}

export const LYRIC_SOURCE_LABEL: Record<LyricSourceId, string> = {
  bus: 'Audio playlist', dj: 'DJ deck', live: 'Live transcription', follow: 'Song follow',
};

/** A neutral stage-like backdrop so white type reads in thumbnails/previews. */
export function backdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1b1530'); g.addColorStop(0.55, '#2b1a3f'); g.addColorStop(1, '#0d1626');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.35;
  const r = ctx.createRadialGradient(w * (0.3 + 0.1 * Math.sin(t * 0.3)), h * 0.35, 0, w * 0.3, h * 0.35, w * 0.6);
  r.addColorStop(0, '#6d3cff'); r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

export const StyleThumb: React.FC<{ style: LyricStyle; selected: boolean; onPick: () => void; onDoubleClick?: () => void }> = ({ style, selected, onPick, onDoubleClick }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = 320, H = 180;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Render the look at 1080p onto an offscreen canvas, then scale — the looks
    // size type from the frame height, and that is what an output will see.
    const big = document.createElement('canvas');
    big.width = 1920; big.height = 1080;
    const bctx = big.getContext('2d');
    if (!bctx) return;
    renderLyricFrame(bctx, style, SAMPLE_LYRICS, 4.4, 1920, 1080, { title: 'Great Is Thy Faithfulness', artist: 'Chora', bpm: 72 });
    backdrop(ctx, W, H, 0);
    ctx.drawImage(big, 0, 0, W, H);
  }, [style]);
  return (
    <button
      onClick={onPick}
      onDoubleClick={onDoubleClick}
      title={`${style.blurb}\nBest for: ${style.use}\n(Double-click to take directly to Program)`}
      className={`text-left rounded-lg overflow-hidden border transition-all ${selected ? 'border-[#D0BCFF] ring-2 ring-[#D0BCFF]/40' : 'border-white/10 hover:border-white/30'}`}
    >
      <canvas ref={ref} className="w-full aspect-video block" />
      <div className="px-1.5 py-1 bg-black/40">
        <div className="text-[10px] font-bold text-white truncate flex items-center gap-1">{selected && <Check size={10} className="text-[#D0BCFF]" />}{style.name}</div>
        <div className="text-[8.5px] text-white/45 truncate">{style.director} · {style.council}</div>
      </div>
    </button>
  );
};

export const LiveSourcePanel: React.FC = () => {
  const lp = useSyncExternalStore(subscribeLiveLyrics, getLiveLyricsPrefs);
  const ls = useSyncExternalStore(subscribeLiveLyrics, getLiveLyricsState);
  const [inputs, setInputs] = useState<Array<{ deviceId: string; label: string }>>([]);
  useEffect(() => { void listAudioInputs().then(setInputs); }, [ls.running]);
  const src = lp.source;
  const streams = listLiveAudioStreams();
  const choose = (v: string) => {
    let next: LiveLyricSource = { kind: 'mic' };
    if (v === 'auto') next = { kind: 'auto' };
    else if (v === 'playlist') next = { kind: 'playlist' };
    else if (v === 'dj') next = { kind: 'dj' };
    else if (v === 'program') next = { kind: 'program' };
    else if (v === 'system') next = { kind: 'system' };
    else if (v.startsWith('dev:')) next = { kind: 'device', deviceId: v.slice(4) };
    else if (v.startsWith('str:')) next = { kind: 'stream', id: v.slice(4) };
    else if (v === 'url') next = { kind: 'url', url: src.kind === 'url' ? src.url : '' };
    setLiveLyricsPrefs({ source: next });
  };
  const value = src.kind === 'device' ? 'dev:' + src.deviceId : src.kind === 'stream' ? 'str:' + src.id : src.kind;
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/40 w-12">Listen</span>
        <select value={value} onChange={e => choose(e.target.value)} disabled={ls.running}
          className="flex-1 min-w-0 h-7 rounded-md bg-white/5 border border-white/10 text-[10.5px] text-white px-1.5">
          <option value="auto" className="bg-[#14101e]">Auto (playing track, else microphone)</option>
          <option value="mic" className="bg-[#14101e]">Default microphone</option>
          <option value="playlist" className="bg-[#14101e]">Audio playlist playback</option>
          <option value="dj" className="bg-[#14101e]">DJ deck playback</option>
          <option value="program" className="bg-[#14101e]">Program master mix</option>
          <option value="system" className="bg-[#14101e]">System / Screen audio…</option>
          {inputs.map(d => <option key={d.deviceId} value={'dev:' + d.deviceId} className="bg-[#14101e]">Input · {d.label}</option>)}
          {streams.map(s => <option key={s.id} value={'str:' + s.id} className="bg-[#14101e]">Stream · {s.label}</option>)}
          <option value="url" className="bg-[#14101e]">Stream URL (account / station)…</option>
        </select>
        <button
          onClick={() => ((ls.running || ls.starting) ? stopLiveLyrics() : void startLiveLyrics())}
          className={`px-3 h-7 rounded-md text-[10px] font-black relative overflow-hidden flex items-center gap-1.5 transition-all select-none ${
            ls.running
              ? 'text-white bg-white/10 border border-white/15'
              : ls.starting
              ? 'text-[#2BE0A8] bg-[#2BE0A8]/10 border border-[#2BE0A8]/50 shadow-[0_0_12px_rgba(43,224,168,0.25)]'
              : 'text-black bg-[#2BE0A8] hover:brightness-110'
          }`}
          title={ls.starting ? `Getting ready (${Math.round((ls.progress ?? 0.2) * 100)}%) — click to cancel` : undefined}
        >
          {ls.starting && (
            <>
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#2BE0A8]/15 via-[#2BE0A8]/30 to-[#2BE0A8]/20 transition-all duration-200 pointer-events-none"
                style={{ width: `${Math.max(12, Math.min(100, Math.round((ls.progress ?? 0.2) * 100)))}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/40 pointer-events-none">
                <div
                  className="h-full bg-[#2BE0A8] transition-all duration-200 shadow-[0_0_6px_#2BE0A8]"
                  style={{ width: `${Math.max(12, Math.min(100, Math.round((ls.progress ?? 0.2) * 100)))}%` }}
                />
              </div>
            </>
          )}
          {ls.starting ? (
            <Loader2 size={11} className="animate-spin text-[#2BE0A8] relative z-10 flex-none" />
          ) : null}
          <span className="relative z-10 font-bold">
            {ls.starting ? `Readying ${Math.round((ls.progress ?? 0.2) * 100)}%` : ls.running ? 'Stop' : 'Start'}
          </span>
        </button>
      </div>
      {src.kind === 'url' && (
        <input value={src.url} disabled={ls.running} onChange={e => setLiveLyricsPrefs({ source: { kind: 'url', url: e.target.value } })}
          placeholder="https://…/stream.mp3" className="h-7 rounded-md bg-white/5 border border-white/10 text-[10.5px] text-white px-2" />
      )}
      <div className="text-[10px] text-white/60 min-h-[28px] leading-snug">
        {ls.error ? <span className="text-[#F5C542]">{ls.error}</span>
          : ls.running ? (ls.lines.length ? ls.lines.map(l => l.text).join(' / ') : 'Listening…')
          : 'Words from this source appear on screen in the look below. Take to Program once it is listening.'}
      </div>
      {(ls.running || ls.starting) && (
        <div className="text-[9px] text-[#D0BCFF]/80 truncate" title={ls.status}>
          {src.kind === 'auto' && ls.autoResolved ? `Auto → ${ls.autoResolved === 'dj' ? 'DJ deck' : ls.autoResolved === 'playlist' ? 'Playlist' : 'Microphone'} · ` : ''}{ls.status}
        </div>
      )}
    </div>
  );
};

const AmboLyricsControl: React.FC<Props> = ({ live, onSet }) => {
  useSyncExternalStore(subscribeLyricClocks, lyricClocksVersion);
  const [open, setOpen] = useState(false);
  // Shared with the Lyrics tab: either can take lyrics to Program.
  const program = useSyncExternalStore(subscribeLyricsProgram, getLyricsProgram);
  const prefs = { source: program.source, styleId: program.styleId };
  const setPrefs = (fn: (p: { source: LyricSourceId; styleId: string }) => { source: LyricSourceId; styleId: string }) => setLyricsProgram(fn(prefs));
  const wantLive = program.wantLive;
  const setWantLive = (v: boolean) => setLyricsProgram({ wantLive: v });
  const [, force] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(live);
  liveRef.current = live;


  // ── sync loop: keeps the Program layer's anchor true to the music ──
  useEffect(() => {
    if (!wantLive) return;
    const tick = () => {
      const prev = liveRef.current;
      const next = nextLyricsContent(prefs.source, prefs.styleId, prev);
      if (next !== prev) onSet(next);
      force(x => (x + 1) % 1e6);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [wantLive, prefs.source, prefs.styleId, onSet]);

  // Clearing from another surface (the Song Lyrics tab) only flips wantLive —
  // take the layer down here, where the Program setter lives.
  const wasLive = useRef(wantLive);
  useEffect(() => {
    if (wasLive.current && !wantLive && liveRef.current) onSet(null);
    wasLive.current = wantLive;
  }, [wantLive, onSet]);

  // status while the panel is open
  useEffect(() => {
    if (!open || wantLive) return;
    const id = setInterval(() => force(x => (x + 1) % 1e6), 300);
    return () => clearInterval(id);
  }, [open, wantLive]);

  return null;
};

function anchorPos(el: HTMLElement | null): React.CSSProperties {
  if (!el || typeof window === 'undefined') return { right: 12, bottom: 60 };
  const r = el.getBoundingClientRect();
  const right = Math.max(12, window.innerWidth - r.right);
  return r.top > window.innerHeight / 2 ? { right, bottom: window.innerHeight - r.top + 8 } : { right, top: r.bottom + 8 };
}

export default AmboLyricsControl;
