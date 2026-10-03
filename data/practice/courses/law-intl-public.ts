import { assemble } from '../courseKit';
import { PART as t1 } from './law-intl-public/t1';
import { PART as t2 } from './law-intl-public/t2';
import { PART as t3 } from './law-intl-public/t3';
import { PART as t4 } from './law-intl-public/t4';
import { PART as t5 } from './law-intl-public/t5';

export const COURSE_MODULE = assemble({
  id: 'law-intl-public',
  label: 'Public International Law',
  blurb: 'Sources, treaties, statehood, responsibility, immunities, the use of force, the UN and ICJ, the law of the sea, environmental and space law, and why states comply.',
  accent: '#5B8DEF',
  framework: 'plajah-law',
}, [t1, t2, t3, t4, t5]);
