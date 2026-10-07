// mediaEngine/frameClock.ts — a render/decision clock that keeps ticking in a hidden window.
//
// requestAnimationFrame stops entirely when a tab is hidden or minimised, and main-thread
// timers get throttled to ~1 Hz. A live program output can't do either: the stream and the
// recording would freeze. A dedicated Worker's timers are not subject to background
// throttling, so the worker posts ticks and the main thread draws on them.

export interface FrameClock { stop(): void }

const WORKER_SRC = `let t=0;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}`;

export function createFrameClock(fps: number, onTick: () => void): FrameClock {
  const interval = Math.max(4, Math.round(1000 / Math.max(1, fps)));
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => onTick();
    worker.postMessage(interval);
    return { stop: () => { worker.postMessage(0); worker.terminate(); } };
  } catch {
    // CSP or no Worker support — fall back to a plain timer (throttled when hidden).
    const t = window.setInterval(onTick, interval);
    return { stop: () => window.clearInterval(t) };
  }
}
