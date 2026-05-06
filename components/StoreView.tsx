import React, { useState, useEffect } from 'react';
import { ShoppingBag, Star, Share2, ExternalLink, Play, Image as ImageIcon, Video as VideoIcon, Music, ChevronRight, Heart, ShoppingCart } from 'lucide-react';
import { MerchItem, Review, UserProfile, StoreSettings, Album, Video } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { addReview, fetchReviews, updateRevenue } from '../services/backendService';
import { auth } from '../services/backendService';
import PrintOrderModal from './PrintOrderModal';

interface StoreViewProps {
  artistId: string;
  artistName: string;
  merch: MerchItem[];
  albums?: Album[];
  videos?: Video[];
  settings?: StoreSettings;
  onSelectContent?: (item: Album | Video) => void;
}

const StoreView: React.FC<StoreViewProps> = ({ artistId, artistName, merch, albums = [], videos = [], settings, onSelectContent }) => {
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  useEffect(() => {
    if (selectedItem) {
      loadReviews(selectedItem.id);
    }
  }, [selectedItem]);

  const loadReviews = async (productId: string) => {
    const data = await fetchReviews(productId);
    setReviews(data);
  };

  const handleAddReview = async () => {
    if (!selectedItem || !auth.currentUser) return;
    setIsSubmittingReview(true);
    try {
      await addReview(selectedItem.id, {
        productId: selectedItem.id,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous',
        userPhoto: auth.currentUser.photoURL || '',
        rating: newReview.rating,
        comment: newReview.comment
      });
      setNewReview({ rating: 5, comment: '' });
      loadReviews(selectedItem.id);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const shareItem = (item: MerchItem | Album | Video) => {
    const url = `${window.location.origin}/store/${artistId}/${item.id}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const unifiedItems = [
    ...merch.map(m => ({ ...m, _type: 'merch' as const })),
    ...albums.filter(a => a.price !== undefined && a.price > 0).map(a => ({ ...a, _type: 'album' as const, category: a.type === 'BOOK' ? 'BOOKS' : a.type === 'VIDEO' ? 'MEDIA' : 'MUSIC' })),
    ...videos.filter(v => v.price !== undefined && v.price > 0).map(v => ({ ...v, _type: 'video' as const, category: 'MEDIA' as any }))
  ];

  const categories = ['ALL', 'APPAREL', 'MUSIC', 'DIGITAL', 'MEDIA', 'BOOKS', 'ACCESSORY', 'COLLECTIBLES'];
  const filteredItems = activeCategory === 'ALL' 
    ? unifiedItems 
    : unifiedItems.filter(item => item.category === activeCategory);

  if (settings?.useExternalStore && settings.externalStoreUrl) {
    return (
      <div className="w-full h-[800px] rounded-[3rem] overflow-hidden border border-white/5 bg-black/20">
        <iframe 
          src={settings.externalStoreUrl} 
          className="w-full h-full border-none"
          title="External Store"
        />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Categories */}
      <div className="flex flex-wrap gap-3">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              activeCategory === cat 
                ? 'bg-white text-black shadow-xl' 
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredItems.map((item) => {
          const isAlbum = '_type' in item && item._type === 'album';
          const isVideo = '_type' in item && item._type === 'video';
          const isContent = isAlbum || isVideo;
          const imageUrl = isAlbum ? (item as Album).coverImage : isVideo ? ((item as Video).coverImageUrl || (item as Video).thumbnailUrl) : (item as MerchItem).imageUrl;
          const price = isContent ? (item as Album | Video).price : (item as MerchItem).salePrice || (item as MerchItem).price;
          const salePrice = isContent ? undefined : (item as MerchItem).salePrice;

          return (
          <motion.div
            key={item.id}
            layoutId={item.id}
            onClick={() => setSelectedItem(item)}
            className="group relative bg-white/[0.03] border border-white/5 rounded-[3rem] overflow-hidden hover:bg-white/[0.06] transition-all cursor-pointer"
          >
            <div className="aspect-square overflow-hidden relative">
              <img 
                src={imageUrl || ''} 
                alt={item.title} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                referrerPolicy="no-referrer"
              />
              {salePrice && (
                <div className="absolute top-6 left-6">
                  <div className="bg-small-orange px-4 py-2 rounded-full shadow-xl">
                    <span className="text-[10px] font-black text-black uppercase tracking-widest">Sale</span>
                  </div>
                </div>
              )}
              {price !== undefined && price > 0 && (
                <div className="absolute top-6 right-6">
                  <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                    <span className="text-xs font-black text-small-orange">
                      ${price}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                <div className="flex flex-col items-center gap-4">
                  <button className="px-8 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-3 scale-90 group-hover:scale-100 transition-all">
                    <ShoppingCart size={16} />
                    View Details
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-8">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-black uppercase tracking-tightest group-hover:text-small-orange transition-colors">{item.title}</h3>
                {!isContent && (
                  <div className="flex items-center gap-1 text-small-orange">
                    <Star size={12} fill="currentColor" />
                    <span className="text-[10px] font-bold">{(item as MerchItem).rating?.toFixed(1) || '0.0'}</span>
                  </div>
                )}
              </div>
              <p className="text-white/40 text-xs line-clamp-2 font-medium leading-relaxed mb-6">{(item as MerchItem).description || (item as Album).artist}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{(item as any).category || (isAlbum ? (item as Album).type : isVideo ? 'VIDEO' : 'MERCH')}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); shareItem(item); }}
                  className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-all text-white/40 hover:text-white"
                >
                  <Share2 size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )})}
      </div>

      {/* Product Detail Modal */}
      <AnimatePresence>
        {selectedItem && (() => {
          const isAlbum = '_type' in selectedItem && selectedItem._type === 'album';
          const isVideo = '_type' in selectedItem && selectedItem._type === 'video';
          const isContent = isAlbum || isVideo;
          const imageUrl = isAlbum ? (selectedItem as Album).coverImage : isVideo ? ((selectedItem as Video).coverImageUrl || (selectedItem as Video).thumbnailUrl) : (selectedItem as MerchItem).imageUrl;
          const videoUrl = isContent ? ((selectedItem as Video).url || (selectedItem as MerchItem).videoUrl) : (selectedItem as MerchItem).videoUrl;
          const price = isContent ? (selectedItem as Album | Video).price : (selectedItem as MerchItem).salePrice || (selectedItem as MerchItem).price;
          const salePrice = isContent ? undefined : (selectedItem as MerchItem).salePrice;

          return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-2xl"
            />
            
            <motion.div 
              layoutId={selectedItem.id}
              className="relative w-full max-w-6xl bg-[#0a0a0a] border border-white/10 rounded-[4rem] overflow-hidden shadow-2xl flex flex-col lg:flex-row max-h-[90vh]"
            >
              <div className="lg:w-1/2 relative bg-black">
                {videoUrl && !isVideo ? (
                  <video 
                    src={videoUrl || undefined} 
                    className="w-full h-full object-cover"
                    autoPlay loop muted playsInline
                  />
                ) : (
                  <img 
                    src={imageUrl || null} 
                    alt={selectedItem.title} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="absolute top-8 left-8 p-4 bg-black/40 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 transition-all z-10"
                >
                  <ChevronRight size={24} className="rotate-180" />
                </button>
              </div>

              <div className="lg:w-1/2 p-12 lg:p-20 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-3 mb-8">
                  <span className="px-4 py-2 bg-white/5 rounded-full text-[10px] font-black text-white/40 uppercase tracking-widest border border-white/5">
                    {(selectedItem as any).category || (isAlbum ? (selectedItem as Album).type : isVideo ? 'VIDEO' : 'MERCH')}
                  </span>
                  {(!isContent && (selectedItem as MerchItem).isDigitalAsset) && (
                    <span className="px-4 py-2 bg-small-orange/20 rounded-full text-[10px] font-black text-small-orange uppercase tracking-widest border border-small-orange/20">
                      Digital Asset
                    </span>
                  )}
                  {isContent && (
                    <span className="px-4 py-2 bg-small-orange/20 rounded-full text-[10px] font-black text-small-orange uppercase tracking-widest border border-small-orange/20">
                      Digital Content
                    </span>
                  )}
                </div>

                <h2 className="text-5xl lg:text-7xl font-display font-black uppercase tracking-tightest mb-6 leading-none">
                  {selectedItem.title}
                </h2>

                <div className="flex items-center gap-8 mb-12">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Price</span>
                    <div className="flex items-center gap-3">
                      <span className="text-4xl font-black text-small-orange">${price || 0}</span>
                      {salePrice && (
                        <span className="text-xl font-bold text-white/20 line-through">${(selectedItem as MerchItem).price}</span>
                      )}
                    </div>
                  </div>
                  {!isContent && (
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Rating</span>
                      <div className="flex items-center gap-2 text-2xl font-black">
                        <Star size={24} fill="#FF6321" className="text-small-orange" />
                        {(selectedItem as MerchItem).rating?.toFixed(1) || '0.0'}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-8 mb-16">
                  <div>
                    <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Description</h4>
                    <p className="text-white/60 leading-relaxed font-medium">{(selectedItem as MerchItem).description || (selectedItem as Album).artist}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 mb-20">
                  {isContent ? (
                    <>
                      <button 
                        onClick={() => {
                          if (onSelectContent) {
                            onSelectContent(selectedItem as Album | Video);
                          }
                        }}
                        className="flex-1 min-w-[200px] py-6 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-3"
                      >
                        <Play size={18} fill="currentColor" />
                        View Content
                      </button>
                      {isAlbum && (selectedItem as Album).type === 'BOOK' && (
                        <button 
                          onClick={() => {
                            setIsPrintModalOpen(true);
                          }}
                          className="flex-1 min-w-[200px] py-6 bg-blue-500 text-white rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-3"
                        >
                          <ShoppingCart size={18} />
                          Order Printed Book
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button className="flex-1 min-w-[200px] py-6 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-3">
                        <ShoppingCart size={18} />
                        Add to Cart
                      </button>
                      <button className="flex-1 min-w-[200px] py-6 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-3">
                        <Play size={18} fill="currentColor" />
                        Buy with Crypto
                      </button>
                    </>
                  )}
                </div>

                {/* Reviews Section */}
                <section className="space-y-12">
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black uppercase tracking-tightest">Reviews</h3>
                    <span className="text-white/20 font-bold uppercase tracking-widest text-[10px]">{reviews.length} Reviews</span>
                  </div>

                  {auth.currentUser && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Your Rating</span>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map(star => (
                            <button 
                              key={star}
                              onClick={() => setNewReview(prev => ({ ...prev, rating: star }))}
                              className={`transition-all ${newReview.rating >= star ? 'text-small-orange' : 'text-white/10'}`}
                            >
                              <Star size={20} fill={newReview.rating >= star ? 'currentColor' : 'none'} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea 
                        value={newReview.comment}
                        onChange={(e) => setNewReview(prev => ({ ...prev, comment: e.target.value }))}
                        placeholder="Share your thoughts on this item..."
                        className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 text-sm focus:outline-none focus:border-small-orange/50 transition-all min-h-[120px]"
                      />
                      <button 
                        onClick={handleAddReview}
                        disabled={isSubmittingReview || !newReview.comment}
                        className="w-full py-4 bg-white/10 hover:bg-white text-white hover:text-black rounded-full font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {isSubmittingReview ? 'Posting...' : 'Post Review'}
                      </button>
                    </div>
                  )}

                  <div className="space-y-6">
                    {reviews.map(review => (
                      <div key={review.id} className="p-8 bg-white/[0.02] border border-white/5 rounded-[2.5rem]">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <img src={review.userPhoto || null} alt={review.userName} className="w-10 h-10 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest">{review.userName}</p>
                              <p className="text-[10px] text-white/20 font-bold">{new Date(review.timestamp).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} size={10} fill={review.rating >= star ? '#FF6321' : 'none'} className={review.rating >= star ? 'text-small-orange' : 'text-white/10'} />
                            ))}
                          </div>
                        </div>
                        <p className="text-sm text-white/60 leading-relaxed">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </div>
          )})()}
      </AnimatePresence>

      <AnimatePresence>
        {isPrintModalOpen && selectedItem && '_type' in selectedItem && selectedItem._type === 'album' && (
          <PrintOrderModal 
            book={selectedItem as Album} 
            onClose={() => setIsPrintModalOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default StoreView;
