// Written by scripts/council/applyWorksheetArtCouncil.ts from the Art Council's worksheet sessions
// (docs/academia/worksheet-council/*.json). Seed themes live in services/yearCurriculum/worksheetThemes.ts; an entry
// here overrides the seed's palette/type/motif with what the council decided. Empty until the runner is run.
import type { WorksheetTheme } from '../../services/yearCurriculum/worksheetThemes';

export const COUNCIL_THEME_BUILDS: Record<string, Partial<WorksheetTheme>> = {};

export const COUNCIL_EXTRA_THEMES: WorksheetTheme[] = [];
