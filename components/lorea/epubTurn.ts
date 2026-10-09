// EPUB page turns.
//
// EPUB pages are produced by epub.js inside a cross-document iframe, re-flowed on demand. There is no cheap, faithful
// snapshot of the outgoing page (cloning the iframe reloads it, rasterising it needs html2canvas-class tooling and
// loses fonts/images), so a true curl or flip is NOT possible there. What we do instead, on the live reader surface:
//   exit  -> the old page leaves (slide / fade / zoom / wipe / iris, chosen by epubTurnKind)
//   navigate (rendition.next / prev)
//   enter -> the new page arrives with the mirror motion.
// Curl, flip, cube, card flip and cover therefore degrade to a directional slide-and-fade here. RTL and back are honoured.

import { epubTurnKind, getSpec, travelDirection, type PageTurnDir, type ResolvedPageTurn } from '../../services/lorea/pageTransitions';

export interface EpubTurnOpts {
  el: HTMLElement | null;
  turn: ResolvedPageTurn;
  dir: PageTurnDir;
  rtl: boolean;
  /** Calls rendition.next()/prev(). */
  navigate: () => void;
  /** Resolves when epub.js reports the new location (or after a timeout). */
  relocated: () => Promise<void>;
}

const MAX_MS = 360;

function frames(kind: ReturnType<typeof epubTurnKind>, phase: 'exit' | 'enter', leaves: 'left' | 'right'): Keyframe[] | null {
  const sign = leaves === 'left' ? -1 : 1;
  const hidden = phase === 'exit';
  const pair = (a: Keyframe, b: Keyframe): Keyframe[] => (hidden ? [a, b] : [b, a]);
  switch (kind) {
    case 'slide': return pair({ transform: 'translate3d(0,0,0)', opacity: 1 }, { transform: `translate3d(${sign * 34}px,0,0)`, opacity: 0 });
    case 'dissolve': return pair({ opacity: 1 }, { opacity: 0 });
    case 'zoom': return pair({ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.07)', opacity: 0 });
    case 'wipe': return pair({ clipPath: 'inset(0 0 0 0)' }, { clipPath: leaves === 'left' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)' });
    case 'iris': return pair({ clipPath: 'circle(150% at 50% 50%)' }, { clipPath: `circle(0% at ${leaves === 'left' ? 12 : 88}% 50%)` });
    default: return null;
  }
}

/** Plays exit, navigation, enter. Always calls navigate() exactly once, even if animation is unavailable. */
export async function runEpubTurn(o: EpubTurnOpts): Promise<void> {
  const kind = epubTurnKind(o.turn.id);
  const total = Math.min(MAX_MS, o.turn.durationMs || getSpec(o.turn.id).durationMs);
  const el = o.el;
  if (kind === 'none' || !el || typeof el.animate !== 'function' || total <= 0 || (typeof document !== 'undefined' && document.hidden)) { o.navigate(); return; }
  const leaves = travelDirection(o.dir, o.rtl);
  const opts = (ms: number, easing: string): KeyframeAnimationOptions => ({ duration: Math.max(40, ms), easing, fill: 'both' });
  let exit: Animation | null = null;
  try {
    const k = frames(kind, 'exit', leaves);
    if (k) { exit = el.animate(k, opts(total * 0.4, 'cubic-bezier(.4,0,1,1)')); await exit.finished; }
  } catch { /* cancelled */ }
  const arrived = o.relocated();
  o.navigate();
  await arrived;
  try {
    // The new page arrives from the opposite side, so the motion reads as one continuous turn.
    const k = frames(kind, 'enter', leaves === 'left' ? 'right' : 'left');
    exit?.cancel();
    if (k) {
      const enter = el.animate(k, opts(total * 0.6, 'cubic-bezier(0,0,.2,1)'));
      await enter.finished; enter.cancel();
    }
  } catch { /* cancelled */ }
  exit?.cancel();
}
