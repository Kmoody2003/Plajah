import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Save, 
  Upload, 
  Palette, 
  Globe, 
  Box, 
  Users, 
  Scroll, 
  Tv, 
  Unlock, 
  X, 
  Check, 
  Eye, 
  DraftingCompass,
  Zap,
  Clock,
  Share2,
  Trash2,
  ChevronRight,
  Database,
  Link as LinkIcon,
  Network
} from 'lucide-react';
import { IPWorld, Character, LoreEntry, TimelineEvent, Album, Video, GraphNodeConnection } from '../types';
import { 
  fetchWorldCharacters, 
  fetchWorldLore, 
  updateCharacter, 
  updateLore,
  createCharacter,
  createLore,
  publishWorld,
  fetchUserVideos,
  fetchUserWorlds,
  fetchWorldTimeline,
  fetchAllPublicAlbums,
  auth,
  updateTimelineEvent,
  createTimelineEvent
} from '../services/backendService';
import WorldGraphView from './WorldGraphView';

export interface WorldManagerViewProps {
  initialWorld?: IPWorld;
  onSave: (world: Partial<IPWorld>) => void;
  onPreview?: (world: IPWorld) => void;
}

const WorldManagerView: React.FC<WorldManagerViewProps> = ({ initialWorld, onSave, onPreview }) => {
  const [world, setWorld] = useState<Partial<IPWorld>>(initialWorld || {
    name: '',
    description: '',
    coverImage: '',
    status: 'DRAFT',
    themeConfig: {
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      backgroundId: '',
      customBackgroundImage: '',
      useFrostedGlassDefault: true
    },
    timelineConfig: { startYear: 0, endYear: 2000, unitName: 'Years' },
    graphConnections: [],
    assetIds: [],
    characterIds: [],
    loreIds: [],
    timelineIds: []
  });

  const [characters, setCharacters] = useState<Character[]>([]);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [userWorlds, setUserWorlds] = useState<IPWorld[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'IDENTITY' | 'CONTENT' | 'TIMELINE' | 'CONNECTIONS' | 'ASSETS'>('IDENTITY');
  const [activeEditor, setActiveEditor] = useState<{ type: 'CHARACTER' | 'LORE' | 'TIMELINE' | 'CONNECTION', item?: any } | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  useEffect(() => {
    if (initialWorld?.id) {
      loadContent(initialWorld.id);
    }
    loadUserData();
  }, [initialWorld?.id]);

  const loadUserData = async () => {
    if (!auth.currentUser) return;
    try {
      const [albums, videos, worlds] = await Promise.all([
        fetchAllPublicAlbums(), // Simplified for now
        fetchUserVideos(auth.currentUser.uid),
        fetchUserWorlds(auth.currentUser.uid)
      ]);
      setUserAlbums(albums.filter(a => a.artist === auth.currentUser?.email)); // Using email as proxy for artist if artistUid is missing
      setUserVideos(videos);
      setUserWorlds(worlds.filter(w => w.id !== world.id)); // Exclude current world
    } catch (e) {
      console.error(e);
    }
  };

  const loadContent = async (id: string) => {
    setLoading(true);
    try {
      const [chars, lore, timeline] = await Promise.all([
        fetchWorldCharacters(id, false),
        fetchWorldLore(id, false),
        fetchWorldTimeline(id, false)
      ]);
      setCharacters(chars);
      setLoreEntries(lore);
      setTimelineEvents(timeline);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEditor = async (data: any) => {
    if (!world.id) return;
    try {
      if (activeEditor?.type === 'CHARACTER') {
        if (data.id) {
          await updateCharacter(data.id, data);
        } else {
          await createCharacter({ ...data, worldId: world.id });
        }
      } else if (activeEditor?.type === 'LORE') {
        if (data.id) {
          await updateLore(data.id, data);
        } else {
          await createLore({ ...data, worldId: world.id });
        }
      } else if (activeEditor?.type === 'TIMELINE') {
        if (data.id) {
          await updateTimelineEvent(data.id, data);
        } else {
          await createTimelineEvent({ ...data, worldId: world.id });
        }
      } else if (activeEditor?.type === 'CONNECTION') {
        const newConns = [...(world.graphConnections || [])];
        if (activeEditor.item) {
          const idx = newConns.findIndex(c => c === activeEditor.item);
          newConns[idx] = data;
        } else {
          newConns.push(data);
        }
        setWorld({ ...world, graphConnections: newConns });
      }
      setActiveEditor(null);
      loadContent(world.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePublishAllLocal = async () => {
    if (!world.id) return;
    setLoading(true);
    try {
      await publishWorld(world.id);
      onSave({ ...world, status: 'PUBLISHED' });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto text-white pb-32 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-widest text-primary italic leading-none mb-2">World Architecture</h2>
          <p className="text-xs font-bold text-white/30 uppercase tracking-[0.2em]">Ongoing Interactive Project Manager</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-full">
             <div className={`w-2 h-2 rounded-full ${world.status === 'PUBLISHED' ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-small-orange animate-pulse shadow-[0_0_10px_#ff8c00]'}`} />
             <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{world.status}</span>
          </div>
          {world.id && onPreview && (
            <button 
              onClick={() => onPreview(world as IPWorld)}
              className="px-6 py-3 bg-white/10 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white text-black transition-all flex items-center gap-2"
            >
              <Eye size={14} /> Preview
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-8 overflow-x-auto no-scrollbar pb-2">
        <TabButton active={activeTab === 'IDENTITY'} onClick={() => setActiveTab('IDENTITY')} icon={<Palette size={14} />} label="Identity" />
        <TabButton active={activeTab === 'CONTENT'} onClick={() => setActiveTab('CONTENT')} icon={<Scroll size={14} />} label="Inhabitants & Lore" />
        <TabButton active={activeTab === 'TIMELINE'} onClick={() => setActiveTab('TIMELINE')} icon={<Clock size={14} />} label="Chronicle Timeline" />
        <TabButton active={activeTab === 'CONNECTIONS'} onClick={() => setActiveTab('CONNECTIONS')} icon={<Share2 size={14} />} label="Node Topology" />
        <TabButton active={activeTab === 'ASSETS'} onClick={() => setActiveTab('ASSETS')} icon={<Database size={14} />} label="Asset Integration" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {activeTab === 'IDENTITY' && (
              <motion.div 
                key="identity"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <section className="glass p-8 rounded-[2.5rem] border border-white/10">
                  <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3 mb-8">
                    <Palette className="text-primary" size={20} />
                    Identity Core
                  </h3>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Appellation</label>
                        <input 
                          type="text" 
                          placeholder="E.g. Neo-Victorian Shadows" 
                          value={world.name}
                          className="w-full bg-black/40 p-5 rounded-2xl border border-white/10 focus:border-primary transition-all text-sm font-bold"
                          onChange={e => setWorld({...world, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">World Ontology</label>
                        <select 
                          className="w-full bg-black/40 p-5 rounded-2xl border border-white/10 text-white/60 text-sm font-bold"
                          value={world.worldType || 'FICTION'}
                          onChange={e => setWorld({...world, worldType: e.target.value as any})}
                        >
                          <option value="FICTION">Fictional Narrative</option>
                          <option value="NON_FICTION">Documentary / Academic</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Nested Origins (Parent World)</label>
                        <select 
                          className="w-full bg-black/40 p-5 rounded-2xl border border-white/10 text-white/60 text-sm font-bold"
                          value={world.parentWorldId || ''}
                          onChange={e => setWorld({...world, parentWorldId: e.target.value})}
                        >
                          <option value="">None (Root World)</option>
                          {userWorlds.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Timeline Range (Start - End {world.timelineConfig?.unitName})</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="number"
                            value={world.timelineConfig?.startYear}
                            className="bg-black/40 p-5 rounded-2xl border border-white/10 text-sm"
                            onChange={e => setWorld({...world, timelineConfig: { ...world.timelineConfig!, startYear: parseInt(e.target.value) }})}
                          />
                          <input 
                            type="number"
                            value={world.timelineConfig?.endYear}
                            className="bg-black/40 p-5 rounded-2xl border border-white/10 text-sm"
                            onChange={e => setWorld({...world, timelineConfig: { ...world.timelineConfig!, endYear: parseInt(e.target.value) }})}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Aesthetic Manifest (Cover Image)</label>
                      <input 
                        type="text" 
                        placeholder="https://images.unsplash.com/..." 
                        value={world.coverImage}
                        className="w-full bg-black/40 p-5 rounded-2xl border border-white/10 text-sm"
                        onChange={e => setWorld({...world, coverImage: e.target.value})}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Chronicle Summary (Lore)</label>
                      <textarea 
                        placeholder="The foundational truth of your universe..." 
                        value={world.description}
                        className="w-full bg-black/40 p-5 rounded-2xl border border-white/10 h-40 text-sm leading-relaxed"
                        onChange={e => setWorld({...world, description: e.target.value})}
                      />
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'CONTENT' && (
              <motion.div 
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8"
              >
                <section className="glass p-8 rounded-[2rem] border border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-black uppercase tracking-tight italic flex items-center gap-3">
                      <Users className="text-primary" size={20} />
                      Cast (Characters)
                    </h3>
                    <button 
                      onClick={() => setActiveEditor({ type: 'CHARACTER' })}
                      className="p-2 bg-white/5 border border-white/10 rounded-full text-primary hover:scale-110 transition-all"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {characters.map(char => (
                      <div 
                        key={char.id} 
                        className="group flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-white/20 transition-all cursor-pointer"
                        onClick={() => setActiveEditor({ type: 'CHARACTER', item: char })}
                      >
                        <div className="flex items-center gap-3">
                          <img src={char.imageUrl || null} className="w-10 h-10 rounded-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight">{char.name}</p>
                            <p className="text-[8px] font-bold opacity-40 uppercase tracking-widest">{char.role}</p>
                          </div>
                        </div>
                        <ChevronRight size={14} className="opacity-20" />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="glass p-8 rounded-[2rem] border border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-black uppercase tracking-tight italic flex items-center gap-3">
                      <Scroll className="text-primary" size={20} />
                      Archives (Lore)
                    </h3>
                    <button 
                      onClick={() => setActiveEditor({ type: 'LORE' })}
                      className="p-2 bg-white/5 border border-white/10 rounded-full text-primary hover:scale-110 transition-all"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {loreEntries.map(lore => (
                      <div 
                        key={lore.id} 
                        className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-white/20 transition-all cursor-pointer"
                        onClick={() => setActiveEditor({ type: 'LORE', item: lore })}
                      >
                        <div>
                          <p className="text-xs font-black uppercase tracking-tight">{lore.title}</p>
                          <p className="text-[8px] font-bold opacity-40 uppercase tracking-widest">{lore.type}</p>
                        </div>
                        <ChevronRight size={14} className="opacity-20" />
                      </div>
                    ))}
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'TIMELINE' && (
              <motion.div 
                key="timeline"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <section className="glass p-8 rounded-[2.5rem] border border-white/10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3">
                      <Clock className="text-primary" size={20} />
                      Nexus Events
                    </h3>
                    <button 
                      onClick={() => setActiveEditor({ type: 'TIMELINE' })}
                      className="px-6 py-3 bg-primary rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2"
                    >
                      <Plus size={14} /> Add Nexus Point
                    </button>
                  </div>

                  <div className="relative pl-12 space-y-12 before:content-[''] before:absolute before:left-5 before:top-4 before:bottom-4 before:w-px before:bg-white/10">
                    {timelineEvents
                      .sort((a, b) => a.year - b.year)
                      .map(event => (
                        <div key={event.id} className="relative cursor-pointer" onClick={() => setActiveEditor({ type: 'TIMELINE', item: event })}>
                          <div className="absolute -left-12 top-0 w-10 h-10 bg-[#111] border border-white/10 rounded-full flex items-center justify-center z-10">
                            <div className="w-2 h-2 bg-primary rounded-full" />
                          </div>
                          <div className="glass p-6 rounded-2xl border border-white/5 hover:border-white/20 transition-all">
                             <div className="flex items-center justify-between mb-2">
                               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{event.year} {world.timelineConfig?.unitName}</span>
                               <span className="text-[8px] font-bold opacity-20 uppercase tracking-widest">#{event.id.slice(-4)}</span>
                             </div>
                             <h4 className="text-sm font-black uppercase tracking-tight mb-2">{event.title}</h4>
                             <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{event.description}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'CONNECTIONS' && (
              <motion.div 
                key="connections"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <section className="glass p-8 rounded-[2.5rem] border border-white/10">
                   <div className="flex items-center justify-between mb-8">
                     <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3">
                       <Share2 className="text-primary" size={20} />
                       Node Relationships
                     </h3>
                     <button 
                       onClick={() => setActiveEditor({ type: 'CONNECTION' })}
                       className="px-6 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                     >
                       <Plus size={14} /> New Connection
                     </button>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {world.graphConnections?.map((conn, idx) => (
                       <div key={idx} className="glass p-5 rounded-2xl border border-white/5 flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/5 rounded-xl"><Zap size={14} className="text-primary" /></div>
                            <div>
                               <p className="text-[10px] font-black uppercase tracking-tight italic">{conn.relationshipType}</p>
                               <p className="text-[8px] font-bold opacity-30 uppercase tracking-widest">{conn.sourceType} → {conn.targetType}</p>
                            </div>
                         </div>
                         <button 
                           onClick={() => {
                             const newConns = [...(world.graphConnections || [])];
                             newConns.splice(idx, 1);
                             setWorld({ ...world, graphConnections: newConns });
                           }}
                           className="p-2 hover:bg-red-500/10 text-white/20 hover:text-red-500 rounded-lg transition-all"
                         >
                           <Trash2 size={14} />
                         </button>
                       </div>
                     ))}
                   </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'ASSETS' && (
               <motion.div 
                 key="assets"
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -10 }}
                 className="space-y-8"
               >
                 <section className="glass p-8 rounded-[2.5rem] border border-white/10">
                    <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3 mb-8">
                      <Database className="text-primary" size={20} />
                      Connected multimedia
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Link Albums</label>
                        <div className="space-y-2">
                           {userAlbums.map(album => (
                             <button 
                               key={album.id}
                               onClick={() => {
                                 const ids = [...(world.assetIds || [])];
                                 if (ids.includes(album.id)) {
                                   setWorld({ ...world, assetIds: ids.filter(i => i !== album.id) });
                                 } else {
                                   setWorld({ ...world, assetIds: [...ids, album.id] });
                                 }
                               }}
                               className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${world.assetIds?.includes(album.id) ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'}`}
                             >
                                <span className="text-xs font-bold">{album.title}</span>
                                {world.assetIds?.includes(album.id) ? <Check size={14} className="text-primary" /> : <Plus size={14} className="opacity-20" />}
                             </button>
                           ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Link Videos</label>
                        <div className="space-y-2">
                           {userVideos.map(video => (
                             <button 
                               key={video.id}
                               onClick={() => {
                                 const ids = [...(world.assetIds || [])];
                                 if (ids.includes(video.id)) {
                                   setWorld({ ...world, assetIds: ids.filter(i => i !== video.id) });
                                 } else {
                                   setWorld({ ...world, assetIds: [...ids, video.id] });
                                 }
                               }}
                               className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${world.assetIds?.includes(video.id) ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'}`}
                             >
                                <span className="text-xs font-bold">{video.title}</span>
                                {world.assetIds?.includes(video.id) ? <Check size={14} className="text-primary" /> : <Plus size={14} className="opacity-20" />}
                             </button>
                           ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-8 space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Link Other Worlds</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                           {userWorlds.filter(w => w.id !== world.id).map(w => (
                             <button 
                               key={w.id}
                               onClick={() => {
                                 const ids = [...(world.assetIds || [])];
                                 if (ids.includes(w.id)) {
                                   setWorld({ ...world, assetIds: ids.filter(i => i !== w.id) });
                                 } else {
                                   setWorld({ ...world, assetIds: [...ids, w.id] });
                                 }
                               }}
                               className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${world.assetIds?.includes(w.id) ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'}`}
                             >
                                <span className="text-xs font-bold">{w.name}</span>
                                {world.assetIds?.includes(w.id) ? <Check size={14} className="text-primary" /> : <Plus size={14} className="opacity-20" />}
                             </button>
                           ))}
                        </div>
                      </div>
                 </section>
               </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-8">
          <section className="glass p-8 rounded-[2.5rem] border border-white/10">
            <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3 mb-8">
              <Zap className="text-primary" size={20} />
              Deployment Control
            </h3>
            <div className="space-y-4">
              <button 
                onClick={() => setShowGraph(true)}
                className="w-full flex items-center justify-center gap-3 bg-primary/20 border border-primary/30 px-8 py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-primary/30 transition-all text-primary font-sans mb-4"
              >
                <Network size={18} /> Visualize Topology
              </button>
              <button 
                onClick={() => onSave({...world, status: 'DRAFT'})}
                className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 px-8 py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all font-sans"
              >
                <Save size={18} /> Sync Local Snapshot
              </button>
              <button 
                onClick={handlePublishAllLocal}
                className="w-full flex items-center justify-center gap-3 bg-primary px-8 py-6 rounded-2xl font-black uppercase tracking-widest text-[11px] text-white hover:scale-105 transition-all shadow-2xl shadow-primary/20 font-sans"
              >
                <Unlock size={18} /> Global Deployment
              </button>
            </div>
          </section>

          <section className="glass p-8 rounded-[2.5rem] border border-white/10">
            <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3 mb-8">
              <Box className="text-primary" size={20} />
              Thematic Engine
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Atmospheric Filter</label>
                <input 
                  type="text" 
                  placeholder="Atmosphere Image URL" 
                  value={world.themeConfig?.customBackgroundImage || ''}
                  className="w-full bg-black/40 p-4 rounded-xl border border-white/10 text-xs"
                  onChange={e => setWorld({
                    ...world, 
                    themeConfig: { 
                      ...world.themeConfig!, 
                      customBackgroundImage: e.target.value 
                    }
                  })}
                />
              </div>
              <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                <input 
                  type="checkbox" 
                  checked={world.themeConfig?.useFrostedGlassDefault !== false}
                  onChange={e => setWorld({
                    ...world, 
                    themeConfig: { 
                      ...world.themeConfig!, 
                      useFrostedGlassDefault: e.target.checked 
                    }
                  })}
                  className="w-5 h-5 rounded border-white/20 bg-black/50 accent-primary"
                />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Frosted UI Overlay</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {showGraph && (
          <WorldGraphView 
            world={world as IPWorld}
            characters={characters}
            loreEntries={loreEntries}
            timelineEvents={timelineEvents}
            albums={userAlbums}
            videos={userVideos}
            onClose={() => setShowGraph(false)}
          />
        )}
      </AnimatePresence>

      {/* Editor Modal */}
      <AnimatePresence>
        {activeEditor && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl overflow-y-auto pt-24 pb-24">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[3rem] overflow-hidden shadow-3xl my-auto"
             >
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                  <h4 className="text-2xl font-black uppercase tracking-tight italic">
                    {activeEditor.item ? `Refine ${activeEditor.type}` : `New ${activeEditor.type}`}
                  </h4>
                  <button onClick={() => setActiveEditor(null)} className="p-4 hover:bg-white/5 rounded-full transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">
                   {activeEditor.type === 'CHARACTER' && (
                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Inhabitant Appellation</label>
                           <input 
                             type="text"
                             placeholder="E.g. Aelous"
                             defaultValue={activeEditor.item?.name}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 text-lg font-black uppercase tracking-tight"
                             id="char-name"
                           />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Arch-Role</label>
                              <input 
                                type="text"
                                placeholder="E.g. Sage"
                                defaultValue={activeEditor.item?.role}
                                className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-sm"
                                id="char-role"
                              />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Visual Descriptor (URL)</label>
                              <input 
                                type="text"
                                placeholder="Image URL"
                                defaultValue={activeEditor.item?.imageUrl}
                                className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-sm"
                                id="char-img"
                              />
                           </div>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Existential Bio</label>
                           <textarea 
                             placeholder="The essence of this being..."
                             defaultValue={activeEditor.item?.bio}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 h-32 text-sm leading-relaxed"
                             id="char-bio"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Primary Stats (Key: Value strings)</label>
                           <textarea 
                             placeholder='E.g. strength: 10, agility: 15'
                             defaultValue={activeEditor.item?.stats ? Object.entries(activeEditor.item.stats).map(([k,v]) => `${k}: ${v}`).join(', ') : ''}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 h-20 text-xs font-mono"
                             id="char-stats"
                           />
                        </div>
                        <button 
                          onClick={() => {
                            const statsRaw = (document.getElementById('char-stats') as HTMLTextAreaElement).value;
                            const stats: Record<string, any> = {};
                            statsRaw.split(',').forEach(pair => {
                              const [k, v] = pair.split(':').map(s => s.trim());
                              if (k && v) stats[k] = isNaN(Number(v)) ? v : Number(v);
                            });

                            const data = {
                              id: activeEditor.item?.id,
                              name: (document.getElementById('char-name') as HTMLInputElement).value,
                              role: (document.getElementById('char-role') as HTMLInputElement).value,
                              imageUrl: (document.getElementById('char-img') as HTMLInputElement).value,
                              bio: (document.getElementById('char-bio') as HTMLTextAreaElement).value,
                              stats: stats,
                              isPublished: true
                            };
                            handleSaveEditor(data);
                          }}
                          className="w-full py-6 bg-primary rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl"
                        >
                          Seal Personal Archive
                        </button>
                     </div>
                   )}

                   {activeEditor.type === 'LORE' && (
                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Chronicle Title</label>
                           <input 
                             type="text"
                             placeholder="E.g. The Age of Silence"
                             defaultValue={activeEditor.item?.title}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 text-lg font-black uppercase tracking-tight"
                             id="lore-title"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Ontological Category</label>
                           <select 
                             defaultValue={activeEditor.item?.type || 'BACKSTORY'}
                             className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-sm font-bold opacity-60"
                             id="lore-type"
                           >
                             <option value="LOCATION">Sacred Location</option>
                             <option value="ITEM">Relic / Artifact</option>
                             <option value="PLOT_POINT">Historical Nexus</option>
                             <option value="BACKSTORY">Backstory</option>
                           </select>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">The Revelation</label>
                           <textarea 
                             placeholder="Unfold the truth..."
                             defaultValue={activeEditor.item?.content}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 h-64 text-sm leading-relaxed"
                             id="lore-content"
                           />
                        </div>
                        <button 
                          onClick={() => {
                            const data = {
                              id: activeEditor.item?.id,
                              title: (document.getElementById('lore-title') as HTMLInputElement).value,
                              type: (document.getElementById('lore-type') as HTMLSelectElement).value,
                              content: (document.getElementById('lore-content') as HTMLTextAreaElement).value,
                              isPublished: true
                            };
                            handleSaveEditor(data);
                          }}
                          className="w-full py-6 bg-primary rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl"
                        >
                          Archive Revelation
                        </button>
                     </div>
                   )}

                   {activeEditor.type === 'TIMELINE' && (
                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Nexus Moment Title</label>
                           <input 
                             type="text"
                             placeholder="E.g. The Great Shattering"
                             defaultValue={activeEditor.item?.title}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 text-lg font-black uppercase tracking-tight"
                             id="time-title"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Temporal Point ({world.timelineConfig?.unitName})</label>
                           <input 
                             type="number"
                             defaultValue={activeEditor.item?.year || 0}
                             className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-sm"
                             id="time-year"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Moment Chronicle</label>
                           <textarea 
                             placeholder="Describe the convergence..."
                             defaultValue={activeEditor.item?.description}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 h-40 text-sm leading-relaxed"
                             id="time-desc"
                           />
                        </div>
                        <button 
                          onClick={() => {
                            const data = {
                              id: activeEditor.item?.id,
                              title: (document.getElementById('time-title') as HTMLInputElement).value,
                              year: parseInt((document.getElementById('time-year') as HTMLInputElement).value),
                              description: (document.getElementById('time-desc') as HTMLTextAreaElement).value,
                              isPublished: true
                            };
                            handleSaveEditor(data);
                          }}
                          className="w-full py-6 bg-primary rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl"
                        >
                          Lock Nexus Point
                        </button>
                     </div>
                   )}

                   {activeEditor.type === 'CONNECTION' && (
                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Relationship Nature</label>
                           <input 
                             type="text"
                             placeholder="E.g. INSPIRED_BY, BORN_IN, RIVAL"
                             defaultValue={activeEditor.item?.relationshipType}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 text-sm font-black uppercase tracking-widest"
                             id="conn-type"
                           />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Source Node</label>
                              <select id="conn-src" defaultValue={activeEditor.item?.sourceId} className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-xs text-white/60">
                                 <option value={world.id}>Current World ({world.name})</option>
                                 <optgroup label="Characters">
                                    {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                 </optgroup>
                                 <optgroup label="Lore">
                                    {loreEntries.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                                 </optgroup>
                                 <optgroup label="Timeline">
                                    {timelineEvents.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                                 </optgroup>
                              </select>
                           </div>
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Target Node</label>
                              <select id="conn-target" defaultValue={activeEditor.item?.targetId} className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-xs text-white/60">
                                 <option value={world.id}>Current World ({world.name})</option>
                                 <optgroup label="Characters">
                                    {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                 </optgroup>
                                 <optgroup label="Lore">
                                    {loreEntries.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                                 </optgroup>
                                 <optgroup label="Timeline">
                                    {timelineEvents.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                                 </optgroup>
                                 <optgroup label="Albums">
                                    {userAlbums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                                 </optgroup>
                                 <optgroup label="Videos">
                                    {userVideos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                                 </optgroup>
                              </select>
                           </div>
                        </div>
                        <button 
                          onClick={() => {
                            const data = {
                              sourceId: (document.getElementById('conn-src') as HTMLSelectElement).value,
                              targetId: (document.getElementById('conn-target') as HTMLSelectElement).value,
                              relationshipType: (document.getElementById('conn-type') as HTMLInputElement).value
                            };
                            handleSaveEditor(data);
                          }}
                          className="w-full py-6 bg-primary rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl"
                        >
                          Bind System Nodes
                        </button>
                     </div>
                   )}
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {loading && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[2000]">
           <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button 
    onClick={onClick}
    className={`px-6 py-4 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap border ${active ? 'bg-white text-black border-white shadow-xl shadow-white/10' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'}`}
  >
    {icon} {label}
  </button>
);

export default WorldManagerView;
