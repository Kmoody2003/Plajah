/**
 * The Classic Literature program: study guides + comprehension questions for every classic in
 * data/classicBooks.ts, presented as a Curriculum so it plugs into the Learn map (each book is a
 * lesson with mastery) and into the Language Arts Reading Room.
 */
import type { Curriculum, Track } from '../services/schoolChassis';
import type { Question } from './practice/types';
import type { ClassicGuide, GradeBand } from './languageArtsTypes';
import { GUIDES_A } from './languageArtsGuidesA';
import { GUIDES_B } from './languageArtsGuidesB';
import { CLASSICS_A_QUESTIONS } from './practice/classics-a';
import { CLASSICS_B_QUESTIONS } from './practice/classics-b';
import { CLASSIC_BOOKS } from './classicBooks';

export const CLASSIC_GUIDES: ClassicGuide[] = [...GUIDES_A, ...GUIDES_B];
export const CLASSIC_QUESTIONS: Question[] = [...CLASSICS_A_QUESTIONS, ...CLASSICS_B_QUESTIONS];
export const CLASSIC_CURRICULUM_ID = 'classic-literature';

export const BAND_LABEL: Record<GradeBand, string> = { '3-5': 'Grades 3-5', '6-8': 'Grades 6-8', '9-12': 'Grades 9-12', college: 'College' };
export const BAND_ORDER: GradeBand[] = ['3-5', '6-8', '9-12', 'college'];

export const guideFor = (id: string) => CLASSIC_GUIDES.find(g => g.id === id);
export const bookFor = (id: string) => CLASSIC_BOOKS.find(b => b.id === id);

/** Curriculum view of the program: one track per grade band, one lesson per book. */
export const CLASSIC_LITERATURE: Curriculum = {
  id: CLASSIC_CURRICULUM_ID,
  label: 'Classic Literature',
  blurb: 'Great books, read free in Lorea, with study guides and the Chora Vault to hear their world.',
  accent: '#D40055',
  framework: 'ccss',
  tracks: BAND_ORDER.map((band): Track => ({
    id: `band-${band}`,
    title: BAND_LABEL[band],
    blurb: `Classics suited to ${BAND_LABEL[band].toLowerCase()} readers.`,
    lessons: CLASSIC_GUIDES.filter(g => g.gradeBand === band).map(g => ({
      id: g.id, title: g.title, blurb: g.context, body: g.context,
      resources: [{ label: 'Read free on Project Gutenberg', url: `https://www.gutenberg.org/ebooks/${g.id}` }],
    })),
  })).filter(t => t.lessons.length > 0),
};
