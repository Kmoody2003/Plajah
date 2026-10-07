/**
 * Dossier registry. A new subject = one data module + one entry here; the hall, entrance, validator
 * and the Tela/Fabula handoffs are shared. Entries load lazily so the hall stays light.
 */
import type { Dossier } from '../../services/dossier/dossierTypes';
import { applyReconstructions } from '../../services/dossier/reconAssets';
import type { DossierTheme } from '../../services/dossier/dossierTheme';
import type { FilmSpec } from '../../services/dossier/film/filmTypes';

export interface DossierEntry {
  id: string;
  title: string;
  kind: Dossier['kind'];
  tagline: string;
  /** Lobby card artwork (a cleared archive image URL) and the years line. */
  heroUrl?: string;
  years?: string;
  load: () => Promise<Dossier>;
  /** Optional deliverables the hall can hand off. */
  telaTimeline?: () => Promise<any>;
  fabulaFilm?: () => Promise<any>;
  /** The exhibit's watchable film (services/dossier/film): builds the spec for the in-app player. Absent = no film yet. */
  film?: (width: number, height: number) => Promise<FilmSpec>;
  /** True while the planned reconstruction paintings (and the film) have not been produced yet. */
  artPending?: boolean;
  /** The exhibit's own look: display face, ink colour, ground. The hall turns it into CSS variables. */
  theme?: DossierTheme;
}

const SERIF_BODY = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SERIF_FONT = 'Source Serif 4:opsz,wght@8..60,400;8..60,600';

/** One theme per exhibit: display face, ink on ground, and the real second script where the subject has one. */
export const DOSSIER_THEMES: Record<string, DossierTheme> = {
  'frederick-douglass': {
    display: "'Abril Fatface', 'Playfair Display', Georgia, serif",
    body: SERIF_BODY,
    accent: '#d9b36a', bg: '#14110d', upper: true,
    entranceAsset: 'ref-1866-nyhs',
    fonts: ['Abril Fatface', 'Playfair Display:ital,wght@0,500;1,500', SERIF_FONT],
  },
  'henry-ford': {
    display: "'Anton', 'Barlow Condensed', Impact, 'Arial Narrow', sans-serif",
    body: SERIF_BODY,
    accent: '#ff4b1f', bg: '#1a1411', upper: true,
    heroTitle: 'Motor City',
    entranceAsset: 'doc-1913-assembly-line',
    fonts: ['Anton', SERIF_FONT],
  },
  'christianity-in-persia': {
    display: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
    body: SERIF_BODY,
    accent: '#4f7cff', bg: '#0c1020', upper: false,
    entranceAsset: 'a-stele-wdl',
    script: { word: 'ܥܕܬܐ', font: "'Noto Sans Syriac', 'Estrangelo Edessa', serif", reading: 'Syriac, edta: “the church”', dir: 'rtl' },
    fonts: ['Cormorant Garamond:ital,wght@0,500;0,700;1,500', 'Noto Sans Syriac', 'Noto Naskh Arabic:wght@500;700', 'Noto Serif SC:wght@700', SERIF_FONT],
  },
  'partition-1947': {
    display: "'Fraunces', Georgia, 'Times New Roman', serif",
    body: SERIF_BODY,
    accent: '#e8553d', bg: '#120f0c', upper: false,
    heroTitle: 'Five weeks, one line',
    entranceAsset: 'a-radcliffe-punjab-map',
    script: { word: 'تقسیمِ ہند', font: "'Noto Nastaliq Urdu', 'Fraunces', serif", reading: 'Urdu: “the partition of India”', dir: 'rtl' },
    fonts: ['Fraunces:opsz,wght@9..144,400;9..144,800', 'Noto Nastaliq Urdu', SERIF_FONT],
  },
  'founding-era': {
    display: "'Libre Caslon Text', 'Libre Caslon Display', Georgia, 'Times New Roman', serif",
    body: SERIF_BODY,
    accent: '#4fb3a0', bg: '#101615', upper: false,
    heroTitle: 'The Founding Era',
    entranceAsset: 'a-declaration-trumbull',
    fonts: ['Libre Caslon Text:ital,wght@0,400;0,700;1,400', SERIF_FONT],
  },
};

export const DOSSIERS: DossierEntry[] = [
  {
    id: 'frederick-douglass',
    theme: DOSSIER_THEMES['frederick-douglass'],
    title: 'Frederick Douglass',
    kind: 'biography',
    tagline: "Born enslaved. Became the nation's conscience.",
    years: '1818 — 1895',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Samuel_J._Miller_-_Frederick_Douglass_-_Google_Art_Project.jpg/960px-Samuel_J._Miller_-_Frederick_Douglass_-_Google_Art_Project.jpg',
    load: () => import('./douglass').then(m => m.douglassDossier),
    telaTimeline: () => import('./douglassTimeline.tela.json').then(m => m.default),
    fabulaFilm: () => import('./douglassFabula.json').then(m => m.default),
    film: (w, h) => import('./douglassFilmCouncil').then(m => m.loadDouglassCouncilFilm(w, h)),
  },
  {
    id: 'henry-ford',
    theme: DOSSIER_THEMES['henry-ford'],
    title: 'Henry Ford',
    kind: 'biography',
    tagline: 'He put America on wheels and made Detroit the capital of the machine age.',
    years: '1863 — 1947',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Henry_Ford%2C_head-and-shoulders_portrait%2C_facing_slightly_left%29_-_Hartsook_photo_LCCN94506959_Trim.jpg/960px-Henry_Ford%2C_head-and-shoulders_portrait%2C_facing_slightly_left%29_-_Hartsook_photo_LCCN94506959_Trim.jpg',
    load: () => Promise.all([import('./ford'), import('./fordScenes'), import('./fordRecon.json')])
      .then(([m, s, r]) => applyReconstructions(m.fordDossier, s.fordScenes as any, r.default)),
    telaTimeline: () => import('./fordTimeline.tela.json').then(m => m.default),
    fabulaFilm: () => import('./fordFabula.json').then(m => m.default),
    film: (w, h) => import('./fordFilmCouncil').then(m => m.loadFordCouncilFilm(w, h)),
  },
  {
    id: 'christianity-in-persia',
    theme: DOSSIER_THEMES['christianity-in-persia'],
    title: 'Christianity in Persia',
    kind: 'topic',
    tagline: 'Two thousand years of faith on the roads of Persia.',
    years: 'c. 33 — Today',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Stele_of_the_Spread_of_the_Assyrian_Teachings_of_the_Great_Qin_to_the_Central_States_WDL3047.jpg/1280px-Stele_of_the_Spread_of_the_Assyrian_Teachings_of_the_Great_Qin_to_the_Central_States_WDL3047.jpg',
    load: () => Promise.all([import('./persia'), import('./persiaScenes'), import('./persiaRecon.json')])
      .then(([m, s, r]) => applyReconstructions(m.persiaDossier, s.persiaScenes as any, r.default)),
    telaTimeline: () => import('./persiaTimeline.tela.json').then(m => m.default),
    fabulaFilm: () => import('./persiaFabula.json').then(m => m.default),
    film: (w, h) => import('./persiaFilmCouncil').then(m => m.loadPersiaCouncilFilm(w, h)),
  },
  {
    id: 'partition-1947',
    theme: DOSSIER_THEMES['partition-1947'],
    title: 'The Partition of India, 1947',
    kind: 'topic',
    tagline: 'A line drawn in five weeks, and the lives it divided.',
    years: '1857 — Today',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Map_of_the_partition_boundaries_in_the_Punjab%2C_Research_Dept.%2C_F.O.%2C_September%2C_1948.jpg/1280px-Map_of_the_partition_boundaries_in_the_Punjab%2C_Research_Dept.%2C_F.O.%2C_September%2C_1948.jpg',
    artPending: true,
    film: (w, h) => import('./partitionFilmCouncil').then(m => m.loadPartitionCouncilFilm(w, h)),
    load: () => Promise.all([import('./partition'), import('./partitionScenes'), import('./partitionRecon.json')])
      .then(([m, s, r]) => applyReconstructions(m.partitionDossier, s.partitionScenes as any, r.default)),
  },
  {
    id: 'founding-era',
    theme: DOSSIER_THEMES['founding-era'],
    title: 'The Founding Era',
    kind: 'topic',
    tagline: 'From thirteen colonies to four presidents, and the people the story left out.',
    years: '1754 — 1817',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Declaration_of_Independence_%281819%29%2C_by_John_Trumbull.jpg/1280px-Declaration_of_Independence_%281819%29%2C_by_John_Trumbull.jpg',
    artPending: true,
    load: () => Promise.all([import('./founding'), import('./foundingScenes'), import('./foundingRecon.json')])
      .then(([m, s, r]) => applyReconstructions(m.foundingDossier, s.foundingScenes as any, r.default)),
  },
];

let requested: string | null = null;
/** Called by the app's `plajah:openDossier` listener before it switches views. */
export const requestDossier = (id?: string | null) => { requested = id ?? null; };
/** The id the app asked for, or null (show the lobby when there is more than one exhibit). */
export const takeRequestedDossier = (): string | null =>
  requested && DOSSIERS.some(d => d.id === requested) ? requested : null;
