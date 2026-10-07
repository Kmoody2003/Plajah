// shaderGate — the ONE place Plajah decides whether the open-source `shaders` WebGPU library may run.
//
// `shaders` (MIT, shader-effects-inc/shaders, pinned in package.json) is WebGPU-only. Pixels / Chora /
// Tela are WebGL-first and Tizen / Roku / Fire TV have no WebGPU, so EVERY consumer must go through
// this gate and render its own still / GLSL fallback when it says no. The library itself is only ever
// loaded with a dynamic import so it never weighs down a bundle that cannot use it.
//
// Policy baked in here (do not bypass per call site):
//  - telemetry is ALWAYS off. The library otherwise samples 5% of mounts and POSTs domain / browser /
//    device / FPS / component names to shaders.com. `SHADERS_PROPS` is spread onto every <Shader>.
//  - the library is pinned exactly (4.0.0); it is days old and moving fast.

import { getPlatformInfo } from '../../hooks/usePlatform';

export type ShaderGateReason = 'ok' | 'no-webgpu' | 'tv' | 'no-adapter';

export interface ShaderGpuInfo {
  reason: ShaderGateReason;
  /** adapter.info as the browser reports it — which physical GPU WebGPU actually got. */
  vendor?: string;
  architecture?: string;
  description?: string;
  isFallbackAdapter?: boolean;
}

/** Spread onto every <Shader>: keeps the library's beacon off. */
export const SHADERS_PROPS = { disableTelemetry: true } as const;

let probe: Promise<ShaderGpuInfo> | null = null;

/** Cheap, cached capability probe. Safe to call from render paths (returns the same promise). */
export function probeShaderGpu(): Promise<ShaderGpuInfo> {
  if (probe) return probe;
  probe = (async (): Promise<ShaderGpuInfo> => {
    if (typeof navigator === 'undefined' || !(navigator as any).gpu) return { reason: 'no-webgpu' };
    // TV boxes are fill-rate bound and their WebViews report WebGPU inconsistently; the FX stage already
    // runs a reduced profile there (fxPerformanceProfile) — keep this library off them until proven.
    try { if (getPlatformInfo().isTV) return { reason: 'tv' }; } catch { /* platform hook unavailable → carry on */ }
    try {
      const adapter = await (navigator as any).gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return { reason: 'no-adapter' };
      const i = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
      return {
        reason: 'ok',
        vendor: i.vendor, architecture: i.architecture, description: i.description,
        isFallbackAdapter: !!adapter.isFallbackAdapter,
      };
    } catch {
      return { reason: 'no-adapter' };
    }
  })();
  return probe;
}

/** Lazy import of the React bindings — the only way app code should touch the library. */
export function loadShadersReact() {
  return import('shaders/react');
}
