// LivingEngine: the DOM side of the runtime. It owns one page's live SVG: runs animations (Web Animations API, transform/opacity
// only), listens for pointer / touch / keyboard / tilt, and implements RuntimeHost for the (DOM-free) ActionInterpreter.
//
// Performance model: all motion is WAAPI (compositor) except drag/follow/parallax/particles which share ONE rAF loop. The loop
// sleeps whenever nothing is moving, stops when the page is not visible, and is woken by input.
import type { AnimSpec, Behavior, BookAudioApi, BurstKind, HapticPattern, LivingPage, Target, Trigger } from '../contracts';
import { compileAnim, isEntrancePreset, seedForObject, type CompiledAnim, type Commit } from './anim';
import { evalCond, condVars } from './conditions';
import { clampDrag, dragProgress, nudge, offsetForProgress, releaseTarget, type DragTrigger, type Vec } from './drag';
import { GoalTracker } from './goals';
import { ActionInterpreter, type ActionCtx, type RuntimeHost } from './interpreter';
import { addParticles, drawParticle, spawn, step as stepParticles, type Particle } from './particles';
import { distToBox, ProximityGate, SpeedTracker, type ProximityTrigger } from './proximity';
import { VarStore } from './state';
import { PAGE_ID, resolveTarget, unionBox, type ObjInfo } from './targets';
import { hashString } from './rng';

export interface EngineOptions {
  root: HTMLElement;
  svg: SVGSVGElement;
  /** <g> wrapping every object (the "page" target animates this). */
  pageG: SVGGElement;
  canvas?: HTMLCanvasElement | null;
  tint?: SVGRectElement | null;
  objects: ObjInfo[];
  /** Plain text per TEXT object id (narration + type-on). */
  texts?: Record<string, string>;
  /** Object ids in narration (reading) order. */
  narrationIds?: string[];
  width: number;
  height: number;
  living: LivingPage;
  audio: BookAudioApi | null;
  reducedMotion: boolean;
  soundEnabled: boolean;
  onGoto?: (p: number | 'next' | 'prev') => void;
  onGoal?: (page: number, goalId: string) => void;
  announce?: (text: string) => void;
  /** Called with the word index being spoken (or -1 when finished). */
  onWord?: (i: number) => void;
  /** Called with the final `emit` events (for hosts that care). */
  onEmit?: (name: string, payload?: unknown) => void;
}

/** What the accessible layer needs to draw one focusable control. */
export interface InteractiveItem {
  key: string;
  family: 'tap' | 'press' | 'drag' | 'proximity';
  behaviorIds: string[];
  hint: string;
  ids: string[];
  box: { x: number; y: number; w: number; h: number };
  /** Drag only: which way the drag goes (page units), for the visual hint. */
  vec?: { dx: number; dy: number };
}

type DragTrigger = { axis?: 'x' | 'y' | 'both'; bounds?: { minX?: number; maxX?: number; minY?: number; maxY?: number }; snapTo?: Array<{ x: number; y: number }> };
export function dragVec(on: DragTrigger): { dx: number; dy: number } {
  const s = on.snapTo?.[0]; if (s && Math.hypot(s.x, s.y) > 8) return { dx: s.x, dy: s.y };
  const b = on.bounds; let dx = 0, dy = 0;
  if (b && on.axis !== 'y') dx = Math.abs(b.maxX ?? 0) >= Math.abs(b.minX ?? 0) ? (b.maxX ?? 0) : (b.minX ?? 0);
  if (b && on.axis !== 'x') dy = Math.abs(b.maxY ?? 0) >= Math.abs(b.minY ?? 0) ? (b.maxY ?? 0) : (b.minY ?? 0);
  if (!dx && !dy) { if (on.axis === 'y') dy = 1; else dx = 1; }
  return { dx, dy };
}

interface ObjState { x: number; y: number; fx: number; fy: number; px: number; py: number; rot: number; sc: number; opacity: number; visible: boolean }
interface RunAnim { anim: Animation; preset?: string; ambient: boolean; scrub?: { name: string; dur: number } }
interface Tween { t0: number; dur: number; fn: (p: number) => void; done?: () => void }
interface Gesture {
  pointerId: number; sx: number; sy: number; t0: number; moved: boolean;
  tapId: string | null; pressIds: string[]; dragB: Behavior[]; dragIds: string[]; dragStart: Record<string, Vec>; dragging: boolean; primary: string | null;
  pressTimers: number[]; hold: NonNullable<ActionCtx['hold']>; pressedBs: Behavior[]; bendBase?: { y: number };
}

const HAPTICS: Record<HapticPattern, number[]> = { tap: [10], tug: [8, 40, 18], soft: [6], success: [12, 60, 12, 60, 30], knock: [18, 70, 18] };
const SVG_SHAPES = 'path,line,polyline,polygon,ellipse,rect,circle';
const TAP_SLOP = 8;       // client px
const DOUBLE_TAP_MS = 320;
const MAX_EMIT_DEPTH = 8;

export class LivingEngine implements RuntimeHost {
  readonly vars: VarStore;
  audio: BookAudioApi | null;
  private o: EngineOptions;
  private interp: ActionInterpreter;
  private goals: GoalTracker;
  private el = new Map<string, SVGGElement>();
  private info = new Map<string, ObjInfo>();
  private st = new Map<string, ObjState>();
  private running = new Map<string, RunAnim[]>();
  private resolved = new Map<string, string[]>();   // behaviour id -> target ids
  private bs: Behavior[];
  private _reduced: boolean; private _sound: boolean;
  private active = false; private visible = true; private destroyed = false;
  private timers: number[] = []; private intervals: number[] = [];
  private gesture: Gesture | null = null;
  private lastTap: { id: string; t: number } | null = null;
  private pointer: { cx: number; cy: number; x: number; y: number } | null = null;
  private speed = new SpeedTracker();
  private gates = new Map<string, ProximityGate>();
  private whenPrev = new Map<string, boolean>();
  private follows: Array<{ ids: string[]; lagMs?: number; lookAt?: boolean; maxOffset?: number }> = [];
  private parallax: Array<{ ids: string[]; depth: number; axis: 'x' | 'y' | 'both' }> = [];
  private tweens: Tween[] = [];
  private typeOns: Array<{ id: string; t0: number; dur: number; spans: Array<{ el: SVGTSpanElement; html: string; text: string }>; total: number }> = [];
  private particles: Particle[] = [];
  private trailCfg: { kind: BurstKind; whileVar?: string; lastX: number; lastY: number } | null = null;
  private raf = 0; private lastFrame = 0;
  private tilt = { x: 0, y: 0, tx: 0, ty: 0, sensor: false };
  private tiltListening = false;
  private emitDepth = 0;
  private speech: { cancel(): void } | null = null;
  private seq = 0;
  private scrubs: Array<{ varName: string; apply: () => void }> = [];
  private origText = new Map<string, string>();
  private cleanups: Array<() => void> = [];

  constructor(opts: EngineOptions) {
    this.o = opts; this.audio = opts.audio; this._reduced = opts.reducedMotion; this._sound = opts.soundEnabled;
    this.vars = new VarStore(opts.living.vars ?? {});
    this.goals = new GoalTracker(opts.living.goals ?? []);
    this.bs = opts.living.behaviors.filter(b => (b as { disabled?: boolean }).disabled !== true);   // authors can switch a behaviour off without deleting it
    for (const o of opts.objects) {
      this.info.set(o.id, o);
      const g = opts.svg.querySelector<SVGGElement>(`[data-obj-id="${cssEscape(o.id)}"]`);
      if (g) { this.el.set(o.id, g); g.style.transformBox = 'fill-box'; g.style.transformOrigin = '50% 50%'; }
      this.st.set(o.id, newState());
    }
    this.st.set(PAGE_ID, newState());
    opts.pageG.style.transformOrigin = `${opts.width / 2}px ${opts.height / 2}px`; (opts.pageG.style as CSSStyleDeclaration & { transformBox: string }).transformBox = 'view-box';
    for (const b of this.bs) this.resolved.set(b.id, resolveTarget(b.target, opts.objects, opts.living.groups));
    this.interp = new ActionInterpreter(this);
    this.vars.subscribe((name, value) => this.onVar(name, value as never));
    this.bindInput();
    this.markDragTargets();
  }

  // ───────────────────────────── RuntimeHost ─────────────────────────────
  reduced() { return this._reduced; }
  sound() { return this._sound; }
  now() { return performance.now(); }
  resolve(t: Target | undefined, ctx: ActionCtx): string[] { return t ? resolveTarget(t, this.o.objects, this.o.living.groups) : ctx.targets; }
  centerOf(ids: string[]) {
    const real = ids.filter(i => i !== PAGE_ID);
    if (!real.length) return ids.includes(PAGE_ID) ? { x: this.o.width / 2, y: this.o.height / 2 } : null;
    const boxes = real.map(id => this.boxOf(id)); const u = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const b of boxes) { u.x0 = Math.min(u.x0, b.x); u.y0 = Math.min(u.y0, b.y); u.x1 = Math.max(u.x1, b.x + b.w); u.y1 = Math.max(u.y1, b.y + b.h); }
    return { x: (u.x0 + u.x1) / 2, y: (u.y0 + u.y1) / 2 };
  }
  sleep(ms: number) { return new Promise<void>(res => { const id = window.setTimeout(res, ms); this.timers.push(id); }); }
  private said: string[] = []; private sayQueued = false;
  /** Messages in the same tick are joined ("Goal complete: X. Well done!") so a screen reader hears all of them. */
  announce(text: string) {
    if (!this.o.announce) return;
    if (!text) { this.o.announce(''); return; }
    this.said.push(text);
    if (this.sayQueued) return; this.sayQueued = true;
    queueMicrotask(() => { this.sayQueued = false; const t = this.said.join('. '); this.said = []; this.o.announce?.(t); });
  }
  emit(name: string, payload?: unknown) {
    this.o.onEmit?.(name, payload);
    if (this.emitDepth >= MAX_EMIT_DEPTH) return;
    this.emitDepth++;
    try { for (const b of this.bs) if (b.on.type === 'event' && b.on.name === name) this.interp.fire(b, { targets: this.resolved.get(b.id) ?? [] }); }
    finally { this.emitDepth--; }
  }
  goto(p: number | 'next' | 'prev') { this.o.onGoto?.(p); }
  haptic(p: HapticPattern) { if (this._reduced) return; try { navigator.vibrate?.(HAPTICS[p]); } catch { /* unsupported: no haptics */ } }

  // ───────────────────────────── lifecycle ─────────────────────────────
  get isActive() { return this.active; }

  /** The page became visible: reset to rest, run `enter` + `idle`, arm timers and `when` triggers. */
  start() {
    if (this.destroyed) return;
    this.stopAll(false);
    this.active = true;
    this.goals.reset(); this.vars.reset(); this.interp.resetCounters(); this.whenPrev.clear(); this.gates.clear();
    this.resetObjects();
    this.prehideEntrances();
    for (const b of this.bs) {
      const targets = this.resolved.get(b.id) ?? [];
      if (b.on.type === 'enter' || b.on.type === 'idle' || b.on.type === 'tilt') this.interp.fire(b, { targets });
    }
    this.armTimers();
    this.evalWhen(null);
    this.checkGoals();
    if (this.needsTilt()) this.ensureTilt();
    this.wake();
  }

  /** The page was left: run `exit` once, then cancel everything. */
  stop() {
    if (!this.active) return;
    for (const b of this.bs) if (b.on.type === 'exit') this.interp.fire(b, { targets: this.resolved.get(b.id) ?? [] });
    this.stopAll(true);
    this.active = false;
  }

  replay() { this.stopAll(false); this.active = false; this.start(); }

  setReduced(r: boolean) { if (r === this._reduced) return; this._reduced = r; if (this.active) this.replay(); }
  setSound(s: boolean) { this._sound = s; }
  setAudio(a: BookAudioApi | null) { this.audio = a; }

  /** Not visible (scrolled away / tab hidden / page turned): freeze animations and the loop; visible again: resume. */
  setVisible(v: boolean) {
    if (v === this.visible) return; this.visible = v;
    for (const list of this.running.values()) for (const r of list) { try { if (!r.scrub) { if (v) { if (r.anim.playState === 'paused') r.anim.play(); } else r.anim.pause(); } } catch { /* finished */ } }
    if (v) this.wake(); else this.sleepLoop();
  }
  pause() { this.setVisible(false); }
  resume() { this.setVisible(true); }

  destroy() { this.stopAll(true); this.destroyed = true; this.interp.dispose(); this.cleanups.forEach(f => f()); this.cleanups = []; }

  private stopAll(full: boolean) {
    this.interp.cancel();
    this.timers.forEach(clearTimeout); this.timers = []; this.intervals.forEach(clearInterval); this.intervals = [];
    for (const list of this.running.values()) for (const r of list) { try { r.anim.cancel(); } catch { /* */ } }
    this.running.clear(); this.scrubs = [];
    this.restoreTyping(); this.tweens = []; this.follows = []; this.parallax = []; this.trailCfg = null;
    this.releaseGesture(false);
    this.cancelSpeech();
    this.restoreText();
    if (full) { this.particles = []; this.clearCanvas(); }
    this.sleepLoop();
  }

  private resetObjects() {
    for (const [id, s] of this.st) { Object.assign(s, newState()); this.applyState(id); }
    for (const g of this.el.values()) { g.querySelectorAll<SVGElement>(SVG_SHAPES).forEach(s => { s.style.removeProperty('fill'); s.style.removeProperty('stroke-dasharray'); s.style.removeProperty('stroke-dashoffset'); }); }
    this.setTint(null, 0);
  }

  /** Objects an `enter` behaviour fades/draws/types in start hidden, so there is no flash of the finished art. */
  private prehideEntrances() {
    for (const b of this.bs) {
      if (b.on.type !== 'enter') continue;
      const targets = this.resolved.get(b.id) ?? [];
      for (const a of b.do) if (a.do === 'animate' && isEntrancePreset(a.anim.preset) && a.anim.preset !== 'draw-on' && a.anim.preset !== 'type-on') {
        for (const id of a.target ? resolveTarget(a.target, this.o.objects, this.o.living.groups) : targets) { const s = this.st.get(id); if (s && id !== PAGE_ID) { s.opacity = 0; this.applyState(id); } }
      }
    }
  }

  // ───────────────────────────── state -> DOM ─────────────────────────────
  private boxOf(id: string) {
    const b = this.info.get(id)?.box ?? { x: 0, y: 0, w: this.o.width, h: this.o.height }; const s = this.st.get(id);
    return s ? { x: b.x + s.x + s.fx + s.px, y: b.y + s.y + s.fy + s.py, w: b.w * s.sc, h: b.h * s.sc } : b;
  }

  private applyState(id: string) {
    const s = this.st.get(id); if (!s) return;
    const target: SVGElement | undefined = id === PAGE_ID ? this.o.pageG : this.el.get(id); if (!target) return;
    const x = s.x + s.fx + s.px, y = s.y + s.fy + s.py;
    const t = x || y || s.rot || s.sc !== 1 ? `translate(${r2(x)}px, ${r2(y)}px) rotate(${r2(s.rot)}deg) scale(${r2(s.sc)})` : '';
    target.style.transform = t;
    if (id !== PAGE_ID) {
      target.style.opacity = s.opacity === 1 ? '' : String(s.opacity);
      target.style.visibility = s.visible ? '' : 'hidden';
    } else if (s.opacity !== 1 && !this.o.tint) target.style.opacity = String(s.opacity);
  }

  private setTint(color: string | null, opacity: number) {
    const t = this.o.tint; if (!t) return;
    if (color) t.setAttribute('fill', color);
    t.style.opacity = String(opacity); t.style.transition = this._reduced ? 'none' : 'opacity .6s ease';
  }

  private commit(id: string, c: Commit | undefined) {
    if (!c) return; const s = this.st.get(id); if (!s) return;
    if (c.dx) s.x += c.dx; if (c.dy) s.y += c.dy; if (c.scaleMul) s.sc *= c.scaleMul; if (c.rotate) s.rot += c.rotate;
    if (c.opacity !== undefined) s.opacity = c.opacity; if (c.visible !== undefined) s.visible = c.visible;
    this.applyState(id);
  }

  // ───────────────────────────── animate / set / show ─────────────────────────────
  animate(ids: string[], spec: AnimSpec, ctx: ActionCtx) {
    for (const id of ids) {
      const s = this.st.get(id); if (!s) continue;
      const box = id === PAGE_ID ? { x: 0, y: 0, w: this.o.width, h: this.o.height } : (this.info.get(id)?.box ?? { x: 0, y: 0, w: 1, h: 1 });
      const c = compileAnim(spec, { box, pageW: this.o.width, pageH: this.o.height, reduced: this._reduced, seed: seedForObject(id + ':' + (spec.preset ?? 'kf')) });
      this.play(id, c, ctx);
    }
  }

  private play(id: string, c: CompiledAnim, ctx: ActionCtx) {
    const s = this.st.get(id)!; const target: SVGElement | undefined = id === PAGE_ID ? this.o.pageG : this.el.get(id);
    if (!target) return;
    if (c.special === 'parallax') {
      const tb = this.bs.find(x => x.id === ctx.behaviorId); const tt = tb && tb.on.type === 'tilt' ? tb.on : null;
      this.parallax = this.parallax.filter(q => !q.ids.includes(id));
      this.parallax.push({ ids: [id], depth: 18 * c.amount * (tt?.gain ?? 1), axis: tt?.axis ?? 'both' }); this.ensureTilt(); this.wake(); return;
    }
    if (c.special === 'draw-on') { s.opacity = 1; s.visible = true; this.applyState(id); this.drawOn(id, c); return; }
    if (c.special === 'type-on') { s.opacity = 1; s.visible = true; this.applyState(id); this.typeOn(id, c); return; }
    if (c.skipped) { if (c.skipped === 'reduced') this.commit(id, c.commit); return; }   // reduced motion: the end state without the movement
    // The same preset restarts instead of stacking (re-tapping a wiggle).
    if (c.preset) this.cancelPreset(id, c.preset);
    const list = this.running.get(id) ?? []; this.running.set(id, list);
    const stateful = !!c.commit;
    const scrub = c.scrubVar ? { name: c.scrubVar, dur: Math.max(1, c.durationMs) } : undefined;
    const channels: Array<[string, NonNullable<CompiledAnim['channels'][keyof CompiledAnim['channels']]>, CompositeOperation]> = [];
    if (c.channels.transform) channels.push(['transform', c.channels.transform, 'add']);
    if (c.channels.opacity) channels.push(['opacity', c.channels.opacity, 'replace']);
    if (c.channels.filter) channels.push(['filter', c.channels.filter, 'add']);
    let pending = channels.length;
    for (const [prop, frames, composite] of channels) {
      const kfs: Keyframe[] = frames.map(f => ({ offset: f.offset, [prop]: f.value, ...(f.easing ? { easing: f.easing } : {}), ...(prop === 'transform' && c.origin ? { transformOrigin: c.origin } : {}) }));
      let a: Animation;
      try {
        a = target.animate(kfs, { duration: Math.max(1, c.durationMs), delay: scrub ? 0 : c.delayMs, iterations: scrub ? 1 : c.iterations, direction: c.direction, easing: c.easing, fill: c.ambient && !stateful ? 'none' : stateful ? 'both' : 'none', composite });
      } catch (e) { console.warn('[living] animate failed', e); continue; }
      const ra: RunAnim = { anim: a, preset: c.preset, ambient: c.ambient, scrub };
      list.push(ra);
      if (!this.visible) a.pause();
      if (scrub) { a.pause(); this.bindScrub(scrub.name, a, scrub.dur); }
      else {
        a.finished.then(() => {
          pending--;
          if (!stateful || pending > 0) { if (!stateful) this.dropRun(id, ra); return; }
          this.commit(id, c.commit); try { a.cancel(); } catch { /* */ } this.dropRun(id, ra);
          for (const other of list.slice()) if (other.preset === c.preset && other !== ra && !other.ambient) { try { other.anim.cancel(); } catch { /* */ } this.dropRun(id, other); }
        }).catch(() => { /* cancelled */ });
      }
    }
    this.wake();
  }

  private dropRun(id: string, r: RunAnim) { const l = this.running.get(id); if (!l) return; const i = l.indexOf(r); if (i >= 0) l.splice(i, 1); }
  private cancelPreset(id: string, preset: string) { const l = this.running.get(id); if (!l) return; for (const r of l.slice()) if (r.preset === preset && !r.scrub) { try { r.anim.cancel(); } catch { /* */ } this.dropRun(id, r); } }

  private bindScrub(name: string, a: Animation, dur: number) {
    const apply = () => { const v = Math.min(1, Math.max(0, this.vars.num(name))); try { a.currentTime = v * dur * 0.9999; } catch { /* */ } };
    apply(); this.scrubs.push({ varName: name, apply });
  }

  stopAnim(ids: string[]) {
    for (const id of ids) {
      const l = this.running.get(id); if (l) for (const r of l) { try { r.anim.cancel(); } catch { /* */ } }
      this.running.delete(id);
      this.restoreTyping(id);
      const el = this.el.get(id); if (el) el.querySelectorAll<SVGElement>(SVG_SHAPES).forEach(s => { s.getAnimations?.().forEach(a => a.cancel()); s.style.removeProperty('stroke-dasharray'); s.style.removeProperty('stroke-dashoffset'); });
    }
  }

  setProps(ids: string[], props: Record<string, unknown>) {
    for (const id of ids) {
      const s = this.st.get(id); if (!s) continue;
      if (id === PAGE_ID) {
        if (typeof props.fill === 'string' || typeof props.opacity === 'number') this.setTint(typeof props.fill === 'string' ? props.fill : '#000', typeof props.opacity === 'number' ? props.opacity : 0.5);
        if (typeof props.x === 'number') s.x = props.x; if (typeof props.y === 'number') s.y = props.y;
        if (typeof props.scale === 'number') s.sc = props.scale; if (typeof props.rotate === 'number') s.rot = props.rotate;
        this.applyState(id); continue;
      }
      if (typeof props.x === 'number') s.x = props.x;
      if (typeof props.y === 'number') s.y = props.y;
      if (typeof props.opacity === 'number') s.opacity = props.opacity;
      if (typeof props.scale === 'number') s.sc = props.scale;
      if (typeof props.rotate === 'number') s.rot = props.rotate;
      if (typeof props.visible === 'boolean') s.visible = props.visible;
      if (typeof props.fill === 'string') this.el.get(id)?.querySelectorAll<SVGElement>(SVG_SHAPES + ',text,tspan').forEach(n => n.style.setProperty('fill', props.fill as string));
      if (typeof props.text === 'string') this.setText(id, props.text);
      this.applyState(id);
    }
  }

  private setText(id: string, text: string) {
    const g = this.el.get(id); const t = g?.querySelector('text'); if (!t) return;
    if (!this.origText.has(id)) this.origText.set(id, t.innerHTML);
    const lines = text.split('\n'); const spans = Array.from(t.querySelectorAll('tspan'));
    if (!spans.length) { t.textContent = text; return; }
    spans.forEach((sp, i) => { sp.textContent = i === 0 ? lines.join(' ') : ''; });
  }
  /** An interrupted type-on must leave the text whole (the flat page is always readable). */
  private restoreTyping(id?: string) {
    this.typeOns = this.typeOns.filter(t => { if (id && t.id !== id) return true; for (const sp of t.spans) sp.el.innerHTML = sp.html; return false; });
  }
  private restoreText() { for (const [id, html] of this.origText) { const t = this.el.get(id)?.querySelector('text'); if (t) t.innerHTML = html; } this.origText.clear(); }

  visibility(ids: string[], mode: 'show' | 'hide' | 'toggle', spec?: AnimSpec) {
    for (const id of ids) {
      const s = this.st.get(id); if (!s) continue;
      const showNow = mode === 'show' || (mode === 'toggle' && (!s.visible || s.opacity === 0));
      const preset = spec?.preset ?? (showNow ? 'fade-in' : 'fade-out');
      const sp: AnimSpec = { ...spec, preset, durationMs: spec?.durationMs ?? 350 };
      if (showNow) { s.visible = true; s.opacity = 0; this.applyState(id); this.animate([id], sp.preset!.endsWith('out') ? { ...sp, preset: 'fade-in' } : sp, { targets: [id] }); }
      else if (this._reduced || !s.visible) { s.opacity = 0; s.visible = false; this.applyState(id); }
      else this.animate([id], sp.preset!.endsWith('in') ? { ...sp, preset: 'fade-out' } : sp, { targets: [id] });
    }
  }

  // ───────────────────────────── draw-on / type-on ─────────────────────────────
  private drawOn(id: string, c: CompiledAnim) {
    const g = this.el.get(id); if (!g) return;
    const shapes = Array.from(g.querySelectorAll<SVGGeometryElement>(SVG_SHAPES)).filter(s => !s.closest('defs'));
    const stroked = shapes.filter(s => { const cs = getComputedStyle(s); return cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0 && !(s.getAttribute('stroke-dasharray')); });
    if (!stroked.length || this._reduced && c.durationMs === 0) {
      if (!stroked.length && !this._reduced) this.animate([id], { preset: 'fade-in', durationMs: c.durationMs || 700 }, { targets: [id] });
      return;
    }
    const scrub = c.scrubVar ? { name: c.scrubVar, dur: Math.max(1, c.durationMs) } : undefined;
    for (const sh of stroked) {
      let len = 0; try { len = sh.getTotalLength(); } catch { /* not geometry */ }
      if (!len) continue;
      sh.style.strokeDasharray = String(len);
      const a = sh.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: Math.max(1, c.durationMs), delay: scrub ? 0 : c.delayMs, easing: c.easing, fill: 'both' });
      const list = this.running.get(id) ?? []; this.running.set(id, list);
      const ra: RunAnim = { anim: a, preset: 'draw-on', ambient: false, scrub };
      list.push(ra);
      if (scrub) { a.pause(); this.bindScrub(scrub.name, a, scrub.dur); }
      else a.finished.then(() => { sh.style.removeProperty('stroke-dasharray'); try { a.cancel(); } catch { /* */ } this.dropRun(id, ra); }).catch(() => { /* cancelled */ });
    }
    this.wake();
  }

  private typeOn(id: string, c: CompiledAnim) {
    const t = this.el.get(id)?.querySelector('text'); if (!t) return;
    const spans = Array.from(t.querySelectorAll('tspan')) as SVGTSpanElement[];
    if (!spans.length) return;
    const data = spans.map(el => ({ el, html: el.innerHTML, text: el.textContent ?? '' }));
    const total = data.reduce((n, d) => n + d.text.length, 0);
    if (this._reduced || total === 0) return;
    const dur = c.durationMs > 0 ? c.durationMs : Math.min(4000, Math.max(500, total * 45));
    this.typeOns = this.typeOns.filter(x => x.id !== id);
    this.typeOns.push({ id, t0: performance.now() + c.delayMs, dur, spans: data, total });
    for (const d of data) d.el.textContent = '';
    this.wake();
  }

  // ───────────────────────────── bursts, trail, follow, narrate, celebrate ─────────────────────────────
  burst(at: { x: number; y: number }, kind: BurstKind, count = 14) {
    if (this._reduced || !this.o.canvas) return;
    this.particles = addParticles(this.particles, spawn(kind, at.x, at.y, count, hashString(`${kind}:${this.seq++}:${Math.round(at.x)}:${Math.round(at.y)}`)));
    this.wake();
  }
  trail(kind: BurstKind, whileVar?: string) { this.trailCfg = { kind, whileVar, lastX: -1e9, lastY: -1e9 }; }
  follow(ids: string[], opts: { lagMs?: number; lookAt?: boolean; maxOffset?: number }) { this.follows = this.follows.filter(f => !f.ids.some(i => ids.includes(i))); this.follows.push({ ids, ...opts }); this.wake(); }

  celebrate() {
    this.announce('Well done!');
    if (this._reduced) return;
    const W = this.o.width, H = this.o.height;
    this.burst({ x: W * 0.25, y: H * 0.3 }, 'confetti', 24); this.burst({ x: W * 0.75, y: H * 0.3 }, 'confetti', 24); this.burst({ x: W * 0.5, y: H * 0.2 }, 'stars', 14);
  }

  narrate(from?: number, to?: number) {
    if (!this._sound || !this.audio) return;
    this.cancelSpeech();
    const nar = this.o.living.narration;
    const ids = this.o.narrationIds ?? [];
    const visible = ids.flatMap(id => (this.o.texts?.[id] ?? '').split(/\s+/).filter(Boolean));
    const text = (nar?.text ?? visible.join(' ')).trim(); if (!text) return;
    const words = text.split(/\s+/).filter(Boolean);
    const a = Math.max(0, from ?? 0), b = Math.min(words.length - 1, to ?? words.length - 1);
    const part = words.slice(a, b + 1).join(' ');
    const canHighlight = words.length === visible.length;
    if (canHighlight) this.wrapWords();
    const sp = this.audio.speak(part, { voice: nar?.voice, rate: nar?.rate, onWord: i => { if (canHighlight) this.highlightWord(a + i); this.o.onWord?.(a + i); } });
    this.speech = sp;
    sp.done.then(() => { if (this.speech === sp) { this.clearHighlight(); this.o.onWord?.(-1); this.speech = null; } }).catch(() => { /* cancelled */ });
  }
  cancelSpeech() { if (this.speech) { try { this.speech.cancel(); } catch { /* */ } this.speech = null; this.clearHighlight(); } }

  private wrapped = false;
  private wrapWords() {
    if (this.wrapped && this.o.svg.querySelector('[data-w]')) return;
    let n = 0;
    for (const id of this.o.narrationIds ?? []) {
      const t = this.el.get(id)?.querySelector('text'); if (!t) continue;
      if (!this.origText.has(id)) this.origText.set(id, t.innerHTML);
      t.querySelectorAll('tspan').forEach(sp => {
        const parts = (sp.textContent ?? '').split(/(\s+)/); sp.textContent = '';
        for (const p of parts) {
          if (!p) continue;
          if (/^\s+$/.test(p)) { sp.appendChild(document.createTextNode(p)); continue; }
          const w = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); w.setAttribute('data-w', String(n++)); w.textContent = p; sp.appendChild(w);
        }
      });
    }
    this.wrapped = true;
  }
  private highlightWord(i: number) {
    this.o.svg.querySelectorAll<SVGElement>('[data-w]').forEach(w => { const n = Number(w.getAttribute('data-w')); w.style.fill = n === i ? '#ff8c00' : ''; w.style.textDecoration = n === i ? 'underline' : ''; });
  }
  private clearHighlight() { this.o.svg.querySelectorAll<SVGElement>('[data-w]').forEach(w => { w.style.fill = ''; w.style.textDecoration = ''; }); }

  // ───────────────────────────── triggers: timers / when / var / goals ─────────────────────────────
  private armTimers() {
    for (const b of this.bs) {
      if (b.on.type !== 'timer') continue; const on = b.on; const targets = this.resolved.get(b.id) ?? [];
      const fire = () => { if (this.visible && this.active) this.interp.fire(b, { targets }); };
      if (on.every) this.intervals.push(window.setInterval(fire, Math.max(50, on.afterMs)));
      else this.timers.push(window.setTimeout(fire, on.afterMs));
    }
  }

  private evalWhen(changed: string | null) {
    for (const b of this.bs) {
      if (b.on.type !== 'when') continue;
      if (changed && !condVars(b.on.cond).has(changed)) continue;
      const now = evalCond(b.on.cond, this.vars.get); const prev = this.whenPrev.get(b.id) ?? false;
      this.whenPrev.set(b.id, now);
      if (now && !prev && this.active) this.interp.fire(b, { targets: this.resolved.get(b.id) ?? [] });
    }
  }

  private onVar(name: string, _value: unknown) {
    for (const s of this.scrubs) if (s.varName === name) s.apply();
    if (this.active) { this.evalWhen(name); this.checkGoals(); }
    if (this.trailCfg?.whileVar === name) this.wake();
  }

  private checkGoals() {
    for (const g of this.goals.check(this.vars.get)) {
      this.o.onGoal?.(this.o.living.page, g.id);
      this.announce(`Goal complete: ${g.label}`);
      if (g.celebrate) void this.interp.run([{ do: 'celebrate' }], { targets: [] });
    }
  }
  /** For tests and the reader. */
  completedGoals() { return this.goals.completed(); }

  // ───────────────────────────── input ─────────────────────────────
  private toPage(cx: number, cy: number) {
    const r = this.o.svg.getBoundingClientRect(); const k = r.width ? this.o.width / r.width : 1;
    return { x: (cx - r.left) * k, y: (cy - r.top) * k, k, rect: r };
  }

  private hitStack(cx: number, cy: number): string[] {
    const root = this.o.root.getRootNode() as Document | ShadowRoot;
    const els = (root as Document).elementsFromPoint?.(cx, cy) ?? [];
    const out: string[] = [];
    for (const e of els) { const g = (e as Element).closest?.('[data-obj-id]') as SVGElement | null; const id = g?.getAttribute('data-obj-id'); if (id && this.o.root.contains(g) && !out.includes(id) && this.st.get(id)?.visible !== false) out.push(id); }
    return out;
  }

  private targetsOf(b: Behavior) { return this.resolved.get(b.id) ?? []; }
  private matching(types: Trigger['type'][], id: string): Behavior[] {
    return this.bs.filter(b => types.includes(b.on.type) && (this.targetsOf(b).includes(id) || (id === PAGE_ID && 'page' in b.target)));
  }
  private hasType(types: Trigger['type'][]) { return this.bs.some(b => types.includes(b.on.type)); }

  private bindInput() {
    const root = this.o.root;
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: string, fn: (e: never) => void, opt?: AddEventListenerOptions) => { t.addEventListener(type, fn as EventListener, opt); this.cleanups.push(() => t.removeEventListener(type, fn as EventListener, opt)); };
    on(root, 'pointerdown', ((e: PointerEvent) => this.onDown(e)) as never);
    // Document-level: speed and position keep tracking while the pointer is outside the page, so an approach from outside is measured honestly.
    on(document, 'pointermove', ((e: PointerEvent) => this.onMove(e)) as never);
    on(root, 'pointerup', ((e: PointerEvent) => this.onUp(e, false)) as never);
    on(root, 'pointercancel', ((e: PointerEvent) => this.onUp(e, true)) as never);
    on(document, 'pointerout', ((e: PointerEvent) => { if (!e.relatedTarget && !this.gesture) { this.pointer = null; this.speed.reset(); for (const g of this.gates.values()) g.armed = true; this.wake(); } }) as never);
    on(root, 'contextmenu', ((e: Event) => { if (this.hasType(['press'])) e.preventDefault(); }) as never);
    on(document, 'keydown', ((e: KeyboardEvent) => this.onKey(e)) as never);
  }

  private markDragTargets() {
    for (const b of this.bs) if (b.on.type === 'drag' || b.on.type === 'press') for (const id of this.targetsOf(b)) { const g = this.el.get(id); if (g) { g.style.touchAction = 'none'; g.style.cursor = b.on.type === 'drag' ? 'grab' : 'pointer'; g.setAttribute('data-no-pageturn', ''); } }   // data-no-pageturn: PageTurn ignores gestures that start here
    for (const b of this.bs) if (b.on.type === 'tap' || b.on.type === 'doubleTap') for (const id of this.targetsOf(b)) { const g = this.el.get(id); if (g && !g.style.cursor) g.style.cursor = 'pointer'; }
  }

  private onDown(e: PointerEvent) {
    if (!this.active || !this.visible || (e.pointerType === 'mouse' && e.button !== 0) || this.gesture) return;
    this.speed.reset(); this.speed.push(e.clientX, e.clientY, e.timeStamp);
    const p = this.toPage(e.clientX, e.clientY); this.pointer = { cx: e.clientX, cy: e.clientY, x: p.x, y: p.y };
    const stack = [...this.hitStack(e.clientX, e.clientY), PAGE_ID];
    const topFor = (types: Trigger['type'][]) => stack.find(id => this.matching(types, id).length > 0) ?? null;
    const tapId = topFor(['tap', 'doubleTap']);
    const pressId = topFor(['press', 'release']);
    const dragId = topFor(['drag']);
    if (!tapId && !pressId && !dragId) return;
    const g: Gesture = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, t0: e.timeStamp, moved: false, tapId, pressIds: pressId ? [pressId] : [], dragB: dragId ? this.matching(['drag'], dragId) : [], dragIds: [], dragStart: {}, dragging: false, primary: null, pressTimers: [], hold: { voices: [] }, pressedBs: [] };
    this.gesture = g;
    try { this.o.root.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const x01 = Math.min(1, Math.max(0, p.x / this.o.width));
    if (pressId) for (const b of this.matching(['press'], pressId)) {
      const minMs = (b.on as Extract<Trigger, { type: 'press' }>).minMs ?? 350;
      const go = () => { if (this.gesture === g && (!g.dragging)) { g.pressedBs.push(b); this.interp.fire(b, { targets: this.targetsOf(b), x01, point: { x: p.x, y: p.y }, hold: g.hold }); g.bendBase = { y: e.clientY }; } };
      if (minMs <= 0) go(); else g.pressTimers.push(window.setTimeout(go, minMs));
    }
    this.wake();
  }

  private onMove(e: PointerEvent) {
    if (!this.active) return;
    const sp = this.speed.push(e.clientX, e.clientY, e.timeStamp);
    const p = this.toPage(e.clientX, e.clientY);
    this.pointer = { cx: e.clientX, cy: e.clientY, x: p.x, y: p.y };
    const g = this.gesture;
    if (g && g.pointerId === e.pointerId) {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
      if (g.moved && g.dragB.length && !g.dragging) this.beginDrag(g, e);
      if (g.dragging) this.updateDrag(g, dx * p.k, dy * p.k);
      // A held voice bends with the finger: up = higher.
      if (g.hold.voices.length && g.bendBase) { const semis = Math.max(-7, Math.min(7, Math.round((g.bendBase.y - e.clientY) / 18))); const base = this.heldBase(g); if (base !== null) for (const v of g.hold.voices) v.setPitch(transpose(base, semis), 60); }
    }
    this.proximityTick(p.x, p.y, sp);
    this.hoverTick(e.clientX, e.clientY);
    if (this.trailCfg) this.trailTick(p.x, p.y);
    if (this.follows.length || this.usesTilt) this.wake();
  }

  private heldBase(g: Gesture): string | number | null {
    const b = g.pressedBs[0]; if (!b) return null;
    const n = b.do.find(a => a.do === 'note'); if (!n || n.do !== 'note') return null;
    return typeof n.note === 'string' && n.note.startsWith('scale:') ? null : n.note;
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    const g = this.gesture; if (!g || g.pointerId !== e.pointerId) return;
    g.pressTimers.forEach(clearTimeout);
    const wasDrag = g.dragging;
    const p = this.toPage(e.clientX, e.clientY);
    const x01 = Math.min(1, Math.max(0, p.x / this.o.width));
    if (wasDrag) this.endDrag(g);
    // release triggers + stop held voices
    for (const v of g.hold.voices) { try { v.stop(140); } catch { /* */ } }
    if (!cancelled && g.pressIds.length) for (const b of this.matching(['release'], g.pressIds[0])) this.interp.fire(b, { targets: this.targetsOf(b), x01, point: { x: p.x, y: p.y } });
    if (!cancelled && !wasDrag && !g.moved && g.tapId) {
      if (g.pressedBs.length === 0) {
        const ctx = { x01, point: { x: p.x, y: p.y } };
        for (const b of this.matching(['tap'], g.tapId)) this.interp.fire(b, { targets: this.targetsOf(b), ...ctx });
        const t = e.timeStamp;
        if (this.lastTap && this.lastTap.id === g.tapId && t - this.lastTap.t < DOUBLE_TAP_MS) { for (const b of this.matching(['doubleTap'], g.tapId)) this.interp.fire(b, { targets: this.targetsOf(b), ...ctx }); this.lastTap = null; }
        else this.lastTap = { id: g.tapId, t };
      }
    }
    try { this.o.root.releasePointerCapture(e.pointerId); } catch { /* */ }
    this.gesture = null; this.wake();
  }

  private releaseGesture(fire: boolean) { const g = this.gesture; if (!g) return; g.pressTimers.forEach(clearTimeout); for (const v of g.hold.voices) { try { v.stop(80); } catch { /* */ } } this.gesture = null; void fire; }

  // ── drag
  private beginDrag(g: Gesture, e: PointerEvent) {
    const first = g.dragB[0]; g.dragIds = Array.from(new Set(g.dragB.flatMap(b => this.targetsOf(b)))); g.primary = this.targetsOf(first)[0] ?? g.dragIds[0] ?? null;
    if (!g.primary) return;
    g.dragging = true; this.tweens = this.tweens.filter(t => !t.done);
    for (const id of g.dragIds) { const s = this.st.get(id); if (s) g.dragStart[id] = { x: s.x, y: s.y }; }
    const t = first.on as DragTrigger;
    if (t.progressVar) { this.vars.set(`${t.progressVar}.dragging`, true); }
    for (const b of g.dragB) { this.interp.fire(b, { targets: this.targetsOf(b), x01: this.toPage(e.clientX, e.clientY).x / this.o.width, point: this.pointer ? { x: this.pointer.x, y: this.pointer.y } : undefined }); this.emit(`drag:start:${b.id}`); }
    const el = this.el.get(g.primary); if (el) el.style.cursor = 'grabbing';
  }

  private updateDrag(g: Gesture, dxPage: number, dyPage: number) {
    const trig = g.dragB[0].on as DragTrigger; if (!g.primary) return;
    const startP = g.dragStart[g.primary];
    const want = clampDrag({ x: startP.x + dxPage, y: startP.y + dyPage }, trig);
    const ddx = want.x - startP.x, ddy = want.y - startP.y;
    for (const id of g.dragIds) { const s = this.st.get(id)!, s0 = g.dragStart[id]; s.x = s0.x + ddx; s.y = s0.y + ddy; this.applyState(id); }
    if (trig.progressVar) this.vars.set(trig.progressVar, round3(dragProgress(want, trig)));
  }

  private endDrag(g: Gesture) {
    if (!g.primary) return; const trig = g.dragB[0].on as DragTrigger; const s = this.st.get(g.primary)!;
    const cur = { x: s.x, y: s.y }; const rel = releaseTarget(cur, trig);
    const primary = g.primary, ids = g.dragIds, base = { ...g.dragStart };
    const move = (to: Vec) => {
      const from = ids.map(id => ({ id, x: this.st.get(id)!.x, y: this.st.get(id)!.y }));
      const dx = to.x - cur.x, dy = to.y - cur.y;
      if (this._reduced || (Math.abs(dx) < .5 && Math.abs(dy) < .5)) { for (const f of from) { const q = this.st.get(f.id)!; q.x = f.x + dx; q.y = f.y + dy; this.applyState(f.id); } if (trig.progressVar) this.vars.set(trig.progressVar, round3(dragProgress(to, trig))); return; }
      this.tweens.push({ t0: performance.now(), dur: 240, fn: p => { const k = 1 - Math.pow(1 - p, 3); for (const f of from) { const q = this.st.get(f.id)!; q.x = f.x + dx * k; q.y = f.y + dy * k; this.applyState(f.id); } if (trig.progressVar) this.vars.set(trig.progressVar, round3(dragProgress({ x: cur.x + dx * k, y: cur.y + dy * k }, trig))); } });
      this.wake();
    };
    if (rel.snapped >= 0 || rel.back) move(rel.to);
    if (trig.progressVar) { this.vars.set(`${trig.progressVar}.dragging`, false); this.vars.set(`${trig.progressVar}.snap`, rel.snapped + 1); }
    for (const b of g.dragB) { this.emit(`drag:end:${b.id}`); if (rel.snapped >= 0) this.emit(`drag:snap:${b.id}`, { index: rel.snapped }); }
    const el = this.el.get(primary); if (el) el.style.cursor = 'grab';
    void base;
  }

  // ── proximity / hover / trail
  private proxGroups: Behavior[][] | null = null;
  private unionOf(ids: string[]) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) { if (id === PAGE_ID) return { x: 0, y: 0, w: this.o.width, h: this.o.height }; const b = this.boxOf(id); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  private proximityTick(px: number, py: number, speed: number) {
    if (!this.proxGroups) {
      const groups = new Map<string, Behavior[]>();
      for (const b of this.bs) if (b.on.type === 'proximity') { const k = JSON.stringify(b.target); groups.set(k, [...(groups.get(k) ?? []), b]); }
      this.proxGroups = [...groups.values()];
    }
    for (const list of this.proxGroups) {
      let firedAny = false;
      for (const b of list) {
        const t = b.on as ProximityTrigger; const ids = this.targetsOf(b); if (!ids.length) continue;
        const u = this.unionOf(ids); if (!u) continue;
        const gate = this.gates.get(b.id) ?? new ProximityGate(); this.gates.set(b.id, gate);
        if (gate.update(t, distToBox(px, py, u), speed) && this.interp.fire(b, { targets: ids, point: { x: px, y: py }, x01: px / this.o.width })) firedAny = true;
      }
      // one approach, one reaction: siblings stay quiet until the pointer leaves the radius
      if (firedAny) for (const b of list) this.gates.get(b.id)?.disarm();
    }
  }

  private hoverState = new Set<string>();
  private hoverTick(cx: number, cy: number) {
    if (!this.hasType(['hover'])) return;
    const stack = this.hitStack(cx, cy); const now = new Set<string>();
    for (const id of stack) for (const b of this.matching(['hover'], id)) { now.add(b.id); if (!this.hoverState.has(b.id)) this.interp.fire(b, { targets: this.targetsOf(b) }); }
    this.hoverState = now;
  }

  private trailTick(px: number, py: number) {
    const t = this.trailCfg; if (!t || this._reduced) return;
    if (t.whileVar && !truthy(this.vars.get(t.whileVar))) return;
    if (Math.hypot(px - t.lastX, py - t.lastY) < 14) return;
    t.lastX = px; t.lastY = py; this.burst({ x: px, y: py }, t.kind, 2);
  }

  // ── keyboard triggers + the accessible layer's entry points
  private onKey(e: KeyboardEvent) {
    if (!this.active || !this.visible || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
    for (const b of this.bs) if (b.on.type === 'key' && b.on.key.toLowerCase() === k) this.interp.fire(b, { targets: this.targetsOf(b) });
  }

  /** The grouped, focusable controls for the accessible layer. */
  interactiveItems(): InteractiveItem[] {
    const items = new Map<string, InteractiveItem>();
    for (const b of this.bs) {
      const family = b.on.type === 'tap' || b.on.type === 'doubleTap' ? 'tap' : b.on.type === 'press' ? 'press' : b.on.type === 'drag' ? 'drag' : b.on.type === 'proximity' ? 'proximity' : null;
      if (!family) continue;
      const ids = this.targetsOf(b); const key = `${family}:${JSON.stringify(b.target)}`;
      const box = ids.includes(PAGE_ID) ? { x: 0, y: 0, w: this.o.width, h: this.o.height } : unionBox(ids, this.o.objects); if (!box) continue;
      const cur = items.get(key);
      if (cur) { cur.behaviorIds.push(b.id); if (!cur.hint && b.hint) cur.hint = b.hint; }
      else items.set(key, { key, family, behaviorIds: [b.id], hint: b.hint ?? '', ids, box, ...(b.on.type === 'drag' ? { vec: dragVec(b.on) } : {}) });
    }
    return [...items.values()].map(i => ({ ...i, hint: i.hint || 'Interactive element' }));
  }
  boxFor(item: InteractiveItem) { return this.centerBox(item.ids, item.box); }
  private centerBox(ids: string[], rest: { x: number; y: number; w: number; h: number }) { const real = ids.filter(i => i !== PAGE_ID); if (!real.length) return rest; const u = unionBox(real, real.map(id => ({ id, box: this.boxOf(id) }))); return u ?? rest; }

  /** Keyboard / switch activation of an item (Enter, Space). Tap items tap; press items press-and-release; drag items jump to the end; proximity items fire their gentle variant. */
  activateItem(item: InteractiveItem, phase: 'tap' | 'down' | 'up' = 'tap') {
    if (!this.active) return;
    const bs = item.behaviorIds.map(id => this.bs.find(b => b.id === id)!).filter(Boolean);
    const x01 = (item.box.x + item.box.w / 2) / this.o.width; const point = { x: item.box.x + item.box.w / 2, y: item.box.y + item.box.h / 2 };
    const ctxFor = (b: Behavior): ActionCtx => ({ targets: this.targetsOf(b), x01, point });
    if (item.family === 'tap') { for (const b of bs) this.interp.fire(b, ctxFor(b)); return; }
    if (item.family === 'proximity') { for (const b of bs) { const t = b.on as ProximityTrigger; if (t.fastAbove === undefined || t.slowBelow !== undefined) this.interp.fire(b, ctxFor(b)); } return; }
    if (item.family === 'press') {
      if (phase === 'down' || phase === 'tap') { const hold = { voices: [] as NonNullable<ActionCtx['hold']>['voices'] }; this.kbHold = hold; for (const b of bs) this.interp.fire(b, { ...ctxFor(b), hold }); }
      if (phase === 'up' || phase === 'tap') { const run = () => { this.kbHold?.voices.forEach(v => { try { v.stop(140); } catch { /* */ } }); this.kbHold = null; for (const b of this.bs.filter(q => q.on.type === 'release' && this.targetsOf(q).some(t => item.ids.includes(t)))) this.interp.fire(b, ctxFor(b)); }; if (phase === 'tap') this.timers.push(window.setTimeout(run, 600)); else run(); }
      return;
    }
    if (item.family === 'drag') this.keyboardDrag(item, bs, 'Enter');
  }
  private kbHold: NonNullable<ActionCtx['hold']> | null = null;

  /** Arrow keys nudge a drag target; Enter/Space completes it. */
  keyboardDrag(item: InteractiveItem, bs: Behavior[], key: string) {
    const b = bs[0]; if (!b) return; const trig = b.on as DragTrigger; const ids = this.targetsOf(b); const primary = ids[0]; const s = this.st.get(primary); if (!s) return;
    const started = this.kbDragging.has(item.key);
    if (!started) { this.kbDragging.add(item.key); for (const q of bs) { this.interp.fire(q, { targets: this.targetsOf(q) }); this.emit(`drag:start:${q.id}`); } }
    let to: Vec;
    if (key === 'Enter' || key === ' ') to = offsetForProgress(1, trig); else to = nudge({ x: s.x, y: s.y }, key, trig);
    const dx = to.x - s.x, dy = to.y - s.y;
    for (const id of ids) { const q = this.st.get(id)!; q.x += dx; q.y += dy; this.applyState(id); }
    const p = round3(dragProgress(to, trig));
    if (trig.progressVar) this.vars.set(trig.progressVar, p);
    const rel = releaseTarget(to, trig);
    if (key === 'Enter' || key === ' ') {
      this.kbDragging.delete(item.key);
      if (trig.progressVar) { this.vars.set(`${trig.progressVar}.snap`, rel.snapped + 1); }
      for (const q of bs) { this.emit(`drag:end:${q.id}`); if (rel.snapped >= 0) this.emit(`drag:snap:${q.id}`, { index: rel.snapped }); }
    }
    this.announce(`${Math.round(p * 100)} percent`);
  }
  private kbDragging = new Set<string>();

  // ── tilt
  private ensureTilt() {
    if (this.tiltListening) return; this.tiltListening = true;
    const h = (e: DeviceOrientationEvent) => { if (e.gamma === null && e.beta === null) return; this.tilt.sensor = true; this.tilt.tx = clamp1((e.gamma ?? 0) / 30); this.tilt.ty = clamp1(((e.beta ?? 45) - 45) / 30); this.wake(); };
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      const DOE = (window as unknown as { DeviceOrientationEvent: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (typeof DOE.requestPermission !== 'function') { window.addEventListener('deviceorientation', h); this.cleanups.push(() => window.removeEventListener('deviceorientation', h)); }
      else this.tiltHandler = h;
    }
  }
  private tiltHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  /** iOS: must be called from a user gesture. Safe elsewhere (no-op). */
  async requestTilt() {
    if (!this.needsTilt() || !this.tiltHandler) return;
    const DOE = (window as unknown as { DeviceOrientationEvent: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try { if ((await DOE.requestPermission?.()) === 'granted' && this.tiltHandler) { window.addEventListener('deviceorientation', this.tiltHandler); const h = this.tiltHandler; this.cleanups.push(() => window.removeEventListener('deviceorientation', h)); this.tiltHandler = null; } } catch { /* denied: pointer fallback stays */ }
  }
  private get usesTilt() { return this.parallax.length > 0 || this.needsTilt() || this.vars.get('tiltX') !== undefined; }
  needsTilt() { return this.bs.some(b => b.on.type === 'tilt'); }
  /** Test hook: drive tilt without a sensor. */
  setTilt(x: number, y: number) { this.tilt.sensor = true; this.tilt.tx = clamp1(x); this.tilt.ty = clamp1(y); this.wake(); }

  // ───────────────────────────── the one rAF loop ─────────────────────────────
  private wake() { if (this.raf || !this.visible || !this.active || this.destroyed || typeof requestAnimationFrame === 'undefined') return; this.lastFrame = performance.now(); this.raf = requestAnimationFrame(t => this.frame(t)); }
  private sleepLoop() { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } }
  /** Introspection for tests: is the loop asleep? */
  get loopRunning() { return this.raf !== 0; }

  private frame(now: number) {
    this.raf = 0; if (!this.visible || !this.active) return;
    const dt = Math.min(64, now - this.lastFrame); this.lastFrame = now;
    let busy = false;

    // tweens
    if (this.tweens.length) {
      const keep: Tween[] = [];
      for (const t of this.tweens) { const p = Math.min(1, (now - t.t0) / t.dur); t.fn(p); if (p < 1) keep.push(t); else t.done?.(); }
      this.tweens = keep; busy = busy || keep.length > 0;
    }
    // type-on
    if (this.typeOns.length) {
      const keep: typeof this.typeOns = [];
      for (const t of this.typeOns) {
        const p = Math.min(1, Math.max(0, (now - t.t0) / t.dur)); let n = Math.round(p * t.total);
        for (const sp of t.spans) { const take = Math.min(sp.text.length, n); sp.el.textContent = sp.text.slice(0, take); n -= take; }
        if (p < 1) keep.push(t); else for (const sp of t.spans) sp.el.innerHTML = sp.html;
      }
      this.typeOns = keep; busy = busy || keep.length > 0;
    }
    // tilt source: sensor, else pointer position over the page (desktop fallback)
    if (this.usesTilt) {
      if (!this.tilt.sensor && this.pointer) { const r = this.o.svg.getBoundingClientRect(); this.tilt.tx = clamp1(((this.pointer.cx - r.left) / Math.max(1, r.width)) * 2 - 1); this.tilt.ty = clamp1(((this.pointer.cy - r.top) / Math.max(1, r.height)) * 2 - 1); }
      const k = 1 - Math.exp(-dt / 140); const px = this.tilt.x, py = this.tilt.y;
      this.tilt.x += (this.tilt.tx - this.tilt.x) * k; this.tilt.y += (this.tilt.ty - this.tilt.y) * k;
      const moving = Math.abs(this.tilt.x - px) > 0.0005 || Math.abs(this.tilt.y - py) > 0.0005 || Math.abs(this.tilt.tx - this.tilt.x) > 0.002 || Math.abs(this.tilt.ty - this.tilt.y) > 0.002;
      if (moving && !this._reduced) {
        for (const b of this.parallax) for (const id of b.ids) { const s = this.st.get(id); if (s) { s.px = b.axis === 'y' ? 0 : -this.tilt.x * b.depth; s.py = b.axis === 'x' ? 0 : -this.tilt.y * b.depth; this.applyState(id); } }
        for (const b of this.bs) if (b.on.type === 'tilt') { const g = (b.on as Extract<Trigger, { type: 'tilt' }>).gain ?? 1; for (const id of this.targetsOf(b)) { const s = this.st.get(id); if (s && !this.parallax.some(p => p.ids.includes(id))) { const ax = (b.on as Extract<Trigger, { type: 'tilt' }>).axis ?? 'both'; s.px = ax === 'y' ? 0 : -this.tilt.x * 14 * g; s.py = ax === 'x' ? 0 : -this.tilt.y * 14 * g; this.applyState(id); } } }
        busy = true;
      }
      if (this.vars.get('tiltX') !== undefined) { this.vars.set('tiltX', round3(this.tilt.x)); this.vars.set('tiltY', round3(this.tilt.y)); }
    }
    // follow the pointer
    if (this.follows.length && !this._reduced) {
      for (const f of this.follows) {
        for (const id of f.ids) {
          const s = this.st.get(id); const b = this.info.get(id)?.box; if (!s || !b) continue;
          const rx = b.x + b.w / 2 + s.x + s.px, ry = b.y + b.h / 2 + s.y + s.py;   // rest centre (without the follow offset)
          let dx = f.lookAt ? 0 : s.fx, dy = f.lookAt ? 0 : s.fy;
          if (this.pointer) {
            const vx = this.pointer.x - rx, vy = this.pointer.y - ry, d = Math.hypot(vx, vy);
            const m = f.lookAt ? Math.min(f.maxOffset ?? 6, d * 0.12) : Math.min(f.maxOffset ?? Infinity, d);
            dx = d ? vx / d * m : 0; dy = d ? vy / d * m : 0;
          }
          const k = 1 - Math.exp(-dt / Math.max(16, f.lagMs ?? (f.lookAt ? 90 : 220)));
          const nx = s.fx + (dx - s.fx) * k, ny = s.fy + (dy - s.fy) * k;
          if (Math.abs(dx - nx) > 0.05 || Math.abs(dy - ny) > 0.05) busy = true;
          s.fx = nx; s.fy = ny; this.applyState(id);
        }
      }
    }
    // particles
    if (this.particles.length || this.canvasDirty) {
      this.particles = stepParticles(this.particles, dt); this.drawParticles();
      busy = busy || this.particles.length > 0;
    }
    if (busy) this.wake();
  }

  private canvasDirty = false;
  private clearCanvas() { const c = this.o.canvas; if (c) { const g = c.getContext('2d'); g?.clearRect(0, 0, c.width, c.height); } this.canvasDirty = false; }
  private drawParticles() {
    const c = this.o.canvas; if (!c) return; const g = c.getContext('2d'); if (!g) return;
    const r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    if (!this.particles.length) { this.canvasDirty = false; return; }
    const k = (r.width / this.o.width) * dpr; g.setTransform(k, 0, 0, k, 0, 0);
    for (const p of this.particles) drawParticle(g as never, p);
    this.canvasDirty = true;
  }

  /** Snapshot for tests / debugging. */
  debug() {
    return { vars: this.vars.snapshot(), goals: this.goals.completed(), particles: this.particles.length, loop: this.loopRunning, running: [...this.running].map(([id, l]) => [id, l.map(r => r.preset ?? '?')]), state: Object.fromEntries([...this.st].map(([id, s]) => [id, { x: r2(s.x), y: r2(s.y), fx: r2(s.fx), fy: r2(s.fy), px: r2(s.px), py: r2(s.py), sc: s.sc, opacity: s.opacity, visible: s.visible }])) };
  }
}

// ───────────────────────────── helpers ─────────────────────────────
function newState(): ObjState { return { x: 0, y: 0, fx: 0, fy: 0, px: 0, py: 0, rot: 0, sc: 1, opacity: 1, visible: true }; }
const r2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp1 = (n: number) => Math.max(-1, Math.min(1, n));
const truthy = (v: unknown) => v === true || (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v !== '' && v !== 'false');
const cssEscape = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d)$/;
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Transpose a note name or MIDI number by semitones. */
export function transpose(note: string | number, semis: number): string | number {
  if (typeof note === 'number') return note + semis;
  const m = NOTE_RE.exec(note); if (!m) return note;
  const midi = (parseInt(m[3], 10) + 1) * 12 + SEMI[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + semis;
  return midi;
}
