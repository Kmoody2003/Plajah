// scene — the builder storybook "designer programs" write illustrations with.
//
//   const s = new Scene({ width: 1024, height: 768, seed: 'moon-blanket/p7' });
//   s.layer(0, () => s.fill(rectPath(0, 0, 1024, 768), linear(...)));
//   s.group('Fox', () => { s.fill(body, '#E8743B', { material: s.material('gouache') }); s.ink(tail, '#3a2418', 6, PROFILES.tail); });
//   s.clip(hill, () => s.stroke(hatchLines, '#2b4a2f', 1.2));
//   return s.build();           // TelaVectorObject[] — drop straight into a Tela page
//
// Everything emits ordinary Tela PATH objects (editable in the Studio), with engine finish
// in `geom`. Ids are deterministic (prefix + counter) so a designer re-run produces the
// same document. Clipping is GEOMETRIC by default (booleans / open-path cutting) so the
// editor shows exactly what the exporter prints; very heavy content falls back to an SVG
// clip-path carried in geom.clip.
import type { TelaVectorObject, TelaBlendMode } from '../../../types';
import type { CompoundPath, Paint, StrokeStyle, MaterialRef, FillRule } from './model';
import { parsePathData, toPathData } from './pathData';
import { pathToObject, type PaintSpec, type Role } from './tela';
import { clipPath } from './clip';
import { outlineStroke, variableStroke, type WidthProfile, type VariableOpts } from './stroke';
import { boolean } from './boolean';
import { Random } from './procedural/random';
import { MATERIALS } from './materials/filters';
import { objectsToSvg } from './serialize';
import { pathCurves } from './model';

export type Shape = CompoundPath | string;
export interface SceneOptions { width: number; height: number; seed?: number | string; idPrefix?: string }
export interface Finish { opacity?: number; blend?: TelaBlendMode; blur?: number; material?: MaterialRef; label?: string; role?: Role; fillRule?: FillRule; shadow?: PaintSpec['shadow'] }

const asPath = (s: Shape): CompoundPath => typeof s === 'string' ? parsePathData(s) : s;
const curveCount = (p: CompoundPath) => pathCurves(p).reduce((n, c) => n + c.length, 0);

export class Scene {
  readonly width: number; readonly height: number; readonly random: Random;
  private items: Array<{ z: number; seq: number; o: TelaVectorObject }> = [];
  private seq = 0; private idn = 0; private readonly prefix: string;
  private groups: string[] = []; private clips: CompoundPath[] = []; private z = 0; private matSeed = 0;

  constructor(o: SceneOptions) {
    this.width = o.width; this.height = o.height; this.random = new Random(o.seed ?? 1);
    this.prefix = o.idPrefix ?? `s${typeof o.seed === 'string' ? o.seed.replace(/[^a-z0-9]/gi, '').slice(0, 12) : o.seed ?? 1}`;
  }
  /** Fresh deterministic id. */
  id(tag = 'p') { return `${this.prefix}_${tag}${(++this.idn).toString(36)}`; }
  /** A material reference with its own seed from the scene stream. */
  material(preset: keyof typeof MATERIALS | string, params?: Record<string, number | string>, seed?: number): MaterialRef { return { preset, params, seed: seed ?? (++this.matSeed * 37 + Math.floor(this.random.fork('mat').float(0, 1000))) }; }

  /** Low-level: add a path with a full paint spec. Returns the object (or null if clipped away). */
  path(shape: Shape, spec: PaintSpec): TelaVectorObject | null {
    let p = asPath(shape);
    if (this.clips.length) {
      const region = this.clips.length === 1 ? this.clips[0] : boolean('intersect', this.clips);
      const heavy = curveCount(p) > 400;
      if (heavy) spec = { ...spec, clip: { d: toPathData(region), fillRule: 'nonzero' } };
      else {
        const hasStroke = spec.stroke && spec.stroke !== 'none' && (spec.strokeWidth ?? 1) > 0;
        const hasFill = spec.fill && spec.fill !== 'none';
        const closed = p.subpaths.some(s => s.closed);
        if (hasStroke && hasFill && closed) {
          // split into a clipped fill and a clipped outlined stroke so the clip never draws an edge
          const f = this.path(p, { ...spec, stroke: 'none', strokeWidth: 0 });
          const st = outlineStroke(p, { width: spec.strokeWidth ?? 1, cap: spec.strokeStyle?.cap ?? 'round', join: spec.strokeStyle?.join ?? 'round', dash: spec.strokeStyle?.dash });
          this.path(st, { ...spec, fill: spec.stroke as Paint, stroke: 'none', strokeWidth: 0, label: `${spec.label ?? 'Vector'} stroke` });
          return f;
        }
        p = clipPath(p, region);
        if (!p.subpaths.length) return null;
      }
    }
    if (!p.subpaths.length) return null;
    const o = pathToObject(p, { ...spec, groupId: spec.groupId ?? this.groups[this.groups.length - 1] }, this.id());
    this.items.push({ z: this.z, seq: this.seq++, o });
    return o;
  }
  /** Filled shape. */
  fill(shape: Shape, paint: Paint, f: Finish = {}): TelaVectorObject | null {
    return this.path(shape, { fill: paint, stroke: 'none', strokeWidth: 0, opacity: f.opacity, blend: f.blend, blur: f.blur, material: f.material, label: f.label, role: f.role, fillRule: f.fillRule, shadow: f.shadow });
  }
  /** Real (SVG) stroke of constant width. */
  stroke(shape: Shape, paint: Paint, width: number, style: StrokeStyle = {}, f: Finish = {}): TelaVectorObject | null {
    return this.path(shape, { fill: 'none', stroke: paint, strokeWidth: width, strokeStyle: { cap: 'round', join: 'round', ...style }, opacity: f.opacity, blend: f.blend, blur: f.blur, material: f.material, label: f.label ?? 'Line', role: f.role });
  }
  /** Shape with fill AND stroke. */
  shape(shape: Shape, fillPaint: Paint, strokePaint: Paint, width: number, f: Finish & { style?: StrokeStyle } = {}): TelaVectorObject | null {
    return this.path(shape, { fill: fillPaint, stroke: strokePaint, strokeWidth: width, strokeStyle: { cap: 'round', join: 'round', ...f.style }, opacity: f.opacity, blend: f.blend, blur: f.blur, material: f.material, label: f.label, role: f.role, fillRule: f.fillRule });
  }
  /** Variable-width ink / brush line, emitted as filled geometry (the hand-drawn look). */
  ink(spine: Shape, paint: Paint, width: number, profile: WidthProfile, f: Finish & Partial<VariableOpts> = {}): TelaVectorObject | null {
    const g = variableStroke(asPath(spine), { width, profile, cap: f.cap ?? 'round', join: f.join ?? 'round', wobble: f.wobble, seed: f.seed, tol: f.tol });
    return this.fill(g, paint, { ...f, label: f.label ?? 'Ink line' });
  }
  /** Objects created inside share a groupId (select & move together in the Studio). */
  group<T>(label: string, fn: () => T): T {
    const gid = this.id('g'); this.groups.push(gid);
    const before = this.items.length;
    try { return fn(); } finally { this.groups.pop(); for (let i = before; i < this.items.length; i++) if (!this.items[i].o.objectLabel || this.items[i].o.objectLabel === 'Vector') this.items[i].o.objectLabel = label; }
  }
  /** Geometric clip for everything drawn inside. Nested clips intersect. */
  clip<T>(region: Shape, fn: () => T): T { this.clips.push(asPath(region)); try { return fn(); } finally { this.clips.pop(); } }
  /** Draw into a depth layer (lower z = further back). Output is sorted by z, then call order. */
  layer<T>(z: number, fn: () => T): T { const prev = this.z; this.z = z; try { return fn(); } finally { this.z = prev; } }
  /** Add ready-made Tela objects (e.g. from the existing kits) at the current layer. */
  add(...objs: Array<TelaVectorObject | null | undefined | false>) { for (const o of objs) if (o) this.items.push({ z: this.z, seq: this.seq++, o }); }

  build(): TelaVectorObject[] { return this.items.slice().sort((a, b) => a.z - b.z || a.seq - b.seq).map(i => i.o); }
  toSvg(background?: string): string { return objectsToSvg(this.build(), this.width, this.height, { background }); }
  get count() { return this.items.length; }
}
