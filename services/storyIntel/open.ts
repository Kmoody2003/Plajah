// Open Tela's Story Intelligence workspace from anywhere (a video's Story tab, Lorea's Writer's Desk).
// App switches to Tela on 'plajah:openTela'; TelaView then picks up the pending request, or hears the
// event directly when Tela is already open.

export const OPEN_STORY_INTEL_EVENT = 'tela:open-story-intel';
const PENDING = '__plajahStoryIntelPending';

export interface StoryIntelRequest { videoId?: string; view?: 'inbox' | 'desk' }

export function openStoryIntelWorkspace(req: StoryIntelRequest = {}) {
  (window as any)[PENDING] = req;
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: {} }));
  window.dispatchEvent(new CustomEvent(OPEN_STORY_INTEL_EVENT, { detail: req }));
}

/** Read (and clear) a request made before Tela mounted. */
export function takePendingStoryIntel(): StoryIntelRequest | null {
  const r = (window as any)[PENDING] as StoryIntelRequest | undefined;
  (window as any)[PENDING] = undefined;
  return r || null;
}
