import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import PageHeader from './PageHeader';
import { 
  Plus, 
  Map, 
  Users, 
  Scroll, 
  History, 
  Edit3, 
  Eye, 
  Globe, 
  Lock, 
  Unlock, 
  Sparkles, 
  LayoutGrid, 
  ArrowLeft,
  ChevronRight,
  BookOpen,
  Zap,
  Network,
  Box
} from 'lucide-react';
import { IPWorld, Character, LoreEntry, TimelineEvent, UserProfile, AppView, Video, Album } from '../types';
import { 
  fetchUserWorlds, 
  fetchWorldCharacters, 
  fetchWorldLore, 
  fetchWorldTimeline,
  publishWorld, 
  auth,
  updateIPWorld,
  fetchAllPublicAlbums,
  fetchUserVideos,
  fetchAllPublicWorlds,
  seedDemoWorld,
  seedDemoWorlds
} from '../services/backendService';
import WorldGraphView from './WorldGraphView';

interface WorldsViewProps {
  onNavigate: (view: AppView) => void;
  onEdit?: (world: IPWorld) => void;
  userProfile: UserProfile | null;
  artistUid: string;
}

const WorldsView: React.FC<WorldsViewProps> = ({ onNavigate, onEdit, userProfile, artistUid }) => {
  const [worlds, setWorlds] = useState<IPWorld[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<IPWorld | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [lore, setLore] = useState<LoreEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Characters' | 'Lore' | 'Timeline' | 'Store' | 'Graph'>('Overview');
  const [viewMode, setViewMode] = useState<'GALLERY' | 'DETAIL'>('GALLERY');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDiscoverMode, setIsDiscoverMode] = useState(false);

  const isOwner = auth.currentUser?.uid === artistUid;

  useEffect(() => {
    loadWorlds();
  }, [artistUid, isDiscoverMode]);

  const loadWorlds = async () => {
    setLoading(true);
    try {
      if (isDiscoverMode) {
        const publicWorlds = await fetchAllPublicWorlds();
        setWorlds(publicWorlds);
      } else {
        const allWorlds = await fetchUserWorlds(artistUid);
        // If not owner, only show published worlds
        const visibleWorlds = isOwner ? allWorlds : allWorlds.filter(w => w.status === 'PUBLISHED');
        setWorlds(visibleWorlds);
      }
    } catch (error) {
      console.error("Error loading worlds:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWorld && viewMode === 'DETAIL') {
      loadWorldContent(selectedWorld.id);
    }
  }, [selectedWorld, viewMode, isPreviewMode]);

  const loadWorldContent = async (worldId: string) => {
    // If owner and in preview mode, we want to see everything (drafts too)
    const onlyPublished = !isOwner || !isPreviewMode;
    const [chars, loreEntries, events, albums, videos] = await Promise.all([
      fetchWorldCharacters(worldId, onlyPublished),
      fetchWorldLore(worldId, onlyPublished),
      fetchWorldTimeline(worldId, onlyPublished),
      fetchAllPublicAlbums(),
      fetchUserVideos(artistUid)
    ]);
    setCharacters(chars);
    setLore(loreEntries);
    setTimeline(events);
    setUserAlbums(albums);
    setUserVideos(videos);
  };

  const handlePublishAll = async () => {
    if (!selectedWorld) return;
    setIsPublishing(true);
    try {
      await publishWorld(selectedWorld.id);
      // Refresh
      const updatedWorlds = await fetchUserWorlds(artistUid);
      const newSelected = updatedWorlds.find(w => w.id === selectedWorld.id);
      if (newSelected) setSelectedWorld(newSelected);
      setWorlds(isOwner ? updatedWorlds : updatedWorlds.filter(w => w.status === 'PUBLISHED'));
      await loadWorldContent(selectedWorld.id);
      alert("World and all assets published to live!");
    } catch (error) {
      console.error("Publish failed:", error);
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading && viewMode === 'GALLERY') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (viewMode === 'GALLERY') {
    return (
      <div className="space-y-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Globe className="text-small-orange" size={24} />
              <span className="text-xs font-black uppercase tracking-[0.5em] text-white/40">Architectural Archive</span>
            </div>
            <PageHeader>Worlds</PageHeader>
            <p className="text-white/40 text-xs font-black uppercase tracking-widest mt-6 max-w-2xl">{isDiscoverMode ? 'Discover universes from all architects.' : 'Explore projects from this architect.'}</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDiscoverMode(!isDiscoverMode)}
              className={`px-8 py-4 rounded-full font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-3 shadow-xl ${isDiscoverMode ? 'bg-primary text-white' : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'}`}
            >
              <Globe size={18} /> {isDiscoverMode ? 'Global Archive active' : 'View Global Archive'}
            </button>
            {isOwner && (
              <button 
                onClick={() => onNavigate('WORLD_MANAGER')}
                className="px-8 py-4 bg-small-orange text-black rounded-full font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform flex items-center justify-center gap-3 shadow-xl"
              >
                <Plus size={18} /> New World Project
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {worlds.map(world => (
            <motion.div
              key={world.id}
              whileHover={{ y: -10 }}
              onClick={() => { setSelectedWorld(world); setViewMode('DETAIL'); }}
              className="group relative aspect-[16/10] rounded-[2.5rem] overflow-hidden cursor-pointer bg-white/5 border border-white/10 hover:border-white/30 transition-all shadow-2xl"
            >
              <img 
                src={world.coverImage || `https://picsum.photos/seed/${world.id}/800/500`} 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 opacity-60 group-hover:opacity-100" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              
              <div className="absolute inset-x-0 bottom-0 p-8">
                <div className="flex items-center gap-3 mb-3">
                  {world.status === 'PUBLISHED' ? (
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 text-[8px] font-black uppercase tracking-widest rounded-full border border-green-500/20 flex items-center gap-1.5">
                      <Globe size={10} /> Live
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-white/10 text-white/40 text-[8px] font-black uppercase tracking-widest rounded-full border border-white/10 flex items-center gap-1.5">
                      <Lock size={10} /> Draft
                    </span>
                  )}
                  <span className="px-3 py-1 bg-white/10 text-white/60 text-[8px] font-black uppercase tracking-widest rounded-full border border-white/10">
                    {world.worldType}
                  </span>
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2 group-hover:text-small-orange transition-colors">{world.name}</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest line-clamp-2 leading-relaxed">{world.description}</p>
              </div>
            </motion.div>
          ))}

          {worlds.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem] bg-white/5">
              <Box size={48} className="text-white/5 mx-auto mb-4" />
              <p className="text-white/20 uppercase font-black tracking-[0.5em]">No Worlds created yet.</p>
              {isOwner && (
                <div className="flex flex-col items-center gap-4 mt-8">
                  <button 
                    onClick={() => onNavigate('WORLD_MANAGER')}
                    className="px-10 py-5 bg-white text-black hover:bg-small-orange hover:text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] transition-all shadow-2xl shadow-white/5"
                  >
                    Architect your first world
                  </button>
                  <button 
                    onClick={async () => {
                      if (auth.currentUser) {
                        await seedDemoWorlds();
                        loadWorlds();
                      }
                    }}
                    className="text-white/20 hover:text-primary uppercase font-black text-[8px] tracking-[0.4em] transition-all"
                  >
                    Or Initialize Demo Universe
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const bgStyle = selectedWorld?.themeConfig.customBackgroundImage
    ? { backgroundImage: `url(${selectedWorld.themeConfig.customBackgroundImage})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' }
    : {};

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen relative" style={bgStyle}>
       {/* Overlays */}
       {selectedWorld?.themeConfig.useFrostedGlassDefault !== false ? (
        <div className="absolute inset-0 bg-theme/60 backdrop-blur-3xl -z-10" />
      ) : (
        <div className="absolute inset-0 bg-theme/80 -z-10" />
      )}

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
        {/* Detail Header Actions */}
        <div className="flex items-center justify-between mb-8 relative z-10">
          <button 
            onClick={() => { setViewMode('GALLERY'); setSelectedWorld(null); }} 
            className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-all border border-white/10"
          >
            <ArrowLeft size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Back to Library</span>
          </button>

          {isOwner && (
            <div className="flex items-center gap-4">
              <div className="p-1 bg-black/40 border border-white/10 rounded-full flex gap-1">
                <button 
                  onClick={() => setIsPreviewMode(false)}
                  className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${!isPreviewMode ? 'bg-green-500 text-white' : 'text-white/40 hover:text-white'}`}
                >
                  <Globe size={12} className="inline mr-1" /> Published Mode
                </button>
                <button 
                  onClick={() => setIsPreviewMode(true)}
                  className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${isPreviewMode ? 'bg-small-orange text-black' : 'text-white/40 hover:text-white'}`}
                >
                  <Eye size={12} className="inline mr-1" /> Preview Mode
                </button>
              </div>

              <button 
                onClick={() => onEdit?.(selectedWorld!)}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-full font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 border border-white/10"
              >
                <Edit3 size={14} /> Edit Architecture
              </button>

              <button 
                onClick={handlePublishAll}
                disabled={isPublishing}
                className="px-6 py-3 bg-white text-black hover:bg-small-orange hover:text-white rounded-full font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 shadow-xl disabled:opacity-50"
              >
                {isPublishing ? '...' : <><Unlock size={14} /> Publish Everything</>}
              </button>
            </div>
          )}
        </div>

        {/* Hero Section */}
        <div className="relative h-[25rem] rounded-[4rem] overflow-hidden shadow-2xl mb-12 group/hero">
          <img src={selectedWorld?.coverImage || null} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col justify-end p-12">
            <div className="flex items-center gap-4 mb-4">
              <span className="px-4 py-2 bg-small-orange/20 text-small-orange text-[10px] font-black uppercase tracking-widest rounded-full border border-small-orange/20 backdrop-blur-md">
                World Source Code Active
              </span>
              {selectedWorld?.status === 'DRAFT' && isOwner && (
                <span className="px-4 py-2 bg-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest rounded-full border border-white/10 backdrop-blur-md">
                  Internal Draft
                </span>
              )}
            </div>
            <PageHeader>{selectedWorld?.name}</PageHeader>
            <p className="text-white/60 text-lg lg:text-xl font-medium max-w-2xl leading-relaxed">
              {selectedWorld?.description}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto gap-4 mb-12 no-scrollbar">
          {[
            { id: 'Overview', icon: LayoutGrid },
            { id: 'Characters', icon: Users },
            { id: 'Lore', icon: Scroll },
            { id: 'Timeline', icon: History },
            { id: 'Graph', icon: Network }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-8 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center gap-3 whitespace-nowrap shadow-xl ${activeTab === tab.id ? 'bg-small-orange text-black' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'}`}
            >
              <tab.icon size={16} />
              {tab.id}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[3rem] p-12 min-h-[500px]"
          >
            {activeTab === 'Overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                <div className="space-y-8">
                  <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                    <Sparkles className="text-small-orange" size={24} />
                    Infinite Narrative
                  </h3>
                  <p className="text-white/60 font-medium leading-loose text-lg">
                    This world is a living, breathing entity. Every update adds new layers to the lore, characters, and story arcs. 
                    {selectedWorld?.status === 'PUBLISHED' ? ' Access the full experience below.' : ' Currently under development.'}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                      <p className="text-3xl font-black mb-1 text-white">{characters.length}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Cast Members</p>
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                      <p className="text-3xl font-black mb-1 text-white">{lore.length}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Lore Entries</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Recent Activity</h4>
                   <div className="space-y-4">
                     {[...characters, ...lore, ...timeline].slice(0, 3).map((item: any, i) => (
                       <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                         <div className="w-10 h-10 bg-small-orange/20 rounded-xl flex items-center justify-center text-small-orange">
                            {item.name ? <Users size={16} /> : <Scroll size={16} />}
                         </div>
                         <div>
                            <p className="text-xs font-black uppercase tracking-widest text-white">{item.name || item.title}</p>
                            <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{item.role || item.type || 'Event'}</p>
                         </div>
                       </div>
                     ))}
                   </div>
                </div>
              </div>
            )}

            {activeTab === 'Characters' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {characters.map(char => (
                  <motion.div 
                    key={char.id} 
                    whileHover={{ scale: 1.05 }}
                    className="group bg-white/5 border border-white/10 rounded-[2.5rem] p-6 hover:bg-white/10 transition-all shadow-2xl relative overflow-hidden"
                  >
                    {!char.isPublished && isOwner && (
                      <div className="absolute top-4 right-4 px-2 py-1 bg-white/10 rounded-lg text-[7px] font-black uppercase tracking-widest text-white/30 border border-white/10">
                        Draft
                      </div>
                    )}
                    <div className="flex items-center gap-6 mb-6">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/10 shadow-xl group-hover:border-small-orange/50 transition-colors shrink-0">
                        <img src={char.imageUrl || `https://picsum.photos/seed/${char.id}/200/200`} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-black uppercase tracking-tight text-white truncate group-hover:text-small-orange transition-colors">{char.name}</h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{char.role}</p>
                      </div>
                    </div>
                    <p className="text-xs text-white/60 font-medium leading-relaxed italic mb-6">"{char.bio}"</p>
                    <div className="flex flex-wrap gap-2">
                       {char.tags.map(tag => (
                         <span key={tag} className="px-3 py-1 bg-white/5 text-white/30 text-[8px] font-black uppercase tracking-widest rounded-full border border-white/5">
                           #{tag}
                         </span>
                       ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {activeTab === 'Lore' && (
              <div className="space-y-8">
                {lore.map(entry => (
                  <div key={entry.id} className="p-8 bg-white/5 border border-white/10 rounded-[3rem] hover:bg-white/[0.08] transition-all relative overflow-hidden group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-small-orange/20 rounded-2xl flex items-center justify-center text-small-orange group-hover:bg-small-orange group-hover:text-black transition-all">
                          <Scroll size={20} />
                        </div>
                        <div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-white">{entry.title}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black uppercase tracking-widest text-white/40">{entry.type}</span>
                            {!entry.isPublished && isOwner && (
                              <span className="text-[8px] font-black uppercase tracking-widest text-small-orange/50">• Draft</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {entry.tags.map(tag => (
                          <span key={tag} className="px-3 py-1 bg-white/5 text-white/30 text-[8px] font-black uppercase tracking-widest rounded-full border border-white/5">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-white/70 font-medium leading-loose whitespace-pre-wrap pl-16">
                      {entry.content}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'Timeline' && (
              <div className="relative py-12">
                {selectedWorld?.timelineConfig && (
                   <div className="mb-16 p-8 bg-white/5 border border-white/10 rounded-[2.5rem]">
                      <div className="flex items-center justify-between mb-8">
                         <div>
                            <h4 className="text-xl font-black uppercase tracking-tight italic">Temporal Range</h4>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Chronological boundaries for this universe</p>
                         </div>
                         <div className="text-right">
                            <span className="text-3xl font-black text-small-orange">
                               {selectedWorld.timelineConfig.startYear} - {selectedWorld.timelineConfig.endYear}
                            </span>
                            <span className="ml-2 text-[10px] font-black uppercase text-white/20">{selectedWorld.timelineConfig.unitName}</span>
                         </div>
                      </div>
                      
                      {/* Interactive Timeline Bar */}
                      <div className="relative h-4 bg-white/5 rounded-full overflow-hidden border border-white/5">
                         {timeline.map(event => {
                           const start = selectedWorld.timelineConfig?.startYear || 0;
                           const end = selectedWorld.timelineConfig?.endYear || 1000;
                           const range = end - start;
                           const left = ((event.year - start) / range) * 100;
                           return (
                             <motion.div 
                               key={event.id}
                               initial={{ scaleY: 0 }}
                               animate={{ scaleY: 1 }}
                               className="absolute top-0 bottom-0 w-1 bg-small-orange shadow-[0_0_10px_rgba(255,140,0,0.5)]"
                               style={{ left: `${left}%` }}
                             />
                           );
                         })}
                      </div>
                   </div>
                )}

                <div className="absolute left-1/2 top-48 bottom-0 w-px bg-white/10 -translate-x-1/2 hidden md:block" />
                
                <div className="space-y-24 mt-12">
                  {timeline.sort((a, b) => (a.year || 0) - (b.year || 0)).map((event, i) => (
                    <motion.div 
                      key={event.id}
                      initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      className={`flex flex-col md:flex-row items-center justify-center gap-8 ${i % 2 === 0 ? 'md:flex-row-reverse md:text-right' : 'md:flex-row md:text-left'}`}
                    >
                      <div className="flex-1 max-w-sm w-full">
                        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.4em] text-small-orange/50">
                           {event.year} {selectedWorld?.timelineConfig?.unitName || 'Years'}
                        </div>
                        <h4 className="text-2xl font-black uppercase tracking-tight mb-3 text-white group-hover:text-small-orange transition-colors">{event.title}</h4>
                        <p className="text-sm text-white/50 font-medium leading-relaxed italic">"{event.description}"</p>
                        
                        {(event.linkedCharacterIds?.length || 0) > 0 && (
                          <div className={`flex flex-wrap gap-2 mt-4 ${i % 2 === 0 ? 'md:justify-end' : 'md:justify-start'}`}>
                            {event.linkedCharacterIds?.map(id => {
                              const char = characters.find(c => c.id === id);
                              return char ? (
                                <span key={id} className="px-2 py-1 bg-white/5 rounded-lg text-[8px] font-black uppercase tracking-widest text-white/40 border border-white/10">
                                   {char.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                      <div className="relative z-10 w-4 h-4 bg-small-orange rounded-full shadow-[0_0_20px_rgba(255,140,0,0.8)] border-4 border-black hidden md:block" />
                      <div className="flex-1 w-full flex md:block">
                         <div className="px-8 py-5 bg-white/5 border border-white/10 rounded-[2rem] inline-block hover:bg-white/10 transition-all cursor-pointer group">
                           <div className="flex items-center gap-3">
                              <Zap size={16} className="text-small-orange opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 group-hover:text-white transition-colors">Jump Into Point</p>
                           </div>
                         </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'Graph' && selectedWorld && (
              <div className="h-[700px] w-full rounded-[3rem] overflow-hidden border border-white/10 relative">
                 <div className="absolute top-8 left-8 z-10 pointer-events-none">
                    <h4 className="text-xl font-black uppercase tracking-tight italic text-white flex items-center gap-3">
                       <Network className="text-small-orange" size={24} />
                       Neural Topology
                    </h4>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Visualizing high-fidelity connections within this universe</p>
                 </div>
                 <WorldGraphView 
                   world={selectedWorld}
                   characters={characters}
                   loreEntries={lore}
                   timelineEvents={timeline}
                   albums={userAlbums}
                   videos={userVideos}
                   isEmbedded={true}
                 />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default WorldsView;
