import { assemble } from '../courseKit';
import { PART as t1 } from './atlas-brakes-g68/t1';
import { PART as t2 } from './atlas-brakes-g68/t2';
import { PART as t3 } from './atlas-brakes-g68/t3';

export const COURSE_MODULE = assemble({
  id: 'atlas-brakes-g68',
  label: 'How Brakes Work',
  blurb: 'Friction, heat, pressure and leverage; the pedal-to-wheel path; disc and drum brakes; ABS; safe habits and warning signs. Draft. Safety-critical: needs ASE-certified master technician review before any verified label.',
  accent: '#FF8C00',
  framework: 'plajah-machines',
}, [t1, t2, t3]);
COURSE_MODULE.curriculum.reviewNote = 'Safety-critical: needs ASE-certified master technician review before any verified label.';
