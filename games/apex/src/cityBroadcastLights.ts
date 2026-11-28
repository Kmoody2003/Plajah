// games/apex/src/cityBroadcastLights.ts
//
// Singapore Marina Bay × Downtown Detroit Night Street-Circuit Lighting & Live Broadcast System:
//   1. Selective Bespoke Architectural Building Lighting (ONLY ~30% of prominent skyline towers —
//      NEVER cookie-cutter boxes on every building!):
//      6 distinct real-world architectural archetypes:
//        - Style A (RenCen / Marina Bay Halo): Single crisp floating crown band on top parapet only
//        - Style B (Art-Deco Penobscot / Guardian): Warm gold stepped crown fascia + glowing rooftop beacon spire
//        - Style C (Singapore Center Spine): Bold twin vertical luminous spine ribs up the upper third of the face
//        - Style D (Executive Crown Louvers): 3 stacked thin architectural light louvers crowning the roofline
//        - Style E (Diagonal / Asymmetrical Spire Accent): Illuminated upper corner blade + rooftop mast beacon
//        - Style F (Heritage Podium Accent): Subtle warm gold marquee soffit line at lower mezzanine only
//   2. Downtown LED Signage (1 shared high-res atlas = 1 draw call!):
//      - Backlit Rooftop Corporate Sky-Signs on landmark supertalls (PLAJAH, IRONPORT, KESTREL, HALCYON, AURELIA, SUPERIOR)
//      - Street-Level Vertical Illuminated Blade Signs & Marquees along downtown avenues (HOTEL IRONPORT, GRAND THEATER, APEX LOUNGE, FOX/CIVIC PLAZA)
//   3. LED Track Assets throughout Ironport Grand Circuit (Singapore GP Night Circuit feel!):
//      - Illuminated LED Braking-Zone & Corner Chevron Light Boards (>>> / <<<) entering turns
//      - Glowing Trackside LED Barrier Sponsor Boards & FIA Digital Green-Flag Panels lining straights & pit wall
//      - Illuminated Overhead LED Sector 2 / Sector 3 Bridge Arches & Start/Finish Gantry Header Ribbon
//   4. Giant 16:9 Live-Broadcast LED Video Walls (Start/Finish Mega-Jumbotron + 5 Trackside Jumbotron Towers +
//      12 Building-Mounted Broadcast Walls) displaying RIGHT-SIDE-UP LIVE 3D RACE CAMERA FOOTAGE
//      composited with live APEX TV leaderboard & telemetry!
//
// Performance budget: ~6 draw calls, ~24k triangles total, throttled 320x180 TV RenderTarget (1/10 frames)
// with non-essential props hidden during TV capture -> maintains silky 33-38 FPS day & night!

import * as THREE from 'three';
import * as THREE_GPU from 'three/webgpu';
import {
  cameraPosition, clamp, float, length, mix,
  positionWorld, sin, smoothstep, texture as tslTexture, uniform, uv, vec2, vec3, vertexColor,
} from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isRegionWebGpuActive } from './tsl/webgpuRuntime';

export interface BroadcastBuildingItem {
  kind: 'hero' | 'generic';
  slug: string;
  x: number;
  z: number;
  rotY: number;
  w: number;
  d: number;
  h: number;
  bx?: number;
  bz?: number;
}

export interface BroadcastLeaderEntry {
  pos: number;
  name: string;
  gap: string;
  isPlayer: boolean;
}

export interface BroadcastTelemetry {
  active: boolean;
  circuitName: string;
  lapText: string;
  raceTimeText: string;
  speedKmh: number;
  gearLabel: string;
  rpm01: number;
  posText: string;
  flagText: string;
  nightK: number;
  playerPos: THREE.Vector3 | null;
  playerYaw: number;
  playerSpeedMps: number;
  leaderboard: BroadcastLeaderEntry[];
}

export interface CityBroadcastOpts {
  cityItems: readonly BroadcastBuildingItem[];
  cityPath: readonly { x: number; y: number; z: number }[];
  groundMin: (it: BroadcastBuildingItem) => number;
  groundAt: (x: number, z: number) => number;
  halfTrackWidth: number;
  gantryIndex: number;
  onCourse?: (x: number, z: number, pad: number) => boolean;
}

function hash2(a: number, b: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// Curated luxury architectural skyline palette (champagne, architectural white, Detroit gold, Singapore cyan/sapphire)
const ARCH_PALETTE = [
  0xffcb6b, // Warm Champagne Gold
  0xe4f3ff, // Architectural Ice White
  0x28d0ff, // Marina Cyan
  0xff8a3d, // Warm Amber
  0x4f92ff, // Executive Sapphire
  0xffe8b6, // Classical Limestone Warm White
];

const BROADCAST_CAM_LABELS = [
  'CAM 01 · APEX TELEPHOTO',
  'CAM 02 · HELI SKYCAM',
  'CAM 03 · TRACKSIDE HERO',
] as const;

// UV regions on our single 1024x1024 LED Signage & Track Assets Atlas (u0, v0, u1, v1 in standard WebGL/WebGPU UV where v=1 is top)
interface AtlasRect { u0: number; v0: number; u1: number; v1: number }
interface SignageAtlasRects {
  skySigns: AtlasRect[];       // 6 wide rooftop corporate sky-signs
  bladeSigns: AtlasRect[];     // 4 vertical illuminated downtown street blade signs
  barrierBoards: AtlasRect[];  // 4 glowing trackside LED barrier sponsor boards
  chevronRight: AtlasRect;     // glowing amber/red corner chevron >>>
  chevronLeft: AtlasRect;      // glowing amber/red corner chevron <<<
  fiaGreen: AtlasRect;         // FIA digital green-flag marshal panel
  sectorBridge: AtlasRect;     // overhead LED sector arch board
}

export class CityBroadcastLights {
  readonly group = new THREE.Group();
  readonly feedRenderTarget: THREE.RenderTarget;
  readonly tvCamera = new THREE.PerspectiveCamera(44, 16 / 9, 1.5, 1400);

  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly overlayTex: THREE.CanvasTexture;

  private readonly ribbonCanvas: HTMLCanvasElement;
  private readonly ribbonCtx: CanvasRenderingContext2D;
  private readonly ribbonTex: THREE.CanvasTexture;

  private readonly signageAtlasTex: THREE.CanvasTexture;
  private readonly atlasRects: SignageAtlasRects;

  private readonly useWebGpu: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private uTime: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private uNight: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private uFeedReady: any = null;

  private webglArchMat: THREE.MeshBasicMaterial | null = null;
  private webglVideoMat: THREE.MeshBasicMaterial | null = null;

  private readonly screenMeshes: THREE.Object3D[] = [];
  private readonly cityPath: readonly { x: number; y: number; z: number }[];
  private readonly groundAt: (x: number, z: number) => number;

  private elapsed = 0;
  private lastOverlayMs = 0;
  private lastRibbonMs = 0;
  private frameCounter = 0;
  private feedHasRendered = false;
  private shotIndex = 0;
  private shotTimer = 0;
  private shotAnchor = new THREE.Vector3();
  private shotAnchorSet = false;
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();

  readonly counts = {
    litLandmarks: 0,
    archBars: 0,
    skySigns: 0,
    bladeSigns: 0,
    trackLedBoards: 0,
    chevronBoards: 0,
    videoWalls: 0,
    jumbotrons: 0,
    ribbons: 0,
  };

  constructor(opts: CityBroadcastOpts) {
    this.group.name = 'city-broadcast-lights';
    this.cityPath = opts.cityPath;
    this.groundAt = opts.groundAt;
    this.useWebGpu = isRegionWebGpuActive();

    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    };
    this.feedRenderTarget = (this.useWebGpu
      ? new THREE_GPU.RenderTarget(320, 180, rtOpts)
      : new THREE.WebGLRenderTarget(320, 180, rtOpts)) as unknown as THREE.RenderTarget;

    // 512x288 RGBA Broadcast Graphics Overlay
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = 512;
    this.overlayCanvas.height = 288;
    this.overlayCtx = this.overlayCanvas.getContext('2d')!;
    this.overlayTex = new THREE.CanvasTexture(this.overlayCanvas);
    this.overlayTex.colorSpace = THREE.SRGBColorSpace;
    this.overlayTex.minFilter = THREE.LinearFilter;
    this.overlayTex.magFilter = THREE.LinearFilter;
    this.overlayTex.generateMipmaps = false;

    // 1024x160 Animated Scrolling LED Marquee Ribbon
    this.ribbonCanvas = document.createElement('canvas');
    this.ribbonCanvas.width = 1024;
    this.ribbonCanvas.height = 160;
    this.ribbonCtx = this.ribbonCanvas.getContext('2d')!;
    this.ribbonTex = new THREE.CanvasTexture(this.ribbonCanvas);
    this.ribbonTex.colorSpace = THREE.SRGBColorSpace;
    this.ribbonTex.wrapS = THREE.RepeatWrapping;
    this.ribbonTex.wrapT = THREE.ClampToEdgeWrapping;
    this.ribbonTex.minFilter = THREE.LinearFilter;
    this.ribbonTex.magFilter = THREE.LinearFilter;
    this.ribbonTex.generateMipmaps = false;

    // 1024x1024 Shared Multi-Tile LED Signage & Track Assets Atlas (1 draw call for all rooftop signs, blade signs & track LED assets!)
    const builtAtlas = this.buildSignageAtlas();
    this.signageAtlasTex = builtAtlas.tex;
    this.atlasRects = builtAtlas.rects;

    if (this.useWebGpu) {
      this.uTime = uniform(0);
      this.uNight = uniform(0);
      this.uFeedReady = uniform(0);
    }

    this.drawBroadcastOverlay({
      active: false,
      circuitName: 'IRONPORT GRAND CIRCUIT',
      lapText: 'LAP 1/3',
      raceTimeText: '00:00.00',
      speedKmh: 0,
      gearLabel: 'N',
      rpm01: 0.18,
      posText: 'POS 1/6',
      flagText: 'GRID READY',
      nightK: 0,
      playerPos: null,
      playerYaw: 0,
      playerSpeedMps: 0,
      leaderboard: [
        { pos: 1, name: 'YOU · KESTREL GT-R', gap: 'LEADER', isPlayer: true },
        { pos: 2, name: 'V. ROSSI · AURELIA', gap: '+0.42s', isPlayer: false },
        { pos: 3, name: 'K. TAKAHASHI · APEX', gap: '+1.18s', isPlayer: false },
        { pos: 4, name: 'M. VANCE · IRONHIDE', gap: '+2.05s', isPlayer: false },
      ],
    }, false);
    this.drawRibbonBanner('IRONPORT GRAND CIRCUIT', 'LIVE BROADCAST', 'LAP 1/3', 0);

    const archMat = this.buildArchMaterial();
    const videoMat = this.buildVideoWallMaterial();
    const ribbonMat = this.buildRibbonMaterial();
    const signageMat = this.buildSignageAtlasMaterial();
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x161a22,
      roughness: 0.42,
      metalness: 0.78,
    });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2b20, fog: false });

    const sharedSignGeos: THREE.BufferGeometry[] = [];
    const sharedFrameGeos: THREE.BufferGeometry[] = [];

    this.buildSelectiveArchitecturalLighting(opts, archMat, beaconMat, sharedSignGeos, sharedFrameGeos);
    this.buildLedTrackAssets(opts, sharedSignGeos, sharedFrameGeos);
    this.buildVideoWallsAndRibbons(opts, videoMat, ribbonMat, cabinetMat, beaconMat, sharedSignGeos, sharedFrameGeos);

    if (sharedSignGeos.length > 0) {
      const mergedSign = mergeGeometries(sharedSignGeos, false);
      for (const g of sharedSignGeos) g.dispose();
      if (mergedSign) {
        const signMesh = new THREE.Mesh(mergedSign, signageMat);
        signMesh.name = 'led-signage-and-track-assets';
        signMesh.castShadow = false;
        signMesh.receiveShadow = false;
        signMesh.frustumCulled = false;
        this.group.add(signMesh);
      }
    }
    if (sharedFrameGeos.length > 0) {
      const mergedFrames = mergeGeometries(sharedFrameGeos, false);
      for (const g of sharedFrameGeos) g.dispose();
      if (mergedFrames) {
        const frameMesh = new THREE.Mesh(mergedFrames, cabinetMat);
        frameMesh.name = 'led-signage-frames';
        frameMesh.castShadow = false;
        frameMesh.receiveShadow = false;
        frameMesh.frustumCulled = false;
        this.group.add(frameMesh);
      }
    }
  }

  /** Build a 1024x1024 crisp illuminated LED Signage & Track Assets Atlas (rooftop corporate signs, blade signs, barrier boards, corner chevrons, FIA panels). */
  private buildSignageAtlas(): { tex: THREE.CanvasTexture; rects: SignageAtlasRects } {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 1024;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#080c16';
    g.fillRect(0, 0, 1024, 1024);

    // Helper converting pixel rect (x, y from top, w, h) to Three.js UV (v=1 at top!)
    const toUv = (x: number, y: number, w: number, h: number): AtlasRect => ({
      u0: (x + 2) / 1024,
      u1: (x + w - 2) / 1024,
      v1: 1 - (y + 2) / 1024,
      v0: 1 - (y + h - 2) / 1024,
    });

    // 1) 6 Rooftop Corporate Sky-Signs (y: 0..384, 2 cols x 3 rows, each 512x128)
    const skyDefs: Array<{ text: string; sub: string; bg: string; fg: string; accent: string }> = [
      { text: 'PLAJAH', sub: 'GLOBAL TOWER', bg: '#0b1630', fg: '#ffffff', accent: '#ff6b2b' },
      { text: 'IRONPORT', sub: 'FINANCIAL CENTER', bg: '#0c1829', fg: '#ffd470', accent: '#ffd470' },
      { text: 'KESTREL', sub: 'MOTORSPORT HQ', bg: '#160d1e', fg: '#ffffff', accent: '#30dcff' },
      { text: 'HALCYON', sub: 'ENERGY PLAZA', bg: '#091b24', fg: '#68f0ff', accent: '#28d8ff' },
      { text: 'AURELIA', sub: 'DESIGN HOUSE', bg: '#1e1018', fg: '#ffe6c4', accent: '#ff5c4d' },
      { text: 'SUPERIOR', sub: 'GREAT LAKES BANK', bg: '#0b1a2e', fg: '#ffffff', accent: '#4f96ff' },
    ];
    const skySigns: AtlasRect[] = [];
    skyDefs.forEach((s, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = col * 512;
      const y = row * 128;
      g.fillStyle = s.bg;
      g.fillRect(x, y, 512, 128);
      g.strokeStyle = s.accent;
      g.lineWidth = 6;
      g.strokeRect(x + 6, y + 6, 500, 116);
      g.fillStyle = s.accent;
      g.fillRect(x + 20, y + 24, 14, 80);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = s.fg;
      g.font = '900 58px Inter, Segoe UI, sans-serif';
      g.fillText(s.text, x + 48, y + 58);
      g.fillStyle = s.accent;
      g.font = '700 18px Inter, Segoe UI, sans-serif';
      g.fillText(s.sub, x + 50, y + 102);
      skySigns.push(toUv(x, y, 512, 128));
    });

    // 2) 4 Illuminated Trackside LED Barrier Sponsor Boards (y: 384..640, 2 cols x 2 rows, each 512x128)
    const barDefs: Array<{ text: string; bg1: string; bg2: string; fg: string; stripe: string }> = [
      { text: 'PLAJAH MOTORSPORT', bg1: '#0a162e', bg2: '#1a2f5c', fg: '#ffffff', stripe: '#ff6b2b' },
      { text: 'IRONPORT GRAND PRIX', bg1: '#160d24', bg2: '#2f1438', fg: '#ffd46b', stripe: '#28d8ff' },
      { text: 'SUPERIOR TIRES  ·  GT', bg1: '#1d100a', bg2: '#3a1d10', fg: '#ffffff', stripe: '#ffaa2b' },
      { text: 'APEX NIGHT CIRCUIT', bg1: '#071c28', bg2: '#0f384e', fg: '#78f0ff', stripe: '#ff4848' },
    ];
    const barrierBoards: AtlasRect[] = [];
    barDefs.forEach((b, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = col * 512;
      const y = 384 + row * 128;
      const gr = g.createLinearGradient(x, y, x + 512, y);
      gr.addColorStop(0, b.bg1);
      gr.addColorStop(1, b.bg2);
      g.fillStyle = gr;
      g.fillRect(x, y, 512, 128);
      g.fillStyle = b.stripe;
      g.fillRect(x, y, 512, 12);
      g.fillRect(x, y + 116, 512, 12);
      g.fillStyle = b.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 38px Inter, Segoe UI, sans-serif';
      g.fillText(b.text, x + 256, y + 66);
      barrierBoards.push(toUv(x, y, 512, 128));
    });

    // 3) 4 Vertical Street-Level Downtown LED Blade Signs (x: 0..512, y: 640..1024, 4 cols x 128x384)
    const bladeDefs: Array<{ letters: string[]; bg: string; fg: string; trim: string }> = [
      { letters: ['H', 'O', 'T', 'E', 'L'], bg: '#160c22', fg: '#ffd978', trim: '#ff7b38' },
      { letters: ['C', 'I', 'V', 'I', 'C'], bg: '#091b2e', fg: '#ffffff', trim: '#32d8ff' },
      { letters: ['A', 'P', 'E', 'X'], bg: '#1e0b16', fg: '#ff5268', trim: '#ffd166' },
      { letters: ['L', 'I', 'V', 'E'], bg: '#0a201d', fg: '#58ffba', trim: '#28d8ff' },
    ];
    const bladeSigns: AtlasRect[] = [];
    bladeDefs.forEach((bl, idx) => {
      const x = idx * 128;
      const y = 640;
      g.fillStyle = bl.bg;
      g.fillRect(x, y, 128, 384);
      g.strokeStyle = bl.trim;
      g.lineWidth = 8;
      g.strokeRect(x + 8, y + 8, 112, 368);
      g.fillStyle = bl.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const step = 330 / bl.letters.length;
      g.font = '900 54px Inter, Segoe UI, sans-serif';
      bl.letters.forEach((ch, li) => {
        g.fillText(ch, x + 64, y + 34 + step * (li + 0.5));
      });
      bladeSigns.push(toUv(x, y, 128, 384));
    });

    // 4) Singapore-Style LED Corner Chevrons (>>> and <<<), FIA Green Panel & Overhead Sector Arch (x: 512..1024, y: 640..1024)
    const drawChevronTile = (x: number, y: number, dir: 1 | -1): AtlasRect => {
      g.fillStyle = '#0c0e14';
      g.fillRect(x, y, 256, 128);
      g.strokeStyle = '#ff6a1a';
      g.lineWidth = 5;
      g.strokeRect(x + 4, y + 4, 248, 120);
      for (let k = 0; k < 3; k++) {
        const cx = x + 46 + k * 74;
        g.fillStyle = k === 1 ? '#ff4422' : '#ffaa1d';
        g.beginPath();
        if (dir === 1) {
          g.moveTo(cx - 20, y + 22);
          g.lineTo(cx + 8, y + 22);
          g.lineTo(cx + 34, y + 64);
          g.lineTo(cx + 8, y + 106);
          g.lineTo(cx - 20, y + 106);
          g.lineTo(cx + 6, y + 64);
        } else {
          g.moveTo(cx + 30, y + 22);
          g.lineTo(cx + 2, y + 22);
          g.lineTo(cx - 24, y + 64);
          g.lineTo(cx + 2, y + 106);
          g.lineTo(cx + 30, y + 106);
          g.lineTo(cx + 4, y + 64);
        }
        g.closePath();
        g.fill();
      }
      return toUv(x, y, 256, 128);
    };
    const chevronRight = drawChevronTile(512, 640, 1);
    const chevronLeft = drawChevronTile(768, 640, -1);

    // FIA Digital Green-Flag / Track Status LED Panel (x: 512..768, y: 768..896)
    g.fillStyle = '#07140d';
    g.fillRect(512, 768, 256, 128);
    g.strokeStyle = '#24ff6e';
    g.lineWidth = 8;
    g.strokeRect(518, 774, 244, 116);
    g.fillStyle = '#24ff6e';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 44px Inter, Segoe UI, sans-serif';
    g.fillText('GREEN', 640, 818);
    g.font = '800 22px Inter, Segoe UI, sans-serif';
    g.fillStyle = '#c8ffe0';
    g.fillText('TRACK CLEAR', 640, 862);
    const fiaGreen = toUv(512, 768, 256, 128);

    // Overhead Sector Bridge Illuminated LED Header (x: 512..1024, y: 896..1024)
    const sg = g.createLinearGradient(512, 896, 1024, 896);
    sg.addColorStop(0, '#091832');
    sg.addColorStop(0.5, '#172e5a');
    sg.addColorStop(1, '#091832');
    g.fillStyle = sg;
    g.fillRect(512, 896, 512, 128);
    g.fillStyle = '#28d8ff';
    g.fillRect(512, 896, 512, 10);
    g.fillStyle = '#ff6b2b';
    g.fillRect(512, 1014, 512, 10);
    g.fillStyle = '#ffffff';
    g.font = '900 42px Inter, Segoe UI, sans-serif';
    g.fillText('IRONPORT NIGHT GP', 768, 948);
    g.fillStyle = '#ffd166';
    g.font = '800 22px Inter, Segoe UI, sans-serif';
    g.fillText('PLAJAH MOTORSPORT  ·  APEX CHAMPIONSHIP', 768, 990);
    const sectorBridge = toUv(512, 896, 512, 128);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;

    return {
      tex,
      rects: { skySigns, bladeSigns, barrierBoards, chevronRight, chevronLeft, fiaGreen, sectorBridge },
    };
  }

  private buildArchMaterial(): THREE.Material {
    if (this.useWebGpu) {
      const mat = new THREE_GPU.MeshBasicNodeMaterial({ fog: true, vertexColors: true });
      const nightOn = smoothstep(float(0.28), float(0.76), this.uNight);
      const wave = sin(positionWorld.x.mul(0.024).add(positionWorld.z.mul(0.024)).sub(this.uTime.mul(0.85))).mul(0.08).add(0.96);
      // Strictly night-only architectural lighting: dark anodized architectural trim in daylight (ZERO bright neon in daytime!) -> luminous luxury glow at dusk & night!
      const gain = mix(float(0.08), float(1.62), nightOn).mul(wave);
      mat.colorNode = vertexColor().rgb.mul(gain);
      return mat as unknown as THREE.Material;
    }
    this.webglArchMat = new THREE.MeshBasicMaterial({ color: 0x161a22, vertexColors: true, fog: true });
    return this.webglArchMat;
  }

  private buildSignageAtlasMaterial(): THREE.Material {
    if (this.useWebGpu) {
      const mat = new THREE_GPU.MeshBasicNodeMaterial({ fog: true, side: THREE.DoubleSide });
      const sUv = uv();
      const samp = tslTexture(this.signageAtlasTex as unknown as THREE_GPU.Texture, sUv).rgb;
      // Understated physical anodized signboard in daylight -> crisp luminous glow at dusk & night!
      const nit = mix(float(0.68), float(1.38), this.uNight);
      mat.colorNode = samp.mul(nit);
      return mat as unknown as THREE.Material;
    }
    return new THREE.MeshBasicMaterial({ map: this.signageAtlasTex, side: THREE.DoubleSide, fog: true });
  }

  private buildVideoWallMaterial(): THREE.Material {
    if (this.useWebGpu) {
      const mat = new THREE_GPU.MeshBasicNodeMaterial({ fog: true, side: THREE.DoubleSide });
      const screenUv = uv();
      // WebGPU RenderTarget texture origin is top-left (flipY = false) while CanvasTexture is bottom-left -> flip V so live 3D TV footage is 100% RIGHT-SIDE UP!
      const feedUv = vec2(screenUv.x, float(1.0).sub(screenUv.y));
      const feedRaw = tslTexture(this.feedRenderTarget.texture as unknown as THREE_GPU.Texture, feedUv).rgb;
      const feedMapped = clamp(feedRaw.div(feedRaw.add(vec3(0.42, 0.42, 0.42))).mul(1.42), 0.0, 1.35);
      const ov = tslTexture(this.overlayTex as unknown as THREE_GPU.Texture, screenUv);
      const fallbackBg = vec3(0.04, 0.07, 0.14);
      const baseVid = mix(fallbackBg, feedMapped, this.uFeedReady);
      let composed = mix(baseVid, ov.rgb, ov.a);

      // Authentic hardware LED diode dot-pitch grid (visible up close, cleanly fades at distance!)
      const camD = length(positionWorld.sub(cameraPosition));
      const pitchFade = float(1.0).sub(smoothstep(float(28.0), float(125.0), camD));
      const dotX = sin(screenUv.x.mul(360.0)).mul(0.5).add(0.5);
      const dotY = sin(screenUv.y.mul(202.0)).mul(0.5).add(0.5);
      const ledGrid = float(1.0).sub(pitchFade.mul(float(1.0).sub(dotX.mul(dotY)).mul(0.20)));
      const edgeX = smoothstep(float(0.0), float(0.028), screenUv.x).mul(smoothstep(float(0.0), float(0.028), float(1.0).sub(screenUv.x)));
      const edgeY = smoothstep(float(0.0), float(0.038), screenUv.y).mul(smoothstep(float(0.0), float(0.038), float(1.0).sub(screenUv.y)));
      const nitBoost = mix(float(1.05), float(1.30), this.uNight);
      composed = composed.mul(ledGrid).mul(float(0.84).add(edgeX.mul(edgeY).mul(0.16))).mul(nitBoost);
      mat.colorNode = composed;
      return mat as unknown as THREE.Material;
    }
    this.webglVideoMat = new THREE.MeshBasicMaterial({ map: this.overlayTex, side: THREE.DoubleSide, fog: true });
    return this.webglVideoMat;
  }

  private buildRibbonMaterial(): THREE.Material {
    if (this.useWebGpu) {
      const mat = new THREE_GPU.MeshBasicNodeMaterial({ fog: true, side: THREE.DoubleSide });
      const rUv = uv();
      const samp = tslTexture(this.ribbonTex as unknown as THREE_GPU.Texture, rUv).rgb;
      const camD = length(positionWorld.sub(cameraPosition));
      const pitchFade = float(1.0).sub(smoothstep(float(22.0), float(95.0), camD));
      const scan = float(1.0).sub(pitchFade.mul(sin(rUv.y.mul(120.0)).mul(0.5).add(0.5)).mul(0.16));
      const nit = mix(float(0.95), float(1.40), this.uNight);
      mat.colorNode = samp.mul(scan).mul(nit);
      return mat as unknown as THREE.Material;
    }
    return new THREE.MeshBasicMaterial({ map: this.ribbonTex, side: THREE.DoubleSide, fog: true });
  }

  private nearestCircuitInfo(x: number, z: number): { dist: number; idx: number; px: number; pz: number } {
    const P = this.cityPath;
    let bestD2 = 1e18;
    let bestI = 0;
    for (let i = 0; i < P.length; i += 2) {
      const dx = P[i].x - x;
      const dz = P[i].z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestI = i;
      }
    }
    const p = P[bestI] ?? { x: 0, z: 0 };
    return { dist: Math.sqrt(bestD2), idx: bestI, px: p.x, pz: p.z };
  }

  private pathTangent(idx: number): [number, number] {
    const P = this.cityPath;
    const n = P.length;
    if (n < 2) return [0, 1];
    const a = P[(idx - 1 + n) % n];
    const b = P[(idx + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  /** Helper to push a textured UV-remapped quad facing outward along yaw `ry` into a target geometry batch. */
  private pushAtlasQuad(
    target: THREE.BufferGeometry[],
    cx: number, cy: number, cz: number,
    w: number, h: number, ry: number,
    rect: AtlasRect,
    doubleSidedOffset = 0,
  ): void {
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(up, ry);
    const nx = Math.sin(ry);
    const nz = Math.cos(ry);
    const m4 = new THREE.Matrix4();

    const makeFace = (ox: number, oz: number, rotY: number): void => {
      const p = new THREE.PlaneGeometry(w, h);
      const uvAttr = p.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uvAttr.count; i++) {
        const u = uvAttr.getX(i);
        const v = uvAttr.getY(i);
        uvAttr.setXY(i, rect.u0 + u * (rect.u1 - rect.u0), rect.v0 + v * (rect.v1 - rect.v0));
      }
      q.setFromAxisAngle(up, rotY);
      m4.compose(new THREE.Vector3(cx + ox, cy, cz + oz), q, new THREE.Vector3(1, 1, 1));
      p.applyMatrix4(m4);
      target.push(p);
    };

    makeFace(nx * 0.04, nz * 0.04, ry);
    if (doubleSidedOffset > 0) {
      makeFace(-nx * doubleSidedOffset, -nz * doubleSidedOffset, ry + Math.PI);
    }
  }

  private pushCabinetBox(
    target: THREE.BufferGeometry[],
    cx: number, cy: number, cz: number,
    w: number, h: number, d: number, ry: number,
  ): void {
    const g = new THREE.BoxGeometry(w, h, d);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m4);
    target.push(g);
  }

  /**
   * Bespoke Night-Only Architectural Lighting ONLY for Named Historic Detroit Hero Landmarks
   * (NEVER cookie-cutter neon boxes on generic buildings, and ZERO bright neon in daytime!)
   * + Rooftop Corporate Sky-Signs + Street-Level Illuminated Blade Signs!
   */
  private buildSelectiveArchitecturalLighting(
    opts: CityBroadcastOpts,
    archMat: THREE.Material,
    beaconMat: THREE.Material,
    signGeos: THREE.BufferGeometry[],
    frameGeos: THREE.BufferGeometry[],
  ): void {
    const archGeos: THREE.BufferGeometry[] = [];
    const beaconGeos: THREE.BufferGeometry[] = [];
    const skySignPlaced: Array<{ x: number; z: number }> = [];
    const bladePlaced: Array<{ x: number; z: number }> = [];

    const _c = new THREE.Color();
    const _up = new THREE.Vector3(0, 1, 0);
    const _q = new THREE.Quaternion();
    const _m4 = new THREE.Matrix4();
    const _s1 = new THREE.Vector3(1, 1, 1);

    const pushArchGeo = (raw: THREE.BufferGeometry, x: number, y: number, z: number, ry: number, hex: number): void => {
      const g = raw.index ? raw.toNonIndexed() : raw.clone();
      raw.dispose();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      _c.setHex(hex);
      const count = g.attributes.position.count;
      const cols = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        cols[i * 3] = _c.r;
        cols[i * 3 + 1] = _c.g;
        cols[i * 3 + 2] = _c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      _q.setFromAxisAngle(_up, ry);
      _m4.compose(new THREE.Vector3(x, y, z), _q, _s1);
      g.applyMatrix4(_m4);
      archGeos.push(g);
      this.counts.archBars++;
    };

    const pushArchBox = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, hex: number): void => {
      pushArchGeo(new THREE.BoxGeometry(sx, sy, sz), x, y, z, ry, hex);
    };

    const pushHaloRing = (cx: number, y: number, cz: number, radius: number, thickness: number, height: number, segs: number, hex: number): void => {
      const segLen = (2 * Math.PI * radius) / segs + thickness * 0.45;
      for (let k = 0; k < segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        const rx = cx + Math.cos(a) * radius;
        const rz = cz + Math.sin(a) * radius;
        pushArchBox(rx, y, rz, segLen, height, thickness, -a + Math.PI * 0.5, hex);
      }
    };

    const pushBeacon = (x: number, y: number, z: number, r = 0.65): void => {
      const s = new THREE.SphereGeometry(r, 8, 6);
      const g = s.index ? s.toNonIndexed() : s;
      if (g !== s) s.dispose();
      g.translate(x, y, z);
      beaconGeos.push(g);
    };

    for (const it of opts.cityItems) {
      if (it.h < 24) continue;
      if (it.kind === 'generic' && /house|bungalow|duplex|townhouse|diner|pharmacy|grocery|barber|coffee|gas|auto|strip/.test(it.slug)) continue;
      const cx = it.bx ?? it.x;
      const cz = it.bz ?? it.z;
      const info = this.nearestCircuitInfo(cx, cz);
      const isNamedHero = it.kind === 'hero' && it.h >= 75;
      if (!isNamedHero && info.dist > 460) continue;

      const phi = it.rotY;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      const gy = opts.groundMin(it) - 0.35;
      const top = gy + it.h;
      const hw = it.w * 0.5;
      const hd = it.d * 0.5;
      const at = (u: number, v: number): [number, number] => [cx + u * c + v * sn, cz - u * sn + v * c];

      // Determine track-facing facade for directional landmarks, sky-signs & vertical blade signs
      const faces = [
        { u: 0, v: hd, nx: sn, nz: c, span: it.w, ry: phi },
        { u: 0, v: -hd, nx: -sn, nz: -c, span: it.w, ry: phi + Math.PI },
        { u: hw, v: 0, nx: c, nz: -sn, span: it.d, ry: phi + Math.PI * 0.5 },
        { u: -hw, v: 0, nx: -c, nz: sn, span: it.d, ry: phi - Math.PI * 0.5 },
      ];
      const toX = info.px - cx;
      const toZ = info.pz - cz;
      const toL = Math.hypot(toX, toZ) || 1;
      let face = faces[0];
      let bestDot = -2;
      for (const f of faces) {
        const d = (f.nx * toX + f.nz * toZ) / toL;
        if (d > bestDot) { bestDot = d; face = f; }
      }

      // ── A) Street-Level Vertical Illuminated Blade Signs (Detroit Woodward / Singapore commercial street feel!) ──
      if (info.dist >= 15 && info.dist <= 68 && bestDot > 0.3 && bladePlaced.every((s) => Math.hypot(s.x - cx, s.z - cz) > 40) && this.counts.bladeSigns < 26) {
        const [fx, fz] = at(face.u, face.v);
        const bx = fx + face.nx * 1.65;
        const bz = fz + face.nz * 1.65;
        if (!opts.onCourse?.(bx, bz, 3.0)) {
          const bladeYaw = face.ry + Math.PI * 0.5;
          const bH = Math.min(9.5, Math.max(5.5, it.h * 0.24));
          const bW = bH * 0.32;
          const bY = gy + 5.8 + bH * 0.5;
          const rect = this.atlasRects.bladeSigns[this.counts.bladeSigns % this.atlasRects.bladeSigns.length];
          this.pushCabinetBox(frameGeos, bx, bY, bz, bW + 0.24, bH + 0.24, 0.26, bladeYaw);
          this.pushCabinetBox(frameGeos, fx + face.nx * 0.85, bY + bH * 0.28, fz + face.nz * 0.85, 0.22, 0.22, 1.7, face.ry);
          this.pushCabinetBox(frameGeos, fx + face.nx * 0.85, bY - bH * 0.28, fz + face.nz * 0.85, 0.22, 0.22, 1.7, face.ry);
          this.pushAtlasQuad(signGeos, bx + Math.sin(bladeYaw) * 0.14, bY, bz + Math.cos(bladeYaw) * 0.14, bW, bH, bladeYaw, rect, 0.32);
          bladePlaced.push({ x: cx, z: cz });
          this.counts.bladeSigns++;
        }
      }

      // ── B) Backlit Rooftop Corporate Sky-Signs on Prominent Tall Skyline Towers ──
      if (info.dist <= 460 && it.h >= 54 && face.span >= 18 && skySignPlaced.every((s) => Math.hypot(s.x - cx, s.z - cz) > 135) && this.counts.skySigns < 12) {
        const [fx, fz] = at(face.u, face.v);
        const signW = Math.min(24, face.span * 0.78);
        const signH = signW * 0.25;
        const sx = fx + face.nx * 0.52;
        const sz = fz + face.nz * 0.52;
        const sy = top - signH * 0.55 - 0.8;
        const rect = this.atlasRects.skySigns[this.counts.skySigns % this.atlasRects.skySigns.length];
        this.pushCabinetBox(frameGeos, sx - face.nx * 0.28, sy, sz - face.nz * 0.28, signW + 0.6, signH + 0.6, 0.45, face.ry);
        this.pushAtlasQuad(signGeos, sx, sy, sz, signW, signH, face.ry, rect, 0);
        skySignPlaced.push({ x: cx, z: cz });
        this.counts.skySigns++;
      }

      // ── C) Bespoke Architect-Specific NIGHT-ONLY Lighting ONLY on Named Historic Detroit Hero Landmarks! ──
      if (it.kind !== 'hero') continue;

      if (it.slug === 'ironport-towers') {
        // Detroit Renaissance Center 5-cylinder cluster: crisp ice-blue & lantern-white crown halo rings!
        pushHaloRing(cx, top - 2.6, cz, 24.5, 1.15, 1.55, 18, 0x72ecff);
        pushHaloRing(cx, top - 9.2, cz, 23.6, 0.85, 0.95, 18, 0xd8f4ff);
        const flankY = gy + it.h * 0.72;
        const flanks: Array<[number, number]> = [[-36, -28], [36, -28], [-36, 28], [36, 28]];
        for (const [fu, fv] of flanks) {
          const [fx, fz] = at(fu, fv);
          pushHaloRing(fx, flankY, fz, 14.2, 0.85, 1.15, 12, 0x42caff);
        }
        pushBeacon(cx, top + 6.5, cz, 0.9);
        this.counts.litLandmarks++;
      } else if (it.slug === 'penobscot-tower') {
        // Historic Art-Deco Penobscot Building: warm champagne-gold stepped crown fascia + iconic red rooftop beacon orb!
        const drawCrownBand = (yPos: number, scale: number, thick: number, col: number): void => {
          const w = it.w * scale + 0.7;
          const d = it.d * scale + 0.7;
          const [n1x, n1z] = at(0, d * 0.5);
          const [n2x, n2z] = at(0, -d * 0.5);
          const [e1x, e1z] = at(w * 0.5, 0);
          const [e2x, e2z] = at(-w * 0.5, 0);
          pushArchBox(n1x, yPos, n1z, w, thick, 0.65, phi, col);
          pushArchBox(n2x, yPos, n2z, w, thick, 0.65, phi, col);
          pushArchBox(e1x, yPos, e1z, 0.65, thick, d, phi, col);
          pushArchBox(e2x, yPos, e2z, 0.65, thick, d, phi, col);
        };
        drawCrownBand(top - 16.0, 0.86, 1.15, 0xffc65c);
        drawCrownBand(top - 5.5, 0.64, 1.35, 0xffe09c);
        pushArchBox(cx, top + 11.0, cz, 1.1, 22.0, 1.1, phi, 0xffd27a);
        pushBeacon(cx, top + 23.0, cz, 1.35);
        this.counts.litLandmarks++;
      } else if (it.slug === 'the-guardian') {
        // Cathedral of Finance: Art-Deco warm amber/champagne stepped pinnacles + upper corner pilasters
        const bandH = it.h * 0.22;
        const corners: Array<[number, number]> = [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]];
        for (const [cu, cv] of corners) {
          const [kx, kz] = at(cu * 0.96, cv * 0.96);
          pushArchBox(kx, top - bandH * 0.5, kz, 0.95, bandH, 0.95, phi, 0xffc254);
        }
        const [f1x, f1z] = at(0, hd + 0.4);
        const [f2x, f2z] = at(0, -hd - 0.4);
        pushArchBox(f1x, top - 1.4, f1z, it.w * 0.94, 1.45, 0.72, phi, 0xffe4a0);
        pushArchBox(f2x, top - 1.4, f2z, it.w * 0.94, 1.45, 0.72, phi, 0xffe4a0);
        pushArchBox(cx, top + 5.5, cz, it.w * 0.42, 1.2, it.d * 0.42, phi, 0xffb347);
        pushBeacon(cx, top + 14.5, cz, 0.85);
        this.counts.litLandmarks++;
      } else if (it.slug === 'ledger-tower') {
        // 3 stacked razor-slim ice-white executive crown louvers on parapet only
        for (let k = 0; k < 3; k++) {
          const yL = top - 1.2 - k * 2.6;
          const [fx, fz] = at(0, hd + 0.35);
          const [bx, bz] = at(0, -hd - 0.35);
          const [rx, rz] = at(hw + 0.35, 0);
          const [lx, lz] = at(-hw - 0.35, 0);
          pushArchBox(fx, yL, fz, it.w + 0.6, 0.55, 0.55, phi, 0xe6f4ff);
          pushArchBox(bx, yL, bz, it.w + 0.6, 0.55, 0.55, phi, 0xe6f4ff);
          pushArchBox(rx, yL, rz, 0.55, 0.55, it.d + 0.6, phi, 0xe6f4ff);
          pushArchBox(lx, yL, lz, 0.55, 0.55, it.d + 0.6, phi, 0xe6f4ff);
        }
        pushBeacon(cx, top + 5.0, cz, 0.7);
        this.counts.litLandmarks++;
      } else if (it.slug === 'kestrel-hq') {
        // Twin Marina-cyan vertical luminous spine ribs on the upper 38% of the track-facing facade + slim crown bar
        const spineH = it.h * 0.38;
        const [fx, fz] = at(face.u, face.v);
        const tx = -face.nz;
        const tz = face.nx;
        for (const s of [-1, 1]) {
          const ox = fx + face.nx * 0.52 + tx * s * (face.span * 0.14);
          const oz = fz + face.nz * 0.52 + tz * s * (face.span * 0.14);
          pushArchBox(ox, top - spineH * 0.5 - 1.5, oz, 0.72, spineH, 0.55, face.ry, 0x2cd8ff);
        }
        pushArchBox(fx + face.nx * 0.55, top - 1.1, fz + face.nz * 0.55, face.span * 0.88, 1.0, 0.6, face.ry, 0x9ef4ff);
        this.counts.litLandmarks++;
      } else if (it.slug === 'aurelia-hq') {
        // Asymmetric warm amber upper corner blade + rooftop mast beacon
        const bladeH = it.h * 0.32;
        const [kx, kz] = at(hw + 0.35, hd + 0.35);
        pushArchBox(kx, top - bladeH * 0.5 + 3.0, kz, 1.05, bladeH + 6.0, 1.05, phi, 0xff9440);
        pushBeacon(kx, top + 7.2, kz, 0.75);
        this.counts.litLandmarks++;
      } else if (it.slug === 'meridian-hq' || it.slug === 'parthenon-casino' || it.slug === 'foundry-tower') {
        // Restrained single warm champagne crown bar & subtle lower marquee glow
        const [fx, fz] = at(face.u, face.v);
        pushArchBox(fx + face.nx * 0.5, top - 1.3, fz + face.nz * 0.5, face.span * 0.86, 0.95, 0.55, face.ry, 0xffd67a);
        pushArchBox(fx + face.nx * 0.65, gy + 11.5, fz + face.nz * 0.65, face.span * 0.72, 0.55, 0.65, face.ry, 0xffba52);
        this.counts.litLandmarks++;
      }
    }

    if (archGeos.length > 0) {
      const mergedArch = mergeGeometries(archGeos, false);
      for (const g of archGeos) g.dispose();
      if (mergedArch) {
        const archMesh = new THREE.Mesh(mergedArch, archMat);
        archMesh.name = 'hero-bespoke-night-lighting';
        archMesh.castShadow = false;
        archMesh.receiveShadow = false;
        archMesh.frustumCulled = false;
        this.group.add(archMesh);
      }
    }
    if (beaconGeos.length > 0) {
      const mergedBeacons = mergeGeometries(beaconGeos, false);
      for (const g of beaconGeos) g.dispose();
      if (mergedBeacons) {
        const bMesh = new THREE.Mesh(mergedBeacons, beaconMat);
        bMesh.name = 'hero-aviation-beacons';
        bMesh.castShadow = false;
        bMesh.receiveShadow = false;
        bMesh.frustumCulled = false;
        this.group.add(bMesh);
      }
    }
    void ARCH_PALETTE; void hash2;
  }

  /**
   * Singapore Marina Bay Night GP Style LED Track Assets along the ENTIRE Ironport Grand Circuit:
   *   - Trackside Illuminated LED Barrier Sponsor Boards mounted cleanly ON TOP of straight concrete barriers (never clipping corners or pit wall!)
   *   - Glowing LED Corner Chevron Direction Boards (>>> / <<<) elevated cleanly behind outside barriers at every corner
   *   - FIA Digital LED Green-Flag Marshal Panels mounted high & clear on catch-fence stanchions
   *   - Illuminated Overhead LED Sector 2 & Sector 3 Bridge Signboards mounted FLUSH ON TOP of the 6.0 m overhead trusses (never on the ground!)
   */
  private buildLedTrackAssets(
    opts: CityBroadcastOpts,
    signGeos: THREE.BufferGeometry[],
    frameGeos: THREE.BufferGeometry[],
  ): void {
    const P = opts.cityPath;
    const n = P.length;
    if (n < 24) return;
    const HALF = opts.halfTrackWidth;

    // 1) Trackside Illuminated LED Barrier Sponsor Boards & FIA Green-Flag Panels around the entire lap
    const boardStride = 5; // ~30 m cadence along straights -> vibrant Singapore GP night corridor right off the grid!
    for (let i = 2; i < n - 2; i += boardStride) {
      const p = P[i];
      const [tx, tz] = this.pathTangent(i);
      const [txA, tzA] = this.pathTangent((i - 2 + n) % n);
      const [txB, tzB] = this.pathTangent((i + 2) % n);
      const bend = Math.abs(txA * tzB - tzA * txB);
      // Only mount straight barrier LED planks on straight/gentle segments so a straight plank NEVER chord-cuts through a curved corner barrier!
      if (bend > 0.12) continue;

      const roadY = opts.groundAt(p.x, p.z) + 0.12;
      // Along pit straight (indices 0..46), keep left pit-lane wall clear and mount continuous vibrant LED boards along the right wall (side = +1)!
      const side = i <= 46 ? 1 : ((Math.floor(i / boardStride) & 1) === 0 ? 1 : -1);

      // Mount cleanly BEHIND/ATOP the 1.07 m concrete Jersey barrier (HALF + 1.56 m, bottom edge at roadY + 1.24 m -> 17 cm clear above barrier cap!)
      const off = HALF + 1.56;
      const bx = p.x - tz * off * side;
      const bz = p.z + tx * off * side;
      if (opts.onCourse?.(bx, bz, 1.0)) continue;
      const by = Math.max(roadY, opts.groundAt(bx, bz));
      const inwardNx = tz * side;
      const inwardNz = -tx * side;
      const faceYaw = Math.atan2(inwardNx, inwardNz);

      const boardW = 5.4;
      const boardH = 0.84;
      const boardY = by + 1.66; // bottom at +1.24 m -> cleanly perched on stanchions atop the 1.07 m barrier, NEVER intersecting concrete or track!
      const rect = this.atlasRects.barrierBoards[(Math.floor(i / boardStride)) % this.atlasRects.barrierBoards.length];
      // Twin short steel mounting stanchions anchoring the LED board to the concrete barrier cap
      for (const sx of [-1.8, 1.8]) {
        const px = bx + tx * sx - inwardNx * 0.14;
        const pz = bz + tz * sx - inwardNz * 0.14;
        this.pushCabinetBox(frameGeos, px, by + 1.15, pz, 0.12, 0.42, 0.12, faceYaw);
      }
      this.pushCabinetBox(frameGeos, bx - inwardNx * 0.14, boardY, bz - inwardNz * 0.14, boardW + 0.18, boardH + 0.14, 0.18, faceYaw);
      this.pushAtlasQuad(signGeos, bx, boardY, bz, boardW, boardH, faceYaw, rect, 0);
      this.counts.trackLedBoards++;

      // Every 4th board, place an elevated FIA Digital Green-Flag LED Marshal Panel cleanly clear above the opposite barrier!
      if ((Math.floor(i / boardStride) % 4) === 0) {
        const oppSide = -side;
        if (i > 46 || oppSide !== -1) {
          const fx = p.x - tz * (HALF + 2.15) * oppSide;
          const fz = p.z + tx * (HALF + 2.15) * oppSide;
          if (!opts.onCourse?.(fx, fz, 1.0)) {
            const fy = Math.max(roadY, opts.groundAt(fx, fz));
            const fYaw = Math.atan2(-tx, -tz) - oppSide * 0.24;
            this.pushCabinetBox(frameGeos, fx, fy + 2.1, fz, 0.18, 4.2, 0.18, fYaw);
            this.pushCabinetBox(frameGeos, fx - Math.sin(fYaw) * 0.15, fy + 4.05, fz - Math.cos(fYaw) * 0.15, 2.25, 1.20, 0.20, fYaw);
            this.pushAtlasQuad(signGeos, fx, fy + 4.05, fz, 2.05, 1.02, fYaw, this.atlasRects.fiaGreen, 0);
          }
        }
      }
    }

    // 2) Glowing LED Corner Chevron Light Boards (>>> / <<<) automatically detected at every turn along cityPath!
    const chevronPlaced: Array<{ x: number; z: number }> = [];
    for (let i = 4; i < n - 4; i += 2) {
      const [t0x, t0z] = this.pathTangent((i - 4 + n) % n);
      const [t1x, t1z] = this.pathTangent((i + 4) % n);
      const cross = t0x * t1z - t0z * t1x; // > 0 right turn, < 0 left turn
      if (Math.abs(cross) < 0.15) continue;
      const p = P[i];
      if (chevronPlaced.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 38)) continue;

      const outsideSide = cross > 0 ? -1 : 1;
      const rect = cross > 0 ? this.atlasRects.chevronRight : this.atlasRects.chevronLeft;
      // Place a sweeping cluster of 3 illuminated LED corner chevron boards mounted high & clear outside the barrier!
      for (const di of [-2, 0, 2]) {
        const ci = (i + di + n) % n;
        const cp = P[ci];
        const [ctx, ctz] = this.pathTangent(ci);
        const cx = cp.x - ctz * (HALF + 2.35) * outsideSide;
        const cz = cp.z + ctx * (HALF + 2.35) * outsideSide;
        if (opts.onCourse?.(cx, cz, 1.2)) continue;
        const cy = Math.max(opts.groundAt(cp.x, cp.z) + 0.12, opts.groundAt(cx, cz));
        const faceYaw = Math.atan2(-ctx, -ctz) - outsideSide * 0.26;
        this.pushCabinetBox(frameGeos, cx, cy + 1.35, cz, 0.18, 2.7, 0.18, faceYaw);
        this.pushCabinetBox(frameGeos, cx - Math.sin(faceYaw) * 0.15, cy + 2.65, cz - Math.cos(faceYaw) * 0.15, 3.2, 1.42, 0.20, faceYaw);
        this.pushAtlasQuad(signGeos, cx, cy + 2.65, cz, 2.95, 1.22, faceYaw, rect, 0);
        this.counts.chevronBoards++;
      }
      chevronPlaced.push({ x: p.x, z: p.z });
    }

    // 3) Illuminated Overhead LED Sector 2 & Sector 3 Bridge Arches mounted FLUSH ON TOP of the 6.0 m truss crossbar!
    for (const idx of [Math.floor(n / 3), Math.floor((2 * n) / 3)]) {
      const p = P[idx];
      const [tx, tz] = this.pathTangent(idx);
      const gy = opts.groundAt(p.x, p.z);
      const faceYaw = Math.atan2(-tx, -tz);
      const archW = (HALF + 1.8) * 2.0;
      // Truss crossbar in region.ts sits at gy + 6.0 (top at gy + 6.40) -> center signboard at gy + 7.45 (bottom at gy + 6.45, 100% mounted atop truss!)
      const signY = gy + 7.45;
      this.pushCabinetBox(frameGeos, p.x, signY, p.z, archW + 0.8, 2.0, 0.82, faceYaw);
      this.pushAtlasQuad(signGeos, p.x - tx * 0.46, signY, p.z - tz * 0.46, archW, 1.78, faceYaw, this.atlasRects.sectorBridge, 0.92);
    }
  }

  private buildVideoWallsAndRibbons(
    opts: CityBroadcastOpts,
    videoMat: THREE.Material,
    ribbonMat: THREE.Material,
    cabinetMat: THREE.Material,
    beaconMat: THREE.Material,
    _signGeos: THREE.BufferGeometry[],
    sharedFrameGeos: THREE.BufferGeometry[],
  ): void {
    const P = opts.cityPath;
    const n = P.length;
    if (n < 16) return;

    const screenGeos: THREE.BufferGeometry[] = [];
    const ribbonGeos: THREE.BufferGeometry[] = [];
    const beaconGeos: THREE.BufferGeometry[] = [];

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    const addScreenPanel = (
      target: THREE.BufferGeometry[],
      cx: number, cy: number, cz: number,
      w: number, h: number,
      ry: number,
      withCabinet = true,
      doubleSided = false,
    ): void => {
      q.setFromAxisAngle(up, ry);
      const nx = Math.sin(ry);
      const nz = Math.cos(ry);

      if (withCabinet) {
        this.pushCabinetBox(sharedFrameGeos, cx - nx * 0.30, cy, cz - nz * 0.30, w + 0.75, h + 0.75, 0.50, ry);
      }

      const pFront = new THREE.PlaneGeometry(w, h);
      m4.compose(new THREE.Vector3(cx + nx * 0.12, cy, cz + nz * 0.12), q, new THREE.Vector3(1, 1, 1));
      pFront.applyMatrix4(m4);
      target.push(pFront);

      if (doubleSided) {
        const pBack = new THREE.PlaneGeometry(w, h);
        const qBack = new THREE.Quaternion().setFromAxisAngle(up, ry + Math.PI);
        m4.compose(new THREE.Vector3(cx - nx * 0.72, cy, cz - nz * 0.72), qBack, new THREE.Vector3(1, 1, 1));
        pBack.applyMatrix4(m4);
        target.push(pBack);
      }
    };

    // ── A) HERO START/FINISH OVERHEAD MEGA-BROADCAST WALL & CLEAN UNOBSTRUCTED TICKER RIBBON ──
    {
      const gi = ((opts.gantryIndex % n) + n) % n;
      const g0 = P[gi];
      const [gx, gz] = this.pathTangent(gi);
      const gy = opts.groundAt(g0.x, g0.z);
      const faceStartYaw = Math.atan2(-gx, -gz);
      // Elevated widescreen live broadcast screen centered right above the Start/Finish gantry arch
      addScreenPanel(screenGeos, g0.x, gy + 14.2, g0.z, 17.6, 9.9, faceStartYaw, true, true);
      const rx = -gz;
      const rz = gx;
      for (const side of [-1, 1]) {
        const px = g0.x + rx * side * (opts.halfTrackWidth + 2.5);
        const pz = g0.z + rz * side * (opts.halfTrackWidth + 2.5);
        this.pushCabinetBox(sharedFrameGeos, px, gy + 11.4, pz, 0.9, 5.6, 0.9, faceStartYaw);
      }
      // Clean unobstructed animated LED ribbon mounted PROUD on the front face of the Start/Finish gantry header!
      addScreenPanel(ribbonGeos, g0.x - gx * 1.48, gy + 8.75, g0.z - gz * 1.48, 13.8, 1.38, faceStartYaw, false, false);
      this.counts.jumbotrons++;
      this.counts.ribbons++;
    }

    // ── B) 5 ELEVATED TRACKSIDE STEEL-TRUSS BROADCAST JUMBOTRON TOWERS AROUND THE CIRCUIT ──
    const jumboFracs = [0.14, 0.30, 0.48, 0.66, 0.84];
    for (let ji = 0; ji < jumboFracs.length; ji++) {
      const idx = Math.floor(n * jumboFracs[ji]) % n;
      const p = P[idx];
      const [tx, tz] = this.pathTangent(idx);
      const side = ji % 2 === 0 ? 1 : -1;
      const off = opts.halfTrackWidth + 13.5;
      const jx = p.x - tz * off * side;
      const jz = p.z + tx * off * side;
      if (opts.onCourse?.(jx, jz, 4.5)) continue;
      const jy = opts.groundAt(jx, jz);
      // Angle tower TOWARD approaching drivers on the track (-side * 0.34 rad) and render double-sided live video + ticker!
      const faceYaw = Math.atan2(-tx, -tz) - side * 0.34;
      const screenW = 16.0;
      const screenH = 9.0;
      const centerY = jy + 13.4;

      const sxAxis = Math.cos(faceYaw);
      const szAxis = -Math.sin(faceYaw);
      for (const s of [-1, 1]) {
        this.pushCabinetBox(sharedFrameGeos, jx + sxAxis * s * 5.2, jy + 6.5, jz + szAxis * s * 5.2, 0.85, 13.0, 0.85, faceYaw);
      }
      this.pushCabinetBox(sharedFrameGeos, jx, jy + 8.3, jz, 11.4, 0.7, 0.7, faceYaw);
      addScreenPanel(screenGeos, jx, centerY, jz, screenW, screenH, faceYaw, true, true);
      addScreenPanel(ribbonGeos, jx + Math.sin(faceYaw) * 0.14, centerY - screenH * 0.5 - 1.15, jz + Math.cos(faceYaw) * 0.14, screenW, 1.50, faceYaw, true, true);
      for (const s of [-1, 1]) {
        const bg = new THREE.SphereGeometry(0.32, 6, 4);
        bg.translate(jx + sxAxis * s * (screenW * 0.48), centerY + screenH * 0.5 + 0.85, jz + szAxis * s * (screenW * 0.48));
        beaconGeos.push(bg);
      }
      this.counts.jumbotrons++;
      this.counts.ribbons++;
    }

    // ── C) BUILDING-MOUNTED GIANT LIVE BROADCAST VIDEO WALLS & PODIUM MARQUEE RIBBONS ──
    const placedWallSpots: Array<{ x: number; z: number }> = [];
    const placedRibbonSpots: Array<{ x: number; z: number }> = [];

    const nearBuildings: Array<{ it: BroadcastBuildingItem; info: { dist: number; idx: number; px: number; pz: number } }> = [];
    for (const it of opts.cityItems) {
      if (it.h < 22) continue;
      if (it.kind === 'generic' && /house|bungalow|duplex|townhouse|diner|pharmacy|grocery|barber|coffee|gas|auto|strip/.test(it.slug)) continue;
      const cx = it.bx ?? it.x;
      const cz = it.bz ?? it.z;
      const info = this.nearestCircuitInfo(cx, cz);
      if (info.dist < 16 || info.dist > 82) continue;
      nearBuildings.push({ it, info });
    }
    nearBuildings.sort((a, b) => (b.it.h - b.info.dist * 0.7) - (a.it.h - a.info.dist * 0.7));

    for (const { it, info } of nearBuildings) {
      const cx = it.bx ?? it.x;
      const cz = it.bz ?? it.z;
      const phi = it.rotY;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      const gy = opts.groundMin(it) - 0.35;
      const hw = it.w * 0.5;
      const hd = it.d * 0.5;
      const at = (u: number, v: number): [number, number] => [cx + u * c + v * sn, cz - u * sn + v * c];

      const faces = [
        { u: 0, v: hd, nx: sn, nz: c, span: it.w, ry: phi },
        { u: 0, v: -hd, nx: -sn, nz: -c, span: it.w, ry: phi + Math.PI },
        { u: hw, v: 0, nx: c, nz: -sn, span: it.d, ry: phi + Math.PI * 0.5 },
        { u: -hw, v: 0, nx: -c, nz: sn, span: it.d, ry: phi - Math.PI * 0.5 },
      ];
      const toTrackX = info.px - cx;
      const toTrackZ = info.pz - cz;
      const toLen = Math.hypot(toTrackX, toTrackZ) || 1;
      let bestFace = faces[0];
      let bestDot = -2;
      for (const f of faces) {
        const d = (f.nx * toTrackX + f.nz * toTrackZ) / toLen;
        if (d > bestDot) { bestDot = d; bestFace = f; }
      }
      if (bestDot < 0.25 || bestFace.span < 14) continue;

      const [fx0, fz0] = at(bestFace.u, bestFace.v);
      // Mount +0.95 m proud of wall + double-sided glowing face so sculpted v4 facade trims NEVER occlude or leave dark back boxes!
      const wx = fx0 + bestFace.nx * 0.95;
      const wz = fz0 + bestFace.nz * 0.95;
      if (opts.onCourse?.(wx, wz, 2.4)) continue;

      const farEnoughWall = placedWallSpots.every((s) => Math.hypot(s.x - wx, s.z - wz) > 135);
      if (this.counts.videoWalls < 14 && farEnoughWall && bestFace.span >= 16 && it.h >= 24) {
        const screenW = Math.min(24, Math.max(14.5, bestFace.span * 0.68));
        const screenH = screenW * (9 / 16);
        const mountY = gy + Math.min(it.h - screenH * 0.5 - 3.0, Math.max(14.0, Math.min(24.0, it.h * 0.40)));
        if (mountY - screenH * 0.5 > gy + 6.0) {
          addScreenPanel(screenGeos, wx, mountY, wz, screenW, screenH, bestFace.ry, true, true);
          placedWallSpots.push({ x: wx, z: wz });
          this.counts.videoWalls++;
        }
      }

      const farEnoughRib = placedRibbonSpots.every((s) => Math.hypot(s.x - wx, s.z - wz) > 78);
      if (this.counts.ribbons < 22 && farEnoughRib && bestFace.span >= 14) {
        const ribW = Math.min(26, bestFace.span * 0.80);
        const ribH = 2.35;
        const ribY = gy + 7.8;
        addScreenPanel(ribbonGeos, wx, ribY, wz, ribW, ribH, bestFace.ry, true, true);
        placedRibbonSpots.push({ x: wx, z: wz });
        this.counts.ribbons++;
      }
    }

    const addMerged = (geos: THREE.BufferGeometry[], mat: THREE.Material, name: string, trackAsScreen = false): void => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = name;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      if (trackAsScreen) this.screenMeshes.push(mesh);
    };

    void cabinetMat;
    addMerged(screenGeos, videoMat, 'led-broadcast-video-walls', true);
    addMerged(ribbonGeos, ribbonMat, 'led-marquee-ribbons', true);
    addMerged(beaconGeos, beaconMat, 'led-tower-beacons', false);
  }

  /** Advance broadcast camera director, animated LED ribbon ticker, and live broadcast graphics HUD. */
  update(dt: number, nowMs: number, tel: BroadcastTelemetry): void {
    this.elapsed += dt;
    if (this.useWebGpu) {
      this.uTime.value = this.elapsed;
      this.uNight.value = tel.nightK;
    } else if (this.webglArchMat) {
      const k = Math.max(0, Math.min(1, (tel.nightK - 0.28) / 0.48));
      this.webglArchMat.color.setScalar(0.08 + k * 0.92);
    }

    this.ribbonTex.offset.x = (this.elapsed * 0.14) % 1;

    this.shotTimer += dt;
    if (this.shotTimer >= 5.5) {
      this.shotTimer = 0;
      this.shotIndex = (this.shotIndex + 1) % BROADCAST_CAM_LABELS.length;
      this.shotAnchorSet = false;
    }

    if (tel.playerPos) {
      const p = tel.playerPos;
      const fx = Math.sin(tel.playerYaw);
      const fz = Math.cos(tel.playerYaw);
      const rx = fz;
      const rz = -fx;

      if (this.shotIndex === 0) {
        if (!this.shotAnchorSet || this.shotAnchor.distanceTo(p) > 95) {
          const lead = Math.max(32, Math.min(62, 26 + tel.playerSpeedMps * 1.1));
          const side = ((Math.floor(this.elapsed / 5.5) & 1) === 0 ? 1 : -1) * 11.5;
          const ax = p.x + fx * lead + rx * side;
          const az = p.z + fz * lead + rz * side;
          this.shotAnchor.set(ax, this.groundAt(ax, az) + 4.8, az);
          this.shotAnchorSet = true;
        }
        this.tvCamera.fov = 34;
        this.tvCamera.position.copy(this.shotAnchor);
        this.tmpLook.set(p.x + fx * 3.0, p.y + 1.15, p.z + fz * 3.0);
        this.tvCamera.lookAt(this.tmpLook);
      } else if (this.shotIndex === 1) {
        const sweep = Math.sin(this.elapsed * 0.45) * 14;
        const hx = p.x + fx * 22 + rx * (18 + sweep);
        const hz = p.z + fz * 22 + rz * (18 + sweep);
        this.tvCamera.fov = 46;
        this.tvCamera.position.set(hx, Math.max(p.y + 24, this.groundAt(hx, hz) + 22), hz);
        this.tmpLook.set(p.x + fx * 6, p.y + 1.2, p.z + fz * 6);
        this.tvCamera.lookAt(this.tmpLook);
      } else {
        const cx = p.x + fx * 8.6 + rx * 2.8;
        const cz = p.z + fz * 8.6 + rz * 2.8;
        this.tvCamera.fov = 48;
        this.tvCamera.position.set(cx, Math.max(p.y + 1.9, this.groundAt(cx, cz) + 1.4), cz);
        this.tmpLook.set(p.x - fx * 3.5, p.y + 0.95, p.z - fz * 3.5);
        this.tvCamera.lookAt(this.tmpLook);
      }
      this.tvCamera.updateProjectionMatrix();
      this.tvCamera.updateMatrixWorld();
    } else if (this.cityPath.length > 10) {
      const idx = Math.floor((this.elapsed * 2.2) % this.cityPath.length);
      const p = this.cityPath[idx];
      const [tx, tz] = this.pathTangent(idx);
      const ax = p.x - tz * 16;
      const az = p.z + tx * 16;
      this.tvCamera.fov = 48;
      this.tvCamera.position.set(ax, this.groundAt(ax, az) + 18, az);
      this.tmpPos.set(p.x + tx * 45, this.groundAt(p.x + tx * 45, p.z + tz * 45) + 6, p.z + tz * 45);
      this.tvCamera.lookAt(this.tmpPos);
      this.tvCamera.updateProjectionMatrix();
      this.tvCamera.updateMatrixWorld();
    }

    if (nowMs - this.lastOverlayMs >= 260) {
      this.lastOverlayMs = nowMs;
      this.drawBroadcastOverlay(tel, this.feedHasRendered);
    }

    if (nowMs - this.lastRibbonMs >= 520) {
      this.lastRibbonMs = nowMs;
      this.drawRibbonBanner(tel.circuitName, tel.flagText, `${tel.lapText} · ${tel.posText}`, this.elapsed);
    }
  }

  /**
   * Render real live 3D broadcast camera footage into `feedRenderTarget` at a lightweight
   * throttled cadence (1 out of every 10 frames = ~4 Hz -> < 0.35 ms/frame average on Intel xe-lpg!).
   */
  renderBroadcastFeed(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    extraHide: readonly (THREE.Object3D | null | undefined)[],
    skipRender = false,
  ): void {
    if (skipRender || !this.group.visible) return;
    this.frameCounter++;
    if (this.feedHasRendered && (this.frameCounter % 12) !== 0) return;

    const prevVis: Array<[THREE.Object3D, boolean]> = [];
    const hideObj = (o: THREE.Object3D | null | undefined): void => {
      if (!o || !o.visible) return;
      prevVis.push([o, true]);
      o.visible = false;
    };
    for (const m of this.screenMeshes) hideObj(m);
    for (const o of extraHide) hideObj(o);

    const prevRt = renderer.getRenderTarget();
    const prevAutoShadow = renderer.shadowMap.autoUpdate;
    const prevShadowNeed = renderer.shadowMap.needsUpdate;
    try {
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(this.feedRenderTarget as unknown as THREE.WebGLRenderTarget);
      renderer.render(scene, this.tvCamera);
      if (!this.feedHasRendered) {
        this.feedHasRendered = true;
        if (this.useWebGpu && this.uFeedReady) this.uFeedReady.value = 1;
        else if (this.webglVideoMat) {
          this.webglVideoMat.map = this.feedRenderTarget.texture;
          this.webglVideoMat.needsUpdate = true;
        }
      }
    } catch {
      // Keep animated telemetry canvas fallback active if secondary RenderTarget is unavailable
    } finally {
      renderer.setRenderTarget(prevRt);
      renderer.shadowMap.autoUpdate = prevAutoShadow;
      renderer.shadowMap.needsUpdate = prevShadowNeed;
      for (const [o, v] of prevVis) o.visible = v;
    }
  }

  private drawBroadcastOverlay(tel: BroadcastTelemetry, transparentCenter: boolean): void {
    const g = this.overlayCtx;
    const W = this.overlayCanvas.width;
    const H = this.overlayCanvas.height;
    g.clearRect(0, 0, W, H);

    if (!transparentCenter) {
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#091428');
      grad.addColorStop(0.55, '#132444');
      grad.addColorStop(1, '#1d1532');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }

    const topGrad = g.createLinearGradient(0, 0, 0, 56);
    topGrad.addColorStop(0, 'rgba(6, 10, 20, 0.78)');
    topGrad.addColorStop(1, 'rgba(6, 10, 20, 0.0)');
    g.fillStyle = topGrad;
    g.fillRect(0, 0, W, 56);

    const botGrad = g.createLinearGradient(0, H - 62, 0, H);
    botGrad.addColorStop(0, 'rgba(6, 10, 20, 0.0)');
    botGrad.addColorStop(1, 'rgba(6, 10, 20, 0.88)');
    g.fillStyle = botGrad;
    g.fillRect(0, H - 62, W, 62);

    const pulse = 0.65 + 0.35 * Math.sin(this.elapsed * 5.2);
    g.fillStyle = '#e01e37';
    g.fillRect(14, 12, 62, 24);
    g.fillStyle = `rgba(255, 255, 255, ${pulse.toFixed(2)})`;
    g.beginPath();
    g.arc(26, 24, 4.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '800 13px Inter, Segoe UI, sans-serif';
    g.fillText('LIVE', 36, 29);

    g.fillStyle = 'rgba(10, 16, 30, 0.84)';
    g.fillRect(78, 12, 224, 24);
    g.fillStyle = '#ffd166';
    g.font = '800 12px Inter, Segoe UI, sans-serif';
    g.fillText('APEX TV', 86, 29);
    g.fillStyle = '#e8f1ff';
    g.font = '700 11px Inter, Segoe UI, sans-serif';
    g.fillText(tel.circuitName.toUpperCase().slice(0, 22), 146, 29);

    g.fillStyle = 'rgba(10, 16, 30, 0.84)';
    g.fillRect(W - 186, 12, 172, 24);
    g.fillStyle = '#48e5ff';
    g.font = '700 10px Inter, Segoe UI, sans-serif';
    g.fillText(BROADCAST_CAM_LABELS[this.shotIndex], W - 178, 28);

    const rows = tel.leaderboard.slice(0, 4);
    if (rows.length > 0) {
      const boxH = 20 + rows.length * 22;
      g.fillStyle = 'rgba(8, 13, 24, 0.78)';
      g.fillRect(14, 46, 178, boxH);
      g.fillStyle = '#00d4ff';
      g.fillRect(14, 46, 178, 3);
      g.fillStyle = '#9bb6d9';
      g.font = '700 10px Inter, Segoe UI, sans-serif';
      g.fillText(`${tel.lapText}   ${tel.raceTimeText}`, 22, 60);

      rows.forEach((r, idx) => {
        const y = 66 + idx * 22;
        if (r.isPlayer) {
          g.fillStyle = 'rgba(255, 196, 61, 0.28)';
          g.fillRect(16, y, 174, 20);
        }
        g.fillStyle = r.isPlayer ? '#ffd166' : '#ffffff';
        g.font = '800 11px Inter, Segoe UI, sans-serif';
        g.fillText(`P${r.pos}`, 22, y + 14);
        g.fillStyle = r.isPlayer ? '#fff6d6' : '#dce7f7';
        g.font = '700 10px Inter, Segoe UI, sans-serif';
        g.fillText(r.name.slice(0, 14), 44, y + 14);
        g.fillStyle = '#70d6ff';
        g.textAlign = 'right';
        g.fillText(r.gap.slice(0, 7), 186, y + 14);
        g.textAlign = 'left';
      });
    }

    g.fillStyle = 'rgba(8, 13, 24, 0.84)';
    g.fillRect(W - 164, H - 72, 150, 40);
    g.fillStyle = '#ff6b35';
    g.fillRect(W - 164, H - 72, 4, 40);
    g.fillStyle = '#ffffff';
    g.font = '900 22px Inter, Segoe UI, sans-serif';
    g.fillText(String(Math.round(tel.speedKmh)).padStart(3, '0'), W - 154, H - 46);
    g.fillStyle = '#9db4d4';
    g.font = '700 10px Inter, Segoe UI, sans-serif';
    g.fillText('KM/H', W - 108, H - 46);
    g.fillStyle = '#ffd166';
    g.font = '900 20px Inter, Segoe UI, sans-serif';
    g.fillText(tel.gearLabel, W - 44, H - 46);
    const rpmW = Math.round(134 * Math.max(0.06, Math.min(1, tel.rpm01)));
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(W - 154, H - 39, 134, 4);
    g.fillStyle = tel.rpm01 > 0.85 ? '#ff3344' : '#32e0ff';
    g.fillRect(W - 154, H - 39, rpmW, 4);

    g.fillStyle = 'rgba(6, 10, 20, 0.92)';
    g.fillRect(0, H - 26, W, 26);
    g.fillStyle = '#ff6b35';
    g.fillRect(0, H - 26, 94, 26);
    g.fillStyle = '#ffffff';
    g.font = '900 11px Inter, Segoe UI, sans-serif';
    g.fillText(tel.flagText.slice(0, 12), 10, H - 9);
    g.fillStyle = '#e8f3ff';
    g.font = '700 11px Inter, Segoe UI, sans-serif';
    g.fillText(`PLAJAH MOTORSPORT : APEX  ·  ${tel.posText}  ·  ${tel.lapText}  ·  LIVE TRACKSIDE FEED`, 104, H - 9);

    this.overlayTex.needsUpdate = true;
  }

  private drawRibbonBanner(circuitName: string, flagText: string, statusText: string, t: number): void {
    const g = this.ribbonCtx;
    const W = this.ribbonCanvas.width;
    const H = this.ribbonCanvas.height;

    const bg = g.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0.0, '#071429');
    bg.addColorStop(0.25, '#12294e');
    bg.addColorStop(0.50, '#2a1230');
    bg.addColorStop(0.75, '#0c2744');
    bg.addColorStop(1.0, '#071429');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.fillStyle = '#ff6b2b';
    g.fillRect(0, 0, W, 10);
    g.fillStyle = '#28d8ff';
    g.fillRect(0, H - 10, W, 10);

    g.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = -40; x < W + 40; x += 64) {
      g.beginPath();
      g.moveTo(x, 10);
      g.lineTo(x + 26, 10);
      g.lineTo(x + 6, H - 10);
      g.lineTo(x - 20, H - 10);
      g.closePath();
      g.fill();
    }

    const pulse = Math.sin(t * 3.0) > 0 ? '#ffd166' : '#52e5ff';
    g.font = '900 48px Inter, Segoe UI, sans-serif';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText('PLAJAH MOTORSPORT', 28, H * 0.44);
    g.fillStyle = '#ff6b2b';
    g.fillText('APEX', 588, H * 0.44);
    g.fillStyle = pulse;
    g.font = '800 32px Inter, Segoe UI, sans-serif';
    g.fillText(`● ${flagText.toUpperCase()}`, 748, H * 0.44);

    g.font = '700 26px Inter, Segoe UI, sans-serif';
    g.fillStyle = '#b9dcff';
    g.fillText(`${circuitName.toUpperCase()}   ·   ${statusText}   ·   KESTREL RACING   ·   AURELIA GT   ·   IRONPORT METRO`, 28, H * 0.80);

    this.ribbonTex.needsUpdate = true;
  }
}
