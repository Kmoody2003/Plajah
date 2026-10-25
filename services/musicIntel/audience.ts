// Audience sentiment for Music Intelligence — what listening parties actually felt, song by song.
//
// A listening party leaves a trail (timestamped chat / emotes / GIFs / reactions + poll votes). When it
// ends, the API folds that trail into a small PartyAudienceRecap per party (this file, pure), stores it
// at musicIntel/{albumId}/parties/{partyId}, and every other listener sees the MERGED result as data
// facts + point cards under "Audience sentiment" — no party needed. Everything here is deterministic
// arithmetic over what people did; nothing is invented.
//
//   npx tsx --test tests/musicIntelAudience.test.ts

import { PROFANITY_SET, normalizeForMatch } from '../profanityLexicon';
import {
  ENERGY_BUCKET_SEC, ENERGY_WEIGHT, bucketEnergy, energyPeak, formatMoment, tallyPoll,
  type PartyPoll, type PartyVote, type PollTally,
} from '../partyEngagement';

export const AUDIENCE_VERSION = 1;

// ── Input (raw party data as read from Firestore) ─────────────────────────────────────────────────

export interface RawChat { id?: string; uid?: string; name?: string; text?: string; kind?: string; emoteId?: string; gifUrl?: string; atSec?: number; trackId?: string; at?: any }
export interface RawReaction { id?: string; uid?: string; emoji?: string; emoteId?: string; atSec?: number; trackId?: string; at?: any }

export interface AudienceTrackMeta { id: string; title: string; durationSec: number }

export interface PartyAudienceInput {
  partyId: string;
  albumId: string;
  hostId: string;
  startedAt: number;
  endedAt?: number;
  tracks: AudienceTrackMeta[];
  chat: RawChat[];
  reactions: RawReaction[];
  polls: PartyPoll[];
  votes: Record<string, PartyVote[]>;
  /** distinct people present (viewer docs / presence) — a floor; engagement authors are added on top. */
  listeners?: number;
}

// ── Output ────────────────────────────────────────────────────────────────────────────────────────

export interface AudienceComment { name: string; text: string; atSec?: number; gifUrl?: string; emoteId?: string }
export interface AudienceReactionCount { key: string; count: number; isEmote: boolean }
export interface AudiencePollResult {
  partyId?: string;
  pollId?: string;
  question: string; kind: PartyPoll['kind']; auto: boolean; total: number; counts: Record<string, number>; labels?: Record<string, string>; avg?: number;
  /** open-question answers — the creator's analytics only (stripped from the public read). */
  answers?: string[];
}

export interface TrackAudience {
  trackId: string;
  title: string;
  durationSec: number;
  /** people who did anything on this song */
  engaged: number;
  ratingCount: number;
  ratingSum: number;
  /** mood/verdict poll winners are read off `polls`; this is the quick top mood for cards */
  moodTop?: { label: string; count: number; total: number };
  polls: AudiencePollResult[];
  bucketSec: number;
  /** raw weighted engagement per bucket */
  energy: number[];
  peak: { atSec: number; score: number; top?: string } | null;
  reactions: AudienceReactionCount[];
  /** the few best lines — shown to everyone on the cards. */
  comments: AudienceComment[];
  /** every public-safe line in playhead order — the creator's analytics only (stripped from the public read). */
  allComments: AudienceComment[];
  events: number;
}

export interface PartyAudienceRecap {
  version: number;
  partyId: string;
  albumId: string;
  hostId: string;
  startedAt: number;
  endedAt?: number;
  listeners: number;
  computedAt: number;
  tracks: Record<string, TrackAudience>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────────

const MAX_COMMENTS_PER_TRACK = 6;
const MAX_ALL_COMMENTS = 60;
const MAX_POLL_ANSWERS = 60;
const MAX_TEXT = 160;

function maskBad(text: string): string {
  return text.replace(/[\w@$!]+/g, w => (PROFANITY_SET.has(normalizeForMatch(w)) ? w[0] + '★'.repeat(Math.max(1, w.length - 1)) : w));
}

/** A public-facing comment: no links, no mentions, profanity masked, bounded. Null when nothing is left. */
export function publicCommentText(raw: string | undefined): string | null {
  let t = String(raw || '').replace(/https?:\/\/\S+/gi, '').replace(/www\.\S+/gi, '').replace(/@\w+/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 2) return null;
  t = maskBad(t.slice(0, MAX_TEXT));
  return t;
}

const firstName = (n?: string) => (String(n || 'A listener').trim().split(/\s+/)[0] || 'A listener').slice(0, 24);

const SAFE_GIF = /^https:\/\/[\w.-]*(giphy\.com|tenor\.com|plajah\.com|firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//i;

// ── One party → recap ─────────────────────────────────────────────────────────────────────────────

export function summarizeParty(inp: PartyAudienceInput, now: number = Date.now()): PartyAudienceRecap {
  const everyone = new Set<string>();
  const tracks: Record<string, TrackAudience> = {};

  for (const t of inp.tracks) {
    const dur = t.durationSec > 0 ? t.durationSec : 240;
    const chat = inp.chat.filter(c => c.trackId === t.id);
    const rx = inp.reactions.filter(r => r.trackId === t.id);
    const polls = inp.polls.filter(p => p.trackId === t.id);
    const engagedUids = new Set<string>();

    const events: { trackId: string; atSec?: number; w: number }[] = [];
    for (const c of chat) {
      if (c.uid) { engagedUids.add(c.uid); everyone.add(c.uid); }
      events.push({ trackId: t.id, atSec: c.atSec, w: c.kind === 'gif' ? ENERGY_WEIGHT.gif : c.kind === 'emote' ? ENERGY_WEIGHT.emote : ENERGY_WEIGHT.text });
    }
    const reactionTally = new Map<string, { n: number; isEmote: boolean }>();
    for (const r of rx) {
      if (r.uid) { engagedUids.add(r.uid); everyone.add(r.uid); }
      events.push({ trackId: t.id, atSec: r.atSec, w: ENERGY_WEIGHT.reaction });
      const key = r.emoteId || r.emoji || '';
      if (key) { const cur = reactionTally.get(key) || { n: 0, isEmote: !!r.emoteId }; cur.n++; reactionTally.set(key, cur); }
    }
    for (const c of chat) {
      if (c.kind === 'emote' && c.emoteId) { const cur = reactionTally.get(c.emoteId) || { n: 0, isEmote: true }; cur.n++; reactionTally.set(c.emoteId, cur); }
    }

    const pollResults: AudiencePollResult[] = [];
    let ratingCount = 0, ratingSum = 0;
    let moodTop: TrackAudience['moodTop'];
    for (const p of polls) {
      const votes = inp.votes[p.id] || [];
      votes.forEach(v => {
        if (v.uid) { engagedUids.add(v.uid); everyone.add(v.uid); }
        // an auto poll is often answered early in the NEXT song — that playhead isn't on this timeline
        if (!v.trackId || v.trackId === t.id) events.push({ trackId: t.id, atSec: v.atSec, w: ENERGY_WEIGHT.vote });
      });
      const tally: PollTally = tallyPoll(p, votes);
      if (!tally.total) continue;
      const labels = p.options ? Object.fromEntries(p.options.map(o => [o.id, o.label])) : undefined;
      pollResults.push({
        partyId: inp.partyId, pollId: p.id,
        question: p.question, kind: p.kind, auto: !!p.auto, total: tally.total, counts: tally.counts, labels, avg: tally.avg,
        answers: tally.answers ? tally.answers.map(a => publicCommentText(a)).filter((a): a is string => !!a).slice(0, MAX_POLL_ANSWERS) : undefined,
      });
      if (p.kind === 'rating' && tally.avg != null) { ratingCount += tally.total; ratingSum += tally.avg * tally.total; }
      if (p.kind === 'choice' && p.auto && p.options && /feel/i.test(p.question)) {
        const [top] = Object.entries(tally.counts).sort((a, b) => b[1] - a[1]);
        if (top && top[1] > 0 && (!moodTop || top[1] > moodTop.count)) moodTop = { label: labels?.[top[0]] || top[0], count: top[1], total: tally.total };
      }
    }

    const energy = bucketEnergy(events, t.id, dur);
    const peak0 = energyPeak(energy);
    // the loudest thing in the peak bucket — "🔥 ×9 at 2:14"
    let peakTop: string | undefined;
    if (peak0) {
      const lo = peak0.atSec, hi = lo + ENERGY_BUCKET_SEC;
      const inPeak = new Map<string, number>();
      for (const r of rx) if (typeof r.atSec === 'number' && r.atSec >= lo && r.atSec < hi) { const k = r.emoteId || r.emoji || ''; if (k) inPeak.set(k, (inPeak.get(k) || 0) + 1); }
      for (const c of chat) if (c.kind === 'emote' && c.emoteId && typeof c.atSec === 'number' && c.atSec >= lo && c.atSec < hi) inPeak.set(c.emoteId, (inPeak.get(c.emoteId) || 0) + 1);
      peakTop = [...inPeak.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    }

    const allComments: AudienceComment[] = [];
    for (const c of [...chat].sort((a, b) => (a.atSec ?? 1e9) - (b.atSec ?? 1e9))) {
      if (allComments.length >= MAX_ALL_COMMENTS) break;
      const at = typeof c.atSec === 'number' ? Math.floor(c.atSec) : undefined;
      if (c.kind === 'gif') {
        // only well-known GIF hosts are ever re-served; anything else is dropped
        if (c.gifUrl && SAFE_GIF.test(c.gifUrl)) allComments.push({ name: firstName(c.name), text: '', atSec: at, gifUrl: c.gifUrl });
        continue;
      }
      if (c.kind === 'emote') continue;
      const text = publicCommentText(c.text);
      if (text) allComments.push({ name: firstName(c.name), text, atSec: at });
    }
    const comments = allComments.slice(0, MAX_COMMENTS_PER_TRACK);

    tracks[t.id] = {
      trackId: t.id, title: t.title, durationSec: dur,
      engaged: engagedUids.size, ratingCount, ratingSum: Math.round(ratingSum * 100) / 100, moodTop,
      polls: pollResults, bucketSec: ENERGY_BUCKET_SEC, energy,
      peak: peak0 ? { ...peak0, top: peakTop } : null,
      reactions: [...reactionTally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([key, v]) => ({ key, count: v.n, isEmote: v.isEmote })),
      comments, allComments, events: events.length,
    };
  }

  return {
    version: AUDIENCE_VERSION, partyId: inp.partyId, albumId: inp.albumId, hostId: inp.hostId,
    startedAt: inp.startedAt, endedAt: inp.endedAt,
    listeners: Math.max(inp.listeners || 0, everyone.size),
    computedAt: now, tracks,
  };
}

// ── Many parties → one album read ─────────────────────────────────────────────────────────────────

export interface AlbumAudienceTrack extends Omit<TrackAudience, 'peak'> {
  peak: TrackAudience['peak'];
  ratingAvg?: number;
  /** parties that touched this song */
  sessions: number;
}

export interface AlbumAudience {
  sessions: number;
  listeners: number;
  lastPartyAt?: number;
  tracks: Record<string, AlbumAudienceTrack>;
}

/** Parties that engaged less than this don't make a song's card (one tap isn't sentiment). */
const MIN_EVENTS_FOR_CARD = 3;

export function mergeAudience(recaps: PartyAudienceRecap[]): AlbumAudience {
  const out: AlbumAudience = { sessions: recaps.length, listeners: 0, tracks: {} };
  for (const r of recaps) {
    out.listeners += r.listeners || 0;
    out.lastPartyAt = Math.max(out.lastPartyAt || 0, r.endedAt || r.startedAt || 0) || out.lastPartyAt;
    for (const [id, t] of Object.entries(r.tracks || {})) {
      const m = out.tracks[id];
      if (!m) { out.tracks[id] = { ...t, sessions: t.events > 0 ? 1 : 0, energy: [...t.energy], comments: [...t.comments], allComments: [...(t.allComments || [])], reactions: t.reactions.map(x => ({ ...x })), polls: [...t.polls] }; continue; }
      m.engaged += t.engaged; m.events += t.events; m.ratingCount += t.ratingCount; m.ratingSum += t.ratingSum;
      if (t.events > 0) m.sessions++;
      const len = Math.max(m.energy.length, t.energy.length);
      m.energy = Array.from({ length: len }, (_, i) => Math.round(((m.energy[i] || 0) + (t.energy[i] || 0)) * 100) / 100);
      const rx = new Map(m.reactions.map(x => [x.key, { ...x }]));
      for (const x of t.reactions) { const c = rx.get(x.key); if (c) c.count += x.count; else rx.set(x.key, { ...x }); }
      m.reactions = [...rx.values()].sort((a, b) => b.count - a.count).slice(0, 6);
      m.comments = [...m.comments, ...t.comments].slice(0, MAX_COMMENTS_PER_TRACK * 2);
      m.allComments = [...(m.allComments || []), ...(t.allComments || [])].slice(0, MAX_ALL_COMMENTS * 2);
      m.polls = [...m.polls, ...t.polls];
      if (t.moodTop && (!m.moodTop || t.moodTop.count > m.moodTop.count)) m.moodTop = t.moodTop;
    }
  }
  for (const m of Object.values(out.tracks)) {
    const pk = energyPeak(m.energy, m.bucketSec);
    m.peak = pk ? { ...pk, top: m.reactions[0]?.key } : null;
    if (m.ratingCount > 0) m.ratingAvg = Math.round((m.ratingSum / m.ratingCount) * 100) / 100;
  }
  return out;
}

// ── Cards ─────────────────────────────────────────────────────────────────────────────────────────

export type AudienceCardKind = 'fact' | 'point' | 'comment' | 'energy' | 'poll';

export interface AudienceCard {
  id: string;
  scope: 'album' | 'track';
  trackId?: string;
  kind: AudienceCardKind;
  title: string;
  text: string;
  /** big number on the card ("4.6★", "62%", "3 parties") */
  stat?: string;
  /** a moment in the song — the card seeks there */
  atSec?: number;
  gifUrl?: string;
  /** emote id to render beside the text */
  emoteId?: string;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w.endsWith('y') ? `${w.slice(0, -1)}ies` : `${w}s`}`;

/** Deterministic point cards + data facts. Order: album headline cards first, then per song in album order. */
export function buildAudienceCards(aud: AlbumAudience, order: string[]): AudienceCard[] {
  const cards: AudienceCard[] = [];
  if (!aud.sessions) return cards;
  const ordered = order.filter(id => aud.tracks[id] && aud.tracks[id].events >= MIN_EVENTS_FOR_CARD);
  const titleOf = (id: string) => aud.tracks[id].title;

  cards.push({
    id: 'album-sessions', scope: 'album', kind: 'fact', title: 'Listened together',
    stat: plural(aud.sessions, 'party'), text: `${plural(aud.listeners, 'listener')} across ${plural(aud.sessions, 'listening party')}${aud.lastPartyAt ? '' : ''}.`,
  });

  const rated = ordered.filter(id => (aud.tracks[id].ratingCount || 0) >= 1);
  if (rated.length) {
    const fav = [...rated].sort((a, b) => (aud.tracks[b].ratingAvg || 0) - (aud.tracks[a].ratingAvg || 0) || aud.tracks[b].ratingCount - aud.tracks[a].ratingCount)[0];
    const t = aud.tracks[fav];
    cards.push({ id: 'album-favorite', scope: 'album', kind: 'point', trackId: fav, title: 'Crowd favorite', stat: `${t.ratingAvg!.toFixed(1)}★`, text: `“${titleOf(fav)}” — rated by ${plural(t.ratingCount, 'listener')}.` });
  }

  const hot = [...ordered].filter(id => aud.tracks[id].peak).sort((a, b) => (aud.tracks[b].peak!.score) - (aud.tracks[a].peak!.score))[0];
  if (hot) {
    const t = aud.tracks[hot];
    cards.push({ id: 'album-hottest', scope: 'album', kind: 'energy', trackId: hot, title: 'Hottest moment', stat: formatMoment(t.peak!.atSec), text: `The room peaked on “${titleOf(hot)}”.`, atSec: t.peak!.atSec, emoteId: t.peak!.top });
  }

  for (const id of ordered) {
    const t = aud.tracks[id];
    if (t.ratingAvg != null && t.ratingCount >= 1) {
      cards.push({ id: `${id}-rating`, scope: 'track', trackId: id, kind: 'fact', title: 'Listener rating', stat: `${t.ratingAvg.toFixed(1)}★`, text: `${plural(t.ratingCount, 'listener')} rated it live.` });
    }
    if (t.moodTop && t.moodTop.total >= 1) {
      cards.push({ id: `${id}-mood`, scope: 'track', trackId: id, kind: 'poll', title: 'How it felt', stat: `${pct(t.moodTop.count, t.moodTop.total)}%`, text: `${t.moodTop.label} — the most common feeling (${plural(t.moodTop.total, 'vote')}).` });
    }
    const verdict = t.polls.find(p => p.kind === 'choice' && p.auto && !/feel/i.test(p.question));
    if (verdict && verdict.total >= 1 && verdict.labels) {
      const [top] = Object.entries(verdict.counts).sort((a, b) => b[1] - a[1]);
      if (top && top[1] > 0) cards.push({ id: `${id}-verdict`, scope: 'track', trackId: id, kind: 'poll', title: 'Verdict', stat: `${pct(top[1], verdict.total)}%`, text: `${verdict.labels[top[0]] || top[0]} (${plural(verdict.total, 'vote')}).` });
    }
    if (t.peak && t.peak.score > 0) {
      const topR = t.reactions[0];
      cards.push({
        id: `${id}-peak`, scope: 'track', trackId: id, kind: 'energy', title: 'Energy peak', stat: formatMoment(t.peak.atSec), atSec: t.peak.atSec,
        // a plain emoji reads as itself ("×22 🔥"); a library emote is drawn beside the stat instead
        text: topR ? (topR.isEmote ? `The room's most-used reaction here — ${plural(topR.count, 'time')}.` : `${topR.key} ×${topR.count} — the room's most-used reaction here.`) : 'The chat lit up here.',
        emoteId: topR?.isEmote ? topR.key : undefined,
      });
    }
    for (const [i, c] of t.comments.slice(0, 3).entries()) {
      cards.push({ id: `${id}-c${i}`, scope: 'track', trackId: id, kind: 'comment', title: c.name, text: c.text, atSec: c.atSec, gifUrl: c.gifUrl });
    }
  }
  return cards;
}

/** Per-song series for the album energy graph, scaled against the loudest bucket of the album. */
export function albumEnergySeries(aud: AlbumAudience, order: string[]): { trackId: string; title: string; durationSec: number; series: number[]; bucketSec: number; total: number }[] {
  return order.filter(id => aud.tracks[id]).map(id => {
    const t = aud.tracks[id];
    return { trackId: id, title: t.title, durationSec: t.durationSec, series: t.energy, bucketSec: t.bucketSec, total: Math.round(t.energy.reduce((a, b) => a + b, 0) * 10) / 10 };
  });
}

/**
 * What anyone may see: the cards' inputs without open-question answers or the full comment log (those
 * are the creator's analytics). Pure copy — never mutates the stored recaps.
 */
export function publicAudience(aud: AlbumAudience): AlbumAudience {
  return {
    ...aud,
    tracks: Object.fromEntries(Object.entries(aud.tracks).map(([id, t]) => [id, {
      ...t,
      allComments: [],
      polls: t.polls.map(p => ({ ...p, answers: undefined, partyId: undefined, pollId: undefined })),
    }])),
  };
}
