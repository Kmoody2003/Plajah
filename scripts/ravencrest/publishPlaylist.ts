/**
 * Publishes "The Ravencrest Score Playlist" — a platform-curated, public Chora playlist of the
 * Ravencrest score (the Dracula overture plus the Hallowen Interactive Score tracks).
 *
 * Usage (sign in as a Plajah admin — `playlists` and `systemConfig/settings` are admin-write):
 *   PLAJAH_AGENT_EMAIL=you@email.com PLAJAH_AGENT_PASSWORD=xxx npx tsx scripts/ravencrest/publishPlaylist.ts
 *
 * Mirrors syncInflectionPlaylist (services/backendService.ts): a fixed-id doc in `playlists`
 * owned by 'plajah' with inline tracks, then its id added to systemConfig/settings
 * .curatedMusicPlaylists so it shows for everyone under Staff Picks in Chora (and the TV rail).
 *
 * Track audio: reuses the masters publishScore.ts uploaded (users/{uid}/ravencrest-score/{id}.*);
 * if a track was never uploaded, uploads its bundled file from public/. Track ids are
 * `ravencrest_{id}` — the choraStreams doc ids — so the player streams HLS once publishScore.ts
 * has transcoded them, and plays the Storage file until then. Re-running overwrites the playlist.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { auth, storage, db } from '../../services/firebase';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCORE = path.join(ROOT, 'games/ravencrest/score.json');
const PLAYLIST_ID = 'curated_ravencrest_score';
const COVER = 'https://plajah.com/models/halloween/ravencrest/castle_exterior_moon.jpg';
const MIME: Record<string, string> = { '.wav': 'audio/wav', '.flac': 'audio/flac', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

interface Source { id: string; title?: string; source: string; url?: string }

async function trackUrl(uid: string, s: Source): Promise<string> {
  // A master publishScore.ts already uploaded?
  for (const ext of [path.extname(s.source), '.mp3', '.ogg']) {
    try { return await getDownloadURL(ref(storage, `users/${uid}/ravencrest-score/${s.id}${ext}`)); } catch { /* not there */ }
  }
  // Otherwise upload the bundled (web-sized) file.
  const file = path.join(ROOT, 'public', (s.url ?? '').replace(/^\/+/, ''));
  if (!s.url || !fs.existsSync(file)) throw new Error(`${s.id}: no uploaded master and no bundled file`);
  const ext = path.extname(file).toLowerCase();
  const r = ref(storage, `users/${uid}/ravencrest-score/${s.id}${ext}`);
  console.log(`[playlist] ${s.id}: uploading ${(fs.statSync(file).size / 1e6).toFixed(1)} MB…`);
  await uploadBytes(r, fs.readFileSync(file), { contentType: MIME[ext] ?? 'application/octet-stream' });
  return getDownloadURL(r);
}

async function main() {
  const email = process.env.PLAJAH_AGENT_EMAIL, password = process.env.PLAJAH_AGENT_PASSWORD;
  if (!email || !password) { console.error('Set PLAJAH_AGENT_EMAIL and PLAJAH_AGENT_PASSWORD.'); process.exit(1); }
  const sources: Source[] = JSON.parse(fs.readFileSync(SCORE, 'utf8'));
  await signInWithEmailAndPassword(auth, email, password);
  const uid = auth.currentUser!.uid;
  console.log('[playlist] signed in as', auth.currentUser?.email);

  const tracks = [];
  for (const [i, s] of sources.entries()) {
    tracks.push({
      id: `ravencrest_${s.id}`,
      title: s.title ?? s.id,
      artist: 'Ravencrest Score',
      url: await trackUrl(uid, s),
      albumCover: COVER,
      trackNo: i + 1,
    });
  }
  await setDoc(doc(db, 'playlists', PLAYLIST_ID), {
    id: PLAYLIST_ID,
    ownerId: 'plajah',
    authorName: 'Plajah',
    title: 'The Ravencrest Score Playlist',
    description: 'The score of Ravencrest — the Dracula overture that opens the night, the music of the Cinema Mile, and the theme that plays when Dracula is here.',
    coverImage: COVER,
    trackIds: tracks.map((t) => t.id),
    tracks,
    isDraft: false,
    timestamp: Date.now(),
  });
  console.log(`[playlist] wrote playlists/${PLAYLIST_ID} (${tracks.length} tracks)`);
  // Feature it (idempotent): this is what puts it in Staff Picks for every user.
  await setDoc(doc(db, 'systemConfig', 'settings'), { curatedMusicPlaylists: arrayUnion(PLAYLIST_ID) }, { merge: true });
  console.log('[playlist] featured in Staff Picks');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
