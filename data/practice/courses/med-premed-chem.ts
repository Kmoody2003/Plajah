import { assemble } from '../courseKit';
import { PART as t1 } from './med-premed-chem/t1';
import { PART as t2 } from './med-premed-chem/t2';
import { PART as t3 } from './med-premed-chem/t3';
import { PART as t4 } from './med-premed-chem/t4';

export const COURSE_MODULE = assemble({ id: 'med-premed-chem', label: 'Chemistry for Medicine', blurb: 'General and organic chemistry taught for future clinicians: bonds, energy, equilibrium, acids and buffers, mechanisms, spectroscopy and the chemistry of biomolecules and drugs.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4]);
