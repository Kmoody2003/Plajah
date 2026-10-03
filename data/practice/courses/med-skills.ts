import { assemble } from '../courseKit';
import { PART as t1 } from './med-skills/t1';
import { PART as t2 } from './med-skills/t2';
import { PART as t3 } from './med-skills/t3';
import { PART as t4 } from './med-skills/t4';
import { PART as t5 } from './med-skills/t5';

export const COURSE_MODULE = assemble({ id: 'med-skills', label: 'Clinical Reasoning and Physical Diagnosis', blurb: 'The clinical method: interviewing, the physical examination by system, vital signs, communication, differential diagnosis, probabilistic and cognitive reasoning, testing, documentation and procedure concepts.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
