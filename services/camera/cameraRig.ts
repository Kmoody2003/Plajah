// cameraRig — the one owner of the physical camera on a capture surface.
//
// Why it exists: most phones can only have one camera open. Opening the next camera while the current
// one is live throws NotReadableError, so "open new, then stop old" never switched at all. The rig:
//   · frees the current camera first on phones (desktop keeps the old picture until the new one is up,
//     and falls back to freeing it if the driver refuses two),
//   · retries while the OS finishes releasing the sensor (Android takes a few hundred ms),
//   · coalesces rapid taps: only the newest request runs, so spamming flip can't race,
//   · rolls back to the last good camera when a switch fails, so you never end up with no picture,
//   · reopens the camera when the OS takes it away (backgrounding, another app, a call).
//
// It knows nothing about what consumes the track: the caller's `publish` decides (raw RTC or composer).

export type CameraFacing = 'user' | 'environment' | 'unknown';
export type LensRole = 'ultrawide' | 'wide' | 'tele' | 'other';

export interface CameraInfo {
  deviceId: string;
  label: string;
  facing: CameraFacing;
  role: LensRole;
  /** Native-camera style label for a lens pill: ".5", "1", "2". Empty when the OS doesn't tell us. */
  zoomLabel: string;
}

export interface RigState {
  phase: 'idle' | 'opening' | 'live' | 'failed';
  deviceId?: string;
  facing: CameraFacing;
  /** Preview mirrors selfie cameras only. */
  mirror: boolean;
  cameras: CameraInfo[];
  /** A camera-side zoom the current track supports (min..max), when it has one. */
  zoom: { min: number; max: number; value: number } | null;
  error: string | null;
  /** How long the last switch took from tap to picture. */
  lastSwitchMs: number | null;
}

export interface RigOptions {
  /** Put this track on screen and on air. Resolves once it's showing. */
  publish: (track: MediaStreamTrack) => Promise<void>;
  /** Optional extra tuning for a fresh track (focus, exposure). Never blocks the switch. */
  tune?: (track: MediaStreamTrack) => void | Promise<void>;
  onState?: (s: RigState) => void;
  /** Override for tests. True = free the current camera before opening the next. */
  freeFirst?: boolean;
  media?: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>;
  openTimeoutMs?: number;
}

type Target = { deviceId: string } | { facing: 'user' | 'environment' };

const HQ: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } };
const RELEASE_BACKOFF_MS = [120, 300, 600];
const MUTE_GRACE_MS = 2500;

export const isPhoneLike = (): boolean =>
  typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '')));

/** A sensor-busy error, worth waiting out. */
const isBusy = (e: any) => e?.name === 'NotReadableError' || e?.name === 'TrackStartError' || e?.name === 'AbortError';
const isDenied = (e: any) => e?.name === 'NotAllowedError' || e?.name === 'SecurityError' || e?.name === 'PermissionDeniedError';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Plain words for a capture failure. */
export function cameraErrorMessage(e: any): string {
  if (isDenied(e)) return 'Camera permission is blocked. Allow the camera for Plajah, then try again.';
  if (isBusy(e)) return 'Another app is using the camera. Close it, then try again.';
  if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') return 'No camera found on this device.';
  if (e?.name === 'CameraTimeout') return "The camera didn't respond. Try again.";
  return e?.message || "Couldn't start the camera.";
}

function roleOf(label: string): LensRole {
  if (/ultra[\s-]?wide|\b0\.5x?\b/i.test(label)) return 'ultrawide';
  if (/tele(photo)?|\b[2-9](\.\d)?x\b/i.test(label)) return 'tele';
  if (/back camera$|front camera$|\bwide\b/i.test(label)) return 'wide';
  return 'other';
}

function facingOf(label: string, reported?: string): CameraFacing {
  if (reported === 'user' || reported === 'environment') return reported;
  if (/\b(back|rear|environment|world)\b/i.test(label)) return 'environment';
  if (/\b(front|user|selfie|face)\b/i.test(label)) return 'user';
  return 'unknown';
}

/** iOS lists "Back Dual/Triple Camera" alongside the real lenses. Those are the same sensors again. */
const isLogicalBundle = (label: string) => /\b(dual|triple|quad)\b/i.test(label);

/** Distinct cameras in shutter order: selfie first, then rear lenses widest to longest. */
export function classifyCameras(devices: MediaDeviceInfo[]): CameraInfo[] {
  const seen = new Set<string>();
  const raw = devices.filter(d => d.kind === 'videoinput' && d.deviceId && !seen.has(d.deviceId) && !!seen.add(d.deviceId));
  const hasPhysical = raw.some(d => /ultra|tele/i.test(d.label));
  const cams = raw.filter(d => !(hasPhysical && isLogicalBundle(d.label))).map(d => {
    const role = roleOf(d.label);
    return { deviceId: d.deviceId, label: d.label, facing: facingOf(d.label), role, zoomLabel: role === 'ultrawide' ? '.5' : role === 'tele' ? '2' : role === 'wide' ? '1' : '' } as CameraInfo;
  });
  const facingRank = (c: CameraInfo) => (c.facing === 'user' ? 0 : c.facing === 'environment' ? 1 : 2);
  const roleRank: Record<LensRole, number> = { ultrawide: 0, wide: 1, other: 2, tele: 3 };
  return cams
    .map((c, i) => ({ c, i }))
    .sort((a, b) => facingRank(a.c) - facingRank(b.c) || (a.c.facing === 'environment' ? roleRank[a.c.role] - roleRank[b.c.role] : 0) || a.i - b.i)
    .map(x => x.c);
}

/** Lens pills for a side of the phone. Android rarely names its lenses, so unnamed ones are numbered. */
export function lensPills(cameras: CameraInfo[], facing: CameraFacing): { deviceId: string; label: string }[] {
  const side = cameras.filter(c => c.facing === facing);
  if (side.length < 2) return [];
  return side.map((c, i) => ({ deviceId: c.deviceId, label: c.zoomLabel || `${i + 1}` }));
}

export class CameraRig {
  private track: MediaStreamTrack | null = null;
  private lastGood: Target | null = null;
  private lastRearLens: string | null = null;
  private want: Target | null = null;
  private inFlight: Target | null = null;
  private pumping = false;
  private disposed = false;
  private recovering = false;
  private muteTimer: ReturnType<typeof setTimeout> | null = null;
  private state: RigState = { phase: 'idle', facing: 'unknown', mirror: true, cameras: [], zoom: null, error: null, lastSwitchMs: null };
  private readonly md: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>;
  private readonly freeFirst: boolean;
  private readonly openTimeoutMs: number;

  constructor(private opts: RigOptions) {
    this.md = opts.media ?? navigator.mediaDevices;
    this.freeFirst = opts.freeFirst ?? isPhoneLike();
    this.openTimeoutMs = opts.openTimeoutMs ?? 8000;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
    (navigator.mediaDevices as any)?.addEventListener?.('devicechange', this.onDeviceChange);
  }

  getState(): RigState { return this.state; }
  getTrack(): MediaStreamTrack | null { return this.track; }

  private emit(patch: Partial<RigState>) {
    this.state = { ...this.state, ...patch };
    this.opts.onState?.(this.state);
  }

  /** Re-read the device list (labels appear once permission is granted). */
  async refreshCameras(): Promise<CameraInfo[]> {
    const list = classifyCameras(await this.md.enumerateDevices().catch(() => [] as MediaDeviceInfo[]));
    if (!this.disposed) this.emit({ cameras: list });
    return list;
  }

  /** Take ownership of a camera that's already open (the session's first capture). */
  async adopt(track: MediaStreamTrack) {
    if (track === this.track) return;
    this.bind(track);
    this.describe(track);
    this.emit({ phase: 'live', error: null });
    await this.refreshCameras();
    this.describe(track);
  }

  /** Flip sides, returning to the rear lens you last used. With no front/back pair, step to the next camera. */
  async flip() {
    const cams = this.state.cameras.length ? this.state.cameras : await this.refreshCameras();
    const sides = new Set(cams.map(c => c.facing));
    if (sides.has('user') && sides.has('environment')) {
      // Flip from where you're heading, not where the camera still is, so every tap counts.
      const heading = this.want ?? this.inFlight;
      const headingCam = heading && 'deviceId' in heading ? cams.find(c => c.deviceId === heading.deviceId) : null;
      const from = headingCam?.facing ?? (heading && 'facing' in heading ? heading.facing : this.state.facing);
      const to = from === 'user' ? 'environment' : 'user';
      const pick = to === 'environment' ? cams.find(c => c.deviceId === this.lastRearLens) ?? cams.find(c => c.facing === to && c.role === 'wide') ?? cams.find(c => c.facing === to) : cams.find(c => c.facing === to);
      return this.request(pick ? { deviceId: pick.deviceId } : { facing: to });
    }
    if (cams.length > 1) {
      const i = cams.findIndex(c => c.deviceId === this.state.deviceId);
      return this.request({ deviceId: cams[(i + 1) % cams.length].deviceId });
    }
    // Device ids hidden or a single entry: let the browser pick by facing.
    return this.request({ facing: this.state.facing === 'environment' ? 'user' : 'environment' });
  }
  selectCamera(deviceId: string) { return this.request({ deviceId }); }
  selectFacing(facing: 'user' | 'environment') { return this.state.facing === facing ? Promise.resolve() : this.request({ facing }); }
  clearError() { this.emit({ error: null }); }
  retry() { return this.request(this.lastGood ?? { facing: 'user' }); }

  /** Zoom on the current sensor. Instant: no reopen. */
  async setZoom(value: number) {
    const z = this.state.zoom;
    if (!this.track || !z) return;
    const next = Math.min(z.max, Math.max(z.min, value));
    try {
      await this.track.applyConstraints({ advanced: [{ zoom: next } as any] });
      this.emit({ zoom: { ...z, value: next } });
    } catch { /* this driver refused it; keep the current zoom */ }
  }

  private async request(t: Target) {
    this.want = t;           // the newest tap replaces any queued one
    this.emit({ phase: 'opening', error: null });
    await this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.want && !this.disposed) {
        const t = this.want; this.want = null;
        this.inFlight = t;
        await this.switchTo(t);
      }
    } finally { this.pumping = false; this.inFlight = null; }
  }

  private async switchTo(target: Target) {
    const t0 = performance.now();
    const previous = this.track;
    const rollback = this.lastGood;
    let next: MediaStreamTrack | null = null;
    let freed = false;
    const free = () => { if (previous && !freed) { this.unbind(previous); previous.stop(); freed = true; } };
    try {
      if (this.freeFirst) free();
      try {
        next = await this.open(target);
      } catch (e) {
        if (!isBusy(e) || freed) throw e;
        free();      // this driver won't run two: free ours and try again
        next = await this.open(target);
      }
      if (this.disposed) { next.stop(); return; }
      await this.opts.publish(next);
      free();
      this.track = null;
      this.bind(next);
      this.describe(next);
      this.emit({ phase: this.want ? 'opening' : 'live', error: null, lastSwitchMs: Math.round(performance.now() - t0) });
      void Promise.resolve(this.opts.tune?.(next)).catch(() => {});
    } catch (e: any) {
      next?.stop();
      if (this.disposed) return;
      console.warn('[camera] switch failed', e);
      const message = cameraErrorMessage(e);
      if (!freed && previous) {
        this.emit({ phase: 'live', error: message });       // old camera never left: nothing lost
        return;
      }
      this.track = null;
      // The old camera is gone. Get a picture back rather than sit on a dead preview.
      if (rollback && !this.want && !isDenied(e)) {
        try {
          const back = await this.open(rollback);
          await this.opts.publish(back);
          this.bind(back);
          this.describe(back);
          this.emit({ phase: 'live', error: message });
          return;
        } catch (e2) { console.warn('[camera] rollback failed', e2); }
      }
      this.emit({ phase: 'failed', error: message });
    }
  }

  /** Open a target, working down from exact + full HD to whatever the device will give. */
  private async open(target: Target): Promise<MediaStreamTrack> {
    const attempts: MediaTrackConstraints[] = 'deviceId' in target
      ? [{ ...HQ, deviceId: { exact: target.deviceId } }, { deviceId: { exact: target.deviceId } }, { deviceId: target.deviceId }]
      : [{ ...HQ, facingMode: { exact: target.facing } }, { ...HQ, facingMode: target.facing }, { facingMode: target.facing }];
    let lastErr: any = null;
    for (const video of attempts) {
      for (let tryNo = 0; tryNo <= RELEASE_BACKOFF_MS.length; tryNo++) {
        try {
          const track = (await this.gum(video)).getVideoTracks()[0];
          if (!track) throw new DOMException('No video track', 'NotFoundError');
          return track;
        } catch (e: any) {
          lastErr = e;
          if (isDenied(e)) throw e;
          // Only wait out a busy sensor when ours is already released; otherwise the caller frees it first.
          if (!isBusy(e) || !this.sensorFree() || tryNo === RELEASE_BACKOFF_MS.length) break;
          await sleep(RELEASE_BACKOFF_MS[tryNo]);
        }
      }
      if (isBusy(lastErr) && !this.sensorFree()) throw lastErr;
    }
    throw lastErr;
  }

  private sensorFree() { return !this.track || this.track.readyState !== 'live'; }

  /** getUserMedia with a deadline. A late success stops its tracks so the sensor isn't left held. */
  private gum(video: MediaTrackConstraints): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        reject(Object.assign(new Error('Camera timed out'), { name: 'CameraTimeout' }));
      }, this.openTimeoutMs);
      this.md.getUserMedia({ audio: false, video }).then(
        s => { clearTimeout(timer); if (expired) s.getTracks().forEach(t => t.stop()); else resolve(s); },
        e => { clearTimeout(timer); if (!expired) reject(e); },
      );
    });
  }

  private describe(track: MediaStreamTrack) {
    const set = track.getSettings?.() ?? {};
    const deviceId = set.deviceId;
    const known = this.state.cameras.find(c => c.deviceId === deviceId);
    const facing = facingOf(track.label || known?.label || '', set.facingMode) === 'unknown' ? (known?.facing ?? 'unknown') : facingOf(track.label || known?.label || '', set.facingMode);
    if (deviceId) this.lastGood = { deviceId };
    else if (facing !== 'unknown') this.lastGood = { facing };
    if (facing === 'environment' && deviceId) this.lastRearLens = deviceId;
    const caps: any = track.getCapabilities?.() ?? {};
    const zoom = caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > caps.zoom.min
      ? { min: caps.zoom.min, max: caps.zoom.max, value: (set as any).zoom ?? caps.zoom.min }
      : null;
    this.emit({ deviceId, facing, mirror: facing !== 'environment', zoom });
  }

  // ── Recovery ─────────────────────────────────────────────────────────────────
  private bind(track: MediaStreamTrack) {
    this.track = track;
    track.addEventListener('ended', this.onEnded);
    track.addEventListener('mute', this.onMute);
    track.addEventListener('unmute', this.onUnmute);
  }
  private unbind(track: MediaStreamTrack) {
    track.removeEventListener('ended', this.onEnded);
    track.removeEventListener('mute', this.onMute);
    track.removeEventListener('unmute', this.onUnmute);
    if (this.muteTimer) { clearTimeout(this.muteTimer); this.muteTimer = null; }
    if (this.track === track) this.track = null;
  }
  /** The OS took the camera (or it was unplugged). Only unexpected ends land here: stop() fires no event. */
  private onEnded = () => { void this.recover(); };
  private onMute = () => {
    if (this.muteTimer) clearTimeout(this.muteTimer);
    this.muteTimer = setTimeout(() => {
      if (document.visibilityState === 'visible' && this.track?.muted) void this.recover();
    }, MUTE_GRACE_MS);
  };
  private onUnmute = () => { if (this.muteTimer) { clearTimeout(this.muteTimer); this.muteTimer = null; } };
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.disposed || !this.lastGood) return;
    if (this.state.phase === 'failed' || this.track?.readyState === 'ended') void this.recover();
  };
  private onDeviceChange = () => {
    void this.refreshCameras().then(list => {
      // Our camera was unplugged: move to whatever is left.
      if (this.state.deviceId && list.length && !list.some(c => c.deviceId === this.state.deviceId)) {
        this.lastGood = { deviceId: list[0].deviceId };
        void this.recover();
      }
    });
  };
  private async recover() {
    if (this.recovering || this.disposed || !this.lastGood) return;
    this.recovering = true;
    try { await this.request(this.lastGood); } finally { this.recovering = false; }
  }

  /** Forget the current track without stopping it (someone else took it over). */
  release() { if (this.track) this.unbind(this.track); }

  dispose() {
    this.disposed = true;
    this.want = null;
    if (this.track) { const t = this.track; this.unbind(t); t.stop(); }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    (navigator.mediaDevices as any)?.removeEventListener?.('devicechange', this.onDeviceChange);
  }
}
