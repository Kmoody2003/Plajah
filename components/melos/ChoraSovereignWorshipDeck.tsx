// components/melos/ChoraSovereignWorshipDeck.tsx
//
// The Chora Sovereign Worship, AI Stem/Orchestration & Plajah+ Direct Publishing Deck.
// Embedded directly inside Chora Writing Pad (PadRoom.tsx) & Stand Mode.
// Replaces CCLI SongSelect + MultiTracks.com + PraiseCharts with:
//   1. On-Device AI Composer Council & Generative Audio 7-Stem Synthesizer + RehearsalMix Player
//   2. PraiseCharts-Style Instrument Part Transposer (Concert, Bb Horns +2, Eb Sax -3, F Horn +7,
//      Acoustic Capo Optimizer, and 4-Part SATB Choir + 3-Part Horn Voicing Matrix)
//   3. Real-Time Live Mic Lyric Transcriber (via Ambo/Chora Whisper ASR) + Universal .usr/.cho Importer
//   4. Plajah+ Direct Self-Publishing & New Worship Discovery Exchange (90% direct to songwriters/churches)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Upload,
  Globe,
  ShieldCheck,
  Music,
  Sliders,
  Radio,
  Check,
  Plus,
  Repeat,
  Users,
  Award,
} from 'lucide-react';
import {
  INSTRUMENT_PART_PROFILES,
  computeOptimalGuitarCapo,
  deriveSectionHarmonyVoicings,
  synthesizeSovereignWorshipStemPack,
  speakSectionGuideCue,
  parseUniversalWorshipChartFile,
  importBulkWorshipChartsAndStems,
  loadSovereignWorshipListings,
  publishSongToSovereignExchange,
  unlockSovereignListingForChurch,
  loadUnlockedSovereignLicenses,
  computeChoraSongFeeAndSplits,
  creditsToCoWriterSplits,
  coWriterSplitsToCredits,
  checkCreatorStripeConnection,
  startCreatorStripeOnboarding,
  createStripePaymentLinkForListing,
  downloadSovereignLicenseCertificate,
  type InstrumentPartId,
  type ChoraSynthesizedStem,
  type ChoraSovereignListing,
  type CoWriterRoyaltySplit,
} from '../../services/choraSovereignWorshipService';
import {
  MUSIC_SUB_DEPARTMENTS,
  uid,
  type MelosSong,
  type MusicSubCategoryKey,
  type SongTake,
} from '../../services/melosService';
import { startLiveTranscriber, type TranscriberHandle } from '../../services/ambo/liveTranscriber';
import { auth } from '../../services/firebase';
import type { BillingConnection, BillingEntityRef } from '../../types';

export interface ChoraSovereignWorshipDeckProps {
  song: MelosSong;
  effectiveKeyRoot: string;
  standSemitones: number;
  onSelectInstrumentSemitones: (semitones: number, enableNashville?: boolean) => void;
  onUpdateSong: (patch: Partial<MelosSong>) => void;
  onImportCompleteSong: (importedSong: MelosSong) => void;
  onToast: (msg: string) => void;
}

export const ChoraSovereignWorshipDeck: React.FC<ChoraSovereignWorshipDeckProps> = ({
  song,
  effectiveKeyRoot,
  standSemitones,
  onSelectInstrumentSemitones,
  onUpdateSong,
  onImportCompleteSong,
  onToast,
}) => {
  const [activePanel, setActivePanel] = useState<
    'AI_STEMS_REHEARSAL' | 'ORCHESTRATION_PARTS' | 'LIVE_TRANSCRIBE_IMPORT' | 'PLAJAH_PLUS_EXCHANGE'
  >('AI_STEMS_REHEARSAL');

  // ── 1. AI Composer Council Stem Pack & RehearsalMix State ──────────────────
  const [stems, setStems] = useState<ChoraSynthesizedStem[]>([]);
  const [councilSummary, setCouncilSummary] = useState<string>('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isPlayingStems, setIsPlayingStems] = useState(false);
  const [loopSection, setLoopSection] = useState(true);
  const [spokenGuideEnabled, setSpokenGuideEnabled] = useState(true);
  const [activeRehearsalPreset, setActiveRehearsalPreset] = useState<MusicSubCategoryKey | 'ALL'>('ALL');
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  // ── 2. PraiseCharts-Style Instrument Part Selection ────────────────────────
  const [selectedPartId, setSelectedPartId] = useState<InstrumentPartId>('CONCERT');
  const capoGuide = useMemo(() => computeOptimalGuitarCapo(effectiveKeyRoot), [effectiveKeyRoot]);
  const combinedChordStr = useMemo(
    () =>
      (song.lyrics || [])
        .map(b => b.chords)
        .filter(Boolean)
        .join(' - ') ||
      song.chordProgression ||
      `${effectiveKeyRoot} - D - Em - C`,
    [song.lyrics, song.chordProgression, effectiveKeyRoot],
  );
  const harmonyVoicings = useMemo(
    () => deriveSectionHarmonyVoicings(combinedChordStr, standSemitones),
    [combinedChordStr, standSemitones],
  );

  // ── 3. Real-Time Live Mic Lyric Transcriber State ──────────────────────────
  const [isLiveListening, setIsLiveListening] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string>('Ready to transcribe sung/spoken lyrics in real time');
  const [liveInterimText, setLiveInterimText] = useState<string>('');
  const [transcribedLines, setTranscribedLines] = useState<string[]>([]);
  const transcriberRef = useRef<TranscriberHandle | null>(null);
  const chartFileInputRef = useRef<HTMLInputElement | null>(null);

  // ── 4. Plajah+ Sovereign Publishing & Discovery Exchange State ─────────────
  const [exchangeMode, setExchangeMode] = useState<'DISCOVER' | 'SELF_PUBLISH'>('DISCOVER');
  const [listings, setListings] = useState<ChoraSovereignListing[]>(() => loadSovereignWorshipListings());
  const [unlockedReceipts, setUnlockedReceipts] = useState(() => loadUnlockedSovereignLicenses());
  const [pubCreatorName, setPubCreatorName] = useState(song.subtitle || 'Grace Sanctuary Collective');
  const [pubOrgName, setPubOrgName] = useState('Local Church Music Dept');
  const [pubPlajahPlusUsd, setPubPlajahPlusUsd] = useState(12);
  const [pubSingleLicenseUsd, setPubSingleLicenseUsd] = useState(18);
  const [pubStyleTag, setPubStyleTag] = useState<ChoraSovereignListing['styleTag']>('Modern Worship');
  const [coWriters, setCoWriters] = useState<CoWriterRoyaltySplit[]>(() =>
    creditsToCoWriterSplits(song.credits, song.subtitle || 'Lead Songwriter'),
  );
  const [stripeConn, setStripeConn] = useState<BillingConnection | null>(null);
  const [creatingStripeLink, setCreatingStripeLink] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync song.credits into coWriters when switching songs
  useEffect(() => {
    setCoWriters(creditsToCoWriterSplits(song.credits, song.subtitle || 'Lead Songwriter'));
  }, [song.id]);

  // Check Stripe Connect status for direct payouts
  const billingEntity = useMemo<BillingEntityRef>(() => {
    if (song.orgId || song.productionId?.startsWith('melos_church_')) {
      const orgId = song.orgId || song.productionId.replace(/^melos_church_/, '');
      return { kind: 'ORG', id: orgId };
    }
    return { kind: 'USER', id: auth.currentUser?.uid || 'local-creator' };
  }, [song.orgId, song.productionId]);

  useEffect(() => {
    if (activePanel === 'PLAJAH_PLUS_EXCHANGE') {
      checkCreatorStripeConnection(billingEntity).then(setStripeConn).catch(() => setStripeConn(null));
    }
  }, [activePanel, billingEntity]);

  const singleSongFeeBreakdown = useMemo(
    () => computeChoraSongFeeAndSplits(pubSingleLicenseUsd, coWriters),
    [pubSingleLicenseUsd, coWriters],
  );
  const plajahPlusFeeBreakdown = useMemo(
    () => computeChoraSongFeeAndSplits(pubPlajahPlusUsd, coWriters),
    [pubPlajahPlusUsd, coWriters],
  );

  const updateCoWritersAndSyncCredits = (next: CoWriterRoyaltySplit[]) => {
    setCoWriters(next);
    onUpdateSong({ credits: coWriterSplitsToCredits(next) });
  };

  // Stop audio & mic on unmount
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(a => {
        try {
          a.pause();
        } catch {}
      });
      transcriberRef.current?.stop();
    };
  }, []);

  // Sync volume/mute/solo changes to live HTMLAudioElements
  useEffect(() => {
    const anySolo = stems.some(s => s.solo);
    stems.forEach(s => {
      const el = audioRefs.current[s.id];
      if (!el) return;
      const effectivelyMuted = s.muted || (anySolo && !s.solo);
      el.volume = effectivelyMuted ? 0 : Math.max(0, Math.min(1, s.volume));
      el.loop = loopSection;
    });
  }, [stems, loopSection]);

  const handleSynthesizeStems = () => {
    setIsSynthesizing(true);
    window.setTimeout(() => {
      // Stop existing audio elements
      Object.values(audioRefs.current).forEach(a => {
        try {
          a.pause();
        } catch {}
      });
      audioRefs.current = {};

      const res = synthesizeSovereignWorshipStemPack(song, standSemitones);
      setStems(res.stems);
      setCouncilSummary(res.councilSummary);
      setIsSynthesizing(false);

      // Attach synthesized stems as SongTakes + engraved sheetNotes so they persist in Score & DAW!
      const newTakes: SongTake[] = res.stems.map(st => ({
        id: st.id,
        label: `[AI Stem] ${st.label}`,
        url: st.audioUrl,
        durationSec: st.durationSec,
        createdAt: Date.now(),
      }));
      onUpdateSong({
        takes: [...(song.takes || []).filter(t => !t.label.startsWith('[AI Stem]')), ...newTakes],
        sheetNotes: song.sheetNotes && song.sheetNotes.length > 0 ? song.sheetNotes : res.sheetNotes,
      });
      onToast(
        `Composer Council synthesized 7 MultiTrack & RehearsalMix stems + engraved score notes for "${song.title}".`,
      );
    }, 120);
  };

  const togglePlayAllStems = () => {
    if (stems.length === 0) {
      handleSynthesizeStems();
      return;
    }
    if (isPlayingStems) {
      Object.values(audioRefs.current).forEach(a => a.pause());
      setIsPlayingStems(false);
      return;
    }

    const anySolo = stems.some(s => s.solo);
    if (spokenGuideEnabled) {
      const firstSection = song.lyrics?.[0]?.label || 'Intro';
      speakSectionGuideCue(firstSection, song.tempo || song.feel?.bpm || 76);
    }

    stems.forEach(s => {
      let el = audioRefs.current[s.id];
      if (!el) {
        el = new Audio(s.audioUrl);
        audioRefs.current[s.id] = el;
      }
      const effectivelyMuted = s.muted || (anySolo && !s.solo);
      el.volume = effectivelyMuted ? 0 : s.volume;
      el.loop = loopSection;
      el.currentTime = 0;
      void el.play().catch(() => {});
    });
    setIsPlayingStems(true);
  };

  const applySubDeptRehearsalPreset = (preset: MusicSubCategoryKey | 'ALL') => {
    setActiveRehearsalPreset(preset);
    if (preset === 'ALL') {
      setStems(prev => prev.map(s => ({ ...s, muted: false, solo: false, volume: 0.8 })));
      return;
    }
    setStems(prev =>
      prev.map(s => {
        if (preset === 'music-choir') {
          // Boost SATB Choir + Keys, lower horns/drums
          return {
            ...s,
            solo: false,
            muted: false,
            volume: s.role === 'SATB_CHOIR' ? 1.0 : s.role === 'KEYS_PIANO' || s.role === 'WORSHIP_PAD' ? 0.65 : 0.25,
          };
        }
        if (preset === 'music-band') {
          return {
            ...s,
            solo: false,
            muted: false,
            volume:
              s.role === 'HORN_SECTION' || s.role === 'STRING_ENSEMBLE' || s.role === 'SUB_BASS'
                ? 1.0
                : 0.5,
          };
        }
        if (preset === 'music-worship-teams') {
          return {
            ...s,
            solo: false,
            muted: false,
            volume: s.role === 'WORSHIP_PAD' || s.role === 'KEYS_PIANO' || s.role === 'CLICK_GUIDE' ? 0.95 : 0.45,
          };
        }
        return {
          ...s,
          solo: false,
          muted: false,
          volume: s.role === 'CLICK_GUIDE' ? 1.0 : 0.75,
        };
      }),
    );
  };

  const handleSelectInstrumentPart = (part: (typeof INSTRUMENT_PART_PROFILES)[number]) => {
    setSelectedPartId(part.id);
    if (part.id === 'NASHVILLE_MD') {
      onSelectInstrumentSemitones(0, true);
      onToast('Switched chart to Music Director Nashville Number System (1 - 4 - 5 - 6m).');
    } else if (part.id === 'CAPO_ACOUSTIC') {
      onSelectInstrumentSemitones(capoGuide.semitoneShiftToWrittenShapes, false);
      onToast(capoGuide.summary);
    } else {
      onSelectInstrumentSemitones(part.semitoneOffset, false);
      onToast(`Transposed chart for ${part.label} (${part.semitoneOffset >= 0 ? `+${part.semitoneOffset}` : part.semitoneOffset} semitones).`);
    }
  };

  const toggleLiveMicTranscription = () => {
    if (isLiveListening) {
      transcriberRef.current?.stop();
      transcriberRef.current = null;
      setIsLiveListening(false);
      setLiveStatus('Live transcription paused.');
      return;
    }
    try {
      setIsLiveListening(true);
      setLiveStatus('Listening to microphone (sing or speak lyrics)...');
      transcriberRef.current = startLiveTranscriber(
        { kind: 'mic' },
        {
          onWords: (text, isFinal) => {
            const cleaned = text.trim();
            if (!cleaned) return;
            if (isFinal) {
              setTranscribedLines(prev => [...prev, cleaned]);
              setLiveInterimText('');
            } else {
              setLiveInterimText(cleaned);
            }
          },
          onStatus: s => setLiveStatus(s),
          onError: err => {
            setLiveStatus(`Mic note: ${err}`);
            setIsLiveListening(false);
          },
        },
      );
    } catch (e: any) {
      setIsLiveListening(false);
      setLiveStatus(`Could not start mic: ${e?.message || 'Check mic permissions'}`);
    }
  };

  const appendTranscribedLinesToSong = () => {
    const allLines = [...transcribedLines, ...(liveInterimText.trim() ? [liveInterimText.trim()] : [])];
    if (allLines.length === 0) return;
    const newBlock = {
      id: uid('b'),
      kind: 'verse' as const,
      label: `Live Transcribed Verse ${(song.lyrics?.length || 0) + 1}`,
      lines: allLines,
      chords: `${effectiveKeyRoot} - D - Em - C`,
      locked: false,
    };
    onUpdateSong({
      lyrics: [...(song.lyrics || []), newBlock],
    });
    setTranscribedLines([]);
    setLiveInterimText('');
    onToast(`Added ${allLines.length} live-transcribed lyric lines to "${song.title}".`);
  };

  const handleImportChartFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rawText = await file.text();
      const parsed = parseUniversalWorshipChartFile(rawText, file.name);
      onUpdateSong({
        title: parsed.title || song.title,
        keySig: parsed.keySig || song.keySig,
        tempo: parsed.bpm || song.tempo,
        timeSig: parsed.timeSig || song.timeSig,
        lyrics: parsed.blocks,
        feel: {
          bpm: parsed.bpm,
          keySig: parsed.keySig,
          timeSig: parsed.timeSig,
          feel: parsed.ccliNumber ? `CCLI #${parsed.ccliNumber}` : 'Imported Worship Chart',
        },
      });
      onToast(`Imported "${parsed.title}" (${parsed.blocks.length} sections, Key of ${parsed.keySig}, ${parsed.bpm} BPM).`);
    } catch (err: any) {
      onToast(`Failed to import chart file: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleBulkImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    e.target.value = '';
    if (!fileList || fileList.length === 0) return;
    try {
      const res = await importBulkWorshipChartsAndStems(fileList, song.productionId, 0);
      res.songs.forEach(s => onImportCompleteSong(s));
      onToast(
        `Bulk imported ${res.songs.length} song(s) (${res.chartCount} chart files, ${res.stemCount} audio stems) into Chora!`,
      );
    } catch (err: any) {
      onToast(`Bulk import error: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleConnectStripe = async () => {
    const url = await startCreatorStripeOnboarding(billingEntity);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      onToast('Opened Stripe Connect onboarding in a new tab.');
    } else {
      onToast('Sign in with your Plajah account to launch live Stripe Connect onboarding.');
    }
  };

  const handlePublishSongToPlajahPlus = async () => {
    setCreatingStripeLink(true);
    try {
      // Sync credits to MelosSong
      onUpdateSong({ credits: coWriterSplitsToCredits(coWriters) });

      const listing = publishSongToSovereignExchange(song, {
        creatorName: pubCreatorName,
        creatorOrgName: pubOrgName,
        creatorPlajahPlusTierUsd: pubPlajahPlusUsd,
        directSingleSongLicenseUsd: pubSingleLicenseUsd,
        styleTag: pubStyleTag,
        coWriterSplits: coWriters,
      });

      // Attempt to create a live Stripe Payment Link on the entity's Stripe Connect account
      const stripeRes = await createStripePaymentLinkForListing(billingEntity, listing, 'SINGLE_SONG');
      if (stripeRes.url) {
        listing.stripePaymentLinkUrl = stripeRes.url;
        listing.stripePaymentLinkId = stripeRes.paymentLinkId;
      }

      setListings(loadSovereignWorshipListings());
      setExchangeMode('DISCOVER');
      onToast(
        stripeRes.url
          ? `Published "${listing.title}" with live Stripe Payment Link (${stripeRes.url})! Net creator pool: $${singleSongFeeBreakdown.netCreatorPoolUsd.toFixed(2)}.`
          : `Published "${listing.title}" to Chora Sovereign Exchange! Net creator pool per license: $${singleSongFeeBreakdown.netCreatorPoolUsd.toFixed(2)}.`,
      );
    } finally {
      setCreatingStripeLink(false);
    }
  };

  const handleUnlockListing = (
    listing: ChoraSovereignListing,
    mode: 'PLAJAH_PLUS_SUBSCRIPTION' | 'DIRECT_SINGLE_LICENSE',
  ) => {
    if (listing.stripePaymentLinkUrl && mode === 'DIRECT_SINGLE_LICENSE') {
      window.open(listing.stripePaymentLinkUrl, '_blank', 'noopener,noreferrer');
    }
    const { song: unlockedSong, receipt } = unlockSovereignListingForChurch(
      listing,
      mode,
      song.productionId,
    );
    setUnlockedReceipts(loadUnlockedSovereignLicenses());
    onImportCompleteSong(unlockedSong);
    onToast(
      `Minted Sovereign License ${receipt.licenseCode} for "${listing.title}"! Net $${receipt.creatorPayoutUsd.toFixed(2)} routed to co-writers. Loaded into Chora Pad.`,
    );
  };

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-4"
      style={{
        background: 'linear-gradient(145deg, rgba(107,0,153,0.16), rgba(15,12,24,0.94))',
        border: '1px solid rgba(245,158,11,0.32)',
      }}
    >
      {/* Top Mode Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--mel-edge)' }}>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-400 text-black">
            Chora Sovereign Engine
          </span>
          <span className="text-xs font-bold" style={{ color: 'var(--mel-ink)' }}>
            AI Stems &amp; RehearsalMix · Auto-Orchestration · Live Lyric ASR · Plajah+ Direct Publishing
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'AI_STEMS_REHEARSAL' as const, label: '1. AI Stems & RehearsalMix', icon: Sliders },
            { id: 'ORCHESTRATION_PARTS' as const, label: '2. Horns, Capo & SATB Parts', icon: Music },
            { id: 'LIVE_TRANSCRIBE_IMPORT' as const, label: '3. Live Mic ASR & Chart Import', icon: Mic },
            { id: 'PLAJAH_PLUS_EXCHANGE' as const, label: '4. Plajah+ Direct Publishing & Exchange', icon: Globe },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activePanel === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePanel(tab.id)}
                className="px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition"
                style={{
                  background: active ? '#F59E0B' : 'rgba(255,255,255,0.06)',
                  color: active ? '#12101A' : 'var(--mel-ink)',
                  border: active ? '1px solid #F59E0B' : '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          PANEL 1: AI COMPOSER COUNCIL 7-STEM SYNTHESIZER & REHEARSALMIX PLAYER
          ===================================================================== */}
      {activePanel === 'AI_STEMS_REHEARSAL' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black text-white flex items-center gap-2">
                <Sparkles size={14} className="text-amber-300" />
                On-Device AI Composer Council &amp; Generative Audio MultiTrack Deck
              </div>
              <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--mel-dim)' }}>
                Zero session musicians required — generates synchronized Click/Guide, Warm Worship Pad, Sub Bass, Keys, 3-Part Horns, Strings &amp; 4-Part SATB Choir stems from your song&apos;s chords ({effectiveKeyRoot}, {song.tempo || song.feel?.bpm || 76} BPM).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSynthesizeStems}
                disabled={isSynthesizing}
                className="px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white"
              >
                <Sparkles size={13} />
                {isSynthesizing
                  ? 'Synthesizing 7 Stems...'
                  : stems.length > 0
                  ? 'Re-Synthesize in Current Key'
                  : 'Synthesize 7 AI Worship Stems'}
              </button>

              {stems.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={togglePlayAllStems}
                    className="px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5"
                    style={{
                      background: isPlayingStems ? '#EF4444' : '#34D399',
                      color: '#09080D',
                    }}
                  >
                    {isPlayingStems ? <Pause size={13} /> : <Play size={13} />}
                    {isPlayingStems ? 'Stop Stems' : 'Play MultiTracks'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setLoopSection(v => !v)}
                    className="px-2.5 py-2 rounded-xl text-[10px] font-bold flex items-center gap-1"
                    style={{
                      background: loopSection ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)',
                      color: loopSection ? '#34D399' : 'var(--mel-dim)',
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    <Repeat size={12} /> Loop Vamps
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSpokenGuideEnabled(v => !v);
                      speakSectionGuideCue(song.lyrics?.[0]?.label || 'Chorus 1', song.tempo || 76);
                    }}
                    className="px-2.5 py-2 rounded-xl text-[10px] font-bold flex items-center gap-1"
                    style={{
                      background: spokenGuideEnabled ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)',
                      color: spokenGuideEnabled ? '#FBBF24' : 'var(--mel-dim)',
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                    title="Announces spoken section cues ('Chorus 1, 2, 3, 4') over the Click/Guide bus"
                  >
                    <Radio size={12} /> Spoken Cue Guide
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Sub-Department RehearsalMix Presets */}
          {stems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 mr-1">
                  RehearsalMix Isolation:
                </span>
                <button
                  type="button"
                  onClick={() => applySubDeptRehearsalPreset('ALL')}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold"
                  style={{
                    background: activeRehearsalPreset === 'ALL' ? '#F59E0B' : 'rgba(255,255,255,0.07)',
                    color: activeRehearsalPreset === 'ALL' ? '#12101A' : '#fff',
                  }}
                >
                  Full Ensemble Mix
                </button>
                {MUSIC_SUB_DEPARTMENTS.map(sub => (
                  <button
                    key={sub.key}
                    type="button"
                    onClick={() => applySubDeptRehearsalPreset(sub.key)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold"
                    style={{
                      background: activeRehearsalPreset === sub.key ? sub.accent : 'rgba(255,255,255,0.07)',
                      color: activeRehearsalPreset === sub.key ? '#12101A' : '#fff',
                    }}
                  >
                    {sub.emoji} {sub.shortLabel} Mix
                  </button>
                ))}
              </div>

              {/* Quick Section Spoken Cue Buttons */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--mel-faint)' }}>
                  Call Cue:
                </span>
                {(song.lyrics || []).slice(0, 5).map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => speakSectionGuideCue(b.label || b.kind, song.tempo || 76)}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-amber-400 hover:text-black text-[10px] font-mono text-white transition"
                  >
                    🗣️ {b.label || b.kind}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 7-Stem Mixer Strips */}
          {stems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {stems.map(st => (
                <div
                  key={st.id}
                  className="rounded-xl p-3 flex flex-col gap-2"
                  style={{
                    background: 'rgba(0,0,0,0.45)',
                    border: `1px solid ${st.solo ? '#F59E0B' : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold text-white truncate" title={st.label}>
                      {st.label}
                    </span>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: `${st.color}24`, color: st.color }}
                    >
                      Pan {st.pan}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setStems(prev =>
                          prev.map(x => (x.id === st.id ? { ...x, muted: !x.muted } : x)),
                        )
                      }
                      className="px-2 py-1 rounded text-[10px] font-black uppercase"
                      style={{
                        background: st.muted ? '#EF4444' : 'rgba(255,255,255,0.08)',
                        color: st.muted ? '#fff' : 'var(--mel-dim)',
                      }}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setStems(prev =>
                          prev.map(x => (x.id === st.id ? { ...x, solo: !x.solo } : x)),
                        )
                      }
                      className="px-2 py-1 rounded text-[10px] font-black uppercase"
                      style={{
                        background: st.solo ? '#F59E0B' : 'rgba(255,255,255,0.08)',
                        color: st.solo ? '#12101A' : 'var(--mel-dim)',
                      }}
                    >
                      S
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={st.volume}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setStems(prev =>
                          prev.map(x => (x.id === st.id ? { ...x, volume: val } : x)),
                        );
                      }}
                      className="flex-1 accent-amber-400"
                    />
                    <span className="text-[10px] font-mono text-white/70 w-8 text-right">
                      {Math.round(st.volume * 100)}%
                    </span>
                  </div>
                  <div className="text-[9.5px]" style={{ color: 'var(--mel-faint)' }}>
                    {st.generatedBy}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl p-4 text-xs flex items-center justify-between bg-black/30 border border-white/10">
              <span style={{ color: 'var(--mel-dim)' }}>
                Click <b>&ldquo;Synthesize 7 AI Worship Stems&rdquo;</b> above to generate Click/Spoken Guide, Warm Pad, Sub Bass, Keys, 3-Part Horns, Strings, and 4-Part SATB Choir stems directly from this song&apos;s chords.
              </span>
            </div>
          )}

          {councilSummary && (
            <div className="text-[11px] text-emerald-300 font-mono">✓ {councilSummary}</div>
          )}
        </div>
      )}

      {/* =====================================================================
          PANEL 2: PRAISECHARTS-STYLE HORNS, CAPO & SATB CHOIR VOICING MATRIX
          ===================================================================== */}
      {activePanel === 'ORCHESTRATION_PARTS' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black text-white">
                Auto-Transposing Ensemble Parts (Horns, Strings, Acoustic Capo &amp; SATB Choir)
              </div>
              <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--mel-dim)' }}>
                Click any instrument below to transpose the Music Stand chart into that player&apos;s exact written key—or inspect the 4-part SATB Choir &amp; 3-part Horn voicings.
              </p>
            </div>
            <span className="px-3 py-1 rounded-xl bg-amber-400/15 border border-amber-400/35 text-amber-200 text-xs font-mono font-bold">
              🎸 {capoGuide.summary}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {INSTRUMENT_PART_PROFILES.map(part => {
              const active = selectedPartId === part.id;
              return (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => handleSelectInstrumentPart(part)}
                  className="px-3 py-2 rounded-xl text-left transition flex flex-col gap-0.5"
                  style={{
                    background: active ? 'rgba(245,158,11,0.22)' : 'rgba(0,0,0,0.4)',
                    border: active ? '1px solid #F59E0B' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <span className="text-[11px] font-black text-white">{part.shortLabel}</span>
                  <span className="text-[9.5px]" style={{ color: 'var(--mel-dim)' }}>
                    {part.label.split('(')[0]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 4-Part SATB Choir & 3-Part Brass/Sax Voicing Table */}
          {harmonyVoicings.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-300 mb-2">
                Live Section Harmony &amp; Horn Voicing Matrix (Concert Key: {effectiveKeyRoot})
              </div>
              <table className="w-full text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-white/15 text-left text-[10px] uppercase text-white/50">
                    <th className="py-1.5 px-2">Chord</th>
                    <th className="py-1.5 px-2 text-pink-300">Soprano</th>
                    <th className="py-1.5 px-2 text-purple-300">Alto</th>
                    <th className="py-1.5 px-2 text-sky-300">Tenor</th>
                    <th className="py-1.5 px-2 text-emerald-300">Bass</th>
                    <th className="py-1.5 px-2 text-amber-300">Bb Trumpet (+2)</th>
                    <th className="py-1.5 px-2 text-orange-300">Eb Alto Sax (-3)</th>
                    <th className="py-1.5 px-2 text-cyan-300">Trombone</th>
                  </tr>
                </thead>
                <tbody>
                  {harmonyVoicings.map((v, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-1.5 px-2 font-black text-white">{v.chordSymbol}</td>
                      <td className="py-1.5 px-2 text-pink-200">{v.sopranoNote}</td>
                      <td className="py-1.5 px-2 text-purple-200">{v.altoNote}</td>
                      <td className="py-1.5 px-2 text-sky-200">{v.tenorNote}</td>
                      <td className="py-1.5 px-2 text-emerald-200">{v.bassNote}</td>
                      <td className="py-1.5 px-2 text-amber-200">{v.bbTrumpetNote}</td>
                      <td className="py-1.5 px-2 text-orange-200">{v.ebAltoSaxNote}</td>
                      <td className="py-1.5 px-2 text-cyan-200">{v.tromboneNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          PANEL 3: REAL-TIME LIVE MIC LYRIC ASR & UNIVERSAL CHART IMPORTER
          ===================================================================== */}
      {activePanel === 'LIVE_TRANSCRIBE_IMPORT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left 7 Cols: Live Mic Lyric Transcriber */}
          <div className="lg:col-span-7 rounded-xl bg-black/40 border border-white/10 p-3.5 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-black text-white flex items-center gap-1.5">
                  <Mic size={13} className="text-emerald-400" />
                  Real-Time Live Lyric Transcriber (Sing or Speak into Mic)
                </div>
                <div className="text-[10.5px]" style={{ color: 'var(--mel-dim)' }}>
                  {liveStatus}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleLiveMicTranscription}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5"
                  style={{
                    background: isLiveListening ? '#EF4444' : '#10B981',
                    color: '#09080D',
                  }}
                >
                  {isLiveListening ? <MicOff size={12} /> : <Mic size={12} />}
                  {isLiveListening ? 'Stop Listening' : 'Start Live Lyric Mic'}
                </button>
                {(transcribedLines.length > 0 || liveInterimText.trim()) && (
                  <button
                    type="button"
                    onClick={appendTranscribedLinesToSong}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-amber-400 text-black"
                  >
                    + Insert into Song Blocks
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-black/60 border border-white/10 p-3 min-h-[84px] font-mono text-xs space-y-1">
              {transcribedLines.length === 0 && !liveInterimText ? (
                <span style={{ color: 'var(--mel-faint)' }}>
                  Spoken or sung phrases will stream here in real time during prophetic worship, rehearsals, or songwriting sessions...
                </span>
              ) : (
                <>
                  {transcribedLines.map((ln, idx) => (
                    <div key={idx} className="text-white">
                      {ln}
                    </div>
                  ))}
                  {liveInterimText && (
                    <div className="text-amber-300 italic">{liveInterimText} …</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right 5 Cols: Universal SongSelect / ChordPro / PraiseCharts + Bulk MultiTrack Stem Importer */}
          <div className="lg:col-span-5 rounded-xl bg-black/40 border border-white/10 p-3.5 flex flex-col justify-between gap-2.5">
            <div>
              <div className="text-xs font-black text-white flex items-center gap-1.5">
                <Upload size={13} className="text-amber-300" />
                Migrate SongSelect / PraiseCharts &amp; MultiTrack Stems
              </div>
              <p className="text-[11px] m-0 mt-1" style={{ color: 'var(--mel-dim)' }}>
                Import a single `.usr`/`.cho`/`.txt` chart into this song, OR select 50+ SongSelect charts + MultiTracks `.wav`/`.mp3`/`.m4a` stem files at once to batch-build your Chora catalog.
              </p>
            </div>

            <input
              ref={chartFileInputRef}
              type="file"
              accept=".usr,.cho,.chordpro,.pro,.txt"
              onChange={handleImportChartFile}
              className="hidden"
            />
            <input
              ref={bulkFileInputRef}
              type="file"
              multiple
              accept=".usr,.cho,.chordpro,.pro,.txt,.xml,.wav,.mp3,.m4a,.ogg"
              onChange={handleBulkImportFiles}
              className="hidden"
            />
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => chartFileInputRef.current?.click()}
                className="w-full py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/15 transition"
              >
                <Upload size={13} /> Import Single .USR / .CHO Chart Here
              </button>
              <button
                type="button"
                onClick={() => bulkFileInputRef.current?.click()}
                className="w-full py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 transition"
              >
                <Upload size={13} /> Bulk Import 50+ Charts + MultiTrack Stems
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PANEL 4: PLAJAH+ SOVEREIGN SELF-PUBLISHING & DIRECT CHURCH EXCHANGE
          ===================================================================== */}
      {activePanel === 'PLAJAH_PLUS_EXCHANGE' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black text-white flex items-center gap-1.5">
                <Award size={14} className="text-amber-300" />
                Sovereign Worship Publishing &amp; Direct Stripe Connect Licensing
              </div>
              <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--mel-dim)' }}>
                Powered by Plajah Stripe Direct (`routes/billing.ts`) + `ContentLicense` (`chora_song_pack`) + integer-cents royalty math (`5%` platform fee, `2.9% + $0.30` Stripe fee).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleConnectStripe}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border"
                style={{
                  background: stripeConn?.chargesEnabled ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.06)',
                  color: stripeConn?.chargesEnabled ? '#34D399' : '#FBBF24',
                  borderColor: stripeConn?.chargesEnabled ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.35)',
                }}
              >
                {stripeConn?.chargesEnabled
                  ? '✓ Stripe Direct Connected'
                  : 'Connect Stripe Direct Payouts'}
              </button>
              <button
                type="button"
                onClick={() => setExchangeMode('DISCOVER')}
                className="px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase"
                style={{
                  background: exchangeMode === 'DISCOVER' ? '#34D399' : 'rgba(255,255,255,0.08)',
                  color: exchangeMode === 'DISCOVER' ? '#09080D' : '#fff',
                }}
              >
                Discover New Worship Songs ({listings.length})
              </button>
              <button
                type="button"
                onClick={() => setExchangeMode('SELF_PUBLISH')}
                className="px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase"
                style={{
                  background: exchangeMode === 'SELF_PUBLISH' ? '#F59E0B' : 'rgba(255,255,255,0.08)',
                  color: exchangeMode === 'SELF_PUBLISH' ? '#09080D' : '#fff',
                }}
              >
                + Self-Publish &ldquo;{song.title}&rdquo; on Plajah+
              </button>
            </div>
          </div>

          {exchangeMode === 'DISCOVER' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {listings.map(item => {
                const unlocked = unlockedReceipts.find(r => r.listingId === item.id);
                const itemFee = computeChoraSongFeeAndSplits(
                  item.directSingleSongLicenseUsd,
                  item.coWriterSplits,
                );
                return (
                  <div
                    key={item.id}
                    className="rounded-xl p-3.5 flex flex-col justify-between gap-2.5 bg-black/45 border border-white/12"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-400/20 text-amber-300 border border-amber-400/35">
                          {item.styleTag}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-300 font-bold">
                          Key {item.keySig} · {item.bpm} BPM
                        </span>
                      </div>

                      <div className="text-sm font-black text-white mt-1.5">{item.title}</div>
                      <div className="text-[11px] text-white/65">
                        {item.creatorName} · <span className="text-white/45">{item.creatorOrgName}</span>
                      </div>

                      <div className="mt-2 rounded-lg bg-white/[0.03] border border-white/10 p-2 font-mono text-[10.5px] text-amber-200/90">
                        {item.sampleLyrics[0]}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-white/5 text-[9.5px] text-white/70">
                          ✓ MultiTrack Stems
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-[9.5px] text-white/70">
                          ✓ Horns &amp; SATB Score
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-[9.5px] text-white/70">
                          ✓ Livestream License
                        </span>
                      </div>

                      <div className="mt-2 text-[10px] text-white/50">
                        <b>Direct Writer Pool (${itemFee.netCreatorPoolUsd.toFixed(2)} net):</b>{' '}
                        {itemFee.splits
                          .map(c => `${c.writerName} $${c.payoutUsd.toFixed(2)} (${c.splitPercent}%)`)
                          .join(' · ')}
                      </div>
                    </div>

                    {unlocked ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-3 py-2 text-[10.5px] text-emerald-200 font-bold flex items-center justify-between">
                          <span>✓ Licensed ({unlocked.licenseCode})</span>
                          <button
                            type="button"
                            onClick={() => handleUnlockListing(item, unlocked.licensedMode)}
                            className="underline text-white"
                          >
                            Open in Pad
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadSovereignLicenseCertificate(unlocked, item)}
                          className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-amber-200 border border-amber-400/30"
                        >
                          Download Verifiable Livestream &amp; Projection License Certificate
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleUnlockListing(item, 'PLAJAH_PLUS_SUBSCRIPTION')}
                          className="w-full py-2 rounded-xl text-[10.5px] font-black uppercase tracking-wider bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white"
                        >
                          Subscribe to Creator Plajah+ (${item.creatorPlajahPlusTierUsd}/mo · Unlocks All)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnlockListing(item, 'DIRECT_SINGLE_LICENSE')}
                          className="w-full py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white border border-white/15"
                        >
                          Direct Stripe Single-Song &amp; Stem License (${item.directSingleSongLicenseUsd})
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-black/45 border border-white/12 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 space-y-2.5">
                <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                  1. Direct Self-Publishing &amp; Stripe Pricing for &ldquo;{song.title}&rdquo;
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-white/50 mb-1">Artist / Collective Name</label>
                    <input
                      value={pubCreatorName}
                      onChange={e => setPubCreatorName(e.target.value)}
                      className="w-full rounded-lg bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/50 mb-1">Home Church / Ministry</label>
                    <input
                      value={pubOrgName}
                      onChange={e => setPubOrgName(e.target.value)}
                      className="w-full rounded-lg bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-white/50 mb-1">Plajah+ Sub ($/mo)</label>
                    <input
                      type="number"
                      value={pubPlajahPlusUsd}
                      onChange={e => setPubPlajahPlusUsd(Number(e.target.value) || 12)}
                      className="w-full rounded-lg bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/50 mb-1">1-Song License ($)</label>
                    <input
                      type="number"
                      value={pubSingleLicenseUsd}
                      onChange={e => setPubSingleLicenseUsd(Number(e.target.value) || 18)}
                      className="w-full rounded-lg bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/50 mb-1">Genre / Style</label>
                    <select
                      value={pubStyleTag}
                      onChange={e => setPubStyleTag(e.target.value as any)}
                      className="w-full rounded-lg bg-black/60 border border-white/15 px-2 py-1.5 text-xs text-white"
                    >
                      <option value="Modern Worship">Modern Worship</option>
                      <option value="Gospel Choir">Gospel Choir</option>
                      <option value="Liturgical / Hymn Re-Imagined">Liturgical / Hymn</option>
                      <option value="Acoustic / Prayer Room">Acoustic / Prayer</option>
                    </select>
                  </div>
                </div>

                {/* Live Integer-Cents Royalty & Stripe Fee Breakdown */}
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-[11px] font-mono space-y-1">
                  <div className="text-[10px] font-black uppercase text-amber-300">
                    Exact Stripe &amp; Platform Fee Math (services/pod/royalty.ts)
                  </div>
                  <div className="flex justify-between text-white/75">
                    <span>Single License List Price:</span>
                    <b>${singleSongFeeBreakdown.listPriceUsd.toFixed(2)}</b>
                  </div>
                  <div className="flex justify-between text-white/55">
                    <span>Stripe Processing (2.9% + $0.30):</span>
                    <span>-${singleSongFeeBreakdown.stripeFeeUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white/55">
                    <span>Plajah Platform Cut (5.0%):</span>
                    <span>-${singleSongFeeBreakdown.platformCutUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-300 font-black border-t border-white/10 pt-1">
                    <span>Net Direct to Co-Writers:</span>
                    <span>
                      ${singleSongFeeBreakdown.netCreatorPoolUsd.toFixed(2)} (Plajah+ Sub Net: $
                      {plajahPlusFeeBreakdown.netCreatorPoolUsd.toFixed(2)}/mo)
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">
                      2. Co-Writer Split Sheet (Synced with song.credits)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateCoWritersAndSyncCredits([
                          ...coWriters,
                          {
                            id: uid('cw'),
                            writerName: 'Co-Writer',
                            role: 'Lyrics & Melody',
                            plajahHandle: '@cowriter',
                            splitPercent: 0,
                          },
                        ])
                      }
                      className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-bold text-white"
                    >
                      + Add Writer
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {singleSongFeeBreakdown.splits.map((cw, idx) => (
                      <div key={cw.id} className="grid grid-cols-12 gap-1.5 items-center text-xs">
                        <input
                          value={cw.writerName}
                          onChange={e => {
                            const val = e.target.value;
                            updateCoWritersAndSyncCredits(
                              coWriters.map((x, i) => (i === idx ? { ...x, writerName: val } : x)),
                            );
                          }}
                          className="col-span-5 rounded bg-black/60 border border-white/15 px-2 py-1 text-xs text-white"
                        />
                        <span className="col-span-3 text-[10px] text-white/55 truncate">{cw.role}</span>
                        <input
                          type="number"
                          value={cw.splitPercent}
                          onChange={e => {
                            const val = Number(e.target.value) || 0;
                            updateCoWritersAndSyncCredits(
                              coWriters.map((x, i) => (i === idx ? { ...x, splitPercent: val } : x)),
                            );
                          }}
                          className="col-span-2 rounded bg-black/60 border border-white/15 px-2 py-1 text-xs text-emerald-300 font-mono text-right"
                        />
                        <span className="col-span-2 text-[10px] font-mono text-amber-300 text-right">
                          ${cw.payoutUsd.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={creatingStripeLink}
                  onClick={() => void handlePublishSongToPlajahPlus()}
                  className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-400 text-black flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <ShieldCheck size={14} />
                  {creatingStripeLink
                    ? 'Creating Stripe Direct Payment Link...'
                    : 'Publish Song, Create Stripe Link & Sync Co-Writer Splits'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChoraSovereignWorshipDeck;
