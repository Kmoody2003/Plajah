// Sound: reuses Plajah's procedural castle engine (music zones + surface footsteps) and
// adds a small ambience bed (night wind outside, low room tone in the hall).
import { halloweenAudio, type CastleMusicZone, type CastleSurfaceType } from '../../../services/halloween/halloweenAudioSfx';

export class GameAudio {
  private started = false;
  private zone: CastleMusicZone | null = null;
  private ctx: AudioContext | null = null;
  private wind: GainNode | null = null;
  private room: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private stride = 0;
  muted = new URLSearchParams(location.search).get('audio') === '0';

  /** Browsers require a user gesture before audio can start. */
  armOnFirstGesture() {
    const go = () => { this.start(); removeEventListener('pointerdown', go); removeEventListener('keydown', go); };
    addEventListener('pointerdown', go);
    addEventListener('keydown', go);
  }

  private start() {
    if (this.started || this.muted) return;
    this.started = true;
    halloweenAudio.startGothicCastleMusic(this.zone ?? 'CROSSROADS');
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    // Brown noise bed, filtered: wind outside, room tone inside.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 420; this.windFilter.Q.value = 0.6;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = 'lowpass'; roomFilter.frequency.value = 160;
    this.room = ctx.createGain(); this.room.gain.value = 0;
    src.connect(this.windFilter).connect(this.wind).connect(ctx.destination);
    src.connect(roomFilter).connect(this.room).connect(ctx.destination);
    src.start();
  }

  /** Per-frame: crossfade ambience by location, drift the wind, drive the music zone. */
  update(t: number, place: 'road' | 'yard' | 'hall' | 'gallery') {
    const zone: CastleMusicZone = place === 'road' ? 'CROSSROADS' : place === 'gallery' ? 'UPPER_NOBLE' : 'GROUND_HALLS';
    if (zone !== this.zone) { this.zone = zone; halloweenAudio.setGothicMusicZone(zone); }
    if (!this.ctx || !this.wind || !this.room || !this.windFilter) return;
    const now = this.ctx.currentTime;
    const outside = place === 'road' || place === 'yard';
    const gust = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.07 + 1.3);
    this.wind.gain.setTargetAtTime(outside ? 0.05 + 0.07 * gust : 0.0, now, 0.4);
    this.windFilter.frequency.setTargetAtTime(300 + 380 * gust, now, 0.5);
    this.room.gain.setTargetAtTime(outside ? 0 : 0.06, now, 0.6);
  }

  /** Footsteps from distance travelled, so cadence always matches the stride. */
  step(distance: number, speed: number, surface: CastleSurfaceType) {
    if (!this.started) return;
    const running = speed > 3;
    this.stride += distance;
    const len = running ? 1.35 : 0.78;
    if (this.stride >= len) { this.stride = 0; halloweenAudio.playFootstepSfx(surface, running); }
  }
}
