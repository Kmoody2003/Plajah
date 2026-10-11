// canvas — draw a StoryLayout on a 2D canvas.
//
// Default ('paths'): fill each glyph's cached Path2D under a per-glyph transform — exact
// positions, variable-font instances, glyph scaling, synthesized small caps, all identical to the
// SVG renderer. Optional ('text') for crisp hinted small sizes: runs whose face was registered as
// a DOM FontFace (FontRegistry does this with the engine's bytes) and that need no synthetic
// transforms are drawn with fillText, one cluster at a time at the composer's x, so spacing still
// comes from the engine while the rasteriser applies hinting.

import type { TextEngine } from '../engine/wasm';
import type { FontRegistry } from '../fonts/registry';
import type { GlyphRun, StoryLayout } from '../layout/flow';
import { paragraphText, type TextStory } from '../model';
import { outlineCacheFor } from './svg';

export interface CanvasOptions {
  mode?: 'paths' | 'text';
  /** Needed for 'text' mode (DOM font families + paragraph text). */
  fonts?: FontRegistry;
  story?: TextStory;
  color?: (run: GlyphRun) => string;
  /** Text mode is only used at or below this size (px); larger text always uses paths. */
  textModeMaxSize?: number;
}

export function drawLayout(ctx: CanvasRenderingContext2D, engine: TextEngine, layout: StoryLayout, opts: CanvasOptions = {}) {
  const cache = outlineCacheFor(engine);
  const texts = new Map<string, string>();
  if (opts.mode === 'text' && opts.story) for (const p of opts.story.paragraphs) texts.set(p.id, paragraphText(p));
  for (const fl of layout.frames) {
    for (const d of fl.decorations) {
      if (d.kind !== 'shading' && d.kind !== 'highlight') continue;
      ctx.fillStyle = d.color;
      ctx.fillRect(d.x, d.y, d.width, d.height);
    }
    for (const l of fl.lines) {
      for (const r of l.runs) {
        ctx.fillStyle = opts.color?.(r) ?? r.color;
        const face = opts.fonts?.faceOf(r.font);
        const text = texts.get(r.paragraphId);
        const textable = opts.mode === 'text' && face?.cssFamily && text && r.scaleX === 1 && r.level % 2 === 0 && r.size <= (opts.textModeMaxSize ?? 18)
          && !face.info.axes.some(a => a.tag !== 'wght') && r.clusters.every(c => c >= 0);
        if (textable) {
          ctx.font = `${r.attrs.fontStyle === 'italic' ? 'italic ' : ''}${r.attrs.fontWeight} ${r.size}px "${face!.cssFamily}"`;
          ctx.textBaseline = 'alphabetic';
          for (let i = 0; i < r.glyphs.length; i++) {
            if (i > 0 && r.clusters[i] === r.clusters[i - 1]) continue;
            let j = i + 1;
            while (j < r.glyphs.length && r.clusters[j] === r.clusters[i]) j++;
            const end = j < r.glyphs.length ? r.clusters[j] : r.clusters[i] + 1;
            const s = text!.slice(r.clusters[i], Math.max(end, r.clusters[i] + 1));
            ctx.fillText(s, r.xs[i], r.y);
          }
          continue;
        }
        const s = r.size / engine.metrics(r.font).upem;
        cache.prefetch(r.font, r.glyphs);
        for (let i = 0; i < r.glyphs.length; i++) {
          if (!cache.get(r.font, r.glyphs[i]).ops.length) continue;
          ctx.save();
          ctx.translate(r.xs[i], r.ys[i]);
          ctx.scale(s * r.scaleX, -s);
          ctx.fill(cache.path2d(r.font, r.glyphs[i]));
          ctx.restore();
        }
      }
    }
    for (const d of fl.decorations) {
      if (d.kind === 'shading' || d.kind === 'highlight') continue;
      if (d.kind === 'border') { ctx.strokeStyle = d.color; ctx.lineWidth = Number(d.style ?? 1); ctx.strokeRect(d.x, d.y, d.width, d.height); continue; }
      ctx.fillStyle = d.color;
      ctx.fillRect(d.x, d.y, d.width, d.height);
    }
  }
}

/** Glyphs grouped by engine instance — the subsetting input a PDF writer needs. */
export function glyphUsage(layout: StoryLayout): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>();
  for (const l of layout.lines) for (const r of l.runs) {
    let s = m.get(r.font);
    if (!s) m.set(r.font, (s = new Set()));
    for (const g of r.glyphs) s.add(g);
  }
  return m;
}
