// Curated factory starting points for every Pressing device. Presets describe musical intent,
// not arbitrary knob snapshots: each bank spans subtle, assertive, and creative use.
export interface FxPreset {
  id: string;
  name: string;
  description: string;
  params: Record<string, number>;
}

const preset = (id: string, name: string, description: string, params: Record<string, number>): FxPreset => ({ id, name, description, params });

export const FX_PRESETS: Record<string, FxPreset[]> = {
  eq: [
    preset('eq-vocal', 'Vocal Forward', 'Clears rumble and mud, then adds intelligibility and air.', { hp: 85, f1: 120, g1: -1, f2: 360, g2: -3.5, q2: 1.2, f3: 3600, g3: 4, q3: 0.9, f4: 12000, g4: 3, lp: 21000 }),
    preset('eq-drum', 'Drum Impact', 'Sub weight, less box, and a defined attack shelf.', { hp: 28, f1: 70, g1: 4, f2: 420, g2: -4, q2: 1.4, f3: 4200, g3: 3.5, q3: 1.1, f4: 11000, g4: 2, lp: 20000 }),
    preset('eq-dark', 'Dark Focus', 'Removes brittle top and makes room around the low mids.', { hp: 35, f1: 150, g1: 2, f2: 650, g2: 2.5, q2: 0.8, f3: 3800, g3: -4, q3: 1.5, f4: 9000, g4: -5, lp: 13500 }),
  ],
  comp: [
    preset('comp-glue', 'Bus Glue', 'Slow enough to keep punch, smooth enough to bind a mix.', { threshold: -16, ratio: 2, attack: 30, release: 180, knee: 18, makeup: 2 }),
    preset('comp-vocal', 'Vocal Leveler', 'Even, present vocal control without flattening consonants.', { threshold: -24, ratio: 3.5, attack: 12, release: 110, knee: 20, makeup: 4 }),
    preset('comp-smash', 'Parallel Smash', 'Aggressive room and drum compression for blending underneath.', { threshold: -36, ratio: 12, attack: 4, release: 70, knee: 8, makeup: 9 }),
  ],
  gate: [
    preset('gate-room', 'Room Cleanup', 'Gentle expansion that preserves natural tails.', { threshold: -48, range: 16, attack: 3, release: 260 }),
    preset('gate-drums', 'Tight Drums', 'Fast, deep gating for close drum microphones.', { threshold: -34, range: 52, attack: 0.5, release: 85 }),
    preset('gate-chop', 'Hard Chop', 'Near-on/off gating for designed rhythmic edits.', { threshold: -22, range: 60, attack: 0, release: 24 }),
  ],
  saturator: [
    preset('sat-tape', 'Tape Cohesion', 'Low-drive asymmetric density for buses and masters.', { drive: 0.22, warmth: 0.3, mix: 0.65, output: -1 }),
    preset('sat-tube', 'Tube Presence', 'Forward even harmonics for vocals, bass, and keys.', { drive: 0.48, warmth: 0.38, mix: 0.72, output: -2.5 }),
    preset('sat-crush', 'Hot Console', 'Audible edge and compression for drums or synths.', { drive: 0.82, warmth: 0.12, mix: 0.9, output: -5 }),
  ],
  imager: [
    preset('image-safe', 'Master Safe', 'A restrained lift with the sub anchored in mono.', { width: 118, monoBelow: 120 }),
    preset('image-wide', 'Wide Synth', 'Expansive sides while protecting kick and bass.', { width: 165, monoBelow: 170 }),
    preset('image-mono', 'Mono Check', 'Collapses the image for translation and phase checks.', { width: 0, monoBelow: 400 }),
  ],
  dehum: [
    preset('hum-50', '50 Hz Mains', 'European and international mains hum with six harmonics.', { fundamental: 50, harmonics: 6, q: 45 }),
    preset('hum-60', '60 Hz Mains', 'North American mains hum with six harmonics.', { fundamental: 60, harmonics: 6, q: 45 }),
    preset('hum-broad', 'Transformer Buzz', 'A broader eight-harmonic cleanup for electrical buzz.', { fundamental: 60, harmonics: 8, q: 18 }),
  ],
  deess: [
    preset('deess-vocal', 'Natural Vocal', 'Transparent control around the common vocal sibilance band.', { frequency: 6800, threshold: -27, amount: 4 }),
    preset('deess-bright', 'Bright Vocal', 'Higher-frequency control that retains presence.', { frequency: 8500, threshold: -31, amount: 6 }),
    preset('deess-harsh', 'Harsh Cymbals', 'Firm wideband top control for brittle overheads.', { frequency: 4800, threshold: -34, amount: 8 }),
  ],
  reverb: [
    preset('verb-room', 'Tight Wood Room', 'Immediate early reflections with a controlled tail.', { size: 0.55, decay: 0.75, preDelay: 4, damping: 7200, lowCut: 150, wetGain: 2, mix: 22 }),
    preset('verb-plate', 'Lush Vocal Plate', 'Bright, dense sustain that leaves the dry vocal forward.', { size: 2.8, decay: 3.2, preDelay: 42, damping: 12500, lowCut: 180, wetGain: 4, mix: 34 }),
    preset('verb-hall', 'Infinite Hall', 'A deep cinematic tail for pads, scores, and transitions.', { size: 6, decay: 8, preDelay: 75, damping: 5200, lowCut: 240, wetGain: 6, mix: 68 }),
  ],
  delay: [
    preset('delay-slap', 'Studio Slap', 'Short, dark single-repeat energy for voice and guitar.', { time: 105, feedback: 12, tone: 4200, spread: 4, wetGain: 2, mix: 22 }),
    preset('delay-dotted', 'Dotted Motion', 'Wide, musical repeats for leads and arpeggios.', { time: 375, feedback: 48, tone: 6200, spread: 28, wetGain: 2, mix: 38 }),
    preset('delay-dub', 'Dub Orbit', 'Dark regenerating echoes that bloom behind the source.', { time: 610, feedback: 82, tone: 2100, spread: 18, wetGain: 4, mix: 58 }),
  ],
  spaces: [
    preset('spaces-room', 'Record Room', 'Compact wood reflections for believable placement.', { space: 0, size: 0.8, damp: 0.35, preDelay: 3, width: 72, mix: 20 }),
    preset('spaces-plate', 'Silver Plate', 'Bright studio plate for vocals and snares.', { space: 2, size: 1.05, damp: 0.08, preDelay: 28, width: 100, mix: 34 }),
    preset('spaces-cathedral', 'Cathedral Bloom', 'Huge, dark, enveloping architecture.', { space: 6, size: 1.35, damp: 0.42, preDelay: 55, width: 100, mix: 62 }),
  ],
  chorus: [
    preset('chorus-subtle', 'Analog Double', 'A close, gently moving second take.', { rate: 0.35, depth: 0.24, delay: 0.18, spread: 0.45, mix: 28 }),
    preset('chorus-lush', 'Lush Ensemble', 'Wide, slow ensemble movement for pads and clean guitar.', { rate: 0.72, depth: 0.68, delay: 0.55, spread: 0.92, mix: 62 }),
    preset('chorus-warp', 'Seasick Cassette', 'Fast, deep pitch drift for character effects.', { rate: 3.2, depth: 0.9, delay: 0.75, spread: 0.7, mix: 78 }),
    preset('chorus-80s', '80s Clean', 'The bright, wide chorus on every 80s clean guitar and DX bell.', { rate: 0.5, depth: 0.45, delay: 0.35, spread: 1, mix: 45 }),
    preset('chorus-bass', 'Bass Widener', 'A mono-safe, gentle chorus that thickens bass without wandering.', { rate: 0.28, depth: 0.18, delay: 0.12, spread: 0.35, mix: 22 }),
  ],
  flanger: [
    preset('flange-tape', 'Tape Flange', 'Slow through-zero-style sweep with restrained feedback.', { rate: 0.08, depth: 0.82, center: 0.22, feedback: -24, mix: 48 }),
    preset('flange-jet', 'Jet Engine', 'Deep resonant positive-feedback sweep.', { rate: 0.22, depth: 0.9, center: 0.45, feedback: 82, mix: 68 }),
    preset('flange-metal', 'Hollow Metal', 'Short static-like combing with negative feedback.', { rate: 1.8, depth: 0.18, center: 0.08, feedback: -76, mix: 72 }),
    preset('flange-barber', 'Barberpole Rise', 'A slow, endless-rising sweep for builds and risers.', { rate: 0.05, depth: 1, center: 0.5, feedback: 60, mix: 60 }),
    preset('flange-vocal', 'Vocal Sheen', 'A subtle, wide flange that adds movement to vocals and pads.', { rate: 0.15, depth: 0.4, center: 0.3, feedback: 20, mix: 30 }),
  ],
  phaser: [
    preset('phase-vintage', 'Vintage Four Stage', 'Warm, slow classic pedal movement.', { rate: 0.22, depth: 0.58, center: 720, stages: 4, feedback: 18, mix: 46 }),
    preset('phase-deep', 'Deep Six', 'Six resonant stages for liquid synth motion.', { rate: 0.55, depth: 0.9, center: 1100, stages: 6, feedback: 62, mix: 68 }),
    preset('phase-fast', 'Electric Swirl', 'Fast bright rotation for transitions and percussion.', { rate: 5.5, depth: 0.62, center: 2200, stages: 6, feedback: 38, mix: 55 }),
    preset('phase-twelve', 'Twelve-Stage Liquid', 'A dozen stages for a deep, glassy, many-notch wash.', { rate: 0.4, depth: 0.85, center: 900, stages: 12, feedback: 70, mix: 62 }),
    preset('phase-funk', 'Funk Envelope', 'A fast, resonant eight-stage phase for rhythm guitar and clav.', { rate: 3.8, depth: 0.7, center: 1400, stages: 8, feedback: 55, mix: 58 }),
  ],
  tremolo: [
    preset('trem-bias', 'Bias Tremolo', 'Soft vintage pulse that breathes with chords.', { rate: 4.2, depth: 0.38 }),
    preset('trem-deep', 'Deep Brownface', 'Pronounced amp-style movement.', { rate: 6.1, depth: 0.78 }),
    preset('trem-chop', 'Audio Chopper', 'Fast near-silence modulation for designed rhythm.', { rate: 14, depth: 1 }),
  ],
  autopan: [
    preset('pan-drift', 'Slow Drift', 'Subtle long movement across the stereo field.', { rate: 0.12, depth: 0.45 }),
    preset('pan-orbit', 'Full Orbit', 'Complete left-right travel at a musical pace.', { rate: 0.8, depth: 1 }),
    preset('pan-spinner', 'Rotor Spin', 'Fast spatial animation for percussion and FX.', { rate: 6.5, depth: 0.88 }),
  ],
  vibrato: [
    preset('vib-tape', 'Tape Flutter', 'Small, quick pitch movement like imperfect transport.', { rate: 6.2, depth: 0.16 }),
    preset('vib-finger', 'Finger Vibrato', 'Natural instrumental pitch expression.', { rate: 5.1, depth: 0.38 }),
    preset('vib-warp', 'Pitch Melt', 'Extreme slow pitch instability.', { rate: 0.75, depth: 0.95 }),
  ],
  rotary: [
    preset('rot-chorale', 'Chorale', 'Slow dimensional cabinet rotation.', { speed: 0.08, depth: 0.52 }),
    preset('rot-ramp', 'Ramping Rotor', 'Mid-speed motion that suggests acceleration.', { speed: 0.48, depth: 0.72 }),
    preset('rot-fast', 'Tremolo Rotor', 'Fast, deep horn and drum rotation.', { speed: 1, depth: 0.92 }),
  ],
  comb: [
    preset('comb-string', 'Plucked String', 'Tuned positive feedback for Karplus-like resonance.', { freq: 220, feedback: 88, mix: 64 }),
    preset('comb-hollow', 'Hollow Body', 'Negative feedback creates odd, woody resonances.', { freq: 110, feedback: -72, mix: 58 }),
    preset('comb-glass', 'Glass Resonator', 'High, long metallic ringing.', { freq: 1180, feedback: 93, mix: 76 }),
  ],
  ringmod: [
    preset('ring-trem', 'Alien Tremolo', 'Sub-audio multiplication for asymmetric movement.', { freq: 7, mix: 48 }),
    preset('ring-bell', 'Bell Sidebands', 'Inharmonic metallic partials.', { freq: 440, mix: 74 }),
    preset('ring-robot', 'Robot Voice', 'Dense speech and synth sidebands.', { freq: 1750, mix: 88 }),
  ],
  autofilter: [
    preset('filter-wah', 'Envelope-Like Wah', 'Resonant band movement for guitar and keys.', { mode: 2, cutoff: 850, res: 9, drive: 0.2, rate: 1.8, depth: 0.72 }),
    preset('filter-pump', 'Low-Pass Pump', 'Deep slow movement with analog edge.', { mode: 0, cutoff: 1800, res: 5, drive: 0.38, rate: 0.5, depth: 0.82 }),
    preset('filter-riser', 'High-Pass Riser', 'Fast bright sweep for builds and transitions.', { mode: 1, cutoff: 420, res: 7, drive: 0.12, rate: 0.16, depth: 0.95 }),
  ],
  gater: [
    preset('gate-quarter', 'Quarter Pulse', 'Broad rhythmic breathing.', { division: 0, depth: 0.72 }),
    preset('gate-sixteenth', 'Sixteenth Chop', 'Tight dance-floor slicing.', { division: 2, depth: 0.94 }),
    preset('gate-thirtysecond', 'Thirty-Second Buzz', 'Rapid hard gating for fills and tension.', { division: 3, depth: 1 }),
  ],
  beatmasher: [
    preset('mash-quarter', 'Quarter Grab', 'A full-beat freeze for clean repeats.', { mash: 0, length: 0 }),
    preset('mash-sixteenth', 'Sixteenth Stutter', 'Classic rapid loop capture.', { mash: 0, length: 2 }),
    preset('mash-micro', 'Micro Mash', 'Tiny slices for glitch fills.', { mash: 0, length: 3 }),
  ],
  limiter: [
    preset('limit-safe', 'Safe Ceiling', 'Peak protection with minimal loudness change.', { gain: 1, ceiling: -1, release: 120 }),
    preset('limit-loud', 'Modern Loud', 'Firm level lift with a streaming-safe ceiling.', { gain: 7, ceiling: -1, release: 70 }),
    preset('limit-crush', 'Crushed Front', 'Aggressive limiting for parallel excitement.', { gain: 16, ceiling: -0.3, release: 28 }),
  ],
  transient: [
    preset('trans-punch', 'Drum Punch', 'Adds attack while keeping the body controlled.', { attack: 0.7, sustain: -0.12 }),
    preset('trans-room', 'Room Bloom', 'Softens attack and extends ambience.', { attack: -0.35, sustain: 0.7 }),
    preset('trans-tight', 'Tight & Dry', 'Shortens both the leading edge and decay.', { attack: -0.2, sustain: -0.75 }),
  ],
  bitcrush: [
    preset('bit-console', '12-Bit Console', 'Gentle vintage sampler grain.', { bits: 12, rateHz: 16000, mix: 42 }),
    preset('bit-sampler', 'Old Sampler', 'Crunchy 8-bit tone with bandwidth loss.', { bits: 8, rateHz: 9000, mix: 78 }),
    preset('bit-destroy', 'Pixel Destroy', 'Severe quantization and dark aliasing.', { bits: 3, rateHz: 2400, mix: 100 }),
  ],
  trim: [
    preset('trim-down', 'Pad Down', 'Quickly create headroom before a processor.', { gain: -6 }),
    preset('trim-unity', 'Unity', 'Return the stage to nominal level.', { gain: 0 }),
    preset('trim-up', 'Drive Next', 'Push the following device or bus.', { gain: 6 }),
  ],
  pristine: [
    preset('clean-gentle', 'Gentle Restore', 'Light artifact cleanup that protects transients and width.', { cliff: 16500, shimmer: 0.28, shimmerHz: 6500, dehiss: 0.18, rebuild: 0.22, transients: 0.2, width: 108, monoBelow: 90 }),
    preset('clean-ai', 'AI Mix Repair', 'Balanced cleanup for common generated-song artifacts.', { cliff: 15800, shimmer: 0.58, shimmerHz: 6000, dehiss: 0.42, rebuild: 0.48, transients: 0.44, width: 118, monoBelow: 115 }),
    preset('clean-rescue', 'Codec Rescue', 'Assertive de-shimmer, de-hiss, and spectral rebuilding.', { cliff: 14500, shimmer: 0.88, shimmerHz: 5600, dehiss: 0.68, rebuild: 0.78, transients: 0.72, width: 132, monoBelow: 140 }),
  ],

  // ── Wave 2 dynamics ──
  gluecomp: [
    preset('glue-mix', 'Mix Glue', 'Slow SSL-style bus glue — 2 dB of gentle 4:1 to bind the mix.', { threshold: -18, ratio: 4, attack: 10, release: 300, makeup: 2, mix: 100 }),
    preset('glue-drum', 'Drum Bus', 'Faster, punchier bus compression that lets transients through.', { threshold: -16, ratio: 4, attack: 3, release: 150, makeup: 3, mix: 100 }),
    preset('glue-parallel', 'Parallel Crush', 'Hard 10:1 blended 40% under the dry — density with punch intact.', { threshold: -30, ratio: 10, attack: 1, release: 120, makeup: 6, mix: 40 }),
  ],
  multiband: [
    preset('mb-master', 'Master Control', 'Even three-band control for the mix bus — gentle across the spectrum.', { crossLow: 200, crossHigh: 2500, loThresh: -22, midThresh: -20, hiThresh: -20, ratio: 2.5, attack: 20, release: 220 }),
    preset('mb-bass-tight', 'Tighten Lows', 'Clamps the low band harder to control boom, mids/highs light.', { crossLow: 160, crossHigh: 3000, loThresh: -30, midThresh: -18, hiThresh: -16, ratio: 4, attack: 8, release: 140 }),
    preset('mb-deharsh', 'Tame Highs', 'Rides the high band to smooth harshness while lows stay open.', { crossLow: 250, crossHigh: 4000, loThresh: -14, midThresh: -16, hiThresh: -28, ratio: 3.5, attack: 5, release: 120 }),
  ],
  upexp: [
    preset('up-depth', 'Add Depth', 'Lifts the quiet detail a few dB — space and life without touching the loud.', { threshold: -42, amount: 5, attack: 12, release: 180 }),
    preset('up-tails', 'Reverb Lift', 'Brings up reverb and delay tails so they bloom.', { threshold: -50, amount: 9, attack: 20, release: 250 }),
    preset('up-room', 'Room Life', 'Assertive lift for a dead recording — pulls the room up.', { threshold: -38, amount: 12, attack: 8, release: 140 }),
  ],
  stutter: [
    preset('stut-16', '16th Roll', 'Every step re-triggers — a driving 1/16 machine-gun stutter.', { on: 1, pattern: 65535, division: 2, gate: 100 }),
    preset('stut-offbeat', 'Offbeat Glitch', 'The offbeats stutter for a syncopated, glitchy feel.', { on: 1, pattern: 43690, division: 2, gate: 80 }),
    preset('stut-fill', 'Build Fill', 'Sparse hits that subdivide — a fast gate opens the last bars of a build.', { on: 1, pattern: 4369, division: 3, gate: 60 }),
  ],

  // ── Amp Rack — a stock library across clean, crunch, lead, metal, bass, ambient (original voicings) ──
  amprig: [
    // Clean
    preset('rig-studio-clean', 'Studio Clean', 'A pristine, full-range clean — the pedal platform.', { amp: 0, gain: 0.22, bass: 0.5, mid: 0.5, treble: 0.55, presence: 0.5, resonance: 0.4, sagAmt: 0.25, master: 0.7, cab: 1, mic: 0, micEdge: 0.4, pedal1On: 0, pedal1: 3, pedal1Drive: 0.4, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-american-clean', 'American Sparkle', 'Bright, glassy Fender-style clean with a tweed cab.', { amp: 2, gain: 0.28, bass: 0.5, mid: 0.45, treble: 0.62, presence: 0.55, resonance: 0.4, sagAmt: 0.3, master: 0.72, cab: 4, mic: 2, micEdge: 0.45, pedal1On: 0, pedal1: 3, pedal1Drive: 0.3, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-jazz-box', 'Jazz Box', 'Warm, round, dark-topped clean for hollow-body jazz.', { amp: 7, gain: 0.25, bass: 0.55, mid: 0.55, treble: 0.4, presence: 0.35, resonance: 0.45, sagAmt: 0.2, master: 0.7, cab: 2, mic: 1, micEdge: 0.5, pedal1On: 0, pedal1: 3, pedal1Drive: 0.3, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-vox-jangle', 'Top-Boost Jangle', 'Chimey British class-A jangle — bright and lively.', { amp: 5, gain: 0.35, bass: 0.45, mid: 0.5, treble: 0.65, presence: 0.6, resonance: 0.4, sagAmt: 0.35, master: 0.72, cab: 2, mic: 0, micEdge: 0.45, pedal1On: 0, pedal1: 7, pedal1Drive: 0.3, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-boutique-sparkle', 'Boutique Sparkle', 'A pristine class-A clean with a touch of hair when you dig in.', { amp: 8, gain: 0.32, bass: 0.5, mid: 0.5, treble: 0.58, presence: 0.55, resonance: 0.45, sagAmt: 0.35, master: 0.7, cab: 1, mic: 2, micEdge: 0.4, pedal1On: 0, pedal1: 3, pedal1Drive: 0.3, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    // Crunch
    preset('rig-tweed-break', 'Tweed Breakup', 'Cranked tweed on the edge of breakup — touch-sensitive grit.', { amp: 1, gain: 0.55, bass: 0.5, mid: 0.6, treble: 0.55, presence: 0.5, resonance: 0.45, sagAmt: 0.55, master: 0.7, cab: 4, mic: 0, micEdge: 0.4, pedal1On: 0, pedal1: 0, pedal1Drive: 0.4, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-plexi-crunch', 'Plexi Crunch', 'The classic British plexi crunch through greenbacks.', { amp: 3, gain: 0.62, bass: 0.5, mid: 0.6, treble: 0.58, presence: 0.6, resonance: 0.5, sagAmt: 0.4, master: 0.72, cab: 3, mic: 0, micEdge: 0.4, pedal1On: 0, pedal1: 0, pedal1Drive: 0.4, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-marshall-rock', 'Stack Rock', 'A big British stack rock rhythm tone.', { amp: 4, gain: 0.66, bass: 0.55, mid: 0.62, treble: 0.55, presence: 0.55, resonance: 0.55, sagAmt: 0.4, master: 0.75, cab: 3, mic: 3, micEdge: 0.45, pedal1On: 0, pedal1: 0, pedal1Drive: 0.4, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-blues-screamer', 'Blues Screamer', 'Tweed pushed by a green screamer — singing blues grit.', { amp: 1, gain: 0.5, bass: 0.5, mid: 0.62, treble: 0.55, presence: 0.5, resonance: 0.45, sagAmt: 0.5, master: 0.72, cab: 1, mic: 0, micEdge: 0.45, pedal1On: 1, pedal1: 0, pedal1Drive: 0.45, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-garage', 'Garage Snarl', 'A plexi shoved by a rodent — nasty garage rock.', { amp: 3, gain: 0.7, bass: 0.5, mid: 0.55, treble: 0.6, presence: 0.6, resonance: 0.5, sagAmt: 0.4, master: 0.72, cab: 3, mic: 0, micEdge: 0.35, pedal1On: 1, pedal1: 4, pedal1Drive: 0.55, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    // Lead
    preset('rig-singing-lead', 'Singing Lead', 'Plexi + screamer + a clean boost for a smooth, sustaining lead.', { amp: 3, gain: 0.65, bass: 0.45, mid: 0.68, treble: 0.58, presence: 0.6, resonance: 0.5, sagAmt: 0.45, master: 0.8, cab: 3, mic: 3, micEdge: 0.45, pedal1On: 1, pedal1: 0, pedal1Drive: 0.4, pedal2On: 1, pedal2: 3, pedal2Drive: 0.5 }),
    preset('rig-cali-lead', 'Rectified Lead', 'High-gain American lead through a dark oversize cab.', { amp: 6, gain: 0.75, bass: 0.55, mid: 0.5, treble: 0.6, presence: 0.62, resonance: 0.58, sagAmt: 0.4, master: 0.78, cab: 7, mic: 3, micEdge: 0.4, pedal1On: 1, pedal1: 0, pedal1Drive: 0.35, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-boutique-lead', 'Boutique Lead', 'A refined class-A lead — smooth, vocal, and dynamic.', { amp: 8, gain: 0.6, bass: 0.5, mid: 0.62, treble: 0.58, presence: 0.58, resonance: 0.5, sagAmt: 0.4, master: 0.78, cab: 6, mic: 2, micEdge: 0.45, pedal1On: 1, pedal1: 3, pedal1Drive: 0.4, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    // Metal
    preset('rig-modern-metal', 'Modern Metal', 'Tight, aggressive rhythm — scooped mids, screamer in front.', { amp: 6, gain: 0.85, bass: 0.6, mid: 0.42, treble: 0.6, presence: 0.65, resonance: 0.62, sagAmt: 0.35, master: 0.8, cab: 6, mic: 3, micEdge: 0.4, pedal1On: 1, pedal1: 0, pedal1Drive: 0.3, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-djent', 'Djent Tight', 'Extra-tight, percussive high gain with a clean boost.', { amp: 6, gain: 0.8, bass: 0.55, mid: 0.4, treble: 0.62, presence: 0.68, resonance: 0.55, sagAmt: 0.3, master: 0.8, cab: 7, mic: 3, micEdge: 0.35, pedal1On: 1, pedal1: 3, pedal1Drive: 0.35, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-doom', 'Doom Cathedral', 'Huge, saggy low-tuned doom through a dark oversize cab.', { amp: 9, gain: 0.8, bass: 0.72, mid: 0.5, treble: 0.45, presence: 0.45, resonance: 0.68, sagAmt: 0.6, master: 0.78, cab: 7, mic: 1, micEdge: 0.5, pedal1On: 1, pedal1: 2, pedal1Drive: 0.5, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-industrial', 'Industrial Razor', 'Cold, cutting high-gain with an industrial edge.', { amp: 9, gain: 0.85, bass: 0.55, mid: 0.45, treble: 0.65, presence: 0.7, resonance: 0.55, sagAmt: 0.3, master: 0.8, cab: 6, mic: 0, micEdge: 0.3, pedal1On: 1, pedal1: 4, pedal1Drive: 0.5, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    // Bass
    preset('rig-bass-di', 'Bass DI', 'Clean, solid direct bass through a 1×15.', { amp: 2, gain: 0.3, bass: 0.6, mid: 0.5, treble: 0.5, presence: 0.45, resonance: 0.5, sagAmt: 0.25, master: 0.72, cab: 5, mic: 3, micEdge: 0.45, pedal1On: 0, pedal1: 6, pedal1Drive: 0.4, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-bass-drive', 'Bass Grind', 'Driven bass with a bass overdrive for grit and cut.', { amp: 4, gain: 0.5, bass: 0.6, mid: 0.55, treble: 0.5, presence: 0.5, resonance: 0.55, sagAmt: 0.35, master: 0.74, cab: 5, mic: 3, micEdge: 0.4, pedal1On: 1, pedal1: 6, pedal1Drive: 0.5, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    // Ambient / clean-fx
    preset('rig-acoustic-sim', 'Acoustic Sim', 'Bright, airy direct clean that flatters an acoustic-style pickup.', { amp: 0, gain: 0.15, bass: 0.5, mid: 0.45, treble: 0.62, presence: 0.55, resonance: 0.35, sagAmt: 0.2, master: 0.7, cab: 0, mic: 2, micEdge: 0.5, pedal1On: 0, pedal1: 3, pedal1Drive: 0.2, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
    preset('rig-shimmer-clean', 'Shimmer Clean', 'A jangly top-boost clean lifted by a treble booster — ambient sparkle.', { amp: 5, gain: 0.4, bass: 0.45, mid: 0.5, treble: 0.65, presence: 0.62, resonance: 0.4, sagAmt: 0.35, master: 0.72, cab: 2, mic: 2, micEdge: 0.4, pedal1On: 1, pedal1: 7, pedal1Drive: 0.35, pedal2On: 0, pedal2: 3, pedal2Drive: 0.4 }),
  ],

  // ── Creative wave ──
  freqshift: [
    preset('fs-subtle-thicken', 'Subtle Thicken', 'A few Hz of shift blended low — a shimmering, chorus-like thickening.', { shift: 7, feedback: 0, mix: 35 }),
    preset('fs-metallic', 'Metallic Bell', 'A larger shift makes partials inharmonic — struck-metal and bell tones.', { shift: 220, feedback: 0.15, mix: 70 }),
    preset('fs-spiral', 'Spiral Cascade', 'Feedback re-shifts the output on every pass — an endlessly climbing spiral.', { shift: 60, feedback: 0.7, mix: 60 }),
    preset('fs-detune-down', 'Downward Blur', 'A downward shift with a wide blend — dark, detuned, and unsettling.', { shift: -110, feedback: 0.2, mix: 55 }),
    preset('fs-radio', 'Broken Radio', 'A big shift, mostly wet — the classic ring-mod-adjacent transmission artefact.', { shift: 400, feedback: 0.1, mix: 90 }),
  ],
  vocoder: [
    preset('voc-robot', 'Classic Robot', 'The archetypal talkbox-robot voice — tight bands, bright carrier.', { carrier: 110, detune: 6, breath: 0.06, tightness: 6, depth: 9, mix: 100 }),
    preset('voc-choir', 'Synth Choir', 'A wide, detuned carrier turns speech or pads into a lush vocoder choir.', { carrier: 90, detune: 22, breath: 0.04, tightness: 4, depth: 8, mix: 100 }),
    preset('voc-whisper', 'Breathy Whisper', 'Heavy breath noise for consonant-rich, airy robot whispers.', { carrier: 140, detune: 10, breath: 0.35, tightness: 5, depth: 7, mix: 100 }),
    preset('voc-bass-talk', 'Talking Bass', 'A low carrier makes a bassline or drum loop appear to speak.', { carrier: 55, detune: 8, breath: 0.05, tightness: 7, depth: 10, mix: 90 }),
  ],
  freeze: [
    preset('fz-pad', 'Frozen Pad', 'A moment of input blooms into a sustaining ambient pad.', { size: 300, spray: 0.3, rate: 0.3, freeze: 0.85, tone: 5000, mix: 55 }),
    preset('fz-shimmer', 'Shimmer Cloud', 'Fast, sprayed grains high in the spectrum — a glittering cloud.', { size: 120, spray: 0.7, rate: 1.2, freeze: 0.6, tone: 9000, mix: 45 }),
    preset('fz-infinite', 'Infinite Hold', 'Near-unity feedback for an effectively endless drone.', { size: 500, spray: 0.2, rate: 0.15, freeze: 0.98, tone: 4000, mix: 60 }),
    preset('fz-smear', 'Wide Smear', 'A short, panned tap cloud that smears transients into a wide wash.', { size: 80, spray: 0.5, rate: 0.6, freeze: 0.4, tone: 7000, mix: 40 }),
  ],
  tape: [
    preset('tape-warm', 'Warm Master', 'A gentle tape glue for buses and masters — a hair of bump and roll-off.', { drive: 0.22, bias: 0.1, bump: 2.5, bumpFreq: 80, wow: 0.15, flutter: 0.1, tone: 14000, hiss: 0, output: 0, mix: 100 }),
    preset('tape-drums', 'Drum Squash', 'Driven tape that fattens and softens drum transients.', { drive: 0.55, bias: 0.15, bump: 4, bumpFreq: 95, wow: 0.1, flutter: 0.15, tone: 11000, hiss: 0, output: -1, mix: 100 }),
    preset('tape-lofi', 'Lo-Fi Cassette', 'Heavy wow, rolled-off top and audible hiss — worn cassette character.', { drive: 0.7, bias: 0.25, bump: 5, bumpFreq: 110, wow: 0.7, flutter: 0.5, tone: 6500, hiss: 0.4, output: -1.5, mix: 100 }),
    preset('tape-slap', 'Vocal Tape', 'Subtle tape warmth and a touch of flutter for vocals.', { drive: 0.3, bias: 0.12, bump: 1.5, bumpFreq: 70, wow: 0.2, flutter: 0.2, tone: 13000, hiss: 0.1, output: 0, mix: 80 }),
  ],
  exciter: [
    preset('exc-air', 'Vocal Air', 'Silky high-harmonic sheen for vocals and acoustic guitar.', { freq: 5000, amount: 0.4, blend: 0.35, tone: 10000, character: 2 }),
    preset('exc-presence', 'Mix Presence', 'A broad presence lift for a whole mix that a shelf can’t match.', { freq: 3500, amount: 0.5, blend: 0.3, tone: 8000, character: 0 }),
    preset('exc-crisp', 'Crisp Cymbals', 'Bright, aggressive excitement for dull overheads and hats.', { freq: 6500, amount: 0.7, blend: 0.5, tone: 12000, character: 4 }),
  ],
  ensemble: [
    preset('ens-juno', 'Juno Wash', 'The classic wide, slow four-voice synth ensemble.', { rate: 0.5, depth: 0.5, width: 100, mix: 55 }),
    preset('ens-shimmer', 'Shimmer Pad', 'Fast, deep, hugely wide — a shimmering pad ensemble.', { rate: 1.4, depth: 0.8, width: 100, mix: 70 }),
    preset('ens-subtle', 'Subtle Widener', 'A gentle ensemble that widens without obvious modulation.', { rate: 0.3, depth: 0.28, width: 80, mix: 35 }),
  ],
  echo: [
    preset('echo-slap', 'Modern Slap', 'A tight, clean digital slapback — vocals and rockabilly guitar.', { time: 110, feedback: 12, mode: 0, pingpong: 0, spread: 8, tone: 9000, lowcut: 120, wow: 0, duck: 0, width: 60, mix: 22 }),
    preset('echo-tape', 'Vintage Tape', 'Saturated, wowing tape echo that darkens with every repeat.', { time: 380, feedback: 52, mode: 1, pingpong: 0, spread: 18, tone: 4800, lowcut: 160, wow: 0.4, duck: 0, width: 80, mix: 30 }),
    preset('echo-bbd', 'Analog BBD', 'A dark, bucket-brigade analog delay — warm and murky in the tail.', { time: 300, feedback: 60, mode: 2, pingpong: 0, spread: 20, tone: 3600, lowcut: 140, wow: 0.25, duck: 0, width: 75, mix: 28 }),
    preset('echo-pingpong', 'Ping-Pong Wide', 'Repeats bounce hard left-to-right across the stereo field.', { time: 260, feedback: 55, mode: 0, pingpong: 100, spread: 30, tone: 7000, lowcut: 120, wow: 0, duck: 0, width: 100, mix: 32 }),
    preset('echo-dub', 'Dub Sirens', 'High-feedback analog dub with wow — rides the edge of self-oscillation.', { time: 500, feedback: 82, mode: 2, pingpong: 40, spread: 25, tone: 3200, lowcut: 200, wow: 0.5, duck: 0, width: 90, mix: 38 }),
    preset('echo-ducked', 'Ducked Vocal', 'The echo ducks under the vocal, then blooms in the gaps — clean and modern.', { time: 340, feedback: 42, mode: 0, pingpong: 30, spread: 15, tone: 8500, lowcut: 150, wow: 0, duck: 70, width: 80, mix: 34 }),
    preset('echo-ambient', 'Diffuse Wash', 'Diffuse mode smears the repeats into a reverb-like ambient bed.', { time: 450, feedback: 65, mode: 3, pingpong: 20, spread: 35, tone: 6000, lowcut: 120, wow: 0.2, duck: 0, width: 100, mix: 42 }),
  ],
  cosmos: [
    preset('cos-shimmer', 'Cathedral Shimmer', 'A classic octave-up shimmer bloom in a huge stone space.', { space: 6, size: 1.5, time: 140, feedback: 58, shimmer: 45, shimmerFreq: 1400, diffusion: 65, tone: 7500, preDelay: 40, reverse: 0, mix: 45 }),
    preset('cos-infinite', 'Infinite Bloom', 'Near-oscillating feedback and heavy shimmer — an endless ascending pad.', { space: 7, size: 1.8, time: 180, feedback: 80, shimmer: 65, shimmerFreq: 1100, diffusion: 80, tone: 6500, preDelay: 60, reverse: 0, mix: 55 }),
    preset('cos-reverse', 'Reverse Swell', 'A backwards, sucking reverb swell with a touch of shimmer.', { space: 5, size: 1.3, time: 120, feedback: 45, shimmer: 25, shimmerFreq: 1600, diffusion: 70, tone: 8000, preDelay: 20, reverse: 1, mix: 50 }),
    preset('cos-dark', 'Dark Nebula', 'A low, dark cloud — deep space with a subterranean octave rumble.', { space: 9, size: 1.6, time: 220, feedback: 62, shimmer: 35, shimmerFreq: 600, diffusion: 85, tone: 4200, preDelay: 80, reverse: 0, mix: 48 }),
    preset('cos-subtle', 'Subtle Halo', 'A gentle, wide halo behind a lead — shimmer sits low, mostly space.', { space: 4, size: 1.1, time: 100, feedback: 40, shimmer: 20, shimmerFreq: 2000, diffusion: 55, tone: 9000, preDelay: 30, reverse: 0, mix: 35 }),
  ],
  consoleeq: [
    preset('ceq-low-trick', 'Low-End Trick', 'The classic simultaneous low boost and cut — a fat yet defined bottom.', { lowFreq: 60, lowBoost: 5, lowCut: 4, lowMidFreq: 400, lowMid: -2, highMidFreq: 3000, highMid: 1, highFreq: 12000, high: 2, drive: 0.25, output: 0 }),
    preset('ceq-air', 'Silky Air', 'A broad high shelf plus warmth — expensive-sounding top for vocals and buses.', { lowFreq: 80, lowBoost: 1, lowCut: 0, lowMidFreq: 500, lowMid: 0, highMidFreq: 4000, highMid: 2, highFreq: 14000, high: 4.5, drive: 0.3, output: -0.5 }),
    preset('ceq-mid-forward', 'Mid Forward', 'A gentle presence push for guitars and keys that need to cut.', { lowFreq: 90, lowBoost: 0, lowCut: 2, lowMidFreq: 700, lowMid: 2.5, highMidFreq: 2600, highMid: 3.5, highFreq: 11000, high: 1.5, drive: 0.35, output: -1 }),
    preset('ceq-warm-glue', 'Warm Glue', 'Soft top, lifted low mids, and heavier drive — a cohesive analog wash.', { lowFreq: 100, lowBoost: 3, lowCut: 0, lowMidFreq: 450, lowMid: 2, highMidFreq: 3500, highMid: -1.5, highFreq: 10000, high: -1, drive: 0.5, output: -1.5 }),
  ],
};

export const presetsForFx = (type: string): FxPreset[] => FX_PRESETS[type] ?? [];
