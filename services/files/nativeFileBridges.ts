// services/files/nativeFileBridges.ts — Registers native credential vaults & unifies local I/O across Windows, Android, and Web.

import { isWindowsApp, readWindowsFileBytes } from '../windowsBridgeService';
import { registerConnectorSecretBridge } from '../storageConnectors/connectorRegistry';
import {
  deleteWindowsConnectorSecret,
  downloadUrlToWindowsLocal,
  getWindowsConnectorSecret,
  openWindowsExternal,
  saveWindowsConnectorSecret,
} from './windowsExplorerBridge';
import {
  deleteAndroidConnectorSecret,
  downloadUrlToAndroidLocal,
  getAndroidConnectorSecret,
  isAndroidFilesAvailable,
  openAndroidExternal,
  readAndroidPathAsFile,
  saveAndroidConnectorSecret,
} from './androidFilesBridge';
import type { StageMediaItem } from './unifiedVfs';

let vaultWired = false;

export function ensureNativeVaultRegistered(): void {
  if (vaultWired) return;
  vaultWired = true;
  if (isWindowsApp()) {
    registerConnectorSecretBridge({
      saveSecret: (id, user, secret) => saveWindowsConnectorSecret(id, user, secret),
      getSecret: id => getWindowsConnectorSecret(id),
      deleteSecret: id => deleteWindowsConnectorSecret(id),
    });
  } else if (isAndroidFilesAvailable()) {
    registerConnectorSecretBridge({
      saveSecret: (id, _user, secret) => saveAndroidConnectorSecret(id, secret),
      getSecret: id => getAndroidConnectorSecret(id),
      deleteSecret: id => deleteAndroidConnectorSecret(id),
    });
  }
}

export function getActiveLocalPlatform(): 'windows' | 'android' | 'web' {
  if (isWindowsApp()) return 'windows';
  if (isAndroidFilesAvailable()) return 'android';
  return 'web';
}

export async function readStageItemAsFile(item: StageMediaItem): Promise<File> {
  if (isWindowsApp() && item.fullPath) {
    if (item.url) {
      try {
        const res = await fetch(item.url);
        if (res.ok) {
          const blob = await res.blob();
          return new File([blob], item.name, { type: item.mimeType || blob.type || 'application/octet-stream' });
        }
      } catch { /* fallback to bridge bytes */ }
    }
    const bytes = await readWindowsFileBytes(item.fullPath);
    if (!bytes) throw new Error('Unable to read local Windows file');
    return new File([bytes.buffer as ArrayBuffer], item.name, { type: item.mimeType || 'application/octet-stream' });
  }
  if (isAndroidFilesAvailable() && item.fullPath) {
    return readAndroidPathAsFile(item.fullPath, item.name, item.mimeType || 'application/octet-stream');
  }
  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
    const blob = await res.blob();
    return new File([blob], item.name, { type: item.mimeType || blob.type || 'application/octet-stream' });
  }
  throw new Error('No file source available');
}

export async function openItemWithSystemApp(pathOrUrl: string, mimeType?: string): Promise<boolean> {
  if (isWindowsApp()) {
    const r = await openWindowsExternal(pathOrUrl);
    return Boolean(r.success);
  }
  if (isAndroidFilesAvailable()) {
    const r = await openAndroidExternal(pathOrUrl, mimeType);
    return Boolean(r.success);
  }
  if (typeof window !== 'undefined' && pathOrUrl) {
    window.open(pathOrUrl, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}

export async function saveRemoteUrlToLocal(
  url: string,
  targetDir: string,
  fileName: string,
  headers?: Record<string, string>,
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (isWindowsApp()) {
    const sep = targetDir.endsWith('\\') || targetDir.endsWith('/') ? '' : '\\';
    return downloadUrlToWindowsLocal(url, `${targetDir}${sep}${fileName}`, headers);
  }
  if (isAndroidFilesAvailable()) {
    return downloadUrlToAndroidLocal(url, targetDir, fileName, headers);
  }
  return { success: false, error: 'Direct disk download requires Desktop or Android app' };
}
