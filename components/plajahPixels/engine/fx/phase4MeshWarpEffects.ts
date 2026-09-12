// phase4MeshWarpEffects.ts — warping the frame by a tracked mesh (the Mocha PowerMesh consumer).
//
// The mesh is tracked on the CPU (services/fabula/meshTrack.ts) and reaches the shader as
// an aux texture the size of the LATTICE — a 5x5 image for a 4x4 mesh, not a full-resolution
// displacement map. The GPU's bilinear filtering interpolates it back up, which is both far
// cheaper than rasterising per pixel in JavaScript and smoother than drawing the quads as
// flat-shaded geometry would be.
//
// The aux slot declares kind 'mesh' so the host knows to generate it per frame and, crucially, to
// hand over a NEUTRAL map when the clip has no mesh track. The renderer's fallback for a missing
// aux input is the source frame, and a warp shader that reads a photograph as a displacement
// field tears the picture apart.
import type { FxEffect } from './effects';

// Must match MESH_DISPLACEMENT_RANGE in services/fabula/meshTrack.ts. A mismatch does not fail —
// it silently scales every warp by the wrong factor — so a test pins the two together.
const RANGE = '0.25';

export const PHASE4_MESH_EFFECTS: FxEffect[] = [
  {
    // 'meshwarp' is already taken by the manual centre/radius/twist deformer in
    // phase1DistortEffects; this one is driven by a tracked surface, so it gets its own id.
    id: 'meshtrackwarp', name: 'Mesh Track Warp', category: 'distort', version: 1,
    summary: 'Warps the frame by a tracked mesh: follow a non-rigid surface so an insert bends with it, or run it in reverse to hold that surface still.',
    auxInput: { label: 'Mesh Track', kind: 'mesh' },
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 2, default: 1, step: .02 },
      { key: 'stabilize', label: 'Hold Surface Still', min: 0, max: 1, default: 0, step: 1 },
      { key: 'confidence', label: 'Trust Falloff', min: 0, max: 1, default: .3, step: .01 },
      { key: 'edges', label: 'Edge Feather', min: 0, max: 1, default: .4, step: .01 },
    ],
    presets: [
      { id: 'follow-surface', name: 'Follow Surface', description: 'Bend with the tracked surface.', params: { amount: 1, stabilize: 0, confidence: .3, edges: .4 } },
      { id: 'hold-still', name: 'Hold Still', description: 'Undo the surface motion to lock it in place.', params: { amount: 1, stabilize: 1, confidence: .3, edges: .5 } },
      { id: 'half-follow', name: 'Half Follow', description: 'Take the edge off a jittery track.', params: { amount: .5, stabilize: 0, confidence: .6, edges: .3 } },
    ],
    glsl: `vec4 fx(vec2 uv){
      vec4 m = aux(uv);
      // R and G carry the displacement as 128 +/- 127 bytes; B carries the track's confidence.
      // Decoding through the byte values is what makes zero displacement decode to exactly zero:
      // treating 128/255 as 0.5 leaves a half-step bias that shifts an untracked frame.
      vec2 d = (m.rg * 255.0 - 128.0) / 127.0 * ${RANGE};
      float trust = mix(1.0, m.b, P2);
      float dir = P1 > 0.5 ? 1.0 : -1.0;      // hold the surface still, or ride it
      vec2 q = uv + d * (P0 * trust * dir);
      // A warp that reaches outside the frame would otherwise smear the border pixel inwards.
      float edge = 1.0;
      if (P3 > 0.001) {
        vec2 e = smoothstep(vec2(0.0), vec2(P3 * 0.2 + 0.001), min(q, 1.0 - q));
        edge = min(e.x, e.y);
      }
      return mix(inp(uv), inp(q), edge);
    }`,
  },
];
