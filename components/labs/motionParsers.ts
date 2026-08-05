// Motion Lab — real capture-data parsers.
//
// parseBVH: full BVH hierarchy parse + forward kinematics, projected to 2D
// (orthographic front view) and normalized into the Motion Lab's 160×140 stage.
// parseKinectTxt: UMONS-TAICHI Kinect V2 skeleton text (25 joints / frame).
//
// Both return the same PlayableMotion shape: per-frame 2D joint positions plus
// bone segments (index pairs), so the player renders them identically.

export interface PlayableMotion {
  frames: [number, number][][];   // frames × joints × [x, y] in stage coords
  bones: [number, number][];      // joint-index pairs to draw as segments
  headIndex: number;              // joint to render with the large head dot
  frameTime: number;              // seconds per frame
}

// Stage geometry (must match the MotionLabPlayer SVG viewBox)
const STAGE_W = 160;
const STAGE_H = 140;
const GROUND_Y = 124;
const FIG_HEIGHT = 96;            // target on-stage figure height

interface BVHJoint {
  name: string;
  parent: number;                 // -1 for root
  offset: [number, number, number];
  channels: string[];
}

const DEG = Math.PI / 180;

// Multiply 3×3 matrices (row-major)
function matMul(a: number[], b: number[]): number[] {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}
function rotX(d: number): number[] { const c = Math.cos(d * DEG), s = Math.sin(d * DEG); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function rotY(d: number): number[] { const c = Math.cos(d * DEG), s = Math.sin(d * DEG); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function rotZ(d: number): number[] { const c = Math.cos(d * DEG), s = Math.sin(d * DEG); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function apply(m: number[], v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Parse a BVH file and bake every frame to normalized 2D stage coordinates. */
export function parseBVH(text: string, opts?: { maxFrames?: number }): PlayableMotion {
  const tokens = text.split(/\s+/);
  let ti = 0;
  const next = () => tokens[ti++];
  const peek = () => tokens[ti];

  const joints: BVHJoint[] = [];
  const bones: [number, number][] = [];

  // ── Hierarchy ──
  function parseNode(parent: number, isEnd: boolean): number {
    const name = isEnd ? `${joints[parent]?.name || 'root'}_end` : next();
    const idx = joints.length;
    joints.push({ name, parent, offset: [0, 0, 0], channels: [] });
    if (parent >= 0) bones.push([parent, idx]);
    next(); // '{'
    while (peek() !== '}') {
      const kw = next();
      if (kw === 'OFFSET') {
        joints[idx].offset = [parseFloat(next()), parseFloat(next()), parseFloat(next())];
      } else if (kw === 'CHANNELS') {
        const n = parseInt(next(), 10);
        joints[idx].channels = Array.from({ length: n }, () => next());
      } else if (kw === 'JOINT') {
        parseNode(idx, false);
      } else if (kw === 'End') {
        next(); // 'Site'
        parseNode(idx, true);
      }
    }
    next(); // '}'
    return idx;
  }

  while (next() !== 'HIERARCHY') { /* skip */ }
  next(); // 'ROOT'
  parseNode(-1, false);

  // ── Motion ──
  while (next() !== 'MOTION') { /* skip */ }
  next(); // 'Frames:'
  let frameCount = parseInt(next(), 10);
  next(); // 'Frame'
  next(); // 'Time:'
  const frameTime = parseFloat(next());

  const channelsPerFrame = joints.reduce((n, j) => n + j.channels.length, 0);

  // Decimate long clips: keep playback smooth and memory sane.
  const maxFrames = opts?.maxFrames ?? 900;
  const step = Math.max(1, Math.ceil(frameCount / maxFrames));

  const rawFrames: [number, number, number][][] = [];
  for (let f = 0; f < frameCount; f++) {
    const vals: number[] = new Array(channelsPerFrame);
    for (let c = 0; c < channelsPerFrame; c++) vals[c] = parseFloat(tokens[ti + c]);
    ti += channelsPerFrame;
    if (f % step !== 0) continue;

    // Forward kinematics
    const worldPos: [number, number, number][] = new Array(joints.length);
    const worldRot: number[][] = new Array(joints.length);
    let ci = 0;
    for (let j = 0; j < joints.length; j++) {
      const joint = joints[j];
      let local = IDENTITY;
      let tx = 0, ty = 0, tz = 0;
      for (const ch of joint.channels) {
        const v = vals[ci++];
        switch (ch) {
          case 'Xposition': tx = v; break;
          case 'Yposition': ty = v; break;
          case 'Zposition': tz = v; break;
          case 'Xrotation': local = matMul(local, rotX(v)); break;
          case 'Yrotation': local = matMul(local, rotY(v)); break;
          case 'Zrotation': local = matMul(local, rotZ(v)); break;
        }
      }
      if (joint.parent < 0) {
        worldRot[j] = local;
        worldPos[j] = [joint.offset[0] + tx, joint.offset[1] + ty, joint.offset[2] + tz];
      } else {
        const pRot = worldRot[joint.parent];
        const pPos = worldPos[joint.parent];
        const off = apply(pRot, [joint.offset[0] + tx, joint.offset[1] + ty, joint.offset[2] + tz]);
        worldPos[j] = [pPos[0] + off[0], pPos[1] + off[1], pPos[2] + off[2]];
        worldRot[j] = matMul(pRot, local);
      }
    }
    rawFrames.push(worldPos);
  }

  const headIndex = Math.max(0, joints.findIndex(j => /head/i.test(j.name) && !/_end/.test(j.name)));
  return normalizeTo2D(rawFrames, bones, headIndex, frameTime * step);
}

/**
 * UMONS-TAICHI Kinect V2 skeleton text: one frame per line, 25 joints.
 * Lines carry whitespace-separated floats; joint triplets (x, y, z) in metres,
 * possibly preceded by a timestamp and/or followed by tracking-state values.
 * We locate the 75 consecutive coordinate values heuristically.
 */
const KINECT_BONES: [number, number][] = [
  [0, 1], [1, 20], [20, 2], [2, 3],                 // spine → neck → head
  [20, 4], [4, 5], [5, 6], [6, 7],                  // left arm
  [20, 8], [8, 9], [9, 10], [10, 11],               // right arm
  [0, 12], [12, 13], [13, 14], [14, 15],            // left leg
  [0, 16], [16, 17], [17, 18], [18, 19],            // right leg
  [7, 21], [7, 22], [11, 23], [11, 24],             // hands/thumbs
];
const KINECT_HEAD = 3;

export function parseKinectTxt(text: string, opts?: { maxFrames?: number }): PlayableMotion {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const raw3D: [number, number, number][][] = [];
  const maxFrames = opts?.maxFrames ?? 900;
  const step = Math.max(1, Math.ceil(lines.length / maxFrames));

  for (let i = 0; i < lines.length; i += step) {
    const nums = lines[i].trim().split(/[\s,;]+/).map(parseFloat).filter(n => !Number.isNaN(n));
    if (nums.length < 75) continue;
    // Lines are [timestamp?] + 25 joints × (x, y, z): always take the LAST 75 values.
    const start = nums.length - 75;
    const joints: [number, number, number][] = [];
    for (let j = 0; j < 25; j++) {
      joints.push([nums[start + j * 3], nums[start + j * 3 + 1], nums[start + j * 3 + 2]]);
    }
    raw3D.push(joints);
  }
  if (raw3D.length === 0) return { frames: [], bones: KINECT_BONES, headIndex: KINECT_HEAD, frameTime: 1 / 30 };

  // Axis auto-detect: the vertical axis has the largest spread across the body
  // (spine-base → head). UMONS exports are Z-up in millimetres; generic Kinect
  // streams are Y-up in metres — detection handles both.
  const f0 = raw3D[Math.floor(raw3D.length / 2)];
  const range = [0, 1, 2].map(ax => {
    let lo = Infinity, hi = -Infinity;
    for (const p of f0) { if (p[ax] < lo) lo = p[ax]; if (p[ax] > hi) hi = p[ax]; }
    return hi - lo;
  });
  const vAx = range.indexOf(Math.max(...range));
  const hAx = range.indexOf(Math.max(...range.filter((_, i) => i !== vAx)));

  const rawFrames: [number, number, number][][] = raw3D.map(f =>
    f.map(p => [p[hAx], p[vAx], 0] as [number, number, number]));
  return normalizeTo2D(rawFrames, KINECT_BONES, KINECT_HEAD, (1 / 30) * step);
}

/** Center each frame on the root X, scale by global height, drop onto the stage. */
function normalizeTo2D(
  rawFrames: [number, number, number][][],
  bones: [number, number][],
  headIndex: number,
  frameTime: number,
): PlayableMotion {
  // Global vertical extent across the clip → stable scale
  let minY = Infinity, maxY = -Infinity;
  for (const f of rawFrames) for (const p of f) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const scale = FIG_HEIGHT / Math.max(1e-6, maxY - minY);

  const frames: [number, number][][] = rawFrames.map(f => {
    // center horizontally on the mean X of this frame (keeps travelling clips on stage)
    let cx = 0;
    for (const p of f) cx += p[0];
    cx /= f.length;
    return f.map(p => [
      STAGE_W / 2 + (p[0] - cx) * scale,
      GROUND_Y - (p[1] - minY) * scale,
    ] as [number, number]);
  });

  return { frames, bones, headIndex, frameTime };
}
