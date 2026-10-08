import { familyOf, type ThesaCard } from './types';

/**
 * Structural validation for a card. Used on the way IN (adapters, creator submissions, Aria drafts)
 * so a malformed card can never reach the feed or a stash. Returns every problem, not just the first.
 */
export interface ValidationResult { ok: boolean; errors: string[] }

const BREATH_PATTERNS = ['coherent', 'box', '478', 'physio'];
const GAMES = ['UNSCRAMBLE', 'CLOZE', 'LADDER', 'RHYME', 'CATEGORY'];
const MAX_TEXT = 320;

const str = (v: unknown, min = 1, max = MAX_TEXT) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

export function validateCard(card: ThesaCard): ValidationResult {
  const e: string[] = [];
  const c = card as any;
  if (!str(c?.id, 3, 120)) e.push('id is required (3–120 chars)');
  if (c?.family !== familyOf(c?.kind)) e.push(`family ${c?.family} does not match kind ${c?.kind}`);
  if (!str(c?.topic, 2, 40) || c.topic !== c.topic?.toLowerCase()) e.push('topic must be a lower-case tag');
  if (!str(c?.source?.service, 2, 40) || !str(c?.source?.label, 2, 80)) e.push('source.service and source.label are required');
  if (c?.deeper && !str(c.deeper.view, 2, 60)) e.push('deeper.view must be a non-empty view name');
  if (typeof c?.wellness !== 'boolean') e.push('wellness must be explicit');
  if (typeof c?.kidsSafe !== 'boolean') e.push('kidsSafe must be explicit');
  if (!['DRAFT', 'REVIEW', 'LIVE'].includes(c?.status)) e.push('status must be DRAFT, REVIEW or LIVE');

  const p = c?.payload;
  if (!p || typeof p !== 'object') { e.push('payload is required'); return { ok: false, errors: e }; }

  if (c.family === 'MOMENT') {
    if (typeof c.durationSec !== 'number' || c.durationSec < 10 || c.durationSec > 90) e.push('a Moment needs durationSec between 10 and 90');
  } else if (c.durationSec !== undefined) e.push('only a Moment has durationSec');

  switch (c.kind) {
    case 'FACT':
      if (!str(p.text)) e.push('FACT needs text (≤ 320 chars)');
      if (p.headline !== undefined && !str(p.headline, 1, 120)) e.push('FACT headline too long');
      break;
    case 'PRINCIPLE':
      if (!str(p.text)) e.push('PRINCIPLE needs text (≤ 320 chars)');
      break;
    case 'TECHNIQUE':
      if (!str(p.title, 1, 120)) e.push('TECHNIQUE needs a title');
      if (!Array.isArray(p.steps) || p.steps.length < 2 || p.steps.length > 8 || !p.steps.every((s: unknown) => str(s))) e.push('TECHNIQUE needs 2–8 steps');
      break;
    case 'BREATH':
      if (!BREATH_PATTERNS.includes(p.pattern)) e.push('BREATH needs a known pattern');
      if (c.durationSec !== 30) e.push('BREATH is 30 seconds');
      if (c.wellness !== true) e.push('BREATH must be wellness:true');
      break;
    case 'SKETCH':
      if (!str(p.prompt, 3, 160)) e.push('SKETCH needs a prompt');
      break;
    case 'WORDPLAY': {
      if (!GAMES.includes(p.game)) { e.push('WORDPLAY needs a known game'); break; }
      if (![15, 30].includes(c.durationSec)) e.push('WORDPLAY is 15 or 30 seconds');
      if (p.game === 'UNSCRAMBLE' && !(typeof p.answer === 'string' && /^[A-Za-z]{3,12}$/.test(p.answer))) e.push('UNSCRAMBLE answer must be 3–12 letters');
      if (p.game === 'CLOZE') {
        if (typeof p.text !== 'string' || (p.text.match(/___/g) || []).length !== 1) e.push('CLOZE text needs exactly one ___ blank');
        if (!str(p.answer, 1, 40)) e.push('CLOZE needs an answer');
      }
      if (p.game === 'LADDER' && !(str(p.from, 2, 8) && str(p.to, 2, 8) && p.from.length === p.to.length)) e.push('LADDER words must match in length');
      if (p.game === 'RHYME' && !str(p.word, 2, 20)) e.push('RHYME needs a word');
      if (p.game === 'CATEGORY' && !(str(p.category, 2, 40) && typeof p.letter === 'string' && /^[A-Za-z]$/.test(p.letter))) e.push('CATEGORY needs a category and a single letter');
      break;
    }
    default: e.push(`unknown kind ${c.kind}`);
  }
  return { ok: e.length === 0, errors: e };
}
