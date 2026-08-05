// Registry of data-driven science-discipline studios. Each id maps to a ScienceDisciplineData
// module rendered by the shared components/ScienceDisciplineView. The three bespoke studios
// (history, architecture, archaeology) are NOT here — they keep their hand-built views.

import type { ScienceDisciplineData } from './types';
import physics from './physics';
import chemistry from './chemistry';
import biology from './biology';
import cs from './cs';
import engineering from './engineering';
import mathematics from './mathematics';
import neuroscience from './neuroscience';
import earth from './earth';
import astronomy from './astronomy';
import data from './data';
import environment from './environment';
import networks from './networks';

export const SCIENCE_DISCIPLINES: Record<string, ScienceDisciplineData> = {
  physics, chemistry, biology, cs, engineering, mathematics,
  neuroscience, earth, astronomy, data, environment, networks,
};

/** True when this discipline id is one of the data-driven science studios. */
export function isScienceDiscipline(id?: string | null): boolean {
  return !!id && id in SCIENCE_DISCIPLINES;
}
