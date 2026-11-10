// Where the skill profile lives in the browser: this device first (instant, works signed out), and
// the account when signed in (GET/PUT /api/build/workspace/profile), merged so neither copy loses
// progress. One shared store per page; rooms and the shell subscribe to it.

import { emptyProfile, mergeProfiles, sanitizeProfile, type SkillProfile } from './skillProfile';

const KEY = 'plajah.workspace.profile';
type TokenFn = () => Promise<string | null>;

let profile: SkillProfile = load();
const subs = new Set<(p: SkillProfile) => void>();
let getToken: TokenFn | null = null;
let pulled = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function load(): SkillProfile { try { const raw = localStorage.getItem(KEY); return raw ? sanitizeProfile(JSON.parse(raw)) : emptyProfile(); } catch { return emptyProfile(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* storage blocked */ } }
function emit() { for (const f of subs) f(profile); }

export function getProfile(): SkillProfile { return profile; }
export function subscribe(f: (p: SkillProfile) => void): () => void { subs.add(f); return () => { subs.delete(f); }; }

/** Apply a change (recordUse, finishPath, setLevel from skillProfile.ts). */
export function updateProfile(change: (p: SkillProfile) => SkillProfile): void {
  const next = change(profile); if (next === profile) return;
  profile = next; save(); emit(); schedulePush();
}

/** Hand the store a way to sign requests; the first call pulls the account copy and merges it. */
export function connectAccount(fn: TokenFn | undefined): void {
  if (!fn) return; getToken = fn;
  if (pulled) return; pulled = true;
  void (async () => {
    const remote = await call('GET'); if (!remote) { pulled = false; return; }
    const merged = mergeProfiles(profile, sanitizeProfile(remote.profile));
    const changed = JSON.stringify(merged) !== JSON.stringify(profile);
    profile = merged; save(); emit();
    if (changed) schedulePush();
  })();
}

function schedulePush() {
  if (!getToken || !pulled) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void call('PUT', profile); }, 1500);
}

async function call(method: 'GET' | 'PUT', body?: SkillProfile): Promise<{ profile: unknown } | null> {
  try {
    const t = await getToken?.(); if (!t) return null;
    const r = await fetch('/api/build/workspace/profile', { method, headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify({ profile: body }) : undefined });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Tests only. */
export function _resetForTests(p: SkillProfile = emptyProfile()) { profile = p; pulled = false; getToken = null; subs.clear(); }
