// The look of the reference shots (docs/era-clash-3d-visual-target.md): a low golden-hour sun up the valley,
// behind the castle and the mountain, so the street is backlit; deep aerial perspective (warm haze toward the
// sun, cool grey-blue away from it, thinning with altitude so the mountain stays a silhouette); a grade with
// warm highlights, cool desaturated shadows and contrast; long sun shadows.
//
// The raid (the battle shots: Warriors_pillaging_street, Warrior_sprinting_past_burning_lanterns): the same place
// at blue-hour dusk. A slate sky with a dull ember band low where the sun went, cool blue-grey smoke haze, the
// sun down to a faint rim, the town lit by its fires and lanterns; a grade with cold teal shadows and hot orange
// highlights. `setRaid(k)` blends 0 (golden hour) → 1 (the raid).
import * as THREE from 'three/webgpu';
import {
  texture, equirectUV, positionWorldDirection, positionWorld, cameraPosition, mix, smoothstep, vec3, float, uniform, dot, normalize, max, pow, exp, length, clamp, fog, output,
} from 'three/tsl';
import { setLut } from './core/post';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Where the sun should sit: up the valley (+Z, toward the castle), a little right of the road, low. */
export const SUN_AZ = new THREE.Vector3(-0.27, 0, 0.96).normalize();

export function goldenHour(o: {
  scene: THREE.Scene; hdr: THREE.DataTexture; sun: THREE.DirectionalLight; sunDir: THREE.Vector3;
  hemi: THREE.HemisphereLight; amb: THREE.AmbientLight; elevation?: number;
}) {
  const { scene, hdr, sun, sunDir, hemi, amb } = o;
  // the photo's own sun → its azimuth; turn the sky so it sits at SUN_AZ
  const img = hdr.image as { data: ArrayLike<number>; width: number; height: number };
  const W = img.width, H = img.height, ch = img.data.length / (W * H);
  const half = (v: number) => (img.data instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat(v) : v);
  let best = 0, bx = 0, by = 0;
  for (let y = 0; y < H * 0.5; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * ch, l = 0.2126 * half(img.data[i]) + 0.7152 * half(img.data[i + 1]) + 0.0722 * half(img.data[i + 2]);
    if (l > best) { best = l; bx = x; by = y; }
  }
  const phi = (bx / W) * Math.PI * 2, theta = (by / H) * Math.PI;
  const photoSun = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).normalize();
  const rot = Math.atan2(SUN_AZ.x, SUN_AZ.z) - Math.atan2(photoSun.x, photoSun.z);
  const elev = Math.asin(THREE.MathUtils.clamp(photoSun.y, -1, 1));
  // the light: the photo's elevation, clamped into golden hour (5°–14°) so the shadows run long (and the disc clears the valley wall)
  const e = THREE.MathUtils.clamp(o.elevation ?? elev, THREE.MathUtils.degToRad(9), THREE.MathUtils.degToRad(14));
  sunDir.set(SUN_AZ.x * Math.cos(e), Math.sin(e), SUN_AZ.z * Math.cos(e)).normalize();
  scene.environmentRotation.set(0, rot, 0);
  scene.environmentIntensity = 0.7;   // less skylight fill: shadows stay deep, as in the shots
  sun.color.set(0xffb978); sun.intensity = 4.2;
  hemi.color.set(0xa8b8d0); hemi.groundColor.set(0x9a6a40); hemi.intensity = 0.55;   // warm bounce off the sunlit street
  amb.color.set(0x8a96b0); amb.intensity = 0.12;

  // ── Haze (aerial perspective) ──────────────────────────────────────────────────────────────────
  const sunU = uniform(sunDir.clone());
  const raidU = uniform(0);
  const warm = mix(color3(0xf2c38e), color3(0x7a5a52), raidU), cool = mix(color3(0x8f9cb0), color3(0x3c4658), raidU), glow = mix(color3(0xffd9a0), color3(0xc0603a), raidU);
  const hazeAt = (dir: N) => {
    const s = max(dot(dir, sunU), 0);
    return mix(cool, warm, pow(s, 3).mul(0.85).add(0.1)).add(glow.mul(pow(s, 24).mul(0.6)));
  };
  const toP: N = positionWorld.sub(cameraPosition);
  const d: N = length(toP);
  const altitude: N = exp(max(positionWorld.y.sub(15), 0).div(-700));
  // the raid's smoke thickens the air a little
  const factor: N = clamp(float(1).sub(exp(d.div(mix(float(-210), float(-150), raidU)))).mul(0.82).mul(altitude.mul(0.55).add(0.45)), 0, mix(float(0.86), float(0.9), raidU));
  (scene as unknown as { fogNode: N }).fogNode = fog(hazeAt(normalize(toP)), factor);
  void output;

  // ── The sky: the photograph turned to put its sun up the valley; its low band melts into the haze ──
  const c = Math.cos(-rot), sn = Math.sin(-rot);
  const v: N = positionWorldDirection;
  const rd: N = vec3(v.x.mul(c).add(v.z.mul(sn)), v.y, v.x.mul(-sn).add(v.z.mul(c)));
  const photo: N = texture(hdr, equirectUV(rd)).rgb;
  // a soft sun bloom where the light really is, so the glare matches the shadows
  const disc: N = pow(max(dot(normalize(v), sunU), 0), 900).mul(30).add(pow(max(dot(normalize(v), sunU), 0), 40).mul(1.2));
  const gold: N = mix(photo, hazeAt(normalize(v)).mul(1.15), smoothstep(0.16, -0.02, v.y)).add(glow.mul(disc));
  // dusk: the photo's clouds kept as shapes but dimmed and cooled, slate overhead, an ember band on the horizon
  // toward where the sun went down (and a fainter one all round: the town burning)
  const lum: N = dot(photo, vec3(0.2126, 0.7152, 0.0722));
  const sunward: N = pow(max(dot(normalize(vec3(v.x, 0, v.z)), normalize(vec3(sunU.x, 0, sunU.z))), 0), 2);
  const band: N = smoothstep(0.22, 0.0, v.y).mul(sunward.mul(0.7).add(0.3));
  const slate: N = mix(color3(0x56607a), color3(0x1a2032), smoothstep(0.0, 0.6, v.y));
  const dusk: N = slate.mul(lum.mul(0.5).add(0.75)).add(color3(0xb0583a).mul(band.mul(0.55)));
  scene.backgroundNode = mix(gold, mix(dusk, hazeAt(normalize(v)).mul(1.05), smoothstep(0.1, -0.02, v.y)), raidU);

  // ── Grade (display space, after tone mapping): warm highlights, teal shadows, contrast ────────────
  setLut(gradeLut(), 1);

  // ── The blend to the raid ───────────────────────────────────────────────────────────────────────
  const C = (h: number) => new THREE.Color(h);
  const GOLD = { sun: C(0xffb978), sunI: 4.2, hemi: C(0xa8b8d0), hemiG: C(0x9a6a40), hemiI: 0.55, amb: C(0x8a96b0), ambI: 0.12, env: 0.7, elev: e };
  const RAID = { sun: C(0xff7a48), sunI: 0.9, hemi: C(0x52607e), hemiG: C(0x3a2a22), hemiI: 0.62, amb: C(0x2a3450), ambI: 0.22, env: 0.22, elev: THREE.MathUtils.degToRad(4) };
  let lutStep = -1;
  const setRaid = (k: number) => {
    k = THREE.MathUtils.clamp(k, 0, 1);
    raidU.value = k;
    sun.color.copy(GOLD.sun).lerp(RAID.sun, k); sun.intensity = THREE.MathUtils.lerp(GOLD.sunI, RAID.sunI, k);
    hemi.color.copy(GOLD.hemi).lerp(RAID.hemi, k); hemi.groundColor.copy(GOLD.hemiG).lerp(RAID.hemiG, k); hemi.intensity = THREE.MathUtils.lerp(GOLD.hemiI, RAID.hemiI, k);
    amb.color.copy(GOLD.amb).lerp(RAID.amb, k); amb.intensity = THREE.MathUtils.lerp(GOLD.ambI, RAID.ambI, k);
    scene.environmentIntensity = THREE.MathUtils.lerp(GOLD.env, RAID.env, k);
    const el = THREE.MathUtils.lerp(GOLD.elev, RAID.elev, k);
    sunDir.set(SUN_AZ.x * Math.cos(el), Math.sin(el), SUN_AZ.z * Math.cos(el)).normalize(); sunU.value.copy(sunDir);
    const step = Math.round(k * 10);
    if (step !== lutStep) { lutStep = step; setLut(gradeLut(33, step / 10), 1); }
  };
  return { rotation: rot, photoElevation: THREE.MathUtils.radToDeg(elev), setRaid };
}

function color3(hex: number) { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); }

/** A 33³ grading LUT: contrast S-curve, split toning (shadows teal, highlights amber), shadow desaturation. */
export function gradeLut(n = 33, raid = 0) {
  const data = new Uint8Array(n * n * n * 4);
  const s = (x: number) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * 0.7 + t * t * (3 - 2 * t) * 0.3; };
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    let R = r / (n - 1), G = g / (n - 1), B = b / (n - 1);
    const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    // shadows lose saturation and go cool; highlights warm
    const sat = 0.9 + 0.38 * Math.min(1, l * 1.8);
    R = l + (R - l) * sat; G = l + (G - l) * sat; B = l + (B - l) * sat;
    const sh = (1 - l) * (1 - l), hi = l * l;
    R += -0.03 * sh + 0.075 * hi + 0.02; G += 0.006 * sh + 0.028 * hi + 0.005; B += 0.04 * sh - 0.07 * hi - 0.02;
    // the raid: colder, bluer shadows; hotter, more orange highlights; a touch less saturation in the mids
    R += raid * (-0.05 * sh + 0.06 * hi - 0.01); G += raid * (0.0 * sh - 0.01 * hi); B += raid * (0.085 * sh - 0.07 * hi);
    // contrast (smooth S around mid grey), deeper blacks
    R = s(R) * 0.98; G = s(G) * 0.98; B = s(B) * 0.98;
    const i = ((b * n + g) * n + r) * 4;
    data[i] = Math.round(THREE.MathUtils.clamp(R, 0, 1) * 255); data[i + 1] = Math.round(THREE.MathUtils.clamp(G, 0, 1) * 255); data[i + 2] = Math.round(THREE.MathUtils.clamp(B, 0, 1) * 255); data[i + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
