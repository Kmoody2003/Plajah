// djStreamBus — the thin link between the DJ Stream Studio and its pop-out windows.
//
// Two channels, mirroring the Ambo output pattern:
//   1. A BroadcastChannel carries lightweight PROGRAM STATE (now-playing, level,
//      scene, live flag) so a pop-out window can composite a reactive backdrop
//      itself — no frame is blitted window-to-window.
//   2. For the real Program video (webcam PiP over the visuals + audio), the
//      studio publishes its composited MediaStream on a same-origin global; a
//      pop-out Output window (opened from the studio) reads it off `window.opener`
//      and mirrors it in a <video>. Same-origin windows share globals, so this
//      needs no server and stays a single GPU surface per window.
//
// Controls windows postMessage scene/clip changes back through the same
// BroadcastChannel, so the studio and every window stay in lockstep.

export interface DjProgramState {
  nowPlaying: { title: string; artist: string; deck: 'A' | 'B' } | null;
  bpm: number;
  /** master output level 0..1, drives reactive visuals */
  level: number;
  /** active Pixels scene id */
  scene: string;
  /** webcam picture-in-picture is composited into program */
  camOn: boolean;
  live: boolean;
  ts: number;
}

export type DjBusMessage =
  | { kind: 'state'; state: DjProgramState }
  | { kind: 'scene'; scene: string }       // from a controls window → studio
  | { kind: 'clip'; clip: number }         // clip trigger from a controls window
  | { kind: 'hello' };                     // a window announcing itself

const CHANNEL = 'plajah-dj-program';
const STREAM_KEY = '__djProgramStream';

export const DJ_SCENES = ['warm', 'peak', 'strobe', 'chill'] as const;
export type DjScene = typeof DJ_SCENES[number];

export function createDjBus(): {
  post: (m: DjBusMessage) => void;
  subscribe: (fn: (m: DjBusMessage) => void) => () => void;
  close: () => void;
} {
  let bc: BroadcastChannel | null = null;
  try { bc = new BroadcastChannel(CHANNEL); } catch { bc = null; }
  const post = (m: DjBusMessage) => { try { bc?.postMessage(m); } catch { /* */ } };
  const subscribe = (fn: (m: DjBusMessage) => void) => {
    if (!bc) return () => {};
    const h = (e: MessageEvent) => fn(e.data as DjBusMessage);
    bc.addEventListener('message', h);
    return () => bc?.removeEventListener('message', h);
  };
  const close = () => { try { bc?.close(); } catch { /* */ } bc = null; };
  return { post, subscribe, close };
}

/** Publish the live program MediaStream so a same-origin pop-out can read it. */
export function publishProgramStream(stream: MediaStream | null): void {
  try { (window as any)[STREAM_KEY] = stream; } catch { /* */ }
}

/** From inside a pop-out Output window, grab the studio's program stream. */
export function readProgramStreamFromOpener(): MediaStream | null {
  try {
    const opener = window.opener as (Window & { [STREAM_KEY]?: MediaStream }) | null;
    return opener?.[STREAM_KEY] ?? null;
  } catch { return null; }
}

/** Open the Program Out in its own window (for a second screen / projector). */
export function openDjOutputWindow(): Window | null {
  const w = window.open(
    `${window.location.origin}/?djOut=1`,
    'plajah-dj-output',
    'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no',
  );
  return w;
}

/** Open the Pixels controls in their own window. */
export function openDjControlsWindow(): Window | null {
  const w = window.open(
    `${window.location.origin}/?djOut=controls`,
    'plajah-dj-controls',
    'width=420,height=620,menubar=no,toolbar=no,location=no,status=no',
  );
  return w;
}

export function djOutParam(): string | null {
  try { return new URLSearchParams(window.location.search).get('djOut'); } catch { return null; }
}

// ── Shared reactive-visual renderer ────────────────────────────────────────────
// The stand-in for the full Plajah Pixels engine: an audio-reactive gradient-blob
// field. Both the studio compositor and the pop-out Output window call this with
// the same (scene, level, time) so their backdrops match frame-for-frame. Swapping
// in the real Pixels engine later means replacing THIS function only.

const SCENE_PALETTES: Record<string, string[]> = {
  warm:   ['#6B0099', '#D40055', '#FF8C00'],
  peak:   ['#00DAF3', '#D40055', '#FF8C00'],
  strobe: ['#FFFFFF', '#00DAF3', '#D0BCFF'],
  chill:  ['#6B0099', '#00DAF3', '#D0BCFF'],
};

export function renderPixelsBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  scene: string, level: number, timeSec: number,
): void {
  const pal = SCENE_PALETTES[scene] ?? SCENE_PALETTES.warm;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, w, h);
  const strobe = scene === 'strobe';
  const beat = 0.6 + 0.4 * Math.sin(timeSec * 3.0);
  const energy = 0.35 + level * 0.9;
  const blobs = 3;
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < blobs; i++) {
    const p = (i / blobs) * Math.PI * 2;
    const cx = w * (0.5 + 0.32 * Math.sin(timeSec * 0.5 + p));
    const cy = h * (0.5 + 0.30 * Math.cos(timeSec * 0.4 + p * 1.3));
    const r = Math.min(w, h) * (0.22 + 0.18 * energy) * (strobe ? beat : 1);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const col = pal[i % pal.length];
    g.addColorStop(0, col + 'cc');
    g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  if (strobe && beat > 0.9) {
    ctx.fillStyle = 'rgba(255,255,255,' + ((beat - 0.9) * 3).toFixed(2) + ')';
    ctx.fillRect(0, 0, w, h);
  }
}
