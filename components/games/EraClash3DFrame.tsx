import React, { useEffect, useRef } from 'react';

/**
 * Era Clash: Tales of the Ages (3D Campaign) — standalone WebGPU / Three.js campaign
 * served at /games/era-clash/3d/play/index.html.
 */
export default function EraClash3DFrame({ onExit }: { onExit: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string } | null;
      if (d?.type === 'eraclash3d:exit' || d?.type === 'plajah.exit') onExit();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onExit]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[10000] bg-black">
      <iframe
        ref={frame}
        title="Era Clash 3D Campaign"
        src="/games/era-clash/3d/play/index.html"
        className="absolute inset-0 w-full h-full border-0"
        allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write"
        allowFullScreen
        onLoad={() => frame.current?.focus()}
      />
      <button
        onClick={onExit}
        title="Exit Era Clash 3D"
        className="absolute bottom-3 right-3 px-3 py-1.5 text-xs tracking-widest uppercase bg-black/70 text-amber-100 hover:bg-black/90 hover:text-white rounded border border-amber-500/30"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        Exit ✕
      </button>
    </div>
  );
}
