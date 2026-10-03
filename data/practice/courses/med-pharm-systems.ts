import { assemble } from '../courseKit';
import { PART as t1 } from './med-pharm-systems/t1';
import { PART as t2 } from './med-pharm-systems/t2';
import { PART as t3 } from './med-pharm-systems/t3';
import { PART as t4 } from './med-pharm-systems/t4';
import { PART as t5 } from './med-pharm-systems/t5';
import { PART as t6 } from './med-pharm-systems/t6';

export const COURSE_MODULE = assemble({ id: 'med-pharm-systems', label: 'Pharmacology: Drugs by System', blurb: 'The major drug classes by organ system: mechanism, indications, hallmark toxicities, interactions and contraindications, from cardiovascular and endocrine therapy to anti-infectives, CNS agents, oncology principles and antidotes.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5, t6]);
