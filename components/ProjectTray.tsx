import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, UploadCloud, CheckCircle2, AlertCircle, Loader2, Maximize2,
  Music, Film, BookOpen, FileText, Layers, Sparkles, Pencil, Clock
} from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';
import { Album } from '../types';

interface ProjectTrayProps {
  isOpen: boolean;
  onClose: () => void;
  isCreatorMinimized: boolean;
  creatorProjectTitle?: string;
  onRestoreCreator: () => void;
  recentAlbums?: Album[];
}

const GRADIENT_CARD = {
  background: 'linear-gradient(135deg, rgba(107,0,153,0.35) 0%, rgba(255,140,0,0.22) 100%)',
  border: '1px solid rgba(255,140,0,0.20)',
};

const ProjectTray: React.FC<ProjectTrayProps> = ({
  isOpen,
  onClose,
  isCreatorMinimized,
  creatorProjectTitle,
  onRestoreCreator,
  recentAlbums = [],
}) => {
  const { tasks, removeTask, clearCompleted } = useUpload();
  const activeTasks = tasks.filter(t => t.status === 'UPLOADING');
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
  const errorTasks = tasks.filter(t => t.status === 'ERROR');

  const recent = recentAlbums.slice(0, 6);

  const typeIcon = (type: string) => {
    if (type === 'MUSIC') return <Music size={13} />;
    if (type === 'VIDEO' || type === 'FILM') return <Film size={13} />;
    if (type === 'BOOK') return <BookOpen size={13} />;
    return <Layers size={13} />;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[390] bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="fixed top-0 right-0 bottom-0 z-[400] w-[340px] flex flex-col overflow-hidden"
            style={{
              background: 'rgba(7,5,14,0.88)',
              backdropFilter: 'blur(40px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {/* Header */}
            <div
              className="shrink-0 px-5 pt-6 pb-4 flex items-center justify-between"
              style={{
                background: 'linear-gradient(135deg, rgba(107,0,153,0.28) 0%, rgba(255,140,0,0.15) 100%)',
                borderBottom: '1px solid rgba(255,140,0,0.15)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.5), rgba(255,140,0,0.4))', border: '1px solid rgba(255,140,0,0.3)' }}
                >
                  <Sparkles size={15} className="text-orange-300" />
                </div>
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white">Project Tray</h2>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Background Tasks & Projects</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">

              {/* Active Projects — minimized editors */}
              {isCreatorMinimized && (
                <section className="space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 px-1">Active Projects</p>
                  <div
                    className="p-4 rounded-2xl flex items-center gap-3 cursor-pointer hover:opacity-90 transition-all active:scale-[0.98]"
                    style={GRADIENT_CARD}
                    onClick={() => { onRestoreCreator(); onClose(); }}
                  >
                    <div className="p-2.5 rounded-xl bg-black/30 shrink-0">
                      <Pencil size={16} className="text-orange-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white truncate">
                        {creatorProjectTitle || 'Untitled Project'}
                      </p>
                      <p className="text-[8px] font-bold text-orange-300/70 uppercase tracking-widest">Project Edit — tap to resume</p>
                    </div>
                    <Maximize2 size={14} className="text-orange-300/70 shrink-0" />
                  </div>
                </section>
              )}

              {/* Upload Progress */}
              {tasks.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">Uploads</p>
                    {completedTasks.length > 0 && (
                      <button
                        onClick={clearCompleted}
                        className="text-[7px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 transition-all"
                      >
                        Clear Done
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3.5 rounded-2xl group"
                        style={{
                          background: task.status === 'ERROR'
                            ? 'rgba(239,68,68,0.08)'
                            : 'rgba(107,0,153,0.12)',
                          border: task.status === 'ERROR'
                            ? '1px solid rgba(239,68,68,0.2)'
                            : '1px solid rgba(107,0,153,0.2)',
                        }}
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="p-1.5 rounded-lg shrink-0"
                            style={{ background: task.status === 'ERROR' ? 'rgba(239,68,68,0.15)' : 'rgba(255,140,0,0.15)' }}>
                            <UploadCloud size={12}
                              className={task.status === 'ERROR' ? 'text-red-400' : 'text-orange-300'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-widest text-white truncate">{task.fileName}</p>
                            <p className="text-[7px] font-bold text-white/30 uppercase">{task.type}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {task.status === 'UPLOADING' && <Loader2 size={12} className="text-orange-300 animate-spin" />}
                            {task.status === 'COMPLETED' && <CheckCircle2 size={12} className="text-green-400" />}
                            {task.status === 'ERROR' && <AlertCircle size={12} className="text-red-400" />}
                            <button
                              onClick={() => removeTask(task.id)}
                              className="p-0.5 text-white/20 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${task.status === 'ERROR' ? 'bg-red-500' : 'bg-gradient-to-r from-purple-500 to-orange-400'}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-[7px] font-black text-white/30 w-7 text-right">{task.progress}%</span>
                        </div>
                        {task.status === 'ERROR' && (
                          <p className="text-[7px] text-red-400 mt-1.5 font-bold uppercase">{task.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Recent Projects */}
              {recent.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Clock size={10} className="text-white/25" />
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">Recent Projects</p>
                  </div>
                  <div className="space-y-1.5">
                    {recent.map((album) => (
                      <div
                        key={album.id}
                        className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-white/5 cursor-pointer group"
                        style={{ border: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 ring-1 ring-white/10">
                          {album.coverImage
                            ? <img src={album.coverImage} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.4), rgba(255,140,0,0.3))' }}>
                                {typeIcon(album.type || 'MUSIC')}
                              </div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-widest text-white truncate">{album.title || 'Untitled'}</p>
                          <p className="text-[7px] font-bold text-white/30 uppercase tracking-widest truncate">
                            {album.artist || 'Unknown'} · {album.type || 'MUSIC'}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span
                            className="text-[7px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{
                              background: album.isPublic ? 'rgba(34,197,94,0.12)' : 'rgba(107,0,153,0.2)',
                              color: album.isPublic ? '#4ade80' : '#c084fc',
                              border: album.isPublic ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(107,0,153,0.3)',
                            }}
                          >
                            {album.isPublic ? 'Live' : 'Draft'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Empty state */}
              {!isCreatorMinimized && tasks.length === 0 && recent.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.25), rgba(255,140,0,0.18))', border: '1px solid rgba(255,140,0,0.15)' }}
                  >
                    <Sparkles size={22} className="text-orange-300/60" />
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Nothing active</p>
                  <p className="text-[8px] text-white/15 uppercase tracking-wider mt-1">Upload or minimize a project to see it here</p>
                </div>
              )}
            </div>

            {/* Footer gradient accent */}
            <div
              className="shrink-0 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(107,0,153,0.4), rgba(255,140,0,0.3), rgba(107,0,153,0.4))' }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProjectTray;
