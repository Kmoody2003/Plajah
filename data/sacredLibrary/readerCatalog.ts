import { BOOKS } from '../../services/bibleService';
import { SUTRAS } from './sutras';

export type FaithId = 'christianity' | 'buddhism' | 'islam' | 'judaism' | 'hinduism' | 'sikhism';
export interface SacredWork {
  id: string; faith: FaithId; title: string; sectionLabel: string; sections: number;
  provider: 'quran' | 'sefaria' | 'gita' | 'gurbani' | 'sutra' | 'dhammapada';
  sourceUrl: string; edition: string; coverage: string; language: string;
}
const tanakhOrder = [1,2,3,4,5,6,7,9,10,11,12,23,24,26,28,29,30,31,32,33,34,35,36,37,38,39,19,20,18,22,8,25,21,17,27,15,16,13,14];
export const SACRED_WORKS: SacredWork[] = [
  { id: 'quran', faith: 'islam', title: 'Qur’an', sectionLabel: 'Surah', sections: 114, provider: 'quran',
    sourceUrl: 'https://alquran.cloud/api', edition: 'Marmaduke Pickthall · English translation · 1930',
    coverage: 'All 114 surahs bundled in English. Arabic loads from Al Quran Cloud when requested.', language: 'en' },
  ...tanakhOrder.map(num => BOOKS.find(b => b.num === num)!).map(book => ({
    id: `tanakh-${book.num}`, faith: 'judaism' as const, title: book.name, sectionLabel: 'Chapter', sections: book.chapters,
    provider: 'sefaria' as const, sourceUrl: `https://www.sefaria.org/${book.name.replaceAll(' ', '_')}`,
    edition: 'Sefaria · Hebrew primary edition and JPS 1917 English when available', language: 'he',
    coverage: 'On-demand chapters. Provider titles divide some of the traditional 24 Tanakh books into volumes; these are not a different Jewish canon.',
  })),
  { id: 'bhagavad-gita', faith: 'hinduism', title: 'Bhagavad Gita · The Song Celestial', sectionLabel: 'Chapter', sections: 18,
    provider: 'gita', sourceUrl: 'https://www.gutenberg.org/ebooks/2388', language: 'en',
    edition: 'Sir Edwin Arnold · poetic English rendering · 1885; digitized 1900 edition',
    coverage: 'All 18 chapters bundled. Paragraph numbers are reading locators, not Sanskrit verse numbers. This work is one part of Hindu literature.', },
  { id: 'guru-granth-sahib', faith: 'sikhism', title: 'Sri Guru Granth Sahib Ji', sectionLabel: 'Ang', sections: 1430,
    provider: 'gurbani', sourceUrl: 'https://www.gurbaninow.com/', language: 'pa',
    edition: 'GurbaniNow · Gurmukhi Unicode; provider default English translation',
    coverage: 'On-demand ang pages. Translation attribution is shown as provided; consult the source before republication.', },
  { id: 'dhammapada-complete', faith: 'buddhism', title: 'Dhammapada · complete', sectionLabel: 'Chapter', sections: 26, provider: 'dhammapada',
    sourceUrl: 'https://www.gutenberg.org/ebooks/2017', edition: 'F. Max Müller · English translation · 1881', language: 'en',
    coverage: 'All 423 verses in 26 chapters bundled. This is one work in the Pāli tradition, not the complete Buddhist canon.' },
  ...SUTRAS.map(text => ({ id: text.id, faith: 'buddhism' as const, title: `${text.title} · selected excerpts`, sectionLabel: 'Excerpt section',
    sections: text.chapters.length, provider: 'sutra' as const, sourceUrl: 'https://www.sacred-texts.com/bud/',
    edition: text.translation, coverage: 'Bundled excerpts, not the complete Buddhist canon. Existing edition provenance needs editorial verification.', language: 'en' })),
];

export const worksForFaith = (faith: FaithId) => SACRED_WORKS.filter(work => work.faith === faith);
