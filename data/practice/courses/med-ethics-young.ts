import { assemble } from '../courseKit';
import { PART as t1 } from './med-ethics-young/t1';
import { PART as t2 } from './med-ethics-young/t2';
import { PART as t3 } from './med-ethics-young/t3';

export const COURSE_MODULE = assemble({ id: 'med-ethics-young', label: 'Care, Honesty and Choices (PreK to Grade 8)', blurb: 'Kindness, honesty at the doctor, who decides about your body, consent, privacy, fairness and why scientists test things carefully.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3]);
