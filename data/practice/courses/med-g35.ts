import { assemble } from '../courseKit';
import { PART as t1 } from './med-g35/t1';
import { PART as t2 } from './med-g35/t2';
import { PART as t3 } from './med-g35/t3';
import { PART as t4 } from './med-g35/t4';
import { PART as t5 } from './med-g35/t5';

export const COURSE_MODULE = assemble({
  id: 'med-g35', label: 'How the Body Works',
  blurb: 'Your body\'s systems, germs and defenses, food, exercise and sleep, growing up, feelings, staying safe, and the people who keep us healthy.',
  accent: '#E5484D', framework: 'plajah-medicine',
}, [t1, t2, t3, t4, t5]);
