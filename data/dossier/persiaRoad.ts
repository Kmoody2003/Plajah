/**
 * Stops for the Persia "Road" experience. Words and captions come from the approved design prototype
 * (public/dossier/design-direction.html). The route is schematic, never a survey map.
 */

export interface RoadStop {
  id: string;
  /** Position on the schematic route (viewBox 900x260). */
  x: number; y: number;
  name: string;
  /** The big faded word behind the panel, and the font stack to set it in. */
  word: string; wordFont: string; zh?: boolean;
  /** Reconstruction painting behind the panel (public path). */
  art: string;
  /** Pan for the slow drift: [x0, y0, x1, y1] in percent. */
  pan: [number, number, number, number];
  cap: string;
  /** Glyph shown large on the card. */
  glyph: string;
  era: string;
  text: string;
  /** How much of the route is drawn up to this stop (0..100). */
  progress: number;
}

const SYRIAC = "'Noto Sans Syriac', 'Estrangelo Edessa', serif";
const CJK = "'Noto Serif SC', 'Songti SC', 'SimSun', serif";

export const ROAD_PATH = 'M60 170 C190 140 250 90 380 110 S560 170 640 120 S780 70 850 90';

export const ROAD_DISCLAIMER = 'Schematic route, not a survey map. A real historical basemap and a dated source for each stop are still to come.';
export const ROAD_BG_NOTE = 'Background paintings are reconstructions, not photographs.';

export const ROAD_STOPS: RoadStop[] = [
  { id: 'ctesiphon', x: 60, y: 170, name: 'Seleucia-Ctesiphon', word: 'ܥܕܬܐ', wordFont: SYRIAC,
    art: '/dossier/persia/recon/recon-ctesiphon-vault.jpg', pan: [-3, 2, 3, -2],
    cap: 'Syriac · edta · “the church”', glyph: 'ܥܕܬܐ',
    era: 'Capital of the Sasanian Empire',
    text: 'Where the Church of the East gathered its bishops. The language of its liturgy and its books was Syriac.', progress: 0 },
  { id: 'merv', x: 250, y: 112, name: 'Merv', word: 'ܡܫܝܚܐ', wordFont: SYRIAC,
    art: '/dossier/persia/recon/recon-synod-hall.jpg', pan: [3, -1, -3, 2],
    cap: 'Syriac · mshiha · “the Messiah”', glyph: 'ܡܫܝܚܐ',
    era: 'Eastern Iran, a metropolitan see',
    text: 'A hub on the road east, with a Christian community and bishop in the fifth century.', progress: 30 },
  { id: 'samarkand', x: 430, y: 128, name: 'Samarkand', word: 'ܐܠܗܐ', wordFont: SYRIAC,
    art: '/dossier/persia/recon/recon-silk-road-caravan.jpg', pan: [-2, -2, 3, 2],
    cap: 'Syriac script carried Sogdian here · alaha · “God”', glyph: 'ܐܠܗܐ',
    era: 'Sogdiana',
    text: 'Merchants carried the faith along the trade routes; Syriac texts were translated into Sogdian.', progress: 55 },
  { id: 'turfan', x: 640, y: 120, name: 'Turfan', word: 'ܟܬܒܐ', wordFont: SYRIAC,
    art: '/dossier/persia/recon/recon-arghun-letter.jpg', pan: [3, 2, -3, -1],
    cap: 'Syriac script carried Turkic here · ktaba · “the book”', glyph: 'ܟܬܒܐ',
    era: 'Tarim Basin',
    text: 'Manuscripts in Syriac, Sogdian and Turkic survive from the oasis towns.', progress: 78 },
  { id: 'changan', x: 850, y: 90, name: "Chang'an", word: '景教', wordFont: CJK, zh: true,
    art: '/dossier/persia/recon/recon-stele-courtyard.jpg', pan: [0, 3, 0, -3],
    cap: 'Chinese · Jingjiao · “the Luminous Religion”', glyph: '景教',
    era: 'AD 635 · the Xi’an Stele, AD 781',
    text: 'A Syriac-Chinese monument records the arrival of the faith under the Tang. The exhibit shows the stele and what each line says.', progress: 100 },
];
