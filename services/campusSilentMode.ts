// campusSilentMode — while a teacher is physically at their school (or inside contracted
// hours), their Independent persona goes dormant: no selling, no messaging, no storefront
// edits. Their storefront stays LIVE to the public — buyers are unaffected — so nothing is
// lost; the teacher simply cannot transact on district time or district ground.
//
// Trigger stack, defense in depth (geolocation alone is spoofable and battery-dependent):
//   1. Geofence      — browser/WebView Geolocation against the school's coordinates.
//   2. Schedule fence — contracted hours, regardless of location (field trips, GPS failure).
//   3. Manual toggle  — always available; can always ADD silence, can't remove an
//                       auto-engaged one until the fence clears or a 30-minute cooldown passes.
//
// FAILURE POSTURE: fails CLOSED. No location during contracted hours engages Silent Mode on
// the schedule fence alone. Never fail open on district time.
//
// Platform note: Plajah does not ship @capacitor/geolocation, so this uses the standard
// navigator.geolocation API — which the Android WebView serves from the native fused provider
// once ACCESS_FINE_LOCATION is granted. Backgrounded detection needs a native geofence plugin;
// see the upgrade note on requestLocationPermission() below.

import { pushSilentModeState, type Geofence, type ScheduleFence, type SilentModeTrigger } from './academiaIntegrity';

export interface SilentModeState {
  engaged: boolean;
  trigger: SilentModeTrigger | null;
  schoolId: string | null;
  since: number | null;
  /** A manual silence the teacher added themselves — survives the fence clearing. */
  manualHold: boolean;
  /** True when the fence engaged without a location fix (schedule-only, fail-closed). */
  failedClosed: boolean;
}

export const COOLDOWN_MS = 30 * 60 * 1000;
const POLL_MS = 90 * 1000;
const FIX_TIMEOUT_MS = 10_000;
/** Persisted so a page reload (or a reopened WebView) can't reset an active cooldown. */
const COOLDOWN_KEY = 'plajah.silentMode.lastAutoEnter';

type Listener = (s: SilentModeState) => void;

const IDLE: SilentModeState = {
  engaged: false, trigger: null, schoolId: null, since: null, manualHold: false, failedClosed: false,
};

export class CampusSilentModeEngine {
  private state: SilentModeState = { ...IDLE };
  private listeners: Listener[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private evaluating = false;

  constructor(
    private geofences: Geofence[],
    private schedule: ScheduleFence,
    private mode: 'auto' | 'manual' | 'off',
  ) {}

  getState(): SilentModeState { return this.state; }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    fn(this.state);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  /** Swap configuration without tearing down subscribers (settings screen saves). */
  reconfigure(geofences: Geofence[], schedule: ScheduleFence, mode: 'auto' | 'manual' | 'off') {
    this.geofences = geofences;
    this.schedule = schedule;
    this.mode = mode;
    this.stop();
    this.start();
  }

  start() {
    if (this.mode === 'off') return;
    if (this.mode !== 'auto') return; // manual: the teacher drives it, nothing to poll
    void this.evaluate();
    this.timer = setInterval(() => void this.evaluate(), POLL_MS);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /**
   * Manual toggle. Adding silence is always allowed. Removing an auto-engaged silence is
   * refused until the fence clears or the cooldown passes — otherwise the teacher could tap
   * their way out of the protection the log is supposed to prove.
   */
  async setManual(engage: boolean): Promise<{ ok: true } | { ok: false; reason: 'AUTO_HOLD'; retryAt: number }> {
    if (engage) {
      await this.transition(true, 'manual', null, true, false);
      return { ok: true };
    }
    const autoEngaged = this.state.engaged && this.state.trigger !== 'manual';
    const lastAuto = readCooldown();
    const cooled = Date.now() - lastAuto > COOLDOWN_MS;
    if (autoEngaged && !cooled) {
      return { ok: false, reason: 'AUTO_HOLD', retryAt: lastAuto + COOLDOWN_MS };
    }
    await this.transition(false, 'manual', null, false, false);
    return { ok: true };
  }

  private async evaluate() {
    if (this.evaluating) return; // a slow GPS fix must not stack overlapping evaluations
    this.evaluating = true;
    try {
      const inSchedule = this.scheduleActive();
      let inFence: Geofence | null = null;
      let locationKnown = false;

      if (this.geofences.length) {
        const pos = await currentPosition();
        if (pos) {
          locationKnown = true;
          inFence = this.geofences.find(f =>
            haversineMeters(pos.lat, pos.lng, f.lat, f.lng) <= f.radiusMeters
          ) ?? null;
        }
      }

      // Engage when physically on campus, OR fail closed when we have no fix during
      // contracted hours, OR whenever the schedule fence itself is active.
      const failClosed = !locationKnown && inSchedule;
      const shouldEngage = inFence !== null || inSchedule;

      if (shouldEngage && !this.state.engaged) {
        writeCooldown(Date.now());
        await this.transition(
          true,
          inFence ? 'geofence' : 'schedule',
          inFence?.schoolId ?? null,
          false,
          failClosed,
        );
      } else if (!shouldEngage && this.state.engaged && !this.state.manualHold) {
        await this.transition(false, this.state.trigger ?? 'geofence', null, false, false);
      }
    } finally {
      this.evaluating = false;
    }
  }

  private scheduleActive(): boolean {
    if (!this.schedule.enabled || !this.schedule.contractHours.length) return false;
    const { day, minutes } = localDayAndMinutes(this.schedule.timezone);
    return this.schedule.contractHours.some(w => {
      if (w.day !== day) return false;
      const start = hmToMinutes(w.start);
      const end = hmToMinutes(w.end);
      if (start === null || end === null) return false;
      return minutes >= start && minutes <= end;
    });
  }

  private async transition(
    engaged: boolean,
    trigger: SilentModeTrigger,
    schoolId: string | null,
    manualHold: boolean,
    failedClosed: boolean,
  ) {
    this.state = { engaged, trigger, schoolId, manualHold, failedClosed, since: engaged ? Date.now() : null };
    this.listeners.forEach(l => { try { l(this.state); } catch { /* a bad subscriber can't break the fence */ } });
    // Mirror to the server → custom claim → rules enforcement. The server also writes the
    // integrity-log entry, so the record exists even if this client never reports again.
    await pushSilentModeState({ engaged, trigger, ...(schoolId ? { schoolId } : {}) });
  }
}

// ── Geolocation ───────────────────────────────────────────────────────────────

/**
 * Prompts for location once. Android WebView surfaces the native permission dialog through
 * this call. Upgrade path when backgrounded detection matters: add a native geofence plugin
 * (Capacitor) and register transitions with the OS instead of polling — the OS keeps watching
 * when the app is closed, which polling cannot.
 */
export async function requestLocationPermission(): Promise<boolean> {
  return (await currentPosition()) !== null;
}

/** One-shot fix, for the settings screen's "use my current location" geofence helper. */
export async function getCurrentCoords(): Promise<{ lat: number; lng: number } | null> {
  return currentPosition();
}

export function locationAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (!locationAvailable()) return Promise.resolve(null);
  return new Promise(resolve => {
    let settled = false;
    const done = (v: { lat: number; lng: number } | null) => { if (!settled) { settled = true; resolve(v); } };
    // Belt-and-braces: some WebViews never invoke either callback when the provider is off.
    const bail = setTimeout(() => done(null), FIX_TIMEOUT_MS + 2_000);
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(bail); done({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(bail); done(null); },
      { enableHighAccuracy: false, timeout: FIX_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Weekday + minutes-since-midnight in the contract timezone, without a date library.
 *  Intl gives the parts directly — reparsing a locale string is what drifts across engines. */
function localDayAndMinutes(timeZone: string): { day: 0 | 1 | 2 | 3 | 4 | 5 | 6; minutes: number } {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const idx = days.indexOf(get('weekday'));
    // '24' is how hour12:false renders midnight in some engines.
    const hour = Number(get('hour')) % 24;
    return {
      day: (idx >= 0 ? idx : now.getDay()) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      minutes: hour * 60 + Number(get('minute') || 0),
    };
  } catch {
    return { day: now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6, minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

// ── Cooldown persistence ──────────────────────────────────────────────────────

function readCooldown(): number {
  try { return Number(localStorage.getItem(COOLDOWN_KEY) || 0); } catch { return 0; }
}
function writeCooldown(at: number) {
  try { localStorage.setItem(COOLDOWN_KEY, String(at)); } catch { /* private mode */ }
}
