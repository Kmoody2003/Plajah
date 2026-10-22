// Shared dev-server watch ignore for the main app and the labs.
//
// Vite watches the whole project root except node_modules/.git. This repo root also holds tens of
// thousands of non-source files (artifacts/, .claude/ worktrees, android/, rust/, native shells,
// media). chokidar keeps an open handle + a pending directory-change IRP per watched directory, so
// one dev server reached ~121k handles and pushed the Windows kernel nonpaged pool to ~3 GB
// (2026-10-22) — system-wide lag and Explorer stalls. Nothing in these folders is imported by the
// web app, so not watching them costs nothing.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/').toLowerCase();

// Top-level folders that are never part of the web module graph.
const IGNORED_TOP = new Set([
  '.agents', '.cache', '.claude', '.film-work', '.firebase', '.lens-shots', '.rules-hotfix', '.tela-proofs',
  'alexa', 'android', 'artifacts', 'bixby', 'cap-shell', 'compositor', 'docs', 'flutter', 'google-home', 'infra',
  'migrated_prompt_history', 'public', 'roku', 'rust', 'scratch', 'scripts', 'tests', 'tizen', 'tmp', 'vault',
  'windows', 'windows-native',
]);
const IGNORED_TOP_PREFIX = ['dist', '.tmp-', 'plajah_package_'];
const MEDIA = /\.(jpe?g|png|gif|webp|avif|psd|tiff?|mp4|mov|webm|mkv|wav|mp3|flac|aiff?|m4a|ogg|glb|gltf|fbx|blend|zip|7z|pdf)$/i;

/** chokidar `ignored` matcher: true for paths the dev server should not watch. */
export function watchIgnored(p) {
  const rel = String(p).replace(/\\/g, '/').toLowerCase();
  if (!rel.startsWith(ROOT + '/')) return false;
  const top = rel.slice(ROOT.length + 1).split('/')[0];
  if (IGNORED_TOP.has(top) || IGNORED_TOP_PREFIX.some((x) => top.startsWith(x))) return true;
  // Top-level folders with spaces are art/media dumps ("Club Cover Images", "Vtuber and Avatars", ...).
  if (top.includes(' ')) return true;
  return MEDIA.test(rel);
}
