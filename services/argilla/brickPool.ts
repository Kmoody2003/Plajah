/**
 * brickPool.ts — the CPU half of Argilla's sparse clay field.
 *
 * The world is a cube of `grid`^3 cells. A cell is outside, inside, or holds a brick of signed
 * distance samples on the GPU. This file owns who holds which slot and the undo history. Nothing
 * here touches the GPU, so it can be tested directly.
 *
 * Undo is copy-on-write: the first time a stroke touches a cell it moves to a fresh slot, and the
 * old slot stays alive in the history. Undoing swaps page entries back, with no readback.
 */

export const CELL_OUTSIDE = 0;
export const CELL_INSIDE = 1;
const SLOT_BASE = 2;

export const BRICK_VOXELS = 8;
/** Samples per side: 9 corners plus a 1-sample border on each side, so filtering never leaves a brick. */
export const BRICK_STRIDE = BRICK_VOXELS + 3;
export const COARSE_CELLS = 8;

export const isSlot = (entry: number) => entry >= SLOT_BASE;
export const slotOf = (entry: number) => entry - SLOT_BASE;
export const entryOf = (slot: number) => slot + SLOT_BASE;

interface HistoryEntry {
  changes: Map<number, { before: number; after: number }>;
}

export interface PoolChange {
  cell: number;
  entry: number;
}

export class BrickPool {
  readonly page: Uint32Array;
  readonly coarseDim: number;
  private coarseCount: Uint16Array;
  private free: number[] = [];
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private open: HistoryEntry | null = null;
  /** Cells whose page entry changed since the last drain. */
  private dirty = new Set<number>();
  private dirtyCoarse = new Set<number>();

  constructor(readonly grid: number, readonly slotsPerSide: number) {
    this.page = new Uint32Array(grid * grid * grid);
    this.coarseDim = Math.ceil(grid / COARSE_CELLS);
    this.coarseCount = new Uint16Array(this.coarseDim ** 3);
    const capacity = slotsPerSide ** 3;
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  get capacity() { return this.slotsPerSide ** 3; }
  get freeSlots() { return this.free.length; }
  get usedSlots() { return this.capacity - this.free.length; }

  cellIndex(x: number, y: number, z: number) { return x + this.grid * (y + this.grid * z); }

  cellCoord(cell: number): [number, number, number] {
    const g = this.grid;
    return [cell % g, Math.floor(cell / g) % g, Math.floor(cell / (g * g))];
  }

  slotCoord(slot: number): [number, number, number] {
    const n = this.slotsPerSide;
    return [slot % n, Math.floor(slot / n) % n, Math.floor(slot / (n * n))];
  }

  private coarseIndex(cell: number) {
    const [x, y, z] = this.cellCoord(cell);
    const d = this.coarseDim;
    return Math.floor(x / COARSE_CELLS) + d * (Math.floor(y / COARSE_CELLS) + d * Math.floor(z / COARSE_CELLS));
  }

  private setEntry(cell: number, entry: number) {
    const was = this.page[cell];
    if (was === entry) return;
    if ((was === CELL_OUTSIDE) !== (entry === CELL_OUTSIDE)) {
      const c = this.coarseIndex(cell);
      const before = this.coarseCount[c];
      this.coarseCount[c] = before + (entry === CELL_OUTSIDE ? -1 : 1);
      if ((before === 0) !== (this.coarseCount[c] === 0)) this.dirtyCoarse.add(c);
    }
    this.page[cell] = entry;
    this.dirty.add(cell);
  }

  drainDirty(): PoolChange[] {
    const out: PoolChange[] = [];
    for (const cell of this.dirty) out.push({ cell, entry: this.page[cell] });
    this.dirty.clear();
    return out;
  }

  drainDirtyCoarse(): { index: number; occupied: number }[] {
    const out: { index: number; occupied: number }[] = [];
    for (const index of this.dirtyCoarse) out.push({ index, occupied: this.coarseCount[index] > 0 ? 1 : 0 });
    this.dirtyCoarse.clear();
    return out;
  }

  beginStroke() {
    if (this.open) this.endStroke();
    this.open = { changes: new Map() };
    for (const entry of this.redoStack) this.releaseAfters(entry);
    this.redoStack = [];
  }

  endStroke() {
    const open = this.open;
    this.open = null;
    if (open && open.changes.size) this.undoStack.push(open);
  }

  private takeSlot(): number | null {
    while (!this.free.length && this.undoStack.length) this.evictOldest();
    return this.free.length ? this.free.pop()! : null;
  }

  private evictOldest() {
    const oldest = this.undoStack.shift();
    if (!oldest) return;
    for (const { before } of oldest.changes.values()) if (isSlot(before)) this.free.push(slotOf(before));
  }

  private releaseAfters(entry: HistoryEntry) {
    for (const { after } of entry.changes.values()) if (isSlot(after)) this.free.push(slotOf(after));
  }

  /**
   * Make a cell writable for the open stroke. Returns the slot to write and the entry its contents
   * should come from, or null when the pool is full even after dropping all undo history.
   */
  touch(cell: number): { slot: number; source: number; fresh: boolean } | null {
    const open = this.open;
    if (!open) throw new Error('touch outside a stroke');
    const current = this.page[cell];
    const change = open.changes.get(cell);
    if (change && isSlot(current)) return { slot: slotOf(current), source: current, fresh: false };
    const slot = this.takeSlot();
    if (slot === null) return null;
    const entry = entryOf(slot);
    if (change) change.after = entry;
    else open.changes.set(cell, { before: current, after: entry });
    this.setEntry(cell, entry);
    return { slot, source: current, fresh: true };
  }

  /** Mark a cell solid or empty with no brick, for example when a stamp swallows it whole. */
  settle(cell: number, state: typeof CELL_INSIDE | typeof CELL_OUTSIDE) {
    const open = this.open;
    if (!open) throw new Error('settle outside a stroke');
    const current = this.page[cell];
    if (current === state) return;
    const change = open.changes.get(cell);
    if (change) {
      if (isSlot(current)) this.free.push(slotOf(current));
      change.after = state;
    } else {
      open.changes.set(cell, { before: current, after: state });
    }
    this.setEntry(cell, state);
  }

  /** Slots written by the most recent stroke, for compaction after it ends. */
  lastStrokeSlots(): { cell: number; slot: number }[] {
    const last = this.undoStack[this.undoStack.length - 1];
    if (!last) return [];
    const out: { cell: number; slot: number }[] = [];
    for (const [cell, { after }] of last.changes) if (isSlot(after)) out.push({ cell, slot: slotOf(after) });
    return out;
  }

  /** A brick from the last stroke turned out to be all outside or all inside: release its slot. */
  compact(cell: number, state: typeof CELL_INSIDE | typeof CELL_OUTSIDE) {
    const last = this.undoStack[this.undoStack.length - 1];
    const change = last?.changes.get(cell);
    if (!change || !isSlot(change.after) || this.page[cell] !== change.after) return;
    this.free.push(slotOf(change.after));
    change.after = state;
    this.setEntry(cell, state);
  }

  /**
   * A brick from a fresh bake has no history, so it can simply go. The answer arrives later from the
   * GPU, so it is ignored if a stroke has moved this cell.
   */
  releaseBaked(cell: number, slot: number, state: typeof CELL_INSIDE | typeof CELL_OUTSIDE) {
    const current = this.page[cell];
    if (current !== entryOf(slot)) return;
    this.free.push(slot);
    this.setEntry(cell, state);
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    for (const [cell, { before }] of entry.changes) this.setEntry(cell, before);
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const [cell, { after }] of entry.changes) this.setEntry(cell, after);
    this.undoStack.push(entry);
    return true;
  }

  /** Restore a saved page table. History starts empty. Returns the slot assigned to each brick. */
  restore(states: Uint8Array, brickCells: Uint32Array): Uint32Array {
    if (brickCells.length > this.capacity) throw new Error('This sculpt needs more clay than this device can hold.');
    this.undoStack = [];
    this.redoStack = [];
    this.open = null;
    this.free = [];
    for (let i = this.capacity - 1; i >= brickCells.length; i--) this.free.push(i);
    for (let cell = 0; cell < this.page.length; cell++) this.setEntry(cell, states[cell] ? CELL_INSIDE : CELL_OUTSIDE);
    const slots = new Uint32Array(brickCells.length);
    brickCells.forEach((cell, i) => {
      slots[i] = i;
      this.setEntry(cell, entryOf(i));
    });
    return slots;
  }
}
