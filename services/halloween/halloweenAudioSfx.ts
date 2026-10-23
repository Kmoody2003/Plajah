/**
 * halloweenAudioSfx.ts
 *
 * Web Audio API sound effects, Procedural Gothic Castle Soundtrack & Spatial Room Ambience,
 * real extracted movie voice clips, & Grindhouse Bushido-Blade/Fortnite combat audio for:
 *  - Procedural Gothic Haunted Castle Music Engine (D Harmonic Minor Pipe Organ + Dark Subterranean
 *    Drone Pad + Creepy Attic Celesta Chimes + Haunted Cathedral Reverb Delay)
 *  - Multi-Floor Footstep & Staircase Physics SFX (Wet Asphalt, Gothic Stone, Creaking Attic Wood,
 *    Flooded Crypt Water Splash)
 *  - Bushido Blade Katana Steel Slash, Guard Parry Clang & Spiked Bat Bone-Crunch Impacts
 *  - Real extracted *Pumpkin Patch* character voice clips (`/audio/halloween/voices/*_movie_sample.wav`)
 *  - Wicked Witch Miriam's flying laugh + winged monkey flaps
 *  - Melvin Lester ("Pumpkin Patch") dual orange plasma blade ignition, slash & teleport vanish
 *  - Pumpkin Patch Armored Tank rumble, turret rotation & triple-cannon salvo blasts
 *  - Explosive Molotov Cocktail glass shatter & fireball detonation
 *  - Halloween Chat Room & Filter FX (Bat Swarm ultrasonic flutter, Ghost Face wail, Camcorder click)
 */

export type CastleSurfaceType = 'ASPHALT' | 'STONE' | 'WOOD_ATTIC' | 'CRYPT_WATER' | 'SPIRAL_STAIR';
export type CastleMusicZone = 'CROSSROADS' | 'BASEMENT_CRYPT' | 'GROUND_HALLS' | 'UPPER_NOBLE' | 'CREEPY_ATTIC';

class HalloweenAudioEngine {
  private ctx: AudioContext | null = null;
  /** Output trim (1 = unchanged); Ravencrest sets it to sit its stingers under its own mix. */
  private outGain: GainNode | null = null;
  private outLevel = 1;
  private out(ctx: AudioContext): AudioNode {
    if (!this.outGain || this.outGain.context !== ctx) {
      this.outGain = ctx.createGain();
      this.outGain.gain.value = this.outLevel;
      this.outGain.connect(ctx.destination);
    }
    return this.outGain;
  }
  setOutputLevel(v: number) { this.outLevel = v; if (this.outGain) this.outGain.gain.value = v; }
  private muted = false;
  private musicEnabled = true;
  private musicPlaying = false;
  private musicZone: CastleMusicZone = 'CROSSROADS';
  private musicTimer: number | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private chordStep = 0;

  private voiceBufferCache = new Map<string, AudioBuffer>();
  private activeVoiceSource: AudioBufferSourceNode | null = null;

  private getCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) {
      if (this.activeVoiceSource) {
        try {
          this.activeVoiceSource.stop();
        } catch {
          // ignore
        }
      }
      this.stopGothicCastleMusic();
    } else if (this.musicEnabled) {
      this.startGothicCastleMusic(this.musicZone);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopGothicCastleMusic();
    } else if (!this.muted) {
      this.startGothicCastleMusic(this.musicZone);
    }
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  setGothicMusicZone(zone: CastleMusicZone) {
    this.musicZone = zone;
    if (this.droneOsc1 && this.droneOsc2 && this.ctx) {
      const now = this.ctx.currentTime;
      // Shift dark bass drone pitch by floor elevation for atmospheric immersion
      const baseDroneFreq =
        zone === 'BASEMENT_CRYPT'
          ? 36.71 // D1 sub-crypt rumble
          : zone === 'CREEPY_ATTIC'
          ? 73.42 // D2 eerie high-tension drone
          : 55.0; // A1 gothic pedal point
      try {
        this.droneOsc1.frequency.exponentialRampToValueAtTime(baseDroneFreq, now + 0.8);
        this.droneOsc2.frequency.exponentialRampToValueAtTime(baseDroneFreq * 1.501, now + 0.8);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Starts the continuous Procedural Gothic Haunted Castle Soundtrack
   * (Pipe Organ progressions in D Harmonic Minor + Dark Drone + Attic Music-Box Chimes)
   */
  startGothicCastleMusic(initialZone: CastleMusicZone = 'CROSSROADS') {
    this.musicZone = initialZone;
    if (this.muted || !this.musicEnabled || typeof window === 'undefined') return;
    if (this.musicPlaying) return;

    const ctx = this.getCtx();
    if (!ctx) return;

    this.musicPlaying = true;
    const now = ctx.currentTime;

    // 1. Continuous Subterranean Gothic Pedal Drone
    try {
      const d1 = ctx.createOscillator();
      const d2 = ctx.createOscillator();
      const lpf = ctx.createBiquadFilter();
      const dg = ctx.createGain();

      d1.type = 'sawtooth';
      d2.type = 'triangle';
      d1.frequency.setValueAtTime(36.71, now); // D1
      d2.frequency.setValueAtTime(55.0, now); // A1 fifth

      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(160, now);
      lpf.Q.setValueAtTime(2.5, now);

      dg.gain.setValueAtTime(0.001, now);
      dg.gain.linearRampToValueAtTime(0.045, now + 1.5);

      d1.connect(lpf);
      d2.connect(lpf);
      lpf.connect(dg);
      dg.connect(this.out(ctx));

      d1.start(now);
      d2.start(now);

      this.droneOsc1 = d1;
      this.droneOsc2 = d2;
      this.droneGain = dg;
    } catch {
      // ignore
    }

    // 2. Scheduled Gothic Pipe Organ Chords & Eerie Attic Music-Box Arpeggios
    const progressions: number[][][] = [
      // Dm -> Bbmaj7 -> Gm6 -> A7(b9) in Hz
      [
        [146.83, 174.61, 220.0, 293.66], // D minor
        [587.33, 698.46, 880.0, 659.25, 587.33], // High chime arpeggio
      ],
      [
        [116.54, 146.83, 174.61, 220.0], // Bb Maj7
        [523.25, 466.16, 440.0, 349.23, 440.0],
      ],
      [
        [98.0, 146.83, 174.61, 233.08], // G minor / Bb
        [698.46, 659.25, 587.33, 554.37, 587.33],
      ],
      [
        [110.0, 138.59, 164.81, 233.08], // A7(b9) Gothic diminished tension
        [554.37, 659.25, 783.99, 698.46, 554.37],
      ],
    ];

    const playMusicBar = () => {
      if (!this.musicPlaying || this.muted || !this.musicEnabled) return;
      const c = this.getCtx();
      if (!c) return;
      const t0 = c.currentTime;
      const bar = progressions[this.chordStep % progressions.length];
      this.chordStep++;

      const chordNotes = bar[0];
      const melodyNotes = bar[1];

      // Pipe Organ Swell (richer inside Ground Halls & Upper Noble Floor)
      const organGainScale =
        this.musicZone === 'GROUND_HALLS' || this.musicZone === 'UPPER_NOBLE'
          ? 0.032
          : this.musicZone === 'BASEMENT_CRYPT'
          ? 0.024
          : 0.018;

      chordNotes.forEach((freq) => {
        const osc = c.createOscillator();
        const subOct = c.createOscillator();
        const filter = c.createBiquadFilter();
        const g = c.createGain();

        osc.type = 'sawtooth';
        subOct.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0);
        subOct.frequency.setValueAtTime(freq * 0.5, t0);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(
          this.musicZone === 'BASEMENT_CRYPT' ? 380 : 720,
          t0
        );

        g.gain.setValueAtTime(0.0005, t0);
        g.gain.linearRampToValueAtTime(organGainScale, t0 + 0.85);
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + 3.8);

        osc.connect(filter);
        subOct.connect(filter);
        filter.connect(g);
        g.connect(this.out(c));

        osc.start(t0);
        subOct.start(t0);
        osc.stop(t0 + 3.9);
        subOct.stop(t0 + 3.9);
      });

      // Haunted Music-Box / Celesta Chimes (brighter in Creepy Attic & Upper Floor)
      const chimeGain =
        this.musicZone === 'CREEPY_ATTIC'
          ? 0.045
          : this.musicZone === 'BASEMENT_CRYPT'
          ? 0.016
          : 0.026;

      melodyNotes.forEach((mFreq, idx) => {
        const nt = t0 + idx * 0.72;
        const chime = c.createOscillator();
        const overtone = c.createOscillator();
        const cg = c.createGain();

        chime.type = 'sine';
        overtone.type = 'triangle';
        const pitchMult = this.musicZone === 'CREEPY_ATTIC' ? 2.0 : 1.0;
        chime.frequency.setValueAtTime(mFreq * pitchMult, nt);
        overtone.frequency.setValueAtTime(mFreq * pitchMult * 3.0, nt);

        cg.gain.setValueAtTime(0.0005, nt);
        cg.gain.linearRampToValueAtTime(chimeGain, nt + 0.02);
        cg.gain.exponentialRampToValueAtTime(0.0005, nt + 1.15);

        chime.connect(cg);
        overtone.connect(cg);
        cg.connect(this.out(c));

        chime.start(nt);
        overtone.start(nt);
        chime.stop(nt + 1.2);
        overtone.stop(nt + 1.2);
      });

      // Ambient room texture (Crypt water drip or Attic timber creak or Crossroads thunder)
      if (this.musicZone === 'BASEMENT_CRYPT' && this.chordStep % 2 === 0) {
        this.playWaterDripSfx(t0 + 1.8);
      } else if (this.musicZone === 'CREEPY_ATTIC' && this.chordStep % 2 === 1) {
        this.playTimberCreakSfx(t0 + 2.1);
      } else if (this.musicZone === 'CROSSROADS' && this.chordStep % 4 === 0) {
        this.playNoiseBurst(t0 + 1.2, 1.4, 95, 0.7, 0.07);
      }
    };

    playMusicBar();
    this.musicTimer = window.setInterval(playMusicBar, 3800);
  }

  stopGothicCastleMusic() {
    this.musicPlaying = false;
    if (this.musicTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.droneOsc1) {
      try {
        this.droneOsc1.stop();
      } catch {
        // ignore
      }
      this.droneOsc1 = null;
    }
    if (this.droneOsc2) {
      try {
        this.droneOsc2.stop();
      } catch {
        // ignore
      }
      this.droneOsc2 = null;
    }
    this.droneGain = null;
  }

  private playWaterDripSfx(startTime: number) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, startTime);
    osc.frequency.exponentialRampToValueAtTime(1680, startTime + 0.065);
    g.gain.setValueAtTime(0.04, startTime);
    g.gain.exponentialRampToValueAtTime(0.0005, startTime + 0.09);
    osc.connect(g);
    g.connect(this.out(ctx));
    osc.start(startTime);
    osc.stop(startTime + 0.1);
  }

  private playTimberCreakSfx(startTime: number) {
    const ctx = this.getCtx();
    if (!ctx) return;
    for (let i = 0; i < 5; i++) {
      const t = startTime + i * 0.07;
      this.playNoiseBurst(t, 0.05, 320 + i * 35, 4.5, 0.035);
    }
  }

  /**
   * Surface-Aware Footstep & Spiral Staircase Physics SFX
   */
  playFootstepSfx(surface: CastleSurfaceType = 'STONE', sprinting = false) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = sprinting ? 0.11 : 0.065;

    if (surface === 'CRYPT_WATER') {
      this.playNoiseBurst(now, 0.09, 1150, 1.8, vol * 1.1);
      this.playWaterDripSfx(now + 0.03);
    } else if (surface === 'WOOD_ATTIC') {
      this.playNoiseBurst(now, 0.055, 420, 3.2, vol);
      const thump = ctx.createOscillator();
      const g = ctx.createGain();
      thump.type = 'triangle';
      thump.frequency.setValueAtTime(135, now);
      thump.frequency.exponentialRampToValueAtTime(58, now + 0.06);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      thump.connect(g);
      g.connect(this.out(ctx));
      thump.start(now);
      thump.stop(now + 0.075);
    } else if (surface === 'SPIRAL_STAIR' || surface === 'STONE') {
      this.playNoiseBurst(now, 0.045, 1650, 2.6, vol * 0.9);
      const heel = ctx.createOscillator();
      const g = ctx.createGain();
      heel.type = 'sine';
      heel.frequency.setValueAtTime(175, now);
      heel.frequency.exponentialRampToValueAtTime(65, now + 0.05);
      g.gain.setValueAtTime(vol * 0.85, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      heel.connect(g);
      g.connect(this.out(ctx));
      heel.start(now);
      heel.stop(now + 0.065);
    } else {
      // ASPHALT
      this.playNoiseBurst(now, 0.05, 920, 1.9, vol * 0.85);
    }
  }

  /**
   * Bushido Blade Steel Katana Slash & Guard Parry Ring
   */
  playKatanaSlashSfx(hitMonster = false, isHeavyIaijutsu = false) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // High-velocity steel blade air-cut whistle + metallic ring
    this.playNoiseBurst(now, isHeavyIaijutsu ? 0.22 : 0.13, 2400, 3.2, 0.19);

    const ring = ctx.createOscillator();
    const rg = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(isHeavyIaijutsu ? 1420 : 1180, now);
    ring.frequency.exponentialRampToValueAtTime(580, now + 0.22);
    rg.gain.setValueAtTime(0.11, now);
    rg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    ring.connect(rg);
    rg.connect(this.out(ctx));
    ring.start(now);
    ring.stop(now + 0.25);

    if (hitMonster) {
      this.playNoiseBurst(now + 0.03, 0.14, 1650, 2.0, 0.26);
      const cut = ctx.createOscillator();
      const cg = ctx.createGain();
      cut.type = 'sawtooth';
      cut.frequency.setValueAtTime(220, now + 0.03);
      cut.frequency.exponentialRampToValueAtTime(45, now + 0.19);
      cg.gain.setValueAtTime(0.28, now + 0.03);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
      cut.connect(cg);
      cg.connect(this.out(ctx));
      cut.start(now + 0.03);
      cut.stop(now + 0.22);
    }
  }

  /**
   * Bushido Blade Steel Guard Parry Clang
   */
  playParryClangSfx() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [1840, 2760, 3420];
    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.94, now + 0.35);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(g);
      g.connect(this.out(ctx));
      osc.start(now);
      osc.stop(now + 0.38);
    });
  }

  /**
   * Play a character's real extracted dialogue line from the *Pumpkin Patch* movie!
   */
  async playRealCharacterMovieVoice(charId: string, maxDurationSec = 6.5, gainLevel = 0.72) {
    if (!this.movieVoices) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      let buf = this.voiceBufferCache.get(charId);
      if (!buf) {
        const resp = await fetch(`/audio/halloween/voices/${charId}_movie_sample.wav`);
        if (!resp.ok) return;
        const arr = await resp.arrayBuffer();
        buf = await ctx.decodeAudioData(arr);
        this.voiceBufferCache.set(charId, buf);
      }
      if (this.activeVoiceSource) {
        try {
          this.activeVoiceSource.stop();
        } catch {
          // ignore
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainLevel, ctx.currentTime);
      src.connect(gain);
      gain.connect(this.out(ctx));
      src.start(0, 0, Math.min(buf.duration, maxDurationSec));
      this.activeVoiceSource = src;
    } catch {
      // ignore fetch/decode errors
    }
  }

  /**
   * Wicked Witch Miriam's Laughing Witch Cackle + Flying Monkey Wing Flaps + Real Movie Voice!
   */
  /** Random film dialogue under the stingers (tank, blades, witch). Ravencrest turns it off: it plays
   *  its own matched voice lines, and a random clip talks over them. */
  movieVoices = true;

  playWitchLaughAndMonkeys() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    void this.playRealCharacterMovieVoice('char_3', 5.2, 0.75);

    const notes = [680, 790, 740, 860, 710, 830, 660, 780, 620, 540];
    notes.forEach((freq, i) => {
      const t0 = now + i * 0.14;
      const dur = i === notes.length - 1 ? 0.45 : 0.11;

      const osc = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const formant = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t0 + dur);

      mod.type = 'sine';
      mod.frequency.setValueAtTime(28, t0);
      modGain.gain.setValueAtTime(35, t0);
      mod.connect(modGain);
      modGain.connect(osc.frequency);

      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(1450, t0);
      formant.Q.setValueAtTime(4.2, t0);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.09, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      osc.connect(formant);
      formant.connect(gain);
      gain.connect(this.out(ctx));

      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      mod.start(t0);
      mod.stop(t0 + dur + 0.02);
    });

    for (let w = 0; w < 14; w++) {
      const wt = now + w * 0.16;
      this.playNoiseBurst(wt, 0.075, 320 + (w % 3) * 90, 1.8, 0.08);
    }
  }

  /**
   * Pumpkin Patch's Dual Orange Plasma Blades Ignition ("FSHHH-CRACKLE!") & Real Movie Voice!
   */
  playPlasmaBladesAppear() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    void this.playRealCharacterMovieVoice('char_1', 5.5, 0.78);

    const hum = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const humGain = ctx.createGain();

    hum.type = 'sawtooth';
    sub.type = 'square';
    hum.frequency.setValueAtTime(92, now);
    hum.frequency.exponentialRampToValueAtTime(185, now + 0.18);
    hum.frequency.setValueAtTime(148, now + 0.45);
    sub.frequency.setValueAtTime(74, now);

    humGain.gain.setValueAtTime(0.001, now);
    humGain.gain.linearRampToValueAtTime(0.14, now + 0.08);
    humGain.gain.exponentialRampToValueAtTime(0.05, now + 0.7);
    humGain.gain.exponentialRampToValueAtTime(0.001, now + 1.55);

    hum.connect(humGain);
    sub.connect(humGain);
    humGain.connect(this.out(ctx));

    hum.start(now);
    sub.start(now);
    hum.stop(now + 1.6);
    sub.stop(now + 1.6);

    this.playNoiseBurst(now + 0.05, 0.24, 1200, 2.2, 0.15);
    this.playNoiseBurst(now + 0.42, 0.22, 950, 1.9, 0.14);
    this.playNoiseBurst(now + 0.78, 0.28, 1450, 2.5, 0.15);
  }

  /**
   * Survivor Spiked Baseball Bat Swing & Monster Impact
   */
  playBatSwingSfx(hitMonster = false) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Fast air whoosh
    this.playNoiseBurst(now, 0.14, 520, 1.6, 0.18);

    const whoosh = ctx.createOscillator();
    const wg = ctx.createGain();
    whoosh.type = 'triangle';
    whoosh.frequency.setValueAtTime(290, now);
    whoosh.frequency.exponentialRampToValueAtTime(95, now + 0.15);
    wg.gain.setValueAtTime(0.14, now);
    wg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    whoosh.connect(wg);
    wg.connect(this.out(ctx));
    whoosh.start(now);
    whoosh.stop(now + 0.17);

    if (hitMonster) {
      // Heavy spiked bat impact thud + bone crunch
      const thud = ctx.createOscillator();
      const tg = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(145, now + 0.04);
      thud.frequency.exponentialRampToValueAtTime(38, now + 0.24);
      tg.gain.setValueAtTime(0.32, now + 0.04);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      thud.connect(tg);
      tg.connect(this.out(ctx));
      thud.start(now + 0.04);
      thud.stop(now + 0.27);

      this.playNoiseBurst(now + 0.045, 0.12, 1850, 2.4, 0.24);
    }
  }

  /**
   * Explosive Molotov Cocktail Detonation (Glass Shatter + Fireball Boom + Flame Roar)
   */
  playMolotovExplosionSfx() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Glass bottle shatter (high-frequency clink bursts)
    this.playNoiseBurst(now, 0.09, 4200, 3.5, 0.22);
    this.playNoiseBurst(now + 0.04, 0.08, 5600, 4.0, 0.18);

    // 2. Sub-bass fireball detonation boom
    const boom = ctx.createOscillator();
    const bg = ctx.createGain();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(110, now + 0.02);
    boom.frequency.exponentialRampToValueAtTime(26, now + 0.75);
    bg.gain.setValueAtTime(0.36, now + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    boom.connect(bg);
    bg.connect(this.out(ctx));
    boom.start(now + 0.02);
    boom.stop(now + 0.82);

    // 3. Roaring gasoline fireball whoosh
    this.playNoiseBurst(now + 0.03, 0.68, 340, 0.9, 0.28);
    this.playNoiseBurst(now + 0.18, 0.55, 880, 1.4, 0.18);
  }

  /**
   * Pumpkin Patch Armored Tank Arrival Rumble & Heavy Cannon Salvo
   */
  playTankArrivalSfx() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    void this.playRealCharacterMovieVoice('char_1', 6.0, 0.82);

    // Diesel V12 armored tank engine growl
    const eng = ctx.createOscillator();
    const eg = ctx.createGain();
    eng.type = 'sawtooth';
    eng.frequency.setValueAtTime(46, now);
    eng.frequency.linearRampToValueAtTime(68, now + 0.8);
    eng.frequency.linearRampToValueAtTime(52, now + 2.6);
    eg.gain.setValueAtTime(0.001, now);
    eg.gain.linearRampToValueAtTime(0.18, now + 0.25);
    eg.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
    eng.connect(eg);
    eg.connect(this.out(ctx));
    eng.start(now);
    eng.stop(now + 2.85);
  }

  /**
   * Tank Turret Heavy Cannon Blast
   */
  playTankCannonShotSfx() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const cannon = ctx.createOscillator();
    const cg = ctx.createGain();
    cannon.type = 'triangle';
    cannon.frequency.setValueAtTime(160, now);
    cannon.frequency.exponentialRampToValueAtTime(32, now + 0.42);
    cg.gain.setValueAtTime(0.32, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    cannon.connect(cg);
    cg.connect(this.out(ctx));
    cannon.start(now);
    cannon.stop(now + 0.46);

    this.playNoiseBurst(now, 0.28, 480, 1.2, 0.25);
  }

  /**
   * Bat Swarm Ultrasonic Flutter & Wing Beats
   */
  playBatSwarmSfx() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 10; i++) {
      const t = now + i * 0.11;
      this.playNoiseBurst(t, 0.055, 480 + (i % 4) * 110, 2.0, 0.07);
      const chirp = ctx.createOscillator();
      const cg = ctx.createGain();
      chirp.type = 'sine';
      const f0 = 2600 + (i % 3) * 450;
      chirp.frequency.setValueAtTime(f0, t);
      chirp.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.045);
      cg.gain.setValueAtTime(0.04, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      chirp.connect(cg);
      cg.connect(this.out(ctx));
      chirp.start(t);
      chirp.stop(t + 0.055);
    }
  }

  /**
   * Ghost Face / Lil' Boo Spectral Wail
   */
  playGhostScreamSfx() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(520, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.45);
    osc1.frequency.exponentialRampToValueAtTime(390, now + 1.35);

    osc2.frequency.setValueAtTime(527, now);
    osc2.frequency.exponentialRampToValueAtTime(892, now + 0.45);
    osc2.frequency.exponentialRampToValueAtTime(384, now + 1.35);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.out(ctx));
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.45);
    osc2.stop(now + 1.45);
  }

  /**
   * Found-Footage Night Camcorder Power-On / Flashlight Click
   */
  playFlashlightClick() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playNoiseBurst(now, 0.03, 1800, 4.0, 0.14);

    const whine = ctx.createOscillator();
    const g = ctx.createGain();
    whine.type = 'sine';
    whine.frequency.setValueAtTime(1800, now + 0.02);
    whine.frequency.exponentialRampToValueAtTime(5400, now + 0.35);
    g.gain.setValueAtTime(0.04, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    whine.connect(g);
    g.connect(this.out(ctx));
    whine.start(now + 0.02);
    whine.stop(now + 0.4);
  }

  private playNoiseBurst(
    startTime: number,
    duration: number,
    centerFreq: number,
    q: number,
    peakGain: number
  ) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const bufferSize = Math.max(256, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.out(ctx));
    noise.start(startTime);
    noise.stop(startTime + duration + 0.01);
  }
}

export const halloweenAudio = new HalloweenAudioEngine();
