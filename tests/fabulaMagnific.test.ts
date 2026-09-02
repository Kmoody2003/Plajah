// Magnific adapter + generation credential vault.
//
// The adapter's job is to translate between a film tool and an API that was not built for one. The
// tests that matter are the places those two disagree: cinema aspect ratios Magnific cannot produce,
// a "COMPLETED" task that returned nothing, and a key that must never come back out of the vault.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAGNIFIC_ENDPOINT, parseAspect, mysticAspect, opForInput,
  buildMysticBody, buildUpscaleBody, buildBody, normalizeTask,
} from '../services/fabula/magnificApi';
import {
  encryptSecret, decryptSecret, maskKey, memoryVaultStore,
  saveKey, readKey, revokeKey, listLinked,
} from '../services/fabula/genVault';

// ── aspect ratio ──────────────────────────────────────────────────────────────

test('parseAspect reads the shapes Fabula actually stores', () => {
  assert.equal(parseAspect('16:9'), 16 / 9);
  assert.equal(parseAspect('2.39:1'), 2.39);
  assert.equal(parseAspect('1'), 1);
  assert.equal(parseAspect(''), null);
  assert.equal(parseAspect(undefined), null);
  assert.equal(parseAspect('nonsense'), null);
  assert.equal(parseAspect('16:0'), null, 'a zero height must not divide');
});

test('exact aspect matches are reported as exact', () => {
  for (const [input, expected] of [
    ['1:1', 'square_1_1'],
    ['4:3', 'classic_4_3'],
    ['16:9', 'widescreen_16_9'],
    ['9:16', 'social_story_9_16'],
    ['2:1', 'horizontal_2_1'],
    ['3:2', 'standard_3_2'],
  ] as const) {
    const got = mysticAspect(input);
    assert.equal(got.value, expected, input);
    assert.equal(got.exact, true, input);
    assert.equal(got.note, undefined);
  }
});

test('cinema ratios have no exact match and say so instead of silently reframing', () => {
  // This is the case that matters: 2.39:1 is Fabula's default scope ratio and Magnific cannot make it.
  const scope = mysticAspect('2.39:1');
  assert.equal(scope.exact, false);
  assert.equal(scope.value, 'smartphone_horizontal_20_9', 'nearest supported is 20:9 (2.22:1), not 2:1');
  assert.match(scope.note || '', /2\.39:1/);
  assert.match(scope.note || '', /2\.22:1/, 'the note names the ratio it will actually produce');
  assert.doesNotMatch(scope.note || '', /smartphone|_/,
    'a DP should never be shown a raw enum name like smartphone_horizontal_20_9');
  assert.match(scope.note || '', /crop/i, 'the note must tell the user what to do about it');

  for (const a of ['2.35:1', '1.85:1', '1.66:1']) {
    assert.equal(mysticAspect(a).exact, false, `${a} should not claim to be exact`);
    assert.ok(mysticAspect(a).note, `${a} needs a note`);
  }
});

test('aspect matching is symmetric between landscape and portrait', () => {
  // Log-space distance — otherwise 1:2.39 would mis-round where 2.39:1 does not.
  assert.equal(mysticAspect('2.39:1').value, 'smartphone_horizontal_20_9');
  assert.equal(mysticAspect('1:2.39').value, 'smartphone_vertical_9_20', 'the mirror of 2.39:1');
  assert.equal(mysticAspect('9:20').value, 'smartphone_vertical_9_20');
  assert.equal(mysticAspect('20:9').value, 'smartphone_horizontal_20_9');
  // A portrait note inverts the ratio rather than printing "0.45:1".
  assert.match(mysticAspect('1:2.39').note || '', /1:2\.22/);
});

test('a missing aspect falls back without pretending it approximated something', () => {
  const none = mysticAspect(undefined);
  assert.equal(none.value, 'square_1_1');
  assert.equal(none.exact, true);
});

// ── operation + request bodies ────────────────────────────────────────────────

test('a source image means upscale, no source means generate', () => {
  assert.equal(opForInput({ prompt: 'x' }), 'generate');
  assert.equal(opForInput({ prompt: 'x', refs: { style: 'AAA' } }), 'generate');
  assert.equal(opForInput({ prompt: 'x', refs: { source: 'AAA' } }), 'upscale');
  assert.equal(MAGNIFIC_ENDPOINT.generate, '/v1/ai/mystic');
  assert.equal(MAGNIFIC_ENDPOINT.upscale, '/v1/ai/image-upscaler');
});

test('the Mystic body maps refs onto the two slots Mystic actually has', () => {
  const body = buildMysticBody({
    prompt: '  A lighthouse.  ',
    aspect: '16:9',
    refs: { source: 'STRUCT64', style: 'STYLE64' },
    webhookUrl: 'https://example.com/hook',
  });
  assert.equal(body.prompt, 'A lighthouse.', 'prompt is trimmed');
  assert.equal(body.aspect_ratio, 'widescreen_16_9');
  assert.equal(body.resolution, '2k');
  assert.equal(body.structure_reference, 'STRUCT64');
  assert.equal(body.style_reference, 'STYLE64');
  assert.equal(body.webhook_url, 'https://example.com/hook');
});

test('the Mystic body omits reference keys entirely when there are none', () => {
  const body = buildMysticBody({ prompt: 'x' });
  assert.equal('structure_reference' in body, false);
  assert.equal('style_reference' in body, false);
  assert.equal('webhook_url' in body, false);
});

test('the upscale body defaults to the film-and-photography profile', () => {
  const body = buildUpscaleBody({ refs: { source: 'IMG64' } });
  assert.equal(body.image, 'IMG64');
  assert.equal(body.scale_factor, '2x');
  assert.equal(body.optimized_for, 'films_n_photography', 'Fabula is a film tool; this is the right default');
  assert.equal('prompt' in body, false, 'an empty prompt must not be sent as an empty string');
});

test('upscale sliders are clamped to the range Magnific accepts', () => {
  const body = buildUpscaleBody({
    refs: { source: 'IMG64' },
    creativity: 99, hdr: -99, resemblance: 3.7, fractality: 0,
  });
  assert.equal(body.creativity, 10);
  assert.equal(body.hdr, -10);
  assert.equal(body.resemblance, 4, 'non-integers are rounded, not rejected');
  assert.equal(body.fractality, 0, 'zero is a real value, not a missing one');
});

test('buildBody dispatches on the operation', () => {
  assert.ok('aspect_ratio' in buildBody('generate', { prompt: 'x' }));
  assert.ok('scale_factor' in buildBody('upscale', { refs: { source: 'A' } }));
});

// ── responses ─────────────────────────────────────────────────────────────────

test('task status maps onto Fabula job status', () => {
  assert.equal(normalizeTask({ data: { task_id: 't1', status: 'CREATED' } }).status, 'queued');
  assert.equal(normalizeTask({ data: { task_id: 't1', status: 'IN_PROGRESS' } }).status, 'running');
  assert.equal(normalizeTask({ data: { task_id: 't1', status: 'FAILED' } }).status, 'error');
  assert.equal(normalizeTask({ data: { task_id: 't1', status: 'WHAT' } }).status, 'running',
    'an unknown status must not read as done');
});

test('a completed task returns its images with usable names', () => {
  const t = normalizeTask({ data: { task_id: 't1', status: 'COMPLETED', generated: ['https://a/1.png', 'https://a/2.png'] } });
  assert.equal(t.status, 'done');
  assert.equal(t.taskId, 't1');
  assert.equal(t.results.length, 2);
  assert.equal(t.results[0].name, 'magnific-1.png');
  assert.equal(t.results[0].mime, 'image/png');

  const single = normalizeTask({ data: { status: 'COMPLETED', generated: ['https://a/1.png'] } });
  assert.equal(single.results[0].name, 'magnific.png', 'a lone result is not numbered');
});

test('COMPLETED with no images is an error, not a silent success', () => {
  // Otherwise the job reports done, imports nothing, and the user is told it worked.
  const t = normalizeTask({ data: { task_id: 't1', status: 'COMPLETED', generated: [] } });
  assert.equal(t.status, 'error');
  assert.match(t.error || '', /no image/i);
});

test('the unwrapped webhook payload normalizes the same as the wrapped GET response', () => {
  const wrapped = normalizeTask({ data: { task_id: 't1', status: 'COMPLETED', generated: ['https://a/1.png'] } });
  const flat = normalizeTask({ task_id: 't1', status: 'COMPLETED', generated: ['https://a/1.png'] });
  assert.deepEqual(flat, wrapped);
});

test('normalizeTask survives junk without throwing', () => {
  assert.equal(normalizeTask(null).status, 'running');
  assert.equal(normalizeTask({ data: { status: 'COMPLETED', generated: 'not-an-array' } }).status, 'error');
  assert.deepEqual(normalizeTask({ data: { status: 'COMPLETED', generated: [1, 'https://a/1.png'] } }).results.length, 1,
    'non-string entries are dropped, not stringified');
});

// ── the vault ─────────────────────────────────────────────────────────────────

const withKey = (fn: () => void | Promise<void>) => async () => {
  const prev = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  try { await fn(); } finally {
    if (prev === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = prev;
  }
};

test('a secret round-trips and its ciphertext never contains the plaintext', withKey(() => {
  const secret = 'mgk_live_supersecret_1234';
  const blob = encryptSecret(secret);
  assert.equal(decryptSecret(blob), secret);
  assert.equal(blob.includes(secret), false);
  assert.equal(blob.split(':').length, 3, 'wire format is iv:tag:ciphertext');
  assert.notEqual(encryptSecret(secret), encryptSecret(secret), 'a fresh IV per encryption');
}));

test('a tampered ciphertext fails closed rather than returning garbage', withKey(() => {
  const blob = encryptSecret('mgk_live_abcd');
  const [iv, tag, ct] = blob.split(':');
  const flipped = ct.startsWith('0') ? `1${ct.slice(1)}` : `0${ct.slice(1)}`;
  assert.throws(() => decryptSecret(`${iv}:${tag}:${flipped}`));
  assert.throws(() => decryptSecret('not-encrypted'), /malformed/);
}));

test('masking shows only the last four characters', () => {
  assert.equal(maskKey('mgk_live_abcd1234'), '••••1234');
  assert.equal(maskKey('abc'), '••••', 'a short key reveals nothing at all');
  assert.equal(maskKey(''), '••••');
});

test('the vault stores, reads server-side, and never exposes the key', withKey(async () => {
  const store = memoryVaultStore();
  await saveKey(store, 'uid1', 'magnific', 'mgk_live_abcd1234');

  assert.equal(await readKey(store, 'uid1', 'magnific'), 'mgk_live_abcd1234');

  const linked = await listLinked(store, 'uid1');
  assert.equal(linked.length, 1);
  assert.equal(linked[0].provider, 'magnific');
  assert.equal(linked[0].hint, '••••1234');
  assert.equal(JSON.stringify(linked).includes('mgk_live_abcd1234'), false,
    'the client-facing summary must never carry the key');
}));

test('keys are scoped per user and per provider', withKey(async () => {
  const store = memoryVaultStore();
  await saveKey(store, 'uid1', 'magnific', 'KEY-ONE');
  await saveKey(store, 'uid2', 'magnific', 'KEY-TWO');

  assert.equal(await readKey(store, 'uid1', 'magnific'), 'KEY-ONE');
  assert.equal(await readKey(store, 'uid2', 'magnific'), 'KEY-TWO');
  assert.equal(await readKey(store, 'uid1', 'runway'), null, 'a different provider is not the same key');
  assert.equal(await readKey(store, 'uid3', 'magnific'), null, 'an unlinked user gets nothing');
}));

test('relinking replaces the key rather than accumulating', withKey(async () => {
  const store = memoryVaultStore();
  await saveKey(store, 'uid1', 'magnific', 'OLD-KEY-1111');
  await saveKey(store, 'uid1', 'magnific', 'NEW-KEY-2222');
  assert.equal(await readKey(store, 'uid1', 'magnific'), 'NEW-KEY-2222');
  assert.equal((await listLinked(store, 'uid1')).length, 1);
  assert.equal((await listLinked(store, 'uid1'))[0].hint, '••••2222');
}));

test('revoking removes the key for good', withKey(async () => {
  const store = memoryVaultStore();
  await saveKey(store, 'uid1', 'magnific', 'KEY-ONE');
  assert.equal(await revokeKey(store, 'uid1', 'magnific'), true);
  assert.equal(await readKey(store, 'uid1', 'magnific'), null);
  assert.equal((await listLinked(store, 'uid1')).length, 0);
  assert.equal(await revokeKey(store, 'uid1', 'magnific'), false, 'revoking twice is not an error');
}));

test('the vault refuses to store nothing', withKey(async () => {
  const store = memoryVaultStore();
  await assert.rejects(() => saveKey(store, 'uid1', 'magnific', '   '), /No key/);
  await assert.rejects(() => saveKey(store, '', 'magnific', 'KEY'), /Not signed in/);
}));

test('a missing ENCRYPTION_KEY fails loudly instead of storing plaintext', () => {
  const prev = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptSecret('secret'), /ENCRYPTION_KEY/);
  } finally {
    if (prev !== undefined) process.env.ENCRYPTION_KEY = prev;
  }
});

// ── mirroring results into Plajah Storage ─────────────────────────────────────
// Provider URLs are not ours and do not last. These cover the copy, and — more importantly — what
// happens when the copy fails, because that must never turn a finished generation into a lost one.

import {
  extForMime, safeSegment, mirrorPath, firebaseDownloadUrl, mirrorResults,
  FIREBASE_STORAGE_HOST, type MirrorDeps,
} from '../services/fabula/genMirror';

const BUCKET = 'plajah-test.firebasestorage.app';

function fakeDeps(over: Partial<MirrorDeps> = {}): MirrorDeps & { uploads: any[] } {
  const uploads: any[] = [];
  let n = 0;
  return {
    uploads,
    bucket: BUCKET,
    makeToken: () => `tok${++n}`,
    async fetchBytes() { return { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'image/png' }; },
    async upload(path, bytes, contentType, token) { uploads.push({ path, size: bytes.length, contentType, token }); return true; },
    ...over,
  } as MirrorDeps & { uploads: any[] };
}

const RES = (n = 1) => Array.from({ length: n }, (_, i) => ({
  url: `https://cdn.magnific.com/out/${i}.png`, name: `magnific-${i + 1}.png`, mime: 'image/png',
}));

test('extForMime knows the common types and degrades sanely', () => {
  assert.equal(extForMime('image/png'), 'png');
  assert.equal(extForMime('image/jpeg'), 'jpg');
  assert.equal(extForMime('video/quicktime'), 'mov');
  assert.equal(extForMime('image/png; charset=binary'), 'png', 'parameters are stripped');
  assert.equal(extForMime('IMAGE/PNG'), 'png');
  assert.equal(extForMime('image/heic'), 'heic', 'an unknown subtype is a better guess than a default');
  assert.equal(extForMime(undefined), 'bin');
});

test('path segments cannot climb out of the user prefix', () => {
  // projectId and jobId come from the request body; a traversal here would write into another
  // user's storage space.
  assert.equal(safeSegment('../../etc', 'x'), 'etc');
  assert.equal(safeSegment('..', 'x'), 'x');
  assert.equal(safeSegment('a/b/c', 'x'), 'abc');
  assert.equal(safeSegment('job/../1', 'x'), 'job.1', 'dot runs collapse, so no .. survives mid-segment');
  assert.equal(safeSegment('', 'fallback'), 'fallback');
  assert.equal(safeSegment('gj_abc-1.png', 'x'), 'gj_abc-1.png', 'ordinary ids are untouched');

  const p = mirrorPath('uid1', '../../../other', 'job/../1', 0, 'image/png');
  assert.equal(p.includes('..'), false);
  assert.ok(p.startsWith('fabula/uid1/gen/'), 'always inside the caller uid');
});

test('mirror paths land inside the existing fabula storage rule', () => {
  assert.equal(mirrorPath('uid1', 'proj9', 'gj_abc', 0, 'image/png'), 'fabula/uid1/gen/proj9/gj_abc/1.png');
  assert.equal(mirrorPath('uid1', 'proj9', 'gj_abc', 2, 'video/mp4'), 'fabula/uid1/gen/proj9/gj_abc/3.mp4');
});

test('the read URL matches the shape Fabula\'s own uploader produces', () => {
  const url = firebaseDownloadUrl(BUCKET, 'fabula/uid1/gen/p/j/1.png', 'tok1');
  assert.equal(url, `${FIREBASE_STORAGE_HOST}/${BUCKET}/o/fabula%2Fuid1%2Fgen%2Fp%2Fj%2F1.png?alt=media&token=tok1`);
});

test('a successful mirror rewrites every URL to ours', async () => {
  const deps = fakeDeps();
  const out = await mirrorResults(RES(2), { uid: 'uid1', projectId: 'p1', jobId: 'j1' }, deps);

  assert.equal(out.mirrored, 2);
  assert.equal(out.failed, 0);
  assert.equal(out.note, undefined, 'a clean mirror needs no warning');
  out.results.forEach((r) => assert.ok(r.url.startsWith(FIREBASE_STORAGE_HOST), r.url));
  assert.deepEqual(deps.uploads.map((u) => u.path), [
    'fabula/uid1/gen/p1/j1/1.png',
    'fabula/uid1/gen/p1/j1/2.png',
  ]);
  assert.equal(out.results[0].name, 'magnific-1.png', 'the asset name is preserved');
});

test('the provider\'s declared content type wins over our guessed one', async () => {
  const deps = fakeDeps({ async fetchBytes() { return { bytes: new Uint8Array([1]), contentType: 'image/webp' }; } });
  const out = await mirrorResults(RES(1), { uid: 'u', projectId: 'p', jobId: 'j' }, deps);
  assert.equal(out.results[0].mime, 'image/webp');
  assert.ok(out.results[0].url.includes('1.webp'), 'the extension follows the real type');
});

test('a failed copy keeps the provider URL and warns instead of losing the result', async () => {
  const deps = fakeDeps({ async fetchBytes() { throw new Error('provider 404'); } });
  const out = await mirrorResults(RES(1), { uid: 'u', projectId: 'p', jobId: 'j' }, deps);

  assert.equal(out.mirrored, 0);
  assert.equal(out.failed, 1);
  assert.equal(out.results[0].url, 'https://cdn.magnific.com/out/0.png', 'the usable link survives');
  assert.match(out.note || '', /may expire/);
});

test('a failed upload is handled the same way as a failed download', async () => {
  const deps = fakeDeps({ async upload() { return false; } });
  const out = await mirrorResults(RES(1), { uid: 'u', projectId: 'p', jobId: 'j' }, deps);
  assert.equal(out.failed, 1);
  assert.equal(out.results[0].url, 'https://cdn.magnific.com/out/0.png');
});

test('one bad result does not take the good ones down with it', async () => {
  let call = 0;
  const deps = fakeDeps({
    async fetchBytes() {
      if (++call === 2) throw new Error('flaky');
      return { bytes: new Uint8Array([1, 2]), contentType: 'image/png' };
    },
  });
  const out = await mirrorResults(RES(3), { uid: 'u', projectId: 'p', jobId: 'j' }, deps);
  assert.equal(out.mirrored, 2);
  assert.equal(out.failed, 1);
  assert.ok(out.results[0].url.startsWith(FIREBASE_STORAGE_HOST));
  assert.equal(out.results[1].url, 'https://cdn.magnific.com/out/1.png');
  assert.ok(out.results[2].url.startsWith(FIREBASE_STORAGE_HOST));
  assert.match(out.note || '', /1 of 3/);
});

test('an oversized result is refused rather than rejected by the storage rule', async () => {
  const deps = fakeDeps({
    maxBytes: 8,
    async fetchBytes() { return { bytes: new Uint8Array(64), contentType: 'image/png' }; },
  });
  const out = await mirrorResults(RES(1), { uid: 'u', projectId: 'p', jobId: 'j' }, deps);
  assert.equal(out.failed, 1);
  assert.equal(deps.uploads.length, 0, 'nothing is sent that storage would bounce');
});

test('mirroring is idempotent — an already-mirrored URL is left alone', async () => {
  const deps = fakeDeps();
  const already = [{ url: firebaseDownloadUrl(BUCKET, 'fabula/u/gen/p/j/1.png', 'tok1'), name: 'a.png', mime: 'image/png' }];
  const out = await mirrorResults(already, { uid: 'u', projectId: 'p', jobId: 'j' }, deps);
  assert.equal(out.mirrored, 1);
  assert.equal(out.failed, 0);
  assert.equal(deps.uploads.length, 0, 're-mirroring would duplicate the object and burn storage');
  assert.deepEqual(out.results, already);
});

test('an empty result set is a no-op, not an error', async () => {
  const out = await mirrorResults([], { uid: 'u', projectId: 'p', jobId: 'j' }, fakeDeps());
  assert.deepEqual(out, { results: [], mirrored: 0, failed: 0 });
});
