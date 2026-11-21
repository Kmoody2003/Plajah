import * as THREE from 'three';

export interface ProStadiumResult {
  spectators: THREE.Vector3[];
  accentMats: THREE.MeshBasicMaterial[];
  floodlightAnchors: THREE.Vector3[];
}

/**
 * Builds a full NFL / SOL Gridiron League pro stadium:
 * - 3-tier superellipse concrete seating bowl with aisles and instanced seats
 * - Mid-bowl glass luxury club suites with illuminated interior strips
 * - Dual cantilevered 50-yard broadcast press boxes along both sidelines
 * - Sweeping steel roof canopy with open sky oculus, radial trusses, and catwalk floodlight banks
 * - Monumental end-zone scoreboard monolith towers, corner player tunnels, and pyro cauldrons
 * - Sideline team benches, seated player/coach silhouettes, coolers, tents, and camera cart
 * - Instanced SOL-era futuristic skyline ring beyond the outer facade
 */
export function buildProStadium(
  group: THREE.Group,
  primaryAccent: string = '#00daf3',
  secondaryAccent: string = '#fbbf24'
): ProStadiumResult {
  const concrete = new THREE.MeshStandardMaterial({ color: '#586472', roughness: 0.92, metalness: 0.04 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: '#2b3440', roughness: 0.88, metalness: 0.08 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c4cbd4', metalness: 0.74, roughness: 0.32 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#1b2432', metalness: 0.72, roughness: 0.36 });
  const glass = new THREE.MeshStandardMaterial({
    color: '#1e3a52',
    metalness: 0.72,
    roughness: 0.14,
    transparent: true,
    opacity: 0.86,
  });
  const warmSuiteMat = new THREE.MeshBasicMaterial({ color: '#fde68a' });

  const accentPrimaryMat = new THREE.MeshBasicMaterial({ color: primaryAccent });
  const accentSecondaryMat = new THREE.MeshBasicMaterial({ color: secondaryAccent });
  const accentMats: THREE.MeshBasicMaterial[] = [accentPrimaryMat, accentSecondaryMat];

  const spectators: THREE.Vector3[] = [];
  const floodlightAnchors: THREE.Vector3[] = [];

  const point = (a: number, offset: number, y: number) =>
    new THREE.Vector3(
      Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.56) * (35 + offset),
      y,
      Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.56) * (69 + offset)
    );

  const ring = (inner: number, outer: number, y: number, material: THREE.Material, rise = 0) => {
    const vertices: number[] = [];
    const indices: number[] = [];
    const segs = 160;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      vertices.push(...point(a, inner, y).toArray(), ...point(a, outer, y + rise).toArray());
      if (i < segs) {
        const n = i * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // 1. 3-Tier Seating Bowl + Luxury Suite Ring
  const seatMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  for (let tier = 0; tier < 3; tier++) {
    const base = tier * 14;
    const elevation = 2.0 + tier * 10.6;
    const rowCount = tier === 2 ? 10 : 12;

    for (let row = 0; row < rowCount; row++) {
      const offset = base + row * 0.95;
      const y = elevation + row * 0.64;
      ring(offset, offset + 0.95, y, concrete);
      ring(offset, offset + 0.02, y - 0.64, darkConcrete, 0.64);

      for (let j = 0; j < 448; j++) {
        if (j % 28 < 3) continue; // radial stair aisles
        const angle = (j / 448) * Math.PI * 2;
        // Leave clear gap at upper end zones for monumental scoreboard monoliths
        if (tier >= 1 && Math.abs(Math.cos(angle)) < 0.25) continue;

        const p = point(angle, offset + 0.48, y + 0.3);
        dummy.position.copy(p);
        dummy.lookAt(0, p.y, 0);
        dummy.updateMatrix();
        seatMatrices.push(dummy.matrix.clone());
        if ((j + row) % 3 !== 0) {
          spectators.push(p.clone().add(new THREE.Vector3(0, 0.55, 0)));
        }
      }
    }

    // Concourse & Glass Luxury Suites between lower/club and club/upper decks
    ring(base + rowCount * 0.95, base + 14, elevation + rowCount * 0.64, concrete);
    if (tier < 2) {
      ring(base + 11.8, base + 11.86, elevation + rowCount * 0.64 + 0.1, glass, 2.4);
      ring(base + 12.6, base + 12.64, elevation + rowCount * 0.64 + 0.5, warmSuiteMat, 1.3);
    }

    // Illuminated Team-Colored Deck Fascia Trim
    ring(
      base - 0.15,
      base + 0.05,
      elevation - 0.65,
      tier === 1 ? accentPrimaryMat : accentSecondaryMat,
      0.6
    );
  }

  const seats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.56, 0.48, 0.56),
    new THREE.MeshStandardMaterial({ color: '#1f334a', roughness: 0.72 }),
    seatMatrices.length
  );
  seatMatrices.forEach((m, i) => seats.setMatrixAt(i, m));
  group.add(seats);

  // 2. Dual Cantilevered 50-Yard Broadcast Press Boxes (West & East Sidelines)
  [-1, 1].forEach((side) => {
    const pbGroup = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7.2, 5.4, 52), darkSteel);
    hull.position.set(side * 61.5, 25.5, 0);
    pbGroup.add(hull);

    const pbGlass = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 48), glass);
    pbGlass.position.set(side * 57.8, 25.6, 0);
    pbGroup.add(pbGlass);

    const pbWarm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 44), warmSuiteMat);
    pbWarm.position.set(side * 58.3, 25.3, 0);
    pbGroup.add(pbWarm);

    const pbTrim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 52.4), accentPrimaryMat);
    pbTrim.position.set(side * 57.75, 22.8, 0);
    pbGroup.add(pbTrim);

    // Roof broadcast camera deck + satellite dish silhouette
    const deckRail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 18), steel);
    deckRail.position.set(side * 59.5, 28.6, 0);
    pbGroup.add(deckRail);

    group.add(pbGroup);
  });

  // 3. Sweeping Steel Roof Canopy + Tension Ring + Catwalk Floodlight Banks
  ring(
    28,
    50,
    37.5,
    new THREE.MeshStandardMaterial({ color: '#cfd6df', side: THREE.DoubleSide, metalness: 0.55, roughness: 0.42 }),
    2.4
  );
  // Inner architectural oculus halo ring
  ring(27.5, 28.4, 37.3, accentPrimaryMat, 0.45);

  const beams: THREE.Matrix4[] = [];
  const beam = (a: THREE.Vector3, b: THREE.Vector3) => {
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    dummy.scale.set(0.26, a.distanceTo(b), 0.26);
    dummy.updateMatrix();
    beams.push(dummy.matrix.clone());
  };

  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    beam(point(a, 48, 0), point(a, 48, 40.5));
    beam(point(a, 48, 40.5), point(a, 27.8, 37.2));
    beam(point(a, 48, 31), point(a, 27.8, 37.2));
    beam(point(a, 48, 39), point(a + Math.PI / 32, 48, 31));
  }
  const trusses = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), steel, beams.length);
  beams.forEach((m, i) => trusses.setMatrixAt(i, m));
  group.add(trusses);

  // 8 Balanced Catwalk Floodlight Banks mounted to inner oculus edge
  const lightRackMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const floodAngles = [0.38, 1.12, 2.02, 2.76, 3.52, 4.26, 5.16, 5.9];
  floodAngles.forEach((a) => {
    const anchor = point(a, 27.2, 36.4);
    floodlightAnchors.push(anchor);

    const bank = new THREE.Group();
    bank.position.copy(anchor);
    bank.lookAt(0, 0, 0);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.1, 0.8), darkSteel);
    bank.add(frame);
    const bulbPanel = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.5, 0.25), lightRackMat);
    bulbPanel.position.z = 0.42;
    bank.add(bulbPanel);
    group.add(bank);
  });

  // 4. Monumental End-Zone Scoreboard Monolith Towers + Corner Player Tunnels + Pyro Cauldrons
  const flameGlowMat = new THREE.MeshBasicMaterial({ color: '#ff6b00' });
  const flameCoreMat = new THREE.MeshBasicMaterial({ color: '#fde047' });

  [-1, 1].forEach((side) => {
    // Scoreboard Monolith Frame positioned neatly behind FieldBuilder's jumbotron at z = ±82.8
    const towerZ = side * 84.0;
    const monolith = new THREE.Mesh(new THREE.BoxGeometry(37.5, 16.5, 2.2), darkSteel);
    monolith.position.set(0, 21.5, towerZ);
    group.add(monolith);

    // Glowing architectural top crown & bottom trim
    const crown = new THREE.Mesh(new THREE.BoxGeometry(38.4, 0.7, 2.6), accentPrimaryMat);
    crown.position.set(0, 30.0, towerZ);
    group.add(crown);
    const bottomTrim = new THREE.Mesh(new THREE.BoxGeometry(38.0, 0.6, 2.5), accentSecondaryMat);
    bottomTrim.position.set(0, 13.0, towerZ);
    group.add(bottomTrim);

    // Twin structural monolith pylons supporting the scoreboard
    [-16.5, 16.5].forEach((px) => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.6, 31, 3.0), darkConcrete);
      pylon.position.set(px, 15.5, towerZ + side * 0.4);
      group.add(pylon);
    });

    // Twin End-Zone Pyro Cauldrons flanking the scoreboard
    [-22, 22].forEach((cx) => {
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 6.2, 8), darkSteel);
      pedestal.position.set(cx, 3.1, side * 72);
      group.add(pedestal);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 0.95, 1.1, 10), steel);
      bowl.position.set(cx, 6.5, side * 72);
      group.add(bowl);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.8, 8), flameGlowMat);
      flame.position.set(cx, 8.2, side * 72);
      group.add(flame);
      const innerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.8, 8), flameCoreMat);
      innerFlame.position.set(cx, 7.9, side * 72);
      group.add(innerFlame);
    });

    // Corner Player Entrance Tunnel
    const tunnelX = side * 24;
    const tunnelZ = side * 66.5;
    const tunnelArch = new THREE.Mesh(new THREE.BoxGeometry(7.6, 4.6, 4.2), darkConcrete);
    tunnelArch.position.set(tunnelX, 2.3, tunnelZ);
    group.add(tunnelArch);
    const tunnelDark = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 3.5, 4.4),
      new THREE.MeshBasicMaterial({ color: '#050810' })
    );
    tunnelDark.position.set(tunnelX, 1.75, tunnelZ);
    group.add(tunnelDark);
    const tunnelTrim = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.35, 4.4), accentPrimaryMat);
    tunnelTrim.position.set(tunnelX, 4.7, tunnelZ);
    group.add(tunnelTrim);
  });

  // 5. Field Apron, Padded Perimeter Wall, Team Benches, Coolers, Tents & Camera Cart
  ring(-4.2, 0.2, 0.015, new THREE.MeshStandardMaterial({ color: '#333d45', roughness: 0.98 }));
  ring(0, 0.35, 0.2, new THREE.MeshStandardMaterial({ color: '#142230', roughness: 0.85 }), 1.35);

  const coolerMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.4 });
  const tentMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.7 });
  const benchSilhouetteMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 });

  for (const side of [-1, 1]) {
    // 5 Team Benches + Seated Sideline Silhouettes
    for (let i = 0; i < 5; i++) {
      const bz = (i - 2) * 8.2;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 5.4), steel);
      bench.position.set(side * 30.2, 0.55, bz);
      group.add(bench);

      // Seated sideline reserve silhouettes
      for (let s = -1; s <= 1; s++) {
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.42), benchSilhouetteMat);
        torso.position.set(side * 30.2, 1.15, bz + s * 1.45);
        group.add(torso);
        const helmet = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 8, 6),
          side < 0 ? accentPrimaryMat : accentSecondaryMat
        );
        helmet.position.set(side * 30.2, 1.66, bz + s * 1.45);
        group.add(helmet);
      }
    }

    // Hydration Coolers on tables
    [-12, 12].forEach((cz) => {
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 2.2), darkSteel);
      table.position.set(side * 31.8, 0.42, cz);
      group.add(table);
      const cooler = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.36, 0.75, 10), coolerMat);
      cooler.position.set(side * 31.8, 1.2, cz);
      group.add(cooler);
    });

    // Sideline Coach / Medical Tent
    const tent = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 4.4), tentMat);
    tent.position.set(side * 32.4, 1.4, -28 * side);
    group.add(tent);
  }

  // Rolling Broadcast Camera Cart near East 50-yard line
  const cartBase = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 2.2), darkSteel);
  cartBase.position.set(28.5, 0.5, 4);
  group.add(cartBase);
  const cartMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 8), steel);
  cartMast.position.set(28.5, 1.7, 4);
  group.add(cartMast);
  const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55), darkSteel);
  camHead.position.set(28.3, 2.85, 4);
  group.add(camHead);

  // 6. Distant SOL-Era City Skyline Ring (outside the stadium perimeter)
  const skylineCount = 44;
  const skylineGeo = new THREE.BoxGeometry(1, 1, 1);
  const skylineMat = new THREE.MeshStandardMaterial({
    color: '#111b2b',
    roughness: 0.7,
    metalness: 0.35,
    emissive: '#0c2340',
    emissiveIntensity: 0.55,
  });
  const skylineMesh = new THREE.InstancedMesh(skylineGeo, skylineMat, skylineCount);
  for (let i = 0; i < skylineCount; i++) {
    const a = (i / skylineCount) * Math.PI * 2;
    const dist = 148 + (i % 5) * 16;
    const h = 38 + ((i * 29) % 72);
    const w = 10 + ((i * 7) % 14);
    const d = 10 + ((i * 11) % 14);
    dummy.position.set(Math.cos(a) * dist, h * 0.5 - 4, Math.sin(a) * dist * 1.15);
    dummy.rotation.set(0, -a, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    skylineMesh.setMatrixAt(i, dummy.matrix);
  }
  group.add(skylineMesh);

  return { spectators, accentMats, floodlightAnchors };
}

/** Backward-compatible helper returning spectator anchor positions. */
export function buildStadiumArchitecture(group: THREE.Group): THREE.Vector3[] {
  return buildProStadium(group).spectators;
}
