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
