// The Sola controller — what actually alternates a device between making and receiving.
//
// sola.ts holds the rules (tiers, burst planning, convergence, crossfade, the notice). This is
// the thing that runs them: it owns a StillnessSession, decides when a burst may begin, steers
// it onto the shared stream's state as the handoff approaches, and crossfades.
//
// It does NOT own an <audio> element for the shared stream. The caller supplies a gain node for
// that, because on Plajah's own surfaces the "stream" during a cooldown is just another locally
// rendered session on the channel's shared seed — no bandwidth at all — while on a carriage
// platform it is real HLS. Both are a level to fade.
//
// Everything below is time-driven from the audio clock rather than from a timer, for the same
// reason the runner is: a backgrounded tab throttles timers, and a handoff that slips because
// someone changed tabs is exactly the jolt this exists to prevent.

import { StillnessSession } from '../ora/stillness/sessionRunner';
import type { SessionState } from '../ora/stillness/emotionalEngine';
import { arcPositionAt, programmeAt } from './generativeChannel';
import {
  CONVERGE_SEC, CROSSFADE_SEC, TIER_POLICY, converge, convergenceAmount,
  crossfadeGains, planBurst, shouldShowNotice, type DeviceTier,
} from './sola';

export type SolaMode = 'stream' | 'sola' | 'handoff';

export interface SolaControllerOptions {
  ctx: AudioContext;
  /** Where a locally rendered burst goes. */
  destination: AudioNode;
  /** Level of the shared stream, whatever is producing it. Faded against the burst. */
  streamGain: GainNode;
  tier: DeviceTier;
  /** Notices are a courtesy, not the product — off is a supported way to watch. */
  noticesEnabled?: boolean;
  /** How many Sola sessions this viewer has already seen. The opening notice retires after
   *  three: it is informative, and information stops being useful the fourth time. */
  solaSessionsSeen?: number;
  onModeChange?: (mode: SolaMode) => void;
  /** Fires when the opening or closing line should be shown. */
  onNotice?: (which: 'open' | 'close') => void;
  /** Clock source, injectable so this is testable without waiting twenty minutes. */
  now?: () => number;
}

export class SolaController {
  private opts: SolaControllerOptions;
  private policy = TIER_POLICY.stream;
  private session: StillnessSession | null = null;
  private burstGain: GainNode | null = null;
  private mode: SolaMode = 'stream';
  private burstStartedAt = 0;
  private burstEndsAt = 0;
  private lastBurstEndedAt = -Infinity;
  private noticeShown = false;
  private closeShown = false;
  /** Last arc index seen, so a boundary is detected by CHANGE rather than by proximity. */
  private lastArcIndex = -1;
  private raf: number | null = null;
  private running = false;

  /** Sessions seen, so the opening notice can retire itself. Never the seed. */
  private seen: number;

  constructor(opts: SolaControllerOptions) {
    this.opts = opts;
    this.policy = TIER_POLICY[opts.tier];
    this.seen = opts.solaSessionsSeen ?? 0;
  }

  get currentMode(): SolaMode { return this.mode; }

  /** Whether a burst is running. Deliberately the only thing exposed about it — never the seed. */
  get inSola(): boolean { return this.mode !== 'stream'; }

  private clock(): number { return this.opts.now ? this.opts.now() : Date.now(); }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.opts.streamGain.gain.setTargetAtTime(1, this.opts.ctx.currentTime, 1.0);
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.endBurst(true);
  }

  private tick = (): void => {
    if (!this.running) return;
    const nowMs = this.clock();

    if (this.mode === 'stream') {
      this.maybeStartBurst(nowMs);
    } else {
      this.driveBurst(nowMs);
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  /**
   * Begin a burst, if the tier allows one and enough cooling has passed.
   *
   * The burst takes one COMPLETE arc, never a fixed number of minutes. Cutting mid-arc is the
   * one thing this design does not do, so a policy that cannot afford a whole arc declines
   * rather than starting something it will have to interrupt.
   */
  private maybeStartBurst(nowMs: number): void {
    const prog = programmeAt(nowMs);
    const since = (nowMs - this.lastBurstEndedAt) / 1000;
    const plan = planBurst(this.policy, prog.arcSec, since);
    if (!plan.allowed) return;

    // Start at an arc boundary, detected by the arc index CHANGING rather than by the offset
    // being small. Proximity is a trap: it asks "are we within two seconds of a boundary", which
    // only holds if frames arrive more often than that. A backgrounded tab throttled to one
    // frame a second is fine, but anything coarser — a slow device, a stepped clock — steps
    // straight over the window and the channel silently never bursts again. A change of index
    // cannot be missed however far apart the samples are.
    const pos = arcPositionAt(nowMs);
    const first = this.lastArcIndex < 0;
    const crossed = pos.arcIndex !== this.lastArcIndex;
    this.lastArcIndex = pos.arcIndex;
    if (!first && !crossed) return;
    // On the very first tick, only start if we happen to be near the top of an arc — joining a
    // channel mid-arc should put you on the stream, not into somebody's half-finished session.
    if (first && pos.offsetSec > 5) return;

    void this.beginBurst(nowMs, plan.durationSec, prog.arrival);
  }

  private async beginBurst(nowMs: number, durationSec: number, arrival: 1 | 2 | 3 | 4 | 5): Promise<void> {
    if (this.session) return;
    const ctx = this.opts.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.opts.destination);

    // No seed passed. It is drawn from entropy inside the session, held in one private field,
    // and written nowhere — not stored, not logged, not in analytics. The moment has to be
    // genuinely unrecoverable rather than merely un-offered.
    const session = new StillnessSession({
      ctx, destination: gain, durationSec, arrival,
    });
    this.session = session;
    this.burstGain = gain;
    this.burstStartedAt = nowMs;
    this.burstEndsAt = nowMs + durationSec * 1000;
    this.noticeShown = false;
    this.closeShown = false;
    this.setMode('sola');

    await session.start();
    // Fade in against the stream rather than cutting to it.
    gain.gain.setTargetAtTime(1, ctx.currentTime, 2.0);
    this.opts.streamGain.gain.setTargetAtTime(0, ctx.currentTime, 2.0);
  }

  private driveBurst(nowMs: number): void {
    const session = this.session;
    const gain = this.burstGain;
    if (!session || !gain) return;

    const untilHandoff = (this.burstEndsAt - nowMs) / 1000;
    const elapsed = (nowMs - this.burstStartedAt) / 1000;

    // The opening notice, once the session is already underway. Nothing announces itself before
    // it has begun.
    if (!this.noticeShown && elapsed >= 40) {
      this.noticeShown = true;
      if (shouldShowNotice({ inSola: true, noticesEnabled: this.opts.noticesEnabled !== false, solaSessionsSeen: this.seen })) {
        this.opts.onNotice?.('open');
      }
    }

    if (untilHandoff <= CONVERGE_SEC && this.mode !== 'handoff') this.setMode('handoff');

    // The crossfade. Equal power, so the middle does not dip.
    if (untilHandoff <= CROSSFADE_SEC) {
      const g = crossfadeGains(untilHandoff);
      const t = this.opts.ctx.currentTime;
      gain.gain.setValueAtTime(g.local, t);
      this.opts.streamGain.gain.setValueAtTime(g.stream, t);
    }

    if (untilHandoff <= 0) {
      this.endBurst(false);
      // The closing line lands just after the crossfade completes — it is the part that is felt
      // rather than read, and it is where the sense of something having passed actually sits.
      if (!this.closeShown && this.opts.noticesEnabled !== false) {
        this.closeShown = true;
        this.opts.onNotice?.('close');
      }
    }
  }

  /**
   * The state a burst should be steering toward.
   *
   * This is the whole reason a unique local render can rejoin a shared broadcast without a seam:
   * the stream is deterministic, so its state at the handoff second is computable in advance.
   * The fade then happens between two things already in the same breath phase, at the same
   * depth, at the same brightness.
   */
  convergedState(nowMs: number): SessionState | null {
    const session = this.session;
    if (!session) return null;
    const local = session.session.at((nowMs - this.burstStartedAt) / 1000);
    const untilHandoff = (this.burstEndsAt - nowMs) / 1000;
    const k = convergenceAmount(untilHandoff);
    if (k <= 0) return local;

    // Where the shared stream will be when the burst ends.
    const pos = arcPositionAt(this.burstEndsAt);
    const target = session.stateAt(pos.offsetSec);
    return converge(local, target, k);
  }

  private endBurst(hard: boolean): void {
    const session = this.session;
    const gain = this.burstGain;
    this.session = null;
    this.burstGain = null;
    if (session) {
      session.dispose(hard);
      this.seen++;
      this.lastBurstEndedAt = this.clock();
    }
    if (gain && !hard) {
      window.setTimeout(() => gain.disconnect(), 8000);
    } else if (gain) {
      gain.disconnect();
    }
    this.opts.streamGain.gain.setTargetAtTime(1, this.opts.ctx.currentTime, 1.5);
    this.setMode('stream');
  }

  private setMode(m: SolaMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.opts.onModeChange?.(m);
  }
}

/**
 * Measure what a device can actually sustain, and pick its tier from that.
 *
 * From a MEASURED sustained load, never from a spec sheet. A meditation session is twenty
 * minutes; a channel is left on overnight. A session-length benchmark will not surface the
 * thermal behaviour that decides this, which is why the real answer is a six-hour soak and this
 * function is only the bootstrap guess used before one has been run.
 */
export function provisionalTier(): DeviceTier {
  if (typeof navigator === 'undefined') return 'stream';
  const cores = navigator.hardwareConcurrency ?? 2;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 2;
  // A TV stick reports few cores and little memory, and is exactly the case where a stuttering
  // unique moment would be worse than a smooth shared one.
  if (cores >= 8 && mem >= 8) return 'continuous';
  if (cores >= 4 && mem >= 4) return 'burst';
  return 'stream';
}
