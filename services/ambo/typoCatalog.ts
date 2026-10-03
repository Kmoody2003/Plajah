// typoCatalog — light, three.js-free list of Chora's kinetic-typography
// volumes so Ambo's visualizer library/pickers can list them without pulling
// the engine into the bundle. Keys match components/chora/typo/typoVolumes.ts;
// a GENERATOR layer uses `TYPO:<key>` (see TYPO_PREFIX in layerSources).

export const TYPO_CATALOG: { key: string; name: string }[] = [
  { key: 'SPHERE', name: 'Obsidian & Neon' },
  { key: 'CUBIC_GLASS', name: 'Glass Lattice' },
  { key: 'SUNBURST', name: 'Constructivist Sun' },
  { key: 'DNA_HELIX', name: 'Lyric Helix' },
  { key: 'TOPOGRAPHY', name: 'Contour Field' },
  { key: 'GEAR', name: 'Type Gear' },
  { key: 'VORTEX', name: 'Chaos Drain' },
  { key: 'SKYLINE', name: 'Letter Metropolis' },
  { key: 'BUTTERFLY', name: 'Word Wings' },
  { key: 'OCEAN_WAVES', name: 'Tide Lines' },
  { key: 'SHATTER', name: 'Bauhaus Shatter' },
  { key: 'MAZE', name: 'Letter Maze' },
];
