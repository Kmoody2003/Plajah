import { parseRef, type ScriptureRef } from './scriptureRef';
export type LexiconId = 'strongsgreek' | 'strongshebrew';
export interface LexiconEntry { id: string; key: string; text: string; aliases: string[]; see_also?: { id: string; key: string }[]; }
export interface LexiconData { dictionary: LexiconId; name: string; entries: LexiconEntry[]; }
const loaded = new Map<LexiconId, Promise<LexiconData>>();
export function loadLexicon(id: LexiconId): Promise<LexiconData> {
  let task = loaded.get(id);
  if (!task) {
    task = fetch(`/sacred/lexicons/${id}.json`).then(async r => {
      if (!r.ok) throw Error('The bundled dictionary could not be loaded.');
      const raw = await r.json();
      if (raw.dictionary !== id || !Array.isArray(raw.entries)) throw Error('Unexpected dictionary edition.');
      return raw as LexiconData;
    }).catch(e => { loaded.delete(id); throw e; });
    loaded.set(id, task);
  }
  return task;
}
export function normalizeStrongToken(value: string, dictionary: LexiconId): string | null {
  const match = value.trim().match(/^([GH])?0*(\d+)$/i);
  if (!match || Number(match[2]) < 1) return null;
  const prefix = dictionary === 'strongsgreek' ? 'G' : 'H';
  if (match[1] && match[1].toUpperCase() !== prefix) return null;
  return `${prefix}${prefix === 'H' ? '0' : ''}${Number(match[2])}`;
}
const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function searchLexicon(data: LexiconData, query: string): LexiconEntry[] {
  if (!query.trim()) return [];
  const strong = normalizeStrongToken(query, data.dictionary);
  if (strong) return data.entries.filter(e => e.id === strong);
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return data.entries.filter(e => terms.every(term => normalize(e.text).includes(term)));
}
export function lexiconScriptureRefs(entry: LexiconEntry): ScriptureRef[] {
  // Source dictionary references are plain text; use the platform's validated reference parser.
  const candidates = entry.text.match(/(?:[1-3]\s+)?[A-Z][a-z]+\.?\s+\d+:\d+(?:-\d+)?/g) ?? [];
  return candidates.map(text => parseRef(text)).filter((ref): ref is ScriptureRef => !!ref);
}
