import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Upload, Film, Music2, BookOpen, Newspaper, Video, Gamepad2,
  Radio, Users, Tv, Zap, Heart, Gift, Play, Pause, Check, Loader2,
  VolumeX, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAd, UserAdPromotedType, Album, UserProfile } from '../types';
import { saveUserAd, deleteUserAd, uploadFile, fetchUserContent, fetchUserVideos } from '../services/backendService';

// ─── canvas dimensions (matches billboard aspect ratio 320:680) ─────────────
const CW = 240;
const CH = Math.round(240 * 680 / 320); // 510 px

// ─── promoted-type config ────────────────────────────────────────────────────
const PTYPES: { kind: UserAdPromotedType; label: string; Icon: React.ComponentType<any>; color: string }[] = [
  { kind: 'MUSIC',      label: 'Music Release',  Icon: Music2,    color: '#FF8C00' },
  { kind: 'FILM',       label: 'Film Release',   Icon: Film,      color: '#00B4D8' },
  { kind: 'TV',         label: 'TV Release',     Icon: Tv,        color: '#7209B7' },
  { kind: 'VIDEO',      label: 'Video',          Icon: Video,     color: '#E63946' },
  { kind: 'PODCAST',    label: 'Podcast',        Icon: Radio,     color: '#F4A261' },
  { kind: 'BOOK',       label: 'Book / Novel',   Icon: BookOpen,  color: '#2A9D8F' },
  { kind: 'ARTICLE',    label: 'Article',        Icon: Newspaper, color: '#E9C46A' },
  { kind: 'GAME',       label: 'Game Release',   Icon: Gamepad2,  color: '#06D6A0' },
  { kind: 'LIVE_EVENT', label: 'Live Event',     Icon: Users,     color: '#D40055' },
  { kind: 'SANCTUARY',  label: 'Sanctuary Page', Icon: Zap,       color: '#6B0099' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface AdCreatorProps {
  userProfile: UserProfile;
  existingAd?: UserAd | null;
  onClose: () => void;
  onSaved: (ad: UserAd) => void;
}

const AdCreator: React.FC<AdCreatorProps> = ({ userProfile, existingAd, onClose, onSaved }) => {
  // ── ad state ──────────────────────────────────────────────────────────────
  const [ad, setAd] = useState<Partial<UserAd>>({
    ownerId: userProfile.uid,
    backgroundType: 'cover_art',
    profilePicX: 50,
    profilePicY: 38,
    isActive: true,
    ...existingAd,
  });
  const patch = (diff: Partial<UserAd>) => setAd(prev => ({ ...prev, ...diff }));

  // ── UI state ──────────────────────────────────────────────────────────────
  type Tab = 'background' | 'promote' | 'media' | 'cta';
  const [tab, setTab] = useState<Tab>('background');
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState(0);

  // ── asset picker ──────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItems, setPickerItems] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // ── album picker ──────────────────────────────────────────────────────────
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);

  // ── audio preview (track selector) ───────────────────────────────────────
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── canvas drag ───────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // ── file input ────────────────────────────────────────────────────────────
  const bgFileRef = useRef<HTMLInputElement>(null);

  // ─── fetch user albums once ───────────────────────────────────────────────
  useEffect(() => {
    fetchUserContent(userProfile.uid).then(setUserAlbums).catch(() => {});
  }, [userProfile.uid]);

  // ─── fetch promoted assets when picker opens ──────────────────────────────
  useEffect(() => {
    if (!pickerOpen || !ad.promotedType) return;
    setPickerLoading(true);
    setPickerItems([]);
    const type = ad.promotedType;

    (async () => {
      try {
        const albums = await fetchUserContent(userProfile.uid);
        let items: any[] = [];
        if (type === 'MUSIC')   items = albums.filter(a => !a.type || a.type === 'MUSIC');
        else if (type === 'FILM')     items = albums.filter(a => a.subType === 'MOVIE');
        else if (type === 'TV')       items = albums.filter(a => a.subType === 'TV_SERIES');
        else if (type === 'PODCAST')  items = albums.filter(a => a.subType === 'PODCAST');
        else if (type === 'BOOK')     items = albums.filter(a => a.type === 'BOOK');
        else if (type === 'GAME')     items = albums.filter(a => a.type === 'GAME');
        else if (type === 'VIDEO') {
          const vids = await fetchUserVideos(userProfile.uid);
          items = vids.map(v => ({ id: v.id, title: v.title, coverImage: v.thumbnailUrl || v.coverImageUrl || '' }));
        } else if (type === 'ARTICLE') {
          items = albums.filter(a => (a as any).subType === 'ARTICLE');
        } else if (type === 'LIVE_EVENT') {
          items = []; // live events fetched via a different path; show placeholder
        } else if (type === 'SANCTUARY') {
          items = [{ id: 'sanctuary', title: 'My Sanctuary', coverImage: userProfile.coverArt || userProfile.photoURL || '' }];
        }
        setPickerItems(items);
      } catch {
        setPickerItems([]);
      }
      setPickerLoading(false);
    })();
  }, [pickerOpen, ad.promotedType, userProfile.uid]);

  // ─── background file upload ───────────────────────────────────────────────
  const handleBgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true); setBgProgress(0);
    try {
      const isVid = file.type.startsWith('video/');
      const url = await uploadFile(`userAds/${userProfile.uid}/bg_${Date.now()}`, file, p => setBgProgress(p));
      patch({ backgroundType: isVid ? 'video' : 'image', backgroundUrl: url });
    } catch {}
    setUploadingBg(false);
    e.target.value = '';
  };

  // ─── canvas drag ──────────────────────────────────────────────────────────
  const onCanvasDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const cx = ((e.clientX - r.left) / r.width) * 100;
    const cy = ((e.clientY - r.top) / r.height) * 100;
    if (Math.abs(cx - (ad.profilePicX ?? 50)) < 14 && Math.abs(cy - (ad.profilePicY ?? 38)) < 10) {
      dragging.current = true;
      e.preventDefault();
    }
  };
  const onGlobalMove = useCallback((e: MouseEvent) => {
    if (!dragging.current || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    patch({
      profilePicX: clamp(((e.clientX - r.left) / r.width) * 100, 8, 92),
      profilePicY: clamp(((e.clientY - r.top) / r.height) * 100, 8, 88),
    });
  }, []);
  const onGlobalUp = useCallback(() => { dragging.current = false; }, []);
  useEffect(() => {
    window.addEventListener('mousemove', onGlobalMove);
    window.addEventListener('mouseup', onGlobalUp);
    return () => {
      window.removeEventListener('mousemove', onGlobalMove);
      window.removeEventListener('mouseup', onGlobalUp);
    };
  }, [onGlobalMove, onGlobalUp]);

  // ─── audio ────────────────────────────────────────────────────────────────
  const playTrack = (url: string, idx: number) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    const a = new Audio(url); a.volume = 0.7; a.play().catch(() => {});
    audioRef.current = a; setPlayingIdx(idx);
    a.onended = () => setPlayingIdx(null);
  };
  const stopTrack = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; } setPlayingIdx(null); };
  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  // ─── save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const id = await saveUserAd(ad as UserAd & { ownerId: string });
      onSaved({ ...ad, id } as UserAd);
    } catch {}
    setSaving(false);
  };

  // ─── canvas preview helpers ───────────────────────────────────────────────
  const px = `${ad.profilePicX ?? 50}%`;
  const py = `${ad.profilePicY ?? 38}%`;
  const hasMedia = !!(ad.miniVideoUrl || (ad.albumPreviewTracks?.length ?? 0) > 0);
  const hasPromoted = !!(ad.promotedType && ad.promotedAssetTitle);

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/92 backdrop-blur-2xl flex items-center justify-center p-4"
    >
      <div className="w-full max-w-5xl h-[92vh] bg-[#080808] border border-white/10 rounded-[3rem] overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-white">Ad Studio</h2>
            <p className="text-[9px] text-white/35 font-bold uppercase tracking-widest mt-0.5">Build your billboard ad</p>
          </div>
          <div className="flex items-center gap-3">
            {existingAd && (
              <button
                onClick={async () => { await deleteUserAd(existingAd.id); onClose(); }}
                className="px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
              >
                Delete Ad
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-small-orange text-black rounded-full text-[9px] font-black uppercase tracking-widest disabled:opacity-50 hover:scale-105 transition-all"
            >
              {saving ? 'Publishing…' : 'Publish Ad'}
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
              <X size={14} className="text-white" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── CANVAS PREVIEW ── */}
          <div className="flex flex-col items-center justify-center bg-black/50 px-6 py-5 border-r border-white/10 shrink-0">
            <p className="text-[7px] text-white/25 font-black uppercase tracking-[0.35em] mb-3">Live Preview</p>

            <div
              ref={canvasRef}
              className="relative overflow-hidden rounded-[1.25rem] border border-white/15 cursor-crosshair select-none shadow-2xl"
              style={{ width: CW, height: CH }}
              onMouseDown={onCanvasDown}
            >
              {/* Background */}
              {ad.backgroundType === 'video' && ad.backgroundUrl ? (
                <video src={ad.backgroundUrl} autoPlay muted loop playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: 'brightness(0.32)' }} />
              ) : ad.backgroundType === 'image' && ad.backgroundUrl ? (
                <img src={ad.backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: 'brightness(0.4)' }} />
              ) : userProfile.coverArt ? (
                <img src={userProfile.coverArt} alt="" className="absolute inset-0 w-full h-full object-cover scale-105"
                  style={{ filter: 'blur(14px) brightness(0.32) saturate(1.3)' }} />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#150025] to-[#050505]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/8 to-black/50" />

              {/* Badge */}
              <div className="absolute top-2.5 left-0 right-0 flex justify-center">
                <span className="px-2 py-0.5 bg-black/55 border border-white/10 rounded-full text-[5.5px] font-black uppercase tracking-[0.3em] text-white/40">Featured Creator</span>
              </div>

              {/* Promoted card */}
              {hasPromoted && (
                <div className="absolute left-3 right-3 top-9 flex items-center gap-2 bg-black/60 border border-white/12 rounded-xl p-2">
                  {ad.promotedAssetImageUrl && (
                    <img src={ad.promotedAssetImageUrl} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[5.5px] font-black uppercase tracking-widest text-white/38">{ad.promotedType?.replace('_', ' ')}</p>
                    <p className="text-[7.5px] font-black text-white truncate">{ad.promotedAssetTitle}</p>
                  </div>
                </div>
              )}

              {/* Mini video */}
              {ad.miniVideoUrl && (
                <div className="absolute left-3 right-3 rounded-xl overflow-hidden border border-white/12"
                  style={{ top: hasPromoted ? '30%' : '20%', aspectRatio: '16/9' }}>
                  <video src={ad.miniVideoUrl} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                  <div className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-black/60 rounded-full flex items-center justify-center">
                    <VolumeX size={6} className="text-white" />
                  </div>
                </div>
              )}

              {/* Album preview */}
              {!ad.miniVideoUrl && (ad.albumPreviewTracks?.length ?? 0) > 0 && (
                <div className="absolute left-3 right-3 bg-black/65 border border-white/10 rounded-xl p-2"
                  style={{ top: hasPromoted ? '30%' : '20%' }}>
                  <p className="text-[5.5px] font-black uppercase tracking-widest text-white/35 mb-1 truncate">{ad.albumPreviewTitle}</p>
                  {ad.albumPreviewTracks!.slice(0, 4).map((t, i) => (
                    <div key={t.id} className="flex items-center gap-1.5 py-0.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-small-orange/50 flex items-center justify-center shrink-0">
                        {playingIdx === i ? <Pause size={4} className="text-black" /> : <Play size={4} className="text-black" />}
                      </div>
                      <p className="text-[6.5px] text-white/65 truncate">{t.title}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Draggable profile button */}
              <div
                className="absolute cursor-grab active:cursor-grabbing"
                style={{ left: px, top: py, transform: 'translate(-50%,-50%)', zIndex: 20 }}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white/30 shadow-[0_0_16px_rgba(0,0,0,0.9)]">
                  {userProfile.photoURL
                    ? <img src={userProfile.photoURL} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-white/15" />}
                </div>
                <p className="text-[5px] font-black text-white text-center mt-0.5 drop-shadow leading-tight">{userProfile.displayName}</p>
              </div>

              {/* Gift & Tip (always present) */}
              <div className="absolute left-0 right-0 flex justify-center gap-1.5"
                style={{ bottom: ad.ctaText ? '30px' : '12px', zIndex: 20 }}>
                <span className="flex items-center gap-0.5 px-2 py-0.5 bg-white/10 border border-white/15 rounded-full text-[5.5px] font-black text-white uppercase tracking-widest">
                  <Gift size={6} /> Gift
                </span>
                <span className="flex items-center gap-0.5 px-2 py-0.5 bg-small-orange/25 border border-small-orange/40 rounded-full text-[5.5px] font-black text-small-orange uppercase tracking-widest">
                  <Heart size={6} /> Tip
                </span>
              </div>

              {/* CTA */}
              {ad.ctaText && (
                <div className="absolute bottom-2.5 left-0 right-0 flex justify-center px-3" style={{ zIndex: 20 }}>
                  <div className="px-2.5 py-0.5 bg-small-orange text-black rounded-full text-[6px] font-black uppercase tracking-widest truncate max-w-full">
                    {ad.ctaText}
                  </div>
                </div>
              )}

              {/* Drag hint */}
              <p className="absolute top-1 left-1.5 text-[4.5px] text-white/18 font-bold pointer-events-none">drag profile to reposition</p>
            </div>

            <p className="text-[7px] text-white/18 font-bold mt-2.5 text-center">Drag the profile circle to reposition</p>
          </div>

          {/* ── CONTROLS PANEL ── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* Tabs */}
            <div className="flex border-b border-white/10 shrink-0 overflow-x-auto">
              {([
                ['background', 'Background'],
                ['promote',    'Promote'],
                ['media',      'Media'],
                ['cta',        'Call to Action'],
              ] as [Tab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`px-6 py-4 text-[8.5px] font-black uppercase tracking-widest whitespace-nowrap transition-colors ${
                    tab === id ? 'text-small-orange border-b-2 border-small-orange' : 'text-white/35 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab bodies */}
            <div className="flex-1 overflow-y-auto p-7 space-y-6 custom-scrollbar">

              {/* ── BACKGROUND ── */}
              {tab === 'background' && (
                <>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-3">Background Source</p>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        ['cover_art', 'Cover Art',  'Use your cover photo (blurred)'],
                        ['image',     'Image',       'Upload a still image'],
                        ['video',     'Video',       'Looping video, played dim'],
                      ] as [UserAd['backgroundType'], string, string][]).map(([val, lbl, desc]) => (
                        <button key={val}
                          onClick={() => patch({ backgroundType: val, backgroundUrl: val === 'cover_art' ? undefined : ad.backgroundUrl })}
                          className={`p-4 rounded-2xl border text-left transition-all ${ad.backgroundType === val ? 'border-small-orange bg-small-orange/10' : 'border-white/10 bg-white/5 hover:border-white/25'}`}
                        >
                          <p className="text-[9px] font-black text-white uppercase tracking-wide">{lbl}</p>
                          <p className="text-[7.5px] text-white/38 mt-0.5">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {(ad.backgroundType === 'image' || ad.backgroundType === 'video') && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-3">
                        Upload {ad.backgroundType === 'video' ? 'Video' : 'Image'}
                      </p>
                      <input ref={bgFileRef} type="file"
                        accept={ad.backgroundType === 'video' ? 'video/*' : 'image/*'}
                        className="hidden" onChange={handleBgFile} />
                      <button onClick={() => bgFileRef.current?.click()} disabled={uploadingBg}
                        className="w-full py-8 border-2 border-dashed border-white/18 rounded-2xl flex flex-col items-center gap-2 hover:border-white/38 transition-all">
                        {uploadingBg ? (
                          <><Loader2 size={22} className="text-small-orange animate-spin" />
                          <p className="text-[9px] text-white/50 font-bold">{Math.round(bgProgress)}%</p></>
                        ) : ad.backgroundUrl ? (
                          <><Check size={22} className="text-green-400" />
                          <p className="text-[9px] text-white/50 font-bold">Uploaded · click to replace</p></>
                        ) : (
                          <><Upload size={22} className="text-white/35" />
                          <p className="text-[9px] text-white/50 font-bold">Click to upload</p></>
                        )}
                      </button>

                      <p className="text-[8px] text-white/35 font-bold mt-4 mb-1.5">Or paste a URL</p>
                      <input type="url"
                        placeholder={ad.backgroundType === 'video' ? 'https://…  .mp4' : 'https://…  .jpg'}
                        value={ad.backgroundUrl || ''}
                        onChange={e => patch({ backgroundUrl: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white placeholder-white/22 focus:outline-none focus:border-small-orange/50"
                      />
                    </div>
                  )}
                </>
              )}

              {/* ── PROMOTE ── */}
              {tab === 'promote' && (
                <>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50">What are you promoting?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PTYPES.map(({ kind, label, Icon, color }) => {
                      const active = ad.promotedType === kind;
                      return (
                        <button key={kind}
                          onClick={() => {
                            patch({ promotedType: kind, promotedAssetId: undefined, promotedAssetTitle: undefined, promotedAssetImageUrl: undefined });
                            if (kind !== 'SANCTUARY') setPickerOpen(true);
                            else {
                              patch({ promotedType: 'SANCTUARY', promotedAssetId: 'sanctuary', promotedAssetTitle: 'My Sanctuary', promotedAssetImageUrl: userProfile.coverArt || userProfile.photoURL });
                            }
                          }}
                          className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${active ? 'border-white/30 bg-white/8' : 'border-white/10 bg-white/5 hover:border-white/25'}`}
                        >
                          <div className="p-2 rounded-xl shrink-0" style={{ background: `${color}22` }}>
                            <Icon size={13} style={{ color }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[8.5px] font-black text-white uppercase tracking-wide">{label}</p>
                            {active && ad.promotedAssetTitle && (
                              <p className="text-[7.5px] text-white/45 truncate mt-0.5">{ad.promotedAssetTitle}</p>
                            )}
                          </div>
                          {active && ad.promotedAssetTitle && <Check size={11} className="text-green-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {ad.promotedType && !ad.promotedAssetTitle && ad.promotedType !== 'SANCTUARY' && (
                    <button onClick={() => setPickerOpen(true)}
                      className="w-full py-3 rounded-2xl border border-dashed border-white/18 text-[9px] font-black text-white/38 hover:text-white hover:border-white/38 transition-all flex items-center justify-center gap-2">
                      Select {PTYPES.find(p => p.kind === ad.promotedType)?.label} <ChevronRight size={12} />
                    </button>
                  )}

                  {ad.promotedAssetTitle && (
                    <button
                      onClick={() => patch({ promotedType: undefined, promotedAssetId: undefined, promotedAssetTitle: undefined, promotedAssetImageUrl: undefined })}
                      className="w-full py-2 text-[8px] font-bold text-white/25 hover:text-red-400 transition-colors"
                    >
                      Clear promoted content
                    </button>
                  )}
                </>
              )}

              {/* ── MEDIA ── */}
              {tab === 'media' && (
                <>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Mini Video Teaser</p>
                    <p className="text-[8px] text-white/30 mb-3">Centred autoplay-muted clip — trailer, teaser or BTS snippet</p>
                    <input type="url" placeholder="https://… .mp4"
                      value={ad.miniVideoUrl || ''}
                      onChange={e => patch({ miniVideoUrl: e.target.value || undefined })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white placeholder-white/22 focus:outline-none focus:border-small-orange/50"
                    />
                    {ad.miniVideoUrl && (
                      <button onClick={() => patch({ miniVideoUrl: undefined })}
                        className="mt-1.5 text-[8px] font-bold text-white/25 hover:text-red-400 transition-colors">
                        Remove teaser
                      </button>
                    )}
                  </div>

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Album Preview Player</p>
                    <p className="text-[8px] text-white/30 mb-3">Let visitors sample songs from your release (replaces teaser if both set)</p>
                    <button onClick={() => setAlbumPickerOpen(true)}
                      className="w-full p-4 border border-dashed border-white/18 rounded-2xl text-left hover:border-white/38 transition-all">
                      {ad.albumPreviewTitle ? (
                        <div className="flex items-center gap-3">
                          <Music2 size={15} className="text-small-orange" />
                          <div>
                            <p className="text-[9px] font-black text-white">{ad.albumPreviewTitle}</p>
                            <p className="text-[7.5px] text-white/38">{ad.albumPreviewTracks?.length ?? 0} tracks selected</p>
                          </div>
                          <Check size={13} className="text-green-400 ml-auto" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-white/35">
                          <Music2 size={15} />
                          <p className="text-[9px] font-bold">Choose album & sample tracks →</p>
                        </div>
                      )}
                    </button>

                    {(ad.albumPreviewTracks?.length ?? 0) > 0 && (
                      <div className="mt-3 space-y-1">
                        {ad.albumPreviewTracks!.map((t, i) => (
                          <div key={t.id} className="flex items-center gap-2 p-2 bg-white/5 rounded-xl">
                            <button
                              onClick={() => playingIdx === i ? stopTrack() : playTrack(t.url, i)}
                              className="w-6 h-6 rounded-full bg-small-orange/18 hover:bg-small-orange/40 flex items-center justify-center shrink-0 transition-all"
                            >
                              {playingIdx === i ? <Pause size={8} className="text-small-orange" /> : <Play size={8} className="text-small-orange" />}
                            </button>
                            <span className="text-[9px] text-white/65 flex-1 truncate">{t.title}</span>
                          </div>
                        ))}
                        <button onClick={() => patch({ albumPreviewId: undefined, albumPreviewTitle: undefined, albumPreviewTracks: undefined })}
                          className="w-full py-1.5 text-[8px] font-bold text-white/22 hover:text-red-400 transition-colors">
                          Remove album preview
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── CTA ── */}
              {tab === 'cta' && (
                <>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Call to Action Tag</p>
                    <p className="text-[8px] text-white/30 mb-3">Short pill shown at the bottom of your ad</p>
                    <input type="text" maxLength={42}
                      placeholder="e.g. Stream Now · Out This Friday · Join My Sanctuary"
                      value={ad.ctaText || ''}
                      onChange={e => patch({ ctaText: e.target.value || undefined })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white placeholder-white/22 focus:outline-none focus:border-small-orange/50"
                    />
                    <p className="text-[7.5px] text-white/25 mt-1">{ad.ctaText?.length ?? 0} / 42</p>
                  </div>

                  <div className="p-5 bg-white/5 rounded-2xl border border-white/8">
                    <div className="flex items-center gap-2 mb-2">
                      <Heart size={12} className="text-small-orange" />
                      <Gift size={12} className="text-white/50" />
                      <p className="text-[8.5px] font-black text-white uppercase tracking-wide">Gift & Tip — Always On</p>
                    </div>
                    <p className="text-[8px] text-white/40 leading-relaxed">
                      Gift and Tip buttons are permanently displayed on your ad so fans can support you directly from the billboard. They cannot be removed.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── PROMOTED ASSET PICKER ── */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setPickerOpen(false); }}>
            <div className="w-full max-w-lg bg-[#0f0f0f] border border-white/10 rounded-[2rem] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <p className="text-sm font-black text-white uppercase tracking-tight">
                  Select {PTYPES.find(p => p.kind === ad.promotedType)?.label}
                </p>
                <button onClick={() => setPickerOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
                  <X size={13} className="text-white" />
                </button>
              </div>
              <div className="p-4 max-h-[58vh] overflow-y-auto custom-scrollbar">
                {pickerLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={22} className="animate-spin text-white/35" />
                  </div>
                ) : pickerItems.length === 0 ? (
                  <p className="text-center text-white/28 py-12 text-sm">No content found for this type</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {pickerItems.map((item: any) => {
                      const img = item.coverImage || item.thumbnailUrl || item.imageUrl || '';
                      const ttl = item.title || item.name || 'Untitled';
                      return (
                        <button key={item.id}
                          onClick={() => {
                            patch({ promotedAssetId: item.id, promotedAssetTitle: ttl, promotedAssetImageUrl: img });
                            setPickerOpen(false);
                          }}
                          className="text-left bg-white/5 rounded-2xl overflow-hidden hover:bg-white/10 transition-all border border-white/10 hover:border-white/25">
                          <div className="aspect-video bg-black/50 relative">
                            {img
                              ? <img src={img} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><Music2 size={18} className="text-white/18" /></div>}
                          </div>
                          <div className="p-2.5">
                            <p className="text-[8.5px] font-black text-white line-clamp-2">{ttl}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ALBUM PREVIEW PICKER ── */}
      <AnimatePresence>
        {albumPickerOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setAlbumPickerOpen(false); }}>
            <div className="w-full max-w-md bg-[#0f0f0f] border border-white/10 rounded-[2rem] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <p className="text-sm font-black text-white uppercase tracking-tight">Album Preview</p>
                <button onClick={() => setAlbumPickerOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
                  <X size={13} className="text-white" />
                </button>
              </div>
              <div className="p-4 max-h-[68vh] overflow-y-auto custom-scrollbar space-y-2">
                {userAlbums.length === 0 ? (
                  <p className="text-center text-white/28 py-12 text-sm">No albums found</p>
                ) : userAlbums.map(album => {
                  const isSelected = ad.albumPreviewId === album.id;
                  return (
                    <div key={album.id}
                      className={`border rounded-2xl overflow-hidden transition-all ${isSelected ? 'border-small-orange/45 bg-small-orange/5' : 'border-white/10 bg-white/4'}`}>
                      <button onClick={() => patch({ albumPreviewId: album.id, albumPreviewTitle: album.title, albumPreviewTracks: isSelected ? ad.albumPreviewTracks : [] })}
                        className="w-full flex items-center gap-3 p-3 text-left">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/8 shrink-0">
                          {album.coverImage && <img src={album.coverImage} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black text-white truncate">{album.title}</p>
                          <p className="text-[7.5px] text-white/38">{album.tracks.length} tracks</p>
                        </div>
                        {isSelected && <Check size={13} className="text-small-orange shrink-0" />}
                      </button>

                      {isSelected && (
                        <div className="px-3 pb-3 space-y-1">
                          <p className="text-[7.5px] text-white/38 font-bold uppercase tracking-widest mb-2">Choose tracks to preview (max 5)</p>
                          {album.tracks.map(track => {
                            const sel = ad.albumPreviewTracks?.some(t => t.id === track.id);
                            return (
                              <button key={track.id}
                                onClick={() => {
                                  const cur = ad.albumPreviewTracks ?? [];
                                  if (sel) {
                                    patch({ albumPreviewTracks: cur.filter(t => t.id !== track.id) });
                                  } else if (cur.length < 5) {
                                    patch({ albumPreviewTracks: [...cur, { id: track.id, title: track.title, url: track.url }] });
                                  }
                                }}
                                className={`w-full flex items-center gap-2 p-2 rounded-xl text-left transition-all ${sel ? 'bg-small-orange/12 border border-small-orange/28' : 'bg-white/4 border border-transparent hover:border-white/18'}`}
                              >
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${sel ? 'bg-small-orange border-small-orange' : 'border-white/28'}`}>
                                  {sel && <Check size={7} className="text-black" />}
                                </div>
                                <span className="text-[8.5px] text-white/65 flex-1 truncate">{track.title}</span>
                                {track.url && (
                                  <button
                                    onClick={e => { e.stopPropagation(); playingIdx === album.tracks.indexOf(track) ? stopTrack() : playTrack(track.url, album.tracks.indexOf(track)); }}
                                    className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/25 transition-all"
                                  >
                                    {playingIdx === album.tracks.indexOf(track) ? <Pause size={6} className="text-white" /> : <Play size={6} className="text-white" />}
                                  </button>
                                )}
                              </button>
                            );
                          })}
                          <button onClick={() => setAlbumPickerOpen(false)}
                            className="mt-2 w-full py-2 bg-small-orange text-black rounded-xl text-[8.5px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                            Done ({ad.albumPreviewTracks?.length ?? 0} selected)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AdCreator;
