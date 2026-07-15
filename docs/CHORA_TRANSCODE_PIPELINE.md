# Chora Transcode Pipeline — Step 1 Scope

> Goal: end the APK stutter for good by transcoding every track once, at upload, into a lean
> hardware-decoded HLS ladder + a FLAC lossless tier, loudness-normalized, with the original master
> vaulted. Status-gated rollout: the player falls back to today's behavior until a track is `ready`,
> so **zero downtime and no regression during migration**. Companion to the streaming-architecture
> artifact.

## Where it runs (reuse, don't build)
`server.ts` on **Cloud Run already has ffmpeg installed and a working transcode endpoint**
(`/api/crossover/convert`, auth'd + rate-limited, `spawn('ffmpeg', …)` + a `?probe=1` health check).
Step 1 adds a sibling endpoint on the same service — no new infrastructure, no cold-start ffmpeg
bundling, same proven wall-clock-timeout guard.

- **New endpoint:** `POST /api/chora/transcode` — body `{ trackId, albumId, uid, srcPath|srcUrl }`.
  Auth via the existing `authMiddleware`; long timeout (music files are seconds–minutes of ffmpeg).
- **Trigger:** two ways in, both idempotent:
  1. **Explicit enqueue** from the publish flow — after `uploadFile` writes the master and the track
     doc, `AlbumCreator` calls the endpoint (fire-and-forget). Track is publishable immediately;
     status flips to `ready` when segments land.
  2. **Backfill / retry:** an admin script iterates existing track docs and calls the same endpoint.
- Concurrency: cap in-flight jobs (a small queue / semaphore) so a big album can't stampede the box.

## The ffmpeg recipe (per track)
1. **Loudness measure** (EBU R128, two-pass loudnorm) → target **−14 LUFS** (streaming standard):
   `ffmpeg -i IN -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null -` → parse measured values,
   feed them to the encode pass's `loudnorm=…:measured_I=…` for accurate normalization.
2. **Renditions** (all normalized):
   - **AAC-LC 256k** — `-c:a aac -b:a 256k` (or `libfdk_aac -vbr 5` if the build has it; see decisions).
   - **Data-saver** — `-c:a libfdk_aac -profile:a aac_he_v2 -b:a 96k` **if libfdk present**, else fall
     back to `-c:a aac -b:a 128k` (native ffmpeg AAC has no good HE-AAC).
   - **FLAC lossless** — `-c:a flac -compression_level 8` (single progressive file).
3. **HLS packaging** for the AAC rungs (fMP4/CMAF, 6s segments):
   `-f hls -hls_time 6 -hls_segment_type fmp4 -hls_playlist_type vod -master_pl_name master.m3u8`
   with a `-var_stream_map` binding the two AAC rungs → one adaptive master playlist.
4. Upload outputs to Storage; write status + URLs back to Firestore.

## Storage layout
```
music/{uid}/{albumId}/{trackId}/original.<ext>     ← master (kept; served only for download/distribution)
chora-hls/{trackId}/master.m3u8                     ← adaptive AAC ladder (the default stream)
chora-hls/{trackId}/aac256/{playlist.m3u8, init.mp4, seg-*.m4s}
chora-hls/{trackId}/aac96/{…}
chora-hls/{trackId}/lossless.flac                   ← HiFi tier + offline download
```
`chora-hls/*` gets `Cache-Control: public, max-age=31536000, immutable`; fronted by the CDN (Firebase
Hosting / Cloud CDN) for edge-cached range delivery. Master bucket stays private.

## Data model (Firestore track doc — additive, non-breaking)
```ts
track.stream = {
  status: 'pending' | 'processing' | 'ready' | 'failed',
  hls?: string,          // master.m3u8 URL
  flac?: string,         // lossless URL
  loudnessLufs?: number,
  durationSec?: number,
  rungs?: ['96k','256k'],
  error?: string,
  updatedAt: number,
};
```
`track.url` (the original) is untouched — kept for downloads, distribution delivery, and back-compat.

## Client changes (`GlobalPlayerContext.tsx` + a dep)
- Add **hls.js** (dependency). Safari/iOS play `.m3u8` natively (assign to `audio.src`); everywhere else
  attach hls.js to the element.
- **Source resolution** in `playTrack`: `const src = track.stream?.status === 'ready' ? track.stream.hls : track.url;`
  — so untransformed tracks keep playing exactly as today. All existing recovery/offline/decode-fallback
  logic stays.
- **Quality pref** (Data-saver / High / Lossless) → caps hls.js's max rung, or swaps to the FLAC source.
- **Offline downloads**: cache the single-file AAC-256 (or FLAC for HiFi) rendition, not HLS segments —
  simpler and smaller. The prewarm/gapless win we already shipped now warms tiny AAC instead of WAV.
- Keep the shipped gapless prewarm + decode-guard; the RAM-decode fallback becomes essentially unused
  once everything is AAC.

## Backfill
Idempotent admin script (`scripts/chora-backfill.ts`): page all track docs, skip `status==='ready'`,
call `/api/chora/transcode` from each track's master, throttle N-at-a-time, log failures for retry.

## Rollout & safety
1. Ship the endpoint + data model + status-gated player (flag `chora:hls`) — no visible change (nothing
   is `ready` yet).
2. Turn on transcode-on-upload for NEW tracks; verify a few end-to-end.
3. Backfill the catalog in batches; tracks flip to HLS as they complete.
4. Optionally move cold masters to Nearline once `ready` (cost).

## Cost notes
- ffmpeg per track: ~seconds–1 min (two-pass loudnorm doubles decode). Bounded by the concurrency cap.
- Storage: +~30–50% for renditions; recoverable by tiering masters to Nearline.
- CDN egress on segments (already needed for any streaming).

## Open decisions (gate the build)
1. **libfdk_aac** in the Cloud Run image? Yes → true HE-AAC 96k data-saver + better AAC. No → native
   AAC, data-saver becomes LC 128k. (Recommend adding libfdk to the image.)
2. **Ship the FLAC lossless tier now** or AAC-only first (add FLAC later)?
3. **Masters hot or Nearline** after transcode (cost vs re-encode latency)?
4. **Trigger**: explicit enqueue from publish only, or also a Storage-finalize event as a backstop?
   (Recommend explicit now; add the event later.)
