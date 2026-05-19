import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Users, Search, Plus, Settings, ChevronLeft, MoreVertical, Layers, Sparkles, User, Globe, Phone, Video, Edit3, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatRoom, UserProfile, CallSession } from '../types';
import { listenToChatRooms, auth, createChatRoom, listenToCalls, fetchUserProfiles, renameChatRoom, searchUserProfiles } from '../services/backendService';
import ChatWindow from './ChatWindow';
import CollaboBoard from './CollaboBoard';
import CallInterface from './CallInterface';
import VideoChat from './VideoChat';
import PostmanSystem from './PostmanSystem';

interface ChatSystemProps {
  onBack?: () => void;
  initialRoomId?: string;
}

const RoomIcon: React.FC<{ room: ChatRoom; profiles: Record<string, UserProfile> }> = ({ room, profiles }) => {
  const currentUid = auth.currentUser?.uid;
  
  if (room.type === 'PRIVATE') {
    const otherId = room.participants.find(uid => uid !== currentUid);
    const profile = otherId ? profiles[otherId] : null;
    return (
      <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5">
        {profile?.photoURL ? (
          <img src={profile.photoURL || null} alt={profile.displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User size={20} className="text-white/20" />
          </div>
        )}
      </div>
    );
  }

  // Group Chat Cluster Icon
  const otherParticipants = room.participants.filter(uid => uid !== currentUid).slice(0, 4);
  return (
    <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-white/5 relative">
      <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
        {otherParticipants.map((uid, i) => (
          <div key={uid} className="border-[0.5px] border-black/20 overflow-hidden">
            {profiles[uid]?.photoURL ? (
              <img src={profiles[uid].photoURL || null} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/10" />
            )}
          </div>
        ))}
        {otherParticipants.length === 0 && (
          <div className="col-span-2 row-span-2 flex items-center justify-center">
            <Users size={20} className="text-white/20" />
          </div>
        )}
      </div>
    </div>
  );
};

const ChatSystem: React.FC<ChatSystemProps> = ({ onBack, initialRoomId }) => {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [activeCollabId, setActiveCollabId] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [showVideoChat, setShowVideoChat] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'PRIVATE' | 'GROUP' | 'PUBLIC_LIVE' | 'POSTMAN'>('PRIVATE');
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [foundUsers, setFoundUsers] = useState<UserProfile[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    if (userSearchTerm.trim()) {
      setIsSearchingUsers(true);
      const delayDebounceFn = setTimeout(async () => {
        const users = await searchUserProfiles(userSearchTerm);
        setFoundUsers(users.filter(u => u.uid !== auth.currentUser?.uid));
        setIsSearchingUsers(false);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setFoundUsers([]);
    }
  }, [userSearchTerm]);

  useEffect(() => {
    const unsubscribe = listenToChatRooms((items) => {
      setRooms(items);
      
      // Collect all unique participant IDs
      const allUids = Array.from(new Set(items.flatMap(r => r.participants)));
      const missingUids = allUids.filter(uid => !profiles[uid]);
      
      if (missingUids.length > 0) {
        fetchUserProfiles(missingUids).then(newProfiles => {
          const profileMap = { ...profiles };
          newProfiles.forEach(p => {
            profileMap[p.uid] = p;
          });
          setProfiles(profileMap);
        });
      }
    });

    const unsubscribeCalls = listenToCalls((calls) => {
      if (calls.length > 0 && !activeCall) {
        setActiveCall(calls[0]);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeCalls();
    };
  }, [activeCall]);

  useEffect(() => {
    if (initialRoomId && rooms.length > 0) {
      const room = rooms.find(r => r.id === initialRoomId);
      if (room) setActiveRoom(room);
    }
  }, [initialRoomId, rooms]);

  const filteredRooms = rooms.filter(r => {
    const matchesTab = r.type === activeTab;
    if (!matchesTab) return false;

    let roomName = r.name || 'Conversation';
    if (r.type === 'PRIVATE') {
      const otherId = r.participants.find(uid => uid !== auth.currentUser?.uid);
      roomName = otherId ? profiles[otherId]?.displayName || 'Loading...' : 'Saved Messages';
    } else if (r.type === 'GROUP' && !r.name) {
      roomName = 'Group Chat';
    }

    return roomName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const roomId = await createChatRoom([auth.currentUser?.uid || ''], 'GROUP', newGroupName);
    setShowNewGroupModal(false);
    setNewGroupName('');
  };

  const handleRenameRoom = async (roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.ownerId !== auth.currentUser?.uid) return;
    
    const newName = prompt("Enter new group name:", room.name || 'Group Chat');
    if (newName && newName !== room.name) {
      await renameChatRoom(roomId, newName);
    }
  };

  return (
    <div className="h-full bg-black/15 backdrop-blur-2xl flex overflow-hidden relative pb-32 lg:pb-40">
      {/* Sidebar for Chat List */}
      <div className={`w-full lg:w-96 border-r border-white/[0.07] flex flex-col bg-white/[0.03] ${activeRoom || activeCollabId ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-8 border-b border-white/5">
          <div className="flex flex-col gap-6 mb-8">
            <div className="flex items-center justify-between">
              {onBack && (
                <button onClick={onBack} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all w-fit">
                  <ChevronLeft size={20} />
                </button>
              )}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowUserSearch(true)} 
                  className="p-3 bg-white/5 text-white/40 rounded-2xl hover:bg-white/10 transition-all hover:text-white"
                  title="Search Users"
                >
                  <Search size={20} />
                </button>
                <button onClick={() => setShowNewGroupModal(true)} className="p-3 bg-small-orange/20 text-small-orange rounded-2xl hover:bg-small-orange transition-all hover:text-white">
                  <Plus size={20} />
                </button>
              </div>
            </div>
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Messages</h1>
          </div>

          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-12 text-white focus:border-small-orange transition-all outline-none text-sm"
            />
          </div>

          <div className="flex items-center gap-2 p-1 bg-black/40 rounded-2xl border border-white/5">
            {[
              { id: 'PRIVATE', label: 'Direct', icon: MessageSquare },
              { id: 'GROUP', label: 'Groups', icon: Users },
              { id: 'PUBLIC_LIVE', label: 'Live', icon: Globe },
              { id: 'POSTMAN', label: 'Postman', icon: Mail }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${activeTab === tab.id ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
              >
                <tab.icon size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
          {filteredRooms.map(room => {
            let displayName = room.name || (room.type === 'GROUP' ? 'Group Chat' : 'Conversation');
            if (room.type === 'PRIVATE') {
              const otherId = room.participants.find(uid => uid !== auth.currentUser?.uid);
              displayName = otherId ? profiles[otherId]?.displayName || 'Loading...' : 'Saved Messages';
            }

            return (
              <div key={room.id} className="relative group">
                <button 
                  onClick={() => { setActiveRoom(room); setActiveCollabId(null); }}
                  className={`w-full p-4 rounded-[1.5rem] flex items-center gap-4 transition-all border ${activeRoom?.id === room.id ? 'bg-white border-white' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                >
                  <RoomIcon room={room} profiles={profiles} />
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`text-sm font-black uppercase tracking-widest truncate ${activeRoom?.id === room.id ? 'text-black' : 'text-white'}`}>
                        {displayName}
                      </h4>
                      <span className={`text-[8px] font-bold uppercase tracking-widest ${activeRoom?.id === room.id ? 'text-black/40' : 'text-white/20'}`}>
                        {new Date(room.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest truncate ${activeRoom?.id === room.id ? 'text-black/60' : 'text-white/30'}`}>
                      {room.lastMessage || 'No messages yet'}
                    </p>
                  </div>
                </button>
                {room.type === 'GROUP' && room.ownerId === auth.currentUser?.uid && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleRenameRoom(room.id); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/40 text-white/40 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Edit3 size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {filteredRooms.length === 0 && (
            <div className="py-20 text-center">
              <MessageSquare size={32} className="text-white/10 mx-auto mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No conversations found</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat/Collab Area */}
      <div className="flex-1 flex flex-col relative">
        {activeTab === 'POSTMAN' ? (
          <div className="flex-1 p-4 lg:p-8">
            <PostmanSystem />
          </div>
        ) : activeCollabId ? (
          <CollaboBoard projectId={activeCollabId} onBack={() => setActiveCollabId(null)} />
        ) : activeRoom ? (
          <ChatWindow 
            room={activeRoom} 
            onBack={() => setActiveRoom(null)} 
            onOpenCollab={(id) => setActiveCollabId(id)}
            onStartVideo={() => setShowVideoChat(true)}
          />
        ) : (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center bg-theme p-12 text-center">
            <div className="w-32 h-32 bg-gradient-to-br from-small-orange/20 to-[#6B0099]/20 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/10 animate-pulse">
              <Sparkles size={48} className="text-small-orange" />
            </div>
            <h2 className="text-4xl font-black uppercase tracking-tightest mb-4">Plajah Messenger</h2>
            <p className="text-xs font-bold text-white/30 uppercase tracking-[0.3em] max-w-sm leading-loose">Select a conversation to start collaborating in real-time with artists and friends.</p>
          </div>
        )}
      </div>

      {/* Video Chat Overlay */}
      <AnimatePresence>
        {showVideoChat && activeRoom && (
          <VideoChat 
            room={activeRoom} 
            user={auth.currentUser} 
            onClose={() => setShowVideoChat(false)} 
          />
        )}
      </AnimatePresence>

      {/* Call Interface Overlay */}
      <AnimatePresence>
        {activeCall && (
          <CallInterface call={activeCall} onEnd={() => setActiveCall(null)} />
        )}
      </AnimatePresence>

      {/* New Group Modal */}
      {showNewGroupModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[400] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-theme border border-white/10 p-10 rounded-[2.5rem] shadow-3xl">
            <h2 className="text-2xl font-black uppercase tracking-tightest mb-8">Create New Group</h2>
            <div className="space-y-6 mb-10">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 block">Group Name</label>
                <input 
                  type="text" 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:border-small-orange transition-all outline-none"
                  placeholder="The Vibe Tribe"
                />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <button onClick={handleCreateGroup} className="w-full py-5 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-small-orange/80 transition-all">Create Group</button>
              <button onClick={() => setShowNewGroupModal(false)} className="w-full py-5 bg-white/5 text-white/40 font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* User Search Modal */}
      {showUserSearch && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[400] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-theme border border-white/10 p-10 rounded-[2.5rem] shadow-3xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black uppercase tracking-tightest">Find Users</h2>
              <button onClick={() => setShowUserSearch(false)} className="p-2 text-white/20 hover:text-white transition-all">
                <ChevronLeft size={20} />
              </button>
            </div>
            
            <div className="relative mb-8">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="text" 
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                placeholder="Search by name..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-12 text-white focus:border-small-orange transition-all outline-none text-sm"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {isSearchingUsers ? (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-2 border-small-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Searching...</p>
                </div>
              ) : foundUsers.length > 0 ? (
                foundUsers.map(u => (
                  <button
                    key={u.uid}
                    onClick={async () => {
                      const roomId = await createChatRoom([auth.currentUser?.uid || '', u.uid], 'PRIVATE');
                      setShowUserSearch(false);
                      setUserSearchTerm('');
                      // The listener will pick up the new room
                    }}
                    className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all flex items-center gap-4 group"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10">
                      <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-black uppercase tracking-widest group-hover:text-small-orange transition-colors">{u.displayName}</p>
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest truncate">{u.bio || 'Artist / Creator'}</p>
                    </div>
                    <Plus size={16} className="text-white/20 group-hover:text-white transition-all" />
                  </button>
                ))
              ) : userSearchTerm ? (
                <div className="py-12 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No users found</p>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Type to search creators</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatSystem;
