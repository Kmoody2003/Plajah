// Mycelium & Forest Network guidance as a TSL node any glowing vine or root material can add to its emissive:
//   · Aid / Healing pulse (mode 0, emerald-gold): travels from the player toward healthy fungi, Living Waters, or
//     a friendly Grovewarden when the forest chooses to help you.
//   · Demon Danger alarm (mode 1, crimson red): pulses urgently along vines & roots when a Demon Horde, Legion,
//     or Dark Champion is lurking nearby — if the forest is willing to warn you.
//   · Silent (on = 0): when the forest declines to help, vines and fungi stay still and give no warning or aid.
// Only three/tsl here, so world/* can import it without pulling in the danger layer.
import * as THREE from 'three/webgpu';
import { color, dot, float, fract, length, mix, positionWorld, sin, smoothstep, time, uniform, vec2 } from 'three/tsl';

export type GuideSignalKind = 'off' | 'aid' | 'danger';

export const guideU = {
  from: uniform(new THREE.Vector2(0, 0)),
  to: uniform(new THREE.Vector2(0, 0)),
  on: uniform(0),
  /** Corridor half-width in metres. */
  width: uniform(5),
  /** 0 = emerald-gold aid/healing beckon, 1 = crimson demon danger alarm. */
  danger: uniform(0),
};

/** Set by danger/mycelium.ts each frame. */
export function setGuide(
  from: { x: number; z: number },
  to: { x: number; z: number } | null,
  on: number,
  width = 5,
  kind: GuideSignalKind = 'aid',
) {
  guideU.from.value.set(from.x, from.z);
  if (to) guideU.to.value.set(to.x, to.z);
  guideU.on.value = to && kind !== 'off' ? on : 0;
  guideU.width.value = width;
  guideU.danger.value = kind === 'danger' ? 1 : 0;
}

let cached: ReturnType<typeof build> | null = null;
function build() {
  const p = vec2(positionWorld.x, positionWorld.z);
  const a = guideU.from, b = guideU.to;
  const ab = b.sub(a), L = length(ab).max(0.001), dir = ab.div(L);
  const s = dot(p.sub(a), dir);                                       // metres along the player → target line
  const perp = length(p.sub(a).sub(dir.mul(s)));
  const corridor = smoothstep(guideU.width, guideU.width.mul(0.3), perp)
    .mul(smoothstep(float(-3), float(0), s))
    .mul(smoothstep(L.add(3), L.sub(0.5), s));
  // Aid travels calmly outward; Danger pulses rapidly across nearby vines as a red alarm
  const speed = mix(float(1.25), float(2.6), guideU.danger);
  const ph = fract(s.div(3.2).sub(time.mul(speed)));
  const band = smoothstep(float(0), float(0.08), ph).mul(smoothstep(float(0.38), float(0.12), ph));
  const near = smoothstep(float(7), float(0), length(p.sub(b)));
  const alarmThrob = sin(time.mul(7.5)).mul(0.35).add(0.65);
  const aidCol = color(0x3cff6a);
  const dangerCol = color(0xff2a36);
  const tint = mix(aidCol, dangerCol, guideU.danger);
  const pulseLift = mix(band.mul(2.2).add(0.12).add(near.mul(1.2)), band.mul(2.5).add(alarmThrob.mul(0.75)).add(near.mul(1.4)), guideU.danger);
  return tint.mul(pulseLift).mul(corridor).mul(guideU.on);
}

/** The guidance / alarm glow (a vec3 node); add it to a material's emissive. */
export function mycelGuideEmissive() { return (cached ??= build()); }
// the forest map's glow vines (world/kit.ts vineMat) pick it up from this global when the world builds, so the world
// never depends on the danger layer being there
(globalThis as unknown as { __mycelGuideEmissive?: typeof mycelGuideEmissive }).__mycelGuideEmissive = mycelGuideEmissive;
