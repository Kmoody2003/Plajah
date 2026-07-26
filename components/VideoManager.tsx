import React, { useState, useEffect, useRef } from 'react';
import { Video, VideoPlaylist, Album, Track } from '../types';
import { fetchUserVideos, deleteVideo, updateVideoSettings, fetchVideoPlaylists, createVideoPlaylist, fetchUserAlbums, updateAlbum, updateUserProfile, uploadVideo, activateFastChannel, updateFastChannelEnabled } from '../services/backendService';
import { Video as VideoIcon, Plus, Trash2, ArrowLeft, Play, Settings, ListMusic, Check, X, Globe, Lock, Tv, Layers, Radio, ShieldCheck, Upload, Film, Image as ImageIcon, AlertCircle } from 'lucide-react';
import UploadManager from './UploadManager';
import PodcastManager from './PodcastManager';
import FastChannelManager from './FastChannelManager';
import { motion, AnimatePresence } from 'motion/react';

interface VideoManagerProps {
  user: any;
  onBack: () => void;
}

const VideoManager: React.FC<VideoManagerProps> = ({ user, onBack }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [selectedVideoForProject, setSelectedVideoForProject] = useState<Video | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'VIDEOS' | 'PLAYLISTS'>('VIDEOS');
  const [showPlaylistCreator, setShowPlaylistCreator] = useState(false);
  const [editingPodcastVideo, setEditingPodcastVideo] = useState<Video | null>(null);
  const [newPlaylist, setNewPlaylist] = useState({ title: '', description: '' });
  const [fastChannelEnabled, setFastChannelEnabled] = useState<boolean>(user?.fastChannelEnabled ?? false);
  const [isActivatingFast, setIsActivatingFast] = useState(false);
  const [fastActivationMsg, setFastActivationMsg] = useState<string | null>(null);
  const [showFastChannelManager, setShowFastChannelManager] = useState(false);
  const [showRightsModal, setShowRightsModal] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [migratingId, setMigratingId] = useState<string | null>(null);   // video being sent to Mux
  const [bulkOpt, setBulkOpt] = useState<{ running: boolean; done: number; total: number; current?: string; result?: { eligible: number; optimized: number; failed: number } } | null>(null);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    genre: '',
    isPrivate: false,
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadThumb, setUploadThumb] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, [user.uid]);

  // Videos that would benefit from a Mux transcode: a raw upload with a URL, not already on Mux,
  // not an external embed Mux can't ingest.
  const eligibleForMux = videos.filter(v =>
    !v.muxPlaybackId && !(v as any).muxUploadId && !!v.url &&
    !v.url.includes('youtube.com') && !v.url.includes('youtu.be') && !v.url.includes('vimeo.com'));

  const handleBulkOptimize = async () => {
    if (!eligibleForMux.length || bulkOpt?.running) return;
    if (!window.confirm(
      `Optimize ${eligibleForMux.length} film${eligibleForMux.length === 1 ? '' : 's'} for smooth HLS streaming?\n\n` +
      `Each is ingested into Mux for adaptive streaming (fixes choppy TV playback). This creates a Mux asset per film, ` +
      `which has encoding + storage cost. Continue?`)) return;
    setBulkOpt({ running: true, done: 0, total: eligibleForMux.length });
    try {
      const { bulkOptimizeVideosToMux } = await import('../services/backendService');
      const result = await bulkOptimizeVideosToMux(videos, (done, total, current) =>
        setBulkOpt({ running: true, done, total, current }));
      await loadData();   // reflect the new muxPlaybackIds
      setBulkOpt({ running: false, done: result.eligible, total: result.eligible, result });
    } catch (e: any) {
      setBulkOpt(null);
      alert('Bulk optimize failed: ' + (e?.message || e));
    }
  };

  const handleSubmitUpload = async () => {
    if (!uploadFile || !uploadForm.title.trim()) return;
    setIsSubmitting(true);
    setUploadError('');
    setUploadProgress(0);
    try {
      await uploadVideo(
        {
          title: uploadForm.title.trim(),
          description: uploadForm.description.trim(),
          genre: uploadForm.genre || 'General',
          isPrivate: uploadForm.isPrivate,
          file: uploadFile,
          thumbnailFile: uploadThumb || undefined,
        },
        (p) => setUploadProgress(Math.round(p))
      );
      setIsUploading(false);
      setUploadForm({ title: '', description: '', genre: '', isPrivate: false });
      setUploadFile(null);
      setUploadThumb(null);
      setUploadProgress(0);
      loadData();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleFastChannel = async () => {
    const next = !fastChannelEnabled;
    setFastChannelEnabled(next);
    setFastActivationMsg(null);
    if (next) {
      // One-tap: enable + auto-build a real, playable, published channel from their videos so there's
      // nothing to set up. They get manual control (rearrange, prune, ads) in Manage Channel after.
      setIsActivatingFast(true);
      try {
        const { seededVideoCount } = await activateFastChannel(user.uid, { displayName: user.displayName });
        await loadData(); // reflect the auto-opted-in videos in the list
        setFastActivationMsg(
          seededVideoCount > 0
            ? `Channel built with ${seededVideoCount} of your videos — rearrange or fine-tune it anytime in Manage Channel.`
            : 'Channel enabled. Upload or add videos and they’ll appear on your channel automatically.',
        );
      } catch (e) {
        console.error('FAST activation failed', e);
        setFastActivationMsg('Channel enabled, but auto-setup hit a snag — open Manage Channel to build the schedule.');
      } finally {
        setIsActivatingFast(false);
      }
    } else {
      await updateFastChannelEnabled(user.uid, false);
    }
  };

  const loadData = async () => {
    const [vids, pls, userAlbums] = await Promise.all([
      fetchUserVideos(user.uid),
      fetchVideoPlaylists(user.uid),
      fetchUserAlbums(user.uid)
    ]);

    // Include videos from album projects
    const albumVideos: Video[] = userAlbums
      .filter(a => a.type === 'VIDEO')
      .map(a => ({
        id: a.id,
        title: a.title,
        description: a.description || '',
        url: a.tracks?.[0]?.url || '',
        thumbnailUrl: a.coverImage,
        artist: a.artist,
        ownerId: a.ownerId || '',
        timestamp: a.createdAt,
        genre: a.genre,
        allowInFastChannel: (a as any).allowInFastChannel || false
      } as Video));

    // Merge and remove duplicates
    const allVideos = [...vids];
    albumVideos.forEach(av => {
      if (!allVideos.find(v => v.id === av.id)) {
        allVideos.push(av);
      }
    });

    setVideos(allVideos.sort((a, b) => b.timestamp - a.timestamp));
    setPlaylists(pls);
    setUserAlbums(userAlbums);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this video?')) {
      await deleteVideo(id);
      loadData();
    }
  };

  const toggleFastChannel = async (video: Video) => {
    const newValue = !video.allowInFastChannel;
    await updateVideoSettings(video.id, { allowInFastChannel: newValue });
    loadData();
  };

  const handleAddToProject = async (album: Album) => {
    if (!selectedVideoForProject) return;

    try {
      const video = selectedVideoForProject;
      const newTrack: Track = {
        id: `track_${Date.now()}`,
        title: video.title,
        artist: video.artist || user.displayName || 'Artist',
        url: video.url,
        albumId: album.id,
        albumTitle: album.title,
        albumCover: album.coverImage,
        isGlobalArchive: true,
        rightsOwnerId: user.uid
      };

      let updatedAlbum: Partial<Album> = {};

      if (album.subType === 'TV_SERIES') {
        const seasons = [...(album.seasons || [])];
        if (seasons.length === 0) {
          seasons.push({
            id: 's1',
            number: 1,
            episodes: [{ ...video, episodeNumber: 1, seasonNumber: 1 }]
          });
        } else {
          const lastSeason = { ...seasons[seasons.length - 1] };
          lastSeason.episodes = [...lastSeason.episodes, {
            ...video,
            episodeNumber: lastSeason.episodes.length + 1,
            seasonNumber: lastSeason.number
          }];
          seasons[seasons.length - 1] = lastSeason;
        }
        updatedAlbum = { seasons };
      } else {
        const tracks = [...(album.tracks || []), newTrack];
        updatedAlbum = { tracks };
      }

      await updateAlbum(album.id, updatedAlbum);
      setSelectedVideoForProject(null);
      loadData();
    } catch (err) {
      console.error("Error adding to project:", err);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylist.title) return;
    await createVideoPlaylist(newPlaylist);
    setShowPlaylistCreator(false);
    setNewPlaylist({ title: '', description: '' });
    loadData();
  };

  if (showFastChannelManager) {
    return <FastChannelManager user={user} onBack={() => setShowFastChannelManager(false)} />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-xs font-bold uppercase tracking-widest">Back to Dashboard</span>
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
          <div>
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Video Manager</h1>
            <p className="text-white/50 text-sm font-bold uppercase tracking-widest">Manage your visual archive & FAST channels</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowRightsModal(true)}
              className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-black uppercase tracking-widest text-[10px] hover:scale-105 transition-all shadow-xl"
            >
              <Plus size={18} />
              Upload Video
            </button>
          </div>
        </div>

        {/* FAST Channel Toggle */}
        <div className="mb-10 p-6 bg-gradient-to-r from-[#6B0099]/10 to-[#D40055]/10 border border-[#6B0099]/20 rounded-2xl">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center shrink-0">
                <Tv size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-white">FAST Channel</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mt-0.5">
                  {isActivatingFast
                    ? 'Building your channel…'
                    : fastChannelEnabled
                      ? `${videos.filter(v => v.allowInFastChannel).length} videos in channel · Always-on broadcast for your fans`
                      : 'Flip on and we build your 24/7 channel automatically — fans watch without signing in'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {fastChannelEnabled && !isActivatingFast && (
                <button
                  onClick={() => setShowFastChannelManager(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all"
                >
                  <Radio size={13} /> Manage Channel
                </button>
              )}
              <button
                onClick={handleToggleFastChannel}
                disabled={isActivatingFast}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 disabled:opacity-60 ${fastChannelEnabled ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055]' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${isActivatingFast ? 'left-4 animate-pulse' : fastChannelEnabled ? 'left-8' : 'left-1'}`} />
              </button>
            </div>
          </div>
          {fastActivationMsg && (
            <p className="mt-4 text-[11px] font-semibold text-white/70 leading-snug border-t border-white/10 pt-3">{fastActivationMsg}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 mb-12 border-b border-white/5">
          {[
            { id: 'VIDEOS', label: 'All Videos', icon: VideoIcon },
            { id: 'PLAYLISTS', label: 'Playlists', icon: ListMusic }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-4 flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all relative ${
                activeTab === tab.id ? 'text-white' : 'text-white/30 hover:text-white/60'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-small-orange rounded-full" />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {editingPodcastVideo ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white/5 border border-white/10 rounded-[3rem] p-12 mb-12"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Podcast & Ad Settings</h2>
                <button onClick={() => setEditingPodcastVideo(null)} className="p-3 bg-white/5 rounded-full text-white/40 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <PodcastManager 
                content={editingPodcastVideo} 
                onUpdate={() => {
                  setEditingPodcastVideo(null);
                  loadData();
                }} 
              />
            </motion.div>
          ) : isUploading ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white/5 border border-white/10 rounded-[3rem] p-12 mb-12"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Upload New Video</h2>
                <button onClick={() => { setIsUploading(false); setUploadFile(null); setUploadThumb(null); setUploadError(''); }} className="p-3 bg-white/5 rounded-full text-white/40 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Left: file pickers */}
                <div className="space-y-6">
                  {/* Video file */}
                  <div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">Video File *</p>
                    <input ref={videoFileRef} type="file" accept="video/*" className="hidden"
                      onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                    <button onClick={() => videoFileRef.current?.click()}
                      className={`w-full flex flex-col items-center gap-3 py-10 rounded-2xl border-2 border-dashed transition-all ${uploadFile ? 'border-small-orange/60 bg-small-orange/5' : 'border-white/10 hover:border-white/30 bg-white/5'}`}>
                      <Film size={28} className={uploadFile ? 'text-small-orange' : 'text-white/20'} />
                      {uploadFile ? (
                        <div className="text-center">
                          <p className="text-white text-sm font-black truncate max-w-[200px]">{uploadFile.name}</p>
                          <p className="text-white/40 text-[10px] font-bold">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-white/60 text-sm font-bold">Click to select video</p>
                          <p className="text-white/20 text-[10px]">MP4, MOV, MKV, AVI, WebM</p>
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Thumbnail */}
                  <div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">Thumbnail (optional)</p>
                    <input ref={thumbFileRef} type="file" accept="image/*" className="hidden"
                      onChange={e => setUploadThumb(e.target.files?.[0] || null)} />
                    <button onClick={() => thumbFileRef.current?.click()}
                      className={`w-full flex flex-col items-center gap-3 py-6 rounded-2xl border-2 border-dashed transition-all ${uploadThumb ? 'border-blue-500/40 bg-blue-500/5' : 'border-white/10 hover:border-white/20 bg-white/5'}`}>
                      <ImageIcon size={20} className={uploadThumb ? 'text-blue-400' : 'text-white/20'} />
                      <p className={`text-xs font-bold ${uploadThumb ? 'text-blue-400' : 'text-white/30'}`}>
                        {uploadThumb ? uploadThumb.name : 'Click to add thumbnail'}
                      </p>
                    </button>
                  </div>
                </div>

                {/* Right: metadata */}
                <div className="space-y-5">
                  <div>
                    <label className="text-white/40 text-[10px] font-black uppercase tracking-widest block mb-2">Title *</label>
                    <input
                      type="text"
                      value={uploadForm.title}
                      onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Enter video title..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/20 outline-none focus:ring-2 ring-small-orange/40 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-white/40 text-[10px] font-black uppercase tracking-widest block mb-2">Description</label>
                    <textarea
                      value={uploadForm.description}
                      onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What's this video about?"
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/20 outline-none focus:ring-2 ring-small-orange/40 resize-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-white/40 text-[10px] font-black uppercase tracking-widest block mb-2">Genre</label>
                    <div className="flex flex-wrap gap-2">
                      {['Music', 'Film', 'Documentary', 'Short', 'Gaming', 'Education', 'Comedy', 'Sports', 'Other'].map(g => (
                        <button key={g} onClick={() => setUploadForm(f => ({ ...f, genre: g }))}
                          className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wide border transition-all ${uploadForm.genre === g ? 'border-small-orange/50 bg-small-orange/20 text-small-orange' : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20'}`}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <div>
                      <p className="text-white text-xs font-black uppercase tracking-widest">Private Video</p>
                      <p className="text-white/30 text-[10px] font-bold mt-0.5">Only visible to you</p>
                    </div>
                    <button onClick={() => setUploadForm(f => ({ ...f, isPrivate: !f.isPrivate }))}
                      className={`relative w-12 h-6 rounded-full transition-all duration-300 ${uploadForm.isPrivate ? 'bg-small-orange' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${uploadForm.isPrivate ? 'left-6' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {uploadError && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                      <AlertCircle size={16} className="text-red-400 shrink-0" />
                      <p className="text-red-400 text-xs">{uploadError}</p>
                    </div>
                  )}

                  {isSubmitting && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Uploading</span><span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div className="h-full bg-small-orange rounded-full" style={{ width: `${uploadProgress}%` }} />
                      </div>
                      <p className="text-white/30 text-[10px] font-bold">Video will be transcoded by Mux after upload completes</p>
                    </div>
                  )}

                  <button
                    onClick={handleSubmitUpload}
                    disabled={!uploadFile || !uploadForm.title.trim() || isSubmitting}
                    className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-small-orange text-black rounded-full font-black uppercase tracking-widest text-[11px] hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,140,0,0.35)] disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Upload size={16} />
                    {isSubmitting ? 'Uploading...' : 'Upload Video'}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'VIDEOS' ? (
            <>
            {/* Bulk "Optimize for Streaming" — Mux-transcode every raw upload in one go so the whole
                catalogue plays smoothly (esp. on TV), instead of hunting title by title. */}
            {(eligibleForMux.length > 0 || bulkOpt) && (
              <div className="mb-8 p-6 rounded-[2rem] bg-purple-500/10 border border-purple-400/20 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-widest text-purple-300 flex items-center gap-2"><Tv size={16} /> Optimize catalogue for streaming</p>
                  {bulkOpt?.running ? (
                    <p className="text-[11px] text-white/55 mt-1 truncate">Optimizing {bulkOpt.done + 1} of {bulkOpt.total}{bulkOpt.current ? ` — ${bulkOpt.current}` : ''}…</p>
                  ) : bulkOpt?.result ? (
                    <p className="text-[11px] text-white/55 mt-1">Done — {bulkOpt.result.optimized} optimized{bulkOpt.result.failed ? `, ${bulkOpt.result.failed} failed` : ''}. Mux finishes encoding in the background; reload in a minute.</p>
                  ) : (
                    <p className="text-[11px] text-white/55 mt-1">{eligibleForMux.length} raw upload{eligibleForMux.length === 1 ? '' : 's'} would stream smoother on TV via Mux HLS.</p>
                  )}
                  {bulkOpt?.running && (
                    <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden max-w-md">
                      <div className="h-full bg-purple-400 transition-all" style={{ width: `${bulkOpt.total ? Math.round((bulkOpt.done / bulkOpt.total) * 100) : 0}%` }} />
                    </div>
                  )}
                </div>
                {!bulkOpt?.result && (
                  <button
                    onClick={handleBulkOptimize}
                    disabled={bulkOpt?.running || eligibleForMux.length === 0}
                    className="shrink-0 px-7 py-4 bg-purple-500/20 text-purple-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Tv size={15} /> {bulkOpt?.running ? 'Optimizing…' : `Optimize all (${eligibleForMux.length})`}
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {videos.map(video => (
                <motion.div 
                  layout
                  key={video.id} 
                  className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden group hover:border-white/20 transition-all"
                >
                  <div className="aspect-video bg-black relative">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl || null} alt={video.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <VideoIcon size={48} className="text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
                      <button className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform shadow-2xl">
                        <Play size={24} className="ml-1" fill="black" />
                      </button>
                    </div>
                    <div className="absolute top-4 right-4 flex gap-2">
                      {video.isPrivate ? (
                        <div className="p-2 bg-black/60 backdrop-blur-md rounded-xl text-white/60"><Lock size={14} /></div>
                      ) : (
                        <div className="p-2 bg-black/60 backdrop-blur-md rounded-xl text-white/60"><Globe size={14} /></div>
                      )}
                    </div>
                  </div>
                  <div className="p-8">
                    <h3 className="text-lg font-black uppercase tracking-tight mb-2 truncate">{video.title}</h3>
                    <p className="text-[10px] font-bold text-white/40 mb-8 line-clamp-2 uppercase tracking-widest leading-relaxed">
                      {video.description || 'No description provided.'}
                    </p>
                    
                    <div className="flex flex-col gap-4">
                      {!video.muxPlaybackId && !video.url.includes('youtube.com') && !video.url.includes('youtu.be') && !video.url.includes('vimeo.com') && (
                        <button
                          disabled={migratingId === video.id}
                          onClick={async () => {
                            // Raw uploads stream progressively (choppy on TVs). This ingests the file
                            // into Mux for adaptive HLS and writes the playback id back, so playback
                            // switches to smooth adaptive streaming.
                            setMigratingId(video.id);
                            try {
                              const { createMuxAssetFromUrl } = await import('../services/backendService');
                              const { updateDoc, doc } = await import('firebase/firestore');
                              const { db } = await import('../services/backendService');
                              const res = await createMuxAssetFromUrl(video.url);
                              if (res.playbackId) {
                                await updateDoc(doc(db, 'videos', video.id), {
                                  muxPlaybackId: res.playbackId,
                                  muxAssetId: res.assetId,
                                });
                                // Reflect it immediately: patch local state so the button clears and
                                // playback uses the new HLS stream without a reload.
                                setVideos(prev => prev.map(v => v.id === video.id ? { ...v, muxPlaybackId: res.playbackId, muxAssetId: res.assetId } : v));
                              } else {
                                alert('Mux is still processing — reload in a minute and the stream will appear.');
                              }
                            } catch (e: any) {
                              alert('Streaming optimization failed: ' + (e?.message || e));
                            } finally {
                              setMigratingId(null);
                            }
                          }}
                          className="w-full py-4 bg-purple-500/10 text-purple-400 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-purple-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                          title="Convert this raw upload to adaptive HLS streaming via Mux — fixes choppy TV playback"
                        >
                          <Tv size={16} /> {migratingId === video.id ? 'Optimizing…' : 'Optimize for Streaming (HLS)'}
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedVideoForProject(video)}
                        className="w-full py-4 bg-blue-500/10 text-blue-400 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2"
                      >
                        <Layers size={16} /> Add to Project
                      </button>
                      <button 
                        onClick={() => toggleFastChannel(video)}
                        className={`w-full py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${
                          video.allowInFastChannel 
                            ? 'bg-small-orange text-white' 
                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        <Tv size={16} />
                        {video.allowInFastChannel ? 'Active in FAST Channel' : 'Add to FAST Channel'}
                      </button>
                      
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setEditingPodcastVideo(video)}
                          className="flex-1 py-4 bg-white/5 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                        >
                          <Settings size={14} /> Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(video.id)}
                          className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
              {videos.length === 0 && (
                <div className="col-span-full text-center py-32 bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                  <VideoIcon size={64} className="mx-auto mb-6 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest text-white/20">No videos found in your archive</p>
                </div>
              )}
            </div>
            </>
          ) : (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black uppercase tracking-tight">Your Playlists</h2>
                <button 
                  onClick={() => setShowPlaylistCreator(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  <Plus size={16} /> New Playlist
                </button>
              </div>

              {showPlaylistCreator && (
                <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <input 
                      type="text"
                      placeholder="Playlist Title"
                      value={newPlaylist.title}
                      onChange={(e) => setNewPlaylist({ ...newPlaylist, title: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 ring-white/20"
                    />
                    <input 
                      type="text"
                      placeholder="Description (Optional)"
                      value={newPlaylist.description}
                      onChange={(e) => setNewPlaylist({ ...newPlaylist, description: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 ring-white/20"
                    />
                  </div>
                  <div className="flex gap-4">
                    <button onClick={handleCreatePlaylist} className="px-8 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest">Create Playlist</button>
                    <button onClick={() => setShowPlaylistCreator(false)} className="px-8 py-3 bg-white/5 rounded-full font-black text-[10px] uppercase tracking-widest">Cancel</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {playlists.map(pl => (
                  <div key={pl.id} className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 hover:border-white/20 transition-all group">
                    <div className="w-16 h-16 bg-small-orange/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <ListMusic size={32} className="text-small-orange" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight mb-2">{pl.title}</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-6">{pl.videoIds.length} Videos</p>
                    <button className="w-full py-4 bg-white/5 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Manage Playlist</button>
                  </div>
                ))}
                {playlists.length === 0 && !showPlaylistCreator && (
                  <div className="col-span-full text-center py-32 bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                    <ListMusic size={64} className="mx-auto mb-6 opacity-20" />
                    <p className="text-xs font-black uppercase tracking-widest text-white/20">No playlists created yet</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Project Selector Modal */}
        <AnimatePresence>
          {selectedVideoForProject && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#0a0a0a] border border-white/10 rounded-[3rem] p-12 max-w-2xl w-full max-h-[80vh] overflow-y-auto custom-scrollbar"
              >
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">Add to Project</h2>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-2">Select a TV Series, Movie or Video Project</p>
                  </div>
                  <button onClick={() => setSelectedVideoForProject(null)} className="p-3 bg-white/5 rounded-full text-white/40 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {userAlbums.filter(a => a.type === 'VIDEO').map(album => (
                    <button
                      key={album.id}
                      onClick={() => handleAddToProject(album)}
                      className="flex items-center gap-6 p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-white/20 transition-all text-left group"
                    >
                      <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 border border-white/10">
                        <img src={album.coverImage || null} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-tight truncate">{album.title}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-white/5 rounded-md text-white/40">
                            {album.subType || 'Video Project'}
                          </span>
                          <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">
                            {album.tracks?.length || 0} Items
                          </span>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover:bg-white group-hover:text-black transition-all">
                        <Plus size={20} />
                      </div>
                    </button>
                  ))}
                  {userAlbums.filter(a => a.type === 'VIDEO').length === 0 && (
                    <div className="text-center py-20 opacity-20">
                      <p className="text-xs font-black uppercase tracking-widest">No video projects found</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Rights Confirmation Modal */}
      <AnimatePresence>
        {showRightsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowRightsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 shadow-3xl"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-small-orange/10 rounded-2xl">
                  <ShieldCheck size={22} className="text-small-orange" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-widest text-white">Content Rights Declaration</h3>
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Required before upload</p>
                </div>
              </div>

              <label className="flex items-start gap-4 cursor-pointer group mb-8">
                <button
                  type="button"
                  onClick={() => setRightsConfirmed(v => !v)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${rightsConfirmed ? 'bg-small-orange border-small-orange' : 'border-white/30 group-hover:border-white/60'}`}
                >
                  {rightsConfirmed && <Check size={12} className="text-white" />}
                </button>
                <p className="text-[10px] font-medium text-white/60 leading-relaxed">
                  I hereby declare, under penalty of applicable law, that I am the original creator of or hold all necessary intellectual property rights, licenses, and permissions to upload, store, and distribute this video content. I confirm this upload does not infringe any copyright, trademark, right of publicity, privacy right, or any other proprietary right of any third party, and that I am in full compliance with all applicable federal, state, and international laws including the Digital Millennium Copyright Act (DMCA). I understand that uploading content I do not own violates Plajah's Terms of Service and may result in immediate content removal, account suspension, and potential legal liability.
                </p>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowRightsModal(false)}
                  className="flex-1 py-4 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/30 transition-all"
                >
                  Cancel
                </button>
                <button
                  disabled={!rightsConfirmed}
                  onClick={() => {
                    setShowRightsModal(false);
                    setIsUploading(true);
                  }}
                  className="flex-1 py-4 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95"
                >
                  Confirm & Upload
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoManager;
