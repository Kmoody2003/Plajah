import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson, installedIndex, normPath, parseFileRef, planInstall, signManifest, validateManifest, verifyManifest,
  type PackageManifest,
} from '../services/gamePackages/manifest';
import { pickTier } from '../services/gamePackages/tiers';
import { globRe } from '../scripts/games/buildGamePackage';

const h = (c: string) => `sha256:${c.repeat(64)}`;
function manifest(): PackageManifest {
  return {
    schema: 1, gameId: 'era-clash', platform: 'win-x64', tier: 'native-pc', version: '0.1.0', build: 2,
    chunks: [{ id: h('a'), bytes: 100 }, { id: h('b'), bytes: 50 }, { id: h('c'), bytes: 70 }],
    groups: [
      { id: 'core', required: true, chunks: [h('a')], bytes: 100 },
      { id: 'region:north', bounds: [0, 0, 100, 100], chunks: [h('b')], bytes: 50 },
      { id: 'region:south', bounds: [0, -100, 100, 0], chunks: [h('c'), h('a')], bytes: 170 },
    ],
    files: {
      'games/x/tex/a.jpg': `${h('a')}@0+60`, 'games/x/tex/b.jpg': `${h('a')}@60+40`,
      'games/x/north.glb': `${h('b')}@0+50`, 'games/x/south.glb': `${h('c')}@0+70`,
    },
  };
}

test('paths normalise to bare web paths', () => {
  assert.equal(normPath('https://plajah.com/games/a%20b/x.jpg?v=3#k'), 'games/a b/x.jpg');
  assert.equal(normPath('/games/x.jpg'), 'games/x.jpg');
  assert.equal(normPath('games\\x.jpg'), 'games/x.jpg');
});

test('file refs parse and bad ones throw', () => {
  assert.deepEqual(parseFileRef(`${h('a')}@60+40`), { chunk: h('a'), offset: 60, length: 40 });
  assert.throws(() => parseFileRef('sha256:zz@1+2'));
});

test('canonical JSON sorts keys at every level', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
});

test('a well-formed manifest validates; unsafe or broken entries are caught', () => {
  assert.deepEqual(validateManifest(manifest()), []);
  const m = manifest();
  m.files['../evil.dll'] = `${h('a')}@0+1`;
  m.files['games/x/long.bin'] = `${h('b')}@40+20`;
  m.groups = m.groups.filter((g) => g.id !== 'core');
  const errs = validateManifest(m).join('|');
  assert.match(errs, /unsafe path \.\.\/evil\.dll/);
  assert.match(errs, /runs past its chunk/);
  assert.match(errs, /no required core group/);
});

test('signatures verify, and any change to the manifest breaks them', async () => {
  const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
  const signed = await signManifest(manifest(), kp.privateKey);
  assert.ok(signed.signature?.startsWith('ed25519:'));
  assert.equal(await verifyManifest(signed, kp.publicKey), true);
  assert.equal(await verifyManifest({ ...signed, build: 3 }, kp.publicKey), false);
  assert.equal(await verifyManifest({ ...manifest() }, kp.publicKey), false);
  // key order in the stored JSON does not matter: the canonical bytes are what is signed
  const reordered = Object.fromEntries(Object.entries(signed).reverse()) as unknown as PackageManifest;
  assert.equal(await verifyManifest(reordered, kp.publicKey), true);
});

test('install plan: core first, the region the player is in next, shared chunks fetched once', () => {
  const p = planInstall(manifest(), { at: [50, -50] });
  assert.deepEqual(p.groups, ['core', 'region:south', 'region:north']);
  assert.deepEqual(p.fetch.map((c) => c.id), [h('a'), h('c'), h('b')]);
  assert.equal(p.downloadBytes, 220);
  assert.equal(p.installBytes, 220);
});

test('an update downloads only chunks whose hash changed', () => {
  const p = planInstall(manifest(), { have: [h('a'), h('b')] });
  assert.deepEqual(p.fetch.map((c) => c.id), [h('c')]);
  assert.deepEqual(p.reuse.sort(), [h('a'), h('b')].sort());
  assert.equal(p.downloadBytes, 70);
});

test('installed index lists only files whose chunks are installed', () => {
  const ix = installedIndex(manifest(), ['core', 'region:north']);
  assert.deepEqual(ix.paths, ['games/x/north.glb', 'games/x/tex/a.jpg', 'games/x/tex/b.jpg']);
  assert.equal(ix.tier, 'native-pc');
});

test('tiers: browser keeps its old choices; packages only apply on their own platform', () => {
  const base = { isMobile: false, isTv: false, integrated: false, inDesktopApp: false };
  assert.deepEqual(pickTier(base), { tier: 'web', quality: 'high', textures: '2k', frameTargetMs: 16.7 });
  assert.equal(pickTier({ ...base, integrated: true }).quality, 'medium');
  assert.equal(pickTier({ ...base, integrated: true }).textures, '1k');
  assert.equal(pickTier({ ...base, isMobile: true }).quality, 'low');
  assert.equal(pickTier({ ...base, inDesktopApp: true }).tier, 'web');
  assert.equal(pickTier({ ...base, inDesktopApp: true, packageTier: 'native-pc' }).tier, 'native-pc');
  assert.equal(pickTier({ ...base, inDesktopApp: true, integrated: true, packageTier: 'native-pc' }).quality, 'high');
  assert.equal(pickTier({ ...base, packageTier: 'native-pc' }).tier, 'web', 'a PC package outside the app is ignored');
  assert.equal(pickTier({ ...base, isMobile: true, packageTier: 'native-pc' }).tier, 'web');
  const mob = pickTier({ ...base, isMobile: true, packageTier: 'native-mobile' });
  assert.deepEqual([mob.tier, mob.quality, mob.textures], ['native-mobile', 'medium', '2k']);
  assert.equal(pickTier({ ...base, q: 'low', inDesktopApp: true, packageTier: 'native-pc' }).quality, 'low');
  assert.equal(pickTier({ ...base, q: 'bogus' }).quality, 'high');
});

test('package globs: braces, single and double stars', () => {
  const re = globRe('games/t/{a,b_2}/{diff,nor_gl}.jpg');
  assert.ok(re.test('games/t/a/diff.jpg'));
  assert.ok(re.test('games/t/b_2/nor_gl.jpg'));
  assert.ok(!re.test('games/t/a/diff_1k.jpg'));
  assert.ok(globRe('games/**/x.glb').test('games/a/b/x.glb'));
  assert.ok(!globRe('games/*/x.glb').test('games/a/b/x.glb'));
});
