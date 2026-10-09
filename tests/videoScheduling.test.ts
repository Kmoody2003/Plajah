// "Release later" for videos = read-time comparison (like scheduled albums and embargoed articles; see services/releases/visibility.ts).
// These tests pin the helper AND guard the design's one weak point: every user-facing video reader must keep applying it, or a
// scheduled video leaks. Mirrors tests/journalistEmbargo.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isFutureRelease, visibleToViewer, filterReleased, releaseMs } from '../services/releases/visibility';

const NOW = 1_800_000_000_000;
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('isFutureRelease: future only, released exactly AT releaseDate', () => {
  assert.equal(isFutureRelease({ isScheduled: true, releaseDate: NOW + 1 }, NOW), true);
  assert.equal(isFutureRelease({ isScheduled: true, releaseDate: NOW }, NOW), false);
  assert.equal(isFutureRelease({ isScheduled: true, releaseDate: NOW - 1 }, NOW), false);
});

test('isFutureRelease: handles number, numeric string, Timestamp-like; missing fields never hide', () => {
  assert.equal(isFutureRelease({ isScheduled: true, releaseDate: String(NOW + 5000) }, NOW), true);
  assert.equal(isFutureRelease({ isScheduled: true, releaseDate: { toMillis: () => NOW + 5000 } }, NOW), true);
  assert.equal(isFutureRelease({ isScheduled: true, releaseDate: { seconds: (NOW + 5000) / 1000 } }, NOW), true);
  assert.equal(isFutureRelease({ isScheduled: true, releaseDate: { toMillis: () => NOW - 5000 } }, NOW), false);
  assert.equal(isFutureRelease({ isScheduled: true }, NOW), false);             // no date: nothing to wait for
  assert.equal(isFutureRelease({ releaseDate: NOW + 1 }, NOW), false);          // date without isScheduled: a plain release date
  assert.equal(isFutureRelease({ isScheduled: false, releaseDate: NOW + 1 }, NOW), false);
  assert.equal(isFutureRelease({}, NOW), false);
  assert.equal(isFutureRelease(null, NOW), false);
  assert.equal(isFutureRelease(undefined, NOW), false);
  assert.equal(releaseMs('garbage'), 0);
});

test('premieres reuse isScheduled/releaseDate for their start time but stay public before it', () => {
  assert.equal(isFutureRelease({ isPremiere: true, isScheduled: true, releaseDate: NOW + 100000 }, NOW), false);
  assert.equal(visibleToViewer({ isPremiere: true, isScheduled: true, releaseDate: NOW + 100000, ownerId: 'a' }, 'b', NOW), true);
});

test('visibleToViewer: the owner always sees their own, nobody else does until release', () => {
  const v = { isScheduled: true, releaseDate: NOW + 1000, ownerId: 'me' };
  assert.equal(visibleToViewer(v, 'me', NOW), true);
  assert.equal(visibleToViewer(v, 'you', NOW), false);
  assert.equal(visibleToViewer(v, null, NOW), false);
  assert.equal(visibleToViewer(v, undefined, NOW), false);
  assert.equal(visibleToViewer(v, 'you', NOW + 1000), true);                    // released with no job running
  assert.equal(visibleToViewer({ isScheduled: true, releaseDate: NOW + 1000 }, 'you', NOW), false);   // no owner on the doc
  assert.equal(visibleToViewer({ isScheduled: true, releaseDate: NOW + 1000 }, '', NOW), false);
  assert.equal(visibleToViewer({}, null, NOW), true);
});

test('filterReleased keeps released + own, drops other people scheduled videos', () => {
  const list = [
    { id: 'a', ownerId: 'x' },
    { id: 'b', ownerId: 'x', isScheduled: true, releaseDate: NOW + 10 },
    { id: 'c', ownerId: 'me', isScheduled: true, releaseDate: NOW + 10 },
    { id: 'd', ownerId: 'x', isScheduled: true, releaseDate: NOW - 10 },
  ];
  assert.deepEqual(filterReleased(list, 'me', NOW).map(v => v.id), ['a', 'c', 'd']);
  assert.deepEqual(filterReleased(list, null, NOW).map(v => v.id), ['a', 'd']);
});

// Guard: a reader that stops applying the helper would silently leak scheduled videos.
const READERS: Array<[string, RegExp]> = [
  ['components/RelloView.tsx', /filterReleasedVideos|videoVisibleToViewer/],
  ['components/VideoTab.tsx', /filterReleasedVideos/],
  ['components/UserProfileView.tsx', /filterReleased\(/],
  ['components/MovieUXView.tsx', /releaseVisibleToViewer\(/],      // direct open by id
  ['components/VideoPlayer.tsx', /releaseVisibleToViewer\(/],      // direct open by id: "Not available yet"
  ['components/ChoraArtistPage.tsx', /filterReleased\(/],
  ['services/soundsService.ts', /visibleToViewer\(/],
  ['services/videoReplies.ts', /isFutureRelease\(/],
  ['services/feedCardsService.ts', /filterReleased\(/],
  ['server.ts', /isFutureRelease\(/],                              // share cards, embeds, FAST mRSS
];
for (const [file, re] of READERS) {
  test(`video schedule guard: ${file} still hides unreleased videos`, () => {
    assert.match(src(file), re, `${file} no longer applies services/releases/visibility: scheduled videos would be public`);
  });
}

function exportBody(file: string, decl: string): string {
  const s = src(file);
  const start = s.indexOf(decl);
  assert.ok(start >= 0, `${decl} not found in ${file}`);
  const next = s.indexOf('\nexport const ', start + 10);
  return s.slice(start, next < 0 ? undefined : next);
}

// Every central fetcher in backendService must apply it (the components above are defence in depth on top of these).
const FETCHERS = ['fetchVideosByIds', 'fetchWorldContentByWorldId', 'fetchUserVideos', 'fetchFollowedVideos', 'fetchAllVideos', 'fetchVideoById', 'fetchFastChannelVideos'];
for (const name of FETCHERS) {
  test(`video schedule guard: backendService.${name} filters scheduled videos`, () => {
    assert.match(exportBody('services/backendService.ts', `export const ${name} =`), /filterReleasedVideos|videoVisibleToViewer/, `${name} must apply the release filter`);
  });
}

test('fetchVideosByInterests builds on fetchAllVideos (inherits the filter)', () => {
  assert.match(exportBody('services/backendService.ts', 'export const fetchVideosByInterests ='), /fetchAllVideos\(\)/);
});

test('album-published gallery videos inherit the album schedule (no early leak) and stay quiet for the video sweep', () => {
  const s = src('services/backendService.ts');
  assert.match(s, /albumSchedule[\s\S]{0,300}releaseAnnouncement: \{ enabled: false \}/);
  assert.match(s, /setDoc\(doc\(db, videosCollectionPath, v\.id\), \{ \.\.\.v, \.\.\.albumSchedule \}\)/);
});

// uploadVideo: a scheduled upload must NOT notify followers; the release sweep announces it at release.
test('uploadVideo persists the schedule and skips the immediate follower notification for it', () => {
  const b = exportBody('services/backendService.ts', 'export const uploadVideo =');
  assert.match(b, /scheduledRelease = video\.isScheduled === true && typeof video\.releaseDate === 'number' && video\.releaseDate > Date\.now\(\)/);
  assert.match(b, /isScheduled: true, releaseDate: scheduledRelease, releaseAnnouncement:/);
  assert.equal((b.match(/notifyFollowers\(/g) || []).length, 1);
  assert.match(b, /if \(!newVideo\.isPrivate && !scheduledRelease\) \{\s*notifyFollowers\(/);
});

test('rescheduleVideo: owner-only; publish-now notifies once, only if it was still pending', () => {
  const body = exportBody('services/backendService.ts', 'export const rescheduleVideo =');
  assert.match(body, /ownerId !== auth\.currentUser\.uid/);
  assert.match(body, /const wasPending = isFutureReleaseVideo\(v\)/);
  assert.match(body, /if \(wasPending && !v\.isPrivate\) \{\s*notifyFollowers\(/);
  assert.equal((body.match(/notifyFollowers\(/g) || []).length, 1);
  assert.match(body, /isScheduled: false, releaseDate: deleteField\(\)/);
});

test('uploaders offer Release later and the owner can edit or cancel it', () => {
  assert.match(src('components/VideoTab.tsx'), /<ReleaseLaterField/);
  assert.match(src('components/VideoManager.tsx'), /<ReleaseLaterField/);
  assert.match(src('components/VideoManager.tsx'), /<ScheduleEditor/);
  assert.match(src('components/VideoManager.tsx'), /rescheduleVideo\(video\.id, \{ publishNow: true \}\)/);
  assert.match(src('components/release/ReleaseLaterField.tsx'), /<ReleaseAnnouncementField/);
  assert.match(src('components/AlbumCreator.tsx'), /isScheduled: true, releaseDate: new Date\(releaseDate\)\.getTime\(\)/);   // Reello UGC upload
});

test('premiere behaviour untouched: premiereService does not import the visibility helper', () => {
  assert.doesNotMatch(src('services/premiereService.ts'), /releases\/visibility/);
});
