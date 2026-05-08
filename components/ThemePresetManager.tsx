import React, { useState, useEffect } from 'react';
import { Plus, Settings, Trash2, Layout, Video, Image as ImageIcon, Sparkles, Upload, Loader2, Link } from 'lucide-react';
import { ProfileThemePreset, UserProfile } from '../types';
import { fetchThemePresets, fetchUserThemePresets, createThemePreset, updateThemePreset, deleteThemePreset, updateUserProfile } from '../services/backendService';

// We assume there's a Firebase storage uploader helper or we can just use a fake simulated upload for now 
// since we just need it visually working before hooking it up firmly
import { uploadFile } from '../services/backendService';

interface ThemePresetManagerProps {
  currentUser: UserProfile;
  isAdmin?: boolean;
}

export const ThemePresetManager: React.FC<ThemePresetManagerProps> = ({ currentUser, isAdmin }) => {
  const [presets, setPresets] = useState<ProfileThemePreset[]>([]);
  const [showCreator, setShowCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(currentUser.activeThemePresetId || null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  
  // Create state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'PHOTO_ONLY' | 'VIDEO_ONLY' | 'MIX'>('MIX');
  const [isPublic, setIsPublic] = useState(false);
  const [assets, setAssets] = useState<{ id: string; url: string; type: 'PHOTO' | 'VIDEO' }[]>([]);
  const [coverImage, setCoverImage] = useState('');
  const [uploadingInfo, setUploadingInfo] = useState<{ total: number; current: number } | null>(null);

  useEffect(() => {
    loadPresets();
  }, [currentUser.uid, isAdmin]);

  const loadPresets = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const all = await fetchThemePresets();
        setPresets(all);
      } else {
        const userPresets = await fetchUserThemePresets(currentUser.uid);
        setPresets(userPresets);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title) return;
    try {
      if (editingPresetId) {
        await updateThemePreset(editingPresetId, {
          title,
          description,
          mode,
          isPublic,
          assets,
          coverImage,
        });
      } else {
        await createThemePreset({
          creatorId: currentUser.uid,
          title,
          description,
          mode,
          isPublic,
          assets,
          coverImage,
        });
      }
      setShowCreator(false);
      resetForm();
      loadPresets();
    } catch (e) {
      console.error(e);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setMode('MIX');
    setIsPublic(false);
    setAssets([]);
    setCoverImage('');
    setEditingPresetId(null);
  };

  const handleEdit = (preset: ProfileThemePreset) => {
    setTitle(preset.title);
    setDescription(preset.description);
    setMode(preset.mode);
    setIsPublic(preset.isPublic);
    setAssets(preset.assets || []);
    setCoverImage(preset.coverImage || '');
    setEditingPresetId(preset.id);
    setShowCreator(true);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Limits: 20 pictures, 200 videos (we'll just loosely enforce total limits here to prevent crashes, but realistically check sizes)
    const allowedFiles = Array.from(files).slice(0, 220); // 20 pics + 200 vids
    setUploadingInfo({ total: allowedFiles.length, current: 0 });

    const newAssets: { id: string; url: string; type: 'PHOTO' | 'VIDEO' }[] = [];
    
    for (let i = 0; i < allowedFiles.length; i++) {
        const file = allowedFiles[i];
        const isVideo = file.type.startsWith('video/');
        const isPhoto = file.type.startsWith('image/');
        
        if (!isVideo && !isPhoto) continue;
        
        try {
            // Simulated or real upload
            const url = await uploadFile(`themes/${currentUser.uid}/${Date.now()}_${file.name}`, file);
            newAssets.push({
                id: Date.now().toString() + i,
                url,
                type: isVideo ? 'VIDEO' : 'PHOTO'
            });
            setUploadingInfo({ total: allowedFiles.length, current: i + 1 });
        } catch (err) {
            console.error('Failed to upload', file.name, err);
        }
    }

    setAssets(prev => [...prev, ...newAssets]);
    setUploadingInfo(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this theme preset?')) {
        await deleteThemePreset(id);
        loadPresets();
    }
  };

  const handleActivateTheme = async (preset: ProfileThemePreset) => {
    if (isAdmin) {
      try {
        await updateThemePreset(preset.id, { isPublic: true });
        loadPresets();
      } catch (e) {
        console.error('Failed to publish theme', e);
        alert('Failed to publish theme.');
      }
      return;
    }

    const videoAsset = preset.assets?.find(a => a.type === 'VIDEO');
    const photoAsset = preset.assets?.find(a => a.type === 'PHOTO');

    const vUrl = videoAsset ? videoAsset.url : null;
    const fUrl = photoAsset ? photoAsset.url : (preset.coverImage || null);

    try {
        await updateUserProfile(currentUser.uid, {
            videoBackgroundUrl: vUrl || null,
            frostedBackground: fUrl || null,
            videoBackgroundBlur: true,
            videoBackgroundFrosted: true,
            activeThemePresetId: preset.id
        });
        setActiveThemeId(preset.id);
    } catch (e) {
        console.error('Failed to activate theme', e);
        alert('Failed to activate theme.');
    }
  };

  return (
    <div className="space-y-12 w-full h-full text-white">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic">Theme Presets</h2>
          <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">{isAdmin ? 'Manage Global Themes' : 'Manage Profile Aesthetic Templates'}</p>
        </div>
        <button 
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
        >
          <Plus size={16} /> New Preset
        </button>
      </header>

      {showCreator && (
         <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <input type="text" placeholder="Preset Title" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 placeholder:opacity-40" />
              <select value={mode} onChange={e => setMode(e.target.value as any)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm">
                <option value="MIX">Photos & Videos (Mix)</option>
                <option value="PHOTO_ONLY">Photos Only</option>
                <option value="VIDEO_ONLY">Videos Only</option>
              </select>
           </div>
           
           <textarea placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 placeholder:opacity-40 h-24" />
           
           <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="rounded" />
                Make Public
              </label>

              <div className="border border-white/10 rounded-xl p-6 bg-black/30 mt-4">
                 <h4 className="text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                     <Upload size={16}/> Upload Theme Assets
                 </h4>
                 <p className="text-xs text-white/50 mb-6">Select up to 20 pictures and 200 video files to include in this theme.</p>
                 
                 {uploadingInfo ? (
                     <div className="flex items-center gap-4 text-sm font-bold text-small-orange">
                         <Loader2 className="animate-spin" size={20} />
                         Uploading {uploadingInfo.current} / {uploadingInfo.total} assets...
                     </div>
                 ) : (
                     <label className="px-6 py-3 bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all cursor-pointer inline-flex items-center gap-2 cursor-pointer">
                        <Upload size={14} /> Select Files
                        <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleBulkUpload} />
                     </label>
                 )}

                 {assets.length > 0 && (
                     <div className="mt-6">
                         <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{assets.length} Assets Attached</p>
                         <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                             {assets.map(asset => (
                                 <div key={asset.id} className="w-16 h-16 shrink-0 rounded-lg bg-black/50 border border-white/10 relative overflow-hidden group">
                                     {asset.type === 'PHOTO' ? (
                                         <img src={asset.url} className="w-full h-full object-cover" alt="" />
                                     ) : (
                                         <video src={asset.url} className="w-full h-full object-cover" />
                                     )}
                                     <button onClick={() => setAssets(assets.filter(a => a.id !== asset.id))} className="absolute inset-0 bg-red-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                         <Trash2 size={14} />
                                     </button>
                                 </div>
                             ))}
                         </div>
                     </div>
                 )}
              </div>
           </div>

           <div className="flex items-center gap-4 pt-6 border-t border-white/5">
             <button onClick={handleSave} disabled={!!uploadingInfo} className="px-6 py-3 bg-white text-black rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50">
                Save Preset
             </button>
             <button onClick={() => { setShowCreator(false); resetForm(); }} className="px-6 py-3 bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                Cancel
             </button>
           </div>
         </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center"><div className="w-8 h-8 rounded-full border-2 border-t-white border-white/20 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {presets.map(preset => (
            <div key={preset.id} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group relative">
              <div className="aspect-video relative bg-black/50">
                {preset.coverImage ? (
                  <img src={preset.coverImage} className="w-full h-full object-cover" alt="" />
                ) : preset.assets && preset.assets.length > 0 ? (
                  preset.assets[0].type === 'PHOTO' ? <img src={preset.assets[0].url} className="w-full h-full object-cover" alt="" /> : <video src={preset.assets[0].url} className="w-full h-full object-cover" muted />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/20">
                    <Layout size={48} />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black to-transparent">
                  <div className="flex items-center gap-2">
                    {preset.mode === 'PHOTO_ONLY' ? <ImageIcon size={14} className="text-small-orange" /> : 
                     preset.mode === 'VIDEO_ONLY' ? <Video size={14} className="text-small-orange" /> : 
                     <Sparkles size={14} className="text-small-orange" />}
                    <span className="text-[8px] font-black uppercase tracking-widest">{preset.mode}</span>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-bold text-lg mb-1 truncate">{preset.title}</h3>
                <p className="text-xs opacity-50 line-clamp-2">{preset.description}</p>
                
                <div className="mt-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest opacity-40">
                  <span>{preset.assets?.length || 0} Assets</span>
                  <span>{preset.isPublic ? 'Public' : 'Private'}</span>
                </div>
                
                <div className="mt-6">
                   {isAdmin ? (
                      <button
                        onClick={() => handleActivateTheme(preset)}
                        className={`w-full px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${preset.isPublic ? 'bg-green-500/20 text-green-400 cursor-default' : 'bg-white/10 hover:bg-white text-white hover:text-black'}`}
                        disabled={preset.isPublic}
                      >
                        {preset.isPublic ? 'Published' : 'Publish to Library'}
                      </button>
                   ) : activeThemeId === preset.id ? (
                      <button
                         className="w-full px-4 py-2 bg-green-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Active
                      </button>
                   ) : (
                      <button
                         onClick={() => handleActivateTheme(preset)}
                         className="w-full px-4 py-2 bg-white/10 hover:bg-white text-white hover:text-black rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Activate
                      </button>
                   )}
                </div>
              </div>

              {(isAdmin || preset.creatorId === currentUser.uid) && (
                <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    className="p-2 bg-black/50 backdrop-blur-md rounded-full text-white/50 hover:text-white hover:bg-black transition-all"
                    onClick={() => handleEdit(preset)}
                  >
                    <Settings size={16} />
                  </button>
                  <button 
                    className="p-2 bg-black/50 backdrop-blur-md rounded-full text-white/50 hover:text-red-500 hover:bg-black transition-all"
                    onClick={() => handleDelete(preset.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {presets.length === 0 && !showCreator && (
             <div className="col-span-full py-20 text-center opacity-30 text-sm font-black uppercase tracking-[0.3em]">
                No Theme Presets Found
             </div>
          )}
        </div>
      )}
    </div>
  );
};
