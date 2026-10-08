/**
 * Lesson "folio": a deterministic parse of plain lesson text into designed blocks. No lesson is edited.
 * Council synthesis: LEAD = the well-made page (book typography, structural callouts), COUNTERPOINT = one timed moment of
 * light, EDITOR = nothing unearned (at most one emphasised callout; ornament only where it marks structure).
 */
export type CalloutKind = 'worked' | 'why' | 'example' | 'trap' | 'try';
export type BulletMarker = 'auto' | 'dot' | 'dash' | 'arrow' | 'check' | 'star' | 'number';
export interface Block { kind: 'lede' | 'body' | 'callout' | 'list'; variant?: CalloutKind; label?: string; text: string; index: number; section: number; emphasised?: boolean; items?: string[]; marker?: BulletMarker }

const LIST_LINE = /^\s*([-*•+>]|\d{1,2}[.)])\s+(.+)$/;
const MARK_OF = (m: string): BulletMarker => m === '-' ? 'auto' : m === '•' ? 'dot' : m === '*' ? 'star' : m === '>' ? 'arrow' : m === '+' ? 'check' : 'number';
/** A paragraph is a list when two or more of its lines start with a marker (- * • + > or 1.). A plain line before the list is its lead-in. */
export function matchList(paragraph: string): { intro: string; items: string[]; marker: BulletMarker } | null {
  const lines = paragraph.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
  const first = lines.findIndex(l => LIST_LINE.test(l));
  if (first < 0 || first > 1) return null;
  const rest = lines.slice(first), hits = rest.map(l => LIST_LINE.exec(l));
  if (hits.filter(Boolean).length < 2) return null;
  const items: string[] = [];
  hits.forEach((h, i) => { if (h) items.push(h[2].trim()); else if (items.length) items[items.length - 1] += ' ' + rest[i].trim(); });
  return { intro: first ? lines[0].trim() : '', items, marker: MARK_OF(hits[0]![1]) };
}

const PREFIXES: Array<[RegExp, CalloutKind, string]> = [
  [/^(a )?worked (example|examples|contrast)\s*:\s*/i, 'worked', 'Worked example'],
  [/^why it (matters|mattered)\s*:\s*/i, 'why', 'Why it matters'],
  [/^(everyday )?(example|analogy|relevance)\s*:\s*/i, 'example', 'Example'],
  [/^(trap|traps|common traps|a caution|caution|important)\s*:\s*/i, 'trap', 'Careful'],
  [/^try this\s*:\s*/i, 'try', 'Try this'],
];

/** The prefix each kind of callout is written with, and how a paragraph is recognised as one. Used by the teacher editor too. */
export const CALLOUT_PREFIX: Record<CalloutKind, string> = { worked: 'Worked example: ', why: 'Why it matters: ', trap: 'Trap: ', try: 'Try this: ', example: 'Example: ' };
export function matchCallout(paragraph: string): { variant: CalloutKind; rest: string } | null {
  for (const [re, variant] of PREFIXES) if (re.test(paragraph)) return { variant, rest: paragraph.replace(re, '').trim() };
  return null;
}

const words = (s: string) => (s.match(/\S+/g) || []).length;

/** Split into blocks; the first plain paragraph is the lede; a section break is marked roughly every 110 words. */
export function parseFolio(body: string): { blocks: Block[]; minutes: number; wordCount: number } {
  const paras = (body || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const blocks: Block[] = [];
  let sinceBreak = 0, section = 0, ledeDone = false, emphasisUsed = false;
  paras.forEach((p, index) => {
    const list = matchList(p);
    if (list) {
      if (sinceBreak >= 110 && ledeDone) { section++; sinceBreak = 0; }
      if (list.intro) { blocks.push({ kind: ledeDone ? 'body' : 'lede', text: list.intro, index, section }); ledeDone = true; }
      blocks.push({ kind: 'list', text: list.items.join('\n'), items: list.items, marker: list.marker, index, section });
      sinceBreak += words(p);
      return;
    }
    let hit: [RegExp, CalloutKind, string] | undefined;
    for (const h of PREFIXES) if (h[0].test(p)) { hit = h; break; }
    if (hit) {
      const stripped = p.replace(hit[0], '').trim();
      const text = stripped.charAt(0).toUpperCase() + stripped.slice(1);
      // One emphasised moment per lesson: the first "Why it matters", otherwise none.
      const emphasised = hit[1] === 'why' && !emphasisUsed; if (emphasised) emphasisUsed = true;
      blocks.push({ kind: 'callout', variant: hit[1], label: hit[2], text, index, section, emphasised });
      sinceBreak += words(text);
      return;
    }
    if (sinceBreak >= 110 && ledeDone) { section++; sinceBreak = 0; }
    blocks.push({ kind: ledeDone ? 'body' : 'lede', text: p, index, section });
    ledeDone = true; sinceBreak += words(p);
  });
  const wordCount = paras.reduce((a, p) => a + words(p), 0);
  return { blocks, minutes: Math.max(1, Math.round(wordCount / 180)), wordCount };
}

/** Stable 32-bit hash so each lesson gets its own, but never a changing, hand-made look. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const seeded = (seed: number, n: number): number => { let s = (seed + n * 374761393) >>> 0; s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0; return ((s ^ (s >>> 16)) >>> 0) / 4294967296; };

/** A pen-drawn rule: the stroke wobbles by a lesson-seeded amount, the same every visit. */
export function wobblyRule(seed: number, width = 600, steps = 12, amp = 1.1): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) pts.push(`${i === 0 ? 'M' : 'L'}${((width * i) / steps).toFixed(1)} ${(2 + (seeded(seed, i) - 0.5) * 2 * amp).toFixed(2)}`);
  return pts.join(' ');
}

export type Band = 'early' | 'elementary' | 'middle' | 'adult';
export const SCALE: Record<Band, { px: number; measure: string; lead: number }> = {
  early: { px: 24, measure: '44ch', lead: 1.8 }, elementary: { px: 20, measure: '52ch', lead: 1.7 },
  middle: { px: 18, measure: '62ch', lead: 1.65 }, adult: { px: 17.5, measure: '64ch', lead: 1.65 },
};
