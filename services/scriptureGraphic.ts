// scriptureGraphic — the one renderer for a verse on screen.
//
// Used by the switcher engine (program out, NDI, recording) AND by Ambo's
// preview/program monitors, so what the operator approves is pixel-identical
// to what the room and the broadcast receive. Two copies of this drawing code
// would eventually disagree, and the first anyone would know is on a Sunday.

export interface ScriptureGraphicOpts {
  lines: string[];
  reference: string;
  variant: 'LOWER_THIRD' | 'FULLSCREEN';
  /** Attribution some translations require on screen. */
  copyright?: string;
  accent?: string;
  /** Canvas dimensions. Defaults to the 1920×1080 program frame. */
  width?: number;
  height?: number;
}

import { renderScripture } from './ambo/scriptureLayouts';

/**
 * Draw a scripture graphic into an existing context — the settled frame of a
 * scriptureLayouts look. LOWER_THIRD / FULLSCREEN map to the 'lower-third'
 * and 'sanctuary' layouts; pass `layoutId` to use any other look. Ambo's
 * animated ScriptureSource and this function share the same layout code, so
 * the switcher and Ambo can never disagree about what a verse looks like.
 */
export function drawScriptureGraphic(
  ctx: CanvasRenderingContext2D,
  opts: ScriptureGraphicOpts & { layoutId?: string; t?: number },
): void {
  const { lines, reference, variant, copyright } = opts;
  if (!lines?.length) return;
  const W = opts.width ?? 1920;
  const H = opts.height ?? 1080;
  renderScripture(ctx, opts.layoutId ?? (variant === 'FULLSCREEN' ? 'sanctuary' : 'lower-third'), {
    w: W, h: H, t: opts.t ?? 0,
    text: lines.join(' ').replace(/\s+/g, ' ').trim(),
    reference: reference || '',
    copyright,
    accent: opts.accent ?? '#D4AF37',
    enterP: 1, exitP: 0, transition: 'crossfade',
  });
}
