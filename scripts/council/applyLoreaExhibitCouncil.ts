// Fold docs/lorea/council/<id>.json council builds into data/loreaExhibits/councilBuilds.ts.
//
//   npx tsx scripts/council/applyLoreaExhibitCouncil.ts
//
// Enum values are checked so a council can never break the page; a bad field is dropped and the
// hand-authored value stays.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const dir = 'docs/lorea/council';
const target = 'data/loreaExhibits/councilBuilds.ts';
const PAPER = ['laid', 'cotton', 'kraft', 'vellum', 'newsprint', 'rag', 'parchment', 'washi'];
const INK = ['iron-gall', 'sepia', 'indigo', 'vermilion', 'carbon', 'verdigris'];
const HAND = ['script', 'print', 'type'];
const MOTIF = ['quill', 'press', 'lyre', 'lantern', 'mask', 'arc', 'metronome', 'type-case'];
const DIRECTORS = ['CLASSICAL', 'REBEL', 'FUTURIST', 'WORLD_ECLECTIC', 'BAROQUE', 'RADICAL_MINIMAL'];
const DEPTHS = ['early', 'elementary', 'middle', 'high', 'university'];
const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
function hsl(h: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}
// The material system's physics: washes bleed behind ink text so they must stay light; the accent
// stamps and underlines so it must be a real colour. Anything else falls back to the authored value.
const washOk = (w: unknown) => hex(w) && hsl(w as string).l >= 0.45;
const accentOk = (a: unknown) => hex(a) && hsl(a as string).s >= 0.35 && hsl(a as string).l >= 0.22 && hsl(a as string).l <= 0.68;

// Motifs are each exhibit's signature: a council motif already taken by another exhibit (its
// authored motif, or a council build applied earlier) falls back to the authored one.
const { LOREA_EXHIBITS } = await import('../../data/loreaExhibits/all');
const AUTHORED_MOTIF: Record<string, string> = Object.fromEntries(LOREA_EXHIBITS.map(e => [e.id, e.materials.motif]));
const motifTaken = new Map<string, string>(Object.entries(AUTHORED_MOTIF).map(([id, m]) => [m, id]));

const builds: any[] = [];
if (existsSync(dir)) for (const f of readdirSync(dir).filter(f => /^[a-z]+\.json$/.test(f))) {
  const b = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  const m = b.materials || {};
  const materials: Record<string, unknown> = {};
  if (PAPER.includes(m.paper)) materials.paper = m.paper;
  if (INK.includes(m.ink)) materials.ink = m.ink;
  if (Array.isArray(m.wash) && m.wash.length === 2 && m.wash.every(washOk)) materials.wash = m.wash;
  else console.warn(`${f}: washes ${JSON.stringify(m.wash)} too dark for ink to read through; keeping authored washes`);
  if (accentOk(m.accent)) materials.accent = m.accent;
  else console.warn(`${f}: accent ${m.accent} is not a saturated colour; keeping authored accent`);
  if (HAND.includes(m.hand)) materials.hand = m.hand;
  if (MOTIF.includes(m.motif)) {
    const owner = motifTaken.get(m.motif);
    if (!owner || owner === b.id) { materials.motif = m.motif; motifTaken.delete(AUTHORED_MOTIF[b.id]); motifTaken.set(m.motif, b.id); }
    else console.warn(`${f}: motif ${m.motif} already belongs to ${owner}; keeping authored motif`);
  }
  const lead = DIRECTORS.includes(b.council?.art?.lead) ? b.council.art.lead : null;
  if (!lead) { console.warn(`${f}: no valid lead director, skipped`); continue; }
  const nuggets = (b.nuggets || []).filter((n: any) => n?.id && n.hook && n.hook.length <= 80 && n.body)
    .map((n: any) => ({ ...n, exhibitId: b.id, depths: Array.isArray(n.depths) ? n.depths.filter((d: string) => DEPTHS.includes(d)) : undefined }));
  builds.push({
    id: b.id,
    tagline: typeof b.tagline === 'string' ? b.tagline : undefined,
    epigraph: b.epigraph?.text && b.epigraph?.cite ? b.epigraph : undefined,
    materials,
    council: {
      source: 'council',
      art: { lead, counterpoint: DIRECTORS.includes(b.council.art.counterpoint) ? b.council.art.counterpoint : undefined, note: String(b.council.art.note || '') },
      writers: { note: String(b.council.writers?.note || '') },
    },
    nuggets,
  });
}

const src = readFileSync(target, 'utf8');
const block = `// @generated-start — applyLoreaExhibitCouncil.ts replaces this block\nexport const LOREA_COUNCIL_BUILDS: LoreaCouncilBuild[] = ${JSON.stringify(builds, null, 2)};\n// @generated-end`;
const next = src.replace(/\/\/ @generated-start[\s\S]*?\/\/ @generated-end/, block);
writeFileSync(target, next);
console.log(`${builds.length} council build(s) written to ${target}`);
