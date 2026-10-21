// services/elevateTruth.ts
// Two rules every Elevate surface follows:
//  1. Truth: only the demo church (Grace Chapel) shows sample people, schedules, stats or promo copy.
//     A real organization shows its own data, or an honest empty state — never borrowed demo content,
//     and never a person placed in a department they are not in.
//  2. Tradition: devotional and service language follows the church's own tradition. Catholic and
//     Orthodox (and other liturgical) phrasing only appears for those churches; everyone else gets
//     plain, contemporary wording.

import type { Organization } from '../types';
import { DEMO_CHURCH_ID } from '../data/demoShowcase';

export const isDemoOrg = (org?: Pick<Organization, 'id' | 'isDemo'> | null): boolean =>
  !!org && (org.isDemo === true || org.id === DEMO_CHURCH_ID);

export type ChurchTradition = 'CATHOLIC' | 'ORTHODOX' | 'LITURGICAL_PROTESTANT' | 'CONTEMPORARY';

/** Reads the free-form denomination/category; anything unrecognised is treated as contemporary. */
export function churchTradition(org?: Pick<Organization, 'denomination' | 'category'> | null): ChurchTradition {
  const d = `${org?.denomination || ''} ${org?.category || ''}`.toLowerCase();
  if (/orthodox|coptic|antiochian|byzantine/.test(d)) return 'ORTHODOX';
  if (/catholic|parish|diocese|archdiocese/.test(d) && !/anglo-catholic/.test(d)) return 'CATHOLIC';
  if (/anglican|episcopal|anglo-catholic|lutheran|church of england/.test(d)) return 'LITURGICAL_PROTESTANT';
  return 'CONTEMPORARY';
}

export const isLiturgical = (t: ChurchTradition) => t !== 'CONTEMPORARY';

/** Devotional / service vocabulary per tradition. Keys are what the UI means; values are what it says. */
export interface ChurchVocabulary {
  serviceRecap: string;        // a recap of last week's service
  dailyDevotional: string;     // the daily reading/devotional system
  prayerJournal: string;       // personal prayer journal
  mainService: string;         // the main weekly service
  morningPrayer: string;       // morning devotion slot
  eveningPrayer: string;       // evening devotion slot
  prayersCollection: string;   // the prayers library section title
  showTraditionalPrayers: boolean; // show the Catholic & Orthodox prayer collection
  congregation: string;        // what the community is called
  musicDepartment: string;     // worship / music team
}

const CONTEMPORARY: ChurchVocabulary = {
  serviceRecap: 'Sunday recap',
  dailyDevotional: 'Daily devotional',
  prayerJournal: 'Prayer journal',
  mainService: 'Sunday worship',
  morningPrayer: 'Morning devotion',
  eveningPrayer: 'Evening reflection',
  prayersCollection: 'Hymns & worship songs',
  showTraditionalPrayers: false,
  congregation: 'church family',
  musicDepartment: 'Worship team',
};

const VOCAB: Record<ChurchTradition, ChurchVocabulary> = {
  CONTEMPORARY,
  LITURGICAL_PROTESTANT: {
    ...CONTEMPORARY,
    serviceRecap: 'Service recap',
    dailyDevotional: 'Daily office',
    morningPrayer: 'Morning prayer',
    eveningPrayer: 'Evening prayer',
    prayersCollection: 'Hymns, prayers & collects',
    congregation: 'congregation',
    musicDepartment: 'Choir & music',
  },
  CATHOLIC: {
    serviceRecap: 'Mass recap',
    dailyDevotional: 'Daily readings & Liturgy of the Hours',
    prayerJournal: 'Examen & prayer journal',
    mainService: 'Sunday Mass',
    morningPrayer: 'Lauds · Morning Prayer',
    eveningPrayer: 'Vespers · Evening Prayer',
    prayersCollection: 'Hymns & Catholic prayers',
    showTraditionalPrayers: true,
    congregation: 'parish',
    musicDepartment: 'Choir & music ministry',
  },
  ORTHODOX: {
    serviceRecap: 'Divine Liturgy recap',
    dailyDevotional: 'Daily readings & prayer rule',
    prayerJournal: 'Prayer rule & journal',
    mainService: 'Divine Liturgy',
    morningPrayer: 'Matins · Morning Prayers',
    eveningPrayer: 'Vespers · Evening Prayers',
    prayersCollection: 'Hymns & Orthodox prayers',
    showTraditionalPrayers: true,
    congregation: 'parish',
    musicDepartment: 'Choir',
  },
};

/** A member's own choice: assets tailored to their church (default) or from every tradition. */
export type FaithContentScope = 'ORG' | 'ALL';

/** Whether a tradition-specific asset (hymn, prayer…) shows for this church under the member's scope. */
export function traditionAllows(itemTradition: string | undefined, church: ChurchTradition, scope: FaithContentScope = 'ORG'): boolean {
  if (scope === 'ALL' || !itemTradition) return true;
  switch (itemTradition) {
    case 'CATHOLIC': return church === 'CATHOLIC';
    case 'EASTERN_ORTHODOX': return church === 'ORTHODOX';
    case 'PATRISTIC': return church !== 'CONTEMPORARY';
    default: return true; // ecumenical hymns, gospel hymnody, spirituals, Celtic hymns are sung across traditions
  }
}

export const churchVocabulary =(org?: Pick<Organization, 'denomination' | 'category'> | null): ChurchVocabulary =>
  VOCAB[churchTradition(org)];
