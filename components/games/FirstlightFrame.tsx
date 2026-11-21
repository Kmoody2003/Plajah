// Project Firstlight (Plajah Sports) launched from the Games page and the TV hub: the game itself is
// components/sports/firstlight/FirstlightGame.tsx (also embedded on the Sports page); this only gives it a
// full-screen stage and a way back.

import React from 'react';
import { ArrowLeft } from 'lucide-react';

const FirstlightGame = React.lazy(() => import('../sports/firstlight/FirstlightGame'));

/** `backButton={false}` when the host already draws its own exit (the TV hub does). */
export default function FirstlightFrame({ onExit, backButton = true }: { onExit: () => void; backButton?: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden" style={{ background: '#020617' }}>
      <div className="w-full">
        <React.Suspense fallback={<p role="status" className="p-8 text-center text-white/70">Preparing the field…</p>}>
          <FirstlightGame />
        </React.Suspense>
      </div>
      {backButton && <button
        type="button"
        onClick={onExit}
        aria-label="Back to Games"
        title="Back to Games"
        className="absolute z-[70] flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-slate-950/85 text-white hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 6px)', left: 'calc(env(safe-area-inset-left, 0px) + 6px)' }}
      >
        <ArrowLeft size={16} />
      </button>}
    </div>
  );
}
