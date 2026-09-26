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
  | 'STREAM'    // what the broadcast sees
  | 'SIGNAGE'   // digital signage displays across facility
  | 'LED_WALL'; // high-density multi-cabinet LED video wall

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
  SIGNAGE: ['background', 'fill', 'slide', 'prop', 'overlay'],
  LED_WALL: ['background', 'fill', 'slide', 'scripture', 'prop', 'overlay', 'mask'],
};

export interface DetectedScreenInfo {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  primary: boolean;
  refreshRate?: number;
  aspectRatio?: string;
  scaleFactor?: number;
  resolutionLabel?: string;
}

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
  /** Friendly display index for display mapping. */
  displayIndex?: number;
  /** Resolution the output renders at. Defaults to the screen's. */
  width?: number;
  height?: number;
  /** Whether this output automatically locks its width and height to the physical display resolution. */
  autoDetectDisplay?: boolean;
  /** Refresh rate of the target display, in Hz (e.g. 59.94, 60.0). */
  refreshRate?: number;
  /** Aspect ratio string (e.g. '16:9', '16:10', '21:9'). */
  aspectRatio?: string;
  /** Stage-display extras. */
  showStageNotes?: boolean;
  showNextSlide?: boolean;
  showClock?: boolean;
  /** Per-output scripture translation — the kids room gets a paraphrase. */
  translation?: string;
  /** Active cleared layer slots on this specific output bus. */
  clearedSlots?: LayerSlot[];
  /** Digital signage layout channel ID when driving digital signage. */
  signageChannelId?: string;
  /** LED Wall configuration ID when mapped to an LED wall. */
  ledWallId?: string;
  enabled: boolean;
}

export function makeOutput(kind: OutputKind, name: string, over: Partial<AmboOutput> = {}): AmboOutput {
  return {
    id: over.id ?? `out_${kind.toLowerCase()}_${Math.abs(hash(name + kind))}`,
    name,
    kind,
    layers: over.layers ?? [...DEFAULT_LAYERS[kind]],
    alpha: over.alpha ?? kind === 'KEY',
    autoDetectDisplay: over.autoDetectDisplay ?? true,
    width: over.width ?? 1920,
    height: over.height ?? 1080,
    aspectRatio: over.aspectRatio ?? '16:9',
    refreshRate: over.refreshRate ?? 60,
    showStageNotes: over.showStageNotes ?? kind === 'STAGE',
    showNextSlide: over.showNextSlide ?? kind === 'STAGE',
    showClock: over.showClock ?? kind === 'STAGE',
    clearedSlots: over.clearedSlots ?? [],
    signageChannelId: over.signageChannelId,
    ledWallId: over.ledWallId,
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
 * Respects both the output's allowed layer slots AND any active per-bus clearing mask.
 */
export function stackForOutput(
  stack: LiveStack,
  output: AmboOutput,
  busClearedSlots?: Set<LayerSlot> | LayerSlot[]
): LiveStack {
  const allow = new Set(output.layers);
  const cleared = busClearedSlots instanceof Set
    ? busClearedSlots
    : new Set(busClearedSlots || output.clearedSlots || []);
  const out: LiveStack = {};
  for (const slot of LAYER_ORDER) {
    if (!allow.has(slot)) continue;
    if (cleared.has(slot)) continue;
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
  /** Map of outputId -> array of cleared layer slots for per-bus independent clearing. */
  busClearing?: Record<string, LayerSlot[]>;
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
  private busClearingMasks = new Map<string, Set<LayerSlot>>();
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
    this.busClearingMasks.delete(id);
    this.closeWindow(id);
  }

  update(id: string, patch: Partial<AmboOutput>): void {
    this.outputs = this.outputs.map(o => (o.id === id ? { ...o, ...patch } : o));
  }

  // ── Bus-Level Independent Clearing ──────────────────────────────────────────

  /** Clear a specific layer on a specific output bus without disturbing others. */
  clearBusLayer(outputId: string, slot: LayerSlot): void {
    const current = this.busClearingMasks.get(outputId) || new Set<LayerSlot>();
    current.add(slot);
    this.busClearingMasks.set(outputId, current);
    this.update(outputId, { clearedSlots: [...current] });
  }

  /** Clear all layers on a specific output bus (bus panic button). */
  clearBusAll(outputId: string): void {
    const all = new Set<LayerSlot>(LAYER_ORDER);
    this.busClearingMasks.set(outputId, all);
    this.update(outputId, { clearedSlots: [...all] });
  }

  /** Reset / restore all cleared layers on a specific output bus. */
  resetBusClearing(outputId: string): void {
    this.busClearingMasks.set(outputId, new Set<LayerSlot>());
    this.update(outputId, { clearedSlots: [] });
  }

  /** Get active set of cleared layers for an output bus. */
  getBusClearedSlots(outputId: string): Set<LayerSlot> {
    const out = this.outputs.find(o => o.id === outputId);
    return this.busClearingMasks.get(outputId) || new Set(out?.clearedSlots || []);
  }

  /** Calculate effective stack for an output bus with independent clearing applied. */
  getBusStack(outputId: string, baseStack: LiveStack): LiveStack {
    const out = this.outputs.find(o => o.id === outputId);
    if (!out) return baseStack;
    const cleared = this.getBusClearedSlots(outputId);
    return stackForOutput(baseStack, out, cleared);
  }

  /** Broadcast the live stack to every open output window. */
  send(stack: LiveStack, timers?: Record<string, number>): void {
    const busClearing: Record<string, LayerSlot[]> = {};
    for (const out of this.outputs) {
      const cleared = this.getBusClearedSlots(out.id);
      if (cleared.size > 0) {
        busClearing[out.id] = [...cleared];
      }
    }

    const msg: OutputMessage = {
      type: 'STATE',
      seq: ++this.seq,
      stack,
      outputs: this.outputs,
      timers,
      busClearing,
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
    const baseFeatures = 'popup=yes,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no';
    const features = s
      ? `left=${s.left},top=${s.top},width=${s.width},height=${s.height},${baseFeatures}`
      : `width=1280,height=720,${baseFeatures}`;

    const url = `${location.origin}${location.pathname}?amboOut=${encodeURIComponent(output.id)}`;

    // Try Windows native hardware Clean-Feed if running in desktop app
    void (async () => {
      try {
        const { isWindowsApp, openStudioCleanFeed } = await import('../windowsBridgeService');
        if (isWindowsApp()) {
          await openStudioCleanFeed({
            displayIndex: output.screenIndex ?? 1,
            feedUrl: url,
            title: output.name || 'Ambo Audience Output',
            width: output.width,
            height: output.height,
          });
        }
      } catch {}
    })();

    const w = window.open(url, `ambo_${output.id}`, features);
    if (!w) return false;
    this.windows.set(output.id, w);
    return true;
  }

  closeWindow(id: string): void {
    const w = this.windows.get(id);
    try { if (w && !w.closed) w.close(); } catch { /* */ }
    this.windows.delete(id);
    void (async () => {
      try {
        const { isWindowsApp, closeStudioCleanFeed } = await import('../windowsBridgeService');
        if (isWindowsApp()) closeStudioCleanFeed();
      } catch {}
    })();
  }

  /** How many output windows are actually open — the real count, not intent. */
  openCount(): number {
    let n = 0;
    for (const w of this.windows.values()) if (w && !w.closed) n++;
    return n;
  }

  dispose(): void {
    try {
      this.channel?.postMessage({
        type: 'CLOSE',
        seq: ++this.seq,
        at: Date.now(),
      });
    } catch {}
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

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function calculateAspectRatio(width: number, height: number): string {
  if (!width || !height || width <= 0 || height <= 0) return '16:9';
  const g = gcd(width, height);
  const num = Math.round(width / g);
  const den = Math.round(height / g);
  if ((num === 16 && den === 9) || (num === 64 && den === 36)) return '16:9';
  if ((num === 16 && den === 10) || (num === 8 && den === 5)) return '16:10';
  if ((num === 21 && den === 9) || (num === 64 && den === 27) || (num === 43 && den === 18)) return '21:9';
  if (num === 4 && den === 3) return '4:3';
  if (num === 5 && den === 4) return '5:4';
  if (num === 3 && den === 2) return '3:2';
  return `${num}:${den}`;
}

/**
 * Ask Windows or browser where the physical screens are.
 * In the Windows app, queries WinUI DisplayArea for exact physical pixels, bounds, and refresh rate.
 * In browser, falls back to Window Management API (getScreenDetails) or window.screen.
 */
export async function detectScreens(): Promise<DetectedScreenInfo[]> {
  // 1. Windows WinUI 3 Native Shell Bridge
  try {
    const { isWindowsApp, getStudioDisplays } = await import('../windowsBridgeService');
    if (isWindowsApp()) {
      const displays = await getStudioDisplays();
      if (displays && displays.length > 0) {
        return displays.map((d, i) => ({
          index: d.index ?? i,
          left: d.left ?? 0,
          top: d.top ?? 0,
          width: d.width,
          height: d.height,
          label: d.name || `Display ${i + 1} (${d.width}×${d.height})`,
          primary: !!d.isPrimary,
          refreshRate: d.refreshRate ?? 60,
          aspectRatio: d.aspectRatio ?? calculateAspectRatio(d.width, d.height),
          scaleFactor: d.scaleFactor ?? 1,
          resolutionLabel: d.resolutionLabel ?? `${d.width}×${d.height} @ ${d.refreshRate || 60}Hz`,
        }));
      }
    }
  } catch { /* fallback */ }

  // 2. Modern Chromium Window Management API
  try {
    const w = typeof window !== 'undefined' ? (window as any) : null;
    if (w && typeof w.getScreenDetails === 'function') {
      const details = await w.getScreenDetails();
      if (details?.screens?.length) {
        const dpr = window.devicePixelRatio || 1;
        return details.screens.map((s: any, i: number) => {
          const wPx = Math.round((s.width || window.innerWidth) * dpr);
          const hPx = Math.round((s.height || window.innerHeight) * dpr);
          return {
            index: i,
            left: s.left ?? 0,
            top: s.top ?? 0,
            width: wPx,
            height: hPx,
            label: s.label || `Display ${i + 1} (${wPx}×${hPx})`,
            primary: !!s.isPrimary,
            refreshRate: 60,
            aspectRatio: calculateAspectRatio(wPx, hPx),
            scaleFactor: dpr,
            resolutionLabel: `${wPx}×${hPx} @ 60Hz`,
          };
        });
      }
    }
  } catch { /* fallback */ }

  // 3. Browser window.screen standard fallback
  if (typeof window !== 'undefined' && window.screen) {
    const dpr = window.devicePixelRatio || 1;
    const wPx = Math.round((window.screen.width || window.innerWidth || 1920) * dpr);
    const hPx = Math.round((window.screen.height || window.innerHeight || 1080) * dpr);
    return [{
      index: 0,
      left: 0,
      top: 0,
      width: wPx,
      height: hPx,
      label: `Display 1 (Current Display · ${wPx}×${hPx})`,
      primary: true,
      refreshRate: 60,
      aspectRatio: calculateAspectRatio(wPx, hPx),
      scaleFactor: dpr,
      resolutionLabel: `${wPx}×${hPx} @ 60Hz`,
    }];
  }

  return [];
}

/** Auto-configure an Ambo output to match a target physical screen's exact resolution and size. */
export function autoDetectOutputResolution(
  output: AmboOutput,
  screens: DetectedScreenInfo[],
  targetScreenIndex?: number,
): AmboOutput {
  if (!output.autoDetectDisplay || !screens.length) return output;
  const index = targetScreenIndex ?? output.screenIndex ?? output.displayIndex;
  const target = index != null
    ? (screens.find(s => s.index === index) ?? screens[0])
    : (screens.find(s => !s.primary) ?? screens[0]);

  if (!target) return output;

  return {
    ...output,
    screenIndex: target.index,
    displayIndex: target.index,
    width: target.width,
    height: target.height,
    aspectRatio: target.aspectRatio,
    refreshRate: target.refreshRate,
  };
}

// ── Native Platform Bus Integration (Ambo Outputs → Switcher Inputs) ─────────

import { publishAppOutput } from '../mediaEngine/bridge';

/**
 * Publish an Ambo output stream (e.g. from an offscreen or output canvas capture)
 * so the Live Video Switcher and other platform apps can take it as an input channel.
 */
export function publishAmboLiveOutput(
  channelId: 'ambo:audience' | 'ambo:lower_third' | string,
  stream: MediaStream,
  label = 'Ambo Program Output',
): void {
  publishAppOutput(channelId, stream, label, 'ambo');
}
