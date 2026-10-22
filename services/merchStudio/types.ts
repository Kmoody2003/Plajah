// services/merchStudio/types.ts — the Merch Designer document (Tela's merch workflow).
//
// One project = one product: what it is (a built-in template or an imported / sculpted 3D model),
// the artwork printed on it, the photo stage it's shot on, and the shots taken so far. Heavy binaries
// (uploaded art, model files, rendered shots) live in IndexedDB as assets and are referenced by id,
// so the JSON stays small enough to autosave and sync to the creative cloud on every edit.

export const MERCH_PROJECT_SCHEMA = 'plajah.merchProject' as const;

export type MerchAspect = '1:1' | '4:5' | '3:4' | '16:9' | '9:16';

export const MERCH_ASPECTS: Record<MerchAspect, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
};

/** A file the project owns. The blob is in IndexedDB; `remoteUrl` is set once it has been uploaded. */
export interface MerchAsset {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  remoteUrl?: string;
}

/** One layer of artwork inside a print area. Positions are fractions of the print area (0..1, centre). */
export interface MerchArtLayer {
  id: string;
  kind: 'image' | 'text';
  /** image: an asset id ("asset:<id>") or a URL. */
  src?: string;
  text?: string;
  font?: string;
  weight?: number;
  color?: string;
  x: number;
  y: number;
  /** Width as a fraction of the print area width. */
  scale: number;
  /** Degrees. */
  rotation: number;
  opacity: number;
}

/** Where the artwork lands on an imported/sculpted model (a projected decal), in the model's normalized space. */
export interface MerchDecalPlacement {
  meshIndex: number;
  point: [number, number, number];
  normal: [number, number, number];
  /** World units (the model is normalized to ~1 unit tall). */
  size: number;
  rotation: number;
}

export type MerchProductRef =
  | { kind: 'template'; templateId: string }
  | { kind: 'model'; assetId: string; name: string; source: 'import' | 'sculpt'; decal?: MerchDecalPlacement };

export interface MerchCameraSetup {
  /** Degrees around the product (0 = front). */
  yaw: number;
  /** Degrees above the horizon. */
  pitch: number;
  /** Multiple of the framing distance (1 = product fills the frame comfortably). */
  distance: number;
  fov: number;
}

export interface MerchShotSetup {
  sceneId: string;
  aspect: MerchAspect;
  camera: MerchCameraSetup;
  /** Multiplies every light in the scene template. */
  lightScale: number;
  /** Degrees added to the key light's angle. */
  keyYaw: number;
  exposure: number;
  props: boolean;
}

export interface MerchShot {
  id: string;
  assetId: string;
  kind: 'render' | 'generated';
  sceneId: string;
  aspect: MerchAspect;
  width: number;
  height: number;
  createdAt: number;
  prompt?: string;
  engine?: string;
  seed?: number;
  /** Set once uploaded for a shop listing. */
  remoteUrl?: string;
}

export interface MerchListing {
  title: string;
  description: string;
  price: number;
  /** storeProducts id once published. */
  productId?: string;
  publishedAt?: number;
}

export interface MerchProject {
  schema: typeof MERCH_PROJECT_SCHEMA;
  version: 1;
  id: string;
  title: string;
  product: MerchProductRef;
  /** Garment / body colour of the product. */
  productColor: string;
  /** Artwork per print area id ("front", "back", "wrap", or "decal" for models). */
  designs: Record<string, MerchArtLayer[]>;
  setup: MerchShotSetup;
  shots: MerchShot[];
  assets: Record<string, MerchAsset>;
  coverShotId?: string;
  listing?: MerchListing;
  createdAt: number;
  updatedAt: number;
}

export interface MerchProjectSummary {
  id: string;
  title: string;
  productLabel: string;
  shotCount: number;
  coverAssetId?: string;
  updatedAt: number;
  inCloudOnly?: boolean;
}

export const newMerchId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
