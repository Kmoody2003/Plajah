// mediaEngine/capabilities.ts — host detection → which source kinds are available.
//
// The same React UI runs in a browser tab, a Tauri desktop app, and a Capacitor
// Android app. A browser tab CANNOT touch DeckLink / NDI / SRT / RTMP / BRAW — those
// need native code — so it exposes only WebRTC, webcam (UVC via getUserMedia) and file.
// Native builds announce their real capabilities via an injected bridge; until that
// bridge exists we detect the host and gate the UI honestly.

import { Capabilities, SourceKind } from './types';

function detectPlatform(): Capabilities['platform'] {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/win/.test(ua)) return 'windows';
  if (/mac/.test(ua)) return 'macos';
  if (/linux/.test(ua)) return 'linux';
  return 'unknown';
}

function hasWebGPU(): boolean {
  try { return typeof navigator !== 'undefined' && 'gpu' in navigator; } catch { return false; }
}

/**
 * Resolve capabilities. A native host may inject `window.__plajahMediaEngine` with a
 * real capability report; otherwise we fall back to browser-only.
 */
export function detectCapabilities(): Capabilities {
  const platform = detectPlatform();
  const webgpu = hasWebGPU();

  // Native bridge (Tauri/Capacitor) can override with its true capabilities.
  const bridge = (typeof window !== 'undefined' && (window as any).__plajahMediaEngine) || null;
  if (bridge?.capabilities) {
    return { ...bridge.capabilities, webgpu: bridge.capabilities.webgpu ?? webgpu };
  }

  const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
  const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

  if (isTauri) {
    // Desktop native: DeckLink/NDI/SRT/RTMP/BRAW available on Win/macOS/Linux.
    const desktop = platform === 'windows' || platform === 'macos' || platform === 'linux';
    return {
      host: 'tauri', platform, webgpu,
      hardwareGenlock: desktop, ndi: true, brawDecode: desktop,
      sources: { decklink: desktop, ndi: true, srt: true, rtmp: true, webrtc: true, uvc: true, file: true, braw: desktop },
    };
  }

  if (isCapacitor) {
    // Android native: NDI + camera + WebRTC + SRT; no DeckLink/BRAW.
    return {
      host: 'capacitor', platform, webgpu,
      hardwareGenlock: false, ndi: true, brawDecode: false,
      sources: { decklink: false, ndi: true, srt: true, rtmp: true, webrtc: true, uvc: true, file: true, braw: false },
    };
  }

  // Browser tab — WebRTC/WHEP + local webcam + file only.
  const browserSources: Record<SourceKind, boolean> = {
    decklink: false, ndi: false, srt: false, rtmp: false,
    webrtc: true, uvc: true, file: true, braw: false,
  };
  return {
    host: 'browser', platform, webgpu,
    hardwareGenlock: false, ndi: false, brawDecode: false,
    sources: browserSources,
  };
}

/** Human explanation for why a source kind is unavailable in this host. */
export function unavailableReason(kind: SourceKind, caps: Capabilities): string | null {
  if (caps.sources[kind]) return null;
  if (caps.host === 'browser') {
    if (kind === 'decklink' || kind === 'braw') return 'Requires the desktop app (capture card / RAW decode is native).';
    return 'Requires the desktop or Android app — a browser tab can only take webcams and WebRTC guests.';
  }
  if (kind === 'decklink') return 'Capture cards need a desktop (PCIe/Thunderbolt).';
  if (kind === 'braw') return 'Blackmagic RAW decode is desktop-only; mobile edits against proxies.';
  return 'Not available on this device.';
}
