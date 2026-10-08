// mediaEngine/blackmagic/surfaceSync.ts — makes a physical ATEM act as a control surface for the Plajah
// switcher (and mirrors Plajah's take back onto the ATEM so the two never disagree).
//
// An ATEM panel talks to its ATEM unit, never to a PC, so "use their switcher as our control surface" means:
// follow the ATEM's program/preview/transition state, and (optionally) push ours back. The risk in any
// two-way mirror is a feedback loop (A changes B, B echoes to A...). Three guards:
//   1. `applying` — while we write a remote change into the engine, the engine subscription is ignored.
//   2. last-known remote values — we only send what actually differs from what the ATEM last reported.
//   3. `autoInFlight` — when Plajah starts an AUTO we ask the ATEM for an AUTO and ignore both sides' PGM/PVW
//      swaps until the ATEM reports the transition finished (or a timeout), so we never hard-cut mid-fade.
// Pure and React-free: the engine and the bridge are injected so tests drive it with fakes.

import type { AtemMeState, AtemSnapshot, AtemTransitionStyle, BridgeRequest } from './protocol';

export type SurfaceMode = 'off' | 'atem-leads' | 'plajah-leads' | 'both';

export interface SurfaceEngineState {
  switcher: { program: string; preview: string; transition: { type: string; position: number } };
}
export interface SurfaceEngine {
  getState(): SurfaceEngineState;
  subscribe(cb: (s: SurfaceEngineState) => void): () => void;
  setProgram(destId: string): void;
  setPreview(destId: string): void;
  setTransitionPosition(p: number): void;
  setTransition(type: any): void;
}
export interface SurfaceLink {
  send(req: BridgeRequest): Promise<unknown>;
}

export interface SurfaceOptions {
  deviceId: string;
  me?: number;
  mode?: SurfaceMode;
  /** ATEM input index -> engine switcher destination id. Defaults to input N <-> `swN`. */
  inputToDest?: Record<number, string>;
  autoTimeoutMs?: number;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
}

const STYLE_TO_ENGINE: Record<AtemTransitionStyle, string> = { mix: 'mix', dip: 'dip', wipe: 'wipe', dve: 'dve', sting: 'dve' };
const ENGINE_TO_STYLE: Record<string, AtemTransitionStyle | undefined> = { mix: 'mix', dip: 'dip', wipe: 'wipe', dve: 'dve' };

export class SurfaceSync {
  private readonly o: Required<Pick<SurfaceOptions, 'deviceId' | 'me' | 'autoTimeoutMs'>>;
  private mode: SurfaceMode;
  private inputToDest: Record<number, string> | undefined;
  private destToInput = new Map<string, number>();
  private applying = false;
  private autoInFlight = false;
  private autoTimer: unknown = null;
  private lastEnginePos = 0;
  private lastAtemInTransition = false;
  private known: { program?: string; preview?: string } = {};
  private unsub: (() => void) | null = null;
  private readonly setT: (fn: () => void, ms: number) => unknown;
  private readonly clearT: (h: unknown) => void;

  constructor(private engine: SurfaceEngine, private link: SurfaceLink, opts: SurfaceOptions) {
    this.o = { deviceId: opts.deviceId, me: opts.me ?? 0, autoTimeoutMs: opts.autoTimeoutMs ?? 5000 };
    this.mode = opts.mode ?? 'both';
    this.inputToDest = opts.inputToDest;
    this.setT = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearT = opts.clearTimeout ?? (h => clearTimeout(h as any));
    this.rebuildReverse();
  }

  setMode(m: SurfaceMode) { this.mode = m; }
  getMode() { return this.mode; }
  setInputMap(map: Record<number, string> | undefined) { this.inputToDest = map; this.rebuildReverse(); }

  destForInput(input: number): string | undefined {
    if (this.inputToDest) return this.inputToDest[input];
    return input >= 1 && input <= 16 ? `sw${input}` : undefined; // 1000+ (black, bars, media players) have no default
  }
  inputForDest(dest: string): number | undefined {
    if (this.inputToDest) return this.destToInput.get(dest);
    const m = /^sw(\d+)$/.exec(dest);
    return m ? Number(m[1]) : undefined;
  }
  private rebuildReverse() {
    this.destToInput.clear();
    if (this.inputToDest) for (const [i, d] of Object.entries(this.inputToDest)) this.destToInput.set(d, Number(i));
  }

  start() {
    if (this.unsub) return;
    this.lastEnginePos = this.engine.getState().switcher.transition.position;
    this.unsub = this.engine.subscribe(s => this.onEngine(s));
  }
  stop() {
    this.unsub?.(); this.unsub = null;
    this.endAuto();
  }

  // ── ATEM → Plajah ───────────────────────────────────────────────────────────
  onAtem(snap: AtemSnapshot) {
    if (snap.deviceId !== this.o.deviceId || this.mode === 'off') return;
    const me = snap.me[this.o.me];
    if (!me) return;
    this.noteAtemTransition(me);
    this.knownStyle = me.style;
    if (this.mode === 'plajah-leads') { this.known = this.mapped(me); return; }
    const prog = this.destForInput(me.program);
    const prev = this.destForInput(me.preview);
    this.known = { program: prog, preview: prev };
    if (this.autoInFlight) return; // our own AUTO is running; the swap lands when it finishes
    this.applying = true;
    try {
      const sw = this.engine.getState().switcher;
      const style = STYLE_TO_ENGINE[me.style];
      if (style && sw.transition.type !== style) this.engine.setTransition(style);
      if (me.inTransition && me.position > 0 && me.position < 1) this.engine.setTransitionPosition(me.position);
      if (prog && prog !== sw.program) this.engine.setProgram(prog);
      if (prev && prev !== sw.preview) this.engine.setPreview(prev);
      if (!me.inTransition && sw.transition.position > 0) this.engine.setTransitionPosition(0);
    } finally { this.applying = false; }
  }

  private mapped(me: AtemMeState) { return { program: this.destForInput(me.program), preview: this.destForInput(me.preview) }; }

  private noteAtemTransition(me: AtemMeState) {
    if (this.lastAtemInTransition && !me.inTransition) this.endAuto();
    this.lastAtemInTransition = me.inTransition;
  }

  // ── Plajah → ATEM ───────────────────────────────────────────────────────────
  private onEngine(s: SurfaceEngineState) {
    const pos = s.switcher.transition.position;
    const prevPos = this.lastEnginePos;
    this.lastEnginePos = pos;
    if (this.applying || this.mode === 'off' || this.mode === 'atem-leads') return;

    // A Plajah AUTO begins when the position leaves 0: ask the ATEM to run the same transition.
    if (prevPos === 0 && pos > 0 && !this.autoInFlight) {
      void this.startAtemAuto(s);
      return;
    }
    if (this.autoInFlight) return;

    const prog = this.inputForDest(s.switcher.program);
    const prev = this.inputForDest(s.switcher.preview);
    if (prog !== undefined && s.switcher.program !== this.known.program) {
      this.known.program = s.switcher.program;
      this.fire({ op: 'atem.program', id: this.o.deviceId, input: prog, me: this.o.me });
    }
    if (prev !== undefined && s.switcher.preview !== this.known.preview) {
      this.known.preview = s.switcher.preview;
      this.fire({ op: 'atem.preview', id: this.o.deviceId, input: prev, me: this.o.me });
    }
    const style = ENGINE_TO_STYLE[s.switcher.transition.type];
    if (style && pos === 0 && this.knownStyle && this.knownStyle !== style) this.sendStyle(style);
  }

  private knownStyle: AtemTransitionStyle | null = null;
  private sendStyle(style: AtemTransitionStyle) {
    this.knownStyle = style;
    this.fire({ op: 'atem.style', id: this.o.deviceId, style, me: this.o.me });
  }

  private async startAtemAuto(s: SurfaceEngineState) {
    this.autoInFlight = true;
    this.autoTimer = this.setT(() => this.endAuto(), this.o.autoTimeoutMs);
    // The ATEM auto-transitions PVW -> PGM, so make sure its preview is the one Plajah is fading to.
    const prev = this.inputForDest(s.switcher.preview);
    const prog = this.inputForDest(s.switcher.program);
    try {
      if (prog !== undefined) await this.link.send({ op: 'atem.program', id: this.o.deviceId, input: prog, me: this.o.me });
      if (prev !== undefined) await this.link.send({ op: 'atem.preview', id: this.o.deviceId, input: prev, me: this.o.me });
      await this.link.send({ op: 'atem.auto', id: this.o.deviceId, me: this.o.me });
    } catch { this.endAuto(); }
  }

  private endAuto() {
    if (this.autoTimer !== null) { this.clearT(this.autoTimer); this.autoTimer = null; }
    this.autoInFlight = false;
    const sw = this.engine.getState().switcher;
    this.known = { program: sw.program, preview: sw.preview };
  }

  private fire(req: BridgeRequest) { void this.link.send(req).catch(() => { /* link down: next ATEM snapshot re-syncs */ }); }
}
