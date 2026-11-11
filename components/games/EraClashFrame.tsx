import React, { useEffect, useRef } from 'react';
import { auth } from '../../services/firebase';
import { BASE_ACHIEVEMENTS, unlockAchievementByTrigger } from '../../services/achievementService';
import { useAchievements } from '../../contexts/AchievementContext';
import type { AchievementTriggerType } from '../../types';
import { launchTemplateProjectInChora } from '../../services/melos/eraClashChoraLaunch';

/** The cues' Chora projects (services/melos/eraClashChoraProjects.ts), listed here so the frame stays light. */
const CHORA_PROJECTS = ['title', 'japan', 'norse', 'italy', 'aztec', 'china', 'rome'].map((c) => `eraclash-${c}`);
/** Combat Atlas arts the game links to (data/combatAtlasData.ts ids). */
const ATLAS_ARTS = ['kendo', 'glima', 'armizare', 'shaolin', 'pankration', 'nguni', 'engolo', 'eskrima', 'silat', 'muaythai', 'capoeira'];
/** CombatAtlasView's COMBAT_ATLAS_OPEN_ART_KEY (inlined so the frame doesn't load the Atlas bundle). */
const ATLAS_OPEN_ART_KEY = 'plajah.combatAtlas.openArt';

const ERA_CLASH_TRIGGERS: AchievementTriggerType[] = ['ERACLASH_FIRST_WIN', 'ERACLASH_PERFECT_VICTORY', 'ERACLASH_TALE_COMPLETE'];

/**
 * Era Clash — Plajah first-party 2D fighter (six warriors across six eras; story, vs CPU, two
 * players on one device, online duel over WebRTC). The game is one static page served at
 * /games/era-clash/index.html and runs fully standalone; this frame only hosts it.
 *
 * Bridge: outside 2P mode the game posts {type:'plajah.achievement', gameId:'era-clash', trigger}
 * and {type:'plajah.xp', ...}. Achievements from our own iframe (same origin + same window) are saved
 * on the player's Plajah profile and toasted. XP stays in the game's session profile for now.
 *
 * {type:'plajah.openChoraProject', id:'eraclash-<cue>'} opens that arena cue's Chora Studio project (a
 * fresh copy of the showcase template; the game's music is a bounce of it). {type:'plajah.openAtlas',
 * art:'<CombatArt id>'} opens Museion's Combat Atlas (Labs discipline 'combat') on that art. Both leave
 * the game for the app view they open.
 */
export default function EraClashFrame({ onExit }: { onExit: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { registerAndUnlock } = useAchievements();

  useEffect(() => {
    const seen = new Set<string>();
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string; gameId?: string; trigger?: unknown; eventId?: unknown; id?: unknown; art?: unknown } | null;
      if (d?.type === 'plajah.openChoraProject') {
        if (typeof d.id === 'string' && CHORA_PROJECTS.includes(d.id)) launchTemplateProjectInChora(d.id);
        return;
      }
      if (d?.type === 'plajah.openAtlas') {
        if (typeof d.art !== 'string' || !ATLAS_ARTS.includes(d.art)) return;
        try { sessionStorage.setItem(ATLAS_OPEN_ART_KEY, d.art); } catch { /* storage blocked: the Atlas opens on its overview */ }
        window.dispatchEvent(new CustomEvent('OPEN_LABS_DISCIPLINE', { detail: { disciplineId: 'combat' } }));
        return;
      }
      if (d?.type !== 'plajah.achievement' || d.gameId !== 'era-clash') return;
      if (!ERA_CLASH_TRIGGERS.includes(d.trigger as AchievementTriggerType)) return;
      const key = typeof d.eventId === 'string' ? d.eventId : String(d.trigger);
      if (seen.has(key)) return;
      seen.add(key);
      const trigger = d.trigger as AchievementTriggerType;
      const def = BASE_ACHIEVEMENTS.find((a) => a.triggerType === trigger);
      if (def) registerAndUnlock({ ...def, id: trigger });
      const uid = auth.currentUser?.uid;
      if (uid) unlockAchievementByTrigger(uid, trigger).catch(() => {});
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [registerAndUnlock]);

  // Full window while playing; Plajah's chrome is covered and the page stops scrolling underneath.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[10000] bg-black">
      <iframe
        ref={frame}
        title="Era Clash"
        src="/games/era-clash/index.html"
        className="absolute inset-0 w-full h-full border-0"
        allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write"
        allowFullScreen
        onLoad={() => frame.current?.focus()}
      />
      <button
        onClick={onExit}
        title="Exit Era Clash"
        className="absolute bottom-3 right-3 px-3 py-1.5 text-xs tracking-widest uppercase bg-black/60 text-slate-200 hover:bg-black/85 hover:text-white rounded"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        Exit ✕
      </button>
    </div>
  );
}
