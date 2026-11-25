// Play-in-editor hook (same protocol as Rift Realm's projectHook). Opened by the Game Studio with
// ?studio=1&level=<param> inside its iframe, the game reports the module's defaults, waits briefly for
// the project's copy of the level and plays that. Later 'level' messages reload the level live.
// Outside the Studio it does nothing and the game plays the starter project.
import { GAME_SOURCE, isStudioMessage, type GameToStudio } from '../../../services/gamestudio/runtime';
import type { GameLevel, LevelDefaults } from '../../../services/gamestudio/schema';

export const inStudio = () => new URLSearchParams(location.search).get('studio') === '1' && window.parent !== window;

export function postToStudio(msg: Omit<GameToStudio, 'source'> & { type: GameToStudio['type'] }) {
  if (inStudio()) window.parent.postMessage({ source: GAME_SOURCE, ...msg }, '*');
}

export function defaultsOf(level: GameLevel): LevelDefaults {
  return { module: level.module.id, name: level.name, markers: structuredClone(level.markers), zones: structuredClone(level.zones), look: { ...level.look } };
}

/** Resolve with the Studio's level (or null after the timeout); `onLive` gets later edits. */
export function joinStudio(starter: GameLevel, onLive: (l: GameLevel, names: Record<string, string>) => void, timeoutMs = 2500): Promise<{ level: GameLevel; names: Record<string, string> } | null> {
  if (!inStudio()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let first = true;
    const timer = setTimeout(() => { if (first) { first = false; resolve(null); } }, timeoutMs);
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || !isStudioMessage(e.data) || e.data.type !== 'level') return;
      if (e.data.level.module.id !== starter.module.id) return;
      const names = e.data.names ?? {};
      if (first) { first = false; clearTimeout(timer); resolve({ level: e.data.level, names }); }
      else onLive(e.data.level, names);
    });
    window.parent.postMessage({ source: GAME_SOURCE, type: 'ready', defaults: defaultsOf(starter) }, '*');
  });
}
