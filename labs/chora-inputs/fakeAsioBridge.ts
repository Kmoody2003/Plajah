// LAB ONLY — a stand-in for the desktop app's WebView2 bridge so the Hardware inputs panel and the
// multitrack record → import flow can be exercised in a plain browser. It answers the same ASIO_*
// messages AsioMultitrackRecorder.cs does, with clearly simulated drivers and synthesized tones.
// The real path is verified separately by windows-native/tools/AsioCapture on real drivers.
import { encodeWavFloat } from '../../services/melos/beats/mixerLink/takeImport';

const SIM = 'Lab StudioLive Series III ASIO (simulated)';
const UNPLUGGED = 'Lab Unplugged ASIO (simulated)';
const NAMES = ['Kick', 'Snare', 'Hi-Hat', 'Tom 1', 'Tom 2', 'OH L', 'OH R', 'Bass DI', 'Gtr 1', 'Gtr 2', 'Keys L', 'Keys R', 'Pastor', 'Lead Vox', 'BGV 1', 'BGV 2'];

export function installFakeAsioBridge(): void {
  const listeners = new Set<(e: MessageEvent) => void>();
  const send = (msg: object) => setTimeout(() => listeners.forEach((l) => l(new MessageEvent('message', { data: JSON.stringify(msg) }))), 5);
  let session: { takeId: string; inputs: number[]; rate: number; write: boolean; startMs: number; timer: number } | null = null;

  const stop = (takeId?: string) => {
    if (!session || (takeId && session.takeId !== takeId)) return { ok: false, takeId: takeId ?? '', sampleRate: 0, durationSec: 0, droppedFrames: 0, clippedInputs: [], error: 'Not running', files: [], firstBufferMs: 0, bufferFrames: 0 };
    const s = session; session = null; clearInterval(s.timer);
    const secs = (Date.now() - s.startMs) / 1000;
    const frames = Math.round(secs * s.rate);
    const files = s.write ? s.inputs.map((input) => {
      const pcm = new Float32Array(frames);
      const f = 110 * (1 + input * 0.25);
      for (let i = 0; i < frames; i++) pcm[i] = 0.3 * Math.sin((2 * Math.PI * f * i) / s.rate) * (0.5 + 0.5 * Math.sin((2 * Math.PI * 2 * i) / s.rate));
      const url = URL.createObjectURL(new Blob([encodeWavFloat([pcm], s.rate)], { type: 'audio/wav' }));
      return { input, path: `C:\LabTakes\${s.takeId}\${String(input + 1).padStart(2, '0')}.wav`, url, frames };
    }) : [];
    return { ok: true, takeId: s.takeId, sampleRate: s.rate, durationSec: secs, droppedFrames: 0, clippedInputs: [], error: null, files, firstBufferMs: s.startMs + 11, bufferFrames: 512 };
  };

  (window as any).chrome = {
    webview: {
      addEventListener: (_: string, l: (e: MessageEvent) => void) => listeners.add(l),
      removeEventListener: (_: string, l: (e: MessageEvent) => void) => listeners.delete(l),
      postMessage: (raw: string) => {
        const m = JSON.parse(raw);
        if (m.type === 'ASIO_DRIVERS') send({ type: 'ASIO_DRIVERS_RESULT', drivers: [SIM, UNPLUGGED] });
        else if (m.type === 'ASIO_PROBE') send(m.driver === SIM
          ? { type: 'ASIO_PROBE_RESULT', driver: m.driver, ok: !session, error: session ? 'A capture is running' : null, inputs: 16, outputs: 16, inputNames: NAMES, sampleRates: [44100, 48000, 96000] }
          : { type: 'ASIO_PROBE_RESULT', driver: m.driver, ok: false, error: 'No device is connected to the PC.', inputs: 0, outputs: 0, inputNames: [], sampleRates: [] });
        else if (m.type === 'ASIO_REC_START') {
          if (session) stop();
          const timer = window.setInterval(() => send({ type: 'ASIO_LEVELS', takeId: m.takeId, inputs: m.inputs, peaks: m.inputs.map((i: number) => 0.15 + 0.5 * Math.random() * (i % 3 === 0 ? 1 : 0.4)) }), 66);
          session = { takeId: m.takeId, inputs: m.inputs, rate: m.sampleRate, write: m.write, startMs: Date.now(), timer };
          (window as any).__labAsio = { last: m };
          send({ type: 'ASIO_REC_START_RESULT', ok: true, takeId: m.takeId, startedAtMs: Date.now(), inputs: m.inputs });
        } else if (m.type === 'ASIO_REC_STOP') send({ type: 'ASIO_REC_STOP_RESULT', ...stop(m.takeId) });
      },
    },
  };
}
