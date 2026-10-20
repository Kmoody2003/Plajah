import os

TARGET = r"c:\Users\Kenne\plajah\components\taleo\HauntedCastleExhibition.tsx"

with open(TARGET, "r", encoding="utf-8") as f:
    code = f.read()

# ---------------------------------------------------------------------------
# 1. Add XP, Level, MaxHP, RewardPopups & Live Art/Game Council Voice State
# ---------------------------------------------------------------------------
old_state_block = """  const [playerHp, setPlayerHp] = useState<number>(100);
  const [monstersSlain, setMonstersSlain] = useState<number>(0);
  const [activeMonsterCount, setActiveMonsterCount] = useState<number>(8);
  const [combatLogText, setCombatLogText] = useState<string>(
    '🛣️ Started out on the Lonesome Crossroads Road! Walk North past the glowing Movie Billboards into the 12-Room Haunted Castle Mansion.'
  );"""

new_state_block = """  const [playerHp, setPlayerHp] = useState<number>(100);
  const [playerMaxHp, setPlayerMaxHp] = useState<number>(100);
  const [playerXp, setPlayerXp] = useState<number>(0);
  const [playerLevel, setPlayerLevel] = useState<number>(1);
  const [rewardPopups, setRewardPopups] = useState<
    Array<{ id: number; xp: number; hp: number; label: string; color: string }>
  >([]);
  const [councilVoiceEnabled, setCouncilVoiceEnabled] = useState<boolean>(false);
  const councilVoiceEnabledRef = useRef<boolean>(false);
  councilVoiceEnabledRef.current = councilVoiceEnabled;
  const [artCouncilNote, setArtCouncilNote] = useState<string>(
    '🎨 ART COUNCIL (Søren & Rembrandt): "Ravencrest approach road active — wet specular asphalt, 3-lamp gooseneck billboards, and Mie-scattered moonlight diffusing through rolling ground fog."'
  );
  const [gameCouncilNote, setGameCouncilNote] = useState<string>(
    '🎮 GAME COUNCIL (Elena & Hideo): "Jack Thorne & Elise Carter high-poly rigs online with personality-driven katana/bat stances. Slay creatures of the fog to earn +XP, Level-Ups & +HP Leech!"'
  );
  const [monstersSlain, setMonstersSlain] = useState<number>(0);
  const [activeMonsterCount, setActiveMonsterCount] = useState<number>(8);
  const [combatLogText, setCombatLogText] = useState<string>(
    '🛣️ RAVENCREST — 12 MILES: Follow the wet moonlit highway past the Ravencrest billboards, cross the Moat Drawbridge, and enter Ravencrest Castle!'
  );

  const announceCouncilDirective = useCallback(
    (artMsg?: string, gameMsg?: string, speakText?: string) => {
      if (artMsg) setArtCouncilNote(artMsg);
      if (gameMsg) setGameCouncilNote(gameMsg);
      if (
        councilVoiceEnabledRef.current &&
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        speakText
      ) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(speakText);
          utter.rate = 1.04;
          utter.pitch = 0.92;
          utter.volume = 0.75;
          window.speechSynthesis.speak(utter);
        } catch {}
      }
    },
    []
  );"""

assert old_state_block in code, "old_state_block not found"
code = code.replace(old_state_block, new_state_block, 1)

# ---------------------------------------------------------------------------
# 2. Extend playerStateRef with xp, level, maxHp
# ---------------------------------------------------------------------------
old_pref_type = """    molotovThrowQueue: number;
    hp: number;
    kills: number;
  }>({"""

new_pref_type = """    molotovThrowQueue: number;
    hp: number;
    maxHp: number;
    xp: number;
    level: number;
    kills: number;
  }>({"""

assert old_pref_type in code, "old_pref_type not found"
code = code.replace(old_pref_type, new_pref_type, 1)

old_pref_init = """    molotovThrowQueue: 0,
    hp: 100,
    kills: 0,
  });"""

new_pref_init = """    molotovThrowQueue: 0,
    hp: 100,
    maxHp: 100,
    xp: 0,
    level: 1,
    kills: 0,
  });"""

assert old_pref_init in code, "old_pref_init not found"
code = code.replace(old_pref_init, new_pref_init, 1)

# ---------------------------------------------------------------------------
# 3. Upgrade Ravencrest Texture Loading, Volumetric Fog + Mie Light Diffusion,
#    Ravencrest Billboards with 3 Overhead Lamps & Perched Ravens, Guardrails,
#    and Grand Hall Medallion + Suits of Armor + Banners
# ---------------------------------------------------------------------------
old_pbr_block = """    // Load Photographic + AI PBR Texture Sets (Color + Normal + Roughness)
    const asphaltPbr = loadPbrTexSet(
      '/models/halloween/textures/asphalt_road.png',
      '/models/halloween/textures/normals/asphalt_road_normal.png',
      '/models/halloween/textures/normals/asphalt_road_rough.png',
      4,
      24
    );
    const castleStonePbr = loadPbrTexSet(
      '/models/halloween/textures/stone_wall_photo.jpg',
      '/models/halloween/textures/normals/stone_wall_photo_normal.png',
      '/models/halloween/textures/normals/stone_wall_photo_rough.png',
      8,
      5
    );
    const gothicBrickPbr = loadPbrTexSet(
      '/models/halloween/textures/gothic_brick.jpg',
      '/models/halloween/textures/normals/gothic_brick_normal.png',
      '/models/halloween/textures/normals/gothic_brick_rough.png',
      6,
      4
    );
    const darkMarblePbr = loadPbrTexSet(
      '/models/halloween/textures/dark_marble.jpg',
      '/models/halloween/textures/normals/dark_marble_normal.png',
      '/models/halloween/textures/normals/dark_marble_rough.png',
      6,
      6
    );
    const woodFloorPbr = loadPbrTexSet(
      '/models/halloween/textures/wood_floor.jpg',
      '/models/halloween/textures/normals/wood_floor_normal.png',
      '/models/halloween/textures/normals/wood_floor_rough.png',
      6,
      6
    );
    const oakWoodPbr = loadPbrTexSet(
      '/models/halloween/textures/oak_wood.jpg',
      '/models/halloween/textures/normals/oak_wood_normal.png',
      '/models/halloween/textures/normals/oak_wood_rough.png',
      4,
      2
    );
    const velvetCurtainPbr = loadPbrTexSet(
      '/models/halloween/textures/velvet_curtain.jpg',
      '/models/halloween/textures/normals/velvet_curtain_normal.png',
      '/models/halloween/textures/normals/velvet_curtain_rough.png',
      1,
      2
    );"""

new_pbr_block = """    // Load Extracted RAVENCREST Master PBR Texture Sets (Color + Normal + Roughness from Hallowen Showcase assets.zip!)
    const asphaltPbr = loadPbrTexSet(
      '/models/halloween/textures/asphalt_road.png',
      '/models/halloween/textures/normals/asphalt_road_normal.png',
      '/models/halloween/textures/normals/asphalt_road_rough.png',
      4,
      24
    );
    const castleStonePbr = loadPbrTexSet(
      '/models/halloween/ravencrest/stone_wall.png',
      '/models/halloween/ravencrest/stone_wall_normal.png',
      '/models/halloween/ravencrest/stone_wall_roughness.png',
      10,
      6
    );
    const gothicBrickPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/stone_wall.png',
      '/models/halloween/ravencrest/stone_wall_normal.png',
      '/models/halloween/ravencrest/stone_wall_roughness.png',
      7,
      5
    );
    const darkMarblePbr = loadPbrTexSet(
      '/models/halloween/ravencrest/stone_floor.png',
      '/models/halloween/ravencrest/stone_floor_normal.png',
      '/models/halloween/ravencrest/stone_floor_roughness.png',
      8,
      8
    );
    const woodFloorPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/wood_planks.png',
      '/models/halloween/ravencrest/wood_planks_normal.png',
      '/models/halloween/ravencrest/wood_planks_roughness.png',
      6,
      6
    );
    const oakWoodPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/wood_beam.png',
      '/models/halloween/ravencrest/wood_beam_normal.png',
      '/models/halloween/ravencrest/wood_beam_roughness.png',
      4,
      2
    );
    const velvetCurtainPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/velvet_fabric.png',
      '/models/halloween/ravencrest/velvet_fabric_normal.png',
      '/models/halloween/ravencrest/velvet_fabric_roughness.png',
      2,
      2
    );
    const ravencrestCarpetPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/carpet_rug.png',
      '/models/halloween/ravencrest/carpet_rug_normal.png',
      '/models/halloween/ravencrest/carpet_rug_roughness.png',
      1,
      4
    );"""

assert old_pbr_block in code, "old_pbr_block not found"
code = code.replace(old_pbr_block, new_pbr_block, 1)

# Update marbleFloorMat & redCarpetMat for Ravencrest Grand Hall wet-look specular reflection
old_marble_carpet = """    const marbleFloorMat = new THREE.MeshStandardMaterial({
      map: darkMarblePbr.map,
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: darkMarblePbr.roughnessMap,
      color: '#7a7090',
      roughness: 0.28,
      metalness: 0.24,
    });
    const cryptWaterMat = new THREE.MeshStandardMaterial({
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      color: '#0d3b49',
      roughness: 0.08,
      metalness: 0.88,
      emissive: new THREE.Color('#094c5e'),
      emissiveIntensity: 0.45,
    });
    const redCarpetMat = new THREE.MeshStandardMaterial({
      map: velvetCurtainPbr.map,
      normalMap: velvetCurtainPbr.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      color: '#a31d36',
      roughness: 0.68,
      emissive: new THREE.Color('#3b0712'),
      emissiveIntensity: 0.28,
    });"""

new_marble_carpet = """    const marbleFloorMat = new THREE.MeshStandardMaterial({
      map: darkMarblePbr.map,
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: darkMarblePbr.roughnessMap,
      color: '#6b7688',
      roughness: 0.14,
      metalness: 0.36,
    });
    const cryptWaterMat = new THREE.MeshStandardMaterial({
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      color: '#0d3b49',
      roughness: 0.06,
      metalness: 0.90,
      emissive: new THREE.Color('#094c5e'),
      emissiveIntensity: 0.45,
    });
    const redCarpetMat = new THREE.MeshStandardMaterial({
      map: ravencrestCarpetPbr.map,
      normalMap: ravencrestCarpetPbr.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      color: '#b82538',
      roughness: 0.58,
      emissive: new THREE.Color('#3b0712'),
      emissiveIntensity: 0.24,
    });"""

assert old_marble_carpet in code, "old_marble_carpet not found"
code = code.replace(old_marble_carpet, new_marble_carpet, 1)

# ---------------------------------------------------------------------------
# 4. Add Volumetric Fog + Anisotropic Light Diffusion Shaders, Ravencrest
#    Guardrail + Reflectors + Billboards with 3 Overhead Lamps & Perched Ravens
# ---------------------------------------------------------------------------
old_road_and_pumpkins = """    // Long Pumpkin Patch North-South Highway (`Z = +68` to `Z = -12`, 80m long!)
    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltPbr.map,
      normalMap: asphaltPbr.normalMap,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughnessMap: asphaltPbr.roughnessMap,
      color: '#625b70',
      roughness: 0.42,
      metalness: 0.26,
    });
    const nsRoad = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 80), roadMat);
    nsRoad.rotation.x = -Math.PI / 2;
    nsRoad.position.set(0, 0.02, 28.0);
    nsRoad.receiveShadow = true;
    scene.add(nsRoad);

    // Dashed Yellow Grindhouse Highway Centerline (`Z = +64` down to `Z = -10`)
    const centerLineMat = new THREE.MeshBasicMaterial({ color: '#eab308' });
    for (let cz = -9; cz <= 63; cz += 4.5) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2.2), centerLineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.035, cz);
      scene.add(dash);
    }"""

new_road_and_pumpkins = """    // ==========================================================================
    // 1A. VOLUMETRIC FOG & ANISOTROPIC MIE LIGHT-DIFFUSION SHADERS
    //     (Matches creation_3752878158, 3752926830 & 3752929161!)
    // ==========================================================================
    const volumetricFogMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: windTimeUniform,
        uMoonDir: { value: new THREE.Vector3(-0.35, 0.65, -0.68).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 pos = position;
          pos.z += sin(pos.x * 0.14 + uTime * 0.55) * 0.42;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform vec3 uMoonDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            v += amp * noise2D(p);
            p = p * 2.03 + vec2(1.7, 9.2);
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uvFlow1 = vWorldPos.xz * 0.042 + vec2(uTime * 0.16, -uTime * 0.11);
          vec2 uvFlow2 = vWorldPos.xz * 0.085 - vec2(uTime * 0.12, uTime * 0.19);
          float n = fbm(uvFlow1) * 0.65 + fbm(uvFlow2) * 0.35;

          // Edge fade so fog banks blend seamlessly without hard quad borders
          float edgeFade = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x)
                         * smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);

          // Henyey-Greenstein Anisotropic Moonlight Scattering + Warm Torch/Lamp Diffusion
          vec3 viewDir = normalize(vWorldPos - cameraPosition);
          float cosTheta = max(0.0, dot(viewDir, uMoonDir));
          float g = 0.68;
          float mieMoon = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5);

          // Warm amber light diffusion near road billboards, bridge braziers & gatehouse
          float roadWarmth = exp(-abs(vWorldPos.x) * 0.065) * (0.45 + 0.55 * sin(vWorldPos.z * 0.12 + uTime));
          vec3 coolMistCol = vec3(0.42, 0.56, 0.74) + vec3(0.18, 0.26, 0.38) * min(2.2, mieMoon * 0.35);
          vec3 warmTorchDiffusion = vec3(1.0, 0.58, 0.22) * roadWarmth * 0.42;
          vec3 finalCol = coolMistCol + warmTorchDiffusion;

          float alpha = smoothstep(0.28, 0.82, n) * edgeFade * 0.26;
          gl_FragColor = vec4(finalCol, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Helper: Add Anisotropic Volumetric Light-Diffusion Halo / Cone around any Light Source!
    const lightHaloMatCache: Record<string, THREE.ShaderMaterial> = {};
    const getLightDiffusionMat = (hexColor: string, intensity = 1.0) => {
      const key = `${hexColor}_${intensity}`;
      if (!lightHaloMatCache[key]) {
        const col = new THREE.Color(hexColor);
        lightHaloMatCache[key] = new THREE.ShaderMaterial({
          uniforms: {
            uTime: windTimeUniform,
            uColor: { value: new THREE.Vector3(col.r, col.g, col.b) },
            uIntensity: { value: intensity },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uIntensity;
            void main() {
              vec2 d = (vUv - vec2(0.5)) * 2.0;
              float r = length(d);
              // Inverse-exponential Mie fog glow core + soft atmospheric halo
              float core = exp(-r * r * 6.5);
              float halo = exp(-r * 2.6) * 0.55;
              float flicker = 0.92 + 0.08 * sin(uTime * 7.5 + vUv.x * 4.0);
              float alpha = clamp((core + halo) * (1.0 - smoothstep(0.75, 1.0, r)) * uIntensity * flicker, 0.0, 0.85);
              gl_FragColor = vec4(uColor * (1.2 + core * 0.8), alpha);
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
      }
      return lightHaloMatCache[key];
    };

    const addVolumetricLightHalo = (
      parent: THREE.Object3D,
      lx: number,
      ly: number,
      lz: number,
      radius = 2.8,
      hexColor = '#ffaa44',
      intensity = 0.58
    ) => {
      const hMat = getLightDiffusionMat(hexColor, intensity);
      // Crossed dual planes so the volumetric diffusion halo is visible from all 360 degrees
      const p1 = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), hMat);
      p1.position.set(lx, ly, lz);
      parent.add(p1);
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), hMat);
      p2.position.set(lx, ly, lz);
      p2.rotation.y = Math.PI / 2;
      parent.add(p2);
    };

    // Place Multi-Layered Rolling Volumetric Ground Fog Banks along the Highway, Moat, Ravine & Castle!
    const fogLayerCoords: Array<[number, number, number, number, number]> = [
      [0, 0.45, 48, 86, 44],
      [0, 1.25, 36, 94, 48],
      [0, 0.38, 16, 92, 44],
      [0, 1.65, 2, 98, 42],
      [0, -0.85, -24, 140, 32], // Thick Moat Gorge Mist
      [0, 0.55, -24, 110, 30],  // Drawbridge Mist Layer
      [-28, 2.2, -18, 65, 45],
      [28, 2.2, -18, 65, 45],
      [0, 0.35, -45, 44, 32],   // Subtle Grand Hall Floor Mist
      [0, -5.55, -48, 44, 32],  // Subterranean Crypt Mist
    ];
    fogLayerCoords.forEach(([fx, fy, fz, fw, fd]) => {
      const fMesh = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd, 24, 24), volumetricFogMat);
      fMesh.rotation.x = -Math.PI / 2;
      fMesh.position.set(fx, fy, fz);
      scene.add(fMesh);
    });

    // Long Rain-Slicked Wet Specular Ravencrest Approach Highway (`Z = +68` to `Z = -12`, 80m long!)
    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltPbr.map,
      normalMap: asphaltPbr.normalMap,
      normalScale: new THREE.Vector2(1.55, 1.55),
      roughnessMap: asphaltPbr.roughnessMap,
      color: '#3b4252',
      roughness: 0.16,
      metalness: 0.38,
    });
    const nsRoad = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 80), roadMat);
    nsRoad.rotation.x = -Math.PI / 2;
    nsRoad.position.set(0, 0.02, 28.0);
    nsRoad.receiveShadow = true;
    scene.add(nsRoad);

    // Double Yellow Centerlines & White Shoulder Edge Stripes (Matches creation_3752878158.png!)
    const yellowPaintMat = new THREE.MeshStandardMaterial({
      color: '#eab308',
      roughness: 0.28,
      metalness: 0.15,
      emissive: new THREE.Color('#854d0e'),
      emissiveIntensity: 0.22,
    });
    const whitePaintMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.28,
      metalness: 0.15,
    });
    for (const cxOff of [-0.14, 0.14]) {
      const yellowLine = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 78), yellowPaintMat);
      yellowLine.rotation.x = -Math.PI / 2;
      yellowLine.position.set(cxOff, 0.036, 27.0);
      scene.add(yellowLine);
    }
    for (const wxOff of [-4.45, 4.45]) {
      const edgeStripe = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 78), whitePaintMat);
      edgeStripe.rotation.x = -Math.PI / 2;
      edgeStripe.position.set(wxOff, 0.036, 27.0);
      scene.add(edgeStripe);
    }

    // Continuous Steel W-Beam Highway Guardrail on the Right Shoulder (`X = +4.95`, `Z = +64` down to `-11`)
    // with Glowing Amber Road Reflectors & Yellow/Black Chevron Curve Signs (Matches creation_3752899931.png!)
    const guardrailMetalMat = new THREE.MeshStandardMaterial({
      color: '#64748b',
      roughness: 0.32,
      metalness: 0.88,
    });
    const amberReflectorMat = new THREE.MeshBasicMaterial({ color: '#ff9d00' });
    const guardrailBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 75.0), guardrailMetalMat);
    guardrailBeam.position.set(4.95, 0.68, 26.5);
    guardrailBeam.castShadow = true;
    guardrailBeam.receiveShadow = true;
    scene.add(guardrailBeam);
    registerBoxCollider(4.95, 0.68, 26.5, 0.45, 1.4, 75.0);

    for (let gz = -10.5; gz <= 63.5; gz += 3.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.82, 0.14), guardrailMetalMat);
      post.position.set(5.02, 0.41, gz);
      scene.add(post);

      const refl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), amberReflectorMat);
      refl.position.set(4.84, 0.72, gz);
      scene.add(refl);
    }

    // 4 Signature RAVENCREST Roadside Billboards (`creation_3752926830.png`, `926837.png`, `926851.png`)
    // with 3 Overhead Gooseneck Tungsten Lamps, Volumetric Light Diffusion Halos & Perched Black Ravens!
    const billboardBackTex = textureLoader.load('/models/halloween/ravencrest/billboard_back_wood.png');
    billboardBackTex.colorSpace = THREE.SRGBColorSpace;
    const billboardBackMat = new THREE.MeshStandardMaterial({
      map: billboardBackTex,
      roughness: 0.78,
      metalness: 0.12,
    });
    const ravenFeatherMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.35,
      metalness: 0.45,
    });
    const perchedRavens: THREE.Group[] = [];

    const addRavencrestRoadBillboard = (
      bx: number,
      bz: number,
      rotY: number,
      frontTexUrl: string,
      width = 5.6,
      height = 2.9
    ) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, 0, bz);
      bGroup.rotation.y = rotY;

      const fTex = textureLoader.load(frontTexUrl);
      fTex.colorSpace = THREE.SRGBColorSpace;
      const frontMat = new THREE.MeshStandardMaterial({
        map: fTex,
        roughness: 0.42,
        metalness: 0.15,
        emissive: new THREE.Color('#ffbe73'),
        emissiveIntensity: 0.28,
      });

      // Two heavy weathered timber support posts
      for (const px of [-width * 0.36, width * 0.36]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 4.6, 0.26), woodRafterMat);
        post.position.set(px, 2.3, 0);
        post.castShadow = true;
        bGroup.add(post);
      }

      // Rusted Iron Frame & Sign Panel
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.28, height + 0.28, 0.22), darkTrimMat);
      frame.position.set(0, 3.35, 0);
      frame.castShadow = true;
      bGroup.add(frame);

      const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(width, height), frontMat);
      frontFace.position.set(0, 3.35, 0.125);
      bGroup.add(frontFace);

      const backFace = new THREE.Mesh(new THREE.PlaneGeometry(width, height), billboardBackMat);
      backFace.position.set(0, 3.35, -0.125);
      backFace.rotation.y = Math.PI;
      bGroup.add(backFace);

      // 3 Overhead Gooseneck Industrial Lamps + Warm Tungsten Volumetric Light-Diffusion Cones!
      for (const lx of [-width * 0.32, 0, width * 0.32]) {
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.65, 8), darkTrimMat);
        neck.position.set(lx, 3.35 + height * 0.5 + 0.18, 0.28);
        neck.rotation.x = Math.PI * 0.38;
        bGroup.add(neck);

        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 12), guardrailMetalMat);
        shade.position.set(lx, 3.35 + height * 0.5 + 0.08, 0.54);
        bGroup.add(shade);

        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#ffd98a' })
        );
        bulb.position.set(lx, 3.35 + height * 0.5 + 0.02, 0.54);
        bGroup.add(bulb);

        addVolumetricLightHalo(bGroup, lx, 3.35 + height * 0.35, 0.58, 1.65, '#ffaa3b', 0.52);
      }

      const signLight = new THREE.PointLight('#ffaa44', 5.2, 18, 1.2);
      signLight.position.set(0, 4.6, 1.4);
      bGroup.add(signLight);

      // Perched 3D Black Raven atop the Billboard Frame (`creation_3752926817.png`)
      const raven = new THREE.Group();
      raven.position.set(-width * 0.18, 3.35 + height * 0.5 + 0.14, 0.04);
      const rBody = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), ravenFeatherMat);
      rBody.scale.set(0.85, 1.25, 1.45);
      rBody.rotation.x = 0.35;
      rBody.position.y = 0.16;
      raven.add(rBody);
      const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), ravenFeatherMat);
      rHead.position.set(0, 0.31, 0.12);
      raven.add(rHead);
      const rBeak = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 6), ravenFeatherMat);
      rBeak.rotation.x = Math.PI * 0.55;
      rBeak.position.set(0, 0.30, 0.21);
      raven.add(rBeak);
      bGroup.add(raven);
      perchedRavens.push(raven);

      scene.add(bGroup);
      registerBoxCollider(bx, 2.3, bz, 1.6, 4.6, 1.6);
    };

    addRavencrestRoadBillboard(
      -7.4,
      53.5,
      0.24,
      '/models/halloween/ravencrest/billboard_directional_12mi.png',
      5.4,
      2.8
    );
    addRavencrestRoadBillboard(
      -7.8,
      36.0,
      0.22,
      '/models/halloween/ravencrest/billboard_history_mist.png',
      6.0,
      3.0
    );
    addRavencrestRoadBillboard(
      -7.6,
      11.5,
      0.20,
      '/models/halloween/ravencrest/billboard_legacy_remains.png',
      5.8,
      2.9
    );
    addRavencrestRoadBillboard(
      -7.4,
      -5.5,
      0.18,
      '/models/halloween/ravencrest/billboard_welcome.png',
      5.2,
      2.7
    );"""

assert old_road_and_pumpkins in code, "old_road_and_pumpkins not found"
code = code.replace(old_road_and_pumpkins, new_road_and_pumpkins, 1)

# ---------------------------------------------------------------------------
# 5. Add Volumetric Halos to Bridge Braziers, Chandeliers, and Load
#    Ravencrest Floor Medallion, Banners, Portraits, Tapestries & 3D Props GLB
# ---------------------------------------------------------------------------
old_chandelier_end = """      castleMansionGroup.add(chGroup);
    };"""

new_chandelier_end = """      addVolumetricLightHalo(chGroup, 0, 0.25, 0, 2.9, candleColor, 0.48);
      castleMansionGroup.add(chGroup);
    };"""

assert old_chandelier_end in code, "old_chandelier_end not found"
code = code.replace(old_chandelier_end, new_chandelier_end, 1)

old_foyer_carpet = """    addBoxMesh(4.4, 0.05, 10.5, 0, 0.03, -27.0, redCarpetMat);"""

new_foyer_carpet = """    addBoxMesh(4.4, 0.05, 10.5, 0, 0.03, -27.0, redCarpetMat);

    // Circular Inlaid RAVENCREST RAVEN FLOOR MEDALLION in the Center of the Grand Entrance Hall (`creation_3752887346.png`!)
    const medallionTex = textureLoader.load('/models/halloween/ravencrest/ravencrest_medallion.png');
    medallionTex.colorSpace = THREE.SRGBColorSpace;
    const medallionMat = new THREE.MeshStandardMaterial({
      map: medallionTex,
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.14,
      metalness: 0.42,
      transparent: true,
    });
    const grandHallMedallion = new THREE.Mesh(new THREE.CircleGeometry(4.4, 48), medallionMat);
    grandHallMedallion.rotation.x = -Math.PI / 2;
    grandHallMedallion.position.set(0, 0.058, -27.0);
    grandHallMedallion.receiveShadow = true;
    castleMansionGroup.add(grandHallMedallion);

    // Hanging RAVENCREST HERALDIC BANNERS (`banner_raven_navy.png` & `banner_raven_red.png`)
    // along the Gatehouse Towers, Grand Hall Gothic Piers, and Upper Gallery!
    const bannerNavyTex = textureLoader.load('/models/halloween/ravencrest/banner_raven_navy.png');
    bannerNavyTex.colorSpace = THREE.SRGBColorSpace;
    const bannerRedTex = textureLoader.load('/models/halloween/ravencrest/banner_raven_red.png');
    bannerRedTex.colorSpace = THREE.SRGBColorSpace;
    const bannerHouseTex = textureLoader.load('/models/halloween/ravencrest/banner_house_crest.png');
    bannerHouseTex.colorSpace = THREE.SRGBColorSpace;

    const bannerNavyMat = new THREE.MeshStandardMaterial({
      map: bannerNavyTex,
      roughness: 0.58,
      side: THREE.DoubleSide,
    });
    const bannerRedMat = new THREE.MeshStandardMaterial({
      map: bannerRedTex,
      roughness: 0.58,
      side: THREE.DoubleSide,
    });
    const bannerHouseMat = new THREE.MeshStandardMaterial({
      map: bannerHouseTex,
      roughness: 0.58,
      side: THREE.DoubleSide,
    });
    applyWindSwayShader(bannerNavyMat, 'VELVET_CURTAIN');
    applyWindSwayShader(bannerRedMat, 'VELVET_CURTAIN');
    applyWindSwayShader(bannerHouseMat, 'VELVET_CURTAIN');

    const addRavencrestHangingBanner = (
      bx: number,
      by: number,
      bz: number,
      rotY: number,
      mat: THREE.Material,
      bw = 1.45,
      bh = 3.4
    ) => {
      const bg = new THREE.Group();
      bg.position.set(bx, by, bz);
      bg.rotation.y = rotY;
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, bw + 0.35, 8),
        goldFrameMat
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, bh * 0.5, 0);
      bg.add(rod);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh, 8, 16), mat);
      cloth.position.set(0, 0, 0.03);
      bg.add(cloth);
      castleMansionGroup.add(bg);
    };

    // Exterior Gatehouse Barbican Raven Banners (`creation_3752929161.png`)
    addRavencrestHangingBanner(-6.4, 8.2, -18.8, 0, bannerNavyMat, 1.8, 4.4);
    addRavencrestHangingBanner(6.4, 8.2, -18.8, 0, bannerNavyMat, 1.8, 4.4);

    // Grand Entrance Hall & Mezzanine Pier Raven Banners (`creation_3752887346.png`)
    for (const pz of [-26.0, -31.5, -48.5, -54.0]) {
      addRavencrestHangingBanner(-6.15, 3.4, pz, Math.PI / 2, bannerNavyMat, 1.35, 3.1);
      addRavencrestHangingBanner(6.15, 3.4, pz, -Math.PI / 2, bannerNavyMat, 1.35, 3.1);
      addRavencrestHangingBanner(-6.15, 9.4, pz, Math.PI / 2, bannerRedMat, 1.35, 3.1);
      addRavencrestHangingBanner(6.15, 9.4, pz, -Math.PI / 2, bannerRedMat, 1.35, 3.1);
    }

    // Framed Oil Portraits of Lord Ravencrest (`portrait_lord.png`) & Medieval Tapestries (`tapestry_castle.png`)
    const portraitLordTex = textureLoader.load('/models/halloween/ravencrest/portrait_lord.png');
    portraitLordTex.colorSpace = THREE.SRGBColorSpace;
    const tapestryCastleTex = textureLoader.load('/models/halloween/ravencrest/tapestry_castle.png');
    tapestryCastleTex.colorSpace = THREE.SRGBColorSpace;
    const portraitLordMat = new THREE.MeshStandardMaterial({ map: portraitLordTex, roughness: 0.38 });
    const tapestryCastleMat = new THREE.MeshStandardMaterial({ map: tapestryCastleTex, roughness: 0.72 });

    for (const [tx, ty, tz, ry, isTap] of [
      [-11.5, 3.2, -57.3, 0, true],
      [11.5, 3.2, -57.3, 0, true],
      [-11.5, 9.2, -57.3, 0, false],
      [11.5, 9.2, -57.3, 0, false],
      [-23.3, 3.2, -40.0, Math.PI / 2, true],
      [23.3, 3.2, -40.0, -Math.PI / 2, false],
    ] as Array<[number, number, number, number, boolean]>) {
      const decor = new THREE.Mesh(
        new THREE.PlaneGeometry(isTap ? 2.8 : 1.9, isTap ? 3.6 : 2.5),
        isTap ? tapestryCastleMat : portraitLordMat
      );
      decor.position.set(tx, ty, tz);
      decor.rotation.y = ry;
      castleMansionGroup.add(decor);
    }"""

assert old_foyer_carpet in code, "old_foyer_carpet not found"
code = code.replace(old_foyer_carpet, new_foyer_carpet, 1)

# Load `ravencrest_showcase_props.glb` right after `haunted_castle_fortress.glb`
old_fortress_load_end = """        markBundleReady();
      })
      .catch((err) => console.warn('Tank/Castle GLB load error:', err));"""

new_fortress_load_end = """        markBundleReady();
      })
      .catch((err) => console.warn('Tank/Castle GLB load error:', err));

    // Load Headless Blender 5.0.1 RAVENCREST SHOWCASE PROPS (`ravencrest_showcase_props.glb`)
    // — Suits of Knight Armor with Halberds, King's Throne, Four-Poster Canopy Beds, Standing Braziers & Observatory Telescope!
    gltfLoader
      .loadAsync('/models/halloween/ravencrest_showcase_props.glb')
      .then((gltf) => {
        const knightTpl = gltf.scene.getObjectByName('Ravencrest_KnightArmor');
        const throneTpl = gltf.scene.getObjectByName('Ravencrest_ThroneChair');
        const bedTpl = gltf.scene.getObjectByName('Ravencrest_CanopyBed');
        const brazierTpl = gltf.scene.getObjectByName('Ravencrest_StandingBrazier');
        const telescopeTpl = gltf.scene.getObjectByName('Ravencrest_Telescope');

        // 8 Full Suits of Medieval Plate Armor flanking the Grand Entrance Hall Piers & Gatehouse (`creation_3752887346.png`)
        if (knightTpl) {
          const armorPlacements: Array<[number, number, number, number]> = [
            [-5.6, 0.0, -25.2, Math.PI / 2],
            [5.6, 0.0, -25.2, -Math.PI / 2],
            [-5.6, 0.0, -30.8, Math.PI / 2],
            [5.6, 0.0, -30.8, -Math.PI / 2],
            [-5.6, 0.0, -49.2, Math.PI / 2],
            [5.6, 0.0, -49.2, -Math.PI / 2],
            [-5.6, 6.0, -52.5, Math.PI / 2],
            [5.6, 6.0, -52.5, -Math.PI / 2],
          ];
          armorPlacements.forEach(([ax, ay, az, rotY]) => {
            const kClone = knightTpl.clone(true);
            kClone.position.set(ax, ay, az);
            kClone.rotation.y = rotY;
            kClone.scale.setScalar(1.12);
            castleMansionGroup.add(kClone);
          });
        }

        // King's Gothic Throne Chair on the North Grand Gallery & Throne Dais (`creation_3752891684.png`)
        if (throneTpl) {
          for (const [tx, ty, tz, rotY] of [
            [0.0, 0.0, -31.2, 0],
            [0.0, 6.0, -56.2, 0],
          ] as Array<[number, number, number, number]>) {
            const tClone = throneTpl.clone(true);
            tClone.position.set(tx, ty, tz);
            tClone.rotation.y = rotY;
            tClone.scale.setScalar(1.25);
            castleMansionGroup.add(tClone);
          }
        }

        // Four-Poster Gothic Velvet Canopy Beds in the Royal Chambers (`creation_3752894391.png`)
        if (bedTpl) {
          for (const [bx, by, bz, rotY] of [
            [16.5, 6.0, -48.5, 0],
            [-16.5, 6.0, -30.5, 0],
          ] as Array<[number, number, number, number]>) {
            const bClone = bedTpl.clone(true);
            bClone.position.set(bx, by, bz);
            bClone.rotation.y = rotY;
            bClone.scale.setScalar(1.15);
            castleMansionGroup.add(bClone);
          }
        }

        // Wrought-Iron Standing Fire Braziers inside the Grand Entrance Doors & Stair Landing (`creation_3752887346.png`)
        if (brazierTpl) {
          for (const [brx, bry, brz] of [
            [-3.5, 0.0, -23.5],
            [3.5, 0.0, -23.5],
            [-3.5, 6.0, -50.5],
            [3.5, 6.0, -50.5],
          ] as Array<[number, number, number]>) {
            const brClone = brazierTpl.clone(true);
            brClone.position.set(brx, bry, brz);
            brClone.scale.setScalar(1.1);
            addVolumetricLightHalo(brClone, 0, 1.45, 0, 2.2, '#ff7b00', 0.65);
            castleMansionGroup.add(brClone);
          }
        }

        // 4th-Floor / Upper Observatory Brass Equatorial Telescope (`creation_3752884004.png`)
        if (telescopeTpl) {
          const telClone = telescopeTpl.clone(true);
          telClone.position.set(0.0, 12.0, -30.5);
          telClone.scale.setScalar(1.25);
          castleMansionGroup.add(telClone);
        }
      })
      .catch((err) => console.warn('Ravencrest props GLB load error:', err));"""

assert old_fortress_load_end in code, "old_fortress_load_end not found"
code = code.replace(old_fortress_load_end, new_fortress_load_end, 1)

# ---------------------------------------------------------------------------
# 6. Add Slay Reward Helper (XP + HP Leech + Level Up + Council Callout)
# ---------------------------------------------------------------------------
old_spawn_exp = """    const spawnExplosionAt = (ex: number, ey: number, ez: number, radius = 6.2, damage = 65) => {"""

new_spawn_exp = """    // Reward Player with +XP, +HP Restoration, Level-Ups & Council Callouts on Slaying Any Creature!
    const grantMonsterSlayReward = (monsterType: 'ZOMBIE' | 'WEREWOLF' | 'GHOST', sourceLabel: string) => {
      const p = playerStateRef.current;
      const xpGain = monsterType === 'WEREWOLF' ? 80 : monsterType === 'GHOST' ? 65 : 45;
      const hpGain = monsterType === 'WEREWOLF' ? 22 : monsterType === 'GHOST' ? 18 : 14;
      const creatureName =
        monsterType === 'WEREWOLF'
          ? 'Werewolf (Moon Hunger)'
          : monsterType === 'GHOST'
          ? 'NightLord Vampire/Specter'
          : 'Ravencrest Zombie';

      p.kills += 1;
      p.xp += xpGain;
      const xpThreshold = p.level * 150;
      let leveledUp = false;
      if (p.xp >= xpThreshold) {
        p.level += 1;
        p.maxHp += 20;
        p.hp = p.maxHp;
        leveledUp = true;
      } else {
        p.hp = Math.min(p.maxHp, p.hp + hpGain);
      }

      setMonstersSlain(p.kills);
      setPlayerHp(Math.round((p.hp / p.maxHp) * 100));
      setPlayerMaxHp(p.maxHp);
      setPlayerXp(p.xp);
      setPlayerLevel(p.level);

      const popupId = Date.now() + Math.floor(Math.random() * 1000);
      const popupColor = leveledUp ? '#facc15' : monsterType === 'WEREWOLF' ? '#f97316' : '#34d399';
      const popupLabel = leveledUp
        ? `⭐ LEVEL UP! LVL ${p.level} (+20 MAX HP & +18% DMG!) • +${xpGain} XP`
        : `+${xpGain} XP  •  +${hpGain} HP  [${creatureName} Slain!]`;

      setRewardPopups((prev) => [
        ...prev.slice(-3),
        { id: popupId, xp: xpGain, hp: hpGain, label: popupLabel, color: popupColor },
      ]);
      window.setTimeout(() => {
        setRewardPopups((prev) => prev.filter((item) => item.id !== popupId));
      }, 2800);

      if (leveledUp) {
        announceCouncilDirective(
          `🎨 ART COUNCIL: "Level ${p.level} ascension! Notice how the crimson katana bloom and volumetric fog rim-lighting frame the survivor silhouette."`,
          `🎮 GAME COUNCIL: "LEVEL ${p.level} REACHED! Max HP boosted to ${p.maxHp} and melee lethality increased by +${(p.level - 1) * 18}%!"`,
          `Level ${p.level} reached! Maximum health and katana lethality increased.`
        );
      } else if (p.kills % 2 === 1) {
        announceCouncilDirective(
          undefined,
          `🎮 GAME COUNCIL: "${sourceLabel} slew a ${creatureName}! Awarded +${xpGain} XP and +${hpGain} HP Leech (${p.xp}/${p.level * 150} XP to Level ${p.level + 1})."`
        );
      }
    };

    const spawnExplosionAt = (ex: number, ey: number, ez: number, radius = 6.2, damage = 65) => {"""

assert old_spawn_exp in code, "old_spawn_exp not found"
code = code.replace(old_spawn_exp, new_spawn_exp, 1)

# Hook `grantMonsterSlayReward` into Molotov explosion kills, Player Melee kills, and Pumpkin Patch Ally kills!
old_mol_kill = """          if (m.hp <= 0) {
            m.respawnTimer = 8.5;
            m.group.visible = false;
            playerStateRef.current.kills += 1;
            killedAny += 1;
          }"""

new_mol_kill = """          if (m.hp <= 0) {
            m.respawnTimer = 8.5;
            m.group.visible = false;
            grantMonsterSlayReward(m.type, 'Molotov Incendiary');
            killedAny += 1;
          }"""

assert old_mol_kill in code, "old_mol_kill not found"
code = code.replace(old_mol_kill, new_mol_kill, 1)

old_melee_kill = """              const dmg = isExecution ? m.maxHp : stance === 'HIGH' ? 55 : 40;
              m.hp -= dmg;
              m.hitFlashTimer = 0.3;
              const pushAngle = Math.atan2(dx, dz);
              m.vx += Math.sin(pushAngle) * 10.5;
              m.vz += Math.cos(pushAngle) * 10.5;

              if (m.hp <= 0) {
                m.respawnTimer = 8.5;
                m.group.visible = false;
                p.kills += 1;
              }"""

new_melee_kill = """              const levelDmgScale = 1 + (p.level - 1) * 0.18;
              const dmg = isExecution ? m.maxHp : Math.round((stance === 'HIGH' ? 58 : 44) * levelDmgScale);
              m.hp -= dmg;
              m.hitFlashTimer = 0.3;
              const pushAngle = Math.atan2(dx, dz);
              m.vx += Math.sin(pushAngle) * 10.5;
              m.vz += Math.cos(pushAngle) * 10.5;

              if (m.hp <= 0) {
                m.respawnTimer = 8.5;
                m.group.visible = false;
                grantMonsterSlayReward(
                  m.type,
                  survivorGenderRef.current === 'MALE' ? 'Jack Thorne (Katana/Bat)' : 'Elise Carter (Katana/Bat)'
                );
              }"""

assert old_melee_kill in code, "old_melee_kill not found"
code = code.replace(old_melee_kill, new_melee_kill, 1)

old_ally_kill = """            if (allyTargetMonster.hp <= 0) {
              allyTargetMonster.respawnTimer = 8.5;
              allyTargetMonster.group.visible = false;
              p.kills += 1;
              setMonstersSlain(p.kills);
              setCombatCallout({
                text: '🎃 PUMPKIN PATCH ALLY CLEAVE!',
                color: '#fb923c',
                id: Date.now(),
              });
            }"""

new_ally_kill = """            if (allyTargetMonster.hp <= 0) {
              allyTargetMonster.respawnTimer = 8.5;
              allyTargetMonster.group.visible = false;
              grantMonsterSlayReward(allyTargetMonster.type, 'Pumpkin Patch (Bonus Ally)');
              setCombatCallout({
                text: '🎃 PUMPKIN PATCH ALLY CLEAVE! (+XP & +HP)',
                color: '#fb923c',
                id: Date.now(),
              });
            }"""

assert old_ally_kill in code, "old_ally_kill not found"
code = code.replace(old_ally_kill, new_ally_kill, 1)

# ---------------------------------------------------------------------------
# 7. Upgrade `animateHumanoidSkeleton` with Expressive Per-Character &
#    Per-Monster Personality (Jack Thorne, Elise Carter, Pumpkin Patch,
#    Zombie Shamble, Werewolf Prowl, Vampire/Ghost Sinuous Glide)!
# ---------------------------------------------------------------------------
old_anim_fn = """    const animateHumanoidSkeleton = (
      rigGroup: THREE.Group,
      timeSec: number,
      walkSpeed: number,
      swingPhase: number,
      stance: 'HIGH' | 'MID' | 'LOW',
      comboIdx: number
    ) => {
      const clampedSpeed = Math.min(1.5, Math.max(0.0, walkSpeed));
      const isLocomoting = clampedSpeed > 0.14;
      const freq = clampedSpeed > 1.15 ? 11.2 : 8.4;
      const phase = timeSec * freq;
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);
      const breath = Math.sin(timeSec * 2.4) * 0.035;

      rigGroup.traverse((child) => {
        const n = child.name;
        if (!n) return;

        if (n === 'Hips') {
          if (!child.userData.restPos) {
            child.userData.restPos = child.position.clone();
          }
          // Double-frequency vertical stride bounce + tactical crouch dip during sprint
          const strideBounce = isLocomoting
            ? Math.abs(sinP) * 0.048 * clampedSpeed - 0.025 * clampedSpeed
            : Math.sin(timeSec * 2.4) * 0.008;
          child.position.y = child.userData.restPos.y + strideBounce;
          const hipYaw = isLocomoting ? sinP * 0.075 * clampedSpeed : 0;
          const hipRoll = isLocomoting ? cosP * 0.042 * clampedSpeed : 0;
          applyBoneDeltaEuler(child, 0, hipYaw, hipRoll);
        } else if (n === 'Spine' || n === 'Chest') {
          // Tactical Call of Duty / MGS V forward combat lean + counter-twist against pelvis
          const forwardLean = isLocomoting ? 0.11 * clampedSpeed : 0.03 + breath;
          const counterTwist =
            swingPhase > 0
              ? Math.sin(swingPhase * Math.PI) * (comboIdx === 2 ? -0.46 : 0.48)
              : isLocomoting
              ? -sinP * 0.085 * clampedSpeed
              : 0;
          const lateralLean = isLocomoting ? -cosP * 0.035 * clampedSpeed : 0;
          applyBoneDeltaEuler(child, forwardLean, counterTwist, lateralLean);
        } else if (n === 'Head') {
          // Head horizon stabilization (locks eyes forward while torso counter-twists)
          const headCounterYaw = isLocomoting ? sinP * 0.06 * clampedSpeed : Math.sin(timeSec * 1.4) * 0.04;
          const headCounterPitch = isLocomoting ? -0.07 * clampedSpeed : -breath * 0.5;
          applyBoneDeltaEuler(child, headCounterPitch, headCounterYaw, 0);
        } else if (n === 'UpLeg_L') {
          // Left Thigh: +rx swings thigh forward, -rx extends thigh backward
          const thighSwing = isLocomoting ? sinP * 0.62 * clampedSpeed : 0.03;
          applyBoneDeltaEuler(child, thighSwing, 0, 0);
        } else if (n === 'UpLeg_R') {
          // Right Thigh: 180 deg out of phase with Left Thigh
          const thighSwing = isLocomoting ? -sinP * 0.62 * clampedSpeed : -0.03;
          applyBoneDeltaEuler(child, thighSwing, 0, 0);
        } else if (n === 'LowLeg_L') {
          // Left Knee: ONLY bends backward (-rx) during forward swing lift!
          const kneeBend = isLocomoting
            ? -Math.max(0, cosP + 0.25) * 0.68 * clampedSpeed
            : -0.05;
          applyBoneDeltaEuler(child, kneeBend, 0, 0);
        } else if (n === 'LowLeg_R') {
          // Right Knee: ONLY bends backward (-rx) during forward swing lift!
          const kneeBend = isLocomoting
            ? -Math.max(0, -cosP + 0.25) * 0.68 * clampedSpeed
            : -0.05;
          applyBoneDeltaEuler(child, kneeBend, 0, 0);
        } else if (n === 'Foot_L') {
          const ankleFlex = isLocomoting ? cosP * 0.22 * clampedSpeed : 0;
          applyBoneDeltaEuler(child, ankleFlex, 0, 0);
        } else if (n === 'Foot_R') {
          const ankleFlex = isLocomoting ? -cosP * 0.22 * clampedSpeed : 0;
          applyBoneDeltaEuler(child, ankleFlex, 0, 0);
        } else if (n === 'UpperArm_R') {
          if (swingPhase > 0) {
            const arc = Math.sin(swingPhase * Math.PI);
            if (stance === 'HIGH' || comboIdx === 3) {
              // Overhead Jōdan Lethal Cleave
              applyBoneDeltaEuler(child, 1.35 - arc * 2.1, -0.25 * arc, -0.18);
            } else if (stance === 'LOW') {
              // Rising Gedan Sweep
              applyBoneDeltaEuler(child, 0.35 + arc * 1.15, 0.65 - arc * 1.35, -0.25);
            } else {
              // Horizontal Chūdan Slash
              applyBoneDeltaEuler(child, 0.65 + arc * 0.6, 0.75 - arc * 1.55, -0.22);
            }
          } else {
            const stanceGuardX =
              stance === 'HIGH' ? 0.68 : stance === 'LOW' ? 0.16 : 0.38;
            const armPump = isLocomoting ? -sinP * 0.36 * clampedSpeed : breath;
            applyBoneDeltaEuler(child, stanceGuardX + armPump, 0.12, -0.08);
          }
        } else if (n === 'LowerArm_R') {
          const elbowFlex =
            swingPhase > 0
              ? 0.45 * (1 - Math.sin(swingPhase * Math.PI) * 0.7)
              : stance === 'HIGH'
              ? 0.62
              : 0.42;
          applyBoneDeltaEuler(child, elbowFlex, 0, 0);
        } else if (n === 'UpperArm_L') {
          if (swingPhase > 0) {
            const arc = Math.sin(swingPhase * Math.PI);
            applyBoneDeltaEuler(child, 0.45 + arc * 0.85, -0.45 + arc * 0.95, 0.15);
          } else {
            const armPump = isLocomoting ? sinP * 0.38 * clampedSpeed : -breath;
            applyBoneDeltaEuler(child, 0.28 + armPump, -0.12, 0.08);
          }
        } else if (n === 'LowerArm_L') {
          const elbowFlex = isLocomoting ? 0.48 : 0.36;
          applyBoneDeltaEuler(child, elbowFlex, 0, 0);
        }
      });
    };"""

new_anim_fn = """    type AnimArchetype =
      | 'JACK_KATANA'
      | 'ELISE_AGILE'
      | 'PUMPKIN_ALLY'
      | 'ZOMBIE_SHAMBLE'
      | 'WEREWOLF_PROWL'
      | 'VAMPIRE_GHOST';

    const animateHumanoidSkeleton = (
      rigGroup: THREE.Group,
      timeSec: number,
      walkSpeed: number,
      swingPhase: number,
      stance: 'HIGH' | 'MID' | 'LOW',
      comboIdx: number,
      archetype: AnimArchetype = 'JACK_KATANA'
    ) => {
      const clampedSpeed = Math.min(1.5, Math.max(0.0, walkSpeed));
      const isLocomoting = clampedSpeed > 0.14;
      const isZombie = archetype === 'ZOMBIE_SHAMBLE';
      const isWolf = archetype === 'WEREWOLF_PROWL';
      const isGhost = archetype === 'VAMPIRE_GHOST';
      const isElise = archetype === 'ELISE_AGILE';
      const isPumpkin = archetype === 'PUMPKIN_ALLY';

      const baseFreq = isZombie
        ? 5.8
        : isWolf
        ? 10.4
        : isElise
        ? 9.4
        : clampedSpeed > 1.15
        ? 11.2
        : 8.4;
      const phase = timeSec * baseFreq;
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);
      const sin2P = Math.sin(phase * 2.0);
      const breath = Math.sin(timeSec * (isWolf ? 4.2 : 2.6)) * (isWolf ? 0.065 : 0.04);

      // Periodic Idle Personality Flourishes (Katana figure-eight twirl, vigilant head scan, weight shift)
      const idleWeightShift = !isLocomoting ? Math.sin(timeSec * 1.15) * 0.032 : 0;
      const flourishWindow = !isLocomoting ? Math.max(0, Math.sin(timeSec * 0.85) - 0.55) * 2.2 : 0;
      const zombieLimp = isZombie ? Math.max(0, sinP) * 0.12 : 0;

      rigGroup.traverse((child) => {
        const n = child.name;
        if (!n) return;

        if (n === 'Hips') {
          if (!child.userData.restPos) {
            child.userData.restPos = child.position.clone();
          }
          const strideBounce = isLocomoting
            ? isZombie
              ? -zombieLimp * 0.07 + Math.abs(sinP) * 0.03
              : isWolf
              ? sin2P * 0.068 * clampedSpeed - 0.05
              : Math.abs(sinP) * 0.052 * clampedSpeed - 0.025 * clampedSpeed
            : Math.sin(timeSec * 2.4) * 0.012;
          child.position.y = child.userData.restPos.y + strideBounce;
          child.position.x = child.userData.restPos.x + idleWeightShift;

          const hipYaw = isLocomoting
            ? sinP * (isElise ? 0.11 : isZombie ? 0.14 : 0.08) * clampedSpeed
            : Math.sin(timeSec * 1.15) * 0.04;
          const hipRoll = isLocomoting
            ? cosP * (isElise ? 0.065 : isZombie ? 0.09 : 0.045) * clampedSpeed
            : idleWeightShift * 1.2;
          applyBoneDeltaEuler(child, isWolf ? 0.12 : 0, hipYaw, hipRoll);
        } else if (n === 'Spine' || n === 'Chest') {
          const forwardLean = isZombie
            ? 0.28 + Math.sin(phase) * 0.08
            : isWolf
            ? 0.34 + breath
            : isLocomoting
            ? (isElise ? 0.14 : 0.12) * clampedSpeed
            : 0.04 + breath;
          const counterTwist =
            swingPhase > 0
              ? Math.sin(swingPhase * Math.PI) * (comboIdx === 2 ? -0.56 : 0.58)
              : isLocomoting
              ? -sinP * (isPumpkin ? 0.14 : 0.095) * clampedSpeed
              : Math.sin(timeSec * 1.3) * 0.045;
          const lateralLean = isZombie
            ? 0.16 + Math.cos(phase) * 0.09
            : isLocomoting
            ? -cosP * 0.04 * clampedSpeed
            : -idleWeightShift * 0.8;
          applyBoneDeltaEuler(child, forwardLean, counterTwist, lateralLean);
        } else if (n === 'Head') {
          // Expressive head personality: zombies loll head sideways, wolves snarl & track, survivors scan mist!
          const headYaw = isZombie
            ? Math.sin(timeSec * 1.7) * 0.18
            : isLocomoting
            ? sinP * 0.06 * clampedSpeed
            : Math.sin(timeSec * 0.95) * 0.16 + Math.sin(timeSec * 2.3) * 0.04;
          const headPitch = isZombie
            ? 0.22 + Math.sin(phase) * 0.12
            : isWolf
            ? -0.18 + Math.sin(timeSec * 5.0) * 0.06
            : isLocomoting
            ? -0.07 * clampedSpeed
            : -breath * 0.6 + flourishWindow * 0.08;
          const headRoll = isZombie
            ? 0.28 + Math.cos(timeSec * 1.5) * 0.08
            : isWolf
            ? Math.sin(timeSec * 3.1) * 0.09
            : Math.sin(timeSec * 1.15) * 0.04;
          applyBoneDeltaEuler(child, headPitch, headYaw, headRoll);
        } else if (n === 'UpLeg_L') {
          const amp = isWolf ? 0.78 : isZombie ? 0.42 : isElise ? 0.68 : 0.64;
          const thighSwing = isLocomoting ? sinP * amp * clampedSpeed : 0.05;
          applyBoneDeltaEuler(child, thighSwing, 0, isElise ? -0.03 : 0);
        } else if (n === 'UpLeg_R') {
          const amp = isWolf ? 0.78 : isZombie ? 0.26 : isElise ? 0.68 : 0.64;
          const thighSwing = isLocomoting ? -sinP * amp * clampedSpeed : -0.05;
          applyBoneDeltaEuler(child, thighSwing, 0, isElise ? 0.03 : 0);
        } else if (n === 'LowLeg_L') {
          const kneeBend = isLocomoting
            ? -Math.max(0, cosP + 0.25) * (isWolf ? 0.82 : 0.70) * clampedSpeed
            : isWolf
            ? -0.28
            : -0.06;
          applyBoneDeltaEuler(child, kneeBend, 0, 0);
        } else if (n === 'LowLeg_R') {
          const kneeBend = isLocomoting
            ? -Math.max(0, -cosP + 0.25) * (isZombie ? 0.22 : isWolf ? 0.82 : 0.70) * clampedSpeed
            : isWolf
            ? -0.28
            : -0.06;
          applyBoneDeltaEuler(child, kneeBend, 0, 0);
        } else if (n === 'Foot_L') {
          const ankleFlex = isLocomoting ? cosP * 0.24 * clampedSpeed : 0;
          applyBoneDeltaEuler(child, ankleFlex, 0, 0);
        } else if (n === 'Foot_R') {
          const ankleFlex = isLocomoting ? -cosP * 0.24 * clampedSpeed : 0;
          applyBoneDeltaEuler(child, ankleFlex, 0, 0);
        } else if (n === 'UpperArm_R') {
          if (swingPhase > 0) {
            const arc = Math.sin(swingPhase * Math.PI);
            if (stance === 'HIGH' || comboIdx === 3 || isPumpkin) {
              applyBoneDeltaEuler(child, 1.42 - arc * 2.25, -0.32 * arc, -0.18);
            } else if (stance === 'LOW') {
              applyBoneDeltaEuler(child, 0.35 + arc * 1.25, 0.72 - arc * 1.45, -0.25);
            } else {
              applyBoneDeltaEuler(child, 0.68 + arc * 0.65, 0.82 - arc * 1.65, -0.22);
            }
          } else if (isZombie) {
            applyBoneDeltaEuler(child, 1.05 + Math.sin(phase) * 0.18, 0.12, -0.08);
          } else if (isWolf) {
            applyBoneDeltaEuler(child, 0.62 - sinP * 0.48 * clampedSpeed, 0.18, -0.22);
          } else if (isGhost) {
            applyBoneDeltaEuler(child, 0.75 + Math.sin(timeSec * 3.2) * 0.28, 0.25, -0.32);
          } else {
            const stanceGuardX =
              stance === 'HIGH' ? 0.72 : stance === 'LOW' ? 0.18 : 0.42;
            const armPump = isLocomoting
              ? -sinP * 0.42 * clampedSpeed
              : breath + flourishWindow * Math.sin(timeSec * 6.5) * 0.28;
            const flourishYaw = flourishWindow * Math.cos(timeSec * 6.5) * 0.32;
            applyBoneDeltaEuler(child, stanceGuardX + armPump, 0.14 + flourishYaw, -0.08);
          }
        } else if (n === 'LowerArm_R') {
          const elbowFlex =
            swingPhase > 0
              ? 0.48 * (1 - Math.sin(swingPhase * Math.PI) * 0.75)
              : isZombie
              ? 0.35 + Math.cos(phase) * 0.12
              : stance === 'HIGH'
              ? 0.66
              : 0.44 + flourishWindow * 0.35;
          applyBoneDeltaEuler(child, elbowFlex, flourishWindow * Math.sin(timeSec * 8.0) * 0.45, 0);
        } else if (n === 'Hand_R') {
          // Katana / Weapon wrist articulation & idle Bushido blade twirl!
          const wristTwirl =
            swingPhase > 0
              ? Math.sin(swingPhase * Math.PI) * 0.55
              : flourishWindow * Math.sin(timeSec * 9.0) * 0.65;
          applyBoneDeltaEuler(child, wristTwirl * 0.5, wristTwirl, 0);
        } else if (n === 'UpperArm_L') {
          if (swingPhase > 0) {
            const arc = Math.sin(swingPhase * Math.PI);
            // Left-Hand Nail-Spiked Baseball Bat / Dual Plasma Blade counter-strike!
            applyBoneDeltaEuler(child, 0.55 + arc * 1.15, -0.55 + arc * 1.15, 0.18);
          } else if (isZombie) {
            applyBoneDeltaEuler(child, 0.92 - Math.sin(phase) * 0.16, -0.15, 0.12);
          } else if (isWolf) {
            applyBoneDeltaEuler(child, 0.62 + sinP * 0.48 * clampedSpeed, -0.18, 0.22);
          } else if (isGhost) {
            applyBoneDeltaEuler(child, 0.75 + Math.cos(timeSec * 3.2) * 0.28, -0.25, 0.32);
          } else {
            const armPump = isLocomoting ? sinP * 0.42 * clampedSpeed : -breath * 1.2;
            applyBoneDeltaEuler(child, 0.34 + armPump, -0.14, 0.10);
          }
        } else if (n === 'LowerArm_L') {
          const elbowFlex = isLocomoting ? 0.52 : 0.40;
          applyBoneDeltaEuler(child, elbowFlex, 0, 0);
        }
      });
    };"""

assert old_anim_fn in code, "old_anim_fn not found"
code = code.replace(old_anim_fn, new_anim_fn, 1)

# Pass the exact archetype into `animateHumanoidSkeleton` for Player, Pumpkin Patch, and Monsters!
old_player_anim_call = """      const activeSurvivorSlot = isMale ? maleSurvivorGroup : femaleSurvivorGroup;
      animateHumanoidSkeleton(
        activeSurvivorSlot,
        t,
        smoothedGaitSpeed,
        swingPhase,
        bushidoStanceRef.current,
        p.comboIndex
      );"""

new_player_anim_call = """      // Animate Perched 3D Ravens on top of the Ravencrest Roadside Billboards
      perchedRavens.forEach((rv, rIdx) => {
        rv.rotation.y = Math.sin(t * 1.8 + rIdx * 1.7) * 0.35;
        rv.position.y = 3.35 + 1.45 + 0.14 + Math.abs(Math.sin(t * 2.6 + rIdx)) * 0.04;
      });

      const activeSurvivorSlot = isMale ? maleSurvivorGroup : femaleSurvivorGroup;
      animateHumanoidSkeleton(
        activeSurvivorSlot,
        t,
        smoothedGaitSpeed,
        swingPhase,
        bushidoStanceRef.current,
        p.comboIndex,
        isMale ? 'JACK_KATANA' : 'ELISE_AGILE'
      );"""

assert old_player_anim_call in code, "old_player_anim_call not found"
code = code.replace(old_player_anim_call, new_player_anim_call, 1)

old_pumpkin_anim_call = """        animateHumanoidSkeleton(pumpkinHeroGroup, t + 0.4, allyGait, allySwingPhase, 'HIGH', 3);"""
new_pumpkin_anim_call = """        animateHumanoidSkeleton(pumpkinHeroGroup, t + 0.4, allyGait, allySwingPhase, 'HIGH', 3, 'PUMPKIN_ALLY');"""
assert old_pumpkin_anim_call in code, "old_pumpkin_anim_call not found"
code = code.replace(old_pumpkin_anim_call, new_pumpkin_anim_call, 1)

old_monster_anim_call = """        animateHumanoidSkeleton(
          m.rigSlot,
          t + m.phaseOffset,
          dist < 22 ? 0.95 : 0.35,
          dist < 1.9 && sameFloor ? (t * 2.5) % 1 : 0,
          'MID',
          1
        );"""

new_monster_anim_call = """        animateHumanoidSkeleton(
          m.rigSlot,
          t + m.phaseOffset,
          dist < 22 ? 0.95 : 0.35,
          dist < 1.9 && sameFloor ? (t * 2.5) % 1 : 0,
          'MID',
          1,
          m.type === 'ZOMBIE'
            ? 'ZOMBIE_SHAMBLE'
            : m.type === 'WEREWOLF'
            ? 'WEREWOLF_PROWL'
            : 'VAMPIRE_GHOST'
        );"""

assert old_monster_anim_call in code, "old_monster_anim_call not found"
code = code.replace(old_monster_anim_call, new_monster_anim_call, 1)

# Trigger Art Council & Game Council commentary when entering Castle Rooms
old_room_transition = """            setCombatLogText(
              `🏰 Room #${detectedRoom.roomNumber}: ${detectedRoom.name} [${detectedRoom.floorLabel}] — ${detectedRoom.subtitle}`
            );"""

new_room_transition = """            setCombatLogText(
              `🏰 Room #${detectedRoom.roomNumber}: ${detectedRoom.name} [${detectedRoom.floorLabel}] — ${detectedRoom.subtitle}`
            );
            announceCouncilDirective(
              `🎨 ART COUNCIL (Room #${detectedRoom.roomNumber} — ${detectedRoom.name}): "${detectedRoom.subtitle}. Specular stone floor, Ravencrest heraldry & volumetric candle diffusion verified."`,
              `🎮 GAME COUNCIL: "Entered ${detectedRoom.name} on ${detectedRoom.floorLabel}. Watch for ambushing creatures — every slay awards +XP & +HP restoration!"`,
              `Entered ${detectedRoom.name}.`
            );"""

assert old_room_transition in code, "old_room_transition not found"
code = code.replace(old_room_transition, new_room_transition, 1)

# ---------------------------------------------------------------------------
# 8. Add Floating XP/HP Slay Popups, Live Art & Game Council Voice Ticker,
#    XP Progression Bar, Jack Thorne / Elise Carter Labels, and Ravencrest
#    Master Design Sheets in the HUD!
# ---------------------------------------------------------------------------
old_callout_hud = """      {/* 2B. FLOATING COMBAT CALLOUT */}
      {combatCallout && (
        <div
          key={combatCallout.id}
          className="pointer-events-none absolute top-28 left-1/2 -translate-x-1/2 z-30 animate-bounce"
        >
          <div
            className="px-4 py-1.5 rounded-full bg-black/85 border-2 font-black text-xs uppercase tracking-widest shadow-2xl"
            style={{
              borderColor: combatCallout.color,
              color: combatCallout.color,
              boxShadow: `0 0 28px ${combatCallout.color}66`,
            }}
          >
            {combatCallout.text}
          </div>
        </div>
      )}"""

new_callout_hud = """      {/* 2B. FLOATING COMBAT CALLOUT & +XP / +HP SLAY REWARD POPUPS */}
      {combatCallout && (
        <div
          key={combatCallout.id}
          className="pointer-events-none absolute top-28 left-1/2 -translate-x-1/2 z-30 animate-bounce"
        >
          <div
            className="px-4 py-1.5 rounded-full bg-black/85 border-2 font-black text-xs uppercase tracking-widest shadow-2xl"
            style={{
              borderColor: combatCallout.color,
              color: combatCallout.color,
              boxShadow: `0 0 28px ${combatCallout.color}66`,
            }}
          >
            {combatCallout.text}
          </div>
        </div>
      )}

      {rewardPopups.length > 0 && (
        <div className="pointer-events-none absolute top-40 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5">
          {rewardPopups.map((rp) => (
            <div
              key={rp.id}
              className="px-4 py-1.5 rounded-xl bg-black/90 border-2 font-black text-xs uppercase tracking-wider shadow-[0_0_30px_rgba(16,185,129,0.5)] animate-pulse"
              style={{ borderColor: rp.color, color: rp.color }}
            >
              {rp.label}
            </div>
          ))}
        </div>
      )}

      {/* 2C. ACTIVE ART COUNCIL & GAME PRODUCTION COUNCIL LIVE DIRECTION BAR */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-gradient-to-r from-amber-950/85 via-zinc-950/90 to-cyan-950/85 border-b border-amber-500/30 text-[11px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-black text-[9px] uppercase tracking-wider shrink-0">
            Art Council Live
          </span>
          <span className="text-amber-200 font-semibold truncate">{artCouncilNote}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="px-1.5 py-0.5 rounded bg-cyan-400 text-black font-black text-[9px] uppercase tracking-wider shrink-0">
            Game Council Live
          </span>
          <span className="text-cyan-200 font-semibold truncate">{gameCouncilNote}</span>
        </div>
        <button
          onClick={() => {
            setCouncilVoiceEnabled((prev) => {
              const next = !prev;
              if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                try {
                  const u = new SpeechSynthesisUtterance(
                    'Art Council and Game Production Council live voice direction enabled for Ravencrest Castle.'
                  );
                  u.rate = 1.04;
                  window.speechSynthesis.speak(u);
                } catch {}
              }
              return next;
            });
          }}
          className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider cursor-pointer shrink-0 ${
            councilVoiceEnabled
              ? 'bg-emerald-500 text-black border-emerald-300'
              : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
          }`}
          title="Toggle Spoken Audio Commentary from the Art & Game Councils"
        >
          🎙️ Council Voice: {councilVoiceEnabled ? 'ON' : 'OFF'}
        </button>
      </div>"""

assert old_callout_hud in code, "old_callout_hud not found"
code = code.replace(old_callout_hud, new_callout_hud, 1)

# Update Title & Playable Survivor Button Labels to Jack Thorne & Elise Carter
old_survivor_buttons = """          {/* Playable Survivor Switch: Kenji 'Road Rash' Tanaka (Male) vs Anya 'Scrap' Petrovic (Female) */}
          <div className="flex items-center bg-zinc-950/90 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setSurvivorGender('MALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'MALE'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🧑 Kenji (Male)
            </button>
            <button
              onClick={() => setSurvivorGender('FEMALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'FEMALE'
                  ? 'bg-pink-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              👩 Anya (Female)
            </button>
          </div>"""

new_survivor_buttons = """          {/* Playable Survivor Switch: Jack Thorne (Male Slayer) vs Elise Carter (Female Slayer) */}
          <div className="flex items-center bg-zinc-950/90 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => {
                setSurvivorGender('MALE');
                announceCouncilDirective(
                  '🎨 ART COUNCIL: "Switched to Jack Thorne (Male Monster Slayer) — Ranger jacket, tactical backpack, bloodied Katana & Spiked Bat active."',
                  '🎮 GAME COUNCIL: "Jack Thorne online: high-stance Bushido execution & wide bat cleave ready."'
                );
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'MALE'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🧑 Jack Thorne (Male)
            </button>
            <button
              onClick={() => {
                setSurvivorGender('FEMALE');
                announceCouncilDirective(
                  '🎨 ART COUNCIL: "Switched to Elise Carter (Female Monster Slayer) — High ponytail, hooded tactical jacket, survival pack & dual weapons active."',
                  '🎮 GAME COUNCIL: "Elise Carter online: agile scavenger footwork & rapid dual-weapon strikes ready."'
                );
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'FEMALE'
                  ? 'bg-pink-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              👩 Elise Carter (Female)
            </button>
          </div>"""

assert old_survivor_buttons in code, "old_survivor_buttons not found"
code = code.replace(old_survivor_buttons, new_survivor_buttons, 1)

# Update HP + XP + Level Telemetry in the Floorplan Ribbon
old_hp_telemetry = """        {/* Combat & Active Room Telemetry */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">HP</span>
            <div className="w-20 h-2 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-emerald-400 transition-all"
                style={{ width: `${playerHp}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] font-black text-orange-400">
            💀 Slain: {monstersSlain}
          </span>
          <span className="text-[11px] font-bold text-emerald-300 truncate max-w-[340px]">
            {combatLogText}
          </span>
        </div>"""

new_hp_telemetry = """        {/* Combat, Level, XP & Active Room Telemetry */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] font-black text-amber-300">
            ⭐ LVL {playerLevel}
          </span>
          <div className="flex items-center gap-1.5" title={`Health: ${playerHp}% of ${playerMaxHp} Max HP`}>
            <span className="text-[10px] font-black uppercase text-emerald-400">❤️ HP</span>
            <div className="w-20 h-2 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-emerald-400 transition-all"
                style={{ width: `${playerHp}%` }}
              />
            </div>
          </div>
          <div
            className="flex items-center gap-1.5"
            title={`XP: ${playerXp} / ${playerLevel * 150} (Slay monsters for +XP & +HP!)`}
          >
            <span className="text-[10px] font-black uppercase text-cyan-300">
              ⚡ XP {playerXp}/{playerLevel * 150}
            </span>
            <div className="w-20 h-2 rounded-full bg-zinc-800 overflow-hidden border border-cyan-500/40">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-300 transition-all"
                style={{
                  width: `${Math.min(100, ((playerXp % 150) / 150) * 100)}%`,
                }}
              />
            </div>
          </div>
          <span className="text-[11px] font-black text-orange-400">
            💀 Slain: {monstersSlain}
          </span>
          <span className="text-[11px] font-bold text-emerald-300 truncate max-w-[280px]">
            {combatLogText}
          </span>
        </div>"""

assert old_hp_telemetry in code, "old_hp_telemetry not found"
code = code.replace(old_hp_telemetry, new_hp_telemetry, 1)

# Update `COUNCIL_SHEETS` tab in Story Intel Drawer to include all the Master Ravencrest Sheets from `Hallowen Showcase assets.zip`!
old_council_sheets_list = """                {[
                  {
                    title: 'Pumpkin Patch (Melvin Lester) — 3D Turnaround Sheet',
                    url: '/models/halloween/sheets/pumpkin_patch_sheet.png',
                  },
                  {
                    title: 'Wicked Witch Miriam — 3D Turnaround Sheet',
                    url: '/models/halloween/sheets/miriam_sheet.png',
                  },
                  {
                    title: 'Stitch & Commander Crane (Robo-Bones) — 3D Sheet',
                    url: '/models/halloween/sheets/stitch_and_robobones_sheet.png',
                  },
                  {
                    title: 'Playable Survivors (Kenji & Anya) + Weapons Sheet',
                    url: '/models/halloween/sheets/survivors_sheet.png',
                  },
                  {
                    title: 'Enemy Monsters (Zombie, Werewolf, Banshee Ghost) Sheet',
                    url: '/models/halloween/sheets/monsters_sheet.png',
                  },
                  {
                    title: 'Pumpkin Patch Armored War-Rig Tank Sheet',
                    url: '/models/halloween/sheets/tank_sheet.png',
                  },
                ].map((item) => ("""

new_council_sheets_list = """                {[
                  {
                    title: 'Ravencrest Castle — 5-Floor Architectural Blueprint (12 Bedrooms • 4 Towers • Observatory)',
                    url: '/models/halloween/ravencrest/floorplan_blueprint.jpg',
                  },
                  {
                    title: 'Ravencrest Castle — Grand Entrance Hall & Raven Floor Medallion Master Plate',
                    url: '/models/halloween/ravencrest/grand_hall_plate.jpg',
                  },
                  {
                    title: 'Jack Thorne & Elise Carter — Playable Survivors & Monster Slayers Master Sheet',
                    url: '/models/halloween/ravencrest/survivors_jack_elise.jpg',
                  },
                  {
                    title: 'The Ravencrest Outbreak — Zombies, Werewolves & Vampires Master Creature Sheet',
                    url: '/models/halloween/ravencrest/monsters_outbreak.jpg',
                  },
                  {
                    title: 'Ravencrest Castle Interior Modular Assets & PBR Material Swatches Sheet',
                    url: '/models/halloween/ravencrest/interior_assets_sheet.jpg',
                  },
                  {
                    title: 'Road to Ravencrest — Billboards, Guardrail, Moat Bridge & Volumetric Fog Sheet',
                    url: '/models/halloween/ravencrest/road_assets_sheet.jpg',
                  },
                  {
                    title: 'Ravencrest Castle Exterior Architectural Callouts (Spires, Buttresses, Viaduct & Keep)',
                    url: '/models/halloween/ravencrest/castle_architecture_callouts.jpg',
                  },
                  {
                    title: 'Pumpkin Patch (Melvin Lester) — Bonus AI Ally 3D Turnaround Sheet',
                    url: '/models/halloween/sheets/pumpkin_patch_sheet.png',
                  },
                ].map((item) => ("""

assert old_council_sheets_list in code, "old_council_sheets_list not found"
code = code.replace(old_council_sheets_list, new_council_sheets_list, 1)

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(code)

print("Successfully upgraded HauntedCastleExhibition.tsx with Ravencrest assets, volumetric Mie fog, XP/HP rewards, expressive animations & live Council voices!")
