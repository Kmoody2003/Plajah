import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PrivateBoard, BoardItem, UserProfile } from '../types';
import { getPrivateBoards, createPrivateBoard, updatePrivateBoard, deletePrivateBoard } from '../services/backendService';
import { Plus, X, Maximize2, Trash2, Edit3, Save, Pin } from 'lucide-react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface PrivateBoardsViewProps {
  currentUser: UserProfile;
}

const PrivateBoardsView: React.FC<PrivateBoardsViewProps> = ({ currentUser }) => {
  const [boards, setBoards] = useState<PrivateBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<PrivateBoard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newBoardName, setNewBoardName] = useState('');
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const { theme } = useGlobalPlayerState();

  useEffect(() => {
    const fetchBoards = async () => {
      const b = await getPrivateBoards(currentUser.uid);
      setBoards(b);
      if (b.length > 0) setActiveBoard(b[0]);
      setIsLoading(false);
    };
    fetchBoards();
  }, [currentUser.uid]);

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    const b = await createPrivateBoard(currentUser.uid, newBoardName);
    if (b) {
      setBoards([...boards, b]);
      setActiveBoard(b);
      setNewBoardName('');
    }
  };

  const handleUpdateItemPosition = async (itemId: string, x: number, y: number) => {
    if (!activeBoard) return;
    const updatedItems = activeBoard.items.map(i => i.id === itemId ? { ...i, x, y } : i);
    const updatedBoard = { ...activeBoard, items: updatedItems };
    setActiveBoard(updatedBoard);
    setBoards(boards.map(b => b.id === updatedBoard.id ? updatedBoard : b));
    await updatePrivateBoard(activeBoard.id, { items: updatedItems });
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!activeBoard) return;
    const updatedItems = activeBoard.items.filter(i => i.id !== itemId);
    const updatedBoard = { ...activeBoard, items: updatedItems };
    setActiveBoard(updatedBoard);
    setBoards(boards.map(b => b.id === updatedBoard.id ? updatedBoard : b));
    await updatePrivateBoard(activeBoard.id, { items: updatedItems });
  };

  if (isLoading) return <div className="p-20 text-center animate-pulse"><Pin className="mx-auto animate-spin mb-4" />Loading neural boards...</div>;

  return (
    <div className="flex h-full w-full">
      {/* Sidebar for boards list */}
      <div className={`w-64 border-r border-white/10 ${theme === 'LIGHT' ? 'bg-black/5' : 'bg-black/40'} p-6 flex flex-col`}>
        <h2 className="font-display font-black uppercase text-xl mb-6">Neural Boards</h2>
        
        <form onSubmit={handleCreateBoard} className="mb-6 flex">
          <input 
            type="text" 
            placeholder="New Board Name..." 
            value={newBoardName}
            onChange={e => setNewBoardName(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-l-lg px-3 py-2 text-xs focus:outline-none focus:border-small-orange"
          />
          <button type="submit" className="bg-small-orange text-white px-3 py-2 rounded-r-lg hover:brightness-110">
            <Plus size={14} />
          </button>
        </form>

        <div className="flex-1 overflow-y-auto space-y-2">
          {boards.map(b => (
            <button
              key={b.id}
              onClick={() => setActiveBoard(b)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeBoard?.id === b.id ? 'bg-small-orange text-white' : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'}`}
            >
              <h3 className="font-bold text-sm truncate">{b.name}</h3>
              <p className="text-[10px] opacity-60 uppercase">{b.items.length} Pins</p>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden bg-dot-pattern bg-[length:24px_24px] bg-white/[0.02]">
        {activeBoard ? (
          <div ref={boardRef} className="absolute inset-0 overflow-auto">
             {/* Render items on the board absolutely */}
             <div className="relative w-[3000px] h-[3000px]">
               {activeBoard.items.map(item => (
                 <motion.div
                   key={item.id}
                   drag
                   dragMomentum={false}
                   onDragStart={() => setDraggingItem(item.id)}
                   onDragEnd={(e, info) => {
                     setDraggingItem(null);
                     handleUpdateItemPosition(item.id, item.x + info.offset.x, item.y + info.offset.y);
                   }}
                   initial={{ x: item.x, y: item.y }}
                   className={`absolute cursor-grab active:cursor-grabbing ${draggingItem === item.id ? 'z-50 shadow-2xl scale-105' : 'z-10'} w-64 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4`}
                   style={{ left: item.x, top: item.y, touchAction: 'none' }}
                 >
                   <button onClick={() => handleRemoveItem(item.id)} className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white opacity-0 hover:opacity-100 transition-opacity"><X size={12}/></button>
                   {item.payload.imageUrl && <img src={item.payload.imageUrl} className="w-full h-32 object-cover rounded-lg mb-3" />}
                   <h4 className="font-bold text-sm uppercase truncate mb-1">{item.payload.title}</h4>
                   <p className="text-[10px] text-white/50">{item.payload.snippet || item.type}</p>
                 </motion.div>
               ))}
               {activeBoard.items.length === 0 && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center opacity-20 pointer-events-none">
                    <Pin size={64} className="mx-auto mb-4" />
                    <p className="text-xl font-black uppercase tracking-widest">Pin items to this board anywhere</p>
                 </div>
               )}
             </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center opacity-20 font-black uppercase tracking-[0.5em]">
             Create a board to start organizing
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivateBoardsView;
