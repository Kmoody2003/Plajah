import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Image as KonvaImage } from 'react-konva';
import { MousePointer2, Pencil, Square, Circle as CircleIcon, Type, Trash2, Save, Share2, Plus, Link as LinkIcon, Image as ImageIcon, Layers, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CollabProject } from '../types';
import { updateCollabProject, listenToCollabProject } from '../services/backendService';

interface CollaboBoardProps {
  projectId: string;
  onBack?: () => void;
}

const CollaboBoard: React.FC<CollaboBoardProps> = ({ projectId, onBack }) => {
  const [project, setProject] = useState<CollabProject | null>(null);
  const [tool, setTool] = useState<'pencil' | 'rect' | 'circle' | 'text' | 'select'>('pencil');
  const [lines, setLines] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#FF8C00');
  const [showAssets, setShowAssets] = useState(false);
  const [newLink, setNewLink] = useState({ title: '', url: '' });
  const [showLinkInput, setShowLinkInput] = useState(false);
  const stageRef = useRef<any>(null);

  useEffect(() => {
    const unsubscribe = listenToCollabProject(projectId, (p) => {
      setProject(p);
      if (p.whiteboardData) {
        try {
          const data = JSON.parse(p.whiteboardData);
          setLines(data.lines || []);
        } catch (e) {
          console.error("Error parsing whiteboard data:", e);
        }
      }
    });
    return () => unsubscribe();
  }, [projectId]);

  const handleMouseDown = (e: any) => {
    if (tool === 'select') return;
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { tool, points: [pos.x, pos.y], color }]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    let lastLine = lines[lines.length - 1];
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    lines.splice(lines.length - 1, 1, lastLine);
    setLines(lines.concat());
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    saveBoard();
  };

  const saveBoard = async () => {
    if (!project) return;
    const data = JSON.stringify({ lines });
    await updateCollabProject(projectId, { whiteboardData: data });
  };

  const addLink = async () => {
    if (!project || !newLink.title || !newLink.url) return;
    const updatedLinks = [...(project.links || []), newLink];
    await updateCollabProject(projectId, { links: updatedLinks });
    setNewLink({ title: '', url: '' });
    setShowLinkInput(false);
  };

  const addAsset = async (url: string, name: string, type: string) => {
    if (!project) return;
    const updatedAssets = [...(project.assets || []), { id: Date.now().toString(), name, url, type }];
    await updateCollabProject(projectId, { assets: updatedAssets });
  };

  if (!project) return null;

  return (
    <div className="h-full bg-[#0a0a0a] flex flex-col overflow-hidden">
      {/* Toolbar Header */}
      <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-xl transition-all">
              <ChevronLeft size={20} />
            </button>
          )}
          <h2 className="text-sm font-black uppercase tracking-widest text-white/60">{project.name}</h2>
        </div>
        <div className="flex items-center gap-2 bg-black/40 p-1 rounded-2xl border border-white/5">
          {[
            { id: 'select', icon: MousePointer2 },
            { id: 'pencil', icon: Pencil },
            { id: 'rect', icon: Square },
            { id: 'circle', icon: CircleIcon },
            { id: 'text', icon: Type }
          ].map(t => (
            <button 
              key={t.id}
              onClick={() => setTool(t.id as any)}
              className={`p-3 rounded-xl transition-all ${tool === t.id ? 'bg-small-orange text-white' : 'text-white/40 hover:text-white'}`}
            >
              <t.icon size={18} />
            </button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-2" />
          <input 
            type="color" 
            value={color} 
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded-lg bg-transparent cursor-pointer border-none"
          />
          <button onClick={() => { setLines([]); saveBoard(); }} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
            <Trash2 size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowAssets(!showAssets)} className={`p-3 rounded-xl transition-all ${showAssets ? 'bg-white text-black' : 'bg-white/5 text-white/60 hover:text-white'}`}>
            <Layers size={18} />
          </button>
          <button onClick={() => setShowLinkInput(true)} className="p-3 bg-white/5 text-white/60 hover:text-white rounded-xl transition-all">
            <LinkIcon size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex overflow-hidden">
        {/* Whiteboard Area */}
        <div className="flex-1 bg-white/5 cursor-crosshair overflow-hidden">
          <Stage
            width={window.innerWidth - (showAssets ? 320 : 0)}
            height={window.innerHeight - 100}
            onMouseDown={handleMouseDown}
            onMousemove={handleMouseMove}
            onMouseup={handleMouseUp}
            ref={stageRef}
          >
            <Layer>
              {lines.map((line, i) => (
                <Line
                  key={i}
                  points={line.points}
                  stroke={line.color}
                  strokeWidth={5}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  globalCompositeOperation={
                    line.tool === 'eraser' ? 'destination-out' : 'source-over'
                  }
                />
              ))}
            </Layer>
          </Stage>
        </div>

        {/* Sidebar for Assets & Links */}
        <AnimatePresence>
          {showAssets && (
            <motion.div 
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              className="w-80 bg-theme-card border-l border-white/10 p-6 flex flex-col gap-8 overflow-y-auto"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-small-orange">Assets</h3>
                  <button className="p-2 bg-white/5 rounded-lg hover:bg-white/10">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {project.assets.map(asset => (
                    <div key={asset.id} className="aspect-square bg-white/5 rounded-xl border border-white/10 p-2 group relative">
                      {asset.type.startsWith('image') ? (
                        <img src={asset.url || null} alt={asset.name} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={24} className="text-white/20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center rounded-xl">
                        <button className="p-2 bg-white text-black rounded-lg">
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-small-orange">Links</h3>
                  <button onClick={() => setShowLinkInput(true)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="space-y-3">
                  {project.links.map((link, i) => (
                    <a 
                      key={i} 
                      href={link.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white group-hover:text-small-orange transition-all">{link.title}</span>
                        <ExternalLink size={12} className="text-white/20" />
                      </div>
                      <span className="text-[10px] text-white/30 truncate block">{link.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Link Input Modal */}
      {showLinkInput && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[400] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#0a0a0a] border border-white/10 p-10 rounded-[2.5rem] shadow-3xl">
            <h2 className="text-2xl font-black uppercase tracking-tightest mb-8">Add Resource Link</h2>
            <div className="space-y-6 mb-10">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 block">Title</label>
                <input 
                  type="text" 
                  value={newLink.title}
                  onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:border-small-orange transition-all outline-none"
                  placeholder="Inspiration Site"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 block">URL</label>
                <input 
                  type="text" 
                  value={newLink.url}
                  onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:border-small-orange transition-all outline-none"
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <button onClick={addLink} className="w-full py-5 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-small-orange/80 transition-all">Add Link</button>
              <button onClick={() => setShowLinkInput(false)} className="w-full py-5 bg-white/5 text-white/40 font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollaboBoard;
