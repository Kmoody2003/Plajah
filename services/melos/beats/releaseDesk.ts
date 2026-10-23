// The Release Desk — everything the Mastering Desk carries beyond the audio: credits and
// metadata (per song and per album), artwork (still, animated, or a linked Tela document),
// the release options the Album Creator offers, videos for Reello, the slideshow, the album's
// own visualizers and shaders, Chora Mixes versions, the Show Mode setup, per-song Pixels
// shows, Music Intelligence corrections, and the physical-media preparation (CD / vinyl / tape).
//
// It lives ON the MasterProjectDoc (desk + per-track meta) so one autosave carries the record
// end to end, and seedAlbumCreator hands all of it to Chora on publish.
//
// Physical media: the presets and checks follow the published specs — Red Book (IEC 60908):
// 44.1 kHz / 16-bit, ≤ 99 tracks, ≥ 4 s per track, a ≥ 2 s pre-gap before track 1, track
// starts on 1/75 s frames, ISRC (ISO 3901) per track, UPC/EAN per disc, CD-Text in ISO-8859-1.
// Vinyl and tape budgets are the conservative per-side lengths cutting rooms and duplicators
// quote; the checks warn past the sweet spot and fail past the physical ceiling.

import type { MasterProjectDoc, ProjectTrack } from './masterProject';

// ── Credits & metadata ───────────────────────────────────────────────────────

export type CreditCategory = 'artist' | 'performer' | 'writer' | 'producer' | 'engineer' | 'artwork' | 'management' | 'other';

export interface Credit {
  id: string;
  name: string;
  /** "Lead Vocals", "Composer", "Mixing Engineer"… — free text, suggestions from CREDIT_ROLES. */
  role: string;
  category: CreditCategory;
  instrument?: string;
  /** Publishing / master split, percent. */
  splitPct?: number;
  /** Performing-rights society + IPI/CAE number, for writers. */
  pro?: string;
  ipi?: string;
}

export const CREDIT_ROLES: Record<CreditCategory, string[]> = {
  artist: ['Primary Artist', 'Featured Artist', 'Remixer'],
  performer: ['Lead Vocals', 'Backing Vocals', 'Guitar', 'Bass', 'Drums', 'Keyboards', 'Piano', 'Synthesizer', 'Strings', 'Horns', 'Percussion', 'Programming', 'Choir'],
  writer: ['Songwriter', 'Composer', 'Lyricist', 'Arranger'],
  producer: ['Producer', 'Co-Producer', 'Executive Producer', 'Vocal Producer', 'Additional Production'],
  engineer: ['Recording Engineer', 'Mixing Engineer', 'Mastering Engineer', 'Assistant Engineer', 'Editing'],
  artwork: ['Art Direction', 'Cover Art', 'Photography', 'Design', 'Motion Artwork'],
  management: ['Management', 'A&R', 'Label', 'Publisher'],
  other: ['Liner Notes', 'Translation', 'Special Thanks'],
};

export type ExplicitFlag = 'none' | 'clean' | 'explicit';

/** Per-song metadata — what a distributor, a CD's subcode and Chora's player all want. */
export interface TrackMeta {
  isrc?: string;
  iswc?: string;
  explicit?: ExplicitFlag;
  language?: string;
  genre?: string;
  subgenre?: string;
  moods?: string[];
  bpm?: number;
  key?: string;
  version?: string;          // "Radio Edit", "Live at…", "Acoustic"
  featuring?: string;
  publisher?: string;
  pLine?: string;            // ℗ — the sound recording
  cLine?: string;            // © — the composition
  recordedAt?: string;
  recordedOn?: string;       // date string
  previewStartSec?: number;  // where a 30 s preview starts
  focusTrack?: boolean;
  credits?: Credit[];
  notes?: string;
  /** CD-Text fields; empty = derived from title/artist/credits. */
  cdText?: { title?: string; performer?: string; songwriter?: string; composer?: string; arranger?: string; message?: string };
}

export type ReleaseType = 'ALBUM' | 'EP' | 'SINGLE' | 'MIX' | 'COMPILATION';

export interface AlbumMeta {
  releaseType?: ReleaseType;
  upc?: string;
  catalogNumber?: string;
  explicit?: ExplicitFlag;
  language?: string;
  primaryGenre?: string;
  secondaryGenre?: string;
  moods?: string[];
  pLine?: string;
  cLine?: string;
  distributor?: string;
  originalReleaseDate?: string;
  recordingYear?: string;
  artistBio?: string;
  linerNotes?: string;
  tags?: string[];
  credits?: Credit[];
}

// ── Artwork ──────────────────────────────────────────────────────────────────

/** Chora covers are square. The animated cover has to land in the same drop zone. */
export const COVER_ASPECT = 1;
export const LOOP_MAX_SEC = 10;

export type FitMode = 'cover' | 'contain' | 'fill';

export interface AnimatedCover {
  kind: 'gif' | 'loop';
  /** The file Chora plays — square, ≤ 10 s. */
  url: string;
  mime: string;
  durationSec?: number;
  /** What the artist dropped, before the fit. */
  sourceW?: number;
  sourceH?: number;
  fit?: FitMode;
}

export interface TelaCoverLink {
  docId: string;
  /** Follow the doc's latest published version, or pin one. */
  mode: 'follow-latest' | 'pinned';
  versionId?: string;
  frameId?: string;
  /** Play the doc live on the album page (interactive effects), not just its still. */
  interactive: boolean;
  /** Still rendered from the doc for places that need an image (thumbnails, CD print). */
  stillUrl?: string;
}

export interface ArtworkState {
  animated?: AnimatedCover | null;
  tela?: TelaCoverLink | null;
  /** Which of the three is the album's face on Chora. */
  primary?: 'still' | 'animated' | 'tela';
  /** Back cover / inlay / disc face — physical packaging art. */
  backCover?: string;
  discFace?: string;
}

// ── Release options (the Album Creator's, set here) ──────────────────────────

export interface ReleaseOptions {
  visibility?: 'public' | 'private' | 'intimate';
  draft?: boolean;
  price?: number;
  isPaywalled?: boolean;
  previewOnly?: boolean;
  scheduled?: boolean;
  releaseDate?: string;        // datetime-local value
  announcement?: { enabled: boolean; message: string };
  rightsConfirmed?: boolean;
  allowComments?: boolean;
  publishVideosToGallery?: boolean;
  publishToAudius?: boolean;
  audiusHandle?: string;
  earlyAccessEnabled?: boolean;
  slideshowEnabled?: boolean;
  socialLinks?: { platform: string; url: string }[];
  liveFeedUrl?: string;
  donationGoal?: number;
}

// ── Media: videos for Reello + the slideshow ─────────────────────────────────

export type DeskVideoKind = 'music-video' | 'visualizer' | 'lyric-video' | 'live' | 'behind-the-scenes' | 'trailer';

export interface DeskVideo {
  id: string;
  title: string;
  kind: DeskVideoKind;
  /** Locker / Mux / uploaded url. */
  url: string;
  thumbnail?: string;
  trackId?: string;
  durationSec?: number;
  /** Mirror to Reello on publish (or now, via the Reello button). */
  toReello: boolean;
  reelloVideoId?: string;
}

export interface SlideshowPhoto { id: string; url: string; caption?: string; trackId?: string }

// ── Visuals: the album's own visualizers + custom shaders ────────────────────

export interface CustomShader {
  id: string;
  name: string;
  /** Shadertoy-style GLSL (mainImage) or an ISF JSON+GLSL source. */
  format: 'shadertoy' | 'isf';
  source: string;
  /** Empty = available on every song. */
  trackIds?: string[];
  createdAt: number;
}

export interface VisualsState {
  /**
   * The album's default stage — a visualizer catalog value ('SHADER:<name>' or a generator
   * mode, AmboTemplateVisualizerPicker's format), or 'CUSTOM:<shaderId>' for an uploaded shader.
   */
  defaultVisual?: string;
  perTrack?: Record<string, string>;
  customShaders?: CustomShader[];
  /** Lock the album to the artist's visuals (the viewer can't cycle to others). */
  lockToArtist?: boolean;
}

// ── Chora Mixes versions + Show Mode + Pixels ────────────────────────────────

export type MixVersionKind = 'continuous' | 'dj' | 'extended' | 'radio' | 'instrumental';

export interface MixVersion {
  id: string;
  name: string;
  kind: MixVersionKind;
  /** Running order for this version (track ids); empty = the album order. */
  trackIds: string[];
  /** Crossfade between every pair, seconds (overrides the album transitions). 0 = album's. */
  crossfadeSec: number;
  notes?: string;
  /** Rendered file + the published mix album, once made. */
  renderedUrl?: string;
  publishedAlbumId?: string;
}

export type ShowModeKind = 'DEFAULT' | 'FX' | 'SLIDES';

export interface ShowSetup {
  mode: ShowModeKind;
  countdown: boolean;
  /** Start the show on this song. */
  openingTrackId?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  showLyrics: boolean;
  welcome?: string;
}

export interface PixelsShowLink {
  /** users/{uid}/plajahProjects/{id} */
  projectId?: string;
  projectName?: string;
  /** Last bounce, and where it went. */
  renderedUrl?: string;
  sentTo?: 'reello' | 'fabula' | 'download';
}

// ── Publishing state ─────────────────────────────────────────────────────────

export interface PublishState {
  choraAlbumId?: string;
  choraPublishedAt?: number;
  audiusPermalink?: string;
  audiusPublishedAt?: number;
}

// ── The physical-media plan ──────────────────────────────────────────────────

export interface PhysicalPlan {
  presetId: string;
  /** Track indices where each side after the first begins (vinyl/tape). Absent = auto split. */
  sideBreaks?: number[];
  /** Red Book pre-gap before track 1 (seconds, ≥ 2). */
  pregapSec?: number;
  cdText?: boolean;
  /** Pre-emphasis / copy-prohibit flags in the PQ subcode — almost always off. */
  preEmphasis?: boolean;
  copyProhibit?: boolean;
  /** Tape: leader silence at the head of each side, and pad sides to equal length. */
  leaderSec?: number;
  matchSides?: boolean;
  /** Dither for the 16-bit print. */
  dither?: 'tpdf' | 'none';
}

export interface ReleaseDeskState {
  album?: AlbumMeta;
  artwork?: ArtworkState;
  release?: ReleaseOptions;
  videos?: DeskVideo[];
  slideshow?: SlideshowPhoto[];
  visuals?: VisualsState;
  mixes?: MixVersion[];
  show?: ShowSetup;
  pixels?: Record<string, PixelsShowLink>;
  physical?: PhysicalPlan;
  publish?: PublishState;
}

/** Read-or-create the desk on a project (mutating — call inside mutateProject). */
export function deskOf(p: MasterProjectDoc): ReleaseDeskState {
  if (!p.desk) p.desk = {};
  return p.desk;
}

export function metaOf(t: ProjectTrack): TrackMeta {
  if (!t.meta) t.meta = {};
  return t.meta;
}

export const deskUid = () => Math.random().toString(36).slice(2, 10);

// ── Physical media presets ───────────────────────────────────────────────────

export type Medium = 'digital' | 'cd' | 'vinyl' | 'tape';

export interface MediaPreset {
  id: string;
  medium: Medium;
  label: string;
  sides: number;
  /** Conservative per-side budget (minutes). null = unlimited. */
  sweetMinPerSide: number | null;
  /** Physical ceiling per side (minutes). null = unlimited. */
  maxMinPerSide: number | null;
  maxTracks: number | null;
  minTrackSec?: number;
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: 16 | 24;
  /** True-peak ceiling the print should respect, dBTP. */
  ceilingDbtp: number;
  targetLufs?: number;
  /** Fold bass to mono below this — a cutting-lathe requirement. */
  monoBelowHz?: number;
  leaderSec?: number;
  /** The DiscFormat id the proof sheet's budget readout uses. */
  discFormat?: string;
  notes: string[];
}

export const MEDIA_PRESETS: MediaPreset[] = [
  {
    id: 'digital-stream', medium: 'digital', label: 'Streaming / Digital', sides: 1, sweetMinPerSide: null, maxMinPerSide: null, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -1, targetLufs: -14, discFormat: 'stream',
    notes: ['Gapless, any length', 'Platforms normalise near −14 LUFS — louder only buys distortion', '−1 dBTP ceiling survives lossy encoding'],
  },
  {
    id: 'digital-hires', medium: 'digital', label: 'Hi-Res (24/96)', sides: 1, sweetMinPerSide: null, maxMinPerSide: null, maxTracks: null,
    sampleRate: 96000, bitDepth: 24, ceilingDbtp: -1, discFormat: 'stream',
    notes: ['24-bit / 96 kHz delivery for hi-res stores', 'No dither needed at 24-bit'],
  },
  {
    id: 'cd-74', medium: 'cd', label: 'CD · Red Book 74 min', sides: 1, sweetMinPerSide: 74, maxMinPerSide: 79.95, maxTracks: 99, minTrackSec: 4,
    sampleRate: 44100, bitDepth: 16, ceilingDbtp: -0.3, discFormat: 'cd74',
    notes: ['44.1 kHz / 16-bit, TPDF-dithered at the last step', '2 s pre-gap before track 1 · track starts on 1/75 s frames', 'ISRC per track · UPC/EAN per disc · CD-Text optional'],
  },
  {
    id: 'cd-80', medium: 'cd', label: 'CD · Red Book 80 min', sides: 1, sweetMinPerSide: 78, maxMinPerSide: 79.95, maxTracks: 99, minTrackSec: 4,
    sampleRate: 44100, bitDepth: 16, ceilingDbtp: -0.3, discFormat: 'cd80',
    notes: ['Full 80-minute disc — some older players struggle past 74 min', 'Same Red Book rules: 99 tracks, 4 s minimum, frame-aligned starts'],
  },
  {
    id: 'vinyl-7-45', medium: 'vinyl', label: 'Vinyl · 7″ 45 rpm', sides: 2, sweetMinPerSide: 4, maxMinPerSide: 5, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -1, monoBelowHz: 150, discFormat: 'lp7_45',
    notes: ['4:30 per side is the practical max', 'Bass folded to mono below ~150 Hz for the cutter', 'Tame harsh sibilance — the stylus can’t track it'],
  },
  {
    id: 'vinyl-10-33', medium: 'vinyl', label: 'Vinyl · 10″ 33⅓', sides: 2, sweetMinPerSide: 12, maxMinPerSide: 15, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -1, monoBelowHz: 150,
    notes: ['12 min/side sweet spot', 'Put quieter songs at the end of a side — inner grooves lose top end'],
  },
  {
    id: 'vinyl-12-33', medium: 'vinyl', label: 'Vinyl · 12″ LP 33⅓', sides: 2, sweetMinPerSide: 18, maxMinPerSide: 22, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -1, monoBelowHz: 150, discFormat: 'lp12_33',
    notes: ['18–20 min/side sweet spot; past 20 the cut goes quieter and thinner', 'Loud, bright songs first on a side; quiet ones last (inner-groove distortion)', 'Bass in mono below ~150 Hz · no extreme out-of-phase content'],
  },
  {
    id: 'vinyl-12-45', medium: 'vinyl', label: 'Vinyl · 12″ 45 rpm', sides: 2, sweetMinPerSide: 12, maxMinPerSide: 15, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -1, monoBelowHz: 120, discFormat: 'lp12_45',
    notes: ['Loudest, punchiest cut — the club 12″ standard', '12 min/side keeps full level'],
  },
  {
    id: 'vinyl-2lp', medium: 'vinyl', label: 'Vinyl · 2×12″ (4 sides)', sides: 4, sweetMinPerSide: 18, maxMinPerSide: 22, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -1, monoBelowHz: 150,
    notes: ['A double LP — four sides of ≤ 20 min', 'Sequence so each side has its own arc'],
  },
  {
    id: 'tape-c46', medium: 'tape', label: 'Cassette · C46', sides: 2, sweetMinPerSide: 23, maxMinPerSide: 23, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -3, leaderSec: 5,
    notes: ['23 min/side · both sides padded to equal length', 'Type II (chrome) holds treble best for duplication', 'Leave headroom: peaks ≈ −3 dBTP before the duplicator'],
  },
  {
    id: 'tape-c60', medium: 'tape', label: 'Cassette · C60', sides: 2, sweetMinPerSide: 30, maxMinPerSide: 30, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -3, leaderSec: 5,
    notes: ['30 min/side', 'Dolby B on the duplicator only if the listener will decode it — otherwise none'],
  },
  {
    id: 'tape-c90', medium: 'tape', label: 'Cassette · C90', sides: 2, sweetMinPerSide: 45, maxMinPerSide: 45, maxTracks: null,
    sampleRate: 48000, bitDepth: 24, ceilingDbtp: -3, leaderSec: 5,
    notes: ['45 min/side — thinner tape, slightly less high end', 'Pad side A and side B to the same length'],
  },
  {
    id: 'tape-reel-15', medium: 'tape', label: 'Reel-to-reel · ¼″ 15 ips (10.5″ reel)', sides: 1, sweetMinPerSide: 33, maxMinPerSide: 33, maxTracks: null,
    sampleRate: 96000, bitDepth: 24, ceilingDbtp: -3, leaderSec: 10,
    notes: ['2,500 ft at 15 ips ≈ 33 min', 'Supply a 1 kHz / 10 kHz / 100 Hz tone set for alignment'],
  },
];

export const presetById = (id: string | undefined): MediaPreset =>
  MEDIA_PRESETS.find((p) => p.id === id) ?? MEDIA_PRESETS[0];

// ── Sides ────────────────────────────────────────────────────────────────────

export interface SidePlan {
  label: string;               // "A", "B"…
  trackIndices: number[];
  seconds: number;
  level: 'ok' | 'warn' | 'over';
}

const trackSeconds = (laid: { startSec: number; endSec: number }[]) => laid.map((l) => l.endSec - l.startSec);

/**
 * Balance a running order across N sides without re-ordering it: contiguous runs, minimising
 * the longest side (DP over split points — albums are small, so O(n²·sides) is nothing).
 */
export function autoSideBreaks(durations: number[], sides: number): number[] {
  const n = durations.length;
  if (sides <= 1 || n <= 1) return [];
  const pre = [0];
  for (const d of durations) pre.push(pre[pre.length - 1] + d);
  const sum = (a: number, b: number) => pre[b] - pre[a];
  const k = Math.min(sides, n);
  // best[s][i] = minimal max-side for the first i tracks on s sides
  const best: number[][] = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0));
  best[0][0] = 0;
  for (let s = 1; s <= k; s++) {
    for (let i = 1; i <= n; i++) {
      for (let j = s - 1; j < i; j++) {
        const v = Math.max(best[s - 1][j], sum(j, i));
        if (v < best[s][i]) { best[s][i] = v; cut[s][i] = j; }
      }
    }
  }
  const breaks: number[] = [];
  let i = n;
  for (let s = k; s > 1; s--) { i = cut[s][i]; breaks.unshift(i); }
  return breaks;
}

export function planSides(
  laid: { startSec: number; endSec: number }[],
  preset: MediaPreset,
  breaks?: number[],
): SidePlan[] {
  const durs = trackSeconds(laid);
  const useBreaks = (breaks && breaks.length ? breaks : autoSideBreaks(durs, preset.sides))
    .filter((b) => b > 0 && b < durs.length)
    .sort((a, b) => a - b);
  const bounds = [0, ...useBreaks, durs.length];
  const out: SidePlan[] = [];
  for (let s = 0; s < bounds.length - 1; s++) {
    const idx: number[] = [];
    for (let i = bounds[s]; i < bounds[s + 1]; i++) idx.push(i);
    // Side time = from the first track's head to the last track's tail (gaps included).
    const seconds = idx.length ? laid[idx[idx.length - 1]].endSec - laid[idx[0]].startSec : 0;
    const min = seconds / 60;
    const level = preset.maxMinPerSide != null && min > preset.maxMinPerSide ? 'over'
      : preset.sweetMinPerSide != null && min > preset.sweetMinPerSide ? 'warn' : 'ok';
    out.push({ label: preset.sides > 1 ? String.fromCharCode(65 + s) : 'Programme', trackIndices: idx, seconds, level });
  }
  return out;
}

// ── Red Book / identifier validation ─────────────────────────────────────────

export interface MediaCheck { level: 'ok' | 'warn' | 'error'; text: string }

export const normIsrc = (s: string | undefined) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** ISO 3901: CC (country) + XXX (registrant) + YY (year) + NNNNN (designation). */
export const isValidIsrc = (s: string | undefined) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normIsrc(s));
export const formatIsrc = (s: string | undefined) => {
  const n = normIsrc(s);
  return n.length === 12 ? `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5, 7)}-${n.slice(7)}` : (s || '');
};

/** UPC-A (12) or EAN-13 with a correct GS1 check digit. */
export function isValidUpc(s: string | undefined): boolean {
  const d = (s || '').replace(/\D/g, '');
  if (d.length !== 12 && d.length !== 13) return false;
  const digits = d.split('').map(Number);
  const check = digits.pop()!;
  // Weights run 3,1,3,1… from the digit nearest the check digit.
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** CD-Text is ISO-8859-1 (Latin-1); characters outside it don't survive the subcode. */
const isLatin1 = (s: string) => /^[\x20-\x7E\xA0-\xFF]*$/.test(s);

export function checkPhysical(
  project: MasterProjectDoc,
  laid: { startSec: number; endSec: number; track: ProjectTrack }[],
  preset: MediaPreset,
): MediaCheck[] {
  const out: MediaCheck[] = [];
  const plan = project.desk?.physical;
  const total = laid.length ? laid[laid.length - 1].endSec : 0;
  if (!laid.length) return [{ level: 'warn', text: 'No tracks on the proof sheet yet.' }];

  if (preset.maxTracks != null && laid.length > preset.maxTracks) out.push({ level: 'error', text: `${laid.length} tracks — ${preset.label} allows ${preset.maxTracks}.` });

  if (preset.medium === 'cd') {
    const pregap = Math.max(2, plan?.pregapSec ?? 2);
    const disc = (total + pregap) / 60;
    if (disc > (preset.maxMinPerSide ?? 79.95)) out.push({ level: 'error', text: `Programme + pre-gap is ${disc.toFixed(2)} min — past the ${preset.maxMinPerSide} min disc.` });
    else if (preset.sweetMinPerSide && disc > preset.sweetMinPerSide) out.push({ level: 'warn', text: `${disc.toFixed(1)} min — past ${preset.sweetMinPerSide} min some players and plants get fussy.` });
    else out.push({ level: 'ok', text: `${disc.toFixed(2)} min including the ${pregap.toFixed(0)} s pre-gap — fits.` });
    const short = laid.filter((l) => l.endSec - l.startSec < (preset.minTrackSec ?? 4));
    if (short.length) out.push({ level: 'error', text: `Red Book needs ≥ 4 s per track: ${short.map((l) => l.track.title).join(', ')}.` });
    const missingIsrc = laid.filter((l) => !l.track.meta?.isrc);
    const badIsrc = laid.filter((l) => l.track.meta?.isrc && !isValidIsrc(l.track.meta.isrc));
    if (badIsrc.length) out.push({ level: 'error', text: `ISRC malformed (CC-XXX-YY-NNNNN): ${badIsrc.map((l) => l.track.title).join(', ')}.` });
    if (missingIsrc.length) out.push({ level: 'warn', text: `${missingIsrc.length} track${missingIsrc.length > 1 ? 's' : ''} without an ISRC — the plant will encode none.` });
    const upc = project.desk?.album?.upc;
    if (!upc) out.push({ level: 'warn', text: 'No UPC/EAN — the disc’s catalog (MCN) field will be empty.' });
    else if (!isValidUpc(upc)) out.push({ level: 'error', text: 'UPC/EAN check digit is wrong.' });
    if (plan?.cdText !== false) {
      const nonLatin = laid.filter((l) => !isLatin1(l.track.meta?.cdText?.title || l.track.title));
      if (nonLatin.length) out.push({ level: 'warn', text: `CD-Text is Latin-1 only — these titles will be mangled: ${nonLatin.map((l) => l.track.title).join(', ')}.` });
    }
    const subIndex = (project.markers ?? []).filter((m) => m.kind === 'index').length;
    if (subIndex) out.push({ level: 'ok', text: `${subIndex} sub-index point${subIndex > 1 ? 's' : ''} (index 02+) will be written.` });
    out.push({ level: 'ok', text: 'Track starts will be snapped to CD frames (1/75 s) on export.' });
  } else if (preset.sides > 1 || preset.medium === 'tape') {
    const sides = planSides(laid, preset, plan?.sideBreaks);
    for (const s of sides) {
      const min = s.seconds / 60;
      if (s.level === 'over') out.push({ level: 'error', text: `Side ${s.label}: ${min.toFixed(1)} min — past the ${preset.maxMinPerSide} min ceiling.` });
      else if (s.level === 'warn') out.push({ level: 'warn', text: `Side ${s.label}: ${min.toFixed(1)} min — past the ${preset.sweetMinPerSide} min sweet spot; level and bass suffer.` });
      else out.push({ level: 'ok', text: `Side ${s.label}: ${min.toFixed(1)} min · ${s.trackIndices.length} track${s.trackIndices.length === 1 ? '' : 's'}.` });
    }
    if (preset.medium === 'tape' && sides.length > 1) {
      const diff = Math.abs(sides[0].seconds - sides[1].seconds);
      if (diff > 60) out.push({ level: 'warn', text: `Sides differ by ${(diff / 60).toFixed(1)} min — the short side will be padded with silence${plan?.matchSides === false ? ' (padding is off)' : ''}.` });
    }
  } else {
    const min = total / 60;
    if (preset.maxMinPerSide != null && min > preset.maxMinPerSide) out.push({ level: 'error', text: `${min.toFixed(1)} min — past the ${preset.maxMinPerSide} min reel.` });
    else out.push({ level: 'ok', text: `${min.toFixed(1)} min programme.` });
  }
  return out;
}

// ── CUE sheet / PQ log ───────────────────────────────────────────────────────

const msf = (sec: number) => {
  const frames = Math.round(Math.max(0, sec) * 75);
  const m = Math.floor(frames / (75 * 60));
  const s = Math.floor((frames / 75) % 60);
  const f = frames % 75;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};
/** Snap a time to the nearest CD frame. */
export const toFrame = (sec: number) => Math.round(sec * 75) / 75;
const cueStr = (s: string) => `"${s.replace(/"/g, "'").slice(0, 80)}"`;

export interface CueTrack {
  title: string;
  performer: string;
  songwriter?: string;
  isrc?: string;
  /** Index 01 on the programme file (seconds, pre-gap included). */
  index01: number;
  /** Index 00 (the pause before the track), when there is one. */
  index00?: number;
  subIndexes?: number[];
}

/**
 * A CUE sheet for the single-file programme: CATALOG, CD-Text TITLE/PERFORMER/SONGWRITER,
 * ISRC and INDEX points in mm:ss:ff. Burners and many replication plants accept it with
 * the WAV; DDP is still the master format for most plants (not generated here).
 */
export function buildCueSheet(opts: { file: string; title: string; performer: string; upc?: string; tracks: CueTrack[]; cdText: boolean }): string {
  const lines: string[] = [];
  lines.push('REM COMMENT "Chora Mastering Desk"');
  if (opts.upc && isValidUpc(opts.upc)) lines.push(`CATALOG ${opts.upc.replace(/\D/g, '').padStart(13, '0')}`);
  if (opts.cdText) { lines.push(`TITLE ${cueStr(opts.title)}`); if (opts.performer) lines.push(`PERFORMER ${cueStr(opts.performer)}`); }
  lines.push(`FILE ${cueStr(opts.file)} WAVE`);
  opts.tracks.forEach((t, i) => {
    lines.push(`  TRACK ${String(i + 1).padStart(2, '0')} AUDIO`);
    if (opts.cdText) {
      lines.push(`    TITLE ${cueStr(t.title)}`);
      if (t.performer) lines.push(`    PERFORMER ${cueStr(t.performer)}`);
      if (t.songwriter) lines.push(`    SONGWRITER ${cueStr(t.songwriter)}`);
    }
    if (t.isrc && isValidIsrc(t.isrc)) lines.push(`    ISRC ${normIsrc(t.isrc)}`);
    if (t.index00 != null && t.index00 < t.index01 - 1 / 75) lines.push(`    INDEX 00 ${msf(t.index00)}`);
    lines.push(`    INDEX 01 ${msf(t.index01)}`);
    (t.subIndexes ?? []).slice(0, 97).forEach((s, k) => lines.push(`    INDEX ${String(k + 2).padStart(2, '0')} ${msf(s)}`));
  });
  return lines.join('\r\n') + '\r\n';
}

/** A human-readable PQ log — what a mastering house sends the plant alongside the image. */
export function buildPqLog(opts: { title: string; performer: string; upc?: string; tracks: (CueTrack & { durationSec: number })[]; totalSec: number }): string {
  const rows = opts.tracks.map((t, i) =>
    `${String(i + 1).padStart(2, '0')}  ${msf(t.index01)}  ${msf(t.durationSec)}  ${(t.isrc ? formatIsrc(t.isrc) : '—').padEnd(15)}  ${t.title}`);
  return [
    `PQ LOG — ${opts.title} — ${opts.performer}`,
    `UPC/EAN: ${opts.upc || '—'}`,
    `Total: ${msf(opts.totalSec)} (mm:ss:ff, 75 frames/s)`,
    '',
    'TR  START     LENGTH    ISRC             TITLE',
    ...rows,
    '',
  ].join('\r\n');
}

/** TPDF dither in place — ±1 LSB triangular noise before the 16-bit truncation. */
export function ditherTpdf(buffer: AudioBuffer, bits = 16): void {
  const lsb = 1 / (2 ** (bits - 1));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] += (Math.random() - Math.random()) * lsb;
  }
}

/** Every credit across the album, de-duplicated by name+role — for the liner notes. */
export function allCredits(project: MasterProjectDoc): Credit[] {
  const seen = new Set<string>();
  const out: Credit[] = [];
  for (const c of [...(project.desk?.album?.credits ?? []), ...project.tracks.flatMap((t) => t.meta?.credits ?? [])]) {
    const k = `${c.name.trim().toLowerCase()}|${c.role.trim().toLowerCase()}`;
    if (seen.has(k) || !c.name.trim()) continue;
    seen.add(k); out.push(c);
  }
  return out;
}

/** Credits flattened into liner-note text (Chora's album page reads linerNotes as prose). */
export function creditsToText(credits: Credit[]): string {
  const byRole = new Map<string, string[]>();
  for (const c of credits) {
    const role = c.instrument ? `${c.role} (${c.instrument})` : c.role;
    byRole.set(role, [...(byRole.get(role) ?? []), c.name]);
  }
  return Array.from(byRole.entries()).map(([role, names]) => `${role} — ${names.join(', ')}`).join('\n');
}
