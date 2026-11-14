// The LD screen. One running board with two faces: Simple for anyone who just wants the lights to
// look good, Pro for a lighting director. Flipping between them never touches what's on stage.

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lightbulb } from 'lucide-react';
import { boardEngine, useBoard } from '../../services/lighting/boardEngine';
import { useLightingService } from '../../services/smartLightingService';
import { SimpleBoard } from './SimpleBoard';
import { ProBoard } from './ProBoard';

type Mode = 'simple' | 'pro';
const MODE_KEY = 'plajah.lightboard.mode';

const readMode = (): Mode => {
  try { return localStorage.getItem(MODE_KEY) === 'pro' ? 'pro' : 'simple'; } catch { return 'simple'; }
};

export interface LightBoardProps {
  onClose?: () => void;
  /** The smart-light connection flow; left out where there's no such flow, like the lab. */
  renderSmartConnect?: (onClose: () => void) => React.ReactNode;
  nowPlaying?: string;
}

export function LightBoard({ onClose, renderSmartConnect, nowPlaying }: LightBoardProps) {
  const board = useBoard();
  const smart = useLightingService();
  const [mode, setMode] = useState<Mode>(readMode);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    boardEngine.start();
    void boardEngine.pullFromCloud();
    return () => boardEngine.release();
  }, []);

  useEffect(() => { boardEngine.syncSmartLights(); }, [smart.lights.length]);

  const choose = (next: Mode) => {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* remembered for this visit only */ }
  };

  const openSmart = renderSmartConnect ? () => setConnecting(true) : undefined;
  const live = board.outputs.filter((o) => o.status === 'live').length;
  const dmxCount = board.show.fixtures.filter((f) => !f.smartId).length;
  const status = live ? `${live} output${live > 1 ? 's' : ''} live`
    : dmxCount ? 'Stage lights not connected' : '';

  return (
    <div data-testid="light-board" className="relative flex flex-col h-full w-full bg-[#08070b] text-white overflow-hidden font-sans">
      <header className="flex items-center gap-3 px-3 md:px-4 h-12 border-b border-white/10 shrink-0">
        {onClose && (
          <button onClick={onClose} aria-label="Back" className="p-2 -ml-1 rounded-lg hover:bg-white/10"><ArrowLeft size={18} /></button>
        )}
        <Lightbulb size={18} className="text-[#FF8C00] shrink-0" />
        <h1 className="text-sm font-semibold truncate">Lighting</h1>
        {status && (
          <span className={`hidden sm:inline text-xs truncate ${live ? 'text-emerald-400' : 'text-white/50'}`}>{status}</span>
        )}
        <div role="tablist" aria-label="Board mode" className="ml-auto flex p-0.5 rounded-lg bg-white/[0.07] shrink-0">
          {(['simple', 'pro'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => choose(m)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${mode === m ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}>
              {m === 'simple' ? 'Simple' : 'Pro'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0">
        {mode === 'simple'
          ? <SimpleBoard onConnectSmart={openSmart} nowPlaying={nowPlaying} onOpenPro={() => choose('pro')} />
          : <ProBoard onConnectSmart={openSmart} />}
      </div>

      {connecting && renderSmartConnect?.(() => setConnecting(false))}
    </div>
  );
}
