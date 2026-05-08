import React, { useState } from 'react';
import { Upload, X, Loader2, Play, Music, Video as VideoIcon, GripVertical } from 'lucide-react';
import { uploadFile, db, auth } from '../services/backendService';
import { setDoc, doc } from 'firebase/firestore';
import { Track, Video, Playlist, VideoPlaylist } from '../types';

interface CuratedBuilderProps {
  type: 'MUSIC' | 'VIDEO';
  onCreated: (playlist: any) => void;
  onCancel: () => void;
}

const CuratedBuilder: React.FC<CuratedBuilderProps> = ({ type, onCreated, onCancel }) => {
  const [title, setTitle] = useState('');
  const [authorName, setAuthorName] = useState('Staff Picks');
  const [description, setDescription] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  
  const [items, setItems] = useState<{ id: string, title: string, file: File }[]>([]);
  
  const [isDraft, setIsDraft] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [status, setStatus] = useState('');

  const handlePublish = async () => {
    if (!title || items.length === 0) {
      alert("Title and at least one item are required.");
      return;
    }
    setIsDeploying(true);
    setStatus('Uploading artwork...');
    
    try {
      const id = `curated_${type}_${Date.now()}`;
      
      let coverImage = '';
      if (coverFile) {
        coverImage = await uploadFile(`curated/${id}/cover.png`, coverFile);
      }

      setStatus(`Uploading ${items.length} items...`);
      const tracks: Track[] = [];
      const videos: Video[] = [];
      const itemIds: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setStatus(`Uploading item ${i + 1} of ${items.length}...`);
        const itemUrl = await uploadFile(`curated/${id}/items/${item.id}_${item.file.name}`, item.file);
        
        if (type === 'MUSIC') {
          tracks.push({
            id: item.id,
            title: item.title,
            artist: authorName,
            url: itemUrl
          });
          itemIds.push(item.id);
        } else {
          videos.push({
            id: item.id,
            title: item.title,
            url: itemUrl,
            ownerId: auth.currentUser?.uid || 'admin',
            timestamp: Date.now()
          });
          itemIds.push(item.id);
        }
      }

      setStatus('Finalizing playlist...');
      
      if (type === 'MUSIC') {
        const playlist: Playlist = {
          id,
          ownerId: auth.currentUser?.uid || 'admin',
          title,
          description,
          authorName,
          coverImage,
          trackIds: itemIds,
          tracks,
          isDraft,
          timestamp: Date.now()
        };
        await setDoc(doc(db, 'playlists', id), playlist);
        onCreated(playlist);
      } else {
        const vPlaylist: VideoPlaylist = {
          id,
          ownerId: auth.currentUser?.uid || 'admin',
          title,
          description,
          thumbnailUrl: coverImage,
          videoIds: itemIds,
          videos,
          isDraft,
          isPublic: !isDraft,
          timestamp: Date.now()
        };
        await setDoc(doc(db, 'video_playlists', id), vPlaylist);
        onCreated(vPlaylist);
      }
    } catch (e: any) {
      console.error(e);
      alert("Failed to publish: " + e.message);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-white/10 p-8 rounded-[2rem] w-full max-w-4xl mx-auto shadow-2xl space-y-8 mt-[10vh] max-h-[80vh] overflow-y-auto outline-none">
      <div className="flex items-center justify-between sticky top-0 bg-zinc-900 z-10 pb-4 border-b border-white/10">
        <h2 className="text-2xl font-black uppercase tracking-widest">{type === 'MUSIC' ? 'Create Playlist' : 'Create Video Series'}</h2>
        <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full"><X size={24} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Cover Image</label>
            <div className="aspect-square bg-black/50 border border-white/10 rounded-3xl overflow-hidden relative group flex items-center justify-center cursor-pointer">
              {coverPreview ? (
                <img src={coverPreview} className="w-full h-full object-cover" />
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto text-white/20 mb-2" size={32} />
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Upload Cover</span>
                </div>
              )}
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
                if (e.target.files?.[0]) {
                  setCoverFile(e.target.files[0]);
                  setCoverPreview(URL.createObjectURL(e.target.files[0]));
                }
              }} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold placeholder:text-white/20" placeholder="Title..." />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Author / Curator</label>
            <input type="text" value={authorName} onChange={e => setAuthorName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold placeholder:text-white/20" placeholder="Staff Picks" />
          </div>
          
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold placeholder:text-white/20 h-24" placeholder="Description..." />
          </div>

        </div>

        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Upload Items</label>
            <div className="border border-dashed border-white/20 rounded-2xl p-8 hover:bg-white/5 transition-colors relative text-center min-h-[160px] flex flex-col items-center justify-center">
               <Upload className="mx-auto text-white/40 mb-4" size={32} />
               <p className="text-xs font-bold text-white/60 mb-2">Click or drag {type === 'MUSIC' ? 'audio' : 'video'} files to upload</p>
               <input 
                 type="file" 
                 multiple 
                 accept={type === 'MUSIC' ? 'audio/*' : 'video/*'} 
                 className="absolute inset-0 opacity-0 cursor-pointer"
                 onChange={(e) => {
                   if (e.target.files) {
                     const newItems = Array.from(e.target.files).map(f => ({
                       id: 'item_' + Date.now() + Math.random().toString(36).substr(2, 9),
                       title: f.name.replace(/\.[^/.]+$/, ""),
                       file: f
                     }));
                     setItems([...items, ...newItems]);
                   }
                 }}
               />
            </div>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
            {items.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5 relative group">
                <GripVertical size={16} className="text-white/20 hover:text-white cursor-move" />
                <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                  {type === 'MUSIC' ? <Music size={14} className="text-white/50" /> : <VideoIcon size={14} className="text-white/50" />}
                </div>
                <input 
                  type="text" 
                  value={item.title} 
                  onChange={(e) => {
                    const updated = [...items];
                    updated[index].title = e.target.value;
                    setItems(updated);
                  }}
                  className="bg-transparent border-none outline-none text-xs font-bold flex-1"
                />
                
                {/* Simple up/down for ordering */}
                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                     onClick={() => {
                        if (index === 0) return;
                        const newArray = [...items];
                        [newArray[index - 1], newArray[index]] = [newArray[index], newArray[index - 1]];
                        setItems(newArray);
                     }}
                     className="text-white/40 hover:text-white px-1 leading-none -mb-1"
                   >▲</button>
                   <button 
                     onClick={() => {
                        if (index === items.length - 1) return;
                        const newArray = [...items];
                        [newArray[index + 1], newArray[index]] = [newArray[index], newArray[index + 1]];
                        setItems(newArray);
                     }}
                     className="text-white/40 hover:text-white px-1 leading-none mt-1"
                   >▼</button>
                </div>
                <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-white/40 hover:text-red-500 ml-2">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 mt-6">
             <div>
               <h4 className="text-xs font-black uppercase tracking-widest text-white">Draft Mode</h4>
               <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Keep hidden until manually featured</p>
             </div>
             <button onClick={() => setIsDraft(!isDraft)} className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${!isDraft ? 'bg-green-500' : 'bg-white/10'}`}>
               <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${!isDraft ? 'left-7' : 'left-1'}`} />
             </button>
          </div>

        </div>
      </div>

      <div className="pt-6 border-t border-white/10 flex justify-end gap-4 sticky bottom-0 bg-zinc-900 pb-2">
        {isDeploying ? (
          <div className="flex items-center gap-3 text-small-orange">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-[9px] font-black uppercase tracking-widest">{status}</span>
          </div>
        ) : (
          <>
            <button onClick={onCancel} className="px-6 py-3 rounded-full text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Cancel</button>
            <button onClick={handlePublish} className="px-8 py-3 rounded-full text-[9px] font-black uppercase tracking-widest bg-white text-black hover:bg-gray-200 transition-colors">
              {isDraft ? 'Save Draft' : 'Publish to Platform'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CuratedBuilder;
