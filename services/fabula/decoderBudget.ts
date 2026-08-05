// decoderBudget — a global cap on how many hardware video decoders are live at once.
//
// Browsers cap concurrent <video>/VideoDecoder instances (~75 in Chrome, fewer elsewhere); blow past
// it and the tab crashes. That's exactly what took down the Fabula media pool (thousands of thumbnail
// <video> elements). The fix there was lazy mounting; this generalises the lesson into ONE accountant
// the whole app shares, so no single surface — pool thumbnails, the media warmer, the compositor's
// decode sources — can exhaust the budget on its own.
//
// Usage: call acquire() before mounting a decoder-backed element; if it returns false, don't mount
// (show a placeholder). Call the returned release() on unmount. Subscribers can react to pressure.

const MAX = (() => {
  // A conservative fraction of the browser's real ceiling, shared across every surface. Scale down a
  // touch on low-core devices (a rough proxy for weaker media pipelines).
  const cores = (typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) || 8;
  return cores <= 4 ? 24 : 48;
})();

let live = 0;
let listeners: Array<(n: number) => void> = [];
const notify = () => { for (const l of listeners) { try { l(live); } catch { /* */ } } };

/** True if a decoder can be mounted right now. */
export function canDecode(): boolean { return live < MAX; }

/** Reserve a decoder slot. Returns a release fn, or null if the budget is exhausted (don't mount). */
export function acquire(): (() => void) | null {
  if (live >= MAX) return null;
  live++;
  notify();
  let released = false;
  return () => { if (released) return; released = true; live = Math.max(0, live - 1); notify(); };
}

export function liveDecoders(): number { return live; }
export function decoderCap(): number { return MAX; }

/** Subscribe to live-count changes (e.g. to lazily release off-screen decoders under pressure). */
export function onDecoderPressure(cb: (n: number) => void): () => void {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}
