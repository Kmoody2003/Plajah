/// <reference types="@webgpu/types" />
// WebGPU compute solver for the same cloth model the CPU solver runs (desktop GPU first; the CPU
// path is the fallback). Per substep: predict → one Gauss-Seidel pass over the constraints, one
// dispatch per colour (no two constraints of a colour share a particle, so writes never race) →
// body distance-field + floor collision with friction → particle self-collision through a hashed
// grid (atomic insert, Jacobi resolve) → velocities. Positions come back once per display frame.
// Stuffed plush (global volume constraint) stays on the CPU solver.

import type { ClothModel, ClothSim, SimOptions } from './cloth';
import type { SdfGrid } from './avatar';

const WG = 64; const SLOTS = 8;

const WGSL = /* wgsl */`
struct Params { h:f32, h2:f32, gy:f32, damp:f32, sew:f32, floorY:f32, n:u32, record:u32,
  sdfO:vec3<f32>, cell:f32, dims:vec3<u32>, hasSdf:u32, far:f32, selfR:f32, hashMask:u32, selfOn:u32,
  cs:f32, lr:f32, layered:u32, pad:u32 };
struct Con { a0:i32, a1:i32, b0:i32, b1:i32, wa:f32, wb:f32, rest:f32, compT:f32, compC:f32, kind:u32, p0:u32, p1:u32 };
struct Color { offset:u32, count:u32, p0:u32, p1:u32 };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> pos: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> prv: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> vel: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> props: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> cons: array<Con>;
@group(0) @binding(6) var<storage, read> sdf: array<f32>;
@group(0) @binding(7) var<storage, read_write> delta: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read_write> grid: array<atomic<u32>>;
@group(1) @binding(0) var<uniform> COL: Color;

@compute @workgroup_size(${WG}) fn predict(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x; if (i >= P.n) { return; } let p = pos[i]; prv[i] = p; if (p.w == 0.0) { return; }
  var v = vel[i].xyz; v.y = v.y + P.gy * P.h; v = v * P.damp; pos[i] = vec4<f32>(p.xyz + v * P.h, p.w);
}

fn wsum(c: Con) -> f32 {
  let ca0 = 1.0 - c.wa; let cb0 = 1.0 - c.wb; var s = pos[c.a0].w * ca0 * ca0 + pos[c.b0].w * cb0 * cb0;
  if (c.a1 >= 0) { s = s + pos[c.a1].w * c.wa * c.wa; } if (c.b1 >= 0) { s = s + pos[c.b1].w * c.wb * c.wb; } return s;
}
@compute @workgroup_size(${WG}) fn solve(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= COL.count) { return; } let k = COL.offset + id.x; var c = cons[k];
  if (c.kind == 2u && c.rest > 0.0) { c.rest = max(0.0, c.rest - P.sew); cons[k].rest = c.rest; }
  let ca0 = 1.0 - c.wa; let cb0 = 1.0 - c.wb;
  var A = pos[c.a0].xyz * ca0; if (c.a1 >= 0) { A = A + pos[c.a1].xyz * c.wa; }
  var B = pos[c.b0].xyz * cb0; if (c.b1 >= 0) { B = B + pos[c.b1].xyz * c.wb; }
  let d = A - B; let L = length(d); if (L < 1e-9) { return; }
  let C = L - c.rest; var comp = c.compC; if (C > 0.0) { comp = c.compT; }
  let w = wsum(c); if (w == 0.0) { return; }
  let lam = -C / (w + comp / P.h2); let g = d / L * lam;
  pos[c.a0] = vec4<f32>(pos[c.a0].xyz + g * (pos[c.a0].w * ca0), pos[c.a0].w);
  if (c.a1 >= 0) { pos[c.a1] = vec4<f32>(pos[c.a1].xyz + g * (pos[c.a1].w * c.wa), pos[c.a1].w); }
  pos[c.b0] = vec4<f32>(pos[c.b0].xyz - g * (pos[c.b0].w * cb0), pos[c.b0].w);
  if (c.b1 >= 0) { pos[c.b1] = vec4<f32>(pos[c.b1].xyz - g * (pos[c.b1].w * c.wb), pos[c.b1].w); }
}

fn at(i: u32, j: u32, k: u32) -> f32 { return sdf[i + j * P.dims.x + k * P.dims.x * P.dims.y]; }
fn sampleSdf(p: vec3<f32>) -> vec4<f32> {
  let f = (p - P.sdfO) / P.cell; let dm = vec3<f32>(P.dims) - vec3<f32>(1.0);
  if (any(f < vec3<f32>(0.0)) || any(f >= dm)) { return vec4<f32>(P.far, 0.0, 0.0, 0.0); }
  let b = vec3<u32>(floor(f)); let t = f - floor(f);
  let c000 = at(b.x, b.y, b.z); let c100 = at(b.x + 1u, b.y, b.z); let c010 = at(b.x, b.y + 1u, b.z); let c110 = at(b.x + 1u, b.y + 1u, b.z);
  let c001 = at(b.x, b.y, b.z + 1u); let c101 = at(b.x + 1u, b.y, b.z + 1u); let c011 = at(b.x, b.y + 1u, b.z + 1u); let c111 = at(b.x + 1u, b.y + 1u, b.z + 1u);
  let x00 = mix(c000, c100, t.x); let x10 = mix(c010, c110, t.x); let x01 = mix(c001, c101, t.x); let x11 = mix(c011, c111, t.x);
  let y0 = mix(x00, x10, t.y); let y1 = mix(x01, x11, t.y);
  let dx0 = mix(c100 - c000, c110 - c010, t.y); let dx1 = mix(c101 - c001, c111 - c011, t.y);
  let g = vec3<f32>(mix(dx0, dx1, t.z), mix(x10 - x00, x11 - x01, t.z), y1 - y0) / P.cell;
  return vec4<f32>(mix(y0, y1, t.z), g);
}
fn friction(i: u32, n: vec3<f32>, depth: f32) {
  let p = pos[i]; let dsp = p.xyz - prv[i].xyz; let tn = dsp - dot(dsp, n) * n; let tl = length(tn); if (tl < 1e-12) { return; }
  let f = min(1.0, props[2u * i].y * depth / tl); pos[i] = vec4<f32>(p.xyz - tn * f, p.w);
}
@compute @workgroup_size(${WG}) fn collide(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x; if (i >= P.n) { return; } if (pos[i].w == 0.0) { return; } let off = props[2u * i].x; var push = 0.0;
  if (P.hasSdf == 1u) { let s = sampleSdf(pos[i].xyz); let d = s.x - off; let gl = length(s.yzw);
    if (d < 0.0 && gl > 1e-9) { let n = s.yzw / gl; pos[i] = vec4<f32>(pos[i].xyz - n * d, pos[i].w); push = -d; friction(i, n, -d); } }
  if (pos[i].y < P.floorY + off) { let d = P.floorY + off - pos[i].y; pos[i].y = pos[i].y + d; push = push + d; friction(i, vec3<f32>(0.0, 1.0, 0.0), d); }
  if (P.record == 1u && push > 0.0) { delta[i].w = delta[i].w + push; }
}
fn cellOf(p: vec3<f32>) -> vec3<i32> { return vec3<i32>(floor(p / (2.0 * P.selfR))); } // selfR = half the hash cell
fn hashCell(c: vec3<i32>) -> u32 { return ((bitcast<u32>(c.x) * 73856093u) ^ (bitcast<u32>(c.y) * 19349663u) ^ (bitcast<u32>(c.z) * 83492791u)) & P.hashMask; }
@compute @workgroup_size(${WG}) fn hclear(@builtin(global_invocation_id) id: vec3<u32>) { if (id.x <= P.hashMask) { atomicStore(&grid[id.x], 0u); } }
@compute @workgroup_size(${WG}) fn hinsert(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x; if (i >= P.n) { return; } let h = hashCell(cellOf(pos[i].xyz)); let slot = atomicAdd(&grid[h], 1u);
  if (slot < ${SLOTS}u) { atomicStore(&grid[P.hashMask + 1u + h * ${SLOTS}u + slot], i); }
}
@compute @workgroup_size(${WG}) fn hsolve(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x; if (i >= P.n) { return; } delta[i] = vec4<f32>(0.0, 0.0, 0.0, delta[i].w);
  let pi = props[2u * i]; let fi = bitcast<u32>(pi.z); if (pos[i].w == 0.0) { return; }
  let xi = pos[i].xyz; let cs = P.cs; let c = cellOf(xi); let ri = props[2u * i + 1u]; let near2 = (cs * 1.25) * (cs * 1.25); let li = (fi >> 8u) & 255u;
  // Layers: keep an outer garment outside the one beneath it along the body normal (wider lateral reach).
  var nrm = vec3<f32>(0.0); if (P.layered == 1u && P.hasSdf == 1u) { let sg = sampleSdf(xi); let gl = length(sg.yzw); if (gl > 1e-9) { nrm = sg.yzw / gl; } }
  var acc = vec3<f32>(0.0);
  for (var dz = -1; dz <= 1; dz++) { for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
    let h = hashCell(c + vec3<i32>(dx, dy, dz)); let cnt = min(atomicLoad(&grid[h]), ${SLOTS}u);
    for (var s = 0u; s < cnt; s++) { let j = atomicLoad(&grid[P.hashMask + 1u + h * ${SLOTS}u + s]); if (j == i) { continue; }
      let pj = props[2u * j]; let fj = bitcast<u32>(pj.z); let lj = (fj >> 8u) & 255u; let u = pos[j].xyz - xi; let d2 = dot(u, u);
      let w = pos[i].w + pos[j].w; if (w == 0.0) { continue; }
      if (li != lj && dot(nrm, nrm) > 0.0) {
        if (d2 >= P.lr * P.lr * 2.0) { continue; }
        var sg = 1.0; if (li > lj) { sg = -1.0; }
        let along = dot(u, nrm) * sg; let lat2 = d2 - along * along; if (lat2 > P.lr * P.lr) { continue; }
        let sep = (ri.z + props[2u * j + 1u].z) * 0.5 + 1.5; if (along >= sep) { continue; }
        acc = acc - nrm * (sg * (sep - along) * pos[i].w / w); continue;
      }
      if ((fi & 1u) != 0u || (fj & 1u) != 0u) { continue; } if ((fi & 2u) != 0u && (fj & 2u) != 0u) { continue; }
      if (bitcast<u32>(pi.w) == bitcast<u32>(pj.w)) { let e = ri.xy - props[2u * j + 1u].xy; if (dot(e, e) < near2) { continue; } }
      if (d2 >= cs * cs || d2 < 1e-12) { continue; }
      let d = sqrt(d2); acc = acc - u * ((cs - d) / d * pos[i].w / w);
    } } } }
  delta[i] = vec4<f32>(acc, delta[i].w);
}
@compute @workgroup_size(${WG}) fn happly(@builtin(global_invocation_id) id: vec3<u32>) { let i = id.x; if (i >= P.n) { return; } pos[i] = vec4<f32>(pos[i].xyz + delta[i].xyz, pos[i].w); }
@compute @workgroup_size(${WG}) fn velocity(@builtin(global_invocation_id) id: vec3<u32>) { let i = id.x; if (i >= P.n) { return; } vel[i] = vec4<f32>((pos[i].xyz - prv[i].xyz) / P.h, 0.0); }
`;

export interface GpuCloth { frame(dt: number, record: boolean): Promise<void>; syncTo(sim: ClothSim): void; readContact(sim: ClothSim): Promise<void>; destroy(): void; t: number; adapter: string }

export async function createGpuCloth(m: ClothModel, sdf: SdfGrid | null, o: SimOptions): Promise<GpuCloth | null> {
  const nav = (globalThis as { navigator?: Navigator }).navigator; if (!nav || !('gpu' in nav) || m.pressure) return null;
  const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' }); if (!adapter) return null;
  const device = await adapter.requestDevice(); const n = m.n;
  const mk = (data: ArrayBufferView | number, usage: number) => { const size = typeof data === 'number' ? data : data.byteLength; const b = device.createBuffer({ size: Math.max(16, Math.ceil(size / 16) * 16), usage, mappedAtCreation: typeof data !== 'number' });
    if (typeof data !== 'number') { new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); b.unmap(); } return b; };
  const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const v4 = (src: Float32Array, w?: Float32Array) => { const a = new Float32Array(4 * n); for (let i = 0; i < n; i++) { a[4 * i] = src[3 * i]; a[4 * i + 1] = src[3 * i + 1]; a[4 * i + 2] = src[3 * i + 2]; a[4 * i + 3] = w ? w[i] : 0; } return a; };
  const pos = mk(v4(m.pos, m.invMass), S), prv = mk(v4(m.prev, m.invMass), S), vel = mk(v4(m.vel), S);
  const props = new Float32Array(8 * n); const pu = new Uint32Array(props.buffer);
  for (let i = 0; i < n; i++) { props[8 * i] = m.offset[i]; props[8 * i + 1] = m.friction[i]; pu[8 * i + 2] = (m.seamVert[i] ? 1 : 0) | (m.seamNear[i] ? 2 : 0) | ((m.layer?.[i] ?? 0) << 8); props[8 * i + 6] = m.thick?.[i] ?? 1; pu[8 * i + 3] = m.vPiece[i]; props[8 * i + 4] = m.rest2[2 * i]; props[8 * i + 5] = m.rest2[2 * i + 1]; }
  const propsB = mk(props, S);
  const cb = new ArrayBuffer(48 * m.nc); const ci = new Int32Array(cb), cf = new Float32Array(cb), cu = new Uint32Array(cb);
  for (let c = 0; c < m.nc; c++) { const k = 12 * c; ci[k] = m.a0[c]; ci[k + 1] = m.a1[c]; ci[k + 2] = m.b0[c]; ci[k + 3] = m.b1[c]; cf[k + 4] = m.wa[c]; cf[k + 5] = m.wb[c]; cf[k + 6] = m.rest[c]; cf[k + 7] = m.compT[c]; cf[k + 8] = m.compC[c]; cu[k + 9] = m.kind[c]; }
  const consB = mk(new Uint8Array(cb), S);
  const sdfB = mk(sdf ? sdf.data : new Float32Array(4), S); const deltaB = mk(new Float32Array(4 * n), S);
  const hashSize = 1 << Math.ceil(Math.log2(Math.max(1024, n * 2))); const gridB = mk((hashSize * (1 + SLOTS)) * 4, S);
  const pbuf = new ArrayBuffer(96); const pf = new Float32Array(pbuf), pi = new Uint32Array(pbuf); const paramsB = mk(96, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const module = device.createShaderModule({ code: WGSL });
  const info = await module.getCompilationInfo?.(); if (info?.messages.some(x => x.type === 'error')) { console.error('[drape gpu]', info.messages.map(x => x.message).join('\n')); device.destroy(); return null; }
  const bgl0 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, ...[1, 2, 3].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } })),
    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }] });
  const bgl1 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] });
  const pipe = (entryPoint: string) => device.createComputePipeline({ layout, compute: { module, entryPoint } });
  const P = { predict: pipe('predict'), solve: pipe('solve'), collide: pipe('collide'), hclear: pipe('hclear'), hinsert: pipe('hinsert'), hsolve: pipe('hsolve'), happly: pipe('happly'), velocity: pipe('velocity') };
  const bg0 = device.createBindGroup({ layout: bgl0, entries: [paramsB, pos, prv, vel, propsB, consB, sdfB, deltaB, gridB].map((buffer, binding) => ({ binding, resource: { buffer } })) });
  const colorBGs = m.colors.slice(0, -1).map((off, k) => { const cnt = m.colors[k + 1] - off; const b = mk(new Uint32Array([off, cnt, 0, 0]), GPUBufferUsage.UNIFORM); return { bg: device.createBindGroup({ layout: bgl1, entries: [{ binding: 0, resource: { buffer: b } }] }), cnt, b }; });
  const dummy = colorBGs[0]?.bg ?? device.createBindGroup({ layout: bgl1, entries: [{ binding: 0, resource: { buffer: mk(new Uint32Array(4), GPUBufferUsage.UNIFORM) } }] });
  const stage = device.createBuffer({ size: 16 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const groups = Math.ceil(n / WG); let t = 0; let steps = 0; let lost = false; device.lost.then(() => { lost = true; });
  const api: GpuCloth = {
    t: 0, adapter: ((adapter as unknown as { info?: { vendor?: string; architecture?: string } }).info?.vendor ?? 'GPU'),
    async frame(dt, record) {
      if (lost) throw new Error('GPU device lost');
      const ns = o.substeps; const h = dt / ns; const ramp = Math.min(1, 0.25 + t / 0.6);
      pf[0] = h; pf[1] = h * h; pf[2] = -o.gravity * ramp; pf[3] = Math.exp(-o.damping * h); pf[4] = o.sewSpeed * h; pf[5] = o.floor; pi[6] = n; pi[7] = record ? 1 : 0;
      if (sdf) { pf[8] = sdf.origin[0]; pf[9] = sdf.origin[1]; pf[10] = sdf.origin[2]; pf[11] = sdf.cell; pi[12] = sdf.nx; pi[13] = sdf.ny; pi[14] = sdf.nz; pi[15] = 1; pf[16] = sdf.far; } else { pi[15] = 0; pf[16] = 60; }
      const csz = 2 * Math.max(1.5, m.spacing * 0.32); const layered = m.layers > 1 && !!sdf; const lr = layered ? Math.max(csz, m.spacing * 0.75) : csz; pf[17] = Math.max(csz, lr) / 2; pf[20] = csz; pf[21] = lr; pi[22] = layered ? 1 : 0; pi[18] = hashSize - 1; pi[19] = o.selfCollision ? 1 : 0; device.queue.writeBuffer(paramsB, 0, pbuf);
      const enc = device.createCommandEncoder(); const pass = enc.beginComputePass(); pass.setBindGroup(0, bg0); pass.setBindGroup(1, dummy);
      const run = (p: GPUComputePipeline, g: number) => { pass.setPipeline(p); pass.dispatchWorkgroups(g); };
      for (let s = 0; s < ns; s++) {
        run(P.predict, groups);
        for (const c of colorBGs) { pass.setBindGroup(1, c.bg); pass.setPipeline(P.solve); pass.dispatchWorkgroups(Math.ceil(c.cnt / WG)); } pass.setBindGroup(1, dummy);
        run(P.collide, groups);
        if (o.selfCollision && ((steps + s) & 1) === 0) { run(P.hclear, Math.ceil(hashSize / WG)); run(P.hinsert, groups); run(P.hsolve, groups); run(P.happly, groups); }
        run(P.velocity, groups);
      }
      pass.end(); enc.copyBufferToBuffer(pos, 0, stage, 0, 16 * n); device.queue.submit([enc.finish()]);
      await stage.mapAsync(GPUMapMode.READ); const a = new Float32Array(stage.getMappedRange().slice(0)); stage.unmap();
      for (let i = 0; i < n; i++) { m.pos[3 * i] = a[4 * i]; m.pos[3 * i + 1] = a[4 * i + 1]; m.pos[3 * i + 2] = a[4 * i + 2]; }
      t += dt; steps += ns; api.t = t;
    },
    syncTo(sim) { sim.t = t; sim.steps = steps; },
    async readContact(sim) {
      const st = device.createBuffer({ size: 16 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }); const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(deltaB, 0, st, 0, 16 * n); device.queue.submit([enc.finish()]);
      await st.mapAsync(GPUMapMode.READ); const a = new Float32Array(st.getMappedRange().slice(0)); st.unmap(); st.destroy();
      for (let i = 0; i < n; i++) sim.contact[i] = a[4 * i + 3]; sim.contactSteps = Math.round(18 * o.substeps);
      // Velocities and stitch rests back too, so analysis and a later CPU resume see the same state.
      const vb = device.createBuffer({ size: 16 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }); const e2 = device.createCommandEncoder(); e2.copyBufferToBuffer(vel, 0, vb, 0, 16 * n); device.queue.submit([e2.finish()]);
      await vb.mapAsync(GPUMapMode.READ); const v = new Float32Array(vb.getMappedRange().slice(0)); vb.unmap(); vb.destroy(); for (let i = 0; i < n; i++) { m.vel[3 * i] = v[4 * i]; m.vel[3 * i + 1] = v[4 * i + 1]; m.vel[3 * i + 2] = v[4 * i + 2]; }
      const cbuf = device.createBuffer({ size: 48 * m.nc, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }); const e3 = device.createCommandEncoder(); e3.copyBufferToBuffer(consB, 0, cbuf, 0, 48 * m.nc); device.queue.submit([e3.finish()]);
      await cbuf.mapAsync(GPUMapMode.READ); const cfv = new Float32Array(cbuf.getMappedRange().slice(0)); cbuf.unmap(); cbuf.destroy(); for (let c = 0; c < m.nc; c++) m.rest[c] = cfv[12 * c + 6];
    },
    destroy() { try { device.destroy(); } catch { /* already gone */ } },
  };
  return api;
}
