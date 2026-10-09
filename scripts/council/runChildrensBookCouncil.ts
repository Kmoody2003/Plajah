// runChildrensBookCouncil — convene the real Council of Art Directors (services/council) on the children's picture-book templates.
//
// Uses the council's own engine (createCouncil: PROPOSE -> DISPUTE -> SYNTHESISE -> REFLECT), the directors' real
// profiles in Firestore, and persists sessions + reflections exactly as the app does. Two lanes are swapped for
// what works on this machine:
//   model  Gemini Pro, because the local ANTHROPIC_API_KEY is rejected (401). Set COUNCIL_LANE=claude to use Claude.
//   store  auth from `gcloud auth print-access-token` (no service-account JSON locally).
//
// Run: npx tsx scripts/council/runChildrensBookCouncil.ts
import { execSync as execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createCouncil } from '../../services/council/councilRoutes';
import type { CouncilBrief } from '../../services/council/councilTypes';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }

// Network hiccups (ETIMEDOUT on Firestore when many directors read profiles at once) retry instead of killing the run.
const rawFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  for (let a = 0; ; a++) {
    try { return await rawFetch(input, init); }
    catch (e) { if (a >= 4) throw e; await new Promise(r => setTimeout(r, 2000 * (a + 1))); }
  }
}) as typeof fetch;

const OWNER_UID = 'hiP7PGj15eTq0r0ZH2XwN00AS2h1';
const GCLOUD = path.join(process.env.LOCALAPPDATA || '', 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd');
let token = '', tokenAt = 0;
async function headers() {
  if (!token || Date.now() - tokenAt > 30 * 60e3) { token = execFileSync(`"${GCLOUD}" auth print-access-token`, { shell: true } as any).toString().trim(); tokenAt = Date.now(); }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function gemini(system: string, user: string, maxTokens = 1200): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  for (let attempt = 0; ; attempt++) {
    try {
      const r: any = await genai.models.generateContent({
        model: process.env.COUNCIL_GEMINI_MODEL || 'gemini-3.5-flash',
        contents: user,
        config: { systemInstruction: system, temperature: 0.9, maxOutputTokens: Math.max(4096, maxTokens * 4) },
      });
      return r?.text || '';
    } catch (e: any) {
      const msg = String(e?.message || e);
      const perDay = /PerDay/.test(msg);
      if (!/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/.test(msg) || perDay || attempt >= 6) throw e;
      await new Promise(r => setTimeout(r, 15000 * (attempt + 1)));
    }
  }
}

/** The council's own Claude lane (same model + settings as councilRoutes), with retry and a debug trail. */
async function claudeLane(system: string, user: string, maxTokens = 1200): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.COUNCIL_CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: maxTokens, temperature: 0.9, system, messages: [{ role: 'user', content: user }] }),
    });
    const data: any = await r.json().catch(() => ({}));
    if (r.ok) { const t = data?.content?.[0]?.text || ''; if (process.env.COUNCIL_DEBUG) console.log(`[lane] ok stop=${data.stop_reason} len=${t.length} head=${JSON.stringify(t.slice(0, 80))}`); return t; }
    console.log(`[lane] HTTP ${r.status} ${data?.error?.message || ''}`);
    if ((r.status === 429 || r.status >= 500) && attempt < 6) { await new Promise(res => setTimeout(res, 8000 * (attempt + 1))); continue; }
    throw new Error(data?.error?.message || `Claude ${r.status}`);
  }
}

const SHARED: string[] = [
  'Surface: Plajah Tela publication templates (services/tela/designs/publications/books.ts), children\'s picture books read on tablets and phones and printed (via print-on-demand) at 1024x768 landscape spreads.',
  'Why this is being redone: the first pass (six templates: space, forest, ocean, bedtime, city, folktale) was judged by the owner as too muted, too similar to each other, tidy and adult-looking: "designed like adults are reading it to converse". They must look INVITING and EYE-CATCHING TO CHILDREN, like real art-driven picture books, and each of the six must be unmistakably different at a glance.',
  'Research findings to design from: (1) the SPREAD is the unit, not the page; compose each two-page spread as one visual field, keep key faces/action off the gutter, let skies and grounds cross it. (2) 32-page structure: half-title, front matter, ~12-14 story spreads, back matter; the first and last pages are single pages. (3) PAGE TURNS are designed: a spread sets up the next reveal, so vary the rhythm (quiet / loud, close / wide, full-bleed / vignette / spot / sequence of small panels / colour-block pause). (4) Layout VARIETY across spreads is what makes a book feel alive: alternate full-bleed scenes, framed vignettes, spot images floating on colour, multi-panel strips, text-over-art. (5) Text is short (15 to 30 words a page), big, loosely leaded, and often HAND-LETTERED or shaped to the art, sitting INSIDE the illustration (on a banner, a cloud, a wave, a path) rather than in a neat box on top; display type acts as a character in the story. (6) Colour: bold, saturated, high-contrast for the youngest (infant studies show vivid contrast and simple big shapes hold attention best); pastels only as a deliberate choice for a calm bedtime book. (7) Ornamental flourishes and playful details add excitement. (8) The cover is a poster: one big character or shape, huge title lettering, a bright ground.',
  'Build method (fixed): templates are drawn by deterministic TypeScript designers into Tela vector objects (rect, ellipse, path, text, images). There is no photo or illustrator input: art is procedural vector shapes (blobs, cut-paper shapes, patterns, hand-drawn-feeling paths, stylised characters built from shapes) plus labelled IMAGE SLOTS where generated art can replace it later. Decide, per template, what the procedural art actually is so the page already looks finished and joyful WITHOUT a photo.',
  'Production of final art is GENERATIVE ONLY (no budget for commissions); procedural vector illustration must carry the templates today.',
  'Do NOT imitate any living illustrator or copy any specific book. Name art-direction FAMILIES (cut-paper collage, mid-century geometric, wet-watercolour wash, folk/block-print, chunky crayon doodle, flat-shape minimalism, hand-inked cartoon, painted gouache night) and make Plajah-original work in them. No copyrighted characters.',
  'Age band: 3 to 8. Must read at a glance on a phone and in print.',
];

const BRIEFS: Record<string, CouncilBrief> = {
  picturebooks: {
    ask: 'Set the art direction for SIX children\'s picture-book templates (ids story-space, story-forest, story-ocean, story-bedtime, story-city, story-folktale; you may rename or reassign subjects if a stronger set of six emerges, but keep six). For EACH: the art-direction family and its signature (shape language, how characters/creatures are built from shapes, textures and patterns), a 6 to 8 colour palette with exact hex values that is SATURATED and high-contrast where the age band wants it, the type system (display lettering treatment, body face and size, where text sits relative to the art), the cover composition, and a spread-by-spread rhythm for the standard page set (cover, story spreads in at least five different layout types, a quiet page-turn spread, an activity page, back cover). Then decide what makes all six UNMISTAKABLY DIFFERENT from each other, and what small set of shared rules (grid, gutter, safe zones, page-turn pacing) keeps them one family. Disagree openly where you disagree.',
    audience: 'Children 3 to 8 looking over a parent\'s shoulder or holding a tablet, and the parents/authors choosing a template for their own picture book.',
    feeling: 'Joy, curiosity and a want-to-touch-it energy; a bookshop table, not a brand guideline.',
    constraints: SHARED,
    references: ['The owner\'s verdict on the first pass: too muted, too similar, not children\'s-book-looking, boring, adult.', 'What good looks like: art-forward spreads where the picture is the hero, text living inside the art, bold shape-driven characters, big hand-lettered titles, surprising layout changes every spread.'],
  },
};

async function main() {
  const lane = process.env.COUNCIL_LANE === 'claude' ? claudeLane : gemini;
  const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: headers, model: lane } as any);
  const out = path.join('docs', 'tela', 'council'); mkdirSync(out, { recursive: true });
  for (const key of Object.keys(BRIEFS)) {
    const brief = { ...BRIEFS[key], surface: 'Plajah Tela publication templates', domain: 'picture book design' };
    const t0 = Date.now();
    const d = await council.deliberate(OWNER_UID, brief, { depth: (process.env.COUNCIL_DEPTH as any) || 'FULL' });
    console.log(`[${key}] ${d.status} in ${Math.round((Date.now() - t0) / 1000)}s · proposals ${d.proposals.length} · disputes ${d.disputes.length}${d.error ? ' · ' + d.error : ''}`);
    writeFileSync(path.join(out, `childrens-book.json`), JSON.stringify(d, null, 2));
  }
  // Reflections run after each answer; give them time to land in the directors' profiles before exiting.
  await new Promise(r => setTimeout(r, 90000));
  console.log('done');
}
main().catch(e => { console.error(e); process.exit(1); });
