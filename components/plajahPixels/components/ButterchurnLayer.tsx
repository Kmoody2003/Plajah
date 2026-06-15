// ButterchurnLayer — renders Milkdrop presets via butterchurn (open-source,
// WebGL). Driven by the SHARED analyser (so it reacts to the same audio as the
// rest of Plajah Pixels). Lazy-loaded: the heavy engine + preset pack only
// download when the user actually enables Milkdrop.

import React, { useEffect, useRef } from 'react';

interface Props {
  analyser: AnalyserNode;
  presetIndex: number;
  blendSeconds?: number;
  /** Reports the loaded preset count + current preset name back to the UI. */
  onMeta?: (meta: { count: number; name: string }) => void;
}

const ButterchurnLayer: React.FC<Props> = ({ analyser, presetIndex, blendSeconds = 2.0, onMeta }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<any>(null);
  const namesRef = useRef<string[]>([]);
  const presetsRef = useRef<Record<string, any> | null>(null);
  const rafRef = useRef<number>(0);
  const cleanupRef = useRef<() => void>(() => {});

  // Init once (per analyser).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const [bcMod, presetMod] = await Promise.all([import('butterchurn'), import('butterchurn-presets')]);
        if (cancelled) return;
        const butterchurn: any = (bcMod as any).default || bcMod;
        const presetApi: any = (presetMod as any).default || presetMod;
        const presets: Record<string, any> = (presetApi.getPresets ? presetApi.getPresets() : presetApi) || {};
        presetsRef.current = presets;
        namesRef.current = Object.keys(presets);

        const ctx = analyser.context as AudioContext;
        const w = window.innerWidth, h = window.innerHeight;
        const viz = butterchurn.createVisualizer(ctx, canvas, {
          width: w, height: h,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          textureRatio: 1,
        });
        viz.connectAudio(analyser);
        vizRef.current = viz;
        applyPreset(presetIndex, 0);

        const render = () => { try { vizRef.current?.render(); } catch { /* frame skip */ } rafRef.current = requestAnimationFrame(render); };
        rafRef.current = requestAnimationFrame(render);

        const onResize = () => {
          const ww = window.innerWidth, hh = window.innerHeight;
          try { vizRef.current?.setRendererSize(ww, hh); } catch { /* */ }
        };
        window.addEventListener('resize', onResize);
        onResize();
        cleanupRef.current = () => window.removeEventListener('resize', onResize);
      } catch (e) {
        console.warn('[Plajah Pixels] Milkdrop (butterchurn) failed to load:', e);
        onMeta?.({ count: 0, name: 'unavailable' });
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      cleanupRef.current();
      vizRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyser]);

  // React to preset changes.
  useEffect(() => { applyPreset(presetIndex, blendSeconds); /* eslint-disable-next-line */ }, [presetIndex]);

  function applyPreset(index: number, blend: number) {
    const presets = presetsRef.current, viz = vizRef.current, names = namesRef.current;
    if (!presets || !viz || names.length === 0) return;
    const name = names[((index % names.length) + names.length) % names.length];
    try { viz.loadPreset(presets[name], blend); } catch { /* */ }
    onMeta?.({ count: names.length, name });
  }

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }} />;
};

export default ButterchurnLayer;
