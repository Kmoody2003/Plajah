import React, { useState, useEffect } from 'react';
import { ShoppingBag, Tag, Package, ExternalLink } from 'lucide-react';
import { MerchItem, UserProfile } from '../types';
import { motion } from 'motion/react';
import { fetchMerchItems } from '../services/backendService';

interface MerchStoreProps {
  sellerId?: string;
  worldId?: string;
  user?: UserProfile | null;
  merch?: MerchItem[]; // Optional explicit merch list
}

const MerchStore: React.FC<MerchStoreProps> = ({ sellerId, worldId, user, merch: explicitMerch }) => {
  const [items, setItems] = useState<MerchItem[]>([]);
  const [loading, setLoading] = useState(!explicitMerch);

  useEffect(() => {
    if (explicitMerch) {
      setItems(explicitMerch);
      setLoading(false);
      return;
    }

    const loadItems = async () => {
      setLoading(true);
      try {
        const allItems = await fetchMerchItems();
        let filtered = allItems;
        if (sellerId) filtered = filtered.filter(i => i.ownerId === sellerId);
        if (worldId) filtered = filtered.filter(i => i.worldId === worldId);
        setItems(filtered);
      } catch (error) {
        console.error("Failed to load merch:", error);
      } finally {
        setLoading(false);
      }
    };
    loadItems();
  }, [sellerId, worldId, explicitMerch]);

  if (loading) {
    return <div className="py-20 text-center text-white/50 animate-pulse">Loading Store...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center bg-white/[0.02] border border-white/5 rounded-[3rem]">
        <ShoppingBag size={48} className="mx-auto mb-6 text-white/10" />
        <p className="text-white/20 uppercase font-black tracking-[0.5em]">No merch available yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {items.map((item) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="group relative bg-white/[0.03] border border-white/5 rounded-[3rem] overflow-hidden hover:bg-white/[0.06] transition-all"
        >
          <div className="aspect-square overflow-hidden relative">
            <img 
              src={item.imageUrl} 
              alt={item.title} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-6 right-6">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                <span className="text-xs font-black text-small-orange">${item.price}</span>
              </div>
            </div>
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
              <button className="px-8 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-3 scale-90 group-hover:scale-100 transition-all">
                <ShoppingBag size={16} />
                Buy Now
              </button>
            </div>
          </div>
          
          <div className="p-8">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={10} className="text-small-orange" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{item.category}</span>
            </div>
            <h3 className="text-lg font-black uppercase tracking-tight mb-2 group-hover:text-small-orange transition-colors">
              {item.title}
            </h3>
            <p className="text-xs text-white/40 leading-relaxed line-clamp-2">
              {item.description}
            </p>
            
            {item.stock !== undefined && item.stock < 10 && (
              <div className="mt-4 flex items-center gap-2">
                <Package size={12} className="text-red-500" />
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Only {item.stock} left!</span>
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default MerchStore;
