import { pbrMap } from './PhotographicMaterials';
import { mocapClips } from './MocapClips';
import { TARGET_COLORS } from './RouteOverlay';
import { surfaceTexture } from './SurfaceTextures';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import { Player3D, TeamInfo } from '../types';
import {
  areRiggedCharactersReady,
  disposeRiggedInstance,
  instantiateRiggedFootballPlayer,
  updateRiggedFootballPlayer,
  type RiggedFootballInstance,
} from './RiggedPlayerLoader';

export interface PlayerMeshParts {
  root: THREE.Group;
  torso: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
  rigged?: RiggedFootballInstance;
  ballMesh?: THREE.Mesh;
  targetRing?: THREE.Mesh;
  userRing?: THREE.Mesh;
  fireAura?: THREE.Mesh;
  badgeSprite?: THREE.Sprite;
}

export class PlayerMeshBuilder {
  private static skinMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d5524,
    roughness: 0.62,
  });

  private static whiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
  });

  private static blackMaterial = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.5,
  });

  private static footballMaterial: THREE.MeshStandardMaterial | null = null;

  public static getFootballMaterial(): THREE.MeshStandardMaterial {
    if (!this.footballMaterial) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#6e260e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(20, 0, 16, canvas.height);
      ctx.fillRect(canvas.width - 36, 0, 16, canvas.height);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(80, canvas.height / 2);
      ctx.lineTo(176, canvas.height / 2);
      ctx.stroke();

      for (let x = 90; x <= 166; x += 11) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height / 2 - 16);
        ctx.lineTo(x, canvas.height / 2 + 16);
        ctx.stroke();
      }

      const texture = new THREE.CanvasTexture(canvas);
      this.footballMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: surfaceTexture('leather'),
        bumpScale: 0.012,
        roughness: 0.55,
        metalness: 0.05,
      });
    }
    return this.footballMaterial;
  }

  public static createFootball(): THREE.Mesh {
    const geom = new THREE.SphereGeometry(0.24, 16, 16);
    geom.scale(1.0, 1.0, 1.7);
    const mesh = new THREE.Mesh(geom, this.getFootballMaterial());
    mesh.castShadow = true;
    return mesh;
  }

  public static disposePlayer(root: THREE.Group): void {
    const riggedInst = root.userData.riggedInstance as RiggedFootballInstance | undefined;
    if (riggedInst) {
      disposeRiggedInstance(riggedInst);
      root.userData.riggedInstance = undefined;
    }

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const shared = new Set([this.skinMaterial, this.whiteMaterial, this.blackMaterial, this.footballMaterial]);
    root.traverse((object) => {
      if (object.userData.sharedGltfGeometry) return;
      // Skip shared geometries inside cached Character Forge GLB clones
      let cur: THREE.Object3D | null = object;
      let insideRigged = false;
      while (cur) {
        if (cur === riggedInst?.modelRoot) {
          insideRigged = true;
          break;
        }
        cur = cur.parent;
      }
      if (insideRigged) return;

      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material)
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
          if (!shared.has(m as THREE.MeshStandardMaterial)) materials.add(m);
        });
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      m.dispose();
    });
  }

  /**
   * Builds either:
   * - 'ATHLETE': Plajah Character Forge Rigged Pro Football Player GLB (58-joint contract skeleton,
   *   anatomical muscles, fitted cantilevered shoulder pads, game jersey/pants, composite helmet,
   *   and full Plajah Motion Studio compatibility!) with graceful procedural fallback during preload.
   * - 'BLOCK': Classic Roblox-inspired blocky avatar option & Special Mode!
   */
  public static createPlayerGroup(
    player: Player3D,
    team: TeamInfo,
    mode: 'BLOCK' | 'ATHLETE' = 'ATHLETE'
  ): PlayerMeshParts {
    // Use Plajah Character Forge Rigged Pro Football GLB whenever ATHLETE mode is active & loaded
    if (mode === 'ATHLETE' && areRiggedCharactersReady()) {
      const rigged = instantiateRiggedFootballPlayer(player, team);
      if (rigged) {
        const root = new THREE.Group();
        root.position.set(player.x, player.y, player.z);
        root.userData.riggedInstance = rigged;
        root.userData.athlete = true;
        root.add(rigged.modelRoot);

        // Attach football directly to the Character Forge right-hand grip socket
        let ballMesh: THREE.Mesh | undefined;
        if (player.role === 'QB' || player.role === 'RB' || player.role === 'WR' || player.role === 'TE') {
          ballMesh = this.createFootball();
          ballMesh.scale.setScalar(1 / 1.0936);
          const handAnchor = rigged.rightHandSocket || rigged.bones.RightHand;
          if (handAnchor) {
            ballMesh.position.set(0.0, 0.05, 0.06);
            ballMesh.rotation.set(0.3, 0.4, 0.2);
            handAnchor.add(ballMesh);
          } else {
            ballMesh.position.set(-0.35, 1.32, 0.25);
            root.add(ballMesh);
          }
          ballMesh.visible = !!player.hasBall;
        }

        // Receiver Target Key Badge Sprite (1 / 2 / 3 / 4)
        let badgeSprite: THREE.Sprite | undefined;
        if (player.route?.targetKey) {
          const c = document.createElement('canvas');
          c.width = 128;
          c.height = 128;
          const ctx = c.getContext('2d')!;
          ctx.beginPath();
          ctx.arc(64, 64, 52, 0, Math.PI * 2);
          ctx.fillStyle = TARGET_COLORS[player.route.targetKey] || '#00daf3';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 10;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = '900 76px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(player.route.targetKey, 64, 67);
          const map = new THREE.CanvasTexture(c);
          map.colorSpace = THREE.SRGBColorSpace;
          badgeSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false })
          );
          badgeSprite.scale.setScalar(0.9);
          badgeSprite.position.y = 2.85;
          badgeSprite.renderOrder = 20;
          root.add(badgeSprite);
        }

        // Receiver Route Separation Ring
        let targetRing: THREE.Mesh | undefined;
        if (player.role === 'WR' || player.role === 'TE' || player.route) {
          const ringGeom = new THREE.RingGeometry(0.85, 1.15, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xc084fc,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
          });
          targetRing = new THREE.Mesh(ringGeom, ringMat);
          targetRing.rotation.x = -Math.PI / 2;
          targetRing.position.set(0, 0.04, 0);
          root.add(targetRing);
        }

        // User-Control Ring
        const userRing = new THREE.Mesh(
          new THREE.RingGeometry(1.05, 1.38, 32),
          new THREE.MeshBasicMaterial({
            color: 0xffbf00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.92,
          })
        );
        userRing.rotation.x = -Math.PI / 2;
        userRing.position.set(0, 0.055, 0);
        userRing.visible = !!player.isUserControlled;
        root.add(userRing);

        // Arcade "ON FIRE!" Flame Halo
        const fireAura = new THREE.Mesh(
          new THREE.CylinderGeometry(0.75, 1.05, 2.2, 14, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xff5500,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        fireAura.position.y = 1.1;
        fireAura.visible = false;
        root.add(fireAura);

        // Lightweight anchor stubs for PlayerMeshParts contract compatibility
        const torsoStub = new THREE.Mesh();
        torsoStub.visible = false;
        root.add(torsoStub);

        return {
          root,
          torso: torsoStub,
          leftArm: new THREE.Group(),
          rightArm: new THREE.Group(),
          leftLeg: new THREE.Group(),
          rightLeg: new THREE.Group(),
          head: new THREE.Group(),
          rigged,
          ballMesh,
          targetRing,
          userRing,
          fireAura,
          badgeSprite,
        };
      }
    }

    const skin = this.skinMaterial.clone();
    const tones = ['#d6a581', '#ad7756', '#704c37', '#c08a66', '#513829'];
    skin.color.set(tones[player.number % tones.length]);
    skin.roughness = 0.66;
    skin.metalness = 0;
    skin.bumpMap = surfaceTexture('leather');
    skin.bumpScale = 0.0012;

    const root = new THREE.Group();
    root.position.set(player.x, player.y, player.z);

    // Realistic NFL positional sizing (massive trenches vs lean WRs/DBs)
    const isTrench = player.role === 'OL' || player.role === 'DL';
    const isPower = player.role === 'LB' || player.role === 'TE' || player.role === 'RB';
    const bulk = player.bulkScale ?? (isTrench ? 1.26 : isPower ? 1.07 : 0.94);
    const tall = player.heightScale ?? (isTrench || player.role === 'TE' ? 1.05 : 1.0);
    if (mode === 'ATHLETE') {
      root.scale.set(bulk, tall, Math.min(1.16, bulk));
    }

    // 256x256 Authentic Pro Jersey Texture (Nameplate, Outlined Numbers, Collar & Sleeve Stripes)
    const jerseyCanvas = document.createElement('canvas');
    jerseyCanvas.width = 256;
    jerseyCanvas.height = 256;
    const jCtx = jerseyCanvas.getContext('2d')!;

    jCtx.fillStyle = team.primaryColor;
    jCtx.fillRect(0, 0, 256, 256);

    // Pro jersey mesh micro-perforation texture
    jCtx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 52; y < 220; y += 6) {
      for (let x = 4; x < 256; x += 6) {
        jCtx.fillRect(x, y, 2, 2);
      }
    }

    // Team shoulder yoke & athletic trim bars
    jCtx.fillStyle = team.secondaryColor;
    jCtx.fillRect(0, 0, 256, 36);
    jCtx.fillRect(0, 228, 256, 28);
    jCtx.fillStyle = team.accentColor;
    jCtx.fillRect(0, 36, 256, 7);

    // Upper-back style player nameplate
    const lastName = (player.name.split(' ').pop() || player.name).replace(/[^A-Za-z-]/g, '').toUpperCase().slice(0, 10);
    jCtx.fillStyle = team.textColor;
    jCtx.font = '800 22px "Chakra Petch", sans-serif';
    jCtx.textAlign = 'center';
    jCtx.textBaseline = 'middle';
    jCtx.fillText(lastName, 128, 62);

    // Bold Pro Jersey Number with double-stitched outline
    jCtx.font = '900 110px "Teko", "Rajdhani", sans-serif';
    jCtx.lineWidth = 10;
    jCtx.strokeStyle = team.secondaryColor;
    jCtx.strokeText(player.number.toString(), 128, 148);
    jCtx.fillStyle = team.textColor;
    jCtx.fillText(player.number.toString(), 128, 148);

    const jerseyTexture = new THREE.CanvasTexture(jerseyCanvas);
    jerseyTexture.colorSpace = THREE.SRGBColorSpace;
    const jerseyMat = new THREE.MeshStandardMaterial({
      map: jerseyTexture,
      normalMap: pbrMap('fabric', 'NormalGL'),
      normalScale: new THREE.Vector2(0.24, 0.24),
      roughnessMap: pbrMap('fabric', 'Roughness'),
      roughness: 0.88,
      metalness: 0.02,
    });

    const solidJerseyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team.primaryColor),
      normalMap: pbrMap('fabric', 'NormalGL'),
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughness: 0.88,
      metalness: 0.02,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team.secondaryColor),
      roughness: 0.55,
      metalness: 0.15,
    });

    const helmetMat = new THREE.MeshPhysicalMaterial({
      clearcoat: 1,
      clearcoatRoughness: 0.14,
      color: new THREE.Color(team.helmetColor),
      roughness: 0.24,
      metalness: 0.14,
    });

    const isWhiteKit =
      team.primaryColor.toLowerCase().startsWith('#f') || team.primaryColor.toLowerCase() === '#ffffff';
    const pantsColor = isWhiteKit ? team.secondaryColor : '#f8fafc';
    const pantsMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pantsColor),
      roughness: 0.86,
      normalMap: pbrMap('fabric', 'NormalGL'),
      normalScale: new THREE.Vector2(0.18, 0.18),
    });

    const sockMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isWhiteKit ? '#0f172a' : team.primaryColor),
      roughness: 0.85,
    });

    const cleatMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isWhiteKit ? team.secondaryColor : '#ffffff'),
      roughness: 0.35,
      metalness: 0.12,
    });

    const gloveMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team.secondaryColor),
      roughness: 0.38,
    });

    const maskMat = new THREE.MeshStandardMaterial({
      color: isWhiteKit ? new THREE.Color(team.secondaryColor) : new THREE.Color(0xe2e8f0),
      metalness: 0.85,
      roughness: 0.22,
    });

    // 1. Torso & Sculpted Pro Shoulder Pads
    const torsoGeom =
      mode === 'ATHLETE'
        ? new RoundedBoxGeometry(0.74, 0.88, 0.44, 4, 0.18)
        : new THREE.BoxGeometry(0.86, 0.9, 0.46);
    const torso = new THREE.Mesh(torsoGeom, jerseyMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    root.add(torso);

    if (mode === 'ATHLETE') {
      // Sculpted contoured football shoulder pad harness + dome caps
      const chestYoke = new THREE.Mesh(new RoundedBoxGeometry(1.14, 0.3, 0.56, 4, 0.14), solidJerseyMat);
      chestYoke.position.set(0, 0.34, 0.01);
      chestYoke.castShadow = true;
      torso.add(chestYoke);

      // Rounded shoulder deltoid pad caps with team sleeve stripe
      [-1, 1].forEach((side) => {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), solidJerseyMat);
        cap.scale.set(0.95, 0.78, 1.05);
        cap.position.set(side * 0.54, 0.32, 0);
        cap.castShadow = true;
        torso.add(cap);

        const sleeveBand = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.032, 6, 16), trimMat);
        sleeveBand.rotation.x = Math.PI / 2;
        sleeveBand.position.set(side * 0.56, 0.18, 0);
        torso.add(sleeveBand);
      });

      // Lower-waist athletic hip/pelvis block + belt + QB/RB sideline towel
      const hips = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.26, 0.4, 3, 0.1), pantsMat);
      hips.position.y = 0.92;
      root.add(hips);

      const belt = new THREE.Mesh(
        new THREE.TorusGeometry(0.29, 0.036, 6, 20),
        new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.5 })
      );
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1.2, 0.78, 1);
      belt.position.y = 0.98;
      root.add(belt);

      if (player.role === 'QB' || player.role === 'WR' || player.role === 'RB') {
        const towel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.04), this.whiteMaterial);
        towel.position.set(player.role === 'QB' ? 0 : 0.26, 0.78, player.role === 'QB' ? 0.22 : 0.18);
        root.add(towel);
      }

      // Neck roll & V-collar trim
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 12), skin);
      neck.position.set(0, 0.5, 0);
      torso.add(neck);

      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.028, 6, 18), trimMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.44, 0.01);
      torso.add(collar);
    } else {
      // Classic Roblox-style blocky shoulder pads
      const shoulderPads = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.35, 0.6), jerseyMat);
      shoulderPads.position.set(0, 0.35, 0);
      shoulderPads.castShadow = true;
      torso.add(shoulderPads);
    }

    // 2. Head & Pro Football Helmet (or Blocky Classic Helmet)
    const head = new THREE.Group();
    head.position.set(0, 0.66, 0);

    const helmet = new THREE.Mesh(
      mode === 'ATHLETE' ? new THREE.SphereGeometry(0.29, 20, 18) : new THREE.BoxGeometry(0.54, 0.54, 0.54),
      helmetMat
    );
    if (mode === 'ATHLETE') {
      helmet.scale.set(0.95, 1.02, 1.08);
    }
    helmet.castShadow = true;
    head.add(helmet);

    const visorMat = new THREE.MeshStandardMaterial({
      color: team.visorColor ? new THREE.Color(team.visorColor) : 0x0f172a,
      roughness: 0.08,
      metalness: 0.92,
    });

    if (mode === 'ATHLETE') {
      // Face inside helmet
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), skin);
      face.position.set(0, -0.07, 0.08);
      head.add(face);

      // Tinted Pro Visor Shield
      const visor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.255, 0.255, 0.13, 16, 1, true, -Math.PI * 0.38, Math.PI * 0.76),
        visorMat
      );
      visor.position.set(0, 0.02, 0.07);
      head.add(visor);

      // Multi-Bar Pro 3D Facemask Cage (Horizontal + Vertical Curved Bars)
      for (const y of [-0.04, -0.11, -0.18]) {
        const hBar = new THREE.Mesh(
          new THREE.TorusGeometry(0.23, 0.015, 6, 14, Math.PI * 0.72),
          maskMat
        );
        hBar.rotation.x = Math.PI / 2;
        hBar.rotation.z = Math.PI * 0.14;
        hBar.position.set(0, y, 0.09);
        head.add(hBar);
      }
      // Vertical cage struts (more bars for linemen!)
      const vOffsets = isTrench ? [-0.14, -0.05, 0.05, 0.14] : [-0.12, 0, 0.12];
      vOffsets.forEach((vx) => {
        const vBar = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.18, 6), maskMat);
        vBar.position.set(vx, -0.11, 0.305 - Math.abs(vx) * 0.25);
        head.add(vBar);
      });

      // White Pro Chinstrap Cup
      const chinCup = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.07), this.whiteMaterial);
      chinCup.position.set(0, -0.22, 0.22);
      head.add(chinCup);

      // Center Helmet Racing Stripe
      const centerStripe = new THREE.Mesh(
        new THREE.SphereGeometry(0.296, 20, 14, Math.PI * 0.46, 0.11),
        trimMat
      );
      centerStripe.scale.set(0.95, 1.02, 1.08);
      head.add(centerStripe);

      // Side Team Crest Decals
      const emblemMat = new THREE.MeshBasicMaterial({ color: team.accentColor });
      [-1, 1].forEach((side) => {
        const decalOuter = new THREE.Mesh(new THREE.CircleGeometry(0.105, 14), trimMat);
        decalOuter.position.set(side * 0.278, 0.03, -0.02);
        decalOuter.rotation.y = side * (Math.PI / 2);
        head.add(decalOuter);

        const decalInner = new THREE.Mesh(new THREE.CircleGeometry(0.072, 12), emblemMat);
        decalInner.position.set(side * 0.281, 0.03, -0.02);
        decalInner.rotation.y = side * (Math.PI / 2);
        head.add(decalInner);
      });
    } else {
      // Blocky classic visor & bar
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.15, 0.08), visorMat);
      visor.position.set(0, 0.04, 0.27);
      head.add(visor);
      const maskBar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.08), maskMat);
      maskBar.position.set(0, -0.12, 0.28);
      head.add(maskBar);
    }
    torso.add(head);

    // 3. Articulated Arms (Upper bicep + elbow + forearm + wristband + pro receiver gloves)
    const armGeom =
      mode === 'ATHLETE'
        ? new THREE.CapsuleGeometry(0.095, 0.24, 4, 10)
        : new THREE.BoxGeometry(0.22, 0.65, 0.22);

    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * (mode === 'ATHLETE' ? 0.56 : 0.58), 0.28, 0);
      const upper = new THREE.Mesh(armGeom, mode === 'ATHLETE' ? skin : solidJerseyMat);
      upper.position.y = mode === 'ATHLETE' ? -0.15 : -0.3;
      upper.castShadow = true;
      arm.add(upper);

      if (mode === 'ATHLETE') {
        const elbow = new THREE.Group();
        elbow.name = 'elbow';
        elbow.position.y = -0.32;
        const sleeveMat = player.number % 2 === 0 ? skin : sockMat; // Realistic compression sleeves on half the roster
        const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.22, 4, 10), sleeveMat);
        forearm.position.y = -0.15;
        forearm.castShadow = true;
        elbow.add(forearm);

        const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.065, 10), this.whiteMaterial);
        wristband.position.y = -0.27;
        elbow.add(wristband);

        const glove = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), gloveMat);
        glove.scale.set(0.9, 1.1, 0.78);
        glove.position.y = -0.35;
        elbow.add(glove);
        arm.add(elbow);
      } else {
        const glove = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), gloveMat);
        glove.position.y = -0.64;
        arm.add(glove);
      }
      torso.add(arm);
      return arm;
    };

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);

    // Football tucked in right arm/hand
    const ballMesh = this.createFootball();
    ballMesh.position.set(0, -0.45, 0.24);
    ballMesh.rotation.set(0.4, 0.5, 0.3);
    ballMesh.visible = !!player.hasBall;
    rightArm.add(ballMesh);

    // 4. Articulated Legs (Thigh w/ integrated pad stripe + knee + pro crew sock + sculpted cleats)
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.22, 0.88, 0);

      if (mode === 'ATHLETE') {
        const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.24, 4, 12), pantsMat);
        thigh.position.y = -0.17;
        thigh.castShadow = true;
        leg.add(thigh);

        // Athletic side pants stripe
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.095), trimMat);
        stripe.position.set(side * 0.13, -0.17, 0);
        leg.add(stripe);

        const knee = new THREE.Group();
        knee.name = 'knee';
        knee.position.y = -0.35;

        // Knee pad + Team Crew Sock + Ankle Tape
        const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), pantsMat);
        kneePad.position.set(0, -0.02, 0.04);
        knee.add(kneePad);

        const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.098, 0.24, 4, 12), sockMat);
        calf.position.y = -0.17;
        calf.castShadow = true;
        knee.add(calf);

        const ankleTape = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.075, 10), this.whiteMaterial);
        ankleTape.position.y = -0.32;
        knee.add(ankleTape);

        // Sculpted Pro Cleat with dark sole plate
        const shoeUpper = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.13, 0.38, 2, 0.045), cleatMat);
        shoeUpper.position.set(0, -0.4, 0.07);
        knee.add(shoeUpper);

        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.36), this.blackMaterial);
        sole.position.set(0, -0.465, 0.07);
        knee.add(sole);

        leg.add(knee);
      } else {
        const blockLeg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.72, 0.32), pantsMat);
        blockLeg.position.y = -0.36;
        blockLeg.castShadow = true;
        leg.add(blockLeg);
        const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.4), cleatMat);
        cleat.position.set(0, -0.76, 0.04);
        leg.add(cleat);
      }

      root.add(leg);
      return leg;
    };

    const leftLeg = buildLeg(-1);
    const rightLeg = buildLeg(1);

    root.userData.athlete = mode === 'ATHLETE';

    // 5. Overhead Receiver Target Badge Sprite
    let badgeSprite: THREE.Sprite | undefined;
    if (player.route) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#08111e';
      ctx.beginPath();
      ctx.arc(64, 64, 57, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = TARGET_COLORS[Number(player.route.targetKey) - 1] || '#38bdf8';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 76px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.route.targetKey, 64, 67);
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      badgeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false }));
      badgeSprite.scale.setScalar(0.9);
      badgeSprite.position.y = 2.85;
      badgeSprite.renderOrder = 20;
      root.add(badgeSprite);
    }

    // 6. Receiver Route Separation Ring
    let targetRing: THREE.Mesh | undefined;
    if (player.role === 'WR' || player.role === 'TE' || player.route) {
      const ringGeom = new THREE.RingGeometry(0.85, 1.15, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc084fc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      targetRing = new THREE.Mesh(ringGeom, ringMat);
      targetRing.rotation.x = -Math.PI / 2;
      targetRing.position.set(0, 0.04, 0);
      root.add(targetRing);
    }

    // 7. User-Control Madden Ring
    const userRingGeom = new THREE.RingGeometry(1.05, 1.38, 32);
    const userRingMat = new THREE.MeshBasicMaterial({
      color: 0xffbf00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const userRing = new THREE.Mesh(userRingGeom, userRingMat);
    userRing.rotation.x = -Math.PI / 2;
    userRing.position.set(0, 0.055, 0);
    userRing.visible = !!player.isUserControlled;
    root.add(userRing);

    // 8. Arcade "ON FIRE!" Flame Halo Mesh
    const fireAura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 1.05, 2.2, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff5500,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    fireAura.position.y = 1.1;
    fireAura.visible = false;
    root.add(fireAura);

    return {
      root,
      torso,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      head,
      ballMesh,
      targetRing,
      userRing,
      fireAura,
      badgeSprite,
    };
  }

  private static gait = new WeakMap<THREE.Mesh, { phase: number; time: number; state?: string; stateTime?: number }>();

  public static animatePlayer(
    parts: PlayerMeshParts,
    player: Player3D,
    animTime: number,
    isOpen: boolean = false,
    showSeparationRing: boolean = true
  ): void {
    const gait = this.gait.get(parts.torso) ?? { phase: 0, time: animTime };
    if (gait.state !== player.state) {
      gait.state = player.state;
      gait.stateTime = animTime;
    }
    const dt = Math.max(0, Math.min(0.05, animTime - gait.time));
    gait.time = animTime;
    const currentSpeed = Math.hypot(player.vx || 0, player.vz || 0);
    gait.phase = (gait.phase + currentSpeed * 2.2 * dt) % (Math.PI * 2);
    this.gait.set(parts.torso, gait);

    // Character Forge Rigged GLB skeletal animation path (supports Plajah Motion Studio clips!)
    if (parts.rigged) {
      updateRiggedFootballPlayer(parts.rigged, player, animTime, dt || 1 / 60);

      if (parts.ballMesh) {
        parts.ballMesh.visible = !!player.hasBall;
      }

      if (parts.targetRing) {
        parts.targetRing.visible = showSeparationRing && !player.hasBall;
        const ringMat = parts.targetRing.material as THREE.MeshBasicMaterial;
        if (isOpen) {
          ringMat.color.setHex(0x10b981);
          parts.targetRing.scale.setScalar(1.0 + Math.sin(animTime * 6) * 0.12);
        } else {
          ringMat.color.setHex(0xc084fc);
          parts.targetRing.scale.setScalar(1.0);
        }
      }

      if (parts.userRing) {
        parts.userRing.visible = !!player.isUserControlled;
        if (player.isUserControlled) {
          const mat = parts.userRing.material as THREE.MeshBasicMaterial;
          mat.color.setHex(
            player.isOnFire ? 0xff5500 : player.team === 'OFFENSE' ? 0xffbf00 : 0x00daf3
          );
          parts.userRing.scale.setScalar(1.0 + Math.sin(animTime * 9) * 0.08);
        }
      }

      if (parts.fireAura) {
        parts.fireAura.visible = !!player.isOnFire;
        if (player.isOnFire) {
          parts.fireAura.rotation.y = animTime * 7.5;
          const pulse = 0.92 + Math.sin(animTime * 22) * 0.14;
          parts.fireAura.scale.set(pulse, 1.0 + Math.sin(animTime * 18) * 0.12, pulse);
        }
      }
      return;
    }

    const t = gait.phase;

    const joints = [parts.torso, parts.leftArm, parts.rightArm, parts.leftLeg, parts.rightLeg];
    const previous = joints.map((j) => j.quaternion.clone());
    const previousY = parts.torso.position.y;
    joints.forEach((j) => j.rotation.set(0, 0, 0));
    parts.torso.position.y = 1.35;

    const running = player.state === 'RUNNING';
    [parts.leftLeg, parts.rightLeg].forEach((leg, i) => {
      const knee = leg.getObjectByName('knee');
      if (knee) knee.rotation.x = running ? Math.max(0, Math.sin(t + i * Math.PI)) * 1.1 : 0.12;
    });
    [parts.leftArm, parts.rightArm].forEach((arm) => {
      const elbow = arm.getObjectByName('elbow');
      if (elbow) elbow.rotation.x = running ? -1.1 : -0.25;
    });

    if (parts.ballMesh) {
      parts.ballMesh.visible = !!player.hasBall;
    }

    const move = player.moveAction;
    const moveActive = (player.moveTimer ?? 0) > 0;

    if (moveActive && move === 'DIVE') {
      parts.torso.rotation.x = 1.25;
      parts.torso.position.y = 0.85;
      parts.leftArm.rotation.set(-2.6, 0, 0);
      parts.rightArm.rotation.set(-2.6, 0, 0);
      parts.leftLeg.rotation.x = 0.6;
      parts.rightLeg.rotation.x = 0.4;
    } else if (moveActive && move === 'TRUCK') {
      parts.torso.rotation.x = 0.68;
      parts.torso.position.y = 1.2;
      parts.rightArm.rotation.set(-1.3, 0.4, -0.5);
      parts.leftArm.rotation.set(-1.5, -0.5, 0.35);
    } else if (player.state === 'RUNNING') {
      const strideAmp = Math.min(0.88, 0.4 + (currentSpeed / 10.0) * 0.45);
      const legStride = Math.sin(t) * strideAmp;
      parts.leftLeg.rotation.x = legStride;
      parts.rightLeg.rotation.x = -legStride;
      parts.leftArm.rotation.x = -legStride * 0.9;
      if (!player.hasBall) {
        parts.rightArm.rotation.x = legStride * 0.9;
      } else {
        parts.rightArm.rotation.set(-1.1, 0.3, -0.4);
        parts.leftArm.rotation.set(-0.6, -0.4, 0.2);
      }
      parts.torso.rotation.x = 0.28;
      parts.torso.rotation.z = moveActive && move === 'JUKE' ? Math.sin(animTime * 28) * 0.36 : 0;
      parts.torso.position.y = 1.35 + Math.abs(Math.sin(t)) * 0.09;
    } else if (player.state === 'DROPBACK') {
      const dropCycle = Math.sin(t * 0.7) * 0.45;
      parts.leftLeg.rotation.x = dropCycle;
      parts.rightLeg.rotation.x = -dropCycle;
      parts.torso.rotation.x = -0.05;
      parts.rightArm.rotation.set(-1.3, 0.4, 0.4);
      parts.leftArm.rotation.set(-1.1, -0.4, -0.2);
    } else if (player.state === 'THROWING') {
      parts.rightArm.rotation.x = THREE.MathUtils.lerp(parts.rightArm.rotation.x, 0.95, 0.25);
      parts.rightArm.rotation.z = -0.2;
      parts.leftArm.rotation.x = -0.7;
      parts.torso.rotation.y = -0.35;
    } else if (player.state === 'KICKING') {
      parts.rightLeg.rotation.x = -1.35;
      parts.leftLeg.rotation.x = 0.35;
      parts.torso.rotation.x = -0.22;
      parts.leftArm.rotation.set(-0.7, 0, -0.6);
      parts.rightArm.rotation.set(0.4, 0, 0.5);
    } else if (player.state === 'BLOCKING' || player.state === 'PASS_RUSH') {
      const jolt = Math.sin(animTime * 14.0) * 0.14;
      parts.torso.rotation.x = 0.48 + jolt * 0.3;
      parts.leftLeg.rotation.x = -0.35 + jolt;
      parts.rightLeg.rotation.x = 0.35 - jolt;
      parts.leftArm.rotation.set(-1.25 + jolt, -0.3, 0.2);
      parts.rightArm.rotation.set(-1.25 - jolt, 0.3, -0.2);
    } else if (player.state === 'CATCHING') {
      parts.leftArm.rotation.set(-2.5, -0.2, -0.2);
      parts.rightArm.rotation.set(-2.5, 0.2, 0.2);
      parts.torso.position.y = 1.65;
    } else if (player.state === 'CELEBRATING') {
      parts.leftArm.rotation.set(-2.85, 0, -0.35);
      parts.rightArm.rotation.set(-2.85, 0, 0.35);
      parts.torso.position.y = 1.45 + Math.abs(Math.sin(animTime * 8)) * 0.38;
    } else if (player.state === 'TACKLED') {
      parts.torso.rotation.z = 1.4;
      parts.torso.rotation.x = 0.3;
      parts.torso.position.y = 0.32;
      parts.leftLeg.rotation.x = 0.2;
      parts.rightLeg.rotation.x = -0.2;
    } else {
      parts.leftLeg.rotation.x = 0.05;
      parts.rightLeg.rotation.x = -0.05;
      parts.leftArm.rotation.set(-0.2, 0, 0);
      parts.rightArm.rotation.set(-0.2, 0, 0);
      parts.torso.rotation.x = player.role === 'OL' || player.role === 'DL' ? 0.62 : 0.06;
      parts.torso.position.y = player.role === 'OL' || player.role === 'DL' ? 1.04 : 1.35;
    }

    const root = parts.torso.parent;
    if (
      root?.userData.athlete &&
      !moveActive &&
      (running || player.state === 'THROWING' || player.state === 'CATCHING')
    ) {
      const clip = running ? mocapClips.run : player.state === 'THROWING' ? mocapClips.throw : mocapClips.catch;
      const time = running
        ? (t / (Math.PI * 2)) * clip.duration
        : Math.min(clip.duration, animTime - (gait.stateTime ?? animTime));
      const index = Math.min(clip.frames.length - 1, time * clip.fps);
      const a = Math.floor(index);
      const b = Math.min(a + 1, clip.frames.length - 1);
      const targets = [
        parts.leftArm,
        parts.leftArm.getObjectByName('elbow'),
        parts.rightArm,
        parts.rightArm.getObjectByName('elbow'),
        parts.leftLeg,
        parts.leftLeg.getObjectByName('knee'),
        parts.rightLeg,
        parts.rightLeg.getObjectByName('knee'),
      ];
      targets.forEach((joint, i) => {
        if (!joint || (running && player.hasBall && i < 4) || (!running && i >= 4)) return;
        const qa = new THREE.Quaternion().fromArray(clip.frames[a][i]);
        const qb = new THREE.Quaternion().fromArray(clip.frames[b][i]);
        joint.quaternion.slerpQuaternions(qa, qb, index - a);
      });
    }

    const blend = 1 - Math.exp(-22 * dt);
    joints.forEach((joint, i) => joint.quaternion.slerpQuaternions(previous[i], joint.quaternion.clone(), blend));
    parts.torso.position.y = THREE.MathUtils.lerp(previousY, parts.torso.position.y, blend);

    if (parts.targetRing) {
      parts.targetRing.visible = showSeparationRing && !player.hasBall;
      const ringMat = parts.targetRing.material as THREE.MeshBasicMaterial;
      if (isOpen) {
        ringMat.color.setHex(0x10b981);
        parts.targetRing.scale.setScalar(1.0 + Math.sin(animTime * 6) * 0.12);
      } else {
        ringMat.color.setHex(0xc084fc);
        parts.targetRing.scale.setScalar(1.0);
      }
    }

    if (parts.userRing) {
      parts.userRing.visible = !!player.isUserControlled;
      if (player.isUserControlled) {
        const mat = parts.userRing.material as THREE.MeshBasicMaterial;
        mat.color.setHex(player.isOnFire ? 0xff5500 : player.team === 'OFFENSE' ? 0xffbf00 : 0x00daf3);
        parts.userRing.scale.setScalar(1.0 + Math.sin(animTime * 9) * 0.08);
      }
    }

    if (parts.fireAura) {
      parts.fireAura.visible = !!player.isOnFire;
      if (player.isOnFire) {
        parts.fireAura.rotation.y = animTime * 7.5;
        const pulse = 0.92 + Math.sin(animTime * 22) * 0.14;
        parts.fireAura.scale.set(pulse, 1.0 + Math.sin(animTime * 18) * 0.12, pulse);
      }
    }
  }
}
