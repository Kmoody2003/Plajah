/**
 * Read-aloud for learning supports: speaks a list of passages in order on the device voice and publishes which
 * passage is being read, so the page can highlight it. One reading at a time across the app: starting a new one
 * (or calling stopReading) ends the last. Each reading has a key (e.g. a lesson id) so only its owner highlights.
 */
import { useEffect, useState } from 'react';
import { speak, cancelSpeech, ttsSupported } from './voca/vocaVoice';

let token = 0;
let current: { key: string; index: number } = { key: '', index: -1 };
const listeners = new Set<() => void>();
const publish = (key: string, index: number) => { current = { key, index }; listeners.forEach(l => l()); };

export const canReadAloud = () => ttsSupported();

export function stopReading() { token++; cancelSpeech(); publish('', -1); }

/** Resolves when the reading finishes or is stopped. */
export async function readPassages(key: string, passages: string[], opts: { rate?: number; from?: number } = {}): Promise<void> {
  stopReading();
  const mine = ++token;
  for (let i = opts.from ?? 0; i < passages.length; i++) {
    if (mine !== token) return;
    const t = passages[i]?.trim(); if (!t) continue;
    publish(key, i);
    await speak(t, { rate: opts.rate ?? 0.95, pitch: 1 });
  }
  if (mine === token) publish('', -1);
}

/** The passage index being read for `key`, or -1. */
export function useReading(key: string): number {
  const [i, setI] = useState(current.key === key ? current.index : -1);
  useEffect(() => {
    const on = () => setI(current.key === key ? current.index : -1);
    listeners.add(on); on();
    return () => { listeners.delete(on); };
  }, [key]);
  return i;
}
