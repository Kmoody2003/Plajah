import React, { useState, useEffect } from 'react';
import { Photo, PhotoAlbum, UserProfile } from '../types';
import { 
  Plus, 
  Grid, 
  List, 
  Lock, 
  Globe, 
  Trash2, 
  Image as ImageIcon, 
  FolderPlus,
  Cloud,
  Upload,
  Settings,
  Play,
  MoreVertical,
  CheckCircle2,
  X,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { uploadPhoto, createPhotoAlbum, auth, db } from '../services/backendService';
import { doc, updateDoc } from 'firebase/firestore';

interface PhotoManagerProps {
  profile: UserProfile;
  onUpdate?: (updated: UserProfile) => void;
}

const PhotoManager: React.FC<PhotoManagerProps> = ({ profile, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'ALBUMS' | 'IMPORT'>('ALL');
  const [isUploading, setIsUploading] = useState(false);
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadedPhotos: Photo[] = [];
      for (let i = 0; i < files.length; i++) {
        const photo = await uploadPhoto(files[i], { isPublic: false });
        if (photo) uploadedPhotos.push(photo);
      }
      if (onUpdate) {
        onUpdate({
          ...profile,
          photos: [...(profile.photos || []), ...uploadedPhotos]
        });
      }
    } catch (error) {
      console.error("Bulk upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTogglePrivacy = async (photoId: string, currentPublic: boolean) => {
    try {
      await updateDoc(doc(db, 'photos', photoId), { isPublic: !currentPublic });
      if (onUpdate) {
        onUpdate({
          ...profile,
          photos: (profile.photos || []).map(p => p.id === photoId ? { ...p, isPublic: !currentPublic } : p)
        });
      }
    } catch (error) {
      console.error("Privacy toggle failed:", error);
    }
  };

  const handleCreateAlbum = async () => {
    if (!newAlbumTitle) return;
    try {
      const album = await createPhotoAlbum({ 
        title: newAlbumTitle, 
        photoIds: selectedPhotos,
        isPublic: false 
      });
      if (album && onUpdate) {
        onUpdate({
          ...profile,
          photoAlbums: [...(profile.photoAlbums || []), album]
        });
      }
      setIsCreateAlbumOpen(false);
      setNewAlbumTitle('');
      setSelectedPhotos([]);
      setIsSelectionMode(false);
    } catch (error) {
      console.error("Album creation failed:", error);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-white/5 rounded-2xl">
            <ImageIcon className="text-white" size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tightest">Photo Archive</h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              Private Storage • {profile.photos?.length || 0} Captures • {profile.photoAlbums?.length || 0} Albums
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('IMPORT')}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            <Cloud size={14} />
            Import Cloud
          </button>
          <label className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:scale-105 transition-all shadow-xl">
            <Upload size={14} />
            Bulk Upload
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-white/5 rounded-full self-start">
        {[
          { id: 'ALL', label: 'All Media', icon: Grid },
          { id: 'ALBUMS', label: 'Albums', icon: FolderPlus },
          { id: 'IMPORT', label: 'Cloud Import', icon: Cloud }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-black shadow-lg' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeTab === 'ALL' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsSelectionMode(!isSelectionMode)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isSelectionMode ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}
                >
                  {isSelectionMode ? 'Cancel Selection' : 'Select Photos'}
                </button>
                {isSelectionMode && selectedPhotos.length > 0 && (
                  <button 
                    onClick={() => setIsCreateAlbumOpen(true)}
                    className="px-4 py-2 bg-white text-black rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                  >
                    Create Album ({selectedPhotos.length})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/20">
                <Lock size={12} />
                <span>Default Private</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {profile.photos?.map((photo) => (
                <div 
                  key={photo.id}
                  className={`relative aspect-square rounded-2xl overflow-hidden group cursor-pointer border-2 transition-all ${selectedPhotos.includes(photo.id) ? 'border-small-orange scale-95' : 'border-transparent'}`}
                  onClick={() => {
                    if (isSelectionMode) {
                      setSelectedPhotos(prev => prev.includes(photo.id) ? prev.filter(id => id !== photo.id) : [...prev, photo.id]);
                    }
                  }}
                >
                  <img src={photo.url || null} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  
                  {/* Selection Check */}
                  {isSelectionMode && selectedPhotos.includes(photo.id) && (
                    <div className="absolute top-2 right-2 bg-small-orange text-white rounded-full p-1">
                      <CheckCircle2 size={16} />
                    </div>
                  )}

                  {/* Privacy Toggle Overlay */}
                  {!isSelectionMode && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleTogglePrivacy(photo.id, !!photo.isPublic); }}
                        className={`p-3 rounded-full backdrop-blur-md transition-all ${photo.isPublic ? 'bg-white text-black' : 'bg-black/60 text-white/60 hover:text-white'}`}
                        title={photo.isPublic ? 'Set to Private' : 'Set to Public'}
                      >
                        {photo.isPublic ? <Globe size={20} /> : <Lock size={20} />}
                      </button>
                      <button className="p-3 rounded-full bg-black/60 text-white/60 hover:text-red-500 backdrop-blur-md transition-all">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  )}

                  {/* Privacy Badge */}
                  <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md flex items-center gap-1">
                    {photo.isPublic ? <Globe size={10} className="text-blue-400" /> : <Lock size={10} className="text-white/40" />}
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/60">
                      {photo.isPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                </div>
              ))}
              
              {(!profile.photos || profile.photos.length === 0) && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                  <ImageIcon size={48} className="text-white/5 mx-auto mb-4" />
                  <p className="text-white/20 uppercase font-black tracking-[0.5em]">Archive is empty.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ALBUMS' && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {profile.photoAlbums?.map((album) => (
              <div key={album.id} className="group cursor-pointer">
                <div className="relative aspect-video rounded-[2rem] overflow-hidden mb-4 shadow-2xl border border-white/5 bg-white/5">
                  <div className="grid grid-cols-2 h-full">
                    {album.photoIds.slice(0, 4).map((pid, i) => (
                      <img 
                        key={pid} 
                        src={profile.photos?.find(p => p.id === pid)?.url || null} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    ))}
                    {album.photoIds.length === 0 && (
                      <div className="col-span-2 flex items-center justify-center text-white/10">
                        <ImageIcon size={48} />
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-sm gap-4">
                    <button className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-black hover:scale-110 transition-all">
                      <Play size={28} fill="black" />
                    </button>
                    <button className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all">
                      <Settings size={24} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-widest truncate mb-1">{album.title}</h4>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{album.photoIds.length} Captures</p>
                  </div>
                  <button className="p-2 text-white/20 hover:text-white">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            ))}
            
            <button 
              onClick={() => setIsCreateAlbumOpen(true)}
              className="aspect-video rounded-[2rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-4 text-white/20 hover:text-white hover:border-white/20 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-all">
                <Plus size={24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">New Album</span>
            </button>
          </div>
        )}

        {activeTab === 'IMPORT' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-10 bg-white/5 border border-white/10 rounded-[3rem] hover:bg-white/[0.08] transition-all group cursor-pointer">
              <div className="flex items-center justify-between mb-8">
                <div className="w-16 h-16 bg-[#4285F4] rounded-2xl flex items-center justify-center shadow-xl">
                  <Cloud size={32} className="text-white" />
                </div>
                <ExternalLink size={20} className="text-white/20 group-hover:text-white transition-all" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tightest mb-4">Google Photos</h3>
              <p className="text-sm font-medium text-white/40 italic leading-relaxed mb-8">
                Connect your Google account to instantly sync and import your entire library into the visual archive.
              </p>
              <button className="w-full py-4 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all">
                Connect Google Account
              </button>
            </div>

            <div className="p-10 bg-white/5 border border-white/10 rounded-[3rem] hover:bg-white/[0.08] transition-all group cursor-pointer">
              <div className="flex items-center justify-between mb-8">
                <div className="w-16 h-16 bg-[#0078D4] rounded-2xl flex items-center justify-center shadow-xl">
                  <Cloud size={32} className="text-white" />
                </div>
                <ExternalLink size={20} className="text-white/20 group-hover:text-white transition-all" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tightest mb-4">Microsoft OneDrive</h3>
              <p className="text-sm font-medium text-white/40 italic leading-relaxed mb-8">
                Access your OneDrive folders and select specific photo collections to bring into your artist profile.
              </p>
              <button className="w-full py-4 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all">
                Connect Microsoft Account
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Album Modal */}
      <AnimatePresence>
        {isCreateAlbumOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-theme-card border border-white/10 rounded-[3rem] p-10 shadow-3xl relative"
            >
              <button 
                onClick={() => setIsCreateAlbumOpen(false)}
                className="absolute top-8 right-8 text-white/20 hover:text-white transition-all"
              >
                <X size={24} />
              </button>
              <h3 className="text-2xl font-black uppercase tracking-tightest mb-6">Create Photo Album</h3>
              <input 
                type="text"
                placeholder="Album Title"
                value={newAlbumTitle}
                onChange={(e) => setNewAlbumTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white mb-8 outline-none focus:border-small-orange transition-all font-bold"
              />
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsCreateAlbumOpen(false)}
                  className="flex-1 py-4 bg-white/5 text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateAlbum}
                  className="flex-1 py-4 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:scale-105 transition-all"
                >
                  Create Album
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PhotoManager;
