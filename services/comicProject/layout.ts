// services/comicProject/layout.ts — page layout for graphic-novel pages.
//
// Showcase pages describe layout as panels with a 12-column `flex` share and a
// `geometry` (slash, reticle, letterbox…). This packs them into rows, sizes each row by
// the geometry it holds, and turns geometry into clip polygons the Tela comic canvas
// already renders. Page height grows with row count, so a 13-row page stays readable.

import type { ComicPanelNode, PanelGeometry } from './types';

type Box = ComicPanelNode['box'];

/** Row height as a fraction of page width, by the tallest geometry in the row. */
const ROW_HEIGHT: Record<PanelGeometry, number> = {
  'open-bleed': 0.62,
  'vertical-monolith': 0.78,
  'widescreen-letterbox': 0.3,
  'wrap-around-l': 0.42,
  'circle-reticle': 0.42,
  'floating-inset': 0.42,
  'slanted-slash-left': 0.4,
  'slanted-slash-right': 0.4,
  'standard-rect': 0.4,
};

/** Full-width standard rows read as establishing shots, so give them more height. */
const FULL_WIDTH_STANDARD = 0.5;
/** How far a paired slash leans, in % of page width, to each side of the shared gutter. */
const SLASH_LEAN = 3;

export interface FlexLayoutInput {
  flex?: number;
  geometry?: PanelGeometry;
}

export interface FlexLayoutResult {
  boxes: Box[];
  /** Page height ÷ width. */
  aspect: number;
  /** Row index for each panel. */
  rowOf: number[];
}

export function packFlexRows(panels: FlexLayoutInput[]): number[][] {
  const rows: number[][] = [];
  let cur: number[] = [];
  let sum = 0;
  panels.forEach((p, i) => {
    const flex = clampFlex(p.flex);
    if (sum + flex > 12 && cur.length) {
      rows.push(cur);
      cur = [];
      sum = 0;
    }
    cur.push(i);
    sum += flex;
    if (sum >= 12) {
      rows.push(cur);
      cur = [];
      sum = 0;
    }
  });
  if (cur.length) rows.push(cur);
  return rows;
}

export function layoutFlexRows(panels: FlexLayoutInput[]): FlexLayoutResult {
  const rows = packFlexRows(panels);
  const rowHeights = rows.map((row) => {
    if (row.length === 1 && (panels[row[0]].geometry ?? 'standard-rect') === 'standard-rect') {
      return FULL_WIDTH_STANDARD;
    }
    return Math.max(...row.map((i) => ROW_HEIGHT[panels[i].geometry ?? 'standard-rect'] ?? 0.4));
  });
  const total = rowHeights.reduce((a, b) => a + b, 0) || 1;

  const boxes: Box[] = new Array(panels.length);
  const rowOf: number[] = new Array(panels.length);
  let y = 0;
  rows.forEach((row, r) => {
    const heightPct = (rowHeights[r] / total) * 100;
    const yPct = (y / total) * 100;
    const flexSum = row.reduce((a, i) => a + clampFlex(panels[i].flex), 0);
    // A row that doesn't fill 12 columns is centred rather than stretched.
    const scale = flexSum >= 12 ? 100 / flexSum : 100 / 12;
    let x = flexSum >= 12 ? 0 : ((12 - flexSum) / 12) * 50;
    row.forEach((i) => {
      const widthPct = clampFlex(panels[i].flex) * scale;
      boxes[i] = { xPct: round(x), yPct: round(yPct), widthPct: round(widthPct), heightPct: round(heightPct) };
      rowOf[i] = r;
      x += widthPct;
    });
    applyRowGeometry(row, panels, boxes);
    y += rowHeights[r];
  });

  return { boxes, aspect: round(total, 4), rowOf };
}

/** Clip shapes per geometry; paired slashes lean into one shared diagonal gutter. */
function applyRowGeometry(row: number[], panels: FlexLayoutInput[], boxes: Box[]) {
  row.forEach((i, k) => {
    const g = panels[i].geometry ?? 'standard-rect';
    const box = boxes[i];
    const nextG = k + 1 < row.length ? panels[row[k + 1]].geometry : undefined;
    const prevG = k > 0 ? panels[row[k - 1]].geometry : undefined;

    if (g === 'slanted-slash-left') {
      if (nextG === 'slanted-slash-right') {
        box.widthPct = round(box.widthPct + SLASH_LEAN);
        const lean = (2 * SLASH_LEAN * 100) / box.widthPct;
        box.clipPolygon = poly([0, 0], [100, 0], [100 - lean, 100], [0, 100]);
      } else {
        box.clipPolygon = poly([0, 0], [100, 0], [88, 100], [0, 100]);
      }
    } else if (g === 'slanted-slash-right') {
      if (prevG === 'slanted-slash-left') {
        box.xPct = round(box.xPct - SLASH_LEAN);
        box.widthPct = round(box.widthPct + SLASH_LEAN);
        const lean = (2 * SLASH_LEAN * 100) / box.widthPct;
        box.clipPolygon = poly([lean, 0], [100, 0], [100, 100], [0, 100]);
      } else {
        box.clipPolygon = poly([12, 0], [100, 0], [100, 100], [0, 100]);
      }
    } else if (g === 'circle-reticle') {
      box.clipPolygon = ellipse(40);
    } else if (g === 'wrap-around-l') {
      box.clipPolygon = poly([0, 0], [100, 0], [100, 80], [86, 100], [0, 100]);
    }
  });
}

/** Re-runs flex layout for a page whose panels carry flex/geometry. */
export function relayoutPanels<T extends ComicPanelNode>(panels: T[]): { panels: T[]; aspect: number } {
  const { boxes, aspect } = layoutFlexRows(panels);
  return { panels: panels.map((p, i) => ({ ...p, box: boxes[i] })), aspect };
}

function clampFlex(flex?: number) {
  const f = Math.round(flex ?? 12);
  return Math.min(12, Math.max(1, f));
}

function poly(...pts: [number, number][]) {
  return pts.map(([xPct, yPct]) => ({ xPct, yPct }));
}

function ellipse(n: number) {
  const pts: { xPct: number; yPct: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ xPct: round(50 + 47 * Math.cos(a), 2), yPct: round(50 + 47 * Math.sin(a), 2) });
  }
  return pts;
}

function round(n: number, dp = 3) {
  const m = 10 ** dp;
  return Math.round(n * m) / m;
}
