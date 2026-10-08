import { assemble } from '../courseKit';
import { PART as t1 } from './med-global-health/t1';
import { PART as t2 } from './med-global-health/t2';
import { PART as t3 } from './med-global-health/t3';
import { PART as t4 } from './med-global-health/t4';
import { PART as t5 } from './med-global-health/t5';
export const COURSE_MODULE = assemble({ id: 'med-global-health', label: 'Global Health and Health Systems', blurb: 'Burden of disease, determinants, disease control, health systems, financing, ethics and humanitarian medicine worldwide.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
