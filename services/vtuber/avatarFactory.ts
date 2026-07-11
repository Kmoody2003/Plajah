// avatarFactory.ts — "upload a character sheet → get a VTuber". Turns a single drawing (or a
// multi-view reference sheet) into a drivable avatar the realtime engine can use. Two output paths:
//   • PUPPET2D — instant, fully local, Live2D-style 2D rig (works from any single drawing)
//   • VRM      — 3D, generated via open-source image-to-3D + auto-rig (heavier, WebGPU/server)
// Avatar CREATION is the one-time bake here; avatar DRIVING is the local realtime engine
// (services/vtuber/vtuberEngine.ts). Both descriptors are driven by the SAME MediaPipe tracker +
// retargeter — only the render path differs (three-vrm rig vs. 2D-puppet warp).
//
// Status: the seam + types are final; the segmentation / rigging / 3D-generation stages are wired
// incrementally (character-sheet Phase A = 2D puppet, Phase B = 3D VRM). Until a stage lands it
// throws VTuberFactoryError so callers branch cleanly instead of getting a broken avatar.

// ── A 2D live-puppet rig (Path A output) ─────────────────────────────────────────
export interface Puppet2DLayer {
  id: string;                                  // 'eyeL' | 'eyeR' | 'mouth' | 'head' | 'hair' | …
  role: 'eye' | 'brow' | 'mouth' | 'head' | 'hair' | 'body' | 'arm' | 'bg';
  bbox: { x: number; y: number; w: number; h: number };
  anchor: { x: number; y: number };            // pivot for rotation / parallax
  image?: ImageBitmap;                          // the cut-out layer pixels
  states?: Record<string, ImageBitmap>;         // eye:{open,closed}; mouth:{aa,ih,ou,ee,oh}
}
export interface Puppet2DRig {
  width: number;
  height: number;
  layers: Puppet2DLayer[];
  /** Chatterbox sprites: fraction of the height where the jaw hinge sits (default 0.62). */
  jawSplit?: number;
  meshBindings?: unknown;                       // triangulation + landmark bindings (Phase A detail)
}

// ── The descriptor the realtime engine consumes ──────────────────────────────────
export type AvatarDescriptor =
  | { kind: 'VRM'; url: string; source: 'upload' | 'generated' }
  | { kind: 'PUPPET2D'; rig: Puppet2DRig };

export type AvatarPath = 'AUTO' | 'PUPPET2D' | 'VRM3D';
export interface BuildAvatarOptions {
  path?: AvatarPath;                            // AUTO = puppet now, 3D when available
  views?: Blob[];                               // extra views (front/side/back) for multi-view 3D
  compute?: 'local' | 'server' | 'auto';        // where the 3D generation runs
  onProgress?: (stage: string, pct: number) => void;
  signal?: AbortSignal;
}

export class VTuberFactoryError extends Error {
  constructor(message: string) { super(message); this.name = 'VTuberFactoryError'; }
}

/**
 * Build a drivable avatar from a character sheet. Resolves to an AvatarDescriptor the engine drives.
 * AUTO/PUPPET2D → 2D live-puppet (local); VRM3D → image-to-3D generation.
 */
export async function buildVTuberFromSheet(image: Blob, opts: BuildAvatarOptions = {}): Promise<AvatarDescriptor> {
  const path = opts.path ?? 'AUTO';
  opts.onProgress?.('preprocess', 0.05);
  // Stage 0 — preprocess: background removal + orientation-normalize. Reuses the MediaPipe
  // ImageSegmenter pattern already proven in matteEngine (Phase A).
  if (path === 'VRM3D') return buildVrmFromSheet(image, opts);
  return buildPuppet2D(image, opts);
}

async function buildPuppet2D(image: Blob, opts: BuildAvatarOptions): Promise<AvatarDescriptor> {
  opts.onProgress?.('segment', 0.2);
  // Phase A (shipped): MediaPipe FaceLandmarker locates eyes+mouth → cut movable layers + patch
  // the base → Puppet2DRig, driven live by the same tracker/retargeter. (Body-part segmentation
  // via SAM + a triangulated deformation mesh are the fidelity upgrade.)
  const { buildPuppet2DRig } = await import('./puppet2D');
  const rig = await buildPuppet2DRig(image, opts.onProgress);
  return { kind: 'PUPPET2D', rig };
}

async function buildVrmFromSheet(_image: Blob, opts: BuildAvatarOptions): Promise<AvatarDescriptor> {
  opts.onProgress?.('generate-3d', 0.3);
  // Phase B: CharacterGen / TripoSR / InstantMesh (WebGPU-if-available else server endpoint) →
  // auto-rig to humanoid → auto-blendshapes → export VRM → upload → { kind:'VRM', url, source:'generated' }.
  throw new VTuberFactoryError('3D VRM generation lands in character-sheet Phase B.');
}
