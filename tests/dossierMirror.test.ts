/**
 * No Dossier exhibit may depend on a third-party image host at runtime. Every archive image is mirrored under
 * public/dossier/<slug>/archival/ by scripts/dossier/mirrorAssets.ts; this fails if a remote url creeps back in,
 * a local path points at nothing, or an asset loses its Commons provenance on the way.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DOSSIERS } from '../data/dossier/registry';
import { sniff } from '../scripts/dossier/mirrorAssets';

const EXHIBITS: Array<{ id: string; slug: string; files: string[] }> = [
  { id: 'partition-1947', slug: 'partition', files: ['partitionAssets.json'] },
  { id: 'founding-era', slug: 'founding', files: ['foundingAssets.json'] },
  { id: 'christianity-in-persia', slug: 'persia', files: ['persiaAssets.json'] },
  { id: 'frederick-douglass', slug: 'douglass', files: ['douglassAssets.json', 'douglassFilmAssets.json'] },
  { id: 'henry-ford', slug: 'ford', files: ['fordAssets.json'] },
];
const DATA = 'data/dossier';
const PUB = 'public';
const isRemote = (u: unknown) => typeof u === 'string' && /^(https?:)?\/\//i.test(u);
const OK = ['mirrored', 'reused-local', 'deduped'];
type Raw = { id: string; url: string; originalUrl?: string; recordUrl?: string; rights: { status: string; credit: string; verifiedAt?: string } };
const readRaw = (f: string): Raw[] => JSON.parse(fs.readFileSync(path.join(DATA, f), 'latin1'));   // fordAssets.json holds a non-UTF-8 byte
const manifest: Array<{ id: string; slug: string; originalUrl: string; localPath: string; bytes: number; sha256: string; status: string }> =
  JSON.parse(fs.readFileSync(path.join(DATA, 'mirror-manifest.json'), 'utf8'));

test('mirror: no asset url in the five exhibits is remote, and every local path exists as a real image', async () => {
  for (const ex of EXHIBITS) {
    const d = await DOSSIERS.find(x => x.id === ex.id)!.load();
    assert.ok(d.assets.length > 0, ex.id);
    for (const a of d.assets) {
      assert.ok(!isRemote(a.url), `${ex.id}/${a.id} still points at a remote host: ${a.url}`);
      assert.ok(a.url.startsWith('/dossier/'), `${ex.id}/${a.id}: ${a.url}`);
      const file = path.join(PUB, a.url);
      assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, `${ex.id}/${a.id}: missing file ${a.url}`);
      if (a.kind !== 'recreation') assert.ok(a.url.startsWith(`/dossier/${ex.slug}/archival/`) || a.url.startsWith(`/dossier/${ex.slug}/maps/`), `${a.id}: archive images live under archival/ or maps/ (${a.url})`);
    }
  }
});

test('mirror: the raw asset files carry local urls, keep their Commons provenance and still validate as publishable', () => {
  for (const ex of EXHIBITS) for (const f of ex.files) {
    const raw = readRaw(f);
    assert.ok(raw.length > 0, f);
    for (const a of raw) {
      assert.ok(!isRemote(a.url), `${f}/${a.id}: ${a.url}`);
      const file = path.join(PUB, a.url);
      assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, `${f}/${a.id}: missing ${a.url}`);
      const type = sniff(fs.readFileSync(file));
      assert.ok(type && ['jpg', 'png', 'webp', 'gif'].includes(type), `${f}/${a.id}: ${a.url} is not a displayable image (${type})`);
      // provenance survives the move
      assert.ok(a.recordUrl && /^https:\/\//.test(a.recordUrl), `${f}/${a.id}: recordUrl lost`);
      assert.ok(a.rights.credit && a.rights.verifiedAt, `${f}/${a.id}: rights provenance lost`);
      if (/wikimedia/.test(a.recordUrl) && !/FilmAssets/.test(f)) assert.ok(/^https:\/\/commons\.wikimedia\.org\//.test(a.rights.verifiedAt!), `${f}/${a.id}: Commons verifiedAt lost`);
      if (a.originalUrl) assert.ok(isRemote(a.originalUrl), `${f}/${a.id}: originalUrl should be the remote source`);
    }
  }
});

test('mirror: the manifest accounts for every asset, hashes match the files, and nothing failed', () => {
  const byKey = new Map(manifest.map(e => [`${e.slug}/${e.id}`, e]));
  for (const ex of EXHIBITS) for (const f of ex.files) for (const a of readRaw(f)) {
    const e = byKey.get(`${ex.slug}/${a.id}`);
    if (!e) { assert.ok(!a.originalUrl, `${f}/${a.id}: rewritten but not in mirror-manifest.json`); continue; }   // assets that were always local have no entry
    assert.ok(OK.includes(e.status), `${a.id}: manifest status ${e.status}`);
    assert.equal(e.localPath, a.url, `${a.id}: manifest and asset file disagree`);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, e.localPath))).digest('hex'), e.sha256, `${a.id}: file changed since it was mirrored`);
    assert.ok(isRemote(e.originalUrl), a.id);
  }
});

test('mirror: Tela timelines, Fabula films and the lobby heroes use local images too', async () => {
  const REMOTE_IMG = /https?:\/\/(?:upload\.wikimedia\.org|tile\.loc\.gov|commons\.wikimedia\.org\/w\/index\.php\?title=Special:FilePath)[^"'`\s)]*/g;
  const files = fs.readdirSync(DATA).filter(f => /\.tela\.json$|Fabula\.json$/.test(f)).concat(['registry.ts']);
  assert.ok(files.length >= 7);
  for (const f of files) {
    const text = fs.readFileSync(path.join(DATA, f), 'latin1');
    assert.deepEqual(text.match(REMOTE_IMG) ?? [], [], `${f} still references a remote image`);
    if (f.endsWith('.json')) for (const m of text.matchAll(/"(?:sourceImageSrc|url|src)":\s*"(\/dossier\/[^"]+\.(?:jpg|png|webp|gif))"/g))
      assert.ok(fs.existsSync(path.join(PUB, m[1])), `${f}: missing ${m[1]}`);
  }
  for (const d of DOSSIERS) {
    assert.ok(d.heroUrl && !isRemote(d.heroUrl), `${d.id} hero must be local`);
    assert.ok(fs.existsSync(path.join(PUB, d.heroUrl)), `${d.id} hero missing: ${d.heroUrl}`);
  }
});
