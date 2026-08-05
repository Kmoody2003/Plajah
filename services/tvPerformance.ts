/**
 * tvPerformance — a *measured* performance tier for the current device.
 *
 * WHY THIS EXISTS
 * The app leans on genuinely expensive compositing: the fixed #universal-background layer
 * (looping 4K video behind a `blur-[40px]` + a full-viewport `backdrop-blur-[100px]` frost),
 * NebulaBackground/NebulaVisualizer canvases, and `backdrop-filter` on most chrome. On a
 * desktop GPU that is free. On a $30 stick that shares one small GPU with a 4K video decode
 * it turns the whole UI into a slideshow.
 *
 * The obvious fix — "if isTV, turn effects off" — is wrong: an Apple TV 4K, a Fire TV Cube,
 * an Xbox/PS5 browser, an Nvidia Shield, or a gaming PC plugged into a living-room TV all
 * report as big-screen/leanback and all comfortably run everything. The equally obvious
 * fix — a device allowlist — is worse: it is a guess, it goes stale the moment a new box
 * ships, and every one of those signals comes from a user-agent string that anything can
 * spoof.
 *
 * So we measure. We watch real frame timing for ~700ms while forcing a little compositing
 * work, and let the device tell us what it can do. Hardware hints (deviceMemory, cores)
 * only corroborate; they never decide on their own. Nothing here is an allowlist.
 *
 * DESIGN CONSTRAINTS (all deliberate)
 *  - The probe must never make startup janky: it runs off the critical path (idle callback
 *    after first paint), lasts under a second, and never blocks render.
 *  - The verdict is cached per-device in localStorage, so this costs one measurement per
 *    device install, not one per launch.
 *  - Before the measurement lands we return a *provisional* tier that is conservative on TV
 *    and permissive on desktop. Rendering heavy effects and then yanking them away half a
 *    second later reads as a bug; starting plain and quietly upgrading does not.
 *  - The classification core (`classifyPerf`) is pure and browser-free so it can be tested.
 */

import { getPlatformInfo } from '../hooks/usePlatform';

export type PerfTier = 'high' | 'medium' | 'low';

/** Bump when thresholds or the probe change — invalidates every cached verdict. */
const TIER_VERSION = 1;
const CACHE_KEY = 'plajah:perfTier';
/** Manual override for QA: localStorage `plajah:perfTier:override` = 'high'|'medium'|'low', or `?perf=low`. */
const OVERRIDE_KEY = 'plajah:perfTier:override';

// ─────────────────────────────────────────────────────────────────────────────
// PURE CORE — no browser globals below this line until the marked section.
// Kept separate so the thresholds can be exercised against synthetic traces.
// ─────────────────────────────────────────────────────────────────────────────

export interface PerfSample {
  /** Inter-frame deltas in ms, in order. Warm-up frames should already be trimmed. */
  frameTimes: number[];
  /** navigator.deviceMemory (GB). Undefined on Safari/Firefox — treat as unknown, not as low. */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency. Undefined on locked-down WebViews. */
  hardwareConcurrency?: number;
  /** TV/leanback devices get stricter thresholds — see classifyPerf. */
  isTV?: boolean;
  /** prefers-reduced-motion: user intent outranks capability. */
  reducedMotion?: boolean;
}

export interface PerfVerdict {
  tier: PerfTier;
  medianMs: number;
  p95Ms: number;
  /** Fraction of frames slower than 24ms (i.e. missed a 40fps budget). */
  jankRatio: number;
  /** Big visible hitches per second of wall clock. See classifyPerf for the definition. */
  hitchesPerSec: number;
  /** Human-readable trail of every rule that fired. Surfaced in diagnostics. */
  reasons: string[];
}

/** Nearest-rank percentile. `p` in 0..1. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

/**
 * Classify a frame-timing trace into a tier.
 *
 * Why median AND p95 rather than mean: a mean hides the exact failure we care about. A box
 * that renders 55 frames at a clean 16.7ms and then blocks for 200ms has a fine mean and a
 * terrible feel. Median tells us the steady-state budget; p95 tells us how bad the bad
 * frames are. A device only reads 'high' if it is both fast *and* steady.
 */
export function classifyPerf(s: PerfSample): PerfVerdict {
  const reasons: string[] = [];
  const frames = s.frameTimes.filter((f) => Number.isFinite(f) && f > 0);

  // Not enough signal to judge. Fall back to the provisional posture rather than guessing —
  // a 5-frame sample on a backgrounded tab would otherwise condemn a capable device.
  if (frames.length < 20) {
    reasons.push(`insufficient-samples(${frames.length})`);
    return { tier: s.isTV ? 'medium' : 'high', medianMs: 0, p95Ms: 0, jankRatio: 0, hitchesPerSec: 0, reasons };
  }

  const sorted = [...frames].sort((a, b) => a - b);
  const medianMs = percentile(sorted, 0.5);
  const p95Ms = percentile(sorted, 0.95);
  const jankRatio = frames.filter((f) => f > 24).length / frames.length;

  // p95 alone is blind to a small number of large hitches: over a ~45-frame sample, two 55ms
  // stalls sit at the 96th/98th percentile and never show up in p95 at all — yet two stalls
  // inside one second is exactly the "mostly 60 but visibly stuttering" case we must catch.
  // So count hitches directly, rated per second of wall clock rather than per frame.
  // A hitch is relative to the device's own median (2.5x) with a 50ms floor, so a device that
  // is *uniformly* slow (a steady 15fps) is judged by its median, not miscounted as hitching.
  const hitchFloor = Math.max(50, medianMs * 2.5);
  const totalMs = frames.reduce((a, b) => a + b, 0);
  const hitchesPerSec = totalMs > 0 ? (frames.filter((f) => f > hitchFloor).length / totalMs) * 1000 : 0;

  // TVs need more headroom than the numbers suggest. The probe measures the UI alone; in
  // real use the same GPU is also decoding a 4K background video, so a TV sitting right on
  // the 60fps line has nothing left. Desktops have that slack, TV sticks do not.
  const highCeiling = s.isTV ? 17.5 : 18.5;
  // ~34.5ms deliberately sits just past the 33.3ms mark so a display genuinely locked to
  // 30Hz (common in TV WebViews — the compositor caps rAF regardless of GPU headroom) is
  // read as a refresh cap, not as a struggling device. See the steadiness check below.
  const mediumCeiling = 34.5;

  let tier: PerfTier;
  if (medianMs <= highCeiling) { tier = 'high'; reasons.push(`median ${medianMs.toFixed(1)}ms <= ${highCeiling}`); }
  else if (medianMs <= mediumCeiling) { tier = 'medium'; reasons.push(`median ${medianMs.toFixed(1)}ms <= ${mediumCeiling}`); }
  else { tier = 'low'; reasons.push(`median ${medianMs.toFixed(1)}ms > ${mediumCeiling}`); }

  // ── Steadiness gates. These only ever demote. ──────────────────────────────
  // Severe: frequent, large hitches. Whatever the median says, this device visibly stutters
  // and must not run a video background.
  if (p95Ms > 60 && jankRatio > 0.15) {
    tier = 'low';
    reasons.push(`severe-stutter p95=${p95Ms.toFixed(1)}ms jank=${(jankRatio * 100).toFixed(0)}%`);
  }
  // Moderate: occasional hitches, or a long tail far above the median. Costs one step.
  // `hitchesPerSec > 1` = at least one visible stall per second, which no amount of good
  // median makes acceptable behind a video background.
  else if (p95Ms > 40 || jankRatio > 0.08 || hitchesPerSec > 1 || (p95Ms > 32 && p95Ms > medianMs * 3)) {
    if (tier === 'high') {
      tier = 'medium';
      reasons.push(`unsteady p95=${p95Ms.toFixed(1)}ms jank=${(jankRatio * 100).toFixed(0)}% hitches=${hitchesPerSec.toFixed(1)}/s — demoted from high`);
    } else if (tier === 'medium' && p95Ms > 80) {
      tier = 'low';
      reasons.push(`unsteady p95=${p95Ms.toFixed(1)}ms on an already-slow median — demoted to low`);
    }
  }

  // ── Corroborating hardware hints. HINTS ONLY — they may demote a borderline verdict but
  // never promote one, and are never consulted in isolation. Both are absent on plenty of
  // capable browsers, so `undefined` must read as "unknown", never as "weak".
  const mem = s.deviceMemory;
  const cores = s.hardwareConcurrency;
  if (typeof mem === 'number' && mem <= 1 && tier !== 'low') {
    tier = 'low';
    reasons.push(`deviceMemory=${mem}GB — cannot hold a decoded 4K background frame`);
  } else if (tier === 'high' && ((typeof mem === 'number' && mem <= 2) || (typeof cores === 'number' && cores <= 2))) {
    // A device that benchmarked 'high' on 2GB/2 cores measured well on an empty page but has
    // no room for the app's real working set. Step down rather than trust the probe alone.
    tier = 'medium';
    reasons.push(`thin hardware (mem=${mem ?? '?'}GB cores=${cores ?? '?'}) — capped at medium`);
  }

  // Reduced-motion is recorded but does NOT move the tier. It is an accessibility preference
  // about ANIMATION, not a statement about the hardware — effectAllowed() already switches off
  // exactly the motion-bearing effects and deliberately keeps the static ones. Folding it into
  // the tier as well applied the penalty twice and stripped blur, shadows and the custom
  // background from fast machines, which is not what the viewer asked for.
  if (s.reducedMotion) reasons.push('prefers-reduced-motion (motion effects only)');

  return { tier, medianMs, p95Ms, jankRatio, hitchesPerSec, reasons };
}

/**
 * Which effects each tier can afford, and why.
 *  - customBackground: looping video/photo behind a 40px blur + 100px backdrop frost. By far
 *    the most expensive thing the app draws. 'high' only.
 *  - visualizer: a per-frame canvas driven by an AudioContext analyser. 'high' only.
 *  - parallax / motion backdrops: cheap on paper, but they force a full-viewport repaint.
 *  - blur (backdrop-filter): pervasive in the chrome, and the single worst offender on TV
 *    compositors — a mid-tier TV keeps it off while a mid-tier laptop keeps it on.
 *  - shadows: cheapest of the set; only 'low' loses them.
 */
export type PerfEffect = 'customBackground' | 'blur' | 'visualizer' | 'parallax' | 'shadows';

export function effectAllowed(effect: PerfEffect, tier: PerfTier, isTV: boolean, reducedMotion = false): boolean {
  // Motion-bearing effects are off whenever the user asked for reduced motion, regardless of
  // how fast the device is. blur/shadows are static, so they stay.
  if (reducedMotion && (effect === 'customBackground' || effect === 'visualizer' || effect === 'parallax')) return false;

  switch (effect) {
    case 'customBackground':
    case 'visualizer':
      return tier === 'high';
    case 'parallax':
      return tier === 'high' || (tier === 'medium' && !isTV);
    case 'blur':
      return tier === 'high' || (tier === 'medium' && !isTV);
    case 'shadows':
      return tier !== 'low';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER LAYER — everything below feature-detects and degrades to a safe default.
// ─────────────────────────────────────────────────────────────────────────────

const hasWindow = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/** FNV-1a. Fingerprints the device so a cached verdict does not follow a UA/screen change. */
function hash32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function deviceFingerprint(): string {
  if (!hasWindow()) return 'ssr';
  const nav = navigator as Navigator & { deviceMemory?: number };
  return hash32([
    navigator.userAgent,
    screen.width, screen.height,
    window.devicePixelRatio,
    nav.deviceMemory ?? '?',
    navigator.hardwareConcurrency ?? '?',
  ].join('|'));
}

function readReducedMotion(): boolean {
  if (!hasWindow() || typeof matchMedia !== 'function') return false;
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** TV state comes from the one detector that owns it — never re-derived here, so this tier
 *  system can never disagree with what the rest of the app thinks the device is.
 *  getPlatformInfo() is usePlatform's synchronous non-React accessor and caches internally. */
function readIsTV(): boolean {
  if (!hasWindow()) return false;
  try { return getPlatformInfo().isTV; } catch { return false; }
}

function readOverride(): PerfTier | null {
  if (!hasWindow()) return null;
  try {
    const q = new URLSearchParams(window.location.search).get('perf');
    const raw = q || localStorage.getItem(OVERRIDE_KEY);
    return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : null;
  } catch { return null; }
}

interface CachedVerdict { v: number; fp: string; tier: PerfTier; medianMs: number; p95Ms: number; at: number; }

function readCache(): CachedVerdict | null {
  if (!hasWindow()) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedVerdict;
    // A version bump or a device change (new UA, external display, resolution switch)
    // invalidates the verdict — a laptop docked to a 4K TV is a different machine.
    if (parsed.v !== TIER_VERSION || parsed.fp !== deviceFingerprint()) return null;
    if (parsed.tier !== 'high' && parsed.tier !== 'medium' && parsed.tier !== 'low') return null;
    return parsed;
  } catch { return null; }
}

function writeCache(verdict: PerfVerdict) {
  if (!hasWindow()) return;
  try {
    const payload: CachedVerdict = {
      v: TIER_VERSION, fp: deviceFingerprint(), tier: verdict.tier,
      medianMs: verdict.medianMs, p95Ms: verdict.p95Ms, at: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch { /* private mode / quota — just re-measure next launch */ }
}

/** Discard the cached verdict so the next measurePerfTier() actually re-benchmarks. */
export function clearPerfTierCache(): void {
  if (!hasWindow()) return;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  current = null;
  lastVerdict = null;
}

// ── Live state ───────────────────────────────────────────────────────────────
let current: PerfTier | null = null;
let lastVerdict: PerfVerdict | null = null;
let inFlight: Promise<PerfTier> | null = null;
const listeners = new Set<(t: PerfTier) => void>();

/**
 * The value used before (or instead of) a measurement.
 * Conservative on TV, permissive elsewhere. Getting this backwards is the visible failure
 * mode: a TV that paints a video background for 700ms and then drops it looks broken, while
 * a desktop that starts flat and stays flat for 700ms just looks cheap for 700ms.
 */
function provisionalTier(): PerfTier {
  // Reduced-motion deliberately does NOT force 'low' here either — see classifyPerf. It is
  // handled per-effect, so a fast machine keeps its static quality while its animation stops.
  return readIsTV() ? 'medium' : 'high';
}

/**
 * Synchronous, always-safe accessor. Returns, in order: an explicit override, the cached
 * verdict, the verdict from this session's measurement, or the provisional value.
 * Never triggers work and never throws — call it from render.
 */
export function getPerfTier(): PerfTier {
  const override = readOverride();
  if (override) return override;
  if (current) return current;
  const cached = readCache();
  if (cached) { current = cached.tier; return cached.tier; }
  return provisionalTier();
}

/** Last full verdict (timings + the rules that fired). Null until a measurement runs. */
export function getPerfVerdict(): PerfVerdict | null { return lastVerdict; }

/** Subscribe to tier changes so UI can re-render when the measurement lands. Returns an unsubscribe. */
export function subscribePerfTier(cb: (tier: PerfTier) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function publish(tier: PerfTier) {
  const changed = current !== tier;
  current = tier;
  if (changed) listeners.forEach((cb) => { try { cb(tier); } catch { /* a bad listener must not break the rest */ } });
}

/**
 * A deliberately small compositing load, so the probe measures the device under work rather
 * than measuring an idle page (an idle page reports a perfect 16.7ms on hardware that cannot
 * actually composite anything). One fixed layer with a backdrop blur and a transform we
 * mutate each frame — the exact combination the real background layer uses.
 *
 * It is 2% opaque and pointer-events:none, so it is imperceptible but not `opacity:0`
 * (browsers are free to skip painting fully transparent content, which would defeat the
 * point). It is removed the instant the probe finishes.
 */
function mountProbeLayer(): { tick: (t: number) => void; dispose: () => void } {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'width:60vw', 'height:50vh',
    'pointer-events:none', 'opacity:0.02', 'z-index:2147483000',
    'backdrop-filter:blur(24px)', '-webkit-backdrop-filter:blur(24px)',
    'background:rgba(255,255,255,0.05)', 'will-change:transform', 'contain:strict',
  ].join(';');
  document.body.appendChild(el);
  return {
    tick: (t: number) => { el.style.transform = `translate3d(${(t / 24) % 40}px,0,0) scale(1.02)`; },
    dispose: () => { try { el.remove(); } catch { /* already gone */ } },
  };
}

export interface MeasureOptions {
  /** How long to sample, in ms. Default 700 — long enough for ~40 frames at 60fps. */
  durationMs?: number;
  /** Re-measure even if a valid cached verdict exists. */
  force?: boolean;
  /** Mount the compositing probe layer. Default true; set false to sample the page as-is. */
  probe?: boolean;
  /** Wait for an idle slot after first paint before sampling. Default true. */
  deferToIdle?: boolean;
}

function whenIdle(deferToIdle: boolean): Promise<void> {
  if (!deferToIdle) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const once = () => { if (!done) { done = true; resolve(); } };
    const go = () => {
      const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: any) => number);
      // The timeout bound matters: on a busy TV boot, idle may never arrive on its own and
      // we would silently never measure, leaving the device pinned to its provisional tier.
      if (ric) ric(once, { timeout: 3000 });
      else setTimeout(once, 400);
    };
    // Two rAFs = after first paint. Sampling before first paint would measure the initial
    // layout burst, not steady-state rendering.
    requestAnimationFrame(() => requestAnimationFrame(go));
    // ...but rAF itself is not guaranteed to fire. A hidden tab, or a TV that suspends its
    // compositor, never runs the callback, so `go` is never reached and the promise hangs —
    // measurement never completes and the device stays provisional for the whole session.
    // Observed in practice: measurePerfTier() failed to settle in a backgrounded tab.
    setTimeout(once, 4000);
  });
}

/**
 * Sample real frame deltas and classify. Resolves with the resulting tier; also caches it,
 * updates getPerfTier(), and notifies subscribers. Safe to call more than once — concurrent
 * calls share one measurement.
 */
export async function measurePerfTier(opts: MeasureOptions = {}): Promise<PerfTier> {
  const { durationMs = 700, force = false, probe = true, deferToIdle = true } = opts;

  if (!hasWindow()) return 'high'; // SSR/tests: never gate on a measurement we cannot take.

  const override = readOverride();
  if (override) { publish(override); return override; }

  if (!force) {
    const cached = readCache();
    if (cached) { publish(cached.tier); return cached.tier; }
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      await whenIdle(deferToIdle);

      const reducedMotion = readReducedMotion();
      // Respecting reduced-motion also means not animating a probe layer at them.
      const useProbe = probe && !reducedMotion;

      const frameTimes = await sampleFrames(durationMs, useProbe);

      const nav = navigator as Navigator & { deviceMemory?: number };
      const verdict = classifyPerf({
        frameTimes,
        deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
        hardwareConcurrency: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : undefined,
        isTV: readIsTV(),
        reducedMotion,
      });

      // Battery is a soft, late signal — a plugged-in TV/console is never on battery, so a
      // discharging low battery is only meaningful on laptops/tablets. It can cost one step,
      // never more, and only if the API actually exists.
      const battery = await readBattery();
      if (battery && !battery.charging && battery.level <= 0.2 && verdict.tier === 'high') {
        verdict.tier = 'medium';
        verdict.reasons.push(`battery ${(battery.level * 100).toFixed(0)}% discharging — capped at medium`);
      }

      lastVerdict = verdict;
      writeCache(verdict);
      publish(verdict.tier);
      return verdict.tier;
    } catch {
      // Any failure keeps the provisional posture rather than guessing high.
      const fallback = provisionalTier();
      publish(fallback);
      return fallback;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

async function readBattery(): Promise<{ charging: boolean; level: number } | null> {
  try {
    const getBattery = (navigator as any).getBattery;
    if (typeof getBattery !== 'function') return null; // Safari/Firefox: absent by design.
    const b = await getBattery.call(navigator);
    if (!b || typeof b.level !== 'number') return null;
    return { charging: !!b.charging, level: b.level };
  } catch { return null; }
}

/** Collects rAF deltas for `durationMs`, trimming warm-up frames. Never blocks. */
function sampleFrames(durationMs: number, useProbe: boolean): Promise<number[]> {
  return new Promise((resolve) => {
    const layer = useProbe ? mountProbeLayer() : null;
    const deltas: number[] = [];
    let last = performance.now();
    const start = last;
    // Hard stop even if rAF stalls entirely (backgrounded tab, suspended compositor) —
    // otherwise the promise would never settle and the tier would stay provisional forever.
    const bail = setTimeout(() => finish(), durationMs + 2000);

    const finish = () => {
      clearTimeout(bail);
      layer?.dispose();
      // Drop the first 3 frames: they include the probe layer's first paint and the
      // browser's own scheduling ramp, which are not representative of steady state.
      resolve(deltas.slice(3));
    };

    const step = (t: number) => {
      deltas.push(t - last);
      last = t;
      layer?.tick(t);
      if (t - start >= durationMs) { finish(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/**
 * THE single place the UI asks "can I afford this here". Cheap and synchronous — call it
 * inline in render. Keeping every effect decision behind this one function is the point:
 * when the thresholds change, nothing scattered across components has to change with them.
 */
export function shouldEnableEffect(effect: PerfEffect): boolean {
  return effectAllowed(effect, getPerfTier(), readIsTV(), readReducedMotion());
}

/** Diagnostics for the console / bug reports: `getPerfDiagnostics()`. */
export function getPerfDiagnostics() {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  return {
    tier: getPerfTier(),
    provisional: !current && !readCache(),
    override: readOverride(),
    verdict: lastVerdict,
    cached: readCache(),
    isTV: readIsTV(),
    reducedMotion: readReducedMotion(),
    deviceMemory: nav?.deviceMemory,
    hardwareConcurrency: nav?.hardwareConcurrency,
    effects: {
      customBackground: shouldEnableEffect('customBackground'),
      blur: shouldEnableEffect('blur'),
      visualizer: shouldEnableEffect('visualizer'),
      parallax: shouldEnableEffect('parallax'),
      shadows: shouldEnableEffect('shadows'),
    },
  };
}

// Expose on window for on-device debugging — the same pattern usePlatform uses for
// getPlatformInfo(). A real TV has no devtools; this is how you find out what it decided.
if (hasWindow()) {
  (window as any).plajahPerf = { getPerfTier, measurePerfTier, clearPerfTierCache, getPerfDiagnostics, shouldEnableEffect };
}
