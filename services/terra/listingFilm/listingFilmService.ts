/**
 * Listing Film — the auto-cut brain.
 *
 * Feed it the narration from a walkthrough and it returns a room-segmented film
 * plan: an ordered storyboard where each cut is a room the agent named, titled
 * with the room + the listing's own facts. Detection lives in roomDetection.ts;
 * this layer turns detected rooms into a titled, styled, music-bedded plan.
 *
 * ── The render boundary (honest) ─────────────────────────────────────────────
 * Terra plans the cut; it does not encode the video. The frame-accurate encoder
 * (`renderTimeline` / WebCodecs) belongs to Fabula, the platform NLE. So this
 * produces a plan + an EDL, and the UI hands off to Fabula to render — rather
 * than duplicating (and half-wiring) the encode here.
 *
 * Transcription reuses the platform captions endpoint (`/api/ai/captions`), which
 * takes an audio URL and returns timestamped lines. Extracting a walkthrough's
 * audio to a URL is the one piece still to wire; until then the UI can run the
 * detector on a supplied/demo transcript.
 */

import { detectRoomScenes, scenesDuration, type TranscriptLine, type DetectedScene } from './roomDetection';

export type FilmStyle = 'warm' | 'bright' | 'architectural';

export interface FilmStyleDef {
  key: FilmStyle;
  label: string;
  pacing: string;
  /** Seconds per room scene the pacing implies (used to estimate runtime). */
  secPerScene: number;
  musicBed: string;
  accent: string;
}

export const FILM_STYLES: FilmStyleDef[] = [
  { key: 'warm',          label: 'Warm · slow',      pacing: 'Lingering, golden',      secPerScene: 6, musicBed: 'Warm acoustic bed', accent: '#FF8C00' },
  { key: 'bright',        label: 'Bright · brisk',   pacing: 'Upbeat, quick cuts',     secPerScene: 4, musicBed: 'Bright pop bed',      accent: '#4FC3D6' },
  { key: 'architectural', label: 'Architectural',    pacing: 'Composed, deliberate',   secPerScene: 7, musicBed: 'Ambient / minimal',   accent: '#8E7BE8' },
];

export interface ListingFacts {
  address?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  agent?: string;
}

export type FilmSceneKind = 'title' | 'room' | 'cta';

export interface FilmScene {
  id: string;
  kind: FilmSceneKind;
  /** Lower-third / card title. */
  title: string;
  subtitle?: string;
  /** Source in-point in the walkthrough (room scenes only). */
  sourceStart?: number;
  sourceEnd?: number;
  /** The narration that justified this cut — shown for trust. */
  quote?: string;
  room?: string;
  confidence?: 'high' | 'med';
}

export interface FilmPlan {
  scenes: FilmScene[];
  style: FilmStyle;
  facts: ListingFacts;
  musicBed: string;
  /** Rough runtime in seconds. */
  estRuntimeSec: number;
  /** How the room scenes were sourced. */
  source: 'narration' | 'manual';
}

const money = (n?: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    : '';

/** A representative walkthrough narration so the tool is explorable with no video. */
export const DEMO_TRANSCRIPT: TranscriptLine[] = [
  { time: 0.0,  text: 'Welcome to 4218 Rosedale — let me show you around.' },
  { time: 4.5,  text: 'Coming through the front door into the foyer with the original hardwood.' },
  { time: 9.0,  text: "Here's the open living room — tons of natural light all afternoon." },
  { time: 15.2, text: "Right off of it, the chef's kitchen with a huge island and quartz counters." },
  { time: 22.0, text: 'The formal dining room seats eight easily.' },
  { time: 28.4, text: 'Down the hall is the primary bedroom, really generous.' },
  { time: 33.0, text: 'And it has a gorgeous en-suite bathroom, fully renovated.' },
  { time: 39.1, text: "There's a second bedroom right here, perfect for guests or an office." },
  { time: 45.0, text: 'And out back, a beautiful backyard with a covered deck.' },
];

/**
 * Build the film plan from a narration transcript + the listing's facts.
 * Opens with an address title card, cuts each detected room with its label and
 * the triggering quote, and closes with a price + call-to-action card.
 */
export function buildFilmPlan(
  transcript: TranscriptLine[],
  facts: ListingFacts,
  style: FilmStyle,
  clipDuration?: number,
): FilmPlan {
  const styleDef = FILM_STYLES.find(s => s.key === style) || FILM_STYLES[0];
  const rooms = detectRoomScenes(transcript, clipDuration);

  const scenes: FilmScene[] = [];

  // Opening title card — bound to the address.
  scenes.push({
    id: 'card-open',
    kind: 'title',
    title: facts.address || 'A Home Worth Seeing',
    subtitle: [facts.beds && `${facts.beds} bd`, facts.baths && `${facts.baths} ba`, facts.sqft && `${facts.sqft.toLocaleString()} sqft`]
      .filter(Boolean).join(' · ') || undefined,
  });

  // A room scene per detection (skip the synthetic intro — the title card covers it).
  for (const r of rooms) {
    if (r.room === 'intro') continue;
    scenes.push({
      id: r.id,
      kind: 'room',
      title: r.label,
      subtitle: undefined,
      sourceStart: r.startTime,
      sourceEnd: r.endTime,
      quote: r.quote,
      room: r.room,
      confidence: r.confidence,
    });
  }

  // Closing call-to-action — bound to the price.
  scenes.push({
    id: 'card-cta',
    kind: 'cta',
    title: money(facts.price) || 'Book a showing',
    subtitle: facts.price ? 'Book a showing' : facts.agent,
  });

  const roomCount = scenes.filter(s => s.kind === 'room').length;
  const estRuntimeSec = Math.round(roomCount * styleDef.secPerScene + 6); // + title & cta cards

  return {
    scenes,
    style,
    facts,
    musicBed: styleDef.musicBed,
    estRuntimeSec,
    source: transcript === DEMO_TRANSCRIPT ? 'manual' : 'narration',
  };
}

export interface CaptionResult { captions: { time: number; text: string }[] }

/**
 * Transcribe walkthrough narration via the platform captions endpoint.
 * `audioUrl` must be a public URL to the audio track. Returns [] on failure so
 * the caller can fall back to a supplied transcript rather than throw.
 */
export async function transcribeNarration(audioUrl: string, title?: string): Promise<TranscriptLine[]> {
  try {
    const res = await fetch('/api/ai/captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl, title: title || 'Listing walkthrough', kind: 'narration' }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as CaptionResult;
    return (data.captions || []).map(c => ({ time: c.time, text: c.text })).filter(l => l.text?.trim());
  } catch {
    return [];
  }
}

/** A compact EDL for hand-off / export. */
export interface FilmEDL {
  title: string;
  style: string;
  musicBed: string;
  estRuntimeSec: number;
  cuts: { order: number; kind: FilmSceneKind; title: string; subtitle?: string; sourceStart?: number; sourceEnd?: number }[];
}

export function toEDL(plan: FilmPlan): FilmEDL {
  return {
    title: plan.facts.address || 'Listing Film',
    style: FILM_STYLES.find(s => s.key === plan.style)?.label || plan.style,
    musicBed: plan.musicBed,
    estRuntimeSec: plan.estRuntimeSec,
    cuts: plan.scenes.map((s, i) => ({
      order: i + 1, kind: s.kind, title: s.title, subtitle: s.subtitle,
      sourceStart: s.sourceStart, sourceEnd: s.sourceEnd,
    })),
  };
}

export { scenesDuration };
export type { TranscriptLine, DetectedScene };
