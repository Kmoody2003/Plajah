// Collects the complete source of the FFmpeg we bundle: FFmpeg, BtbN's build scripts, and every library those
// scripts compile in, each at the commit the build used. GPLv3 6(d) requires it to be hosted next to our download.
//   node scripts/buildFfmpegSource.mjs [workDir]        default D:\plajah-ffmpeg-source
// Nothing fetched is executed. Build scripts are read as text, git only archives trees, cargo only vendors.
// Rerunning resumes: finished components are kept. Change the pins with fetchFfmpeg.mjs's.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = 'autobuild-2026-11-01-12-49';
const ZIP = 'ffmpeg-n8.1.3-29-gad3b795b72-win64-gpl-8.1.zip';
const ZIP_SHA256 = '0bf508ade2d757f3e9116418768deefb4046a3a1d5a9ed32299ea4fb929dd231';
const FFMPEG_COMMIT = 'ad3b795b72388fbb2b216e1e6fd38fba994e1df0';
const BUILDS_COMMIT = '5ece62897c650b863c1ddda7b6964845344aef2d';
const WASM_TAG = 'v0.12.10'; // @ffmpeg/core, the pack Crossover fetches where there is no ffmpeg program

// In the scripts but not in this binary: Linux-only, nonfree, or turned off in its configure line.
const LEFT_OUT = [/^45-x11\//, /^50-vaapi\/(30|40)-/, /^10-xorg-macros/, /^45-pulseaudio/, /^50-fdk-aac/, /^50-whisper/];
// Scripts that fetch only some submodules. Others take them all, as their scripts do.
const ONLY_SUBMODULES = { '50-libjxl/50-libjxl': ['third_party/highway'] };
const NO_SUBMODULES = /^(10-|20-|50-x265|50-svtav1|50-amf)/;

const work = resolve(process.argv[2] || 'D:\\plajah-ffmpeg-source');
const repos = join(work, 'repos');
const parts = join(work, 'components');
const temp = join(work, 'temp');
for (const d of [repos, parts, temp]) mkdirSync(d, { recursive: true });

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 4).join(' ')}: ${(r.stderr || r.error || '').toString().trim().slice(-400)}`);
  return r.stdout;
};
const safe = (s) => s.replace(/[^\w.-]+/g, '_');
const git = (dir, ...args) => run('git', ['-c', 'core.longpaths=true', '-C', dir, ...args]);

function bareRepo(url) {
  const dir = join(repos, safe(url.replace(/^\w+:\/\//, '')));
  if (!existsSync(join(dir, 'HEAD'))) {
    run('git', ['init', '-q', '--bare', dir]);
    git(dir, 'remote', 'add', 'origin', url);
    // Without this, a project's export-ignore rules would quietly drop files from the archive.
    writeFileSync(join(dir, 'info', 'attributes'), '* -export-ignore -export-subst\n');
  }
  return dir;
}

function fetchCommit(dir, commit) {
  if (spawnSync('git', ['-C', dir, 'cat-file', '-e', `${commit}^{commit}`]).status === 0) return;
  // Some servers refuse fetching a bare commit; the whole history always has it.
  const shallow = spawnSync('git', ['-C', dir, 'fetch', '-q', '--depth=1', 'origin', commit], { encoding: 'utf8' });
  if (shallow.status !== 0) git(dir, 'fetch', '-q', 'origin', '+refs/*:refs/remotes/origin/*');
  git(dir, 'cat-file', '-e', `${commit}^{commit}`);
}

const manifest = [];
function archive(url, commit, name, prefix, submodules = 'all') {
  const dir = bareRepo(url);
  const out = join(parts, `${safe(name)}.tar`);
  fetchCommit(dir, commit);
  if (!existsSync(out)) {
    const tmp = `${out}.tmp`;
    git(dir, 'archive', '--worktree-attributes', '--format=tar', `--prefix=${prefix}/`, '-o', tmp, commit);
    renameSync(tmp, out);
  }
  manifest.push({ path: prefix, repo: url, commit });
  console.log(`  ${prefix} @ ${commit.slice(0, 12)}`);
  if (submodules === 'none') return;

  const links = git(dir, 'ls-tree', '-r', commit).split('\n').filter((l) => l.startsWith('160000'));
  if (!links.length) return;
  const modules = git(dir, 'config', '--blob', `${commit}:.gitmodules`, '--list');
  for (const line of links) {
    const [meta, path] = line.split('\t');
    const sub = meta.split(' ')[2];
    if (Array.isArray(submodules) && !submodules.includes(path)) continue;
    const key = modules.split('\n').find((l) => l.endsWith(`.path=${path}`))?.match(/^submodule\.(.+)\.path=/)?.[1];
    let subUrl = modules.split('\n').find((l) => l.startsWith(`submodule.${key}.url=`))?.split('=').slice(1).join('=');
    if (!subUrl) throw new Error(`No URL for submodule ${path} of ${url}`);
    if (subUrl.startsWith('.')) subUrl = new URL(subUrl, `${url.replace(/\.git$/, '')}/`).href;
    archive(subUrl, sub, `${name}__${path}`, `${prefix}/${path}`);
  }
}

// shaderc pulls its dependencies from a DEPS file, not submodules.
function shadercDeps(url, commit, name, prefix) {
  const text = git(bareRepo(url), 'show', `${commit}:DEPS`);
  const vars = Object.fromEntries([...text.matchAll(/'(\w+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  for (const m of text.matchAll(/'(third_party\/[\w/-]+)':\s*\n?\s*(.+?),?\n/g)) {
    const spec = [...m[2].matchAll(/Var\('(\w+)'\)|'([^']*)'/g)].map((p) => (p[1] ? vars[p[1]] : p[2])).join('');
    const [depUrl, rev] = spec.split('@');
    if (!depUrl || !rev) throw new Error(`Could not read the shaderc dep ${m[1]}`);
    archive(depUrl, rev, `${name}__${m[1]}`, `${prefix}/${m[1]}`, 'none');
  }
}

// Rust libraries statically link their crates, so those are source of the binary too.
function vendorCrates(url, commit, name, prefix, preUpdate) {
  const out = join(parts, `${safe(name)}__crates.tar`);
  if (existsSync(out)) { manifest.push({ path: `${prefix}/vendor`, repo: 'crates.io', commit: 'Cargo.lock' }); return; }
  const dir = join(temp, safe(name));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // Symlinks may not unpack on Windows; cargo only needs the manifests, so that failure doesn't matter.
  spawnSync('tar', ['-xf', join(parts, `${safe(name)}.tar`).replace(/\\/g, '/').replace(/^(\w):/, '/$1'), '-C', dir.replace(/\\/g, '/').replace(/^(\w):/, '/$1')], { stdio: 'ignore' });
  const root = join(dir, prefix);
  const env = { ...process.env, CARGO_HOME: join(temp, 'cargo-home') };
  if (preUpdate) run('cargo', ['update', preUpdate], { cwd: root, env });
  const config = run('cargo', ['vendor', '--versioned-dirs'], { cwd: root, env });
  mkdirSync(join(root, '.cargo'), { recursive: true });
  writeFileSync(join(root, '.cargo', 'config.toml'), config);
  run('tar', ['-cf', `${relative(root, out).replace(/\\/g, '/')}.tmp`, '--transform', `s,^,${prefix}/,`, 'vendor', '.cargo', 'Cargo.lock'], { cwd: root });
  renameSync(`${out}.tmp`, out);
  rmSync(dir, { recursive: true, force: true });
  manifest.push({ path: `${prefix}/vendor`, repo: 'crates.io', commit: 'Cargo.lock' });
  console.log(`  ${prefix}/vendor (crates)`);
}

// LAME and Xvid live in Subversion. Its servers answer plain WebDAV at a fixed revision, so no svn client is
// needed; the anonymous login is the one the build scripts use for Xvid.
async function svnExport(url, rev, name, prefix) {
  const out = join(parts, `${safe(name)}.tar`);
  if (!existsSync(out)) {
    const dir = join(temp, safe(name));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const { origin, pathname } = new URL(url);
    const repoRoot = pathname.slice(0, pathname.indexOf('/trunk'));
    const base = `${repoRoot}/!svn/bc/${rev}${pathname.slice(repoRoot.length)}`;
    const headers = { Authorization: `Basic ${Buffer.from('anonymous:').toString('base64')}` };
    const pull = async (at) => {
      const res = await fetch(`${origin}${at}`, { method: 'PROPFIND', headers: { ...headers, Depth: '1', 'Content-Type': 'text/xml' }, body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>' });
      if (res.status !== 207) throw new Error(`${at}: ${res.status}`);
      for (const [entry] of (await res.text()).matchAll(/<D:response[\s\S]*?<\/D:response>/g)) {
        const href = entry.match(/<D:href>([^<]+)<\/D:href>/)[1].replace(/&amp;/g, '&');
        if (href.replace(/\/$/, '') === at.replace(/\/$/, '')) continue;
        const target = join(dir, 'src', decodeURIComponent(href.slice(base.length)));
        if (/<D:collection\s*\/>/.test(entry)) { mkdirSync(target, { recursive: true }); await pull(href); continue; }
        const file = await fetch(`${origin}${href}`, { headers });
        if (!file.ok) throw new Error(`${href}: ${file.status}`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(await file.arrayBuffer()));
      }
    };
    await pull(`${base}/`);
    run('tar', ['-cf', `${relative(dir, out).replace(/\\/g, '/')}.tmp`, '--transform', `s,^src,${prefix},`, 'src'], { cwd: dir });
    renameSync(`${out}.tmp`, out);
    rmSync(dir, { recursive: true, force: true });
  }
  manifest.push({ path: prefix, repo: url, commit: `r${rev}` });
  console.log(`  ${prefix} @ r${rev}`);
}

const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const sha256 = (file) => new Promise((ok, fail) => {
  const h = createHash('sha256');
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
});

const failed = [];
const attempt = (label, fn) => { try { fn(); } catch (e) { failed.push(`${label}: ${e.message}`); console.error(`FAILED ${label}: ${e.message}`); } };

console.log('FFmpeg and its build scripts');
attempt('ffmpeg', () => archive('https://github.com/FFmpeg/FFmpeg.git', FFMPEG_COMMIT, 'ffmpeg', 'ffmpeg', 'none'));
const buildsUrl = 'https://github.com/BtbN/FFmpeg-Builds.git';
attempt('FFmpeg-Builds', () => archive(buildsUrl, BUILDS_COMMIT, 'FFmpeg-Builds', 'FFmpeg-Builds', 'none'));
attempt('ffmpeg.wasm', () => archive('https://github.com/ffmpegwasm/ffmpeg.wasm.git', run('git', ['ls-remote', 'https://github.com/ffmpegwasm/ffmpeg.wasm.git', `refs/tags/${WASM_TAG}^{}`]).split('\t')[0] || run('git', ['ls-remote', 'https://github.com/ffmpegwasm/ffmpeg.wasm.git', `refs/tags/${WASM_TAG}`]).split('\t')[0], 'ffmpeg.wasm', 'ffmpeg.wasm', 'none'));

// The stage scripts, read from the pinned commit rather than any checkout that may have moved.
const buildsDir = bareRepo(buildsUrl);
const stages = git(buildsDir, 'ls-tree', '-r', '--name-only', BUILDS_COMMIT, 'scripts.d/').split('\n').filter((f) => f.endsWith('.sh'));
console.log(`\n${stages.length} build stages`);
for (const file of stages) {
  const stage = file.replace(/^scripts\.d\//, '').replace(/\.sh$/, '');
  if (LEFT_OUT.some((re) => re.test(stage))) continue;
  const text = git(buildsDir, 'show', `${BUILDS_COMMIT}:${file}`);
  const field = (k) => text.match(new RegExp(`^SCRIPT_${k}="?([^"\\n]+)"?`, 'm'))?.[1];
  const prefix = `libraries/${stage}`;
  const submodules = NO_SUBMODULES.test(stage) ? 'none' : ONLY_SUBMODULES[stage] || 'all';
  for (const n of ['', '2', '3']) {
    const url = field(`REPO${n}`);
    const commit = field(`COMMIT${n}`);
    const rev = field('REV');
    const label = `${stage}${n}`;
    if (!url) continue;
    if (!n && rev) {
      await svnExport(url, rev, `lib_${stage}`, prefix).catch((e) => { failed.push(`${label}: ${e.message}`); console.error(`FAILED ${label}: ${e.message}`); });
      continue;
    }
    if (!commit) { failed.push(`${label}: no pinned commit`); continue; }
    attempt(label, () => archive(url, commit, `lib_${stage}${n}`, `${prefix}${n && `-${n}`}`, submodules));
  }
  const url = field('REPO');
  const commit = field('COMMIT');
  if (/shaderc$/.test(stage)) attempt(`${stage} deps`, () => shadercDeps(url, commit, `lib_${stage}`, prefix));
  if (/librsvg$/.test(stage)) attempt(`${stage} crates`, () => vendorCrates(url, commit, `lib_${stage}`, prefix));
  if (/rav1e$/.test(stage)) attempt(`${stage} crates`, () => vendorCrates(url, commit, `lib_${stage}`, prefix, 'cc'));
}

const pending = walk(parts).filter((f) => f.endsWith('.tmp'));
if (failed.length || pending.length) {
  console.error(`\n${failed.length} failed; no archive written.\n${failed.join('\n')}`);
  process.exit(1);
}

const lines = manifest.map((m) => `${m.path}\t${m.repo}\t${m.commit}`).join('\n');
writeFileSync(join(parts, 'MANIFEST.tsv'), `path\trepository\tcommit\n${lines}\n`);
writeFileSync(join(parts, 'unpack.sh'), '#!/bin/sh\n# Unpacks every component into ./src, in place.\nmkdir -p src && for f in *.tar; do tar -xf "$f" -C src; done\n');
writeFileSync(join(parts, 'README.txt'), `Complete corresponding source for the FFmpeg shipped in Plajah

Binary:  ${ZIP}
         sha256 ${ZIP_SHA256}
         https://github.com/BtbN/FFmpeg-Builds/releases/tag/${TAG}
FFmpeg:  commit ${FFMPEG_COMMIT}
Scripts: BtbN/FFmpeg-Builds commit ${BUILDS_COMMIT}, variant win64-gpl, addin 8.1

Run unpack.sh to get the tree. MANIFEST.tsv lists every component, its repository and its commit.
To rebuild, follow FFmpeg-Builds/README.md: ./build.sh win64 gpl 8.1. Its stage scripts build from these same
commits, with the toolchain defined by FFmpeg-Builds/images/base-win64 and its ct-ng-config. ffmpeg.wasm is
the source of the optional codec pack, at tag ${WASM_TAG}.

Each component stays under its own licence, found in its folder. The binary as a whole is GPL version 3 or later.
`);

const name = `plajah-ffmpeg-source-n8.1.3-29-gad3b795b72`;
const outDir = join(work, 'out');
mkdirSync(outDir, { recursive: true });
const tarball = join(outDir, `${name}.tar`);
console.log('\nPacking');
run('tar', ['-cf', relative(parts, tarball).replace(/\\/g, '/'), '--transform', `s,^\\./,${name}/,`, '.'], { cwd: parts });
rmSync(`${tarball}.xz`, { force: true });
run('xz', ['-T0', '-6', tarball]);
const hash = await sha256(`${tarball}.xz`);
writeFileSync(`${tarball}.xz.sha256`, `${hash}  ${name}.tar.xz\n`);
console.log(`\n${tarball}.xz\n${(statSync(`${tarball}.xz`).size / 1e9).toFixed(2)} GB\nsha256 ${hash}\n${manifest.length} components`);
