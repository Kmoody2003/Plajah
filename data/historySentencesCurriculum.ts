/**
 * Grammar through history: every conventions question is a sentence about real music, film, art or
 * business history, so a learner practices grammar and learns a true fact at the same time.
 * Presented as a Curriculum (one lesson per grammar skill) so it plugs into the Learn map.
 */
import type { Curriculum, Track } from '../services/schoolChassis';
import { HISTORY_SENTENCE_SKILLS } from './practice/history-sentences';

const BANDS: Array<{ id: '1-2' | '3-5' | '6-8' | '9-12'; title: string }> = [
  { id: '1-2', title: 'Grades 1-2' }, { id: '3-5', title: 'Grades 3-5' }, { id: '6-8', title: 'Grades 6-8' }, { id: '9-12', title: 'Grades 9-12' },
];

export const HISTORY_SENTENCES: Curriculum = {
  id: 'history-sentences',
  label: 'Grammar Through History',
  blurb: 'Practice grammar on real sentences about the history of music, film, art and money.',
  accent: '#7a2bd6',
  framework: 'ccss',
  tracks: BANDS.map((b): Track => ({
    id: `hs-band-${b.id}`, title: b.title, blurb: `Conventions of English for ${b.title.toLowerCase()}, learned through real history.`,
    lessons: HISTORY_SENTENCE_SKILLS.filter(s => s.gradeBand === b.id).map(s => ({ id: s.id, title: s.title, blurb: s.blurb, body: s.blurb })),
  })).filter(t => t.lessons.length > 0),
};
