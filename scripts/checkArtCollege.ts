import { COURSES, PROGRAMS, validateCatalog } from '../data/artCollege';
import { ART_COLLEGE_CURRICULUM } from '../data/artCollege/curriculum';
const errs = validateCatalog();
const units = COURSES.reduce((n, c) => n + c.units.length, 0);
const refs = COURSES.reduce((n, c) => n + c.units.reduce((m, u) => m + (u.study?.length ?? 0), 0), 0);
console.log(`courses ${COURSES.length}, units ${units}, study refs ${refs}, programs ${PROGRAMS.length}, lessons ${ART_COLLEGE_CURRICULUM.tracks.reduce((n, t) => n + t.lessons.length, 0)}`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('catalog OK');
