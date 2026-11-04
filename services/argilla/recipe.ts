/**
 * recipe.ts — a prompt becomes clay through the same stamps a person would make.
 *
 * A recipe is a short list of primitive stamps, so what a prompt produces is ordinary clay: every
 * part can be pushed, cut or smoothed afterwards. An on-device model writes recipes in the desktop
 * app. Everywhere else the built-in starters answer, and the result says which one was used.
 */

import { nativeLlmChat, isWindowsApp } from '../windowsBridgeService';
import type { Vec3 } from './engine';
import type { ClayPart } from './bake';

export type RecipePart = ClayPart;

export interface ClayRecipe {
  name: string;
  parts: RecipePart[];
}

const add = (a: Vec3, ra: number, blend = 0.06, b?: Vec3, rb?: number, mirror = false): RecipePart =>
  ({ op: 'add', a, ra, b, rb, blend, mirror });
const cut = (a: Vec3, ra: number, blend = 0.03, b?: Vec3, rb?: number, mirror = false): RecipePart =>
  ({ op: 'carve', a, ra, b, rb, blend, mirror });

export const CLAY_STARTERS: { id: string; label: string; words: RegExp; recipe: ClayRecipe }[] = [
  {
    id: 'ball', label: 'Ball of clay', words: /\b(ball|sphere|blob|clay)\b/i,
    recipe: { name: 'Ball of clay', parts: [add([0, 0, 0], 0.5)] },
  },
  {
    id: 'head', label: 'Head', words: /\b(head|face|bust|portrait|skull|man|woman|person|king|queen|wizard|elf|old)\b/i,
    recipe: {
      name: 'Head',
      parts: [
        add([0, 0.18, 0], 0.36, 0.1),
        add([0, -0.02, 0.1], 0.26, 0.14, [0, -0.2, 0.14], 0.17),
        add([0, -0.42, -0.06], 0.15, 0.1, [0, -0.72, -0.1], 0.2),
        cut([0.13, 0.08, 0.36], 0.07, 0.05, undefined, undefined, true),
        add([0.13, 0.08, 0.29], 0.055, 0.015, undefined, undefined, true),
        add([0, 0.1, 0.36], 0.035, 0.05, [0, -0.04, 0.42], 0.055),
        add([0, -0.19, 0.3], 0.08, 0.04, [0.08, -0.19, 0.28], 0.035, true),
        add([0.35, 0.03, -0.02], 0.05, 0.03, [0.37, -0.1, 0], 0.035, true),
      ],
    },
  },
  {
    id: 'figure', label: 'Standing figure', words: /\b(figure|body|character|hero|warrior|human|statue|robot)\b/i,
    recipe: {
      name: 'Standing figure',
      parts: [
        add([0, 0.68, 0], 0.13, 0.03),
        add([0, 0.5, 0], 0.05, 0.03, [0, 0.42, 0], 0.07),
        add([0, 0.34, 0], 0.17, 0.08, [0, -0.02, 0], 0.13),
        add([0.17, 0.36, 0], 0.07, 0.05, [0.3, 0.08, 0.02], 0.045, true),
        add([0.3, 0.08, 0.02], 0.045, 0.03, [0.35, -0.18, 0.07], 0.04, true),
        add([0.09, -0.08, 0], 0.09, 0.05, [0.11, -0.45, 0.02], 0.06, true),
        add([0.11, -0.45, 0.02], 0.06, 0.03, [0.12, -0.8, 0], 0.045, true),
        add([0.12, -0.84, 0.04], 0.045, 0.02, [0.12, -0.86, 0.12], 0.04, true),
      ],
    },
  },
  {
    id: 'creature', label: 'Four-legged creature', words: /\b(creature|animal|dog|cat|wolf|horse|beast|dragon|lion|bear|monster|fox)\b/i,
    recipe: {
      name: 'Four-legged creature',
      parts: [
        add([0, 0.08, -0.32], 0.2, 0.08, [0, 0.12, 0.26], 0.22),
        add([0, 0.2, 0.38], 0.1, 0.07, [0, 0.42, 0.56], 0.08),
        add([0, 0.44, 0.6], 0.14, 0.05),
        add([0, 0.38, 0.74], 0.07, 0.05, [0, 0.36, 0.86], 0.045),
        add([0.08, 0.56, 0.54], 0.04, 0.03, [0.1, 0.68, 0.5], 0.012, true),
        add([0.13, 0, 0.26], 0.07, 0.05, [0.15, -0.5, 0.28], 0.04, true),
        add([0.13, 0, -0.32], 0.08, 0.05, [0.15, -0.5, -0.36], 0.04, true),
        add([0, 0.16, -0.46], 0.05, 0.05, [0, 0.3, -0.82], 0.015),
      ],
    },
  },
  {
    id: 'vase', label: 'Vase', words: /\b(vase|pot|jar|urn|bowl|cup|mug|bottle)\b/i,
    recipe: {
      name: 'Vase',
      parts: [
        add([0, -0.28, 0], 0.34, 0.1, [0, 0.12, 0], 0.26),
        add([0, 0.2, 0], 0.15, 0.1, [0, 0.62, 0], 0.15),
        cut([0, 0.32, 0], 0.09, 0.02, [0, 0.9, 0], 0.11),
        cut([0, -0.2, 0], 0.2, 0.05, [0, 0.2, 0], 0.07),
      ],
    },
  },
  {
    id: 'tree', label: 'Tree', words: /\b(tree|oak|plant|forest|bonsai)\b/i,
    recipe: {
      name: 'Tree',
      parts: [
        add([0, -0.82, 0], 0.17, 0.08, [0, -0.1, 0], 0.08),
        add([0, -0.15, 0], 0.07, 0.04, [0.3, 0.2, 0.05], 0.03, true),
        add([0, 0.28, 0.02], 0.34, 0.14),
        add([0.32, 0.26, 0.06], 0.26, 0.14, undefined, undefined, true),
        add([0.04, 0.54, -0.08], 0.24, 0.14),
      ],
    },
  },
];

export function starterForPrompt(prompt: string): { recipe: ClayRecipe; matched: boolean } {
  const hit = CLAY_STARTERS.find((s) => s.words.test(prompt));
  return hit ? { recipe: hit.recipe, matched: true } : { recipe: CLAY_STARTERS[0].recipe, matched: false };
}

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
};

const vec = (v: unknown): Vec3 | null => {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const parts = v.map((c) => num(c, -0.95, 0.95));
  return parts.every((c) => c !== null) ? (parts as Vec3) : null;
};

/** A model's answer is untrusted text: keep only well-formed parts, inside the clay's bounds. */
export function parseRecipe(text: string, name: string): ClayRecipe | null {
  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open < 0 || close <= open) return null;
  let raw: any;
  try { raw = JSON.parse(text.slice(open, close + 1)); } catch { return null; }
  if (!Array.isArray(raw?.parts)) return null;
  const parts: RecipePart[] = [];
  for (const p of raw.parts.slice(0, 40)) {
    const a = vec(p?.a);
    const ra = num(p?.ra, 0.012, 0.7);
    if (!a || ra === null) continue;
    const b = p?.b === undefined || p?.b === null ? undefined : vec(p.b) ?? undefined;
    parts.push({
      op: p?.op === 'carve' ? 'carve' : 'add',
      a,
      ra,
      b,
      rb: b ? num(p?.rb, 0.012, 0.7) ?? ra : undefined,
      blend: num(p?.blend, 0, 0.25) ?? 0.05,
      mirror: !!p?.mirror,
    });
  }
  return parts.length ? { name, parts } : null;
}

const RECIPE_SYSTEM = `You block out 3D forms for a sculptor using tapered capsules of clay.
Space: x right, y up, z toward the viewer, all within -0.9 to 0.9. Reply with JSON only:
{"parts":[{"op":"add","a":[x,y,z],"ra":r,"b":[x,y,z],"rb":r,"blend":0.05,"mirror":false}]}
"b" and "rb" are optional; without them the part is a sphere. "op" may be "carve" to cut away.
"mirror" repeats the part on the other side of x=0. "blend" is how softly it melts in, 0 to 0.2.
Use 6 to 24 parts, big masses first, then secondary forms. Keep it a clean block-out with no fine detail.`;

export interface PromptResult {
  recipe: ClayRecipe;
  /** Plain words for the UI about where this form came from. */
  source: string;
}

export async function recipeFromPrompt(prompt: string): Promise<PromptResult> {
  if (isWindowsApp()) {
    try {
      const reply = await nativeLlmChat(
        [{ role: 'system', content: RECIPE_SYSTEM }, { role: 'user', content: prompt }],
        { maxTokens: 900, temperature: 0.4, timeoutMs: 120_000 },
      );
      const recipe = parseRecipe(reply.text ?? '', prompt.slice(0, 60));
      if (recipe) return { recipe, source: 'Blocked out by the on-device model.' };
    } catch { /* fall through to the starters */ }
  }
  const { recipe, matched } = starterForPrompt(prompt);
  return {
    recipe,
    source: matched
      ? `Started from the built-in ${recipe.name.toLowerCase()} form.`
      : 'No form matched those words, so this is a plain ball of clay.',
  };
}
