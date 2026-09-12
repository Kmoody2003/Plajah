// designInterests — "Add to my interests" from the template gallery.
//
// Saves a design-history / genre tag onto the user's PUBLIC interests (the
// same field InterestsNotebook edits), so the profile's Interests tab and the
// recommender see it. Also remembers a lightweight local list for guests so
// the gallery can show the state before sign-in.
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './backendService';

export type AddInterestResult = 'added' | 'exists' | 'signin' | 'failed';
const LOCAL_KEY = 'plajah_design_interests_v1';

function localList(): string[] { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } }
function saveLocal(list: string[]) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify([...new Set(list)].slice(0, 200))); } catch { /* private mode */ } }

export function hasDesignInterest(tag: string): boolean { return localList().map(t => t.toLowerCase()).includes(tag.toLowerCase()); }
export function listDesignInterests(): string[] { return localList(); }

export async function addDesignInterest(tag: string, related: string[] = []): Promise<AddInterestResult> {
  const clean = tag.trim(); if (!clean) return 'failed';
  const already = hasDesignInterest(clean);
  saveLocal([...localList(), clean]);
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return 'signin';
  try {
    await updateDoc(doc(db, 'users', u.uid), { publicInterests: arrayUnion(clean, ...related.slice(0, 3)), interests: arrayUnion(clean) });
    window.dispatchEvent(new CustomEvent('plajah:interests-changed', { detail: { added: clean } }));
    return already ? 'exists' : 'added';
  } catch { return 'failed'; }
}

/** Where "Learn more on Plajah" goes: the Art Museum with the style as the search focus. */
export function openDesignHistory(tag: string, styleId?: string) {
  window.dispatchEvent(new CustomEvent('plajah:openDesignHistory', { detail: { tag, styleId } }));
}
