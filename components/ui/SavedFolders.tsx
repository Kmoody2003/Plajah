import React, { useEffect, useState } from 'react';
import { FolderOpen, ChevronDown, Trash2, Monitor, Globe } from 'lucide-react';
import { useContextMenu } from './ContextMenu';
import {
  savedFolders, onFoldersChanged, removeFolder, folderHandle, touchFolder, getFolder,
  type SavedFolder,
} from '../../services/folderRegistry';
import { ensurePermission, type DirEntryLike, type FolderPermission } from '../../services/ambo/mediaFolders';
import { isWindowsApp } from '../../services/windowsBridgeService';

/**
 * Saved folders — the shared "folders you've added anywhere" picker every file viewer shows
 * (Pixels, TV Studio, Melos, Photos, My Library, Fabula …). The list itself is
 * services/folderRegistry; this file is only the UI + the restore helpers viewers share.
 */

/** Folders this runtime can actually open: Windows paths need the Windows app; handles need the File System Access API. */
export function usableHere(f: SavedFolder): boolean {
  if (f.kind === 'windows') return isWindowsApp();
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

/** Live registry list (newest-used first), optionally filtered to one kind. Re-renders when any app changes it. */
export function useSavedFolders(kind?: SavedFolder['kind']): SavedFolder[] {
  const pick = () => savedFolders().filter(f => usableHere(f) && (!kind || f.kind === kind));
  const [list, setList] = useState<SavedFolder[]>(pick);
  useEffect(() => onFoldersChanged(() => setList(pick())), [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

// ── Per-app "last folder" memory ────────────────────────────────────────────

const lastKey = (app: string) => `plajah_last_folder_${app}`;

export function getLastFolderId(app: string): string | null {
  try { return localStorage.getItem(lastKey(app)); } catch { return null; }
}
export function setLastFolderId(app: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(lastKey(app), id);
    else localStorage.removeItem(lastKey(app));
  } catch { /* storage blocked */ }
  if (id) touchFolder(id);
}
/** The app's last folder, if it is still saved and usable in this runtime. */
export function lastFolder(app: string): SavedFolder | null {
  const id = getLastFolderId(app);
  const f = id ? getFolder(id) : undefined;
  return f && usableHere(f) ? f : null;
}

/**
 * Resolve a saved browser folder's handle and its read permission. Pass interactive=false on
 * load (never prompts; 'prompt' means show "Reconnect"), interactive=true only from a click.
 */
export async function openSavedHandle(id: string, interactive: boolean, mode: 'read' | 'readwrite' = 'read'): Promise<{ handle: DirEntryLike | null; permission: FolderPermission }> {
  const handle = await folderHandle(id);
  if (!handle) return { handle: null, permission: 'denied' };
  return { handle, permission: await ensurePermission(handle, interactive, mode) };
}

// ── The picker ──────────────────────────────────────────────────────────────

interface SavedFoldersMenuProps {
  /** Called with the folder the user chose. For handle folders, call openSavedHandle(id, true) from here (it is a click). */
  onOpen: (folder: SavedFolder) => void;
  /** Only show one kind (e.g. 'handle' where only browser handles make sense). */
  kind?: SavedFolder['kind'];
  /** Highlight the folder currently open. */
  activeId?: string | null;
  label?: string;
  className?: string;
  title?: string;
}

const DEFAULT_CLASS =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition-colors';

/** Compact "Saved folders ▾" dropdown. Renders nothing when there are no usable saved folders. */
export function SavedFoldersMenu({ onOpen, kind, activeId, label = 'Saved folders', className, title }: SavedFoldersMenuProps) {
  const folders = useSavedFolders(kind);
  const menu = useContextMenu<void>(() => [
    { kind: 'header', label: 'Saved folders' },
    ...folders.map(f => ({
      id: `open-${f.id}`,
      label: f.name,
      icon: f.kind === 'windows' ? <Monitor size={14} /> : <Globe size={14} />,
      checked: activeId != null ? activeId === f.id : undefined,
      onSelect: () => { touchFolder(f.id); onOpen(f); },
    })),
    { kind: 'separator' },
    {
      id: 'remove',
      label: 'Remove a folder',
      icon: <Trash2 size={14} />,
      submenu: folders.map(f => ({
        id: `rm-${f.id}`, label: f.name, danger: true,
        onSelect: () => { void removeFolder(f.id); },
      })),
    },
  ]);
  if (folders.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={className ?? DEFAULT_CLASS}
        title={title ?? 'Folders you have added in any Plajah app'}
        onClick={(e) => menu.openFrom(e.currentTarget, undefined)}
      >
        <FolderOpen size={13} /> {label} <span className="opacity-60">({folders.length})</span> <ChevronDown size={12} />
      </button>
      {menu.node}
    </>
  );
}

export default SavedFoldersMenu;
