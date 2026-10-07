// mediaEngine/streamVideo.ts — one hidden, playing <video> per MediaStream, shared.
//
// The program compositor draws sources from video elements and the auto-director scores
// motion from them. Both need the same element for the same stream; creating one per
// consumer would decode every camera twice. Elements are ref-counted and released when the
// last consumer lets go.

interface Entry { el: HTMLVideoElement; refs: number }
const entries = new WeakMap<MediaStream, Entry>();

export function acquireStreamVideo(stream: MediaStream): HTMLVideoElement {
  let e = entries.get(stream);
  if (!e) {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    el.srcObject = stream;
    el.play().catch(() => {});
    e = { el, refs: 0 };
    entries.set(stream, e);
  }
  e.refs++;
  return e.el;
}

export function releaseStreamVideo(stream: MediaStream): void {
  const e = entries.get(stream);
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    e.el.pause();
    e.el.srcObject = null;
    entries.delete(stream);
  }
}

/** The element for a stream someone already holds, without taking a reference. */
export const peekStreamVideo = (stream: MediaStream): HTMLVideoElement | null => entries.get(stream)?.el ?? null;

/** True once the element has a decodable frame to draw. */
export const hasFrame = (el: HTMLVideoElement) => el.readyState >= 2 && el.videoWidth > 0;
