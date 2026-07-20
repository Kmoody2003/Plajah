import { useCallback, useEffect, useRef, useState } from 'react';
import { isShellFocused, setShellFocus, subscribeShellFocus } from './useTvShellFocus';

/**
 * Deterministic D-pad navigation for a TV screen.
 *
 * The global spatial layer infers where to go from element geometry. That is the right default
 * for arbitrary pages, and it is exactly why the Chora TV screen kept mis-navigating: rails
 * overlap, cards re-render, and hidden layouts still occupy rects — so the same press could
 * resolve differently twice in a row.
 *
 * Here the screen declares its own structure instead: a list of ROWS, each with a length. A
 * press moves an index. There is nothing to infer, so nothing to get wrong — the same press
 * always does the same thing, which is the property a remote needs above all others.
 *
 * Row 0 is conventionally the side panel; content rows follow. `columns: 1` makes a row
 * vertical-only (a list), which is how the panel behaves.
 */

export interface TvRow {
  /** Stable id — used to restore position when content reloads. */
  id: string;
  /** How many focusable items this row has right now. */
  count: number;
}

export interface TvGridPosition { row: number; col: number; }

interface Options {
  rows: TvRow[];
  /** Items in the left side panel. When > 0 the screen has two zones: PANEL and CONTENT. */
  panelCount?: number;
  /** Called when the viewer presses OK. */
  onSelect?: (pos: TvGridPosition, rowId: string) => void;
  /** Called on Back. Return true if handled. */
  onBack?: () => boolean;
  /**
   * Pressing up at the top row leaves the screen upward — to the app's tab bar.
   *
   * A capture screen owns every key, which means the shell's navigation becomes unreachable
   * unless the screen hands it back deliberately. Return true if the caller took focus.
   *
   * Defaults to handing focus to the shell, so a screen gets this for free. Pass one only to
   * override — e.g. a screen with nothing above it that should swallow the press instead.
   */
  onExitTop?: () => boolean;
  enabled?: boolean;
}

export function useTvGrid({ rows, panelCount = 0, onSelect, onBack, onExitTop, enabled = true }: Options) {
  // Two zones, because that is the shape of every music TV app: a vertical rail of sections on
  // the left, a grid of content on the right. Left from column 0 returns to the panel; right
  // from the panel enters the content. Nothing else crosses the boundary, so the viewer always
  // knows which half they are in.
  const [zone, setZone] = useState<'PANEL' | 'CONTENT'>(panelCount > 0 ? 'PANEL' : 'CONTENT');
  const [panelIndex, setPanelIndex] = useState(0);
  const zoneRef = useRef(zone); zoneRef.current = zone;
  const panelRef = useRef(panelIndex); panelRef.current = panelIndex;
  const panelCountRef = useRef(panelCount); panelCountRef.current = panelCount;
  // Default: hand focus to the shell's tab bar. Screens do not have to opt in.
  const exitTop = onExitTop ?? (() => { setShellFocus(true); return true; });
  const onExitTopRef = useRef(exitTop); onExitTopRef.current = exitTop;

  // While the shell holds the remote this grid must be genuinely deaf, not merely dimmed: if
  // both listen, one press moves two things and the screen feels haunted.
  //
  // Gated on a REF read inside the handler, not by binding and unbinding the listener. Rebinding
  // depends on an effect running, so for one press after the handoff it is ambiguous which side
  // is listening — which showed up on the TV as needing two presses to come back. A ref updated
  // in the store callback is already correct by the time the next key arrives.
  const shellFocusedRef = useRef(isShellFocused());
  const [, setShellFocusedState] = useState(shellFocusedRef.current);
  useEffect(() => subscribeShellFocus(v => { shellFocusedRef.current = v; setShellFocusedState(v); }), []);
  const [pos, setPos] = useState<TvGridPosition>({ row: 0, col: 0 });
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const posRef = useRef(pos);
  posRef.current = pos;

  // Remember the column per row, so moving down a rail and back up returns you to where you
  // were rather than snapping to the first item — the single biggest quality-of-life
  // difference between a TV UI that feels considered and one that feels like a web page.
  const lastColRef = useRef<Record<string, number>>({});

  const clampToRow = useCallback((rowIdx: number, wantCol: number): TvGridPosition => {
    const list = rowsRef.current;
    const r = Math.max(0, Math.min(rowIdx, list.length - 1));
    const count = list[r]?.count ?? 0;
    if (count === 0) return { row: r, col: 0 };
    return { row: r, col: Math.max(0, Math.min(wantCol, count - 1)) };
  }, []);

  const move = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    const list = rowsRef.current;
    const cur = posRef.current;
    const curRow = list[cur.row];

    // ── Side panel ──
    if (zoneRef.current === 'PANEL') {
      const n = panelCountRef.current;
      if (dir === 'up') {
        if (panelRef.current === 0 && onExitTopRef.current?.()) return;   // leave upward
        setPanelIndex(i => Math.max(0, i - 1));
        return;
      }
      if (dir === 'down')  { setPanelIndex(i => Math.min(n - 1, i + 1)); return; }
      if (dir === 'right') { setZone('CONTENT'); return; }
      return;   // left at the panel edge: stay put rather than leaving the app
    }

    if (dir === 'left' || dir === 'right') {
      const count = curRow?.count ?? 0;
      // Leftmost item + a panel to go back to = return to the panel.
      if (dir === 'left' && cur.col === 0 && panelCountRef.current > 0) { setZone('PANEL'); return; }
      if (count <= 1) return;                      // a single-item row has nowhere to go sideways
      const next = cur.col + (dir === 'right' ? 1 : -1);
      // Deliberately does NOT wrap. On a remote, wrapping from the last item back to the first
      // reads as a glitch — you pressed right and went backwards.
      if (next < 0 || next >= count) return;
      const p = { row: cur.row, col: next };
      if (curRow) lastColRef.current[curRow.id] = next;
      setPos(p);
      return;
    }

    // Vertical: skip empty rows entirely so a section that has not loaded yet never swallows a
    // press and leaves the viewer wondering whether the remote is broken.
    const step = dir === 'down' ? 1 : -1;
    let r = cur.row + step;
    while (r >= 0 && r < list.length && (list[r]?.count ?? 0) === 0) r += step;
    if (r < 0) { onExitTopRef.current?.(); return; }   // above the first row: hand focus up
    if (r >= list.length) return;
    const targetRow = list[r];
    // Carry the current column into the new row, clamped to its length — moving down should keep
    // you roughly where you were horizontally, which is what every TV app does and what the eye
    // expects. A REMEMBERED column wins when you have visited that row before, so returning to a
    // rail you had scrolled deep into puts you back where you left off rather than at its start.
    const remembered = targetRow ? lastColRef.current[targetRow.id] : undefined;
    setPos(clampToRow(r, remembered ?? cur.col));
  }, [clampToRow]);

  // Keep the position valid when content streams in and row lengths change under us.
  useEffect(() => {
    setPos(p => clampToRow(p.row, p.col));
  }, [rows, clampToRow]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (shellFocusedRef.current) return;   // the tab bar has the remote
      const kc = e.keyCode || e.which;
      const t = e.target as HTMLElement | null;
      // Never fight a text field.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const dir =
        (e.key === 'ArrowUp' || kc === 38 || kc === 19) ? 'up' :
        (e.key === 'ArrowDown' || kc === 40 || kc === 20) ? 'down' :
        (e.key === 'ArrowLeft' || kc === 37 || kc === 21) ? 'left' :
        (e.key === 'ArrowRight' || kc === 39 || kc === 22) ? 'right' : null;

      if (dir) {
        e.preventDefault();
        e.stopImmediatePropagation();   // the global spatial layer must not also act on this
        move(dir);
        return;
      }

      if (e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (zoneRef.current === 'PANEL') {
          onSelect?.({ row: -1, col: panelRef.current }, 'PANEL');
        } else {
          const cur = posRef.current;
          onSelect?.(cur, rowsRef.current[cur.row]?.id ?? '');
        }
        return;
      }

      if (kc === 4 || e.key === 'Backspace' || e.key === 'XF86Back' || e.key === 'GoBack') {
        // Back from the content returns to the panel before it leaves the screen — one more
        // step out, rather than dumping the viewer somewhere else entirely.
        if (zoneRef.current === 'CONTENT' && panelCountRef.current > 0) {
          e.preventDefault(); e.stopImmediatePropagation();
          setZone('PANEL');
          return;
        }
        if (onBack?.()) { e.preventDefault(); e.stopImmediatePropagation(); }
      }
    };
    // Capture phase, so this wins before the global layer sees the key.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, move, onSelect, onBack]);

  const focus = useCallback((row: number, col = 0) => {
    setZone('CONTENT');
    setPos(clampToRow(row, col));
  }, [clampToRow]);

  return { pos, zone, panelIndex, setPanelIndex, setZone, setPos: focus, move };
}

/** True when this cell is the focused one. */
export const isFocused = (pos: TvGridPosition, row: number, col: number) =>
  pos.row === row && pos.col === col;
