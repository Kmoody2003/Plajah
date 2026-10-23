// The Chora Studio menu bar, lifted to the workspace — one File / Edit / View / … row across
// every room, where only the environment underneath changes. The shell declares the menus that
// are true everywhere (productions, rooms, save); the active room publishes its own groups with
// useStudioMenus() and they merge in by label, so Chora Studio's File menu, the Mastering Desk's
// File menu and the shell's File menu read as one menu.
//
// Rooms re-render constantly (engine snapshots, meters), so menus never travel through React
// state at the shell level: a room writes into a ref-backed registry and only the bar itself
// re-renders, and only when the menu's visible signature actually changed.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Save, Check, Loader2 } from 'lucide-react';
import { MenuBar, type MenuGroup, type MenuEntry } from './beats/shared/MenuBar';

type Listener = () => void;

/** What the bar's Save button saves, and the state it reads out. Owned by the active room. */
export interface StudioSaveSlot {
  /** 'local' = signed out / in memory; 'unsaved' = dirty; 'saving'; 'saved'. */
  state: 'local' | 'unsaved' | 'saving' | 'saved';
  onSave: () => void;
  /** What a save covers, for the tooltip — "Mastering project", "Groove"… */
  what?: string;
}

class MenuRegistry {
  private rooms = new Map<string, MenuGroup[]>();
  private sigs = new Map<string, string>();
  private listeners = new Set<Listener>();
  private saves = new Map<string, StudioSaveSlot>();

  setSave(owner: string, slot: StudioSaveSlot | null): void {
    const prev = this.saves.get(owner);
    if (slot) this.saves.set(owner, slot); else this.saves.delete(owner);
    if (prev?.state !== slot?.state || prev?.what !== slot?.what || !prev !== !slot) this.emit();
  }

  /** The most recently registered room's save slot — the room on screen. */
  save(): StudioSaveSlot | undefined { return Array.from(this.saves.values()).pop(); }

  set(owner: string, menus: MenuGroup[]): void {
    this.rooms.set(owner, menus);
    const sig = signature(menus);
    if (this.sigs.get(owner) === sig) return; // same labels/states — handlers are read live
    this.sigs.set(owner, sig);
    this.emit();
  }

  clear(owner: string): void {
    const had = this.rooms.delete(owner) || this.saves.delete(owner);
    this.saves.delete(owner);
    if (!had) return;
    this.sigs.delete(owner);
    this.emit();
  }

  /** Every room's groups, in registration order. */
  entries(): [string, MenuGroup[]][] { return Array.from(this.rooms.entries()); }

  /** The CURRENT handler for an item — the bar may be holding menus from an older render. */
  latest(owner: string, id: string): (() => void) | undefined {
    for (const g of this.rooms.get(owner) ?? []) {
      for (const i of g.items) if (i !== 'sep' && i.id === id) return i.onSelect;
    }
    return undefined;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const fn of this.listeners) fn(); }
}

const signature = (menus: MenuGroup[]) => menus
  .map((g) => `${g.label}[${g.items.map((i) => (i === 'sep' ? '-' : `${i.id}:${i.label}:${i.hint ?? ''}:${i.checked ? 1 : 0}${i.disabled ? 1 : 0}`)).join(',')}]`)
  .join('|');

const RegistryCtx = createContext<MenuRegistry | null>(null);

export const StudioMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const registry = useMemo(() => new MenuRegistry(), []);
  return <RegistryCtx.Provider value={registry}>{children}</RegistryCtx.Provider>;
};

/** True when a room is hosted under the shell's menu bar (and should not draw its own). */
export const useHasStudioMenuBar = (): boolean => useContext(RegistryCtx) !== null;

/**
 * Publish this room's menu groups to the shell bar. Call it every render with the current
 * menus — the registry only re-renders the bar when what it shows changes. No-op outside
 * the workspace (a standalone room keeps drawing its own bar).
 */
export function useStudioMenus(owner: string, menus: MenuGroup[], save?: StudioSaveSlot): void {
  const registry = useContext(RegistryCtx);
  // Write during the effect phase (not render) so a discarded render never leaks menus.
  useEffect(() => { registry?.set(owner, menus); registry?.setSave(owner, save ?? null); });
  useEffect(() => () => { registry?.clear(owner); }, [registry, owner]);
}

/**
 * Merge groups that share a label. Order follows the canonical DAW order first, then any
 * environment-specific menus (Release, Transport…) in the order the room declared them.
 */
const ORDER = ['File', 'Edit', 'View'];
const TAIL = ['Options', 'Window', 'Help'];

export function mergeMenus(layers: MenuGroup[][]): MenuGroup[] {
  const byLabel = new Map<string, MenuEntry[][]>();
  const seen: string[] = [];
  for (const layer of layers) {
    for (const g of layer) {
      if (!byLabel.has(g.label)) { byLabel.set(g.label, []); seen.push(g.label); }
      if (g.items.length) byLabel.get(g.label)!.push(g.items);
    }
  }
  const rank = (label: string) => {
    const head = ORDER.indexOf(label);
    if (head >= 0) return head;
    const tail = TAIL.indexOf(label);
    if (tail >= 0) return 1000 + tail;
    return 100 + seen.indexOf(label);
  };
  return seen
    .slice()
    .sort((a, b) => rank(a) - rank(b))
    .map((label) => ({
      label,
      items: byLabel.get(label)!.reduce<MenuEntry[]>((acc, items) => (acc.length ? [...acc, 'sep', ...items] : [...items]), []),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * The bar itself. `base` is the shell's own menus — the room's groups merge AFTER them inside
 * each label, so File reads: room actions (Save project, Export…) under the shell's
 * New / Switch production.
 */
export const StudioMenuBar: React.FC<{ base: MenuGroup[]; right?: React.ReactNode }> = ({ base, right }) => {
  const registry = useContext(RegistryCtx);
  const [, setRev] = useState(0);
  useEffect(() => registry?.subscribe(() => setRev((r) => r + 1)), [registry]);
  // Room items resolve their handler at click time, so a menu drawn several renders ago still
  // runs against the room's current state.
  const live = (owner: string, menus: MenuGroup[]): MenuGroup[] => menus.map((g) => ({
    ...g,
    items: g.items.map((i) => (i === 'sep' ? i : { ...i, onSelect: () => (registry?.latest(owner, i.id) ?? i.onSelect)?.() })),
  }));
  const menus = mergeMenus([base, ...(registry?.entries() ?? []).map(([owner, m]) => live(owner, m))]);
  const save = registry?.save();

  // Ctrl/Cmd+S saves whatever environment is on screen — a DAW reflex, so it never opens the
  // browser's Save Page dialog while a studio is up.
  useEffect(() => {
    if (!registry) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        const slot = registry.save();
        if (!slot) return;
        e.preventDefault();
        slot.onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registry]);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <MenuBar menus={menus} />
      {save && (
        <button
          type="button"
          onClick={() => registry?.save()?.onSave()}
          disabled={save.state === 'saving'}
          title={`Save ${save.what ?? 'project'} (Ctrl+S)`}
          className="h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold border transition-colors shrink-0 disabled:opacity-60"
          style={save.state === 'unsaved'
            ? { color: '#FF8C00', borderColor: 'rgba(255,140,0,0.45)', background: 'rgba(255,140,0,0.10)' }
            : { color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.14)', background: 'transparent' }}
        >
          {save.state === 'saving' ? <Loader2 size={11} className="animate-spin" /> : save.state === 'saved' ? <Check size={11} /> : <Save size={11} />}
          {save.state === 'saving' ? 'Saving…' : save.state === 'saved' ? 'Saved' : save.state === 'local' ? 'Save (in memory)' : 'Save'}
        </button>
      )}
      {right}
    </div>
  );
};

/**
 * The hook as a component — for rooms whose menus are built after an early return, where a
 * hook call would break the rules of hooks. Renders nothing.
 */
export const StudioMenuPublisher: React.FC<{ owner: string; menus: MenuGroup[]; save?: StudioSaveSlot }> = ({ owner, menus, save }) => {
  useStudioMenus(owner, menus, save);
  return null;
};
