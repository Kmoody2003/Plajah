/**
 * alignShape.ts — turns a generated mesh to the picture's angle and says how well it matches.
 *
 * A generator squares what it makes to face front, whatever angle the picture was taken from. Comparing that against
 * the picture would call a good plane a bad match, and paint from the picture would land on the wrong parts. So every
 * turn is drawn as a small silhouette with depth and compared. Only the turn about the vertical is applied in the end:
 * a tilt found here is the camera looking up or down, not the object leaning.
 */

const G = 96;
const CAMERA_DISTANCE = 2.2;
const ALIGN_CELLS = 128;

export interface AlignTarget {
  /** The subject's outline, square map over the frame. */
  mask: Float32Array;
  maskSize: number;
  aspect: number;
  /** Close-up depth, nearer is larger, over `box` of the frame. */
  depth?: Float32Array;
  depthSize?: number;
  box?: { u0: number; v0: number; u1: number; v1: number };
}

export interface Alignment {
  yaw: number;
  pitch: number;
  iou: number;
  depthAgreement: number | null;
  /** Share of the surface in its largest connected piece. */
  mainPiece: number;
  score: number;
}

/**
 * A lighter copy of a mesh: every vertex in a grid cell merges into one, and triangles that collapse are dropped. Far
 * smaller for the same outline, as long as the cells are no bigger than what's being measured.
 */
export function clusterMesh(positions: Float32Array, indices: ArrayLike<number>, cells: number) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    if (positions[i + k] < lo[k]) lo[k] = positions[i + k];
    if (positions[i + k] > hi[k]) hi[k] = positions[i + k];
  }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-9) / cells;
  const ids = new Map<number, number>();
  const count = positions.length / 3;
  const owner = new Int32Array(count);
  const sum: number[] = [], weight: number[] = [];
  for (let v = 0; v < count; v++) {
    const x = Math.floor((positions[v * 3] - lo[0]) / size), y = Math.floor((positions[v * 3 + 1] - lo[1]) / size), z = Math.floor((positions[v * 3 + 2] - lo[2]) / size);
    const key = x + (y + z * (cells + 2)) * (cells + 2);
    let id = ids.get(key);
    if (id === undefined) { id = ids.size; ids.set(key, id); sum.push(0, 0, 0); weight.push(0); }
    owner[v] = id;
    sum[id * 3] += positions[v * 3]; sum[id * 3 + 1] += positions[v * 3 + 1]; sum[id * 3 + 2] += positions[v * 3 + 2];
    weight[id]++;
  }
  const out = new Float32Array(sum.length);
  for (let id = 0; id < weight.length; id++) for (let k = 0; k < 3; k++) out[id * 3 + k] = sum[id * 3 + k] / weight[id];
  const kept: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = owner[indices[t]], b = owner[indices[t + 1]], c = owner[indices[t + 2]];
    if (a !== b && b !== c && a !== c) kept.push(a, b, c);
  }
  return { positions: out, indices: new Uint32Array(kept) };
}

/** Share of a mesh's surface in its largest connected piece. Pieces that touch only by position still count as joined. */
export function mainPieceShare(positions: Float32Array, indices: ArrayLike<number>) {
  const parent = new Int32Array(positions.length / 3).map((_, i) => i);
  const find = (i: number) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const seen = new Map<number, number>();
  const canon = new Int32Array(parent.length);
  // Vertices at the same spot share a key. Strings for this took seconds on a generated mesh.
  const Q = 16384, P = 131072;
  for (let v = 0; v < parent.length; v++) {
    const key = Math.round(positions[v * 3] * Q) + P / 2 + (Math.round(positions[v * 3 + 1] * Q) + P / 2) * P + (Math.round(positions[v * 3 + 2] * Q) + P / 2) * P * P;
    const at = seen.get(key);
    if (at === undefined) { seen.set(key, v); canon[v] = v; } else canon[v] = at;
  }
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(canon[indices[t]]);
    parent[find(canon[indices[t + 1]])] = a;
    parent[find(canon[indices[t + 2]])] = a;
  }
  const areas = new Map<number, number>();
  let total = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    const root = find(canon[indices[t]]);
    areas.set(root, (areas.get(root) ?? 0) + area);
    total += area;
  }
  return total ? Math.max(...areas.values()) / total : 0;
}

/** The outline in its own centred, aspect-true square, plus depth at each cell where the picture has some. */
function targetGrid(t: AlignTarget) {
  const S = t.maskSize;
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (t.mask[x + y * S] < 0.5) continue;
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    if (u < x0) x0 = u;
    if (u > x1) x1 = u;
    if (v < y0) y0 = v;
    if (v > y1) y1 = v;
  }
  const w = (x1 - x0) * t.aspect, h = y1 - y0;
  const side = Math.max(w, h, 1e-4) * 1.04;
  const cu = (x0 + x1) / 2, cv = (y0 + y1) / 2;
  const inside = new Uint8Array(G * G);
  const depth = t.depth ? new Float32Array(G * G).fill(NaN) : null;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const u = cu + (((i + 0.5) / G - 0.5) * side) / t.aspect, v = cv + ((j + 0.5) / G - 0.5) * side;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
    if (t.mask[Math.floor(u * S) + Math.floor(v * S) * S] < 0.5) continue;
    inside[i + j * G] = 1;
    if (depth && t.depth && t.depthSize && t.box) {
      const a = (u - t.box.u0) / (t.box.u1 - t.box.u0), b = (v - t.box.v0) / (t.box.v1 - t.box.v0);
      if (a >= 0 && b >= 0 && a < 1 && b < 1) depth[i + j * G] = t.depth[Math.floor(a * t.depthSize) + Math.floor(b * t.depthSize) * t.depthSize];
    }
  }
  return { inside, depth };
}

function drawTurn(positions: Float32Array, indices: ArrayLike<number>, yaw: number, pitch: number, zbuffer: Float32Array) {
  const n = positions.length / 3;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  let reach = 0;
  for (let i = 0; i < positions.length; i++) reach = Math.max(reach, Math.abs(positions[i]));
  // Photos and paintings have perspective, which makes the near wing long and the far one short. Drawn flat, the true
  // turn looks like a worse match than a wrong one.
  const camera = CAMERA_DISTANCE * Math.max(reach, 1e-6);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let v = 0; v < n; v++) {
    const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
    const rx0 = px * cy + pz * sy, rz = -px * sy + pz * cy;
    const ry0 = py * cp - rz * sp, depth = py * sp + rz * cp;
    const near = camera / Math.max(camera - depth, 1e-6);
    const rx = rx0 * near, ry = ry0 * near;
    X[v] = rx; Y[v] = ry; Z[v] = depth;
    if (rx < x0) x0 = rx;
    if (rx > x1) x1 = rx;
    if (ry < y0) y0 = ry;
    if (ry > y1) y1 = ry;
  }
  const side = Math.max(x1 - x0, y1 - y0, 1e-6) * 1.04;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const toI = (x: number) => ((x - mx) / side + 0.5) * G, toJ = (y: number) => (0.5 - (y - my) / side) * G;
  zbuffer.fill(-Infinity);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ax = toI(X[a]), ay = toJ(Y[a]), bx = toI(X[b]), by = toJ(Y[b]), cx = toI(X[c]), cz = toJ(Y[c]);
    const area = (bx - ax) * (cz - ay) - (by - ay) * (cx - ax);
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(G - 1, Math.ceil(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by, cz))), j1 = Math.min(G - 1, Math.ceil(Math.max(ay, by, cz)));
    if (Math.abs(area) < 1e-9) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i + 0.5, py = j + 0.5;
      const w0 = ((bx - px) * (cz - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cz - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * Z[a] + w1 * Z[b] + w2 * Z[c];
      if (z > zbuffer[i + j * G]) zbuffer[i + j * G] = z;
    }
  }
}

function compare(z: Float32Array, target: ReturnType<typeof targetGrid>) {
  let overlap = 0, either = 0, n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < G * G; i++) {
    const on = z[i] !== -Infinity, wanted = target.inside[i] === 1;
    if (on || wanted) either++;
    if (!(on && wanted)) continue;
    overlap++;
    const d = target.depth?.[i];
    if (d === undefined || Number.isNaN(d)) continue;
    n++; sa += z[i]; sb += d; saa += z[i] * z[i]; sbb += d * d; sab += z[i] * d;
  }
  const iou = either ? overlap / either : 0;
  const denominator = Math.sqrt(Math.max(n * saa - sa * sa, 0) * Math.max(n * sbb - sb * sb, 0));
  return { iou, corr: n > 32 && denominator > 1e-9 ? (n * sab - sa * sb) / denominator : null };
}

/** How one particular turn compares with the picture. */
export function scoreTurn(positions: Float32Array, indices: ArrayLike<number>, target: AlignTarget, yaw: number, pitch: number) {
  const z = new Float32Array(G * G);
  drawTurn(positions, indices, yaw, pitch, z);
  return compare(z, targetGrid(target));
}

/** Finds the turn that best matches the picture. */
export async function alignToPicture(positions: Float32Array, indices: ArrayLike<number>, target: AlignTarget): Promise<Alignment> {
  const grid = targetGrid(target);
  const z = new Float32Array(G * G);
  let best = { yaw: 0, pitch: 0, iou: 0, corr: null as number | null, value: -Infinity };
  // About 130 turns are drawn on a 96 grid, so cells a bit finer than that see the same outline as the full mesh.
  const light = clusterMesh(positions, indices, ALIGN_CELLS);
  const test = (yaw: number, pitch: number) => {
    drawTurn(light.positions, light.indices, yaw, pitch, z);
    const { iou, corr } = compare(z, grid);
    // Front and back views share an outline, and only depth knows which end is nearest, so it gets a real say.
    const value = iou + (corr ?? 0);
    if (value > best.value) best = { yaw, pitch, iou, corr, value };
  };
  const rad = Math.PI / 180;
  for (let yaw = -180; yaw < 180; yaw += 15) {
    for (const pitch of [-20, -8, 4, 16]) test(yaw * rad, pitch * rad);
    await new Promise((r) => setTimeout(r));
  }
  const coarse = { ...best };
  for (let dy = -12; dy <= 12; dy += 4) for (let dp = -8; dp <= 8; dp += 4) test(coarse.yaw + dy * rad, coarse.pitch + dp * rad);
  const mainPiece = mainPieceShare(positions, indices);
  return { yaw: best.yaw, pitch: best.pitch, iou: best.iou, depthAgreement: best.corr, mainPiece, score: best.iou * (0.4 + 0.6 * mainPiece) };
}

/**
 * The mesh turned to the picture and moved into the stage's frame, so the clay lines up with the picture's pixels.
 * `bounds` is where the outline sits in clay space.
 */
export function placeOnStage(positions: Float32Array, yaw: number, bounds: { x0: number; x1: number; y0: number; y1: number }) {
  const n = positions.length / 3;
  const out = new Float32Array(positions.length);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < n; v++) {
    const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
    const p = [px * c + pz * s, py, -px * s + pz * c];
    for (let k = 0; k < 3; k++) {
      out[v * 3 + k] = p[k];
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
  }
  const w = hi[0] - lo[0], h = hi[1] - lo[1], d = hi[2] - lo[2];
  const k = Math.min(Math.sqrt(((bounds.x1 - bounds.x0) / Math.max(w, 1e-6)) * ((bounds.y1 - bounds.y0) / Math.max(h, 1e-6))), 1.9 / Math.max(w, h, d, 1e-6));
  const mx = (hi[0] + lo[0]) / 2, my = (hi[1] + lo[1]) / 2, mz = (hi[2] + lo[2]) / 2;
  const tx = (bounds.x0 + bounds.x1) / 2, ty = (bounds.y0 + bounds.y1) / 2;
  for (let v = 0; v < n; v++) {
    out[v * 3] = (out[v * 3] - mx) * k + tx;
    out[v * 3 + 1] = (out[v * 3 + 1] - my) * k + ty;
    out[v * 3 + 2] = (out[v * 3 + 2] - mz) * k;
  }
  return out;
}
