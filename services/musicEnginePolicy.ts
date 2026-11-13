// Shared metadata; authorization decisions are made again on the server.
// Do NOT register MuLaCover or MuScriptor: their weights are CC BY-NC 4.0.
export const MUSIC_ENGINES = [
  { id: 'ace-step-2.5', name: 'ACE-Step local quality preset', purpose: 'ACE-Step runtime with additional sampling steps; not a separate model version', license: 'MIT', permissionRequired: false },
  { id: 'ace-step', name: 'ACE-Step 1.5', purpose: 'Song, instrumental and audio edit generation (text2music, repaint, cover; lego/extract/complete on base checkpoint)', license: 'MIT', permissionRequired: false },
  { id: 'heartmula', name: 'HeartMuLa 3B', purpose: 'Song generation from lyrics and style', license: 'Apache 2.0', permissionRequired: false },
  { id: 'heartmula-rl-3b', name: 'HeartMuLa RL 3B', purpose: 'Reinforcement-tuned 3B song generation from lyrics and style', license: 'Apache 2.0', permissionRequired: false },
  { id: 'soulx-singer', name: 'SoulX-Singer (evaluation)', purpose: 'Score-conditioned singing synthesis from syllables, MIDI notes and optional reference voice; evaluation only until Hugging Face weights licence tag is confirmed', license: 'Apache 2.0 code; HF weights tag unverified (evaluation only)', permissionRequired: true },
  { id: 'basic-pitch', name: 'Basic Pitch', purpose: 'Audio to editable notes', license: 'Apache 2.0', permissionRequired: false },
  { id: 'qwen-score', name: 'Local Qwen music director', purpose: 'Song planning and instrument-aware MIDI composition via local GGUF or Ollama', license: 'Apache 2.0', permissionRequired: false },
  { id: 'yue2', name: 'YuE2', purpose: 'Song generation and editable ABC scores', license: 'CC BY-NC 4.0 weights', permissionRequired: true },
  { id: 'sheetsage2', name: 'SheetSage2', purpose: 'Recordings to scores and musical annotations', license: 'CC BY-NC 4.0 weights', permissionRequired: true },
] as const;

export type MusicEngineId = typeof MUSIC_ENGINES[number]['id'];
export interface MusicEngineAccess {
  isAdmin: boolean;
  evaluationPermission?: string;
  runtimeConnected?: boolean;
}

/** Evaluation permission never opens public access. Public launch needs a separate reviewed change. */
export function musicEngineAccess(id: string, context: MusicEngineAccess) {
  if (!context.isAdmin) return { allowed: false, status: 403, reason: 'Admin access required' };
  const engine = MUSIC_ENGINES.find(item => item.id === id);
  if (!engine) return { allowed: false, status: 404, reason: 'Unknown music engine' };
  if (engine.permissionRequired && !context.evaluationPermission?.trim()) {
    return { allowed: false, status: 403, reason: 'Written evaluation permission pending' };
  }
  if (!context.runtimeConnected) return { allowed: false, status: 503, reason: 'Evaluation runtime not connected' };
  return { allowed: true, status: 200, reason: 'Admin evaluation only' };
}
