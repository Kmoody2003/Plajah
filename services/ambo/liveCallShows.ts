import type { Show } from './showModel';
const key = (userId: string) => `plajah:ambo:pending-call-shows:${userId}`;
const pending = new Map<string, Map<string, Show>>();
export function pendingCallShows(userId: string): Show[] {
  if (!pending.has(userId)) {
    let saved: Show[] = [];
    try { const parsed = JSON.parse(sessionStorage.getItem(key(userId)) || '[]'); saved = Array.isArray(parsed) ? parsed : []; } catch { /* session storage is optional */ }
    pending.set(userId, new Map(saved.filter(show => show?.id?.startsWith('chat_show_') && Array.isArray(show.slides)).map(show => [show.id, show])));
  }
  return [...pending.get(userId)!.values()];
}
function persist(userId: string) {
  try { sessionStorage.setItem(key(userId), JSON.stringify(pendingCallShows(userId))); } catch { /* in-memory queue remains */ }
}
export function queueCallShow(userId: string, show: Show): void {
  pendingCallShows(userId);
  pending.get(userId)!.set(show.id, show); persist(userId);
  window.dispatchEvent(new CustomEvent('ambo:import-live-show', { detail: show }));
}
export function acknowledgeCallShow(userId: string, showId: string): void {
  pendingCallShows(userId); pending.get(userId)!.delete(showId); persist(userId);
}
