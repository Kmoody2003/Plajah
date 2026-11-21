import { applyGrassPBR } from './PhotographicMaterials';
import { StadiumCrowd } from './StadiumCrowd';
import { buildProStadium } from './StadiumArchitecture';
import * as THREE from 'three';
import { FIELD } from './constants';
import { PlayStyleMode, TeamInfo, WeatherPreset } from '../types';
import { SOL_TEAMS } from './leagueData';

interface ShockwaveRing {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
}

export class FieldBuilder {
  public fieldMesh!: THREE.Mesh;
  public lineOfScrimmageMesh!: THREE.Mesh;
  public firstDownMesh!: THREE.Mesh;
  public pocketBoxMesh!: THREE.Group;
  public receiverTargetIndicators: Map<string, THREE.Group> = new Map();
  public catchPointChevron!: THREE.Group;
  public ballLandingMarker!: THREE.Group;
  public stadiumGroup: THREE.Group = new THREE.Group();
  public weatherParticles: THREE.Points | null = null;
  public jumbotrons: THREE.Mesh[] = [];
  public jumbotronCanvases: HTMLCanvasElement[] = [];

  // Dynamic Chain Crew & Down Box Marker along the sideline
  private downBoxGroup!: THREE.Group;
  private chainPostGroup!: THREE.Group;
  private downBoxCanvas!: HTMLCanvasElement;
  private downBoxTexture!: THREE.CanvasTexture;

  // Living Stadium Systems
  private humanCrowd!: StadiumCrowd;
  private crowdCount: number = 2400;
  private crowdBasePositions: THREE.Vector3[] = [];
  private stadiumAccentMats: THREE.MeshBasicMaterial[] = [];
  private flashSprites: THREE.Sprite[] = [];
  private ribbonCanvas!: HTMLCanvasElement;
  private ribbonTexture!: THREE.CanvasTexture;
  private ribbonMeshL!: THREE.Mesh;
  private ribbonMeshR!: THREE.Mesh;
  private ribbonScroll: number = 0;
  private ribbonTickerText: string = '⚡ SOL GRIDIRON LEAGUE · PLAJAH SPORTS PRIME TIME · MAKE NOISE! ⚡ ';
  private fireworksParticles: THREE.Points | null = null;
  private fireworksLife: number = 0;
  private shockwaves: ShockwaveRing[] = [];

  // Material references for weather & matchup updates
  private turfMaterial!: THREE.MeshStandardMaterial;
  private turfTexture: THREE.CanvasTexture | null = null;
  private floodlights: THREE.SpotLight[] = [];
  private skyMesh!: THREE.Mesh;
  private sceneRef: THREE.Scene | null = null;

  // Animated Northern Lights / Aurora Borealis Wave Curtains
  private auroraMeshes: THREE.Mesh[] = [];
  private auroraMaterials: THREE.ShaderMaterial[] = [];

  public buildField(
    scene: THREE.Scene,
    homeTeam: TeamInfo = SOL_TEAMS.AURORA,
    awayTeam: TeamInfo = SOL_TEAMS.CURRENT,
    playStyle: PlayStyleMode = 'SIMULATION'
  ): void {
    this.sceneRef = scene;

    // 0. Realistic Stadium Sky Dome + Aurora Curtains
    this.buildSkyDome(scene);

    // 1. Dynamic Matchup Turf Texture + PBR Grass Shader
    this.turfTexture = this.generateTurfTexture(homeTeam, awayTeam, playStyle);

    this.turfMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.turfTexture,
      roughness: 0.92,
      metalness: 0,
    });

    applyGrassPBR(this.turfMaterial);
    const fieldGeom = new THREE.PlaneGeometry(FIELD.WIDTH, FIELD.LENGTH);
    this.fieldMesh = new THREE.Mesh(fieldGeom, this.turfMaterial);
    this.fieldMesh.rotation.x = -Math.PI / 2;
    this.fieldMesh.receiveShadow = true;
    scene.add(this.fieldMesh);

    // 2. Line of Scrimmage (Broadcast Electric Blue/Cyan)
    const losGeom = new THREE.PlaneGeometry(FIELD.WIDTH - 0.8, 0.42);
    const losMat = new THREE.MeshBasicMaterial({
      color: 0x00daf3,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    this.lineOfScrimmageMesh = new THREE.Mesh(losGeom, losMat);
    this.lineOfScrimmageMesh.rotation.x = -Math.PI / 2;
    this.lineOfScrimmageMesh.position.y = 0.05;
    scene.add(this.lineOfScrimmageMesh);

    // 3. First Down Line (NFL Broadcast Amber Gold)
    const fdGeom = new THREE.PlaneGeometry(FIELD.WIDTH - 0.8, 0.48);
    const fdMat = new THREE.MeshBasicMaterial({
      color: 0xffbf00,
      transparent: true,
      opacity: 0.96,
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
      transparent: true,
      opacity: 0.78,
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
      opacity: 0.14,
      side: THREE.DoubleSide,
    });
    const pocketFill = new THREE.Mesh(pocketFillGeom, pocketFillMat);
    pocketFill.rotation.x = -Math.PI / 2;
    pocketFill.position.y = 0.06;
    this.pocketBoxMesh.add(pocketFill);
    scene.add(this.pocketBoxMesh);

    // 5. Catch Point Indicator Chevron
    this.catchPointChevron = new THREE.Group();
    const chevronGeom = new THREE.ConeGeometry(0.45, 0.85, 4);
    const chevronMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const chevronMesh = new THREE.Mesh(chevronGeom, chevronMat);
    chevronMesh.rotation.x = Math.PI;
    this.catchPointChevron.add(chevronMesh);
    this.catchPointChevron.visible = false;
    scene.add(this.catchPointChevron);

    // 5b. Airborne Pass / Kick Landing Reticle
    this.ballLandingMarker = new THREE.Group();
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.45, 32),
      new THREE.MeshBasicMaterial({ color: 0xff8c00, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    outerRing.rotation.x = -Math.PI / 2;
    const innerDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
    );
    innerDot.rotation.x = -Math.PI / 2;
    innerDot.position.y = 0.01;
    this.ballLandingMarker.add(outerRing, innerDot);
    this.ballLandingMarker.position.y = 0.08;
    this.ballLandingMarker.visible = false;
    scene.add(this.ballLandingMarker);

    // 6. Goalposts, Pylons & Sideline Chain Crew / Down Box
    this.buildGoalposts(scene);
    this.buildPylons(scene);
    this.buildChainGang(scene);

    // 7. True Pro Stadium Infrastructure
    this.buildStadium(scene, homeTeam, awayTeam, playStyle);
  }

  public rebuildFieldForMatchup(homeTeam: TeamInfo, awayTeam: TeamInfo, playStyle: PlayStyleMode): void {
    const nextTex = this.generateTurfTexture(homeTeam, awayTeam, playStyle);
    if (this.turfTexture) {
      this.turfTexture.dispose();
    }
    this.turfTexture = nextTex;
    this.turfMaterial.map = nextTex;
    this.turfMaterial.needsUpdate = true;

    // Update stadium fascia neon accents to Home Team palette (or Arcade neon)
    if (this.stadiumAccentMats.length >= 2) {
      if (playStyle === 'ARCADE') {
        this.stadiumAccentMats[0].color.set('#ff5500');
        this.stadiumAccentMats[1].color.set('#00daf3');
      } else {
        this.stadiumAccentMats[0].color.set(homeTeam.primaryColor);
        this.stadiumAccentMats[1].color.set(homeTeam.secondaryColor);
      }
    }

    const modeBadge = playStyle === 'ARCADE' ? '🔥 FEVER JAM ARCADE 🔥' : '⚡ SOL GRIDIRON LEAGUE · PSN PRIME TIME ⚡';
    this.ribbonTickerText = `${modeBadge}  ${homeTeam.city.toUpperCase()} ${homeTeam.name.toUpperCase()} VS ${awayTeam.city.toUpperCase()} ${awayTeam.name.toUpperCase()}  ·  ${(homeTeam.stadiumName || 'FIRSTLIGHT CITADEL').toUpperCase()}  ·  MAKE SOME NOISE!  `;
  }

  private generateTurfTexture(
    homeTeam: TeamInfo,
    awayTeam: TeamInfo,
    playStyle: PlayStyleMode
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 4096;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1b5428';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 24 five-yard mowed stripes
    const stripeHeight = canvas.height / 24;
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#3a7540' : '#316437';
      ctx.fillRect(0, i * stripeHeight, canvas.width, stripeHeight);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      for (let s = 0; s < 4; s++) {
        ctx.fillRect(0, i * stripeHeight + s * (stripeHeight / 4), canvas.width, 2);
      }
    }

    // Deterministic grass grain
    let grassSeed = 4817;
    for (let i = 0; i < 160000; i++) {
      grassSeed = (Math.imul(grassSeed, 1664525) + 1013904223) >>> 0;
      const x = grassSeed % 2048;
      const y = (grassSeed >>> 11) % 4096;
      ctx.fillStyle = i % 3 ? 'rgba(8,28,5,.10)' : 'rgba(156,177,77,.12)';
      ctx.fillRect(x, y, 1, 2 + (i % 4));
    }

    // Home End Zone (Top: Z = -50..-60)
    const homeGrad = ctx.createLinearGradient(0, 0, 0, stripeHeight * 2);
    homeGrad.addColorStop(0, homeTeam.helmetColor || homeTeam.primaryColor);
    homeGrad.addColorStop(1, homeTeam.primaryColor);
    ctx.fillStyle = homeGrad;
    ctx.fillRect(0, 0, canvas.width, stripeHeight * 2);

    // Opponent End Zone (Bottom: Z = +50..+60)
    const awayGrad = ctx.createLinearGradient(0, canvas.height - stripeHeight * 2, 0, canvas.height);
    awayGrad.addColorStop(0, awayTeam.primaryColor);
    awayGrad.addColorStop(1, awayTeam.helmetColor || awayTeam.primaryColor);
    ctx.fillStyle = awayGrad;
    ctx.fillRect(0, canvas.height - stripeHeight * 2, canvas.width, stripeHeight * 2);

    // Diagonal end-zone accent slashes
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = -200; x < canvas.width + 200; x += 180) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 70, 0);
      ctx.lineTo(x - 10, stripeHeight * 2);
      ctx.lineTo(x - 80, stripeHeight * 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x, canvas.height - stripeHeight * 2);
      ctx.lineTo(x + 70, canvas.height - stripeHeight * 2);
      ctx.lineTo(x - 10, canvas.height);
      ctx.lineTo(x - 80, canvas.height);
      ctx.closePath();
      ctx.fill();
    }

    // Bold End Zone Wordmarks
    ctx.save();
    ctx.font = 'bold 170px "Teko", "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Home End Zone
    ctx.lineWidth = 10;
    ctx.strokeStyle = homeTeam.secondaryColor;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = homeTeam.secondaryColor;
    ctx.shadowBlur = 18;
    const homeWord = `${homeTeam.city.toUpperCase()} ${homeTeam.name.toUpperCase()}`;
    ctx.strokeText(homeWord, canvas.width / 2, stripeHeight);
    ctx.fillText(homeWord, canvas.width / 2, stripeHeight);

    // Away End Zone
    ctx.strokeStyle = awayTeam.secondaryColor;
    ctx.shadowColor = awayTeam.secondaryColor;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height - stripeHeight);
    ctx.rotate(Math.PI);
    const awayWord = `${awayTeam.city.toUpperCase()} ${awayTeam.name.toUpperCase()}`;
    ctx.strokeText(awayWord, 0, 0);
    ctx.fillText(awayWord, 0, 0);
    ctx.restore();
    ctx.restore();

    // Crisp Field Sidelines & End Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 18;
    ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

    // Coaching box dotted sideline boundary
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 26, canvas.height);
    ctx.fillRect(canvas.width - 26, 0, 26, canvas.height);

    // Goal lines
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(28, stripeHeight * 2);
    ctx.lineTo(canvas.width - 28, stripeHeight * 2);
    ctx.moveTo(28, canvas.height - stripeHeight * 2);
    ctx.lineTo(canvas.width - 28, canvas.height - stripeHeight * 2);
    ctx.stroke();

    // Yard lines, Hash marks & Pro Directional Yard Numbers
    const playAreaStart = stripeHeight * 2;
    const playAreaHeight = canvas.height - stripeHeight * 4;
    const yardHeight = playAreaHeight / 100;

    for (let y = 5; y <= 95; y += 5) {
      const lineY = playAreaStart + y * yardHeight;
      const isTenYard = y % 10 === 0;

      ctx.beginPath();
      ctx.lineWidth = isTenYard ? 12 : 7;
      ctx.moveTo(52, lineY);
      ctx.lineTo(canvas.width - 52, lineY);
      ctx.stroke();

      for (let sub = 1; sub <= 4; sub++) {
        if (y + sub < 100) {
          const subY = lineY + sub * yardHeight;
          ctx.lineWidth = 5;
          ctx.strokeRect(62, subY - 2, 38, 4);
          ctx.strokeRect(canvas.width * (0.5 - 3.0833 / 53.3333), subY - 2, 34, 4);
          ctx.strokeRect(canvas.width * (0.5 + 3.0833 / 53.3333) - 34, subY - 2, 34, 4);
          ctx.strokeRect(canvas.width - 100, subY - 2, 38, 4);
        }
      }

      if (isTenYard) {
        const yardNumber = y <= 50 ? y : 100 - y;
        const numStr = `${yardNumber}`;
        ctx.save();
        ctx.font = 'bold 96px "Rajdhani", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.save();
        ctx.translate(canvas.width * 0.17, lineY);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(numStr, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.translate(canvas.width * 0.83, lineY);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(numStr, 0, 0);
        ctx.restore();
        ctx.restore();
      }
    }

    // Midfield 50-Yard Crest: SOL Gridiron Shield or Arcade Fever Jam Emblem
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);

    ctx.beginPath();
    ctx.arc(0, 0, 225, 0, Math.PI * 2);
    ctx.fillStyle = playStyle === 'ARCADE' ? 'rgba(255, 100, 0, 0.24)' : 'rgba(15, 23, 42, 0.48)';
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = playStyle === 'ARCADE' ? '#ff8c00' : homeTeam.secondaryColor;
    ctx.stroke();

    // Inner Plajah Chevron inside Midfield Crest
    ctx.beginPath();
    ctx.moveTo(-70, -110);
    ctx.lineTo(65, 0);
    ctx.lineTo(-70, 110);
    ctx.lineWidth = 26;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = playStyle === 'ARCADE' ? '#00daf3' : '#ffffff';
    ctx.stroke();

    ctx.font = 'bold 54px "Chakra Petch", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText(playStyle === 'ARCADE' ? 'FEVER JAM' : 'SOL LEAGUE', 0, 278);
    ctx.restore();

    const turfTexture = new THREE.CanvasTexture(canvas);
    turfTexture.wrapS = THREE.ClampToEdgeWrapping;
    turfTexture.wrapT = THREE.ClampToEdgeWrapping;
    turfTexture.anisotropy = 8;
    turfTexture.colorSpace = THREE.SRGBColorSpace;
    return turfTexture;
  }

  private buildChainGang(scene: THREE.Scene): void {
    // Sideline Orange Down Box Marker (Moves to exact LOS!)
    this.downBoxGroup = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8), poleMat);
    pole.position.y = 1.4;
    this.downBoxGroup.add(pole);

    this.downBoxCanvas = document.createElement('canvas');
    this.downBoxCanvas.width = 128;
    this.downBoxCanvas.height = 128;
    this.downBoxTexture = new THREE.CanvasTexture(this.downBoxCanvas);
    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.85, 0.85),
      new THREE.MeshBasicMaterial({ map: this.downBoxTexture })
    );
    boxMesh.position.y = 2.7;
    this.downBoxGroup.add(boxMesh);
    this.downBoxGroup.position.set(FIELD.WIDTH / 2 + 1.6, 0, -30);
    scene.add(this.downBoxGroup);

    // Sideline First Down Chain Target Rod (Moves to exact Line to Gain!)
    this.chainPostGroup = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.9, 8), poleMat);
    rod.position.y = 1.45;
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.14, 16),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    disc.rotation.z = Math.PI / 2;
    disc.position.y = 2.7;
    this.chainPostGroup.add(rod, disc);
    this.chainPostGroup.position.set(FIELD.WIDTH / 2 + 1.6, 0, -20);
    scene.add(this.chainPostGroup);
    this.renderDownBox(1);
  }

  private renderDownBox(down: number): void {
    if (!this.downBoxCanvas) return;
    const ctx = this.downBoxCanvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 118, 118);
    ctx.fillStyle = '#ffbf00';
    ctx.font = '900 84px "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(down), 64, 68);
    this.downBoxTexture.needsUpdate = true;
  }

  private buildSkyDome(scene: THREE.Scene): void {
    const skyGeom = new THREE.SphereGeometry(210, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      map: this.makeSkyTexture('AURORA'),
      side: THREE.BackSide,
    });
    this.skyMesh = new THREE.Mesh(skyGeom, skyMat);
    scene.add(this.skyMesh);

    this.buildAuroraCurtains(scene);
  }

  private makeSkyTexture(preset: WeatherPreset): THREE.CanvasTexture {
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d')!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, 512);

    if (preset === 'DAY') {
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(0.5, '#38bdf8');
      grad.addColorStop(0.85, '#bae6fd');
      grad.addColorStop(1, '#e0f2fe');
    } else if (preset === 'SUNSET') {
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(0.45, '#7c2d12');
      grad.addColorStop(0.75, '#ea580c');
      grad.addColorStop(1, '#fbbf24');
    } else if (preset === 'SNOW') {
      grad.addColorStop(0, '#334155');
      grad.addColorStop(0.55, '#64748b');
      grad.addColorStop(1, '#cbd5e1');
    } else if (preset === 'RAIN') {
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.6, '#1e293b');
      grad.addColorStop(1, '#334155');
    } else if (preset === 'NIGHT') {
      grad.addColorStop(0, '#020617');
      grad.addColorStop(0.55, '#0b1120');
      grad.addColorStop(1, '#1e293b');
    } else {
      grad.addColorStop(0, '#020617');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(0.85, '#1e1b4b');
      grad.addColorStop(1, '#3b0764');
    }
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 512, 512);

    if (preset === 'AURORA' || preset === 'NIGHT') {
      skyCtx.fillStyle = '#ffffff';
      let s = 12345;
      for (let i = 0; i < 240; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const x = s % 512;
        const y = (s >>> 9) % 260;
        const r = 0.6 + ((s >>> 18) % 10) * 0.12;
        skyCtx.beginPath();
        skyCtx.arc(x, y, r, 0, Math.PI * 2);
        skyCtx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(skyCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
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
        float totalWave = (wave1 + wave2 + wave3) * uWaveScale;
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
        float verticalFade = pow(sin(vUv.y * 3.14159265), 1.25);
        float ray1 = sin(vUv.x * 55.0 + uTime * (uSpeed * 1.5) + vDisplacement * 4.0) * 0.22 + 0.78;
        float ray2 = sin(vUv.x * 110.0 - uTime * (uSpeed * 2.2)) * 0.15 + 0.85;
        float rays = ray1 * ray2;
        float t = clamp(vUv.y + vDisplacement * 0.2, 0.0, 1.0);
        vec3 col = t < 0.33 ? mix(uColorA, uColorB, t / 0.33) : t < 0.66 ? mix(uColorB, uColorC, (t - 0.33) / 0.33) : mix(uColorC, uColorD, (t - 0.66) / 0.34);
        gl_FragColor = vec4(col, verticalFade * rays * uOpacity);
      }
    `;

    const layers = [
      { y: 66, z: 85, rotY: -0.15, width: 280, height: 50, speed: 0.4, waveScale: 1.2, opacity: 0.85 },
      { y: 58, z: 115, rotY: 0.18, width: 300, height: 46, speed: 0.3, waveScale: 1.3, opacity: 0.75 },
      { y: 66, z: -85, rotY: 0.15, width: 260, height: 48, speed: 0.42, waveScale: 1.15, opacity: 0.8 },
    ];

    layers.forEach((layer) => {
      const geom = new THREE.PlaneGeometry(layer.width, layer.height, 64, 16);
      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: layer.speed },
          uWaveScale: { value: layer.waveScale },
          uColorA: { value: new THREE.Color('#00daf3') },
          uColorB: { value: new THREE.Color('#6b0099') },
          uColorC: { value: new THREE.Color('#d40055') },
          uColorD: { value: new THREE.Color('#ff8c00') },
          uOpacity: { value: layer.opacity },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
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

  public updateLines(scrimmageZ: number, firstDownZ: number, down: number = 1): void {
    this.lineOfScrimmageMesh.position.z = scrimmageZ;
    this.firstDownMesh.position.z = Math.min(50, firstDownZ);
    this.firstDownMesh.visible = firstDownZ < 50;
    this.pocketBoxMesh.position.z = scrimmageZ;

    if (this.downBoxGroup) {
      this.downBoxGroup.position.z = scrimmageZ;
      this.renderDownBox(down);
    }
    if (this.chainPostGroup) {
      this.chainPostGroup.position.z = Math.min(50, firstDownZ);
      this.chainPostGroup.visible = firstDownZ < 50;
    }
  }

  public updateBallLandingMarker(pos: THREE.Vector3 | null, visible: boolean, isDefense = false): void {
    if (!this.ballLandingMarker) return;
    this.ballLandingMarker.visible = visible && !!pos;
    if (pos && visible) {
      this.ballLandingMarker.position.set(pos.x, 0.08, pos.z);
      const ring = this.ballLandingMarker.children[0] as THREE.Mesh;
      (ring.material as THREE.MeshBasicMaterial).color.setHex(isDefense ? 0x00daf3 : 0xff8c00);
    }
  }

  public triggerShockwave(x: number, z: number, colorHex: number = 0xff6b00): void {
    if (!this.sceneRef) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.85, 28),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.12, z);
    this.sceneRef.add(mesh);
    this.shockwaves.push({ mesh, age: 0, maxAge: 0.55 });
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

  public setPocketVisible(visible: boolean): void {
    if (this.pocketBoxMesh) this.pocketBoxMesh.visible = visible;
  }

  private buildGoalposts(scene: THREE.Scene): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.28,
      metalness: 0.45,
    });
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.75,
    });
    const ribbonMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

    const endZonesZ = [-60, 60];
    endZonesZ.forEach((z) => {
      const group = new THREE.Group();
      group.position.set(0, 0, z);

      const basePost = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4.0, 16), postMat);
      basePost.position.set(0, 2.0, z > 0 ? 1.5 : -1.5);
      group.add(basePost);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 2.2, 16), padMat);
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

      const uprightL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 11.5, 16), postMat);
      uprightL.position.set(-3.08, 9.08, 0);
      group.add(uprightL);

      const uprightR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 11.5, 16), postMat);
      uprightR.position.set(3.08, 9.08, 0);
      group.add(uprightR);

      // Top wind streamers on uprights
      [-3.08, 3.08].forEach((ux) => {
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.08), ribbonMat);
        flag.position.set(ux + 0.28, 14.8, 0);
        group.add(flag);
      });

      scene.add(group);
    });
  }

  private buildPylons(scene: THREE.Scene): void {
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0xff6b00,
      emissive: 0x662200,
      emissiveIntensity: 0.3,
      roughness: 0.45,
    });
    const pylonGeom = new THREE.BoxGeometry(0.25, 0.68, 0.25);

    const xCoords = [-FIELD.WIDTH / 2, FIELD.WIDTH / 2];
    const zCoords = [-60, -50, 50, 60];

    xCoords.forEach((x) => {
      zCoords.forEach((z) => {
        const pylon = new THREE.Mesh(pylonGeom, pylonMat);
        pylon.position.set(x, 0.34, z);
        scene.add(pylon);
      });
    });
  }

  private buildStadium(
    scene: THREE.Scene,
    homeTeam: TeamInfo,
    awayTeam: TeamInfo,
    playStyle: PlayStyleMode
  ): void {
    this.stadiumGroup = new THREE.Group();

    const arch = buildProStadium(
      this.stadiumGroup,
      playStyle === 'ARCADE' ? '#ff5500' : homeTeam.primaryColor,
      playStyle === 'ARCADE' ? '#00daf3' : homeTeam.secondaryColor
    );
    this.crowdBasePositions = arch.spectators;
    this.stadiumAccentMats = arch.accentMats;
    this.crowdCount = this.crowdBasePositions.length;

    // Living GPU-Animated Seated Crowd
    this.buildLivingCrowd();

    // Animated Stadium LED Ribbon Boards
    this.buildLEDRibbons();

    // Pro Roof-Mounted Floodlight Glow Flares & Field Spotlights
    const flareCanvas = document.createElement('canvas');
    flareCanvas.width = 256;
    flareCanvas.height = 256;
    const fctx = flareCanvas.getContext('2d')!;
    const fgrad = fctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    fgrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    fgrad.addColorStop(0.28, 'rgba(216, 180, 254, 0.55)');
    fgrad.addColorStop(0.65, 'rgba(147, 197, 253, 0.18)');
    fgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    fctx.fillStyle = fgrad;
    fctx.fillRect(0, 0, 256, 256);
    const flareTex = new THREE.CanvasTexture(flareCanvas);

    arch.floodlightAnchors.forEach((coord, idx) => {
      const flareSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: flareTex,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.72,
        })
      );
      flareSprite.position.copy(coord);
      flareSprite.scale.set(14, 14, 1);
      this.stadiumGroup.add(flareSprite);

      // Add 4 balanced corner SpotLights for bright, broadcast-even turf illumination
      if (idx % 2 === 0) {
        const spot = new THREE.SpotLight(0xfff7ed, 0.75);
        spot.position.copy(coord);
        spot.target.position.set(0, 0, coord.z > 0 ? 18 : -18);
        spot.angle = Math.PI / 3.2;
        spot.penumbra = 0.55;
        spot.decay = 0;
        this.stadiumGroup.add(spot);
        this.stadiumGroup.add(spot.target);
        this.floodlights.push(spot);
      }
    });

    // Camera Flashes in the Stands
    this.buildCameraFlashes();

    // Massive Pro End-Zone Jumbotrons mounted into the Monolith Towers
    [-1, 1].forEach((side, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 384;
      this.jumbotronCanvases.push(canvas);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const screenMat = new THREE.MeshBasicMaterial({ map: texture });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(34, 12.6), screenMat);

      screen.position.set(0, 21.5, side * 82.8);
      screen.rotation.y = side > 0 ? Math.PI : 0;
      this.stadiumGroup.add(screen);
      this.jumbotrons.push(screen);

      this.renderJumbotron(
        idx,
        '1ST & 10',
        'BALL ON 25',
        `${homeTeam.name.toUpperCase()} 0  -  ${awayTeam.name.toUpperCase()} 0`,
        homeTeam.stadiumName || 'FIRSTLIGHT CITADEL'
      );
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
    this.ribbonTexture.repeat.set(3, 1);

    const ribbonMat = new THREE.MeshBasicMaterial({ map: this.ribbonTexture });
    const ribbonGeom = new THREE.PlaneGeometry(FIELD.LENGTH + 26, 2.0);
    this.ribbonMeshL = new THREE.Mesh(ribbonGeom, ribbonMat);
    this.ribbonMeshL.position.set(-FIELD.WIDTH / 2 - 9.2, 10.6, 0);
    this.ribbonMeshL.rotation.y = Math.PI / 2;
    this.stadiumGroup.add(this.ribbonMeshL);

    this.ribbonMeshR = new THREE.Mesh(ribbonGeom, ribbonMat);
    this.ribbonMeshR.position.set(FIELD.WIDTH / 2 + 9.2, 10.6, 0);
    this.ribbonMeshR.rotation.y = -Math.PI / 2;
    this.stadiumGroup.add(this.ribbonMeshR);
  }

  private updateLEDRibbon(): void {
    if (!this.ribbonCanvas) return;
    const ctx = this.ribbonCanvas.getContext('2d')!;
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, this.ribbonCanvas.width, this.ribbonCanvas.height);

    ctx.font = 'bold 54px "Teko", "Chakra Petch", sans-serif';
    ctx.textBaseline = 'middle';

    this.ribbonScroll = (this.ribbonScroll + 2.8) % this.ribbonCanvas.width;
    ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 12;
    ctx.fillText(this.ribbonTickerText, -this.ribbonScroll, 64);
    ctx.fillText(this.ribbonTickerText, -this.ribbonScroll + 1500, 64);
    ctx.fillText(this.ribbonTickerText, -this.ribbonScroll + 3000, 64);

    this.ribbonTexture.needsUpdate = true;
  }

  private buildCameraFlashes(): void {
    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = 64;
    flashCanvas.height = 64;
    const fctx = flashCanvas.getContext('2d')!;
    const fgrad = fctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    fgrad.addColorStop(0, '#ffffff');
    fgrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)');
    fgrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    fctx.fillStyle = fgrad;
    fctx.fillRect(0, 0, 64, 64);
    const flashTex = new THREE.CanvasTexture(flashCanvas);

    for (let i = 0; i < 10; i++) {
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
    this.flashSprites.forEach((sprite) => {
      if (Math.random() < 0.08) {
        const randIdx = Math.floor(Math.random() * this.crowdBasePositions.length);
        const pos = this.crowdBasePositions[randIdx];
        sprite.position.set(pos.x, pos.y + 0.5, pos.z);
        sprite.material.opacity = 0.95;
      } else {
        sprite.material.opacity *= 0.65;
      }
    });
  }

  public updateLivingCrowd(animTime: number, excitement = 1): void {
    this.humanCrowd?.update(animTime, excitement);
  }

  public triggerTouchdownFireworks(scene: THREE.Scene): void {
    this.fireworksLife = 4.2;
    const count = 480;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      positions[i * 3] = side * 6.8 + (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = 4.5 + Math.random() * 2;
      positions[i * 3 + 2] = 66 + (Math.random() - 0.5) * 5;

      velocities[i * 3] = (Math.random() - 0.5) * 16;
      velocities[i * 3 + 1] = 20 + Math.random() * 14;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 16;

      colors[i * 3] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.45 + Math.random() * 0.5;
      colors[i * 3 + 2] = Math.random() < 0.35 ? 0.9 : 0.1;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.0,
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
      vel[i * 3 + 1] -= 9.8 * delta;
    }
    pos.needsUpdate = true;
    (this.fireworksParticles.material as THREE.PointsMaterial).opacity = Math.max(0, this.fireworksLife / 4.2);
  }

  private updateShockwaves(delta: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.age += delta;
      if (s.age >= s.maxAge) {
        this.sceneRef?.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
      } else {
        const p = s.age / s.maxAge;
        const scale = 1.0 + p * 7.5;
        s.mesh.scale.setScalar(scale);
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.9;
      }
    }
  }

  public updateStadiumEffects(
    animTime: number,
    delta: number,
    scene: THREE.Scene,
    excitement: number = 1.0
  ): void {
    this.updateAurora(animTime);
    this.updateLivingCrowd(animTime, excitement);
    this.updateCameraFlashes();
    this.updateLEDRibbon();
    this.updateFireworks(delta, scene);
    this.updateShockwaves(delta);
    if (this.ballLandingMarker?.visible) {
      const pulse = 1.0 + Math.sin(animTime * 10) * 0.12;
      this.ballLandingMarker.scale.setScalar(pulse);
    }
  }

  public renderJumbotron(
    screenIdx: number,
    downDist: string,
    ballLoc: string,
    score: string,
    venueBanner: string = 'SOL GRIDIRON LEAGUE · PSN PRIME TIME'
  ): void {
    const canvas = this.jumbotronCanvases[screenIdx];
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#070a14');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#070a14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = '#00daf3';
    ctx.font = 'bold 34px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(venueBanner.toUpperCase(), canvas.width / 2, 62);

    ctx.font = 'bold 62px "Rajdhani", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(score, canvas.width / 2, 165);

    ctx.font = 'bold 50px "Teko", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${downDist}   |   ${ballLoc}`, canvas.width / 2, 258);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '24px sans-serif';
    ctx.fillText('PASS: [1-4] · RUN/MOVE: WASD · JUKE [SPACE] · SPIN [X] · TRUCK [F] · SWITCH DEF [TAB]', canvas.width / 2, 336);

    const screen = this.jumbotrons[screenIdx];
    if (screen && screen.material instanceof THREE.MeshBasicMaterial && screen.material.map) {
      screen.material.map.needsUpdate = true;
    }
  }

  public applyWeather(preset: WeatherPreset, scene: THREE.Scene): void {
    // Update Sky Dome texture & Aurora visibility
    if (this.skyMesh && this.skyMesh.material instanceof THREE.MeshBasicMaterial) {
      this.skyMesh.material.map?.dispose();
      this.skyMesh.material.map = this.makeSkyTexture(preset);
      this.skyMesh.material.needsUpdate = true;
    }
    const showAurora = preset === 'AURORA';
    this.auroraMeshes.forEach((m) => (m.visible = showAurora));

    if (preset === 'RAIN') {
      this.turfMaterial.roughness = 0.36;
      scene.fog = new THREE.FogExp2(0x1e293b, 0.01);
      this.createPrecipitation(scene, 'RAIN');
    } else if (preset === 'SNOW') {
      this.turfMaterial.roughness = 0.96;
      scene.fog = new THREE.FogExp2(0xcbd5e1, 0.011);
      this.createPrecipitation(scene, 'SNOW');
    } else if (preset === 'DAY') {
      this.turfMaterial.roughness = 0.86;
      scene.fog = new THREE.FogExp2(0xbae6fd, 0.0028);
      this.removePrecipitation(scene);
    } else if (preset === 'SUNSET') {
      this.turfMaterial.roughness = 0.82;
      scene.fog = new THREE.FogExp2(0x431407, 0.0045);
      this.removePrecipitation(scene);
    } else if (preset === 'AURORA') {
      this.turfMaterial.roughness = 0.82;
      scene.fog = new THREE.FogExp2(0x1e1b4b, 0.0055);
      this.removePrecipitation(scene);
    } else {
      this.turfMaterial.roughness = 0.82;
      scene.fog = new THREE.FogExp2(0x090d16, 0.0045);
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
      velocities[i] = type === 'RAIN' ? 36 + Math.random() * 18 : 6 + Math.random() * 4;
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
      if (y < 0) y = 40;
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
