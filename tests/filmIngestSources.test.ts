import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveArchiveFilm, selectArchiveVideo, explainYoutubeError, ARCHIVE_FILM_ITEMS } from '../services/filmIngestSources';
import {
  ALL_CURATED_ARCHIVE_FILMS,
  CURATED_INTERNATIONAL_FILMS,
  CURATED_US_CLASSIC_FILMS,
  CURATED_DIRECTOR_VAULT_FILMS,
  CURATED_ANIME_AND_ANIMATION_FILMS,
  CURATED_PUBLIC_DOMAIN_TV_SERIES,
  archiveVideoToAlbum,
} from '../services/archiveContentService';
import { getProxyStreamUrl } from '../services/selfHostedFilms';
import { CLASSIC_DIRECTORS } from '../data/classicDirectors';

test('resolves actual spaced filenames instead of guessing the catalog identifier', async () => {
  const fetcher = async () => new Response(JSON.stringify({ metadata: { title: 'The Housemaid (1960)' }, files: [{ name: 'The Housemaid (1960).mp4', size: '100' }] }));
  const result = await resolveArchiveFilm('kofa-the-housemaid-1960', fetcher as typeof fetch);
  assert.equal(result.url, 'https://archive.org/download/the-housemaid-1960/The%20Housemaid%20(1960).mp4');
  assert.equal(result.size, 100);
});
test('does not substitute an arbitrary film when an archive item disappears', async () => {
  await assert.rejects(resolveArchiveFilm('kofa-the-housemaid-1960', (async () => new Response('{}')) as typeof fetch), /missing or restricted/);
});
test('selects full movie instead of DVD menus, segments, or trailers', () => {
  assert.equal(selectArchiveVideo([{ name: 'VIDEO_TS.mp4', size: 1000 }, { name: 'VTS_01_1.mp4', size: 1000 }, { name: 'trailer.mp4', size: 9000 }, { name: 'Night.mp4', size: 500 }], 'Night.mp4').name, 'Night.mp4');
});
test('distinguishes YouTube age verification from a missing source', () => {
  assert.match(explainYoutubeError('ERROR: Sign in to confirm your age.'), /age verification/);
  assert.match(explainYoutubeError('Video unavailable'), /unavailable/);
});
test('never accepts HTML or a metadata record without video files', async () => {
  await assert.rejects(resolveArchiveFilm('kofa-the-housemaid-1960', (async () => new Response(JSON.stringify({ metadata: { title: 'Film' }, files: [{ name: 'index.html', size: 10 }] }))) as typeof fetch), /no downloadable MP4/);
});
test('maps all curated international, US classic, director vault, anime/animation, and TV series items in ARCHIVE_FILM_ITEMS', () => {
  assert.ok(CURATED_INTERNATIONAL_FILMS.length >= 25, 'Expected at least 25 international films');
  assert.ok(CURATED_US_CLASSIC_FILMS.length >= 20, 'Expected at least 20 US classic/noir films');
  assert.ok(CURATED_DIRECTOR_VAULT_FILMS.length >= 25, 'Expected at least 25 unlocked director vault films');
  assert.ok(CURATED_ANIME_AND_ANIMATION_FILMS.length >= 19, 'Expected at least 19 classic Japanese anime & global animation films');
  assert.ok(CURATED_PUBLIC_DOMAIN_TV_SERIES.length >= 17, 'Expected at least 17 public domain TV series');

  // Previously unmapped/broken items are now mapped
  assert.equal(ARCHIVE_FILM_ITEMS['kofa-aimless-bullet-1961'], 'obaltan');
  assert.equal(ARCHIVE_FILM_ITEMS['ia-charade-1963'], 'la35ca-Cinema_35_-_Charade_1963');
  assert.equal(ARCHIVE_FILM_ITEMS['europeana-polygoon-newsreel-1931'], 'vliegkampschip_hms_karel_doorman');

  const directArchiveCollections = [
    ...CURATED_INTERNATIONAL_FILMS,
    ...CURATED_US_CLASSIC_FILMS,
    ...CURATED_DIRECTOR_VAULT_FILMS,
    ...CURATED_ANIME_AND_ANIMATION_FILMS,
    ...CURATED_PUBLIC_DOMAIN_TV_SERIES,
  ];
  for (const film of directArchiveCollections) {
    assert.ok(ARCHIVE_FILM_ITEMS[film.identifier], `Missing ARCHIVE_FILM_ITEMS entry for ${film.identifier}`);
    assert.ok(film.videoUrl && /^https:\/\/archive\.org\/download\//.test(film.videoUrl), `Expected direct archive.org download URL for ${film.identifier}`);
    const album = archiveVideoToAlbum(film);
    assert.equal(album.proxyStreamUrl, getProxyStreamUrl(film.identifier));
  }
});
test('converts public domain TV series into Album with seasons, episode tracks, and unbreakable proxyStreamUrl', () => {
  let multiEpisodeCount = 0;
  for (const series of CURATED_PUBLIC_DOMAIN_TV_SERIES) {
    assert.ok(series.seasons && series.seasons.length > 0, `Expected seasons on ${series.identifier}`);
    const totalEpisodes = series.seasons.reduce((acc, s) => acc + s.episodes.length, 0);
    assert.ok(totalEpisodes >= 1, `Expected episodes on ${series.identifier}`);
    if (totalEpisodes >= 2) multiEpisodeCount++;
    const album = archiveVideoToAlbum(series);
    assert.equal(album.subType, 'TV_SERIES');
    assert.equal(album.tracks.length, totalEpisodes);
    assert.equal(album.proxyStreamUrl, getProxyStreamUrl(series.identifier));
    for (const track of album.tracks) {
      assert.ok(track.url && /^https:\/\/archive\.org\/download\//.test(track.url), `Expected valid episode URL on ${series.identifier}`);
    }
  }
  assert.ok(multiEpisodeCount >= 13, `Expected at least 13 multi-episode TV series, got ${multiEpisodeCount}`);
});
test('resolves all on-platform director dossier filmography items to playable catalog entries', () => {
  const curatedIds = new Set(ALL_CURATED_ARCHIVE_FILMS.map((f) => f.identifier));
  curatedIds.add('album_1787881859314_mlt23'); // Pumpkin Patch hero album
  for (const director of Object.values(CLASSIC_DIRECTORS)) {
    for (const work of director.filmography) {
      if (work.isOnPlatform && work.platformFilmId) {
        assert.ok(
          curatedIds.has(work.platformFilmId),
          `Director ${director.name} work "${work.title}" references unknown platformFilmId: ${work.platformFilmId}`
        );
      }
    }
  }
});


