/**
 * wholeSubject.ts — finds the parts of a subject that the cut-out missed.
 *
 * A salient-object model keeps what catches the eye: on a plane in front of a hangar it kept the fuselage and left both
 * wings as faint haze, and a shape generator can't build a wing it was never shown. Depth draws the same object cleanly,
 * so the cut-out is grown across smooth depth and stopped at depth jumps. Low in the frame, whatever matches its row's
 * usual depth is taken for ground, or the wheels would lead the growth out across the field.
 */

export interface WholeSubject {
  mask: Float32Array;
  seedShare: number;
  share: number;
  /** False when growth ran away and the original cut-out was kept. */
  grew: boolean;
}

const STEP = 0.015;
const GROUND_TOLERANCE = 0.02;
const STANDS_OUT = 0.03;
const MUST_STAND_OUT = 0.5;
const EDGE_REACH = 5;
const SLOPE_REACH = 2;
const JOIN_REACH = 8;
const STEEP = 0.022;
const FAINT_SLOPE = 0.006;
const COLOUR_EDGE = 28;

function resample(source: Float32Array, from: number, to: number) {
  const out = new Float32Array(to * to);
  for (let y = 0; y < to; y++) {
    const fy = Math.min(from - 1.001, (y + 0.5) * (from / to) - 0.5), y0 = Math.max(0, Math.floor(fy)), ty = Math.max(0, fy - y0);
    for (let x = 0; x < to; x++) {
      const fx = Math.min(from - 1.001, (x + 0.5) * (from / to) - 0.5), x0 = Math.max(0, Math.floor(fx)), tx = Math.max(0, fx - x0);
      const a = source[x0 + y0 * from], b = source[x0 + 1 + y0 * from], c = source[x0 + (y0 + 1) * from], d = source[x0 + 1 + (y0 + 1) * from];
      out[x + y * to] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

const percentile = (sorted: ArrayLike<number>, p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

/** Biggest solid region of the cut-out. Everything else in it, people in the background included, is not the subject. */
function biggestRegion(mask: Float32Array, S: number) {
  const label = new Int32Array(S * S);
  const stack: number[] = [];
  let next = 0, best = 0, bestCount = 0;
  for (let start = 0; start < label.length; start++) {
    if (label[start] || mask[start] < 0.5) continue;
    next++;
    let count = 0;
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      count++;
      const x = i % S;
      for (const j of [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, i - S, i + S]) {
        if (j >= 0 && j < label.length && !label[j] && mask[j] >= 0.5) { label[j] = next; stack.push(j); }
      }
    }
    if (count > bestCount) { bestCount = count; best = next; }
  }
  const seed = new Uint8Array(S * S);
  if (best) for (let i = 0; i < seed.length; i++) if (label[i] === best) seed[i] = 1;
  return { seed, count: bestCount, label, regions: next, biggest: best };
}

/** A second big region at the same depth is more of the subject, like the other drum of a pair. */
function addCompanions(found: ReturnType<typeof biggestRegion>, depth: Float32Array, near: number, far: number) {
  const { seed, label, regions, biggest } = found;
  const sizes = new Int32Array(regions + 1), sums = new Float32Array(regions + 1);
  for (let i = 0; i < label.length; i++) if (label[i]) { sizes[label[i]]++; sums[label[i]] += depth[i]; }
  let added = 0;
  for (let n = 1; n <= regions; n++) {
    if (n === biggest || sizes[n] < found.count * 0.15) continue;
    const mean = sums[n] / sizes[n];
    if (mean < far || mean > near) continue;
    for (let i = 0; i < label.length; i++) if (label[i] === n) seed[i] = 1;
    added += sizes[n];
  }
  return added;
}

/**
 * `depth` covers the whole frame, nearer is larger, and `rgb` is the picture at the mask's size. The result keeps the
 * cut-out's soft edge wherever it was already sure.
 */
export function wholeSubject(mask: Float32Array, S: number, frameDepth: Float32Array, depthSize: number, rgb?: Uint8Array): WholeSubject {
  const found = biggestRegion(mask, S);
  const { seed } = found;
  let { count } = found;
  const total = S * S;
  if (!count) return { mask, seedShare: 0, share: 0, grew: false };

  const raw = resample(frameDepth, depthSize, S);
  const ordered = Float32Array.from(raw).sort();
  const lo = percentile(ordered, 0.01), span = Math.max(percentile(ordered, 0.99) - lo, 1e-5);
  const depth = raw.map((d) => Math.min(1, Math.max(0, (d - lo) / span)));

  const seedDepths: number[] = [];
  let top = S, bottom = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!seed[x + y * S]) continue;
    seedDepths.push(depth[x + y * S]);
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  seedDepths.sort((a, b) => a - b);
  const d0 = percentile(seedDepths, 0.02), d1 = percentile(seedDepths, 0.98);
  const margin = 0.25 * Math.max(d1 - d0, 0.08);
  count += addCompanions(found, depth, d1 + margin, d0 - margin);
  const middle = (top + bottom) >> 1;

  const rowUsual = new Float32Array(S).fill(-1);
  const row: number[] = [];
  for (let y = middle; y < S; y++) {
    row.length = 0;
    for (let x = 0; x < S; x++) if (!seed[x + y * S]) row.push(depth[x + y * S]);
    if (row.length) rowUsual[y] = row.sort((a, b) => a - b)[row.length >> 1];
  }
  // A soft edge can be crossed in small steps, so anywhere depth is changing fast is a wall too.
  const steep = (x: number, y: number) => {
    const at = (a: number, b: number) => depth[Math.max(0, Math.min(S - 1, a)) + Math.max(0, Math.min(S - 1, b)) * S];
    const across = Math.abs(at(x + SLOPE_REACH, y) - at(x - SLOPE_REACH, y)), down = Math.abs(at(x, y + SLOPE_REACH) - at(x, y - SLOPE_REACH));
    if (across > STEEP || down > STEEP) return true;
    if (!rgb) return false;
    // Where something sits just in front of what's behind it, depth barely moves, but the picture shows the edge.
    // Both have to agree, so a painted line on one surface doesn't count.
    const colour = (a: number, b: number, c: number, d: number) => {
      const p = (Math.max(0, Math.min(S - 1, a)) + Math.max(0, Math.min(S - 1, b)) * S) * 3, q = (Math.max(0, Math.min(S - 1, c)) + Math.max(0, Math.min(S - 1, d)) * S) * 3;
      return Math.max(Math.abs(rgb[p] - rgb[q]), Math.abs(rgb[p + 1] - rgb[q + 1]), Math.abs(rgb[p + 2] - rgb[q + 2]));
    };
    return (across > FAINT_SLOPE && colour(x + SLOPE_REACH, y, x - SLOPE_REACH, y) > COLOUR_EDGE) || (down > FAINT_SLOPE && colour(x, y + SLOPE_REACH, x, y - SLOPE_REACH) > COLOUR_EDGE);
  };
  // Parts join the subject right where depth is steepest, so that test only starts a little way out from it.
  let near = seed.slice();
  for (let pass = 0; pass < JOIN_REACH; pass++) {
    const was = near.slice();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if ((x > 0 && was[x - 1 + y * S]) || (x < S - 1 && was[x + 1 + y * S]) || (y > 0 && was[x + (y - 1) * S]) || (y < S - 1 && was[x + (y + 1) * S])) near[x + y * S] = 1;
    }
  }
  const inBounds = (x: number, y: number) => {
    const d = depth[x + y * S];
    if (d < d0 - margin * 3 || d > d1 + margin) return false;
    return y < middle || Math.abs(d - rowUsual[y]) > GROUND_TOLERANCE;
  };
  const allowed = (x: number, y: number) => inBounds(x, y) && (near[x + y * S] === 1 || !steep(x, y));

  let grown = seed.slice();
  const stack: number[] = [];
  for (let i = 0; i < total; i++) if (seed[i]) stack.push(i);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % S, y = Math.floor(i / S);
    const visit = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) return;
      const j = nx + ny * S;
      if (grown[j] || !allowed(nx, ny) || Math.abs(depth[j] - depth[i]) >= STEP) return;
      grown[j] = 1;
      stack.push(j);
    };
    visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
  }

  // The slope test stops a little short of a part's true edge, so the part is let back out to it.
  for (let pass = 0; pass < SLOPE_REACH + 1; pass++) {
    const was = grown.slice();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = x + y * S;
      if (was[i] || !inBounds(x, y)) continue;
      const from = [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, y > 0 ? i - S : -1, y < S - 1 ? i + S : -1];
      if (from.some((j) => j >= 0 && was[j] && Math.abs(depth[i] - depth[j]) < STEP)) grown[i] = 1;
    }
  }

  // One round of erode then dilate takes off the one-pixel threads a leak travels along.
  const has = (field: Uint8Array, x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && field[x + y * S] === 1;
  const eroded = new Uint8Array(total);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (has(grown, x, y) && has(grown, x - 1, y) && has(grown, x + 1, y) && has(grown, x, y - 1) && has(grown, x, y + 1)) eroded[x + y * S] = 1;
  }
  const opened = new Uint8Array(total);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (seed[x + y * S] || has(eroded, x, y) || has(eroded, x - 1, y) || has(eroded, x + 1, y) || has(eroded, x, y - 1) || has(eroded, x, y + 1)) opened[x + y * S] = 1;
  }
  grown = opened;

  // A real part stands in front of what's around it, as a wing does against a hangar. A wall or a backdrop the growth
  // leaked onto has no such edge: it just runs off the frame. Each recovered piece has to show that edge to stay.
  const piece = new Int32Array(total);
  let pieces = 0;
  for (let start = 0; start < total; start++) {
    if (!grown[start] || seed[start] || piece[start]) continue;
    pieces++;
    const members: number[] = [];
    let standsOut = 0, edge = 0;
    piece[start] = pieces;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      const x = i % S, y = Math.floor(i / S);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) { edge++; continue; }
        const j = nx + ny * S;
        if (seed[j]) continue;
        if (grown[j]) {
          if (!piece[j]) { piece[j] = pieces; stack.push(j); }
          continue;
        }
        edge++;
        // A depth edge is blurred over a few samples, so the far side is read a little way out.
        const ox = Math.max(0, Math.min(S - 1, x + (nx - x) * EDGE_REACH)), oy = Math.max(0, Math.min(S - 1, y + (ny - y) * EDGE_REACH));
        if (depth[i] - depth[ox + oy * S] > STANDS_OUT) standsOut++;
      }
    }
    if (standsOut / Math.max(edge, 1) < MUST_STAND_OUT) for (const i of members) grown[i] = 0;
  }

  let size = 0;
  for (let i = 0; i < total; i++) size += grown[i];
  const seedShare = count / total, share = size / total;

  const out = new Float32Array(total);
  // Growth that swallows far more than the subject found a floor or a wall, not a wing.
  const ranAway = share > Math.max(seedShare * 2.5, 0.35) || share > Math.max(seedShare * 8, 0.1);
  const keep = ranAway ? seed : grown;
  for (let i = 0; i < total; i++) {
    if (seed[i]) out[i] = mask[i];
    else if (keep[i]) out[i] = 1;
    else {
      // The faint rim around the subject stays, so edges stay soft. Haze anywhere else goes.
      const x = i % S, y = Math.floor(i / S);
      out[i] = has(keep, x - 1, y) || has(keep, x + 1, y) || has(keep, x, y - 1) || has(keep, x, y + 1) ? mask[i] : 0;
    }
  }
  return { mask: out, seedShare, share: ranAway ? seedShare : share, grew: !ranAway && size > count * 1.02 };
}
