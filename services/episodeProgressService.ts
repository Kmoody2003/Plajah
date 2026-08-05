// episodeProgressService.ts — remembers where a listener left off in each episode so they can
// resume. localStorage-first (instant, offline, COPPA-friendly: nothing leaves the device); a
// best-effort Firestore mirror for cross-device continuity is a follow-up. The player writes
// progress (throttled) on timeupdate; episode lists read it for progress bars + Resume/Start-over.

export interface EpisodeProgress {
  episodeId: string;
  currentTime: number;   // seconds
  duration: number;      // seconds (0 if unknown)
  updatedAt: number;     // epoch ms
  completed: boolean;    // listened to (near) the end
}

const LS_KEY = 'plajah:episodeProgress:v1';
const COMPLETE_FRAC = 0.97;   // ≥97% counts as finished
const MIN_RESUME_SEC = 8;     // don't bother resuming the first few seconds

type ProgressMap = Record<string, EpisodeProgress>;

function loadAll(): ProgressMap {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as ProgressMap; }
  catch { return {}; }
}
function saveAll(map: ProgressMap): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch { /* quota/private mode */ }
}

export function getProgress(episodeId: string): EpisodeProgress | null {
  if (!episodeId) return null;
  return loadAll()[episodeId] ?? null;
}

/** Persist progress for an episode. Caller should throttle (e.g. every ~5s of playback). */
export function saveProgress(episodeId: string, currentTime: number, duration: number): void {
  if (!episodeId || !isFinite(currentTime)) return;
  const map = loadAll();
  const completed = duration > 0 && currentTime >= duration * COMPLETE_FRAC;
  map[episodeId] = { episodeId, currentTime, duration: duration || map[episodeId]?.duration || 0, updatedAt: Date.now(), completed };
  saveAll(map);
}

export function clearProgress(episodeId: string): void {
  if (!episodeId) return;
  const map = loadAll();
  if (map[episodeId]) { delete map[episodeId]; saveAll(map); }
}

/** 0..1 fraction listened (0 if unknown). */
export function progressFraction(p: EpisodeProgress | null): number {
  if (!p || !p.duration) return p?.completed ? 1 : 0;
  return Math.max(0, Math.min(1, p.currentTime / p.duration));
}

/** True if there's a meaningful position to resume to (not finished, past the intro). */
export function isResumable(p: EpisodeProgress | null): boolean {
  return !!p && !p.completed && p.currentTime >= MIN_RESUME_SEC;
}

/** The time to resume from, or 0. */
export function resumeTime(episodeId: string): number {
  const p = getProgress(episodeId);
  return isResumable(p) ? p!.currentTime : 0;
}

/** All in-progress (started, not finished) episodes, most-recent first — for "Continue listening". */
export function continueListening(): EpisodeProgress[] {
  return Object.values(loadAll())
    .filter(p => !p.completed && p.currentTime >= MIN_RESUME_SEC)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** mm:ss for a seconds value. */
export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
