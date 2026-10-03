import { assemble } from '../courseKit';
import { PART as t1 } from './med-g912/t1';
import { PART as t2 } from './med-g912/t2';
import { PART as t3 } from './med-g912/t3';
import { PART as t4 } from './med-g912/t4';
import { PART as t5 } from './med-g912/t5';

export const COURSE_MODULE = assemble({
  id: 'med-g912',
  label: 'Introduction to Medicine and Biomedical Science',
  blurb: 'How the body works, how disease arises, how doctors diagnose, treat and weigh evidence, and what it takes to become a clinician.',
  accent: '#E5484D',
  framework: 'plajah-medicine',
}, [t1, t2, t3, t4, t5]);
