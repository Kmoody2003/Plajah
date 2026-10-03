import { assemble } from '../courseKit';
import { PART as t1 } from './med-path/t1';
import { PART as t2 } from './med-path/t2';
import { PART as t3 } from './med-path/t3';
import { PART as t4 } from './med-path/t4';
import { PART as t5 } from './med-path/t5';
import { PART as t6 } from './med-path/t6';
import { PART as t7 } from './med-path/t7';
import { PART as t8 } from './med-path/t8';

export const COURSE_MODULE = assemble({ id: 'med-path', label: 'Pathology', blurb: 'Cell injury, inflammation, hemodynamics, genetics and neoplasia, then the major organ systems, taught as mechanisms and vignettes.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5, t6, t7, t8]);
