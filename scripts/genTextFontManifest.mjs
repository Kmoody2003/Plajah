// Generate services/text/fonts/manifest.json — the open font files (OFL / Apache / UFL) the
// text engine can fetch for every family in services/tela/telaFonts.ts FONTS, plus the Noto
// fallback faces per script. Real filenames come from the google/fonts repo tree, so variable
// files like `Inter[opsz,wght].ttf` are named exactly; nothing is guessed.
//
//   node scripts/genTextFontManifest.mjs            (uses `gh auth token` when available)
//
// Re-run when FONTS gains a family. The engine fetches from
//   https://cdn.jsdelivr.net/gh/google/fonts@main/<dir>/<file>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'services/tela/telaFonts.ts'), 'utf8');
const families = [...src.matchAll(/S\('([^']+)'/g)].map(m => m[1]);
const FALLBACK = [
  'Noto Sans', 'Noto Serif', 'Noto Sans Mono', 'Noto Sans Arabic', 'Noto Naskh Arabic', 'Noto Sans Hebrew', 'Noto Serif Hebrew',
  'Noto Sans Devanagari', 'Noto Serif Devanagari', 'Noto Sans Bengali', 'Noto Sans Tamil', 'Noto Sans Thai', 'Noto Sans Armenian',
  'Noto Sans Georgian', 'Noto Sans Ethiopic', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Noto Serif JP',
  'Noto Sans Symbols', 'Noto Sans Symbols 2', 'Noto Sans Math',
];

let token = process.env.GITHUB_TOKEN || '';
if (!token) { try { token = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* anonymous */ } }
const headers = { 'User-Agent': 'plajah-text-manifest', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const gh = async (url) => { const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

const rootTree = await gh('https://api.github.com/repos/google/fonts/git/trees/main');
const files = [];
for (const lic of ['ofl', 'apache', 'ufl']) {
  const node = rootTree.tree.find(t => t.path === lic);
  const tree = await gh(`https://api.github.com/repos/google/fonts/git/trees/${node.sha}?recursive=1`);
  if (tree.truncated) console.warn(`[fonts] ${lic} tree truncated`);
  for (const t of tree.tree) if (t.type === 'blob' && /\.(ttf|otf)$/i.test(t.path)) files.push(`${lic}/${t.path}`);
}
const byDir = new Map();
for (const f of files) {
  const parts = f.split('/');
  if (parts.length !== 3) continue; // skip static/ subfolders: the top level is canonical
  const dir = `${parts[0]}/${parts[1]}`;
  if (!byDir.has(dir)) byDir.set(dir, []);
  byDir.get(dir).push(parts[2]);
}

const WEIGHTS = { Thin: 100, Hairline: 100, ExtraLight: 200, UltraLight: 200, Light: 300, Regular: 400, Book: 400, Medium: 500, SemiBold: 600, DemiBold: 600, Bold: 700, ExtraBold: 800, UltraBold: 800, Black: 900, Heavy: 900 };
function describe(file) {
  const m = file.match(/^(.*?)(?:-([A-Za-z]+))?(?:\[([^\]]+)\])?\.(ttf|otf)$/);
  const styleName = m?.[2] || 'Regular';
  const axes = m?.[3] ? m[3].split(',') : undefined;
  const italic = /Italic/.test(styleName) || (axes?.includes('ital') ?? false);
  const wName = styleName.replace('Italic', '') || 'Regular';
  const weight = WEIGHTS[wName] ?? 400;
  return { file, style: italic ? 'italic' : 'normal', ...(axes ? { axes } : { weight }) };
}

const manifest = {};
const missing = [];
// Document families: Writer defaults plus metric-compatible stand-ins for Office fonts (docx
// fidelity: Calibri→Carlito, Cambria→Caladea, Arial→Arimo, Times New Roman→Tinos, Courier New→Cousine, Georgia→Gelasio).
const DOCUMENT = ['Source Serif 4', 'Source Sans 3', 'Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine', 'Gelasio'];
for (const family of [...new Set([...families, ...DOCUMENT, ...FALLBACK])]) {
  const slug = family.toLowerCase().replace(/[^a-z0-9]/g, '');
  const dir = ['ofl', 'apache', 'ufl'].map(l => `${l}/${slug}`).find(d => byDir.has(d));
  if (!dir) { missing.push(family); continue; }
  const list = byDir.get(dir).filter(f => !/^.*-(?:VF|Variable)\./.test(f)).map(describe);
  const license = dir.startsWith('ofl') ? 'OFL-1.1' : dir.startsWith('apache') ? 'Apache-2.0' : 'UFL-1.0';
  manifest[family] = { dir, license, fallback: FALLBACK.includes(family) || undefined, files: list };
}
const out = join(root, 'services/text/fonts/manifest.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ base: 'https://cdn.jsdelivr.net/gh/google/fonts@main/', generated: new Date().toISOString().slice(0, 10), families: manifest }, null, 1) + '\n');
console.log(`[fonts] ${Object.keys(manifest).length} families → ${out}`);
if (missing.length) console.warn(`[fonts] not found in google/fonts: ${missing.join(', ')}`);
