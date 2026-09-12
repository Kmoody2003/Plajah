/**
 * Privacy-focused network diagnostics.
 *
 * Measures the *user's own* connection quality — latency, jitter, connection
 * drops, and (opt-in) download/upload throughput — and surfaces degradation with
 * a severity level so the app can warn the user when things get bad.
 *
 * Privacy stance:
 *  - Every probe is SAME-ORIGIN. We never contact a third-party speed-test host,
 *    so no one else learns the user is online or how their link performs.
 *  - Measurements are kept in memory (and a tiny rolling summary in localStorage
 *    for continuity). Nothing is transmitted or logged anywhere off-device.
 *  - Upload probes send throwaway RANDOM bytes — never any user content.
 *  - Honors Save-Data / metered hints and a user on/off preference; throughput
 *    tests (the only data-costly part) are opt-in and skipped on metered links.
 */

export type NetworkLevel = 'offline' | 'good' | 'fair' | 'poor' | 'critical';
export type NetworkSeverity = 'none' | 'info' | 'warning' | 'critical';

export interface NetworkSample {
  at: number;              // epoch ms
  online: boolean;
  rttMs: number | null;    // median round-trip of the probe burst
  jitterMs: number | null; // variation between probes
  dropRate: number;        // 0..1 fraction of failed/timed-out probes in the burst
  downMbps: number | null; // last measured download throughput (if run)
  upMbps: number | null;   // last measured upload throughput (if run)
  // Passive Network Information API hints (when the browser exposes them).
  effectiveType?: string;
  saveData?: boolean;
  level: NetworkLevel;
}

export interface DegradationEvent {
  at: number;
  level: NetworkLevel;
  previousLevel: NetworkLevel;
  severity: NetworkSeverity;
  reason: string;          // short human-readable cause
  sample: NetworkSample;
}

export interface NetworkMonitorConfig {
  /** Same-origin URL for tiny latency pings. Should be small & always present. */
  pingUrl: string;
  /** Same-origin endpoint that streams N random bytes for a download test. */
  downloadUrl?: string;
  /** Same-origin endpoint that accepts (and discards) a POST body for upload test. */
  uploadUrl?: string;
  /** Interval between lightweight latency bursts (ms). */
  pingIntervalMs: number;
  /** Interval between heavier throughput tests (ms). 0 disables periodic tests. */
  throughputIntervalMs: number;
  /** Per-probe timeout (ms). */
  timeoutMs: number;
  /** Probes per latency burst. */
  burstSize: number;
  /** Bytes to pull for a download test. */
  downloadBytes: number;
  /** Bytes to push for an upload test. */
  uploadBytes: number;
}

const DEFAULTS: NetworkMonitorConfig = {
  pingUrl: '/api/netdiag/ping',
  downloadUrl: '/api/netdiag/download',
  uploadUrl: '/api/netdiag/upload',
  pingIntervalMs: 8000,
  throughputIntervalMs: 240000, // 4 min — throughput is supplementary; latency drives alerts
  timeoutMs: 6000,
  burstSize: 4,
  downloadBytes: 512 * 1024, // 512 KB — enough to estimate, small enough to be polite
  uploadBytes: 256 * 1024,
};

const PREF_KEY = 'plajah_netdiag_prefs_v1';
const SUMMARY_KEY = 'plajah_netdiag_summary_v1';

export interface NetworkPrefs {
  enabled: boolean;          // monitor at all
  throughputEnabled: boolean; // allow data-costly download/upload tests
  notify: boolean;           // pop notifications on degradation
}

const DEFAULT_PREFS: NetworkPrefs = { enabled: true, throughputEnabled: true, notify: true };

export function loadPrefs(): NetworkPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* storage blocked */ }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(p: NetworkPrefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// ─── Quality model ────────────────────────────────────────────────────────────
// Ordering used to detect "worse than before".
const LEVEL_RANK: Record<NetworkLevel, number> = { good: 0, fair: 1, poor: 2, critical: 3, offline: 4 };

export function levelToSeverity(level: NetworkLevel): NetworkSeverity {
  switch (level) {
    case 'good': return 'none';
    case 'fair': return 'info';
    case 'poor': return 'warning';
    case 'critical':
    case 'offline': return 'critical';
  }
}

export function levelLabel(level: NetworkLevel): string {
  switch (level) {
    case 'good': return 'Good';
    case 'fair': return 'Fair';
    case 'poor': return 'Struggling';
    case 'critical': return 'Critical';
    case 'offline': return 'Offline';
  }
}

/** Classify a set of metrics into a single quality level. */
function classify(m: {
  online: boolean; rttMs: number | null; jitterMs: number | null; dropRate: number; downMbps: number | null;
}): { level: NetworkLevel; reason: string } {
  if (!m.online) return { level: 'offline', reason: 'No connection' };
  if (m.dropRate >= 0.5) return { level: 'critical', reason: 'Heavy packet loss' };

  const rtt = m.rttMs ?? 0;
  const jitter = m.jitterMs ?? 0;
  const down = m.downMbps; // may be null if throughput not measured

  // Latency-driven tiers.
  let level: NetworkLevel = 'good';
  let reason = 'Stable connection';

  if (rtt > 900 || m.dropRate >= 0.3) { level = 'critical'; reason = 'Severe latency / drops'; }
  else if (rtt > 450 || m.dropRate >= 0.15 || jitter > 250) { level = 'poor'; reason = 'High latency & jitter'; }
  else if (rtt > 200 || m.dropRate >= 0.05 || jitter > 100) { level = 'fair'; reason = 'Mild latency'; }

  // Throughput can only make things worse, never better than latency says.
  if (down != null) {
    let tLevel: NetworkLevel = 'good';
    let tReason = reason;
    if (down < 0.5) { tLevel = 'critical'; tReason = 'Very low bandwidth'; }
    else if (down < 2) { tLevel = 'poor'; tReason = 'Low bandwidth'; }
    else if (down < 5) { tLevel = 'fair'; tReason = 'Limited bandwidth'; }
    if (LEVEL_RANK[tLevel] > LEVEL_RANK[level]) { level = tLevel; reason = tReason; }
  }

  return { level, reason };
}

// ─── Probes ─────────────────────────────────────────────────────────────────
function bust(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + '_n=' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function probeOnce(url: string, timeoutMs: number): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(bust(url), { method: 'GET', cache: 'no-store', signal: controller.signal });
    // Drain a tiny bit so timing includes first-byte at least; ignore body.
    await res.arrayBuffer().catch(() => undefined);
    if (!res.ok && res.status !== 304) return null;
    return performance.now() - start;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stddev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

// ─── Monitor ──────────────────────────────────────────────────────────────────
type Listener = (sample: NetworkSample) => void;
type DegradationListener = (event: DegradationEvent) => void;

export class NetworkMonitor {
  private cfg: NetworkMonitorConfig;
  private prefs: NetworkPrefs;
  private pingTimer: any = null;
  private throughputTimer: any = null;
  private running = false;
  private busy = false;
  private lastSample: NetworkSample | null = null;
  private lastDown: number | null = null;
  private lastUp: number | null = null;
  private lastNotifyAt = 0;
  private lastNotifiedLevel: NetworkLevel | null = null;
  private listeners = new Set<Listener>();
  private degradationListeners = new Set<DegradationListener>();

  constructor(cfg: Partial<NetworkMonitorConfig> = {}, prefs?: NetworkPrefs) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.prefs = prefs ?? loadPrefs();
  }

  getPrefs(): NetworkPrefs { return { ...this.prefs }; }
  setPrefs(p: Partial<NetworkPrefs>) {
    this.prefs = { ...this.prefs, ...p };
    savePrefs(this.prefs);
    if (!this.prefs.enabled) this.stop();
    else if (!this.running) this.start();
  }

  getLast(): NetworkSample | null { return this.lastSample; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.lastSample) fn(this.lastSample);
    return () => this.listeners.delete(fn);
  }
  onDegradation(fn: DegradationListener): () => void {
    this.degradationListeners.add(fn);
    return () => this.degradationListeners.delete(fn);
  }

  private connInfo(): { effectiveType?: string; saveData?: boolean; metered: boolean } {
    const c = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!c) return { metered: false };
    return {
      effectiveType: c.effectiveType,
      saveData: !!c.saveData,
      metered: !!c.saveData || c.type === 'cellular',
    };
  }

  start() {
    if (this.running || !this.prefs.enabled) return;
    if (typeof window === 'undefined') return;
    this.running = true;
    window.addEventListener('online', this.handleOnlineChange);
    window.addEventListener('offline', this.handleOnlineChange);
    // Kick an immediate sample, then schedule.
    void this.sampleLatency();
    this.pingTimer = setInterval(() => { void this.sampleLatency(); }, this.cfg.pingIntervalMs);
    if (this.cfg.throughputIntervalMs > 0) {
      this.throughputTimer = setInterval(() => { void this.runThroughput(); }, this.cfg.throughputIntervalMs);
    }
  }

  stop() {
    this.running = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.throughputTimer) clearInterval(this.throughputTimer);
    this.pingTimer = this.throughputTimer = null;
    window.removeEventListener('online', this.handleOnlineChange);
    window.removeEventListener('offline', this.handleOnlineChange);
  }

  private handleOnlineChange = () => { void this.sampleLatency(); };

  /** A lightweight latency/jitter/drop burst. Cheap enough to run frequently. */
  async sampleLatency(): Promise<NetworkSample> {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const conn = this.connInfo();

    let rtts: number[] = [];
    let fails = 0;
    if (online && !(typeof document !== 'undefined' && document.hidden)) {
      for (let i = 0; i < this.cfg.burstSize; i++) {
        const r = await probeOnce(this.cfg.pingUrl, this.cfg.timeoutMs);
        if (r == null) fails++; else rtts.push(r);
      }
    }
    const total = this.cfg.burstSize;
    const dropRate = online ? fails / total : 1;
    const rttMs = median(rtts);
    const jitterMs = stddev(rtts);

    const { level } = classify({ online, rttMs, jitterMs, dropRate, downMbps: this.lastDown });
    const sample: NetworkSample = {
      at: Date.now(), online, rttMs, jitterMs, dropRate,
      downMbps: this.lastDown, upMbps: this.lastUp,
      effectiveType: conn.effectiveType, saveData: conn.saveData, level,
    };
    this.emit(sample);
    return sample;
  }

  /** Heavier download/upload measurement. Opt-in; skipped on metered links. */
  async runThroughput(): Promise<NetworkSample | null> {
    if (this.busy) return null;
    if (!this.prefs.enabled || !this.prefs.throughputEnabled) return null;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
    if (typeof document !== 'undefined' && document.hidden) return null;
    const conn = this.connInfo();
    if (conn.metered) return null; // respect Save-Data / cellular

    this.busy = true;
    try {
      const down = this.cfg.downloadUrl ? await this.measureDownload() : null;
      if (down != null) this.lastDown = down;
      const up = this.cfg.uploadUrl && this.prefs.throughputEnabled ? await this.measureUpload() : null;
      if (up != null) this.lastUp = up;
      return await this.sampleLatency(); // re-classify with fresh throughput
    } finally {
      this.busy = false;
    }
  }

  private async measureDownload(): Promise<number | null> {
    const url = bust(`${this.cfg.downloadUrl}?bytes=${this.cfg.downloadBytes}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs * 4);
    const start = performance.now();
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const secs = (performance.now() - start) / 1000;
      if (secs <= 0 || buf.byteLength === 0) return null;
      return (buf.byteLength * 8) / (secs * 1e6); // Mbps
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async measureUpload(): Promise<number | null> {
    const bytes = this.cfg.uploadBytes;
    const payload = new Uint8Array(bytes);
    // Throwaway random bytes — never user content.
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      // getRandomValues caps at 65536 bytes per call.
      for (let off = 0; off < bytes; off += 65536) {
        crypto.getRandomValues(payload.subarray(off, Math.min(off + 65536, bytes)));
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs * 4);
    const start = performance.now();
    try {
      const res = await fetch(bust(this.cfg.uploadUrl!), {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'content-type': 'application/octet-stream' },
        body: payload,
      });
      if (!res.ok) return null;
      await res.arrayBuffer().catch(() => undefined);
      const secs = (performance.now() - start) / 1000;
      if (secs <= 0) return null;
      return (bytes * 8) / (secs * 1e6); // Mbps
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private emit(sample: NetworkSample) {
    const prev = this.lastSample;
    this.lastSample = sample;
    persistSummary(sample);
    this.listeners.forEach(fn => { try { fn(sample); } catch { /* listener error */ } });
    this.maybeNotifyDegradation(prev, sample);
  }

  private maybeNotifyDegradation(prev: NetworkSample | null, sample: NetworkSample) {
    if (!this.prefs.notify) return;
    const severity = levelToSeverity(sample.level);
    if (severity === 'none' || severity === 'info') {
      // Recovered to a healthy level — reset so the next dip can notify again.
      if (sample.level === 'good' || sample.level === 'fair') this.lastNotifiedLevel = null;
      return;
    }
    const prevRank = prev ? LEVEL_RANK[prev.level] : 0;
    const worsened = LEVEL_RANK[sample.level] > prevRank;
    const alreadyNotified = this.lastNotifiedLevel != null && LEVEL_RANK[sample.level] <= LEVEL_RANK[this.lastNotifiedLevel];
    const cooldownOk = Date.now() - this.lastNotifyAt > 60000; // at most once/min

    // Notify when we cross into (or deeper into) a bad level, respecting cooldown.
    if ((worsened || !alreadyNotified) && cooldownOk) {
      const { reason } = classify(sample);
      const event: DegradationEvent = {
        at: sample.at, level: sample.level, previousLevel: prev?.level ?? 'good',
        severity, reason, sample,
      };
      this.lastNotifyAt = Date.now();
      this.lastNotifiedLevel = sample.level;
      this.degradationListeners.forEach(fn => { try { fn(event); } catch { /* ignore */ } });
    }
  }
}

function persistSummary(sample: NetworkSample) {
  try {
    localStorage.setItem(SUMMARY_KEY, JSON.stringify({
      at: sample.at, level: sample.level, rttMs: sample.rttMs, downMbps: sample.downMbps, upMbps: sample.upMbps,
    }));
  } catch { /* storage blocked */ }
}

export function loadSummary(): Partial<NetworkSample> | null {
  try {
    const raw = localStorage.getItem(SUMMARY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// A lazily-created app-wide singleton so any surface can read live status.
let singleton: NetworkMonitor | null = null;
export function getNetworkMonitor(): NetworkMonitor {
  if (!singleton) singleton = new NetworkMonitor();
  return singleton;
}
