/**
 * Publishes Ravencrest's score to Chora's streaming pipeline and points the game at it.
 *
 * Usage (signs in as you; uploads to your own Storage folder):
 *   PLAJAH_AGENT_EMAIL=you@email.com PLAJAH_AGENT_PASSWORD=xxx npx tsx scripts/ravencrest/publishScore.ts
 *   … add --force to re-transcode tracks that already have a stream.
 *
 * Source list: games/ravencrest/score.json
 *   [{ "id": "dracula-overture", "title": "…", "mood": "explore" | "boss" | "victory",
 *      "source": "docs/scores/dracula/dracula-overture.chora.wav",   // best-quality master
 *      "url": "/games/ravencrest/audio/dracula-overture.ogg" }]       // optional bundled fallback
 *
 * For each track: upload the master to users/{uid}/ravencrest-score/{id}.{ext}, ask the server to
 * transcode it (POST /api/chora/transcode → gapless AAC-256 HLS + loudness, written to
 * choraStreams/ravencrest_{id}), then write public/games/ravencrest/music.json with the `hls`
 * URLs. The game streams `hls` through hls.js and falls back to `url`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../../services/firebase';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCORE = path.join(ROOT, 'games/ravencrest/score.json');
const OUT = path.join(ROOT, 'public/games/ravencrest/music.json');
const API = (process.env.PLAJAH_API_BASE || 'https://plajah.com').replace(/\/+$/, '');
const MIME: Record<string, string> = { '.wav': 'audio/wav', '.flac': 'audio/flac', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

interface Source { id: string; title?: string; mood?: string; lead?: boolean; gain?: number; source: string; url?: string }
interface Track { id: string; title?: string; mood: string; lead?: boolean; gain?: number; hls?: string; url?: string }

async function main() {
  const email = process.env.PLAJAH_AGENT_EMAIL, password = process.env.PLAJAH_AGENT_PASSWORD;
  if (!email || !password) { console.error('Set PLAJAH_AGENT_EMAIL and PLAJAH_AGENT_PASSWORD.'); process.exit(1); }
  const force = process.argv.includes('--force');
  const sources: Source[] = JSON.parse(fs.readFileSync(SCORE, 'utf8'));
  const existing: Track[] = fs.existsSync(OUT) ? (JSON.parse(fs.readFileSync(OUT, 'utf8')).tracks ?? []) : [];

  await signInWithEmailAndPassword(auth, email, password);
  const uid = auth.currentUser!.uid;
  console.log('[score] signed in as', auth.currentUser?.email);

  const tracks: Track[] = [];
  for (const s of sources) {
    const prev = existing.find((t) => t.id === s.id);
    const track: Track = { id: s.id, title: s.title, mood: s.mood ?? 'explore', lead: s.lead, gain: s.gain, url: s.url, hls: prev?.hls };
    if (track.hls && !force) { console.log(`[score] ${s.id}: already streaming`); tracks.push(track); continue; }
    const file = path.join(ROOT, s.source);
    if (!fs.existsSync(file)) { console.warn(`[score] ${s.id}: source missing (${s.source}) — keeping fallback only`); tracks.push(track); continue; }
    const ext = path.extname(file).toLowerCase();
    console.log(`[score] ${s.id}: uploading ${(fs.statSync(file).size / 1e6).toFixed(1)} MB…`);
    const r = ref(storage, `users/${uid}/ravencrest-score/${s.id}${ext}`);
    await uploadBytes(r, fs.readFileSync(file), { contentType: MIME[ext] ?? 'application/octet-stream' });
    const srcUrl = await getDownloadURL(r);
    console.log(`[score] ${s.id}: transcoding on ${API} (a few minutes)…`);
    const token = await auth.currentUser!.getIdToken();
    const res = await fetch(`${API}/api/chora/transcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ trackId: `ravencrest_${s.id}`, srcUrl }),
      signal: AbortSignal.timeout(330_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.hls) { console.error(`[score] ${s.id}: transcode failed`, res.status, body.error ?? ''); tracks.push(track); continue; }
    track.hls = body.hls;
    console.log(`[score] ${s.id}: streaming at ${body.hls} (${Math.round(body.loudnessLufs ?? 0)} LUFS)`);
    tracks.push(track);
  }
  fs.writeFileSync(OUT, JSON.stringify({ tracks }, null, 2) + '\n');
  console.log(`[score] wrote ${path.relative(ROOT, OUT)} (${tracks.length} tracks)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
