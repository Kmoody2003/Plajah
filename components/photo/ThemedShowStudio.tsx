// Themed Shows studio (Photos). Pick photos (from your library or a folder), choose a
// theme, write the dedication, add music, then:
//   • Live — the interactive show (tap any photo to bring it full screen),
//   • Scrub — step through the planned show frame by frame,
//   • Render — a finished video with or without music,
//   • Open in Fabula — every segment becomes an editable live-scene clip.

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, ChevronLeft, ChevronRight, Maximize2, Film, Download, FolderOpen, Music, Trash2,
  RotateCw, ArrowUp, ArrowDown, Sparkles, Loader2, X, Clapperboard, Images, ImagePlus, Upload, Wand2, Eye,
  SkipBack, SkipForward, Rewind, Type, EyeOff, Pencil, Crop, Save, HardDrive, FilePlus2, Clock3,
} from 'lucide-react';
import type { ShowPhoto, ShowSpec, ShowThemeId, ShowTrack, MusicMode, ClassicTransition } from '../../services/slideshow/types';
import { preparePhoto, type PrepInput } from '../../services/slideshow/photoPrep';
import { buildPlan } from '../../services/slideshow/planner';
import { ShowRuntime } from '../../services/slideshow/showRuntime';
import { renderShowVideo, probeTrackDurations } from '../../services/slideshow/renderVideo';
import { openShowInFabula } from '../../services/slideshow/fabulaShow';
import { directShow, applyDirection, type DirectorResult, type DirectorStyle } from '../../services/slideshow/director';
import { readPhotos, visionEstimate } from '../../services/slideshow/directorVision';
import { parseExifFromBuffer } from '../../services/exifService';
import { isHeicFile, convertImageBlob } from '../../services/crossover/imageConvert';
import { describeFileName, shownCaption } from '../../services/slideshow/fileNames';
import { isFullFrame } from '../../services/slideshow/common';
import { SHOW_TRANSITIONS, THEME_TRANSITIONS } from '../../services/slideshow/transitions';
import { saveLocal, listLocal, openLocal, saveToDrive, openFromDrive, driveSupported, type ShowProjectSummary } from '../../services/slideshow/projectStore';
import { adjustmentToCssFilter, type PhotoEditRecipe } from '../../services/photoEditingService';
import type { Photo } from '../../types';
// the platform photo editor (Photos → Develop), loaded only when a shot is edited
const PhotoEditPanel = lazy(() => import('../PhotoEditPanel'));
const ShowCropTool = lazy(() => import('./ShowCropTool'));

/** Bake a platform edit recipe (tone + straighten) into new pixels. */
async function bakeEdit(src: string, recipe: PhotoEditRecipe): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const a = recipe.adjustments;
  const rad = ((a.rotation || 0) * Math.PI) / 180;
  const W = img.naturalWidth, H = img.naturalHeight;
  // straighten without showing corners: scale up just enough to fill the frame
  const k = Math.abs(rad) > 1e-4 ? Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)) * Math.max(W / H, H / W) : 1;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.filter = adjustmentToCssFilter(a);
  g.translate(W / 2, H / 2);
  g.rotate(rad);
  g.scale(k, k);
  g.drawImage(img, -W / 2, -H / 2);
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.94));
  return URL.createObjectURL(blob);
}

/** EXIF DateTimeOriginal -> ms, or undefined. */
async function exifTime(f: File): Promise<number | undefined> {
  try {
    const ex = parseExifFromBuffer(await f.slice(0, 256 * 1024).arrayBuffer());
    const m = ex?.dateTaken?.match(/(\d{4})[:-](\d{2})[:-](\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
    if (!m) return undefined;
    const t = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)).getTime();
    return t > 0 && +m[1] > 1850 ? t : undefined;
  } catch { return undefined; }
}

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|hif|tiff?)$/i;

/** Every file inside dropped items, folders walked recursively. */
async function droppedFiles(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items || []).map((it) => (it as any).webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return Array.from(dt.files || []);
  const out: File[] = [];
  const walk = async (e: any): Promise<void> => {
    if (e.isFile) { out.push(await new Promise<File>((res, rej) => e.file(res, rej))); return; }
    if (e.isDirectory) {
      const reader = e.createReader();
      for (;;) {
        const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

export interface ShowSourcePhoto { id: string; url: string; title?: string; caption?: string; takenAt?: number; timeSource?: 'exif' | 'file' | 'user' }

interface Props {
  /** Photos from the owner's library to choose from (optional — a folder works too). */
  library?: ShowSourcePhoto[];
  onClose?: () => void;
  /** Start with these already chosen (e.g. an album). */
  initial?: ShowSourcePhoto[];
  /** The signed-in account that owns new shows (saved into the project for cloud sync). */
  owner?: { uid: string; handle?: string };
  /** Open this saved show (local project id) on mount. */
  openShowId?: string;
}

const THEMES: { id: ShowThemeId; name: string; blurb: string; tone: string }[] = [
  { id: 'backyard', name: 'Back Yard', blurb: 'Your photos printed as polaroids on twine and lantern lines in a real dusk back yard — swaying loops, close-ups, lifted to full page over drifting bokeh.', tone: 'from-orange-400/30 to-emerald-950/50' },
  { id: 'lantern-garden', name: 'Lantern Garden', blurb: 'Polaroids hanging from lanterns in a back yard at dusk. The camera drifts through, leans in, goes full page, and breathes back out.', tone: 'from-amber-500/30 to-indigo-900/40' },
  { id: 'classic', name: 'Classic', blurb: 'Full-screen photos with Ken Burns moves, a gentle depth parallax and graceful fades, drifts and wipes.', tone: 'from-zinc-400/20 to-zinc-900/40' },
];

const TRANSITIONS: (ClassicTransition | 'auto')[] = ['auto', 'crossfade', 'dip', 'drift', 'parallax-push', 'soft-wipe'];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const uid = () => Math.random().toString(36).slice(2, 10);

export default function ThemedShowStudio({ library = [], onClose, initial, owner, openShowId }: Props) {
  const [theme, setTheme] = useState<ShowThemeId>('backyard');
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
  const [transition, setTransition] = useState<string>('auto');
  const [xfSeconds, setXfSeconds] = useState(1.4);
  const [parallax, setParallax] = useState(0.6);
  const [mode, setMode] = useState<'live' | 'scrub'>('scrub');
  // parked just past the opening fade so the paused stage shows a real frame, not black
  const [scrubT, setScrubT] = useState(3);
  const [loading, setLoading] = useState<{ k: number; label: string } | null>(null);
  const [status, setStatus] = useState<{ viewed: number; total: number; paused: boolean; clock: number; photoIndex: number | null } | null>(null);
  const [render, setRender] = useState<{ k: number; label: string } | null>(null);
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Show Director: on by default, except the Back Yard theme (its plates already tell the story)
  const [directorOn, setDirectorOn] = useState(false);
  const [directorTouched, setDirectorTouched] = useState(false);
  const [style, setStyle] = useState<DirectorStyle>('story');
  const [direction, setDirection] = useState<DirectorResult | null>(null);
  const [directing, setDirecting] = useState(false);
  const [vision, setVision] = useState<{ done: number; total: number } | null>(null);
  const [askVision, setAskVision] = useState(false);
  const [planPlaying, setPlanPlaying] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ at: number; saving: boolean; error?: string } | null>(null);
  const [recent, setRecent] = useState<ShowProjectSummary[]>([]);
  const [openMenu, setOpenMenu] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rtRef = useRef<ShowRuntime | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const createdAt = useRef(Date.now());
  const showId = useRef(`show_${uid()}`);

  useEffect(() => { if (!directorTouched) setDirectorOn(theme !== 'backyard'); }, [theme, directorTouched]);

  // the director re-reads the album whenever photos, their understanding or the style change
  const directorKey = photos.map((p) => `${p.id}:${p.quarterTurns || 0}:${p.context ? 1 : 0}:${p.pinned ? 1 : 0}`).join('|') + style;
  useEffect(() => {
    if (!directorOn || !photos.length) { setDirection(null); return; }
    let alive = true;
    setDirecting(true);
    const t = setTimeout(async () => {
      try { const r = await directShow(photos, { style }); if (alive) setDirection(r); }
      catch (e) { console.warn('[director]', e); }
      finally { if (alive) setDirecting(false); }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [directorKey, directorOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const showPhotos = useMemo(() => (directorOn && direction ? applyDirection(photos, direction) : photos), [photos, direction, directorOn]);

  const spec: ShowSpec = useMemo(() => ({
    version: 1, id: showId.current, theme, title,
    dedication: { heading, name, dates, closing },
    photos: showPhotos,
    director: { enabled: directorOn && !!direction, style, notes: direction?.notes },
    music: { mode: musicMode, tracks, fitToMusic, volume: 0.8 },
    pace, wideEvery,
    transition: { style: transition, seconds: xfSeconds },
    parallax,
    createdAt: createdAt.current, updatedAt: Date.now(),
  }), [theme, title, heading, name, dates, closing, showPhotos, directorOn, direction, style, musicMode, tracks, fitToMusic, pace, wideEvery, transition, xfSeconds, parallax]);

  const plan = useMemo(() => buildPlan(spec), [spec]);

  // --- saving -------------------------------------------------------------------------
  // What gets saved: the owner's own photo order (the director re-reads it on open), every
  // setting, and the director switch — not the derived, directed order.
  const saveSpec: ShowSpec = useMemo(() => ({ ...spec, photos, director: { enabled: directorOn, style } }), [spec, photos, directorOn, style]);

  const hydrate = useCallback((s: ShowSpec) => {
    showId.current = s.id;
    createdAt.current = s.createdAt || Date.now();
    setTheme(s.theme); setTitle(s.title);
    setHeading(s.dedication.heading); setName(s.dedication.name); setDates(s.dedication.dates || ''); setClosing(s.dedication.closing);
    setPhotos(s.photos);
    setMusicMode(s.music.mode); setTracks(s.music.tracks); setFitToMusic(!!s.music.fitToMusic);
    setPace(s.pace); setWideEvery(s.wideEvery);
    setTransition(s.transition?.style || 'auto'); setXfSeconds(s.transition?.seconds ?? 1.4); setParallax(s.parallax ?? 0.6);
    setDirectorTouched(true); setDirectorOn(!!s.director?.enabled); setStyle(s.director?.style || 'story');
    setSelectedId(null); setVideo(null); setScrubT(3);
  }, []);

  const openSaved = async (id: string) => {
    setOpenMenu(false);
    setHydrating(true);
    try { const { spec: s, file } = await openLocal(id); hydrate(s); setSaved({ at: file.savedAt, saving: false }); }
    catch (e: any) { setMsg(e?.message || 'Could not open that show.'); }
    finally { setHydrating(false); }
  };
  const openDrive = async () => {
    setOpenMenu(false);
    try { setHydrating(true); const { spec: s } = await openFromDrive(); hydrate(s); setMsg(`Opened "${s.title}" from your drive.`); }
    catch (e: any) { if (e?.name !== 'AbortError') setMsg(e?.message || 'Could not open that folder.'); }
    finally { setHydrating(false); }
  };
  const newShow = () => {
    setOpenMenu(false);
    showId.current = `show_${uid()}`; createdAt.current = Date.now();
    setPhotos([]); setTracks([]); setMusicMode('none'); setTitle('A life remembered'); setName(''); setDates('');
    setSaved(null); setSelectedId(null); setVideo(null);
  };
  const toDrive = async () => {
    try {
      setSaved((s) => ({ at: s?.at || 0, saving: true }));
      const r = await saveToDrive(saveSpec, owner);
      setSaved({ at: Date.now(), saving: false });
      setMsg(`Saved to your drive as the folder "${r.folder}" (${r.files} files).`);
    } catch (e: any) {
      setSaved((s) => (s ? { ...s, saving: false } : null));
      if (e?.name !== 'AbortError') setMsg(e?.message || 'Could not save to the drive.');
    }
  };

  useEffect(() => { void listLocal().then(setRecent); }, [saved?.at]);
  useEffect(() => { if (openShowId) void openSaved(openShowId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave to this device a moment after any change (photos must be prepped first)
  const saveKey = JSON.stringify({ ...saveSpec, updatedAt: 0 });
  useEffect(() => {
    if (!photos.length || prep || hydrating) return;
    const t = setTimeout(async () => {
      setSaved((s) => ({ at: s?.at || 0, saving: true }));
      try { const at = await saveLocal(saveSpec, owner); setSaved({ at, saving: false }); }
      catch (e: any) { setSaved((s) => ({ at: s?.at || 0, saving: false, error: e?.message || 'Autosave failed' })); }
    }, 1500);
    return () => clearTimeout(t);
  }, [saveKey, prep, hydrating]); // eslint-disable-line react-hooks/exhaustive-deps

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
        try {
          const p = await preparePhoto(inp);
          if (!p.caption) {
            // a descriptive file name becomes the description (still off until switched on)
            const d = describeFileName(inp.title);
            if (d) { p.caption = d; p.captionSource = 'filename'; }
          }
          out.push(p);
        } catch (e) { console.warn('[shows] prep failed', inp.src, e); }
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
    if (initial?.length) void addSources(initial.map((p) => ({ id: p.id, src: p.url, title: p.title, caption: p.caption, captionSource: 'typed' as const, takenAt: p.takenAt, timeSource: p.timeSource ?? ('file' as const) })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Folder, single, multi-select and drag-and-drop all land here. */
  const importFiles = useCallback(async (list: File[]) => {
    const imgs = list.filter((f) => /^image\//.test(f.type) || IMG_RE.test(f.name) || isHeicFile(f));
    if (!imgs.length) { setMsg(list.length ? 'No photos found there. Themed Shows takes JPEG, PNG, WebP and iPhone HEIC.' : null); return; }
    imgs.sort((a, b) => ((a as any).webkitRelativePath || a.name).localeCompare((b as any).webkitRelativePath || b.name, undefined, { numeric: true }));
    setPrep({ done: 0, total: imgs.length });
    const inputs: PrepInput[] = [];
    for (const f of imgs) {
      const shot = await exifTime(f);
      let blob: Blob = f;
      if (isHeicFile(f)) {
        try { blob = (await convertImageBlob(f, f.name, { target: 'jpg', quality: 0.92 })).blob; }
        catch { setMsg(`Couldn't read ${f.name} (HEIC).`); continue; }
      }
      inputs.push({
        id: `file_${(f as any).webkitRelativePath || f.name}_${f.size}_${f.lastModified}`,
        src: URL.createObjectURL(blob), title: f.name.replace(/\.[^.]+$/, ''),
        takenAt: shot ?? f.lastModified, timeSource: shot ? 'exif' : 'file',
        hint: { png: /png/i.test(f.type) || /\.png$/i.test(f.name), name: f.name },
      });
    }
    await addSources(inputs);
  }, [addSources]);
  const onFolder = (files: FileList | null) => { if (files) void importFiles(Array.from(files)); };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const all = await droppedFiles(e.dataTransfer);
    const audio = all.filter((f) => /^audio\//.test(f.type));
    if (audio.length) void addMusicFiles(audio);
    void importFiles(all.filter((f) => !/^audio\//.test(f.type)));
  };

  const runVision = async () => {
    setAskVision(false);
    setVision({ done: 0, total: photos.filter((p) => !p.context).length });
    try {
      const got = await readPhotos(photos, (done, total) => setVision({ done, total }));
      setPhotos((ps) => ps.map((p) => {
        const c = got.get(p.id);
        if (!c) return p;
        // what the picture shows becomes the description where there isn't one yet
        const graphic = c.kind === 'graphic' ? true : p.graphic;
        return !p.caption && c.caption ? { ...p, graphic, context: c, caption: c.caption, captionSource: 'picture' } : { ...p, graphic, context: c };
      }));
      setMsg(`Read ${got.size} photo${got.size === 1 ? '' : 's'}. The director now knows what is in them.`);
    } catch (e: any) {
      setMsg(e?.code === 'SIGN_IN_REQUIRED' ? 'Sign in to let the vision model read your photos.' : e?.message || 'The vision model is unavailable right now.');
    } finally { setVision(null); }
  };

  const onMusic = (files: FileList | null) => { if (files) void addMusicFiles(Array.from(files)); };
  const addMusicFiles = async (files: File[]) => {
    const add: ShowTrack[] = files.filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name))
      .map((f) => ({ id: uid(), title: f.name.replace(/\.[^.]+$/, ''), src: URL.createObjectURL(f) }));
    const probed = await probeTrackDurations({ ...spec, music: { ...spec.music, tracks: add } });
    setTracks((t) => [...t, ...probed.music.tracks]);
    if (musicMode === 'none') setMusicMode(add.length > 1 ? 'playlist' : 'loop');
  };

  const updatePhoto = (id: string, patch: Partial<ShowPhoto>) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const move = (id: string, d: number) => setPhotos((ps) => { const a = [...ps]; const i = a.findIndex((p) => p.id === id); const j = i + d; if (i < 0 || j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const removePhoto = (id: string) => { setPhotos((ps) => ps.filter((p) => p.id !== id)); if (selectedId === id) setSelectedId(null); setMenu(null); };
  /** Re-run smart prep on a photo (new pixels, new turn or framing) keeping the owner's choices. */
  const reprep = async (p: ShowPhoto, patch: Partial<PrepInput>) => {
    const next = await preparePhoto({ id: p.id, src: p.src, title: p.title, caption: p.caption, captionSource: p.captionSource, takenAt: p.takenAt, timeSource: p.timeSource, quarterTurns: p.quarterTurns, keepFraming: p.keepFraming, manualCrop: p.manualCrop, manualPolaroid: p.manualPolaroid, ...patch });
    updatePhoto(p.id, { ...next, caption: p.caption, captionSource: p.captionSource, showCaption: p.showCaption, dwellOverride: p.dwellOverride, context: p.context, pinned: p.pinned, fullFrame: p.fullFrame, fullScale: p.fullScale });
  };
  const applyEdit = async (id: string, recipe: PhotoEditRecipe) => {
    const p = photos.find((q) => q.id === id);
    if (!p) return;
    try { await reprep(p, { src: await bakeEdit(p.src, recipe) }); setMsg('Edit applied to the show.'); }
    catch { setMsg('Could not apply that edit to this photo.'); }
  };
  const applyCrop = async (id: string, r: { manualCrop?: import('../../services/slideshow/types').CropRect | null; manualPolaroid?: import('../../services/slideshow/types').CropRect | null; fullScale: number }) => {
    const p = photos.find((q) => q.id === id);
    if (!p) return;
    setCroppingId(null);
    // a new picture crop changes what the polaroid window is measured against: re-pick it unless set now
    const cropChanged = JSON.stringify(r.manualCrop ?? null) !== JSON.stringify(p.manualCrop ?? null);
    const pol = r.manualPolaroid ?? (cropChanged ? undefined : p.manualPolaroid);
    await reprep({ ...p, fullScale: r.fullScale }, { manualCrop: r.manualCrop ?? undefined, manualPolaroid: r.manualPolaroid === null ? undefined : pol, keepFraming: r.manualCrop ? false : p.keepFraming });
    updatePhoto(id, { fullScale: r.fullScale });
    setMsg('Crop and size applied.');
  };
  const toggleFraming = (id: string) => { const p = photos.find((q) => q.id === id); if (p) void reprep(p, { keepFraming: !p.keepFraming }); };
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openMenu]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', close); };
  }, [menu]);

  const rotate = async (id: string) => {
    const p = photos.find((q) => q.id === id);
    if (!p) return;
    const turned = await preparePhoto({ id: p.id, src: p.src, title: p.title, caption: p.caption, takenAt: p.takenAt, timeSource: p.timeSource, quarterTurns: ((p.quarterTurns || 0) + 1) % 4 });
    updatePhoto(id, { ...turned, dwellOverride: p.dwellOverride, context: p.context, pinned: p.pinned });
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
      rt.onPlanTime = (t, playing) => { setScrubT(t); setPlanPlaying(playing); };
      if (mode === 'live') rt.startLive(true);
      else { setPlanPlaying(false); await rt.seekPlan(Math.min(scrubT, rt.duration)); }
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

  // planned-show keys: space plays/pauses, arrows step shot to shot
  useEffect(() => {
    if (mode !== 'scrub') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const rt = rtRef.current;
      if (!rt) return;
      if (e.key === ' ') { e.preventDefault(); if (rt.planPlaying) rt.pausePlan(); else rt.playPlan(); }
      else if (e.key === 'ArrowRight') rt.stepPlan(1);
      else if (e.key === 'ArrowLeft') rt.stepPlan(-1);
      else if (e.key === 'Home') void rt.seekPlan(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const seek = (t: number) => { setScrubT(t); void rtRef.current?.seekPlan(t); };
  const togglePlan = () => { const rt = rtRef.current; if (!rt) return; if (rt.planPlaying) rt.pausePlan(); else rt.playPlan(scrubT); };

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
  const selIndex = selectedId ? showPhotos.findIndex((p) => p.id === selectedId) : -1;
  const sel = selIndex >= 0 ? showPhotos[selIndex] : null;
  const est = visionEstimate(photos.filter((p) => !p.context).length);

  return (
    <div className="relative flex flex-col gap-5 text-white"
      onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={onDrop}>
      {dragOver && (
        <div className="absolute inset-0 z-50 rounded-3xl border-2 border-dashed border-amber-200/80 bg-black/70 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Upload size={28} className="text-amber-200" />
          <div className="font-serif text-xl">Drop photos or a whole folder</div>
          <div className="text-xs text-white/60">Music files dropped here are added to the soundtrack.</div>
        </div>
      )}
      {/* header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/70"><Sparkles size={12} /> Themed Shows</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-transparent text-2xl font-serif outline-none border-b border-transparent focus:border-white/20 mt-1" aria-label="Show title" />
          <div className="text-xs text-white/40 mt-1">{photos.length} photos · {fmt(plan.duration)} planned · {plan.fullPage.length ? `${(plan.fullPage.reduce((a, b) => a + b, 0) / plan.fullPage.length).toFixed(1)}s full page each on average` : 'add photos to begin'}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {photos.length > 0 && (
            <span className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${saved?.error ? 'bg-red-500/15 text-red-200' : 'bg-white/5 text-white/55'}`}
              title={owner ? `Owned by ${owner.handle || owner.uid}. Saved on this device; cloud sync to the account comes next.` : 'Saved on this device only (not signed in).'}>
              <Save size={12} />
              {saved?.error ? saved.error : saved?.saving ? 'Saving…' : saved?.at ? `Saved on this device · ${new Date(saved.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet'}
            </span>
          )}
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setOpenMenu((v) => !v); void listLocal().then(setRecent); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs"><FolderOpen size={13} /> Open</button>
            {openMenu && (
              <div className="absolute right-0 mt-1 z-[310] w-72 max-h-80 overflow-y-auto py-1 rounded-xl bg-zinc-900 ring-1 ring-white/10 shadow-2xl text-xs" onClick={(e) => e.stopPropagation()}>
                <button onClick={newShow} className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2"><FilePlus2 size={13} /> New show</button>
                {driveSupported() && <button onClick={openDrive} className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2"><HardDrive size={13} /> Open a show folder from your drive…</button>}
                {recent.length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-white/35">On this device</div>}
                {recent.map((r) => (
                  <button key={r.id} onClick={() => void openSaved(r.id)} className={`w-full text-left px-3 py-2 hover:bg-white/10 ${r.id === showId.current ? 'text-amber-100' : ''}`}>
                    <div className="truncate">{r.title}</div>
                    <div className="text-[10px] text-white/40 flex items-center gap-1"><Clock3 size={10} /> {new Date(r.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {r.photos} photos · {r.theme}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {driveSupported() && <button onClick={toDrive} disabled={!photos.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs" title="Write the whole show (settings, photos, music) as a folder on your drive"><HardDrive size={13} /> Save to drive</button>}
          {onClose && <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10" aria-label="Close"><X size={16} /></button>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        {/* stage */}
        <div className="flex flex-col gap-3 min-w-0">
          <div ref={stageRef} className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden ring-1 ring-white/10">
            <div ref={hostRef} className="absolute inset-0" />
            {!photos.length && !prep && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-sm p-6 text-center">
                <ImagePlus size={30} className="text-amber-200/80" />
                <div className="font-serif text-xl text-white/90">Bring the photos in</div>
                <div className="text-white/50 text-xs max-w-sm">Drag photos or a whole folder here, or choose them below. Each photo is turned upright, its faces found and its tone gently fixed.</div>
                <div className="flex flex-wrap justify-center gap-2">
                  <ImportButtons onFiles={onFolder} />
                  {library.length > 0 && <button onClick={() => setPicker(true)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs"><Images size={14} /> From my Photos</button>}
                </div>
                {recent.length > 0 && (
                  <div className="flex flex-col items-center gap-1.5 mt-1">
                    <div className="text-[10px] uppercase tracking-widest text-white/35">Continue a show</div>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {recent.slice(0, 4).map((r) => <button key={r.id} onClick={() => void openSaved(r.id)} className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs">{r.title} · {r.photos}</button>)}
                    </div>
                  </div>
                )}
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
                <StageBtn onClick={fullscreen} label="Full screen"><Maximize2 size={14} /></StageBtn>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex p-1 bg-white/5 rounded-full">
              {(['scrub', 'live'] as const).map((m) => (
                <button key={m} onClick={() => { rtRef.current?.stopLive(); setPlanPlaying(false); setMode(m); }} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${mode === m ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>
                  {m === 'live' ? 'Live · interactive' : 'Show · timeline'}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-white/40">{mode === 'live' ? `Tap or click any ${theme !== 'classic' ? 'polaroid' : 'side'} to bring it full screen · ← → · space pauses · Esc steps back` : 'The show exactly as it renders · space plays · ← → shot to shot'}</span>
          </div>

          {/* transport */}
          <div className="flex flex-col gap-1.5 p-2.5 rounded-2xl bg-white/[0.04] ring-1 ring-white/5">
            <div className="flex items-center gap-1.5">
              {mode === 'scrub' ? (<>
                <TransportBtn onClick={() => seek(0)} label="Back to start (Home)" disabled={!photos.length}><Rewind size={15} /></TransportBtn>
                <TransportBtn onClick={() => rtRef.current?.stepPlan(-1)} label="Previous shot (←)" disabled={!photos.length}><SkipBack size={15} /></TransportBtn>
                <button onClick={togglePlan} disabled={!photos.length || !!loading} aria-label={planPlaying ? 'Pause (space)' : 'Play (space)'} title={planPlaying ? 'Pause (space)' : 'Play (space)'}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40">{planPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}</button>
                <TransportBtn onClick={() => rtRef.current?.stepPlan(1)} label="Next shot (→)" disabled={!photos.length}><SkipForward size={15} /></TransportBtn>
                <span className="ml-2 font-mono text-xs tabular-nums text-white/80">{fmt(scrubT)} <span className="text-white/35">/ {fmt(plan.duration)}</span></span>
                {(() => { const seg = plan.segments.find((s, k) => scrubT >= s.start && (k === plan.segments.length - 1 || scrubT < plan.segments[k + 1].start)); const ph = seg?.photoIndex != null ? showPhotos[seg.photoIndex] : null;
                  return <span className="ml-2 text-[11px] text-white/45 truncate">{seg ? (seg.kind === 'visit' ? `Photo ${seg.photoIndex! + 1} of ${showPhotos.length}${ph && shownCaption(ph) ? ` · ${shownCaption(ph)}` : ''}` : seg.kind === 'wide' ? 'Wide shot' : seg.kind === 'intro' ? 'Opening' : 'Closing') : ''}</span>; })()}
              </>) : (<>
                <TransportBtn onClick={() => rtRef.current?.liveKey('prev')} label="Previous photo (←)" disabled={!photos.length}><SkipBack size={15} /></TransportBtn>
                <button onClick={() => rtRef.current?.liveKey('pause')} disabled={!photos.length} aria-label="Pause or resume (space)" title="Pause or resume (space)"
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40">{status?.paused ? <Play size={16} className="ml-0.5" /> : <Pause size={16} />}</button>
                <TransportBtn onClick={() => rtRef.current?.liveKey('next')} label="Next photo (→)" disabled={!photos.length}><SkipForward size={15} /></TransportBtn>
                <span className="ml-2 font-mono text-xs tabular-nums text-white/80">{fmt(status?.clock || 0)}</span>
                {status && <span className="ml-2 text-[11px] text-amber-100/80">{status.viewed}/{status.total} seen full page</span>}
              </>)}
              <span className="ml-auto" />
              <TransportBtn onClick={fullscreen} label="Full screen"><Maximize2 size={15} /></TransportBtn>
            </div>
            {mode === 'scrub' && (
              <div className="relative h-8 select-none">
                {/* segment timeline: opening, each photo, wide shots, closing */}
                <div className="absolute inset-x-0 top-1 h-5 rounded overflow-hidden bg-black/30">
                  {plan.segments.map((s, k) => {
                    const next = plan.segments[k + 1];
                    const len = (next ? next.start : plan.duration) - s.start;
                    return (
                      <div key={s.id} title={s.kind === 'visit' ? `Photo ${s.photoIndex! + 1}` : s.kind}
                        className={`absolute top-0 h-full border-l border-black/60 ${s.kind === 'visit' ? (s.chapter ? 'bg-amber-200/55' : 'bg-amber-200/35') : s.kind === 'wide' ? 'bg-sky-300/45' : 'bg-white/25'}`}
                        style={{ left: `${(s.start / plan.duration) * 100}%`, width: `${(len / plan.duration) * 100}%` }} />
                    );
                  })}
                  <div className="absolute top-0 h-full w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] pointer-events-none" style={{ left: `${(Math.min(scrubT, plan.duration) / Math.max(0.01, plan.duration)) * 100}%` }} />
                </div>
                <input type="range" min={0} max={plan.duration} step={1 / 30} value={Math.min(scrubT, plan.duration)} onChange={(e) => seek(+e.target.value)}
                  className="absolute inset-x-0 top-0 h-7 w-full opacity-0 cursor-pointer" aria-label="Show timeline" />
              </div>
            )}
          </div>

          {/* photo strip */}
          <div className="flex items-center gap-2 flex-wrap">
            <ImportButtons onFiles={onFolder} compact />
            {library.length > 0 && <button onClick={() => setPicker(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs"><Images size={14} /> From my Photos</button>}
            <span className="text-[11px] text-white/30">or drag photos or a folder anywhere here</span>
            {photos.length > 0 && <button onClick={() => { setPhotos([]); setSelectedId(null); }} className="text-xs text-white/40 hover:text-white ml-auto">Clear all</button>}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 items-end">
            {showPhotos.map((p, i) => {
              const newEvent = directorOn && !!direction && !!p.event && p.event !== showPhotos[i - 1]?.event;
              return (
                <React.Fragment key={p.id}>
                  {newEvent && i > 0 && <div className="shrink-0 self-stretch w-px bg-amber-200/30 mx-1" />}
                  <div className="shrink-0 flex flex-col gap-1">
                    {newEvent && p.eventLabel ? <div className="text-[9px] text-amber-100/70 whitespace-nowrap max-w-[10rem] truncate">{p.eventLabel}</div> : <div className="h-[13px]" />}
                    <div className="relative group">
                    <button onClick={() => setSelectedId(p.id)} onContextMenu={(e) => { e.preventDefault(); setSelectedId(p.id); setMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
                      className={`relative w-20 h-20 rounded-lg overflow-hidden ring-2 ${selectedId === p.id ? 'ring-amber-200' : 'ring-transparent'}`} title={p.context?.caption || shownCaption(p) || `Photo ${i + 1} · right-click for options`}>
                      <img src={p.src} alt="" className="w-full h-full object-cover" style={{ transform: `rotate(${(p.quarterTurns || 0) * 90}deg)` }} />
                      {directorOn && p.role && p.role !== 'moment' && <span className="absolute top-0.5 left-0.5 text-[8px] uppercase tracking-wider bg-black/60 rounded px-1">{p.role}</span>}
                      {p.showCaption && p.caption && <span className="absolute top-0.5 right-0.5 bg-amber-200 text-black rounded p-0.5" title={p.caption}><Type size={9} /></span>}
                      {isFullFrame(p) && <span className="absolute bottom-4 left-0.5 text-[8px] uppercase tracking-wider bg-sky-300 text-black rounded px-1" title="Shown whole, full screen (never cropped into a print)">Full</span>}
                      {p.trim && !p.keepFraming && <span className="absolute bottom-4 right-0.5 bg-black/70 rounded p-0.5" title={p.trimReason === 'screenshot' ? 'Screenshot: cropped to the photo inside' : 'Black/white borders trimmed'}><Crop size={9} /></span>}
                      <span className="absolute bottom-0 inset-x-0 text-[9px] bg-black/60 text-center">{plan.fullPage[i]?.toFixed(1)}s{p.faces ? ` · ${p.faces}☺` : ''}</span>
                    </button>
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(p.id); }} aria-label="Edit photo" title="Edit photo" className="p-1 rounded bg-black/75 hover:bg-black text-white"><Pencil size={11} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setCroppingId(p.id); }} aria-label="Crop and scale" title="Crop and scale" className="p-1 rounded bg-black/75 hover:bg-black text-white"><Crop size={11} /></button>
                      <button onClick={(e) => { e.stopPropagation(); removePhoto(p.id); }} aria-label="Remove from show" title="Remove from show" className="p-1 rounded bg-black/75 hover:bg-red-600 text-white"><Trash2 size={11} /></button>
                    </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          {sel && selectedId && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white/5 text-xs">
              <span className="text-white/50">Photo {selIndex + 1}{sel.eventLabel && directorOn ? ` · ${sel.eventLabel}` : ''}</span>
              {sel.context?.caption && <span className="w-full text-white/40 italic">{sel.context.caption}</span>}
              <div className="w-full flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 shrink-0" title="Show this description on the shot">
                  <input type="checkbox" checked={!!sel.showCaption} disabled={!sel.caption?.trim()} onChange={(e) => updatePhoto(selectedId, { showCaption: e.target.checked })} />
                  <Type size={12} /> Show description
                </label>
                <input placeholder={sel.context?.caption ? `e.g. ${sel.context.caption}` : 'Type a description for this shot'} value={sel.caption || ''}
                  onChange={(e) => updatePhoto(selectedId, { caption: e.target.value, captionSource: 'typed', showCaption: e.target.value.trim() ? (sel.captionSource === 'typed' || !sel.caption ? true : sel.showCaption) : false })}
                  className="flex-1 min-w-[180px] bg-black/30 rounded px-2 py-1.5 outline-none" />
                {sel.caption && sel.captionSource && <span className="text-[10px] text-white/40 shrink-0">{sel.captionSource === 'filename' ? 'from the file name' : sel.captionSource === 'picture' ? 'from the picture' : 'typed'}</span>}
                {sel.context?.caption && sel.caption !== sel.context.caption && <button onClick={() => updatePhoto(selectedId, { caption: sel.context!.caption, captionSource: 'picture' })} className="text-[10px] text-amber-100/80 hover:text-amber-100 shrink-0">Use what the picture shows</button>}
              </div>
              <label className="flex items-center gap-1">Full page
                <input type="number" min={2} max={20} step={0.5} value={sel.dwellOverride ?? +(plan.fullPage[selIndex] || 5).toFixed(1)} onChange={(e) => updatePhoto(selectedId, { dwellOverride: +e.target.value })} className="w-14 bg-black/30 rounded px-1 py-1" />s
              </label>
              {sel.dwellOverride != null && <button onClick={() => updatePhoto(selectedId, { dwellOverride: undefined })} className="text-white/50 hover:text-white">auto</button>}
              <IconBtn onClick={() => rotate(selectedId)} label="Rotate 90°"><RotateCw size={13} /></IconBtn>
              <IconBtn onClick={() => setEditingId(selectedId)} label="Edit photo"><Pencil size={13} /></IconBtn>
              <IconBtn onClick={() => setCroppingId(selectedId)} label="Crop and scale"><Crop size={13} /></IconBtn>
              {(sel.trim || sel.keepFraming) && (
                <label className="flex items-center gap-1.5" title={sel.trimReason === 'screenshot' ? 'A phone screenshot: cropped to the photo inside (status bar and app chrome removed)' : 'Black or white borders were trimmed'}>
                  <input type="checkbox" checked={!sel.keepFraming} onChange={() => toggleFraming(selectedId)} />
                  {sel.trimReason === 'screenshot' ? 'Crop screenshot' : 'Trim borders'}
                </label>
              )}
              <label className="flex items-center gap-1.5" title="Graphics, posters and covers are shown whole, scaled to fit 16:9, never cropped into a polaroid">
                <input type="checkbox" checked={isFullFrame(sel)} onChange={(e) => updatePhoto(selectedId, { fullFrame: e.target.checked })} />
                Full screen{sel.graphic && sel.fullFrame == null ? ' (graphic detected)' : ''}
              </label>
              {directorOn
                ? <button onClick={() => updatePhoto(selectedId, { pinned: !sel.pinned })} className={`px-2 py-1 rounded ${sel.pinned ? 'bg-amber-200 text-black' : 'bg-black/30'}`} title="The director closes the show on a pinned portrait">{sel.pinned ? 'Closing photo ✓' : 'Close on this'}</button>
                : <>
                  <IconBtn onClick={() => move(selectedId, -1)} label="Earlier"><ArrowUp size={13} /></IconBtn>
                  <IconBtn onClick={() => move(selectedId, 1)} label="Later"><ArrowDown size={13} /></IconBtn>
                </>}
              <IconBtn onClick={() => { setPhotos((ps) => ps.filter((p) => p.id !== selectedId)); setSelectedId(null); }} label="Remove"><Trash2 size={13} /></IconBtn>
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

          <Section title="Director">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2"><Wand2 size={14} className="text-amber-200" /> Film director</span>
              <input type="checkbox" checked={directorOn} onChange={(e) => { setDirectorTouched(true); setDirectorOn(e.target.checked); }} aria-label="Film director" />
            </label>
            <div className="text-[11px] text-white/45 leading-snug">
              {directorOn
                ? 'Finds the events in your photos, orders them for feeling, opens each scene wide, ends it on its strongest moment and closes the show on the best portrait.'
                : theme === 'backyard' ? 'Off for Back Yard by default: photos play in the order you chose. Turn it on to let the director shape the show.' : 'Off: photos play in the order you chose.'}
            </div>
            {directorOn && (<>
              <div className="flex p-1 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest">
                {(['story', 'feeling'] as DirectorStyle[]).map((s) => (
                  <button key={s} onClick={() => setStyle(s)} className={`flex-1 py-1.5 rounded-full ${style === s ? 'bg-white text-black' : 'text-white/50'}`}>{s === 'story' ? 'Life story' : 'For feeling'}</button>
                ))}
              </div>
              {directing && <div className="flex items-center gap-2 text-[11px] text-white/50"><Loader2 size={12} className="animate-spin" /> Reading the album…</div>}
              {direction && !directing && (
                <div className="flex flex-col gap-1 text-[11px] text-white/60">
                  {direction.notes.map((n, k) => <div key={k}>· {n}</div>)}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {direction.events.filter((e) => e.label).map((e) => <span key={e.id} className="px-2 py-0.5 rounded-full bg-amber-200/10 text-amber-100/80">{e.label} · {e.photos.length}</span>)}
                  </div>
                </div>
              )}
              <div className="border-t border-white/5 pt-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs"><Eye size={13} className="text-white/50" /> Understand what is in each photo</div>
                <div className="text-[11px] text-white/40 leading-snug">Dates, faces and look are read on this device. A vision model can also read occasions, places and mood, so the events and the order follow what is actually happening.</div>
                {vision ? <div className="flex items-center gap-2 text-[11px]"><Loader2 size={12} className="animate-spin" /> Reading {vision.done}/{vision.total}…</div>
                  : askVision ? (
                    <div className="flex flex-col gap-2 p-2 rounded-lg bg-black/30 text-[11px]">
                      <div>Sends {photos.filter((p) => !p.context).length} small thumbnails (384 px) to Google Gemini through Plajah. About {est.usd != null ? `$${Math.max(0.001, est.usd).toFixed(3)}` : 'a fraction of a cent'} and ~{est.seconds}s. Nothing else leaves this device.</div>
                      <div className="flex gap-2"><button onClick={runVision} className="px-3 py-1 rounded-full bg-white text-black font-bold">Read them</button><button onClick={() => setAskVision(false)} className="px-3 py-1 rounded-full bg-white/10">Not now</button></div>
                    </div>
                  ) : <button disabled={!photos.some((p) => !p.context)} onClick={() => setAskVision(true)} className="self-start px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs">{photos.length && !photos.some((p) => !p.context) ? 'All photos read ✓' : 'Read photos with a vision model…'}</button>}
              </div>
            </>)}
          </Section>

          <Section title="Descriptions">
            {(() => {
              const withText = photos.filter((p) => p.caption?.trim());
              const fromName = withText.filter((p) => p.captionSource === 'filename').length;
              const fromPic = withText.filter((p) => p.captionSource === 'picture').length;
              const typed = withText.length - fromName - fromPic;
              const shown = photos.filter((p) => shownCaption(p)).length;
              return (<>
                <div className="text-[11px] text-white/45 leading-snug">Off on every shot unless you turn it on. File names never show. A description can be typed, taken from a descriptive file name, or read from the picture.</div>
                <div className="text-[11px] text-white/60">{withText.length ? `${withText.length} of ${photos.length} have one (${[typed && `${typed} typed`, fromName && `${fromName} from file names`, fromPic && `${fromPic} from the picture`].filter(Boolean).join(', ')}) · ${shown} shown` : 'No descriptions yet. Select a shot to type one.'}</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setPhotos((ps) => ps.map((p) => (p.captionSource === 'filename' ? { ...p, caption: undefined, captionSource: undefined, showCaption: false } : p)))} disabled={!fromName}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-[11px]"><EyeOff size={12} /> Remove file-name captions</button>
                  <button onClick={() => setPhotos((ps) => ps.map((p) => (p.caption?.trim() ? { ...p, showCaption: true } : p)))} disabled={!withText.length}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-[11px]">Show all</button>
                  <button onClick={() => setPhotos((ps) => ps.map((p) => ({ ...p, showCaption: false })))} disabled={!shown}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-[11px]">Hide all</button>
                </div>
              </>);
            })()}
          </Section>

          <Section title="Dedication">
            <Field label="Opening line"><input value={heading} onChange={(e) => setHeading(e.target.value)} className={inputCls} /></Field>
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" className={inputCls} /></Field>
            <Field label="Dates"><input value={dates} onChange={(e) => setDates(e.target.value)} placeholder="1948 – 2026" className={inputCls} /></Field>
            <Field label="Closing line"><input value={closing} onChange={(e) => setClosing(e.target.value)} className={inputCls} /></Field>
          </Section>

          <Section title="Pace">
            <Field label={`Pace ${pace.toFixed(2)}× ${pace >= 1.15 ? '(unhurried)' : pace <= 0.9 ? '(brisk)' : ''}`}><input type="range" min={0.7} max={1.6} step={0.05} value={pace} onChange={(e) => setPace(+e.target.value)} className="w-full" /></Field>
            {theme !== 'classic' && (
              <Field label={`Wide shot every ${wideEvery} photos`}><input type="range" min={3} max={12} step={1} value={wideEvery} onChange={(e) => setWideEvery(+e.target.value)} className="w-full" /></Field>
            )}
            {theme !== 'lantern-garden' && (<>
              <Field label="Transitions (Fabula library)">
                <select value={transition} onChange={(e) => setTransition(e.target.value as any)} className={inputCls}>
                  <option value="auto">Auto: matched to {THEMES.find((t) => t.id === theme)?.name} ({(THEME_TRANSITIONS[theme] || []).map(([id]) => SHOW_TRANSITIONS.find((x) => x.id === id)?.name).filter((v, k, a) => v && a.indexOf(v) === k).slice(0, 3).join(', ')})</option>
                  {theme === 'classic' && <optgroup label="Classic moves">{TRANSITIONS.filter((t) => t !== 'auto').map((t) => <option key={t} value={t}>{t.replace('-', ' ')}</option>)}</optgroup>}
                  {(['light', 'dissolve', 'motion', 'distort', 'graphic'] as const).map((fam) => (
                    <optgroup key={fam} label={fam[0].toUpperCase() + fam.slice(1)}>
                      {SHOW_TRANSITIONS.filter((t) => t.family === fam).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label={`Transition length ${xfSeconds.toFixed(1)}s`}><input type="range" min={0.4} max={4} step={0.1} value={xfSeconds} onChange={(e) => setXfSeconds(+e.target.value)} className="w-full" /></Field>
            </>)}
            {theme === 'classic' && (
              <Field label={`Depth parallax ${Math.round(parallax * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={parallax} onChange={(e) => setParallax(+e.target.value)} className="w-full" /></Field>
            )}
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

      {menu && (() => {
        const p = photos.find((q) => q.id === menu.id);
        if (!p) return null;
        const item = 'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2';
        return (
          <div className="fixed z-[320] min-w-[200px] py-1 rounded-xl bg-zinc-900 ring-1 ring-white/10 shadow-2xl text-xs" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 260) }} onClick={(e) => e.stopPropagation()} role="menu">
            <button role="menuitem" className={item} onClick={() => { setEditingId(p.id); setMenu(null); }}><Pencil size={12} /> Edit photo…</button>
            <button role="menuitem" className={item} onClick={() => { setCroppingId(p.id); setMenu(null); }}><Crop size={12} /> Crop &amp; scale…</button>
            <button role="menuitem" className={item} onClick={() => { void rotate(p.id); setMenu(null); }}><RotateCw size={12} /> Rotate 90°</button>
            {(p.trim || p.keepFraming) && <button role="menuitem" className={item} onClick={() => { toggleFraming(p.id); setMenu(null); }}><Crop size={12} /> {p.keepFraming ? 'Trim again' : 'Keep original framing'}</button>}
            <button role="menuitem" className={item} onClick={() => { updatePhoto(p.id, { fullFrame: !isFullFrame(p) }); setMenu(null); }}><Maximize2 size={12} /> {isFullFrame(p) ? 'Show as a print' : 'Full screen (no print)'}</button>
            {p.caption?.trim() && <button role="menuitem" className={item} onClick={() => { updatePhoto(p.id, { showCaption: !p.showCaption }); setMenu(null); }}><Type size={12} /> {p.showCaption ? 'Hide description' : 'Show description'}</button>}
            <div className="my-1 border-t border-white/10" />
            <button role="menuitem" className={`${item} text-red-300`} onClick={() => removePhoto(p.id)}><Trash2 size={12} /> Remove from show</button>
          </div>
        );
      })()}

      {croppingId && (() => {
        const p = photos.find((q) => q.id === croppingId);
        if (!p) return null;
        return <Suspense fallback={null}><ShowCropTool photo={p} onClose={() => setCroppingId(null)} onApply={(r) => void applyCrop(p.id, r)} /></Suspense>;
      })()}

      {editingId && (() => {
        const p = photos.find((q) => q.id === editingId);
        if (!p) return null;
        const asPhoto = { id: p.id, url: p.src, title: p.caption || '', timestamp: p.takenAt || Date.now(), ownerId: 'me', width: p.width, height: p.height } as Photo;
        return (
          <Suspense fallback={null}>
            <PhotoEditPanel photo={asPhoto} variant="drawer" onClose={() => setEditingId(null)} onApply={(recipe) => void applyEdit(p.id, recipe)} />
          </Suspense>
        );
      })()}

      {picker && (
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4" onClick={() => setPicker(false)}>
          <LibraryPicker library={library} chosen={libraryChosen} onDone={(picked) => {
            setPicker(false);
            void addSources(picked.map((p) => ({ id: p.id, src: p.url, title: p.title, caption: p.caption, captionSource: 'typed' as const, takenAt: p.takenAt, timeSource: p.timeSource ?? ('file' as const) })));
          }} />
        </div>
      )}
    </div>
  );
}

function ImportButtons({ onFiles, compact }: { onFiles: (f: FileList | null) => void; compact?: boolean }) {
  const cls = compact ? 'flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-xs' : 'flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black font-bold cursor-pointer text-xs';
  const cls2 = compact ? cls : 'flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer text-xs';
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { onFiles(e.target.files); e.target.value = ''; };
  return (<>
    <label className={cls}><FolderOpen size={14} /> Choose a folder
      <input type="file" multiple accept="image/*,.heic,.heif" className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} onChange={pick} />
    </label>
    <label className={cls2}><Images size={14} /> Select photos
      <input type="file" multiple accept="image/*,.heic,.heif" className="hidden" onChange={pick} />
    </label>
    <label className={cls2}><ImagePlus size={14} /> One photo
      <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={pick} />
    </label>
  </>);
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
function TransportBtn({ onClick, label, disabled, children }: { onClick: () => void; label: string; disabled?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 disabled:opacity-30">{children}</button>;
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
