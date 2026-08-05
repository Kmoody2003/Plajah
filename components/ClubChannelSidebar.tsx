import React, { useState } from 'react';
import { Hash, Plus, Megaphone, Image as ImageIcon, Calendar, Trash2, X, Check } from 'lucide-react';
import type { Club, ClubChannel, ClubChannelType } from '../types';
import { addClubChannel, deleteClubChannel } from '../services/backendService';

const TYPE_ICONS: Record<ClubChannelType, React.ReactNode> = {
  TEXT:         <Hash size={13} />,
  ANNOUNCEMENT: <Megaphone size={13} />,
  MEDIA:        <ImageIcon size={13} />,
  EVENTS:       <Calendar size={13} />,
};

const TYPE_COLORS: Record<ClubChannelType, string> = {
  TEXT: 'text-white/50', ANNOUNCEMENT: 'text-amber-400', MEDIA: 'text-sky-400', EVENTS: 'text-green-400',
};

interface Props {
  club: Club;
  activeChannelId: string | null;
  onSelectChannel: (id: string | null) => void;
  isAdmin: boolean;
  onChannelsChanged: (channels: ClubChannel[]) => void;
}

export default function ClubChannelSidebar({ club, activeChannelId, onSelectChannel, isAdmin, onChannelsChanged }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ClubChannelType>('TEXT');
  const [adding, setAdding] = useState(false);

  const channels = club.channels ?? [];

  const handleAdd = async () => {
    if (!newName.trim() || adding) return;
    setAdding(true);
    await addClubChannel(club.id, { name: newName.trim(), type: newType });
    const updated: ClubChannel[] = [...channels, { id: `ch_${Date.now()}`, name: newName.trim(), type: newType, createdAt: Date.now() }];
    onChannelsChanged(updated);
    setNewName('');
    setShowAdd(false);
    setAdding(false);
  };

  const handleDelete = async (channelId: string) => {
    await deleteClubChannel(club.id, channelId);
    const updated = channels.filter(c => c.id !== channelId);
    onChannelsChanged(updated);
    if (activeChannelId === channelId) onSelectChannel(null);
  };

  return (
    <div className="w-48 flex-shrink-0 border-r border-white/5 flex flex-col bg-black/20">
      <div className="px-3 pt-4 pb-2">
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 px-2 mb-2">Channels</p>

        {/* General channel */}
        <button onClick={() => onSelectChannel(null)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-left group"
          style={{ background: activeChannelId === null ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
          <Hash size={13} className={activeChannelId === null ? 'text-white' : 'text-white/35'} />
          <span className={`text-[10px] font-bold ${activeChannelId === null ? 'text-white' : 'text-white/40'}`}>general</span>
        </button>

        {/* User-created channels */}
        {channels.map(ch => (
          <div key={ch.id}
            className="flex items-center gap-1 rounded-xl transition-all group"
            style={{ background: activeChannelId === ch.id ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
            <button onClick={() => onSelectChannel(ch.id)}
              className="flex-1 flex items-center gap-2 px-3 py-2 text-left min-w-0">
              <span className={TYPE_COLORS[ch.type]}>{TYPE_ICONS[ch.type]}</span>
              <span className={`text-[10px] font-bold truncate ${activeChannelId === ch.id ? 'text-white' : 'text-white/40'}`}>{ch.name}</span>
            </button>
            {isAdmin && (
              <button onClick={() => handleDelete(ch.id)}
                className="pr-2 opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all">
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}

        {/* Add channel */}
        {isAdmin && !showAdd && (
          <button onClick={() => setShowAdd(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all mt-1">
            <Plus size={11} /> Add Channel
          </button>
        )}

        {showAdd && (
          <div className="mt-2 space-y-2">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="channel-name"
              autoFocus
              className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/20 outline-none" />
            <div className="flex gap-1">
              {(['TEXT','ANNOUNCEMENT','MEDIA','EVENTS'] as ClubChannelType[]).map(t => (
                <button key={t} onClick={() => setNewType(t)}
                  className="flex-1 py-1 rounded text-[7px] font-black uppercase transition-all"
                  style={{
                    background: newType === t ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                    color: newType === t ? '#fff' : 'rgba(255,255,255,0.25)',
                  }}>
                  {t === 'ANNOUNCEMENT' ? 'ANN' : t === 'EVENTS' ? 'EVT' : t === 'MEDIA' ? 'MED' : 'TXT'}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 py-1.5 rounded-lg text-[8px] font-black text-white/25 hover:text-white transition-all">
                <X size={10} className="mx-auto" />
              </button>
              <button onClick={handleAdd} disabled={!newName.trim() || adding}
                className="flex-1 py-1.5 rounded-lg text-[8px] font-black bg-white/12 text-white disabled:opacity-30 transition-all">
                <Check size={10} className="mx-auto" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
