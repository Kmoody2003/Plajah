// Rebuilt Flux Atelier Scenes — Trapcode Form point-cloud particle implementations.
// Porcelain Tide, Velvet Bloom, Prism Archive: geometry-accurate to mockup designs.
import type { SceneInst } from './flux';

const NOISE_GLSL = `
  float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float vnoise(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),u.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x),u.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x),u.y),u.z);}
  float fbm3(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.02+vec3(1.7,9.2,3.3);a*=.5;}return s;}
`;

// ════════════════════════════════════════════════════════════════════════════
// PORCELAIN TIDE — 45,000 dots in a sacred geometric mandala rosette
// ════════════════════════════════════════════════════════════════════════════
export function buildPorcelainTide(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x010408, 0.006);
  const camera = new T.PerspectiveCamera(46, 1, 0.1, 200);

  const CNT = 45000;
  const pos = new Float32Array(CNT * 3);
  const uvs = new Float32Array(CNT * 2);

  const phi = (1 + Math.sqrt(5)) / 2;
  const goldenAngle = Math.PI * 2 * (1 - 1 / phi);

  for (let i = 0; i < CNT; i++) {
    const t = i / CNT;
    const radius = Math.sqrt(t) * 13.0;
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
      varying vec3 vCol; varying float vAlpha;
      void main() {
        vec2 p0 = position.xy;
        float r = length(p0);
        float angle = atan(p0.y, p0.x);
        // Bass breathing expansion
        float breathe = 1.0 + uBass * 0.5 + uEnergy * 0.2;
        float eR = r * breathe;
        // Inner/outer counter-rotation driven by mid
        float rot = mix(uTime*0.4 + uMid*1.5, uTime*-0.2 + uMid*-0.8, smoothstep(0.0, 13.0, r));
        float newA = angle + rot;
        // Lattice pattern from noise
        float lattice = fbm3(vec3(cos(newA)*eR*0.4, sin(newA)*eR*0.4, uTime*0.12) * 2.5);
        float latticeLine = pow(0.5 + 0.5*sin(eR*4.0 + lattice*6.0), 5.0);
        // Ring glow (concentric rings)
        float ringGlow = pow(0.5 + 0.5*sin(eR*5.0), 6.0);
        // Treble sparks
        float sparkH = fract(sin(dot(vec2(aUv.x*400.0, aUv.y*300.0) + floor(uTime*12.0)*0.13, vec2(12.9898,78.233)))*43758.5453);
        float spark = smoothstep(0.92, 0.99, sparkH) * (0.5 + uTre*3.0);
        // Kick shockwave
        float kickW = sin(eR*2.5 - uTime*12.0) * uKick * 2.0 * exp(-r*0.15);
        // Z displacement
        float z = sin(eR*0.6 + lattice*3.0) * (1.0 + uBass*1.5) + kickW*0.6;
        vec3 p = vec3(cos(newA)*eR, sin(newA)*eR, z);
        // Vivid palette: electric cyan, sapphire, pure white, bright gold
        vec3 colCyan = vec3(0.0, 1.0, 1.0);
        vec3 colSapphire = vec3(0.1, 0.3, 1.0);
        vec3 colWhite = vec3(1.0, 1.0, 1.0);
        vec3 colGold = vec3(1.0, 0.82, 0.12);
        vec3 c = mix(colSapphire, colCyan, smoothstep(0.15, 0.65, lattice));
        c = mix(c, colWhite, latticeLine * (0.5 + uTre*0.5));
        c += colWhite * spark * 1.5;
        c = mix(c, colGold, smoothstep(0.3, 0.9, abs(kickW)) * uKick);
        c += colCyan * ringGlow * 0.8;
        // Brightness boost
        c *= 1.5;
        c = mix(c, c.bgr, (uHue-0.5)*0.3);
        float edgeFade = 1.0 - smoothstep(11.0, 13.5, r);
        vCol = c;
        vAlpha = (0.65 + latticeLine*0.35 + spark*0.5) * edgeFade * (0.8 + uEnergy*0.2);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.7 + latticeLine*0.8 + spark*0.6) * (1.0 + uEnergy*0.3);
        gl_PointSize = clamp(sz * uPix * (50.0 / max(0.5, -mv.z)), 1.0, 8.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard;
        float core = 1.0 - smoothstep(0.08, 0.45, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    scene, camera,
    cam: { target: [0,0,0], radius: 24, pitch: 38, yaw: 0, fov: 46 },
    exposure: 1.1, brightThreshold: 0.6, grain: 0.0005,
    update(t, a, spec) {
      points.rotation.z = t * 0.04;
      const U = mat.uniforms;
      U.uTime.value = t; U.uBass.value = a.bass; U.uMid.value = a.mid;
      U.uTre.value = a.tre; U.uKick.value = a.kick; U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.35 + a.kick * 0.2 + a.energy * 0.15,
    dispose: () => { geo.dispose(); mat.dispose(); },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// VELVET BLOOM — 50,000 dots shaped as a ROSE FLOWER
// Curved petal surfaces wrapping around center, viewed from above
// ════════════════════════════════════════════════════════════════════════════
export function buildVelvetBloom(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x060008, 0.006);
  const camera = new T.PerspectiveCamera(46, 1, 0.1, 200);

  // Rose parametric: 5 main petals x 3 layers = 15 petals total, each a curved sheet
  // Each petal: 100 rows along length x ~33 cols across width = 3333 dots/petal
  // 15 petals x 3333 ≈ 50,000
  const PETALS = 5;
  const LAYERS = 3;
  const ROWS = 100;  // along petal length (base to tip)
  const COLS = 33;   // across petal width
  const TOTAL_PETALS = PETALS * LAYERS;
  const CNT = TOTAL_PETALS * ROWS * COLS;
  const pos = new Float32Array(CNT * 3);
  const attrs = new Float32Array(CNT * 3); // petalId, u (length 0..1), v (width 0..1)

  let idx = 0;
  for (let layer = 0; layer < LAYERS; layer++) {
    const layerScale = 1.0 + layer * 0.8;  // outer petals are larger
    const layerTwist = layer * 0.45;         // each layer rotated slightly
    for (let petal = 0; petal < PETALS; petal++) {
      const baseAngle = (petal / PETALS) * Math.PI * 2 + layerTwist;
      const petalIdx = layer * PETALS + petal;
      for (let row = 0; row < ROWS; row++) {
        const u = row / (ROWS - 1);  // 0 = base (center), 1 = tip (outer)
        for (let col = 0; col < COLS; col++) {
          const v = col / (COLS - 1);  // 0..1 across width
          const vC = (v - 0.5) * 2.0;  // -1..1

          // Petal radial extent
          const petalR = u * 6.0 * layerScale;
          // Width envelope: widest in middle, tapers at base and tip
          const widthEnv = Math.sin(u * Math.PI) * 2.5 * layerScale;
          // Petal curl angle (wraps around the center like a real rose petal)
          const curl = u * u * 1.8 + layer * 0.3;
          const petalAngle = baseAngle + curl + vC * 0.15 * widthEnv / Math.max(0.5, petalR);

          // Z: inner petals cup upward steeply, outer petals flatter
          const cupHeight = (1.0 - u) * 4.0 * (1.0 - layer * 0.25);
          const petalCurve = Math.sin(u * Math.PI) * 1.5;

          pos[idx * 3] = Math.cos(petalAngle) * petalR;
          pos[idx * 3 + 1] = Math.sin(petalAngle) * petalR;
          pos[idx * 3 + 2] = cupHeight + petalCurve;
          attrs[idx * 3] = petalIdx;
          attrs[idx * 3 + 1] = u;
          attrs[idx * 3 + 2] = v;
          idx++;
        }
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
      attribute vec3 aPetal; // petalId, u (0..1 along length), v (0..1 across width)
      varying vec3 vCol; varying float vAlpha;
      void main() {
        float petalId = aPetal.x;
        float u = aPetal.y;  // 0=center, 1=tip
        float v = aPetal.z;
        float vC = (v - 0.5) * 2.0;
        float layer = floor(petalId / 5.0);
        float layerT = layer / 3.0;
        float layerScale = 1.0 + layer * 0.8;
        float layerTwist = layer * 0.45;
        float petal = mod(petalId, 5.0);
        float baseAngle = (petal / 5.0) * 6.28318 + layerTwist;

        // Bass swells petals open (breathing bloom)
        float openness = 0.55 + uBass * 0.45 + uEnergy * 0.15;
        // Mid drives curl animation
        float curlAnim = uTime * (0.08 + uMid * 0.15);
        float curl = u * u * (1.8 * openness) + layer * 0.3 + curlAnim;

        float petalR = u * 6.0 * layerScale * openness;
        float widthEnv = pow(sin(u * 3.14159), 0.65) * 2.5 * layerScale;
        float petalAngle = baseAngle + curl + vC * 0.15 * widthEnv / max(0.5, petalR);

        // Rose petal 3D cupping — inner petals stand tall, outer petals flatter
        float cupHeight = (1.0 - u) * 4.0 * (1.0 - layerT * 0.3) * (0.6 + (1.0 - openness) * 1.5);
        float petalCurve = sin(u * 3.14159) * (1.5 + uBass * 0.5);
        // Pleating (subtle ridges along the petal)
        float pleat = sin(vC * 20.0 + u * 4.0) * 0.08 * sin(u * 3.14159);

        float z = cupHeight + petalCurve + pleat + layer * 0.15;

        // Kick surge from center
        float kickSurge = uKick * 2.0 * exp(-u * 2.0);
        z += kickSurge * 0.5;

        vec3 p = vec3(cos(petalAngle) * petalR, sin(petalAngle) * petalR, z);

        // VIVID rose palette — hot pink, magenta, violet, fuchsia, rose-gold
        vec3 colHotPink = vec3(1.0, 0.15, 0.55);
        vec3 colMagenta = vec3(0.95, 0.0, 0.45);
        vec3 colViolet = vec3(0.7, 0.05, 1.0);
        vec3 colRoseGold = vec3(1.0, 0.65, 0.45);
        vec3 colFuchsia = vec3(1.0, 0.0, 0.85);
        vec3 colWhite = vec3(1.0, 0.9, 0.95);

        // Inner petals (low layer) glow bright hot pink, outer petals shift to magenta/violet
        vec3 c = mix(colHotPink, colMagenta, layerT);
        c = mix(c, colViolet, smoothstep(0.4, 0.9, layerT) * 0.6);

        // Petal edge highlights — bright fuchsia edges
        float edgeGlow = smoothstep(0.75, 1.0, abs(vC)) * (0.6 + uTre * 1.5);
        c = mix(c, colFuchsia, edgeGlow * 0.5);

        // Tip glow — bright rose-gold at the tips, driven by treble
        float tipGlow = smoothstep(0.6, 0.95, u) * (0.4 + uTre * 2.5);
        c = mix(c, colRoseGold, tipGlow * (1.0 - layerT * 0.4));

        // Center glow — white-hot inner petals
        float centerGlow = (1.0 - u) * (1.0 - layerT) * (0.6 + uEnergy * 0.8);
        c = mix(c, colWhite, centerGlow * 0.5);

        // Kick surge brightens everything from center
        c += colFuchsia * kickSurge * 0.6;
        c += colWhite * kickSurge * 0.25;

        // Overall brightness boost
        c *= 1.6;
        c = mix(c, c.bgr, (uHue - 0.5) * 0.35);

        // Alpha: fade at petal base, tip edges, and width borders
        float petalFade = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.93, 1.0, u));
        float widthFade = 1.0 - smoothstep(0.7, 1.0, abs(vC));

        vCol = c;
        vAlpha = petalFade * widthFade * (0.7 + tipGlow * 0.2 + kickSurge * 0.25) * (0.8 + uEnergy * 0.2);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.65 + tipGlow * 0.5 + centerGlow * 0.4 + kickSurge * 0.4) * (1.0 + uEnergy * 0.25);
        gl_PointSize = clamp(sz * uPix * (55.0 / max(0.5, -mv.z)), 1.0, 7.5);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard;
        float core = 1.0 - smoothstep(0.08, 0.45, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    scene, camera,
    cam: { target: [0, 0, 2.5], radius: 22, pitch: 55, yaw: 0, fov: 46 },
    exposure: 1.12, brightThreshold: 0.5, grain: 0.0005,
    update(t, a, spec) {
      points.rotation.z = t * 0.04;
      const U = mat.uniforms;
      U.uTime.value = t; U.uBass.value = a.bass; U.uMid.value = a.mid;
      U.uTre.value = a.tre; U.uKick.value = a.kick; U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.35 + a.kick * 0.22 + a.energy * 0.16,
    dispose: () => { geo.dispose(); mat.dispose(); },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PRISM ARCHIVE — 50,000 dots forming a DODECAHEDRON with inner ICOSAHEDRON
// Dots fill the triangular FACES of each polyhedron, with bright edges
// ════════════════════════════════════════════════════════════════════════════

// Dodecahedron and Icosahedron vertex data (platonic solids)
const ICO_VERTS: [number,number,number][] = [];
const DODEC_VERTS: [number,number,number][] = [];

// Generate icosahedron vertices (12 vertices)
{
  const t = (1 + Math.sqrt(5)) / 2;
  const n = Math.sqrt(1 + t * t);
  const iv: [number,number,number][] = [
    [-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],
    [0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],
    [t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1],
  ];
  iv.forEach(v => ICO_VERTS.push([v[0]/n, v[1]/n, v[2]/n]));
}

// Icosahedron faces (20 triangles)
const ICO_FACES = [
  [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
  [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
  [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
  [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
];

// Dodecahedron faces (12 pentagons) — vertices from icosahedron face centroids
{
  ICO_FACES.forEach(f => {
    const cx = (ICO_VERTS[f[0]][0] + ICO_VERTS[f[1]][0] + ICO_VERTS[f[2]][0]) / 3;
    const cy = (ICO_VERTS[f[0]][1] + ICO_VERTS[f[1]][1] + ICO_VERTS[f[2]][1]) / 3;
    const cz = (ICO_VERTS[f[0]][2] + ICO_VERTS[f[1]][2] + ICO_VERTS[f[2]][2]) / 3;
    const len = Math.sqrt(cx*cx + cy*cy + cz*cz);
    DODEC_VERTS.push([cx/len, cy/len, cz/len]);
  });
}

export function buildPrismArchive(T: any): SceneInst {
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x020108, 0.005);
  const camera = new T.PerspectiveCamera(46, 1, 0.1, 200);

  // Distribute dots on icosahedron faces (inner) and dodecahedron faces (outer)
  // Outer: 20 triangular faces x 1500 dots = 30,000
  // Inner: 20 triangular faces x 1000 dots = 20,000
  // Total: 50,000
  const OUTER_PER_FACE = 1500;
  const INNER_PER_FACE = 1000;
  const OUTER_TOTAL = 20 * OUTER_PER_FACE;  // 30,000
  const INNER_TOTAL = 20 * INNER_PER_FACE;  // 20,000
  const CNT = OUTER_TOTAL + INNER_TOTAL;
  const pos = new Float32Array(CNT * 3);
  const shellAttr = new Float32Array(CNT);   // 0=outer dodec, 1=inner ico
  const faceAttr = new Float32Array(CNT);    // face index for color
  const edgeDist = new Float32Array(CNT);    // distance to nearest edge (0..1)

  // Helper: fill triangle with random barycentric samples
  function fillFace(v0: number[], v1: number[], v2: number[], radius: number, startIdx: number, count: number, shellVal: number, faceIdx: number) {
    for (let i = 0; i < count; i++) {
      let r1 = Math.random(), r2 = Math.random();
      if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      const r3 = 1 - r1 - r2;
      const x = v0[0]*r1 + v1[0]*r2 + v2[0]*r3;
      const y = v0[1]*r1 + v1[1]*r2 + v2[1]*r3;
      const z = v0[2]*r1 + v1[2]*r2 + v2[2]*r3;
      // Project to sphere surface then scale
      const len = Math.sqrt(x*x + y*y + z*z);
      const j = startIdx + i;
      pos[j*3] = (x/len) * radius;
      pos[j*3+1] = (y/len) * radius;
      pos[j*3+2] = (z/len) * radius;
      shellAttr[j] = shellVal;
      faceAttr[j] = faceIdx;
      // Edge distance — minimum of barycentric coords (0 at edge, ~0.33 at center)
      edgeDist[j] = Math.min(r1, r2, r3) * 3.0; // normalize to 0..1
    }
  }

  // Outer dodecahedron — use icosahedron faces projected to larger radius
  let offset = 0;
  const R_OUTER = 9.0;
  for (let f = 0; f < 20; f++) {
    const face = ICO_FACES[f];
    fillFace(ICO_VERTS[face[0]], ICO_VERTS[face[1]], ICO_VERTS[face[2]], R_OUTER, offset, OUTER_PER_FACE, 0, f);
    offset += OUTER_PER_FACE;
  }
  // Inner icosahedron — same faces, smaller radius
  const R_INNER = 4.5;
  for (let f = 0; f < 20; f++) {
    const face = ICO_FACES[f];
    fillFace(ICO_VERTS[face[0]], ICO_VERTS[face[1]], ICO_VERTS[face[2]], R_INNER, offset, INNER_PER_FACE, 1, f);
    offset += INNER_PER_FACE;
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aShell', new T.BufferAttribute(shellAttr, 1));
  geo.setAttribute('aFace', new T.BufferAttribute(faceAttr, 1));
  geo.setAttribute('aEdge', new T.BufferAttribute(edgeDist, 1));

  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
      uTre: { value: 0 }, uKick: { value: 0 }, uEnergy: { value: 0 },
      uPix: { value: 1 }, uHue: { value: 0.5 },
    },
    vertexShader: `
      uniform float uTime, uBass, uMid, uTre, uKick, uEnergy, uPix, uHue;
      attribute float aShell, aFace, aEdge;
      varying vec3 vCol; varying float vAlpha;
      vec3 rotY(vec3 p, float a) { float c=cos(a),s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }
      vec3 rotX(vec3 p, float a) { float c=cos(a),s=sin(a); return vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z); }
      void main() {
        vec3 p0 = position;
        float isOuter = 1.0 - aShell;
        float isInner = aShell;
        // Bass swells outer, compresses inner
        float scale = mix(1.0 + uBass*0.45, 1.0 - uBass*0.15 + uEnergy*0.2, aShell);
        vec3 p = normalize(p0) * (length(p0) * scale);
        // Mid counter-rotates shells
        float rotAngle = mix(uTime*0.2 + uMid*0.5, -uTime*0.3 - uMid*0.7, aShell);
        float tiltAngle = mix(uTime*0.08, -uTime*0.12, aShell);
        p = rotY(p, rotAngle);
        p = rotX(p, tiltAngle + sin(uTime*0.2)*0.12);
        // EDGE detection — bright edges, dimmer face interiors
        float edge = 1.0 - smoothstep(0.0, 0.15, aEdge); // 1.0 at edges, 0.0 at face center
        // Rainbow prismatic color based on face index
        float spectrum = aFace / 20.0 + uTre * 0.1 + uTime * 0.02;
        vec3 c = 0.5 + 0.5 * cos(6.28318 * (spectrum + vec3(0.0, 0.33, 0.67)));
        // Boost saturation and vibrancy massively
        c = pow(c, vec3(0.55)) * 1.8;
        // Bright white-hot edges
        c += vec3(1.0, 0.95, 1.0) * edge * (0.8 + uTre * 1.5);
        // Kick prismatic flash — edges flare
        float kickFlash = uKick * edge * 2.5;
        c += vec3(1.0, 0.8, 0.95) * kickFlash;
        // Inner shell slightly brighter
        c *= (1.0 + isInner * 0.25);
        c = mix(c, c.bgr, (uHue-0.5)*0.25);
        vCol = c;
        // Alpha: edges always bright, faces semi-transparent
        float faceAlpha = mix(0.35, 0.85, edge);
        vAlpha = faceAlpha * (0.75 + uEnergy*0.25 + kickFlash*0.15);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.5 + edge * 1.0 + kickFlash * 0.5) * (1.0 + uEnergy*0.25);
        gl_PointSize = clamp(sz * uPix * (48.0 / max(0.5, -mv.z)), 1.0, 8.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard;
        float core = 1.0 - smoothstep(0.08, 0.45, r);
        gl_FragColor = vec4(vCol, core * vAlpha);
      }
    `,
  });

  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    scene, camera,
    cam: { target: [0,0,0], radius: 22, pitch: 10, yaw: 15, fov: 46 },
    exposure: 1.1, brightThreshold: 0.5, grain: 0.0005,
    update(t, a, spec) {
      const U = mat.uniforms;
      U.uTime.value = t; U.uBass.value = a.bass; U.uMid.value = a.mid;
      U.uTre.value = a.tre; U.uKick.value = a.kick; U.uEnergy.value = a.energy;
      U.uHue.value = spec.hue;
    },
    bloom: (a) => 0.38 + a.kick * 0.22 + a.tre * 0.18,
    dispose: () => { geo.dispose(); mat.dispose(); },
  };
}
