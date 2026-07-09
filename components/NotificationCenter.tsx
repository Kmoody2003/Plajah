import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, MessageCircle, MessageSquare, Plus, Zap, Heart, Inbox, UserPlus, Settings } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { AppNotification } from '../types';
import NotificationSettings from './NotificationSettings';

interface NotificationCenterProps {
  onNavigate?: (notification: AppNotification) => void;
  onOpenAlerts?: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onNavigate, onOpenAlerts }) => {
  const { notifications, unreadCount, markAsRead, clearAll, isLoading } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const getIcon = (type: string) => {
    switch (type) {
      case 'MESSAGE': return <MessageCircle className="text-blue-400" size={16} />;
      case 'COMMENT': return <MessageSquare className="text-green-400" size={16} />;
      case 'CONTENT': return <Plus className="text-purple-400" size={16} />;
      case 'LIKE': return <Heart className="text-red-400" size={16} />;
      case 'FOLLOW': return <UserPlus className="text-cyan-400" size={16} />;
      default: return <Zap className="text-small-orange" size={16} />;
    }
  };

  const handleClick = (n: AppNotification) => {
    markAsRead(n.id);
    if (n.link && onNavigate) {
      onNavigate(n);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => { if (onOpenAlerts) { onOpenAlerts(); } else { setIsOpen(!isOpen); } }}
        className="relative p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 group"
      >
        <Bell size={20} className={unreadCount > 0 ? "text-small-orange animate-tada" : "text-white/40 group-hover:text-white"} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 rounded-full text-[8px] font-black flex items-center justify-center border-2 border-[#0a0a0a]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[150]" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10, x: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10, x: 10 }}
              className="absolute top-16 right-0 w-80 max-h-[500px] bg-[#0a0a0a]/95 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-3xl z-[160] overflow-hidden flex flex-col"
            >
              {showSettings ? (
                <NotificationSettings onClose={() => setShowSettings(false)} />
              ) : (
              <>
              <div className="p-6 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-[0.3em]">Notification Hub</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowSettings(true)} title="Notification settings" className="text-white/20 hover:text-white p-1"><Settings size={15} /></button>
                  <button onClick={() => setIsOpen(false)} className="text-white/20 hover:text-white p-1"><X size={16} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {isLoading ? (
                  <div className="p-12 flex flex-col items-center gap-4 text-white/20">
                    <Zap className="animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Loading Alerts...</span>
                  </div>
                ) : notifications.length > 0 ? (
                  <div className="divide-y divide-white/5">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`w-full p-6 hover:bg-white/[0.05] transition-colors text-left group relative ${!n.isRead ? 'bg-small-orange/[0.02]' : ''} ${n.link ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className="flex gap-4">
                          <div className="relative shrink-0">
                            <img
                              src={n.senderPhoto || `https://picsum.photos/seed/${n.senderId}/100/100`}
                              className="w-10 h-10 rounded-full object-cover border border-white/10"
                              alt=""
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute -bottom-1 -right-1 p-1 bg-black rounded-full border border-white/10">
                              {getIcon(n.type)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[11px] font-black uppercase tracking-wider truncate text-white">{n.title}</p>
                              <span className="text-[8px] font-bold text-white/20 uppercase tracking-tighter shrink-0 ml-2">
                                {formatDistanceToNow(n.timestamp)} ago
                              </span>
                            </div>
                            <p className="text-[10px] text-white/60 leading-relaxed italic">{n.message}</p>
                            {n.link && (
                              <p className="text-[8px] font-black uppercase tracking-widest text-small-orange/50 mt-1 group-hover:text-small-orange transition-colors">
                                Tap to view →
                              </p>
                            )}
                          </div>
                          {!n.isRead && (
                            <div className="w-1.5 h-1.5 bg-small-orange rounded-full mt-2 shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-20 flex flex-col items-center gap-4 text-white/10 text-center">
                    <Inbox size={40} />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Transmission Logs</p>
                  </div>
                )}
              </div>

              {notifications.length > 0 && (
                <div className="p-4 bg-white/5 text-center border-t border-white/5">
                  <button
                    onClick={() => { clearAll?.(); }}
                    className="text-[8px] font-black uppercase tracking-widest text-small-orange/60 hover:text-small-orange transition-colors"
                  >
                    Clear All History
                  </button>
                </div>
              )}
              </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
