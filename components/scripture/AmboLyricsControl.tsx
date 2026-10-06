// AmboLyricsControl — Chora lyric sync to Ambo's screens.
//
// A button on the audio bar opens the panel: which player the lyrics follow
// (audio playlist or DJ deck), which look (ten council-credited typography
// designs), a live preview, and Take / Clear. While lyrics are on Program this
// stays mounted and keeps the layer's clock anchor honest — it re-anchors only
// when the music actually jumps (seek, pause, tempo, next song).

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Captions, X, Radio, AlertTriangle, Check } from 'lucide-react';
import type { LayerContent } from '../../services/ambo/showModel';
import {
  LYRIC_STYLES, SAMPLE_LYRICS, DEFAULT_LYRIC_STYLE, lyricStyleById, renderLyricFrame, type LyricStyle,
} from '../../services/ambo/lyricStyles';
import {
  getLiveLyricsPrefs, getLiveLyricsState, subscribeLiveLyrics, setLiveLyricsPrefs, startLiveLyrics, stopLiveLyrics,
  listLiveAudioStreams, type LiveLyricSource,
} from '../../services/ambo/liveLyrics';
import { listAudioInputs } from '../../services/ambo/liveTranscriber';
import {
  nextLyricsContent, readFeed, subscribeLyricClocks, lyricClocksVersion, getLyricClock, type LyricSourceId,
} from '../../services/ambo/lyricFeed';

type LyricsContent = Extract<LayerContent, { kind: 'LYRICS' }>;

interface Props {
  /** The LYRICS content currently on Program, if any. */
  live: LyricsContent | null;
  onSet: (content: LyricsContent | null) => void;
}

const PREF_KEY = 'ambo_lyrics_prefs_v1';

/** A neutral stage-like backdrop so white type reads in thumbnails/previews. */
function backdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1b1530'); g.addColorStop(0.55, '#2b1a3f'); g.addColorStop(1, '#0d1626');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.35;
  const r = ctx.createRadialGradient(w * (0.3 + 0.1 * Math.sin(t * 0.3)), h * 0.35, 0, w * 0.3, h * 0.35, w * 0.6);
  r.addColorStop(0, '#6d3cff'); r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

const StyleThumb: React.FC<{ style: LyricStyle; selected: boolean; onPick: () => void }> = ({ style, selected, onPick }) => {
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
      title={`${style.blurb}\nBest for: ${style.use}`}
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
    if (v.startsWith('dev:')) next = { kind: 'device', deviceId: v.slice(4) };
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
          <option value="mic" className="bg-[#14101e]">Default microphone</option>
          {inputs.map(d => <option key={d.deviceId} value={'dev:' + d.deviceId} className="bg-[#14101e]">Input · {d.label}</option>)}
          {streams.map(s => <option key={s.id} value={'str:' + s.id} className="bg-[#14101e]">Stream · {s.label}</option>)}
          <option value="url" className="bg-[#14101e]">Stream URL (account / station)…</option>
        </select>
        <button onClick={() => (ls.running ? stopLiveLyrics() : void startLiveLyrics())} disabled={ls.starting}
          className={`px-2.5 h-7 rounded-md text-[10px] font-black disabled:opacity-40 ${ls.running ? 'text-white bg-white/10 border border-white/15' : 'text-black bg-[#2BE0A8]'}`}>
          {ls.starting ? 'Starting…' : ls.running ? 'Stop' : 'Start'}
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
    </div>
  );
};

const AmboLyricsControl: React.FC<Props> = ({ live, onSet }) => {
  useSyncExternalStore(subscribeLyricClocks, lyricClocksVersion);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<{ source: LyricSourceId; styleId: string }>(() => {
    try { return { source: 'bus', styleId: DEFAULT_LYRIC_STYLE, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { source: 'bus', styleId: DEFAULT_LYRIC_STYLE }; }
  });
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* */ } }, [prefs]);
  const [wantLive, setWantLive] = useState(false);
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

  // status while the panel is open
  useEffect(() => {
    if (!open || wantLive) return;
    const id = setInterval(() => force(x => (x + 1) % 1e6), 300);
    return () => clearInterval(id);
  }, [open, wantLive]);

  const feed = readFeed(prefs.source);
  const style = lyricStyleById(prefs.styleId);

  // ── live preview canvas ──
  const prevRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!open) return;
    const c = prevRef.current;
    if (!c) return;
    const W = 480, H = 270;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const big = document.createElement('canvas');
    big.width = 1280; big.height = 720;
    const bctx = big.getContext('2d');
    if (!ctx || !bctx) return;
    const t0 = performance.now();
    const draw = () => {
      const f = readFeed(prefs.source);
      const t = (performance.now() - t0) / 1000;
      backdrop(ctx, W, H, t);
      if (f.ok && f.lines) {
        renderLyricFrame(bctx, style, f.lines, f.pos ?? 0, 1280, 720, { title: f.track?.title, artist: f.track?.artist, bpm: f.track?.bpm });
      } else {
        // No synced song yet — loop the sample so the look can still be judged.
        renderLyricFrame(bctx, style, SAMPLE_LYRICS, (t % 10) - 1.2, 1280, 720, { title: 'Great Is Thy Faithfulness', artist: 'Chora', bpm: 72 });
      }
      ctx.drawImage(big, 0, 0, W, H);
    };
    draw();
    // setInterval, not rAF: keeps drawing in background panes/hidden windows.
    const id = setInterval(draw, 33);
    return () => clearInterval(id);
  }, [open, prefs.source, style]);

  // close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [open]);

  const take = () => { setWantLive(true); };
  const clear = () => { setWantLive(false); onSet(null); };

  const reasonText = (r?: string) =>
    r === 'no-player' ? (prefs.source === 'live' ? 'Start listening first.' : prefs.source === 'dj' ? 'Open a song in the DJ deck first.' : 'The audio playlist isn’t ready.')
      : r === 'no-track' ? 'Nothing is playing on this player yet.'
      : r === 'no-lyrics' && prefs.source === 'live' ? 'Waiting for the first words…'
      : r === 'no-lyrics' ? 'This song has no synced lyrics — use “Sync Lyrics” on it in Chora, then come back.'
      : '';

  const isLive = wantLive && !!live;
  const lineNo = feed.ok && feed.lines ? feed.lines.filter(l => l.time <= (feed.pos ?? 0)).length : 0;

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      className="fixed z-[10000] w-[520px] max-w-[calc(100vw-24px)] rounded-xl border shadow-2xl flex flex-col"
      style={{ background: 'rgba(14,11,22,0.98)', borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(14px)', ...anchorPos(btnRef.current) }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <Captions size={14} className="text-[#D0BCFF]" />
        <div className="text-[11px] font-bold text-white">Lyrics to screens</div>
        {isLive && <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black text-black bg-[#FF8C00]">ON PROGRAM</span>}
        <div className="flex-1" />
        <button onClick={() => setOpen(false)} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" aria-label="Close"><X size={13} /></button>
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">Follow</span>
          {(['bus', 'dj', 'live'] as LyricSourceId[]).map(s => (
            <button
              key={s}
              onClick={() => setPrefs(p => ({ ...p, source: s }))}
              className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${prefs.source === s ? 'text-[#D0BCFF] bg-[#D0BCFF]/15 border-[#D0BCFF]/35' : 'text-white/60 border-white/10 hover:text-white hover:bg-white/5'}`}
            >
              {s === 'bus' ? 'Audio playlist' : s === 'dj' ? 'DJ deck' : 'Live transcription'}{!getLyricClock(s) && <span className="ml-1 opacity-50">(off)</span>}
            </button>
          ))}
          <div className="flex-1 min-w-0 text-right text-[9.5px] truncate">
            {feed.ok
              ? <span className="text-white/70"><Radio size={9} className="inline mr-1 text-[#2BE0A8]" />{feed.track?.title} · line {lineNo}/{feed.lines?.length}</span>
              : <span className="text-[#F5C542]"><AlertTriangle size={9} className="inline mr-1" />{reasonText(feed.reason)}</span>}
          </div>
        </div>

        {prefs.source === 'live' && <LiveSourcePanel />}

        <div className="relative rounded-lg overflow-hidden border border-white/10">
          <canvas ref={prevRef} className="w-full aspect-video block" />
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[8.5px] font-bold text-white/80">
            {feed.ok ? 'PREVIEW · live song' : 'PREVIEW · sample'} — {style.name}
          </div>
        </div>
        <div className="text-[9.5px] text-white/50 leading-snug">{style.blurb} <span className="text-white/35">Best for: {style.use}.</span></div>

        <div className="grid grid-cols-3 gap-1.5 max-h-[230px] overflow-y-auto pr-0.5">
          {LYRIC_STYLES.map(s => (
            <StyleThumb key={s.id} style={s} selected={s.id === prefs.styleId} onPick={() => setPrefs(p => ({ ...p, styleId: s.id }))} />
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <div className="text-[9px] text-white/40 flex-1 leading-snug">
            Lyrics use their own layer — over slides and verses, under props. Program, Stream, Key and Stage outputs carry them.
          </div>
          {isLive ? (
            <button onClick={clear} className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold text-white bg-white/10 hover:bg-white/20 border border-white/15">Clear lyrics</button>
          ) : (
            <button
              onClick={take}
              disabled={!feed.ok}
              className="px-3 py-1.5 rounded-lg text-[10.5px] font-black text-black bg-[#FF8C00] hover:brightness-110 disabled:opacity-30"
              title={feed.ok ? 'Put the lyrics on Program, following the music' : reasonText(feed.reason)}
            >Take to Program</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className={`px-2 py-1 rounded text-[9.5px] font-bold border flex items-center gap-1 ${isLive ? 'text-black bg-[#FF8C00] border-[#FF8C00]' : open ? 'text-[#D0BCFF] bg-[#D0BCFF]/15 border-[#D0BCFF]/30' : 'text-white/70 bg-white/5 border-white/10 hover:bg-white/15'}`}
        title="Chora lyric sync to the screens"
      >
        <Captions size={11} /> Lyrics{isLive ? ' · LIVE' : ''}
      </button>
      {panel}
    </>
  );
};

function anchorPos(el: HTMLElement | null): React.CSSProperties {
  if (!el || typeof window === 'undefined') return { right: 12, bottom: 60 };
  const r = el.getBoundingClientRect();
  const right = Math.max(12, window.innerWidth - r.right);
  return r.top > window.innerHeight / 2 ? { right, bottom: window.innerHeight - r.top + 8 } : { right, top: r.bottom + 8 };
}

export default AmboLyricsControl;
