# Livewire origin — plajah-live-1

Plajah's own live ingest server (Project Livewire). It takes streams in and serves HLS to Bunny CDN.

| | |
|---|---|
| Host | Hetzner Ashburn, `178.156.241.166`, Ubuntu 26.04, 2 vCPU / 2 GB |
| SSH | `ssh -i ~/.ssh/plajah_live root@178.156.241.166` (key only, passwords off) |
| Firewall (ufw) | 22/tcp, 1935/tcp RTMP, 8890/udp SRT, 8888/tcp HLS. API 9997 / metrics 9998 are localhost only |
| Services | `mediamtx` (v1.21.4, `/opt/mediamtx`), `plajah-live-auth` (`/opt/plajah-live/auth.mjs` on 127.0.0.1:9100) |
| Secrets | `/etc/plajah-live/env` on the box only: `LIVEWIRE_SECRET` (signs publish tokens), `LIVE_PULL_SECRET` (= `MTX_HLSCDNSECRET`, Bunny's origin secret) |

## Paths

`live/<streamId>/<rung>`, rung = `src` (single passthrough stream) or a ladder rung
(`1080p|720p|480p|360p|av1_1080p|av1_720p|audio`).

- **Publish (RTMP / OBS):** server `rtmp://178.156.241.166/live/<streamId>`, stream key `src?user=pub&pass=<token>`
- **Publish (SRT):** `srt://178.156.241.166:8890?streamid=publish:live/<streamId>/src:pub:<token>`
- **Read (Bunny only):** `http://178.156.241.166:8888/live/<streamId>/src/index.m3u8` with header
  `Authorization: Bearer <LIVE_PULL_SECRET>`. Without it every read returns 401.

The token is the HMAC grant from `services/livewire/token.ts` `signPublishToken` (same secret).
To mint one by hand on the box:
`set -a; . /etc/plajah-live/env; node /opt/plajah-live/auth.mjs mint <streamId> 6`

HLS is plain fMP4 (2 s segments), not LL-HLS, so Bunny can cache it. Segments are sent with
`max-age=3600` and playlists with `max-age=30`. Bunny should cache playlists for about 1 s.

## Bunny CDN (viewers)

Pull zone **plajahlive** (ID 7089060, High Volume tier), `https://plajahlive.b-cdn.net`, origin
`http://178.156.241.166:8888`. Viewer URL: `https://plajahlive.b-cdn.net/live/<streamId>/src/index.m3u8`.

Edge rules:
1. **Live playlists cache 1s**: `*.m3u8` → Override Cache Time 1 s + Override Browser Cache Time 1 s.
2. **Origin auth header**: `*` → Add Request Header `Authorization: Bearer <LIVE_PULL_SECRET>`.
   Without it MediaMTX answers 302 cookieCheck and Bunny fails. If you change the pull secret, update this rule too.

Verified 2026-11-26: playlist 200, segments cached at Bunny (second fetch HIT, `max-age=3600`),
CORS ok for plajah.com, origin direct without secret 401.
Local copies for the API are in `.env.local`: `LIVE_ORIGIN_HOST`, `LIVE_CDN_HOST`, `LIVE_PULL_SECRET`, `LIVEWIRE_SECRET`.

## Turning it on in the app

`LIVE_PROVIDER=livewire` plus `LIVE_ORIGIN_HOST`, `LIVE_CDN_HOST`, `LIVEWIRE_SECRET` and `LIVE_PULL_SECRET`
on the API. If any value is missing, everything stays on Mux (`services/livewire/originLive.ts`).

- **In-app Go Live (Reello Live):** `services/liveMuxRelayServer.ts` pushes the host's program to
  `rtmp://<origin>/live/<plajahStreamId>/src` with a signed token. `streams/{id}.muxLive` gets
  `provider:'livewire'` + `playbackUrl`, and viewers play the Bunny URL (`services/liveHlsPlayback.ts`).
- **OBS / encoders (Go Live wizard, Mux Pro):** `/api/mux/live/create` returns our origin's RTMP server +
  stream key (token valid 12 h) and SRT URL, with ids `lw_…`. Status checks the origin, and end is a no-op.
  There's no recording on this path yet.

Verified 2026-11-26 with a real run (browser-style WebM → relay → origin → Bunny): live after about 7 s, and the segment decodes.

## Redeploy

```
scp -i ~/.ssh/plajah_live -r deploy/live-origin root@178.156.241.166:/tmp/live
ssh -i ~/.ssh/plajah_live root@178.156.241.166 'bash /tmp/live/setup.sh'
```

`auth.mjs` mirrors `decideOriginAuth` in `services/livewire/token.ts`, so change both together.
