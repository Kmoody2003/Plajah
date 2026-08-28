// ═══════════════════════════════════════════════════════════════════════════
// skyEnvironments — the sky, and the light that comes from it.
//
// An HDRI (high-dynamic-range panorama) does BOTH jobs at once: it is what you
// see at the horizon, and it is the light source lighting every leaf. That is
// why swapping one changes the whole mood of the hall — and why a procedural
// gradient, however pretty, never looks photographed. Real sky, real light.
//
// ── Using your own photo ────────────────────────────────────────────────────
// Drop a file in public/hdri/ and add an entry below. What works, best first:
//
//   1. .hdr / .exr equirectangular  — a true HDRI. Real dynamic range, so the
//      sun actually blows out and casts hard light. This is the right answer.
//      Free ones: polyhaven.com/hdris (CC0). Or shoot your own with a 360 camera.
//   2. .jpg / .png equirectangular  — a 360 panorama. Looks correct as a
//      background and gives usable ambient light, but has no real sun energy,
//      so keep the directional light for shadows.
//   3. An ordinary photo           — NOT equirectangular, so it cannot wrap the
//      sky without visible distortion. Usable as a backdrop only.
//
// "Equirectangular" means the image is 2:1, the full 360°×180° sphere unrolled.
// A normal camera photo is not that, and will smear if used as one.
// ═══════════════════════════════════════════════════════════════════════════

export interface SkyEnvironment {
  id: string;
  label: string;
  /** Equirectangular file under public/hdri/. */
  file: string;
  /** Shown on the credits line — CC-BY sources REQUIRE this. */
  credit: string;
  license: string;
  /** Rotate the panorama so its sun lands where our directional light is. */
  rotationY?: number;
  /** Environment light intensity; 1 = as captured. */
  intensity?: number;
  /** Background blur, 0–1. A little hides low-res panoramas. */
  blur?: number;
  /** Directional-light colour + position tuned to this sky's own sun. */
  sun?: { position: [number, number, number]; color: string; intensity: number };
  /** Scene fog colour — should match the sky's horizon or you get a seam. */
  fog?: string;
}

export const SKY_ENVIRONMENTS: SkyEnvironment[] = [
  {
    id: 'partly-cloudy',
    label: 'Partly cloudy',
    file: '/hdri/kloofendal_48d_partly_cloudy_puresky.hdr',
    credit: 'Greg Zaal, Jarod Guest — Poly Haven',
    license: 'CC0',
    rotationY: 2.1,
    intensity: 1.0,
    blur: 0,
    sun: { position: [34, 30, 18], color: '#fff2d8', intensity: 2.6 },
    fog: '#c9d8e2',
  },
  {
    id: 'forest-slope',
    label: 'Deep forest',
    file: '/hdri/forest_slope.hdr',
    credit: 'Andreas Mischok — Poly Haven',
    license: 'CC0',
    rotationY: 0.6,
    intensity: 1.25,
    blur: 0.04,
    sun: { position: [18, 24, -12], color: '#e8f0c8', intensity: 1.5 },
    fog: '#93a98a',
  },
];

export const DEFAULT_SKY = SKY_ENVIRONMENTS[0].id;

export function skyById(id: string): SkyEnvironment {
  return SKY_ENVIRONMENTS.find((s) => s.id === id) ?? SKY_ENVIRONMENTS[0];
}
