// Run the Art Council and the Writers Council over the Lorea craft exhibits.
//
//   npx tsx scripts/council/runLoreaExhibitCouncil.ts [exhibitId ...]
//
// Cloud lanes only (Claude by default, COUNCIL_LANE=gemini to switch). Never the local lane: local
// batches overheat the laptop. Each exhibit gets an OPEN brief — the councils decide the look and
// the voice; the only fixed things are the handmade ink-and-paper world and the playable stations.
// Output: docs/lorea/council/<id>.json (a LoreaCouncilBuild). Then run
// scripts/council/applyLoreaExhibitCouncil.ts to fold the builds into data/loreaExhibits/councilBuilds.ts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { createCouncil, type CouncilStore } from '../../services/council/councilRoutes';
import type { CouncilBrief } from '../../services/council/councilTypes';
import { LOREA_EXHIBITS } from '../../data/loreaExhibits/all';

const output = 'docs/lorea/council'; mkdirSync(output, { recursive: true });
if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^(ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_AI_API_KEY|COUNCIL_GEMINI_MODEL|COUNCIL_CLAUDE_MODEL)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const lane = process.env.COUNCIL_LANE || 'claude';
if (!['claude', 'gemini', 'pokee'].includes(lane)) throw new Error('COUNCIL_LANE must be claude, gemini or pokee (no local lane for this run).');
// Pokee: the cloud Pokee-Isaac API (OpenAI-style). The current key is in Google Secret Manager
// (plajah-api-pokee-api-key); the .env.local copy is older and rejected, so export POKEE_API_KEY first.
const key = lane === 'claude' ? process.env.ANTHROPIC_API_KEY : lane === 'pokee' ? process.env.POKEE_API_KEY : process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error(`Council ${lane} credential is not configured.`);
const genai = lane === 'gemini' ? new GoogleGenAI({ apiKey: key }) : null;

const dbFile = path.join(output, 'local-review-store.json');
const db: Record<string, any> = existsSync(dbFile) ? JSON.parse(readFileSync(dbFile, 'utf8')) : {};
const store: CouncilStore = {
  get: async k => db[k] || null,
  set: async (k, v) => { db[k] = v; writeFileSync(dbFile, JSON.stringify(db, null, 2)); return true; },
  list: async k => Object.entries(db).filter(([x]) => x.startsWith(k + '/')).map(([, v]) => v),
};

let requests = 0;
async function model(system: string, user: string, maxTokens = 2400): Promise<string> {
  const id = ++requests;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let text: string;
      if (lane === 'claude') {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key!, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: process.env.COUNCIL_CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: Math.max(4096, maxTokens), temperature: 0.9, system, messages: [{ role: 'user', content: user }] }),
          signal: AbortSignal.timeout(90000),
        });
        if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
        const data = await r.json(); text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      } else if (lane === 'pokee') {
        const r = await fetch('https://api.pokee.ai/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: process.env.COUNCIL_POKEE_MODEL || 'pokee-isaac', max_tokens: Math.max(4096, maxTokens), temperature: 0.9, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
          signal: AbortSignal.timeout(180000),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`Pokee HTTP ${r.status}: ${data?.error?.message || 'request failed'}`);
        text = data?.choices?.[0]?.message?.content || '';
      } else {
        const r = await genai!.models.generateContent({ model: process.env.COUNCIL_GEMINI_MODEL || 'gemini-3.5-flash', contents: [{ role: 'user', parts: [{ text: user }] }], config: { systemInstruction: system, maxOutputTokens: maxTokens * 3, temperature: 0.9, httpOptions: { timeout: 90000 } } });
        text = r.text || '';
      }
      console.log(`  model call ${id} ok`);
      return text;
    } catch (e) {
      if (attempt === 2) throw new Error(`model call ${id} failed: ${e instanceof Error ? e.message : e}`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return '';
}

const json = (t: string) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in reply'); return JSON.parse(m[0]); };
/** Ask for JSON; models sometimes return almost-JSON, so ask again (up to 3 tries). */
async function askJson(system: string, user: string, maxTokens?: number): Promise<any> {
  for (let i = 0; ; i++) {
    try { return json(await model(system, i ? `${user}\n\nYour last reply was not valid JSON. Reply with one valid JSON object only.` : user, maxTokens)); }
    catch (e) { if (i === 2) throw e; }
  }
}

const WRITERS_SYSTEM = `You are the Lorea Writers Council: a novelist, a poet, a journalist, a children's author, a grammarian and a literature professor who argue and then agree. You have full creative freedom over voice and angle. You write for readers from age 4 to university. You only quote public-domain text (published before 1929), verbatim. Reply with JSON only.`;

const ids = process.argv.slice(2);
const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model } as any);

/** What the other exhibits look like now: their council build if one exists, else the authored materials. */
function othersChosen(selfId: string): string {
  return LOREA_EXHIBITS.filter(e => e.id !== selfId).map(e => {
    const f = path.join(output, `${e.id}.json`);
    const m = existsSync(f) ? { ...e.materials, ...JSON.parse(readFileSync(f, 'utf8')).materials } : e.materials;
    return `- ${e.title}: ${m.paper} paper, ${m.ink} ink, washes ${m.wash.join(' ')}, accent ${m.accent}, ${m.hand} hand, ${m.motif} motif`;
  }).join('\n');
}

const force = process.env.COUNCIL_FORCE === '1';
for (const ex of LOREA_EXHIBITS.filter(e => !ids.length || ids.includes(e.id))) {
  console.log(`\n${ex.title} (${ex.id})`);
  if (!force && existsSync(path.join(output, `${ex.id}.json`))) { console.log('  already directed (COUNCIL_FORCE=1 to redo)'); continue; }
  try { await directExhibit(ex); } catch (e) { console.log(`  failed: ${e instanceof Error ? e.message : e}`); }
}

async function directExhibit(ex: (typeof LOREA_EXHIBITS)[number]) {
  const roomList = ex.rooms.map(r => `${r.title}: ${r.nodes.map(n => n.title).join(' / ')}`).join('\n');
  const brief: CouncilBrief = {
    ask: `Art-direct the Lorea exhibit "${ex.title}" — a walk-through exhibition about ${ex.id} in the craft of writing. You have creative freedom: choose the paper, the ink, the washes, the one saturated accent, the lettering and the motif, and say what makes this exhibit look unlike the other seven. It must feel handmade — written, inked, pressed, pasted on real paper — and still carry colour. It must be easy to learn from and gorgeous at every reading level.`,
    surface: 'Lorea Exhibition Hall: entrance sheet, room sheets, pasted library clippings, hands-on station cards, torn-paper teaser nuggets in the feed',
    domain: 'literary craft education',
    audience: 'Readers from Pre-K to university; Academia classrooms and university seminars',
    feeling: 'Handmade, inky, tactile, curious, warm',
    constraints: [
      'Materials must map to: paper (laid|cotton|kraft|vellum|newsprint|rag|parchment|washi), ink (iron-gall|sepia|indigo|vermilion|carbon|verdigris), two wash colours, one accent hex, hand (script|print|type), motif (quill|press|lyre|lantern|mask|arc|metronome|type-case).',
      'The other seven exhibits exist; differ from them. Their current choices are listed in references; do not repeat a paper or motif already taken unless you argue for it.',
      'Washes are translucent watercolour tints bled behind ink text and must stay light to mid (the ink must read through them). The accent is one saturated colour for stamps and underlines, never near-black or near-grey.',
      'Interactive stations stay as they are; you direct their look, not their mechanics.',
    ],
    references: [`Rooms:\n${roomList}`, `Current authored materials: ${JSON.stringify(ex.materials)}`, `Other exhibits' choices so far:\n${othersChosen(ex.id)}`],
  };
  let d = await council.deliberate(`lorea-exhibit-${ex.id}`, brief, { depth: 'FULL' });
  if (d.status !== 'DONE' || !d.synthesis) { console.log(`  council did not settle (${d.error}); convening again`); d = await council.deliberate(`lorea-exhibit-${ex.id}-2`, brief, { depth: 'FULL' }); }
  if (d.status !== 'DONE' || !d.synthesis) { console.log(`  council failed: ${d.error}`); return; }

  const mats = await askJson('You translate an art-direction synthesis into exhibit materials. Reply with JSON only.',
    `Synthesis:\n${JSON.stringify(d.synthesis)}\n\nReturn {"paper":..,"ink":..,"wash":["#hex","#hex"],"accent":"#hex","hand":..,"motif":..,"note":"one sentence of what the council decided"} using only the allowed values: ${brief.constraints![0]} ${brief.constraints![3]} Already taken by other exhibits:\n${othersChosen(ex.id)}`);

  const w = await askJson(WRITERS_SYSTEM,
    `Exhibit: ${ex.title} (${ex.kicker}). Current tagline: ${ex.tagline}. Current epigraph: ${JSON.stringify(ex.epigraph)}.\nRooms:\n${roomList}\nRoom ids: ${ex.rooms.map(r => r.id).join(', ')}\nExisting nugget hooks: ${ex.nuggets.map(n => n.hook).join(' | ')}\n\nThe Art Council chose: ${mats.note}\n\nReturn {"tagline": "...", "epigraph": {"text": "...", "cite": "..."} (public domain, verbatim, or keep the current), "note": "one line: the voice and the way in you chose", "nuggets": [up to 4 NEW teasers {"id":"${ex.id}-wc-1","exhibitId":"${ex.id}","roomId":"<room id>","hook":"<70 chars, makes someone curious>","body":"1-2 sentences","depths":[optional subset of early|elementary|middle|high|university]}]}`, 3000);

  const build = {
    id: ex.id,
    tagline: w.tagline,
    epigraph: w.epigraph,
    materials: { paper: mats.paper, ink: mats.ink, wash: mats.wash, accent: mats.accent, hand: mats.hand, motif: mats.motif },
    council: {
      source: 'council',
      art: { lead: d.synthesis.lead, counterpoint: d.synthesis.counterpoint, note: mats.note },
      writers: { note: w.note },
    },
    nuggets: w.nuggets || [],
    sessionId: d.id,
  };
  writeFileSync(path.join(output, `${ex.id}.json`), JSON.stringify(build, null, 2));
  writeFileSync(path.join(output, `${ex.id}.deliberation.json`), JSON.stringify(d, null, 2));
  console.log(`  lead ${d.synthesis.lead}, counterpoint ${d.synthesis.counterpoint} → ${mats.paper}/${mats.ink}/${mats.motif}`);
}
