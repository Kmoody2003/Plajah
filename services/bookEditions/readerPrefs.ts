// A reader's rollback choice per book ("read the version I bought" instead of the latest). Per device,
// and only a preference: the server/policy still checks it is a version they may read.
const KEY = (bookId: string) => `lorea_version_${bookId}`;
export const VERSION_PREF_EVENT = 'lorea:version-pref';

export function getPreferredVersion(bookId: string): string | null {
  try { return localStorage.getItem(KEY(bookId)); } catch { return null; }
}

/** null = follow the latest version again. */
export function setPreferredVersion(bookId: string, versionId: string | null): void {
  try {
    if (versionId) localStorage.setItem(KEY(bookId), versionId);
    else localStorage.removeItem(KEY(bookId));
  } catch { /* private mode: the choice lasts this session only */ }
  try { window.dispatchEvent(new CustomEvent(VERSION_PREF_EVENT, { detail: { bookId, versionId } })); } catch { /* SSR */ }
}
