import { assemble } from '../courseKit';
import { PART as t1 } from './med-physiology/t1';
import { PART as t2 } from './med-physiology/t2';
import { PART as t3 } from './med-physiology/t3';
import { PART as t4 } from './med-physiology/t4';
import { PART as t5 } from './med-physiology/t5';

export const COURSE_MODULE = assemble({ id: 'med-physiology', label: 'Human Physiology', blurb: 'Medical-school physiology from membranes to whole-body integration: cardiovascular, respiratory, renal, GI, endocrine, reproductive and integrated responses.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
