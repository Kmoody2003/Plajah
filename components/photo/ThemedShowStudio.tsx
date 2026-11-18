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
  SkipBack, SkipForward, Rewind, Type, EyeOff, Pencil, Crop, Save, HardDrive, FilePlus2, Clock3, ArrowLeftRight, CopyPlus,
  Cloud, Share2, Link2, Tv,
} from 'lucide-react';
import { Button, IconButton, Surface, Eyebrow, Chip, Input, Actions, AnchoredPopover } from '../ui';
import ShowTimeline, { type TimelineOps } from './show/ShowTimeline';
import LookPicker from './show/LookPicker';
import ShowPlayer from './show/ShowPlayer';
import { saveShowToAccount, listAccountShows, openAccountShow, publishShow, showLink, signedInUid, loadPublishedShow, type ShowRef } from '../../services/slideshow/cloudShows';
import type { CloudHead } from '../../services/creativeCloud/cloudStore';
import { needsBrandBug, BUG_FREE_FROM_USD } from '../../services/slideshow/brandBug';
import type { ShowPhoto, ShowSpec, ShowThemeId, ShowTrack, MusicMode, ClassicTransition, ShowLook } from '../../services/slideshow/types';
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
  /** Open this show for editing (account copy first, then the published copy). */
  openRef?: Pick<ShowRef, 'owner' | 'id'>;
  /** Called with the finished show when the person presses the finish button (shown only when set). */
  onDone?: (result: { spec: ShowSpec; ref?: ShowRef }) => void;
  /** Finish button label (default "Done"). */
  doneLabel?: string;
  /** Publish before onDone so the result carries a ShowRef anyone can play. */
  publishOnDone?: boolean;
  /** Where the studio was opened from, for the back control ("Back to Tela"). */
  returnLabel?: string;
}

const THEMES: { id: ShowThemeId; name: string; blurb: string; tone: string }[] = [
  { id: 'backyard', name: 'Back Yard', blurb: 'Your photos printed as polaroids on twine and lantern lines in a real dusk back yard — swaying loops, close-ups, lifted to full page over drifting bokeh.', tone: 'from-orange-400/30 to-emerald-950/50' },
  { id: 'lantern-garden', name: 'Lantern Garden', blurb: 'Polaroids hanging from lanterns in a back yard at dusk. The camera drifts through, leans in, goes full page, and breathes back out.', tone: 'from-amber-500/30 to-indigo-900/40' },
  { id: 'classic', name: 'Classic', blurb: 'Full-screen photos with Ken Burns moves, a gentle depth parallax and graceful fades, drifts and wipes.', tone: 'from-zinc-400/20 to-zinc-900/40' },
];

const TRANSITIONS: (ClassicTransition | 'auto')[] = ['auto', 'crossfade', 'dip', 'drift', 'parallax-push', 'soft-wipe'];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const uid = () => Math.random().toString(36).slice(2, 10);

export default function ThemedShowStudio({ library = [], onClose, initial, owner, openShowId, openRef, onDone, doneLabel = 'Done', publishOnDone, returnLabel }: Props) {
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
  const [openAnchor, setOpenAnchor] = useState<HTMLElement | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [clip, setClip] = useState<ShowPhoto[]>([]);
  const [look, setLook] = useState<ShowLook | undefined>(undefined);
  const [cloud, setCloud] = useState<{ at: number; busy: boolean; error?: string } | null>(null);
  const [accountShows, setAccountShows] = useState<CloudHead[]>([]);
  const [shared, setShared] = useState<{ ref: ShowRef; link: string } | null>(null);
  const [publishing, setPublishing] = useState<{ done: number; total: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [bug, setBug] = useState<boolean | null>(null);
  useEffect(() => { void needsBrandBug().then(setBug); }, []);
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
    look,
    music: { mode: musicMode, tracks, fitToMusic, volume: 0.8 },
    pace, wideEvery,
    transition: { style: transition, seconds: xfSeconds },
    parallax,
    createdAt: createdAt.current, updatedAt: Date.now(),
  }), [theme, title, heading, name, dates, closing, showPhotos, directorOn, direction, style, look, musicMode, tracks, fitToMusic, pace, wideEvery, transition, xfSeconds, parallax]);

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
    setLook(s.look); setSelection([]);
    setSelectedId(null); setVideo(null); setScrubT(3);
  }, []);

  const openSaved = async (id: string) => {
    setOpenAnchor(null);
    setHydrating(true);
    try { const { spec: s, file } = await openLocal(id); hydrate(s); setSaved({ at: file.savedAt, saving: false }); }
    catch (e: any) { setMsg(e?.message || 'Could not open that show.'); }
    finally { setHydrating(false); }
  };
  const openDrive = async () => {
    setOpenAnchor(null);
    try { setHydrating(true); const { spec: s } = await openFromDrive(); hydrate(s); setMsg(`Opened "${s.title}" from your drive.`); }
    catch (e: any) { if (e?.name !== 'AbortError') setMsg(e?.message || 'Could not open that folder.'); }
    finally { setHydrating(false); }
  };
  const newShow = () => {
    setOpenAnchor(null);
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

  useEffect(() => { void listLocal().then(setRecent); void listAccountShows().then(setAccountShows); }, [saved?.at]);
  const openFromAccount = async (id: string) => {
    setOpenAnchor(null);
    setHydrating(true);
    try { const got = await openAccountShow(id); if (got) { hydrate(got.spec); setCloud({ at: got.head.updatedAt, busy: false }); } }
    catch (e: any) { setMsg(e?.message || 'Could not open that show.'); }
    finally { setHydrating(false); }
  };
  const doPublish = async () => {
    setPublishing({ done: 0, total: 1 });
    try {
      const r = await publishShow(saveSpec, (done, total) => setPublishing({ done, total }));
      setShared({ ref: r, link: showLink(r) });
      setMsg('Published. Anyone with the link (or the post) can play it.');
    } catch (e: any) { setMsg(e?.code === 'SIGN_IN_REQUIRED' ? 'Sign in to share a show.' : e?.message || 'Could not publish the show.'); }
    finally { setPublishing(null); }
  };
  useEffect(() => {
    if (openShowId) void openSaved(openShowId);
    else if (openRef) void (async () => {
      setHydrating(true);
      try {
        // the owner's account copy is the source of truth; the published copy is the fallback
        const mine = openRef.owner === signedInUid() ? await openAccountShow(openRef.id).catch(() => null) : null;
        if (mine) { hydrate(mine.spec); setCloud({ at: mine.head.updatedAt, busy: false }); }
        else hydrate(await loadPublishedShow(openRef, true));
        if (openRef.owner === signedInUid()) setShared({ ref: { owner: openRef.owner, id: openRef.id }, link: showLink(openRef) });
      } catch (e: any) { setMsg(e?.message || 'Could not open that show.'); }
      finally { setHydrating(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- finishing (when another surface opened the studio) -----------------------------
  const [finishing, setFinishing] = useState<{ done: number; total: number } | null>(null);
  const finish = async () => {
    if (!onDone) return;
    if (!photos.length) { setMsg('Add some photos first.'); return; }
    if (prep) { setMsg('Still preparing photos — one moment.'); return; }
    setFinishing({ done: 0, total: 1 });
    try {
      const stored = signedInUid() ? (await saveShowToAccount(saveSpec)) || saveSpec : saveSpec;
      let ref: ShowRef | undefined = shared?.ref;
      if (publishOnDone || shared) {
        ref = await publishShow(saveSpec, (done, total) => setFinishing({ done, total }));
        setShared({ ref, link: showLink(ref) });
      }
      onDone({ spec: stored, ref });
    } catch (e: any) {
      setMsg(e?.code === 'SIGN_IN_REQUIRED' ? 'Sign in to share this show.' : e?.message || 'Could not finish the show.');
    } finally { setFinishing(null); }
  };

  // autosave to this device a moment after any change (photos must be prepped first)
  const saveKey = JSON.stringify({ ...saveSpec, updatedAt: 0 });
  useEffect(() => {
    if (!photos.length || prep || hydrating) return;
    const t = setTimeout(async () => {
      setSaved((s) => ({ at: s?.at || 0, saving: true }));
      try { const at = await saveLocal(saveSpec, owner); setSaved({ at, saving: false }); }
      catch (e: any) { setSaved((s) => ({ at: s?.at || 0, saving: false, error: e?.message || 'Autosave failed' })); }
      // and to the account, when signed in (every device; the local copy is only a cache)
      if (signedInUid()) {
        setCloud((c) => ({ at: c?.at || 0, busy: true }));
        try { await saveShowToAccount(saveSpec); setCloud({ at: Date.now(), busy: false }); }
        catch (e: any) { setCloud((c) => ({ at: c?.at || 0, busy: false, error: e?.message || 'Account save failed' })); }
      }
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
      const brandBug = await needsBrandBug();
      setBug(brandBug);
      const blob = await renderShowVideo(spec, {
        width: res === 1080 ? 1920 : 1280, height: res === 1080 ? 1080 : 720, fps: 30, format, withMusic, brandBug,
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

  // --- timeline editing ----------------------------------------------------------------
  // Edits act on the order on screen. With the director on that is its order, so a hand edit
  // takes the show over from the director (said plainly, one switch to give it back).
  const takeOver = () => {
    if (directorOn) { setDirectorTouched(true); setDirectorOn(false); setMsg('You arranged the shots by hand, so the director is off. Turn it on again to let it reorder.'); }
  };
  const byId = (id: string) => showPhotos.find((p) => p.id === id) || photos.find((p) => p.id === id);
  const dupOf = (p: ShowPhoto): ShowPhoto => ({ ...p, id: `${p.id.split('~')[0]}~${uid()}` });
  const ops: TimelineOps = {
    reorder: (ids) => { takeOver(); setPhotos(ids.map(byId).filter(Boolean) as ShowPhoto[]); },
    remove: (ids) => { const drop = new Set(ids); setPhotos((ps) => ps.filter((p) => !drop.has(p.id))); setSelection([]); setSelectedId(null); },
    duplicate: (ids) => {
      takeOver();
      const order = showPhotos.map((p) => p.id);
      const at = Math.max(...ids.map((id) => order.indexOf(id)));
      const copies = ids.map((id) => dupOf(byId(id)!));
      const list = showPhotos.slice();
      list.splice(at + 1, 0, ...copies);
      setPhotos(list);
      setSelection(copies.map((c) => c.id)); setSelectedId(copies[copies.length - 1].id);
    },
    copy: (ids) => { setClip(ids.map((id) => byId(id)!).filter(Boolean)); setMsg(`${ids.length} shot${ids.length > 1 ? 's' : ''} copied.`); },
    cut: (ids) => { setClip(ids.map((id) => byId(id)!).filter(Boolean)); ops.remove(ids); },
    paste: (afterId) => {
      if (!clip.length) return;
      takeOver();
      const list = showPhotos.slice();
      const at = afterId ? list.findIndex((p) => p.id === afterId) + 1 : list.length;
      const copies = clip.map(dupOf);
      list.splice(at, 0, ...copies);
      setPhotos(list);
      setSelection(copies.map((c) => c.id)); setSelectedId(copies[copies.length - 1].id);
    },
    swap: (a, b) => {
      takeOver();
      const list = showPhotos.slice();
      const i = list.findIndex((p) => p.id === a), j = list.findIndex((p) => p.id === b);
      if (i < 0 || j < 0) return;
      [list[i], list[j]] = [list[j], list[i]];
      setPhotos(list);
    },
    edit: (id) => setEditingId(id),
    crop: (id) => setCroppingId(id),
    rotate: (id) => void rotate(id),
    toggleFull: (id) => { const p = byId(id); if (p) updatePhoto(id, { fullFrame: !isFullFrame(p) }); },
    toggleCaption: (id) => { const p = byId(id); if (p) updatePhoto(id, { showCaption: !p.showCaption }); },
    canPaste: clip.length > 0,
  };
  const multi = selection.length > 1;

  return (
    <div className="relative flex flex-col gap-4" style={{ color: 'var(--text-primary)' }}
      onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={onDrop}>
      {dragOver && (
        <div className="absolute inset-0 z-50 rounded-sheet border-2 border-dashed border-[var(--pj-orange)] bg-black/70 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Upload size={28} className="text-brand-orange" />
          <div className="type-headline-sm">Drop photos or a whole folder</div>
          <div className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Music files dropped here are added to the soundtrack.</div>
        </div>
      )}

      {/* header */}
      <Surface level={2} shape="card" padded={false} className="flex items-center justify-between gap-3 flex-wrap px-5 py-3">
        <div className="min-w-0">
          <Eyebrow className="flex items-center gap-2"><Sparkles size={12} /> Themed Shows</Eyebrow>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Show title"
            className="type-headline-sm bg-transparent outline-none border-b border-transparent focus:border-[var(--m3-border-strong)] w-full max-w-[28rem]" />
          <div className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
            {photos.length} photos · {fmt(plan.duration)} planned{plan.fullPage.length ? ` · ${(plan.fullPage.reduce((a, b) => a + b, 0) / plan.fullPage.length).toFixed(1)}s full page on average` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {photos.length > 0 && (
            <Chip title={owner ? `Owned by ${owner.handle || owner.uid}. Saved on this device; cloud sync to the account comes next.` : 'Saved on this device only (not signed in).'}
              className={saved?.error ? '!text-[var(--pj-danger)]' : ''}>
              <Save size={12} className="inline mr-1.5 -mt-0.5" />
              {saved?.error ? saved.error : saved?.saving || cloud?.busy ? 'Saving…'
                : cloud?.at ? `Saved to your account · ${new Date(cloud.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : saved?.at ? `Saved on this device${signedInUid() ? '' : ' (sign in to sync)'} · ${new Date(saved.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet'}
            </Chip>
          )}
          <Button size="sm" variant="secondary" icon={<FolderOpen />} onClick={(e) => { const el = e.currentTarget as HTMLElement; setOpenAnchor((a) => (a ? null : el)); void listLocal().then(setRecent); }}>Open</Button>
          {driveSupported() && <Button size="sm" variant="ghost" icon={<HardDrive />} disabled={!photos.length} onClick={toDrive} title="Write the whole show (settings, photos, music) as a folder on your drive">Save to drive</Button>}
          {onDone && (
            <Button size="sm" variant="primary" icon={<Share2 />} loading={!!finishing} disabled={!photos.length || !!prep} onClick={() => void finish()}
              title={publishOnDone ? 'Save, publish and hand the show back' : 'Save and hand the show back'}>
              {finishing && finishing.total > 1 ? `Uploading ${finishing.done}/${finishing.total}…` : doneLabel}
            </Button>
          )}
          {onClose && (returnLabel
            ? <Button size="sm" variant="ghost" icon={<ChevronLeft />} onClick={onClose}>Back to {returnLabel}</Button>
            : <IconButton size="sm" variant="ghost" aria-label="Close" onClick={onClose}><X /></IconButton>)}
        </div>
      </Surface>
      {openAnchor && (
        <AnchoredPopover anchor={openAnchor} onClose={() => setOpenAnchor(null)} align="end" role="menu" className="pj-surface pj-surface--3 w-80 p-1.5">
          <Button size="sm" variant="ghost" fullWidth icon={<FilePlus2 />} className="!justify-start" onClick={() => { setOpenAnchor(null); newShow(); }}>New show</Button>
          {driveSupported() && <Button size="sm" variant="ghost" fullWidth icon={<HardDrive />} className="!justify-start" onClick={() => { setOpenAnchor(null); void openDrive(); }}>Open a show folder from your drive…</Button>}
          {accountShows.length > 0 && <p className="pj-eyebrow px-3 pt-3 pb-1 flex items-center gap-1.5"><Cloud size={11} /> In your account</p>}
          {accountShows.map((h) => (
            <button key={h.id} type="button" onClick={() => void openFromAccount(h.localId)} className={`w-full text-left px-3 py-2 rounded-[var(--pj-radius-sm)] hover:bg-white/5 ${h.localId === showId.current ? 'text-brand-orange' : ''}`}>
              <div className="type-title-sm truncate">{h.title}</div>
              <div className="type-body-sm flex items-center gap-1" style={{ color: 'var(--on-surface-variant)' }}><Clock3 size={11} /> {new Date(h.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{h.updatedByDeviceLabel ? ` · ${h.updatedByDeviceLabel}` : ''}</div>
            </button>
          ))}
          {recent.length > 0 && <p className="pj-eyebrow px-3 pt-3 pb-1">On this device</p>}
          {recent.map((r) => (
            <button key={r.id} type="button" onClick={() => { setOpenAnchor(null); void openSaved(r.id); }} className={`w-full text-left px-3 py-2 rounded-[var(--pj-radius-sm)] hover:bg-white/5 ${r.id === showId.current ? 'text-brand-orange' : ''}`}>
              <div className="type-title-sm truncate">{r.title}</div>
              <div className="type-body-sm flex items-center gap-1" style={{ color: 'var(--on-surface-variant)' }}><Clock3 size={11} /> {new Date(r.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {r.photos} photos · {r.theme}</div>
            </button>
          ))}
        </AnchoredPopover>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        {/* left: the show + transport + timeline — pinned so they stay in view */}
        <div className="flex flex-col gap-3 min-w-0 lg:sticky lg:top-3">
          <div ref={stageRef} className="relative mx-auto aspect-video bg-black rounded-card overflow-hidden ring-1 ring-[var(--m3-border)]"
            style={{ width: 'min(100%, calc((100dvh - 26rem) * 16 / 9))', minWidth: 'min(100%, 420px)' }}>
            <div ref={hostRef} className="absolute inset-0" />
            {!photos.length && !prep && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <ImagePlus size={30} className="text-brand-orange" />
                <div className="type-headline-sm">Bring the photos in</div>
                <div className="type-body-sm max-w-sm" style={{ color: 'var(--on-surface-variant)' }}>Drag photos or a whole folder here, or choose them below. Each photo is turned upright, its faces found and its tone gently fixed.</div>
                <div className="flex flex-wrap justify-center gap-2">
                  <ImportButtons onFiles={onFolder} />
                  {library.length > 0 && <Button size="sm" variant="secondary" icon={<Images />} onClick={() => setPicker(true)}>From my Photos</Button>}
                </div>
                {recent.length > 0 && (
                  <div className="flex flex-col items-center gap-1.5 mt-1">
                    <p className="pj-eyebrow">Continue a show</p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {recent.slice(0, 4).map((r) => <Chip key={r.id} interactive onClick={() => void openSaved(r.id)}>{r.title} · {r.photos}</Chip>)}
                    </div>
                  </div>
                )}
              </div>
            )}
            {(loading || prep || hydrating) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 type-body-md">
                <Loader2 className="animate-spin" size={20} />
                <div>{prep ? `Preparing photos ${prep.done}/${prep.total}: turning upright, finding faces, a gentle tone fix` : hydrating ? 'Opening the show…' : loading?.label}</div>
                {loading && <div className="w-48 h-1 bg-white/10 rounded-full"><div className="h-1 rounded-full bg-[var(--pj-orange)]" style={{ width: `${Math.round(loading.k * 100)}%` }} /></div>}
              </div>
            )}
          </div>

          {/* transport + segment timeline */}
          <Surface level={2} padded={false} className="px-3 py-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex gap-1 mr-1">
                <Chip interactive selected={mode === 'scrub'} onClick={() => { rtRef.current?.stopLive(); setPlanPlaying(false); setMode('scrub'); }}>Show · timeline</Chip>
                <Chip interactive selected={mode === 'live'} onClick={() => { rtRef.current?.stopLive(); setPlanPlaying(false); setMode('live'); }}>Live · interactive</Chip>
              </div>
              {mode === 'scrub' ? (<>
                <IconButton size="sm" variant="ghost" aria-label="Back to start (Home)" title="Back to start (Home)" disabled={!photos.length} onClick={() => seek(0)}><Rewind /></IconButton>
                <IconButton size="sm" variant="ghost" aria-label="Previous shot (←)" title="Previous shot (←)" disabled={!photos.length} onClick={() => rtRef.current?.stepPlan(-1)}><SkipBack /></IconButton>
                <IconButton size="md" variant="accent" aria-label={planPlaying ? 'Pause (space)' : 'Play (space)'} title={planPlaying ? 'Pause (space)' : 'Play (space)'} disabled={!photos.length || !!loading} onClick={togglePlan}>{planPlaying ? <Pause /> : <Play />}</IconButton>
                <IconButton size="sm" variant="ghost" aria-label="Next shot (→)" title="Next shot (→)" disabled={!photos.length} onClick={() => rtRef.current?.stepPlan(1)}><SkipForward /></IconButton>
                <span className="ml-1 font-mono text-xs tabular-nums">{fmt(scrubT)} <span style={{ color: 'var(--on-surface-variant)' }}>/ {fmt(plan.duration)}</span></span>
                {(() => { const seg = plan.segments.find((s, k) => scrubT >= s.start && (k === plan.segments.length - 1 || scrubT < plan.segments[k + 1].start)); const ph = seg?.photoIndex != null ? showPhotos[seg.photoIndex] : null;
                  return <span className="ml-1 type-body-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>{seg ? (seg.kind === 'visit' ? `Photo ${seg.photoIndex! + 1} of ${showPhotos.length}${ph && shownCaption(ph) ? ` · ${shownCaption(ph)}` : ''}` : seg.kind === 'wide' ? 'Wide shot' : seg.kind === 'intro' ? 'Opening' : 'Closing') : ''}</span>; })()}
              </>) : (<>
                <IconButton size="sm" variant="ghost" aria-label="Previous photo (←)" disabled={!photos.length} onClick={() => rtRef.current?.liveKey('prev')}><SkipBack /></IconButton>
                <IconButton size="md" variant="accent" aria-label="Pause or resume (space)" disabled={!photos.length} onClick={() => rtRef.current?.liveKey('pause')}>{status?.paused ? <Play /> : <Pause />}</IconButton>
                <IconButton size="sm" variant="ghost" aria-label="Next photo (→)" disabled={!photos.length} onClick={() => rtRef.current?.liveKey('next')}><SkipForward /></IconButton>
                <span className="ml-1 font-mono text-xs tabular-nums">{fmt(status?.clock || 0)}</span>
                {status && <span className="ml-1 type-body-sm text-brand-orange">{status.viewed}/{status.total} seen full page</span>}
                <span className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>· tap any {theme !== 'classic' ? 'polaroid' : 'side'}</span>
              </>)}
              <span className="ml-auto" />
              <IconButton size="sm" variant="ghost" aria-label="Full screen" title="Full screen" onClick={fullscreen}><Maximize2 /></IconButton>
            </div>
            {mode === 'scrub' && (
              <div className="relative h-7 select-none">
                <div className="absolute inset-x-0 top-1 h-5 rounded-[var(--pj-radius-xs)] overflow-hidden bg-black/35">
                  {plan.segments.map((s, k) => {
                    const next = plan.segments[k + 1];
                    const len = (next ? next.start : plan.duration) - s.start;
                    const on = s.photoIndex != null && selection.includes(showPhotos[s.photoIndex]?.id);
                    return (
                      <div key={s.id} title={s.kind === 'visit' ? `Photo ${s.photoIndex! + 1}` : s.kind}
                        className="absolute top-0 h-full border-l border-black/60"
                        style={{ left: `${(s.start / plan.duration) * 100}%`, width: `${(len / plan.duration) * 100}%`,
                          background: on ? 'var(--pj-orange)' : s.kind === 'visit' ? (s.chapter ? 'rgba(255,140,0,0.55)' : 'rgba(255,140,0,0.32)') : s.kind === 'wide' ? 'rgba(0,218,243,0.4)' : 'rgba(255,255,255,0.22)' }} />
                    );
                  })}
                  <div className="absolute top-0 h-full w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] pointer-events-none" style={{ left: `${(Math.min(scrubT, plan.duration) / Math.max(0.01, plan.duration)) * 100}%` }} />
                </div>
                <input type="range" min={0} max={plan.duration} step={1 / 30} value={Math.min(scrubT, plan.duration)} onChange={(e) => seek(+e.target.value)}
                  className="absolute inset-x-0 top-0 h-7 w-full opacity-0 cursor-pointer" aria-label="Show timeline" />
              </div>
            )}
          </Surface>

          {/* shots: freely editable */}
          <Surface level={1} padded={false} className="px-3 pt-2.5 pb-1.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <ImportButtons onFiles={onFolder} compact />
              {library.length > 0 && <Button size="xs" variant="ghost" icon={<Images />} onClick={() => setPicker(true)}>From my Photos</Button>}
              <span className="type-body-sm hidden xl:inline" style={{ color: 'var(--on-surface-variant)' }}>Drag to reorder · box-select · right-click for more</span>
              <span className="ml-auto" />
              {multi && (<>
                <span className="type-label-md text-brand-orange">{selection.length} selected</span>
                {selection.length === 2 && <Button size="xs" variant="secondary" icon={<ArrowLeftRight />} onClick={() => ops.swap(selection[0], selection[1])}>Swap</Button>}
                <Button size="xs" variant="secondary" icon={<CopyPlus />} onClick={() => ops.duplicate(selection)}>Duplicate</Button>
                <Button size="xs" variant="danger-quiet" icon={<Trash2 />} onClick={() => ops.remove(selection)}>Remove</Button>
              </>)}
              {photos.length > 0 && !multi && <Button size="xs" variant="ghost" onClick={() => { setPhotos([]); setSelection([]); setSelectedId(null); }}>Clear all</Button>}
            </div>
            <ShowTimeline photos={showPhotos} seconds={plan.fullPage} selection={selection} director={directorOn && !!direction}
              onSelection={(ids, focus) => { setSelection(ids); setSelectedId(focus); }} ops={ops} />
          </Surface>
        </div>

        {/* right: options — scrolls on its own */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-y-auto lg:pr-1 [scrollbar-width:thin]">
          {sel && selectedId && !multi && (
            <Section title={`Shot ${selIndex + 1}${sel.eventLabel && directorOn ? ` · ${sel.eventLabel}` : ''}`} brand>
              <div className="flex items-center gap-3">
                <img src={sel.src} alt="" className="w-16 h-16 object-cover rounded-[var(--pj-radius-sm)]" style={{ transform: `rotate(${(sel.quarterTurns || 0) * 90}deg)` }} />
                <div className="flex flex-wrap gap-1">
                  <IconButton size="sm" variant="secondary" aria-label="Edit photo" title="Edit photo" onClick={() => setEditingId(selectedId)}><Pencil /></IconButton>
                  <IconButton size="sm" variant="secondary" aria-label="Crop and scale" title="Crop and scale" onClick={() => setCroppingId(selectedId)}><Crop /></IconButton>
                  <IconButton size="sm" variant="secondary" aria-label="Rotate 90°" title="Rotate 90°" onClick={() => rotate(selectedId)}><RotateCw /></IconButton>
                  <IconButton size="sm" variant="secondary" aria-label="Duplicate" title="Duplicate" onClick={() => ops.duplicate([selectedId])}><CopyPlus /></IconButton>
                  <IconButton size="sm" variant="danger-quiet" aria-label="Remove from show" title="Remove from show" onClick={() => ops.remove([selectedId])}><Trash2 /></IconButton>
                </div>
              </div>
              {sel.context?.caption && <p className="type-body-sm italic" style={{ color: 'var(--on-surface-variant)' }}>{sel.context.caption}</p>}
              <label className="flex items-center gap-2 type-label-md">
                <input type="checkbox" checked={!!sel.showCaption} disabled={!sel.caption?.trim()} onChange={(e) => updatePhoto(selectedId, { showCaption: e.target.checked })} />
                <Type size={13} /> Show description
                {sel.caption && sel.captionSource && <span className="ml-auto type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{sel.captionSource === 'filename' ? 'from the file name' : sel.captionSource === 'picture' ? 'from the picture' : 'typed'}</span>}
              </label>
              <input className="pj-input" placeholder={sel.context?.caption ? `e.g. ${sel.context.caption}` : 'Type a description for this shot'} value={sel.caption || ''}
                onChange={(e) => updatePhoto(selectedId, { caption: e.target.value, captionSource: 'typed', showCaption: e.target.value.trim() ? (sel.captionSource === 'typed' || !sel.caption ? true : sel.showCaption) : false })} />
              {sel.context?.caption && sel.caption !== sel.context.caption && <Button size="xs" variant="ghost" onClick={() => updatePhoto(selectedId, { caption: sel.context!.caption, captionSource: 'picture' })}>Use what the picture shows</Button>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 type-label-md">
                <label className="flex items-center gap-1.5">Full page
                  <input type="number" min={2} max={20} step={0.5} value={sel.dwellOverride ?? +(plan.fullPage[selIndex] || 5).toFixed(1)} onChange={(e) => updatePhoto(selectedId, { dwellOverride: +e.target.value })} className="pj-input !w-16 !py-1 !px-2" />s
                  {sel.dwellOverride != null && <Button size="xs" variant="ghost" onClick={() => updatePhoto(selectedId, { dwellOverride: undefined })}>auto</Button>}
                </label>
                <label className="flex items-center gap-1.5" title="Graphics, posters and covers are shown whole, scaled to fit 16:9, never cropped into a print">
                  <input type="checkbox" checked={isFullFrame(sel)} onChange={(e) => updatePhoto(selectedId, { fullFrame: e.target.checked })} />
                  Full screen{sel.graphic && sel.fullFrame == null ? ' (graphic)' : ''}
                </label>
                {(sel.trim || sel.keepFraming) && sel.trimReason !== 'manual' && (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={!sel.keepFraming} onChange={() => toggleFraming(selectedId)} />
                    {sel.trimReason === 'screenshot' ? 'Crop screenshot' : 'Trim borders'}
                  </label>
                )}
                {directorOn && <label className="flex items-center gap-1.5" title="The director closes the show on a pinned portrait"><input type="checkbox" checked={!!sel.pinned} onChange={(e) => updatePhoto(selectedId, { pinned: e.target.checked })} /> Close on this</label>}
              </div>
              <div className="pt-1">
                <p className="pj-eyebrow pb-1.5">This photo's look</p>
                <LookPicker inherits look={sel.look} onChange={(l) => updatePhoto(selectedId, { look: l })} />
              </div>
            </Section>
          )}

          <Section title="Theme">
            <div className="grid gap-2">
              {THEMES.map((t) => (
                <button key={t.id} type="button" onClick={() => setTheme(t.id)}
                  className={`pj-surface text-left p-3 bg-gradient-to-br ${t.tone} ${theme === t.id ? 'pj-surface--brand' : ''}`} style={{ padding: 'var(--pj-space-3)' }}>
                  <div className="type-title-md">{t.name}</div>
                  <div className="type-body-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>{t.blurb}</div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Look">
            <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>A grade and lens over the whole show. A photo's own look wins on its shots. Text is never graded.</p>
            <LookPicker look={look} onChange={setLook} />
          </Section>

          <Section title="Director">
            <label className="flex items-center justify-between gap-2 type-title-sm">
              <span className="flex items-center gap-2"><Wand2 size={14} className="text-brand-orange" /> Film director</span>
              <input type="checkbox" checked={directorOn} onChange={(e) => { setDirectorTouched(true); setDirectorOn(e.target.checked); }} aria-label="Film director" />
            </label>
            <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
              {directorOn
                ? 'Finds the events in your photos, orders them for feeling, opens each scene wide, ends it on its strongest moment and closes the show on the best portrait.'
                : theme === 'backyard' ? 'Off for Back Yard by default: photos play in your order. Turn it on to let the director shape the show.' : 'Off: photos play in your order.'}
            </p>
            {directorOn && (<>
              <div className="flex gap-1">
                <Chip interactive selected={style === 'story'} onClick={() => setStyle('story')}>Life story</Chip>
                <Chip interactive selected={style === 'feeling'} onClick={() => setStyle('feeling')}>For feeling</Chip>
              </div>
              {directing && <div className="flex items-center gap-2 type-body-sm"><Loader2 size={12} className="animate-spin" /> Reading the album…</div>}
              {direction && !directing && (
                <div className="flex flex-col gap-1 type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                  {direction.notes.map((n, k) => <div key={k}>· {n}</div>)}
                  <div className="flex flex-wrap gap-1 mt-1">{direction.events.filter((e) => e.label).map((e) => <Chip key={e.id}>{e.label} · {e.photos.length}</Chip>)}</div>
                </div>
              )}
              <div className="border-t border-[var(--m3-border)] pt-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 type-title-sm"><Eye size={13} /> Understand what is in each photo</div>
                <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Dates, faces and look are read on this device. A vision model can also read occasions, places and mood, so the events and order follow what is actually happening.</p>
                {vision ? <div className="flex items-center gap-2 type-body-sm"><Loader2 size={12} className="animate-spin" /> Reading {vision.done}/{vision.total}…</div>
                  : askVision ? (
                    <Surface level={3} className="flex flex-col gap-2 type-body-sm" style={{ padding: 'var(--pj-space-3)' }}>
                      <div>Sends {photos.filter((p) => !p.context).length} small thumbnails (384 px) to Google Gemini through Plajah. About {est.usd != null ? `$${Math.max(0.001, est.usd).toFixed(3)}` : 'a fraction of a cent'} and ~{est.seconds}s. Nothing else leaves this device.</div>
                      <Actions><Button size="sm" variant="ghost" onClick={() => setAskVision(false)}>Not now</Button><Button size="sm" variant="secondary" onClick={runVision}>Read them</Button></Actions>
                    </Surface>
                  ) : <Button size="sm" variant="secondary" className="self-start" disabled={!photos.some((p) => !p.context)} onClick={() => setAskVision(true)}>{photos.length && !photos.some((p) => !p.context) ? 'All photos read ✓' : 'Read photos with a vision model…'}</Button>}
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
                <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Off on every shot unless you turn it on. File names never show. A description can be typed, taken from a descriptive file name, or read from the picture.</p>
                <p className="type-body-sm">{withText.length ? `${withText.length} of ${photos.length} have one (${[typed && `${typed} typed`, fromName && `${fromName} from file names`, fromPic && `${fromPic} from the picture`].filter(Boolean).join(', ')}) · ${shown} shown` : 'No descriptions yet. Select a shot to type one.'}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="xs" variant="secondary" icon={<EyeOff />} disabled={!fromName} onClick={() => setPhotos((ps) => ps.map((p) => (p.captionSource === 'filename' ? { ...p, caption: undefined, captionSource: undefined, showCaption: false } : p)))}>Remove file-name captions</Button>
                  <Button size="xs" variant="ghost" disabled={!withText.length} onClick={() => setPhotos((ps) => ps.map((p) => (p.caption?.trim() ? { ...p, showCaption: true } : p)))}>Show all</Button>
                  <Button size="xs" variant="ghost" disabled={!shown} onClick={() => setPhotos((ps) => ps.map((p) => ({ ...p, showCaption: false })))}>Hide all</Button>
                </div>
              </>);
            })()}
          </Section>

          <Section title="Dedication">
            <Input label="Opening line" value={heading} onChange={(e) => setHeading(e.target.value)} />
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" />
            <Input label="Dates" value={dates} onChange={(e) => setDates(e.target.value)} placeholder="1948 – 2026" />
            <Input label="Closing line" value={closing} onChange={(e) => setClosing(e.target.value)} />
          </Section>

          <Section title="Pace & transitions">
            <Field label={`Pace ${pace.toFixed(2)}×${pace >= 1.15 ? ' (unhurried)' : pace <= 0.9 ? ' (brisk)' : ''}`}><input type="range" min={0.7} max={1.6} step={0.05} value={pace} onChange={(e) => setPace(+e.target.value)} className="w-full accent-[var(--pj-orange)]" /></Field>
            {theme !== 'classic' && (
              <Field label={`Wide shot every ${wideEvery} photos`}><input type="range" min={3} max={12} step={1} value={wideEvery} onChange={(e) => setWideEvery(+e.target.value)} className="w-full accent-[var(--pj-orange)]" /></Field>
            )}
            {theme !== 'lantern-garden' && (<>
              <Field label="Transitions (Fabula library)">
                <select value={transition} onChange={(e) => setTransition(e.target.value)} className="pj-input">
                  <option value="auto">Auto: matched to {THEMES.find((t) => t.id === theme)?.name} ({(THEME_TRANSITIONS[theme] || []).map(([id]) => SHOW_TRANSITIONS.find((x) => x.id === id)?.name).filter((v, k, a) => v && a.indexOf(v) === k).slice(0, 3).join(', ')})</option>
                  {theme === 'classic' && <optgroup label="Classic moves">{TRANSITIONS.filter((t) => t !== 'auto').map((t) => <option key={t} value={t}>{t.replace('-', ' ')}</option>)}</optgroup>}
                  {(['light', 'dissolve', 'motion', 'distort', 'graphic'] as const).map((fam) => (
                    <optgroup key={fam} label={fam[0].toUpperCase() + fam.slice(1)}>
                      {SHOW_TRANSITIONS.filter((t) => t.family === fam).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label={`Transition length ${xfSeconds.toFixed(1)}s`}><input type="range" min={0.4} max={4} step={0.1} value={xfSeconds} onChange={(e) => setXfSeconds(+e.target.value)} className="w-full accent-[var(--pj-orange)]" /></Field>
            </>)}
            {theme === 'classic' && (
              <Field label={`Depth parallax ${Math.round(parallax * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={parallax} onChange={(e) => setParallax(+e.target.value)} className="w-full accent-[var(--pj-orange)]" /></Field>
            )}
          </Section>

          <Section title="Music">
            <div className="flex gap-1">
              {(['none', 'playlist', 'loop'] as MusicMode[]).map((m) => <Chip key={m} interactive selected={musicMode === m} onClick={() => setMusicMode(m)}>{m === 'none' ? 'None' : m === 'playlist' ? 'Playlist' : 'Loop'}</Chip>)}
            </div>
            <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{musicMode === 'loop' ? 'The first track repeats until every photo has had its time.' : musicMode === 'playlist' ? 'Tracks play in order, then start again if photos still need time.' : 'Silent. You can still add music later in Fabula.'}</p>
            {musicMode !== 'none' && (<>
              {tracks.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2 type-body-sm px-2 py-1 rounded-[var(--pj-radius-sm)] bg-black/25">
                  <Music size={12} /><span className="flex-1 truncate">{t.title}</span><span className="font-mono" style={{ color: 'var(--on-surface-variant)' }}>{t.duration ? fmt(t.duration) : '…'}</span>
                  <IconButton size="xs" variant="ghost" aria-label="Remove track" onClick={() => setTracks((ts) => ts.filter((_, k) => k !== i))}><X /></IconButton>
                </div>
              ))}
              <label className="pj-btn pj-btn--secondary pj-btn--sm tap cursor-pointer self-start"><Music size={14} /> Add music
                <input type="file" multiple accept="audio/*" className="hidden" onChange={(e) => { onMusic(e.target.files); e.target.value = ''; }} />
              </label>
              {musicMode === 'playlist' && <label className="flex items-center gap-2 type-label-md"><input type="checkbox" checked={fitToMusic} onChange={(e) => setFitToMusic(e.target.checked)} /> Fit photo timing to the playlist</label>}
            </>)}
          </Section>

          <Section title="Share">
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="primary" icon={<Film />} disabled={!photos.length || !!render} onClick={() => doRender(1080, true, 'mp4')}>Render 1080p</Button>
              <Button size="sm" variant="secondary" icon={<Film />} disabled={!photos.length || !!render} onClick={() => doRender(720, true, 'mp4')}>Render 720p</Button>
              <Button size="sm" variant="secondary" icon={<Film />} disabled={!photos.length || !!render} onClick={() => doRender(1080, false, 'mp4')}>No music</Button>
              <Button size="sm" variant="secondary" icon={<Clapperboard />} disabled={!photos.length} onClick={toFabula}>Open in Fabula</Button>
            </div>
            <div className="border-t border-[var(--m3-border)] pt-2.5 flex flex-col gap-2">
              <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Share without rendering: the show plays live in a post, in Stage or in a Tela document, as a timeline or interactively.</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" icon={<Tv />} disabled={!photos.length} onClick={() => setPreviewing(true)}>Preview player</Button>
                <Button size="sm" variant="secondary" icon={<Share2 />} loading={!!publishing} disabled={!photos.length} onClick={doPublish}>{shared ? 'Update shared show' : 'Publish & get link'}</Button>
              </div>
              {publishing && <span className="type-body-sm">Uploading {publishing.done}/{publishing.total}…</span>}
              {shared && (
                <div className="flex items-center gap-1.5">
                  <input readOnly className="pj-input !py-1 flex-1 font-mono !text-xs" value={shared.link} onFocus={(e) => e.currentTarget.select()} aria-label="Link to the shared show" />
                  <IconButton size="sm" variant="ghost" aria-label="Copy link" onClick={() => { void navigator.clipboard?.writeText(shared.link); setMsg('Link copied.'); }}><Link2 /></IconButton>
                </div>
              )}
            </div>
            {bug && (
              <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                On your plan, renders and shared shows carry a small plajah.com mark in the lower-right corner. Plajah+ from ${BUG_FREE_FROM_USD}/month (Glow and up) removes it.
              </p>
            )}
            {render && (
              <div className="flex flex-col gap-1 type-body-sm">
                <div className="flex justify-between items-center"><span>{render.label}</span><Button size="xs" variant="ghost" onClick={() => abortRef.current?.abort()}>Cancel</Button></div>
                <div className="h-1 bg-white/10 rounded-full"><div className="h-1 rounded-full bg-[var(--pj-orange)]" style={{ width: `${Math.round(render.k * 100)}%` }} /></div>
              </div>
            )}
            {video && (
              <div className="flex flex-col gap-2">
                <video src={video.url} controls className="w-full rounded-[var(--pj-radius-md)]" />
                <Button as="a" href={video.url} download={video.name} size="sm" variant="accent" icon={<Download />}>Download {video.name}</Button>
              </div>
            )}
          </Section>
          {msg && <p role="status" className="type-body-sm px-1 text-brand-orange">{msg}</p>}
        </aside>
      </div>

      {previewing && (
        <div className="fixed inset-0 z-[330] bg-black/85 flex items-center justify-center p-4" onClick={() => setPreviewing(false)}>
          <Surface level={5} shape="sheet" className="w-full max-w-5xl flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div><Eyebrow>Player preview</Eyebrow><div className="type-title-lg">{title}</div></div>
              <IconButton size="sm" variant="ghost" aria-label="Close" onClick={() => setPreviewing(false)}><X /></IconButton>
            </div>
            <ShowPlayer spec={spec} mode="timeline" />
            <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>This is how the show plays in a post, in Stage and in Tela: no rendering, switchable between the timeline and interactive.</p>
          </Surface>
        </div>
      )}

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
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { onFiles(e.target.files); e.target.value = ''; };
  const size = compact ? 'pj-btn--xs' : 'pj-btn--sm';
  return (<>
    <label className={`pj-btn ${compact ? 'pj-btn--ghost' : 'pj-btn--accent'} ${size} tap cursor-pointer`}><FolderOpen size={compact ? 12 : 14} /> Choose a folder
      <input type="file" multiple accept="image/*,.heic,.heif" className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} onChange={pick} />
    </label>
    <label className={`pj-btn ${compact ? 'pj-btn--ghost' : 'pj-btn--secondary'} ${size} tap cursor-pointer`}><Images size={compact ? 12 : 14} /> Select photos
      <input type="file" multiple accept="image/*,.heic,.heif" className="hidden" onChange={pick} />
    </label>
    <label className={`pj-btn ${compact ? 'pj-btn--ghost' : 'pj-btn--secondary'} ${size} tap cursor-pointer`}><ImagePlus size={compact ? 12 : 14} /> One photo
      <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={pick} />
    </label>
  </>);
}

function LibraryPicker({ library, chosen, onDone }: { library: ShowSourcePhoto[]; chosen: Set<string>; onDone: (p: ShowSourcePhoto[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  return (
    <Surface level={5} shape="sheet" className="w-full max-w-4xl max-h-[85vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="type-headline-sm">Choose photos</div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set(library.filter((p) => !chosen.has(p.id)).map((p) => p.id)))}>Select all</Button>
          <Button size="sm" variant="primary" disabled={!sel.size} onClick={() => onDone(library.filter((p) => sel.has(p.id)))}>Add {sel.size}</Button>
        </div>
      </div>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2 overflow-y-auto">
        {library.map((p) => {
          const on = sel.has(p.id), had = chosen.has(p.id);
          return (
            <button key={p.id} type="button" disabled={had} onClick={() => setSel((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
              className={`relative aspect-square rounded-[var(--pj-radius-sm)] overflow-hidden ring-2 ${on ? 'ring-[var(--pj-orange)]' : 'ring-transparent'} ${had ? 'opacity-30' : ''}`}>
              <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>
    </Surface>
  );
}

function Section({ title, children, brand }: { title: string; children: React.ReactNode; brand?: boolean }) {
  return (
    <Surface level={1} brand={brand} className="flex flex-col gap-2.5" style={{ padding: 'var(--pj-space-4)' }}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </Surface>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 type-label-md" style={{ color: 'var(--on-surface-variant)' }}>{label}{children}</label>;
}
