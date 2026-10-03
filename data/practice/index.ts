/** Practice-question banks, loaded on demand (one chunk per curriculum). */
import type { QuestionBank } from './types';
import { balanceBank } from './balance';

const LOADERS: Record<string, () => Promise<QuestionBank>> = {
  'civics-hall': () => import('./civics-hall').then(m => m.CIVICS_BANK),
  'econ-school': () => import('./econ-school').then(m => m.ECON_BANK),
  'money-school': () => import('./money-school').then(m => m.MONEY_BANK),
  'philosophy-school': () => import('./philosophy-school').then(m => m.PHILOSOPHY_BANK),
  'real-estate-school': () => import('./real-estate-school').then(m => m.REAL_ESTATE_BANK),
  'film-school': () => import('./film-school').then(m => m.FILM_BANK),
  'photo-art-school': () => import('./photo-art-school').then(m => m.PHOTO_ART_BANK),
  'chora-history': () => import('./chora-history').then(m => m.CHORA_BANK),
  'history-sentences': () => Promise.all([import('./history-sentences'), import('./history-sentences-sports')]).then(([a, b]) => ({ ...a.HISTORY_SENTENCE_BANK, questions: [...a.HISTORY_SENTENCE_BANK.questions, ...b.HISTORY_SENTENCES_SPORTS] })),
  'young-entrepreneurs': () => import('./young-entrepreneurs').then(m => m.YOUNG_ENT_BANK),
  'art-masters': () => import('./courses/art-masters').then(m => m.COURSE_MODULE.bank),
  'film-history': () => import('./courses/film-history').then(m => m.COURSE_MODULE.bank),
  'hq-quest': () => import('./courses/hq-quest').then(m => m.COURSE_MODULE.bank),
  'lab-archaeology': () => import('./courses/lab-archaeology').then(m => m.COURSE_MODULE.bank),
  'lab-architecture': () => import('./courses/lab-architecture').then(m => m.COURSE_MODULE.bank),
  'lab-astronomy': () => import('./courses/lab-astronomy').then(m => m.COURSE_MODULE.bank),
  'lab-biology': () => import('./courses/lab-biology').then(m => m.COURSE_MODULE.bank),
  'lab-chemistry': () => import('./courses/lab-chemistry').then(m => m.COURSE_MODULE.bank),
  'lab-cs': () => import('./courses/lab-cs').then(m => m.COURSE_MODULE.bank),
  'lab-data': () => import('./courses/lab-data').then(m => m.COURSE_MODULE.bank),
  'lab-earth': () => import('./courses/lab-earth').then(m => m.COURSE_MODULE.bank),
  'lab-engineering': () => import('./courses/lab-engineering').then(m => m.COURSE_MODULE.bank),
  'lab-environment': () => import('./courses/lab-environment').then(m => m.COURSE_MODULE.bank),
  'lab-history': () => import('./courses/lab-history').then(m => m.COURSE_MODULE.bank),
  'lab-mathematics': () => import('./courses/lab-mathematics').then(m => m.COURSE_MODULE.bank),
  'lab-networks': () => import('./courses/lab-networks').then(m => m.COURSE_MODULE.bank),
  'lab-neuroscience': () => import('./courses/lab-neuroscience').then(m => m.COURSE_MODULE.bank),
  'lab-physics': () => import('./courses/lab-physics').then(m => m.COURSE_MODULE.bank),
  'music-figures': () => import('./courses/music-figures').then(m => m.COURSE_MODULE.bank),
  'sports-history': () => import('./courses/sports-history').then(m => m.COURSE_MODULE.bank),
  'lab-combat': () => import('./courses/lab-combat').then(m => m.COURSE_MODULE.bank),
  'botany-forest': () => import('./courses/botany-forest').then(m => m.COURSE_MODULE.bank),
  'comic-history': () => import('./courses/comic-history').then(m => m.COURSE_MODULE.bank),
  'founding-documents': () => import('./courses/founding-documents').then(m => m.COURSE_MODULE.bank),
  'music-theory': () => import('./courses/music-theory').then(m => m.COURSE_MODULE.bank),
  'graphic-design': () => import('./courses/graphic-design').then(m => m.COURSE_MODULE.bank),
  'audio-engineering': () => import('./courses/audio-engineering').then(m => m.COURSE_MODULE.bank),
  'film-directing': () => import('./courses/film-directing').then(m => m.COURSE_MODULE.bank),
  'film-producing': () => import('./courses/film-producing').then(m => m.COURSE_MODULE.bank),
  'art-movements-classical': () => import('./courses/art-movements-classical').then(m => m.COURSE_MODULE.bank),
  'art-movements-modern': () => import('./courses/art-movements-modern').then(m => m.COURSE_MODULE.bank),
  'music-genres': () => import('./courses/music-genres').then(m => m.COURSE_MODULE.bank),
  'lit-studies-modern': () => import('./courses/lit-studies-modern').then(m => m.COURSE_MODULE.bank),
  'history-north-america': () => import('./courses/history-north-america').then(m => m.COURSE_MODULE.bank),
  'history-south-america': () => import('./courses/history-south-america').then(m => m.COURSE_MODULE.bank),
  'history-europe': () => import('./courses/history-europe').then(m => m.COURSE_MODULE.bank),
  'history-asia': () => import('./courses/history-asia').then(m => m.COURSE_MODULE.bank),
  'history-arab-world': () => import('./courses/history-arab-world').then(m => m.COURSE_MODULE.bank),
  'world-mythology': () => import('./courses/world-mythology').then(m => m.COURSE_MODULE.bank),
  'color-theory': () => import('./courses/color-theory').then(m => m.COURSE_MODULE.bank),
  'lighting-design': () => import('./courses/lighting-design').then(m => m.COURSE_MODULE.bank),
  'design-movements': () => import('./courses/design-movements').then(m => m.COURSE_MODULE.bank),
  'film-genres': () => import('./courses/film-genres').then(m => m.COURSE_MODULE.bank),
  'lit-studies-early': () => import('./courses/lit-studies-early').then(m => m.COURSE_MODULE.bank),
  'entertainment-finance': () => import('./courses/entertainment-finance').then(m => m.COURSE_MODULE.bank),
  'music-theory-early': () => import('./courses/music-theory-early').then(m => m.COURSE_MODULE.bank),
  'music-theory-elementary': () => import('./courses/music-theory-elementary').then(m => m.COURSE_MODULE.bank),
  'music-theory-secondary': () => import('./courses/music-theory-secondary').then(m => m.COURSE_MODULE.bank),
  'music-theory-college': () => import('./courses/music-theory-college').then(m => m.COURSE_MODULE.bank),
  'music-history-eras': () => import('./courses/music-history-eras').then(m => m.COURSE_MODULE.bank),
  'theatre-scripts': () => import('./courses/theatre-scripts').then(m => m.COURSE_MODULE.bank),
  'thinking-methods': () => import('./courses/thinking-methods').then(m => m.COURSE_MODULE.bank),
  'world-religions': () => import('./courses/world-religions').then(m => m.COURSE_MODULE.bank),
  'film-business': () => import('./courses/film-business').then(m => m.COURSE_MODULE.bank),
  'ip-protection': () => import('./courses/ip-protection').then(m => m.COURSE_MODULE.bank),
  'music-business': () => import('./courses/music-business').then(m => m.COURSE_MODULE.bank),
  'publishing-business': () => import('./courses/publishing-business').then(m => m.COURSE_MODULE.bank),
  'classic-literature': () => import('../languageArtsClassics').then(m => ({ curriculumId: 'classic-literature', questions: m.CLASSIC_QUESTIONS })),
};

LOADERS['law-prek2'] = () => import('./courses/law-prek2').then(m => m.COURSE_MODULE.bank);
LOADERS['law-g35'] = () => import('./courses/law-g35').then(m => m.COURSE_MODULE.bank);
LOADERS['law-g68'] = () => import('./courses/law-g68').then(m => m.COURSE_MODULE.bank);
LOADERS['law-g912'] = () => import('./courses/law-g912').then(m => m.COURSE_MODULE.bank);
LOADERS['law-college'] = () => import('./courses/law-college').then(m => m.COURSE_MODULE.bank);
LOADERS['law-legalwriting'] = () => import('./courses/law-legalwriting').then(m => m.COURSE_MODULE.bank);
LOADERS['law-contracts'] = () => import('./courses/law-contracts').then(m => m.COURSE_MODULE.bank);
LOADERS['law-torts'] = () => import('./courses/law-torts').then(m => m.COURSE_MODULE.bank);
LOADERS['law-civpro'] = () => import('./courses/law-civpro').then(m => m.COURSE_MODULE.bank);
LOADERS['law-crimlaw'] = () => import('./courses/law-crimlaw').then(m => m.COURSE_MODULE.bank);
LOADERS['law-property'] = () => import('./courses/law-property').then(m => m.COURSE_MODULE.bank);
LOADERS['law-conlaw'] = () => import('./courses/law-conlaw').then(m => m.COURSE_MODULE.bank);
LOADERS['law-evidence'] = () => import('./courses/law-evidence').then(m => m.COURSE_MODULE.bank);
LOADERS['law-crimpro'] = () => import('./courses/law-crimpro').then(m => m.COURSE_MODULE.bank);
LOADERS['law-admin'] = () => import('./courses/law-admin').then(m => m.COURSE_MODULE.bank);
LOADERS['law-business-orgs'] = () => import('./courses/law-business-orgs').then(m => m.COURSE_MODULE.bank);
LOADERS['law-profresp'] = () => import('./courses/law-profresp').then(m => m.COURSE_MODULE.bank);
LOADERS['law-jurisprudence'] = () => import('./courses/law-jurisprudence').then(m => m.COURSE_MODULE.bank);
LOADERS['law-intl-public'] = () => import('./courses/law-intl-public').then(m => m.COURSE_MODULE.bank);
LOADERS['law-intl-human-rights'] = () => import('./courses/law-intl-human-rights').then(m => m.COURSE_MODULE.bank);
LOADERS['law-intl-humanitarian-criminal'] = () => import('./courses/law-intl-humanitarian-criminal').then(m => m.COURSE_MODULE.bank);
LOADERS['law-intl-trade-business'] = () => import('./courses/law-intl-trade-business').then(m => m.COURSE_MODULE.bank);
LOADERS['law-comparative'] = () => import('./courses/law-comparative').then(m => m.COURSE_MODULE.bank);
LOADERS['med-prek2'] = () => import('./courses/med-prek2').then(m => m.COURSE_MODULE.bank);
LOADERS['med-g35'] = () => import('./courses/med-g35').then(m => m.COURSE_MODULE.bank);
LOADERS['med-g68'] = () => import('./courses/med-g68').then(m => m.COURSE_MODULE.bank);
LOADERS['med-ethics-young'] = () => import('./courses/med-ethics-young').then(m => m.COURSE_MODULE.bank);
LOADERS['med-g912'] = () => import('./courses/med-g912').then(m => m.COURSE_MODULE.bank);
LOADERS['med-ethics-hs'] = () => import('./courses/med-ethics-hs').then(m => m.COURSE_MODULE.bank);
LOADERS['med-premed-chem'] = () => import('./courses/med-premed-chem').then(m => m.COURSE_MODULE.bank);
LOADERS['med-premed-biochem'] = () => import('./courses/med-premed-biochem').then(m => m.COURSE_MODULE.bank);
LOADERS['med-premed-behavioral'] = () => import('./courses/med-premed-behavioral').then(m => m.COURSE_MODULE.bank);
LOADERS['med-history'] = () => import('./courses/med-history').then(m => m.COURSE_MODULE.bank);
LOADERS['med-skills'] = () => import('./courses/med-skills').then(m => m.COURSE_MODULE.bank);
LOADERS['med-anatomy'] = () => import('./courses/med-anatomy').then(m => m.COURSE_MODULE.bank);
LOADERS['med-physiology'] = () => import('./courses/med-physiology').then(m => m.COURSE_MODULE.bank);
LOADERS['med-biochem-genetics'] = () => import('./courses/med-biochem-genetics').then(m => m.COURSE_MODULE.bank);
LOADERS['med-histo-embryo'] = () => import('./courses/med-histo-embryo').then(m => m.COURSE_MODULE.bank);
LOADERS['med-neuro'] = () => import('./courses/med-neuro').then(m => m.COURSE_MODULE.bank);
LOADERS['med-micro'] = () => import('./courses/med-micro').then(m => m.COURSE_MODULE.bank);
LOADERS['med-immuno'] = () => import('./courses/med-immuno').then(m => m.COURSE_MODULE.bank);
LOADERS['med-path'] = () => import('./courses/med-path').then(m => m.COURSE_MODULE.bank);
LOADERS['med-pharm-principles'] = () => import('./courses/med-pharm-principles').then(m => m.COURSE_MODULE.bank);
LOADERS['med-pharm-systems'] = () => import('./courses/med-pharm-systems').then(m => m.COURSE_MODULE.bank);
LOADERS['med-epi-biostats'] = () => import('./courses/med-epi-biostats').then(m => m.COURSE_MODULE.bank);
LOADERS['med-clin-im'] = () => import('./courses/med-clin-im').then(m => m.COURSE_MODULE.bank);
LOADERS['med-clin-surgery'] = () => import('./courses/med-clin-surgery').then(m => m.COURSE_MODULE.bank);
LOADERS['med-clin-peds'] = () => import('./courses/med-clin-peds').then(m => m.COURSE_MODULE.bank);
LOADERS['med-clin-obgyn'] = () => import('./courses/med-clin-obgyn').then(m => m.COURSE_MODULE.bank);
LOADERS['med-clin-psych'] = () => import('./courses/med-clin-psych').then(m => m.COURSE_MODULE.bank);
LOADERS['med-clin-em'] = () => import('./courses/med-clin-em').then(m => m.COURSE_MODULE.bank);
LOADERS['med-clin-fm'] = () => import('./courses/med-clin-fm').then(m => m.COURSE_MODULE.bank);
LOADERS['med-ethics-prof'] = () => import('./courses/med-ethics-prof').then(m => m.COURSE_MODULE.bank);
LOADERS['med-global-health'] = () => import('./courses/med-global-health').then(m => m.COURSE_MODULE.bank);

const cache = new Map<string, QuestionBank>();
export const hasBank = (curriculumId: string) => curriculumId in LOADERS;
export async function loadBank(curriculumId: string): Promise<QuestionBank | null> {
  if (cache.has(curriculumId)) return cache.get(curriculumId)!;
  const l = LOADERS[curriculumId];
  if (!l) return null;
  try { const b = balanceBank(await l()); cache.set(curriculumId, b); return b; } catch { return null; }
}
