import type { SacredWork } from '../data/sacredLibrary/readerCatalog';

export interface SacredSegment { id: string; locator: string; text: string; original?: string; transliteration?: string; }
export interface SacredSection {
  workId: string; section: number; title: string; edition: string; sourceUrl: string;
  rights: string; segments: SacredSegment[]; originalLanguage?: string; originalDirection?: 'rtl' | 'ltr';
}
const str = (v: unknown) => typeof v === 'string' ? v : '';
/** Provider HTML is never rendered as executable markup. */
export function plainText(value: unknown): string {
  return str(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => {
      const point = Number(n); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }).trim();
}
export function parseQuran(work: SacredWork, section: number, raw: any): SacredSection {
  const data = raw?.data ?? raw;
  if (data?.number !== section || !Array.isArray(data?.ayahs) || !data.ayahs.length) throw Error('The source returned a different or empty surah.');
  return { workId: work.id, section, title: `${section} · ${str(data.englishName)} · ${str(data.englishNameTranslation)}`,
    edition: work.edition, sourceUrl: `https://api.alquran.cloud/v1/surah/${section}/en.pickthall`, rights: 'Pickthall translation · public domain in the United States; provided by Al Quran Cloud.',
    segments: data.ayahs.map((a: any) => ({ id: String(a.numberInSurah), locator: `${section}:${a.numberInSurah}`, text: str(a.text) })), };
}
export function parseSefaria(work: SacredWork, section: number, raw: any): SacredSection {
  if (raw?.error || !Array.isArray(raw?.versions)) throw Error('This Jewish text reference is unavailable from Sefaria.');
  const versions = raw.versions;
  const en = versions.find((v: any) => v.actualLanguage === 'en' || v.language === 'en' || v.languageFamilyName === 'english' || v.language === 'english');
  const he = versions.find((v: any) => v.actualLanguage === 'he' || v.language === 'he' || v.languageFamilyName === 'hebrew' || v.language === 'hebrew');
  const flatten = (v: any): string[] => Array.isArray(v?.text) ? v.text.flat(Infinity).map(plainText) : v?.text ? [plainText(v.text)] : [];
  const english = flatten(en), hebrew = flatten(he);
  if (!english.length && !hebrew.length) throw Error('No text is available in the requested editions.');
  return { workId: work.id, section, title: str(raw.ref) || `${work.title} ${section}`,
    edition: versions.map((v: any) => str(v.versionTitle)).filter(Boolean).join(' · '),
    rights: versions.map((v: any) => `${str(v.versionTitle)}: ${str(v.license) || 'rights not specified'}${str(v.versionSource) ? ` · edition source: ${str(v.versionSource)}` : ''}`).join('; '),
    sourceUrl: `https://www.sefaria.org/${encodeURIComponent(str(raw.ref) || `${work.title}.${section}`)}`,
    originalLanguage: 'he', originalDirection: 'rtl',
    segments: Array.from({ length: Math.max(english.length, hebrew.length) }, (_, i) => ({
      id: String(i + 1), locator: `${str(raw.ref) || `${work.title} ${section}`} · segment ${i + 1}`,
      text: english[i] || '', original: hebrew[i] || undefined,
    })), };
}
export function parseGurbani(work: SacredWork, section: number, raw: any): SacredSection {
  if (raw?.pageno !== section || !Array.isArray(raw.page) || !raw.page.length || raw.source?.id !== 1) throw Error('The source returned an unexpected Gurbani page.');
  return { workId: work.id, section, title: `Sri Guru Granth Sahib Ji · Ang ${section}`,
    edition: work.edition, sourceUrl: `https://api.gurbaninow.com/v2/ang/${section}/1`, originalLanguage: 'pa', originalDirection: 'ltr',
    rights: 'Text and default English translation supplied by GurbaniNow. Translator and reuse rights are not specified in the page response.',
    segments: raw.page.map(({ line }: any, i: number) => ({ id: str(line.id) || String(i + 1), locator: `Ang ${section} · line ${i + 1} · ${str(line.id)}`,
      text: plainText(line.translation?.english?.default), original: str(line.gurmukhi?.unicode),
      transliteration: str(line.transliteration?.english?.text), })), };
}
export function parseArnoldGita(text: string): string[] {
  const body = text.split(/\*\*\* END OF THE PROJECT GUTENBERG EBOOK/)[0];
  const headings = [...body.matchAll(/^\s*CHAPTER ([IVX]+)\s*$/gm)];
  if (headings.length !== 18) throw Error('The Gita edition does not contain all 18 expected chapters.');
  return headings.map((match, i) => body.slice(match.index! + match[0].length, headings[i + 1]?.index ?? body.length)
    .split(/\s+HERE ENDS?ETH? CHAPTER|\s+HERE ENDETH CHAPTER|\s+HERE ENDS CHAPTER/)[0].trim());
}
export function parseDhammapada(text: string): { title: string; verses: SacredSegment[] }[] {
  const body = text.split(/\*\*\* END OF THE PROJECT GUTENBERG EBOOK/)[0];
  const headings = [...body.matchAll(/^Chapter ([IVX]+)\. ([^\r\n]+)$/gm)];
  if (headings.length !== 26) throw Error('The Dhammapada edition does not have all 26 expected chapters.');
  const chapters = headings.map((heading, i) => {
    const chunk = body.slice(heading.index! + heading[0].length, headings[i + 1]?.index ?? body.length);
    const starts = [...chunk.matchAll(/^(\d+)(?:, (\d+))?\. /gm)];
    return { title: heading[2], verses: starts.map((match, j) => ({ id: match[2] ? `${match[1]}-${match[2]}` : match[1], locator: `Dhammapada ${match[2] ? `${match[1]}–${match[2]}` : match[1]}`,
      text: chunk.slice(match.index! + match[0].length, starts[j + 1]?.index ?? chunk.length).trim() })) };
  });
  const verseNumbers = chapters.flatMap(c => c.verses).flatMap(verse => {
    const [first, last] = verse.id.split('-').map(Number);
    return Array.from({ length: (last ?? first) - first + 1 }, (_, i) => first + i);
  });
  if (verseNumbers.length !== 423 || verseNumbers.some((verse, i) => verse !== i + 1)) throw Error('The Dhammapada verse sequence is incomplete.');
  return chapters;
}
