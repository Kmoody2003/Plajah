import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Ticket, Sparkles, ArrowLeft, Disc, Film, Music2,
  Check, Palette, Layers, RefreshCw, Eye, Save,
  Sliders, Video, Radio, Shield, Image as ImageIcon
} from 'lucide-react';
import { TELA_STYLE_ERAS, TelaStyleEra } from '../services/telaStyleEraLibrary';
import { TelaTicketDesign, AlbumArtTransform } from '../types';
import TelaTicketPass from './tela/TelaTicketPass';

export interface TicketDesignerProps {
  eventId?: string;
  eventTitle?: string;
  artistName?: string;
  date?: string;
  time?: string;
  venue?: string;
  city?: string;
  coverImage?: string;
  initialDesign?: Partial<TelaTicketDesign>;
  onSave?: (ticketData: any, design: TelaTicketDesign) => void;
  onBack?: () => void;
  previewOnly?: boolean;
}

const ALBUM_TRANSFORMS: { id: AlbumArtTransform; label: string; desc: string; icon: React.ComponentType<any> }[] = [
  { id: 'VINYL_RECORD', label: '12" Vinyl Disc', desc: 'Spinning grooved vinyl emerging from album sleeve', icon: Disc },
  { id: 'HOLOGRAPHIC_FOIL', label: 'Holographic Foil', desc: 'Dynamic rainbow iridescent security shimmer', icon: Sparkles },
  { id: 'CASSETTE_TAPE', label: 'Vintage Cassette', desc: 'Transparent tape cassette with mechanical spools', icon: Radio },
  { id: 'NEON_CYBERPUNK', label: 'Neon Cyberpunk', desc: 'Phosphor scanlines, chromatic glow & duotone', icon: ZapIcon },
  { id: 'GOLD_EMBOSSED', label: 'VIP Gold Leaf', desc: 'Metallic gold foil borders & debossed luxury stamp', icon: Shield },
  { id: 'CRT_GLITCH', label: 'Analog CRT Glitch', desc: 'Retro cathode ray tube with VHS scanlines', icon: Film },
  { id: 'MATTE_EDITORIAL', label: 'Matte Editorial', desc: 'Fine paper grain, stark Swiss typographic rules', icon: Layers },
];

function ZapIcon(props: any) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

const TicketDesigner: React.FC<TicketDesignerProps> = ({
  eventId = 'evt-plj-01',
  eventTitle = 'The Velvet Underground Live Sessions',
  artistName = 'Miles & The Rhythm Collective',
  date = 'Friday, Nov 14, 2026',
  time = '8:00 PM',
  venue = 'The Blue Room',
  city = 'Detroit, MI',
  coverImage = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
  initialDesign,
  onSave,
  onBack,
  previewOnly = false,
}) => {
  const [activeTab, setActiveTab] = useState<'eras' | 'transforms' | 'video_audio' | 'preview'>('eras');

  // Selected Tela Era
  const [selectedEra, setSelectedEra] = useState<TelaStyleEra>(() => {
    const found = TELA_STYLE_ERAS.find(e => e.id === initialDesign?.eraId);
    return found || TELA_STYLE_ERAS.find(e => e.id === 'art-deco') || TELA_STYLE_ERAS[0];
  });

  // Selected Album Art Transform
  const [albumTransform, setAlbumTransform] = useState<AlbumArtTransform>(
    initialDesign?.albumArtTransform || 'VINYL_RECORD'
  );

  // Video and Audio integration
  const [videoUrl, setVideoUrl] = useState(initialDesign?.videoUrl || '');
  const [audioUrl, setAudioUrl] = useState(initialDesign?.audioPreviewUrl || '');
  const [audioTitle, setAudioTitle] = useState(initialDesign?.audioTrackTitle || 'Tour Intro Preview');
  const [activeCoverImage, setActiveCoverImage] = useState(coverImage);
  const [savedNotice, setSavedNotice] = useState(false);

  // Compiled design object
  const currentDesign: TelaTicketDesign = {
    templateId: initialDesign?.templateId,
    eraId: selectedEra.id,
    eraName: selectedEra.name,
    palette: selectedEra.palette,
    typography: selectedEra.typography,
    albumArtTransform: albumTransform,
    videoUrl: videoUrl.trim() || undefined,
    videoLoopEnabled: !!videoUrl.trim(),
    audioPreviewUrl: audioUrl.trim() || undefined,
    audioTrackTitle: audioTitle.trim() || undefined,
  };

  const handleSave = () => {
    if (onSave) {
      onSave(
        {
          eventId,
          eventTitle,
          artistName,
          date,
          time,
          venue,
          city,
        },
        currentDesign
      );
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col font-sans">
      {/* Top Bar */}
      <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/60 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-xl transition-all"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#6B0099] to-[#D40055] flex items-center justify-center shadow-lg shadow-purple-900/30">
            <Ticket size={20} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black uppercase tracking-tight">Tela Ticketing Design System</h1>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Powered by Tela
              </span>
            </div>
            <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">
              Transform Album Art · Looping Video Pass · Dynamic Security Shimmer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {savedNotice && (
            <span className="flex items-center gap-1.5 text-xs font-black text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30">
              <Check size={14} /> Saved Design!
            </span>
          )}
          {!previewOnly && (
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-xs font-black uppercase tracking-wider hover:brightness-110 transition-all shadow-xl shadow-purple-900/20"
            >
              <Save size={14} /> Save Design
            </button>
          )}
        </div>
      </header>

      {/* Main Split Interface */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Controls & Selectors */}
        <div className="w-full lg:w-[480px] border-r border-white/10 flex flex-col bg-[#0a0a0a] shrink-0 overflow-hidden">
          {/* Sub Navigation */}
          <div className="flex border-b border-white/10 p-2 gap-1.5 bg-black/40">
            {[
              { id: 'eras', label: '1. Tela Era', icon: Palette },
              { id: 'transforms', label: '2. Album Art', icon: Disc },
              { id: 'video_audio', label: '3. Video & Audio', icon: Film },
            ].map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    active
                      ? 'bg-white/15 text-white border border-white/20 shadow-md'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                  }`}
                >
                  <Icon size={13} className={active ? 'text-pink-400' : ''} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab 1: Tela Eras */}
          {activeTab === 'eras' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Design History Eras</p>
                <p className="text-xs text-white/60">
                  Select a historical or contemporary visual movement to guide color palette, layout, and typography.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {TELA_STYLE_ERAS.slice(0, 16).map(era => {
                  const isSelected = selectedEra.id === era.id;
                  const [paper, ink, accent, secondary] = era.palette;
                  return (
                    <button
                      key={era.id}
                      onClick={() => setSelectedEra(era)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'border-pink-500 bg-pink-500/10 shadow-lg shadow-pink-900/20'
                          : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-white truncate">{era.name}</span>
                        {isSelected && <Check size={12} className="text-pink-400 shrink-0" />}
                      </div>
                      <div className="flex gap-1 mb-2">
                        {era.palette.map((color, i) => (
                          <span
                            key={i}
                            className="w-3.5 h-3.5 rounded-full border border-white/20"
                            style={{ background: color }}
                          />
                        ))}
                      </div>
                      <p className="text-[9px] text-white/40 line-clamp-2 leading-tight">
                        {era.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Album Art Transformations */}
          {activeTab === 'transforms' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Album Art Transformations</p>
                <p className="text-xs text-white/60">
                  Transform standard event artwork into 3D physical artifacts or high-concept digital textures.
                </p>
              </div>

              {/* Cover Image Input */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-white/50 block">
                  Cover Art URL
                </label>
                <div className="flex gap-2">
                  <input
                    value={activeCoverImage}
                    onChange={e => setActiveCoverImage(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                  />
                  <label className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-wider cursor-pointer flex items-center justify-center">
                    <ImageIcon size={14} />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = ev => setActiveCoverImage(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Transformations List */}
              <div className="space-y-2">
                {ALBUM_TRANSFORMS.map(t => {
                  const Icon = t.icon;
                  const isSelected = albumTransform === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setAlbumTransform(t.id)}
                      className={`w-full p-3.5 rounded-2xl border flex items-center gap-3 text-left transition-all ${
                        isSelected
                          ? 'border-purple-400 bg-purple-500/10 shadow-lg shadow-purple-900/20'
                          : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-purple-500 text-white' : 'bg-white/10 text-white/50'
                        }`}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-white">{t.label}</p>
                          {isSelected && <Check size={14} className="text-purple-400" />}
                        </div>
                        <p className="text-[10px] text-white/40 mt-0.5">{t.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 3: Video & Audio Preview */}
          {activeTab === 'video_audio' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Video & Audio Integration</p>
                <p className="text-xs text-white/60">
                  Embed live looping concert visuals or music clips directly inside the ticket pass.
                </p>
              </div>

              {/* Video URL */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
                <div className="flex items-center gap-2">
                  <Film size={14} className="text-amber-400" />
                  <label className="text-[10px] font-black uppercase tracking-wider text-white/70">
                    Looping Background Video (MP4 / WebM)
                  </label>
                </div>
                <input
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://assets.example.com/loop.mp4"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                />
                <p className="text-[9px] text-white/35">
                  Replaces the static art with an ambient video loop when attendees open their ticket.
                </p>
              </div>

              {/* Audio Preview */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
                <div className="flex items-center gap-2">
                  <Music2 size={14} className="text-pink-400" />
                  <label className="text-[10px] font-black uppercase tracking-wider text-white/70">
                    Artist Audio Preview Track
                  </label>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-white/40 block mb-1">
                    Track Title
                  </label>
                  <input
                    value={audioTitle}
                    onChange={e => setAudioTitle(e.target.value)}
                    placeholder="e.g. Tour Exclusive Demo"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-white/40 block mb-1">
                    Audio Stream URL (MP3 / AAC)
                  </label>
                  <input
                    value={audioUrl}
                    onChange={e => setAudioUrl(e.target.value)}
                    placeholder="https://assets.example.com/preview.mp3"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Live Interactive Ticket Canvas */}
        <div className="flex-1 bg-[#050505] p-6 lg:p-12 overflow-y-auto flex flex-col items-center justify-center">
          <div className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
                Live Interactive Pass
              </span>
              <span className="text-[10px] font-black uppercase text-pink-400 flex items-center gap-1">
                <Sparkles size={11} /> {selectedEra.name} · {ALBUM_TRANSFORMS.find(t => t.id === albumTransform)?.label}
              </span>
            </div>

            {/* The Unified Ticket Pass */}
            <TelaTicketPass
              eventTitle={eventTitle}
              artistName={artistName}
              date={date}
              time={time}
              venue={venue}
              city={city}
              coverImage={activeCoverImage}
              design={currentDesign}
              interactive={true}
              onJoinPhotoPool={() => alert('Demo: Joins live crowd photo pool')}
              onAutoCheckIn={() => alert('Demo: Geofence check-in activated')}
              geofenceNearby={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDesigner;
