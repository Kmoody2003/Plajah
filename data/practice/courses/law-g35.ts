import { assemble } from '../courseKit';
import { PART as t1 } from './law-g35/t1';
import { PART as t2 } from './law-g35/t2';
import { PART as t3 } from './law-g35/t3';
import { PART as t4 } from './law-g35/t4';
import { PART as t5 } from './law-g35/t5';

export const COURSE_MODULE = assemble({ id: 'law-g35', label: 'Rights, Rules and Courts', blurb: 'Rights and responsibilities, how laws are made, local government, courts and fair trials, promises and property, and how countries make rules together.', accent: '#C9A227', framework: 'plajah-law' }, [t1, t2, t3, t4, t5]);
