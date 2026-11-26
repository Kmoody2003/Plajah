// Tela's Simple / All tools layout choice, kept on the user's account so it follows them to every
// device. Doc: users/{uid}/prefs/tela (owner-only, covered by the existing prefs rule).
// localStorage stays as the fast first paint and the signed-out fallback.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type TelaLayout = 'simple' | 'full';

export const TELA_LAYOUT_KEY = 'tela.layout';

const prefDoc = (uid: string) => doc(db, 'users', uid, 'prefs', 'tela');

export const readLocalTelaLayout = (): TelaLayout | null => {
  try {
    const saved = localStorage.getItem(TELA_LAYOUT_KEY);
    return saved === 'full' || saved === 'simple' ? saved : null;
  } catch { return null; }
};

export const writeLocalTelaLayout = (layout: TelaLayout) => {
  try { localStorage.setItem(TELA_LAYOUT_KEY, layout); } catch { /* private window: lasts this session */ }
};

/** The account's saved choice, or null when the user never picked one (or it can't be read). */
export async function loadTelaLayout(uid: string): Promise<TelaLayout | null> {
  try {
    const snap = await getDoc(prefDoc(uid));
    const layout = snap.exists() ? snap.data()?.layout : null;
    return layout === 'full' || layout === 'simple' ? layout : null;
  } catch { return null; }
}

export async function saveTelaLayout(uid: string, layout: TelaLayout): Promise<void> {
  try { await setDoc(prefDoc(uid), { layout, updatedAt: Date.now() }, { merge: true }); }
  catch { /* offline: localStorage still holds it; the next choice retries */ }
}
