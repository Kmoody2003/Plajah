// On-air segments: what a host says between songs and around commercial breaks.
//
// Two layers:
//   1. Templates here produce a grounded, always-safe line from facts alone (song title, artist, a
//      Music Intelligence host card, a real play count). This works with no model at all.
//   2. The live mind (prompt.ts) may write a better line; it goes through policy.checkLine and falls
//      back to the template line if it fails. Either way, every line fits the time it has.
//
// Break hosting rides on services/fast/breakPlan: the planner already leaves "fm" segments (Plajah
// FM time) and an "upnext" card in every break. The host voices those — into the break, out of it,
// and what's coming up — so the break sounds like a station, not a gap.

import type { BreakSeg } from '../fast/breakPlan';
import type { PersonaSheet } from './types';
import { checkLine, secondsToSay, WPS } from './policy';

export type LinkKind =
  | 'between'       // back-announce the song that ended, front-announce the next
  | 'talk-up'       // over the next song's instrumental intro, out before the vocal
  | 'into-break'    // tease what's after, take the station to a break
  | 'out-of-break'  // welcome back, straight into a song
  | 'top-of-hour'   // station ID + show name + time
  | 'caller-intro'  // put a caller on
  | 'caller-outro'  // thank the caller, into their song
  | 'fill-in';      // a TV channel's break filled with Plajah FM: the channel is back shortly, here's the song

/** What the host knows about a song. Only these facts may be spoken. */
export interface SongFacts {
  id: string;
  title: string;
  artist: string;
  /** True when the artist is an independent creator on Plajah (Kit's "fix the plays" bit). */
  plajahCreator?: boolean;
  plays?: number;
  year?: number;
  /** Seconds of instrumental intro before the vocal (from the song map), for talk-ups. */
  introSec?: number;
  /** One Music Intelligence host card, already written for radio. */
  hostCard?: string;
  /** Requested or dedicated by a listener (first name only, opted in). */
  requestedBy?: string;
  dedicatedTo?: string;
  isPersonaArtist?: boolean;
}

export interface LinkContext {
  kind: LinkKind;
  host: PersonaSheet;
  prev?: SongFacts | null;
  next?: SongFacts | null;
  /** Spoken time, already in words ("six-oh-two"). */
  timeSpoken?: string;
  /** Seconds the line may take. Talk-ups default to the next song's intro. */
  maxSec?: number;
  callerFirstName?: string;
  /** The TV channel whose break Plajah FM is filling (fill-in links). */
  channelName?: string;
  /** A deterministic seed so the same moment always picks the same variant. */
  seed?: string;
}

export interface LinkLine {
  text: string;
  estSec: number;
  /** The facts this line used — kept so a later check can confirm nothing was invented. */
  facts: string[];
  source: 'template' | 'mind';
}

function pick<T>(arr: T[], seed: string): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return arr[h % arr.length];
}

export function wpsFor(host: PersonaSheet): number {
  return WPS[host.voice.pace];
}

function factsOf(...songs: (SongFacts | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const s of songs) {
    if (!s) continue;
    out.push(s.title, s.artist);
    if (s.plays != null) out.push(String(s.plays));
    if (s.year != null) out.push(String(s.year));
    if (s.hostCard) out.push(s.hostCard);
    if (s.requestedBy) out.push(s.requestedBy);
    if (s.dedicatedTo) out.push(s.dedicatedTo);
  }
  return out;
}

const songRef = (s: SongFacts) => `"${s.title}" from ${s.artist}`;

/** Candidate lines from most to least detailed; the planner takes the first that fits. */
function templateCandidates(c: LinkContext): string[] {
  const { host, prev, next } = c;
  const show = host.show?.name ?? 'Plajah FM';
  const catch1 = host.personality.catchphrases[0] ?? '';
  const seed = c.seed ?? `${c.kind}:${prev?.id ?? ''}:${next?.id ?? ''}`;
  const out: string[] = [];

  switch (c.kind) {
    case 'between': {
      const back = prev ? `That was ${songRef(prev)}.` : '';
      const plays = prev?.plajahCreator && prev.plays != null && prev.plays < 1000
        ? ` ${prev.plays} plays so far — let's change that.` : '';
      const req = next?.requestedBy ? ` ${next.requestedBy} asked for this one.` : '';
      const ded = next?.dedicatedTo ? ` Going out to ${next.dedicatedTo}.` : '';
      const fwd = next ? ` Up next, ${songRef(next)}.` : '';
      const card = next?.hostCard ? ` ${next.hostCard}` : '';
      out.push(`${back}${plays}${fwd}${req}${ded}${card}`.trim());
      out.push(`${back}${fwd}${req}${ded}`.trim());
      out.push((next ? `Here's ${songRef(next)}.` : back) || `${show}. ${catch1}`.trim());
      out.push(next ? `${next.title}.` : 'Plajah FM.');
      break;
    }
    case 'talk-up': {
      if (!next) return ['Plajah FM.'];
      out.push(`${pick([`Here's ${songRef(next)}`, `This is ${songRef(next)}`, `${songRef(next)}, right here`], seed)}${next.hostCard ? ` — ${next.hostCard}` : ''}.`);
      out.push(`This is ${songRef(next)}.`);
      out.push(`${next.title}.`);
      break;
    }
    case 'into-break': {
      const tease = next ? ` After the break, ${songRef(next)}.` : '';
      out.push(`You're on ${show} on Plajah FM.${tease} Stay right here.`);
      out.push(`${show}. Back in a minute.${next ? ` ${next.title} is next.` : ''}`);
      out.push('Back in a minute.');
      break;
    }
    case 'out-of-break': {
      out.push(`And we're back — ${show} on Plajah FM.${next ? ` Here's ${songRef(next)}.` : ''} ${catch1}`.trim());
      out.push(`Back on ${show}.${next ? ` ${next.title}.` : ''}`);
      out.push('Plajah FM.');
      break;
    }
    case 'top-of-hour': {
      const t = c.timeSpoken ? ` It's ${c.timeSpoken}.` : '';
      out.push(`Plajah FM.${t} This is ${show} with ${host.stageName}. ${catch1}`.trim());
      out.push(`Plajah FM.${t} ${show}.`);
      out.push('Plajah FM.');
      break;
    }
    case 'fill-in': {
      // The song under the host is playing NOW (it is not "after the break").
      const ch = c.channelName ? `${c.channelName} is back shortly. ` : '';
      const now = next ? ` This is ${songRef(next)}.` : '';
      out.push(`${ch}Meanwhile you're on ${show}, Plajah FM.${now}${next?.hostCard ? ` ${next.hostCard}` : ''}`.trim());
      out.push(`${ch}You're on Plajah FM.${now}`.trim());
      out.push(`${ch}This is Plajah FM.`.trim());
      out.push('Plajah FM.');
      break;
    }
    case 'caller-intro': {
      const who = c.callerFirstName || 'caller';
      out.push(`We've got ${who} on the line. ${who}, you're on ${show}.`);
      out.push(`${who}, you're on the air.`);
      break;
    }
    case 'caller-outro': {
      const who = c.callerFirstName || 'caller';
      out.push(`Thank you, ${who}.${next ? ` This is for you — ${songRef(next)}.` : ''}`);
      out.push(`Thanks, ${who}.`);
      break;
    }
  }
  return out.filter(Boolean);
}

/** The seconds a link may take when the caller did not say. */
export function defaultMaxSec(c: LinkContext): number {
  if (c.maxSec) return c.maxSec;
  if (c.kind === 'talk-up') return Math.max(2, (c.next?.introSec ?? 8) - 1); // out before the vocal
  if (c.kind === 'top-of-hour') return 8;
  // Talkier hosts get longer links; a DJ barely talks.
  const base = c.host.show?.format === 'dj' ? 6 : 10;
  return base + Math.round(c.host.personality.talkiness * 10);
}

/**
 * Plans one link. `mindLine` is an optional model-written line; it is used only if it passes every
 * check with this link's facts and fits the time. Otherwise the longest template line that fits wins.
 */
export function planLink(c: LinkContext, mindLine?: string | null): LinkLine {
  const wps = wpsFor(c.host);
  const maxSec = defaultMaxSec(c);
  const facts = factsOf(c.prev, c.next, c.callerFirstName ? { id: 'caller', title: '', artist: '', requestedBy: c.callerFirstName } : null);
  if (c.channelName) facts.push(c.channelName); // a channel called "Horror Classics 8.2" is a given fact

  if (mindLine && mindLine.trim()) {
    const issues = checkLine(mindLine, { facts, maxSec, wordsPerSec: wps });
    if (!issues.length) return { text: mindLine.trim(), estSec: secondsToSay(mindLine, wps), facts, source: 'mind' };
  }
  const cands = templateCandidates(c);
  for (const t of cands) {
    if (!checkLine(t, { facts, maxSec, wordsPerSec: wps }).length) return { text: t, estSec: secondsToSay(t, wps), facts, source: 'template' };
  }
  const last = cands[cands.length - 1] ?? 'Plajah FM.';
  return { text: last, estSec: secondsToSay(last, wps), facts, source: 'template' };
}

/** A host voice-over placed on one break segment. */
export interface BreakVoice {
  segId: string;
  atSec: number;
  line: LinkLine;
  /** Music under the host: the FM bed ducks while they talk. */
  duckBed: boolean;
}

/**
 * Voices a planned FAST/radio break. The host takes the station into the break on the first FM
 * segment, voices the up-next card, and welcomes listeners back on the last FM segment. Spots and
 * idents are never talked over.
 */
export function hostBreak(plan: BreakSeg[], host: PersonaSheet, next?: SongFacts | null): BreakVoice[] {
  const out: BreakVoice[] = [];
  const talkable = plan.filter((s) => s.kind === 'fm' || s.kind === 'upnext');
  if (!talkable.length) return out;

  const first = talkable[0];
  const into = planLink({ kind: 'into-break', host, next, maxSec: Math.max(2, first.durSec - 0.8), seed: `into:${first.id}` });
  out.push({ segId: first.id, atSec: first.startSec + 0.3, line: into, duckBed: true });

  const card = talkable.find((s) => s.kind === 'upnext' && s.id !== first.id);
  if (card && next) {
    const l = planLink({ kind: 'talk-up', host, next, maxSec: Math.max(2, card.durSec - 0.5), seed: `card:${card.id}` });
    out.push({ segId: card.id, atSec: card.startSec + 0.2, line: l, duckBed: true });
  }

  const last = talkable[talkable.length - 1];
  if (last.id !== first.id && last.id !== card?.id) {
    const back = planLink({ kind: 'out-of-break', host, next, maxSec: Math.max(2, last.durSec - 0.5), seed: `out:${last.id}` });
    // Land the welcome-back at the end of the segment so it hands straight into the next song.
    out.push({ segId: last.id, atSec: Math.max(last.startSec, last.startSec + last.durSec - back.estSec - 0.2), line: back, duckBed: true });
  }
  return out;
}

/**
 * Voices a TV/FAST channel's break that Plajah FM is filling. Unlike a radio break, the song under the
 * host is playing now and the channel's own programme comes back after, so the host says one fill-in
 * line on the first FM stretch and stays out of the way of the up-next card and the spots.
 */
export function hostFillIn(plan: BreakSeg[], host: PersonaSheet, nowPlaying: SongFacts | null, channelName?: string): BreakVoice[] {
  const first = plan.find((s) => s.kind === 'fm');
  if (!first || first.durSec < 2.5) return [];
  const line = planLink({ kind: 'fill-in', host, next: nowPlaying, channelName, maxSec: Math.max(2, first.durSec - 0.8), seed: `fill:${first.id}` });
  return [{ segId: first.id, atSec: first.startSec + 0.4, line, duckBed: true }];
}

/** Whether a host should say anything at all between these two songs (DJs and quiet hosts skip some). */
export function shouldTalk(host: PersonaSheet, songsSinceLastTalk: number, next?: SongFacts | null): boolean {
  if (next?.requestedBy || next?.dedicatedTo) return true;
  const every = host.show?.format === 'dj' ? 4 : Math.max(1, Math.round(3 - host.personality.talkiness * 2));
  return songsSinceLastTalk >= every;
}
