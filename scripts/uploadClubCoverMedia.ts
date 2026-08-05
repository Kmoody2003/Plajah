/**
 * Syncs "Club Cover Images/" folder → Firebase Storage + Firestore.
 *
 * Usage:
 *   PLAJAH_AGENT_EMAIL=you@email.com PLAJAH_AGENT_PASSWORD=xxx npx tsx scripts/uploadClubCoverMedia.ts
 *
 * - Skips files already in Firestore (by filename as doc ID).
 * - Uploads to Storage:  club-cover-media/{filename}
 * - Writes Firestore doc: clubCoverMedia/{filename-slug}
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db, storage } from '../services/firebase';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.resolve(__dirname, '..', 'Club Cover Images');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);

function slugify(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
}

async function main() {
  const email    = process.env.PLAJAH_AGENT_EMAIL;
  const password = process.env.PLAJAH_AGENT_PASSWORD;
  if (!email || !password) {
    console.error('Set PLAJAH_AGENT_EMAIL and PLAJAH_AGENT_PASSWORD env vars.');
    process.exit(1);
  }

  console.log('[CoverMedia] Signing in…');
  await signInWithEmailAndPassword(auth, email, password);
  console.log('[CoverMedia] Signed in as', auth.currentUser?.email);

  if (!fs.existsSync(MEDIA_DIR)) {
    console.error(`[CoverMedia] Directory not found: ${MEDIA_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MEDIA_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
  });

  console.log(`[CoverMedia] Found ${files.length} media files.`);

  // Get existing doc IDs to skip already-uploaded files
  const existing = await getDocs(collection(db, 'clubCoverMedia'));
  const existingIds = new Set(existing.docs.map(d => d.id));

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const docId    = slugify(filename);
    const ext      = path.extname(filename).toLowerCase();
    const type     = IMAGE_EXTS.has(ext) ? 'image' : 'video';

    if (existingIds.has(docId)) {
      console.log(`[CoverMedia] Skip (already uploaded): ${filename}`);
      continue;
    }

    const filePath  = path.join(MEDIA_DIR, filename);
    const fileData  = fs.readFileSync(filePath);
    const storagePath = `club-cover-media/${filename}`;

    console.log(`[CoverMedia] Uploading [${i + 1}/${files.length}] ${filename}…`);
    const sRef = ref(storage, storagePath);
    await uploadBytes(sRef, fileData);
    const url = await getDownloadURL(sRef);

    await setDoc(doc(db, 'clubCoverMedia', docId), {
      url,
      type,
      name: filename,
      order: i,
      active: true,
      uploadedAt: Date.now(),
    });

    console.log(`[CoverMedia] ✓ ${filename} → ${url.slice(0, 60)}…`);
  }

  console.log('[CoverMedia] Sync complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('[CoverMedia] Error:', err);
  process.exit(1);
});
