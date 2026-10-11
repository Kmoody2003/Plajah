// outlines — glyph outline cache shared by every renderer.
//
// Outlines come from the engine in font units (y up) at the instance's variation coordinates,
// so a variable-font instance renders its own shapes, not the default master. They are fetched in
// batches per instance and cached for the session; SVG wants path strings, Canvas wants Path2D,
// and a PDF writer wants the raw ops — all three come from the same record.

import type { GlyphOutline, PathOp, TextEngine } from '../engine/wasm';

export class OutlineCache {
  private byInst = new Map<number, Map<number, GlyphOutline>>();
  private paths = new Map<string, unknown>();
  constructor(readonly engine: TextEngine) {}

  prefetch(inst: number, gids: Iterable<number>) {
    let m = this.byInst.get(inst);
    if (!m) this.byInst.set(inst, (m = new Map()));
    const need: number[] = [];
    for (const g of gids) if (!m.has(g) && !need.includes(g)) need.push(g);
    if (!need.length) return;
    for (const o of this.engine.outlines(inst, need)) m.set(o.gid, o);
  }

  get(inst: number, gid: number): GlyphOutline {
    let m = this.byInst.get(inst);
    let o = m?.get(gid);
    if (!o) {
      this.prefetch(inst, [gid]);
      m = this.byInst.get(inst)!;
      o = m.get(gid)!;
    }
    return o;
  }

  /** Path2D in font units (browser). */
  path2d(inst: number, gid: number): Path2D {
    const k = inst + ':' + gid;
    let p = this.paths.get(k) as Path2D | undefined;
    if (!p) {
      p = new Path2D(opsToSvg(this.get(inst, gid).ops, 0, 0, 1, 1, 2));
      this.paths.set(k, p);
    }
    return p;
  }

  clear(inst?: number) {
    if (inst === undefined) { this.byInst.clear(); this.paths.clear(); return; }
    this.byInst.delete(inst);
    for (const k of [...this.paths.keys()]) if (k.startsWith(inst + ':')) this.paths.delete(k);
  }
}

/** Ops → SVG path data under x' = ox + x·sx, y' = oy + y·sy (sy negative flips font y-up). */
export function opsToSvg(ops: PathOp[], ox: number, oy: number, sx: number, sy: number, precision = 2): string {
  const f = (v: number) => {
    const r = Number(v.toFixed(precision));
    return Object.is(r, -0) ? '0' : String(r);
  };
  let d = '';
  for (const o of ops) {
    switch (o.op) {
      case 'M': d += `M${f(ox + o.x * sx)} ${f(oy + o.y * sy)}`; break;
      case 'L': d += `L${f(ox + o.x * sx)} ${f(oy + o.y * sy)}`; break;
      case 'Q': d += `Q${f(ox + o.x1 * sx)} ${f(oy + o.y1 * sy)} ${f(ox + o.x * sx)} ${f(oy + o.y * sy)}`; break;
      case 'C': d += `C${f(ox + o.x1 * sx)} ${f(oy + o.y1 * sy)} ${f(ox + o.x2 * sx)} ${f(oy + o.y2 * sy)} ${f(ox + o.x * sx)} ${f(oy + o.y * sy)}`; break;
      case 'Z': d += 'Z'; break;
    }
  }
  return d;
}
