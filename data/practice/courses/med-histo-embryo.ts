import { assemble } from '../courseKit';
import { PART as t1 } from './med-histo-embryo/t1';
import { PART as t2 } from './med-histo-embryo/t2';
import { PART as t3 } from './med-histo-embryo/t3';
import { PART as t4 } from './med-histo-embryo/t4';
import { PART as t5 } from './med-histo-embryo/t5';
import { PART as t6 } from './med-histo-embryo/t6';

export const COURSE_MODULE = assemble({ id: 'med-histo-embryo', label: 'Histology and Embryology', blurb: 'Tissues and organ systems under the microscope, and human development from gametes to birth.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5, t6]);
