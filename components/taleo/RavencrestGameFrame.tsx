import React, { useEffect, useRef, useState } from 'react';
import { auth } from '../../services/firebase';
import { BASE_ACHIEVEMENTS, unlockAchievementByTrigger } from '../../services/achievementService';
import { useAchievements } from '../../contexts/AchievementContext';
import type { AchievementTriggerType } from '../../types';

const RAVENCREST_TRIGGERS: AchievementTriggerType[] = ['RAVENCREST_TROLL_SLAYER', 'RAVENCREST_DRACULA_SLAIN', 'RAVENCREST_CURSE_BREAKER'];

/**
 * Hosts the Ravencrest engine (games/ravencrest, built to /games/ravencrest/play/) inside
 * the Halloween showcase. The game picks its own quality tier: browsers on integrated GPUs
 * get the 720p + FSR1 baseline; Plajah's Windows app (WebView2, discrete GPU) gets 'ultra'.
 * Browsers without WebGPU fall back to the classic exhibition.
 *
 * The game's billboards, paintings and encounter cards post {type:'ravencrest:watch', id}
 * (same origin only); `onWatch` opens that film in the Cinema player. Boss victories post
 * {type:'ravencrest:achievement', trigger}: saved on the player's Plajah profile and toasted.
 */
export const RavencrestGameFrame: React.FC<{ classic: React.ReactNode; onBack: () => void; onWatch?: (filmId: string, timecode?: string) => void }> = ({ classic, onBack, onWatch }) => {
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const [mode, setMode] = useState<'game' | 'classic'>(hasWebGPU ? 'game' : 'classic');
  const { registerAndUnlock } = useAchievements();

  // Achievements from the game: Troll Slayer, Dracula Slain, Curse Breaker.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; trigger?: unknown } | null;
      if (d?.type !== 'ravencrest:achievement' || !RAVENCREST_TRIGGERS.includes(d.trigger as AchievementTriggerType)) return;
      const trigger = d.trigger as AchievementTriggerType;
      const def = BASE_ACHIEVEMENTS.find((a) => a.triggerType === trigger);
      if (def) registerAndUnlock({ ...def, id: trigger });
      const uid = auth.currentUser?.uid;
      if (uid) unlockAchievementByTrigger(uid, trigger).catch(() => {});
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [registerAndUnlock]);

  // The game's pause screen has "Exit to Plajah": it posts ravencrest:exit.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { type?: string } | null)?.type === 'ravencrest:exit') onBack();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onBack]);

  // Full window while playing: the game covers Plajah's chrome and the page stops scrolling underneath.
  // Entering also asks for real full screen (the Explore click is still the user gesture); if the
  // browser says no, the full-window layer stands. Leaving the game leaves full screen.
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== 'game') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    layer.current?.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    return () => {
      document.body.style.overflow = prev;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [mode]);

  useEffect(() => {
    if (!onWatch) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; id?: unknown; timecode?: unknown } | null;
      if (d?.type === 'ravencrest:watch' && typeof d.id === 'string') onWatch(d.id, typeof d.timecode === 'string' ? d.timecode : undefined);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onWatch]);

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
    <div ref={layer} className="fixed inset-0 z-[10000] bg-black">
      <iframe
        title="Ravencrest"
        src="/games/ravencrest/play/index.html"
        className="absolute inset-0 w-full h-full border-0 bg-black"
        allow="fullscreen; autoplay; gamepad; xr-spatial-tracking"
        allowFullScreen
        ref={(el) => { el?.focus(); }}
      />
      {/* Pause and exit live in the game (Esc / P); this is the always-visible way out. */}
      <button
        onClick={onBack}
        title="Exit Ravencrest"
        className="absolute top-3 right-3 px-3 py-1.5 text-xs tracking-widest uppercase bg-black/50 text-slate-300 hover:bg-black/80 hover:text-white rounded"
      >
        Exit ✕
      </button>
    </div>
  );
};
