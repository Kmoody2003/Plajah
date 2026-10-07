// looksCouncil — the Art Council's LOOK FORMAT, end to end.
//
// A "look" (shaderLooks.ts) is the council's deliverable for a moving, audio-reactive surface. This file is
// how the six directors produce one:
//   propose    each director drafts a ShaderLook in their own lens, as JSON, grounded in the library's real
//              component catalog (shaderCatalog.generated.ts). Model output is run through validateLook; on
//              rejection the model gets the exact issues and ONE repair turn; if that fails the director's
//              deterministic house look (recoloured to the brief) stands in — so the room always has six voices.
//   dispute    the strongest standing tension between two directors who are actually in the room is named
//              (their own words, from councilDirectors).
//   synthesise lead + counterpoint, NOT an average: the lead's look stays intact and the counterpoint's
//              outermost filter wraps it (or its generator stacks beneath). The editor pass is the validator's
//              GPU budget: if the merge does not fit, the lead stands alone and the cut is said out loud.
// Aria is the only voice the user hears; nothing here talks to the user directly.
//
// The model is injectable (`deps.model`) exactly like services/council/councilRoutes, so the whole
// orchestration is proven in tests with a scripted model and no keys.

import { COUNCIL_DIRECTORS } from '../council/councilDirectors';
import { COUNCIL_DIRECTOR_IDS, type CouncilDirectorId } from '../council/councilTypes';
import { SHADER_CATALOG } from './shaderCatalog.generated';
import { isCouncilComponent, councilCatalog, validateLook, LOOK_LIMITS, COVER_TOKEN } from './shaderLookSchema';
import type { ShaderLook, ShaderNode } from './shaderLooks';
import { HOUSE_LOOKS } from './looksLibrary';

export interface LookBrief {
  track?: { title?: string; artist?: string; genre?: string; bpm?: number };
  /** free text — "late-night, wet streets, restrained" */
  feeling?: string;
  /** 0..1 intended energy; steers who leads */
  energy?: number;
  /** dominant hex colours of the cover, if known — looks are recoloured toward these */
  palette?: string[];
  /** whether the cover can be sampled; without it, looks that need '$cover' are not proposed */
  hasCover: boolean;
}

export interface DirectorLook {
  directorId: CouncilDirectorId;
  look: ShaderLook;
  rationale: string;
  source: 'ai' | 'local';
  /** validator notes on the model's draft (empty for local) — shown, never hidden */
  issues: string[];
}

export interface LookDeliberation {
  brief: LookBrief;
  proposals: DirectorLook[];
  tension: { a: CouncilDirectorId; b: CouncilDirectorId; line: string } | null;
  synthesis: { look: ShaderLook; lead: CouncilDirectorId; counterpoint: CouncilDirectorId | null; note: string };
}

export type LookModel = (system: string, user: string) => Promise<string | null>;
export interface LooksCouncilDeps { model?: LookModel }

// ── Each director's house palette: the components they reach for, and which house looks are theirs ──
const SHORTLIST: Record<CouncilDirectorId, { components: string[]; houseLooks: string[]; stance: string }> = {
  CLASSICAL:       { components: ['Marble', 'Paper', 'Watercolor', 'Engraving', 'Stone', 'Vignette', 'Ripples', 'Blur'], houseLooks: ['marble-pool', 'ripple-pool', 'cover-watercolor'], stance: 'proportion, restraint, one idea held with confidence; motion that breathes rather than flashes' },
  REBEL:           { components: ['Glitch', 'VHS', 'Halftone', 'Dither', 'Scratches', 'FilmGrain', 'Plasma', 'ChromaticAberration'], houseLooks: ['signal-glitch', 'cover-halftone', 'cover-vhs'], stance: 'the hand left visible — misregistration, damage, pressure; it should look like it was made, not rendered' },
  FUTURIST:        { components: ['Voronoi', 'Waveform', 'FlutedGlass', 'Prism', 'Beam', 'Kaleidoscope', 'Grid', 'MeshGradient'], houseLooks: ['cell-lattice', 'stage-bars', 'cover-fluted'], stance: 'systems that reconfigure; light as material; precision with a pulse' },
  WORLD_ECLECTIC:  { components: ['Truchet', 'Weave', 'SunBurst', 'Stripes', 'Pixelate', 'Chevron', 'HexGrid', 'BrickPattern'], houseLooks: ['sun-gong', 'woven-signal', 'cover-mosaic'], stance: 'pattern as inheritance — woven, tiled, repeated, with a living centre; never decoration without a source' },
  BAROQUE:         { components: ['Aurora', 'FlowingGradient', 'Godrays', 'Swirl', 'Kaleidoscope', 'LightLeak', 'MeshGradient', 'Marble'], houseLooks: ['aurora-bloom', 'god-rays', 'cover-kaleido'], stance: 'drama and depth — light that arrives, layers that reveal, a reveal worth waiting for' },
  RADICAL_MINIMAL: { components: ['Halftone', 'Dither', 'DotGrid', 'Grid', 'Posterize', 'Duotone', 'SolidColor', 'Stripes'], houseLooks: ['dot-pulse', 'cover-dither'], stance: 'remove until it breaks, then put one thing back; two colours and a rule' },
};

// ── Catalog digest: what the model is shown (compact, with the library's own ranges) ──
export function describeComponent(name: string): string {
  const e = SHADER_CATALOG[name];
  if (!e) return name;
  const nums: string[] = [], cols: string[] = [], sels: string[] = [];
  for (const [k, p] of Object.entries(e.p)) {
    if (p.k === 'n' && p.min !== undefined && p.max !== undefined) nums.push(`${k} ${p.min}..${p.max}`);
    else if (p.k === 'c') cols.push(k);
    else if (p.k === 's' && p.o) sels.push(`${k}[${p.o.slice(0, 5).join('|')}]`);
  }
  return `${name} (${e.rc ? 'effect: needs children' : 'generator'}) — ${e.d}. numbers: ${nums.slice(0, 7).join(', ') || 'none'}${cols.length ? `. colours: ${cols.join(', ')}` : ''}${sels.length ? `. selects: ${sels.slice(0, 3).join(', ')}` : ''}`;
}

export function catalogDigest(directorId?: CouncilDirectorId): string {
  const all = councilCatalog().map(([n, e]) => `${n}${e.rc ? '*' : ''}`).join(' ');
  const detail = directorId ? SHORTLIST[directorId].components.filter(isCouncilComponent).map(describeComponent).join('\n') : '';
  return `ALL COMPONENTS (* = effect that filters its children; others paint on their own):\n${all}${detail ? `\n\nYOUR USUAL TOOLS, WITH EXACT RANGES:\n${detail}` : ''}`;
}

export function lookFormatSpec(hasCover: boolean): string {
  return [
    'Answer ONLY as JSON: {"look":{"name":"...","root":[NODE,...]},"rationale":"one or two sentences in your own voice"}',
    'NODE = {"type":"ComponentName","props":{...},"drive":[{"prop":"name","from":"intensity|mid|beat|kick|snare|density","min":n,"max":n}],"children":[NODE,...]}',
    `Rules: use ONLY components listed below; props must exist and stay inside the stated ranges; colours are #hex only. An effect (*) must have children; a generator must not. At most ${LOOK_LIMITS.maxNodes} nodes, ${LOOK_LIMITS.maxDepth} deep. The look must contain at least one generator.`,
    `"drive" binds a numeric prop to live music (kick/snare/beat = transients, intensity = bass level, mid = body, density = how busy the drums are). Give 2-4 drives total; drive things that should MOVE with the music, never legibility.`,
    hasCover
      ? `You may use the playing track's cover art: {"type":"ImageTexture","props":{"url":"${COVER_TOKEN}","objectFit":"cover"}} as a generator inside an effect. No other image or URL is allowed.`
      : 'There is no cover art for this track: do NOT use ImageTexture.',
    'No camera, video, text or network components exist for you.',
  ].join('\n');
}

function directorSystem(id: CouncilDirectorId): string {
  const d = COUNCIL_DIRECTORS[id];
  return `You are ${d.name}, ${d.epithet}, on a six-person Art Council. ${d.conviction}\nYou protect: ${d.protects}\nYou push back on: ${d.challenges}\nVoice: ${d.voice}\nIn a moving look your instinct is: ${SHORTLIST[id].stance}.\nYou are proposing ONE look for an audio-reactive visual. You are not averaging with the others — make your own.`;
}

function briefText(b: LookBrief): string {
  const t = b.track ?? {};
  return [
    t.title ? `Track: "${t.title}"${t.artist ? ` by ${t.artist}` : ''}${t.genre ? ` (${t.genre})` : ''}${t.bpm ? `, ${Math.round(t.bpm)} BPM` : ''}` : 'Track: unknown',
    b.feeling ? `Feeling asked for: ${b.feeling}` : '',
    b.energy != null ? `Energy: ${Math.round(b.energy * 100)}%` : '',
    b.palette?.length ? `Cover palette: ${b.palette.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

// ── JSON extraction (models fence, prefix, trail) ──
export function parseLookJson(s: string): unknown {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1);
  return JSON.parse(body);
}

// ── Deterministic path: the director's own house look, recoloured toward the brief ──
const lum = (hex: string) => {
  const h = hex.replace('#', ''); const f = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(f.slice(0, 2), 16) / 255, g = parseInt(f.slice(2, 4), 16) / 255, b = parseInt(f.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function recolor(nodes: ShaderNode[], palette: string[], i = { n: 0 }): ShaderNode[] {
  return nodes.map(n => {
    const props = n.props ? { ...n.props } : undefined;
    if (props) for (const [k, v] of Object.entries(props)) {
      // keep the darks (backgrounds, inks) — they carry the director's contrast; retint the lights.
      if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) && lum(v) > 0.12) props[k] = palette[i.n++ % palette.length];
    }
    return { ...n, ...(props ? { props } : {}), ...(n.children ? { children: recolor(n.children, palette, i) } : {}) };
  });
}

export function localLook(id: CouncilDirectorId, brief: LookBrief): ShaderLook {
  const pool = SHORTLIST[id].houseLooks
    .map(h => HOUSE_LOOKS.find(l => l.id === h)).filter((l): l is ShaderLook => !!l)
    .filter(l => brief.hasCover || !l.needsCover);
  const base = pool[(brief.track?.title?.length ?? 0) % Math.max(1, pool.length)] ?? HOUSE_LOOKS.find(l => !l.needsCover)!;
  const palette = (brief.palette ?? []).filter(c => /^#[0-9a-f]{6}$/i.test(c));
  const root = palette.length ? recolor(base.root, palette) : base.root;
  return validateLook({ ...base, id: `${base.id}-${id.toLowerCase()}`, director: id, root }).look ?? base;
}

// ── One director's proposal: model → validate → one repair turn → deterministic stand-in ──
export async function proposeLook(id: CouncilDirectorId, brief: LookBrief, deps: LooksCouncilDeps = {}): Promise<DirectorLook> {
  const model = deps.model;
  const stand = (why: string, issues: string[] = []): DirectorLook => ({
    directorId: id, look: localLook(id, brief), source: 'local', issues,
    rationale: `${COUNCIL_DIRECTORS[id].epithet}: ${SHORTLIST[id].stance}.${why ? ` (${why})` : ''}`,
  });
  if (!model) return stand('house look — no model in the room');

  const system = `${directorSystem(id)}\n\n${lookFormatSpec(brief.hasCover)}\n\n${catalogDigest(id)}`;
  const ask = `${briefText(brief)}\nPropose your look.`;
  let issues: string[] = [];
  let replied = false;
  try {
    let text = await model(system, ask);
    replied = !!text;
    for (let attempt = 0; attempt < 2 && text; attempt++) {
      try {
        const o = parseLookJson(text) as { look?: unknown; rationale?: unknown };
        const v = validateLook({ ...(o.look as object ?? {}), director: id });
        if (v.look && (brief.hasCover || !v.look.needsCover)) {
          return {
            directorId: id, look: v.look, source: 'ai', issues: v.issues,
            rationale: typeof o.rationale === 'string' && o.rationale.trim() ? o.rationale.trim().slice(0, 400) : SHORTLIST[id].stance,
          };
        }
        issues = v.look ? ['uses the cover but there is no cover art for this track'] : v.issues;
      } catch { issues = ['the reply was not valid JSON']; }
      if (attempt === 0) text = await model(system, `${ask}\n\nYour draft was rejected:\n- ${issues.slice(0, 8).join('\n- ')}\nFix exactly these and answer again as JSON.`);
    }
  } catch { /* model unreachable → stand-in below */ }
  // No reply at all (no key / offline) is not a failure worth mentioning; an invalid reply is.
  return stand(replied ? 'the draft did not pass the editor, so the house look stands' : '', issues);
}

// ── Lead selection, tension, synthesis ──
const ENERGY_LEADS: Record<'high' | 'mid' | 'low', CouncilDirectorId[]> = {
  high: ['REBEL', 'FUTURIST', 'BAROQUE'], mid: ['WORLD_ECLECTIC', 'FUTURIST', 'BAROQUE'], low: ['CLASSICAL', 'RADICAL_MINIMAL', 'BAROQUE'],
};
const GENRE_LEAD: [RegExp, CouncilDirectorId][] = [
  [/punk|metal|hardcore|noise|grunge|drill|trap/i, 'REBEL'], [/electro|techno|house|synth|ambient|idm|glitch/i, 'FUTURIST'],
  [/classical|jazz|folk|acoustic|piano|chamber/i, 'CLASSICAL'], [/afro|latin|reggae|dancehall|world|highlife|samba|cumbia|gnawa/i, 'WORLD_ECLECTIC'],
  [/gospel|choir|orchestral|cinematic|soul|opera/i, 'BAROQUE'], [/minimal|lo-?fi|drone|slow/i, 'RADICAL_MINIMAL'],
];

export function chooseLead(brief: LookBrief, present: CouncilDirectorId[]): CouncilDirectorId {
  const g = brief.track?.genre ?? '';
  const byGenre = GENRE_LEAD.find(([re, d]) => re.test(g) && present.includes(d));
  if (byGenre) return byGenre[1];
  const e = brief.energy ?? 0.5;
  const tier = e > 0.66 ? 'high' : e < 0.34 ? 'low' : 'mid';
  return ENERGY_LEADS[tier].find(d => present.includes(d)) ?? present[0];
}

function findTension(lead: CouncilDirectorId, present: CouncilDirectorId[]) {
  const t = COUNCIL_DIRECTORS[lead].tensions;
  for (const other of Object.keys(t) as CouncilDirectorId[]) if (present.includes(other)) return { a: lead, b: other, line: t[other]! };
  return null;
}

/** Wrap `inner` in the first filter found walking `outer` outside-in; null if `outer` has no filter. */
function wrapWithOuterFilter(outer: ShaderNode[], inner: ShaderNode[]): ShaderNode[] | null {
  const first = outer[0];
  if (!first || !SHADER_CATALOG[first.type]?.rc) return null;
  return [{ ...first, children: inner }];
}

export function synthesise(lead: DirectorLook, counter: DirectorLook | null): LookDeliberation['synthesis'] {
  if (!counter) return { look: lead.look, lead: lead.directorId, counterpoint: null, note: 'No counterpoint in the room — the lead stands as proposed.' };
  const L = COUNCIL_DIRECTORS[lead.directorId].epithet, C = COUNCIL_DIRECTORS[counter.directorId].epithet;
  const name = `${lead.look.name} × ${counter.look.name}`.slice(0, 48);
  const wrapped = wrapWithOuterFilter(counter.look.root, lead.look.root);
  // Preserve the tension: the counterpoint keeps its own filter (or its own generator), the lead keeps its tree.
  const candidates: [string, ShaderNode[]][] = [];
  if (wrapped) candidates.push([`${C}'s ${counter.look.root[0].type} now filters ${L}'s look`, wrapped]);
  const gen = counter.look.root.find(n => !SHADER_CATALOG[n.type]?.rc);
  if (gen) candidates.push([`${C}'s ${gen.type} sits underneath ${L}'s look`, [gen, ...lead.look.root]]);
  for (const [why, root] of candidates) {
    const v = validateLook({ id: `${lead.look.id}-x-${counter.look.id}`, name, director: lead.directorId, root });
    if (v.look && !v.issues.some(i => /budget|deeper|nodes/.test(i))) {
      return { look: v.look, lead: lead.directorId, counterpoint: counter.directorId, note: `${why}. Neither averaged: ${L} still owns the picture, ${C} still owns the treatment.` };
    }
  }
  return { look: lead.look, lead: lead.directorId, counterpoint: counter.directorId, note: `${C}'s counterpoint did not fit the GPU budget alongside ${L}'s look, so the editor cut it — ${L} stands.` };
}

// ── The whole room ──
export async function convene(brief: LookBrief, deps: LooksCouncilDeps = {}): Promise<LookDeliberation> {
  const settled = await Promise.allSettled(COUNCIL_DIRECTOR_IDS.map(id => proposeLook(id, brief, deps)));
  const proposals = settled.map((s, i) => s.status === 'fulfilled'
    ? s.value
    : ({ directorId: COUNCIL_DIRECTOR_IDS[i], look: localLook(COUNCIL_DIRECTOR_IDS[i], brief), source: 'local', issues: [], rationale: SHORTLIST[COUNCIL_DIRECTOR_IDS[i]].stance } as DirectorLook));
  const present = proposals.map(p => p.directorId);
  const lead = chooseLead(brief, present);
  const tension = findTension(lead, present);
  const leadP = proposals.find(p => p.directorId === lead)!;
  const counterP = tension ? proposals.find(p => p.directorId === tension.b) ?? null : null;
  return { brief, proposals, tension, synthesis: synthesise(leadP, counterP) };
}

/** Default model: the platform's server-proxied Gemini, loaded lazily so tests and TV never pull it in. */
export const defaultLookModel: LookModel = async (system, user) => {
  const { callGemini } = await import('../geminiService');
  const out = await callGemini(`${system}\n\n${user}`, { temperature: 0.8 });
  return typeof out === 'string' ? out : (out as { text?: string } | null)?.text ?? null;
};

