import { pbrMap } from './PhotographicMaterials';
import { mocapClips } from './MocapClips';
import { TARGET_COLORS } from './RouteOverlay';
import { surfaceTexture } from './SurfaceTextures';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import { Player3D, TeamInfo } from '../types';

export class PlayerMeshBuilder {
  // Shared materials & geometry caches for optimal 60fps performance
  private static skinMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d5524, // Rich skin tone
    roughness: 0.6,
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

      // Rich pebbled leather brown
      ctx.fillStyle = '#6e260e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // White regulation stripes at tips
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(20, 0, 16, canvas.height);
      ctx.fillRect(canvas.width - 36, 0, 16, canvas.height);

      // Central white laces
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(80, canvas.height / 2);
      ctx.lineTo(176, canvas.height / 2);
      ctx.stroke();

      // Cross stitches
      for (let x = 90; x <= 166; x += 11) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height / 2 - 16);
        ctx.lineTo(x, canvas.height / 2 + 16);
        ctx.stroke();
      }

      const texture = new THREE.CanvasTexture(canvas);
      this.footballMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap:surfaceTexture('leather'),bumpScale:.012,
        roughness: 0.55,
        metalness: 0.05,
      });
    }
    return this.footballMaterial;
  }

  public static createFootball(): THREE.Mesh {
    // Prolate spheroid football shape (elongated sphere)
    const geom = new THREE.SphereGeometry(0.24, 16, 16);
    geom.scale(1.0, 1.0, 1.7); // elongate along Z
    const mesh = new THREE.Mesh(geom, this.getFootballMaterial());
    mesh.castShadow = true;
    return mesh;
  }

  public static disposePlayer(root: THREE.Group): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const shared = new Set([this.skinMaterial, this.whiteMaterial, this.blackMaterial, this.footballMaterial]);
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => {
        if (!shared.has(m as THREE.MeshStandardMaterial)) materials.add(m);
      });
    });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      m.dispose();
    });
  }

  public static createPlayerGroup(player: Player3D, team: TeamInfo, mode: 'BLOCK' | 'ATHLETE' = 'BLOCK'): {
    root: THREE.Group;
    torso: THREE.Mesh;
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
    head: THREE.Group;
    ballMesh?: THREE.Mesh;
    targetRing?: THREE.Mesh;
    badgeSprite?: THREE.Sprite;
  } {
    const skin = this.skinMaterial.clone();
    const tones=['#d6a581','#ad7756','#704c37','#c08a66','#513829'];
    skin.color.set(tones[player.number%tones.length]);skin.roughness=.68;skin.metalness=0;
    skin.bumpMap=surfaceTexture('leather');skin.bumpScale=.0012;
    const root = new THREE.Group();
    root.position.set(player.x, player.y, player.z);

    // Dynamic jersey material with stripes and number canvas
    const jerseyCanvas = document.createElement('canvas');
    jerseyCanvas.width = 128;
    jerseyCanvas.height = 128;
    const jCtx = jerseyCanvas.getContext('2d')!;

    // Base jersey color
    jCtx.fillStyle = team.primaryColor;
    jCtx.fillRect(0, 0, 128, 128);

    // Contrasting team shoulder/sleeve stripes
    jCtx.fillStyle = player.team === 'OFFENSE' ? team.secondaryColor : '#0f172a';
    jCtx.fillRect(0, 0, 128, 28);
    jCtx.fillRect(0, 108, 128, 20);

    // Number on chest & back
    jCtx.fillStyle = team.textColor;
    jCtx.font = 'bold 54px "Rajdhani", sans-serif';
    jCtx.textAlign = 'center';
    jCtx.textBaseline = 'middle';
    jCtx.fillText(player.number.toString(), 64, 68);

    const jerseyTexture = new THREE.CanvasTexture(jerseyCanvas); jerseyTexture.colorSpace = THREE.SRGBColorSpace;
    const jerseyMat = new THREE.MeshStandardMaterial({
      map: jerseyTexture,
      normalMap:pbrMap('fabric','NormalGL'),normalScale:new THREE.Vector2(.25,.25),
      roughnessMap:pbrMap('fabric','Roughness'),
      roughness: 0.92,
      metalness: 0,
    });

    const helmetMat = new THREE.MeshPhysicalMaterial({
      clearcoat:1,clearcoatRoughness:.2,
      color: new THREE.Color(team.helmetColor),
      roughness: 0.34,
      metalness: 0,
    });

    // Aurora pants: crisp white with purple stripe; Current pants: dark navy
    const pantsMat = new THREE.MeshStandardMaterial({
      color: player.team === 'OFFENSE' ? new THREE.Color(0xf8fafc) : new THREE.Color(0x0f172a),
      roughness: 0.9,
      normalMap:pbrMap('fabric','NormalGL'),normalScale:new THREE.Vector2(.18,.18),
    });

    // 1. Torso & Shoulder pads
    const torsoGeom = mode === 'ATHLETE' ? new RoundedBoxGeometry(.78,.9,.46,3,.17) : new THREE.BoxGeometry(0.85, 0.9, 0.45);
    const torso = new THREE.Mesh(torsoGeom, jerseyMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    root.add(torso);

    // Shoulder Pads (flared athletic shape)
    const padGeom = mode === 'ATHLETE' ? new RoundedBoxGeometry(1.12,.32,.58,3,.14) : new THREE.BoxGeometry(1.25, 0.35, 0.6);
    const shoulderPads = new THREE.Mesh(padGeom, jerseyMat);
    shoulderPads.position.set(0, 0.35, 0);
    shoulderPads.castShadow = true;
    torso.add(shoulderPads);

    // 2. Head & Helmet
    const head = new THREE.Group();
    head.position.set(0, 0.65, 0);

    // Helmet shell (sphere)
    const helmetGeom = new THREE.SphereGeometry(0.28, 16, 16);
    const helmet = new THREE.Mesh(helmetGeom, helmetMat);
    helmet.castShadow = true;
    head.add(helmet);

    // Visor
    const visorGeom = new THREE.CylinderGeometry(0.26, 0.26, 0.14, 16, 1, false, 0, Math.PI);
    const visorMat = new THREE.MeshStandardMaterial({
      color: team.visorColor ? new THREE.Color(team.visorColor) : 0x111827,
      roughness: 0.1,
      metalness: 0.9,
    });
    const visor = new THREE.Mesh(visorGeom, visorMat);
    visor.rotation.y = Math.PI / 2;
    visor.position.set(0, 0.04, 0.06);
    head.add(visor);

    // Facemask grill
    const maskMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });
    const maskBar = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 6, 12, Math.PI * 0.8), maskMat);
    maskBar.position.set(0, -0.05, 0.04);
    maskBar.rotation.x = Math.PI / 2;
    maskBar.rotation.z = -Math.PI * 0.4;
    head.add(maskBar);

    torso.add(head);

    // 3. Arms
    const armGeom = new THREE.CylinderGeometry(0.1, 0.09, 0.65, 8);
    const gloveMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.accentColor), roughness: 0.4 });

    // Left Arm
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.58, 0.3, 0);
    const leftUpperArm = new THREE.Mesh(armGeom, skin);
    leftUpperArm.position.y = -0.3;
    leftUpperArm.castShadow = true;
    leftArm.add(leftUpperArm);
    const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), gloveMat);
    leftGlove.position.y = -0.65;
    leftArm.add(leftGlove);
    torso.add(leftArm);

    // Right Arm (Throwing / Ball holding arm)
    const rightArm = new THREE.Group();
    rightArm.position.set(0.58, 0.3, 0);
    const rightUpperArm = new THREE.Mesh(armGeom, skin);
    rightUpperArm.position.y = -0.3;
    rightUpperArm.castShadow = true;
    rightArm.add(rightUpperArm);
    const rightGlove = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), gloveMat);
    rightGlove.position.y = -0.65;
    rightArm.add(rightGlove);
    torso.add(rightArm);

    // Football in hand for QB or ballcarrier
    let ballMesh: THREE.Mesh | undefined;
    ballMesh = this.createFootball();
    ballMesh.position.set(0, -0.45, 0.22);
    ballMesh.rotation.set(0.4, 0.5, 0.3);
    ballMesh.visible = !!(player.role === 'QB' || player.hasBall);
    rightArm.add(ballMesh);

    // 4. Legs
    const legGeom = new THREE.CylinderGeometry(0.14, 0.11, 0.7, 8);
    const cleatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    // Left Leg
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.25, 0.9, 0);
    const leftPants = new THREE.Mesh(legGeom, pantsMat);
    leftPants.position.y = -0.35;
    leftPants.castShadow = true;
    leftLeg.add(leftPants);
    const leftCleat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.36), cleatMat);
    leftCleat.position.set(0, -0.75, 0.06);
    leftLeg.add(leftCleat);
    root.add(leftLeg);

    // Right Leg
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.25, 0.9, 0);
    const rightPants = new THREE.Mesh(legGeom, pantsMat);
    rightPants.position.y = -0.35;
    rightPants.castShadow = true;
    rightLeg.add(rightPants);
    const rightCleat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.36), cleatMat);
    rightCleat.position.set(0, -0.75, 0.06);
    rightLeg.add(rightCleat);
    root.add(rightLeg);

    if (mode === 'ATHLETE') {
      // Articulated lower limbs retain the existing animation interface.
      for (const arm of [leftArm,rightArm]) {
        const elbow = new THREE.Group(); elbow.name = 'elbow'; elbow.position.y = -.32;
        const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(.085,.22,4,12),skin);
        forearm.position.y = -.15; elbow.add(forearm); arm.add(elbow);
        arm.children[0].scale.y = .52; arm.children[0].position.y = -.15;
        const glove = arm.children[1]; arm.remove(glove); glove.position.y = -.34; elbow.add(glove);
      }
      for (const leg of [leftLeg,rightLeg]) {
        const knee = new THREE.Group(); knee.name='knee'; knee.position.y=-.35;
        const calf = new THREE.Mesh(new THREE.CapsuleGeometry(.105,.22,4,12),pantsMat);
        calf.position.y=-.16; knee.add(calf); leg.add(knee);
        leg.children[0].scale.y=.55; leg.children[0].position.y=-.17;
        const shoe=leg.children[1]; leg.remove(shoe); shoe.position.y=-.4; knee.add(shoe);
      }
      const face = new THREE.Mesh(new THREE.SphereGeometry(.21,16,12),skin);
      face.position.set(0,-.09,.08); head.add(face);
      for(const y of [-.08,-.16]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.44,8),maskMat);
        bar.rotation.z=Math.PI/2; bar.position.set(0,y,.29); head.add(bar);
      }
    }

    if(mode==='ATHLETE') {
      const trim=new THREE.MeshStandardMaterial({color:team.secondaryColor,roughness:.85});
      for(const [limb,side] of [[leftLeg,-1],[rightLeg,1]] as const) {
        const stripe=new THREE.Mesh(new THREE.BoxGeometry(.025,.32,.1),trim);stripe.position.set(side*.14,-.17,0);limb.add(stripe);
      }
      const belt=new THREE.Mesh(new THREE.TorusGeometry(.29,.035,6,24),new THREE.MeshStandardMaterial({color:'#202128'}));belt.rotation.x=Math.PI/2;belt.scale.x=1.2;belt.position.y=.95;root.add(belt);
      const collar=new THREE.Mesh(new THREE.TorusGeometry(.145,.025,6,20),trim);collar.rotation.x=Math.PI/2;collar.position.set(0,.45,0);torso.add(collar);
      const stripe=new THREE.Mesh(new THREE.SphereGeometry(.282,24,16,Math.PI*.48,.09),trim);head.add(stripe);
    }
    root.userData.athlete=mode==='ATHLETE';
    // 5. Overhead floating target badge for eligible pass targets
    let badgeSprite: THREE.Sprite | undefined;
    if (player.route) {
      const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;
      ctx.fillStyle='#08111e';ctx.beginPath();ctx.arc(64,64,57,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=TARGET_COLORS[Number(player.route.targetKey)-1];ctx.lineWidth=9;ctx.stroke();
      ctx.fillStyle='#ffffff';ctx.font='900 76px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(player.route.targetKey,64,67);
      const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
      badgeSprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,depthWrite:false}));
      badgeSprite.scale.setScalar(.9);badgeSprite.position.y=2.85;badgeSprite.renderOrder=20;root.add(badgeSprite);
    }

    // 6. Receiver glowing target ring on turf
    let targetRing: THREE.Mesh | undefined;
    if (player.role === 'WR' || player.route) {
      const ringGeom = new THREE.RingGeometry(0.9, 1.2, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc084fc, // Bright neon purple
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      targetRing = new THREE.Mesh(ringGeom, ringMat);
      targetRing.rotation.x = -Math.PI / 2;
      targetRing.position.set(0, 0.04, 0);
      root.add(targetRing);
    }

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
      badgeSprite,
    };
  }

  private static gait = new WeakMap<THREE.Mesh,{phase:number;time:number;state?:string;stateTime?:number}>();

  public static animatePlayer(
    parts: {
      torso: THREE.Mesh;
      leftArm: THREE.Group;
      rightArm: THREE.Group;
      leftLeg: THREE.Group;
      rightLeg: THREE.Group;
      head: THREE.Group;
      ballMesh?: THREE.Mesh;
      targetRing?: THREE.Mesh;
      badgeSprite?: THREE.Sprite;
    },
    player: Player3D,
    animTime: number,
    isOpen: boolean = false
  ): void {
    const gait=this.gait.get(parts.torso)??{phase:0,time:animTime};
    if(gait.state!==player.state){gait.state=player.state;gait.stateTime=animTime;}
    const dt=Math.max(0,Math.min(.05,animTime-gait.time));gait.time=animTime;
    const currentSpeed = Math.hypot(player.vx || 0, player.vz || 0);
    gait.phase=(gait.phase+currentSpeed*2.2*dt)%(Math.PI*2);this.gait.set(parts.torso,gait);
    const t=gait.phase;
    const joints=[parts.torso,parts.leftArm,parts.rightArm,parts.leftLeg,parts.rightLeg];
    const previous=joints.map(j=>j.quaternion.clone());const previousY=parts.torso.position.y;
    joints.forEach(j=>j.rotation.set(0,0,0));parts.torso.position.y=1.35;
    const running = player.state === 'RUNNING';
    [parts.leftLeg,parts.rightLeg].forEach((leg,i)=> {
      const knee=leg.getObjectByName('knee');
      if(knee) knee.rotation.x=running ? Math.max(0,Math.sin(t+i*Math.PI)) * 1.1 : .12;
    });
    [parts.leftArm,parts.rightArm].forEach(arm=> {
      const elbow=arm.getObjectByName('elbow'); if(elbow) elbow.rotation.x=running ? -1.1 : -.25;
    });
    // Dynamic ball mesh visibility
    if (parts.ballMesh) {
      parts.ballMesh.visible = !!player.hasBall;
    }



    if (player.state === 'RUNNING') {
      // Natural running stride scaled with speed
      const strideAmp = Math.min(0.85, 0.4 + (currentSpeed / 10.0) * 0.45);
      const legStride = Math.sin(t) * strideAmp;
      parts.leftLeg.rotation.x = legStride;
      parts.rightLeg.rotation.x = -legStride;

      parts.leftArm.rotation.x = -legStride * 0.9;
      if (!player.hasBall) {
        parts.rightArm.rotation.x = legStride * 0.9;
        parts.rightArm.rotation.z = 0;
      } else {
        // Tucked football protection against chest
        parts.rightArm.rotation.set(-1.1, 0.3, -0.4);
        parts.leftArm.rotation.set(-0.6, -0.4, 0.2); // Stiff-arm reach
      }

      // Torso forward sprint lean
      parts.torso.rotation.x = 0.28;
      parts.torso.position.y = 1.35 + Math.abs(Math.sin(t)) * 0.09;
    } else if (player.state === 'DROPBACK') {
      // QB backpedal
      const dropCycle = Math.sin(t * 0.7) * 0.45;
      parts.leftLeg.rotation.x = dropCycle;
      parts.rightLeg.rotation.x = -dropCycle;
      parts.torso.rotation.x = -0.05;

      // Hold ball high at chest in ready-to-pass pocket position
      parts.rightArm.rotation.set(-1.3, 0.4, 0.4);
      parts.leftArm.rotation.set(-1.1, -0.4, -0.2);
    } else if (player.state === 'THROWING') {
      // QB throwing arm follow-through
      parts.rightArm.rotation.x = THREE.MathUtils.lerp(parts.rightArm.rotation.x, 0.95, 0.2);
      parts.rightArm.rotation.z = -0.2;
      parts.leftArm.rotation.x = -0.7;
      parts.torso.rotation.y = -0.35;
    } else if (player.state === 'BLOCKING' || player.state === 'PASS_RUSH') {
      // Linemen engagement stance with rhythmic push-and-pull
      const jolt = Math.sin(animTime * 14.0) * 0.12;
      parts.torso.rotation.x = 0.45 + jolt * 0.3;
      parts.leftLeg.rotation.x = -0.35 + jolt;
      parts.rightLeg.rotation.x = 0.35 - jolt;
      parts.leftArm.rotation.set(-1.2 + jolt, -0.3, 0.2);
      parts.rightArm.rotation.set(-1.2 - jolt, 0.3, -0.2);
    } else if (player.state === 'CATCHING') {
      // High-point catch reach with arms extended
      parts.leftArm.rotation.set(-2.5, -0.2, -0.2);
      parts.rightArm.rotation.set(-2.5, 0.2, 0.2);
      parts.torso.position.y = 1.65; // High jump for the catch
    } else if (player.state === 'TACKLED') {
      // Grounded tackle collision
      parts.torso.rotation.z = 1.4;
      parts.torso.rotation.x = 0.3;
      parts.torso.position.y = 0.3;
      parts.leftLeg.rotation.x = 0.2;
      parts.rightLeg.rotation.x = -0.2;
    } else {
      // Idle pre-snap stance
      parts.leftLeg.rotation.x = 0.05;
      parts.rightLeg.rotation.x = -0.05;
      parts.leftArm.rotation.set(-0.2, 0, 0);
      parts.rightArm.rotation.set(-0.2, 0, 0);
      parts.torso.rotation.x = player.role === 'OL' || player.role === 'DL' ? 0.6 : 0.05;
      parts.torso.position.y = player.role === 'OL' || player.role === 'DL' ? 1.05 : 1.35;
    }

    const root=parts.torso.parent;
    if(root?.userData.athlete && (running||player.state==='THROWING'||player.state==='CATCHING')) {
      const clip=running?mocapClips.run:player.state==='THROWING'?mocapClips.throw:mocapClips.catch;
      const time=running?(t/(Math.PI*2))*clip.duration:Math.min(clip.duration,animTime-(gait.stateTime??animTime));
      const index=Math.min(clip.frames.length-1,time*clip.fps),a=Math.floor(index),b=Math.min(a+1,clip.frames.length-1);
      const targets=[parts.leftArm,parts.leftArm.getObjectByName('elbow'),parts.rightArm,parts.rightArm.getObjectByName('elbow'),parts.leftLeg,parts.leftLeg.getObjectByName('knee'),parts.rightLeg,parts.rightLeg.getObjectByName('knee')];
      targets.forEach((joint,i)=>{
        if(!joint || (running&&player.hasBall&&i<4) || (!running&&i>=4))return;
        const qa=new THREE.Quaternion().fromArray(clip.frames[a][i]),qb=new THREE.Quaternion().fromArray(clip.frames[b][i]);
        joint.quaternion.slerpQuaternions(qa,qb,index-a);
      });
    }
    const blend=1-Math.exp(-22*dt);
    joints.forEach((joint,i)=>joint.quaternion.slerpQuaternions(previous[i],joint.quaternion.clone(),blend));
    parts.torso.position.y=THREE.MathUtils.lerp(previousY,parts.torso.position.y,blend);
    // Receiver target ring styling
    if (parts.targetRing) {
      const ringMat = parts.targetRing.material as THREE.MeshBasicMaterial;
      if (isOpen) {
        ringMat.color.setHex(0x10b981); // Emerald Open!
        parts.targetRing.scale.setScalar(1.0 + Math.sin(animTime * 6) * 0.12);
      } else {
        ringMat.color.setHex(0xc084fc); // Purple route ring
        parts.targetRing.scale.setScalar(1.0);
      }
    }
  }
}
