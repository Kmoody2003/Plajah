// Plajah Sky — real-time volumetric clouds (WebGPU / TSL).
//
// A sky shell drawn at the far plane behind everything (only the sky pixels between the trees pay for it). Each pixel
// raymarches the cloud layer — a shell 1.5–4.2 km above a planet-sized sphere, so clouds sink to the horizon — through
// tileable Perlin-Worley noise (noise3d.ts): a low-frequency coverage map decides where clouds are, the height profile
// rounds their tops and flattens their bases, Worley detail erodes the edges into lobes and wisps. Lighting per sample:
// a short march toward the sun (Beer's law), the "powder" darkening of thick cores seen from the sun side, a two-lobe
// Henyey-Greenstein phase (bright silver lining toward the sun), and sky ambient that grows with height (grey bases,
// bright tops). A high cirrus layer of stretched wisps rides above, with an optional "cosmic" tint (the fantasy sky
// domes' pink and lavender wisps). Coverage, darkness and wind come from the weather; sun and ambient from the time of day.
import * as THREE from 'three/webgpu';
import {
  Break, Fn, If, Loop, cameraPosition, clamp, dot, exp, float, fract, length, max, min, mix, modelViewProjection, normalize, positionWorld,
  screenCoordinate, select, sin, smoothstep, sqrt, texture3D, uniform, vec2, vec3, vec4, int,
} from 'three/tsl';
import { cloudNoise } from './noise3d';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface CloudLayer {
  mesh: THREE.Mesh;
  u: {
    sunDir: N; sunColor: N; ambient: N; ambientLow: N;
    /** 0 clear … 1 overcast. */
    coverage: N;
    /** 0 … 1: storm darkening (more extinction, less light through). */
    darkness: N;
    /** Wind drift (m), advanced by update(). */
    wind: N;
    cirrus: N; cirrusTint: N; cosmic: N;
    /** Camera height above the ground plane (m). */
    camY: N;
  };
  /** Drift the clouds: wind speed m/s along (x, z). */
  update(dt: number, windX: number, windZ: number): void;
}

const RE = 6360000, BASE = 1500, TOP = 4200;

export function volumetricClouds(o: { lo?: boolean } = {}): CloudLayer {
  const { shape, detail } = cloudNoise();
  const steps = o.lo ? 24 : 40, lightSteps = o.lo ? 3 : 4;   // (kept modest: the march runs on every sky pixel)
  // loop counts as uniforms: with constant bounds the D3D shader compiler unrolls the march (and the light march inside it)
  // and a page took over two minutes to compile its shaders
  const uSteps = (uniform as N)(steps, 'int'), uLight = (uniform as N)(lightSteps, 'int');
  const u = {
    sunDir: uniform(new THREE.Vector3(0.5, 0.6, -0.5).normalize()), sunColor: uniform(new THREE.Color(1, 0.96, 0.9)),
    ambient: uniform(new THREE.Color(0.55, 0.65, 0.8)), ambientLow: uniform(new THREE.Color(0.3, 0.33, 0.38)),
    coverage: uniform(0.45), darkness: uniform(0), wind: uniform(new THREE.Vector2()),
    cirrus: uniform(0.5), cirrusTint: uniform(new THREE.Color(0xc9a6ff)), cosmic: uniform(0.35), camY: uniform(0),
  };

  // safe denominators throughout: a NaN anywhere in the march turned whole overcast skies invisible (D3D clamps NaN to 0)
  const remap = (v: N, a: N, b: N, c: N, d: N): N => float(c).add(float(v).sub(a).div(float(b).sub(a).max(1e-4)).mul(float(d).sub(c)));
  const finite = (x: N, fb: N): N => select(x.equal(x), x, fb);   // NaN fails x == x
  const S = (t: THREE.Data3DTexture, p: N): N => texture3D(t, p).level(float(0));   // explicit LOD: sampled in loops

  /** Cloud density at sample point p (x, altitude, z in metres, world-fixed), h = 0…1 through the layer. */
  const density = Fn(([p, h]: N[]) => {
    const q = vec3(p.x.add(u.wind.x), p.y, p.z.add(u.wind.y));
    const s: N = S(shape, q.mul(1 / 4800));
    const wf = s.g.mul(0.625).add(s.b.mul(0.25)).add(s.a.mul(0.125));
    const base = remap(s.r, wf.sub(1), 1, 0, 1).toVar();
    // where clouds are: a broad coverage map, so clear gaps and cloud banks move through the sky
    const cm: N = S(shape, vec3(q.x.mul(1 / 38000), 0.37, q.z.mul(1 / 38000))).g;
    const cov = clamp(u.coverage.add(cm.sub(0.5).mul(0.9)), 0, 1);
    // cumulus profile: flat base, rounded top; thicker (taller) when overcast
    // (a soft base: the noise mottles the underside of an overcast deck instead of a flat sheet)
    const grad = smoothstep(0.0, 0.22, h).mul(float(1).sub(smoothstep(mix(float(0.35), float(0.8), cov), float(1.0), h)));
    base.assign(remap(base.mul(grad), float(1).sub(cov), 1, 0, 1).mul(cov));
    const out = float(0).toVar();
    If(base.greaterThan(0.001), () => {
      const dn: N = S(detail, q.mul(1 / 950));
      const df = dn.r.mul(0.625).add(dn.g.mul(0.25)).add(dn.b.mul(0.125));
      const dm = mix(df, float(1).sub(df), clamp(h.mul(4), 0, 1));         // wispy bases, billowy tops
      out.assign(max(remap(base, dm.mul(0.42), 1, 0, 1), 0));
    });
    return out;
  });

  const hg = (c: N, g: number): N => float((1 - g * g) / (4 * Math.PI)).div(float(1 + g * g).sub(c.mul(2 * g)).pow(1.5));

  const color = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition)).toVar();
    const result = vec4(0, 0, 0, 0).toVar();
    If(dir.y.greaterThan(-0.01), () => {
      const ry = float(RE).add(u.camY);
      const b = ry.mul(dir.y), cc = ry.mul(ry);
      const t0 = b.negate().add(sqrt(b.mul(b).sub(cc.sub((RE + BASE) ** 2)))).max(0);
      const t1 = min(b.negate().add(sqrt(b.mul(b).sub(cc.sub((RE + TOP) ** 2)))), t0.add(15000));
      const len = t1.sub(t0), dt = len.div(steps);
      const jitter = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453));
      const t = t0.add(dt.mul(jitter)).toVar();
      // the horizon fade uses the view height only: any use of t0 in the output (after the march) made dense decks draw
      // nothing on the D3D shader compiler, before or after the loop, though t0 is fine inside it
      const fadeV = smoothstep(-0.01, 0.14, dir.y).toVar();
      const T = float(1).toVar(), col = vec3(0).toVar();
      const cosT = dot(dir, u.sunDir);
      const phase = mix(hg(cosT, 0.45), hg(cosT, -0.2), 0.3).mul(4 * Math.PI);
      const ext = mix(float(0.016), float(0.034), u.darkness);
      (Loop as N)({ start: int(0), end: uSteps, type: 'int', condition: '<' }, () => {
        const wp = vec3(cameraPosition.x, ry, cameraPosition.z).add(dir.mul(t));            // relative to the planet centre below the camera
        const r = length(vec3(dir.x.mul(t), ry.add(dir.y.mul(t)), dir.z.mul(t)));
        const h = r.sub(RE + BASE).div(TOP - BASE);
        const d = density(vec3(wp.x, r.sub(RE), wp.z), h);
        If(d.greaterThan(0.002), () => {
          // light: march toward the sun
          const lt = float(0).toVar();
          (Loop as N)({ start: int(0), end: uLight, type: 'int', condition: '<', name: 'j' }, ({ j }: N) => {
            const ls = float(j).add(1).mul(180);
            const lp = vec3(wp.x, r.sub(RE), wp.z).add(u.sunDir.mul(ls));
            lt.addAssign(density(lp, lp.y.sub(BASE).div(TOP - BASE)).mul(180));
          });
          const beer = exp(lt.mul(ext).negate()), powder = float(1).sub(exp(lt.mul(ext).mul(2).negate())).mul(0.6).add(0.4);
          const sun = u.sunColor.mul(beer.mul(powder).mul(phase)).mul(float(1).sub(u.darkness.mul(0.88)));
          // sky light reaching inside: less where the cloud above/toward the sun is thick (the deck's dark lumps and bright thin gaps)
          const occl = exp(lt.mul(ext).mul(-0.12)).mul(0.75).add(0.25);
          const amb = mix(u.ambientLow, u.ambient, clamp(h, 0, 1).pow(0.7)).mul(occl).mul(float(1).sub(u.darkness.mul(0.72)));   // (h can dip below 0 by float error: pow would be NaN)
          const sT = exp(d.mul(ext).mul(dt).negate());
          col.addAssign(T.mul(float(1).sub(sT)).mul(sun.add(amb)));
          T.assign(finite(clamp(T.mul(sT), 0, 1), float(0)));
        });
        t.addAssign(dt);
        If(T.lessThan(0.02), () => { Break(); });
      });
      // cirrus: stretched high wisps, sunlit, with the fantasy domes' cosmic tint in places
      const tc = float(9000).sub(u.camY).div(dir.y.max(0.02));
      const pc = dir.xz.mul(tc).add(cameraPosition.xz).add(u.wind.mul(2.2));
      const cs: N = S(shape, vec3(pc.x.mul(1 / 42000), 0.71, pc.y.mul(1 / 11000)));
      const cs2: N = S(shape, vec3(pc.x.mul(1 / 9000), 0.23, pc.y.mul(1 / 2600)));
      const cw = smoothstep(0.5, 0.82, cs.g.mul(0.75).add(cs2.g.mul(0.25))).mul(u.cirrus).mul(smoothstep(0.02, 0.18, dir.y));
      const cosmic = smoothstep(0.5, 0.75, cs2.b).mul(u.cosmic);
      const cCol = mix(u.sunColor.mul(0.55).add(u.ambient.mul(0.7)), u.cirrusTint.mul(1.3), cosmic);
      const ca = cw.mul(0.55);
      const rgb = col.add(T.mul(ca).mul(cCol));
      const a = float(1).sub(T.mul(float(1).sub(ca)));
      // far clouds melt into the horizon haze; nothing below the horizon
      result.assign(vec4(clamp(rgb.div(a.max(0.001)), 0, 64), clamp(a.mul(fadeV), 0, 1)));
    });
    return result;
  })();

  const m = new THREE.NodeMaterial();
  m.side = THREE.BackSide; m.depthWrite = false; m.transparent = true; (m as unknown as { fog: boolean }).fog = false;
  m.vertexNode = Fn(() => { const p: N = modelViewProjection; p.z.assign(p.w); return p; })();
  // colour and opacity from the same node (the march compiles once): with the alpha left in colorNode's .a, a dense
  // deck (alpha 1) drew nothing at all on this renderer while thin clouds showed
  (m as unknown as { colorNode: N; opacityNode: N }).colorNode = vec4(color.rgb, 1);
  (m as unknown as { opacityNode: N }).opacityNode = color.a;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
  mesh.scale.setScalar(450000); mesh.frustumCulled = false; mesh.renderOrder = -6; mesh.name = 'sky-clouds';
  return {
    mesh, u,
    update(dt, wx, wz) { (u.wind.value as THREE.Vector2).x += wx * dt; (u.wind.value as THREE.Vector2).y += wz * dt; },
  };
}
