// reviewTake — look at what came back, and say whether it is the shot that was asked for.
//
// Everything upstream of this writes a careful prompt and then has to trust the result. This is the
// other half: after a generation returns, the take is LOOKED AT against the direction it was made
// from, check by check, and a failed check becomes a specific correction for the next attempt. That
// turns continuity from something Fabula asks for into something it verifies.
//
// The checklist is built from the shot's own direction — the continuity ledger (who holds what, who
// is marked how, which side the light is on), the staging (who is where in frame), the performance
// (what the character should read as) and the identity references. A vision model answers each check
// from the frame; this module writes the questions, reads the answers, and decides:
//
//   pass     every MUST check holds
//   retry    a MUST check failed — the take is wrong in a way the cut would show
//   review   only advisory checks failed, or too much couldn't be judged — a person should look
//
// Pure. The model call belongs to the caller. Continuity Eye (pixel comparison against a neighbouring
// frame) is a separate, complementary check: it measures drift; this reads content.

import type { ShotSpec } from '../genAgent';
import type { ShotDirection } from './promptCompiler';

export type ReviewKind = 'identity' | 'prop' | 'wardrobe' | 'marks' | 'placement' | 'emotion' | 'light' | 'time' | 'set' | 'style';

export interface ReviewCheck {
  id: string;
  kind: ReviewKind;
  subject?: string;
  question: string;
  /** A failed MUST check means the take can't be used as is. Advisory checks inform, never reject. */
  must: boolean;
  /** What to tell the generator if this fails. */
  fix: string;
}

export interface ReviewedCheck extends ReviewCheck {
  /** null = the frame doesn't show enough to say. */
  pass: boolean | null;
  observed?: string;
}

export type ReviewVerdict = 'pass' | 'retry' | 'review';

export interface TakeReview {
  verdict: ReviewVerdict;
  /** 0–100 over the checks that could be judged; MUST checks count double. */
  score: number;
  checks: ReviewedCheck[];
  failed: ReviewedCheck[];
  warnings: ReviewedCheck[];
  unknown: number;
  summary: string;
  attempt: number;
  at: number;
}

/** How many times a shot is generated before a person has to decide. */
export const MAX_ATTEMPTS = 3;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** The checks a take must pass, from the direction on its spec. `refNames` are the identity reference
 *  images that will be shown to the reviewer, in order, after the take itself. */
export function reviewChecklist(spec: ShotSpec, refNames: string[] = []): ReviewCheck[] {
  const dir: ShotDirection = spec.direction || {};
  const checks: ReviewCheck[] = [];
  const board = !!dir.boardStyle;
  const cont = dir.continuity;
  const push = (c: ReviewCheck) => { if (!checks.some((x) => x.id === c.id)) checks.push(c); };

  // Identity — against a reference image where there is one, else against the written lock.
  for (const r of spec.refs || []) {
    if (r.role !== 'character' || !r.lock || board) continue;
    const name = r.name || 'the character';
    const image = refNames.findIndex((n) => n === r.name);
    push({
      id: `identity:${slug(name)}`, kind: 'identity', subject: name, must: true,
      question: image >= 0
        ? `Is ${name} in the take recognisably the same person as reference image ${image + 1} — same face, hair and build?`
        : `Does ${name} match this description: ${r.lock}`,
      fix: `${name} must match their reference exactly — ${r.lock}`,
    });
  }

  for (const c of cont?.characters || []) {
    for (const p of c.props) push({ id: `prop:${slug(c.name)}:${slug(p)}`, kind: 'prop', subject: c.name, must: true, question: `Is ${c.name} holding ${p}?`, fix: `${c.name} is holding ${p} — it must be clearly visible in their hand.` });
    for (const w of c.wardrobe) push({ id: `wardrobe:${slug(c.name)}:${slug(w)}`, kind: 'wardrobe', subject: c.name, must: !board, question: `Wardrobe for ${c.name}: ${w} — is that what the take shows?`, fix: `${c.name}'s wardrobe: ${w}.` });
    for (const m of c.marks) push({ id: `marks:${slug(c.name)}:${slug(m)}`, kind: 'marks', subject: c.name, must: !board, question: `Does ${c.name} visibly have: ${m}?`, fix: `${c.name} still has ${m} — it must be visible.` });
  }

  // Placement, from this camera's blocking ("NAME foreground frame-left, …").
  const placed = [...(dir.blocking || '').matchAll(/([A-Z][A-Z0-9 .'-]*?)\s+(?:foreground |midground |background )?(frame-left|frame-right|centre frame)/g)];
  if (placed.length >= 2) {
    for (const [, who, side] of placed) {
      const name = who.trim();
      push({ id: `placement:${slug(name)}`, kind: 'placement', subject: name, must: true, question: `Is ${name} on ${side === 'centre frame' ? 'the centre of frame' : side}?`, fix: `${name} must be ${side} — do not swap the characters' sides.` });
    }
  }

  for (const b of dir.performance || []) {
    push({ id: `emotion:${slug(b.character)}`, kind: 'emotion', subject: b.character, must: false, question: `Does ${b.character} read as ${b.emotion.name} (${b.physical.eyes}; ${b.physical.face})?`, fix: `${b.character}'s expression must read as ${b.emotion.name}: ${b.physical.eyes}, ${b.physical.face}.` });
  }

  if (cont && !board) {
    const e = cont.environment;
    if (e.timeOfDay) push({ id: 'time', kind: 'time', must: true, question: `Is it ${e.timeOfDay}?`, fix: `The scene is at ${e.timeOfDay}.` });
    if (e.keySide) push({ id: 'light', kind: 'light', must: false, question: `Does the main light come from ${e.keySide}?`, fix: `Key light from ${e.keySide}, matching the previous shot.` });
    for (const d of e.dressing) push({ id: `set:${slug(d)}`, kind: 'set', must: false, question: `Is this visible in the set: ${d}?`, fix: `The set still shows: ${d}.` });
  }
  if (board) push({ id: 'style', kind: 'style', must: true, question: 'Is this a drawn storyboard frame (not a photograph)?', fix: 'Render as a drawn storyboard frame, not a photograph.' });
  return checks;
}

/** The instruction for the vision model. Image 1 is the take; any further images are the identity
 *  references named in `refNames`, in order. */
export function reviewPrompt(checks: ReviewCheck[], refNames: string[] = [], medium: 'image' | 'video' = 'image'): string {
  return [
    `You are a script supervisor checking a ${medium === 'video' ? 'frame from a generated shot' : 'generated frame'} against what was ordered. Judge only what the image shows — never what was intended.`,
    `IMAGE 1 is the take.${refNames.length ? ` ${refNames.map((n, i) => `IMAGE ${i + 2} is the reference for ${n}.`).join(' ')}` : ''}`,
    'For each check answer true, false, or null. Use null when the frame does not show enough to tell (the hand is out of frame, the character has their back to camera) — do not guess. Be strict about identity, props and sides of frame; be fair about expression.',
    `CHECKS:\n${checks.map((c) => `- ${c.id}: ${c.question}`).join('\n')}`,
    'Respond ONLY with JSON, no fences: {"checks":[{"id":"<id exactly as given>","pass":true|false|null,"observed":"what you actually see, under 14 words"}],"summary":"one sentence on the take overall"}',
  ].join('\n\n');
}

/** Read the model's answers against the checklist. A check the model skipped is treated as unknown,
 *  never as a pass. */
export function normalizeReview(raw: any, checks: ReviewCheck[], attempt = 1, at = Date.now()): TakeReview {
  const answers = new Map<string, any>((Array.isArray(raw?.checks) ? raw.checks : []).map((a: any) => [String(a?.id || ''), a]));
  const reviewed: ReviewedCheck[] = checks.map((c) => {
    const a = answers.get(c.id);
    const pass = a?.pass === true ? true : a?.pass === false ? false : null;
    return { ...c, pass, observed: typeof a?.observed === 'string' ? a.observed.trim().slice(0, 160) : undefined };
  });
  const failed = reviewed.filter((c) => c.pass === false && c.must);
  const warnings = reviewed.filter((c) => c.pass === false && !c.must);
  const unknown = reviewed.filter((c) => c.pass === null).length;
  let got = 0, of = 0;
  for (const c of reviewed) { if (c.pass === null) continue; const w = c.must ? 2 : 1; of += w; if (c.pass) got += w; }
  const mustTotal = reviewed.filter((c) => c.must).length;
  const mustUnknown = reviewed.filter((c) => c.must && c.pass === null).length;
  const verdict: ReviewVerdict = failed.length ? 'retry'
    : (warnings.length || (mustTotal > 0 && mustUnknown * 2 > mustTotal) || !reviewed.length) ? 'review' : 'pass';
  return {
    verdict, score: of ? Math.round((got / of) * 100) : 0, checks: reviewed, failed, warnings, unknown,
    summary: typeof raw?.summary === 'string' ? raw.summary.trim().slice(0, 240) : '', attempt, at,
  };
}

/** Can this take be tried again automatically? Only when it clearly failed and tries remain. */
export function canRetry(review: TakeReview | undefined): boolean {
  return !!review && review.verdict === 'retry' && review.attempt < MAX_ATTEMPTS;
}

/** The spec for the next attempt: the same shot, with what the last take got wrong stated up front.
 *  The seed is dropped so the retry isn't the same image again. */
export function correctedSpec(spec: ShotSpec, review: TakeReview): ShotSpec {
  const fixes = [...review.failed, ...review.warnings].map((c) => c.fix);
  const { seed: _seed, ...rest } = spec;
  return { ...rest, attempt: review.attempt + 1, direction: { ...(spec.direction || {}), corrections: Array.from(new Set(fixes)) } };
}
