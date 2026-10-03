import { assemble } from '../courseKit';
import { PART as t1 } from './law-intl-humanitarian-criminal/t1';
import { PART as t2 } from './law-intl-humanitarian-criminal/t2';
import { PART as t3 } from './law-intl-humanitarian-criminal/t3';
import { PART as t4 } from './law-intl-humanitarian-criminal/t4';
import { PART as t5 } from './law-intl-humanitarian-criminal/t5';

export const COURSE_MODULE = assemble({
  id: 'law-intl-humanitarian-criminal',
  label: 'Laws of War and International Criminal Law',
  blurb: 'Jus ad bellum and jus in bello, the Geneva Conventions, distinction, proportionality, protected persons, weapons law, command responsibility, genocide, the Nuremberg legacy, the ad hoc tribunals and the ICC.',
  accent: '#5B8DEF',
  framework: 'plajah-law',
}, [t1, t2, t3, t4, t5]);
