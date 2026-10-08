import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EXPERIENCE_CATALOG, applyMuxAsset, buildPassthrough, emptyManifest, experienceToReelloVideo, hallBlockers,
  manifestEntryFrom, manifestEntryToRecord, parsePublicFilm, planUploads, reelloBlockers, selectFilmSource, srtToVtt,
  stripUndefined, toPublicFilm, EXPERIENCE_FILM_PUBLIC_KEYS, EXPERIENCE_FILM_REQUIRED_KEYS, INTERACTIVE_NO_ACTIONS, catalogFor,
  hallIsStale, reelloDrift, reelloIsPublic,
  type ExperienceRecord, type FileFact, type ExperiencesManifest, type ReelloVideoState,
} from '../services/dossier/experiences/experienceModel';
import { runUploads, summarizePlan, type MuxUploadClient } from '../services/dossier/experiences/uploader';
import { DOSSIERS } from '../data/dossier/registry';

const SHA = (c: string) => c.repeat(64);
/** A film that is ready on Mux but NOT yet published as a Reello video: the hall must refuse it. */
const readyRec = (o: Partial<ExperienceRecord> = {}): ExperienceRecord => ({
  id: 'ford-council', title: 'Henry Ford: the film', description: 'About Ford.', exhibitId: 'henry-ford', kind: 'film', variant: 'council',
  status: 'ready', muxAssetId: 'asset1', muxPlaybackId: 'AbCdEf0123456789', playbackPolicy: 'public', durationSec: 219.17, width: 1920, height: 1080,
  sourceFile: 'docs/dossier/ford-explainer-council.mp4', createdAt: 1, updatedAt: 1, ...o,
});
/** The same film, published as Reello video vid_1. */
const publishedRec = (o: Partial<ExperienceRecord> = {}) => readyRec({ publishedReelloId: 'vid_1', ...o });
const PUBLIC_REELLO: ReelloVideoState = { exists: true, isPrivate: false, muxPlaybackId: 'AbCdEf0123456789' };
const PRIVATE_REELLO: ReelloVideoState = { exists: true, isPrivate: true, muxPlaybackId: 'AbCdEf0123456789' };
const GONE_REELLO: ReelloVideoState = { exists: false };
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

test('catalog: the animated battle video is INTERACTIVE content of the Founding exhibit, not an exhibit film', () => {
  const battle = catalogFor('founding-battle-demo')!;
  assert.equal(battle.kind, 'interactive');
  assert.equal(battle.exhibitId, 'founding-era');
  assert.notEqual(battle.variant, 'council');
  assert.ok(!battle.legacy);
  // every other entry is a film, and the Founding Era has no film entry at all and no canvas film
  assert.deepEqual(EXPERIENCE_CATALOG.filter(c => c.kind === 'interactive').map(c => c.id), ['founding-battle-demo']);
  assert.deepEqual(EXPERIENCE_CATALOG.filter(c => c.exhibitId === 'founding-era' && c.kind === 'film'), []);
  assert.equal(DOSSIERS.find(d => d.id === 'founding-era')!.film, undefined);
});

// ── plan / idempotency ───────────────────────────────────────────────────────

test('plan: a fresh run uploads the four council films plus the interactive painting, and skips legacy by default', () => {
  const plan = planUploads(EXPERIENCE_CATALOG, emptyManifest(), facts(allIds));
  assert.deepEqual(plan.filter(p => p.action === 'upload').map(p => p.entry.id), ['douglass-council', 'ford-council', 'persia-council', 'partition-council', 'founding-battle-demo']);
  assert.equal(plan.filter(p => p.action === 'skip-legacy').length, 3);
  // the animated painting is in the default set as interactive content; the legacy explainers are not
  assert.equal(plan.find(p => p.entry.id === 'founding-battle-demo')!.entry.kind, 'interactive');
  assert.ok(plan.filter(p => p.action === 'skip-legacy').every(p => p.entry.legacy));
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

test('manifest entries carry the kind; an old manifest without one is classified by the catalog', () => {
  const battle = manifestEntryFrom(catalogFor('founding-battle-demo')!, { sha256: SHA('a'), sizeBytes: 5 }, 'public');
  assert.equal(battle.kind, 'interactive');
  const { kind: _drop, ...old } = battle;
  assert.equal(manifestEntryToRecord(old as any, 1).kind, 'interactive');
  assert.equal(manifestEntryToRecord({ ...manifestEntryFrom(catalogFor('ford-council')!, { sha256: SHA('a'), sizeBytes: 5 }, 'public'), kind: undefined } as any, 1).kind, 'film');
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

test('public hall doc carries ONLY playback fields, the Reello video id included (no asset id, source path, hash, sizes, uploader)', () => {
  const pub = toPublicFilm(publishedRec({ captionsUrl: 'https://x/c.vtt', sourceSha256: SHA('a'), sizeBytes: 5 }), PUBLIC_REELLO, 10)!;
  assert.deepEqual(Object.keys(pub).sort(), [...EXPERIENCE_FILM_PUBLIC_KEYS].sort());
  assert.equal(pub.reelloVideoId, 'vid_1');
  const json = JSON.stringify(pub);
  for (const secret of ['asset1', 'docs/dossier', SHA('a'), 'sourceFile', 'muxAssetId']) assert.equal(json.includes(secret), false, secret);
  assert.equal(pub.playbackPolicy, 'public');
});

test('the hall playback id is copied from the REELLO video, not from the Mux record', () => {
  const pub = toPublicFilm(publishedRec(), { ...PUBLIC_REELLO, muxPlaybackId: 'ReelloPlayback9999' })!;
  assert.equal(pub.muxPlaybackId, 'ReelloPlayback9999');
  assert.match(reelloDrift(publishedRec(), { ...PUBLIC_REELLO, muxPlaybackId: 'ReelloPlayback9999' })!, /older Mux asset/);
  assert.equal(reelloDrift(publishedRec(), PUBLIC_REELLO), null);
});

test('HALL REQUIRES REELLO: no hall without a published, PUBLIC, existing Reello video', () => {
  // not published as a Reello video at all
  assert.ok(hallBlockers(readyRec(), undefined).some(s => /Publish this film as a Reello video first/.test(s)));
  assert.equal(toPublicFilm(readyRec(), PUBLIC_REELLO), null);        // even if some video state is supplied, the record is not linked to it
  // published but private
  assert.ok(hallBlockers(publishedRec(), PRIVATE_REELLO).some(s => /private/.test(s)));
  assert.equal(toPublicFilm(publishedRec(), PRIVATE_REELLO), null);
  // published, deleted
  assert.ok(hallBlockers(publishedRec(), GONE_REELLO).some(s => /no longer exists/.test(s)));
  assert.equal(toPublicFilm(publishedRec(), GONE_REELLO), null);
  assert.equal(toPublicFilm(publishedRec(), null), null);
  // published but the status is not known yet (never assumed public)
  assert.ok(hallBlockers(publishedRec(), undefined).some(s => /Checking the Reello video/.test(s)));
  assert.equal(toPublicFilm(publishedRec(), undefined), null);
  // a Reello video with no Mux playback id cannot be copied from
  assert.ok(hallBlockers(publishedRec(), { exists: true, isPrivate: false }).length);
  // published and public: allowed
  assert.deepEqual(hallBlockers(publishedRec(), PUBLIC_REELLO), []);
  assert.ok(toPublicFilm(publishedRec(), PUBLIC_REELLO));
});

test('a record is kept out of the hall until it is ready, public, timed, a council film, and its Reello video is public', () => {
  assert.deepEqual(hallBlockers(publishedRec(), PUBLIC_REELLO), []);
  assert.equal(toPublicFilm(publishedRec({ status: 'processing' }), PUBLIC_REELLO), null);
  assert.equal(toPublicFilm(publishedRec({ muxPlaybackId: undefined }), PUBLIC_REELLO), null);
  assert.equal(toPublicFilm(publishedRec({ playbackPolicy: 'signed' }), PUBLIC_REELLO), null);
  assert.ok(hallBlockers(publishedRec({ playbackPolicy: 'signed' }), PUBLIC_REELLO).some(s => /public playback only/i.test(s)));
  assert.equal(toPublicFilm(publishedRec({ durationSec: undefined }), PUBLIC_REELLO), null);
  assert.equal(toPublicFilm(publishedRec({ variant: 'legacy' }), PUBLIC_REELLO), null);
});

test('stale hall: a film in the hall whose Reello video is private or gone is detected (and only when the state is actually known)', () => {
  const inHall = publishedRec({ inHall: true });
  assert.equal(hallIsStale(inHall, PUBLIC_REELLO), false);
  assert.equal(hallIsStale(inHall, PRIVATE_REELLO), true);
  assert.equal(hallIsStale(inHall, GONE_REELLO), true);
  assert.equal(hallIsStale(inHall, undefined), false);                 // a failed or pending read never takes the hall down
  assert.equal(hallIsStale(publishedRec(), PRIVATE_REELLO), false);    // not in the hall: nothing to remove
  assert.equal(reelloIsPublic(PUBLIC_REELLO), true);
  assert.equal(reelloIsPublic(PRIVATE_REELLO), false);
  assert.equal(reelloIsPublic(GONE_REELLO), false);
  assert.equal(reelloIsPublic(undefined), false);
});

test('the admin service takes the film out of the hall when the Reello video goes private, is found stale, or is unlinked', () => {
  const svc = fs.readFileSync('services/dossier/experiences/experienceService.ts', 'utf8');
  const fn = (name: string) => { const i = svc.indexOf('export async function ' + name); assert.ok(i >= 0, name); const j = svc.indexOf('\nexport ', i + 10); return svc.slice(i, j < 0 ? undefined : j); };
  assert.match(fn('setReelloVisibility'), /visibility === 'private' && rec\.inHall\) next = await removeFromHall\(rec\)/);
  assert.match(fn('setReelloVisibility'), /removeFromHall[\s\S]*updateDoc/);              // hall first, then the video
  assert.match(fn('reconcileHall'), /hallIsStale[\s\S]*removeFromHall/);
  assert.match(fn('unlinkReello'), /removeFromHall/);
  assert.match(fn('putInHall'), /getReelloState\(rec\.publishedReelloId\)/);
  assert.match(fn('putInHall'), /hallBlockers\(rec, reello\)/);
  assert.match(svc, /async function syncHallFor[\s\S]*removeFromHall\(rec\)/);
  const ui = fs.readFileSync('components/admin/AdminExperiences.tsx', 'utf8');
  assert.match(ui, /reconcileHall\(r, state\)/);                                          // the admin tab applies it on load
  assert.match(ui, /Disabled: \{hb\[0\]\}/);                                             // the hall toggle states why it is disabled
});

test('INTERACTIVE content (the animated battle painting) has no hall and no Reello actions, at any state', () => {
  const battle = readyRec({ id: 'founding-battle-demo', exhibitId: 'founding-era', kind: 'interactive', variant: 'demo', publishedReelloId: 'vid_9', inHall: true });
  assert.deepEqual(hallBlockers(battle, PUBLIC_REELLO), [INTERACTIVE_NO_ACTIONS]);
  assert.equal(toPublicFilm(battle, PUBLIC_REELLO), null);
  assert.deepEqual(reelloBlockers({ ...battle, publishedReelloId: undefined }), [INTERACTIVE_NO_ACTIONS]);
  assert.throws(() => experienceToReelloVideo(battle, { ownerId: 'a', visibility: 'private' }), /not an exhibit film/);
  // the shipped catalog entry, uploaded and ready, still has nothing to offer
  const fromCatalog = manifestEntryToRecord({ ...manifestEntryFrom(catalogFor('founding-battle-demo')!, { sha256: SHA('a'), sizeBytes: 5, durationSec: 45 }, 'public'), muxAssetId: 'a', muxPlaybackId: 'AbCdEf0123456789', status: 'ready' }, 1);
  assert.equal(fromCatalog.kind, 'interactive');
  assert.ok(hallBlockers(fromCatalog, PUBLIC_REELLO).length);
  assert.ok(reelloBlockers(fromCatalog).length);
  assert.equal(toPublicFilm(fromCatalog, PUBLIC_REELLO), null);
  // the admin UI renders no Reello or hall controls for a non-film row
  const ui = fs.readFileSync('components/admin/AdminExperiences.tsx', 'utf8');
  assert.match(ui, /\{isFilm && \(\s*<div className="mt-3 rounded-lg border/);
  assert.match(ui, /interactive content/);
});

test('parsePublicFilm rejects malformed or unsafe docs, and docs that do not name a Reello video', () => {
  const good = toPublicFilm(publishedRec(), PUBLIC_REELLO)!;
  assert.ok(parsePublicFilm(good));
  assert.equal(parsePublicFilm(null), null);
  assert.equal(parsePublicFilm({ ...good, muxPlaybackId: '../../etc' }), null);
  assert.equal(parsePublicFilm({ ...good, muxPlaybackId: 'short' }), null);
  assert.equal(parsePublicFilm({ ...good, playbackPolicy: 'signed' }), null);
  assert.equal(parsePublicFilm({ ...good, durationSec: 0 }), null);
  assert.equal(parsePublicFilm({ ...good, reelloVideoId: undefined }), null);
  assert.equal(parsePublicFilm({ ...good, reelloVideoId: '' }), null);
  assert.equal(parsePublicFilm({ ...good, reelloVideoId: 42 }), null);
  assert.equal(parsePublicFilm({ ...good, captionsUrl: 'javascript:alert(1)' })!.captionsUrl, undefined);
});

test('selectFilmSource: Mux when a valid published film exists, canvas when it does not or Mux failed, none without either', () => {
  const published = toPublicFilm(publishedRec(), PUBLIC_REELLO)!;
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
  assert.equal(selectFilmSource({ published: { ...published, reelloVideoId: undefined }, hasCanvasFilm: true }).kind, 'canvas');  // not sourced from Reello
  assert.equal(selectFilmSource({ published, hasCanvasFilm: true, muxFailed: true }).kind, 'canvas'); // player error -> live film
  assert.equal(selectFilmSource({ published: null, hasCanvasFilm: false }).kind, 'none');
  assert.equal(selectFilmSource({ published, hasCanvasFilm: false }).kind, 'mux');                  // a Mux-only exhibit film is allowed
  assert.equal(selectFilmSource({ published, hasCanvasFilm: false, muxFailed: true }).kind, 'none');
  // the founding exhibit has no film and nothing in the hall: no "Watch the film" button
  assert.equal(selectFilmSource({ published: null, hasCanvasFilm: !!DOSSIERS.find(d => d.id === 'founding-era')!.film }).kind, 'none');
});

test('firestore.rules experienceFilms allowlist is exactly the public doc shape (reelloVideoId included)', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8').replace(/\r\n/g, '\n');
  const block = rules.slice(rules.indexOf('match /experienceFilms/{exhibitId}'));
  const list = (fn: string) => {
    const m = block.match(new RegExp(fn + '\\(\\[([^\\]]*)\\]\\)'));
    assert.ok(m, fn);
    return m![1].split(',').map(x => x.trim().replace(/'/g, '')).sort();
  };
  assert.deepEqual(list('hasOnly'), [...EXPERIENCE_FILM_PUBLIC_KEYS].sort());
  assert.deepEqual(list('hasAll'), [...EXPERIENCE_FILM_REQUIRED_KEYS].sort());
  assert.match(block, /reelloVideoId is string/);
  assert.match(block, /playbackPolicy == 'public'/);
  assert.match(block, /allow read: if true/);
  assert.match(block.slice(0, block.indexOf('allow delete')), /isAdmin\(\)/);
  // experiences itself stays admin-only
  assert.match(rules.slice(rules.indexOf('match /experiences/{expId}'), rules.indexOf('match /experienceFilms')), /allow read, write: if isAdmin\(\)/);
  // the rules test script sends the same exact keys
  const script = fs.readFileSync('scripts/testExperiencesRules.mjs', 'utf8');
  assert.match(script, /reelloVideoId: 'vid_/);
  assert.match(script, /hall film without reelloVideoId/);
});

test('no signed-playback option is offered: the upload script refuses it and the UI labels it unsupported', () => {
  const cli = fs.readFileSync('scripts/dossier/uploadExperiences.ts', 'utf8');
  assert.match(cli, /const POLICY: PlaybackPolicy = 'public'/);
  assert.match(cli, /only "public" is supported/);
  assert.equal(/--policy=public\|signed/.test(cli), false);
  const ui = fs.readFileSync('components/admin/AdminExperiences.tsx', 'utf8');
  assert.match(ui, /signed: unsupported/);
  assert.equal(/<option value="signed"/.test(ui), false);
});

test('the Founding exhibit wires the animated painting to exactly one node, declared in the union, lazy-loaded, boundary-wrapped, and not a film', async () => {
  const { foundingDossier } = await import('../data/dossier/founding');
  const nodes = foundingDossier.rooms.flatMap(r => r.nodes);
  const hosts = nodes.filter(n => n.experience === 'animated-painting');
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].id, 'n-r3-story');
  const claimIds = new Set(foundingDossier.ledger.claims.map(c => c.id));
  assert.ok(hosts[0].claimIds.length > 0);
  for (const c of hosts[0].claimIds) assert.ok(claimIds.has(c), c);
  assert.match(fs.readFileSync('services/dossier/dossierTypes.ts', 'utf8'), /\| 'animated-painting'/);
  const hall = fs.readFileSync('components/dossier/DossierHall.tsx', 'utf8');
  assert.match(hall, /React\.lazy\(\(\) => import\('\.\/experiences\/AnimatedPainting'\)\)/);
  assert.match(hall, /n\.experience === 'animated-painting'/);
  assert.match(hall, /<AnimatedPainting \/>/);
  const start = hall.indexOf('<DossierBoundary key={n.id} scope="experience">');
  assert.ok(start >= 0);
  const inBoundary = hall.slice(start, hall.indexOf('</DossierBoundary>', start));
  assert.ok(inBoundary.includes("n.experience === 'animated-painting'"));
  const comp = fs.readFileSync('components/dossier/experiences/AnimatedPainting.tsx', 'utf8');
  assert.match(comp, /ANIMATED PAINTING/);
  assert.match(comp, /loadFoundingBattleFilm/);
  assert.match(comp, /embedded/);
  assert.match(comp, /prefers-reduced-motion/);
  assert.match(comp, /autoPlay=\{!reduced\}/);
  assert.match(comp, /muxPlaybackId/);                                       // the future Mux-asset fallback hook
  const player = fs.readFileSync('components/dossier/DossierFilmPlayer.tsx', 'utf8');
  for (const needle of ['aria-label="Seek"', 'aria-label="Captions"', "aria-label={playing ? 'Pause' : 'Play'}", 'embedded']) assert.ok(player.includes(needle), needle);
  // the exhibit's "Watch the film" never uses the painting: the Founding entry has no film and the host only reads experienceFilms
  assert.equal(DOSSIERS.find(d => d.id === 'founding-era')!.film, undefined);
  assert.equal(fs.readFileSync('components/dossier/DossierFilmHost.tsx', 'utf8').includes('AnimatedPainting'), false);
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
