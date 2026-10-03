import { assemble } from '../courseKit';
import { PART as t1 } from './med-clin-surgery/t1';
import { PART as t2 } from './med-clin-surgery/t2';
import { PART as t3 } from './med-clin-surgery/t3';
import { PART as t4 } from './med-clin-surgery/t4';
import { PART as t5 } from './med-clin-surgery/t5';
export const COURSE_MODULE = assemble({ id: 'med-clin-surgery', label: 'Surgery', blurb: 'Clerkship and Step 2 level surgery: perioperative care, acute abdomen, hernia, GI and hepatobiliary surgery, vascular disease, trauma, burns, breast and endocrine surgery, urology, orthopedics, anesthesia and surgical infection.', accent: '#E5484D', framework: 'plajah-medicine' }, [t1, t2, t3, t4, t5]);
