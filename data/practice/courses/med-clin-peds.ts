import { assemble } from '../courseKit';
import { PART as t1 } from './med-clin-peds/t1';
import { PART as t2 } from './med-clin-peds/t2';
import { PART as t3 } from './med-clin-peds/t3';
import { PART as t4 } from './med-clin-peds/t4';
import { PART as t5 } from './med-clin-peds/t5';
import { PART as t6 } from './med-clin-peds/t6';

export const COURSE_MODULE = assemble({
  id: 'med-clin-peds', label: 'Pediatrics',
  blurb: 'Third-year clerkship and Step 2 level pediatrics: growth, the newborn, genetics, infection and immunization, organ-system disease, child abuse and adolescent medicine.',
  accent: '#E5484D', framework: 'plajah-medicine',
}, [t1, t2, t3, t4, t5, t6]);
