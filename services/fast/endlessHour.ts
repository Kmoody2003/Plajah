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
import {
  sharedSongAt, sharedInflectionAt, EMPTY_ENDLESS_HOUR_CONFIG,
  type EndlessHourConfig, type InflectionSong,
} from './inflection';

/**
 * The channel spine's timer period.
 *
 * This loop only detects arc/slot boundaries and feeds the visual sampler, both of which move over
 * seconds, so 100 ms foregrounded is ample. Backgrounded it throttles to ~1 Hz, which still cannot
 * miss a boundary because boundaries are detected by a change of arc INDEX, never by proximity to
 * one — a coarse clock steps over a proximity window but cannot step over an identity change.
 */
const CHANNEL_TICK_MS = 100;

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
  /** The Inflection Points config — the song pool + policy. Omitted → purely generative, exactly
   *  as before. Songs surface only when an admin has enabled the pool. */
  config?: EndlessHourConfig;
  /** Fires when a real song starts/stops crossfading in on the shared stream (for the UI chrome). */
  onSong?: (song: InflectionSong | null) => void;
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
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** The programme currently on air, so a boundary is detected by change rather than by clock maths. */
  private programmeKey = '';
  private programme: GenerativeProgramme;

  /** Drives the visuals. One sampler for the channel, fed from whichever session is on air, so
   *  the picture cannot disagree with the sound about which one that is. */
  readonly sampler = new StillnessDriverSampler();

  private mode: SolaMode = 'stream';

  // ── Inflection Points (real songs crossfading over the generative bed) ────────
  private config: EndlessHourConfig;
  /** The generative bed passes through this on the way out; a song ducks it fully to 0. Separate
   *  from `sharedGain` (which the Sola controller owns) so the two crossfades never fight. */
  private songBedGain: GainNode | null = null;
  private songGain: GainNode | null = null;
  private songAudio: HTMLAudioElement | null = null;
  private songSource: MediaElementAudioSourceNode | null = null;
  private currentSongId: string | null = null;
  private lastSongGain = -1;
  private lastBedGain = -1;

  constructor(opts: EndlessHourOptions) {
    this.opts = opts;
    this.config = opts.config ?? EMPTY_ENDLESS_HOUR_CONFIG;
    this.programme = programmeAt(this.clock());
  }

  /** Live-update the pool/policy (an admin edit) without tearing the channel down. */
  setConfig(config: EndlessHourConfig): void { this.config = config; }
  /** The song crossfading in right now on the shared stream, if any (for the admin viewer). */
  get nowSong(): InflectionSong | null {
    if (!this.currentSongId) return null;
    return this.config.pool.find((s) => s.id === this.currentSongId) ?? null;
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
    this.sharedGain = gain;

    // The bed's own crossfade stage, downstream of the Sola-owned sharedGain, so a song ducking the
    // bed and a Sola burst fading the stream are two independent multiplications that never collide.
    const bedGain = ctx.createGain();
    bedGain.gain.value = 1;
    gain.connect(bedGain);
    bedGain.connect(this.opts.destination);
    this.songBedGain = bedGain;

    // The song's own gain, in parallel — the crossfade is bed↓ / song↑.
    const songGain = ctx.createGain();
    songGain.gain.value = 0;
    songGain.connect(this.opts.destination);
    this.songGain = songGain;

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
    // A timer, not rAF: the channel spine — arc re-arming above all — must keep running when the
    // tab is hidden or the screen has dimmed, which is the normal state of a channel left on. rAF
    // stops dead there, which is how the stream used to fall silent after the first arc.
    this.tick();
    this.timer = setInterval(this.tick, CHANNEL_TICK_MS);
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
    // Keyed by the ARC, not just the slot. A slot is hours long and holds many arcs back to back;
    // keying only on the slot meant the channel started one arc and then, when it finished, had
    // nothing to re-arm until the next slot — silence for the rest of the hour. The arc index is
    // what turns "one session" into "a channel".
    this.programmeKey = `${prog.form.id}:${prog.seed}:${pos.arcIndex}`;
    this.opts.onProgramme?.(prog);

    const previous = this.shared;
    const session = new StillnessSession({
      ctx: this.opts.ctx,
      destination: this.sharedGain!,
      durationSec: prog.arcSec,
      arrival: prog.arrival,
      // The per-arc shared seed, derived from the clock so every viewer still resolves the same
      // one. Using the slot seed here made every arc in a four-hour block identical — the one
      // thing a generative channel has no excuse for. Passing a seed at all is what makes this the
      // broadcast rather than a private burst.
      seed: pos.seed,
      // The channel is a different thing from a single Stillness Deep session: it is lived in for
      // hours, so it carries the fuller arrangement — a slow arpeggiation that drifts in and out,
      // a muted pulse that comes and goes, and a Turn softened into a swell so nothing on a calm
      // field left running ever arrives as a jolt.
      arp: true,
      // The pulse is the soft KICK now, gated by the kick knob (zeroing it retires the worklet).
      pulse: true,
      gentleTurn: true,
      melody: true,
      // The mark of the most recent Inflection Point, if one is still decaying. Computed once at the
      // arc's start, so a later arc simply gets a weaker value — the soundscape carries the song's
      // colour and then lets it go. Null when no song has played recently → an ordinary arc.
      inflection: sharedInflectionAt(nowMs, this.config),
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

    // Arc and slot boundaries, by identity rather than by arithmetic on the clock. The key
    // carries the arc index, so this fires at the end of every arc as well as every slot — which
    // is what re-arms the next session seamlessly instead of decaying into silence.
    const prog = programmeAt(nowMs);
    const pos = arcPositionAt(nowMs);
    const key = `${prog.form.id}:${prog.seed}:${pos.arcIndex}`;
    if (key !== this.programmeKey && this.mode === 'stream') {
      // Only re-seed while on the shared side. Re-seeding under a running burst would cut a
      // session someone is inside, and the burst is already scheduled to end on an arc boundary.
      void this.tuneShared(nowMs);
    }

    // Whichever session is on air feeds the one sampler.
    const state = this.frameState(nowMs);
    if (state) this.sampler.update(state, nowMs);

    // Inflection Points: a real song crossfading over the generative bed (shared stream only).
    this.driveSong(nowMs);
  };

  /**
   * Crossfade a scheduled song in over the bed, or fold back to the bed when none is due.
   *
   * The schedule is deterministic (`sharedSongAt`), so every viewer starts the same song at the
   * same position — a joining device seeks to `offsetSec`. Gains are deduped, so in the body of a
   * song (bed at 0, song at 1) nothing is written; only the ~8 s crossfades touch an AudioParam.
   */
  private driveSong(nowMs: number): void {
    const bed = this.songBedGain, sg = this.songGain;
    if (!bed || !sg) return;
    // Songs belong to the shared broadcast; a private burst owns its own audio.
    const s = this.mode === 'stream' ? sharedSongAt(nowMs, this.config) : null;
    if (s) {
      if (s.song.id !== this.currentSongId) this.startSong(s.song, s.offsetSec);
      this.setGain(sg, 'song', s.songGain);
      this.setGain(bed, 'bed', s.bedGain);
    } else if (this.currentSongId) {
      // Past the window (or a burst took over): fold back to the bed and release the song.
      this.setGain(sg, 'song', 0);
      this.setGain(bed, 'bed', 1);
      this.stopSong();
    }
  }

  /** Set a crossfade gain, but only when it has actually moved — the automation-leak rule the whole
   *  engine now obeys. A short tau keeps the 10 Hz updates smooth. */
  private setGain(node: GainNode, which: 'song' | 'bed', value: number): void {
    const last = which === 'song' ? this.lastSongGain : this.lastBedGain;
    if (Math.abs(value - last) < 0.004) return;
    if (which === 'song') this.lastSongGain = value; else this.lastBedGain = value;
    node.gain.setTargetAtTime(value, this.opts.ctx.currentTime, 0.12);
  }

  private startSong(song: InflectionSong, offsetSec: number): void {
    this.stopSong();
    try {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = song.audioUrl;
      // Seek so all viewers are at the same position in the shared song.
      const seek = () => { try { audio.currentTime = Math.max(0, offsetSec); } catch { /* pre-metadata */ } };
      if (audio.readyState >= 1) seek();
      else audio.addEventListener('loadedmetadata', seek, { once: true });
      const src = this.opts.ctx.createMediaElementSource(audio);
      src.connect(this.songGain!);
      void audio.play().catch(() => { /* autoplay/CORS refusal — the bed crossfade still runs */ });
      this.songAudio = audio;
      this.songSource = src;
      this.currentSongId = song.id;
      this.opts.onSong?.(song);
    } catch {
      this.currentSongId = null;
    }
  }

  private stopSong(): void {
    if (this.songAudio) { try { this.songAudio.pause(); } catch { /* */ } this.songAudio.src = ''; }
    if (this.songSource) { try { this.songSource.disconnect(); } catch { /* */ } }
    this.songAudio = null;
    this.songSource = null;
    if (this.currentSongId) { this.currentSongId = null; this.opts.onSong?.(null); }
  }

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
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.sola?.stop();
    this.sola = null;
    this.shared?.dispose(true);
    this.shared = null;
    this.stopSong();
    this.songGain?.disconnect();
    this.songGain = null;
    this.songBedGain?.disconnect();
    this.songBedGain = null;
    this.sharedGain?.disconnect();
    this.sharedGain = null;
  }
}
