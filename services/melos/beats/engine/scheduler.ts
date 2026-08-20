// Melos Beats — the lookahead scheduler. The worklet clock posts audio-time ticks (~21ms);
// each tick schedules every event whose time falls inside [cursor, tick + LOOKAHEAD) via
// sample-accurate start(when) calls. Late events (a jammed main thread longer than the
// lookahead) are scheduled immediately — catch up, never skip. All positions are in BEATS;
// `toTime(beats)` is owned by the transport so a live BPM change only moves the anchor.

import type { ArrangeTrack, GrooveDoc, NoteEvent, Pattern, TimelineClip } from '../grooveDoc';

export const LOOKAHEAD_SEC = 0.15;
const STEP_BEATS = 0.25; // 16th notes on a 4/4 grid

export type PlayMode = 'pattern' | 'song';

export interface SchedulerDeps {
  doc(): GrooveDoc;
  toTime(beats: number): number;         // absolute AudioContext time for a beat position
  secPerBeat(): number;
  // rng is injectable so offline renders are deterministic (seeded) while live stays random —
  // the render-twice-byte-identical quality gate depends on this.
  rng(): number;
  trigger(padIdx: number, vel127: number, when: number, gateSec?: number, semiOffset?: number, pan?: number, stepFx?: number): void;
  startAudioClip(track: ArrangeTrack, clip: TimelineClip, when: number, offsetIntoClipSec: number): void;
  /** Instrument tracks: one MIDI note, at an absolute context time, for `durSec`. */
  startInstrumentNote(track: ArrangeTrack, note: NoteEvent, when: number, durSec: number): void;
  /** Fire an armed arp for this track+step. Called for EVERY step in both play modes. */
  runArp?(track: ArrangeTrack, stepIndex: number, beat: number): void;
  /** Is this track's arp enabled? Used to skip its clip notes so they don't double the arp. */
  arpActive?(track: ArrangeTrack): boolean;
  /** Song-mode loop region. When on, scheduling stops at endBeats and the engine re-seeks to
   *  startBeats — so nothing past the loop is ever queued. Null/off = play straight through. */
  loop?(): { on: boolean; startBeats: number; endBeats: number } | null;
}

/** Deterministic PRNG for offline renders (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StepScheduler {
  private mode: PlayMode = 'pattern';
  private patternId: string | null = null;
  private nextStep = 0;                       // monotonic global 16th index from transport zero
  private startedAudioClips = new Set<string>();
  private running = false;

  constructor(private deps: SchedulerDeps) {}

  start(mode: PlayMode, fromBeats: number, patternId?: string) {
    this.mode = mode;
    this.patternId = patternId ?? null;
    this.nextStep = Math.ceil(fromBeats / STEP_BEATS - 1e-9);
    this.startedAudioClips.clear();
    this.running = true;
    if (mode === 'song') this.startMidClips(fromBeats);
  }

  stop() { this.running = false; }

  /** Live path — called on every worklet tick with the current audio time. */
  onTick(nowSec: number) {
    if (!this.running) return;
    this.scheduleWindow(nowSec + LOOKAHEAD_SEC);
  }

  /**
   * Offline path — enumerate every event in [0, endBeats) up front on a graph built over an
   * OfflineAudioContext. Same code path as live scheduling, just an infinite horizon.
   */
  scheduleAll(endBeats: number) {
    this.running = true;
    this.scheduleWindow(Number.POSITIVE_INFINITY, endBeats);
    this.running = false;
  }

  // ---- internals ----

  private scheduleWindow(horizonSec: number, endBeats = Number.POSITIVE_INFINITY) {
    const d = this.deps;
    const doc = d.doc();
    // Song-mode loop: never schedule past the loop end — the engine re-seeks to the start when the
    // playhead gets there, so the region repeats without stray events from after it.
    const loop = this.mode === 'song' ? d.loop?.() : null;
    const loopCap = loop?.on && loop.endBeats > loop.startBeats ? loop.endBeats : endBeats;
    // Hard bound per pass: at 300bpm a 150ms window is ~7 steps; 4096 only trips on scheduleAll.
    for (let guard = 0; guard < 4096 * 64; guard++) {
      const beat = this.nextStep * STEP_BEATS;
      if (beat >= endBeats || beat >= loopCap - 1e-9) break;
      const baseTime = d.toTime(beat);
      if (baseTime >= horizonSec) break;
      if (this.mode === 'pattern') this.schedulePatternStep(doc, beat);
      else this.scheduleSongStep(doc, beat, horizonSec);
      // Arps run in BOTH modes — an armed instrument responds to held keys whether you're
      // auditioning a pattern or playing the whole song. (Song mode's clip loop skips arped
      // tracks so they don't double.)
      this.runArps(doc, beat);
      this.nextStep++;
    }
  }

  private eventTime(beat: number, localStep: number, doc: GrooveDoc, micro?: number): number {
    const d = this.deps;
    let b = beat;
    if (localStep % 2 === 1 && doc.swing > 0) b += doc.swing * 0.5 * STEP_BEATS; // offbeat 16ths
    if (micro) b += micro * STEP_BEATS;
    return d.toTime(b);
  }

  /**
   * Legato gate for sustaining pads: a step holds until the NEXT active step on the same pad
   * (wrapping the pattern), 303/mono-bass style — a lone sub step sustains the whole loop.
   */
  private legatoGateSec(doc: GrooveDoc, pattern: Pattern, padIdx: number, localStep: number): number {
    const row = pattern.steps[padIdx] || {};
    for (let i = 1; i <= pattern.length; i++) {
      if (row[(localStep + i) % pattern.length]) return i * STEP_BEATS * this.deps.secPerBeat();
    }
    return pattern.length * STEP_BEATS * this.deps.secPerBeat();
  }

  private fireRow(doc: GrooveDoc, pattern: Pattern, localStep: number, beat: number) {
    const d = this.deps;
    for (const padKey of Object.keys(pattern.steps)) {
      const padIdx = Number(padKey);
      const step = pattern.steps[padIdx]?.[localStep];
      if (!step) continue;
      if (step.p !== undefined && step.p < 1 && d.rng() > step.p) continue;
      const when = this.eventTime(beat, localStep, doc, step.micro);
      const sustaining = (doc.kit[padIdx]?.env.sustain || 0) > 0.001;
      // Per-step pitch + pan (Glass graph editor) + Step-FX slot ride the trigger.
      d.trigger(padIdx, step.v, when, sustaining ? this.legatoGateSec(doc, pattern, padIdx, localStep) : undefined, step.pitch ?? 0, step.pan, step.fx);
    }
    // Pitch-roll notes: explicit gate from the drawn length, per-note pitch offset.
    if (pattern.melo) {
      for (const padKey of Object.keys(pattern.melo)) {
        const padIdx = Number(padKey);
        const notes = pattern.melo[padIdx]?.[localStep];
        if (!notes?.length) continue;
        const when = this.eventTime(beat, localStep, doc);
        const stepSec = STEP_BEATS * d.secPerBeat();
        for (const n of notes) d.trigger(padIdx, n.v, when, Math.max(1, n.len) * stepSec, n.semi);
      }
    }
  }

  /** Fire every armed instrument arp for this step — runs in pattern AND song mode. */
  private runArps(doc: GrooveDoc, beat: number) {
    const d = this.deps;
    if (!d.runArp) return;
    const anySolo = doc.arrangement.some((t) => t.solo);
    for (const track of doc.arrangement) {
      if (track.kind !== 'instrument' || track.mute || track.padOwned || (anySolo && !track.solo)) continue;
      if (d.arpActive?.(track)) d.runArp(track, this.nextStep, beat);
    }
  }

  private schedulePatternStep(doc: GrooveDoc, beat: number) {
    const pattern = doc.patterns.find((p) => p.id === this.patternId) || doc.patterns[0];
    if (!pattern) return;
    const localStep = ((this.nextStep % pattern.length) + pattern.length) % pattern.length;
    this.fireRow(doc, pattern, localStep, beat);
  }

  private audiblePatternTracks(doc: GrooveDoc): ArrangeTrack[] {
    const anySolo = doc.arrangement.some((t) => t.solo);
    return doc.arrangement.filter((t) => t.kind === 'pattern' && !t.mute && (!anySolo || t.solo));
  }

  private scheduleSongStep(doc: GrooveDoc, beat: number, horizonSec: number) {
    const d = this.deps;
    for (const track of this.audiblePatternTracks(doc)) {
      for (const clip of track.clips) {
        if (!clip.patternId) continue;
        if (beat < clip.startBeats - 1e-9 || beat >= clip.startBeats + clip.lengthBeats - 1e-9) continue;
        const pattern = doc.patterns.find((p) => p.id === clip.patternId);
        if (!pattern) continue;
        const intoClipSteps = Math.round((beat - clip.startBeats) / STEP_BEATS);
        const localStep = ((intoClipSteps % pattern.length) + pattern.length) % pattern.length;
        this.fireRow(doc, pattern, localStep, beat);
      }
    }
    // Instrument tracks: fire every note whose absolute start falls inside this step window, at
    // its EXACT time — the piano roll allows off-grid notes and that timing has to survive.
    const anySoloTrack = doc.arrangement.some((t) => t.solo);
    for (const track of doc.arrangement) {
      if (track.kind !== 'instrument' || track.mute || track.padOwned || (anySoloTrack && !track.solo)) continue;
      // Arps are fired by runArps() (both modes); when a track's arp is active its clip notes
      // are skipped so an arped performance doesn't double against a recording.
      if (d.arpActive?.(track)) continue;
      for (const clip of track.clips) {
        if (!clip.notes?.length) continue;
        if (beat < clip.startBeats - 1e-9 || beat >= clip.startBeats + clip.lengthBeats - 1e-9) continue;
        const intoClip = beat - clip.startBeats;
        for (const note of clip.notes) {
          if (note.startBeats < intoClip - 1e-9 || note.startBeats >= intoClip + STEP_BEATS - 1e-9) continue;
          const when = d.toTime(clip.startBeats + note.startBeats);
          // Clamp the note to the clip end so a long note never outlives its clip.
          const maxLen = clip.lengthBeats - note.startBeats;
          const lenBeats = Math.max(0.05, Math.min(note.lengthBeats, maxLen));
          d.startInstrumentNote(track, note, when, lenBeats * d.secPerBeat());
        }
      }
    }

    // Audio clips whose start lands on this step: schedule once, sample-accurately.
    const anySolo = doc.arrangement.some((t) => t.solo);
    for (const track of doc.arrangement) {
      if (track.kind !== 'audio' || track.mute || (anySolo && !track.solo)) continue;
      for (const clip of track.clips) {
        if (!clip.audio || this.startedAudioClips.has(clip.id)) continue;
        const startTime = d.toTime(clip.startBeats);
        if (clip.startBeats >= beat - 1e-9 && clip.startBeats < beat + STEP_BEATS - 1e-9 && startTime < horizonSec) {
          this.startedAudioClips.add(clip.id);
          d.startAudioClip(track, clip, startTime, 0);
        }
      }
    }
  }

  /** Transport started mid-song: audio clips already sounding start immediately, mid-buffer. */
  private startMidClips(fromBeats: number) {
    const d = this.deps;
    const doc = d.doc();
    const anySolo = doc.arrangement.some((t) => t.solo);
    for (const track of doc.arrangement) {
      if (track.kind !== 'audio' || track.mute || (anySolo && !track.solo)) continue;
      for (const clip of track.clips) {
        if (!clip.audio) continue;
        if (fromBeats > clip.startBeats + 1e-9 && fromBeats < clip.startBeats + clip.lengthBeats) {
          this.startedAudioClips.add(clip.id);
          const intoClipSec = (fromBeats - clip.startBeats) * d.secPerBeat();
          d.startAudioClip(track, clip, d.toTime(fromBeats), intoClipSec);
        }
      }
    }
  }
}
