// The Endless Hour, as a thing that actually runs.
//
// Channel 8.1. Everything on it is made at playback; nothing on it is a file.
//
// TWO SEEDS, ONE ENGINE
//
// The channel is always rendering a session. What changes is WHOSE:
//
//   stream  — seeded from the clock (`programmeSeed`), so every viewer in the world resolves the
//             same number and sees the same thing. This is the shared broadcast.
//   sola    — seeded from entropy, held in one private field, written nowhere. This is the burst
//             that belongs to one viewer and to nobody else, ever.
//
// WHY THERE IS NO STREAM TO CONNECT TO
//
// The shared broadcast is not a file being served from anywhere. It is a deterministic render of
// a seed derived from the date and hour — which means a device capable of rendering it produces
// *bit-identical output to the carriage*, without the carriage. The server-side HLS path is an
// optimisation for devices that cannot render, not the source of truth. So a capable device
// renders the shared seed locally and is, correctly, watching the same channel as everyone else.
//
// That is also why the handoff can be seamless. `convergedState` can compute where the shared
// stream WILL be at the crossfade second, because the shared stream is a function, not a feed.

import { StillnessSession } from '../ora/stillness/sessionRunner';
import { StillnessDriverSampler } from '../../components/plajahPixels/engine/stillnessDrivers';
import type { SessionState } from '../ora/stillness/emotionalEngine';
import { SolaController, provisionalTier, type SolaMode } from './solaController';
import { arcPositionAt, programmeAt, type GenerativeProgramme } from './generativeChannel';
import type { DeviceTier } from './sola';

export interface EndlessHourOptions {
  ctx: AudioContext;
  destination: AudioNode;
  tier?: DeviceTier;
  noticesEnabled?: boolean;
  /** Sessions this viewer has already been given. The opening notice retires after three. */
  solaSessionsSeen?: number;
  onModeChange?: (mode: SolaMode) => void;
  onNotice?: (which: 'open' | 'close') => void;
  onProgramme?: (p: GenerativeProgramme) => void;
  /** Injectable so the whole channel can be driven off a fake clock in a test. */
  now?: () => number;
}

export interface EndlessHourFrame {
  state: SessionState;
  sampler: StillnessDriverSampler;
  /** True while what you are seeing exists only on this device. */
  isSola: boolean;
  programme: GenerativeProgramme;
}

/**
 * One tuned-in device.
 *
 * Owns the shared render, hands its gain node to the Sola controller as the "stream" side of the
 * crossfade, and re-seeds at each programme boundary.
 */
export class EndlessHour {
  private opts: EndlessHourOptions;
  private shared: StillnessSession | null = null;
  private sharedGain: GainNode | null = null;
  private sola: SolaController | null = null;
  private raf: number | null = null;
  private running = false;

  /** The programme currently on air, so a boundary is detected by change rather than by clock maths. */
  private programmeKey = '';
  private programme: GenerativeProgramme;

  /** Drives the visuals. One sampler for the channel, fed from whichever session is on air, so
   *  the picture cannot disagree with the sound about which one that is. */
  readonly sampler = new StillnessDriverSampler();

  private mode: SolaMode = 'stream';

  constructor(opts: EndlessHourOptions) {
    this.opts = opts;
    this.programme = programmeAt(this.clock());
  }

  private clock(): number { return this.opts.now ? this.opts.now() : Date.now(); }

  get currentMode(): SolaMode { return this.mode; }
  get isSola(): boolean { return this.mode !== 'stream'; }
  get nowPlaying(): GenerativeProgramme { return this.programme; }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const ctx = this.opts.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(this.opts.destination);
    this.sharedGain = gain;

    await this.tuneShared(this.clock());

    // The Sola controller crossfades a private burst against the shared render. It only needs
    // the shared side as a gain node — it does not care that the "stream" is being produced on
    // this device rather than arriving over the wire, which is exactly the property that lets
    // the carriage path be added later without touching any of this.
    this.sola = new SolaController({
      ctx,
      destination: this.opts.destination,
      streamGain: gain,
      tier: this.opts.tier ?? provisionalTier(),
      noticesEnabled: this.opts.noticesEnabled,
      solaSessionsSeen: this.opts.solaSessionsSeen,
      now: this.opts.now,
      onModeChange: (m) => { this.mode = m; this.opts.onModeChange?.(m); },
      onNotice: (w) => this.opts.onNotice?.(w),
    });
    this.sola.start();
    this.tick();
  }

  /**
   * Join the shared programme, mid-arc.
   *
   * Tuning in at 14 minutes past must drop you 14 minutes into the session, not start one — a
   * channel you can restart is not a channel. `start(offsetSec)` is what makes that possible.
   */
  private async tuneShared(nowMs: number): Promise<void> {
    const prog = programmeAt(nowMs);
    const pos = arcPositionAt(nowMs);
    this.programme = prog;
    this.programmeKey = `${prog.form.id}:${prog.seed}`;
    this.opts.onProgramme?.(prog);

    const previous = this.shared;
    const session = new StillnessSession({
      ctx: this.opts.ctx,
      destination: this.sharedGain!,
      durationSec: prog.arcSec,
      arrival: prog.arrival,
      // The shared seed. Passing one is what makes this the broadcast rather than a burst.
      seed: prog.seed,
    });
    this.shared = session;
    await session.start(pos.offsetSec);

    // Let the outgoing programme's tails ring out under the incoming one. A modal body's tail is
    // most of what it is, and a channel that hard-cuts between programmes sounds like a channel
    // that dropped out.
    previous?.dispose(false);
  }

  private tick = (): void => {
    if (!this.running) return;
    const nowMs = this.clock();

    // Programme boundaries, by identity rather than by arithmetic on the clock.
    const prog = programmeAt(nowMs);
    const key = `${prog.form.id}:${prog.seed}`;
    if (key !== this.programmeKey && this.mode === 'stream') {
      // Only re-seed while on the shared side. Re-seeding under a running burst would cut a
      // session someone is inside, and the burst is already scheduled to end on an arc boundary.
      void this.tuneShared(nowMs);
    }

    // Whichever session is on air feeds the one sampler.
    const state = this.frameState(nowMs);
    if (state) this.sampler.update(state, nowMs);

    this.raf = requestAnimationFrame(this.tick);
  };

  /**
   * The state driving picture and sound this instant.
   *
   * During a handoff this is the CONVERGED state — the burst already bending toward where the
   * shared render will be — so the visuals arrive at the crossfade in the same breath phase the
   * audio does. Reading the two from different places is how a seam gets in.
   */
  private frameState(nowMs: number): SessionState | null {
    if (this.mode !== 'stream' && this.sola) {
      const converged = this.sola.convergedState(nowMs);
      if (converged) return converged;
    }
    const shared = this.shared;
    if (!shared) return null;
    return shared.session.at(arcPositionAt(nowMs).offsetSec);
  }

  /** Everything a renderer needs, in one read. */
  frame(): EndlessHourFrame | null {
    const state = this.frameState(this.clock());
    if (!state) return null;
    return { state, sampler: this.sampler, isSola: this.isSola, programme: this.programme };
  }

  stop(): void {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.sola?.stop();
    this.sola = null;
    this.shared?.dispose(true);
    this.shared = null;
    this.sharedGain?.disconnect();
    this.sharedGain = null;
  }
}
