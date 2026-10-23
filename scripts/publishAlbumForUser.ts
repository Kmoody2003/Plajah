// publishAlbumForUser: publish a music album from a local folder INTO ANOTHER USER'S ACCOUNT (admin seed).
//
//   npx tsx scripts/publishAlbumForUser.ts scripts/seeds/<album>.json             DRY RUN (default): reads the owner + files, writes NOTHING
//   npx tsx scripts/publishAlbumForUser.ts scripts/seeds/<album>.json --publish   uploads audio + cover, writes the album and its side records
//   npx tsx scripts/publishAlbumForUser.ts scripts/seeds/<album>.json --unpublish makes the album private (reversible; deletes nothing)
//
// The manifest names the owner (ownerUid), the folder, the cover file and every track's file + title. Every ownership field is the
// OWNER's uid (services/publishAsUser.ts), so the album is theirs on their profile, discography, the Chora catalogue and the feed; the
// admin running this appears nowhere on it. Re-running UPDATES the same album (stable albumId and track ids, createdAt kept).
// Auth: the signed-in gcloud user (`gcloud auth print-access-token`), same as scripts/showcase/*. Writes go to the production database.
import { readFileSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { headers, getDoc, putDoc, patchFields, BUCKET } from './showcase/gcp';
import {
  buildPublishAsAlbum, buildPublishAsMediaAsset, buildPublishAsFeedItem, buildPublishAsStreamJob, publishAsTrackId,
} from '../services/publishAsUser';

interface Manifest {
  albumId: string; ownerUid: string; title: string; artist: string; genre: string; description?: string; tags?: string[];
  folder: string; cover: string; tracks: Array<{ file: string; title: string }>;
}

const args = process.argv.slice(2);
const manifestPath = args.find(a => !a.startsWith('--'));
const PUBLISH = args.includes('--publish');
const UNPUBLISH = args.includes('--unpublish');
if (!manifestPath) { console.error('usage: npx tsx scripts/publishAlbumForUser.ts <manifest.json> [--publish|--unpublish]'); process.exit(1); }
const m: Manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

/** Duration from the RIFF header (data bytes / byte rate); undefined for anything that is not a plain PCM WAV. */
function wavDurationSec(file: string): number | undefined {
  const fd = openSync(file, 'r'); const buf = Buffer.alloc(65536); readSync(fd, buf, 0, buf.length, 0); closeSync(fd);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return undefined;
  let off = 12, byteRate = 0; const size = statSync(file).size;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4); const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(off + 16);
    if (id === 'data') return byteRate ? Math.min(sz, size - off - 8) / byteRate : undefined;
    off += 8 + sz + (sz & 1);
  }
  return undefined;
}

const mimeFor = (f: string) => ({ '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg' } as Record<string, string>)[path.extname(f).toLowerCase()] || 'application/octet-stream';

/** Resumable upload (large WAVs) with a download token, stamped with the OWNER's uid like a client upload would be. */
async function uploadAs(objectPath: string, bytes: Buffer, contentType: string): Promise<string> {
  const token = crypto.randomUUID();
  const init = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=resumable&name=${encodeURIComponent(objectPath)}`, {
    method: 'POST',
    headers: { ...(await headers()), 'X-Upload-Content-Type': contentType, 'X-Upload-Content-Length': String(bytes.length) },
    body: JSON.stringify({ name: objectPath, contentType, cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token, ownerUid: m.ownerUid } }),
  });
  const session = init.headers.get('location');
  if (!init.ok || !session) throw new Error(`upload init ${objectPath}: HTTP ${init.status} ${(await init.text()).slice(0, 300)}`);
  const put = await fetch(session, { method: 'PUT', headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.length) }, body: bytes });
  if (!put.ok) throw new Error(`upload ${objectPath}: HTTP ${put.status} ${(await put.text()).slice(0, 300)}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

async function main() {
  console.log(`${UNPUBLISH ? 'UNPUBLISH' : PUBLISH ? 'PUBLISH' : 'DRY RUN'} | albums/${m.albumId} | owner ${m.ownerUid}`);
  const owner = await getDoc(`users/${m.ownerUid}`);
  if (!owner) throw new Error(`users/${m.ownerUid} not found`);
  console.log(`Owner account: "${owner.displayName || '(no display name)'}"${owner.username ? ` @${owner.username}` : ''}`);

  if (UNPUBLISH) {
    await patchFields(`albums/${m.albumId}`, { isPublic: false, isPrivate: true });
    await patchFields(`mediaAssets/${m.albumId}`, { status: 'PRIVATE', updatedAt: Date.now() });
    console.log('made private'); return;
  }

  const coverPath = path.join(m.folder, m.cover);
  if (!existsSync(coverPath)) throw new Error(`cover missing: ${coverPath}`);
  const files = m.tracks.map((t, i) => ({ ...t, trackNo: i + 1, abs: path.join(m.folder, t.file) }));
  const missing = files.filter(f => !existsSync(f.abs));
  if (missing.length) throw new Error(`missing audio: ${missing.map(f => f.file).join(', ')}`);
  let totalMb = 0, totalSec = 0;
  for (const f of files) {
    const sec = wavDurationSec(f.abs) ?? 0; const mb = statSync(f.abs).size / 1048576; totalMb += mb; totalSec += sec;
    console.log(`  ${String(f.trackNo).padStart(2)}. ${f.title.padEnd(44)} ${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}  ${mb.toFixed(0)} MB`);
  }
  console.log(`  ${files.length} tracks, ${Math.round(totalSec / 60)} min, ${(totalMb / 1024).toFixed(2)} GB; cover ${m.cover}`);

  const existing = await getDoc(`albums/${m.albumId}`);
  if (existing && existing.ownerId !== m.ownerUid) throw new Error(`albums/${m.albumId} exists and belongs to ${existing.ownerId}; refusing to overwrite`);
  console.log(existing ? 'Will UPDATE the existing album (createdAt kept).' : 'Will CREATE a new album.');
  if (!PUBLISH) { console.log('\nDry run only: nothing was written. Re-run with --publish to publish.'); return; }

  // Cover: original + 1024 display + 320 thumb, the same set uploadImageWithDerivatives makes in the browser.
  const sharp = (await import('sharp')).default;
  const coverBuf = readFileSync(coverPath);
  const base = `albums/${m.albumId}/cover_${Date.now().toString(36)}`;
  const original = await uploadAs(`${base}_original${path.extname(m.cover).toLowerCase()}`, coverBuf, 'image/jpeg');
  const display = await uploadAs(`${base}.webp`, await sharp(coverBuf).resize({ width: 1024, height: 1024, fit: 'inside' }).webp({ quality: 86 }).toBuffer(), 'image/webp');
  const thumb = await uploadAs(`${base}_thumb.webp`, await sharp(coverBuf).resize({ width: 320, height: 320, fit: 'inside' }).webp({ quality: 82 }).toBuffer(), 'image/webp');
  console.log('cover uploaded');

  const tracks = [];
  for (const f of files) {
    const id = publishAsTrackId(m.albumId, f.trackNo);
    const storagePath = `albums/${m.albumId}/tracks/${id}_${f.file.replace(/[^\w.-]+/g, '_')}`;
    const url = await uploadAs(storagePath, readFileSync(f.abs), mimeFor(f.file));
    tracks.push({ id, title: f.title, url, storagePath, durationSec: wavDurationSec(f.abs), trackNo: f.trackNo });
    console.log(`  uploaded ${f.trackNo}/${files.length} ${f.title}`);
  }

  const album = buildPublishAsAlbum({
    albumId: m.albumId, ownerUid: m.ownerUid, title: m.title, artist: m.artist, genre: m.genre, description: m.description, tags: m.tags,
    cover: { display, thumb, original }, tracks, createdAt: (existing?.createdAt as number) || Date.now(),
  });
  await putDoc(`albums/${m.albumId}`, album);
  await putDoc(`mediaAssets/${m.albumId}`, buildPublishAsMediaAsset(album));
  await patchFields(`users/${m.ownerUid}`, { isArtist: true });
  if (!existing) await putDoc(`feed/release_${m.albumId}`, buildPublishAsFeedItem(album, { displayName: owner.displayName, photoURL: owner.photoURL }));
  for (const t of tracks) await putDoc(`choraStreams/${t.id}`, buildPublishAsStreamJob(album, t));
  console.log('album, media asset, artist flag, feed card and transcode jobs written');

  // Verify what a listener hits: the album reads back public and owned by the artist, and every track URL serves audio.
  const back = await getDoc(`albums/${m.albumId}`);
  let good = 0;
  for (const t of back?.tracks ?? []) { const r = await fetch(t.url, { headers: { Range: 'bytes=0-15' } }); if (r.ok && /audio\//.test(r.headers.get('content-type') || '')) good++; }
  const coverOk = (await fetch(back?.coverImage, { method: 'HEAD' })).ok;
  console.log(`\nverified: ownerId=${back?.ownerId} isPublic=${back?.isPublic} isPrivate=${back?.isPrivate} tracks ${good}/${back?.tracks?.length} playable, cover ${coverOk ? 'ok' : 'BROKEN'}`);
  if (back?.ownerId !== m.ownerUid || good !== tracks.length || !coverOk) throw new Error('verification failed');
}
main().catch(e => { console.error(e); process.exit(1); });
