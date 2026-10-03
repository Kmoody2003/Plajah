import { assemble } from '../courseKit';
import { PART as t1 } from './law-admin/t1';
import { PART as t2 } from './law-admin/t2';
import { PART as t3 } from './law-admin/t3';
import { PART as t4 } from './law-admin/t4';

export const COURSE_MODULE = assemble({
  id: 'law-admin',
  label: 'Administrative Law',
  blurb: 'The administrative state, delegation, rulemaking and adjudication under the APA, judicial review, standing, agency interpretation and deference after Loper Bright, presidential control, and FOIA.',
  accent: '#C9A227',
  framework: 'plajah-law',
}, [t1, t2, t3, t4]);
