/**
 * "Bunker Hill": a demonstration film of the 'animatedPainting' scene type (services/dossier/film/animatedPainting.ts).
 *
 * Title card, content note, then John Trumbull's painting of the battle, shown at its real edges with its credit slate and
 * given motion in code (camera, smoke in the painting's own colours, rippling flags, far-plane parallax, fire flicker, cloud
 * shadow), then the credits. About 45 seconds, silent with estimated caption timing; synthesised musket thuds and wind are
 * scheduled for the MP4 (scripts/dossier/renderFilm.ts --film=founding-battle).
 *
 * NOT part of the Founding exhibit's evidence ledger. The four narrated sentences cite the local claims below, each with the
 * sources checked on 7 October 2026. The Founding ledger (data/dossier/founding.ts) was re-checked when this was wired into the
 * hall as interactive content (node n-r3-story, experience 'animated-painting'): it has NO claims for 17 June 1775, Breed's
 * Hill or the Bunker Hill casualty figures (it only mentions Bunker Hill inside c-estabrook), so these local claims stay. When
 * the ledger gains real claims for those facts, map these to its claim ids and nothing else changes.
 *
 * This is ADDITIONAL INTERACTIVE CONTENT inside the Founding exhibit, not the exhibit's film (the exhibit has no film yet).
 */
import type { FilmAsset, FilmSpec } from '../../services/dossier/film/filmTypes';
import type { CouncilFilm, CouncilShot, PlateSpec } from '../../services/dossier/film/councilTypes';
import type { AnimatedPaintingSpec, PaintingCamKey } from '../../services/dossier/film/animatedPainting';
import { ANIMATED_LABEL } from '../../services/dossier/film/animatedPainting';
import { councilTheme } from '../../services/dossier/film/councilCompile';
import { FLAGS, PAINTING_FILE, PAINTING_SIZE } from './foundingBattleLayers';

const R = '/dossier/founding/film';

/** Local claims (not the exhibit ledger). Every figure was read on the sources named, 2026-10-07. */
export const DEMO_CLAIMS: Record<string, { text: string; sources: string[] }> = {
  'demo-bunker-attack': {
    text: 'On 17 June 1775 the British, finding colonial forces on the Charlestown Peninsula (north of Boston) at daybreak, mounted an attack against them.',
    sources: ['Wikipedia, Battle of Bunker Hill (accessed 2026-10-07)', 'American Battlefield Trust, Bunker Hill (accessed 2026-10-07)'],
  },
  'demo-bunker-breed': {
    text: 'Most of the combat took place on Breed’s Hill, the hill next to Bunker Hill, but the battle took its name from Bunker Hill (a British map reversed the hills’ names).',
    sources: ['Wikipedia, Battle of Bunker Hill (accessed 2026-10-07)', 'American Battlefield Trust, Bunker Hill (accessed 2026-10-07)'],
  },
  'demo-bunker-british': {
    text: 'The British took the ground in a costly victory: 1,054 casualties (226 killed, 828 wounded), about 40 percent of their force.',
    sources: ['Wikipedia, Battle of Bunker Hill (accessed 2026-10-07): 1,054 casualties, a 40% casualty rate', 'American Battlefield Trust, Bunker Hill (accessed 2026-10-07): 226 killed, 828 wounded'],
  },
  'demo-bunker-american': {
    text: 'American casualties were about 450 (115 to 138 killed depending on the count, 305 wounded, 30 captured).',
    sources: ['Wikipedia, Battle of Bunker Hill (accessed 2026-10-07): about 450 in total', 'American Battlefield Trust, Bunker Hill (accessed 2026-10-07): 450 total'],
  },
  'demo-bunker-fire': {
    text: 'During the battle Admiral Graves had a carcass fired into Charlestown and sent a landing party to set the town on fire.',
    sources: ['Wikipedia, Battle of Bunker Hill (accessed 2026-10-07)'],
  },
};

/** The painting: verified on Wikimedia Commons (2026-10-07): licence tag Public domain (PD-old-100-expired, PD-Art). */
export const PAINTING_PROVENANCE = {
  title: 'The Battle of Bunker’s Hill, June 17, 1775',
  painter: 'John Trumbull',
  painted: '1786',
  collection: 'Yale University Art Gallery, accession 1832.1',
  commonsFile: 'File:John Trumbull - The Battle of Bunker’s Hill, June 17, 1775 - 1832.1 - Yale University Art Gallery.jpg',
  commonsUrl: 'https://commons.wikimedia.org/wiki/File:John_Trumbull_-_The_Battle_of_Bunker%E2%80%99s_Hill,_June_17,_1775_-_1832.1_-_Yale_University_Art_Gallery.jpg',
  licence: 'Public domain',
  fetched: '2026-10-07',
  note: 'Used at the Commons file’s own 1920 x 1278 pixels (no resampling, sharpening or colour change). The 8183 x 5388 "Bridgeman Images" file was NOT used: its colours differ strongly from the museum photograph (flags blue-grey instead of red, no fire), and it was scraped from a newspaper site.',
};

const N = (x: number, y: number): { x: number; y: number } => ({ x: x / PAINTING_SIZE.w, y: y / PAINTING_SIZE.h });
const K = (at: PaintingCamKey['at'], px: [number, number], zoom: number, through = false): PaintingCamKey => ({ at, ...N(px[0], px[1]), zoom, through });

/**
 * Camera: the whole painting at its real edges; the British line and ensign; the American flags; the group around General
 * Warren; the burning town; and back to the whole painting. Every move arrives just before the words that name its subject.
 */
const CAM: PaintingCamKey[] = [
  K(0, [960, 639], 1),
  K(1.7, [960, 639], 1),
  K({ beat: 'attack', word: 'attacked', offset: 0.2 }, [1170, 520], 2.05),
  K({ beat: 'attack', word: 'north', offset: 0.0 }, [1200, 505], 2.2),
  K({ beat: 'hill', word: 'mostly', offset: 0.2 }, [520, 340], 1.95),
  K({ beat: 'hill', word: 'Battle', offset: 0.0 }, [560, 370], 2.1),
  K({ beat: 'cost', word: 'won', offset: 0.4 }, [575, 850], 2.0),
  K({ beat: 'cost', word: 'killed', offset: 0.2 }, [585, 840], 2.12),
  K({ beat: 'after', word: 'about', offset: 0.0 }, [1010, 600], 1.65, true),
  K({ beat: 'after', word: 'fire', offset: 0.0 }, [1440, 330], 2.0),
  K({ beat: 'after', word: 'Charlestown', offset: 0.9 }, [1450, 335], 2.1),
  K({ fromEnd: 0.35 }, [960, 639], 1),
];

const PAINTING: AnimatedPaintingSpec = {
  medium: 'painting',
  asset: 'bunker-painting', depth: 'bunker-depth', masks: 'bunker-masks', fx: 'bunker-fx',
  size: PAINTING_SIZE,
  label: ANIMATED_LABEL,
  note: 'Motion is added to the 1786 painting; the brushwork is unchanged. The painting is Trumbull’s interpretation, painted years after the battle.',
  slate: {
    title: `${PAINTING_PROVENANCE.painter}, ${PAINTING_PROVENANCE.title}`,
    source: 'Yale University Art Gallery, 1832.1 · Commons',
    year: `painted ${PAINTING_PROVENANCE.painted}`,
    licence: PAINTING_PROVENANCE.licence,
  },
  cam: CAM,
  flags: FLAGS.map(({ poly: _poly, ...f }) => f),
  tail: 3.2,
  margin: { year: '1775', place: 'Charlestown, Massachusetts' },
  foley: { muskets: 9, wind: true },
};

const paintingPlate = (): PlateSpec => ({
  asset: 'bunker-painting', kind: 'archive', size: PAINTING_SIZE,
  slate: { title: PAINTING.slate.title, source: PAINTING.slate.source, year: PAINTING.slate.year, licence: PAINTING.slate.licence },
});

export const FOUNDING_BATTLE_SHOTS: CouncilShot[] = [
  { id: 'note', room: 0, kind: 'card', transition: 'silenceHold', minHold: 3.0,
    card: { lines: ['The next scene is a painting of a battle. It shows soldiers fighting, and some fallen. Any key skips it.', 'Motion is added to the painting; no figure in it is animated.'] } },
  { id: 'bunker', room: 0, kind: 'animatedPainting', painting: PAINTING,
    beats: [
      { id: 'attack', text: 'On 17 June 1775, British troops attacked American positions on the Charlestown peninsula, north of Boston.', claimIds: ['demo-bunker-attack'] },
      { id: 'hill', text: 'The fighting was mostly on Breed’s Hill, though it is remembered as the Battle of Bunker Hill.', claimIds: ['demo-bunker-breed'] },
      { id: 'cost', text: 'The British won the ground, but about 1,050 of their men were killed or wounded.', claimIds: ['demo-bunker-british'] },
      { id: 'after', text: 'American losses were about 450. The British set fire to Charlestown.', claimIds: ['demo-bunker-american', 'demo-bunker-fire'] },
    ] },
];

const ASSETS: FilmAsset[] = [
  { id: 'bunker-painting', src: `${R}/${PAINTING_FILE}`, credit: `${PAINTING_PROVENANCE.painter}, ${PAINTING_PROVENANCE.title}, ${PAINTING_PROVENANCE.painted}. ${PAINTING_PROVENANCE.collection}, via Wikimedia Commons. ${PAINTING_PROVENANCE.licence}.` },
  { id: 'bunker-depth', src: `${R}/bunker-depth.png`, credit: 'Layer: depth map from Depth Anything V2 (small), softened. Plajah.' },
  { id: 'bunker-masks', src: `${R}/bunker-masks.png`, credit: 'Layer: far plane, flag regions, fire. Hand-marked by Plajah.' },
  { id: 'bunker-fx', src: `${R}/bunker-fx.png`, credit: 'Layer: fire glow, smoke envelope, face protection. Hand-marked by Plajah.' },
];

export const FOUNDING_THEME = councilTheme(
  { display: "'Libre Caslon Display', 'Playfair Display', Georgia, 'Times New Roman', serif", accent: '#4fb3a0', bg: '#101615', upper: false },
  { titleGesture: 'set' },
);

export function buildFoundingBattleFilm(opts: { width?: number; height?: number } = {}): FilmSpec {
  const council: CouncilFilm = {
    id: 'founding-battle-demo', title: 'Bunker Hill', dates: '17 June 1775', tagline: 'A painted battle, given motion in code.',
    theme: FOUNDING_THEME, exhibitRoomCount: 1,
    rooms: [{ id: 'battle', title: 'The battle', exhibitRooms: [1, 1], wing: 'The Founding Era' }],
    titlePlate: paintingPlate(),
    shots: FOUNDING_BATTLE_SHOTS,
    endCard: [
      { head: 'The painting', lines: [
        `${PAINTING_PROVENANCE.painter}, ${PAINTING_PROVENANCE.title} (${PAINTING_PROVENANCE.painted})`, PAINTING_PROVENANCE.collection,
        'Public domain, via Wikimedia Commons', 'Shown at its real edges; the brushwork is unchanged' ] },
      { head: 'What code added (labelled ANIMATED PAINTING)', lines: [
        'A slow camera between the painting’s groups', 'Smoke drifting in the painting’s own colours, behind the figures',
        'Flags rippling inside hand-marked regions', 'Far-plane parallax; fire flicker; a drifting cloud shadow', 'Nothing drawn on a figure; no one animated' ] },
      { head: 'Layers', lines: ['Depth: Depth Anything V2 (small), softened', 'Flag regions, faces and smoke banks hand-marked by Plajah'] },
      { head: 'Sources', lines: [
        'Battle of Bunker Hill, Wikipedia (read 7 October 2026)', 'American Battlefield Trust, Bunker Hill (read 7 October 2026)',
        'British 1,054 casualties; American about 450' ] },
      { head: 'Narration', lines: ['This cut is silent; captions carry the narration'] },
      { head: 'Sound', lines: ['Distant musket thuds and wind, synthesised for Plajah', 'Credited as generated'] },
      { head: 'Type', lines: ['Libre Caslon Display, Source Serif 4, Inter Tight (SIL Open Font License)'] },
      { head: 'Status', lines: ['A demonstration of the animated-painting scene type', 'Not part of the Founding exhibit’s evidence ledger'] },
    ],
    accentTerms: ['Charlestown', 'Boston', 'Breed’s Hill', 'Bunker Hill', 'British', 'American', 'John Trumbull'],
    honesty: 'Real paintings first. Motion is labelled.',
    endLen: 7,
  };
  return {
    id: 'founding-battle-film', title: 'Bunker Hill', width: opts.width ?? 1920, height: opts.height ?? 1080, fps: 30,
    style: 'council', council, scenes: [], assets: ASSETS,
  };
}

/** Browser loader: the face is self-hosted beside the layers; wait for its stylesheet before the renderer measures type. */
export async function loadFoundingBattleFilm(width?: number, height?: number): Promise<FilmSpec> {
  const href = `${R}/fonts/fonts.css`;
  if (typeof document !== 'undefined' && !document.querySelector(`link[href="${href}"]`)) {
    await new Promise<void>(res => {
      const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
      l.addEventListener('load', () => res(), { once: true }); l.addEventListener('error', () => res(), { once: true });
      document.head.appendChild(l); setTimeout(res, 6000);
    });
  }
  return buildFoundingBattleFilm({ width, height });
}
