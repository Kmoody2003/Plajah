import { get, set, keys } from 'idb-keyval';
import { SUTRAS } from '../data/sacredLibrary/sutras';
import type { SacredWork } from '../data/sacredLibrary/readerCatalog';
import { parseQuran, parseSefaria, parseGurbani, parseArnoldGita, parseDhammapada, type SacredSection } from './sacredReaderCore';
const PREFIX = 'pj.sacred.reader.v1/';
const memory = new Map<string, SacredSection>();
const persisted = new Set<string>();
let quran: Promise<any> | undefined, gita: Promise<string[]> | undefined;
let dhammapada: Promise<ReturnType<typeof parseDhammapada>> | undefined;
export async function fetchSacredJson(url: string, signal?: AbortSignal): Promise<any> {
  const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`The source could not be reached (${response.status}).`);
  return response.json();
}
export async function loadSacredSection(work: SacredWork, section: number, customRef?: string): Promise<{ data: SacredSection; saved: boolean }> {
  if (!Number.isInteger(section) || section < 1 || section > work.sections) throw Error('Choose a valid section number.');
  if (customRef && (work.provider !== 'sefaria' || customRef.length > 160)) throw Error('Choose a valid Jewish text reference.');
  const key = `${PREFIX}${work.id}/${customRef ? encodeURIComponent(customRef) : section}`;
  if (memory.has(key)) {
    if (!persisted.has(key)) { try { await set(key, memory.get(key)!); persisted.add(key); } catch { /* report memory-only */ } }
    return { data: memory.get(key)!, saved: persisted.has(key) };
  }
  try { const cached = await get<SacredSection>(key); if (cached?.segments?.length) { memory.set(key, cached); persisted.add(key); return { data: cached, saved: true }; } } catch { /* memory-only fallback */ }
  let data: SacredSection;
  if (work.provider === 'quran') {
    quran ??= fetchSacredJson('/sacred/quran-pickthall.json').catch(e => { quran = undefined; throw e; });
    const all = await quran;
    data = parseQuran(work, section, all.data.surahs[section - 1]);
  } else if (work.provider === 'gita') {
    gita ??= fetch('/sacred/bhagavad-gita-arnold.txt').then(r => { if (!r.ok) throw Error('The bundled Gita edition is unavailable.'); return r.text(); }).then(parseArnoldGita).catch(e => { gita = undefined; throw e; });
    const chapters = await gita;
    data = { workId: work.id, section, title: `Bhagavad Gita · Chapter ${section}`, edition: work.edition,
      sourceUrl: work.sourceUrl, rights: 'Public domain in the United States. Project Gutenberg #2388; full source file includes the Project Gutenberg license.',
      segments: chapters[section - 1].split(/\r?\n\s*\r?\n/).filter(p => p.trim()).map((p, i) => ({ id: String(i + 1), locator: `Chapter ${section} · paragraph ${i + 1}`, text: p.trim() })), };
  } else if (work.provider === 'dhammapada') {
    dhammapada ??= fetch('/sacred/dhammapada-muller.txt').then(r => { if (!r.ok) throw Error('The bundled Dhammapada edition is unavailable.'); return r.text(); }).then(parseDhammapada).catch(e => { dhammapada = undefined; throw e; });
    const chapter = (await dhammapada)[section - 1];
    data = { workId: work.id, section, title: `Dhammapada · ${section} · ${chapter.title}`, edition: work.edition,
      sourceUrl: work.sourceUrl, rights: 'Public domain in the United States. Project Gutenberg #2017; full source file includes the Project Gutenberg license.', segments: chapter.verses };
  } else if (work.provider === 'sefaria') {
    const ref = customRef || `${work.title}.${section}`;
    const url = new URL(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}`);
    url.searchParams.append('version', 'hebrew');
    url.searchParams.append('version', 'english|The Holy Scriptures: A New Translation (JPS 1917)');
    let raw = await fetchSacredJson(url.toString());
    if (customRef && !raw.versions?.some((v: any) => v.actualLanguage === 'en')) {
      const reusable = raw.available_versions?.find((v: any) => v.language === 'en' && ['Public Domain', 'CC0', 'CC-BY', 'CC-BY-SA'].includes(v.license));
      if (reusable) { url.searchParams.delete('version'); url.searchParams.append('version', 'hebrew'); url.searchParams.append('version', `english|${reusable.versionTitle}`); raw = await fetchSacredJson(url.toString()); }
    }
    data = parseSefaria(work, section, raw);
  } else if (work.provider === 'gurbani') {
    data = parseGurbani(work, section, await fetchSacredJson(`https://api.gurbaninow.com/v2/ang/${section}/1`));
  } else {
    const text = SUTRAS.find(t => t.id === work.id)!;
    const chapter = text.chapters[section - 1];
    data = { workId: work.id, section, title: `${text.title} · ${chapter.title}`, edition: text.translation,
      sourceUrl: work.sourceUrl, rights: 'Bundled excerpt; edition attribution supplied by the existing Sacred Library catalog.',
      segments: chapter.verses.map(v => ({ id: v.n, locator: `${text.title} · ${v.n}`, text: v.text })), };
  }
  memory.set(key, data);
  try { await set(key, data); persisted.add(key); return { data, saved: true }; } catch { return { data, saved: false }; }
}
export async function cachedSacredSections(work?: SacredWork): Promise<SacredSection[]> {
  const prefix = work ? `${PREFIX}${work.id}/` : PREFIX;
  try { for (const key of await keys()) if (typeof key === 'string' && key.startsWith(prefix) && !memory.has(key)) {
    const value = await get<SacredSection>(key); if (value?.segments?.length) memory.set(key, value);
  } } catch { /* current session remains searchable */ }
  return [...memory.entries()].filter(([key]) => key.startsWith(prefix)).map(([, data]) => data);
}
