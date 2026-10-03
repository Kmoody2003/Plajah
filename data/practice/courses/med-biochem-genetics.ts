import { assemble } from '../courseKit';
import { PART as t1 } from './med-biochem-genetics/t1';
import { PART as t2 } from './med-biochem-genetics/t2';
import { PART as t3 } from './med-biochem-genetics/t3';
import { PART as t4 } from './med-biochem-genetics/t4';
import { PART as t5 } from './med-biochem-genetics/t5';

export const COURSE_MODULE = assemble({
  id: 'med-biochem-genetics', label: 'Biochemistry and Medical Genetics',
  blurb: 'Enzymes, metabolism and its inborn errors, nutrition, molecular biology, and clinical genetics from Mendel to cancer and counseling.',
  accent: '#E5484D', framework: 'plajah-medicine',
}, [t1, t2, t3, t4, t5]);
