// Fabula Story Intelligence — the generative side.
//
//   performance.ts        emotional engine + acting direction, per character per shot
//   continuityLedger.ts   script-supervisor state carried shot to shot, scene to scene
//   promptCompiler.ts     both of the above, phrased for whichever model runs the shot
//   coverage.ts           the script against the cut: what's shot, boarded, empty, missing
//   characterIntel.ts     voice locks, character sheets and relationship evidence from clips and bins
//   storyBrain.ts         the model-backed reads: relationships, bins, gap-fill, critique
//
// `directScene` is the one call most callers want: everything a scene's shots need attached to their
// ShotSpecs before they go to a generator.

import { planScenePerformance, scoreBrief, type CharacterMotivation, type ScenePerformancePlan } from './performance';
import { buildSceneLedger, type LedgerOptions, type SceneLedger } from './continuityLedger';
import type { ShotDirection } from './promptCompiler';

export * from './performance';
export * from './continuityLedger';
export * from './promptCompiler';
export * from './coverage';
export * from './characterIntel';
export * from './storyBrain';

export interface SceneDirection {
  plan: ScenePerformancePlan;
  ledger: SceneLedger;
  /** The direction to attach to a shot's ShotSpec. Undefined for a shot that isn't in this scene. */
  forShot: (shotId: string) => ShotDirection | undefined;
  /** Score and sound sections for the scene, for the music side. */
  score: ReturnType<typeof scoreBrief>;
}

/** Direct a scene: performance on an arc, continuity carried through, ready to attach shot by shot. */
export function directScene(scene: any, motivations: Record<string, CharacterMotivation> = {}, ledgerOpts: LedgerOptions = {}): SceneDirection {
  const plan = planScenePerformance(scene, motivations);
  const ledger = buildSceneLedger(scene, ledgerOpts);
  return {
    plan, ledger, score: scoreBrief(plan),
    forShot: (shotId: string) => {
      const perf = plan.shots.find((s) => s.shotId === shotId);
      const cont = ledger.shots.find((s) => s.shotId === shotId);
      if (!perf && !cont) return undefined;
      const shot = (scene?.shots || []).find((s: any) => s.id === shotId);
      const line = (shot?.lines || '').trim();
      return {
        performance: perf?.beats,
        continuity: cont,
        dialogue: line && shot?.character ? { speaker: shot.character, line } : undefined,
      };
    },
  };
}
