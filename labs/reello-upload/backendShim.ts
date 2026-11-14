// Lab stand-in for services/backendService: uploads "move" at a believable pace and land as video docs
// in the lab API's in-memory store (POST /lab/videos), so Story Intelligence can then be asked for them.
export { auth } from './firebaseShim';

export async function uploadVideo(v: any, onProgress?: (p: number) => void) {
  const steps = 12;
  for (let i = 1; i <= steps; i++) { await new Promise(r => setTimeout(r, 180)); onProgress?.((i / steps) * 100); }
  const id = `vid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const doc = { id, ownerId: 'lab-user', title: v.title, description: v.description || '', genre: v.genre, tags: v.tags || [], isRello: true, isPrivate: !!v.isPrivate, muxPlaybackId: 'LABPID', duration: 240 };
  await fetch('/lab/videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  return doc;
}

export async function updateVideoSettings(id: string, s: any) {
  await fetch(`/lab/videos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
}

export async function fetchVideoById(id: string) { const r = await fetch(`/lab/videos/${id}`); return r.ok ? r.json() : null; }
export async function uploadImageWithDerivatives() { return { display: 'https://example.com/thumb.jpg' }; }
export async function notifyFollowers() { /* lab */ }

// Playlists (in memory) for the upload form's Playlists picker.
const labPlaylists: any[] = [
  { id: 'pl_sermons', ownerId: 'lab-user', title: 'Sunday Sermons', isPublic: true, videoIds: [], timestamp: Date.now() - 5e6 },
  { id: 'pl_bts', ownerId: 'lab-user', title: 'Behind the scenes', isPublic: false, isPrivate: true, videoIds: [], timestamp: Date.now() - 9e6 },
];
(window as any).__labPlaylists = labPlaylists;
export async function fetchUserVideoPlaylists() { return labPlaylists.map(p => ({ ...p })); }
export async function createVideoPlaylist(p: any) { const pl = { ...p, id: `pl_${Date.now().toString(36)}`, ownerId: 'lab-user', timestamp: Date.now() }; labPlaylists.unshift(pl); return pl; }
export async function removeVideoFromPlaylist(id: string, vid: string) { const p = labPlaylists.find(x => x.id === id); if (p) p.videoIds = p.videoIds.filter((x: string) => x !== vid); }
export async function addVideoToPlaylist(id: string, video: any) { const p = labPlaylists.find(x => x.id === id); const vid = typeof video === 'string' ? video : video.id; if (p && !p.videoIds.includes(vid)) p.videoIds.push(vid); }
