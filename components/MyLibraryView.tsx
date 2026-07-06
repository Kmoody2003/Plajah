import React, { useState, useEffect, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { 
  Music, 
  Upload, 
  FolderSync, 
  Trash2, 
  Play, 
  Plus, 
  Search,
  Library,
  FileMusic,
  Sparkles,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List,
  ChevronDown,
  MoreVertical,
  PlusCircle,
  Globe,
  Folder,
  Disc,
  ListMusic,
  Settings,
  X,
  Send,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Track, UserProfile, Album, Playlist, FeedItem } from '../types';
import PodcastManager from './PodcastManager';
import { 
  fetchUserLibraryTracks, 
  removeFromLibrary, 
  uploadPersonalTrack,
  fetchPersonalTracks,
  fetchPersonalAlbums,
  fetchPersonalPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  createPersonalAlbum,
  deletePersonalTrack,
  uploadFile,
  postToFeed,
  auth
} from '../services/backendService';
import { readAudioTags, isAudioFile, titleFromFilename } from '../services/musicLocker';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface MyLibraryViewProps {
  profile: UserProfile;
  onUpdate?: (updated: UserProfile) => void;
  initialTab?: 'SAVED' | 'PERSONAL' | 'PLAYLISTS' | 'SYNC';
}

const MyLibraryView: React.FC<MyLibraryViewProps> = ({ profile, onUpdate, initialTab = 'SAVED' }) => {
  const { playTrack, currentTrack: globalTrack, isPlaying: globalIsPlaying } = useGlobalPlayerState();
  const [libraryTracks, setLibraryTracks] = useState<(Track & { albumId?: string; albumArtist?: string; albumCover?: string })[]>([]);
  const [personalTracks, setPersonalTracks] = useState<Track[]>([]);
  const [personalAlbums, setPersonalAlbums] = useState<Album[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'SAVED' | 'PERSONAL' | 'PLAYLISTS' | 'SYNC'>(initialTab);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('LIST');
  const [sortBy, setSortBy] = useState<'title' | 'artist' | 'album' | 'date'>('date');
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [editingPodcastTrack, setEditingPodcastTrack] = useState<Track | null>(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [savedDirectories, setSavedDirectories] = useState<{id: string, name: string, needsAuth: boolean, handle: any}[]>([]);
  const localFolderInputRef = useRef<HTMLInputElement>(null);

  const scanDirectoryHandle = async (dirHandle: any, currentPath: string = ''): Promise<{file: File, path: string}[]> => {
    let files: {file: File, path: string}[] = [];
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          files.push({ file: await entry.getFile(), path: currentPath });
        } else if (entry.kind === 'directory') {
          const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          files.push(...(await scanDirectoryHandle(entry, newPath)));
        }
      }
    } catch (e) {
      console.error("Error scanning directory", e);
    }
    return files;
  };

  const loadSavedDirectories = async () => {
    const dirs = profile.uiSettings?.syncedFolders || [];
    const validDirs = [];
    for (const dir of dirs) {
      const handle = await get(`sync_folder_${dir.id}`);
      if (handle) {
        let needsAuth = false;
        try {
          if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') {
             needsAuth = true;
          }
        } catch(e) {
          needsAuth = true;
        }
        validDirs.push({ ...dir, needsAuth, handle });
        if (!needsAuth) {
          const files = await scanDirectoryHandle(handle);
          await processFileArrayInner(files, dir.name);
        }
      } else {
        validDirs.push({ ...dir, needsAuth: true, handle: null });
      }
    }
    setSavedDirectories(validDirs);
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const [lib, personal, albums, pls] = await Promise.all([
        profile.library && profile.library.length > 0 ? fetchUserLibraryTracks(profile.library) : Promise.resolve([]),
        fetchPersonalTracks(),
        fetchPersonalAlbums(),
        fetchPersonalPlaylists()
      ]);
      setLibraryTracks(lib);
      setPersonalTracks(personal);
      setPersonalAlbums(albums);
      setPlaylists(pls);
      await loadSavedDirectories();
      setLoading(false);
    };
    loadAll();
  }, [profile.library]);

  const processFileArrayInner = async (filesData: {file: File, path: string}[], rootFolderName?: string) => {
    try {
      const newLocalTracks: Track[] = [];
      let playlistOrder: string[] = [];
      const fileArray = filesData.map(f => f.file);

      // Find playlist XML file first
      const xmlFile = fileArray.find(f => f.name.toLowerCase().endsWith('.xml'));
      if (xmlFile) {
        try {
          const text = await xmlFile.text();
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, "text/xml");
          const trackNodes = xmlDoc.getElementsByTagName("track");
          for (let i = 0; i < trackNodes.length; i++) {
            const titleNode = trackNodes[i].getElementsByTagName("title")[0];
            const locNode = trackNodes[i].getElementsByTagName("location")[0];
            if (titleNode && titleNode.textContent) playlistOrder.push(titleNode.textContent.toLowerCase());
            else if (locNode && locNode.textContent) playlistOrder.push(decodeURIComponent(locNode.textContent).toLowerCase());
          }
        } catch (e) {
          console.error("Failed to parse playlist XML", e);
        }
      }

      for (const {file, path} of filesData) {
        if (file.type.startsWith('audio/') || file.type.startsWith('video/') || file.name.endsWith('.mp3') || file.name.endsWith('.mp4')) {
          let title = file.name.replace(/\.[^/.]+$/, "").replace(/^\d+\s*[-_]*\s*/, "");
          const dirArtist = path ? `${rootFolderName || "Local"}/${path}` : (rootFolderName || "Local Track");
          
          newLocalTracks.push({
            id: `local_${file.name}_${Math.random().toString(36).substr(2, 9)}`,
            title,
            artist: dirArtist,
            url: URL.createObjectURL(file),
            price: 0,
            isPaywalled: false,
          });
        }
      }

      if (playlistOrder.length > 0) {
        newLocalTracks.sort((a, b) => {
          const idxA = playlistOrder.findIndex(p => a.title.toLowerCase().includes(p) || p.includes(a.title.toLowerCase()));
          const idxB = playlistOrder.findIndex(p => b.title.toLowerCase().includes(p) || p.includes(b.title.toLowerCase()));
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return 0;
        });
      }

      setLocalTracks(prev => [...prev, ...newLocalTracks]);
    } catch (e) {
      console.error("Local sync failed", e);
    }
  };

  const processFileArray = async (fileArray: File[], folderName?: string) => {
     await processFileArrayInner(fileArray.map(f => ({ file: f, path: '' })), folderName);
  };

  const processLocalFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const filesData = Array.from(files).map(f => {
       const relativePath = (f as any).webkitRelativePath;
       let path = '';
       if (relativePath) {
         const parts = relativePath.split('/');
         if (parts.length > 2) {
           path = parts.slice(1, -1).join('/');
         }
       }
       return { file: f, path };
    });
    await processFileArrayInner(filesData);
  };

  const connectSyncFolder = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        const folderId = Math.random().toString(36).substr(2, 9);
        const folderName = dirHandle.name;

        await set(`sync_folder_${folderId}`, dirHandle);
        
        const newSyncedFolders = [...(profile.uiSettings?.syncedFolders || []), { id: folderId, name: folderName }];
        if (onUpdate) {
          onUpdate({
            ...profile,
            uiSettings: {
              ...profile.uiSettings,
              syncedFolders: newSyncedFolders
            }
          });
        }
        
        const files = await scanDirectoryHandle(dirHandle);
        await processFileArrayInner(files, folderName);
        setSavedDirectories(prev => [...prev, { id: folderId, name: folderName, handle: dirHandle, needsAuth: false }]);
      } catch (e) {
        console.error("User cancelled or failed to connect folder", e);
      }
    } else {
      localFolderInputRef.current?.click();
    }
  };

  const reAuthFolder = async (folder: any) => {
    try {
      if (folder.handle) {
         if ((await folder.handle.requestPermission({ mode: 'read' })) === 'granted') {
           const files = await scanDirectoryHandle(folder.handle);
           await processFileArrayInner(files, folder.name);
           setSavedDirectories(prev => prev.map(d => d.id === folder.id ? { ...d, needsAuth: false } : d));
         }
      } else {
        // Fallback if handle deleted/cleared
        if ('showDirectoryPicker' in window) {
          const dirHandle = await (window as any).showDirectoryPicker();
          await set(`sync_folder_${folder.id}`, dirHandle);
          const files = await scanDirectoryHandle(dirHandle);
          await processFileArrayInner(files, folder.name);
          setSavedDirectories(prev => prev.map(d => d.id === folder.id ? { ...d, handle: dirHandle, needsAuth: false } : d));
        }
      }
    } catch(e) {
      console.error("Re-auth failed", e);
    }
  };

  const removeSyncFolder = async (folderId: string) => {
    const folderName = savedDirectories.find(d => d.id === folderId)?.name;
    setLocalTracks(prev => prev.filter(t => !t.artist?.startsWith(folderName || '---NONE---')));
    setSavedDirectories(prev => prev.filter(d => d.id !== folderId));
    const newSyncedFolders = (profile.uiSettings?.syncedFolders || []).filter(f => f.id !== folderId);
    if (onUpdate) {
      onUpdate({
        ...profile,
        uiSettings: {
          ...profile.uiSettings,
          syncedFolders: newSyncedFolders
        }
      });
    }
  };

  const handleRemove = async (trackId: string) => {
    await removeFromLibrary(trackId);
    setLibraryTracks(prev => prev.filter(t => t.id !== trackId));
    if (onUpdate) {
      onUpdate({
        ...profile,
        library: (profile.library || []).filter(id => id !== trackId)
      });
    }
  };

  // Music-locker folder upload: read ID3 tags, organise into albums by
  // Artist/Album, upload embedded artwork once per album, and store each track
  // privately (personal_tracks). Plays from any instance; never shared.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const audio = Array.from(files).filter(isAudioFile);
    if (audio.length === 0) { alert('No supported audio files found in that selection.'); return; }

    setIsUploading(true);
    setUploadProgress({ done: 0, total: audio.length });
    try {
      // Read embedded tags first (fast, local) to organise the collection.
      const tagged = await Promise.all(audio.map(async (file) => {
        const rel = ((file as any).webkitRelativePath || '') as string;
        const parts = rel.split('/');
        const folder = parts.length > 1 ? parts[parts.length - 2] : '';
        return { file, tags: await readAudioTags(file), folder };
      }));

      // Group into albums by album tag (fallback: parent folder). Loose singles → "Singles".
      const groups = new Map<string, typeof tagged>();
      for (const item of tagged) {
        const key = item.tags.album || item.folder || 'Singles';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      let done = 0;
      for (const [albumName, items] of groups.entries()) {
        items.sort((a, b) => (a.tags.trackNo || 999) - (b.tags.trackNo || 999));
        const albumArtist = items.find(i => i.tags.artist)?.tags.artist || 'My Collection';

        // Upload embedded album art once, reuse as cover for the album + its tracks.
        let coverUrl = '';
        const art = items.find(i => i.tags.pictureBlob)?.tags.pictureBlob;
        if (art && auth.currentUser) {
          try { coverUrl = await uploadFile(`personal/${auth.currentUser.uid}/covers/${Date.now()}_${albumName.replace(/[^a-z0-9]/gi, '_')}.jpg`, art); } catch { /* art optional */ }
        }

        let albumId: string | undefined;
        if (albumName !== 'Singles') {
          const album = await createPersonalAlbum({ title: albumName, artist: albumArtist, coverImage: coverUrl || undefined });
          albumId = album?.id;
          if (album) setPersonalAlbums(prev => [album, ...prev]);
        }

        for (const { file, tags } of items) {
          const track = await uploadPersonalTrack({
            title: tags.title || titleFromFilename(file.name),
            artist: tags.artist || albumArtist,
            albumId,
            albumTitle: albumName !== 'Singles' ? albumName : undefined,
            albumCover: coverUrl || undefined,
          } as any, file);
          if (track) setPersonalTracks(prev => [track, ...prev]);
          done++;
          setUploadProgress({ done, total: audio.length });
        }
      }
    } catch (error) {
      console.error("Locker upload failed:", error);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeletePersonal = async (trackId: string) => {
    await deletePersonalTrack(trackId);
    setPersonalTracks(prev => prev.filter(t => t.id !== trackId));
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistTitle) return;
    const playlist = await createPlaylist({ title: newPlaylistTitle });
    if (playlist) {
      setPlaylists(prev => [playlist, ...prev]);
      setNewPlaylistTitle('');
      setIsCreatePlaylistOpen(false);
    }
  };

  const handlePostToFeed = async (track: Track) => {
    if (!auth.currentUser) return;
    
    try {
      await postToFeed({
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        authorPhoto: auth.currentUser.photoURL || '',
        type: 'SONG',
        content: `Check out this track from my vault: ${track.title}`,
        songUrl: track.url,
        songTitle: track.title,
        imageUrl: track.albumCover || '',
        shareCount: 0
      });
      alert('Posted to Plajah Social!');
    } catch (error) {
      console.error("Failed to post to feed:", error);
    }
  };

  const sortTracks = (tracks: Track[]) => {
    return [...tracks].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'artist') return (a.artist || '').localeCompare(b.artist || '');
      if (sortBy === 'album') return (a.albumTitle || '').localeCompare(b.albumTitle || '');
      return 0; // Default to date (already sorted by backend)
    });
  };

  const playTrackFromList = (track: Track, currentList: Track[], title: string) => {
    const virtualAlbum: Album = {
      id: `virtual_${Date.now()}`,
      title,
      artist: profile.displayName || 'My Vault',
      coverImage: track.albumCover || 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?auto=format&fit=crop&w=400&q=80',
      tracks: currentList,
      description: 'Virtual Album from My Library',
      themeColor: '#000000',
      createdAt: Date.now()
    };
    playTrack(track, virtualAlbum, 'LIBRARY');
  };

  const filteredLibrary = sortTracks(libraryTracks.filter(t => {
    if (t.isExclusive) {
      const isMember = profile.activeMemberships?.includes(t.artistId || '');
      if (!isMember) return false;
    }
    return t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
           t.artist.toLowerCase().includes(searchQuery.toLowerCase());
  }));

  const filteredPersonal = sortTracks(personalTracks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.artist.toLowerCase().includes(searchQuery.toLowerCase())
  ));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-40">
        <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest">Indexing Vault...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Library Header & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-white/5 rounded-2xl">
            <Library className="text-white" size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tightest">My Music Vault</h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              Private Media Library • {libraryTracks.length + personalTracks.length} Assets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Search your vault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full lg:w-80 bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-6 text-sm font-medium focus:outline-none focus:border-white/30 transition-all"
            />
          </div>
          
          <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
            <button 
              onClick={() => setViewMode('GRID')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'GRID' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('LIST')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'LIST' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1 bg-white/5 rounded-full self-start">
        {[
          { id: 'SAVED', label: 'Saved Music', icon: Music },
          { id: 'PERSONAL', label: 'Music Locker', icon: Lock },
          { id: 'PLAYLISTS', label: 'Playlists', icon: ListMusic },
          { id: 'SYNC', label: 'Local Sync', icon: FolderSync }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              activeSubTab === tab.id 
                ? 'bg-white text-black shadow-lg' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[400px]">
        {editingPodcastTrack ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 border border-white/10 rounded-[3rem] p-12 mb-12"
          >
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black uppercase tracking-tight">Podcast & Ad Settings</h2>
              <button onClick={() => setEditingPodcastTrack(null)} className="p-3 bg-white/5 rounded-full text-white/40 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <PodcastManager 
              content={editingPodcastTrack} 
              onUpdate={() => {
                setEditingPodcastTrack(null);
                // Refresh data if needed
              }} 
            />
          </motion.div>
        ) : activeSubTab === 'SAVED' && (
          <div className={viewMode === 'GRID' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6' : 'flex flex-col gap-2'}>
            {filteredLibrary.length > 0 ? (
              filteredLibrary.map((track) => (
                viewMode === 'GRID' ? (
                  <div key={`lib-grid-${track.id}`} className="group cursor-pointer">
                    <div className="relative aspect-square rounded-[2rem] overflow-hidden mb-3 bg-white/5">
                      <img src={track.albumCover || 'https://picsum.photos/seed/track/400/400'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={track.title} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <div className="flex flex-col gap-2">
                          <button onClick={() => playTrackFromList(track, filteredLibrary, 'Saved Music')} className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black">
                            <Play size={24} fill="black" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handlePostToFeed(track); }}
                            className="w-12 h-12 bg-small-orange rounded-full flex items-center justify-center text-white"
                            title="Post to Feed"
                          >
                            <Send size={20} />
                          </button>
                        </div>
                      </div>
                      {track.isGlobalArchive && (
                        <div className="absolute top-4 left-4 px-2 py-1 bg-blue-500/80 backdrop-blur-md rounded-md flex items-center gap-1">
                          <Globe size={10} className="text-white" />
                          <span className="text-[8px] font-black text-white uppercase">Global</span>
                        </div>
                      )}
                    </div>
                    <h4 className="text-xs font-black uppercase tracking-widest truncate">{track.title || 'Untitled Track'}</h4>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">{track.artist}</p>
                  </div>
                ) : (
                  <div key={`lib-list-${track.id}`} className="group flex items-center gap-4 p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/[0.08] transition-all">
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                      <img src={track.albumCover || 'https://picsum.photos/seed/track/200/200'} className="w-full h-full object-cover" alt={track.title} />
                      <button onClick={() => playTrackFromList(track, filteredLibrary, 'Saved Music')} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play size={16} fill="white" />
                      </button>
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold uppercase tracking-wider truncate">{track.title || 'Untitled Track'}</h4>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest truncate">{track.artist}</p>
                          {track.isGlobalArchive && <Globe size={10} className="text-blue-400" />}
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest truncate">{track.albumTitle || 'Single'}</div>
                      <div className="flex justify-end pr-4 gap-2">
                        <button 
                          onClick={() => handlePostToFeed(track)}
                          className="p-2 text-white/20 hover:text-small-orange transition-colors"
                          title="Post to Feed"
                        >
                          <Send size={16} />
                        </button>
                        <button onClick={() => handleRemove(track.id)} className="p-2 text-white/20 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              ))
            ) : (
              <div className="col-span-full py-20 text-center opacity-20">
                <Music size={48} className="mx-auto mb-4" />
                <p className="text-xs font-black uppercase tracking-widest">No saved tracks found</p>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'PERSONAL' && (
          <div className="flex flex-col gap-6">
            {/* Private music locker — legal privacy notice */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <Lock size={16} className="text-small-orange mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-white">Your private music locker</p>
                <p className="text-[10px] text-white/40 mt-1 leading-relaxed">Bring your own collection — upload a folder and play it in Chora from any device you sign in on. These tracks are <span className="text-white/70 font-bold">private to you and are never shared, posted, or discoverable</span>. Every Chora feature works on them — just for you.</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-white/40">Private Vault</h4>
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                  <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Sort By:</span>
                  <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-[9px] font-black text-white uppercase tracking-widest outline-none cursor-pointer"
                  >
                    <option value="date">Date</option>
                    <option value="title">Name</option>
                    <option value="artist">Artist</option>
                    <option value="album">Album</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:scale-105 transition-all shadow-xl">
                  <FolderSync size={14} />
                  Upload Folder
                  <input 
                    type="file" 
                    {...({ webkitdirectory: "", directory: "" } as any)}
                    multiple 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </label>
                <label className="flex items-center gap-2 px-6 py-3 bg-white/10 text-white border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/20 transition-all">
                  <Upload size={14} />
                  Single Files
                  <input type="file" accept="audio/*" multiple className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>

            {isUploading && (
              <div className="p-8 bg-white/5 border border-white/10 border-dashed rounded-[2rem] flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                  {uploadProgress ? `Uploading to your locker — ${uploadProgress.done} of ${uploadProgress.total}` : 'Reading your collection…'}
                </p>
                {uploadProgress && uploadProgress.total > 0 && (
                  <div className="w-full max-w-sm h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-small-orange transition-all" style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }} />
                  </div>
                )}
              </div>
            )}

            <div className={viewMode === 'GRID' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6' : 'flex flex-col gap-2'}>
              {filteredPersonal.length > 0 ? (
                filteredPersonal.map((track) => (
                  viewMode === 'GRID' ? (
                    <div key={`pers-grid-${track.id}`} className="group cursor-pointer">
                      <div className="relative aspect-square rounded-[2rem] overflow-hidden mb-3 bg-white/5 flex items-center justify-center">
                        {track.albumCover ? (
                          <img src={track.albumCover || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={track.title} />
                        ) : (
                          <FileMusic size={48} className="text-white/10 group-hover:scale-110 transition-transform" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <div className="flex flex-col gap-2">
                            <button onClick={() => playTrackFromList(track, filteredPersonal, 'Personal Collection')} className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black">
                              <Play size={24} fill="black" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-widest truncate">{track.title || 'Untitled Track'}</h4>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">{track.artist}</p>
                    </div>
                  ) : (
                    <div key={`pers-list-${track.id}`} className="group flex items-center gap-4 p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/[0.08] transition-all">
                      <div className="relative w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                        {track.albumCover ? (
                          <img src={track.albumCover || null} className="w-full h-full object-cover" alt={track.title} />
                        ) : (
                          <FileMusic size={20} className="text-white/20" />
                        )}
                        <button onClick={() => playTrackFromList(track, filteredPersonal, 'Personal Collection')} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Play size={16} fill="white" />
                        </button>
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold uppercase tracking-wider truncate">{track.title || 'Untitled Track'}</h4>
                          <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest truncate">{track.artist}</p>
                        </div>
                        <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest truncate">
                          {track.albumTitle || 'Single'}
                        </div>
                        <div className="flex justify-end pr-4 gap-2">
                          <button
                            onClick={() => setEditingPodcastTrack(track)}
                            className="p-2 text-white/20 hover:text-white transition-colors"
                            title="Edit details"
                          >
                            <Settings size={16} />
                          </button>
                          <button onClick={() => handleDeletePersonal(track.id)} className="p-2 text-white/20 hover:text-red-500 transition-colors" title="Remove from locker">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ))
              ) : (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                  <FileMusic size={48} className="text-white/5 mx-auto mb-4" />
                  <p className="text-white/20 uppercase font-black tracking-[0.5em]">Your vault is empty.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === 'PLAYLISTS' && (
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-white/40">Your Playlists</h4>
              <button 
                onClick={() => setIsCreatePlaylistOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-small-orange text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
              >
                <Plus size={14} />
                New Playlist
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
              {playlists.map(playlist => (
                <div key={playlist.id} className="group cursor-pointer">
                  <div className="relative aspect-square rounded-[2.5rem] overflow-hidden mb-4 bg-white/5 shadow-2xl">
                    <img src={playlist.coverUrl || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={playlist.title} />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <button className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-black">
                        <Play size={28} fill="black" />
                      </button>
                    </div>
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest truncate mb-1">{playlist.title}</h4>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{playlist.trackIds.length} Tracks</p>
                </div>
              ))}
              {playlists.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                  <ListMusic size={48} className="text-white/5 mx-auto mb-4" />
                  <p className="text-white/20 uppercase font-black tracking-[0.5em]">No playlists created yet.</p>
                </div>
              )}
            </div>
          </div>
        )}
        {activeSubTab === 'SYNC' && (
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-white/40">Local Device Sync</h4>
                <p className="text-[10px] text-white/20 uppercase tracking-widest mt-1">Play local files directly from your device</p>
              </div>
              <button 
                onClick={connectSyncFolder}
                className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
              >
                <FolderSync size={14} />
                Connect Local Folder
              </button>
              <input 
                ref={localFolderInputRef}
                type="file" 
                {...({ webkitdirectory: true, directory: true } as any)}
                multiple 
                onChange={processLocalFiles} 
                className="hidden" 
              />
            </div>

            {savedDirectories.length > 0 && (
              <div className="flex flex-wrap gap-4 mt-4">
                {savedDirectories.map(dir => (
                  <div key={dir.id} className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
                    <FolderSync size={16} className={dir.needsAuth ? "text-yellow-500" : "text-green-500"} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{dir.name}</span>
                    {dir.needsAuth ? (
                       <button onClick={() => reAuthFolder(dir)} className="text-[9px] font-bold text-yellow-500 hover:text-yellow-300 uppercase underline">Reconnect</button>
                    ) : (
                       <span className="text-[9px] font-bold text-green-500 uppercase">Synced</span>
                    )}
                    <button onClick={() => removeSyncFolder(dir.id)} className="ml-2 text-white/30 hover:text-white/60"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            
            <div className={viewMode === 'GRID' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 mt-8' : 'flex flex-col gap-2 mt-8'}>
               {localTracks.length > 0 ? (
                 localTracks.map((track) => (
                  viewMode === 'GRID' ? (
                    <div key={`sync-grid-${track.id}`} className="group cursor-pointer">
                      <div className="relative aspect-square rounded-[2rem] overflow-hidden mb-3 bg-white/5 flex items-center justify-center border border-white/10">
                        <FileMusic size={48} className="text-white/10 group-hover:scale-110 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <button onClick={() => playTrackFromList(track, localTracks, 'Local Sync')} className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black">
                            <Play size={24} fill="black" />
                          </button>
                        </div>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-widest truncate">{track.title || 'Untitled Track'}</h4>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">{track.artist}</p>
                    </div>
                  ) : (
                    <div key={`sync-list-${track.id}`} className="group flex items-center gap-4 p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/[0.08] transition-all">
                      <div className="relative w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                        <FileMusic size={20} className="text-white/20" />
                        <button onClick={() => playTrackFromList(track, localTracks, 'Local Sync')} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Play size={16} fill="white" />
                        </button>
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold uppercase tracking-wider truncate">{track.title || 'Untitled Track'}</h4>
                          <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest truncate">{track.artist}</p>
                        </div>
                        <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest truncate">Local Media</div>
                      </div>
                    </div>
                  )
                 ))
               ) : (
                  <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                    <Folder size={48} className="text-white/5 mx-auto mb-4" />
                    <p className="text-white/20 uppercase font-black tracking-[0.5em]">No local folders connected.</p>
                  </div>
               )}
            </div>
          </div>
        )}
      </div>

      {/* Create Playlist Modal */}
      <AnimatePresence>
        {isCreatePlaylistOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-theme-card border border-white/10 rounded-[3rem] p-10 shadow-3xl relative"
            >
              <button 
                onClick={() => setIsCreatePlaylistOpen(false)}
                className="absolute top-8 right-8 text-white/20 hover:text-white transition-all"
              >
                <X size={24} />
              </button>
              <h3 className="text-2xl font-black uppercase tracking-tightest mb-6">Create Playlist</h3>
              <input 
                type="text"
                placeholder="Playlist Name"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white mb-8 outline-none focus:border-small-orange transition-all font-bold"
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsCreatePlaylistOpen(false)}
                  className="flex-1 py-4 bg-white/5 text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreatePlaylist}
                  className="flex-1 py-4 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:scale-105 transition-all"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MyLibraryView;
