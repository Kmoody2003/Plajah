import React, { useState } from 'react';

/**
 * Hosts the Ravencrest engine (games/ravencrest, built to /games/ravencrest/play/) inside
 * the Halloween showcase. The game picks its own quality tier: browsers on integrated GPUs
 * get the 720p + FSR1 baseline; Plajah's Windows app (WebView2, discrete GPU) gets 'ultra'.
 * Browsers without WebGPU fall back to the classic exhibition.
 */
export const RavencrestGameFrame: React.FC<{ classic: React.ReactNode; onBack: () => void }> = ({ classic, onBack }) => {
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const [mode, setMode] = useState<'game' | 'classic'>(hasWebGPU ? 'game' : 'classic');

  if (mode === 'classic') {
    return (
      <div>
        {hasWebGPU && (
          <div className="flex justify-end px-4 pb-2">
            <button onClick={() => setMode('game')} className="text-xs tracking-widest uppercase text-amber-300/80 hover:text-amber-200">
              Enter Ravencrest →
            </button>
          </div>
        )}
        {classic}
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 4rem)' }}>
      <iframe
        title="Ravencrest"
        src="/games/ravencrest/play/index.html"
        className="absolute inset-0 w-full h-full border-0 bg-black"
        allow="fullscreen; autoplay; gamepad"
        allowFullScreen
      />
      <div className="absolute top-3 left-3 flex gap-3 text-xs tracking-widest uppercase">
        <button onClick={onBack} className="px-3 py-1.5 bg-black/60 text-slate-200 hover:bg-black/80 rounded">← Vault</button>
        <button onClick={() => setMode('classic')} className="px-3 py-1.5 bg-black/60 text-slate-300 hover:bg-black/80 rounded">Classic exhibition</button>
      </div>
    </div>
  );
};
