import { assemble } from '../courseKit';
import { PART as t1 } from './law-business-orgs/t1';
import { PART as t2 } from './law-business-orgs/t2';
import { PART as t3 } from './law-business-orgs/t3';
import { PART as t4 } from './law-business-orgs/t4';
import { PART as t5 } from './law-business-orgs/t5';

export const COURSE_MODULE = assemble({
  id: 'law-business-orgs',
  label: 'Business Organizations and Corporate Law',
  blurb: 'Agency, partnerships, LLCs and corporations: formation, piercing the veil, fiduciary duties, shareholder rights, M&A, securities regulation and Delaware.',
  accent: '#C9A227',
  framework: 'plajah-law',
}, [t1, t2, t3, t4, t5]);
