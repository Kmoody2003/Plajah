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

export async function uploadImageWithDerivatives() { return { display: 'https://example.com/thumb.jpg' }; }
export async function notifyFollowers() { /* lab */ }
