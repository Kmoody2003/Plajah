# Apex Elohim: engine and tyre sound, source material brief

**Status:** the game uses the synthesised engine, tyre, gravel and brake sounds only. The earlier sample layers were cut from the soundtracks of reference videos and are switched off (`USE_VIDEO_SAMPLES = false` in `games/apex/src/audio.ts`). They carried tyre squeal and road noise inside the engine loop and did not follow what the car was doing.

## What good source material looks like

The engine has to follow the car: revs, load, gear shifts, the supercharger. That needs recordings of the engine itself, not of a car driving past.

**Engine (the Kestrel Sovereign GT-R: supercharged V8, about 8,000 rpm redline)**
- Recorded on a dyno or with the car stationary or on rollers, so there is no road, tyre or wind noise in it.
- Two microphone positions kept separate if possible: **engine bay or intake**, and **exhaust tip**.
- **Steady-rpm loops** at about every 500 rpm from idle to the redline, each held for 5 to 10 seconds, each in two states: **on throttle (under load)** and **off throttle (overrun)**.
- A **gear-shift** set: throttle lift and re-engage, rev-limiter bounce, and a few backfire and pop one-shots.
- **Supercharger whine** recorded or synthesised separately so it can follow boost.
- Mono or stereo, 44.1 or 48 kHz, 24-bit WAV, no compression, no music, no voices.

**Tyres**
- **Squeal:** several clean loops of tyre squeal on asphalt at different intensities (light scrub, hard squeal), recorded with the car in a slide, nothing else audible.
- **Rolling noise** on asphalt at 40, 80, 120 and 160 km/h, with the engine as quiet as possible.
- **Gravel, dirt, wet road** loops and a rain-on-road loop, each clean.
- **Kerb strike and impact** one-shots.

**Brakes:** a short disc-brake hiss and pad-squeal loop.

## How it plugs in

Each loop is played at a playback rate set by rpm and crossfaded with its neighbours by rpm and throttle load, which is the standard engine-audio approach. The synth stays as the fallback. `audio.ts` already has the structure for sample layers; it needs loops that behave.

## Licensing

Use only recordings the project owns or has a licence for. No audio ripped from videos or games.
