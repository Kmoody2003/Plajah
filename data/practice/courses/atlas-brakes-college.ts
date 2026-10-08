import { assemble } from '../courseKit';
import { PART as t1 } from './atlas-brakes-college/t1';
import { PART as t2 } from './atlas-brakes-college/t2';
import { PART as t3 } from './atlas-brakes-college/t3';
import { PART as t4 } from './atlas-brakes-college/t4';
import { PART as t5 } from './atlas-brakes-college/t5';

export const COURSE_MODULE = assemble({
  id: 'atlas-brakes-college',
  label: 'Brake Systems for Technicians',
  blurb: 'Force and torque calculations, brake balance, energy and heat, ABS control theory, scan-tool diagnosis, bleeding methods, regenerative and blended braking, failure analysis, documentation and liability. Draft. Safety-critical: needs ASE-certified master technician review before any verified label.',
  accent: '#FF8C00',
  framework: 'plajah-machines',
}, [t1, t2, t3, t4, t5]);
COURSE_MODULE.curriculum.reviewNote = 'Safety-critical: needs ASE-certified master technician review before any verified label.';
