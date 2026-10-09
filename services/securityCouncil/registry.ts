/**
 * Process-wide handles, set once by routes/securityCouncil.ts when server.ts mounts it. Lets other
 * server modules (routes/threatProtection.ts) read real council data without new server.ts plumbing.
 */
import type { CouncilStore } from './types';

let _store: CouncilStore | null = null;
let _forget: ((ipHash: string) => void) | null = null;

export function registerCouncilStore(store: CouncilStore) { _store = store; }
export function getCouncilStore(): CouncilStore | null { return _store; }
export function registerMitigationForgetter(fn: (ipHash: string) => void) { _forget = fn; }
export function forgetMitigationLocally(ipHash: string) { try { _forget?.(ipHash); } catch { /* best effort */ } }
