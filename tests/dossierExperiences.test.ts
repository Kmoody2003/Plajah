import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EXPERIENCE_CATALOG, applyMuxAsset, buildPassthrough, emptyManifest, experienceToReelloVideo, hallBlockers,
  manifestEntryFrom, manifestEntryToRecord, parsePublicFilm, planUploads, reelloBlockers, selectFilmSource, srtToVtt,
  stripUndefined, toPublicFilm, EXPERIENCE_FILM_PUBLIC_KEYS, catalogFor,
  type ExperienceRecord, type FileFact, type ExperiencesManifest,
} from '../services/dossier/experiences/experienceModel';
import { runUploads, summarizePlan, type MuxUploadClient } from '../services/dossier/experiences/uploader';
import { DOSSIERS } from '../data/dossier/registry';

const SHA = (c: string) => c.repeat(64);
const readyRec = (o: Partial<ExperienceRecord> = {}): ExperienceRecord => ({
  id: 'ford-council', title: 'Henry Ford: the film', description: 'About Ford.', exhibitId: 'henry-ford', kind: 'film', variant: 'council',
  status: 'ready', muxAssetId: 'asset1', muxPlaybackId: 'AbCdEf0123456789', playbackPolicy: 'public', durationSec: 219.17, width: 1920, height: 1080,
  sourceFile: 'docs/dossier/ford-explainer-council.mp4', createdAt: 1, updatedAt: 1, ...o,
});
const facts = (ids: string[], sha = 'a'): Record<string, FileFact> => Object.fromEntries(ids.map(id => [id, { exists: true, sha256: SHA(sha), sizeBytes: 1000 }]));
const allIds = EXPERIENCE_CATALOG.map(c => c.id);

// ── catalog ──────────────────────────────────────────────────────────────────

test('catalog: ids are unique and every entry belongs to a real exhibit', () => {
  assert.equal(new Set(allIds).size, allIds.length);
  const exhibits = new Set(DOSSIERS.map(d => d.id));
  for (const c of EXPERIENCE_CATALOG) assert.ok(exhibits.has(c.exhibitId), `${c.id} -> ${c.exhibitId}`);
});

test('catalog: the MP4s and sidecar captions it names exist in docs/dossier', () => {
  for (const c of EXPERIENCE_CATALOG) {
    assert.ok(fs.existsSync(c.file), c.file);
    if (c.vtt) assert.ok(fs.existsSync(c.vtt), c.vtt);
    if (c.srt) assert.ok(fs.existsSync(c.srt), c.srt);
  }
});

test('catalog: exactly one council film per exhibit that has a canvas film; legacy are flagged', () => {
  for (const d of DOSSIERS.filter(x => x.film)) {
    const councils = EXPERIENCE_CATALOG.filter(c => c.exhibitId === d.id && c.variant === 'council');
    assert.equal(councils.length, 1, d.id);
  }
  assert.deepEqual(EXPERIENCE_CATALOG.filter(c => c.legacy).map(c => c.variant), ['legacy', 'legacy', 'legacy']);
});

// ── plan / idempotency ───────────────────────────────────────────────────────

test('plan: a fresh run uploads the five non-legacy films and skips legacy by default', () => {
  const plan = planUploads(EXPERIENCE_CATALOG, emptyManifest(), facts(allIds));
  assert.deepEqual(plan.filter(p => p.action === 'upload').map(p => p.entry.id), ['douglass-council', 'ford-council', 'persia-council', 'partition-council', 'founding-battle-demo']);
  assert.equal(plan.filter(p => p.action === 'skip-legacy').length, 3);
});

test('plan: --include-legacy and --only bring legacy in', () => {
  assert.equal(planUploads(EXPERIENCE_CATALOG, emptyManifest(), facts(allIds), { includeLegacy: true }).filter(p => p.action === 'upload').length, 8);
  const only = planUploads(EXPERIENCE_CATALOG, emptyManifest(), facts(allIds), { only: ['ford-legacy'] });
  assert.deepEqual(only.map(p => [p.entry.id, p.action]), [['ford-legacy', 'upload']]);
});

test('plan: same sha with a Mux asset id is skipped (idempotent); --force overrides', () => {
  const m: ExperiencesManifest = emptyManifest();
  m.entries['ford-council'] = { ...manifestEntryFrom(catalogFor('ford-council')!, { sha256: SHA('a'), sizeBytes: 1000 }, 'public'), muxAssetId: 'asset1', status: 'ready' };
  const plan = planUploads(EXPERIENCE_CATALOG, m, facts(allIds), { only: ['ford-council'] });
  assert.equal(plan[0].action, 'skip-uploaded');
  assert.equal(planUploads(EXPERIENCE_CATALOG, m, facts(allIds), { only: ['ford-council'], force: true })[0].action, 'upload');
});

test('plan: a half-finished attempt (no asset id) is retried, never treated as done', () => {
  const m = emptyManifest();
  m.entries['ford-council'] = { ...manifestEntryFrom(catalogFor('ford-council')!, { sha256: SHA('a'), sizeBytes: 1000 }, 'public'), muxUploadId: 'u1', status: 'uploading' };
  const p = planUploads(EXPERIENCE_CATALOG, m, facts(allIds), { only: ['ford-council'] })[0];
  assert.equal(p.action, 'upload');
  assert.match(p.reason, /never produced an asset/);
});

test('plan: a re-rendered file (different sha) is flagged as a NEW asset, and a missing file is reported', () => {
  const m = emptyManifest();
  m.entries['ford-council'] = { ...manifestEntryFrom(catalogFor('ford-council')!, { sha256: SHA('a'), sizeBytes: 1000 }, 'public'), muxAssetId: 'asset1', status: 'ready' };
  const f = facts(allIds, 'b');
  f['douglass-council'] = { exists: false };
  const plan = planUploads(EXPERIENCE_CATALOG, m, f);
  assert.equal(plan.find(p => p.entry.id === 'ford-council')!.action, 'changed-reupload');
  assert.equal(plan.find(p => p.entry.id === 'douglass-council')!.action, 'missing-file');
});

test('passthrough id stays within the Mux 255-char cap and carries the record id + a short sha', () => {
  const p = buildPassthrough('ford-council', SHA('c'));
  assert.equal(p, 'dossier-exp=ford-council;sha=cccccccccccccccc');
  assert.ok(buildPassthrough('x'.repeat(400), SHA('c')).length <= 255);
});

// ── upload loop with a fake client (no network) ──────────────────────────────

function fakeClient(opts: { failOn?: string; neverAsset?: string } = {}) {
  const calls: string[] = [];
  const client: MuxUploadClient = {
    async createDirectUpload({ passthrough, policy }) { calls.push(`create:${passthrough}:${policy}`); return { id: 'up_' + passthrough.split(';')[0].split('=')[1], url: 'https://upload.invalid/x' }; },
    async putFile(_u, file) { calls.push('put:' + file); if (opts.failOn && file.includes(opts.failOn)) throw new Error('boom'); },
    async waitForAsset(id) { calls.push('asset:' + id); return 'asset_' + id; },
    async waitForReady(id) { calls.push('ready:' + id); return { status: 'ready', duration: 100.5, playback_ids: [{ id: 'PB' + id.replace(/\W/g, '').padEnd(10, '0'), policy: 'public' }], tracks: [{ type: 'video', max_width: 1920, max_height: 1080 }] }; },
  };
  return { client, calls };
}

test('runUploads: uploads the plan, saves the manifest after every step, fills playback id + dims', async () => {
  const m = emptyManifest();
  const saves: string[] = [];
  const plan = planUploads(EXPERIENCE_CATALOG, m, facts(allIds), { only: ['ford-council'] });
  const { client, calls } = fakeClient();
  const out = await runUploads(plan, { client, manifest: m, save: x => saves.push(JSON.stringify(x.entries['ford-council'].status)), probe: () => ({ durationSec: 219.17 }), policy: 'public', now: () => 5 });
  assert.equal(out[0].result, 'uploaded');
  assert.deepEqual(calls.map(c => c.split(':')[0]), ['create', 'put', 'asset', 'ready']);
  assert.ok(calls[0].endsWith(':public'));
  assert.deepEqual(saves, ['"uploading"', '"processing"', '"processing"', '"ready"']);   // the upload id is saved before bytes move
  const e = m.entries['ford-council'];
  assert.equal(e.status, 'ready');
  assert.match(e.muxPlaybackId!, /^PB/);
  assert.equal(e.width, 1920);
  assert.equal(e.durationSec, 100.5);
  assert.equal(e.muxUploadId, 'up_ford-council');
});

test('runUploads: a second run over the same manifest uploads nothing (idempotent)', async () => {
  const m = emptyManifest();
  const run = async () => {
    const plan = planUploads(EXPERIENCE_CATALOG, m, facts(allIds));
    const { client, calls } = fakeClient();
    await runUploads(plan, { client, manifest: m, save: () => {}, probe: () => ({}), policy: 'public' });
    return calls.filter(c => c.startsWith('create')).length;
  };
  assert.equal(await run(), 5);
  assert.equal(await run(), 0);
});

test('runUploads: one failure is recorded and the rest still run; the failed file is retried next time', async () => {
  const m = emptyManifest();
  const plan = planUploads(EXPERIENCE_CATALOG, m, facts(allIds));
  const { client } = fakeClient({ failOn: 'persia-explainer-council' });
  const out = await runUploads(plan, { client, manifest: m, save: () => {}, probe: () => ({}), policy: 'public' });
  assert.equal(out.filter(o => o.result === 'uploaded').length, 4);
  assert.equal(out.find(o => o.id === 'persia-council')!.result, 'errored');
  assert.equal(m.entries['persia-council'].status, 'errored');
  const again = planUploads(EXPERIENCE_CATALOG, m, facts(allIds));
  assert.deepEqual(again.filter(p => p.action === 'upload').map(p => p.entry.id), ['persia-council']);
});

test('summarizePlan counts only what would actually be sent', () => {
  const plan = planUploads(EXPERIENCE_CATALOG, emptyManifest(), facts(allIds));
  const s = summarizePlan(plan, () => ({ durationSec: 60 }));
  assert.equal(s.files, 5);
  assert.equal(s.bytes, 5000);
  assert.equal(s.minutes, 5);
});

// ── manifest -> record, Mux asset folding ────────────────────────────────────

test('manifest entry becomes an admin record without undefined fields (Firestore rejects them)', () => {
  const m = { ...manifestEntryFrom(catalogFor('ford-council')!, { sha256: SHA('a'), sizeBytes: 5, durationSec: 219.17, width: 1920, height: 1080 }, 'public'), muxAssetId: 'asset1', muxPlaybackId: 'PB1', status: 'processing' as const };
  const rec = manifestEntryToRecord(m, 99);
  assert.equal(rec.exhibitId, 'henry-ford');
  assert.equal(rec.kind, 'film');
  assert.equal(rec.sourceSha256, SHA('a'));
  assert.equal(rec.createdAt, 99);
  assert.equal(JSON.stringify(rec).includes('undefined'), false);
  assert.ok(Object.values(rec).every(v => v !== undefined));
  assert.equal(rec.captionsSourcePaths?.vtt, 'docs/dossier/ford-explainer-council.vtt');
});

test('re-importing a manifest keeps the admin\'s hall / Reello / caption state', () => {
  const prev = readyRec({ inHall: true, publishedReelloId: 'vid_1', captionsUrl: 'https://x/c.vtt', createdAt: 5 });
  const m = { ...manifestEntryFrom(catalogFor('ford-council')!, { sha256: SHA('a'), sizeBytes: 5 }, 'public'), muxAssetId: 'asset1', muxPlaybackId: 'AbCdEf0123456789', status: 'ready' as const };
  const rec = manifestEntryToRecord(m, 100, prev);
  assert.equal(rec.inHall, true);
  assert.equal(rec.publishedReelloId, 'vid_1');
  assert.equal(rec.captionsUrl, 'https://x/c.vtt');
  assert.equal(rec.createdAt, 5);
  assert.equal(rec.status, 'ready');
});

test('applyMuxAsset: ready asset fills playback id, policy, duration, size; errored asset records the message', () => {
  const base = readyRec({ status: 'processing', muxPlaybackId: undefined, durationSec: undefined, width: undefined, height: undefined });
  const r = applyMuxAsset(base, { status: 'ready', duration: 217.7501, playback_ids: [{ id: 'PBX12345678', policy: 'public' }], tracks: [{ type: 'audio' }, { type: 'video', max_width: 1920, max_height: 1080 }] }, 7);
  assert.equal(r.status, 'ready'); assert.equal(r.muxPlaybackId, 'PBX12345678'); assert.equal(r.durationSec, 217.75); assert.equal(r.width, 1920); assert.equal(r.updatedAt, 7);
  const e = applyMuxAsset(base, { status: 'errored', errors: { messages: ['bad input'] } });
  assert.equal(e.status, 'errored'); assert.equal(e.error, 'bad input');
  assert.equal(applyMuxAsset(base, { status: 'preparing' }).status, 'processing');
  assert.equal(applyMuxAsset(readyRec(), { status: 'ready', playback_ids: [{ id: 'PBsigned1234', policy: 'signed' }] }).playbackPolicy, 'signed');
});

// ── hall: public doc + player choice ─────────────────────────────────────────

test('public hall doc carries ONLY playback fields (no asset id, source path, hash, sizes, uploader)', () => {
  const pub = toPublicFilm(readyRec({ captionsUrl: 'https://x/c.vtt', sourceSha256: SHA('a'), sizeBytes: 5 }), 10)!;
  assert.deepEqual(Object.keys(pub).sort(), [...EXPERIENCE_FILM_PUBLIC_KEYS].sort());
  const json = JSON.stringify(pub);
  for (const secret of ['asset1', 'docs/dossier', SHA('a'), 'sourceFile', 'muxAssetId']) assert.equal(json.includes(secret), false, secret);
  assert.equal(pub.playbackPolicy, 'public');
});

test('a record is kept out of the hall until it is ready, public, timed, and not a legacy explainer', () => {
  assert.deepEqual(hallBlockers(readyRec()), []);
  assert.equal(toPublicFilm(readyRec({ status: 'processing' })), null);
  assert.equal(toPublicFilm(readyRec({ muxPlaybackId: undefined })), null);
  assert.equal(toPublicFilm(readyRec({ playbackPolicy: 'signed' })), null);
  assert.equal(toPublicFilm(readyRec({ durationSec: undefined })), null);
  assert.equal(toPublicFilm(readyRec({ variant: 'legacy' })), null);
  assert.ok(toPublicFilm(readyRec({ variant: 'demo' })));
});

test('parsePublicFilm rejects malformed or unsafe docs', () => {
  const good = toPublicFilm(readyRec())!;
  assert.ok(parsePublicFilm(good));
  assert.equal(parsePublicFilm(null), null);
  assert.equal(parsePublicFilm({ ...good, muxPlaybackId: '../../etc' }), null);
  assert.equal(parsePublicFilm({ ...good, muxPlaybackId: 'short' }), null);
  assert.equal(parsePublicFilm({ ...good, playbackPolicy: 'signed' }), null);
  assert.equal(parsePublicFilm({ ...good, durationSec: 0 }), null);
  assert.equal(parsePublicFilm({ ...good, captionsUrl: 'javascript:alert(1)' })!.captionsUrl, undefined);
});

test('selectFilmSource: Mux when a valid published film exists, canvas when it does not or Mux failed, none without either', () => {
  const published = toPublicFilm(readyRec())!;
  const mux = selectFilmSource({ published, hasCanvasFilm: true });
  assert.equal(mux.kind, 'mux');
  if (mux.kind === 'mux') {
    assert.equal(mux.src, 'https://stream.mux.com/AbCdEf0123456789.m3u8');
    assert.equal(mux.mp4, 'https://stream.mux.com/AbCdEf0123456789/high.mp4');
    assert.match(mux.poster, /^https:\/\/image\.mux\.com\/AbCdEf0123456789\/thumbnail\.jpg/);
  }
  assert.equal(selectFilmSource({ published: null, hasCanvasFilm: true }).kind, 'canvas');         // nothing published
  assert.equal(selectFilmSource({ published: undefined, hasCanvasFilm: true }).kind, 'canvas');    // read failed / signed out
  assert.equal(selectFilmSource({ published: { garbage: true }, hasCanvasFilm: true }).kind, 'canvas');
  assert.equal(selectFilmSource({ published, hasCanvasFilm: true, muxFailed: true }).kind, 'canvas'); // player error -> live film
  assert.equal(selectFilmSource({ published: null, hasCanvasFilm: false }).kind, 'none');
  assert.equal(selectFilmSource({ published, hasCanvasFilm: false }).kind, 'mux');                  // a Mux-only exhibit film is allowed
  assert.equal(selectFilmSource({ published, hasCanvasFilm: false, muxFailed: true }).kind, 'none');
});

// ── Reello ───────────────────────────────────────────────────────────────────

test('Reello video: private by default, Mux-only, attributed to Plajah Dossier, with captions + poster + lineage', () => {
  const v = experienceToReelloVideo(readyRec({ captionsUrl: 'https://x/c.vtt' }), { ownerId: 'adm1', visibility: 'private', exhibitTitle: 'Henry Ford', now: 1234 }) as any;
  assert.equal(v.id, 'vid_1234');
  assert.equal(v.ownerId, 'adm1');
  assert.equal(v.isPrivate, true);
  assert.equal(v.isRello, true);
  assert.equal(v.url, '');
  assert.equal(v.muxPlaybackId, 'AbCdEf0123456789');
  assert.equal(v.artist, 'Plajah Dossier');
  assert.equal(v.category, 'DOCUMENTARY');
  assert.ok(v.tags.includes('Plajah Dossier'));
  assert.deepEqual(v.subtitles, [{ label: 'English', srclang: 'en', url: 'https://x/c.vtt', default: true }]);
  assert.match(v.thumbnailUrl, /image\.mux\.com\/AbCdEf0123456789/);
  assert.match(v.description, /Plajah Dossier/);
  assert.match(v.description, /Credits:/);
  assert.equal(v.duration, 219);
  assert.equal(v.sourceExperienceId, 'ford-council');
  assert.equal(v.isAdSupported, false);
  assert.equal(v.allowInFastChannel, false);
});

test('Reello video: public only when asked; fields satisfy the videos rule (id/title/url/description limits, no undefined)', () => {
  const pub = experienceToReelloVideo(readyRec(), { ownerId: 'a', visibility: 'public', now: 1 }) as any;
  assert.equal(pub.isPrivate, false);
  const priv = experienceToReelloVideo(readyRec({ title: 'T'.repeat(500), description: 'D'.repeat(5000) }), { ownerId: 'a', visibility: 'private', now: 1 }) as any;
  assert.ok(priv.title.length < 200);
  assert.ok(priv.description.length < 2000);
  assert.equal(typeof priv.url, 'string');
  assert.ok(Object.values(priv).every(x => x !== undefined));
  const noCaptions = experienceToReelloVideo(readyRec(), { ownerId: 'a', visibility: 'private', now: 1 }) as any;
  assert.equal('subtitles' in noCaptions, false);
});

test('Reello publish is blocked until the asset is ready and public, and cannot be done twice', () => {
  assert.deepEqual(reelloBlockers(readyRec()), []);
  assert.ok(reelloBlockers(readyRec({ status: 'processing' })).length);
  assert.ok(reelloBlockers(readyRec({ playbackPolicy: 'signed' })).some(s => /signed/i.test(s)));
  assert.ok(reelloBlockers(readyRec({ publishedReelloId: 'vid_1' })).some(s => /already/i.test(s)));
});

// ── small helpers ────────────────────────────────────────────────────────────

test('stripUndefined removes undefined deeply and leaves other values alone', () => {
  assert.deepEqual(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: [1, undefined, { f: undefined, g: 2 }] }, h: null, i: 0, j: '' }), { a: 1, c: { e: [1, { g: 2 }] }, h: null, i: 0, j: '' });
});

test('srtToVtt converts timestamps, adds the header, and is idempotent on VTT', () => {
  const vtt = srtToVtt('1\r\n00:00:06,883 --> 00:00:11,868\r\nHello.\r\n\r\n2\r\n00:00:12,000 --> 00:00:13,000\r\nWorld.\r\n');
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:00:06.883 --> 00:00:11.868'));
  assert.equal(vtt.includes(','), false);
  assert.equal(srtToVtt(vtt), vtt);
});

test('the shipped sidecar VTTs are valid WebVTT, and the SRT converter agrees with them', () => {
  for (const c of EXPERIENCE_CATALOG.filter(x => x.vtt && x.srt)) {
    const vtt = fs.readFileSync(c.vtt!, 'utf8'); assert.ok(vtt.startsWith('WEBVTT'), c.vtt);
    const conv = srtToVtt(fs.readFileSync(c.srt!, 'utf8'));
    const times = (s: string) => (s.match(/\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}/g) || []).length;
    assert.equal(times(conv), times(vtt), c.id);
  }
});
