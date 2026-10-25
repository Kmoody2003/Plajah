/**
 * Art College programs (majors, minors, certificate). Course codes refer to the catalog in
 * data/artCollege/index.ts; the test suite checks every code exists, prerequisites are met by an
 * earlier year, and each program's courses + electives add up to its stated credits.
 *
 * Credit model: 3 credits per standard course, 6 for thesis/capstone studios; 30 credits a year.
 * Year 1 is the same Foundation year for every BFA, so a learner can choose a major with evidence.
 */
import type { Program } from './types';

const Y1 = ['FND 101', 'FND 102', 'FND 103', 'FND 104', 'FND 105', 'FND 106', 'AHI 101', 'AHI 102'];

export const PROGRAMS: Program[] = [
  {
    id: 'bfa-graphic-design', title: 'BFA Graphic Design', degree: 'BFA', credits: 120,
    blurb: 'Typography, identity, editorial, interaction and motion — a designer who can set a page, build a brand system, test an interface and defend each choice.',
    careers: ['Graphic / brand designer', 'Art director', 'UX / product designer', 'Motion designer', 'Packaging designer', 'Design studio founder'],
    capstone: 'A complete brand system and campaign for a real or realistic client, with a research dossier and a public defense.',
    years: [
      { year: 1, label: 'Foundation', courses: Y1, electives: 2, review: 'foundation' },
      { year: 2, label: 'Letter, Image & Motion', courses: ['GRD 201', 'GRD 202', 'GRD 303', 'ILL 201', 'PHO 201', 'AHI 201'], electives: 4, review: 'sophomore' },
      { year: 3, label: 'Systems', courses: ['GRD 301', 'GRD 302', 'GRD 304', 'CRT 301', 'AHI 302', 'PRO 301'], electives: 4, review: 'junior' },
      { year: 4, label: 'Thesis', courses: ['GRD 401', 'PRO 401', 'AHI 303'], electives: 5, review: 'senior' },
    ],
  },
  {
    id: 'bfa-painting-drawing', title: 'BFA Painting & Drawing', degree: 'BFA', credits: 120,
    blurb: 'Observation, colour and concept from the first drawing to a solo thesis show — oil, acrylic, water media and print — grounded in the history of painting you study in the museum.',
    careers: ['Studio artist', 'Muralist', 'Art educator', 'Conservator-in-training', 'Gallery or museum preparator', 'Illustrator'],
    capstone: 'A body of 8–12 paintings with a thesis paper, installed and defended in a public exhibition.',
    years: [
      { year: 1, label: 'Foundation', courses: Y1, electives: 2, review: 'foundation' },
      { year: 2, label: 'Paint, Water, Print', courses: ['DRP 201', 'DRP 202', 'PRT 201', 'SCU 201', 'AHI 201', 'CRT 301'], electives: 4, review: 'sophomore' },
      { year: 3, label: 'Light, Figure, Abstraction', courses: ['DRP 301', 'DRP 302', 'DRP 303', 'PRT 301', 'AHI 302', 'PRO 301'], electives: 4, review: 'junior' },
      { year: 4, label: 'Thesis', courses: ['DRP 401', 'PRO 401', 'AHI 303'], electives: 5, review: 'senior' },
    ],
  },
  {
    id: 'bfa-sculpture-ceramics', title: 'BFA Sculpture & Ceramics', degree: 'BFA', credits: 120,
    blurb: 'Clay, plaster, metal, wood and digital fabrication; installation and public art; with the object histories of sculpture and craft as the working library.',
    careers: ['Sculptor', 'Ceramicist', 'Fabricator', 'Public-art artist', 'Exhibit and set maker', 'Studio technician'],
    capstone: 'A site-aware body of sculptural work installed in a public exhibition, with a thesis paper.',
    years: [
      { year: 1, label: 'Foundation', courses: Y1, electives: 2, review: 'foundation' },
      { year: 2, label: 'Clay, Plaster, Print', courses: ['SCU 201', 'SCU 202', 'DRP 201', 'PRT 201', 'AHI 201', 'CRT 301'], electives: 4, review: 'sophomore' },
      { year: 3, label: 'Fabrication & Site', courses: ['SCU 301', 'SCU 302', 'AHI 302', 'AHI 306', 'PRO 301', 'PHO 201'], electives: 4, review: 'junior' },
      { year: 4, label: 'Thesis', courses: ['SCU 401', 'PRO 401', 'AHI 304'], electives: 5, review: 'senior' },
    ],
  },
  {
    id: 'bfa-illustration', title: 'BFA Illustration', degree: 'BFA', credits: 120,
    blurb: 'Narrative picture-making for books, comics, editorial, games and screens — drawn and painted skill, plus the business of rights and commissions.',
    careers: ['Editorial illustrator', 'Children\'s book illustrator', 'Comics creator', 'Concept artist', 'Storyboard artist', 'Surface / pattern designer'],
    capstone: 'A complete illustrated project (book, graphic narrative or series) with a pitch deck and process book.',
    years: [
      { year: 1, label: 'Foundation', courses: Y1, electives: 2, review: 'foundation' },
      { year: 2, label: 'Story & Surface', courses: ['ILL 201', 'DRP 201', 'DRP 202', 'GRD 201', 'PRT 201', 'AHI 201'], electives: 4, review: 'sophomore' },
      { year: 3, label: 'Sequence & Digital', courses: ['ILL 301', 'ILL 302', 'GRD 303', 'AHI 302', 'CRT 301', 'PRO 301'], electives: 4, review: 'junior' },
      { year: 4, label: 'Thesis', courses: ['ILL 401', 'PRO 401', 'AHI 303'], electives: 5, review: 'senior' },
    ],
  },
  {
    id: 'bfa-fashion-design', title: 'BFA Fashion Design', degree: 'BFA', credits: 120,
    blurb: 'From fashion drawing and textile science to pattern-making, draping and construction; with fashion history, sustainability and supply chains as core, not electives.',
    careers: ['Fashion designer', 'Pattern maker', 'Technical designer', 'Costume designer', 'Textile designer', 'Sustainable-fashion specialist'],
    capstone: 'A 6–8 look collection, with tech packs, toiles, lookbook and a runway or digital show, defended with a materials and supply-chain statement.',
    years: [
      { year: 1, label: 'Foundation', courses: Y1, electives: 2, review: 'foundation' },
      { year: 2, label: 'Drawing, Cloth, Culture', courses: ['FAS 201', 'FAS 202', 'FAS 303', 'GRD 201', 'PHO 201', 'AHI 201'], electives: 4, review: 'sophomore' },
      { year: 3, label: 'Pattern & Construction', courses: ['FAS 301', 'FAS 302', 'FAS 304', 'CRT 301', 'ILL 201', 'PRO 301'], electives: 4, review: 'junior' },
      { year: 4, label: 'Collection', courses: ['FAS 401', 'PRO 401', 'AHI 302'], electives: 5, review: 'senior' },
    ],
  },
  {
    id: 'ba-art-history', title: 'BA Art History', degree: 'BA', credits: 120,
    blurb: 'A global art history built on looking: methods, the full survey, region and period depth, museum studies, and a senior thesis researched in open collections.',
    careers: ['Curator or curatorial assistant', 'Museum educator', 'Collections researcher', 'Provenance researcher', 'Art writer / critic', 'Archivist', 'Gallery professional'],
    capstone: 'A senior thesis (5,000+ words) on an object or group of objects, with an exhibition or online catalogue.',
    years: [
      { year: 1, label: 'Looking', courses: ['FND 101', 'FND 102', 'AHI 101', 'AHI 102'], electives: 6, review: 'foundation' },
      { year: 2, label: 'Methods & Periods', courses: ['AHI 201', 'AHI 301', 'AHI 302', 'AHI 304', 'CRT 301'], electives: 5, review: 'sophomore' },
      { year: 3, label: 'Regions & Museums', courses: ['AHI 303', 'AHI 305', 'AHI 306', 'AHI 401', 'PRO 301'], electives: 5, review: 'junior' },
      { year: 4, label: 'Thesis', courses: ['AHI 490', 'PRO 401'], electives: 6, review: 'senior' },
    ],
  },
  {
    id: 'minor-photography', title: 'Minor in Photography', degree: 'MINOR', credits: 18,
    blurb: 'Light, exposure, series and the photobook — tied to the Photography & Art School strands.',
    careers: ['Photographer', 'Photo editor', 'Visual storyteller'], capstone: 'A photo series and photobook dummy.',
    years: [{ year: 1, label: 'Sequence', courses: ['FND 105', 'PHO 201', 'PHO 301', 'AHI 102'], electives: 2 }],
  },
  {
    id: 'minor-studio-art', title: 'Minor in Studio Art', degree: 'MINOR', credits: 18,
    blurb: 'Six courses that give any major drawing, colour, design and one studio specialty.',
    careers: ['Any field that values visual thinking'], capstone: 'A six-piece portfolio reviewed by a panel.',
    years: [{ year: 1, label: 'Sequence', courses: ['FND 101', 'FND 102', 'FND 103', 'DRP 201'], electives: 2 }],
  },
  {
    id: 'minor-art-history', title: 'Minor in Art History', degree: 'MINOR', credits: 18,
    blurb: 'The global survey, methods, and one period or region of depth.',
    careers: ['Any field that values visual literacy'], capstone: 'A 3,000-word object study.',
    years: [{ year: 1, label: 'Sequence', courses: ['AHI 101', 'AHI 102', 'AHI 201', 'AHI 302'], electives: 2 }],
  },
  {
    id: 'cert-foundation', title: 'Foundation Certificate', degree: 'CERTIFICATE', credits: 24,
    blurb: 'The one-year foundation program on its own — the entry route for adults returning to art, and the first year of every BFA.',
    careers: ['Prepare a BFA portfolio', 'Career-change learners'], capstone: 'The Foundation Review portfolio.',
    years: [{ year: 1, label: 'Foundation', courses: Y1, electives: 0, review: 'foundation' }],
  },
];

export const programById = (id: string) => PROGRAMS.find(p => p.id === id);
