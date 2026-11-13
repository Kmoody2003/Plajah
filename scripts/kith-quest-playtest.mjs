// Builds a single self-contained Kith Quest page (all JS/CSS/art inlined) for phone playtests / Artifact publish.
// usage: node scripts/kith-quest-playtest.mjs <out.html> [--music=files]
import {build} from 'esbuild';
import fs from 'node:fs';
const out = process.argv[2] || 'kith-quest-playtest.html';
const r = await build({entryPoints: ['labs/kith-quest/main.tsx'], bundle: true, minify: true, format: 'iife', write: false, jsx: 'automatic', outdir: 'x', target: 'es2020',
 loader: {'.css': 'css', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl'}, define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'error'});
let js = '', css = ''; for (const f of r.outputFiles) { if (f.path.endsWith('.js')) js = f.text; else css = f.text; }
// the Chora-built score (scripts/games/buildKithQuestAudio.ts), inlined so the page plays it offline
let music = '';
const MUSIC = 'public/kith-party/quest-music';
if (fs.existsSync(`${MUSIC}/manifest.json`)) {
 const manifest = JSON.parse(fs.readFileSync(`${MUSIC}/manifest.json`, 'utf8'));
 // --music=files: the MP3s are published next to the page (Artifact `files`, quest-music/<file>) instead of inlined
 const asFiles = process.argv.includes('--music=files');
 const urls = Object.fromEntries(Object.values(manifest).map((e) => [e.file, asFiles ? `quest-music/${e.file}` : `data:audio/mpeg;base64,${fs.readFileSync(`${MUSIC}/${e.file}`).toString('base64')}`]));
 music = `<script>globalThis.__kithQuestMusic=${JSON.stringify({manifest, urls})}</script>\n`;
}
const page = `<title>Kith Quest</title>
<meta name="theme-color" content="#05030b">
<style>
:root{--ground:#1a0026;--ink:#ffffff;color-scheme:dark}
html,body{height:100%;background:var(--ground);color:var(--ink);overscroll-behavior:none}
#root{min-height:100%}
${css}
</style>
<div id="root" class="kp-app"></div>
${music}<script>${js.split('</' + 'script').join('<\/' + 'script')}</script>
`;
fs.writeFileSync(out, page);
console.log(out, (page.length / 1024).toFixed(0) + ' KB');
