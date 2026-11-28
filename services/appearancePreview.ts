/**
 * Live preview for Settings → Appearance. Every control writes its value here the moment it
 * changes, App.tsx lays it over the saved profile, and the whole platform re-themes in real time.
 * Saving only persists what is already on screen; leaving Settings clears the preview.
 */
import { useSyncExternalStore } from 'react';
import type { UserProfile } from '../types';

let patch: Partial<UserProfile> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function previewProfile(next: Partial<UserProfile>) { patch = { ...(patch ?? {}), ...next }; emit(); }
export function clearProfilePreview() { if (patch) { patch = null; emit(); } }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const get = () => patch;
export const useProfilePreview = () => useSyncExternalStore(subscribe, get, get);
