import type * as THREE from 'three';

export type GpuFamily = 'intel-arc' | 'intel' | 'nvidia' | 'amd' | 'qualcomm' | 'apple' | 'software' | 'unknown';
export function gpuPreference(value: string | null): WebGLPowerPreference {
  return value === 'low-power' || value === 'high-performance' ? value : 'default';
}
export function gpuFamily(name: string): GpuFamily {
  const n = name.toLowerCase();
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(n)) return 'software';
  if (/adreno|qualcomm|snapdragon/.test(n)) return 'qualcomm';
  if (/nvidia|geforce|quadro/.test(n)) return 'nvidia';
  if (/radeon|\bamd\b|ati technologies/.test(n)) return 'amd';
  if (/intel/.test(n)) return /\barc\b/.test(n) ? 'intel-arc' : 'intel';
  if (/apple/.test(n)) return 'apple';
  return 'unknown';
}

export function frameStats(samples: readonly number[]): { fps: number; median: number; p95: number } {
  const sorted = samples.filter((n) => n > 0 && Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return { fps: 0, median: 0, p95: 0 };
  return { fps: 1000 / (sorted.reduce((a, b) => a + b, 0) / sorted.length), median: sorted[Math.floor((sorted.length - 1) * 0.5)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

/** Async GPU samples, no gl.finish/readback stalls. All data stays on this device. */
export class FrameProfiler {
  context: Record<string, unknown> = {};
  scene?: THREE.Scene;
  readonly adapter: { renderer: string; vendor: string; family: GpuFamily; timer: boolean; compression: string[]; backend: 'webgpu' | 'webgl2' };
  private gl: WebGL2RenderingContext | null;
  private isWebGpu: boolean;
  private timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private query: WebGLQuery | null = null;
  private pending: WebGLQuery[] = [];
  private frames: number[] = [];
  private cpu: number[] = [];
  private gpu: number[] = [];
  private last = 0;
  private started = 0;
  private nextGpu = 0;
  private nextReport = 0;
  private output: HTMLPreElement;
  private captureUntil = 0;
  private capture: number[] = [];
  private summary: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private renderer: any) {
    this.isWebGpu = Boolean(renderer?.isWebGPURenderer);
    if (this.isWebGpu) {
      this.gl = null;
      this.timer = null;
      const isGpuBackend = Boolean(renderer?.backend?.isWebGPUBackend);
      const info = (renderer?.backend?.device?.adapterInfo ?? renderer?.backend?.adapter?.info) as { description?: string; vendor?: string; architecture?: string } | undefined;
      const name = info?.description || info?.architecture || (isGpuBackend ? 'WebGPU Hardware Adapter' : 'WebGPU (WebGL2 fallback)');
      const vendor = info?.vendor || 'WebGPU';
      this.adapter = {
        renderer: `${isGpuBackend ? 'WebGPU' : 'WebGPU-Compat'} · ${name}`,
        vendor,
        family: gpuFamily(name + ' ' + vendor),
        timer: false,
        compression: ['bc7 / astc (WebGPU)'],
        backend: isGpuBackend ? 'webgpu' : 'webgl2',
      };
      // Populate exact hardware adapter name once renderer.init() finishes
      queueMicrotask(() => {
        const navGpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<{ info?: { description?: string; vendor?: string; architecture?: string } } | null> } }).gpu;
        void navGpu?.requestAdapter?.().then((ad) => {
          const adInfo = (ad as { info?: { description?: string; vendor?: string; architecture?: string } } | null)?.info ?? renderer?.backend?.adapter?.info;
          const liveGpu = Boolean(renderer?.backend?.isWebGPUBackend);
          if (adInfo) {
            const desc = adInfo.description || adInfo.architecture || adInfo.vendor || 'WebGPU Adapter';
            this.adapter.renderer = `${liveGpu ? 'WebGPU' : 'WebGPU-Compat'} · ${desc}`;
            this.adapter.vendor = adInfo.vendor || this.adapter.vendor;
            this.adapter.family = gpuFamily(desc + ' ' + this.adapter.vendor);
            this.adapter.backend = liveGpu ? 'webgpu' : 'webgl2';
            this.output.dataset.adapter = JSON.stringify(this.adapter);
          }
        }).catch(() => {});
      });
    } else {
      this.gl = renderer.getContext() as WebGL2RenderingContext;
      const gl = this.gl, debug = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      const vendor = String(gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
      this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      this.adapter = { renderer: name, vendor, family: gpuFamily(name + ' ' + vendor), timer: !!this.timer, compression: ['WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_s3tc'].filter((ext) => !!gl.getExtension(ext)), backend: 'webgl2' };
    }
    if (renderer.info) renderer.info.autoReset = false;
    const details = document.createElement('details'); details.className = 'sh-dev';
    details.innerHTML = '<summary>Performance · 60 FPS target</summary><pre class="perf-readout" style="white-space:pre-wrap;font:10px/1.6 monospace;overflow-wrap:anywhere"></pre><button type="button">Record 10 seconds</button><p class="perf-summary" style="font-size:11px"></p>';
    document.getElementById('panel')!.appendChild(details);
    this.output = details.querySelector('pre')!; this.summary = details.querySelector('p')!;
    details.querySelector('button')!.onclick = () => { this.capture = []; this.captureUntil = performance.now() + 10000; this.summary.textContent = 'Recording this view…'; };
    this.output.textContent = JSON.stringify(this.adapter, null, 2);
    this.output.dataset.adapter = JSON.stringify(this.adapter);
  }
  begin(now: number): void {
    const elapsed = this.last ? now - this.last : 0; this.last = now;
    if (document.visibilityState === 'visible' && elapsed > 0) {
      this.frames.push(elapsed); if (this.frames.length > 180) this.frames.shift();
      if (this.captureUntil) this.capture.push(elapsed);
    }
    this.started = performance.now();
    try { this.renderer.info?.reset?.(); } catch { /* ok */ }
    const gl = this.gl, timer = this.timer;
    if (gl && timer) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const q = this.pending[i];
        if (gl.getParameter(timer.GPU_DISJOINT_EXT)) { gl.deleteQuery(q); this.pending.splice(i, 1); continue; }
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
        this.gpu.push(Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6);
        if (this.gpu.length > 30) this.gpu.shift();
        gl.deleteQuery(q); this.pending.splice(i, 1);
      }
    }
  }
  beginRender(): void {
    const now = performance.now();
    if (!this.gl || !this.timer || now < this.nextGpu || this.pending.length > 1) return;
    // Don't collide with a timer owned by another renderer diagnostic.
    if (this.gl.getQuery(this.timer.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY)) return;
    this.query = this.gl.createQuery();
    if (this.query) this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.query);
    this.nextGpu = now + 500;
  }
  end(): void {
    const now = performance.now();
    if (this.gl && this.query && this.timer) { this.gl.endQuery(this.timer.TIME_ELAPSED_EXT); this.pending.push(this.query); this.query = null; }
    this.cpu.push(now - this.started); if (this.cpu.length > 180) this.cpu.shift();
    if (now < this.nextReport) return;
    this.nextReport = now + 1000;
    const frame = frameStats(this.frames), cpu = frameStats(this.cpu), gpu = frameStats(this.gpu), info = this.renderer.info;
    const calls = this.isWebGpu ? (info?.render?.drawCalls ?? 0) : (info?.render?.calls ?? 0);
    const triangles = info?.render?.triangles ?? 0;
    const programs = info?.programs?.length ?? 0;
    const textures = info?.memory?.textures ?? 0;
    const report = { backend: this.adapter.backend, adapter: this.adapter.family, renderer: this.adapter.renderer, requestedGpu: this.gl?.getContextAttributes?.()?.powerPreference ?? 'high-performance', width: this.renderer.domElement.width, height: this.renderer.domElement.height, context: this.context, targetMs: 1000 / 60, fps: +frame.fps.toFixed(1), frameMedianMs: +frame.median.toFixed(2), frameP95Ms: +frame.p95.toFixed(2), cpuSubmitMedianMs: +cpu.median.toFixed(2), gpuMedianMs: this.gpu.length ? +gpu.median.toFixed(2) : null, calls, triangles, programs, textures };
    let topGroups = '';
    if (this.scene) {
      const tally: Array<{ name: string; draws: number; tris: number }> = [];
      for (const root of this.scene.children) {
        if (!root.visible) continue;
        let draws = 0, tris = 0;
        const walk = (o: THREE.Object3D): void => {
          if (!o.visible) return;
          const m = o as THREE.Mesh;
          if (m.isMesh && m.geometry) {
            const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
            if (inst > 0) {
              const g = m.geometry;
              const verts = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
              const gInst = (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry
                ? Math.max(0, (g as THREE.InstancedBufferGeometry).instanceCount)
                : inst;
              if (gInst > 0) {
                draws++;
                tris += Math.round((verts / 3) * gInst);
              }
            }
          }
          for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
        };
        walk(root);
        if (draws > 0) tally.push({ name: root.name || root.type, draws, tris });
      }
      tally.sort((a, b) => b.tris - a.tris);
      topGroups = '\nTop: ' + tally.slice(0, 6).map((x) => `${x.name}(${x.draws}d/${(x.tris / 1e6).toFixed(2)}M)`).join(', ');
    }
    this.output.dataset.report = JSON.stringify(report);
    this.output.textContent = `${this.adapter.renderer}\n${report.fps} FPS · target 60 / 16.67 ms\nFrame median ${report.frameMedianMs} ms · p95 ${report.frameP95Ms} ms\nCPU submit ${report.cpuSubmitMedianMs} ms · GPU ${report.gpuMedianMs ?? (this.isWebGpu ? 'WebGPU async' : 'timer unavailable')} ms\n${report.calls} draws · ${report.triangles.toLocaleString()} triangles\n${report.programs} programs · ${report.textures} textures\n${this.adapter.compression.map((x) => x.replace('WEBGL_compressed_texture_', '')).join(' / ')} textures supported${topGroups}`;
    if (this.captureUntil && now >= this.captureUntil) {
      const capture = frameStats(this.capture); this.captureUntil = 0;
      this.summary.textContent = `${this.capture.length} frames: ${capture.fps.toFixed(1)} FPS, p95 ${capture.p95.toFixed(2)} ms. ${this.adapter.family === 'intel-arc' ? 'Intel Arc adapter detected.' : 'Not an Intel Arc validation.'}`;
      this.output.dataset.capture = JSON.stringify({ ...capture, adapter: this.adapter, frames: this.capture.length });
    }
  }
}
