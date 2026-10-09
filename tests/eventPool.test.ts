// Event Photo Pools v2 — pure rules (window, geofence, EXIF/MP4 metadata + scrubbing, matching, visibility, dedupe)
// and the server flow against in-memory Firestore. No network, no real uploads, no real geocoding.
// Run: npx tsx --test tests/eventPool.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventWindow, isInWindow, poolPhase, uploadsOpen, distanceMeters, clampRadius, isInsideFence, isCheckInEligible, matchesEvent,
  parseExifDateTime, wallTimeToEpoch, canSeeItem, listForViewer, dedupeByHash, toItemView, canChangeVisibility, canHide, canContribute,
  cleanItemInput, cleanPoolSettings, applyOverrides, checkMediaFile, isOwnPoolMediaUrl, storagePathOf, toPoolView,
  HOUR, MIN, DAY, RADIUS_DEFAULT_M, RADIUS_MIN_M, RADIUS_MAX_M, UPLOAD_GRACE_MS,
  type PoolItem, type PoolMeta, type Geofence,
} from '../services/eventPool/poolCore';
import { readJpegMeta, scrubJpegLocation, readMp4Meta, mp4LocationPatchOffsets, parseIso6709, hasEmbeddedMetadataChunk } from '../services/eventPool/exif';
import { registerPoolRoutes, nominatimGeocoder, googleGeocoder } from '../services/eventPool/poolServer';

const START = Date.UTC(2026, 9, 24, 22, 0, 0); // 6 pm EDT, Oct 24 2026
const END = START + 4 * HOUR;
const VENUE = { lat: 40.7128, lng: -74.006 };
const fence: Geofence = { ...VENUE, radiusM: 250 };
const north = (m: number) => ({ lat: VENUE.lat + m / 111_195, lng: VENUE.lng }); // ~metres due north

// ── fixtures ────────────────────────────────────────────────────────────────

const u16le = (v: number) => [v & 255, (v >> 8) & 255];
const u32le = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const str = (s: string) => [...s].map(c => c.charCodeAt(0));
const ent = (tag: number, type: number, count: number, value: number[]) => [...u16le(tag), ...u16le(type), ...u32le(count), ...value, ...new Array(4 - value.length).fill(0)];

/** A minimal JPEG with an EXIF block (little-endian TIFF), optional GPS, optional XMP, then SOS + "image data". */
function buildJpeg(o: { dt: string; offset?: string; lat?: number; lng?: number; orientation?: number; xmp?: boolean }): Uint8Array {
  const IFD0 = 8, EXIF = 50, GPS = 80, DATA = 134;
  const DT = DATA, OFF = DATA + 20, LAT = DATA + 28, LNG = DATA + 52, TOTAL = DATA + 76;
  const t = new Array(TOTAL).fill(0);
  const put = (at: number, bytes: number[]) => bytes.forEach((b, i) => { t[at + i] = b; });
  put(0, [...str('II'), 42, 0, ...u32le(IFD0)]);
  put(IFD0, [...u16le(3), ...ent(0x0112, 3, 1, u16le(o.orientation ?? 6)), ...ent(0x8769, 4, 1, u32le(EXIF)), ...ent(o.lat !== undefined ? 0x8825 : 0x9999, 4, 1, u32le(GPS)), ...u32le(0)]);
  put(EXIF, [...u16le(2), ...ent(0x9003, 2, 20, u32le(DT)), ...ent(o.offset ? 0x9011 : 0x9010, 2, 7, u32le(OFF)), ...u32le(0)]);
  const dms = (v: number) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 1000); return [...u32le(d), ...u32le(1), ...u32le(m), ...u32le(1), ...u32le(s), ...u32le(1000)]; };
  if (o.lat !== undefined && o.lng !== undefined) {
    put(GPS, [...u16le(4), ...ent(1, 2, 2, [o.lat < 0 ? 83 : 78, 0]), ...ent(2, 5, 3, u32le(LAT)), ...ent(3, 2, 2, [o.lng < 0 ? 87 : 69, 0]), ...ent(4, 5, 3, u32le(LNG)), ...u32le(0)]);
    put(LAT, dms(o.lat)); put(LNG, dms(o.lng));
  }
  put(DT, [...str(o.dt), 0]);
  put(OFF, [...str(o.offset || '+00:00'), 0]);
  const app1 = [...str('Exif'), 0, 0, ...t];
  const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255, ...payload];
  const xmp = o.xmp ? seg(0xe1, [...str('http://ns.adobe.com/xap/1.0/'), 0, ...str('<x:xmpmeta><exif:GPSLatitude>40,42.77N</exif:GPSLatitude></x:xmpmeta>')]) : [];
  return new Uint8Array([0xff, 0xd8, ...seg(0xe1, app1), ...xmp, ...seg(0xdb, [0, 1, 2, 3]), ...seg(0xda, [1, 2, 3, 4, 5, 6]), 9, 8, 7, 6, 5, 0xff, 0xd9]);
}

const be32 = (v: number) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
const box = (type: number[] | string, ...payload: number[][]) => { const p = payload.flat(); const ty = typeof type === 'string' ? str(type) : type; return [...be32(8 + p.length), ...ty, ...p]; };

/** A minimal QuickTime file: mvhd time, Android ©xyz, Apple keys (location + creationdate), a track udta. */
function buildMov(o: { macSeconds: number; xyz?: string; appleLoc?: string; appleDate?: string }): Uint8Array {
  const mvhd = box('mvhd', [0, 0, 0, 0], be32(o.macSeconds), be32(o.macSeconds), be32(600), be32(600 * 12), new Array(80).fill(0));
  const xyz = o.xyz ? box([0xa9, ...str('xyz')], [(o.xyz.length >> 8) & 255, o.xyz.length & 255, 0x15, 0xc7], str(o.xyz)) : [];
  const udta = box('udta', xyz);
  const keyNames = ['com.apple.quicktime.location.ISO6709', 'com.apple.quicktime.creationdate'];
  const keys = box('keys', [0, 0, 0, 0], be32(keyNames.length), ...keyNames.map(k => [...be32(8 + k.length), ...str('mdta'), ...str(k)]));
  const dataBox = (v: string) => box('data', be32(1), be32(0), str(v));
  const ilst = box('ilst', ...(o.appleLoc ? [box(be32(1), dataBox(o.appleLoc))] : []), ...(o.appleDate ? [box(be32(2), dataBox(o.appleDate))] : []));
  const meta = box('meta', box('hdlr', new Array(24).fill(0)), keys, ilst);
  const trak = box('trak', box('tkhd', new Array(84).fill(0)), box('udta', box('name', str('cam'))));
  const moov = box('moov', mvhd, udta, meta, trak);
  return new Uint8Array([...box('ftyp', str('qt  '), be32(0)), ...box('mdat', new Array(64).fill(7)), ...moov]);
}
const readAtOf = (b: Uint8Array) => async (o: number, n: number) => b.subarray(o, o + n);
const toMac = (ms: number) => Math.floor(ms / 1000) + 2_082_844_800;

// ── window + geofence ───────────────────────────────────────────────────────

describe('event window', () => {
  test('start − 60 min → end + 2 h; no end means start + 5 h', () => {
    const w = eventWindow(START, END)!;
    assert.equal(w.start, START - 60 * MIN); assert.equal(w.end, END + 2 * HOUR);
    const open = eventWindow(START)!;
    assert.equal(open.end, START + 5 * HOUR + 2 * HOUR);
    assert.equal(eventWindow(START, START - 1)!.end, START + 7 * HOUR, 'an end before the start is ignored');
    assert.equal(eventWindow(undefined), null);
    assert.ok(eventWindow(START, START + 30 * DAY)!.end <= START + 3 * DAY + 2 * HOUR, 'runaway multi-week events are capped');
  });
  test('edges are inclusive and phases line up', () => {
    const w = eventWindow(START, END)!;
    assert.equal(isInWindow(w, w.start), true); assert.equal(isInWindow(w, w.end), true);
    assert.equal(isInWindow(w, w.start - 1), false); assert.equal(isInWindow(w, w.end + 1), false);
    assert.equal(poolPhase(w, w.start - 1), 'upcoming'); assert.equal(poolPhase(w, START), 'open'); assert.equal(poolPhase(w, w.end + 1), 'closed');
    assert.equal(poolPhase(null, START), 'unscheduled');
    assert.equal(uploadsOpen(w, w.end + UPLOAD_GRACE_MS - 1), true); assert.equal(uploadsOpen(w, w.end + UPLOAD_GRACE_MS + 1), false);
    assert.equal(uploadsOpen(w, w.start - 1), false); assert.equal(uploadsOpen(w, w.start - 1, true), true, 'hosts can always add');
  });
});

describe('geofence', () => {
  test('haversine distance and radius clamps', () => {
    assert.ok(Math.abs(distanceMeters(VENUE, north(100)) - 100) < 0.5);
    assert.ok(Math.abs(distanceMeters({ lat: 51.5007, lng: -0.1246 }, { lat: 40.6892, lng: -74.0445 }) - 5_574_840) < 5_000, 'London → New York ≈ 5575 km');
    assert.equal(clampRadius(undefined), RADIUS_DEFAULT_M); assert.equal(clampRadius(10), RADIUS_MIN_M); assert.equal(clampRadius(99_999), RADIUS_MAX_M); assert.equal(clampRadius(400), 400);
    assert.equal(isInsideFence(fence, north(240)), true); assert.equal(isInsideFence(fence, north(260)), false); assert.equal(isInsideFence(fence, north(260), 20), true);
  });
  test('check-in needs the window AND the fence; GPS accuracy helps but only up to 150 m', () => {
    const pool = { window: eventWindow(START, END), fence };
    assert.equal(isCheckInEligible(pool, { ...north(100), accuracy: 20 }, START).ok, true);
    assert.deepEqual(isCheckInEligible(pool, { ...north(100) }, START - 2 * HOUR), { ok: false, reason: 'not_open' });
    assert.equal((isCheckInEligible(pool, { ...north(100) }, END + 3 * HOUR) as any).reason, 'closed');
    assert.equal((isCheckInEligible(pool, { ...north(600), accuracy: 30 }, START) as any).reason, 'outside');
    assert.equal(isCheckInEligible(pool, { ...north(380), accuracy: 140 }, START).ok, true, '380 m with 140 m accuracy is within 250 + 140');
    assert.equal(isCheckInEligible(pool, { ...north(450), accuracy: 900 }, START).ok, false, 'allowance is capped at 150 m');
    assert.equal((isCheckInEligible(pool, { ...north(10), accuracy: 5000 }, START) as any).reason, 'inaccurate');
    assert.equal((isCheckInEligible({ window: pool.window, fence: null }, VENUE, START) as any).reason, 'no_place');
    assert.equal((isCheckInEligible({ window: null, fence }, VENUE, START) as any).reason, 'no_schedule');
    assert.equal((isCheckInEligible(pool, { lat: NaN, lng: 1 }, START) as any).reason, 'bad_position');
  });
});

// ── metadata ────────────────────────────────────────────────────────────────

describe('JPEG EXIF', () => {
  test('reads capture time, offset, GPS (with hemisphere signs) and orientation', () => {
    const m = readJpegMeta(buildJpeg({ dt: '2026:10:24 18:30:05', offset: '-04:00', lat: 40.7128, lng: -74.006, orientation: 6 }));
    assert.equal(m.dateTimeOriginal, '2026:10:24 18:30:05'); assert.equal(m.offsetTimeOriginal, '-04:00'); assert.equal(m.orientation, 6);
    assert.ok(m.gps && Math.abs(m.gps.lat - 40.7128) < 1e-4 && Math.abs(m.gps.lng + 74.006) < 1e-4);
    const south = readJpegMeta(buildJpeg({ dt: '2026:01:01 10:00:00', lat: -33.8688, lng: 151.2093 }));
    assert.ok(south.gps!.lat < 0 && south.gps!.lng > 0);
    assert.equal(readJpegMeta(buildJpeg({ dt: '2026:01:01 10:00:00' })).gps, undefined);
    assert.deepEqual(readJpegMeta(new Uint8Array([1, 2, 3])), { hasGps: false, hasXmp: false }, 'junk is not a crash');
  });
  test('capture time: explicit offset wins; otherwise the event time zone (DST-aware)', () => {
    assert.equal(parseExifDateTime('2026:10:24 18:30:05', '-04:00'), Date.UTC(2026, 9, 24, 22, 30, 5));
    assert.equal(parseExifDateTime('2026:10:24 18:30:05', undefined, 'America/New_York'), Date.UTC(2026, 9, 24, 22, 30, 5), 'EDT = UTC−4');
    assert.equal(parseExifDateTime('2026:12:24 18:30:05', undefined, 'America/New_York'), Date.UTC(2026, 11, 24, 23, 30, 5), 'EST = UTC−5');
    assert.equal(wallTimeToEpoch([2026, 7, 1, 12, 0, 0], 'Europe/London'), Date.UTC(2026, 6, 1, 11, 0, 0));
    assert.equal(parseExifDateTime('0000:00:00 00:00:00'), undefined);
    assert.equal(parseExifDateTime('garbage'), undefined);
  });
  test('scrub empties GPS and drops XMP, keeps time, orientation and image bytes', () => {
    const src = buildJpeg({ dt: '2026:10:24 18:30:05', offset: '-04:00', lat: 40.7128, lng: -74.006, xmp: true });
    assert.equal(readJpegMeta(src).hasXmp, true);
    const { bytes, changed } = scrubJpegLocation(src);
    assert.equal(changed, true);
    const after = readJpegMeta(bytes);
    assert.equal(after.gps, undefined); assert.equal(after.hasGps, false); assert.equal(after.hasXmp, false);
    assert.equal(after.dateTimeOriginal, '2026:10:24 18:30:05'); assert.equal(after.orientation, 6);
    assert.ok(!Buffer.from(bytes).toString('latin1').includes('GPSLatitude'));
    assert.deepEqual([...bytes.slice(-8)], [...src.slice(-8)], 'image data untouched');
    assert.equal(src.length - bytes.length > 0, true);
    assert.equal(readJpegMeta(src).gps !== undefined, true, 'the source buffer is not mutated');
    assert.equal(scrubJpegLocation(buildJpeg({ dt: '2026:10:24 18:30:05' })).changed, false);
  });
  test('PNG / WebP metadata chunks are detected', () => {
    const png = new Uint8Array([0x89, ...str('PNG'), 13, 10, 26, 10, 0, 0, 0, 4, ...str('eXIf'), 1, 2, 3, 4, 0, 0, 0, 0]);
    assert.equal(hasEmbeddedMetadataChunk(png), true);
    const plain = new Uint8Array([0x89, ...str('PNG'), 13, 10, 26, 10, 0, 0, 0, 0, ...str('IDAT'), 0, 0, 0, 0]);
    assert.equal(hasEmbeddedMetadataChunk(plain), false);
  });
});

describe('MP4 / MOV metadata', () => {
  test('ISO-6709 parsing', () => {
    assert.deepEqual(parseIso6709('+40.7128-074.0060+010.000/'), { lat: 40.7128, lng: -74.006 });
    assert.equal(parseIso6709('nonsense'), undefined);
  });
  test('reads Apple location + local creation date, Android ©xyz, and mvhd time', async () => {
    const t = START + 30 * MIN;
    const mov = buildMov({ macSeconds: toMac(t + 7 * HOUR), xyz: '+51.5007-000.1246/', appleLoc: '+40.7128-074.0060+010.000/', appleDate: '2026-10-24T18:30:00-0400' });
    const m = await readMp4Meta(readAtOf(mov), mov.length);
    assert.deepEqual(m.gps, { lat: 40.7128, lng: -74.006 }, 'Apple key wins over ©xyz');
    assert.equal(m.createdAt, t, 'Apple creationdate (with offset) wins over mvhd');
    assert.equal(m.durationSec, 12);
    const android = buildMov({ macSeconds: toMac(t), xyz: '+51.5007-000.1246/' });
    const a = await readMp4Meta(readAtOf(android), android.length);
    assert.deepEqual(a.gps, { lat: 51.5007, lng: -0.1246 }); assert.equal(a.createdAt, Math.floor(t / 1000) * 1000);
  });
  test('location patch renames udta/meta to free without moving bytes', async () => {
    const mov = buildMov({ macSeconds: toMac(START), xyz: '+51.5007-000.1246/', appleLoc: '+40.7128-074.0060/' });
    const offs = await mp4LocationPatchOffsets(readAtOf(mov), mov.length);
    assert.equal(offs.length, 3, 'moov/udta, moov/meta, trak/udta');
    const patched = new Uint8Array(mov);
    for (const o of offs) patched.set(str('free'), o);
    assert.equal(patched.length, mov.length);
    const m = await readMp4Meta(readAtOf(patched), patched.length);
    assert.equal(m.gps, undefined);
    assert.equal(m.createdAt, Math.floor(START / 1000) * 1000, 'mvhd time survives');
  });
});

// ── matching ────────────────────────────────────────────────────────────────

describe('matching picked media to the event', () => {
  const pool = { window: eventWindow(START, END), fence };
  test('time inside matches; time or place outside never does', () => {
    assert.equal(matchesEvent({ takenAt: START + HOUR, takenAtSource: 'exif' }, pool).match, true);
    const early = matchesEvent({ takenAt: START - 3 * DAY, takenAtSource: 'exif' }, pool);
    assert.equal(early.match, false); assert.match(early.why, /3 days before/);
    assert.equal(matchesEvent({ takenAt: START + HOUR, takenAtSource: 'exif', gps: north(5000) }, pool).match, false);
    assert.equal(matchesEvent({ takenAt: START + HOUR, takenAtSource: 'exif', gps: north(100) }, pool).why, 'Taken at the event');
  });
  test('place alone is enough when time is unknown; nothing known is not pre-selected', () => {
    assert.equal(matchesEvent({ takenAtSource: 'none', gps: north(100) }, pool).match, true);
    assert.equal(matchesEvent({ takenAtSource: 'none' }, pool).match, false);
    assert.equal(matchesEvent({ takenAtSource: 'none' }, { window: null, fence: null }).match, true, 'unscheduled pool = shared album');
    assert.equal(matchesEvent({ takenAtSource: 'exif', takenAt: START, gps: north(9000) }, { window: pool.window, fence: null }).match, true, 'hidden fence → place unknown');
  });
});

// ── visibility ──────────────────────────────────────────────────────────────

const item = (o: Partial<PoolItem>): PoolItem => ({
  id: 'i' + Math.random(), poolId: 'pool_abc', ownerUid: 'g1', kind: 'photo', mime: 'image/jpeg', bytes: 10, url: 'u', storagePaths: ['personal/g1/x'],
  takenAtSource: 'exif', hash: 'a'.repeat(64), matched: { time: 'in', place: 'unknown' }, locationScrubbed: true, visibility: 'private',
  hiddenByHost: false, createdAt: 1, updatedAt: 1, ...o,
});

describe('visibility rules', () => {
  test('private is uploader-only — hosts included', () => {
    const p = item({ visibility: 'private' });
    assert.equal(canSeeItem(p, { uid: 'g1', isHost: false }), true);
    assert.equal(canSeeItem(p, { uid: 'host1', isHost: true }), false);
    assert.equal(canSeeItem(p, { uid: null, isHost: false }), false);
  });
  test('hidden public items: host and uploader only', () => {
    const h = item({ visibility: 'public', hiddenByHost: true });
    assert.equal(canSeeItem(h, { uid: null, isHost: false }), false);
    assert.equal(canSeeItem(h, { uid: 'host1', isHost: true }), true);
    assert.equal(canSeeItem(h, { uid: 'g1', isHost: false }), true);
  });
  test('public tab dedupes identical content; mine tab shows both of mine', () => {
    const h = 'b'.repeat(64);
    const all = [item({ id: 'x', ownerUid: 'g2', visibility: 'public', hash: h, createdAt: 5 }), item({ id: 'y', ownerUid: 'g1', visibility: 'public', hash: h, createdAt: 3 }), item({ id: 'z', visibility: 'private', hash: 'c'.repeat(64) })];
    assert.deepEqual(listForViewer(all, { uid: null, isHost: false }, 'public').map(i => i.id), ['y']);
    assert.deepEqual(listForViewer(all, { uid: 'g1', isHost: false }, 'mine').map(i => i.id).sort(), ['y', 'z']);
    assert.deepEqual(listForViewer(all, { uid: null, isHost: false }, 'mine'), []);
    assert.equal(dedupeByHash(all).length, 2);
  });
  test('a hidden duplicate does not hide the visible copy', () => {
    const h = 'd'.repeat(64);
    const all = [item({ id: 'old', visibility: 'public', hash: h, createdAt: 1, hiddenByHost: true }), item({ id: 'new', ownerUid: 'g2', visibility: 'public', hash: h, createdAt: 2 })];
    assert.deepEqual(listForViewer(all, { uid: null, isHost: false }, 'public').map(i => i.id), ['new']);
  });
  test('who may change what', () => {
    assert.equal(canChangeVisibility(item({}), 'g1', 'public'), null);
    assert.match(canChangeVisibility(item({}), 'host1', 'public')!, /Only the person/);
    assert.match(canChangeVisibility(item({ locationScrubbed: false }), 'g1', 'public')!, /location/);
    const meta = { hostUids: ['host1'] };
    assert.equal(canHide(meta, item({ visibility: 'public' }), 'host1'), null);
    assert.match(canHide(meta, item({ visibility: 'public' }), 'g1')!, /Only the host/);
    assert.match(canHide(meta, item({ visibility: 'private' }), 'host1')!, /Only public/);
  });
  test('item view never leaks storage paths or moderator ids to others', () => {
    const it = item({ visibility: 'public', hiddenByHost: true, hiddenBy: 'host1' });
    const other = toItemView(it, { uid: 'g9', isHost: false }) as any;
    assert.equal(other.storagePaths, undefined); assert.equal(other.hiddenBy, undefined); assert.equal(other.hiddenByHost, undefined);
    assert.deepEqual((toItemView(it, { uid: 'g1', isHost: false }) as any).storagePaths, ['personal/g1/x']);
  });
  test('contribution policy', () => {
    const meta = { hostUids: ['host1'], uploadPolicy: 'checked_in' as const, window: eventWindow(START, END) };
    assert.match(canContribute(meta, null, false, START)!, /Sign in/);
    assert.match(canContribute(meta, 'g1', false, START)!, /checked in/);
    assert.equal(canContribute(meta, 'g1', true, START), null);
    assert.equal(canContribute(meta, 'host1', false, START - 5 * DAY), null);
    assert.equal(canContribute({ ...meta, uploadPolicy: 'link' }, 'g1', false, START), null);
  });
});

describe('input validation', () => {
  const url = (uid: string, name: string, pool = 'pool_abc', bucket = 'bkt') => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(`personal/${uid}/event-pools/${pool}/${name}`)}?alt=media&token=t`;
  const ctx = { uid: 'g1', poolId: 'pool_abc', bucket: 'bkt', now: START + HOUR, window: eventWindow(START, END) };
  const base = { hash: 'e'.repeat(64), mime: 'image/jpeg', bytes: 1000, url: url('g1', 'a.webp'), thumbUrl: url('g1', 'a_thumb.webp'), takenAt: START + 30 * MIN, takenAtSource: 'exif' };
  test('media must live in the caller’s own pool folder in our bucket', () => {
    assert.equal(isOwnPoolMediaUrl(url('g1', 'a.jpg'), 'g1', 'pool_abc', 'bkt'), true);
    assert.equal(isOwnPoolMediaUrl(url('g2', 'a.jpg'), 'g1', 'pool_abc', 'bkt'), false);
    assert.equal(isOwnPoolMediaUrl(url('g1', 'a.jpg', 'pool_other'), 'g1', 'pool_abc', 'bkt'), false);
    assert.equal(isOwnPoolMediaUrl(url('g1', 'a.jpg', 'pool_abc', 'evil'), 'g1', 'pool_abc', 'bkt'), false);
    assert.equal(isOwnPoolMediaUrl(url('g1', '../../g2/x.jpg'), 'g1', 'pool_abc', 'bkt'), false);
    assert.equal(storagePathOf('https://example.com/v0/b/bkt/o/x'), null);
    assert.equal(cleanItemInput({ ...base, thumbUrl: url('g2', 'x.webp') }, ctx).ok, false);
  });
  test('private by default; GPS-carrying files can never start public; server re-derives the time verdict', () => {
    const a = cleanItemInput(base, ctx) as any;
    assert.equal(a.ok, true); assert.equal(a.value.visibility, 'private'); assert.equal(a.value.matched.time, 'in');
    assert.deepEqual(a.value.storagePaths.length, 2);
    assert.equal((cleanItemInput({ ...base, visibility: 'public' }, ctx) as any).value.visibility, 'public');
    assert.equal((cleanItemInput({ ...base, visibility: 'public', locationScrubbed: false }, ctx) as any).value.visibility, 'private');
    assert.equal((cleanItemInput({ ...base, takenAt: START - 9 * DAY, matched: { time: 'in' } }, ctx) as any).value.matched.time, 'out');
    assert.equal(cleanItemInput({ ...base, mime: 'application/pdf' }, ctx).ok, false);
    assert.equal(cleanItemInput({ ...base, hash: 'nope' }, ctx).ok, false);
  });
  test('file type and size caps', () => {
    assert.equal(checkMediaFile({ type: 'video/quicktime', size: 10 }), null);
    assert.equal(checkMediaFile({ type: '', size: 10, name: 'IMG_1.HEIC' }), null);
    assert.match(checkMediaFile({ type: 'video/mp4', size: 600 * 1024 * 1024 })!, /500 MB/);
    assert.match(checkMediaFile({ type: 'application/zip', size: 10 })!, /Only photos/);
  });
  test('host settings and overrides', () => {
    const meta = { overrides: {} } as PoolMeta;
    assert.equal(cleanPoolSettings({ visibility: 'everyone' }, meta).ok, false);
    const ok = cleanPoolSettings({ uploadPolicy: 'checked_in', overrides: { lat: 40.7, lng: -74, radiusM: 5 } }, meta) as any;
    assert.equal(ok.value.overrides.radiusM, RADIUS_MIN_M);
    const applied = applyOverrides({ window: eventWindow(START, END), fence: null }, ok.value.overrides);
    assert.equal(applied.fenceSource, 'host'); assert.equal(applied.fence!.radiusM, RADIUS_MIN_M);
    const moved = applyOverrides({ window: eventWindow(START, END), fence }, { start: START + DAY });
    assert.equal(moved.window!.eventStart, START + DAY); assert.equal(moved.window!.eventEnd - moved.window!.eventStart, END - START, 'keeps the length');
  });
});

// ── server flow ─────────────────────────────────────────────────────────────

function harness(opts: { addressPrivate?: boolean; withEvite?: boolean; geocode?: boolean } = {}) {
  const db = new Map<string, Record<string, any>>();
  const routes: Record<string, any[]> = {};
  let clock = START;
  const geocodeCalls: string[] = [];
  const reg = (m: string) => (path: string, ...h: any[]) => { routes[`${m} ${path}`] = h; };
  const app = { get: reg('GET'), post: reg('POST') };
  const pass = (_q: any, _s: any, n: any) => n();
  const deps = {
    app, express: { json: () => pass }, rateLimit: () => pass,
    // Mirrors server.ts: no bearer/uid → 401.
    authMiddleware: (q: any, s: any, n: any) => (q.uid ? n() : s.status(401).json({ error: 'Unauthorized' })),
    verifyIdToken: async (t: string) => (t.startsWith('tok-') ? { uid: t.slice(4) } : null),
    firestoreRead: async (c: string, id: string) => db.get(`${c}/${id}`) || null,
    firestoreWrite: async (c: string, id: string, data: any) => { db.set(`${c}/${id}`, { ...(db.get(`${c}/${id}`) || {}), ...data }); },
    firestoreCreateOnce: async (c: string, id: string, data: any) => { if (db.has(`${c}/${id}`)) return 'exists' as const; db.set(`${c}/${id}`, data); return 'created' as const; },
    firestoreDeleteDoc: async (c: string, id: string) => { db.delete(`${c}/${id}`); },
    fsQueryDocs: async (c: string, f: any[]) => [...db.entries()].filter(([k, v]) => k.startsWith(c + '/') && f.every(x => v[x.field] === x.value)).map(([k, v]) => ({ id: k.slice(c.length + 1), data: v })),
    geocode: opts.geocode === false ? undefined : async (q: string) => { geocodeCalls.push(q); return VENUE; },
    storageBucket: 'bkt',
    now: () => clock,
  };
  registerPoolRoutes(deps as any);
  db.set('event_photo_pools/pool_abc', { id: 'pool_abc', ownerId: 'host1', title: 'Max is six · photos', eventId: '' });
  if (opts.withEvite !== false) {
    const inv = { id: 'abcd2345', ownerUid: 'host1', coHostUids: ['co1'], photoPoolId: 'pool_abc', status: 'live', fields: { headline: 'Max is six', startsAt: START, endsAt: END, timezone: 'America/New_York', venueName: 'The Yard', address: '12 Elm St, New York' }, settings: { revealAddressAfterYes: opts.addressPrivate !== false } };
    db.set('evites/abcd2345', { ownerUid: 'host1', status: 'live', json: JSON.stringify(inv) });
  }
  db.set('users/g1', { displayName: 'Pat' });
  const call = async (key: string, req: any) => {
    let status = 200, body: any; const headers: any = {};
    const res: any = { status(c: number) { status = c; return this; }, json(b: any) { body = b; return this; }, send(b: any) { body = b; return this; }, set(h: any) { Object.assign(headers, h); return this; }, type() { return this; } };
    const r = { params: { id: 'pool_abc' }, query: {}, body: {}, headers: {}, ...req };
    const chain = routes[key];
    assert.ok(chain, `route ${key} registered`);
    let i = 0;
    const next = async (): Promise<void> => { const h = chain[i++]; if (h) await h(r, res, next); };
    await next();
    return { status, body, headers };
  };
  const mediaUrl = (uid: string, name: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(`personal/${uid}/event-pools/pool_abc/${name}`)}?alt=media&token=t`;
  const addBody = (uid: string, hash: string, extra: any = {}) => ({ hash, mime: 'image/jpeg', bytes: 2048, url: mediaUrl(uid, `${hash.slice(0, 8)}.webp`), originalUrl: mediaUrl(uid, `${hash.slice(0, 8)}_original.jpg`), takenAt: START + 45 * MIN, takenAtSource: 'exif', ...extra });
  return { db, call, deps, geocodeCalls, setNow: (t: number) => { clock = t; }, addBody, mediaUrl };
}

describe('server flow', () => {
  test('link-holders can read without signing in; private address keeps the fence centre hidden; geocode is cached', async () => {
    const h = harness();
    const a = await h.call('GET /api/pool/:id', {});
    assert.equal(a.status, 200);
    const p = a.body.pool;
    assert.equal(p.title, 'Max is six · photos'); assert.equal(p.phase, 'open'); assert.equal(p.source.kind, 'evite');
    assert.equal(p.hasFence, true); assert.equal(p.fence, null, 'address is private → no centre for guests');
    assert.equal(p.isHost, false); assert.equal(p.me, null); assert.equal(p.placeLabel, 'The Yard');
    assert.ok(!JSON.stringify(p).includes('12 Elm'), 'street address never leaves the server');
    const host = (await h.call('GET /api/pool/:id', { headers: { authorization: 'Bearer tok-host1' } })).body.pool;
    assert.equal(host.isHost, true); assert.deepEqual(host.fence, { ...VENUE, radiusM: 250 });
    assert.equal((await h.call('GET /api/pool/:id', { uid: 'co1' })).body.pool.isHost, true, 'evite co-hosts are hosts');
    assert.equal(h.geocodeCalls.length, 1, 'geocoded once, then cached');
    // Force a re-resolve (as after the 10-minute cache TTL):
    h.db.set('pool_meta/pool_abc', { ...h.db.get('pool_meta/pool_abc')!, json: JSON.stringify({ ...JSON.parse(h.db.get('pool_meta/pool_abc')!.json), resolvedAt: 0 }) });
    await h.call('GET /api/pool/:id', {});
    assert.equal(h.geocodeCalls.length, 1, 'same address → no second geocode after re-resolve');
    assert.equal((await h.call('GET /api/pool/:id', { params: { id: 'nope_123' } })).status, 404);
    assert.equal((await h.call('GET /api/pool/:id', { params: { id: '../x' } })).status, 404);
  });

  test('check-in: auth required, window + fence enforced, coordinates never stored, fence revealed after', async () => {
    const h = harness();
    assert.equal((await h.call('POST /api/pool/:id/checkin', { body: { ...VENUE } })).status, 401);
    assert.equal((await h.call('POST /api/pool/:id/checkin', { uid: 'anon', isAnonymous: true, body: { ...VENUE } })).status, 403);
    h.setNow(START - 3 * HOUR);
    const early = await h.call('POST /api/pool/:id/checkin', { uid: 'g1', body: { ...VENUE, accuracy: 10 } });
    assert.equal(early.status, 409); assert.equal(early.body.reason, 'not_open');
    h.setNow(START + 30 * MIN);
    const far = await h.call('POST /api/pool/:id/checkin', { uid: 'g1', body: { ...north(2000), accuracy: 10 } });
    assert.equal(far.status, 409); assert.equal(far.body.reason, 'outside');
    assert.equal(far.body.distanceM, undefined, 'no distance oracle when the address is private');
    const ok = await h.call('POST /api/pool/:id/checkin', { uid: 'g1', body: { ...north(120), accuracy: 15 } });
    assert.equal(ok.status, 200); assert.equal(ok.body.checkedIn, true);
    assert.deepEqual(ok.body.pool.fence, { ...VENUE, radiusM: 250 }, 'checked-in guests see the venue pin');
    const row = h.db.get('pool_checkins/pool_abc_g1')!;
    assert.equal(JSON.parse(row.json).name, 'Pat');
    const stored = JSON.stringify(row);
    assert.ok(!/lat|lng|40\.71|-74\.0|accuracy/.test(stored), 'no position stored');
    assert.equal((await h.call('POST /api/pool/:id/checkin', { uid: 'g1', body: { ...north(9000) } })).status, 200, 'already checked in');
    const att = await h.call('POST /api/pool/:id/attendance', { uid: 'host1' });
    assert.equal(att.body.count, 1); assert.equal(att.body.attendees[0].name, 'Pat');
    assert.equal((await h.call('POST /api/pool/:id/attendance', { uid: 'g1' })).status, 403);
    assert.equal((await h.call('GET /api/pool/:id', {})).body.pool.counts.attendees, 1);
  });

  test('public address: refused check-ins may say how far', async () => {
    const h = harness({ addressPrivate: false });
    assert.deepEqual((await h.call('GET /api/pool/:id', {})).body.pool.fence, { ...VENUE, radiusM: 250 });
    const far = await h.call('POST /api/pool/:id/checkin', { uid: 'g1', body: { ...north(2000), accuracy: 10 } });
    assert.ok(Math.abs(far.body.distanceM - 2000) < 5);
  });

  test('sync + curation: private by default, owner publishes, host hides, nobody else sees private', async () => {
    const h = harness();
    const H = 'f'.repeat(64);
    assert.equal((await h.call('POST /api/pool/:id/items', { body: h.addBody('g1', H) })).status, 401);
    assert.equal((await h.call('POST /api/pool/:id/items', { uid: 'g1', body: { ...h.addBody('g1', H), url: h.mediaUrl('g2', 'x.webp') } })).status, 400);
    const add = await h.call('POST /api/pool/:id/items', { uid: 'g1', body: h.addBody('g1', H) });
    assert.equal(add.status, 200); assert.equal(add.body.item.visibility, 'private'); assert.equal(add.body.item.ownerName, 'Pat');
    const id = add.body.item.id;
    const dup = await h.call('POST /api/pool/:id/items', { uid: 'g1', body: h.addBody('g1', H) });
    assert.equal(dup.body.duplicate, true);

    const pubAnon = await h.call('GET /api/pool/:id/items', { query: { scope: 'public' } });
    assert.deepEqual(pubAnon.body.items, []);
    assert.deepEqual((await h.call('GET /api/pool/:id/items', { uid: 'host1', query: { scope: 'public' } })).body.items, [], 'host cannot see private items');
    assert.equal((await h.call('GET /api/pool/:id/items', { query: { scope: 'mine' } })).status, 401);
    assert.equal((await h.call('GET /api/pool/:id/items', { uid: 'g2', query: { scope: 'mine' } })).body.items.length, 0);
    const mine = (await h.call('GET /api/pool/:id/items', { uid: 'g1', query: { scope: 'mine' } })).body.items;
    assert.equal(mine.length, 1); assert.equal(mine[0].storagePaths.length, 2);

    assert.equal((await h.call('POST /api/pool/:id/items/:itemId/visibility', { uid: 'host1', params: { id: 'pool_abc', itemId: id }, body: { visibility: 'public' } })).status, 403, 'host cannot publish a guest’s photo');
    assert.equal((await h.call('POST /api/pool/:id/items/:itemId/visibility', { uid: 'g1', params: { id: 'pool_abc', itemId: id }, body: { visibility: 'public' } })).status, 200);
    const nowPublic = (await h.call('GET /api/pool/:id/items', {})).body.items;
    assert.equal(nowPublic.length, 1); assert.equal(nowPublic[0].storagePaths, undefined, 'no storage paths for strangers');
    assert.equal((await h.call('GET /api/pool/:id', {})).body.pool.counts.publicItems, 1);

    assert.equal((await h.call('POST /api/pool/:id/items/:itemId/hide', { uid: 'g2', params: { id: 'pool_abc', itemId: id }, body: { hidden: true } })).status, 403);
    assert.equal((await h.call('POST /api/pool/:id/items/:itemId/hide', { uid: 'host1', params: { id: 'pool_abc', itemId: id }, body: { hidden: true } })).status, 200);
    assert.deepEqual((await h.call('GET /api/pool/:id/items', {})).body.items, []);
    const hostView = (await h.call('GET /api/pool/:id/items', { uid: 'host1' })).body.items;
    assert.equal(hostView.length, 1); assert.equal(hostView[0].hiddenByHost, true);
    assert.equal((await h.call('GET /api/pool/:id/items', { uid: 'g1', query: { scope: 'mine' } })).body.items[0].hiddenByHost, true, 'uploader is told it was hidden');
    // Hidden survives a private → public round trip.
    await h.call('POST /api/pool/:id/items/:itemId/visibility', { uid: 'g1', params: { id: 'pool_abc', itemId: id }, body: { visibility: 'private' } });
    await h.call('POST /api/pool/:id/items/:itemId/visibility', { uid: 'g1', params: { id: 'pool_abc', itemId: id }, body: { visibility: 'public' } });
    assert.deepEqual((await h.call('GET /api/pool/:id/items', {})).body.items, []);
    assert.equal((await h.call('POST /api/pool/:id/items/:itemId/hide', { uid: 'host1', params: { id: 'pool_abc', itemId: id }, body: { hidden: false } })).status, 200);
    assert.equal((await h.call('GET /api/pool/:id/items', {})).body.items.length, 1);

    assert.equal((await h.call('POST /api/pool/:id/items/:itemId/delete', { uid: 'host1', params: { id: 'pool_abc', itemId: id } })).status, 403, 'hosts hide, they don’t delete');
    const del = await h.call('POST /api/pool/:id/items/:itemId/delete', { uid: 'g1', params: { id: 'pool_abc', itemId: id } });
    assert.equal(del.status, 200); assert.equal(del.body.storagePaths.length, 2);
    assert.equal(h.db.has(`pool_items/${id}`), false);
    assert.equal((await h.call('POST /api/pool/:id/items/:itemId/visibility', { uid: 'g1', params: { id: 'pool_abc', itemId: 'other_pool_x' }, body: { visibility: 'public' } })).status, 404, 'item ids are scoped to the pool');
  });

  test('dedupe check tells the client what it can skip', async () => {
    const h = harness();
    const A = '1'.repeat(64), B = '2'.repeat(64), C = '3'.repeat(64);
    await h.call('POST /api/pool/:id/items', { uid: 'g1', body: h.addBody('g1', A) });
    await h.call('POST /api/pool/:id/items', { uid: 'g2', body: h.addBody('g2', B, { visibility: 'public' }) });
    const r = await h.call('POST /api/pool/:id/check', { uid: 'g1', body: { hashes: [A, B, C, 'junk'] } });
    assert.deepEqual(r.body, { mine: [A], pool: [B] });
  });

  test('upload policy, time gates and host settings', async () => {
    const h = harness();
    assert.equal((await h.call('POST /api/pool/:id/settings', { uid: 'g1', body: { uploadPolicy: 'checked_in' } })).status, 403);
    const s = await h.call('POST /api/pool/:id/settings', { uid: 'host1', body: { uploadPolicy: 'checked_in', visibility: 'public', overrides: { radiusM: 500 } } });
    assert.equal(s.status, 200); assert.equal(s.body.pool.uploadPolicy, 'checked_in'); assert.equal(s.body.pool.fenceRadiusM, 500); assert.equal(s.body.pool.visibility, 'public');
    assert.equal((await h.call('POST /api/pool/:id/items', { uid: 'g3', body: h.addBody('g3', '4'.repeat(64)) })).status, 403);
    assert.equal((await h.call('POST /api/pool/:id/items', { uid: 'host1', body: h.addBody('host1', '5'.repeat(64)) })).status, 200);
    h.setNow(START + 60 * DAY);
    await h.call('POST /api/pool/:id/settings', { uid: 'host1', body: { uploadPolicy: 'link' } });
    const late = await h.call('POST /api/pool/:id/items', { uid: 'g1', body: h.addBody('g1', '6'.repeat(64)) });
    assert.equal(late.status, 403); assert.match(late.body.error, /closed/);
    const pin = await h.call('POST /api/pool/:id/settings', { uid: 'host1', body: { overrides: { lat: 34.05, lng: -118.25 } } });
    assert.equal(pin.body.pool.fenceSource, 'host'); assert.equal(pin.body.pool.fence.lat, 34.05);
  });

  test('no evite, no event: an unscheduled shared album without check-in', async () => {
    const h = harness({ withEvite: false });
    const p = (await h.call('GET /api/pool/:id', {})).body.pool;
    assert.equal(p.phase, 'unscheduled'); assert.equal(p.hasFence, false); assert.equal(p.uploadsOpen, true);
    assert.equal((await h.call('POST /api/pool/:id/checkin', { uid: 'g1', body: { ...VENUE } })).body.reason, 'no_schedule');
    assert.equal(h.geocodeCalls.length, 0);
  });

  test('ticketed event: organiser coordinates, no geocoding; creator is a host', async () => {
    const h = harness({ withEvite: false });
    h.db.set('event_photo_pools/pool_abc', { id: 'pool_abc', ownerId: 'host1', title: 'Gala', eventId: 'evt_1' });
    h.db.set('plajahEvents/evt_1', { creatorUid: 'org1', startDate: START, endDate: END, lat: 40.75, lng: -73.99, venueName: 'Hall', timezone: 'America/New_York' });
    const p = (await h.call('GET /api/pool/:id', { uid: 'org1' })).body.pool;
    assert.equal(p.source.kind, 'event'); assert.equal(p.isHost, true); assert.deepEqual(p.fence, { lat: 40.75, lng: -73.99, radiusM: 250 });
    assert.equal(h.geocodeCalls.length, 0);
  });

  test('ensure: host-only, idempotent pool creation for an evite or a ticketed event, linked both ways', async () => {
    const h = harness({ withEvite: false });
    const inv = { id: 'zzzz2345', ownerUid: 'host1', coHostUids: ['co1'], status: 'live', fields: { headline: 'Gala', startsAt: START, endsAt: END, venueName: 'Hall', address: '1 Main St' }, settings: {} };
    h.db.set('evites/zzzz2345', { ownerUid: 'host1', status: 'live', json: JSON.stringify(inv) });
    assert.equal((await h.call('POST /api/pool/ensure', { body: { eviteId: 'zzzz2345' } })).status, 401);
    assert.equal((await h.call('POST /api/pool/ensure', { uid: 'g1', body: { eviteId: 'zzzz2345' } })).status, 403);
    const a = await h.call('POST /api/pool/ensure', { uid: 'co1', body: { eviteId: 'zzzz2345' } });
    assert.equal(a.status, 200); assert.equal(a.body.created, true);
    const poolId = a.body.poolId;
    assert.equal(JSON.parse(h.db.get('evites/zzzz2345')!.json).photoPoolId, poolId);
    assert.equal(h.db.get(`event_photo_pools/${poolId}`)!.ownerId, 'host1', 'owned by the evite owner even when a co-host created it');
    const b = await h.call('POST /api/pool/ensure', { uid: 'host1', body: { eviteId: 'zzzz2345' } });
    assert.deepEqual(b.body, { poolId, created: false });
    const p = (await h.call('GET /api/pool/:id', { params: { id: poolId }, uid: 'co1' })).body.pool;
    assert.equal(p.source.kind, 'evite'); assert.equal(p.isHost, true); assert.equal(p.title, 'Gala · photos'); assert.equal(p.phase, 'open');

    h.db.set('plajahEvents/evt_9', { creatorUid: 'org1', title: 'Show', startDate: START, endDate: END });
    assert.equal((await h.call('POST /api/pool/ensure', { uid: 'host1', body: { eventId: 'evt_9' } })).status, 403);
    const e = await h.call('POST /api/pool/ensure', { uid: 'org1', body: { eventId: 'evt_9' } });
    assert.equal(e.body.created, true); assert.equal(h.db.get('plajahEvents/evt_9')!.photoPoolId, e.body.poolId);
    assert.equal((await h.call('POST /api/pool/ensure', { uid: 'org1', body: { eventId: 'evt_9' } })).body.created, false);
    assert.equal((await h.call('POST /api/pool/ensure', { uid: 'org1', body: {} })).status, 400);
  });

  test('live streams: host attaches any; guests only their own; ended streams only show to hosts', async () => {
    const h = harness();
    h.db.set('streams/strm_host', { title: 'Main stage', ownerName: 'Dana', ownerUid: 'host9', isLive: true });
    h.db.set('streams/strm_g1', { title: 'Pat cam', ownerUid: 'g1', isLive: false });
    h.db.set('streams/strm_linked', { title: 'Linked', ownerUid: 'g7', isLive: true, photoPoolId: 'pool_abc' });
    assert.equal((await h.call('POST /api/pool/:id/streams', { uid: 'g1', body: { streamId: 'strm_host' } })).status, 403);
    assert.equal((await h.call('POST /api/pool/:id/streams', { uid: 'host1', body: { streamId: 'nope_404' } })).status, 404);
    assert.equal((await h.call('POST /api/pool/:id/streams', { uid: 'host1', body: { streamId: 'strm_host' } })).status, 200);
    assert.equal((await h.call('POST /api/pool/:id/streams', { uid: 'g1', body: { streamId: 'strm_g1' } })).status, 200);
    const guest = (await h.call('GET /api/pool/:id', {})).body.pool.streams.map((s: any) => s.id).sort();
    assert.deepEqual(guest, ['strm_host', 'strm_linked'], 'ended stream hidden; photoPoolId-linked stream discovered');
    const host = (await h.call('GET /api/pool/:id', { uid: 'host1' })).body.pool.streams.length;
    assert.equal(host, 3);
    assert.equal((await h.call('POST /api/pool/:id/streams', { uid: 'g2', body: { streamId: 'strm_host', attach: false } })).status, 403);
    assert.equal((await h.call('POST /api/pool/:id/streams', { uid: 'host1', body: { streamId: 'strm_host', attach: false } })).status, 200);
  });
});

describe('nominatim geocoder', () => {
  test('identifies itself, caches, and never calls twice for the same address', async () => {
    const calls: Array<{ url: string; ua: string }> = [];
    const fakeFetch: any = async (url: string, init: any) => { calls.push({ url, ua: init.headers['User-Agent'] }); return { ok: true, json: async () => [{ lat: '40.7128', lon: '-74.0060' }] }; };
    const g = nominatimGeocoder({ userAgent: 'Plajah/1.0 (+https://plajah.com)', email: 'ops@example.com', fetchImpl: fakeFetch, minIntervalMs: 0 });
    const [a, b] = await Promise.all([g('12 Elm St, New York'), g('12  elm st, new york')]);
    assert.deepEqual(a, { lat: 40.7128, lng: -74.006 }); assert.deepEqual(b, a);
    assert.equal(calls.length, 1); assert.equal(calls[0].ua, 'Plajah/1.0 (+https://plajah.com)');
    assert.match(calls[0].url, /format=jsonv2&limit=1&q=12%20Elm%20St/); assert.match(calls[0].url, /email=ops%40example\.com/);
    const none: any = async () => ({ ok: true, json: async () => [] });
    assert.equal(await nominatimGeocoder({ userAgent: 'x', fetchImpl: none, minIntervalMs: 0 })('nowhere'), null);
  });
});

describe('google geocoder (default provider)', () => {
  test('asks the Geocoding API once per address, caches hits and misses, retries on quota errors', async () => {
    const urls: string[] = []; let status = 'OK';
    const fakeFetch: any = async (url: string) => { urls.push(url); return { ok: true, json: async () => status === 'OK' ? { status, results: [{ geometry: { location: { lat: 33.749, lng: -84.388 } } }] } : { status, results: [] } }; };
    const g = googleGeocoder({ apiKey: 'test-key', fetchImpl: fakeFetch });
    assert.deepEqual(await g('12 Elm St, Atlanta'), { lat: 33.749, lng: -84.388 });
    assert.deepEqual(await g('12  elm st, atlanta'), { lat: 33.749, lng: -84.388 });
    assert.equal(urls.length, 1); assert.match(urls[0], /maps\.googleapis\.com\/maps\/api\/geocode\/json\?address=12%20Elm%20St/); assert.match(urls[0], /key=test-key/);
    status = 'OVER_QUERY_LIMIT';
    assert.equal(await g('Somewhere else'), null); assert.equal(await g('Somewhere else'), null);
    assert.equal(urls.length, 3, 'quota errors are not cached');
    status = 'ZERO_RESULTS';
    assert.equal(await g('nowhere at all'), null); assert.equal(await g('nowhere at all'), null);
    assert.equal(urls.length, 4, 'a real miss is cached');
    assert.equal(await googleGeocoder({ apiKey: '', fetchImpl: fakeFetch })('x'), null);
  });
});

describe('pool view', () => {
  test('host-only fields stay with hosts', () => {
    const meta: PoolMeta = { poolId: 'p_1', title: 't', hostUids: ['h'], source: { kind: 'none' }, window: null, fence, addressPrivate: true, visibility: 'guests', uploadPolicy: 'link', streamIds: [], overrides: { radiusM: 300 }, resolvedAt: 1, createdAt: 1, updatedAt: 1 };
    const guest = toPoolView(meta, { uid: 'g', checkedIn: false, now: START, publicItems: 0, attendees: 0, streams: [] });
    assert.equal(guest.overrides, undefined); assert.equal(guest.fence, null);
    assert.deepEqual(toPoolView(meta, { uid: 'h', checkedIn: false, now: START, publicItems: 0, attendees: 0, streams: [] }).overrides, { radiusM: 300 });
  });
});
