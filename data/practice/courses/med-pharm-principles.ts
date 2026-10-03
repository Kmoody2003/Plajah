import { assemble } from '../courseKit';
import { PART as t1 } from './med-pharm-principles/t1';
import { PART as t2 } from './med-pharm-principles/t2';
import { PART as t3 } from './med-pharm-principles/t3';
import { PART as t4 } from './med-pharm-principles/t4';
import { PART as t5 } from './med-pharm-principles/t5';

export const COURSE_MODULE = assemble({ id: 'med-pharm-principles', label: 'Pharmacology: Principles', blurb: 'How drugs move through the body, how they act, how they interact and fail, and how they are developed and prescribed safely.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
