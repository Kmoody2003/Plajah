import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Captions, FileAudio, FileImage, FileText, FileVideo, ListChecks, Plus, Repeat, Search, Settings2, X } from 'lucide-react';
import { Button, IconButton } from './ui';
import { buildFfmpegArgs, crossover, kindFromName, extFor, type MediaKind, type Recipe } from '../services/crossover';
import { crossoverHost } from '../services/crossover/host';
import { onNativeMessage } from '../services/windowsBridgeService';
import { openBrawDownload, nativeProbe, nativeProxy, nativeReadText, nativeSpeechPcm, nativeConvert, nativeStatus, localMediaUrl, pickNativeFiles, pickNativeFolder, revealNative, runNativeFfmpeg, type NativeStatus } from '../services/crossover/nativeEngine';
import { deviceCanConvert, deviceConvert, devicePcm16k, deviceProbe } from '../services/crossover/deviceEngine';
import { PRO_PACK_MB, packCanMake, proPackConvert, proPackInstalled } from '../services/crossover/proPack';
import { sendTo, subscribeHandoffs, type MediaHandoff } from '../services/crossover/handoff';
import { generateCaptions, type GenerateProgress } from '../services/crossover/generateCaptions';
import { saveBlob, saveText } from '../services/crossover/save';
import { frameToTc, normalizeForCompare, rateById, rateFromFps, readCaptions, type CaptionCue, type FrameRate } from '../services/crossover/captions';
import PlayerStage, { type PlayerHandle } from './crossover/PlayerStage';
import CaptionTimeline from './crossover/CaptionTimeline';
import CaptionsPanel from './crossover/CaptionsPanel';
import ConvertPanel from './crossover/ConvertPanel';
import InspectPanel from './crossover/InspectPanel';
import QueuePanel from './crossover/QueuePanel';
import { Segmented, humanSize, type BinItem, type CaptionTrack, type QueueJob } from './crossover/shared';

// ─────────────────────────────────────────────────────────────────────────
// Crossover: check, convert and caption media, on this device. A review deck
// in the centre, the file's facts and the jobs around it. Everything runs on
// the user's device. The desktop uses ffmpeg; Android uses hardware encoders and
// a downloaded codec pack; the website does captions and review, not conversion.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  userProfile?: any;
  onNavigate?: (v: any) => void;
  enabled?: boolean;
}

type Tab = 'inspect' | 'convert' | 'captions' | 'queue';
type PhoneTab = 'media' | Tab;

let uid = 0;
const newId = () => `cx${Date.now().toString(36)}${++uid}`;

const CAPTION_EXTS = ['srt', 'vtt', 'scc', 'mcc', 'ttml', 'dfxp', 'itt', 'ass', 'ssa', 'sbv'];
const isCaptionName = (n: string) => CAPTION_EXTS.includes((n.split('.').pop() || '').toLowerCase());

const DEFAULT_RECIPE: Recipe = {
  containerId: 'mp4', videoCodecId: 'h264', audioCodecId: 'aac', imageFormatId: 'webp', hwAccel: 'auto',
  qualityMode: 'crf', crf: 20, audioBitrate: '192k', fixTimestamps: false,
};

const recipeLabel = (r: Recipe, kind: MediaKind) => (kind === 'image' ? (r.imageFormatId || '').toUpperCase() : `${extFor(r, kind).toUpperCase()} · ${[r.videoCodecId, r.audioCodecId].filter(Boolean).join(' + ')}`);

/** One layout at a time: the player must exist once, or two videos fight over the same handle. */
function useWideLayout() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

function KindIcon({ item, className = 'w-4 h-4' }: { item: BinItem; className?: string }) {
  if (item.isCaption) return <FileText className={className} />;
  if (item.source.kind === 'audio') return <FileAudio className={className} />;
  if (item.source.kind === 'image') return <FileImage className={className} />;
  return <FileVideo className={className} />;
}

function Unavailable({ onBack, reason }: { onBack: () => void; reason: string }) {
  return (
    <div className="flex-1 flex flex-col h-full min-h-0" style={{ color: 'var(--text-primary)' }}>
      <div className="flex items-center px-4 py-4"><IconButton variant="ghost" aria-label="Back" onClick={onBack}><ArrowLeft /></IconButton></div>
      <div className="flex-1 grid place-items-center px-6">
        <div className="text-center max-w-md">
          <Repeat className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--pj-orange)' }} />
          <h1 className="type-headline-sm pj-text-brand mb-2">Crossover</h1>
          <p className="type-body-md">{reason}</p>
        </div>
      </div>
    </div>
  );
}

const CrossoverView: React.FC<Props> = ({ onBack, enabled = true }) => {
  const host = useMemo(crossoverHost, []);
  const [items, setItems] = useState<BinItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Record<string, CaptionTrack>>({});
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [recipe, setRecipe] = useState<Recipe>(DEFAULT_RECIPE);
  const webOnly = host === 'web';
  const [tab, setTab] = useState<Tab>(webOnly ? 'captions' : 'convert');
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('media');
  const [native, setNative] = useState<NativeStatus | null>(null);
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [needsPack, setNeedsPack] = useState(false);
  const [packInstalled, setPackInstalled] = useState(false);
  const [installingEngine, setInstallingEngine] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rateId, setRateId] = useState<string | null>(null);
  const [startTc, setStartTc] = useState('00:00:00:00');
  const [selectedCue, setSelectedCue] = useState<string | null>(null);
  const [generating, setGenerating] = useState<GenerateProgress | null>(null);
  const [pcmByItem, setPcmByItem] = useState<Record<string, Float32Array>>({});
  const [unplayable, setUnplayable] = useState<Record<string, boolean>>({});
  const [proxyProgress, setProxyProgress] = useState<number | null>(null);
  const [reviewOutput, setReviewOutput] = useState<Record<string, string>>({});

  const wide = useWideLayout();
  const player = useRef<PlayerHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const captionInput = useRef<HTMLInputElement>(null);
  const aborts = useRef(new Map<string, AbortController>());
  const genAbort = useRef<AbortController | null>(null);
  const running = useRef(false);

  const selected = items.find((i) => i.id === selectedId) || null;
  const source = selected?.source ?? null;
  const kind: MediaKind = source?.kind ?? 'video';
  const rate: FrameRate = rateById(rateId ?? rateFromFps(source?.probe?.fps).id);
  const track = selected ? tracks[selected.id] ?? null : null;
  const mediaItems = items.filter((i) => !i.isCaption);
  const useNative = host === 'desktop' && !!native?.available;

  useEffect(() => { void proPackInstalled().then(setPackInstalled); }, [jobs.length]);

  useEffect(() => {
    if (host !== 'desktop') return;
    nativeStatus(true).then(setNative).catch(() => setNative({ available: false, encoders: [], reason: 'The desktop engine did not answer.' }));
  }, [host]);

  // Each file's real contents, read when it is first looked at.
  useEffect(() => {
    if (!source || source.probe || selected?.isCaption) return;
    let alive = true;
    setProbing(true);
    (source.path && useNative ? nativeProbe(source) : source.file && source.kind !== 'image' ? deviceProbe(source).catch(() => crossover.probe(source)) : crossover.probe(source))
      .then((probe) => {
        if (!alive) return;
        setItems((prev) => prev.map((i) => (i.id === selected!.id ? { ...i, source: { ...i.source, probe } } : i)));
      })
      .catch((e) => { if (alive) setItems((prev) => prev.map((i) => (i.id === selected!.id ? { ...i, source: { ...i.source, probe: { container: '', warnings: [String(e?.message || e)] } } } : i))); })
      .finally(() => { if (alive) setProbing(false); });
    return () => { alive = false; };
  }, [selectedId, useNative]); // eslint-disable-line react-hooks/exhaustive-deps

  // Can this device do what's asked? Say so before the user commits.
  useEffect(() => {
    let alive = true;
    if (!source) { setBlocked(null); return; }
    setNeedsPack(false);
    if (useNative && source.path) {
      // Say so now if this ffmpeg build doesn't have what the recipe asks for.
      const args = buildFfmpegArgs(source.path, recipe, 'out', source.kind, native?.encoders);
      const missing = ['-c:v', '-c:a'].map((flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : '')).find((e) => e && !native?.encoders.includes(e));
      setBlocked(missing ? `This copy of ffmpeg doesn't include the ${missing} encoder. Pick another codec, or install a full build.` : null);
    } else if (source.kind === 'video' || source.kind === 'audio') {
      deviceCanConvert(source, recipe).then((r) => {
        if (!alive) return;
        const pack = !!r && packCanMake(recipe);
        setNeedsPack(pack);
        setBlocked(r && !pack ? `${recipe.videoCodecId?.toUpperCase()} on this device needs the Plajah desktop app.` : null);
      });
    } else setBlocked(null);
    return () => { alive = false; };
  }, [source?.id, source?.kind, recipe, useNative]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the recipe valid when moving between kinds of file.
  useEffect(() => {
    if (kind === 'audio' && !['flac', 'wav', 'mp3', 'm4a', 'ogg', 'opus', 'aiff', 'caf'].includes(recipe.containerId)) {
      setRecipe((r) => ({ ...r, containerId: 'mp3', audioCodecId: 'mp3', audioBitrate: '320k' }));
    } else if (kind === 'video' && ['flac', 'ogg', 'opus', 'aiff', 'caf', 'm4a'].includes(recipe.containerId)) {
      setRecipe((r) => ({ ...r, containerId: 'mp4', videoCodecId: 'h264', audioCodecId: 'aac' }));
    }
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const installEngine = async () => {
    setInstallingEngine('Downloading the engine');
    const off = onNativeMessage((m: any) => { if (m?.type === 'CROSSOVER_ENGINE') setInstallingEngine(m.message); });
    try {
      const r = await (window as any).__plajahMediaEngine.invoke('crossover_install_engine', {});
      if (!r?.success) throw new Error(r?.error || 'The download failed.');
      setNative(await nativeStatus(true));
    } catch (e: any) {
      setNotice(`Couldn't install the engine: ${e?.message || e}`);
    } finally {
      off();
      setInstallingEngine(null);
    }
  };

  // ── adding files ─────────────────────────────────────────────────────────

  const addCaptionText = useCallback((name: string, text: string, sizeBytes: number) => {
    let doc;
    try {
      doc = readCaptions(name, text);
    } catch (e: any) {
      setNotice(e?.message || String(e));
      return false;
    }
    const newTrack: CaptionTrack = { name, cues: doc.cues, sourceFormat: doc.sourceFormat, warnings: doc.warnings, rateId: doc.rateId };
    if (doc.rateId) setRateId(doc.rateId);
    if (doc.firstTimecodeSec && doc.firstTimecodeSec > 600) {
      // A broadcast file that opens around hour one almost always means a 01:00:00:00 start.
      const r = rateById(doc.rateId || '29.97df');
      const hour = Math.floor(doc.firstTimecodeSec / 3600) * 3600;
      const tc = frameToTc(Math.round((hour * r.num) / r.den), r);
      setStartTc(tc);
      newTrack.cues = readCaptions(name, text, { startTc: tc }).cues;
      setNotice(`This file starts at ${tc}, so captions are timed from there. Change "Video starts at" if that's wrong.`);
    }
    setItems((prev) => {
      const target = prev.find((i) => i.id === selectedId && !i.isCaption) || prev.find((i) => !i.isCaption);
      if (target) {
        setTracks((t) => ({ ...t, [target.id]: newTrack }));
        setSelectedId(target.id);
        return prev;
      }
      // No video open yet: the captions wait in the bin and attach when one arrives.
      const id = newId();
      setTracks((t) => ({ ...t, [id]: newTrack }));
      setSelectedId(id);
      return [...prev, { id, playUrl: null, isCaption: true, source: { id, name, kind: 'video', sizeBytes } }];
    });
    setTab('captions');
    setPhoneTab('captions');
    return true;
  }, [selectedId]);

  const attachOrphanCaptions = (prev: BinItem[], mediaId: string) => {
    const orphan = prev.find((i) => i.isCaption);
    if (!orphan) return prev;
    setTracks((t) => { const { [orphan.id]: tr, ...rest } = t; return tr ? { ...rest, [mediaId]: tr } : t; });
    return prev.filter((i) => i !== orphan);
  };

  const addBrowserFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    const added: BinItem[] = [];
    for (const file of files) {
      if (isCaptionName(file.name)) {
        addCaptionText(file.name, await file.text(), file.size);
        continue;
      }
      const id = newId();
      const k = kindFromName(file.name);
      added.push({ id, playUrl: URL.createObjectURL(file), source: { id, name: file.name, kind: k, sizeBytes: file.size, file } });
    }
    if (!added.length) return;
    setItems((prev) => [...attachOrphanCaptions(prev, added[0].id), ...added]);
    setSelectedId((cur) => (items.find((i) => i.id === cur && !i.isCaption) ? cur : added[0].id));
    setPhoneTab((t) => (t === 'media' ? (webOnly ? 'captions' : 'convert') : t));
  };

  const addNativeFiles = async () => {
    const files = await pickNativeFiles();
    const added: BinItem[] = [];
    for (const f of files) {
      if (isCaptionName(f.name)) {
        addCaptionText(f.name, await nativeReadText(f.path), f.size);
        continue;
      }
      const id = newId();
      added.push({ id, playUrl: localMediaUrl(f.path), source: { id, name: f.name, kind: kindFromName(f.name), sizeBytes: f.size, path: f.path, url: localMediaUrl(f.path) } });
    }
    if (!added.length) return;
    setItems((prev) => [...attachOrphanCaptions(prev, added[0].id), ...added]);
    setSelectedId((cur) => (items.find((i) => i.id === cur && !i.isCaption) ? cur : added[0].id));
  };

  // Sent from Fabula, the Asset Manager, the Photos viewer or anywhere else.
  const receive = useRef<(items: MediaHandoff[]) => void>(() => {});
  receive.current = (items) => {
    const added: BinItem[] = [];
    for (const h of items) {
      const hasMedia = h.file || h.path || h.url;
      if (hasMedia) {
        const id = newId();
        const file = h.file ? (h.file instanceof File ? h.file : new File([h.file], h.name)) : undefined;
        const url = h.path ? localMediaUrl(h.path) : file ? URL.createObjectURL(file) : h.url!;
        added.push({ id, playUrl: url, source: { id, name: h.name, kind: kindFromName(h.name), sizeBytes: h.sizeBytes ?? file?.size ?? 0, path: h.path, file, url: h.url } });
        if (h.cues?.length) setTracks((t) => ({ ...t, [id]: { name: h.name, cues: h.cues!, warnings: [] } }));
      } else if (h.cues?.length) {
        const newTrack: CaptionTrack = { name: h.name, cues: h.cues, warnings: [] };
        const id = newId();
        setTracks((t) => ({ ...t, [id]: newTrack }));
        added.push({ id, playUrl: null, isCaption: true, source: { id, name: h.name, kind: 'video', sizeBytes: 0 } });
        setTab('captions');
        setPhoneTab('captions');
      }
    }
    if (!added.length) return;
    setItems((prev) => [...prev, ...added]);
    setSelectedId(added[0].id);
  };
  useEffect(() => subscribeHandoffs('crossover', (items) => {
    // Studios hold media as blob: or localmedia URLs. Recover the bytes or path, or it could be viewed but not converted.
    void Promise.all(items.map(async (h) => {
      if (h.file || h.path || !h.url) return h;
      if (h.url.startsWith('https://localmedia.plajah/')) return { ...h, path: new URL(h.url).searchParams.get('path') ?? undefined };
      if (h.url.startsWith('blob:')) { try { return { ...h, file: await (await fetch(h.url)).blob() }; } catch { return h; } }
      return h;
    })).then((resolved) => receive.current(resolved));
  }), []);

  const pickFiles = () => { if (useNative) void addNativeFiles(); else fileInput.current?.click(); };
  const pickCaptions = async () => {
    if (useNative) {
      for (const f of await pickNativeFiles()) addCaptionText(f.name, await nativeReadText(f.path), f.size);
    } else captionInput.current?.click();
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id);
      if (gone?.playUrl?.startsWith('blob:')) URL.revokeObjectURL(gone.playUrl);
      return prev.filter((i) => i.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  };

  // ── the queue: one job at a time, in order ───────────────────────────────

  const patchJob = (id: string, p: Partial<QueueJob>) => setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const runJob = useCallback(async (job: QueueJob, folder: string | null) => {
    const ac = new AbortController();
    aborts.current.set(job.id, ac);
    patchJob(job.id, { status: 'running', progress: 0 });
    const onProgress = (p: any) => patchJob(job.id, {
      stage: p.line,
      progress: p.progress, speed: p.speed, etaSec: p.etaSec, outSec: p.outSec,
      ...(p.previewUrl ? { previewUrl: p.previewUrl } : {}), ...(p.previewCanvas ? { previewCanvas: p.previewCanvas } : {}),
    });
    try {
      let probeSource = job.source;
      if (!probeSource.probe && probeSource.path && crossoverHost() === 'desktop') {
        probeSource = { ...probeSource, probe: await nativeProbe(probeSource).catch(() => undefined) };
      }
      const result = probeSource.path && crossoverHost() === 'desktop'
        ? await nativeConvert(probeSource, job.recipe, onProgress, { outputDir: folder || undefined, signal: ac.signal })
        : probeSource.kind === 'image'
          ? await crossover.convert(probeSource, job.recipe, onProgress, ac.signal)
          : await deviceCanConvert(probeSource, job.recipe)
            ? await proPackConvert(probeSource, job.recipe, onProgress, ac.signal)
            : await deviceConvert(probeSource, job.recipe, onProgress, ac.signal);
      let outputProbe;
      if (result.outputPath) {
        outputProbe = await nativeProbe({ ...job.source, path: result.outputPath, name: result.outputName, probe: undefined }).catch(() => undefined);
      }
      patchJob(job.id, { status: 'done', progress: 1, result, backend: result.backend, outputProbe, previewUrl: undefined, previewCanvas: undefined });
      setReviewOutput((m) => ({ ...m, [job.itemId]: job.id }));
    } catch (e: any) {
      if (e?.name === 'AbortError' || /cancel/i.test(e?.message || '')) patchJob(job.id, { status: 'canceled', previewUrl: undefined, previewCanvas: undefined });
      else patchJob(job.id, { status: 'error', error: e?.message || String(e), previewUrl: undefined, previewCanvas: undefined });
    } finally {
      aborts.current.delete(job.id);
    }
  }, []);

  useEffect(() => {
    if (running.current) return;
    const next = jobs.find((j) => j.status === 'queued');
    if (!next) return;
    running.current = true;
    void runJob(next, outputFolder).finally(() => {
      running.current = false;
      setJobs((p) => [...p]); // look for the next one
    });
  }, [jobs, outputFolder, runJob]);

  const enqueue = (targets: BinItem[]) => {
    const fresh: QueueJob[] = targets.filter((t) => !t.isCaption).map((t) => ({
      id: newId(), itemId: t.id, source: t.source, recipe: { ...recipe }, status: 'queued', progress: 0,
      label: recipeLabel(recipe, t.source.kind),
    }));
    if (!fresh.length) return;
    setJobs((prev) => [...fresh, ...prev]);
    setTab('queue');
    setPhoneTab('queue');
  };

  const cancelJob = (id: string) => {
    const ac = aborts.current.get(id);
    if (ac) ac.abort(); else patchJob(id, { status: 'canceled' });
  };

  const saveJob = async (job: QueueJob) => {
    if (!job.result?.blob) return;
    try {
      const saved = await saveBlob(job.result.outputName, job.result.blob, undefined, (p) => patchJob(job.id, { savedMessage: `Saving ${Math.round(p * 100)}%` }));
      patchJob(job.id, { savedMessage: saved.message });
    } catch (e: any) {
      setNotice(`Couldn't save: ${e?.message || e}`);
      patchJob(job.id, { savedMessage: undefined });
    }
  };

  // ── review ───────────────────────────────────────────────────────────────

  const activeJob = selected ? jobs.find((j) => j.itemId === selected.id && j.status === 'running') : null;
  const outputJob = selected ? jobs.find((j) => j.id === reviewOutput[selected.id] && j.status === 'done') : null;
  const outputKind: MediaKind | undefined = outputJob ? (outputJob.result?.outputName ? kindFromName(outputJob.result.outputName) : undefined) : undefined;

  const makeProxy = async () => {
    if (!source || !selected) return;
    setProxyProgress(0);
    try {
      const url = await nativeProxy(source, (p) => setProxyProgress(p.progress));
      setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, playUrl: url, proxyUrl: url } : i)));
      setUnplayable((u) => ({ ...u, [selected.id]: false }));
    } catch (e: any) {
      setNotice(`Couldn't make a review copy: ${e?.message || e}`);
    } finally {
      setProxyProgress(null);
    }
  };

  // ── captions ─────────────────────────────────────────────────────────────

  const setCues = (cues: CaptionCue[]) => {
    if (!selected) return;
    setTracks((t) => ({ ...t, [selected.id]: { ...(t[selected.id] ?? { name: selected.source.name, warnings: [] }), cues } }));
  };

  const speechPcm = async (onP: (p: number) => void, signal?: AbortSignal): Promise<Float32Array> => {
    if (!selected || !source) throw new Error('Nothing open.');
    const have = pcmByItem[selected.id];
    if (have) return have;
    let pcm: Float32Array;
    if (source.path && useNative) {
      const probed = source.probe ? source : { ...source, probe: await nativeProbe(source).catch(() => undefined) };
      pcm = await nativeSpeechPcm(probed, (p) => onP(p.progress), signal);
    } else if (source.file) {
      pcm = await devicePcm16k(source.file, onP);
    } else throw new Error('This file isn\'t on the device.');
    setPcmByItem((m) => ({ ...m, [selected.id]: pcm }));
    return pcm;
  };

  const startGenerate = async () => {
    if (!selected) return;
    const existing = track?.cues.length;
    if (existing && !window.confirm(`Replace the ${existing} captions on this file with generated ones?`)) return;
    const itemId = selected.id;
    const ac = new AbortController();
    genAbort.current = ac;
    setGenerating({ stage: 'audio', progress: 0, message: 'Reading the audio' });
    try {
      const pcm = await speechPcm((p) => setGenerating({ stage: 'audio', progress: p, message: 'Reading the audio' }), ac.signal);
      const cues = await generateCaptions(pcm, (p) => {
        setGenerating(p);
        if (p.partial) setTracks((t) => ({ ...t, [itemId]: { name: `${selected.source.name} (generated)`, cues: p.partial!, warnings: [] } }));
      }, ac.signal);
      setTracks((t) => ({ ...t, [itemId]: { name: `${selected.source.name} (generated)`, cues, warnings: [] } }));
      if (!cues.length) setNotice('No speech was found in this file.');
    } catch (e: any) {
      if (e?.name !== 'AbortError') setNotice(`Couldn't generate captions: ${e?.message || e}`);
    } finally {
      setGenerating(null);
      genAbort.current = null;
    }
  };

  // Waveform once captions are being worked on, so timing can be judged against the sound.
  useEffect(() => {
    if (!selected || selected.isCaption || !track?.cues.length || pcmByItem[selected.id] || generating) return;
    if (source?.kind === 'image') return;
    speechPcm(() => {}).catch(() => {});
  }, [selected?.id, !!track?.cues.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCaption = async (name: string, text: string, mime: string) => (await saveText(name, text, mime, source?.path)).message;

  // FFmpeg 8 has its own MCC reader and 608 decoder, unrelated to ours: a second opinion on the file.
  const independentCheck = useMemo(() => {
    if (!useNative) return undefined;
    return async (name: string, text: string, cues: CaptionCue[], fileRate: FrameRate, _start: string) => {
      const invoke = (window as any).__plajahMediaEngine.invoke;
      const { path: inPath } = await invoke('crossover_temp_path', { name });
      await invoke('crossover_write_text', { path: inPath, text });
      const { path: outPath } = await invoke('crossover_temp_path', { name: 'check.srt' });
      try {
        await runNativeFfmpeg(() => ['-y', '-i', inPath, '-map', '0:s:0', '-c:s', 'srt', outPath], outPath, undefined, false, () => {});
      } catch {
        return { ok: false, message: 'The installed ffmpeg can\'t read this format back (MCC needs FFmpeg 8), so only Crossover\'s reader checked it.' };
      }
      const cleaned = (await nativeReadText(outPath)).replace(/\{\\an\d\}/g, '').replace(/\\h/g, '');
      const back = readCaptions('check.srt', cleaned).cues;
      const frame = fileRate.den / fileRate.num;
      const bad = cues.filter((c, i) => {
        const b = back[i];
        return !b || normalizeForCompare(b.text) !== normalizeForCompare(c.text) || Math.abs(b.startSec - c.startSec - (back[0].startSec - cues[0].startSec)) > frame * 1.5;
      });
      return bad.length || back.length !== cues.length
        ? { ok: false, message: `FFmpeg read ${back.length} of ${cues.length} captions, and ${bad.length} differ.` }
        : { ok: true, message: `FFmpeg also reads all ${cues.length} captions, words and timing, within a frame.` };
    };
  }, [useNative]);

  // ── layout ───────────────────────────────────────────────────────────────

  const dropZone = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); void addBrowserFiles(e.dataTransfer.files); },
  };

  const bin = (
    <div className="flex flex-col min-h-0 h-full">
      <Button variant="secondary" icon={<Plus />} onClick={pickFiles} className="w-full shrink-0">Add files</Button>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto flex flex-col gap-1" data-testid="bin">
        {!items.length && (
          <p className="type-body-sm mt-4 px-2 text-center" style={{ color: 'var(--on-surface-variant)' }}>
            Add video, audio, images or caption files, or drop them here.
          </p>
        )}
        {items.map((i) => (
          <div key={i.id} className="group flex items-center gap-2 p-2 cursor-pointer" onClick={() => { setSelectedId(i.id); setPhoneTab((t) => (t === 'media' ? (webOnly ? 'captions' : 'convert') : t)); }}
            style={{ background: i.id === selectedId ? 'var(--glass-3)' : 'transparent', borderRadius: 'var(--pj-radius-sm)' }}>
            <span className="shrink-0" style={{ color: 'var(--pj-cyan)' }}><KindIcon item={i} /></span>
            <span className="min-w-0 flex-1">
              <span className="block type-body-md truncate" style={{ color: 'var(--text-primary)' }}>{i.source.name}</span>
              <span className="block type-body-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>
                {humanSize(i.source.sizeBytes)}{tracks[i.id] ? ` · ${tracks[i.id].cues.length} captions` : ''}
              </span>
            </span>
            {i.source.probe?.corrupt && <span className="type-label-sm shrink-0" style={{ color: 'var(--pj-danger)', fontSize: 11 }}>Damaged</span>}
            <IconButton variant="ghost" size="xs" aria-label={`Remove ${i.source.name}`} onClick={(e: React.MouseEvent) => { e.stopPropagation(); removeItem(i.id); }}><X /></IconButton>
          </div>
        ))}
      </div>
    </div>
  );

  const engineLabel = useNative
    ? `Runs on this PC${native?.encoders.includes('h264_nvenc') ? ' with NVIDIA encoding' : ''}. Nothing is uploaded.`
    : needsPack ? (packInstalled ? 'Uses the pro codec pack on this device. Slower than hardware. Nothing is uploaded.' : `This format needs the pro codec pack: a one-time ${PRO_PACK_MB} MB download. Your files stay on this device.`)
    : host === 'android' ? 'Runs on this phone with its hardware encoder. Nothing is uploaded.'
    : 'Runs on this device. Nothing is uploaded.';

  const panels: Record<Tab, React.ReactNode> = {
    inspect: <InspectPanel source={selected?.isCaption ? null : source} probing={probing} output={outputJob ? { name: outputJob.result!.outputName, sizeBytes: outputJob.result!.sizeBytes, probe: outputJob.outputProbe } : null} />,
    convert: (
      <ConvertPanel
        source={selected?.isCaption ? null : source}
        recipe={recipe}
        onChange={(p) => setRecipe((r) => ({ ...r, ...p }))}
        onQueue={() => selected && enqueue([selected])}
        onQueueAll={() => enqueue(mediaItems)}
        otherCount={Math.max(0, mediaItems.length - 1)}
        encoders={useNative ? native?.encoders : undefined}
        blockedReason={blocked}
        engineLabel={engineLabel}
        engineVersion={useNative ? native?.version : undefined}
        outputFolder={outputFolder}
        onPickFolder={useNative ? () => { void pickNativeFolder().then((p) => { if (p) setOutputFolder(p); }); } : undefined}
      />
    ),
    captions: (
      <CaptionsPanel
        track={track}
        rate={rate}
        onRate={setRateId}
        startTc={startTc}
        onStartTc={setStartTc}
        mediaName={selected?.isCaption ? undefined : source?.name}
        duration={duration}
        time={time}
        selectedId={selectedCue}
        onSelect={setSelectedCue}
        onSeek={(s) => player.current?.seek(s)}
        onChangeCues={setCues}
        onLoadTrack={(t) => { if (selected) setTracks((all) => ({ ...all, [selected.id]: t })); }}
        onOpenCaptionFile={() => { void pickCaptions(); }}
        canGenerate={!!source && !selected?.isCaption && source.kind !== 'image'}
        generating={generating}
        onGenerate={() => { void startGenerate(); }}
        onCancelGenerate={() => genAbort.current?.abort()}
        onSave={saveCaption}
        onSendToFabula={track?.cues.length ? () => sendTo('fabula', { name: track.name, cues: track.cues }) : undefined}
        onIndependentCheck={independentCheck}
      />
    ),
    queue: (
      <QueuePanel
        jobs={jobs}
        onCancel={cancelJob}
        onRemove={(id) => setJobs((p) => p.filter((j) => j.id !== id))}
        onReview={(j) => { setSelectedId(j.itemId); setReviewOutput((m) => ({ ...m, [j.itemId]: j.id })); }}
        onSave={host === 'desktop' ? undefined : (j) => { void saveJob(j); }}
        onReveal={useNative ? (j) => { if (j.result?.outputPath) void revealNative(j.result.outputPath); } : undefined}
        onSend={(j, target) => { if (j.result) sendTo(target, { name: j.result.outputName, file: j.result.blob, path: j.result.outputPath, url: j.result.outputUrl, sizeBytes: j.result.sizeBytes }); }}
      />
    ),
  };

  const queueBadge = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
  const tabOptions: { value: Tab; label: string }[] = webOnly
    ? [{ value: 'captions', label: 'Captions' }, { value: 'inspect', label: 'Inspect' }]
    : [
      { value: 'inspect', label: 'Inspect' },
      { value: 'convert', label: 'Convert' },
      { value: 'captions', label: 'Captions' },
      { value: 'queue', label: queueBadge ? `Queue ${queueBadge}` : 'Queue' },
    ];

  const stage = (
    <PlayerStage
      ref={player}
      url={selected && !selected.isCaption ? selected.playUrl : null}
      kind={selected?.isCaption ? 'none' : source ? source.kind : 'none'}
      outputUrl={outputJob?.result?.outputUrl ?? null}
      outputKind={outputKind}
      name={source?.name}
      cues={track?.cues ?? []}
      rate={rate}
      startTcFrame={0}
      live={activeJob ? { previewUrl: activeJob.previewUrl, previewCanvas: activeJob.previewCanvas, progress: activeJob.progress, speed: activeJob.speed } : null}
      onTime={setTime}
      onDuration={setDuration}
      unplayable={!!(selected && unplayable[selected.id])}
      onUnplayable={() => { if (selected) setUnplayable((u) => ({ ...u, [selected.id]: true })); }}
      onMakeProxy={useNative && source?.path ? () => { void makeProxy(); } : undefined}
      proxyProgress={proxyProgress}
    />
  );

  const timeline = (track?.cues.length || (selected && !selected.isCaption && source?.kind !== 'image' && tab === 'captions')) ? (
    <CaptionTimeline
      cues={track?.cues ?? []}
      duration={duration}
      time={time}
      rate={rate}
      selectedId={selectedCue}
      pcm={selected ? pcmByItem[selected.id] ?? null : null}
      onSeek={(s) => player.current?.seek(s)}
      onSelect={(id) => { setSelectedCue(id); setTab('captions'); }}
      onRetime={(id, s, e) => setCues((track?.cues ?? []).map((c) => (c.id === id ? { ...c, startSec: s, endSec: e } : c)).sort((a, b) => a.startSec - b.startSec))}
    />
  ) : null;

  if (!enabled) return <Unavailable onBack={onBack} reason="Crossover has been turned off by the Plajah team. Check back soon." />;

  const isBraw = !!source && /\.braw$/i.test(source.name);
  const brawReady = isBraw && host === 'desktop' && !!native?.raw?.braw;
  const brawInstallable = isBraw && host === 'desktop' && !!native && !native.raw?.braw;
  const rawVendor = source && !brawReady && !brawInstallable && /\.(braw|r3d|ari|arx|crm)$/i.test(source.name);
  const missingEngine = host === 'desktop' && native && !native.available;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0" style={{ color: 'var(--text-primary)' }} {...dropZone} data-testid="crossover">
      <input ref={fileInput} type="file" multiple className="hidden" aria-label="Add files" onChange={(e) => { void addBrowserFiles(e.target.files); e.currentTarget.value = ''; }} />
      <input ref={captionInput} type="file" multiple accept=".srt,.vtt,.scc,.mcc,.ttml,.dfxp,.itt,.xml,.ass,.ssa,.sbv" className="hidden" aria-label="Open captions" onChange={(e) => { void addBrowserFiles(e.target.files); e.currentTarget.value = ''; }} />

      <header className="flex items-center gap-2 px-3 lg:px-4 h-14 shrink-0">
        <IconButton variant="ghost" aria-label="Back" onClick={onBack}><ArrowLeft /></IconButton>
        <h1 className="type-title-lg pj-text-brand">Crossover</h1>
        <span className="hidden md:inline type-body-sm ml-2" style={{ color: 'var(--on-surface-variant)' }}>
          {useNative ? native?.version?.split(' ').slice(0, 3).join(' ') : host === 'android' ? 'On this phone' : webOnly ? 'Captions and review run in this browser; nothing is uploaded. Media conversion is in the desktop and Android apps.' : ''}
        </span>
      </header>

      {missingEngine && (
        <div className="mx-3 lg:mx-4 mb-2 px-3 py-2 type-body-sm" data-testid="engine-missing" style={{ background: 'var(--pj-warning-soft)', borderRadius: 'var(--pj-radius-sm)', color: 'var(--text-primary)' }}>
          {installingEngine ? <span>{installingEngine}</span> : (
            <span className="flex flex-wrap items-center gap-2">
              Crossover's full engine isn't on this PC. Until then, it uses built-in codecs and the codec pack.
              <Button variant="secondary" size="xs" onClick={() => { void installEngine(); }}>Download it (about 200 MB)</Button>
            </span>
          )}
        </div>
      )}
      {rawVendor && (
        <div className="mx-3 lg:mx-4 mb-2 px-3 py-2 type-body-sm" data-testid="raw-vendor" style={{ background: 'var(--pj-warning-soft)', borderRadius: 'var(--pj-radius-sm)' }}>
          This camera RAW format is decoded only by its maker's own software. Crossover can't read it yet; export a ProRes or DNxHR master from that software and bring that here.
        </div>
      )}
      {brawReady && (
        <div className="mx-3 lg:mx-4 mb-2 px-3 py-2 type-body-sm" data-testid="raw-braw-ready" style={{ background: 'var(--glass-2)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-sm)' }}>
          Decoding with Blackmagic RAW on this PC, using the settings saved with the clip. To change ISO or white balance, save them to the clip's sidecar in Blackmagic software first.
        </div>
      )}
      {brawInstallable && (
        <div className="mx-3 lg:mx-4 mb-2 px-3 py-2 flex flex-wrap items-center gap-2 type-body-sm" data-testid="raw-braw-missing" style={{ background: 'var(--pj-warning-soft)', borderRadius: 'var(--pj-radius-sm)' }}>
          <span className="flex-1 min-w-0">Crossover reads this with Blackmagic RAW 6.0 or later, a free install from Blackmagic Design under its own licence.</span>
          <Button variant="secondary" size="xs" onClick={() => { void openBrawDownload(); }}>Get it from Blackmagic</Button>
          <Button variant="ghost" size="xs" onClick={() => { void nativeStatus(true).then(setNative); }}>Check again</Button>
        </div>
      )}
      {notice && (
        <div className="mx-3 lg:mx-4 mb-2 px-3 py-2 flex items-center gap-2 type-body-sm" style={{ background: 'var(--glass-2)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-sm)' }}>
          <span className="flex-1 min-w-0">{notice}</span>
          <IconButton variant="ghost" size="xs" aria-label="Dismiss" onClick={() => setNotice(null)}><X /></IconButton>
        </div>
      )}

      {/* Desktop: bin · deck · inspector */}
      {wide ? <div className="grid flex-1 min-h-0 gap-3 px-4 pb-4" style={{ gridTemplateColumns: '264px minmax(0,1fr) 380px' }}>
        <aside className="min-h-0 p-3" style={{ background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-lg)' }}>{bin}</aside>
        <main className="min-h-0 flex flex-col gap-3">
          <div className="flex-1 min-h-0">{stage}</div>
          {timeline && <div className="shrink-0">{timeline}</div>}
        </main>
        <aside className="min-h-0 flex flex-col" style={{ background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-lg)' }}>
          <div className="p-2 shrink-0"><Segmented<Tab> value={tab} onChange={setTab} options={tabOptions} /></div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">{panels[tab]}</div>
        </aside>
      </div> : (
      /* Phone: the deck stays on top, one panel below it */
      <div className="flex-1 min-h-0 flex flex-col">
        {(selected && !selected.isCaption) && <div className="shrink-0 px-3" style={{ height: '38vh' }}>{stage}</div>}
        {timeline && phoneTab === 'captions' && <div className="shrink-0 px-3 mt-2">{timeline}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {phoneTab === 'media' ? bin : panels[phoneTab]}
        </div>
        <nav className={`shrink-0 grid ${webOnly ? 'grid-cols-3' : 'grid-cols-5'}`} style={{ borderTop: '1px solid var(--m3-border)', paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Crossover sections">
          {(webOnly ? [
            ['media', 'Files', FileVideo], ['captions', 'Captions', Captions], ['inspect', 'Inspect', Search],
          ] as const : [
            ['media', 'Files', FileVideo], ['inspect', 'Inspect', Search], ['convert', 'Convert', Settings2], ['captions', 'Captions', Captions], ['queue', queueBadge ? `Queue ${queueBadge}` : 'Queue', ListChecks],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setPhoneTab(id)} aria-current={phoneTab === id ? 'page' : undefined} className="tap flex flex-col items-center justify-center gap-0.5 h-14 type-label-sm"
              style={{ color: phoneTab === id ? 'var(--pj-orange)' : 'var(--on-surface-variant)', fontSize: 11 }}>
              <Icon className="w-5 h-5" />{label}
            </button>
          ))}
        </nav>
      </div>
      )}
    </div>
  );
};

export default CrossoverView;
