# Project Livewire — Plajah's own live streaming

Status: **built behind a switch, not live.** Mux keeps carrying every live stream until the
owner flips Livewire on (target: early 2027). Nothing in this doc changes production.

## Why

Mux bills live per minute twice: ~$0.032/min to encode what the broadcaster sends, and ~$0.001
per viewer-minute to deliver it. Delivery is the part that grows with success (a 150-viewer
weekly church service ≈ $60/mo; a 1,000-viewer concert ≈ $104). Livewire moves both into
Plajah so live hours can be unlimited on every tier, with no minute counting for users.

## How a Livewire stream flows

```
 Broadcaster                     Plajah origin (rented server)        Viewers
 ─────────────                   ──────────────────────────────       ───────
 Windows app: one capture  ──►  MediaMTX: takes SRT/WHIP in,   ──►  Bunny CDN edge (100+ cities)
 GPU encodes 3–4 rungs          packages LL-HLS (CMAF parts),        caches each 2 s segment once,
 (1080p/720p/480p/audio)        never re-encodes desktop rungs       serves every viewer
                                                                       │
 Browser/phone host ──► Livewire relay (GPU box) encodes the        hls.js player picks the rung
                        ladder for them (same as today's            (later: p2p assist for big
                        Mux relay, new output)                      audiences)
```

* **The encode happens on the broadcaster's PC** (NVENC / Quick Sync / AMF, AV1 where the GPU
  has it). That removes Mux's encode bill and the server CPU that would replace it.
* **The origin is a server we rent**, not the broadcaster's PC: viewers can't pull from a home
  connection (upload limits, NAT, privacy). One origin only repackages, so a ~$100–150/mo box
  handles hundreds of streams.
* **The CDN does the per-viewer work.** The origin sends each segment to each CDN region once;
  the CDN fans it out. That's why it scales: origin load grows with *streams*, not *viewers*.

## What we build vs. what we use

| Piece | Decision | Why |
|---|---|---|
| Ladder planner (rungs that fit the uplink + content) | **Build** — `services/livewire/ladder.ts` | This is the efficiency edge |
| Content-adaptive bitrate (slides/talk need far less) | **Build** — `contentAdapt.ts` | 30–50% less delivery on church/lecture content |
| Desktop multi-rung GPU encode | **Build** — `encodeArgs.ts` (ffmpeg on the bundled build) | Zero encode bill |
| HLS master playlist + codec strings | **Build** — `manifest.ts` | Needed for ABR, tiny |
| Publish tokens (who may push where) | **Build** — `token.ts` (HMAC, server only) | Security stays ours |
| Playback URL signing for the CDN | **Build** — `cdn.ts` | Keeps private/club streams private |
| Mux vs Livewire cost model | **Build** — `cost.ts` | Decide with numbers |
| Ingest + LL-HLS packaging | **Use MediaMTX** (MIT), config from `origin.ts` | Proven; already in our camera path |
| CDN | **Use Bunny** (~$0.005/GB) | Never build a CDN |
| Interactive low-latency (co-hosts, <1 s) | **Use LiveKit** self-hosted (Apache-2.0), phase 3 | |
| P2P assist for huge audiences | **Use p2p-media-loader** (Apache-2.0), phase 3 | |

Avoid OvenMediaEngine (AGPL).

## Matching Mux

| Mux strength | Livewire answer |
|---|---|
| ABR ladder | Same: 3–4 rungs, GOP-aligned (2 s keyframes, no scene-cut keyframes) |
| ~3–5 s latency (LL-HLS) | MediaMTX LL-HLS: 2 s segments (one GOP), 200 ms parts → ~2–4 s |
| Global delivery | Bunny edge network; origin shield in front of the origin |
| Reliability | Two origins (primary + backup ingest), health checks, auto-failover; **Mux stays as fallback** for big events until Livewire has a track record |
| Analytics (Mux Data) | Own player telemetry: startup time, rebuffer %, rung switches |

Honest gap: Mux has years of operations behind it. Livewire matches it on cost, latency and
quality from day one; reliability is earned by running both side by side first.

## Existing Mux video does not move

Livewire is **live only**. Uploaded videos and past Mux assets stay on Mux and keep playing.
New Livewire replays are stored by Livewire. Moving old Mux VOD is a separate, optional job
later (only if the Mux storage bill matters): list assets, download masters, repackage.

## Phases

1. **Now (this branch, not live):** planner, encoder args, manifests, tokens, CDN signing,
   origin config, cost model, target switch (`LIVEWIRE_ENABLED` off), tests, local end-to-end
   HLS ladder with the bundled ffmpeg — no server needed.
2. **Dev origin:** MediaMTX on this laptop (`node scripts/livewire-dev.mjs` writes its config);
   Windows app pushes the ladder over SRT; player plays from localhost.
3. **Staging origin:** one rented server + Bunny pull zone; internal accounts only
   (`LIVEWIRE_ALLOW_UIDS`). Run alongside Mux.
4. **Relay switch:** browser/phone hosts encoded by a GPU relay box instead of Mux.
5. **Cutover (new year):** Livewire default, Mux fallback, then Mux off for live.
6. Replays on **B2 behind Bunny** (owner decided 2026-11-08; B2→Bunny egress is free),
   LiveKit interactive mode, p2p assist.

## Built so far (phase 1)

`services/livewire/`: types, ladder, contentAdapt, encodeArgs, manifest, token, cdn, origin,
cost, target. `npx tsx --test tests/livewire.test.ts` — 18 tests, including a real 2-rung HLS
ladder encoded with the bundled ffmpeg (x264 and NVENC) and checked with ffprobe.
`npx tsx scripts/livewire-dev.ts` writes a local MediaMTX config.

Not done yet: the `/api/livewire/auth` route and stream registry, the origin sidecar that
serves `master.m3u8`, the Windows app pushing the ladder, the relay pointing at Livewire, the
player switch, any server or CDN. Open risk to check in phase 2: rungs are published as separate
MediaMTX paths, so confirm their segment timestamps line up for smooth rung switching.

## Costs (estimates, verify vendor pages)

* Fixed: ~$500–1,000/mo (2 origins, 2–3 edge/backup boxes, GPU relay, monitoring).
* Variable: Bunny ~$0.005/GB ≈ $0.0056 per viewer-hour at 720p.
* Break-even vs Mux at roughly $1,000/mo of Mux live spend.
* `cost.ts` reproduces these numbers for any stream.
