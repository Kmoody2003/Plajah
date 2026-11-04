/**
 * engine.ts — Argilla's clay on the GPU.
 *
 * Sparse signed distance bricks in a 3D atlas, brush stamps in compute, and a ray-marched viewport.
 * There are no triangles while sculpting, so there is no topology to manage: clay can be added,
 * cut through and merged anywhere. Triangles exist only when exporting.
 *
 * The viewport renders only when something changed, which keeps an idle sculpt off the GPU.
 */

import * as THREE from 'three';
import {
  BrickPool, BRICK_STRIDE, BRICK_VOXELS, CELL_INSIDE, CELL_OUTSIDE, COARSE_CELLS, isSlot, slotOf,
} from './brickPool';
import { compileRecipe, recipeDistance, primsNear, type ClayPart } from './bake';
import { bakeShader, BRUSH_OP, BrushOp, copyShader, FILL_EMPTY, FILL_SOLID, pickShader, stampShader, summaryShader, viewShader } from './shaders';
import { surfaceNets, SurfaceMesh } from './surfaceNets';

export type Vec3 = [number, number, number];

export interface ClayTier {
  grid: number;
  slotsPerSide: number;
  label: string;
}

export const CLAY_TIERS = {
  standard: { grid: 96, slotsPerSide: 36, label: 'Standard (768 voxels across)' },
  high: { grid: 128, slotsPerSide: 48, label: 'High (1024 voxels across)' },
} satisfies Record<string, ClayTier>;

export interface StampInput {
  op: BrushOp;
  a: Vec3;
  ra: number;
  /** Surface normal or, for grab, the move. */
  dir?: Vec3;
  strength?: number;
  /** The surface normal at the stamp. New bricks then stay near the surface, not the whole sphere. */
  plane?: Vec3;
  mirrorX?: boolean;
}

export interface PickResult {
  point: Vec3;
  normal: Vec3;
}

export interface ClayStats {
  usedBricks: number;
  capacity: number;
  lastStampMs: number;
  lastViewMs: number;
  adapter: string;
  full: boolean;
}

export class ArgillaEngine {
  readonly pool: BrickPool;
  readonly band: number;
  readonly voxel: number;
  readonly cell: number;
  look = 0;
  yaw = 0.5;
  pitch = 0.15;
  distance = 3;
  target: Vec3 = [0, 0, 0];
  brushRing: { point: Vec3; radius: number } | null = null;
  onStatus: ((message: string) => void) | null = null;

  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;
  private field: GPUTexture;
  private before: GPUTexture;
  private pageTex: GPUTexture;
  private coarseTex: GPUTexture;
  private stampPipe: GPUComputePipeline;
  private viewPipe: GPURenderPipeline;
  private pickPipe: GPUComputePipeline;
  private summaryPipe: GPUComputePipeline;
  private bakePipe: GPUComputePipeline | null = null;
  private bakeCount = 0;
  private stampUniform: GPUBuffer;
  private brickBuffer: GPUBuffer;
  private viewUniform: GPUBuffer;
  private rayUniform: GPUBuffer;
  private pickResult: GPUBuffer;
  private pickRead: GPUBuffer;
  private pickQueue: Promise<unknown> = Promise.resolve();
  private stampGroup: GPUBindGroup;
  private viewGroup: GPUBindGroup;
  private pickGroup0: GPUBindGroup;
  private pickGroup1: GPUBindGroup;
  private copyPipe: GPUComputePipeline;
  private copyJobs: GPUBuffer;
  private copyCount: GPUBuffer;
  private toBefore: GPUBindGroup;
  private toField: GPUBindGroup;
  private query: { set: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer; busy: boolean } | null = null;
  private dirty = true;
  private raf = 0;
  private full = false;
  private lastStampMs = 0;
  private lastViewMs = 0;
  private adapterName: string;
  private viewProjInv = new THREE.Matrix4();
  private eye = new THREE.Vector3();

  static async create(canvas: HTMLCanvasElement, tierName?: keyof typeof CLAY_TIERS): Promise<ArgillaEngine> {
    if (!navigator.gpu) throw new Error('This browser has no WebGPU. Open Argilla in the Plajah desktop app or a current Chrome or Edge.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No GPU adapter is available.');
    if (!adapter.features.has('float32-filterable')) throw new Error('This GPU cannot filter 32-bit float textures, which the clay viewport needs.');
    const features: GPUFeatureName[] = ['float32-filterable'];
    if (adapter.features.has('timestamp-query')) features.push('timestamp-query');
    const device = await adapter.requestDevice({
      requiredFeatures: features,
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
    const info = (adapter as unknown as { info?: { vendor?: string; architecture?: string } }).info;
    const vendor = info?.vendor ?? '';
    const name = tierName ?? (/nvidia|amd/i.test(vendor) ? 'high' : 'standard');
    return new ArgillaEngine(canvas, device, CLAY_TIERS[name], `${vendor} ${info?.architecture ?? ''}`.trim());
  }

  private constructor(private canvas: HTMLCanvasElement, private device: GPUDevice, tier: ClayTier, adapterName: string) {
    this.adapterName = adapterName;
    const { grid, slotsPerSide } = tier;
    this.pool = new BrickPool(grid, slotsPerSide);
    this.voxel = 2 / (grid * BRICK_VOXELS);
    this.cell = 2 / grid;
    this.band = this.voxel * 3;
    const atlas = slotsPerSide * BRICK_STRIDE;

    device.addEventListener('uncapturederror', (event) => {
      const message = (event as GPUUncapturedErrorEvent).error.message;
      console.error('[argilla] GPU error:', message);
      this.onStatus?.('The GPU rejected that last change. Undo and try again.');
    });
    void device.lost.then((info) => {
      if (info.reason !== 'destroyed') this.onStatus?.('The GPU connection was lost. Reopen Argilla; your last autosave is safe.');
    });

    this.ctx = canvas.getContext('webgpu') as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });

    const volume = (format: GPUTextureFormat, size: number, usage: number) =>
      device.createTexture({ size: [size, size, size], dimension: '3d', format, usage });
    const fieldUsage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;
    this.field = volume('r32float', atlas, fieldUsage);
    this.before = volume('r32float', atlas, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING);
    this.pageTex = volume('r32uint', grid, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    this.coarseTex = volume('r8uint', this.pool.coarseDim, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);

    this.stampUniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.brickBuffer = device.createBuffer({ size: this.pool.capacity * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.viewUniform = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.rayUniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.pickResult = device.createBuffer({ size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.pickRead = device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    const mod = (code: string) => device.createShaderModule({ code });
    this.stampPipe = device.createComputePipeline({
      layout: 'auto', compute: { module: mod(stampShader(grid, slotsPerSide, this.band)), entryPoint: 'main' },
    });
    const viewMod = mod(viewShader(grid, slotsPerSide, this.band));
    this.viewPipe = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: viewMod, entryPoint: 'vs' },
      fragment: { module: viewMod, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.pickPipe = device.createComputePipeline({
      layout: 'auto', compute: { module: mod(pickShader(grid, slotsPerSide, this.band)), entryPoint: 'main' },
    });
    this.summaryPipe = device.createComputePipeline({
      layout: 'auto', compute: { module: mod(summaryShader(grid, slotsPerSide, this.band)), entryPoint: 'main' },
    });

    this.copyPipe = device.createComputePipeline({
      layout: 'auto', compute: { module: mod(copyShader(grid, slotsPerSide, this.band)), entryPoint: 'main' },
    });
    this.copyJobs = device.createBuffer({ size: this.pool.capacity * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.copyCount = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const fieldView = this.field.createView();
    const pageView = this.pageTex.createView();
    const coarseView = this.coarseTex.createView();
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.stampGroup = device.createBindGroup({
      layout: this.stampPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.stampUniform } },
        { binding: 1, resource: { buffer: this.brickBuffer } },
        { binding: 2, resource: fieldView },
        { binding: 3, resource: this.before.createView() },
        { binding: 4, resource: pageView },
      ],
    });
    this.viewGroup = device.createBindGroup({
      layout: this.viewPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.viewUniform } },
        { binding: 1, resource: fieldView },
        { binding: 2, resource: pageView },
        { binding: 3, resource: coarseView },
        { binding: 4, resource: sampler },
      ],
    });
    this.pickGroup0 = device.createBindGroup({
      layout: this.pickPipe.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: fieldView },
        { binding: 2, resource: pageView },
        { binding: 3, resource: coarseView },
        { binding: 4, resource: sampler },
      ],
    });
    this.pickGroup1 = device.createBindGroup({
      layout: this.pickPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.rayUniform } },
        { binding: 1, resource: { buffer: this.pickResult } },
      ],
    });

    const copyGroup = (source: GPUTexture, target: GPUTexture) => device.createBindGroup({
      layout: this.copyPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: source.createView() },
        { binding: 1, resource: target.createView() },
        { binding: 2, resource: { buffer: this.copyJobs } },
        { binding: 3, resource: { buffer: this.copyCount } },
      ],
    });
    this.toBefore = copyGroup(this.field, this.before);
    // Reading from the scratch atlas while writing the field: used to move bricks and to seed new ones.
    this.toField = copyGroup(this.before, this.field);

    if (device.features.has('timestamp-query')) {
      this.query = {
        set: device.createQuerySet({ type: 'timestamp', count: 2 }),
        resolve: device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
        read: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
        busy: false,
      };
    }

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.dirty) this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.device.destroy();
  }

  get stats(): ClayStats {
    return {
      usedBricks: this.pool.usedSlots,
      capacity: this.pool.capacity,
      lastStampMs: this.lastStampMs,
      lastViewMs: this.lastViewMs,
      adapter: this.adapterName,
      full: this.full,
    };
  }

  get canUndo() { return this.pool.canUndo; }
  get canRedo() { return this.pool.canRedo; }

  invalidate() { this.dirty = true; }

  beginStroke() { this.full = false; this.pool.beginStroke(); }

  async endStroke() {
    this.pool.endStroke();
    await this.compactLastStroke();
  }

  undo() {
    if (!this.pool.undo()) return false;
    this.flushPage();
    this.invalidate();
    return true;
  }

  redo() {
    if (!this.pool.redo()) return false;
    this.flushPage();
    this.invalidate();
    return true;
  }

  stamp(input: StampInput) {
    this.applyStamp(input);
    if (input.mirrorX) {
      const flip = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
      this.applyStamp({
        ...input,
        a: flip(input.a),
        dir: input.dir ? flip(input.dir) : undefined,
        plane: input.plane ? flip(input.plane) : undefined,
      });
    }
    this.invalidate();
  }

  private cellCentre(x: number, y: number, z: number): Vec3 {
    return [(x + 0.5) * this.cell - 1, (y + 0.5) * this.cell - 1, (z + 0.5) * this.cell - 1];
  }

  private hasBrickNearby(x: number, y: number, z: number) {
    const g = this.pool.grid;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= g || ny >= g || nz >= g) continue;
      if (isSlot(this.pool.page[this.pool.cellIndex(nx, ny, nz)])) return true;
    }
    return false;
  }

  private applyStamp(input: StampInput) {
    const { pool, device } = this;
    const op = input.op;
    const a = input.a;
    const ra = input.ra;
    const halfDiag = this.cell * Math.sqrt(3) * 0.5;
    const moveReach = input.dir && (op === 'grab') ? Math.hypot(...input.dir) : 0;
    const pad = ra + moveReach + this.cell;
    const g = pool.grid;
    const toCell = (v: number) => Math.floor((v + 1) / this.cell);
    const lo = a.map((v) => Math.max(0, toCell(v - pad)));
    const hi = a.map((v) => Math.min(g - 1, toCell(v + pad)));

    const write: { x: number; y: number; z: number; slot: number }[] = [];
    const copies: { from: number; slot: number }[] = [];
    const seeds: number[] = [];
    const scratch: number[] = [];

    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
      const cell = pool.cellIndex(x, y, z);
      const entry = pool.page[cell];
      const c = this.cellCentre(x, y, z);
      const dist = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      {
        if (dist - halfDiag > ra + moveReach) {
          if (isSlot(entry)) scratch.push(slotOf(entry));
          continue;
        }
        if (!isSlot(entry)) {
          if (op === 'smooth') continue;
          if (input.plane) {
            const off = (c[0] - a[0]) * input.plane[0] + (c[1] - a[1]) * input.plane[1] + (c[2] - a[2]) * input.plane[2];
            if (Math.abs(off) > this.cell * 2.5 + ra * 0.3) continue;
          }
          if (!this.hasBrickNearby(x, y, z)) continue;
        }
      }
      const touched = pool.touch(cell);
      if (!touched) {
        this.full = true;
        this.onStatus?.('This clay has reached its detail limit. Smooth or remove some detail to free room.');
        continue;
      }
      if (touched.fresh) {
        if (isSlot(touched.source)) copies.push({ from: slotOf(touched.source), slot: touched.slot });
        else seeds.push(touched.source === CELL_INSIDE ? FILL_SOLID : FILL_EMPTY, touched.slot);
      }
      write.push({ x, y, z, slot: touched.slot });
    }

    this.flushPage();
    if (!write.length) return;

    const bricks = new Int32Array(write.length * 4);
    write.forEach((w, i) => {
      bricks[i * 4] = w.x;
      bricks[i * 4 + 1] = w.y;
      bricks[i * 4 + 2] = w.z;
      bricks[i * 4 + 3] = w.slot;
    });
    device.queue.writeBuffer(this.brickBuffer, 0, bricks);

    const dir = input.dir ?? [0, 0, 0];
    const uniform = new ArrayBuffer(64);
    const f = new Float32Array(uniform);
    const u = new Uint32Array(uniform);
    f.set([a[0], a[1], a[2], ra, 0, 0, 0, 0, dir[0], dir[1], dir[2], input.strength ?? 1]);
    u[12] = BRUSH_OP[op];
    u[13] = write.length;
    device.queue.writeBuffer(this.stampUniform, 0, uniform);

    const started = performance.now();
    // A 3D texture is one subresource, so it cannot be copied onto itself: old bricks go through the
    // scratch atlas on their way to a new slot.
    if (copies.length) {
      const out = new Uint32Array(copies.length * 2);
      const back = new Uint32Array(copies.length * 2);
      copies.forEach(({ from, slot }, i) => {
        out[i * 2] = from; out[i * 2 + 1] = from;
        back[i * 2] = from; back[i * 2 + 1] = slot;
      });
      this.runCopy(out, this.toBefore);
      this.runCopy(back, this.toField);
    }
    if (seeds.length) this.runCopy(new Uint32Array(seeds), this.toField);
    const snapshot = new Uint32Array((write.length + scratch.length) * 2);
    write.forEach((w, i) => { snapshot[i * 2] = w.slot; snapshot[i * 2 + 1] = w.slot; });
    scratch.forEach((slot, i) => { snapshot[(write.length + i) * 2] = slot; snapshot[(write.length + i) * 2 + 1] = slot; });
    this.runCopy(snapshot, this.toBefore);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.stampPipe);
    pass.setBindGroup(0, this.stampGroup);
    pass.dispatchWorkgroups(write.length, 1, BRICK_STRIDE);
    pass.end();
    device.queue.submit([encoder.finish()]);
    this.lastStampMs = performance.now() - started;
  }

  private slotOrigin(slot: number) {
    const [x, y, z] = this.pool.slotCoord(slot);
    return { x: x * BRICK_STRIDE, y: y * BRICK_STRIDE, z: z * BRICK_STRIDE };
  }

  private runCopy(jobs: Uint32Array, group: GPUBindGroup) {
    const { device } = this;
    const count = jobs.length / 2;
    device.queue.writeBuffer(this.copyJobs, 0, jobs as Uint32Array<ArrayBuffer>);
    device.queue.writeBuffer(this.copyCount, 0, new Uint32Array([count]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.copyPipe);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(count, 1, BRICK_STRIDE);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  private writeBrick(texture: GPUTexture, slot: number, data: Float32Array) {
    this.device.queue.writeTexture(
      { texture, origin: this.slotOrigin(slot) },
      data as Float32Array<ArrayBuffer>,
      { bytesPerRow: BRICK_STRIDE * 4, rowsPerImage: BRICK_STRIDE },
      [BRICK_STRIDE, BRICK_STRIDE, BRICK_STRIDE],
    );
  }

  private flushPage() {
    const { queue } = this.device;
    const one = new Uint32Array(1);
    const changes = this.pool.drainDirty();
    if (changes.length > 256) {
      const g = this.pool.grid;
      queue.writeTexture({ texture: this.pageTex }, this.pool.page as Uint32Array<ArrayBuffer>, { bytesPerRow: g * 4, rowsPerImage: g }, [g, g, g]);
    } else for (const { cell, entry } of changes) {
      const [x, y, z] = this.pool.cellCoord(cell);
      one[0] = entry;
      queue.writeTexture({ texture: this.pageTex, origin: { x, y, z } }, one, { bytesPerRow: 4 }, [1, 1, 1]);
    }
    const byte = new Uint8Array(1);
    const d = this.pool.coarseDim;
    for (const { index, occupied } of this.pool.drainDirtyCoarse()) {
      byte[0] = occupied;
      queue.writeTexture(
        { texture: this.coarseTex, origin: { x: index % d, y: Math.floor(index / d) % d, z: Math.floor(index / (d * d)) } },
        byte, { bytesPerRow: 4 }, [1, 1, 1],
      );
    }
  }

  /** Give back bricks the last stroke left entirely solid or empty, so long sessions keep their room. */
  private async compactLastStroke() {
    await this.compactBricks(this.pool.lastStrokeSlots(), (cell, _slot, state) => this.pool.compact(cell, state));
  }

  private async compactBricks(listed: { cell: number; slot: number }[], release: (cell: number, slot: number, state: typeof CELL_INSIDE | typeof CELL_OUTSIDE) => void) {
    if (!listed.length) return;
    const { device } = this;
    const slots = device.createBuffer({ size: listed.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(slots, 0, new Uint32Array(listed.map((l) => l.slot)));
    const size = listed.length * 8;
    const out = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const read = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const group = device.createBindGroup({
      layout: this.summaryPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.field.createView() },
        { binding: 1, resource: { buffer: slots } },
        { binding: 2, resource: { buffer: out } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.summaryPipe);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(listed.length / 16));
    pass.end();
    encoder.copyBufferToBuffer(out, 0, read, 0, size);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const ranges = new Float32Array(read.getMappedRange().slice(0));
    read.destroy();
    out.destroy();
    slots.destroy();
    const near = this.band * 0.999;
    listed.forEach(({ cell, slot }, i) => {
      const min = ranges[i * 2], max = ranges[i * 2 + 1];
      if (min >= near) release(cell, slot, CELL_OUTSIDE);
      else if (max <= -near) release(cell, slot, CELL_INSIDE);
    });
    this.flushPage();
    this.invalidate();
  }

  private camera(width: number, height: number) {
    const cp = Math.cos(this.pitch);
    const eye = new THREE.Vector3(
      this.target[0] + this.distance * Math.sin(this.yaw) * cp,
      this.target[1] + this.distance * Math.sin(this.pitch),
      this.target[2] + this.distance * Math.cos(this.yaw) * cp,
    );
    const view = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(...this.target), new THREE.Vector3(0, 1, 0)).setPosition(eye);
    const proj = new THREE.PerspectiveCamera(32, width / height, 0.05, 50);
    proj.matrixWorld.copy(view);
    proj.updateProjectionMatrix();
    const inv = new THREE.Matrix4().copy(view).multiply(proj.projectionMatrixInverse);
    this.viewProjInv.copy(inv);
    this.eye.copy(eye);
    return { eye, view };
  }

  /** The camera's right and up axes, for moving clay in the screen plane. */
  screenAxes(): { right: Vec3; up: Vec3; forward: Vec3; pixelsToWorld: number } {
    const { view } = this.camera(this.canvas.width, this.canvas.height);
    const e = view.elements;
    return {
      right: [e[0], e[1], e[2]],
      up: [e[4], e[5], e[6]],
      forward: [-e[8], -e[9], -e[10]],
      pixelsToWorld: (2 * this.distance * Math.tan((32 * Math.PI) / 360)) / this.canvas.clientHeight,
    };
  }

  render() {
    this.dirty = false;
    const { device } = this;
    const w = this.canvas.width, h = this.canvas.height;
    if (!w || !h) return;
    this.camera(w, h);
    const data = new Float32Array(32);
    data.set(this.viewProjInv.elements, 0);
    data.set([this.eye.x, this.eye.y, this.eye.z, 1], 16);
    const ring = this.brushRing;
    if (ring) data.set([ring.point[0], ring.point[1], ring.point[2], ring.radius], 20);
    data.set([w, h, this.look, this.band], 28);
    device.queue.writeBuffer(this.viewUniform, 0, data);

    const encoder = device.createCommandEncoder();
    const q = this.query && !this.query.busy ? this.query : null;
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      ...(q ? { timestampWrites: { querySet: q.set, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}),
    });
    pass.setPipeline(this.viewPipe);
    pass.setBindGroup(0, this.viewGroup);
    pass.draw(3);
    pass.end();
    if (q) {
      encoder.resolveQuerySet(q.set, 0, 2, q.resolve, 0);
      encoder.copyBufferToBuffer(q.resolve, 0, q.read, 0, 16);
    }
    device.queue.submit([encoder.finish()]);
    if (q) {
      q.busy = true;
      q.read.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(q.read.getMappedRange());
        this.lastViewMs = Number(t[1] - t[0]) / 1e6;
        q.read.unmap();
        q.busy = false;
      }).catch(() => { q.busy = false; });
    }
  }

  /** Cast a ray through a canvas position (CSS pixels). Returns null only on a real miss. */
  pick(clientX: number, clientY: number): Promise<PickResult | null> {
    // One readback buffer, so picks wait their turn. A hover in flight must not read as a miss.
    const run = this.pickQueue.then(() => this.castRay(clientX, clientY));
    this.pickQueue = run.catch(() => null);
    return run;
  }

  private async castRay(clientX: number, clientY: number): Promise<PickResult | null> {
    {
      const rect = this.canvas.getBoundingClientRect();
      this.camera(this.canvas.width, this.canvas.height);
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
      const far = new THREE.Vector3(nx, ny, 1).applyMatrix4(this.viewProjInv);
      const dir = far.sub(this.eye).normalize();
      const { device } = this;
      device.queue.writeBuffer(this.rayUniform, 0, new Float32Array([this.eye.x, this.eye.y, this.eye.z, 0, dir.x, dir.y, dir.z, 0]));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pickPipe);
      pass.setBindGroup(0, this.pickGroup0);
      pass.setBindGroup(1, this.pickGroup1);
      pass.dispatchWorkgroups(1);
      pass.end();
      encoder.copyBufferToBuffer(this.pickResult, 0, this.pickRead, 0, 32);
      device.queue.submit([encoder.finish()]);
      await this.pickRead.mapAsync(GPUMapMode.READ);
      const v = new Float32Array(this.pickRead.getMappedRange().slice(0));
      this.pickRead.unmap();
      if (v[3] < 0.5) return null;
      return { point: [v[0], v[1], v[2]], normal: [v[4], v[5], v[6]] };
    }
  }

  /** Read every live brick off the GPU. Used for export and saving, never during a stroke. */
  async readField(): Promise<ClayFieldSnapshot> {
    const { device, pool } = this;
    const atlas = pool.slotsPerSide * BRICK_STRIDE;
    const bytesPerRow = Math.ceil((atlas * 4) / 256) * 256;
    const read = device.createBuffer({ size: bytesPerRow * atlas * atlas, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: this.field }, { buffer: read, bytesPerRow, rowsPerImage: atlas }, [atlas, atlas, atlas]);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const raw = new Float32Array(read.getMappedRange());
    const rowFloats = bytesPerRow / 4;
    const count = BRICK_STRIDE ** 3;
    const cells: number[] = [];
    const states = new Uint8Array(pool.page.length);
    for (let c = 0; c < pool.page.length; c++) {
      if (isSlot(pool.page[c])) cells.push(c);
      else states[c] = pool.page[c] === CELL_INSIDE ? 1 : 0;
    }
    const values = new Float32Array(cells.length * count);
    cells.forEach((cell, i) => {
      const o = this.slotOrigin(slotOf(pool.page[cell]));
      let w = i * count;
      for (let z = 0; z < BRICK_STRIDE; z++) for (let y = 0; y < BRICK_STRIDE; y++) {
        const start = (o.z + z) * atlas * rowFloats + (o.y + y) * rowFloats + o.x;
        values.set(raw.subarray(start, start + BRICK_STRIDE), w);
        w += BRICK_STRIDE;
      }
    });
    read.unmap();
    read.destroy();
    return { grid: pool.grid, band: this.band, states, cells: new Uint32Array(cells), values };
  }

  /** Replace the sculpt with saved or voxelized bricks. History starts empty. */
  loadField(snapshot: ClayFieldSnapshot) {
    if (snapshot.grid !== this.pool.grid) throw new Error('Field was built for a different clay resolution.');
    const slots = this.pool.restore(snapshot.states, snapshot.cells);
    this.flushPage();
    const count = BRICK_STRIDE ** 3;
    slots.forEach((slot, i) => {
      this.writeBrick(this.field, slot, snapshot.values.subarray(i * count, (i + 1) * count));
    });
    this.invalidate();
  }

  /**
   * Replace the sculpt with a recipe of parts. Cells are classified from the true distance, so only
   * cells the surface passes through take a brick. Returns false if it needs more than this device holds.
   */
  bakeRecipe(parts: ClayPart[]): boolean {
    const { pool, device } = this;
    const prims = compileRecipe(parts);
    const bake = ++this.bakeCount;
    const g = pool.grid;
    const margin = this.band + this.cell * Math.sqrt(3) * 0.5;
    const coarseMargin = this.band + this.cell * COARSE_CELLS * Math.sqrt(3) * 0.5;
    const states = new Uint8Array(g ** 3);
    const cells: number[] = [];
    for (let cz = 0; cz < g; cz += COARSE_CELLS) for (let cy = 0; cy < g; cy += COARSE_CELLS) for (let cx = 0; cx < g; cx += COARSE_CELLS) {
      const mid = (v: number) => (v + COARSE_CELLS / 2) * this.cell - 1;
      const far = recipeDistance(prims, mid(cx), mid(cy), mid(cz));
      if (far > coarseMargin) continue;
      const local = far < -coarseMargin ? prims : primsNear(prims, mid(cx), mid(cy), mid(cz), this.cell * COARSE_CELLS * Math.sqrt(3) * 0.5 + this.band);
      for (let z = cz; z < Math.min(g, cz + COARSE_CELLS); z++) for (let y = cy; y < Math.min(g, cy + COARSE_CELLS); y++) for (let x = cx; x < Math.min(g, cx + COARSE_CELLS); x++) {
        const cell = pool.cellIndex(x, y, z);
        if (far < -coarseMargin) { states[cell] = 1; continue; }
        const c = this.cellCentre(x, y, z);
        const d = recipeDistance(local, c[0], c[1], c[2]);
        if (d < -margin) states[cell] = 1;
        else if (d <= margin) cells.push(cell);
      }
    }
    if (cells.length > pool.capacity) return false;
    const slots = pool.restore(states, new Uint32Array(cells));
    this.flushPage();
    if (!cells.length) { this.invalidate(); return true; }

    const bricks = new Int32Array(cells.length * 4);
    cells.forEach((cell, i) => {
      const [x, y, z] = pool.cellCoord(cell);
      bricks.set([x, y, z, slots[i]], i * 4);
    });
    device.queue.writeBuffer(this.brickBuffer, 0, bricks);
    const primData = new Float32Array(prims.length * 16);
    prims.forEach((p, i) => primData.set([...p.a, p.ra, ...p.b, p.rb, p.carve ? 1 : 0, p.blend], i * 16));
    const primBuffer = device.createBuffer({ size: Math.max(64, primData.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(primBuffer, 0, primData);
    const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniform, 0, new Uint32Array([cells.length, prims.length, 0, 0]));
    const pipe = this.bakePipe ??= device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: bakeShader(g, pool.slotsPerSide, this.band) }), entryPoint: 'main' },
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipe);
    pass.setBindGroup(0, device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: { buffer: this.brickBuffer } },
        { binding: 2, resource: { buffer: primBuffer } },
        { binding: 3, resource: this.field.createView() },
      ],
    }));
    pass.dispatchWorkgroups(cells.length, 1, BRICK_STRIDE);
    pass.end();
    device.queue.submit([encoder.finish()]);
    primBuffer.destroy();
    uniform.destroy();
    this.invalidate();
    // Cells were kept by a conservative test. Only the samples can say which ones the surface really uses.
    void this.compactBricks(cells.map((cell, i) => ({ cell, slot: slots[i] })), (cell, slot, state) => { if (bake === this.bakeCount) this.pool.releaseBaked(cell, slot, state); });
    return true;
  }

  /** Solid or empty start: drop everything. */
  clear() {
    this.pool.restore(new Uint8Array(this.pool.page.length), new Uint32Array(0));
    this.flushPage();
    this.invalidate();
  }

  async toMesh(stride = 2): Promise<SurfaceMesh> {
    return meshFromField(await this.readField(), stride);
  }

  /** A PNG of the current view for documents and thumbnails. */
  async snapshotPng(): Promise<Blob> {
    this.render();
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not capture the view.'))), 'image/png');
    });
  }
}

export interface ClayFieldSnapshot {
  grid: number;
  band: number;
  /** One byte per cell: 1 solid, 0 otherwise. */
  states: Uint8Array;
  /** Cells holding bricks, in the order of `values`. */
  cells: Uint32Array;
  values: Float32Array;
}

export function meshFromField(field: ClayFieldSnapshot, stride = 2): SurfaceMesh {
  const { grid, band, states, cells, values } = field;
  const resolution = grid * BRICK_VOXELS;
  const count = BRICK_STRIDE ** 3;
  const index = new Map<number, number>();
  cells.forEach((c, i) => index.set(c, i));
  const sample = (x: number, y: number, z: number) => {
    const cx = Math.min(grid - 1, Math.floor(x / BRICK_VOXELS));
    const cy = Math.min(grid - 1, Math.floor(y / BRICK_VOXELS));
    const cz = Math.min(grid - 1, Math.floor(z / BRICK_VOXELS));
    const cell = cx + grid * (cy + grid * cz);
    const brick = index.get(cell);
    if (brick === undefined) return states[cell] ? -band : band;
    const lx = x - cx * BRICK_VOXELS + 1, ly = y - cy * BRICK_VOXELS + 1, lz = z - cz * BRICK_VOXELS + 1;
    return values[brick * count + lx + BRICK_STRIDE * (ly + BRICK_STRIDE * lz)];
  };
  const blocks = function* (): Generator<[number, number, number]> {
    for (const c of cells) {
      yield [
        (c % grid) * BRICK_VOXELS,
        (Math.floor(c / grid) % grid) * BRICK_VOXELS,
        Math.floor(c / (grid * grid)) * BRICK_VOXELS,
      ];
    }
  };
  return surfaceNets({
    resolution,
    sample,
    blocks: blocks(),
    blockSize: BRICK_VOXELS,
    stride,
    toWorld: (v) => (v / resolution) * 2 - 1,
  });
}
