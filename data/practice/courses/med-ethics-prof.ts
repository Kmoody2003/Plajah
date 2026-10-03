import { assemble } from '../courseKit';
import { PART as t1 } from './med-ethics-prof/t1';
import { PART as t2 } from './med-ethics-prof/t2';
import { PART as t3 } from './med-ethics-prof/t3';
import { PART as t4 } from './med-ethics-prof/t4';
import { PART as t5 } from './med-ethics-prof/t5';

export const COURSE_MODULE = assemble({
  id: 'med-ethics-prof',
  label: 'Medical Ethics, Law and the Philosophy of Medicine',
  blurb: 'Ethical frameworks, consent and capacity, confidentiality, end-of-life care, research ethics, justice, error and malpractice, and the philosophy of health, disease and evidence.',
  accent: '#E5484D',
  framework: 'plajah-medicine',
}, [t1, t2, t3, t4, t5]);
