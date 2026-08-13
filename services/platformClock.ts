// platformClock — the ONE time authority for everything schedule-driven on Plajah.
//
// WHY: every time-sensitive feature used to read `Date.now()` and the device's timezone directly.
// That gives two failures that no amount of engine work can fix:
//   1. DRIFT — a TV or phone with a skewed clock airs the wrong programme, and its guide disagrees
//      with what it is playing. Cheap TV clocks drift by minutes.
//   2. DIVERGENCE — anchoring a schedule to the *viewer's* local midnight means two viewers in
//      different timezones see different programmes at the same instant. A linear channel is a shared
//      broadcast; it must be the same feed for everyone. It also makes a published XMLTV/EPG feed
//      impossible, because those carry absolute times.
//
// So: authority time is server-synced UTC (`now()`), scheduling is anchored to the CHANNEL's declared
// timezone, and the viewer's local zone is used only to DISPLAY. That is how real broadcast works.

let skewMs = 0;                 // serverNow - deviceNow
let synced = false;
let lastSyncAt = 0;
let inFlight: Promise<boolean> | null = null;

/** Milliseconds the device clock is wrong by (positive = device is behind the server). */
export const clockSkewMs = (): number => skewMs;
export const isClockSynced = (): boolean => synced;
export const lastClockSyncAt = (): number => lastSyncAt;

/**
 * Authority time. Device clock corrected by the measured server skew.
 *
 * Deliberately NOT monotonic-from-performance.now(): the FAST engine re-derives its position from this
 * on every slot boundary, and a resync only ever moves it by the skew delta (milliseconds after the
 * first sync). Anchoring to performance.now() instead would drift across device sleep, which is worse
 * on exactly the always-on TV hardware this matters most for.
 */
export function now(): number {
  return Date.now() + skewMs;
}

/**
 * Measure skew against our own origin's `Date` response header, compensating for round-trip.
 * No new endpoint needed — Firebase Hosting and Cloud Run both send it. Falls back to leaving the
 * device clock untouched rather than guessing.
 */
export async function syncPlatformClock(timeoutMs = 8000): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const t0 = Date.now();
      const res = await fetch(`${location.origin}/?_clock=${t0}`, {
        method: 'HEAD', cache: 'no-store', signal: ctl.signal,
      });
      clearTimeout(t);
      const t1 = Date.now();
      const header = res.headers.get('Date');
      if (!header) return false;
      const serverMs = new Date(header).getTime();
      if (!Number.isFinite(serverMs)) return false;
      // The header names when the server generated the response — roughly the midpoint of the trip.
      const rtt = t1 - t0;
      const measured = serverMs + rtt / 2 - t1;
      // The Date header has 1-second granularity, so sub-second "skew" is noise. Only trust a
      // correction big enough to matter for scheduling.
      skewMs = Math.abs(measured) >= 1000 ? measured : 0;
      synced = true;
      lastSyncAt = Date.now();
      return true;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Sync now, then periodically and whenever the tab/app comes back to the foreground. */
export function startClockAutoSync(intervalMs = 15 * 60 * 1000): () => void {
  void syncPlatformClock();
  const timer = setInterval(() => { void syncPlatformClock(); }, intervalMs);
  const onVisible = () => { if (document.visibilityState === 'visible') void syncPlatformClock(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}

// ── Timezone-aware calendar maths ────────────────────────────────────────────────────────────────
// All of this works on WALL-CLOCK components in a named IANA zone, which is what broadcast scheduling
// means: "the 3pm show" is 3pm on the station's wall clock, DST included.

/** The viewer's own zone — for DISPLAY only, never for deciding what is on air. */
export function viewerTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number; }

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Wall-clock components of `atMs` as seen in `tz`. Falls back to device-local on a bad zone. */
export function zonedParts(atMs: number, tz?: string): ZonedParts {
  const d = new Date(atMs);
  if (!tz) {
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), weekday: d.getDay() };
  }
  try {
    const parts = formatterFor(tz).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '0';
    const hour = parseInt(get('hour'), 10);
    return {
      year: parseInt(get('year'), 10),
      month: parseInt(get('month'), 10),
      day: parseInt(get('day'), 10),
      hour: hour === 24 ? 0 : hour,   // some ICU builds render midnight as 24
      minute: parseInt(get('minute'), 10),
      second: parseInt(get('second'), 10),
      weekday: WEEKDAY_INDEX[parts.find(p => p.type === 'weekday')?.value || 'Sun'] ?? 0,
    };
  } catch {
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), weekday: d.getDay() };
  }
}

/** Seconds elapsed since midnight on `tz`'s wall clock. */
export function secondsSinceZonedMidnight(atMs: number, tz?: string): number {
  const p = zonedParts(atMs, tz);
  return p.hour * 3600 + p.minute * 60 + p.second;
}

/** Instant of the most recent midnight on `tz`'s wall clock. */
export function zonedMidnightMs(atMs: number, tz?: string): number {
  return atMs - secondsSinceZonedMidnight(atMs, tz) * 1000 - (atMs % 1000);
}

/** Weekday index (0=Sun) on `tz`'s wall clock. */
export function zonedDayIndex(atMs: number, tz?: string): number {
  return zonedParts(atMs, tz).weekday;
}

/** Render an instant in the VIEWER's zone — the presentation half of the split. */
export function formatLocalTime(atMs: number, opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }): string {
  try { return new Date(atMs).toLocaleTimeString([], opts); } catch { return ''; }
}

/** True when the channel's zone differs from the viewer's — the EPG should say which zone it is showing. */
export function zonesDiffer(channelTz?: string): boolean {
  if (!channelTz) return false;
  const v = viewerTimeZone();
  if (v === channelTz) return false;
  const at = Date.now();
  return secondsSinceZonedMidnight(at, channelTz) !== secondsSinceZonedMidnight(at, v);
}
