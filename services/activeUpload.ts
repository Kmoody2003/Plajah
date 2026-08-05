// Tracks the live byte transfers (UpChunk film uploads) so the publish tray can
// show real-time progress and offer Pause / Resume. Separate from PublishQueue
// (which tracks the whole publish job) because pause/resume acts on the raw Mux
// chunk transfer. A tiny external store so components can useSyncExternalStore.

export interface ActiveTransfer {
  id: string;
  fileName: string;
  progress: number;   // 0–100
  paused: boolean;
  pause: () => void;
  resume: () => void;
}

let transfers: ActiveTransfer[] = [];
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach((l) => l()); };

export const registerTransfer = (t: ActiveTransfer): void => {
  transfers = [...transfers.filter((x) => x.id !== t.id), t];
  emit();
};
export const updateTransfer = (id: string, patch: Partial<ActiveTransfer>): void => {
  transfers = transfers.map((t) => (t.id === id ? { ...t, ...patch } : t));
  emit();
};
export const removeTransfer = (id: string): void => {
  transfers = transfers.filter((t) => t.id !== id);
  emit();
};

export const pauseAllTransfers = (): void => { transfers.forEach((t) => { try { t.pause(); } catch { /* */ } }); };
export const resumeAllTransfers = (): void => { transfers.forEach((t) => { try { t.resume(); } catch { /* */ } }); };

// useSyncExternalStore contract — getSnapshot returns the same array ref until it changes.
export const subscribeTransfers = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getTransfers = (): ActiveTransfer[] => transfers;
