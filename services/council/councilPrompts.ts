// councilPrompts — what each director is told, and how their answers are read back.
//
// Server-safe: no browser globals. Every prompt asks for JSON and every reader tolerates the
// model wrapping it in prose or a code fence. The method the council works by is the one Kenne
// set in ARIA_ART_COUNCIL_METHOD: materially different proposals, the strongest disagreement
// named, synthesis without averaging, tension preserved, a human trace in every direction.
import { ARIA_ART_COUNCIL_METHOD } from '../aria/ariaCreativeRoles';
import { COUNCIL_DIRECTORS } from './councilDirectors';
import type { CouncilBrief, CouncilDirectorId, Deliberation, DirectorProfile, DirectorProposal, Dispute, Synthesis } from './councilTypes';

const recent = <T extends { at: number }>(items: T[], n: number) => [...items].sort((a, b) => b.at - a.at).slice(0, n);

/** The director as an agent: who they are, how they have been changing, how the team works. */
export function directorSystem(id: CouncilDirectorId, profile?: DirectorProfile): string {
  const d = COUNCIL_DIRECTORS[id];
  const notes = profile ? recent(profile.styleNotes, 5).map(n => `- ${n.text}`).join('\n') : '';
  const infl = profile ? recent(profile.influences, 4).map(i => `- ${i.topic}: ${i.finding}${i.source?.title ? ` (${i.source.title})` : ''}`).join('\n') : '';
  const led = profile ? profile.portfolio.slice(0, 6).map(p => p.name).join(', ') : '';
  const tensions = Object.entries(d.tensions).map(([other, why]) => `- with ${COUNCIL_DIRECTORS[other as CouncilDirectorId].name}: ${why}`).join('\n');
  return [
    `You are ${d.name}, ${d.epithet}, one of six art directors on the Plajah council — a working team, not a panel of mascots.`,
    `Medium: ${d.medium}.`, `Conviction: ${d.conviction}`, `You challenge: ${d.challenges}.`, `You protect: ${d.protects}.`,
    `Voice: ${d.voice}`,
    `The questions you always put to a brief: ${d.questions.join(' ')}`,
    tensions ? `Standing arguments on this team:\n${tensions}` : '',
    notes ? `Your style has been moving. Your recent notes to yourself:\n${notes}` : 'You have not yet written any notes to yourself; this may be your first brief with this team.',
    infl ? `Influences you brought back from research recently:\n${infl}` : '',
    led ? `Work you have led on the platform: ${led}.` : '',
    '',
    'How the team works:', ARIA_ART_COUNCIL_METHOD,
    '',
    'Rules for you:',
    '- Propose work that is materially different from what the others would propose — geometry, typography, image logic, texture, motion, production method. Never a palette swap.',
    '- Every direction keeps a perceptible human trace: pressure, gesture, photographed material, physical light, field observation, a constructed model, performance timing.',
    '- Cultural references must be specific, attributable and transformed; anything that belongs to a living community is collaboration-gated and you say so.',
    '- You are one voice on the team. Disagree openly and name who you disagree with and why. Concede when a colleague is right about something.',
    '- You are not Aria. Aria speaks to the user; you speak to the team. Never address the user directly.',
    '- Answer ONLY with the JSON requested. No preamble, no code fence.',
  ].filter(Boolean).join('\n');
}

export function briefText(b: CouncilBrief): string {
  return [
    `THE BRIEF: ${b.ask}`,
    b.surface ? `Surface: ${b.surface}${b.domain ? ` (${b.domain})` : ''}` : '',
    b.audience ? `Audience: ${b.audience}` : '', b.feeling ? `Intended feeling: ${b.feeling}` : '',
    b.constraints?.length ? `Constraints: ${b.constraints.join('; ')}` : '',
    b.references?.length ? `References the user mentioned: ${b.references.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

export function proposalUser(brief: CouncilBrief, others: CouncilDirectorId[]): string {
  return `${briefText(brief)}

The others in the room: ${others.map(o => COUNCIL_DIRECTORS[o].name).join(', ')}.

Make your proposal. Return JSON exactly in this shape:
{"title":"three to six words","idea":"one sentence, the one idea","geometry":"the grid, proportion or structure","typography":"faces, scale, case, spacing — name real families","imageLogic":"how photographs or footage enter and are treated","texture":"material and surface","motion":"what moves, in what order, at what pace","productionMethod":"how it would actually be made","humanTrace":"the perceptible sign of making","risk":"what this direction risks and why that risk is worth it","arguesWith":{"directorId":"one of ${others.join('|')}","why":"the specific disagreement you expect"}}`;
}

export function disputeUser(self: CouncilDirectorId, proposals: DirectorProposal[]): string {
  const others = proposals.filter(p => p.directorId !== self).map(p => `${COUNCIL_DIRECTORS[p.directorId].name}: "${p.title}" — ${p.idea} Geometry: ${p.geometry}. Type: ${p.typography}. Image: ${p.imageLogic}. Texture: ${p.texture}. Motion: ${p.motion}. Human trace: ${p.humanTrace}.`).join('\n');
  return `The other proposals on the table:
${others}

Choose the ONE you most disagree with and say why — about the work, specifically, not about the person. Then concede one thing in it that is right. Return JSON:
{"against":"directorId","objection":"two or three sentences in your voice","concession":"one sentence"}`;
}

/** Aria, synthesising. She is the only one who speaks to the user. */
export function synthesisSystem(): string {
  return `You are Aria, the single AI presence across Plajah. You convened the council — six art directors who work as a team behind you. You speak to the user; they do not. Refer to them as "the council" or "the team", and name an individual director only when quoting them or crediting a position. You may quote at most two directors in their own words.

Synthesise WITHOUT averaging: choose a lead philosophy, one counterpoint, and one editor. Keep the tension — say plainly where the team disagreed and which side you took, and why. The user has the final say; end with the one decision that is theirs to make. Warm, direct, concise. No sycophancy. Answer ONLY with JSON.`;
}

export function synthesisUser(brief: CouncilBrief, proposals: DirectorProposal[], disputes: Dispute[]): string {
  const props = proposals.map(p => `[${p.directorId}] ${COUNCIL_DIRECTORS[p.directorId].name} — "${p.title}": ${p.idea} | geometry: ${p.geometry} | type: ${p.typography} | image: ${p.imageLogic} | texture: ${p.texture} | motion: ${p.motion} | production: ${p.productionMethod} | trace: ${p.humanTrace} | risk: ${p.risk}${p.arguesWith ? ` | argues with ${p.arguesWith.directorId}: ${p.arguesWith.why}` : ''}`).join('\n');
  const disp = disputes.map(d => `${COUNCIL_DIRECTORS[d.from].name} against ${COUNCIL_DIRECTORS[d.against].name}: ${d.objection}${d.concession ? ` (concedes: ${d.concession})` : ''}`).join('\n');
  return `${briefText(brief)}

PROPOSALS:
${props}

DISAGREEMENTS SAID OUT LOUD:
${disp || '(none recorded)'}

Return JSON exactly:
{"lead":"directorId","counterpoint":"directorId (different from lead)","editor":"directorId (different from both)","direction":"the direction you are recommending, concrete: geometry, type, image, texture, motion, production — two to four sentences","keepFromCounterpoint":"the one thing from the counterpoint that must survive","editorCut":"what the editor removed and why","openDecision":"the single decision the user must make","ariaSummary":"what you say to the user: two to four short paragraphs, referring to the council or the team, naming where they disagreed and which side you took","quotes":[{"directorId":"…","line":"a short line in that director's own words, drawn from their proposal or objection"}]}`;
}

export function reflectionUser(self: CouncilDirectorId, deliberation: Deliberation): string {
  const s = deliberation.synthesis;
  const role = s ? (s.lead === self ? 'you led' : s.counterpoint === self ? 'you were the counterpoint' : s.editor === self ? 'you edited' : 'you were heard but not chosen') : 'the outcome is not yet known';
  return `The deliberation is over: ${role}. Aria's direction: ${s?.direction ?? '(none)'}.

In one or two sentences, first person, write the note you would add to your own style notes: what this brief moved in your thinking, or a rule you now hold that you did not before. Be specific to this work, not general. Return JSON: {"note":"…"}`;
}

export function researchUser(id: CouncilDirectorId, topic: string): string {
  const d = COUNCIL_DIRECTORS[id];
  return `Research "${topic}" through the lens of ${d.name} (${d.medium}). What they go looking for: ${d.researchBeats.join('; ')}.

Find three to five SPECIFIC, ATTRIBUTABLE references — named designers, studios, works, movements, techniques, with dates where known — that this director would bring back to the team. Prefer primary or reputable sources. Do not invent names, dates or sources; if unsure, say so in the finding. Return JSON exactly:
{"influences":[{"topic":"…","finding":"one or two sentences, specific","source":{"title":"…","url":"https://… if known"}}],"note":"two sentences to the team in ${d.name}'s voice about what this changes for them"}`;
}

/* ─── Readers ────────────────────────────────────────────────────────────────────────────── */
export function parseJson<T = any>(text: string): T | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{'); const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}
const str = (v: unknown, max = 900) => String(v ?? '').trim().slice(0, max);
const isId = (v: unknown): v is CouncilDirectorId => typeof v === 'string' && v in COUNCIL_DIRECTORS;

export function readProposal(id: CouncilDirectorId, raw: any): DirectorProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const p: DirectorProposal = {
    directorId: id, title: str(raw.title, 80) || 'Untitled direction', idea: str(raw.idea), geometry: str(raw.geometry), typography: str(raw.typography),
    imageLogic: str(raw.imageLogic), texture: str(raw.texture), motion: str(raw.motion), productionMethod: str(raw.productionMethod),
    humanTrace: str(raw.humanTrace), risk: str(raw.risk),
  };
  if (raw.arguesWith && isId(raw.arguesWith.directorId) && raw.arguesWith.directorId !== id) p.arguesWith = { directorId: raw.arguesWith.directorId, why: str(raw.arguesWith.why, 400) };
  return p.idea ? p : null;
}
export function readDispute(from: CouncilDirectorId, raw: any, allowed: CouncilDirectorId[]): Dispute | null {
  if (!raw || !isId(raw.against) || raw.against === from || !allowed.includes(raw.against)) return null;
  const objection = str(raw.objection, 700); if (!objection) return null;
  return { from, against: raw.against, objection, concession: str(raw.concession, 300) || undefined };
}
export function readSynthesis(raw: any, ids: CouncilDirectorId[]): Synthesis | null {
  if (!raw || !isId(raw.lead) || !ids.includes(raw.lead)) return null;
  // The whole point is a decision: lead, counterpoint and editor are three different people.
  let counterpoint = isId(raw.counterpoint) && raw.counterpoint !== raw.lead && ids.includes(raw.counterpoint) ? raw.counterpoint : ids.find(i => i !== raw.lead)!;
  let editor = isId(raw.editor) && raw.editor !== raw.lead && raw.editor !== counterpoint && ids.includes(raw.editor) ? raw.editor : ids.find(i => i !== raw.lead && i !== counterpoint) ?? counterpoint;
  const quotes = Array.isArray(raw.quotes) ? raw.quotes.filter((q: any) => q && isId(q.directorId) && q.line).slice(0, 2).map((q: any) => ({ directorId: q.directorId, line: str(q.line, 240) })) : [];
  const s: Synthesis = {
    lead: raw.lead, counterpoint, editor, direction: str(raw.direction, 1200), keepFromCounterpoint: str(raw.keepFromCounterpoint, 500), editorCut: str(raw.editorCut, 500),
    openDecision: str(raw.openDecision, 400), ariaSummary: str(raw.ariaSummary, 2400), quotes,
  };
  return s.direction && s.ariaSummary ? s : null;
}
