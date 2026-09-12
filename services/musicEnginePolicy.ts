// Shared metadata; authorization decisions are made again on the server.
export const MUSIC_ENGINES = [
  { id: 'ace-step', name: 'ACE-Step 1.5', purpose: 'Song and instrumental generation', license: 'MIT', permissionRequired: false },
  { id: 'heartmula', name: 'HeartMuLa 3B', purpose: 'Song generation from lyrics and style', license: 'Apache 2.0', permissionRequired: false },
  { id: 'basic-pitch', name: 'Basic Pitch', purpose: 'Audio to editable notes', license: 'Apache 2.0', permissionRequired: false },
  { id: 'qwen-score', name: 'Qwen3 score composer', purpose: 'Experimental composition of editable notes', license: 'Apache 2.0', permissionRequired: false },
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
