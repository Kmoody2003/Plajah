// musicCouncilService — the client door to the Music Council. Two paths: `deliberate` asks the model
// (server-proxied Gemini) with the personas + grounded knowledge + measurements and parses a structured
// deliberation; `localAdvice` is a DETERMINISTIC Mix-Doctor that reads the measurements against the
// knowledge base with no AI — so the council always gives grounded, actionable advice, keys or not.
import { callGemini } from '../../geminiService';
import { MUSIC_PERSONAS, MUSIC_COUNCIL_LIST } from './musicCouncilPersonas';
import { knowledgeGrounding, genreProfile, loudnessTarget } from './musicKnowledge';
import type { MusicBrief, MeasuredMix, MusicDeliberation, Proposal, CouncilMove, MusicPersonaId } from './musicCouncilTypes';

export { MUSIC_PERSONAS, MUSIC_COUNCIL_LIST };
export type { MusicBrief, MeasuredMix, MusicDeliberation };

const BANDS: Array<{ key: keyof NonNullable<MeasuredMix['tone']>; label: string; where: string }> = [
  { key: 'sub', label: 'sub', where: '30–60 Hz' },
  { key: 'low', label: 'low end', where: '60–120 Hz' },
  { key: 'lowMid', label: 'low-mids', where: '200–500 Hz' },
  { key: 'mid', label: 'mids', where: '500 Hz–2 kHz' },
  { key: 'highMid', label: 'presence', where: '2–5 kHz' },
  { key: 'high', label: 'air', where: '8 kHz+' },
];

/** Deterministic, grounded advice from the measurements + knowledge base — no AI. */
export function localAdvice(brief: MusicBrief, m: MeasuredMix = {}): MusicDeliberation {
  const proposals: Proposal[] = [];
  const tensions: string[] = [];
  const plan: CouncilMove[] = [];
  const target = loudnessTarget(brief.platform || 'Spotify');
  const gp = brief.genre ? genreProfile(brief.genre) : undefined;

  // ── Master Engineer: loudness / peak / dynamics vs the target ──
  const masterMoves: CouncilMove[] = [];
  if (typeof m.lufsIntegrated === 'number' && target) {
    const d = m.lufsIntegrated - target.lufs;
    if (d > 1.5) masterMoves.push({ text: `You're ${d.toFixed(1)} dB over the ${target.platform} target — it'll be turned down and lose punch. Master to ${target.lufs} LUFS.`, where: 'master' });
    else if (d < -2) masterMoves.push({ text: `${Math.abs(d).toFixed(1)} dB under the ${target.platform} target — there's headroom to push loudness.`, where: 'master' });
    else masterMoves.push({ text: `Loudness is on target for ${target.platform} (${m.lufsIntegrated.toFixed(1)} vs ${target.lufs} LUFS).`, where: 'master' });
  }
  if (typeof m.truePeakDb === 'number' && target && m.truePeakDb > target.truePeakDb) masterMoves.push({ text: `True-peak ${m.truePeakDb.toFixed(1)} dBTP exceeds ${target.truePeakDb} — inter-sample overs will clip on lossy. Lower the ceiling.`, where: 'true-peak limiter' });
  if (typeof m.plr === 'number' && gp && m.plr < gp.plr[0]) masterMoves.push({ text: `PLR ${m.plr.toFixed(1)} is below the ${gp.genre} norm (${gp.plr[0]}–${gp.plr[1]}) — it's over-compressed and flat. Ease the limiting.`, where: 'master bus' });
  if (masterMoves.length) proposals.push({ personaId: 'MASTER', headline: 'Loudness & translation', moves: masterMoves });

  // ── Mix Engineer: tonal balance vs the genre norm ──
  const mixMoves: CouncilMove[] = [];
  if (m.tone && gp) {
    for (const b of BANDS) {
      const have = m.tone[b.key]; const want = gp.tone[b.key];
      if (typeof have !== 'number') continue;
      const diff = have - want;
      if (diff > 0.2) mixMoves.push({ text: `Too much ${b.label} for ${gp.genre} — pull it back a little.`, where: b.where });
      else if (diff < -0.2) mixMoves.push({ text: `Light on ${b.label} vs ${gp.genre} — a gentle lift will help it sit right.`, where: b.where });
    }
  }
  if (typeof m.corr === 'number' && m.corr < 0) mixMoves.push({ text: `Correlation is negative (${m.corr.toFixed(2)}) — phase issues; check mono, keep the low end centered.`, where: 'M/S · low mono' });
  if (mixMoves.length) proposals.push({ personaId: 'MIX', headline: 'Balance & clarity', moves: mixMoves.slice(0, 5) });

  // ── The other three: lens-based prompts (they read the song, not the meter) ──
  for (const id of ['PRODUCER', 'MUSICIAN', 'COMPOSER'] as MusicPersonaId[]) {
    const p = MUSIC_PERSONAS[id];
    proposals.push({ personaId: id, headline: p.lens.split('—')[0].trim(), moves: p.questions.slice(0, 2).map((q) => ({ text: q })) });
  }

  // ── Tensions (the classic disagreements) ──
  if (masterMoves.some((x) => /over|turned down|over-compressed/.test(x.text))) tensions.push('The Master Engineer wants more dynamics; the Producer wants it loud for the drop — pick the delivery target first, then commit.');
  if (mixMoves.length) tensions.push('The Mix Engineer would carve before the Master Engineer pushes loudness — clarity first, loudness last.');

  // ── Plan: measured findings first, ranked ──
  plan.push(...masterMoves.filter((x) => /over|exceeds|below/.test(x.text)));
  plan.push(...mixMoves.slice(0, 3));
  if (!plan.length) plan.push({ text: 'Play the master through the Meter Bridge so the council can read real LUFS, true-peak and tonal balance — then it can be specific.', where: 'Meter Bridge' });

  const grounded = !!(m.lufsIntegrated != null || m.tone || m.truePeakDb != null);
  return {
    intro: 'I took this to the room — producer, mix, master, musician and composer. Here\'s where they agree, where they split, and what I\'d do.',
    proposals, tensions, plan,
    summary: grounded
      ? `Grounded in your master's measurements${target ? ` against the ${target.platform} target` : ''}${gp ? ` and the ${gp.genre} norm` : ''}. Work top-down: fix balance, then set loudness for the target.`
      : 'No measurements yet — route the master through the Meter Bridge and ask again for numbers-backed advice.',
    grounded, source: 'local',
  };
}

function buildDeliberationPrompt(brief: MusicBrief, m: MeasuredMix): string {
  const personas = MUSIC_COUNCIL_LIST.map((p) => `- ${p.name} (${p.id}): ${p.lens} Protects: ${p.protects} Pushes back: ${p.challenges}`).join('\n');
  const meas = Object.keys(m).length ? `Measured mix: ${JSON.stringify(m)}` : 'No measurements provided.';
  return `You are the Music Council — five experts who propose, disagree, then synthesise. Answer ONLY as JSON.
The team:
${personas}
Grounding (use these real numbers, cite them):
${knowledgeGrounding(brief.genre, brief.platform)}
${meas}
Question: ${brief.ask}${brief.genre ? ` (genre: ${brief.genre})` : ''}${brief.platform ? ` (target: ${brief.platform})` : ''}
Return EXACTLY:
{"proposals":[{"personaId":"MIX","headline":"...","moves":[{"text":"specific, actionable","where":"e.g. 300 Hz"}]}],"tensions":["a real disagreement between two members"],"plan":[{"text":"ranked move","where":"..."}],"summary":"Aria's synthesis, no averaging"}
Every move must be specific and actionable (a dB, a Hz, a target). personaId ∈ PRODUCER|MIX|MASTER|MUSICIAN|COMPOSER.`;
}

/** Ask the model; parse a structured deliberation. Falls back to localAdvice on any failure. */
export async function deliberate(brief: MusicBrief, m: MeasuredMix = {}): Promise<MusicDeliberation> {
  try {
    const text = await callGemini(buildDeliberationPrompt(brief, m), { temperature: 0.7 });
    const s = String(typeof text === 'string' ? text : (text?.text ?? ''));
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1] : s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1);
    const o = JSON.parse(body);
    if (!Array.isArray(o.proposals) || !o.proposals.length) throw new Error('empty');
    return {
      intro: localAdvice(brief, m).intro,
      proposals: o.proposals,
      tensions: Array.isArray(o.tensions) ? o.tensions : [],
      plan: Array.isArray(o.plan) ? o.plan : [],
      summary: o.summary || '',
      grounded: Object.keys(m).length > 0,
      source: 'ai',
    };
  } catch {
    return localAdvice(brief, m); // keys down / bad response → deterministic grounded advice
  }
}
