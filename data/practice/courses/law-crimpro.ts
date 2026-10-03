import { assemble } from '../courseKit';
import { PART as t1 } from './law-crimpro/t1';
import { PART as t2 } from './law-crimpro/t2';
import { PART as t3 } from './law-crimpro/t3';
import { PART as t4 } from './law-crimpro/t4';
import { PART as t5 } from './law-crimpro/t5';

export const COURSE_MODULE = assemble({
  id: 'law-crimpro', label: 'Criminal Procedure',
  blurb: 'US constitutional criminal procedure: searches, seizures and warrants, Miranda and self-incrimination, double jeopardy, the Sixth Amendment trial rights, bail and pleas, the Eighth Amendment, and habeas corpus.',
  accent: '#C9A227', framework: 'plajah-law',
}, [t1, t2, t3, t4, t5]);
