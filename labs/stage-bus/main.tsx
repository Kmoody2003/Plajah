// Stage bus lab. The studio half here wires the same pieces AmboProPresenter does: one master
// LayerRenderer registered as the Program bus, sized by the first PROGRAM output, an OutputRouter
// broadcasting state, output metrics coming back. Iframes stand in for physical displays, each
// running the real AmboOutputWindow page at its own viewport.
//   ?amboOut=<id>  renders that output window (what an iframe loads)
//   window.busLab: outputs(), setOutputs(fn), frames(), probe()
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AmboOutputWindow from '../../components/scripture/AmboOutputWindow';
import AmboHorizontalMultiview from '../../components/scripture/AmboHorizontalMultiview';
import AmboOutputFitControl from '../../components/scripture/AmboOutputFitControl';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import { OutputRouter, makeOutput, type AmboOutput } from '../../services/ambo/outputRouter';
import { installProgramBusRtcHost, getProgramBusStream, notifyProgramBusFrame, registerProgramBusCanvas } from '../../services/ambo/programBus';
import { busRenderSize, busFormatLabel } from '../../services/ambo/busFormat';
import type { LiveStack } from '../../services/ambo/showModel';

/** A 16:9 test card: circle stays round and the edge ticks show what got cropped or barred. */
function testCard(): string {
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#0d3b66'); g.addColorStop(1, '#c1125c');
  x.fillStyle = g; x.fillRect(0, 0, 1920, 1080);
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2;
  for (let i = 0; i <= 1920; i += 120) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 1080); x.stroke(); }
  for (let i = 0; i <= 1080; i += 120) { x.beginPath(); x.moveTo(0, i); x.lineTo(1920, i); x.stroke(); }
  x.strokeStyle = '#fff'; x.lineWidth = 10; x.beginPath(); x.arc(960, 540, 400, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#fff'; x.font = '700 90px sans-serif'; x.textAlign = 'center'; x.fillText('16:9 MEDIA', 960, 570);
  return c.toDataURL('image/png');
}

const params = new URLSearchParams(location.search);

const DISPLAYS: Array<{ id: string; w: number; h: number; label: string }> = [
  { id: 'out_program', w: 480, h: 300, label: '16:10 projector' },
  { id: 'out_aux_wide', w: 640, h: 180, label: '32:9 ultrawide' },
  { id: 'out_ribbon', w: 480, h: 270, label: '16:9 screen, bus fixed 4:1' },
  { id: 'out_portrait', w: 180, h: 320, label: 'portrait 9:16 screen' },
  { id: 'out_square', w: 280, h: 280, label: '1:1 LED cabinet' },
  // The Program projector's shape, so only their layers can set them apart from the master.
  { id: 'out_share', w: 480, h: 300, label: '16:10, Program layers: shares the master' },
  { id: 'out_lobby', w: 480, h: 300, label: '16:10, LOOP: background only' },
  { id: 'out_signs', w: 480, h: 300, label: '16:10, SIGNAGE: no scripture' },
];

const Studio: React.FC = () => {
  const [outputs, setOutputs] = useState<AmboOutput[]>(() => [
    makeOutput('PROGRAM', 'Program Out', { id: 'out_program' }),
    makeOutput('AUX', 'Aux / Overflow', { id: 'out_aux_wide' }),
    makeOutput('STREAM', 'Stream Bus', { id: 'out_stream', autoDetectDisplay: false, width: 1080, height: 1920, aspectRatio: '9:16' }),
    makeOutput('LED_WALL', 'LED Ribbon', { id: 'out_ribbon', autoDetectDisplay: false, width: 4320, height: 1080, aspectRatio: '4:1' }),
    makeOutput('SIGNAGE', 'Portrait', { id: 'out_portrait' }),
    makeOutput('LOOP', 'Square', { id: 'out_square', autoDetectDisplay: false, width: 1080, height: 1080, aspectRatio: '1:1' }),
    makeOutput('STREAM', 'Same Layers', { id: 'out_share' }),
    makeOutput('LOOP', 'Lobby Loop', { id: 'out_lobby' }),
    makeOutput('SIGNAGE', 'Hall Signs', { id: 'out_signs' }),
  ]);
  const card = useMemo(testCard, []);
  const stack = useMemo<LiveStack>(() => ({
    background: { content: { kind: 'IMAGE', src: card }, since: 1 } as any,
    scripture: { content: { kind: 'TEXT', blocks: [{ text: 'Words re-flow to every bus', role: 'body' }] }, since: 1 } as any,
  }), [card]);

  const routerRef = useRef<OutputRouter | null>(null);
  if (!routerRef.current) routerRef.current = new OutputRouter(outputs);
  useEffect(() => { routerRef.current!.outputs = outputs; routerRef.current!.send(stack, { elapsed: 0 }); }, [outputs, stack]);

  const pgm = outputs.find(o => o.kind === 'PROGRAM') || outputs[0];
  const size = busRenderSize(pgm.width || 1920, pgm.height || 1080);
  const rendererRef = useRef<LayerRenderer | null>(null);
  useEffect(() => {
    const c = document.createElement('canvas');
    const r = new LayerRenderer(c, size);
    r.setOptions({ fit: pgm.fit, outputTransform: pgm.transform, onFrame: () => notifyProgramBusFrame() });
    r.setStack(stack); r.start();
    rendererRef.current = r;
    const un = registerProgramBusCanvas(c);
    (window as any).busLab.master = c;
    const unRtc = installProgramBusRtcHost(() => getProgramBusStream(), m => {
      setOutputs(prev => prev.map(o => {
        if (o.id !== m.outputId || o.autoDetectDisplay === false) return o;
        if (o.width === m.width && o.height === m.height) return o;
        return { ...o, width: m.width, height: m.height, aspectRatio: m.aspectRatio };
      }));
    });
    return () => { unRtc(); un(); r.dispose(); };
  }, []);
  useEffect(() => { rendererRef.current?.resize(size.w, size.h); }, [size.w, size.h]);
  useEffect(() => { rendererRef.current?.setOptions({ fit: pgm.fit, outputTransform: pgm.transform }); }, [pgm.fit, pgm.transform]);

  (window as any).busLab.outputs = () => outputs;
  (window as any).busLab.setOutputs = setOutputs;

  return (
    <div style={{ color: '#fff', font: '12px system-ui', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b>Stage bus lab</b>
        <AmboOutputFitControl outputs={outputs} setOutputs={setOutputs} />
      </div>
      <AmboHorizontalMultiview liveStack={stack} previewStack={stack} elapsedSec={0} outputs={outputs} isCollapsed={false} onToggleCollapse={() => {}} height={230} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        {DISPLAYS.map(d => {
          const o = outputs.find(x => x.id === d.id);
          return (
            <div key={d.id} data-display={d.id}>
              <div style={{ marginBottom: 3, opacity: .75 }}>{d.label} → {o ? busFormatLabel(o) : '—'}</div>
              <iframe title={d.id} src={`${location.pathname}?amboOut=${d.id}`} width={d.w} height={d.h} style={{ border: '1px solid #f0f', display: 'block', background: '#300' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

(window as any).busLab = {
  /** For each display, the canvas's drawn rect against its window, and the visible black side bars. */
  frames() {
    return DISPLAYS.map(d => {
      const f = document.querySelector<HTMLIFrameElement>(`[data-display="${d.id}"] iframe`);
      const doc = f?.contentDocument, c = doc?.querySelector('canvas');
      if (!f || !c) return { id: d.id, missing: true };
      const small = document.createElement('canvas'); small.width = 64; small.height = 64;
      const x = small.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(c, 0, 0, 64, 64);
      const lum = (px: number, py: number) => { const p = x.getImageData(px, py, 1, 1).data; return p[0] + p[1] + p[2]; };
      return {
        id: d.id, window: `${f.width}x${f.height}`, canvas: `${c.width}x${c.height}`, objectFit: c.style.objectFit,
        source: c.dataset.busSource,
        // Non-zero on both edges = the picture reaches the edges of the bus: no pillars or letterbox bars in it.
        edge: { left: lum(1, 32), right: lum(62, 32), top: lum(32, 1), bottom: lum(32, 62) },
      };
    });
  },
};

const id = params.get('amboOut');
// ?real=1 mounts the real Stage studio (signed out: its default buses) to exercise its own wiring.
const RealStudio = React.lazy(() => import('../../components/scripture/AmboProPresenter'));
createRoot(document.getElementById('root')!).render(
  id ? <AmboOutputWindow outputId={id} />
    : params.get('real') ? <React.Suspense fallback={null}><div style={{ height: '100vh' }}><RealStudio {...({ onClose: () => {} } as any)} /></div></React.Suspense>
    : <Studio />,
);
