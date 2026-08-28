// The Ancient Line — the lineages that were here before flowers existed.
// Ferns, mosses, cycads and the desert aloes that look like trees but are not.
//
// This gallery is where the wing's REAL models live: photoscanned CC0 specimens
// from Poly Haven, standing beside procedural trees. The specimen record takes
// either, so a gallery can mix them freely.

import type { FloraSpecimen } from './types';

const ancient: FloraSpecimen[] = [
  {
    id: 'aloidendron-dichotomum',
    commonName: 'Quiver Tree',
    sciName: 'Aloidendron dichotomum',
    family: 'Asphodelaceae', genus: 'Aloidendron',
    lineage: 'angiosperm', gallery: 'ancient',
    photos: [],
    model: {
      kind: 'glb',
      url: '/models/flora/quiver_tree_01.glb',
      credit: 'James Ray Cock, Dario Barresi, Rico Cilliers — Poly Haven',
      license: 'CC0',
      scale: 6.5,
    },
    stats: { height: '3–9 m', lifespan: '~80–400 years', range: 'Namibia and the Northern Cape' },
    conservation: 'VU',
    story:
      'Not a tree at all — an aloe that grew tall enough to act like one. The name comes from the San, who hollowed the soft, fibrous branches to make quivers for their arrows. Its trunk is covered in a powdery white bloom that reflects the desert sun, and it sheds whole limbs to cut its own water demand in a drought. Populations at the hot northern edge of its range are dying faster than seedlings replace them — a species visibly walking south ahead of a warming climate.',
  },
  {
    id: 'dryopteris-filix-mas',
    commonName: 'Male Fern',
    sciName: 'Dryopteris filix-mas',
    family: 'Dryopteridaceae', genus: 'Dryopteris',
    lineage: 'fern', gallery: 'ancient',
    photos: [],
    model: {
      kind: 'glb',
      url: '/models/flora/fern_02.glb',
      credit: 'Rob Tuytel, Rico Cilliers — Poly Haven',
      license: 'CC0',
      scale: 1.1,
    },
    stats: { height: '0.6–1.5 m', lifespan: 'Perennial, decades', range: 'Europe, Asia, North America' },
    conservation: 'LC',
    story:
      'Ferns solved height before flowers existed and have barely changed since. There is no bloom here and no seed — a fern releases spores from the rows of brown capsules on the underside of each frond, and the plant those spores grow into is not another fern but a tiny, separate, heart-shaped organism that produces the egg and sperm. The fern you are looking at is only half of the life cycle. Its young fronds uncurl from a tight spiral called a fiddlehead, a shape that turns up in architecture and violin scrolls for the same reason it works here: it is the most compact way to store something long.',
  },
];

export default ancient;
