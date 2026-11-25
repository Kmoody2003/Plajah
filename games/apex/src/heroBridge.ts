import * as THREE from 'three';

export interface HeroBridgeOptions {
  start: THREE.Vector3;
  end: THREE.Vector3;
  deckWidth?: number;
  towerHeight?: number;
  /** how far the tower foundations go down from the deck (default 22): a high deck needs them to reach the water bed */
  pierDepth?: number;
  /** height of the end abutments under the deck (default 12) */
  abutmentDepth?: number;
}

export interface HeroBridgeHandle {
  group: THREE.Group;
  updateLed: (elapsed: number, nightFactor: number) => void;
}

const TEX_BASE = '/games/apex/tex/';
const texLoader = new THREE.TextureLoader();

function loadTex(
  file: string,
  srgb: boolean,
  repX = 1,
  repY = 1,
): THREE.Texture {
  const t = texLoader.load(TEX_BASE + file);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLaneMarkingTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);

  // Outer white shoulder lines
  g.fillStyle = 'rgba(240, 242, 245, 0.92)';
  g.fillRect(20, 0, 7, h);
  g.fillRect(w - 27, 0, 7, h);

  // Inner yellow median edge lines
  g.fillStyle = 'rgba(245, 196, 48, 0.95)';
  g.fillRect(w / 2 - 26, 0, 5, h);
  g.fillRect(w / 2 + 21, 0, 5, h);

  // Dashed lane dividers (3 lanes each direction)
  g.fillStyle = 'rgba(235, 238, 242, 0.85)';
  const dashOffsets = [96, 168, w - 173, w - 101];
  for (const x of dashOffsets) {
    for (let y = 16; y < h; y += 96) {
      g.fillRect(x, y, 5, 48);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function orientBetween(
  mesh: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
): number {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  if (len > 1e-5) {
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
  }
  return len;
}

export function buildHeroBridge(opts: HeroBridgeOptions): HeroBridgeHandle {
  const { start, end } = opts;
  const deckWidth = opts.deckWidth ?? 26;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const spanLen = Math.max(40, Math.hypot(dx, dz));
  const towerHeight = opts.towerHeight ?? Math.max(72, Math.min(145, spanLen * 0.24));

  const group = new THREE.Group();
  group.name = 'heroBridge';

  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  group.position.copy(mid);
  group.rotation.y = Math.atan2(dx, dz);

  // Shared PBR materials
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xd9d6cf,
    map: loadTex('tex-shared-16-concrete-weathered_base.png', true, 2, 6),
    normalMap: loadTex('tex-shared-16-concrete-weathered_normal.png', false, 2, 6),
    roughnessMap: loadTex('tex-shared-16-concrete-weathered_roughness.png', false, 2, 6),
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.88,
    metalness: 0.04,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xbcc5d0,
    map: loadTex('tex-shared-14-steel-panel_base.png', true, 4, 2),
    normalMap: loadTex('tex-shared-14-steel-panel_normal.png', false, 4, 2),
    roughnessMap: loadTex('tex-shared-14-steel-panel_roughness.png', false, 4, 2),
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.42,
    metalness: 0.84,
  });

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x3b444f,
    map: loadTex('tex-shared-14-steel-panel_base.png', true, 2, 2),
    normalMap: loadTex('tex-shared-14-steel-panel_normal.png', false, 2, 2),
    roughnessMap: loadTex('tex-shared-14-steel-panel_roughness.png', false, 2, 2),
    roughness: 0.5,
    metalness: 0.82,
  });

  const repLen = Math.max(4, Math.round(spanLen / 16));
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8,
    map: loadTex('ground_asphalt_dry.png', true, 2, repLen),
    normalMap: loadTex('ground_asphalt_dry_normal.png', false, 2, repLen),
    roughnessMap: loadTex('ground_asphalt_dry_roughness.png', false, 2, repLen),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.86,
    metalness: 0.04,
  });

  const laneTex = makeLaneMarkingTexture();
  laneTex.repeat.set(1, Math.max(4, Math.round(spanLen / 22)));
  const laneMat = new THREE.MeshBasicMaterial({
    map: laneTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const cableMat = new THREE.MeshStandardMaterial({
    color: 0xdbe2ea,
    roughness: 0.3,
    metalness: 0.88,
  });

  // Animated LED materials: ONE material per palette (tower, fascia, cable nodes); each LED's phase in the wave rides on its vertices (attribute ledPhase)
  // and the shader computes the colour and glow the CPU used to set per material. ~240 per-LED materials became 3, so the merged bridge is a few draws.
  type Palette = 'tower' | 'fascia' | 'node';
  const ledU = { uLedTime: { value: 0 }, uLedActive: { value: 0 } };
  const PAL: Record<Palette, string> = {
    tower: 'vec3 c = mix(vec3(0.161, 0.384, 1.0), vec3(0.0, 0.898, 1.0), wave); float k = 1.2 + 1.4 * wave;',
    fascia: 'vec3 a = mix(vec3(0.0, 0.898, 1.0), vec3(0.616, 0.306, 0.867), pulse); vec3 c = mix(a, vec3(0.0, 1.0, 0.659), wave * 0.5); float k = 1.0 + 1.3 * wave;',
    node: 'vec3 c = mix(vec3(0.0, 1.0, 0.659), vec3(0.0, 0.898, 1.0), wave); float k = 1.4 + 1.8 * wave;',
  };
  const ledMats = {} as Record<Palette, THREE.MeshStandardMaterial>;
  for (const p of ['tower', 'fascia', 'node'] as Palette[]) {
    const m = new THREE.MeshStandardMaterial({ color: 0x29b6f6, emissive: 0xffffff, roughness: 0.25, metalness: 0.1 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, ledU);
      sh.vertexShader = 'attribute float ledPhase;\nvarying float vLedPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLedPhase = ledPhase;');
      sh.fragmentShader = 'uniform float uLedTime;\nuniform float uLedActive;\nvarying float vLedPhase;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n{ float wave = 0.5 + 0.5 * sin(uLedTime * 1.45 - vLedPhase); float pulse = 0.5 + 0.5 * sin(uLedTime * 0.65 + vLedPhase * 0.5); ' + PAL[p] +
        ' diffuseColor.rgb = c; totalEmissiveRadiance = c * (uLedActive > 0.001 ? uLedActive * k : 0.08); }');
    };
    m.customProgramCacheKey = () => 'heroLed-' + p;
    ledMats[p] = m;
  }
  const ledPhaseOf = new Map<THREE.Material, { phase: number; palette: Palette }>();
  const makeLedMat = (_baseColor: number, phase: number, palette: Palette): THREE.MeshStandardMaterial => {
    const marker = new THREE.MeshStandardMaterial();                                         // a stand-in that tags the mesh; swapped for the palette material below
    ledPhaseOf.set(marker, { phase, palette });
    return marker;
  };

  const lampBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d6,
    emissive: new THREE.Color(0xffdfa0),
    emissiveIntensity: 0.2,
    roughness: 0.2,
  });

  // ---------------------------------------------------------------------------
  // 1. Multi-lane Asphalt Deck, Parapets, Median & Steel Box-Girder Trusses
  // ---------------------------------------------------------------------------
  const deckThickness = 1.6;
  const roadWidth = deckWidth - 2.4;

  const asphaltMesh = new THREE.Mesh(
    new THREE.BoxGeometry(roadWidth, 0.32, spanLen),
    asphaltMat,
  );
  asphaltMesh.position.set(0, -0.16, 0);
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  const laneOverlay = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, spanLen),
    laneMat,
  );
  laneOverlay.rotation.x = -Math.PI / 2;
  laneOverlay.position.set(0, 0.02, 0);
  group.add(laneOverlay);

  // Structural steel box girder under deck
  const girderMesh = new THREE.Mesh(
    new THREE.BoxGeometry(deckWidth - 1.6, deckThickness, spanLen),
    darkSteelMat,
  );
  girderMesh.position.set(0, -deckThickness * 0.5 - 0.32, 0);
  girderMesh.castShadow = true;
  girderMesh.receiveShadow = true;
  group.add(girderMesh);

  // Tapered aerodynamic steel side fairings (Gordie Howe / modern cable-stayed profile)
  const fairingGeo = new THREE.BoxGeometry(1.4, 1.15, spanLen);
  for (const side of [-1, 1]) {
    const fairing = new THREE.Mesh(fairingGeo, steelMat);
    fairing.position.set(side * (deckWidth * 0.5 - 0.2), -0.82, 0);
    fairing.rotation.z = side * 0.32;
    fairing.castShadow = true;
    group.add(fairing);
  }

  // Transverse steel floorbeams / ribs under the deck
  const ribSpacing = 12;
  const ribCount = Math.floor(spanLen / ribSpacing);
  const ribGeo = new THREE.BoxGeometry(deckWidth + 0.6, 0.65, 0.55);
  const ribMesh = new THREE.InstancedMesh(ribGeo, darkSteelMat, ribCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < ribCount; i++) {
    const z = -spanLen * 0.5 + (i + 0.5) * (spanLen / ribCount);
    dummy.position.set(0, -deckThickness - 0.55, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    ribMesh.setMatrixAt(i, dummy.matrix);
  }
  ribMesh.castShadow = true;
  group.add(ribMesh);

  // Center concrete Jersey median barrier + outer concrete edge parapets
  const medianBarrier = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.05, spanLen),
    concreteMat,
  );
  medianBarrier.position.set(0, 0.52, 0);
  medianBarrier.castShadow = true;
  medianBarrier.receiveShadow = true;
  group.add(medianBarrier);

  const parapetGeo = new THREE.BoxGeometry(0.85, 1.15, spanLen);
  const railGeo = new THREE.BoxGeometry(0.16, 0.16, spanLen);
  for (const side of [-1, 1]) {
    const px = side * (deckWidth * 0.5 - 0.65);
    const parapet = new THREE.Mesh(parapetGeo, concreteMat);
    parapet.position.set(px, 0.56, 0);
    parapet.castShadow = true;
    parapet.receiveShadow = true;
    group.add(parapet);

    const topRail = new THREE.Mesh(railGeo, steelMat);
    topRail.position.set(px, 1.38, 0);
    group.add(topRail);
  }

  // Segmented under-deck fascia LED strips for travelling light waves
  const fasciaSegCount = 24;
  const fasciaSegLen = spanLen / fasciaSegCount;
  const fasciaGeo = new THREE.BoxGeometry(0.24, 0.24, fasciaSegLen * 0.94);
  for (let i = 0; i < fasciaSegCount; i++) {
    const z = -spanLen * 0.5 + (i + 0.5) * fasciaSegLen;
    const phase = (i / fasciaSegCount) * Math.PI * 2;
    const ledMat = makeLedMat(0x00e5ff, phase, 'fascia');
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(fasciaGeo, ledMat);
      strip.position.set(side * (deckWidth * 0.5 + 0.38), -0.78, z);
      group.add(strip);
    }
  }

  // Streetlamps along outer parapets
  const lampSpacing = 28;
  const lampCount = Math.max(4, Math.floor(spanLen / lampSpacing));
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 7.2, 8);
  const armGeo = new THREE.BoxGeometry(2.2, 0.14, 0.14);
  const headGeo = new THREE.BoxGeometry(0.9, 0.16, 0.42);
  const bulbGeo = new THREE.BoxGeometry(0.75, 0.08, 0.32);

  for (let i = 0; i < lampCount; i++) {
    const z = -spanLen * 0.46 + (i / (lampCount - 1)) * (spanLen * 0.92);
    for (const side of [-1, 1]) {
      const px = side * (deckWidth * 0.5 - 0.65);
      const pole = new THREE.Mesh(poleGeo, darkSteelMat);
      pole.position.set(px, 4.6, z);
      group.add(pole);

      const arm = new THREE.Mesh(armGeo, darkSteelMat);
      arm.position.set(px - side * 1.0, 8.15, z);
      arm.rotation.z = side * 0.12;
      group.add(arm);

      const head = new THREE.Mesh(headGeo, darkSteelMat);
      head.position.set(px - side * 1.95, 8.05, z);
      group.add(head);

      const bulb = new THREE.Mesh(bulbGeo, lampBulbMat);
      bulb.position.set(px - side * 1.95, 7.95, z);
      group.add(bulb);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Twin Soaring Gordie-Howe-Style Inverted-Y Concrete Towers & Piers
  // ---------------------------------------------------------------------------
  const towerZPositions = [-spanLen * 0.25, spanLen * 0.25];
  const legSpreadX = deckWidth * 0.5 + 2.6;
  const mergeY = towerHeight * 0.56;
  const pierDepth = opts.pierDepth ?? 22;

  for (let tIdx = 0; tIdx < towerZPositions.length; tIdx++) {
    const tz = towerZPositions[tIdx];
    const towerGroup = new THREE.Group();
    towerGroup.position.set(0, 0, tz);
    group.add(towerGroup);

    // Massive concrete waterline foundation pier & cutwater caisson
    const caisson = new THREE.Mesh(
      new THREE.BoxGeometry(legSpreadX * 2 + 6.5, pierDepth, 10.5),
      concreteMat,
    );
    caisson.position.set(0, -pierDepth * 0.5 - 1.6, 0);
    caisson.castShadow = true;
    caisson.receiveShadow = true;
    towerGroup.add(caisson);

    // Cutwater noses (fore/aft)
    const noseGeo = new THREE.CylinderGeometry(4.8, 5.2, pierDepth * 0.75, 6);
    for (const side of [-1, 1]) {
      const nose = new THREE.Mesh(noseGeo, concreteMat);
      nose.position.set(side * (legSpreadX + 2.2), -pierDepth * 0.45 - 1.6, 0);
      towerGroup.add(nose);
    }

    // Lower portal cross-beam supporting the deck
    const lowerBeam = new THREE.Mesh(
      new THREE.BoxGeometry(legSpreadX * 2 + 2.4, 2.8, 5.4),
      concreteMat,
    );
    lowerBeam.position.set(0, -2.9, 0);
    lowerBeam.castShadow = true;
    towerGroup.add(lowerBeam);

    // Inverted-Y angled legs rising from below deck to mergeY
    const legGeo = new THREE.BoxGeometry(3.4, 1, 4.6);
    for (const side of [-1, 1]) {
      const foot = new THREE.Vector3(side * legSpreadX, -3.5, 0);
      const apex = new THREE.Vector3(side * 1.15, mergeY, 0);
      const legMesh = new THREE.Mesh(legGeo, concreteMat);
      const len = orientBetween(legMesh, foot, apex);
      legMesh.scale.y = len;
      legMesh.castShadow = true;
      legMesh.receiveShadow = true;
      towerGroup.add(legMesh);

      // Segmented architectural LED strips up each angled tower leg
      const legLedSegs = 10;
      for (let s = 0; s < legLedSegs; s++) {
        const f0 = 0.08 + (s / legLedSegs) * 0.88;
        const f1 = 0.08 + ((s + 0.85) / legLedSegs) * 0.88;
        const p0 = new THREE.Vector3().lerpVectors(foot, apex, f0);
        const p1 = new THREE.Vector3().lerpVectors(foot, apex, f1);
        const stripGeo = new THREE.BoxGeometry(0.32, 1, 0.36);
        const stripMat = makeLedMat(
          0x29b6f6,
          tIdx * Math.PI + s * 0.45,
          'tower',
        );
        for (const zFace of [-1, 1]) {
          const led = new THREE.Mesh(stripGeo, stripMat);
          const segLen = orientBetween(led, p0, p1);
          led.scale.y = segLen;
          led.position.z += zFace * 2.38;
          towerGroup.add(led);
        }
      }
    }

    // Mid-tower horizontal concrete strut (above deck clearance)
    const midStrutY = mergeY * 0.46;
    const midStrutFrac = (midStrutY + 3.5) / (mergeY + 3.5);
    const midStrutWidth = THREE.MathUtils.lerp(legSpreadX * 2, 2.3, midStrutFrac);
    const midStrut = new THREE.Mesh(
      new THREE.BoxGeometry(midStrutWidth, 2.2, 3.6),
      concreteMat,
    );
    midStrut.position.set(0, midStrutY, 0);
    midStrut.castShadow = true;
    towerGroup.add(midStrut);

    // Upper central pylon mast (anchor zone) from mergeY to towerHeight
    const mastH = towerHeight - mergeY;
    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, mastH, 5.2),
      concreteMat,
    );
    mast.position.set(0, mergeY + mastH * 0.5, 0);
    mast.castShadow = true;
    mast.receiveShadow = true;
    towerGroup.add(mast);

    // Upper mast vertical LED accents + architectural crown cap
    const mastLedMat = makeLedMat(0x38bdf8, tIdx * Math.PI + 2.4, 'tower');
    for (const side of [-1, 1]) {
      for (const zFace of [-1, 1]) {
        const mastLed = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, mastH * 0.92, 0.34),
          mastLedMat,
        );
        mastLed.position.set(side * 2.15, mergeY + mastH * 0.5, zFace * 2.62);
        towerGroup.add(mastLed);
      }
    }

    const crownCap = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 2.6, 5.8),
      steelMat,
    );
    crownCap.position.set(0, towerHeight + 1.1, 0);
    towerGroup.add(crownCap);

    const crownRingMat = makeLedMat(0x00ffd5, tIdx * Math.PI + 4.0, 'node');
    const crownRing = new THREE.Mesh(
      new THREE.BoxGeometry(5.1, 0.55, 6.1),
      crownRingMat,
    );
    crownRing.position.set(0, towerHeight + 0.1, 0);
    towerGroup.add(crownRing);

    // Aviation spire beacon
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.35, 6.5, 8),
      steelMat,
    );
    spire.position.set(0, towerHeight + 5.4, 0);
    towerGroup.add(spire);
  }

  // Approach abutment piers at start & end
  for (const az of [-spanLen * 0.5 + 2.5, spanLen * 0.5 - 2.5]) {
    const abutment = new THREE.Mesh(
      new THREE.BoxGeometry(deckWidth + 2.0, opts.abutmentDepth ?? 12, 5.0),
      concreteMat,
    );
    abutment.position.set(0, -((opts.abutmentDepth ?? 12) / 2 + 1.2), az);
    abutment.castShadow = true;
    abutment.receiveShadow = true;
    group.add(abutment);
  }

  // ---------------------------------------------------------------------------
  // 3. Fan-Pattern Steel Stay Cables & Glowing Cable Accent Nodes
  // ---------------------------------------------------------------------------
  const cablesPerSide = 11;
  const cableRadius = 0.095;
  const baseCableGeo = new THREE.CylinderGeometry(cableRadius, cableRadius, 1, 6);
  const collarGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.3, 8);
  const nodeGeo = new THREE.SphereGeometry(0.24, 8, 6);

  const cableDeckX = deckWidth * 0.5 - 0.65;
  const maxReach = spanLen * 0.235;
  const minOffset = 10;

  for (let tIdx = 0; tIdx < towerZPositions.length; tIdx++) {
    const tz = towerZPositions[tIdx];

    for (let c = 0; c < cablesPerSide; c++) {
      const frac = c / (cablesPerSide - 1);
      const anchorY = THREE.MathUtils.lerp(
        mergeY + (towerHeight - mergeY) * 0.22,
        towerHeight - 1.8,
        frac,
      );
      const zOffset = THREE.MathUtils.lerp(minOffset, maxReach, frac);

      for (const dirZ of [-1, 1]) {
        const deckZ = tz + dirZ * zOffset;
        if (Math.abs(deckZ) > spanLen * 0.49) continue;

        for (const sideX of [-1, 1]) {
          const topPt = new THREE.Vector3(sideX * 1.9, anchorY, tz);
          const botPt = new THREE.Vector3(sideX * cableDeckX, 0.65, deckZ);

          const cable = new THREE.Mesh(baseCableGeo, cableMat);
          const cLen = orientBetween(cable, botPt, topPt);
          cable.scale.y = cLen;
          group.add(cable);

          // Deck-level steel anchor socket collar
          const collar = new THREE.Mesh(collarGeo, darkSteelMat);
          const collarTop = new THREE.Vector3().lerpVectors(botPt, topPt, 0.04);
          orientBetween(collar, botPt, collarTop);
          group.add(collar);

          // Glowing LED cable accent nodes (2 per stay cable for Singapore/China shimmer)
          for (const nodeT of [0.14, 0.34]) {
            const nodeMat = makeLedMat(
              0x38f9d7,
              tIdx * 2.1 + c * 0.38 + nodeT * 4.0,
              'node',
            );
            const node = new THREE.Mesh(nodeGeo, nodeMat);
            node.position.lerpVectors(botPt, topPt, nodeT);
            group.add(node);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Smooth Dusk / Night LED Animation
  // ---------------------------------------------------------------------------
  const updateLed = (elapsed: number, nightFactor: number): void => {
    const nf = THREE.MathUtils.clamp(nightFactor, 0, 1);
    const active = THREE.MathUtils.smoothstep(nf, 0.05, 0.85);

    lampBulbMat.emissiveIntensity = THREE.MathUtils.lerp(0.15, 2.4, active);

    ledU.uLedTime.value = elapsed; ledU.uLedActive.value = active;
  };

  group.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const tag = ledPhaseOf.get(mesh.material as THREE.Material); if (!tag) return;
    const g = mesh.geometry.clone();
    g.setAttribute('ledPhase', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(tag.phase), 1));
    mesh.geometry = g; (mesh.material as THREE.Material).dispose(); mesh.material = ledMats[tag.palette];
  });
  return { group, updateLed };
}
