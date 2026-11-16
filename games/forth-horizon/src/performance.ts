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
  readonly adapter: { renderer: string; vendor: string; family: GpuFamily; timer: boolean; compression: string[] };
  private gl: WebGL2RenderingContext;
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
  constructor(private renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    const gl = this.gl, debug = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const vendor = String(gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.adapter = { renderer: name, vendor, family: gpuFamily(name + ' ' + vendor), timer: !!this.timer, compression: ['WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_s3tc'].filter((ext) => !!gl.getExtension(ext)) };
    renderer.info.autoReset = false;
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
    this.renderer.info.reset();
    const gl = this.gl, timer = this.timer;
    if (timer) {
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
    if (!this.timer || now < this.nextGpu || this.pending.length > 1) return;
    // Don't collide with a timer owned by another renderer diagnostic.
    if (this.gl.getQuery(this.timer.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY)) return;
    this.query = this.gl.createQuery();
    if (this.query) this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.query);
    this.nextGpu = now + 500;
  }
  end(): void {
    const now = performance.now();
    if (this.query && this.timer) { this.gl.endQuery(this.timer.TIME_ELAPSED_EXT); this.pending.push(this.query); this.query = null; }
    this.cpu.push(now - this.started); if (this.cpu.length > 180) this.cpu.shift();
    if (now < this.nextReport) return;
    this.nextReport = now + 1000;
    const frame = frameStats(this.frames), cpu = frameStats(this.cpu), gpu = frameStats(this.gpu), info = this.renderer.info;
    const report = { adapter: this.adapter.family, renderer: this.adapter.renderer, requestedGpu: this.gl.getContextAttributes()?.powerPreference, width: this.renderer.domElement.width, height: this.renderer.domElement.height, context: this.context, targetMs: 1000 / 60, fps: +frame.fps.toFixed(1), frameMedianMs: +frame.median.toFixed(2), frameP95Ms: +frame.p95.toFixed(2), cpuSubmitMedianMs: +cpu.median.toFixed(2), gpuMedianMs: this.gpu.length ? +gpu.median.toFixed(2) : null, calls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length ?? 0, textures: info.memory.textures };
    this.output.dataset.report = JSON.stringify(report);
    this.output.textContent = `${this.adapter.renderer}\n${report.fps} FPS · target 60 / 16.67 ms\nFrame median ${report.frameMedianMs} ms · p95 ${report.frameP95Ms} ms\nCPU submit ${report.cpuSubmitMedianMs} ms · GPU ${report.gpuMedianMs ?? 'timer unavailable'} ms\n${report.calls} draws · ${report.triangles.toLocaleString()} triangles\n${report.programs} programs · ${report.textures} textures\n${this.adapter.compression.map((x) => x.replace('WEBGL_compressed_texture_', '')).join(' / ')} textures supported`;
    if (this.captureUntil && now >= this.captureUntil) {
      const capture = frameStats(this.capture); this.captureUntil = 0;
      this.summary.textContent = `${this.capture.length} frames: ${capture.fps.toFixed(1)} FPS, p95 ${capture.p95.toFixed(2)} ms. ${this.adapter.family === 'intel-arc' ? 'Intel Arc adapter detected.' : 'Not an Intel Arc validation.'}`;
      this.output.dataset.capture = JSON.stringify({ ...capture, adapter: this.adapter, frames: this.capture.length });
    }
  }
}
