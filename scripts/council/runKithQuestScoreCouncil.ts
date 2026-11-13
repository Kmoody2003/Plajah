/**
 * Kith Quest score — Composer & Producer Council (Music Council personas, cloud Gemini lane; never a local model:
 * see the no-local-LLM-batch rule). Kenne 2026-11-12: "run these through composer and producer council … more lush,
 * more orchestrated and beautiful, full realised score, high and classical and cinematic pieces, lush string and
 * orchestral movements".
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/council/runKithQuestScoreCouncil.ts
 *
 * Grounding: every cue as written (data/gameScores/kithQuest.ts), the Chora palette that can actually play it,
 * and measurements of the current masters (docs/kith-party/score-council/measurements.json).
 * Flow: PROPOSE (5 seats in parallel) → DISPUTE (each seat answers the others) → SYNTHESISE (Aria: one build plan).
 * Output: docs/kith-party/score-council/{brief.json, propose-*.json, dispute-*.json, synthesis.json, synthesis.md}
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { QUEST_CUES } from '../../data/gameScores/kithQuest';
import { MUSIC_PERSONAS } from '../../services/melos/council/musicCouncilPersonas';

const OUT = 'docs/kith-party/score-council';
mkdirSync(OUT, { recursive: true });
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^(GEMINI_API_KEY|GOOGLE_AI_API_KEY|COUNCIL_GEMINI_MODEL)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY is not configured.');
const MODEL = process.env.COUNCIL_GEMINI_MODEL || 'gemini-3.8-flash';
const genai = new GoogleGenAI({ apiKey: key });

let calls = 0, inTok = 0, outTok = 0;
// Free-tier key: 5 requests/min, frequent 503s. Calls run one at a time, honour the API's retry delay, step down a
// model on overload, and are resumable (a seat whose JSON is already on disk is not asked again).
const dayOut = new Set<string>();
const MODELS = [MODEL, ...['gemini-3.6-flash'].filter((m) => m !== MODEL)];
async function ask(system: string, user: string, tag: string): Promise<any> {
  const file = path.join(OUT, `${tag}.json`);
  if (existsSync(file)) { console.log(`${tag} (cached)`); return JSON.parse(readFileSync(file, 'utf8')); }
  const id = ++calls;
  let mi = 0;
  for (let attempt = 0; attempt < 16; attempt++) {
    let model = MODELS[mi % MODELS.length]; if (dayOut.has(model)) { const alt = MODELS.find((m) => !dayOut.has(m)); if (!alt) throw new Error('daily free-tier quota reached on every model; rerun tomorrow (resumes).'); model = alt; }
    try {
      const r = await genai.models.generateContent({
        model, contents: [{ role: 'user', parts: [{ text: user }] }],
        config: { systemInstruction: system, maxOutputTokens: 24000, temperature: 0.75, responseMimeType: 'application/json', httpOptions: { timeout: 900000 } },
      });
      inTok += r.usageMetadata?.promptTokenCount ?? 0; outTok += r.usageMetadata?.candidatesTokenCount ?? 0;
      const text = r.text || '';
      writeFileSync(path.join(OUT, `${tag}.raw.txt`), text);
      const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      json._model = model;
      writeFileSync(file, JSON.stringify(json, null, 1));
      console.log(`call ${id} ${tag} ok (${model})`);
      await new Promise((r) => setTimeout(r, 13000)); // stay under 5/min
      return json;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retry = /retry in ([\d.]+)s/.exec(msg);
      const wait = retry ? Number(retry[1]) * 1000 + 2000 : /503|UNAVAILABLE|high demand/.test(msg) ? 20000 + attempt * 10000 : 15000;
      if (/503|UNAVAILABLE|high demand/.test(msg)) mi++;
      if (/per day|PerDay/.test(msg)) { if (mi + 1 < MODELS.length * 2 && !dayOut.has(model)) { dayOut.add(model); mi++; console.log(`${model}: daily quota used, trying the next model`); continue; } throw new Error(`daily free-tier quota reached at ${tag}; rerun tomorrow (resumes).`); }
      console.log(`call ${id} ${tag} attempt ${attempt + 1} (${model}) failed: ${msg.slice(0, 120)} · waiting ${Math.round(wait / 1000)}s`);
      if (attempt === 15) throw e;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/* ── grounding ─────────────────────────────────────────────────────────────────────────── */
const PALETTE = `Kenne: the cues are written and composed IN CHORA using the FULL suite of Chora instruments, including SOMA and the new plucked string instrument TONOS. Every part is a Chora instrument track; use the whole suite where it serves the music.
LYRA (physical-model orchestra): lyra-silk-strings (long-bow violin section), lyra-string-quartet, lyra-concert-violin, lyra-viola, lyra-cello, lyra-double-bass-arco, lyra-pizzicato, lyra-sul-tasto (airy bowed), lyra-harp, lyra-concert-flute, lyra-alto-flute, lyra-piccolo, lyra-oboe, lyra-english-horn, lyra-clarinet, lyra-bass-clarinet, lyra-bassoon, lyra-french-horn, lyra-trumpet-open, lyra-trumpet-cup, lyra-flugelhorn, lyra-trombone, lyra-bass-trombone, lyra-tuba, lyra-felt (felt piano), lyra-concert-grand, lyra-tin-whistle, lyra-nylon, lyra-mandolin.
TONOS (NEW: 52 physically modelled world string instruments, real string tension/body physics, sympathetic strings): plucked/hammered/bowed — tonos-kantele, tonos-kantele-bright, tonos-koto, tonos-guzheng, tonos-guzheng-glide, tonos-gayageum, tonos-gayageum-nonghyeon, tonos-pipa, tonos-pipa-lunzhi (tremolo), tonos-kora, tonos-kora-sesse, tonos-kamale-ngoni, tonos-valiha, tonos-lute, tonos-oud, tonos-oud-taqsim, tonos-qanun, tonos-santur, tonos-yangqin, tonos-cimbalom, tonos-cimbalom-dampers, tonos-bouzouki-tremolo, tonos-balalaika-tremolo, tonos-portuguese-guitar, tonos-baglama, tonos-sitar, tonos-tanpura-drone, tonos-hardanger (fiddle with sympathetics), tonos-nyckelharpa, tonos-hurdy-gurdy, tonos-hurdy-gurdy-coups, tonos-erhu-singing, tonos-morin-khuur, tonos-kamancheh, tonos-sarangi, tonos-esraj. Gut/silk/nylon-strung voices (koto, kora, lute, gayageum, oud, pipa, valiha) are the safest for warmth; steel hammered dulcimers (cimbalom, santur, yangqin) and bright kantele must stay sparing and soft so nothing reads as a metallic bell.
VELA suite (sustained voices): VELA choir, vox-humana, tremolo-strings, hollow, aurora/aerial/cathedral (sustained pads), vespers/rise (pads); CANTUS voices: cantus-vault (cathedral choir), cantus-plainsong, cantus-byzantine; ISON drones: ison-bourdon, ison-shruti, ison-cavern; PNEUMA breath winds: pneuma-ney, pneuma-shakuhachi, pneuma-hall.
SOMA (physically modelled percussion, 36 drums): timpani-29-dresden / timpani-32-profondo / timpani-23-piccolo / timpani-pedal-gliss / timpani-staccato-wood (tuned per bar), concert-gran-cassa, orchestral-field-snare, concert-tom-mahogany, gong-drum-boobam, nagado-daiko-odaiko, shime-daiko-tense, bodhran-kerry-tipper, bendir-atlas-gut, tar-nubian-deep, daf-persian-rings, ocean-frame-brush, shamanic-cedar-beater, kanjira-lizard-frame, darbuka, tabla, udu-igbo-clay, djembe, talking drum.
Generative: Chora ARP device (order/rate/octaves/euclidean accents, scale-locked), Humanize, modulators (LFO to pan/volume/mod-wheel swell), performDoc (cinematic rubato feel), volume automation lanes per track (hairpins, swells, terraced dynamics).
Mixing: per-track gain/pan/volume automation, 2 send buses: FX1 Spaces hall (Grand Concert Hall / Stone Chapel / Opera House), FX2 dotted-8th delay. No per-track EQ/filters in this pipeline: fix mud by voicing, register and orchestration.
Tracks are unlimited: divisi string sections are stacked LYRA tracks (Violins I / Violins II / Violas / Celli / Basses), each its own voice-led line (the engine voice-leads chords into these four upper lines with suspensions automatically), pan and hall send.
FORBIDDEN by the owner: any bell-type voice (celesta, glockenspiel, tubular bells, struck glass, VELA struck family himalayan-bronze/vitreous/ferrous/deep-wash, glass choir) — Kenne heard a metallic sheen from them.`;

const CONSTRAINTS = [
  'Original music only: no quoting or imitating any existing game or film theme. Name composers only as schools of craft.',
  'Keep the LANTERN MOTIF (sol·do–re–mi, C5 . F5 G5 A5 in F) as the game-wide leitmotif and keep its transformations (minor for the Warden/danger, phrygian for fear).',
  'The three calm lullabies (calm-glowmoss, calm-cascade, calm-keep) are melodies Kenne already loves: keep their tunes note for note; everything around them (harmony colour, counterpoint, orchestration, form) may grow.',
  'Loops must stay seamless game loops (same tempo throughout; body length any whole number of bars; a loop can be longer to hold real movements: up to ~3 minutes).',
  'clear and gameover are one-shot jingles (under ~12 s).',
  'Moods are switched live by the game (calm ↔ energy per stage, danger, fear at 1 HP, battle for the boss): matching cues share key and tempo relationships so crossfades land.',
  'No bell-type voices (see palette).',
  'Every recommendation must be buildable with the palette above: name presets, registers (note names), bar ranges, dynamics.',
  'Use the full Chora suite: every cue should feature TONOS world strings and SOMA percussion where they serve the music (e.g. kora/koto/lute ostinatos and colours beside the orchestra), not only LYRA.',
];

const cueSummaries = QUEST_CUES.map((c) => ({
  id: c.id, title: c.title, blurb: c.blurb, bpm: c.bpm, meter: `${c.beats}/4`, bars: c.chords.length, loop: c.loop, key: `${['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'][c.tonicPc]} ${c.scale}`,
  sections: c.sections, chords: c.chords.join(' | '), melody: c.melody, counter: c.counter, bass: c.bass,
  parts: c.parts.map((p) => ({ label: p.label, preset: p.preset, plays: p.src, oct: p.oct, bars: p.bars, line: p.line?.slice(0, 200) })),
}));
const measurements = existsSync(path.join(OUT, 'measurements.json')) ? JSON.parse(readFileSync(path.join(OUT, 'measurements.json'), 'utf8')) : {};

const ASK = `Kenne (the owner) on the Kith Quest score, verbatim: "we need to run these through composer and producer council, i want them to be more lush more orchestrated and beautiful, full realised score, high and classical and cinematic pieces, lush string and orchestral movements". Earlier goals still stand: "great but catchy … create new classic video game themes", lullabies "for adults", enchanting, whimsical fantasy.
Kith Quest is an original 2D fantasy platformer: a small lantern-bearer crosses Glowmoss Hollow (mossy glowing forest), Cascade Heights (waterfalls, sky) and Lanternkeep (an old moonlit keep), ending in the Hollow Warden boss.
Current state: 12 cues written as single-line parts with block-chord pads (each chord voiced as one sustained stack), a harp/ARP figure, and a few solo winds. Measurements of the current masters (band energy shares, stereo, dynamics) are attached; they show what a listener hears: mostly flat 1–5 dB dynamic range, lots of 250–800 Hz, little string movement.`;

const brief = { ask: ASK, constraints: CONSTRAINTS, palette: PALETTE, measurements, cues: cueSummaries };
writeFileSync(path.join(OUT, 'brief.json'), JSON.stringify(brief, null, 1));
const briefText = `${ASK}\n\nCONSTRAINTS:\n- ${CONSTRAINTS.join('\n- ')}\n\nPALETTE:\n${PALETTE}\n\nMEASUREMENTS of the current masters:\n${JSON.stringify(measurements)}\n\nTHE SCORE AS WRITTEN (notation: NOTE:beats, r = rest, | = bar, A3+E4 = chord; chords one per bar):\n${JSON.stringify(cueSummaries)}`;

/* ── council ───────────────────────────────────────────────────────────────────────────── */
const SEATS = ['COMPOSER', 'MUSICIAN', 'PRODUCER', 'MIX', 'MASTER'] as const;
const seatSystem = (id: typeof SEATS[number]) => {
  const p = MUSIC_PERSONAS[id];
  const extra: Record<string, string> = {
    COMPOSER: 'You own form, harmony, leitmotif and the new material: where each cue needs a second theme, a bridge, a string movement, reharmonisation, modulation, a climax.',
    MUSICIAN: 'You are the orchestrator: divisi string writing (Violins I/II, Violas, Celli, Basses as separate voice-led lines), woodwind and brass doubling, registers, bowing (legato swells, tremolo, spiccato, pizz), and which Chora preset plays each line.',
    PRODUCER: 'You own the listener and the game: hooks, catchiness, emotional arc across the 12 cues, how each loop evolves so it never wears out over minutes of play, crossfade logic between moods.',
    MIX: 'You own depth and width: front-to-back staging of an orchestra (hall sends per section, pan seating), fixing the measured mud and the battle cue\'s negative stereo correlation, keeping the low end clean.',
    MASTER: 'You own the finished files: dynamic range a cinematic score should keep, loudness per mood, limiting, the game-loop seam, encode.',
  };
  return `You are ${p.name}, one seat on the Plajah Music Council (composer & producer council). Lens: ${p.lens} Protects: ${p.protects} Pushes back on: ${p.challenges} Voice: ${p.voice}
${extra[id]}
Be concrete and buildable: name cue ids, bar ranges, note names / registers, Chora presets, dynamics, dB, Hz. No vague praise. Answer ONLY with JSON.`;
};

const proposeUser = `${briefText}

Propose your seat's plan to make this a lush, fully orchestrated, classical/cinematic score with real string and orchestral movements.
Return JSON:
{"headline":"one line","diagnosis":["what is weak now, specific"],
 "global":["moves that apply to the whole score (e.g. a standard string section layout)"],
 "cues":{"<cueId>":{"verdict":"one line","moves":["specific move with bars/notes/presets"]}},
 "mustKeep":["what is already good and must survive"]}
Cover all 12 cue ids.`;

console.log(`Kith Quest score council · ${MODEL}`);
const proposals: Record<string, any> = {};
for (const id of SEATS) proposals[id] = await ask(seatSystem(id), proposeUser, `propose-${id}`);

const disputes: Record<string, any> = {};
for (const id of SEATS) {
  const others = SEATS.filter((o) => o !== id).map((o) => `${MUSIC_PERSONAS[o].name} (${o}):\n${JSON.stringify(proposals[o])}`).join('\n\n');
  disputes[id] = await ask(seatSystem(id), `${briefText}\n\nYour own proposal:\n${JSON.stringify(proposals[id])}\n\nThe other seats proposed:\n${others}\n\nDispute: where are they wrong, where do they collide with your lens, what would you trade? Return JSON {"challenges":[{"to":"SEAT","point":"...","instead":"..."}],"concede":["..."],"nonNegotiable":["..."]}`, `dispute-${id}`);
}

const ARIA = `You are Aria, the Plajah Music Council's chair. You do not average: you decide, citing which seat won each tension and why. Your output is the build plan an engineer will implement in code, cue by cue, with the Chora palette. Answer ONLY with JSON.`;
const synthUser = `${briefText}

PROPOSALS:\n${SEATS.map((s) => `${s}: ${JSON.stringify(proposals[s])}`).join('\n\n')}

DISPUTES:\n${SEATS.map((s) => `${s}: ${JSON.stringify(disputes[s])}`).join('\n\n')}

Synthesise ONE decisive build plan. Return JSON:
{"summary":"Aria's synthesis in 3-5 sentences",
 "tensions":[{"between":"SEAT vs SEAT","decision":"...","why":"..."}],
 "orchestra":{"stringSection":"standard divisi layout: each section, preset, register, pan, hall send","winds":"...","brass":"...","percussion":"...","voices":"...","staging":"front-to-back + width plan"},
 "cues":{"<cueId>":{"form":"sections with bar counts (new total bars)","harmony":"reharmonisation/modulation decisions","newMaterial":"new themes/bridges/movements to write, described precisely","orchestration":[{"section":"bars","lines":["instrument (preset): role, register, dynamics"]}],"climax":"where and how","mix":"specific"}},
 "mastering":{"perMoodRmsOrLufs":"...","dynamicRange":"...","limiter":"...","encode":"..."},
 "priorities":["ranked: what to do first"]}
Cover all 12 cue ids.`;
const synthesis = await ask(ARIA, synthUser, 'synthesis');

const md = [`# Kith Quest score council — ${new Date().toISOString().slice(0, 10)}`, '', `Model: ${MODEL} · calls ${calls} · tokens in ${inTok} / out ${outTok}`, '', '## Summary', synthesis.summary, '',
  '## Tensions', ...(synthesis.tensions || []).map((t: any) => `- **${t.between}**: ${t.decision} — ${t.why}`), '',
  '## Orchestra', ...Object.entries(synthesis.orchestra || {}).map(([k, v]) => `- **${k}**: ${v}`), '',
  '## Cues', ...Object.entries(synthesis.cues || {}).flatMap(([id, c]: [string, any]) => [`### ${id}`, `- Form: ${c.form}`, `- Harmony: ${c.harmony}`, `- New material: ${c.newMaterial}`,
    ...(c.orchestration || []).map((o: any) => `- ${o.section}: ${(o.lines || []).join('; ')}`), `- Climax: ${c.climax}`, `- Mix: ${c.mix}`, '']),
  '## Mastering', ...Object.entries(synthesis.mastering || {}).map(([k, v]) => `- **${k}**: ${v}`), '',
  '## Priorities', ...(synthesis.priorities || []).map((p: string, i: number) => `${i + 1}. ${p}`)].join('\n');
writeFileSync(path.join(OUT, 'synthesis.md'), md);
console.log(`done · ${calls} calls · in ${inTok} out ${outTok} tokens → ${OUT}/synthesis.md`);
