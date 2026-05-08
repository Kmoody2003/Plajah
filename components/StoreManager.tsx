import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Save, X, Image as ImageIcon, Video as VideoIcon, 
  Tag, Package, DollarSign, ExternalLink, Globe, Layout, Sparkles,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, ShoppingBag,
  Database, Music
} from 'lucide-react';
import { MerchItem, StoreSettings, UserProfile } from '../types';
import { 
  addMerchItem, updateMerchItem, deleteMerchItem, 
  updateStoreSettings, createDemoStoreContent, fetchArtistMerch,
  fetchArtistAlbums, fetchArtistVideos
} from '../services/backendService';
import { motion, AnimatePresence } from 'motion/react';
import { Album, Video, Track } from '../types';

interface StoreManagerProps {
  artistId: string;
  initialMerch: MerchItem[];
  settings?: StoreSettings;
  onUpdate: (merch: MerchItem[]) => void;
  onSettingsUpdate: (settings: StoreSettings) => void;
}

const StoreManager: React.FC<StoreManagerProps> = ({ artistId, initialMerch, settings, onUpdate, onSettingsUpdate }) => {
  const [merch, setMerch] = useState<MerchItem[]>(initialMerch);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [localSettings, setLocalSettings] = useState<StoreSettings>(settings || {
    isEnabled: true,
    useExternalStore: false,
    externalStoreUrl: '',
    showDemoContent: true
  });

  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [newItem, setNewItem] = useState<Omit<MerchItem, 'id' | 'timestamp' | 'rating' | 'reviewCount'>>({
    ownerId: artistId,
    title: '',
    description: '',
    price: 0,
    salePrice: undefined,
    imageUrl: '',
    videoUrl: '',
    category: 'APPAREL',
    stock: 0,
    isDigitalAsset: false
  });

  useEffect(() => {
    setMerch(initialMerch);
    loadUserAssets();
  }, [initialMerch]);

  const loadUserAssets = async () => {
    const albums = await fetchArtistAlbums(artistId);
    const videos = await fetchArtistVideos(artistId);
    setUserAlbums(albums);
    setUserVideos(videos);
  };

  const importAsset = (asset: Track | Video, type: 'TRACK' | 'VIDEO') => {
    setNewItem({
      ownerId: artistId,
      title: asset.title,
      description: (asset as any).description || `Digital ${type.toLowerCase()} asset.`,
      price: (asset as any).price || 0,
      imageUrl: (asset as any).thumbnailUrl || (asset as any).coverImage || '',
      videoUrl: type === 'VIDEO' ? (asset as any).url : '',
      category: 'MEDIA',
      stock: 9999,
      isDigitalAsset: true,
      linkedAssetId: asset.id
    });
    setIsAdding(true);
    setIsImporting(false);
  };

  const handleSaveSettings = async () => {
    await updateStoreSettings(localSettings);
    onSettingsUpdate(localSettings);
  };

  const handleAddItem = async () => {
    const id = await addMerchItem(newItem);
    if (id) {
      const updatedMerch = await fetchArtistMerch(artistId);
      setMerch(updatedMerch);
      onUpdate(updatedMerch);
      setIsAdding(false);
      setNewItem({
        ownerId: artistId,
        title: '',
        description: '',
        price: 0,
        salePrice: undefined,
        imageUrl: '',
        videoUrl: '',
        category: 'APPAREL',
        stock: 0,
        isDigitalAsset: false
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      await deleteMerchItem(id);
      const updatedMerch = merch.filter(m => m.id !== id);
      setMerch(updatedMerch);
      onUpdate(updatedMerch);
    }
  };

  const handleGenerateDemo = async () => {
    setIsGeneratingDemo(true);
    try {
      await createDemoStoreContent(artistId);
      const updatedMerch = await fetchArtistMerch(artistId);
      setMerch(updatedMerch);
      onUpdate(updatedMerch);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Store Configuration */}
      <section className="bg-white/[0.02] border border-white/5 rounded-[3rem] p-10">
        <div className="flex items-center gap-4 mb-10">
          <div className="p-4 bg-small-orange/20 rounded-2xl">
            <Globe className="text-small-orange" size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tightest">Store Configuration</h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Control how your store appears to fans</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/5">
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-1">Store Enabled</p>
                <p className="text-[10px] text-white/40 font-bold uppercase">Toggle public visibility</p>
              </div>
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, isEnabled: !prev.isEnabled }))}
                className={`w-14 h-8 rounded-full transition-all relative ${localSettings.isEnabled ? 'bg-small-orange' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${localSettings.isEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/5">
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-1">External Store</p>
                <p className="text-[10px] text-white/40 font-bold uppercase">Link to your own website</p>
              </div>
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, useExternalStore: !prev.useExternalStore }))}
                className={`w-14 h-8 rounded-full transition-all relative ${localSettings.useExternalStore ? 'bg-small-orange' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${localSettings.useExternalStore ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {localSettings.useExternalStore && (
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Store URL</label>
                <input 
                  type="url"
                  value={localSettings.externalStoreUrl}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, externalStoreUrl: e.target.value }))}
                  placeholder="https://your-store.com"
                  className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all"
                />
              </div>
            )}
            <button 
              onClick={handleSaveSettings}
              className="w-full py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-xl"
            >
              Save Settings
            </button>
          </div>
        </div>
      </section>

      {/* Merch Management */}
      {!localSettings.useExternalStore && (
        <section className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-small-orange/20 rounded-2xl">
                <Package className="text-small-orange" size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tightest">Product Inventory</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Manage your physical and digital goods</p>
              </div>
            </div>
            <div className="flex gap-4">
              {merch.length === 0 && (
                <button 
                  onClick={handleGenerateDemo}
                  disabled={isGeneratingDemo}
                  className="flex items-center gap-3 px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  <Sparkles size={16} className={isGeneratingDemo ? 'animate-spin' : ''} />
                  {isGeneratingDemo ? 'Generating...' : 'Load Demo Content'}
                </button>
              )}
              <button 
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-3 px-8 py-4 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-xl"
              >
                <Plus size={16} />
                Add New Product
              </button>
            </div>
          </div>

          {/* Asset Import Section */}
          <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Database size={18} className="text-small-orange" />
                <h4 className="text-sm font-black uppercase tracking-widest">Import from Library</h4>
              </div>
              <button 
                onClick={() => setIsImporting(!isImporting)}
                className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
              >
                {isImporting ? 'Hide Library' : 'Show Library'}
              </button>
            </div>

            <AnimatePresence>
              {isImporting && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                    {userVideos.map(video => (
                      <button 
                        key={video.id}
                        onClick={() => importAsset(video, 'VIDEO')}
                        className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all text-left group"
                      >
                        <div className="w-12 h-12 rounded-lg bg-black overflow-hidden flex-shrink-0">
                          <img src={video.thumbnailUrl || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase truncate">{video.title}</p>
                          <p className="text-[8px] text-white/20 font-bold uppercase">Video Asset</p>
                        </div>
                        <Plus size={14} className="text-white/20 group-hover:text-small-orange transition-colors" />
                      </button>
                    ))}
                    {userAlbums.flatMap(a => a.tracks).map(track => (
                      <button 
                        key={track.id}
                        onClick={() => importAsset(track, 'TRACK')}
                        className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all text-left group"
                      >
                        <div className="w-12 h-12 rounded-lg bg-black overflow-hidden flex-shrink-0 flex items-center justify-center">
                          <Music size={20} className="text-white/20" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase truncate">{track.title}</p>
                          <p className="text-[8px] text-white/20 font-bold uppercase">Audio Asset</p>
                        </div>
                        <Plus size={14} className="text-white/20 group-hover:text-small-orange transition-colors" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {isAdding && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-10 space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Product Title</label>
                      <input 
                        value={newItem.title}
                        onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="e.g., Limited Edition Hoodie"
                        className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all"
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Description</label>
                      <textarea 
                        value={newItem.description}
                        onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Tell fans about this product..."
                        className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all min-h-[120px]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Price ($)</label>
                        <input 
                          type="number"
                          value={newItem.price}
                          onChange={(e) => setNewItem(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                          className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all"
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Sale Price ($)</label>
                        <input 
                          type="number"
                          value={newItem.salePrice || ''}
                          onChange={(e) => setNewItem(prev => ({ ...prev, salePrice: e.target.value ? parseFloat(e.target.value) : undefined }))}
                          placeholder="Optional"
                          className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Image URL</label>
                      <div className="flex gap-4">
                        <input 
                          value={newItem.imageUrl}
                          onChange={(e) => setNewItem(prev => ({ ...prev, imageUrl: e.target.value }))}
                          placeholder="https://..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all"
                        />
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 overflow-hidden">
                          {newItem.imageUrl ? (
                            <img src={newItem.imageUrl || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <ImageIcon className="text-white/20" size={24} />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Video URL (Optional)</label>
                      <input 
                        value={newItem.videoUrl}
                        onChange={(e) => setNewItem(prev => ({ ...prev, videoUrl: e.target.value }))}
                        placeholder="https://..."
                        className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Category</label>
                        <select 
                          value={newItem.category}
                          onChange={(e) => setNewItem(prev => ({ ...prev, category: e.target.value as any }))}
                          className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all appearance-none"
                        >
                          <option value="APPAREL">Apparel</option>
                          <option value="MUSIC">Music</option>
                          <option value="ACCESSORY">Accessory</option>
                          <option value="DIGITAL">Digital</option>
                          <option value="COLLECTIBLES">Collectibles</option>
                          <option value="MEDIA">Media Asset</option>
                        </select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Stock</label>
                        <input 
                          type="number"
                          value={newItem.stock}
                          onChange={(e) => setNewItem(prev => ({ ...prev, stock: parseInt(e.target.value) }))}
                          className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-6 border-t border-white/5">
                  <button 
                    onClick={handleAddItem}
                    className="flex-1 py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-xl"
                  >
                    Create Product
                  </button>
                  <button 
                    onClick={() => setIsAdding(false)}
                    className="px-12 py-5 bg-white/5 hover:bg-white/10 text-white rounded-full font-black text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 gap-6">
            {merch.map((item) => (
              <div key={item.id} className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-6 flex flex-col md:flex-row items-center gap-8 group hover:bg-white/[0.04] transition-all">
                <div className="w-32 h-32 rounded-3xl overflow-hidden border border-white/10 bg-black flex-shrink-0">
                  <img src={item.imageUrl || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-xl font-black uppercase tracking-tightest truncate">{item.title}</h4>
                    <span className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black text-white/40 uppercase tracking-widest border border-white/5">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-white/40 text-xs line-clamp-1 font-medium mb-4">{item.description}</p>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-small-orange" />
                      <span className="text-sm font-black">${item.salePrice || item.price}</span>
                      {item.salePrice && <span className="text-xs text-white/20 line-through">${item.price}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Package size={14} className="text-white/20" />
                      <span className="text-xs font-bold text-white/40">{item.stock} in stock</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all">
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="p-4 bg-white/5 hover:bg-red-500/10 rounded-2xl text-white/40 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default StoreManager;
