import { assemble } from '../courseKit';
import { PART as t1 } from './med-clin-em/t1';
import { PART as t2 } from './med-clin-em/t2';
import { PART as t3 } from './med-clin-em/t3';
import { PART as t4 } from './med-clin-em/t4';
import { PART as t5 } from './med-clin-em/t5';
import { PART as t6 } from './med-clin-em/t6';

export const COURSE_MODULE = assemble({ id: 'med-clin-em', label: 'Emergency and Critical Care', blurb: 'The primary survey, airway, shock, resuscitation, sepsis, toxicology, environmental emergencies, cardiac and respiratory emergencies, trauma, and ventilator and ICU basics for the clerkship and Step 2.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5, t6]);
