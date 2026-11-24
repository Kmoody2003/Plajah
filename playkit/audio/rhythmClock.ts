// playkit/audio/rhythmClock.ts
//
// Shared Sample-Accurate Rhythm Clock, Beat Evaluator & Cue Graph.
// Powers Rift Realm (on-beat shooting/dashing), Kith Party (Chora rhythm charts),
// Era Clash / Ravencrest combat cues, and creator rhythm games.

export type BeatQuality = 'PERFECT' | 'GOOD' | 'MISS';

export interface BeatJudgement {
  quality: BeatQuality;
  beatIndex: number;
  offsetMs: number;
  signedOffsetMs: number;
}

export interface RhythmWindowsMs {
  perfectMs: number;
  goodMs: number;
}

export interface AudioCue {
  id: string;
  src?: string;
  gain?: number;
  pitchJitter?: number;
  loop?: boolean;
  bus: 'music' | 'sfx' | 'voice' | 'ambient';
}

export interface ChartNote {
  id: string;
  timeSec: number;
  lane: number;
  accent?: boolean;
  judged?: BeatQuality;
}

export class RhythmClock {
  bpm: number;
  readonly windows: RhythmWindowsMs;
  private startSec = 0;
  private currentSec = 0;
  private running = false;
  private audioEnergy = 0;
  private cues = new Map<string, AudioCue>();

  phase = 0;
  pulse = 0;
  beatIndex = 0;
  barIndex = 0;
  beatsPerBar: number;

  constructor(opts?: { bpm?: number; beatsPerBar?: number; windows?: Partial<RhythmWindowsMs> }) {
    this.bpm = opts?.bpm ?? 124;
    this.beatsPerBar = opts?.beatsPerBar ?? 4;
    this.windows = {
      perfectMs: opts?.windows?.perfectMs ?? 85,
      goodMs: opts?.windows?.goodMs ?? 170,
    };
  }

  get beatSec(): number {
    return 60 / this.bpm;
  }

  get elapsedSec(): number {
    return this.running ? Math.max(0, this.currentSec - this.startSec) : 0;
  }

  start(nowSec = 0): void {
    this.startSec = nowSec;
    this.currentSec = nowSec;
    this.running = true;
    this.update(nowSec, 0);
  }

  stop(): void {
    this.running = false;
  }

  /** Advance clock from AudioContext.currentTime (or deterministic sim time in tests). */
  update(nowSec: number, externalBassEnergy = 0): void {
    if (!this.running) return;
    this.currentSec = nowSec;
    this.audioEnergy = Math.max(0, Math.min(1, externalBassEnergy));

    const exactBeat = this.elapsedSec / this.beatSec;
    this.beatIndex = Math.floor(exactBeat);
    this.barIndex = Math.floor(this.beatIndex / this.beatsPerBar);
    this.phase = exactBeat - this.beatIndex;

    const clockPulse = Math.exp(-this.phase * 5.2);
    this.pulse = Math.min(1, Math.max(clockPulse, this.audioEnergy * 0.65));
  }

  /** Judge an action against the nearest beat. */
  judgeBeat(atSec = this.currentSec): BeatJudgement {
    if (!this.running) {
      return { quality: 'GOOD', beatIndex: 0, offsetMs: 0, signedOffsetMs: 0 };
    }
    const elapsed = Math.max(0, atSec - this.startSec);
    const exactBeat = elapsed / this.beatSec;
    const nearest = Math.round(exactBeat);
    const signedMs = Math.round((exactBeat - nearest) * this.beatSec * 1000);
    const offsetMs = Math.abs(signedMs);

    const quality: BeatQuality =
      offsetMs <= this.windows.perfectMs ? 'PERFECT' :
      offsetMs <= this.windows.goodMs ? 'GOOD' : 'MISS';

    return { quality, beatIndex: nearest, offsetMs, signedOffsetMs: signedMs };
  }

  /** Judge a 4-lane rhythm chart tap (Kith Party / creator rhythm games). */
  judgeLaneNote(notes: ChartNote[], lane: number, atSec = this.elapsedSec): { note: ChartNote | null; quality: BeatQuality; offsetMs: number } {
    let best: ChartNote | null = null;
    let bestAbs = Infinity;
    for (const n of notes) {
      if (n.judged || n.lane !== lane) continue;
      const diffMs = Math.abs(n.timeSec - atSec) * 1000;
      if (diffMs < bestAbs) {
        bestAbs = diffMs;
        best = n;
      }
    }
    if (!best || bestAbs > this.windows.goodMs) {
      return { note: null, quality: 'MISS', offsetMs: Number.isFinite(bestAbs) ? Math.round(bestAbs) : 999 };
    }
    const quality: BeatQuality = bestAbs <= this.windows.perfectMs ? 'PERFECT' : 'GOOD';
    best.judged = quality;
    return { note: best, quality, offsetMs: Math.round(bestAbs) };
  }

  registerCue(cue: AudioCue): void {
    this.cues.set(cue.id, cue);
  }

  getCue(id: string): AudioCue | undefined {
    return this.cues.get(id);
  }

  listCues(): AudioCue[] {
    return [...this.cues.values()];
  }
}
