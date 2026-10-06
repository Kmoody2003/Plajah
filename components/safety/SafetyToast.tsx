import React, { useEffect, useId, useState } from 'react';
import Portal from '../Portal';

/**
 * Tiny undo-toast bus for safety actions. `showSafetyToast` can be called from anywhere (even
 * after the calling card unmounted because the post was hidden); `SafetyToastHost` renders it.
 * Every UserSafetyMenu mounts a host, but only the first-registered one renders.
 */
export interface SafetyToastOptions { message: string; undoLabel?: string; onUndo?: () => void | Promise<void>; durationMs?: number; }
interface ToastItem extends SafetyToastOptions { id: number; }

let seq = 0;
let current: ToastItem | null = null;
const listeners = new Set<() => void>();
const hosts: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach(l => l());

export function dismissSafetyToast() {
  if (timer) { clearTimeout(timer); timer = null; }
  current = null;
  emit();
}

export function showSafetyToast(opts: SafetyToastOptions) {
  if (timer) clearTimeout(timer);
  current = { ...opts, id: ++seq };
  emit();
  timer = setTimeout(dismissSafetyToast, opts.durationMs ?? 7000);
}

export const SafetyToastHost: React.FC = () => {
  const hostId = useId();
  const [, force] = useState(0);

  useEffect(() => {
    hosts.push(hostId);
    const l = () => force(n => n + 1);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
      const i = hosts.indexOf(hostId);
      if (i >= 0) hosts.splice(i, 1);
      emit(); // let the next host take over
    };
  }, [hostId]);

  if (hosts[0] !== hostId || !current) return null;
  const t = current;
  return (
    <Portal>
      <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[300] max-w-[92vw]" role="status" aria-live="polite">
        <div className="flex items-center gap-4 pl-5 pr-3 py-3 rounded-2xl bg-black/90 backdrop-blur-xl border border-white/15 shadow-2xl">
          <span className="text-[11px] font-bold text-white/85">{t.message}</span>
          {t.onUndo && (
            <button
              onClick={async () => { const fn = t.onUndo; dismissSafetyToast(); try { await fn?.(); } catch { /* ignore */ } }}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-small-orange hover:bg-white/10 transition-colors"
            >
              {t.undoLabel || 'Undo'}
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
};
