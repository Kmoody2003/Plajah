/**
 * Dossier registry. A new subject = one data module + one entry here; the hall, entrance, validator
 * and the Tela/Fabula handoffs are shared. Entries load lazily so the hall stays light.
 */
import type { Dossier } from '../../services/dossier/dossierTypes';
import { applyReconstructions } from '../../services/dossier/reconAssets';

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
  /** True while the planned reconstruction paintings (and the film) have not been produced yet. */
  artPending?: boolean;
}

export const DOSSIERS: DossierEntry[] = [
  {
    id: 'frederick-douglass',
    title: 'Frederick Douglass',
    kind: 'biography',
    tagline: "Born enslaved. Became the nation's conscience.",
    years: '1818 — 1895',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Samuel_J._Miller_-_Frederick_Douglass_-_Google_Art_Project.jpg/960px-Samuel_J._Miller_-_Frederick_Douglass_-_Google_Art_Project.jpg',
    load: () => import('./douglass').then(m => m.douglassDossier),
    telaTimeline: () => import('./douglassTimeline.tela.json').then(m => m.default),
    fabulaFilm: () => import('./douglassFabula.json').then(m => m.default),
  },
  {
    id: 'henry-ford',
    title: 'Henry Ford',
    kind: 'biography',
    tagline: 'He put America on wheels. He also put hatred in print.',
    years: '1863 — 1947',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Henry_Ford%2C_head-and-shoulders_portrait%2C_facing_slightly_left%29_-_Hartsook_photo_LCCN94506959_Trim.jpg/960px-Henry_Ford%2C_head-and-shoulders_portrait%2C_facing_slightly_left%29_-_Hartsook_photo_LCCN94506959_Trim.jpg',
    load: () => Promise.all([import('./ford'), import('./fordScenes'), import('./fordRecon.json')])
      .then(([m, s, r]) => applyReconstructions(m.fordDossier, s.fordScenes as any, r.default)),
    telaTimeline: () => import('./fordTimeline.tela.json').then(m => m.default),
    fabulaFilm: () => import('./fordFabula.json').then(m => m.default),
  },
  {
    id: 'christianity-in-persia',
    title: 'Christianity in Persia',
    kind: 'topic',
    tagline: 'Two thousand years of faith on the roads of Persia.',
    years: 'c. 33 — Today',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Stele_of_the_Spread_of_the_Assyrian_Teachings_of_the_Great_Qin_to_the_Central_States_WDL3047.jpg/1280px-Stele_of_the_Spread_of_the_Assyrian_Teachings_of_the_Great_Qin_to_the_Central_States_WDL3047.jpg',
    load: () => Promise.all([import('./persia'), import('./persiaScenes'), import('./persiaRecon.json')])
      .then(([m, s, r]) => applyReconstructions(m.persiaDossier, s.persiaScenes as any, r.default)),
    telaTimeline: () => import('./persiaTimeline.tela.json').then(m => m.default),
    fabulaFilm: () => import('./persiaFabula.json').then(m => m.default),
  },
  {
    id: 'partition-1947',
    title: 'The Partition of India, 1947',
    kind: 'topic',
    tagline: 'A line drawn in five weeks, and the lives it divided.',
    years: '1857 — Today',
    heroUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Map_of_the_partition_boundaries_in_the_Punjab%2C_Research_Dept.%2C_F.O.%2C_September%2C_1948.jpg/1280px-Map_of_the_partition_boundaries_in_the_Punjab%2C_Research_Dept.%2C_F.O.%2C_September%2C_1948.jpg',
    artPending: true,
    load: () => Promise.all([import('./partition'), import('./partitionScenes'), import('./partitionRecon.json')])
      .then(([m, s, r]) => applyReconstructions(m.partitionDossier, s.partitionScenes as any, r.default)),
  },
];

let requested: string | null = null;
/** Called by the app's `plajah:openDossier` listener before it switches views. */
export const requestDossier = (id?: string | null) => { requested = id ?? null; };
/** The id the app asked for, or null (show the lobby when there is more than one exhibit). */
export const takeRequestedDossier = (): string | null =>
  requested && DOSSIERS.some(d => d.id === requested) ? requested : null;
