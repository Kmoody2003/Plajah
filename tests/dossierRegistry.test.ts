import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DOSSIERS } from '../data/dossier/registry';
import { validateDossier } from '../services/dossier/dossierTypes';

test('registry lists the four exhibits with lobby artwork and years', () => {
  assert.deepEqual(DOSSIERS.map(d => d.id), ['frederick-douglass', 'henry-ford', 'christianity-in-persia', 'partition-1947']);
  for (const d of DOSSIERS) { assert.ok(d.heroUrl?.startsWith('https://'), d.id); assert.ok(d.years, d.id); assert.ok(d.tagline, d.id); }
});

for (const entry of DOSSIERS) {
  test(`${entry.id}: loads through the registry and validates with reconstructions attached`, async () => {
    const d = await entry.load();
    assert.equal(d.id, entry.id);
    const errors = validateDossier(d).filter(i => i.severity === 'error');
    assert.deepEqual(errors, []);
    const recon = d.assets.filter(a => a.kind === 'recreation');
    if (!entry.artPending) assert.ok(recon.length >= 8, `${entry.id} should have >= 8 reconstructions, has ${recon.length}`);
    for (const a of recon) {
      assert.equal(a.rights.status, 'generated');
      assert.ok(a.reconstruction?.basis, `${a.id} needs a basis`);
      // every reconstruction is shown somewhere
      assert.ok(d.rooms.some(r => r.nodes.some(n => n.assetIds.includes(a.id))), `${a.id} not attached to any node`);
      // and has a real image file behind it
      assert.ok(fs.existsSync(path.join('public', a.url)), `missing image file for ${a.id}: ${a.url}`);
    }
  });
}

test('topic exhibit never depicts a person in a generated image; biographies only depict documented figures', async () => {
  const persia = await DOSSIERS.find(d => d.id === 'christianity-in-persia')!.load();
  for (const a of persia.assets.filter(x => x.kind === 'recreation')) assert.deepEqual(a.reconstruction?.characterIds, []);
  const ford = await DOSSIERS.find(d => d.id === 'henry-ford')!.load();
  for (const a of ford.assets.filter(x => x.kind === 'recreation'))
    for (const c of a.reconstruction!.characterIds) assert.ok(ford.characters.some(ch => ch.id === c), c);
});

for (const entry of DOSSIERS) {
  test(`${entry.id}: Fabula film is a valid production whose files exist and whose subtitles match the film script`, async () => {
    if (entry.artPending) return; // film and paintings are still to be produced (see docs/dossier/partition-research-notes.md)
    assert.ok(entry.fabulaFilm, 'every exhibit hands its film to Fabula');
    const prod: any = await entry.fabulaFilm!();
    const media = new Map(prod.mediaPool.map((m: any) => [m.id, m]));
    const tracks = new Set(prod.tracks.map((t: any) => t.id));
    const clips = prod.edits[0].timeline.clips;
    for (const c of clips) {
      assert.ok(tracks.has(c.trackId), `track ${c.trackId}`);
      assert.ok(c.duration > 0 && c.start >= 0);
      if (c.kind === 'media') {
        const m: any = media.get(c.assetId);
        assert.ok(m, `asset ${c.assetId}`);
        if (m.url.startsWith('/')) assert.ok(fs.existsSync(path.join('public', m.url)), `missing file ${m.url}`);
      }
    }
    for (const tr of ['s1', 'v1', 'a1']) {
      const on = clips.filter((c: any) => c.trackId === tr).sort((a: any, b: any) => a.start - b.start);
      for (let i = 1; i < on.length; i++) assert.ok(on[i].start >= on[i - 1].start + on[i - 1].duration - 0.02, `overlap on ${tr}`);
    }
    const slug = entry.id === 'frederick-douglass' ? 'douglass' : entry.id === 'henry-ford' ? 'ford' : 'persia';
    const film = JSON.parse(fs.readFileSync(path.join('data', 'dossier', `${slug}Film.json`), 'utf8'));
    const subs = clips.filter((c: any) => c.kind === 'subtitle').map((c: any) => c.text);
    assert.deepEqual(subs, film.beats.map((b: any) => b.text));
  });
}

test('every film beat cites claims that exist in its dossier', async () => {
  for (const [id, slug] of [['frederick-douglass', 'douglass'], ['henry-ford', 'ford'], ['christianity-in-persia', 'persia']] as const) {
    const d = await DOSSIERS.find(x => x.id === id)!.load();
    const ids = new Set(d.ledger.claims.map(c => c.id));
    const film = JSON.parse(fs.readFileSync(path.join('data', 'dossier', `${slug}Film.json`), 'utf8'));
    for (const b of film.beats) for (const c of b.claims ?? []) assert.ok(ids.has(c), `${slug} film cites unknown claim ${c}`);
  }
});
