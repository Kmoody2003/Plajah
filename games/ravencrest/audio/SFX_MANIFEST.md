# Ravencrest Monster SFX — Manifest

All sounds are **100 % procedurally synthesized** (Python + numpy/scipy, script:
`synth_sfx.py` in this folder). No samples, no downloads — original and license-clean.
Format: **48 kHz, stereo, 16-bit WAV**, peak-normalized to **−1.0 dBFS**, zero clipped
samples. Every file also exported as `.ogg` (Vorbis q6) alongside the WAV.
Loops are FFT-domain periodic, so they loop with **no seam click** (verified:
loop-boundary jump is smaller than ordinary sample-to-sample movement).

## Kraken (river monster)

| File | Dur | Type | Trigger / in-game event |
|---|---|---|---|
| `kraken_water_turbulence_loop` | 20.00 s | Loop | Whole kraken encounter — runs under everything while any tentacle is up |
| `kraken_underwater_rumble_loop` | 6.00 s | Loop | Tentacles submerged / nearby but not surfaced — distant presence |
| `kraken_emerge_splash` | 2.50 s | One-shot | Tentacle **emerge** clip (burst up from the water) |
| `kraken_swing_whoosh` | 1.20 s | One-shot | Tentacle swing / **slam** wind-up, **recoil** — time it to the arc of the swing |
| `kraken_slam_impact` | 1.80 s | One-shot | Tentacle **slam** hitting the bridge deck (fires on the `slam` contact frame) |
| `kraken_sucker_squelch` | 0.80 s | One-shot | **Wrap** grip tightening / suckers releasing (`wrap` clip, and again lighter on release) |
| `kraken_coil_creak` | 2.00 s | One-shot | **Wrap** hold — flesh straining around the post while the coil bears load |
| `kraken_drips` | 3.00 s | One-shot | After **retract** / after a tentacle dives or settles — water sheeting off the flesh |

## Bridge Troll

| File | Dur | Type | Trigger / in-game event |
|---|---|---|---|
| `troll_roar` | 2.00 s | One-shot | **Roar** clip (also the encounter intro / climb_flip landing taunt) |
| `troll_slam_thud` | 1.00 s | One-shot | **Attack_1** hammer-fist slam contact (+ climb_flip landing, pitched/gained down a touch) |
| `troll_chain_rattle` | 1.20 s | One-shot | Chain swing accents: attack_2 backhand, attack_3 grab lunge, stagger, climb start |
| `troll_stomp` | 0.70 s | One-shot | Footsteps — walk / run / chase cycles, foot-plant frames |

## Layering notes

- **Turbulence loop is the bed of the whole kraken encounter.** Start it when the
  encounter triggers, keep gain low (≈ −18 to −14 dB under the one-shots), duck it
  ~3 dB under the slam impact, fade out when the last tentacle retracts, crossfade
  to the rumble loop if tentacles are still alive but submerged.
- **Rumble loop layers by proximity:** fade it in when tentacles are within ~15 m
  but underwater; it should be *felt* more than heard (sub-heavy). Crossfade
  rumble → turbulence as the first tentacle emerges.
- **Slam = whoosh + impact + drips:** swing_whoosh leads the strike (start it
  ~0.9 s before contact, timed to the swing arc), slam_impact fires exactly on the
  deck-contact frame, drips can follow ~0.4 s later at low gain for the water
  sheeting off. The impact's own tail already contains the wet flesh-reverb
  wobble (≈0.8 s, the kaiju-fat reverb the design asked for) — no extra reverb
  send needed on this one.
- **Wrap sequence:** sucker_squelch on grip, then coil_creak looped/restarted
  while the coil holds and strains; a second, shorter squelch (play from 0.3 s
  in, or pitch +10 %) on release.
- **Emerge:** emerge_splash on the emerge clip's surface-break frame; the
  turbulence bed underneath sells the displaced water between strikes.
- **Troll movement:** stomp on each foot plant (walk ≈ every 0.55 s, run/chase
  faster + slightly louder); chain_rattle at low gain can ride under run/chase
  and under climb_flip, full gain on attack_2/attack_3 and stagger.
- Stereo width is baked in modestly; keep these as 2D/attenuated-by-distance
  emitters at the tentacle/troll position rather than full 3D HRTF smearing so
  the sub content in slam/rumble stays mono-compatible and heavy.

## Synthesis method (one line each)

- **kraken_water_turbulence_loop** — FFT-domain periodic filtered noise (lowpass body + bandpass churn/foam layers) with integer-cycle slow swell LFOs, decorrelated stereo via circular convolution.
- **kraken_underwater_rumble_loop** — periodic lowpassed noise + 38/57 Hz sub tones with integer-cycle amplitude modulation.
- **kraken_emerge_splash** — upward-swept bandpass noise rush, sub displacement boom (140→45 Hz chirp), lowpassed splash burst, ~90 pitch-dropping droplet pings in the tail.
- **kraken_swing_whoosh** — chunked time-varying bandpass noise swept 140→620→180 Hz under a bell envelope, plus a sub body sweep and flung-off droplets.
- **kraken_slam_impact** — 90→30 Hz pitch-dropping sine thud + fat-jiggle wobble chirps, lowpassed-noise wet slap, highpassed spray, debris grain trickle, and a flesh-reverb tail of AM-wobbling (13→4 Hz) bandpassed noise.
- **kraken_sucker_squelch** — 8 short pitch-dropping chirp pops with bandpassed suction hiss over a wet stretch-noise bed.
- **kraken_coil_creak** — granular pitch-bent harmonic tones with 27 Hz vibrato roughness and stick-slip gating, wet noise riders, sub groan bed, micro-pops.
- **kraken_drips** — scheduled sine plinks (pitch drop ≈ ×0.5) with exponentially growing gaps and decaying amplitude, tiny splash ticks, faint water bed.
- **troll_roar** — detuned saw/square cluster on a 92→118→58 Hz pitch contour, ~13/26 Hz growl amplitude modulation + subharmonic, tanh waveshape distortion, chest bandpass/low body, breath noise, snarl falloff.
- **troll_slam_thud** — 120→34 Hz earth-thud chirp, highpassed stone-crack click cluster, lowpassed earth noise, metallic chain-ping tail, settle grains.
- **troll_chain_rattle** — 40 randomized inharmonic metallic pings (ratios 1 / 2.76 / 5.40 / 8.93 / 13.3) with double-bounce echoes over a rough lowpassed drag-scrape bed.
- **troll_stomp** — 105→36 Hz foot thud, earth noise, downward-gliding bandpass wet squelch, mud-release pops, two faint shackle pings as the chain settles.

## Verification (measured on the delivered WAVs)

All 12 files: 48 000 Hz, 2 channels, durations exact to the spec (±0.0 s),
peak **−1.00 dBFS**, **0 clipped samples**. Regenerate any time with
`python3 synth_sfx.py` (fixed seed — output is deterministic), then re-encode
OGG with ffmpeg (`-c:a libvorbis -q:a 6`).
