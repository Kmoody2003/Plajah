// dailyMixService — "Your Daily Mix": a fresh ≤40-minute playlist Chora builds for you each day.
//
// Seeds from your taste (services/tasteService), fills via the cross-catalog recommender
// (services/musicRecommender, native Chora + Audius), trims to 40 minutes, and wraps the result in a
// synthetic Album the existing player can play (subType 'PLAYLIST', tracks[]). It reads as if the
// Chora mascot curated it — a personalized, exploratory overview plus one line of insight pulled from
// an artist in the set. Rebuilt once per local day; cached in-session so it's stable while you browse.

import type { Album, Track } from '../types';
import { auth } from './backendService';
import { buildRadioQueue, resetRecommenderCaches } from './musicRecommender';
import { getTasteVector, topAffinities } from './tasteService';

const MAX_SECONDS = 40 * 60;          // hard 40-minute cap
const AVG_TRACK_SECONDS = 210;        // fallback when a track has no duration

export interface DailyMix {
  album: Album;            // hand straight to onSelectAlbum to play
  dateKey: string;
  title: string;           // "Your Daily Mix"
  greetingName: string;    // the user's first name, for personal copy
  overview: string;        // "why this mix" — a couple of exploratory sentences
  insight?: string;        // a line about an artist in the set
  trackCount: number;
  durationSec: number;
  topGenres: string[];
}

const todayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const firstName = (): string => {
  const dn = (auth.currentUser?.displayName || '').trim();
  return dn ? dn.split(/\s+/)[0] : 'there';
};

const trackSeconds = (t: Track): number => t.duration || t.audioAnalysis?.duration || AVG_TRACK_SECONDS;

const sentenceOf = (text?: string): string | undefined => {
  if (!text) return undefined;
  const s = text.trim().split(/(?<=[.!?])\s/)[0];
  return s && s.length > 8 ? (s.length > 160 ? s.slice(0, 157) + '…' : s) : undefined;
};

// A warm, exploratory overview written in Chora's voice, shaped by the day's taste.
function writeOverview(name: string, genres: string[], hasTaste: boolean): string {
  const g = genres.filter(Boolean).slice(0, 2);
  if (!hasTaste) {
    return `A first taste, ${name}. I pulled a spread of what's moving on Chora right now — heart the ones that land and I'll learn your sound fast.`;
  }
  const lead = g.length
    ? `Today I leaned into your ${g.join(' and ')}`
    : `Today I followed the thread of what you've been loving`;
  return `${lead}, ${name}, and slipped in a few nearby rooms to explore. Forty minutes, no filler — tell me what hits with a heart.`;
}

let _cache: { uid: string; dateKey: string; mix: DailyMix } | null = null;

/**
 * Build (or return today's cached) Daily Mix for the signed-in user. Returns null if signed out or
 * nothing could be assembled.
 */
export async function buildDailyMix(opts: { force?: boolean } = {}): Promise<DailyMix | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const dateKey = todayKey();
  if (!opts.force && _cache && _cache.uid === uid && _cache.dateKey === dateKey) return _cache.mix;
  if (opts.force) resetRecommenderCaches();

  const vec = await getTasteVector();
  const { genres, artists } = topAffinities(vec);
  const hasTaste = vec.count > 0 && (genres.length > 0 || artists.length > 0);

  // A synthetic seed from the strongest affinity steers the recommender; an empty seed falls back to
  // popularity/trending (a good exploratory first mix for a brand-new listener).
  const seed = {
    id: '__dailymix_seed__', title: '', url: '',
    artist: artists[0] || '', genre: genres[0] || '',
    artistId: (artists[0] && artists[0].length > 20 ? artists[0] : undefined),
  } as unknown as Track;

  let items;
  try { items = await buildRadioQueue(seed, null, new Set<string>(), { limit: 60 }); }
  catch { items = []; }
  if (!items.length) return null;

  // Trim to 40 minutes, de-duplicating by track id.
  const tracks: Track[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const it of items) {
    if (!it.track?.id || seen.has(it.track.id) || !it.track.url) continue;
    const secs = trackSeconds(it.track);
    if (total + secs > MAX_SECONDS && tracks.length >= 6) break; // keep at least a handful
    seen.add(it.track.id);
    // Carry the album cover onto the track so the player + card have art.
    tracks.push({ ...it.track, albumCover: it.track.albumCover || it.album?.coverImage });
    total += secs;
    if (total >= MAX_SECONDS) break;
  }
  if (!tracks.length) return null;

  // Insight: the first artist bio we can find among the mix's albums.
  let insight: string | undefined;
  let insightArtist: string | undefined;
  for (const it of items) {
    const bio = sentenceOf((it.album as any)?.artistBio);
    if (bio) { insight = bio; insightArtist = it.album?.artist; break; }
  }
  if (insight && insightArtist) insight = `On ${insightArtist}: ${insight}`;

  const name = firstName();
  const cover = tracks.find(t => t.albumCover)?.albumCover || '';
  const album: Album = {
    id: `dailymix_${uid.slice(0, 6)}_${dateKey}`,
    ownerId: uid,
    title: 'Your Daily Mix',
    artist: 'Chora',
    coverImage: cover,
    description: writeOverview(name, genres, hasTaste),
    tracks,
    type: 'MUSIC',
    subType: 'PLAYLIST',
    createdAt: Date.now(),
    themeColor: '#6B0099',
    isPublic: false,
  } as Album;

  const mix: DailyMix = {
    album, dateKey,
    title: 'Your Daily Mix',
    greetingName: name,
    overview: album.description,
    insight,
    trackCount: tracks.length,
    durationSec: total,
    topGenres: genres.slice(0, 3),
  };
  _cache = { uid, dateKey, mix };
  return mix;
}

export function clearDailyMixCache(): void { _cache = null; }
