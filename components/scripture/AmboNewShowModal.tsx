// AmboNewShowModal — Modal dialog for creating presentations, songs, liturgies, and playlists in Ambo Pro.

import React, { useState } from 'react';
import { X, Plus, Music, BookOpen, Presentation, Film, Layers, Sparkles, Calendar } from 'lucide-react';
import { newId, type Show, type Slide, type ShowKind, type PlaylistItem } from '../../services/ambo/showModel';

interface AmboNewShowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateShow: (show: Show) => void;
  onCreatePlaylistItem?: (item: PlaylistItem) => void;
}

const COLORS = [
  { name: 'Orange (Standard)', val: '#FF8C00' },
  { name: 'Cyan (Modern)', val: '#00DAF3' },
  { name: 'Gold (Scripture)', val: '#E3C57E' },
  { name: 'Magenta (Worship)', val: '#D40055' },
  { name: 'Lilac (Liturgy)', val: '#D0BCFF' },
  { name: 'Emerald (Fellowship)', val: '#10B981' },
];

export const AmboNewShowModal: React.FC<AmboNewShowModalProps> = ({
  isOpen,
  onClose,
  onCreateShow,
  onCreatePlaylistItem,
}) => {
  const [tab, setTab] = useState<'show' | 'playlist'>('show');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ShowKind>('PRESENTATION');
  const [slideCount, setSlideCount] = useState<number>(3);
  const [selectedColor, setSelectedColor] = useState<string>('#FF8C00');
  const [plannedDurationMins, setPlannedDurationMins] = useState<number>(15);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || (tab === 'show' ? 'Untitled Presentation' : 'Sunday Service');

    if (tab === 'show') {
      const initialSlides: Slide[] = Array.from({ length: Math.max(1, slideCount) }, (_, i) => ({
        id: newId('sl'),
        label: i === 0 ? 'Title Slide' : `Slide ${i + 1}`,
        group: kind === 'SONG' ? (i === 0 ? 'Verse 1' : i === 1 ? 'Chorus' : 'Bridge') : 'Main Section',
        groupColor: selectedColor,
        layers: [
          {
            id: newId('ly_bg'),
            slot: 'background',
            content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
          },
          {
            id: newId('ly_txt'),
            slot: 'slide',
            content: {
              kind: 'TEXT',
              blocks: [
                {
                  text: i === 0 ? finalTitle : `Content for Slide ${i + 1}`,
                  role: i === 0 ? 'title' : 'body',
                },
              ],
            },
          },
        ],
      }));

      const newShow: Show = {
        id: newId('sh'),
        title: finalTitle,
        kind,
        slides: initialSlides,
      };

      onCreateShow(newShow);
    } else if (onCreatePlaylistItem) {
      const linkedShow: Show = {
        id: newId('sh'),
        title: finalTitle,
        kind: 'PRESENTATION',
        slides: [
          {
            id: newId('sl'),
            label: 'Service Opening',
            group: 'Call to Worship',
            groupColor: selectedColor,
            layers: [
              {
                id: newId('ly_bg'),
                slot: 'background',
                content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
              },
              {
                id: newId('ly_txt'),
                slot: 'slide',
                content: {
                  kind: 'TEXT',
                  blocks: [{ text: finalTitle, role: 'title' }],
                },
              },
            ],
          },
        ],
      };

      onCreatePlaylistItem({
        id: newId('pi'),
        title: finalTitle,
        plannedSec: plannedDurationMins * 60,
        show: linkedShow,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#130b1c] border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-[#FF8C00]/20 text-[#FF8C00] font-bold">
              <Plus size={16} />
            </span>
            <h2 className="text-base font-bold text-white">Create New Presentation or Playlist</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-white/10 p-2 gap-2 bg-black/30">
          <button
            type="button"
            onClick={() => setTab('show')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              tab === 'show'
                ? 'bg-[#FF8C00] text-[#1a0f02] shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Presentation size={14} />
            <span>New Presentation / Show</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('playlist')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              tab === 'playlist'
                ? 'bg-[#00DAF3] text-[#04222a] shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Calendar size={14} />
            <span>New Service Playlist</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleCreate} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
              {tab === 'show' ? 'Presentation Title' : 'Playlist Item Title'}
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={tab === 'show' ? 'e.g. Sunday Sermon · Walking by Faith' : 'e.g. 10:00 AM Worship Gathering'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white text-sm focus:border-[#FF8C00] focus:outline-hidden transition-all"
            />
          </div>

          {tab === 'show' ? (
            <>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
                  Show Kind / Template
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'PRESENTATION', label: 'Presentation', icon: <Presentation size={13} /> },
                    { id: 'SONG', label: 'Worship Song', icon: <Music size={13} /> },
                    { id: 'SCRIPTURE', label: 'Scripture Reading', icon: <BookOpen size={13} /> },
                    { id: 'LITURGY', label: 'Liturgy & Prayer', icon: <Sparkles size={13} /> },
                  ].map(k => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setKind(k.id as ShowKind)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all ${
                        kind === k.id
                          ? 'border-[#FF8C00] bg-[#FF8C00]/15 text-white'
                          : 'border-white/10 hover:border-white/20 text-white/60 hover:text-white bg-white/[0.02]'
                      }`}
                    >
                      <span className={kind === k.id ? 'text-[#FF8C00]' : 'text-white/40'}>{k.icon}</span>
                      <span>{k.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
                    Initial Slides
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={slideCount}
                    onChange={e => setSlideCount(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white text-xs focus:border-[#FF8C00] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
                    Theme Color
                  </label>
                  <select
                    value={selectedColor}
                    onChange={e => setSelectedColor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white text-xs focus:border-[#FF8C00] focus:outline-hidden"
                  >
                    {COLORS.map(c => (
                      <option key={c.val} value={c.val} className="bg-[#130b1c] text-white">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
                Planned Duration (Minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={plannedDurationMins}
                onChange={e => setPlannedDurationMins(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white text-xs focus:border-[#00DAF3] focus:outline-hidden"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
              style={{
                background: tab === 'show' ? 'linear-gradient(135deg,#D40055,#FF8C00)' : 'linear-gradient(135deg,#00DAF3,#0080FF)',
              }}
            >
              {tab === 'show' ? 'Create Presentation' : 'Add to Playlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
