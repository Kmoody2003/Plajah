import { assemble } from '../courseKit';
import { PART as t1 } from './med-clin-obgyn/t1';
import { PART as t2 } from './med-clin-obgyn/t2';
import { PART as t3 } from './med-clin-obgyn/t3';
import { PART as t4 } from './med-clin-obgyn/t4';
import { PART as t5 } from './med-clin-obgyn/t5';
import { PART as t6 } from './med-clin-obgyn/t6';

export const COURSE_MODULE = assemble({
  id: 'med-clin-obgyn', label: 'Obstetrics and Gynecology',
  blurb: 'Third-year clerkship and Step 2 level obstetrics and gynecology: prenatal care, labor, pregnancy complications, postpartum care, contraception, gynecologic disorders, infertility, menopause, cancer screening and reproductive health.',
  accent: '#E5484D', framework: 'plajah-medicine',
}, [t1, t2, t3, t4, t5, t6]);
