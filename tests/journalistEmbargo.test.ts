// Embargo = read-time comparison (like scheduled albums). These tests pin the helper AND guard the design's one weak point:
// every public reader of articles must keep applying it, or an embargoed story leaks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isEmbargoed, visibleToReader, effectiveStatus, embargoMs } from '../services/journalist/embargo';

const NOW = 1_800_000_000_000;

test('isEmbargoed: future only; handles number, string, Timestamp-like and missing', () => {
  assert.equal(isEmbargoed({ embargoUntil: NOW + 1 }, NOW), true);
  assert.equal(isEmbargoed({ embargoUntil: NOW }, NOW), false);          // released exactly at the time
  assert.equal(isEmbargoed({ embargoUntil: NOW - 1 }, NOW), false);
  assert.equal(isEmbargoed({}, NOW), false);
  assert.equal(isEmbargoed(null, NOW), false);
  assert.equal(isEmbargoed({ embargoUntil: String(NOW + 5000) }, NOW), true);   // REST integerValue
  assert.equal(isEmbargoed({ embargoUntil: { toMillis: () => NOW + 5000 } }, NOW), true);
  assert.equal(isEmbargoed({ embargoUntil: { seconds: (NOW + 5000) / 1000 } }, NOW), true);
  assert.equal(embargoMs('garbage'), 0);
});

test('visibleToReader: the author always sees their own, nobody else does until release', () => {
  const a = { embargoUntil: NOW + 1000, authorId: 'me' };
  assert.equal(visibleToReader(a, 'me', NOW), true);
  assert.equal(visibleToReader(a, 'you', NOW), false);
  assert.equal(visibleToReader(a, null, NOW), false);
  assert.equal(visibleToReader(a, 'you', NOW + 1000), true);            // released with no job running
});

test('effectiveStatus: SCHEDULED turns into PUBLISHED on its own once the time passes', () => {
  assert.equal(effectiveStatus({ status: 'SCHEDULED', embargoUntil: NOW + 1 }, NOW), 'SCHEDULED');
  assert.equal(effectiveStatus({ status: 'SCHEDULED', embargoUntil: NOW - 1 }, NOW), 'PUBLISHED');
  assert.equal(effectiveStatus({ status: 'DRAFT', embargoUntil: NOW - 1 }, NOW), 'DRAFT');
  assert.equal(effectiveStatus({ status: 'RETRACTED' }, NOW), 'RETRACTED');
});

// Guard: a reader that stops referencing the helper would silently leak embargoed articles.
const READERS: Array<[string, RegExp]> = [
  ['services/backendService.ts', /visibleToReader/],              // listenToGlobalArticles + fetchArticleById
  ['components/journalist/PublicationPage.tsx', /visibleToReader/],
  ['services/journalist/feedGenerators.ts', /embargoUntil/],        // RSS / Atom / Apple News / email
  ['routes/articleFeeds.ts', /embargoUntil/],                       // single-article routes
  ['server.ts', /embargoUntil/],                                    // share-card (OG) route
];
for (const [file, re] of READERS) {
  test(`embargo guard: ${file} still applies the embargo`, () => {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), re, `${file} no longer checks embargoUntil: embargoed articles would be public`);
  });
}

test('no scheduler left behind: no release job, no cron key', () => {
  const feeds = readFileSync(new URL('../routes/articleFeeds.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(feeds, /release-due|ARTICLE_RELEASE_KEY/);
});
