// playbackHealth — measure what a listener actually hears.
//
// The player already listens for `pause`, `stalled`, `error` and `ended`, and none of those
// fire on the failure people actually report. An audible drop mid-song is a BUFFER UNDERRUN:
// the element stays "playing", `paused` is false, no error is raised, and the browser quietly
// recovers a moment later. The event for that is `waiting`, which nothing was listening to.
// So every dropout report so far has had to be answered by reading code and guessing between
// several plausible causes, with no way to tell which one actually happened.
//
// This module is the measurement layer. It is deliberately PASSIVE: it observes the media
// element and records, it never seeks, pauses, reloads or changes a source. Nothing here can
// make playback worse, which is the point — it has to be safe to run for everyone, always,
// including while we are still unsure what is wrong.
//
// What it captures per stall is chosen to discriminate between the known suspects rather than
// just to count events:
//   • sourceKind + transcoded → separates "this track never got transcoded and is streaming as
//     a raw master" (the leading suspect) from a genuine network problem on a good stream.
//   • bufferedAhead at the moment of the stall → separates "we ran out of buffer" (starvation)
//     from "we had buffer and still stalled" (decode/CPU, or a seek).
//   • effectiveType/downlink → separates a bad connection from a bad asset.
// One stall with those four fields answers in seconds what previously took an afternoon.

// Dependencies are injected rather than imported. Reading transcode status directly would pull
// choraStreamService -> backendService -> the whole Firebase client in behind it, which would
// make this module impossible to unit-test and would drag Firebase into any surface that only
// wants the numbers. The player wires the real implementations at startup.
export interface HealthDeps {
  /** Resolves whether a track has a ready transcode. */
  getTranscodeStatus?: (trackId: string) => Promise<boolean>;
  /** Current audio-quality tier, for attribution. */
  getQuality?: () => string;
}
let deps: HealthDeps = {};
export function configurePlaybackHealth(d: HealthDeps): void { deps = { ...deps, ...d }; }

export type SourceKind = 'hls' | 'transcoded-progressive' | 'original' | 'blob' | 'unknown';

export interface StallEvent {
  /** Wall-clock start of the stall. */
  at: number;
  trackId: string | null;
  trackTitle: string | null;
  /** Playhead position when it stalled, seconds. */
  position: number;
  /** How long the listener heard nothing, ms. null while still stalled. */
  durationMs: number | null;
  /** Seconds of audio buffered ahead of the playhead when it stalled. 0 = starved. */
  bufferedAhead: number;
  readyState: number;
  sourceKind: SourceKind;
  /** Whether this track had a ready transcode. null = not yet known. */
  transcoded: boolean | null;
  quality: string;
  effectiveType: string | null;
  downlink: number | null;
  /** True once playback resumed. False means it never came back (track change / give-up). */
  recovered: boolean;
}

export interface HealthSummary {
  sessionStartedAt: number;
  /** Seconds of actual playback observed — the denominator that makes stalls comparable. */
  playedSeconds: number;
  stallCount: number;
  totalStalledMs: number;
  /** The headline number: stalls per hour of listening. */
  stallsPerHour: number;
  /** Share of listening time spent stalled. */
  stalledRatio: number;
  worstTrack: { trackId: string; title: string | null; stalls: number } | null;
  bySourceKind: Record<string, number>;
  /** Stalls on tracks with no ready transcode — the actionable bucket. */
  untranscodedStalls: number;
  recent: StallEvent[];
}

const MAX_EVENTS = 200;          // bounded: this runs for the whole session
const SEEK_GRACE_MS = 400;       // a stall within this of a seek is the seek, not an underrun

let events: StallEvent[] = [];
let sessionStartedAt = Date.now();
let playedSeconds = 0;
let open: StallEvent | null = null;
let lastSeekAt = 0;
const listeners = new Set<(e: StallEvent) => void>();

/** Subscribe to completed stall events (used by the adaptive response). */
export function onStall(fn: (e: StallEvent) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function classifySource(src: string): SourceKind {
  if (!src) return 'unknown';
  if (src.startsWith('blob:')) return 'blob';
  if (src.includes('/api/chora/media/')) return src.includes('.m3u8') ? 'hls' : 'transcoded-progressive';
  if (/\.m3u8(\?|$)/i.test(src)) return 'hls';
  return 'original';
}

/** Seconds of contiguous buffer ahead of the playhead. 0 means starved. */
function bufferedAhead(audio: HTMLMediaElement): number {
  try {
    const t = audio.currentTime;
    for (let i = 0; i < audio.buffered.length; i++) {
      if (audio.buffered.start(i) <= t + 0.01 && audio.buffered.end(i) >= t) {
        return Math.max(0, audio.buffered.end(i) - t);
      }
    }
  } catch { /* buffered throws on a torn-down element */ }
  return 0;
}

function netInfo(): { effectiveType: string | null; downlink: number | null } {
  const c = (navigator as any)?.connection;
  return { effectiveType: c?.effectiveType ?? null, downlink: typeof c?.downlink === 'number' ? c.downlink : null };
}

export interface TrackContext { trackId: string | null; title: string | null; }

/**
 * Attach to a media element. Returns a detach function.
 *
 * `getTrack` is a getter rather than a value because the element outlives any single track —
 * reading it lazily at stall time is what keeps the event attributed to the right song.
 */
export function attachPlaybackHealth(
  audio: HTMLMediaElement,
  getTrack: () => TrackContext,
): () => void {
  let lastTimeUpdate = 0;

  const closeOpen = (recovered: boolean) => {
    if (!open) return;
    open.durationMs = Date.now() - open.at;
    open.recovered = recovered;
    const done = open;
    open = null;
    for (const fn of listeners) { try { fn(done); } catch { /* a listener must never break playback */ } }
  };

  const onWaiting = () => {
    if (open) return;                                  // already counting this one
    if (audio.paused) return;                          // paused by the user, not starved
    if (Date.now() - lastSeekAt < SEEK_GRACE_MS) return; // the seek's own rebuffer
    if (audio.ended) return;
    const { trackId, title } = getTrack();
    const net = netInfo();
    open = {
      at: Date.now(),
      trackId, trackTitle: title,
      position: audio.currentTime,
      durationMs: null,
      bufferedAhead: bufferedAhead(audio),
      readyState: audio.readyState,
      sourceKind: classifySource(audio.currentSrc || audio.src || ''),
      transcoded: null,
      quality: (() => { try { return deps.getQuality?.() ?? 'unknown'; } catch { return 'unknown'; } })(),
      effectiveType: net.effectiveType,
      downlink: net.downlink,
      recovered: false,
    };
    // Resolve transcode status out of band — it's cached after the first lookup, and this must
    // not sit in the event path. This is the field that says whether the track was ever
    // transcoded at all, which is the difference between "bad network" and "bad asset".
    const captured = open;
    if (trackId && deps.getTranscodeStatus) {
      Promise.resolve()
        .then(() => deps.getTranscodeStatus!(trackId))
        .then(ok => { captured.transcoded = ok; })
        .catch(() => { /* leave null — unknown is honest */ });
    }
  };

  const onPlaying = () => closeOpen(true);
  const onSeeking = () => { lastSeekAt = Date.now(); closeOpen(false); };

  const onTimeUpdate = () => {
    const now = Date.now();
    if (lastTimeUpdate && !audio.paused) {
      const dt = (now - lastTimeUpdate) / 1000;
      // Only count plausible real-time progress; a big gap means we were away/stalled, and
      // counting it as listening would flatter the stalls-per-hour figure.
      if (dt > 0 && dt < 2) playedSeconds += dt;
    }
    lastTimeUpdate = now;
    if (open) closeOpen(true);   // time is moving again
  };

  const onEmptiedOrEnded = () => closeOpen(false);

  audio.addEventListener('waiting', onWaiting);
  audio.addEventListener('playing', onPlaying);
  audio.addEventListener('seeking', onSeeking);
  audio.addEventListener('timeupdate', onTimeUpdate);
  audio.addEventListener('ended', onEmptiedOrEnded);
  audio.addEventListener('emptied', onEmptiedOrEnded);

  return () => {
    closeOpen(false);
    audio.removeEventListener('waiting', onWaiting);
    audio.removeEventListener('playing', onPlaying);
    audio.removeEventListener('seeking', onSeeking);
    audio.removeEventListener('timeupdate', onTimeUpdate);
    audio.removeEventListener('ended', onEmptiedOrEnded);
    audio.removeEventListener('emptied', onEmptiedOrEnded);
  };
}

/** Record a completed stall. Called by the module's own listener, registered below. */
function record(e: StallEvent): void {
  events.push(e);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
}
onStall(record);

export function getSummary(): HealthSummary {
  const totalStalledMs = events.reduce((n, e) => n + (e.durationMs || 0), 0);
  const perTrack = new Map<string, { title: string | null; stalls: number }>();
  const bySource: Record<string, number> = {};
  let untranscoded = 0;
  for (const e of events) {
    if (e.trackId) {
      const cur = perTrack.get(e.trackId) || { title: e.trackTitle, stalls: 0 };
      cur.stalls++; perTrack.set(e.trackId, cur);
    }
    bySource[e.sourceKind] = (bySource[e.sourceKind] || 0) + 1;
    if (e.transcoded === false) untranscoded++;
  }
  let worst: HealthSummary['worstTrack'] = null;
  for (const [trackId, v] of perTrack) {
    if (!worst || v.stalls > worst.stalls) worst = { trackId, title: v.title, stalls: v.stalls };
  }
  const hours = playedSeconds / 3600;
  return {
    sessionStartedAt,
    playedSeconds: Math.round(playedSeconds),
    stallCount: events.length,
    totalStalledMs,
    stallsPerHour: hours > 0 ? +(events.length / hours).toFixed(2) : 0,
    stalledRatio: playedSeconds > 0 ? +(totalStalledMs / 1000 / playedSeconds).toFixed(4) : 0,
    worstTrack: worst,
    bySourceKind: bySource,
    untranscodedStalls: untranscoded,
    recent: events.slice(-20),
  };
}

export function getEvents(): StallEvent[] { return events.slice(); }

export function reset(): void {
  events = []; playedSeconds = 0; open = null; sessionStartedAt = Date.now();
}
