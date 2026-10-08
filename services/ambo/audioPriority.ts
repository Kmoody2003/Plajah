// audioPriority — what happens to everything else when a video with sound goes
// to Program.
//
// Kept dependency-free on purpose: layerSources (slide AUDIO beds), the DJ deck
// and the audio playlist bus all read the same factor, and none of them may
// import each other.
//
//   policy  'parallel' — nothing changes; audio always plays on top (default)
//           'duck'     — lower to `duckLevel`
//           'pause'    — the playlist pauses and resumes where it was; other
//                        sources are silenced (a slide bed can't "resume")
//   scope   'playlist' — only the audio playlist bus reacts
//           'all'      — slide audio beds and the DJ deck react too

export type VideoAudioPolicy = 'parallel' | 'duck' | 'pause';
export type VideoAudioScope = 'playlist' | 'all';

export interface AudioPriorityState {
  policy: VideoAudioPolicy;
  scope: VideoAudioScope;
  /** 0..1 — level a ducked source sits at. */
  duckLevel: number;
  /** True while Program carries a video that is playing sound. */
  videoAudible: boolean;
}

const KEY = 'ambo_audio_priority_v1';

function load(): AudioPriorityState {
  const base: AudioPriorityState = { policy: 'parallel', scope: 'playlist', duckLevel: 0.2, videoAudible: false };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const s = JSON.parse(raw);
      return { ...base, ...s, videoAudible: false };
    }
  } catch { /* */ }
  return base;
}

let state = load();
const listeners = new Set<() => void>();

export function getAudioPriority(): AudioPriorityState { return state; }

export function setAudioPriority(patch: Partial<Omit<AudioPriorityState, 'videoAudible'>>): void {
  state = { ...state, ...patch };
  try {
    const { videoAudible: _v, ...persist } = state;
    localStorage.setItem(KEY, JSON.stringify(persist));
  } catch { /* */ }
  emit();
}

/** The presenter calls this whenever Program's stack changes. */
export function setProgramVideoAudible(audible: boolean): void {
  if (state.videoAudible === audible) return;
  state = { ...state, videoAudible: audible };
  emit();
}

export function subscribeAudioPriority(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit() { for (const fn of listeners) { try { fn(); } catch { /* */ } } }

/** Gain multiplier for the playlist bus (pause is handled by the bus itself). */
export function playlistFactor(s: AudioPriorityState = state): number {
  if (!s.videoAudible || s.policy === 'parallel') return 1;
  return s.policy === 'duck' ? s.duckLevel : 0;
}

/** Gain multiplier for every OTHER audio source (slide beds, DJ deck). */
export function otherAudioFactor(s: AudioPriorityState = state): number {
  if (!s.videoAudible || s.policy === 'parallel' || s.scope !== 'all') return 1;
  return s.policy === 'duck' ? s.duckLevel : 0;
}
