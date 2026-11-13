/**
 * forgeIntake.ts — the Forge's first stage: measure a character's art, so nothing about it is typed in by hand.
 *
 *   FORGE_SPEC=scripts/eraclash3d/characters/<id>/forge.json npx tsx scripts/eraclash3d/forgeIntake.ts
 *
 * - Turnaround: the ground is the sheet's corner colour; each view is a run of columns holding the figure (taken left
 *   to right in the spec's order); the soles are the front figure's lowest row; the chin and the face's length come
 *   from MediaPipe's landmarks on the front figure's head (cropped from the top fifth of the figure, enlarged).
 * - Portrait: its 478 landmarks (engines/tela-3d/face_landmarks.py), written beside it.
 * - Flat-lay: each piece's box (a person's rough hint in flatlay_pieces.json) snapped to the pieces actually on the
 *   ground there, then cut out with SAM (engines/tela-3d/cut_pieces.py).
 * Writes intake.json, with checks: a view too narrow, a chin outside the figure, a piece with nothing under its hint.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { spec, dataFile, WORK_DIR, portraitLandmarks, flatLayPieceDir, type SheetIntake } from './forgeSpec';

const PY = process.env.TELA3D_PY ?? 'D:/Plajah Runtime/tela3d-py/Scripts/python.exe';
/** MediaPipe lives in the system Python (the Tela 3D runtime has SAM and xatlas, not MediaPipe). */
const FACE_PY = process.env.FORGE_FACE_PY ?? 'python';
const FACE_TASK = process.env.FORGE_FACE_TASK ?? 'D:/Plajah Runtime/forge/models/face_landmarker.task';
const log = (s: string) => console.log(`[intake] ${s}`);
fs.mkdirSync(WORK_DIR, { recursive: true });
const checks: string[] = [];

async function maskOf(file: string, tol = 40) {
  const r = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = r.info.width, H = r.info.height, d = r.data;
  const corner = [d[(5 * W + 5) * 4], d[(5 * W + 5) * 4 + 1], d[(5 * W + 5) * 4 + 2]];
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = Math.abs(d[i * 4] - corner[0]) + Math.abs(d[i * 4 + 1] - corner[1]) + Math.abs(d[i * 4 + 2] - corner[2]) > tol ? 1 : 0;
  return { W, H, m, data: d };
}
function landmarks(image: string, out: string) {
  execFileSync(FACE_PY, ['-P', 'engines/tela-3d/face_landmarks.py', image, FACE_TASK, out], { stdio: ['ignore', 'ignore', 'inherit'] });
  return JSON.parse(fs.readFileSync(out, 'utf8')) as { width: number; height: number; points: number[][] };
}

// ---- turnaround -------------------------------------------------------------------------------------------------------
async function turnaround(): Promise<Omit<SheetIntake, 'path'>> {
  const { W, H, m } = await maskOf(spec.art.turnaround);
  // columns holding the figure (a few pixels: thin strays are not a figure), joined across small gaps
  const col = new Int32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) col[x] += m[y * W + x];
  const runs: [number, number][] = [];
  let start = -1, gap = 0;
  for (let x = 0; x < W; x++) {
    if (col[x] > 6) { if (start < 0) start = x; gap = 0; }
    else if (start >= 0 && ++gap > 25) { runs.push([start, x - gap]); start = -1; gap = 0; }
  }
  if (start >= 0) runs.push([start, W - 1]);
  // the views are the widest runs, left to right
  const views = runs.filter(([a, b]) => b - a > W * 0.05).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0])).slice(0, spec.art.views.length).sort((p, q) => p[0] - q[0]);
  if (views.length !== spec.art.views.length) throw new Error(`turnaround: found ${views.length} figures, the spec names ${spec.art.views.length}`);
  const out: Record<string, { x0: number; x1: number }> = {};
  spec.art.views.forEach((v, i) => { const [a, b] = views[i]; const pad = 20; out[v] = { x0: Math.max(0, a - pad), x1: Math.min(W - 1, b + pad) }; });
  const f = out.front;
  let sole = 0, top = H;
  for (let y = 0; y < H; y++) for (let x = f.x0; x <= f.x1; x++) if (m[y * W + x]) { sole = Math.max(sole, y); top = Math.min(top, y); }
  // the front figure's head: the top fifth, around its middle column
  const midCols: number[] = []; for (let y = top; y < top + (sole - top) * 0.2; y++) for (let x = f.x0; x <= f.x1; x++) if (m[y * W + x]) midCols.push(x);
  midCols.sort((a, b) => a - b);
  const cx = midCols[midCols.length >> 1], hh = Math.round((sole - top) * 0.22);
  const crop = { left: Math.max(0, cx - Math.round(hh * 0.6)), top: Math.max(0, top), width: Math.round(hh * 1.2), height: hh };
  const cropFile = path.join(WORK_DIR, 'intake_front_head.png');
  await sharp(spec.art.turnaround).extract(crop).resize(crop.width * 3, crop.height * 3, { kernel: 'lanczos3' }).toFile(cropFile);
  const lm = landmarks(cropFile, path.join(WORK_DIR, 'intake_front_head.landmarks.json'));
  const at = (i: number) => [crop.left + lm.points[i][0] / 3, crop.top + lm.points[i][1] / 3];
  const chin = at(152)[1], faceLength = Math.hypot(at(152)[0] - at(10)[0], at(152)[1] - at(10)[1]);
  if (chin <= top || chin >= top + (sole - top) * 0.3) checks.push(`chin row ${chin.toFixed(0)} is not in the figure's head`);
  const res = { ...(out as unknown as Pick<SheetIntake, 'front' | 'side' | 'back'>), sole, chin: +chin.toFixed(1), faceLength: +faceLength.toFixed(1) };
  log(`turnaround: views ${spec.art.views.map((v) => `${v} ${out[v].x0}-${out[v].x1}`).join(', ')}; sole ${sole}, chin ${res.chin}, face ${res.faceLength} px (${((sole - top) / res.faceLength).toFixed(1)} faces tall)`);
  return res;
}

// ---- flat-lay ---------------------------------------------------------------------------------------------------------
async function flatLay() {
  if (!spec.art.flatLay || !fs.existsSync(spec.art.flatLay)) return null;
  const hintFile = dataFile('flatlay_pieces.json');
  if (!fs.existsSync(hintFile)) { checks.push('flat-lay given but no flatlay_pieces.json names its pieces'); return null; }
  const hints = JSON.parse(fs.readFileSync(hintFile, 'utf8')) as { pieces: { id: string; box: number[] }[] };
  const { W, H, m } = await maskOf(spec.art.flatLay, 30);
  // each hint snapped to the ground's own pieces under it: the box of the figure pixels inside the hint, grown 6 px
  const pieces = hints.pieces.map((p) => {
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    for (let y = Math.max(0, p.box[1]); y < Math.min(H, p.box[3]); y++) for (let x = Math.max(0, p.box[0]); x < Math.min(W, p.box[2]); x++) if (m[y * W + x]) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (!n) { checks.push(`flat-lay piece ${p.id}: nothing under its hint`); return p; }
    return { ...p, box: [Math.max(0, x0 - 6), Math.max(0, y0 - 6), Math.min(W - 1, x1 + 6), Math.min(H - 1, y1 + 6)] };
  });
  const snapped = { ...hints, image: spec.art.flatLay, pieces };
  const job = path.join(WORK_DIR, 'flatlay_job.json');
  fs.writeFileSync(job, JSON.stringify(snapped));
  execFileSync(PY, ['engines/tela-3d/cut_pieces.py', job, flatLayPieceDir()], { stdio: ['ignore', 'ignore', 'inherit'] });
  log(`flat-lay: ${pieces.length} pieces cut into ${flatLayPieceDir()}`);
  return pieces.map((p) => ({ id: p.id, box: p.box }));
}

const t0 = Date.now();
if (!fs.existsSync(portraitLandmarks())) { landmarks(spec.art.portrait, portraitLandmarks()); log(`portrait: landmarks -> ${portraitLandmarks()}`); }
const sheet = await turnaround();
const pieces = await flatLay();
fs.writeFileSync(dataFile('intake.json'), JSON.stringify({ sheet, flatLay: pieces, checks, ms: Date.now() - t0 }, null, 2));
log(`${checks.length ? `CHECK: ${checks.join('; ')}` : 'all checks pass'} (${((Date.now() - t0) / 1000).toFixed(0)} s) -> ${dataFile('intake.json')}`);
if (checks.length && process.argv.includes('--strict')) process.exit(1);
