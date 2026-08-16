import { Geolocation } from "@capacitor/geolocation";
import { httpsCallable, getFunctions } from "firebase/functions";
import type { Geofence, ScheduleFence, SilentModeTrigger } from "../../types/schema";

/**
 * Campus Silent Mode — client engine.
 * Defense-in-depth trigger stack: geofence -> schedule fence -> manual.
 * FAILS CLOSED: if location is unavailable during contracted hours,
 * Silent Mode engages on the schedule fence alone.
 *
 * The server mirrors state into a custom claim (setSilentMode), so a
 * tampered client still can't write Independent-persona data on campus.
 */

export interface SilentModeState {
  engaged: boolean;
  trigger: SilentModeTrigger | null;
  schoolId: string | null;
  since: number | null;
  /** Manual silences can always be ADDED; an auto-triggered silence
   *  can't be manually cleared until the fence clears or cooldown passes. */
  manualHold: boolean;
}

const COOLDOWN_MS = 30 * 60 * 1000;
const POLL_MS = 90 * 1000; // web/desktop fallback polling

type Listener = (s: SilentModeState) => void;

export class SilentModeEngine {
  private state: SilentModeState = {
    engaged: false, trigger: null, schoolId: null, since: null, manualHold: false,
  };
  private listeners: Listener[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAutoEnter = 0;

  constructor(
    private geofences: Geofence[],
    private schedule: ScheduleFence,
    private mode: "auto" | "manual" | "off",
  ) {}

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    fn(this.state);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  start() {
    if (this.mode === "off") return;
    if (this.mode === "auto") {
      void this.evaluate();
      this.timer = setInterval(() => void this.evaluate(), POLL_MS);
    }
  }

  stop() { if (this.timer) clearInterval(this.timer); }

  /** Manual toggle: adding silence always allowed; removing an
   *  auto-engaged silence blocked until fence clears or cooldown. */
  async setManual(engage: boolean) {
    if (engage) {
      await this.transition(true, "manual", null, true);
      return { ok: true as const };
    }
    const autoEngaged = this.state.engaged && this.state.trigger !== "manual";
    const cooled = Date.now() - this.lastAutoEnter > COOLDOWN_MS;
    if (autoEngaged && !cooled) {
      return { ok: false as const, reason: "AUTO_HOLD" as const };
    }
    await this.transition(false, "manual", null, false);
    return { ok: true as const };
  }

  private async evaluate() {
    const inSchedule = this.scheduleActive();
    let inFence: Geofence | null = null;
    let locationKnown = false;

    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false, timeout: 10_000,
      });
      locationKnown = true;
      inFence = this.geofences.find(f =>
        haversineMeters(pos.coords.latitude, pos.coords.longitude, f.lat, f.lng)
          <= f.radiusMeters
      ) ?? null;
    } catch {
      // Fail closed: no location + contracted hours => engage on schedule.
      locationKnown = false;
    }

    // Engage if physically on campus, OR fail-closed when location is
    // unknown during contracted hours.
    const shouldEngage = inFence !== null || (!locationKnown && inSchedule);

    if (shouldEngage && !this.state.engaged) {
      this.lastAutoEnter = Date.now();
      await this.transition(true, inFence ? "geofence" : "schedule", inFence?.schoolId ?? null, false);
    } else if (!shouldEngage && this.state.engaged && !this.state.manualHold) {
      await this.transition(false, inFence ? "geofence" : "schedule", null, false);
    }
  }

  private scheduleActive(): boolean {
    if (!this.schedule.enabled) return false;
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: this.schedule.timezone })
    );
    const day = now.getDay() as 0|1|2|3|4|5|6;
    const hm = now.getHours() * 60 + now.getMinutes();
    return this.schedule.contractHours.some(w => {
      if (w.day !== day) return false;
      const [sh, sm] = w.start.split(":").map(Number);
      const [eh, em] = w.end.split(":").map(Number);
      return hm >= sh * 60 + sm && hm <= eh * 60 + em;
    });
  }

  private async transition(
    engaged: boolean, trigger: SilentModeTrigger, schoolId: string | null, manualHold: boolean,
  ) {
    this.state = {
      engaged, trigger, schoolId, manualHold,
      since: engaged ? Date.now() : null,
    };
    this.listeners.forEach(l => l(this.state));
    // Mirror to server -> custom claim -> Firestore rules enforcement.
    const call = httpsCallable(getFunctions(), "setSilentMode");
    await call({ engaged, trigger, schoolId: schoolId ?? undefined });
  }
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
