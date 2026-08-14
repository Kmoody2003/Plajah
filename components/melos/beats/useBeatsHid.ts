// Labs WebHID bridge — connects the Maschine's pads and LEDs when the Labs flag is on.
// Everything here is best-effort: if HID is unavailable, blocked by NI's services, or the flag
// is off, the hook simply does nothing and the room behaves exactly as before.

import { useCallback, useEffect, useRef, useState } from 'react';
import { BeatsEngine } from '../../../services/melos/beats/engine/BeatsEngine';
import { initBeatsHid, hidLabsEnabled, setHidLabsEnabled, type BeatsHid } from '../../../services/melos/beats/nksHid';
import type { GrooveDoc } from '../../../services/melos/beats/grooveDoc';

const HIT_GLOW_MS = 160;
const LED_FPS = 30; // LED refresh is cosmetic — don't spend a frame's budget on USB writes

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function useBeatsHid(doc: GrooveDoc, enabled: boolean) {
  const [status, setStatus] = useState<string | null>(null);
  const hidRef = useRef<BeatsHid | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const connect = useCallback(async () => {
    if (hidRef.current) return;
    setHidLabsEnabled(true);
    const hid = await initBeatsHid();
    if (!hid) { setStatus('No NI device — close NI background services and retry'); return; }
    hidRef.current = hid;
    setStatus(`Connected: ${hid.deviceName}`);
    hid.onPadHit((padIdx, velocity) => {
      const engine = BeatsEngine.get();
      void engine.init().then(() => engine.trigger(padIdx, velocity));
    });
  }, []);

  useEffect(() => {
    if (!enabled || !hidLabsEnabled()) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const hid = hidRef.current;
      if (!hid || t - last < 1000 / LED_FPS) return;
      last = t;
      const engine = BeatsEngine.get();
      const now = performance.now();
      for (let i = 0; i < 16; i++) {
        const pad = docRef.current.kit[i];
        if (!pad) continue;
        const lit = now - engine.lastHit[i] < HIT_GLOW_MS;
        hid.setPadColor(i, lit ? [255, 140, 0] : hexToRgb(pad.color), lit ? 3 : pad.mute ? 0 : 1);
      }
      hid.flushPads();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  useEffect(() => () => { hidRef.current?.dispose(); hidRef.current = null; }, []);

  return { connect, status, connected: !!hidRef.current };
}
