import { assemble } from '../courseKit';
import { PART as t1 } from './med-anatomy/t1';
import { PART as t2 } from './med-anatomy/t2';
import { PART as t3 } from './med-anatomy/t3';
import { PART as t4 } from './med-anatomy/t4';
import { PART as t5 } from './med-anatomy/t5';
import { PART as t6 } from './med-anatomy/t6';

export const COURSE_MODULE = assemble({ id: 'med-anatomy', label: 'Human Anatomy', blurb: 'Gross anatomy by region with clinical correlation: back and cord, thorax, abdomen, pelvis, limbs, head and neck, plus surface, embryologic and imaging anatomy.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5, t6]);
