import type { SceneInst } from '../flux';
import type { FluxDriven, FluxSpec } from '../../../../../services/fabula/fluxNode';

/**
 * Egyptian Temple — rebuilt from the "Culture visualizers" clips
 * (Egyptian_hieroglyphs_glowing_wit…, Glowing_hieroglyphs_shifting_on_…).
 *
 * A wall of sandstone blocks under a warm raking light. Every block face is a carved panel of real
 * hieroglyphs (Noto Sans Egyptian Hieroglyphs) cut as SUNK RELIEF: the glyphs are rendered into a
 * height map at load, converted to a normal map, so the light catches every carving; the same glyph
 * mask drives a gold emissive that is TRACED across each panel (light runs along the carving).
 * Physically-based material + real shadow maps, so blocks that push out cast shadows on the wall.
 *
 * Moments from the clips, conducted by the music:
 *  - kicks push blocks out of the wall in a travelling wave; random blocks pop and settle;
 *  - voice traces glowing glyphs; builds light more and more of the wall;
 *  - snares launch rings of gold light that expand and crackle;
 *  - sections alternate: glyph tracing · rings · obelisks rising from the floor with glowing glyph
 *    columns · the Eye of Horus drawing itself in light · the whole wall igniting from the centre;
 *  - a drop = full ignition + light burst + obelisks; dust drifts through the light shafts.
 * The shared Flux director frames it (cam not locked): dollies along the wall, grazing orbits that
 * show the relief, push-ins on a single panel.
 */

const COLS = 16, ROWS = 9, BW = 1.24, BH = 0.86, BD = 0.7, GAP = 0.03;
const CELLS = 4;           // atlas is CELLS × CELLS carved panels
const ATLAS = 2048, CELL = ATLAS / CELLS;
const FONT = "'Noto Sans Egyptian Hieroglyphs'";
const GLYPHS = [
  0x132F9, 0x13080, 0x13079, 0x131A3, 0x13143, 0x13153, 0x1313F, 0x131CB, 0x13216, 0x1308B, 0x130A7, 0x13193,
  0x130ED, 0x132BD, 0x13300, 0x131F3, 0x13000, 0x1305F, 0x13071, 0x1309D, 0x130C0, 0x13171, 0x1317F, 0x13191,
  0x131B1, 0x131E0, 0x13209, 0x1321B, 0x13254, 0x1328F, 0x132AA, 0x132D4, 0x13362, 0x13377, 0x133CF, 0x1340D,
].map(c => String.fromCodePoint(c));

function ensureFont() {
  if (typeof document === 'undefined' || document.querySelector('link[data-egypt-font]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.setAttribute('data-egypt-font', '1');
  l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Egyptian+Hieroglyphs&display=swap';
  document.head.appendChild(l);
}

/** Paint the carved panels: albedo, height → normal, and a glow mask whose G channel is the trace order. */
function paintAtlas(THREE: any, tex: { alb: any; nor: any; msk: any }, fontOk: boolean) {
  const rnd = (() => { let s = 1234567; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const hc = document.createElement('canvas'); hc.width = hc.height = ATLAS;
  const h = hc.getContext('2d', { willReadFrequently: true })!;
  h.fillStyle = '#fff'; h.fillRect(0, 0, ATLAS, ATLAS);
  const glyph = (x: number, y: number, size: number) => {
    // Bold, deep carvings like the clips: stroke + fill so the font's hairlines become cut channels.
    if (fontOk) { const g = GLYPHS[Math.floor(rnd() * GLYPHS.length)]; h.font = `${size}px ${FONT}`; h.lineJoin = 'round'; h.lineWidth = Math.max(4, size * 0.055); h.strokeStyle = h.fillStyle as string; h.strokeText(g, x, y); h.fillText(g, x, y); return; }
    // Fallback carving if the hieroglyph font can't load: ankh / eye / reed shapes.
    const k = Math.floor(rnd() * 3), s = size * 0.42; h.lineWidth = size * 0.09; h.strokeStyle = h.fillStyle as string;
    h.beginPath();
    if (k === 0) { h.ellipse(x, y - s * 0.9, s * 0.35, s * 0.5, 0, 0, Math.PI * 2); h.moveTo(x - s * 0.6, y - s * 0.3); h.lineTo(x + s * 0.6, y - s * 0.3); h.moveTo(x, y - s * 0.4); h.lineTo(x, y + s); }
    else if (k === 1) { h.ellipse(x, y, s * 0.8, s * 0.4, 0, 0, Math.PI * 2); h.moveTo(x - s * 0.2, y); h.arc(x, y, s * 0.2, 0, Math.PI * 2); h.moveTo(x, y + s * 0.4); h.lineTo(x - s * 0.3, y + s); }
    else { h.moveTo(x, y + s); h.lineTo(x, y - s); h.lineTo(x + s * 0.4, y - s * 0.6); }
    h.stroke();
  };
  h.textAlign = 'center'; h.textBaseline = 'middle';
  // Panels: registers of glyphs separated by incised lines, the last cell is plain stone (block sides).
  for (let c = 0; c < CELLS * CELLS; c++) {
    const ox = (c % CELLS) * CELL, oy = Math.floor(c / CELLS) * CELL;
    if (c === CELLS * CELLS - 1) continue;
    h.fillStyle = '#7a7a7a'; h.strokeStyle = '#7a7a7a';
    const vertical = rnd() < 0.5, big = rnd() < 0.18;
    h.lineWidth = 5;
    if (big) {
      glyph(ox + CELL / 2, oy + CELL / 2 + 10, CELL * 0.72);
      h.strokeRect(ox + 26, oy + 26, CELL - 52, CELL - 52);
    } else if (vertical) {
      const n = 3, cw = (CELL - 40) / n;
      for (let i = 0; i < n; i++) {
        if (i) { h.beginPath(); h.moveTo(ox + 20 + i * cw, oy + 20); h.lineTo(ox + 20 + i * cw, oy + CELL - 20); h.stroke(); }
        for (let j = 0; j < 3; j++) glyph(ox + 20 + cw * (i + 0.5), oy + 40 + (CELL - 80) * (j + 0.5) / 3, cw * 0.78);
      }
    } else {
      const n = 2, rh = (CELL - 40) / n;
      for (let i = 0; i < n; i++) {
        if (i) { h.beginPath(); h.moveTo(ox + 20, oy + 20 + i * rh); h.lineTo(ox + CELL - 20, oy + 20 + i * rh); h.stroke(); }
        for (let j = 0; j < 3; j++) glyph(ox + 40 + (CELL - 80) * (j + 0.5) / 3, oy + 20 + rh * (i + 0.5), rh * 0.78);
      }
    }
  }
  // Soft carving edges.
  const sc = document.createElement('canvas'); sc.width = sc.height = ATLAS;
  const s = sc.getContext('2d', { willReadFrequently: true })!;
  s.filter = 'blur(4.5px)'; s.drawImage(hc, 0, 0); s.filter = 'none';
  const hd = s.getImageData(0, 0, ATLAS, ATLAS).data, sharp = h.getImageData(0, 0, ATLAS, ATLAS).data;
  const N = ATLAS * ATLAS, height = new Float32Array(N);
  // Stone noise (value noise, cheap) so the faces aren't flat.
  const noise = (x: number, y: number) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < N; i++) {
    const x = i % ATLAS, y = (i / ATLAS) | 0;
    const g = hd[i * 4] / 255;                       // 1 = surface, darker = carved
    const n = noise(x >> 3, y >> 3) * 0.04 + noise(x >> 1, y >> 1) * 0.015;
    height[i] = g * 0.9 + n;
  }
  const alb = new ImageData(ATLAS, ATLAS), nor = new ImageData(ATLAS, ATLAS), msk = new ImageData(ATLAS, ATLAS);
  for (let i = 0; i < N; i++) {
    const x = i % ATLAS, y = (i / ATLAS) | 0;
    const xl = height[y * ATLAS + Math.max(0, x - 1)], xr = height[y * ATLAS + Math.min(ATLAS - 1, x + 1)];
    const yu = height[Math.max(0, y - 1) * ATLAS + x], yd = height[Math.min(ATLAS - 1, y + 1) * ATLAS + x];
    let nx = (xl - xr) * 11, ny = (yu - yd) * 11, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    nor.data[i * 4] = (nx * 0.5 + 0.5) * 255; nor.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nor.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nor.data[i * 4 + 3] = 255;
    const carved = 1 - sharp[i * 4] / 255, n2 = noise(x >> 2, y >> 2);
    const base = 0.6 + n2 * 0.14 - (1 - hd[i * 4] / 255) * 0.5;
    alb.data[i * 4] = 196 * base; alb.data[i * 4 + 1] = 158 * base; alb.data[i * 4 + 2] = 116 * base; alb.data[i * 4 + 3] = 255;
    // Trace order: a diagonal sweep inside each panel with a little jitter, so light "runs" along it.
    const cx = (x % CELL) / CELL, cy = (y % CELL) / CELL;
    msk.data[i * 4] = Math.min(255, carved * 2 * 255); msk.data[i * 4 + 1] = Math.min(255, (cx * 0.55 + cy * 0.45 + n2 * 0.06) * 255);
    msk.data[i * 4 + 2] = 0; msk.data[i * 4 + 3] = 255;
  }
  const toTex = (img: ImageData, srgb: boolean, prev: any) => {
    const c = document.createElement('canvas'); c.width = c.height = ATLAS; c.getContext('2d')!.putImageData(img, 0, 0);
    if (prev) { prev.image = c; prev.needsUpdate = true; return prev; }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  tex.alb = toTex(alb, true, tex.alb); tex.nor = toTex(nor, false, tex.nor); tex.msk = toTex(msk, false, tex.msk);
}

export function buildEgypt(THREE: any, renderer: any): SceneInst {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0703');
  scene.fog = new THREE.FogExp2('#0b0703', 0.035);
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 120);
  const owned: any[] = []; const own = <T>(x: T) => { owned.push(x); return x; };
  try { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch { /* */ }

  // ── carved panel textures (placeholder first, real glyphs once the font is in) ──
  const tex: any = { alb: null, nor: null, msk: null };
  ensureFont();
  paintAtlas(THREE, tex, false);
  const fontSpec = `120px ${FONT}`;
  (document as any).fonts?.load?.(fontSpec, GLYPHS[0]).then(() => {
    if ((document as any).fonts.check(fontSpec, GLYPHS[0])) paintAtlas(THREE, tex, true);
  }).catch(() => {});

  // ── the wall: instanced blocks with a per-instance panel, push, glow and trace ──
  const N = COLS * ROWS;
  const geo = own(new THREE.BoxGeometry(BW - GAP, BH - GAP, BD, 1, 1, 1));
  const iCell = new Float32Array(N), iGlow = new Float32Array(N), iTrace = new Float32Array(N), iFlip = new Float32Array(N);
  const rnd = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < N; i++) { iCell[i] = Math.floor(rnd() * (CELLS * CELLS - 1)); iFlip[i] = rnd() < 0.5 ? 1 : 0; }
  const aCell = new THREE.InstancedBufferAttribute(iCell, 1), aGlow = new THREE.InstancedBufferAttribute(iGlow, 1), aTrace = new THREE.InstancedBufferAttribute(iTrace, 1), aFlip = new THREE.InstancedBufferAttribute(iFlip, 1);
  aGlow.setUsage(THREE.DynamicDrawUsage); aTrace.setUsage(THREE.DynamicDrawUsage); aCell.setUsage(THREE.DynamicDrawUsage);
  const uTimeU = { value: 0 }, uVoiceU = { value: 0 };
  geo.setAttribute('iCell', aCell); geo.setAttribute('iGlow', aGlow); geo.setAttribute('iTrace', aTrace); geo.setAttribute('iFlip', aFlip);
  const stone = own(new THREE.MeshStandardMaterial({
    map: tex.alb, normalMap: tex.nor, emissiveMap: tex.msk, emissive: new THREE.Color('#ffb347'), emissiveIntensity: 1.8,
    roughness: 0.86, metalness: 0.0, normalScale: new THREE.Vector2(1.6, 1.6),
  }));
  stone.onBeforeCompile = (sh: any) => {
    sh.uniforms.uTime = uTimeU; sh.uniforms.uVoice = uVoiceU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float iCell; attribute float iGlow; attribute float iTrace; attribute float iFlip;
        uniform float uTime, uVoice;
        varying vec2 vCellUv; varying float vGlowAmt; varying float vTraceAmt; varying float vFront; varying float vSeed;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vFront = step(0.5, normal.z);
        float cell = vFront > 0.5 ? iCell : ${(CELLS * CELLS - 1).toFixed(1)};
        vec2 cuv = uv; if (iFlip > 0.5) cuv.x = 1.0 - cuv.x;
        // Symbols drift and breathe inside their stone (more with the voice).
        float sd = iCell * 1.37 + float(gl_InstanceID) * 0.618;
        vec2 cc = cuv - 0.5; float ang = sin(uTime * 0.6 + sd * 6.0) * (0.025 + uVoice * 0.05);
        cc = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * cc * (1.0 - 0.035 * sin(uTime * 1.1 + sd * 4.0) - uVoice * 0.04);
        cc += vec2(sin(uTime * 0.45 + sd * 3.0), cos(uTime * 0.38 + sd * 5.0)) * 0.012;
        cuv = cc + 0.5; vSeed = sd;
        cuv = mix(vec2(0.04), vec2(0.96), clamp(cuv, 0.0, 1.0));
        vCellUv = (vec2(mod(cell, ${CELLS.toFixed(1)}), floor(cell / ${CELLS.toFixed(1)})) + vec2(cuv.x, 1.0 - cuv.y)) / ${CELLS.toFixed(1)};
        vCellUv.y = 1.0 - vCellUv.y;
        vGlowAmt = iGlow; vTraceAmt = iTrace;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uVoice;
        varying vec2 vCellUv; varying float vGlowAmt; varying float vTraceAmt; varying float vFront; varying float vSeed;`)
      .replace(/vMapUv/g, 'vCellUv').replace(/vNormalMapUv/g, 'vCellUv').replace(/vEmissiveMapUv/g, 'vCellUv')
      .replace('#include <emissivemap_fragment>', `
        vec4 emSample = texture2D( emissiveMap, vCellUv );
        float rev = smoothstep(emSample.g - 0.04, emSample.g + 0.02, vTraceAmt);
        // A gold glint travels along every carving, so even unlit symbols shimmer as it passes.
        float glint = pow(max(0.0, sin(emSample.g * 14.0 - uTime * 2.2 + vSeed * 3.0)), 24.0) * (0.07 + uVoice * 0.4);
        totalEmissiveRadiance *= emSample.r * vFront * (rev * vGlowAmt + glint);`);
  };
  const wall = own(new THREE.InstancedMesh(geo, stone, N));
  wall.castShadow = true; wall.receiveShadow = true; wall.frustumCulled = false;
  scene.add(wall);
  const home: { x: number; y: number }[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const off = (r % 2) * BW * 0.5;
    home.push({ x: (c - (COLS - 1) / 2) * BW + off - BW * 0.25, y: (r - (ROWS - 1) / 2) * BH });
  }
  // back plate so gaps read as deep joints
  const back = own(new THREE.Mesh(own(new THREE.PlaneGeometry(40, 20)), own(new THREE.MeshStandardMaterial({ color: '#2a1a0c', roughness: 1 }))));
  back.position.z = -BD / 2 - 0.02; back.receiveShadow = true; scene.add(back);
  const floor = own(new THREE.Mesh(own(new THREE.PlaneGeometry(60, 30)), own(new THREE.MeshStandardMaterial({ color: '#3a2714', roughness: 0.95 }))));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -ROWS * BH / 2 - 0.02, 6); floor.receiveShadow = true; scene.add(floor);

  // ── light: a warm raking key that sweeps slowly, a dim fill ──
  const key = own(new THREE.SpotLight('#ffcf8a', 1.5, 0, 0.5, 0.75, 0));
  key.position.set(-15, 6, 5.5); key.target.position.set(1, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 2; key.shadow.camera.far = 40;
  scene.add(key); scene.add(key.target);
  scene.add(own(new THREE.HemisphereLight('#ffd9a0', '#1a0f06', 0.07)));
  const glowLight = own(new THREE.PointLight('#ffb040', 0, 12, 1.6)); glowLight.position.set(0, 0, 2.5); scene.add(glowLight);

  // ── rings of light (snares) ──
  const ringMat = own(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uA; varying vec2 vUv;
      float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
      void main(){
        float a = vUv.x * 64.0, crackle = 0.55 + 0.45 * h(floor(a + uTime * 30.0));
        float band = exp(-pow((vUv.y - 0.5) * 6.0, 2.0));
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.32) * 3.2 * band * crackle * uA, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.035, 8, 128)), ringMat.clone());
    owned.push(m.material); m.visible = false; scene.add(m);
    return { m, age: 9, x: 0, y: 0 };
  });

  // ── obelisks (rise on obelisk sections and drops) ──
  const obeliskMat = stone.clone(); owned.push(obeliskMat);
  obeliskMat.onBeforeCompile = stone.onBeforeCompile;
  const obGeo = own(new THREE.BoxGeometry(0.95, 6.4, 0.95));
  const capGeo = own(new THREE.ConeGeometry(0.68, 0.9, 4)); capGeo.rotateY(Math.PI / 4);
  const obelisks = [-6.2, -3.4, 3.4, 6.2].map((x, i) => {
    const g = new THREE.Group();
    const bodyGeo = obGeo.clone(); owned.push(bodyGeo);
    const ci = new Float32Array([3 + i]), gl = new Float32Array([0]), tr = new Float32Array([1]), fl = new Float32Array([0]);
    // single-instance attributes so the obelisk uses the same carved shader
    bodyGeo.setAttribute('iCell', new THREE.InstancedBufferAttribute(ci, 1)); bodyGeo.setAttribute('iGlow', new THREE.InstancedBufferAttribute(gl, 1));
    bodyGeo.setAttribute('iTrace', new THREE.InstancedBufferAttribute(tr, 1)); bodyGeo.setAttribute('iFlip', new THREE.InstancedBufferAttribute(fl, 1));
    const body = new THREE.InstancedMesh(bodyGeo, obeliskMat, 1); body.setMatrixAt(0, new THREE.Matrix4()); body.castShadow = true; body.frustumCulled = false;
    const cap = new THREE.Mesh(capGeo, own(new THREE.MeshStandardMaterial({ color: '#d9a441', metalness: 0.9, roughness: 0.25, emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0 })));
    cap.position.y = 3.65; g.add(body); g.add(cap);
    g.position.set(x, -14, 3.2 - Math.abs(x) * 0.12); scene.add(g);
    return { g, glow: gl, glowAttr: body.geometry.getAttribute('iGlow'), cap, y: -14 };
  });

  // ── Eye of Horus drawn in light ──
  const eyePts = [
    [-1.6, 0], [-1.0, 0.45], [0, 0.62], [1.0, 0.42], [1.7, 0.05], [1.0, -0.28], [0, -0.42], [-1.0, -0.3], [-1.6, 0],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const eyeCurve = new THREE.CatmullRomCurve3(eyePts, false, 'catmullrom', 0.4);
  const browCurve = new THREE.CatmullRomCurve3([[-1.7, 0.95], [-0.4, 1.15], [1.0, 1.05], [1.9, 0.8]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const tailCurve = new THREE.CatmullRomCurve3([[0.1, -0.42], [0.0, -1.0], [-0.35, -1.5], [-0.8, -1.55], [-0.95, -1.25], [-0.7, -1.05]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const dropCurve = new THREE.CatmullRomCurve3([[0.55, -0.38], [0.65, -1.05], [0.95, -1.6]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const lineMat = own(new THREE.ShaderMaterial({
    uniforms: { uProg: { value: 0 }, uA: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uProg, uA, uTime; varying vec2 vUv;
      void main(){
        float on = smoothstep(uProg, uProg - 0.04, vUv.x);
        float head = exp(-pow((vUv.x - uProg) * 40.0, 2.0)) * 2.0;
        gl_FragColor = vec4(vec3(1.0, 0.75, 0.35) * (2.6 * on + head) * uA, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  const eye = new THREE.Group(); eye.renderOrder = 10;
  [eyeCurve, browCurve, tailCurve, dropCurve].forEach(cv => eye.add(new THREE.Mesh(own(new THREE.TubeGeometry(cv, 160, 0.045, 8, false)), lineMat)));
  const pupil = new THREE.Mesh(own(new THREE.CircleGeometry(0.26, 48)), own(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 0.9), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
  eye.add(pupil);
  eye.position.set(0, 0.2, BD / 2 + 1.1); eye.scale.setScalar(1.1); eye.visible = false; scene.add(eye);

  // ── dust in the light ──
  const DUST = 700;
  const dPos = new Float32Array(DUST * 3), dSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { dPos[i * 3] = (rnd() - 0.5) * 22; dPos[i * 3 + 1] = (rnd() - 0.5) * 10; dPos[i * 3 + 2] = rnd() * 7 + 0.3; dSeed[i] = rnd(); }
  const dGeo = own(new THREE.BufferGeometry()); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dGeo.setAttribute('seed', new THREE.BufferAttribute(dSeed, 1));
  const dMat = own(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSpark: { value: 0 } },
    vertexShader: `attribute float seed; uniform float uTime, uSpark; varying float vA;
      void main(){ vec3 p = position; p.y = mod(p.y + uTime * (0.08 + seed * 0.12) + 5.0, 10.0) - 5.0; p.x += sin(uTime * 0.3 + seed * 20.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float tw = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (2.0 + seed * 4.0) + seed * 40.0), 6.0) * (1.0 + uSpark * 2.0);
        vA = tw; gl_PointSize = (2.0 + seed * 3.0) * (6.0 / -mv.z); }`,
    fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d, d) * 18.0); gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * a * vA * 0.9, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(own(new THREE.Points(dGeo, dMat)));


  // ── state ──
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  const push = new Float32Array(N), pop = new Float32Array(N), flip = new Float32Array(N).fill(9), flipAx = new Float32Array(N), nextCell = new Float32Array(N), lvl = new Float32Array(COLS);
  const xAx = new THREE.Vector3(1, 0, 0), yAx = new THREE.Vector3(0, 1, 0);
  let last = -1, clock = 0, section = -1, mode = 'trace', modeT = 0, prevSnare = 0, prevKick = 0, ignite = 0, burst = 0;
  let eF = 0, eS = 0, lastDrop = -99, waveX = 0, waveY = 0, waveR = 99, traceHead = 0;
  const MODES = ['trace', 'rings', 'obelisks', 'eye', 'trace', 'ignite'];
  const HELD = ['trace', 'rings', 'obelisks', 'eye', 'ignite'];
  const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  return {
    scene, camera,
    cam: { target: [0, 0, 0], radius: 9.5, pitch: 2, yaw: 0, fov: 42 },
    exposure: 1.05, brightThreshold: 0.9, grain: 0.018,
    update(t: number, a: FluxDriven, spec: FluxSpec) {
      const fresh = last < 0 || t < last || t - last > 2;
      if (fresh) { clock = 0; section = -1; ignite = 0; burst = 0; lastDrop = -99; }
      const dt = last < 0 ? 1 / 60 : Math.min(0.2, Math.max(0, t - last)); last = t;
      const kick = a.kick ?? 0, snare = a.snare ?? 0, bass = a.bass, voice = a.voice ?? 0, tre = a.tre;
      const energy = Math.min(1, a.intensity ?? a.energy ?? 0);
      clock += dt * (0.8 + energy * 0.6);
      const beats = (a.tempoConfidence ?? 0) > 0.3 && Number.isFinite(a.beatPosition) ? (a.beatPosition as number) : clock * 2;
      const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
      if (fresh) { eF = eS = energy; }   // no false 'drop' on the first frames
      eF += (energy - eF) * k1(0.35); eS += (energy - eS) * k1(8);
      const build = Math.min(1, Math.max(0, (eF - eS) * 4));
      const drop = eF - eS > 0.25 && beats - lastDrop > 16 && beats > 8;
      if (drop) { lastDrop = beats; ignite = 1; burst = 1; }

      // Sections every 4 bars, in the clips' order.
      const sec = Math.floor(beats / 16);
      // spec.decoSeed >= 0 holds one section (the shared "hold" control): 0 trace · 1 rings · 2 obelisks · 3 eye · 4 ignite.
      const held = typeof spec.decoSeed === 'number' && spec.decoSeed >= 0 ? HELD[Math.floor(spec.decoSeed) % HELD.length] : null;
      if (held) { if (mode !== held) { mode = held; modeT = 0; traceHead = 0; } if (held === 'ignite' && modeT < dt * 2) ignite = 1; }
      else if (sec !== section) { section = sec; mode = drop ? 'ignite' : MODES[Math.max(0, sec) % MODES.length]; modeT = 0; traceHead = 0; if (mode === 'ignite') ignite = Math.max(ignite, 0.6); }
      modeT += dt;

      // Kick: a push wave across the wall from a random origin, plus random pops.
      const kickHit = kick > 0.55 && prevKick <= 0.55; prevKick = kick;
      const startFlip = (i: number) => { if (flip[i] < 1) return; flip[i] = 0; flipAx[i] = hash(i + t) < 0.5 ? 0 : 1; nextCell[i] = Math.floor(hash(i * 1.3 + t * 7.7) * (CELLS * CELLS - 1)); };
      if (kickHit) {
        waveX = (hash(t) - 0.5) * COLS * BW * 0.8; waveY = (hash(t * 1.7) - 0.5) * ROWS * BH * 0.6; waveR = 0;
        for (let k = 0; k < 6; k++) pop[Math.floor(hash(t * (k + 2.3)) * N)] = 1;
        for (let k = 0; k < 2 + Math.round(energy * 4); k++) startFlip(Math.floor(hash(t * (k + 5.1)) * N));
      }
      waveR += dt * 9;
      const snareHit = snare > 0.45 && prevSnare <= 0.45; prevSnare = snare;
      if (snareHit) { const row = Math.floor(hash(t * 9.3) * ROWS); for (let c = 0; c < COLS; c += 2 + Math.floor(hash(t + c) * 2)) startFlip(row * COLS + c); }
      // The voice keeps a slow trickle of symbols turning over.
      if (hash(t * 13.7) < dt * (0.6 + voice * 6)) startFlip(Math.floor(hash(t * 17.3) * N));
      if (snareHit || (mode === 'rings' && kickHit)) {
        const r = rings.reduce((o, x) => (x.age > o.age ? x : o), rings[0]);
        r.age = 0; r.x = (hash(t * 3.1) - 0.5) * 8; r.y = (hash(t * 4.7) - 0.5) * 3; r.m.visible = true;
      }
      ignite *= Math.exp(-dt / 2.2); burst *= Math.exp(-dt / 0.5);
      traceHead += dt * (0.25 + voice * 0.9 + energy * 0.2);

      // Blocks: push (wave + pops + bass breathing), glow (voice / build / ignition from the centre), trace.
      // Spectrum wall: centre columns are the lows (kick + bass), moving out through voice / mids to the
      // snare + treble at the edges. Each column's level fills rows out from the centre row, like an EQ.
      const src = [Math.min(1.2, bass * 1.1 + kick * 0.8), bass, (a.mid + voice) * 0.75, a.mid, Math.min(1.2, tre * 1.2 + snare * 0.9), tre * 1.1];
      for (let c = 0; c < COLS; c++) {
        const u = Math.abs(c - (COLS - 1) / 2) / ((COLS - 1) / 2) * (src.length - 1), j = Math.min(src.length - 2, Math.floor(u)), f = u - j;
        const v = (src[j] * (1 - f) + src[j + 1] * f) * (0.85 + 0.3 * hash(c * 3.7 + Math.floor(beats)));
        lvl[c] += (v - lvl[c]) * k1(v > lvl[c] ? 0.03 : 0.16);
      }
      const igniteR = (1 - ignite) * 14;
      for (let i = 0; i < N; i++) {
        const hp = home[i], d = Math.hypot(hp.x - waveX, hp.y - waveY);
        const col = i % COLS, row = Math.floor(i / COLS);
        const wave = Math.exp(-Math.pow((d - waveR) * 1.4, 2)) * (0.35 + kick * 0.8);
        pop[i] *= Math.exp(-dt / 0.6);
        const L = lvl[col], reach = L * (ROWS / 2 + 0.5), rd = Math.abs(row - (ROWS - 1) / 2);
        const eq = (rd < reach ? 0.55 * L * (1 - rd / (reach + 1) * 0.5) : 0.08 * L);
        const target = eq + wave * 0.5 + pop[i] * 0.6;
        push[i] += (target - push[i]) * k1(target > push[i] ? 0.035 : 0.12);
        // Tumble: the block pushes out, turns a full revolution and lands showing a new symbol.
        let z = push[i];
        if (flip[i] < 1) {
          const prev = flip[i]; flip[i] = Math.min(1, flip[i] + dt / 0.7);
          if (prev < 0.5 && flip[i] >= 0.5) { iCell[i] = nextCell[i]; aCell.needsUpdate = true; }
          const e = flip[i] < 0.5 ? 2 * flip[i] * flip[i] : 1 - Math.pow(-2 * flip[i] + 2, 2) / 2;
          q.setFromAxisAngle(flipAx[i] ? yAx : xAx, e * Math.PI * 2); z += Math.sin(Math.PI * flip[i]) * BD * 1.3;
        } else q.identity();
        m4.compose(v3.set(hp.x, hp.y, z), q, sc); wall.setMatrixAt(i, m4);
        const dc = Math.hypot(hp.x, hp.y * 1.5);
        let g = 0;
        if (mode === 'trace') g = (hash(i * 7.1 + section) < 0.14 ? 1 : 0) * (0.25 + voice * 1.1);
        if (mode === 'ignite' || ignite > 0.02) g = Math.max(g, smoothstep(igniteR + 1.5, igniteR - 1.5, dc) * (0.6 + energy));
        g = Math.max(g, build * (hash(i * 2.9) < build * 0.5 ? 0.7 : 0));
        g = Math.max(g, wave * 0.45);
        iGlow[i] += (g - iGlow[i]) * k1(0.25);
        const tr = mode === 'trace' ? Math.min(1.1, traceHead - hash(i * 5.7) * 0.8) : (g > 0.05 ? 1.1 : iTrace[i]);
        iTrace[i] = Math.max(0, tr);
      }
      wall.instanceMatrix.needsUpdate = true; aGlow.needsUpdate = true; aTrace.needsUpdate = true;
      stone.emissiveIntensity = 1.8 + burst * 3; uTimeU.value = t; uVoiceU.value += (voice - uVoiceU.value) * k1(0.2);

      // Rings: expand and fade.
      rings.forEach(r => {
        if (!r.m.visible) return;
        r.age += dt; const s = 0.7 + r.age * 1.5;
        r.m.position.set(r.x, r.y, BD / 2 + 0.2); r.m.scale.setScalar(s);
        r.m.material.uniforms.uA.value = Math.max(0, 1 - r.age / 1.2); r.m.material.uniforms.uTime.value = t;
        if (r.age > 1.2) r.m.visible = false;
      });

      // Obelisks rise in their section and on drops.
      const obUp = mode === 'obelisks' || burst > 0.2 || ignite > 0.5;
      obelisks.forEach((o, i) => {
        const ty = obUp ? -ROWS * BH / 2 + 4.4 + (i % 2) * 0.5 + Math.sin(t * 0.7 + i) * 0.05 : -14;
        o.y += (ty - o.y) * k1(obUp ? 0.5 : 0.9); o.g.position.y = o.y;
        o.glow[0] = obUp ? 0.6 + voice + kick * 0.6 : 0; o.glowAttr.needsUpdate = true;
        o.cap.material.emissiveIntensity = obUp ? 1.5 + kick * 3 : 0;
      });

      // Eye of Horus: draws itself on, the pupil ignites on kicks.
      const eyeOn = mode === 'eye';
      eye.visible = eyeOn || lineMat.uniforms.uA.value > 0.01;
      lineMat.uniforms.uProg.value = eyeOn ? Math.min(1.05, modeT * 0.45) : lineMat.uniforms.uProg.value;
      lineMat.uniforms.uA.value += ((eyeOn ? 1 : 0) - lineMat.uniforms.uA.value) * k1(0.4);
      (pupil.material as any).opacity = eyeOn ? Math.min(1, Math.max(0, modeT * 0.45 - 0.9)) * (0.6 + kick) : 0;

      // Light: the key sweeps slowly and swells with the bass; a glow light follows the ignition.
      key.position.x = -15 + Math.sin(t * 0.07) * 3; key.intensity = 1.4 + bass * 1.0 + burst * 2.5;
      glowLight.intensity = (ignite + burst) * 2.5 + (eyeOn ? 1 : 0);
      dMat.uniforms.uTime.value = t; dMat.uniforms.uSpark.value = tre;
    },
    bloom: (a: FluxDriven) => 0.5 + Math.min(1, a.intensity ?? 0) * 0.3 + (a.kick ?? 0) * 0.2,
    dispose() { owned.forEach(o => o?.dispose?.()); try { tex.alb?.dispose(); tex.nor?.dispose(); tex.msk?.dispose(); } catch { /* */ } },
  };
}

function smoothstep(e0: number, e1: number, x: number) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
