import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInkMap, classifyRegionArt, eraseBoxesFromInk, findInkRegions,
  estimateDeskewAngle, flattenWorksheetPixels, normalizeTypography, separateRulesAndRegions,
  computeHomography, applyHomography, orderQuadCorners, findPaperQuadFromMask,
} from '../services/worksheetReprintCore';

// ── Synthetic page helpers ───────────────────────────────────────────────────────

function makePage(width: number, height: number, paper = 245) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = paper; data[i + 1] = paper; data[i + 2] = paper; data[i + 3] = 255; }
  return data;
}

function paint(data: Uint8ClampedArray, width: number, box: { x: number; y: number; w: number; h: number }, rgb: [number, number, number]) {
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const i = (y * width + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
  }
}

/** Simulate uneven phone lighting: darken the lower-right half of the page. */
function shade(data: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const factor = 1 - .45 * ((x / width + y / height) / 2);
    const i = (y * width + x) * 4;
    data[i] *= factor; data[i + 1] *= factor; data[i + 2] *= factor;
  }
}

// ── Flattening ───────────────────────────────────────────────────────────────────

test('paper flattening lifts shadowed paper to white while keeping ink dark', () => {
  const width = 320, height = 400;
  const data = makePage(width, height);
  paint(data, width, { x: 40, y: 300, w: 60, h: 40 }, [30, 25, 35]); // dark drawing in the shadowed corner
  shade(data, width, height);
  const shadedPaper = data[((height - 10) * width + (width - 10)) * 4];
  assert.ok(shadedPaper < 180, 'precondition: the corner paper is visibly shadowed');
  flattenWorksheetPixels(data, width, height);
  const paperAfter = data[((height - 10) * width + (width - 10)) * 4];
  const inkAfter = data[(320 * width + 70) * 4];
  assert.ok(paperAfter > 225, `shadowed paper should flatten to near-white, got ${paperAfter}`);
  assert.ok(inkAfter < 110, `ink should stay dark after flattening, got ${inkAfter}`);
});

// ── Rules, subtraction, regions ─────────────────────────────────────────────────

test('isolated rules split from artwork; remaining ink becomes artwork regions', () => {
  const width = 400, height = 500;
  const data = makePage(width, height);
  paint(data, width, { x: 40, y: 250, w: 300, h: 3 }, [40, 40, 40]);   // answer rule
  paint(data, width, { x: 60, y: 60, w: 180, h: 16 }, [30, 30, 30]);   // "title text"
  paint(data, width, { x: 120, y: 320, w: 80, h: 90 }, [25, 20, 30]);  // drawing
  const ink = buildInkMap(data, width, height);
  eraseBoxesFromInk(ink, width, height, [{ x: 60, y: 60, w: 180, h: 16 }]);
  const { rules, regions } = separateRulesAndRegions(ink, width, height, data);
  assert.equal(rules.filter(rule => rule.axis === 'H').length, 1);
  assert.ok(rules[0].thickness >= 2 && rules[0].thickness <= 5);
  assert.equal(regions.length, 1, 'only the drawing should remain as an artwork region');
  const region = regions[0];
  assert.ok(Math.abs(region.x - 120) <= 2 && Math.abs(region.y - 320) <= 2, 'region should sit at the drawing');
});

test('a straight edge CONNECTED to a drawing stays artwork instead of becoming a rule', () => {
  const width = 500, height = 500;
  const data = makePage(width, height);
  // book-bag-like drawing: straight top edge + sides + interior detail (pocket, strap seams),
  // all touching. The interior strokes make it a drawing, not a hollow form-box.
  paint(data, width, { x: 100, y: 150, w: 220, h: 4 }, [30, 26, 34]);  // straight top edge (rule-like in isolation)
  paint(data, width, { x: 100, y: 150, w: 4, h: 180 }, [30, 26, 34]);  // left side
  paint(data, width, { x: 316, y: 150, w: 4, h: 180 }, [30, 26, 34]);  // right side
  paint(data, width, { x: 100, y: 326, w: 220, h: 4 }, [30, 26, 34]);  // bottom
  paint(data, width, { x: 150, y: 230, w: 120, h: 60 }, [30, 26, 34]); // front pocket (interior fill)
  paint(data, width, { x: 155, y: 150, w: 4, h: 176 }, [30, 26, 34]);  // strap seam
  // a genuinely isolated answer blank elsewhere
  paint(data, width, { x: 80, y: 430, w: 280, h: 3 }, [40, 40, 40]);
  const ink = buildInkMap(data, width, height);
  const { rules, regions } = separateRulesAndRegions(ink, width, height, data);
  assert.equal(rules.length, 1, 'only the isolated blank is a rule');
  assert.ok(Math.abs(rules[0].y1 - 431.5) < 3);
  assert.equal(regions.length, 1, 'the connected outline is one artwork region');
  assert.ok(regions[0].w >= 218 && regions[0].h >= 178, 'the region spans the whole outline including its straight edges');
});

test('light unsaturated shadow residue is not promoted to a rule', () => {
  const width = 400, height = 300;
  const data = makePage(width, height);
  paint(data, width, { x: 50, y: 150, w: 300, h: 3 }, [205, 202, 200]); // faint shadow band
  const ink = new Uint8Array(width * height);
  for (let y = 150; y < 153; y++) for (let x = 50; x < 350; x++) ink[y * width + x] = 1; // force it into the ink map
  const { rules } = separateRulesAndRegions(ink, width, height, data);
  assert.equal(rules.length, 0, 'a light band must not become a printed rule');
});

test('nearby strokes merge into one artwork region', () => {
  const width = 400, height = 400;
  const ink = new Uint8Array(width * height);
  const stamp = (x0: number, y0: number, w: number, h: number) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) ink[y * width + x] = 1; };
  stamp(100, 100, 40, 8);  // bag top
  stamp(100, 112, 8, 60);  // left side, 4px gap from the top stroke
  stamp(132, 112, 8, 60);  // right side
  const regions = findInkRegions(ink, width, height, { minComponentPixels: 8, minRegionPixels: 100 });
  assert.equal(regions.length, 1, 'strokes of one drawing should merge');
  assert.ok(regions[0].w >= 40 && regions[0].h >= 70);
});

// ── Region art classification ────────────────────────────────────────────────────

test('black strokes classify as line art; saturated fills classify as color art', () => {
  const width = 200, height = 200;
  const data = makePage(width, height);
  paint(data, width, { x: 20, y: 20, w: 60, h: 60 }, [25, 22, 30]);
  paint(data, width, { x: 120, y: 120, w: 60, h: 60 }, [210, 40, 45]);
  const dark = classifyRegionArt(data, width, height, { x: 15, y: 15, w: 70, h: 70 });
  const red = classifyRegionArt(data, width, height, { x: 115, y: 115, w: 70, h: 70 });
  assert.equal(dark.style, 'LINE_ART');
  assert.equal(red.style, 'COLOR');
  assert.ok(parseInt(red.inkColor.slice(1, 3), 16) > 150, 'dominant ink color should be red-dominant');
});

// ── Typography normalization ────────────────────────────────────────────────────

test('typography snaps jittered sizes and columns and finds the centered title', () => {
  const pageW = 800, pageH = 1000;
  const entries = [
    { x: 260, y: 40, w: 280, h: 42, text: 'MY BOOK BAG' },
    { x: 61, y: 140, w: 500, h: 21, text: 'Directions: read each question.' },
    { x: 59, y: 180, w: 480, h: 23, text: '1. What goes in the bag?' },
    { x: 62, y: 220, w: 470, h: 20, text: '2. Draw your favorite item.' },
    { x: 60, y: 260, w: 460, h: 22, text: '3. Why do you pack it?' },
  ];
  const typo = normalizeTypography(entries, pageW, pageH);
  const title = typo[0];
  assert.equal(title.role, 'TITLE');
  assert.equal(title.align, 'center');
  assert.equal(title.fontWeight, 700);
  const body = typo.slice(1);
  assert.equal(new Set(body.map(entry => entry.fontSize)).size, 1, 'jittered body sizes should share one snapped size');
  assert.equal(new Set(body.map(entry => entry.snapX)).size, 1, 'jittered left edges should snap to one column');
  assert.ok(body.every(entry => entry.fontWeight === 400));
});

test('deskew estimates a synthetic tilt angle within tolerance', () => {
  const width = 500, height = 500;
  const ink = new Uint8Array(width * height);
  // Draw 6 horizontal text-like rows tilted by +4°.
  const deg = 4, rad = deg * Math.PI / 180, cx = width / 2, cy = height / 2;
  const plot = (x: number, y: number) => {
    const dx = x - cx, dy = y - cy;
    const rx = Math.round(cx + dx * Math.cos(rad) - dy * Math.sin(rad));
    const ry = Math.round(cy + dx * Math.sin(rad) + dy * Math.cos(rad));
    if (rx >= 0 && ry >= 0 && rx < width && ry < height) ink[ry * width + rx] = 1;
  };
  for (let row = 0; row < 6; row++) {
    const y0 = 90 + row * 55;
    for (let x = 80; x < 420; x++) { plot(x, y0); plot(x, y0 + 1); plot(x, y0 + 2); }
  }
  const est = estimateDeskewAngle(ink, width, height);
  // The page is tilted +4°; the estimate should be close so that -est corrects it.
  assert.ok(Math.abs(est - 4) <= 1.2, `expected ~4°, got ${est}`);
});

test('deskew returns 0 for an already-square page', () => {
  const width = 400, height = 400;
  const ink = new Uint8Array(width * height);
  for (let row = 0; row < 5; row++) { const y = 60 + row * 60; for (let x = 40; x < 360; x++) { ink[y * width + x] = 1; ink[(y + 1) * width + x] = 1; } }
  assert.equal(estimateDeskewAngle(ink, width, height), 0);
});

test('a hollow printed box becomes a frame while nearby clip art stays artwork', () => {
  const width = 600, height = 600;
  const data = makePage(width, height);
  // a hollow rounded-form box (answer box): only the border is inked
  const bx = 80, by = 120, bw = 260, bh = 160;
  paint(data, width, { x: bx, y: by, w: bw, h: 3 }, [30, 30, 30]);
  paint(data, width, { x: bx, y: by + bh, w: bw, h: 3 }, [30, 30, 30]);
  paint(data, width, { x: bx, y: by, w: 3, h: bh }, [30, 30, 30]);
  paint(data, width, { x: bx + bw, y: by, w: 3, h: bh + 3 }, [30, 30, 30]);
  // a small solid clip-art blob in the margin, well clear of the box
  paint(data, width, { x: 470, y: 430, w: 60, h: 60 }, [25, 22, 30]);
  const ink = buildInkMap(data, width, height);
  const { frames, regions } = separateRulesAndRegions(ink, width, height, data);
  assert.equal(frames.length, 1, 'the hollow box is one frame');
  assert.ok(Math.abs(frames[0].w - (bw + 3)) <= 6 && Math.abs(frames[0].h - (bh + 3)) <= 6);
  assert.ok(regions.some(r => Math.abs(r.x - 470) <= 3 && Math.abs(r.y - 430) <= 3), 'clip art stays an artwork region');
  assert.ok(!regions.some(r => r.w > width * .8), 'nothing collapsed into a page-spanning blob');
});

test('homography maps a keystoned quad back to a rectangle', () => {
  // a trapezoid (top narrower than bottom — a page shot from above at an angle)
  const src: [number, number][] = [[120, 40], [380, 40], [460, 300], [40, 300]];
  const dst: [number, number][] = [[0, 0], [400, 0], [400, 300], [0, 300]];
  const H = computeHomography(src, dst);
  for (let i = 0; i < 4; i++) {
    const [u, v] = applyHomography(H, src[i][0], src[i][1]);
    assert.ok(Math.abs(u - dst[i][0]) < 0.5 && Math.abs(v - dst[i][1]) < 0.5, `corner ${i} maps to its target`);
  }
  // a point on the top edge midpoint maps near the top-centre of the rectangle
  const [mu, mv] = applyHomography(H, 250, 40);
  assert.ok(mu > 150 && mu < 250 && mv < 5);
});

test('orderQuadCorners sorts scrambled corners to TL,TR,BR,BL', () => {
  const scrambled: [number, number][] = [[400, 300], [10, 12], [402, 8], [8, 305]];
  const [tl, tr, br, bl] = orderQuadCorners(scrambled);
  assert.deepEqual(tl, [10, 12]); assert.deepEqual(tr, [402, 8]);
  assert.deepEqual(br, [400, 300]); assert.deepEqual(bl, [8, 305]);
});

test('findPaperQuadFromMask returns page corners from a tilted bright region', () => {
  const mw = 100, mh = 100; const mask = new Uint8Array(mw * mh);
  // a filled tilted quad (paper) inside the frame
  const quad = [[30, 12], [88, 30], [70, 88], [12, 60]];
  const inside = (px: number, py: number) => {
    let c = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [xi, yi] = quad[i], [xj, yj] = quad[j];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  };
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (inside(x, y)) mask[y * mw + x] = 1;
  const corners = findPaperQuadFromMask(mask, mw, mh, 4); // step 4 → full-res ×4
  assert.ok(corners, 'a quad was found');
  // top-left corner should be near quad[0] scaled by step
  const [tl] = orderQuadCorners(corners!);
  assert.ok(Math.abs(tl[0] - 30 * 4) < 40 && Math.abs(tl[1] - 12 * 4) < 40);
});
