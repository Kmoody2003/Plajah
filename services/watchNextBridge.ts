// ─── Android TV "Watch Next" home-row bridge ──────────────────────────────────
// Thin typed wrapper over the native WatchNext Capacitor plugin (WatchNextPlugin.kt),
// which writes Plajah's continue-watching titles into the Android TV / Google TV
// home-screen row — the same system row YouTube populates.
//
// Everything here is a no-op unless we are the native Android shell AND the device
// is a leanback TV with a Watch Next provider (so: not the web app, not a phone,
// not Fire TV — Amazon ignores this row). The gate is cached so the hot path
// (recordProgress fires every ~5s of playback) costs one boolean after the first call.

import { registerPlugin, Capacitor } from '@capacitor/core';

/** One home-row tile. */
export interface WatchNextItem {
  id: string;               // stable content id (the videoId / film id)
  title: string;
  contentType: 'CLIP' | 'MOVIE' | 'TV_EPISODE';
  deepLink: string;         // https://plajah.com/?id=…&type=… — routes back to the player
  positionSec?: number;
  durationSec?: number;
  posterUri?: string;
  description?: string;
  updatedAt?: number;       // for a bulk reconcile; defaults to "now" natively
  /** Poster shape — Taleo posters are portrait, Reello thumbnails are 16:9. */
  aspect?: 'MOVIE_POSTER' | 'ASPECT_16_9';
}

interface WatchNextPluginShape {
  isSupported(): Promise<{ supported: boolean }>;
  upsert(opts: { items: WatchNextItem[] }): Promise<{ written: number; skipped?: string }>;
  remove(opts: { ids: string[] }): Promise<{ removed: number; skipped?: string }>;
}

const WatchNext = registerPlugin<WatchNextPluginShape>('WatchNext');

let supportedCache: boolean | null = null;

/** Resolves true only where the native row exists; cached after the first probe. */
export async function watchNextSupported(): Promise<boolean> {
  if (supportedCache !== null) return supportedCache;
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) {
    supportedCache = false;
    return false;
  }
  try {
    supportedCache = (await WatchNext.isSupported()).supported;
  } catch {
    supportedCache = false;
  }
  return supportedCache;
}

export async function upsertWatchNext(items: WatchNextItem[]): Promise<void> {
  if (!items.length || !(await watchNextSupported())) return;
  try { await WatchNext.upsert({ items }); } catch { /* home-row write must never surface */ }
}

export async function removeWatchNext(ids: string[]): Promise<void> {
  if (!ids.length || !(await watchNextSupported())) return;
  try { await WatchNext.remove({ ids }); } catch { /* non-fatal */ }
}
