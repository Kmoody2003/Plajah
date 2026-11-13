// promptCompiler — one direction, phrased for whichever model is running the shot.
//
// A filmmaker should be able to move a shot from Kling to Veo to Runway, or a still from Midjourney to
// Flux, and get the same person in the same clothes on the same side of frame playing the same beat.
// That only works if the things that hold a film together — performance direction and continuity state
// — are attached to the SHOT, not baked into one provider's prompt, and are re-phrased per model.
//
// `ShotDirection` is that attachment: it rides on a ShotSpec. `applyDirection` writes it into a prompt
// in the target model's dialect:
//   • stills get a frozen moment; video gets a beat with a start, an end and an intention
//   • models that generate dialogue audio get the line and its delivery; the rest get mouth and breath
//   • terse, motion-first models get clauses; tag-style models get phrases; the rest get sentences
//   • image-to-video with a first frame is told to HOLD the frame's identity instead of re-describing it
//   • drift guards go to the negative field where one exists, and are reported where it doesn't
// Each model also has a length budget. When direction has to be cut to fit, the least important section
// goes first and the cut is reported — continuity is never dropped silently.

import type { Connector, GenRef, ShotSpec } from '../genAgent';
import { motionDirection, stillDirection, type PerformanceBeat } from './performance';
import {
  characterStateClause, continuityNegatives, environmentStateClause, type ShotContinuity,
} from './continuityLedger';

export interface ShotDirection {
  performance?: PerformanceBeat[];
  continuity?: ShotContinuity;
  /** The spoken line, for models that generate dialogue with the picture. */
  dialogue?: { speaker: string; line: string };
  /** Where each character sits in THIS camera's frame, from the staging plan. When present it replaces
   *  the ledger's scene-level sides, which are only true for the master. */
  blocking?: string;
  /** Set for storyboard frames — a drawing style that replaces the photographic finish. */
  boardStyle?: string;
}

export type PromptForm = 'prose' | 'terse' | 'tags';

export interface Dialect {
  form: PromptForm;
  /** Characters of prompt the model reads reliably. Past this, later text is ignored or truncated. */
  maxChars: number;
  /** Generates dialogue audio with the shot. */
  nativeAudio: boolean;
}

// How each model wants to be spoken to. Keyed by connector id; anything unlisted falls back by kind.
const DIALECTS: Record<string, Dialect> = {
  runway: { form: 'terse', maxChars: 1000, nativeAudio: false },
  kling: { form: 'prose', maxChars: 2500, nativeAudio: false },
  veo: { form: 'prose', maxChars: 2000, nativeAudio: true },
  flow: { form: 'prose', maxChars: 2000, nativeAudio: true },
  dreamina: { form: 'prose', maxChars: 1200, nativeAudio: false },
  seedance: { form: 'prose', maxChars: 1500, nativeAudio: false },
  local_wan: { form: 'terse', maxChars: 800, nativeAudio: false },
  midjourney: { form: 'tags', maxChars: 1800, nativeAudio: false },
  flux: { form: 'prose', maxChars: 2000, nativeAudio: false },
  ideogram: { form: 'prose', maxChars: 1200, nativeAudio: false },
  magnific: { form: 'prose', maxChars: 2000, nativeAudio: false },
  local_creative: { form: 'prose', maxChars: 1500, nativeAudio: false },
};

export function dialectFor(connector: Connector): Dialect {
  return DIALECTS[connector.id] || (connector.kind === 'video'
    ? { form: 'prose', maxChars: 1500, nativeAudio: false }
    : { form: 'prose', maxChars: 1800, nativeAudio: false });
}

export const DEFAULT_BOARD_STYLE =
  'storyboard frame, loose graphite and grey marker, clear silhouettes and staging, arrows for camera and character movement, no photographic detail';

interface Section { id: 'performance' | 'continuity' | 'hold' | 'dialogue' | 'board' | 'guard' | 'blocking'; text: string; /** lower = kept longer */ priority: number }

/** The drift guards as something to DO, for models with no negative-prompt field. A negative phrase
 *  dropped into a positive prompt tends to summon the thing it names, so these are restated. */
export function positiveGuards(c: ShotContinuity): string {
  const keep = ['every face, hairstyle and outfit identical to the previous shot'];
  if (c.characters.length >= 2) keep.push('each character on their own side of frame');
  if (c.environment.keySide) keep.push(`light still coming from ${c.environment.keySide}`);
  if (c.characters.some((x) => x.marks.length)) keep.push('marks on skin and clothes still visible');
  return `Keep ${keep.join('; ')}.`;
}

export interface DirectedPrompt {
  prompt: string;
  /** Drift guards. Join into the negative field where the model has one. */
  negatives: string[];
  notes: string[];
  /** Section ids that had to be cut to fit the model's budget. */
  trimmed: string[];
}

const terseBeat = (b: PerformanceBeat) =>
  `${b.character}: ${b.emotion.name}${b.toward && b.toward.name !== b.emotion.name ? ` → ${b.toward.name}` : ''}, ${b.physical.eyes}, ${b.physical.tempo}`;
const tagBeat = (b: PerformanceBeat) => `${b.character} ${b.emotion.name}, ${b.physical.eyes}, ${b.physical.face}`;

function performanceSection(beats: PerformanceBeat[], d: Dialect, medium: 'image' | 'video'): string {
  if (!beats.length) return '';
  if (d.form === 'tags') return beats.map(tagBeat).join(', ');
  if (d.form === 'terse') return `Performance — ${beats.map(terseBeat).join('; ')}.`;
  return medium === 'video'
    ? `Performance: ${beats.map((b) => motionDirection(b, d.nativeAudio)).join(' ')}`
    : `Performance: ${beats.map(stillDirection).join(' ')}`;
}

function continuitySection(c: ShotContinuity, d: Dialect, hasBlocking = false): string {
  const two = c.characters.length >= 2 && !hasBlocking;
  const chars = c.characters.map((x) => characterStateClause(x, { withSide: two })).filter(Boolean);
  const env = environmentStateClause(c.environment);
  const all = [...chars, env].filter(Boolean);
  if (!all.length) return '';
  return d.form === 'tags' ? all.join(', ') : `Continuity: ${all.join('. ')}.`;
}

/** Write a shot's direction into `prompt` for `connector`. `usedRefs` are the reference images this
 *  model is actually taking (see refsForConnector) — a first frame changes what needs saying. With no
 *  direction on the spec the prompt comes back untouched. */
export function applyDirection(prompt: string, spec: ShotSpec, connector: Connector, usedRefs: GenRef[] = []): DirectedPrompt {
  const dir = spec.direction;
  const base = (prompt || '').trim();
  if (!dir) return { prompt: base, negatives: [], notes: [], trimmed: [] };

  const d = dialectFor(connector);
  const medium: 'image' | 'video' = connector.kind === 'video' ? 'video' : 'image';
  const hasFirstFrame = medium === 'video' && usedRefs.some((r) => r.role === 'first_frame');
  const sections: Section[] = [];
  const notes: string[] = [];

  if (dir.continuity) {
    const text = continuitySection(dir.continuity, d, !!dir.blocking);
    if (text) sections.push({ id: 'continuity', text, priority: 1 });
  }
  if (dir.blocking) {
    sections.push({ id: 'blocking', priority: 3, text: d.form === 'tags' ? dir.blocking.replace(/^Blocking \([^)]*\):\s*/, '').replace(/\.$/, '') : dir.blocking });
  }
  if (hasFirstFrame) {
    // The frame already carries identity. Re-describing it invites the model to re-synthesise the
    // face; telling it to hold the frame is what keeps the character the same person.
    sections.push({ id: 'hold', priority: 0, text: d.form === 'prose'
      ? 'Hold every face, hairstyle, wardrobe and the light direction exactly as in the first frame.'
      : 'Hold identity, wardrobe and light exactly as first frame.' });
  }
  if (dir.performance?.length) {
    const text = performanceSection(dir.performance, d, medium);
    if (text) sections.push({ id: 'performance', text, priority: 3 });
  }
  if (dir.dialogue?.line && medium === 'video') {
    if (d.nativeAudio) sections.push({ id: 'dialogue', priority: 2, text: `${dir.dialogue.speaker} says: "${dir.dialogue.line}"` });
    else notes.push(`${connector.name} doesn't generate dialogue — the line is directed as performance only; add the voice in post and lip-sync.`);
  }
  if (dir.boardStyle && medium === 'image') sections.push({ id: 'board', priority: 0, text: dir.boardStyle });
  // No negative field on this model → the guards travel in the prompt, phrased as what to keep. They
  // are the first thing cut when space is short: continuity already says the same thing specifically.
  if (dir.continuity && !connector.caps.supportsNegative && !dir.boardStyle && d.form !== 'tags') {
    sections.push({ id: 'guard', priority: 4, text: positiveGuards(dir.continuity) });
  }

  // Fit the budget: drop the least important section first, and say so.
  const sep = d.form === 'tags' ? ', ' : ' ';
  const join = (ss: Section[]) => [base, ...ss.map((s) => s.text)].filter(Boolean).join(d.form === 'tags' ? sep : '\n\n');
  const kept = [...sections];
  const trimmed: string[] = [];
  while (kept.length && join(kept).length > d.maxChars) {
    const worst = kept.reduce((a, b) => (b.priority >= a.priority ? b : a));
    if (worst.priority === 0) break;      // never cut the identity hold or the board style
    kept.splice(kept.indexOf(worst), 1);
    trimmed.push(worst.id);
  }
  for (const id of trimmed) {
    notes.push(`${connector.name} reads about ${d.maxChars} characters — the ${id} direction didn't fit and was left out. Shorten the shot prompt to get it back.`);
  }
  if (join(kept).length > d.maxChars) {
    notes.push(`This prompt runs past what ${connector.name} reads reliably (${d.maxChars} characters) — the end may be ignored.`);
  }

  return {
    prompt: join(kept),
    negatives: dir.continuity && connector.caps.supportsNegative ? continuityNegatives(dir.continuity) : [],
    notes,
    trimmed,
  };
}
