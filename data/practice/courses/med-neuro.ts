import { assemble } from '../courseKit';
import { PART as t1 } from './med-neuro/t1';
import { PART as t2 } from './med-neuro/t2';
import { PART as t3 } from './med-neuro/t3';
import { PART as t4 } from './med-neuro/t4';
import { PART as t5 } from './med-neuro/t5';

export const COURSE_MODULE = assemble({ id: 'med-neuro', label: 'Clinical Neuroscience', blurb: 'Neuroanatomy, lesion localisation and the common neurological disorders, with pharmacology links.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
