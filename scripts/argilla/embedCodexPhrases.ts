/**
 * Turns the codex's vision phrases into CLIP text embeddings, so the app only ships the (smaller) vision half.
 * Re-run after adding creatures:  npx tsx scripts/argilla/embedCodexPhrases.ts
 */
import { writeFileSync } from 'node:fs';
import { AutoTokenizer, CLIPTextModelWithProjection, env } from '@huggingface/transformers';
import { CODEX } from '../../services/argilla/creature/codex';
import { VOCABULARY } from '../../services/argilla/understand/vocabulary';
import { ALL_PART_NAMES, KIND_SHEETS } from '../../services/argilla/understand/buildSheets';
import { MATERIALS } from '../../services/argilla/understand/materials';

// Not codex creatures: these let it say "not a creature I know" instead of forcing the nearest one.
const OTHER = [
  'a photo of a building', 'a photo of a car', 'a landscape', 'a piece of furniture', 'a plate of food',
  'an abstract pattern', 'a logo or text', 'a flower or a plant',
];

env.allowRemoteModels = false;
env.localModelPath = process.env.PLAJAH_MODELS_ROOT ?? 'D:/Plajah Models';
const MODEL = 'clip-vit-base-patch32';

const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'fp32', device: 'cpu' });
const rows = [
  ...CODEX.flatMap((entry) => entry.visionPhrases.map((phrase) => ({ id: entry.id, phrase }))),
  ...OTHER.map((phrase) => ({ id: 'other', phrase })),
];
const out: { id: string; phrase: string; embedding: number[] }[] = [];
for (const row of rows) {
  const inputs = tokenizer(row.phrase, { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  const v = Array.from(text_embeds.data as Float32Array);
  const length = Math.hypot(...v);
  out.push({ ...row, embedding: v.map((x) => +(x / length).toFixed(5)) });
}
writeFileSync('engines/argilla-npu/codex_phrases.json', JSON.stringify(out));

// Everything it can name. Each thing is the average of how it might be shown.
const objects: { label: string; embedding: number[] }[] = [];
for (const prior of VOCABULARY) {
  const sum = new Array(512).fill(0);
  for (const phrase of [`a photo of a ${prior.label}`, `a 3D render of a ${prior.label}`, `a painting of a ${prior.label}`]) {
    const { text_embeds } = await model(tokenizer(phrase, { padding: true, truncation: true }));
    const v = Array.from(text_embeds.data as Float32Array);
    const length = Math.hypot(...v);
    v.forEach((x, i) => { sum[i] += x / length; });
  }
  const length = Math.hypot(...sum);
  objects.push({ label: prior.label, embedding: sum.map((x) => +(x / length).toFixed(4)) });
}
writeFileSync('engines/argilla-npu/object_phrases.json', JSON.stringify(objects));

// What a part, a material and a whole kind of thing look like. Each is the average of its phrases.
async function averaged(rows: { label: string; phrases: string[] }[]) {
  const made: { label: string; embedding: number[] }[] = [];
  for (const row of rows) {
    const sum = new Array(512).fill(0);
    for (const phrase of row.phrases) {
      const { text_embeds } = await model(tokenizer(phrase, { padding: true, truncation: true }));
      const v = Array.from(text_embeds.data as Float32Array);
      const length = Math.hypot(...v);
      v.forEach((x, i) => { sum[i] += x / length; });
    }
    const length = Math.hypot(...sum);
    made.push({ label: row.label, embedding: sum.map((x) => +(x / length).toFixed(4)) });
  }
  return made;
}
writeFileSync('engines/argilla-npu/part_phrases.json', JSON.stringify(await averaged(ALL_PART_NAMES.map((label) => ({ label, phrases: [`a photo of a ${label}`, `a close-up of a ${label}`] })))));
writeFileSync('engines/argilla-npu/material_phrases.json', JSON.stringify(await averaged(MATERIALS.map((m) => ({ label: m.id, phrases: m.looks.map((look) => `a close-up of ${look}`) })))));
writeFileSync('engines/argilla-npu/kind_phrases.json', JSON.stringify(await averaged(KIND_SHEETS.map((s) => ({ label: s.kind, phrases: [`a photo of a ${s.kind}`, `a painting of a ${s.kind}`] })))));
writeFileSync('engines/argilla-npu/kind_part_phrases.json', JSON.stringify(await averaged(KIND_SHEETS.flatMap((s) => s.lines.map((l) => ({ label: `${s.kind}|${l.name}`, phrases: [`the ${l.name} of a ${s.kind}`, `a close-up of the ${l.name} on a ${s.kind}`] }))))));
console.log(`${ALL_PART_NAMES.length} parts, ${MATERIALS.length} materials, ${KIND_SHEETS.length} kinds`);
console.log(`${objects.length} objects`);
console.log(`${out.length} phrases, ${out[0].embedding.length} dimensions`);
