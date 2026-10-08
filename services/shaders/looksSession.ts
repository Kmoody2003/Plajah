// looksSession — the live, in-memory "what is the Looks stage showing right now" override.
// The council panel previews a proposal by setting it here; the Looks stage reads it; stepping the preset
// arrows (a new presetIndex) clears it. Not persisted — saving is an explicit act (looksLibrary.saveLook).

import type { ShaderLook } from './shaderLooks';

let override: ShaderLook | null = null;
const subs = new Set<() => void>();

export const getLookOverride = () => override;
export function setLookOverride(look: ShaderLook | null) { override = look; subs.forEach(f => { try { f(); } catch { /* ignore */ } }); }
export function onLookOverride(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
