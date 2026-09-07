# Playback stability changes

The observed failures were consistent with several independent ownership and resource problems in the current editor:

- MonitorLayer streamed a remote source, fetched the entire same file into JavaScript chunks, then replaced the decoder source with a new object URL during playback. Every mounted clip could repeat this work.
- Audio fetched URLs before consulting local storage. Up to 32 warm decodes and the whole future sequence could start concurrently. A pending decode claimed audio ownership before any sound was scheduled, suppressing the fallback.
- React updates and the transport both sought playing video. Synchronization also interrupted seeks still in progress. The clock treated repeated reads within an audio render quantum as stalled hardware.
- The loading state did not reliably transition to ready, even when playback succeeded.

The changes resolve disk handles/local bytes before mounting media, retain a stable source for each mount, retry failed video sources through local storage before cloud fallback, and eliminate monitor-side whole-file cloud caching. Audio decodes have two workers, a 64 MiB input cap, a 128 MiB PCM cache, and a 12-second scheduling horizon. Larger or undecodable sources retain progressive element playback. Fallback audio stands down only once that clip is scheduled. Finished audio nodes disconnect, cleanup EQ is retained, source-end audio does not repeat its final samples, and video synchronization leaves pending seeks alone.

Layout changes add independent controls for the effects library, source/program split, VFX stage/inspector, node library/canvas/viewer/inspector, and color controls/scopes. Color stills, timeline strip and grade panels also expose native resize handles. Main workspace sizes persist locally; node workspace dimensions currently last for the mounted workspace.

## Verification

- `node node_modules/tsx/dist/cli.mjs --test tests/playbackPlan.test.ts tests/fabulaPlaybackRuntime.test.ts`
- `node scripts/verifyFabulaPlayback.mjs`: headless Chromium, actual WAV decode/scheduling, no cloud requests when local bytes exist, look-ahead boundary, audio ownership before/after stop, pointer and keyboard divider control.
- `npm run test:forge`: existing effects, transitions, keyframes, looks and related regression suites.
- Focused TypeScript check of playbackEngine.ts and mediaSource.ts. Full repository typechecking exceeded Node's default 4 GiB heap.
- Production Vite build passed (7,404 modules), with warnings about large chunks, mixed dynamic/static imports, Verovio's browser externalization, and AlbumArt3DViewer's Three.js export.

## Remaining architectural limits

Follow-up after the user's Temudune report: moved timeline editing tools outside the scrolling tracks, removed duplicate hidden media warmers, reduced thumbnail decoder slots, retained only the current/directional next monitor clip, fixed premature/rounded cut selection, deferred proxy-map adoption until paused, and made late-loaded media join at the running engine clock. Runtime diagnostics now include per-video readiness, buffering, drops and drift. These are additional corrections, not a reproduced Temudune acceptance result. The platform-level target is documented in [PLAJAH_MEDIA_ENGINE_ARCHITECTURE.md](PLAJAH_MEDIA_ENGINE_ARCHITECTURE.md).

These changes address specific reliability bugs; they do not establish an unprecedented editing engine or prove performance on all devices. The user's failing original clips and project have not been exercised in this test harness. Native HTML media decoding remains in use, with whole-buffer Web Audio for bounded sources and element audio for larger sources. Browser codec failures still require supported proxies or conversion.

The existing DOM/CSS, WebGL effect, WebGPU composite and color grading paths remain intact. This work does not unify their color transforms or certify HDR/reference color accuracy. Such certification needs known transfer-function/range/primaries test media, numerical output comparisons, and preview/export parity measurements. Real-time effect performance needs sustained dropped-frame, seek-latency and memory measurements on Intel integrated graphics and representative AMD, Nvidia and Qualcomm/ARM64 devices. No NPU acceleration was added or benchmarked. Those are still separate engineering and validation requirements, not guarantees of this patch.
