// Chora Session Band live — the studio's event stream. Instruments, the transport and the person at
// the desk publish what happens; a character's director listens. Kept tiny and synchronous: emitting
// is a function call, so instrument code can report a hit from inside its own handler at no cost.

export type LiveEvent =
  | { kind: 'strike'; instrument: string; trackId: string; at: number; note: number; velocity: number;
      /** Instrument-specific: SOMA gives radial position 0 (centre) … 1 (rim) and the striker index. */
      pos?: number; striker?: number }
  | { kind: 'preset'; instrument: string; trackId: string; at: number; presetId: string; presetName: string }
  | { kind: 'param'; instrument: string; trackId: string; at: number; paramId: number }
  | { kind: 'open'; instrument: string; trackId: string; at: number; presetId?: string }
  | { kind: 'close'; instrument: string; trackId: string; at: number }
  /** A key played live on a pitched instrument (keyboard, controller, QWERTY). */
  | { kind: 'note'; instrument: string; trackId: string; at: number; key: number; velocity: number; on: boolean };

type Listener = (e: LiveEvent) => void;
const listeners = new Set<Listener>();

export const liveBus = {
  emit(e: LiveEvent): void { for (const l of listeners) { try { l(e); } catch (err) { console.debug('[band live] listener failed', err); } } },
  on(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
