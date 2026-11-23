// Plajah Sky — shared sky effects for every game: real-time volumetric clouds, aurora curtains, the cloud noise.
// Rift Realm's Elderwood Wilds drives them from its day cycle and weather (games/rift-realm/src/world/skyCycle.ts).
export { volumetricClouds, type CloudLayer } from './clouds';
export { auroraCurtains, AURORA_PALETTES, type AuroraLayer } from './aurora';
export { cloudNoise } from './noise3d';
