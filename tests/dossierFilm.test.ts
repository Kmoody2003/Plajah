import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildDouglassFilm } from '../data/dossier/douglassFilm';
import { douglassDossier } from '../data/dossier/douglass';
import { layout, XFADE, type FilmScene } from '../services/dossier/film/filmTypes';
import { captionChunks } from '../services/dossier/film/motion';

const spec = buildDouglassFilm();
const claimIds = new Set(douglassDossier.ledger.claims.map(c => c.id));
const assetIds = new Set(spec.assets.map(a => a.id));

const assetRefs = (s: FilmScene): string[] => {
  const r = s as unknown as Record<string, unknown>;
  return ['asset', 'bgAsset'].map(k => r[k]).filter((v): v is string => typeof v === 'string');
};

test('every scene id is unique', () => {
  const ids = spec.scenes.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every claim a scene cites exists in the dossier ledger', () => {
  const missing = spec.scenes.flatMap(s => (s.claimIds ?? []).filter(id => !claimIds.has(id)).map(id => `${s.id}→${id}`));
  assert.deepEqual(missing, []);
});

test('factual scenes cite at least one claim', () => {
  const factual = spec.scenes.filter(s => ['map', 'chart', 'masthead', 'timeline', 'quote'].includes(s.kind));
  const uncited = factual.filter(s => !(s.claimIds?.length)).map(s => s.id);
  assert.deepEqual(uncited, []);
});

test('every referenced asset is declared, credited, and on disk', () => {
  for (const s of spec.scenes) for (const id of assetRefs(s)) assert.ok(assetIds.has(id), `${s.id} uses undeclared asset ${id}`);
  for (const a of spec.assets) {
    assert.ok(a.credit.trim().length > 0, `${a.id} has no credit`);
    if (a.src.startsWith('/')) assert.ok(existsSync(join('public', a.src)), `${a.id} missing file ${a.src}`);
  }
});

test('layout: scenes are ordered, overlap only by the crossfade, and fit narration', () => {
  const { placed, duration } = layout(spec);
  assert.equal(placed.length, spec.scenes.length);
  for (let i = 1; i < placed.length; i++) {
    assert.ok(placed[i].start >= placed[i - 1].start, 'scene starts are monotonic');
    assert.ok(placed[i - 1].end - placed[i].start <= XFADE + 1e-6, `overlap too large at ${placed[i].scene.id}`);
  }
  for (const p of placed) {
    const n = p.scene.narration;
    if (n?.duration) assert.ok(p.voiceAt + n.duration <= p.end + 1e-6, `${p.scene.id} narration overruns scene`);
    assert.ok(p.end - p.start >= p.scene.min - 1e-6, `${p.scene.id} shorter than its minimum`);
  }
  assert.ok(duration > 120 && duration < 900, `film length ${duration}s is out of range`);
});

test('caption chunks cover the narration without losing words, in time order', () => {
  for (const s of spec.scenes) {
    if (!s.narration) continue;
    const chunks = captionChunks(s.narration.text, 10);
    assert.equal(chunks.map(c => c.text).join(' ').split(/\s+/).join(' '), s.narration.text.trim().split(/\s+/).join(' '), s.id);
    for (let i = 0; i < chunks.length; i++) {
      assert.ok(chunks[i].a < chunks[i].b, `${s.id} chunk ${i} has no duration`);
      if (i) assert.ok(chunks[i].a >= chunks[i - 1].a, `${s.id} chunks out of order`);
    }
  }
});
