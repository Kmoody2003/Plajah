// The 3D show simulator. Same engine rules as Ravencrest (three r184 WebGPU, its post chain and
// static batching, imported rather than forked; see docs/playable-engine-design.md): fixed real
// light pool so shaders never recompile, instancing for everything repeated, no shadow maps on the
// iGPU baseline, sim time only. Every fixture gets a beam; only the K brightest are real lights.

import * as THREE from 'three/webgpu';
import { float, normalView, positionViewDirection, sin, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPost } from '../../games/ravencrest/src/post';
import { mergeStatic } from '../../games/ravencrest/src/optimize';
import { isWindowsApp } from '../windowsBridgeService';
import { BULBS, HOLIDAY_RUNS, estimateRun, placeRig, pointsAlong, type BulbPattern, type BulbType, type RigSpot, type VenueSpec } from './venues';
import { FACING_YAW, buildRelief, type CapturedRoom } from './roomCapture';
import { WHEEL_COLORS } from './looks';
import { clamp01, profileOf, type Look, type PatchedFixture } from './boardCore';
import type { FixtureProfile } from './fixtureProfiles';

export type StageView = 'foh' | 'stage' | 'crowd' | 'overhead';

export interface HolidayState { on: boolean; bulb?: BulbType; pattern?: BulbPattern }

export interface StageSource {
  look: () => Look;
  fixtures: () => PatchedFixture[];
  custom: () => FixtureProfile[];
}

const WHEEL = WHEEL_COLORS.map((c) => new THREE.Color(c));
const BEAM_CAP = 320;
const BOWL_GAP = 1.05;
const BULB_CAP = 6000;

const mat = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** One standing figure, shared by the crowd and the band so neither reads as a pill. */
function personGeometry(headDetail = 1) {
  return mergeGeometries([
    new THREE.CylinderGeometry(0.17, 0.2, 0.95, 6, 1, true).translate(0, 0.72, 0),
    new THREE.CylinderGeometry(0.21, 0.13, 0.55, 6, 1, true).translate(0, 1.35, 0),
    new THREE.IcosahedronGeometry(0.12, headDetail).translate(0, 1.72, 0),
  ].map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

/** What a fixture's levels come out as: colour, brightness and strobing. */
export function fixtureOutput(levels: Record<string, number | undefined> | undefined, profile: FixtureProfile, seconds: number, out: THREE.Color): number {
  const l = levels ?? {};
  const has = (a: string) => profile.channels.some((c) => c.attr === a);
  const channelShutter = profile.channels.find((c) => c.attr === 'shutter');
  let dim = has('dimmer') ? l.dimmer ?? 0 : 1;
  if (channelShutter) {
    const v = l.shutter ?? channelShutter.rest ?? 0;
    if ((channelShutter.rest ?? 0) > 0.05) { if (v < 0.03) dim = 0; }
    else if (v > 0.05 && Math.sin(seconds * Math.PI * 2 * (2 + v * 18)) < 0) dim = 0;   // a strobe channel
  }
  if (has('red')) {
    const w = l.white ?? 0, a = l.amber ?? 0, uvv = l.uv ?? 0;
    out.setRGB((l.red ?? 0) + w + a + uvv * 0.3, (l.green ?? 0) + w + a * 0.55, (l.blue ?? 0) + w + uvv * 0.8);
  } else if (has('colorWheel')) {
    out.copy(WHEEL[Math.min(WHEEL.length - 1, Math.floor((l.colorWheel ?? 0) * WHEEL.length))]);
  } else out.setRGB(1, 0.86, 0.68);
  const peak = Math.max(out.r, out.g, out.b);
  if (peak > 1) out.multiplyScalar(1 / peak);
  return clamp01(dim * Math.min(1, peak));
}

export class StageSim {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 2000);
  private controls!: OrbitControls;
  private post!: ReturnType<typeof buildPost>;
  private venueRoot = new THREE.Group();
  private venue: VenueSpec | null = null;
  private rig: RigSpot[] = [];
  private rigKey = '';
  private spots: THREE.SpotLight[] = [];
  private spotTargets: THREE.Object3D[] = [];
  private homes: THREE.PointLight[] = [];
  private beams!: THREE.InstancedMesh;
  private pools!: THREE.InstancedMesh;
  private lenses!: THREE.InstancedMesh;
  private bodies!: THREE.InstancedMesh;
  private heads!: THREE.InstancedMesh;
  private bulbs!: THREE.InstancedMesh;
  private ledWall: THREE.MeshBasicNodeMaterial | null = null;
  private ledTint = uniform(new THREE.Color(0, 0, 0));
  private tv: THREE.MeshBasicMaterial | null = null;
  private bulbRuns: { id: string; from: number; count: number; pattern: BulbPattern; fixtureId?: string }[] = [];
  private snow: THREE.InstancedMesh | null = null;
  private haze = uniform(0.18);
  private hazeBase = 0.18;
  private hemi = new THREE.HemisphereLight(0xbfc8e0, 0x20202a, 0.1);
  private time = 0;
  private last = 0;
  private ms = 16;
  private scale = 1;
  private appliedScale = 1;
  private loadToken = 0;
  private holiday: Record<string, HolidayState> = {};
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly ultra = isWindowsApp();
  /** Latest smoothed frame time, for the on-screen meter and the dynamic resolution. */
  get frameMs() { return this.ms; }
  /** Beams drawn on the last frame. */
  lit = 0;
  backend = '';

  constructor(private canvas: HTMLCanvasElement, private source: StageSource) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', reversedDepthBuffer: !!(navigator as any).gpu });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.ultra ? 2 : 1.5));
  }

  async init() {
    await this.renderer.init();
    this.backend = (this.renderer.backend as any)?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    this.scene.add(this.venueRoot, this.hemi);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Fixed pools: the light count never changes, so shaders never recompile.
    const k = this.ultra ? 16 : 6;
    for (let i = 0; i < k; i++) {
      const s = new THREE.SpotLight(0xffffff, 0, 0, 0.4, 0.5, 2);
      const t = new THREE.Object3D();
      s.target = t;
      this.scene.add(s, t);
      this.spots.push(s);
      this.spotTargets.push(t);
    }
    for (let i = 0; i < 4; i++) {
      const p = new THREE.PointLight(0xffffff, 0, 0, 2);
      this.scene.add(p);
      this.homes.push(p);
    }
    this.buildInstances();
    this.post = buildPost(this.renderer, this.scene, this.camera, { ssr: false, ssrScale: 1, bloom: this.ultra ? 'full' : 'lean', taa: false, smaa: true, upscale: !this.ultra });
    this.resize();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private buildInstances() {
    // Beams: open cones, apex at the origin, opening along -Y over unit length.
    const coneGeo = new THREE.ConeGeometry(1, 1, 40, 1, true);
    coneGeo.translate(0, -0.5, 0);
    const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    // Haze scatter: strong at the source, gone at the far end, soft at the silhouette.
    const along = (uv() as any).y.pow(1.6);
    const facing = (normalView as any).dot(positionViewDirection).abs().pow(1.6);
    beamMat.opacityNode = along.mul(facing).mul(this.haze as any).mul(float(0.42)) as any;
    this.beams = new THREE.InstancedMesh(coneGeo, beamMat, BEAM_CAP);
    this.beams.frustumCulled = false;
    this.beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BEAM_CAP * 3), 3);

    // Pools: soft discs where each beam lands.
    const poolGeo = new THREE.CircleGeometry(1, 28);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const r = (uv() as any).sub(0.5).length().mul(2);
    poolMat.opacityNode = float(1).sub(r).clamp(0, 1).pow(1.4).mul(0.9) as any;
    this.pools = new THREE.InstancedMesh(poolGeo, poolMat, BEAM_CAP);
    this.pools.frustumCulled = false;
    this.pools.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BEAM_CAP * 3), 3);
    this.pools.renderOrder = 1;

    const lensGeo = new THREE.CircleGeometry(1, 16);
    lensGeo.rotateX(Math.PI / 2);
    this.lenses = new THREE.InstancedMesh(lensGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), BEAM_CAP);
    this.lenses.frustumCulled = false;
    this.lenses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BEAM_CAP * 3), 3);

    // A yoke and a head per fixture.
    const body = new THREE.BoxGeometry(0.3, 0.22, 0.3);
    const dark = mat(0x121216, 0.5, 0.5);
    this.bodies = new THREE.InstancedMesh(body, dark, BEAM_CAP);
    this.bodies.frustumCulled = false;
    const head = new THREE.CylinderGeometry(0.15, 0.11, 0.42, 12);
    head.translate(0, -0.1, 0);
    this.heads = new THREE.InstancedMesh(head, dark, BEAM_CAP);
    this.heads.frustumCulled = false;

    const bulb = new THREE.IcosahedronGeometry(1, 1);
    this.bulbs = new THREE.InstancedMesh(bulb, new THREE.MeshBasicMaterial({ toneMapped: false }), BULB_CAP);
    this.bulbs.frustumCulled = false;
    this.bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BULB_CAP * 3), 3);
    this.bulbs.count = 0;

    this.scene.add(this.beams, this.pools, this.lenses, this.bodies, this.heads, this.bulbs);
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setHaze(v: number) { this.hazeBase = v; }
  setHouseLights(v: number) { this.hemi.intensity = 0.1 + v * 1.8; }

  setHoliday(state: Record<string, HolidayState>) {
    this.holiday = state;
    if (this.venue?.kind === 'house') this.layoutBulbs();
  }

  // ── Venues ────────────────────────────────────────────────────────────────

  async loadVenue(venue: VenueSpec, room?: CapturedRoom) {
    const token = ++this.loadToken;
    this.venue = venue;
    this.rigKey = '';
    this.ledWall = null;
    this.tv = null;
    if (this.snow) { this.scene.remove(this.snow); this.snow = null; }
    this.venueRoot.clear();
    this.scene.background = new THREE.Color(venue.kind === 'stadium' || venue.kind === 'house' ? 0x050814 : 0x020204);
    this.bulbs.count = 0;
    this.bulbRuns = [];

    const root = new THREE.Group();
    switch (venue.kind) {
      case 'room': await this.buildHome(root, venue, token); break;
      case 'house': this.buildHouse(root); break;
      case 'stadium': await this.buildStadium(root, venue); break;
      case 'arena': this.buildArena(root, venue); break;
      case 'photo': if (room) await this.buildPhotoRoom(root, room); break;
      default: this.buildHall(root, venue);
    }
    if (token !== this.loadToken) return;
    this.buildTrusses(root, venue);
    mergeStatic(root, new Set());
    this.venueRoot.add(root);
    if (venue.kind === 'house') this.layoutBulbs();
    this.setView('foh');
  }

  setView(view: StageView) {
    const v = this.venue;
    if (!v) return;
    const target = new THREE.Vector3(0, v.view.height, v.kind === 'room' ? 0 : -v.stage.depth * 0.3);
    const d = v.view.distance;
    if (v.kind === 'photo') {
      this.camera.position.set(0, v.view.height, 0.01);
      this.controls.target.set(0, v.view.height, 0);
    } else {
      const position = {
        foh: new THREE.Vector3(0, v.kind === 'room' ? v.view.height : Math.max(v.view.height * 1.1, Math.min(3.4, v.height - 0.5)), d),
        stage: new THREE.Vector3(v.stage.width * 0.32, v.stage.height + 1.7, -v.stage.depth * 0.75),
        crowd: new THREE.Vector3(v.width * 0.1, 1.7, Math.min(d * 0.45, v.depth * 0.4)),
        overhead: new THREE.Vector3(d * 0.5, d * 0.65, d * 0.65),
      }[view];
      if (view === 'stage') target.set(0, v.height * 0.3, v.depth * 0.4);
      // Walls are solid from outside, so a camera past the back wall would see only wall.
      if (v.kind === 'club' || v.kind === 'theatre' || v.kind === 'hall') {
        position.x = THREE.MathUtils.clamp(position.x, -v.width / 2 + 0.5, v.width / 2 - 0.5);
        position.y = THREE.MathUtils.clamp(position.y, 0.5, v.height - 0.5);
        position.z = THREE.MathUtils.clamp(position.z, -v.stage.depth + 0.5, v.depth - v.stage.depth - 0.6);
      } else if (v.kind === 'room') {
        position.set(THREE.MathUtils.clamp(position.x, -v.width / 2 + 0.3, v.width / 2 - 0.3), THREE.MathUtils.clamp(position.y, 0.4, v.height - 0.2), THREE.MathUtils.clamp(position.z, -v.depth / 2 + 0.3, v.depth / 2 - 0.3));
      }
      this.camera.position.copy(position);
      this.controls.target.copy(target);
    }
    this.camera.near = v.kind === 'photo' || v.kind === 'room' ? 0.05 : 0.2;
    this.camera.far = Math.max(v.width, v.depth) * 8;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private addStage(root: THREE.Group, v: VenueSpec) {
    const deck = mat(0x101012, 0.38, 0.1);
    const { width: w, depth: d, height: h } = v.stage;
    root.add(box(w, h, d, 0, h / 2, -d / 2, deck));
    // Backline so light has something to fall on: a band, speakers, a drum riser.
    const skin = mat(0x2a2a30, 0.7);
    const riser = mat(0x1a1a1e, 0.6);
    root.add(box(Math.min(3.2, w / 3), 0.5, 2.4, 0, h + 0.25, -d * 0.72, riser));
    const people: [number, number][] = [[0, -d * 0.2], [-w * 0.26, -d * 0.35], [w * 0.26, -d * 0.35], [0, -d * 0.72]];
    const figure = personGeometry();
    for (const [x, z] of people) {
      const person = new THREE.Mesh(figure, skin);
      person.position.set(x, h + (z < -d * 0.6 ? 0.5 : 0), z);
      root.add(person);
      if (z > -d * 0.6) root.add(box(0.03, 1.5, 0.03, x, h + 0.75, z + 0.35, riser));
    }
    const cab = mat(0x08080a, 0.6);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) root.add(box(0.9, 1.1, 0.7, side * (w / 2 - 0.7), 0.55 + h + i * 1.12, -0.6, cab));
    }
    // LED wall for anything bigger than a club.
    if (w >= 11) {
      // Panel grid with slow bars of light, tinted from what the rig is doing.
      this.ledWall = new THREE.MeshBasicNodeMaterial({ toneMapped: false });
      const cells = (uv() as any).mul(vec2(24, 10));
      const seam = cells.fract().sub(0.5).abs().mul(2).oneMinus().min(0.08).mul(12.5);
      const grid = seam.x.mul(seam.y);
      const bars = (sin((uv() as any).x.mul(9).add((time as any).mul(0.35))) as any).mul(sin((uv() as any).y.mul(4).sub((time as any).mul(0.2)))).mul(0.5).add(0.5);
      this.ledWall.colorNode = vec3(this.ledTint as any).mul(bars.mul(0.85).add(0.15)).mul(grid) as any;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, Math.min(v.height * 0.5, w * 0.35)), this.ledWall);
      wall.position.set(0, h + Math.min(v.height * 0.5, w * 0.35) / 2 + 0.6, -d + 0.1);
      wall.userData.dynamic = true;
      root.add(wall);
    }
  }

  private addCrowd(root: THREE.Group, spots: [number, number, number][]) {
    if (!spots.length) return;
    const person = personGeometry(0);
    const crowd = new THREE.InstancedMesh(person, mat(0xffffff, 0.9), spots.length);
    const c = new THREE.Color();
    spots.forEach(([x, y, z], i) => {
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.y = Math.random() * 0.8 - 0.4;
      this.dummy.scale.setScalar(0.92 + Math.random() * 0.16);
      this.dummy.updateMatrix();
      crowd.setMatrixAt(i, this.dummy.matrix);
      const v = 0.05 + Math.random() * 0.13;
      c.setRGB(v, v * 0.95, v * (0.9 + Math.random() * 0.3));
      crowd.setColorAt(i, c);
    });
    crowd.frustumCulled = false;
    root.add(crowd);
  }

  private buildHall(root: THREE.Group, v: VenueSpec) {
    const shell = mat(0x17151a, 0.92);
    const floor = mat(0x151318, 0.55);
    const carpet = mat(0x2a1216, 0.95);
    const hw = v.width / 2, stageD = v.stage.depth, audienceD = v.depth - stageD;
    root.add(box(v.width, 0.2, v.depth, 0, -0.1, audienceD - v.depth / 2, floor));
    root.add(box(0.4, v.height, v.depth, -hw, v.height / 2, audienceD - v.depth / 2, shell));
    root.add(box(0.4, v.height, v.depth, hw, v.height / 2, audienceD - v.depth / 2, shell));
    root.add(box(v.width, v.height, 0.4, 0, v.height / 2, -stageD - 0.2, shell));
    root.add(box(v.width, v.height, 0.4, 0, v.height / 2, audienceD, shell));
    root.add(box(v.width, 0.4, v.depth, 0, v.height, audienceD - v.depth / 2, shell));
    this.addStage(root, v);

    const crowd: [number, number, number][] = [];
    const raked = v.kind === 'theatre' || v.kind === 'hall';
    if (v.kind === 'theatre' || v.kind === 'hall') {
      const proscenium = mat(0x241018, 0.7);
      const openW = v.stage.width + 1, openH = Math.min(v.height * 0.82, v.height - 1);
      root.add(box((v.width - openW) / 2, v.height, 0.6, -(openW + v.width) / 4, v.height / 2, 0.1, proscenium));
      root.add(box((v.width - openW) / 2, v.height, 0.6, (openW + v.width) / 4, v.height / 2, 0.1, proscenium));
      root.add(box(openW, v.height - openH, 0.6, 0, (v.height + openH) / 2, 0.1, proscenium));
      for (const side of [-1, 1]) root.add(box(1.2, openH, 0.3, side * (openW / 2 - 0.5), openH / 2, -0.2, mat(0x5a0c14, 0.95)));
    }

    // Rows rising away from the stage, with a balcony or two in bigger houses.
    const pitch = 0.95, seatW = 0.55;
    const rows = Math.floor((audienceD - 2.5) / pitch);
    const rake = raked ? 0.11 : 0;
    const crowdCount = v.crowd;
    const placed: [number, number, number][] = [];
    for (let r = 0; r < rows; r++) {
      const z = 2.5 + r * pitch, y = r * rake;
      if (raked) root.add(box(v.width - 3, 0.3 + y, pitch, 0, (0.3 + y) / 2, z, carpet));
      const across = Math.floor((v.width - 4) / seatW);
      for (let s = 0; s < across; s++) placed.push([(s - across / 2) * seatW + (r % 2) * 0.1, raked ? y + 0.3 : 0, z]);
    }
    const balconies = v.kind === 'hall' ? (v.width > 40 ? 2 : 1) : 0;
    for (let b = 0; b < balconies; b++) {
      const y = v.height * (0.34 + b * 0.25), from = audienceD * (0.55 + b * 0.08), len = audienceD - from;
      root.add(box(v.width - 1, 0.5, len, 0, y, from + len / 2, shell));
      const rowsB = Math.floor(len / pitch);
      for (let r = 0; r < rowsB; r++) {
        const across = Math.floor((v.width - 4) / seatW);
        const yy = y + 0.25 + r * 0.32;
        root.add(box(v.width - 2, 0.32, pitch, 0, yy, from + r * pitch, carpet));
        for (let s = 0; s < across; s++) placed.push([(s - across / 2) * seatW, yy + 0.16, from + r * pitch]);
      }
    }
    const every = Math.max(1, placed.length / Math.max(1, crowdCount));
    for (let i = 0; i < placed.length && crowd.length < crowdCount; i += every) crowd.push(placed[Math.floor(i)]);
    this.addCrowd(root, crowd);
  }

  /** A stepped elliptical bowl, closed around the floor. */
  private bowl(innerX: number, innerZ: number, rise: number, runX: number, tiers: number, material: THREE.Material): THREE.Mesh {
    const profile: THREE.Vector2[] = [new THREE.Vector2(innerX, 0)];
    for (let t = 0; t < tiers; t++) {
      const r = innerX + (t / tiers) * runX, y = (t / tiers) * rise;
      profile.push(new THREE.Vector2(r, y + rise / tiers), new THREE.Vector2(r + runX / tiers, y + rise / tiers));
    }
    profile.push(new THREE.Vector2(innerX + runX, rise * 1.4));
    // Lathe sweeps from +z through +x; leave the -z end open or the seats stand in front of the stage.
    const g = new THREE.LatheGeometry(profile, 72, Math.PI + BOWL_GAP, Math.PI * 2 - BOWL_GAP * 2);
    g.scale(1, 1, innerZ / innerX);
    return new THREE.Mesh(g, material);
  }

  private buildArena(root: THREE.Group, v: VenueSpec) {
    const cz = v.depth / 2 - 8;
    const concrete = mat(0x17171c, 0.9);
    root.add(box(v.width * 1.2, 0.2, v.depth * 1.3, 0, -0.1, cz, mat(0x101012, 0.45)));
    const seating = this.bowl(38, 30, 22, 26, 22, mat(0x1c1e2a, 0.9));
    seating.position.z = cz;
    (seating.material as THREE.Material).side = THREE.DoubleSide;
    root.add(seating);
    const roof = box(v.width * 1.3, 1, v.depth * 1.5, 0, v.height, cz, concrete);
    root.add(roof);
    root.add(box(v.width * 1.3, v.height, 1, 0, v.height / 2, -v.stage.depth - 5, concrete));
    this.addStage(root, v);

    const crowd: [number, number, number][] = [];
    const floorCount = Math.floor(v.crowd * 0.3);
    for (let i = 0; i < floorCount; i++) crowd.push([(Math.random() - 0.5) * 66, 0, 2 + Math.random() * (cz + 24)]);
    for (let i = floorCount; i < v.crowd; i++) {
      const t = Math.random(), a = Math.PI + BOWL_GAP + Math.random() * (Math.PI * 2 - BOWL_GAP * 2);
      const r = 38 + t * 26, y = t * 22 + 1;
      const x = Math.sin(a) * r, z = Math.cos(a) * r * (30 / 38) + cz;
      crowd.push([x, y, z]);
    }
    this.addCrowd(root, crowd);
  }

  private async buildStadium(root: THREE.Group, v: VenueSpec) {
    const crowd: [number, number, number][] = [];
    try {
      const gltf = await new GLTFLoader().loadAsync('/models/stadiums/stadium_open.glb');
      // The Blender export stands the bowl on -Z with the long axis on X. Stand it up, turn the long
      // axis towards the audience, and put the stage at the north end of the pitch.
      const model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.rotation.y = Math.PI / 2;
      holder.position.z = 44;
      holder.add(model);
      holder.updateMatrixWorld(true);
      holder.userData.dynamic = true;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const name = (m.material as THREE.Material).name;
        if (name === 'Light') (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1;
        if (name === 'Seats') {
          // Fans sit on the model's own seating surfaces.
          const pos = m.geometry.attributes.position as THREE.BufferAttribute;
          const index = m.geometry.index!;
          const triangles = index.count / 3;
          const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
          for (let i = 0; i < v.crowd * 0.8; i++) {
            const t = Math.floor(Math.random() * triangles) * 3;
            pa.fromBufferAttribute(pos, index.getX(t));
            pb.fromBufferAttribute(pos, index.getX(t + 1));
            pc.fromBufferAttribute(pos, index.getX(t + 2));
            let u = Math.random(), w = Math.random();
            if (u + w > 1) { u = 1 - u; w = 1 - w; }
            pa.addScaledVector(pb.sub(pa), u).addScaledVector(pc.sub(new THREE.Vector3().fromBufferAttribute(pos, index.getX(t))), w).applyMatrix4(m.matrixWorld);
            if (pa.z < 0) continue;
            crowd.push([pa.x, pa.y, pa.z]);
          }
        }
      });
      root.add(holder);
    } catch {
      root.add(box(v.width, 0.2, v.depth, 0, -0.1, 48, mat(0x14301a, 0.95)));
      const seating = this.bowl(70, 56, 30, 40, 18, mat(0x1c1e2a, 0.9));
      seating.position.z = 48;
      root.add(seating);
    }
    this.addStage(root, v);
    for (let i = 0; i < v.crowd * 0.2; i++) crowd.push([(Math.random() - 0.5) * 60, 0.05, 3 + Math.random() * 80]);
    this.addCrowd(root, crowd);
  }

  private async place(root: THREE.Group, id: string, x: number, z: number, yaw: number, token: number, scale = 1) {
    try {
      const gltf = await new GLTFLoader().loadAsync(`/models/venues/${id}/${id}.gltf`);
      if (token !== this.loadToken) return false;
      gltf.scene.position.set(x, 0, z);
      gltf.scene.rotation.y = yaw;
      gltf.scene.scale.setScalar(scale);
      root.add(gltf.scene);
      return true;
    } catch (e) {
      console.warn('[stage] model failed', id, e);
      return false;
    }
  }

  private async buildHome(root: THREE.Group, v: VenueSpec, token: number) {
    const wall = mat(0x8a8378, 0.92);
    const hw = v.width / 2, hd = v.depth / 2;
    root.add(box(v.width, 0.1, v.depth, 0, -0.05, 0, mat(0x3a2a20, 0.55)));
    root.add(box(v.width, 0.1, v.depth, 0, v.height + 0.05, 0, mat(0xb0ada6, 0.95)));
    root.add(box(0.1, v.height, v.depth, -hw, v.height / 2, 0, wall));
    root.add(box(0.1, v.height, v.depth, hw, v.height / 2, 0, wall));
    root.add(box(v.width, v.height, 0.1, 0, v.height / 2, -hd, wall));
    root.add(box(v.width * 0.5, 0.02, 2.8, 0, 0.012, 0.2, mat(0x4a4a58, 1)));
    this.tv = new THREE.MeshBasicMaterial({ color: 0x050508, toneMapped: false });
    await Promise.all([
      this.place(root, 'sofa_02', 0, 1.7, Math.PI, token),
      this.place(root, 'modern_arm_chair_01', 1.9, 0.2, -Math.PI / 2, token),
      this.place(root, 'coffee_table_round_01', 0, 0.2, 0, token),
      this.place(root, 'potted_plant_01', -2, -2.2, 0, token),
    ]);
    root.add(box(1.8, 0.45, 0.45, 0, 0.23, -hd + 0.3, mat(0x201810, 0.5)));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), this.tv);
    screen.position.set(0, 1.05, -hd + 0.07);
    screen.userData.dynamic = true;
    root.add(screen);
  }

  private buildHouse(root: THREE.Group) {
    const snow = mat(0xc8d4e8, 0.95);
    const siding = mat(0x505660, 0.85);
    const roofM = mat(0x24262e, 0.8);
    const W = 7, D = 9, EAVE = 5, RIDGE = 7.9;
    root.add(box(90, 0.2, 90, 0, -0.1, 10, snow));
    root.add(box(14, 5, D, 0, 2.5, -D / 2, siding));
    // Gable front, and a roof over it.
    const gable = new THREE.Shape([new THREE.Vector2(-W, 0), new THREE.Vector2(W, 0), new THREE.Vector2(0, RIDGE - EAVE)]);
    const gableMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: D, bevelEnabled: false }), siding);
    gableMesh.position.set(0, EAVE, -D);
    root.add(gableMesh);
    const slope = Math.hypot(W + 0.5, RIDGE - EAVE);
    const tilt = Math.atan2(RIDGE - EAVE, W);
    for (const side of [-1, 1]) {
      const r = box(slope, 0.18, D + 0.8, side * (W + 0.5) / 2, (EAVE + RIDGE) / 2 + 0.12, -D / 2 + 0.1, roofM);
      r.rotation.z = -side * tilt;
      root.add(r);
    }
    const glow = new THREE.MeshStandardMaterial({ color: 0x201408, emissive: 0xffb060, emissiveIntensity: 0.55 });
    root.add(box(2, 1.6, 0.05, -4.2, 2.1, 0.03, glow), box(2, 1.6, 0.05, 4.2, 2.1, 0.03, glow));
    root.add(box(2, 2.4, 0.06, 0, 1.3, 0.03, mat(0x401410, 0.6)));
    root.add(box(2.6, 0.04, 11, 0, 0.02, 6.6, mat(0x303238, 0.8)));
    const hedge = mat(0x10241a, 0.95);
    root.add(box(4.6, 1.0, 1.0, -4.5, 0.5, 0.6, hedge), box(4.6, 1.0, 1.0, 4.5, 0.5, 0.6, hedge));
    // Yard fir, in stacked tiers the lights spiral around.
    const fir = mat(0x0e2a1a, 0.95);
    for (let t = 0; t < 5; t++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.1 - t * 0.38, 1.9, 12), fir);
      cone.position.set(-9.4, 1.1 + t * 1.05, 6);
      root.add(cone);
    }
    root.add(box(0.3, 0.5, 0.3, -9.4, 0.2, 6, mat(0x2a1a10, 0.9)));
    // Stars and falling snow.
    const starGeo = new THREE.BufferGeometry();
    const stars = new Float32Array(3000);
    for (let i = 0; i < 1000; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 + 0.1, r = 200;
      stars.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    const sky = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc0d0ff, size: 0.5 }));
    sky.userData.dynamic = true;
    root.add(sky);
    this.snow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), new THREE.MeshBasicMaterial({ color: 0xdfe8ff }), 500);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
    const moon = new THREE.DirectionalLight(0x8fa8e0, 0.55);
    moon.position.set(-20, 30, 30);
    root.add(moon);
  }

  private layoutBulbs() {
    this.bulbRuns = [];
    let at = 0;
    for (const run of HOLIDAY_RUNS) {
      const state = this.holiday[run.id];
      if (!state?.on) continue;
      const bulb = state.bulb ?? run.bulb;
      const { bulbs } = estimateRun({ path: run.path, bulb });
      const count = Math.min(bulbs, BULB_CAP - at);
      if (count <= 0) break;
      const points = pointsAlong(run.path, count);
      const size = BULBS[bulb].size;
      points.forEach((p, i) => {
        this.dummy.position.set(p[0], p[1], p[2]);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(size);
        this.dummy.updateMatrix();
        this.bulbs.setMatrixAt(at + i, this.dummy.matrix);
      });
      this.bulbRuns.push({ id: run.id, from: at, count, pattern: state.pattern ?? run.pattern });
      at += count;
    }
    this.bulbs.count = at;
    this.bulbs.instanceMatrix.needsUpdate = true;
  }

  private async buildPhotoRoom(root: THREE.Group, room: CapturedRoom) {
    for (const photo of room.photos) {
      const relief = buildRelief(photo.depth, photo.depthWidth, photo.depthHeight, { hfovDeg: room.hfovDeg, ceilingM: room.ceilingM });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(relief.positions, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(relief.uvs, 2));
      g.setIndex(new THREE.BufferAttribute(relief.indices, 1));
      // Depth noise makes real surface normals blotchy under a spotlight, so light each point as if
      // it faces the camera position. Reads smooth and still falls off with beam and distance.
      const normals = new Float32Array(relief.positions.length);
      for (let i = 0; i < normals.length; i += 3) {
        const x = relief.positions[i], y = relief.positions[i + 1] - room.ceilingM / 2, z = relief.positions[i + 2];
        const len = Math.hypot(x, y, z) || 1;
        normals[i] = -x / len; normals[i + 1] = -y / len; normals[i + 2] = -z / len;
      }
      g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      const bitmap = await createImageBitmap(photo.image, { imageOrientation: 'flipY' });
      const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.needsUpdate = true;
      // The photo has its own light baked in; a low glow keeps the room readable with the rig off.
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 }));
      m.userData.dynamic = true;
      m.rotation.y = FACING_YAW[photo.facing];
      root.add(m);
    }
  }

  private buildTrusses(root: THREE.Group, v: VenueSpec) {
    const steel = mat(0x26262c, 0.45, 0.7);
    for (const t of v.trusses) {
      if (v.kind === 'room' || v.kind === 'photo') continue;
      for (const y of [t.y, t.y + 0.4]) for (const z of [t.z - 0.2, t.z + 0.2]) root.add(box(t.span + 0.5, 0.05, 0.05, 0, y, z, steel));
      const n = Math.floor(t.span / 1);
      for (let i = 0; i <= n; i++) root.add(box(0.03, 0.4, 0.42, -t.span / 2 + i, t.y + 0.2, t.z, steel));
      if (v.kind === 'club') continue;
      // Hang from the roof, or ground-support towers in the open air.
      if (v.kind === 'stadium') for (const side of [-1, 1]) root.add(box(0.8, t.y + 0.4, 0.8, side * (t.span / 2 + 0.6), (t.y + 0.4) / 2, t.z, steel));
      else for (const side of [-1, 1]) root.add(box(0.04, v.height - t.y, 0.04, side * t.span * 0.4, (v.height + t.y) / 2, t.z, steel));
    }
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  private syncRig(fixtures: PatchedFixture[], custom: FixtureProfile[]) {
    if (!this.venue) return;
    const key = `${this.venue.id}|${fixtures.map((f) => f.id + f.profileId).join()}`;
    if (key === this.rigKey) return;
    this.rigKey = key;
    this.rig = placeRig(this.venue, fixtures, custom).slice(0, BEAM_CAP);
  }

  private aim(spot: RigSpot, levels: any, out: THREE.Vector3) {
    if (spot.moves) {
      const tilt = ((levels?.tilt ?? 0.5) - 0.5) * (270 * Math.PI / 180);
      const pan = ((levels?.pan ?? 0.5) - 0.5) * (540 * Math.PI / 180);
      out.set(Math.sin(tilt) * Math.cos(pan), spot.mount === 'hang' ? -Math.cos(tilt) : Math.cos(tilt), Math.sin(tilt) * Math.sin(pan));
    } else {
      out.set(spot.aim[0] - spot.x, spot.aim[1] - spot.y, spot.aim[2] - spot.z).normalize();
    }
  }

  /** Distance along a ray to the stage deck, the floor or the room's walls and ceiling. */
  private hit(origin: THREE.Vector3, dir: THREE.Vector3): { t: number; onFloor: boolean; floorY: number } {
    const v = this.venue!;
    let t = Math.max(v.width, v.depth) * 1.2;
    let onFloor = false, floorY = 0;
    if (dir.y < -0.001) {
      const stageT = (v.stage.height - origin.y) / dir.y;
      const sx = origin.x + dir.x * stageT, sz = origin.z + dir.z * stageT;
      const onDeck = v.stage.height > 0 && Math.abs(sx) < v.stage.width / 2 && sz < 0 && sz > -v.stage.depth;
      if (onDeck && stageT > 0) { t = stageT; onFloor = true; floorY = v.stage.height; }
      else { const floorT = -origin.y / dir.y; if (floorT < t) { t = floorT; onFloor = true; floorY = 0; } }
    } else if (dir.y > 0.001) {
      t = Math.min(t, (v.height - origin.y) / dir.y);
    }
    if (!onFloor) t = Math.min(t, v.height * 1.6);
    return { t: Math.max(0.2, t), onFloor, floorY };
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.ms += ((now - this.last) - this.ms) * 0.05;
    this.last = now;
    this.time += dt;
    if (!this.venue) return;
    this.controls.update();
    this.adaptResolution();

    const fixtures = this.source.fixtures(), custom = this.source.custom(), look = this.source.look();
    this.syncRig(fixtures, custom);

    const origin = new THREE.Vector3(), dir = new THREE.Vector3(), quat = new THREE.Quaternion(), down = new THREE.Vector3(0, -1, 0), color = this.color;
    const byId = new Map(fixtures.map((f) => [f.id, f]));
    const lights: { i: number; power: number; color: THREE.Color; origin: THREE.Vector3; end: THREE.Vector3; angle: number }[] = [];
    let sumR = 0, sumG = 0, sumB = 0, fog = 0;
    const n = this.rig.length;

    for (let i = 0; i < n; i++) {
      const spot = this.rig[i];
      const f = byId.get(spot.fixtureId);
      if (!f) continue;
      const profile = profileOf(f, custom);
      const levels = look[f.id];
      if (profile.category === 'fog') fog = Math.max(fog, levels?.fog ?? 0);
      const power = profile.category === 'fog' ? 0 : fixtureOutput(levels as any, profile, this.time, color);
      origin.set(spot.x, spot.y, spot.z);
      this.aim(spot, levels, dir);

      quat.setFromUnitVectors(down, dir);
      this.dummy.position.copy(origin);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.bodies.setMatrixAt(i, this.dummy.matrix);
      this.dummy.quaternion.copy(quat);
      this.dummy.updateMatrix();
      this.heads.setMatrixAt(i, this.dummy.matrix);

      const zoom = levels?.zoom != null ? 0.45 + levels.zoom * 1.1 : 1;
      const half = THREE.MathUtils.degToRad(spot.beamDeg * zoom) / 2;
      const { t, onFloor, floorY } = this.hit(origin, dir);
      const r = Math.tan(half);
      const lit = Math.max(0, power);
      // Beam cone.
      this.dummy.position.copy(origin);
      this.dummy.quaternion.copy(quat);
      this.dummy.scale.set(r * t, t, r * t);
      this.dummy.updateMatrix();
      this.beams.setMatrixAt(i, this.dummy.matrix);
      const beamGain = lit * 1.1 * Math.min(1, 0.35 / Math.max(0.05, r)) * (spot.mount === 'floor' ? 0.4 : 1);
      this.beams.instanceColor!.setXYZ(i, color.r * beamGain, color.g * beamGain, color.b * beamGain);
      // Pool.
      if (onFloor && lit > 0) {
        const px = origin.x + dir.x * t, pz = origin.z + dir.z * t;
        const radius = Math.max(0.3, r * t / Math.max(0.3, -dir.y));
        this.dummy.position.set(px, floorY + 0.02, pz);
        this.dummy.quaternion.identity();
        this.dummy.scale.set(radius, 1, radius);
        this.dummy.updateMatrix();
        this.pools.setMatrixAt(i, this.dummy.matrix);
        const gain = lit * 0.3 / (1 + radius * 0.1);
        this.pools.instanceColor!.setXYZ(i, color.r * gain, color.g * gain, color.b * gain);
      } else {
        this.dummy.scale.setScalar(0);
        this.dummy.position.set(0, -1000, 0);
        this.dummy.updateMatrix();
        this.pools.setMatrixAt(i, this.dummy.matrix);
        this.pools.instanceColor!.setXYZ(i, 0, 0, 0);
      }
      // Lens: bright enough for bloom to catch it.
      this.dummy.position.copy(origin).addScaledVector(dir, 0.3);
      this.dummy.quaternion.copy(quat);
      this.dummy.scale.setScalar(0.1);
      this.dummy.updateMatrix();
      this.lenses.setMatrixAt(i, this.dummy.matrix);
      const k = 0.03 + lit * 5;
      this.lenses.instanceColor!.setXYZ(i, color.r * k, color.g * k, color.b * k);

      if (lit > 0.01) {
        sumR += color.r * lit; sumG += color.g * lit; sumB += color.b * lit;
        lights.push({ i, power: lit * (half + 0.2), color: color.clone(), origin: origin.clone(), end: origin.clone().addScaledVector(dir, t), angle: half });
      }
    }

    this.beams.count = n; this.pools.count = n; this.lenses.count = n; this.bodies.count = n; this.heads.count = n;
    for (const mesh of [this.beams, this.pools, this.lenses, this.bodies, this.heads]) mesh.instanceMatrix.needsUpdate = true;
    this.beams.instanceColor!.needsUpdate = true;
    this.pools.instanceColor!.needsUpdate = true;
    this.lenses.instanceColor!.needsUpdate = true;
    this.lit = lights.length;

    // Haze follows the fog machines, with a floor so the rig reads.
    // Nobody hazes a living room, so beams stay faint indoors at home.
    const targetHaze = (this.hazeBase + fog * 0.5) * (this.venue!.kind === 'room' || this.venue!.kind === 'photo' ? 0.12 : 1);
    this.haze.value += (targetHaze - this.haze.value) * Math.min(1, dt * 0.6);

    this.updateRealLights(lights);
    const avg = lights.length ? 1 / lights.length : 0;
    if (this.ledWall) (this.ledTint.value as THREE.Color).setRGB(sumR * avg * 0.28 + 0.008, sumG * avg * 0.28 + 0.008, sumB * avg * 0.28 + 0.012);
    if (this.tv) this.tv.color.setRGB(0.12 + Math.sin(this.time * 0.8) * 0.03, 0.14, 0.2);
    this.updateHoliday(look, fixtures);
    this.updateSnow();
    this.post.pipeline.render();
  }

  private updateRealLights(lights: { power: number; color: THREE.Color; origin: THREE.Vector3; end: THREE.Vector3; angle: number }[]) {
    const v = this.venue!;
    lights.sort((a, b) => b.power - a.power);
    // Candela that lands a usable level from this trim height.
    const trim = Math.max(2, v.trusses[0]?.y ?? v.height);
    const candela = 5 * trim * trim * (v.kind === 'room' || v.kind === 'photo' ? 4 : 1);
    this.spots.forEach((s, i) => {
      const l = lights[i];
      if (!l) { s.intensity = 0; return; }
      s.position.copy(l.origin);
      this.spotTargets[i].position.copy(l.end);
      this.spotTargets[i].updateMatrixWorld();
      s.angle = Math.min(1.2, Math.max(0.04, l.angle * 1.15));
      s.color.copy(l.color);
      s.intensity = candela * l.power / (0.2 + l.angle);
    });
  }

  private updateHoliday(look: Look, fixtures: PatchedFixture[]) {
    if (!this.bulbs.count) { this.homes.forEach((p) => { p.intensity = 0; }); return; }
    const color = this.color;
    const glow: { r: number; g: number; b: number; x: number; y: number; z: number; power: number }[] = [];
    for (const run of this.bulbRuns) {
      const f = fixtures.find((x) => x.run === run.id);
      const levels = f ? look[f.id] : undefined;
      const base = f ? fixtureOutput(levels as any, profileOf(f, this.source.custom()), this.time, color) : 0;
      const tint = color.clone();
      const def = HOLIDAY_RUNS.find((r) => r.id === run.id)!;
      for (let i = 0; i < run.count; i++) {
        let k = base;
        if (run.pattern === 'twinkle') {
          const h = Math.abs(Math.sin((run.from + i) * 12.9898) * 43758.5453) % 1;
          k *= 0.35 + 0.65 * Math.max(0, Math.sin(this.time * (1.5 + h * 3) + h * 40));
        } else if (run.pattern === 'chase') {
          k *= ((i + Math.floor(this.time * 6)) % 3 === 0) ? 1 : 0.15;
        }
        k *= 8;
        this.bulbs.instanceColor!.setXYZ(run.from + i, tint.r * k, tint.g * k, tint.b * k);
      }
      const mid = def.path[Math.floor(def.path.length / 2)];
      glow.push({ r: tint.r, g: tint.g, b: tint.b, x: mid[0], y: mid[1], z: mid[2] + 1, power: base * run.count });
    }
    this.bulbs.instanceColor!.needsUpdate = true;
    glow.sort((a, b) => b.power - a.power);
    this.homes.forEach((p, i) => {
      const g = glow[i];
      if (!g) { p.intensity = 0; return; }
      p.position.set(g.x, g.y, g.z);
      p.color.setRGB(g.r, g.g, g.b);
      p.intensity = Math.min(10, g.power * 0.02);
    });
  }

  private updateSnow() {
    if (!this.snow) return;
    const t = this.time;
    for (let i = 0; i < 500; i++) {
      const a = (i * 12.9898) % 1, b = (i * 78.233) % 1;
      const y = 14 - (((t * (0.5 + a * 0.5)) + i * 0.37) % 14);
      this.dummy.position.set(((i * 37) % 50) - 25 + Math.sin(t * 0.5 + i) * 0.5, y, ((i * 53) % 40) - 10 + b);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.snow.setMatrixAt(i, this.dummy.matrix);
    }
    this.snow.instanceMatrix.needsUpdate = true;
  }

  /**
   * Hold frame rate on the iGPU baseline by trading internal resolution, as Ravencrest does. The
   * target is only resized when the stepped scale changes: resizing reallocates it, and doing that
   * every frame renders black. Startup shader compiles are slow by nature, so they don't count.
   */
  private adaptResolution() {
    if (this.ultra || this.time < 4) return;
    this.scale = this.ms > 22 ? Math.max(0.5, this.scale - 0.002) : this.ms < 14 ? Math.min(1, this.scale + 0.001) : this.scale;
    const stepped = Math.round(this.scale * 10) / 10;
    if (stepped !== this.appliedScale) {
      this.appliedScale = stepped;
      this.post.setInternalScale(stepped);
    }
  }

  dispose() {
    this.loadToken++;
    this.renderer.setAnimationLoop(null);
    this.controls?.dispose();
    this.renderer.dispose();
  }
}
