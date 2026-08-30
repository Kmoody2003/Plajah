// Volume ramps for media elements.
//
// Three components had grown their own copy of this loop (AlbumAdBillboard, HoverPreviewThumb,
// and the player's provider-internal fadeOutAudio, which is not exported and so could not be
// reused). Channel surfing needs one too, so it lives here once.
//
// Deliberately element-volume rather than a WebAudio gain node: these run on <video> elements
// that are NOT in the app's audio graph, and routing a live stream through WebAudio on a TV
// WebView risks the media-element-source problems the player already documents. `volume` is
// universally supported and cannot break playback.

/** Handle for a running ramp. Cancel on unmount / source change so a stale ramp can't fight a new one. */
export interface FadeHandle { cancel: () => void; }

const NOOP: FadeHandle = { cancel: () => {} };

/**
 * Ramp `el.volume` to `to` over `ms`, driven by rAF.
 *
 * rAF rather than setInterval so the ramp is frame-aligned and — importantly on a TV — pauses
 * with the tab instead of running a timer against a surface nobody is looking at.
 */
export function fadeVolume(
  el: HTMLMediaElement | null | undefined,
  to: number,
  ms: number,
  opts: { from?: number } = {},
): FadeHandle {
  if (!el || typeof window === 'undefined') return NOOP;
  const target = Math.max(0, Math.min(1, to));
  const start = Math.max(0, Math.min(1, opts.from ?? el.volume));
  if (ms <= 0 || start === target) {
    try { el.volume = target; } catch { /* detached element */ }
    return NOOP;
  }

  let raf = 0;
  let cancelled = false;
  const t0 = performance.now();
  try { el.volume = start; } catch { return NOOP; }

  const step = (now: number) => {
    if (cancelled) return;
    const p = Math.min(1, (now - t0) / ms);
    try { el.volume = start + (target - start) * p; } catch { return; }
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return { cancel: () => { cancelled = true; cancelAnimationFrame(raf); } };
}

/**
 * Start playback with sound, falling back to muted if the browser refuses.
 *
 * Autoplay policy is the reason live channels were muted in the first place. In the Capacitor
 * shells it does not apply — the bridge sets mediaPlaybackRequiresUserGesture(false) — but on
 * the web and other TV builds an unmuted play() can still be rejected. Every existing call site
 * did `play().catch(() => {})`, so a rejection left the channel silently black with no retry;
 * this keeps the picture in every case and gives up only the sound.
 *
 * Returns whether it ended up audible.
 */
export async function playAudible(el: HTMLMediaElement | null | undefined): Promise<boolean> {
  if (!el) return false;
  try {
    el.muted = false;
    await el.play();
    return true;
  } catch {
    try {
      el.muted = true;
      await el.play();
    } catch { /* nothing more to try — leave it to the caller's error UI */ }
    return false;
  }
}
