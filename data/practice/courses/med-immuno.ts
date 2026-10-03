import { assemble } from '../courseKit';
import { PART as t1 } from './med-immuno/t1';
import { PART as t2 } from './med-immuno/t2';
import { PART as t3 } from './med-immuno/t3';
import { PART as t4 } from './med-immuno/t4';
import { PART as t5 } from './med-immuno/t5';

export const COURSE_MODULE = assemble({ id: 'med-immuno', label: 'Immunology', blurb: 'Innate and adaptive immunity, tolerance and hypersensitivity, autoimmunity, immunodeficiency, transplantation, tumor immunology, vaccines and the lab methods of clinical immunology.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
