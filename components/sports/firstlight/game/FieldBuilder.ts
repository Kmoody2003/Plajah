import { applyGrassPBR } from './PhotographicMaterials';
import { StadiumCrowd } from './StadiumCrowd';
import { buildStadiumArchitecture } from './StadiumArchitecture';
import * as THREE from 'three';
import { FIELD, TEAMS } from './constants';
import { WeatherPreset } from '../types';

export class FieldBuilder {
  public fieldMesh!: THREE.Mesh;
  public lineOfScrimmageMesh!: THREE.Mesh;
  public firstDownMesh!: THREE.Mesh;
  public pocketBoxMesh!: THREE.Group;
  public receiverTargetIndicators: Map<string, THREE.Group> = new Map();
  public catchPointChevron!: THREE.Group;
  public stadiumGroup: THREE.Group = new THREE.Group();
  public weatherParticles: THREE.Points | null = null;
  public jumbotrons: THREE.Mesh[] = [];
  public jumbotronCanvases: HTMLCanvasElement[] = [];

  // Living Stadium Systems
  private humanCrowd!: StadiumCrowd;
  private crowdCount: number = 2400;
  private crowdBasePositions: THREE.Vector3[] = [];
  private crowdJumpOffsets: number[] = [];
  private flashSprites: THREE.Sprite[] = [];
  private ribbonCanvas!: HTMLCanvasElement;
  private ribbonTexture!: THREE.CanvasTexture;
  private ribbonMeshL!: THREE.Mesh;
  private ribbonMeshR!: THREE.Mesh;
  private ribbonScroll: number = 0;
  private fireworksParticles: THREE.Points | null = null;
  private fireworksLife: number = 0;

  // Material references for weather updates
  private turfMaterial!: THREE.MeshStandardMaterial;
  private floodlights: THREE.SpotLight[] = [];

  // Animated Northern Lights / Aurora Borealis Wave Curtains
  private auroraMeshes: THREE.Mesh[] = [];
  private auroraMaterials: THREE.ShaderMaterial[] = [];

  public buildField(scene: THREE.Scene): void {
    // 0. Realistic Twilight Stadium Sky Dome
    this.buildSkyDome(scene);

    // 1. Generate High-Res Procedural Turf Texture
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 4096;
    const ctx = canvas.getContext('2d')!;

    // Base field grass
    ctx.fillStyle = '#1b5428';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mowing stripes every 5 yards (24 stripes total for 120 yards) with realistic turf sheen
    const stripeHeight = canvas.height / 24;
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#38703c' : '#326337';
      ctx.fillRect(0, i * stripeHeight, canvas.width, stripeHeight);

      // Micro grass fiber texture pattern
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      for (let s = 0; s < 4; s++) {
        ctx.fillRect(0, i * stripeHeight + s * (stripeHeight / 4), canvas.width, 2);
      }
    }

    // Seeded grass blade albedo: never regenerated per frame.
    let grassSeed=4817;
    for(let i=0;i<180000;i++) {
      grassSeed=(Math.imul(grassSeed,1664525)+1013904223)>>>0;
      const x=grassSeed%2048; const y=(grassSeed>>>11)%4096;
      ctx.fillStyle=i%3?'rgba(8,28,5,.11)':'rgba(156,177,77,.13)';
      ctx.fillRect(x,y,1,2+(i%4));
    }
    // End Zones: Top (y=0, Z=-50) is Aurora (Home End Zone behind offense)
    // Bottom (y=canvas.height, Z=+50) is Current (Opponent End Zone that offense is attacking)
    const homeGrad = ctx.createLinearGradient(0, 0, 0, stripeHeight * 2);
    homeGrad.addColorStop(0, '#3b0764');
    homeGrad.addColorStop(1, '#581c87');
    ctx.fillStyle = homeGrad;
    ctx.fillRect(0, 0, canvas.width, stripeHeight * 2);

    const awayGrad = ctx.createLinearGradient(0, canvas.height - stripeHeight * 2, 0, canvas.height);
    awayGrad.addColorStop(0, '#0e7490');
    awayGrad.addColorStop(1, '#155e75');
    ctx.fillStyle = awayGrad;
    ctx.fillRect(0, canvas.height - stripeHeight * 2, canvas.width, stripeHeight * 2);

    // Text in End Zones
    ctx.save();
    ctx.font = 'bold 150px "Teko", "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '12px';

    // Aurora text in Home End Zone (Top)
    ctx.fillStyle = '#f5d0fe';
    ctx.shadowColor = '#9333ea';
    ctx.shadowBlur = 25;
    ctx.fillText('AURORA', canvas.width / 2, stripeHeight);

    // Current text in Opponent End Zone (Bottom)
    ctx.fillStyle = '#a5f3fc';
    ctx.shadowColor = '#0891b2';
    ctx.shadowBlur = 25;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height - stripeHeight);
    ctx.rotate(Math.PI);
    ctx.fillText('CURRENT', 0, 0);
    ctx.restore();
    ctx.restore();

    // Field Boundary Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

    // Goal lines
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(30, stripeHeight * 2);
    ctx.lineTo(canvas.width - 30, stripeHeight * 2);
    ctx.moveTo(30, canvas.height - stripeHeight * 2);
    ctx.lineTo(canvas.width - 30, canvas.height - stripeHeight * 2);
    ctx.stroke();

    // 5-yard lines and 10-yard numbers
    ctx.lineWidth = 10;
    const playAreaStart = stripeHeight * 2;
    const playAreaHeight = canvas.height - stripeHeight * 4;
    const yardHeight = playAreaHeight / 100;

    for (let y = 5; y <= 95; y += 5) {
      const lineY = playAreaStart + y * yardHeight;
      const isTenYard = y % 10 === 0;

      ctx.beginPath();
      ctx.lineWidth = isTenYard ? 12 : 7;
      ctx.moveTo(60, lineY);
      ctx.lineTo(canvas.width - 60, lineY);
      ctx.stroke();

      // Hash marks
      for (let sub = 1; sub <= 4; sub++) {
        if (y + sub < 100) {
          const subY = lineY + sub * yardHeight;
          ctx.lineWidth = 5;
          ctx.strokeRect(70, subY - 2, 40, 4);
          ctx.strokeRect(canvas.width * (0.5 - 3.0833 / 53.3333), subY - 2, 35, 4);
          ctx.strokeRect(canvas.width * (0.5 + 3.0833 / 53.3333) - 35, subY - 2, 35, 4);
          ctx.strokeRect(canvas.width - 110, subY - 2, 40, 4);
        }
      }

      // Numbers on 10s
      if (isTenYard) {
        const yardNumber = y <= 50 ? y : 100 - y;
        const numStr = yardNumber.toString();

        ctx.save();
        ctx.font = 'bold 90px "Rajdhani", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.save();
        ctx.translate(canvas.width * 0.18, lineY);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(numStr, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.translate(canvas.width * 0.82, lineY);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(numStr, 0, 0);
        ctx.restore();

        ctx.restore();
      }
    }

    // Midfield 50 Logo: Plajah Sports
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 16;

    ctx.beginPath();
    ctx.moveTo(-120, -180);
    ctx.lineTo(100, 0);
    ctx.lineTo(-120, 180);
    ctx.lineTo(-40, 180);
    ctx.lineTo(180, 0);
    ctx.lineTo(-40, -180);
    ctx.closePath();
    ctx.stroke();

    ctx.font = 'bold 64px "Chakra Petch", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.textAlign = 'center';
    ctx.fillText('PLAJAH SPORTS', 0, 240);
    ctx.restore();

    // Convert canvas to Three.js texture
    const turfTexture = new THREE.CanvasTexture(canvas);
    turfTexture.wrapS = THREE.ClampToEdgeWrapping;
    turfTexture.wrapT = THREE.ClampToEdgeWrapping;
    turfTexture.anisotropy = 8;
    turfTexture.colorSpace = THREE.SRGBColorSpace;

    const micro = document.createElement('canvas'); micro.width = micro.height = 256;
    const mc = micro.getContext('2d')!;
    let seed = 7123;
    for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
      seed = (Math.imul(seed,1664525)+1013904223)>>>0;
      const v=80+(seed>>>24)%130; mc.fillStyle = 'rgb('+v+','+v+','+v+')'; mc.fillRect(x,y,1,1);
    }
    const bump = new THREE.CanvasTexture(micro); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(90,200);
    this.turfMaterial = new THREE.MeshStandardMaterial({
      color: 0x779977, bumpMap: bump, bumpScale: .035,
      map: turfTexture,
      roughness: 0.94,
      metalness: 0,
    });

    applyGrassPBR(this.turfMaterial);
    const fieldGeom = new THREE.PlaneGeometry(FIELD.WIDTH, FIELD.LENGTH);
    this.fieldMesh = new THREE.Mesh(fieldGeom, this.turfMaterial);
    this.fieldMesh.rotation.x = -Math.PI / 2;
    this.fieldMesh.receiveShadow = true;
    scene.add(this.fieldMesh);

    // 2. Line of Scrimmage (Electric Neon Cyan)
    const losGeom = new THREE.PlaneGeometry(FIELD.WIDTH - 1.0, 0.45);
    const losMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    this.lineOfScrimmageMesh = new THREE.Mesh(losGeom, losMat);
    this.lineOfScrimmageMesh.rotation.x = -Math.PI / 2;
    this.lineOfScrimmageMesh.position.y = 0.05;
    scene.add(this.lineOfScrimmageMesh);

    // 3. First Down Line (Electric Neon Yellow)
    const fdGeom = new THREE.PlaneGeometry(FIELD.WIDTH - 1.0, 0.45);
    const fdMat = new THREE.MeshBasicMaterial({
      color: 0xffe600,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    this.firstDownMesh = new THREE.Mesh(fdGeom, fdMat);
    this.firstDownMesh.rotation.x = -Math.PI / 2;
    this.firstDownMesh.position.y = 0.05;
    scene.add(this.firstDownMesh);

    // 4. Glowing 3D Pocket Box
    this.pocketBoxMesh = new THREE.Group();
    const pocketWidthFront = 12.0;
    const pocketWidthBack = 9.0;
    const pocketDepth = 7.5;

    const pocketPts = [
      new THREE.Vector3(-pocketWidthBack / 2, 0.08, -pocketDepth),
      new THREE.Vector3(pocketWidthBack / 2, 0.08, -pocketDepth),
      new THREE.Vector3(pocketWidthFront / 2, 0.08, 0.2),
      new THREE.Vector3(-pocketWidthFront / 2, 0.08, 0.2),
      new THREE.Vector3(-pocketWidthBack / 2, 0.08, -pocketDepth),
    ];
    const pocketLineGeom = new THREE.BufferGeometry().setFromPoints(pocketPts);
    const pocketLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });
    const pocketOutline = new THREE.Line(pocketLineGeom, pocketLineMat);
    this.pocketBoxMesh.add(pocketOutline);

    const pocketShape = new THREE.Shape();
    pocketShape.moveTo(-pocketWidthBack / 2, -pocketDepth);
    pocketShape.lineTo(pocketWidthBack / 2, -pocketDepth);
    pocketShape.lineTo(pocketWidthFront / 2, 0.2);
    pocketShape.lineTo(-pocketWidthFront / 2, 0.2);
    pocketShape.closePath();
    const pocketFillGeom = new THREE.ShapeGeometry(pocketShape);
    const pocketFillMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    });
    const pocketFill = new THREE.Mesh(pocketFillGeom, pocketFillMat);
    pocketFill.rotation.x = -Math.PI / 2;
    pocketFill.position.y = 0.06;
    this.pocketBoxMesh.add(pocketFill);
    scene.add(this.pocketBoxMesh);

    // 5. Catch Point Indicator Chevron
    this.catchPointChevron = new THREE.Group();
    const chevronGeom = new THREE.ConeGeometry(0.5, 0.8, 4);
    const chevronMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const chevronMesh = new THREE.Mesh(chevronGeom, chevronMat);
    chevronMesh.rotation.x = Math.PI;
    this.catchPointChevron.add(chevronMesh);
    this.catchPointChevron.visible = false;
    scene.add(this.catchPointChevron);

    // 6. Goalposts & Pylons
    this.buildGoalposts(scene);
    this.buildPylons(scene);

    // 7. Stadium Infrastructure (Living crowd, LED ribbons, floodlight towers, lens flares)
    this.buildStadium(scene);
  }

  private buildSkyDome(scene: THREE.Scene): void {
    const skyGeom = new THREE.SphereGeometry(180, 32, 16);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d')!;

    const grad = skyCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#020617'); // Dark night sky
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(0.85, '#1e1b4b'); // Horizon twilight stadium haze
    grad.addColorStop(1, '#3b0764');
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 512, 512);

    // Starfield twinkle
    skyCtx.fillStyle = '#ffffff';
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 260;
      const r = Math.random() * 1.5;
      skyCtx.beginPath();
      skyCtx.arc(x, y, r, 0, Math.PI * 2);
      skyCtx.fill();
    }

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
    });
    const skyMesh = new THREE.Mesh(skyGeom, skyMat);
    scene.add(skyMesh);

    // 0b. Dynamic Animated Northern Lights / Aurora Borealis Wave Curtains
    this.buildAuroraCurtains(scene);
  }

  private buildAuroraCurtains(scene: THREE.Scene): void {
    const vertexShader = `
      uniform float uTime;
      uniform float uSpeed;
      uniform float uWaveScale;
      varying vec2 vUv;
      varying float vDisplacement;

      void main() {
        vUv = uv;
        vec3 pos = position;
        float wave1 = sin(pos.x * 0.025 + uTime * uSpeed) * 10.0;
        float wave2 = cos(pos.x * 0.055 - uTime * (uSpeed * 1.25)) * 5.5;
        float wave3 = sin((pos.x * 0.08 + pos.y * 0.04) + uTime * (uSpeed * 0.7)) * 3.5;
        float wave4 = sin(pos.x * 0.12 - uTime * (uSpeed * 1.6)) * 2.0;
        float totalWave = (wave1 + wave2 + wave3 + wave4) * uWaveScale;

        // Realistic folding curtain displacement
        pos.z += totalWave * (0.6 + sin(uv.y * 3.14159265) * 0.65);
        pos.y += (sin(pos.x * 0.03 + uTime * (uSpeed * 0.8)) * 4.0) * (1.0 - uv.y * 0.3);
        vDisplacement = totalWave / 14.0;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform float uSpeed;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      uniform vec3 uColorD;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vDisplacement;

      void main() {
        // Vertical arch fade at top and bottom of ribbon
        float verticalFade = sin(vUv.y * 3.14159265);
        verticalFade = pow(verticalFade, 1.25);

        // High frequency vertical ray/filament striations typical of polar auroras
        float ray1 = sin(vUv.x * 55.0 + uTime * (uSpeed * 1.5) + vDisplacement * 4.0) * 0.22 + 0.78;
        float ray2 = sin(vUv.x * 110.0 - uTime * (uSpeed * 2.2)) * 0.15 + 0.85;
        float ray3 = sin(vUv.x * 22.0 + uTime * (uSpeed * 0.6)) * 0.18 + 0.82;
        float rays = ray1 * ray2 * ray3;

        // Luminous color interpolation with signature Plajah brand palette
        float t = clamp(vUv.y + vDisplacement * 0.2, 0.0, 1.0);
        vec3 col;
        if (t < 0.28) {
          col = mix(uColorA, uColorB, t / 0.28);
        } else if (t < 0.68) {
          col = mix(uColorB, uColorC, (t - 0.28) / 0.40);
        } else {
          col = mix(uColorC, uColorD, (t - 0.68) / 0.32);
        }

        gl_FragColor = vec4(col, verticalFade * rays * uOpacity);
      }
    `;

    const layers = [
      // Downfield / Northern sky (visible straight ahead during gameplay looking downfield)
      {
        y: 62, z: 70, rotY: -0.15, width: 260, height: 48,
        colorA: new THREE.Color('#00daf3'),
        colorB: new THREE.Color('#6b0099'),
        colorC: new THREE.Color('#d40055'),
        colorD: new THREE.Color('#ff8c00'),
        speed: 0.40, waveScale: 1.2, opacity: 0.90
      },
      {
        y: 55, z: 95, rotY: 0.18, width: 280, height: 44,
        colorA: new THREE.Color('#06d6a0'),
        colorB: new THREE.Color('#9333ea'),
        colorC: new THREE.Color('#ec4899'),
        colorD: new THREE.Color('#fbbf24'),
        speed: 0.30, waveScale: 1.35, opacity: 0.82
      },
      {
        y: 72, z: 125, rotY: -0.05, width: 300, height: 54,
        colorA: new THREE.Color('#00daf3'),
        colorB: new THREE.Color('#581c87'),
        colorC: new THREE.Color('#c026d3'),
        colorD: new THREE.Color('#ff8c00'),
        speed: 0.22, waveScale: 1.0, opacity: 0.70
      },
      // Backfield / Southern sky (visible behind QB and during sweep camera angles)
      {
        y: 64, z: -70, rotY: 0.15, width: 240, height: 48,
        colorA: new THREE.Color('#00daf3'),
        colorB: new THREE.Color('#6b0099'),
        colorC: new THREE.Color('#d40055'),
        colorD: new THREE.Color('#ff8c00'),
        speed: 0.42, waveScale: 1.15, opacity: 0.85
      },
      {
        y: 58, z: -95, rotY: -0.22, width: 260, height: 42,
        colorA: new THREE.Color('#06d6a0'),
        colorB: new THREE.Color('#9333ea'),
        colorC: new THREE.Color('#ec4899'),
        colorD: new THREE.Color('#fbbf24'),
        speed: 0.32, waveScale: 1.3, opacity: 0.75
      },
      // Sideline Arching Ribbon
      {
        y: 68, z: 5, rotY: Math.PI / 2 + 0.1, width: 250, height: 46,
        colorA: new THREE.Color('#00daf3'),
        colorB: new THREE.Color('#7c3aed'),
        colorC: new THREE.Color('#d40055'),
        colorD: new THREE.Color('#ff8c00'),
        speed: 0.28, waveScale: 1.1, opacity: 0.65
      }
    ];

    layers.forEach((layer) => {
      const geom = new THREE.PlaneGeometry(layer.width, layer.height, 80, 20);
      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: layer.speed },
          uWaveScale: { value: layer.waveScale },
          uColorA: { value: layer.colorA },
          uColorB: { value: layer.colorB },
          uColorC: { value: layer.colorC },
          uColorD: { value: layer.colorD },
          uOpacity: { value: layer.opacity }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(0, layer.y, layer.z);
      mesh.rotation.y = layer.rotY;
      scene.add(mesh);

      this.auroraMeshes.push(mesh);
      this.auroraMaterials.push(mat);
    });
  }

  public updateAurora(animTime: number): void {
    for (let i = 0; i < this.auroraMaterials.length; i++) {
      this.auroraMaterials[i].uniforms.uTime.value = animTime;
    }
  }

  public updateLines(scrimmageZ: number, firstDownZ: number): void {
    this.lineOfScrimmageMesh.position.z = scrimmageZ;
    this.firstDownMesh.position.z = firstDownZ;
    this.pocketBoxMesh.position.z = scrimmageZ;
  }

  public setPocketIntegrity(ratio: number): void {
    const lineMat = (this.pocketBoxMesh.children[0] as THREE.Line).material as THREE.LineBasicMaterial;
    if (ratio < 0.3) {
      lineMat.color.setHex(0xef4444);
    } else if (ratio < 0.6) {
      lineMat.color.setHex(0xf59e0b);
    } else {
      lineMat.color.setHex(0x38bdf8);
    }
  }

  private buildGoalposts(scene: THREE.Scene): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.3,
      metalness: 0.4,
    });
    const padMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.7,
    });

    const endZonesZ = [-60, 60];
    endZonesZ.forEach((z) => {
      const group = new THREE.Group();
      group.position.set(0, 0, z);

      const basePost = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4.0, 16), postMat);
      basePost.position.set(0, 2.0, z > 0 ? 1.5 : -1.5);
      group.add(basePost);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 2.2, 16), padMat);
      pad.position.set(0, 1.1, z > 0 ? 1.5 : -1.5);
      group.add(pad);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.2, 16), postMat);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, 3.5, z > 0 ? 0.5 : -0.5);
      group.add(arm);

      const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6.16, 16), postMat);
      crossbar.rotation.z = Math.PI / 2;
      crossbar.position.set(0, 3.33, 0);
      group.add(crossbar);

      const uprightL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 10.0, 16), postMat);
      uprightL.position.set(-3.08, 8.33, 0);
      group.add(uprightL);

      const uprightR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 10.0, 16), postMat);
      uprightR.position.set(3.08, 8.33, 0);
      group.add(uprightR);

      scene.add(group);
    });
  }

  private buildPylons(scene: THREE.Scene): void {
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.5,
    });
    const pylonGeom = new THREE.BoxGeometry(0.25, 0.65, 0.25);

    const xCoords = [-FIELD.WIDTH / 2, FIELD.WIDTH / 2];
    const zCoords = [-60, -50, 50, 60];

    xCoords.forEach((x) => {
      zCoords.forEach((z) => {
        const pylon = new THREE.Mesh(pylonGeom, pylonMat);
        pylon.position.set(x, 0.32, z);
        scene.add(pylon);
      });
    });
  }

  private buildStadium(scene: THREE.Scene): void {
    this.stadiumGroup = new THREE.Group();

    this.crowdBasePositions = buildStadiumArchitecture(this.stadiumGroup);
    this.crowdCount = this.crowdBasePositions.length;
    // 2. Living 3D Animated Crowd (2,400 instanced spectators)
    this.buildLivingCrowd();

    // 3. Animated Stadium LED Ribbon Boards (Mezzanine Ticker)
    this.buildLEDRibbons();

    /* Legacy canopy replaced by the structural bowl roof.
    // 4. Stadium Canopy / Roof Arch
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.8,
      roughness: 0.2,
    });
    [-1, 1].forEach((side) => {
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(18.0, 1.2, FIELD.LENGTH + 40),
        canopyMat
      );
      canopy.position.set(side * (FIELD.WIDTH / 2 + 20), 20.0, 0);
      canopy.rotation.z = side * 0.15;
      this.stadiumGroup.add(canopy);
    });

    */
    // 5. Floodlight Towers (4 main corners) + Photo-Realistic Lens Flares
    const towerCoords = [
      { x: -FIELD.WIDTH / 2 - 18, z: -FIELD.LENGTH / 2 - 12 },
      { x: FIELD.WIDTH / 2 + 18, z: -FIELD.LENGTH / 2 - 12 },
      { x: -FIELD.WIDTH / 2 - 18, z: FIELD.LENGTH / 2 + 12 },
      { x: FIELD.WIDTH / 2 + 18, z: FIELD.LENGTH / 2 + 12 },
    ];

    // Create lens flare texture
    const flareCanvas = document.createElement('canvas');
    flareCanvas.width = 256;
    flareCanvas.height = 256;
    const fctx = flareCanvas.getContext('2d')!;
    const fgrad = fctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    fgrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    fgrad.addColorStop(0.25, 'rgba(216, 180, 254, 0.8)');
    fgrad.addColorStop(0.6, 'rgba(147, 197, 253, 0.3)');
    fgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    fctx.fillStyle = fgrad;
    fctx.fillRect(0, 0, 256, 256);
    const flareTex = new THREE.CanvasTexture(flareCanvas);

    towerCoords.forEach((coord) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 1.4, 28, 8),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 })
      );
      pole.position.set(coord.x, 14, coord.z);
      this.stadiumGroup.add(pole);

      // Light Rack
      const rack = new THREE.Mesh(
        new THREE.BoxGeometry(6.0, 3.5, 1.0),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      rack.position.set(coord.x, 28, coord.z);
      rack.lookAt(0, 0, 0);
      this.stadiumGroup.add(rack);

      // Glow Lens Flare Billboard Sprite
      const flareMat = new THREE.SpriteMaterial({
        map: flareTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.9,
      });
      const flareSprite = new THREE.Sprite(flareMat);
      flareSprite.position.set(coord.x, 28, coord.z);
      flareSprite.scale.set(16, 16, 1);
      this.stadiumGroup.add(flareSprite);

      // SpotLight aiming at field center
      const spot = new THREE.SpotLight(0xfff5ea, 0.65);
      spot.position.set(coord.x, 28, coord.z);
      spot.target.position.set(0, 0, coord.z > 0 ? 20 : -20);
      spot.angle = Math.PI / 4;
      spot.penumbra = 0.5;
      spot.decay = 0;
      spot.castShadow = false;
      spot.shadow.mapSize.width = 1024;
      spot.shadow.mapSize.height = 1024;
      this.stadiumGroup.add(spot);
      this.stadiumGroup.add(spot.target);
      this.floodlights.push(spot);
    });

    // 6. Camera Flashes in the Stands (Random spectator strobe flashes)
    this.buildCameraFlashes();

    // 7. Massive Jumbotrons with Live Display
    [-1, 1].forEach((side, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 384;
      this.jumbotronCanvases.push(canvas);

      const texture = new THREE.CanvasTexture(canvas);
      const screenMat = new THREE.MeshBasicMaterial({ map: texture });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(28, 10.5), screenMat);

      screen.position.set(0, 18, side * (FIELD.LENGTH / 2 + 22));
      screen.rotation.y = side > 0 ? Math.PI : 0;
      this.stadiumGroup.add(screen);
      this.jumbotrons.push(screen);

      this.renderJumbotron(idx, '1ST & 10', 'BALL ON 20', 'AURORA 0 - CURRENT 0');
    });

    scene.add(this.stadiumGroup);
  }

  private buildLivingCrowd(): void {
    this.humanCrowd = new StadiumCrowd(this.crowdBasePositions);
    this.stadiumGroup.add(this.humanCrowd.group);
  }

  private buildLEDRibbons(): void {
    this.ribbonCanvas = document.createElement('canvas');
    this.ribbonCanvas.width = 2048;
    this.ribbonCanvas.height = 128;
    this.ribbonTexture = new THREE.CanvasTexture(this.ribbonCanvas);
    this.ribbonTexture.wrapS = THREE.RepeatWrapping;
    this.ribbonTexture.repeat.set(4, 1);

    const ribbonMat = new THREE.MeshBasicMaterial({
      map: this.ribbonTexture,
    });

    const ribbonGeom = new THREE.PlaneGeometry(FIELD.LENGTH + 20, 1.8);
    this.ribbonMeshL = new THREE.Mesh(ribbonGeom, ribbonMat);
    this.ribbonMeshL.position.set(-FIELD.WIDTH / 2 - 6.5, 4.0, 0);
    this.ribbonMeshL.rotation.y = Math.PI / 2;
    this.stadiumGroup.add(this.ribbonMeshL);

    this.ribbonMeshR = new THREE.Mesh(ribbonGeom, ribbonMat);
    this.ribbonMeshR.position.set(FIELD.WIDTH / 2 + 6.5, 4.0, 0);
    this.ribbonMeshR.rotation.y = -Math.PI / 2;
    this.stadiumGroup.add(this.ribbonMeshR);
  }

  private updateLEDRibbon(animTime: number): void {
    if (!this.ribbonCanvas) return;
    const ctx = this.ribbonCanvas.getContext('2d')!;
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, this.ribbonCanvas.width, this.ribbonCanvas.height);

    ctx.font = 'bold 50px "Teko", "Chakra Petch", sans-serif';
    ctx.textBaseline = 'middle';

    // Animated scrolling marquee text
    this.ribbonScroll = (this.ribbonScroll + 2.5) % this.ribbonCanvas.width;
    const text = '⚡ PLAJAH SPORTS PRIME TIME ⚡ MAKE NOISE 📣 ⚡ AURORA FOOTBALL ⚡ 3RD DOWN ALERT 🛡️ ⚡ GO AURORA! ⚡ ';

    ctx.fillStyle = '#facc15';
    ctx.shadowColor = '#eab308';
    ctx.shadowBlur = 15;
    ctx.fillText(text, -this.ribbonScroll, 64);
    ctx.fillText(text, -this.ribbonScroll + 1024, 64);
    ctx.fillText(text, -this.ribbonScroll + 2048, 64);

    this.ribbonTexture.needsUpdate = true;
  }

  private buildCameraFlashes(): void {
    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = 64;
    flashCanvas.height = 64;
    const fctx = flashCanvas.getContext('2d')!;
    const fgrad = fctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    fgrad.addColorStop(0, '#ffffff');
    fgrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.9)');
    fgrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    fctx.fillStyle = fgrad;
    fctx.fillRect(0, 0, 64, 64);
    const flashTex = new THREE.CanvasTexture(flashCanvas);

    for (let i = 0; i < 8; i++) {
      const spriteMat = new THREE.SpriteMaterial({
        map: flashTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(4, 4, 1);
      this.stadiumGroup.add(sprite);
      this.flashSprites.push(sprite);
    }
  }

  public updateCameraFlashes(): void {
    if (this.crowdBasePositions.length === 0) return;
    // Random spectator camera flashes in the stands
    this.flashSprites.forEach((sprite) => {
      if (Math.random() < 0.08) {
        // Trigger a flash
        const randIdx = Math.floor(Math.random() * this.crowdBasePositions.length);
        const pos = this.crowdBasePositions[randIdx];
        sprite.position.set(pos.x, pos.y + 0.5, pos.z);
        sprite.material.opacity = 0.95;
      } else {
        sprite.material.opacity *= 0.65;
      }
    });
  }

  public updateLivingCrowd(animTime:number, excitement=1): void {
    this.humanCrowd?.update(animTime,excitement);
  }

  public triggerTouchdownFireworks(scene: THREE.Scene): void {
    this.fireworksLife = 4.0;
    const count = 400;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Launch from behind end zone uprights
      const zLaunch = 60;
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = 6 + Math.random() * 2;
      positions[i * 3 + 2] = zLaunch + (Math.random() - 0.5) * 6;

      velocities[i * 3] = (Math.random() - 0.5) * 15;
      velocities[i * 3 + 1] = 18 + Math.random() * 12;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 15;

      colors[i * 3] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.6 + Math.random() * 0.4;
      colors[i * 3 + 2] = 0.1;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.9,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.95,
    });

    if (this.fireworksParticles) {
      scene.remove(this.fireworksParticles);
    }
    this.fireworksParticles = new THREE.Points(geom, mat);
    (this.fireworksParticles as unknown as { vel: Float32Array }).vel = velocities;
    scene.add(this.fireworksParticles);
  }

  public updateFireworks(delta: number, scene: THREE.Scene): void {
    if (!this.fireworksParticles || this.fireworksLife <= 0) return;
    this.fireworksLife -= delta;

    if (this.fireworksLife <= 0) {
      scene.remove(this.fireworksParticles);
      this.fireworksParticles.geometry.dispose();
      this.fireworksParticles = null;
      return;
    }

    const pos = this.fireworksParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const vel = (this.fireworksParticles as unknown as { vel: Float32Array }).vel;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) + vel[i * 3] * delta);
      pos.setY(i, pos.getY(i) + vel[i * 3 + 1] * delta);
      pos.setZ(i, pos.getZ(i) + vel[i * 3 + 2] * delta);
      vel[i * 3 + 1] -= 9.8 * delta; // gravity
    }
    pos.needsUpdate = true;
    (this.fireworksParticles.material as THREE.PointsMaterial).opacity = Math.max(0, this.fireworksLife / 4.0);
  }

  public updateStadiumEffects(animTime: number, delta: number, scene: THREE.Scene, excitement: number = 1.0): void {
    this.updateAurora(animTime);
    this.updateLivingCrowd(animTime, excitement);
    this.updateCameraFlashes();
    this.updateLEDRibbon(animTime);
    this.updateFireworks(delta, scene);
  }

  public renderJumbotron(screenIdx: number, downDist: string, ballLoc: string, score: string): void {
    const canvas = this.jumbotronCanvases[screenIdx];
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Background gradient with Plajah branding
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0a0a1a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border neon glow
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Title banner
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PLAJAH SPORTS · NIGHT PRIME TIME', canvas.width / 2, 60);

    // Matchup score
    ctx.font = 'bold 56px "Rajdhani", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(score, canvas.width / 2, 160);

    // Down & Distance + Ball Location
    ctx.font = 'bold 44px "Teko", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${downDist}  |  ${ballLoc}`, canvas.width / 2, 250);

    // Bottom ticker
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '24px sans-serif';
    ctx.fillText('TARGETS: [1-4] or NUMPAD [1-4] · WASD / D-PAD TO MOVE · SPACE TO JUKE/SNAP', canvas.width / 2, 330);

    const screen = this.jumbotrons[screenIdx];
    if (screen && screen.material instanceof THREE.MeshBasicMaterial && screen.material.map) {
      screen.material.map.needsUpdate = true;
    }
  }

  public applyWeather(preset: WeatherPreset, scene: THREE.Scene): void {
    if (preset === 'RAIN') {
      this.turfMaterial.roughness = 0.35;
      scene.fog = new THREE.FogExp2(0x1e293b, 0.012);
      this.createPrecipitation(scene, 'RAIN');
    } else if (preset === 'SNOW') {
      this.turfMaterial.roughness = 0.95;
      scene.fog = new THREE.FogExp2(0xe2e8f0, 0.015);
      this.createPrecipitation(scene, 'SNOW');
    } else if (preset === 'AURORA' || preset === 'SUNSET') {
      this.turfMaterial.roughness = 0.8;
      scene.fog = new THREE.FogExp2(0x1e1b4b, 0.008);
      this.removePrecipitation(scene);
    } else {
      this.turfMaterial.roughness = 0.8;
      scene.fog = new THREE.FogExp2(0x0f172a, 0.006);
      this.removePrecipitation(scene);
    }
  }

  private createPrecipitation(scene: THREE.Scene, type: 'RAIN' | 'SNOW'): void {
    this.removePrecipitation(scene);

    const particleCount = type === 'RAIN' ? 4000 : 2500;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
      velocities[i] = type === 'RAIN' ? 35 + Math.random() * 20 : 6 + Math.random() * 4;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

    const mat = new THREE.PointsMaterial({
      color: type === 'RAIN' ? 0x93c5fd : 0xffffff,
      size: type === 'RAIN' ? 0.35 : 0.65,
      transparent: true,
      opacity: type === 'RAIN' ? 0.6 : 0.85,
    });

    this.weatherParticles = new THREE.Points(geom, mat);
    scene.add(this.weatherParticles);
  }

  public updatePrecipitation(delta: number): void {
    if (!this.weatherParticles) return;
    const posAttr = this.weatherParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const velAttr = this.weatherParticles.geometry.getAttribute('velocity') as THREE.BufferAttribute;
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      let y = posAttr.getY(i);
      const vel = velAttr.getX(i);
      y -= vel * delta;
      if (y < 0) {
        y = 40;
      }
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;
  }

  private removePrecipitation(scene: THREE.Scene): void {
    if (this.weatherParticles) {
      scene.remove(this.weatherParticles);
      this.weatherParticles.geometry.dispose();
      (this.weatherParticles.material as THREE.Material).dispose();
      this.weatherParticles = null;
    }
  }
}

