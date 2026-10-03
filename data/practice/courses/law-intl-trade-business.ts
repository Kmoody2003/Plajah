import { assemble } from '../courseKit';
import { PART as t1 } from './law-intl-trade-business/t1';
import { PART as t2 } from './law-intl-trade-business/t2';
import { PART as t3 } from './law-intl-trade-business/t3';
import { PART as t4 } from './law-intl-trade-business/t4';
import { PART as t5 } from './law-intl-trade-business/t5';

export const COURSE_MODULE = assemble({
  id: 'law-intl-trade-business',
  label: 'International Trade, Investment and Business Law',
  blurb: 'The WTO system, trade agreements and remedies, international sales and arbitration, investment treaties, sanctions, data and IP rules, and how to analyse a cross-border deal.',
  accent: '#5B8DEF',
  framework: 'plajah-law',
}, [t1, t2, t3, t4, t5]);
