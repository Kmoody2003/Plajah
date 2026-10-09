// Cover validation + crop math. Pure (the canvas/Image bits live in components/bookSubmit/StepCover.tsx).
// Numbers mirror what the big stores publish: KDP ideal 1600x2560 (ratio 1.6), minimum 625x1000, max 50 MB,
// JPG/TIFF (we accept JPG/PNG). Apple Books asks for at least 1400px wide, so the KDP-ideal size clears it.

import type { CoverInfo, Finding } from './types';

export const COVER_IDEAL = { width: 1600, height: 2560, ratio: 1.6 };
export const COVER_MIN = { width: 625, height: 1000 };
export const COVER_MAX_BYTES = 50 * 1024 * 1024;
export const COVER_OK_MIME = ['image/jpeg', 'image/png'];

export interface CoverReport {
  findings: Finding[];
  ratio: number;
  quality: 'great' | 'ok' | 'poor' | 'unusable';
}

export function evaluateCover(c: Pick<CoverInfo, 'width' | 'height' | 'bytes' | 'mime'>): CoverReport {
  const f: Finding[] = [];
  const mk = (code: string, severity: Finding['severity'], message: string, fix?: string, mirrors?: string) =>
    f.push({ code: `cover.${code}`, severity, area: 'cover', message, fix, mirrors });
  const ratio = c.width > 0 ? c.height / c.width : 0;

  if (!COVER_OK_MIME.includes(c.mime)) mk('format', 'error', `Cover is ${c.mime || 'an unknown type'}; use JPG or PNG.`, 'Export your cover as JPEG (smaller) or PNG.', 'KDP / Apple / Kobo');
  if (c.bytes > COVER_MAX_BYTES) mk('too_big', 'error', `Cover file is ${(c.bytes / 1048576).toFixed(1)} MB; the limit is 50 MB.`, 'Export as JPEG at quality ~85.', 'KDP');
  if (c.width < COVER_MIN.width || c.height < COVER_MIN.height)
    mk('too_small', 'error', `Cover is ${c.width}x${c.height}px — below the ${COVER_MIN.width}x${COVER_MIN.height}px minimum.`, 'Use a larger source, or re-make it in Tela at 1600x2560.', 'KDP hard minimum');
  else if (c.width < COVER_IDEAL.width || c.height < COVER_IDEAL.height)
    mk('low_res', 'warning', `Cover is ${c.width}x${c.height}px; ${COVER_IDEAL.width}x${COVER_IDEAL.height}px is ideal and looks sharp on retina screens.`, 'Re-export at 1600x2560 or larger if you have the source.', 'KDP ideal');
  if (ratio && (ratio < 1.3 || ratio > 2.0)) mk('ratio_bad', 'error', `Cover ratio is ${ratio.toFixed(2)} (height/width). Book covers should be about 1.6.`, 'Use the crop helper to trim to 1.6 : 1.', 'KDP / Apple');
  else if (ratio && Math.abs(ratio - COVER_IDEAL.ratio) > 0.08) mk('ratio_off', 'warning', `Cover ratio is ${ratio.toFixed(2)}; 1.6 is ideal and avoids letterboxing in store listings.`, 'Use the crop helper to snap to 1.6 : 1.');
  if (c.width >= COVER_MIN.width) mk('thumb', 'info', 'Check the thumbnail: the title and author must stay readable at 80px wide — most readers first meet your book that small.', 'If you cannot read it in the thumbnail preview, enlarge the title text or simplify the art.');

  const hasErr = f.some(x => x.severity === 'error');
  const quality: CoverReport['quality'] = hasErr ? 'unusable' : (c.width >= COVER_IDEAL.width && c.height >= COVER_IDEAL.height && Math.abs(ratio - 1.6) <= 0.08 ? 'great'
    : f.some(x => x.severity === 'warning') ? 'poor' : 'ok');
  return { findings: f, ratio, quality };
}

/** Largest centred rect of `targetRatio` (height/width) inside w x h, in source pixels. */
export function cropRectForRatio(w: number, h: number, targetRatio = COVER_IDEAL.ratio): { x: number; y: number; width: number; height: number } {
  if (w <= 0 || h <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const cur = h / w;
  if (Math.abs(cur - targetRatio) < 0.001) return { x: 0, y: 0, width: w, height: h };
  if (cur > targetRatio) { // too tall -> trim height
    const nh = Math.floor(w * targetRatio);
    return { x: 0, y: Math.floor((h - nh) / 2), width: w, height: nh };
  }
  const nw = Math.floor(h / targetRatio);
  return { x: Math.floor((w - nw) / 2), y: 0, width: nw, height: h };
}
