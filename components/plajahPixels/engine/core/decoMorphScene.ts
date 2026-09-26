import type { SceneInst } from './flux';
import type { FluxDriven, FluxSpec } from '../../../../services/fabula/fluxNode';

/**
 * DecoGeometryMorph — Real-time 3D volumetric geometric morph engine across authentic Art Deco pattern motifs.
 * Continuously repeats and randomly advances through different patterns on its own, conducted by music.
 * Used natively across Plajah Pixels, Chora Album FXStage, Chora Mixes, and Fabula.
 */
export function buildDecoMorph(THREE: any, renderer: any): SceneInst {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const owned: any[] = [];
  const own = (x: any) => { owned.push(x); return x; };

  // 1. High-Density Parametric 3D Plane Mesh (16:9 ratio, 280 x 158 grid = ~44k vertices)
  const planeGeo = own(new THREE.PlaneGeometry(16, 9, 280, 158));

  // 2. Procedural Multi-Motif Art Deco Shader Material
  const customMaterial = own(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uVoice: { value: 0 },
      uIntensity: { value: 0 },
      uMorphProgress: { value: 0 },
      uFromPattern: { value: 0 },
      uToPattern: { value: 1 },
      uTransStyle: { value: 0 },    // 0: 3D Shatter, 1: Origami, 2: Vortex, 3: Portal
      uPaletteMode: { value: 0 },   // 0: Imperial Gold, 1: Emerald Gatsby, 2: Sapphire Night, 3: Cyber
      uExtrusionScale: { value: 2.2 },
      uVortexTorque: { value: 1.5 },
      uBloomBoost: { value: 2.5 }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uBass;
      uniform float uMid;
      uniform float uTreble;
      uniform float uVoice;
      uniform float uIntensity;
      uniform float uMorphProgress;
      uniform int uFromPattern;
      uniform int uToPattern;
      uniform int uTransStyle;
      uniform float uExtrusionScale;
      uniform float uVortexTorque;

      varying vec2 vUv;
      varying vec3 vNormalVec;
      varying float vDisplacement;
      varying float vArtFeature;

      // --- 5 Authentic Art Deco Procedural Geometric Motifs ---
      // 0: Sunburst Lotus
      float motifSunburst(vec2 p) {
        float r = length(p);
        float a = atan(p.y, p.x);
        float rays = sin(a * 16.0);
        float rings = sin(r * 22.0 - uTime * 0.8);
        return smoothstep(0.1, 0.6, rays * rings * exp(-r * 0.8));
      }

      // 1: Stepped Diamond Portals
      float motifDiamond(vec2 p) {
        vec2 dp = abs(p);
        float d1 = abs(dp.x + dp.y - 1.4);
        float d2 = abs(dp.x + dp.y - 0.8);
        float d3 = abs(dp.x + dp.y - 0.3);
        return smoothstep(0.12, 0.0, d1) + smoothstep(0.1, 0.0, d2) + smoothstep(0.08, 0.0, d3);
      }

      // 2: Imperial Skyscraper Columns & Chevrons
      float motifColumn(vec2 p) {
        float col = abs(sin(p.x * 10.0));
        float chevron = abs(sin(p.y * 7.0 + abs(p.x) * 4.0));
        return smoothstep(0.35, 0.05, col * chevron);
      }

      // 3: Concentric Archway Ribbons
      float motifArchways(vec2 p) {
        vec2 ap = p;
        ap.y += 0.8;
        float r = length(ap);
        float bands = abs(fract(r * 3.5) - 0.5);
        return smoothstep(0.4, 0.08, bands);
      }

      // 4: Pleated Fan Lattice
      float motifLattice(vec2 p) {
        vec2 grid = abs(fract(p * 2.0) - 0.5);
        float fan = sin(atan(grid.y, grid.x) * 8.0);
        return smoothstep(0.2, 0.5, fan * (1.0 - length(grid)));
      }

      float sampleMotif(int id, vec2 p) {
        if (id == 0) return motifSunburst(p);
        if (id == 1) return motifDiamond(p);
        if (id == 2) return motifColumn(p);
        if (id == 3) return motifArchways(p);
        return motifLattice(p);
      }

      void main() {
        vUv = uv;
        vec2 p = (uv - 0.5) * vec2(1.77, 1.0) * 3.5;
        float r = length(p);

        // Interpolate motifs based on morph progress
        float featFrom = sampleMotif(uFromPattern, p);
        float featTo = sampleMotif(uToPattern, p);
        float curFeature = mix(featFrom, featTo, uMorphProgress);
        vArtFeature = curFeature;

        vec3 pos = position;

        // 1. Music-Driven Physical Z Extrusion
        float bassExtrude = curFeature * uBass * uExtrusionScale;
        float shockwave = sin(r * 18.0 - uTime * 4.5) * exp(-r * 0.8) * uMid * 0.7;
        float trebleGlint = sin(pos.x * 20.0 + uTime * 12.0) * uTreble * 0.25;
        float totalZ = bassExtrude + shockwave + trebleGlint;

        // 2. ACTUAL GEOMETRY MORPH TRANSFORMATIONS (Between Clips/Motifs)
        if (uMorphProgress > 0.001 && uMorphProgress < 0.999) {
          float peak = sin(uMorphProgress * 3.14159);

          if (uTransStyle == 0) {
            // 3D GEOMETRY SHATTER & REASSEMBLE
            vec2 tileId = floor(uv * 32.0);
            float tileNoise = fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);
            totalZ += peak * (tileNoise * 3.8 + 1.2) * (1.0 + uBass * 1.4);
            float spinAngle = peak * 3.14159 * (tileNoise - 0.5) * 2.0;
            float cs = cos(spinAngle), ss = sin(spinAngle);
            pos.xy = vec2(pos.x * cs - pos.y * ss, pos.x * ss + pos.y * cs);
          } else if (uTransStyle == 1) {
            // ORIGAMI FAN FOLD
            float folds = sin(pos.x * 8.0);
            totalZ += folds * peak * 2.8 * (1.0 + uMid);
            pos.x *= 1.0 - peak * 0.45;
          } else if (uTransStyle == 2) {
            // VORTEX SINGULARITY
            float twist = peak * 6.28318 * (1.0 - smoothstep(0.0, 3.5, r));
            float cv = cos(twist), sv = sin(twist);
            pos.xy = vec2(pos.x * cv - pos.y * sv, pos.x * sv + pos.y * cv);
            totalZ -= peak * 3.5 * (1.0 - smoothstep(0.0, 3.5, r));
          } else {
            // 3D PORTAL TUNNEL
            totalZ += peak * (1.0 - smoothstep(0.0, 3.5, r)) * 4.5 * uExtrusionScale;
          }
        }

        vDisplacement = totalZ;
        vNormalVec = normal;

        vec3 newPos = pos + normal * totalZ;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBass;
      uniform float uTreble;
      uniform float uVoice;
      uniform float uIntensity;
      uniform int uPaletteMode;
      uniform float uBloomBoost;

      varying vec2 vUv;
      varying vec3 vNormalVec;
      varying float vDisplacement;
      varying float vArtFeature;

      void main() {
        vec3 gold = vec3(0.92, 0.76, 0.38);
        vec3 pinkNeon = vec3(1.0, 0.05, 0.55);
        vec3 obsidian = vec3(0.04, 0.04, 0.06);

        if (uPaletteMode == 1) {
          // Emerald Gatsby
          gold = vec3(0.85, 0.72, 0.25);
          pinkNeon = vec3(0.0, 0.95, 0.85);
          obsidian = vec3(0.02, 0.07, 0.04);
        } else if (uPaletteMode == 2) {
          // Cobalt Sapphire
          gold = vec3(0.95, 0.65, 0.45);
          pinkNeon = vec3(0.7, 0.1, 1.0);
          obsidian = vec3(0.02, 0.03, 0.08);
        } else if (uPaletteMode == 3) {
          // Cyber Neon
          gold = vec3(1.0, 0.85, 0.3);
          pinkNeon = vec3(0.0, 1.0, 0.9);
          obsidian = vec3(0.06, 0.02, 0.08);
        }

        float reliefGlint = clamp(vDisplacement * 0.45, 0.0, 0.8);
        vec3 surfaceColor = mix(obsidian, gold + reliefGlint * 0.35, vArtFeature);

        float edge = abs(dFdx(vArtFeature)) + abs(dFdy(vArtFeature));
        surfaceColor += pinkNeon * edge * 8.5 * (1.0 + uTreble * uBloomBoost);
        surfaceColor += gold * (uVoice * 0.45) * exp(-length(vUv - 0.5) * 3.0);

        gl_FragColor = vec4(surfaceColor, 1.0);
      }
    `,
    side: THREE.DoubleSide
  }));

  const mesh = own(new THREE.Mesh(planeGeo, customMaterial));
  scene.add(mesh);

  // Lighting Rig
  const keyLight = new THREE.PointLight(0xffdda5, 90, 40, 2);
  keyLight.position.set(-2, 3, 7);
  scene.add(keyLight);

  const fillLight = new THREE.HemisphereLight(0xff66cc, 0x101018, 2.5);
  scene.add(fillLight);

  let lastTime = -1;
  let patternTimer = 0;
  let currentPattern = 0;
  let targetPattern = 1;
  let isMorphing = false;
  let morphProgress = 0;
  const MORPH_DURATION = 2.4;
  const PATTERN_HOLD_TIME = 8.0; // Advance every 8 seconds / phrase on its own

  return {
    scene,
    camera,
    cam: {
      target: [0, 0, 0],
      radius: 13.5,
      pitch: 0,
      yaw: 0,
      fov: 45,
      lock: false
    },
    exposure: 1.15,
    brightThreshold: 0.82,
    grain: 0.015,
    update(t: number, a: FluxDriven, spec: FluxSpec) {
      const dt = lastTime < 0 || t < lastTime || t - lastTime > 2 ? 1 / 60 : Math.min(0.2, t - lastTime);
      lastTime = t;

      const bass = a.bass;
      const mid = a.mid;
      const treble = a.treble;
      const voice = a.voice ?? 0;
      const energy = Math.min(1.0, a.intensity ?? 0);

      // --- Autonomous Repeating & Random Pattern Advance Engine ---
      patternTimer += dt;
      if (!isMorphing) {
        // Trigger next random pattern on phrase timeout or major energy drop/transient
        if (patternTimer >= PATTERN_HOLD_TIME || (patternTimer >= 4.0 && energy > 0.85 && Math.random() < 0.02)) {
          isMorphing = true;
          patternTimer = 0;
          morphProgress = 0;

          // Pick a random new pattern (different from current)
          let nextP = Math.floor(Math.random() * 5);
          if (nextP === currentPattern) nextP = (currentPattern + 1) % 5;
          targetPattern = nextP;

          // Randomize Geometry Morph Style (Shatter, Origami, Vortex, Portal)
          const randomStyle = Math.floor(Math.random() * 4);
          customMaterial.uniforms.uTransStyle.value = randomStyle;
          customMaterial.uniforms.uFromPattern.value = currentPattern;
          customMaterial.uniforms.uToPattern.value = targetPattern;
        }
      } else {
        morphProgress += dt / MORPH_DURATION;
        if (morphProgress >= 1.0) {
          morphProgress = 0;
          isMorphing = false;
          currentPattern = targetPattern;
          customMaterial.uniforms.uFromPattern.value = currentPattern;
          customMaterial.uniforms.uMorphProgress.value = 0;
        } else {
          customMaterial.uniforms.uMorphProgress.value = morphProgress;
        }
      }

      customMaterial.uniforms.uTime.value = t;
      customMaterial.uniforms.uBass.value = bass;
      customMaterial.uniforms.uMid.value = mid;
      customMaterial.uniforms.uTreble.value = treble;
      customMaterial.uniforms.uVoice.value = voice;
      customMaterial.uniforms.uIntensity.value = energy;

      // Palette modulation: either from UI spec or auto-cycling
      const palette = typeof spec.hue === 'number' ? Math.floor(spec.hue * 4) % 4 : Math.floor((t / 16.0) % 4);
      customMaterial.uniforms.uPaletteMode.value = palette;

      // Music autonomously conducts visualizer parameters
      customMaterial.uniforms.uExtrusionScale.value = 1.8 + bass * 1.6;
      customMaterial.uniforms.uVortexTorque.value = 1.2 + energy * 1.8;

      keyLight.intensity = 70 + energy * 60 + bass * 40;
    },
    bloom: (a: FluxDriven) => 0.2 + Math.min(1, a.intensity ?? 0) * 0.25,
    dispose() {
      owned.forEach(o => o.dispose?.());
    }
  };
}
