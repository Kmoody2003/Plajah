// Smart Sync — shared types.
//
// Offset convention (matches Fabula's multicam asset): `angle.offset` is the time in that angle's own
// source that plays at multicam time 0. Source time of angle i at multicam time T = T + offset_i.
// Internally we work with `lag_i`: an event at time t in angle i happens at t + lag_i in the MASTER
// (the reference angle, normally the best sound). Multicam time 0 is the earliest any angle starts.

export type AngleKind = 'video' | 'audio';

export interface SyncAngle {
  assetId: string;
  name: string;
  kind: AngleKind;
  /** Source length, seconds. */
  duration: number;
  /** Source start timecode in seconds (from metadata or typed by the user), when known. */
  tcStart?: number | null;
  url?: string;
}

export interface TimedWord { t: number; end: number; text: string }

export type SyncMethod = 'timecode' | 'audio' | 'transcript' | 'vision' | 'manual';

export interface SyncCandidate {
  method: SyncMethod;
  /** Lag to the master, seconds (t_master = t_angle + lag). */
  lag: number;
  /** 0..1 */
  confidence: number;
  note?: string;
}

export type SyncStatus = 'locked' | 'review' | 'failed' | 'manual' | 'master';

export interface AngleSync {
  assetId: string;
  lag: number;
  confidence: number;
  status: SyncStatus;
  method: SyncMethod | 'master';
  candidates: SyncCandidate[];
  /** Clock drift against the master, parts per million (from transcript anchors spread over the take). */
  driftPpm?: number;
  /** What the vision pass concluded at its probe moments. */
  vision?: { agree: number; disagree: number; unsure: number; checked: boolean };
  notes: string[];
}

/** What the vision pass saw on an angle — feeds the cut. */
export type ShotSize = 'wide' | 'medium' | 'close' | 'screen' | 'crowd' | 'insert' | 'unknown';
export interface AngleLook {
  assetId: string;
  size: ShotSize;
  subject: string;
  /** Free tags: "pulpit", "choir", "band", "stage", "speaker", "audience", "slides"… */
  tags: string[];
  /** Mostly static (locked-off) or operated. */
  operated?: boolean;
}

export type ProgramType = 'church' | 'conference' | 'interview' | 'news' | 'sports' | 'drama' | 'concert' | 'documentary' | 'general';

export type SectionKind =
  | 'welcome' | 'worship' | 'prayer' | 'scripture' | 'sermon' | 'announcements' | 'offering' | 'altar' | 'benediction'
  | 'intro' | 'talk' | 'qa' | 'interview' | 'performance' | 'report' | 'action' | 'scene' | 'break' | 'outro' | 'other';

export interface ProgramSection {
  id: string;
  kind: SectionKind;
  start: number;
  end: number;
  label: string;
  confidence: number;
}

/** A visual cut inside one angle (camera move, operator reframe, slide change) — handy for post. */
export interface ShotChange { assetId: string; t: number; strength: number }

export type FlagKind = 'lowerThird' | 'fullPage';
export type FlagCategory = 'scripture' | 'name' | 'announcement' | 'giving' | 'contact' | 'section' | 'song';
export type FlagStatus = 'suggested' | 'accepted' | 'rejected';

export interface GraphicFlag {
  id: string;
  kind: FlagKind;
  category: FlagCategory;
  /** Multicam time, seconds. */
  at: number;
  duration: number;
  title: string;
  subtitle: string;
  /** For scripture: the parsed reference. */
  ref?: { book: number; bookName: string; chapter: number; verse?: number; endVerse?: number; endChapter?: number };
  /** What was heard that triggered it. */
  heard: string;
  confidence: number;
  status: FlagStatus;
}

export interface CutSegment {
  start: number;
  end: number;
  /** Angle index into the multicam's angles. */
  angle: number;
  reason: string;
  /** Council member whose rule picked it. */
  by: string;
  /** User pinned this — the council never moves it. */
  locked?: boolean;
  approved?: boolean;
}

export interface UserLock { start: number; end: number; angle: number }

export interface CouncilNote { member: string; note: string }

export interface CouncilResult {
  lead: string;
  notes: CouncilNote[];
  /** Per-section pacing / angle preferences the council agreed on (applied by the cutter, never over a lock). */
  adjustments: Array<{ sectionId?: string; start?: number; end?: number; pace?: number; prefer?: ShotSize[]; avoidAngles?: number[]; note?: string }>;
  summary: string;
}

export type StageId = 'ingest' | 'audio' | 'transcript' | 'fuse' | 'vision' | 'segment' | 'flags' | 'precut' | 'council';

export interface SmartSyncOptions {
  programType: ProgramType;
  lead: string;
  council: boolean;
  vision: boolean;
  flags: boolean;
  precut: boolean;
  /** Free-text direction from the user ("keep it calm, feature the choir"). */
  intent: string;
  /** Which angle is the master sound (assetId). Default: picked automatically. */
  masterId?: string;
  /** Timeline frame rate, for frame snapping. */
  fps: number;
}

export interface SmartSyncState {
  version: 1;
  angles: SyncAngle[];
  options: SmartSyncOptions;
  masterId: string;
  sync: AngleSync[];
  /** Master transcript, in master time. */
  words: TimedWord[];
  looks: AngleLook[];
  sections: ProgramSection[];
  shotChanges: ShotChange[];
  flags: GraphicFlag[];
  cut: CutSegment[];
  locks: UserLock[];
  council?: CouncilResult;
  /** Multicam length, seconds, and where multicam 0 sits on the master clock. */
  mcDuration: number;
  mcZero: number;
  done: Partial<Record<StageId, number>>;
  errors: Partial<Record<StageId, string>>;
}
