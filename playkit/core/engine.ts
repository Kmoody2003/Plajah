// playkit/core/engine.ts
//
// Deterministic Fixed-Timestep Engine Loop, Quality Tiers (Ravencrest Canon + Mobile/Fold),
// Hitstop / TimeScale, and Per-Frame Budget Telemetry shared by 3D, 2D, Sports, and Parlor games.

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
  tier: QualityTier;
  internalHeightPx: number;
  minInternalHeightPx: number;
  maxPixelRatio: number;
  shadowMapSize: number;
  shadowCascades: number;
  maxClusteredLights: number;
  ssr: boolean;
  ssrScale: number;
  gtao: boolean;
  froxelFog: boolean;
  bloom: 'full' | 'lean' | false;
  antiAliasing: 'traa' | 'fxaa' | 'none';
  fsr1Upscale: boolean;
  maxDrawCalls: number;
  maxTriangles: number;
  textureTier: '512' | '1k' | '2k';
  targetFps: 30 | 60 | 120;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: 'low',
    internalHeightPx: 540,
    minInternalHeightPx: 360,
    maxPixelRatio: 1.0,
    shadowMapSize: 0,
    shadowCascades: 0,
    maxClusteredLights: 32,
    ssr: false,
    ssrScale: 0.5,
    gtao: false,
    froxelFog: false,
    bloom: 'lean',
    antiAliasing: 'fxaa',
    fsr1Upscale: true,
    maxDrawCalls: 140,
    maxTriangles: 180_000,
    textureTier: '512',
    targetFps: 60,
  },
  medium: {
    tier: 'medium',
    internalHeightPx: 720,
    minInternalHeightPx: 540,
    maxPixelRatio: 1.25,
    shadowMapSize: 1024,
    shadowCascades: 2,
    maxClusteredLights: 64,
    ssr: false,
    ssrScale: 0.5,
    gtao: true,
    froxelFog: true,
    bloom: 'lean',
    antiAliasing: 'fxaa',
    fsr1Upscale: true,
    maxDrawCalls: 260,
    maxTriangles: 450_000,
    textureTier: '1k',
    targetFps: 60,
  },
  high: {
    tier: 'high',
    internalHeightPx: 1080,
    minInternalHeightPx: 720,
    maxPixelRatio: 1.5,
    shadowMapSize: 2048,
    shadowCascades: 3,
    maxClusteredLights: 128,
    ssr: true,
    ssrScale: 0.5,
    gtao: true,
    froxelFog: true,
    bloom: 'full',
    antiAliasing: 'traa',
    fsr1Upscale: true,
    maxDrawCalls: 480,
    maxTriangles: 1_200_000,
    textureTier: '1k',
    targetFps: 60,
  },
  ultra: {
    tier: 'ultra',
    internalHeightPx: 2160,
    minInternalHeightPx: 1080,
    maxPixelRatio: 2.0,
    shadowMapSize: 4096,
    shadowCascades: 4,
    maxClusteredLights: 256,
    ssr: true,
    ssrScale: 0.75,
    gtao: true,
    froxelFog: true,
    bloom: 'full',
    antiAliasing: 'traa',
    fsr1Upscale: false,
    maxDrawCalls: 900,
    maxTriangles: 3_000_000,
    textureTier: '2k',
    targetFps: 60,
  },
};

export interface FrameBudgetSnapshot {
  drawCalls: number;
  triangles: number;
  frameMs: number;
  simSteps: number;
  overDrawBudget: boolean;
  overTriangleBudget: boolean;
  overFrameTimeBudget: boolean;
}

export interface EngineCallbacks {
  /** Deterministic simulation tick (always receives exact fixedDt). */
  fixedUpdate: (fixedDt: number, tick: number) => void;
  /** Visual render tick (receives alpha 0..1 between previous and current sim state). */
  render?: (alpha: number, frameDt: number) => void;
  /** Optional stats reader for Canon budget enforcement. */
  readRenderStats?: () => { drawCalls: number; triangles: number };
}

export interface EngineOptions {
  fixedStepHz?: 60 | 120;
  maxSubSteps?: number;
  tier?: QualityTier;
}

export class PlaykitEngine {
  readonly fixedDt: number;
  readonly maxSubSteps: number;
  tier: QualityTier;

  paused = false;
  timeScale = 1.0;
  private hitstopRemaining = 0;
  private accumulator = 0;
  private tickCount = 0;
  private elapsedSim = 0;
  private lastBudget: FrameBudgetSnapshot = {
    drawCalls: 0,
    triangles: 0,
    frameMs: 0,
    simSteps: 0,
    overDrawBudget: false,
    overTriangleBudget: false,
    overFrameTimeBudget: false,
  };

  constructor(private callbacks: EngineCallbacks, opts: EngineOptions = {}) {
    const hz = opts.fixedStepHz ?? 60;
    this.fixedDt = 1 / hz;
    this.maxSubSteps = opts.maxSubSteps ?? 6;
    this.tier = opts.tier ?? 'medium';
  }

  get profile(): QualityProfile {
    return QUALITY_PROFILES[this.tier];
  }

  get tick(): number {
    return this.tickCount;
  }

  get simTime(): number {
    return this.elapsedSim;
  }

  get budget(): FrameBudgetSnapshot {
    return this.lastBudget;
  }

  /** Freeze simulation briefly on heavy impacts (Era Clash / Rift Realm / Kith Quest bash). */
  triggerHitstop(seconds: number): void {
    this.hitstopRemaining = Math.max(this.hitstopRemaining, Math.max(0, seconds));
  }

  /** Advance one display frame given wall-clock delta in seconds. */
  stepFrame(rawDtSeconds: number): FrameBudgetSnapshot {
    const clampedDt = Math.max(0, Math.min(rawDtSeconds, 0.1));
    let simSteps = 0;

    if (!this.paused) {
      if (this.hitstopRemaining > 0) {
        this.hitstopRemaining = Math.max(0, this.hitstopRemaining - clampedDt);
      } else {
        this.accumulator += clampedDt * Math.max(0, this.timeScale);
        while (this.accumulator >= this.fixedDt && simSteps < this.maxSubSteps) {
          this.callbacks.fixedUpdate(this.fixedDt, this.tickCount);
          this.tickCount++;
          this.elapsedSim += this.fixedDt;
          this.accumulator -= this.fixedDt;
          simSteps++;
        }
        // Prevent spiral of death if the tab stuttered badly
        if (this.accumulator > this.fixedDt * this.maxSubSteps) {
          this.accumulator = 0;
        }
      }
    }

    const alpha = Math.max(0, Math.min(1, this.accumulator / this.fixedDt));
    this.callbacks.render?.(alpha, clampedDt);

    const stats = this.callbacks.readRenderStats?.() ?? { drawCalls: 0, triangles: 0 };
    const prof = this.profile;
    const frameMs = rawDtSeconds * 1000;
    const targetMs = 1000 / prof.targetFps;

    this.lastBudget = {
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      frameMs,
      simSteps,
      overDrawBudget: stats.drawCalls > prof.maxDrawCalls,
      overTriangleBudget: stats.triangles > prof.maxTriangles,
      overFrameTimeBudget: frameMs > targetMs * 1.15,
    };
    return this.lastBudget;
  }

  /** Recommend an initial tier from hardware capabilities (safe in Node & Browser). */
  static detectQualityTier(hints?: { isMobile?: boolean; hasWebGPU?: boolean; deviceMemoryGb?: number; cores?: number }): QualityTier {
    const mobile = hints?.isMobile ?? false;
    const webgpu = hints?.hasWebGPU ?? false;
    const mem = hints?.deviceMemoryGb ?? 8;
    const cores = hints?.cores ?? 8;
    if (mobile) return webgpu && mem >= 8 ? 'medium' : 'low';
    if (!webgpu) return 'medium';
    if (mem >= 16 && cores >= 12) return 'high';
    return 'medium';
  }
}
