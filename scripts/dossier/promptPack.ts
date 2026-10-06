/**
 * Builds the reconstruction prompt pack for a dossier.
 *   npx tsx scripts/dossier/promptPack.ts
 * Writes docs/dossier/<id>-prompt-pack.md. Every prompt is composed from the Character Bible, so a
 * pack run in Magnific's web app (unlimited models) stays consistent with API-generated images.
 */
import fs from 'node:fs';
import path from 'node:path';
import { douglassDossier } from '../../data/dossier/douglass';
import { douglassScenes } from '../../data/dossier/douglassScenes';
import { buildImageRequest } from '../../services/dossier/characterGateway';
import { commonsThumb } from '../../services/dossier/sourceAdapters';

const d = douglassDossier;
const lines: string[] = [
  `# ${d.subject} — reconstruction prompt pack`,
  '',
  'Run each scene in Magnific (web app, unlimited image model), attach the reference portraits, and save the result as',
  '`public/dossier/douglass/recon/<scene-id>.png`. Then run `npx tsx scripts/dossier/importRecon.ts`.',
  '',
  'Rules: keep the same reference portraits for every scene; do not add text; never accept a smiling or modernized face;',
  'scenes marked "face not visible" must stay silhouette/back view because no photograph of him exists at that age.',
  '',
];

for (const s of douglassScenes) {
  const req = buildImageRequest(s.spec, d.characters, d.assets);
  lines.push(`## ${s.id} — ${s.title}`, '',
    `Room: ${s.roomId} · Aspect: ${req.aspect} · Seed: ${req.seed}`, '',
    '**Prompt**', '', '```', req.prompt, '```', '',
    '**Negative / avoid**', '', '```', req.negativePrompt, '```', '',
    '**Reference portraits** (attach these)', '',
    ...(req.referenceUrls.length ? req.referenceUrls.map(u => `- ${commonsThumb(u)}`) : ['- none (face not visible in this scene)']), '',
    `**Basis:** ${s.basis}`, '');
}

const out = path.join('docs', 'dossier', `${d.id}-prompt-pack.md`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out} (${douglassScenes.length} scenes)`);
