// comicHandoff — a tiny in-session bridge so another tool can seed the comic composer.
//
// Fabula's "Send scene to comic" (or Lorea's "Script this chapter") drops a payload
// here — the script text plus the world's characters and digital assets — and the
// comic composer's Script panel picks it up. In-memory (same document/session), so no
// serialization of images; consumed once.
import type { ScriptCharacter } from './comicScript';

export interface ComicHandoff {
  source: 'FABULA' | 'LOREA' | string;
  title?: string;
  script?: string;
  characters?: ScriptCharacter[];       // names + reference images (world cast)
  assets?: { name: string; url: string }[]; // digital assets that follow from the world
}

let pending: ComicHandoff | null = null;

export const setComicHandoff = (h: ComicHandoff) => { pending = h; };
export const peekComicHandoff = (): ComicHandoff | null => pending;
export const takeComicHandoff = (): ComicHandoff | null => { const h = pending; pending = null; return h; };
