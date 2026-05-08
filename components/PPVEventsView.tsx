import React, { useState, useEffect } from 'react';
import { 
  Ticket, 
  Calendar, 
  Clock, 
  Play, 
  Sparkles, 
  Users, 
  ArrowLeft,
  Search,
  Filter,
  CreditCard,
  Lock,
  Radio,
  Share2,
  Camera,
  Zap,
  QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PPVEvent, EventPhotoPool } from '../types';
import { fetchPPVEvents, purchasePPVEvent, createEventPhotoPool, auth } from '../services/backendService';

interface PPVEventsViewProps {
  onBack: () => void;
  user: any;
  onJoinPool: (poolId: string) => void;
  isNested?: boolean;
}

const PPVEventsView: React.FC<PPVEventsViewProps> = ({ onBack, user, onJoinPool, isNested = false }) => {
  const [events, setEvents] = useState<PPVEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<PPVEvent | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'UPCOMING' | 'LIVE' | 'MY_TICKETS'>('ALL');
  const [isCreatingPool, setIsCreatingPool] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    const data = await fetchPPVEvents();
    setEvents(data);
    setLoading(false);
  };

  const handlePurchase = async (eventId: string) => {
    if (!user) return alert('Please sign in to purchase a ticket');
    await purchasePPVEvent(eventId);
    loadEvents();
    alert('Ticket purchased! You can now access the event.');
  };

  const handleCreatePool = async (event: PPVEvent) => {
    setIsCreatingPool(event.id);
    try {
      const pool = await createEventPhotoPool({
        eventId: event.id,
        title: `${event.title} Live Stream`,
        description: `Official live photo and video pool for ${event.title}`
      });
      if (pool) {
        loadEvents();
        onJoinPool(pool.id);
      }
    } catch (error) {
      console.error("Failed to create pool:", error);
    } finally {
      setIsCreatingPool(null);
    }
  };

  const filteredEvents = events.filter(e => {
    if (filter === 'LIVE') return e.status === 'LIVE';
    if (filter === 'UPCOMING') return e.status === 'UPCOMING';
    if (filter === 'MY_TICKETS') return e.purchasedBy?.includes(user?.uid || '');
    return true;
  });

  return (
    <div className={`min-h-screen bg-theme-bg ${isNested ? 'p-0' : 'p-6 lg:p-12'}`}>
      <div className={`${isNested ? 'w-full' : 'max-w-7xl mx-auto'}`}>
        {/* Header */}
        <div className={`flex flex-col lg:flex-row lg:items-center ${isNested ? 'justify-end' : 'justify-between'} gap-8 mb-16`}>
          {!isNested && (
            <div className="flex items-center gap-6">
              <button onClick={onBack} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all">
                <ArrowLeft size={24} />
              </button>
              <div>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Live Events</h1>
                <p className="text-[10px] font-bold text-small-orange uppercase tracking-widest mt-2">Pay-Per-View Concerts & Experiences</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 p-1 bg-white/5 rounded-2xl">
            {[
              { id: 'ALL', label: 'All Events' },
              { id: 'LIVE', label: 'Live Now' },
              { id: 'UPCOMING', label: 'Upcoming' },
              { id: 'MY_TICKETS', label: 'My Tickets' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id as any)}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  filter === t.id ? 'bg-white text-black' : 'text-white/40 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Featured Live Event */}
        {events.find(e => e.status === 'LIVE') && (
          <div className="mb-16">
            <div className="relative aspect-[21/9] rounded-[3rem] overflow-hidden border border-white/10 group">
              <img 
                src={events.find(e => e.status === 'LIVE')?.thumbnailUrl} 
                className="w-full h-full object-cover" 
                alt="" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              
              <div className="absolute top-8 left-8 flex items-center gap-3">
                <div className="px-4 py-2 bg-red-600 rounded-full flex items-center gap-2 animate-pulse">
                  <div className="w-2 h-2 bg-white rounded-full" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">Live Now</span>
                </div>
                {events.find(e => e.status === 'LIVE')?.isExclusive && (
                  <div className="px-4 py-2 bg-small-orange rounded-full flex items-center gap-2">
                    <Sparkles size={14} className="text-white" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Members Only</span>
                  </div>
                )}
              </div>

              <div className="absolute bottom-12 left-12 right-12 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                <div className="max-w-2xl">
                  <h2 className="text-4xl lg:text-6xl font-black uppercase tracking-tightest mb-4">
                    {events.find(e => e.status === 'LIVE')?.title}
                  </h2>
                  <p className="text-sm text-white/60 uppercase tracking-widest leading-relaxed">
                    {events.find(e => e.status === 'LIVE')?.description}
                  </p>
                </div>
                
                <button 
                  onClick={() => setSelectedEvent(events.find(e => e.status === 'LIVE')!)}
                  className="px-12 py-6 bg-white text-black rounded-full text-sm font-black uppercase tracking-widest hover:scale-105 transition-all shadow-2xl flex items-center gap-3"
                >
                  <Ticket size={20} />
                  Get Access - ${events.find(e => e.status === 'LIVE')?.price}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredEvents.map(event => (
            <motion.div 
              key={event.id}
              layoutId={event.id}
              className="group bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden hover:border-white/30 transition-all"
            >
              <div className="aspect-video relative">
                <img src={event.thumbnailUrl || null} className="w-full h-full object-cover" alt={event.title} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                
                <div className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-2">
                  <Ticket size={12} className="text-small-orange" />
                  <span className="text-[10px] font-black text-white">${event.price}</span>
                </div>

                {event.isExclusive && (
                  <div className="absolute top-4 left-4 px-3 py-1.5 bg-small-orange rounded-xl flex items-center gap-2">
                    <Sparkles size={12} className="text-white" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-white">Exclusive</span>
                  </div>
                )}
              </div>

              <div className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Calendar size={14} />
                    {new Date(event.startTime).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Clock size={14} />
                    {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <h3 className="text-xl font-black uppercase tracking-tightest mb-2">{event.title}</h3>
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-6">{event.ownerName}</p>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      if (event.purchasedBy?.includes(user?.uid) || event.ownerId === user?.uid) {
                        if (event.photoPoolId) {
                          onJoinPool(event.photoPoolId);
                        } else if (event.ownerId === user?.uid) {
                          handleCreatePool(event);
                        } else {
                          alert('Event has started! Enter the main stream.');
                        }
                      } else {
                        handlePurchase(event.id);
                      }
                    }}
                    className="flex-1 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center justify-center gap-2"
                  >
                    {event.purchasedBy?.includes(user?.uid) || event.ownerId === user?.uid ? (
                      <>
                        <Play size={14} fill="currentColor" />
                        Enter Event
                      </>
                    ) : (
                      <>
                        <Ticket size={14} />
                        Buy Ticket
                      </>
                    )}
                  </button>
                  
                  {(event.purchasedBy?.includes(user?.uid) || event.ownerId === user?.uid) && (
                    <button 
                      onClick={() => {
                        if (event.photoPoolId) {
                          onJoinPool(event.photoPoolId);
                        } else if (event.ownerId === user?.uid) {
                          handleCreatePool(event);
                        }
                      }}
                      className={`p-4 rounded-2xl transition-all ${event.photoPoolId ? 'bg-small-orange text-white animate-pulse' : 'bg-white/5 text-white/40 hover:text-white'}`}
                      title={event.photoPoolId ? "Join Live Photo Pool" : "Create Photo Pool"}
                    >
                      {isCreatingPool === event.id ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera size={18} />
                      )}
                    </button>
                  )}

                  <button className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all">
                    <Share2 size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PPVEventsView;
