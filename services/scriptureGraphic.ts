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

const SERIF = 'Palatino Linotype, Palatino, Georgia, serif';
const GOLD = '#D4AF37';
const SAFE = 0.05;   // title-safe margin

/**
 * Draw a scripture graphic into an existing context. Lines arrive pre-split by
 * amboService.splitForScreen — this only has to fit them, shrinking the type
 * until every line clears the title-safe box so a long verse degrades to
 * smaller text rather than running off the screen.
 */
export function drawScriptureGraphic(
  ctx: CanvasRenderingContext2D,
  opts: ScriptureGraphicOpts,
): void {
  const { lines, reference, variant, copyright } = opts;
  if (!lines?.length) return;

  const W = opts.width ?? 1920;
  const H = opts.height ?? 1080;
  const k = W / 1920;                 // scale everything off the program frame
  const accent = opts.accent ?? GOLD;
  const marginX = W * SAFE;
  const full = variant === 'FULLSCREEN';

  const boxW = full ? W - marginX * 2 : 1200 * k - 56 * k;
  let size = (full ? 68 : 46) * k;
  const minSize = (full ? 34 : 28) * k;

  const fits = () => {
    ctx.font = `${size}px ${SERIF}`;
    return lines.every(l => ctx.measureText(l).width <= boxW);
  };
  while (size > minSize && !fits()) size -= 2 * k;
  ctx.font = `${size}px ${SERIF}`;

  const lineH = size * 1.34;
  const textH = lines.length * lineH;
  const prevAlign = ctx.textAlign;

  if (full) {
    const g = ctx.createRadialGradient(W / 2, H * 0.44, 100 * k, W / 2, H / 2, 1200 * k);
    g.addColorStop(0, 'rgba(18,14,36,0.62)');
    g.addColorStop(1, 'rgba(6,5,12,0.93)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const startY = H / 2 - textH / 2 - 20 * k;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * lineH + size));

    ctx.fillStyle = accent;
    ctx.font = `bold ${Math.round(size * 0.38)}px system-ui, sans-serif`;
    ctx.letterSpacing = `${Math.round(6 * k)}px`;
    ctx.fillText((reference || '').toUpperCase(), W / 2, startY + textH + size * 1.1);
    ctx.letterSpacing = '0px';

    if (copyright) {
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = `${20 * k}px system-ui, sans-serif`;
      ctx.fillText(copyright, W / 2, H - marginX * 0.6);
    }
    ctx.textAlign = prevAlign;
    return;
  }

  // Lower third — gold rule, gradient fading out to the right.
  const padX = 96 * k;
  const barW = 1200 * k;
  const barH = textH + 92 * k + (copyright ? 26 * k : 0);
  const y = H - barH - H * SAFE;

  const grad = ctx.createLinearGradient(padX, 0, padX + barW, 0);
  grad.addColorStop(0, 'rgba(9,7,16,0.94)');
  grad.addColorStop(0.62, 'rgba(9,7,16,0.80)');
  grad.addColorStop(1, 'rgba(9,7,16,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(padX, y, barW, barH);

  ctx.fillStyle = accent;
  ctx.fillRect(padX, y, 5 * k, barH);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${size}px ${SERIF}`;
  lines.forEach((l, i) => ctx.fillText(l, padX + 28 * k, y + 30 * k + i * lineH + size * 0.8));

  ctx.fillStyle = accent;
  ctx.font = `bold ${22 * k}px system-ui, sans-serif`;
  ctx.letterSpacing = `${Math.round(5 * k)}px`;
  ctx.fillText((reference || '').toUpperCase(), padX + 28 * k, y + textH + 62 * k);
  ctx.letterSpacing = '0px';

  if (copyright) {
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.font = `${16 * k}px system-ui, sans-serif`;
    ctx.fillText(copyright, padX + 28 * k, y + textH + 88 * k);
  }
  ctx.textAlign = prevAlign;
}
