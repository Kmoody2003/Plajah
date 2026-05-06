import React, { useState, useEffect } from 'react';
import { ShoppingBag, Search, Filter, ArrowRight, Tag, Star, Truck, ShieldCheck, X, ShoppingCart, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MerchItem } from '../types';
import { fetchMerchItems } from '../services/backendService';

interface MerchStorefrontProps {
  onClose?: () => void;
}

const MerchStorefront: React.FC<MerchStorefrontProps> = ({ onClose }) => {
  const [items, setItems] = useState<MerchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<{ item: MerchItem; quantity: number }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    const loadItems = async () => {
      const fetched = await fetchMerchItems();
      setItems(fetched);
      setLoading(false);
    };
    loadItems();
  }, []);

  const categories = ['All', 'Apparel', 'Music', 'Accessories', 'Digital', 'Collectibles'];
  
  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (item: MerchItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.item.id === item.id);
      if (existing) {
        return prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { item, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.item.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.item.id === itemId) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const cartTotal = cart.reduce((sum, i) => sum + (i.item.price * i.quantity), 0);

  return (
    <div className="min-h-screen bg-theme text-white flex">
      {/* Main Storefront */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-16">
            <div>
              <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Global <span className="text-small-orange">Store</span></h1>
              <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Official merchandise from your favorite artists and brands.</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                <input 
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm font-bold outline-none focus:border-small-orange transition-all w-64 lg:w-96"
                />
              </div>
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative p-4 bg-white text-black rounded-2xl hover:scale-105 transition-all shadow-2xl"
              >
                <ShoppingBag size={24} />
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-small-orange text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-theme">
                    {cart.reduce((sum, i) => sum + i.quantity, 0)}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Categories */}
          <div className="flex items-center gap-4 mb-12 overflow-x-auto pb-4 no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  selectedCategory === cat ? 'bg-small-orange text-white shadow-xl' : 'bg-white/5 text-white/40 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="w-12 h-12 border-4 border-small-orange border-t-transparent rounded-full animate-spin mb-6" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Loading Storefront...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredItems.map(item => (
                <motion.div 
                  layout
                  key={item.id}
                  className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden group hover:border-white/20 transition-all"
                >
                  <div className="aspect-square relative overflow-hidden">
                    <img 
                      src={item.imageUrl || `https://picsum.photos/seed/${item.id}/800/800`} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      alt={item.title}
                    />
                    <div className="absolute top-4 right-4">
                      <button className="p-3 bg-black/50 backdrop-blur-xl rounded-full text-white/40 hover:text-white transition-all">
                        <Star size={16} />
                      </button>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <button 
                      onClick={() => addToCart(item)}
                      className="absolute bottom-6 left-6 right-6 py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest translate-y-12 group-hover:translate-y-0 transition-all shadow-2xl"
                    >
                      Add to Cart
                    </button>
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-black uppercase tracking-tight line-clamp-1">{item.title}</h3>
                      <span className="text-xl font-display font-black tracking-tightest text-small-orange">${item.price}</span>
                    </div>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4 line-clamp-2">{item.description}</p>
                    <div className="flex items-center gap-2">
                      <Tag size={12} className="text-small-orange" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/20">{item.category}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Sidebar */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-theme border-l border-white/10 z-50 flex flex-col shadow-3xl"
            >
              <div className="p-8 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/5 rounded-2xl">
                    <ShoppingCart className="text-small-orange" size={24} />
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-tight">Your Cart</h2>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="p-3 bg-white/5 rounded-full text-white/40 hover:text-white transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                    <ShoppingBag size={64} className="mb-6" />
                    <p className="text-xs font-black uppercase tracking-widest">Your cart is empty</p>
                  </div>
                ) : (
                  cart.map(({ item, quantity }) => (
                    <div key={item.id} className="flex gap-6 group">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 border border-white/10">
                        <img src={item.imageUrl || `https://picsum.photos/seed/${item.id}/200/200`} className="w-full h-full object-cover" alt={item.title} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="text-sm font-black uppercase tracking-tight truncate pr-4">{item.title}</h4>
                          <button onClick={() => removeFromCart(item.id)} className="text-white/20 hover:text-red-500 transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">${item.price}</p>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center bg-white/5 rounded-xl border border-white/10">
                            <button onClick={() => updateQuantity(item.id, -1)} className="p-2 hover:text-small-orange transition-colors">
                              <Minus size={12} />
                            </button>
                            <span className="text-[10px] font-black w-8 text-center">{quantity}</span>
                            <button onClick={() => updateQuantity(item.id, 1)} className="p-2 hover:text-small-orange transition-colors">
                              <Plus size={12} />
                            </button>
                          </div>
                          <span className="text-[10px] font-black text-white/60">${(item.price * quantity).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-8 border-t border-white/10 bg-white/5 space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      <span>Subtotal</span>
                      <span>${cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      <span>Shipping</span>
                      <span className="text-green-400">Calculated at checkout</span>
                    </div>
                    <div className="flex justify-between text-xl font-black uppercase tracking-tight pt-3 border-t border-white/5">
                      <span>Total</span>
                      <span className="text-small-orange">${cartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <button className="w-full py-5 bg-white text-black rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] hover:scale-[1.02] transition-all shadow-2xl flex items-center justify-center gap-3">
                      Checkout Now <ArrowRight size={18} />
                    </button>
                    <div className="flex items-center justify-center gap-6 text-white/20">
                      <div className="flex items-center gap-2">
                        <Truck size={14} />
                        <span className="text-[8px] font-black uppercase tracking-widest">Fast Shipping</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={14} />
                        <span className="text-[8px] font-black uppercase tracking-widest">Secure Payment</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MerchStorefront;
