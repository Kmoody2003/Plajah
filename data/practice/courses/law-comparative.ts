import { assemble } from '../courseKit';
import { PART as t1 } from './law-comparative/t1';
import { PART as t2 } from './law-comparative/t2';
import { PART as t3 } from './law-comparative/t3';
import { PART as t4 } from './law-comparative/t4';
import { PART as t5 } from './law-comparative/t5';
export const COURSE_MODULE = assemble({ id: 'law-comparative', label: 'Comparative Law and Legal Systems of the World', blurb: 'Method, the common law and civil law traditions, mixed systems, religious and customary law, East Asia, the EU and constitutional review worldwide.', accent: '#5B8DEF', framework: 'plajah-law' }, [t1, t2, t3, t4, t5]);
