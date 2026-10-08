import { thumb, onThumbError, THUMB } from '../../src/lib/imageThumb';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Download, Sparkles, Play, Pause, Copy, Check, ExternalLink,
  Film, Layers, Loader2, Music2, CheckCircle2, ChevronRight, Share2, Disc3
} from 'lucide-react';
import type { Album, UserProfile } from '../../types';
import type { PromoFormat, PromoRecipe, PromoRelease, PromoTemplateId, PromoDsp } from '../../services/chora/promoTypes';
import { PROMO_FORMATS, PROMO_SUITES, DSP_NAMES } from '../../services/chora/promoTypes';
import { createPromoRecipe, promoCaption } from '../../services/chora/promoGeneratorService';
import { createPromoScene, promoSceneSvg, promoTelaDocument, type PromoArtwork } from '../../services/chora/promoPresets';
import {
  preparePromoArtwork, exportPromoBundle, exportPromoMotion,
  exportPromoPng, downloadPromo, promoFilename
} from '../../services/chora/promoExportService';

interface ChoraPromoModalProps {
  album: Album;
  currentUser?: UserProfile | null;
  onClose: () => void;
  onOpenTela?: (documentId: string) => void;
}

export const ChoraPromoModal: React.FC<ChoraPromoModalProps> = ({
  album,
  currentUser,
  onClose,
  onOpenTela,
}) => {
  const directUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/album/${album.id}`
    : `https://plajah.com/album/${album.id}`;

  const release: PromoRelease = useMemo(() => ({
    id: album.id,
    ownerId: album.artistId || currentUser?.uid || 'local',
    title: album.title || 'Untitled',
    artist: album.artist || currentUser?.displayName || 'Artist',
    coverImage: album.coverImage || '',
    releaseDate: album.releaseDate,
    isScheduled: album.isScheduled,
    tracks: album.tracks || [],
    autoPromo: (album as any).autoPromo,
  }), [album, currentUser]);

  const [recipe, setRecipe] = useState<PromoRecipe>(() => createPromoRecipe(release));
  const [suite, setSuite] = useState<PromoTemplateId>(recipe.template || 'kinetic-pulse');
  const [format, setFormat] = useState<PromoFormat>('story');

  const [artwork, setArtwork] = useState<PromoArtwork | undefined>(undefined);
  const [loadingArtwork, setLoadingArtwork] = useState<boolean>(false);

  const [exportingZip, setExportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState('');
  const [exportingVideo, setExportingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  const [copiedCaption, setCopiedCaption] = useState(false);
  const [activeSnippetIdx, setActiveSnippetIdx] = useState<number>(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load and prepare raster artwork for SVG/Canvas rendering
  useEffect(() => {
    let cancel = false;
    const ac = new AbortController();
    if (release.coverImage) {
      setLoadingArtwork(true);
      preparePromoArtwork(release.coverImage, ac.signal)
        .then(res => { if (!cancel) setArtwork(res); })
        .catch(() => { /* fallback to direct URL */ })
        .finally(() => { if (!cancel) setLoadingArtwork(false); });
    }
    return () => { cancel = true; ac.abort(); };
  }, [release.coverImage]);

  // Active Promo Scene SVG
  const activeScene = useMemo(() => {
    try {
      return createPromoScene(release, recipe, suite, format, directUrl, artwork);
    } catch {
      return null;
    }
  }, [release, recipe, suite, format, directUrl, artwork]);

  const activeSvg = useMemo(() => {
    return activeScene ? promoSceneSvg(activeScene) : '';
  }, [activeScene]);

  // Audio preview handler
  const currentSnippet = recipe.snippets[activeSnippetIdx];
  const activeTrack = release.tracks.find(t => t.id === currentSnippet?.trackId);

  const togglePlayAudio = () => {
    if (!audioRef.current || !activeTrack?.url) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.currentTime = currentSnippet?.start || 0;
      audioRef.current.play()
        .then(() => setIsPlayingAudio(true))
        .catch(() => setIsPlayingAudio(false));
    }
  };

  // Export Full Promo Bundle (ZIP)
  const handleExportZip = async () => {
    if (exportingZip) return;
    setExportingZip(true);
    setZipProgress('Initializing assets…');
    const ac = new AbortController();
    try {
      const art = artwork || (release.coverImage ? await preparePromoArtwork(release.coverImage, ac.signal) : { url: '', width: 500, height: 500 });
      const bundleBlob = await exportPromoBundle(release, recipe, directUrl, art, (label) => {
        setZipProgress(label);
      }, ac.signal);
      downloadPromo(bundleBlob, `${promoFilename(recipe.title)}-chora-promo-pack.zip`);
    } catch (e: any) {
      alert(`Export failed: ${e?.message || 'Could not package bundle.'}`);
    } finally {
      setExportingZip(false);
      setZipProgress('');
    }
  };

  // Export 15s MP4 Motion Video
  const handleExportVideo = async () => {
    if (!activeScene || exportingVideo) return;
    setExportingVideo(true);
    setVideoProgress(0);
    try {
      const { blob, extension } = await exportPromoMotion(activeScene, release, recipe, {
        seconds: 15,
        onProgress: (p) => setVideoProgress(Math.round(p * 100)),
      });
      downloadPromo(blob, `${promoFilename(recipe.title)}-${suite}-${format}-15s.${extension}`);
    } catch (e: any) {
      alert(`Video export failed: ${e?.message || 'Unable to record video.'}`);
    } finally {
      setExportingVideo(false);
      setVideoProgress(0);
    }
  };

  // Edit in Tela Canvas
  const handleOpenTela = () => {
    try {
      const scenes = (['story', 'square', 'landscape'] as PromoFormat[]).map(f =>
        createPromoScene(release, recipe, suite, f, directUrl, artwork)
      );
      const docId = `promo-${release.id}-${Date.now()}`;
      const telaDoc = promoTelaDocument(release, scenes, docId);
      // Save locally to Tela storage
      localStorage.setItem(`tela_doc_${docId}`, JSON.stringify(telaDoc));
      if (onOpenTela) {
        onOpenTela(docId);
      } else {
        window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'TELA', documentId: docId } }));
      }
      onClose();
    } catch (e: any) {
      alert(`Could not launch Tela Canvas: ${e?.message}`);
    }
  };

  const handleCopyCaption = () => {
    const text = promoCaption(recipe, directUrl);
    navigator.clipboard?.writeText(text);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleDspToggle = (dsp: PromoDsp) => {
    setRecipe(prev => {
      const current = prev.secondaryDsps[dsp];
      const nextDsps = { ...prev.secondaryDsps };
      if (current) {
        delete nextDsps[dsp];
      } else {
        nextDsps[dsp] = `https://music.example.com/${dsp.toLowerCase().replace(/\s+/g, '')}`;
      }
      return { ...prev, secondaryDsps: nextDsps };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#0c0814] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#100B17]/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#6b0099] via-[#d40055] to-[#ff8c00] p-0.5 shadow-lg flex-shrink-0">
              {album.coverImage ? (
                <img src={thumb(coverGridSrc(album), THUMB.card)} onError={onThumbError(album.coverImage)} decoding="async" loading="lazy" alt={album.title} className="w-full h-full object-cover rounded-[10px]" />
              ) : (
                <div className="w-full h-full bg-[#100B17] rounded-[10px] flex items-center justify-center text-white/40">
                  <Music2 size={18} />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#ff8c00] font-bold">
                  CHORA AUTO-PROMO STUDIO
                </span>
                <span className="text-[9px] font-mono text-white/40">V{recipe.version}.0</span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white font-['Outfit'] truncate">
                {recipe.title} <span className="text-white/40 font-normal">· {recipe.artist}</span>
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: Left Preview, Right Controls */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
          
          {/* LEFT COLUMN: Stage Preview (Cols 7) */}
          <div className="lg:col-span-7 p-6 flex flex-col items-center justify-between bg-black/60 relative">
            
            {/* Format Selector Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl mb-4 text-xs font-mono">
              {(Object.keys(PROMO_FORMATS) as PromoFormat[]).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    format === fmt
                      ? 'bg-[#d40055] text-white shadow-md'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {PROMO_FORMATS[fmt].label} ({PROMO_FORMATS[fmt].ratio})
                </button>
              ))}
            </div>

            {/* SVG Vector Render Frame */}
            <div className="w-full flex-1 flex items-center justify-center p-2 min-h-[380px]">
              {activeSvg ? (
                <div
                  className="max-h-[500px] w-auto flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl border border-white/10 transition-transform duration-300"
                  style={{
                    aspectRatio: format === 'story' ? '9/16' : format === 'square' ? '1/1' : format === 'portrait' ? '4/5' : '16/9',
                    maxWidth: format === 'story' ? '300px' : format === 'landscape' ? '540px' : '400px'
                  }}
                  dangerouslySetInnerHTML={{ __html: activeSvg }}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/30 text-xs font-mono">
                  <Loader2 size={24} className="animate-spin text-[#d40055]" />
                  Generating Vector Stage…
                </div>
              )}
            </div>

            {/* Bottom Quick-Action Bar */}
            <div className="w-full mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-white/40 font-mono text-[10px]">
                {PROMO_FORMATS[format].width} × {PROMO_FORMATS[format].height} px · 300 DPI Native SVG
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportVideo}
                  disabled={exportingVideo}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-['Outfit'] font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {exportingVideo ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-[#00daf3]" />
                      Encoding {videoProgress}%
                    </>
                  ) : (
                    <>
                      <Film size={13} className="text-[#00daf3]" />
                      15s Video
                    </>
                  )}
                </button>

                <button
                  onClick={async () => {
                    if (!activeScene) return;
                    try {
                      const pngBlob = await exportPromoPng(activeScene);
                      downloadPromo(pngBlob, `${promoFilename(recipe.title)}-${suite}-${format}.png`);
                    } catch (e: any) {
                      alert('Could not render PNG: ' + e?.message);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-['Outfit'] font-bold flex items-center gap-1.5 transition-all"
                >
                  <Download size={13} />
                  Download PNG
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Configuration & Suites (Cols 5) */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between space-y-6 bg-[#0e0a16]">
            
            {/* 1. Design Suite Selector */}
            <div className="space-y-3">
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-bold">
                1. Art Council Aesthetic Suite
              </label>

              <div className="grid grid-cols-1 gap-2.5">
                {PROMO_SUITES.map(s => {
                  const active = suite === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSuite(s.id)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        active
                          ? 'bg-white/10 border-white/30 shadow-lg'
                          : 'bg-black/30 border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <div>
                          <div className="text-xs font-black text-white font-['Outfit'] flex items-center gap-2">
                            {s.number} · {s.name}
                            <span className="text-[10px] text-white/40 font-normal italic font-sans">{s.subtitle}</span>
                          </div>
                          <p className="text-[11px] text-white/50 mt-0.5">{s.description}</p>
                        </div>
                      </div>
                      {active && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Audio Snippets (3 Focus Tracks) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest font-bold">
                  2. Focus Audio Snippets (3 Slots)
                </label>
                {activeTrack?.url && (
                  <button
                    onClick={togglePlayAudio}
                    className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#ff8c00] hover:text-[#ffaa33]"
                  >
                    {isPlayingAudio ? <Pause size={10} /> : <Play size={10} />}
                    {isPlayingAudio ? 'Pause Teaser' : 'Preview Teaser'}
                  </button>
                )}
              </div>

              {/* Audio Element Hidden */}
              {activeTrack?.url && (
                <audio
                  ref={audioRef}
                  src={activeTrack.url}
                  onEnded={() => setIsPlayingAudio(false)}
                />
              )}

              <div className="grid grid-cols-3 gap-2">
                {recipe.snippets.map((snip, idx) => {
                  const trk = release.tracks.find(t => t.id === snip.trackId);
                  const active = activeSnippetIdx === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveSnippetIdx(idx);
                        if (isPlayingAudio && audioRef.current) {
                          audioRef.current.currentTime = snip.start;
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-[#d40055]/15 border-[#d40055] text-white'
                          : 'bg-black/30 border-white/5 text-white/60 hover:text-white'
                      }`}
                    >
                      <div className="text-[9px] font-mono uppercase text-[#ff8c00] font-bold">HOOK 0{idx + 1}</div>
                      <div className="text-[11px] font-bold truncate mt-0.5">{trk?.title || `Track ${idx + 1}`}</div>
                      <div className="text-[9px] font-mono text-white/40">{Math.round(snip.start)}s – {Math.round(snip.start + snip.duration)}s</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Secondary Streaming DSP Footnote Checklist */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-bold">
                3. Secondary Streaming Platforms (Fine Print)
              </label>

              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                {DSP_NAMES.map(name => {
                  const checked = !!recipe.secondaryDsps[name];
                  return (
                    <button
                      key={name}
                      onClick={() => handleDspToggle(name)}
                      className={`px-2 py-1.5 rounded-lg border text-left transition-all flex items-center justify-between ${
                        checked
                          ? 'bg-white/10 border-white/30 text-white font-semibold'
                          : 'bg-black/20 border-white/5 text-white/40 hover:text-white/70'
                      }`}
                    >
                      <span className="truncate">{name}</span>
                      {checked && <Check size={11} className="text-emerald-400 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-white/40 italic">
                * Plajah Chora is always rendered as the dominant hero brand and primary QR destination.
              </p>
            </div>

            {/* 4. Action Buttons */}
            <div className="pt-4 border-t border-white/10 space-y-2.5">
              <button
                onClick={handleExportZip}
                disabled={exportingZip}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#d40055] via-[#6b0099] to-[#ff8c00] text-white font-['Outfit'] font-extrabold text-sm uppercase tracking-wider shadow-xl hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {exportingZip ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-white" />
                    {zipProgress || 'Packaging Promo Bundle…'}
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download Complete Promo Pack (ZIP)
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleOpenTela}
                  className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs font-bold font-['Outfit'] flex items-center justify-center gap-1.5 transition-all"
                >
                  <Layers size={13} className="text-[#00daf3]" />
                  Edit in Tela Canvas
                </button>

                <button
                  onClick={handleCopyCaption}
                  className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs font-bold font-['Outfit'] flex items-center justify-center gap-1.5 transition-all"
                >
                  {copiedCaption ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  {copiedCaption ? 'Caption Copied!' : 'Copy Caption'}
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
