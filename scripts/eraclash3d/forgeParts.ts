/**
 * forgeParts.ts — the art scored part by part (forgeFidelity.ts --parts).
 *
 * The art has no part labels, so the model finds them: each part of the posed model (head, dō, kusazuri, sode, arms,
 * obi, hakama, shins, feet, sword) is rendered in the art's frame, and its own mask becomes SAM 2.1's prompt on the art:
 * points well inside it, points inside its neighbours as "not this", its box. SAM cuts the art's matching part along the
 * art's own edges. Then each pair is compared: overlap (IoU), how far apart the outlines run, and colour where they
 * agree. A part the model has drawn in the wrong place shows as a low IoU on that part alone, not as a blur in a
 * whole-figure score.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const PY = process.env.TELA3D_PY ?? 'D:/Plajah Runtime/tela3d-py/Scripts/python.exe';
export interface PartView { name: string; x0: number; x1: number; shift: number; r: { W: number; H: number; mask: Uint8Array; partId: Int8Array; rgb: Float32Array } }
export interface PartScore { iou: number; outlineMm: number; deltaE: number; area: number; reliable: boolean; why?: string }

/** Connected pieces of a mask (4-connected): a part like the arms is two objects to SAM, each prompted on its own. */
function pieces(m: Uint8Array, W: number, H: number, minArea: number): Uint8Array[] {
  const lab = new Int32Array(W * H).fill(-1), out: Uint8Array[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    const id = out.length, stack = [i], px: number[] = []; lab[i] = id;
    while (stack.length) {
      const j = stack.pop()!; px.push(j);
      const x = j % W, y = (j / W) | 0;
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (k >= 0 && m[k] && lab[k] < 0) { lab[k] = id; stack.push(k); }
    }
    const piece = new Uint8Array(W * H); for (const j of px) piece[j] = 1;
    out.push(px.length >= minArea ? piece : new Uint8Array(0));
  }
  return out.filter((q) => q.length);
}

const COLOURS = [[255, 200, 60], [230, 60, 50], [60, 200, 90], [60, 140, 255], [200, 90, 230], [40, 220, 220], [255, 130, 40], [150, 220, 60], [240, 120, 180], [180, 180, 180]];

function chamfer(src: Uint8Array, W: number, H: number, edgeOnly: boolean) {
  const D = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    const e = src[i] && (!edgeOnly || x === 0 || y === 0 || x === W - 1 || y === H - 1 || !src[i - 1] || !src[i + 1] || !src[i - W] || !src[i + W]);
    D[i] = (edgeOnly ? e : !src[i]) ? 0 : 1e9;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x) D[i] = Math.min(D[i], D[i - 1] + 1); if (y) D[i] = Math.min(D[i], D[i - W] + 1); if (x && y) D[i] = Math.min(D[i], D[i - W - 1] + 1.414); if (y && x < W - 1) D[i] = Math.min(D[i], D[i - W + 1] + 1.414); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) D[i] = Math.min(D[i], D[i + 1] + 1); if (y < H - 1) D[i] = Math.min(D[i], D[i + W] + 1); if (x < W - 1 && y < H - 1) D[i] = Math.min(D[i], D[i + W + 1] + 1.414); if (y < H - 1 && x) D[i] = Math.min(D[i], D[i + W - 1] + 1.414); }
  return D;
}
/** Up to n points spread through the pixels (farthest-point), given as [x, y]. */
function spread(pix: number[], W: number, n: number): number[][] {
  if (!pix.length) return [];
  const pts = [pix[Math.floor(pix.length / 2)]];
  const step = Math.max(1, Math.floor(pix.length / 4000));
  while (pts.length < n) {
    let best = -1, bd = -1;
    for (let k = 0; k < pix.length; k += step) { const i = pix[k]; let d = Infinity; for (const p of pts) d = Math.min(d, (i % W - p % W) ** 2 + ((i / W | 0) - (p / W | 0)) ** 2); if (d > bd) { bd = d; best = i; } }
    if (bd < 64) break; // closer than 8 px to one already: enough
    pts.push(best);
  }
  return pts.map((i) => [i % W, (i / W) | 0]);
}
function lab(r: number, g: number, b: number) {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function scoreParts(views: PartView[], sheet: { W: number; H: number; data: Buffer; mask: Uint8Array }, parts: readonly string[], ppm: number, outDir: string) {
  const work = path.join(outDir, 'parts'); fs.mkdirSync(work, { recursive: true });
  const result: Record<string, Record<string, PartScore>> = {};
  for (const v of views) {
    const W = v.x1 - v.x0, H = v.r.H;
    // the art's view, and each model part shifted onto it
    const artPng = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const si = (y * sheet.W + v.x0 + x) * 4, di = (y * W + x) * 4; artPng.data[di] = sheet.data[si]; artPng.data[di + 1] = sheet.data[si + 1]; artPng.data[di + 2] = sheet.data[si + 2]; artPng.data[di + 3] = 255; }
    const imgFile = path.join(work, `${v.name}.png`);
    fs.writeFileSync(imgFile, PNG.sync.write(artPng));
    const model = parts.map(() => new Uint8Array(W * H));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = v.r.partId[y * W + x]; const ax = x + v.shift; if (p >= 0 && ax >= 0 && ax < W) model[p][y * W + ax] = 1; }
    const figure = (i: number) => sheet.mask[((i / W) | 0) * sheet.W + v.x0 + (i % W)] === 1;
    // insides: well within the model's part AND on the art's figure (a point off the art says nothing to SAM)
    const insideOf = (m: Uint8Array) => { const d = chamfer(m, W, H, false); const out: number[] = []; for (let i = 0; i < W * H; i++) if (m[i] && d[i] > 4 && figure(i)) out.push(i); return out; };
    const inner = model.map(insideOf);
    const jobs: Record<string, unknown>[] = [];
    const jobsOf: Record<string, string[]> = {};
    const thinPart: Record<string, boolean> = {};
    parts.forEach((name, p) => {
      jobsOf[name] = [];
      pieces(model[p], W, H, 40).forEach((piece, k) => {
        // a thin part (a sword, a cord: nowhere more than ~8 px from its edge) is prompted along its length, and told
        // "not this" right beside it, where SAM would otherwise spill into whatever it lies across (the sash it is
        // thrust through); a broad part is prompted from deep inside, as before
        const dIn = chamfer(piece, W, H, false);
        let maxD = 0; for (let i = 0; i < W * H; i++) if (piece[i] && dIn[i] > maxD) maxD = dIn[i];
        const thin = maxD < 8;
        thinPart[name] = (thinPart[name] ?? true) && thin;
        let area = 0; for (let i = 0; i < W * H; i++) area += piece[i];
        if (!thin && area < 250) return;
        const inside = thin ? (() => { const out: number[] = []; for (let i = 0; i < W * H; i++) if (piece[i] && dIn[i] >= Math.max(1, maxD * 0.55) && figure(i)) out.push(i); return out; })() : insideOf(piece);
        if (inside.length < (thin ? 12 : 120)) return;
        let x0 = W, y0 = H, x1 = 0, y1 = 0;
        for (let i = 0; i < W * H; i++) if (piece[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const pad = Math.max(6, Math.round((x1 - x0 + y1 - y0) * 0.05));
        const box = [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W - 1, x1 + pad), Math.min(H - 1, y1 + pad)];
        // "not this": other parts' insides within the box (not this part's other piece: it is the same thing)
        const others: number[] = [];
        if (thin) {
          // the ring 5–12 px outside the piece, on the figure: what it lies across
          const dOut = chamfer(piece.map((v) => 1 - v) as unknown as Uint8Array, W, H, false);
          for (let i = 0; i < W * H; i++) if (!piece[i] && dOut[i] >= 5 && dOut[i] <= 12 && figure(i) && !model[p][i]) others.push(i);
        } else parts.forEach((_, q) => { if (q !== p) for (const i of inner[q]) { const x = i % W, y = (i / W) | 0; if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) others.push(i); } });
        if (thin) {
          // a long thin part is too thin for SAM whole (it spills into the sash it crosses, or keeps a scrap): cut it in
          // short segments along its length, each with its own box, points down its middle and "not this" beside it
          const px: number[] = []; for (let i = 0; i < W * H; i++) if (piece[i]) px.push(i);
          let mx = 0, my = 0; for (const i of px) { mx += i % W; my += (i / W) | 0; } mx /= px.length; my /= px.length;
          let sxx = 0, syy = 0, sxy = 0; for (const i of px) { const dx = i % W - mx, dy = ((i / W) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
          const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(ang), ay = Math.sin(ang);
          const tOf = (i: number) => (i % W - mx) * ax + (((i / W) | 0) - my) * ay;
          let t0 = Infinity, t1 = -Infinity; for (const i of px) { const t = tOf(i); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
          const SEG = 46, n = Math.max(1, Math.ceil((t1 - t0) / SEG));
          for (let sgi = 0; sgi < n; sgi++) {
            const a = t0 + sgi * SEG - 6, b = t0 + (sgi + 1) * SEG + 6;
            const seg = new Uint8Array(W * H); let sx0 = W, sy0 = H, sx1 = 0, sy1 = 0, cnt = 0;
            for (const i of px) { const t = tOf(i); if (t >= a && t <= b) { seg[i] = 1; cnt++; const x = i % W, y = (i / W) | 0; sx0 = Math.min(sx0, x); sx1 = Math.max(sx1, x); sy0 = Math.min(sy0, y); sy1 = Math.max(sy1, y); } }
            if (cnt < 20) continue;
            const sbox = [Math.max(0, sx0 - 6), Math.max(0, sy0 - 6), Math.min(W - 1, sx1 + 6), Math.min(H - 1, sy1 + 6)];
            const sin = inside.filter((i) => seg[i]), sneg = others.filter((i) => { const x = i % W, y = (i / W) | 0; return x >= sbox[0] - 6 && x <= sbox[2] + 6 && y >= sbox[1] - 6 && y <= sbox[3] + 6; });
            if (sin.length < 4) continue;
            const gp = new PNG({ width: W, height: H });
            for (let i = 0; i < W * H; i++) { const c = seg[i] ? 255 : 0; gp.data[i * 4] = gp.data[i * 4 + 1] = gp.data[i * 4 + 2] = c; gp.data[i * 4 + 3] = 255; }
            const sid = `${name}#${k}.${sgi}`, sg = path.join(work, `${v.name}_${name}_${k}_${sgi}_guide.png`), so = path.join(work, `${v.name}_${name}_${k}_${sgi}_cut.png`);
            fs.writeFileSync(sg, PNG.sync.write(gp));
            jobs.push({ name: sid, pos: spread(sin, W, 4), neg: spread(sneg, W, 6), box: sbox, guide: sg, out: so, thin: true });
            jobsOf[name].push(so);
          }
          return;
        }
        const guide = new PNG({ width: W, height: H });
        for (let i = 0; i < W * H; i++) { const c = piece[i] ? 255 : 0; guide.data[i * 4] = guide.data[i * 4 + 1] = guide.data[i * 4 + 2] = c; guide.data[i * 4 + 3] = 255; }
        const id = `${name}#${k}`, gFile = path.join(work, `${v.name}_${name}_${k}_guide.png`), out = path.join(work, `${v.name}_${name}_${k}_cut.png`);
        fs.writeFileSync(gFile, PNG.sync.write(guide));
        jobs.push({ name: id, pos: spread(inside, W, thin ? 10 : 6), neg: spread(others, W, thin ? 10 : 6), box, guide: gFile, out, ...(thin ? { thin: true } : {}) });
        jobsOf[name].push(out);
      });
    });
    const jobFile = path.join(work, `${v.name}_jobs.json`);
    const resFile = path.join(work, `${v.name}_results.json`);
    fs.writeFileSync(jobFile, JSON.stringify({ image: imgFile, results: resFile, jobs }));
    execFileSync(PY, ['engines/tela-3d/sam_prompt.py', jobFile], { stdio: ['ignore', 'ignore', 'inherit'] });

    // ---- each part's art mask: its pieces joined, then one owner per pixel ----------------------------------------
    const sam = JSON.parse(fs.readFileSync(resFile, 'utf8')) as Record<string, { guideIoU: number; score: number }>;
    const artOf = parts.map((name, p) => {
      const A = new Uint8Array(W * H);
      for (const f of jobsOf[name]) { if (!fs.existsSync(f)) continue; const a = PNG.sync.read(fs.readFileSync(f)); for (let i = 0; i < W * H; i++) if (a.data[i * 4] > 127 && figure(i)) A[i] = 1; }
      return A;
    });
    // a pixel two cuts claim goes to the smaller cut: a sash lies over the tassets, a foot ends the shin (as Argilla's own
    // part finder does). Never to whichever part the model has there: that would lean the art toward the model and
    // flatter the score; nor to the surer cut: big confident cuts swallowed their small neighbours.
    const areaOf = artOf.map((A) => A.reduce((a, x) => a + x, 0));
    const order = parts.map((_, p) => p).filter((p) => areaOf[p] > 0).sort((a, b) => areaOf[a] - areaOf[b]);
    for (let i = 0; i < W * H; i++) {
      let owner = -1;
      for (const p of order) if (artOf[p][i]) { if (owner < 0) owner = p; else artOf[p][i] = 0; }
    }
    result[v.name] = {};
    const overlay = PNG.sync.read(PNG.sync.write(artPng));
    parts.forEach((name, p) => {
      if (!jobsOf[name].length) return;
      const A = artOf[p];
      const M = model[p];
      let inter = 0, uni = 0;
      for (let i = 0; i < W * H; i++) { if (A[i] && M[i]) inter++; if (A[i] || M[i]) uni++; }
      const dA = chamfer(A, W, H, true), dM = chamfer(M, W, H, true);
      let ds = 0, dn = 0;
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = (i / W) | 0, edge = (m: Uint8Array) => m[i] && (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W]);
        if (edge(M)) { ds += Math.min(60, dA[i]); dn++; }
        if (edge(A)) { ds += Math.min(60, dM[i]); dn++; }
      }
      // colour: 6 px blocks inside both
      let de = 0, dc = 0; const B = 6;
      for (let by = 0; by + B <= H; by += B) for (let bx = 0; bx + B <= W; bx += B) {
        const ma = [0, 0, 0], mm = [0, 0, 0]; let n = 0;
        for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
          const i = y * W + x; if (!A[i] || !M[i]) continue;
          const mi = y * W + x - v.shift; if (mi < y * W || mi >= (y + 1) * W) continue;
          for (let k = 0; k < 3; k++) { ma[k] += artPng.data[i * 4 + k]; mm[k] += v.r.rgb[mi * 3 + k]; } n++;
        }
        if (n < B * B * 0.7) continue;
        const la = lab(ma[0] / n, ma[1] / n, ma[2] / n), lm = lab(mm[0] / n, mm[1] / n, mm[2] / n);
        de += Math.hypot(la[0] - lm[0], la[1] - lm[1], la[2] - lm[2]); dc++;
      }
      // a cut is doubtful when it is far smaller or larger than the model's part, or fits it badly even grown: then it
      // says more about SAM than about the model, and the search leaves it out
      let aArea = 0, mArea = 0; for (let i = 0; i < W * H; i++) { aArea += A[i]; mArea += M[i]; }
      const ratio = aArea / Math.max(1, mArea);
      const fits = Object.entries(sam).filter(([k]) => k.startsWith(`${name}#`)).map(([, x]) => x.guideIoU);
      const fit = fits.length ? Math.min(...fits) : 0;
      const why = ratio < 0.35 ? `art cut ${Math.round(ratio * 100)}% of the model's` : ratio > 2.8 ? `art cut ${ratio.toFixed(1)}x the model's` : fit < 0.15 ? `cut fits poorly (${fit.toFixed(2)})` : undefined;
      result[v.name][name] = { iou: +(uni ? inter / uni : 0).toFixed(3), outlineMm: +(dn ? ds / dn / ppm * 1000 : 0).toFixed(1), deltaE: +(dc ? de / dc : 0).toFixed(1), area: inter, reliable: !why, ...(why ? { why } : {}) };
      // the joined, owned cut is what --fast compares against (and a doubtful one is marked, so it is left out)
      const png = new PNG({ width: W, height: H });
      for (let i = 0; i < W * H; i++) { const c = A[i] ? 255 : 0; png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = c; png.data[i * 4 + 3] = 255; }
      fs.writeFileSync(path.join(work, `${v.name}_${name}_art.png`), PNG.sync.write(png));
      const flag = path.join(work, `${v.name}_${name}_art.unreliable`);
      if (why) fs.writeFileSync(flag, why); else if (fs.existsSync(flag)) fs.unlinkSync(flag);
      // overlay: the art's part tinted, the model's part outlined, in the part's colour
      const c = COLOURS[p % COLOURS.length];
      for (let i = 0; i < W * H; i++) {
        if (A[i]) for (let k = 0; k < 3; k++) overlay.data[i * 4 + k] = Math.round(overlay.data[i * 4 + k] * 0.55 + c[k] * 0.45);
        if (dM[i] < 1.5) for (let k = 0; k < 3; k++) overlay.data[i * 4 + k] = c[k];
      }
    });
    fs.writeFileSync(path.join(outDir, `parts_${v.name}.png`), PNG.sync.write(overlay));
  }
  return result;
}
