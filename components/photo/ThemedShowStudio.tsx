// Themed Shows studio (Photos). Pick photos (from your library or a folder), choose a
// theme, write the dedication, add music, then:
//   • Live — the interactive show (tap any photo to bring it full screen),
//   • Scrub — step through the planned show frame by frame,
//   • Render — a finished video with or without music,
//   • Open in Fabula — every segment becomes an editable live-scene clip.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, ChevronLeft, ChevronRight, Maximize2, Film, Download, FolderOpen, Music, Trash2,
  RotateCw, ArrowUp, ArrowDown, Sparkles, Loader2, X, Clapperboard, Images,
} from 'lucide-react';
import type { ShowPhoto, ShowSpec, ShowThemeId, ShowTrack, MusicMode, ClassicTransition } from '../../services/slideshow/types';
import { preparePhoto, type PrepInput } from '../../services/slideshow/photoPrep';
import { buildPlan } from '../../services/slideshow/planner';
import { ShowRuntime } from '../../services/slideshow/showRuntime';
import { renderShowVideo, probeTrackDurations } from '../../services/slideshow/renderVideo';
import { openShowInFabula } from '../../services/slideshow/fabulaShow';

export interface ShowSourcePhoto { id: string; url: string; title?: string; caption?: string; takenAt?: number }

interface Props {
  /** Photos from the owner's library to choose from (optional — a folder works too). */
  library?: ShowSourcePhoto[];
  onClose?: () => void;
  /** Start with these already chosen (e.g. an album). */
  initial?: ShowSourcePhoto[];
}

const THEMES: { id: ShowThemeId; name: string; blurb: string; tone: string }[] = [
  { id: 'lantern-garden', name: 'Lantern Garden', blurb: 'Polaroids hanging from lanterns in a back yard at dusk. The camera drifts through, leans in, goes full page, and breathes back out.', tone: 'from-amber-500/30 to-indigo-900/40' },
  { id: 'classic', name: 'Classic', blurb: 'Full-screen photos with Ken Burns moves, a gentle depth parallax and graceful fades, drifts and wipes.', tone: 'from-zinc-400/20 to-zinc-900/40' },
];

const TRANSITIONS: (ClassicTransition | 'auto')[] = ['auto', 'crossfade', 'dip', 'drift', 'parallax-push', 'soft-wipe'];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const uid = () => Math.random().toString(36).slice(2, 10);

export default function ThemedShowStudio({ library = [], onClose, initial }: Props) {
  const [theme, setTheme] = useState<ShowThemeId>('lantern-garden');
  const [title, setTitle] = useState('A life remembered');
  const [heading, setHeading] = useState('In loving memory of');
  const [name, setName] = useState('');
  const [dates, setDates] = useState('');
  const [closing, setClosing] = useState('Forever in our hearts');
  const [photos, setPhotos] = useState<ShowPhoto[]>([]);
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(null);
  const [musicMode, setMusicMode] = useState<MusicMode>('none');
  const [tracks, setTracks] = useState<ShowTrack[]>([]);
  const [fitToMusic, setFitToMusic] = useState(false);
  const [pace, setPace] = useState(1.1);
  const [wideEvery, setWideEvery] = useState(6);
  const [transition, setTransition] = useState<ClassicTransition | 'auto'>('auto');
  const [xfSeconds, setXfSeconds] = useState(1.8);
  const [parallax, setParallax] = useState(0.6);
  const [mode, setMode] = useState<'live' | 'scrub'>('live');
  const [scrubT, setScrubT] = useState(0);
  const [loading, setLoading] = useState<{ k: number; label: string } | null>(null);
  const [status, setStatus] = useState<{ viewed: number; total: number; paused: boolean; clock: number; photoIndex: number | null } | null>(null);
  const [render, setRender] = useState<{ k: number; label: string } | null>(null);
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rtRef = useRef<ShowRuntime | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const createdAt = useRef(Date.now());
  const showId = useRef(`show_${uid()}`);

  const spec: ShowSpec = useMemo(() => ({
    version: 1, id: showId.current, theme, title,
    dedication: { heading, name, dates, closing },
    photos,
    music: { mode: musicMode, tracks, fitToMusic, volume: 0.8 },
    pace, wideEvery,
    transition: { style: transition, seconds: xfSeconds },
    parallax,
    createdAt: createdAt.current, updatedAt: Date.now(),
  }), [theme, title, heading, name, dates, closing, photos, musicMode, tracks, fitToMusic, pace, wideEvery, transition, xfSeconds, parallax]);

  const plan = useMemo(() => buildPlan(spec), [spec]);

  // --- photo intake + smart prep ------------------------------------------------------

  const addSources = useCallback(async (inputs: PrepInput[]) => {
    if (!inputs.length) return;
    setPrep({ done: 0, total: inputs.length });
    const out: ShowPhoto[] = [];
    let done = 0;
    const queue = [...inputs];
    const worker = async () => {
      while (queue.length) {
        const inp = queue.shift()!;
        try { out.push(await preparePhoto(inp)); } catch (e) { console.warn('[shows] prep failed', inp.src, e); }
        done++;
        setPrep({ done, total: inputs.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    // keep the order they were chosen in, then by capture date when known
    const order = new Map(inputs.map((x, i) => [x.id, i]));
    out.sort((a, b) => (a.takenAt && b.takenAt ? a.takenAt - b.takenAt : (order.get(a.id)! - order.get(b.id)!)));
    setPhotos((prev) => [...prev, ...out.filter((p) => !prev.some((q) => q.id === p.id))]);
    setPrep(null);
  }, []);

  useEffect(() => {
    if (initial?.length) void addSources(initial.map((p) => ({ id: p.id, src: p.url, title: p.title, caption: p.caption, takenAt: p.takenAt })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFolder = (files: FileList | null) => {
    if (!files) return;
    const imgs = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    imgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    void addSources(imgs.map((f) => ({ id: `file_${f.name}_${f.size}_${f.lastModified}`, src: URL.createObjectURL(f), takenAt: f.lastModified })));
  };

  const onMusic = async (files: FileList | null) => {
    if (!files) return;
    const add: ShowTrack[] = Array.from(files).filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name))
      .map((f) => ({ id: uid(), title: f.name.replace(/\.[^.]+$/, ''), src: URL.createObjectURL(f) }));
    const probed = await probeTrackDurations({ ...spec, music: { ...spec.music, tracks: add } });
    setTracks((t) => [...t, ...probed.music.tracks]);
    if (musicMode === 'none') setMusicMode(add.length > 1 ? 'playlist' : 'loop');
  };

  const updatePhoto = (i: number, patch: Partial<ShowPhoto>) => setPhotos((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const move = (i: number, d: number) => setPhotos((ps) => { const a = [...ps]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const rotate = async (i: number) => {
    const p = photos[i];
    const turned = await preparePhoto({ id: p.id, src: p.src, title: p.title, caption: p.caption, takenAt: p.takenAt, quarterTurns: ((p.quarterTurns || 0) + 1) % 4 });
    updatePhoto(i, { ...turned, dwellOverride: p.dwellOverride });
  };

  // --- runtime (live / scrub) --------------------------------------------------------

  const specKey = JSON.stringify({ ...spec, updatedAt: 0, createdAt: 0 });
  useEffect(() => {
    const host = hostRef.current, stage = stageRef.current;
    if (!host || !stage || !photos.length) return;
    let alive = true;
    const t = setTimeout(async () => {
      rtRef.current?.dispose();
      // fresh canvas per runtime so a new WebGL context never fights the old one
      host.replaceChildren();
      const fresh = document.createElement('canvas');
      fresh.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
      host.appendChild(fresh);
      const w = Math.max(320, stage.clientWidth), h = Math.round(w * 9 / 16);
      const rt = new ShowRuntime(fresh, spec, { width: w, height: h });
      rtRef.current = rt;
      (window as any).__plajahShow = { rt, spec }; // debug handle (lab + support)
      setLoading({ k: 0, label: 'Building the scene' });
      await rt.load((k, label) => alive && setLoading({ k, label }));
      if (!alive) return;
      setLoading(null);
      rt.onStatus = (s) => setStatus(s);
      if (mode === 'live') rt.startLive(true);
      else await rt.frame(Math.min(scrubT, rt.duration));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [specKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { rtRef.current?.dispose(); rtRef.current = null; }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => {
      const rt = rtRef.current;
      if (!rt) return;
      const full = document.fullscreenElement === stage;
      const w = full ? window.innerWidth : Math.max(320, stage.clientWidth);
      const h = full ? window.innerHeight : Math.round(w * 9 / 16);
      rt.resize(w, h);
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (mode === 'scrub' && rtRef.current && !loading) void rtRef.current.frame(Math.min(scrubT, rtRef.current.duration));
  }, [scrubT, mode, loading]);

  const fullscreen = () => { const s = stageRef.current; if (!s) return; if (document.fullscreenElement) void document.exitFullscreen(); else void s.requestFullscreen?.(); };

  // --- render + Fabula -------------------------------------------------------------

  const doRender = async (res: 1080 | 720, withMusic: boolean, format: 'mp4' | 'webm') => {
    if (!photos.length) return;
    rtRef.current?.stopLive();
    const ac = new AbortController();
    abortRef.current = ac;
    setRender({ k: 0, label: 'Starting' });
    setVideo(null);
    try {
      const blob = await renderShowVideo(spec, {
        width: res === 1080 ? 1920 : 1280, height: res === 1080 ? 1080 : 720, fps: 30, format, withMusic,
        signal: ac.signal, onProgress: (k, label) => setRender({ k, label }),
      });
      const fname = `${(title || 'show').replace(/[^\w-]+/g, '_')}.${format}`;
      setVideo({ url: URL.createObjectURL(blob), name: fname });
    } catch (e: any) {
      setMsg(e?.name === 'AbortError' ? 'Render cancelled.' : (e?.message || 'Render failed.'));
    } finally {
      setRender(null);
      abortRef.current = null;
      if (mode === 'live') rtRef.current?.startLive(true);
    }
  };

  const toFabula = async () => {
    if (!photos.length) return;
    rtRef.current?.stopLive();
    try { await openShowInFabula(spec); setMsg('Opened in Fabula — each segment is an editable live-scene clip on V1.'); }
    catch (e: any) { setMsg(e?.message || 'Could not open Fabula.'); }
  };

  const libraryChosen = new Set(photos.map((p) => p.id));
  const sel = selected != null ? photos[selected] : null;

  return (
    <div className="flex flex-col gap-5 text-white">
      {/* header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/70"><Sparkles size={12} /> Themed Shows</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-transparent text-2xl font-serif outline-none border-b border-transparent focus:border-white/20 mt-1" aria-label="Show title" />
          <div className="text-xs text-white/40 mt-1">{photos.length} photos · {fmt(plan.duration)} planned · {plan.fullPage.length ? `${(plan.fullPage.reduce((a, b) => a + b, 0) / plan.fullPage.length).toFixed(1)}s full page each on average` : 'add photos to begin'}</div>
        </div>
        {onClose && <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10" aria-label="Close"><X size={16} /></button>}
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        {/* stage */}
        <div className="flex flex-col gap-3 min-w-0">
          <div ref={stageRef} className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden ring-1 ring-white/10">
            <div ref={hostRef} className="absolute inset-0" />
            {!photos.length && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/50 text-sm">
                <Images size={28} />
                <div>Choose photos from your library or a folder to build the show.</div>
              </div>
            )}
            {(loading || prep) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-sm">
                <Loader2 className="animate-spin" size={20} />
                <div>{prep ? `Preparing photos ${prep.done}/${prep.total} — orienting, finding faces, gentle tone fix` : loading?.label}</div>
                {loading && <div className="w-48 h-1 bg-white/10 rounded"><div className="h-1 bg-amber-200/80 rounded" style={{ width: `${Math.round(loading.k * 100)}%` }} /></div>}
              </div>
            )}
            {mode === 'live' && status && !loading && (
              <div className="absolute left-3 bottom-3 flex items-center gap-2 text-[11px] bg-black/40 backdrop-blur rounded-full px-3 py-1.5 pointer-events-none">
                <span className="text-amber-100/90">{status.viewed}/{status.total} seen full page</span>
                {status.paused && <span className="text-white/60">· paused</span>}
              </div>
            )}
            {photos.length > 0 && (
              <div className="absolute right-3 bottom-3 flex items-center gap-1">
                {mode === 'live' && <>
                  <StageBtn onClick={() => rtRef.current?.liveKey('prev')} label="Previous photo"><ChevronLeft size={14} /></StageBtn>
                  <StageBtn onClick={() => rtRef.current?.liveKey('pause')} label="Pause or resume">{status?.paused ? <Play size={14} /> : <Pause size={14} />}</StageBtn>
                  <StageBtn onClick={() => rtRef.current?.liveKey('next')} label="Next photo"><ChevronRight size={14} /></StageBtn>
                </>}
                <StageBtn onClick={fullscreen} label="Full screen"><Maximize2 size={14} /></StageBtn>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex p-1 bg-white/5 rounded-full">
              {(['live', 'scrub'] as const).map((m) => (
                <button key={m} onClick={() => { rtRef.current?.stopLive(); setMode(m); }} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${mode === m ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>
                  {m === 'live' ? 'Live · interactive' : 'Scrub · planned show'}
                </button>
              ))}
            </div>
            {mode === 'live' && <span className="text-[11px] text-white/40">Tap or click any {theme === 'lantern-garden' ? 'polaroid' : 'side'} · ← → · space pauses · Esc steps back</span>}
          </div>
          {mode === 'scrub' && (
            <div className="flex flex-col gap-1">
              <input type="range" min={0} max={plan.duration} step={1 / 30} value={Math.min(scrubT, plan.duration)} onChange={(e) => setScrubT(+e.target.value)} className="w-full" aria-label="Show time" />
              <div className="relative h-5">
                {plan.segments.map((s) => (
                  <button key={s.id} onClick={() => setScrubT(s.start + 0.01)} title={s.id}
                    className={`absolute top-0 h-5 border-l border-black/50 text-[9px] overflow-hidden ${s.kind === 'visit' ? 'bg-amber-200/20' : s.kind === 'wide' ? 'bg-sky-300/20' : 'bg-white/15'}`}
                    style={{ left: `${(s.start / plan.duration) * 100}%`, width: `${(s.duration / plan.duration) * 100}%` }} />
                ))}
              </div>
              <div className="text-[11px] text-white/40">{fmt(scrubT)} / {fmt(plan.duration)}</div>
            </div>
          )}

          {/* photo strip */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-xs">
              <FolderOpen size={14} /> Add a folder
              <input type="file" multiple accept="image/*,.heic,.heif" className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => onFolder(e.target.files)} />
            </label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-xs">
              <Images size={14} /> Add photos
              <input type="file" multiple accept="image/*,.heic,.heif" className="hidden" onChange={(e) => onFolder(e.target.files)} />
            </label>
            {library.length > 0 && <button onClick={() => setPicker(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs"><Images size={14} /> From my Photos</button>}
            {photos.length > 0 && <button onClick={() => { setPhotos([]); setSelected(null); }} className="text-xs text-white/40 hover:text-white ml-auto">Clear all</button>}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {photos.map((p, i) => (
              <button key={p.id} onClick={() => setSelected(i)} className={`relative shrink-0 w-20 h-20 rounded-lg overflow-hidden ring-2 ${selected === i ? 'ring-amber-200' : 'ring-transparent'}`} title={p.title || `Photo ${i + 1}`}>
                <img src={p.src} alt="" className="w-full h-full object-cover" style={{ transform: `rotate(${(p.quarterTurns || 0) * 90}deg)` }} />
                <span className="absolute bottom-0 inset-x-0 text-[9px] bg-black/60 text-center">{plan.fullPage[i]?.toFixed(1)}s{p.faces ? ` · ${p.faces}☺` : ''}</span>
              </button>
            ))}
          </div>
          {sel && selected != null && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white/5 text-xs">
              <span className="text-white/50">Photo {selected + 1}</span>
              <input placeholder="Caption (hand-written on the polaroid)" value={sel.caption || ''} onChange={(e) => updatePhoto(selected, { caption: e.target.value })} className="flex-1 min-w-[180px] bg-black/30 rounded px-2 py-1.5 outline-none" />
              <label className="flex items-center gap-1">Full page
                <input type="number" min={2} max={20} step={0.5} value={sel.dwellOverride ?? +(plan.fullPage[selected] || 5).toFixed(1)} onChange={(e) => updatePhoto(selected, { dwellOverride: +e.target.value })} className="w-14 bg-black/30 rounded px-1 py-1" />s
              </label>
              {sel.dwellOverride != null && <button onClick={() => updatePhoto(selected, { dwellOverride: undefined })} className="text-white/50 hover:text-white">auto</button>}
              <IconBtn onClick={() => rotate(selected)} label="Rotate 90°"><RotateCw size={13} /></IconBtn>
              <IconBtn onClick={() => { move(selected, -1); setSelected(Math.max(0, selected - 1)); }} label="Earlier"><ArrowUp size={13} /></IconBtn>
              <IconBtn onClick={() => { move(selected, 1); setSelected(Math.min(photos.length - 1, selected + 1)); }} label="Later"><ArrowDown size={13} /></IconBtn>
              <IconBtn onClick={() => { setPhotos((ps) => ps.filter((_, k) => k !== selected)); setSelected(null); }} label="Remove"><Trash2 size={13} /></IconBtn>
            </div>
          )}
        </div>

        {/* settings */}
        <div className="flex flex-col gap-4">
          <Section title="Theme">
            <div className="grid gap-2">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => setTheme(t.id)} className={`text-left p-3 rounded-xl bg-gradient-to-br ${t.tone} ring-1 ${theme === t.id ? 'ring-amber-200' : 'ring-white/10 hover:ring-white/30'}`}>
                  <div className="font-serif text-base">{t.name}</div>
                  <div className="text-[11px] text-white/60 mt-1 leading-snug">{t.blurb}</div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Dedication">
            <Field label="Opening line"><input value={heading} onChange={(e) => setHeading(e.target.value)} className={inputCls} /></Field>
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" className={inputCls} /></Field>
            <Field label="Dates"><input value={dates} onChange={(e) => setDates(e.target.value)} placeholder="1948 – 2026" className={inputCls} /></Field>
            <Field label="Closing line"><input value={closing} onChange={(e) => setClosing(e.target.value)} className={inputCls} /></Field>
          </Section>

          <Section title="Pace">
            <Field label={`Pace ${pace.toFixed(2)}× ${pace >= 1.15 ? '(unhurried)' : pace <= 0.9 ? '(brisk)' : ''}`}><input type="range" min={0.7} max={1.6} step={0.05} value={pace} onChange={(e) => setPace(+e.target.value)} className="w-full" /></Field>
            {theme === 'lantern-garden' ? (
              <Field label={`Wide shot every ${wideEvery} photos`}><input type="range" min={3} max={12} step={1} value={wideEvery} onChange={(e) => setWideEvery(+e.target.value)} className="w-full" /></Field>
            ) : (<>
              <Field label="Transition">
                <select value={transition} onChange={(e) => setTransition(e.target.value as any)} className={inputCls}>
                  {TRANSITIONS.map((t) => <option key={t} value={t}>{t === 'auto' ? 'Auto (varied, gentle)' : t.replace('-', ' ')}</option>)}
                </select>
              </Field>
              <Field label={`Transition length ${xfSeconds.toFixed(1)}s`}><input type="range" min={0.6} max={3.5} step={0.1} value={xfSeconds} onChange={(e) => setXfSeconds(+e.target.value)} className="w-full" /></Field>
              <Field label={`Depth parallax ${Math.round(parallax * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={parallax} onChange={(e) => setParallax(+e.target.value)} className="w-full" /></Field>
            </>)}
          </Section>

          <Section title="Music">
            <div className="flex p-1 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest">
              {(['none', 'playlist', 'loop'] as MusicMode[]).map((m) => (
                <button key={m} onClick={() => setMusicMode(m)} className={`flex-1 py-1.5 rounded-full ${musicMode === m ? 'bg-white text-black' : 'text-white/50'}`}>{m}</button>
              ))}
            </div>
            <div className="text-[11px] text-white/40">{musicMode === 'loop' ? 'The first track repeats until every photo has had its time.' : musicMode === 'playlist' ? 'Tracks play in order, then start again if photos still need time.' : 'Silent — you can still add music later in Fabula.'}</div>
            {musicMode !== 'none' && (<>
              {tracks.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2 text-xs bg-black/20 rounded px-2 py-1.5">
                  <Music size={12} className="text-white/40" /><span className="flex-1 truncate">{t.title}</span><span className="text-white/40">{t.duration ? fmt(t.duration) : '…'}</span>
                  <button onClick={() => setTracks((ts) => ts.filter((_, k) => k !== i))} aria-label="Remove track" className="text-white/40 hover:text-white"><X size={12} /></button>
                </div>
              ))}
              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-xs">
                <Music size={13} /> Add music
                <input type="file" multiple accept="audio/*" className="hidden" onChange={(e) => onMusic(e.target.files)} />
              </label>
              {musicMode === 'playlist' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={fitToMusic} onChange={(e) => setFitToMusic(e.target.checked)} /> Fit photo timing to the playlist</label>}
            </>)}
          </Section>

          <Section title="Share">
            <div className="grid grid-cols-2 gap-2">
              <ActBtn onClick={() => doRender(1080, true, 'mp4')} disabled={!photos.length || !!render}><Film size={14} /> Render 1080p</ActBtn>
              <ActBtn onClick={() => doRender(720, true, 'mp4')} disabled={!photos.length || !!render}><Film size={14} /> Render 720p</ActBtn>
              <ActBtn onClick={() => doRender(1080, false, 'mp4')} disabled={!photos.length || !!render}><Film size={14} /> No music</ActBtn>
              <ActBtn onClick={toFabula} disabled={!photos.length}><Clapperboard size={14} /> Open in Fabula</ActBtn>
            </div>
            {render && (
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between"><span>{render.label}</span><button onClick={() => abortRef.current?.abort()} className="text-white/50 hover:text-white">Cancel</button></div>
                <div className="h-1 bg-white/10 rounded"><div className="h-1 bg-amber-200 rounded" style={{ width: `${Math.round(render.k * 100)}%` }} /></div>
              </div>
            )}
            {video && (
              <div className="flex flex-col gap-2">
                <video src={video.url} controls className="w-full rounded-lg" />
                <a href={video.url} download={video.name} className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white text-black text-xs font-bold"><Download size={14} /> Download {video.name}</a>
              </div>
            )}
            {msg && <div className="text-[11px] text-amber-100/80">{msg}</div>}
          </Section>
        </div>
      </div>

      {picker && (
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4" onClick={() => setPicker(false)}>
          <LibraryPicker library={library} chosen={libraryChosen} onDone={(picked) => {
            setPicker(false);
            void addSources(picked.map((p) => ({ id: p.id, src: p.url, title: p.title, caption: p.caption, takenAt: p.takenAt })));
          }} />
        </div>
      )}
    </div>
  );
}

function LibraryPicker({ library, chosen, onDone }: { library: ShowSourcePhoto[]; chosen: Set<string>; onDone: (p: ShowSourcePhoto[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  return (
    <div className="bg-zinc-950 rounded-2xl p-4 w-full max-w-4xl max-h-[85vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="font-serif text-lg">Choose photos</div>
        <div className="flex gap-2">
          <button onClick={() => setSel(new Set(library.filter((p) => !chosen.has(p.id)).map((p) => p.id)))} className="text-xs text-white/60 hover:text-white">Select all</button>
          <button onClick={() => onDone(library.filter((p) => sel.has(p.id)))} className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-bold">Add {sel.size}</button>
        </div>
      </div>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2 overflow-y-auto">
        {library.map((p) => {
          const on = sel.has(p.id), had = chosen.has(p.id);
          return (
            <button key={p.id} disabled={had} onClick={() => setSel((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
              className={`relative aspect-square rounded-lg overflow-hidden ring-2 ${on ? 'ring-amber-200' : 'ring-transparent'} ${had ? 'opacity-30' : ''}`}>
              <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-black/30 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-white/20';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/5">
      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-[11px] text-white/60">{label}{children}</label>;
}
function StageBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return <button onClick={onClick} aria-label={label} title={label} className="p-2 rounded-full bg-black/40 backdrop-blur hover:bg-black/60">{children}</button>;
}
function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return <button onClick={onClick} aria-label={label} title={label} className="p-1.5 rounded bg-black/30 hover:bg-black/50">{children}</button>;
}
function ActBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={disabled} className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs">{children}</button>;
}
