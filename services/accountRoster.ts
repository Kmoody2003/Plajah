// accountRoster — the device-level roster of accounts saved for hot-switch.
//
// Firebase has a single auth session per app, so hot-switch is "which saved
// account do I sign into". That roster must live on the DEVICE (like a browser
// account chooser), not only on one account's Firestore profile — otherwise
// slots 2–4 vanish the moment you switch. This persists it to localStorage and
// assigns each new account the next free slot (1–4).

import type { LinkedAccount } from '../components/AccountSwitcher';

const KEY = 'plajah:accountRoster:v1';

export function loadRoster(): LinkedAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LinkedAccount[]) : [];
    return Array.isArray(list) ? list.filter(a => a && a.uid && a.slot) : [];
  } catch { return []; }
}

export function saveRoster(list: LinkedAccount[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / disabled */ }
}

interface RosterUser { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null; provider?: string }

/**
 * Add the account to the roster (or refresh it if already present), returning
 * the updated, slot-sorted list. New accounts take the next free slot; if all
 * four slots are full the least-recently-used one is replaced.
 */
export function upsertAccount(user: RosterUser): LinkedAccount[] {
  const list = loadRoster();
  const existing = list.find(a => a.uid === user.uid);
  if (existing) {
    existing.email = user.email || existing.email;
    existing.displayName = user.displayName || existing.displayName;
    existing.photoURL = user.photoURL || existing.photoURL;
    existing.lastUsed = Date.now();
    saveRoster(list);
    return sortBySlot(list);
  }
  const used = new Set(list.map(a => a.slot));
  let slot = ([1, 2, 3, 4] as const).find(s => !used.has(s));
  if (!slot) {
    // Roster full — evict the least-recently-used slot.
    const lru = [...list].sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0))[0];
    slot = lru.slot;
    const idx = list.findIndex(a => a.uid === lru.uid);
    if (idx >= 0) list.splice(idx, 1);
  }
  list.push({
    slot, uid: user.uid, email: user.email || '', displayName: user.displayName || '',
    photoURL: user.photoURL || undefined, provider: user.provider || 'google.com', lastUsed: Date.now(),
  });
  saveRoster(list);
  return sortBySlot(list);
}

export function removeAccount(uid: string): LinkedAccount[] {
  const list = loadRoster().filter(a => a.uid !== uid);
  saveRoster(list);
  return sortBySlot(list);
}

function sortBySlot(list: LinkedAccount[]): LinkedAccount[] {
  return [...list].sort((a, b) => a.slot - b.slot);
}
