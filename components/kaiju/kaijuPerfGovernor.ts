// kaijuPerfGovernor — keeps the Kaiju stages (3D + 2D) at their target frame rate by trading resolution/effects.
//
// Pure + deterministic (no DOM, no three.js) so it can be unit tested and shared by both stages.
//
//   const gov = new PerfGovernor({ target: 60, floor: 30, levels: 6 });
//   each frame:  const change = gov.push(frameMs);   // → new level index when it moves, else null
//
// Level 0 = best quality, `levels - 1` = cheapest. Rules:
//   • DEGRADE fast: the last ~0.75 s of frames average slower than the target by >18 % (e.g. <51 fps for a 60 target)
//     → one level down. Heavier overshoot (below the floor) drops two levels at once so a weak GPU settles quickly.
//   • UPGRADE slowly and only by probing: when frames have held the target (mean within 5 % and no long spikes) for
//     `probeSeconds` (default 9 s) → one level up. Under vsync the frame time can never show spare headroom, so a probe
//     is the only honest test. If a probe fails (we degrade again within `retrySeconds`), that level is blacklisted
//     for `blacklistSeconds` so the stage doesn't flap between two looks.
//   • Long frames (tab hidden / debugger / GC freak > 250 ms) are ignored, never counted against the level.

export interface PerfGovernorOptions {
  target?: number;          // fps we want (default 60)
  floor?: number;           // fps below which we drop two levels (default 30)
  levels?: number;          // number of quality levels (default 6)
  start?: number;           // initial level (default 0)
  probeSeconds?: number;    // sustained-good time before trying a better level
  blacklistSeconds?: number;
  retrySeconds?: number;
  /** Seconds after construction during which frames are only observed (asset bakes / shader warm-up are not the steady state). */
  warmupSeconds?: number;
}

export class PerfGovernor {
  level: number;
  readonly levels: number;
  readonly target: number;
  readonly floor: number;
  private readonly budget: number;
  private readonly warmS: number;
  private readonly probeS: number; private readonly blackS: number; private readonly retryS: number;
  private win: number[] = [];       // recent frame times (ms), ~0.75 s worth
  private winMs = 0;
  private goodFor = 0;              // seconds the target has been held at this level
  private clock = 0;
  private lastUp = -999;
  private readonly blackUntil: number[];
  /** exposed for the HUD / tests */
  mean = 0;

  constructor(o: PerfGovernorOptions = {}) {
    this.target = o.target ?? 60; this.floor = o.floor ?? 30; this.levels = Math.max(1, o.levels ?? 6);
    this.level = Math.min(this.levels - 1, Math.max(0, o.start ?? 0));
    this.budget = 1000 / this.target;
    this.warmS = o.warmupSeconds ?? 5;
    this.probeS = o.probeSeconds ?? 9; this.blackS = o.blacklistSeconds ?? 60; this.retryS = o.retrySeconds ?? 6;
    this.blackUntil = new Array(this.levels).fill(-1);
  }

  /** Feed one frame time in ms. Returns the new level when it changed. */
  push(frameMs: number): number | null {
    if (!(frameMs > 0) || frameMs > 250) { this.win.length = 0; this.winMs = 0; return null; }   // hidden tab / hitch: restart the window
    this.clock += frameMs / 1000;
    this.win.push(frameMs); this.winMs += frameMs;
    while (this.winMs > 750 && this.win.length > 8) this.winMs -= this.win.shift()!;
    if (this.clock < this.warmS) { if (this.winMs > 400) { this.win.length = 0; this.winMs = 0; } return null; }
    if (this.winMs < 500 || this.win.length < 12) return null;

    const mean = this.winMs / this.win.length; this.mean = mean;
    // ---- degrade
    if (mean > this.budget * 1.18) {
      if (this.level >= this.levels - 1) { this.goodFor = 0; return null; }
      const drop = mean > 1000 / this.floor ? 2 : 1;
      const was = this.level;
      this.level = Math.min(this.levels - 1, this.level + drop);
      // a failed probe: we only just went up and it did not hold → keep that level off the table for a while
      if (this.clock - this.lastUp < this.retryS) this.blackUntil[was] = this.clock + this.blackS;
      return this.reset();
    }
    // ---- hold / probe upward
    if (mean <= this.budget * 1.05) {
      let spiky = false; for (const x of this.win) if (x > this.budget * 2.2) { spiky = true; break; }
      this.goodFor = spiky ? 0 : this.goodFor + frameMs / 1000;
      if (this.goodFor >= this.probeS && this.level > 0 && this.clock >= this.blackUntil[this.level - 1]) {
        this.level--; this.lastUp = this.clock; return this.reset();
      }
    } else this.goodFor = 0;
    return null;
  }

  private reset(): number { this.win.length = 0; this.winMs = 0; this.goodFor = 0; return this.level; }
}

// --------------------------------------------------------------------------------------------- ladders
export interface Stage3DLevel { dpr: number; msaa: number; bloom: boolean; dust: boolean; vignette: boolean }

/** 3D stage ladder, best → cheapest. `dprMax` is clamped by the device pixel ratio in the caller. */
export const STAGE3D_LEVELS: Stage3DLevel[] = [
  { dpr: 1.75, msaa: 4, bloom: true, dust: true, vignette: true },
  { dpr: 1.5, msaa: 4, bloom: true, dust: true, vignette: true },
  { dpr: 1.25, msaa: 2, bloom: true, dust: true, vignette: true },
  { dpr: 1.0, msaa: 0, bloom: true, dust: false, vignette: true },
  { dpr: 0.85, msaa: 0, bloom: false, dust: false, vignette: true },
  { dpr: 0.7, msaa: 0, bloom: false, dust: false, vignette: false },
];

/**
 * 2D stage ladder: backing-store scale, floor reflections, and `detail` (0 full, 1 lean, 2 minimal).
 * The 2D canvas is raster-bound per DRAW OP rather than per pixel, so below full quality the ladder also thins the op count
 * (LED halo/caps, floor bloom pass, fewer disco-ball facets, half the LED bars).
 */
export interface Stage2DLevel { dpr: number; glow: boolean; detail: 0 | 1 | 2 }
export const STAGE2D_LEVELS: Stage2DLevel[] = [
  { dpr: 2, glow: true, detail: 0 }, { dpr: 1.5, glow: true, detail: 0 }, { dpr: 1.25, glow: true, detail: 1 }, { dpr: 1, glow: false, detail: 1 }, { dpr: 0.85, glow: false, detail: 2 },
];

/** Starting level per requested quality (the governor then moves from there). */
export function startLevel(quality: 'high' | 'medium' | 'low', levels: number): number {
  return Math.min(levels - 1, quality === 'high' ? 0 : quality === 'medium' ? Math.ceil(levels / 2) - 1 : levels - 2);
}
