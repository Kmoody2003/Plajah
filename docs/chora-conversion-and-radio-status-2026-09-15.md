# Chora conversion and radio status — September 15, 2026

## Conversion findings

TOUCH ME LIKE A HYMN (`album_1789012583773_rw5tg`) has 14 original tracks (9 MP3, 5 WAV). At inspection none had a choraStreams document. This establishes missing renditions, but does not establish which historical enqueue request failed.

Album enqueueing previously depended on the upload screen callback. Personal track uploads did not enqueue, and worker catalog discovery covered public albums only. Cloud Scheduler inspection found no Chora job in us-west1, us-central1, or us-east4. A process timer is not a reliable durable driver on request-throttled Cloud Run.

Local changes move queue requests into successful persistence, add private track and album recovery, expire negative playback lookups, and make conversion-state write failures propagate. Private rendition metadata is owner-readable; media uses unguessable bearer capability links. Anyone given one of those links can use it, so do not publish them.

The existing encoder produces one 256 kbps AAC HLS rendition, plus separate lower-quality and lossless files. It does not produce a multi-bitrate adaptive HLS master playlist.

### Production activation still required

1. Review and deploy the application changes and owner-only choraPrivateStreams Firestore rules together.
2. Configure CHORA_CRON_KEY securely on the production backend.
3. Configure a durable scheduler to POST /api/chora/cron/transcode with the matching x-chora-cron-key header; use a request deadline exceeding the worker's 240-second budget and avoid overlapping invocations.
4. Run one bounded conversion, check a real playlist and its segments, and verify private metadata denies other accounts.
5. Backfill the album and verify all 14 tracks, then verify one new public upload and one locker upload end to end.

No production deployment, scheduler creation, or album backfill was performed in this investigation. Seventeen focused queue/worker tests pass; production playback verification remains outstanding.

## Radio design

The September 7 approved public design is **The Dial**: a now-playing hero and vertical 3D tuning drum combining Plajah and worldwide stations.

[Original design artifact](https://claude.ai/code/artifact/91ad8bfd-84ba-4601-8e47-223a15745a18)

The current RadioView still presents the directory interface. The Dial has not been implemented there. Separate Broadcast Master Control work exists in Settings → Broadcast: Smart Multiview, telemetry, now-playing, destinations, and station-management components. Actual relay delivery is disabled in broadcastDestinations.ts. Those components are not the public The Dial redesign.
