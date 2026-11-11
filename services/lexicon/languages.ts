/**
 * Language table for the Lexicon: Wiktionary codes → names, families, eras and a BCP-47 tag for speech.
 *
 * `era` is an approximate span of the language's written/reconstructed life (negative = BCE). It places
 * etymology ancestors on the Origins timeline; it is a teaching aid, not a scholarly date.
 */

export type Family =
  | 'germanic' | 'romance' | 'italic' | 'hellenic' | 'celtic' | 'slavic' | 'baltic' | 'indo-iranian'
  | 'semitic' | 'uralic' | 'turkic' | 'sinitic' | 'japonic' | 'koreanic' | 'austronesian' | 'niger-congo'
  | 'dravidian' | 'pie' | 'other';

export interface LangInfo { name: string; family: Family; era?: [number, number]; bcp47?: string; native?: string; proto?: boolean }

export const FAMILY_COLOR: Record<Family, string> = {
  germanic: '#1f2b5c', romance: '#a8301d', italic: '#8a2a1a', hellenic: '#245e52', celtic: '#3d6b2a',
  slavic: '#5b3a7a', baltic: '#6d4f8f', 'indo-iranian': '#b06a12', semitic: '#7a5a1e', uralic: '#2f6f8f',
  turkic: '#8f3f5f', sinitic: '#9b2335', japonic: '#c0392b', koreanic: '#2c5f8a', austronesian: '#1f7a6a',
  'niger-congo': '#6b4423', dravidian: '#a0522d', pie: '#2a2236', other: '#4b3221',
};

export const LANGS: Record<string, LangInfo> = {
  // ── reconstructed ancestors ──
  'ine-pro': { name: 'Proto-Indo-European', family: 'pie', era: [-4500, -2500], proto: true },
  'gem-pro': { name: 'Proto-Germanic', family: 'germanic', era: [-500, 200], proto: true },
  'gmw-pro': { name: 'Proto-West Germanic', family: 'germanic', era: [200, 500], proto: true },
  'itc-pro': { name: 'Proto-Italic', family: 'italic', era: [-1500, -700], proto: true },
  'cel-pro': { name: 'Proto-Celtic', family: 'celtic', era: [-1300, -800], proto: true },
  'sla-pro': { name: 'Proto-Slavic', family: 'slavic', era: [400, 900], proto: true },
  'grk-pro': { name: 'Proto-Hellenic', family: 'hellenic', era: [-2200, -1600], proto: true },
  'iir-pro': { name: 'Proto-Indo-Iranian', family: 'indo-iranian', era: [-2500, -1800], proto: true },
  'sem-pro': { name: 'Proto-Semitic', family: 'semitic', era: [-3750, -3000], proto: true },
  'urj-pro': { name: 'Proto-Uralic', family: 'uralic', era: [-4000, -2000], proto: true },
  'trk-pro': { name: 'Proto-Turkic', family: 'turkic', era: [-500, 500], proto: true },
  // ── historical ──
  ang: { name: 'Old English', family: 'germanic', era: [450, 1150] },
  enm: { name: 'Middle English', family: 'germanic', era: [1150, 1500] },
  'en-early': { name: 'Early Modern English', family: 'germanic', era: [1500, 1700] },
  non: { name: 'Old Norse', family: 'germanic', era: [800, 1350] },
  goh: { name: 'Old High German', family: 'germanic', era: [750, 1050] },
  gmh: { name: 'Middle High German', family: 'germanic', era: [1050, 1350] },
  odt: { name: 'Old Dutch', family: 'germanic', era: [500, 1150] },
  dum: { name: 'Middle Dutch', family: 'germanic', era: [1150, 1500] },
  osx: { name: 'Old Saxon', family: 'germanic', era: [500, 1150] },
  ofs: { name: 'Old Frisian', family: 'germanic', era: [1150, 1550] },
  lng: { name: 'Lombardic', family: 'germanic', era: [568, 774] },
  frk: { name: 'Frankish', family: 'germanic', era: [300, 900] },
  stq: { name: 'Saterland Frisian', family: 'germanic' },
  'nds-de': { name: 'German Low German', family: 'germanic' },
  nds: { name: 'Low German', family: 'germanic' },
  fo: { name: 'Faroese', family: 'germanic', native: 'føroyskt' },
  gml: { name: 'Middle Low German', family: 'germanic', era: [1200, 1600] },
  xcl: { name: 'Old Armenian', family: 'other', era: [400, 1100] },
  sux: { name: 'Sumerian', family: 'other', era: [-3100, -2000] },
  egy: { name: 'Egyptian', family: 'other', era: [-3000, 300] },
  got: { name: 'Gothic', family: 'germanic', era: [300, 600] },
  la: { name: 'Latin', family: 'italic', era: [-700, 500] },
  'la-lat': { name: 'Late Latin', family: 'italic', era: [200, 700] },
  'la-vul': { name: 'Vulgar Latin', family: 'italic', era: [-200, 700] },
  'la-med': { name: 'Medieval Latin', family: 'italic', era: [500, 1500] },
  'la-new': { name: 'New Latin', family: 'italic', era: [1500, 1900] },
  ML: { name: 'Medieval Latin', family: 'italic', era: [500, 1500] },
  LL: { name: 'Late Latin', family: 'italic', era: [200, 700] },
  VL: { name: 'Vulgar Latin', family: 'italic', era: [-200, 700] },
  NL: { name: 'New Latin', family: 'italic', era: [1500, 1900] },
  fro: { name: 'Old French', family: 'romance', era: [850, 1400] },
  frm: { name: 'Middle French', family: 'romance', era: [1400, 1600] },
  xno: { name: 'Anglo-Norman', family: 'romance', era: [1066, 1400] },
  pro: { name: 'Old Occitan', family: 'romance', era: [800, 1500] },
  osp: { name: 'Old Spanish', family: 'romance', era: [900, 1500] },
  roa_opt: { name: 'Old Portuguese', family: 'romance', era: [1100, 1500] },
  'roa-opt': { name: 'Old Galician-Portuguese', family: 'romance', era: [1100, 1500] },
  'it-old': { name: 'Old Italian', family: 'romance', era: [900, 1400] },
  grc: { name: 'Ancient Greek', family: 'hellenic', era: [-800, 300] },
  gkm: { name: 'Byzantine Greek', family: 'hellenic', era: [600, 1450] },
  'grc-koi': { name: 'Koine Greek', family: 'hellenic', era: [-300, 300] },
  sga: { name: 'Old Irish', family: 'celtic', era: [600, 900] },
  mga: { name: 'Middle Irish', family: 'celtic', era: [900, 1200] },
  owl: { name: 'Old Welsh', family: 'celtic', era: [800, 1100] },
  cu: { name: 'Old Church Slavonic', family: 'slavic', era: [850, 1100] },
  orv: { name: 'Old East Slavic', family: 'slavic', era: [900, 1400] },
  sa: { name: 'Sanskrit', family: 'indo-iranian', era: [-1500, 600], bcp47: 'sa-IN', native: 'संस्कृतम्' },
  pi: { name: 'Pali', family: 'indo-iranian', era: [-300, 500] },
  ae: { name: 'Avestan', family: 'indo-iranian', era: [-1200, -400] },
  peo: { name: 'Old Persian', family: 'indo-iranian', era: [-600, -300] },
  pal: { name: 'Middle Persian', family: 'indo-iranian', era: [-300, 900] },
  akk: { name: 'Akkadian', family: 'semitic', era: [-2500, 100] },
  arc: { name: 'Aramaic', family: 'semitic', era: [-1000, 700] },
  hbo: { name: 'Biblical Hebrew', family: 'semitic', era: [-1000, 200] },
  ota: { name: 'Ottoman Turkish', family: 'turkic', era: [1300, 1928] },
  ltc: { name: 'Middle Chinese', family: 'sinitic', era: [400, 1200] },
  och: { name: 'Old Chinese', family: 'sinitic', era: [-1250, 200] },
  ojp: { name: 'Old Japanese', family: 'japonic', era: [700, 800] },
  // ── living (translation targets) ──
  en: { name: 'English', family: 'germanic', era: [1700, 2026], bcp47: 'en-US', native: 'English' },
  de: { name: 'German', family: 'germanic', era: [1650, 2026], bcp47: 'de-DE', native: 'Deutsch' },
  nl: { name: 'Dutch', family: 'germanic', era: [1500, 2026], bcp47: 'nl-NL', native: 'Nederlands' },
  sv: { name: 'Swedish', family: 'germanic', bcp47: 'sv-SE', native: 'svenska' },
  da: { name: 'Danish', family: 'germanic', bcp47: 'da-DK', native: 'dansk' },
  nb: { name: 'Norwegian Bokmål', family: 'germanic', bcp47: 'nb-NO', native: 'norsk' },
  nn: { name: 'Norwegian Nynorsk', family: 'germanic', bcp47: 'nn-NO', native: 'nynorsk' },
  no: { name: 'Norwegian', family: 'germanic', bcp47: 'nb-NO', native: 'norsk' },
  is: { name: 'Icelandic', family: 'germanic', bcp47: 'is-IS', native: 'íslenska' },
  fy: { name: 'West Frisian', family: 'germanic', native: 'Frysk' },
  af: { name: 'Afrikaans', family: 'germanic', bcp47: 'af-ZA', native: 'Afrikaans' },
  yi: { name: 'Yiddish', family: 'germanic', native: 'ייִדיש' },
  lb: { name: 'Luxembourgish', family: 'germanic', native: 'Lëtzebuergesch' },
  sco: { name: 'Scots', family: 'germanic', native: 'Scots' },
  fr: { name: 'French', family: 'romance', era: [1600, 2026], bcp47: 'fr-FR', native: 'français' },
  es: { name: 'Spanish', family: 'romance', era: [1500, 2026], bcp47: 'es-ES', native: 'español' },
  pt: { name: 'Portuguese', family: 'romance', bcp47: 'pt-BR', native: 'português' },
  it: { name: 'Italian', family: 'romance', bcp47: 'it-IT', native: 'italiano' },
  ro: { name: 'Romanian', family: 'romance', bcp47: 'ro-RO', native: 'română' },
  ca: { name: 'Catalan', family: 'romance', bcp47: 'ca-ES', native: 'català' },
  gl: { name: 'Galician', family: 'romance', bcp47: 'gl-ES', native: 'galego' },
  oc: { name: 'Occitan', family: 'romance', native: 'occitan' },
  ht: { name: 'Haitian Creole', family: 'romance', native: 'kreyòl ayisyen' },
  el: { name: 'Greek', family: 'hellenic', bcp47: 'el-GR', native: 'Ελληνικά' },
  ga: { name: 'Irish', family: 'celtic', bcp47: 'ga-IE', native: 'Gaeilge' },
  gd: { name: 'Scottish Gaelic', family: 'celtic', native: 'Gàidhlig' },
  cy: { name: 'Welsh', family: 'celtic', bcp47: 'cy-GB', native: 'Cymraeg' },
  br: { name: 'Breton', family: 'celtic', native: 'brezhoneg' },
  ru: { name: 'Russian', family: 'slavic', bcp47: 'ru-RU', native: 'русский' },
  uk: { name: 'Ukrainian', family: 'slavic', bcp47: 'uk-UA', native: 'українська' },
  pl: { name: 'Polish', family: 'slavic', bcp47: 'pl-PL', native: 'polski' },
  cs: { name: 'Czech', family: 'slavic', bcp47: 'cs-CZ', native: 'čeština' },
  sk: { name: 'Slovak', family: 'slavic', bcp47: 'sk-SK', native: 'slovenčina' },
  bg: { name: 'Bulgarian', family: 'slavic', bcp47: 'bg-BG', native: 'български' },
  sh: { name: 'Serbo-Croatian', family: 'slavic', bcp47: 'hr-HR', native: 'srpskohrvatski' },
  sl: { name: 'Slovene', family: 'slavic', bcp47: 'sl-SI', native: 'slovenščina' },
  be: { name: 'Belarusian', family: 'slavic', native: 'беларуская' },
  lt: { name: 'Lithuanian', family: 'baltic', bcp47: 'lt-LT', native: 'lietuvių' },
  lv: { name: 'Latvian', family: 'baltic', bcp47: 'lv-LV', native: 'latviešu' },
  hi: { name: 'Hindi', family: 'indo-iranian', bcp47: 'hi-IN', native: 'हिन्दी' },
  ur: { name: 'Urdu', family: 'indo-iranian', bcp47: 'ur-PK', native: 'اردو' },
  bn: { name: 'Bengali', family: 'indo-iranian', bcp47: 'bn-IN', native: 'বাংলা' },
  pa: { name: 'Punjabi', family: 'indo-iranian', bcp47: 'pa-IN', native: 'ਪੰਜਾਬੀ' },
  fa: { name: 'Persian', family: 'indo-iranian', bcp47: 'fa-IR', native: 'فارسی' },
  ar: { name: 'Arabic', family: 'semitic', bcp47: 'ar-SA', native: 'العربية' },
  he: { name: 'Hebrew', family: 'semitic', bcp47: 'he-IL', native: 'עברית' },
  am: { name: 'Amharic', family: 'semitic', native: 'አማርኛ' },
  mt: { name: 'Maltese', family: 'semitic', native: 'Malti' },
  fi: { name: 'Finnish', family: 'uralic', bcp47: 'fi-FI', native: 'suomi' },
  et: { name: 'Estonian', family: 'uralic', bcp47: 'et-EE', native: 'eesti' },
  hu: { name: 'Hungarian', family: 'uralic', bcp47: 'hu-HU', native: 'magyar' },
  tr: { name: 'Turkish', family: 'turkic', bcp47: 'tr-TR', native: 'Türkçe' },
  az: { name: 'Azerbaijani', family: 'turkic', native: 'azərbaycanca' },
  kk: { name: 'Kazakh', family: 'turkic', native: 'қазақша' },
  uz: { name: 'Uzbek', family: 'turkic', native: 'oʻzbekcha' },
  cmn: { name: 'Mandarin', family: 'sinitic', bcp47: 'zh-CN', native: '普通话' },
  zh: { name: 'Chinese', family: 'sinitic', bcp47: 'zh-CN', native: '中文' },
  yue: { name: 'Cantonese', family: 'sinitic', bcp47: 'zh-HK', native: '粵語' },
  ja: { name: 'Japanese', family: 'japonic', bcp47: 'ja-JP', native: '日本語' },
  ko: { name: 'Korean', family: 'koreanic', bcp47: 'ko-KR', native: '한국어' },
  id: { name: 'Indonesian', family: 'austronesian', bcp47: 'id-ID', native: 'Bahasa Indonesia' },
  ms: { name: 'Malay', family: 'austronesian', bcp47: 'ms-MY', native: 'Bahasa Melayu' },
  tl: { name: 'Tagalog', family: 'austronesian', bcp47: 'fil-PH', native: 'Tagalog' },
  mi: { name: 'Maori', family: 'austronesian', native: 'te reo Māori' },
  haw: { name: 'Hawaiian', family: 'austronesian', native: 'ʻŌlelo Hawaiʻi' },
  sw: { name: 'Swahili', family: 'niger-congo', bcp47: 'sw-KE', native: 'Kiswahili' },
  yo: { name: 'Yoruba', family: 'niger-congo', native: 'Yorùbá' },
  ig: { name: 'Igbo', family: 'niger-congo', native: 'Igbo' },
  zu: { name: 'Zulu', family: 'niger-congo', bcp47: 'zu-ZA', native: 'isiZulu' },
  xh: { name: 'Xhosa', family: 'niger-congo', native: 'isiXhosa' },
  ta: { name: 'Tamil', family: 'dravidian', bcp47: 'ta-IN', native: 'தமிழ்' },
  te: { name: 'Telugu', family: 'dravidian', bcp47: 'te-IN', native: 'తెలుగు' },
  ml: { name: 'Malayalam', family: 'dravidian', native: 'മലയാളം' },
  kn: { name: 'Kannada', family: 'dravidian', native: 'ಕನ್ನಡ' },
  vi: { name: 'Vietnamese', family: 'other', bcp47: 'vi-VN', native: 'Tiếng Việt' },
  th: { name: 'Thai', family: 'other', bcp47: 'th-TH', native: 'ไทย' },
  eu: { name: 'Basque', family: 'other', native: 'euskara' },
  ka: { name: 'Georgian', family: 'other', native: 'ქართული' },
  hy: { name: 'Armenian', family: 'other', native: 'հայերեն' },
  sq: { name: 'Albanian', family: 'other', native: 'shqip' },
  eo: { name: 'Esperanto', family: 'other', native: 'Esperanto' },
  nv: { name: 'Navajo', family: 'other', native: 'Diné bizaad' },
  qu: { name: 'Quechua', family: 'other', native: 'Runa Simi' },
  ase: { name: 'American Sign Language', family: 'other' },
};

/** Wiktionary section heading → code, for the language sections on a page ("==German=="). */
const NAME_TO_CODE: Record<string, string> = {};
for (const [code, info] of Object.entries(LANGS)) if (!NAME_TO_CODE[info.name]) NAME_TO_CODE[info.name] = code;
NAME_TO_CODE['Norwegian Bokmål'] = 'nb';
NAME_TO_CODE['Chinese'] = 'zh';

export function langName(code: string): string {
  return LANGS[code]?.name ?? code;
}
export function codeForName(name: string): string {
  return NAME_TO_CODE[name] ?? name.toLowerCase().replace(/[^a-z]+/g, '-');
}
export function familyOf(code: string): Family { return LANGS[code]?.family ?? 'other'; }
export function eraOf(code: string): [number, number] | undefined { return LANGS[code]?.era; }
export function speechTag(code: string): string | undefined { return LANGS[code]?.bcp47; }

/** The default languages shown in "Across languages" before a reader picks their own. */
export const DEFAULT_COMPARE_LANGS = ['es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'ru', 'el', 'ar', 'he', 'hi', 'sw', 'yo', 'zh', 'ja', 'ko', 'tr', 'fi', 'pl'];

/** Pretty "c. 4500 BCE" / "1150" for timeline labels. */
export function yearLabel(y: number): string {
  if (y < 0) return `c. ${Math.abs(y)} BCE`;
  if (y < 1000) return `c. ${y} CE`;
  return String(y);
}
