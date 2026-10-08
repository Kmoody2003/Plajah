import { assemble } from '../courseKit';
import { PART as t1 } from './med-micro/t1';
import { PART as t2 } from './med-micro/t2';
import { PART as t3 } from './med-micro/t3';
import { PART as t4 } from './med-micro/t4';
import { PART as t5 } from './med-micro/t5';

export const COURSE_MODULE = assemble({ id: 'med-micro', label: 'Medical Microbiology', blurb: 'Bacteria, viruses, fungi and parasites: structure, virulence, clinical syndromes, laboratory diagnosis and infection control for medical school.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
