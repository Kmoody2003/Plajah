import { assemble } from '../courseKit';
import { PART as t1 } from './med-epi-biostats/t1';
import { PART as t2 } from './med-epi-biostats/t2';
import { PART as t3 } from './med-epi-biostats/t3';
import { PART as t4 } from './med-epi-biostats/t4';
import { PART as t5 } from './med-epi-biostats/t5';

export const COURSE_MODULE = assemble({ id: 'med-epi-biostats', label: 'Epidemiology and Biostatistics', blurb: 'Disease frequency, study design, bias and confounding, screening and diagnostic tests, risk measures, hypothesis testing, survival analysis, meta-analysis and critical appraisal.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
