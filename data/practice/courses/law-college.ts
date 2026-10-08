import { assemble } from '../courseKit';
import { PART as t1 } from './law-college/t1';
import { PART as t2 } from './law-college/t2';
import { PART as t3 } from './law-college/t3';
import { PART as t4 } from './law-college/t4';
import { PART as t5 } from './law-college/t5';

export const COURSE_MODULE = assemble({ id: 'law-college', label: 'Legal Studies and Legal Reasoning', blurb: 'Legal history, the major legal systems, reading opinions, statutory interpretation, precedent, logic and the structure of American law.', accent: '#C9A227', framework: 'plajah-law' }, [t1, t2, t3, t4, t5]);
