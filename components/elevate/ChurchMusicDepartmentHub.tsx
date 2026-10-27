// components/elevate/ChurchMusicDepartmentHub.tsx
//
// Organization Music Department Section — Connected to the Chora Service (`services/melosService.ts`).
// All songwriting, sheet music, Music Stand + Nashville Number System (`1-4-5-6m`), tracklist catalog,
// and live setlist / run-of-show cue arrangements live in the Chora environments (`PadRoom`,
// `TracklistRoom`, `ArrangeRoom`, `BeatsRoom`, `MasteringDeskHost`, `ChoraStudioMixer`).
// This hub manages the Organization's 4 Music Units (Worship Teams, Band, Choir, Collective),
// syncs the org's Chora production (`melos_church_${church.id}`), and provides direct 1-click links
// into every Chora environment.

import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Disc3,
  Drum,
  ExternalLink,
  FileText,
  Layers,
  ListMusic,
  MessageSquare,
  Music,
  PenLine,
  Plus,
  Radio,
  Search,
  Sliders,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import type { Organization } from '../../types';
import {
  MUSIC_SUB_DEPARTMENTS,
  ensureOrgChoraProduction,
  fmtDuration,
  launchChoraEnvironment,
  loadOrgChoraBundle,
  newSong,
  saveOrgChoraBundle,
  songDuration,
  type ChoraPadMode,
  type MelosArrangement,
  type MelosRoom,
  type MelosSong,
  type MusicSubCategoryKey,
  type MusicSubDepartmentMeta,
  type SeededProduction,
} from '../../services/melosService';
import { openMelosSongInTela, openMelosTracklistInTela } from '../../services/telaDomainAdapters';
import { saveChurchSong } from '../../services/ambo/songLibrary';
import { orgRoomId } from '../../services/orgChatService';
import { isDemoOrg } from '../../services/elevateTruth';

export { MUSIC_SUB_DEPARTMENTS, type MusicSubCategoryKey, type MusicSubDepartmentMeta };

interface ChurchMusicDepartmentHubProps {
  church: Organization;
  canEdit?: boolean;
  initialSubDept?: MusicSubCategoryKey;
  onOpenChatRoom?: (roomId: string) => void;
}

export const ChurchMusicDepartmentHub: React.FC<ChurchMusicDepartmentHubProps> = ({
  church,
  canEdit = true,
  initialSubDept = 'ALL',
  onOpenChatRoom,
}) => {
  const isDemo = isDemoOrg(church);
  const [activeSubDept, setActiveSubDept] = useState<MusicSubCategoryKey>(initialSubDept);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const [bundle, setBundle] = useState<SeededProduction>(() =>
    loadOrgChoraBundle(church.id, church.name, church.creatorId || 'elevate-music', isDemo),
  );

  useEffect(() => {
    setActiveSubDept(initialSubDept);
  }, [initialSubDept]);

  useEffect(() => {
    let active = true;
    void ensureOrgChoraProduction(
      church.id,
      church.name,
      church.creatorId || 'elevate-music',
      isDemo,
    ).then(seeded => {
      if (active) setBundle(seeded);
    });
    return () => {
      active = false;
    };
  }, [church.id, church.name, church.creatorId, isDemo]);

  const triggerToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const filteredSongs = useMemo(() => {
    return bundle.songs.filter(song => {
      const matchesDept =
        activeSubDept === 'ALL' ||
        !song.assignedSubDepts?.length ||
        song.assignedSubDepts.includes(activeSubDept);
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        song.title.toLowerCase().includes(q) ||
        (song.workingTitle || '').toLowerCase().includes(q) ||
        (song.keySig || '').toLowerCase().includes(q);
      return matchesDept && matchesQuery;
    });
  }, [bundle.songs, activeSubDept, searchQuery]);

  // Direct launcher into any Chora Environment (`pad`, `tracklist`, `arrange`, `beats`, `master`, `mixer`)
  const openChoraEnv = (opts: {
    room: MelosRoom;
    padMode?: ChoraPadMode;
    songId?: string;
    arrangementId?: string;
    subDept?: MusicSubCategoryKey;
    openHymnalModal?: boolean;
    openLiveCueTimer?: boolean;
  }) => {
    launchChoraEnvironment({
      productionId: bundle.production.id,
      orgId: church.id,
      orgName: church.name,
      room: opts.room as any,
      padMode: opts.padMode,
      songId: opts.songId || filteredSongs[0]?.id || bundle.songs[0]?.id,
      arrangementId: opts.arrangementId || bundle.arrangements[0]?.id,
      subDept: opts.subDept ?? activeSubDept,
      openHymnalModal: opts.openHymnalModal,
      openLiveCueTimer: opts.openLiveCueTimer,
    });
  };

  const handleCreateSongAndOpenChoraPad = () => {
    const created = newSong(bundle.songs.length, {
      title: 'Untitled Sanctuary Song',
      workingTitle: `${church.name} · Music Department`,
      state: 'WRITING',
      commitment: 'WORKING_ON_IT',
      love: 5,
      confidence: 85,
      tempo: 78,
      keySig: 'D',
      timeSig: '4/4',
      orgId: church.id,
      sacredCategory: 'ORIGINAL_COLLECTIVE',
      assignedSubDepts:
        activeSubDept === 'ALL'
          ? ['music-collective', 'music-worship-teams', 'music-band', 'music-choir']
          : [activeSubDept],
      lyrics: [
        {
          id: `blk_v1_${Date.now()}`,
          kind: 'VERSE',
          label: 'Verse 1',
          chords: 'D - Bm7 - Gmaj7 - A',
          lines: ['[D]Write opening stanza [Bm7]here in Chora [Gmaj7]Pad...'],
        },
        {
          id: `blk_c1_${Date.now() + 1}`,
          kind: 'CHORUS',
          label: 'Chorus',
          chords: 'Gmaj7 - A - Bm7 - D',
          lines: ['[Gmaj7]Write congregational [A]refrain here...'],
        },
      ],
    });
    const nextBundle: SeededProduction = {
      ...bundle,
      songs: [created, ...bundle.songs],
    };
    setBundle(nextBundle);
    saveOrgChoraBundle(church.id, nextBundle);
    openChoraEnv({ room: 'pad', padMode: 'lyrics', songId: created.id });
  };

  const handleOpenSongInTela = async (song: MelosSong) => {
    await openMelosSongInTela(
      bundle.production.id,
      song,
      bundle.songs.slice(0, 20),
      church.creatorId || 'elevate-music',
    );
    triggerToast(`Opened "${song.title}" in Tela Songwriting Canvas!`);
  };

  const handleOpenTracklistInTela = async () => {
    await openMelosTracklistInTela(
      bundle.production.id,
      bundle.songs,
      church.creatorId || 'elevate-music',
    );
    triggerToast('Opened Music Department Tracklist in Tela Base!');
  };

  const handlePushSongToStageProjection = async (song: MelosSong) => {
    const stanzas = (song.lyrics || [])
      .filter(b => b.kind !== 'NOTE')
      .map(b => b.lines.map(l => l.replace(/\[[^\]]+\]/g, '')).join('\n'))
      .filter(Boolean);
    await saveChurchSong(church.id, {
      id: song.id,
      title: song.title,
      author: song.workingTitle || church.name,
      stanzas,
      key: song.keySig || 'G',
      bpm: song.tempo || 84,
      ccli: 'Public Domain / Chora Music Department',
    });
    triggerToast(`Pushed "${song.title}" to Stage Projection Library!`);
  };

  return (
    <div className="space-y-6 text-white">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-amber-400 text-black font-black text-xs shadow-2xl flex items-center gap-2">
          <Sparkles size={15} />
          <span>{toast}</span>
        </div>
      )}

      {/* =====================================================================
          HERO & CHORA SERVICE CONNECTION BANNER
          ===================================================================== */}
      <div
        className="rounded-3xl p-6 border relative overflow-hidden space-y-5"
        style={{
          background:
            'radial-gradient(900px 320px at 10% 0%, rgba(245,158,11,0.18), transparent 65%), radial-gradient(800px 300px at 95% 100%, rgba(168,85,247,0.16), transparent 65%), #0c0a14',
          borderColor: 'rgba(255,255,255,0.12)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/35 text-amber-300 text-[10px] font-black uppercase tracking-widest">
              <Music size={12} /> {church.name} · Connected to Chora Service ({bundle.production.id})
            </div>
            <h2
              className="text-2xl sm:text-3xl font-black tracking-tight text-white"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Music Department &amp; Chora Environments Hub
            </h2>
            <p className="text-xs sm:text-sm text-white/70 max-w-3xl leading-relaxed">
              All songwriting blocks, Music Stand &amp; Nashville Number System (`1-4-5-6m`), engraved sheet music,
              public-domain hymnal catalog, and live setlist / run-of-show cue arrangements live in the{' '}
              <span className="text-amber-300 font-bold">Chora Studio</span> service and environments — connected directly to{' '}
              <span className="text-white font-bold">{church.name}</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={handleCreateSongAndOpenChoraPad}
                className="px-3.5 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg hover:brightness-105 transition"
              >
                <Plus size={14} /> New Song in Chora Pad →
              </button>
            )}
            <button
              type="button"
              onClick={() => openChoraEnv({ room: 'pad', padMode: 'stand' })}
              className="px-3.5 py-2 rounded-xl bg-emerald-400 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg hover:brightness-105 transition"
            >
              <BookOpen size={14} /> Open Chora Music Stand (Nashville) →
            </button>
            <button
              type="button"
              onClick={() => openChoraEnv({ room: 'arrange', openLiveCueTimer: true })}
              className="px-3.5 py-2 rounded-xl bg-indigo-400 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg hover:brightness-105 transition"
            >
              <Timer size={14} /> Open Chora Arrange &amp; Cue Timer →
            </button>
          </div>
        </div>

        {/* =====================================================================
            4 MUSIC DEPARTMENT SUB-UNITS (WITH DIRECT CHORA & CHAT LINKS)
            ===================================================================== */}
        <div className="grid sm:grid-cols-5 gap-2.5 pt-1">
          <div
            onClick={() => setActiveSubDept('ALL')}
            className={`cursor-pointer rounded-2xl p-3 border transition flex flex-col justify-between ${
              activeSubDept === 'ALL'
                ? 'bg-amber-400/20 border-amber-400 text-white shadow-lg'
                : 'bg-white/[0.03] border-white/10 text-white/70 hover:bg-white/[0.06]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-lg">🎵</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10">
                  {bundle.songs.length} Songs
                </span>
              </div>
              <p className="font-black text-xs mt-1.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
                All 4 Music Units
              </p>
              <p className="text-[10px] text-white/50 mt-0.5 line-clamp-2">
                Unified Chora Pad, Stand, Tracklist &amp; Setlist Arrangements
              </p>
            </div>
            <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  openChoraEnv({ room: 'tracklist', subDept: 'ALL' });
                }}
                className="text-[9.5px] font-black text-amber-300 hover:underline inline-flex items-center gap-1"
              >
                Open All in Chora <ExternalLink size={9} />
              </button>
            </div>
          </div>

          {MUSIC_SUB_DEPARTMENTS.map(sub => {
            const active = activeSubDept === sub.key;
            const chatRoomId = orgRoomId(church.id, `team-${sub.name}`);
            return (
              <div
                key={sub.key}
                onClick={() => setActiveSubDept(sub.key)}
                className={`cursor-pointer rounded-2xl p-3 border transition flex flex-col justify-between ${
                  active
                    ? 'bg-white/[0.1] border-amber-400 text-white shadow-lg'
                    : 'bg-white/[0.03] border-white/10 text-white/75 hover:bg-white/[0.06]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-lg">{sub.emoji}</span>
                    {isDemo && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold"
                        style={{
                          background: `${sub.badgeColor}22`,
                          color: sub.badgeColor,
                          border: `1px solid ${sub.badgeColor}55`,
                        }}
                      >
                        {sub.rosterCount} Members
                      </span>
                    )}
                  </div>
                  <p
                    className="font-black text-xs mt-1.5 text-white"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {sub.name}
                  </p>
                  <p className="text-[10px] text-white/55 mt-0.5 line-clamp-2 leading-snug">
                    {sub.focus}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-1 pt-2 mt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      openChoraEnv({
                        room: sub.key === 'music-band' ? 'pad' : 'tracklist',
                        padMode: sub.key === 'music-band' ? 'stand' : 'lyrics',
                        subDept: sub.key,
                      });
                    }}
                    className="text-[9.5px] font-black text-amber-300 hover:underline inline-flex items-center gap-1"
                  >
                    Open in Chora <ExternalLink size={9} />
                  </button>
                  {onOpenChatRoom && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenChatRoom(chatRoomId);
                      }}
                      className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-[9px] font-bold text-white inline-flex items-center gap-1"
                      title={`Open ${sub.name} Chat Room`}
                    >
                      <MessageSquare size={9} /> Chat
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          DIRECT CHORA ENVIRONMENT LAUNCHPAD (6 DEDICATED CHORA ENVIRONMENTS)
          ===================================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
              Direct Links to Chora Environments
            </p>
            <h3 className="text-lg font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Launch Chora Writing Pad, Music Stand, Tracklist, Arrange &amp; Studio Environments
            </h3>
          </div>
          <button
            type="button"
            onClick={() => { void handleOpenTracklistInTela(); }}
            className="px-3.5 py-2 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-200 text-xs font-black inline-flex items-center gap-1.5"
          >
            <Layers size={13} /> Open Music Catalog in Tela Base
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* 1. Chora Writing Pad (Lyrics & Blocks) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between gap-3 hover:border-amber-400/40 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Chora Pad · Lyrics &amp; Blocks
                </span>
                <PenLine size={15} className="text-purple-300" />
              </div>
              <h4 className="text-sm font-black text-white">Chora Writing Pad Environment</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Write original worship &amp; ensemble songs in typed Tela-backed lyric blocks, scan paper song sheets via OCR, and auto-detect rhyme &amp; syllable meter.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => openChoraEnv({ room: 'pad', padMode: 'lyrics' })}
                className="flex-1 px-3 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center justify-center gap-1.5"
              >
                <PenLine size={12} /> Open Chora Writing Pad →
              </button>
              <button
                type="button"
                onClick={() => openChoraEnv({ room: 'pad', padMode: 'lyrics', openHymnalModal: true })}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold"
                title="Open Sacred Hymnal & Gospel Catalog inside Chora Pad"
              >
                Hymnal
              </button>
            </div>
          </div>

          {/* 2. Chora Music Stand & Nashville Number System */}
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-4 flex flex-col justify-between gap-3 hover:border-amber-400/60 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  Chora Pad · Stand Mode
                </span>
                <BookOpen size={15} className="text-amber-300" />
              </div>
              <h4 className="text-sm font-black text-white">Music Stand &amp; Nashville Numbers (`1-4-5-6m`)</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                High-contrast rehearsal &amp; stage music stand with instant `-6..+6` semitone transposer, 1-click Nashville Number System toggle, and Bluetooth foot-pedal page turning.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openChoraEnv({ room: 'pad', padMode: 'stand' })}
              className="w-full px-3 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center justify-center gap-1.5"
            >
              <BookOpen size={12} /> Launch Chora Music Stand →
            </button>
          </div>

          {/* 3. Chora Engraved Sheet Music & MusicXML Studio */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between gap-3 hover:border-cyan-400/40 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Chora Pad · Score Mode
                </span>
                <Music size={15} className="text-cyan-300" />
              </div>
              <h4 className="text-sm font-black text-white">Engraved Sheet Music &amp; MusicXML</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Grand-staff SATB &amp; lead-sheet notation composer inside Chora Pad with Web Audio score playback and `.musicxml` export for choir and horn sections.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openChoraEnv({ room: 'pad', padMode: 'score' })}
              className="w-full px-3 py-2 rounded-xl bg-cyan-400 text-black text-xs font-black inline-flex items-center justify-center gap-1.5"
            >
              <Music size={12} /> Open Chora Sheet Music Score →
            </button>
          </div>

          {/* 4. Chora Tracklist & Sacred Catalog Environment */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between gap-3 hover:border-emerald-400/40 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Chora Tracklist ({bundle.songs.length} Songs)
                </span>
                <ListMusic size={15} className="text-emerald-300" />
              </div>
              <h4 className="text-sm font-black text-white">Chora Tracklist &amp; Hymnal Catalog</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Manage the entire repertoire of hymns, gospel songs, collective originals, stems, and DAW projects filtered by Worship Team, Band, Choir, or Collective.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openChoraEnv({ room: 'tracklist' })}
              className="w-full px-3 py-2 rounded-xl bg-emerald-400 text-black text-xs font-black inline-flex items-center justify-center gap-1.5"
            >
              <ListMusic size={12} /> Open Chora Tracklist Environment →
            </button>
          </div>

          {/* 5. Chora Arrange — Setlists & Live Run-of-Show Cue Timer */}
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4 flex flex-col justify-between gap-3 hover:border-emerald-400/60 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                  Chora Arrange ({bundle.arrangements.length} Setlists)
                </span>
                <Timer size={15} className="text-emerald-300" />
              </div>
              <h4 className="text-sm font-black text-white">Setlist Arrangements &amp; Live Cue Timer</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Build Sunday service &amp; concert running orders with per-slot performance keys, ensemble units, energy curves, and a live overrun/underrun cue timer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openChoraEnv({ room: 'arrange', openLiveCueTimer: true })}
              className="w-full px-3 py-2 rounded-xl bg-emerald-400 text-black text-xs font-black inline-flex items-center justify-center gap-1.5"
            >
              <Timer size={12} /> Open Chora Arrange &amp; Live Timer →
            </button>
          </div>

          {/* 6. Chora Studio DAW, Mastering Desk & Live Mixer */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between gap-3 hover:border-indigo-400/40 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Chora Instrument Tier
                </span>
                <Drum size={15} className="text-indigo-300" />
              </div>
              <h4 className="text-sm font-black text-white">Chora Studio DAW, Mastering &amp; Mixer</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Track stems, click tracks, and backing beds in Chora Studio DAW, master arrangements in the Mastering Desk, or mix live in Chora Mixer.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => openChoraEnv({ room: 'beats' })}
                className="px-2 py-2 rounded-xl bg-indigo-400 text-black text-[11px] font-black inline-flex items-center justify-center gap-1"
              >
                <Drum size={11} /> DAW
              </button>
              <button
                type="button"
                onClick={() => openChoraEnv({ room: 'master' })}
                className="px-2 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1"
              >
                <Disc3 size={11} /> Master
              </button>
              <button
                type="button"
                onClick={() => openChoraEnv({ room: 'mixer' })}
                className="px-2 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1"
              >
                <Sliders size={11} /> Mixer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          CONNECTED CHORA SETLIST ARRANGEMENTS & SONG REPERTOIRE DEEP-LINKS
          ===================================================================== */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Left 5 Cols: Active Setlist Arrangements in Chora Arrange */}
        <div className="lg:col-span-5 rounded-3xl border border-white/10 bg-[#0d0a17] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                Chora Arrange · Connected Setlists
              </p>
              <h4 className="text-base font-black text-white">
                Service &amp; Concert Running Orders ({bundle.arrangements.length})
              </h4>
            </div>
            <button
              type="button"
              onClick={() => openChoraEnv({ room: 'arrange', openLiveCueTimer: true })}
              className="px-3 py-1.5 rounded-xl bg-emerald-400/20 text-emerald-200 border border-emerald-400/40 text-[11px] font-black inline-flex items-center gap-1"
            >
              Open Arrange <ExternalLink size={11} />
            </button>
          </div>

          <div className="space-y-3">
            {bundle.arrangements.map(arr => {
              const byId = new Map(bundle.songs.map(s => [s.id, s]));
              return (
                <div
                  key={arr.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-white">{arr.name}</p>
                      <p className="text-[11px] text-white/55">
                        {arr.serviceDate || 'Upcoming Gathering'}
                        {arr.liturgicalTheme ? ` · ${arr.liturgicalTheme}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openChoraEnv({
                          room: 'arrange',
                          arrangementId: arr.id,
                          openLiveCueTimer: true,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-amber-400 text-black text-[10px] font-black shrink-0 inline-flex items-center gap-1"
                    >
                      <Timer size={10} /> Cue Timer →
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {arr.songIds.map((sid, idx) => {
                      const s = byId.get(sid);
                      if (!s) return null;
                      const cue = arr.slotCues?.[sid];
                      const subMeta = MUSIC_SUB_DEPARTMENTS.find(d => d.key === cue?.assignedSubDept);
                      return (
                        <div
                          key={`${arr.id}_${sid}_${idx}`}
                          className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">
                              {idx + 1}. {s.title}
                            </p>
                            <p className="text-[10px] text-white/55 truncate">
                              Key {cue?.performanceKey || s.keySig || 'G'} · {cue?.bpm || s.tempo || 84} BPM
                              {subMeta ? ` · ${subMeta.emoji} ${subMeta.shortLabel}` : ''}
                              {cue?.momentInService ? ` · ${cue.momentInService}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                openChoraEnv({ room: 'pad', padMode: 'stand', songId: s.id })
                              }
                              className="px-2 py-1 rounded-lg bg-amber-400/20 text-amber-200 border border-amber-400/35 text-[10px] font-black"
                              title="Open song in Chora Music Stand & Nashville Mode"
                            >
                              Stand
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openChoraEnv({ room: 'pad', padMode: 'lyrics', songId: s.id })
                              }
                              className="px-2 py-1 rounded-lg bg-white/10 text-white text-[10px] font-bold"
                              title="Open song in Chora Writing Pad"
                            >
                              Pad
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 7 Cols: Connected Chora Song Repertoire with Direct Deep-Links */}
        <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-[#0d0a17] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                Chora Tracklist &amp; Pad · Connected Repertoire
              </p>
              <h4 className="text-base font-black text-white">
                {activeSubDept === 'ALL'
                  ? `All Department Songs (${filteredSongs.length})`
                  : `${MUSIC_SUB_DEPARTMENTS.find(d => d.key === activeSubDept)?.name} Songs (${filteredSongs.length})`}
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter songs or keys..."
                  className="bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="button"
                onClick={() => openChoraEnv({ room: 'tracklist' })}
                className="px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-200 border border-amber-400/40 text-[11px] font-black inline-flex items-center gap-1"
              >
                Full Tracklist <ExternalLink size={11} />
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {filteredSongs.map(song => (
              <div
                key={song.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 flex flex-wrap items-center justify-between gap-3 hover:border-white/25 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
                      {song.sacredCategory === 'GOSPEL'
                        ? 'Gospel'
                        : song.sacredCategory === 'HYMN'
                        ? 'Hymn'
                        : 'Original / Collective'}
                    </span>
                    <p className="text-sm font-black text-white truncate">{song.title}</p>
                    <span className="text-[10px] font-mono text-amber-200 px-2 py-0.5 rounded bg-white/5">
                      Key {song.keySig || 'G'} · {song.tempo || 84} BPM · {fmtDuration(songDuration(song) || 210)}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/55 truncate mt-0.5">
                    {song.workingTitle || church.name}
                    {song.chordProgression?.length
                      ? ` · Chords: ${song.chordProgression.join(' - ')}`
                      : ''}
                  </p>
                </div>

                {/* Direct Environment Links per Song */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openChoraEnv({ room: 'pad', padMode: 'lyrics', songId: song.id })}
                    className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[10px] font-black inline-flex items-center gap-1"
                    title="Open in Chora Writing Pad"
                  >
                    <PenLine size={11} /> Pad
                  </button>
                  <button
                    type="button"
                    onClick={() => openChoraEnv({ room: 'pad', padMode: 'stand', songId: song.id })}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-400 text-black text-[10px] font-black inline-flex items-center gap-1"
                    title="Open in Chora Music Stand & Nashville Number System"
                  >
                    <BookOpen size={11} /> Stand · Nashville
                  </button>
                  <button
                    type="button"
                    onClick={() => openChoraEnv({ room: 'pad', padMode: 'score', songId: song.id })}
                    className="px-2.5 py-1.5 rounded-xl bg-cyan-400/20 text-cyan-200 border border-cyan-400/35 text-[10px] font-bold inline-flex items-center gap-1"
                    title="Open in Chora Sheet Music Score"
                  >
                    <Music size={11} /> Score
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleOpenSongInTela(song); }}
                    className="px-2.5 py-1.5 rounded-xl bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/35 text-[10px] font-bold inline-flex items-center gap-1"
                    title="Open in Tela Songwriting Canvas"
                  >
                    <FileText size={11} /> Tela
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handlePushSongToStageProjection(song); }}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-200 border border-emerald-400/35 text-[10px] font-bold inline-flex items-center gap-1"
                    title="Push to Live Stage Projection (Ambo)"
                  >
                    <Radio size={11} /> Stage
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChurchMusicDepartmentHub;
