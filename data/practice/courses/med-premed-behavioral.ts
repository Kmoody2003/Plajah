import { assemble } from '../courseKit';
import { PART as t1 } from './med-premed-behavioral/t1';
import { PART as t2 } from './med-premed-behavioral/t2';
import { PART as t3 } from './med-premed-behavioral/t3';
import { PART as t4 } from './med-premed-behavioral/t4';
import { PART as t5 } from './med-premed-behavioral/t5';

export const COURSE_MODULE = assemble({ id: 'med-premed-behavioral', label: 'Behavior, Mind and Society', blurb: 'The behavioral and social science foundation of medicine: perception, learning, memory, emotion, development, disorders, social structure, health disparities and research methods.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
