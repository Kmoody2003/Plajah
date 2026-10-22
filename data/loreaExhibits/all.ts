// All Lorea exhibits, in hall order. Loaded lazily through services/loreaExhibits/loreaExhibitStore.
import type { LoreaExhibit } from '../../services/loreaExhibits/loreaExhibitTypes';
import { STORY_EXHIBIT } from './story';
import { CHARACTER_EXHIBIT } from './character';
import { PLOT_EXHIBIT } from './plot';
import { PROSE_EXHIBIT } from './prose';
import { POETRY_EXHIBIT } from './poetry';
import { RHYTHM_EXHIBIT } from './rhythm';
import { GRAMMAR_EXHIBIT } from './grammar';
import { JOURNALISM_EXHIBIT } from './journalism';
import { applyLoreaCouncilBuilds } from './councilBuilds';

export const LOREA_EXHIBITS: LoreaExhibit[] = applyLoreaCouncilBuilds([
  STORY_EXHIBIT, CHARACTER_EXHIBIT, PLOT_EXHIBIT, PROSE_EXHIBIT,
  POETRY_EXHIBIT, RHYTHM_EXHIBIT, GRAMMAR_EXHIBIT, JOURNALISM_EXHIBIT,
]);
