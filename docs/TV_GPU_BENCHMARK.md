# TV GPU capability — can the television run FX Stage?

*Measured on the TCL test set, 2026-07-22, over CDP against the live app's WebView.*

## The hardware

| | |
|---|---|
| SoC | Realtek **rtd288o** |
| GPU | ARM **Mali-G31** (entry-level Bifrost, 1–2 execution engines) |
| RAM | 2 GB total — **~360 MB available** in normal use |
| Cores | 4 |
| Panel | 1920×1080 physical; WebView reports a 1600×900 CSS viewport at DPR 2 |
| WebGL | **WebGL 2**, GLSL ES 3.00, float textures, max texture 4096, max renderbuffer 8192 |

Capability is not the constraint. WebGL2 with float textures covers what a shader-based
effects stage needs. **Fill rate is the constraint**, as it always is on a Mali-G31 driving 1080p.

## The measurements

Full-screen fragment shader, fractal-value-noise, N octaves, measured over 2.5s per run
(8s for the sustained run). Two sessions, the second after a 30s idle cooldown.

**Session 1 (device warm, app active):**

| Render size | Octaves | FPS |
|---|---|---|
| 1920×1080 | 5 | 36.0 |
| 1280×720 | 5 | 60.2 (vsync-capped) |
| 1920×1080 | 2 | 22.6 |

**Session 2 (after cooldown, run in ascending-load order):**

| Run | FPS |
|---|---|
| COLD 1920×1080, 2 octaves | 48.7 |
| 1920×1080, 5 octaves | 50.6 |
| SUSTAINED 1920×1080, 5 octaves (8s) | 54.3 |
| after sustain — 1920×1080, 2 octaves | 58.9 |
| after sustain — 1280×720, 5 octaves | 57.5 |

## Reading the numbers

**It ramps up; it does not throttle.** Frame rate *rose* monotonically through session 2 —
48.7 → 50.6 → 54.3 → 58.9. That is the Mali DVFS governor: the GPU idles at a low clock and
takes seconds of sustained load to boost. The slowest number in each session is the *cold* one.
Session 1's odd 22.6 (fewer octaves, worse result) is the same effect plus contention from the
app, not a thermal wall — an 8-second sustained 1080p run never degraded.

**Shader complexity barely moved the needle; resolution did.** 2 octaves vs 5 octaves at 1080p
differs by a few frames, while dropping to 720p reliably pinned the vsync cap. This is a
fill-rate-bound part, so *pixels* cost far more than *maths per pixel*.

**Between-session variance is large** (36 vs 54 fps for the same workload). With ~360 MB free
and 4 cores shared with the app, whatever else is on screen matters as much as the shader.

## Verdict

- **30 fps at 1080p — comfortable.** Every run cleared 30 except the coldest contended one.
- **60 fps at 720p (upscaled) — achievable.** Hit the vsync cap repeatedly.
- **60 fps at native 1080p — not dependable.** Best sustained reading was ~59, and only after
  the governor had boosted, with nothing else demanding.

**Recommendation: render the stage at 720p and let the panel upscale, targeting 60 fps, with a
30 fps cap as the fallback.** On a television, a solid 30 reads better than a 45 that stutters,
and at normal viewing distance the upscale from 720p is close to invisible — while the fill-rate
saving is roughly half.

**Do not gate this on a device allowlist.** Measure at runtime: run a ~1s probe on first entry,
pick 60/720p, 30/1080p, or off, and remember the answer. The variance above is exactly why a
static assumption per model will be wrong.

**Also budget memory, not just frames.** ~360 MB available is the real ceiling; float
render targets at 1080p are ~8 MB each and a multi-pass chain adds up fast on a 2 GB box.

## Reproducing

`adb connect <tv>:5555` → forward the WebView devtools socket → run the shader benchmark through
CDP `Runtime.evaluate`. Let the device idle ~30s first and discard the first run, or the governor
ramp will read as a slow GPU. See [[plajah-tv-navigation]] for the CDP loop.
