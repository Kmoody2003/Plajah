/**
 * Local (on-device) notifications.
 *
 * Product rule: updates, "what's new" and explainers must never take over the screen. They sit in
 * the notification list instead, where the person opens them when they want to. Server
 * notifications live in Firestore (`notifications`); these are the ones that originate in the
 * client — a new build waiting, a tour offer — so they are kept in localStorage and merged into
 * the same list by NotificationContext.
 */
import type { AppNotification } from '../types';

const KEY = 'pj:local-notifs:v1';
const MAX = 30;

type Listener = () => void;
const listeners = new Set<Listener>();

interface StoredNotif { id: string; title: string; message: string; link?: string; isRead: boolean; timestamp: number }

const read = (): StoredNotif[] => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const write = (items: StoredNotif[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX))); } catch { /* private mode / full */ }
  listeners.forEach(l => l());
};

/** Add (or refresh) a local notice. Same id replaces the earlier one, so a repeat never stacks. */
export function addLocalNotification(n: { id: string; title: string; message: string; link?: string }): void {
  const items = read().filter(i => i.id !== n.id);
  write([{ ...n, isRead: false, timestamp: Date.now() }, ...items]);
}

export const hasLocalNotification = (id: string): boolean => read().some(i => i.id === id);

export function markLocalNotificationRead(id: string): void {
  write(read().map(i => (i.id === id ? { ...i, isRead: true } : i)));
}
export function removeLocalNotification(id: string): void { write(read().filter(i => i.id !== id)); }
export function clearLocalNotifications(): void { write([]); }

export const isLocalNotificationId = (id: string): boolean => id.startsWith('local:');

/** Local notices shaped like server ones, ids prefixed so the two can never collide. */
export function getLocalNotifications(uid: string | null): AppNotification[] {
  return read().map(i => ({
    id: `local:${i.id}`,
    userId: uid || '',
    senderId: 'plajah',
    senderName: 'Plajah',
    senderPhoto: '',
    type: 'SYSTEM' as const,
    title: i.title,
    message: i.message,
    link: i.link,
    isRead: i.isRead,
    timestamp: i.timestamp,
  }));
}

export function subscribeLocalNotifications(l: Listener): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) l(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
}

/** Set by index.tsx when a new service-worker build is waiting; the notification's tap calls it. */
export const applyPendingUpdate = (): boolean => {
  const fn = (window as any).__plajahApplyUpdate as (() => void) | undefined;
  if (!fn) return false;
  fn();
  return true;
};
