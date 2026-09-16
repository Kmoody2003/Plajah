/**
 * Voice Soundscape Engine
 * Real-Time Human Vocal Spectrum & Dynamic Auto-Gain Audio Visualizer
 *
 * Engineered specifically for spoken-word recordings (audiobooks, historic speeches,
 * oral history field tapes, and archival recordings).
 *
 * Key Capabilities:
 * 1. Vocal Formant Mapping: Maps 70 Hz to 5.2 kHz across 72 logarithmically-spaced control
 *    points so speech vowels, fundamentals, and consonants resonate across the entire canvas width.
 * 2. Adaptive Dynamic Auto-Gain Control (AGC): Automatically tracks peak vocal energy and
 *    smoothly normalizes low-level vintage recordings (1930s LoC discs, newsreels, quiet narrators)
 *    so voices react with vibrant, expressive 60-85% vertical deflection without clipping.
 * 3. Asymmetric Envelope Smoothing: Ultra-fast syllable attack (~20ms) with elegant harmonic decay (~150ms).
 * 4. Quiescent Natural Breath: Transitions seamlessly to a gentle ambient breath during speech pauses.
 */

export type VoiceSoundscapeTheme = 'audiobook' | 'speech' | 'interview';

export interface VoiceSoundscapeOptions {
  theme?: VoiceSoundscapeTheme;
  sensitivity?: number;
  heightScale?: number;
}

export function startVoiceSoundscape(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode | null,
  isPlaying: boolean,
  options?: VoiceSoundscapeOptions
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let animId: number;
  const theme = options?.theme || 'audiobook';
  const sensitivity = options?.sensitivity ?? 1.0;
  const heightScale = options?.heightScale ?? 0.82;

  const pointCount = 72;
  const smoothed = new Float32Array(pointCount);
  const secondarySmoothed = new Float32Array(pointCount);

  // Dynamic Auto-Gain Control (AGC) state
  let peakTracker = 45.0;
  let speechPresence = 0.0;
  let phase = 0.0;

  // Cache buffer for analyser data
  const bufferLength = analyser?.frequencyBinCount || 1024;
  const dataArray = new Uint8Array(bufferLength);

  // Pre-calculate bin mappings for vocal range (70 Hz to 5200 Hz)
  const sampleRate = analyser?.context?.sampleRate || 44100;
  const fftSize = analyser?.fftSize || Math.max(256, bufferLength * 2);
  const binHz = sampleRate / fftSize;
  const minHz = 70;
  const maxHz = 5200;

  const binIndices = new Int32Array(pointCount);
  for (let i = 0; i < pointCount; i++) {
    const t = i / (pointCount - 1);
    const hz = minHz * Math.pow(maxHz / minHz, t);
    binIndices[i] = Math.min(bufferLength - 1, Math.max(1, Math.round(hz / binHz)));
  }

  const minVocalBin = binIndices[0];
  const maxVocalBin = binIndices[pointCount - 1];

  let width = (canvas.width = Math.max(300, canvas.clientWidth * (window.devicePixelRatio || 1)));
  let height = (canvas.height = Math.max(60, canvas.clientHeight * (window.devicePixelRatio || 1)));

  const handleResize = () => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(300, (canvas.clientWidth || canvas.parentElement?.clientWidth || 400) * dpr);
    const h = Math.max(60, (canvas.clientHeight || canvas.parentElement?.clientHeight || 90) * dpr);
    if (w !== width || h !== height) {
      width = canvas.width = w;
      height = canvas.height = h;
    }
  };

  window.addEventListener('resize', handleResize);

  const render = () => {
    animId = requestAnimationFrame(render);
    handleResize();

    ctx.clearRect(0, 0, width, height);

    let maxByte = 0;
    let avgByte = 0;

    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      let count = 0;
      for (let b = minVocalBin; b <= maxVocalBin; b++) {
        const v = dataArray[b] || 0;
        if (v > maxByte) maxByte = v;
        sum += v;
        count++;
      }
      avgByte = sum / Math.max(1, count);
    }

    const isSpeaking = isPlaying && maxByte > 12;

    // Adaptive Peak AGC: fast attack when speech blooms, gentle decay
    if (isSpeaking) {
      if (maxByte > peakTracker) {
        peakTracker = peakTracker * 0.45 + maxByte * 0.55;
      } else {
        peakTracker = Math.max(22.0, peakTracker * 0.993);
      }
      speechPresence = Math.min(1.0, speechPresence + 0.12);
    } else {
      peakTracker = Math.max(22.0, peakTracker * 0.995);
      speechPresence = Math.max(0.0, speechPresence - 0.04);
    }

    // Auto-gain multiplier: boosts low-level voices to ~185 amplitude
    const targetPeak = 185.0;
    const autoGain = Math.min(5.2, targetPeak / Math.max(22.0, peakTracker)) * sensitivity;

    const time = Date.now() * 0.0018;
    phase += isSpeaking ? 0.035 : 0.015;

    // Compute target points across vocal spectrum
    const targets = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
      const bin = binIndices[i];
      const rawVal = isPlaying ? (dataArray[bin] || 0) : 0;

      // Soft-saturated vocal deflection
      const boosted = (rawVal * autoGain) / 255.0;
      const vocalVal = Math.tanh(boosted * 1.32);

      // Tranquil ambient breath for pauses or idle
      const breathPhase = time + (i / pointCount) * 5.0;
      const breathVal = 0.07 + Math.sin(breathPhase) * 0.04 + Math.sin(breathPhase * 0.5) * 0.02;

      // Blend speech and idle breath based on presence
      targets[i] = Math.max(vocalVal, breathVal * (1.0 - speechPresence * 0.7));
    }

    // Temporal smoothing (asymmetric attack/decay)
    for (let i = 0; i < pointCount; i++) {
      const tgt = targets[i];
      if (tgt > smoothed[i]) {
        smoothed[i] = smoothed[i] * 0.32 + tgt * 0.68; // punchy syllable attack
      } else {
        smoothed[i] = smoothed[i] * 0.74 + tgt * 0.26; // warm acoustic decay
      }
      // Secondary contour (slightly higher damping for harmonic contrast)
      secondarySmoothed[i] = secondarySmoothed[i] * 0.65 + smoothed[i] * 0.35;
    }

    // ── THEME RENDERING ──
    if (theme === 'audiobook') {
      renderAudiobookTerrain(ctx, width, height, smoothed, secondarySmoothed, pointCount, heightScale);
    } else if (theme === 'speech') {
      renderSpeechOratory(ctx, width, height, smoothed, secondarySmoothed, pointCount, heightScale, phase);
    } else {
      renderInterviewCadence(ctx, width, height, smoothed, secondarySmoothed, pointCount, heightScale, phase);
    }
  };

  render();

  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', handleResize);
  };
}

/**
 * Audiobook Theme: Wide Acoustic Resonance Terrain
 * Luminous Literary Amber-Gold & Rose-Violet Ribbon with Cyan Harmonic Filament
 */
function renderAudiobookTerrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  smoothed: Float32Array,
  secondary: Float32Array,
  count: number,
  heightScale: number
) {
  // 1. Ambient Vocal Aura Terrain Fill
  const auraGrad = ctx.createLinearGradient(0, height, 0, 0);
  auraGrad.addColorStop(0, 'rgba(107, 0, 153, 0.35)');
  auraGrad.addColorStop(0.45, 'rgba(212, 0, 85, 0.22)');
  auraGrad.addColorStop(0.85, 'rgba(255, 140, 0, 0.12)');
  auraGrad.addColorStop(1, 'rgba(255, 140, 0, 0.0)');

  ctx.beginPath();
  ctx.moveTo(0, height);

  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const y = height - (smoothed[i] * height * heightScale);
    if (i === 0) {
      ctx.lineTo(x, y);
    } else {
      const prevX = ((i - 1) / (count - 1)) * width;
      const prevY = height - (smoothed[i - 1] * height * heightScale);
      const cx = (prevX + x) / 2;
      const cy = (prevY + y) / 2;
      ctx.quadraticCurveTo(prevX, prevY, cx, cy);
    }
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = auraGrad;
  ctx.fill();

  // 2. Secondary Shimmering Cyan Harmonic Filament (articulation & consonants)
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(0, 218, 243, 0.65)';
  ctx.shadowColor = 'rgba(0, 218, 243, 0.4)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const y = height - (secondary[i] * height * (heightScale * 0.72));
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevX = ((i - 1) / (count - 1)) * width;
      const prevY = height - (secondary[i - 1] * height * (heightScale * 0.72));
      const cx = (prevX + x) / 2;
      const cy = (prevY + y) / 2;
      ctx.quadraticCurveTo(prevX, prevY, cx, cy);
    }
  }
  ctx.stroke();

  // 3. Primary Top Vocal Contour Ribbon (Warm Amber Gold to Rose Magenta)
  const ribbonGrad = ctx.createLinearGradient(0, 0, width, 0);
  ribbonGrad.addColorStop(0, '#FF8C00');
  ribbonGrad.addColorStop(0.5, '#F59E0B');
  ribbonGrad.addColorStop(0.85, '#D40055');
  ribbonGrad.addColorStop(1, '#6B0099');

  ctx.lineWidth = 3.0;
  ctx.strokeStyle = ribbonGrad;
  ctx.shadowColor = 'rgba(255, 140, 0, 0.65)';
  ctx.shadowBlur = 12;

  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const y = height - (smoothed[i] * height * heightScale);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevX = ((i - 1) / (count - 1)) * width;
      const prevY = height - (smoothed[i - 1] * height * heightScale);
      const cx = (prevX + x) / 2;
      const cy = (prevY + y) / 2;
      ctx.quadraticCurveTo(prevX, prevY, cx, cy);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 4. Resonance Formant Nodes (Glowing Orbs on Top Vocal Peaks)
  let peakIdx = -1;
  let maxVal = 0.45;
  for (let i = 4; i < count - 4; i++) {
    if (smoothed[i] > maxVal && smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1]) {
      peakIdx = i;
      maxVal = smoothed[i];
    }
  }

  if (peakIdx !== -1) {
    const px = (peakIdx / (count - 1)) * width;
    const py = height - (smoothed[peakIdx] * height * heightScale);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#FF8C00';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/**
 * Speech Theme: Historic Oratory & Statesmanship
 * Triple Layered Oratory Waves (Amber Orator Cadence, Warm Copper Hall Acoustic, Luminous Cyan Clarity)
 */
function renderSpeechOratory(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  smoothed: Float32Array,
  secondary: Float32Array,
  count: number,
  heightScale: number,
  phase: number
) {
  const centerY = height * 0.52;

  // Base Ambient Hall Glow
  let overallEnergy = 0;
  for (let i = 0; i < count; i++) overallEnergy += smoothed[i];
  overallEnergy /= count;

  const bgGrad = ctx.createRadialGradient(width * 0.5, centerY, 10, width * 0.5, centerY, width * 0.6);
  bgGrad.addColorStop(0, 
gba(217, 119, 6, ));
  bgGrad.addColorStop(0.7, 
gba(245, 158, 11, ));
  bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Wave 1: Reverberant Hall Acoustic (Amber-Rust)
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.65)';
  ctx.shadowColor = 'rgba(217, 119, 6, 0.4)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const env = secondary[i] * height * (heightScale * 0.48);
    const wave = Math.sin(phase * 0.8 + i * 0.14);
    const y = centerY + wave * env;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Wave 2: Rhetorical Sibilance & Presence (Cyan)
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(0, 218, 243, 0.65)';
  ctx.shadowColor = 'rgba(0, 218, 243, 0.5)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const env = secondary[i] * height * (heightScale * 0.42);
    const wave = Math.sin(phase * 1.3 - i * 0.18 + 2.0);
    const y = centerY + wave * env;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Wave 3: Main Orator Vocal Cadence Ribbon (Vivid Amber Gold)
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#F59E0B';
  ctx.shadowColor = 'rgba(245, 158, 11, 0.85)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const env = smoothed[i] * height * (heightScale * 0.62);
    const wave = Math.sin(phase * 1.0 + i * 0.12);
    const pin = Math.sin((i / (count - 1)) * Math.PI); // Pinned at boundaries
    const y = centerY + wave * env * pin;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/**
 * Interview Theme: Living Oral History & Field Recordings
 * Triple Layered Cadence Waves (Amber Voice Core, Magenta Dialect, Deep Purple Tape Atmosphere)
 */
function renderInterviewCadence(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  smoothed: Float32Array,
  secondary: Float32Array,
  count: number,
  heightScale: number,
  phase: number
) {
  const centerY = height * 0.52;

  let overallEnergy = 0;
  for (let i = 0; i < count; i++) overallEnergy += smoothed[i];
  overallEnergy /= count;

  // Archival tape glow
  const bgGrad = ctx.createRadialGradient(width * 0.5, centerY, 8, width * 0.5, centerY, width * 0.55);
  bgGrad.addColorStop(0, 
gba(212, 0, 85, ));
  bgGrad.addColorStop(0.6, 
gba(107, 0, 153, ));
  bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Layer 1: Archival Room Tone & Atmosphere (Royal Purple)
  ctx.lineWidth = 2.0;
  ctx.strokeStyle = 'rgba(107, 0, 153, 0.65)';
  ctx.shadowColor = 'rgba(107, 0, 153, 0.4)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const env = secondary[i] * height * (heightScale * 0.52);
    const wave = Math.sin(phase * 0.7 + i * 0.13 + 3.0);
    const y = centerY + wave * env;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Layer 2: Dialect & Inflection Resonance (Rose Magenta)
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = 'rgba(212, 0, 85, 0.75)';
  ctx.shadowColor = 'rgba(212, 0, 85, 0.55)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const env = secondary[i] * height * (heightScale * 0.45);
    const wave = Math.sin(phase * 1.1 - i * 0.16 + 1.2);
    const y = centerY + wave * env;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Layer 3: Primary Voice Articulation (Warm Amber Gold)
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#FF8C00';
  ctx.shadowColor = 'rgba(255, 140, 0, 0.85)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const env = smoothed[i] * height * (heightScale * 0.64);
    const wave = Math.sin(phase * 1.0 + i * 0.11);
    const pin = Math.sin((i / (count - 1)) * Math.PI);
    const y = centerY + wave * env * pin;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}
