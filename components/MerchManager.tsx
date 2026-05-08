import React, { useState } from 'react';
import { Plus, Trash2, ShoppingBag, Tag, DollarSign, Package, Image as ImageIcon, X } from 'lucide-react';
import { MerchItem } from '../types';
import { addMerchItem, auth } from '../services/backendService';

interface MerchManagerProps {
  artistId: string;
  initialMerch: MerchItem[];
  onUpdate: (merch: MerchItem[]) => void;
}

const MerchManager: React.FC<MerchManagerProps> = ({ artistId, initialMerch, onUpdate }) => {
  const [merch, setMerch] = useState<MerchItem[]>(initialMerch);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  const [newItem, setNewItem] = useState<Omit<MerchItem, 'id'>>({
    ownerId: artistId,
    title: '',
    description: '',
    price: 0,
    imageUrl: 'https://picsum.photos/seed/merch/800/800',
    category: 'APPAREL',
    stock: 100,
    timestamp: Date.now()
  });

  const handleAdd = async () => {
    if (!newItem.title || !newItem.price) return;
    setLoading(true);
    try {
      const id = await addMerchItem(newItem);
      const addedItem = { ...newItem, id };
      const updatedMerch = [...merch, addedItem];
      setMerch(updatedMerch);
      onUpdate(updatedMerch);
      setIsAdding(false);
      setNewItem({
        ownerId: artistId,
        title: '',
        description: '',
        price: 0,
        imageUrl: 'https://picsum.photos/seed/merch/800/800',
        category: 'APPAREL',
        stock: 100,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("Failed to add merch:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-small-orange/10 rounded-2xl">
            <ShoppingBag size={20} className="text-small-orange" />
          </div>
          <h3 className="text-xl font-black uppercase tracking-tightest">Inventory Management</h3>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="px-6 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
        >
          <Plus size={14} /> Add Item
        </button>
      </div>

      {isAdding && (
        <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[2.5rem] animate-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between mb-8">
            <h4 className="text-sm font-black uppercase tracking-widest text-small-orange">New Merchandise Entry</h4>
            <button onClick={() => setIsAdding(false)} className="text-white/20 hover:text-white"><X size={20} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Item Title</label>
                <input 
                  type="text" 
                  value={newItem.title} 
                  onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  placeholder="e.g. Limited Edition Vinyl"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-small-orange/50 transition-all"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Description</label>
                <textarea 
                  value={newItem.description} 
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder="Tell the story of this item..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-medium outline-none focus:border-small-orange/50 transition-all h-24 resize-none"
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Price ($)</label>
                  <input 
                    type="number" 
                    value={newItem.price} 
                    onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-small-orange/50 transition-all"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Stock</label>
                  <input 
                    type="number" 
                    value={newItem.stock} 
                    onChange={(e) => setNewItem({ ...newItem, stock: parseInt(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-small-orange/50 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Category</label>
                <select 
                  value={newItem.category} 
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value as any })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-small-orange/50 transition-all appearance-none"
                >
                  <option value="APPAREL">Apparel</option>
                  <option value="MUSIC">Music</option>
                  <option value="ACCESSORY">Accessories</option>
                  <option value="DIGITAL">Digital</option>
                </select>
              </div>
            </div>
          </div>

          <button 
            onClick={handleAdd}
            disabled={loading || !newItem.title || !newItem.price}
            className="w-full py-5 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-2xl disabled:opacity-50"
          >
            {loading ? 'Synchronizing...' : 'Add to Storefront'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {merch.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-6 bg-white/[0.03] border border-white/5 rounded-[2rem] group hover:bg-white/[0.06] transition-all">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10">
                <img src={item.imageUrl || null} alt={item.title} className="w-full h-full object-cover" />
              </div>
              <div>
                <h5 className="text-sm font-black uppercase tracking-widest text-white mb-1">{item.title}</h5>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-small-orange uppercase tracking-widest">${item.price}</span>
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{item.stock} in stock</span>
                </div>
              </div>
            </div>
            <button className="p-4 text-white/10 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all opacity-0 group-hover:opacity-100">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MerchManager;
