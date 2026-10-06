/**
 * Registers generated reconstruction images that exist on disk.
 *   npx tsx scripts/dossier/importRecon.ts [generator-label]
 * Looks for public/dossier/<slug>/recon/<scene-id>.(png|jpg|jpeg|webp) for each scene and writes
 * data/dossier/<slug>Recon.json. Scenes with no file are simply absent (nothing is faked).
 */
import fs from 'node:fs';
import path from 'node:path';
import { douglassScenes } from '../../data/dossier/douglassScenes';

const generator = process.argv[2] ?? 'Magnific (web app)';
const dir = path.join('public', 'dossier', 'douglass', 'recon');
const exts = ['png', 'jpg', 'jpeg', 'webp'];

const found = douglassScenes.flatMap(s => {
  const ext = exts.find(e => fs.existsSync(path.join(dir, `${s.id}.${e}`)));
  return ext ? [{ id: s.id, file: `/dossier/douglass/recon/${s.id}.${ext}`, generator }] : [];
});

fs.writeFileSync(path.join('data', 'dossier', 'douglassRecon.json'), JSON.stringify(found, null, 2));
console.log(`registered ${found.length}/${douglassScenes.length} reconstructions`);
for (const s of douglassScenes) if (!found.some(f => f.id === s.id)) console.log(`  missing: ${s.id}`);
