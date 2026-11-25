/**
 * Plajah Academia & Elevate Games — Unified Handmade Vertical Slice Shell (Phase 0).
 *
 * Connects:
 *  - All 6 handmade painted worlds (Reading, Math, Science, 9–12 Studio, History, Elevate Preview)
 *  - Private Ora "Weather Inside You" check-in (strictly local, zero teacher/parent exposure)
 *  - Automatic Affective Frustration Grace -> Tea-House Pause (Ma Moment) & Dusk Bell ritual
 *  - Playable 13-Seat Plajah Education Council ("Mentor Guild") Socratic hint drawer
 *  - Persistent Living Field Journal with Lorea keepsake book export
 *  - UDL Accessibility controls (dyslexia spacing, reduced motion, sound, Voca voice consent)
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Accessibility,
  BookMarked,
  Clapperboard,
  Clock,
  GraduationCap,
  HeartHandshake,
  Lock,
  Sparkles,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import {
  DEFAULT_UDL_PREFS,
  type FluxStudioQuest,
  type HistoryDispatchQuest,
  type JournalEntry,
  type MathWaterwheelQuest,
  type OraMood,
  type ReadingQuest,
  type ScienceBenchQuest,
  type UdlPrefs,
  type WorldId,
} from '../../services/academiaGames/contracts';
import {
  ELEVATE_QUESTS,
  FLUX_QUESTS,
  HISTORY_QUESTS,
  MATH_QUESTS,
  READING_QUESTS,
  SCIENCE_QUESTS,
  WORLD_CATALOG,
  worldMetaById,
} from '../../services/academiaGames/pedagogyEngine';
import {
  completeMaMoment,
  createPacingState,
  DUSK_BELL_MINUTES,
  moodOptionFor,
  ORA_MOOD_OPTIONS,
  recordMastery,
  recordStruggle,
} from '../../services/academiaGames/affectivePacing';
import {
  getFluxHint,
  getHistoryHint,
  getMathHint,
  getReadingHint,
  getScienceHint,
} from '../../services/academiaGames/mentorGuild';
import {
  appendJournalEntry,
  loadFieldJournal,
  saveFieldJournal,
} from '../../services/academiaGames/fieldJournal';
import { playWoodTap } from '../../services/academiaGames/acousticAudio';
import { DEFAULT_DIRECTOR_SETTINGS, type DirectorSettings } from '../../services/academiaGames/motionDirector';
import { CraftSvgFilters, DecklePaperCard, StitchedClothButton, WaxSealBadge } from './craftPrimitives';
import { MentorGuildDrawer } from './MentorGuildDrawer';
import { MotionCouncilConsole } from './MotionCouncilConsole';
import { LivingJournalModal } from './LivingJournalModal';
import { OraTeaHouseOverlay } from './OraTeaHouseOverlay';
import { ReadingBrookWorld } from './ReadingBrookWorld';
import { MathWaterwheelWorld } from './MathWaterwheelWorld';
import { ScienceBenchWorld } from './ScienceBenchWorld';
import { FluxStudioWorld } from './FluxStudioWorld';
import { HistoryAtlasWorld } from './HistoryAtlasWorld';

export const AcademiaGamesHub: React.FC = () => {
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initWorld = (initialParams?.get('world') as WorldId | null) || 'reading';
  const initOverlay = initialParams?.get('ora') === '1' ? 'pause' : null;
  const initGuides = initialParams?.get('guides') === '1';

  const [world, setWorld] = useState<WorldId>(
    WORLD_CATALOG.some(w => w.id === initWorld) ? initWorld : 'reading',
  );
  const [oraMood, setOraMood] = useState<OraMood | null>(null);
  const [pacing, setPacing] = useState(() => createPacingState());
  const [overlayMode, setOverlayMode] = useState<null | 'pause' | 'dusk-bell'>(initOverlay);
  const [mentorOpen, setMentorOpen] = useState(false);
  const [motionConsoleOpen, setMotionConsoleOpen] = useState(false);
  const [director, setDirector] = useState<DirectorSettings>(() => ({
    ...DEFAULT_DIRECTOR_SETTINGS,
    showRigGuides: initGuides,
  }));
  const [mentorTier, setMentorTier] = useState<1 | 2 | 3>(1);
  const [journalOpen, setJournalOpen] = useState(false);
  const [udlOpen, setUdlOpen] = useState(false);
  const [udl, setUdl] = useState<UdlPrefs>(DEFAULT_UDL_PREFS);
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadFieldJournal());

  // Live active-quest snapshots so the 13-seat Education Council always gives context-aware Socratic guidance
  const [activeReading, setActiveReading] = useState<ReadingQuest>(READING_QUESTS[0]);
  const [activeElevate, setActiveElevate] = useState<ReadingQuest>(ELEVATE_QUESTS[0]);
  const [activeMath, setActiveMath] = useState<{ q: MathWaterwheelQuest; a: number; b: number }>({
    q: MATH_QUESTS[0],
    a: MATH_QUESTS[0].fixedA,
    b: MATH_QUESTS[0].initialB,
  });
  const [activeScience, setActiveScience] = useState<{ q: ScienceBenchQuest; l: number; m: number; v: number }>({
    q: SCIENCE_QUESTS[0],
    l: 38,
    m: 35,
    v: 84,
  });
  const [activeFlux, setActiveFlux] = useState<{ q: FluxStudioQuest; p: number; qv: number }>({
    q: FLUX_QUESTS[0],
    p: 3,
    qv: 5,
  });
  const [activeHistory, setActiveHistory] = useState<HistoryDispatchQuest>(HISTORY_QUESTS[0]);

  const meta = worldMetaById(world);
  const activeMoodOpt = oraMood ? moodOptionFor(oraMood) : null;

  const handleStruggle = useCallback(() => {
    setPacing(prev => recordStruggle(prev, oraMood));
  }, [oraMood]);

  const handleMastery = useCallback((entry: JournalEntry) => {
    setPacing(prev => recordMastery(prev));
    setJournal(prev => {
      const next = appendJournalEntry(prev, entry);
      saveFieldJournal(next);
      return next;
    });
  }, []);

  const handleMathState = useCallback((q: MathWaterwheelQuest, a: number, b: number) => {
    setActiveMath({ q, a, b });
  }, []);
  const handleScienceState = useCallback((q: ScienceBenchQuest, l: number, m: number, v: number) => {
    setActiveScience({ q, l, m, v });
  }, []);
  const handleFluxState = useCallback((q: FluxStudioQuest, p: number, qv: number) => {
    setActiveFlux({ q, p, qv });
  }, []);

  const currentMentorHint = useMemo(() => {
    if (world === 'reading') return getReadingHint(activeReading, mentorTier);
    if (world === 'elevate') return getReadingHint(activeElevate, mentorTier);
    if (world === 'math') return getMathHint(activeMath.q, activeMath.a, activeMath.b, mentorTier);
    if (world === 'science') return getScienceHint(activeScience.q, activeScience.l, activeScience.m, activeScience.v, mentorTier);
    if (world === 'studio') return getFluxHint(activeFlux.q, activeFlux.p, activeFlux.qv, mentorTier);
    return getHistoryHint(activeHistory, mentorTier);
  }, [world, mentorTier, activeReading, activeElevate, activeMath, activeScience, activeFlux, activeHistory]);

  const switchWorld = (id: WorldId) => {
    playWoodTap(udl.soundOn, 2);
    setWorld(id);
    setOverlayMode(null);
    setMentorTier(1);
  };

  return (
    <div
      className="min-h-screen px-4 py-5 sm:px-6 text-[#EFE5D1]"
      style={{
        background:
          activeMoodOpt?.atmosphere === 'rain'
            ? 'radial-gradient(circle at top, #273138 0%, #161B20 68%)'
            : activeMoodOpt?.atmosphere === 'dusk'
              ? 'radial-gradient(circle at top, #2D2532 0%, #16131B 68%)'
              : 'radial-gradient(circle at top, #2E261E 0%, #17130F 72%)',
      }}
    >
      <CraftSvgFilters />

      <div className="max-w-[1260px] mx-auto space-y-4">
        {/* Top Artisan Atelier Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D9C6A5]/18">
          <div className="flex items-center gap-3">
            <WaxSealBadge label="PJ" color="gold" />
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-[#CBB794] font-semibold">
                Plajah Academia · Handmade Vertical Slice (Phase 0)
              </div>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#F7EFE0]" style={{ fontFamily: 'Georgia, serif' }}>
                {meta.simpleTitle} <span className="font-normal italic text-[#CEBA98] text-[17px]">— {meta.subtitle}</span>
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StitchedClothButton
              onClick={() => setMotionConsoleOpen(o => !o)}
              active={motionConsoleOpen}
              tone="indigo"
            >
              <Clapperboard size={14} /> Animation Council
            </StitchedClothButton>

            <StitchedClothButton
              onClick={() => setMentorOpen(o => !o)}
              active={mentorOpen}
              tone="linen"
            >
              <GraduationCap size={14} /> Mentor Guild
            </StitchedClothButton>

            <StitchedClothButton onClick={() => setJournalOpen(true)} tone="sage">
              <BookMarked size={14} /> Field Journal ({journal.length})
            </StitchedClothButton>

            <StitchedClothButton
              onClick={() => setOverlayMode(m => (m === 'pause' ? null : 'pause'))}
              active={pacing.maMomentSuggested || overlayMode === 'pause'}
              tone={pacing.maMomentSuggested ? 'terracotta' : 'linen'}
            >
              <Wind size={14} /> {pacing.maMomentSuggested ? 'Take a Breath?' : 'Tea-House Pause'}
            </StitchedClothButton>

            <StitchedClothButton
              onClick={() => setOverlayMode(m => (m === 'dusk-bell' ? null : 'dusk-bell'))}
              tone="indigo"
              ariaLabel="Preview Dusk Bell healthy stopping ritual"
            >
              <Clock size={14} /> Dusk Bell ({DUSK_BELL_MINUTES[meta.defaultBand]}m)
            </StitchedClothButton>

            <StitchedClothButton
              onClick={() => setUdl(u => ({ ...u, soundOn: !u.soundOn }))}
              tone="linen"
              ariaLabel="Toggle warm acoustic sound"
            >
              {udl.soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {udl.soundOn ? 'Sound On' : 'Sound Off'}
            </StitchedClothButton>

            <StitchedClothButton
              onClick={() => setUdlOpen(o => !o)}
              active={udlOpen}
              tone="linen"
              ariaLabel="Open UDL Accessibility & Voice Consent controls"
            >
              <Accessibility size={14} /> UDL
            </StitchedClothButton>
          </div>
        </header>

        {/* Private Ora "Weather Inside You" Check-In Bar + Optional UDL Tray */}
        <div className="grid lg:grid-cols-[1fr_auto] gap-3 items-center">
          <DecklePaperCard tone="linen" className="px-4 py-2.5 text-[#35261B]">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-[12px]">
                <HeartHandshake size={14} className="text-[#4E8A7E] shrink-0" />
                <span className="font-semibold" style={{ fontFamily: 'Georgia, serif' }}>
                  Ora Weather Inside You
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-[#7A644E]">
                  <Lock size={10} /> Private to you
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Private mood check-in">
                {ORA_MOOD_OPTIONS.map(opt => (
                  <button
                    key={opt.mood}
                    type="button"
                    aria-pressed={oraMood === opt.mood}
                    onClick={() => {
                      setOraMood(opt.mood);
                      playWoodTap(udl.soundOn, opt.mood);
                    }}
                    className="px-2.5 py-1 rounded text-[11.5px] font-semibold cursor-pointer transition-colors"
                    style={{
                      background: oraMood === opt.mood ? '#35261B' : 'rgba(92,70,48,0.1)',
                      color: oraMood === opt.mood ? '#F6EFE2' : '#433224',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {activeMoodOpt && (
                <span className="text-[11.5px] italic text-[#5B4837]" style={{ fontFamily: 'Georgia, serif' }}>
                  {activeMoodOpt.note}
                </span>
              )}
            </div>
          </DecklePaperCard>

          {udlOpen && (
            <DecklePaperCard tone="cream" className="px-4 py-2.5 text-[#35261B]">
              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={udl.dyslexiaSpacing}
                    onChange={e => setUdl(u => ({ ...u, dyslexiaSpacing: e.target.checked }))}
                  />
                  Wide reading spacing
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={udl.reducedMotion}
                    onChange={e => setUdl(u => ({ ...u, reducedMotion: e.target.checked }))}
                  />
                  Reduced motion
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={udl.voiceConsent}
                    onChange={e => setUdl(u => ({ ...u, voiceConsent: e.target.checked }))}
                  />
                  Voca mic consent
                </label>
              </div>
            </DecklePaperCard>
          )}
        </div>

        {/* World Navigation Tabs (Simple Craft Names — Priority 1 Academia + Phase 2 Elevate Preview) */}
        <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" aria-label="Game worlds">
          {WORLD_CATALOG.map(w => {
            const active = world === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => switchWorld(w.id)}
                className="text-left px-3.5 py-2.5 rounded-[8px] transition-all cursor-pointer"
                style={{
                  background: active ? '#F5ECDC' : 'rgba(245, 236, 220, 0.08)',
                  color: active ? '#2E2117' : '#E7DAC2',
                  border: `1.5px solid ${active ? w.accentHex : 'rgba(217, 198, 165, 0.22)'}`,
                  boxShadow: active ? '0 6px 18px rgba(0,0,0,0.3)' : 'none',
                  fontFamily: 'Georgia, serif',
                }}
              >
                <div className="text-[13.5px] font-bold">{w.simpleTitle}</div>
                <div className="text-[11px] opacity-75 truncate mt-0.5">{w.subtitle}</div>
              </button>
            );
          })}
        </nav>

        {/* Main 16:9 Living Handmade Viewport (Anima Physics/Fluids + Living Bursts/WAAPI) */}
        <main className="relative">
          {world === 'reading' && (
            <ReadingBrookWorld
              variant="reading"
              plateUrl={meta.plateUrl}
              atmosphere={activeMoodOpt?.atmosphere ?? 'sunlit'}
              director={director}
              udl={udl}
              onActiveQuestChange={setActiveReading}
              onStruggle={handleStruggle}
              onMastery={handleMastery}
            />
          )}
          {world === 'elevate' && (
            <ReadingBrookWorld
              variant="elevate"
              plateUrl={meta.plateUrl}
              atmosphere={activeMoodOpt?.atmosphere ?? 'sunlit'}
              director={director}
              udl={udl}
              onActiveQuestChange={setActiveElevate}
              onStruggle={handleStruggle}
              onMastery={handleMastery}
            />
          )}
          {world === 'math' && (
            <MathWaterwheelWorld
              plateUrl={meta.plateUrl}
              atmosphere={activeMoodOpt?.atmosphere ?? 'sunlit'}
              director={director}
              udl={udl}
              onActiveStateChange={handleMathState}
              onStruggle={handleStruggle}
              onMastery={handleMastery}
            />
          )}
          {world === 'science' && (
            <ScienceBenchWorld
              plateUrl={meta.plateUrl}
              atmosphere={activeMoodOpt?.atmosphere ?? 'sunlit'}
              director={director}
              udl={udl}
              onActiveStateChange={handleScienceState}
              onStruggle={handleStruggle}
              onMastery={handleMastery}
            />
          )}
          {world === 'studio' && (
            <FluxStudioWorld
              plateUrl={meta.plateUrl}
              atmosphere={activeMoodOpt?.atmosphere ?? 'sunlit'}
              director={director}
              udl={udl}
              onActiveStateChange={handleFluxState}
              onStruggle={handleStruggle}
              onMastery={handleMastery}
            />
          )}
          {world === 'history' && (
            <HistoryAtlasWorld
              plateUrl={meta.plateUrl}
              atmosphere={activeMoodOpt?.atmosphere ?? 'sunlit'}
              director={director}
              udl={udl}
              onActiveQuestChange={setActiveHistory}
              onStruggle={handleStruggle}
              onMastery={handleMastery}
            />
          )}

          {/* Full-Stage Ora Tea-House Pause / Dusk Bell Overlay */}
          {overlayMode && (
            <OraTeaHouseOverlay
              mode={overlayMode}
              soundOn={udl.soundOn}
              reducedMotion={udl.reducedMotion}
              director={director}
              journalCount={journal.length}
              onOpenJournal={() => setJournalOpen(true)}
              onReturn={() => {
                setOverlayMode(null);
                setPacing(prev => completeMaMoment(prev));
              }}
            />
          )}
        </main>

        {/* Footer Ecosystem Plumbing Transparency Strip */}
        <footer className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[12px] text-[#C8B89C]">
          <div className="flex flex-wrap items-center gap-1.5">
            <Sparkles size={13} className="text-[#D4A553]" />
            <span className="font-semibold">Connected Plajah Engines:</span>
            {meta.plajahEngines.map(eng => (
              <span key={eng} className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-[#D9C6A5]/20 text-[11px]">
                {eng}
              </span>
            ))}
          </div>
          <span className="italic text-[11.5px] opacity-80" style={{ fontFamily: 'Georgia, serif' }}>
            Powered by Plajah Anima Physics/Fluids &amp; Living Motion · Click or brush any scene!
          </span>
        </footer>
      </div>

      <MotionCouncilConsole
        open={motionConsoleOpen}
        world={overlayMode ? 'ora' : world}
        settings={director}
        onChange={setDirector}
        onClose={() => setMotionConsoleOpen(false)}
      />

      <MentorGuildDrawer
        open={mentorOpen}
        hint={currentMentorHint}
        tier={mentorTier}
        onSelectTier={setMentorTier}
        onClose={() => setMentorOpen(false)}
      />

      <LivingJournalModal
        open={journalOpen}
        entries={journal}
        onClose={() => setJournalOpen(false)}
      />
    </div>
  );
};

export default AcademiaGamesHub;
