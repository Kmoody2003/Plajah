/**
 * Melos — the Chora production workspace
 * --------------------------------------
 * The room where an album gets made, before it's an album.
 *
 * One shared data model — production → songs → lyric blocks → arrangements →
 * pins → samples (+ clearance) → sessions → people → capture notes → video ideas
 * → scores — so nothing is re-keyed and the finished record inherits everything
 * that was written along the way.
 *
 * Blueprint: docs/PLAJAH_MELOS_BLUEPRINT.md
 * Precedent: services/filmProductionService.ts (same shape, Film discipline).
 *
 * Firestore layout:
 *   melosProductions/{prodId}
 *   melosProductions/{prodId}/songs/{songId}
 *   melosProductions/{prodId}/arrangements/{arrId}
 *   melosProductions/{prodId}/pins/{pinId}
 *   melosProductions/{prodId}/samples/{sampleId}
 *   melosProductions/{prodId}/sessions/{sessionId}
 *   melosProductions/{prodId}/people/{personId}
 *   melosProductions/{prodId}/notes/{noteId}
 *   melosProductions/{prodId}/videoIdeas/{ideaId}
 *   melosProductions/{prodId}/scores/{scoreId}
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from './backendService';
import {
  PUBLIC_DOMAIN_HYMNS,
  PUBLIC_DOMAIN_GOSPEL_SONGS,
  type SacredHymnOrPrayer,
} from '../data/sacredHymnsAndPrayers';

// ═══ Song state — the two independent axes ═══════════════════════════════════
// These are deliberately NOT one status. A song can be FINISHED and TENTATIVE
// (it's done, it might not fit); it can be a SPARK and already VERIFIED (eight
// bars, but it's the centre of the record). Collapsing them is the mistake every
// project tool makes.

/** Where a song sits in the *process*. */
export type SongState = 'SPARK' | 'WRITING' | 'DEMO' | 'TRACKING' | 'MIXING' | 'FINISHED';

/** Whether a song is *making the record*. */
export type Commitment = 'TENTATIVE' | 'WORKING_ON_IT' | 'VERIFIED' | 'SHELVED' | 'CUT';

export interface StateMeta { key: SongState; label: string; hint: string; color: string; order: number }

export const SONG_STATES: StateMeta[] = [
  { key: 'SPARK',    label: 'Spark',     hint: 'An idea, a hum, a line',            color: '#9C96B4', order: 0 },
  { key: 'WRITING',  label: 'Writing',   hint: 'Words and shape being found',       color: '#D0BCFF', order: 1 },
  { key: 'DEMO',     label: 'Demo',      hint: 'Rough version exists',              color: '#00DAF3', order: 2 },
  { key: 'TRACKING', label: 'Tracking',  hint: 'Real parts being recorded',         color: '#FF8C00', order: 3 },
  { key: 'MIXING',   label: 'Mixing',    hint: 'Balance and polish',                color: '#D40055', order: 4 },
  { key: 'FINISHED', label: 'Finished',  hint: 'Done — nothing left to do',         color: '#06D6A0', order: 5 },
];

export interface CommitmentMeta { key: Commitment; label: string; hint: string; color: string }

export const COMMITMENTS: CommitmentMeta[] = [
  { key: 'TENTATIVE',     label: 'Tentative',     hint: 'Might make it, might not',       color: '#9C96B4' },
  { key: 'WORKING_ON_IT', label: 'Working on it', hint: 'Actively fighting for its place', color: '#F59E0B' },
  { key: 'VERIFIED',      label: 'Verified',      hint: 'This one is on the record',       color: '#06D6A0' },
  { key: 'SHELVED',       label: 'Shelved',       hint: 'Not this record — keep it',       color: '#635F73' },
  { key: 'CUT',           label: 'Cut',           hint: 'Off the record',                  color: '#EF4444' },
];

export const stateMeta = (k: SongState): StateMeta =>
  SONG_STATES.find(s => s.key === k) || SONG_STATES[0];
export const commitmentMeta = (k: Commitment): CommitmentMeta =>
  COMMITMENTS.find(c => c.key === k) || COMMITMENTS[0];

/** Commitments that count toward the finished tracklist. */
export const IS_ON_RECORD: Commitment[] = ['VERIFIED', 'WORKING_ON_IT'];

// ═══ Pad Skins ═══════════════════════════════════════════════════════════════
// Skins govern the PAPER tier only (Pad / Tracklist / Arrange / Board / Sessions
// / Notebook). The INSTRUMENT tier (Beats / Sequence / Mixer / Score / Feel)
// holds a matte slab in every skin and inherits only `accent`. Letting skin
// tokens reach the instrument tier is a bug, not a shortcut.

export type PadSkin = 'LAMPLIGHT' | 'ONION_SKIN';

export interface SkinMeta {
  key: PadSkin;
  label: string;
  blurb: string;
  /** Paper-tier ground. */
  ground: string;
  /** The one colour the instrument tier is allowed to inherit. */
  accent: string;
}

export const PAD_SKINS: SkinMeta[] = [
  { key: 'LAMPLIGHT',  label: 'Lamplight',  blurb: 'A warm pool of light on the work', ground: '#0A0910', accent: '#D0BCFF' },
  { key: 'ONION_SKIN', label: 'Onion Skin', blurb: 'Tracing paper over deep warm ink',  ground: '#15110F', accent: '#E9A85C' },
];

export const DEFAULT_SKIN: PadSkin = 'LAMPLIGHT';
export const skinMeta = (k?: PadSkin): SkinMeta =>
  PAD_SKINS.find(s => s.key === k) || PAD_SKINS[0];

// ═══ Lyrics ══════════════════════════════════════════════════════════════════
// Lyrics are typed blocks, never a text blob — that is what makes drag-to-
// rearrange, lock-the-hook and shuffle-within-block possible at all.

export type BlockKind =
  | 'INTRO' | 'VERSE' | 'PRE' | 'CHORUS' | 'HOOK' | 'BRIDGE'
  | 'REFRAIN' | 'OUTRO' | 'AD_LIB' | 'NOTE';

export interface BlockMeta { key: BlockKind; label: string; color: string }

export const BLOCK_KINDS: BlockMeta[] = [
  { key: 'INTRO',   label: 'Intro',    color: '#9C96B4' },
  { key: 'VERSE',   label: 'Verse',    color: '#D0BCFF' },
  { key: 'PRE',     label: 'Pre',      color: '#B39DDB' },
  { key: 'CHORUS',  label: 'Chorus',   color: '#D40055' },
  { key: 'HOOK',    label: 'Hook',     color: '#FF6E9E' },
  { key: 'BRIDGE',  label: 'Bridge',   color: '#FF8C00' },
  { key: 'REFRAIN', label: 'Refrain',  color: '#00DAF3' },
  { key: 'OUTRO',   label: 'Outro',    color: '#7A8B9E' },
  { key: 'AD_LIB',  label: 'Ad lib',   color: '#8A7F70' },
  { key: 'NOTE',    label: 'Note',     color: '#635F73' },
];

export const blockMeta = (k: BlockKind): BlockMeta =>
  BLOCK_KINDS.find(b => b.key === k) || BLOCK_KINDS[BLOCK_KINDS.length - 1];

export interface LyricBlock {
  id: string;
  kind: BlockKind;
  /** Display label — "Verse 2", "Chorus (alt)". Falls back to the kind label. */
  label?: string;
  lines: string[];
  /** Optional inline chord progression or lead-sheet chords for this section (e.g. "Am - F - C - G"). */
  chords?: string;
  /** Locked blocks can't be dragged or edited — the hook you don't want touched. */
  locked?: boolean;
  color?: string;
}

export interface SongSheetNote {
  id?: string;
  midi: number;
  startBeat: number;
  durBeats: number;
  voice?: 'melody' | 'bass';
  lyric?: string;
}

// ═══ Song ════════════════════════════════════════════════════════════════════

export type TrackSource = 'LOCKER' | 'UPLOAD' | 'ALBUM' | 'REELLO' | 'BEATS';

export interface SongTrackRef {
  trackId?: string;
  url: string;
  title?: string;
  source: TrackSource;
  durationSec?: number;
}

export interface SongTake {
  id: string;
  label: string;
  url?: string;
  source: TrackSource;
  createdAt: number;
  note?: string;
  /** Rendered out of the Beats room rather than uploaded. */
  fromBeats?: boolean;
  durationSec?: number;
}

/** Breakdown-engine readout for one song. */
export interface SongFeel {
  bpm?: number;
  keySig?: string;
  mode?: 'major' | 'minor';
  /** 0–1. Drives the arrangement energy curve. */
  energy?: number;
  brightness?: number;
  density?: number;
  /** Section letters from guidedListening.buildForm — e.g. "ABAB'C". */
  form?: string;
  chordSummary?: string;
  analyzedAt?: number;
}

export interface SongCredit {
  id: string;
  name: string;
  role: string;
  /** Links to a Melos collaborator when they're on the roster. */
  personId?: string;
  instrument?: string;
}

export type MusicSubCategoryKey =
  | 'ALL'
  | 'music-worship-teams'
  | 'music-band'
  | 'music-choir'
  | 'music-collective';

export interface MusicSubDepartmentMeta {
  key: Exclude<MusicSubCategoryKey, 'ALL'>;
  name: string;
  shortLabel: string;
  emoji: string;
  badgeColor: string;
  leadTitle: string;
  callTime: string;
  focus: string;
  rosterCount: number;
}

export const MUSIC_SUB_DEPARTMENTS: MusicSubDepartmentMeta[] = [
  {
    key: 'music-worship-teams',
    name: 'Worship Teams',
    shortLabel: 'Worship Teams',
    emoji: '🎤',
    badgeColor: '#F59E0B',
    leadTitle: 'Praise & Worship Vocalists · Frontline Leaders',
    callTime: 'Sundays 7:30 AM Vocal Warmup · Thursdays 6:30 PM',
    focus: 'Congregational worship leading, three-part praise harmonies, prophetic transitions & altar ministry.',
    rosterCount: 14,
  },
  {
    key: 'music-band',
    name: 'Band',
    shortLabel: 'Band',
    emoji: '🎸',
    badgeColor: '#38BDF8',
    leadTitle: 'Sanctuary Band · Keys, Hammond B3, Guitars, Bass, Drums & Horns',
    callTime: 'Sundays 7:00 AM Soundcheck · Thursdays 7:00 PM Band Run-Through',
    focus: 'Chord charts, Nashville number system, click/stems, organ accompaniment & dynamic transitions.',
    rosterCount: 11,
  },
  {
    key: 'music-choir',
    name: 'Choir',
    shortLabel: 'Choir',
    emoji: '🎶',
    badgeColor: '#A855F7',
    leadTitle: 'Sanctuary SATB Choir & Gospel Mass Choir',
    callTime: 'Sundays 8:00 AM Choir Loft · Thursdays 7:15 PM SATB Sectionals',
    focus: 'Four-part SATB hymnal harmony, Gospel choir anthems, classical motets & liturgical responses.',
    rosterCount: 38,
  },
  {
    key: 'music-collective',
    name: 'Collective Music Department',
    shortLabel: 'Collective',
    emoji: '🎼',
    badgeColor: '#10B981',
    leadTitle: 'Collective Music Department · Songwriters, Arrangers & Producers',
    callTime: 'Tuesdays 7:00 PM Chora Scratchpad Lab & Melos Studio',
    focus: 'Writing original sanctuary worship songs, re-arranging public-domain hymns, Melos stems & Tela songwriting.',
    rosterCount: 19,
  },
];

export interface MelosSong {
  id: string;
  title: string;
  /** What it was called before it had a real name — shown in the margin. */
  workingTitle?: string;
  state: SongState;
  commitment: Commitment;
  /** 0–5. How much the artist likes it FOR THIS PROJECT — not a quality score. */
  love: number;
  /** 0–100. Will it survive to the final tracklist. */
  confidence: number;
  lyrics: LyricBlock[];
  /** Set when lyrics are locked ⇒ flattened text propagates to Track.lyrics. */
  lyricsLockedAt?: number;
  /** The diary entry. Flows straight into Notebook view. */
  notes?: string;
  tempo?: number;
  keySig?: string;
  timeSig?: string;
  durationSec?: number;
  trackRef?: SongTrackRef;
  /** The song's own DAW project (.dawproject / GrooveDoc) under melosProductions/{prodId}/grooves/{grooveId}.
   *  Set when the song is created; opening the song in Melos Studio loads THIS project (not a shared one). */
  grooveId?: string;
  takes: SongTake[];
  feel?: SongFeel;
  credits: SongCredit[];
  sampleIds: string[];
  /** Capped at 4 — Notebook view's photo slot. */
  images: string[];
  /** Optional engraved sheet music notes written directly in the Pad. */
  sheetNotes?: SongSheetNote[];
  /** Optional organization / church music department metadata stored on the song in Chora. */
  orgId?: string;
  assignedSubDepts?: Array<Exclude<MusicSubCategoryKey, 'ALL'>>;
  availableKeys?: string[];
  chordProgression?: string[];
  sacredCategory?: 'HYMN' | 'GOSPEL' | 'ORIGINAL_COLLECTIVE' | 'SCANNED_PAPER';
  sacredSourceId?: string;
  historyNote?: string;
  color?: string;
  tags: string[];
  order: number;
  createdAt: number;
  updatedAt: number;
}

// ═══ Arrangement — album running order & live setlists ═══════════════════════
// NOTE ON THE WORD: "Arrange" in Melos is the ALBUM RUNNING ORDER / LIVE SETLIST.
// Per-song structure is the LyricBlock order. The Beats room's FL-style pattern
// playlist is called "Sequence" precisely so it doesn't collide with this.

export interface ArrangementSlotCue {
  songId: string;
  performanceKey?: string;
  bpm?: number;
  leadVocalistOrDirector?: string;
  assignedSubDept?: Exclude<MusicSubCategoryKey, 'ALL'>;
  momentInService?: string;
  plannedSec?: number;
  actualSec?: number;
  notes?: string;
}

export interface MelosArrangement {
  id: string;
  name: string;
  songIds: string[];
  notes?: string;
  isPrimary?: boolean;
  /** Optional live service / concert setlist metadata. */
  serviceDate?: string;
  liturgicalTheme?: string;
  slotCues?: Record<string, ArrangementSlotCue>;
  createdAt: number;
  updatedAt: number;
}

// ═══ Inspiration board ═══════════════════════════════════════════════════════

export type PinKind =
  | 'IMAGE' | 'LINK' | 'TRACK' | 'TEXT' | 'COLOR'
  | 'AUDIO' | 'VIDEO' | 'STICKY' | 'SAMPLE' | 'TELA';

export type BoardTrackTag = 'UNFINISHED' | 'IDEA' | 'DEMO' | 'STEM' | 'SAMPLE' | 'REFERENCE';

export interface InspirationPin {
  id: string;
  kind: PinKind;
  url?: string;
  text?: string;
  title?: string;
  note?: string;
  color?: string;
  /** Freeform board position — the board is spatial, not a grid. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  /** Optionally scoped to one song. */
  songId?: string;
  source?: string;
  /** Duration in seconds for AUDIO, TRACK, SAMPLE, or VIDEO pins. */
  durationSec?: number;
  /** Linked SampleCandidate id when kind === 'SAMPLE'. */
  sampleId?: string;
  /** Tag for audio / unfinished track pins on the work board. */
  trackTag?: BoardTrackTag;
  /** Linked Tela doc id when kind === 'TELA'. */
  telaDocId?: string;
  createdAt: number;
}

// ═══ Samples + clearance ═════════════════════════════════════════════════════
// LEGAL POSTURE: Melos is an ORGANISATIONAL tool. It never asserts that a sample
// is cleared, never gives legal advice, and links out rather than concluding.
// The only rights text it shows is the summary publicDomainMusic.ts already
// parses off the source record.

export type SampleOrigin = 'PUBLIC_DOMAIN' | 'PLATFORM' | 'UPLOAD' | 'EXTERNAL' | 'FIELD_RECORDING';

export type ClearanceStatus =
  | 'NOT_NEEDED' | 'NOT_STARTED' | 'IDENTIFYING' | 'CONTACTED'
  | 'NEGOTIATING' | 'CLEARED' | 'DENIED' | 'REPLACED';

export interface ClearanceMeta { key: ClearanceStatus; label: string; color: string; hint: string }

export const CLEARANCE_STATUSES: ClearanceMeta[] = [
  { key: 'NOT_NEEDED',  label: 'No clearance needed', color: '#06D6A0', hint: 'Public domain or original' },
  { key: 'NOT_STARTED', label: 'Not started',         color: '#635F73', hint: 'Nothing done yet' },
  { key: 'IDENTIFYING', label: 'Identifying owners',  color: '#9C96B4', hint: 'Finding master + publishing' },
  { key: 'CONTACTED',   label: 'Contacted',           color: '#00DAF3', hint: 'Reached out, waiting' },
  { key: 'NEGOTIATING', label: 'Negotiating',         color: '#F59E0B', hint: 'Terms in discussion' },
  { key: 'CLEARED',     label: 'Cleared',             color: '#06D6A0', hint: 'Written permission in hand' },
  { key: 'DENIED',      label: 'Denied',              color: '#EF4444', hint: 'Refused — replace or drop' },
  { key: 'REPLACED',    label: 'Replaced',            color: '#7A8B9E', hint: 'Swapped for something else' },
];

export const clearanceMeta = (k: ClearanceStatus): ClearanceMeta =>
  CLEARANCE_STATUSES.find(c => c.key === k) || CLEARANCE_STATUSES[1];

/** Statuses that mean "you cannot release with this as-is". */
export const CLEARANCE_BLOCKING: ClearanceStatus[] =
  ['NOT_STARTED', 'IDENTIFYING', 'CONTACTED', 'NEGOTIATING', 'DENIED'];

export interface ClearanceStep {
  id: string;
  label: string;
  done: boolean;
  doneAt?: number;
  note?: string;
}

/** The default checklist — organisational prompts, not legal instructions. */
export const DEFAULT_CLEARANCE_STEPS: { id: string; label: string }[] = [
  { id: 'identify_master',  label: 'Identify who owns the master recording' },
  { id: 'identify_pub',     label: 'Identify the publisher(s) of the composition' },
  { id: 'gather_details',   label: 'Write down exactly what you used, and where' },
  { id: 'contact_master',   label: 'Contact the master owner' },
  { id: 'contact_pub',      label: 'Contact the publisher' },
  { id: 'agree_terms',      label: 'Agree fee and/or split in writing' },
  { id: 'get_paperwork',    label: 'Get the signed licence on file' },
];

export interface ClearanceRecord {
  status: ClearanceStatus;
  masterOwner?: string;
  publisher?: string;
  contactEmail?: string;
  contactNotes?: string;
  steps: ClearanceStep[];
  feeCents?: number;
  splitPercent?: number;
  agreementUrl?: string;
  /** Rights summary carried over from publicDomainMusic.describeRights(). */
  rightsSummary?: string;
  sourceUrl?: string;
  updatedAt: number;
}

export interface SampleCandidate {
  id: string;
  title: string;
  sourceArtist?: string;
  sourceWork?: string;
  url?: string;
  clipUrl?: string;
  startSec?: number;
  endSec?: number;
  origin: SampleOrigin;
  /** Archive.org identifier when origin is PUBLIC_DOMAIN. */
  pdItemId?: string;
  note?: string;
  usedInSongIds: string[];
  clearance: ClearanceRecord;
  createdAt: number;
  updatedAt: number;
}

// ═══ Studio sessions ═════════════════════════════════════════════════════════

export type SessionKind =
  | 'WRITING' | 'TRACKING' | 'OVERDUB' | 'VOCALS' | 'MIX' | 'MASTER' | 'REHEARSAL' | 'REVIEW';

export const SESSION_KINDS: { key: SessionKind; label: string; color: string }[] = [
  { key: 'WRITING',   label: 'Writing',   color: '#D0BCFF' },
  { key: 'TRACKING',  label: 'Tracking',  color: '#FF8C00' },
  { key: 'OVERDUB',   label: 'Overdub',   color: '#FFB05C' },
  { key: 'VOCALS',    label: 'Vocals',    color: '#D40055' },
  { key: 'MIX',       label: 'Mix',       color: '#00DAF3' },
  { key: 'MASTER',    label: 'Master',    color: '#06D6A0' },
  { key: 'REHEARSAL', label: 'Rehearsal', color: '#9C96B4' },
  { key: 'REVIEW',    label: 'Review',    color: '#7A8B9E' },
];

export type SessionStatus = 'PLANNED' | 'CONFIRMED' | 'DONE' | 'CANCELLED';

export interface CostLine { id: string; label: string; cents: number }

export interface StudioSession {
  id: string;
  title: string;
  kind: SessionKind;
  startsAt: number;
  endsAt: number;
  studioName?: string;
  address?: string;
  /** Cents per hour. */
  roomRateCents?: number;
  engineerName?: string;
  engineerRateCents?: number;
  attendeeIds: string[];
  songIds: string[];
  goals: string[];
  notes?: string;
  status: SessionStatus;
  extraCosts: CostLine[];
  createdAt: number;
  updatedAt: number;
}

// ═══ People ══════════════════════════════════════════════════════════════════

export type PersonRole =
  | 'WRITER' | 'PRODUCER' | 'ENGINEER' | 'MUSICIAN' | 'VOCALIST'
  | 'MIXER' | 'MASTERING' | 'FEATURE' | 'AR' | 'OTHER';

export const PERSON_ROLES: { key: PersonRole; label: string }[] = [
  { key: 'WRITER',    label: 'Writer' },
  { key: 'PRODUCER',  label: 'Producer' },
  { key: 'ENGINEER',  label: 'Engineer' },
  { key: 'MUSICIAN',  label: 'Musician' },
  { key: 'VOCALIST',  label: 'Vocalist' },
  { key: 'MIXER',     label: 'Mixer' },
  { key: 'MASTERING', label: 'Mastering' },
  { key: 'FEATURE',   label: 'Feature' },
  { key: 'AR',        label: 'A&R' },
  { key: 'OTHER',     label: 'Other' },
];

export type PersonStatus = 'INVITED' | 'ACTIVE' | 'DECLINED';

export interface Collaborator {
  id: string;
  /** Platform uid when they're a Plajah user. */
  uid?: string;
  name: string;
  role: PersonRole;
  instrument?: string;
  email?: string;
  splitPercent?: number;
  status: PersonStatus;
  songIds: string[];
  avatarUrl?: string;
  createdAt: number;
}

// ═══ Quick capture ═══════════════════════════════════════════════════════════

export type CaptureKind = 'TEXT' | 'VOICE' | 'PHOTO' | 'HUM';

export interface CaptureNote {
  id: string;
  kind: CaptureKind;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  durationSec?: number;
  transcript?: string;
  /** Unfiled by default — sorted onto a song later, on desktop. */
  songId?: string;
  pinned?: boolean;
  createdAt: number;
}

// ═══ Music video ideas ═══════════════════════════════════════════════════════

export interface VideoShot { id: string; text: string; imageUrl?: string }

export interface MusicVideoIdea {
  id: string;
  songId?: string;
  logline: string;
  treatment?: string;
  shots: VideoShot[];
  pinIds: string[];
  /** Set once it graduates into Fabula. */
  fabulaProjectId?: string;
  createdAt: number;
  updatedAt: number;
}

// ═══ Notation ════════════════════════════════════════════════════════════════

export interface MelosScore {
  id: string;
  songId?: string;
  title: string;
  source: 'IMPORT' | 'TRANSCRIBED';
  musicXml?: string;
  /** Serialised Notation model from services/musicNotation. */
  notationJson?: string;
  fileUrl?: string;
  instrument?: string;
  transcribedFromTrackId?: string;
  createdAt: number;
}

// ═══ Production ══════════════════════════════════════════════════════════════

export type ProductionStatus =
  | 'SEED' | 'WRITING' | 'DEMOING' | 'TRACKING' | 'MIXING' | 'MASTERING' | 'LOCKED' | 'RELEASED';

export const PRODUCTION_STATUSES: { key: ProductionStatus; label: string; color: string }[] = [
  { key: 'SEED',      label: 'Seed',      color: '#9C96B4' },
  { key: 'WRITING',   label: 'Writing',   color: '#D0BCFF' },
  { key: 'DEMOING',   label: 'Demoing',   color: '#00DAF3' },
  { key: 'TRACKING',  label: 'Tracking',  color: '#FF8C00' },
  { key: 'MIXING',    label: 'Mixing',    color: '#D40055' },
  { key: 'MASTERING', label: 'Mastering', color: '#FFB05C' },
  { key: 'LOCKED',    label: 'Locked',    color: '#06D6A0' },
  { key: 'RELEASED',  label: 'Released',  color: '#06D6A0' },
];

export interface MelosProduction {
  id: string;
  ownerUid: string;
  title: string;
  workingTitle?: string;
  /** The artist's own paragraph on why this record exists — re-read when lost. */
  intent?: string;
  artistName?: string;
  artistCharacterId?: string;
  artistWorldId?: string;
  coverImage?: string;
  status: ProductionStatus;
  padSkin: PadSkin;
  targetTrackCount?: number;
  targetReleaseDate?: number;
  budgetCents?: number;
  /** Published album, once it graduates. */
  albumId?: string;
  memberUids: string[];
  chatRoomId?: string;
  boardProjectId?: string;
  /** Optional connected organization / church id & name when this Chora production powers an Org Music Department. */
  orgId?: string;
  orgName?: string;
  visibility: 'PRIVATE' | 'COLLABORATORS';
  createdAt: number;
  updatedAt: number;
}

// ═══ Pure helpers ════════════════════════════════════════════════════════════

export const uid = (p = 'm'): string =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Flatten typed blocks into the plain lyric text an Album Track expects. */
export function flattenLyrics(blocks: LyricBlock[], includeLabels = true): string {
  return blocks
    .filter(b => b.kind !== 'NOTE')
    .map(b => {
      const body = b.lines.filter(l => l.trim()).join('\n');
      if (!body) return '';
      if (!includeLabels) return body;
      const label = b.label || blockMeta(b.kind).label;
      return `[${label}]\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Parse pasted/imported lyrics into typed blocks, honouring [Verse]-style tags, "Chorus:" headers, and smart stanza detection. */
export function parseLyrics(text: string): LyricBlock[] {
  const out: LyricBlock[] = [];
  if (!text?.trim()) return out;

  const guessKind = (label: string): BlockKind => {
    const l = label.toLowerCase();
    if (l.includes('pre')) return 'PRE';
    if (l.includes('chorus')) return 'CHORUS';
    if (l.includes('hook')) return 'HOOK';
    if (l.includes('bridge')) return 'BRIDGE';
    if (l.includes('refrain')) return 'REFRAIN';
    if (l.includes('intro')) return 'INTRO';
    if (l.includes('outro') || l.includes('coda')) return 'OUTRO';
    if ((l.includes('ad') && l.includes('lib')) || l.includes('vocal')) return 'AD_LIB';
    if (l.includes('note') || l.includes('spoken')) return 'NOTE';
    if (l.includes('verse')) return 'VERSE';
    return 'VERSE';
  };

  const push = (label: string | undefined, lines: string[], chords?: string) => {
    const body = lines.map(l => l.trimEnd()).filter(l => l.trim());
    if (!body.length) return;
    const kind = label ? guessKind(label) : 'VERSE';
    out.push({ id: uid('lb'), kind, label: label || undefined, lines: body, ...(chords ? { chords } : {}) });
  };

  const HEADER_RE = /^\s*(?:\[([^\]\n]{1,40})\]|\(([^)\n]{1,32})\)|((?:intro|verse|pre[-\s]?chorus|chorus|hook|bridge|refrain|outro|ad[-\s]?libs?|interlude|coda)(?:\s*\d+)?)\s*[:\-–—]?)\s*$/i;
  const CHORD_LINE_RE = /^\s*(?:chords?\s*[:\-]\s*)?([A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?(?:\s*(?:[-–—|•·,/\s])\s*[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?)+)\s*$/;

  const allLines = text.split(/\r?\n/);
  const hasExplicitHeaders = allLines.some(raw => HEADER_RE.test(raw));

  if (hasExplicitHeaders) {
    let label: string | undefined;
    let buf: string[] = [];
    let chords: string | undefined;
    for (const raw of allLines) {
      const m = raw.match(HEADER_RE);
      if (m) {
        push(label, buf, chords);
        label = (m[1] || m[2] || m[3] || '').trim();
        buf = [];
        chords = undefined;
      } else {
        const cm = !buf.length && raw.match(CHORD_LINE_RE);
        if (cm) {
          chords = cm[1].trim();
        } else {
          buf.push(raw);
        }
      }
    }
    push(label, buf, chords);
    return autoLabelBlocks(out);
  }

  // Untagged: blank lines separate stanzas; detect repeated stanzas as CHORUS and short stanzas as PRE/INTRO/OUTRO.
  const chunks = text
    .split(/\r?\n\s*\r?\n/)
    .map(c => c.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim()))
    .filter(c => c.length > 0);

  // Normalize first line / full stanza fingerprint to spot repeated choruses/refrains
  const fingerprint = (lines: string[]) =>
    lines.map(l => l.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()).join(' | ');
  const counts = new Map<string, number>();
  for (const c of chunks) {
    const fp = fingerprint(c);
    if (fp) counts.set(fp, (counts.get(fp) || 0) + 1);
  }

  chunks.forEach((lines, idx) => {
    let extractedChords: string | undefined;
    let bodyLines = lines;
    const firstChordMatch = lines.length > 1 ? lines[0].match(CHORD_LINE_RE) : null;
    if (firstChordMatch) {
      extractedChords = firstChordMatch[1].trim();
      bodyLines = lines.slice(1);
    }
    const fp = fingerprint(lines);
    const repeatCount = fp ? (counts.get(fp) || 1) : 1;
    let kind: BlockKind = 'VERSE';
    if (repeatCount > 1) {
      kind = bodyLines.length <= 2 ? 'REFRAIN' : 'CHORUS';
    } else if (idx === 0 && bodyLines.length <= 2 && chunks.length >= 4) {
      kind = 'INTRO';
    } else if (idx === chunks.length - 1 && bodyLines.length <= 2 && chunks.length >= 4) {
      kind = 'OUTRO';
    } else if (bodyLines.length <= 2 && idx > 0 && idx < chunks.length - 1) {
      kind = 'PRE';
    } else if (idx === chunks.length - 2 && chunks.length >= 5) {
      kind = 'BRIDGE';
    }
    out.push({
      id: uid('lb'),
      kind,
      lines: bodyLines,
      ...(extractedChords ? { chords: extractedChords } : {}),
    });
  });

  return autoLabelBlocks(out);
}

/** Move a block within a song's lyric array. Locked blocks never move. */
export function moveBlock(blocks: LyricBlock[], from: number, to: number): LyricBlock[] {
  const next = [...blocks];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  if (next[from].locked) return next;
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

export function duplicateBlock(blocks: LyricBlock[], index: number): LyricBlock[] {
  const src = blocks[index];
  if (!src) return blocks;
  const copy: LyricBlock = { ...src, id: uid('lb'), locked: false, lines: [...src.lines] };
  const next = [...blocks];
  next.splice(index + 1, 0, copy);
  return next;
}

/** Number same-kind blocks in order — "Verse", "Verse" → "Verse 1", "Verse 2". */
export function autoLabelBlocks(blocks: LyricBlock[]): LyricBlock[] {
  const counts: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const b of blocks) totals[b.kind] = (totals[b.kind] || 0) + 1;
  return blocks.map(b => {
    counts[b.kind] = (counts[b.kind] || 0) + 1;
    const base = blockMeta(b.kind).label;
    return { ...b, label: totals[b.kind] > 1 ? `${base} ${counts[b.kind]}` : base };
  });
}

/** Rough syllable count — enough to show a meter hint beside a line. */
export function syllables(line: string): number {
  const w = line.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean);
  let n = 0;
  for (const word of w) {
    const groups = word.replace(/e$/, '').match(/[aeiouy]+/g);
    n += Math.max(1, groups ? groups.length : 1);
  }
  return n;
}

export const songDuration = (s: MelosSong): number =>
  s.durationSec || s.trackRef?.durationSec || 0;

export interface ArrangementStats {
  totalSec: number;
  known: number;
  unknown: number;
  /** 0–1 energy per song, in running order — the shape of the record. */
  curve: { songId: string; title: string; energy: number; hasFeel: boolean }[];
  avgEnergy: number;
}

/** Runtime + energy curve for a running order. This is what makes two sequences comparable. */
export function arrangementStats(arr: MelosArrangement, songs: MelosSong[]): ArrangementStats {
  const byId = new Map(songs.map(s => [s.id, s]));
  const curve: ArrangementStats['curve'] = [];
  let totalSec = 0, known = 0, unknown = 0, energySum = 0, energyN = 0;

  for (const id of arr.songIds) {
    const s = byId.get(id);
    if (!s) continue;
    const d = songDuration(s);
    if (d > 0) { totalSec += d; known++; } else unknown++;
    const hasFeel = typeof s.feel?.energy === 'number';
    const energy = hasFeel ? (s.feel!.energy as number) : 0.5;
    if (hasFeel) { energySum += energy; energyN++; }
    curve.push({ songId: s.id, title: s.title, energy, hasFeel });
  }
  return { totalSec, known, unknown, curve, avgEnergy: energyN ? energySum / energyN : 0 };
}

export function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtRuntime(sec: number): string {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}

export const fmtMoney = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);

export interface SessionCost {
  hours: number;
  roomCents: number;
  engineerCents: number;
  extrasCents: number;
  totalCents: number;
}

export function estimateSessionCost(s: StudioSession): SessionCost {
  const ms = Math.max(0, (s.endsAt || 0) - (s.startsAt || 0));
  const hours = ms / 3_600_000;
  const roomCents = Math.round(hours * (s.roomRateCents || 0));
  const engineerCents = Math.round(hours * (s.engineerRateCents || 0));
  const extrasCents = (s.extraCosts || []).reduce((n, c) => n + (c.cents || 0), 0);
  return { hours, roomCents, engineerCents, extrasCents, totalCents: roomCents + engineerCents + extrasCents };
}

export const productionSpendCents = (sessions: StudioSession[]): number =>
  sessions
    .filter(s => s.status !== 'CANCELLED')
    .reduce((n, s) => n + estimateSessionCost(s).totalCents, 0);

/**
 * Suggested confidence from observable signals. Advisory only — the artist's own
 * number always wins, so this is offered, never written on their behalf.
 */
export function suggestConfidence(s: MelosSong): number {
  let n = 0;
  n += (s.love / 5) * 40;
  n += (stateMeta(s.state).order / 5) * 30;
  if (s.commitment === 'VERIFIED') n += 30;
  else if (s.commitment === 'WORKING_ON_IT') n += 15;
  else if (s.commitment === 'SHELVED') n -= 25;
  else if (s.commitment === 'CUT') n -= 60;
  if (s.lyricsLockedAt) n += 5;
  if (s.trackRef?.url) n += 5;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Samples on this song that would block a release. */
export function blockingSamples(song: MelosSong, samples: SampleCandidate[]): SampleCandidate[] {
  const ids = new Set(song.sampleIds || []);
  return samples.filter(s => ids.has(s.id) && CLEARANCE_BLOCKING.includes(s.clearance.status));
}

export interface ReadinessReport {
  onRecord: MelosSong[];
  finished: number;
  lyricsLocked: number;
  withAudio: number;
  blocked: { song: MelosSong; samples: SampleCandidate[] }[];
  percent: number;
}

/** "Where is this record" — the honest read, without a shaming progress bar. */
export function readiness(songs: MelosSong[], samples: SampleCandidate[]): ReadinessReport {
  const onRecord = songs.filter(s => IS_ON_RECORD.includes(s.commitment));
  const finished = onRecord.filter(s => s.state === 'FINISHED').length;
  const lyricsLocked = onRecord.filter(s => !!s.lyricsLockedAt).length;
  const withAudio = onRecord.filter(s => !!s.trackRef?.url).length;
  const blocked = onRecord
    .map(song => ({ song, samples: blockingSamples(song, samples) }))
    .filter(b => b.samples.length > 0);
  const percent = onRecord.length ? Math.round((finished / onRecord.length) * 100) : 0;
  return { onRecord, finished, lyricsLocked, withAudio, blocked, percent };
}

/** Album-wide feel, aggregated from the songs that are actually on the record. */
export function albumFeel(songs: MelosSong[]): SongFeel & { analyzed: number; total: number } {
  const on = songs.filter(s => IS_ON_RECORD.includes(s.commitment));
  const withFeel = on.filter(s => s.feel && (s.feel.bpm || typeof s.feel.energy === 'number'));
  const avg = (pick: (f: SongFeel) => number | undefined): number | undefined => {
    const vals = withFeel.map(s => pick(s.feel!)).filter((v): v is number => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
  };
  // Modal key across the record, rather than a meaningless average.
  const keys: Record<string, number> = {};
  for (const s of withFeel) if (s.feel?.keySig) keys[s.feel.keySig] = (keys[s.feel.keySig] || 0) + 1;
  const keySig = Object.keys(keys).sort((a, b) => keys[b] - keys[a])[0];
  return {
    bpm: avg(f => f.bpm), energy: avg(f => f.energy),
    brightness: avg(f => f.brightness), density: avg(f => f.density),
    keySig, analyzed: withFeel.length, total: on.length,
  };
}

export function newSong(order = 0, patch: Partial<MelosSong> = {}): MelosSong {
  const now = Date.now();
  return {
    id: uid('song'), title: 'Untitled', state: 'SPARK', commitment: 'TENTATIVE',
    love: 3, confidence: 40, lyrics: [], takes: [], credits: [], sampleIds: [],
    images: [], tags: [], order, createdAt: now, updatedAt: now, ...patch,
  };
}

export function newClearance(status: ClearanceStatus = 'NOT_STARTED', patch: Partial<ClearanceRecord> = {}): ClearanceRecord {
  return {
    status,
    steps: DEFAULT_CLEARANCE_STEPS.map(s => ({ id: s.id, label: s.label, done: false })),
    updatedAt: Date.now(),
    ...patch,
  };
}

// ═══ Firestore I/O ═══════════════════════════════════════════════════════════

const COL = 'melosProductions';

const stripUndefined = <T extends object>(o: T): T =>
  JSON.parse(JSON.stringify(o, (_k, v) => (v === undefined ? undefined : v)));

const prodRef = (prodId: string) => doc(db, COL, prodId);
const sub = (prodId: string, name: string) => collection(db, COL, prodId, name);

export async function fetchProduction(prodId: string): Promise<MelosProduction | null> {
  try {
    const snap = await getDoc(prodRef(prodId));
    return snap.exists() ? (snap.data() as MelosProduction) : null;
  } catch { return null; }
}

export async function createProduction(uidStr: string, patch: Partial<MelosProduction> = {}): Promise<MelosProduction> {
  const now = Date.now();
  const prod: MelosProduction = {
    id: patch.id || uid('prod'),
    ownerUid: uidStr,
    title: patch.title || 'Untitled Production',
    status: 'SEED',
    padSkin: DEFAULT_SKIN,
    memberUids: [uidStr],
    visibility: 'PRIVATE',
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
  try { await setDoc(prodRef(prod.id), stripUndefined(prod)); } catch { /* offline: return in-memory */ }
  return prod;
}

export async function updateProduction(prodId: string, patch: Partial<MelosProduction>) {
  try { await updateDoc(prodRef(prodId), stripUndefined({ ...patch, updatedAt: Date.now() })); } catch {}
}

export async function deleteProduction(prodId: string) {
  try { await deleteDoc(prodRef(prodId)); } catch {}
}

/** Every production the user owns or collaborates on. */
export async function fetchMyProductions(uidStr: string): Promise<MelosProduction[]> {
  try {
    const q = query(collection(db, COL), where('memberUids', 'array-contains', uidStr));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as MelosProduction).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e: any) {
    // Swallowing this silently made a permission-denied read look identical to "you have no
    // productions yet" — which is exactly how undeployed rules stayed invisible. Say it out loud.
    console.warn('[melos] fetchMyProductions failed:', e?.code || '', e?.message?.slice(0, 200) || e);
    return [];
  }
}

export function subProductions(uidStr: string, cb: (rows: MelosProduction[]) => void): () => void {
  try {
    const q = query(collection(db, COL), where('memberUids', 'array-contains', uidStr));
    return onSnapshot(q,
      s => cb(s.docs.map(d => d.data() as MelosProduction).sort((a, b) => b.updatedAt - a.updatedAt)),
      e => console.warn('[melos] productions sub failed:', (e as Error)?.message?.slice(0, 160)));
  } catch { return () => {}; }
}

// Generic subcollection helpers — same shape as filmProductionService.
function subscribe<T>(prodId: string, name: string, cb: (rows: T[]) => void): () => void {
  try {
    return onSnapshot(sub(prodId, name),
      s => cb(s.docs.map(d => d.data() as T)),
      e => console.warn(`[melos] ${name} sub failed:`, (e as Error)?.message?.slice(0, 160)));
  } catch { return () => {}; }
}
async function put<T extends { id: string }>(prodId: string, name: string, row: T) {
  try { await setDoc(doc(db, COL, prodId, name, row.id), stripUndefined(row)); } catch {}
}
async function patchRow(prodId: string, name: string, id: string, p: object) {
  try { await updateDoc(doc(db, COL, prodId, name, id), stripUndefined({ ...p, updatedAt: Date.now() })); } catch {}
}
async function remove(prodId: string, name: string, id: string) {
  try { await deleteDoc(doc(db, COL, prodId, name, id)); } catch {}
}
async function fetchAll<T>(prodId: string, name: string): Promise<T[]> {
  try {
    const snap = await getDocs(sub(prodId, name));
    return snap.docs.map(d => d.data() as T);
  } catch { return []; }
}

// Songs
export const subSongs = (p: string, cb: (r: MelosSong[]) => void) =>
  subscribe<MelosSong>(p, 'songs', rows => cb(rows.sort((a, b) => a.order - b.order)));
export const fetchSongs = (p: string) => fetchAll<MelosSong>(p, 'songs');
export const putSong = (p: string, s: MelosSong) => put(p, 'songs', s);
export const patchSong = (p: string, id: string, x: Partial<MelosSong>) => patchRow(p, 'songs', id, x);
export const removeSong = (p: string, id: string) => remove(p, 'songs', id);

// Arrangements
export const subArrangements = (p: string, cb: (r: MelosArrangement[]) => void) =>
  subscribe<MelosArrangement>(p, 'arrangements', cb);
export const putArrangement = (p: string, a: MelosArrangement) => put(p, 'arrangements', a);
export const patchArrangement = (p: string, id: string, x: Partial<MelosArrangement>) => patchRow(p, 'arrangements', id, x);
export const removeArrangement = (p: string, id: string) => remove(p, 'arrangements', id);

/** Exactly one arrangement is primary — the running order that becomes the album. */
export async function setPrimaryArrangement(prodId: string, arrangements: MelosArrangement[], id: string) {
  await Promise.all(arrangements.map(a => patchArrangement(prodId, a.id, { isPrimary: a.id === id })));
}

// Pins
export const subPins = (p: string, cb: (r: InspirationPin[]) => void) => subscribe<InspirationPin>(p, 'pins', cb);
export const putPin = (p: string, x: InspirationPin) => put(p, 'pins', x);
export const patchPin = (p: string, id: string, x: Partial<InspirationPin>) => patchRow(p, 'pins', id, x);
export const removePin = (p: string, id: string) => remove(p, 'pins', id);

// Samples
export const subSamples = (p: string, cb: (r: SampleCandidate[]) => void) => subscribe<SampleCandidate>(p, 'samples', cb);
export const fetchSamples = (p: string) => fetchAll<SampleCandidate>(p, 'samples');
export const putSample = (p: string, x: SampleCandidate) => put(p, 'samples', x);
export const patchSample = (p: string, id: string, x: Partial<SampleCandidate>) => patchRow(p, 'samples', id, x);
export const removeSample = (p: string, id: string) => remove(p, 'samples', id);

export async function setClearanceStep(prodId: string, sample: SampleCandidate, stepId: string, done: boolean) {
  const steps = sample.clearance.steps.map(s =>
    s.id === stepId ? { ...s, done, doneAt: done ? Date.now() : undefined } : s);
  await patchSample(prodId, sample.id, {
    clearance: { ...sample.clearance, steps, updatedAt: Date.now() },
  });
}

// Sessions
export const subSessions = (p: string, cb: (r: StudioSession[]) => void) =>
  subscribe<StudioSession>(p, 'sessions', rows => cb(rows.sort((a, b) => a.startsAt - b.startsAt)));
export const putSession = (p: string, x: StudioSession) => put(p, 'sessions', x);
export const patchSession = (p: string, id: string, x: Partial<StudioSession>) => patchRow(p, 'sessions', id, x);
export const removeSession = (p: string, id: string) => remove(p, 'sessions', id);

// People
export const subPeople = (p: string, cb: (r: Collaborator[]) => void) => subscribe<Collaborator>(p, 'people', cb);
export const putPerson = (p: string, x: Collaborator) => put(p, 'people', x);
export const patchPerson = (p: string, id: string, x: Partial<Collaborator>) => patchRow(p, 'people', id, x);
export const removePerson = (p: string, id: string) => remove(p, 'people', id);

// Capture notes
export const subNotes = (p: string, cb: (r: CaptureNote[]) => void) =>
  subscribe<CaptureNote>(p, 'notes', rows => cb(rows.sort((a, b) => b.createdAt - a.createdAt)));
export const putNote = (p: string, x: CaptureNote) => put(p, 'notes', x);
export const patchNote = (p: string, id: string, x: Partial<CaptureNote>) => patchRow(p, 'notes', id, x);
export const removeNote = (p: string, id: string) => remove(p, 'notes', id);

// Video ideas
export const subVideoIdeas = (p: string, cb: (r: MusicVideoIdea[]) => void) => subscribe<MusicVideoIdea>(p, 'videoIdeas', cb);
export const putVideoIdea = (p: string, x: MusicVideoIdea) => put(p, 'videoIdeas', x);
export const patchVideoIdea = (p: string, id: string, x: Partial<MusicVideoIdea>) => patchRow(p, 'videoIdeas', id, x);
export const removeVideoIdea = (p: string, id: string) => remove(p, 'videoIdeas', id);

// Scores
export const subScores = (p: string, cb: (r: MelosScore[]) => void) => subscribe<MelosScore>(p, 'scores', cb);
export const putScore = (p: string, x: MelosScore) => put(p, 'scores', x);
export const removeScore = (p: string, id: string) => remove(p, 'scores', id);

// ═══ Lyrics lock — the album integration trigger ═════════════════════════════

/**
 * Lock a song's lyrics. Once locked the flattened text is the canonical lyric and
 * is pushed onto the matching album Track by the caller (see the Publish flow) —
 * this only records the lock and the derived text.
 */
export async function lockLyrics(prodId: string, song: MelosSong): Promise<string> {
  const text = flattenLyrics(song.lyrics);
  await patchSong(prodId, song.id, { lyricsLockedAt: Date.now() });
  return text;
}

export async function unlockLyrics(prodId: string, songId: string) {
  await patchSong(prodId, songId, { lyricsLockedAt: undefined });
}

// ═══ Demo seed ═══════════════════════════════════════════════════════════════
// A production is gorgeous the moment it opens rather than an empty form. Mirrors
// the film suite's seed. "Mercy, Michigan" is the record in the design mockups.

export interface SeededProduction {
  production: MelosProduction;
  songs: MelosSong[];
  arrangements: MelosArrangement[];
  pins: InspirationPin[];
  samples: SampleCandidate[];
  sessions: StudioSession[];
  people: Collaborator[];
}

const lb = (kind: BlockKind, label: string, lines: string[], locked = false): LyricBlock =>
  ({ id: uid('lb'), kind, label, lines, locked });

export function buildDemoProduction(ownerUid: string, artistName = 'You'): SeededProduction {
  const now = Date.now();
  const DAY = 86_400_000;
  const prodId = uid('prod');

  const production: MelosProduction = {
    id: prodId, ownerUid, title: 'Mercy, Michigan', workingTitle: 'the winter one',
    intent:
      'A record about staying somewhere after the reason to stay has gone. ' +
      'Nine songs, no filler, everything tracked in one room. If a song does not ' +
      'sound like a cold house at 6am, it is not on this album.',
    artistName, status: 'TRACKING', padSkin: DEFAULT_SKIN,
    targetTrackCount: 9, targetReleaseDate: now + 120 * DAY,
    budgetCents: 640_000, memberUids: [ownerUid], visibility: 'PRIVATE',
    createdAt: now - 240 * DAY, updatedAt: now,
  };

  const mk = (
    order: number, title: string, state: SongState, commitment: Commitment,
    love: number, patch: Partial<MelosSong> = {},
  ): MelosSong => newSong(order, {
    title, state, commitment, love,
    confidence: 0, createdAt: now - (200 - order * 12) * DAY, updatedAt: now - order * DAY,
    ...patch,
  });

  const songs: MelosSong[] = [
    mk(0, 'Grand River', 'FINISHED', 'VERIFIED', 5, {
      durationSec: 254, tempo: 74, keySig: 'A minor', timeSig: '4/4',
      notes: 'The first one that told me what the record was. Cut it live in two takes, kept the second.',
      lyricsLockedAt: now - 40 * DAY,
      feel: { bpm: 74, keySig: 'A minor', mode: 'minor', energy: 0.33, brightness: 0.28, density: 0.4, form: 'AABA', analyzedAt: now - 30 * DAY },
      lyrics: [
        lb('VERSE', 'Verse 1', ['I drove the river road to keep from going home', 'and the water went the only way it knows']),
        lb('CHORUS', 'Chorus', ['Grand river, take the long way', 'I am in no hurry to arrive'], true),
      ],
    }),
    mk(1, 'Low Ceilings', 'TRACKING', 'WORKING_ON_IT', 4, {
      workingTitle: 'the basement one', durationSec: 231, tempo: 82, keySig: 'D minor', timeSig: '4/4',
      notes: "Wrote this in my mom's basement in February with the furnace going. Took eleven months to admit the bridge didn't need words. Marisol played the keys in one take and cried after.",
      feel: { bpm: 82, keySig: 'D minor', mode: 'minor', energy: 0.41, brightness: 0.35, density: 0.52, form: "ABAB'C", analyzedAt: now - 12 * DAY },
      lyrics: [
        lb('VERSE', 'Verse 1', ['We kept the good chairs in the room nobody sat in', 'and the radio on for the sound of somebody else']),
        lb('CHORUS', 'Chorus', ['Low ceilings, long winter, short money, deep sleep', 'I could stay here forever, I could leave here by June'], true),
        lb('VERSE', 'Verse 2', ['My father learned the furnace like a second language', 'and I learned the furnace like a hymn']),
        lb('BRIDGE', 'Bridge', ['(unwritten — just the melody so far)']),
      ],
    }),
    mk(2, 'Second Shift', 'DEMO', 'WORKING_ON_IT', 3, {
      durationSec: 198, tempo: 96, keySig: 'G minor',
      notes: 'Might be two songs wearing one coat. The chorus is better than the verses and I know it.',
      feel: { bpm: 96, keySig: 'G minor', mode: 'minor', energy: 0.58, brightness: 0.44, density: 0.61, form: 'ABAB', analyzedAt: now - 9 * DAY },
      lyrics: [lb('VERSE', 'Verse 1', ['Clock in at eleven, clock out at the dawn'])],
    }),
    mk(3, 'Mercy, Michigan', 'FINISHED', 'VERIFIED', 5, {
      durationSec: 288, tempo: 68, keySig: 'C major',
      notes: 'Title track. Named after a town that does not exist, for a feeling that does.',
      lyricsLockedAt: now - 22 * DAY,
      feel: { bpm: 68, keySig: 'C major', mode: 'major', energy: 0.29, brightness: 0.58, density: 0.33, form: 'AABAC', analyzedAt: now - 20 * DAY },
      lyrics: [lb('CHORUS', 'Chorus', ['Mercy, Michigan, I am still here', 'and the snow does not care that I stayed'], true)],
    }),
    mk(4, 'Untitled (hum)', 'SPARK', 'TENTATIVE', 2, {
      notes: 'Voice memo from a parking lot. Might be nothing. Might be the best thing here.',
      lyrics: [lb('NOTE', 'Note', ['just the melody — no words yet'])],
    }),
    mk(5, 'Paper Sun', 'WRITING', 'TENTATIVE', 1, {
      tempo: 118,
      notes: 'Too bright for this record. Probably belongs to whatever comes next.',
      lyrics: [lb('VERSE', 'Verse 1', ['You were the summer I did not take off work for'])],
    }),
    mk(6, 'Rust Belt Lullaby', 'MIXING', 'VERIFIED', 4, {
      durationSec: 212, tempo: 60, keySig: 'F major',
      notes: 'The closer, unless Grand River is the closer. Argument ongoing.',
      feel: { bpm: 60, keySig: 'F major', mode: 'major', energy: 0.22, brightness: 0.51, density: 0.26, form: 'AAB', analyzedAt: now - 6 * DAY },
      lyrics: [lb('VERSE', 'Verse 1', ['Sleep now, the plant is closed and the whistle is sold'])],
    }),
    mk(7, 'Ninety-Four', 'DEMO', 'SHELVED', 2, {
      durationSec: 176, tempo: 104,
      notes: 'Good song, wrong record. Keeping it warm.',
    }),
    mk(8, 'Half a Winter', 'WRITING', 'WORKING_ON_IT', 4, {
      tempo: 88, keySig: 'E minor',
      notes: 'Two verses and a hole where the chorus goes.',
      lyrics: [
        lb('VERSE', 'Verse 1', ['Half a winter is enough to learn a house']),
        lb('CHORUS', 'Chorus', ['(hole)']),
      ],
    }),
  ];
  // Seed the artist's own confidence from the suggestion, so nothing reads as 0.
  for (const s of songs) s.confidence = suggestConfidence(s);

  const onRecord = songs.filter(s => IS_ON_RECORD.includes(s.commitment));
  const arrangements: MelosArrangement[] = [
    {
      id: uid('arr'), name: 'Sequence A — the long walk',
      songIds: ['Grand River', 'Low Ceilings', 'Second Shift', 'Half a Winter', 'Mercy, Michigan', 'Rust Belt Lullaby']
        .map(t => songs.find(s => s.title === t)?.id).filter((x): x is string => !!x),
      notes: 'Opens quiet, stays quiet, earns the title track late.',
      isPrimary: true, createdAt: now - 30 * DAY, updatedAt: now - 3 * DAY,
    },
    {
      id: uid('arr'), name: 'Sequence B — title track first',
      songIds: ['Mercy, Michigan', 'Low Ceilings', 'Grand River', 'Second Shift', 'Half a Winter', 'Rust Belt Lullaby']
        .map(t => songs.find(s => s.title === t)?.id).filter((x): x is string => !!x),
      notes: 'Front-loads the thesis. Might give the whole record away in track one.',
      createdAt: now - 12 * DAY, updatedAt: now - 12 * DAY,
    },
  ];

  const samples: SampleCandidate[] = [
    {
      id: uid('smp'), title: 'Harbor Bells', sourceWork: 'Harbor Bells (1931)',
      origin: 'PUBLIC_DOMAIN', pdItemId: 'harbor-bells-1931',
      startSec: 12, endSec: 19,
      note: 'The bell at the top of Mercy, Michigan. Found in the PD library.',
      usedInSongIds: [songs[3].id],
      clearance: newClearance('NOT_NEEDED', {
        rightsSummary: 'Published 1931 — public domain in the United States.',
      }),
      createdAt: now - 60 * DAY, updatedAt: now - 60 * DAY,
    },
    {
      id: uid('smp'), title: 'Furnace room tone', origin: 'FIELD_RECORDING',
      note: 'Recorded on my phone in the basement. Runs under the whole of Low Ceilings.',
      usedInSongIds: [songs[1].id],
      clearance: newClearance('NOT_NEEDED', { rightsSummary: 'Own field recording.' }),
      createdAt: now - 150 * DAY, updatedAt: now - 150 * DAY,
    },
    {
      id: uid('smp'), title: 'Unidentified choir loop', sourceArtist: 'unknown',
      origin: 'EXTERNAL', startSec: 4, endSec: 8,
      note: 'Off an old compilation. No idea who owns this — need to find out before it goes anywhere.',
      usedInSongIds: [songs[2].id],
      clearance: newClearance('IDENTIFYING', {
        contactNotes: 'Compilation liner notes list no publisher. Try the label first.',
      }),
      createdAt: now - 45 * DAY, updatedAt: now - 5 * DAY,
    },
  ];

  const people: Collaborator[] = [
    { id: uid('per'), name: 'Marisol Ruiz', role: 'MUSICIAN', instrument: 'Keys', status: 'ACTIVE', splitPercent: 10, songIds: [songs[1].id, songs[3].id], createdAt: now - 180 * DAY },
    { id: uid('per'), name: 'Dell Okonkwo', role: 'ENGINEER', status: 'ACTIVE', songIds: songs.map(s => s.id), createdAt: now - 170 * DAY },
    { id: uid('per'), name: 'June Hartley', role: 'MIXER', status: 'INVITED', songIds: [songs[6].id], createdAt: now - 10 * DAY },
  ];

  const sessions: StudioSession[] = [
    {
      id: uid('ses'), title: 'Vocals — Low Ceilings + Half a Winter', kind: 'VOCALS',
      startsAt: now + 3 * DAY, endsAt: now + 3 * DAY + 5 * 3_600_000,
      studioName: 'Rust Belt Sound', address: 'Detroit, MI',
      roomRateCents: 8_500, engineerName: 'Dell Okonkwo', engineerRateCents: 6_000,
      attendeeIds: [people[1].id], songIds: [songs[1].id, songs[8].id],
      goals: ['Lead vocal on both', 'Stack the Low Ceilings chorus', 'Try the bridge wordless'],
      status: 'CONFIRMED', extraCosts: [{ id: uid('c'), label: 'Tape + backups', cents: 4_000 }],
      createdAt: now - 8 * DAY, updatedAt: now - 2 * DAY,
    },
    {
      id: uid('ses'), title: 'Mix pass 1', kind: 'MIX',
      startsAt: now + 21 * DAY, endsAt: now + 21 * DAY + 8 * 3_600_000,
      studioName: 'Rust Belt Sound', roomRateCents: 8_500,
      engineerName: 'June Hartley', engineerRateCents: 9_500,
      attendeeIds: [people[2].id], songIds: [songs[0].id, songs[3].id, songs[6].id],
      goals: ['Rough mixes on the three finished songs'],
      status: 'PLANNED', extraCosts: [],
      createdAt: now - 4 * DAY, updatedAt: now - 4 * DAY,
    },
    {
      id: uid('ses'), title: 'Tracking week — full band', kind: 'TRACKING',
      startsAt: now - 34 * DAY, endsAt: now - 30 * DAY,
      studioName: 'Rust Belt Sound', roomRateCents: 8_500,
      engineerName: 'Dell Okonkwo', engineerRateCents: 6_000,
      attendeeIds: [people[0].id, people[1].id], songIds: onRecord.map(s => s.id),
      goals: ['Beds for everything on the record'],
      status: 'DONE', extraCosts: [{ id: uid('c'), label: 'Backline hire', cents: 32_000 }],
      createdAt: now - 60 * DAY, updatedAt: now - 30 * DAY,
    },
  ];

  const pins: InspirationPin[] = [
    { id: uid('pin'), kind: 'STICKY', color: '#E9A85C', title: 'Album Thesis', text: 'A cold house is not the same as an empty one.', x: 40, y: 36, w: 236, rotation: -1.6, createdAt: now - 90 * DAY },
    { id: uid('pin'), kind: 'COLOR', color: '#4A3D5C', title: 'the blue of 6am', x: 310, y: 32, w: 128, h: 120, rotation: 1.2, createdAt: now - 88 * DAY },
    { id: uid('pin'), kind: 'COLOR', color: '#7A4A2E', title: 'rust', x: 460, y: 48, w: 128, h: 120, rotation: -0.8, createdAt: now - 88 * DAY },
    { id: uid('pin'), kind: 'STICKY', color: '#D0BCFF', title: 'Rule #1', text: 'No song longer than five minutes. No song that explains itself.', x: 52, y: 204, w: 256, rotation: 0.9, songId: undefined, createdAt: now - 70 * DAY },
    { id: uid('pin'), kind: 'LINK', title: 'Bill Withers — Live at Carnegie Hall', url: 'https://example.org/reference', note: 'The room sound. That is all I want.', x: 340, y: 204, w: 256, rotation: -0.5, createdAt: now - 64 * DAY },
    { id: uid('pin'), kind: 'TRACK', title: 'Low Ceilings — Basement Tape (Rough)', trackTag: 'UNFINISHED', durationSec: 142, note: 'Unfinished bridge idea — needs Wurlitzer overdub before moving to Tracklist.', x: 628, y: 40, w: 268, rotation: 0.7, songId: songs[1].id, createdAt: now - 50 * DAY },
    { id: uid('pin'), kind: 'SAMPLE', title: 'Harbor Bells (1931 PD Chop)', sampleId: samples[0].id, durationSec: 7, note: 'Public domain bell intro loop (12s–19s) — cleared for Mercy, Michigan.', x: 632, y: 230, w: 264, rotation: -0.9, songId: songs[3].id, createdAt: now - 44 * DAY },
    { id: uid('pin'), kind: 'TEXT', text: 'Marisol: "play it like you are trying not to wake someone"', x: 110, y: 360, w: 256, rotation: -2.1, songId: songs[1].id, createdAt: now - 40 * DAY },
  ];

  return { production, songs, arrangements, pins, samples, sessions, people };
}

/** Write a seeded production to Firestore. Best-effort — offline still returns the data. */
export async function seedDemoProduction(ownerUid: string, artistName?: string): Promise<SeededProduction> {
  const seed = buildDemoProduction(ownerUid, artistName);
  const { production: p } = seed;
  try {
    await setDoc(prodRef(p.id), stripUndefined(p));
    await Promise.all([
      ...seed.songs.map(s => put(p.id, 'songs', s)),
      ...seed.arrangements.map(a => put(p.id, 'arrangements', a)),
      ...seed.pins.map(x => put(p.id, 'pins', x)),
      ...seed.samples.map(x => put(p.id, 'samples', x)),
      ...seed.sessions.map(x => put(p.id, 'sessions', x)),
      ...seed.people.map(x => put(p.id, 'people', x)),
    ]);
  } catch { /* offline — caller still gets the in-memory seed */ }
  return seed;
}

// ═════════════════════════════════════════════════════════════════════════════
// ═══ CHORA MUSIC STAND, NASHVILLE NUMBER SYSTEM & ORG MUSIC DEPARTMENT ENGINE
// ═════════════════════════════════════════════════════════════════════════════

export const CHORD_ROOTS_SHARP = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

const ENHARMONIC_INDEX: Record<string, number> = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

const NASHVILLE_DEGREE_MAP: Record<number, string> = {
  0: '1',
  1: 'b2',
  2: '2',
  3: 'b3',
  4: '3',
  5: '4',
  6: '#4',
  7: '5',
  8: 'b6',
  9: '6',
  10: 'b7',
  11: '7',
};

/**
 * Transposes a single chord token (e.g. `F#m7/E`, `Gmaj7`, `Bb`) by `semitones`
 * or converts it into the Nashville Number System (`1 - 4 - 5 - 6m`) relative to `baseKeyRoot`.
 */
export function transposeChordToken(
  token: string,
  semitones: number,
  baseKeyRoot = 'G',
  toNashville = false,
): string {
  const parts = token.split('/');
  const convertOne = (part: string, isBass = false): string => {
    const m = /^([A-G][#b]?)(.*)$/.exec(part.trim());
    if (!m) return part;
    const [, rootStr, suffix] = m;
    const baseIdx = ENHARMONIC_INDEX[rootStr];
    if (baseIdx === undefined) return part;

    const shiftedIdx = (((baseIdx + semitones) % 12) + 12) % 12;
    if (!toNashville) {
      return `${CHORD_ROOTS_SHARP[shiftedIdx]}${suffix}`;
    }

    const cleanKeyRoot = baseKeyRoot.split(' ')[0] || 'G';
    const keyIdx = (((ENHARMONIC_INDEX[cleanKeyRoot] ?? 7) + semitones) % 12 + 12) % 12;
    const relSemitones = (((shiftedIdx - keyIdx) % 12) + 12) % 12;
    const deg = NASHVILLE_DEGREE_MAP[relSemitones] || '1';
    if (isBass) return deg;
    return `${deg}${suffix}`;
  };

  if (parts.length === 2) {
    return `${convertOne(parts[0], false)}/${convertOne(parts[1], true)}`;
  }
  return convertOne(token, false);
}

/**
 * Transposes inline `[Chord]` tokens inside ChordPro lyric lines.
 */
export function transposeChordProLines(
  lines: string[],
  semitones: number,
  baseKeyRoot = 'G',
  toNashville = false,
): string[] {
  return lines.map(line =>
    line.replace(/\[([A-G][#b]?[^\]]*)\]/g, (_full, chordToken: string) => {
      return `[${transposeChordToken(chordToken, semitones, baseKeyRoot, toNashville)}]`;
    }),
  );
}

/**
 * Transposes a section chord progression string (e.g. `"G - C - Em7 - D"` or `"D | Bm7 | Gmaj7 | Asus4"`).
 */
export function transposeSectionChords(
  chordsStr: string | undefined,
  semitones: number,
  baseKeyRoot = 'G',
  toNashville = false,
): string {
  if (!chordsStr) return '';
  return chordsStr.replace(/\b([A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?)\b/g, (token) =>
    transposeChordToken(token, semitones, baseKeyRoot, toNashville),
  );
}

/**
 * Convert a public-domain hymn or gospel song from `sacredHymnsAndPrayers.ts` into a native Chora `MelosSong`.
 */
export function hymnToMelosSong(item: SacredHymnOrPrayer, order = 0, orgId?: string): MelosSong {
  const isGospel = item.kind === 'PUBLIC_DOMAIN_GOSPEL';
  const blocks: LyricBlock[] = [];
  const prog = item.score?.chordProgression || ['G', 'C', 'D', 'G'];

  item.stanzas.forEach((stanza, idx) => {
    blocks.push({
      id: `${item.id}_v_${idx + 1}`,
      kind: 'VERSE',
      label: `Verse ${idx + 1}`,
      chords: prog.join(' - '),
      lines: stanza.split('\n'),
    });
    if (idx === 0 && item.refrain) {
      blocks.push({
        id: `${item.id}_refrain`,
        kind: 'REFRAIN',
        label: 'Refrain / Chorus',
        chords: prog.slice().reverse().join(' - '),
        lines: item.refrain.split('\n'),
      });
    }
  });

  if (item.score?.chordProgression?.length) {
    blocks.push({
      id: `${item.id}_chords_note`,
      kind: 'NOTE',
      label: 'Arrangement & Cadence Notes',
      lines: [
        `Tune: ${item.score.tuneName} (${item.score.meter}) · ${item.score.tempoMarking}`,
        `Cadence Chords: ${item.score.chordProgression.join('  |  ')}`,
      ],
    });
  }

  const bpmMatch = /(\d{2,3})/.exec(item.score?.tempoMarking || '84');
  const bpm = bpmMatch ? parseInt(bpmMatch[1], 10) : 84;
  const defaultKey = item.score?.defaultKey || 'D Major';

  return newSong(order, {
    id: item.id,
    title: item.title,
    workingTitle: `${item.author} (${item.year})`,
    state: 'FINISHED',
    commitment: 'VERIFIED',
    love: 5,
    confidence: 95,
    lyrics: blocks,
    notes: item.historyEssay,
    tempo: bpm,
    keySig: defaultKey.split(' ')[0] || 'D',
    timeSig: item.score?.timeSignature || '4/4',
    durationSec: 210,
    feel: {
      bpm,
      keySig: defaultKey,
      mode: defaultKey.toLowerCase().includes('minor') ? 'minor' : 'major',
      energy: isGospel ? 0.68 : 0.48,
      chordSummary: prog.join(' - '),
    },
    credits: [
      {
        id: `cred_${item.id}`,
        name: `${item.author} (${item.year})`,
        role: 'WRITER',
      },
    ],
    orgId,
    assignedSubDepts: isGospel
      ? ['music-choir', 'music-worship-teams', 'music-band', 'music-collective']
      : ['music-worship-teams', 'music-choir', 'music-band', 'music-collective'],
    availableKeys: item.score?.availableKeys || ['C Major', 'D Major', 'F Major', 'G Major'],
    chordProgression: prog,
    sacredCategory: isGospel ? 'GOSPEL' : 'HYMN',
    sacredSourceId: item.id,
    historyNote: item.historyEssay,
    tags: ['sacred', isGospel ? 'gospel' : 'hymn', 'public-domain'],
  });
}

export const ORG_CHORA_PROD_ID = (orgId: string) => `melos_church_${orgId}`;
const ORG_CHORA_STORAGE_KEY = (orgId: string) => `plajah_chora_org_bundle_v1_${orgId}`;

/**
 * Build the default Chora production, song catalog (Public-Domain Hymns, Gospel Anthems,
 * and Collective Originals with inline ChordPro), and Worship / Ensemble Setlist Arrangements
 * for an Organization's Music Department.
 */
export function buildOrgChoraSeed(
  orgId: string,
  orgName = 'Sanctuary Music Department',
  ownerUid = 'elevate-music',
  includeDemoOriginals = true,
): SeededProduction {
  const now = Date.now();
  const prodId = ORG_CHORA_PROD_ID(orgId);

  const production: MelosProduction = {
    id: prodId,
    ownerUid,
    orgId,
    orgName,
    title: `${orgName} · Music Department`,
    workingTitle: 'Worship Teams · Band · Choir · Collective',
    intent:
      'Unified Chora songwriting pad, public-domain hymnal & gospel catalog, Nashville Number System music stand, and live service/concert setlist arrangements.',
    artistName: orgName,
    status: 'TRACKING',
    padSkin: DEFAULT_SKIN,
    memberUids: [ownerUid],
    visibility: 'COLLABORATORS',
    createdAt: now,
    updatedAt: now,
  };

  const hymns = PUBLIC_DOMAIN_HYMNS.map((h, i) => hymnToMelosSong(h, i, orgId));
  const gospel = PUBLIC_DOMAIN_GOSPEL_SONGS.map((g, i) => hymnToMelosSong(g, hymns.length + i, orgId));

  const originals: MelosSong[] = includeDemoOriginals
    ? [
        newSong(hymns.length + gospel.length, {
          id: 'collective-orig-sanctuary-fire',
          title: 'Altar of Living Stones (Collective Original)',
          workingTitle: 'Collective Music Department · Original Worship Anthem',
          state: 'TRACKING',
          commitment: 'VERIFIED',
          love: 5,
          confidence: 94,
          tempo: 74,
          keySig: 'Eb',
          timeSig: '4/4',
          durationSec: 300,
          orgId,
          sacredCategory: 'ORIGINAL_COLLECTIVE',
          assignedSubDepts: ['music-collective', 'music-worship-teams', 'music-band', 'music-choir'],
          availableKeys: ['C Major', 'D Major', 'Eb Major', 'F Major', 'G Major'],
          chordProgression: ['Eb', 'Cm7', 'Abmaj7', 'Bb', 'Eb'],
          historyNote:
            'Written in Chora Writing Pad by the Collective Music Department. Features four-part choir swell on the bridge and Hammond B3 pad under the altar call.',
          feel: {
            bpm: 74,
            keySig: 'Eb major',
            mode: 'major',
            energy: 0.72,
            chordSummary: 'Eb - Cm7 - Abmaj7 - Bb',
          },
          lyrics: [
            {
              id: 'orig_1_intro',
              kind: 'INTRO',
              label: 'Intro (Band & Warm Pad)',
              chords: 'Eb - Cm7 - Abmaj7 - Bb',
              lines: [
                '[Eb]Warm organ and [Cm7]cello swell in Eb — [Abmaj7]Band enters on bar 5 [Bb]with brushed snare',
              ],
            },
            {
              id: 'orig_1_v1',
              kind: 'VERSE',
              label: 'Verse 1 (Worship Leader)',
              chords: 'Eb - Cm7 - Abmaj7 - Bb',
              lines: [
                '[Eb]We bring the wood, we [Cm7]bring the stone,',
                '[Abmaj7]Every broken heart before Your [Bb]throne,',
                '[Eb]Breathe on the embers [Cm7]in this place,',
                '[Abmaj7]Crown our gathering with [Bb]sovereign [Eb]grace.',
              ],
            },
            {
              id: 'orig_1_chorus',
              kind: 'CHORUS',
              label: 'Chorus (Full Worship Team + SATB Choir)',
              chords: 'Abmaj7 - Bb - Cm7 - Eb/G',
              locked: true,
              lines: [
                '[Abmaj7]Build Your sanctuary [Bb]in our praise,',
                '[Cm7]Ancient of Days, [Eb/G]Ancient of Days,',
                '[Abmaj7]Living stones crying [Bb]out as one,',
                '[Cm7]Kingdom of heaven, [Bb]let Your will be [Eb]done!',
              ],
            },
            {
              id: 'orig_1_bridge',
              kind: 'BRIDGE',
              label: 'Bridge (Choir Modulation Cue)',
              chords: 'Fm7 - Eb/G - Abmaj7 - Bb',
              lines: [
                '[Fm7]Holy, [Eb/G]holy is the [Abmaj7]Lord God Al[Bb]mighty,',
                '[Fm7]The whole earth is [Eb/G]filled with Your [Abmaj7]glo[Bb]ry!',
              ],
            },
          ],
          tags: ['church', 'original', 'collective'],
        }),
        newSong(hymns.length + gospel.length + 1, {
          id: 'collective-orig-psalm-150',
          title: 'Everything That Has Breath (Psalm 150 Groove)',
          workingTitle: 'Sanctuary Band & Gospel Choir Up-Tempo Opener',
          state: 'DEMO',
          commitment: 'VERIFIED',
          love: 5,
          confidence: 92,
          tempo: 112,
          keySig: 'Ab',
          timeSig: '4/4',
          durationSec: 245,
          orgId,
          sacredCategory: 'ORIGINAL_COLLECTIVE',
          assignedSubDepts: ['music-band', 'music-choir', 'music-worship-teams', 'music-collective'],
          availableKeys: ['F Major', 'G Major', 'Ab Major', 'A Major', 'Bb Major'],
          chordProgression: ['Ab7', 'Db9', 'Ab7', 'Eb9#5', 'Db9', 'Ab7'],
          historyNote:
            'Up-tempo Gospel shout opener arranged by the Collective and Sanctuary Band.',
          feel: {
            bpm: 112,
            keySig: 'Ab major',
            mode: 'major',
            energy: 0.88,
            chordSummary: 'Ab7 - Db9 - Eb9#5 - Ab7',
          },
          lyrics: [
            {
              id: 'orig_2_v1',
              kind: 'VERSE',
              label: 'Verse 1',
              chords: 'Ab7 - Db9 - Ab7 - Eb9',
              lines: [
                '[Ab7]Praise Him with the trumpet sound, [Db9]praise Him with the lute and harp,',
                '[Ab7]Praise Him with the timbrel and dance, [Eb9]every voice lift up the song!',
              ],
            },
            {
              id: 'orig_2_chorus',
              kind: 'CHORUS',
              label: 'Chorus (Call & Response)',
              chords: 'Db9 - Ab7 - Eb9 - Ab7',
              lines: [
                '[Db9]Let everything that [Ab7]has breath praise the Lord!',
                '[Eb9]From the rising of the sun unto the [Ab7]going down of the same!',
              ],
            },
          ],
          tags: ['church', 'gospel', 'band'],
        }),
      ]
    : [];

  const songs = [...originals, ...hymns, ...gospel];

  const findId = (idOrPrefix: string) =>
    songs.find(s => s.id === idOrPrefix)?.id || songs[0]?.id || '';

  const s1 = findId('collective-orig-psalm-150');
  const s2 = findId('pd-hymn-holy-holy-holy');
  const s3 = findId('pd-gospel-pass-me-not');
  const s4 = findId('collective-orig-sanctuary-fire');
  const s5 = findId('pd-hymn-amazing-grace');

  const arrangements: MelosArrangement[] = [
    {
      id: 'setlist-sunday-morning',
      name: 'Sunday 9:00 AM · Sanctuary Liturgical & Choir Setlist',
      serviceDate: 'This Sunday · 9:00 AM',
      liturgicalTheme: 'Holiness, Grace & Sacred Gathering',
      notes: 'Full Worship Team, Sanctuary Band & SATB Choir run-of-show sequence.',
      isPrimary: true,
      songIds: [s1, s2, s3, s4, s5].filter(Boolean),
      slotCues: {
        [s1]: {
          songId: s1,
          performanceKey: 'Ab Major',
          bpm: 112,
          leadVocalistOrDirector: 'Sanctuary Band & Praise Team',
          assignedSubDept: 'music-band',
          momentInService: 'Processional & Call to Worship',
          plannedSec: 270,
          actualSec: 262,
          notes: 'Brass & Hammond B3 intro — 8-bar count-in.',
        },
        [s2]: {
          songId: s2,
          performanceKey: 'D Major',
          bpm: 84,
          leadVocalistOrDirector: 'Sister Clara Vance · Worship Lead',
          assignedSubDept: 'music-worship-teams',
          momentInService: 'Opening Congregational Hymn',
          plannedSec: 240,
          actualSec: 245,
          notes: 'Organ + full band swell on Verse 4.',
        },
        [s3]: {
          songId: s3,
          performanceKey: 'G Major',
          bpm: 72,
          leadVocalistOrDirector: 'Dr. Evelyn Vance · Choir Director',
          assignedSubDept: 'music-choir',
          momentInService: 'Choir Ministry & Offertory',
          plannedSec: 260,
          actualSec: 0,
          notes: 'SATB a cappella refrain on final stanza.',
        },
        [s4]: {
          songId: s4,
          performanceKey: 'Eb Major',
          bpm: 74,
          leadVocalistOrDirector: 'Collective Music Department',
          assignedSubDept: 'music-collective',
          momentInService: 'Sermon Response & Altar Call',
          plannedSec: 330,
          actualSec: 0,
          notes: 'Soft keys pad under Pastor prayer transition.',
        },
        [s5]: {
          songId: s5,
          performanceKey: 'G Major',
          bpm: 72,
          leadVocalistOrDirector: 'Full Band, Worship Team & Choir',
          assignedSubDept: 'music-worship-teams',
          momentInService: 'Benediction & Sending',
          plannedSec: 240,
          actualSec: 0,
          notes: 'Modulate G -> Ab on final refrain.',
        },
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'setlist-sunday-celebration',
      name: 'Sunday 11:15 AM · Gospel & Contemporary Worship Setlist',
      serviceDate: 'This Sunday · 11:15 AM',
      liturgicalTheme: 'Redemption, Joy & Living Stones',
      notes: 'Second service running order with extended praise break.',
      isPrimary: false,
      songIds: [s1, s4, s5].filter(Boolean),
      slotCues: {
        [s1]: {
          songId: s1,
          performanceKey: 'Ab Major',
          bpm: 114,
          leadVocalistOrDirector: 'Sanctuary Band & Mass Choir',
          assignedSubDept: 'music-band',
          momentInService: 'Call to Worship',
          plannedSec: 280,
          actualSec: 0,
        },
        [s4]: {
          songId: s4,
          performanceKey: 'Eb Major',
          bpm: 74,
          leadVocalistOrDirector: 'Collective Music Department',
          assignedSubDept: 'music-collective',
          momentInService: 'Congregational Worship',
          plannedSec: 320,
          actualSec: 0,
        },
        [s5]: {
          songId: s5,
          performanceKey: 'G Major',
          bpm: 72,
          leadVocalistOrDirector: 'Frontline Vocalists',
          assignedSubDept: 'music-worship-teams',
          momentInService: 'Altar Response',
          plannedSec: 240,
          actualSec: 0,
        },
      },
      createdAt: now,
      updatedAt: now,
    },
  ];

  const people: Collaborator[] = [
    {
      id: 'org_col_1',
      name: 'Sister Clara Vance',
      role: 'VOCALIST',
      instrument: 'Worship Team Lead',
      status: 'ACTIVE',
      songIds: songs.map(s => s.id),
      createdAt: now,
    },
    {
      id: 'org_col_2',
      name: 'Devon Brooks',
      role: 'MUSICIAN',
      instrument: 'Music Director · Keys & Hammond B3',
      status: 'ACTIVE',
      songIds: songs.map(s => s.id),
      createdAt: now,
    },
    {
      id: 'org_col_3',
      name: 'Dr. Evelyn Vance',
      role: 'PRODUCER',
      instrument: 'SATB Choir Director',
      status: 'ACTIVE',
      songIds: songs.map(s => s.id),
      createdAt: now,
    },
  ];

  return {
    production,
    songs,
    arrangements,
    pins: [],
    samples: [],
    sessions: [],
    people,
  };
}

export function loadOrgChoraBundle(
  orgId: string,
  orgName = 'Sanctuary Music Department',
  ownerUid = 'elevate-music',
  includeDemoOriginals = true,
): SeededProduction {
  try {
    const raw = localStorage.getItem(ORG_CHORA_STORAGE_KEY(orgId));
    if (raw) {
      const parsed = JSON.parse(raw) as SeededProduction;
      if (parsed?.production?.id && Array.isArray(parsed.songs)) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  const seeded = buildOrgChoraSeed(orgId, orgName, ownerUid, includeDemoOriginals);
  saveOrgChoraBundle(orgId, seeded);
  return seeded;
}

export function saveOrgChoraBundle(orgId: string, bundle: SeededProduction): void {
  try {
    localStorage.setItem(ORG_CHORA_STORAGE_KEY(orgId), JSON.stringify(bundle));
  } catch {
    /* ignore */
  }
}

/**
 * Ensures the Organization's Chora production (`melos_church_${orgId}`) is seeded in both
 * local storage and Firestore (`melosProductions/{prodId}`).
 */
export async function ensureOrgChoraProduction(
  orgId: string,
  orgName: string,
  ownerUid = 'elevate-music',
  includeDemoOriginals = true,
): Promise<SeededProduction> {
  const bundle = loadOrgChoraBundle(orgId, orgName, ownerUid, includeDemoOriginals);
  try {
    await setDoc(prodRef(bundle.production.id), stripUndefined(bundle.production));
    await Promise.all([
      ...bundle.songs.slice(0, 12).map(s => put(bundle.production.id, 'songs', s)),
      ...bundle.arrangements.map(a => put(bundle.production.id, 'arrangements', a)),
      ...bundle.people.map(p => put(bundle.production.id, 'people', p)),
    ]);
  } catch {
    /* offline — local bundle is authoritative fallback */
  }
  return bundle;
}

// ═══ Chora Environment Deep-Link Bridge ══════════════════════════════════════

export type ChoraPadMode = 'lyrics' | 'score' | 'split' | 'stand';

export interface PendingChoraLaunch {
  productionId: string;
  orgId?: string;
  orgName?: string;
  room?: 'pad' | 'tracklist' | 'arrange' | 'board' | 'beats' | 'master' | 'mixer';
  padMode?: ChoraPadMode;
  songId?: string;
  arrangementId?: string;
  subDept?: MusicSubCategoryKey;
  openHymnalModal?: boolean;
  openLiveCueTimer?: boolean;
  timestamp: number;
}

const PENDING_CHORA_LAUNCH_SLOT = 'plajah_pending_chora_launch_v1';

export function launchChoraEnvironment(opts: Omit<PendingChoraLaunch, 'timestamp'>): void {
  const payload: PendingChoraLaunch = { ...opts, timestamp: Date.now() };
  try {
    sessionStorage.setItem(PENDING_CHORA_LAUNCH_SLOT, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plajah:openChoraEnvironment', { detail: payload }));
    window.dispatchEvent(
      new CustomEvent('NAVIGATE', {
        detail: { target: 'MELOS', params: { productionId: payload.productionId } },
      }),
    );
  }
}

export function peekPendingChoraLaunch(): PendingChoraLaunch | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CHORA_LAUNCH_SLOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingChoraLaunch;
    if (Date.now() - (parsed.timestamp || 0) > 5 * 60 * 1000) {
      sessionStorage.removeItem(PENDING_CHORA_LAUNCH_SLOT);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function consumePendingChoraLaunch(): PendingChoraLaunch | null {
  const p = peekPendingChoraLaunch();
  try {
    sessionStorage.removeItem(PENDING_CHORA_LAUNCH_SLOT);
  } catch {
    /* ignore */
  }
  return p;
}

