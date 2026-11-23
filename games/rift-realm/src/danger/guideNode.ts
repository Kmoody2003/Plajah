// Mycelium guidance as a TSL node any glowing vine or root material can add to its emissive: green bands that travel
// from the player toward the healthy mushroom the mycelium is pointing at, inside a corridor along that line, brightest
// at the mushroom. Zero when guidance is off. The danger layer's mycelium (danger/mycelium.ts) drives the uniforms;
// the forest map adds it to the glow vines (`vineMat.emissiveNode = <its glow>.add(mycelGuideEmissive())`).
// Only three/tsl here, so world/* can import it without pulling in the danger layer.
import * as THREE from 'three/webgpu';
import { color, dot, float, fract, length, positionWorld, smoothstep, time, uniform, vec2 } from 'three/tsl';

export const guideU = {
  from: uniform(new THREE.Vector2(0, 0)),
  to: uniform(new THREE.Vector2(0, 0)),
  on: uniform(0),
  /** Corridor half-width in metres. */
  width: uniform(5),
};

/** Set by danger/mycelium.ts each frame. */
export function setGuide(from: { x: number; z: number }, to: { x: number; z: number } | null, on: number, width = 5) {
  guideU.from.value.set(from.x, from.z);
  if (to) guideU.to.value.set(to.x, to.z);
  guideU.on.value = to ? on : 0;
  guideU.width.value = width;
}

let cached: ReturnType<typeof build> | null = null;
function build() {
  const p = vec2(positionWorld.x, positionWorld.z);
  const a = guideU.from, b = guideU.to;
  const ab = b.sub(a), L = length(ab).max(0.001), dir = ab.div(L);
  const s = dot(p.sub(a), dir);                                       // metres along the player → mushroom line
  const perp = length(p.sub(a).sub(dir.mul(s)));
  const corridor = smoothstep(guideU.width, guideU.width.mul(0.3), perp)
    .mul(smoothstep(float(-3), float(0), s))
    .mul(smoothstep(L.add(3), L.sub(0.5), s));
  const ph = fract(s.div(3.2).sub(time.mul(1.25)));                   // bands moving toward the mushroom
  const band = smoothstep(float(0), float(0.08), ph).mul(smoothstep(float(0.38), float(0.12), ph));
  const near = smoothstep(float(7), float(0), length(p.sub(b)));
  return color(0x3cff6a).mul(band.mul(2.2).add(0.12).add(near.mul(1.2))).mul(corridor).mul(guideU.on);
}

/** The guidance glow (a vec3 node); add it to a material's emissive. */
export function mycelGuideEmissive() { return (cached ??= build()); }
// the forest map's glow vines (world/kit.ts vineMat) pick it up from this global when the world builds, so the world
// never depends on the danger layer being there
(globalThis as unknown as { __mycelGuideEmissive?: typeof mycelGuideEmissive }).__mycelGuideEmissive = mycelGuideEmissive;
