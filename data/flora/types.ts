// The specimen record — one per organism in the Living Forest.
// Every label the museum renders comes from here, including its credits: a photo
// or model carries its own license so attribution can never drift from the asset.

import type { TreeParams } from '../../components/museion/flora/TreeGrower';

export type Gallery = 'canopy' | 'flowers' | 'herbs' | 'ancient' | 'ocean' | 'fungal';

/** True position on the tree of life — independent of which hall it stands in. */
export type Lineage = 'bryophyte' | 'fern' | 'gymnosperm' | 'angiosperm' | 'algae' | 'fungus';

/** IUCN Red List category, rendered as a label chip when present. */
export type Conservation = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX';

export interface CreditedImage {
  url: string;
  credit: string;
  license: string;
}

export interface BotanicalPlate extends CreditedImage {
  source: string;      // e.g. "Curtis's Botanical Magazine"
  year?: number;
}

export type SpecimenModel =
  | { kind: 'procedural'; params: TreeParams }
  | { kind: 'glb'; url: string; credit: string; license: string; scale?: number };

export interface FloraSpecimen {
  id: string;
  commonName: string;
  /** Binomial — always rendered in italic serif, the museum-label voice. */
  sciName: string;
  family: string;
  genus: string;
  lineage: Lineage;
  gallery: Gallery;
  photos: CreditedImage[];
  plate?: BotanicalPlate;
  model?: SpecimenModel;
  stats: { height?: string; lifespan?: string; range: string };
  conservation?: Conservation;
  /** The museum label. Written for a reader standing in front of it. */
  story: string;
}

export const GALLERY_META: Record<Gallery, { name: string; latin: string; blurb: string; accent: string }> = {
  canopy:  { name: 'The Canopy',       latin: 'Arbores',            blurb: 'Trees — the 3D heart of the wing.',                    accent: '#57c26a' },
  flowers: { name: 'The Flower Court', latin: 'Angiospermae',       blurb: 'The flowering plants, in bloom.',                      accent: '#e0459b' },
  herbs:   { name: 'Herbs & Grasses',  latin: 'Herbae et Gramina',  blurb: 'The useful and the everywhere.',                       accent: '#b8e6a0' },
  ancient: { name: 'The Ancient Line', latin: 'Cryptogamae',        blurb: 'Mosses, ferns and cycads — 400 million years of survivors.', accent: '#e8dcc0' },
  ocean:   { name: 'The Ocean Hall',   latin: 'Algae et Maritima',  blurb: 'Kelp forests, seagrass and mangroves.',                accent: '#7ab8ff' },
  fungal:  { name: 'The Fungal Annex', latin: 'Fungi',              blurb: 'Their own kingdom — joined to every tree by the mycorrhizal web.', accent: '#d97a50' },
};

export const LINEAGE_LABEL: Record<Lineage, string> = {
  bryophyte: 'Bryophyte — mosses & liverworts',
  fern: 'Pteridophyte — ferns & horsetails',
  gymnosperm: 'Gymnosperm — conifers & cycads',
  angiosperm: 'Angiosperm — flowering plants',
  algae: 'Algae — non-vascular photosynthesisers',
  fungus: 'Fungus — a separate kingdom entirely',
};

export const CONSERVATION_LABEL: Record<Conservation, string> = {
  LC: 'Least Concern', NT: 'Near Threatened', VU: 'Vulnerable',
  EN: 'Endangered', CR: 'Critically Endangered',
  EW: 'Extinct in the Wild', EX: 'Extinct',
};
