// playkit/render/manuscriptLook.ts
//
// The "manuscript" stylize stage for the playkit post pipeline (createPlaykitPostPipeline `stylize`).
// Mixes drawn and photoreal: the lit, graded scene gets an ink contour (depth + normal edges), paper tooth
// and a little pigment pooling, so a painted-real frame reads as painted. On top of that runs an ERASURE
// FIELD in world space: where it rises the frame regresses from painted → sketch (desaturated, hatched,
// ink-led) → blank paper with faint pencil ghosts. Lexicon uses it for the Unwriting; any game can use it
// for dreams, memories, unfinished worlds or a "drawing comes alive" intro.
//
// Cost: ~9 texture taps per pixel at internal resolution, no fbm (canon). Zones are a fixed uniform array.
import * as THREE from 'three/webgpu';
import {
  Fn, Loop, abs, cameraFar, dot, float, fract, getViewPosition, length, luminance, max, min, mix, reference,
  screenSize, screenUV, sin, smoothstep, uniform, uniformArray, vec2, vec3, vec4,
} from 'three/tsl';

export const MANUSCRIPT_MAX_ZONES = 16;

export interface ManuscriptOptions {
  /** Ink colour (warm sepia by default). */
  ink?: THREE.ColorRepresentation;
  /** Paper colour for erased areas. */
  paper?: THREE.ColorRepresentation;
  /** 0..1 strength of the contour on the painted (written) world. */
  inkStrength?: number;
  /** 0..1 paper grain over the painted world. */
  paperTooth?: number;
  /** Beyond this distance (m) the contour fades out so far detail stays clean. */
  inkFar?: number;
}

/** One erasure zone on the ground plane. amount 0..1 at the centre, fading to 0 at `radius`. `hole`: the centre
 *  (about 12% of the radius) stays written — the thing doing the erasing keeps its own form (Lexicon's Unwritten). */
export interface ErasureZone { x: number; z: number; radius: number; amount: number; hole?: boolean }

/** What the post pipeline hands a stylize stage. */
export interface PlaykitStylizeContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  color: any; depth: any; /** a SampleNode (`.sample(uv)` → view normal) or null */ normal: any; camera: THREE.Camera;
}

export interface ManuscriptHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stylize(ctx: PlaykitStylizeContext): any;
  setZones(zones: ErasureZone[]): void;
  /** Erasure everywhere (0 = none). */
  setGlobal(v: number): void;
  /** Erasure growing with distance from the origin: from `start` m to `end` m, up to `amount`. */
  setEdge(start: number, end: number, amount: number): void;
  setInk(strength: number): void;
  /** How lit the paper is (1 by day; lower at night so erased areas don't glow). */
  setPaperLight(k: number): void;
}

export function createManuscriptLook(opts: ManuscriptOptions = {}): ManuscriptHandle {
  const inkCol = uniform(new THREE.Color(opts.ink ?? 0x2a2118));
  const paperCol = uniform(new THREE.Color(opts.paper ?? 0xf4f1ea));
  const inkStrength = uniform(opts.inkStrength ?? 0.55);
  const tooth = uniform(opts.paperTooth ?? 0.05);
  const inkFar = uniform(opts.inkFar ?? 90);
  const global = uniform(0);
  const paperLight = uniform(1);
  const edgeStart = uniform(1e5), edgeEnd = uniform(1e5 + 1), edgeAmount = uniform(0);
  const zoneVecs = Array.from({ length: MANUSCRIPT_MAX_ZONES }, () => new THREE.Vector4(0, 0, 1, 0));
  const zones = uniformArray(zoneVecs, 'vec4');

  const handle: ManuscriptHandle = {
    stylize(ctx) {
      const { color, depth, normal, camera } = ctx;
      // camera matrices by reference: the post quad has its own camera, so the scene camera is passed in
      const projInv = uniform((camera as THREE.PerspectiveCamera).projectionMatrixInverse);
      const camWorld = uniform(camera.matrixWorld);
      const near = reference('near', 'float', camera);
      const far = reference('far', 'float', camera);

      return Fn(() => {
        const uv = screenUV;
        const texel = vec2(1).div(screenSize);
        const d0 = depth.sample(uv).r;
        // view-space position, then world (for the erasure field)
        const vpos = getViewPosition(uv, d0, projInv);
        const world = camWorld.mul(vec4(vpos, 1)).xyz;
        const dist = length(vpos);
        const isSky = d0.greaterThanEqual(0.99999);

        // ── ink contour: relative depth crease (second difference) + normal break ──
        const viewZ = (dd: any) => getViewPosition(uv, dd, projInv).z; // eslint-disable-line @typescript-eslint/no-explicit-any
        const zC = vpos.z;
        const zL = viewZ(depth.sample(uv.sub(vec2(texel.x, 0))).r);
        const zR = viewZ(depth.sample(uv.add(vec2(texel.x, 0))).r);
        const zD = viewZ(depth.sample(uv.sub(vec2(0, texel.y))).r);
        const zU = viewZ(depth.sample(uv.add(vec2(0, texel.y))).r);
        const crease = abs(zL.add(zR).sub(zC.mul(2))).add(abs(zD.add(zU).sub(zC.mul(2)))).div(abs(zC).add(0.5));
        let edge: any = smoothstep(0.012, 0.05, crease); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (normal) {
          const nC = normal.sample(uv);
          const nX = normal.sample(uv.add(vec2(texel.x, 0)));
          const nY = normal.sample(uv.add(vec2(0, texel.y)));
          const nb = float(2).sub(dot(nC, nX)).sub(dot(nC, nY));
          edge = max(edge, smoothstep(0.25, 0.7, nb));
        }
        const inkFade = smoothstep(inkFar, inkFar.mul(0.25), dist).mul(isSky.not().select(float(1), float(0)));
        edge = edge.mul(inkFade);

        // ── painted: paper tooth + pigment pooling at edges ──
        const px = uv.mul(screenSize);
        const grain = fract(sin(dot(px.floor(), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5);
        const fiber = sin(px.x.mul(0.21).add(sin(px.y.mul(0.037)).mul(6))).mul(0.5); // long paper fibres
        let painted = color.rgb.mul(float(1).add(grain.add(fiber.mul(0.4)).mul(tooth)));
        painted = mix(painted, painted.mul(inkCol.mul(2.2)), edge.mul(0.35));       // pooling
        painted = mix(painted, inkCol, edge.mul(inkStrength));                     // contour

        // ── erasure field (ground plane) ──
        const e = float(0).toVar();
        e.assign(global);
        e.assign(max(e, smoothstep(edgeStart, edgeEnd, length(world.xz)).mul(edgeAmount)));
        Loop(MANUSCRIPT_MAX_ZONES, ({ i }) => {
          const z: any = zones.element(i); // eslint-disable-line @typescript-eslint/no-explicit-any
          const r = max(z.z, 0.001);
          const d = length(world.xz.sub(z.xy));
          // amount < 0 marks a zone with a written centre (see ErasureZone.hole)
          const hole = z.w.lessThan(0).select(smoothstep(r.mul(0.09), r.mul(0.15), d), float(1));
          const k = smoothstep(r, r.mul(0.3), d).mul(abs(z.w)).mul(hole);
          e.assign(max(e, k));
        });
        // torn-paper edge: wobble the field with a cheap world-space pattern
        const wob = sin(world.x.mul(1.7)).mul(sin(world.z.mul(1.3))).mul(0.5).add(sin(world.x.add(world.z).mul(4.1)).mul(0.25));
        const er: any = min(max(e.add(wob.mul(0.12).mul(e.mul(float(1).sub(e)).mul(4))), 0), 1).mul(isSky.not().select(float(1), float(0))); // the sky is never erased: only the written world is // eslint-disable-line @typescript-eslint/no-explicit-any

        // ── sketch: desaturated, hatched by tone, ink-led ──
        const tone = luminance(color.rgb);
        // ink survives erasure: near-black pixels (the Unwritten's ink bodies, deep crevices) are never turned to paper
        const inkKeep = smoothstep(0.045, 0.015, tone);
        const hatchA = fract(px.x.add(px.y).div(5));
        const hatchB = fract(px.x.sub(px.y).div(5));
        const dark: any = float(1).sub(tone.mul(1.4)).max(0); // eslint-disable-line @typescript-eslint/no-explicit-any
        const lineA = smoothstep(dark.mul(0.55), dark.mul(0.55).sub(0.12), hatchA);
        const lineB = smoothstep(dark.mul(0.3), dark.mul(0.3).sub(0.1), hatchB);
        const hatch = max(lineA, lineB).mul(0.55);
        const paper = paperCol.mul(paperLight); // paper is lit like the world it replaced: dim at night
        const sketch = mix(paper, inkCol, max(hatch, edge.mul(0.95)));
        const ghost = mix(paper, inkCol, edge.mul(0.18)); // pencil ghosts of erased forms

        const erK: any = er.mul(float(1).sub(inkKeep)); // eslint-disable-line @typescript-eslint/no-explicit-any
        const toSketch = mix(painted, sketch, smoothstep(0.08, 0.6, erK));
        const out = mix(toSketch, ghost, smoothstep(0.6, 0.97, erK));
        void near; void far; void cameraFar;
        return vec4(out, 1);
      })();
    },
    setZones(list) {
      for (let i = 0; i < MANUSCRIPT_MAX_ZONES; i++) {
        const z = list[i];
        const a = z ? Math.max(0, Math.min(1, z.amount)) : 0;
        zoneVecs[i].set(z?.x ?? 0, z?.z ?? 0, z?.radius ?? 1, z?.hole ? -a : a);
      }
    },
    setGlobal(v) { global.value = Math.max(0, Math.min(1, v)); },
    setEdge(start, end, amount) { edgeStart.value = start; edgeEnd.value = Math.max(start + 0.01, end); edgeAmount.value = amount; },
    setInk(s) { inkStrength.value = s; },
    setPaperLight(k) { paperLight.value = Math.max(0, k); },
  };
  return handle;
}

/** Erasure amount at a world point, same maths as the shader (gameplay: "is this spot unwritten?"). */
export function erasureAt(x: number, z: number, zones: ErasureZone[], edge?: { start: number; end: number; amount: number }, global = 0): number {
  const ss = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  let e = global;
  if (edge) e = Math.max(e, ss(edge.start, edge.end, Math.hypot(x, z)) * edge.amount);
  for (const zz of zones) { const d = Math.hypot(x - zz.x, z - zz.z); e = Math.max(e, ss(zz.radius, zz.radius * 0.3, d) * zz.amount * (zz.hole ? ss(zz.radius * 0.09, zz.radius * 0.15, d) : 1)); }
  return e;
}
