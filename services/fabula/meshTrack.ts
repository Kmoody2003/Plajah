// meshTrack — non-rigid surface tracking on a deformable lattice (the Mocha PowerMesh idea).
//
// The log filed this as "needs dense optical flow". It does not. PowerMesh tracks a MESH of
// points and warps the surface between them; dense per-pixel flow is a different, much more
// expensive tool that solves a different problem. Everything needed is already here: `trackPoint`
// block-matches one feature, and the planar tracker already lays a feature lattice inside a quad.
//
// The real difference from planar tracking is what happens when a vertex matches badly. Planar
// tracking has a global model to fall back on — throw the outlier away and the homography still
// says where it should be. A mesh has no global model, so a bad vertex has to be repaired from
// its NEIGHBOURS or the surface tears. That repair, plus a fold-over guard, is most of this file:
//
//   1. block-match every vertex,
//   2. replace the displacement of any vertex that matched badly with its trusted neighbours',
//   3. smooth the whole displacement field a little, which is what stops noise reading as boiling,
//   4. refuse any vertex move that turns a quad inside out.
//
// Positions are normalized 0..1 with the origin top-left and y DOWN, matching planarTrack.
import { trackPoint, patchTexture, type GrayFrame } from './vectorTrack';
import type { Point2, Quad } from './planarTrack';
import { quadPoint } from './planarSequence';

export interface MeshSettings {
  patchRadius: number;
  searchRadius: number;
  /** Below this, a vertex is not trusted and is rebuilt from its neighbours. */
  minVertexConfidence: number;
  /** Below this share of trusted vertices the frame is called lost. */
  minTrustedRatio: number;
  /** 0..1 Laplacian smoothing of the displacement field each frame. */
  smoothing: number;
  /** Below this, the whole frame is marked lost. */
  minConfidence: number;
}

export const MESH_DEFAULTS: MeshSettings = {
  patchRadius: 7,
  searchRadius: 20,
  minVertexConfidence: 0.45,
  minTrustedRatio: 0.35,
  smoothing: 0.35,
  minConfidence: 0.4,
};

export interface MeshFrameSample {
  frame: number;
  /** Row-major, (cols + 1) * (rows + 1) entries. */
  vertices: Point2[];
  vertexConfidence: number[];
  /** Share of vertices that matched on their own rather than being rebuilt. */
  trusted: number;
  confidence: number;
  lost: boolean;
  reason?: string;
}

export interface MeshTrackSequence {
  id: string;
  name: string;
  version: number;
  sourceAssetId: string;
  fps: number;
  width: number;
  height: number;
  referenceFrame: number;
  cols: number;
  rows: number;
  /** Undeformed lattice, row-major. */
  reference: Point2[];
  settings: MeshSettings;
  samples: MeshFrameSample[];
}

/**
 * Displacement range the encoded image covers, as a fraction of the frame. The `meshwarp` shader
 * decodes with this same number; `tests/meshTrack.test.ts` pins the two together, because a
 * mismatch here does not fail — it silently scales every warp by the wrong factor.
 */
export const MESH_DISPLACEMENT_RANGE = 0.25;

export const vertexCount = (cols: number, rows: number): number => (cols + 1) * (rows + 1);
export const vertexIndex = (cols: number, col: number, row: number): number => row * (cols + 1) + col;

/** The undeformed lattice covering a quad, row-major from the top-left corner. */
export function meshLattice(corners: Quad, cols: number, rows: number): Point2[] {
  const out: Point2[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) out.push(quadPoint(corners, col / cols, row / rows));
  }
  return out;
}

export function createMeshSequence(
  sourceAssetId: string,
  fps: number,
  width: number,
  height: number,
  referenceFrame: number,
  corners: Quad,
  cols = 4,
  rows = 4,
  id = `mesh-${Date.now()}`,
  settings: Partial<MeshSettings> = {},
): MeshTrackSequence {
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  return {
    id, name: 'Mesh Track', version: 1, sourceAssetId, fps, width, height,
    referenceFrame, cols: c, rows: r,
    reference: meshLattice(corners, c, r),
    settings: { ...MESH_DEFAULTS, ...settings },
    samples: [],
  };
}

/** The reference frame's own sample: the undeformed lattice, fully trusted. */
export function meshReferenceSample(sequence: MeshTrackSequence): MeshFrameSample {
  return {
    frame: sequence.referenceFrame,
    vertices: sequence.reference.map((p) => ({ ...p })),
    vertexConfidence: sequence.reference.map(() => 1),
    trusted: 1,
    confidence: 1,
    lost: false,
  };
}

/** Neighbour indices (4-connected) of a lattice vertex. */
export function meshNeighbours(cols: number, rows: number, index: number): number[] {
  const col = index % (cols + 1);
  const row = Math.floor(index / (cols + 1));
  const out: number[] = [];
  if (col > 0) out.push(index - 1);
  if (col < cols) out.push(index + 1);
  if (row > 0) out.push(index - (cols + 1));
  if (row < rows) out.push(index + (cols + 1));
  return out;
}

/**
 * Rebuild the displacement of untrusted vertices from their trusted neighbours, spreading outwards
 * until nothing more can be reached. A vertex nothing can reach keeps the mesh's average motion,
 * which is a better guess than leaving it where a bad match put it.
 */
export function repairDisplacements(cols: number, rows: number, displacement: Point2[], trusted: boolean[]): Point2[] {
  const out = displacement.map((d) => ({ ...d }));
  const known = trusted.slice();
  const anyKnown = known.some(Boolean);
  if (!anyKnown) return out;

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      if (known[i]) continue;
      const near = meshNeighbours(cols, rows, i).filter((n) => known[n]);
      if (!near.length) continue;
      out[i] = {
        x: near.reduce((s, n) => s + out[n].x, 0) / near.length,
        y: near.reduce((s, n) => s + out[n].y, 0) / near.length,
      };
      known[i] = true;
      changed = true;
    }
  }
  // Anything still unreachable (an isolated island) takes the mean of what we do know.
  const solved = out.filter((_, i) => known[i]);
  if (solved.length && solved.length < out.length) {
    const mean = { x: solved.reduce((s, d) => s + d.x, 0) / solved.length, y: solved.reduce((s, d) => s + d.y, 0) / solved.length };
    for (let i = 0; i < out.length; i++) if (!known[i]) out[i] = { ...mean };
  }
  return out;
}

/** Laplacian smoothing of a displacement field. Strength 0 leaves it alone, 1 fully averages. */
export function smoothDisplacements(cols: number, rows: number, displacement: Point2[], strength: number): Point2[] {
  const k = Math.max(0, Math.min(1, strength));
  if (k <= 0) return displacement.map((d) => ({ ...d }));
  return displacement.map((d, i) => {
    const near = meshNeighbours(cols, rows, i);
    if (!near.length) return { ...d };
    const avg = {
      x: near.reduce((s, n) => s + displacement[n].x, 0) / near.length,
      y: near.reduce((s, n) => s + displacement[n].y, 0) / near.length,
    };
    return { x: d.x + (avg.x - d.x) * k, y: d.y + (avg.y - d.y) * k };
  });
}

const cross = (a: Point2, b: Point2, c: Point2): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/**
 * Indices of vertices that have turned at least one of their quads inside out. A folded mesh
 * samples the source back-to-front and reads as a shredded, flickering patch, so a fold is worth
 * catching even when every individual match looked fine.
 */
export function foldedVertices(cols: number, rows: number, vertices: Point2[]): number[] {
  const bad = new Set<number>();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = vertexIndex(cols, col, row);
      const b = vertexIndex(cols, col + 1, row);
      const c = vertexIndex(cols, col + 1, row + 1);
      const d = vertexIndex(cols, col, row + 1);
      // Both triangles of the quad must keep the winding the undeformed lattice had.
      if (cross(vertices[a], vertices[b], vertices[c]) <= 0) { bad.add(a); bad.add(b); bad.add(c); }
      if (cross(vertices[a], vertices[c], vertices[d]) <= 0) { bad.add(a); bad.add(c); bad.add(d); }
    }
  }
  return [...bad].sort((x, y) => x - y);
}

export interface MeshFrameResult {
  sample: MeshFrameSample;
  /** Where to start searching next frame. */
  vertices: Point2[];
  accepted: boolean;
  reason?: string;
}

/**
 * Track the lattice from `previous` into `next`. `current` is where the vertices sat in
 * `previous`, in the sequence's own order.
 */
export function trackMeshFrame(
  sequence: MeshTrackSequence,
  previous: GrayFrame,
  next: GrayFrame,
  frame: number,
  current: Point2[],
): MeshFrameResult | null {
  const { cols, rows, settings } = sequence;
  if (current.length !== vertexCount(cols, rows)) return null;

  const matched = current.map((p) => trackPoint(previous, next, p.x, p.y, settings.patchRadius, settings.searchRadius));
  const vertexConfidence = matched.map((m) => m.confidence);
  const trusted = vertexConfidence.map((c) => c >= settings.minVertexConfidence);
  const trustedRatio = trusted.filter(Boolean).length / trusted.length;

  const raw = matched.map((m, i) => ({ x: m.x - current[i].x, y: m.y - current[i].y }));
  const repaired = repairDisplacements(cols, rows, raw, trusted);
  const smoothed = smoothDisplacements(cols, rows, repaired, settings.smoothing);
  let vertices = current.map((p, i) => ({ x: p.x + smoothed[i].x, y: p.y + smoothed[i].y }));

  // Fold repair: pull the offending vertices back towards the smoothed field until the winding
  // recovers. A few passes is enough; a mesh that still folds is reported rather than shipped.
  let folded = foldedVertices(cols, rows, vertices);
  for (let attempt = 0; attempt < 4 && folded.length; attempt++) {
    const pull = new Set(folded);
    vertices = vertices.map((v, i) => {
      if (!pull.has(i)) return v;
      const near = meshNeighbours(cols, rows, i);
      const avg = {
        x: near.reduce((s, n) => s + (vertices[n].x - current[n].x), 0) / Math.max(1, near.length),
        y: near.reduce((s, n) => s + (vertices[n].y - current[n].y), 0) / Math.max(1, near.length),
      };
      return { x: current[i].x + avg.x * 0.6, y: current[i].y + avg.y * 0.6 };
    });
    folded = foldedVertices(cols, rows, vertices);
  }

  const meanConfidence = vertexConfidence.reduce((s, c) => s + c, 0) / vertexConfidence.length;
  const foldPenalty = folded.length ? 1 - Math.min(1, folded.length / vertices.length) : 1;
  const confidence = Math.max(0, Math.min(1, meanConfidence * Math.sqrt(Math.max(0, trustedRatio)) * foldPenalty));

  let reason: string | undefined;
  if (trustedRatio < settings.minTrustedRatio) reason = `only ${Math.round(trustedRatio * 100)}% of the mesh matched`;
  else if (folded.length) reason = `${folded.length} vertices folded the surface`;
  else if (confidence < settings.minConfidence) reason = `confidence ${Math.round(confidence * 100)}% under ${Math.round(settings.minConfidence * 100)}%`;
  const accepted = !reason;

  const sample: MeshFrameSample = { frame, vertices, vertexConfidence, trusted: trustedRatio, confidence, lost: !accepted, ...(reason ? { reason } : {}) };
  return { sample, vertices, accepted, reason };
}

export function upsertMeshSample(sequence: MeshTrackSequence, sample: MeshFrameSample): MeshTrackSequence {
  return { ...sequence, samples: sequence.samples.filter((s) => s.frame !== sample.frame).concat(sample).sort((a, b) => a.frame - b.frame) };
}

/** Nearest tracked sample at or before `frame`, falling back to the reference lattice. */
export function sampleMeshAt(sequence: MeshTrackSequence, frame: number): MeshFrameSample | null {
  if (!sequence.samples.length) return frame === sequence.referenceFrame ? meshReferenceSample(sequence) : null;
  const exact = sequence.samples.find((s) => s.frame === frame);
  if (exact) return exact;
  const before = sequence.samples.filter((s) => s.frame <= frame).at(-1);
  return before ?? sequence.samples[0];
}

export function meshTrackedRange(sequence: MeshTrackSequence): { start: number; end: number; lostAt: number | null } {
  const frames = sequence.samples.map((s) => s.frame);
  const lost = sequence.samples.find((s) => s.lost);
  return {
    start: frames.length ? Math.min(...frames) : sequence.referenceFrame,
    end: frames.length ? Math.max(...frames) : sequence.referenceFrame,
    lostAt: lost ? lost.frame : null,
  };
}

/**
 * Where the mesh's texture-space vertices should be sampled from, as a displacement per vertex.
 * Positive means "this part of the surface moved here", which is what a warp consumes.
 */
export function meshDisplacement(sequence: MeshTrackSequence, sample: MeshFrameSample): Point2[] {
  return sample.vertices.map((v, i) => ({ x: v.x - sequence.reference[i].x, y: v.y - sequence.reference[i].y }));
}

/**
 * Encode the displacement field as an RGBA image the size of the LATTICE, not the frame. The GPU
 * bilinearly interpolates it back up, which is both far cheaper than rasterising per pixel in JS
 * and smoother than drawing the quads. R and G carry x and y scaled into 0..1 by `range`; B
 * carries per-vertex confidence so a shader can fall off where the track is weak.
 */
export function meshDisplacementImage(sequence: MeshTrackSequence, sample: MeshFrameSample, range = MESH_DISPLACEMENT_RANGE): { width: number; height: number; data: Uint8ClampedArray } {
  const width = sequence.cols + 1;
  const height = sequence.rows + 1;
  const data = new Uint8ClampedArray(width * height * 4);
  const displacement = meshDisplacement(sequence, sample);
  const span = Math.max(1e-6, range);
  for (let i = 0; i < displacement.length; i++) {
    const o = i * 4;
    // 128 +/- 127 rather than a 0..255 rescale, so ZERO displacement encodes as exactly 128 and
    // the shader's inverse recovers exactly zero. Mapping onto the full byte range puts the
    // midpoint at 127.5, and the resulting half-step bias makes an untracked mesh shift the
    // picture by a fraction of a pixel instead of leaving it alone.
    data[o] = 128 + Math.round(Math.max(-1, Math.min(1, displacement[i].x / span)) * 127);
    data[o + 1] = 128 + Math.round(Math.max(-1, Math.min(1, displacement[i].y / span)) * 127);
    data[o + 2] = Math.round(Math.max(0, Math.min(1, sample.vertexConfidence[i] ?? 1)) * 255);
    data[o + 3] = 255;
  }
  return { width, height, data };
}

let neutralCanvas: HTMLCanvasElement | null = null;

/**
 * A one-texel "no displacement, fully confident" map. The FX renderer falls back to the SOURCE
 * frame when an effect has no aux input, and a warp shader reading a photograph as a displacement
 * field tears the picture apart. Handing it this instead makes an untracked mesh a passthrough.
 */
export function neutralMeshCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!neutralCanvas) {
    neutralCanvas = document.createElement('canvas');
    neutralCanvas.width = 1;
    neutralCanvas.height = 1;
    const g = neutralCanvas.getContext('2d');
    if (g) { g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 1, 1); }
  }
  return neutralCanvas;
}

/** The aux element a mesh-input effect should receive for one frame, neutral when untracked. */
export function meshAuxElement(sequence: MeshTrackSequence | null | undefined, frame: number, reuse?: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (!sequence) return neutralMeshCanvas();
  const sample = sampleMeshAt(sequence, frame);
  if (!sample) return neutralMeshCanvas();
  return meshDisplacementCanvas(sequence, sample, MESH_DISPLACEMENT_RANGE, reuse) || neutralMeshCanvas();
}

/** Browser-side helper: the displacement image as a canvas the compositor can upload as aux. */
export function meshDisplacementCanvas(sequence: MeshTrackSequence, sample: MeshFrameSample, range = MESH_DISPLACEMENT_RANGE, reuse?: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const image = meshDisplacementImage(sequence, sample, range);
  const canvas = reuse && reuse.width === image.width && reuse.height === image.height ? reuse : document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas;
}
