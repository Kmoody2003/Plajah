import React, { useState, useEffect } from 'react';
import { Video, Track, PodcastMetadata, AdMarker } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Mic2, Plus, Trash2, Clock, Save, Play, Pause, ChevronRight } from 'lucide-react';
import { updateVideo, updateTrack } from '../services/backendService';

interface PodcastManagerProps {
  content: Video | Track;
  onUpdate: () => void;
}

const PodcastManager: React.FC<PodcastManagerProps> = ({ content, onUpdate }) => {
  const [metadata, setMetadata] = useState<PodcastMetadata>(content.podcastMetadata || {
    episodeNumber: 1,
    seasonNumber: 1,
    isExplicit: false,
    category: 'Society & Culture',
    showTitle: content.title
  });
  const [adMarkers, setAdMarkers] = useState<AdMarker[]>(content.adMarkers || []);
  const [newMarkerTime, setNewMarkerTime] = useState('');
  const [newMarkerLabel, setNewMarkerLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if ('url' in content && !('albumId' in content)) {
        // It's a Video
        await updateVideo(content.id, {
          podcastMetadata: metadata,
          adMarkers: adMarkers
        });
      } else {
        // It's a Track
        await updateTrack(content.id, {
          podcastMetadata: metadata,
          adMarkers: adMarkers
        });
      }
      onUpdate();
    } catch (error) {
      console.error("Failed to save podcast settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const addMarker = () => {
    if (!newMarkerTime) return;
    const seconds = parseTimeToSeconds(newMarkerTime);
    const newMarker: AdMarker = {
      id: Math.random().toString(36).substr(2, 9),
      time: seconds,
      label: newMarkerLabel || `Ad Break at ${newMarkerTime}`
    };
    setAdMarkers(prev => [...prev, newMarker].sort((a, b) => a.time - b.time));
    setNewMarkerTime('');
    setNewMarkerLabel('');
  };

  const removeMarker = (id: string) => {
    setAdMarkers(adMarkers.filter(m => m.id !== id));
  };

  const parseTimeToSeconds = (time: string) => {
    const parts = time.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };

  const formatSecondsToTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  };

  return (
    <div className="space-y-8 p-6 bg-white/5 rounded-3xl border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mic2 className="text-small-orange" size={24} />
          <h3 className="text-xl font-black uppercase tracking-widest">Podcast Settings</h3>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Metadata */}
        <div className="space-y-6">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Episode Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Season</label>
              <input 
                type="number" 
                value={metadata.seasonNumber}
                onChange={e => setMetadata({...metadata, seasonNumber: parseInt(e.target.value)})}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold outline-none focus:ring-1 ring-small-orange"
              />
            </div>
            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Episode</label>
              <input 
                type="number" 
                value={metadata.episodeNumber}
                onChange={e => setMetadata({...metadata, episodeNumber: parseInt(e.target.value)})}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold outline-none focus:ring-1 ring-small-orange"
              />
            </div>
          </div>
          <div>
            <label className="block text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Category</label>
            <select 
              value={metadata.category}
              onChange={e => setMetadata({...metadata, category: e.target.value})}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold outline-none focus:ring-1 ring-small-orange"
            >
              <option value="Society & Culture">Society & Culture</option>
              <option value="Technology">Technology</option>
              <option value="Business">Business</option>
              <option value="Comedy">Comedy</option>
              <option value="Education">Education</option>
            </select>
          </div>
        </div>

        {/* Ad Markers */}
        <div className="space-y-6">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Ad Insertion Markers</h4>
          
          {/* Timeline Visualization */}
          <div className="relative h-4 bg-white/5 rounded-full overflow-hidden mb-8">
            {adMarkers.map(marker => (
              <div 
                key={marker.id}
                className="absolute top-0 bottom-0 w-1 bg-small-orange shadow-[0_0_10px_rgba(255,140,0,0.5)]"
                style={{ left: `${(marker.time / (content.duration || 3600)) * 100}%` }}
                title={marker.label}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="HH:MM:SS"
              value={newMarkerTime}
              onChange={e => setNewMarkerTime(e.target.value)}
              className="w-24 bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] font-bold outline-none focus:ring-1 ring-small-orange"
            />
            <input 
              type="text" 
              placeholder="Marker Label"
              value={newMarkerLabel}
              onChange={e => setNewMarkerLabel(e.target.value)}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] font-bold outline-none focus:ring-1 ring-small-orange"
            />
            <button 
              onClick={addMarker}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
            {adMarkers.map(marker => (
              <div key={marker.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group">
                <div className="flex items-center gap-3">
                  <Clock size={12} className="text-white/20" />
                  <span className="text-[10px] font-bold text-small-orange">{formatSecondsToTime(marker.time)}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[150px]">{marker.label}</span>
                </div>
                <button 
                  onClick={() => removeMarker(marker.id)}
                  className="p-1 text-white/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PodcastManager;
