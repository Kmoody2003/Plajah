/** Mathematical collection: bounded GPU geometry, one 24-second base cycle. */
export const FLUX_MATH_CYCLE = 24;
export const FLUX_MATH_SCENES = [
  { id: 'math-torus-knot', name: 'Neon Knot', line: 'A (3,5) torus knot braided into luminous filaments. Bass inflates the braid; mids twist its strands.' },
  { id: 'math-hopf', name: 'Hopf Halo', line: 'Linked Hopf fibres projected from four dimensions. Bass opens the halo; vocals tilt its woven circles.' },
  { id: 'math-clifford', name: 'Clifford Dream', line: 'A rotating four-dimensional Clifford torus in stereographic projection. Mids fold space; kicks pulse the weave.' },
  { id: 'math-superformula', name: 'Superformula Bloom', line: 'Gielis superformula petals breathe into a crystalline flower. Bass opens the lobes; treble lights their seams.' },
  { id: 'math-klein', name: 'Klein Mirage', line: 'A figure-eight Klein bottle flows through itself. Voices twist its neck; bass swells the impossible surface.' },
  { id: 'math-mobius', name: 'Möbius Ribbon', line: 'A one-sided ribbon wrapped in luminous interference. Mids fold the ribbon; kicks send waves through it.' },
  { id: 'math-enneper', name: 'Enneper Portal', line: 'An Enneper minimal surface unfurls into a saddle portal. Bass bends its wings; treble traces its filigree.' },
  { id: 'math-harmonic', name: 'Harmonic Chrysalis', line: 'A spherical Fourier sculpture blossoms into a many-lobed chrysalis. Voices lift the lobes; highs illuminate the ridges.' },
  { id: 'math-rose', name: 'Rhodonea Nebula', line: 'Nested seven-petal rose curves form a floating cosmic mandala. Bass expands the petals; mids separate their layers.' },
  { id: 'math-hypotrochoid', name: 'Hypnotic Spirograph', line: 'Rolling-circle hypotrochoids weave a three-dimensional spirograph. Mids reshape the loops; kicks lift their threads.' },
  { id: 'math-chladni', name: 'Chladni Cathedral', line: 'Standing-wave interference forms luminous nodal lace. Bass raises the sheet; mids blend resonant modes.' },
  { id: 'math-domain-warp', name: 'Recursive Silk', line: 'Nested multiscale domain warping folds a silk-like spectral field. Bass deepens the folds; vocals steer its currents.' },
] as const;
export type FluxMathSceneId = typeof FLUX_MATH_SCENES[number]['id'];
