// Fabula's audio FX = the SAME catalog Melos Studio uses.
//
// Melos's effect core (services/melos/beats/fx/) is pure Web Audio — engine-
// agnostic (BaseAudioContext), no GrooveDoc/engine coupling, no wasm. We import
// it here rather than copy it, so Fabula and Melos share ONE implementation and
// the effect set can never drift: add a device to Melos, Fabula gets it too.
//
// This barrel is Fabula's stable import point for the shared FX; wire inserts
// through FxChainHost, list the catalog from DEVICES, mint from newInstance().
export {
  DEVICES,
  FxChainHost,
  deviceByType,
  newInstance,
} from '../melos/beats/fx/devices';
export type { FxInstance, FxDescriptor } from '../melos/beats/fx/devices';
export { presetsForFx } from '../melos/beats/fx/presets';
// Master soft-clip brickwall curve — Melos's memoryless limiter that leaves layers
// untouched instead of pumping/ducking the sum (graph.ts is import-type-only at
// runtime, so this tree-shakes to just the function).
export { softClipCurve } from '../melos/beats/engine/graph';
// Master mastering chain + dynamic Spectra EQ — Melos's own, engine-agnostic, so
// Fabula's master gets the same "Pressing" (Era/Engineer) and surgical EQ.
export { SpectraEQ, defaultSpectra, defaultBands5 } from '../melos/beats/fx/spectraEq';
export type { SpectraState, SpectraBand } from '../melos/beats/fx/spectraEq';
export { MasteringChain, defaultMastering, applyEra, eraById, ERA_PROFILES, ENGINEERS } from '../melos/beats/fx/mastering';
export type { MasteringState, EraProfile, EngineerProfile } from '../melos/beats/fx/mastering';
