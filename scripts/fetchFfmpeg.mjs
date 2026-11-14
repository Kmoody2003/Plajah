// Puts ffmpeg.exe and ffprobe.exe where the WinUI project bundles them from. The binaries are git-ignored,
// so run this in any checkout that builds the package; the csproj silently leaves them out otherwise.
//   node scripts/fetchFfmpeg.mjs
// BtbN's GPL build: has libx264, libx265, SVT-AV1, LAME, Opus, libsrt and the GPU encoders. Being GPL, it
// must ship with its licence and an offer of source; the licence file is copied alongside the binaries.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, createReadStream, createWriteStream, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// Pinned so what ships always matches the source archive from buildFfmpegSource.mjs. Move these together,
// along with the same three values in CrossoverNativeService.cs, and rebuild the archive.
const ASSET = 'ffmpeg-n8.1.3-29-gad3b795b72-win64-gpl-8.1';
// BtbN's autobuild-2026-11-01-12-49, kept on our own storage because BtbN prunes old builds.
const URL_ZIP = 'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/open-source%2Fffmpeg%2Fn8.1.3-29-gad3b795b72%2Fffmpeg-n8.1.3-29-gad3b795b72-win64-gpl-8.1.zip?alt=media&token=40b7bfdb-4f14-4d3a-b9e5-85d3cfaaf6e2';
const WANT = '0bf508ade2d757f3e9116418768deefb4046a3a1d5a9ed32299ea4fb929dd231';
const dest = resolve(dirname(fileURLToPath(import.meta.url)), '../windows-native/third_party/ffmpeg/win-x64');

const fetchOk = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res;
};
const sha256 = (file) => new Promise((ok, fail) => {
  const h = createHash('sha256');
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
});

const work = mkdtempSync(join(tmpdir(), 'plajah-ffmpeg-'));
try {
  const zip = join(work, `${ASSET}.zip`);
  console.log(`Downloading ${ASSET}.zip`);
  await pipeline(Readable.fromWeb((await fetchOk(URL_ZIP)).body), createWriteStream(zip));
  const got = await sha256(zip);
  if (got !== WANT) throw new Error(`Checksum mismatch: wanted ${WANT}, got ${got}.`);
  console.log(`Checksum OK: ${got}`);

  const out = join(work, 'x');
  mkdirSync(out);
  // Windows' own tar reads zips; the GNU tar that Git Bash puts first on PATH doesn't.
  const tar = spawnSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', out], { stdio: 'inherit' });
  if (tar.status !== 0) throw new Error('Could not unpack the zip.');
  const root = join(out, readdirSync(out)[0]);

  mkdirSync(dest, { recursive: true });
  copyFileSync(join(root, 'bin', 'ffmpeg.exe'), join(dest, 'ffmpeg.exe'));
  copyFileSync(join(root, 'bin', 'ffprobe.exe'), join(dest, 'ffprobe.exe'));
  copyFileSync(join(root, 'LICENSE.txt'), join(dest, 'FFMPEG-LICENSE.txt'));
  console.log(`Installed to ${dest}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
