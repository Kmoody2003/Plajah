import React, { useEffect, useState } from 'react';
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
