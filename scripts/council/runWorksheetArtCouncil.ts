// Run the Art Council over the Academia worksheet themes.
//
//   npx tsx scripts/council/runWorksheetArtCouncil.ts [themeId ... | new-k2 new-35 new-68]
//
// Cloud lanes only (Gemini by default since 2026-10-25, COUNCIL_LANE=claude to switch) — never the local lane: local batches overheat
// the laptop. Each seed theme gets an open brief: refine it for a school photocopier, for early/dyslexic readers and for
// beauty. `new-<band>` asks the council for a brand-new house style for that grade band.
// Output: docs/academia/worksheet-council/<id>.json, then scripts/council/applyWorksheetArtCouncil.ts folds the builds
// into data/yearCurriculum/councilThemes.ts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { createCouncil, type CouncilStore } from '../../services/council/councilRoutes';
import type { CouncilBrief } from '../../services/council/councilTypes';
import { WORKSHEET_THEMES } from '../../services/yearCurriculum/worksheetThemes';

const output = 'docs/academia/worksheet-council'; mkdirSync(output, { recursive: true });
if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^(ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_AI_API_KEY|COUNCIL_GEMINI_MODEL|COUNCIL_CLAUDE_MODEL)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const lane = process.env.COUNCIL_LANE || 'gemini';
if (!['claude', 'gemini'].includes(lane)) throw new Error('COUNCIL_LANE must be claude or gemini (no local lane for this run).');
const key = lane === 'claude' ? process.env.ANTHROPIC_API_KEY : process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error(`Council ${lane} credential is not configured.`);
const genai = lane === 'gemini' ? new GoogleGenAI({ apiKey: key }) : null;

const dbFile = path.join(output, 'local-review-store.json');
const db: Record<string, any> = existsSync(dbFile) ? JSON.parse(readFileSync(dbFile, 'utf8')) : {};
const store: CouncilStore = {
  get: async k => db[k] || null,
  set: async (k, v) => { db[k] = v; writeFileSync(dbFile, JSON.stringify(db, null, 2)); return true; },
  list: async k => Object.entries(db).filter(([x]) => x.startsWith(k + '/')).map(([, v]) => v),
};

// The council fires six directors at once; the Gemini free tier allows ~5 requests a minute. Serialise every call
// through one queue with a minimum gap, and on 429/503 wait out the server's retryDelay before trying again.
const GAP_MS = Number(process.env.COUNCIL_GAP_MS || (lane === 'gemini' ? 13000 : 0));
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
// Free-tier daily caps are per model: when one model keeps answering 429, move to the next.
const GEMINI_MODELS = (process.env.COUNCIL_GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.5-flash-lite').split(',').map(x => x.trim()).filter(Boolean);
let geminiIdx = 0, strikes = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function model(system: string, user: string, maxTokens = 2400): Promise<string> {
  const run = queue.then(async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(Math.max(0, lastCall + GAP_MS - Date.now()));
      lastCall = Date.now();
      try { const t = await modelOnce(system, user, maxTokens); strikes = 0; return t; }
      catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/per day|PerDay/i.test(msg)) {
          if (lane !== 'gemini' || geminiIdx + 1 >= GEMINI_MODELS.length) throw new Error('daily quota exhausted');
          geminiIdx++; strikes = 0; console.log(`  daily cap hit, switching to ${GEMINI_MODELS[geminiIdx]}`); continue;
        }
        const wait = Number((/retry in ([\d.]+)s/i.exec(msg) || /"retryDelay":"(\d+)s"/.exec(msg) || [])[1] || 0);
        if (!/429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|HTTP 5\d\d/.test(msg) || attempt === 7) throw e;
        if (lane === 'gemini' && /429|RESOURCE_EXHAUSTED/.test(msg) && ++strikes >= 3) {
          if (geminiIdx + 1 >= GEMINI_MODELS.length) throw new Error('every Gemini model is out of free-tier quota');
          geminiIdx++; strikes = 0; console.log(`  switching to ${GEMINI_MODELS[geminiIdx]}`); continue;
        }
        console.log(`  rate-limited, waiting ${Math.ceil(wait || 20 * (attempt + 1))}s`);
        await sleep((wait || 20 * (attempt + 1)) * 1000 + 500);
      }
    }
    return '';
  });
  queue = run.catch(() => {});
  return run;
}

async function modelOnce(system: string, user: string, maxTokens: number): Promise<string> {
  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      if (lane === 'claude') {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key!, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: process.env.COUNCIL_CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: Math.max(4096, maxTokens), system, messages: [{ role: 'user', content: user }] }),
          signal: AbortSignal.timeout(120000),
        });
        if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
        const data = await r.json();
        return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      }
      const r = await genai!.models.generateContent({ model: GEMINI_MODELS[geminiIdx], contents: [{ role: 'user', parts: [{ text: user }] }], config: { systemInstruction: system, maxOutputTokens: maxTokens * 3, httpOptions: { timeout: 120000 } } });
      return r.text || '';
    } catch (e) {
      throw e;
    }
  }
  return '';
}

const json = (t: string) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in reply'); return JSON.parse(m[0]); };
async function askJson(system: string, user: string): Promise<any> {
  for (let i = 0; ; i++) {
    try { return json(await model(system, i ? `${user}\n\nReply with one valid JSON object only.` : user)); }
    catch (e) { if (i === 2) throw e; }
  }
}

const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model } as any);
const MOTIFS = 'leaves|waves|kente|seigaiha|stars|circuit|confetti|halftone|botanical|flourish|zellige|bauhaus';
const FONTS = 'Andika|Fredoka|Lexend|Outfit|Inter|Manrope|Space Grotesk|Bricolage Grotesque|Newsreader|Noto Serif|Archivo';
const CONSTRAINTS = [
  `Theme fields: paper, ink, accent, accent2, wash (hex); headFont and bodyFont from ${FONTS}; motif from ${MOTIFS}; header from band|arch|ribbon|frame.`,
  'Print-first: it must survive a school photocopier in greyscale. Ink on paper ≥ 7:1 contrast; accent on paper ≥ 3:1; wash light enough that ink reads through it.',
  'Color never carries meaning alone — shapes and words do. The motif lives in the header and margins only; the work area stays calm.',
  'Body type must suit the band: K–2 needs single-storey a and g (Andika or Fredoka); dyslexic readers get Lexend automatically regardless of theme.',
  'Cultural motifs (kente, seigaiha, zellige) are honored, accurate and credited in the note, never costume.',
];

const args = process.argv.slice(2);
const targets = args.length ? args : [...WORKSHEET_THEMES.filter(t => t.source === 'seed').map(t => t.id), 'new-k2', 'new-35', 'new-68'];
for (const id of targets) {
  console.log(`\n${id}`);
  if (process.env.COUNCIL_FORCE !== '1' && existsSync(path.join(output, `${id}.json`))) { console.log('  already directed (COUNCIL_FORCE=1 to redo)'); continue; }
  try { await direct(id); } catch (e) { console.log(`  failed: ${e instanceof Error ? e.message : e}`); }
}

async function direct(id: string) {
  const seed = WORKSHEET_THEMES.find(t => t.id === id);
  const band = seed ? seed.bands.join('/') : id.replace('new-', '');
  const others = WORKSHEET_THEMES.filter(t => t.id !== id).map(t => `- ${t.name} (${t.house}): ${t.motif}, ${t.accent}/${t.accent2}, ${t.headFont}`).join('\n');
  const brief: CouncilBrief = {
    ask: seed
      ? `Refine the "${seed.name}" worksheet house style for Plajah Academia's year of Math and ELA worksheets. Keep what works, fix what fails on paper, make it more beautiful. Seed: ${JSON.stringify(seed)}`
      : `Create a new worksheet house style for grade band ${band} that looks unlike every existing theme and makes children want to pick the page up.`,
    surface: 'US Letter worksheets: header with title and motif, numbered items, answer boxes, reading passages, writing organizers, teacher key',
    domain: 'K–8 classroom worksheets (printed and filled on tablets)',
    audience: band === 'k2' ? 'Children 5–8 and their teachers' : band === '68' ? 'Students 11–14 and their teachers' : 'Children 8–11 and their teachers',
    feeling: 'Calm focus with real delight; dignified for every child, everywhere',
    constraints: CONSTRAINTS,
    references: [`Existing themes:\n${others}`],
  };
  let d = await council.deliberate(`worksheet-theme-${id}`, brief, { depth: 'FULL' });
  if (d.status !== 'DONE' || !d.synthesis) d = await council.deliberate(`worksheet-theme-${id}-2`, brief, { depth: 'FULL' });
  if (d.status !== 'DONE' || !d.synthesis) { console.log(`  council failed: ${d.error}`); return; }
  const t = await askJson('You translate an art-direction synthesis into a worksheet theme. Reply with JSON only.',
    `Synthesis:\n${JSON.stringify(d.synthesis)}\n\nReturn {"name":..,"paper":"#hex","ink":"#hex","accent":"#hex","accent2":"#hex","wash":"#hex","headFont":..,"bodyFont":..,"motif":..,"header":..,"note":"one sentence on what the council decided"}. ${CONSTRAINTS[0]}`);
  const build = { id: seed ? id : `council-${band}-${Date.now().toString(36)}`, base: seed?.id, bands: seed ? seed.bands : [band], house: d.synthesis.lead, theme: t, sessionId: d.id, lead: d.synthesis.lead, counterpoint: d.synthesis.counterpoint };
  writeFileSync(path.join(output, `${id}.json`), JSON.stringify(build, null, 2));
  writeFileSync(path.join(output, `${id}.deliberation.json`), JSON.stringify(d, null, 2));
  console.log(`  lead ${d.synthesis.lead} → ${t.name}: ${t.motif}, ${t.accent}`);
}
