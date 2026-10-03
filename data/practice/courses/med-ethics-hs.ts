import { assemble } from '../courseKit';
import { PART as t1 } from './med-ethics-hs/t1';
import { PART as t2 } from './med-ethics-hs/t2';
import { PART as t3 } from './med-ethics-hs/t3';
import { PART as t4 } from './med-ethics-hs/t4';

export const COURSE_MODULE = assemble({ id: 'med-ethics-hs', label: 'Bioethics', blurb: 'The four principles, consent, confidentiality, landmark cases, research ethics, organ allocation, genetics, life-and-death questions, public health and AI in medicine.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4]);
