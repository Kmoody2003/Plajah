import { assemble } from '../courseKit';
import { PART as t1 } from './med-clin-im/t1';
import { PART as t2 } from './med-clin-im/t2';
import { PART as t3 } from './med-clin-im/t3';
import { PART as t4 } from './med-clin-im/t4';
import { PART as t5 } from './med-clin-im/t5';
export const COURSE_MODULE = assemble({ id: 'med-clin-im', label: 'Internal Medicine', blurb: 'Clerkship and Step 2 level internal medicine: cardiology, pulmonology, GI and hepatology, nephrology, endocrinology, hematology and oncology, infectious disease, rheumatology and geriatrics.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
