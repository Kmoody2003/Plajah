import { assemble } from '../courseKit';
import { PART as t1 } from './law-evidence/t1';
import { PART as t2 } from './law-evidence/t2';
import { PART as t3 } from './law-evidence/t3';
import { PART as t4 } from './law-evidence/t4';
import { PART as t5 } from './law-evidence/t5';

export const COURSE_MODULE = assemble({ id: 'law-evidence', label: 'Evidence', blurb: 'The Federal Rules of Evidence at JD depth: relevance, character, hearsay and the Confrontation Clause, authentication, witnesses and experts, privileges, burdens and judicial notice.', accent: '#C9A227', framework: 'plajah-law' }, [t1, t2, t3, t4, t5]);
