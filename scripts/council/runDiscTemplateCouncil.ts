// runDiscTemplateCouncil — the Council of Art Directors directs Fabula's Blu-ray / Ultra HD Blu-ray
// disc menu templates, one FULL deliberation per template slot. The syntheses are then built as
// Tela vector designs in services/disc/councilTemplates (the Tela stack renders the menus).
//
// Cloud lane only (Gemini by default, COUNCIL_LANE=claude for Claude) — never the local GPU lane.
// File-backed store: profiles from docs/ambo/council/profiles, sessions to docs/disc/council.
// Resumable: a slot whose JSON already exists (status DONE) is skipped.
//
// Run: npx tsx scripts/council/runDiscTemplateCouncil.ts [slotId…]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCouncil, type CouncilStore } from '../../services/council/councilRoutes';
import type { CouncilBrief } from '../../services/council/councilTypes';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
}

const OUT = path.join('docs', 'disc', 'council');
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
async function geminiLane(system: string, user: string, maxTokens = 1200): Promise<string> {
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
      if (!/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|fetch failed|ECONNRESET/.test(msg) || /PerDay/.test(msg) || attempt >= 6) throw e;
      await sleep(15000 * (attempt + 1));
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

const FONTS = 'Display/serif: Playfair Display, Fraunces, DM Serif Display, Cormorant Garamond, EB Garamond, Bodoni Moda, Instrument Serif, Gloock, Cinzel, Italiana, Forum, Abril Fatface, Marcellus, Tenor Sans. Condensed/poster: Bebas Neue, Anton, Oswald, League Gothic, Six Caps, Big Shoulders Display, Staatliches, Archivo Black, Syne, Unbounded. Sans: Inter, DM Sans, Manrope, Space Grotesk, Sora, Outfit, Bricolage Grotesque, Josefin Sans, Raleway, Work Sans, Epilogue. Mono/typewriter: JetBrains Mono, IBM Plex Mono, Space Mono, Courier Prime, Special Elite. Genre: Monoton, Limelight, Poiret One, Righteous, Orbitron, Michroma, UnifrakturMaguntia, Pirata One, Almendra Display, Fredoka, Baloo 2, DynaPuff, Sniglet, Caveat Brush, Permanent Marker.';

const COMMON: string[] = [
  'Surface: Blu-ray and Ultra HD Blu-ray disc menus on a living-room TV, a 1920×1080 graphics plane (UHD menus are HD graphics the player scales), seen from a couch three metres away, driven only by a remote: arrow keys + OK.',
  'Menus to direct as ONE family: Main menu, Scene selection (six chapter thumbnails per page, Previous/Next/Back), Setup (audio and subtitle choices), Special Features list, and a Pop-up bar that rises over the film while it plays. Series templates add an Episodes page.',
  'Every button has three designed states — normal, selected, activated — and the selected state must read instantly from across a room. Say exactly what the selection mark is (shape, colour, size).',
  'Built in Plajah Tela as vector art: rectangles, ellipses, lines, SVG paths, text, image slots (the film\'s own frames), linear/radial gradients, shadows, opacity, blend modes. Fonts available: ' + FONTS,
  'Disc graphics law: each menu page\'s buttons share a 255-colour palette, so button art stays flat (no wide gradients inside buttons — gradients belong in the background art); action-safe 90%, title-safe 80%; body text ≥ 28px, nothing thinner than 2px (TV scaling shimmers); on UHD avoid large full-white fields.',
  'The main-menu background is a loop of the film itself or a still from it, with your art over it; the Pop-up draws over the playing film, so it must not cover the picture\'s centre.',
  'Give production-ready specifics: palette as hex, fonts from the list, the layout with pixel positions on the 1920×1080 plane, button sizes, ornament vocabulary, and how the menus feel in motion.',
];

interface Slot { id: string; name: string; brief: Omit<CouncilBrief, 'constraints'> & { extra?: string[] } }
const SLOTS: Slot[] = [
  { id: 'feature', name: 'Feature Presentation', brief: { ask: 'Direct the flagship feature-film disc template: the menus a prestige drama or thriller ships with.', domain: 'independent feature films released by Plajah filmmakers', audience: 'film lovers who bought the disc to keep it', feeling: 'premium, cinematic, quietly confident — the opening of a film, not a website' } },
  { id: 'collector4k', name: '4K Collector', brief: { ask: 'Direct the Ultra HD collector-edition template — the steelbook / limited-edition look for a 4K HDR release.', domain: '4K Ultra HD Blu-ray collector editions', audience: 'collectors who shelve steelbooks and notice every detail', feeling: 'luxurious, precise, HDR-aware — light used like a material', extra: ['This one is UHD-first: think about how highlights and darks behave on an HDR TV.'] } },
  { id: 'boxset', name: 'Series Box Set', brief: { ask: 'Direct the TV-series box-set template: Play All, an Episodes page with per-episode artwork, scenes per episode, and a pop-up episode list.', domain: 'serialised shows and web series', audience: 'binge watchers who come back to the disc night after night', feeling: 'inviting, organised, a place you return to', extra: ['Episodes page holds up to 6 episodes per page with number, title and runtime.'] } },
  { id: 'concert', name: 'Encore — Live Concert', brief: { ask: 'Direct the concert-film template: Play Concert, a Setlist page (each song a chapter), audio choice (stereo / 5.1 / commentary) up front.', domain: 'live concert films and music documentaries', audience: 'fans of the artist reliving the show', feeling: 'electric, stage-lit, the moment before the band walks on' } },
  { id: 'arthouse', name: 'Short & Art-house', brief: { ask: 'Direct the short-film and art-house template: one film, a few extras, programme-notes calm.', domain: 'shorts, experimental and art-house cinema', audience: 'festival-goers and cinephiles', feeling: 'restrained, literate, gallery-quiet — the menu steps aside for the film' } },
  { id: 'screener', name: 'Festival Screener', brief: { ask: 'Direct the festival / awards screener template: the film starts on insertion, a minimal menu, a For Your Consideration card, watermark-safe.', domain: 'festival submissions, awards screeners, press copies', audience: 'programmers, jurors and critics watching dozens of discs', feeling: 'professional, legible, zero friction, dignified' } },
  { id: 'documentary', name: 'Documentary', brief: { ask: 'Direct the documentary template: chapters as subjects, an archive/extras section (interviews, deleted scenes, sources), subtitles prominent.', domain: 'documentary features and docuseries', audience: 'curious viewers, educators, libraries', feeling: 'journalistic, trustworthy, archival texture without nostalgia kitsch' } },
  { id: 'family', name: 'Family & Animation', brief: { ask: 'Direct the family / animation template: big friendly buttons a child can navigate, sing-along and bonus games section, parents can still find Setup.', domain: 'animated features and family films', audience: 'kids aged 4–10 holding the remote, and their parents', feeling: 'joyful, bouncy, warm — never babyish or loud', extra: ['Buttons at least 120px tall; selection must be obvious to a five-year-old.'] } },
  { id: 'genre', name: 'Midnight — Horror & Genre', brief: { ask: 'Direct the horror and genre template: the cult midnight-movie disc — atmospheric, a little dangerous.', domain: 'horror, thriller and cult genre films (Plajah runs a horror channel)', audience: 'genre fans who collect boutique-label discs', feeling: 'dread, candlelight, analogue grain — scary-fun, not gory' } },
];

async function main() {
  const lane = process.env.COUNCIL_LANE === 'claude' ? claudeLane : geminiLane;
  const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model: lane } as any);
  const only = process.argv.slice(2);
  for (const s of SLOTS) {
    if (only.length && !only.includes(s.id)) continue;
    const file = path.join(OUT, `${s.id}.json`);
    if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).status === 'DONE') { console.log(`[council] ${s.id}: already directed, skipping`); continue; }
    const { extra, ...rest } = s.brief;
    const brief: CouncilBrief = { ...rest, surface: `Fabula disc menu template "${s.name}"`, constraints: [...COMMON, ...(extra || [])], references: ['Fabula Disc Authoring (menus become Blu-ray interactive graphics)', 'Plajah Tela vector stack'] };
    const t0 = Date.now();
    try {
      const d = await council.deliberate('disc-templates', brief, { depth: 'FULL' });
      writeFileSync(file, JSON.stringify({ slot: s.id, name: s.name, ...d }, null, 2));
      console.log(`[council] ${s.id}: ${d.status} in ${Math.round((Date.now() - t0) / 1000)}s · ${d.proposals.length} proposals · lead ${d.synthesis?.lead} / counterpoint ${d.synthesis?.counterpoint}${d.error ? ` · ${d.error}` : ''}`);
    } catch (e: any) {
      console.log(`[council] ${s.id}: FAILED ${e?.message || e}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
