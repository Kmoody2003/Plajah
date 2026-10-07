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

import type { LayerContent, LayerSlot, LiveStack, MaskSpec, TransformSpec } from './showModel';
import { isWindowsApp, postNativeMessage } from '../windowsBridgeService';
import { LAYER_ORDER } from './showModel';
import {
  getOrCreateDeviceId,
  detectDeviceType,
  getFriendlyDeviceName
} from './amboPartyEventService';
import type { PartyEventDevice, EventDeviceType } from './amboPartyEventService';

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
  PROGRAM: ['background', 'fill', 'slide', 'scripture', 'lyrics', 'prop', 'overlay', 'mask'],
  // A key must NOT carry the background, or it keys a filled rectangle.
  KEY: ['slide', 'scripture', 'lyrics', 'prop', 'overlay'],
  // Props are for the congregation; the speaker gets text and timers.
  STAGE: ['slide', 'scripture', 'lyrics', 'overlay'],
  AUX: ['background', 'fill', 'slide', 'scripture', 'lyrics', 'prop', 'mask'],
  LOOP: ['background', 'fill'],
  STREAM: ['background', 'fill', 'slide', 'scripture', 'lyrics', 'prop', 'overlay', 'mask'],
  SIGNAGE: ['background', 'fill', 'slide', 'prop', 'overlay'],
  LED_WALL: ['background', 'fill', 'slide', 'scripture', 'lyrics', 'prop', 'overlay', 'mask'],
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

import type { FitSpec } from './outputFit';

export interface AmboOutput {
  id: string;
  name: string;
  kind: OutputKind;
  /** For self-registration / mesh devices */
  deviceTag?: 'THIS_DEVICE' | 'MESH_DEVICE' | 'LOCAL_SCREEN';
  deviceTypeHint?: EventDeviceType;
  isOnline?: boolean;
  /** Layers this output composites. Defaults from DEFAULT_LAYERS. */
  layers: LayerSlot[];
  /** Transparent background so a switcher can key it. */
  alpha?: boolean;
  /** Per-output geometry — warp, keystone, blend zone. */
  transform?: TransformSpec;
  /** Per-output mask, on top of any slide mask. */
  mask?: MaskSpec;
  /** How media of a different aspect ratio is placed on this output: letterbox / fill, bar fill, alignment, zoom, shift. */
  fit?: Partial<FitSpec>;
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
  // Outputs saved before the lyrics slot existed: anything that shows slides
  // shows lyrics too, or a projector set up last month silently drops them.
  if (allow.has('slide') && !allow.has('lyrics')) allow.add('lyrics');
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
  type: 'STATE' | 'PING' | 'HELLO' | 'CLOSE';
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
  /** Native (WinUI) output windows — no Window ref, the shell owns them. */
  private nativeOpen = new Set<string>();
  private lastStack: LiveStack = {};
  private lastTimers?: Record<string, number>;
  private seq = 0;
  outputs: AmboOutput[] = [];

  constructor(outputs: AmboOutput[] = []) {
    this.outputs = outputs;
    try {
      this.channel = new BroadcastChannel(AMBO_CHANNEL);
      this.channel.addEventListener('message', this.onChannelMessage);
    } catch { this.channel = null; }
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
    this.lastStack = stack;
    this.lastTimers = timers;
    this.post();
  }

  /**
   * (Re)send the current state. An output window that opens or reloads after
   * the last TAKE would otherwise sit on "Waiting for the studio" until the
   * operator happened to fire another cue.
   */
  private post(): void {
    const busClearing: Record<string, LayerSlot[]> = {};
    for (const out of this.outputs) {
      const cleared = this.getBusClearedSlots(out.id);
      if (cleared.size > 0) busClearing[out.id] = [...cleared];
    }

    const msg: OutputMessage = {
      type: 'STATE',
      seq: ++this.seq,
      stack: wireSafeStack(this.lastStack),
      outputs: this.outputs,
      timers: this.lastTimers,
      busClearing,
      at: Date.now(),
    };
    try { this.channel?.postMessage(msg); } catch (e) {
      // One non-cloneable value drops the WHOLE message and the projector
      // freezes on whatever it last had. Say so instead of hiding it.
      console.warn('[ambo] output broadcast failed', e);
    }
  }

  /** An output window just came up and is asking for the current state. */
  private onChannelMessage = (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === 'HELLO') this.post();
  };

  /** The ?amboOut= URL every output loads — same origin, so BroadcastChannel reaches it. */
  static outputUrl(id: string): string {
    return `${location.origin}${location.pathname}?amboOut=${encodeURIComponent(id)}`;
  }

  /**
   * Open a physical window for an output. Returns false when the browser blocks
   * it (popup blocker) so the UI can tell the operator to allow popups rather
   * than silently showing nothing on the projector.
   *
   * Synchronous on purpose: window.open must run inside the click's user
   * activation, and an `await` before it is how popups get blocked.
   */
  openWindow(output: AmboOutput, screens?: Array<{ left: number; top: number; width: number; height: number }>): boolean {
    if (typeof window === 'undefined') return false;
    const url = OutputRouter.outputUrl(output.id);

    // Windows app: a native borderless window on the target display, loading
    // the SAME-ORIGIN ?amboOut= page in the main WebView2 environment. An
    // inline NavigateToString page has an opaque origin and never receives the
    // BroadcastChannel — that is why the projector showed nothing.
    if (isWindowsApp()) {
      postNativeMessage({
        type: 'OPEN_OUTPUT_WINDOW',
        outputId: output.id,
        displayIndex: output.screenIndex ?? 1,
        feedUrl: url,
        title: output.name || 'Ambo Output',
        width: output.width || 0,
        height: output.height || 0,
      });
      this.nativeOpen.add(output.id);
      return true;
    }

    const existing = this.windows.get(output.id);
    if (existing && !existing.closed) { existing.focus(); return true; }

    const s = output.screenIndex != null ? screens?.[output.screenIndex] : undefined;
    const baseFeatures = 'popup=yes,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no';
    const features = s
      ? `left=${s.left},top=${s.top},width=${s.width},height=${s.height},${baseFeatures}`
      : `width=1280,height=720,${baseFeatures}`;

    const w = window.open(url, `ambo_${output.id}`, features);
    if (!w) return false;
    this.windows.set(output.id, w);
    return true;
  }

  closeWindow(id: string): void {
    const w = this.windows.get(id);
    try { if (w && !w.closed) w.close(); } catch { /* */ }
    this.windows.delete(id);
    if (this.nativeOpen.delete(id)) {
      postNativeMessage({ type: 'CLOSE_OUTPUT_WINDOW', outputId: id });
    }
  }

  /** How many output windows are actually open — the real count, not intent. */
  openCount(): number {
    let n = this.nativeOpen.size;
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
    for (const id of [...this.windows.keys(), ...this.nativeOpen]) this.closeWindow(id);
    try {
      this.channel?.removeEventListener('message', this.onChannelMessage);
      this.channel?.close();
    } catch { /* */ }
    this.channel = null;
  }
}

/**
 * Strip what structured clone can't carry. A LIVE layer holds a MediaStream for
 * the studio's own monitor; posting it throws DataCloneError and the WHOLE
 * message is lost. Output windows resolve live inputs by `inputId` instead.
 */
export function wireSafeStack(stack: LiveStack): LiveStack {
  const out: LiveStack = {};
  for (const slot of Object.keys(stack) as LayerSlot[]) {
    const layer = stack[slot];
    if (!layer) continue;
    const c = layer.content as LayerContent & { stream?: unknown };
    if (c && c.stream) {
      const { stream: _drop, ...rest } = c;
      out[slot] = { ...layer, content: rest as LayerContent };
    } else {
      out[slot] = layer;
    }
  }
  return out;
}

/** The output-window side: subscribe and render whatever arrives. */
export function subscribeToStudio(onState: Listener): () => void {
  let ch: BroadcastChannel | null = null;
  try { ch = new BroadcastChannel(AMBO_CHANNEL); } catch { return () => {}; }
  let gotState = false;
  const handler = (e: MessageEvent) => {
    const m = e.data as OutputMessage;
    if (!m) return;
    if (m.type === 'STATE') { gotState = true; onState(m); }
    else if (m.type === 'CLOSE') onState(m);
  };
  ch.addEventListener('message', handler);
  // Ask for the current state — this window may have opened after the last
  // cue. Keep asking until answered: the studio may still be mounting.
  const hello = () => { if (!gotState) { try { ch?.postMessage({ type: 'HELLO', at: Date.now() }); } catch { /* */ } } };
  hello();
  const retry = setInterval(hello, 1500);
  return () => {
    clearInterval(retry);
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

// ── Device Registration & Discovery ──────────────────────────────────────────

export interface SelfDeviceInfo {
  deviceId: string;
  deviceType: EventDeviceType;
  deviceName: string;
  screens: DetectedScreenInfo[];
  isPrimary: boolean;
}

export async function detectSelfDevice(): Promise<SelfDeviceInfo> {
  const deviceId = getOrCreateDeviceId();
  const deviceType = detectDeviceType();
  const deviceName = getFriendlyDeviceName();
  const screens = await detectScreens();
  return {
    deviceId,
    deviceType,
    deviceName,
    screens,
    isPrimary: true,
  };
}

export function buildOutputsFromDevices(selfDevice: SelfDeviceInfo, meshDevices: PartyEventDevice[]): AmboOutput[] {
  const outputs: AmboOutput[] = [];

  // 1. Create default outputs from detected physical screens
  if (selfDevice.screens && selfDevice.screens.length > 1) {
    const sortedScreens = [...selfDevice.screens].sort((a, b) => a.index - b.index);
    const secondary = sortedScreens.find(s => !s.primary) || sortedScreens[1];
    if (secondary) {
      outputs.push(makeOutput('PROGRAM', `Main Display (${secondary.resolutionLabel || secondary.label})`, {
        deviceTag: 'LOCAL_SCREEN',
        deviceTypeHint: selfDevice.deviceType,
        isOnline: true,
        screenIndex: secondary.index,
        displayIndex: secondary.index,
        width: secondary.width,
        height: secondary.height,
        refreshRate: secondary.refreshRate,
        aspectRatio: secondary.aspectRatio,
        autoDetectDisplay: true
      }));
    }
    
    if (sortedScreens.length > 2) {
      const tertiary = sortedScreens.find(s => !s.primary && s.index !== secondary.index) || sortedScreens[2];
      if (tertiary) {
        outputs.push(makeOutput('STAGE', `Stage Display (${tertiary.resolutionLabel || tertiary.label})`, {
          deviceTag: 'LOCAL_SCREEN',
          deviceTypeHint: selfDevice.deviceType,
          isOnline: true,
          screenIndex: tertiary.index,
          displayIndex: tertiary.index,
          width: tertiary.width,
          height: tertiary.height,
          refreshRate: tertiary.refreshRate,
          aspectRatio: tertiary.aspectRatio,
          autoDetectDisplay: true
        }));
      }
    }
  }

  // 2. Add the self-device as a THIS_DEVICE tagged output
  outputs.push(makeOutput('AUX', selfDevice.deviceName || 'This Device', {
    id: `self_${selfDevice.deviceId}`,
    deviceTag: 'THIS_DEVICE',
    deviceTypeHint: selfDevice.deviceType,
    isOnline: true,
    width: selfDevice.screens[0]?.width || 1920,
    height: selfDevice.screens[0]?.height || 1080
  }));

  // 3. Merge in online mesh devices from the Party Event system
  for (const md of meshDevices) {
    if (md.deviceId !== selfDevice.deviceId) {
      const w = md.screen?.width || 1920;
      const h = md.screen?.height || 1080;
      outputs.push(makeOutput('AUX', md.deviceName || md.deviceId, {
        id: `mesh_${md.deviceId}`,
        deviceTag: 'MESH_DEVICE',
        deviceTypeHint: md.deviceType,
        isOnline: md.isOnline,
        width: w,
        height: h,
        aspectRatio: md.screen?.aspectRatio
      }));
    }
  }

  return outputs;
}

export function subscribeToDisplayChanges(callback: (screens: DetectedScreenInfo[]) => void): () => void {
  let isSubscribed = true;
  let unsubscribeWindows = () => {};
  let unsubscribeWeb = () => {};

  const notify = async () => {
    if (!isSubscribed) return;
    const screens = await detectScreens();
    callback(screens);
  };

  if (typeof window !== 'undefined') {
    // Windows Native Bridge
    import('../windowsBridgeService').then(({ isWindowsApp, onNativeMessage }) => {
      if (!isSubscribed) return;
      if (isWindowsApp()) {
        unsubscribeWindows = onNativeMessage((msg: any) => {
          if (msg.type === 'DISPLAY_CHANGE' || msg.type === 'STUDIO_DISPLAYS_CHANGED') {
            notify();
          }
        });
      }
    }).catch(() => {});

    // Chromium Window Management API
    if ('getScreenDetails' in window) {
      (window as any).getScreenDetails().then((details: any) => {
        if (!isSubscribed) return;
        const handler = () => notify();
        details.addEventListener('screenschange', handler);
        unsubscribeWeb = () => {
          details.removeEventListener('screenschange', handler);
        };
      }).catch(() => {});
    } else if (window.screen) {
      const handler = () => notify();
      window.screen.addEventListener('change', handler);
      unsubscribeWeb = () => {
        window.screen.removeEventListener('change', handler);
      };
    }
  }

  return () => {
    isSubscribed = false;
    unsubscribeWindows();
    unsubscribeWeb();
  };
}

// ── QR Code Pairing for Guest / Non-Signed-In Devices ────────────────────────

export interface PairingInfo {
  pairingCode: string;     // 6-character alphanumeric code
  pairingUrl: string;      // Full URL to open on the guest device
  sessionId: string;       // Unique session ID
  expiresAt: number;       // Timestamp when the code expires
}

let _activePairing: PairingInfo | null = null;

export function generatePairingInfo(uid: string): PairingInfo {
  // Generate a 6-char alphanumeric code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  
  const sessionId = `pair_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Build the URL — works for web, Android, and Windows
  const baseUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}` 
    : 'https://plajah.com';
  const pairingUrl = `${baseUrl}/ambo/join?code=${code}&session=${sessionId}&host=${uid}`;
  
  _activePairing = {
    pairingCode: code,
    pairingUrl,
    sessionId,
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
  };
  
  return _activePairing;
}

export function getActivePairing(): PairingInfo | null {
  if (_activePairing && _activePairing.expiresAt < Date.now()) {
    _activePairing = null;
  }
  return _activePairing;
}

export function clearPairing(): void {
  _activePairing = null;
}

export function flashDisplayIdentifier(output: AmboOutput): void {
  // Send a message over BroadcastChannel telling the output window to show
  // a full-screen overlay with the output name for 3 seconds
  const channel = new BroadcastChannel(AMBO_CHANNEL);
  channel.postMessage({
    type: 'IDENTIFY_DISPLAY',
    outputId: output.id,
    outputName: output.name,
    outputKind: output.kind,
    duration: 3000,
  });
  channel.close();
}

export function flashAllDisplayIdentifiers(outputs: AmboOutput[]): void {
  outputs.forEach(output => flashDisplayIdentifier(output));
}
