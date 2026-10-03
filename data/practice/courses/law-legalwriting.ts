import { assemble } from '../courseKit';
import { PART as t1 } from './law-legalwriting/t1';
import { PART as t2 } from './law-legalwriting/t2';
import { PART as t3 } from './law-legalwriting/t3';
import { PART as t4 } from './law-legalwriting/t4';
import { PART as t5 } from './law-legalwriting/t5';

export const COURSE_MODULE = assemble({
  id: 'law-legalwriting',
  label: 'Legal Research, Writing and Advocacy',
  blurb: 'First-year legal skills: finding and validating law, IRAC and CREAC, memos and briefs, standards of review, drafting, oral argument, and candor to the tribunal.',
  accent: '#C9A227',
  framework: 'plajah-law',
}, [t1, t2, t3, t4, t5]);
