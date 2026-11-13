// stageSession — Stage (AmboProPresenter) as a background "show" that outlives
// navigation, plus the audio rule that goes with it.
//
// While any Stage output is carrying signal (a Program/output window or native
// display is open, or Party/Event mode is broadcasting), Stage is "in show":
//
//   • App keeps the presenter mounted (hidden) when the user navigates to
//     another part of Plajah, so the outputs keep running, and shows a Stage
//     button above the Aria button to jump straight back.
//   • Every media element that is NOT Stage's own is force-muted — the global
//     music player, side-pillar ads, feed videos, sfx, everything. Muting is
//     undone (back to each element's own intended `muted` value) the moment
//     Stage stops outputting.
//
// Stage-owned media is either created by Stage's services (they call
// `markStageMedia`) or lives inside a `[data-plajah-stage-root]` subtree.
//
// Kept dependency-free on purpose: services/ambo/* import it to mark their media.

export const STAGE_ROOT_ATTR = 'data-plajah-stage-root';

let outputting = false;
const listeners = new Set<() => void>();

export function isStageOutputting(): boolean { return outputting; }

export function subscribeStageSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The presenter reports whether any output is carrying signal. */
export function setStageOutputting(next: boolean): void {
  if (outputting === next) return;
  outputting = next;
  if (next) engage(); else release();
  for (const fn of listeners) { try { fn(); } catch { /* */ } }
}

/** True while Stage is mounted but hidden (user is elsewhere in Plajah). Stage's
 *  window-level keyboard shortcuts check this so they don't fire from other pages. */
let backgrounded = false;
export function setStageBackgrounded(v: boolean): void { backgrounded = v; }
export function isStageBackgrounded(): boolean { return backgrounded; }

// ── Exclusive audio ──────────────────────────────────────────────────────────

const stageOwned = new WeakSet<HTMLMediaElement>();

/** Exempt a media element from show-mode muting (Stage's own audio/video). */
export function markStageMedia<T extends HTMLMediaElement>(el: T): T {
  try { stageOwned.add(el); } catch { /* non-element stub */ }
  return el;
}

function isStageMedia(el: HTMLMediaElement): boolean {
  if (stageOwned.has(el)) return true;
  try { return !!el.closest?.(`[${STAGE_ROOT_ATTR}]`); } catch { return false; }
}

/** Elements we force-muted → the `muted` value their own code wants. */
const forced = new Map<HTMLMediaElement, boolean>();
/** Every element that has ever played (weakly held) — catches detached `new Audio()`. */
const seen = new Set<WeakRef<HTMLMediaElement>>();
const seenEls = new WeakSet<HTMLMediaElement>();
let mutedDesc: PropertyDescriptor | undefined;

function rawGet(el: HTMLMediaElement): boolean {
  return mutedDesc?.get ? !!mutedDesc.get.call(el) : el.muted;
}
function rawSet(el: HTMLMediaElement, v: boolean): void {
  if (mutedDesc?.set) mutedDesc.set.call(el, v); else el.muted = v;
}

function track(el: HTMLMediaElement): void {
  if (seenEls.has(el) || typeof WeakRef === 'undefined') return;
  seenEls.add(el);
  seen.add(new WeakRef(el));
  if (seen.size > 256) for (const r of seen) if (!r.deref()) seen.delete(r);
}

function enforce(el: HTMLMediaElement): void {
  if (isStageMedia(el)) return;
  try {
    if (!forced.has(el)) forced.set(el, rawGet(el));
    if (!rawGet(el)) rawSet(el, true);
  } catch { /* */ }
}

function engage(): void {
  if (typeof document === 'undefined') return;
  try { document.querySelectorAll('audio,video').forEach(n => enforce(n as HTMLMediaElement)); } catch { /* */ }
  for (const r of seen) {
    const el = r.deref();
    if (el) enforce(el); else seen.delete(r);
  }
}

function release(): void {
  for (const [el, intended] of forced) { try { rawSet(el, intended); } catch { /* */ } }
  forced.clear();
}

function install(): void {
  if (typeof window === 'undefined' || typeof HTMLMediaElement === 'undefined') return;
  const w = window as any;
  if (w.__plajahStageAudioGuard) return;
  w.__plajahStageAudioGuard = true;

  const proto = HTMLMediaElement.prototype;
  const origPlay = proto.play;
  proto.play = function (this: HTMLMediaElement) {
    track(this);
    if (outputting) enforce(this);
    return origPlay.call(this);
  };

  // While in show, code that un-mutes a forced element only updates the value we
  // restore later — it can't punch through the show.
  mutedDesc = Object.getOwnPropertyDescriptor(proto, 'muted');
  if (mutedDesc?.get && mutedDesc.set && mutedDesc.configurable) {
    const d = mutedDesc;
    Object.defineProperty(proto, 'muted', {
      configurable: true,
      enumerable: d.enumerable,
      get(this: HTMLMediaElement) { return d.get!.call(this); },
      set(this: HTMLMediaElement, v: boolean) {
        if (outputting && forced.has(this)) { forced.set(this, !!v); return; }
        d.set!.call(this, v);
      },
    });
  }

  // `autoplay` and in-DOM elements start without our play() wrapper.
  document.addEventListener('play', (e) => {
    const t = e.target;
    if (t instanceof HTMLMediaElement) { track(t); if (outputting) enforce(t); }
  }, true);
}

install();
