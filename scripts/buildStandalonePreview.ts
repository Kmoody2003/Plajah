import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COUNCIL_MASTERWORKS } from '../components/plajahPixels/engine/presets/milkdropCouncilShaders';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '../public/milkdrop-preview.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace the ES module import or previous inline definition with fresh JSON definition
const masterworksJson = JSON.stringify(COUNCIL_MASTERWORKS);
const searchMarker = '// ── Web Audio Multi-Stem Engine';
const startIdx = html.indexOf('const COUNCIL_MASTERWORKS =');
const importIdx = html.indexOf(`import { COUNCIL_MASTERWORKS } from '/components/plajahPixels/engine/presets/milkdropCouncilShaders.ts';`);
const markerIdx = html.indexOf(searchMarker);

if (importIdx !== -1) {
  html = html.replace(
    `import { COUNCIL_MASTERWORKS } from '/components/plajahPixels/engine/presets/milkdropCouncilShaders.ts';`,
    `const COUNCIL_MASTERWORKS = ${masterworksJson};`
  );
} else if (startIdx !== -1 && markerIdx !== -1 && startIdx < markerIdx) {
  html = html.slice(0, startIdx) + `const COUNCIL_MASTERWORKS = ${masterworksJson};\n\n` + html.slice(markerIdx);
} else {
  throw new Error('Could not find injection point for COUNCIL_MASTERWORKS in HTML!');
}

// Save both to public/milkdrop-preview.html and root milkdrop-preview.html
fs.writeFileSync(path.resolve(__dirname, '../public/milkdrop-preview.html'), html, 'utf8');
fs.writeFileSync(path.resolve(__dirname, '../milkdrop-preview.html'), html, 'utf8');
console.log('Successfully generated standalone milkdrop-preview.html in public/ and root!');
