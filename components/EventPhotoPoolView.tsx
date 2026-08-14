import React, { useState, useEffect } from 'react';
import { gridSrc } from '../services/imageDerivatives';
import { Photo, EventPhotoPool, PPVEvent } from '../types';
import { 
  QrCode, 
  Upload, 
  Play, 
  Maximize2, 
  Users, 
  Clock, 
  Zap,
  Camera,
  Video,
  ChevronLeft,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToPhotoPool, uploadPhoto, auth } from '../services/backendService';

interface EventPhotoPoolViewProps {
  poolId: string;
  event?: PPVEvent;
  onBack: () => void;
}

const EventPhotoPoolView: React.FC<EventPhotoPoolViewProps> = ({ poolId, event, onBack }) => {
  const [media, setMedia] = useState<Photo[]>([]);
  const [activeMedia, setActiveMedia] = useState<Photo | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToPhotoPool(poolId, (newMedia) => {
      setMedia(newMedia);
      if (!activeMedia && newMedia.length > 0) {
        setActiveMedia(newMedia[0]);
      }
    });
    return () => unsubscribe();
  }, [poolId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadPhoto(files[i], { 
          albumId: poolId, 
          isPublic: true,
          title: `Event Capture ${Date.now()}`
        });
      }
    } catch (error) {
      console.error("Pool upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 bg-black text-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="px-6 py-6 border-b border-white/5 flex items-center justify-between bg-black/50 backdrop-blur-xl z-20">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-all">
            <ChevronLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={14} className="text-small-orange" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-small-orange">Live Event Stream</span>
            </div>
            <h1 className="text-xl font-black uppercase tracking-tightest">{event?.title || 'Live Photo Pool'}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowQr(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
          >
            <QrCode size={14} />
            Join Pool
          </button>
          <label className="flex items-center gap-2 px-6 py-2.5 bg-white/10 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/20 transition-all">
            <Camera size={14} />
            Capture
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main Stage */}
        <div className="flex-1 relative bg-[#050505] flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            {activeMedia ? (
              <motion.div 
                key={activeMedia.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="w-full h-full flex items-center justify-center p-8"
              >
                {activeMedia.mediaType === 'VIDEO' ? (
                  <video src={activeMedia.url || undefined} controls autoPlay loop className="max-w-full max-h-full rounded-3xl shadow-3xl" />
                ) : (
                  <img src={activeMedia.url || null} alt="" className="max-w-full max-h-full object-contain rounded-3xl shadow-3xl" referrerPolicy="no-referrer" />
                )}
                
                {/* Media Info Overlay */}
                <div className="absolute bottom-12 left-12 right-12 flex items-end justify-between pointer-events-none">
                  <div className="bg-black/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 max-w-xl pointer-events-auto">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20">
                        <img src={`https://picsum.photos/seed/${activeMedia.ownerId}/100/100`} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Captured By</p>
                        <p className="text-xs font-bold uppercase tracking-widest">Archive User {activeMedia.ownerId.substring(0, 5)}</p>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-white/80 italic leading-relaxed">
                      {activeMedia.description || 'A moment frozen in the collective stream.'}
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-4 pointer-events-auto">
                    <button className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                      <Share2 size={24} />
                    </button>
                    <button className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                      <Maximize2 size={24} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center gap-6 opacity-20">
                <Camera size={64} className="" />
                <p className="text-xl font-black uppercase tracking-[0.5em]">Waiting for signals...</p>
              </div>
            )}
          </AnimatePresence>

          {isUploading && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 px-8 py-4 bg-small-orange rounded-full flex items-center gap-4 shadow-2xl z-30">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">Broadcasting to Pool...</span>
            </div>
          )}
        </div>

        {/* Sidebar Stream */}
        <div className="w-full lg:w-96 bg-black border-l border-white/5 flex flex-col">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users size={18} className="text-white/40" />
              <h2 className="text-xs font-black uppercase tracking-widest">The Stream</h2>
            </div>
            <span className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-white/40">
              {media.length} Captures
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 grid grid-cols-2 lg:grid-cols-1 gap-4">
            {media.map((item) => (
              <div 
                key={item.id}
                onClick={() => setActiveMedia(item)}
                className={`relative aspect-video rounded-2xl overflow-hidden cursor-pointer transition-all border-2 ${activeMedia?.id === item.id ? 'border-small-orange scale-[0.98]' : 'border-transparent hover:border-white/20'}`}
              >
                {item.mediaType === 'VIDEO' ? (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center relative">
                    <video src={item.url || undefined} className="w-full h-full object-cover opacity-60" />
                    <Play size={24} className="absolute text-white" fill="currentColor" />
                  </div>
                ) : (
                  <img src={gridSrc(item) || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                )}
                <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md">
                  <span className="text-[8px] font-black text-white/60 uppercase tracking-widest">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      <AnimatePresence>
        {showQr && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center p-6 bg-black/90 backdrop-blur-3xl"
            onClick={() => setShowQr(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-theme-card border border-white/10 rounded-[3rem] p-12 text-center shadow-3xl relative"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-8">
                <div className="w-20 h-20 bg-small-orange rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <QrCode size={40} className="text-white" />
                </div>
                <h2 className="text-3xl font-black uppercase tracking-tightest mb-4">Join the Pool</h2>
                <p className="text-sm font-medium text-white/40 italic leading-relaxed">
                  Scan this code to instantly connect your device and start broadcasting your captures to the live event stream.
                </p>
              </div>

              <div className="bg-white p-8 rounded-[2rem] mb-8 shadow-inner">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${window.location.origin}/pool/${poolId}`} 
                  alt="QR Code" 
                  className="w-full h-auto"
                />
              </div>

              <button 
                onClick={() => setShowQr(false)}
                className="w-full py-5 bg-white/5 text-white font-black uppercase tracking-widest text-xs rounded-full hover:bg-white/10 transition-all"
              >
                Close Connection
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EventPhotoPoolView;
