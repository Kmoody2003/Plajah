/**
 * Cross-app openers for the Language Arts stack: open a classic in the Lorea reader, or jump to a
 * specific shelf of the Chora Vault. They go through window events (the same pattern as
 * OPEN_LABS_DISCIPLINE) so any component can call them without prop-drilling through App.
 */
import type { Album } from '../types';
import { freeEpubAlbum } from './freeEpub';

export interface ClassicRef { id: string; title: string; authors?: string[]; cover?: string; desc?: string }

/** Build the Lorea album for a Project Gutenberg classic (null if the source is not a free EPUB host). */
export function classicAlbum(b: ClassicRef): Album | null {
  return freeEpubAlbum({
    id: b.id, title: b.title, authors: b.authors, desc: b.desc, cover: b.cover,
    url: `https://www.gutenberg.org/ebooks/${b.id}`, free: true,
  });
}

/** Open a classic in the Lorea reader (full-screen, with notes, highlights and read-aloud). */
export function openClassicInLorea(b: ClassicRef): boolean {
  const album = classicAlbum(b);
  if (!album) return false;
  try { window.dispatchEvent(new CustomEvent('OPEN_LOREA_BOOK', { detail: { album } })); return true; } catch { return false; }
}

const PRESET_KEY = 'plajah:vaultPreset';
export interface VaultPreset { kind: string; sub?: string | null }

/** Jump to a Chora Vault shelf, e.g. ('SPEECH', 'addresses') or ('AUDIOBOOK', 'fiction'). */
export function openVault(kind: string, sub?: string | null): void {
  try { sessionStorage.setItem(PRESET_KEY, JSON.stringify({ kind, sub: sub ?? null } as VaultPreset)); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent('OPEN_CHORA_VAULT', { detail: { kind, sub } })); } catch { /* non-browser */ }
}

/** Read-and-clear the pending Vault preset (called once by MusicView when it mounts). */
export function takeVaultPreset(): VaultPreset | null {
  try {
    const raw = sessionStorage.getItem(PRESET_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PRESET_KEY);
    return JSON.parse(raw) as VaultPreset;
  } catch { return null; }
}
