// Thin client for /api/pod. Auth token comes from the signed-in Firebase user. No secrets live client-side.
import { auth } from '../../services/firebase';

export async function podFetch<T = any>(path: string, init: RequestInit & { json?: unknown; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  const user = auth.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; init = { ...init, body: JSON.stringify(init.json) }; }
  const res = await fetch(`/api/pod${path}`, { ...init, headers });
  if (init.raw) { if (!res.ok) throw new Error(`Request failed (${res.status})`); return res as any; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { code: data?.code, status: res.status });
  return data as T;
}

export const money = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

/** Open a protected file (preview PDFs, export pack) in a new tab via a blob URL, since <a href> cannot send the auth header. */
export async function openPodFile(albumId: string, file: string, download = false) {
  const res: Response = await podFetch(`/preview/${encodeURIComponent(albumId)}/${file}`, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (download) { const a = document.createElement('a'); a.href = url; a.download = file; a.click(); }
  else window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
