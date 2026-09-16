import React, { useState, useEffect, useRef } from 'react';
import { Radio, Play, Pause, ChevronLeft, ChevronRight, Bookmark, Plus, Volume2 } from 'lucide-react';
import { RadioPreset, Track, Album } from '../../types';
import { useGlobalPlayer, useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import { getRadioPresets, subscribeRadioPresets } from '../../services/radioPresetsService';

interface RadioPresetsRowProps {
  presets?: RadioPreset[];
  isOwnProfile?: boolean;
  onOpenRadio?: () => void;
}

export const RadioPresetsRow: React.FC<RadioPresetsRowProps> = ({
  presets: initialPresets,
  isOwnProfile = false,
  onOpenRadio,
}) => {
  const { playTrack, pause, resume } = useGlobalPlayer();
  const { currentTrack, isPlaying, audioSource } = useGlobalPlayerState();
  const [presets, setPresets] = useState<RadioPreset[]>(() => {
    if (initialPresets && initialPresets.length > 0) return initialPresets;
    return isOwnProfile ? getRadioPresets() : [];
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPresets && initialPresets.length > 0) {
      setPresets(initialPresets);
      return;
    }
    if (isOwnProfile) {
      setPresets(getRadioPresets());
      return subscribeRadioPresets((updated) => setPresets(updated));
    }
  }, [initialPresets, isOwnProfile]);

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  };

  const handleTunePreset = (preset: RadioPreset) => {
    const trackId = `radio:${preset.stationId}`;
    if (audioSource === 'RADIO' && currentTrack?.id === trackId) {
      isPlaying ? pause() : resume();
      return;
    }

    const track: Track = {
      id: trackId,
      title: preset.stationName,
      artist: preset.location || 'Live Radio',
      url: preset.streamUrl,
      albumCover: preset.coverUrl || undefined,
      genre: preset.genre,
    };

    const album: Album = {
      id: `radio_preset_${preset.stationId}`,
      title: preset.stationName,
      artist: preset.location || 'Live Broadcast',
      coverImage: preset.coverUrl || '',
      tracks: [track],
      description: 'Saved Radio Preset',
      themeColor: '#00DAF3',
      createdAt: Date.now(),
    };

    playTrack(track, album, 'RADIO');
  };

  const openRadioDirectory = () => {
    if (onOpenRadio) {
      onOpenRadio();
    } else {
      window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'RADIO' } }));
    }
  };

  // If visitor and no presets, do not render row
  if (!isOwnProfile && presets.length === 0) {
    return null;
  }

  return (
    <div className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white flex items-center gap-3">
          <span className="w-0.5 h-4 bg-gradient-to-b from-[#00DAF3] to-small-orange rounded-full" />
          <Radio size={13} className="text-[#00DAF3]" /> Radio Presets
          {presets.length > 0 && (
            <span className="text-white/30 text-[9px] font-bold tracking-widest">
              · {presets.length} {presets.length === 1 ? 'Station' : 'Stations'}
            </span>
          )}
        </h3>

        <div className="flex items-center gap-2">
          <button
            onClick={openRadioDirectory}
            className="text-[9px] font-black uppercase tracking-widest text-[#00DAF3] hover:underline mr-2 flex items-center gap-1"
          >
            Explore Live Radio
          </button>
          {presets.length > 2 && (
            <>
              <button
                onClick={() => scroll(-1)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => scroll(1)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Empty State for Profile Owner */}
      {presets.length === 0 && isOwnProfile ? (
        <div className="p-6 rounded-3xl bg-white/[0.02] border border-dashed border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-[#00DAF3]">
              <Bookmark size={20} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-white">No Presets Saved Yet</p>
              <p className="text-[10px] text-white/40 font-medium">Bookmark live radio stations from the dial to tune in here with 1 click.</p>
            </div>
          </div>
          <button
            onClick={openRadioDirectory}
            className="px-4 py-2.5 rounded-full bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg hover:brightness-110 transition-all shrink-0"
          >
            <Plus size={13} /> Add Radio Presets
          </button>
        </div>
      ) : (
        /* Presets Carousel */
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 snap-x custom-scrollbar"
          style={{ scrollbarWidth: 'thin' }}
        >
          {presets.map((preset, index) => {
            const isLiveStation = audioSource === 'RADIO' && currentTrack?.id === `radio:${preset.stationId}`;
            const isStationPlaying = isLiveStation && isPlaying;

            return (
              <div
                key={preset.stationId}
                className={`snap-start shrink-0 w-[240px] p-4 rounded-3xl border transition-all flex flex-col justify-between ${
                  isStationPlaying
                    ? 'bg-[#00DAF3]/10 border-[#00DAF3]/50 shadow-[0_4px_24px_rgba(0,218,243,0.15)]'
                    : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                }`}
              >
                <div>
                  {/* Top bar with preset number tag */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-black text-white/60 tracking-wider font-mono">
                      PRESET {index + 1}
                    </span>
                    {preset.genre && (
                      <span className="text-[8px] font-black uppercase tracking-widest text-[#00DAF3] truncate max-w-[110px]">
                        {preset.genre}
                      </span>
                    )}
                  </div>

                  {/* Artwork & details */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 flex items-center justify-center">
                      {preset.coverUrl ? (
                        <img
                          src={preset.coverUrl}
                          alt={preset.stationName}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                        />
                      ) : (
                        <Radio size={20} className="text-white/30" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-black uppercase tracking-tight text-white truncate" title={preset.stationName}>
                        {preset.stationName}
                      </h4>
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider truncate mt-0.5">
                        {preset.location || 'Live Broadcast'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tune In Button */}
                <button
                  onClick={() => handleTunePreset(preset)}
                  className={`w-full py-2.5 px-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                    isStationPlaying
                      ? 'bg-[#00DAF3] text-black shadow-lg hover:brightness-110'
                      : 'bg-white/5 hover:bg-white/10 text-white'
                  }`}
                >
                  {isStationPlaying ? (
                    <>
                      <Pause size={12} fill="currentColor" />
                      <span>Tuned In</span>
                      <Volume2 size={12} className="animate-pulse ml-auto" />
                    </>
                  ) : (
                    <>
                      <Play size={12} fill="currentColor" />
                      <span>Tune In</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RadioPresetsRow;
