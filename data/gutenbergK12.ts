// gutenbergK12 — the public-domain K-12 shelf, mirrored into the Lorea reader.
//
// AN HONEST NOTE ON WHAT THIS IS AND ISN'T.
//
// Project Gutenberg is not a source of modern K-12 textbooks. A search of its catalogue for
// school maths, science or history texts returns essentially nothing usable — the works are
// public domain because they are old, and a 1900 geography textbook is a historical artifact,
// not a teaching resource. What Gutenberg genuinely provides for schools is two things:
//
//   1. LITERATURE — the ELA reading backbone, complete and unrestricted, from picture-book-age
//      fairy tales through to the high-school canon. This is the real prize, and it is why
//      every ELA seed template in the library points here rather than at a publisher.
//   2. THE McGUFFEY READERS — genuine graded schoolbooks (1836-1879) that were the American
//      classroom standard for a century. They are the one true "textbook" series here, and are
//      still usable for early decoding and fluency practice.
//
// The McGuffey texts carry the moral, religious and cultural assumptions of their period,
// including passages a modern classroom would want to frame or skip. They are included for
// their graded reading structure; `periodPiece: true` marks them so the UI can say so rather
// than presenting a 19th-century schoolbook as current material.
//
// Still missing after this, and NOT solved by Gutenberg: K-5 maths, science and social studies.
// Those need a different source (Utah OER / UEN and Saylor are the candidates on the register).

import type { GradeBand, LibrarySubject } from './oerLibrary';

export interface GutenbergSeed {
  /** Gutenberg ebook id — the number in gutenberg.org/ebooks/<id>. */
  id: number;
  title: string;
  author?: string;
  gradeBands: GradeBand[];
  subjects: LibrarySubject[];
  /** A period schoolbook rather than current material — surfaced in the UI. */
  periodPiece?: boolean;
  note?: string;
}

/** The McGuffey Eclectic Readers — graded, in order. The one real textbook series here. */
export const MCGUFFEY_READERS: GutenbergSeed[] = [
  { id: 14640, title: "McGuffey's First Eclectic Reader", author: 'William Holmes McGuffey', gradeBands: ['K-2'], subjects: ['ela'], periodPiece: true, note: 'Beginning decoding: short words, primer sentences.' },
  { id: 14668, title: "McGuffey's Second Eclectic Reader", author: 'William Holmes McGuffey', gradeBands: ['K-2'], subjects: ['ela'], periodPiece: true, note: 'Early fluency: short passages with comprehension questions.' },
  { id: 14766, title: "McGuffey's Third Eclectic Reader", author: 'William Holmes McGuffey', gradeBands: ['3-5'], subjects: ['ela'], periodPiece: true, note: 'Longer narrative passages; vocabulary and articulation drills.' },
  { id: 14880, title: "McGuffey's Fourth Eclectic Reader", author: 'William Holmes McGuffey', gradeBands: ['3-5'], subjects: ['ela'], periodPiece: true, note: 'Prose and verse with elocution notes.' },
  { id: 15040, title: "McGuffey's Fifth Eclectic Reader", author: 'William Holmes McGuffey', gradeBands: ['3-5', '6-8'], subjects: ['ela'], periodPiece: true, note: 'Excerpts from classic authors; rhetorical analysis.' },
  { id: 16751, title: "McGuffey's Sixth Eclectic Reader", author: 'William Holmes McGuffey', gradeBands: ['6-8'], subjects: ['ela'], periodPiece: true, note: 'Advanced elocution and literary selections.' },
];

/** Literature, banded by the age it is usually taught at rather than by reading difficulty. */
export const GUTENBERG_LITERATURE: GutenbergSeed[] = [
  // ── K-2 / 3-5 ──
  { id: 11, title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', gradeBands: ['3-5', '6-8'], subjects: ['ela'] },
  { id: 55, title: 'The Wonderful Wizard of Oz', author: 'L. Frank Baum', gradeBands: ['3-5'], subjects: ['ela'] },
  { id: 2591, title: "Grimms' Fairy Tales", author: 'Jacob & Wilhelm Grimm', gradeBands: ['K-2', '3-5'], subjects: ['ela'] },
  { id: 19002, title: "Aesop's Fables", author: 'Aesop', gradeBands: ['K-2', '3-5'], subjects: ['ela'] },
  { id: 271, title: 'Black Beauty', author: 'Anna Sewell', gradeBands: ['3-5'], subjects: ['ela'] },
  { id: 113, title: 'The Secret Garden', author: 'Frances Hodgson Burnett', gradeBands: ['3-5'], subjects: ['ela'] },
  { id: 16, title: 'Peter Pan', author: 'J. M. Barrie', gradeBands: ['3-5'], subjects: ['ela'] },
  { id: 2781, title: 'Just So Stories', author: 'Rudyard Kipling', gradeBands: ['K-2', '3-5'], subjects: ['ela'] },

  // ── 6-8 ──
  { id: 74, title: 'The Adventures of Tom Sawyer', author: 'Mark Twain', gradeBands: ['6-8'], subjects: ['ela'] },
  { id: 120, title: 'Treasure Island', author: 'Robert Louis Stevenson', gradeBands: ['6-8'], subjects: ['ela'] },
  { id: 45, title: 'Anne of Green Gables', author: 'L. M. Montgomery', gradeBands: ['6-8'], subjects: ['ela'] },
  { id: 215, title: 'The Call of the Wild', author: 'Jack London', gradeBands: ['6-8'], subjects: ['ela'] },
  { id: 46, title: 'A Christmas Carol', author: 'Charles Dickens', gradeBands: ['6-8'], subjects: ['ela'] },
  { id: 35, title: 'The Time Machine', author: 'H. G. Wells', gradeBands: ['6-8', '9-12'], subjects: ['ela'] },
  { id: 514, title: 'Little Women', author: 'Louisa May Alcott', gradeBands: ['6-8'], subjects: ['ela'] },

  // ── 9-12 ──
  { id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen', gradeBands: ['9-12'], subjects: ['ela'] },
  { id: 84, title: 'Frankenstein', author: 'Mary Wollstonecraft Shelley', gradeBands: ['9-12'], subjects: ['ela'] },
  { id: 1260, title: 'Jane Eyre', author: 'Charlotte Brontë', gradeBands: ['9-12'], subjects: ['ela'] },
  { id: 76, title: 'Adventures of Huckleberry Finn', author: 'Mark Twain', gradeBands: ['9-12'], subjects: ['ela'] },
  { id: 2701, title: 'Moby Dick', author: 'Herman Melville', gradeBands: ['9-12'], subjects: ['ela'] },
  { id: 25344, title: 'The Scarlet Letter', author: 'Nathaniel Hawthorne', gradeBands: ['9-12'], subjects: ['ela'] },
  { id: 1513, title: 'Romeo and Juliet', author: 'William Shakespeare', gradeBands: ['9-12'], subjects: ['ela'] },
  { id: 1524, title: 'Hamlet', author: 'William Shakespeare', gradeBands: ['9-12'], subjects: ['ela'] },
  { id: 1727, title: 'The Odyssey', author: 'Homer', gradeBands: ['9-12'], subjects: ['ela'] },

  // ── Primary sources: ELA and social studies both ──
  { id: 23, title: 'Narrative of the Life of Frederick Douglass', author: 'Frederick Douglass', gradeBands: ['9-12'], subjects: ['ela', 'socialStudies'] },
  { id: 147, title: 'Common Sense', author: 'Thomas Paine', gradeBands: ['9-12'], subjects: ['socialStudies'] },
  { id: 205, title: 'Walden', author: 'Henry David Thoreau', gradeBands: ['9-12'], subjects: ['ela', 'socialStudies'] },
];

export const GUTENBERG_K12: GutenbergSeed[] = [...MCGUFFEY_READERS, ...GUTENBERG_LITERATURE];

/** Deterministic album id, matching the OpenStax convention. */
export const gutenbergBookId = (id: number) => `gutenberg_${id}`;

export const gutenbergSeedById = (id: number): GutenbergSeed | undefined =>
  GUTENBERG_K12.find(b => b.id === id);

export function gutenbergByBand(band: GradeBand): GutenbergSeed[] {
  return GUTENBERG_K12.filter(b => b.gradeBands.includes(band));
}
