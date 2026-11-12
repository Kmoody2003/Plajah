// A second, closer look at the hands for motion capture. MediaPipe's body model puts wrists and elbows in the wrong
// place during fast arm work (guards, punches, crossed arms) while still reporting high confidence, and it swaps
// the two wrists now and then. The hand model, run on zoomed crops around where the hands could be, finds the
// real hands; this module then moves the body's wrists (and the hand points that ride on them) onto those hands.
//
//   const hr = await handRefiner();  frame = hr.refine(canvasOrVideo, w, h, frame)
//
// EXPERIMENTAL, OFF EVERYWHERE (2026-11-12). On the benchmark it did not help: on the CG characters the hand model
// found hands in only 5–42% of frames at 80–210 ms a frame, and where it moved a wrist the wrist got further from
// the truth (33 → 38 px, better in 9 of 29). The boxing failure it was built for turned out to be the far arm hidden
// behind the body, which no look at the picture can recover. Kept, with `mocapBench` option `hands`, to re-test on
// footage of real people (hands with visible fingers), where the hand model is at home.
import type { RawFrame } from './types';

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface FoundHand {
  /** Wrist and the middle-finger knuckle in full-picture pixels. */
  wrist: [number, number]; knuckle: [number, number];
  /** The hand model's confidence that this is a hand. */
  score: number;
  /** The hand model's own left/right call, already turned into the performer's side for an unmirrored picture. */
  side: 'l' | 'r';
  sideScore: number;
}

export interface HandRefineOptions {
  /** Crop size as a share of the performer's torso length on screen. Default 1.3. */
  crop?: number;
  /** Ignore hands the model is less sure of than this. Default 0.5. */
  minScore?: number;
  /** The picture is mirrored (a selfie camera): the hand model's left/right is then the performer's own. */
  mirrored?: boolean;
}

export interface HandRefiner {
  /** Hands found near the performer's arms in this picture (up to two, deduplicated). */
  find(src: CanvasImageSource, w: number, h: number, fr: RawFrame, o?: HandRefineOptions): FoundHand[];
  /** The frame with wrists (15/16) and hand points (17–22) moved onto the hands found, in the picture and in 3D. */
  refine(src: CanvasImageSource, w: number, h: number, fr: RawFrame | null, o?: HandRefineOptions): RawFrame | null;
  stats: { frames: number; found: number; moved: number; swapped: number };
}

let shared: Promise<HandRefiner> | null = null;
export function handRefiner(): Promise<HandRefiner> {
  return (shared ??= make().catch((e) => { shared = null; throw e; }));
}

async function make(): Promise<HandRefiner> {
  // @ts-ignore — resolved at runtime from CDN, not bundled
  const vision: any = await import(/* @vite-ignore */ CDN);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  let hl: any = null;
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      hl = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'IMAGE', numHands: 2,
        minHandDetectionConfidence: 0.3, minHandPresenceConfidence: 0.3, minTrackingConfidence: 0.3,
      });
      break;
    } catch { /* try the next delegate */ }
  }
  if (!hl) throw new Error('The hand model could not start on this device.');

  const S = 256;
  const crop = document.createElement('canvas'); crop.width = S; crop.height = S;
  const g = crop.getContext('2d', { willReadFrequently: false })!;
  const stats = { frames: 0, found: 0, moved: 0, swapped: 0 };

  const find = (src: CanvasImageSource, W: number, H: number, fr: RawFrame, o: HandRefineOptions = {}): FoundHand[] => {
    const P = (i: number): [number, number] => [fr.pts[i].x * W, fr.pts[i].y * H];
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const torso = Math.hypot(...([0, 1].map((k) => mid(P(11), P(12))[k] - mid(P(23), P(24))[k]) as [number, number]));
    const size = Math.max(64, (o.crop ?? 1.3) * torso);
    // Where a hand could be: each wrist MediaPipe gave, and each elbow pushed on along the forearm.
    const centres: [number, number][] = [P(15), P(16), P(13), P(14)];
    const out: FoundHand[] = [];
    for (const [cx, cy] of centres) {
      const x0 = cx - size / 2, y0 = cy - size / 2;
      g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
      g.drawImage(src, x0, y0, size, size, 0, 0, S, S);
      let res: any;
      try { res = hl.detect(crop); } catch { continue; }
      (res?.landmarks ?? []).forEach((lm: { x: number; y: number }[], k: number) => {
        const score = res.handedness?.[k]?.[0]?.score ?? 0;
        const label: string = res.handedness?.[k]?.[0]?.categoryName ?? 'Left';
        const at = (i: number): [number, number] => [x0 + lm[i].x * size, y0 + lm[i].y * size];
        // MediaPipe labels hands as if the picture were mirrored; in a plain picture its "Left" is the right hand.
        const side: 'l' | 'r' = (label === 'Left') === !!o.mirrored ? 'l' : 'r';
        out.push({ wrist: at(0), knuckle: at(9), score: 1, side, sideScore: score });
      });
    }
    // The same hand seen from overlapping crops: keep one (the one with the surest left/right call).
    const hands: FoundHand[] = [];
    for (const h of out.sort((a, b) => b.sideScore - a.sideScore)) {
      const span = Math.hypot(h.knuckle[0] - h.wrist[0], h.knuckle[1] - h.wrist[1]);
      if (!hands.some((q) => Math.hypot(q.wrist[0] - h.wrist[0], q.wrist[1] - h.wrist[1]) < Math.max(8, span * 0.8))) hands.push(h);
    }
    return hands.slice(0, 2);
  };

  const refine = (src: CanvasImageSource, W: number, H: number, fr: RawFrame | null, o: HandRefineOptions = {}): RawFrame | null => {
    stats.frames++;
    if (!fr || fr.pts.length !== 33) return fr;
    const hands = find(src, W, H, fr, o).filter((h) => h.sideScore >= (o.minScore ?? 0.5));
    if (!hands.length) return fr;
    stats.found++;
    const P = (i: number): [number, number] => [fr.pts[i].x * W, fr.pts[i].y * H];
    const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // Assign hands to arms: the hand model's own left/right call, unless both hands claim one side; then by which
    // shoulder each hand can be reached from (nearest assignment by shoulder distance).
    const assign: Partial<Record<'l' | 'r', FoundHand>> = {};
    if (hands.length === 2 && hands[0].side !== hands[1].side) for (const h of hands) assign[h.side] = h;
    else if (hands.length === 2) {
      const [a, b] = hands, straight = d(a.wrist, P(11)) + d(b.wrist, P(12)), crossed = d(a.wrist, P(12)) + d(b.wrist, P(11));
      assign.l = straight <= crossed ? a : b; assign.r = straight <= crossed ? b : a;
    } else assign[hands[0].side] = hands[0];

    const pts = fr.pts.map((p) => ({ ...p })), world = fr.world.map((q) => ({ ...q }));
    // Pixels → metres on the body, from the torso's length on screen and in MediaPipe's 3D.
    const m = (a: number, b: number, arr: { x: number; y: number; z?: number }[]) => ({ x: (arr[a].x + arr[b].x) / 2, y: (arr[a].y + arr[b].y) / 2, z: ((arr[a].z ?? 0) + (arr[b].z ?? 0)) / 2 });
    const tpx = Math.hypot((m(11, 12, pts).x - m(23, 24, pts).x) * W, (m(11, 12, pts).y - m(23, 24, pts).y) * H);
    const tw = m(11, 12, world), hw = m(23, 24, world);
    const perPx = Math.hypot(tw.x - hw.x, tw.y - hw.y, tw.z - hw.z) / Math.max(tpx, 1);
    const reach = Math.max(tpx * 1.4, 40); // a wrist can't be further than about an arm from its shoulder
    let moved = false;
    const was = { l: P(15), r: P(16) };
    for (const side of ['l', 'r'] as const) {
      const h = assign[side]; if (!h) continue;
      const [wi, sh, riders] = side === 'l' ? [15, 11, [17, 19, 21]] : [16, 12, [18, 20, 22]];
      if (d(h.wrist, P(sh)) > reach) continue;
      const dx = h.wrist[0] - pts[wi].x * W, dy = h.wrist[1] - pts[wi].y * H;
      if (Math.hypot(dx, dy) < 3) continue;
      moved = true;
      for (const i of [wi, ...riders]) {
        pts[i].x += dx / W; pts[i].y += dy / H; pts[i].v = Math.max(pts[i].v, 0.9);
        world[i].x += dx * perPx; world[i].y += dy * perPx;
      }
    }
    if (moved) stats.moved++;
    if (assign.l && assign.r && d(was.l, assign.r.wrist) + d(was.r, assign.l.wrist) < d(was.l, assign.l.wrist) + d(was.r, assign.r.wrist)) stats.swapped++;
    return moved ? { ...fr, pts, world } : fr;
  };

  return { find, refine, stats };
}
