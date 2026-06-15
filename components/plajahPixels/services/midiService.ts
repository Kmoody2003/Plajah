/**
 * MIDI & Audio Reactive Service for Plajah Pixels
 * Provides high-performance decoding for Native Instruments devices:
 * - Maschine Studio
 * - Komplete Kontrol (S25/M25/A25)
 * - Maschine Jam
 * Implements MIDI Learn mode, CC scaling, and custom event dispatches.
 */

export interface MidiEventData {
  status: number;
  channel: number;
  note: number;
  velocity: number;
  cc: number;
  value: number;
  timestamp: number;
  deviceName: string;
}

export type MidiMappingType = 'cc' | 'note';

export interface MidiMapping {
  parameter: string;
  type: MidiMappingType;
  ccOrNote: number;
  channel?: number;
  label: string;
  min: number;
  max: number;
  isInt?: boolean;
}

// Map Parameter to CC and value range
export const DEFAULT_MAPPINGS: Record<string, MidiMapping> = {
  sensitivity: { parameter: 'sensitivity', type: 'cc', ccOrNote: 14, label: 'Waveform Sensitivity', min: 0.1, max: 3.0 },
  glowIntensity: { parameter: 'glowIntensity', type: 'cc', ccOrNote: 15, label: 'Glow Intensity', min: 0, max: 30 },
  speed: { parameter: 'speed', type: 'cc', ccOrNote: 16, label: 'Wave Generation Speed', min: 0.1, max: 3.0 },
  blurStrength: { parameter: 'blurStrength', type: 'cc', ccOrNote: 17, label: 'Blur Strength', min: 0.1, max: 2.0 },
  particleCount: { parameter: 'particleCount', type: 'cc', ccOrNote: 18, label: 'Particle Count', min: 10, max: 300, isInt: true },
  layer2Opacity: { parameter: 'layer2Opacity', type: 'cc', ccOrNote: 19, label: 'Overlay Transparency', min: 0, max: 1.0 },
  backgroundPulseIntensity: { parameter: 'backgroundPulseIntensity', type: 'cc', ccOrNote: 20, label: 'Pulse Intensity', min: 0, max: 1.0 },
  lightingIntensity: { parameter: 'lightingIntensity', type: 'cc', ccOrNote: 21, label: 'Lighting Intensity', min: 0, max: 2.0 },
  
  // Group B / Extras
  mosaicIntensity: { parameter: 'mosaicIntensity', type: 'cc', ccOrNote: 22, label: 'Mosaic Intensity', min: 0, max: 1.0 },
  sliceCount: { parameter: 'sliceCount', type: 'cc', ccOrNote: 23, label: 'Slice Count', min: 2, max: 24, isInt: true },
  sliceRotation: { parameter: 'sliceRotation', type: 'cc', ccOrNote: 24, label: 'Slice Rotation', min: 0, max: 360, isInt: true },
  bassShakeIntensity: { parameter: 'bassShakeIntensity', type: 'cc', ccOrNote: 25, label: 'Bass Shock Intensity', min: 0.1, max: 3.0 },
  lumBassBrightness: { parameter: 'lumBassBrightness', type: 'cc', ccOrNote: 26, label: 'Bass Lum Brightness', min: 0.1, max: 3.0 },
  lumMidColorCycle: { parameter: 'lumMidColorCycle', type: 'cc', ccOrNote: 27, label: 'Mid Color Cycle', min: 0, max: 1.0 },
  particleTurbulence: { parameter: 'particleTurbulence', type: 'cc', ccOrNote: 28, label: 'Particle Turbulence', min: 0, max: 1.0 },
  particleLifespan: { parameter: 'particleLifespan', type: 'cc', ccOrNote: 29, label: 'Particle Lifespan', min: 0.5, max: 5.0 },
  particleGlow: { parameter: 'particleGlow', type: 'cc', ccOrNote: 30, label: 'Particle Glow', min: 0, max: 30 },
  luminanceThreshold: { parameter: 'luminanceThreshold', type: 'cc', ccOrNote: 31, label: 'Luminance Threshold', min: 0, max: 1.0 },
  volume: { parameter: 'volume', type: 'cc', ccOrNote: 7, label: 'Master Volume', min: 0, max: 1.0 }
};

export function scaleCCValue(val: number, mapping: MidiMapping): number {
  const scaled = mapping.min + (val / 127) * (mapping.max - mapping.min);
  return mapping.isInt ? Math.round(scaled) : parseFloat(scaled.toFixed(2));
}

// Match device template matching
export type DetectedDeviceType = 'generic' | 'maschine_studio' | 'komplete_kontrol' | 'maschine_jam';

export function detectDeviceType(name: string): DetectedDeviceType {
  const n = name.toLowerCase();
  if (n.includes('maschine studio')) return 'maschine_studio';
  if (n.includes('komplete kontrol') || n.includes('komplete_kontrol')) return 'komplete_kontrol';
  if (n.includes('maschine jam')) return 'maschine_jam';
  return 'generic';
}

// Dispatches standard Custom Events to window for low-latency visual performance UI listeners
export function dispatchMidiEvent(event: MidiEventData) {
  window.dispatchEvent(new CustomEvent('plajah-midi-raw', { detail: event }));

  // Helper classification triggers
  const isVelocityOn = event.status >= 0x90 && event.status <= 0x9F && event.velocity > 0;
  const isNoteOff = (event.status >= 0x80 && event.status <= 0x8F) || (event.status >= 0x90 && event.status <= 0x9F && event.velocity === 0);
  const isCC = event.status >= 0xB0 && event.status <= 0xBF;

  if (isVelocityOn) {
    window.dispatchEvent(new CustomEvent('plajah-midi-note-on', { detail: event }));
  } else if (isNoteOff) {
    window.dispatchEvent(new CustomEvent('plajah-midi-note-off', { detail: event }));
  } else if (isCC) {
    window.dispatchEvent(new CustomEvent('plajah-midi-cc', { detail: event }));
  }
}
