"""
Upgrades `components/taleo/HauntedCastleExhibition.tsx` with:
1. Rest-Pose-Preserving Call of Duty / Metal Gear Solid V Multi-Joint Skeletal Locomotion & Combat Animator
   (fixes the inverted legs/arms bug by multiplying delta quaternions onto `bone.userData.restQuat`).
2. Default Playable Hero = Pumpkin Patch (Melvin Lester) with 3D Carved Jack-o'-Lantern Head, Obsidian Duster Coat
   & Dual Plasma Blades, plus 1-click switching to Male Grindhouse Survivor or Agent Katrina (Female Survivor).
3. Long Atmospheric Road Approach (`z = +54` to `z = -12`), Deep Subterranean Water Moat (`z = -12` to `z = -36`),
   Monumental Arched Gothic Stone & Oak Drawbridge with Parapets, Chains, Braziers & Carved 3D Jack-o'-Lanterns.
4. Coherent Gothic Cathedral & Vampire Fortress Architecture (`z = -36` to `z = -72`) with Flying Buttresses,
   Octagonal Keep Towers, Pointed Gothic Archways, Open Stairwell Cutouts, and 3 Deterministic Walkable Ramped
   Grand Stone Staircases (`West Flight` = Ground <-> 2nd Floor, `Center Flight` = Ground <-> Crypt,
   `East Flight` = 2nd Floor <-> Creepy Attic).
5. Full 2D Circle-vs-AABB Wall, Pillar, Parapet & Furniture Sliding Collision Engine.
"""

from pathlib import Path

TARGET = Path("components/taleo/HauntedCastleExhibition.tsx")
text = TARGET.read_text(encoding="utf-8")

# ---------------------------------------------------------------------------
# 1. SHIFT ALL 12 CASTLE ROOMS NORTH BY -14.0m (`z in [-36 .. -72]`) SO THE
#    24-METER MOAT & GOTHIC STONE BRIDGE (`z in [-12 .. -36]`) SIT IN FRONT!
# ---------------------------------------------------------------------------
old_rooms_blockStart = "export const CASTLE_ROOMS: CastleRoomDefinition[] = ["
old_rooms_blockEnd = "export const SPARSE_ENCOUNTERS: SparseCharacterEncounter[] = ["
assert old_rooms_blockStart in text and old_rooms_blockEnd in text, "Could not locate CASTLE_ROOMS block"

new_rooms_block = """export const CASTLE_ROOMS: CastleRoomDefinition[] = [
  // LEVEL 0: SUBTERRANEAN BASEMENT CRYPT (Y = -6.0m — Reached via Center Crypt Staircase!)
  {
    id: 'crypt_alchemy',
    roomNumber: 1,
    name: 'Torture & Alchemy Crypt',
    floorIndex: 0,
    floorLabel: 'Basement Crypt (-6m)',
    elevationY: -6.0,
    musicZone: 'BASEMENT_CRYPT',
    surface: 'STONE',
    center: [-15.0, -6.0, -46.0],
    bounds: { minX: -23.5, maxX: -6.8, minZ: -54.5, maxZ: -36.5 },
    paintingPos: [-22.3, -3.3, -46.0],
    paintingRotY: Math.PI / 2,
    subtitle: 'Glowing emerald alchemical vats, iron cages & dungeon stone vaults',
    accentColor: '#10b981',
  },
  {
    id: 'crypt_catacombs',
    roomNumber: 2,
    name: 'Flooded Catacombs & Bone Vault',
    floorIndex: 0,
    floorLabel: 'Basement Crypt (-6m)',
    elevationY: -6.0,
    musicZone: 'BASEMENT_CRYPT',
    surface: 'CRYPT_WATER',
    center: [0.0, -6.0, -66.5],
    bounds: { minX: -23.5, maxX: 23.5, minZ: -71.5, maxZ: -55.0 },
    paintingPos: [0.0, -3.3, -70.3],
    paintingRotY: 0,
    subtitle: 'Ankle-deep subterranean black water, skull ossuary alcoves & catacomb arches',
    accentColor: '#06b6d4',
  },
  {
    id: 'crypt_ritual',
    roomNumber: 3,
    name: 'Sacrificial Blood Ritual Chamber',
    floorIndex: 0,
    floorLabel: 'Basement Crypt (-6m)',
    elevationY: -6.0,
    musicZone: 'BASEMENT_CRYPT',
    surface: 'STONE',
    center: [15.0, -6.0, -46.0],
    bounds: { minX: 6.8, maxX: 23.5, minZ: -54.5, maxZ: -36.5 },
    paintingPos: [22.3, -3.3, -46.0],
    paintingRotY: -Math.PI / 2,
    subtitle: 'Glowing crimson ritual seal, obsidian monoliths & ancient sarcophagi',
    accentColor: '#ef4444',
  },

  // LEVEL 1: GROUND FLOOR MANSION HALLS (Y = 0.0m — Enter across Moat Drawbridge at Z = -36!)
  {
    id: 'foyer_grand',
    roomNumber: 4,
    name: 'Grand Gothic Entrance Foyer & Nave',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [0.0, 0.0, -41.5],
    bounds: { minX: -6.8, maxX: 6.8, minZ: -47.0, maxZ: -36.0 },
    paintingPos: [-6.3, 2.7, -41.5],
    paintingRotY: Math.PI / 2,
    subtitle: 'Open iron portcullis entrance from Drawbridge, crimson carpet & Grand Staircase arches',
    accentColor: '#f97316',
  },
  {
    id: 'gallery_portraits',
    roomNumber: 5,
    name: 'Cursed Portrait Gallery (West Wing)',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [-15.0, 0.0, -44.0],
    bounds: { minX: -23.5, maxX: -7.0, minZ: -53.5, maxZ: -36.5 },
    paintingPos: [-22.3, 2.7, -43.5],
    paintingRotY: Math.PI / 2,
    subtitle: 'Ornate gold-framed interactive movie paintings & velvet exhibition ropes',
    accentColor: '#f59e0b',
  },
  {
    id: 'chapel_organ',
    roomNumber: 6,
    name: 'Haunted Pipe-Organ Chapel (East Wing)',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [15.0, 0.0, -44.0],
    bounds: { minX: 7.0, maxX: 23.5, minZ: -53.5, maxZ: -36.5 },
    paintingPos: [22.3, 2.7, -43.5],
    paintingRotY: -Math.PI / 2,
    subtitle: 'Towering brass cathedral pipe organ, dark oak pews & crimson rose window',
    accentColor: '#a855f7',
  },
  {
    id: 'banquet_blood',
    roomNumber: 7,
    name: 'Blood Banquet Dining Hall (NW Wing)',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [-15.0, 0.0, -63.0],
    bounds: { minX: -23.5, maxX: -7.0, minZ: -71.5, maxZ: -54.5 },
    paintingPos: [-15.0, 2.7, -70.3],
    paintingRotY: 0,
    subtitle: 'Long Gothic feast table, silver candelabras, roaring hearth & vampire goblets',
    accentColor: '#ec4899',
  },
  {
    id: 'library_occult',
    roomNumber: 8,
    name: 'Forbidden Occult Library (NE Wing)',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [15.0, 0.0, -63.0],
    bounds: { minX: 7.0, maxX: 23.5, minZ: -71.5, maxZ: -54.5 },
    paintingPos: [15.0, 2.7, -70.3],
    paintingRotY: 0,
    subtitle: 'Floor-to-ceiling grimoire bookshelves, levitating tomes & reading lectern',
    accentColor: '#38bdf8',
  },

  // LEVEL 2: UPPER NOBLE FLOOR (Y = +6.0m — Reached via West Grand Staircase!)
  {
    id: 'rotunda_spiral',
    roomNumber: 9,
    name: 'Grand Imperial Staircase & North Gallery',
    floorIndex: 2,
    floorLabel: 'Upper Noble Floor (+6m)',
    elevationY: 6.0,
    musicZone: 'UPPER_NOBLE',
    surface: 'SPIRAL_STAIR',
    center: [0.0, 6.0, -66.5],
    bounds: { minX: -8.0, maxX: 8.0, minZ: -71.5, maxZ: -36.5 },
    paintingPos: [0.0, 8.7, -70.3],
    paintingRotY: 0,
    subtitle: 'Grand Gothic Mezzanine Gallery overlooking the Foyer & connecting to Belfry Attic Stairs',
    accentColor: '#eab308',
  },
  {
    id: 'miriam_lab',
    roomNumber: 10,
    name: "Wicked Witch Miriam's Coven Lab",
    floorIndex: 2,
    floorLabel: 'Upper Noble Floor (+6m)',
    elevationY: 6.0,
    musicZone: 'UPPER_NOBLE',
    surface: 'STONE',
    center: [-15.0, 6.0, -54.0],
    bounds: { minX: -23.5, maxX: -7.5, minZ: -71.5, maxZ: -36.5 },
    paintingPos: [-22.3, 8.7, -54.0],
    paintingRotY: Math.PI / 2,
    subtitle: 'Bubbling emerald witch cauldron, celestial astrolabe & spell apothecary',
    accentColor: '#22c55e',
  },
  {
    id: 'vampire_chamber',
    roomNumber: 11,
    name: 'Master Vampire Bedchamber & Balcony',
    floorIndex: 2,
    floorLabel: 'Upper Noble Floor (+6m)',
    elevationY: 6.0,
    musicZone: 'UPPER_NOBLE',
    surface: 'STONE',
    center: [15.0, 6.0, -54.0],
    bounds: { minX: 7.5, maxX: 23.5, minZ: -71.5, maxZ: -36.5 },
    paintingPos: [22.3, 8.7, -54.0],
    paintingRotY: -Math.PI / 2,
    subtitle: 'Four-poster crimson velvet canopy bed, ornate mirror & Moat overlook',
    accentColor: '#f43f5e',
  },

  // LEVEL 3: CREEPY COBWEBBED ATTIC & CLOCKTOWER BELFRY (Y = +12.0m — Reached via East Belfry Staircase!)
  {
    id: 'attic_belfry',
    roomNumber: 12,
    name: 'Creepy Cobwebbed Attic & Clocktower Belfry',
    floorIndex: 3,
    floorLabel: 'Creepy Attic (+12m)',
    elevationY: 12.0,
    musicZone: 'CREEPY_ATTIC',
    surface: 'WOOD_ATTIC',
    center: [0.0, 12.0, -42.5],
    bounds: { minX: -19.0, maxX: 19.0, minZ: -71.0, maxZ: -36.5 },
    paintingPos: [-15.2, 14.5, -54.0],
    paintingRotY: Math.PI / 2,
    subtitle: 'Pitched timber rafters, backlit Gothic clockface, antique mannequins & swinging bell',
    accentColor: '#c084fc',
  },
];

"""

idx_r0 = text.index(old_rooms_blockStart)
idx_r1 = text.index(old_rooms_blockEnd)
text = text[:idx_r0] + new_rooms_block + text[idx_r1:]

# ---------------------------------------------------------------------------
# 2. SPACE ROADSIDE BILLBOARDS ALONG THE 70-METER PUMPKIN PATCH HIGHWAY
#    (`z = +48` DOWN TO `z = -8`) AND EAST/WEST CROSSROADS (`z = +20`)
# ---------------------------------------------------------------------------
old_bb_start = "      position: [-8.5, 0, -17.5],"
old_bb_end = "        const paintingPos: [number, number, number] =\n          idx === 11 ? [15.2, 14.5, -40.0] : room.paintingPos;"
assert old_bb_start in text and old_bb_end in text, "Could not locate billboard placements block"

new_bb_placements = """      position: [-8.2, 0, -5.5],
      rotationY: 0.28,
      castleRoomId: foyerRoom.id,
      castlePaintingPos: foyerRoom.paintingPos,
      castlePaintingRotY: foyerRoom.paintingRotY,
      isHeroPumpkinPatch: true,
      storyIntel: ppIntel,
    };

    const placements: Array<{
      compass: BillboardMovieNode['compass'];
      roadZone: BillboardMovieNode['roadZone'];
      directionLabel: string;
      distanceMiles: string;
      position: [number, number, number];
      rotationY: number;
      roomIdx: number;
    }> = [
      {
        compass: 'NORTH',
        roadZone: 'CASTLE_APPROACH',
        directionLabel: 'MOAT DRAWBRIDGE APPROACH',
        distanceMiles: '0.2 MI N',
        position: [8.4, 0, -5.5],
        rotationY: -0.28,
        roomIdx: 4, // Room 5: Cursed Portrait Gallery
      },
      {
        compass: 'NORTH',
        roadZone: 'CASTLE_APPROACH',
        directionLabel: 'CASTLE APPROACH RD W',
        distanceMiles: '0.4 MI N',
        position: [-9.2, 0, 7.5],
        rotationY: 0.32,
        roomIdx: 5, // Room 6: Haunted Pipe-Organ Chapel
      },
      {
        compass: 'NORTH',
        roadZone: 'CASTLE_APPROACH',
        directionLabel: 'CASTLE APPROACH RD E',
        distanceMiles: '0.5 MI N',
        position: [9.2, 0, 7.5],
        rotationY: -0.32,
        roomIdx: 6, // Room 7: Blood Banquet Dining Hall
      },
      {
        compass: 'EAST',
        roadZone: 'EAST_HIGHWAY',
        directionLabel: 'PHANTASM HIGHWAY E',
        distanceMiles: '1.1 MI E',
        position: [18.0, 0, 12.5],
        rotationY: -1.18,
        roomIdx: 7, // Room 8: Forbidden Occult Library
      },
      {
        compass: 'EAST',
        roadZone: 'EAST_HIGHWAY',
        directionLabel: 'CARNIVAL PAVILION PKWY',
        distanceMiles: '1.6 MI E',
        position: [28.0, 0, 27.5],
        rotationY: -1.88,
        roomIdx: 0, // Room 1: Torture & Alchemy Crypt
      },
      {
        compass: 'EAST',
        roadZone: 'EAST_HIGHWAY',
        directionLabel: 'TRANS-SIBERIAN RAILS',
        distanceMiles: '2.2 MI E',
        position: [38.0, 0, 12.5],
        rotationY: -1.28,
        roomIdx: 1, // Room 2: Flooded Catacombs
      },
      {
        compass: 'WEST',
        roadZone: 'WEST_GOTHIC_ROAD',
        directionLabel: 'NOSFERATU GOTHIC LN',
        distanceMiles: '1.2 MI W',
        position: [-18.0, 0, 12.5],
        rotationY: 1.18,
        roomIdx: 2, // Room 3: Sacrificial Ritual Chamber
      },
      {
        compass: 'WEST',
        roadZone: 'WEST_GOTHIC_ROAD',
        directionLabel: 'CALIGARI ASYLUM RD',
        distanceMiles: '1.8 MI W',
        position: [-28.0, 0, 27.5],
        rotationY: 1.88,
        roomIdx: 8, // Room 9: Grand Imperial Staircase
      },
      {
        compass: 'WEST',
        roadZone: 'WEST_GOTHIC_ROAD',
        directionLabel: 'HAXAN WITCH WOODS',
        distanceMiles: '2.4 MI W',
        position: [-38.0, 0, 12.5],
        rotationY: 1.28,
        roomIdx: 9, // Room 10: Wicked Witch Miriam's Coven Lab
      },
      {
        compass: 'SOUTH',
        roadZone: 'SOUTH_TURNPIKE',
        distanceMiles: '0.8 MI S',
        directionLabel: 'PUMPKIN PATCH TURNPIKE W',
        position: [-8.5, 0, 32.0],
        rotationY: 0.30,
        roomIdx: 10, // Room 11: Master Vampire Bedchamber
      },
      {
        compass: 'SOUTH',
        roadZone: 'SOUTH_TURNPIKE',
        directionLabel: 'PUMPKIN PATCH TURNPIKE E',
        distanceMiles: '1.1 MI S',
        position: [8.5, 0, 36.0],
        rotationY: -0.30,
        roomIdx: 11, // Room 12: Creepy Cobwebbed Attic (West Wall)
      },
      {
        compass: 'SOUTH',
        roadZone: 'SOUTH_TURNPIKE',
        directionLabel: 'DISTRICT 13 OUTPOST RD',
        distanceMiles: '1.5 MI S',
        position: [-8.8, 0, 46.0],
        rotationY: 0.25,
        roomIdx: 11, // Room 12: Creepy Cobwebbed Attic (East Wall)
      },
    ];

    const filmNodes: BillboardMovieNode[] = CURATED_HALLOWEEN_FILMS.slice(0, 12).map(
      (film, idx) => {
        const p = placements[idx % placements.length];
        const room = CASTLE_ROOMS[p.roomIdx] || CASTLE_ROOMS[0];
        const intel = getHalloweenStoryIntelBundle(film.identifier);
        // For the 12th film sharing the Attic, place its painting on the opposite East gable wall
        const paintingPos: [number, number, number] =
          idx === 11 ? [15.2, 14.5, -54.0] : room.paintingPos;"""

idx_b0 = text.index(old_bb_start)
idx_b1 = text.index(old_bb_end) + len(old_bb_end)
text = text[:idx_b0] + new_bb_placements + text[idx_b1:]

# ---------------------------------------------------------------------------
# 3. ADD PLAYABLE HERO SELECTOR ('PUMPKIN_PATCH' | 'MALE' | 'FEMALE') AND
#    SPAWN PLAYER OUT ON THE SOUTH PUMPKIN PATCH HIGHWAY (`z = 52.0`)
# ---------------------------------------------------------------------------
text = text.replace(
    "const [survivorGender, setSurvivorGender] = useState<'MALE' | 'FEMALE'>('MALE');",
    "const [survivorGender, setSurvivorGender] = useState<'PUMPKIN_PATCH' | 'MALE' | 'FEMALE'>('PUMPKIN_PATCH');"
)
text = text.replace(
    "const survivorGenderRef = useRef<'MALE' | 'FEMALE'>(survivorGender);",
    "const survivorGenderRef = useRef<'PUMPKIN_PATCH' | 'MALE' | 'FEMALE'>(survivorGender);"
)
text = text.replace(
    "const cameraTargetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 4.4, 22.5));",
    "const cameraTargetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 4.4, 58.5));"
)
text = text.replace(
    "z: 16.5, // Start out on the Lonesome Crossroads Road facing North toward the Billboards & Castle!",
    "z: 52.0, // Start way out on the South Pumpkin Patch Highway facing North toward Crossroads, Moat Bridge & Castle!"
)
text = text.replace(
    "p.z = 16.5;\n      p.vx = 0;",
    "p.z = 52.0;\n      p.vx = 0;"
)
text = text.replace(
    "camera.position.set(0, 4.4, 22.5);",
    "camera.position.set(0, 4.4, 58.5);"
)

# ---------------------------------------------------------------------------
# 4. REPLACE SECTION 1 (TERRAIN/ROADS) THROUGH SECTION 10 (ANIMATION/PHYSICS LOOP)
#    WITH THE FULL MOAT & GOTHIC STONE DRAWBRIDGE, GOTHIC CATHEDRAL ARCHITECTURE,
#    3 WALKABLE STAIRCASE RAMPS, AABB COLLIDER ENGINE, AND CALL OF DUTY / MGS V
#    REST-POSE-PRESERVING SKELETAL ANIMATOR!
# ---------------------------------------------------------------------------
sec1_marker = "    // ==========================================================================\n    // 1. EXTERIOR TERRAIN, LONESOME CROSSROADS ROAD & WIND-BLOWN TREES/PLANTS"
end_marker = "      // --- D. CAMERA FOLLOW (3RD-PERSON SURVIVOR VIEW vs WAYPOINT VIEW) ---"
assert sec1_marker in text and end_marker in text, "Could not locate section 1 to D markers"

new_world_and_engine = """    // ==========================================================================
    // 1. EXTERIOR TERRAIN, PUMPKIN PATCH HIGHWAY (`Z = +68` TO `-12`),
    //    DEEP SUBTERRANEAN WATER MOAT (`Z = -12` TO `-36`), ARCHED GOTHIC STONE
    //    DRAWBRIDGE, AND JACK-O'-LANTERNS!
    // ==========================================================================
    interface AABBCollider {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      minY: number;
      maxY: number;
    }
    const worldColliders: AABBCollider[] = [];
    const registerBoxCollider = (
      cx: number,
      cy: number,
      cz: number,
      w: number,
      h: number,
      d: number
    ) => {
      worldColliders.push({
        minX: cx - w * 0.5,
        maxX: cx + w * 0.5,
        minZ: cz - d * 0.5,
        maxZ: cz + d * 0.5,
        minY: cy - h * 0.5,
        maxY: cy + h * 0.5,
      });
    };

    const groundMat = new THREE.MeshStandardMaterial({
      map: forestGroundPbr.map,
      normalMap: forestGroundPbr.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: forestGroundPbr.roughnessMap,
      color: '#5c4e6b',
      roughness: 0.86,
      metalness: 0.05,
    });

    // South Mainland Terrain (`Z = -12` to `Z = +90`)
    const southGround = new THREE.Mesh(new THREE.PlaneGeometry(240, 102), groundMat);
    southGround.rotation.x = -Math.PI / 2;
    southGround.position.set(0, -0.02, 39.0);
    southGround.receiveShadow = true;
    scene.add(southGround);

    // Deep Subterranean Castle Moat (`Z = -12` to `Z = -36`, 24 meters wide!)
    const moatBed = new THREE.Mesh(new THREE.PlaneGeometry(240, 26), stoneWallMat);
    moatBed.rotation.x = -Math.PI / 2;
    moatBed.position.set(0, -3.6, -24.0);
    moatBed.receiveShadow = true;
    scene.add(moatBed);

    // Animated Dark Reflective Moat Water Surface (`Y = -1.85m`)
    const moatWaterMat = new THREE.MeshStandardMaterial({
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      color: '#0a2f3d',
      roughness: 0.06,
      metalness: 0.92,
      emissive: new THREE.Color('#0c4a5e'),
      emissiveIntensity: 0.42,
    });
    applyWindSwayShader(moatWaterMat, 'FERN_PLANT');
    const moatWater = new THREE.Mesh(new THREE.PlaneGeometry(240, 24.4, 48, 16), moatWaterMat);
    moatWater.rotation.x = -Math.PI / 2;
    moatWater.position.set(0, -1.85, -24.0);
    moatWater.receiveShadow = true;
    scene.add(moatWater);

    // Moat Stone Embankment Walls at `Z = -12.0` (South Bank) and `Z = -36.0` (Castle Cliff)
    for (const mz of [-12.0, -35.8]) {
      const bankWall = new THREE.Mesh(new THREE.BoxGeometry(220, 3.8, 0.9), stoneWallMat);
      bankWall.position.set(0, -1.85, mz);
      bankWall.receiveShadow = true;
      scene.add(bankWall);
    }
    // Low stone parapet walls along the South Moat Bank (`Z = -12.0`) to Left and Right of the Bridge
    registerBoxCollider(-62.0, 1.0, -12.0, 114.0, 3.0, 1.0);
    registerBoxCollider(62.0, 1.0, -12.0, 114.0, 3.0, 1.0);
    for (const side of [-1, 1]) {
      const bankParapet = new THREE.Mesh(new THREE.BoxGeometry(85, 1.05, 0.75), stoneWallMat);
      bankParapet.position.set(side * 47.2, 0.52, -12.0);
      bankParapet.castShadow = true;
      bankParapet.receiveShadow = true;
      scene.add(bankParapet);
    }

    // Castle Island Ground surrounding the Mansion (`Z = -36` to `-140`)
    const northBackGround = new THREE.Mesh(new THREE.PlaneGeometry(240, 80), groundMat);
    northBackGround.rotation.x = -Math.PI / 2;
    northBackGround.position.set(0, -0.02, -112.0);
    northBackGround.receiveShadow = true;
    scene.add(northBackGround);

    const westIslandGround = new THREE.Mesh(new THREE.PlaneGeometry(96, 38), groundMat);
    westIslandGround.rotation.x = -Math.PI / 2;
    westIslandGround.position.set(-72.0, -0.02, -54.0);
    westIslandGround.receiveShadow = true;
    scene.add(westIslandGround);

    const eastIslandGround = new THREE.Mesh(new THREE.PlaneGeometry(96, 38), groundMat);
    eastIslandGround.rotation.x = -Math.PI / 2;
    eastIslandGround.position.set(72.0, -0.02, -54.0);
    eastIslandGround.receiveShadow = true;
    scene.add(eastIslandGround);

    // Long Pumpkin Patch North-South Highway (`Z = +68` to `Z = -12`, 80m long!)
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
    }

    // East-West Lonesome Crossroads Highway at `Z = +20.0`
    const ewRoad = new THREE.Mesh(new THREE.PlaneGeometry(130, 9.2), roadMat);
    ewRoad.rotation.x = -Math.PI / 2;
    ewRoad.position.set(0, 0.03, 20.0);
    ewRoad.receiveShadow = true;
    scene.add(ewRoad);

    // Helper: Build a 3D Carved Glowing Jack-o'-Lantern Pumpkin Prop
    const pumpkinRindMat = new THREE.MeshStandardMaterial({
      color: '#ea580c',
      roughness: 0.42,
      metalness: 0.08,
      emissive: new THREE.Color('#9a3412'),
      emissiveIntensity: 0.35,
    });
    const pumpkinGlowMat = new THREE.MeshBasicMaterial({ color: '#fde047' });
    const pumpkinStemMat = new THREE.MeshStandardMaterial({ color: '#365314', roughness: 0.8 });

    const addJackOLanternProp = (px: number, py: number, pz: number, scale = 1.0, rotY = 0) => {
      const jGroup = new THREE.Group();
      jGroup.position.set(px, py, pz);
      jGroup.rotation.y = rotY;
      jGroup.scale.setScalar(scale);

      const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), pumpkinRindMat);
      body.scale.set(1.08, 0.84, 1.05);
      body.position.y = 0.28;
      body.castShadow = true;
      jGroup.add(body);

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), pumpkinGlowMat);
      core.position.set(0, 0.28, 0.12);
      jGroup.add(core);

      const stem = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), pumpkinStemMat);
      stem.position.set(0, 0.62, 0);
      stem.rotation.z = 0.22;
      jGroup.add(stem);

      scene.add(jGroup);
    };

    // ==========================================================================
    // 1B. MONUMENTAL ARCHED GOTHIC STONE & HEAVY OAK DRAWBRIDGE OVER THE MOAT
    //     (`Z = -12.0` to `Z = -36.0`, `X = -4.6` to `+4.6`)
    // ==========================================================================
    const moatBridgeGroup = new THREE.Group();
    scene.add(moatBridgeGroup);

    // Heavy Stone Bridge Deck & Oak Timber Planking (`Y = 0.0m`, `Z = -11.5` to `-36.5`)
    const bridgeDeckStone = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.55, 25.2),
      stoneWallMat
    );
    bridgeDeckStone.position.set(0, -0.25, -24.0);
    bridgeDeckStone.receiveShadow = true;
    bridgeDeckStone.castShadow = true;
    moatBridgeGroup.add(bridgeDeckStone);

    const bridgeOakPlanks = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 0.08, 24.8),
      woodPlankFloorMat
    );
    bridgeOakPlanks.position.set(0, 0.04, -24.0);
    bridgeOakPlanks.receiveShadow = true;
    moatBridgeGroup.add(bridgeOakPlanks);

    // Crimson Carpet Runner down the center of the Bridge
    const bridgeCarpet = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.04, 24.8),
      redCarpetMat
    );
    bridgeCarpet.position.set(0, 0.08, -24.0);
    moatBridgeGroup.add(bridgeCarpet);

    // Arched Gothic Stone Support Piers rising out of the Moat Water (`Z = -16, -24, -32`)
    for (const pierZ of [-16.0, -24.0, -32.0]) {
      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(
          new THREE.BoxGeometry(1.45, 4.2, 1.85),
          stoneWallMat
        );
        pier.position.set(side * 4.4, -1.8, pierZ);
        pier.castShadow = true;
        pier.receiveShadow = true;
        moatBridgeGroup.add(pier);

        // Gothic Brazier Pillar on top of each Bridge Pier
        const turretPost = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 2.2, 1.15),
          gothicBrickMat
        );
        turretPost.position.set(side * 4.55, 1.1, pierZ);
        turretPost.castShadow = true;
        moatBridgeGroup.add(turretPost);

        const brazierFlame = new THREE.Mesh(
          new THREE.ConeGeometry(0.36, 0.78, 10),
          new THREE.MeshBasicMaterial({ color: '#ff7b00' })
        );
        brazierFlame.position.set(side * 4.55, 2.55, pierZ);
        moatBridgeGroup.add(brazierFlame);

        // Carved Glowing Jack-o'-Lantern perched at each Bridge Pier!
        addJackOLanternProp(side * 3.85, 0.06, pierZ + 0.9, 1.15, side * -0.6);
      }
    }

    // Creneleted Gothic Stone Bridge Parapet Guardrails (`X = -4.5` and `X = +4.5`, `Z = -12` to `-36`)
    for (const side of [-1, 1]) {
      const railWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 1.25, 24.4),
        stoneWallMat
      );
      railWall.position.set(side * 4.5, 0.62, -24.0);
      railWall.castShadow = true;
      railWall.receiveShadow = true;
      moatBridgeGroup.add(railWall);
      registerBoxCollider(side * 4.5, 0.62, -24.0, 0.75, 2.4, 24.4);

      // Heavy Drawbridge Iron Chains angling down from the Castle Gatehouse to the Bridge
      const chainMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 14.5, 8),
        darkTrimMat
      );
      chainMesh.position.set(side * 4.3, 4.2, -31.0);
      chainMesh.rotation.x = Math.PI * 0.28;
      moatBridgeGroup.add(chainMesh);
    }

    // Bridge Lighting so the Moat & Stone Bridge glow dramatically
    const moatBridgeLight = new THREE.PointLight('#ff9d3b', 7.5, 42, 1.05);
    moatBridgeLight.position.set(0, 4.8, -24.0);
    scene.add(moatBridgeLight);

    // Center Crossroads Wooden Signpost at `(-5.4, 0, 24.5)` + Pumpkin Patch Clusters
    const signpostGroup = new THREE.Group();
    signpostGroup.position.set(-5.4, 0, 24.5);
    registerBoxCollider(-5.4, 2.0, 24.5, 0.8, 4.0, 0.8);
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

    // Scatter Glowing Carved 3D Jack-o'-Lanterns along the Pumpkin Patch Highway (`Z = +54` down to `Z = -10`)
    for (let jz = 52; jz >= -10; jz -= 8) {
      if (Math.abs(jz - 20) < 4) continue;
      addJackOLanternProp(-5.2, 0, jz, 0.95 + (Math.abs(jz) % 3) * 0.15, 0.45);
      addJackOLanternProp(5.2, 0, jz - 2, 0.95 + (Math.abs(jz) % 2) * 0.2, -0.45);
    }

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
    for (let gIdx = 0; gIdx < 240; gIdx++) {
      const side = gIdx % 2 === 0 ? -1 : 1;
      const gx = side * (5.8 + (gIdx % 17) * 1.55);
      const gz = -10 + ((gIdx * 7) % 68);
      if (Math.abs(gz - 20) < 5.2 && Math.abs(gx) < 38) continue;
      const tuft = new THREE.Mesh(grassBladeGeo, grassMat);
      tuft.position.set(gx, 0, gz);
      tuft.rotation.y = (gIdx * 1.7) % Math.PI;
      tuft.scale.setScalar(0.75 + (gIdx % 5) * 0.18);
      grassGroup.add(tuft);
    }
    scene.add(grassGroup);

    // ==========================================================================
    // 2. TOTALLY EXPLORABLE 4-LEVEL, 12-ROOM GOTHIC CATHEDRAL & VAMPIRE CASTLE
    //    MANSION (`Z = -36` TO `-72`) WITH FLYING BUTTRESSES, OCTAGONAL KEEP
    //    TOWERS, 3 WALKABLE GRAND STONE STAIRCASES & FULL AABB COLLIDERS!
    // ==========================================================================
    // Note: We offset `castleMansionGroup` by `Z = -14.0m` so its local `Z in [-22, -58]`
    // maps to World `Z in [-36, -72]`, right across the Moat Drawbridge!
    const CASTLE_Z_SHIFT = -14.0;
    const castleMansionGroup = new THREE.Group();
    castleMansionGroup.position.set(0, 0, CASTLE_Z_SHIFT);
    scene.add(castleMansionGroup);

    // Reposition interior castle chandelier lights to match `CASTLE_Z_SHIFT`
    cryptChandelierLight.position.set(0, -1.5, -40.0 + CASTLE_Z_SHIFT);
    groundHallChandelierLight.position.set(0, 4.8, -38.0 + CASTLE_Z_SHIFT);
    upperNobleChandelierLight.position.set(0, 10.8, -40.0 + CASTLE_Z_SHIFT);
    atticBelfryChandelierLight.position.set(0, 16.8, -38.0 + CASTLE_Z_SHIFT);
    crossroadsCenterLight.position.set(0, 7.5, 20.0);

    const addBoxMesh = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material = stoneWallMat,
      rotY = 0,
      collidable = false
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (rotY !== 0) m.rotation.y = rotY;
      m.receiveShadow = true;
      m.castShadow = true;
      castleMansionGroup.add(m);
      if (collidable && rotY === 0) {
        registerBoxCollider(x, y, z + CASTLE_Z_SHIFT, w, h, d);
      }
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

      // Pointed Gothic Lancet Arch Crest at top of window
      const archCrest = new THREE.Mesh(
        new THREE.ConeGeometry(1.35, 1.25, 4),
        darkTrimMat
      );
      archCrest.position.set(0, 2.75, 0);
      archCrest.rotation.y = Math.PI / 4;
      winGroup.add(archCrest);

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
      registerBoxCollider(cx, floorY + height * 0.5, cz + CASTLE_Z_SHIFT, 0.95, height, 0.95);
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
      registerBoxCollider(fx, fy + 1.6, fz + CASTLE_Z_SHIFT, 3.8, 3.2, 1.1);
    };

    // --- FLOOR SLABS WITH OPEN STAIRWELL CUTOUT AT `X in [-6.8, +6.8], Z in [-48.0, -32.0]` ---
    // (In World coordinates, the 3-Lane Grand Staircase Hall spans `Z in [-62.0, -46.0]`)
    const addFloorWithStairwellHole = (elevY: number, mat: THREE.Material) => {
      // South Foyer Slab (`Z in [-22, -32]`, full 48m width)
      addBoxMesh(48, 0.38, 10.0, 0, elevY - 0.19, -27.0, mat);
      // North Gallery Landing Slab (`Z in [-48, -58]`, full 48m width)
      addBoxMesh(48, 0.38, 10.0, 0, elevY - 0.19, -53.0, mat);
      // West Wing Slab (`X in [-24, -6.8]`, `Z in [-32, -48]`)
      addBoxMesh(17.2, 0.38, 16.0, -15.4, elevY - 0.19, -40.0, mat);
      // East Wing Slab (`X in [+6.8, +24]`, `Z in [-32, -48]`)
      addBoxMesh(17.2, 0.38, 16.0, 15.4, elevY - 0.19, -40.0, mat);
    };

    // Level 0: Basement Crypt Floor (`Y = -6.0m`)
    addBoxMesh(48, 0.42, 36, 0, -6.21, -40.0, marbleFloorMat);
    addBoxMesh(45, 0.08, 15.5, 0, -5.94, -49.5, cryptWaterMat);

    // Level 1: Ground Floor (`Y = 0.0m`) — note: West & East stair lanes at Y=0 have solid approaches!
    addFloorWithStairwellHole(0.0, marbleFloorMat);
    addBoxMesh(4.2, 0.38, 16.0, -4.6, -0.19, -40.0, marbleFloorMat);
    addBoxMesh(4.2, 0.38, 16.0, 4.6, -0.19, -40.0, marbleFloorMat);
    addBoxMesh(15.8, 0.04, 16.2, -15.2, 0.02, -49.0, woodPlankFloorMat);
    addBoxMesh(15.8, 0.04, 16.2, 15.2, 0.02, -49.0, woodPlankFloorMat);
    addBoxMesh(4.4, 0.05, 10.5, 0, 0.03, -27.0, redCarpetMat);

    // Level 2: Upper Noble Floor (`Y = +6.0m`) — Center lane bridged at Y=6m so you can walk across North Gallery
    addFloorWithStairwellHole(6.0, woodPlankFloorMat);
    addBoxMesh(4.4, 0.38, 16.0, 0.0, 5.81, -40.0, woodPlankFloorMat);
    addBoxMesh(6.5, 0.05, 9.5, 0, 6.03, -53.0, redCarpetMat);

    // Level 3: Creepy Attic Floor (`Y = +12.0m`) — West & Center lanes floored at Y=12m, East lane open for Attic Stairs!
    addFloorWithStairwellHole(12.0, woodRafterMat);
    addBoxMesh(9.0, 0.38, 16.0, -2.2, 11.81, -40.0, woodRafterMat);

    // ==========================================================================
    // 2B. THREE REAL WALKABLE GRAND GOTHIC STONE STAIRCASES (`Z_local in [-32 .. -48]`,
    //     WHICH IS `Z_world in [-46 .. -62]`!)
    //     1) WEST GRAND STAIRCASE (`X in [-6.5, -2.5]`): Ground (0m at Z_w=-46) -> Upper (+6m at Z_w=-62)
    //     2) CENTER CRYPT STAIRCASE (`X in [-2.2, +2.2]`): Ground (0m at Z_w=-46) -> Crypt (-6m at Z_w=-62)
    //     3) EAST BELFRY STAIRCASE (`X in [+2.5, +6.5]`): Upper (+6m at Z_w=-62) -> Attic (+12m at Z_w=-46)
    // ==========================================================================
    const buildGrandStairFlight = (
      laneX: number,
      laneWidth: number,
      zStartLocal: number,
      zEndLocal: number,
      yStart: number,
      yEnd: number,
      carpetColor = '#a31d36'
    ) => {
      const steps = 28;
      const dz = (zEndLocal - zStartLocal) / steps;
      const dy = (yEnd - yStart) / steps;
      const stepDepth = Math.abs(dz) * 1.08;
      const stepHeight = Math.abs(dy) + 0.14;
      const runnerMat = new THREE.MeshStandardMaterial({
        color: carpetColor,
        roughness: 0.65,
      });

      for (let i = 0; i <= steps; i++) {
        const sz = zStartLocal + dz * i;
        const sy = yStart + dy * i;
        const tread = new THREE.Mesh(
          new THREE.BoxGeometry(laneWidth, stepHeight, stepDepth),
          i % 2 === 0 ? marbleFloorMat : stoneWallMat
        );
        tread.position.set(laneX, sy - stepHeight * 0.5, sz);
        tread.castShadow = true;
        tread.receiveShadow = true;
        castleMansionGroup.add(tread);

        const runner = new THREE.Mesh(
          new THREE.BoxGeometry(laneWidth * 0.56, 0.04, stepDepth * 1.02),
          runnerMat
        );
        runner.position.set(laneX, sy + 0.02, sz);
        castleMansionGroup.add(runner);
      }
    };

    // 1. West Flight: Ground Floor (`Y=0` at `z_local=-32`) UP to 2nd Floor (`Y=+6` at `z_local=-48`)
    buildGrandStairFlight(-4.5, 3.8, -32.0, -48.0, 0.0, 6.0, '#b91c1c');
    // 2. Center Flight: Ground Floor (`Y=0` at `z_local=-32`) DOWN to Crypt (`Y=-6` at `z_local=-48`)
    buildGrandStairFlight(0.0, 4.1, -32.0, -48.0, 0.0, -6.0, '#0f766e');
    // 3. East Flight: 2nd Floor (`Y=+6` at `z_local=-48`) UP to Creepy Attic (`Y=+12` at `z_local=-32`)
    buildGrandStairFlight(4.5, 3.8, -48.0, -32.0, 6.0, 12.0, '#7e22ce');

    // Stone Balustrade Divider Walls between the 3 Staircase Lanes (prevents falling sideways off stairs!)
    addBoxMesh(0.36, 14.0, 15.6, -6.6, 3.5, -40.0, darkTrimMat, 0, true);
    addBoxMesh(0.36, 14.0, 15.6, -2.35, 1.5, -40.0, darkTrimMat, 0, true);
    addBoxMesh(0.36, 14.0, 15.6, 2.35, 5.5, -40.0, darkTrimMat, 0, true);
    addBoxMesh(0.36, 14.0, 15.6, 6.6, 6.5, -40.0, darkTrimMat, 0, true);

    // Exterior Castle Walls with Colliders (`X = ±24`, `Z_local = -22` and `-58`)
    addBoxMesh(0.85, 22.0, 36.0, -24.0, 5.0, -40.0, stoneWallMat, 0, true);
    addBoxMesh(0.85, 22.0, 36.0, 24.0, 5.0, -40.0, stoneWallMat, 0, true);
    addBoxMesh(48.8, 22.0, 0.85, 0.0, 5.0, -58.0, stoneWallMat, 0, true);

    // 8 Exterior Gothic Cathedral Flying Buttresses & Corner Octagonal Keep Towers!
    for (const side of [-1, 1]) {
      for (const bz of [-26.0, -35.0, -45.0, -54.0]) {
        const pier = addBoxMesh(1.8, 16.5, 1.8, side * 27.2, 5.2, bz, stoneWallMat, 0, true);
        const flyer = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.75, 1.2), stoneWallMat);
        flyer.position.set(side * 25.5, 11.5, bz);
        flyer.rotation.z = side * -0.45;
        castleMansionGroup.add(flyer);
        const pinnacle = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 6), darkTrimMat);
        pinnacle.position.set(side * 27.2, 15.0, bz);
        castleMansionGroup.add(pinnacle);
      }

      // Twin Gatehouse Barbican Towers flanking the Front Drawbridge Portal (`X = ±6.2, Z_local = -21.2`)
      const barbican = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.5, 21.0, 12),
        stoneWallMat
      );
      barbican.position.set(side * 6.4, 7.5, -21.2);
      barbican.castShadow = true;
      barbican.receiveShadow = true;
      castleMansionGroup.add(barbican);
      registerBoxCollider(side * 6.4, 2.0, -21.2 + CASTLE_Z_SHIFT, 3.8, 10.0, 3.8);

      const barbicanSpire = new THREE.Mesh(
        new THREE.ConeGeometry(2.6, 7.5, 12),
        darkTrimMat
      );
      barbicanSpire.position.set(side * 6.4, 21.6, -21.2);
      castleMansionGroup.add(barbicanSpire);
    }

    for (const wy of [0.85, 6.85]) {
      addBoxMesh(0.18, 1.65, 35.2, -23.48, wy, -40.0, woodRafterMat);
      addBoxMesh(0.18, 1.65, 35.2, 23.48, wy, -40.0, woodRafterMat);
      addBoxMesh(47.0, 1.65, 0.18, 0.0, wy, -57.48, woodRafterMat);
    }

    // Front Facade Wall left/right of the Open Portcullis Gate (`X in [-4.2 .. +4.2]` is OPEN!)
    addBoxMesh(19.8, 22.0, 0.85, -14.1, 5.0, -22.0, stoneWallMat, 0, true);
    addBoxMesh(19.8, 22.0, 0.85, 14.1, 5.0, -22.0, stoneWallMat, 0, true);
    addBoxMesh(8.4, 6.0, 0.85, 0.0, -3.2, -22.0, stoneWallMat);
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
    addGothicChandelier(0, 4.6, -27.5, '#ffbe42');
    addGothicChandelier(-15.5, 4.6, -30.5, '#ffbe42');
    addGothicChandelier(15.5, 4.6, -30.5, '#ffbe42');
    addGothicChandelier(-15.5, 4.6, -49.0, '#ff9d3b');
    addGothicChandelier(15.5, 4.6, -49.0, '#ffbe42');
    addGothicChandelier(0, 10.6, -53.0, '#ffbe42');
    addGothicChandelier(-15.5, 10.6, -40.0, '#34d399');
    addGothicChandelier(15.5, 10.6, -40.0, '#f43f5e');
    addGothicChandelier(-15.0, -1.4, -31.0, '#34d399');
    addGothicChandelier(0, -1.4, -52.0, '#38bdf8');
    addGothicChandelier(15.0, -1.4, -31.0, '#ef4444');

    // --- FLUTED GOTHIC STONE PILLARS & RIBBED GROIN-VAULT CEILING ARCHES ---
    for (const cz of [-26.0, -31.5, -48.5, -54.0]) {
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
      doorWidth = 4.6
    ) => {
      const totalLen = spanEnd - spanStart;
      const mid = (spanStart + spanEnd) * 0.5;
      const segLen = Math.max(0.5, (totalLen - doorWidth) * 0.5);
      const seg1Center = spanStart + segLen * 0.5;
      const seg2Center = spanEnd - segLen * 0.5;
      const yCenter = floorY + wallHeight * 0.5;

      if (axis === 'Z') {
        addBoxMesh(0.45, wallHeight, segLen, fixedCoord, yCenter, seg1Center, gothicBrickMat, 0, true);
        addBoxMesh(0.45, wallHeight, segLen, fixedCoord, yCenter, seg2Center, gothicBrickMat, 0, true);
        addBoxMesh(0.55, 1.15, doorWidth, fixedCoord, floorY + wallHeight - 0.58, mid, darkTrimMat);
      } else {
        addBoxMesh(segLen, wallHeight, 0.45, seg1Center, yCenter, fixedCoord, gothicBrickMat, 0, true);
        addBoxMesh(segLen, wallHeight, 0.45, seg2Center, yCenter, fixedCoord, gothicBrickMat, 0, true);
        addBoxMesh(doorWidth, 1.15, 0.55, mid, floorY + wallHeight - 0.58, fixedCoord, darkTrimMat);
      }
    };

    addPartitionWallWithDoorway('Z', -7.0, -40.5, -22.5, -6.0);
    addPartitionWallWithDoorway('Z', 7.0, -40.5, -22.5, -6.0);
    addPartitionWallWithDoorway('X', -40.5, -23.5, -7.0, -6.0);
    addPartitionWallWithDoorway('X', -40.5, 7.0, 23.5, -6.0);

    addPartitionWallWithDoorway('Z', -7.0, -39.5, -22.5, 0.0);
    addPartitionWallWithDoorway('Z', 7.0, -39.5, -22.5, 0.0);
    addPartitionWallWithDoorway('X', -40.0, -23.5, -7.0, 0.0);
    addPartitionWallWithDoorway('X', -40.0, 7.0, 23.5, 0.0);
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
    addBoxMesh(2.6, 0.95, 4.2, -13.5, -5.52, -31.5, woodRafterMat, 0, true);

    for (const sx of [-14.0, 0.0, 14.0]) {
      addBoxMesh(2.8, 0.65, 4.6, sx, -5.65, -51.5, stoneWallMat, 0, true);
      addBoxMesh(2.2, 0.85, 3.8, sx, -5.0, -51.5, darkTrimMat);
    }

    const ritualRing = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 2.9, 32),
      new THREE.MeshBasicMaterial({ color: '#ef4444', side: THREE.DoubleSide })
    );
    ritualRing.rotation.x = -Math.PI / 2;
    ritualRing.position.set(14.5, -5.95, -32.0);
    castleMansionGroup.add(ritualRing);
    addBoxMesh(2.4, 1.15, 1.3, 14.5, -5.42, -32.0, darkTrimMat, 0, true);

    for (const bz of [-27.5, -33.5]) {
      addBoxMesh(1.2, 0.65, 2.8, -14.5, 0.32, bz, redCarpetMat, 0, true);
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
      addBoxMesh(4.6, 0.55, 0.85, 14.5, 0.28, pewZ, woodRafterMat, 0, true);
      addBoxMesh(4.6, 1.05, 0.18, 14.5, 0.52, pewZ + 0.35, woodRafterMat);
    }

    addBoxMesh(3.2, 0.95, 10.2, -15.0, 0.48, -48.5, woodRafterMat, 0, true);
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
      addBoxMesh(0.95, 4.9, 3.8, 22.7, 2.45, shelfZ, woodRafterMat, 0, true);
      for (let rowY = 0.9; rowY <= 4.1; rowY += 0.8) {
        addBoxMesh(0.75, 0.52, 3.3, 22.55, rowY, shelfZ, redCarpetMat);
      }
    }
    addBoxMesh(2.4, 0.88, 3.4, 14.5, 0.44, -48.5, woodRafterMat, 0, true);

    const cauldron = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 0.98, 1.4, 20),
      darkTrimMat
    );
    cauldron.position.set(-15.0, 6.7, -40.0);
    castleMansionGroup.add(cauldron);
    registerBoxCollider(-15.0, 6.7, -40.0 + CASTLE_Z_SHIFT, 2.5, 1.8, 2.5);
    const cauldronBroth = new THREE.Mesh(
      new THREE.CircleGeometry(1.22, 20),
      emeraldGlowMat
    );
    cauldronBroth.rotation.x = -Math.PI / 2;
    cauldronBroth.position.set(-15.0, 7.42, -40.0);
    castleMansionGroup.add(cauldronBroth);

    addBoxMesh(3.8, 0.88, 4.6, 16.5, 6.44, -45.0, redCarpetMat, 0, true);
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
    // 3. INTERACTIVE ROADSIDE BILLBOARDS (WITH WARM GROUND FLOODLIGHTS & JACK-O'-LANTERNS)
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
      registerBoxCollider(node.position[0], 2.0, node.position[2], 2.2, 4.0, 2.2);

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

        // Note: `node.castlePaintingPos` is already in World Z (`-36 .. -71`), so add directly to `scene`!
        scene.add(paintGroup);
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
        if (movieNodeId && hits[0].distance < 34) {
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
    // 4. LOAD ALL CONSOLE-GRADE MIXAMO CHARACTER GLBS + LOCK IN BONE REST POSES
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
        // Store the exact factory rest quaternion & position on every bone so
        // skeletal animations NEVER invert or overwrite limb rest poses!
        obj.userData.restQuat = obj.quaternion.clone();
        obj.userData.restPos = obj.position.clone();
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
    playerRoot.position.set(0, 0, 52.0);
    scene.add(playerRoot);

    const pumpkinHeroGroup = new THREE.Group();
    pumpkinHeroGroup.rotation.y = Math.PI;
    const maleSurvivorGroup = new THREE.Group();
    maleSurvivorGroup.rotation.y = Math.PI;
    maleSurvivorGroup.visible = false;
    const femaleSurvivorGroup = new THREE.Group();
    femaleSurvivorGroup.rotation.y = Math.PI;
    femaleSurvivorGroup.visible = false;
    playerRoot.add(pumpkinHeroGroup);
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
    // 5. ROAMING MONSTERS (ALONG THE PUMPKIN PATCH HIGHWAY, CROSSROADS & CASTLE!)
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
      { type: 'ZOMBIE', homeX: -6.5, homeZ: 34.0, floorY: 0, speed: 2.4, maxHp: 60 },
      { type: 'WEREWOLF', homeX: 8.5, homeZ: 18.0, floorY: 0, speed: 3.7, maxHp: 90 },
      { type: 'GHOST', homeX: -8.0, homeZ: 6.0, floorY: 0, speed: 2.9, maxHp: 50 },
      { type: 'ZOMBIE', homeX: 6.5, homeZ: -4.0, floorY: 0, speed: 2.5, maxHp: 60 },
      { type: 'ZOMBIE', homeX: 0.0, homeZ: -65.0, floorY: -6.0, speed: 2.2, maxHp: 70 },
      { type: 'WEREWOLF', homeX: -15.0, homeZ: -62.0, floorY: 0.0, speed: 3.4, maxHp: 95 },
      { type: 'GHOST', homeX: 15.0, homeZ: -44.0, floorY: 0.0, speed: 2.8, maxHp: 55 },
      { type: 'GHOST', homeX: 0.0, homeZ: -44.0, floorY: 12.0, speed: 3.0, maxHp: 65 },
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
        if (!loadedTemplates['PumpkinPatch_Rig']) {
          attachLoadedRigToSlot(pumpkinHeroGroup, 'MaleSurvivor_Rig', 1.06);
        }
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
        // Attach the iconic Pumpkin Patch (Melvin Lester) 3D Rig as the Playable Hero!
        attachLoadedRigToSlot(pumpkinHeroGroup, 'PumpkinPatch_Rig', 1.08);
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
          castleFortressObj.position.set(0, 0, -54.0);
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
    //     STREET LANTERNS (`Lantern.glb`) & GRIMOIRES (`book.glb`)
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
          [-16, 48, 2.3],
          [16, 48, 2.4],
          [-18, 34, 2.5],
          [18, 34, 2.5],
          [-24, 10, 2.6],
          [24, 10, 2.6],
          [-18, -4, 2.8],
          [18, -4, 2.8],
          [-32, -40, 3.2],
          [32, -40, 3.2],
          [-34, -62, 3.4],
          [34, -62, 3.4],
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
        for (let fIdx = 0; fIdx < 32; fIdx++) {
          const side = fIdx % 2 === 0 ? -1 : 1;
          const fx = side * (6.8 + (fIdx % 6) * 3.2);
          const fz = 54 - fIdx * 2.0;
          if (Math.abs(fz - 20) < 5.2) continue;
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
          [-5.2, 44.0],
          [5.2, 44.0],
          [-5.2, 28.0],
          [5.2, 28.0],
          [-5.2, 10.0],
          [5.2, 10.0],
          [-5.2, -10.0],
          [5.2, -10.0],
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

    // ==========================================================================
    // 7. MOLOTOV COCKTAIL PROJECTILES & EXPLOSIONS
    // ==========================================================================
    interface ActiveMolotov {
      mesh: THREE.Group;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      floorY: number;
    }
    interface ActiveExplosion {
      mesh: THREE.Mesh;
      age: number;
      maxAge: number;
      x: number;
      y: number;
      z: number;
    }
    const activeMolotovs: ActiveMolotov[] = [];
    const activeExplosions: ActiveExplosion[] = [];
    const explosionGeo = new THREE.SphereGeometry(1.0, 14, 12);

    const spawnExplosionAt = (ex: number, ey: number, ez: number, radius = 6.2, damage = 65) => {
      halloweenAudio.playMolotovExplosionSfx();
      const expMat = new THREE.MeshBasicMaterial({
        color: '#ff6a00',
        transparent: true,
        opacity: 0.9,
      });
      const expMesh = new THREE.Mesh(explosionGeo, expMat);
      expMesh.position.set(ex, ey + 0.6, ez);
      scene.add(expMesh);

      actionDynamicLight.position.set(ex, ey + 2.2, ez);
      actionDynamicLight.intensity = 14.0;

      activeExplosions.push({
        mesh: expMesh,
        age: 0,
        maxAge: 0.65,
        x: ex,
        y: ey,
        z: ez,
      });

      let killedAny = 0;
      monsters.forEach((m) => {
        if (m.respawnTimer > 0) return;
        if (Math.abs(m.y - ey) > 3.5) return;
        const d = Math.hypot(m.x - ex, m.z - ez);
        if (d <= radius) {
          m.hp -= damage;
          m.hitFlashTimer = 0.35;
          const pushAngle = Math.atan2(m.x - ex, m.z - ez);
          m.vx += Math.sin(pushAngle) * 11.0;
          m.vz += Math.cos(pushAngle) * 11.0;
          if (m.hp <= 0) {
            m.respawnTimer = 8.5;
            m.group.visible = false;
            playerStateRef.current.kills += 1;
            killedAny += 1;
          }
        }
      });

      if (killedAny > 0) {
        setMonstersSlain(playerStateRef.current.kills);
        setCombatLogText(
          `🔥 EXPLOSIVE DETONATION! Incinerated ${killedAny} monster${
            killedAny > 1 ? 's' : ''
          }! Total Slain: ${playerStateRef.current.kills}`
        );
      }
    };

    // ==========================================================================
    // 8. KEYBOARD CONTROLS (WASD + Jump + Stances + Parry + Dash)
    // ==========================================================================
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      keys[k] = true;

      if (k === 'f') {
        e.preventDefault();
        triggerBatAttack();
      } else if (k === 'g') {
        e.preventDefault();
        triggerMolotovThrow();
      } else if (k === '1') {
        e.preventDefault();
        cycleBushidoStance('HIGH');
      } else if (k === '2') {
        e.preventDefault();
        cycleBushidoStance('MID');
      } else if (k === '3') {
        e.preventDefault();
        cycleBushidoStance('LOW');
      } else if (k === 'q') {
        e.preventDefault();
        cycleBushidoStance();
      } else if (k === 'r') {
        e.preventDefault();
        triggerBushidoParry();
      } else if (k === ' ') {
        e.preventDefault();
        const p = playerStateRef.current;
        if (keys['shift']) {
          const moveX = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
          const moveZ = (keys['s'] ? 1 : 0) - (keys['w'] ? 1 : 0);
          const fX = -Math.sin(p.yaw);
          const fZ = -Math.cos(p.yaw);
          const rX = Math.cos(p.yaw);
          const rZ = -Math.sin(p.yaw);
          const dX = moveX !== 0 || moveZ !== 0 ? fX * -moveZ + rX * moveX : fX;
          const dZ = moveX !== 0 || moveZ !== 0 ? fZ * -moveZ + rZ * moveZ : fZ;
          triggerKineticDash(dX, dZ);
        } else if (Math.abs(p.y - p.targetFloorY) < 0.35) {
          p.vy = 7.8;
          halloweenAudio.playFootstepSfx('STONE', true);
        }
      } else if (k === 'c') {
        e.preventDefault();
        const p = playerStateRef.current;
        triggerKineticDash(-Math.sin(p.yaw), -Math.cos(p.yaw));
      } else if (k === 't') {
        e.preventDefault();
        triggerEncounter('pumpkin_patch_tank');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ==========================================================================
    // 9. REST-POSE-PRESERVING CALL OF DUTY / METAL GEAR SOLID V FOX-ENGINE
    //    MULTI-JOINT SKELETAL LOCOMOTION & BUSHIDO COMBAT ANIMATOR!
    // ==========================================================================
    const _deltaEuler = new THREE.Euler();
    const _deltaQuat = new THREE.Quaternion();

    const applyBoneDeltaEuler = (
      bone: THREE.Object3D,
      rx: number,
      ry: number,
      rz: number
    ) => {
      if (!bone.userData.restQuat) {
        bone.userData.restQuat = bone.quaternion.clone();
      }
      _deltaEuler.set(rx, ry, rz, 'XYZ');
      _deltaQuat.setFromEuler(_deltaEuler);
      bone.quaternion.copy(bone.userData.restQuat).multiply(_deltaQuat);
    };

    const animateHumanoidSkeleton = (
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
    };

    // ==========================================================================
    // 10. MAIN 60-FPS GAME ENGINE LOOP (SLIDING AABB COLLISION + WALKABLE STAIRS)
    // ==========================================================================
    let reqId = 0;
    let lastTime = performance.now();
    let tankCannonCooldown = 0;
    let fpsFrames = 0;
    let fpsAccum = 0;
    let activeRoomIdTracker: string | null = null;
    let smoothedGaitSpeed = 0;

    // 2D Circle-vs-AABB Sliding Depenetration Solver
    const resolvePlayerCollisions = (
      candX: number,
      candZ: number,
      playerY: number,
      radius = 0.54
    ): [number, number] => {
      let rx = candX;
      let rz = candZ;
      const pMinY = playerY + 0.35;
      const pMaxY = playerY + 1.65;

      for (let i = 0; i < worldColliders.length; i++) {
        const box = worldColliders[i];
        if (pMaxY < box.minY || pMinY > box.maxY) continue;

        const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
        const dx = rx - closestX;
        const dz = rz - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          if (distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            rx += (dx / dist) * overlap;
            rz += (dz / dist) * overlap;
          } else {
            // Center is inside AABB: push out along shallowest axis
            const penLeft = rx - box.minX;
            const penRight = box.maxX - rx;
            const penFront = rz - box.minZ;
            const penBack = box.maxZ - rz;
            const minPen = Math.min(penLeft, penRight, penFront, penBack);
            if (minPen === penLeft) rx = box.minX - radius;
            else if (minPen === penRight) rx = box.maxX + radius;
            else if (minPen === penFront) rz = box.minZ - radius;
            else rz = box.maxZ + radius;
          }
        }
      }
      return [rx, rz];
    };

    const animate = (now: number) => {
      reqId = requestAnimationFrame(animate);
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      fpsFrames += 1;
      fpsAccum += rawDt;
      if (fpsAccum >= 0.5) {
        setFpsCount(Math.min(60, Math.round(fpsFrames / fpsAccum)));
        fpsFrames = 0;
        fpsAccum = 0;
      }

      const p = playerStateRef.current;
      if (p.hitStopTimer > 0) p.hitStopTimer = Math.max(0, p.hitStopTimer - rawDt);
      if (p.cameraShakeTimer > 0) p.cameraShakeTimer = Math.max(0, p.cameraShakeTimer - rawDt);
      const dt = p.hitStopTimer > 0 ? rawDt * 0.15 : rawDt;

      if (actionDynamicLight.intensity > 0) {
        actionDynamicLight.intensity = Math.max(0, actionDynamicLight.intensity - rawDt * 22);
      }

      // Toggle Playable Hero Rig: Pumpkin Patch (Default) vs Male Survivor vs Female Survivor
      const heroChoice = survivorGenderRef.current;
      pumpkinHeroGroup.visible = heroChoice === 'PUMPKIN_PATCH';
      maleSurvivorGroup.visible = heroChoice === 'MALE';
      femaleSurvivorGroup.visible = heroChoice === 'FEMALE';

      // Advance GPU Wind Shader & Dimensional Rift Aurora Time Uniform
      windTimeUniform.value = t;
      emberParticles.rotation.y = t * 0.03;

      // Sync active Art & Game Production Council Render Lens
      const activeLens =
        CASTLE_COUNCIL_LENSES.find((l) => l.id === councilLensRef.current) ||
        CASTLE_COUNCIL_LENSES[0];
      renderer.toneMappingExposure = activeLens.exposure;
      bloomPass.strength = activeLens.bloomStrength;
      bloomPass.radius = activeLens.bloomRadius;
      bloomPass.threshold = activeLens.bloomThreshold;
      (scene as any).environmentIntensity = activeLens.envIntensity;

      belfryBellGroup.rotation.z = Math.sin(t * 1.6) * 0.28;

      // --- A. PLAYER MOVEMENT, 3 WALKABLE GRAND STAIRCASES & SLIDING AABB COLLISION ---
      if (cameraModeRef.current === 'THIRD_PERSON') {
        const turnSpeed = 2.45;
        if (keys['arrowleft'] || keys['a']) p.yaw += turnSpeed * dt;
        if (keys['arrowright'] || keys['d']) p.yaw -= turnSpeed * dt;

        let forwardInput = 0;
        if (keys['w'] || keys['arrowup']) forwardInput += 1;
        if (keys['s'] || keys['arrowdown']) forwardInput -= 1;

        const isSprinting = Boolean(keys['shift']) && forwardInput > 0;
        p.isSprinting = isSprinting;
        const moveSpeed = isSprinting ? 11.8 : 7.6;

        if (p.dodgeDashTimer > 0) {
          p.dodgeDashTimer = Math.max(0, p.dodgeDashTimer - dt);
          p.vx = p.dodgeDirX * 21.0;
          p.vz = p.dodgeDirZ * 21.0;
          p.isMoving = true;
        } else if (forwardInput !== 0) {
          p.vx += (-Math.sin(p.yaw) * forwardInput * moveSpeed - p.vx) * Math.min(1, dt * 14);
          p.vz += (-Math.cos(p.yaw) * forwardInput * moveSpeed - p.vz) * Math.min(1, dt * 14);
          p.isMoving = true;
        } else {
          p.vx *= Math.max(0, 1 - dt * 11);
          p.vz *= Math.max(0, 1 - dt * 11);
          p.isMoving = Math.hypot(p.vx, p.vz) > 0.32;
        }

        const rawNextX = Math.max(-56, Math.min(56, p.x + p.vx * dt));
        const rawNextZ = Math.max(-71.2, Math.min(64, p.z + p.vz * dt));
        const [resolvedX, resolvedZ] = resolvePlayerCollisions(rawNextX, rawNextZ, p.y, 0.54);
        p.x = resolvedX;
        p.z = resolvedZ;

        // --- DETERMINISTIC WALKABLE GRAND STAIRCASE RAMPS (`Z_world in [-62.0, -46.0]`) ---
        const inStairZBand = p.z <= -46.0 && p.z >= -62.0;
        const rampProgressNorth = Math.max(0, Math.min(1, (-46.0 - p.z) / 16.0)); // 0 at South (-46), 1 at North (-62)

        if (p.z >= -35.8) {
          // Outside on the Crossroads Road or Moat Drawbridge: elevation is 0.0m
          p.onSpiralStairs = false;
          p.targetFloorY = 0.0;
        } else if (inStairZBand && p.x >= -6.45 && p.x <= -2.5 && p.y >= -0.8 && p.y <= 6.8) {
          // 1) WEST GRAND STAIRCASE: Ground (0m at Z=-46) <-> Upper Noble Floor (+6m at Z=-62)
          p.onSpiralStairs = true;
          p.targetFloorY = rampProgressNorth * 6.0;
        } else if (inStairZBand && p.x >= -2.2 && p.x <= 2.2 && p.y >= -6.8 && p.y <= 0.8) {
          // 2) CENTER CRYPT STAIRCASE: Ground (0m at Z=-46) <-> Basement Crypt (-6m at Z=-62)
          p.onSpiralStairs = true;
          p.targetFloorY = -rampProgressNorth * 6.0;
        } else if (inStairZBand && p.x >= 2.5 && p.x <= 6.45 && p.y >= 5.2 && p.y <= 12.8) {
          // 3) EAST BELFRY STAIRCASE: Upper Noble (+6m at Z=-62) <-> Creepy Attic (+12m at Z=-46)
          p.onSpiralStairs = true;
          p.targetFloorY = 6.0 + (1.0 - rampProgressNorth) * 6.0;
        } else {
          p.onSpiralStairs = false;
          const levels = [-6.0, 0.0, 6.0, 12.0];
          let closestLvl = 0.0;
          let minDiff = 999;
          for (const lvl of levels) {
            const diff = Math.abs(p.targetFloorY - lvl);
            if (diff < minDiff) {
              minDiff = diff;
              closestLvl = lvl;
            }
          }
          p.targetFloorY = closestLvl;
        }

        // Vertical Gravity & Smooth Step-Up Physics
        if (p.y > p.targetFloorY + 0.08 && !p.onSpiralStairs) {
          p.vy -= 22.0 * dt;
          p.y += p.vy * dt;
          if (p.y <= p.targetFloorY) {
            p.y = p.targetFloorY;
            p.vy = 0;
          }
        } else {
          p.vy = 0;
          p.y += (p.targetFloorY - p.y) * Math.min(1, dt * 16);
        }

        // Detect which of the 12 Castle Rooms the player is currently inside
        let detectedRoom: CastleRoomDefinition | null = null;
        if (p.z < -36.0) {
          for (const rm of CASTLE_ROOMS) {
            if (
              Math.abs(p.y - rm.elevationY) < 2.9 &&
              p.x >= rm.bounds.minX &&
              p.x <= rm.bounds.maxX &&
              p.z >= rm.bounds.minZ &&
              p.z <= rm.bounds.maxZ
            ) {
              detectedRoom = rm;
              break;
            }
          }
        }

        const newRoomId = detectedRoom ? detectedRoom.id : null;
        if (newRoomId !== activeRoomIdTracker) {
          activeRoomIdTracker = newRoomId;
          setCurrentRoom(detectedRoom);
          if (detectedRoom) {
            setCurrentFloorIdx(detectedRoom.floorIndex);
            halloweenAudio.setGothicMusicZone(detectedRoom.musicZone);
            setCombatLogText(
              `🏰 Room #${detectedRoom.roomNumber}: ${detectedRoom.name} [${detectedRoom.floorLabel}] — ${detectedRoom.subtitle}`
            );
          } else if (p.z >= -35.8) {
            setCurrentFloorIdx(1);
            halloweenAudio.setGothicMusicZone('CROSSROADS');
          }
        }

        if (p.isMoving && Math.abs(p.y - p.targetFloorY) < 0.45) {
          p.footstepCooldown -= dt;
          if (p.footstepCooldown <= 0) {
            p.footstepCooldown = isSprinting ? 0.26 : 0.40;
            const surf: CastleSurfaceType = p.onSpiralStairs
              ? 'SPIRAL_STAIR'
              : detectedRoom
              ? detectedRoom.surface
              : p.z < -12.0 && p.z >= -36.0
              ? 'STONE'
              : 'ASPHALT';
            halloweenAudio.playFootstepSfx(surf, isSprinting);
          }
        }
      }

      playerRoot.position.set(p.x, p.y, p.z);
      playerRoot.rotation.y = p.yaw;
      playerTorchLight.position.set(p.x, p.y + 2.6, p.z);

      // Update Bushido Blade Parry & Combo Timers
      if (p.comboResetTimer > 0) p.comboResetTimer = Math.max(0, p.comboResetTimer - dt);
      if (p.parryWindowTimer > 0) {
        p.parryWindowTimer = Math.max(0, p.parryWindowTimer - dt);
        parryDomeMat.opacity = 0.38;
        parryDome.rotation.y += dt * 5.0;
      } else {
        parryDomeMat.opacity = 0.0;
      }
      if (p.riposteEmpowerTimer > 0) {
        p.riposteEmpowerTimer = Math.max(0, p.riposteEmpowerTimer - dt);
      }

      // Animate Player 3D Rig & Melee Slash Hit Detection
      let swingPhase = 0;
      if (p.batSwingTimer > 0) {
        const prevTimer = p.batSwingTimer;
        p.batSwingTimer = Math.max(0, p.batSwingTimer - dt);
        const totalDur = p.swingDuration || 0.32;
        swingPhase = 1 - p.batSwingTimer / totalDur;

        slashRibbonMat.color.set(
          p.riposteEmpowerTimer > 0
            ? '#38bdf8'
            : bushidoStanceRef.current === 'HIGH'
            ? '#ef4444'
            : bushidoStanceRef.current === 'LOW'
            ? '#a855f7'
            : '#f97316'
        );
        slashRibbonMat.opacity = Math.sin(swingPhase * Math.PI) * 0.78;
        slashRibbon.rotation.z = swingPhase * Math.PI * 1.4;

        const midTime = totalDur * 0.55;
        if (prevTimer >= midTime && p.batSwingTimer < midTime) {
          let hitCount = 0;
          const isRiposte = p.riposteEmpowerTimer > 0;
          const stance = bushidoStanceRef.current;
          const reach = stance === 'LOW' ? 5.2 : 4.5;

          monsters.forEach((m) => {
            if (m.respawnTimer > 0) return;
            if (Math.abs(m.y - p.y) > 2.8) return;
            const dx = m.x - p.x;
            const dz = m.z - p.z;
            const dist = Math.hypot(dx, dz);
            if (dist < reach) {
              hitCount += 1;
              const isExecution =
                isRiposte ||
                (stance === 'HIGH' && dist < 3.6 && Math.random() < 0.55) ||
                p.comboIndex === 3;
              const dmg = isExecution ? m.maxHp : stance === 'HIGH' ? 55 : 40;
              m.hp -= dmg;
              m.hitFlashTimer = 0.3;
              const pushAngle = Math.atan2(dx, dz);
              m.vx += Math.sin(pushAngle) * 10.5;
              m.vz += Math.cos(pushAngle) * 10.5;

              if (m.hp <= 0) {
                m.respawnTimer = 8.5;
                m.group.visible = false;
                p.kills += 1;
              }
            }
          });

          if (hitCount > 0) {
            p.hitStopTimer = 0.055;
            p.cameraShakeTimer = 0.16;
            if (isRiposte) {
              p.riposteEmpowerTimer = 0;
              setRiposteCharged(false);
            }
            halloweenAudio.playKatanaSlashSfx(true, p.comboIndex === 3);
            setMonstersSlain(p.kills);
            setCombatCallout({
              text:
                p.comboIndex === 3
                  ? '⚔️ BUSHIDO EXECUTION!'
                  : `💥 ${stance} SLASH x${hitCount}!`,
              color: stance === 'HIGH' ? '#ef4444' : '#f97316',
              id: Date.now(),
            });
          }
        }
      } else {
        slashRibbonMat.opacity = 0.0;
      }

      const targetGait = p.isMoving ? (p.isSprinting ? 1.38 : 0.95) : 0.0;
      smoothedGaitSpeed += (targetGait - smoothedGaitSpeed) * Math.min(1, dt * 10);

      const activeSurvivorSlot =
        heroChoice === 'PUMPKIN_PATCH'
          ? pumpkinHeroGroup
          : heroChoice === 'MALE'
          ? maleSurvivorGroup
          : femaleSurvivorGroup;
      animateHumanoidSkeleton(
        activeSurvivorSlot,
        t,
        smoothedGaitSpeed,
        swingPhase,
        bushidoStanceRef.current,
        p.comboIndex
      );

      // Process Queued Molotov Cocktail Throws
      while (p.molotovThrowQueue > 0) {
        p.molotovThrowQueue -= 1;
        const mBottle = new THREE.Group();
        const flameOrb = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#ff7b00' })
        );
        mBottle.add(flameOrb);
        const startX = p.x - Math.sin(p.yaw) * 0.9;
        const startY = p.y + 1.5;
        const startZ = p.z - Math.cos(p.yaw) * 0.9;
        mBottle.position.set(startX, startY, startZ);
        scene.add(mBottle);

        activeMolotovs.push({
          mesh: mBottle,
          x: startX,
          y: startY,
          z: startZ,
          vx: -Math.sin(p.yaw) * 14.5,
          vy: 6.8,
          vz: -Math.cos(p.yaw) * 14.5,
          floorY: p.y,
        });
      }

      for (let i = activeMolotovs.length - 1; i >= 0; i--) {
        const mol = activeMolotovs[i];
        mol.vy -= 18.5 * dt;
        mol.x += mol.vx * dt;
        mol.y += mol.vy * dt;
        mol.z += mol.vz * dt;
        mol.mesh.position.set(mol.x, mol.y, mol.z);
        if (mol.y <= mol.floorY + 0.15) {
          scene.remove(mol.mesh);
          activeMolotovs.splice(i, 1);
          spawnExplosionAt(mol.x, mol.floorY, mol.z, 6.2, 65);
        }
      }

      for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const exp = activeExplosions[i];
        exp.age += dt;
        const prog = exp.age / exp.maxAge;
        if (prog >= 1) {
          scene.remove(exp.mesh);
          (exp.mesh.material as THREE.Material).dispose();
          activeExplosions.splice(i, 1);
        } else {
          exp.mesh.scale.setScalar(1 + prog * 5.2);
          (exp.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.85;
        }
      }

      // --- B. UPDATE ROAMING MONSTERS (OUTDOORS & INSIDE CASTLE ROOMS) ---
      let aliveMonsters = 0;
      monsters.forEach((m) => {
        if (m.respawnTimer > 0) {
          m.respawnTimer -= dt;
          if (m.respawnTimer <= 0) {
            m.hp = m.maxHp;
            m.x = m.homeX;
            m.y = m.floorY;
            m.z = m.homeZ;
            m.vx = 0;
            m.vz = 0;
            m.group.visible = true;
          }
          return;
        }
        aliveMonsters += 1;

        const sameFloor = Math.abs(p.y - m.floorY) < 2.5;
        const targetX = sameFloor ? p.x : m.homeX + Math.sin(t * 0.6 + m.phaseOffset) * 3.5;
        const targetZ = sameFloor ? p.z : m.homeZ + Math.cos(t * 0.6 + m.phaseOffset) * 3.5;

        const dx = targetX - m.x;
        const dz = targetZ - m.z;
        const dist = Math.hypot(dx, dz) || 1;

        m.vx *= Math.max(0, 1 - dt * 5);
        m.vz *= Math.max(0, 1 - dt * 5);

        if (dist > 1.55 && dist < 24.0) {
          const nextMx = m.x + (dx / dist) * m.speed * dt + m.vx * dt;
          const nextMz = m.z + (dz / dist) * m.speed * dt + m.vz * dt;
          // Keep outdoor monsters on the mainland (`z > -11.5`) or inside the castle (`z < -36.5`)
          if (m.homeZ > -11.5) {
            m.x = nextMx;
            m.z = Math.max(-10.5, nextMz);
          } else {
            m.x = Math.max(-22.5, Math.min(22.5, nextMx));
            m.z = Math.max(-70.5, Math.min(-37.0, nextMz));
          }
        } else if (sameFloor && dist <= 1.55) {
          if (p.parryWindowTimer > 0) {
            p.parryWindowTimer = 0;
            p.riposteEmpowerTimer = 3.5;
            setRiposteCharged(true);
            m.vx = -(dx / dist) * 12.0;
            m.vz = -(dz / dist) * 12.0;
            halloweenAudio.playParryClangSfx();
            setCombatCallout({
              text: '⚡ PERFECT DEFLECT! RIPOSTE READY!',
              color: '#38bdf8',
              id: Date.now(),
            });
          } else if (p.dodgeDashTimer <= 0 && Math.random() < dt * 1.4) {
            p.hp = Math.max(20, p.hp - 4);
            setPlayerHp(p.hp);
          }
        }

        const floatHover =
          m.type === 'GHOST' ? Math.sin(t * 3.2 + m.phaseOffset) * 0.28 + 0.25 : 0;
        m.group.position.set(m.x, m.floorY + floatHover, m.z);
        m.group.rotation.y = Math.atan2(dx, dz);

        const hpRatio = Math.max(0.05, m.hp / m.maxHp);
        m.hpBarFill.scale.x = hpRatio;
        m.hpBarFill.position.x = -(1 - hpRatio) * 0.52;
        m.hpBarFill.lookAt(camera.position);

        animateHumanoidSkeleton(
          m.rigSlot,
          t + m.phaseOffset,
          dist < 22 ? 0.95 : 0.35,
          dist < 1.9 && sameFloor ? (t * 2.5) % 1 : 0,
          'MID',
          1
        );
      });
      if (Math.floor(t * 2) % 2 === 0) {
        setActiveMonsterCount(aliveMonsters);
      }

      // --- C. ANIMATE SPARSE MOVIE CHARACTER ENCOUNTERS & ARMORED TANK ---
      const enc = activeEncounterRef.current;
      const encElapsed = enc ? (now - encounterStartTimeRef.current) / enc.durationMs : 0;
      const clampedProg = Math.max(0, Math.min(1, encElapsed));

      tankGroup.visible = enc?.id === 'pumpkin_patch_tank';
      miriamFlightGroup.visible = enc?.id === 'miriam_monkeys';
      ppBladesGroup.visible = enc?.id === 'pumpkin_patch_blades';
      stitchRoadGroup.visible = enc?.id === 'stitch_scarecrow';
      katrinaCraneGroup.visible = enc?.id === 'katrina_crane_patrol';
      lilBooDriftGroup.visible = enc?.id === 'lil_boo_jar';

      if (enc?.id === 'pumpkin_patch_tank') {
        const tankZ = -8 + clampedProg * 54;
        const tankX = Math.sin(clampedProg * Math.PI * 2) * 2.2;
        tankGroup.position.set(tankX, 0, tankZ);
        tankGroup.rotation.y = 0;

        tankCannonCooldown -= dt;
        if (tankCannonCooldown <= 0) {
          let nearest: MonsterAgent | null = null;
          let bestD = 999;
          monsters.forEach((m) => {
            if (m.respawnTimer > 0 || Math.abs(m.floorY) > 1) return;
            const d = Math.hypot(m.x - tankX, m.z - tankZ);
            if (d < bestD) {
              bestD = d;
              nearest = m;
            }
          });
          if (nearest && bestD < 38) {
            tankCannonCooldown = 1.9;
            halloweenAudio.playTankCannonShotSfx();
            spawnExplosionAt(
              (nearest as MonsterAgent).x,
              0,
              (nearest as MonsterAgent).z,
              6.5,
              95
            );
          }
        }
      } else if (enc?.id === 'miriam_monkeys') {
        const mx = -28 + clampedProg * 56;
        const my = 14.5 + Math.sin(clampedProg * Math.PI * 3) * 2.2;
        const mz = 8 + Math.cos(clampedProg * Math.PI * 2) * 6;
        miriamFlightGroup.position.set(mx, my, mz);
        miriamFlightGroup.rotation.y = Math.PI / 2;
      } else if (enc?.id === 'pumpkin_patch_blades') {
        const px = p.x + Math.sin(t * 2.5) * 2.8;
        const pz = p.z - 3.5 + Math.cos(t * 2.5) * 2.2;
        ppBladesGroup.position.set(px, p.y, pz);
        ppBladesGroup.rotation.y = t * 5.5;
        animateHumanoidSkeleton(ppBladesGroup, t, 1.3, (t * 3) % 1, 'HIGH', 3);
      } else if (enc?.id === 'stitch_scarecrow') {
        const sx = -14 + clampedProg * 28;
        stitchRoadGroup.position.set(sx, 0, 14.0);
        stitchRoadGroup.rotation.y = Math.PI / 2;
        animateHumanoidSkeleton(stitchRoadGroup, t, 1.0, 0, 'MID', 1);
      } else if (enc?.id === 'katrina_crane_patrol') {
        const kz = 46 - clampedProg * 52;
        katrinaCraneGroup.position.set(3.2, 0, kz);
        katrinaCraneGroup.rotation.y = Math.PI;
        animateHumanoidSkeleton(katrinaSubSlot, t, 1.0, 0, 'MID', 1);
        animateHumanoidSkeleton(craneSubSlot, t + 0.5, 1.0, 0, 'MID', 1);
      } else if (enc?.id === 'lil_boo_jar') {
        const angle = clampedProg * Math.PI * 4;
        lilBooDriftGroup.position.set(
          p.x + Math.cos(angle) * 3.5,
          p.y + 1.8 + Math.sin(t * 4) * 0.4,
          p.z + Math.sin(angle) * 3.5
        );
        lilBooDriftGroup.lookAt(camera.position);
      }

"""

idx_s1 = text.index(sec1_marker)
idx_end = text.index(end_marker)
text = text[:idx_s1] + new_world_and_engine + text[idx_end:]

# Update `isInsideCastle` check in Camera Follow (`p.z < -21.8` -> `p.z < -35.8`)
text = text.replace(
    "const isInsideCastle = p.z < -21.8;",
    "const isInsideCastle = p.z < -35.8;"
)

# Update Playable Hero Selector in the Top Bar to include Pumpkin Patch (Melvin) + Male Survivor + Agent Katrina!
old_gender_buttons = """          {/* Playable Survivor Gender Switch */}
          <div className="flex items-center bg-zinc-950/90 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setSurvivorGender('MALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'MALE'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🧑 Male Survivor
            </button>
            <button
              onClick={() => setSurvivorGender('FEMALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'FEMALE'
                  ? 'bg-pink-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              👩 Female Survivor
            </button>
          </div>"""

new_gender_buttons = """          {/* Playable Hero Selector: Pumpkin Patch (Melvin) / Grindhouse Male / Agent Katrina */}
          <div className="flex items-center bg-zinc-950/90 border border-orange-500/40 rounded-lg p-0.5">
            <button
              onClick={() => setSurvivorGender('PUMPKIN_PATCH')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'PUMPKIN_PATCH'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🎃 Pumpkin Patch
            </button>
            <button
              onClick={() => setSurvivorGender('MALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'MALE'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              ⚔️ Survivor
            </button>
            <button
              onClick={() => setSurvivorGender('FEMALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'FEMALE'
                  ? 'bg-pink-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🕵️‍♀️ Katrina
            </button>
          </div>"""

assert old_gender_buttons in text, "Could not locate old_gender_buttons"
text = text.replace(old_gender_buttons, new_gender_buttons)

TARGET.write_text(text, encoding="utf-8")
print("Successfully upgraded HauntedCastleExhibition.tsx with Moat, Bridge, Walkable Stairs, AABB Collision & Rest-Pose Animator!")
