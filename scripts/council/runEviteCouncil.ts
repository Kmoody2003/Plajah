// runEviteCouncil — convene the real Council of Art Directors (services/council) on the evite collections.
//
// Uses the council's own engine (createCouncil: PROPOSE -> DISPUTE -> SYNTHESISE -> REFLECT), the directors' real
// profiles in Firestore, and persists sessions + reflections exactly as the app does. Two lanes are swapped for
// what works on this machine:
//   model  Gemini Pro, because the local ANTHROPIC_API_KEY is rejected (401). Set COUNCIL_LANE=claude to use Claude.
//   store  auth from `gcloud auth print-access-token` (no service-account JSON locally).
//
// Run: npx tsx scripts/council/runEviteCouncil.ts [collectionKey ...]
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
  'Surface: Plajah Evites, an invitation opened on a phone browser by guests who never sign up; also shared as a link preview and QR.',
  'Build method (fixed): each design is a layered Tela document: a generated art plate, separate transparent foreground cut-outs that drift and react to phone tilt, a WebGL effects layer (foil shimmer, light leaks, bokeh, particles, candle flicker) revealed through masks, and live text in Tela. Names, dates and venues are never baked into the art.',
  'Bar: consumer-facing, jaw-dropping, high-end professional. Must stay legible at 390px wide, honour reduced motion, and load fast on mobile data.',
  'No copyrighted characters; kids art is original or Plajah-owned.',
  'Production is GENERATIVE ONLY (Magnific image models, shaders, procedural code, renders of Plajah-owned 3D assets). One Magnific draft grid returns 8 to 16 distinct plates for a flat cost, so a whole collection can be explored in one or two prompts: direct those prompts.',
];

const BRIEFS: Record<string, CouncilBrief> = {
  kids_boy: {
    ask: 'Set the art direction for 12 boys\' birthday evites (dinosaurs, space, trucks, soccer, pirates, heroes, robots, sharks, safari, knights, race cars, ninjas). Each one has a 15-second tap game or scratch-and-reveal before the details. Say what makes a parent forward this instead of a text.',
    audience: 'Parents of 3 to 10 year olds sending to other parents; the kids play the game on a parent\'s phone.',
    feeling: 'Wonder and momentum, a toy brought to life, never cheap or loud for its own sake.',
    constraints: SHARED,
    references: ['Exploration grid A: collectible-toy 3D dinosaurs in a golden-hour jungle with a glowing volcano and balloons; warm, film-grade; empty dirt foreground for type.', 'Exploration grid B: painterly nebula space scenes, a small rocket past a ringed planet and a smiling moon; deep blue starfield bottom third for type.'],
  },
  kids_girl: {
    ask: 'Set the art direction for 12 girls\' birthday evites (unicorns, princess castles, mermaids, fairy gardens, butterflies, ballet, cupcakes, rainbows, kittens, art studio, carousel, pop star), several with scratch-and-reveal. Push past the pink-and-glitter default without losing what kids actually love.',
    audience: 'Parents of 3 to 10 year olds; the kids are the first viewers.',
    feeling: 'Enchantment with real craft; delight that feels hand-made.',
    constraints: SHARED,
    references: ['Exploration grid A: pastel 3D baby unicorns on cotton-candy clouds with balloons, a crescent-moon nap, a rainbow; very sweet, very pink.', 'Exploration grid B: luminous underwater kingdoms, coral, jellyfish, an open shell with pearls, god-rays through turquoise water; no characters.'],
  },
  kids_kaiju: {
    ask: 'Set the art direction for 12 kids\' evites starring Plajah\'s own kaiju mascots, Chora (music note on the belly, purple goggle markings) and Reello (camera, orange goggle markings). Decide the 12 scenarios, how the mascots perform inside the invite (they can be animated 2D puppets or the rigged 3D models), and how a guest\'s tap or game makes them react.',
    audience: 'Kids and parents; also brand-building for Plajah itself.',
    feeling: 'Our characters, our world: mischievous, warm, unmistakably Plajah.',
    constraints: [...SHARED, 'The mascots must stay on-model (wide mochi head, white face, chevron cap with navy gem, goggle patches, angular magenta/orange ruff, cat-ear horns).'],
    references: ['Exploration grid A: Chora and Reello at a birthday party, one holding a frosted cake with candles, the other with a party horn, balloons and string lights, confetti; on-model, polished 3D.', 'Exploration grid B: the two dancing on a light-up disco floor under a mirror ball; on-model, energetic.'],
  },
  adult: {
    ask: 'Set the art direction for 24 adult party evites: cocktail nights, wine, rooftops, 30/40/50 milestones, casino, disco, tiki, BBQ, masquerade, game night, karaoke, brunch, bonfire, speakeasy, sunset, black tie, retirement, bachelorette, 80s, 90s, whiskey, dinner party.',
    audience: 'Adults 25 to 65 inviting friends; the invite is also their taste on display.',
    feeling: 'Editorial and grown-up; a magazine spread that moves.',
    constraints: SHARED,
    references: ['Exploration grid A: dark plum and gold still lifes, champagne coupes mid-toast, mirrored disco balls, velvet and brass; deep negative space below.', 'Exploration grid B: overhead candlelit long tables with linen, taper candles, citrus and herbs, hard window-light shadows; food-magazine.'],
  },
  anniversary: {
    ask: 'Set the art direction for 12 anniversary evites (rings, roses, toast, moonlit vows, silver and golden years, tree rings, constellations, lace). Decide how time itself can be shown in motion.',
    audience: 'Couples and their adult children planning a celebration; guests across generations, including older eyes.',
    feeling: 'Intimate, enduring, quietly moving.',
    constraints: SHARED,
    references: ['Exploration grid: romantic fine-art still lifes, two gold rings on blush silk beside garden roses and glowing candles; soft painterly light; calm silk area for type.'],
  },
  general: {
    ask: 'Set the art direction for 12 gathering evites (balloons, potluck, string lights, confetti, open house, fireworks, bunting, picnic, game day, sparkler send-off, winter gathering, summer social).',
    audience: 'Anyone hosting anything; neighbours, families, friend groups.',
    feeling: 'Warm and welcoming; you can almost hear the evening.',
    constraints: SHARED,
    references: ['Exploration grid: backyards at blue hour strung with warm string lights, long tables with mismatched chairs, picnic blankets; real and inviting.'],
  },
  wedding: {
    ask: 'Set the art direction for 36 high-end wedding evites as a coherent luxury line, not 36 one-offs. Decide the families (we explored watercolor botanicals, painted Italian villas, art deco emerald and gold) and what the motion layer does that paper never could, without becoming a gimmick.',
    audience: 'Couples choosing a stationery suite; guests from 20 to 90.',
    feeling: 'The weight of letterpress and the light of a candlelit room, in a phone.',
    constraints: [...SHARED, 'Must sit beside the best paper stationery studios and win.'],
    references: ['Exploration grid A: fine-art watercolor garden roses, peonies, olive and eucalyptus forming arches on deckled cotton paper with gold-foil flecks; flat-lay on silk and brass trays.', 'Exploration grid B: gouache Italian villa terraces, arched colonnades, cypress, lemon trees in terracotta, bougainvillea, golden-hour hills.', 'Exploration grid C: deep emerald marble with art deco gold linework frames, crescent moons and fine constellations; symmetrical and grand.'],
  },
  kids_everyone: { ask: 'Set the art direction for 12 kids’ birthday evites for everyone (zoo, circus, pajama party, bounce house, mad science, farm, camping, magic show, slime lab, bubbles, pool splash, superstar), each with a quick game or scratch reveal.', audience: 'Parents of 3 to 10 year olds; the kids play on the phone.', feeling: 'Pure joy without gender coding.', constraints: SHARED },
  gaming: { ask: 'Set the art direction for 12 gaming party evites: pixel arcade, retro 8-bit, neon esports, LAN party, a blocky voxel world builder, blocky adventure, obstacle course, laser tag, VR arcade, racing game, controller, game show. The blocky voxel aesthetic must be generic and never imitate a specific game’s trade dress.', audience: 'Kids 6 to 14, teens, and adult gamers.', feeling: 'Player one has entered the party.', constraints: [...SHARED, 'No resemblance to Minecraft, Roblox, Fortnite or any game’s characters, logos, UI, or signature blocks.'] },
  sports: { ask: 'Set the art direction for 16 sports evites by sport type (basketball, football, soccer, baseball, hockey, motor racing, tennis, volleyball, golf, swimming, gymnastics, boxing, skate, cheer, track, martial arts) for birthdays, team parties and watch parties.', audience: 'Kids teams, coaches, adult fans.', feeling: 'Game-day electricity.', constraints: [...SHARED, 'No leagues, teams, logos, jerseys with numbers, or real athletes.'], references: ['Exploration grid: 16 cinematic arena still-lifes, one per sport, dramatic stadium lighting, calm lower third. Strong and consistent.'] },
  patriotic: { ask: 'Set the art direction for 6 patriotic evites (Independence Day, Memorial Day, Labor Day, Flag Day, stars-and-stripes block party, fireworks) that hosts in other countries can recolor for their own national day.', audience: 'Families, neighbourhoods, civic groups.', feeling: 'Pride and gathering, never jingoistic.', constraints: [...SHARED, 'Memorial Day is remembrance, not a party: design it with dignity.'] },
  military: { ask: 'Set the art direction for 8 military evites: welcome home, deployment send-off, promotion ceremony, military retirement, Veterans Day honor, homecoming, change of command, military ball.', audience: 'Service members, spouses, families, units.', feeling: 'Honor, family and relief.', constraints: [...SHARED, 'No official insignia, branch seals, rank devices, unit patches or medals (protected marks); use generic, respectful symbolism.'] },
  life: { ask: 'Set the art direction for 12 life-moment evites: baby shower, gender reveal, bridal shower, engagement, graduation, sweet 16, quinceañera, retirement, farewell, celebration of life, reunion, housewarming.', audience: 'Every generation; the celebration of life must hold grief gently.', feeling: 'The moments people remember.', constraints: [...SHARED, 'Quinceañera is culturally specific: collaboration-gated, specific and respectful.'] },
  holidays: { ask: 'Set the art direction for 16 holiday evites: Christmas, Hanukkah, Diwali, Eid, Lunar New Year, Kwanzaa, Halloween, Friendsgiving, New Year’s Eve, Galentine’s, St. Patrick’s, Easter, Juneteenth, Día de los Muertos, summer solstice, office holiday party.', audience: 'Families, friends, workplaces, faith and cultural communities.', feeling: 'Each holiday in its own true light, not one template recolored.', constraints: [...SHARED, 'Faith and culture-specific holidays are collaboration-gated: specific, attributable, never costume.'] },
  faith: { ask: 'Set the art direction for 8 faith-milestone evites: baptism, christening, first communion, confirmation, bar mitzvah, bat mitzvah, church homecoming, vow renewal.', audience: 'Families and congregations (ties to Plajah Church Elevate).', feeling: 'Reverent, luminous, joyful.', constraints: [...SHARED, 'Sacred symbols are used correctly and respectfully; collaboration-gated.'] },
  design_history: { ask: 'Set the rules for turning Plajah’s ~45 Tela design-history eras (Art Deco, Bauhaus, Constructivism, Memphis, Ukiyo-e principles, Harlem Renaissance editorial, Afrofuturism, Vaporwave and more) into evite versions: built procedurally in code from each era’s palette, type and ornament, so they cost no image credits.', audience: 'Design-literate hosts and anyone who wants a party with a point of view.', feeling: 'A museum-grade style lesson you can send.', constraints: SHARED },
};

async function main() {
  const lane = process.env.COUNCIL_LANE === 'claude' ? claudeLane : gemini;
  const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: headers, model: lane } as any);
  const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BRIEFS);
  const out = path.join('docs', 'evites', 'council'); mkdirSync(out, { recursive: true });
  const results: Array<readonly [string, any]> = [];
  const queue = [...keys];
  const worker = async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      const brief = { ...BRIEFS[key], surface: 'Plajah Evites', domain: 'invitation design' };
      const t0 = Date.now();
      const d = await council.deliberate(OWNER_UID, brief, { depth: 'FULL' });
      console.log(`[${key}] ${d.status} in ${Math.round((Date.now() - t0) / 1000)}s · proposals ${d.proposals.length} · disputes ${d.disputes.length}${d.error ? ' · ' + d.error : ''}`);
      writeFileSync(path.join(out, `${key}.json`), JSON.stringify(d, null, 2));
      results.push([key, d] as const);
    }
  };
  await Promise.all(Array.from({ length: Number(process.env.COUNCIL_CONCURRENCY || 3) }, worker));
  // Reflections run after each answer; give them time to land in the directors' profiles before exiting.
  await new Promise(r => setTimeout(r, 120000));
  console.log('done', results.map(([k, d]) => `${k}:${d.status}`).join(' '));
}
main().catch(e => { console.error(e); process.exit(1); });
