// motionCouncilService — the client door to the Motion Graphics & VFX Council. Two paths: `deliberate`
// asks the model (server-proxied Gemini) with the six personas + grounded knowledge + the piece's spec and
// parses a structured deliberation; `localAdvice` is a DETERMINISTIC motion doctor that reasons the spec
// (tempo, fps, delivery, medium) against the knowledge base with no AI — so the council always gives
// grounded, actionable direction, keys or not. Mirrors services/melos/council/musicCouncilService.
import { callGemini } from '../../geminiService';
import { MOTION_PERSONAS, MOTION_COUNCIL_LIST } from './motionCouncilPersonas';
import { knowledgeGrounding, deliveryTarget, beatGrid, shutterBlur } from './motionKnowledge';
import type { MotionBrief, MotionSpec, MotionMedium, MotionDeliberation, Proposal, CouncilMove, MotionPersonaId } from './motionCouncilTypes';

export { MOTION_PERSONAS, MOTION_COUNCIL_LIST };
export type { MotionBrief, MotionSpec, MotionDeliberation };

/** Which directors naturally lead each medium (the others still weigh in on concept). */
const LEADS_BY_MEDIUM: Record<MotionMedium, MotionPersonaId[]> = {
  'title': ['KINETIC', 'CINEMATIC'],
  'lower-third': ['KINETIC', 'COMPOSITOR'],
  'transition': ['KINETIC', 'SIGNAL'],
  'mograph': ['KINETIC', 'GENERATIVE'],
  'vj-loop': ['SIGNAL', 'GENERATIVE'],
  'background': ['GENERATIVE', 'CINEMATIC'],
  'logo-sting': ['CINEMATIC', 'KINETIC'],
  'character': ['CHARACTER', 'CINEMATIC'],
  'vfx-shot': ['COMPOSITOR', 'CINEMATIC'],
  'shader': ['GENERATIVE', 'SIGNAL'],
  'generator': ['GENERATIVE', 'SIGNAL'],
};

/** Deterministic, grounded direction from the spec + knowledge base — no AI. */
export function localAdvice(brief: MotionBrief, spec: MotionSpec = {}): MotionDeliberation {
  const proposals: Proposal[] = [];
  const tensions: string[] = [];
  const plan: CouncilMove[] = [];
  const d = spec.delivery ? deliveryTarget(spec.delivery) : undefined;
  const fps = spec.fps ?? d?.fps;
  const leads = brief.medium ? LEADS_BY_MEDIUM[brief.medium] : [];

  // ── Kinetic Typographer: tempo → beat grid; delivery → title-safe ──
  const kineticMoves: CouncilMove[] = [];
  if (spec.tempo && fps) {
    const g = beatGrid(spec.tempo, fps, 8);
    kineticMoves.push({ personaId: 'KINETIC', text: `Cut and key on the grid: 1 beat = ${g.framesPerBeat.toFixed(1)} frames, an 1/8 step = ${g.framesPerStep.toFixed(1)} frames at ${spec.tempo} BPM.`, where: `${spec.tempo} BPM`, apply: { kind: 'beatGrid', bpm: spec.tempo, division: 8 } });
  }
  if (d && (brief.medium === 'title' || brief.medium === 'lower-third')) kineticMoves.push({ personaId: 'KINETIC', text: `Keep the type inside title-safe for ${d.label} and hold it long enough to read twice.`, where: d.aspect });
  if (spec.energy != null && spec.energy > 0.66) kineticMoves.push({ personaId: 'KINETIC', text: 'High energy — overshoot the entrance, then settle; do not let the word blur past reading speed.', where: 'ease: overshoot' });
  if (kineticMoves.length) proposals.push({ personaId: 'KINETIC', headline: 'Timing & legibility', moves: kineticMoves });

  // ── Compositor: fps → shutter / motion blur; grain match ──
  const compMoves: CouncilMove[] = [];
  if (fps) {
    const s = shutterBlur(180, fps);
    compMoves.push({ personaId: 'COMPOSITOR', text: `Match motion blur to a 180° shutter — ${(s.exposureSec * 1000).toFixed(1)} ms at ${fps} fps — across every layer, or the comp floats.`, where: '180° shutter', apply: { kind: 'shutter', angle: 180 } });
  }
  if (fps && fps <= 24) compMoves.push({ personaId: 'COMPOSITOR', text: `At ${fps} fps fast pans strobe — slow the move or lean on the blur.`, where: 'strobe' });
  if (brief.medium === 'vfx-shot') compMoves.push({ personaId: 'COMPOSITOR', text: 'Match black levels and grain to the plate; light-wrap the edges so it sits in, not on.', where: 'integration' });
  if (compMoves.length) proposals.push({ personaId: 'COMPOSITOR', headline: 'Integration & blur', moves: compMoves });

  // ── Generative / Signal: audio-reactive systems & loop-safety ──
  const genMoves: CouncilMove[] = [];
  if (brief.medium === 'shader' || brief.medium === 'generator' || brief.medium === 'vj-loop' || brief.medium === 'background') {
    genMoves.push({ personaId: 'GENERATIVE', text: 'Drive it by a rule, not a bake: let sub/mid/treble move amplitude, colour and light — never position or legibility.', where: 'audio-reactive' });
    if (spec.tempo && fps) genMoves.push({ personaId: 'GENERATIVE', text: `Make the period a whole number of bars so it loops seamlessly (one bar = ${(beatGrid(spec.tempo, fps).secPerBeat * 4).toFixed(2)} s).`, where: 'loop-safe' });
    genMoves.push({ personaId: 'SIGNAL', text: 'Give it signal texture — feedback, bleed, drop-out — and let it answer the room live, not play back.', where: 'live' });
    if (d?.id === 'led-wall') genMoves.push({ personaId: 'SIGNAL', text: 'On an LED wall, avoid full-white flashes and fine detail below the pixel pitch.', where: 'LED wall' });
  }
  if (genMoves.length) proposals.push({ personaId: 'GENERATIVE', headline: 'System & signal', moves: genMoves });

  // ── The rest read the concept, not the spec: lens-based prompts from whoever leads the medium ──
  const spoken = new Set(proposals.map(p => p.personaId));
  const speakers = (leads.length ? leads : (['CINEMATIC', 'CHARACTER'] as MotionPersonaId[]));
  for (const id of speakers) {
    if (spoken.has(id)) continue;
    const p = MOTION_PERSONAS[id];
    proposals.push({ personaId: id, headline: p.conviction.split('—')[0].split(':')[0].split(';')[0].trim(), moves: p.questions.slice(0, 2).map(q => ({ text: q, personaId: id })) });
    spoken.add(id);
  }

  // ── Tensions (the standing disagreements, surfaced when both parties are in the room) ──
  if (spoken.has('KINETIC') && spoken.has('SIGNAL')) tensions.push('The Kinetic Typographer wants it on the grid; the Signal Bender wants it to answer the room. Decide first whether this is timed or played live.');
  if (spoken.has('COMPOSITOR') && spoken.has('SIGNAL')) tensions.push('The Compositor removes the artefact; the Signal Bender frames it. Is the imperfection the truth of the piece, or a seam to hide?');
  if (spoken.has('GENERATIVE') && spoken.has('CINEMATIC')) tensions.push('The Generative Artist wants a behaviour that never repeats; the 3D Dramatist wants a staged reveal that lands once. A loop and a moment are different jobs.');
  if (spoken.has('CHARACTER') && (spoken.has('GENERATIVE') || spoken.has('KINETIC'))) tensions.push('The Animator keys weight by hand; the systems people snap to a grid or a rule. Performance lives in the in-betweens the grid discards.');

  // ── Plan: the concrete, spec-anchored moves first ──
  plan.push(...kineticMoves.filter(m => m.apply || /title-safe/.test(m.text)).slice(0, 1));
  plan.push(...compMoves.filter(m => m.apply).slice(0, 1));
  plan.push(...genMoves.slice(0, 2));
  if (!plan.length) plan.push({ text: 'Set the delivery target, tempo and frame rate so the council can give frame-accurate direction instead of principles.', where: 'spec' });

  const grounded = !!(spec.tempo || spec.fps || spec.delivery);
  return {
    intro: 'I took this to the room — kinetic type, the animator, the compositor, the generative artist, the signal bender and the 3D dramatist. Here\'s where they agree, where they split, and what I\'d do.',
    proposals, tensions, plan,
    summary: grounded
      ? `Grounded in the spec${d ? ` for ${d.label}` : ''}${spec.tempo ? ` at ${spec.tempo} BPM` : ''}. Decide the timing and the ease curves first, then the look — motion is time before it is texture.`
      : 'No spec yet — set the delivery target, tempo and frame rate and ask again for frame-accurate direction.',
    grounded, source: 'local',
  };
}

function buildDeliberationPrompt(brief: MotionBrief, spec: MotionSpec): string {
  const personas = MOTION_COUNCIL_LIST.map(p => `- ${p.name} (${p.id}): ${p.conviction} Protects: ${p.protects} Pushes back: ${p.challenges}`).join('\n');
  const specStr = Object.keys(spec).length ? `Spec: ${JSON.stringify(spec)}` : 'No spec provided.';
  return `You are the Motion Graphics & VFX Council — six experts who propose, disagree, then synthesise, about a moving visual. Answer ONLY as JSON.
The team:
${personas}
Grounding (use these real numbers, cite them):
${knowledgeGrounding(brief.medium, spec)}
${specStr}
Question: ${brief.ask}${brief.medium ? ` (medium: ${brief.medium})` : ''}
Return EXACTLY:
{"proposals":[{"personaId":"KINETIC","headline":"...","moves":[{"text":"specific, actionable","where":"e.g. 12 frames / 180° / on the beat"}]}],"tensions":["a real disagreement between two members"],"plan":[{"text":"ranked move","where":"..."}],"summary":"Aria's synthesis, no averaging"}
Every move must be specific and actionable (a frame count, an ease curve, a shutter angle, a beat division). personaId ∈ KINETIC|CHARACTER|COMPOSITOR|GENERATIVE|SIGNAL|CINEMATIC. Motion is time — direct the timing, not just the look.`;
}

/** Ask the model; parse a structured deliberation. Falls back to localAdvice on any failure. */
export async function deliberate(brief: MotionBrief, spec: MotionSpec = {}): Promise<MotionDeliberation> {
  try {
    const text = await callGemini(buildDeliberationPrompt(brief, spec), { temperature: 0.7 });
    const s = String(typeof text === 'string' ? text : (text as any)?.text ?? '');
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1] : s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1);
    const o = JSON.parse(body);
    if (!Array.isArray(o.proposals) || !o.proposals.length) throw new Error('empty');
    return {
      intro: localAdvice(brief, spec).intro,
      proposals: o.proposals,
      tensions: Array.isArray(o.tensions) ? o.tensions : [],
      plan: Array.isArray(o.plan) ? o.plan : [],
      summary: o.summary || '',
      grounded: Object.keys(spec).length > 0,
      source: 'ai',
    };
  } catch {
    return localAdvice(brief, spec); // keys down / bad response → deterministic grounded advice
  }
}
