#!/usr/bin/env node
// Fetches the embedded Node runtime for the Android hub (PlajahHubService) into
// android/app/src/main/jniLibs/{armeabi-v7a,arm64-v8a}/:
//   libnode.so        nodejs-mobile v18.20.4 (MIT) — github.com/nodejs-mobile/nodejs-mobile
//   libc++_shared.so  LLVM libc++ (Apache-2.0 WITH LLVM-exception), libnode.so's DT_NEEDED;
//                     taken from Maven Central's com.facebook.fbjni:fbjni:0.7.0 AAR so no NDK is needed.
// Both are gitignored (~120 MB). Idempotent: skips ABIs that already have both files.
//   node scripts/fetchNodejsMobile.mjs [--force]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE_VERSION = '18.20.4';
const NODE_ZIP = `https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${NODE_VERSION}/nodejs-mobile-v${NODE_VERSION}-android.zip`;
const LIBCXX_AAR = 'https://repo1.maven.org/maven2/com/facebook/fbjni/fbjni/0.7.0/fbjni-0.7.0.aar';
const ABIS = ['armeabi-v7a', 'arm64-v8a'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jniLibs = join(root, 'android', 'app', 'src', 'main', 'jniLibs');
const force = process.argv.includes('--force');

const missing = ABIS.filter((a) => force || !existsSync(join(jniLibs, a, 'libnode.so')) || !existsSync(join(jniLibs, a, 'libc++_shared.so')));
if (!missing.length) { console.log('[fetchNodejsMobile] runtime already present'); process.exit(0); }

const work = mkdtempSync(join(tmpdir(), 'plajah-nodejs-mobile-'));
async function download(url, file) {
  console.log(`[fetchNodejsMobile] GET ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
function extract(zip, member, outDir) {
  mkdirSync(outDir, { recursive: true });
  try { execFileSync('unzip', ['-q', '-o', zip, member, '-d', outDir], { stdio: 'inherit' }); }
  catch { execFileSync('tar', ['-xf', zip, '-C', outDir, member], { stdio: 'inherit' }); } // bsdtar reads zips
  return join(outDir, member);
}
try {
  const nodeZip = join(work, 'node.zip');
  const aar = join(work, 'fbjni.aar');
  await download(NODE_ZIP, nodeZip);
  await download(LIBCXX_AAR, aar);
  for (const abi of missing) {
    mkdirSync(join(jniLibs, abi), { recursive: true });
    copyFileSync(extract(nodeZip, `bin/${abi}/libnode.so`, join(work, 'x')), join(jniLibs, abi, 'libnode.so'));
    copyFileSync(extract(aar, `jni/${abi}/libc++_shared.so`, join(work, 'x')), join(jniLibs, abi, 'libc++_shared.so'));
    console.log(`[fetchNodejsMobile] ${abi} ok`);
  }
} finally {
  rmSync(work, { recursive: true, force: true }); // never leave the 57 MB zip behind
}
