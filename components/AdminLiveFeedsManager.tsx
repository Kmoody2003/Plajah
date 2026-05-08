import React, { useState, useEffect } from 'react';
import { Radio, Plus, Trash2, Edit2 } from 'lucide-react';
import { LiveFeed } from '../types';
import { fetchAllLiveFeeds, publishLiveFeed, updateLiveFeed, deleteLiveFeed } from '../services/backendService';

export const AdminLiveFeedsManager: React.FC = () => {
  const [feeds, setFeeds] = useState<LiveFeed[]>([]);
  const [showCreator, setShowCreator] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [ownerName, setOwnerName] = useState('Plajah TV');
  const [isSanctuary, setIsSanctuary] = useState(false);

  useEffect(() => {
    const unsub = fetchAllLiveFeeds((data) => {
      setFeeds(data);
    });
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!title || !url) return;
    try {
      if (editingId) {
        await updateLiveFeed(editingId, {
          title,
          url,
          ownerName,
          sanctuaryOnly: isSanctuary,
          tags: tags.split(',').map(s => s.trim()).filter(Boolean)
        });
      } else {
        await publishLiveFeed({
          title,
          url,
          ownerId: 'system',
          ownerName,
          status: 'LIVE',
          isPublic: true,
          sanctuaryOnly: isSanctuary,
          tags: tags.split(',').map(s => s.trim()).filter(Boolean)
        });
      }
      setShowCreator(false);
      resetForm();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEdit = (feed: LiveFeed) => {
    setEditingId(feed.id);
    setTitle(feed.title);
    setUrl(feed.url);
    setTags(feed.tags?.join(', ') || '');
    setOwnerName(feed.ownerName || 'Plajah TV');
    setIsSanctuary(feed.sanctuaryOnly || false);
    setShowCreator(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setUrl('');
    setTags('');
    setOwnerName('Plajah TV');
    setIsSanctuary(false);
  };

  return (
    <div className="space-y-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Live Feeds</h1>
          <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">Manage global live streams embedded across the platform</p>
        </div>
        <button 
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-2 px-8 py-4 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
        >
          <Plus size={16} /> Add Feed
        </button>
      </header>

      {showCreator && (
         <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <input type="text" placeholder="Stream Title" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 placeholder:opacity-40" />
              <input type="text" placeholder="Embed URL (e.g. YouTube embed link)" value={url} onChange={e => setUrl(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 placeholder:opacity-40" />
              <input type="text" placeholder="Channel/Network Name" value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 placeholder:opacity-40" />
              <input type="text" placeholder="Tags (comma separated) e.g. news, sports" value={tags} onChange={e => setTags(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 placeholder:opacity-40" />
           </div>
           
           <div className="flex items-center gap-4">
             <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                <input type="checkbox" checked={isSanctuary} onChange={e => setIsSanctuary(e.target.checked)} className="rounded" />
                Sanctuary Only
             </label>
           </div>

           <div className="flex items-center gap-4 pt-6 border-t border-white/5">
             <button onClick={handleSave} className="px-6 py-3 bg-white text-black rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                {editingId ? 'Save Changes' : 'Publish Feed'}
             </button>
             <button onClick={() => { setShowCreator(false); resetForm(); }} className="px-6 py-3 bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                Cancel
             </button>
           </div>
         </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {feeds.map(feed => (
          <div key={feed.id} className="bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden group">
            <div className="aspect-video relative">
              <iframe 
                src={`${feed.url}?autoplay=0&controls=1&modestbranding=1`}
                className="w-full h-full object-cover"
                allowFullScreen
              />
            </div>
            <div className="p-6">
              <h3 className="font-bold text-lg mb-1">{feed.title}</h3>
              <p className="text-xs text-small-orange mb-4 font-bold">{feed.ownerName}</p>
              
              {feed.tags && feed.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {feed.tags.map(t => (
                    <span key={t} className="px-2 py-1 bg-white/10 rounded text-[10px] font-black uppercase tracking-widest text-white/50">{t}</span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-4">
                <button 
                  onClick={() => handleEdit(feed)}
                  className="flex-1 py-2 bg-white/10 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
                >
                  <Edit2 size={14} /> Edit
                </button>
                {deletingId === feed.id ? (
                  <div className="flex-1 flex gap-2">
                    <button 
                      onClick={async () => {
                        await deleteLiveFeed(feed.id);
                        setDeletingId(null);
                      }}
                      className="flex-1 py-2 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                    >
                      Confirm
                    </button>
                    <button 
                      onClick={() => setDeletingId(null)}
                      className="flex-1 py-2 bg-white/10 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDeletingId(feed.id)}
                    className="flex-1 py-2 bg-red-600/10 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-600 hover:text-white transition-all"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
