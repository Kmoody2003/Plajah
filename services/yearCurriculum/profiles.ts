// Learning-support plans → worksheet adaptation profiles. A teacher picks a learner whose plan is shared with them
// (services/learningSupport listSharedPlans) and every worksheet in the year re-flows to that plan.
import type { SupportPlan } from '../learningSupport';
import type { AdaptProfile, Tier } from './types';

export function profileFromPlan(plan: SupportPlan, tier: Tier = 'core'): AdaptProfile {
  const s = plan.supports;
  return {
    tier,
    supports: {
      easyRead: s.easyRead, textSize: s.textSize, lineFocus: s.lineFocus, readAloud: s.readAloud, readQuestions: s.readQuestions,
      calm: s.calm, mutedColor: s.mutedColor, chunk: s.chunk, untimed: s.untimed, extraTime: s.extraTime, fewerChoices: s.fewerChoices, retryFree: s.retryFree,
    },
    identities: plan.about?.identities || [],
    interests: plan.about?.interests || [],
    learnerName: plan.learnerName,
    homeLanguage: plan.about?.languagePref,
  };
}

/** Starting points for a class without individual plans: the planner shows these as quick presets. */
export const PROFILE_PRESETS: Array<{ id: string; label: string; profile: AdaptProfile }> = [
  { id: 'core', label: 'On level', profile: { tier: 'core' } },
  { id: 'support', label: 'Support', profile: { tier: 'support', supports: { readQuestions: true } } },
  { id: 'stretch', label: 'Stretch', profile: { tier: 'stretch' } },
  { id: 'dyslexia', label: 'Dyslexia-friendly', profile: { tier: 'core', identities: ['dyslexic'], supports: { easyRead: true, readQuestions: true, lineFocus: true } } },
  { id: 'adhd', label: 'Chunked (ADHD)', profile: { tier: 'core', identities: ['adhd'], supports: { chunk: true, extraTime: 1.5 } } },
  { id: 'dyscalculia', label: 'Number-sense support', profile: { tier: 'support', identities: ['dyscalculic'], supports: { fewerChoices: true } } },
  { id: 'calm', label: 'Calm / sensory', profile: { tier: 'core', identities: ['sensory'], supports: { calm: true, mutedColor: true, untimed: true } } },
  { id: 'ell', label: 'Multilingual learner', profile: { tier: 'core', homeLanguage: 'es', supports: { readQuestions: true, fewerChoices: true } } },
];
