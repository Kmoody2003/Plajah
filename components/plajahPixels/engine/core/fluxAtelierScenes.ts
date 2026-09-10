// Rebuilt Flux Atelier Scenes — Trapcode Form point-cloud particle implementations.
// Porcelain Tide, Velvet Bloom, Prism Archive: now 30-40k ordered dots with full audio reactivity.
import type { SceneInst } from './flux';

const NOISE_GLSL = `
  float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float vnoise(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),u.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x),u.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x),u.y),u.z);}
  float fbm3(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.02+vec3(1.7,9.2,3.3);a*=.5;}return s;}
`;

/** PORCELAIN TILE — 40,000 dots in a sacred geometric mandala.
 * Concentric Fibonacci rings forming an intricate tiled rosette.
 * Bass pulses outward, mid drives rotation, treble sparks lattice lines, kick shockwave from center. */
export function buildPorcelainTide(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x020810, 0.012);
  const camera = new T.PerspectiveCamera(46, 1, 0.1, 200);

  const CNT = 40000;
  const pos = new Float32Array(CNT * 3);
  const uvs = new Float32Array(CNT * 2);

  const phi = (1 + Math.sqrt(5)) / 2;
  const goldenAngle = Math.PI * 2 * (1 - 1 / phi);

  for (let i = 0; i < CNT; i++) {
    const t = i / CNT;
    const radius = Math.sqrt(t) * 12.0;
    const theta = goldenAngle * i;
    pos[i * 3] = Math.cos(theta) * radius;
    pos[i * 3 + 1] = Math.sin(theta) * radius;
    pos[i * 3 + 2] = 0;
    uvs[i * 2] = t;
    uvs[i * 2 + 1] = (theta % (Math.PI * 2)) / (Math.PI * 2);
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aUv', new T.BufferAttribute(uvs, 2));

  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
      uTre: { value: 0 }, uKick: { value: 0 }, uEnergy: { value: 0 },
      uPix: { value: 1 }, uHue: { value: 0.5 },
    },
    vertexShader: NOISE_GLSL + `
      uniform float uTime, uBass, uMid, uTre, uKick, uEnergy, uPix, uHue;
      attribute vec2 aUv;
      varying vec3 vCol;
      varying float vAlpha;
      void main() {
        vec2 p0 = position.xy;
        float r = length(p0);
        float angle = atan(p0.y, p0.x);
        float breathe = 1.0 + uBass * 0.45 + uEnergy * 0.15;
        float expandedR = r * breathe;
        float innerRot = uTime * 0.35 + uMid * 1.2;
        float outerRot = uTime * -0.18 + uMid * -0.6;
        float rotBlend = smoothstep(0.0, 12.0, r);
        float rot = mix(innerRot, outerRot, rotBlend);
        float newAngle = angle + rot;
        vec3 nCoord = vec3(cos(newAngle) * expandedR * 0.35, sin(newAngle) * expandedR * 0.35, uTime * 0.12);
        float lattice = fbm3(nCoord * 2.5);
        float latticeLine = pow(0.5 + 0.5 * sin(expandedR * 3.8 + lattice * 6.0), 6.0);
        float sparkHash = fract(sin(dot(vec2(aUv.x * 400.0, aUv.y * 300.0) + floor(uTime * 12.0) * 0.13, vec2(12.9898, 78.233))) * 43758.5453);
        float spark = smoothstep(0.88, 0.99, sparkHash) * (0.3 + uTre * 2.8);
        float kickWave = sin(expandedR * 2.5 - uTime * 12.0) * uKick * 1.6 * exp(-r * 0.18);
        float z = sin(expandedR * 0.6 + lattice * 3.0) * (0.8 + uBass * 1.2) + kickWave * 0.5;
        vec3 p = vec3(cos(newAngle) * expandedR, sin(newAngle) * expandedR, z);
        vec3 colCyan = vec3(0.04, 0.88, 1.0);
        vec3 colSapphire = vec3(0.08, 0.22, 0.92);
        vec3 colWhite = vec3(0.96, 0.98, 1.0);
        vec3 colGold = vec3(1.0, 0.85, 0.22);
        vec3 c = mix(colSapphire, colCyan, smoothstep(0.2, 0.7, lattice));
        c = mix(c, colWhite, latticeLine * (0.4 + uTre * 0.6));
        c += colWhite * spark * 1.4;
        c = mix(c, colGold, smoothstep(0.3, 0.9, abs(kickWave)) * uKick * 0.85);
        float ringGlow = pow(0.5 + 0.5 * sin(expandedR * 4.2), 8.0) * (0.3 + uEnergy * 0.5);
        c += colCyan * ringGlow * 0.6;
        c = mix(c, c.bgr, (uHue - 0.5) * 0.35);
        float edgeFade = 1.0 - smoothstep(10.0, 12.5, r);
        vCol = c;
        vAlpha = (0.45 + latticeLine * 0.45 + spark * 0.4) * edgeFade * (0.75 + uEnergy * 0.25);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.55 + latticeLine * 0.65 + spark * 0.5) * (1.0 + uEnergy * 0.2);
        gl_PointSize = clamp(sz * uPix * (42.0 / max(0.5, -mv.z)), 1.0, 6.5);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard;
        float core = 1.0 - smoothstep(0.1, 0.5, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    scene, camera,
    cam: { target: [0, 0, 0], radius: 26, pitch: 35, yaw: 0, fov: 46 },
    exposure: 1.05, brightThreshold: 0.82, grain: 0.0006,
    update(t, a, spec) {
      points.rotation.z = t * 0.04;
      const U = mat.uniforms;
      U.uTime.value = t; U.uBass.value = a.bass; U.uMid.value = a.mid;
      U.uTre.value = a.tre; U.uKick.value = a.kick; U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.28 + a.kick * 0.18 + a.energy * 0.14,
    dispose: () => { geo.dispose(); mat.dispose(); },
  };
}

/** VELVET BLOOM — 30,000 dots in organic blooming petal surfaces.
 * Layered rose/peony shapes that unfold and breathe.
 * Bass swells petals, mid drives unfurling speed, treble inner glow, kick light surge. */
export function buildVelvetBloom(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x0a0208, 0.014);
  const camera = new T.PerspectiveCamera(46, 1, 0.1, 200);

  const LAYERS = 8, RADIAL = 60, ALONG = 63;
  const CNT = LAYERS * RADIAL * ALONG;
  const pos = new Float32Array(CNT * 3);
  const attrs = new Float32Array(CNT * 3);

  let idx = 0;
  for (let layer = 0; layer < LAYERS; layer++) {
    const layerAngleOffset = (layer / LAYERS) * Math.PI * 2;
    const layerSize = 3.0 + layer * 0.9;
    for (let r = 0; r < RADIAL; r++) {
      const u = r / (RADIAL - 1);
      for (let a = 0; a < ALONG; a++) {
        const v = a / (ALONG - 1);
        const vC = (v - 0.5) * 2.0;
        const petalR = u * layerSize;
        const widthEnv = Math.sin(u * Math.PI) * layerSize * 0.22;
        const petalAngle = layerAngleOffset + vC * widthEnv / (petalR + 0.1);
        pos[idx * 3] = Math.cos(petalAngle) * petalR;
        pos[idx * 3 + 1] = Math.sin(petalAngle) * petalR;
        pos[idx * 3 + 2] = 0;
        attrs[idx * 3] = layer;
        attrs[idx * 3 + 1] = u;
        attrs[idx * 3 + 2] = v;
        idx++;
      }
    }
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aPetal', new T.BufferAttribute(attrs, 3));

  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
      uTre: { value: 0 }, uKick: { value: 0 }, uEnergy: { value: 0 },
      uPix: { value: 1 }, uHue: { value: 0.5 },
    },
    vertexShader: NOISE_GLSL + `
      uniform float uTime, uBass, uMid, uTre, uKick, uEnergy, uPix, uHue;
      attribute vec3 aPetal;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        float layer = aPetal.x, u = aPetal.y, v = aPetal.z;
        float vC = (v - 0.5) * 2.0;
        float layerCount = 8.0;
        float layerAngle = (layer / layerCount) * 6.28318 + uTime * 0.08;
        float layerSize = 3.0 + layer * 0.9;
        float openness = 0.5 + uBass * 0.5 + uEnergy * 0.15;
        float curlSpeed = 0.3 + uMid * 0.8;
        float curl = u * u * (1.2 + curlSpeed) + 0.04 * sin(uTime * 0.5 + layer * 0.7);
        float petalR = u * layerSize * openness;
        float widthEnv = pow(sin(u * 3.14159), 0.7) * layerSize * 0.24;
        float petalAngle = layerAngle + curl + vC * widthEnv / max(0.1, petalR);
        float z = sin(u * 3.14159) * (1.8 + (1.0 - openness) * 3.0) + pow(u, 4.0) * 0.8;
        z += 0.12 * sin(u * 8.0 - uTime * 0.4 + layer) * sin(u * 3.14159);
        float kickSurge = uKick * 1.4 * exp(-u * 2.5);
        vec3 p = vec3(cos(petalAngle) * petalR, sin(petalAngle) * petalR, z + layer * 0.3);
        vec3 colMagenta = vec3(0.88, 0.04, 0.35);
        vec3 colPink = vec3(1.0, 0.22, 0.55);
        vec3 colViolet = vec3(0.62, 0.08, 0.82);
        vec3 colRoseGold = vec3(1.0, 0.72, 0.52);
        vec3 colFuchsia = vec3(0.98, 0.12, 0.78);
        float layerT = layer / layerCount;
        vec3 c = mix(colPink, colMagenta, layerT);
        c = mix(c, colViolet, smoothstep(0.5, 1.0, layerT));
        float tipGlow = smoothstep(0.6, 0.95, u) * (0.3 + uTre * 2.0);
        c = mix(c, colRoseGold, tipGlow * (1.0 - layerT * 0.6));
        c += colFuchsia * kickSurge * 0.7;
        c += vec3(1.0, 0.9, 0.8) * kickSurge * 0.3;
        float edgeShimmer = smoothstep(0.85, 1.0, abs(vC)) * (0.4 + uTre * 1.2);
        c += colRoseGold * edgeShimmer * 0.5;
        c = mix(c, c.bgr, (uHue - 0.5) * 0.4);
        float petalFade = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.92, 1.0, u));
        float widthFade = 1.0 - smoothstep(0.7, 1.0, abs(vC));
        vCol = c;
        vAlpha = petalFade * widthFade * (0.55 + tipGlow * 0.3 + kickSurge * 0.35) * (0.75 + uEnergy * 0.25);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.6 + tipGlow * 0.5 + kickSurge * 0.4) * (1.0 + uEnergy * 0.2);
        gl_PointSize = clamp(sz * uPix * (48.0 / max(0.5, -mv.z)), 1.0, 6.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard;
        float core = 1.0 - smoothstep(0.1, 0.5, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    scene, camera,
    cam: { target: [0, 0, 1.5], radius: 20, pitch: 12, yaw: 0, fov: 46 },
    exposure: 1.08, brightThreshold: 0.78, grain: 0.0006,
    update(t, a, spec) {
      points.rotation.z = t * 0.06;
      points.rotation.x = Math.sin(t * 0.15) * 0.08;
      const U = mat.uniforms;
      U.uTime.value = t; U.uBass.value = a.bass; U.uMid.value = a.mid;
      U.uTre.value = a.tre; U.uKick.value = a.kick; U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.30 + a.kick * 0.22 + a.energy * 0.15,
    dispose: () => { geo.dispose(); mat.dispose(); },
  };
}

/** PRISM ARCHIVE — 35,000 dots in nested rotating polyhedra.
 * Icosahedron inside dodecahedron, each facet surface filled with dots.
 * Bass swells outer, mid counter-rotates, treble refracts rainbow, kick prismatic flash. */
export function buildPrismArchive(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x04020c, 0.012);
  const camera = new T.PerspectiveCamera(46, 1, 0.1, 200);

  const OUTER = 25000, INNER = 10000, CNT = OUTER + INNER;
  const pos = new Float32Array(CNT * 3);
  const shellAttr = new Float32Array(CNT);
  const uvIdx = new Float32Array(CNT * 2);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const R_OUTER = 8.0;
  for (let i = 0; i < OUTER; i++) {
    const y = 1 - (i / (OUTER - 1)) * 2;
    const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    pos[i * 3] = Math.cos(theta) * rAtY * R_OUTER;
    pos[i * 3 + 1] = y * R_OUTER;
    pos[i * 3 + 2] = Math.sin(theta) * rAtY * R_OUTER;
    shellAttr[i] = 0;
    uvIdx[i * 2] = (y + 1) * 0.5;
    uvIdx[i * 2 + 1] = (theta % (Math.PI * 2)) / (Math.PI * 2);
  }

  const R_INNER = 4.2;
  for (let i = 0; i < INNER; i++) {
    const j = OUTER + i;
    const y = 1 - (i / (INNER - 1)) * 2;
    const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    pos[j * 3] = Math.cos(theta) * rAtY * R_INNER;
    pos[j * 3 + 1] = y * R_INNER;
    pos[j * 3 + 2] = Math.sin(theta) * rAtY * R_INNER;
    shellAttr[j] = 1;
    uvIdx[j * 2] = (y + 1) * 0.5;
    uvIdx[j * 2 + 1] = (theta % (Math.PI * 2)) / (Math.PI * 2);
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aShell', new T.BufferAttribute(shellAttr, 1));
  geo.setAttribute('aUv', new T.BufferAttribute(uvIdx, 2));

  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
      uTre: { value: 0 }, uKick: { value: 0 }, uEnergy: { value: 0 },
      uPix: { value: 1 }, uHue: { value: 0.5 },
    },
    vertexShader: NOISE_GLSL + `
      uniform float uTime, uBass, uMid, uTre, uKick, uEnergy, uPix, uHue;
      attribute float aShell;
      attribute vec2 aUv;
      varying vec3 vCol; varying float vAlpha;
      vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }
      vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z); }
      void main() {
        vec3 p0 = position;
        vec3 n = normalize(p0);
        float isOuter = 1.0 - aShell;
        float outerScale = 1.0 + uBass * 0.4;
        float innerScale = 1.0 - uBass * 0.2 + uEnergy * 0.15;
        float scale = mix(outerScale, innerScale, aShell);
        float facetFreq = mix(5.0, 3.0, aShell);
        vec3 noiseP = n * facetFreq + vec3(0.0, uTime * 0.05, 0.0);
        float facet = fbm3(noiseP * 1.5);
        float edgeBright = pow(0.5 + 0.5 * sin(facet * 18.0), 6.0);
        vec3 p = n * (length(p0) * scale + facet * (0.3 + uBass * 0.4));
        float outerRot = uTime * 0.18 + uMid * 0.4;
        float innerRot = -uTime * 0.28 - uMid * 0.6;
        float rotAngle = mix(outerRot, innerRot, aShell);
        float tiltAngle = mix(uTime * 0.08, -uTime * 0.12, aShell);
        p = rotY(p, rotAngle);
        p = rotX(p, tiltAngle + sin(uTime * 0.2) * 0.15);
        float spectrum = aUv.x * 0.65 + aUv.y * 0.35 + facet * 0.3 + uTre * 0.15;
        vec3 c = 0.5 + 0.5 * cos(6.28318 * (spectrum + vec3(0.0, 0.33, 0.67)));
        c = pow(c, vec3(0.7)) * 1.3;
        c += vec3(0.9, 0.95, 1.0) * edgeBright * (0.3 + uTre * 0.7);
        float kickFlash = uKick * edgeBright * 1.8;
        c += vec3(1.0, 0.85, 0.95) * kickFlash;
        c *= (1.0 + aShell * 0.3);
        c = mix(c, c.bgr, (uHue - 0.5) * 0.3);
        vCol = c;
        vAlpha = (0.4 + edgeBright * 0.5 + kickFlash * 0.3) * (0.7 + uEnergy * 0.3);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.5 + edgeBright * 0.6 + kickFlash * 0.4) * (1.0 + uEnergy * 0.2);
        gl_PointSize = clamp(sz * uPix * (40.0 / max(0.5, -mv.z)), 1.0, 6.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard;
        float core = 1.0 - smoothstep(0.1, 0.5, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    scene, camera,
    cam: { target: [0, 0, 0], radius: 24, pitch: 15, yaw: 0, fov: 46 },
    exposure: 1.06, brightThreshold: 0.78, grain: 0.0006,
    update(t, a, spec) {
      const U = mat.uniforms;
      U.uTime.value = t; U.uBass.value = a.bass; U.uMid.value = a.mid;
      U.uTre.value = a.tre; U.uKick.value = a.kick; U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.32 + a.kick * 0.20 + a.tre * 0.16,
    dispose: () => { geo.dispose(); mat.dispose(); },
  };
}
