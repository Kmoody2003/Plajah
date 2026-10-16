// services/ambo/worshipVisualizers/builds.ts
// The build of record for every one of the 72 church visualizers: the Art Council's deliberation where one exists
// (councilBuilds.ts, generated from docs/ambo/council) and the hand-authored direction otherwise
// (authored*Builds.ts, written in the council's shape). A council session always wins over an authored entry.
import type { WorshipCouncilBuild } from './types';
import { WORSHIP_COUNCIL_BUILDS } from './councilBuilds';
import { AUTHORED_CALM_BUILDS } from './authoredCalmBuilds';
import { AUTHORED_PRAISE_BUILDS_1 } from './authoredPraiseBuilds1';
import { AUTHORED_PRAISE_BUILDS_2 } from './authoredPraiseBuilds2';
import { AUTHORED_SCRIPTURE_BUILDS_1 } from './authoredScriptureBuilds1';
import { AUTHORED_SCRIPTURE_BUILDS_2 } from './authoredScriptureBuilds2';

/** Hand-authored builds only (the visualizers the council did not sit on). */
export const WORSHIP_AUTHORED_BUILDS: Record<string, WorshipCouncilBuild> = {
  ...AUTHORED_CALM_BUILDS,
  ...AUTHORED_PRAISE_BUILDS_1,
  ...AUTHORED_PRAISE_BUILDS_2,
  ...AUTHORED_SCRIPTURE_BUILDS_1,
  ...AUTHORED_SCRIPTURE_BUILDS_2,
};

/** id -> build of record (council first, authored otherwise). */
export const WORSHIP_BUILDS: Record<string, WorshipCouncilBuild> = {
  ...WORSHIP_AUTHORED_BUILDS,
  ...WORSHIP_COUNCIL_BUILDS,
};
