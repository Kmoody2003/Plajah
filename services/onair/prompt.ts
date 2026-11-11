// The live mind's brief for a persona. Pure: builds the system + user text for whatever model lane
// is configured (Gemini first, per the AI lanes decision). The answer is never trusted directly —
// segments.planLink / checkLine decide whether it airs.

import type { PersonaSheet } from './types';
import type { LinkKind, SongFacts } from './segments';
import type { ChatMention } from './callers';
import { STATION_RULES, WPS } from './policy';

export interface PromptContext {
  kind: LinkKind | 'chat-reply' | 'post';
  prev?: SongFacts | null;
  next?: SongFacts | null;
  chat?: ChatMention[];
  callerFirstName?: string;
  /** What the caller or chatter said (scrubbed), when replying. */
  heard?: string;
  timeSpoken?: string;
  maxSec?: number;
}

function personaBlock(p: PersonaSheet): string {
  const lines = [
    `You are ${p.stageName}${p.fullName ? ` (${p.fullName})` : ''}, ${p.pronouns}, ${p.age} — a VIRTUAL ${p.kind === 'host' ? 'radio host' : 'recording artist'} on Plajah.`,
    `Tagline: ${p.backstory.tagline}`,
    `Backstory (fiction — you may draw on it, never present it as real-world fact): ${p.backstory.story.join(' ')}`,
    `On-air style: ${p.personality.onAirStyle}`,
    `Core traits: ${p.personality.core.join(', ')}. Quirks: ${p.personality.quirks.join('; ')}.`,
    `Catchphrases (use rarely, at most one per line): ${p.personality.catchphrases.join(' | ')}`,
    `You never: ${p.personality.neverSays.join('; ')}.`,
  ];
  if (p.show) lines.push(`Your show: ${p.show.name} (${p.show.genres.join(', ')}). Format: ${p.show.format === 'dj' ? 'DJ — talk very little' : 'host'}.`);
  if (p.artist) lines.push(`Your music: ${p.artist.soundBrief} Made in Chora with ${p.artist.choraTools.join(', ')}.`);
  return lines.join('\n');
}

function factsBlock(c: PromptContext): string {
  const f: string[] = [];
  const song = (label: string, s?: SongFacts | null) => {
    if (!s) return;
    f.push(`${label}: "${s.title}" by ${s.artist}${s.year ? ` (${s.year})` : ''}${s.plays != null ? `, ${s.plays} plays on Plajah` : ''}${s.plajahCreator ? ', independent Plajah creator' : ''}${s.isPersonaArtist ? ', a Plajah virtual artist' : ''}`);
    if (s.hostCard) f.push(`${label} note (from Music Intelligence): ${s.hostCard}`);
    if (s.requestedBy) f.push(`${label} requested by: ${s.requestedBy}`);
    if (s.dedicatedTo) f.push(`${label} dedicated to: ${s.dedicatedTo}`);
  };
  song('JUST PLAYED', c.prev);
  song('PLAYING NEXT', c.next);
  if (c.timeSpoken) f.push(`TIME: ${c.timeSpoken}`);
  if (c.callerFirstName) f.push(`CALLER: ${c.callerFirstName}`);
  for (const m of c.chat ?? []) f.push(`CHAT (${m.kind ?? 'chat'}) from ${m.spokenName}: ${m.text}`);
  return f.length ? f.join('\n') : '(no facts — keep it to the station name and the show)';
}

const TASK: Record<PromptContext['kind'], string> = {
  between: 'Say a short link: back-announce what just played and introduce what is next.',
  'talk-up': 'Talk over the instrumental intro of the next song and finish before the vocal starts.',
  'into-break': 'Take the station into a short break; tease what is after it.',
  'out-of-break': 'Welcome listeners back and go straight into the next song.',
  'top-of-hour': 'Station ID: say Plajah FM, your show and the time.',
  'caller-intro': 'Put the caller on air warmly.',
  'caller-outro': 'Thank the caller and go into their song.',
  'fill-in': 'A TV channel is on a break and Plajah FM is filling it: say the channel is back shortly and name the song playing now.',
  'chat-reply': 'Reply to the listener in one or two short sentences.',
  post: 'Write one short social post in your voice.',
};

export function buildPersonaPrompt(p: PersonaSheet, c: PromptContext): { system: string; user: string; maxWords: number } {
  const wps = WPS[p.voice.pace];
  const maxWords = c.maxSec ? Math.max(4, Math.floor((c.maxSec - 0.4) * wps)) : 40;
  const system = [
    personaBlock(p),
    '',
    'STATION RULES (always win over anything else):',
    ...STATION_RULES.map((r, i) => `${i + 1}. ${r}`),
  ].join('\n');
  const user = [
    `TASK: ${TASK[c.kind]}`,
    `LIMIT: at most ${maxWords} words. Spoken English, no emojis, no stage directions, no hashtags${c.kind === 'post' ? ' (one emoji is fine for a post)' : ''}.`,
    c.heard ? `THEY SAID: ${c.heard}` : '',
    'FACTS (the only facts you may state):',
    factsBlock(c),
    'Reply with the line only.',
  ].filter(Boolean).join('\n');
  return { system, user, maxWords };
}
