// Council collection: actual geometry, shared Flux camera/audio/bloom contract.
// The earlier Lattice/Tunnel/Aurora studies remain available in the catalog.
// Tapestry II now lives in its own transforming-embroidery implementation.
import type { SceneInst } from './flux';

function stage(T: any) {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(43, 1, 0.1, 240);
  const owned = new Set<any>();
  const own = <A,>(x: A): A => { owned.add(x); return x; };
  const mesh = (g: any, m: any, parent = scene) => { const o = new T.Mesh(own(g), m); parent.add(o); return o; };
  const line = (points: number[][], material: any, parent = scene) => {
    const g = own(new T.BufferGeometry().setFromPoints(points.map(p => new T.Vector3(...p))));
    const o = new T.Line(g, material); parent.add(o); return o;
  };
  return { scene, camera, own, mesh, line, dispose: () => { owned.forEach(o => o.dispose?.()); owned.clear(); } };
}

export { buildTapestryII } from './decoTapestryII';

const NOISE_GLSL = `
  float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float vnoise(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),u.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x),u.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x),u.y),u.z);}
  mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,s, 0.,1.,0., -s,0.,c);}
  float fbm3(vec3 p){float s=0.,a=.5;mat3 R=rotY(0.7);for(int i=0;i<5;i++){s+=a*vnoise(p);p=R*p*2.02+vec3(1.7,9.2,3.3);a*=.5;}return s;}
`;

/** FUTURIST / TRAPCODE FORM: Flux Lattice (Claude Artifact ef97e6c1)
 * "Load a track and it drives everything. A sphere of forty thousand ordered points,
 * breathing and rippling to real sound - bass swells the globe, highs light the crests,
 * the kick fires a ripple across the surface. Trapcode Form, live in the browser."
 */
export function buildLattice(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x040812, 0.015);
  const camera = new T.PerspectiveCamera(48, 1, 0.1, 200);

  // Forty thousand ordered points on a breathing sphere (Fibonacci distribution)
  const CNT = 40000;
  const pos = new Float32Array(CNT * 3);
  const uvIdx = new Float32Array(CNT * 2);

  const phi = (1 + Math.sqrt(5)) / 2;
  const goldenAngle = Math.PI * 2 * (1 - 1 / phi);
  const R_BASE = 7.2;

  for (let i = 0; i < CNT; i++) {
    const y = 1 - (i / (CNT - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;

    pos[i * 3] = Math.cos(theta) * radiusAtY * R_BASE;
    pos[i * 3 + 1] = y * R_BASE;
    pos[i * 3 + 2] = Math.sin(theta) * radiusAtY * R_BASE;

    uvIdx[i * 2] = (y + 1) * 0.5;
    uvIdx[i * 2 + 1] = (theta % (Math.PI * 2)) / (Math.PI * 2);
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aUv', new T.BufferAttribute(uvIdx, 2));

  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTre: { value: 0 },
      uBeat: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uEnergy: { value: 0 },
      uPix: { value: 1 },
      uHue: { value: 0.5 },
    },
    vertexShader: NOISE_GLSL + `
      uniform float uTime, uBass, uMid, uTre, uBeat, uKick, uSnare, uEnergy, uPix, uHue;
      attribute vec2 aUv;
      varying vec3 vCol;
      varying float vAlpha;

      void main() {
        vec3 p0 = position;
        vec3 n = normalize(p0);

        // 1. Bass swells the globe
        float swell = 1.0 + uBass * 0.46 + smoothstep(0.35, 1.0, uEnergy) * 0.24;

        // 2. Highs light the crests (fbm3 3D harmonic displacement)
        vec3 noiseCoord = n * 2.2 + vec3(0.0, uTime * 0.22, 0.0);
        float h = fbm3(noiseCoord);
        float crest = smoothstep(0.36, 0.82, h);
        float displacement = h * (0.8 + uMid * 1.1 + uTre * 0.7);

        // 3. Kick fires a ripple across the surface
        float lat = p0.y / (length(p0) + 0.001);
        float ripplePhase = lat * 15.0 - uTime * 7.5;
        float ripple = sin(ripplePhase) * uKick * 1.7 * exp(-abs(lat) * 0.35);

        // Displaced position
        vec3 p = n * (length(p0) * swell + displacement + ripple);

        // Palette: Deep sapphire base -> electric cyan mid -> crest light -> kick gold flare
        vec3 colBase = vec3(0.06, 0.25, 0.68);
        vec3 colMid = vec3(0.12, 0.88, 0.98);
        vec3 colCrest = vec3(0.96, 0.98, 1.0);
        vec3 colGold = vec3(1.0, 0.82, 0.42);

        vec3 c = mix(colBase, colMid, smoothstep(0.12, 0.62, h));
        c = mix(c, colCrest, crest);
        // Highs light the crests
        c += colCrest * (crest * uTre * 1.6);
        // Kick fires gold shockwave
        c = mix(c, colGold, smoothstep(0.4, 0.95, abs(ripple)) * uKick * 0.8);

        c = mix(c, c.bgr, (uHue - 0.5) * 0.35);

        vCol = c;
        vAlpha = (0.42 + crest * 0.58) * (0.7 + uEnergy * 0.3);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        float sz = (0.55 + crest * 0.85) * (1.0 + uEnergy * 0.25 + uKick * 0.3);
        gl_PointSize = clamp(sz * uPix * (34.0 / max(0.1, -mv.z)), 1.0, 6.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float a = 1.0 - smoothstep(0.15, 0.5, r);
        gl_FragColor = vec4(vCol, a * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  scene.add(points);

  return {
    scene,
    camera,
    cam: { target: [0, 0, 0], radius: 24.0, pitch: 12, yaw: 0, fov: 48 },
    exposure: 1.05,
    brightThreshold: 0.88,
    grain: 0.0006,
    update(t, a, spec) {
      points.rotation.y = t * 0.12;
      points.rotation.x = Math.sin(t * 0.08) * 0.15;
      const U = mat.uniforms;
      U.uTime.value = t;
      U.uBass.value = a.bass;
      U.uMid.value = a.mid;
      U.uTre.value = a.tre;
      U.uBeat.value = a.beat;
      U.uKick.value = a.kick;
      U.uSnare.value = a.snare;
      U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.22 + a.kick * 0.16 + a.energy * 0.12,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** FUTURIST / TRAPCODE FORM: Flux Tunnel (Claude Artifact d033c643)
 * "An endless corridor of ordered points flowing past - bass widens the walls,
 * mids drive the speed, highs spark the surface, the kick sends rings pulsing toward you.
 * Load a track and ride it. Trapcode Form, live in the browser."
 */
export function buildTunnel(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x02050e, 0.016);
  const camera = new T.PerspectiveCamera(74, 1, 0.1, 200);

  // Forty thousand ordered points in an endless cylindrical corridor (200 rings x 200 points)
  const RINGS = 200;
  const PTS_PER_RING = 200;
  const CNT = RINGS * PTS_PER_RING; // 40,000 points
  const pos = new Float32Array(CNT * 3);
  const angles = new Float32Array(CNT);
  const ringIds = new Float32Array(CNT);
  const ptIds = new Float32Array(CNT);

  const CORRIDOR_LEN = 140.0;
  let idx = 0;
  for (let r = 0; r < RINGS; r++) {
    const zBase = (r / RINGS) * CORRIDOR_LEN;
    for (let p = 0; p < PTS_PER_RING; p++) {
      const theta = (p / PTS_PER_RING) * Math.PI * 2;
      pos[idx * 3] = Math.cos(theta);
      pos[idx * 3 + 1] = Math.sin(theta);
      pos[idx * 3 + 2] = -zBase;
      angles[idx] = theta;
      ringIds[idx] = r / RINGS;
      ptIds[idx] = p;
      idx++;
    }
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aAngle', new T.BufferAttribute(angles, 1));
  geo.setAttribute('aRing', new T.BufferAttribute(ringIds, 1));
  geo.setAttribute('aPointId', new T.BufferAttribute(ptIds, 1));

  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTre: { value: 0 },
      uBeat: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uEnergy: { value: 0 },
      uPix: { value: 1 },
      uHue: { value: 0.5 },
    },
    vertexShader: NOISE_GLSL + `
      uniform float uTime, uBass, uMid, uTre, uBeat, uKick, uSnare, uEnergy, uPix, uHue;
      attribute float aAngle;
      attribute float aRing;
      attribute float aPointId;
      varying vec3 vCol;
      varying float vAlpha;

      void main() {
        float L = 120.0;
        // Mids drive the speed
        float speed = uTime * (16.0 + uMid * 28.0) + smoothstep(0.35, 1.0, uEnergy) * 14.0;
        float z = -mod(-position.z + speed, L);

        // Bass widens the walls
        float baseR = 5.6;
        float wallScale = 1.0 + uBass * 0.65 + uEnergy * 0.22;

        // Fluted architectural tunnel silhouette
        float angle = aAngle;
        float flutes = 1.0 + 0.08 * cos(angle * 8.0) + 0.035 * sin(angle * 16.0);

        // Tunnel wall fbm noise displacement
        vec3 nCoord = vec3(cos(angle) * 1.6, sin(angle) * 1.6, z * 0.065 + uTime * 0.14);
        float nWall = fbm3(nCoord);
        float r = (baseR * wallScale * flutes) + nWall * (0.8 + uBass * 1.2);

        // The kick sends rings pulsing toward you (traveling wave down the corridor)
        float ringPhase = z * 0.48 - uTime * 14.0;
        float kickPulse = smoothstep(0.65, 0.96, sin(ringPhase)) * uKick * 2.5;
        r += kickPulse * 1.5;

        // Highs spark the surface
        float sparkHash = fract(sin(dot(vec2(aRing * 200.0, aPointId) + floor(uTime * 18.0) * 0.17, vec2(12.9898, 78.233))) * 43758.5453);
        float spark = smoothstep(0.82, 0.99, sparkHash) * (0.4 + uTre * 2.8);

        vec3 p = vec3(cos(angle) * r, sin(angle) * r, z);

        // Palette: Endless cyber corridor (deep sapphire -> electric cyan -> hot amber kick pulse -> diamond sparks)
        vec3 colDeep = vec3(0.06, 0.32, 0.85);
        vec3 colCyan = vec3(0.12, 0.86, 1.0);
        vec3 colKick = vec3(1.0, 0.52, 0.15);
        vec3 colSpark = vec3(0.98, 1.0, 1.0);

        vec3 c = mix(colDeep, colCyan, smoothstep(0.1, 0.7, nWall));
        c = mix(c, colKick, clamp(kickPulse * 0.85, 0.0, 1.0));
        c += colSpark * (spark * 1.5);

        c = mix(c, c.bgr, (uHue - 0.5) * 0.35);

        // Distance fog fade and fade out smoothly before reaching camera
        float depthFade = smoothstep(-120.0, -75.0, z) * (1.0 - smoothstep(-8.0, -1.0, z));

        vCol = c;
        vAlpha = (0.55 + kickPulse * 0.35 + spark * 0.45) * depthFade;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        float sz = (0.65 + kickPulse * 0.45 + spark * 0.6) * (1.0 + uEnergy * 0.25);
        gl_PointSize = clamp(sz * uPix * (65.0 / max(1.5, -mv.z)), 1.5, 7.5);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = 1.0 - smoothstep(0.12, 0.5, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    scene,
    camera,
    cam: { target: [0, 0, -40], radius: 40, pitch: 0, yaw: 0, fov: 72, lock: true },
    exposure: 1.05,
    brightThreshold: 0.88,
    grain: 0.0006,
    update(t, a, spec) {
      points.rotation.z = Math.sin(t * 0.25) * 0.06;
      points.position.x = Math.sin(t * 0.3) * 0.2;
      points.position.y = Math.cos(t * 0.22) * 0.15;

      const U = mat.uniforms;
      U.uTime.value = t;
      U.uBass.value = a.bass;
      U.uMid.value = a.mid;
      U.uTre.value = a.tre;
      U.uBeat.value = a.beat;
      U.uKick.value = a.kick;
      U.uSnare.value = a.snare;
      U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.20 + a.kick * 0.16 + a.energy * 0.10,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** FUTURIST / TRAPCODE FORM: Flux Aurora (Claude Artifact 12bdc766)
 * "Curtains of light that answer the music. Thirty thousand points woven into flowing
 * aurora sheets - bass swells the veils, energy whips them into a storm, the kick
 * throws a surge of light, highs shimmer the rays. Standard static-default camera, real audio."
 */
export function buildAurora(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x02070c, 0.014);
  const camera = new T.PerspectiveCamera(48, 1, 0.1, 220);

  // Thirty thousand points woven into 6 flowing aurora curtains (6 x 100 cols x 50 rows)
  const CURTAINS = 6;
  const COLS = 100;
  const ROWS = 50;
  const CNT = CURTAINS * COLS * ROWS; // 30,000 points
  const pos = new Float32Array(CNT * 3);
  const uvs = new Float32Array(CNT * 2);
  const curtainAttr = new Float32Array(CNT);

  let idx = 0;
  for (let c = 0; c < CURTAINS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = r / (ROWS - 1);
      for (let col = 0; col < COLS; col++) {
        const u = col / (COLS - 1);
        pos[idx * 3] = (u - 0.5) * 36.0;
        pos[idx * 3 + 1] = 0.5 + v * 14.5;
        pos[idx * 3 + 2] = -12.0 - c * 3.8;
        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = v;
        curtainAttr[idx] = c;
        idx++;
      }
    }
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aUv', new T.BufferAttribute(uvs, 2));
  geo.setAttribute('aCurtain', new T.BufferAttribute(curtainAttr, 1));

  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTre: { value: 0 },
      uBeat: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uEnergy: { value: 0 },
      uPix: { value: 1 },
      uHue: { value: 0.5 },
    },
    vertexShader: NOISE_GLSL + `
      uniform float uTime, uBass, uMid, uTre, uBeat, uKick, uSnare, uEnergy, uPix, uHue;
      attribute vec2 aUv;
      attribute float aCurtain;
      varying vec3 vCol;
      varying float vAlpha;

      void main() {
        float u = aUv.x;
        float v = aUv.y;
        float curtainId = aCurtain;

        float x0 = (u - 0.5) * 44.0;
        float y0 = 0.5 + v * 15.0;
        float z0 = -14.0 - curtainId * 4.5;

        // 1. Bass swells the veils (deep undulating drapery folds)
        float foldPhase = u * 6.5 + uTime * 0.22 + curtainId * 1.15;
        float fold = sin(foldPhase) + 0.45 * sin(u * 14.0 - uTime * 0.16 + curtainId * 0.6);
        float swell = 1.0 + uBass * 0.95;
        vec3 p = vec3(x0 + sin(foldPhase * 0.5) * 2.2, y0, z0);
        p.z += fold * (5.5 * swell);
        p.y += sin(u * 5.0 + uTime * 0.2 + curtainId) * (1.6 * swell);

        // 2. Energy whips them into a storm
        float storm = uEnergy * 2.8;
        vec3 turbCoord = vec3(u * 3.6, v * 2.2, uTime * (0.32 + storm * 0.5) + curtainId * 0.75);
        float turb = fbm3(turbCoord) * (1.0 + storm);
        p.x += sin(turb * 6.28) * (2.2 * uEnergy);
        p.z += turb * 3.8;
        p.y += cos(turb * 6.28) * (1.2 * uEnergy);

        // 3. Highs shimmer the rays (vertical streamers)
        float rayFreq = u * 95.0 + sin(u * 24.0) * 3.0 + curtainId * 12.0;
        float ray = pow(0.5 + 0.5 * sin(rayFreq + uTime * 1.3), 5.0);
        float shimmer = ray * (0.3 + uTre * 2.4);

        // 4. Kick throws a surge of light
        float kickSurge = uKick * 0.8;

        // Palette: Vibrant atmospheric aurora borealis
        vec3 colJade = vec3(0.04, 0.98, 0.46);
        vec3 colCyan = vec3(0.08, 0.72, 0.98);
        vec3 colViolet = vec3(0.72, 0.16, 0.86);
        vec3 colRay = vec3(0.88, 1.0, 0.96);

        // Vertical ribbon blend: Jade green base -> Cyan mid -> Violet ray crowns
        vec3 c = mix(colJade, colCyan, smoothstep(0.08, 0.48, v));
        c = mix(c, colViolet, smoothstep(0.42, 0.92, v));

        // Shimmer rays & kick surge
        c += colRay * (shimmer * 0.65);
        c *= (1.0 + kickSurge * 0.45);
        c += colJade * (kickSurge * 0.3);

        c = mix(c, c.bgr, (uHue - 0.5) * 0.4);

        // Curtain envelope: fade left/right edges, glow at lower hem, fade at top
        float horizFade = smoothstep(0.0, 0.15, u) * (1.0 - smoothstep(0.85, 1.0, u));
        float vertFade = smoothstep(0.0, 0.08, v) * (exp(-v * 1.4) * 0.9 + sin(v * 3.14159) * 0.35);

        vCol = c;
        vAlpha = horizFade * vertFade * (0.6 + shimmer * 0.4 + kickSurge * 0.3) * (0.7 + uEnergy * 0.3);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        float sz = (0.7 + shimmer * 0.5 + kickSurge * 0.35) * uPix * (52.0 / max(1.0, -mv.z));
        gl_PointSize = clamp(sz, 1.5, 7.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = 1.0 - smoothstep(0.12, 0.5, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  // Background stars
  const starsG = new T.BufferGeometry();
  const starPos: number[] = [];
  for (let i = 0; i < 280; i++) {
    const h = (n: number) => {
      const x = Math.sin(n * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    starPos.push((h(i + 1) - 0.5) * 90, h(i + 402) * 28 - 2, -35 - h(i + 800) * 45);
  }
  starsG.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
  const starsMat = new T.PointsMaterial({ color: 0x88bbcc, size: 0.05, transparent: true, opacity: 0.65 });
  const stars = new T.Points(starsG, starsMat);
  scene.add(stars);

  // Dark mountain horizon silhouette
  const terrain = new T.Shape();
  terrain.moveTo(-60, -15);
  terrain.lineTo(-60, -1.8);
  for (let i = 0; i <= 80; i++) {
    terrain.lineTo(-60 + (i * 120) / 80, -2.2 + Math.sin(i * 0.58) * 0.5 + Math.sin(i * 1.6) * 0.3);
  }
  terrain.lineTo(60, -15);
  terrain.closePath();
  const terrainGeo = new T.ShapeGeometry(terrain);
  const terrainMat = new T.MeshBasicMaterial({ color: 0x020509 });
  const terrainMesh = new T.Mesh(terrainGeo, terrainMat);
  terrainMesh.position.z = 2;
  scene.add(terrainMesh);

  return {
    scene,
    camera,
    // Standard static-default camera, real audio
    cam: { target: [0, 7, -22], radius: 24.0, pitch: 8, yaw: 0, fov: 50, lock: true },
    exposure: 1.05,
    brightThreshold: 0.82,
    grain: 0.0006,
    update(t, a, spec) {
      const U = mat.uniforms;
      U.uTime.value = t;
      U.uBass.value = a.bass;
      U.uMid.value = a.mid;
      U.uTre.value = a.tre;
      U.uBeat.value = a.beat;
      U.uKick.value = a.kick;
      U.uSnare.value = a.snare;
      U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.20 + a.mid * 0.14 + a.kick * 0.16,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      starsG.dispose();
      starsMat.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
    },
  };
}

/** CLASSICAL / SACRED SANCTUARY: The Sanctum (Claude Artifact 18c64bd2)
 * "Real-time, in the browser. A rendered scene, not a floating object - the sigil hangs
 * above a wet stone floor that catches its shadow and reflection, in a shaft of volumetric
 * light through drifting haze, with cinematic depth of field.
 * (bass -> light + swell, mid -> surface current, treble -> embers, beat -> the flare)."
 */
export function buildSanctum(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x06060c, 0.022);
  const camera = new T.PerspectiveCamera(44, 1, 0.1, 200);

  const disposables: any[] = [];
  const own = <A,>(x: A): A => { disposables.push(x); return x; };

  // 1. Wet Stone Floor catching shadow and reflection with procedural caustic surface current
  const floorGeo = own(new T.PlaneGeometry(42, 42, 120, 120));
  const floorMat = own(new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTre: { value: 0 },
      uBeat: { value: 0 },
      uKick: { value: 0 },
      uEnergy: { value: 0 },
      uHue: { value: 0.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: NOISE_GLSL + `
      uniform float uTime, uBass, uMid, uTre, uBeat, uKick, uEnergy, uHue;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vec2 uv = (vUv - 0.5) * 32.0;
        float dist = length(vWorldPos.xz);

        // mid -> surface current
        vec2 flow = vec2(sin(uTime * 0.6 + uv.y * 0.8), cos(uTime * 0.5 + uv.x * 0.8)) * (0.3 + uMid * 1.5);
        float caustics = pow(0.5 + 0.5 * sin(uv.x * 3.5 + uv.y * 3.0 + flow.x * 2.5), 3.0);
        caustics += 0.4 * pow(0.5 + 0.5 * sin(uv.x * 7.0 - uv.y * 6.0 - flow.y * 2.0), 4.0);

        // Wet obsidian stone base
        vec3 stoneBase = vec3(0.02, 0.025, 0.035);
        float stoneNoise = fbm3(vec3(uv * 0.25, 0.0));
        stoneBase += vec3(0.015, 0.018, 0.022) * stoneNoise;

        // Shadow directly cast under the hanging sigil
        float shadow = smoothstep(0.4, 3.2, dist);

        // Catching sigil reflection on wet floor
        float reflSpot = exp(-dist * 0.38) * (0.35 + caustics * 0.55 + uMid * 0.35);
        vec3 reflCol = mix(vec3(0.12, 0.65, 0.95), vec3(1.0, 0.82, 0.35), 0.5 + 0.5 * sin(uTime * 0.4));
        reflCol = mix(reflCol, vec3(1.0, 0.45, 0.12), uKick * 0.8);

        // Light shaft pool on the floor (bass -> light)
        float lightPool = exp(-dist * 0.24) * (0.4 + uBass * 0.75);
        vec3 shaftLight = vec3(0.95, 0.92, 0.82);

        vec3 col = stoneBase * shadow;
        col += shaftLight * lightPool * shadow * 0.6;
        col += reflCol * reflSpot;

        // Distance falloff
        col *= smoothstep(20.0, 4.0, dist);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  }));
  const floorMesh = new T.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  scene.add(floorMesh);

  // 2. Volumetric Light Shaft (bass -> light)
  const shaftGeo = own(new T.CylinderGeometry(1.2, 7.5, 20, 64, 32, true));
  const shaftMat = own(new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uEnergy: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: NOISE_GLSL + `
      uniform float uTime, uBass, uEnergy;
      varying vec3 vPos;
      varying vec2 vUv;

      void main() {
        // Drifting atmospheric haze
        float haze = fbm3(vec3(vPos.xz * 0.6, vPos.y * 0.25 - uTime * 0.16));
        // bass -> light
        float beamIntensity = (0.28 + uBass * 0.58 + uEnergy * 0.2) * (0.75 + haze * 0.45);

        // Soft vertical and radial falloff
        float vertFade = smoothstep(10.0, 1.0, vPos.y) * smoothstep(-10.0, -8.0, vPos.y);
        float edge = sin(vUv.x * 3.14159);

        vec3 lightCol = vec3(0.94, 0.91, 0.82);
        float alpha = beamIntensity * vertFade * (0.05 + edge * 0.22);

        gl_FragColor = vec4(lightCol, alpha * 0.32);
      }
    `,
  }));
  const shaftMesh = new T.Mesh(shaftGeo, shaftMat);
  shaftMesh.position.set(0, 9, 0);
  scene.add(shaftMesh);

  // 3. The Hanging Sigil (bass -> swell, beat -> the flare)
  const sigilGroup = new T.Group();
  sigilGroup.position.set(0, 4.0, 0);
  scene.add(sigilGroup);

  const goldMat = own(new T.MeshStandardMaterial({
    color: 0xdeb852,
    metalness: 0.9,
    roughness: 0.22,
    emissive: 0x8a6218,
    emissiveIntensity: 0.4,
  }));
  const obsidianMat = own(new T.MeshStandardMaterial({
    color: 0x14181f,
    metalness: 0.85,
    roughness: 0.15,
    emissive: 0x081e2e,
    emissiveIntensity: 0.3,
  }));
  const runeLineMat = own(new T.LineBasicMaterial({
    color: 0x8fe8ff,
    transparent: true,
    opacity: 0.75,
  }));

  // Concentric geometric rings
  const r1 = new T.Mesh(own(new T.TorusGeometry(1.9, 0.06, 16, 64)), goldMat);
  const r2 = new T.Mesh(own(new T.TorusGeometry(1.3, 0.045, 16, 64)), obsidianMat);
  const r3 = new T.Mesh(own(new T.TorusGeometry(0.75, 0.035, 16, 48)), goldMat);
  sigilGroup.add(r1, r2, r3);

  // Central suspended octahedron core
  const core = new T.Mesh(own(new T.OctahedronGeometry(0.48, 0)), obsidianMat);
  sigilGroup.add(core);

  // Inscribed sacred triangles / hexagram lines
  const hexPts: number[][] = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    hexPts.push([Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0]);
  }
  const hexGeo = own(new T.BufferGeometry().setFromPoints(hexPts.map(p => new T.Vector3(...p))));
  sigilGroup.add(new T.Line(hexGeo, runeLineMat));

  // Beat flare billboard (beat -> the flare)
  const flareGeo = own(new T.PlaneGeometry(5.2, 5.2));
  const flareMat = own(new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: {
      uFlare: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uFlare;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        if (r > 0.5) discard;
        float core = exp(-r * 8.0);
        float rays = pow(0.5 + 0.5 * cos(atan(p.y, p.x) * 8.0), 8.0) * exp(-r * 3.5);
        vec3 col = mix(vec3(0.5, 0.85, 1.0), vec3(1.0, 0.9, 0.6), uFlare);
        float alpha = (core * 1.4 + rays * 0.8) * uFlare;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  }));
  const flareMesh = new T.Mesh(flareGeo, flareMat);
  sigilGroup.add(flareMesh);

  // 4. Drifting Haze Embers (treble -> embers)
  const EMBER_COUNT = 2000;
  const emberPos = new Float32Array(EMBER_COUNT * 3);
  const emberBase = new Float32Array(EMBER_COUNT * 3);
  for (let i = 0; i < EMBER_COUNT; i++) {
    const rad = 0.6 + Math.random() * 4.6;
    const ang = Math.random() * Math.PI * 2;
    const y = Math.random() * 16.0;
    emberPos[i * 3] = Math.cos(ang) * rad;
    emberPos[i * 3 + 1] = y;
    emberPos[i * 3 + 2] = Math.sin(ang) * rad;

    emberBase[i * 3] = emberPos[i * 3];
    emberBase[i * 3 + 1] = y;
    emberBase[i * 3 + 2] = emberPos[i * 3 + 2];
  }

  const emberGeo = own(new T.BufferGeometry());
  emberGeo.setAttribute('position', new T.BufferAttribute(emberPos, 3));
  emberGeo.setAttribute('aBasePos', new T.BufferAttribute(emberBase, 3));

  const emberMat = own(new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uTre: { value: 0 },
      uKick: { value: 0 },
      uPix: { value: 1 },
    },
    vertexShader: NOISE_GLSL + `
      uniform float uTime, uTre, uKick, uPix;
      attribute vec3 aBasePos;
      varying vec3 vCol;
      varying float vAlpha;

      void main() {
        // treble -> embers speed and turbulence
        float speed = uTime * (1.2 + uTre * 3.6);
        float y = mod(aBasePos.y + speed, 16.0);

        float drift = fbm3(vec3(aBasePos.xz * 1.3, y * 0.45 + uTime * 0.2));
        vec3 p = vec3(aBasePos.x + sin(drift * 6.28) * (0.7 + uTre * 0.7), y, aBasePos.z + cos(drift * 6.28) * (0.7 + uTre * 0.7));

        // treble -> spark brightness
        float spark = 0.4 + uTre * 2.2 + uKick * 0.8;
        vec3 emberCol = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.85, 0.35), uTre);

        vCol = emberCol * spark;
        vAlpha = smoothstep(0.0, 1.5, y) * smoothstep(16.0, 12.0, y) * (0.35 + uTre * 0.45);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        float sz = (0.55 + uTre * 0.75 + uKick * 0.45);
        gl_PointSize = clamp(sz * uPix * (32.0 / max(0.1, -mv.z)), 1.0, 5.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  }));
  const emberPoints = new T.Points(emberGeo, emberMat);
  scene.add(emberPoints);

  // Background architectural silhouettes framing the sanctuary
  const colMat = own(new T.MeshBasicMaterial({ color: 0x05060b }));
  const colGeo = own(new T.CylinderGeometry(0.5, 0.6, 18, 16));
  for (let i = 0; i < 8; i++) {
    const a = (i / 7) * Math.PI * 1.1 - Math.PI * 0.55;
    const x = Math.sin(a) * 16.0;
    const z = -Math.cos(a) * 16.0 * 0.7 - 2.0;
    const col = new T.Mesh(colGeo, colMat);
    col.position.set(x, 9, z);
    scene.add(col);
    disposables.push(col);
  }

  return {
    scene,
    camera,
    cam: {
      target: [0, 3.8, 0],
      radius: 14.5,
      pitch: 4.0,
      yaw: 0,
      fov: 45,
      lock: true,
    },
    exposure: 1.02,
    brightThreshold: 0.85,
    grain: 0.0006,
    update(t, a, spec) {
      // Rotate and float sigil
      sigilGroup.rotation.y = t * 0.22;
      sigilGroup.rotation.x = Math.sin(t * 0.3) * 0.12;
      sigilGroup.position.y = 4.0 + Math.sin(t * 0.8) * 0.18;

      // bass -> swell
      const sigilSwell = 1.0 + (a?.bass ?? 0) * 0.32;
      sigilGroup.scale.setScalar(sigilSwell);

      // beat -> the flare
      const flareIntensity = (a?.kick ?? 0) * 1.2 + (a?.beat ?? 0) * 0.6;
      flareMat.uniforms.uFlare.value = Math.min(1.5, flareIntensity);
      flareMesh.quaternion.copy(camera.quaternion);

      goldMat.emissiveIntensity = 0.3 + (a?.bass ?? 0) * 0.7;
      obsidianMat.emissiveIntensity = 0.2 + (a?.tre ?? 0) * 0.6;
      runeLineMat.opacity = 0.5 + (a?.mid ?? 0) * 0.5;

      // Floor uniforms
      const FU = floorMat.uniforms;
      FU.uTime.value = t;
      FU.uBass.value = a?.bass ?? 0;
      FU.uMid.value = a?.mid ?? 0;
      FU.uTre.value = a?.tre ?? 0;
      FU.uBeat.value = a?.beat ?? 0;
      FU.uKick.value = a?.kick ?? 0;
      FU.uEnergy.value = a?.energy ?? 0;
      FU.uHue.value = spec?.hue ?? 0.5;

      // Shaft uniforms
      shaftMat.uniforms.uTime.value = t;
      shaftMat.uniforms.uBass.value = a?.bass ?? 0;
      shaftMat.uniforms.uEnergy.value = a?.energy ?? 0;

      // Embers uniforms
      emberMat.uniforms.uTime.value = t;
      emberMat.uniforms.uTre.value = a?.tre ?? 0;
      emberMat.uniforms.uKick.value = a?.kick ?? 0;
    },
    bloom: (a) => 0.35 + (a?.kick ?? 0) * 0.45 + (a?.energy ?? 0) * 0.2,
    dispose: () => {
      for (const d of disposables) {
        try { d.dispose?.(); } catch { /* */ }
      }
    },
  };
}
