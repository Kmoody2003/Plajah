// Shared GPU/DSP memory & FFT acceleration primitives for SOMA and TONOS deep layers.
// Zero browser/DOM dependencies so workers and Node test harnesses run identically.

const MAX_POOL_PER_BUCKET = 4;
const MAX_POOL_LEN = 262_144; // 2 MB cap per Float64Array

const f64Pool = new Map<number, Float64Array[]>();
const f32Pool = new Map<number, Float32Array[]>();

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Acquire a Float64Array of at least `len` elements from the thread-local bucketed pool. */
export function acquireF64Scratch(len: number): Float64Array {
  const cap = nextPow2(Math.max(16, len));
  const bucket = f64Pool.get(cap);
  if (bucket?.length) return bucket.pop()!;
  return new Float64Array(cap);
}

/** Return a pooled Float64Array so long per-note FFT passes allocate zero heap memory in steady state. */
export function releaseF64Scratch(buf: Float64Array): void {
  const cap = buf.length;
  if (cap > MAX_POOL_LEN || (cap & (cap - 1)) !== 0) return;
  let bucket = f64Pool.get(cap);
  if (!bucket) {
    bucket = [];
    f64Pool.set(cap, bucket);
  }
  if (bucket.length < MAX_POOL_PER_BUCKET) bucket.push(buf);
}

/** Acquire a Float32Array of at least `len` elements from the thread-local bucketed pool. */
export function acquireF32Scratch(len: number): Float32Array {
  const cap = nextPow2(Math.max(16, len));
  const bucket = f32Pool.get(cap);
  if (bucket?.length) return bucket.pop()!;
  return new Float32Array(cap);
}

/** Return a pooled Float32Array back to the scratch pool. */
export function releaseF32Scratch(buf: Float32Array): void {
  const cap = buf.length;
  if (cap > MAX_POOL_LEN || (cap & (cap - 1)) !== 0) return;
  let bucket = f32Pool.get(cap);
  if (!bucket) {
    bucket = [];
    f32Pool.set(cap, bucket);
  }
  if (bucket.length < MAX_POOL_PER_BUCKET) bucket.push(buf);
}

/** Touch an entry in an insertion-ordered Map (promote to most-recently-used). */
export function lruTouch<K, V>(map: Map<K, V>, key: K): V | undefined {
  const v = map.get(key);
  if (v === undefined && !map.has(key)) return undefined;
  map.delete(key);
  map.set(key, v as V);
  return v;
}

/** Insert into an insertion-ordered Map and evict oldest keys above `maxEntries`. */
export function lruSet<K, V>(map: Map<K, V>, key: K, val: V, maxEntries: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, val);
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

interface FftTable {
  bitRev: Uint32Array;
  cos: Float64Array;
  sin: Float64Array;
}

const fftTableCache = new Map<number, FftTable>();

function getFftTable(n: number): FftTable {
  const cached = lruTouch(fftTableCache, n);
  if (cached) return cached;

  const bits = Math.round(Math.log2(n));
  const bitRev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i;
    let r = 0;
    for (let b = 0; b < bits; b++) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    bitRev[i] = r;
  }

  // Packed per-stage twiddles: stage len = 2, 4, ..., n uses half entries [offset .. offset + half - 1]
  // Total entries = 1 + 2 + 4 + ... + n/2 = n - 1.
  const cos = new Float64Array(n);
  const sin = new Float64Array(n);
  let off = 0;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    for (let k = 0; k < half; k++) {
      cos[off + k] = Math.cos(ang * k);
      sin[off + k] = Math.sin(ang * k);
    }
    off += half;
  }

  const table: FftTable = { bitRev, cos, sin };
  lruSet(fftTableCache, n, table, 12);
  return table;
}

/** In-place radix-2 Cooley-Tukey FFT using cached bit-reversal and exact twiddle tables. */
export function fftRadix2(re: Float64Array, im: Float64Array, n: number, invert = false): void {
  const { bitRev, cos, sin } = getFftTable(n);
  for (let i = 0; i < n; i++) {
    const j = bitRev[i]!;
    if (j > i) {
      let tmp = re[i]!; re[i] = re[j]!; re[j] = tmp;
      tmp = im[i]!; im[i] = im[j]!; im[j] = tmp;
    }
  }
  const sinSign = invert ? -1 : 1;
  let off = 0;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < half; j++) {
        const wRe = cos[off + j]!;
        const wIm = sin[off + j]! * sinSign;
        const even = i + j;
        const odd = even + half;
        const xr = re[odd]!;
        const xi = im[odd]!;
        const vr = xr * wRe - xi * wIm;
        const vi = xr * wIm + xi * wRe;
        re[odd] = re[even]! - vr;
        im[odd] = im[even]! - vi;
        re[even]! += vr;
        im[even]! += vi;
      }
    }
    off += half;
  }
  if (invert) {
    const inv = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i]! *= inv;
      im[i]! *= inv;
    }
  }
}

/** Single real power spectrum |FFT(x)|^2 written into `outPower[0 .. n/2]` with zero heap churn. */
export function realPowerSpecInto(x: ArrayLike<number>, xLen: number, n: number, outPower: Float64Array): void {
  const re = acquireF64Scratch(n);
  const im = acquireF64Scratch(n);
  try {
    const copyLen = Math.min(xLen, n);
    for (let i = 0; i < copyLen; i++) re[i] = x[i]!;
    re.fill(0, copyLen, n);
    im.fill(0, 0, n);
    fftRadix2(re, im, n);
    const half = n >> 1;
    for (let k = 0; k <= half; k++) {
      const rr = re[k]!;
      const ii = im[k]!;
      outPower[k] = rr * rr + ii * ii;
    }
  } finally {
    releaseF64Scratch(re);
    releaseF64Scratch(im);
  }
}

/**
 * Compute two real power spectra |FFT(a)|^2 and |FFT(b)|^2 simultaneously via a single complex FFT
 * of z[t] = a[t] + i*b[t], halving FFT compute and scratch footprint cleanly.
 */
export function realPairPowerSpecsInto(
  a: ArrayLike<number>,
  aLen: number,
  b: ArrayLike<number>,
  bLen: number,
  n: number,
  powA: Float64Array,
  powB: Float64Array,
): void {
  const re = acquireF64Scratch(n);
  const im = acquireF64Scratch(n);
  try {
    const ca = Math.min(aLen, n);
    const cb = Math.min(bLen, n);
    for (let i = 0; i < ca; i++) re[i] = a[i]!;
    re.fill(0, ca, n);
    for (let i = 0; i < cb; i++) im[i] = b[i]!;
    im.fill(0, cb, n);
    fftRadix2(re, im, n);

    const half = n >> 1;
    const r0 = re[0]!;
    const i0 = im[0]!;
    powA[0] = r0 * r0;
    powB[0] = i0 * i0;

    const rH = re[half]!;
    const iH = im[half]!;
    powA[half] = rH * rH;
    powB[half] = iH * iH;

    for (let k = 1; k < half; k++) {
      const nk = n - k;
      const zrk = re[k]!;
      const zik = im[k]!;
      const zrn = re[nk]!;
      const zin = im[nk]!;
      const ar = 0.5 * (zrk + zrn);
      const ai = 0.5 * (zik - zin);
      const br = 0.5 * (zik + zin);
      const bi = 0.5 * (zrn - zrk);
      powA[k] = ar * ar + ai * ai;
      powB[k] = br * br + bi * bi;
    }
  } finally {
    releaseF64Scratch(re);
    releaseF64Scratch(im);
  }
}

/** Trim trailing silence below `threshold` (-80 dB default) so caches & worklet slots keep only live audio. */
export function trimSilenceTail(
  data: Float32Array,
  stereo: boolean,
  frames: number,
  minFrames: number,
  threshold = 1e-4,
): { data: Float32Array; frames: number } {
  let last = -1;
  if (stereo) {
    for (let i = frames - 1; i >= 0; i--) {
      if (Math.abs(data[i]!) > threshold || Math.abs(data[frames + i]!) > threshold) {
        last = i;
        break;
      }
    }
  } else {
    for (let i = frames - 1; i >= 0; i--) {
      if (Math.abs(data[i]!) > threshold) {
        last = i;
        break;
      }
    }
  }
  const keep = Math.min(frames, Math.max(minFrames, last + 64));
  if (keep >= frames - 128) return { data, frames };

  const fade = Math.min(32, keep);
  if (stereo) {
    const out = new Float32Array(keep * 2);
    out.set(data.subarray(0, keep), 0);
    out.set(data.subarray(frames, frames + keep), keep);
    for (let i = 0; i < fade; i++) {
      const g = (fade - 1 - i) / Math.max(1, fade);
      out[keep - fade + i]! *= g;
      out[keep + keep - fade + i]! *= g;
    }
    return { data: out, frames: keep };
  }
  const out = data.slice(0, keep);
  for (let i = 0; i < fade; i++) {
    out[keep - fade + i]! *= (fade - 1 - i) / Math.max(1, fade);
  }
  return { data: out, frames: keep };
}

/** Group batch items into frame-duration buckets so short hits never pad to multi-second batch tails. */
export function bucketByFrames<T>(
  items: readonly T[],
  getFrames: (item: T) => number,
  maxRatio = 1.65,
): Array<{ items: T[]; maxFrames: number }> {
  if (items.length <= 1) {
    return items.length ? [{ items: [...items], maxFrames: getFrames(items[0]!) }] : [];
  }
  const sorted = [...items].sort((a, b) => getFrames(a) - getFrames(b));
  const out: Array<{ items: T[]; maxFrames: number }> = [];
  let cur: T[] = [];
  let minF = 0;
  let maxF = 0;
  for (const item of sorted) {
    const f = getFrames(item);
    if (!cur.length) {
      cur = [item];
      minF = f;
      maxF = f;
    } else if (f <= minF * maxRatio) {
      cur.push(item);
      if (f > maxF) maxF = f;
    } else {
      out.push({ items: cur, maxFrames: maxF });
      cur = [item];
      minF = f;
      maxF = f;
    }
  }
  if (cur.length) out.push({ items: cur, maxFrames: maxF });
  return out;
}
