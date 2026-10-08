import { assemble } from '../courseKit';
import { PART as t1 } from './law-intl-human-rights/t1';
import { PART as t2 } from './law-intl-human-rights/t2';
import { PART as t3 } from './law-intl-human-rights/t3';
import { PART as t4 } from './law-intl-human-rights/t4';
import { PART as t5 } from './law-intl-human-rights/t5';
import { PART as t6 } from './law-intl-human-rights/t6';

export const COURSE_MODULE = assemble({ id: 'law-intl-human-rights', label: 'International Human Rights Law', blurb: 'The UDHR and the Covenants, treaty bodies, regional courts, limits and derogations, torture, refugees, children and women, minorities, business, universal jurisdiction, and the universalism debate.', accent: '#5B8DEF', framework: 'plajah-law' }, [t1, t2, t3, t4, t5, t6]);
