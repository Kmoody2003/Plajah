// ButterchurnLayer — renders Milkdrop presets via butterchurn (open-source, WebGL).
// Driven by the SHARED analyser. Lazy-loaded. Includes GPU perf hints + thumbnail capture.

import React, { useEffect, useRef } from 'react';

interface Props {
  analyser:       AnalyserNode;
  presetIndex:    number;
  blendSeconds?:  number;
  /** Reports the loaded preset count + current preset name back to the UI. */
  onMeta?:        (meta: { count: number; name: string }) => void;
  /** Called after each preset settles with a JPEG thumbnail dataURL. */
  onThumbnail?:   (name: string, dataUrl: string) => void;
}

const ButterchurnLayer: React.FC<Props> = ({
  analyser, presetIndex, blendSeconds = 2.0, onMeta, onThumbnail,
}) => {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const vizRef         = useRef<any>(null);
  const namesRef       = useRef<string[]>([]);
  const presetsRef     = useRef<Record<string, any> | null>(null);
  const rafRef         = useRef<number>(0);
  const cleanupRef     = useRef<() => void>(() => {});
  const thumbnailsRef  = useRef<Record<string, string>>({});
  const thumbTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Capture a thumbnail for the current preset (debounced).
  const captureThumbnail = (name: string, delay: number) => {
    if (thumbnailsRef.current[name]) return; // already captured
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    thumbTimerRef.current = setTimeout(() => {
      const canvas = canvasRef.current;
      const viz = vizRef.current;
      if (!canvas || !viz) return;
      // Render a few extra frames so the preset has settled
      try {
        for (let i = 0; i < 5; i++) viz.render();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
        thumbnailsRef.current[name] = dataUrl;
        onThumbnail?.(name, dataUrl);
      } catch { /* canvas may be tainted or context lost */ }
    }, delay);
  };

  // Init once (per analyser).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        // Hint the browser to use the high-performance GPU for this canvas
        // before butterchurn creates its own WebGL context.
        canvas.getContext('webgl2', {
          powerPreference: 'high-performance',
          antialias: false,
          alpha: true,
        });

        const [bcMod, presetMod] = await Promise.all([
          import('butterchurn'),
          import('butterchurn-presets'),
        ]);
        if (cancelled) return;

        const butterchurn: any = (bcMod as any).default || bcMod;
        const presetApi: any   = (presetMod as any).default || presetMod;
        const presets: Record<string, any> = (presetApi.getPresets ? presetApi.getPresets() : presetApi) || {};
        presetsRef.current = presets;
        namesRef.current   = Object.keys(presets);

        const ctx = analyser.context as AudioContext;
        const w = window.innerWidth, h = window.innerHeight;
        const viz = butterchurn.createVisualizer(ctx, canvas, {
          width: w, height: h,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          textureRatio: 2, // higher-quality textures on HiDPI
        });
        viz.connectAudio(analyser);
        vizRef.current = viz;
        applyPreset(presetIndex, 0);

        const render = () => {
          try { vizRef.current?.render(); } catch { /* frame skip */ }
          rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);

        // First thumbnail after initial preset settles
        const initName = namesRef.current[
          ((presetIndex % namesRef.current.length) + namesRef.current.length) % namesRef.current.length
        ];
        captureThumbnail(initName, 500);

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
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
      cleanupRef.current();
      vizRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyser]);

  // React to preset changes.
  useEffect(() => {
    applyPreset(presetIndex, blendSeconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetIndex]);

  function applyPreset(index: number, blend: number) {
    const presets = presetsRef.current, viz = vizRef.current, names = namesRef.current;
    if (!presets || !viz || names.length === 0) return;
    const name = names[((index % names.length) + names.length) % names.length];
    try { viz.loadPreset(presets[name], blend); } catch { /* */ }
    onMeta?.({ count: names.length, name });
    // Capture thumbnail for newly loaded preset (300ms debounce)
    captureThumbnail(name, 300);
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 1, willChange: 'transform', imageRendering: 'auto' }}
    />
  );
};

export default ButterchurnLayer;
