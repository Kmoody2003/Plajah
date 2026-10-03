import { assemble } from '../courseKit';
import { PART as t1 } from './med-history/t1';
import { PART as t2 } from './med-history/t2';
import { PART as t3 } from './med-history/t3';
import { PART as t4 } from './med-history/t4';

export const COURSE_MODULE = assemble({ id: 'med-history', label: 'History of Medicine', blurb: 'From Egyptian papyri and Hippocrates to germ theory, anesthesia, vaccines, antibiotics, genomics, and the failures and reversals that taught caution.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4]);
