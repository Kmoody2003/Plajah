/**
 * Registers generated reconstruction images that exist on disk for Ford and Persia.
 *   npx tsx scripts/dossier/importReconAll.ts
 * Looks for public/dossier/<slug>/recon/<scene-id>.jpg and writes data/dossier/<slug>Recon.json.
 * Scenes with no image are simply absent: nothing is faked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fordScenes } from '../../data/dossier/fordScenes';
import { persiaScenes } from '../../data/dossier/persiaScenes';

const GEN = 'Google Nano Banana Pro via Magnific';
const WITH_REFS = new Set(['recon-ford-highland-line', 'recon-ford-peaceship']);

for (const [slug, scenes] of [['ford', fordScenes], ['persia', persiaScenes]] as const) {
  const dir = path.join('public', 'dossier', slug, 'recon');
  const found = scenes.flatMap((s: any) =>
    fs.existsSync(path.join(dir, `${s.id}.jpg`))
      ? [{ id: s.id, file: `/dossier/${slug}/recon/${s.id}.jpg`, generator: WITH_REFS.has(s.id) ? `${GEN} (real photographs as references)` : GEN }]
      : []);
  fs.writeFileSync(path.join('data', 'dossier', `${slug}Recon.json`), JSON.stringify(found, null, 2));
  console.log(`${slug}: registered ${found.length}/${scenes.length} reconstructions`);
  for (const s of scenes) if (!found.some(f => f.id === s.id)) console.log(`  missing: ${s.id}`);
}
