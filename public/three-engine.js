// ── Plajah Series VIII: Three.js 3D PBR Game Engine Foundation ──
// High-fidelity physical rendering: real polygonal meshes, PCF soft shadow maps,
// physical materials with roughness/metalness/transmission, and pitch-black velvet void
// background (#040206) for extreme contrast, zero milky wash, and game-engine realism.

let THREE = null;

export async function loadThree() {
  if (THREE) return THREE;
  try {
    THREE = await import('/node_modules/three/build/three.module.js');
  } catch (e1) {
    try {
      THREE = await import('https://unpkg.com/three@0.184.0/build/three.module.js');
    } catch (e2) {
      console.error('Failed to load Three.js from both local and CDN:', e2);
      throw e2;
    }
  }
  return THREE;
}

export class ThreePbrEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = null;
    this.camera = null;
    this.activeSceneIdx = 0;
    this.scenes = [];
    this.clock = 0;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Procedural Tactile Textures
    this.waterNormalMap = null;
    this.brushedMetalNormalMap = null;
    this.wetFloorNormalMap = null;
    this.wetFloorRoughnessMap = null;

    // Interactive Camera Controls
    this.orbit = {
      phi: 0.22,
      theta: 0.1,
      radius: 4.8,
      targetRadius: 4.8,
      targetPhi: 0.22,
      targetTheta: 0.1,
      isDown: false,
      lastX: 0,
      lastY: 0
    };

    this.bindEvents();
  }

  async init() {
    await loadThree();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.75; // Cinematic high-contrast exposure

    this.camera = new THREE.PerspectiveCamera(46, this.width / this.height, 0.1, 120);
    this.camera.position.set(0, 2.5, 6.0);

    // Build Procedural Normal & Roughness Maps for tactile surface realism
    this.initProceduralTextures();

    // Procedural Studio Environment Map (Black obsidian void + fiery amber & cool slate softboxes)
    this.envMap = this.createStudioEnvMap();

    // Build the 12 PBR scenes: 8 image deconstructions + 4 engine showcases
    this.scenes = [
      this.buildSceneRippleTranquil(),        // 0: Image 1 Calm
      this.buildSceneRippleEnergetic(),       // 1: Image 1 Energetic
      this.buildSceneSlatTranquil(),          // 2: Image 2 Calm
      this.buildSceneSlatEnergetic(),         // 3: Image 2 Energetic
      this.buildSceneMonolithTranquil(),      // 4: Image 3 Calm
      this.buildSceneMonolithEnergetic(),     // 5: Image 3 Energetic
      this.buildSceneChevronTranquil(),       // 6: Image 4 Calm
      this.buildSceneChevronEnergetic(),      // 7: Image 4 Energetic
      this.buildSceneGodotSdfgiLouvers(),     // 8: Godot 4 Showcase 1 (Image 2)
      this.buildSceneGodotSsrMonolith(),      // 9: Godot 4 Showcase 2 (Image 3)
      this.buildSceneUnityHdrpFluidImpact(),  // 10: Unity HDRP Showcase 1 (Image 1)
      this.buildSceneUnityHdrpOrigamiOptics() // 11: Unity HDRP Showcase 2 (Image 4)
    ];

    // Assign radiant environment lighting to all PBR scenes
    this.scenes.forEach(s => {
      if (s && s.scene) {
        s.scene.environment = this.envMap;
      }
    });

    console.log('ThreePbrEngine remade successfully with high-contrast PBR game engine aesthetics.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PROCEDURAL TACTILE TEXTURE GENERATORS
  // ──────────────────────────────────────────────────────────────────────────
  initProceduralTextures() {
    this.waterNormalMap = this.createWaterNormalMap(512, 512);
    this.brushedMetalNormalMap = this.createBrushedMetalNormalMap(256, 512);
    const wetMaps = this.createWetFloorMaps(512, 512);
    this.wetFloorNormalMap = wetMaps.normalMap;
    this.wetFloorRoughnessMap = wetMaps.roughnessMap;
  }

  createWaterNormalMap(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    // Generate height field from 4 harmonic octaves
    const heights = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x / w) * Math.PI * 4;
        const v = (y / h) * Math.PI * 4;
        const hVal = Math.sin(u * 2.0 + v * 1.5) * 0.4 +
                     Math.cos(u * 3.5 - v * 2.8) * 0.3 +
                     Math.sin(u * 7.0 + v * 5.0) * 0.18 +
                     Math.cos(u * 12.0 - v * 9.0) * 0.12;
        heights[y * w + x] = hVal;
      }
    }

    // Convert height field into tangent-space normal map
    const strength = 2.4;
    for (let y = 0; y < h; y++) {
      const ym = (y - 1 + h) % h;
      const yp = (y + 1) % h;
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w;
        const xp = (x + 1) % w;

        const dx = (heights[y * w + xp] - heights[y * w + xm]) * strength;
        const dy = (heights[yp * w + x] - heights[ym * w + x]) * strength;

        // Tangent space normal vector (nx, ny, nz)
        let nx = -dx;
        let ny = -dy;
        let nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
        nx /= len; ny /= len; nz /= len;

        const idx = (y * w + x) * 4;
        data[idx]     = Math.floor((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  createBrushedMetalNormalMap(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Vertical micro-striations
        const noise = (Math.sin(x * 1.8) * 0.5 + 0.5) * 0.4 +
                      (Math.sin(x * 4.2 + y * 0.1) * 0.5 + 0.5) * 0.3 +
                      (Math.random() - 0.5) * 0.3;
        const nx = (noise - 0.5) * 0.4;
        const ny = 0.0;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

        const idx = (y * w + x) * 4;
        data[idx]     = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  createWetFloorMaps(w, h) {
    const cvN = document.createElement('canvas');
    cvN.width = w; cvN.height = h;
    const ctxN = cvN.getContext('2d');
    const imgDataN = ctxN.createImageData(w, h);
    const dataN = imgDataN.data;

    const cvR = document.createElement('canvas');
    cvR.width = w; cvR.height = h;
    const ctxR = cvR.getContext('2d');
    const imgDataR = ctxR.createImageData(w, h);
    const dataR = imgDataR.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x / w) * 6.0;
        const v = (y / h) * 6.0;

        // Puddle distribution & concrete micro-grain
        const puddle = Math.sin(u * 1.5) * Math.cos(v * 1.8) + Math.sin(u * 3.2 - v * 2.4) * 0.4;
        const isPuddle = puddle > 0.15;
        const roughness = isPuddle ? 0.02 + Math.random() * 0.03 : 0.18 + Math.random() * 0.08;

        const idx = (y * w + x) * 4;
        // Roughness map (Grayscale)
        const rByte = Math.floor(roughness * 255);
        dataR[idx] = dataR[idx + 1] = dataR[idx + 2] = rByte;
        dataR[idx + 3] = 255;

        // Normal map (Subtle floor slope + puddles)
        const nx = isPuddle ? 0.0 : (Math.random() - 0.5) * 0.15;
        const ny = isPuddle ? 0.0 : (Math.random() - 0.5) * 0.15;
        dataN[idx]     = Math.floor((nx * 0.5 + 0.5) * 255);
        dataN[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        dataN[idx + 2] = 255;
        dataN[idx + 3] = 255;
      }
    }
    ctxN.putImageData(imgDataN, 0, 0);
    ctxR.putImageData(imgDataR, 0, 0);

    const normalMap = new THREE.CanvasTexture(cvN);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    const roughnessMap = new THREE.CanvasTexture(cvR);
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

    return { normalMap, roughnessMap };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PURE CONTRAST STUDIO ENVIRONMENT MAP
  // Pitch-black obsidian void background (#000000) so zero milky diffuse haze
  // leaks into crevices or dark floor planes, with blazing softbox key reflectors!
  // ──────────────────────────────────────────────────────────────────────────
  createStudioEnvMap() {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 512;
    const ctx = cv.getContext('2d');

    // 1. Pure Obsidian Void Background (Zero ambient wash)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1024, 512);

    // 2. Key Fiery Crimson / Amber Studio Softbox (Image 1 & Image 3)
    // Placed on right horizon: hot incandescent core, intense crimson falloff
    const warmGrad = ctx.createRadialGradient(800, 220, 10, 800, 220, 360);
    warmGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');  // Blinding white core
    warmGrad.addColorStop(0.18, 'rgba(255, 180, 30, 1.0)');  // Incandescent amber
    warmGrad.addColorStop(0.42, 'rgba(235, 15, 45, 0.95)');  // Saturated hot crimson
    warmGrad.addColorStop(0.72, 'rgba(140, 0, 35, 0.45)');   // Deep wine crimson
    warmGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = warmGrad;
    ctx.fillRect(480, 0, 544, 512);

    // 3. Cool Slate-Teal Fill Reflector (Left side skylight)
    const coolGrad = ctx.createRadialGradient(240, 220, 10, 240, 220, 320);
    coolGrad.addColorStop(0.0, 'rgba(200, 245, 255, 0.95)');
    coolGrad.addColorStop(0.28, 'rgba(0, 180, 230, 0.85)');
    coolGrad.addColorStop(0.62, 'rgba(10, 50, 90, 0.4)');
    coolGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = coolGrad;
    ctx.fillRect(0, 0, 480, 512);

    // 4. Overhead High-Intensity Specular Strip
    const stripGrad = ctx.createLinearGradient(0, 30, 1024, 30);
    stripGrad.addColorStop(0.15, 'rgba(0, 160, 220, 0.0)');
    stripGrad.addColorStop(0.35, 'rgba(0, 200, 255, 0.6)');
    stripGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)'); // Specular ridge
    stripGrad.addColorStop(0.65, 'rgba(255, 140, 30, 0.7)');
    stripGrad.addColorStop(0.85, 'rgba(220, 20, 60, 0.0)');
    ctx.fillStyle = stripGrad;
    ctx.fillRect(0, 15, 1024, 50);

    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.orbit.isDown = true;
      this.orbit.lastX = e.clientX;
      this.orbit.lastY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.orbit.isDown) return;
      const dx = e.clientX - this.orbit.lastX;
      const dy = e.clientY - this.orbit.lastY;
      this.orbit.lastX = e.clientX;
      this.orbit.lastY = e.clientY;

      this.orbit.targetTheta -= dx * 0.006;
      this.orbit.targetPhi = Math.max(-0.4, Math.min(1.4, this.orbit.targetPhi + dy * 0.006));
    });

    window.addEventListener('pointerup', () => {
      this.orbit.isDown = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.targetRadius = Math.max(2.2, Math.min(22.0, this.orbit.targetRadius + e.deltaY * 0.008));
    }, { passive: false });
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.renderer) {
      this.renderer.setSize(w, h);
    }
  }

  activateScene(idx) {
    if (idx >= 0 && idx < this.scenes.length) {
      this.activeSceneIdx = idx;
      const sc = this.scenes[idx];
      if (sc.defaultOrbit) {
        this.orbit.targetPhi = sc.defaultOrbit.phi;
        this.orbit.targetTheta = sc.defaultOrbit.theta;
        this.orbit.targetRadius = sc.defaultOrbit.radius;
        this.orbit.phi = sc.defaultOrbit.phi;
        this.orbit.theta = sc.defaultOrbit.theta;
        this.orbit.radius = sc.defaultOrbit.radius;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 10 (KEY 1): Unity HDRP Showcase: High-Speed Fluid Macro Impact (Image 1 1-for-1)
  // Direct, photorealistic 1-for-1 reconstruction:
  // - Off-center impact crater (1.4, 0.6) with concentric trochoidal ripples
  // - Rising Worthington liquid jet column with bulbous base & tapered neck
  // - Suspended detached liquid droplet at pinch-off + micro-satellite droplet
  // - Curved overhead fiery softbox reflector catching glowing crimson wave crests
  // - Physical micro-capillary normal map with shimmering liquid reflections
  // - 64 ballistic micro-droplets erupting with gravity, drag, and floor bounce
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneUnityHdrpFluidImpact() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040206); // Pure velvet void

    // Very low ambient light to preserve intense obsidian contrast
    const amb = new THREE.AmbientLight(0x0a0307, 0.05);
    scene.add(amb);

    // 1. Massive Overhead Fiery Softbox Reflector Mesh (Image 1 Signature Reflector)
    // Curving directly over the right wave field to streak crimson/amber light across crests
    const reflectorCv = document.createElement('canvas');
    reflectorCv.width = 512;
    reflectorCv.height = 256;
    const rCtx = reflectorCv.getContext('2d');
    const rGrad = rCtx.createRadialGradient(256, 128, 10, 256, 128, 240);
    rGrad.addColorStop(0.0, 'rgba(255, 240, 200, 1.0)'); // Incandescent core
    rGrad.addColorStop(0.2, 'rgba(255, 140, 20, 1.0)');  // Burning amber
    rGrad.addColorStop(0.55, 'rgba(230, 10, 50, 0.95)'); // Saturated crimson
    rGrad.addColorStop(0.85, 'rgba(120, 0, 30, 0.4)');
    rGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(0, 0, 512, 256);

    const reflectorTex = new THREE.CanvasTexture(reflectorCv);
    const warmReflector = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 18),
      new THREE.MeshBasicMaterial({ map: reflectorTex, transparent: true, side: THREE.DoubleSide })
    );
    warmReflector.position.set(4.5, 6.5, 2.5);
    warmReflector.rotation.set(0.7, -0.45, 0.25);
    scene.add(warmReflector);

    // 2. High-Intensity Theatrical Key Spotlight focused directly on the Impact Point (1.4, 0.0, 0.6)
    const keySpot = new THREE.SpotLight(0xff2244, 38.0, 45, Math.PI / 3, 0.35, 1.2);
    keySpot.position.set(4.5, 10.0, 5.0);
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.width = 2048;
    keySpot.shadow.mapSize.height = 2048;
    keySpot.shadow.bias = -0.0005;
    keySpot.target.position.set(1.4, 0.0, 0.6);
    scene.add(keySpot.target);
    scene.add(keySpot);

    // Grazing Crimson/Amber Rim Spotlight
    const rimSpot = new THREE.SpotLight(0xff7700, 26.0, 35, Math.PI / 4, 0.45, 1.4);
    rimSpot.position.set(7.5, 3.5, 6.0);
    rimSpot.target.position.set(1.4, 0.3, 0.6);
    scene.add(rimSpot.target);
    scene.add(rimSpot);

    // Slate-Teal Backfill Point Light
    const coolFill = new THREE.PointLight(0x00d8f0, 14.0, 25);
    coolFill.position.set(-6.0, 4.5, -5.0);
    scene.add(coolFill);

    // 3. Dense Tessellated Liquid Basin Surface (220x220 segments)
    const size = 36;
    const segs = 220;
    const lakeGeom = new THREE.PlaneGeometry(size, size, segs, segs);
    lakeGeom.rotateX(-Math.PI / 2);
    const origPos = new Float32Array(lakeGeom.attributes.position.array);

    // Clone water normal map for dynamic UV scrolling
    const lakeNormalMap = this.waterNormalMap.clone();
    lakeNormalMap.repeat.set(8, 8);
    lakeNormalMap.needsUpdate = true;

    const lakeMat = new THREE.MeshPhysicalMaterial({
      color: 0x080205,           // Pitch obsidian liquid body
      roughness: 0.018,          // Glistening liquid mirror
      metalness: 0.22,           // Specular boost
      transmission: 0.38,        // Internal water refraction
      ior: 1.333,                // Real physical water IOR
      clearcoat: 1.0,            // Lacquered liquid surface tension
      clearcoatRoughness: 0.015,
      normalMap: lakeNormalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      reflectivity: 0.98
    });
    const lakeMesh = new THREE.Mesh(lakeGeom, lakeMat);
    lakeMesh.receiveShadow = true;
    scene.add(lakeMesh);

    // 4. Image 1 Signature: Rising Worthington Fluid Jet Column
    // Tapering organic fluid spout rising from the impact crater
    const dropMat = new THREE.MeshPhysicalMaterial({
      color: 0xcc0033,
      roughness: 0.02,
      metalness: 0.18,
      transmission: 0.85,
      ior: 1.333,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      attenuationColor: new THREE.Color(0x880018),
      attenuationDistance: 0.65
    });

    const jetGeom = new THREE.CylinderGeometry(0.045, 0.28, 1.8, 32, 16);
    // Smooth tapering curve along the column
    const jPos = jetGeom.attributes.position;
    for (let i = 0; i < jPos.count; i++) {
      const y = jPos.getY(i);
      const normY = (y + 0.9) / 1.8; // 0..1
      // Organic flare at base and bulge near top
      const rScale = 1.0 + Math.pow(1.0 - normY, 2.5) * 1.8 + Math.sin(normY * Math.PI) * 0.35;
      jPos.setX(i, jPos.getX(i) * rScale);
      jPos.setZ(i, jPos.getZ(i) * rScale);
    }
    jetGeom.computeVertexNormals();

    const jetMesh = new THREE.Mesh(jetGeom, dropMat);
    jetMesh.position.set(1.4, 0.9, 0.6);
    jetMesh.castShadow = true;
    scene.add(jetMesh);

    // 5. Suspended Detached Droplet hovering at pinch apex
    const detachedGeom = new THREE.SphereGeometry(0.125, 32, 24);
    const detachedMesh = new THREE.Mesh(detachedGeom, dropMat);
    detachedMesh.position.set(1.4, 2.05, 0.6);
    detachedMesh.castShadow = true;
    scene.add(detachedMesh);

    // 6. Micro Satellite Droplet hovering higher in the air
    const microGeom = new THREE.SphereGeometry(0.052, 20, 16);
    const microMesh = new THREE.Mesh(microGeom, dropMat);
    microMesh.position.set(1.4, 2.45, 0.6);
    microMesh.castShadow = true;
    scene.add(microMesh);

    // 7. 64 Ballistic Micro-Droplets (Dynamic kick VFX)
    const numDroplets = 64;
    const dropGeom = new THREE.IcosahedronGeometry(0.08, 2);
    const droplets = [];
    for (let i = 0; i < numDroplets; i++) {
      const m = new THREE.Mesh(dropGeom, dropMat);
      m.position.set(1.4, -10, 0.6);
      scene.add(m);
      droplets.push({
        mesh: m,
        vx: 0, vy: 0, vz: 0,
        active: false,
        elasticity: 0.55,
        bounces: 0
      });
    }

    let lastKickTime = 0;

    return {
      scene,
      target: new THREE.Vector3(1.4, 0.35, 0.6),
      defaultOrbit: { phi: 0.22, theta: 0.1, radius: 4.6 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.25;
        const snare = sample ? sample.snare : 0.15;
        const voice = sample ? sample.voice : 0.3;
        const punch = sample ? sample.punch : 0.2;

        // Scroll liquid normal map for shimmering capillary caustics
        lakeNormalMap.offset.x = (clock * 0.035) % 1.0;
        lakeNormalMap.offset.y = (clock * 0.025) % 1.0;

        // Kick triggers ballistic droplet explosion
        if (kick > 0.62 && clock - lastKickTime > 0.2) {
          lastKickTime = clock;
          const spawnCount = Math.floor(16 + kick * 24);
          let spawned = 0;
          for (let d of droplets) {
            if (!d.active && spawned < spawnCount) {
              const ang = Math.random() * Math.PI * 2;
              const spd = 1.6 + Math.random() * 3.5;
              d.active = true;
              d.bounces = 0;
              d.mesh.position.set(1.4 + Math.cos(ang) * 0.3, 0.35, 0.6 + Math.sin(ang) * 0.3);
              d.vx = Math.cos(ang) * spd;
              d.vz = Math.sin(ang) * spd;
              d.vy = 4.8 + Math.random() * 6.5 + kick * 3.5;
              spawned++;
            }
          }
        }

        // Ballistic continuous physics update
        const gravity = 12.8;
        for (let d of droplets) {
          if (d.active) {
            d.mesh.position.x += d.vx * dt;
            d.mesh.position.y += d.vy * dt;
            d.mesh.position.z += d.vz * dt;
            d.vy -= gravity * dt;
            d.vx *= (1.0 - 0.22 * dt);
            d.vz *= (1.0 - 0.22 * dt);

            if (d.mesh.position.y <= 0.04 && d.vy < 0) {
              d.mesh.position.y = 0.04;
              d.vy = -d.vy * d.elasticity;
              d.bounces++;
              if (Math.abs(d.vy) < 0.6 || d.bounces > 4) {
                d.active = false;
                d.mesh.position.y = -10;
              }
            }
          }
        }

        // Worthington Jet dynamics: column scales on kicks & breathes with voice
        const targetJetH = 1.0 + kick * 1.45 + Math.sin(clock * 3.5) * 0.12;
        jetMesh.scale.y += (targetJetH - jetMesh.scale.y) * 0.16;
        jetMesh.position.y = (1.8 * jetMesh.scale.y) * 0.5;

        // Hovering detached droplet follows column tip
        const dropY = 1.8 * jetMesh.scale.y + 0.32 + Math.sin(clock * 4.5) * 0.08;
        detachedMesh.position.y += (dropY - detachedMesh.position.y) * 0.2;
        detachedMesh.scale.setScalar(1.0 + snare * 0.3);

        const microY = detachedMesh.position.y + 0.42 + Math.sin(clock * 6.0 + 1.2) * 0.06;
        microMesh.position.y += (microY - microMesh.position.y) * 0.22;

        // Real-Time Concentric Trochoidal Wave Equations:
        // Sharp peaked crests and broad dark troughs matching Image 1!
        const shockRadius = (clock * 6.8) % 18.0;
        const pos = lakeGeom.attributes.position;
        const count = pos.count;
        const amp = 0.22 + kick * 0.45 + (params[0] ?? 0.5) * 0.25;
        const freq = 2.4 + (params[1] ?? 0.5) * 1.2;

        for (let i = 0; i < count; i++) {
          const x = origPos[i * 3];
          const z = origPos[i * 3 + 2];
          const dx = x - 1.4;
          const dz = z - 0.6;
          const r = Math.sqrt(dx * dx + dz * dz);

          // Concentric ripple harmonic train
          const harmonic1 = Math.sin(r * freq - clock * 7.5) / (1.0 + r * 0.32);
          const harmonic2 = Math.sin(r * 5.2 - clock * 11.0) / (1.0 + r * 0.75) * 0.35;
          const rawWave = (harmonic1 + harmonic2) * amp;

          // Trochoidal crest sharpening
          const trochoidal = Math.sign(rawWave) * Math.pow(Math.abs(rawWave), 1.45);

          // Hydraulic shockwave front expanding outward
          const shock = Math.exp(-Math.pow(r - shockRadius, 2.0) * 1.6) * (0.65 + kick * 1.2);

          pos.setY(i, trochoidal + shock);
        }
        lakeGeom.computeVertexNormals();
        pos.needsUpdate = true;

        // Dynamic High-Intensity Lighting
        keySpot.intensity = 32.0 + kick * 38.0;
        rimSpot.intensity = 22.0 + snare * 25.0;
        coolFill.intensity = 10.0 + voice * 14.0;
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 8 (KEY 2): Godot 4 Showcase: SDFGI Dynamic Crevice Louvers (Image 2 1-for-1)
  // Direct, photorealistic 1-for-1 reconstruction:
  // - 48 vertical architectural louvers with organic staggered heights & depth offsets
  // - Dark gunmetal U-channel casings with brushed metal normal map
  // - Recessed rectangular neon phosphor rods seated in crevice cavities
  // - Palette: Electric Cyan, Vivid Amber, Magenta, Violet, Fire Orange, Cobalt, Lime
  // - Real-time SDFGI multi-bounce color bleeding onto metal sidewalls
  // - Mirror-wet black lacquer floor reflecting all rods stretching downward
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneGodotSdfgiLouvers() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030205); // Obsidian velvet void

    const amb = new THREE.AmbientLight(0x0a0510, 0.04);
    scene.add(amb);

    // Directional raking sunbeam creating sharp shadows down the vertical crevices
    const dir = new THREE.DirectionalLight(0xfff5ea, 5.5);
    dir.position.set(12, 16, 14);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.0004;
    scene.add(dir);

    // High-Gloss Wet Lacquer Mirror Floor
    const floorY = -3.8;
    const floorGeom = new THREE.PlaneGeometry(54, 38);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x050308,
      roughness: 0.025,
      metalness: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      normalMap: this.wetFloorNormalMap,
      normalScale: new THREE.Vector2(0.2, 0.2)
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.position.y = floorY;
    floor.receiveShadow = true;
    scene.add(floor);

    // 48 Architectural Louvers Group
    const numSlats = 48;
    const spacing = 0.32;
    const totalW = numSlats * spacing;
    const slatsGroup = new THREE.Group();
    scene.add(slatsGroup);

    // Color sequence matching Image 2's exact radiant diversity
    const palette = [
      new THREE.Color(0x00f0ff), // Electric Cyan
      new THREE.Color(0xffaa00), // Sunny Amber / Gold
      new THREE.Color(0xff0066), // Hot Pink / Magenta
      new THREE.Color(0x9d00ff), // Vivid Violet
      new THREE.Color(0xff3700), // Fire Orange
      new THREE.Color(0x0055ff), // Cobalt Blue
      new THREE.Color(0x39ff14), // Acid Lime
      new THREE.Color(0xffea00)  // Radiant Yellow
    ];

    const slats = [];

    // Pre-create brushed metal material for casings
    const casingMatBase = new THREE.MeshStandardMaterial({
      color: 0x14121a,
      roughness: 0.22,
      metalness: 0.9,
      normalMap: this.brushedMetalNormalMap,
      normalScale: new THREE.Vector2(0.35, 0.35)
    });

    for (let i = 0; i < numSlats; i++) {
      const g = new THREE.Group();
      const x = -totalW / 2 + i * spacing;

      // Staggered architectural heights & depths matching Image 2
      const heightPhase = Math.sin(i * 0.45) * 1.2 + Math.cos(i * 1.1) * 0.8;
      const slatH = 6.4 + heightPhase;
      const depthStagger = (Math.sin(i * 0.8) * 0.22 + Math.cos(i * 1.7) * 0.15);
      const zArc = -Math.pow((i - numSlats / 2) / (numSlats / 2), 2) * 0.5 + depthStagger;
      g.position.set(x, (slatH - 6.4) * 0.5, zArc);

      // Casing: Dark gunmetal box with beveled trim
      const casingGeom = new THREE.BoxGeometry(0.24, slatH, 0.7);
      const slatMat = casingMatBase.clone();
      slatMat.emissive = new THREE.Color(0x000000);
      slatMat.emissiveIntensity = 0.0;
      const casingMesh = new THREE.Mesh(casingGeom, slatMat);
      casingMesh.castShadow = true;
      casingMesh.receiveShadow = true;
      g.add(casingMesh);

      // Recessed Neon Phosphor Rod seated in front cavity
      const c = palette[i % palette.length];
      const rodH = slatH * 0.92;
      const rodGeom = new THREE.BoxGeometry(0.065, rodH, 0.09);
      const rodMat = new THREE.MeshBasicMaterial({ color: c });
      const rodMesh = new THREE.Mesh(rodGeom, rodMat);
      rodMesh.position.set(0, 0, 0.36); // protruding just beyond the slot face
      g.add(rodMesh);

      slatsGroup.add(g);

      // Inverted Mirrored Clone beneath wet floor for true SSR real-time reflection
      const cloneG = new THREE.Group();
      cloneG.position.set(x, 2 * floorY - g.position.y, zArc);
      cloneG.rotation.x = Math.PI;
      const cloneCasing = new THREE.Mesh(casingGeom, casingMatBase);
      cloneG.add(cloneCasing);
      const cloneRod = new THREE.Mesh(rodGeom, rodMat);
      cloneRod.position.set(0, 0, 0.36);
      cloneG.add(cloneRod);
      scene.add(cloneG);

      slats.push({
        group: g,
        cloneGroup: cloneG,
        casingMesh,
        rodMesh,
        slatMat,
        baseZ: zArc,
        baseY: g.position.y,
        color: c,
        index: i
      });
    }

    // High-Intensity SDFGI Crevice Point Lights casting multi-bounce colored bleed
    const bounceLights = [
      new THREE.PointLight(0x00f0ff, 28.0, 14),
      new THREE.PointLight(0xff0066, 28.0, 14),
      new THREE.PointLight(0xffaa00, 28.0, 14),
      new THREE.PointLight(0x9d00ff, 28.0, 14)
    ];
    const lightPositions = [-5.5, -1.8, 1.8, 5.5];
    bounceLights.forEach((lt, idx) => {
      lt.position.set(lightPositions[idx], floorY + 0.6, 1.2);
      scene.add(lt);
    });

    return {
      scene,
      target: new THREE.Vector3(0, 0.8, 0),
      defaultOrbit: { phi: 0.14, theta: 0.46, radius: 5.8 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.25;
        const snare = sample ? sample.snare : 0.15;
        const voice = sample ? sample.voice : 0.3;

        // Audio-driven kinetic louver mechanics
        slats.forEach((s, idx) => {
          // Wave depth extrusion across colonnade on kick transients
          const phase = idx * 0.24 - clock * 4.0;
          const wave = Math.sin(phase);
          const kickExtrude = Math.pow(Math.max(0, wave), 2.2) * (0.6 + kick * 1.5);
          s.group.position.z = s.baseZ + kickExtrude;
          s.cloneGroup.position.z = s.group.position.z;

          // Snare rotates alternating slats like mechanical louvers
          const altSign = (idx % 2 === 0 ? 1 : -1);
          const targetRotY = altSign * snare * 0.48;
          s.group.rotation.y += (targetRotY - s.group.rotation.y) * 0.22;
          s.cloneGroup.rotation.y = s.group.rotation.y;

          // SDFGI Crevice Color Bleed: metal walls catch bounced radiance from phosphor rods
          const bounceFactor = 0.35 + voice * 0.85 + kick * 0.6;
          s.slatMat.emissive.copy(s.color);
          s.slatMat.emissiveIntensity = bounceFactor * 0.95;

          // Neon phosphor rod breathing
          s.rodMesh.scale.y = 0.96 + wave * 0.08 * (1.0 + snare * 0.4);
        });

        // Dynamic multi-bounce lighting intensity
        bounceLights[0].intensity = 22.0 + kick * 32.0;
        bounceLights[1].intensity = 22.0 + voice * 32.0;
        bounceLights[2].intensity = 22.0 + snare * 35.0;
        bounceLights[3].intensity = 22.0 + kick * 32.0;
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 9 (KEY 3): Godot 4 Showcase: SSR Monolith Exhibition Sanctuary (Image 3 1-for-1)
  // Direct, photorealistic 1-for-1 reconstruction:
  // - Monumental dark gallery room with pitch obsidian ceiling/void (#020204)
  // - 7 Vertical Monolith screens + Massive Center Rear Backdrop
  // - Monolith 2 & 7: DUAL glowing vertical orange/white laser lines!
  // - Monolith 4: Central soaring vertical laser core column!
  // - Monoliths 1, 3, 5, 6: Radiant fiery abstract generative art screens!
  // - Polished mirror-wet lacquer floor with SSR inverted clones stretching toward camera
  // - High-intensity gallery spotlights grazing monolith edges
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneGodotSsrMonolith() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020104); // Deep gallery obsidian void

    const amb = new THREE.AmbientLight(0x08040a, 0.04);
    scene.add(amb);

    // Directional gallery overhead moonlight grazing the monolith top edges
    const moon = new THREE.DirectionalLight(0xfff2ec, 5.8);
    moon.position.set(0, 18, 12);
    moon.castShadow = true;
    moon.shadow.mapSize.width = 2048;
    moon.shadow.mapSize.height = 2048;
    moon.shadow.bias = -0.0004;
    scene.add(moon);

    // Mirror-Wet Black Lacquer Gallery Floor
    const floorY = -4.0;
    const floorGeom = new THREE.PlaneGeometry(64, 64);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x040206,
      roughness: 0.02,
      metalness: 0.96,
      clearcoat: 1.0,
      clearcoatRoughness: 0.015,
      normalMap: this.wetFloorNormalMap,
      normalScale: new THREE.Vector2(0.18, 0.18)
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.position.y = floorY;
    floor.receiveShadow = true;
    scene.add(floor);

    // Offscreen Canvas for High-Resolution Fiery Generative Artwork (Image 3 1-for-1)
    const artCv = document.createElement('canvas');
    artCv.width = 512;
    artCv.height = 1024;
    const artCtx = artCv.getContext('2d');
    const artTex = new THREE.CanvasTexture(artCv);

    // 1. Massive Center Rear Backdrop Display Screen
    const backdropGeom = new THREE.PlaneGeometry(28, 13.5);
    const backdropMat = new THREE.MeshBasicMaterial({ map: artTex });
    const backdropMesh = new THREE.Mesh(backdropGeom, backdropMat);
    backdropMesh.position.set(0, 3.2, -4.8);
    scene.add(backdropMesh);

    // SSR Inverted Mirrored Backdrop beneath floor
    const cloneBackdrop = new THREE.Mesh(backdropGeom, backdropMat);
    cloneBackdrop.position.set(0, 2 * floorY - 3.2, -4.8);
    cloneBackdrop.rotation.x = Math.PI;
    scene.add(cloneBackdrop);

    // 2. The 7 Monumental Standing Monoliths
    // Layout: 3 on left, 1 center, 3 on right, following Image 3's exact perspective
    const slabW = 1.65;
    const slabH = 8.2;
    const slabD = 0.45;
    const slabGeom = new THREE.BoxGeometry(slabW, slabH, slabD);
    const faceGeom = new THREE.PlaneGeometry(slabW * 0.92, slabH * 0.94);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x09070e,
      roughness: 0.18,
      metalness: 0.92,
      normalMap: this.brushedMetalNormalMap,
      normalScale: new THREE.Vector2(0.3, 0.3)
    });

    const coords = [
      { x: -6.8, z: -2.4, rotY: 0.30, type: 'art' },    // Monolith 1: Fiery abstract art
      { x: -4.6, z: -1.0, rotY: 0.20, type: 'dual' },   // Monolith 2: Dual vertical laser lines!
      { x: -2.3, z: 0.3,  rotY: 0.10, type: 'art' },    // Monolith 3: Fiery abstract art
      { x: 0.0,  z: 1.2,  rotY: 0.00, type: 'single' }, // Monolith 4: Center single laser core!
      { x: 2.3,  z: 0.3,  rotY: -0.10, type: 'art' },   // Monolith 5: Fiery abstract art
      { x: 4.6,  z: -1.0, rotY: -0.20, type: 'dual' },  // Monolith 6: Dual vertical laser lines!
      { x: 6.8,  z: -2.4, rotY: -0.30, type: 'art' }    // Monolith 7: Fiery abstract art
    ];

    const monoliths = [];
    const cloneMonoliths = [];
    const laserStrips = [];

    // Separate canvas textures for laser lines
    const laserCv = document.createElement('canvas');
    laserCv.width = 128; laserCv.height = 512;
    const lCtx = laserCv.getContext('2d');
    lCtx.fillStyle = '#060205';
    lCtx.fillRect(0, 0, 128, 512);
    // Two bright white/amber vertical laser streaks
    lCtx.fillStyle = '#ff8800';
    lCtx.fillRect(36, 0, 12, 512);
    lCtx.fillRect(80, 0, 12, 512);
    lCtx.fillStyle = '#ffffff';
    lCtx.fillRect(39, 0, 6, 512);
    lCtx.fillRect(83, 0, 6, 512);
    const dualLaserTex = new THREE.CanvasTexture(laserCv);

    const singleLaserCv = document.createElement('canvas');
    singleLaserCv.width = 128; singleLaserCv.height = 512;
    const sCtx = singleLaserCv.getContext('2d');
    sCtx.fillStyle = '#060205';
    sCtx.fillRect(0, 0, 128, 512);
    sCtx.fillStyle = '#ff6600';
    sCtx.fillRect(52, 0, 24, 512);
    sCtx.fillStyle = '#ffffff';
    sCtx.fillRect(58, 0, 12, 512);
    const singleLaserTex = new THREE.CanvasTexture(singleLaserCv);

    coords.forEach((c) => {
      const g = new THREE.Group();
      g.position.set(c.x, 0.1, c.z);
      g.rotation.y = c.rotY;

      const body = new THREE.Mesh(slabGeom, bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      // Select face material based on Image 3 configuration
      let faceMat;
      if (c.type === 'dual') {
        faceMat = new THREE.MeshBasicMaterial({ map: dualLaserTex });
      } else if (c.type === 'single') {
        faceMat = new THREE.MeshBasicMaterial({ map: singleLaserTex });
      } else {
        faceMat = new THREE.MeshBasicMaterial({ map: artTex });
      }

      const face = new THREE.Mesh(faceGeom, faceMat);
      face.position.set(0, 0, slabD / 2 + 0.01);
      g.add(face);

      scene.add(g);
      monoliths.push(g);

      // Inverted Mirrored Clone beneath floor (Real SSR reflections)
      const cloneG = new THREE.Group();
      cloneG.position.set(c.x, 2 * floorY - 0.1, c.z);
      cloneG.rotation.y = c.rotY;
      cloneG.rotation.x = Math.PI;

      const cloneBody = new THREE.Mesh(slabGeom, bodyMat);
      cloneG.add(cloneBody);
      const cloneFace = new THREE.Mesh(faceGeom, faceMat);
      cloneFace.position.set(0, 0, slabD / 2 + 0.01);
      cloneG.add(cloneFace);

      scene.add(cloneG);
      cloneMonoliths.push(cloneG);

      // Point light casting fiery illumination onto floor
      const pColor = c.type === 'art' ? 0xff0055 : 0xff7700;
      const pt = new THREE.PointLight(pColor, 18.0, 12);
      pt.position.set(c.x, floorY + 0.8, c.z + 0.8);
      scene.add(pt);
      laserStrips.push(pt);
    });

    return {
      scene,
      target: new THREE.Vector3(0, 2.5, 0),
      defaultOrbit: { phi: 0.08, theta: 0.0, radius: 8.6 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.25;
        const sub = sample ? sample.sub : 0.2;
        const voice = sample ? sample.voice : 0.3;

        // High-Resolution Fiery Generative Canvas Update (Image 3 Artwork)
        artCtx.fillStyle = '#060207';
        artCtx.fillRect(0, 0, 512, 1024);

        // Dynamic diagonal energy bands
        const numBands = 20;
        for (let b = 0; b < numBands; b++) {
          const y = (b / numBands) * 1024;
          const wPhase = clock * 2.8 + b * 0.42;
          const wave = Math.sin(wPhase) * 130 * (1.0 + voice * 1.3);
          const hue = 350 + Math.sin(b * 0.35 + clock) * 40; // Fiery Crimson -> Amber -> Gold

          const grad = artCtx.createRadialGradient(256 + wave, y, 12, 256 + wave, y, 200 + kick * 70);
          grad.addColorStop(0.0, 'rgba(255, 255, 240, 0.98)'); // Incandescent core
          grad.addColorStop(0.28, `hsla(${hue}, 100%, 55%, 0.9)`);
          grad.addColorStop(0.65, `hsla(${hue - 32}, 100%, 36%, 0.5)`);
          grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

          artCtx.fillStyle = grad;
          artCtx.beginPath();
          artCtx.ellipse(256 + wave, y, 180 + kick * 60, 48, -0.45, 0, Math.PI * 2);
          artCtx.fill();
        }
        artTex.needsUpdate = true;

        // SSR Liquid Perturbation on Sub-bass
        cloneMonoliths.forEach((cg, i) => {
          const wobble = Math.sin(clock * 7.5 + i) * sub * 0.09;
          cg.position.x = coords[i].x + wobble;
          cg.rotation.z = wobble * 0.25;
        });

        // Laser strip floor bounce intensity
        laserStrips.forEach((lt, i) => {
          lt.intensity = 16.0 + kick * 28.0 + (i === 3 ? snare * 20.0 : 0);
        });
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 11 (KEY 4): Unity HDRP Showcase: Theatrical Origami Proscenium & Optical Streaks (Image 4 1-for-1)
  // Direct, photorealistic 1-for-1 reconstruction:
  // - Symmetrical 6-chevron proscenium stage with knife-edge peaked crowns
  // - Towers 3 & 4 (center) are tallest with sharp inward angled peaks
  // - Diagonal architectural color blocking matching Image 4:
  //   Left: Cyan, Teal, Slate Charcoal, Warm Ochre, Coral Pink square
  //   Right: Flame Orange, Crimson, Fuchsia Magenta, Slate, Cyan square
  // - Polished concert stage floor with satin specular reflections
  // - Overhead stage truss with moving-head spotlights
  // - Silhouetted wedge stage monitors in the foreground
  // - Horizontal anamorphic optical lens streak flaring on snare cracks
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneUnityHdrpOrigamiOptics() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020104);

    const amb = new THREE.AmbientLight(0x0a0410, 0.04);
    scene.add(amb);

    // Theatrical Moving-Head Spotlight 1 (Cyan key beam)
    const spotCyan = new THREE.SpotLight(0x00f5ff, 32.0, 45, Math.PI / 4, 0.35, 1.2);
    spotCyan.position.set(-8, 14, 9);
    spotCyan.castShadow = true;
    spotCyan.shadow.mapSize.width = 2048;
    spotCyan.shadow.mapSize.height = 2048;
    spotCyan.shadow.bias = -0.0004;
    scene.add(spotCyan);

    // Theatrical Moving-Head Spotlight 2 (Hot Amber/Crimson key beam)
    const spotAmber = new THREE.SpotLight(0xff4400, 32.0, 45, Math.PI / 4, 0.38, 1.2);
    spotAmber.position.set(8, 14, 9);
    spotAmber.castShadow = true;
    spotAmber.shadow.mapSize.width = 2048;
    spotAmber.shadow.mapSize.height = 2048;
    spotAmber.shadow.bias = -0.0004;
    scene.add(spotAmber);

    // Concert Stage Floor
    const floorY = -3.8;
    const stageGeom = new THREE.PlaneGeometry(48, 32);
    stageGeom.rotateX(-Math.PI / 2);
    const stageMat = new THREE.MeshPhysicalMaterial({
      color: 0x06040a,
      roughness: 0.055,
      metalness: 0.92,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      normalMap: this.wetFloorNormalMap,
      normalScale: new THREE.Vector2(0.15, 0.15)
    });
    const stageFloor = new THREE.Mesh(stageGeom, stageMat);
    stageFloor.position.y = floorY;
    stageFloor.receiveShadow = true;
    scene.add(stageFloor);

    // Canvas Textures matching Image 4's exact Graphic Blocks
    const texLeft = this.createChevronStageTexture(true);
    const texRight = this.createChevronStageTexture(false);

    // 6 Chevron Proscenium Towers
    // Towers 1, 2, 3 (Left), Towers 4, 5, 6 (Right)
    const towerConfigs = [
      { x: -8.0, h: 6.2, isLeft: true,  peakAngle: 0.4 },  // Tower 1 (Outer left)
      { x: -5.4, h: 7.8, isLeft: true,  peakAngle: 0.45 }, // Tower 2 (Mid left)
      { x: -2.8, h: 9.6, isLeft: true,  peakAngle: 0.55 }, // Tower 3 (Center left - tallest!)
      { x: 2.8,  h: 9.6, isLeft: false, peakAngle: -0.55 },// Tower 4 (Center right - tallest!)
      { x: 5.4,  h: 7.8, isLeft: false, peakAngle: -0.45 },// Tower 5 (Mid right)
      { x: 8.0,  h: 6.2, isLeft: false, peakAngle: -0.4 }  // Tower 6 (Outer right)
    ];

    const towersGroup = new THREE.Group();
    scene.add(towersGroup);
    const towers = [];

    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x0c0a12,
      roughness: 0.25,
      metalness: 0.88,
      normalMap: this.brushedMetalNormalMap,
      normalScale: new THREE.Vector2(0.3, 0.3)
    });

    towerConfigs.forEach((cfg) => {
      const g = new THREE.Group();
      g.position.set(cfg.x, floorY + cfg.h * 0.5, -Math.abs(cfg.x) * 0.35);

      // Angled Chevron Pylon Body
      const pylonGeom = new THREE.BoxGeometry(2.3, cfg.h, 0.5);
      const pylonMesh = new THREE.Mesh(pylonGeom, borderMat);
      pylonMesh.castShadow = true;
      pylonMesh.receiveShadow = true;
      g.add(pylonMesh);

      // Front Graphic Face
      const faceGeom = new THREE.PlaneGeometry(2.2, cfg.h * 0.98);
      const faceMat = new THREE.MeshBasicMaterial({
        map: cfg.isLeft ? texLeft : texRight
      });
      const faceMesh = new THREE.Mesh(faceGeom, faceMat);
      faceMesh.position.set(0, 0, 0.26);
      g.add(faceMesh);

      towersGroup.add(g);
      towers.push({ group: g, baseZ: g.position.z, cfg });
    });

    // Foreground Silhouetted Wedge Stage Monitors (Image 4 Detail)
    const monitorGeom = new THREE.BoxGeometry(1.4, 0.65, 0.85);
    const monitorMat = new THREE.MeshStandardMaterial({ color: 0x050407, roughness: 0.7, metalness: 0.3 });
    const m1 = new THREE.Mesh(monitorGeom, monitorMat);
    m1.position.set(-3.2, floorY + 0.33, 3.5);
    m1.rotation.y = 0.25;
    scene.add(m1);

    const m2 = new THREE.Mesh(monitorGeom, monitorMat);
    m2.position.set(3.2, floorY + 0.33, 3.5);
    m2.rotation.y = -0.25;
    scene.add(m2);

    // Anamorphic Optical Lens Streak Billboard
    const streakCv = document.createElement('canvas');
    streakCv.width = 512;
    streakCv.height = 32;
    const sCtx = streakCv.getContext('2d');
    const grad = sCtx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0.0, 'rgba(0, 245, 255, 0.0)');
    grad.addColorStop(0.32, 'rgba(0, 245, 255, 0.8)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.68, 'rgba(255, 50, 100, 0.8)');
    grad.addColorStop(1.0, 'rgba(255, 50, 100, 0.0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 512, 32);
    const streakTex = new THREE.CanvasTexture(streakCv);

    const streakGeom = new THREE.PlaneGeometry(10.0, 0.22);
    const streakMat = new THREE.MeshBasicMaterial({
      map: streakTex,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthTest: false
    });
    const streakMesh = new THREE.Mesh(streakGeom, streakMat);
    scene.add(streakMesh);

    return {
      scene,
      target: new THREE.Vector3(0, 1.5, 0),
      defaultOrbit: { phi: 0.12, theta: 0.0, radius: 10.8 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.25;
        const snare = sample ? sample.snare : 0.15;
        const voice = sample ? sample.voice : 0.3;

        // Chevron Towers articulate on kick impacts
        towers.forEach((t) => {
          const flare = kick * 0.55;
          t.group.position.z = t.baseZ + flare * (t.cfg.isLeft ? 0.7 : -0.7);
          t.group.rotation.y = (t.cfg.isLeft ? 0.15 : -0.15) + Math.sin(clock * 2.5) * 0.04;
        });

        // Moving head spotlights sweeping stage
        spotCyan.position.x = -8 + Math.sin(clock * 1.8) * 3.8;
        spotCyan.position.z = 9 + Math.cos(clock * 1.4) * 2.8;
        spotCyan.intensity = 26.0 + kick * 24.0;

        spotAmber.position.x = 8 - Math.cos(clock * 1.6) * 3.8;
        spotAmber.position.z = 9 + Math.sin(clock * 1.5) * 2.8;
        spotAmber.intensity = 26.0 + snare * 26.0;

        // Align Anamorphic Optical Flare to camera view & flash on snare
        if (cam) {
          streakMesh.position.copy(cam.position);
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
          streakMesh.position.addScaledVector(fwd, 2.5);
          streakMesh.quaternion.copy(cam.quaternion);
          streakMat.opacity = Math.pow(snare, 1.5) * 0.98;
          streakMesh.scale.x = 1.0 + snare * 1.2;
        }
      }
    };
  }

  createChevronStageTexture(isLeft) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 1024;
    const ctx = cv.getContext('2d');

    if (isLeft) {
      // Left side: Cyan, Teal, Slate Charcoal, Warm Ochre, Coral Pink square
      ctx.fillStyle = '#111018';
      ctx.fillRect(0, 0, 512, 1024);

      // Diagonal Cyan band
      ctx.fillStyle = '#00daf3';
      ctx.beginPath();
      ctx.moveTo(0, 400); ctx.lineTo(512, 100); ctx.lineTo(512, 380); ctx.lineTo(0, 680);
      ctx.fill();

      // Diagonal Warm Ochre band
      ctx.fillStyle = '#ff8c00';
      ctx.beginPath();
      ctx.moveTo(0, 680); ctx.lineTo(512, 380); ctx.lineTo(512, 620); ctx.lineTo(0, 920);
      ctx.fill();

      // Deep Teal band
      ctx.fillStyle = '#005f73';
      ctx.beginPath();
      ctx.moveTo(0, 150); ctx.lineTo(512, 0); ctx.lineTo(512, 100); ctx.lineTo(0, 400);
      ctx.fill();

      // Coral Pink Accent Square
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(180, 480, 110, 110);
    } else {
      // Right side: Flame Orange, Crimson, Fuchsia Magenta, Slate, Cyan square
      ctx.fillStyle = '#111018';
      ctx.fillRect(0, 0, 512, 1024);

      // Diagonal Flame Orange band
      ctx.fillStyle = '#ff5400';
      ctx.beginPath();
      ctx.moveTo(0, 200); ctx.lineTo(512, 500); ctx.lineTo(512, 800); ctx.lineTo(0, 500);
      ctx.fill();

      // Hot Crimson band
      ctx.fillStyle = '#d40055';
      ctx.beginPath();
      ctx.moveTo(0, 500); ctx.lineTo(512, 800); ctx.lineTo(512, 1024); ctx.lineTo(0, 800);
      ctx.fill();

      // Fuchsia Magenta band
      ctx.fillStyle = '#7209b7';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(512, 280); ctx.lineTo(512, 500); ctx.lineTo(0, 200);
      ctx.fill();

      // Cyan Accent Square
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(220, 360, 110, 110);
    }

    const tex = new THREE.CanvasTexture(cv);
    return tex;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 0: Concentric Obsidian Ripple (Calm / Tranquil) [Image 1]
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneRippleTranquil() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040206);

    const amb = new THREE.AmbientLight(0x08040a, 0.04);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 4.5);
    dir.position.set(6, 12, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.0005;
    scene.add(dir);

    const rimSpot = new THREE.SpotLight(0xd40055, 20.0, 35, Math.PI / 4, 0.5, 1.4);
    rimSpot.position.set(-8, 5.5, -6);
    scene.add(rimSpot);

    const centerPoint = new THREE.PointLight(0xff8c00, 12.0, 18, 1.4);
    centerPoint.position.set(0, 1.5, 0);
    scene.add(centerPoint);

    const size = 32;
    const segs = 160;
    const lakeGeom = new THREE.PlaneGeometry(size, size, segs, segs);
    lakeGeom.rotateX(-Math.PI / 2);
    const origPos = new Float32Array(lakeGeom.attributes.position.array);

    const lakeMat = new THREE.MeshPhysicalMaterial({
      color: 0x08050e,
      roughness: 0.02,
      metalness: 0.18,
      transmission: 0.3,
      ior: 1.333,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      normalMap: this.waterNormalMap,
      normalScale: new THREE.Vector2(0.35, 0.35)
    });
    const lakeMesh = new THREE.Mesh(lakeGeom, lakeMat);
    lakeMesh.receiveShadow = true;
    scene.add(lakeMesh);

    const beadGeom = new THREE.IcosahedronGeometry(0.38, 3);
    const beadMat = new THREE.MeshPhysicalMaterial({
      color: 0x140e1c,
      roughness: 0.02,
      metalness: 0.85,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01
    });
    const beadMesh = new THREE.Mesh(beadGeom, beadMat);
    beadMesh.castShadow = true;
    scene.add(beadMesh);

    return {
      scene,
      defaultOrbit: { phi: 0.32, theta: 0.0, radius: 9.5 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.2;
        const voice = sample ? sample.voice : 0.3;
        const air = sample ? sample.air : 0.2;
        const bal = sample ? sample.balance : 0;

        beadMesh.position.y = 0.5 + Math.sin(clock * 1.6) * 0.12 + voice * 0.25;
        beadMesh.rotation.y += dt * 0.4;

        const pos = lakeGeom.attributes.position;
        const count = pos.count;
        const amp = 0.16 + voice * 0.35 + (params[0] ?? 0.5) * 0.25;
        const freq = 2.4 + (params[1] ?? 0.5) * 1.5;
        const spd = 2.6 + (params[2] ?? 0.5) * 1.8;

        for (let i = 0; i < count; i++) {
          const x = origPos[i * 3];
          const z = origPos[i * 3 + 2];
          const r = Math.sqrt(x * x + z * z);
          const rawWave = (Math.sin(r * freq - clock * spd) / (1.0 + r * 0.32)) * amp;
          const trochoidal = Math.sign(rawWave) * Math.pow(Math.abs(rawWave), 1.4);
          pos.setY(i, trochoidal);
        }
        lakeGeom.computeVertexNormals();
        pos.needsUpdate = true;

        centerPoint.intensity = 10.0 + voice * 15.0;
        rimSpot.intensity = 16.0 + kick * 20.0;
        rimSpot.position.x = -8 + bal * 3.0;
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 1: Hydraulic Blood Impact (Energetic / Peak) [Image 1]
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneRippleEnergetic() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040205);

    const amb = new THREE.AmbientLight(0x080205, 0.04);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xfff5f8, 4.5);
    dir.position.set(5, 14, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.0005;
    scene.add(dir);

    const crimsonSpot = new THREE.SpotLight(0xff0055, 32.0, 45, Math.PI / 3, 0.45, 1.2);
    crimsonSpot.position.set(0, 11, 0);
    crimsonSpot.castShadow = true;
    scene.add(crimsonSpot);

    const cyanBack = new THREE.PointLight(0x00f5ff, 16.0, 26, 1.4);
    cyanBack.position.set(0, 2.5, -7);
    scene.add(cyanBack);

    const size = 32;
    const segs = 160;
    const lakeGeom = new THREE.PlaneGeometry(size, size, segs, segs);
    lakeGeom.rotateX(-Math.PI / 2);
    const origPos = new Float32Array(lakeGeom.attributes.position.array);

    const lakeMat = new THREE.MeshPhysicalMaterial({
      color: 0x080205,
      roughness: 0.02,
      metalness: 0.22,
      transmission: 0.4,
      ior: 1.38,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      normalMap: this.waterNormalMap,
      normalScale: new THREE.Vector2(0.4, 0.4)
    });
    const lakeMesh = new THREE.Mesh(lakeGeom, lakeMat);
    lakeMesh.receiveShadow = true;
    scene.add(lakeMesh);

    const coronetGeom = new THREE.CylinderGeometry(0.55, 1.45, 1.6, 32, 6, true);
    const coronetMat = new THREE.MeshPhysicalMaterial({
      color: 0xb50035,
      roughness: 0.03,
      metalness: 0.25,
      transmission: 0.75,
      ior: 1.4,
      clearcoat: 1.0,
      side: THREE.DoubleSide
    });
    const coronetMesh = new THREE.Mesh(coronetGeom, coronetMat);
    coronetMesh.position.set(0, 0.8, 0);
    coronetMesh.castShadow = true;
    scene.add(coronetMesh);

    const numDrops = 48;
    const dropGeom = new THREE.IcosahedronGeometry(0.095, 2);
    const dropMat = new THREE.MeshPhysicalMaterial({
      color: 0xd40055,
      roughness: 0.03,
      metalness: 0.2,
      transmission: 0.85,
      ior: 1.4,
      clearcoat: 1.0
    });

    const droplets = [];
    for (let i = 0; i < numDrops; i++) {
      const m = new THREE.Mesh(dropGeom, dropMat);
      m.castShadow = true;
      m.position.set(0, -5, 0);
      scene.add(m);
      droplets.push({ mesh: m, vx: 0, vy: 0, vz: 0, active: false });
    }

    let lastKickBurst = 0;

    return {
      scene,
      defaultOrbit: { phi: 0.38, theta: 0.0, radius: 9.0 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.25;
        const snare = sample ? sample.snare : 0.15;
        const punch = sample ? (sample.level * 2.0) : 0.3;

        if (kick > 0.48 && clock - lastKickBurst > 0.18) {
          lastKickBurst = clock;
          coronetMesh.scale.set(1.4, 1.8 + kick * 1.3, 1.4);
          let triggered = 0;
          for (let d of droplets) {
            if (!d.active) {
              d.active = true;
              const angle = Math.random() * Math.PI * 2;
              const speed = 1.8 + Math.random() * 3.0;
              d.vx = Math.cos(angle) * speed;
              d.vy = 4.5 + Math.random() * 5.5 + kick * 3.5;
              d.vz = Math.sin(angle) * speed;
              d.mesh.position.set(Math.cos(angle) * 0.4, 0.4, Math.sin(angle) * 0.4);
              triggered++;
              if (triggered >= 14) break;
            }
          }
        }

        coronetMesh.scale.y += (0.8 - coronetMesh.scale.y) * 0.12;
        coronetMesh.scale.x += (1.0 - coronetMesh.scale.x) * 0.12;
        coronetMesh.scale.z = coronetMesh.scale.x;
        coronetMesh.rotation.y += dt * 0.6;

        for (let d of droplets) {
          if (d.active) {
            d.mesh.position.x += d.vx * dt;
            d.mesh.position.y += d.vy * dt;
            d.mesh.position.z += d.vz * dt;
            d.vy -= 12.5 * dt;
            if (d.mesh.position.y <= 0) {
              d.active = false;
              d.mesh.position.y = -5;
            }
          }
        }

        const shockRadius = (clock * (6.0 + (params[0] ?? 0.5) * 4.0)) % 16.0;
        const pos = lakeGeom.attributes.position;
        const count = pos.count;
        for (let i = 0; i < count; i++) {
          const x = origPos[i * 3];
          const z = origPos[i * 3 + 2];
          const r = Math.sqrt(x * x + z * z);
          const shock = Math.exp(-Math.pow(r - shockRadius, 2.0) * 1.6) * (0.65 + kick * 1.3);
          const ripple = (Math.sin(r * 4.0 - clock * 7.5) / (1.0 + r * 0.4)) * (0.14 + punch * 0.28);
          pos.setY(i, shock + ripple);
        }
        lakeGeom.computeVertexNormals();
        pos.needsUpdate = true;

        crimsonSpot.intensity = 26.0 + kick * 38.0;
        cyanBack.intensity = 14.0 + snare * 22.0;
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 2: Monolithic Obsidian Battens (Calm / Tranquil) [Image 2]
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneSlatTranquil() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040206);

    const amb = new THREE.AmbientLight(0x08040d, 0.04);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xfff0fa, 5.0);
    dir.position.set(8, 12, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.0004;
    scene.add(dir);

    const floorGeom = new THREE.PlaneGeometry(36, 24);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x06050a,
      roughness: 0.04,
      metalness: 0.92,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.position.y = -4.5;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const numSlats = 42;
    const slatW = 0.24;
    const slatH = 9.0;
    const slatD = 1.0;
    const spacing = 0.33;
    const totalW = numSlats * spacing;

    const battenGeom = new THREE.BoxGeometry(slatW, slatH, slatD);
    const battenMat = new THREE.MeshStandardMaterial({
      color: 0x121018,
      roughness: 0.25,
      metalness: 0.88,
      normalMap: this.brushedMetalNormalMap,
      normalScale: new THREE.Vector2(0.3, 0.3)
    });

    const rodGeom = new THREE.CylinderGeometry(0.025, 0.025, slatH * 0.94, 12);
    const palette = [
      new THREE.Color(0x00f0ff),
      new THREE.Color(0x8a00ff),
      new THREE.Color(0xff0066),
      new THREE.Color(0xffaa00)
    ];

    const rods = [];
    for (let i = 0; i < numSlats; i++) {
      const x = -totalW / 2 + i * spacing;
      const zArc = -Math.pow((i - numSlats / 2) / (numSlats / 2), 2) * 0.6;

      const batten = new THREE.Mesh(battenGeom, battenMat);
      batten.position.set(x, 0, zArc);
      batten.castShadow = true;
      batten.receiveShadow = true;
      scene.add(batten);

      if (i < numSlats - 1) {
        const rodColor = palette[i % palette.length].clone();
        const rodMat = new THREE.MeshBasicMaterial({ color: rodColor });
        const rod = new THREE.Mesh(rodGeom, rodMat);
        rod.position.set(x + spacing / 2, 0, zArc + 0.18);
        scene.add(rod);
        rods.push({ mesh: rod, baseColor: rodColor });
      }
    }

    return {
      scene,
      defaultOrbit: { phi: 0.15, theta: 0.2, radius: 11.0 },
      update: (clock, dt, sample, params, cam) => {
        const voice = sample ? sample.voice : 0.3;
        const melody = sample ? (sample.melodyPitch ?? 0.5) : 0.5;

        rods.forEach((r, idx) => {
          const wave = Math.sin(idx * 0.28 - clock * 1.6 + melody * 3.14) * 0.5 + 0.5;
          const bright = 0.45 + wave * (0.8 + voice * 0.9);
          r.mesh.material.color.copy(r.baseColor).multiplyScalar(bright);
        });
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 3: Kinetic Neon Slat Equalizer (Energetic / Peak) [Image 2]
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneSlatEnergetic() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030105);

    const amb = new THREE.AmbientLight(0x08030b, 0.04);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xfff2fe, 5.2);
    dir.position.set(10, 14, 12);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.0004;
    scene.add(dir);

    const snareStrobe = new THREE.PointLight(0xffffff, 0, 30);
    snareStrobe.position.set(0, 0, 5);
    scene.add(snareStrobe);

    const floorGeom = new THREE.PlaneGeometry(36, 24);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x050408,
      roughness: 0.03,
      metalness: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.position.y = -4.5;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const numSlats = 42;
    const spacing = 0.33;
    const totalW = numSlats * spacing;
    const battenGeom = new THREE.BoxGeometry(0.24, 9.0, 1.0);
    const battenMat = new THREE.MeshStandardMaterial({
      color: 0x110f17,
      roughness: 0.22,
      metalness: 0.9,
      normalMap: this.brushedMetalNormalMap,
      normalScale: new THREE.Vector2(0.3, 0.3)
    });

    const rodGeom = new THREE.CylinderGeometry(0.026, 0.026, 8.5, 12);
    const palette = [
      new THREE.Color(0x00f0ff),
      new THREE.Color(0xff0066),
      new THREE.Color(0xffaa00),
      new THREE.Color(0x9d00ff)
    ];

    const battens = [];
    const rods = [];

    for (let i = 0; i < numSlats; i++) {
      const x = -totalW / 2 + i * spacing;
      const zArc = -Math.pow((i - numSlats / 2) / (numSlats / 2), 2) * 0.6;

      const batten = new THREE.Mesh(battenGeom, battenMat);
      batten.position.set(x, 0, zArc);
      batten.castShadow = true;
      batten.receiveShadow = true;
      scene.add(batten);
      battens.push({ mesh: batten, baseX: x, baseZ: zArc, index: i });

      if (i < numSlats - 1) {
        const rodColor = palette[i % palette.length].clone();
        const rodMat = new THREE.MeshBasicMaterial({ color: rodColor });
        const rod = new THREE.Mesh(rodGeom, rodMat);
        rod.position.set(x + spacing / 2, 0, zArc + 0.18);
        scene.add(rod);
        rods.push({ mesh: rod, baseColor: rodColor });
      }
    }

    return {
      scene,
      defaultOrbit: { phi: 0.18, theta: 0.28, radius: 10.5 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.25;
        const snare = sample ? sample.snare : 0.15;
        const voice = sample ? sample.voice : 0.3;

        battens.forEach((b, idx) => {
          const wave = Math.sin(idx * 0.28 - clock * 4.5);
          const kickExtrude = Math.pow(Math.max(0, wave), 2.2) * (0.8 + kick * 1.8);
          b.mesh.position.z = b.baseZ + kickExtrude;

          const altSign = (idx % 2 === 0 ? 1 : -1);
          b.mesh.rotation.y = altSign * snare * 0.42;
        });

        rods.forEach((r, idx) => {
          const bright = 0.5 + Math.sin(idx * 0.3 - clock * 6.0) * 0.5 * (1.2 + kick * 1.5);
          r.mesh.material.color.copy(r.baseColor).multiplyScalar(bright);
          if (battens[idx]) {
            r.mesh.position.z = battens[idx].mesh.position.z + 0.2;
          }
        });

        snareStrobe.intensity = snare > 0.35 ? snare * 28.0 : 0.0;
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 4: Monolith Exhibition Sanctuary (Calm / Tranquil) [Image 3]
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneMonolithTranquil() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030205);

    const amb = new THREE.AmbientLight(0x08040a, 0.04);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xfff8fd, 5.0);
    dir.position.set(0, 14, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.0004;
    scene.add(dir);

    const amberRim = new THREE.PointLight(0xff8c00, 18.0, 25);
    amberRim.position.set(-8, 3, -4);
    scene.add(amberRim);

    const floorGeom = new THREE.PlaneGeometry(45, 45);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x050408,
      roughness: 0.03,
      metalness: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.position.y = -3.8;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const offCv = document.createElement('canvas');
    offCv.width = 256;
    offCv.height = 512;
    const offCtx = offCv.getContext('2d');
    const artTex = new THREE.CanvasTexture(offCv);

    const monoliths = [];
    const slabW = 1.7;
    const slabH = 7.6;
    const slabD = 0.42;

    const slabGeom = new THREE.BoxGeometry(slabW, slabH, slabD);
    const slabBodyMat = new THREE.MeshStandardMaterial({
      color: 0x09070e,
      roughness: 0.2,
      metalness: 0.88,
      normalMap: this.brushedMetalNormalMap,
      normalScale: new THREE.Vector2(0.3, 0.3)
    });
    const displayMat = new THREE.MeshBasicMaterial({ map: artTex });

    const coords = [
      { x: -5.0, z: -1.6, rotY: 0.25 },
      { x: -2.5, z: 0.2, rotY: 0.12 },
      { x: 0.0,  z: 1.2, rotY: 0.0 },
      { x: 2.5,  z: 0.2, rotY: -0.12 },
      { x: 5.0,  z: -1.6, rotY: -0.25 }
    ];

    coords.forEach((c) => {
      const slabGroup = new THREE.Group();
      slabGroup.position.set(c.x, 0, c.z);
      slabGroup.rotation.y = c.rotY;

      const body = new THREE.Mesh(slabGeom, slabBodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      slabGroup.add(body);

      const faceGeom = new THREE.PlaneGeometry(slabW * 0.92, slabH * 0.94);
      const face = new THREE.Mesh(faceGeom, displayMat);
      face.position.set(0, 0, slabD / 2 + 0.01);
      slabGroup.add(face);

      scene.add(slabGroup);
      monoliths.push(slabGroup);
    });

    return {
      scene,
      defaultOrbit: { phi: 0.18, theta: 0.0, radius: 10.5 },
      update: (clock, dt, sample, params, cam) => {
        const voice = sample ? sample.voice : 0.3;
        const w = offCv.width, h = offCv.height;
        const grad = offCtx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a0510');
        grad.addColorStop(0.3 + Math.sin(clock * 0.5) * 0.15, '#d40055');
        grad.addColorStop(0.6 + Math.cos(clock * 0.7) * 0.15, '#6b0099');
        grad.addColorStop(0.85, '#00daf3');
        grad.addColorStop(1, '#ff8c00');
        offCtx.fillStyle = grad;
        offCtx.fillRect(0, 0, w, h);

        offCtx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        for (let j = 0; j < 3; j++) {
          offCtx.beginPath();
          offCtx.arc(w / 2 + Math.sin(clock * 1.5 + j) * 60, h * (0.3 + j * 0.25), 80 + voice * 45, 0, Math.PI * 2);
          offCtx.fill();
        }
        artTex.needsUpdate = true;
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 5: Monolith Strobe Surge (Energetic / Peak) [Image 3]
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneMonolithEnergetic() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030104);

    const amb = new THREE.AmbientLight(0x0a030c, 0.04);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 5.5);
    dir.position.set(0, 16, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    scene.add(dir);

    const floorGeom = new THREE.PlaneGeometry(45, 45, 60, 60);
    floorGeom.rotateX(-Math.PI / 2);
    const origFloorPos = new Float32Array(floorGeom.attributes.position.array);

    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x050408,
      roughness: 0.03,
      metalness: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.position.y = -3.8;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const slabW = 1.7;
    const slabH = 7.6;
    const slabD = 0.42;
    const slabGeom = new THREE.BoxGeometry(slabW, slabH, slabD);
    const slabBodyMat = new THREE.MeshStandardMaterial({
      color: 0x0b0912,
      roughness: 0.18,
      metalness: 0.9
    });

    const beamGeom = new THREE.CylinderGeometry(0.85, 1.6, 26, 24, 1, true);
    const beamPalette = [
      new THREE.Color(0xd40055),
      new THREE.Color(0x00daf3),
      new THREE.Color(0xff8c00),
      new THREE.Color(0x00daf3),
      new THREE.Color(0xd40055)
    ];

    const monoliths = [];
    const beams = [];
    const coords = [
      { x: -5.0, z: -1.6, rotY: 0.25 },
      { x: -2.5, z: 0.2, rotY: 0.12 },
      { x: 0.0,  z: 1.2, rotY: 0.0 },
      { x: 2.5,  z: 0.2, rotY: -0.12 },
      { x: 5.0,  z: -1.6, rotY: -0.25 }
    ];

    coords.forEach((c, idx) => {
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.z);
      g.rotation.y = c.rotY;

      const body = new THREE.Mesh(slabGeom, slabBodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      const stripGeom = new THREE.PlaneGeometry(0.4, slabH * 0.9);
      const stripMat = new THREE.MeshBasicMaterial({ color: beamPalette[idx] });
      const strip = new THREE.Mesh(stripGeom, stripMat);
      strip.position.set(0, 0, slabD / 2 + 0.01);
      g.add(strip);

      const beamMat = new THREE.MeshBasicMaterial({
        color: beamPalette[idx],
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const beam = new THREE.Mesh(beamGeom, beamMat);
      beam.position.set(0, slabH / 2 + 13, 0);
      g.add(beam);

      scene.add(g);
      monoliths.push(g);
      beams.push({ mesh: beam, baseColor: beamPalette[idx], strip });
    });

    return {
      scene,
      defaultOrbit: { phi: 0.22, theta: 0.0, radius: 10.5 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.25;
        const snare = sample ? sample.snare : 0.15;

        beams.forEach((b, idx) => {
          const p = b.mesh;
          const targetOpac = 0.2 + kick * 0.75 + (idx === 2 ? snare * 0.5 : 0);
          p.material.opacity += (targetOpac - p.material.opacity) * 0.3;
          p.scale.x = 1.0 + kick * 0.45;
          p.scale.z = p.scale.x;
          b.strip.material.color.copy(b.baseColor).multiplyScalar(1.0 + kick * 4.5);
        });

        if (kick > 0.3) {
          const pos = floorGeom.attributes.position;
          const count = pos.count;
          for (let i = 0; i < count; i++) {
            const x = origFloorPos[i * 3];
            const z = origFloorPos[i * 3 + 2];
            const r = Math.sqrt(x * x + z * z);
            const wave = Math.sin(r * 2.0 - clock * 8.0) * (kick * 0.2);
            pos.setY(i, wave);
          }
          floorGeom.computeVertexNormals();
          pos.needsUpdate = true;
        }
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 6: Origami Facet Geometry (Calm / Tranquil) [Image 4]
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneChevronTranquil() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030205);

    const amb = new THREE.AmbientLight(0x08030a, 0.04);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xfff3fa, 4.8);
    dir.position.set(7, 10, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.0004;
    scene.add(dir);

    const amberSpot = new THREE.SpotLight(0xff8c00, 20.0, 30, Math.PI / 4, 0.5, 1.4);
    amberSpot.position.set(-8, 6, 6);
    scene.add(amberSpot);

    const wingGroup = new THREE.Group();
    scene.add(wingGroup);

    const matCrimson = new THREE.MeshStandardMaterial({ color: 0xa80042, roughness: 0.35, metalness: 0.25 });
    const matViolet = new THREE.MeshStandardMaterial({ color: 0x52007d, roughness: 0.35, metalness: 0.25 });
    const matSlate = new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.38, metalness: 0.3 });
    const materials = [matCrimson, matViolet, matSlate];

    const numRows = 5;
    const numCols = 7;
    const prismW = 1.4;
    const prismH = 1.4;
    const prismD = 0.55;
    const chevronPrismGeom = new THREE.ConeGeometry(prismW * 0.75, prismD, 4);
    chevronPrismGeom.rotateX(Math.PI / 2);

    const facets = [];
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const mat = materials[(r + c) % materials.length];
        const m = new THREE.Mesh(chevronPrismGeom, mat);
        const x = (c - (numCols - 1) / 2) * (prismW * 1.05);
        const y = (r - (numRows - 1) / 2) * (prismH * 1.05);
        const z = -Math.pow((c - (numCols - 1) / 2) / 3.0, 2) * 1.5 - Math.pow((r - (numRows - 1) / 2) / 2.0, 2) * 0.8;

        m.position.set(x, y, z);
        m.rotation.z = ((r + c) % 2 === 0 ? 0.785 : -0.785);
        m.castShadow = true;
        m.receiveShadow = true;
        wingGroup.add(m);
        facets.push({ mesh: m, baseX: x, baseY: y, baseZ: z, r, c });
      }
    }

    return {
      scene,
      defaultOrbit: { phi: 0.12, theta: 0.1, radius: 9.8 },
      update: (clock, dt, sample, params, cam) => {
        const voice = sample ? sample.voice : 0.3;
        facets.forEach(f => {
          const breath = Math.sin(f.r * 0.4 + f.c * 0.3 + clock * 1.5) * (0.05 + voice * 0.08);
          f.mesh.position.z = f.baseZ + breath;
          f.mesh.rotation.y = Math.sin(clock * 0.8 + f.c * 0.5) * 0.06;
        });
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE 7: Kinetic Origami Tessellation (Energetic / Peak) [Image 4]
  // ──────────────────────────────────────────────────────────────────────────
  buildSceneChevronEnergetic() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030104);

    const amb = new THREE.AmbientLight(0x0a040d, 0.04);
    scene.add(amb);

    const spotCyan = new THREE.SpotLight(0x00daf3, 26.0, 35, Math.PI / 3.5, 0.4, 1.2);
    spotCyan.position.set(-6, 8, 7);
    spotCyan.castShadow = true;
    spotCyan.shadow.mapSize.width = 2048;
    spotCyan.shadow.mapSize.height = 2048;
    scene.add(spotCyan);

    const spotAmber = new THREE.SpotLight(0xff8c00, 26.0, 35, Math.PI / 3.5, 0.4, 1.2);
    spotAmber.position.set(6, 8, 7);
    spotAmber.castShadow = true;
    spotAmber.shadow.mapSize.width = 2048;
    spotAmber.shadow.mapSize.height = 2048;
    scene.add(spotAmber);

    const wingGroup = new THREE.Group();
    scene.add(wingGroup);

    const matCrimson = new THREE.MeshStandardMaterial({ color: 0xcc004e, roughness: 0.28, metalness: 0.35 });
    const matCyan = new THREE.MeshStandardMaterial({ color: 0x00a8c2, roughness: 0.26, metalness: 0.4 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x110f17, roughness: 0.35, metalness: 0.4 });
    const materials = [matCrimson, matCyan, matDark];

    const numRows = 5;
    const numCols = 7;
    const prismW = 1.4;
    const prismH = 1.4;
    const prismD = 0.6;
    const chevronPrismGeom = new THREE.ConeGeometry(prismW * 0.75, prismD, 4);
    chevronPrismGeom.rotateX(Math.PI / 2);

    const facets = [];
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const mat = materials[(r + c) % materials.length];
        const m = new THREE.Mesh(chevronPrismGeom, mat);
        const x = (c - (numCols - 1) / 2) * (prismW * 1.05);
        const y = (r - (numRows - 1) / 2) * (prismH * 1.05);
        const z = -Math.pow((c - (numCols - 1) / 2) / 3.0, 2) * 1.5;

        m.position.set(x, y, z);
        m.rotation.z = ((r + c) % 2 === 0 ? 0.785 : -0.785);
        m.castShadow = true;
        m.receiveShadow = true;
        wingGroup.add(m);
        facets.push({ mesh: m, baseX: x, baseY: y, baseZ: z, r, c });
      }
    }

    return {
      scene,
      defaultOrbit: { phi: 0.18, theta: 0.0, radius: 9.8 },
      update: (clock, dt, sample, params, cam) => {
        const kick = sample ? sample.kick : 0.25;
        const snare = sample ? sample.snare : 0.15;
        const voice = sample ? sample.voice : 0.3;

        facets.forEach(f => {
          if (f.r < 2) {
            const flare = kick * 0.65;
            f.mesh.rotation.x = flare;
            f.mesh.position.z = f.baseZ + flare * 0.85;
          } else if (f.r === 2) {
            f.mesh.rotation.y = Math.sin(f.c * 0.5 + clock * 3.0) * (voice * 0.55);
          } else {
            f.mesh.rotation.z = (f.r + f.c) % 2 === 0 ? (0.785 + snare * 0.45) : (-0.785 - snare * 0.45);
          }
        });

        spotCyan.position.x = -6 + Math.sin(clock * 1.8) * 3.2;
        spotCyan.position.z = 7 + Math.cos(clock * 1.4) * 2.2;
        spotCyan.intensity = 20.0 + kick * 24.0;

        spotAmber.position.x = 6 - Math.cos(clock * 1.6) * 3.2;
        spotAmber.position.z = 7 + Math.sin(clock * 1.5) * 2.2;
        spotAmber.intensity = 20.0 + snare * 26.0;
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main Render Loop for Three.js Engine
  // ──────────────────────────────────────────────────────────────────────────
  render(clock, dt, sample, params) {
    if (!this.renderer || !this.camera) return;

    // Smooth camera orbit interpolation
    this.orbit.phi += (this.orbit.targetPhi - this.orbit.phi) * 0.08;
    this.orbit.theta += (this.orbit.targetTheta - this.orbit.theta) * 0.08;
    this.orbit.radius += (this.orbit.targetRadius - this.orbit.radius) * 0.08;

    const r = this.orbit.radius;
    const p = this.orbit.phi;
    const t = this.orbit.theta;

    const activeScene = this.scenes[this.activeSceneIdx];
    const target = (activeScene && activeScene.target) ? activeScene.target : new THREE.Vector3(0, 0.5, 0);

    this.camera.position.x = target.x + r * Math.cos(p) * Math.sin(t);
    this.camera.position.y = target.y + r * Math.sin(p);
    this.camera.position.z = target.z + r * Math.cos(p) * Math.cos(t);
    this.camera.lookAt(target);

    if (activeScene) {
      if (activeScene.update) {
        activeScene.update(clock, dt, sample, params, this.camera);
      }
      this.renderer.render(activeScene.scene, this.camera);
    }
  }
}
