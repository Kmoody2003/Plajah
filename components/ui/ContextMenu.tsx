import React, {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { menuViewport, placeMenu } from './menuPosition';

/**
 * Plajah design-system Command Menu — the one right-click / context menu.
 *
 * Before this, every surface that wanted a right-click menu re-implemented the
 * same thing: an `onContextMenu` handler, a `{x,y}` state, and an absolutely
 * positioned div — and every copy shared the same four bugs (clipped by a
 * panel's overflow, opened off the viewport edge, no keyboard nav, no touch
 * long-press). This is that primitive, once.
 *
 * Surfaces describe WHAT commands exist (a `MenuNode[]`); the engine owns HOW
 * they render and behave — portal to <body>, edge-flip, arrow-key nav,
 * submenus, checkables, danger styling, and a 500ms long-press for touch/TV.
 *
 *   const menu = useContextMenu<Clip>((clip) => [
 *     { kind: 'header', label: clip.name },
 *     { id: 'launch', label: 'Launch', icon: <Play/>, shortcut: '⏎', onSelect: (c) => launch(c) },
 *     { id: 'blend',  label: 'Blend mode', submenu: BLEND_MODES.map(...) },
 *     { id: 'loop',   label: 'Loop', checked: clip.loop, keepOpen: true, onSelect: toggleLoop },
 *     { kind: 'separator' },
 *     { id: 'clear',  label: 'Clear', danger: true, shortcut: '⌫', onSelect: (c) => clear(c) },
 *   ]);
 *   return <>
 *     <div {...menu.bind(clip)}>…</div>
 *     <button onClick={(e) => menu.openFrom(e.currentTarget, clip)}>⋯</button>  {/* touch/TV trigger *​/}
 *     {menu.node}
 *   </>;
 *
 * Spec: docs/PLAJAH_DESIGN_SYSTEM.md
 */

// ── Item schema ──────────────────────────────────────────────────────────────

export interface MenuItemNode<C = void> {
  /** Stable within its menu — used for keys and aria-activedescendant. */
  id: string;
  label: React.ReactNode;
  /** Leading icon. Suppressed when the item is checkable (the check takes its slot). */
  icon?: React.ReactNode;
  /** Right-aligned hint, e.g. '⌘R'. Display only — the primitive does not bind it. */
  shortcut?: string;
  /** Destructive — rendered in --pj-danger. Reserve for delete/clear/remove. */
  danger?: boolean;
  disabled?: boolean;
  /** Renders a check slot. `true`/`false` shows/clears the check; `undefined` = not checkable. */
  checked?: boolean;
  /** Keep the menu open after onSelect — for toggles the user flips several of in a row. */
  keepOpen?: boolean;
  /** Nested items. A function is resolved with the same ctx when the submenu opens. */
  submenu?: MenuNode<C>[] | ((ctx: C) => MenuNode<C>[]);
  onSelect?: (ctx: C) => void;
}

export type MenuNode<C = void> =
  | MenuItemNode<C>
  | { kind: 'separator' }
  | { kind: 'header'; label: React.ReactNode; /** 9px colour chip before the label. */ swatch?: string };

export type MenuBuilder<C> = (ctx: C) => MenuNode<C>[];

function isItem<C>(n: MenuNode<C>): n is MenuItemNode<C> {
  return !('kind' in n);
}

// ── Positioning ──────────────────────────────────────────────────────────────

// ── Keyboard controller stack ────────────────────────────────────────────────
// Each rendered level registers a controller keyed by depth. The deepest level
// (the top of the stack) receives keystrokes — this mirrors how nested native
// menus hand focus down and back up.

interface LevelCtl {
  depth: number;
  focusables: () => number[];
  active: () => number;
  setActive: (i: number) => void;
  hasSub: (i: number) => boolean;
  activate: (i: number) => void;
  openSub: (i: number) => void;
}

// ── Render one level ─────────────────────────────────────────────────────────

type Anchor =
  | { type: 'point'; x: number; y: number }
  | { type: 'item' | 'trigger'; getRect: () => DOMRect | null };

interface LevelProps<C> {
  items: MenuNode<C>[];
  ctx: C;
  depth: number;
  anchor: Anchor;
  onSelectItem: (item: MenuItemNode<C>) => void;
  onOpenSubmenu: (depth: number, index: number) => void;
  onCloseBelow: (depth: number) => void;
  register: (ctl: LevelCtl) => void;
  unregister: (depth: number) => void;
  registerItem: (depth: number, index: number, el: HTMLElement | null) => void;
}

function MenuLevel<C>({
  items, ctx, depth, anchor, onSelectItem, onOpenSubmenu, onCloseBelow, register, unregister, registerItem,
}: LevelProps<C>) {
  const ref = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const [active, setActive] = useState<number>(-1);

  const focusables = items.map((n, i) => (isItem(n) && !n.disabled ? i : -1)).filter((i) => i >= 0);

  // Self-position after layout, once the level has a measured size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const viewport = menuViewport();
      el.style.maxWidth = `${Math.max(0, viewport.width - 16)}px`;
      el.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`;
      const r = anchor.type === 'point' ? { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y } : anchor.getRect();
      // Never invent a top-of-page anchor. Item refs attach before layout effects.
      if (!r) { el.style.visibility = 'hidden'; return; }
      const pos = placeMenu(r, el.offsetWidth, el.offsetHeight, viewport, anchor.type === 'item' ? 'beside' : anchor.type === 'point' ? 'point' : 'below');
      el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; el.style.visibility = 'visible';
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(el);
    document.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => { observer.disconnect(); document.removeEventListener('scroll', update, true); window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); };
  });

  // Live refs so the controller closes over fresh values without re-registering.
  const itemsRef = useRef(items); itemsRef.current = items;
  const activeRef = useRef(active); activeRef.current = active;
  const focusRef = useRef(focusables); focusRef.current = focusables;

  const activate = useCallback((i: number) => {
    const it = itemsRef.current[i];
    if (!it || !isItem(it) || it.disabled) return;
    if (it.submenu) { onOpenSubmenu(depth, i); return; }
    it.onSelect?.(ctx);
    if (!it.keepOpen) onSelectItem(it); // onSelectItem closes the whole menu
  }, [ctx, depth, onOpenSubmenu, onSelectItem]);

  // Register this level's keyboard controller for its lifetime.
  useEffect(() => {
    const ctl: LevelCtl = {
      depth,
      focusables: () => focusRef.current,
      active: () => activeRef.current,
      setActive,
      hasSub: (i) => { const it = itemsRef.current[i]; return !!(it && isItem(it) && it.submenu); },
      activate,
      openSub: (i) => onOpenSubmenu(depth, i),
    };
    register(ctl);
    return () => unregister(depth);
  }, [depth, activate, onOpenSubmenu, register, unregister]);

  // A freshly opened level highlights its first item so the keyboard lands somewhere.
  useEffect(() => { setActive(focusables[0] ?? -1); /* eslint-disable-next-line */ }, [depth]);

  const activeId = active >= 0 ? `${baseId}-${active}` : undefined;
  useLayoutEffect(() => {
    const el = ref.current, item = activeId ? document.getElementById(activeId) : null;
    if (!el || !item) return;
    const bounds = el.getBoundingClientRect(), row = item.getBoundingClientRect();
    if (row.top < bounds.top) el.scrollTop -= bounds.top - row.top;
    else if (row.bottom > bounds.bottom) el.scrollTop += row.bottom - bounds.bottom;
  }, [activeId]);

  return (
    <div
      ref={ref}
      className="pj-menu"
      role="menu"
      tabIndex={-1}
      aria-activedescendant={activeId}
      data-depth={depth}
      style={{ position: 'fixed', visibility: 'hidden', overflowY: 'auto', overflowX: 'hidden', minWidth: 'min(210px, calc(100vw - 16px))' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((n, i) => {
        if (!isItem(n)) {
          if (n.kind === 'separator') return <div key={`sep-${i}`} className="pj-menu__sep" role="separator" />;
          return (
            <div key={`hdr-${i}`} className="pj-menu__hdr">
              {n.swatch && <span className="pj-menu__sw" style={{ background: n.swatch }} />}
              {n.label}
            </div>
          );
        }
        const checkable = n.checked !== undefined;
        return (
          <div
            key={n.id}
            ref={(el) => registerItem(depth, i, el)}
            id={`${baseId}-${i}`}
            className={[
              'pj-menu__item',
              n.danger && 'is-danger',
              active === i && 'is-active',
            ].filter(Boolean).join(' ')}
            role={checkable ? 'menuitemcheckbox' : 'menuitem'}
            aria-disabled={n.disabled || undefined}
            aria-checked={checkable ? !!n.checked : undefined}
            aria-haspopup={n.submenu ? 'menu' : undefined}
            onPointerEnter={() => {
              setActive(i);
              if (n.submenu && !n.disabled) onOpenSubmenu(depth, i);
              else onCloseBelow(depth);
            }}
            onClick={(e) => { e.stopPropagation(); activate(i); }}
          >
            {checkable
              ? <span className="pj-menu__chk">{n.checked ? '✓' : ''}</span>
              : n.icon !== undefined && <span className="pj-menu__ic">{n.icon}</span>}
            <span className="pj-menu__lbl">{n.label}</span>
            {n.shortcut && <span className="pj-menu__sc">{n.shortcut}</span>}
            {n.submenu && <span className="pj-menu__chev" aria-hidden="true">▸</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Portal: owns the open menu tree, global listeners, keyboard routing ───────

interface PortalProps<C> {
  build: MenuBuilder<C>;
  ctx: C;
  x: number;
  y: number;
  onClose: () => void;
  rootAnchor?: Anchor;
}

function ContextMenuPortal<C>({ build, ctx, x, y, onClose, rootAnchor }: PortalProps<C>) {
  // path[k] = the index (within level k) whose submenu is open. Levels rendered
  // = path.length + 1. Truncating path closes the deeper levels.
  const [path, setPath] = useState<number[]>([]);
  const stackRef = useRef<LevelCtl[]>([]);
  const itemEls = useRef<Map<string, HTMLElement>>(new Map());
  const registerItem = useCallback((depth: number, index: number, el: HTMLElement | null) => {
    const key = `${depth}:${index}`;
    if (el) itemEls.current.set(key, el); else itemEls.current.delete(key);
  }, []);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const openSubmenu = useCallback((depth: number, index: number) => {
    setPath((p) => [...p.slice(0, depth), index]);
  }, []);
  const closeBelow = useCallback((depth: number) => {
    setPath((p) => (p.length > depth ? p.slice(0, depth) : p));
  }, []);
  const register = useCallback((ctl: LevelCtl) => {
    const s = stackRef.current.filter((c) => c.depth !== ctl.depth);
    s.push(ctl); s.sort((a, b) => a.depth - b.depth);
    stackRef.current = s;
  }, []);
  const unregister = useCallback((depth: number) => {
    stackRef.current = stackRef.current.filter((c) => c.depth !== depth);
  }, []);

  // Global lifecycle: outside-press, scroll/resize/blur close, focus restore.
  useEffect(() => {
    restoreFocus.current = (document.activeElement as HTMLElement) ?? null;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !document.querySelector('.pj-menu-layer')?.contains(e.target)) onClose();
    };
    const close = () => onClose();
    document.addEventListener('pointerdown', onDown, true);
    const scroll = (e: Event) => { if (!(e.target instanceof Element) || !e.target.closest('.pj-menu-layer')) close(); };
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      restoreFocus.current?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  // Keyboard routes to the deepest open level.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const stack = stackRef.current;
      const top = stack[stack.length - 1];
      if (!top) return;
      const f = top.focusables();
      const move = (dir: number) => {
        e.preventDefault();
        if (!f.length) return;
        const idx = f.indexOf(top.active());
        top.setActive(f[(idx + dir + f.length) % f.length]);
      };
      switch (e.key) {
        case 'ArrowDown': move(1); break;
        case 'ArrowUp': move(-1); break;
        case 'Home': e.preventDefault(); if (f.length) top.setActive(f[0]); break;
        case 'End': e.preventDefault(); if (f.length) top.setActive(f[f.length - 1]); break;
        case 'ArrowRight':
          if (top.hasSub(top.active())) { e.preventDefault(); top.openSub(top.active()); }
          break;
        case 'ArrowLeft':
          if (top.depth > 0) { e.preventDefault(); closeBelow(top.depth - 1); }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault(); top.activate(top.active()); break;
        case 'Escape':
          e.preventDefault(); e.stopPropagation(); onClose(); break;
        case 'Tab':
          e.preventDefault(); break; // trap
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [closeBelow, onClose]);

  // Walk `path` to resolve the items shown at each open level.
  const root = build(ctx);
  const levels: { items: MenuNode<C>[]; anchor: Anchor }[] = [{ items: root, anchor: rootAnchor || { type: 'point', x, y } }];
  let cur = root;
  for (let k = 0; k < path.length; k++) {
    const parent = cur[path[k]];
    if (!parent || !isItem(parent) || !parent.submenu) break;
    const sub = typeof parent.submenu === 'function' ? parent.submenu(ctx) : parent.submenu;
    const parentDepth = k; // parent lives at level k
    const index = path[k];
    levels.push({ items: sub, anchor: { type: 'item', getRect: () => itemEls.current.get(`${parentDepth}:${index}`)?.getBoundingClientRect() ?? null } });
    cur = sub;
  }

  return createPortal(
    <div className="pj-menu-layer">
      {levels.map((lvl, depth) => (
        <MenuLevel
          key={depth}
          items={lvl.items}
          ctx={ctx}
          depth={depth}
          anchor={lvl.anchor}
          onSelectItem={onClose}
          onOpenSubmenu={openSubmenu}
          onCloseBelow={closeBelow}
          register={register}
          unregister={unregister}
          registerItem={registerItem}
        />
      ))}
    </div>,
    document.body,
  );
}

// ── Public hook ──────────────────────────────────────────────────────────────

export interface ContextMenuApi<C> {
  /** Spread onto a surface: `<div {...menu.bind(ctx)}>`. Adds right-click + touch long-press. */
  bind: (ctx: C) => {
    onContextMenu: (e: React.MouseEvent) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
  /** Open at explicit viewport coordinates (custom triggers). */
  openAt: (x: number, y: number, ctx: C) => void;
  /** Open anchored to an element — for a kebab `⋯` button, giving touch/TV a trigger. */
  openFrom: (el: Element, ctx: C) => void;
  close: () => void;
  isOpen: boolean;
  /** Render once in the tree. Portals to <body> when open, else null. */
  node: React.ReactNode;
}

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

export function useContextMenu<C = void>(build: MenuBuilder<C>): ContextMenuApi<C> {
  const [state, setState] = useState<{ x: number; y: number; ctx: C; anchor?: Anchor } | null>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);

  const openAt = useCallback((x: number, y: number, ctx: C) => setState({ x, y, ctx }), []);
  const close = useCallback(() => setState(null), []);

  const openFrom = useCallback((el: Element, ctx: C) => {
    const r = el.getBoundingClientRect();
    setState({ x: r.left, y: r.bottom + 4, ctx, anchor: { type: 'trigger', getRect: () => el.isConnected ? el.getBoundingClientRect() : null } });
  }, []);

  const clearPress = useCallback(() => {
    if (press.current) { window.clearTimeout(press.current.timer); press.current = null; }
  }, []);

  const bind = useCallback((ctx: C) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openAt(e.clientX, e.clientY, ctx);
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const x = e.clientX, y = e.clientY;
      const timer = window.setTimeout(() => { press.current = null; openAt(x, y, ctx); }, LONG_PRESS_MS);
      press.current = { timer, x, y };
    },
    onPointerUp: clearPress,
    onPointerCancel: clearPress,
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (p && (Math.abs(e.clientX - p.x) > MOVE_TOLERANCE || Math.abs(e.clientY - p.y) > MOVE_TOLERANCE)) clearPress();
    },
  }), [openAt, clearPress]);

  const node = state
    ? <ContextMenuPortal build={build} ctx={state.ctx} x={state.x} y={state.y} rootAnchor={state.anchor} onClose={close} />
    : null;

  return { bind, openAt, openFrom, close, isOpen: !!state, node };
}

export default useContextMenu;
