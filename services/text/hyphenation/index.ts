// hyphenation — load TeX hyph-utf8 patterns into the engine on demand.
//
// Patterns are assets (patterns/<lang>.pat.txt, licence header kept inside each file), not code,
// so a language costs nothing until a paragraph tagged with it is composed. Adding a language:
// drop `<tag>.pat.txt` (+ optional `.hyp.txt`) from hyph-utf8 with a permissive licence into
// patterns/ and list it in LANGS with its typesetting hyphenmins.

import type { TextEngine } from '../engine/wasm';

export interface HyphLang { id: number; file: string; left: number; right: number; exceptions?: boolean }

/** BCP 47 primary tags → pattern sets. Ids are engine-local handles. */
export const LANGS: Record<string, HyphLang> = {
  'en': { id: 0, file: 'en-us', left: 2, right: 3, exceptions: true },
  'en-us': { id: 0, file: 'en-us', left: 2, right: 3, exceptions: true },
  'de': { id: 1, file: 'de', left: 2, right: 2 },
  'es': { id: 2, file: 'es', left: 2, right: 2 },
  'fr': { id: 3, file: 'fr', left: 2, right: 2 },
  'pt': { id: 4, file: 'pt', left: 2, right: 3, exceptions: true },
  'it': { id: 5, file: 'it', left: 2, right: 2 },
  'nl': { id: 6, file: 'nl', left: 2, right: 2, exceptions: true },
};

export function hyphLangFor(lang: string | undefined): HyphLang | undefined {
  const l = (lang || 'en').toLowerCase();
  return LANGS[l] ?? LANGS[l.split('-')[0]];
}

async function readAsset(name: string): Promise<string> {
  const url = new URL(`./patterns/${name}`, import.meta.url);
  if (url.protocol === 'file:') {
    const spec = 'node:fs/promises';
    const fs = await import(/* @vite-ignore */ spec) as typeof import('node:fs/promises');
    return fs.readFile(url, 'utf8');
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`hyphenation ${name}: HTTP ${r.status}`);
  return r.text();
}

const loaded = new WeakMap<TextEngine, Map<number, Promise<boolean>>>();
const ready = new WeakMap<TextEngine, Set<number>>();

/** Ensure the patterns for `lang` are in `engine`. Resolves to the engine lang id, or undefined. */
export async function ensureHyphenation(engine: TextEngine, lang: string | undefined): Promise<number | undefined> {
  const h = hyphLangFor(lang);
  if (!h) return undefined;
  let m = loaded.get(engine);
  if (!m) loaded.set(engine, (m = new Map()));
  let p = m.get(h.id);
  if (!p) {
    p = (async () => {
      const pat = await readAsset(`${h.file}.pat.txt`);
      const exc = h.exceptions ? await readAsset(`${h.file}.hyp.txt`).catch(() => '') : '';
      const ok = engine.loadHyphenation(h.id, pat, exc, h.left, h.right) > 0;
      if (ok) { let r = ready.get(engine); if (!r) ready.set(engine, (r = new Set())); r.add(h.id); }
      return ok;
    })();
    m.set(h.id, p);
  }
  return (await p) ? h.id : undefined;
}

/** Synchronous check used by layout: id if already loaded. */
export function hyphenationReady(engine: TextEngine, lang: string | undefined): number | undefined {
  const h = hyphLangFor(lang);
  if (!h) return undefined;
  return ready.get(engine)?.has(h.id) ? h.id : undefined;
}
