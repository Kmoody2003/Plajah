// gpuComposite — a shared WebGPU compositor engine (Phase 2 of the on-device engine plan).
//
// One GPUDevice, one render pipeline. It composites N layers onto a target canvas in z-order, each
// layer sourced from a decoded frame (an HTMLVideoElement / VideoFrame / ImageBitmap / canvas — the
// browser copies it GPU→GPU, no CPU round-trip) with a per-layer transform (scale / translate /
// rotate about centre), opacity, and a colour grade (brightness / contrast / saturation / warmth /
// hue) applied in a single WGSL fragment pass. This is the surface Fabula's program monitor adopts to
// replace its stack of per-clip <video> elements: decode → grade → screen entirely on the GPU, with
// GPU alpha-compositing between layers instead of N stacked DOM video elements.
//
// The engine is deliberately framework-free and self-contained so it can be unit-verified headlessly
// (composite a solid colour, read the pixel back, assert the grade math) before the editor depends on
// it — and reused by Pixels / Crossover-web later.

export interface Grade {
  brightness: number; // 1 = unchanged
  contrast: number;   // 1 = unchanged
  saturation: number; // 1 = unchanged
  warmth: number;     // 0 = none  (>0 warms, <0 cools)
  hue: number;        // radians
}
export const NEUTRAL_GRADE: Grade = { brightness: 1, contrast: 1, saturation: 1, warmth: 0, hue: 0 };

export interface CompositeLayer {
  source: HTMLVideoElement | VideoFrame | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
  opacity?: number; // 0..1
  scale?: number;   // 1 = fills the frame
  tx?: number;      // translate, clip units (-1..1 spans the frame)
  ty?: number;
  rot?: number;     // radians
  grade?: Partial<Grade>;
}

export interface Compositor {
  device: GPUDevice;
  composite: (layers: CompositeLayer[]) => void;
  resize: (w: number, h: number) => void;
  destroy: () => void;
}

const WGSL = /* wgsl */`
struct U {
  xform : vec4<f32>,   // scaleX, scaleY, txClip, tyClip
  rotOp : vec4<f32>,   // cos, sin, opacity, aspect
  gradeA: vec4<f32>,   // brightness, contrast, saturation, warmth
  gradeB: vec4<f32>,   // hue, _, _, _
};
@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex  : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u : U;

struct VSOut { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32> };

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  // full-frame quad as two triangles
  var p = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
  );
  var q = p[vi];
  // scale about centre, then rotate (aspect-corrected), then translate
  var s = vec2<f32>(q.x * u.xform.x, q.y * u.xform.y);
  let c = u.rotOp.x; let sn = u.rotOp.y; let asp = u.rotOp.w;
  var r = vec2<f32>((s.x * asp) * c - s.y * sn, (s.x * asp) * sn + s.y * c);
  r.x = r.x / asp;
  var o : VSOut;
  o.pos = vec4<f32>(r.x + u.xform.z, r.y + u.xform.w, 0.0, 1.0);
  o.uv  = vec2<f32>((q.x + 1.0) * 0.5, (1.0 - (q.y + 1.0) * 0.5));
  return o;
}

fn hueRotate(rgb : vec3<f32>, a : f32) -> vec3<f32> {
  let c = cos(a); let s = sin(a);
  // luma-preserving hue rotation matrix (BT.601-ish)
  let m = mat3x3<f32>(
    0.213 + c*0.787 - s*0.213, 0.213 - c*0.213 + s*0.143, 0.213 - c*0.213 - s*0.787,
    0.715 - c*0.715 - s*0.715, 0.715 + c*0.285 + s*0.140, 0.715 - c*0.715 + s*0.715,
    0.072 - c*0.072 + s*0.928, 0.072 - c*0.072 - s*0.283, 0.072 + c*0.928 + s*0.072
  );
  return m * rgb;
}

@fragment
fn fs(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  var col = textureSample(tex, samp, uv);
  var rgb = col.rgb;
  rgb = rgb * u.gradeA.x;                          // brightness
  rgb = (rgb - vec3<f32>(0.5)) * u.gradeA.y + vec3<f32>(0.5); // contrast
  let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3<f32>(luma), rgb, u.gradeA.z);     // saturation
  let w = u.gradeA.w;                              // warmth: push R up, B down
  rgb = rgb + vec3<f32>(w * 0.12, 0.0, -w * 0.12);
  rgb = hueRotate(rgb, u.gradeB.x);                // hue
  rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(rgb * u.rotOp.z, col.a * u.rotOp.z); // premultiplied by opacity
}
`;

const UBYTES = 64; // 4 x vec4<f32>

/** Create a compositor bound to a canvas. Returns null if WebGPU is unavailable. */
export async function createCompositor(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Compositor | null> {
  const gpu = (navigator as any).gpu;
  if (!gpu) return null;
  const adapter = await gpu.requestAdapter();
  if (!adapter) return null;
  const device: GPUDevice = await adapter.requestDevice();
  const ctx = (canvas as any).getContext('webgpu') as GPUCanvasContext;
  if (!ctx) return null;
  const format = gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'premultiplied' });

  const module = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module, entryPoint: 'fs',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, // premultiplied over
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  // Per-layer-slot caches (grown as needed), so repeated frames don't churn GPU objects.
  const texCache: { tex: GPUTexture | null; w: number; h: number }[] = [];
  const uboCache: GPUBuffer[] = [];
  const bgCache: GPUBindGroup[] = [];

  const srcSize = (s: any): [number, number] => {
    if (s instanceof HTMLVideoElement) return [s.videoWidth || 2, s.videoHeight || 2];
    if (typeof VideoFrame !== 'undefined' && s instanceof VideoFrame) return [s.displayWidth || s.codedWidth || 2, s.displayHeight || s.codedHeight || 2];
    return [s.width || 2, s.height || 2];
  };

  function ensureTexture(i: number, w: number, h: number): GPUTexture {
    let slot = texCache[i];
    if (!slot) { slot = { tex: null, w: 0, h: 0 }; texCache[i] = slot; }
    if (!slot.tex || slot.w !== w || slot.h !== h) {
      slot.tex?.destroy();
      slot.tex = device.createTexture({
        size: [w, h, 1], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      slot.w = w; slot.h = h;
    }
    return slot.tex;
  }

  function composite(layers: CompositeLayer[]) {
    const cw = (canvas as any).width || 1, ch = (canvas as any).height || 1;
    const aspect = cw / Math.max(1, ch);
    const view = ctx.getCurrentTexture().createView();
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);

    layers.forEach((L, i) => {
      const [sw, sh] = srcSize(L.source);
      let w = Math.max(1, sw | 0), h = Math.max(1, sh | 0);
      if (w > 4096) { h = Math.round(h * 4096 / w); w = 4096; }
      if (h > 4096) { w = Math.round(w * 4096 / h); h = 4096; }
      const tex = ensureTexture(i, w, h);
      try { device.queue.copyExternalImageToTexture({ source: L.source as any }, { texture: tex }, [w, h]); }
      catch { return; } // source not yet decodable this frame — skip the layer

      const g = { ...NEUTRAL_GRADE, ...(L.grade || {}) };
      const rot = L.rot || 0;
      const u = new Float32Array([
        (L.scale ?? 1), (L.scale ?? 1), (L.tx ?? 0), (L.ty ?? 0),
        Math.cos(rot), Math.sin(rot), (L.opacity ?? 1), aspect,
        g.brightness, g.contrast, g.saturation, g.warmth,
        g.hue, 0, 0, 0,
      ]);
      let ubo = uboCache[i];
      if (!ubo) { ubo = device.createBuffer({ size: UBYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); uboCache[i] = ubo; }
      device.queue.writeBuffer(ubo, 0, u);
      // bind group depends on the (possibly recreated) texture → rebuild when the texture changed
      bgCache[i] = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: tex.createView() },
          { binding: 2, resource: { buffer: ubo } },
        ],
      });
      pass.setBindGroup(0, bgCache[i]);
      pass.draw(6);
    });

    pass.end();
    device.queue.submit([enc.finish()]);
  }

  function resize(w: number, h: number) { (canvas as any).width = Math.max(1, w | 0); (canvas as any).height = Math.max(1, h | 0); }
  function destroy() { texCache.forEach((s) => s.tex?.destroy()); uboCache.forEach((b) => b.destroy()); try { device.destroy(); } catch { /* */ } }

  return { device, composite, resize, destroy };
}

export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}
