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
  ],
  flanger: [
    preset('flange-tape', 'Tape Flange', 'Slow through-zero-style sweep with restrained feedback.', { rate: 0.08, depth: 0.82, center: 0.22, feedback: -24, mix: 48 }),
    preset('flange-jet', 'Jet Engine', 'Deep resonant positive-feedback sweep.', { rate: 0.22, depth: 0.9, center: 0.45, feedback: 82, mix: 68 }),
    preset('flange-metal', 'Hollow Metal', 'Short static-like combing with negative feedback.', { rate: 1.8, depth: 0.18, center: 0.08, feedback: -76, mix: 72 }),
  ],
  phaser: [
    preset('phase-vintage', 'Vintage Four Stage', 'Warm, slow classic pedal movement.', { rate: 0.22, depth: 0.58, center: 720, stages: 4, feedback: 18, mix: 46 }),
    preset('phase-deep', 'Deep Six', 'Six resonant stages for liquid synth motion.', { rate: 0.55, depth: 0.9, center: 1100, stages: 6, feedback: 62, mix: 68 }),
    preset('phase-fast', 'Electric Swirl', 'Fast bright rotation for transitions and percussion.', { rate: 5.5, depth: 0.62, center: 2200, stages: 6, feedback: 38, mix: 55 }),
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
};

export const presetsForFx = (type: string): FxPreset[] => FX_PRESETS[type] ?? [];
