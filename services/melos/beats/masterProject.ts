// The Pressing — the album Project document + its release pipeline.
//
// A MasterProject is the record itself: imported tracks (audio lives content-addressed in OPFS
// with a locker backup, exactly like pad samples), a running order, publishing info, and a
// per-track pressing override on top of the room's album pressing. Persistence follows the
// groove pattern verbatim: melosProductions/{prodId}/projects/{id}, deterministic 'album' id
// per production so it's found without a query, undefined stripped before write.
//
// The release pipeline renders every track OFFLINE through the identical master section the
// live room uses (MasteringChain + glue + limiter with graph.ts's exact node recipes), then
// either seeds the Album Creator (the established Melos → Chora bridge, render.ts:publishGroove)
// or zips the WAVs + a release manifest for delivery elsewhere.

import { zipSync, strToU8 } from 'fflate';
import { opsDb, auth } from '../../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import type { SampleRef } from './grooveDoc';
import { dbToGain, softClipCurve } from './engine/graph';
import { hydrateSample } from './sampleStore';
import { MasteringChain, type MasteringState } from './fx/mastering';
import { FxChainHost, type FxInstance } from './fx/devices';
import { airwindowsSettled } from './fx/airwindows';
import { encodeWav } from '../../audio/wavEncode';
import {
  presetById, planSides, buildCueSheet, buildPqLog, ditherTpdf, toFrame, allCredits, creditsToText,
  type ReleaseDeskState, type TrackMeta, type CueTrack,
} from './releaseDesk';

/** One synced lyric line — the shape Chora's player reads (src/lib/captions.ts). Seconds. */
export interface TimedLyric { time: number; text: string }

export interface ProjectTrack {
  id: string;
  title: string;
  sample: SampleRef;              // OPFS key + optional lockerUrl + duration
  gainDb: number;                 // track-to-track leveling on the proof sheet
  /** Per-track pressing. null/absent = master the track with the album's pressing. */
  mastering?: MasteringState | null;
  /** Per-track insert FX chain (Studio One insert rack) — runs before the pressing. */
  insertFx?: FxInstance[];
  // Album-timeline shape. All optional so projects saved before this stay valid.
  fadeInSec?: number;             // fade up at the head
  fadeOutSec?: number;            // fade down at the tail
  /** Trim into the source file — the in-point, independent of the album clock position. */
  startOffsetSec?: number;
  /** Playable length from startOffsetSec; absent = to end of file. The out-point. */
  playLengthSec?: number;
  /** Space after this track. NEGATIVE = overlap into the next one, i.e. a crossfade. */
  gapSec?: number;
  // Assets that ride WITH the track and must never orphan — carried to Chora on publish.
  lyrics?: string;                       // plain text, one line per lyric line
  timeCodedLyrics?: TimedLyric[];        // manual sync → Chora karaoke
  images?: string[];                     // per-track artwork (data/locker URLs)
  videoUrl?: string;                     // linked music video
  sourceSongId?: string;                 // the MelosSong this came from (auto-populate provenance)
  /**
   * The CD track-start (index 01) relative to the clip's head on the album clock. Negative pulls
   * the track start back into the previous song's tail (a crossfaded album's index point);
   * positive hides a count-in. Absent = the clip head. Studio One's movable track marker.
   */
  indexOffsetSec?: number;
  /** Credits, identifiers and the rest of the song's metadata (releaseDesk.ts). */
  meta?: TrackMeta;
}

/** A named point on the album clock — index points, side breaks, notes to self. */
export interface AlbumMarker {
  id: string;
  timeSec: number;
  label: string;
  /** 'note' = a note to self; 'index' = a CD sub-index (index 02+); 'side' = a vinyl/tape side break. */
  kind?: 'note' | 'index' | 'side';
}

export interface PublishingInfo {
  title: string;
  artist: string;
  genre: string;
  year: string;
  label: string;
  copyright: string;
  description: string;
}

export interface MasterProjectDoc {
  id: string;
  ownerId: string;
  tracks: ProjectTrack[];
  publishing: PublishingInfo;
  markers?: AlbumMarker[];
  /** The album-wide "Suite" — a unified Ozone/RX-style FX rack under the master pressing. */
  masterFx?: FxInstance[];
  /** Cover art (data URL / locker URL) — flows to the Album Creator on publish. */
  coverImage?: string;
  /** Which arrangement (Melos running order) auto-populated this album, if any. */
  arrangementId?: string;
  /** Target release format — sets the duration budget the authoring warnings check. */
  discFormat?: string;
  /** The project's In / Out locators on the album clock (Studio One's L/R) — loop + export range. */
  inSec?: number;
  outSec?: number;
  /** Loop playback between the locators. */
  loopOn?: boolean;
  /** The release desk — metadata, artwork, release options, media, visuals, mixes, show, physical. */
  desk?: ReleaseDeskState;
  version: 1;
  createdAt: number;
  updatedAt: number;
}

// ── Release-format templates (research digest: Red Book + vinyl per-side limits) ──
export interface DiscFormat {
  id: string;
  label: string;
  sides: number;
  /** Conservative (loud/full-bass) budget per side, minutes. null = unlimited (streaming). */
  minutesPerSide: number | null;
  /** Physical ceiling per side, minutes. null = unlimited. */
  maxMinutesPerSide: number | null;
  maxTracks: number | null;
  note: string;
}

export const DISC_FORMATS: DiscFormat[] = [
  { id: 'stream', label: 'Streaming / Digital', sides: 1, minutesPerSide: null, maxMinutesPerSide: null, maxTracks: null, note: 'No length limit · gapless · ceiling −1.0 dBTP' },
  { id: 'cd74', label: 'CD · Red Book (74 min)', sides: 1, minutesPerSide: 74, maxMinutesPerSide: 80, maxTracks: 99, note: '16-bit / 44.1 kHz · 2 s gaps · ISRC per track, UPC per disc' },
  { id: 'cd80', label: 'CD · Red Book (80 min)', sides: 1, minutesPerSide: 74, maxMinutesPerSide: 80, maxTracks: 99, note: 'Max CD length · beyond 74 min cuts margin · 99 tracks' },
  { id: 'lp12_33', label: 'Vinyl · 12″ 33⅓ LP', sides: 2, minutesPerSide: 18, maxMinutesPerSide: 22, maxTracks: null, note: 'Sweet spot 18–20 min/side · past 20 the cut goes quieter & thinner' },
  { id: 'lp12_45', label: 'Vinyl · 12″ 45', sides: 2, minutesPerSide: 12, maxMinutesPerSide: 15, maxTracks: null, note: 'Loudest & punchiest · club / 12″ single standard' },
  { id: 'lp7_45', label: 'Vinyl · 7″ 45', sides: 2, minutesPerSide: 4, maxMinutesPerSide: 5, maxTracks: null, note: 'Master for 45 rpm · 4:30 practical max' },
];

export const discFormatById = (id: string | undefined): DiscFormat =>
  DISC_FORMATS.find((f) => f.id === id) ?? DISC_FORMATS[0];

export type FitLevel = 'ok' | 'warn' | 'over';
export interface FormatFit {
  level: FitLevel;
  totalSec: number;
  perSideSec: number;
  messages: string[];
}

/** Check a project against a disc format's budget — drives the authoring warning UI. */
export function checkFormatFit(project: MasterProjectDoc, format: DiscFormat): FormatFit {
  const totalSec = albumLayout(project).totalSec;
  const perSideSec = totalSec / Math.max(1, format.sides);
  const messages: string[] = [];
  let level: FitLevel = 'ok';
  const perSideMin = perSideSec / 60;
  if (format.maxMinutesPerSide != null && perSideMin > format.maxMinutesPerSide) {
    level = 'over';
    messages.push(`${perSideMin.toFixed(1)} min/side exceeds the ${format.maxMinutesPerSide} min ${format.label} maximum`);
  } else if (format.minutesPerSide != null && perSideMin > format.minutesPerSide) {
    level = 'warn';
    messages.push(format.sides > 1
      ? `${perSideMin.toFixed(1)} min/side is past the ${format.minutesPerSide} min sweet spot — the cut gets quieter and loses bass`
      : `${perSideMin.toFixed(1)} min is past the ${format.minutesPerSide} min conservative length`);
  }
  if (format.maxTracks != null && project.tracks.length > format.maxTracks) {
    level = 'over';
    messages.push(`${project.tracks.length} tracks exceeds the ${format.maxTracks}-track limit`);
  }
  return { level, totalSec, perSideSec, messages };
}

export const projectUid = () => Math.random().toString(36).slice(2, 10);

export function newMasterProject(ownerId: string): MasterProjectDoc {
  return {
    id: 'album', // one album project per production in v1 — deterministic, no query needed
    ownerId,
    tracks: [],
    publishing: { title: '', artist: '', genre: '', year: String(new Date().getFullYear()), label: '', copyright: '', description: '' },
    markers: [],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── The album clock ───────────────────────────────────────────────────────────

export interface LaidTrack {
  track: ProjectTrack;
  index: number;
  startSec: number;
  endSec: number;
  /** How far the NEXT track starts before this one ends (0 = butt splice). */
  overlapSec: number;
}

/**
 * Place every track on the album clock. A negative `gapSec` overlaps the next track, which is
 * what a crossfade IS — the two tracks' fades do the actual blending. Overlap is clamped to 90%
 * of the shorter neighbour so a long crossfade can never reorder or swallow a track.
 *
 * One pure function so the strip, the range audition and the continuous render can never
 * disagree about where a track sits.
 */
/** The played length of a track after in/out trim — file untouched. */
export function effectiveDur(track: ProjectTrack): number {
  const offset = Math.max(0, track.startOffsetSec ?? 0);
  const rest = Math.max(0.05, track.sample.durationSec - offset);
  return track.playLengthSec != null ? Math.max(0.05, Math.min(track.playLengthSec, rest)) : rest;
}

export function albumLayout(project: MasterProjectDoc): { tracks: LaidTrack[]; totalSec: number } {
  const out: LaidTrack[] = [];
  let cursor = 0;
  for (let i = 0; i < project.tracks.length; i++) {
    const track = project.tracks[i];
    const dur = effectiveDur(track);
    const next = project.tracks[i + 1];
    const gap = track.gapSec ?? 0;
    let overlapSec = 0;
    if (gap < 0 && next) {
      const limit = Math.min(dur, effectiveDur(next)) * 0.9;
      overlapSec = Math.min(-gap, limit);
    }
    const startSec = cursor;
    const endSec = startSec + dur;
    out.push({ track, index: i, startSec, endSec, overlapSec });
    cursor = endSec - overlapSec + (gap > 0 ? gap : 0);
  }
  return { tracks: out, totalSec: out.length ? Math.max(...out.map((t) => t.endSec)) : 0 };
}

/** Set a crossfade between track `index` and the next: the overlap AND both fades in one move. */
export function setCrossfade(project: MasterProjectDoc, index: number, sec: number): void {
  const a = project.tracks[index];
  const b = project.tracks[index + 1];
  if (!a || !b) return;
  const clamped = Math.max(0, Math.min(20, sec));
  a.gapSec = clamped > 0 ? -clamped : 0;
  a.fadeOutSec = clamped;
  b.fadeInSec = clamped;
}

/** The crossfade currently set between `index` and the next track, in seconds (0 = none). */
export const crossfadeAt = (project: MasterProjectDoc, index: number): number => {
  const g = project.tracks[index]?.gapSec ?? 0;
  return g < 0 ? -g : 0;
};

/** Where a laid track's CD index 01 lands on the album clock (its movable track marker). */
export const trackIndexSec = (laid: LaidTrack): number =>
  Math.max(0, laid.startSec + (laid.track.indexOffsetSec ?? 0));

/** Move the track at `from` to `to` in the running order (gaps/fades travel with the track). */
export function moveTrack(project: MasterProjectDoc, from: number, to: number): void {
  if (from === to || from < 0 || from >= project.tracks.length) return;
  const [t] = project.tracks.splice(from, 1);
  project.tracks.splice(Math.max(0, Math.min(project.tracks.length, to)), 0, t);
}

// ── Persistence ───────────────────────────────────────────────────────────────

const projectRef = (prodId: string, id: string) => doc(opsDb, 'melosProductions', prodId, 'projects', id);

export async function saveMasterProject(prodId: string, project: MasterProjectDoc): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    if (!project.ownerId) project.ownerId = user.uid;
    // JSON round-trip drops undefined — the Firestore rule (grooveDoc.ts:serializeGroove).
    // Full overwrite (not merge, which resurrected deleted map keys). Writers: useMasterProject
    // and albumImport, both with the whole project; no server-managed fields.
    await setDoc(projectRef(prodId, project.id), JSON.parse(JSON.stringify({ ...project, updatedAt: Date.now() })));
    return true;
  } catch (e) {
    console.warn('[beats] project save failed', e);
    return false;
  }
}

export async function loadMasterProject(prodId: string): Promise<MasterProjectDoc | null> {
  try {
    const snap = await getDoc(projectRef(prodId, 'album'));
    if (!snap.exists()) return null;
    const d = snap.data() as MasterProjectDoc;
    if (!Array.isArray(d.tracks)) d.tracks = [];
    if (!d.publishing) d.publishing = newMasterProject(d.ownerId || '').publishing;
    return d;
  } catch { return null; }
}

// ── The release pipeline ──────────────────────────────────────────────────────

const SAMPLE_RATE = 48000;
const TAIL_SEC = 1.2; // pressing drive/width tails + limiter release

/** decodeAudioData needs any BaseAudioContext; a 1-frame offline context is the cheapest. */
export const decodeCtx = () => new OfflineAudioContext(2, 128, SAMPLE_RATE);

/**
 * One track's voice on a render timeline: source → trim (carrying its fades) → [pressing chain
 * → glue]. Returns the tail node for the caller to bus.
 *
 * `virtualStartSec` is where the track sits on the ALBUM clock; `windowStartSec` is where the
 * render begins. A track that starts before the window is started at time 0 with a buffer
 * offset and its fade envelope sampled at that offset — so rendering a 6-second window around
 * a crossfade sounds exactly like that moment of the full album.
 */
function buildTrackVoice(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  track: ProjectTrack,
  pressing: MasteringState | null,
  virtualStartSec: number,
  windowStartSec = 0,
): AudioNode | null {
  const localStart = virtualStartSec - windowStartSec;
  // `bufOffset` is time into the PLAYED region where the render window begins.
  const bufOffset = localStart < 0 ? -localStart : 0;
  const dur = effectiveDur(track);            // played length after in/out trim
  const inPoint = Math.max(0, track.startOffsetSec ?? 0); // where in the file playback starts
  if (bufOffset >= dur) return null;          // entirely before the window
  const startAt = Math.max(0, localStart);

  const g = dbToGain(track.gainDb);
  const fin = Math.max(0, Math.min(track.fadeInSec ?? 0, dur / 2));
  const fout = Math.max(0, Math.min(track.fadeOutSec ?? 0, dur / 2));
  // Envelope value at a point measured from the played-region head.
  const envAt = (t: number) => {
    let v = g;
    if (fin > 0 && t < fin) v = Math.min(v, g * Math.max(0, t / fin));
    if (fout > 0 && t > dur - fout) v = Math.min(v, g * Math.max(0, (dur - t) / fout));
    return Math.max(0.0001, v);
  };
  const at = (tFromTrackHead: number) => Math.max(0, virtualStartSec + tFromTrackHead - windowStartSec);

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const trim = ctx.createGain();
  trim.gain.setValueAtTime(envAt(bufOffset), startAt);
  if (fin > 0 && bufOffset < fin) trim.gain.linearRampToValueAtTime(g, at(fin));
  if (fout > 0) {
    if (dur - fout > bufOffset) trim.gain.setValueAtTime(g, at(dur - fout));
    trim.gain.linearRampToValueAtTime(0.0001, at(dur));
  }
  src.connect(trim);

  let head: AudioNode = trim;
  // Per-track insert FX first (Studio One insert order: track processing → the master pressing).
  const fx = (track.insertFx ?? []).filter((f) => f.on);
  if (fx.length) {
    const chain = new FxChainHost(ctx);
    chain.setChain(track.insertFx ?? []);
    head.connect(chain.input);
    head = chain.output;
  }
  if (pressing?.on) {
    const chain = new MasteringChain(ctx);
    chain.setState(pressing);
    head.connect(chain.input);
    head = chain.output;
    if (pressing.glue) {
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -18; glue.knee.value = 12; glue.ratio.value = 2.5;
      glue.attack.value = 0.01; glue.release.value = 0.18;
      head.connect(glue);
      head = glue;
    }
  }
  // Read from (inPoint + bufOffset) in the FILE, and auto-stop after the remaining played length.
  src.start(startAt, inPoint + bufOffset, dur - bufOffset);
  return head;
}

/** The album Suite — the unified master-FX rack, inserted before the final limiter. */
function buildMasterFx(ctx: BaseAudioContext, masterFx: FxInstance[] | undefined): FxChainHost | null {
  const active = (masterFx ?? []).filter((f) => f.on);
  if (!active.length) return null;
  const host = new FxChainHost(ctx);
  host.setChain(masterFx ?? []);
  return host;
}

/** The album bus: the same soft-clip brickwall the live room ends with (−1 dBFS ceiling). */
function albumLimiter(ctx: BaseAudioContext): WaveShaperNode {
  const limiter = ctx.createWaveShaper();
  limiter.oversample = '4x';
  limiter.curve = softClipCurve(-1);
  limiter.connect(ctx.destination);
  return limiter;
}

/**
 * Render ONE track through the master section — the same node recipes as graph.ts's master, with
 * the pressing inserted where the live room inserts it, so "publish" prints what the room heard.
 */
export async function renderProjectTrack(
  track: ProjectTrack,
  albumPressing: MasteringState | null,
  opts: { bitDepth?: 16 | 24; masterFx?: FxInstance[] } = {},
): Promise<{ blob: Blob; seconds: number } | null> {
  const buffer = await hydrateSample(track.sample, decodeCtx());
  if (!buffer) return null;
  const seconds = buffer.duration + TAIL_SEC;
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const voice = buildTrackVoice(offline, buffer, track, track.mastering ?? albumPressing, 0);
  if (!voice) return null;
  // A single-track export still runs the album Suite so the file matches the programme.
  const suite = buildMasterFx(offline, opts.masterFx);
  const bus = albumLimiter(offline);
  if (suite) { voice.connect(suite.input); suite.output.connect(bus); } else voice.connect(bus);
  await airwindowsSettled(offline); // async inserts must be in the path before the bounce
  const rendered = await offline.startRendering();
  return { blob: encodeWav(rendered, opts.bitDepth ?? 24), seconds };
}

/**
 * Render the album as ONE continuous programme — every track on the album clock, crossfades and
 * gaps included, through one shared album limiter. This is the file that proves the sequence:
 * per-track exports can't contain a crossfade, because a crossfade lives between two tracks.
 */
export async function renderAlbumContinuous(
  project: MasterProjectDoc,
  albumPressing: MasteringState | null,
  opts: {
    bitDepth?: 16 | 24; startSec?: number; endSec?: number;
    /** Print rate — 44.1 kHz for Red Book. Default 48 kHz (the desk's working rate). */
    sampleRate?: number;
    /** Silence before the programme (a CD pre-gap, a tape leader). */
    leadSec?: number;
    /** Pad the file with trailing silence to at least this length (matched tape sides). */
    minSec?: number;
    /** Only these running-order indices (a vinyl/tape side). */
    indices?: number[];
    dither?: boolean;
  } = {},
): Promise<{ blob: Blob; buffer: AudioBuffer; seconds: number } | null> {
  const layout = albumLayout(project);
  if (!layout.tracks.length) return null;
  const rate = opts.sampleRate ?? SAMPLE_RATE;
  const only = opts.indices ? new Set(opts.indices) : null;
  const chosen = only ? layout.tracks.filter((l) => only.has(l.index)) : layout.tracks;
  if (!chosen.length) return null;
  const lead = Math.max(0, opts.leadSec ?? 0);
  const firstStart = only ? chosen[0].startSec : 0;
  const lastEnd = only ? Math.max(...chosen.map((l) => l.endSec)) : layout.totalSec;
  const windowStart = Math.max(0, opts.startSec ?? firstStart) - lead;
  const windowEnd = Math.min(lastEnd + TAIL_SEC, opts.endSec ?? lastEnd + TAIL_SEC);
  const seconds = Math.max(0.2, windowEnd - windowStart, opts.minSec ?? 0);
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const bus = albumLimiter(offline);
  // The album Suite sits on the bus, before the limiter — every track's voice runs through it.
  const suite = buildMasterFx(offline, project.masterFx);
  const busIn: AudioNode = suite ? suite.input : bus;
  if (suite) suite.output.connect(bus);

  let placed = 0;
  for (const laid of chosen) {
    if (laid.endSec <= windowStart || laid.startSec >= windowEnd) continue; // outside the window
    const buffer = await hydrateSample(laid.track.sample, decodeCtx());
    if (!buffer) { console.warn('[pressing] track audio unavailable', laid.track.title); continue; }
    const voice = buildTrackVoice(
      offline, buffer, laid.track, laid.track.mastering ?? albumPressing, laid.startSec, windowStart,
    );
    if (voice) { voice.connect(busIn); placed++; }
  }
  if (!placed) return null;
  await airwindowsSettled(offline); // async inserts must be in the path before the bounce
  const rendered = await offline.startRendering();
  if (opts.dither && (opts.bitDepth ?? 24) === 16) ditherTpdf(rendered, 16);
  return { blob: encodeWav(rendered, opts.bitDepth ?? 24), buffer: rendered, seconds };
}

export interface RenderedAlbum {
  files: { track: ProjectTrack; blob: Blob; filename: string }[];
  failed: string[]; // titles that couldn't hydrate/render
}

const safeName = (s: string) => (s || 'Track').replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'Track';

/** Render the whole running order, in order, reporting progress per track. */
export async function renderAlbum(
  project: MasterProjectDoc,
  albumPressing: MasteringState | null,
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<RenderedAlbum> {
  const files: RenderedAlbum['files'] = [];
  const failed: string[] = [];
  for (let i = 0; i < project.tracks.length; i++) {
    const track = project.tracks[i];
    onProgress?.(i, project.tracks.length, track.title);
    const result = await renderProjectTrack(track, albumPressing, { masterFx: project.masterFx });
    if (result) {
      files.push({ track, blob: result.blob, filename: `${String(i + 1).padStart(2, '0')} ${safeName(track.title)}.wav` });
    } else failed.push(track.title);
  }
  onProgress?.(project.tracks.length, project.tracks.length, '');
  return { files, failed };
}

/**
 * Publish to Chora: seed the Album Creator with the mastered files + the publishing info, the
 * same OPEN_ALBUM_CREATOR bridge every other Melos surface uses. The Creator owns upload,
 * cover art, pricing and the actual Chora release — this hands it a finished master.
 */
export function seedAlbumCreator(
  project: MasterProjectDoc,
  rendered: RenderedAlbum,
  opts: { prodId?: string; mix?: { name: string; cueSheet: { id: string; time: number; title: string; artist?: string }[]; durationSec: number } } = {},
): void {
  const p = project.publishing;
  const desk = project.desk ?? {};
  const meta = desk.album ?? {};
  const rel = desk.release ?? {};
  const art = desk.artwork ?? {};
  const artist = p.artist || auth.currentUser?.displayName || '';
  const credits = allCredits(project);
  // Credits read as prose on the album page; the structured list rides in releaseMeta.
  const linerNotes = [meta.linerNotes, credits.length ? `Credits\n${creditsToText(credits)}` : ''].filter(Boolean).join('\n\n') || undefined;
  const releaseDate = rel.scheduled && rel.releaseDate ? new Date(rel.releaseDate).getTime() : undefined;
  const isMix = !!opts.mix;
  const subType = isMix ? 'MIX' : meta.releaseType === 'SINGLE' || rendered.files.length === 1 ? 'SINGLE' : meta.releaseType === 'EP' ? 'EP' : 'ALBUM';
  // Chora track ids are minted here; anything the desk keyed by a project track id is re-keyed.
  const seedIds = rendered.files.map(() => `t_${Math.random().toString(36).slice(2, 9)}`);
  const idFor = new Map(rendered.files.map(({ track }, i) => [track.id, seedIds[i]]));
  const visuals = desk.visuals
    ? { ...desk.visuals, perTrack: Object.fromEntries(Object.entries(desk.visuals.perTrack ?? {}).filter(([k]) => idFor.has(k)).map(([k, v]) => [idFor.get(k)!, v])) }
    : undefined;
  const show = desk.show ? { ...desk.show, openingTrackId: desk.show.openingTrackId ? idFor.get(desk.show.openingTrackId) : undefined } : undefined;
  const social = Object.fromEntries((rel.socialLinks ?? []).filter((l) => l.url).map((l) => [l.platform, l.url]));
  const videos = (desk.videos ?? []).map((v) => ({
    id: v.reelloVideoId || v.id,
    title: v.title,
    url: v.url,
    thumbnail: v.thumbnail || project.coverImage || '',
    duration: v.durationSec,
    isRello: v.toReello,
    // publishToCloud's Reello mirror spreads each video as-is, so privacy has to ride on it.
    isPrivate: rel.visibility === 'private' || rel.visibility === 'intimate' || undefined,
  }));
  const seed = {
    // Re-publishing edits the release this desk already put out; a Mix is always its own album.
    id: (!isMix && desk.publish?.choraAlbumId) || `album_${Math.random().toString(36).slice(2, 11)}`,
    title: isMix ? `${p.title || 'Untitled Album'} — ${opts.mix!.name}` : p.title || 'Untitled Album',
    artist,
    type: 'MUSIC',
    subType,
    genre: meta.primaryGenre || p.genre || 'Beats',
    coverImage: project.coverImage || art.tela?.stillUrl || '',
    description: p.description || 'Mastered in the Chora Mastering Desk.',
    linerNotes,
    artistBio: meta.artistBio || undefined,
    recordLabel: p.label || undefined,
    copyrightLine: p.copyright || meta.cLine || undefined,
    releaseYear: p.year || undefined,
    tags: meta.tags?.length ? meta.tags : undefined,
    // Release options set on the desk — the Creator opens with them already chosen.
    isPrivate: rel.visibility === 'private' || rel.visibility === 'intimate' || undefined,
    isIntimateOnly: rel.visibility === 'intimate' || undefined,
    isDraft: rel.draft || undefined,
    price: rel.price ?? undefined,
    isPaywalled: rel.isPaywalled || undefined,
    previewOnly: rel.previewOnly || undefined,
    isScheduled: rel.scheduled || undefined,
    releaseDate,
    publishVideosToGallery: rel.publishVideosToGallery ?? (videos.some((v) => v.isRello) || undefined),
    publishToAudius: rel.publishToAudius || undefined,
    liveFeedUrl: rel.liveFeedUrl || undefined,
    donationGoal: rel.donationGoal || undefined,
    earlyAccessEnabled: rel.earlyAccessEnabled || undefined,
    slideshow: desk.slideshow?.length ? desk.slideshow.map((s) => s.url) : undefined,
    isSlideshowEnabled: rel.slideshowEnabled || undefined,
    musicVideos: videos.length ? videos : undefined,
    releaseMeta: Object.keys(meta).length || credits.length ? { ...meta, credits } : undefined,
    animatedCover: art.animated || undefined,
    telaCover: art.tela || undefined,
    coverFace: art.primary || undefined,
    albumVisuals: visuals,
    showSetup: show,
    socialLinks: Object.keys(social).length ? social : undefined,
    melosSource: { prodId: opts.prodId, projectId: project.id },
    mixMeta: isMix ? { visualMode: 'AUTO', source: 'UPLOAD', allowComments: rel.allowComments ?? true, cueSheet: opts.mix!.cueSheet, durationSec: Math.round(opts.mix!.durationSec) } : undefined,
    createdAt: Date.now(),
    // Assets ride ALONG so nothing orphans on publish: lyrics + synced lyrics reach Chora,
    // where getActiveCaption(track) reads timeCodedLyrics for the karaoke feature.
    tracks: rendered.files.map(({ track, blob, filename }, i) => ({
      id: seedIds[i],
      title: track.title || filename,
      artist: track.meta?.featuring ? `${artist} feat. ${track.meta.featuring}` : artist,
      trackNo: i + 1,
      file: new File([blob], filename, { type: 'audio/wav' }),
      url: URL.createObjectURL(blob),
      price: 0,
      isPaywalled: false,
      genre: track.meta?.genre || meta.primaryGenre || p.genre || 'Beats',
      mediaKind: 'AUDIO',
      lyrics: track.lyrics || undefined,
      timeCodedLyrics: track.timeCodedLyrics?.length ? track.timeCodedLyrics : undefined,
      images: track.images?.length ? track.images : undefined,
      videoUrl: track.videoUrl || undefined,
      trackMeta: track.meta && Object.keys(track.meta).length ? track.meta : undefined,
      pixelsProjectId: desk.pixels?.[track.id]?.projectId || undefined,
      tags: track.meta?.moods?.length ? track.meta.moods : undefined,
    })),
  };
  window.dispatchEvent(new CustomEvent('OPEN_ALBUM_CREATOR', { detail: { album: seed } }));
}

/**
 * Export the album as a ZIP: numbered mastered WAVs + release.json (the publishing manifest a
 * distributor or another DAW can read). WAV is already dense — store, don't deflate.
 */
export async function exportAlbumZip(
  project: MasterProjectDoc,
  rendered: RenderedAlbum,
  continuous?: Blob | null,
): Promise<Blob> {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const { blob, filename } of rendered.files) {
    entries[filename] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  const albumName = safeName(project.publishing.title || 'Album');
  const continuousName = `00 ${albumName} (continuous).wav`;
  if (continuous) entries[continuousName] = [new Uint8Array(await continuous.arrayBuffer()), { level: 0 }];

  const layout = albumLayout(project);
  const byId = new Map(layout.tracks.map((l) => [l.track.id, l]));
  const manifest = {
    ...project.publishing,
    totalSec: +layout.totalSec.toFixed(3),
    continuousFile: continuous ? continuousName : null,
    tracks: rendered.files.map(({ track, filename }, i) => {
      const laid = byId.get(track.id);
      return {
        no: i + 1,
        title: track.title,
        file: filename,
        durationSec: +track.sample.durationSec.toFixed(3),
        // Index points on the continuous programme — what a lathe or a DDP would want.
        startSec: laid ? +laid.startSec.toFixed(3) : null,
        crossfadeToNextSec: laid && laid.overlapSec > 0 ? +laid.overlapSec.toFixed(3) : 0,
        fadeInSec: track.fadeInSec ?? 0,
        fadeOutSec: track.fadeOutSec ?? 0,
        gainDb: track.gainDb,
        pressing: track.mastering?.eraId ?? 'album',
      };
    }),
    markers: (project.markers ?? []).map((m) => ({ timeSec: +m.timeSec.toFixed(3), label: m.label })),
    masteredIn: 'Melos · The Pressing',
    exportedAt: new Date().toISOString(),
  };
  entries['release.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 0 }];
  const zipped = zipSync(entries);
  return new Blob([zipped], { type: 'application/zip' });
}

// ── Physical media packages ─────────────────────────────────────────────────

export interface PhysicalPackage { blob: Blob; filename: string; summary: string }

/**
 * Print the record for its physical medium (releaseDesk.ts presets):
 *  • CD  — one frame-aligned 44.1 kHz / 16-bit TPDF-dithered programme with the Red Book
 *          pre-gap, a CUE sheet (CATALOG, ISRC, CD-Text, INDEX 00/01/02+) and a PQ log.
 *  • Vinyl — one file per side at the cutting rate + a lacquer cutting sheet.
 *  • Tape  — one file per side with leader silence, padded to equal length + a J-card list.
 *  • Digital — the per-track masters at the preset's rate, plus the continuous programme.
 */
export async function exportPhysicalPackage(
  project: MasterProjectDoc,
  albumPressing: MasteringState | null,
  onProgress?: (msg: string) => void,
): Promise<PhysicalPackage | null> {
  const plan = project.desk?.physical;
  const preset = presetById(plan?.presetId);
  const layout = albumLayout(project);
  if (!layout.tracks.length) return null;
  const pub = project.publishing;
  const album = safeName(pub.title || 'Album');
  const performer = pub.artist || auth.currentUser?.displayName || '';
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  const text = (name: string, body: string) => { entries[name] = [strToU8(body), { level: 6 }]; };
  const audio = async (name: string, blob: Blob) => { entries[name] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]; };
  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

  if (preset.medium === 'cd') {
    const pregap = Math.max(2, plan?.pregapSec ?? 2);
    onProgress?.('Printing the 44.1 kHz / 16-bit programme…');
    const res = await renderAlbumContinuous(project, albumPressing, { sampleRate: 44100, bitDepth: 16, leadSec: pregap, dither: (plan?.dither ?? 'tpdf') === 'tpdf' });
    if (!res) return null;
    const wavName = `${album}.wav`;
    await audio(wavName, res.blob);
    const subIdx = (project.markers ?? []).filter((m) => m.kind === 'index');
    const credits = (t: ProjectTrack) => (t.meta?.credits ?? []).filter((c) => c.category === 'writer').map((c) => c.name).join(', ');
    const tracks: (CueTrack & { durationSec: number })[] = layout.tracks.map((l, i) => {
      const t = l.track;
      const index01 = toFrame(pregap + Math.max(0, l.startSec + (t.indexOffsetSec ?? 0)));
      const prevEnd = i > 0 ? pregap + layout.tracks[i - 1].endSec : 0;
      const nextStart = i < layout.tracks.length - 1 ? pregap + layout.tracks[i + 1].startSec : pregap + layout.totalSec;
      return {
        title: t.meta?.cdText?.title || t.title,
        performer: t.meta?.cdText?.performer || performer,
        songwriter: t.meta?.cdText?.songwriter || credits(t) || undefined,
        isrc: t.meta?.isrc,
        // Track 1's index 00 is the disc pre-gap; later tracks get one only across a real gap.
        index00: i === 0 ? 0 : prevEnd < index01 - 0.5 ? toFrame(prevEnd) : undefined,
        index01,
        subIndexes: subIdx.filter((m) => m.timeSec > l.startSec && m.timeSec < l.endSec).map((m) => toFrame(pregap + m.timeSec)),
        durationSec: Math.max(0, nextStart - index01),
      };
    });
    const cdText = plan?.cdText !== false;
    text(`${album}.cue`, buildCueSheet({ file: wavName, title: pub.title || album, performer, upc: project.desk?.album?.upc, tracks, cdText }));
    text('PQ log.txt', buildPqLog({ title: pub.title || album, performer, upc: project.desk?.album?.upc, tracks, totalSec: res.seconds }));
  } else if (preset.medium === 'vinyl' || preset.medium === 'tape') {
    const sides = planSides(layout.tracks, preset, plan?.sideBreaks);
    const lead = preset.medium === 'tape' ? Math.max(0, plan?.leaderSec ?? preset.leaderSec ?? 5) : 0;
    const longest = Math.max(...sides.map((s) => s.seconds)) + lead + TAIL_SEC;
    const sheet: string[] = [`${preset.medium === 'vinyl' ? 'CUTTING SHEET' : 'J-CARD / DUPLICATION SHEET'} — ${pub.title || album} — ${performer}`, `Format: ${preset.label}`, ''];
    for (const side of sides) {
      onProgress?.(`Printing side ${side.label}…`);
      const res = await renderAlbumContinuous(project, albumPressing, {
        sampleRate: preset.sampleRate, bitDepth: preset.bitDepth, indices: side.trackIndices, leadSec: lead,
        minSec: preset.medium === 'tape' && plan?.matchSides !== false ? longest : undefined,
      });
      if (!res) continue;
      await audio(`Side ${side.label}.wav`, res.blob);
      sheet.push(`SIDE ${side.label} — ${fmt(side.seconds)}${lead ? ` (+${lead}s leader)` : ''}`);
      const first = layout.tracks[side.trackIndices[0]];
      for (const i of side.trackIndices) {
        const l = layout.tracks[i];
        sheet.push(`  ${side.label}${i - side.trackIndices[0] + 1}  ${fmt(lead + l.startSec - first.startSec)}  ${fmt(l.endSec - l.startSec)}  ${l.track.title}`);
      }
      sheet.push('');
    }
    if (preset.monoBelowHz) sheet.push(`Bass folded to mono below ${preset.monoBelowHz} Hz in the pressing.`);
    sheet.push(...preset.notes.map((n) => `· ${n}`));
    text(preset.medium === 'vinyl' ? 'Cutting sheet.txt' : 'J-card.txt', sheet.join('\r\n'));
  } else {
    const rendered = await renderAlbum(project, albumPressing, (done, total, title) => onProgress?.(title ? `Printing ${title} (${done + 1}/${total})…` : ''));
    for (const f of rendered.files) await audio(f.filename, f.blob);
    if (layout.tracks.length > 1) {
      onProgress?.('Printing the continuous programme…');
      const res = await renderAlbumContinuous(project, albumPressing, { sampleRate: preset.sampleRate, bitDepth: preset.bitDepth });
      if (res) await audio(`00 ${album} (continuous).wav`, res.blob);
    }
  }

  const credits = allCredits(project);
  if (credits.length) text('Credits.txt', creditsToText(credits));
  text('release.json', JSON.stringify({
    ...pub, ...(project.desk?.album ?? {}), preset: preset.id, medium: preset.medium,
    tracks: layout.tracks.map((l) => ({ no: l.index + 1, title: l.track.title, startSec: +l.startSec.toFixed(3), durationSec: +(l.endSec - l.startSec).toFixed(3), ...(l.track.meta ?? {}) })),
    exportedAt: new Date().toISOString(),
  }, null, 2));
  onProgress?.('Zipping…');
  const blob = new Blob([zipSync(entries)], { type: 'application/zip' });
  return { blob, filename: `${album} — ${preset.label.replace(/[^a-zA-Z0-9 .-]/g, ' ').replace(/\s+/g, ' ').trim()}.zip`, summary: `${preset.label} package ready` };
}
