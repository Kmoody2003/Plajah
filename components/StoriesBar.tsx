import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Camera } from 'lucide-react';
import { Story } from '../types';
import { listenToFollowedStories, listenToUserStories } from '../services/backendService';
import StoryViewer from './StoryViewer';
import StoryCreator from './StoryCreator';

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  followedUids: string[];
  onVisitUser?: (uid: string) => void;
}

interface StoryGroup {
  uid: string;
  name: string;
  photo?: string;
  stories: Story[];
  hasUnviewed: boolean;
}

const StoriesBar: React.FC<Props> = ({ currentUserId, currentUserName, currentUserPhoto, followedUids, onVisitUser }) => {
  const [myStories, setMyStories]       = useState<Story[]>([]);
  const [feedStories, setFeedStories]   = useState<Story[]>([]);
  const [viewingGroup, setViewingGroup] = useState<StoryGroup | null>(null);
  const [creating, setCreating]         = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => listenToUserStories(currentUserId, setMyStories), [currentUserId]);
  useEffect(() => listenToFollowedStories(followedUids, setFeedStories), [followedUids.join(',')]);

  const groups: StoryGroup[] = React.useMemo(() => {
    const map = new Map<string, Story[]>();
    feedStories.forEach(s => {
      const arr = map.get(s.ownerId) ?? [];
      arr.push(s);
      map.set(s.ownerId, arr);
    });
    return Array.from(map.entries()).map(([uid, stories]) => ({
      uid,
      name: stories[0].ownerName,
      photo: stories[0].ownerPhoto,
      stories: stories.sort((a, b) => a.timestamp - b.timestamp),
      hasUnviewed: stories.some(s => !s.viewerIds?.includes(currentUserId)),
    }));
  }, [feedStories, currentUserId]);

  return (
    <>
      <div className="relative w-full overflow-hidden">
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto no-scrollbar px-4 py-3">
          {/* My story bubble */}
          <div className="flex flex-col items-center gap-1.5 shrink-0" onClick={() => myStories.length > 0 ? setViewingGroup({ uid: currentUserId, name: 'Your Story', photo: currentUserPhoto, stories: myStories, hasUnviewed: false }) : setCreating(true)}>
            <div className="relative cursor-pointer">
              <div className={`w-16 h-16 rounded-full p-[2px] ${myStories.length > 0 ? 'bg-gradient-to-tr from-small-orange via-pink-500 to-purple-600' : 'bg-white/10'}`}>
                <div className="w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center">
                  {currentUserPhoto
                    ? <img loading="lazy" decoding="async" src={currentUserPhoto} className="w-full h-full object-cover" alt="" />
                    : <Camera size={22} className="text-white/40" />
                  }
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-small-orange rounded-full border-2 border-black flex items-center justify-center">
                <Plus size={10} className="text-white" strokeWidth={3} />
              </div>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/50 truncate max-w-[60px] text-center">
              {myStories.length > 0 ? 'Your Story' : 'Add Story'}
            </span>
          </div>

          {/* Followed story bubbles */}
          {groups.map(g => (
            <div key={g.uid} className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer" onClick={() => setViewingGroup(g)}>
              <motion.div whileTap={{ scale: 0.92 }} className={`w-16 h-16 rounded-full p-[2.5px] ${g.hasUnviewed ? 'bg-gradient-to-tr from-small-orange via-pink-500 to-purple-600' : 'bg-white/20'}`}>
                <div className="w-full h-full rounded-full overflow-hidden bg-[#111] border-[2px] border-black">
                  {g.photo
                    ? <img loading="lazy" decoding="async" src={g.photo} className="w-full h-full object-cover" alt={g.name} />
                    : <div className="w-full h-full flex items-center justify-center text-white font-black text-xl">{g.name[0]}</div>
                  }
                </div>
              </motion.div>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/50 truncate max-w-[60px] text-center">{g.name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black to-transparent" />
      </div>

      <AnimatePresence>
        {viewingGroup && (
          <StoryViewer
            group={viewingGroup}
            currentUserId={currentUserId}
            onClose={() => setViewingGroup(null)}
            onVisitUser={onVisitUser}
          />
        )}
        {creating && (
          <StoryCreator
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserPhoto={currentUserPhoto}
            onClose={() => setCreating(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default StoriesBar;
