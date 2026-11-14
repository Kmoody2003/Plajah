// Lab stand-in for services/backendService: the account's Worlds and video docs come from the lab API's
// in-memory store, the same one the real /api/reello router writes into.
export { auth } from '../reello-upload/firebaseShim';
export async function fetchUserWorlds() { const r = await fetch('/lab/worlds'); return r.ok ? r.json() : []; }
export async function fetchVideoById(id: string) { const r = await fetch(`/lab/videos/${id}`); return r.ok ? r.json() : null; }
