import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveArchiveFilm, selectArchiveVideo, explainYoutubeError } from '../services/filmIngestSources';

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
