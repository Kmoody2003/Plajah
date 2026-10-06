// liveCaptionStore — the rolling live transcript, mirrored into every window.
//
// The studio window owns the microphone/transcriber (liveLyrics); output windows
// and template thumbnails only need the current words. The studio publishes over
// a BroadcastChannel; every window that imports this module mirrors the latest.
export interface CaptionState { lines: string[]; at: number; live: boolean }

const CH = 'ambo-live-caption-v1';
let cur: CaptionState = { lines: [], at: 0, live: false };
const subs = new Set<() => void>();
let ch: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    ch = new BroadcastChannel(CH);
    (ch as unknown as { unref?: () => void }).unref?.();   // node (tests): don't hold the process open
    ch.onmessage = e => { if (e.data && Array.isArray(e.data.lines)) { cur = e.data; subs.forEach(fn => { try { fn(); } catch { /* */ } }); } };
  }
} catch { /* */ }

export const getCaption = () => cur;
export const subscribeCaption = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

export function publishCaption(lines: string[], live: boolean): void {
  cur = { lines, at: Date.now(), live };
  try { ch?.postMessage(cur); } catch { /* */ }
  subs.forEach(fn => { try { fn(); } catch { /* */ } });
}
