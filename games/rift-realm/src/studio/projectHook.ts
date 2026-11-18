// The game side of Play-in-editor (docs/game-studio-unified-plan.md Phase 0). When the Game Studio opens
// the game (?studio=1 inside its iframe), the game reports its level defaults, waits briefly for the
// project's copy of the level, and applies it before anyone spawns. Outside the Studio it does nothing.
//
// main.ts calls applyStudioProject(levelId, arena) right after building the arena. Besides the look, it
// returns the project level itself (its rules and zones) and the names the Studio sent, for the rule player.

import type { Level } from '../shrine';
import { applyProjectLevel, exportDefaults, moduleByParam } from './levelModules';
import { GAME_SOURCE, isStudioMessage } from '../../../../services/gamestudio/runtime';
import type { GameLevel } from '../../../../services/gamestudio/schema';

export interface StudioLevel { exposure: number; far: number; level: GameLevel; names: Record<string, string> }

export async function applyStudioProject(levelParam: string, level: Level, timeoutMs = 2500): Promise<StudioLevel | null> {
  const inStudio = new URLSearchParams(location.search).get('studio') === '1' && window.parent !== window;
  if (!inStudio) return null;
  const mod = moduleByParam(levelParam);
  let names: Record<string, string> = {};
  const project = await new Promise<GameLevel | null>((resolve) => {
    const timer = setTimeout(() => { window.removeEventListener('message', on); resolve(null); }, timeoutMs);
    function on(e: MessageEvent) {
      if (e.source !== window.parent || !isStudioMessage(e.data) || e.data.type !== 'level') return;
      clearTimeout(timer);
      window.removeEventListener('message', on);
      names = e.data.names ?? {};
      resolve(e.data.level);
    }
    window.addEventListener('message', on);
    window.parent.postMessage({ source: GAME_SOURCE, type: 'ready', defaults: exportDefaults(mod, level) }, '*');
  });
  if (!project || project.module.id !== mod.id) return null;
  return { ...applyProjectLevel(mod, level, project), level: project, names };
}
