// phase4FragmentEffects.ts — breaking the frame into pieces and moving them: the Shatter /
// Card Dance class from the Boris and Red Giant catalogs.
//
// This was previously filed under "needs a real 3D node", alongside imported geometry. That was a
// mis-scoping: none of it needs meshes. Scattering pixels forward is what a fragment shader cannot
// do, but the problem inverts cleanly — for each output pixel, walk the pieces that could possibly
// cover it, apply each piece's INVERSE transform, and keep the front-most piece whose original
// footprint contains the result. Every piece transform is therefore required to be invertible:
// translate, rotate, uniform scale.
//
// The subtle part is the SEARCH BOUND, and getting it wrong is silent. A piece is only found if
// its home cell falls inside the neighbourhood we walk, so a shard that travels further than that
// neighbourhood simply stops being drawn — it vanishes mid-flight instead of flying off screen. A
// first cut searched 3x3 cells around the output pixel and lost the entire frame at high spread.
//
// The fix is to make the bulk of the motion EXACTLY invertible, so the search only has to cover
// what is left. Pieces move by a radial expansion about the origin point, which inverts in closed
// form, plus a uniform gravity offset, which is a straight subtraction. Only the per-piece jitter
// and the rotation about a piece's own pivot remain unaccounted for, and both are deliberately
// bounded in CELL WIDTHS rather than in scene units, so the required neighbourhood is a constant
// regardless of how far the pieces travel or how many of them there are.
import type { FxEffect } from './effects';

const F = `
float f4h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 f4rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
/** Which half of a cell a point falls in, once the cell's diagonal is chosen by its own hash. */
float f4tri(vec2 f, float diag){ return diag > 0.5 ? step(f.y, f.x) : step(f.y, 1.0 - f.x); }
`;

const d = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'distort' });

export const PHASE4_FRAGMENT_EFFECTS: FxEffect[] = [
  d({
    id: 'shatterpieces', name: 'Shatter', version: 1,
    summary: 'Breaks the frame into triangular shards that fly out from a point, tumbling and fading. Keyframe Progress to time the break to a hit.',
    params: [
      { key: 'pieces', label: 'Pieces', min: 2, max: 40, default: 10, step: 1 },
      { key: 'progress', label: 'Progress', min: 0, max: 1, default: 0, step: .005 },
      { key: 'spread', label: 'Spread', min: 0, max: 3, default: 1, step: .02 },
      { key: 'spin', label: 'Tumble', min: 0, max: 3, default: .8, step: .02 },
      { key: 'gravity', label: 'Gravity', min: -2, max: 2, default: .5, step: .02 },
      { key: 'cx', label: 'Origin X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'cy', label: 'Origin Y', min: 0, max: 1, default: .5, step: .005 },
      { key: 'fade', label: 'Fade Out', min: 0, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'glass-break', name: 'Glass Break', description: 'Fine shards blown outwards, little gravity.', params: { pieces: 18, progress: 0, spread: 1.6, spin: 1.2, gravity: .15, cx: .5, cy: .5, fade: .4 } },
      { id: 'heavy-collapse', name: 'Heavy Collapse', description: 'Big slabs that drop rather than fly.', params: { pieces: 6, progress: 0, spread: .35, spin: .4, gravity: 1.6, cx: .5, cy: .35, fade: .2 } },
      { id: 'blow-away', name: 'Blow Away', description: 'Small pieces scattered wide and gone.', params: { pieces: 28, progress: 0, spread: 2.4, spin: 2.2, gravity: -.3, cx: .2, cy: .5, fade: .9 } },
    ],
    glsl: F + `vec4 fx(vec2 uv){
      float prog = P1;
      if (prog <= 0.0005) return inp(uv);            // exact identity before the break starts
      float asp = uResolution.x / uResolution.y;
      float n = max(2.0, floor(P0 + 0.5));
      float cw = asp / n;                            // square cells in aspect-corrected space
      vec2 P = vec2(uv.x * asp, uv.y);
      vec2 focus = vec2(P5 * asp, P6);
      float fall = prog * prog;
      float grow = fall * P2;                        // radial expansion, invertible in closed form
      vec2 grav = vec2(0.0, fall * P4 * 0.7);
      // Undo the expansion and the gravity exactly. What remains unaccounted for is per-piece
      // jitter and each piece's own rotation, both bounded below in cell widths, so a fixed
      // neighbourhood is always enough however far the pieces have travelled.
      vec2 guess = focus + (P - grav - focus) / (1.0 + grow);
      vec2 baseId = floor(guess / cw);
      vec4 outc = vec4(0.0);
      float best = -1.0;

      for (int oy = -2; oy <= 2; oy++){
        for (int ox = -2; ox <= 2; ox++){
          vec2 id = baseId + vec2(float(ox), float(oy));
          float diag = f4h21(id);
          for (int t = 0; t < 2; t++){
            float tf = float(t);
            float rnd = f4h21(id + tf * 3.37 + 1.7);
            // Pivot near the shard's own centroid so it tumbles about itself, not the cell corner.
            vec2 pivot = (id + 0.5 + (tf - 0.5) * vec2(0.24, -0.24)) * cw;
            vec2 jit = (vec2(rnd, f4h21(id + tf * 5.11 + 9.3)) - 0.5) * cw * 2.2 * fall;
            vec2 moved = focus + (pivot - focus) * (1.0 + grow) + grav + jit;
            float ang = (rnd * 2.0 - 1.0) * P3 * prog * 3.2;
            float sc = max(0.05, 1.0 - prog * 0.18 * (0.4 + rnd));
            // Undo this shard's motion, then ask whether the pixel started inside that shard.
            vec2 q = f4rot((P - moved) / sc, -ang) + pivot;
            vec2 cell = floor(q / cw);
            if (abs(cell.x - id.x) > 0.5 || abs(cell.y - id.y) > 0.5) continue;
            if (abs(f4tri(fract(q / cw), diag) - tf) > 0.5) continue;
            if (rnd <= best) continue;               // a nearer shard already owns this pixel
            best = rnd;
            vec4 c = inp(clamp(vec2(q.x / asp, q.y), 0.0, 1.0));
            outc = vec4(c.rgb, c.a * clamp(1.0 - prog * P7, 0.0, 1.0));
          }
        }
      }
      return outc;
    }`,
  }),
  d({
    id: 'carddance', name: 'Card Dance', version: 1,
    summary: 'Splits the frame into a grid of cards and offsets, turns and shrinks them by row, column, distance or at random — the Card Dance idea, driven by one Amount control.',
    params: [
      { key: 'columns', label: 'Grid', min: 2, max: 40, default: 12, step: 1 },
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: 0, step: .005 },
      { key: 'pattern', label: 'Pattern', min: 0, max: 3, default: 0, step: 1 },
      { key: 'offset', label: 'Displace', min: 0, max: 2, default: .6, step: .02 },
      { key: 'turn', label: 'Rotate', min: 0, max: 3, default: .5, step: .02 },
      { key: 'shrink', label: 'Shrink', min: 0, max: 1, default: .3, step: .01 },
      { key: 'gap', label: 'Gap', min: 0, max: .4, default: .04, step: .005 },
      { key: 'stagger', label: 'Stagger', min: 0, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'wave-rows', name: 'Wave Rows', description: 'Rows slide out one after another.', params: { columns: 10, amount: 0, pattern: 0, offset: .9, turn: .2, shrink: .15, gap: .03, stagger: .8 } },
      { id: 'radial-bloom', name: 'Radial Bloom', description: 'Cards push outwards from the centre.', params: { columns: 14, amount: 0, pattern: 2, offset: 1.1, turn: .5, shrink: .35, gap: .06, stagger: .4 } },
      { id: 'scatter-deck', name: 'Scatter Deck', description: 'Every card goes its own way.', params: { columns: 16, amount: 0, pattern: 3, offset: 1.4, turn: 1.6, shrink: .5, gap: .05, stagger: .9 } },
    ],
    glsl: F + `vec4 fx(vec2 uv){
      float amt = P1;
      if (amt <= 0.0005) return inp(uv);
      float asp = uResolution.x / uResolution.y;
      float n = max(2.0, floor(P0 + 0.5));
      float cw = asp / n;
      vec2 P = vec2(uv.x * asp, uv.y);
      vec2 mid = vec2(asp, 1.0) * 0.5;
      vec4 outc = vec4(0.0);
      float best = -1.0;

      for (int oy = -2; oy <= 2; oy++){
        for (int ox = -2; ox <= 2; ox++){
          vec2 id = floor(P / cw) + vec2(float(ox), float(oy));
          float rnd = f4h21(id);
          // Pattern picks WHICH card moves first; stagger sets how far apart they are in time.
          float phase = P2 < 0.5 ? fract(id.y * 0.137)
                      : P2 < 1.5 ? fract(id.x * 0.137)
                      : P2 < 2.5 ? clamp(length((id + 0.5) * cw - mid) / max(asp, 1.0), 0.0, 1.0)
                      : rnd;
          float local = clamp((amt - phase * P7) / max(1.0 - P7, 0.001), 0.0, 1.0);
          vec2 pivot = (id + 0.5) * cw;
          vec2 away = pivot - mid;
          vec2 dir = length(away) > 1e-4 ? normalize(away) : vec2(0.0, 1.0);
          // Displacement is measured in CELL WIDTHS, which is what keeps the fixed search
          // neighbourhood correct at every grid size — and a card grid should shuffle in place
          // rather than fly across the frame anyway.
          vec2 off = dir * local * P3 * cw * 0.75;
          float ang = (rnd * 2.0 - 1.0) * P4 * local * 2.4;
          float sc = max(0.04, (1.0 - local * P5) * (1.0 - P6));
          vec2 q = f4rot((P - pivot - off) / sc, -ang) + pivot;
          vec2 cell = floor(q / cw);
          if (abs(cell.x - id.x) > 0.5 || abs(cell.y - id.y) > 0.5) continue;
          if (rnd <= best) continue;
          best = rnd;
          outc = inp(clamp(vec2(q.x / asp, q.y), 0.0, 1.0));
        }
      }
      return outc;
    }`,
  }),
];
