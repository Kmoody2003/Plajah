// Plajah Horror Classics — Plajah's own FAST channel (8.2 on LiveHub TV+), programmed from the
// Halloween curation and run by the platform: admins control it, nobody's account owns it. The
// server lays out a different day for each day of the week and opens a fan vote for the 9 PM ET
// slot every night (services/fast/voteSchedule.ts, routes/fastVote.ts).
//
// Running times are the real file lengths from archive.org/metadata/<id> (measured 2026-10-24),
// not the rounded "96 min" labels — a fixed-time grid drifts on every rounded minute.
//
// Only titles a linear player can actually stream are here. Left out on purpose:
//   • The Housemaid (1960) — KOFA's YouTube release only; not ours to air with ads.
//   • The Cabinet of Dr. Caligari — the archive.org copy is a © 1994 restoration.
// Nosferatu airs from archive.org's CC0 copy (Nosferatu1922), not the curation's YouTube embed.

import { CURATED_HALLOWEEN_FILMS, PUMPKIN_PATCH_HERO_ALBUM } from '../services/archiveContentService';
import type { AdPlan, VoteOption, VoteSlotConfig } from '../services/fast/voteSchedule';

export const HORROR_CLASSICS_CHANNEL_ID = 'plajah_horror_classics';
export const HORROR_CLASSICS_TIMEZONE = 'America/New_York';
export const HORROR_CLASSICS_NAME = 'Plajah Horror Classics';
export const HORROR_CLASSICS_ROOM = 'halloween_vault';

/** archive.org file length (seconds) for each curated identifier the channel can stream. */
const ARCHIVE_LENGTH_SEC: Record<string, number> = {
  'Night.Of.The.Living.Dead_1080p': 5753.46,
  house_on_haunted_hill_ipod: 4483.21,
  CarnivalofSouls: 4979.58,
  ThePhantomoftheOpera: 6388.88,
  Haxan_tinted_and_subtitled: 6292.92,
  Horror_Express: 5286.82,
  white_zombie: 3919.82,
  TheTerror1963: 4743.11,
  TheGhoul: 4127.32,
  FrankensteinfullMovie: 761.15,
};

const NOSFERATU_CC0: VoteOption = {
  videoId: 'europeana-nosferatu-1922',
  title: 'Nosferatu',
  videoUrl: 'https://archive.org/download/Nosferatu1922/Nosferatu.mp4',
  durationSec: 5514.18,
  thumbnail: CURATED_HALLOWEEN_FILMS.find(f => f.identifier === 'europeana-nosferatu-1922')?.thumbnailUrl,
  year: '1922',
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
export const HORROR_CLASSICS_PD_POOL: VoteOption[] = [
  ...CURATED_HALLOWEEN_FILMS
    .filter(f => ARCHIVE_LENGTH_SEC[f.identifier] && f.videoUrl?.startsWith('https://archive.org/'))
    .map(f => ({
      videoId: f.identifier,
      title: f.title,
      videoUrl: f.videoUrl!,
      durationSec: ARCHIVE_LENGTH_SEC[f.identifier],
      thumbnail: f.thumbnailUrl,
      year: f.year,
    })),
  NOSFERATU_CC0,
];

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
 *  Patch, and never inside a 9 PM airing fans have funded commercial-free). */
export const HORROR_CLASSICS_ADS: AdPlan = { breakSec: 120, midrollEverySec: 25 * 60 };

/** Fans can make the night's 9 PM movie commercial-free by pledging this much in total. Cards are
 *  held when people pledge and only charged if the goal is met when voting closes. */
export const HORROR_CLASSICS_COMMERCIAL_FREE_GOAL_CENTS = 2500;
