// Bundle the Disc Authoring preview (templates gallery + live interface) into ONE html file that
// opens without a dev server:  node scripts/build-disc-preview.mjs
//   -> artifacts/disc-authoring-preview/index.html
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = 'artifacts/disc-authoring-preview';
mkdirSync(out, { recursive: true });
const r = await build({
  entryPoints: ['labs/disc/preview.tsx'], bundle: true, format: 'iife', minify: true, jsx: 'automatic', write: false, logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{"DEV":false,"PROD":true,"MODE":"production"}' },
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const fonts = ['Inter', 'Playfair Display', 'Bebas Neue', 'Anton', 'Cormorant Garamond'];
const warm = fonts.map(f => `<span style="font-family:'${f}';font-weight:700">Aa</span><span style="font-family:'${f}';font-weight:500">Aa</span>`).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Disc Authoring Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Cormorant+Garamond:wght@500;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=block" rel="stylesheet">
<style>html,body{margin:0;background:#0d0d11}</style></head><body>
<div aria-hidden="true" style="position:absolute;opacity:0;pointer-events:none">${warm}</div>
<div id="root"></div><script>${js}</script></body></html>`;
writeFileSync(`${out}/index.html`, html);
console.log(`${out}/index.html  ${(html.length / 1024) | 0} KB`);
