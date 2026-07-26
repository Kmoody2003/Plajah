# Plajah FAST — carriage / platform-submission package

Plajah emits the industry-standard feed set a FAST platform (Samsung TV Plus, LG Channels, Roku,
or any IPTV/XMLTV aggregator) pulls to carry a channel. All endpoints are public, CORS-open, and
computed deterministically from the epoch-anchored slot schedule, so every consumer sees the same
"on now".

Base: `https://plajah.com`

| Endpoint | Format | Purpose |
|---|---|---|
| `GET /api/fast/lineup.json` | JSON | Channel lineup (id, name, number, category, logo). |
| `GET /api/fast/lineup.m3u8` | M3U (`application/x-mpegURL`) | Channel lineup as an M3U playlist. `tvg-id` = `plajah.<ownerId>` (joins to the XMLTV). Each entry points at that channel's HLS origin. |
| `GET /api/fast/epg.xml` | XMLTV | Program guide for all published channels, next 24h. `channel id` = `plajah.<ownerId>`. |
| `GET /api/fast/:ownerId/feed.mrss` | MRSS | Content catalogue (the channel's FAST-opted videos). |
| `GET /api/fast/:ownerId/now.json` | JSON | Deterministic on-now + next for one channel. |
| `GET /api/fast/:ownerId/stream.m3u8` | HLS (`application/x-mpegURL`) | The channel's **linear HLS origin** — a rolling live playlist stitched from its Mux content programmes. |

## How the origin works

`stream.m3u8` builds a live HLS media playlist on the fly (`services/fastChannelHls.ts`): it computes
the epoch-anchored "now", pulls the current programme's Mux media playlist, emits a small sliding
window of segments ending at the live edge, and bridges programme boundaries with
`#EXT-X-DISCONTINUITY`. Mux VOD playlists are cached ~5 min server-side. If stitching can't run it
302-redirects to the current programme's Mux master (valid, plays the current show).

## Scope / what production carriage still needs

This origin is a **working pilot** for Mux-HLS content. For at-scale carriage the operational pieces
that belong in a dedicated FAST playout service (Mux Live, Amagi, Wurl, Frequency) rather than this
app server are:

- **Mixed-format & house interstitials** — bumpers/ad-breaks aren't muxed into the HLS origin (they
  have no common-format segments). A packager transcodes everything to a uniform segment format.
- **SSAI** — server-side ad insertion / stitching for monetised ad breaks.
- **Hardened 24/7 origin** — CDN, DVR window, failover, per-variant multi-bitrate output, and scale.

In-app playback (`components/FastChannelPlayer.tsx`) does **not** use this origin — it plays the same
schedule client-side via the shared timeline (`services/fastChannelTimeline.ts`), which is why the
in-app guide and screen always match.
