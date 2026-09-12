// ─── Native Compose shell bridge ──────────────────────────────────────────────
// Thin typed wrapper over the PlajahShell Capacitor plugin (PlajahShellPlugin.kt),
// which hands off from THIS web (Capacitor WebView) shell to the native Jetpack
// Compose shell — the parallel "Native" front-end the user can toggle into. The
// reverse (native → web) is handled entirely on the native side.
//
// Everything here is a no-op unless we are the native Android shell (so: not the
// web app, not iOS, not a leanback TV — the native Compose shell targets Android
// phones / tablets / the new Android laptops, and TV keeps the web leanback UI).
//
// See docs/ANDROID_NATIVE_REBUILD.md for the full architecture.

import { registerPlugin, Capacitor } from '@capacitor/core';

interface PlajahShellPluginShape {
  /** Persist the Native flag and relaunch into NativeActivity. Resolves before the swap. */
  switchToNative(): Promise<void>;
  /** Current mode, so a settings row can reflect state. */
  isNativeEnabled(): Promise<{ enabled: boolean }>;
}

const PlajahShell = registerPlugin<PlajahShellPluginShape>('PlajahShell');

/**
 * True only where the native Compose shell exists to switch INTO: the native
 * Android app, on a non-TV device. Cheap enough to call inline in render.
 * (TV is excluded because the native shell deliberately never redirects a TV —
 * MainActivity keeps the D-pad-tuned web leanback UI.)
 */
export function nativeShellAvailable(): boolean {
  try {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) return false;
    // The native TV app tags its WebView UA (see usePlatform / MainActivity).
    if (navigator.userAgent.toLowerCase().includes('plajahtv/1')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Hand off to the native Compose shell. No-op (resolves false) where unavailable. */
export async function switchToNativeShell(): Promise<boolean> {
  if (!nativeShellAvailable()) return false;
  try {
    await PlajahShell.switchToNative();
    return true;
  } catch (e) {
    console.warn('[nativeShell] switchToNative failed', e);
    return false;
  }
}

/** Whether the app is currently set to launch into Native (the flag NativeActivity reads). */
export async function isNativeShellEnabled(): Promise<boolean> {
  if (!nativeShellAvailable()) return false;
  try {
    return (await PlajahShell.isNativeEnabled()).enabled;
  } catch {
    return false;
  }
}
