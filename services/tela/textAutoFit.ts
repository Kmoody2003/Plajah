// textAutoFit.ts — Bounding-box auto-fit and auto-flow text engine for Tela & Ambo.
//
// Solves the "scripture runs off the slide" problem by constraining text
// within defined rectangular regions and auto-sizing to fit. Also supports
// flowing text across multiple linked boxes (magazine / multi-column layouts).
//
// Used by: TextSource, ScriptureSource (layerSources.ts), AmboSlideEditor,
//          TelaVector TEXT objects, and the Ambo live renderer.

import { measureText, wrapLine, concreteFontFamily, fontShorthand } from './telaText';
import type { TelaVectorObject } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TextBoundingBox {
  id: string;
  x: number;        // px from canvas left
  y: number;        // px from canvas top
  w: number;        // box width px
  h: number;        // box height px
  padding?: BoxPadding;
  /** Link to the next box for text overflow flow. */
  nextBoxId?: string;
  /** Shape mask — text wraps inside this shape. Default: rectangle. */
  shape?: 'rect' | 'ellipse' | 'rounded-rect';
  borderRadius?: number;
  /** Vertical alignment within this box. */
  valign?: 'top' | 'middle' | 'bottom';
}

export interface BoxPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface AutoFitConfig {
  /** Minimum font size in px. Below this, text truncates with ellipsis. */
  minFontSize?: number;
  /** Maximum font size in px. Text won't grow beyond this. */
  maxFontSize?: number;
  /** Target font size to START from. Auto-fit adjusts down from here. */
  preferredFontSize?: number;
  /** Line height multiplier (e.g. 1.3). */
  lineHeight?: number;
  /** Max number of lines before truncation. 0 = unlimited. */
  maxLines?: number;
  /** Whether auto-fit is enabled. When false, text may overflow. */
  enabled?: boolean;
  /** Minimum readability threshold — text won't shrink below this % of preferred. */
  minReadabilityRatio?: number;
  /** Add ellipsis when text is truncated. */
  showEllipsis?: boolean;
}

export interface AutoFitResult {
  fontSize: number;
  lineHeight: number;
  lines: LayoutLine[];
  truncated: boolean;
  /** Which boxes were used (for multi-box flow). */
  boxesUsed: string[];
  /** Overflow text that didn't fit in any box. */
  overflowText: string;
  /** Computed metrics per box. */
  boxLayouts: BoxLayout[];
}

export interface LayoutLine {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  boxId: string;
  lineIndex: number;    // line index within the box
  isEllipsized: boolean;
}

export interface BoxLayout {
  boxId: string;
  lines: LayoutLine[];
  usedHeight: number;
  availableHeight: number;
  fontSize: number;
}

// ── Scripture-specific presets ─────────────────────────────────────────────────

export const SCRIPTURE_SAFE_ZONE: BoxPadding = {
  top: 60,
  right: 100,
  bottom: 80,
  left: 100,
};

export const SCRIPTURE_AUTO_FIT: AutoFitConfig = {
  minFontSize: 28,
  maxFontSize: 96,
  preferredFontSize: 64,
  lineHeight: 1.35,
  maxLines: 0,
  enabled: true,
  minReadabilityRatio: 0.4,
  showEllipsis: true,
};

export const DEFAULT_AUTO_FIT: AutoFitConfig = {
  minFontSize: 16,
  maxFontSize: 200,
  preferredFontSize: 72,
  lineHeight: 1.3,
  maxLines: 0,
  enabled: true,
  minReadabilityRatio: 0.3,
  showEllipsis: true,
};

// ── Measurement helpers ───────────────────────────────────────────────────────

let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx) return _measureCtx;
  try {
    if (typeof document !== 'undefined') {
      _measureCtx = document.createElement('canvas').getContext('2d');
    }
  } catch {}
  return _measureCtx;
}

function getInnerRect(box: TextBoundingBox): { x: number; y: number; w: number; h: number } {
  const p = box.padding ?? {};
  const pt = p.top ?? 0, pr = p.right ?? 0, pb = p.bottom ?? 0, pl = p.left ?? 0;
  return {
    x: box.x + pl,
    y: box.y + pt,
    w: Math.max(0, box.w - pl - pr),
    h: Math.max(0, box.h - pt - pb),
  };
}

/** For ellipse shapes, compute the effective line width at a given y offset. */
function ellipseWidthAtY(box: TextBoundingBox, yOffset: number, innerH: number, innerW: number): number {
  if (box.shape !== 'ellipse') return innerW;
  // Ellipse equation: x²/a² + y²/b² = 1
  const a = innerW / 2;
  const b = innerH / 2;
  const cy = yOffset - b; // center-relative y
  const discriminant = 1 - (cy * cy) / (b * b);
  if (discriminant <= 0) return 0;
  return 2 * a * Math.sqrt(discriminant);
}

// ── Word wrapping with box-aware width ────────────────────────────────────────

function wrapTextToBox(
  ctx: CanvasRenderingContext2D | null,
  text: string,
  font: string,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
  maxHeight: number,
  maxLines: number,
): { lines: string[]; overflowText: string } {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  let overflow = '';
  const lineHeightPx = fontSize * lineHeight;
  const effectiveMaxLines = maxLines > 0 ? maxLines : Math.floor(maxHeight / lineHeightPx);

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];
    if (lines.length >= effectiveMaxLines) {
      overflow = paragraphs.slice(pi).join('\n');
      break;
    }

    const words = para.split(/(\s+)/).filter(w => w.length > 0);
    let currentLine = '';

    for (const word of words) {
      if (/^\s+$/.test(word)) {
        if (currentLine) currentLine += ' ';
        continue;
      }

      const probe = currentLine ? currentLine + word : word;
      let probeWidth: number;

      if (ctx) {
        ctx.font = font;
        probeWidth = ctx.measureText(probe).width;
      } else {
        // Estimate
        probeWidth = probe.length * fontSize * 0.55;
      }

      if (currentLine && probeWidth > maxWidth) {
        lines.push(currentLine.trimEnd());
        if (lines.length >= effectiveMaxLines) {
          // Remaining text is overflow
          const remainingWords = words.slice(words.indexOf(word));
          const remainingParas = paragraphs.slice(pi + 1);
          overflow = remainingWords.join('') + (remainingParas.length ? '\n' + remainingParas.join('\n') : '');
          return { lines, overflowText: overflow.trim() };
        }
        currentLine = word;
      } else {
        currentLine = probe;
      }
    }

    if (currentLine) {
      lines.push(currentLine.trimEnd());
    } else if (para === '') {
      lines.push('');
    }
  }

  return { lines, overflowText: overflow.trim() };
}

// ── Binary Search Auto-Fit ────────────────────────────────────────────────────

function doesTextFitInBox(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string,
  lineHeight: number,
  box: TextBoundingBox,
  maxLines: number,
): { fits: boolean; lines: string[]; usedHeight: number; overflow: string } {
  const inner = getInnerRect(box);
  if (inner.w <= 0 || inner.h <= 0) return { fits: false, lines: [], usedHeight: 0, overflow: text };

  const ctx = getMeasureCtx();
  const font = `${fontStyle === 'italic' ? 'italic ' : ''}${fontWeight} ${fontSize}px ${fontFamily}`;

  const { lines, overflowText } = wrapTextToBox(
    ctx, text, font, fontSize, inner.w, lineHeight, inner.h, maxLines,
  );

  const lineHeightPx = fontSize * lineHeight;
  const usedHeight = lines.length * lineHeightPx;
  const fits = usedHeight <= inner.h && overflowText.length === 0;

  return { fits, lines, usedHeight, overflow: overflowText };
}

/**
 * Binary search for the optimal font size that fits text within a bounding box.
 * Returns the largest font size where all text fits.
 */
export function autoFitFontSize(
  text: string,
  box: TextBoundingBox,
  config: AutoFitConfig = DEFAULT_AUTO_FIT,
  fontFamily = '"Palatino Linotype", Palatino, Georgia, serif',
  fontWeight = '400',
  fontStyle = 'normal',
): { fontSize: number; lines: string[]; truncated: boolean; overflow: string } {
  if (!config.enabled) {
    const preferred = config.preferredFontSize ?? 64;
    const r = doesTextFitInBox(text, preferred, fontFamily, fontWeight, fontStyle, config.lineHeight ?? 1.3, box, config.maxLines ?? 0);
    return { fontSize: preferred, lines: r.lines, truncated: r.overflow.length > 0, overflow: r.overflow };
  }

  const minSize = config.minFontSize ?? 16;
  const maxSize = config.maxFontSize ?? 200;
  const preferred = config.preferredFontSize ?? 72;
  const lineHeight = config.lineHeight ?? 1.3;
  const maxLines = config.maxLines ?? 0;

  // Start from preferred and try fitting
  let lo = minSize;
  let hi = Math.min(maxSize, preferred);
  let bestSize = minSize;
  let bestLines: string[] = [];
  let bestOverflow = text;

  // Binary search: find largest size that fits
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const result = doesTextFitInBox(text, mid, fontFamily, fontWeight, fontStyle, lineHeight, box, maxLines);

    if (result.fits) {
      bestSize = mid;
      bestLines = result.lines;
      bestOverflow = result.overflow;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // If even minSize doesn't fit, use minSize and truncate
  if (bestSize === minSize && bestOverflow.length > 0) {
    const result = doesTextFitInBox(text, minSize, fontFamily, fontWeight, fontStyle, lineHeight, box, maxLines);
    bestLines = result.lines;
    bestOverflow = result.overflow;

    // Add ellipsis to last line
    if (config.showEllipsis && bestOverflow.length > 0 && bestLines.length > 0) {
      bestLines[bestLines.length - 1] = bestLines[bestLines.length - 1].replace(/\s*$/, '…');
    }
  }

  const truncated = bestOverflow.length > 0;
  return { fontSize: bestSize, lines: bestLines, truncated, overflow: bestOverflow };
}

// ── Multi-Box Text Flow ───────────────────────────────────────────────────────

/**
 * Flow text across multiple linked bounding boxes.
 * Text that overflows one box continues in the next linked box.
 * Font size is auto-fit to the FIRST box, then held constant across all boxes.
 */
export function autoFlowText(
  text: string,
  boxes: TextBoundingBox[],
  config: AutoFitConfig = DEFAULT_AUTO_FIT,
  fontFamily = '"Palatino Linotype", Palatino, Georgia, serif',
  fontWeight = '400',
  fontStyle = 'normal',
): AutoFitResult {
  if (boxes.length === 0) {
    return {
      fontSize: config.preferredFontSize ?? 64,
      lineHeight: config.lineHeight ?? 1.3,
      lines: [],
      truncated: false,
      boxesUsed: [],
      overflowText: text,
      boxLayouts: [],
    };
  }

  // Build box chain from linked list
  const boxMap = new Map(boxes.map(b => [b.id, b]));
  const chain: TextBoundingBox[] = [];
  const visited = new Set<string>();

  // Start from the first box and follow nextBoxId links
  let current: TextBoundingBox | undefined = boxes[0];
  while (current && !visited.has(current.id)) {
    chain.push(current);
    visited.add(current.id);
    current = current.nextBoxId ? boxMap.get(current.nextBoxId) : undefined;
  }

  // Add any unlinked boxes
  for (const box of boxes) {
    if (!visited.has(box.id)) {
      chain.push(box);
      visited.add(box.id);
    }
  }

  // Auto-fit font size to the FIRST box
  const { fontSize, lines: firstLines, overflow: firstOverflow } = autoFitFontSize(
    text, chain[0], config, fontFamily, fontWeight, fontStyle,
  );

  const lineHeight = config.lineHeight ?? 1.3;
  const allLines: LayoutLine[] = [];
  const boxLayouts: BoxLayout[] = [];
  const boxesUsed: string[] = [chain[0].id];

  // Layout first box
  const inner0 = getInnerRect(chain[0]);
  const valign0 = chain[0].valign ?? 'top';
  const lineH = fontSize * lineHeight;
  const blockH0 = firstLines.length * lineH;
  const yOffset0 = valign0 === 'middle' ? (inner0.h - blockH0) / 2
    : valign0 === 'bottom' ? inner0.h - blockH0
    : 0;

  const boxLayout0: BoxLayout = {
    boxId: chain[0].id,
    lines: [],
    usedHeight: blockH0,
    availableHeight: inner0.h,
    fontSize,
  };

  for (let i = 0; i < firstLines.length; i++) {
    const line: LayoutLine = {
      text: firstLines[i],
      x: inner0.x,
      y: inner0.y + yOffset0 + i * lineH,
      fontSize,
      boxId: chain[0].id,
      lineIndex: i,
      isEllipsized: false,
    };
    allLines.push(line);
    boxLayout0.lines.push(line);
  }
  boxLayouts.push(boxLayout0);

  // Flow overflow text into subsequent boxes
  let remainingText = firstOverflow;

  for (let bi = 1; bi < chain.length && remainingText.length > 0; bi++) {
    const box = chain[bi];
    const inner = getInnerRect(box);
    const maxLines = config.maxLines ?? 0;

    const result = doesTextFitInBox(
      remainingText, fontSize, fontFamily, fontWeight, fontStyle, lineHeight, box, maxLines,
    );

    const valign = box.valign ?? 'top';
    const blockH = result.lines.length * lineH;
    const yOffset = valign === 'middle' ? (inner.h - blockH) / 2
      : valign === 'bottom' ? inner.h - blockH
      : 0;

    const boxLayout: BoxLayout = {
      boxId: box.id,
      lines: [],
      usedHeight: blockH,
      availableHeight: inner.h,
      fontSize,
    };

    for (let i = 0; i < result.lines.length; i++) {
      const line: LayoutLine = {
        text: result.lines[i],
        x: inner.x,
        y: inner.y + yOffset + i * lineH,
        fontSize,
        boxId: box.id,
        lineIndex: i,
        isEllipsized: false,
      };
      allLines.push(line);
      boxLayout.lines.push(line);
    }

    boxLayouts.push(boxLayout);
    boxesUsed.push(box.id);
    remainingText = result.overflow;
  }

  // If still overflowing after all boxes, truncate last line with ellipsis
  if (remainingText.length > 0 && config.showEllipsis && allLines.length > 0) {
    const lastLine = allLines[allLines.length - 1];
    lastLine.text = lastLine.text.replace(/\s*$/, '…');
    lastLine.isEllipsized = true;
  }

  return {
    fontSize,
    lineHeight,
    lines: allLines,
    truncated: remainingText.length > 0,
    boxesUsed,
    overflowText: remainingText,
    boxLayouts,
  };
}

// ── Convenience: create standard slide bounding boxes ─────────────────────────

/** Create a full-slide bounding box with safe margins (5% default). */
export function createSlideBox(
  w = 1920,
  h = 1080,
  safeMargin = 0.05,
  id = 'main',
): TextBoundingBox {
  return {
    id,
    x: w * safeMargin,
    y: h * safeMargin,
    w: w * (1 - safeMargin * 2),
    h: h * (1 - safeMargin * 2),
    valign: 'middle',
  };
}

/** Create a scripture bounding box — wider safe margins for readability. */
export function createScriptureBox(
  w = 1920,
  h = 1080,
  id = 'scripture',
): TextBoundingBox {
  return {
    id,
    x: SCRIPTURE_SAFE_ZONE.left!,
    y: SCRIPTURE_SAFE_ZONE.top!,
    w: w - SCRIPTURE_SAFE_ZONE.left! - SCRIPTURE_SAFE_ZONE.right!,
    h: h - SCRIPTURE_SAFE_ZONE.top! - SCRIPTURE_SAFE_ZONE.bottom!,
    padding: { top: 10, bottom: 10, left: 10, right: 10 },
    valign: 'middle',
  };
}

/** Create a two-column layout (for flowing longer scripture passages). */
export function createTwoColumnBoxes(
  w = 1920,
  h = 1080,
  gap = 60,
): TextBoundingBox[] {
  const safe = SCRIPTURE_SAFE_ZONE;
  const innerW = w - safe.left! - safe.right!;
  const colW = (innerW - gap) / 2;
  const innerH = h - safe.top! - safe.bottom!;

  return [
    {
      id: 'col-left',
      x: safe.left!,
      y: safe.top!,
      w: colW,
      h: innerH,
      nextBoxId: 'col-right',
      valign: 'top',
    },
    {
      id: 'col-right',
      x: safe.left! + colW + gap,
      y: safe.top!,
      w: colW,
      h: innerH,
      valign: 'top',
    },
  ];
}

/** Create a box with a reference/attribution line at the bottom. */
export function createScriptureWithReferenceBoxes(
  w = 1920,
  h = 1080,
): TextBoundingBox[] {
  const safe = SCRIPTURE_SAFE_ZONE;
  const innerW = w - safe.left! - safe.right!;
  const innerH = h - safe.top! - safe.bottom!;
  const refHeight = 60; // height for the reference line

  return [
    {
      id: 'scripture-body',
      x: safe.left!,
      y: safe.top!,
      w: innerW,
      h: innerH - refHeight - 20,
      valign: 'middle',
    },
    {
      id: 'scripture-ref',
      x: safe.left!,
      y: h - safe.bottom! - refHeight,
      w: innerW,
      h: refHeight,
      valign: 'bottom',
    },
  ];
}

// ── Integration with existing TextSource rendering ────────────────────────────

/**
 * Render auto-fit text onto a 2D canvas context.
 * Drop-in replacement for the TextSource.render() inner loop.
 */
export function renderAutoFitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: TextBoundingBox,
  config: AutoFitConfig = DEFAULT_AUTO_FIT,
  style: {
    fontFamily?: string;
    fontWeight?: string;
    fontStyle?: string;
    color?: string;
    align?: CanvasTextAlign;
    shadow?: boolean;
    shadowColor?: string;
    shadowBlur?: number;
    outline?: number;
    outlineColor?: string;
  } = {},
): AutoFitResult {
  const fontFamily = style.fontFamily ?? '"Palatino Linotype", Palatino, Georgia, serif';
  const fontWeight = style.fontWeight ?? '400';
  const fontStyle = style.fontStyle ?? 'normal';
  const align = style.align ?? 'center';
  const color = style.color ?? '#ffffff';

  const result = autoFitFontSize(text, box, config, fontFamily, fontWeight, fontStyle);
  const inner = getInnerRect(box);
  const lineH = result.fontSize * (config.lineHeight ?? 1.3);
  const blockH = result.lines.length * lineH;

  const valign = box.valign ?? 'middle';
  const y0 = valign === 'top' ? inner.y
    : valign === 'bottom' ? inner.y + inner.h - blockH
    : inner.y + (inner.h - blockH) / 2;

  const x = align === 'left' ? inner.x
    : align === 'right' ? inner.x + inner.w
    : inner.x + inner.w / 2;

  const font = `${fontStyle === 'italic' ? 'italic ' : ''}${fontWeight} ${result.fontSize}px ${fontFamily}`;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  const allLines: LayoutLine[] = [];

  for (let i = 0; i < result.lines.length; i++) {
    const y = y0 + i * lineH;
    const ln = result.lines[i];

    // Shadow
    if (style.shadow !== false) {
      ctx.shadowColor = style.shadowColor ?? 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = style.shadowBlur ?? result.fontSize * 0.16;
      ctx.shadowOffsetY = result.fontSize * 0.045;
    }

    // Outline
    if (style.outline) {
      ctx.lineWidth = style.outline;
      ctx.strokeStyle = style.outlineColor ?? 'rgba(0,0,0,0.85)';
      ctx.strokeText(ln, x, y);
    }

    // Fill
    ctx.fillStyle = color;
    ctx.fillText(ln, x, y);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    allLines.push({
      text: ln,
      x,
      y,
      fontSize: result.fontSize,
      boxId: box.id,
      lineIndex: i,
      isEllipsized: i === result.lines.length - 1 && result.truncated,
    });
  }

  return {
    fontSize: result.fontSize,
    lineHeight: config.lineHeight ?? 1.3,
    lines: allLines,
    truncated: result.truncated,
    boxesUsed: [box.id],
    overflowText: result.overflow,
    boxLayouts: [{
      boxId: box.id,
      lines: allLines,
      usedHeight: blockH,
      availableHeight: inner.h,
      fontSize: result.fontSize,
    }],
  };
}
