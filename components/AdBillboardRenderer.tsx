import React, { useRef, useState, useEffect } from 'react';
import { Heart, Gift, VolumeX, Play, Pause } from 'lucide-react';
import { UserAd, UserProfile } from '../types';

interface AdBillboardRendererProps {
  ad: UserAd;
  profile: UserProfile;
  onVisitProfile: (uid: string) => void;
  onOpenAsset: (ad: UserAd) => void;
  dotCount: number;
  dotIdx: number;
}

const PROMOTED_LABEL: Record<string, string> = {
  MUSIC: 'Music', VIDEO: 'Video', PODCAST: 'Podcast', ARTICLE: 'Article',
  BOOK: 'Book', FILM: 'Film', TV: 'TV Series', GAME: 'Game',
  LIVE_EVENT: 'Live Event', SANCTUARY: 'Sanctuary',
};

const AdBillboardRenderer: React.FC<AdBillboardRendererProps> = ({
  ad, profile, onVisitProfile, onOpenAsset, dotCount, dotIdx,
}) => {
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playTrack = (url: string, idx: number) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    const a = new Audio(url);
    a.volume = 0.7;
    a.play().catch(() => {});
    audioRef.current = a;
    setPlayingIdx(idx);
    a.onended = () => setPlayingIdx(null);
  };

  const stopTrack = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    setPlayingIdx(null);
  };

  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  const dotTotal = Math.min(dotCount, 7);
  const activeDot = dotIdx % Math.max(dotTotal, 1);
  const hasMedia = !!(ad.miniVideoUrl || (ad.albumPreviewTracks?.length ?? 0) > 0);
  const hasPromoted = !!(ad.promotedType && ad.promotedAssetTitle);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ── Background ── */}
      {ad.backgroundType === 'video' && ad.backgroundUrl ? (
        <video
          src={ad.backgroundUrl}
          autoPlay muted loop playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'brightness(0.32) saturate(1.3)' }}
        />
      ) : ad.backgroundType === 'image' && ad.backgroundUrl ? (
        <img
          src={ad.backgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={{ filter: 'brightness(0.38)' }}
        />
      ) : profile.coverArt ? (
        <img
          src={profile.coverArt}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center scale-105"
          style={{ filter: 'blur(18px) brightness(0.32) saturate(1.4)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#12001f] to-[#050505]" />
      )}

      {/* Gradient scrims */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/10 to-black/55" />

      {/* ── Featured Creator badge ── */}
      <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
        <span className="px-3 py-1 bg-black/55 backdrop-blur-md border border-white/10 rounded-full text-[7px] font-black uppercase tracking-[0.35em] text-white/45">
          Featured Creator
        </span>
      </div>

      {/* ── Promoted asset card ── */}
      {hasPromoted && (
        <button
          onClick={() => onOpenAsset(ad)}
          className="absolute left-4 right-4 top-14 z-10 flex items-center gap-2.5 bg-black/60 backdrop-blur-sm border border-white/15 rounded-2xl p-3 hover:border-white/35 transition-colors text-left"
        >
          {ad.promotedAssetImageUrl && (
            <img src={ad.promotedAssetImageUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[6.5px] font-black uppercase tracking-[0.28em] text-white/38">
              {PROMOTED_LABEL[ad.promotedType!] ?? ad.promotedType}
            </p>
            <p className="text-[10px] font-black text-white truncate leading-tight">{ad.promotedAssetTitle}</p>
          </div>
          <span className="text-[7px] font-black text-small-orange whitespace-nowrap shrink-0">View →</span>
        </button>
      )}

      {/* ── Mini video player (auto-play, muted) ── */}
      {ad.miniVideoUrl && (
        <div
          className="absolute left-4 right-4 rounded-2xl overflow-hidden border border-white/15 z-10"
          style={{ top: hasPromoted ? '33%' : '22%', aspectRatio: '16/9' }}
        >
          <video src={ad.miniVideoUrl} autoPlay muted loop playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-2 right-2 p-1 bg-black/60 rounded-full">
            <VolumeX size={8} className="text-white/60" />
          </div>
        </div>
      )}

      {/* ── Album preview mini-player ── */}
      {!ad.miniVideoUrl && (ad.albumPreviewTracks?.length ?? 0) > 0 && (
        <div
          className="absolute left-4 right-4 bg-black/70 backdrop-blur-sm border border-white/10 rounded-2xl p-3 z-10"
          style={{ top: hasPromoted ? '33%' : '22%' }}
        >
          {ad.albumPreviewTitle && (
            <p className="text-[7px] font-black uppercase tracking-[0.28em] text-white/38 mb-2 truncate">
              {ad.albumPreviewTitle}
            </p>
          )}
          <div className="space-y-1">
            {ad.albumPreviewTracks!.map((t, i) => (
              <button
                key={t.id}
                onClick={() => playingIdx === i ? stopTrack() : playTrack(t.url, i)}
                className="w-full flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/10 transition-all text-left"
              >
                <div className="w-5 h-5 rounded-full bg-small-orange/20 flex items-center justify-center shrink-0">
                  {playingIdx === i
                    ? <Pause size={7} className="text-small-orange" />
                    : <Play size={7} className="text-small-orange" />}
                </div>
                <span className={`text-[8px] truncate flex-1 ${playingIdx === i ? 'text-small-orange font-bold' : 'text-white/60'}`}>
                  {t.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Draggable profile button (positioned per ad config) ── */}
      <button
        onClick={() => onVisitProfile(profile.uid)}
        className="absolute z-20 hover:scale-105 transition-all active:scale-95"
        style={{
          left: `${ad.profilePicX ?? 50}%`,
          top: `${ad.profilePicY ?? 40}%`,
          transform: 'translate(-50%, -50%)',
        }}
        title={`Visit ${profile.displayName}'s profile`}
      >
        <div className="w-20 h-20 rounded-full overflow-hidden ring-[3px] ring-white/30 hover:ring-small-orange transition-all shadow-[0_0_32px_rgba(0,0,0,0.85)]">
          {profile.photoURL && (
            <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
          )}
        </div>
        <p className="text-[9px] font-black text-white text-center mt-1 drop-shadow-[0_1px_6px_rgba(0,0,0,1)] leading-tight max-w-[100px]">
          {profile.displayName}
        </p>
      </button>

      {/* ── Gift & Tip buttons — always present ── */}
      <div
        className="absolute left-0 right-0 flex justify-center gap-2 z-20"
        style={{ bottom: ad.ctaText ? '52px' : '24px' }}
      >
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 rounded-full text-[8px] font-black text-white uppercase tracking-widest transition-all">
          <Gift size={10} /> Gift
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-small-orange/25 border border-small-orange/40 hover:bg-small-orange hover:text-black rounded-full text-[8px] font-black text-small-orange uppercase tracking-widest transition-all">
          <Heart size={10} /> Tip
        </button>
      </div>

      {/* ── CTA tag ── */}
      {ad.ctaText && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center px-5 z-20">
          <div className="px-4 py-1.5 bg-small-orange text-black rounded-full text-[8px] font-black uppercase tracking-widest max-w-[230px] truncate text-center shadow-[0_0_16px_rgba(255,140,0,0.4)]">
            {ad.ctaText}
          </div>
        </div>
      )}

      {/* ── Dot progress indicators ── */}
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20">
        {Array.from({ length: dotTotal }).map((_, i) => (
          <span
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === activeDot ? '16px' : '5px',
              height: '5px',
              background: i === activeDot ? '#ff8c00' : 'rgba(255,255,255,0.2)',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default AdBillboardRenderer;
