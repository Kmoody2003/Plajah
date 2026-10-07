import React, { useEffect, useState } from 'react';
import { Heart, Tv, Play } from 'lucide-react';
import type { FavoriteChannel } from '../../types';
import { getFavoriteChannels, subscribeFavoriteChannels, toggleFavoriteChannel } from '../../services/favoriteChannelsService';
import ChannelLogo from '../tv/ChannelLogo';

/**
 * Favorite TV+ channels — sits with the Radio Presets on the profile. The owner sees their live
 * list (and can unstar); visitors see what the profile has saved. Tapping a channel opens the Live
 * Hub tuned to exactly that channel.
 */
const FavoriteChannelsRow: React.FC<{ favorites?: FavoriteChannel[]; isOwnProfile?: boolean; ownerUid?: string }> = ({ favorites, isOwnProfile = false, ownerUid }) => {
  const [list, setList] = useState<FavoriteChannel[]>(() => (isOwnProfile ? getFavoriteChannels(ownerUid) : favorites || []));

  useEffect(() => {
    if (isOwnProfile) return subscribeFavoriteChannels(setList, ownerUid);
    setList(favorites || []);
  }, [isOwnProfile, favorites, ownerUid]);

  if (!isOwnProfile && list.length === 0) return null;

  const tune = (f: FavoriteChannel) => {
    const focus = f.plajahId ? { plajahId: f.plajahId }
      : f.key.startsWith('fast_') ? { ownerId: f.ownerId, sourceId: f.key }
      : f.ownerId ? { ownerId: f.ownerId }
      : { sourceId: f.sourceId };
    window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'LIVE_HUB', params: { focus: { ...focus, number: f.number } } } }));
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white flex items-center gap-3">
          <span className="w-0.5 h-4 bg-gradient-to-b from-small-orange to-[#D40055] rounded-full" />
          <Heart size={13} className="text-small-orange" /> Favorite Channels
          {list.length > 0 && <span className="text-white/30 text-[9px] font-bold tracking-widest">· {list.length} {list.length === 1 ? 'Channel' : 'Channels'}</span>}
        </h3>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'LIVE_HUB' } }))}
          className="text-[9px] font-black uppercase tracking-widest text-small-orange hover:underline"
        >Open Live TV+</button>
      </div>

      {list.length === 0 ? (
        <div className="p-6 rounded-3xl bg-white/[0.02] border border-dashed border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-small-orange shrink-0"><Tv size={20} /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-white">No Favorite Channels Yet</p>
            <p className="text-[10px] text-white/40 font-medium">Tap the heart on any Live TV+ channel to keep it here.</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
          {list.map(f => (
            <div key={f.key} className="snap-start shrink-0 w-[240px] p-4 rounded-3xl border bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all flex flex-col justify-between">
              <div className="flex items-center gap-3 mb-3">
                <ChannelLogo src={f.logoUrl} name={f.name} size={48} />
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-black uppercase tracking-tight text-white truncate" title={f.name}>{f.name}</h4>
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider truncate mt-0.5">{f.number ? `CH ${f.number}` : 'Live TV+'}</p>
                </div>
                {isOwnProfile && (
                  <button
                    type="button"
                    aria-label={`Remove ${f.name} from favorites`}
                    title="Remove from favorites"
                    onClick={() => void toggleFavoriteChannel(f, ownerUid)}
                    className="w-8 h-8 shrink-0 rounded-full grid place-items-center text-small-orange hover:bg-white/10"
                  ><Heart size={14} fill="currentColor" /></button>
                )}
              </div>
              <button
                onClick={() => tune(f)}
                className="w-full py-2.5 px-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white transition-all"
              ><Play size={12} fill="currentColor" /> Tune In</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FavoriteChannelsRow;
