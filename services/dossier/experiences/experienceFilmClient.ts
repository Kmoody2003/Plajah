/**
 * Visitor-side read of the published hall film for an exhibit. Reads ONLY `experienceFilms/{exhibitId}` (public read,
 * see firestore.rules). It never touches the admin-only `experiences` collection, never needs a sign-in, and never
 * throws: any failure (offline, rules not deployed yet, no doc, malformed doc, slow network) resolves to `null`, which
 * the hall treats as "use the live canvas film".
 */
import { parsePublicFilm, type ExperienceFilmPublic } from './experienceModel';

const cache = new Map<string, Promise<ExperienceFilmPublic | null>>();

export function fetchHallFilm(exhibitId: string, timeoutMs = 3500): Promise<ExperienceFilmPublic | null> {
  const hit = cache.get(exhibitId);
  if (hit) return hit;
  const p = (async () => {
    try {
      const [{ db }, { doc, getDoc }] = await Promise.all([import('../../firebase'), import('firebase/firestore')]);
      const read = getDoc(doc(db, 'experienceFilms', exhibitId)).then(s => (s.exists() ? parsePublicFilm(s.data()) : null));
      const timeout = new Promise<null>(r => setTimeout(() => r(null), timeoutMs));
      return await Promise.race([read, timeout]);
    } catch {
      return null;
    }
  })();
  // A null (miss or failure) is not cached for the session: the next open retries. A hit is.
  p.then(v => { if (!v) cache.delete(exhibitId); });
  cache.set(exhibitId, p);
  return p;
}

/** Test/admin hook: forget what was read (the admin UI calls this after publishing to the hall). */
export const forgetHallFilm = (exhibitId?: string) => { if (exhibitId) cache.delete(exhibitId); else cache.clear(); };
