import React, { useState, useEffect } from 'react';
import { MessageSquare, ChevronRight, Bell, X, User, Users, Pin, PinOff } from 'lucide-react';
import { ChatRoom, UserProfile } from '../types';
import { listenToChatRooms, fetchUserProfiles, auth, updateUserProfile } from '../services/backendService';
import { motion, AnimatePresence } from 'motion/react';

interface ChatFlyoutProps {
  onNavigateToChat: () => void;
  onSelectRoom: (roomId: string) => void;
  userProfile?: UserProfile | null;
}

const ChatFlyout: React.FC<ChatFlyoutProps> = ({ onNavigateToChat, onSelectRoom, userProfile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, UserProfile>>({});
  const [unreadRooms, setUnreadRooms] = useState<Set<string>>(new Set());
  
  // Drag and Pin State
  const [position, setPosition] = useState(userProfile?.uiSettings?.chatIconPosition || { x: 0, y: -200 });
  const [isPinned, setIsPinned] = useState(userProfile?.uiSettings?.isChatIconPinned ?? false);

  useEffect(() => {
    if (userProfile?.uiSettings?.chatIconPosition) {
      setPosition(userProfile.uiSettings.chatIconPosition);
    }
    if (userProfile?.uiSettings?.isChatIconPinned !== undefined) {
      setIsPinned(userProfile.uiSettings.isChatIconPinned);
    }
  }, [userProfile]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubscribe = listenToChatRooms((allRooms) => {
      // Sort by updatedAt and take top 3
      const recentRooms = [...allRooms]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3);
      
      setRooms(recentRooms);

      // Fetch profiles for participants
      const allParticipantIds = new Set<string>();
      recentRooms.forEach(room => {
        room.participants.forEach(id => {
          if (id !== auth.currentUser?.uid) {
            allParticipantIds.add(id);
          }
        });
      });

      if (allParticipantIds.size > 0) {
        fetchUserProfiles(Array.from(allParticipantIds)).then(profiles => {
          const profileMap: Record<string, UserProfile> = {};
          profiles.forEach(p => {
            profileMap[p.uid] = p;
          });
          setParticipantProfiles(prev => ({ ...prev, ...profileMap }));
        });
      }

      // Mock unread status for demo purposes if not explicitly in DB
      // In a real app, we'd compare lastMessage timestamp with a local 'lastRead' timestamp
      const newUnread = new Set<string>();
      recentRooms.forEach(room => {
        // Simple heuristic: if updated in last 5 mins, mark as "new" for this flyout demo
        if (Date.now() - room.updatedAt < 300000) {
          newUnread.add(room.id);
        }
      });
      setUnreadRooms(newUnread);
    });

    return () => unsubscribe();
  }, []);

  const getRoomName = (room: ChatRoom) => {
    if (room.name) return room.name;
    if (room.type === 'PRIVATE') {
      const otherId = room.participants.find(id => id !== auth.currentUser?.uid);
      return participantProfiles[otherId || '']?.displayName || 'Chat';
    }
    return 'Group Chat';
  };

  const getRoomIcon = (room: ChatRoom) => {
    if (room.type === 'PRIVATE') {
      const otherId = room.participants.find(id => id !== auth.currentUser?.uid);
      const photo = participantProfiles[otherId || '']?.photoURL;
      if (photo) return <img src={photo || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />;
      return <User size={16} />;
    }
    return <Users size={16} />;
  };

  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    if (userProfile?.uid) {
      updateUserProfile(userProfile.uid, {
        uiSettings: {
          ...userProfile.uiSettings,
          isChatIconPinned: newPinned
        }
      });
    }
  };

  return (
    <motion.div 
      drag={!isPinned}
      dragMomentum={false}
      style={{ x: position.x, y: position.y }}
      onDragEnd={(_, info) => {
        const newPos = { x: position.x + info.offset.x, y: position.y + info.offset.y };
        setPosition(newPos);
        if (userProfile?.uid) {
          updateUserProfile(userProfile.uid, {
            uiSettings: {
              ...userProfile.uiSettings,
              chatIconPosition: newPos
            }
          });
        }
      }}
      className={`fixed right-4 sm:right-8 bottom-32 sm:bottom-24 z-[100] flex flex-col items-end gap-4 ${!isPinned ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            className="w-[calc(100vw-2rem)] sm:w-80 bg-theme-card backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-3">
                <MessageSquare size={18} className="text-small-orange" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Recent Activity</h3>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-white/20 hover:text-white transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto custom-scrollbar p-4 space-y-2">
              {rooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => {
                    onSelectRoom(room.id);
                    onNavigateToChat();
                    setIsOpen(false);
                  }}
                  className="w-full group flex items-center gap-4 p-4 rounded-3xl hover:bg-white/5 transition-all text-left relative"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    {getRoomIcon(room)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white truncate group-hover:text-small-orange transition-colors">
                        {getRoomName(room)}
                      </p>
                      {unreadRooms.has(room.id) && (
                        <div className="w-2 h-2 bg-small-orange rounded-full shadow-[0_0_10px_rgba(255,140,0,0.5)]" />
                      )}
                    </div>
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate mt-1">
                      {room.lastMessage || 'No messages yet'}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-white/10 group-hover:text-white/40 transition-all" />
                </button>
              ))}

              {rooms.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No recent chats</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <button
              onClick={() => {
                onNavigateToChat();
                setIsOpen(false);
              }}
              className="p-5 bg-white/5 hover:bg-white/10 transition-all text-center border-t border-white/5 group/footer"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 group-hover/footer:text-white transition-colors">View All Messages</span>
                <ChevronRight size={12} className="text-white/20 group-hover/footer:text-white transition-all transform group-hover/footer:translate-x-1" />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button Container */}
      <div className="relative group">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-[1.8rem] sm:rounded-[2rem] flex items-center justify-center transition-all shadow-2xl ${
            isOpen ? 'bg-white text-black scale-90' : 'bg-gradient-to-br from-[#6B0099] to-[#FF8C00] text-white hover:scale-110 active:scale-95'
          }`}
        >
          <MessageSquare size={24} className={isOpen ? 'rotate-90 transition-transform' : ''} />
          
          {unreadRooms.size > 0 && !isOpen && (
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-white text-black rounded-full flex items-center justify-center border-4 border-theme-card animate-bounce">
              <Bell size={10} fill="black" />
            </div>
          )}
        </button>

        {/* Pin/Unpin Button - Only visible when not open */}
        {!isOpen && (
          <button
            onClick={togglePin}
            className="absolute -top-2 -left-2 w-8 h-8 rounded-full bg-black/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-10"
            title={isPinned ? "Unpin to move" : "Pin position"}
          >
            {isPinned ? <Pin size={12} fill="currentColor" /> : <PinOff size={12} />}
          </button>
        )}

        {/* Tooltip */}
        {!isOpen && (
          <div className="absolute right-full mr-4 px-4 py-2 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap">
            <span className="text-[9px] font-black uppercase tracking-widest text-white">{isPinned ? 'Quick Messages' : 'Drag to Move'}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatFlyout;
