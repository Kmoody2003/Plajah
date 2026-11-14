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
  sin, cos, floor, fract, step, time,
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
  const rot0 = Math.atan2(SUN_AZ.x, SUN_AZ.z) - Math.atan2(photoSun.x, photoSun.z);
  const elev = Math.asin(THREE.MathUtils.clamp(photoSun.y, -1, 1));
  const e0 = THREE.MathUtils.clamp(o.elevation ?? elev, THREE.MathUtils.degToRad(9), THREE.MathUtils.degToRad(14));
  sunDir.set(SUN_AZ.x * Math.cos(e0), Math.sin(e0), SUN_AZ.z * Math.cos(e0)).normalize();
  scene.environmentRotation.set(0, rot0, 0);

  // ── Uniforms the sky, the haze and the grade read (setClimate / setRaid move them) ─────────────────
  const sunU = uniform(sunDir.clone());
  const raidU = uniform(0);
  /** 0 low golden sun … 1 the sun high (midday). */
  const dayU = uniform(0);
  /** 0 the sun up … 1 full night. */
  const nightU = uniform(0);
  /** Cloud cover 0…1; precipitation thickens the air (0…1). */
  const cloudU = uniform(0), precipU = uniform(0);
  /** The photograph's turn (it follows the sun round the sky through the day). */
  const rotU = uniform(rot0);

  // ── Haze (aerial perspective): warm toward the sun, cool away; whiter and thinner at midday, deep blue at
  //    night, flat grey under cloud, grey-brown smoke in the raid ─────────────────────────────────────────
  const goldWarm = color3(0xf2c38e), goldCool = color3(0x8f9cb0), goldGlow = color3(0xffd9a0);
  const dayWarm = color3(0xdfe2e2), dayCool = color3(0xaebfd2), dayGlow = color3(0xfff4dc);
  const nightC = color3(0x1c2436);
  const greyC = color3(0x8d939a);
  const lerp3 = (gold: N, day: N, night: N, grey: N, raid: N) => {
    let c: N = mix(gold, day, dayU);
    c = mix(c, night, nightU);
    c = mix(c, grey.mul(float(1).sub(nightU.mul(0.78))), cloudU.mul(0.85));
    return mix(c, raid, raidU.mul(0.85));
  };
  const warm = lerp3(goldWarm, dayWarm, nightC, greyC, color3(0x7a5a52));
  const cool = lerp3(goldCool, dayCool, nightC, greyC, color3(0x3c4658));
  const glow = lerp3(goldGlow, dayGlow, color3(0x2a3448), greyC, color3(0xc0603a));
  const hazeAt = (dir: N) => {
    const s = max(dot(dir, sunU), 0);
    return mix(cool, warm, pow(s, 3).mul(0.85).add(0.1)).add(glow.mul(pow(s, 24).mul(0.6)).mul(float(1).sub(cloudU)));
  };
  const toP: N = positionWorld.sub(cameraPosition);
  const d: N = length(toP);
  const altitude: N = exp(max(positionWorld.y.sub(15), 0).div(-700));
  // how far the air carries: clear at midday, thick in rain and snow and the raid's smoke
  const reach: N = float(-210).add(dayU.mul(-140)).add(precipU.mul(110)).add(cloudU.mul(25)).add(raidU.mul(60));
  const factor: N = clamp(float(1).sub(exp(d.div(reach))).mul(0.82).mul(altitude.mul(0.55).add(0.45)), 0, mix(float(0.86), float(0.94), max(raidU, precipU)));
  (scene as unknown as { fogNode: N }).fogNode = fog(hazeAt(normalize(toP)), factor);
  void output;

  // ── The sky ────────────────────────────────────────────────────────────────────────────────────────
  const v: N = positionWorldDirection;
  const c = cos(rotU.negate()), sn = sin(rotU.negate());
  const rd: N = vec3(v.x.mul(c).add(v.z.mul(sn)), v.y, v.x.mul(sn.negate()).add(v.z.mul(c)));
  const photo: N = texture(hdr, equirectUV(rd)).rgb;
  const lum: N = dot(photo, vec3(0.2126, 0.7152, 0.0722));
  const toSun: N = max(dot(normalize(v), sunU), 0);
  const disc: N = pow(toSun, 900).mul(30).add(pow(toSun, 40).mul(1.2));
  // golden hour: the photograph (its low band melting into the haze)
  const gold: N = mix(photo, hazeAt(normalize(v)).mul(1.15), smoothstep(0.16, -0.02, v.y)).add(glow.mul(disc));
  // the day: a clear blue dome, paler at the horizon, the photo's clouds kept as soft white shapes
  const dome: N = mix(color3(0xbcd3ea), color3(0x2f66c4), smoothstep(-0.02, 0.38, v.y));
  const dayClouds: N = smoothstep(0.35, 1.2, lum).mul(smoothstep(0.02, 0.2, v.y)).mul(0.55);
  const daySky: N = mix(dome, color3(0xf4f4f2), dayClouds).add(color3(0xfff6e4).mul(disc.mul(0.6)));
  let skyC: N = mix(gold, mix(daySky, hazeAt(normalize(v)).mul(1.05), smoothstep(0.08, -0.02, v.y)), dayU);
  // night: deep blue going black overhead, stars (fewer near the horizon, and none through cloud)
  const cell: N = floor(normalize(v).mul(420));
  const star: N = step(0.9986, fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453)))
    .mul(smoothstep(0.02, 0.25, v.y)).mul(sin(time.mul(2.3).add(cell.x)).mul(0.3).add(0.7));
  const nightSky: N = mix(color3(0x1d2740), color3(0x04070f), smoothstep(-0.02, 0.6, v.y)).add(vec3(star.mul(1.4)));
  skyC = mix(skyC, nightSky, nightU);
  // cloud: a lid of grey, the photo's cloud shapes kept as its texture; darker by night, a dull glow toward the sun
  const lid: N = greyC.mul(lum.mul(0.35).add(0.78)).mul(float(1).sub(nightU.mul(0.85))).add(color3(0xfff0d8).mul(pow(toSun, 6).mul(0.25).mul(float(1).sub(nightU))));
  skyC = mix(skyC, mix(lid, hazeAt(normalize(v)), smoothstep(0.12, -0.02, v.y)), cloudU.mul(0.92));
  // the raid: the photo's clouds kept as shapes but dimmed and cooled, slate overhead, an ember band on the horizon
  const sunward: N = pow(max(dot(normalize(vec3(v.x, 0, v.z)), normalize(vec3(sunU.x, 0, sunU.z))), 0), 2);
  const band: N = smoothstep(0.22, 0.0, v.y).mul(sunward.mul(0.7).add(0.3));
  const slate: N = mix(color3(0x56607a), color3(0x1a2032), smoothstep(0.0, 0.6, v.y)).mul(float(1).sub(nightU.mul(0.6)));
  const dusk: N = slate.mul(lum.mul(0.5).add(0.75)).add(color3(0xb0583a).mul(band.mul(0.55)));
  scene.backgroundNode = mix(skyC, mix(dusk, hazeAt(normalize(v)).mul(1.05), smoothstep(0.1, -0.02, v.y)), raidU.mul(0.8));

  // ── Grade (display space, after tone mapping): warm highlights, teal shadows, contrast ────────────
  setLut(gradeLut(), 1);

  // ── Light: the sun (or the moon) and the sky's fill, from the hour, the season, the cloud and the raid ──
  const C = (h: number) => new THREE.Color(h);
  const GOLD = { sun: C(0xffb978), sunI: 4.2, hemi: C(0xa8b8d0), hemiG: C(0x9a6a40), hemiI: 0.55, amb: C(0x8a96b0), ambI: 0.12, env: 0.7 };
  const DAY = { sun: C(0xfff0dc), sunI: 3.6, hemi: C(0xb8cde8), hemiG: C(0x8a7a5a), hemiI: 0.95, amb: C(0x9aa6bc), ambI: 0.16, env: 0.95 };
  const LOW = { sun: C(0xff8a50), sunI: 2.6, hemi: C(0x8a90b0), hemiG: C(0x6a4a3a), hemiI: 0.5, amb: C(0x6a7090), ambI: 0.14, env: 0.45 };
  const NIGHT = { sun: C(0x9ab0e0), sunI: 0.42, hemi: C(0x2a3858), hemiG: C(0x14161e), hemiI: 0.42, amb: C(0x26324e), ambI: 0.2, env: 0.12 };
  const RAID = { sun: C(0xff7a48), hemi: C(0x52607e), hemiG: C(0x3a2a22), amb: C(0x2a3450) };
  const st = { raid: 0, elevDeg: THREE.MathUtils.radToDeg(e0), azDeg: 0, cloud: 0, precip: 0 };
  const tmp = { a: new THREE.Color(), b: new THREE.Color() };
  type L = typeof DAY;
  const mixL = (a: L, b: L, k: number): L => ({
    sun: a.sun.clone().lerp(b.sun, k), sunI: THREE.MathUtils.lerp(a.sunI, b.sunI, k), hemi: a.hemi.clone().lerp(b.hemi, k), hemiG: a.hemiG.clone().lerp(b.hemiG, k),
    hemiI: THREE.MathUtils.lerp(a.hemiI, b.hemiI, k), amb: a.amb.clone().lerp(b.amb, k), ambI: THREE.MathUtils.lerp(a.ambI, b.ambI, k), env: THREE.MathUtils.lerp(a.env, b.env, k),
  });
  let lutStep = -1;
  const apply = () => {
    const E = st.elevDeg, ss = THREE.MathUtils.smoothstep;
    const day = ss(E, 14, 34), night = 1 - ss(E, -9, 1.5), low = 1 - ss(E, 1, 9);
    // the light's colour and strength by the sun's height: low red sun → golden → white day; under the horizon, the moon
    let Lt = mixL(GOLD, DAY, day);
    Lt = mixL(Lt, LOW, low * (1 - night));
    Lt = mixL(Lt, NIGHT, night);
    const cl = st.cloud;
    Lt.sunI *= 1 - 0.78 * cl; Lt.hemiI *= 1 + 0.35 * cl * (1 - night); Lt.env *= 1 - 0.35 * cl;
    Lt.hemi.lerp(tmp.a.set(0x9aa2ac).multiplyScalar(1 - 0.75 * night), cl * 0.7);
    const r = st.raid;
    sun.color.copy(Lt.sun).lerp(RAID.sun, r * 0.6); sun.intensity = Lt.sunI * (1 - 0.55 * r);
    hemi.color.copy(Lt.hemi).lerp(RAID.hemi, r * 0.7); hemi.groundColor.copy(Lt.hemiG).lerp(RAID.hemiG, r * 0.7); hemi.intensity = Lt.hemiI;
    amb.color.copy(Lt.amb).lerp(RAID.amb, r * 0.7); amb.intensity = Lt.ambI + 0.08 * r;
    scene.environmentIntensity = Lt.env * (1 - 0.6 * r);
    // the light's direction: the sun while it's up (held a few degrees up so shadows stay readable), else the moon
    // high in the opposite sky
    const az = Math.atan2(SUN_AZ.x, SUN_AZ.z) + THREE.MathUtils.degToRad(st.azDeg);
    const el = THREE.MathUtils.degToRad(night > 0.5 ? 38 : Math.max(3.5, E));
    const a = night > 0.5 ? az + Math.PI * 0.8 : az;
    sunDir.set(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)).normalize();
    // the sky's sun stays the real sun (it sets and rises), the shadows follow the light
    const se = THREE.MathUtils.degToRad(E);
    sunU.value.set(Math.sin(az) * Math.cos(se), Math.sin(se), Math.cos(az) * Math.cos(se)).normalize();
    rotU.value = rot0 + THREE.MathUtils.degToRad(st.azDeg);
    scene.environmentRotation.set(0, rotU.value, 0);
    dayU.value = day; nightU.value = night; cloudU.value = cl; precipU.value = st.precip; raidU.value = r;
    const step = Math.round(Math.max(r, night * 0.7, cl * 0.35) * 10);
    if (step !== lutStep) { lutStep = step; setLut(gradeLut(33, step / 10), 1); }
  };
  void tmp.b;
  apply();
  return {
    rotation: rot0, photoElevation: THREE.MathUtils.radToDeg(elev),
    /** 0 the town at peace … 1 the raid's smoke and fire over it. */
    setRaid(k: number) { st.raid = THREE.MathUtils.clamp(k, 0, 1); apply(); },
    /** The hour's sun (elevation, degrees off the evening azimuth), cloud cover and precipitation (core/climate.ts). */
    setClimate(c: { elevDeg: number; azDeg: number; cloud: number; precip: number }) { Object.assign(st, c); apply(); },
  };
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
