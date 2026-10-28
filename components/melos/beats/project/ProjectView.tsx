// The Project view — "The Pressing" (approved direction B, the Pressing Plant).
//
// Studio One's Project page reimagined as issuing a record: import the songs, sequence and
// level them on the proof sheet, choose the decade each one is pressed in, hand the room to a
// staff engineer, fill in the publishing info, and release — to Chora through the Album
// Creator, or as a zipped master for delivery anywhere else. Instrument tier (matte slab,
// strict Beats color semantics) with the Pressing Plant's editorial serif voice for the parts
// you READ, because this is the room where you think about the record, not just play it.
//
// The audio truth lives in fx/mastering.ts (the chain), masterProject.ts (the album doc +
// offline release pipeline) and the BS.1770 worklet (the meters); this component renders
// state and pushes edits through the doc + BeatsEngine, the SpectraPanel two-writer pattern.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Volume2, VolumeX, Plus, Trash2, Package, UploadCloud, Disc3, Play, Square, MapPin, X, ArrowRight } from 'lucide-react';
import type { GrooveDoc, SampleRef } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  ERA_PROFILES, ENGINEERS, eraById, applyEra, defaultMastering, type MasteringState,
} from '../../../../services/melos/beats/fx/mastering';
import {
  decodeCtx, renderAlbum, renderAlbumContinuous, seedAlbumCreator, exportAlbumZip, projectUid,
  albumLayout, setCrossfade, crossfadeAt, DISC_FORMATS, discFormatById, checkFormatFit, effectiveDur, moveTrack,
  exportPhysicalPackage,
  type ProjectTrack, type MasterProjectDoc,
} from '../../../../services/melos/beats/masterProject';
import { reconcileInPlace } from '../../../../services/melos/beats/reconcileInPlace';
import { deskOf, presetById } from '../../../../services/melos/beats/releaseDesk';
import type { FxInstance } from '../../../../services/melos/beats/fx/devices';
import { ingestSample, backupToLocker, hydrateSample } from '../../../../services/melos/beats/sampleStore';
import { renderGroove, downloadBlob } from '../../../../services/melos/beats/render';
import { encodeWav } from '../../../../services/audio/wavEncode';
import type { MelosSong, MelosArrangement } from '../../../../services/melosService';
import type { EngineSnapshot } from '../useEngineBridge';
import { useMasterProject } from './useMasterProject';
import { useChoraCoedit } from '../useChoraCoedit';
import { CollabDock } from '../../../collab/CollabDock';
import { useMelosSongs } from './useMelosSongs';
import { FxRack } from './FxRack';
import { TrackAssets } from './TrackAssets';
import { ReleasePicker } from './ReleasePicker';
import { AlbumTimeline } from './AlbumTimeline';
import { useDeskTransport } from './useDeskTransport';
import { StudioMenuPublisher } from '../../StudioMenus';
import type { MenuGroup } from '../shared/MenuBar';
import { PhysicalMediaBay } from './desk/PhysicalMediaBay';
import { CreditsBay } from './desk/CreditsBay';
import { ArtworkBay } from './desk/ArtworkBay';
import { ReleaseBay } from './desk/ReleaseBay';
import { MediaBay } from './desk/MediaBay';
import { VisualsBay } from './desk/VisualsBay';
import { MixesShowBay } from './desk/MixesShowBay';
import { PixelsBay } from './desk/PixelsBay';
import { IntelBay } from './desk/IntelBay';
import { PublishBay } from './desk/PublishBay';
import { TrackDeck } from './desk/TrackDeck';
import { Knob } from '../shared/Knob';
import { ARMED, PLAYHEAD, SELECT, slabPanel } from '../theme';

const SERIF = 'Georgia, "Times New Roman", serif';

/** The desk's bays — the environments the menu bar's View menu switches between. */
const BAYS = [
  { id: 'pressing', label: 'Pressing' },
  { id: 'physical', label: 'Physical Media' },
  { id: 'credits', label: 'Credits & Metadata' },
  { id: 'artwork', label: 'Artwork' },
  { id: 'release', label: 'Release' },
  { id: 'media', label: 'Videos & Slideshow' },
  { id: 'visuals', label: 'Visuals & Shaders' },
  { id: 'mixes', label: 'Mixes & Show' },
  { id: 'pixels', label: 'Pixels' },
  { id: 'intel', label: 'Intelligence' },
  { id: 'publish', label: 'Publish' },
] as const;
type BayId = typeof BAYS[number]['id'];

/** Synthesize a musical reference stem when an arrangement song has no bounced audio file yet. */
function synthesizeSongReferenceWav(song: MelosSong): Blob {
  const ctx = decodeCtx();
  const sr = 44100;
  const dur = Math.min(24, Math.max(8, song.durationSec ? Math.min(16, song.durationSec) : 12));
  const length = Math.floor(sr * dur);
  const buf = ctx.createBuffer(2, length, sr);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.getChannelData(1);
  const bpm = song.tempo || 100;
  const beatSec = 60 / bpm;
  // Choose root frequency from song keySig or default A2 (110 Hz)
  const keyMap: Record<string, number> = {
    C: 130.81, D: 146.83, E: 164.81, F: 174.61, G: 196.0, A: 110.0, B: 123.47,
  };
  const rootLetter = (song.keySig || 'A').trim().charAt(0).toUpperCase();
  const rootHz = keyMap[rootLetter] || 110.0;
  const isMinor = (song.keySig || '').toLowerCase().includes('m');
  const thirdRatio = isMinor ? 1.1892 : 1.2599;
  const fifthRatio = 1.4983;

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.6);
    const pulse = 0.65 + 0.35 * Math.max(0, Math.sin((2 * Math.PI * t) / beatSec));
    const pad =
      0.22 * Math.sin(2 * Math.PI * rootHz * t) +
      0.16 * Math.sin(2 * Math.PI * rootHz * thirdRatio * t) +
      0.14 * Math.sin(2 * Math.PI * rootHz * fifthRatio * t) +
      0.08 * Math.sin(2 * Math.PI * rootHz * 2 * t);
    ch0[i] = pad * pulse * env * 0.6;
    ch1[i] = pad * pulse * env * 0.6 * (0.95 + 0.05 * Math.cos(t * 1.7));
  }
  return encodeWav(buf, 16);
}

interface ProjectViewProps {
  doc: GrooveDoc;
  snap: EngineSnapshot;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  /** The Melos production this album belongs to; falls back to the user's scratch space. */
  productionId?: string;
  /** Live songs from MelosWorkspace (ensures demo + freshly imported songs appear immediately). */
  melosSongs?: MelosSong[];
  /** Live arrangements from MelosWorkspace. */
  melosArrangements?: MelosArrangement[];
  /** Optional arrangement pre-selected from ArrangeRoom ("Send to Chora Mastering Desk"). */
  activeArrangementId?: string | null;
  /** The host's header row — the collaboration panel opens just below it. */
  collabAnchor?: React.RefObject<HTMLElement | null>;
}

const readState = (doc: GrooveDoc): MasteringState => {
  const raw = doc.mixer.master.mastering as unknown as MasteringState | undefined;
  return raw && typeof raw.on === 'boolean' ? raw : defaultMastering();
};

const fmtLufs = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1));
const fmtDur = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;


// Decoded buffers + waveform peaks, cached per content hash for the session — decode once,
// use for the album strip AND audition. Module-level so tab switches don't re-decode.
const bufferCache = new Map<string, AudioBuffer>();
const peakCache = new Map<string, Float32Array>();

async function ensureBuffer(ref: SampleRef): Promise<AudioBuffer | null> {
  const hit = bufferCache.get(ref.key);
  if (hit) return hit;
  const buf = await hydrateSample(ref, decodeCtx());
  if (buf) bufferCache.set(ref.key, buf);
  return buf;
}

/** Max-abs per bucket — the strip is a contour read, min/max detail belongs to a zoomed editor. */
function computePeaks(buffer: AudioBuffer, buckets = 600): Float32Array {
  const out = new Float32Array(buckets);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const per = Math.max(1, Math.floor(ch0.length / buckets));
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = b * per, end = Math.min(ch0.length, start + per);
    for (let i = start; i < end; i += 4) { // stride 4 — a contour doesn't need every sample
      const a = Math.max(Math.abs(ch0[i]), Math.abs(ch1[i]));
      if (a > peak) peak = a;
    }
    out[b] = peak;
  }
  return out;
}

export const ProjectView: React.FC<ProjectViewProps> = ({
  doc,
  snap,
  onMutate,
  productionId,
  melosSongs,
  melosArrangements,
  activeArrangementId,
  collabAnchor,
}) => {
  const state = readState(doc);
  const era = eraById(state.eraId);
  const loud = snap.loudness;
  /** The album's pressing, or null when it's switched off — what a track inherits. */
  const albumPressing = state.on ? state : null;
  const {
    project, mutateProject, saveState, saveNow, reload: reloadProject,
    rev: projectRev, applyRemote: applyRemoteProject, getProject, localId: projectLocalId,
  } = useMasterProject(productionId);
  // Live collaboration on the album project (inert until shared). The master FX rack follows
  // remote edits through the masterFx effect below (reconcileInPlace hands it a new array).
  const projectTitle = project.publishing?.title || 'Album project';
  const co = useChoraCoedit<MasterProjectDoc>({
    kind: 'melos', localId: projectLocalId, title: projectTitle, rev: projectRev, getDoc: getProject, applyRemote: applyRemoteProject,
  });
  const [bay, setBay] = useState<BayId>('pressing');
  const [deckTrackId, setDeckTrackId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [fxTrackId, setFxTrackId] = useState<string | null>(null); // which row's insert rack is open
  const [assetTrackId, setAssetTrackId] = useState<string | null>(null); // which row's lyrics/media panel is open
  const [auditionPos, setAuditionPos] = useState(0); // live audition clock, for the lyric tap-sync
  const [pickingRelease, setPickingRelease] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [timelineH, setTimelineH] = useState(200);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── The unified Suite (master FX rack under the pressing) ────────────────────
  const setMasterFx = useCallback((next: FxInstance[]) => {
    mutateProject((p) => { p.masterFx = next; });
    const e = BeatsEngine.get();
    if (e.isInitialized()) e.updateMasterSuite(next);
    else void e.init().then(() => e.updateMasterSuite(next));
  }, [mutateProject]);

  // ── Per-track insert FX ──────────────────────────────────────────────────────
  const setTrackFx = useCallback((trackId: string, next: FxInstance[]) => {
    mutateProject((p) => { const t = p.tracks.find((x) => x.id === trackId); if (t) t.insertFx = next; });
    // If this track is auditioning right now, rebuild its live chain so edits are heard.
    if (snap.auditionId === trackId) BeatsEngine.get().setAuditionFx(next);
  }, [mutateProject, snap.auditionId]);

  // ── Release format (CD / vinyl / streaming) authoring budget ────────────────
  const discFormat = discFormatById(project.discFormat);
  const fit = checkFormatFit(project, discFormat);
  const setDiscFormat = useCallback((id: string) => { mutateProject((p) => { p.discFormat = id; }); }, [mutateProject]);

  // ── Melos songs / arrangements — the album builds from the record you're writing ──
  const { songs: availableSongs, arrangements, resolveArrangement } = useMelosSongs(productionId, melosSongs, melosArrangements);

  /** Persist to the doc AND push to the live chain — the SpectraPanel two-writer pattern. */
  const apply = useCallback((next: MasteringState) => {
    onMutate((d) => { d.mixer.master.mastering = next as unknown as Record<string, unknown>; });
    const e = BeatsEngine.get();
    if (e.isInitialized()) e.updateMastering(next);
    else void e.init().then(() => e.updateMastering(next));
  }, [onMutate]);

  const pickEra = useCallback((id: string) => {
    const profile = ERA_PROFILES.find((p) => p.id === id);
    if (!profile) return;
    apply(applyEra(readState(doc), profile));
  }, [apply, doc]);

  const pickEngineer = useCallback((id: string) => {
    const cur = readState(doc);
    const next: MasteringState = { ...cur, engineerId: cur.engineerId === id ? null : id };
    const profile = eraById(next.eraId);
    apply(profile ? applyEra(next, profile) : next);
  }, [apply, doc]);

  // ── Album track import ───────────────────────────────────────────────────────
  const importFiles = useCallback(async (files: FileList | File[]) => {
    setBusy('import');
    try {
      for (const file of Array.from(files)) {
        const title = file.name.replace(/\.[^.]+$/, '');
        const ingested = await ingestSample(file, file.name, decodeCtx());
        if (!ingested) { setProgress(`Couldn't read ${file.name}`); continue; }
        void backupToLocker(ingested.ref).then((url) => {
          if (url) mutateProject((p) => { const t = p.tracks.find((x) => x.sample.key === ingested.ref.key); if (t) t.sample.lockerUrl = url; });
        });
        mutateProject((p) => {
          p.tracks.push({ id: projectUid(), title, sample: ingested.ref, gainDb: 0, mastering: null });
        });
      }
    } finally {
      setBusy(null);
      setTimeout(() => setProgress(null), 4000);
    }
  }, [mutateProject]);

  /**
   * Pull an arrangement's songs onto the proof sheet, in running order. The song's lyrics and
   * its id ride along, so the record never loses the writing it came from — and Publish carries
   * those lyrics to Chora. Songs without uploaded audio yet get a synthesized reference stem so
   * the full arrangement sequence is always represented on the Mastering Desk.
   */
  const populateFromArrangement = useCallback(async (arrangementId: string) => {
    const resolved = resolveArrangement(arrangementId);
    if (!resolved.length) { setProgress('That arrangement has no songs yet'); setTimeout(() => setProgress(null), 4000); return; }
    setBusy('populate');
    mutateProject((p) => { p.arrangementId = arrangementId; });
    let added = 0, refCount = 0;
    try {
      for (const r of resolved) {
        if (project.tracks.some((t) => t.sourceSongId === r.song.id)) continue;
        setProgress(`Pulling ${r.song.title}…`);
        try {
          let blob: Blob | null = null;
          if (r.url) {
            try {
              const res = await fetch(r.url);
              if (res.ok) blob = await res.blob();
            } catch { /* fallback to synthesized reference */ }
          }
          if (!blob) {
            blob = synthesizeSongReferenceWav(r.song);
            refCount++;
          }
          const ingested = await ingestSample(blob, `${r.song.title}.wav`, decodeCtx());
          if (!ingested) continue;
          if (r.url) void backupToLocker(ingested.ref);
          mutateProject((p) => {
            p.tracks.push({
              id: projectUid(),
              title: r.song.title || 'Untitled',
              sample: ingested.ref,
              gainDb: 0,
              mastering: null,
              lyrics: r.lyrics || undefined,
              sourceSongId: r.song.id,
            });
          });
          added++;
        } catch { /* ignore individual failure */ }
      }
      setProgress(
        added > 0
          ? `Loaded ${added} song${added === 1 ? '' : 's'} onto Mastering Desk${refCount ? ` (${refCount} reference stem${refCount === 1 ? '' : 's'})` : ''}`
          : 'All arrangement tracks are already on the Mastering Desk',
      );
      setTimeout(() => setProgress(null), 5000);
    } finally { setBusy(null); }
  }, [resolveArrangement, mutateProject, project.tracks]);

  // Auto-load when user clicks "Send to Chora Mastering Desk" from ArrangeRoom
  const lastAutoLoadedArrRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeArrangementId && activeArrangementId !== lastAutoLoadedArrRef.current && arrangements.some((a) => a.id === activeArrangementId)) {
      lastAutoLoadedArrRef.current = activeArrangementId;
      void populateFromArrangement(activeArrangementId);
    }
  }, [activeArrangementId, arrangements, populateFromArrangement]);

  /** Bounce the room's groove and drop it onto the proof sheet as an album track. */
  const addGrooveAsTrack = useCallback(async () => {
    setBusy('bounce');
    setProgress(`Bouncing ${doc.name}…`);
    try {
      const result = await renderGroove(doc, BeatsEngine.get().getSampleEntries(), { range: 'song', bitDepth: 24 });
      if (!result) { setProgress('The groove could not be bounced'); return; }
      await importFiles([new File([result.blob], `${doc.name || 'Groove'}.wav`, { type: 'audio/wav' })]);
      setProgress(null);
    } finally { setBusy(null); }
  }, [doc, importFiles]);

  // ── Audition — hear a track through its insert FX + pressing without leaving the sheet ──
  const toggleAudition = useCallback(async (t: ProjectTrack) => {
    const e = BeatsEngine.get();
    if (snap.auditionId === t.id) { e.stopAudition(); return; }
    const buf = await ensureBuffer(t.sample);
    if (!buf) { setProgress(`Couldn't load ${t.title}`); setTimeout(() => setProgress(null), 4000); return; }
    await e.playAudition(t.id, buf, t.mastering ?? null, t.insertFx, { fileOffsetSec: t.startOffsetSec ?? 0, durationSec: effectiveDur(t) });
  }, [snap.auditionId]);

  // ── The desk transport: a cursor, play-from-cursor rolling through the album, loop In→Out ──
  const ensureTrackBuffer = useCallback((t: ProjectTrack) => ensureBuffer(t.sample), []);
  const transportError = useCallback((m: string) => { setProgress(m); setTimeout(() => setProgress(null), 4000); }, []);
  const transport = useDeskTransport(project, ensureTrackBuffer, transportError);

  // Whatever song starts playing loads into the deck.
  useEffect(() => {
    if (snap.auditionId && project.tracks.some((t) => t.id === snap.auditionId)) setDeckTrackId(snap.auditionId);
  }, [snap.auditionId, project.tracks]);

  // A release pressed here reports back from the Album Creator — the desk follows it from then on.
  useEffect(() => {
    const onPublished = (e: Event) => {
      const alb = (e as CustomEvent).detail?.album as { id?: string; melosSource?: { prodId?: string; projectId?: string } } | undefined;
      if (!alb?.id || !alb.melosSource) return;
      if ((alb.melosSource.prodId ?? null) !== (productionId ?? null)) return;
      mutateProject((p) => { const d = deskOf(p); d.publish = { ...(d.publish ?? {}), choraAlbumId: alb.id, choraPublishedAt: Date.now() }; });
    };
    window.addEventListener('CHORA_ALBUM_PUBLISHED', onPublished);
    return () => window.removeEventListener('CHORA_ALBUM_PUBLISHED', onPublished);
  }, [productionId, mutateProject]);

  const linkAlbum = useCallback((id: string) => {
    mutateProject((p) => { const d = deskOf(p); d.publish = { ...(d.publish ?? {}), choraAlbumId: id }; });
  }, [mutateProject]);

  // A live audition clock — the lyric tap-sync stamps against this, so it must tick, not
  // re-read on render. Only runs while an asset panel is open and something is playing.
  useEffect(() => {
    if (!assetTrackId || snap.auditionId !== assetTrackId) return;
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); setAuditionPos(BeatsEngine.get().auditionPosSec()); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [assetTrackId, snap.auditionId]);

  // Push a saved Suite to the live rack once audio exists (mirrors the pressing's sync).
  useEffect(() => {
    if (!project.masterFx?.length) return;
    const e = BeatsEngine.get();
    if (e.isInitialized()) e.updateMasterSuite(project.masterFx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.masterFx, snap.suspended]);

  // ── The album strip — the whole record on one clock ─────────────────────────
  // Two layers, the ScrollingWaveform pattern: waveform, crossfade zones, fade envelopes,
  // markers and the ruler bake once to an offscreen canvas when the data changes; a rAF loop
  // blits that and draws only the live parts on top (playhead, range). Dragging a range or
  // moving the playhead therefore never re-decodes or re-bakes anything.
  const stripRef = useRef<HTMLCanvasElement>(null);
  const bakeRef = useRef<HTMLCanvasElement | null>(null);
  const [peaksRev, setPeaksRev] = useState(0);
  // The strip's drag range IS the project's In/Out locators — one range, shared with the timeline.
  const range = project.inSec != null && project.outSec != null ? { a: project.inSec, b: project.outSec } : null;
  const setRange = useCallback((r: { a: number; b: number } | null) => mutateProject((p) => {
    if (!r) { p.inSec = undefined; p.outSec = undefined; return; }
    p.inSec = Math.min(r.a, r.b); p.outSec = Math.max(r.a, r.b);
  }), [mutateProject]);
  const auditionOrigin = transport.originRef;

  // Peak access for the multitrack timeline (shares the module-level cache with the strip).
  const getPeaks = useCallback((key: string) => { void peaksRev; return peakCache.get(key); }, [peaksRev]);
  const ensurePeaks = useCallback((t: ProjectTrack) => {
    if (peakCache.has(t.sample.key)) return;
    void ensureBuffer(t.sample).then((buf) => {
      if (buf && !peakCache.has(t.sample.key)) { peakCache.set(t.sample.key, computePeaks(buf)); setPeaksRev((r) => r + 1); }
    });
  }, []);

  const layout = albumLayout(project);
  const totalSec = Math.max(0.001, layout.totalSec);
  const totalRef = useRef(totalSec); totalRef.current = totalSec;
  const cursorRef = useRef(transport.cursorSec); cursorRef.current = transport.cursorSec;
  const getPlayPosRef = useRef(transport.getPlayPos); getPlayPosRef.current = transport.getPlayPos;
  const rangeRef = useRef(range); rangeRef.current = range;
  // Any edit that changes the drawing changes this string — the bake's only dependency.
  const trackSig = project.tracks
    .map((t) => `${t.id}:${t.gapSec ?? 0}:${t.fadeInSec ?? 0}:${t.fadeOutSec ?? 0}:${t.mastering?.eraId ?? ''}`)
    .join('|') + `#${(project.markers ?? []).map((m) => `${m.timeSec.toFixed(2)}${m.label}`).join(',')}`;

  useEffect(() => {
    const host = stripRef.current;
    if (!host || project.tracks.length === 0) { bakeRef.current = null; return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = host.clientWidth, h = host.clientHeight;
    if (w === 0) return;
    const bake = bakeRef.current ?? document.createElement('canvas');
    bakeRef.current = bake;
    bake.width = Math.round(w * dpr); bake.height = Math.round(h * dpr);
    const g = bake.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const x = (t: number) => (t / totalSec) * w;
    const mid = h * 0.48;
    const amp = h * 0.33;
    const laidTracks = layout.tracks;

    // Gaps first, underneath: a dotted baseline so silence reads as intentional.
    for (let i = 0; i < laidTracks.length - 1; i++) {
      const gapStart = laidTracks[i].endSec, gapEnd = laidTracks[i + 1].startSec;
      if (gapEnd - gapStart < 0.05) continue;
      g.fillStyle = 'rgba(255,255,255,0.14)';
      for (let px = x(gapStart) + 2; px < x(gapEnd) - 1; px += 4) g.fillRect(px, mid - 0.5, 2, 1);
    }

    for (const laid of laidTracks) {
      const t = laid.track;
      const dur = laid.endSec - laid.startSec;
      const x0 = x(laid.startSec), x1 = x(laid.endSec);
      const segW = Math.max(2, x1 - x0);
      const trackEra = t.mastering ? eraById(t.mastering.eraId) : era;
      const color = trackEra?.discColor || '#D0BCFF';

      const peaks = peakCache.get(t.sample.key);
      if (peaks) {
        const grad = g.createLinearGradient(0, mid - amp, 0, mid + amp);
        grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(255,255,255,0.12)');
        g.fillStyle = grad;
        g.globalAlpha = 0.85;
        const cols = Math.max(6, Math.floor(segW / 2));
        for (let c = 0; c < cols; c++) {
          const p = peaks[Math.floor((c / cols) * peaks.length)] || 0;
          const a = Math.max(1, p * amp);
          g.fillRect(x0 + c * (segW / cols), mid - a, Math.max(1, segW / cols - 0.7), a * 2);
        }
        g.globalAlpha = 1;
      } else {
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x0 + 2, mid - 0.5, Math.max(1, segW - 4), 1);
        void ensureBuffer(t.sample).then((buf) => {
          if (buf && !peakCache.has(t.sample.key)) { peakCache.set(t.sample.key, computePeaks(buf)); setPeaksRev((r) => r + 1); }
        });
      }

      // The crossfade zone, tinted — the two fade lines cross inside it.
      if (laid.overlapSec > 0) {
        const ox0 = x(laid.endSec - laid.overlapSec);
        g.fillStyle = 'rgba(212,0,85,0.18)';
        g.fillRect(ox0, mid - amp, Math.max(1, x1 - ox0), amp * 2);
      }
      // Fade envelopes drawn as lines, the way every DAW draws them.
      const fin = Math.max(0, Math.min(t.fadeInSec ?? 0, dur / 2));
      const fout = Math.max(0, Math.min(t.fadeOutSec ?? 0, dur / 2));
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1;
      if (fin > 0.01) {
        g.beginPath(); g.moveTo(x0, mid + amp); g.lineTo(x(laid.startSec + fin), mid - amp); g.stroke();
      }
      if (fout > 0.01) {
        g.beginPath(); g.moveTo(x(laid.endSec - fout), mid - amp); g.lineTo(x1, mid + amp); g.stroke();
      }

      // Boundary + serif numeral: the proof-sheet read.
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(x0, 0, 1, h - 12);
      g.font = '11px Georgia, serif';
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillText(String(laid.index + 1), x0 + 5, 12);
    }

    // Markers — index points on the programme.
    for (const m of project.markers ?? []) {
      const mx = x(Math.min(m.timeSec, totalSec));
      g.strokeStyle = 'rgba(255,140,0,0.8)';
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, h - 12); g.stroke();
      g.setLineDash([]);
      g.fillStyle = ARMED;
      g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx + 7, 4); g.lineTo(mx, 8); g.closePath(); g.fill();
      g.font = '8px ui-monospace, monospace';
      g.fillText(m.label.slice(0, 14), mx + 9, 8);
    }

    // Ruler: a tick per minute (or 15 s for short records).
    const step = totalSec > 600 ? 120 : totalSec > 120 ? 60 : 15;
    g.font = '8px ui-monospace, monospace';
    for (let t = 0; t <= totalSec; t += step) {
      const tx = x(t);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(tx, h - 10, 1, 4);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      if (t > 0 || totalSec < 1e9) g.fillText(fmtDur(t), tx + 3, h - 2);
    }
  }, [trackSig, peaksRev, era, totalSec, project.markers, project.tracks, layout.tracks]);

  // The live layer: blit the bake, then the range and the playhead.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = stripRef.current;
      if (!cv) return;
      const g = cv.getContext('2d');
      if (!g) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w === 0) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      const bake = bakeRef.current;
      if (bake && bake.width === cv.width) g.drawImage(bake, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const x = (t: number) => (t / totalRef.current) * w;

      const r = rangeRef.current;
      if (r) {
        const rx0 = x(Math.min(r.a, r.b)), rx1 = x(Math.max(r.a, r.b));
        g.fillStyle = 'rgba(0,218,243,0.10)';
        g.fillRect(rx0, 0, Math.max(1, rx1 - rx0), h - 12);
        g.strokeStyle = PLAYHEAD; g.lineWidth = 1.5;
        for (const [bx, dir] of [[rx0, 1], [rx1, -1]] as [number, number][]) {
          g.beginPath();
          g.moveTo(bx + 5 * dir, 2); g.lineTo(bx, 2); g.lineTo(bx, h - 14); g.lineTo(bx + 5 * dir, h - 14);
          g.stroke();
        }
      }

      // The cursor (where Play starts), then the playhead.
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillRect(x(cursorRef.current), 0, 1, h - 12);
      const e = BeatsEngine.get();
      if (e.auditionId()) {
        const live = getPlayPosRef.current();
        const px = x(live ?? (auditionOrigin.current + e.auditionPosSec()));
        g.fillStyle = PLAYHEAD;
        g.fillRect(px, 0, 1.5, h - 12);
        g.beginPath(); g.moveTo(px - 3, 0); g.lineTo(px + 3, 0); g.lineTo(px, 5); g.closePath(); g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drag = select a range (to audition a transition); click = audition that track.
  const dragRef = useRef<{ startX: number; startT: number; moved: boolean } | null>(null);
  const secAtEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(totalSec, ((e.clientX - rect.left) / Math.max(1, rect.width)) * totalSec));
  }, [totalSec]);

  const onStripDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Capture keeps the drag alive past the canvas edge; it throws if the pointer already
    // went away, and losing capture is not a reason to lose the drag.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    dragRef.current = { startX: e.clientX, startT: secAtEvent(e), moved: false };
  }, [secAtEvent]);

  const onStripMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < 4) return; // a click, not a drag
    d.moved = true;
    setRange({ a: d.startT, b: secAtEvent(e) });
  }, [secAtEvent]);

  const onStripUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    // A click places the cursor and plays from there — the whole record rolls on from it.
    transport.setCursor(d.startT);
    void transport.play(d.startT);
  }, [transport]);

  /** Render just the selected span of the continuous album and play it — hear the transition. */
  const auditionRange = useCallback(async () => {
    const e = BeatsEngine.get();
    if (snap.auditionId === 'range') { e.stopAudition(); return; }
    if (!range) return;
    const a = Math.min(range.a, range.b), b = Math.max(range.a, range.b);
    setBusy('range');
    setProgress('Rendering the transition…');
    try {
      const res = await renderAlbumContinuous(project, albumPressing, { startSec: a, endSec: b });
      if (!res) { setProgress('Nothing in that range'); return; }
      auditionOrigin.current = a;
      // The pressing is baked into this render, so play it with the chain bypassed.
      await e.playAudition('range', res.buffer, { ...defaultMastering(), on: false });
      setProgress(null);
    } finally { setBusy(null); }
  }, [range, project, albumPressing, snap.auditionId]);

  const addMarker = useCallback(() => {
    const at = range ? Math.min(range.a, range.b) : transport.getPlayPos() ?? transport.cursorSec;
    mutateProject((p) => {
      const next = [...(p.markers ?? []), { id: projectUid(), timeSec: at, label: `Mark ${(p.markers?.length ?? 0) + 1}` }];
      p.markers = next.sort((m, n) => m.timeSec - n.timeSec);
    });
  }, [range, mutateProject, transport]);

  // Goniometer — persistence-faded Lissajous off the worklet's decimated L/R feed.
  const gonioRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let lastXy: number[] | undefined;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = gonioRef.current;
      if (!cv) return;
      const g = cv.getContext('2d');
      if (!g) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w === 0) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
      // Persistence: fade what's there instead of clearing — the phosphor look.
      g.fillStyle = 'rgba(10,10,13,0.16)';
      g.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.beginPath(); g.moveTo(cx - R, cy + R); g.lineTo(cx + R, cy - R); g.stroke();
      g.beginPath(); g.moveTo(cx - R, cy - R); g.lineTo(cx + R, cy + R); g.stroke();
      const xy = BeatsEngine.get().loudness()?.xy;
      if (!xy || xy === lastXy || xy.length < 2) return;
      lastXy = xy;
      g.fillStyle = era?.discColor || '#00DAF3';
      for (let i = 0; i < xy.length; i += 2) {
        const l = xy[i], r = xy[i + 1];
        // M vertical, S horizontal — the broadcast convention.
        const px = cx + (l - r) * 0.7071 * R * 1.6;
        const py = cy - (l + r) * 0.7071 * R * 1.6;
        if (px >= 0 && px <= w && py >= 0 && py <= h) g.fillRect(px, py, 1.4, 1.4);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [era]);

  // ── Release actions ──────────────────────────────────────────────────────────

  const runRender = useCallback(async () => {
    const rendered = await renderAlbum(project, albumPressing, (done, total, title) => {
      setProgress(title ? `Pressing ${title}… (${done + 1}/${total})` : null);
    });
    if (rendered.failed.length) setProgress(`Couldn't render: ${rendered.failed.join(', ')}`);
    return rendered;
  }, [project, albumPressing]);

  const publishToChora = useCallback(async () => {
    if (!project.tracks.length) return;
    setBusy('publish');
    try {
      const rendered = await runRender();
      if (rendered.files.length) { seedAlbumCreator(project, rendered, { prodId: productionId }); setProgress(null); }
    } finally { setBusy(null); }
  }, [project, runRender, productionId]);

  const exportZip = useCallback(async () => {
    if (!project.tracks.length) return;
    setBusy('zip');
    try {
      const rendered = await runRender();
      if (!rendered.files.length) return;
      // The continuous programme is the only file that can contain a crossfade, so it ships too.
      let continuous: Blob | null = null;
      if (project.tracks.length > 1) {
        setProgress('Pressing the continuous programme…');
        continuous = (await renderAlbumContinuous(project, albumPressing))?.blob ?? null;
      }
      setProgress('Zipping…');
      const blob = await exportAlbumZip(project, rendered, continuous);
      const name = (project.publishing.title || doc.name || 'Album').replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'Album';
      downloadBlob(blob, `${name} — Master.zip`);
      setProgress(null);
    } finally { setBusy(null); }
  }, [project, doc.name, runRender, albumPressing]);

  // Post-chain spectrum scope, drawn straight off the mastering analyser — no React churn.
  const scopeRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let bins: Float32Array | null = null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = scopeRef.current;
      const dev = BeatsEngine.get().masteringDevice();
      if (!cv) return;
      const g = cv.getContext('2d');
      if (!g) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w === 0) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (h * i) / 4); g.lineTo(w, (h * i) / 4); g.stroke(); }
      if (!dev) return;
      if (!bins || bins.length !== dev.binCount) bins = new Float32Array(dev.binCount);
      dev.spectrum(bins);
      const sr = dev.sampleRate;
      const fMin = 20, fMax = 20000;
      g.beginPath();
      let started = false;
      for (let px = 0; px < w; px += 2) {
        const f = fMin * Math.pow(fMax / fMin, px / w);
        const bin = Math.min(bins.length - 1, Math.round((f / (sr / 2)) * bins.length));
        // +4.5 dB/oct tilt (research digest §3) so a well-balanced master reads ~flat.
        const tilt = 4.5 * Math.log2(f / 1000);
        const db = bins[bin] + tilt;
        const y = h - ((db + 90) / 70) * h;
        if (!started) { g.moveTo(px, Math.min(h, Math.max(0, y))); started = true; }
        else g.lineTo(px, Math.min(h, Math.max(0, y)));
      }
      g.strokeStyle = era ? era.discColor : '#D0BCFF';
      g.lineWidth = 1.4;
      g.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [era]);

  const grooveTracks = doc.arrangement.filter((t) => !t.padOwned);
  const psr = loud && Number.isFinite(loud.tp) && Number.isFinite(loud.s) ? loud.tp - loud.s : undefined;
  const plr = loud && Number.isFinite(loud.tp) && Number.isFinite(loud.i) ? loud.tp - loud.i : undefined;
  const pub = project.publishing;

  const selectedIdx = project.tracks.findIndex((t) => t.id === selectedTrackId);
  const printPhysical = async () => {
    setBusy('physical');
    try {
      const pkg = await exportPhysicalPackage(project, albumPressing, (m) => setProgress(m || null));
      if (pkg) downloadBlob(pkg.blob, pkg.filename);
    } finally { setBusy(null); setProgress(null); }
  };

  // ── The Mastering Desk's half of the studio menu bar ──
  const menus: MenuGroup[] = [
    {
      label: 'File',
      items: [
        { id: 'desk-save', label: 'Save mastering project', hint: 'Ctrl+S', onSelect: () => { void saveNow(); } },
        'sep',
        { id: 'desk-import', label: 'Import tracks…', disabled: !!busy, onSelect: () => fileRef.current?.click() },
        { id: 'desk-groove', label: 'Add this groove as a track', disabled: !!busy, onSelect: () => { void addGrooveAsTrack(); } },
        { id: 'desk-release', label: 'Open a Chora release…', disabled: !!busy, onSelect: () => setPickingRelease(true) },
        'sep',
        { id: 'desk-zip', label: 'Export master ZIP', hint: 'WAV + release.json', disabled: !!busy || !project.tracks.length, onSelect: () => { void exportZip(); } },
        { id: 'desk-physical', label: `Print ${presetById(project.desk?.physical?.presetId).label} package`, disabled: !!busy || !project.tracks.length, onSelect: () => { void printPhysical(); } },
        { id: 'desk-publish', label: 'Publish to Chora…', disabled: !!busy || !project.tracks.length, onSelect: () => { void publishToChora(); } },
      ],
    },
    {
      label: 'Edit',
      items: [
        { id: 'desk-marker', label: 'Add marker at cursor', hint: 'M', onSelect: addMarker },
        { id: 'desk-in', label: 'Set In at cursor', hint: 'I', onSelect: () => mutateProject((p) => { p.inSec = transport.getPlayPos() ?? transport.cursorSec; }) },
        { id: 'desk-out', label: 'Set Out at cursor', hint: 'O', onSelect: () => mutateProject((p) => { p.outSec = transport.getPlayPos() ?? transport.cursorSec; }) },
        { id: 'desk-clear-range', label: 'Clear In / Out', disabled: !range, onSelect: () => setRange(null) },
        'sep',
        { id: 'desk-up', label: 'Move selected track earlier', disabled: selectedIdx <= 0, onSelect: () => mutateProject((p) => moveTrack(p, selectedIdx, selectedIdx - 1)) },
        { id: 'desk-down', label: 'Move selected track later', disabled: selectedIdx < 0 || selectedIdx >= project.tracks.length - 1, onSelect: () => mutateProject((p) => moveTrack(p, selectedIdx, selectedIdx + 1)) },
        { id: 'desk-remove', label: 'Remove selected track', danger: true, disabled: selectedIdx < 0, onSelect: () => mutateProject((p) => { p.tracks = p.tracks.filter((t) => t.id !== selectedTrackId); }) },
      ],
    },
    {
      label: 'View',
      items: [
        ...BAYS.map((b) => ({ id: `desk-bay-${b.id}`, label: b.label, checked: bay === b.id, onSelect: () => setBay(b.id) })),
        'sep' as const,
        { id: 'desk-deck', label: 'Track deck', checked: !!deckTrackId, disabled: !project.tracks.length, onSelect: () => setDeckTrackId(deckTrackId ? null : (selectedTrackId ?? project.tracks[0]?.id ?? null)) },
      ],
    },
    {
      label: 'Transport',
      items: [
        { id: 'desk-play', label: transport.playing ? 'Stop' : 'Play from cursor', hint: 'Space', disabled: !project.tracks.length, onSelect: () => { if (transport.playing) transport.stop(); else void transport.play(); } },
        { id: 'desk-start', label: 'Return to start', hint: 'Home', onSelect: () => transport.setCursor(0) },
        { id: 'desk-loop', label: 'Loop In → Out', hint: 'L', checked: !!project.loopOn, onSelect: () => mutateProject((p) => { p.loopOn = !p.loopOn; }) },
        { id: 'desk-range', label: 'Play In → Out (rendered)', disabled: !range, onSelect: () => { void auditionRange(); } },
        'sep',
        { id: 'desk-pressing', label: state.on ? 'Pressing on' : 'Pressing off', checked: state.on, onSelect: () => apply({ ...state, on: !state.on }) },
      ],
    },
  ];

  const deckTrack = project.tracks.find((t) => t.id === deckTrackId) ?? null;
  const deckLaid = deckTrack ? layout.tracks.find((l) => l.track.id === deckTrack.id) : undefined;
  const bayProps = { project, mutate: mutateProject, productionId };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <StudioMenuPublisher owner="mastering" menus={menus} save={{ state: saveState, onSave: () => { void saveNow(); }, what: 'mastering project' }} />
      <CollabDock<MasterProjectDoc>
        co={co}
        kind="melos"
        title={projectTitle}
        doc={project}
        localId={projectLocalId}
        serialize={(p) => JSON.stringify(p)}
        restoreSolo={(json) => {
          const restored = JSON.parse(json) as MasterProjectDoc;
          if (!restored || !Array.isArray(restored.tracks)) return;
          mutateProject((p) => { reconcileInPlace(p, { ...restored, id: p.id }); });
          void saveNow();
        }}
        anchor={collabAnchor}
        top={collabAnchor ? undefined : 56}
        pill="bottom-right"
      />
      <div className="flex-1 min-h-0 overflow-auto p-4">
      <div className={`${slabPanel} p-5`}>

        {/* ── The hero: what pressing is this record? ── */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-extrabold tracking-[0.28em] uppercase text-[#D0BCFF]">Chora Mastering Desk · The Pressing & Distribution</div>
            <h2 className="mt-1 text-[26px] leading-tight text-white" style={{ fontFamily: SERIF }}>
              {era ? <>Master it like <i style={{ color: era.discColor }}>{era.year}</i>.</> : <>Choose a pressing for <i>{pub.title || doc.name}</i>.</>}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Arrangement selector — the running orders you keep in Melos. */}
            {arrangements.length > 0 && (
              <select
                value={project.arrangementId ?? ''}
                onChange={(e) => { if (e.target.value) void populateFromArrangement(e.target.value); }}
                disabled={!!busy}
                className="h-8 rounded-lg bg-black/40 border border-white/12 text-[11px] text-white/80 px-2 outline-none disabled:opacity-40"
                aria-label="Build the album from a Melos arrangement"
                title="Pull the songs of a Melos running order onto the proof sheet"
              >
                <option value="">Build from arrangement…</option>
                {arrangements.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.isPrimary ? ' ★' : ''} · {a.songIds.length} songs</option>
                ))}
              </select>
            )}
            {availableSongs.length > 0 && (
              <select
                value=""
                onChange={async (e) => {
                  const song = availableSongs.find((s) => s.id === e.target.value);
                  if (!song) return;
                  setBusy('populate');
                  setProgress(`Pulling ${song.title}…`);
                  try {
                    const url = song.trackRef?.url ?? song.takes?.find((t) => !!t.url)?.url ?? null;
                    let blob: Blob | null = null;
                    if (url) {
                      try {
                        const res = await fetch(url);
                        if (res.ok) blob = await res.blob();
                      } catch { /* fallback */ }
                    }
                    if (!blob) blob = synthesizeSongReferenceWav(song);
                    const ingested = await ingestSample(blob, `${song.title}.wav`, decodeCtx());
                    if (ingested) {
                      mutateProject((p) => {
                        p.tracks.push({
                          id: projectUid(),
                          title: song.title || 'Untitled',
                          sample: ingested.ref,
                          gainDb: 0,
                          mastering: null,
                          sourceSongId: song.id,
                        });
                      });
                    }
                  } finally {
                    setBusy(null);
                    setTimeout(() => setProgress(null), 3000);
                  }
                }}
                disabled={!!busy}
                className="h-8 rounded-lg bg-black/40 border border-white/12 text-[11px] text-white/80 px-2 outline-none disabled:opacity-40"
                aria-label="Add song from Tracklist"
              >
                <option value="">+ Add from Tracklist…</option>
                {availableSongs.map((s) => (
                  <option key={s.id} value={s.id}>{s.title} ({s.commitment})</option>
                ))}
              </select>
            )}
            {progress && <span className="text-[10px] font-mono text-[#FF8C00]">{progress}</span>}
            <button
              onClick={() => apply({ ...state, on: !state.on })}
              className="h-8 px-4 rounded-full text-[11px] font-bold border transition-colors"
              style={state.on
                ? { color: '#06D6A0', borderColor: 'rgba(6,214,160,0.5)', background: 'rgba(6,214,160,0.08)' }
                : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.15)' }}
            >{state.on ? 'PRESSING ON' : 'PRESSING OFF'}</button>
            <button
              onClick={() => { void exportZip(); }}
              disabled={!!busy || project.tracks.length === 0}
              title="Render every track through its pressing and download a ZIP: numbered WAVs + release.json"
              className="h-8 px-3.5 rounded-full text-[11px] font-bold border border-white/20 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 flex items-center gap-1.5"
            ><Package size={12} /> {busy === 'zip' ? 'Rendering…' : 'Export ZIP'}</button>
            {/* Brand gradient: this is the Project room's publish CTA, same action class as the wordmark rule allows. */}
            <button
              onClick={() => { void publishToChora(); }}
              disabled={!!busy || project.tracks.length === 0}
              title="Render the mastered album and hand it to the Album Creator to release on Chora"
              className="h-8 px-4 rounded-full text-[11px] font-semibold text-white disabled:opacity-30 flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #6B0099, #D40055)', boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}
            ><UploadCloud size={12} /> {busy === 'publish' ? 'Pressing…' : 'Publish to Chora'}</button>
          </div>
        </div>

        {/* ── The desk's bays ── */}
        <nav className="flex gap-1 mt-4 overflow-x-auto no-scrollbar border-b border-white/[0.08] pb-2" aria-label="Mastering desk sections">
          {BAYS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBay(b.id)}
              aria-current={bay === b.id ? 'page' : undefined}
              className="h-8 px-3 rounded-lg text-[10.5px] font-bold uppercase tracking-[0.12em] whitespace-nowrap border transition-colors"
              style={bay === b.id
                ? { color: '#fff', borderColor: 'rgba(212,0,85,0.55)', background: 'rgba(212,0,85,0.14)' }
                : { color: 'rgba(255,255,255,0.45)', borderColor: 'transparent' }}
            >{b.label}</button>
          ))}
        </nav>

        {/* ── The deck — whatever's playing, with its lyric sync ── */}
        {deckTrack && (
          <div className="mt-4">
            <TrackDeck
              track={deckTrack}
              index={deckLaid?.index ?? 0}
              artist={pub.artist}
              cover={deckTrack.images?.[0] || project.coverImage}
              color={(deckTrack.mastering ? eraById(deckTrack.mastering.eraId)?.discColor : era?.discColor) || '#D0BCFF'}
              peaks={getPeaks(deckTrack.sample.key)}
              getPos={() => {
                const live = transport.getPlayPos();
                if (live != null && snap.auditionId === deckTrack.id) return live - (deckLaid?.startSec ?? 0);
                if (snap.auditionId === deckTrack.id) return BeatsEngine.get().auditionPosSec();
                return null;
              }}
              playing={snap.auditionId === deckTrack.id}
              onPlayFrom={(sec) => { void transport.play((deckLaid?.startSec ?? 0) + sec); }}
              onStop={() => transport.stop()}
              onPatch={(fn) => mutateProject((p) => { const x = p.tracks.find((a) => a.id === deckTrack.id); if (x) fn(x); })}
              onClose={() => setDeckTrackId(null)}
            />
          </div>
        )}

        {bay === 'physical' && <div className="mt-4"><PhysicalMediaBay {...bayProps} albumPressing={albumPressing} onApplyPressing={(patch) => apply({ ...state, ...patch })} /></div>}
        {bay === 'credits' && <div className="mt-4"><CreditsBay {...bayProps} /></div>}
        {bay === 'artwork' && <div className="mt-4"><ArtworkBay {...bayProps} /></div>}
        {bay === 'release' && <div className="mt-4"><ReleaseBay {...bayProps} /></div>}
        {bay === 'media' && <div className="mt-4"><MediaBay {...bayProps} /></div>}
        {bay === 'visuals' && <div className="mt-4"><VisualsBay {...bayProps} /></div>}
        {bay === 'mixes' && <div className="mt-4"><MixesShowBay {...bayProps} albumPressing={albumPressing} /></div>}
        {bay === 'pixels' && <div className="mt-4"><PixelsBay {...bayProps} albumPressing={albumPressing} /></div>}
        {bay === 'intel' && <div className="mt-4"><IntelBay {...bayProps} onLinkAlbum={linkAlbum} /></div>}
        {bay === 'publish' && (
          <div className="mt-4">
            <PublishBay
              {...bayProps}
              busy={busy}
              onPublishChora={() => { void publishToChora(); }}
              onExportZip={() => { void exportZip(); }}
              onGoBay={(b) => setBay(b as BayId)}
              onLinkAlbum={linkAlbum}
            />
          </div>
        )}

        {bay === 'pressing' && (<>
        {/* ── The era shelf ── */}
        <div className="flex gap-2.5 mt-4 overflow-x-auto pb-2">
          {ERA_PROFILES.map((p) => {
            const on = state.eraId === p.id && state.on;
            return (
              <button
                key={p.id}
                onClick={() => pickEra(p.id)}
                className="flex-none w-[96px] rounded-[12px] border text-center transition-all"
                style={on
                  ? { borderColor: SELECT, boxShadow: `0 0 0 1px ${SELECT}, 0 10px 28px rgba(212,0,85,0.25)`, background: 'rgba(255,255,255,0.05)' }
                  : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}
                title={`${p.decade} — ${p.label}`}
              >
                <div className="h-[58px] grid place-items-center">
                  <div className="w-10 h-10 rounded-full border border-white/20 relative"
                    style={{ background: 'repeating-radial-gradient(circle, #111 0 1px, #1d1d1f 1px 2.5px)' }}>
                    <div className="absolute inset-[13px] rounded-full" style={{ background: p.discColor }} />
                  </div>
                </div>
                <div className="text-[15px] text-white" style={{ fontFamily: SERIF }}>{p.year}</div>
                <div className="pb-2 text-[8px] uppercase tracking-[0.1em]" style={{ color: on ? '#ff5c93' : 'rgba(255,255,255,0.35)' }}>{p.label}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 mt-4">

          {/* ── Left: album proof sheet + master rack ── */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">
                Proof Sheet · Running Order
                <span className="ml-2 normal-case tracking-normal font-mono text-white/25">{saveState === 'local' ? 'in memory' : saveState}</span>
                {project.tracks.length > 0 && (
                  <span className="ml-2 normal-case tracking-normal font-mono text-white/25">
                    {project.tracks.length} tracks · {fmtDur(totalSec)}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <input ref={fileRef} type="file" accept="audio/*" multiple className="hidden"
                  onChange={(e) => { if (e.target.files?.length) void importFiles(e.target.files); e.target.value = ''; }} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={!!busy}
                  className="h-7 px-2.5 rounded-lg text-[10px] font-semibold border border-white/15 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 flex items-center gap-1"
                ><Plus size={11} /> {busy === 'import' ? 'Importing…' : 'Import tracks'}</button>
                <button
                  onClick={() => { void addGrooveAsTrack(); }}
                  disabled={!!busy}
                  title="Bounce this groove and add it to the album"
                  className="h-7 px-2.5 rounded-lg text-[10px] font-semibold border border-[#00DAF3]/35 text-[#00DAF3] hover:bg-[#00DAF3]/10 disabled:opacity-30 flex items-center gap-1"
                ><Disc3 size={11} /> {busy === 'bounce' ? 'Bouncing…' : 'Add this groove'}</button>
                {/* Back-port a finished record — a release is never a dead end. */}
                <button
                  onClick={() => setPickingRelease(true)}
                  disabled={!!busy}
                  title="Open one of your Chora releases as a working project — songs, lyrics and details come with it"
                  className="h-7 px-2.5 rounded-lg text-[10px] font-semibold border border-[#D0BCFF]/40 text-[#D0BCFF] hover:bg-[#D0BCFF]/10 disabled:opacity-30 flex items-center gap-1"
                ><Disc3 size={11} /> Open a release</button>
              </div>
            </div>

            <div
              className="mt-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files); }}
            >
              {project.tracks.length === 0 && (
                <div className="py-8 text-center text-[12.5px] text-white/30 border border-dashed border-white/10 rounded-[12px]" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>
                  The sheet is empty — import your songs (or drop audio files here) and sequence the record.
                </div>
              )}
              {project.tracks.length > 0 && (
                <>
                  <div className="h-[96px] rounded-[10px] border border-white/[0.08] bg-black/25 overflow-hidden">
                    <canvas
                      ref={stripRef}
                      onPointerDown={onStripDown}
                      onPointerMove={onStripMove}
                      onPointerUp={onStripUp}
                      className="w-full h-full block cursor-text touch-none"
                      title="The album on one clock — click a track to audition it, drag to select a transition"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 mb-2.5 flex-wrap">
                    <span className="font-mono text-[9px] text-white/30">{fmtDur(totalSec)} programme</span>
                    {range && Math.abs(range.b - range.a) > 0.05 ? (
                      <>
                        <span className="font-mono text-[9px] text-[#00DAF3]">
                          {fmtDur(Math.min(range.a, range.b))} → {fmtDur(Math.max(range.a, range.b))} ({Math.abs(range.b - range.a).toFixed(1)}s)
                        </span>
                        <button
                          onClick={() => { void auditionRange(); }}
                          disabled={busy === 'range'}
                          className="h-6 px-2 rounded-lg text-[9.5px] font-bold border border-[#00DAF3]/40 text-[#00DAF3] hover:bg-[#00DAF3]/10 disabled:opacity-40 flex items-center gap-1"
                          title="Render this span of the album — crossfades included — and play it"
                        >
                          {snap.auditionId === 'range' ? <Square size={8} fill="currentColor" /> : <Play size={8} fill="currentColor" />}
                          {busy === 'range' ? 'Rendering…' : snap.auditionId === 'range' ? 'Stop' : 'Play range'}
                        </button>
                        <button
                          onClick={addMarker}
                          className="h-6 px-2 rounded-lg text-[9.5px] font-bold border border-[#FF8C00]/40 text-[#FF8C00] hover:bg-[#FF8C00]/10 flex items-center gap-1"
                          title="Drop a marker at the range start"
                        ><MapPin size={8} /> Marker</button>
                        <button
                          onClick={() => setRange(null)}
                          className="h-6 px-2 rounded-lg text-[9.5px] border border-white/15 text-white/45 hover:text-white"
                        >Clear</button>
                      </>
                    ) : (
                      <span className="text-[9px] text-white/25">click a track to audition it · drag across a boundary to hear the transition</span>
                    )}
                  </div>
                  {(project.markers ?? []).length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2.5">
                      {(project.markers ?? []).map((m) => (
                        <span key={m.id} className="inline-flex items-center gap-1.5 h-6 pl-2 pr-1 rounded-full border border-[#FF8C00]/30 bg-[#FF8C00]/[0.07]">
                          <span className="font-mono text-[9px] text-[#FF8C00]">{fmtDur(m.timeSec)}</span>
                          <input
                            value={m.label}
                            onChange={(e) => mutateProject((p) => { const x = p.markers?.find((k) => k.id === m.id); if (x) x.label = e.target.value; })}
                            className="w-16 bg-transparent text-[9.5px] text-white/70 outline-none"
                            aria-label={`Marker at ${fmtDur(m.timeSec)}`}
                          />
                          <button
                            onClick={() => mutateProject((p) => { p.markers = (p.markers ?? []).filter((k) => k.id !== m.id); })}
                            className="w-4 h-4 grid place-items-center rounded-full text-white/30 hover:text-[#EF4444]"
                            aria-label={`Remove marker ${m.label}`}
                          ><X size={8} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
              {project.tracks.map((t: ProjectTrack, i: number) => {
                const trackEra = t.mastering ? eraById(t.mastering.eraId) : null;
                const playing = snap.auditionId === t.id;
                return (
                  <React.Fragment key={t.id}>
                  <div
                    className="grid grid-cols-[26px_24px_1fr_auto_auto_auto_auto_auto_auto] items-center gap-2.5 py-2 border-b border-white/[0.06]"
                    style={selectedTrackId === t.id ? { background: 'rgba(212,0,85,0.06)' } : undefined}
                    onClick={(e) => { if ((e.target as HTMLElement).closest('input,select,button')) return; setSelectedTrackId(t.id); }}
                  >
                    {/* Play sits at the far left of the row, where a hand expects it. */}
                    <button
                      onClick={() => {
                        if (playing) { transport.stop(); return; }
                        const laid = layout.tracks.find((l) => l.track.id === t.id);
                        setSelectedTrackId(t.id);
                        void transport.play(laid?.startSec ?? 0); // rolls on into the next song, like a record
                      }}
                      className="w-6 h-6 grid place-items-center rounded-full border"
                      style={playing
                        ? { color: '#061014', background: PLAYHEAD, borderColor: 'transparent' }
                        : { color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.15)' }}
                      aria-label={playing ? `Stop ${t.title}` : `Play ${t.title} through its pressing`}
                      title={playing ? 'Stop' : 'Hear this track through its pressing'}
                    >{playing ? <Square size={9} fill="currentColor" /> : <Play size={9} fill="currentColor" />}</button>
                    <span className="text-[15px] text-white/30 text-center" style={{ fontFamily: SERIF }}>{i + 1}</span>
                    <div className="min-w-0">
                      <input
                        value={t.title}
                        onChange={(e) => mutateProject((p) => { const x = p.tracks.find((a) => a.id === t.id); if (x) x.title = e.target.value; })}
                        className="w-full bg-transparent text-[12px] font-bold text-white outline-none border-b border-transparent focus:border-white/20"
                        aria-label={`Track ${i + 1} title`}
                      />
                      <div className="text-[9.5px] text-white/35 flex gap-2 items-center">
                        <span className="font-mono">{fmtDur(t.sample.durationSec)}</span>
                        {trackEra && <span style={{ color: trackEra.discColor }}>{trackEra.year} pressing</span>}
                        {!t.mastering && <span>album pressing</span>}
                        {!t.sample.lockerUrl && <span className="text-white/20">device only</span>}
                      </div>
                    </div>
                    {/* Per-track pressing — the "master each song to its own decade" control. */}
                    <select
                      value={t.mastering?.eraId ?? ''}
                      onChange={(e) => mutateProject((p) => {
                        const x = p.tracks.find((a) => a.id === t.id);
                        if (!x) return;
                        const profile = ERA_PROFILES.find((pr) => pr.id === e.target.value);
                        x.mastering = profile ? applyEra(defaultMastering(), profile) : null;
                      })}
                      className="h-7 rounded-lg bg-black/40 border border-white/10 text-[10px] text-white/70 px-1.5 outline-none"
                      aria-label={`${t.title} pressing`}
                    >
                      <option value="">Album pressing</option>
                      {ERA_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.year} · {p.label}</option>)}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="range" min={-24} max={12} step={0.5} value={t.gainDb}
                        onChange={(e) => mutateProject((p) => { const x = p.tracks.find((a) => a.id === t.id); if (x) x.gainDb = Number(e.target.value); })}
                        className="w-20 accent-[#FF8C00]"
                        aria-label={`${t.title} level`}
                      />
                      <span className="font-mono text-[9.5px] text-white/50 w-11 text-right tabular-nums">{t.gainDb.toFixed(1)} dB</span>
                    </div>
                    <div className="flex flex-col">
                      <button
                        disabled={i === 0}
                        onClick={() => mutateProject((p) => { const idx = p.tracks.findIndex((a) => a.id === t.id); if (idx > 0) { const [x] = p.tracks.splice(idx, 1); p.tracks.splice(idx - 1, 0, x); } })}
                        className="text-white/30 hover:text-white disabled:opacity-20" aria-label={`Move ${t.title} up`}
                      ><ChevronUp size={12} /></button>
                      <button
                        disabled={i === project.tracks.length - 1}
                        onClick={() => mutateProject((p) => { const idx = p.tracks.findIndex((a) => a.id === t.id); if (idx >= 0 && idx < p.tracks.length - 1) { const [x] = p.tracks.splice(idx, 1); p.tracks.splice(idx + 1, 0, x); } })}
                        className="text-white/30 hover:text-white disabled:opacity-20" aria-label={`Move ${t.title} down`}
                      ><ChevronDown size={12} /></button>
                    </div>
                    <button
                      onClick={() => setAssetTrackId(assetTrackId === t.id ? null : t.id)}
                      className="h-6 px-2 rounded-md text-[9px] font-bold border"
                      style={(t.timeCodedLyrics?.length ?? 0) > 0 || assetTrackId === t.id
                        ? { color: '#06D6A0', borderColor: 'rgba(6,214,160,0.4)' }
                        : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.15)' }}
                      aria-label={`Lyrics and media for ${t.title}`}
                      title="Lyrics, sync and artwork"
                    >{(t.timeCodedLyrics?.length ?? 0) > 0 ? '♪ synced' : 'Lyrics'}</button>
                    <button
                      onClick={() => setFxTrackId(fxTrackId === t.id ? null : t.id)}
                      className="h-6 px-2 rounded-md text-[9px] font-bold border"
                      style={(t.insertFx?.filter((f) => f.on).length ?? 0) > 0 || fxTrackId === t.id
                        ? { color: '#00DAF3', borderColor: 'rgba(0,218,243,0.4)' }
                        : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.15)' }}
                      aria-label={`Insert FX for ${t.title}`}
                      title="Per-track insert FX"
                    >FX{(t.insertFx?.filter((f) => f.on).length ?? 0) > 0 ? ` ${t.insertFx!.filter((f) => f.on).length}` : ''}</button>
                    <button
                      onClick={() => mutateProject((p) => { p.tracks = p.tracks.filter((a) => a.id !== t.id); })}
                      className="w-6 h-6 grid place-items-center rounded-md text-white/25 hover:text-[#EF4444]"
                      aria-label={`Remove ${t.title} from the album`}
                    ><Trash2 size={12} /></button>
                  </div>
                  {/* Lyrics + media — the assets that must never orphan. */}
                  {assetTrackId === t.id && (
                    <div className="pl-[52px] pr-2 py-2 border-b border-white/[0.04] bg-black/20">
                      <TrackAssets
                        track={t}
                        onPatch={(fn) => mutateProject((p) => { const x = p.tracks.find((a) => a.id === t.id); if (x) fn(x); })}
                        onToggleAudition={() => { const laid = layout.tracks.find((l) => l.track.id === t.id); auditionOrigin.current = laid?.startSec ?? 0; void toggleAudition(t); }}
                        playing={snap.auditionId === t.id}
                        posSec={snap.auditionId === t.id ? auditionPos : 0}
                      />
                    </div>
                  )}
                  {/* Per-track insert rack — Studio One's track device rack. */}
                  {fxTrackId === t.id && (
                    <div className="pl-[50px] pr-2 py-2 border-b border-white/[0.04] bg-black/20">
                      <FxRack
                        instances={t.insertFx ?? []}
                        onChange={(next) => setTrackFx(t.id, next)}
                        accent="#00DAF3"
                        title={`${t.title} · Inserts`}
                        reductionOf={(id) => BeatsEngine.get().auditionFxReduction(id)}
                        nodeOf={(id) => BeatsEngine.get().auditionFxNode(id)}
                        emptyHint="Add inserts for this song — EQ, comp, de-ess, reverb…"
                      />
                      {snap.auditionId !== t.id && (t.insertFx?.some((f) => f.on) ?? false) && (
                        <p className="mt-1.5 text-[9px] text-[#FF8C00]">Press ▶ on this track to hear and meter its inserts.</p>
                      )}
                    </div>
                  )}
                  {/* The transition into the next track: one control spans crossfade ↔ gap,
                      because that IS the data model (a negative gap is an overlap). */}
                  {i < project.tracks.length - 1 && (() => {
                    const xf = crossfadeAt(project, i);
                    const gap = Math.max(0, t.gapSec ?? 0);
                    return (
                      <div className="flex items-center gap-2 pl-[50px] py-1 border-b border-white/[0.03]">
                        <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-white/20">transition</span>
                        <input
                          type="range" min={-8} max={8} step={0.1} value={xf > 0 ? -xf : gap}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            mutateProject((p) => {
                              if (v < -0.05) setCrossfade(p, i, -v);
                              else {
                                const a = p.tracks[i], b = p.tracks[i + 1];
                                if (a) { a.gapSec = Math.max(0, v); a.fadeOutSec = 0; }
                                if (b) b.fadeInSec = 0;
                              }
                            });
                          }}
                          className="w-28 accent-[#D40055]"
                          aria-label={`Transition from track ${i + 1} to ${i + 2}`}
                          title="Left = crossfade into the next track · right = silence between them"
                        />
                        <span className="font-mono text-[9px]" style={{ color: xf > 0 ? '#ff5c93' : gap > 0 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)' }}>
                          {xf > 0 ? `${xf.toFixed(1)}s crossfade` : gap > 0 ? `${gap.toFixed(1)}s gap` : 'butt splice'}
                        </span>
                      </div>
                    );
                  })()}
                  </React.Fragment>
                );
              })}
            </div>

            {/* This groove's stems — quick leveling without leaving the room. */}
            {grooveTracks.length > 0 && (
              <div className="mt-4">
                <span className="text-[9px] font-extrabold tracking-[0.18em] uppercase text-white/25">In this groove</span>
                {grooveTracks.map((t) => (
                  <div key={t.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1.5 border-b border-white/[0.04]">
                    <div className="text-[11px] text-white/55 truncate">{t.name} <span className="text-[9px] text-white/25">{t.kind}</span></div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="range" min={-24} max={12} step={0.5} value={t.gainDb}
                        disabled={!!t.foreign}
                        onChange={(e) => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.gainDb = Number(e.target.value); })}
                        className="w-20 accent-[#FF8C00]"
                        aria-label={`${t.name} level`}
                      />
                      <span className="font-mono text-[9px] text-white/40 w-11 text-right tabular-nums">{t.gainDb.toFixed(1)} dB</span>
                    </div>
                    <button
                      onClick={() => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.mute = !x.mute; })}
                      className="w-6 h-6 grid place-items-center rounded-md"
                      style={{ color: t.mute ? SELECT : 'rgba(255,255,255,0.3)' }}
                      aria-label={t.mute ? `Unmute ${t.name}` : `Mute ${t.name}`}
                    >{t.mute ? <VolumeX size={11} /> : <Volume2 size={11} />}</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── The master rack ── */}
            <div className="mt-4 rounded-[14px] border border-white/[0.12] bg-black/25 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">Master Rack</span>
                <span className="font-mono text-[9px] text-white/30">
                  IN → EQ → PRESSING{state.glue && state.on ? ' → GLUE' : ''} → FADER{doc.mixer.master.limiterOn ? ' → LIMIT' : ''} → OUT
                </span>
              </div>
              <div className="flex items-start gap-5 flex-wrap">
                <Knob label="Authenticity" value={state.authenticity} min={0} max={1} defaultValue={0.7} color={era?.discColor || ARMED}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => { const cur = readState(doc); const p = eraById(cur.eraId); apply(p ? applyEra({ ...cur, authenticity: v }, p, v) : { ...cur, authenticity: v }); }} />
                <Knob label="Drive" value={state.drive} min={0} max={1} defaultValue={0} color={ARMED}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => apply({ ...state, drive: v })} />
                <Knob label="Tilt" value={state.tiltDb} min={-4} max={4} defaultValue={0} color={PLAYHEAD}
                  format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
                  onChange={(v) => apply({ ...state, tiltDb: v })} />
                <Knob label="Width" value={state.width} min={0} max={1.6} defaultValue={1} color={PLAYHEAD}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => apply({ ...state, width: v })} />
                <Knob label="Mono Below" value={state.monoBelowHz} min={0} max={300} defaultValue={0} color={PLAYHEAD}
                  format={(v) => (v < 20 ? 'off' : `${Math.round(v)} Hz`)}
                  onChange={(v) => apply({ ...state, monoBelowHz: Math.round(v) })} />
                <div className="flex flex-col gap-1.5 pt-1">
                  <button
                    onClick={() => apply({ ...state, glue: !state.glue })}
                    className="text-[8.5px] font-semibold rounded-[4px] px-2 py-1 border"
                    style={state.glue && state.on
                      ? { color: '#06D6A0', borderColor: 'rgba(6,214,160,0.4)' }
                      : { color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.15)' }}
                  >GLUE 2:1</button>
                  <button
                    onClick={() => onMutate((d) => { d.mixer.master.limiterOn = !d.mixer.master.limiterOn; })}
                    className="text-[8.5px] font-semibold rounded-[4px] px-2 py-1 border"
                    style={doc.mixer.master.limiterOn
                      ? { color: '#06D6A0', borderColor: 'rgba(6,214,160,0.4)' }
                      : { color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.15)' }}
                  >LIMIT −1.0</button>
                  <span className="font-mono text-[8.5px] text-white/40 text-center">GR {snap.limiterReduction.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* ── The Suite — the unified Ozone/RX-style FX rack, under the pressing ── */}
            <div className="mt-3 rounded-[14px] border border-white/[0.12] bg-black/25 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">The Suite · Album FX</span>
                <span className="font-mono text-[9px] text-white/25">runs after the pressing, before the limiter</span>
              </div>
              <FxRack
                instances={project.masterFx ?? []}
                onChange={setMasterFx}
                accent="#D0BCFF"
                reductionOf={(id) => BeatsEngine.get().suiteReduction(id)}
                nodeOf={(id) => BeatsEngine.get().suiteNode(id)}
                emptyHint="Add mastering & repair devices — EQ, dynamics, imager, de-hum, de-ess…"
              />
            </div>
          </div>

          {/* ── Right: publishing, engineers, pressing notes, the meter wall ── */}
          <div className="min-w-0 flex flex-col gap-4">

            {/* ── The record at a glance — the full sheet lives in Credits & Metadata. ── */}
            <div className="rounded-[12px] border border-white/[0.1] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">The Record</span>
                <button onClick={() => setBay('credits')} className="text-[9.5px] text-white/45 hover:text-white flex items-center gap-1">Credits & metadata <ArrowRight size={10} /></button>
              </div>
              <div className="mt-1.5 text-[15px] text-white" style={{ fontFamily: SERIF }}>{pub.title || <span className="text-white/30 italic">Untitled</span>}</div>
              <div className="text-[11px] text-white/50">{[pub.artist, pub.label, pub.year].filter(Boolean).join(' · ') || 'Add the artist, label and year'}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {[
                  ['Artwork', 'artwork', !!(project.coverImage || project.desk?.artwork?.animated)],
                  ['Release', 'release', !!project.desk?.release],
                  ['Physical', 'physical', !!project.desk?.physical],
                  ['Publish', 'publish', !!project.desk?.publish?.choraAlbumId],
                ].map(([label, id, done]) => (
                  <button key={id as string} onClick={() => setBay(id as BayId)} className="h-6 px-2 rounded-full border text-[9.5px]"
                    style={done ? { color: '#06D6A0', borderColor: 'rgba(6,214,160,0.35)' } : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.12)' }}>{done ? '✓ ' : ''}{label as string}</button>
                ))}
              </div>
            </div>

            {/* ── Release format — the authoring budget for CD / vinyl / streaming ── */}
            <div className="rounded-[12px] border border-white/[0.1] bg-white/[0.03] p-3">
              <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">Release Format</span>
              <select
                value={project.discFormat ?? 'stream'}
                onChange={(e) => setDiscFormat(e.target.value)}
                className="w-full h-8 mt-2 rounded-[8px] bg-black/40 border border-white/10 text-[11.5px] text-white px-2 outline-none"
                aria-label="Release format"
              >
                {DISC_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <div className="flex items-center justify-between mt-2 text-[9.5px] font-mono">
                <span className="text-white/40">
                  {discFormat.sides > 1 ? `${discFormat.sides} sides · ${fmtDur(fit.perSideSec)}/side` : fmtDur(fit.totalSec)}
                </span>
                <span style={{ color: fit.level === 'over' ? '#EF4444' : fit.level === 'warn' ? '#F59E0B' : '#06D6A0' }}>
                  {fit.level === 'ok' ? '✓ fits' : fit.level === 'warn' ? '⚠ tight' : '✕ over'}
                </span>
              </div>
              {fit.messages.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {fit.messages.map((m, i) => (
                    <p key={i} className="text-[9.5px] leading-snug" style={{ color: fit.level === 'over' ? '#ff9a9a' : '#f0c674' }}>{m}</p>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[9px] text-white/25">{discFormat.note}</p>
              <button onClick={() => setBay('physical')} className="mt-1.5 text-[9.5px] text-[#D0BCFF] hover:text-white flex items-center gap-1">Prepare for CD, vinyl or tape <ArrowRight size={10} /></button>
            </div>

            <div>
              <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">Your Engineer</span>
              <div className="mt-2 grid gap-1.5">
                {ENGINEERS.map((e) => {
                  const on = state.engineerId === e.id;
                  return (
                    <button
                      key={e.id}
                      onClick={() => pickEngineer(e.id)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-[12px] border text-left transition-colors"
                      style={on
                        ? { borderColor: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)' }
                        : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <span className="w-8 h-8 rounded-full grid place-items-center text-[13px] text-white flex-none"
                        style={{ fontFamily: SERIF, background: on ? `linear-gradient(135deg, #6B0099, ${SELECT})` : 'rgba(255,255,255,0.1)' }}>
                        {e.name[0]}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11.5px] font-bold text-white">{e.name}</span>
                        <span className="block text-[9.5px] text-white/40 truncate">{e.style}</span>
                      </span>
                      <span className="ml-auto text-[10px] text-white/35 italic whitespace-nowrap" style={{ fontFamily: SERIF }}>{e.signature}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {era && (
              <div className="rounded-[12px] border border-white/[0.1] bg-white/[0.03] p-3">
                <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">Pressing Notes — {era.year}</span>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/60" style={{ fontFamily: SERIF }}>{era.notes}</p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <span className="text-[8.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ color: era.discColor, borderColor: `${era.discColor}66` }}>DR {era.targetDr}</span>
                  <span className="text-[8.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/15 text-white/45">≈{era.targetLufs} LUFS</span>
                  <span className="text-[8.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/15 text-white/45">{era.hpHz}–{era.lpHz >= 1000 ? `${Math.round(era.lpHz / 1000)}k` : era.lpHz} Hz</span>
                </div>
              </div>
            )}

            {/* ── The meter wall: R128 truth, live off the worklet ── */}
            <div className="rounded-[12px] border border-white/[0.1] bg-black/30 p-3">
              <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">Lathe Meters · EBU R128</span>
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                {([
                  ['Momentary', fmtLufs(loud?.m), 'LUFS'],
                  ['Short-term', fmtLufs(loud?.s), 'LUFS'],
                  ['Integrated', fmtLufs(loud?.i), 'LUFS'],
                  ['True Peak', fmtLufs(loud?.tp), 'dBTP'],
                  ['Range', loud ? loud.lra.toFixed(1) : '—', 'LU'],
                  ['PSR', psr !== undefined ? psr.toFixed(1) : '—', ''],
                ] as [string, string, string][]).map(([label, v, unit]) => (
                  <div key={label} className="rounded-[8px] border border-white/[0.08] bg-black/25 px-2 py-1.5">
                    <div className="font-mono text-[13px] text-white tabular-nums">{v}<span className="text-[8px] text-white/35 ml-1">{unit}</span></div>
                    <div className="text-[7.5px] font-extrabold uppercase tracking-[0.14em] text-white/35 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {/* Correlation — sustained negative means the pressing won't survive mono. */}
              <div className="mt-2">
                <div className="flex justify-between text-[7.5px] font-mono text-white/30"><span>−1</span><span>CORRELATION {loud ? loud.corr.toFixed(2) : '—'}</span><span>+1</span></div>
                <div className="h-1.5 rounded-full bg-black/50 mt-0.5 relative overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
                  {loud && (
                    <div className="absolute top-0 bottom-0" style={{
                      left: loud.corr >= 0 ? '50%' : `${50 + loud.corr * 50}%`,
                      width: `${Math.abs(loud.corr) * 50}%`,
                      background: loud.corr >= 0 ? '#06D6A0' : '#EF4444',
                    }} />
                  )}
                </div>
              </div>
              <div className="mt-2 flex gap-1.5 h-[86px]">
                <div className="flex-[1.5] rounded-[8px] border border-white/[0.08] overflow-hidden">
                  <canvas ref={scopeRef} className="w-full h-full block" />
                </div>
                <div className="flex-1 rounded-[8px] border border-white/[0.08] overflow-hidden" title="Goniometer — vertical = mono, horizontal = out of phase">
                  <canvas ref={gonioRef} className="w-full h-full block" />
                </div>
              </div>
              <div className="flex justify-between mt-1 font-mono text-[7.5px] text-white/25">
                <span>20</span><span>200</span><span>2k</span><span>20k · +4.5 dB/oct tilt</span>
                <span>{plr !== undefined ? `PLR ${plr.toFixed(1)}` : ''}</span>
              </div>
            </div>
          </div>
        </div>
        </>)}
      </div>
      </div>

      {pickingRelease && (
        <ReleasePicker
          productionId={productionId}
          onClose={() => setPickingRelease(false)}
          onImported={(summary) => {
            reloadProject(); // the import wrote the doc from under us — pick up the new tracks
            setProgress(summary);
            setTimeout(() => setProgress(null), 8000);
          }}
        />
      )}

      {/* ── The multitrack timeline — the Studio One arranger, resizable, at the bottom ── */}
      {project.tracks.length > 0 && (
        <AlbumTimeline
          project={project}
          selectedId={selectedTrackId}
          onSelect={setSelectedTrackId}
          onMutate={mutateProject}
          albumEraColor={era?.discColor ?? '#D0BCFF'}
          getPeaks={getPeaks}
          ensurePeaks={ensurePeaks}
          height={timelineH}
          onResize={setTimelineH}
          cursorSec={transport.cursorSec}
          onSeek={transport.setCursor}
          getPlayPos={transport.getPlayPos}
          playing={transport.playing}
          onPlay={() => { void transport.play(); }}
          onStop={transport.stop}
          onPlayRange={() => { void auditionRange(); }}
          rangeBusy={busy === 'range'}
        />
      )}
    </div>
  );
};
