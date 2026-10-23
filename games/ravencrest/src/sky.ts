// Moonlit storm sky: layered fbm clouds lit from behind by an oversized full moon,
// tuned to the art's blue-grey palette (brightest cloud rims hug the moon).
import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, float, uniform, dot, max, pow, mix, smoothstep, time, positionWorldDirection, mx_fractal_noise_float, mx_noise_float, acos } from 'three/tsl';

export function moonSky(moonDir: THREE.Vector3, moonRadiusDeg: number) {
  const uMoon = uniform(moonDir.clone().normalize());
  const uRadius = uniform(THREE.MathUtils.degToRad(moonRadiusDeg));
  // Weather (weather.ts / nightmare.ts): storm thickens and speeds the deck, flash lights the
  // clouds from inside, dim pulls the whole sky toward black for the silhouette night.
  const uStorm = uniform(0), uFlash = uniform(0), uDim = uniform(0);
  // Daybreak after Dracula falls (nightmare.ts → daybreak.ts): 0 night … 1 bright morning.
  const uDay = uniform(0);
  const uSun = uniform(new THREE.Vector3(0.35, 0.62, -0.7).normalize());

  const node = Fn(() => {
    const dir = positionWorldDirection.normalize();
    const up = dir.y.max(0.0);
    const md = dot(dir, uMoon).clamp(-1, 1);
    const ang = acos(md);

    // Base gradient: near-black zenith, slate horizon haze.
    const base = mix(vec3(0.03, 0.037, 0.05), vec3(0.008, 0.011, 0.016), smoothstep(float(0.0), float(0.6), up));

    // Cloud deck projected onto a plane; two scrolling octave sets.
    const p = dir.xz.div(dir.y.add(0.12)).mul(0.9);
    const speed = float(1).add(uStorm.mul(5));
    const drift = vec2(time.mul(0.004).mul(speed), time.mul(0.0015).mul(speed));
    const c1 = mx_fractal_noise_float(vec3(p.add(drift), time.mul(0.003)), 4, 2.1, 0.52, 1);
    const c2 = mx_fractal_noise_float(vec3(p.mul(2.7).sub(drift.mul(1.6)), 3.1), 3, 2.0, 0.5, 1);
    const density = smoothstep(float(-0.4).sub(uStorm.mul(0.6)), float(0.35).sub(uStorm.mul(0.3)), c1.add(c2.mul(0.45))).mul(smoothstep(float(-0.02), float(0.08), dir.y));

    // Moon: disc with maria mottling + limb darkening, then halo and wide glow.
    const inDisc = smoothstep(uRadius, uRadius.mul(0.97), ang);
    const local = dir.sub(uMoon.mul(md)).mul(float(1).div(uRadius));
    const maria = mx_noise_float(vec3(local.xy.mul(3.2), local.z.add(1.7))).mul(0.5).add(mx_noise_float(vec3(local.xy.mul(9.0), local.z.add(4.2))).mul(0.2));
    const limb = float(1).sub(pow(ang.div(uRadius).clamp(0, 1), float(4)).mul(0.35));
    const moon = vec3(0.92, 0.95, 1.0).mul(float(0.82).sub(maria.mul(0.25))).mul(limb).mul(2.2);
    const halo = pow(max(md, 0.0), float(3000)).mul(0.5).add(pow(max(md, 0.0), float(160)).mul(0.1)).add(pow(max(md, 0.0), float(10)).mul(0.02));

    // Clouds: dark bodies with silver rims where they pass near the moon.
    const rim = pow(max(md, 0.0), float(25)).mul(1.6).add(pow(max(md, 0.0), float(4)).mul(0.25));
    // Billow shading: denser cores darker, thin edges catch moonlight.
    const shade = smoothstep(float(0.2), float(0.9), c2.mul(0.5).add(0.5));
    const cloudCol = mix(vec3(0.028, 0.033, 0.043), vec3(0.2, 0.225, 0.27), rim.clamp(0, 1)).mul(mix(float(1.25), float(0.55), shade));
    const sky = base.add(vec3(0.55, 0.62, 0.75).mul(halo));
    const withMoon = mix(sky, moon, inDisc);
    // Thin wisps cross the moon (as in the art); thick cloud fully hides it.
    const cover = density.mul(mix(float(1), float(0.55), inDisc)).add(uStorm.mul(0.35)).clamp(0, 1);
    // Storm clouds darker; lightning lights their undersides blue-white.
    const stormCloud = cloudCol.mul(float(1).sub(uStorm.mul(0.55))).add(vec3(0.55, 0.62, 0.85).mul(uFlash).mul(float(0.4).add(shade.mul(0.8))));
    const night = mix(withMoon, stormCloud, cover).mul(float(1).sub(uDim.mul(0.8))).add(vec3(0.3, 0.34, 0.45).mul(uFlash).mul(0.25));
    // Day: clear blue overhead, warm pale horizon, sun disc + glow, fair-weather cumulus.
    const sd = dot(dir, uSun).clamp(-1, 1);
    const daySky = mix(vec3(0.62, 0.74, 0.9), vec3(0.16, 0.36, 0.75), pow(up, float(0.55)));
    const sunGlow = pow(max(sd, 0.0), float(800)).mul(30).add(pow(max(sd, 0.0), float(40)).mul(0.6)).add(pow(max(sd, 0.0), float(4)).mul(0.12));
    const puff = smoothstep(float(0.05), float(0.55), c1.add(c2.mul(0.4))).mul(smoothstep(float(0.0), float(0.12), dir.y));
    const dayCloud = mix(vec3(0.95, 0.96, 0.98), vec3(0.62, 0.66, 0.74), shade);
    const day = mix(daySky.add(vec3(1.0, 0.92, 0.75).mul(sunGlow)), dayCloud, puff.mul(0.85));
    return mix(night, day, uDay);
  })();

  return { node, uMoon, uStorm, uFlash, uDim, uDay, uSun };
}
