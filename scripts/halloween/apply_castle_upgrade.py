"""
Applies the Console-Grade 12-Room Castle Mansion, Billowing Velvet Curtains, Wind-Blown 3D Trees & Ferns,
Roadside Floodlights, Mixamo Rig Orientation, and EffectComposer + UnrealBloomPass Render Loop
to `components/taleo/HauntedCastleExhibition.tsx`.
"""

import os

FILE_PATH = os.path.join("components", "taleo", "HauntedCastleExhibition.tsx")

with open(FILE_PATH, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Replace from `// 1. EXTERIOR TERRAIN & LONESOME CROSSROADS INTERSECTION`
#    up to `// 7. MOLOTOV COCKTAIL PROJECTILES & EXPLOSIONS`
start_marker = "    // ==========================================================================\n    // 1. EXTERIOR TERRAIN & LONESOME CROSSROADS INTERSECTION"
end_marker = "    // ==========================================================================\n    // 7. MOLOTOV COCKTAIL PROJECTILES & EXPLOSIONS"

assert start_marker in text, "start_marker not found!"
assert end_marker in text, "end_marker not found!"

replacement_section = """    // ==========================================================================
    // 1. EXTERIOR TERRAIN, LONESOME CROSSROADS ROAD & WIND-BLOWN TREES/PLANTS
    // ==========================================================================
    const groundMat = new THREE.MeshStandardMaterial({
      map: forestGroundPbr.map,
      normalMap: forestGroundPbr.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: forestGroundPbr.roughnessMap,
      color: '#5c4e6b',
      roughness: 0.86,
      metalness: 0.05,
    });
    const southGround = new THREE.Mesh(new THREE.PlaneGeometry(240, 120), groundMat);
    southGround.rotation.x = -Math.PI / 2;
    southGround.position.set(0, -0.02, 38);
    southGround.receiveShadow = true;
    scene.add(southGround);

    const northBackGround = new THREE.Mesh(new THREE.PlaneGeometry(240, 100), groundMat);
    northBackGround.rotation.x = -Math.PI / 2;
    northBackGround.position.set(0, -0.02, -107);
    northBackGround.receiveShadow = true;
    scene.add(northBackGround);

    const westGround = new THREE.Mesh(new THREE.PlaneGeometry(95, 36), groundMat);
    westGround.rotation.x = -Math.PI / 2;
    westGround.position.set(-70.5, -0.02, -39.5);
    westGround.receiveShadow = true;
    scene.add(westGround);

    const eastGround = new THREE.Mesh(new THREE.PlaneGeometry(95, 36), groundMat);
    eastGround.rotation.x = -Math.PI / 2;
    eastGround.position.set(70.5, -0.02, -39.5);
    eastGround.receiveShadow = true;
    scene.add(eastGround);

    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltPbr.map,
      normalMap: asphaltPbr.normalMap,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughnessMap: asphaltPbr.roughnessMap,
      color: '#625b70',
      roughness: 0.42,
      metalness: 0.26,
    });
    const nsRoad = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 88), roadMat);
    nsRoad.rotation.x = -Math.PI / 2;
    nsRoad.position.set(0, 0.02, 22);
    nsRoad.receiveShadow = true;
    scene.add(nsRoad);

    const ewRoad = new THREE.Mesh(new THREE.PlaneGeometry(130, 9.2), roadMat);
    ewRoad.rotation.x = -Math.PI / 2;
    ewRoad.position.set(0, 0.03, 0);
    ewRoad.receiveShadow = true;
    scene.add(ewRoad);

    // Gothic Stone Causeway Curbs leading to the Castle Gate (Z = -6 to -22)
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 16.5), stoneWallMat);
      curb.position.set(side * 5.2, 0.22, -13.8);
      curb.receiveShadow = true;
      scene.add(curb);
    }

    // Center Crossroads Wooden Signpost with Hanging Amber Lantern
    const signpostGroup = new THREE.Group();
    signpostGroup.position.set(-5.2, 0, 5.2);
    const centerPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 4.8, 12),
      woodRafterMat
    );
    centerPost.position.y = 2.4;
    signpostGroup.add(centerPost);
    for (const [plankY, rotY] of [
      [3.8, 0.2],
      [3.3, -1.3],
      [4.2, 1.5],
    ]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.32, 0.08), woodRafterMat);
      plank.position.set(0, plankY, 0);
      plank.rotation.y = rotY;
      signpostGroup.add(plank);
    }
    const lanternOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#ffbe42' })
    );
    lanternOrb.position.set(0, 4.9, 0);
    signpostGroup.add(lanternOrb);
    scene.add(signpostGroup);

    // Wind-Blown Roadside Autumn Grass & Reed Clusters (GPU Vertex Wind Shader!)
    const grassMat = new THREE.MeshStandardMaterial({
      color: '#4d6b3c',
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    applyWindSwayShader(grassMat, 'FERN_PLANT');
    const grassBladeGeo = new THREE.ConeGeometry(0.18, 1.15, 4);
    grassBladeGeo.translate(0, 0.55, 0);
    const grassGroup = new THREE.Group();
    for (let gIdx = 0; gIdx < 220; gIdx++) {
      const side = gIdx % 2 === 0 ? -1 : 1;
      const gx = side * (5.6 + (gIdx % 17) * 1.45);
      const gz = -20 + ((gIdx * 7) % 58);
      if (Math.abs(gz) < 5.0 && Math.abs(gx) < 35) continue;
      const tuft = new THREE.Mesh(grassBladeGeo, grassMat);
      tuft.position.set(gx, 0, gz);
      tuft.rotation.y = (gIdx * 1.7) % Math.PI;
      tuft.scale.setScalar(0.75 + (gIdx % 5) * 0.18);
      grassGroup.add(tuft);
    }
    scene.add(grassGroup);

    // ==========================================================================
    // 2. TOTALLY EXPLORABLE 4-LEVEL, 12-ROOM HAUNTED CASTLE MANSION
    //    WITH GOTHIC RIBBED VAULTS, FLUTED COLUMNS, CHANDELIERS, FIREPLACES,
    //    STAINED-GLASS WINDOWS, BILLOWING VELVET CURTAINS & REALISTIC FURNITURE!
    // ==========================================================================
    const castleMansionGroup = new THREE.Group();
    scene.add(castleMansionGroup);

    const addBoxMesh = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material = stoneWallMat,
      rotY = 0
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (rotY !== 0) m.rotation.y = rotY;
      m.receiveShadow = true;
      m.castShadow = true;
      castleMansionGroup.add(m);
      return m;
    };

    const addGothicChandelier = (cx: number, cy: number, cz: number, candleColor = '#ffbe42') => {
      const chGroup = new THREE.Group();
      chGroup.position.set(cx, cy, cz);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), darkTrimMat);
      chain.position.y = 0.65;
      chGroup.add(chain);
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(1.45, 0.09, 10, 24),
        goldFrameMat
      );
      wheel.rotation.x = Math.PI / 2;
      chGroup.add(wheel);
      const innerWheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.06, 8, 18),
        darkTrimMat
      );
      innerWheel.rotation.x = Math.PI / 2;
      innerWheel.position.y = 0.25;
      chGroup.add(innerWheel);
      const candleMat = new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.4 });
      const flameMat = new THREE.MeshBasicMaterial({ color: candleColor });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rx = Math.cos(ang) * 1.45;
        const rz = Math.sin(ang) * 1.45;
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 8), candleMat);
        candle.position.set(rx, 0.22, rz);
        chGroup.add(candle);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), flameMat);
        flame.scale.set(0.8, 1.6, 0.8);
        flame.position.set(rx, 0.45, rz);
        chGroup.add(flame);
      }
      castleMansionGroup.add(chGroup);
    };

    const addGothicWindowWithBillowingCurtains = (
      wx: number,
      wy: number,
      wz: number,
      rotY: number,
      glassColor = '#ff8c38',
      rayColor = '#ffbe73'
    ) => {
      const winGroup = new THREE.Group();
      winGroup.position.set(wx, wy, wz);
      winGroup.rotation.y = rotY;

      const outerFrame = new THREE.Mesh(
        new THREE.BoxGeometry(2.55, 4.45, 0.28),
        darkTrimMat
      );
      winGroup.add(outerFrame);

      const glassMat = new THREE.MeshStandardMaterial({
        color: glassColor,
        emissive: new THREE.Color(glassColor),
        emissiveIntensity: 2.2,
        roughness: 0.15,
        metalness: 0.1,
      });
      const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3.95), glassMat);
      glassPane.position.z = 0.16;
      winGroup.add(glassPane);

      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.95, 0.32), darkTrimMat);
      winGroup.add(vBar);
      for (const hy of [-0.8, 0.8]) {
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.32), darkTrimMat);
        hBar.position.y = hy;
        winGroup.add(hBar);
      }

      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 3.4, 10),
        goldFrameMat
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, 2.25, 0.32);
      winGroup.add(rod);
      for (const fx of [-1.72, 1.72]) {
        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), goldFrameMat);
        finial.position.set(fx, 2.25, 0.32);
        winGroup.add(finial);
      }

      const curtainGeo = new THREE.PlaneGeometry(1.15, 4.35, 14, 24);
      const leftCurtain = new THREE.Mesh(curtainGeo, velvetCurtainMat);
      leftCurtain.position.set(-1.08, 0.05, 0.34);
      winGroup.add(leftCurtain);

      const rightCurtain = new THREE.Mesh(curtainGeo, velvetCurtainMat);
      rightCurtain.position.set(1.08, 0.05, 0.34);
      winGroup.add(rightCurtain);

      const rayMat = new THREE.MeshBasicMaterial({
        color: rayColor,
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const rayShaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.85, 6.2, 14, 1, true),
        rayMat
      );
      rayShaft.position.set(0, -0.95, 2.45);
      rayShaft.rotation.x = Math.PI * 0.34;
      winGroup.add(rayShaft);

      castleMansionGroup.add(winGroup);
    };

    const addGothicColumn = (cx: number, floorY: number, cz: number, height = 5.8) => {
      const colGroup = new THREE.Group();
      colGroup.position.set(cx, floorY, cz);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.1), darkTrimMat);
      base.position.y = 0.225;
      colGroup.add(base);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.42, height - 0.9, 14),
        stoneWallMat
      );
      shaft.position.y = height * 0.5;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      colGroup.add(shaft);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.45, 1.15), darkTrimMat);
      cap.position.y = height - 0.225;
      colGroup.add(cap);
      const sconceFlame = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#ff9d3b' })
      );
      sconceFlame.position.set(0, height * 0.58, 0.52);
      colGroup.add(sconceFlame);
      castleMansionGroup.add(colGroup);
    };

    const addGothicFireplace = (fx: number, fy: number, fz: number, rotY: number) => {
      const fpGroup = new THREE.Group();
      fpGroup.position.set(fx, fy, fz);
      fpGroup.rotation.y = rotY;
      const surround = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.2, 0.95), gothicBrickMat);
      surround.position.y = 1.6;
      fpGroup.add(surround);
      const mantel = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.35, 1.25), woodRafterMat);
      mantel.position.y = 3.25;
      fpGroup.add(mantel);
      const firebox = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.85, 0.55),
        new THREE.MeshBasicMaterial({ color: '#14080e' })
      );
      firebox.position.set(0, 0.95, 0.28);
      fpGroup.add(firebox);
      const hearthGlow = new THREE.Mesh(
        new THREE.ConeGeometry(0.78, 1.25, 12),
        new THREE.MeshBasicMaterial({ color: '#ff6a00' })
      );
      hearthGlow.position.set(0, 0.72, 0.42);
      fpGroup.add(hearthGlow);
      castleMansionGroup.add(fpGroup);
    };

    const addFloorWithStairwellHole = (elevY: number, mat: THREE.Material) => {
      addBoxMesh(48, 0.38, 13, 0, elevY - 0.19, -28.5, mat);
      addBoxMesh(48, 0.38, 13, 0, elevY - 0.19, -51.5, mat);
      addBoxMesh(19, 0.38, 10, -14.5, elevY - 0.19, -40.0, mat);
      addBoxMesh(19, 0.38, 10, 14.5, elevY - 0.19, -40.0, mat);
    };

    addBoxMesh(48, 0.42, 36, 0, -6.21, -40.0, marbleFloorMat);
    addBoxMesh(45, 0.08, 15.5, 0, -5.94, -49.5, cryptWaterMat);

    addFloorWithStairwellHole(0.0, marbleFloorMat);
    addBoxMesh(15.8, 0.04, 16.2, -15.2, 0.02, -49.0, woodPlankFloorMat);
    addBoxMesh(15.8, 0.04, 16.2, 15.2, 0.02, -49.0, woodPlankFloorMat);
    addBoxMesh(4.4, 0.05, 13.5, 0, 0.03, -28.5, redCarpetMat);

    addFloorWithStairwellHole(6.0, woodPlankFloorMat);
    addBoxMesh(6.5, 0.05, 12.0, 0, 6.03, -28.8, redCarpetMat);

    addFloorWithStairwellHole(12.0, woodRafterMat);

    const stairCenterX = 0;
    const stairCenterZ = -40;
    const stairCore = new THREE.Mesh(
      new THREE.CylinderGeometry(1.08, 1.18, 21.5, 20),
      stoneWallMat
    );
    stairCore.position.set(stairCenterX, 3.5, stairCenterZ);
    castleMansionGroup.add(stairCore);

    const totalSteps = 72;
    const stepGeo = new THREE.BoxGeometry(2.65, 0.24, 0.98);
    const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.08, 8);
    const goldCapGeo = new THREE.SphereGeometry(0.085, 10, 10);
    for (let s = 0; s <= totalSteps; s++) {
      const frac = s / totalSteps;
      const stepY = -6.0 + frac * 18.0;
      const angle = frac * Math.PI * 6.0;
      const rMid = 2.45;
      const sx = stairCenterX + Math.cos(angle) * rMid;
      const sz = stairCenterZ + Math.sin(angle) * rMid;

      const tread = new THREE.Mesh(stepGeo, s % 2 === 0 ? marbleFloorMat : woodPlankFloorMat);
      tread.position.set(sx, stepY, sz);
      tread.rotation.y = -angle;
      castleMansionGroup.add(tread);

      const rx = stairCenterX + Math.cos(angle) * 3.68;
      const rz = stairCenterZ + Math.sin(angle) * 3.68;
      const post = new THREE.Mesh(postGeo, darkTrimMat);
      post.position.set(rx, stepY + 0.52, rz);
      castleMansionGroup.add(post);

      if (s % 4 === 0) {
        const orb = new THREE.Mesh(goldCapGeo, goldFrameMat);
        orb.position.set(rx, stepY + 1.1, rz);
        castleMansionGroup.add(orb);
      }
    }

    addBoxMesh(0.85, 22.0, 36.0, -24.0, 5.0, -40.0, stoneWallMat);
    addBoxMesh(0.85, 22.0, 36.0, 24.0, 5.0, -40.0, stoneWallMat);
    addBoxMesh(48.8, 22.0, 0.85, 0.0, 5.0, -58.0, stoneWallMat);

    for (const wy of [0.85, 6.85]) {
      addBoxMesh(0.18, 1.65, 35.2, -23.48, wy, -40.0, woodRafterMat);
      addBoxMesh(0.18, 1.65, 35.2, 23.48, wy, -40.0, woodRafterMat);
      addBoxMesh(47.0, 1.65, 0.18, 0.0, wy, -57.48, woodRafterMat);
    }

    addBoxMesh(19.8, 22.0, 0.85, -14.1, 5.0, -22.0, stoneWallMat);
    addBoxMesh(19.8, 22.0, 0.85, 14.1, 5.0, -22.0, stoneWallMat);
    addBoxMesh(8.4, 6.0, 0.85, 0.0, -3.0, -22.0, stoneWallMat);
    addBoxMesh(8.4, 10.8, 0.85, 0.0, 10.6, -22.0, stoneWallMat);

    for (let mx = -22; mx <= 22; mx += 4.0) {
      addBoxMesh(2.2, 1.6, 1.1, mx, 16.8, -22.0, darkTrimMat);
      addBoxMesh(2.2, 1.6, 1.1, mx, 16.8, -58.0, darkTrimMat);
    }

    for (let gx = -3.6; gx <= 3.6; gx += 0.6) {
      addBoxMesh(0.09, 1.8, 0.09, gx, 5.1, -21.8, darkTrimMat);
    }
    for (const tx of [-4.8, 4.8]) {
      addBoxMesh(0.7, 2.3, 0.7, tx, 1.15, -21.1, darkTrimMat);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.95, 10),
        new THREE.MeshBasicMaterial({ color: '#ff8800' })
      );
      flame.position.set(tx, 2.68, -21.1);
      castleMansionGroup.add(flame);
    }

    // --- GOTHIC WINDOWS WITH BILLOWING VELVET CURTAINS & MOONBEAM SHAFTS ACROSS THE MANSION ---
    for (const wz of [-28.0, -35.0, -45.0, -52.0]) {
      addGothicWindowWithBillowingCurtains(-23.5, 3.0, wz, Math.PI / 2, '#ff8c38', '#ffbe73');
      addGothicWindowWithBillowingCurtains(-23.5, 9.0, wz, Math.PI / 2, '#38bdf8', '#7dd3fc');
    }
    for (const wz of [-28.0, -35.0, -45.0, -52.0]) {
      addGothicWindowWithBillowingCurtains(23.5, 3.0, wz, -Math.PI / 2, '#f97316', '#fdba74');
      addGothicWindowWithBillowingCurtains(23.5, 9.0, wz, -Math.PI / 2, '#a855f7', '#d8b4fe');
    }
    for (const wx of [-17.0, -10.5, 10.5, 17.0]) {
      addGothicWindowWithBillowingCurtains(wx, 3.0, -22.45, 0, '#ff7b29', '#fdba74');
      addGothicWindowWithBillowingCurtains(wx, 9.0, -22.45, 0, '#ec4899', '#f9a8d4');
    }

    // --- HANGING WROUGHT-IRON & GOLD CANDLE CHANDELIERS IN EVERY ROOM & HALL ---
    addGothicChandelier(0, 4.6, -28.5, '#ffbe42');
    addGothicChandelier(-15.5, 4.6, -30.5, '#ffbe42');
    addGothicChandelier(15.5, 4.6, -30.5, '#ffbe42');
    addGothicChandelier(-15.5, 4.6, -49.0, '#ff9d3b');
    addGothicChandelier(15.5, 4.6, -49.0, '#ffbe42');
    addGothicChandelier(0, 10.6, -29.0, '#ffbe42');
    addGothicChandelier(-15.5, 10.6, -40.0, '#34d399');
    addGothicChandelier(15.5, 10.6, -40.0, '#f43f5e');
    addGothicChandelier(-15.0, -1.4, -31.0, '#34d399');
    addGothicChandelier(0, -1.4, -49.0, '#38bdf8');
    addGothicChandelier(15.0, -1.4, -31.0, '#ef4444');

    // --- FLUTED GOTHIC STONE PILLARS & RIBBED GROIN-VAULT CEILING ARCHES ---
    for (const cz of [-26.0, -33.0, -47.0, -54.0]) {
      for (const cx of [-6.8, 6.8]) {
        addGothicColumn(cx, -6.0, cz, 5.8);
        addGothicColumn(cx, 0.0, cz, 5.8);
        addGothicColumn(cx, 6.0, cz, 5.8);
      }
      addBoxMesh(14.2, 0.38, 0.45, 0, 5.65, cz, darkTrimMat);
      addBoxMesh(16.4, 0.38, 0.45, 0, 11.65, cz, darkTrimMat);
    }

    const addPartitionWallWithDoorway = (
      axis: 'X' | 'Z',
      fixedCoord: number,
      spanStart: number,
      spanEnd: number,
      floorY: number,
      wallHeight = 5.8,
      doorWidth = 4.4
    ) => {
      const totalLen = spanEnd - spanStart;
      const mid = (spanStart + spanEnd) * 0.5;
      const segLen = Math.max(0.5, (totalLen - doorWidth) * 0.5);
      const seg1Center = spanStart + segLen * 0.5;
      const seg2Center = spanEnd - segLen * 0.5;
      const yCenter = floorY + wallHeight * 0.5;

      if (axis === 'Z') {
        addBoxMesh(0.45, wallHeight, segLen, fixedCoord, yCenter, seg1Center, gothicBrickMat);
        addBoxMesh(0.45, wallHeight, segLen, fixedCoord, yCenter, seg2Center, gothicBrickMat);
        addBoxMesh(0.55, 1.15, doorWidth, fixedCoord, floorY + wallHeight - 0.58, mid, darkTrimMat);
      } else {
        addBoxMesh(segLen, wallHeight, 0.45, seg1Center, yCenter, fixedCoord, gothicBrickMat);
        addBoxMesh(segLen, wallHeight, 0.45, seg2Center, yCenter, fixedCoord, gothicBrickMat);
        addBoxMesh(doorWidth, 1.15, 0.55, mid, floorY + wallHeight - 0.58, fixedCoord, darkTrimMat);
      }
    };

    addPartitionWallWithDoorway('Z', -6.5, -40.5, -22.5, -6.0);
    addPartitionWallWithDoorway('Z', 6.5, -40.5, -22.5, -6.0);
    addPartitionWallWithDoorway('X', -40.5, -23.5, -6.5, -6.0);
    addPartitionWallWithDoorway('X', -40.5, 6.5, 23.5, -6.0);

    addPartitionWallWithDoorway('Z', -7.0, -39.5, -22.5, 0.0);
    addPartitionWallWithDoorway('Z', 7.0, -39.5, -22.5, 0.0);
    addPartitionWallWithDoorway('X', -40.0, -23.5, -6.5, 0.0);
    addPartitionWallWithDoorway('X', -40.0, 6.5, 23.5, 0.0);
    addPartitionWallWithDoorway('Z', -7.0, -57.5, -40.5, 0.0);
    addPartitionWallWithDoorway('Z', 7.0, -57.5, -40.5, 0.0);

    addPartitionWallWithDoorway('Z', -8.0, -57.5, -22.5, 6.0);
    addPartitionWallWithDoorway('Z', 8.0, -57.5, -22.5, 6.0);

    for (let rz = -25; rz >= -55; rz -= 4.5) {
      const leftBeam = new THREE.Mesh(new THREE.BoxGeometry(19.5, 0.48, 0.48), woodRafterMat);
      leftBeam.position.set(-8.2, 16.5, rz);
      leftBeam.rotation.z = Math.atan2(8.5, 16.0);
      castleMansionGroup.add(leftBeam);

      const rightBeam = new THREE.Mesh(new THREE.BoxGeometry(19.5, 0.48, 0.48), woodRafterMat);
      rightBeam.position.set(8.2, 16.5, rz);
      rightBeam.rotation.z = -Math.atan2(8.5, 16.0);
      castleMansionGroup.add(rightBeam);
    }

    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 32),
      new THREE.MeshBasicMaterial({ color: '#ffae38', side: THREE.DoubleSide })
    );
    clockFace.position.set(0, 15.5, -22.45);
    castleMansionGroup.add(clockFace);

    const belfryBellGroup = new THREE.Group();
    belfryBellGroup.position.set(0, 18.2, -34.0);
    const bellMesh = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.95, 20), goldFrameMat);
    bellMesh.position.y = -0.95;
    belfryBellGroup.add(bellMesh);
    castleMansionGroup.add(belfryBellGroup);

    // --- RICH REALISTIC FURNITURE, HEARTHS & SET DRESSING ACROSS ALL 12 ROOMS ---
    addGothicFireplace(-15.0, 0.0, -57.2, 0);
    addGothicFireplace(15.0, 0.0, -57.2, 0);
    addGothicFireplace(16.5, 6.0, -57.2, 0);

    const emeraldGlowMat = new THREE.MeshBasicMaterial({ color: '#10b981' });
    for (const vz of [-28, -35]) {
      const vat = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.5, 18), emeraldGlowMat);
      vat.position.set(-18.5, -4.75, vz);
      castleMansionGroup.add(vat);
    }
    addBoxMesh(2.6, 0.95, 4.2, -13.5, -5.52, -31.5, woodRafterMat);

    for (const sx of [-14.0, 0.0, 14.0]) {
      addBoxMesh(2.8, 0.65, 4.6, sx, -5.65, -50.0, stoneWallMat);
      addBoxMesh(2.2, 0.85, 3.8, sx, -5.0, -50.0, darkTrimMat);
    }

    const ritualRing = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 2.9, 32),
      new THREE.MeshBasicMaterial({ color: '#ef4444', side: THREE.DoubleSide })
    );
    ritualRing.rotation.x = -Math.PI / 2;
    ritualRing.position.set(14.5, -5.95, -32.0);
    castleMansionGroup.add(ritualRing);
    addBoxMesh(2.4, 1.15, 1.3, 14.5, -5.42, -32.0, darkTrimMat);

    for (const bz of [-27.5, -33.5]) {
      addBoxMesh(1.2, 0.65, 2.8, -14.5, 0.32, bz, redCarpetMat);
    }

    for (let pIdx = -6; pIdx <= 6; pIdx++) {
      const pipeH = 4.8 - Math.abs(pIdx) * 0.3;
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, pipeH, 12),
        goldFrameMat
      );
      pipe.position.set(22.8, 1.0 + pipeH * 0.5, -34.5 + pIdx * 0.42);
      castleMansionGroup.add(pipe);
    }
    for (const pewZ of [-26.5, -29.5, -32.5]) {
      addBoxMesh(4.6, 0.55, 0.85, 14.5, 0.28, pewZ, woodRafterMat);
      addBoxMesh(4.6, 1.05, 0.18, 14.5, 0.52, pewZ + 0.35, woodRafterMat);
    }

    addBoxMesh(3.2, 0.95, 10.2, -15.0, 0.48, -48.5, woodRafterMat);
    addBoxMesh(1.4, 0.98, 9.8, -15.0, 0.5, -48.5, redCarpetMat);
    for (let cZ = -44.5; cZ >= -52.5; cZ -= 2.0) {
      for (const side of [-1, 1]) {
        const chX = -15.0 + side * 2.15;
        addBoxMesh(0.65, 0.55, 0.65, chX, 0.28, cZ, woodRafterMat);
        addBoxMesh(0.14, 1.35, 0.65, chX + side * 0.26, 0.68, cZ, redCarpetMat);
        const goblet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.07, 0.26, 10),
          goldFrameMat
        );
        goblet.position.set(-15.0 + side * 0.85, 1.12, cZ);
        castleMansionGroup.add(goblet);
      }
    }

    for (const shelfZ of [-43.5, -48.5, -53.5]) {
      addBoxMesh(0.95, 4.9, 3.8, 22.7, 2.45, shelfZ, woodRafterMat);
      for (let rowY = 0.9; rowY <= 4.1; rowY += 0.8) {
        addBoxMesh(0.75, 0.52, 3.3, 22.55, rowY, shelfZ, redCarpetMat);
      }
    }
    addBoxMesh(2.4, 0.88, 3.4, 14.5, 0.44, -48.5, woodRafterMat);

    const cauldron = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 0.98, 1.4, 20),
      darkTrimMat
    );
    cauldron.position.set(-15.0, 6.7, -40.0);
    castleMansionGroup.add(cauldron);
    const cauldronBroth = new THREE.Mesh(
      new THREE.CircleGeometry(1.22, 20),
      emeraldGlowMat
    );
    cauldronBroth.rotation.x = -Math.PI / 2;
    cauldronBroth.position.set(-15.0, 7.42, -40.0);
    castleMansionGroup.add(cauldronBroth);

    addBoxMesh(3.8, 0.88, 4.6, 16.5, 6.44, -45.0, redCarpetMat);
    for (const [px, pz] of [
      [14.7, -42.8],
      [18.3, -42.8],
      [14.7, -47.2],
      [18.3, -47.2],
    ]) {
      addBoxMesh(0.24, 3.9, 0.24, px, 7.95, pz, woodRafterMat);
    }
    addBoxMesh(4.0, 0.28, 4.8, 16.5, 9.9, -45.0, redCarpetMat);

    // ==========================================================================
    // 3. INTERACTIVE ROADSIDE BILLBOARDS (WITH WARM GROUND FLOODLIGHTS)
    //    & CASTLE WALL MOVIE PAINTINGS
    // ==========================================================================
    const selectableMovieMeshes: THREE.Object3D[] = [];
    const billboardPosterMeshes: Record<string, THREE.MeshStandardMaterial[]> = {};

    billboardNodes.forEach((node) => {
      const posterTex = textureLoader.load(node.posterUrl);
      posterTex.colorSpace = THREE.SRGBColorSpace;

      const isSelected = node.id === selectedBillboardId;
      const matsForNode: THREE.MeshStandardMaterial[] = [];

      const bbGroup = new THREE.Group();
      bbGroup.position.set(node.position[0], node.position[1], node.position[2]);
      bbGroup.rotation.y = node.rotationY;

      for (const px of [-2.4, 2.4]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.24, 6.4, 10),
          woodRafterMat
        );
        leg.position.set(px, 3.2, -0.25);
        bbGroup.add(leg);
      }

      const boardFrame = new THREE.Mesh(
        new THREE.BoxGeometry(6.9, 4.3, 0.34),
        woodRafterMat
      );
      boardFrame.position.set(0, 4.0, 0);
      bbGroup.add(boardFrame);

      const trimBorder = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, 3.75, 0.36),
        goldFrameMat
      );
      trimBorder.position.set(0, 4.0, 0.01);
      bbGroup.add(trimBorder);

      const posterMat = new THREE.MeshStandardMaterial({
        map: posterTex,
        emissiveMap: posterTex,
        emissive: new THREE.Color(isSelected ? '#ffae42' : '#e5d8c5'),
        emissiveIntensity: isSelected ? 1.05 : 0.68,
        roughness: 0.28,
        metalness: 0.08,
      });
      matsForNode.push(posterMat);

      const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 3.45), posterMat);
      posterMesh.position.set(0, 4.0, 0.21);
      posterMesh.userData = { movieNodeId: node.id, isCastlePainting: false };
      selectableMovieMeshes.push(posterMesh);
      bbGroup.add(posterMesh);

      for (const fx of [-1.8, 1.8]) {
        const floodBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.28, 0.38),
          darkTrimMat
        );
        floodBox.position.set(fx, 0.2, 1.45);
        bbGroup.add(floodBox);
        const floodLens = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#ffbe42' })
        );
        floodLens.position.set(fx, 0.34, 1.4);
        bbGroup.add(floodLens);
        const coneBeam = new THREE.Mesh(
          new THREE.ConeGeometry(1.65, 3.8, 14, 1, true),
          new THREE.MeshBasicMaterial({
            color: '#ffae42',
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        coneBeam.position.set(fx, 2.1, 0.78);
        coneBeam.rotation.x = -0.35;
        bbGroup.add(coneBeam);
      }

      scene.add(bbGroup);

      if (node.castlePaintingPos) {
        const [cpx, cpy, cpz] = node.castlePaintingPos;
        const paintGroup = new THREE.Group();
        paintGroup.position.set(cpx, cpy, cpz);
        paintGroup.rotation.y = node.castlePaintingRotY || 0;

        const outerFrame = new THREE.Mesh(
          new THREE.BoxGeometry(3.45, 2.4, 0.18),
          goldFrameMat
        );
        paintGroup.add(outerFrame);

        const innerMatte = new THREE.Mesh(
          new THREE.BoxGeometry(3.08, 2.04, 0.21),
          redCarpetMat
        );
        paintGroup.add(innerMatte);

        const paintingCanvasMat = new THREE.MeshStandardMaterial({
          map: posterTex,
          emissiveMap: posterTex,
          emissive: new THREE.Color(isSelected ? '#ffbe42' : '#f0e2c8'),
          emissiveIntensity: isSelected ? 1.1 : 0.75,
          roughness: 0.24,
          metalness: 0.06,
        });
        matsForNode.push(paintingCanvasMat);

        const paintingCanvas = new THREE.Mesh(
          new THREE.PlaneGeometry(2.85, 1.82),
          paintingCanvasMat
        );
        paintingCanvas.position.set(0, 0, 0.12);
        paintingCanvas.userData = {
          movieNodeId: node.id,
          isCastlePainting: true,
          roomId: node.castleRoomId,
        };
        selectableMovieMeshes.push(paintingCanvas);
        paintGroup.add(paintingCanvas);

        const lightBar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 1.7, 10),
          goldFrameMat
        );
        lightBar.rotation.z = Math.PI / 2;
        lightBar.position.set(0, 1.34, 0.28);
        paintGroup.add(lightBar);

        castleMansionGroup.add(paintGroup);
      }

      billboardPosterMeshes[node.id] = matsForNode;
    });

    const raycaster = new THREE.Raycaster();
    const mouseNdc = new THREE.Vector2();
    const handleCanvasPointerDown = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouseNdc, camera);
      const hits = raycaster.intersectObjects(selectableMovieMeshes, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const movieNodeId = hitObj.userData?.movieNodeId;
        if (movieNodeId && hits[0].distance < 28) {
          const foundNode = billboardNodes.find((b) => b.id === movieNodeId);
          if (foundNode) {
            setSelectedBillboardId(foundNode.id);
            halloweenAudio.playFlashlightClick();
            setCombatLogText(
              hitObj.userData?.isCastlePainting
                ? `🖼️ Selected Castle Wall Painting: "${foundNode.title}" (${foundNode.year}) — Click [Watch Full Movie] to screen!`
                : `🪧 Selected Roadside Billboard: "${foundNode.title}" (${foundNode.year}) — Click [Watch Full Movie] to screen!`
            );
            return;
          }
        }
      }
      triggerBatAttack();
    };
    renderer.domElement.addEventListener('mousedown', handleCanvasPointerDown);

    // ==========================================================================
    // 4. LOAD ALL CONSOLE-GRADE MIXAMO CHARACTER GLBS + WIND-BLOWN TREES/FERNS/PROPS
    // ==========================================================================
    const gltfLoader = new GLTFLoader();
    const loadedTemplates: Record<string, THREE.Object3D> = {};

    const attachLoadedRigToSlot = (slotGroup: THREE.Group, templateKey: string, scale = 1.0) => {
      const tpl = loadedTemplates[templateKey];
      if (!tpl) return false;
      while (slotGroup.children.length > 0) {
        slotGroup.remove(slotGroup.children[0]);
      }
      const cloned = SkeletonUtils.clone(tpl);
      cloned.scale.setScalar(scale);
      cloned.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          m.frustumCulled = false;
        }
      });
      slotGroup.add(cloned);
      return true;
    };

    const playerRoot = new THREE.Group();
    playerRoot.position.set(0, 0, 16.5);
    scene.add(playerRoot);

    const maleSurvivorGroup = new THREE.Group();
    maleSurvivorGroup.rotation.y = Math.PI;
    const femaleSurvivorGroup = new THREE.Group();
    femaleSurvivorGroup.rotation.y = Math.PI;
    femaleSurvivorGroup.visible = false;
    playerRoot.add(maleSurvivorGroup);
    playerRoot.add(femaleSurvivorGroup);

    const slashRibbonMat = new THREE.MeshBasicMaterial({
      color: '#ff4500',
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    });
    const slashRibbon = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 2.35, 24, 1, -Math.PI * 0.65, Math.PI * 1.3),
      slashRibbonMat
    );
    slashRibbon.rotation.x = -Math.PI / 2;
    slashRibbon.position.set(0, 1.18, -0.35);
    playerRoot.add(slashRibbon);

    const parryDomeMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.0,
      wireframe: true,
    });
    const parryDome = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 12), parryDomeMat);
    parryDome.position.set(0, 1.1, 0);
    playerRoot.add(parryDome);

    // ==========================================================================
    // 5. ROAMING MONSTERS (OUTSIDE AT CROSSROADS + INSIDE THE 12 CASTLE ROOMS!)
    // ==========================================================================
    interface MonsterAgent {
      id: number;
      type: 'ZOMBIE' | 'WEREWOLF' | 'GHOST';
      group: THREE.Group;
      rigSlot: THREE.Group;
      hpBarFill: THREE.Mesh;
      x: number;
      y: number;
      z: number;
      floorY: number;
      homeX: number;
      homeZ: number;
      vx: number;
      vz: number;
      hp: number;
      maxHp: number;
      speed: number;
      hitFlashTimer: number;
      respawnTimer: number;
      phaseOffset: number;
    }

    const monsters: MonsterAgent[] = [];
    const monsterConfigs: Array<{
      type: 'ZOMBIE' | 'WEREWOLF' | 'GHOST';
      homeX: number;
      homeZ: number;
      floorY: number;
      speed: number;
      maxHp: number;
    }> = [
      { type: 'ZOMBIE', homeX: -8.5, homeZ: -6.5, floorY: 0, speed: 2.3, maxHp: 60 },
      { type: 'WEREWOLF', homeX: 10.5, homeZ: -8.0, floorY: 0, speed: 3.6, maxHp: 90 },
      { type: 'GHOST', homeX: -11.0, homeZ: 10.5, floorY: 0, speed: 2.9, maxHp: 50 },
      { type: 'ZOMBIE', homeX: 9.5, homeZ: 12.0, floorY: 0, speed: 2.4, maxHp: 60 },
      { type: 'ZOMBIE', homeX: 0.0, homeZ: -49.0, floorY: -6.0, speed: 2.2, maxHp: 70 },
      { type: 'WEREWOLF', homeX: -15.0, homeZ: -48.0, floorY: 0.0, speed: 3.4, maxHp: 95 },
      { type: 'GHOST', homeX: 15.0, homeZ: -30.0, floorY: 0.0, speed: 2.8, maxHp: 55 },
      { type: 'GHOST', homeX: 0.0, homeZ: -36.0, floorY: 12.0, speed: 3.0, maxHp: 65 },
    ];

    monsterConfigs.forEach((cfg, idx) => {
      const mGroup = new THREE.Group();
      const rigSlot = new THREE.Group();
      mGroup.add(rigSlot);

      const hpBg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 0.13),
        new THREE.MeshBasicMaterial({ color: '#1f122b', side: THREE.DoubleSide })
      );
      hpBg.position.y = 2.55;
      mGroup.add(hpBg);

      const hpFill = new THREE.Mesh(
        new THREE.PlaneGeometry(1.04, 0.09),
        new THREE.MeshBasicMaterial({
          color:
            cfg.type === 'ZOMBIE'
              ? '#84cc16'
              : cfg.type === 'WEREWOLF'
              ? '#f97316'
              : '#38bdf8',
          side: THREE.DoubleSide,
        })
      );
      hpFill.position.set(0, 2.55, 0.01);
      mGroup.add(hpFill);

      mGroup.position.set(cfg.homeX, cfg.floorY, cfg.homeZ);
      scene.add(mGroup);

      monsters.push({
        id: idx,
        type: cfg.type,
        group: mGroup,
        rigSlot,
        hpBarFill: hpFill,
        x: cfg.homeX,
        y: cfg.floorY,
        z: cfg.homeZ,
        floorY: cfg.floorY,
        homeX: cfg.homeX,
        homeZ: cfg.homeZ,
        vx: 0,
        vz: 0,
        hp: cfg.maxHp,
        maxHp: cfg.maxHp,
        speed: cfg.speed,
        hitFlashTimer: 0,
        respawnTimer: 0,
        phaseOffset: idx * 1.5,
      });
    });

    // ==========================================================================
    // 6. SPARSE MOVIE CHARACTER 3D RIG ACTORS & PUMPKIN PATCH ARMORED TANK
    // ==========================================================================
    const encounterStageGroup = new THREE.Group();
    scene.add(encounterStageGroup);

    const tankGroup = new THREE.Group();
    tankGroup.visible = false;
    encounterStageGroup.add(tankGroup);

    const ppBladesGroup = new THREE.Group();
    ppBladesGroup.visible = false;
    encounterStageGroup.add(ppBladesGroup);

    const miriamFlightGroup = new THREE.Group();
    miriamFlightGroup.visible = false;
    encounterStageGroup.add(miriamFlightGroup);

    const stitchRoadGroup = new THREE.Group();
    stitchRoadGroup.visible = false;
    encounterStageGroup.add(stitchRoadGroup);

    const katrinaCraneGroup = new THREE.Group();
    katrinaCraneGroup.visible = false;
    encounterStageGroup.add(katrinaCraneGroup);

    const katrinaSubSlot = new THREE.Group();
    katrinaSubSlot.position.set(-1.3, 0, 0);
    const craneSubSlot = new THREE.Group();
    craneSubSlot.position.set(1.3, 0, 0);
    katrinaCraneGroup.add(katrinaSubSlot);
    katrinaCraneGroup.add(craneSubSlot);

    const lilBooDriftGroup = new THREE.Group();
    lilBooDriftGroup.visible = false;
    encounterStageGroup.add(lilBooDriftGroup);

    let loadedBundleCounter = 0;
    const markBundleReady = () => {
      loadedBundleCounter += 1;
      setGlbLoadedCount(loadedBundleCounter);
    };

    gltfLoader
      .loadAsync('/models/halloween/survivor_combat_rigs.glb')
      .then((gltf) => {
        ['MaleSurvivor_Rig', 'FemaleSurvivor_Rig'].forEach((name) => {
          const obj = gltf.scene.getObjectByName(name);
          if (obj) {
            obj.position.set(0, 0, 0);
            loadedTemplates[name] = obj;
          }
        });
        attachLoadedRigToSlot(maleSurvivorGroup, 'MaleSurvivor_Rig', 1.05);
        attachLoadedRigToSlot(femaleSurvivorGroup, 'FemaleSurvivor_Rig', 1.05);
        attachLoadedRigToSlot(katrinaSubSlot, 'FemaleSurvivor_Rig', 1.05);
        markBundleReady();
      })
      .catch((err) => console.warn('Survivor GLB load error:', err));

    gltfLoader
      .loadAsync('/models/halloween/monsters_enemy_rigs.glb')
      .then((gltf) => {
        ['Zombie_Rig', 'Werewolf_Rig', 'Ghost_Rig'].forEach((name) => {
          const obj = gltf.scene.getObjectByName(name);
          if (obj) {
            obj.position.set(0, 0, 0);
            loadedTemplates[name] = obj;
          }
        });
        monsters.forEach((m) => {
          const key =
            m.type === 'ZOMBIE'
              ? 'Zombie_Rig'
              : m.type === 'WEREWOLF'
              ? 'Werewolf_Rig'
              : 'Ghost_Rig';
          attachLoadedRigToSlot(m.rigSlot, key, 1.08);
        });
        attachLoadedRigToSlot(lilBooDriftGroup, 'Ghost_Rig', 0.92);
        markBundleReady();
      })
      .catch((err) => console.warn('Monsters GLB load error:', err));

    gltfLoader
      .loadAsync('/models/halloween/pumpkin_patch_cast_rigs.glb')
      .then((gltf) => {
        ['PumpkinPatch_Rig', 'Miriam_Rig', 'Stitch_Rig', 'RoboBones_Rig'].forEach(
          (name) => {
            const obj = gltf.scene.getObjectByName(name);
            if (obj) {
              obj.position.set(0, 0, 0);
              loadedTemplates[name] = obj;
            }
          }
        );
        attachLoadedRigToSlot(ppBladesGroup, 'PumpkinPatch_Rig', 1.12);
        attachLoadedRigToSlot(miriamFlightGroup, 'Miriam_Rig', 1.12);
        attachLoadedRigToSlot(stitchRoadGroup, 'Stitch_Rig', 1.10);
        attachLoadedRigToSlot(craneSubSlot, 'RoboBones_Rig', 1.10);
        markBundleReady();
      })
      .catch((err) => console.warn('Cast GLB load error:', err));

    gltfLoader
      .loadAsync('/models/halloween/haunted_castle_fortress.glb')
      .then((gltf) => {
        const tankObj = gltf.scene.getObjectByName('PumpkinPatch_Tank');
        if (tankObj) {
          tankObj.position.set(0, 0, 0);
          loadedTemplates['PumpkinPatch_Tank'] = tankObj;
          attachLoadedRigToSlot(tankGroup, 'PumpkinPatch_Tank', 1.15);
        }
        const castleFortressObj = gltf.scene.getObjectByName('GothicCastle_Fortress');
        if (castleFortressObj) {
          castleFortressObj.position.set(0, 0, -40);
          castleFortressObj.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
            }
          });
          scene.add(castleFortressObj);
        }
        markBundleReady();
      })
      .catch((err) => console.warn('Tank/Castle GLB load error:', err));

    // ==========================================================================
    // 6B. LOAD REAL 3D WIND-BLOWN TREES (`quiver_tree_01.glb`), FERNS (`fern_02.glb`),
    //     STREET LANTERNS (`Lantern.glb`), GRIMOIRES (`book.glb`) & STATUES (`monuments.glb`)
    // ==========================================================================
    gltfLoader
      .loadAsync('/models/flora/quiver_tree_01.glb')
      .then((gltf) => {
        const treeTpl = gltf.scene;
        treeTpl.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            const m = c as THREE.Mesh;
            m.castShadow = true;
            m.receiveShadow = true;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => {
              if (mat) applyWindSwayShader(mat, 'TREE_CANOPY');
            });
          }
        });
        const treeCoords: Array<[number, number, number]> = [
          [-16, 18, 2.2],
          [16, 18, 2.4],
          [-22, 8, 2.6],
          [22, 8, 2.3],
          [-19, -9, 2.5],
          [19, -9, 2.5],
          [-14, -18, 2.8],
          [14, -18, 2.8],
          [-28, -19, 3.1],
          [28, -19, 3.0],
          [-34, -30, 3.2],
          [34, -30, 3.2],
          [-32, -48, 3.4],
          [32, -48, 3.4],
        ];
        treeCoords.forEach(([tx, tz, sc], idx) => {
          const tClone = treeTpl.clone(true);
          tClone.position.set(tx, 0, tz);
          tClone.rotation.y = idx * 1.15;
          tClone.scale.setScalar(sc);
          scene.add(tClone);
        });
      })
      .catch(() => {});

    gltfLoader
      .loadAsync('/models/flora/fern_02.glb')
      .then((gltf) => {
        const fernTpl = gltf.scene;
        fernTpl.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            const m = c as THREE.Mesh;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => {
              if (mat) applyWindSwayShader(mat, 'FERN_PLANT');
            });
          }
        });
        for (let fIdx = 0; fIdx < 28; fIdx++) {
          const side = fIdx % 2 === 0 ? -1 : 1;
          const fx = side * (6.8 + (fIdx % 6) * 3.2);
          const fz = 26 - fIdx * 1.8;
          if (Math.abs(fz) < 5.2) continue;
          const fClone = fernTpl.clone(true);
          fClone.position.set(fx, 0, fz);
          fClone.rotation.y = fIdx * 0.9;
          fClone.scale.setScalar(1.4 + (fIdx % 3) * 0.35);
          scene.add(fClone);
        }
      })
      .catch(() => {});

    gltfLoader
      .loadAsync('/models/halloween/base_rigs/Lantern.glb')
      .then((gltf) => {
        const lanternTpl = gltf.scene;
        const lanternCoords: Array<[number, number]> = [
          [-5.2, 16.0],
          [5.2, 16.0],
          [-5.2, -7.0],
          [5.2, -7.0],
          [-5.2, -17.5],
          [5.2, -17.5],
        ];
        lanternCoords.forEach(([lx, lz]) => {
          const lClone = lanternTpl.clone(true);
          lClone.position.set(lx, 0, lz);
          lClone.scale.setScalar(0.18);
          scene.add(lClone);
        });
      })
      .catch(() => {});

    gltfLoader
      .loadAsync('/models/mascots/props/book.glb')
      .then((gltf) => {
        const bookTpl = gltf.scene;
        const bookSpots: Array<[number, number, number]> = [
          [14.5, 0.95, -48.5],
          [-13.5, -4.95, -31.5],
          [14.5, -4.8, -32.0],
        ];
        bookSpots.forEach(([bx, by, bz], idx) => {
          const bClone = bookTpl.clone(true);
          bClone.position.set(bx, by, bz);
          bClone.scale.setScalar(0.85);
          bClone.rotation.y = idx * 1.2;
          castleMansionGroup.add(bClone);
        });
      })
      .catch(() => {});

"""

s_idx = text.index(start_marker)
e_idx = text.index(end_marker)
text = text[:s_idx] + replacement_section + text[e_idx:]

# 2. Update `animate` loop to drive `windTimeUniform.value = t`, update Council Render Lens exposure/bloom,
#    and render via `composer.render()`
old_render_block = """      // Swing Creepy Attic Belfry Bell
      belfryBellGroup.rotation.z = Math.sin(t * 1.6) * 0.28;"""

new_render_block = """      // Advance GPU Wind Shader & Dimensional Rift Aurora Time Uniform
      windTimeUniform.value = t;
      emberParticles.rotation.y = t * 0.03;

      // Sync active Art & Game Production Council Render Lens (Exposure + UnrealBloom + IBL)
      const activeLens =
        CASTLE_COUNCIL_LENSES.find((l) => l.id === councilLensRef.current) ||
        CASTLE_COUNCIL_LENSES[0];
      renderer.toneMappingExposure = activeLens.exposure;
      bloomPass.strength = activeLens.bloomStrength;
      bloomPass.radius = activeLens.bloomRadius;
      bloomPass.threshold = activeLens.bloomThreshold;
      (scene as any).environmentIntensity = activeLens.envIntensity;

      // Swing Creepy Attic Belfry Bell
      belfryBellGroup.rotation.z = Math.sin(t * 1.6) * 0.28;"""

assert old_render_block in text, "old_render_block not found!"
text = text.replace(old_render_block, new_render_block, 1)

old_final_render = """      renderer.render(scene, camera);
    };

    reqId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };"""

new_final_render = """      composer.render();
    };

    reqId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };"""

assert old_final_render in text, "old_final_render not found!"
text = text.replace(old_final_render, new_final_render, 1)

# 3. Add Art & Game Production Council Render Lens Selector to the Top Bar
old_top_bar_controls = """          {/* Playable Survivor Gender Switch */}"""
new_top_bar_controls = """          {/* Art & Game Production Council Render Lens Selector */}
          <div className="flex items-center bg-zinc-950/90 border border-amber-500/40 rounded-lg p-0.5">
            {CASTLE_COUNCIL_LENSES.map((lens) => (
              <button
                key={lens.id}
                onClick={() => setCouncilLens(lens.id)}
                title={lens.councilLead}
                className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                  councilLens === lens.id
                    ? 'bg-amber-500 text-black shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                🎨 {lens.label.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Playable Survivor Gender Switch */}"""

assert old_top_bar_controls in text, "old_top_bar_controls not found!"
text = text.replace(old_top_bar_controls, new_top_bar_controls, 1)

with open(FILE_PATH, "w", encoding="utf-8", newline="\n") as f:
    f.write(text)

print("Successfully upgraded HauntedCastleExhibition.tsx!")
