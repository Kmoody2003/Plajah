// Plajah Horror Classics — Plajah's own FAST channel (8.2 on LiveHub TV+), programmed from the
// Halloween curation and run by the platform: admins control it, nobody's account owns it. The
// server lays out a different day for each day of the week and opens a fan vote for the 9 PM ET
// slot every night (services/fast/voteSchedule.ts, routes/fastVote.ts).
//
// Every film airs from Plajah's own Mux upload (data/muxFilmRegistry.ts), not archive.org: our
// adaptive HLS, our CDN, no third-party throttling mid-broadcast. Running times are the real
// lengths of those Mux streams (summed from their HLS playlists, measured 2026-10-24), not the
// rounded "96 min" labels — a fixed-time grid drifts on every rounded minute.
//
// Not in rotation yet, pending a rights call: The Cabinet of Dr. Caligari and The Housemaid (1960)
// are on Mux too, but the channel runs ads and the source/licence of those two uploads isn't
// recorded. Add their ids to MUX_LENGTH_SEC once cleared.

import { CURATED_HALLOWEEN_FILMS, PUMPKIN_PATCH_HERO_ALBUM } from '../services/archiveContentService';
import { MUX_FILM_REGISTRY } from './muxFilmRegistry';
import type { AdPlan, VoteOption, VoteSlotConfig } from '../services/fast/voteSchedule';

export const HORROR_CLASSICS_CHANNEL_ID = 'plajah_horror_classics';
export const HORROR_CLASSICS_TIMEZONE = 'America/New_York';
export const HORROR_CLASSICS_NAME = 'Plajah Horror Classics';
export const HORROR_CLASSICS_ROOM = 'halloween_vault';

/** Length (seconds) of each curated film's Mux stream — the films the channel airs. */
const MUX_LENGTH_SEC: Record<string, number> = {
  'Night.Of.The.Living.Dead_1080p': 5753.5,
  house_on_haunted_hill_ipod: 4483.26,
  CarnivalofSouls: 4979.62,
  ThePhantomoftheOpera: 6388.9,
  Haxan_tinted_and_subtitled: 6292.95,
  Horror_Express: 5286.86,
  white_zombie: 3919.83,
  TheTerror1963: 4743.13,
  TheGhoul: 4127.33,
  FrankensteinfullMovie: 761.19,
  'europeana-nosferatu-1922': 5658.71,
};

/** Pumpkin Patch is Brian James Gage's film, not public domain: it always airs commercial-free.
 *  Its stream URL lives on the album in Firestore, so the server resolves it at scheduling time. */
export const PUMPKIN_PATCH_ALBUM_ID: string = PUMPKIN_PATCH_HERO_ALBUM.id;
export const PUMPKIN_PATCH_BASE: Omit<VoteOption, 'videoUrl' | 'durationSec'> = {
  videoId: PUMPKIN_PATCH_HERO_ALBUM.id,
  title: 'Pumpkin Patch',
  thumbnail: PUMPKIN_PATCH_HERO_ALBUM.thumbnailUrl,
  year: '2025',
  commercialFree: true,
};

/** The public-domain part of the pool (Pumpkin Patch is added by the server once resolved). */
export const HORROR_CLASSICS_PD_POOL: VoteOption[] = CURATED_HALLOWEEN_FILMS
  .filter(f => MUX_LENGTH_SEC[f.identifier] && MUX_FILM_REGISTRY[f.identifier]?.muxPlaybackId)
  .map(f => ({
    videoId: f.identifier,
    title: f.identifier === 'europeana-nosferatu-1922' ? 'Nosferatu' : f.title,
    videoUrl: `https://stream.mux.com/${MUX_FILM_REGISTRY[f.identifier].muxPlaybackId}.m3u8`,
    durationSec: MUX_LENGTH_SEC[f.identifier],
    thumbnail: f.thumbnailUrl,
    year: f.year,
  }));

/** Programmes long enough to be "tonight's movie" (the 1910 Frankenstein short fills gaps only). */
export const MIN_FEATURE_SEC = 40 * 60;

export const HORROR_CLASSICS_NIGHTLY_SLOT: VoteSlotConfig = {
  id: 'nightly_9pm',
  label: '9 PM Fan Pick',
  localTime: '21:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  optionCount: 4,
  excludePreviousWinner: true,
  cutoffMinutes: 60,
  opensHoursBefore: 23,
};

/** Two-minute breaks between programmes and every 25 minutes inside them (never inside Pumpkin
 *  Patch). Commercial-free funding is a creator-channel feature; this channel doesn't take pledges. */
export const HORROR_CLASSICS_ADS: AdPlan = { breakSec: 120, midrollEverySec: 25 * 60 };
