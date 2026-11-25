/**
 * Playable Reading & Elevate Parable World powered by Plajah's native Anima + Living systems:
 *  - LivingSceneStage: Verlet swaying willow vines / olive awning fringe, dappled komorebi sunbeams,
 *    flickering lantern/lamp flames, fluttering woodland butterfly, creek caustics, interactive ripples
 *  - useLivingAnim: WAAPI sway/float on hanging word slots + jelly bounce on wooden letter tiles
 *  - Voca speech alignment (services/voca/vocaAlign.ts) + childrensSpeech read-aloud
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Mic, MicOff, RotateCcw, Volume2 } from 'lucide-react';
import { nearMiss, normalize, wordsMatch } from '../../services/voca/vocaAlign';
import {
  buildTileTray,
  ELEVATE_QUESTS,
  evaluateReadingSelection,
  READING_QUESTS,
} from '../../services/academiaGames/pedagogyEngine';
import {
  playDiscoveryCadence,
  playWarmPluck,
  playWoodTap,
  speakStorybookLine,
} from '../../services/academiaGames/acousticAudio';
import type { AtmospherePreset, JournalEntry, ReadingQuest, UdlPrefs } from '../../services/academiaGames/contracts';
import type { DirectorSettings } from '../../services/academiaGames/motionDirector';
import { CarvedWoodTile, DecklePaperCard, StitchedClothButton, WaxSealBadge } from './craftPrimitives';
import { LivingSceneStage } from './LivingSceneStage';
import { useLivingAnim } from './useLivingAnim';

interface Props {
  variant: 'reading' | 'elevate';
  plateUrl: string;
  atmosphere: AtmospherePreset;
  director: DirectorSettings;
  udl: UdlPrefs;
  onActiveQuestChange: (quest: ReadingQuest) => void;
  onStruggle: () => void;
  onMastery: (entry: JournalEntry) => void;
}

const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

const SwayingLanternSlot: React.FC<{
  slotIdx: number;
  text: string;
  solved: boolean;
  reducedMotion: boolean;
}> = ({ slotIdx, text, solved, reducedMotion }) => {
  const ref = useLivingAnim<HTMLDivElement>(
    `lantern-slot-${slotIdx}`,
    { preset: 'sway', amount: 0.7, durationMs: 3200 + slotIdx * 420, loop: 'infinite', origin: { x: 0.5, y: 0 } },
    reducedMotion,
  );
  return (
    <div
      ref={ref}
      className="min-w-[54px] h-[58px] px-3 rounded-[8px] grid place-items-center text-[22px] font-bold transition-all duration-300"
      style={{
        background: solved
          ? 'linear-gradient(180deg, #FFF3CC, #F7D47C)'
          : text
            ? 'rgba(250, 238, 208, 0.95)'
            : 'rgba(246, 239, 226, 0.78)',
        color: '#3B2818',
        border: solved ? '2px solid #D99B32' : '2px dashed #8F7252',
        boxShadow: solved ? '0 0 24px rgba(255, 214, 114, 0.85)' : '0 4px 12px rgba(25,18,12,0.22)',
        fontFamily: 'Georgia, serif',
        transformOrigin: '50% 0%',
      }}
    >
      {text || '·'}
    </div>
  );
};

export const ReadingBrookWorld: React.FC<Props> = ({
  variant,
  plateUrl,
  atmosphere,
  director,
  udl,
  onActiveQuestChange,
  onStruggle,
  onMastery,
}) => {
  const quests = variant === 'elevate' ? ELEVATE_QUESTS : READING_QUESTS;
  const [qIdx, setQIdx] = useState(0);
  const quest = quests[qIdx];
  const tray = useMemo(() => buildTileTray(quest), [quest]);

  const [chosen, setChosen] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [celebrateTick, setCelebrateTick] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const evalRes = useMemo(() => evaluateReadingSelection(quest, chosen, tray), [quest, chosen, tray]);

  useEffect(() => {
    onActiveQuestChange(quest);
    setChosen([]);
    setSolved(false);
    setVoiceNote('');
    recognitionRef.current?.stop();
    setListening(false);
  }, [quest, onActiveQuestChange]);

  const markSolved = (viaVoice: boolean) => {
    if (solved) return;
    setSolved(true);
    setCelebrateTick(c => c + 1);
    playDiscoveryCadence(udl.soundOn);
    speakStorybookLine(`${quest.word.toLowerCase()}. ${quest.storyLine}`, udl.soundOn);
    onMastery({
      id: `${quest.id}`,
      createdAt: Date.now(),
      world: variant,
      band: quest.band,
      title: variant === 'elevate' ? `${quest.word} · ${quest.scriptureRef ?? 'Parable'}` : `Lantern Word: ${quest.word}`,
      summary: quest.storyLine,
      artifactNote: viaVoice
        ? `Spoken aloud through Voca alignment (${quest.syllables.join(' · ')}) and illuminated in the meadow.`
        : `Woven with carved cedar tiles (${quest.tiles.join(' + ')}) into your Living Field Journal.`,
      standards: quest.standards,
      emblem: variant === 'elevate' ? 'olive' : 'lantern',
    });
  };

  const toggleTile = (idx: number) => {
    if (solved) return;
    if (chosen.includes(idx)) {
      playWoodTap(udl.soundOn, 0);
      setChosen(prev => prev.filter(i => i !== idx));
      return;
    }
    if (chosen.length >= quest.tiles.length) return;
    const next = [...chosen, idx];
    playWarmPluck(PENTATONIC[next.length % PENTATONIC.length], udl.soundOn, { duration: 1.0, volume: 0.08 });
    setChosen(next);

    const check = evaluateReadingSelection(quest, next, tray);
    if (check.exactMatch) {
      markSolved(false);
    } else if (check.complete && !check.exactMatch) {
      onStruggle();
    }
  };

  const toggleVoiceListen = () => {
    if (!udl.voiceConsent) {
      setVoiceNote('Enable Voca Voice Consent in the UDL bar to speak aloud—carved tiles always work too.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) {
      setVoiceNote('This browser does not support speech listening—tap the carved wooden tiles instead.');
      return;
    }
    try {
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 4;
      rec.onresult = (ev: any) => {
        const alts: string[] = [];
        for (let i = 0; i < ev.results[0].length; i++) alts.push(ev.results[0][i].transcript);
        const targetNorm = normalize(quest.word);
        const heardMatch = alts.some(raw =>
          raw
            .split(/\s+/)
            .map(normalize)
            .some(w => w && (wordsMatch(targetNorm, w, 2) || nearMiss(targetNorm, w))),
        );
        if (heardMatch) {
          setVoiceNote(`Voca heard “${quest.word}” clearly!`);
          const matchedIndices: number[] = [];
          const used = new Set<number>();
          for (const t of quest.tiles) {
            const idx = tray.findIndex((item, i) => item === t && !used.has(i));
            if (idx >= 0) {
              used.add(idx);
              matchedIndices.push(idx);
            }
          }
          setChosen(matchedIndices);
          markSolved(true);
        } else {
          setVoiceNote(`Voca heard “${alts[0] ?? '…'}” — try saying “${quest.word.toLowerCase()}” slowly, or tap the wooden blocks.`);
          onStruggle();
        }
        setListening(false);
      };
      rec.onerror = () => {
        setListening(false);
        setVoiceNote('Could not hear clearly—tap the carved wooden blocks anytime.');
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      setListening(true);
      setVoiceNote(`Listening softly for “${quest.word.toLowerCase()}”…`);
      rec.start();
    } catch {
      setListening(false);
      setVoiceNote('Microphone could not start—carved tiles are ready below.');
    }
  };

  const spacingClass = udl.dyslexiaSpacing ? 'tracking-[0.09em] leading-loose' : '';
  const lanternSlots = useMemo(
    () =>
      quest.tiles.map((_, slotIdx) => {
        const tileIdx = chosen[slotIdx];
        const text = tileIdx !== undefined ? tray[tileIdx] : '';
        return { text, filled: tileIdx !== undefined, solved };
      }),
    [quest.tiles, chosen, tray, solved],
  );

  return (
    <LivingSceneStage
      world={variant}
      plateUrl={plateUrl}
      plateAlt={variant === 'elevate' ? 'Sunlit Galilean olive hillside storybook' : 'Sunlit woodland brook and willow reading nook'}
      atmosphere={atmosphere}
      director={director}
      reducedMotion={udl.reducedMotion}
      soundOn={udl.soundOn}
      intensity={solved ? 1 : evalRes.progressRatio * 0.7}
      lanternSlots={variant === 'reading' ? lanternSlots : undefined}
      celebrateSignal={celebrateTick}
      celebrateBurstKind={variant === 'elevate' ? 'petals' : 'fireflies'}
    >
      {/* Top-Left Torn Story Ribbon */}
      <div className="absolute top-3.5 left-3.5 max-w-md">
        <DecklePaperCard copperplate tone="cream" className="px-4 py-3 text-[#35261B]">
          <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-[#7D654C] font-semibold">
            <span>{variant === 'elevate' ? `Elevate Parable · ${quest.scriptureRef}` : `Lantern Story · Quest ${qIdx + 1}/${quests.length}`}</span>
            <button
              type="button"
              onClick={() => speakStorybookLine(quest.storyLine, true)}
              className="inline-flex items-center gap-1 text-[#5E4732] hover:text-[#2A1D12] cursor-pointer"
              title="Read story line aloud"
            >
              <Volume2 size={13} /> Listen
            </button>
          </div>
          <p className={`text-[14px] mt-1 text-[#332419] ${spacingClass}`} style={{ fontFamily: 'Georgia, serif' }}>
            {quest.storyLine}
          </p>
          {udl.showSyllables && (
            <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-[#6E563F]">
              <span>Syllables: <strong>{quest.syllables.join(' · ')}</strong></span>
              <span>·</span>
              <span>{variant === 'reading' ? 'Watch the hanging mulberry lanterns light up!' : 'Tap the meadow or brush the olive breeze!'}</span>
            </div>
          )}
        </DecklePaperCard>
      </div>

      {/* Top-Right Word Slots (on Elevate; Reading displays live letters directly on the swinging painted lanterns!) */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {variant === 'elevate' &&
          quest.tiles.map((_, slotIdx) => {
            const tileIdx = chosen[slotIdx];
            const text = tileIdx !== undefined ? tray[tileIdx] : '';
            return (
              <SwayingLanternSlot
                key={slotIdx}
                slotIdx={slotIdx}
                text={text}
                solved={solved}
                reducedMotion={udl.reducedMotion}
              />
            );
          })}
        {solved && <WaxSealBadge label="OK" color="gold" />}
      </div>

      {/* Airy Bottom Cedar Tile Tray floating cleanly over the pristine meadow & brook */}
      <div
        className="absolute left-0 right-0 bottom-0 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        style={{
          background: 'linear-gradient(180deg, rgba(28,22,15,0) 0%, rgba(28,22,15,0.48) 55%, rgba(24,18,12,0.72) 100%)',
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {tray.map((ch, idx) => (
            <CarvedWoodTile
              key={`${quest.id}-${idx}-${ch}`}
              label={ch}
              selected={chosen.includes(idx)}
              disabled={solved}
              reducedMotion={udl.reducedMotion}
              onClick={() => toggleTile(idx)}
            />
          ))}
          {chosen.length > 0 && !solved && (
            <StitchedClothButton onClick={() => setChosen([])} tone="linen" className="!py-2 !px-3" ariaLabel="Clear chosen tiles">
              <RotateCcw size={14} />
            </StitchedClothButton>
          )}
        </div>

        <DecklePaperCard tone="parchment" className="px-4 py-2.5 text-[#35261B] max-w-md flex-1 min-w-[240px]">
          <div className="flex items-center justify-between gap-2.5">
            <div className={`text-[13px] leading-snug ${spacingClass}`} style={{ fontFamily: 'Georgia, serif' }}>
              {voiceNote || evalRes.feedback}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StitchedClothButton
                onClick={toggleVoiceListen}
                tone={listening ? 'terracotta' : 'linen'}
                className="!py-1.5 !px-3 !text-[12px]"
                ariaLabel="Speak word aloud with Voca"
              >
                {listening ? <MicOff size={13} /> : <Mic size={13} />}
                {listening ? 'Listening' : 'Speak'}
              </StitchedClothButton>
              {solved && (
                <StitchedClothButton
                  onClick={() => setQIdx(i => (i + 1) % quests.length)}
                  tone="sage"
                  className="!py-1.5 !px-3 !text-[12px]"
                >
                  Next <ChevronRight size={13} />
                </StitchedClothButton>
              )}
            </div>
          </div>
        </DecklePaperCard>
      </div>
    </LivingSceneStage>
  );
};
