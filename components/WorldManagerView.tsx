import React, { useState, useEffect, useRef } from 'react';
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
  Network,
  Image,
  Library,
  Loader2,
  Film,
  Music2
} from 'lucide-react';
import { IPWorld, Character, LoreEntry, TimelineEvent, Timeline, Album, Video, GraphNodeConnection, Photo, CharacterRelationship, CharacterJournalEntry, WorldBackgroundConfig } from '../types';
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
  fetchWorldTimelines,
  createTimeline,
  updateTimeline,
  deleteTimeline,
  setAssetTimeline,
  setVideoTimeline,
  fetchAllPublicAlbums,
  auth,
  updateTimelineEvent,
  createTimelineEvent,
  uploadWorldPhoto,
  fetchWorldPhotos,
  createIPWorld,
  updateVideo,
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
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [activeTimelineId, setActiveTimelineId] = useState<string | 'ALL'>('ALL');
  const [newTimelineName, setNewTimelineName] = useState('');
  const [newTimelineColor, setNewTimelineColor] = useState('#a855f7');
  const [showNewTimeline, setShowNewTimeline] = useState(false);
  const [pendingBranchTl, setPendingBranchTl] = useState<Timeline | null>(null);
  const [branchFromId, setBranchFromId] = useState('');
  const [branchAtYear, setBranchAtYear] = useState(0);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [userWorlds, setUserWorlds] = useState<IPWorld[]>([]);
  const [worldPhotos, setWorldPhotos] = useState<Photo[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [addPhotoToLibrary, setAddPhotoToLibrary] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Character editor state
  const [charEditName, setCharEditName] = useState('');
  const [charEditRole, setCharEditRole] = useState('');
  const [charEditImageUrl, setCharEditImageUrl] = useState('');
  const [charEditBio, setCharEditBio] = useState('');
  const [charEditAccentColor, setCharEditAccentColor] = useState('#a855f7');
  const [charEditPhysicalStats, setCharEditPhysicalStats] = useState<Record<string, string>>({});
  const [charEditCustomStats, setCharEditCustomStats] = useState('');
  const [charEditGallery, setCharEditGallery] = useState<string[]>([]);
  const [charEditJournalEntries, setCharEditJournalEntries] = useState<CharacterJournalEntry[]>([]);
  const [charEditRelationships, setCharEditRelationships] = useState<CharacterRelationship[]>([]);
  const [charEditPlaylistAlbumIds, setCharEditPlaylistAlbumIds] = useState<string[]>([]);
  const [charEditTab, setCharEditTab] = useState<'BASICS' | 'STATS' | 'GALLERY' | 'JOURNAL' | 'RELATIONS' | 'PLAYLIST'>('BASICS');
  const [charImageUploading, setCharImageUploading] = useState(false);
  const [charGalleryUploading, setCharGalleryUploading] = useState(false);
  const charPortraitInputRef = useRef<HTMLInputElement>(null);
  const charGalleryInputRef = useRef<HTMLInputElement>(null);

  // Journal entry form state
  const [newJournalDate, setNewJournalDate] = useState('');
  const [newJournalContent, setNewJournalContent] = useState('');
  const [newJournalMood, setNewJournalMood] = useState('');

  // Relationship form state
  const [newRelCharId, setNewRelCharId] = useState('');
  const [newRelType, setNewRelType] = useState<CharacterRelationship['type']>('FRIEND');
  const [newRelNote, setNewRelNote] = useState('');

  // Lore editor state
  const [loreEditGallery, setLoreEditGallery] = useState<string[]>([]);
  const [loreEditClips, setLoreEditClips] = useState<string[]>([]);
  const [loreGalleryUploading, setLoreGalleryUploading] = useState(false);
  const [newClipUrl, setNewClipUrl] = useState('');
  const loreGalleryInputRef = useRef<HTMLInputElement>(null);

  // Background config upload
  const [bgImageUploading, setBgImageUploading] = useState(false);
  const bgImageInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'IDENTITY' | 'CONTENT' | 'TIMELINE' | 'CONNECTIONS' | 'ASSETS'>('IDENTITY');
  const [activeEditor, setActiveEditor] = useState<{ type: 'CHARACTER' | 'LORE' | 'TIMELINE' | 'CONNECTION', item?: any } | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  useEffect(() => {
    if (initialWorld?.id) {
      loadContent(initialWorld.id);
    }
    loadUserData();
  }, [initialWorld?.id]);

  useEffect(() => {
    if (!activeEditor) return;
    if (activeEditor.type === 'CHARACTER') {
      const c = activeEditor.item as Character | undefined;
      setCharEditName(c?.name || '');
      setCharEditRole(c?.role || '');
      setCharEditImageUrl(c?.imageUrl || '');
      setCharEditBio(c?.bio || '');
      setCharEditAccentColor((c as any)?.accentColor || '#a855f7');
      setCharEditPhysicalStats((c as any)?.physicalStats || {});
      setCharEditCustomStats(c?.stats ? Object.entries(c.stats).map(([k, v]) => `${k}: ${v}`).join(', ') : '');
      setCharEditGallery((c as any)?.gallery || []);
      setCharEditJournalEntries((c as any)?.journalEntries || []);
      setCharEditRelationships((c as any)?.relationships || []);
      setCharEditPlaylistAlbumIds((c as any)?.playlistAlbumIds || []);
      setCharEditTab('BASICS');
      setNewJournalDate('');
      setNewJournalContent('');
      setNewJournalMood('');
      setNewRelCharId('');
      setNewRelType('FRIEND');
      setNewRelNote('');
    } else if (activeEditor.type === 'LORE') {
      const l = activeEditor.item as LoreEntry | undefined;
      setLoreEditGallery((l as any)?.gallery || []);
      setLoreEditClips((l as any)?.clips || []);
      setNewClipUrl('');
    }
  }, [activeEditor?.type, activeEditor?.item?.id]);

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
      const [chars, lore, timeline, tls, photos] = await Promise.all([
        fetchWorldCharacters(id, false),
        fetchWorldLore(id, false),
        fetchWorldTimeline(id, false),
        fetchWorldTimelines(id),
        fetchWorldPhotos(id)
      ]);
      setCharacters(chars);
      setLoreEntries(lore);
      setTimelineEvents(timeline);
      setTimelines(tls);
      setWorldPhotos(photos);
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
        const tId = data.timelineId || (activeTimelineId !== 'ALL' ? activeTimelineId : timelines[0]?.id) || '';
        if (data.id) {
          await updateTimelineEvent(data.id, { ...data, worldId: world.id, timelineId: tId });
        } else {
          await createTimelineEvent({ ...data, worldId: world.id, timelineId: tId });
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
                            onChange={e => setWorld({...world, timelineConfig: { ...(world.timelineConfig ?? { startYear: 0, endYear: 2000, unitName: 'Years' }), startYear: parseInt(e.target.value) }})}
                          />
                          <input 
                            type="number"
                            value={world.timelineConfig?.endYear}
                            className="bg-black/40 p-5 rounded-2xl border border-white/10 text-sm"
                            onChange={e => setWorld({...world, timelineConfig: { ...(world.timelineConfig ?? { startYear: 0, endYear: 2000, unitName: 'Years' }), endYear: parseInt(e.target.value) }})}
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

                {/* Background Imagery */}
                <section className="glass p-8 rounded-[2.5rem] border border-white/10">
                  <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3 mb-8">
                    <Image className="text-primary" size={20} />
                    World Background Imagery
                  </h3>
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(['IMAGE', 'VIDEO', 'SLIDESHOW'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setWorld({ ...world, backgroundConfig: { type: t, images: world.backgroundConfig?.images, videoUrl: world.backgroundConfig?.videoUrl, slideshowInterval: world.backgroundConfig?.slideshowInterval, opacity: world.backgroundConfig?.opacity } })}
                          className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${(world.backgroundConfig?.type) === t ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        >{t}</button>
                      ))}
                      {world.backgroundConfig && (
                        <button
                          onClick={() => setWorld({ ...world, backgroundConfig: undefined })}
                          className="ml-auto text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-red-400 transition-colors"
                        >Clear</button>
                      )}
                    </div>

                    {world.backgroundConfig?.type === 'VIDEO' ? (
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Video URL (mp4 / webm)</label>
                        <input
                          type="text"
                          value={world.backgroundConfig.videoUrl || ''}
                          onChange={e => setWorld({ ...world, backgroundConfig: { ...world.backgroundConfig!, videoUrl: e.target.value } })}
                          placeholder="https://..."
                          className="w-full bg-black/40 p-4 rounded-xl border border-white/10 text-sm"
                        />
                      </div>
                    ) : world.backgroundConfig ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-30">
                            {world.backgroundConfig.type === 'SLIDESHOW' ? 'Slideshow Images' : 'Background Image'}
                          </p>
                          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all ${bgImageUploading || !world.id ? 'opacity-50 pointer-events-none' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                            {bgImageUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                            {bgImageUploading ? 'Uploading…' : 'Upload'}
                            <input
                              ref={bgImageInputRef}
                              type="file"
                              accept="image/*"
                              multiple={world.backgroundConfig.type === 'SLIDESHOW'}
                              className="hidden"
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                if (!files.length || !world.id) return;
                                setBgImageUploading(true);
                                try {
                                  const photos = await Promise.all(files.map(f => uploadWorldPhoto(f, world.id!, { title: f.name.replace(/\.[^.]+$/, '') })));
                                  const urls = photos.filter(Boolean).map(p => p!.url);
                                  const existing = world.backgroundConfig?.images || [];
                                  setWorld({ ...world, backgroundConfig: { ...world.backgroundConfig!, images: [...existing, ...urls] } });
                                } finally {
                                  setBgImageUploading(false);
                                  if (bgImageInputRef.current) bgImageInputRef.current.value = '';
                                }
                              }}
                            />
                          </label>
                        </div>
                        {!world.id && <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Save world first to upload background images.</p>}
                        {(world.backgroundConfig.images?.length || 0) > 0 && (
                          <div className="grid grid-cols-4 gap-2">
                            {world.backgroundConfig.images!.map((url, i) => (
                              <div key={i} className="relative aspect-video rounded-xl overflow-hidden bg-white/5">
                                <img src={url} className="w-full h-full object-cover" />
                                <button
                                  onClick={() => setWorld({ ...world, backgroundConfig: { ...world.backgroundConfig!, images: world.backgroundConfig!.images!.filter((_, idx) => idx !== i) } })}
                                  className="absolute top-1 right-1 p-1 bg-black/70 rounded-full"
                                ><X size={10} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                        {world.backgroundConfig.type === 'SLIDESHOW' && (
                          <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40 shrink-0">Slide interval</span>
                            <input
                              type="number"
                              min={2}
                              max={30}
                              value={world.backgroundConfig.slideshowInterval || 5}
                              onChange={e => setWorld({ ...world, backgroundConfig: { ...world.backgroundConfig!, slideshowInterval: parseInt(e.target.value) } })}
                              className="w-20 bg-black/40 p-2 rounded-lg border border-white/10 text-sm text-center"
                            />
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-30">seconds</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Select a background type above to configure imagery.</p>
                    )}

                    {world.backgroundConfig && (
                      <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40 shrink-0">Opacity</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round((world.backgroundConfig.opacity ?? 0.7) * 100)}
                          onChange={e => setWorld({ ...world, backgroundConfig: { ...world.backgroundConfig!, opacity: parseInt(e.target.value) / 100 } })}
                          className="flex-1 accent-primary"
                        />
                        <span className="text-[9px] font-mono opacity-40">{Math.round((world.backgroundConfig.opacity ?? 0.7) * 100)}%</span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Ambient Music */}
                <section className="glass p-8 rounded-[2.5rem] border border-white/10">
                  <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3 mb-8">
                    <Music2 className="text-primary" size={20} />
                    Ambient Background Music
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Linked Album (plays when entering this world)</label>
                      <select
                        className="w-full bg-black/40 p-5 rounded-2xl border border-white/10 text-white/60 text-sm font-bold"
                        value={world.backgroundMusicAlbumId || ''}
                        onChange={e => setWorld({ ...world, backgroundMusicAlbumId: e.target.value || undefined })}
                      >
                        <option value="">No ambient music</option>
                        {userAlbums.map(album => (
                          <option key={album.id} value={album.id}>{album.title} — {album.artist}</option>
                        ))}
                      </select>
                    </div>
                    {world.backgroundMusicAlbumId && (
                      <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-2xl">
                        <Music2 size={14} className="text-primary shrink-0" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                          {userAlbums.find(a => a.id === world.backgroundMusicAlbumId)?.title || 'Linked album'} will autoplay when visitors enter this world
                        </p>
                      </div>
                    )}
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
                className="space-y-6"
              >
                {/* Timeline selector bar */}
                <section className="glass p-5 rounded-[2rem] border border-white/10">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => setActiveTimelineId('ALL')}
                      className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${activeTimelineId === 'ALL' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >All</button>
                    {timelines.map(tl => (
                      <button
                        key={tl.id}
                        onClick={() => setActiveTimelineId(tl.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${activeTimelineId === tl.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tl.color || '#a855f7' }} />
                        {tl.name}
                        {activeTimelineId === tl.id && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete timeline "${tl.name}"?`)) { deleteTimeline(world.id!, tl.id).then(() => setTimelines(p => p.filter(t => t.id !== tl.id))); if (activeTimelineId === tl.id) setActiveTimelineId('ALL'); } }} className="ml-1 opacity-40 hover:opacity-100 hover:text-red-400 transition-colors"><X size={10} /></button>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowNewTimeline(v => !v)}
                      className="px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-dashed border-white/20 hover:border-white/40 transition-all flex items-center gap-2 text-white/40 hover:text-white"
                    ><Plus size={12} /> New Timeline</button>
                  </div>

                  {/* Inline new timeline form */}
                  {showNewTimeline && (
                    <div className="mt-5 pt-5 border-t border-white/5">
                      {pendingBranchTl ? (
                        /* Step 2: Branch origin */
                        <div className="space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/50">
                            Does{' '}
                            <span className="font-black" style={{ color: pendingBranchTl.color || '#a855f7' }}>
                              {pendingBranchTl.name}
                            </span>{' '}
                            branch from an existing timeline?
                          </p>
                          <div className="flex items-center gap-3">
                            <select
                              value={branchFromId}
                              onChange={e => setBranchFromId(e.target.value)}
                              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none text-white"
                            >
                              <option value="">Independent — starts at origin</option>
                              {timelines.filter(t => t.id !== pendingBranchTl.id).map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={branchAtYear}
                              onChange={e => setBranchAtYear(parseInt(e.target.value) || 0)}
                              placeholder="Year"
                              className="w-28 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none text-white"
                            />
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-30 shrink-0">
                              {world.timelineConfig?.unitName || 'yr'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={async () => {
                                if (!world.id || !pendingBranchTl) return;
                                try {
                                  const parentName = timelines.find(t => t.id === branchFromId)?.name;
                                  const isOrigin = !branchFromId || branchAtYear === 0;
                                  const title = isOrigin ? 'Origin' : `Branch from ${parentName}`;
                                  const description = branchFromId
                                    ? `Branches from "${parentName}" at ${world.timelineConfig?.unitName || 'year'} ${branchAtYear}`
                                    : 'Beginning of this timeline.';
                                  const ev = await createTimelineEvent({
                                    worldId: world.id,
                                    timelineId: pendingBranchTl.id,
                                    title,
                                    description,
                                    year: branchAtYear,
                                  });
                                  if (ev) setTimelineEvents(p => [...p, ev]);
                                } catch (err) {
                                  console.error('Failed to set origin point', err);
                                }
                                setPendingBranchTl(null);
                                setShowNewTimeline(false);
                              }}
                              className="flex-1 px-6 py-3 bg-primary rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                            >Set Origin Point</button>
                            <button
                              onClick={() => { setPendingBranchTl(null); setShowNewTimeline(false); }}
                              className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                            >Skip</button>
                          </div>
                        </div>
                      ) : (
                        /* Step 1: Name + color */
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={newTimelineColor}
                            onChange={e => setNewTimelineColor(e.target.value)}
                            className="w-10 h-10 rounded-xl border-none cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={newTimelineName}
                            onChange={e => setNewTimelineName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder="Timeline name…"
                            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none placeholder:text-white/20"
                          />
                          <button
                            onClick={async () => {
                              if (!newTimelineName.trim()) return;
                              if (!auth.currentUser) {
                                alert('Please sign in to create a timeline.');
                                return;
                              }
                              let worldId = world.id;
                              // Auto-save the world to Firestore if it hasn't been yet
                              if (!worldId) {
                                if (!world.name?.trim()) {
                                  alert('Give your world a name first (Identity tab), then come back to add timelines.');
                                  return;
                                }
                                try {
                                  const saved = await createIPWorld({
                                    ...world,
                                    creatorId: auth.currentUser.uid,
                                  });
                                  setWorld(prev => ({ ...prev, id: saved.id }));
                                  worldId = saved.id;
                                } catch (err: any) {
                                  alert(`Could not save world before creating timeline:\n${err?.message || err}`);
                                  return;
                                }
                              }
                              try {
                                const existingCount = timelines.length;
                                const tl = await createTimeline({ worldId: worldId!, name: newTimelineName.trim(), color: newTimelineColor });
                                setTimelines(p => [...p, tl]);
                                setActiveTimelineId(tl.id);
                                setNewTimelineName('');

                                if (existingCount === 0) {
                                  const ev = await createTimelineEvent({
                                    worldId: worldId!,
                                    timelineId: tl.id,
                                    title: 'Origin',
                                    description: 'Beginning of this timeline.',
                                    year: 0,
                                  });
                                  if (ev) setTimelineEvents(p => [...p, ev]);
                                  setShowNewTimeline(false);
                                } else {
                                  setPendingBranchTl(tl);
                                  setBranchFromId('');
                                  setBranchAtYear(0);
                                }
                              } catch (err: any) {
                                console.error('[Timeline] Create failed:', err);
                                // handleFirestoreError wraps the original error in JSON; extract it.
                                let msg: string = err?.message || String(err);
                                try { const parsed = JSON.parse(msg); msg = parsed.error || msg; } catch {}
                                alert(`Could not create timeline:\n\n${msg}`);
                              }
                            }}
                            className="px-6 py-3 bg-primary rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                          >Create</button>
                          <button onClick={() => setShowNewTimeline(false)} className="p-3 text-white/30 hover:text-white transition-colors"><X size={16} /></button>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Events for active timeline */}
                <section className="glass p-8 rounded-[2.5rem] border border-white/10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3">
                      <Clock className="text-primary" size={20} />
                      {activeTimelineId === 'ALL' ? 'All Events' : (timelines.find(t => t.id === activeTimelineId)?.name ?? 'Events')}
                    </h3>
                    <button
                      onClick={() => setActiveEditor({ type: 'TIMELINE' })}
                      className="px-6 py-3 bg-primary rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2"
                    ><Plus size={14} /> Add Event</button>
                  </div>

                  {(() => {
                    const filtered = timelineEvents
                      .filter(e => activeTimelineId === 'ALL' || e.timelineId === activeTimelineId)
                      .sort((a, b) => a.year - b.year);
                    const tlColor = (id: string) => timelines.find(t => t.id === id)?.color || '#a855f7';

                    if (filtered.length === 0) return (
                      <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/20 py-16 border-2 border-dashed border-white/5 rounded-2xl">
                        {timelines.length === 0 ? 'Create a timeline first, then add events.' : 'No events on this timeline yet.'}
                      </p>
                    );

                    return (
                      <div className="relative pl-12 space-y-10 before:content-[''] before:absolute before:left-5 before:top-4 before:bottom-4 before:w-px before:bg-white/10">
                        {filtered.map(event => (
                          <div key={event.id} className="relative cursor-pointer" onClick={() => setActiveEditor({ type: 'TIMELINE', item: event })}>
                            <div className="absolute -left-12 top-0 w-10 h-10 bg-[#111] border border-white/10 rounded-full flex items-center justify-center z-10">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: tlColor(event.timelineId) }} />
                            </div>
                            <div className="glass p-6 rounded-2xl border border-white/5 hover:border-white/20 transition-all">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: tlColor(event.timelineId) }}>
                                  {event.year} {world.timelineConfig?.unitName}
                                  {activeTimelineId === 'ALL' && timelines.find(t => t.id === event.timelineId) && (
                                    <span className="ml-3 opacity-50">· {timelines.find(t => t.id === event.timelineId)?.name}</span>
                                  )}
                                </span>
                                <span className="text-[8px] font-bold opacity-20 uppercase tracking-widest">#{event.id.slice(-4)}</span>
                              </div>
                              <h4 className="text-sm font-black uppercase tracking-tight mb-2">{event.title}</h4>
                              <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{event.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
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
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3">
                        <Database className="text-primary" size={20} />
                        Connected Multimedia
                      </h3>
                      <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                        {(world.assetIds || []).length} linked
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search assets…"
                      value={assetSearch}
                      onChange={e => setAssetSearch(e.target.value)}
                      className="w-full mb-6 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold outline-none text-white placeholder-white/20 focus:border-primary/50"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Link Albums</label>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                           {userAlbums.filter(a => !assetSearch || (a.title || '').toLowerCase().includes(assetSearch.toLowerCase())).map(album => {
                             const linked = world.assetIds?.includes(album.id);
                             return (
                               <div
                                 key={album.id}
                                 className={`w-full rounded-xl border transition-all ${linked ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'}`}
                               >
                                 <button
                                   onClick={() => {
                                     const ids = [...(world.assetIds || [])];
                                     if (ids.includes(album.id)) {
                                       setWorld({ ...world, assetIds: ids.filter(i => i !== album.id) });
                                     } else {
                                       setWorld({ ...world, assetIds: [...ids, album.id] });
                                     }
                                   }}
                                   className="w-full flex items-center justify-between p-4"
                                 >
                                   <span className="text-xs font-bold">{album.title}</span>
                                   {linked ? <Check size={14} className="text-primary" /> : <Plus size={14} className="opacity-20" />}
                                 </button>
                                 {linked && timelines.length > 0 && (
                                   <div className="px-4 pb-3">
                                     <select
                                       value={(album as any).timelineId || ''}
                                       onChange={async e => {
                                         const tlId = e.target.value || null;
                                         await setAssetTimeline(album.id, tlId);
                                         setUserAlbums(prev => prev.map(a => a.id === album.id ? { ...a, timelineId: tlId } as any : a));
                                       }}
                                       onClick={e => e.stopPropagation()}
                                       className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white/70 focus:outline-none focus:border-primary"
                                     >
                                       <option value="">No timeline</option>
                                       {timelines.map(tl => (
                                         <option key={tl.id} value={tl.id}>{tl.name}</option>
                                       ))}
                                     </select>
                                   </div>
                                 )}
                               </div>
                             );
                           })}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Link Videos</label>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                           {userVideos.filter(v => !assetSearch || (v.title || '').toLowerCase().includes(assetSearch.toLowerCase())).map(video => {
                             const linked = world.assetIds?.includes(video.id);
                             return (
                               <div
                                 key={video.id}
                                 className={`w-full rounded-xl border transition-all ${linked ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'}`}
                               >
                                 <button
                                   onClick={() => {
                                     const ids = [...(world.assetIds || [])];
                                     if (ids.includes(video.id)) {
                                       setWorld({ ...world, assetIds: ids.filter(i => i !== video.id) });
                                       updateVideo(video.id, { worldId: undefined }).catch(() => {});
                                     } else {
                                       setWorld({ ...world, assetIds: [...ids, video.id] });
                                       if (world.id) updateVideo(video.id, { worldId: world.id }).catch(() => {});
                                     }
                                   }}
                                   className="w-full flex items-center justify-between p-4"
                                 >
                                   <span className="text-xs font-bold">{video.title}</span>
                                   {linked ? <Check size={14} className="text-primary" /> : <Plus size={14} className="opacity-20" />}
                                 </button>
                                 {linked && timelines.length > 0 && (
                                   <div className="px-4 pb-3">
                                     <select
                                       value={(video as any).timelineId || ''}
                                       onChange={async e => {
                                         const tlId = e.target.value || null;
                                         await setVideoTimeline(video.id, tlId);
                                         setUserVideos(prev => prev.map(v => v.id === video.id ? { ...v, timelineId: tlId } as any : v));
                                       }}
                                       onClick={e => e.stopPropagation()}
                                       className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white/70 focus:outline-none focus:border-primary"
                                     >
                                       <option value="">No timeline</option>
                                       {timelines.map(tl => (
                                         <option key={tl.id} value={tl.id}>{tl.name}</option>
                                       ))}
                                     </select>
                                   </div>
                                 )}
                               </div>
                             );
                           })}
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

                 {/* ── World Image Assets ─────────────────────────────── */}
                 <section className="glass p-8 rounded-[2.5rem] border border-white/10">
                   <div className="flex items-center justify-between mb-6">
                     <h3 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-3">
                       <Image className="text-primary" size={20} />
                       World Images
                     </h3>
                     {world.id && (
                       <label className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl border text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${photoUploading ? 'opacity-50 pointer-events-none' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                         {photoUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                         {photoUploading ? 'Uploading…' : 'Upload Image'}
                         <input
                           ref={photoInputRef}
                           type="file"
                           accept="image/*"
                           className="hidden"
                           disabled={photoUploading}
                           onChange={async (e) => {
                             const file = e.target.files?.[0];
                             if (!file || !world.id) return;
                             setPhotoUploading(true);
                             try {
                               const photo = await uploadWorldPhoto(file, world.id, {
                                 title: file.name.replace(/\.[^.]+$/, ''),
                                 addToLibrary: addPhotoToLibrary
                               });
                               if (photo) setWorldPhotos(p => [photo, ...p]);
                             } finally {
                               setPhotoUploading(false);
                               if (photoInputRef.current) photoInputRef.current.value = '';
                             }
                           }}
                         />
                       </label>
                     )}
                   </div>

                   {/* Toggle: also add to personal library */}
                   <label className="flex items-center gap-3 mb-6 cursor-pointer">
                     <div
                       onClick={() => setAddPhotoToLibrary(v => !v)}
                       className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${addPhotoToLibrary ? 'bg-primary' : 'bg-white/10'}`}
                     >
                       <div className={`w-4 h-4 rounded-full bg-white transition-transform ${addPhotoToLibrary ? 'translate-x-4' : 'translate-x-0'}`} />
                     </div>
                     <div className="flex items-center gap-2">
                       <Library size={13} className="text-white/40" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Also add to personal library</span>
                     </div>
                   </label>

                   {!world.id && (
                     <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Save the world first to upload images.</p>
                   )}

                   {worldPhotos.length > 0 ? (
                     <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                       {worldPhotos.map(photo => (
                         <div key={photo.id} className="group relative aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/10">
                           <img src={photo.url} alt={photo.title} className="w-full h-full object-cover" />
                           {photo.addedToLibrary && (
                             <div className="absolute top-1.5 right-1.5">
                               <Library size={10} className="text-primary" />
                             </div>
                           )}
                           <p className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] font-bold truncate px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">{photo.title}</p>
                         </div>
                       ))}
                     </div>
                   ) : (
                     world.id && (
                       <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                         <Image size={32} className="text-white/10 mx-auto mb-3" />
                         <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No images uploaded yet</p>
                       </div>
                     )
                   )}
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
                      primaryColor: '#000000', secondaryColor: '#ffffff', backgroundId: '',
                      ...(world.themeConfig || {}),
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
                      primaryColor: '#000000', secondaryColor: '#ffffff', backgroundId: '',
                      ...(world.themeConfig || {}),
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
                       {/* Editor tabs */}
                       <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                         {(['BASICS', 'STATS', 'GALLERY', 'JOURNAL', 'RELATIONS', 'PLAYLIST'] as const).map(tab => (
                           <button
                             key={tab}
                             onClick={() => setCharEditTab(tab)}
                             className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${charEditTab === tab ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                           >{tab}</button>
                         ))}
                       </div>

                       {charEditTab === 'BASICS' && (
                         <div className="space-y-5">
                           <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Name</label>
                             <input
                               type="text"
                               value={charEditName}
                               onChange={e => setCharEditName(e.target.value)}
                               placeholder="E.g. Aelous"
                               className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 text-lg font-black uppercase tracking-tight"
                             />
                           </div>
                           <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Role / Title</label>
                             <input
                               type="text"
                               value={charEditRole}
                               onChange={e => setCharEditRole(e.target.value)}
                               placeholder="E.g. Sage"
                               className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-sm"
                             />
                           </div>
                           <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Portrait</label>
                             <div className="flex items-start gap-4">
                               {charEditImageUrl ? (
                                 <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-white/5 shrink-0">
                                   <img src={charEditImageUrl} className="w-full h-full object-cover" />
                                   <button onClick={() => setCharEditImageUrl('')} className="absolute top-1 right-1 p-1 bg-black/70 rounded-full"><X size={10} /></button>
                                 </div>
                               ) : (
                                 <div className="w-20 h-20 rounded-2xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center shrink-0">
                                   <Upload size={16} className="text-white/20" />
                                 </div>
                               )}
                               <div className="flex-1 space-y-2">
                                 <label className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${charImageUploading || !world.id ? 'opacity-50 pointer-events-none' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                                   {charImageUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                   {charImageUploading ? 'Uploading…' : 'Upload File'}
                                   <input
                                     ref={charPortraitInputRef}
                                     type="file"
                                     accept="image/*"
                                     className="hidden"
                                     onChange={async (e) => {
                                       const file = e.target.files?.[0];
                                       if (!file || !world.id) return;
                                       setCharImageUploading(true);
                                       try {
                                         const photo = await uploadWorldPhoto(file, world.id, { title: 'portrait-' + (charEditName || 'character') });
                                         if (photo?.url) setCharEditImageUrl(photo.url);
                                       } finally {
                                         setCharImageUploading(false);
                                         if (charPortraitInputRef.current) charPortraitInputRef.current.value = '';
                                       }
                                     }}
                                   />
                                 </label>
                                 {!world.id && <p className="text-[8px] text-white/30 uppercase tracking-widest font-bold">Save world first to upload files.</p>}
                                 <input
                                   type="text"
                                   value={charEditImageUrl}
                                   onChange={e => setCharEditImageUrl(e.target.value)}
                                   placeholder="Or paste image URL"
                                   className="w-full bg-white/5 p-3 rounded-2xl border border-white/5 text-xs"
                                 />
                               </div>
                             </div>
                           </div>
                           <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Biography</label>
                             <textarea
                               value={charEditBio}
                               onChange={e => setCharEditBio(e.target.value)}
                               placeholder="The essence of this being..."
                               className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 h-28 text-sm leading-relaxed"
                             />
                           </div>
                           <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Accent Color</label>
                             <div className="flex items-center gap-3">
                               <input
                                 type="color"
                                 value={charEditAccentColor}
                                 onChange={e => setCharEditAccentColor(e.target.value)}
                                 className="w-12 h-12 rounded-2xl border-none cursor-pointer bg-transparent"
                               />
                               <span className="text-xs font-mono opacity-40">{charEditAccentColor}</span>
                             </div>
                           </div>
                         </div>
                       )}

                       {charEditTab === 'STATS' && (
                         <div className="space-y-5">
                           <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Physical Stats</label>
                             <div className="grid grid-cols-2 gap-3">
                               {(['height', 'weight', 'age', 'birthdate', 'species', 'alignment'] as const).map(field => (
                                 <div key={field} className="space-y-1">
                                   <label className="text-[8px] font-black uppercase tracking-widest opacity-30 ml-1">{field}</label>
                                   <input
                                     type="text"
                                     value={charEditPhysicalStats[field] || ''}
                                     onChange={e => setCharEditPhysicalStats({ ...charEditPhysicalStats, [field]: e.target.value })}
                                     placeholder={field === 'height' ? '5\'10"' : field === 'weight' ? '165 lbs' : field}
                                     className="w-full bg-white/5 p-3 rounded-xl border border-white/5 text-sm"
                                   />
                                 </div>
                               ))}
                             </div>
                           </div>
                           <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Custom Stats (Key: Value)</label>
                             <textarea
                               value={charEditCustomStats}
                               onChange={e => setCharEditCustomStats(e.target.value)}
                               placeholder="strength: 10, agility: 15, magic: 8"
                               className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 h-24 text-xs font-mono"
                             />
                           </div>
                         </div>
                       )}

                       {charEditTab === 'GALLERY' && (
                         <div className="space-y-5">
                           <div className="flex items-center justify-between">
                             <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Gallery ({charEditGallery.length} items)</label>
                             <label className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all ${charGalleryUploading || !world.id ? 'opacity-50 pointer-events-none' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                               {charGalleryUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                               {charGalleryUploading ? 'Uploading…' : 'Add Files'}
                               <input
                                 ref={charGalleryInputRef}
                                 type="file"
                                 accept="image/*,video/*"
                                 multiple
                                 className="hidden"
                                 onChange={async (e) => {
                                   const files = Array.from(e.target.files || []);
                                   if (!files.length || !world.id) return;
                                   setCharGalleryUploading(true);
                                   try {
                                     const photos = await Promise.all(files.map(f => uploadWorldPhoto(f, world.id!, { title: f.name.replace(/\.[^.]+$/, '') })));
                                     const urls = photos.filter(Boolean).map(p => p!.url);
                                     setCharEditGallery(prev => [...prev, ...urls]);
                                   } finally {
                                     setCharGalleryUploading(false);
                                     if (charGalleryInputRef.current) charGalleryInputRef.current.value = '';
                                   }
                                 }}
                               />
                             </label>
                           </div>
                           {!world.id && <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Save world first to upload files.</p>}
                           {charEditGallery.length > 0 ? (
                             <div className="grid grid-cols-3 gap-3">
                               {charEditGallery.map((url, i) => (
                                 <div key={i} className="relative aspect-square rounded-2xl overflow-hidden bg-white/5">
                                   <img src={url} className="w-full h-full object-cover" />
                                   <button
                                     onClick={() => setCharEditGallery(prev => prev.filter((_, idx) => idx !== i))}
                                     className="absolute top-1 right-1 p-1 bg-black/70 rounded-full hover:bg-red-500/70 transition-colors"
                                   ><X size={10} /></button>
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                               <Image size={24} className="text-white/10 mx-auto mb-2" />
                               <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No gallery items yet</p>
                             </div>
                           )}
                         </div>
                       )}

                       {charEditTab === 'JOURNAL' && (
                         <div className="space-y-5">
                           <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3">
                             <p className="text-[9px] font-black uppercase tracking-widest opacity-40">New Journal Entry</p>
                             <div className="grid grid-cols-2 gap-3">
                               <input
                                 type="text"
                                 value={newJournalDate}
                                 onChange={e => setNewJournalDate(e.target.value)}
                                 placeholder="Date (e.g. Year 342)"
                                 className="bg-white/5 p-3 rounded-xl border border-white/5 text-sm"
                               />
                               <select
                                 value={newJournalMood}
                                 onChange={e => setNewJournalMood(e.target.value)}
                                 className="bg-white/5 p-3 rounded-xl border border-white/5 text-sm text-white/60"
                               >
                                 <option value="">Mood (optional)</option>
                                 {['HAPPY', 'SAD', 'ANGRY', 'AFRAID', 'NEUTRAL', 'MYSTERIOUS', 'DETERMINED'].map(m => (
                                   <option key={m} value={m}>{m}</option>
                                 ))}
                               </select>
                             </div>
                             <textarea
                               value={newJournalContent}
                               onChange={e => setNewJournalContent(e.target.value)}
                               placeholder="Write a journal entry..."
                               className="w-full bg-white/5 p-4 rounded-xl border border-white/5 h-24 text-sm leading-relaxed"
                             />
                             <button
                               onClick={() => {
                                 if (!newJournalContent.trim()) return;
                                 setCharEditJournalEntries(prev => [{
                                   id: Date.now().toString(),
                                   date: newJournalDate || new Date().toLocaleDateString(),
                                   content: newJournalContent.trim(),
                                   mood: newJournalMood || undefined,
                                 }, ...prev]);
                                 setNewJournalDate('');
                                 setNewJournalContent('');
                                 setNewJournalMood('');
                               }}
                               disabled={!newJournalContent.trim()}
                               className="w-full py-3 bg-primary/80 hover:bg-primary rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                             >Add Entry</button>
                           </div>
                           <div className="space-y-3">
                             {charEditJournalEntries.map(entry => (
                               <div key={entry.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                                 <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <span className="text-[9px] font-black uppercase tracking-widest opacity-50">{entry.date}</span>
                                     {entry.mood && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10 opacity-60">{entry.mood}</span>}
                                   </div>
                                   <button onClick={() => setCharEditJournalEntries(prev => prev.filter(e => e.id !== entry.id))} className="p-1 hover:text-red-400 transition-colors opacity-30 hover:opacity-100"><Trash2 size={12} /></button>
                                 </div>
                                 <p className="text-xs text-white/60 leading-relaxed">{entry.content}</p>
                               </div>
                             ))}
                             {charEditJournalEntries.length === 0 && (
                               <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                 <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No journal entries</p>
                               </div>
                             )}
                           </div>
                         </div>
                       )}

                       {charEditTab === 'RELATIONS' && (
                         <div className="space-y-5">
                           <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3">
                             <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Add Connection</p>
                             <select
                               value={newRelCharId}
                               onChange={e => setNewRelCharId(e.target.value)}
                               className="w-full bg-white/5 p-3 rounded-xl border border-white/5 text-sm text-white/60"
                             >
                               <option value="">Select character…</option>
                               {characters.filter(c => c.id !== activeEditor.item?.id).map(c => (
                                 <option key={c.id} value={c.id}>{c.name}</option>
                               ))}
                             </select>
                             <div className="grid grid-cols-2 gap-3">
                               <select
                                 value={newRelType}
                                 onChange={e => setNewRelType(e.target.value as CharacterRelationship['type'])}
                                 className="bg-white/5 p-3 rounded-xl border border-white/5 text-sm text-white/60"
                               >
                                 {(['FAMILY', 'FRIEND', 'RIVAL', 'ALLY', 'ENEMY', 'ROMANTIC', 'COWORKER', 'ACQUAINTANCE', 'MENTOR', 'STUDENT'] as const).map(t => (
                                   <option key={t} value={t}>{t}</option>
                                 ))}
                               </select>
                               <input
                                 type="text"
                                 value={newRelNote}
                                 onChange={e => setNewRelNote(e.target.value)}
                                 placeholder="Note (optional)"
                                 className="bg-white/5 p-3 rounded-xl border border-white/5 text-sm"
                               />
                             </div>
                             <button
                               onClick={() => {
                                 if (!newRelCharId) return;
                                 const relName = characters.find(c => c.id === newRelCharId)?.name || '';
                                 setCharEditRelationships(prev => [...prev, { characterId: newRelCharId, characterName: relName, type: newRelType, note: newRelNote || undefined }]);
                                 setNewRelCharId('');
                                 setNewRelNote('');
                               }}
                               disabled={!newRelCharId}
                               className="w-full py-3 bg-primary/80 hover:bg-primary rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                             >Add Connection</button>
                           </div>
                           <div className="space-y-3">
                             {charEditRelationships.map((rel, i) => {
                               const relChar = characters.find(c => c.id === rel.characterId);
                               return (
                                 <div key={i} className="flex items-center gap-3 p-4 bg-white/5 border border-white/5 rounded-2xl">
                                   {relChar?.imageUrl && <img src={relChar.imageUrl} className="w-10 h-10 rounded-full object-cover shrink-0" />}
                                   <div className="flex-1 min-w-0">
                                     <p className="text-xs font-black uppercase tracking-tight">{relChar?.name || rel.characterId}</p>
                                     <div className="flex items-center gap-2 mt-0.5">
                                       <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/20 text-primary">{rel.type}</span>
                                       {rel.note && <span className="text-[9px] opacity-40 truncate">{rel.note}</span>}
                                     </div>
                                   </div>
                                   <button onClick={() => setCharEditRelationships(prev => prev.filter((_, idx) => idx !== i))} className="p-2 hover:text-red-400 transition-colors opacity-30 hover:opacity-100"><Trash2 size={12} /></button>
                                 </div>
                               );
                             })}
                             {charEditRelationships.length === 0 && (
                               <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                 <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No connections yet</p>
                               </div>
                             )}
                           </div>
                         </div>
                       )}

                       {charEditTab === 'PLAYLIST' && (
                         <div className="space-y-4">
                           <p className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Link Albums to This Character</p>
                           {userAlbums.length === 0 ? (
                             <p className="text-[10px] text-white/30 p-4 bg-white/5 rounded-2xl border border-white/5">No albums available. Add albums in the Assets tab first.</p>
                           ) : (
                             <div className="space-y-2">
                               {userAlbums.map(album => {
                                 const linked = charEditPlaylistAlbumIds.includes(album.id);
                                 return (
                                   <button
                                     key={album.id}
                                     onClick={() => setCharEditPlaylistAlbumIds(prev => linked ? prev.filter(id => id !== album.id) : [...prev, album.id])}
                                     className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${linked ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'}`}
                                   >
                                     <div className="flex items-center gap-3">
                                       {(album as any).coverImageUrl && <img src={(album as any).coverImageUrl} className="w-8 h-8 rounded-lg object-cover" />}
                                       <div className="text-left">
                                         <p className="text-xs font-bold">{album.title}</p>
                                         <p className="text-[9px] opacity-40 uppercase">{album.type}</p>
                                       </div>
                                     </div>
                                     {linked ? <Check size={14} className="text-primary" /> : <Plus size={14} className="opacity-20" />}
                                   </button>
                                 );
                               })}
                             </div>
                           )}
                         </div>
                       )}

                       <button
                         onClick={() => {
                           const customStats: Record<string, any> = {};
                           if (charEditCustomStats.trim()) {
                             charEditCustomStats.split(',').forEach(pair => {
                               const [k, v] = pair.split(':').map(s => s.trim());
                               if (k && v) customStats[k] = isNaN(Number(v)) ? v : Number(v);
                             });
                           }
                           const data: Record<string, any> = {
                             id: activeEditor.item?.id,
                             worldId: activeEditor.item?.worldId || world.id,
                             name: charEditName,
                             role: charEditRole,
                             imageUrl: charEditImageUrl,
                             bio: charEditBio,
                             accentColor: charEditAccentColor,
                           };
                           if (Object.keys(charEditPhysicalStats).length > 0) data.physicalStats = charEditPhysicalStats;
                           if (Object.keys(customStats).length > 0) data.stats = customStats;
                           if (charEditGallery.length > 0) data.gallery = charEditGallery;
                           if (charEditJournalEntries.length > 0) data.journalEntries = charEditJournalEntries;
                           if (charEditRelationships.length > 0) data.relationships = charEditRelationships;
                           if (charEditPlaylistAlbumIds.length > 0) data.playlistAlbumIds = charEditPlaylistAlbumIds;
                           handleSaveEditor(data);
                         }}
                         disabled={!charEditName.trim()}
                         className="w-full py-6 bg-primary rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl disabled:opacity-30 transition-all"
                       >
                         Save Character
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
                             <option value="EVENT">Event</option>
                             <option value="FACTION">Faction</option>
                             <option value="CREATURE">Creature</option>
                           </select>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">The Revelation</label>
                           <textarea
                             placeholder="Unfold the truth..."
                             defaultValue={activeEditor.item?.content}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 h-40 text-sm leading-relaxed"
                             id="lore-content"
                           />
                        </div>

                        {/* Gallery */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Gallery Images ({loreEditGallery.length})</label>
                            <label className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all ${loreGalleryUploading || !world.id ? 'opacity-50 pointer-events-none' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                              {loreGalleryUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                              Add Images
                              <input
                                ref={loreGalleryInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={async (e) => {
                                  const files = Array.from(e.target.files || []);
                                  if (!files.length || !world.id) return;
                                  setLoreGalleryUploading(true);
                                  try {
                                    const photos = await Promise.all(files.map(f => uploadWorldPhoto(f, world.id!, { title: f.name.replace(/\.[^.]+$/, '') })));
                                    const urls = photos.filter(Boolean).map(p => p!.url);
                                    setLoreEditGallery(prev => [...prev, ...urls]);
                                  } finally {
                                    setLoreGalleryUploading(false);
                                    if (loreGalleryInputRef.current) loreGalleryInputRef.current.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                          {!world.id && <p className="text-[8px] text-white/30 font-bold uppercase tracking-widest ml-2">Save world first to upload images.</p>}
                          {loreEditGallery.length > 0 && (
                            <div className="grid grid-cols-4 gap-2">
                              {loreEditGallery.map((url, i) => (
                                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-white/5">
                                  <img src={url} className="w-full h-full object-cover" />
                                  <button
                                    onClick={() => setLoreEditGallery(prev => prev.filter((_, idx) => idx !== i))}
                                    className="absolute top-1 right-1 p-1 bg-black/70 rounded-full hover:bg-red-500/70 transition-colors"
                                  ><X size={10} /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Video Clips */}
                        <div className="space-y-3">
                          <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Video Clips</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newClipUrl}
                              onChange={e => setNewClipUrl(e.target.value)}
                              placeholder="Video URL (mp4, youtube, etc.)…"
                              className="flex-1 bg-white/5 p-3 rounded-xl border border-white/5 text-sm"
                            />
                            <button
                              onClick={() => { if (!newClipUrl.trim()) return; setLoreEditClips(prev => [...prev, newClipUrl.trim()]); setNewClipUrl(''); }}
                              disabled={!newClipUrl.trim()}
                              className="px-4 py-3 bg-primary/80 rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-30 transition-all"
                            >Add</button>
                          </div>
                          {loreEditClips.length > 0 && (
                            <div className="space-y-2">
                              {loreEditClips.map((url, i) => (
                                <div key={i} className="flex items-center gap-2 p-3 bg-white/5 border border-white/5 rounded-xl">
                                  <Film size={12} className="text-white/40 shrink-0" />
                                  <span className="text-xs text-white/50 flex-1 truncate">{url}</span>
                                  <button onClick={() => setLoreEditClips(prev => prev.filter((_, idx) => idx !== i))} className="p-1 hover:text-red-400 transition-colors opacity-40 hover:opacity-100"><X size={10} /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            const data: Record<string, any> = {
                              id: activeEditor.item?.id,
                              title: (document.getElementById('lore-title') as HTMLInputElement).value,
                              type: (document.getElementById('lore-type') as HTMLSelectElement).value,
                              content: (document.getElementById('lore-content') as HTMLTextAreaElement).value,
                              isPublished: true,
                            };
                            if (loreEditGallery.length > 0) data.gallery = loreEditGallery;
                            if (loreEditClips.length > 0) data.clips = loreEditClips;
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
                        {/* Timeline assignment */}
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Timeline</label>
                           {timelines.length === 0 ? (
                             <p className="text-[10px] font-bold text-white/30 p-4 bg-white/5 rounded-2xl border border-white/5">No timelines yet — create one in the Timeline tab first.</p>
                           ) : (
                             <select id="time-timeline" defaultValue={activeEditor.item?.timelineId || (activeTimelineId !== 'ALL' ? activeTimelineId : timelines[0]?.id)} className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-sm text-white">
                               {timelines.map(tl => (
                                 <option key={tl.id} value={tl.id} className="bg-[#111]">{tl.name}</option>
                               ))}
                             </select>
                           )}
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Event Title</label>
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
                             defaultValue={activeEditor.item?.year ?? 0}
                             className="w-full bg-white/5 p-5 rounded-2xl border border-white/5 text-sm"
                             id="time-year"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Description</label>
                           <textarea
                             placeholder="Describe what happened..."
                             defaultValue={activeEditor.item?.description}
                             className="w-full bg-white/5 p-6 rounded-2xl border border-white/5 h-32 text-sm leading-relaxed"
                             id="time-desc"
                           />
                        </div>
                        <button
                          onClick={() => {
                            const tlSel = document.getElementById('time-timeline') as HTMLSelectElement | null;
                            const title = (document.getElementById('time-title') as HTMLInputElement).value.trim();
                            const yearRaw = (document.getElementById('time-year') as HTMLInputElement).value;
                            const desc = (document.getElementById('time-desc') as HTMLTextAreaElement).value.trim();
                            const data: Record<string, any> = { id: activeEditor.item?.id };
                            if (tlSel?.value) data.timelineId = tlSel.value;
                            if (title) data.title = title;
                            if (yearRaw !== '') data.year = parseInt(yearRaw);
                            if (desc) data.description = desc;
                            handleSaveEditor(data);
                          }}
                          className="w-full py-6 bg-primary rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl"
                        >
                          Save Event
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
