// Builds a native HQ game package: content-addressed chunks + a signed manifest (docs/GAME_DELIVERY_ARCHITECTURE.md §5).
//
//   npx tsx scripts/games/buildGamePackage.ts --config games/era-clash-3d/package.config.json --out D:/plajah-packages/era-clash
//     [--prev <old manifest.json>]   report which chunks an update reuses
//     [--install <dir>]              also unpack the files + index.json the way the app's downloader will (a dev install:
//                                    serve <dir> and open the game with ?pkg=<that url>)
//     [--genkey <dir>]               write a new Ed25519 key pair (pkcs8 private + spki public, base64) and exit
//   Signing key: PLAJAH_PKG_KEY = path to the base64 pkcs8 private key. Without it the manifest is left unsigned (dev only;
//   the apps refuse unsigned manifests).
//
// Chunking is stable on purpose: files are taken group by group in path order, and a chunk closes at the size target or,
// once a quarter full, when the folder changes. So changing one texture rewrites one chunk and an update downloads only that.

import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalJson, installedIndex, planInstall, sha256Hex, signManifest, validateManifest,
  type ChunkRef, type PackageGroup, type PackageManifest, type PackagePlatform, type PackageTier,
} from '../../services/gamePackages/manifest';

interface GroupCfg { id: string; required?: boolean; bounds?: [number, number, number, number]; include: string[] }
interface Config {
  gameId: string; platform: PackagePlatform; tier: PackageTier; version: string; build: number;
  root: string; chunkMb?: number; minApp?: string; requires?: PackageManifest['requires']; groups: GroupCfg[];
}

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };

/** Glob → RegExp: `**` any depth, `*` within a segment, `{a,b}` alternatives. */
export function globRe(g: string): RegExp {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '{') { const j = g.indexOf('}', i); re += `(?:${g.slice(i + 1, j).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`; i = j; }
    else re += /[.+^$()|[\]\\?]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${re}$`);
}

function walk(dir: string, rel: string, out: string[]) {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out); else if (e.isFile()) out.push(r);
  }
}

function matchFiles(root: string, include: string[]): string[] {
  const found = new Set<string>();
  for (const g of include) {
    const lit = g.split('/'); const stop = lit.findIndex((s) => /[*{]/.test(s));
    const base = (stop < 0 ? lit.slice(0, -1) : lit.slice(0, stop)).join('/');
    const files: string[] = []; walk(path.join(root, base), base, files);
    const re = globRe(g);
    for (const f of files) if (re.test(f)) found.add(f);
  }
  return [...found].sort();
}

async function main() {
  const gen = arg('genkey');
  if (gen) {
    const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    fs.mkdirSync(gen, { recursive: true });
    fs.writeFileSync(path.join(gen, 'pkg-signing.pkcs8.b64'), Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64'));
    fs.writeFileSync(path.join(gen, 'pkg-signing.spki.b64'), Buffer.from(await crypto.subtle.exportKey('spki', kp.publicKey)).toString('base64'));
    console.log(`key pair written to ${gen} (keep the pkcs8 file secret; the spki public key goes into the apps)`);
    return;
  }
  const cfgPath = arg('config'), out = arg('out');
  if (!cfgPath || !out) throw new Error('usage: --config <package.config.json> --out <dir>');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as Config;
  const root = path.resolve(cfg.root);
  const target = (cfg.chunkMb ?? 32) * 1024 * 1024;
  fs.mkdirSync(path.join(out, 'chunks'), { recursive: true });

  const chunks: ChunkRef[] = [], groups: PackageGroup[] = [], files: Record<string, string> = {};
  const taken = new Set<string>();
  for (const g of cfg.groups) {
    const list = matchFiles(root, g.include).filter((f) => !taken.has(f));
    list.forEach((f) => taken.add(f));
    if (!list.length) console.warn(`group ${g.id}: no files matched`);
    const ids: string[] = [];
    let parts: { file: string; buf: Buffer }[] = [], size = 0;
    const flush = async () => {
      if (!parts.length) return;
      const buf = Buffer.concat(parts.map((p) => p.buf));
      const id = `sha256:${await sha256Hex(buf)}`;
      let off = 0;
      for (const p of parts) { files[p.file] = `${id}@${off}+${p.buf.length}`; off += p.buf.length; }
      const dest = path.join(out, 'chunks', id.slice(7));
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
      if (!chunks.some((c) => c.id === id)) chunks.push({ id, bytes: buf.length });
      ids.push(id);
      parts = []; size = 0;
    };
    let dir = '';
    for (const f of list) {
      const buf = fs.readFileSync(path.join(root, f));
      const d = path.posix.dirname(f);
      if (size && (size + buf.length > target || (d !== dir && size >= target / 4))) await flush();
      parts.push({ file: f, buf }); size += buf.length; dir = d;
    }
    await flush();
    groups.push({ id: g.id, ...(g.required ? { required: true } : {}), ...(g.bounds ? { bounds: g.bounds } : {}), chunks: ids, bytes: ids.reduce((s, id) => s + chunks.find((c) => c.id === id)!.bytes, 0) });
  }

  let manifest: PackageManifest = {
    schema: 1, gameId: cfg.gameId, platform: cfg.platform, tier: cfg.tier, version: cfg.version, build: cfg.build,
    ...(cfg.minApp ? { minApp: cfg.minApp } : {}), ...(cfg.requires ? { requires: cfg.requires } : {}),
    chunks, groups, files,
  };
  const errs = validateManifest(manifest);
  if (errs.length) throw new Error(`manifest invalid:\n  ${errs.join('\n  ')}`);
  const keyPath = process.env.PLAJAH_PKG_KEY;
  if (keyPath) {
    const key = await crypto.subtle.importKey('pkcs8', Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64'), 'Ed25519', false, ['sign']);
    manifest = await signManifest(manifest, key);
  } else console.warn('PLAJAH_PKG_KEY not set: manifest is UNSIGNED (dev only)');
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(out, 'manifest.canonical.json'), canonicalJson(manifest));

  const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
  console.log(`${cfg.gameId} ${cfg.version} (build ${cfg.build}): ${Object.keys(files).length} files, ${chunks.length} chunks, ${mb(chunks.reduce((s, c) => s + c.bytes, 0))}`);
  for (const g of groups) console.log(`  ${g.id}${g.required ? ' (required)' : ''}: ${g.chunks.length} chunks, ${mb(g.bytes)}`);

  const prev = arg('prev');
  if (prev) {
    const old = JSON.parse(fs.readFileSync(prev, 'utf8')) as PackageManifest;
    const plan = planInstall(manifest, { have: old.chunks.map((c) => c.id) });
    console.log(`update from build ${old.build}: download ${mb(plan.downloadBytes)} (${plan.fetch.length} chunks), reuse ${plan.reuse.length} chunks`);
  }

  const install = arg('install');
  if (install) {
    // Exactly what the downloader produces after verifying each chunk: the files under their web paths + index.json.
    const all = groups.map((g) => g.id);
    for (const [file, ref] of Object.entries(files)) {
      const m = /^sha256:([0-9a-f]{64})@(\d+)\+(\d+)$/.exec(ref)!;
      const fd = fs.openSync(path.join(out, 'chunks', m[1]), 'r');
      const buf = Buffer.alloc(Number(m[3])); fs.readSync(fd, buf, 0, buf.length, Number(m[2])); fs.closeSync(fd);
      const dest = path.join(install, ...file.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    }
    fs.writeFileSync(path.join(install, 'index.json'), JSON.stringify(installedIndex(manifest, all), null, 1));
    console.log(`dev install unpacked to ${install}`);
  }
}

if (process.argv[1] && /buildGamePackage/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
