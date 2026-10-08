import React, { useEffect, useRef, useState } from 'react';
import { Zap, Keyboard } from 'lucide-react';
import { Button } from '../ui';
import Sheet from './Sheet';

/**
 * Phone-camera barcode scanner — the ONE scanner for the platform (inventory receiving, the register, the
 * product editor). Uses the browser's native BarcodeDetector where it exists (Chrome/Android) and falls back to
 * the `barcode-detector` ponyfill (zxing, WASM) so iPhones/Safari work too. Always offers "type it in", because
 * cameras fail (permissions, glare, a scuffed label) and the job must still be doable.
 */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

async function makeDetector(): Promise<any> {
  const Native = (window as any).BarcodeDetector;
  if (Native) {
    try {
      const supported: string[] = await Native.getSupportedFormats?.() ?? FORMATS;
      const formats = FORMATS.filter(f => supported.includes(f));
      if (formats.length) return new Native({ formats });
    } catch { /* fall through to the ponyfill */ }
  }
  const mod = await import('barcode-detector/ponyfill');
  return new mod.BarcodeDetector({ formats: FORMATS as any });
}

const beep = () => {
  try { navigator.vibrate?.(60); } catch { /* not supported */ }
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 1100; g.gain.value = 0.06; o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 90);
  } catch { /* silent is fine */ }
};

const BarcodeScanner: React.FC<{
  title?: string;
  hint?: string;
  /** Keep scanning after each hit (receiving a whole delivery) instead of closing. */
  continuous?: boolean;
  onDetect: (code: string) => void;
  onClose: () => void;
}> = ({ title = 'Scan a barcode', hint = 'Point your camera at the barcode', continuous, onDetect, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'unsupported'>('starting');
  const [manual, setManual] = useState('');
  const [last, setLast] = useState('');
  const [torch, setTorch] = useState(false);
  const [canTorch, setCanTorch] = useState(false);
  const onDetectRef = useRef(onDetect); onDetectRef.current = onDetect;

  useEffect(() => {
    let stopped = false, raf = 0, lastCode = '', lastAt = 0;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setStatus('unsupported'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        setCanTorch(!!(track.getCapabilities?.() as any)?.torch);
        const v = videoRef.current!; v.srcObject = stream; await v.play().catch(() => {});
        const det = await makeDetector();
        if (stopped) return;
        setStatus('scanning');
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              const hits = await det.detect(v);
              const code = hits?.[0]?.rawValue as string | undefined;
              const now = Date.now();
              if (code && (code !== lastCode || now - lastAt > 2000)) {
                lastCode = code; lastAt = now; beep(); setLast(code);
                onDetectRef.current(code);
                if (!continuous) return;                     // single-shot: caller closes us
              }
            }
          } catch { /* a bad frame — keep going */ }
          raf = window.setTimeout(tick, 120) as unknown as number;
        };
        tick();
      } catch (e: any) { setStatus(e?.name === 'NotAllowedError' ? 'denied' : 'unsupported'); }
    })();
    return () => { stopped = true; clearTimeout(raf); streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
  }, [continuous]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    try { await track?.applyConstraints({ advanced: [{ torch: !torch } as any] }); setTorch(t => !t); } catch { /* unsupported */ }
  };
  const submitManual = () => { const c = manual.trim(); if (c) { onDetect(c); setManual(''); } };

  return (
    <Sheet title={title} eyebrow="Scanner" onClose={onClose}>
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        {status === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none grid place-items-center">
            <div className="rounded-2xl" style={{ width: '72%', height: '38%', border: '2px solid var(--pj-orange)', boxShadow: '0 0 0 9999px rgba(0,0,0,.35)' }} />
          </div>
        )}
        {status !== 'scanning' && (
          <div className="absolute inset-0 grid place-items-center text-center p-6">
            <p className="type-body-md" style={{ color: '#fff' }}>
              {status === 'starting' ? 'Starting camera…' : status === 'denied' ? 'Camera access is blocked. Allow it in your browser settings — or type the code below.' : 'This device can\'t scan here. Type the code below instead.'}
            </p>
          </div>
        )}
        {canTorch && status === 'scanning' && (
          <button type="button" onClick={toggleTorch} aria-pressed={torch} aria-label="Toggle flashlight" className="absolute right-3 bottom-3 w-10 h-10 rounded-full grid place-items-center" style={{ background: torch ? 'var(--pj-orange)' : 'rgba(0,0,0,.6)' }}><Zap size={18} color={torch ? '#000' : '#fff'} /></button>
        )}
      </div>
      <p className="type-body-sm mt-2 text-center" role="status" style={{ color: 'var(--on-surface-variant)' }}>{last ? `Last scanned: ${last}` : hint}</p>
      <div className="flex gap-2 mt-4">
        <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitManual()} inputMode="numeric" className="pj-input flex-1 min-w-0" placeholder="Or type the code" aria-label="Type barcode" />
        <Button variant="secondary" size="md" icon={<Keyboard />} disabled={!manual.trim()} onClick={submitManual}>Use</Button>
      </div>
    </Sheet>
  );
};

export default BarcodeScanner;
