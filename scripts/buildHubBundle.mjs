#!/usr/bin/env node
// Bundles the embedded smart-home hub into ONE CommonJS file for Node 18 (nodejs-mobile on
// Android, PlajahHubService) -> android/app/src/main/assets/plajah-hub/{main.js (bootstrap), hub.js (bundle)}
//
//   node scripts/buildHubBundle.mjs [--minify] [--out <file>] [--entry <file>]
//
// Entry: services/home/hubEntry.ts. The real hub is the virtual module `plajah-hub-real`:
// services/home/hubServer.ts when it exists (must export `startHub(ctx)` — see hubEntry.ts),
// otherwise an empty stub, so the bundle always builds.
import { build } from 'esbuild';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
// --out names the bootstrap (main.js); the bundle is written next to it as hub.js.
const mainFile = outIdx >= 0 ? args[outIdx + 1] : join(root, 'android', 'app', 'src', 'main', 'assets', 'plajah-hub', 'main.js');
const outfile = join(dirname(mainFile), 'hub.js');
const entryIdx = args.indexOf('--entry');
const entry = entryIdx >= 0 ? args[entryIdx + 1] : join(root, 'services', 'home', 'hubEntry.ts');
const realHub = join(root, 'services', 'home', 'hubServer.ts');
const hasReal = existsSync(realHub);

// Native addons / optional transports Node 18 on Android cannot load. They stay `require()`s that
// throw at runtime, which matter.js / ws already treat as "feature unavailable".
const external = [
  '@abandonware/noble', '@abandonware/bleno', '@stoprocent/noble', '@stoprocent/bleno', // BLE commissioning (use on-network/Thread instead)
  'bufferutil', 'utf-8-validate', // ws optional accelerators
  'fsevents',
];

const realHubPlugin = {
  name: 'plajah-hub-real',
  setup(b) {
    b.onResolve({ filter: /^plajah-hub-real$/ }, () =>
      hasReal ? { path: realHub } : { path: 'plajah-hub-real', namespace: 'plajah-stub' });
    b.onLoad({ filter: /.*/, namespace: 'plajah-stub' }, () => ({ contents: 'export const startHub = undefined;', loader: 'js' }));
  },
};

// matter.js 0.12 (@matter/*, @project-chip/*) ships dual ESM/CJS. Its ESM graph has import cycles
// that break when esbuild rewrites ESM into lazily-initialised CJS wrappers (`Cannot read properties
// of undefined` in @matter/model at load). Resolving every import of those packages with the
// `require` condition makes esbuild bundle their dist/cjs builds, whose init order is correct.
const forceCjsPlugin = {
  name: 'force-cjs-matter',
  setup(b) {
    b.onResolve({ filter: /^(@matter\/|@project-chip\/)/ }, async (a) => {
      if (a.pluginData?.forced) return undefined;
      const r = await b.resolve(a.path, { kind: 'require-call', resolveDir: a.resolveDir, importer: a.importer, pluginData: { forced: true } });
      return r.errors.length ? undefined : { path: r.path, external: r.external, sideEffects: r.sideEffects };
    });
  },
};

// nodejs-mobile's libnode is built without ICU: RegExp Unicode property escapes (\p{L}) are a
// SyntaxError there, which kills the whole bundle at compile time. Rewrite the ones dependencies
// use into explicit ranges (approximate, only used for name validation).
const P_ESCAPES = { '\\p{L}': 'A-Za-z\\u00AA-\\uFFFF', '\\p{N}': '0-9', '\\p{Lu}': 'A-Z\\u00C0-\\u00DE', '\\p{Ll}': 'a-z\\u00DF-\\u00FF',
  // path-to-regexp (Express 5 router) route-parameter names:
  '\\p{ID_Start}': 'A-Za-z\\u00AA-\\uFFFF', '\\p{ID_Continue}': '0-9A-Za-z_\\u00AA-\\uFFFF' };
const noIcuRegexPlugin = {
  name: 'no-icu-regex',
  setup(b) {
    b.onLoad({ filter: /node_modules[\\/].*\.(c|m)?js$/ }, async (a) => {
      const { readFile } = await import('node:fs/promises');
      const src = await readFile(a.path, 'utf8');
      if (!src.includes('\\p{')) return undefined;
      let out = src;
      for (const [k, v] of Object.entries(P_ESCAPES)) out = out.split(k).join(v);
      if (out.includes('\\p{')) console.warn(`[buildHubBundle] unhandled \\p{...} regex escape left in ${a.path}`);
      return { contents: out, loader: 'js' };
    });
  },
};

// Bootstrap: plain ES2017, loads hub.js and turns a load-time failure (syntax error, missing module)
// into files/plajah-hub/fatal.txt + a 503 /health instead of a silent process death.
const BOOTSTRAP = `'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
try {
  require('./hub.js');
} catch (e) {
  const msg = String((e && e.stack) || e);
  console.error('[hub] FATAL loading hub.js:', msg);
  try { if (process.env.PLAJAH_HUB_ROOT) fs.writeFileSync(path.join(process.env.PLAJAH_HUB_ROOT, 'fatal.txt'), new Date().toISOString() + '\\n' + msg); } catch (_) {}
  http.createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 503 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, fatal: msg }));
  }).listen(Number(process.env.PLAJAH_HUB_PORT || 8786), process.env.PLAJAH_HUB_HOST || '127.0.0.1');
}
`;

mkdirSync(dirname(outfile), { recursive: true });
const result = await build({
  entryPoints: [entry],
  nodePaths: [join(root, 'node_modules')],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  mainFields: ['main', 'module'],
  conditions: ['node'],
  external,
  minify: args.includes('--minify'),
  sourcemap: false,
  legalComments: 'none',
  // matter.js keys caches by constructor.name (Aspects.ts); esbuild's collision renaming breaks that.
  keepNames: true,
  logLevel: 'warning',
  metafile: true,
  // ESM deps that read import.meta.url still work once converted to CJS.
  define: { 'import.meta.url': '__plajahImportMetaUrl' },
  banner: { js: 'const __plajahImportMetaUrl = require("url").pathToFileURL(__filename).href;' },
  plugins: [realHubPlugin, forceCjsPlugin, noIcuRegexPlugin],
});

// The repo root is "type": "module"; pin the bundle dir to CommonJS so `node main.js` works on a PC too.
writeFileSync(mainFile, BOOTSTRAP);
writeFileSync(join(dirname(outfile), 'package.json'), JSON.stringify({ name: 'plajah-hub-bundle', private: true, type: 'commonjs' }, null, 2) + '\n');

const kb = Math.round(statSync(outfile).size / 1024);
console.log(`[buildHubBundle] ${hasReal ? 'real hub (services/home/hubServer.ts)' : 'placeholder (no hubServer.ts yet)'} -> ${outfile} (${kb} KB)`);
if (result.warnings.length) console.log(`[buildHubBundle] ${result.warnings.length} warning(s)`);
