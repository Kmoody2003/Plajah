// Melos Beats — the lookahead scheduler. The worklet clock posts audio-time ticks (~21ms);
// each tick schedules every event whose time falls inside [cursor, tick + LOOKAHEAD) via
// sample-accurate start(when) calls. Late events (a jammed main thread longer than the
// lookahead) are scheduled immediately — catch up, never skip. All positions are in BEATS;
// `toTime(beats)` is owned by the transport so a live BPM change only moves the anchor, and it
// follows the tempo track — durations are measured with `secBetween`, never beats × a constant.
// Bars (metronome accents, launch quantum) come from the doc's meter map, not a fixed 4/4.

import type { ArrangeTrack, GrooveDoc, NoteEvent, Pattern, Step, TimelineClip } from '../grooveDoc';
import type { StepMods } from './stepMods';
import { songTime } from '../tempoMap';
import { noteOccurrences } from '../clipContent';
import { effectiveLanesFor, sustainedEnd } from '../automation';
import { patternGroup } from '../songSections';

/** Channel solo: while any pad is soloed, the others sit out of the sequence. */
const soloOut = (doc: GrooveDoc, padIdx: number) => !doc.kit[padIdx]?.solo && doc.kit.some((p) => p.solo);
/** A step's graph-lane mods for the voice (undefined when it has none). */
const stepMods = (st: Step): StepMods | undefined =>
  st.cut !== undefined || st.rel !== undefined ? { cut: st.cut, res: st.res, rel: st.rel } : undefined;

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export const LOOKAHEAD_SEC = 0.15;
const STEP_BEATS = 0.25; // 16th notes — the step grid is meter-independent

export type PlayMode = 'pattern' | 'song';

export interface SchedulerDeps {
  doc(): GrooveDoc;
  toTime(beats: number): number;         // absolute AudioContext time for a beat position
  /** Seconds between two beat positions — follows tempo changes and ramps. */
  secBetween(fromBeat: number, toBeat: number): number;
  // rng is injectable so offline renders are deterministic (seeded) while live stays random —
  // the render-twice-byte-identical quality gate depends on this.
  rng(): number;
  trigger(padIdx: number, vel127: number, when: number, gateSec?: number, semiOffset?: number, pan?: number, stepFx?: number, skipChoke?: boolean, mods?: StepMods): void;
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
  /** Metronome switch — live transport only; offline renders never pass these deps. */
  metronome?(): boolean;
  /** Emit one click at an absolute context time; accent = bar start. */
  click?(when: number, accent: boolean): void;
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

/**
 * Whether a pad's step hit needs a gate. A sustaining sample pad does; so does every instrument
 * pad — without a gate an instrument hit is a held key (the live-hit path), released only by the
 * pad's next hit, so a sustaining patch rang on through the rests.
 */
function padHolds(doc: GrooveDoc, padIdx: number): boolean {
  const pad = doc.kit[padIdx];
  return pad?.source === 'instrument' || (pad?.env.sustain || 0) > 0.001;
}

export class StepScheduler {
  private mode: PlayMode = 'pattern';
  // Pattern mode plays a SET of patterns — one per MEKA Group (Maschine "Ideas"); a legacy
  // single-pattern play is a set of one. A queued set takes over at the next bar line.
  private playing: string[] = [];
  private queued: string[] | null = null;
  private nextStep = 0;                       // monotonic global 16th index from transport zero
  private startedAudioClips = new Set<string>();
  private running = false;

  constructor(private deps: SchedulerDeps) {}

  start(mode: PlayMode, fromBeats: number, patternIds?: string | string[]) {
    this.mode = mode;
    this.playing = patternIds === undefined ? [] : Array.isArray(patternIds) ? [...patternIds] : [patternIds];
    this.queued = null;
    this.nextStep = Math.ceil(fromBeats / STEP_BEATS - 1e-9);
    this.startedAudioClips.clear();
    this.running = true;
    if (mode === 'song') this.startMidClips(fromBeats);
  }

  stop() { this.running = false; this.queued = null; }

  /** Clip-launcher gesture: hand the transport to another pattern at the next bar boundary. */
  queuePattern(patternId: string) {
    // Swap the pattern of the SAME Group (other Groups keep playing), at the next bar.
    const doc = this.deps.doc();
    const groupOf = (id: string) => { const p = doc.patterns.find((x) => x.id === id); return p ? patternGroup(p) : -1; };
    const g = groupOf(patternId);
    const base = this.queued ?? this.playing;
    const next = [...base.filter((id) => groupOf(id) !== g), patternId];
    if (!this.queued && sameSet(next, this.playing)) return;
    this.queued = next;
  }
  /** Clip-launcher scene: replace the whole set at the next bar. */
  queueSet(patternIds: string[]) {
    this.queued = sameSet(patternIds, this.playing) ? null : [...patternIds];
  }
  currentPatternId(): string | null { return this.playing[0] ?? null; }
  currentPatternIds(): string[] { return this.playing; }
  /** Patterns waiting for the bar line (those not already playing). */
  queuedIds(): string[] { return this.queued ? this.queued.filter((id) => !this.playing.includes(id)) : []; }
  queuedId(): string | null { return this.queuedIds()[0] ?? null; }

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
      // Metronome: a click every beat, accented on the bar. Live transport only — offline
      // renders build their own deps without these, so a bounce never prints the click.
      if (d.metronome?.() && d.click) {
        const bar = songTime(doc).meter.at(beat);
        const units = bar.beatInBar / bar.unitBeats;
        if (Math.abs(units - Math.round(units)) < 1e-6) d.click(baseTime, Math.abs(bar.beatInBar) < 1e-6);
      }
      if (this.mode === 'pattern') this.schedulePatternStep(doc, beat);
      else this.scheduleSongStep(doc, beat, horizonSec);
      // Arps run in BOTH modes — an armed instrument responds to held keys whether you're
      // auditioning a pattern or playing the whole song. (Song mode's clip loop skips arped
      // tracks so they don't double.)
      this.runArps(doc, beat);
      this.nextStep++;
    }
  }

  private eventTime(beat: number, localStep: number, doc: GrooveDoc, micro?: number, padIdx?: number): number {
    const d = this.deps;
    let b = beat;
    // Offbeat 16ths swing by the channel's own shuffle when it has one, else the song's.
    const swing = (padIdx !== undefined ? doc.kit[padIdx]?.swing : undefined) ?? doc.swing;
    if (localStep % 2 === 1 && swing > 0) b += swing * 0.5 * STEP_BEATS;
    if (micro) b += micro * STEP_BEATS;
    return d.toTime(b);
  }

  /**
   * Legato gate for sustaining pads: a step holds until the NEXT active step on the same pad
   * (wrapping the pattern), 303/mono-bass style — a lone sub step sustains the whole loop.
   */
  private legatoGateSec(doc: GrooveDoc, pattern: Pattern, padIdx: number, localStep: number, beat: number, lenOverride?: number): number {
    const row = pattern.steps[padIdx] || {};
    const len = Math.max(1, Math.min(pattern.length, Math.round(lenOverride ?? pattern.length)));
    for (let i = 1; i <= len; i++) {
      if (row[(localStep + i) % len]) return this.deps.secBetween(beat, beat + i * STEP_BEATS);
    }
    return this.deps.secBetween(beat, beat + len * STEP_BEATS);
  }

  /**
   * Fire one 16th of a PATTERN CLIP in song mode. Unlike fireRow (pattern mode), each pad can
   * carry its own loop length inside the clip (`clip.padLens`) — Bitwig-style independent clip
   * lengths per track, with MEKA's pattern length as the default.
   */
  private fireRowClip(doc: GrooveDoc, pattern: Pattern, clip: TimelineClip, intoClipSteps: number, beat: number) {
    const d = this.deps;
    const padLen = (padIdx: number) =>
      Math.max(1, Math.min(pattern.length, Math.round(clip.padLens?.[padIdx] ?? pattern.length)));
    for (const padKey of Object.keys(pattern.steps)) {
      const padIdx = Number(padKey);
      const len = padLen(padIdx);
      const localStep = ((intoClipSteps % len) + len) % len;
      const step = pattern.steps[padIdx]?.[localStep];
      if (!step) continue;
      if (step.p !== undefined && step.p < 1 && d.rng() > step.p) continue;
      if (soloOut(doc, padIdx)) continue;
      const when = this.eventTime(beat, localStep, doc, step.micro, padIdx);
      const sustaining = padHolds(doc, padIdx);
      d.trigger(padIdx, step.v, when, sustaining ? this.legatoGateSec(doc, pattern, padIdx, localStep, beat, len) : undefined, (step.pitch ?? 0) + (step.fine ?? 0) / 100, step.pan, step.fx, false, stepMods(step));
    }
    if (pattern.melo) {
      for (const padKey of Object.keys(pattern.melo)) {
        const padIdx = Number(padKey);
        const len = padLen(padIdx);
        const localStep = ((intoClipSteps % len) + len) % len;
        const notes = pattern.melo[padIdx]?.[localStep];
        if (!notes?.length) continue;
        if (soloOut(doc, padIdx)) continue;
        const when = this.eventTime(beat, localStep, doc, undefined, padIdx);
        for (const n of notes) d.trigger(padIdx, n.v, when, d.secBetween(beat, beat + Math.max(1, n.len) * STEP_BEATS), n.semi, undefined, undefined, true);
      }
    }
  }

  private fireRow(doc: GrooveDoc, pattern: Pattern, localStep: number, beat: number) {
    const d = this.deps;
    for (const padKey of Object.keys(pattern.steps)) {
      const padIdx = Number(padKey);
      const step = pattern.steps[padIdx]?.[localStep];
      if (!step) continue;
      if (step.p !== undefined && step.p < 1 && d.rng() > step.p) continue;
      if (soloOut(doc, padIdx)) continue;
      const when = this.eventTime(beat, localStep, doc, step.micro, padIdx);
      const sustaining = padHolds(doc, padIdx);
      // Per-step pitch + pan (Glass graph editor) + Step-FX slot ride the trigger.
      d.trigger(padIdx, step.v, when, sustaining ? this.legatoGateSec(doc, pattern, padIdx, localStep, beat) : undefined, (step.pitch ?? 0) + (step.fine ?? 0) / 100, step.pan, step.fx, false, stepMods(step));
    }
    // Pitch-roll notes: explicit gate from the drawn length, per-note pitch offset.
    if (pattern.melo) {
      for (const padKey of Object.keys(pattern.melo)) {
        const padIdx = Number(padKey);
        const notes = pattern.melo[padIdx]?.[localStep];
        if (!notes?.length) continue;
        if (soloOut(doc, padIdx)) continue;
        const when = this.eventTime(beat, localStep, doc, undefined, padIdx);
        // Pitched notes are polyphonic — skip the choke group so a chord/overlap doesn't self-cut.
        for (const n of notes) d.trigger(padIdx, n.v, when, d.secBetween(beat, beat + Math.max(1, n.len) * STEP_BEATS), n.semi, undefined, undefined, true);
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
    // A queued launcher pattern takes over on the bar line — the Bitwig launch quantum.
    if (this.queued && songTime(doc).meter.isBarLine(beat)) {
      this.playing = this.queued;
      this.queued = null;
    }
    const set = this.playing.map((id) => doc.patterns.find((p) => p.id === id)).filter((p): p is Pattern => !!p);
    if (!set.length && doc.patterns[0]) set.push(doc.patterns[0]);
    for (const pattern of set) {
      const localStep = ((this.nextStep % pattern.length) + pattern.length) % pattern.length;
      this.fireRow(doc, pattern, localStep, beat);
    }
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
        // A slipped pattern clip starts that many 16ths into its pattern.
        const intoClipSteps = Math.round((beat - clip.startBeats + (clip.contentOffsetBeats ?? 0)) / STEP_BEATS);
        this.fireRowClip(doc, pattern, clip, intoClipSteps, beat);
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
      const sustain = effectiveLanesFor(doc, track).get('sustain');
      for (const clip of track.clips) {
        if (!clip.notes?.length) continue;
        if (beat < clip.startBeats - 1e-9 || beat >= clip.startBeats + clip.lengthBeats - 1e-9) continue;
        // Through the clip's window (slip offset + loop): notes starting in this 16th, clipped to
        // their pass and the clip end; the sustain pedal (CC64 lane) holds note-offs.
        for (const occ of noteOccurrences(clip, beat, beat + STEP_BEATS)) {
          const at = occ.songBeat;
          const end = sustainedEnd(sustain, at + Math.max(0.05, occ.lengthBeats), clip.startBeats + clip.lengthBeats);
          d.startInstrumentNote(track, occ.note, d.toTime(at), d.secBetween(at, end));
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
          const intoClipSec = d.secBetween(clip.startBeats, fromBeats);
          d.startAudioClip(track, clip, d.toTime(fromBeats), intoClipSec);
        }
      }
    }
  }
}
