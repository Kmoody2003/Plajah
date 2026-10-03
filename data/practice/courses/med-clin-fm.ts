import { assemble } from '../courseKit';
import { PART as t1 } from './med-clin-fm/t1';
import { PART as t2 } from './med-clin-fm/t2';
import { PART as t3 } from './med-clin-fm/t3';
import { PART as t4 } from './med-clin-fm/t4';
import { PART as t5 } from './med-clin-fm/t5';
import { PART as t6 } from './med-clin-fm/t6';

export const COURSE_MODULE = assemble({ id: 'med-clin-fm', label: 'Family and Preventive Medicine', blurb: 'Primary care reasoning, USPSTF-based screening and prevention, immunization, chronic disease, men\'s, women\'s and older adult health, nutrition, counseling, musculoskeletal, dermatologic, occupational and environmental health.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5, t6]);
