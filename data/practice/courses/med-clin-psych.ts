import { assemble } from '../courseKit';
import { PART as t1 } from './med-clin-psych/t1';
import { PART as t2 } from './med-clin-psych/t2';
import { PART as t3 } from './med-clin-psych/t3';
import { PART as t4 } from './med-clin-psych/t4';
import { PART as t5 } from './med-clin-psych/t5';
import { PART as t6 } from './med-clin-psych/t6';

export const COURSE_MODULE = assemble({ id: 'med-clin-psych', label: 'Psychiatry', blurb: 'Mood, anxiety, psychotic, trauma, personality, eating, neurodevelopmental, neurocognitive and substance use disorders, with psychopharmacology, psychotherapy, suicide risk and capacity for the clerkship and Step 2.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5, t6]);
