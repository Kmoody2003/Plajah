import { assemble } from '../courseKit';
import { PART as t1 } from './med-premed-biochem/t1';
import { PART as t2 } from './med-premed-biochem/t2';
import { PART as t3 } from './med-premed-biochem/t3';
import { PART as t4 } from './med-premed-biochem/t4';

export const COURSE_MODULE = assemble({ id: 'med-premed-biochem', label: 'Biochemistry for Medicine', blurb: 'Proteins and enzymes, membranes, the central metabolic pathways, nitrogen and lipid metabolism, signalling and gene expression, with the medical correlations that matter on the wards and in exams.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4]);
