import { auth, uploadFile } from './backendService';

export type SpatialProjectStatus = 'DRAFT' | 'DEPTH_READY' | 'SEGMENTED' | 'SPLAT_READY';
export interface SpatialPhotoProject {
  id: string; ownerId: string; photoId: string; sourceUrl: string; title: string;
  status: SpatialProjectStatus; createdAt: number; updatedAt: number;
  segmentation?: { maskDataUrl?: string; confidence: number; engine: string };
  depth?: { layers: number; strength: number; engine: string };
  splat?: { url: string; fileName: string; bytes: number; format: 'splat' | 'ply' };
}

const key = (uid: string) => `plajah:spatial-photo-projects:${uid}`;
export function loadSpatialProjects(uid: string): SpatialPhotoProject[] {
  try { return JSON.parse(localStorage.getItem(key(uid)) || '[]'); } catch { return []; }
}
export function saveSpatialProject(project: SpatialPhotoProject): SpatialPhotoProject {
  const rows = loadSpatialProjects(project.ownerId);
  const next = [{ ...project, updatedAt: Date.now() }, ...rows.filter(row => row.id !== project.id)].slice(0, 100);
  localStorage.setItem(key(project.ownerId), JSON.stringify(next));
  return next[0];
}
export function newSpatialProject(photoId: string, sourceUrl: string, title: string): SpatialPhotoProject {
  const ownerId = auth.currentUser?.uid || 'local'; const now = Date.now();
  return { id: `spatial_${photoId}_${now}`, ownerId, photoId, sourceUrl, title, status: 'DRAFT', createdAt: now, updatedAt: now };
}
export async function uploadSpatialSplat(project: SpatialPhotoProject, file: File, onProgress?: (value: number) => void) {
  const ext = file.name.toLowerCase().endsWith('.ply') ? 'ply' : 'splat';
  const url = await uploadFile(`users/${project.ownerId}/spatial/${project.id}/scene.${ext}`, file, onProgress);
  return saveSpatialProject({ ...project, status: 'SPLAT_READY', splat: { url, fileName: file.name, bytes: file.size, format: ext } });
}
export function reconstructionManifest(project: SpatialPhotoProject, captureFiles: File[]) {
  return {
    schema: 'plajah.spatial.reconstruction/v1', projectId: project.id, ownerId: project.ownerId,
    sourcePhotoId: project.photoId, requestedOutput: ['splat', 'ply'], solver: 'gaussian-splatting',
    capture: { imageCount: captureFiles.length, files: captureFiles.map(file => ({ name: file.name, bytes: file.size, type: file.type })) },
    quality: { removeFloaters: true, optimizeForXR: true, targetFps: 72 }, createdAt: new Date().toISOString(),
  };
}
