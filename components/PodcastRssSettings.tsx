import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Rss, Link2, Check, AlertCircle, RefreshCw, Play, Pause,
  Download, Copy, Radio, ExternalLink, ChevronDown,
  Clock, Calendar, Mic2, Globe, RotateCcw, Loader2,
  Music, BookOpen, Info,
} from 'lucide-react';
import {
  auth,
  savePodcastRssSettings,
  fetchPodcastRssSettings,
  syncImportedEpisodes,
  fetchImportedEpisodes,
  fetchUserAlbums,
} from '../services/backendService';
import { fetchAndParseRss, validateRssUrl } from '../services/podcastRssImporter';
import { generatePodcastRSS, PODCAST_DIRECTORIES } from '../services/podcastRSSService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import type { ImportedRssEpisode, PodcastRssSettings as PodcastRssSettingsType, Album, Track } from '../types';

type InnerTab = 'import' | 'episodes' | 'distribute';

// ── Small helpers ─────────────────────────────────────────────────────────────

function formatDuration(dur?: string): string {
  if (!dur) return '';
  const parts = dur.split(':').map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return `${m}m ${s}s`;
  }
  return dur;
}

function formatDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(ts?: number): string {
  if (!ts) return 'Never';
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ── Episode card ──────────────────────────────────────────────────────────────

function EpisodeCard({
  ep,
  isPlaying,
  onPlay,
}: {
  ep: ImportedRssEpisode;
  isPlaying: boolean;
  onPlay: (ep: ImportedRssEpisode) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.04] transition-all group"
    >
      <div className="relative shrink-0">
        {ep.imageUrl ? (
          <img
            src={ep.imageUrl}
            alt=""
            className="w-14 h-14 rounded-xl object-cover border border-white/10"
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Mic2 size={20} className="text-white/20" />
          </div>
        )}
        <button
          onClick={() => onPlay(ep)}
          className={`absolute inset-0 flex items-center justify-center rounded-xl transition-all ${
            isPlaying
              ? 'bg-orange-500/80 opacity-100'
              : 'bg-black/60 opacity-0 group-hover:opacity-100'
          }`}
        >
          {isPlaying ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white" />}
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{ep.title}</p>
        {ep.description && (
          <p className="text-xs text-white/35 leading-snug mt-0.5 line-clamp-2">{ep.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          {ep.pubDate && (
            <span className="flex items-center gap-1 text-[10px] text-white/25 font-bold">
              <Calendar size={9} />
              {formatDate(ep.pubDate)}
            </span>
          )}
          {ep.duration && (
            <span className="flex items-center gap-1 text-[10px] text-white/25 font-bold">
              <Clock size={9} />
              {formatDuration(ep.duration)}
            </span>
          )}
          {ep.episodeNumber && (
            <span className="text-[10px] text-orange-400/60 font-black">EP {ep.episodeNumber}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Directory card ────────────────────────────────────────────────────────────

function DirCard({ dir }: { dir: (typeof PODCAST_DIRECTORIES)[0] }) {
  return (
    <a
      href={dir.submitUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-4 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.04] transition-all group"
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${dir.color}18` }}
      >
        <Radio size={14} style={{ color: dir.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-widest text-white group-hover:text-white/80">
          {dir.name}
        </p>
        <p className="text-[9px] text-white/25 mt-0.5">{dir.instructions}</p>
      </div>
      <ExternalLink size={12} className="text-white/15 group-hover:text-white/40 transition-all shrink-0 mt-0.5" />
    </a>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PodcastRssSettings() {
  const [innerTab, setInnerTab] = useState<InnerTab>('import');

  // External RSS state
  const [inputUrl, setInputUrl]             = useState('');
  const [settings, setSettings]             = useState<PodcastRssSettingsType | null>(null);
  const [previewing, setPreviewing]         = useState(false);
  const [previewResult, setPreviewResult]   = useState<{
    title?: string; description?: string; imageUrl?: string; episodeCount?: number;
  } | null>(null);
  const [previewError, setPreviewError]     = useState('');
  const [syncing, setSyncing]               = useState(false);
  const [syncDone, setSyncDone]             = useState(false);
  const [syncError, setSyncError]           = useState('');

  // Episodes state
  const [episodes, setEpisodes]             = useState<ImportedRssEpisode[]>([]);
  const [loadingEps, setLoadingEps]         = useState(false);

  // Native distribution state
  const [albums, setAlbums]                 = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [copied, setCopied]                 = useState(false);
  const [xmlCopied, setXmlCopied]           = useState(false);
  const [loadingAlbums, setLoadingAlbums]   = useState(false);

  const { currentTrack, playTrack } = useGlobalPlayerState();

  // ── Load on mount ──

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    fetchPodcastRssSettings().then(s => {
      if (s) {
        setSettings(s);
        if (s.externalFeedUrl) setInputUrl(s.externalFeedUrl);
      }
    });

    setLoadingEps(true);
    fetchImportedEpisodes(uid).then(eps => {
      setEpisodes(eps);
      setLoadingEps(false);
    });
  }, []);

  useEffect(() => {
    if (innerTab !== 'distribute') return;
    setLoadingAlbums(true);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    fetchUserAlbums(uid).then(all => {
      const pods = all.filter(
        a => a.type === 'MUSIC' && (a.subType === 'PODCAST' || (a.tracks ?? []).some(t => t.podcastMetadata))
      );
      setAlbums(pods);
      if (pods.length > 0 && !selectedAlbumId) setSelectedAlbumId(pods[0].id);
      setLoadingAlbums(false);
    });
  }, [innerTab]);

  // ── Actions ──

  const handlePreview = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) return;
    setPreviewing(true);
    setPreviewError('');
    setPreviewResult(null);
    const result = await validateRssUrl(url);
    if (result.valid) {
      setPreviewResult({
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        episodeCount: result.episodeCount,
      });
    } else {
      setPreviewError(result.error ?? 'Could not read feed');
    }
    setPreviewing(false);
  }, [inputUrl]);

  const handleSaveAndSync = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) return;
    setSyncing(true);
    setSyncError('');
    setSyncDone(false);
    try {
      const feed = await fetchAndParseRss(url);
      const newSettings: PodcastRssSettingsType = {
        externalFeedUrl: url,
        feedTitle: feed.title,
        feedDescription: feed.description,
        feedImageUrl: feed.imageUrl,
        syncEnabled: true,
        lastSynced: Date.now(),
        importedEpisodeCount: feed.episodes.length,
        isExplicit: feed.isExplicit,
        language: feed.language,
        category: feed.category,
      };
      await savePodcastRssSettings(newSettings);
      await syncImportedEpisodes(feed.episodes);
      setSettings(newSettings);
      setEpisodes(feed.episodes);
      setPreviewResult({
        title: feed.title,
        description: feed.description,
        imageUrl: feed.imageUrl,
        episodeCount: feed.episodes.length,
      });
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } catch (err: any) {
      setSyncError(err.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [inputUrl]);

  const handleResync = useCallback(async () => {
    if (!settings?.externalFeedUrl) return;
    setSyncing(true);
    setSyncError('');
    setSyncDone(false);
    try {
      const feed = await fetchAndParseRss(settings.externalFeedUrl);
      const updated = { ...settings, lastSynced: Date.now(), importedEpisodeCount: feed.episodes.length };
      await savePodcastRssSettings(updated);
      await syncImportedEpisodes(feed.episodes);
      setSettings(updated);
      setEpisodes(feed.episodes);
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } catch (err: any) {
      setSyncError(err.message ?? 'Resync failed');
    } finally {
      setSyncing(false);
    }
  }, [settings]);

  const playEpisode = useCallback((ep: ImportedRssEpisode) => {
    const track: Track = {
      id: ep.id,
      title: ep.title,
      artist: settings?.feedTitle ?? 'Podcast',
      artistId: auth.currentUser?.uid,
      url: ep.audioUrl,
      albumCover: ep.imageUrl,
      duration: 0,
      isRadioEligible: false,
      isSlideshowEligible: false,
      likes: 0,
      isExclusive: false,
      albumId: '',
      albumTitle: settings?.feedTitle ?? '',
    };
    playTrack(track, null, 'LIBRARY');
  }, [settings, playTrack]);

  // ── Native distribution helpers ──

  const selectedAlbum = albums.find(a => a.id === selectedAlbumId);
  const rssXml = selectedAlbum
    ? generatePodcastRSS(selectedAlbum, { siteUrl: window.location.origin })
    : '';
  const feedUrl = selectedAlbum ? `${window.location.origin}/rss/${selectedAlbum.id}` : '';

  const copyFeedUrl = () => {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const copyXML = () => {
    navigator.clipboard.writeText(rssXml);
    setXmlCopied(true);
    setTimeout(() => setXmlCopied(false), 2000);
  };
  const downloadXML = () => {
    if (!selectedAlbum) return;
    const blob = new Blob([rssXml], { type: 'application/xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${selectedAlbum.title.replace(/\s+/g, '_')}_podcast.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Tabs ──

  const tabs: { id: InnerTab; label: string; icon: React.ElementType }[] = [
    { id: 'import',    label: 'RSS Import',  icon: Rss },
    { id: 'episodes',  label: 'Episodes',    icon: Mic2 },
    { id: 'distribute', label: 'Distribute', icon: Radio },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">
          Podcast<br />RSS
        </h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">
          Import your feed · sync episodes · distribute everywhere
        </p>
      </div>

      {/* Inner tab bar */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setInnerTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              innerTab === t.id
                ? 'bg-orange-500 text-black shadow-lg'
                : 'text-white/35 hover:text-white/60'
            }`}
          >
            {React.createElement(t.icon as any, { size: 13 })}
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── IMPORT TAB ── */}
        {innerTab === 'import' && (
          <motion.div
            key="import"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {/* Current feed status */}
            {settings?.externalFeedUrl && (
              <div className="flex items-start gap-4 p-5 rounded-2xl bg-green-500/8 border border-green-500/20">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
                  {settings.feedImageUrl ? (
                    <img src={settings.feedImageUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <Rss size={16} className="text-green-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{settings.feedTitle || 'Connected Feed'}</p>
                  <p className="text-[10px] text-white/35 truncate mt-0.5">{settings.externalFeedUrl}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-[10px] text-green-400/70 font-bold">
                      {settings.importedEpisodeCount ?? 0} episodes synced
                    </span>
                    <span className="text-[10px] text-white/25 font-bold">
                      Last synced {timeAgo(settings.lastSynced)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleResync}
                  disabled={syncing}
                  title="Re-sync now"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-wider shrink-0"
                >
                  {syncing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  Sync
                </button>
              </div>
            )}

            {/* URL input */}
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 block">
                Your Podcast RSS Feed URL
              </label>
              <div className="flex gap-3">
                <div className="flex-1 flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] rounded-2xl px-4 py-3 focus-within:border-orange-500/40 transition-colors">
                  <Link2 size={14} className="text-white/20 shrink-0" />
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={e => { setInputUrl(e.target.value); setPreviewResult(null); setPreviewError(''); }}
                    placeholder="https://feeds.buzzsprout.com/your-show.rss"
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
                  />
                </div>
                <button
                  onClick={handlePreview}
                  disabled={!inputUrl.trim() || previewing}
                  className="px-5 py-3 rounded-2xl bg-white/8 border border-white/10 text-xs font-black uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/12 transition-all disabled:opacity-40 shrink-0"
                >
                  {previewing ? <Loader2 size={13} className="animate-spin" /> : 'Validate'}
                </button>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 px-1">
                <Info size={11} className="text-white/20 shrink-0 mt-0.5" />
                <p className="text-[9px] text-white/25 leading-relaxed">
                  Paste the RSS feed URL from your podcast host (Buzzsprout, Anchor, Libsyn, Transistor, etc.).
                  Plajah will import your episodes so they play natively on the platform.
                </p>
              </div>
            </div>

            {/* Validation error */}
            {previewError && (
              <div className="flex items-start gap-2 p-4 rounded-xl bg-red-500/8 border border-red-500/20">
                <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{previewError}</p>
              </div>
            )}

            {/* Feed preview */}
            {previewResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-4"
              >
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Feed Preview</p>
                <div className="flex items-center gap-4">
                  {previewResult.imageUrl && (
                    <img
                      src={previewResult.imageUrl}
                      alt=""
                      className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white">{previewResult.title}</p>
                    {previewResult.description && (
                      <p className="text-xs text-white/40 leading-relaxed mt-1 line-clamp-3">
                        {previewResult.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6 pt-2 border-t border-white/5">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Episodes</p>
                    <p className="text-2xl font-black text-white mt-0.5">{previewResult.episodeCount ?? 0}</p>
                  </div>
                  <div className="flex items-center gap-2 text-green-400">
                    <Check size={14} />
                    <span className="text-xs font-black">Valid podcast feed</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Save & Sync CTA */}
            {(previewResult || inputUrl.trim()) && (
              <div className="space-y-3">
                <button
                  onClick={handleSaveAndSync}
                  disabled={syncing || !inputUrl.trim()}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-orange-500 text-black font-black uppercase tracking-wider text-sm hover:bg-orange-400 transition-all disabled:opacity-50"
                >
                  {syncing ? (
                    <><Loader2 size={16} className="animate-spin" /> Syncing episodes…</>
                  ) : syncDone ? (
                    <><Check size={16} /> Synced successfully!</>
                  ) : (
                    <><RefreshCw size={16} /> Save &amp; Sync Episodes</>
                  )}
                </button>
                {syncError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/20">
                    <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{syncError}</p>
                  </div>
                )}
                <p className="text-[9px] text-white/20 text-center">
                  Episodes are imported into Plajah so listeners can play them natively.
                  Your original host continues to distribute to Apple, Spotify, etc.
                </p>
              </div>
            )}

            {/* What happens section */}
            {!settings?.externalFeedUrl && !previewResult && (
              <div className="grid grid-cols-1 gap-3 pt-4">
                {[
                  {
                    icon: Globe,
                    title: 'On-Platform Playback',
                    body: "Imported episodes play natively in Plajah's audio player. Listeners never leave the platform.",
                  },
                  {
                    icon: RefreshCw,
                    title: 'Sync Your Feed',
                    body: 'Sync whenever you publish new episodes to keep your Plajah library current.',
                  },
                  {
                    icon: Radio,
                    title: 'Distribute Everywhere',
                    body: 'Generate a Plajah RSS feed from your native albums and submit it to every major directory.',
                  },
                ].map(item => (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
                  >
                    <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center shrink-0">
                      <item.icon size={15} className="text-orange-400" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-white">{item.title}</p>
                      <p className="text-[10px] text-white/30 mt-0.5 leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── EPISODES TAB ── */}
        {innerTab === 'episodes' && (
          <motion.div
            key="episodes"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Episode count header */}
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                {episodes.length} Imported Episodes
              </p>
              {settings?.externalFeedUrl && (
                <button
                  onClick={handleResync}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-[10px] font-black uppercase tracking-wider text-white/40 hover:text-white transition-all"
                >
                  {syncing ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                  Refresh
                </button>
              )}
            </div>

            {loadingEps ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/20">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-xs font-bold">Loading episodes…</p>
              </div>
            ) : episodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 border-2 border-dashed border-white/[0.05] rounded-[2rem] text-center">
                <Mic2 size={32} className="text-white/12" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/20">No episodes yet</p>
                  <p className="text-[10px] text-white/15 mt-1">
                    Go to the RSS Import tab, paste your feed URL, and click Save &amp; Sync.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {episodes.map(ep => (
                  <EpisodeCard
                    key={ep.id}
                    ep={ep}
                    isPlaying={currentTrack?.id === ep.id}
                    onPlay={playEpisode}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── DISTRIBUTE TAB ── */}
        {innerTab === 'distribute' && (
          <motion.div
            key="distribute"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-8"
          >
            {/* Native Plajah RSS */}
            <section className="space-y-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                  Native Plajah RSS Feed
                </p>
                <p className="text-[10px] text-white/20 mt-1">
                  Generate an RSS feed from your Plajah podcast albums to submit to directories.
                </p>
              </div>

              {loadingAlbums ? (
                <div className="flex items-center gap-2 text-white/30 text-xs">
                  <Loader2 size={13} className="animate-spin" />
                  Loading podcast albums…
                </div>
              ) : albums.length === 0 ? (
                <div className="flex items-start gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <Music size={16} className="text-white/20 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-white/40">No podcast albums found</p>
                    <p className="text-[10px] text-white/20 mt-0.5">
                      Create an album with subType "PODCAST" or add podcast metadata to your tracks in Music Studio.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Album selector */}
                  <div className="relative w-full max-w-sm">
                    <select
                      value={selectedAlbumId}
                      onChange={e => setSelectedAlbumId(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10"
                    >
                      {albums.map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  </div>

                  {selectedAlbum && (
                    <>
                      {/* Feed URL */}
                      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">
                          Your RSS Feed URL
                        </p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-black/40 border border-white/8 rounded-xl px-4 py-3 font-mono text-xs text-white/50 truncate">
                            {feedUrl}
                          </div>
                          <button
                            onClick={copyFeedUrl}
                            className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest bg-violet-500/15 text-violet-400 hover:bg-violet-500/20 border border-violet-500/25 transition-all shrink-0"
                          >
                            {copied ? <Check size={11} /> : <Copy size={11} />}
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>

                        <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-400/[0.06] border border-yellow-400/15">
                          <AlertCircle size={11} className="text-yellow-400 shrink-0 mt-0.5" />
                          <p className="text-[9px] text-white/30 leading-relaxed">
                            This URL requires a live hosting endpoint. Download the XML and serve it via Firebase Hosting,
                            or use it with a podcast CDN.
                          </p>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={downloadXML}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/6 text-white/40 hover:text-white transition-all"
                          >
                            <Download size={11} /> Download .xml
                          </button>
                          <button
                            onClick={copyXML}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/6 text-white/40 hover:text-white transition-all"
                          >
                            {xmlCopied ? <Check size={11} /> : <Copy size={11} />}
                            {xmlCopied ? 'Copied!' : 'Copy XML'}
                          </button>
                        </div>
                      </div>

                      {/* Episode stats */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Episodes',  value: selectedAlbum.tracks?.length ?? 0 },
                          { label: 'Free',      value: selectedAlbum.tracks?.filter(t => !t.isPaywalled).length ?? 0 },
                          { label: 'Members',   value: selectedAlbum.tracks?.filter(t => t.isPaywalled).length ?? 0 },
                        ].map(s => (
                          <div key={s.label} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 text-center">
                            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
                            <p className="text-2xl font-black text-white">{s.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* RSS preview */}
                      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Feed Preview</p>
                        <pre className="text-[8px] text-white/25 leading-relaxed overflow-x-auto max-h-40 bg-black/20 rounded-xl p-4">
                          {rssXml.slice(0, 1000)}…
                        </pre>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>

            {/* Directory submission */}
            <section className="space-y-4">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                Submit to Podcast Directories
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PODCAST_DIRECTORIES.map(dir => (
                  <DirCard key={dir.id} dir={dir} />
                ))}
              </div>
            </section>

            {/* Podcast Index */}
            <section>
              <a
                href="https://podcastindex.org/add"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.04] transition-all group"
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/15">
                  <BookOpen size={14} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-widest text-white group-hover:text-white/80">
                    Podcast Index
                  </p>
                  <p className="text-[9px] text-white/25 mt-0.5">
                    Open-source podcast namespace — free listing for all podcasts
                  </p>
                </div>
                <ExternalLink size={12} className="text-white/15 group-hover:text-white/40 transition-all shrink-0" />
              </a>
            </section>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
}
