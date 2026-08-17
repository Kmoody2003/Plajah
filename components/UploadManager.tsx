import React, { useState, useEffect, useRef } from 'react';
import { useUpload, UploadTask } from '../contexts/UploadContext';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, X, CheckCircle2, AlertCircle, Loader2, UploadCloud, Maximize2 } from 'lucide-react';

interface UploadManagerProps {
  isMinimizedCreator?: boolean;
  onRestoreCreator?: () => void;
}

const UploadManager: React.FC<UploadManagerProps> = ({ isMinimizedCreator, onRestoreCreator }) => {
  const { tasks, removeTask, clearCompleted } = useUpload();
  const [isMinimized, setIsMinimized] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeTasks = tasks.filter(t => t.status === 'UPLOADING').length;
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;

  useEffect(() => {
    if (tasks.length > 0) {
      setIsVisible(true);
      
      // Clear existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      // If no active tasks, start the 1-minute countdown to hide
      if (activeTasks === 0) {
        hideTimeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 60000); // 1 minute
      }
    } else {
      setIsVisible(false);
    }

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [tasks.length, activeTasks]);

  if (!isVisible || tasks.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-24 right-8 z-[300] w-80"
    >
      <div className="bg-black/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-3xl overflow-hidden">
        {/* Header */}
        <div 
          className="p-4 bg-white/5 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-all"
          onClick={() => setIsMinimized(v => !v)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-small-orange/20 rounded-xl text-small-orange">
              <UploadCloud size={16} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white">
                {activeTasks > 0 ? `Uploading ${activeTasks} items...` : 'Uploads Complete'}
              </p>
              <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                {completedTasks} completed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isMinimizedCreator && onRestoreCreator && (
              <button 
                onClick={(e) => { e.stopPropagation(); onRestoreCreator(); }}
                className="p-2 bg-white/10 rounded-lg text-white/60 hover:text-white transition-all"
                title="Restore Editor"
              >
                <Maximize2 size={14} />
              </button>
            )}
            {completedTasks > 0 && !isMinimized && (
              <button 
                onClick={(e) => { e.stopPropagation(); clearCompleted(); }}
                className="text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all"
              >
                Clear
              </button>
            )}
            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {/* Task List */}
        <AnimatePresence>
          {!isMinimized && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="max-h-96 overflow-y-auto custom-scrollbar"
            >
              <div className="p-4 space-y-4">
                {tasks.map((task) => (
                  <div key={task.id} className="p-3 bg-white/5 rounded-2xl border border-white/5 group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white truncate">
                          {task.fileName}
                        </p>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                          {task.type}
                        </p>
                      </div>
                      <button 
                        onClick={() => removeTask(task.id)}
                        className="p-1 text-white/20 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          className={`h-full ${task.status === 'ERROR' ? 'bg-red-500' : 'bg-small-orange'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <div className="shrink-0">
                        {task.status === 'UPLOADING' && <Loader2 size={12} className="text-small-orange animate-spin" />}
                        {task.status === 'COMPLETED' && <CheckCircle2 size={12} className="text-green-500" />}
                        {task.status === 'ERROR' && <AlertCircle size={12} className="text-red-500" />}
                      </div>
                    </div>
                    {task.status === 'ERROR' && (
                      <p className="text-[8px] text-red-500 mt-1 uppercase font-bold">{task.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default UploadManager;
