// emoteShelf — per-device recents + favourites (localStorage), shared by the tray and the picker.

import { useEffect, useState } from 'react';
import { pushRecent } from './emoteEngine';

const RECENT_KEY = 'plajah.emotes.recent', FAV_KEY = 'plajah.emotes.fav';
const read = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const recentSubs = new Set<() => void>();
export function rememberRecent(id: string) { write(RECENT_KEY, pushRecent(read(RECENT_KEY), id)); recentSubs.forEach(f => f()); }
export function toggleFavorite(id: string) {
  const f = read(FAV_KEY);
  write(FAV_KEY, f.includes(id) ? f.filter(x => x !== id) : [id, ...f].slice(0, 24));
  recentSubs.forEach(fn => fn());
}
export function useEmoteShelf() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump(x => x + 1); recentSubs.add(f); return () => { recentSubs.delete(f); }; }, []);
  return { recent: read(RECENT_KEY), favorites: read(FAV_KEY) };
}
