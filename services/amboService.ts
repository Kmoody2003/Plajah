// amboService — the presenter's model: a run of show, scripture slides, and
// the cue that fires them.
//
// The text-safety rules live here rather than in the renderer, because the
// operator must never be the one deciding whether Psalm 119 fits on a screen.
// A verse is split at clause boundaries, never mid-phrase, and never exceeds a
// line budget the renderer can set at a readable size.

import { formatRef, refId, type ScriptureRef } from './scriptureRef';
import { fetchRefText, DEFAULT_TRANSLATION } from './scriptureText';

export type SlideVariant = 'LOWER_THIRD' | 'FULLSCREEN';
export type SplitMode = 'verse' | 'clause' | 'all';

export interface ScriptureSlide {
  id: string;
  ref: ScriptureRef;
  /** "Romans 8:28" — rendered under the text. */
  refLabel: string;
  /** Already broken into display lines. */
  lines: string[];
  text: string;
  translation: string;
  /** Required on screen for most licensed translations. */
  copyright?: string;
  variant: SlideVariant;
}

export interface ServiceItem {
  id: string;
  kind: 'COUNTDOWN' | 'SONG' | 'SCRIPTURE' | 'MESSAGE' | 'ANNOUNCEMENT' | 'RESPONSE' | 'BLANK';
  title: string;
  /** Scripture cues belonging to this item, in the order they'll be taken. */
  cues: ScriptureSlide[];
  done?: boolean;
}

export interface AmboCue {
  slide: ScriptureSlide;
  /** Wall clock for phones in the room — they fire on this, immediately. */
  wallClock: number;
  /** Program timecode for stream viewers — they fire against their playhead. */
  programTC: number;
  /** Where this cue is allowed to land. */
  destinations: CueDestinations;
}

export interface CueDestinations {
  screens: boolean;
  switcher: boolean;
  inRoom: boolean;
  stream: boolean;
  kids: boolean;
}

export const DEFAULT_DESTINATIONS: CueDestinations = {
  screens: true, switcher: true, inRoom: true, stream: true, kids: false,
};

// ── Text safety ──────────────────────────────────────────────────────────────

/** Roughly what fits on a 1920-wide screen at a readable size, per variant. */
const BUDGET: Record<SlideVariant, { perLine: number; maxLines: number }> = {
  LOWER_THIRD: { perLine: 62, maxLines: 3 },
  FULLSCREEN: { perLine: 42, maxLines: 6 },
};

/** Break points a reader's eye already expects, strongest first. */
const CLAUSE_RE = /([;:—]|,\s(?=and\b|but\b|for\b|that\b|who\b|which\b)|\.\s)/;

/** Greedy wrap to a character budget, breaking on spaces only. */
export function wrapLines(text: string, perLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if (line.length + 1 + w.length <= perLine) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Split a long passage into screenfuls at clause boundaries. Falls back to a
 * word-boundary split only when a single clause is itself over budget, so text
 * never breaks mid-phrase if there was any better option.
 */
export function splitForScreen(text: string, variant: SlideVariant): string[][] {
  const { perLine, maxLines } = BUDGET[variant];
  const capacity = perLine * maxLines;

  if (text.length <= capacity) return [wrapLines(text, perLine)];

  // Build chunks by accumulating clauses until the next one would overflow.
  const parts = text.split(CLAUSE_RE).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    const next = current ? current + part : part.trimStart();
    if (next.length > capacity && current) { chunks.push(current.trim()); current = part.trimStart(); }
    else current = next;
  }
  if (current.trim()) chunks.push(current.trim());

  // Any chunk still over budget gets a plain wrap-and-page.
  const out: string[][] = [];
  for (const chunk of chunks) {
    const lines = wrapLines(chunk, perLine);
    for (let i = 0; i < lines.length; i += maxLines) out.push(lines.slice(i, i + maxLines));
  }
  return out.length ? out : [wrapLines(text, perLine)];
}

// ── Building slides ──────────────────────────────────────────────────────────

let seq = 0;
const nextId = () => `sl${++seq}`;

/**
 * Resolve a reference into the slides that will actually go on screen.
 * `verse` gives one slide per verse, `clause` fits as much as will safely read,
 * `all` keeps the passage whole and pages it.
 */
export async function buildSlides(
  ref: ScriptureRef,
  opts: { variant?: SlideVariant; mode?: SplitMode; slug?: string } = {},
): Promise<ScriptureSlide[]> {
  const variant = opts.variant ?? 'LOWER_THIRD';
  const mode = opts.mode ?? 'verse';
  const slug = opts.slug ?? DEFAULT_TRANSLATION;

  const resolved = await fetchRefText(ref, slug, 200);
  if (!resolved || !resolved.verses.length) return [];

  const make = (r: ScriptureRef, lines: string[], text: string): ScriptureSlide => ({
    id: nextId(),
    ref: r,
    refLabel: formatRef(r, 'display'),
    lines,
    text,
    translation: resolved.translation,
    copyright: COPYRIGHT_LINES[slug],
    variant,
  });

  if (mode === 'verse') {
    return resolved.verses.flatMap(v => {
      const one: ScriptureRef = { book: ref.book, bookName: ref.bookName, chapter: ref.chapter, verse: v.verse };
      return splitForScreen(v.text, variant).map(lines => make(one, lines, v.text));
    });
  }

  // clause / all — the passage read as one body of text.
  const pages = splitForScreen(resolved.text, variant);
  return pages.map(lines => make(ref, lines, resolved.text));
}

/**
 * Translations whose licence requires an on-screen attribution. Public-domain
 * texts have none — but the field exists so a licensed translation can never
 * be added without the line coming with it.
 */
export const COPYRIGHT_LINES: Record<string, string | undefined> = {
  kjv: undefined,
  vulgate: undefined,
  textusreceptus: undefined,
  lxx: undefined,
  codex: undefined,
};

// ── The cue ──────────────────────────────────────────────────────────────────

/** Fired whenever a slide is taken to air. Kairos and the switcher both listen. */
export const AMBO_CUE_EVENT = 'AMBO_CUE';
export const AMBO_CLEAR_EVENT = 'AMBO_CLEAR';

export function fireCue(
  slide: ScriptureSlide,
  programTC: number,
  destinations: CueDestinations = DEFAULT_DESTINATIONS,
): AmboCue {
  const cue: AmboCue = { slide, wallClock: Date.now(), programTC, destinations };
  window.dispatchEvent(new CustomEvent(AMBO_CUE_EVENT, { detail: cue }));
  return cue;
}

export function fireClear(): void {
  window.dispatchEvent(new CustomEvent(AMBO_CLEAR_EVENT));
}

/** A logged cue, kept for the Vespers recap and the VOD marker track. */
export interface CueLogEntry {
  refIdStr: string;
  label: string;
  programTC: number;
  wallClock: number;
}

export function toLogEntry(cue: AmboCue): CueLogEntry {
  return {
    refIdStr: refId(cue.slide.ref),
    label: cue.slide.refLabel,
    programTC: cue.programTC,
    wallClock: cue.wallClock,
  };
}

export const formatTC = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
