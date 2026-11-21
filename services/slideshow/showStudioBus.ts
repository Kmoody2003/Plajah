// Open the Themed Shows studio from anywhere and get the show back.
//
//   const r = await openShowStudio({ source: 'tela', publish: true, doneLabel: 'Add to document' });
//   if (r) { r.spec … r.ref }   // null when the person closed the studio without finishing
//
// App.tsx mounts <ShowStudioHost>, which listens for `plajah:openShowStudio` (the same
// CustomEvent pattern as `plajah:openGallery`) and shows the studio as an overlay above the
// caller, so whoever asked — a Tela document, Fabula, a comment — is still there, unchanged,
// when the studio hands the result back.
//
// One source of truth: the show spec lives in the owner's account (creative cloud kind
// 'slideshow') and, once published, at public-shows/<owner>/<id>/show.json. Callers keep only
// the ShowRef { owner, id }.

import type { ShowSpec } from './types';
import type { ShowRef } from './cloudShows';

export const OPEN_SHOW_STUDIO = 'plajah:openShowStudio';

export type ShowStudioSource = 'photos' | 'tela' | 'fabula' | 'comment' | 'stage' | string;

export interface ShowStudioResult {
  /** The show as saved (the owner's photo order and settings). */
  spec: ShowSpec;
  /** Present when the caller asked for `publish` (or the person published in the studio). */
  ref?: ShowRef;
}

export interface OpenShowStudioOptions {
  source: ShowStudioSource;
  /** Shown on the studio's back control: "Back to <returnLabel>". */
  returnLabel?: string;
  /** Edit an existing show (the owner's account copy first, then the published copy). */
  open?: Pick<ShowRef, 'owner' | 'id'>;
  /** Publish when the person finishes, so the result carries a ShowRef anyone can play. */
  publish?: boolean;
  /** Label of the finish button (default "Done"). */
  doneLabel?: string;
}

export interface OpenShowStudioDetail extends OpenShowStudioOptions {
  requestId: string;
  /** Set by the host when it takes the request. */
  handled?: boolean;
  resolve(result: ShowStudioResult | null): void;
}

let seq = 0;

export class ShowStudioUnavailableError extends Error {
  constructor() { super('The Themed Shows studio is not available here.'); this.name = 'ShowStudioUnavailableError'; }
}

/** Ask the app to open the studio; resolves with the finished show, or null if closed. */
export function openShowStudio(opts: OpenShowStudioOptions): Promise<ShowStudioResult | null> {
  return new Promise((resolve, reject) => {
    const detail: OpenShowStudioDetail = { ...opts, requestId: `studio_${Date.now().toString(36)}_${++seq}`, resolve };
    window.dispatchEvent(new CustomEvent(OPEN_SHOW_STUDIO, { detail }));
    if (!detail.handled) reject(new ShowStudioUnavailableError());
  });
}
