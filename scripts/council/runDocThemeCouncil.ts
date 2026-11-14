// runDocThemeCouncil — the Council of Art Directors directs the design language of Tela's
// word-document templates (services/tela/docTemplates). One deliberation per document family;
// each session's lead and counterpoint directions are then built by hand as Writer themes
// (stylesheet + page flourishes) in services/tela/docTemplates/themes.ts.
//
// Cloud lane only (Gemini by default, COUNCIL_LANE=claude for Claude) — never the local GPU lane.
// File-backed store: profiles from docs/ambo/council/profiles, sessions to docs/tela/doc-templates/council.
// Resumable: a family whose JSON already exists (status DONE) is skipped.
//
// Run: npx tsx scripts/council/runDocThemeCouncil.ts [familyId…]     (DEPTH=FULL for the long form)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCouncil, type CouncilStore } from '../../services/council/councilRoutes';
import type { CouncilBrief } from '../../services/council/councilTypes';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
}

const OUT = path.join('docs', 'tela', 'doc-templates', 'council');
const PROFILES = path.join('docs', 'ambo', 'council', 'profiles');
mkdirSync(OUT, { recursive: true });

const mem = new Map<string, Record<string, any>>();
const store: CouncilStore = {
  get: async (p) => {
    if (mem.has(p)) return mem.get(p)!;
    const d = /^council_directors\/([A-Z_]+)$/.exec(p);
    const f = d && path.join(PROFILES, `${d[1]}.json`);
    return f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  },
  set: async (p, obj) => { mem.set(p, obj); return true; },
  list: async () => [],
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// The directors answer in parallel, but a free-tier key allows 5 requests a minute: calls go
// through one queue, spaced COUNCIL_PACE_MS apart (0 on a paid key).
const PACE = Number(process.env.COUNCIL_PACE_MS ?? 13500);
let gate: Promise<void> = Promise.resolve();
function paced(): Promise<void> {
  const turn = gate;
  gate = gate.then(() => sleep(PACE)).then(() => undefined);
  return turn;
}
async function geminiLane(system: string, user: string, maxTokens = 1200): Promise<string> {
  await paced();
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '' });
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
      if (!/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|fetch failed|ECONNRESET/.test(msg) || /PerDay/.test(msg) || attempt >= 4) throw e;
      await sleep(20000 * (attempt + 1));
    }
  }
}
async function claudeLane(system: string, user: string, maxTokens = 1200): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.COUNCIL_CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: Math.max(4096, maxTokens), temperature: 0.9, system, messages: [{ role: 'user', content: user }] }),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Claude ${r.status}`);
  return data?.content?.[0]?.text || '';
}

const FONTS = 'Text serifs: Source Serif 4, EB Garamond, Cormorant Garamond, Crimson Pro, Libre Baskerville, Lora, Spectral, Merriweather, Cardo, Alegreya, Gelasio, Noto Serif, Bitter, Zilla Slab, Roboto Slab, Josefin Slab. Display serifs: Playfair Display, Fraunces, DM Serif Display, Bodoni Moda, Instrument Serif, Gloock, Cinzel, Italiana, Forum, Marcellus, Yeseva One, Abril Fatface, Philosopher. Sans: Inter, Source Sans 3, DM Sans, Manrope, Work Sans, Karla, Nunito, Outfit, Sora, Space Grotesk, Epilogue, Archivo, Raleway, Josefin Sans, Tenor Sans, Lexend, Bricolage Grotesque, Syne, Rubik. Condensed: Oswald, Bebas Neue, League Gothic, Big Shoulders Display, Archivo Black, Anton. Mono / typewriter: JetBrains Mono, IBM Plex Mono, DM Mono, Space Mono, Courier Prime, Special Elite. Hand: Caveat, Kalam, Patrick Hand. Blackletter / uncial: UnifrakturMaguntia, Uncial Antiqua, Almendra.';

const COMMON: string[] = [
  'Surface: a word-processor page in Plajah Tela — US Letter, 8.5 × 11 in, printed on an office laser or church copier and also read on screen. These are documents people WRITE in: the words are theirs and can be any length. The design must hold with one paragraph or forty pages.',
  'You are directing a THEME: a stylesheet plus page flourishes. The stylesheet covers Title, Subtitle, Heading 1–3, Body, Quote, Pull quote, Caption, Lists (bullet glyph), Header/Footer text. For each give the font from the list, size in pt, weight, case, tracking, colour, alignment and spacing; say whether body is ragged or justified and whether paragraphs indent or space.',
  'Fonts available (use only these): ' + FONTS,
  'Flourish vocabulary the page engine can draw behind and around the text, as flat vector art: paper tint; page border frames (single, double, inset, bracketed corners); corner ornaments; rules above/below headings (hairline, thick-thin, short centred, full measure, dashed); a side band or margin stripe; a head band across the top; drop caps (2–4 lines); a fleuron or geometric mark between sections; folio (page number) treatment; heading number tabs; shaded or ruled quote blocks. No photographs, no gradients wider than a band, nothing that depends on the words.',
  'Print law: body text 10.5–12 pt with at least 7:1 contrast against the paper; ink coverage low enough for a church copier (no full-bleed dark pages; tinted paper must also read when printed on white); nothing vital within 0.4 in of the edge; the theme must survive black-and-white printing.',
  'Give production-ready specifics: palette as hex (paper, ink, muted ink, accent, second accent), the exact fonts, sizes, the flourish list with positions and weights in pt or inches, and the one detail that makes this theme recognisable from across a table.',
  'Name the direction with a two- or three-word title a church administrator or a student would understand in a template gallery.',
];

interface Family { id: string; name: string; brief: Omit<CouncilBrief, 'constraints'> }
const FAMILIES: Family[] = [
  { id: 'formal', name: 'Letters, memos & minutes', brief: { ask: 'Direct the theme for institutional paperwork: letters on letterhead, memos, board minutes, policies and reports.', domain: 'churches, nonprofits and small organisations in Detroit', audience: 'board members, donors, city offices, congregants — people who judge an organisation by its paper', feeling: 'trustworthy, settled, dignified without being stiff' } },
  { id: 'worship', name: 'Sermons, bulletins & orders of service', brief: { ask: 'Direct the theme for worship documents: sermon manuscripts, Sunday bulletins, orders of service, devotionals and prayer guides.', domain: 'Black church and wider Christian worship life', audience: 'pastors at the pulpit reading at arm\'s length, and congregants holding a folded bulletin', feeling: 'reverent, warm, sung rather than spoken — never kitsch' } },
  { id: 'editorial', name: 'Newsletters, articles & annual reports', brief: { ask: 'Direct the theme for editorial documents: newsletters, feature articles, impact and annual reports.', domain: 'community organisations and independent publishers telling their own story', audience: 'members, neighbours and funders who will skim first and read second', feeling: 'confident, journalistic, alive — a publication, not a form' } },
  { id: 'scholarly', name: 'Essays, lesson plans & grant narratives', brief: { ask: 'Direct the theme for studious documents: essays, research papers, study guides, lesson plans and grant narratives.', domain: 'students, teachers and grant writers', audience: 'graders, reviewers and learners reading closely with a pen', feeling: 'clear-headed, rigorous, generous to the reader' } },
  { id: 'personal', name: 'Résumés, cover letters & programs', brief: { ask: 'Direct the theme for personal documents: résumés, cover letters, bios, event programs and invitations.', domain: 'individuals presenting themselves or an occasion', audience: 'a hiring manager with thirty seconds; a guest keeping the program', feeling: 'self-possessed, memorable, one confident gesture' } },
  { id: 'literary', name: 'Chapters, poems & journals', brief: { ask: 'Direct the theme for literary pages: book chapters, short stories, poetry folios, journals and memoir.', domain: 'writers drafting and sharing their own work', audience: 'readers settling in for long-form reading', feeling: 'bookish, intimate, a page you want to keep reading' } },
];

async function main() {
  const lane = process.env.COUNCIL_LANE === 'claude' ? claudeLane : geminiLane;
  const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model: lane } as any);
  const only = process.argv.slice(2);
  const depth = process.env.DEPTH === 'FULL' ? 'FULL' : 'QUICK';
  for (const f of FAMILIES) {
    if (only.length && !only.includes(f.id)) continue;
    const file = path.join(OUT, `${f.id}.json`);
    if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).status === 'DONE') { console.log(`[council] ${f.id}: already directed, skipping`); continue; }
    const brief: CouncilBrief = { ...f.brief, surface: `Tela word-document theme family "${f.name}"`, constraints: COMMON, references: ['Plajah Tela Writer (paragraph styles, page setup, vector page flourishes)'] };
    const t0 = Date.now();
    try {
      const d = await council.deliberate('doc-themes', brief, { depth });
      writeFileSync(file, JSON.stringify({ family: f.id, name: f.name, ...d }, null, 2));
      console.log(`[council] ${f.id}: ${d.status} in ${Math.round((Date.now() - t0) / 1000)}s · ${d.proposals.length} proposals · lead ${d.synthesis?.lead} / counterpoint ${d.synthesis?.counterpoint}${d.error ? ` · ${d.error}` : ''}`);
    } catch (e: any) {
      console.log(`[council] ${f.id}: FAILED ${e?.message || e}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
