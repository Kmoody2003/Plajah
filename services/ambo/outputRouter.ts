// outputRouter — unlimited outputs, limited only by the machine.
//
// Built on the architecture Plajah Pixels already proved in ProgramOutView:
// each output is a SEPARATE browser window that subscribes to a BroadcastChannel
// and renders the shared live stack itself. No canvas is copied between windows,
// so adding an output costs a window, not a frame-blit — which is why the ceiling
// is the GPU and the display bus rather than anything in this file.
//
// Each output decides FOR ITSELF which layers it shows. That is what makes the
// same show drive, simultaneously:
//   · auditorium screens      — everything
//   · a broadcast key         — slide + props only, transparent background
//   · stage display           — text + timers + the speaker's notes, never props
//   · a lobby loop            — background only
//   · a kids room             — same slides, different text resolution
//
// `getScreenDetails()` (Window Management API) places a window on a specific
// physical screen when the browser allows it; without permission the window
// still opens and the operator drags it, which is how every projector has been
// set up since 1998.

import type { LayerSlot, LiveStack, MaskSpec, TransformSpec } from './showModel';
import { LAYER_ORDER } from './showModel';

export const AMBO_CHANNEL = 'ambo-output-v1';

export type OutputKind =
  | 'PROGRAM'   // the main screens
  | 'KEY'       // alpha-keyed fill for the switcher
  | 'STAGE'     // confidence monitor
  | 'AUX'       // overflow, lobby, cry room
  | 'LOOP'      // pre-service loop only
  | 'STREAM';   // what the broadcast sees

/** Sensible layer sets per kind — the operator can override any of them. */
export const DEFAULT_LAYERS: Record<OutputKind, LayerSlot[]> = {
  PROGRAM: ['background', 'fill', 'slide', 'scripture', 'prop', 'overlay', 'mask'],
  // A key must NOT carry the background, or it keys a filled rectangle.
  KEY: ['slide', 'scripture', 'prop', 'overlay'],
  // Props are for the congregation; the speaker gets text and timers.
  STAGE: ['slide', 'scripture', 'overlay'],
  AUX: ['background', 'fill', 'slide', 'scripture', 'prop', 'mask'],
  LOOP: ['background', 'fill'],
  STREAM: ['background', 'fill', 'slide', 'scripture', 'prop', 'overlay', 'mask'],
};

export interface AmboOutput {
  id: string;
  name: string;
  kind: OutputKind;
  /** Layers this output composites. Defaults from DEFAULT_LAYERS. */
  layers: LayerSlot[];
  /** Transparent background so a switcher can key it. */
  alpha?: boolean;
  /** Per-output geometry — warp, keystone, blend zone. */
  transform?: TransformSpec;
  /** Per-output mask, on top of any slide mask. */
  mask?: MaskSpec;
  /** Physical screen index from getScreenDetails(), when granted. */
  screenIndex?: number;
  /** Resolution the output renders at. Defaults to the screen's. */
  width?: number;
  height?: number;
  /** Stage-display extras. */
  showStageNotes?: boolean;
  showNextSlide?: boolean;
  showClock?: boolean;
  /** Per-output scripture translation — the kids room gets a paraphrase. */
  translation?: string;
  enabled: boolean;
}

export function makeOutput(kind: OutputKind, name: string, over: Partial<AmboOutput> = {}): AmboOutput {
  return {
    id: over.id ?? `out_${kind.toLowerCase()}_${Math.abs(hash(name + kind))}`,
    name,
    kind,
    layers: over.layers ?? [...DEFAULT_LAYERS[kind]],
    alpha: over.alpha ?? kind === 'KEY',
    showStageNotes: over.showStageNotes ?? kind === 'STAGE',
    showNextSlide: over.showNextSlide ?? kind === 'STAGE',
    showClock: over.showClock ?? kind === 'STAGE',
    enabled: over.enabled ?? true,
    ...over,
  };
}

/** Stable id from a name, so reopening an output reuses its window. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}

/**
 * What one output should composite, given the live stack. Pure — the same
 * function runs in the studio window (for previews) and in every output window.
 */
export function stackForOutput(stack: LiveStack, output: AmboOutput): LiveStack {
  const allow = new Set(output.layers);
  const out: LiveStack = {};
  for (const slot of LAYER_ORDER) {
    if (!allow.has(slot)) continue;
    const layer = stack[slot];
    if (layer) out[slot] = layer;
  }
  return out;
}

// ── The wire ─────────────────────────────────────────────────────────────────

export interface OutputMessage {
  type: 'STATE' | 'PING' | 'CLOSE';
  /** Monotonic — a late window can tell it has stale state. */
  seq: number;
  stack?: LiveStack;
  outputs?: AmboOutput[];
  /** Live timer values, which change every tick and are not part of the stack. */
  timers?: Record<string, number>;
  at: number;
}

type Listener = (m: OutputMessage) => void;

/**
 * The studio side. Owns the channel, tracks outputs, and broadcasts state.
 * Deliberately dumb: it sends the whole stack rather than diffs, because a
 * projector that missed one diff is a projector showing the wrong thing for the
 * rest of the service.
 */
export class OutputRouter {
  private channel: BroadcastChannel | null = null;
  private windows = new Map<string, Window>();
  private seq = 0;
  outputs: AmboOutput[] = [];

  constructor(outputs: AmboOutput[] = []) {
    this.outputs = outputs;
    try { this.channel = new BroadcastChannel(AMBO_CHANNEL); } catch { this.channel = null; }
  }

  add(output: AmboOutput): void {
    if (!this.outputs.some(o => o.id === output.id)) this.outputs.push(output);
  }

  remove(id: string): void {
    this.outputs = this.outputs.filter(o => o.id !== id);
    this.closeWindow(id);
  }

  update(id: string, patch: Partial<AmboOutput>): void {
    this.outputs = this.outputs.map(o => (o.id === id ? { ...o, ...patch } : o));
  }

  /** Broadcast the live stack to every open output window. */
  send(stack: LiveStack, timers?: Record<string, number>): void {
    const msg: OutputMessage = {
      type: 'STATE',
      seq: ++this.seq,
      stack,
      outputs: this.outputs,
      timers,
      at: Date.now(),
    };
    try { this.channel?.postMessage(msg); } catch { /* channel closed */ }
  }

  /**
   * Open a physical window for an output. Returns false when the browser blocks
   * it (popup blocker) so the UI can tell the operator to allow popups rather
   * than silently showing nothing on the projector.
   */
  openWindow(output: AmboOutput, screens?: Array<{ left: number; top: number; width: number; height: number }>): boolean {
    if (typeof window === 'undefined') return false;
    const existing = this.windows.get(output.id);
    if (existing && !existing.closed) { existing.focus(); return true; }

    const s = output.screenIndex != null ? screens?.[output.screenIndex] : undefined;
    const features = s
      ? `left=${s.left},top=${s.top},width=${s.width},height=${s.height}`
      : 'width=1280,height=720';

    const url = `${location.origin}${location.pathname}?amboOut=${encodeURIComponent(output.id)}`;
    const w = window.open(url, `ambo_${output.id}`, features);
    if (!w) return false;
    this.windows.set(output.id, w);
    return true;
  }

  closeWindow(id: string): void {
    const w = this.windows.get(id);
    try { if (w && !w.closed) w.close(); } catch { /* */ }
    this.windows.delete(id);
  }

  /** How many output windows are actually open — the real count, not intent. */
  openCount(): number {
    let n = 0;
    for (const w of this.windows.values()) if (w && !w.closed) n++;
    return n;
  }

  dispose(): void {
    for (const id of [...this.windows.keys()]) this.closeWindow(id);
    try { this.channel?.close(); } catch { /* */ }
    this.channel = null;
  }
}

/** The output-window side: subscribe and render whatever arrives. */
export function subscribeToStudio(onState: Listener): () => void {
  let ch: BroadcastChannel | null = null;
  try { ch = new BroadcastChannel(AMBO_CHANNEL); } catch { return () => {}; }
  const handler = (e: MessageEvent) => {
    const m = e.data as OutputMessage;
    if (m && m.type === 'STATE') onState(m);
  };
  ch.addEventListener('message', handler);
  return () => {
    try { ch?.removeEventListener('message', handler); ch?.close(); } catch { /* */ }
  };
}

/** Read the output id this window was opened for, if any. */
export function outputIdFromUrl(search = typeof location !== 'undefined' ? location.search : ''): string | null {
  try { return new URLSearchParams(search).get('amboOut'); } catch { return null; }
}

/**
 * Ask the browser where the physical screens are. Returns an empty list when
 * the API or permission is unavailable — every caller must still work, because
 * an operator dragging a window to a projector is the normal case.
 */
export async function detectScreens(): Promise<Array<{ left: number; top: number; width: number; height: number; label: string; primary: boolean }>> {
  try {
    const w = window as any;
    if (!w.getScreenDetails) return [];
    const details = await w.getScreenDetails();
    return (details.screens || []).map((s: any, i: number) => ({
      left: s.left, top: s.top, width: s.width, height: s.height,
      label: s.label || `Screen ${i + 1}`,
      primary: !!s.isPrimary,
    }));
  } catch { return []; }
}
