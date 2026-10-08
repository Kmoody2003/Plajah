import { assemble } from '../courseKit';
import { PART as t1 } from './atlas-brakes-hs/t1';
import { PART as t2 } from './atlas-brakes-hs/t2';
import { PART as t3 } from './atlas-brakes-hs/t3';
import { PART as t4 } from './atlas-brakes-hs/t4';

export const COURSE_MODULE = assemble({
  id: 'atlas-brakes-hs',
  label: 'Auto Tech: Brakes',
  blurb: 'Hydraulics, boosters, calipers, pads, rotors and drums, brake fluid, bleeding, ABS and stability control, inspection, diagnosis, estimating and customer communication. Draft. Safety-critical: needs ASE-certified master technician review before any verified label.',
  accent: '#FF8C00',
  framework: 'plajah-machines',
}, [t1, t2, t3, t4]);
COURSE_MODULE.curriculum.reviewNote = 'Safety-critical: needs ASE-certified master technician review before any verified label.';
