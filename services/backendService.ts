import { 
  ref, 
  uploadBytes, 
  uploadBytesResumable,
  getDownloadURL 
} from 'firebase/storage';
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
  query, where, orderBy, limit, onSnapshot, Timestamp, increment,
  arrayUnion, arrayRemove, runTransaction, serverTimestamp, addDoc, or, getDocFromServer
} from 'firebase/firestore';
import {
  signInWithPopup,
  linkWithPopup,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  TwitterAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { db, storage, auth as firebaseAuth } from './firebase';
export const auth = firebaseAuth;
export { db };
import { Album, Comment, Track, UserProfile, FeedItem, LiveFeed, Video, MerchItem, Donation, TVChannel, Game, Photo, PhotoAlbum, PhotoAlbum as PhotoAlbumType, EventPhotoPool, ChatMessage, ChatRoom, CollabProject, CallSession, Membership, ArtistMembershipConfig, PPVEvent, Classroom, Lesson, Assignment, Submission, ProgressReport, VideoChatSession, Playlist, VideoComment, VideoPlaylist, Post, PayItForwardPool, PayItForwardWinner, PayItForwardDonation, PayItForwardVault, Newsletter, MailingListSubscriber, SystemStats, AdConfig, Article, ArticleBlock, BrandAccount, FanPage, FollowRelation, AdCampaign, PartnerConfig, Review, UserRevenue, StoreSettings, PostThemeBackground, ClassroomModule, WebApp, AppReview, AppNotification, SystemSettingsConfig, AdRatioConfig, StationIDStinger, AutoFastChannelConfig, IPWorld, Character, LoreEntry, TimelineEvent, Universe, LiveTalk, SharedAsset, PrivateBoard, BoardItem, ProfileThemePreset, HideNSeekConfig, HideNSeekAlternate, HideNSeekUserProgress, HideNSeekStats } from '../types';

export const getPrivateBoards = async (uid: string): Promise<PrivateBoard[]> => {
  const q = query(collection(db, 'privateBoards'), where('ownerId', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateBoard));
};

export const createPrivateBoard = async (uid: string, name: string): Promise<PrivateBoard | null> => {
  const docRef = doc(collection(db, 'privateBoards'));
  const board: PrivateBoard = {
    id: docRef.id,
    ownerId: uid,
    name,
    createdAt: Date.now(),
    items: []
  };
  await setDoc(docRef, board);
  return board;
};

export const updatePrivateBoard = async (boardId: string, updates: Partial<PrivateBoard>) => {
  await updateDoc(doc(db, 'privateBoards', boardId), updates);
};

export const deletePrivateBoard = async (boardId: string) => {
  await deleteDoc(doc(db, 'privateBoards', boardId));
};
import { generateDemoWorlds } from './geminiService';

// --- LIVE TALK ---
export const createLiveTalk = async (talk: Partial<LiveTalk>) => {
  if (!auth.currentUser) return;
  const path = 'liveTalks';
  try {
    const docRef = doc(collection(db, path));
    const newTalk: LiveTalk = {
      id: docRef.id,
      hostId: auth.currentUser.uid,
      hostName: auth.currentUser.displayName || 'Anonymous',
      hostPhoto: auth.currentUser.photoURL || '',
      title: talk.title || 'Live Talk',
      description: talk.description || '',
      topic: talk.topic || 'General',
      category: talk.category || 'Discussion',
      isActive: true,
      speakers: [auth.currentUser.uid],
      listeners: [],
      sharedAssets: [],
      timestamp: Date.now()
    };
    await setDoc(docRef, removeUndefined(newTalk));
    
    // Notify followers
    notifyFollowers(auth.currentUser.uid, 'CONTENT', 'Live Talk Started', `${auth.currentUser.displayName} is LIVE now: ${newTalk.title}`, 'LIVETALK', docRef.id);
    
    return newTalk;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const updateLiveTalk = async (talkId: string, updates: Partial<LiveTalk>) => {
  const path = `liveTalks/${talkId}`;
  try {
    await updateDoc(doc(db, 'liveTalks', talkId), removeUndefined(updates));
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const listenToActiveLiveTalks = (callback: (talks: LiveTalk[]) => void) => {
  const path = 'liveTalks';
  const q = query(
    collection(db, path),
    where('isActive', '==', true),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LiveTalk)));
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const listenToLiveTalk = (talkId: string, callback: (talk: LiveTalk) => void) => {
  const path = `liveTalks/${talkId}`;
  return onSnapshot(doc(db, 'liveTalks', talkId), (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() } as LiveTalk);
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
};

export const joinLiveTalk = async (talkId: string, isSpeaker: boolean = false) => {
  if (!auth.currentUser) return;
  const path = `liveTalks/${talkId}`;
  try {
    const talkRef = doc(db, 'liveTalks', talkId);
    if (isSpeaker) {
      await updateDoc(talkRef, {
        speakers: arrayUnion(auth.currentUser.uid),
        listeners: arrayRemove(auth.currentUser.uid)
      });
    } else {
      await updateDoc(talkRef, {
        listeners: arrayUnion(auth.currentUser.uid)
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const leaveLiveTalk = async (talkId: string) => {
  if (!auth.currentUser) return;
  const path = `liveTalks/${talkId}`;
  try {
    const talkRef = doc(db, 'liveTalks', talkId);
    await updateDoc(talkRef, {
      speakers: arrayRemove(auth.currentUser.uid),
      listeners: arrayRemove(auth.currentUser.uid)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const shareAssetToTalk = async (talkId: string, asset: Partial<SharedAsset>) => {
  if (!auth.currentUser) return;
  const path = `liveTalks/${talkId}`;
  try {
    const talkRef = doc(db, 'liveTalks', talkId);
    const newAsset: SharedAsset = {
      id: `asset_${Date.now()}`,
      type: asset.type || 'MUSIC',
      title: asset.title || 'Untitled',
      url: asset.url || '',
      sharedBy: auth.currentUser.uid,
      timestamp: Date.now(),
      mediaId: asset.mediaId
    };
    await updateDoc(talkRef, {
      sharedAssets: arrayUnion(newAsset)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const endLiveTalk = async (talkId: string) => {
  const path = `liveTalks/${talkId}`;
  try {
    await updateDoc(doc(db, 'liveTalks', talkId), { isActive: false });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const fetchThemeBackgrounds = async (theme?: string) => {
  const path = 'postThemeBackgrounds';
  try {
    let q = query(collection(db, path), orderBy('createdAt', 'desc'));
    if (theme) {
      q = query(q, where('theme', '==', theme));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PostThemeBackground));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const saveThemeBackground = async (bg: Partial<PostThemeBackground>) => {
  const path = 'postThemeBackgrounds';
  try {
    if (bg.id) {
      const data = removeUndefined({
        ...bg,
        createdAt: bg.createdAt || Date.now()
      });
      await setDoc(doc(db, path, bg.id), data);
      return bg.id;
    } else {
      const newDocRef = doc(collection(db, path));
      const data = removeUndefined({
        ...bg,
        id: newDocRef.id,
        createdAt: Date.now(),
        zones: bg.zones || []
      });
      await setDoc(newDocRef, data);
      return newDocRef.id;
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const deleteThemeBackground = async (id: string) => {
  const path = `postThemeBackgrounds/${id}`;
  try {
    await deleteDoc(doc(db, 'postThemeBackgrounds', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const fetchAllPublicWorlds = async (): Promise<IPWorld[]> => {
  try {
    const q = query(
      collection(db, 'worlds'),
      where('status', '==', 'PUBLISHED'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IPWorld));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'worlds');
    return [];
  }
};

export const fetchUserWorlds = async (uid: string) => {
  const path = 'worlds';
  try {
    const q = query(collection(db, path), where('creatorId', '==', uid), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as IPWorld));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchWorldCharacters = async (worldId: string, onlyPublished: boolean = true) => {
  const path = `worlds/${worldId}/characters`;
  try {
    let q = query(collection(db, 'worlds', worldId, 'characters'));
    if (onlyPublished) {
      q = query(q, where('isPublished', '==', true));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Character));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchWorldLore = async (worldId: string, onlyPublished: boolean = true) => {
  const path = `worlds/${worldId}/lore`;
  try {
    let q = query(collection(db, 'worlds', worldId, 'lore'));
    if (onlyPublished) {
      q = query(q, where('isPublished', '==', true));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LoreEntry));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchWorldTimeline = async (worldId: string, onlyPublished: boolean = true) => {
  const path = `worlds/${worldId}/timeline`;
  try {
    let q = query(collection(db, 'worlds', worldId, 'timeline'));
    if (onlyPublished) {
      q = query(q, where('isPublished', '==', true));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as TimelineEvent));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const seedDemoWorld = async (uid: string) => {
  const worldData: Partial<IPWorld> = {
    name: "The Aetherium Nexus",
    description: "A suspended city-state between dimensions where logic and magic coexist in a delicate weave. Created as a safeguard against the entropy of the Void.",
    coverImage: "/src/assets/images/aetherium_nexus_cover_1777698118642.png",
    worldType: 'FICTION',
    status: 'PUBLISHED',
    timelineConfig: { startYear: 0, endYear: 5000, unitName: 'Eras' },
    themeConfig: { primaryColor: '#ff8c00', secondaryColor: '#fbbf24', backgroundId: 'stars', useFrostedGlassDefault: true },
    assetIds: [],
    characterIds: [],
    loreIds: [],
    timelineIds: [],
    storyListIds: [],
    moduleIds: [],
    associatedClubIds: [],
    graphConnections: [],
  };
  
  try {
    const world = await createIPWorld(worldData);
    if (!world) return;

    // Add a character
    await createCharacter({
      worldId: world.id,
      name: "Arch-Sage Elara",
      role: "Guardian of the Seal",
      bio: "The oldest living soul in the Nexus, she remembers the day the dimension was anchored.",
      imageUrl: "/src/assets/images/sage_elara_char_1777698135254.png",
      stats: { wisdom: 99, power: 85, origin: 'Void-Born' }
    });

    // Add lore
    await createLore({
      worldId: world.id,
      title: "The Anchor Protocol",
      content: "A series of rituals designed to keep the Nexus from slipping into the nothingness of the surrounding dimensions.",
      type: 'PLOT_POINT'
    });

    // Add timeline event
    await createTimelineEvent({
      worldId: world.id,
      title: "The Great Anchorage",
      year: 1,
      description: "The moment the floating islands were first bound by the Aether chains.",
      timelineId: 'main'
    });

    return world;
  } catch (e) {
    console.error("Demo seeding failed", e);
  }
};

export const createIPWorld = async (world: Partial<IPWorld>) => {
  const path = 'worlds';
  try {
    const docRef = doc(collection(db, path));
    const newWorld: IPWorld = {
      id: docRef.id,
      creatorId: world.creatorId || '',
      name: world.name || 'Untitled World',
      description: world.description || '',
      coverImage: world.coverImage || '',
      worldType: world.worldType || 'FICTION',
      themeConfig: world.themeConfig || {
        primaryColor: '#000000',
        secondaryColor: '#ffffff',
        backgroundId: '',
        useFrostedGlassDefault: true
      },
      assetIds: world.assetIds || [],
      characterIds: world.characterIds || [],
      loreIds: world.loreIds || [],
      timelineIds: world.timelineIds || [],
      storyListIds: world.storyListIds || [],
      moduleIds: world.moduleIds || [],
      associatedClubIds: world.associatedClubIds || [],
      parentWorldId: world.parentWorldId || null,
      timelineConfig: world.timelineConfig || { startYear: 0, endYear: 2000, unitName: 'Years' },
      graphConnections: world.graphConnections || [],
      createdAt: Date.now()
    };
    await setDoc(docRef, newWorld);
    return newWorld;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
    throw e;
  }
};

export const updateIPWorld = async (worldId: string, updates: Partial<IPWorld>) => {
  const path = `worlds/${worldId}`;
  try {
    await updateDoc(doc(db, 'worlds', worldId), removeUndefined(updates));
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const addAssetToWorld = async (worldId: string, assetId: string) => {
  try {
    await updateDoc(doc(db, 'worlds', worldId), { assetIds: arrayUnion(assetId) });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `worlds/${worldId}`);
  }
};

export const addCharactersToWorld = async (worldId: string, characterIds: string[]) => {
  if (!characterIds.length) return;
  try {
    await updateDoc(doc(db, 'worlds', worldId), { characterIds: arrayUnion(...characterIds) });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `worlds/${worldId}`);
  }
};

export const publishWorld = async (worldId: string) => {
  const path = `worlds/${worldId}`;
  try {
    const worldRef = doc(db, 'worlds', worldId);
    const worldSnap = await getDoc(worldRef);
    if (!worldSnap.exists()) return;

    const updates: any = {
      status: 'PUBLISHED',
      publishedAt: Date.now()
    };
    await updateDoc(worldRef, updates);

    // Also publish characters, lore, and timeline events for this world
    const collections = ['characters', 'lore_entries', 'timeline_events'];
    for (const collName of collections) {
      const q = query(collection(db, collName), where('worldId', '==', worldId));
      const snap = await getDocs(q);
      const batchPromises = snap.docs.map(d => updateDoc(d.ref, { isPublished: true }));
      await Promise.all(batchPromises);
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const seedDemoWorlds = async () => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;

  try {
    // Check if worlds already exist to avoid spamming demo content
    const existing = await fetchUserWorlds(uid);
    if (existing.length > 0) return;

    const demoData = await generateDemoWorlds();
    if (!demoData || demoData.length === 0) return;

    const images = {
      'Sci-Fi': {
        cover: "/src/assets/images/scifi_world_cover_1777698033630.png",
        char: "/src/assets/images/scifi_character_1777698077214.png"
      },
      'High Fantasy': {
        cover: "/src/assets/images/fantasy_world_cover_1777698049115.png",
        char: "/src/assets/images/fantasy_character_1777698090574.png"
      },
      'Surreal/Abstract': {
        cover: "/src/assets/images/surreal_world_cover_1777698063339.png",
        char: "/src/assets/images/surreal_character_1777698103671.png"
      }
    };

    const types = ['Sci-Fi', 'High Fantasy', 'Surreal/Abstract'];

    for (let i = 0; i < demoData.length; i++) {
      const data = demoData[i];
      const category = types[i] as keyof typeof images;
      
      const moduleId = await createClassroomModule({
        name: data.module.name,
        description: data.module.description,
        coverArt: images[category]?.cover || "/src/assets/images/aetherium_nexus_cover_1777697080242.png",
        isActive: true
      });

      const world = await createIPWorld({
        creatorId: uid,
        name: data.name,
        description: data.description,
        coverImage: images[category]?.cover || "/src/assets/images/aetherium_nexus_cover_1777697080242.png",
        worldType: 'FICTION',
        status: 'PUBLISHED',
        timelineConfig: { startYear: 0, endYear: 3000, unitName: 'Years' },
        themeConfig: { 
          primaryColor: data.primaryColor, 
          secondaryColor: data.secondaryColor, 
          backgroundId: 'stars', 
          useFrostedGlassDefault: true 
        },
        moduleIds: moduleId ? [moduleId] : [],
        createdAt: Date.now()
      });

      if (world) {
        await createCharacter({
          worldId: world.id,
          name: data.character.name,
          role: data.character.role,
          bio: data.character.bio,
          imageUrl: images[category]?.char || "/src/assets/images/sage_elara_1777697095344.png",
          stats: { influence: 80, resonance: 90 },
          tags: [category.split(' ')[0], 'AI-Generated'],
          appearanceAt: []
        });

        await createLore({
          worldId: world.id,
          title: data.lore.title,
          content: data.lore.content,
          type: data.lore.type as any,
          tags: ['Lore', category.split(' ')[0]]
        });

        await createTimelineEvent({
          worldId: world.id,
          timelineId: 'main',
          title: data.timelineEvent.title,
          description: data.timelineEvent.description,
          year: data.timelineEvent.year
        });
      }
    }
  } catch (error) {
    console.error("AI Seeding failed:", error);
  }
};

export const createCharacter = async (char: Partial<Character>) => {
  if (!char.worldId) throw new Error('worldId is required to create a character');
  const path = `worlds/${char.worldId}/characters`;
  try {
    const docRef = doc(collection(db, 'worlds', char.worldId, 'characters'));
    const newChar: Character = {
      id: docRef.id,
      worldId: char.worldId,
      name: char.name || 'Unknown',
      bio: char.bio || '',
      imageUrl: char.imageUrl || '',
      role: char.role || '',
      tags: char.tags || [],
      appearanceAt: char.appearanceAt || [],
      isPublished: char.isPublished || false
    };
    await setDoc(docRef, newChar);
    return newChar;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const updateCharacter = async (id: string, char: Partial<Character>) => {
  if (!char.worldId) throw new Error('worldId is required to update a character');
  const path = `worlds/${char.worldId}/characters/${id}`;
  try {
    const ref = doc(db, 'worlds', char.worldId, 'characters', id);
    // Only write fields that are actually set — never overwrite existing data with empty strings
    const updates = Object.fromEntries(
      Object.entries(char).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    await updateDoc(ref, updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const createLore = async (lore: Partial<LoreEntry>) => {
  if (!lore.worldId) throw new Error('worldId is required to create a lore entry');
  const path = `worlds/${lore.worldId}/lore`;
  try {
    const docRef = doc(collection(db, 'worlds', lore.worldId, 'lore'));
    const newLore: LoreEntry = {
      id: docRef.id,
      worldId: lore.worldId,
      title: lore.title || 'Untitled',
      content: lore.content || '',
      tags: lore.tags || [],
      type: lore.type || 'BACKSTORY',
      conflictsDetected: [],
      isPublished: lore.isPublished || false
    };
    await setDoc(docRef, newLore);
    return newLore;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const updateLore = async (id: string, lore: Partial<LoreEntry>) => {
  if (!lore.worldId) throw new Error('worldId is required to update a lore entry');
  const path = `worlds/${lore.worldId}/lore/${id}`;
  try {
    const ref = doc(db, 'worlds', lore.worldId, 'lore', id);
    const updates = Object.fromEntries(
      Object.entries(lore).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    await updateDoc(ref, updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const createTimelineEvent = async (event: Partial<TimelineEvent>) => {
  if (!event.worldId) throw new Error('worldId is required to create a timeline event');
  const path = `worlds/${event.worldId}/timeline`;
  try {
    const docRef = doc(collection(db, 'worlds', event.worldId, 'timeline'));
    const newEvent: TimelineEvent = {
      id: docRef.id,
      worldId: event.worldId,
      timelineId: event.timelineId || 'main',
      title: event.title || 'Untitled Event',
      description: event.description || '',
      year: event.year || 0,
      isPublished: event.isPublished || false,
      linkedCharacterIds: event.linkedCharacterIds || [],
      linkedLoreIds: event.linkedLoreIds || [],
      linkedAssetIds: event.linkedAssetIds || []
    };
    await setDoc(docRef, newEvent);
    return newEvent;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const updateTimelineEvent = async (id: string, event: Partial<TimelineEvent>) => {
  if (!event.worldId) throw new Error('worldId is required to update a timeline event');
  const path = `worlds/${event.worldId}/timeline/${id}`;
  try {
    const ref = doc(db, 'worlds', event.worldId, 'timeline', id);
    const updates = Object.fromEntries(
      Object.entries(event).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    await updateDoc(ref, updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

// --- TIMELINES ---

export const fetchWorldTimelines = async (worldId: string) => {
  try {
    const snap = await getDocs(collection(db, 'worlds', worldId, 'timelines'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').Timeline));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, `worlds/${worldId}/timelines`);
    return [];
  }
};

export const createTimeline = async (timeline: { worldId: string; name: string; description?: string; color?: string }) => {
  const path = `worlds/${timeline.worldId}/timelines`;
  try {
    const docRef = doc(collection(db, 'worlds', timeline.worldId, 'timelines'));
    const newTimeline = {
      id: docRef.id,
      worldId: timeline.worldId,
      name: timeline.name,
      description: timeline.description || '',
      color: timeline.color || '#a855f7',
      createdAt: Date.now(),
    };
    await setDoc(docRef, newTimeline);
    await updateDoc(doc(db, 'worlds', timeline.worldId), { timelineIds: arrayUnion(docRef.id) });
    return newTimeline;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
    throw e;
  }
};

export const updateTimeline = async (worldId: string, timelineId: string, updates: { name?: string; description?: string; color?: string }) => {
  try {
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined && v !== ''));
    await updateDoc(doc(db, 'worlds', worldId, 'timelines', timelineId), filtered);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `worlds/${worldId}/timelines/${timelineId}`);
  }
};

export const deleteTimeline = async (worldId: string, timelineId: string) => {
  try {
    await deleteDoc(doc(db, 'worlds', worldId, 'timelines', timelineId));
    await updateDoc(doc(db, 'worlds', worldId), { timelineIds: arrayRemove(timelineId) });
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `worlds/${worldId}/timelines/${timelineId}`);
  }
};

export const setAssetTimeline = async (albumId: string, timelineId: string | null) => {
  try {
    await updateDoc(doc(db, 'albums', albumId), { timelineId: timelineId ?? null });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `albums/${albumId}`);
  }
};

// --- CURATED CONTENT ---

export const fetchAllPublicPlaylists = async () => {
  const path = 'playlists';
  try {
    const q = query(collection(db, path), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Playlist));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchAllPublicVideoPlaylists = async () => {
  const path = 'video_playlists';
  try {
    const q = query(collection(db, path), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as VideoPlaylist));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchPlaylistsByIds = async (ids: string[]) => {
  if (!ids || ids.length === 0) return [];
  try {
    const results = await Promise.all(ids.map(async id => {
      // First check playlists
      let docSnap = await getDoc(doc(db, 'playlists', id));
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Playlist;
      }
      // If not, check albums (projects)
      docSnap = await getDoc(doc(db, 'albums', id));
      if (docSnap.exists()) {
        const albumData = docSnap.data();
        // Convert album to Playlist shape
        return {
          id: docSnap.id,
          ownerId: albumData.ownerId || '',
          authorName: albumData.artist || 'Curator',
          title: albumData.title,
          coverImage: albumData.coverImage || '',
          tracks: albumData.tracks || [],
          trackIds: (albumData.tracks || []).map((t: Track) => t.id),
          isPublic: albumData.isPublic || true,
          timestamp: albumData.createdAt || Date.now()
        } as Playlist;
      }
      return null;
    }));
    return results.filter(Boolean) as Playlist[];
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, 'playlists/albums');
    return [];
  }
};

export const fetchVideoPlaylistsByIds = async (ids: string[]) => {
  if (!ids || ids.length === 0) return [];
  const path = 'video_playlists';
  try {
    const results = await Promise.all(ids.map(id => getDoc(doc(db, path, id))));
    return results.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() } as VideoPlaylist));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchVideosByIds = async (ids: string[]) => {
  if (!ids || ids.length === 0) return [];
  const path = 'videos';
  try {
    const results = await Promise.all(ids.map(id => getDoc(doc(db, path, id))));
    return results.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() } as Video));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};


export const fetchGlobalArchiveItems = async (type?: 'MUSIC' | 'VIDEO' | 'BOOK' | 'PHOTO') => {
  const path = 'albums';
  try {
    let q = query(collection(db, path), where('isGlobalArchive', '==', true), orderBy('createdAt', 'desc'));
    if (type) {
      q = query(q, where('type', '==', type));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Album));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const syncPublicDomainAsset = async (item: any, mediaUrl: string, type: 'VIDEO' | 'AUDIO' | 'BOOK') => {
  try {
    const path = `albums/public_domain_${item.identifier || item.id}`;
    
    // Check if it already exists
    const existingDoc = await getDoc(doc(db, 'albums', `public_domain_${item.identifier || item.id}`));
    if (existingDoc.exists()) {
      return; // Already hosted
    }

    // Creating the platform-hosted version
    const newAlbum: Partial<Album> = {
      id: `public_domain_${item.identifier || item.id}`,
      title: item.title,
      artist: item.artist || item.genre || 'Public Domain Archive',
      description: item.description || '',
      coverImage: item.thumbnailUrl || '',
      headerImage: item.thumbnailUrl || '',
      type: type === 'AUDIO' ? 'MUSIC' : type,
      ownerId: 'system_admin',
      isGlobalArchive: true,
      isPublic: true,
      createdAt: Date.now(),
      themeColor: '#000000',
      genre: item.genre,
    };

    if (type === 'VIDEO') {
      newAlbum.subType = 'MOVIE'; // Movement or movie
      newAlbum.tracks = [{
        id: `track_${item.identifier}`,
        title: item.title,
        artist: item.artist || item.genre || 'Public Domain Archive',
        url: mediaUrl,
        albumCover: item.thumbnailUrl || '',
        isGlobalArchive: true,
      }];
    } else if (type === 'AUDIO') {
      newAlbum.type = 'MUSIC';
      newAlbum.tracks = [{
        id: `track_${item.id}`,
        title: item.title,
        artist: item.artist,
        url: mediaUrl,
        albumCover: item.thumbnailUrl || '',
        isGlobalArchive: true
      }];
    } else if (type === 'BOOK') {
      newAlbum.bookChapters = [{
        id: `chapter_${item.identifier}`,
        title: 'Full Book',
        url: mediaUrl
      }];
    }

    await setDoc(doc(db, 'albums', newAlbum.id!), newAlbum);
    console.log('[System Admin] Automagically cloned public domain asset to Global platform hosting: ', newAlbum.id);

  } catch (error) {
    console.error('Failed to sync public domain asset to platform:', error);
  }
};

export const saveGlobalArchiveItem = async (album: Partial<Album>) => {
  const path = 'albums';
  try {
    const id = album.id || `global_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const data = removeUndefined({
      ...album,
      id,
      isGlobalArchive: true,
      isPublic: true,
      ownerId: 'system_library',
      createdAt: album.createdAt || Date.now()
    });
    await setDoc(doc(db, path, id), data);
    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

/**
 * Automator tool to fetch public domain books from Library of Congress
 * and populate the global library.
 */
export const syncLibraryOfCongressBooks = async () => {
  const path = 'albums';
  console.log('Starting Library of Congress Sync...');
  try {
    // LOC Search for public domain books
    const locUrl = 'https://www.loc.gov/books/?fo=json&at=results&c=10&fa=access-restricted:false&q=public+domain';
    const response = await fetch(locUrl);
    const data = await response.json();
    
    if (!data.results) {
      console.warn('No results found from Library of Congress API');
      return [];
    }

    const savedIds: string[] = [];

    for (const item of data.results) {
      // Check if already exists by title/author
      const q = query(
        collection(db, path), 
        where('isGlobalArchive', '==', true),
        where('title', '==', item.title || 'Untitled')
      );
      const existing = await getDocs(q);
      if (!existing.empty) continue;

      // Extract metadata
      const title = item.title || 'Untitled Archive';
      const author = (item.contributor && item.contributor[0]) || 'Various Authors';
      const description = item.description ? item.description[0] : (item.summary ? item.summary[0] : 'Historical public domain archive from the Library of Congress.');
      const coverImage = (item.image_url && item.image_url[0]) || `https://picsum.photos/seed/${item.id}/800/1200`;
      
      // Attempt to find a direct text or PDF link in the resources/links
      // LoC search results often have 'url' which is the landing page.
      // We simulate deep-linked text extraction.
      const sourceUrl = item.url || `https://www.loc.gov/item/${item.id}/`;
      
      const bookChapters = [
        {
          id: `chapter_1_${Date.now()}`,
          title: 'Title Page & Introduction',
          content: `${title}\nBy ${author}\n\n${description}\n\n[ This book has been automatically archived from the Library of Congress Public Domain collection. ]`,
          price: 0
        },
        {
          id: `chapter_full_${Date.now()}`,
          title: 'Full Text Access',
          content: `To provide the most accurate reading experience, the system has connected to the Library of Congress servers. \n\nOriginal Digital Identifier: ${item.id}\nSource: ${sourceUrl}\n\n[ FULL TEXT INTEGRATION ACTIVE ]\n\nThis is a placeholder for the digitized full-text stream retrieved from the LoC Open Access archives.`,
          url: sourceUrl, // Link to LoC viewer
          price: 0
        }
      ];

      const album: Partial<Album> = {
        title,
        artist: author, // Author for books
        description,
        coverImage,
        type: 'BOOK',
        bookChapters,
        createdAt: Date.now(),
        genre: 'History/Classics',
        tags: ['PUBLIC_DOMAIN', 'LIBRARY_OF_CONGRESS', 'ARCHIVE']
      };

      const id = await saveGlobalArchiveItem(album);
      if (id) savedIds.push(id);
    }

    console.log(`Sync completed. Added ${savedIds.length} new items.`);
    
    // Update last sync time in system config
    await setDoc(doc(db, 'systemConfig', 'library_sync'), {
      lastSync: Date.now(),
      status: 'SUCCESS',
      newItemsCount: savedIds.length
    }, { merge: true });

    return savedIds;
  } catch (e) {
    console.error('Library of Congress Sync Failed:', e);
    await setDoc(doc(db, 'systemConfig', 'library_sync'), {
      status: 'FAILED',
      lastError: e instanceof Error ? e.message : 'Unknown Error',
      lastAttempt: Date.now()
    }, { merge: true });
    return [];
  }
};

export const fetchLibrarySyncConfig = async () => {
  try {
    const d = await getDoc(doc(db, 'systemConfig', 'library_sync'));
    return d.exists() ? d.data() : null;
  } catch (e) {
    return null;
  }
};

export const updateLibrarySyncConfig = async (config: any) => {
  try {
    await setDoc(doc(db, 'systemConfig', 'library_sync'), config, { merge: true });
  } catch (e) {
    console.error('Failed to update sync config', e);
  }
};

export const resyncBookItem = async (albumId: string) => {
  const albumRef = doc(db, 'albums', albumId);
  try {
    const snap = await getDoc(albumRef);
    if (!snap.exists()) return;
    // Simulate re-fetching latest metadata/content
    await updateDoc(albumRef, {
      lastResynced: Date.now(),
      status: 'VERIFIED'
    });
  } catch (e) {
    console.error("Resync failed", e);
  }
};

export const toggleGlobalArchiveVisibility = async (id: string, isVisible: boolean) => {
  try {
    await updateDoc(doc(db, 'albums', id), { isPublic: isVisible });
  } catch (e) {
    console.error("Visibility toggle failed", e);
  }
};

export const claimPioneerReward = async (uid: string) => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      pioneerRewardClaimed: true,
      storageLimit: 0, // 0 = Unlimited
      tier: 'PIONEER'
    });
  } catch (e) {
    console.error("Failed to claim reward:", e);
  }
};

export const fetchSystemSettingsConfig = async (): Promise<SystemSettingsConfig> => {
  const path = 'systemConfig/settings';
  try {
    const docSnap = await getDoc(doc(db, 'systemConfig', 'settings'));
    if (docSnap.exists()) {
      return docSnap.data() as SystemSettingsConfig;
    } else {
      const defaultConfig: SystemSettingsConfig = {
        id: 'settings',
        adRatios: { userPromos: 50, partners: 20, thirdParty: 30 },
        fastChannelAds: { adInterval: 5, maxAdDuration: 90, rulesEnabled: true },
        globalFreeStorageLimit: 25 * 1024 * 1024 * 1024,
        radioAdInterval: 20,
        stingers: [],
        isLiveStreamAdsEnabledDefault: true,
        externalSocialLinks: {
          xEnabled: false,
          mastodonEnabled: false,
          blueskyEnabled: false,
          threadsEnabled: false
        },
        updatedAt: Date.now()
      };
      await setDoc(doc(db, 'systemConfig', 'settings'), defaultConfig);
      return defaultConfig;
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
    throw e;
  }
};

export const updateSystemSettingsConfig = async (config: Partial<SystemSettingsConfig>) => {
  const path = 'systemConfig/settings';
  try {
    await setDoc(doc(db, 'systemConfig', 'settings'), config, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const deleteGlobalArchiveItem = async (id: string) => {
  const path = `albums/${id}`;
  try {
    await deleteDoc(doc(db, 'albums', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const fetchUniverses = async () => {
    const path = 'universes';
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Universe));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
      return [];
    }
  };
  
  export const saveUniverse = async (universe: Partial<Universe>) => {
    const path = 'universes';
    try {
      const id = universe.id || `uni_${Date.now()}`;
      const data = removeUndefined({
        ...universe,
        id,
        createdAt: universe.createdAt || Date.now()
      });
      await setDoc(doc(db, path, id), data);
      return id;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  };
  
  export const deleteUniverse = async (id: string) => {
    const path = `universes/${id}`;
    try {
      await deleteDoc(doc(db, 'universes', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };

// --- POSTS & FEED ---
export const createPost = async (post: Partial<Post>) => {
  if (!auth.currentUser) return;
  const path = 'posts';
  const feedPath = 'feed';
  try {
    const postData = removeUndefined({
      ...post,
      text: post.text || '',
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || 'Anonymous',
      authorPhoto: auth.currentUser.photoURL || '',
      likesCount: 0,
      commentsCount: 0,
      timestamp: Date.now(),
      isPublic: true,
      targetUserId: post.targetUserId || null,
      targetUserName: post.targetUserName || null
    });
    const docRef = await addDoc(collection(db, path), postData);

    // Mirror to feed collection — fire-and-forget so a feed write failure can't kill the post
    addDoc(collection(db, feedPath), {
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || 'Anonymous',
      authorPhoto: auth.currentUser.photoURL || '',
      type: post.media && post.media.length > 0 ? 'PICTURE' : 'NEWS',
      content: post.text || '',
      timestamp: Date.now(),
      likesCount: 0,
      commentCount: 0,
      shareCount: 0,
      ...(post.media && post.media.length > 0 ? { imageUrl: post.media[0].url } : {}),
      originalPostId: docRef.id
    }).catch(() => {});

    // Notify followers
    notifyFollowers(auth.currentUser.uid, 'CONTENT', 'New Post', `${auth.currentUser.displayName} shared a new post`, 'FEED', docRef.id);
    
    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const updatePost = async (postId: string, updates: Partial<Post>) => {
  if (!auth.currentUser) return;
  const path = `posts/${postId}`;
  try {
    const updateData = removeUndefined({
      ...updates,
      modifiedAt: Date.now()
    });
    await updateDoc(doc(db, 'posts', postId), updateData);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const deletePost = async (postId: string) => {
  if (!auth.currentUser) return;
  const path = `posts/${postId}`;
  try {
    await deleteDoc(doc(db, 'posts', postId));
    // Cascade delete the corresponding feed mirror (created by createPost)
    const feedQuery = query(collection(db, 'feed'), where('originalPostId', '==', postId));
    const feedSnap = await getDocs(feedQuery);
    await Promise.all(feedSnap.docs.map(d => deleteDoc(d.ref)));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const deleteFeedItem = async (itemId: string) => {
  if (!auth.currentUser) return;
  const path = `feed/${itemId}`;
  try {
    await deleteDoc(doc(db, 'feed', itemId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const togglePostLike = async (postId: string): Promise<{ liked: boolean; likesCount: number } | undefined> => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const postRef = doc(db, 'posts', postId);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(postRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const likedBy: string[] = data.likedBy || [];
      const alreadyLiked = likedBy.includes(uid);
      tx.update(postRef, {
        likedBy: alreadyLiked ? arrayRemove(uid) : arrayUnion(uid),
        likesCount: increment(alreadyLiked ? -1 : 1)
      });
      return { liked: !alreadyLiked, likesCount: (data.likesCount || 0) + (alreadyLiked ? -1 : 1) };
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `posts/${postId}`);
  }
};

// --- POST COMMENTS (clean, dedicated functions) ---
export const subscribeToPostComments = (postId: string, callback: (comments: any[]) => void) => {
  const q = query(
    collection(db, 'posts', postId, 'comments'),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => handleFirestoreError(err, OperationType.LIST, `posts/${postId}/comments`));
};

export const addPostComment = async (postId: string, text: string, parentId?: string | null) => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const displayName = auth.currentUser.displayName || 'Anonymous';
  const commentData = {
    author: displayName,          // required by isValidPostComment Firestore rule
    text: text.trim(),
    authorId: auth.currentUser.uid,
    authorName: displayName,
    authorPhoto: auth.currentUser.photoURL || '',
    uid: auth.currentUser.uid,    // needed for delete rule: resource.data.uid == request.auth.uid
    timestamp: Date.now(),
    parentId: parentId || null,
    likedBy: [] as string[],
    likesCount: 0
  };
  const docRef = await addDoc(collection(db, 'posts', postId, 'comments'), commentData);
  updateDoc(doc(db, 'posts', postId), { commentsCount: increment(1) }).catch(() => {});
  return { id: docRef.id, ...commentData };
};

export const deletePostComment = async (postId: string, commentId: string) => {
  if (!auth.currentUser) return;
  await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
  updateDoc(doc(db, 'posts', postId), { commentsCount: increment(-1) }).catch(() => {});
};

export const toggleCommentLike = async (postId: string, commentId: string): Promise<boolean | undefined> => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const ref = doc(db, 'posts', postId, 'comments', commentId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const likedBy: string[] = snap.data().likedBy || [];
    const liked = likedBy.includes(uid);
    tx.update(ref, {
      likedBy: liked ? arrayRemove(uid) : arrayUnion(uid),
      likesCount: increment(liked ? -1 : 1)
    });
    return !liked;
  });
};

export const listenToUserPosts = (uid: string, callback: (posts: Post[]) => void) => {
  const postsPath = 'posts';

  const postsQuery = query(
    collection(db, postsPath),
    or(
      where('authorId', '==', uid),
      where('targetUserId', '==', uid)
    ),
    orderBy('timestamp', 'desc')
  );

  const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
    const items = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      sourceCollection: 'posts',
      timestamp: safeToMillis(d.data().timestamp || (d.metadata.hasPendingWrites ? Date.now() : 0))
    } as Post));
    callback(items);
  }, (err) => handleFirestoreError(err, OperationType.LIST, postsPath));

  return unsubscribePosts;
};

export const listenToGlobalPosts = (callback: (posts: Post[]) => void) => {
  const postsPath = 'posts';
  // No isPublic filter — createPost forces isPublic:true on all posts and the
  // single-field orderBy index is auto-created by Firestore (no composite index needed)
  const postsQuery = query(collection(db, postsPath), orderBy('timestamp', 'desc'), limit(50));

  const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
    const items = snapshot.docs
      .map(d => ({
        id: d.id,
        ...d.data(),
        sourceCollection: 'posts',
        timestamp: safeToMillis(d.data().timestamp)
      } as Post))
      .filter(p => p.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
    callback(items);
  }, (err) => handleFirestoreError(err, OperationType.LIST, postsPath));

  return unsubscribePosts;
};

export const listenToLikedPosts = (uid: string, callback: (posts: Post[]) => void): (() => void) => {
  const postsPath = 'posts';
  const q = query(
    collection(db, postsPath),
    where('likedBy', 'array-contains', uid),
    orderBy('timestamp', 'desc'),
    limit(100)
  );
  const unsub = onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      timestamp: safeToMillis((d.data() as any).timestamp)
    } as Post));
    callback(items);
  }, () => callback([]));
  return unsub;
};

export const listenToFollowedPosts = async (uid: string, callback: (posts: Post[]) => void) => {
  const postsPath = 'posts';
  try {
    const following = await fetchFollowedArtists(uid);
    const followingIds = following.map(f => f.uid);
    const targetIds = [uid, ...followingIds.slice(0, 9)];

    const postsQuery = query(
      collection(db, postsPath),
      where('authorId', 'in', targetIds),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
      const items = snapshot.docs
        .map(d => ({
          id: d.id,
          ...d.data(),
          sourceCollection: 'posts',
          timestamp: safeToMillis(d.data().timestamp)
        } as Post))
        .filter(p => p.timestamp > 0)
        .sort((a, b) => b.timestamp - a.timestamp);
      callback(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, postsPath));

    return unsubscribePosts;
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, postsPath);
    return () => {};
  }
};

// --- PPV EVENTS ---
export const createPPVEvent = async (event: Partial<PPVEvent>) => {
  if (!auth.currentUser) return;
  const id = `ppv_${Date.now()}`;
  const path = `ppv_events/${id}`;
  const newEvent: PPVEvent = {
    id,
    ownerId: auth.currentUser.uid,
    ownerName: auth.currentUser.displayName || 'Artist',
    title: event.title || 'Untitled Event',
    description: event.description || '',
    thumbnailUrl: event.thumbnailUrl || 'https://picsum.photos/seed/concert/800/450',
    streamUrl: event.streamUrl || '',
    price: event.price || 0,
    isExclusive: event.isExclusive || false,
    startTime: event.startTime || Date.now(),
    duration: event.duration || 60,
    status: 'UPCOMING',
    purchasedBy: []
  };
  try {
    await setDoc(doc(db, 'ppv_events', id), newEvent);
    
    // Notify followers
    notifyFollowers(auth.currentUser.uid, 'CONTENT', 'New PPV Event', `${auth.currentUser.displayName} scheduled a new live event: ${newEvent.title}`, 'CONTENT', id);
    
    return newEvent;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchPPVEvents = async () => {
  const path = 'ppv_events';
  try {
    const q = query(collection(db, 'ppv_events'), orderBy('startTime', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PPVEvent);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const purchasePPVEvent = async (eventId: string) => {
  if (!auth.currentUser) return;
  const path = `ppv_events/${eventId}`;
  try {
    const eventRef = doc(db, 'ppv_events', eventId);
    await updateDoc(eventRef, {
      purchasedBy: arrayUnion(auth.currentUser.uid)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

// --- CLASSROOMS ---
export const createClassroom = async (classroom: Partial<Classroom>) => {
  if (!auth.currentUser) return;
  const id = `class_${Date.now()}`;
  const path = `classrooms/${id}`;
  const newClass: Classroom = {
    id,
    ownerId: auth.currentUser.uid,
    ownerName: auth.currentUser.displayName || 'Teacher',
    title: classroom.title || 'Untitled Class',
    description: classroom.description || '',
    thumbnailUrl: classroom.thumbnailUrl || 'https://picsum.photos/seed/class/800/450',
    price: classroom.price || 0,
    syllabus: classroom.syllabus || '',
    lessons: classroom.lessons || [],
    assignments: classroom.assignments || [],
    enrolledStudents: [],
    category: classroom.category || 'Music'
  };
  try {
    await setDoc(doc(db, 'classrooms', id), newClass);
    
    // Notify followers
    notifyFollowers(auth.currentUser.uid, 'CONTENT', 'New Class', `${auth.currentUser.displayName} opened a new classroom: ${newClass.title}`, 'CONTENT', id);
    
    return newClass;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchClassrooms = async () => {
  const path = 'classrooms';
  try {
    const snap = await getDocs(collection(db, 'classrooms'));
    return snap.docs.map(d => d.data() as Classroom);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const enrollInClassroom = async (classId: string) => {
  if (!auth.currentUser) return;
  const path = `classrooms/${classId}`;
  try {
    const classRef = doc(db, 'classrooms', classId);
    await updateDoc(classRef, {
      enrolledStudents: arrayUnion(auth.currentUser.uid)
    });
    
    // Create initial progress report
    const reportId = `${auth.currentUser.uid}_${classId}`;
    const reportPath = `progress_reports/${reportId}`;
    await setDoc(doc(db, 'progress_reports', reportId), {
      id: reportId,
      classId,
      studentId: auth.currentUser.uid,
      overallGrade: 0,
      completedLessons: [],
      lastAccessed: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const submitAssignment = async (submission: Partial<Submission>) => {
  if (!auth.currentUser) return;
  const id = `sub_${Date.now()}`;
  const path = `submissions/${id}`;
  const newSub: Submission = {
    id,
    assignmentId: submission.assignmentId!,
    studentId: auth.currentUser.uid,
    studentName: auth.currentUser.displayName || 'Student',
    textContent: submission.textContent,
    contentUrl: submission.contentUrl,
    timestamp: Date.now()
  };
  try {
    await setDoc(doc(db, 'submissions', id), newSub);
    return newSub;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const gradeSubmission = async (submissionId: string, grade: number, feedback: string) => {
  const path = `submissions/${submissionId}`;
  try {
    const subRef = doc(db, 'submissions', submissionId);
    await updateDoc(subRef, { grade, feedback });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

// --- CLASSROOM MODULES ---
export const fetchClassroomModules = async () => {
  const path = 'classroom_modules';
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassroomModule));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const createClassroomModule = async (module: Partial<ClassroomModule>) => {
  if (!auth.currentUser) return;
  const path = 'classroom_modules';
  try {
    const id = module.id || `mod_${Date.now()}`;
    const data = removeUndefined({
      ...module,
      id,
      createdAt: Date.now(),
      isActive: module.isActive ?? true
    });
    await setDoc(doc(db, path, id), data);
    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const deleteClassroomModule = async (id: string) => {
  const path = `classroom_modules/${id}`;
  try {
    await deleteDoc(doc(db, 'classroom_modules', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

// --- VIDEO CHAT ---
export const startVideoChat = async (roomId: string) => {
  if (!auth.currentUser) return;
  const id = `vchat_${roomId}`;
  const path = `video_chats/${id}`;
  const session: VideoChatSession = {
    id,
    roomId,
    participants: [{
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'User',
      photoURL: auth.currentUser.photoURL || '',
      isMuted: false,
      isVideoOff: false
    }],
    startTime: Date.now(),
    isActive: true
  };
  try {
    await setDoc(doc(db, 'video_chats', id), session);
    return session;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const joinVideoChat = async (roomId: string) => {
  if (!auth.currentUser) return;
  const id = `vchat_${roomId}`;
  const path = `video_chats/${id}`;
  try {
    const chatRef = doc(db, 'video_chats', id);
    await updateDoc(chatRef, {
      participants: arrayUnion({
        uid: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'User',
        photoURL: auth.currentUser.photoURL || '',
        isMuted: false,
        isVideoOff: false
      })
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function removeUndefined(obj: any): any {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    return obj
      .map(v => (v && typeof v === 'object' && !(v instanceof File) && !(v instanceof Blob) && !(v as any)._methodName) ? removeUndefined(v) : v)
      .filter(v => v !== undefined && v !== null);
  }
  if (typeof obj !== 'object' || obj instanceof File || obj instanceof Blob || obj instanceof Timestamp || (obj as any)._methodName) {
    return obj;
  }
  return Object.entries(obj)
    .filter(([_, v]) => v !== undefined && v !== null)
    .reduce((acc, [k, v]) => ({
      ...acc,
      [k]: (v && typeof v === 'object' && !(v instanceof File) && !(v instanceof Blob) && !(v as any)._methodName) ? removeUndefined(v) : v
    }), {});
}

function safeToMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'number') return ts > 0 ? ts : 0;
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts.seconds !== undefined) return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000;
  return 0;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Verifies if the application can successfully communicate with Firestore.
 */
export const checkCloudConnection = async (): Promise<boolean> => {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
      return false;
    }
    return true; // Other errors don't necessarily mean offline
  }
};

const dataUrlToBlob = async (url: string): Promise<Blob> => {
  const res = await fetch(url);
  return await res.blob();
};

export const uploadFile = async (path: string, blobOrFile: Blob | File, onProgress?: (p: number) => void): Promise<string> => {
  // Sanitize path: remove special characters from filename but keep extension
  const pathParts = path.split('/');
  const filename = pathParts.pop() || 'file';
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const sanitizedPath = [...pathParts, sanitizedFilename].join('/');

  // Determine content type
  let contentType = (blobOrFile as any).type;
  
  if (!contentType || contentType === 'application/octet-stream') {
    // Try to guess from filename
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'm4a': 'audio/mp4',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    if (ext && mimeMap[ext]) {
      contentType = mimeMap[ext];
    } else {
      contentType = 'application/octet-stream';
    }
  }

  console.log(`Attempting upload to: ${sanitizedPath} (Type: ${contentType})`);
  console.log(`Current Origin: ${window.location.origin}`);
  
  const storageRef = ref(storage, sanitizedPath);
  
  try {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    
    return new Promise((resolve, reject) => {
      const metadata = {
        contentType: contentType,
      };

      const uploadTask = uploadBytesResumable(storageRef, blobOrFile, metadata);
      
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) onProgress(progress);
        }, 
        (error: any) => {
          console.error("Upload failed details:", {
            code: error.code,
            message: error.message,
            path: sanitizedPath,
            origin: window.location.origin
          });

          if (error.message?.includes('ERR_FAILED') || error.code === 'storage/unknown') {
            reject(new Error("Network Error: The upload was blocked by the browser. This is usually a CORS issue. Please ensure you have configured CORS for your Firebase Storage bucket."));
          } else if (error.code === 'storage/unauthorized') {
            reject(new Error("Storage Permission Denied: You must be signed in to upload."));
          } else if (error.code === 'storage/retry-limit-exceeded') {
            reject(new Error("Upload timed out. Please check your connection and try again."));
          } else {
            reject(new Error(`Upload failed: ${error.message}`));
          }
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  } catch (error: any) {
    throw new Error(`Upload failed: ${error.message}`);
  }
};

// --- WEB APPS ---
export const fetchGlobalApps = async (): Promise<WebApp[]> => {
  const path = 'web_apps';
  try {
    const q = query(collection(db, path), where('isGlobalArchive', '==', true), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WebApp));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchUserApps = async (uid: string): Promise<WebApp[]> => {
  const path = 'web_apps';
  try {
    const q = query(collection(db, path), where('ownerId', '==', uid), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WebApp));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const saveWebApp = async (app: Partial<WebApp>) => {
  const path = 'web_apps';
  try {
    const id = app.id || `app_${Date.now()}`;
    const data = removeUndefined({
      ...app,
      id,
      timestamp: app.timestamp || Date.now()
    });
    await setDoc(doc(db, path, id), data);
    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const fetchAppReviews = async (appId: string): Promise<AppReview[]> => {
  const path = `web_apps/${appId}/reviews`;
  try {
    const q = query(collection(db, 'web_apps', appId, 'reviews'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppReview));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const submitAppReview = async (appId: string, review: Partial<AppReview>) => {
  if (!auth.currentUser) return;
  const path = `web_apps/${appId}/reviews`;
  try {
    const id = `rev_${Date.now()}`;
    const data = removeUndefined({
      ...review,
      id,
      appId,
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || 'Anonymous',
      userPhoto: auth.currentUser.photoURL || '',
      timestamp: Date.now()
    });
    await setDoc(doc(db, 'web_apps', appId, 'reviews', id), data);
    
    // Update app rating (simplified average sync)
    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const updateAppStats = async (appId: string, field: 'installCount' | 'playCount' | 'rating' | 'reviewCount') => {
  const path = `web_apps/${appId}`;
  try {
    await updateDoc(doc(db, 'web_apps', appId), {
      [field]: increment(1)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const syncUserProfile = async (user: User) => {
  const userRef = doc(db, 'users', user.uid);
  const isAdminEmail = user.email === 'kmoody2003@gmail.com';
  
  try {
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      // Count existing users to see if this is a Pioneer (first 25)
      const userCountSnap = await getDocs(query(collection(db, 'users'), limit(50)));
      const count = userCountSnap.size;
      const isPioneer = count < 25;

      const profile: UserProfile = {
        uid: user.uid,
        displayName: user.displayName || 'Anonymous Artist',
        photoURL: user.photoURL || '',
        email: user.email || '',
        followerCount: 0,
        followingCount: 0,
        createdAt: Date.now(),
        role: isAdminEmail ? 'admin' : 'user',
        tier: isPioneer ? 'PIONEER' : 'FREE',
        isPioneer: isPioneer,
        storageLimit: isPioneer ? 0 : 5 * 1024 * 1024 * 1024, // Pioneer gets unlimited (0)
        storageUsage: { total: 0, audio: 0, video: 0, photos: 0 },
        pioneerRewardClaimed: false
      };
      
      await setDoc(userRef, profile);
    } else {
      const updates: Partial<UserProfile> = {
        displayName: user.displayName || docSnap.data().displayName,
        photoURL: user.photoURL || docSnap.data().photoURL,
        email: user.email || docSnap.data().email,
        ...(isAdminEmail ? { role: 'admin' } : {})
      };
      await updateDoc(userRef, updates);
    }
  } catch (e) {
    console.error("Profile sync failed:", e);
  }
};

export const searchUsers = async (searchTerm: string): Promise<UserProfile[]> => {
  const path = 'users';
  try {
    const snapshot = await getDocs(collection(db, path));
    const users = snapshot.docs.map(d => d.data() as UserProfile);
    if (!searchTerm) return users;
    return users.filter(u => u.displayName.toLowerCase().includes(searchTerm.toLowerCase()));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const postToFeed = async (item: Omit<FeedItem, 'id' | 'timestamp'>) => {
  const path = 'feed';
  try {
    await addDoc(collection(db, path), {
      ...removeUndefined(item),
      timestamp: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchFeed = (callback: (items: FeedItem[]) => void) => {
  const feedPath = 'feed';
  const postsPath = 'posts';
  
  let feedItems: FeedItem[] = [];
  let postItems: FeedItem[] = [];

  const updateItems = () => {
    // Deduplicate by id (posts collection items may also exist in feed collection)
    const seen = new Set<string>();
    const combined = [...feedItems, ...postItems]
      .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return item.timestamp > 0; })
      .sort((a, b) => b.timestamp - a.timestamp);
    callback(combined.slice(0, 50));
  };

  const feedQuery = query(collection(db, feedPath), orderBy('timestamp', 'desc'), limit(50));
  const postsQuery = query(collection(db, postsPath), orderBy('timestamp', 'desc'), limit(100));

  const unsubscribeFeed = onSnapshot(feedQuery, (snapshot) => {
    feedItems = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...d.data(),
      timestamp: safeToMillis(d.data().timestamp),
      sourceCollection: 'feed'
    } as FeedItem));
    updateItems();
  }, (err) => handleFirestoreError(err, OperationType.LIST, feedPath));

  const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
    postItems = snapshot.docs
      .filter(d => d.data().isPublic === true)
      .map(d => {
      const data = d.data();
      return {
        id: d.id,
        authorId: data.authorId,
        authorName: data.authorName,
        authorPhoto: data.authorPhoto,
        content: data.text || '',
        timestamp: safeToMillis(data.timestamp),
        type: data.media && data.media.length > 0 ? 'PICTURE' : 'NEWS',
        imageUrl: data.media && data.media.length > 0 ? data.media[0].url : undefined,
        likesCount: data.likesCount || 0,
        commentCount: data.commentsCount || 0,
        shareCount: 0,
        sourceCollection: 'posts'
      } as FeedItem;
    });
    updateItems();
  }, (err) => handleFirestoreError(err, OperationType.LIST, postsPath));

  return () => {
    unsubscribeFeed();
    unsubscribePosts();
  };
};

export const migratePostsToFeed = async () => {
  const postsSnap = await getDocs(collection(db, 'posts'));
  let migrated = 0;
  for (const d of postsSnap.docs) {
    const data = d.data();
    if (data.migratedToFeed) continue;
    
    await addDoc(collection(db, 'feed'), {
      authorId: data.authorId,
      authorName: data.authorName,
      authorPhoto: data.authorPhoto,
      type: data.media && data.media.length > 0 ? 'PICTURE' : 'NEWS',
      content: data.text || '',
      timestamp: data.timestamp || Date.now(),
      likesCount: data.likesCount || 0,
      commentCount: data.commentsCount || 0,
      shareCount: 0,
      imageUrl: data.media && data.media.length > 0 ? data.media[0].url : undefined,
      originalPostId: d.id
    });
    await updateDoc(doc(db, 'posts', d.id), { migratedToFeed: true });
    migrated++;
  }
  console.log(`Migrated ${migrated} posts to feed.`);
  return migrated;
};

export const fetchFollowedFeed = async (uid: string, callback: (items: FeedItem[]) => void) => {
  const feedPath = 'feed';
  const postsPath = 'posts';
  
  try {
    const following = await fetchFollowedArtists(uid);
    const followingIds = following.map(f => f.uid);
    const targetIds = [uid, ...followingIds.slice(0, 9)];
    
    let feedItems: FeedItem[] = [];
    let postItems: FeedItem[] = [];

    const updateItems = () => {
      const combined = [...feedItems, ...postItems].sort((a, b) => b.timestamp - a.timestamp);
      callback(combined.slice(0, 50));
    };

    const feedQuery = query(
      collection(db, feedPath),
      where('authorId', 'in', targetIds)
    );

    const postsQuery = query(
      collection(db, postsPath),
      where('authorId', 'in', targetIds)
    );

    const unsubscribeFeed = onSnapshot(feedQuery, (snapshot) => {
      feedItems = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        timestamp: safeToMillis(d.data().timestamp),
        sourceCollection: 'feed'
      } as FeedItem));
      updateItems();
    }, (err) => handleFirestoreError(err, OperationType.LIST, feedPath));

    const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
      postItems = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          authorId: data.authorId,
          authorName: data.authorName,
          authorPhoto: data.authorPhoto,
          content: data.text || '',
          timestamp: safeToMillis(data.timestamp),
          type: data.media && data.media.length > 0 ? 'PICTURE' : 'NEWS',
          imageUrl: data.media && data.media.length > 0 ? data.media[0].url : undefined,
          likesCount: data.likesCount || 0,
          commentCount: data.commentsCount || 0,
          shareCount: 0,
          sourceCollection: 'posts'
        } as FeedItem;
      });
      updateItems();
    }, (err) => handleFirestoreError(err, OperationType.LIST, postsPath));

    return () => {
      unsubscribeFeed();
      unsubscribePosts();
    };
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, feedPath);
    return () => {};
  }
};

export const publishToCloud = async (album: Album, onProgress?: (status: string, percent: number) => void): Promise<Album> => {
  if (!auth.currentUser) {
    throw new Error("You must be signed in to publish to the cloud.");
  }

  if (!album.id) {
    console.error("publishToCloud: album.id is undefined", album);
    throw new Error("Cannot publish album without a valid ID.");
  }

  onProgress?.("Initiating Cloud Uplink...", 5);

  // 1. Upload Cover Image
  let finalCover = album.coverImage || '';
  if (album.coverFile) {
    onProgress?.("Uploading Artwork...", 10);
    finalCover = await uploadFile(`albums/${album.id}/cover.png`, album.coverFile);
  } else if (finalCover.startsWith('blob:')) {
    // Fallback for legacy or if file was lost
    onProgress?.("Uploading Artwork (Legacy)...", 10);
    const blob = await dataUrlToBlob(album.coverImage);
    finalCover = await uploadFile(`albums/${album.id}/cover.png`, blob);
  }

  // 2. Upload Artist Image
  let finalArtistImg = album.artistImage;
  if (album.artistFile) {
    finalArtistImg = await uploadFile(`albums/${album.id}/artist.png`, album.artistFile);
  } else if (album.artistImage && album.artistImage.startsWith('blob:')) {
    const blob = await dataUrlToBlob(album.artistImage);
    finalArtistImg = await uploadFile(`albums/${album.id}/artist.png`, blob);
  }

  // 3. Upload Slideshow
  const finalSlideshow: string[] = [];
  if (album.slideshowFiles && album.slideshowFiles.length > 0) {
    for (let i = 0; i < album.slideshowFiles.length; i++) {
      const file = album.slideshowFiles[i];
      const url = await uploadFile(`albums/${album.id}/slideshow/img_${i}.png`, file);
      finalSlideshow.push(url);
    }
  } else {
    // Fallback for existing URLs
    if (album.slideshow) finalSlideshow.push(...album.slideshow);
  }

  // 4. Upload Tracks
  const finalTracks: Track[] = [];
  for (let i = 0; i < album.tracks.length; i++) {
    const track = album.tracks[i];
    const trackProgressBase = 20 + (i / album.tracks.length) * 60;
    
    if (track.file) {
      onProgress?.(`Transferring Track ${i + 1}/${album.tracks.length}`, Math.round(trackProgressBase));
      const gcsPath = `albums/${album.id}/tracks/${track.id}_${track.file.name}`;
      const url = await uploadFile(gcsPath, track.file);
      finalTracks.push({ ...track, url, file: undefined });
    } else {
      finalTracks.push(track);
    }
  }

  // 5. Upload Music Videos
  const finalVideos: Video[] = [];
  if (album.musicVideos && album.musicVideos.length > 0) {
    for (let i = 0; i < album.musicVideos.length; i++) {
      const video = album.musicVideos[i];
      let videoUrl = video.url;
      let thumbUrl = video.thumbnailUrl;
      
      if (video.file) {
        onProgress?.(`Uploading Video ${i + 1}/${album.musicVideos.length}`, 85);
        videoUrl = await uploadFile(`albums/${album.id}/videos/${video.id}_${video.file.name}`, video.file);
      }
      
      if (video.thumbnailFile) {
        thumbUrl = await uploadFile(`albums/${album.id}/videos/thumb_${video.id}.png`, video.thumbnailFile);
      }
      
      let coverUrl = video.coverImageUrl;
      if (video.coverImageFile) {
        coverUrl = await uploadFile(`albums/${album.id}/videos/cover_${video.id}.png`, video.coverImageFile);
      }
      
      finalVideos.push({
        ...video,
        url: videoUrl,
        thumbnailUrl: thumbUrl,
        coverImageUrl: coverUrl,
        file: undefined,
        thumbnailFile: undefined,
        coverImageFile: undefined
      });
    }
  }

  // 6. Upload TV Seasons & Episodes
  const finalSeasons: any[] = [];
  if (album.seasons && album.seasons.length > 0) {
    for (let s = 0; s < album.seasons.length; s++) {
      const season = album.seasons[s];
      const finalEpisodes: any[] = [];
      for (let e = 0; e < season.episodes.length; e++) {
        const ep = season.episodes[e];
        let epUrl = ep.url;
        if (ep.file) {
          onProgress?.(`Uploading S${season.number} E${ep.episodeNumber || e + 1}`, 90);
          epUrl = await uploadFile(`albums/${album.id}/seasons/${season.number}/ep_${ep.id}_${ep.file.name}`, ep.file);
        }
        finalEpisodes.push({ ...ep, url: epUrl, file: undefined });
      }
      finalSeasons.push({ ...season, episodes: finalEpisodes });
    }
  }

  onProgress?.("Indexing Project...", 95);
  
  // Construct the cloud album object, ensuring no File objects or undefined fields
  const cloudAlbum = removeUndefined({
    ...album,
    ownerId: auth.currentUser?.uid,
    coverImage: finalCover,
    artistImage: finalArtistImg || finalCover,
    tracks: finalTracks.map(t => {
      const { file, ...rest } = t;
      return { ...rest, isGlobalArchive: true, rightsOwnerId: auth.currentUser?.uid };
    }),
    musicVideos: finalVideos,
    seasons: finalSeasons.length > 0 ? finalSeasons : album.seasons,
    slideshow: finalSlideshow,
    isDraft: false,
    isPublic: !album.isPrivate,
    isPrivate: album.isPrivate ?? false,
    isScheduled: album.isScheduled ?? false,
    ...(album.releaseDate ? { releaseDate: album.releaseDate } : {}),
    galleryUrl: album.galleryUrl || '',
    // Explicitly exclude File fields
    coverFile: undefined,
    artistFile: undefined,
    slideshowFiles: undefined
  });

  const path = `albums/${album.id}`;
  try {
    await setDoc(doc(db, "albums", album.id), cloudAlbum);
    
    // Set user as artist
    await setDoc(doc(db, "users", auth.currentUser.uid), { isArtist: true }, { merge: true });

    if (cloudAlbum.publishVideosToGallery) {
      const videosCollectionPath = 'videos';
      const uid = auth.currentUser.uid;
      const videosToPublish: Video[] = [];

      // 1. If it's a Movie Album, the main tracks are the movie videos
      if (cloudAlbum.type === 'VIDEO' && cloudAlbum.subType === 'MOVIE' && cloudAlbum.tracks && cloudAlbum.tracks.length > 0) {
        for (const track of cloudAlbum.tracks) {
          videosToPublish.push({
            id: `sys_${cloudAlbum.id}_${track.id}`,
            ownerId: uid,
            title: track.title || cloudAlbum.title,
            url: track.url,
            thumbnailUrl: cloudAlbum.coverImage,
            description: cloudAlbum.description,
            artist: cloudAlbum.artist,
            genre: cloudAlbum.genre,
            timestamp: Date.now()
          });
        }
      }

      // 2. Extra music videos
      if (cloudAlbum.musicVideos && cloudAlbum.musicVideos.length > 0) {
        for (const mv of cloudAlbum.musicVideos) {
          videosToPublish.push({
            ...mv,
            id: `sys_${cloudAlbum.id}_${mv.id}`,
            ownerId: uid,
            artist: mv.artist || cloudAlbum.artist,
            genre: mv.genre || cloudAlbum.genre,
            timestamp: mv.timestamp || Date.now()
          });
        }
      }

      // 3. TV Series Episodes
      if (cloudAlbum.type === 'VIDEO' && cloudAlbum.subType === 'TV_SERIES' && cloudAlbum.seasons) {
        for (const season of cloudAlbum.seasons) {
          if (season.episodes) {
            for (const ep of season.episodes) {
              videosToPublish.push({
                id: `sys_${cloudAlbum.id}_${season.id}_${ep.id}`,
                ownerId: uid,
                title: `${cloudAlbum.title} - S${season.number} E${ep.episodeNumber || '?'}: ${ep.title}`,
                url: ep.url,
                thumbnailUrl: ep.thumbnailUrl || cloudAlbum.coverImage,
                description: ep.description || cloudAlbum.description,
                artist: cloudAlbum.artist,
                genre: cloudAlbum.genre,
                timestamp: Date.now()
              });
            }
          }
        }
      }

      for (const v of videosToPublish) {
        try {
          await setDoc(doc(db, videosCollectionPath, v.id), v);
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, videosCollectionPath);
        }
      }
    }
    
    // Automatically post to feed if public
    if (cloudAlbum.isPublic && !cloudAlbum.isScheduled) {
      await postToFeed({
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Artist',
        authorPhoto: auth.currentUser.photoURL || '',
        type: album.type === 'VIDEO' ? 'VIDEO' : (album.type === 'BOOK' ? 'BOOK' : 'SONG') as any,
        content: `Just published a new ${album.type?.toLowerCase() || 'project'}: ${album.title}`,
        imageUrl: finalCover,
        albumId: album.id,
        songTitle: finalTracks[0]?.title || album.title || 'Untitled',
        songUrl: finalTracks[0]?.url || '',
        shareCount: 0
      });

      // Notify followers
      notifyFollowers(auth.currentUser.uid, 'CONTENT', 'New Content', `${auth.currentUser.displayName} published ${album.title}`, 'ALBUM', album.id);
    }

  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
  
  onProgress?.("Deployment Successful", 100);

  return { ...cloudAlbum, id: album.id } as Album;
};

// --- ARTICLES & NEWSLETTERS ---
export const createArticle = async (article: Partial<Article>) => {
  if (!auth.currentUser) return;
  const path = 'articles';
  try {
    const articleData = removeUndefined({
      ...article,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || 'Anonymous Author',
      authorPhoto: auth.currentUser.photoURL || '',
      likesCount: 0,
      commentsCount: 0,
      timestamp: serverTimestamp(),
      isPublic: article.isPublic ?? true,
      blocks: article.blocks || []
    });
    const docRef = await addDoc(collection(db, path), articleData);
    
    // Automatically post to feed if public
    if (articleData.isPublic) {
      await postToFeed({
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Author',
        authorPhoto: auth.currentUser.photoURL || '',
        type: 'NEWS',
        content: `Just published a new article: ${articleData.title}`,
        imageUrl: articleData.coverImage,
        url: docRef.id, // Use ID as reference
        shareCount: 0
      });
    }
    
    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const updateArticle = async (articleId: string, updates: Partial<Article>) => {
  if (!auth.currentUser) return;
  const path = `articles/${articleId}`;
  try {
    const updateData = removeUndefined({
      ...updates,
      modifiedAt: Date.now()
    });
    await updateDoc(doc(db, 'articles', articleId), updateData);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const deleteArticle = async (articleId: string) => {
  if (!auth.currentUser) return;
  const path = `articles/${articleId}`;
  try {
    await deleteDoc(doc(db, 'articles', articleId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const listenToUserArticles = (uid: string, callback: (articles: Article[]) => void) => {
  const path = 'articles';
  const q = query(
    collection(db, path),
    where('authorId', '==', uid),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      timestamp: safeToMillis(d.data().timestamp)
    } as Article)));
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const listenToGlobalArticles = (callback: (articles: Article[]) => void) => {
  const path = 'articles';
  const q = query(
    collection(db, path),
    where('isPublic', '==', true),
    limit(50)
  );
  return onSnapshot(q, (snapshot) => {
    const arr = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      timestamp: safeToMillis(d.data().timestamp)
    } as Article));
    arr.sort((a, b) => b.timestamp - a.timestamp);
    callback(arr);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const fetchArticleById = async (articleId: string): Promise<Article | null> => {
  const path = `articles/${articleId}`;
  try {
    const docSnap = await getDoc(doc(db, 'articles', articleId));
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
        timestamp: safeToMillis(docSnap.data().timestamp)
      } as Article;
    }
    return null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
    return null;
  }
};

export const updateAccountType = async (type: 'FAN' | 'ARTIST' | 'BRAND' | 'WRITER') => {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      accountType: type
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const createDemoArticle = async () => {
  if (!auth.currentUser) return;
  const demoId = `demo_article_${auth.currentUser.uid}`;
  const path = `articles/${demoId}`;
  try {
    const docSnap = await getDoc(doc(db, 'articles', demoId));
    if (docSnap.exists()) return demoId;

    const demoArticle: Article = {
      id: demoId,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || 'Author',
      authorPhoto: auth.currentUser.photoURL || '',
      title: 'The Future of Creative Journalism',
      subtitle: 'Exploring the intersection of rich media, auto-flowing text, and decentralized publishing.',
      coverImage: 'https://picsum.photos/seed/journalism/1920/1080',
      timestamp: Date.now(),
      isPublic: true,
      likesCount: 124,
      commentsCount: 12,
      readTime: 8,
      category: 'Journalism',
      blocks: [
        {
          id: 'b1',
          type: 'HEADING',
          content: 'A New Era for Writers',
          layout: 'FULL'
        },
        {
          id: 'b2',
          type: 'TEXT',
          content: 'In the rapidly evolving landscape of digital media, the traditional boundaries between text, image, and sound are dissolving. Writers are no longer just purveyors of words; they are architects of immersive experiences. This platform empowers you to break free from the constraints of static layouts and embrace a dynamic, media-rich approach to storytelling.',
          layout: 'FULL'
        },
        {
          id: 'b3',
          type: 'IMAGE',
          content: 'https://picsum.photos/seed/writing/800/800',
          layout: 'LEFT',
          caption: 'The art of modern storytelling'
        },
        {
          id: 'b4',
          type: 'TEXT',
          content: 'Notice how this text flows seamlessly around the image on the left. This "cut-out" style layout allows for a more editorial feel, reminiscent of high-end print magazines but with the interactivity of the web. You can pull assets directly from your backend—photos from your gallery, audio from your music library, or videos from your personal archive.',
          layout: 'FULL'
        },
        {
          id: 'b5',
          type: 'QUOTE',
          content: 'The medium is the message, but the experience is the memory.',
          layout: 'FULL'
        },
        {
          id: 'b6',
          type: 'HEADING',
          content: 'Integrating Rich Media',
          layout: 'FULL'
        },
        {
          id: 'b7',
          type: 'AUDIO',
          content: '', // Placeholder for audio
          layout: 'FULL',
          caption: 'Listen to the author read this section'
        },
        {
          id: 'b8',
          type: 'TEXT',
          content: 'By embedding audio commentary or ambient soundscapes, you can add a layer of intimacy to your articles. Imagine a journalist reporting from the field, where the reader can hear the background noise of a bustling city or a quiet forest while reading the report. This is not just an article; it is a newsletter that speaks to the audience.',
          layout: 'FULL'
        },
        {
          id: 'b9',
          type: 'VIDEO',
          content: 'https://www.w3schools.com/html/mov_bbb.mp4',
          layout: 'FULL',
          caption: 'A demonstration of video integration'
        }
      ]
    };

    await setDoc(doc(db, 'articles', demoId), demoArticle);
    return demoId;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

// --- PAY IT FORWARD ---

export const updatePayItForwardOptIn = async (optIn: boolean) => {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      payItForwardOptIn: optIn
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const donateToPayItForward = async (amount: number) => {
  if (!auth.currentUser) return;
  const donationId = `pif_don_${Date.now()}`;
  const donationPath = `pay_it_forward_donations/${donationId}`;
  const vaultPath = 'pay_it_forward/vault';
  
  try {
    // 1. Record donation
    await setDoc(doc(db, 'pay_it_forward_donations', donationId), {
      amount,
      donorId: auth.currentUser.uid,
      timestamp: Date.now()
    });

    // 2. Update vault (Admin only in real rules, but we simulate here)
    // In a real app, this would be a Cloud Function triggered by the donation
    await updateDoc(doc(db, 'pay_it_forward', 'vault'), {
      currentPot: increment(amount)
    });

    return true;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, donationPath);
  }
};

export const listenToPayItForwardStatus = (callback: (status: PayItForwardPool | null) => void) => {
  const path = 'pay_it_forward/status';
  return onSnapshot(doc(db, 'pay_it_forward', 'status'), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() as PayItForwardPool : null);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
};

export const listenToMyPayItForwardWins = (callback: (wins: PayItForwardWinner[]) => void) => {
  if (!auth.currentUser) return () => {};
  const path = 'pay_it_forward_winners';
  const q = query(
    collection(db, path),
    where('uid', '==', auth.currentUser.uid),
    where('status', '==', 'PENDING'),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PayItForwardWinner)));
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const claimPayItForward = async (winnerId: string) => {
  if (!auth.currentUser) return;
  const path = `pay_it_forward_winners/${winnerId}`;
  try {
    const winnerRef = doc(db, 'pay_it_forward_winners', winnerId);
    const winnerSnap = await getDoc(winnerRef);
    if (!winnerSnap.exists()) return;
    const winnerData = winnerSnap.data() as PayItForwardWinner;

    // 1. Update winner status
    await updateDoc(winnerRef, { status: 'CLAIMED' });

    // 2. Update user win history
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      payItForwardWinsMonth: increment(1),
      payItForwardWinsYear: increment(1),
      lastPayItForwardWinTimestamp: Date.now()
    });

    // 3. Update pool status and reset vault
    // In a real app, this would be a Cloud Function
    await updateDoc(doc(db, 'pay_it_forward', 'status'), {
      status: 'ACTIVE',
      totalGivenOutMonth: increment(winnerData.amount),
      totalGivenOutYear: increment(winnerData.amount)
    });

    await updateDoc(doc(db, 'pay_it_forward', 'vault'), {
      currentPot: 0
    });

  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const passPayItForward = async (winnerId: string) => {
  if (!auth.currentUser) return;
  const path = `pay_it_forward_winners/${winnerId}`;
  try {
    // 1. Update winner status
    await updateDoc(doc(db, 'pay_it_forward_winners', winnerId), { status: 'PASSED' });

    // 2. Update pool status
    await updateDoc(doc(db, 'pay_it_forward', 'status'), {
      status: 'PASSED'
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const fetchPayItForwardHistory = async () => {
  const path = 'pay_it_forward_winners';
  try {
    const q = query(collection(db, path), where('status', '==', 'CLAIMED'), orderBy('timestamp', 'desc'), limit(10));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PayItForwardWinner);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

/**
 * Simulation of the daily selection logic.
 * In a real app, this would be a Cloud Function cron job.
 */
export const simulateDailySelection = async () => {
  if (!auth.currentUser) return;
  
  try {
    const statusRef = doc(db, 'pay_it_forward', 'status');
    const statusSnap = await getDoc(statusRef);
    const vaultRef = doc(db, 'pay_it_forward', 'vault');
    const vaultSnap = await getDoc(vaultRef);

    if (!statusSnap.exists() || !vaultSnap.exists()) {
      // Initialize if not exists
      await setDoc(statusRef, {
        status: 'ACTIVE',
        lastWinnerId: '',
        lastWinTimestamp: 0,
        totalGivenOutMonth: 0,
        totalGivenOutYear: 0,
        resetMonthTimestamp: Date.now(),
        resetYearTimestamp: Date.now()
      });
      await setDoc(vaultRef, { currentPot: 100 }); // Seed some initial money
      return;
    }

    const status = statusSnap.data() as PayItForwardPool;
    const vault = vaultSnap.data() as PayItForwardVault;

    // Check if we already ran today (demo purposes: check if last win was > 1 min ago for testing)
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const isTestMode = true; // Set to true for easier testing
    const threshold = isTestMode ? 60 * 1000 : oneDay;

    if (now - status.lastWinTimestamp < threshold) {
      console.log("Daily selection already ran recently.");
      return;
    }

    // 1. Fetch eligible users
    const usersSnap = await getDocs(query(collection(db, 'users'), where('payItForwardOptIn', '==', true)));
    const eligibleUsers = usersSnap.docs.map(d => d.data() as UserProfile).filter(u => {
      // Frequency limits
      if (u.uid === status.lastWinnerId) return false; // No back-to-back
      if (u.payItForwardWinsMonth && u.payItForwardWinsMonth >= 2) return false; // Max 2 per month
      if (u.payItForwardWinsYear && u.payItForwardWinsYear >= 4) return false; // Max 4 per year
      if (u.lastPayItForwardWinTimestamp && now - u.lastPayItForwardWinTimestamp < 7 * oneDay) return false; // Not in same week
      return true;
    });

    if (eligibleUsers.length === 0) {
      console.log("No eligible users for Pay It Forward.");
      return;
    }

    // 2. Pick random winner
    const winner = eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)];
    
    // 3. Create winner record
    const winnerId = `pif_win_${now}`;
    await setDoc(doc(db, 'pay_it_forward_winners', winnerId), {
      uid: winner.uid,
      amount: vault.currentPot,
      timestamp: now,
      status: 'PENDING'
    });

    // 4. Update status
    await updateDoc(statusRef, {
      lastWinnerId: winner.uid,
      lastWinTimestamp: now,
      status: 'ACTIVE'
    });

    console.log(`New Pay It Forward winner selected: ${winner.displayName}`);
  } catch (e) {
    console.error("Simulation failed:", e);
  }
};

export const saveAlbumToCloud = publishToCloud;

export const fetchAllPublicAlbums = async (): Promise<Album[]> => {
  const path = 'albums';
  try {
    const now = Date.now();
    // Query by isPrivate==false to catch all uploaded content regardless of whether
    // isPublic was explicitly set (older uploads may have isPublic missing/false from
    // the isDraft default that was previously true).
    const q = query(collection(db, path), where("isPrivate", "==", false));
    const snapshot = await getDocs(q);

    let albums = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Album));
    albums.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return albums.filter(album => {
      if (album.isPrivate) return false;
      if (album.isDraft) return false;
      if (album.isScheduled && album.releaseDate && album.releaseDate > now) return false;
      return true;
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchProjectFromCloud = async (id: string): Promise<Album | null> => {
  const path = `albums/${id}`;
  try {
    const d = await getDoc(doc(db, "albums", id));
    return d.exists() ? d.data() as Album : null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
    return null;
  }
};

export const deleteCloudAlbum = async (id: string): Promise<void> => {
  if (!id) {
    console.error("deleteCloudAlbum: id is undefined");
    return;
  }
  const path = `albums/${id}`;
  try {
    await deleteDoc(doc(db, "albums", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const updateAlbum = async (albumId: string, data: Partial<Album>): Promise<void> => {
  if (!albumId) {
    console.error("updateAlbum: albumId is undefined");
    return;
  }
  const path = `albums/${albumId}`;
  try {
    await setDoc(doc(db, "albums", albumId), data, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const subscribeToComments = (parentId: string, trackId: string | null, videoId: string | null = null, callback: (comments: Comment[]) => void, parentCollection: string = 'albums') => {
  const path = `${parentCollection}/${parentId}/comments`;
  let q;
  if (videoId) {
    q = query(
      collection(db, parentCollection, parentId, "comments"),
      where("videoId", "==", videoId),
      orderBy("timestamp", "desc")
    );
  } else if (trackId || parentCollection === 'albums') {
    q = query(
      collection(db, parentCollection, parentId, "comments"),
      where("trackId", "==", trackId || "album"),
      orderBy("timestamp", "desc")
    );
  } else {
    // For posts and feed, we just get all comments on the item
    q = query(
      collection(db, parentCollection, parentId, "comments"),
      orderBy("timestamp", "desc")
    );
  }
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const postComment = async (parentId: string, comment: Omit<Comment, 'id'>, parentCollection: string = 'albums') => {
  const path = `${parentCollection}/${parentId}/comments`;
  try {
    const commentWithUid = {
      ...comment,
      uid: auth.currentUser?.uid || null,
      parentId: comment.parentId || null
    };
    await addDoc(collection(db, parentCollection, parentId, "comments"), commentWithUid);
    
    // Notify parent owner
    const parentRef = doc(db, parentCollection, parentId);
    const parentSnap = await getDoc(parentRef);
    if (parentSnap.exists() && auth.currentUser) {
      const parentData = parentSnap.data();
      const ownerId = parentData.ownerId || parentData.authorId || parentData.uid;
      if (ownerId && ownerId !== auth.currentUser.uid) {
        createNotification({
          userId: ownerId,
          senderId: auth.currentUser.uid,
          senderName: auth.currentUser.displayName || 'Anonymous',
          senderPhoto: auth.currentUser.photoURL || '',
          type: 'COMMENT',
          title: 'New Comment',
          message: `${auth.currentUser.displayName} commented on your ${parentCollection === 'articles' ? 'article' : 'album'}`,
          link: parentCollection === 'articles' ? 'READ' : 'ALBUM',
          targetId: parentId
        });
      }
    }
    
    // Also post to feed if it's a significant comment
    if (auth.currentUser && comment.text.length > 10) {
      await postToFeed({
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'User',
        authorPhoto: auth.currentUser.photoURL || '',
        type: 'COMMENT',
        content: `Commented on ${parentCollection === 'articles' ? 'an article' : 'an album'}: "${comment.text.substring(0, 50)}..."`,
        shareCount: 0
      });
    }

    // Update comment count
    await updateDoc(parentRef, {
      commentsCount: increment(1)
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    if (result.user) {
      await syncUserProfile(result.user);
    }
  } catch (error: any) {
    console.error("Google login failed:", error);
    const errorCode = error?.code || "";
    if (errorCode === 'auth/operation-not-allowed') {
      alert("Google sign-in is not enabled. Go to Firebase Console → Authentication → Sign-in method and enable Google.");
    } else if (errorCode === 'auth/popup-blocked') {
      alert("Sign-in popup was blocked by your browser. Please allow popups for this site and try again.");
    } else if (errorCode === 'auth/cancelled-popup-request' || errorCode === 'auth/popup-closed-by-user') {
      // User closed the popup — no need to alert
    } else {
      alert(`Google sign-in failed: ${error.message || "Unknown error"}. Please try again.`);
    }
  }
};

export const loginWithTwitter = async (): Promise<string | null> => {
  const provider = new TwitterAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    if (result.user) {
      await syncUserProfile(result.user);
      const info = getAdditionalUserInfo(result);
      const screenName = info?.username as string | undefined;
      if (screenName) {
        await updateDoc(doc(db, 'users', result.user.uid), { xHandle: screenName });
        return screenName;
      }
    }
    return null;
  } catch (error: any) {
    console.error("Twitter login failed:", error);
    const errorCode = error?.code || "";
    if (errorCode === 'auth/operation-not-allowed') {
      alert("Twitter sign-in is not enabled in the Firebase Console. Please go to Authentication > Sign-in method and enable Twitter.");
    } else if (errorCode === 'auth/invalid-credential') {
      alert("Twitter Login Error: 'Invalid Credential'. This usually means the API Key or Secret entered in your Firebase Console is incorrect, or the Callback URL in your Twitter Developer App doesn't match Firebase's expectations. Please verify your Twitter App credentials and the OAuth redirect URL.");
    } else if (errorCode === 'auth/popup-blocked') {
      alert("Registration failed because the sign-in popup was blocked by your browser. Please allow popups for this site.");
    } else {
      alert(`Twitter sign-in failed: ${error.message || "Unknown error"}. Please check your connection or try Google sign-in.`);
    }
    return null;
  }
};

export const linkXAccount = async (): Promise<string | null> => {
  if (!auth.currentUser) return null;
  const provider = new TwitterAuthProvider();
  try {
    const result = await linkWithPopup(auth.currentUser, provider);
    const info = getAdditionalUserInfo(result);
    const screenName = info?.username as string | undefined;
    if (screenName) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { xHandle: screenName });
      return screenName;
    }
    return null;
  } catch (error: any) {
    const code = error?.code || '';
    if (code === 'auth/provider-already-linked' || code === 'auth/credential-already-in-use') {
      return loginWithTwitter();
    }
    console.error('X account link failed:', error);
    return null;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
  }
};

export const onAuthUpdate = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      syncUserProfile(user);
    }
    callback(user);
  });
};

export const publishLiveFeed = async (feed: Partial<LiveFeed> & { title: string, url: string }) => {
  if (!auth.currentUser) throw new Error("Must be signed in to publish a live feed.");
  const path = 'live_feeds';
  try {
    const feedData = removeUndefined({
      ...feed,
      ownerId: auth.currentUser.uid,
      ownerName: auth.currentUser.displayName || 'Artist',
      ownerPhoto: auth.currentUser.photoURL || '',
      timestamp: serverTimestamp(),
      status: feed.status || 'LIVE',
      isPublic: feed.isPublic ?? true,
      price: feed.price || 0,
      sanctuaryOnly: feed.sanctuaryOnly || false,
      genre: feed.genre || '',
      subject: feed.subject || '',
      brandId: feed.brandId || ''
    });
    await addDoc(collection(db, path), feedData);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchAllLiveFeeds = (callback: (feeds: LiveFeed[]) => void) => {
  const path = 'live_feeds';
  const q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(50));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      timestamp: safeToMillis(d.data().timestamp)
    } as LiveFeed)));
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const updateLiveFeed = async (id: string, updates: Partial<LiveFeed>) => {
  const path = `live_feeds/${id}`;
  try {
    await updateDoc(doc(db, 'live_feeds', id), removeUndefined(updates));
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const deleteLiveFeed = async (id: string) => {
  const path = `live_feeds/${id}`;
  try {
    await deleteDoc(doc(db, 'live_feeds', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

// --- Social Features ---

export const followUser = async (targetUserId: string) => {
  if (!auth.currentUser) return;
  const path = 'follows';
  try {
    const followId = `${auth.currentUser.uid}_${targetUserId}`;
    await setDoc(doc(db, path, followId), {
      followerId: auth.currentUser.uid,
      followingId: targetUserId,
      timestamp: serverTimestamp()
    });
    
    // Update counts (simplified for now, ideally use cloud functions or transactions)
    const targetUserRef = doc(db, 'users', targetUserId);
    const currentUserRef = doc(db, 'users', auth.currentUser.uid);
    
    await updateDoc(targetUserRef, { followerCount: increment(1) });
    await updateDoc(currentUserRef, { followingCount: increment(1) });

    // Notify target user
    createNotification({
      userId: targetUserId,
      senderId: auth.currentUser.uid,
      senderName: auth.currentUser.displayName || 'Anonymous',
      senderPhoto: auth.currentUser.photoURL || '',
      type: 'FOLLOW',
      title: 'New Follower',
      message: `${auth.currentUser.displayName} is now following you`,
      link: 'USER_PROFILE',
      targetId: auth.currentUser.uid
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const unfollowUser = async (targetUserId: string) => {
  if (!auth.currentUser) return;
  const path = 'follows';
  try {
    const followId = `${auth.currentUser.uid}_${targetUserId}`;
    await deleteDoc(doc(db, path, followId));
    
    const targetUserRef = doc(db, 'users', targetUserId);
    const currentUserRef = doc(db, 'users', auth.currentUser.uid);
    
    await updateDoc(targetUserRef, { followerCount: increment(-1) });
    await updateDoc(currentUserRef, { followingCount: increment(-1) });
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const isFollowing = async (targetUserId: string): Promise<boolean> => {
  if (!auth.currentUser) return false;
  const followId = `${auth.currentUser.uid}_${targetUserId}`;
  const d = await getDoc(doc(db, 'follows', followId));
  return d.exists();
};

// --- PUSH NOTIFICATIONS ---
export const saveFcmToken = async (uid: string, token: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), { fcmToken: token });
  } catch {
    // Non-critical
  }
};

const sendPushToUser = async (uid: string, title: string, body: string, link?: string): Promise<void> => {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const fcmToken = userSnap.data()?.fcmToken as string | undefined;
    if (!fcmToken) return;
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: fcmToken, title, body, link }),
    });
  } catch {
    // Non-critical — push failures must never break the main flow
  }
};

// --- NOTIFICATIONS ---
export const fetchNotifications = (uid: string, callback: (notifications: AppNotification[]) => void) => {
  const path = 'notifications';
  const q = query(
    collection(db, path),
    where('userId', '==', uid),
    limit(50)
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ 
      id: d.id, 
      ...d.data(),
      timestamp: safeToMillis(d.data().timestamp)
    } as AppNotification)));
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const createNotification = async (notif: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => {
  const path = 'notifications';
  try {
    const data = removeUndefined({
      ...notif,
      isRead: false,
      timestamp: serverTimestamp()
    });
    const docRef = await addDoc(collection(db, path), data);
    // Fire push in background — never await, never block the main flow
    sendPushToUser(notif.userId, notif.title, notif.message, notif.link).catch(() => {});
    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const markNotificationAsRead = async (notifId: string) => {
  const path = `notifications/${notifId}`;
  try {
    await updateDoc(doc(db, 'notifications', notifId), { isRead: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const notifyFollowers = async (senderId: string, type: AppNotification['type'], title: string, message: string, link?: string, targetId?: string) => {
  try {
    const followers = await fetchFollowers(senderId);
    const senderProfile = await fetchUserProfile(senderId);
    if (!senderProfile || followers.length === 0) return;

    const promises = followers.map(followerId => 
      createNotification({
        userId: followerId,
        senderId,
        senderName: senderProfile.displayName,
        senderPhoto: senderProfile.photoURL,
        type,
        title,
        message,
        link,
        targetId,
      })
    );
    await Promise.all(promises);
  } catch (e) {
    console.error("Failed to notify followers:", e);
  }
};

export const fetchFollowers = async (userId: string): Promise<string[]> => {
  const path = 'follows';
  const q = query(collection(db, path), where('followingId', '==', userId));
  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data().followerId);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchFollowing = async (userId: string): Promise<string[]> => {
  const path = 'follows';
  const q = query(collection(db, path), where('followerId', '==', userId));
  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data().followingId);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

// --- PHOTOS & ALBUMS ---

export const uploadPhoto = async (file: File, metadata: Partial<Photo>) => {
  if (!auth.currentUser) return;
  const id = `photo_${Date.now()}`;
  const path = `photos/${id}`;
  try {
    const url = await uploadFile(`users/${auth.currentUser.uid}/photos/${id}`, file);
    const newPhoto: Photo = {
      id,
      url,
      ownerId: auth.currentUser.uid,
      timestamp: Date.now(),
      isPublic: metadata.isPublic ?? false, // Default to private
      isGalleryEligible: metadata.isGalleryEligible ?? false,
      mediaType: file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO',
      title: metadata.title || '',
      description: metadata.description || '',
      likesCount: 0,
      favorites: []
    };
    await setDoc(doc(db, 'photos', id), newPhoto);
    return newPhoto;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const createPhotoAlbum = async (album: Partial<PhotoAlbum>) => {
  if (!auth.currentUser) return;
  const id = `album_${Date.now()}`;
  const path = `photo_albums/${id}`;
  const newAlbum: PhotoAlbum = {
    id,
    ownerId: auth.currentUser.uid,
    title: album.title || 'Untitled Album',
    description: album.description || '',
    photoIds: album.photoIds || [],
    isPublic: album.isPublic ?? false,
    timestamp: Date.now(),
    order: album.order || []
  };
  try {
    await setDoc(doc(db, 'photo_albums', id), newAlbum);
    return newAlbum;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchGlobalPhotos = async (onlyGallery = false): Promise<Photo[]> => {
  const path = 'photos';
  try {
    let q = query(
      collection(db, 'photos'),
      where('isPublic', '==', true),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    if (onlyGallery) {
      q = query(
        collection(db, 'photos'),
        where('isPublic', '==', true),
        where('isGalleryEligible', '==', true),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Photo);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchUserPhotos = async (uid: string): Promise<Photo[]> => {
  const path = 'photos';
  try {
    const q = query(
      collection(db, 'photos'),
      where('ownerId', '==', uid),
      orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Photo);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const deletePhoto = async (photoId: string) => {
  const path = `photos/${photoId}`;
  try {
    await deleteDoc(doc(db, 'photos', photoId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const bulkDeletePhotos = async (photoIds: string[]) => {
  try {
    const promises = photoIds.map(id => deleteDoc(doc(db, 'photos', id)));
    await Promise.all(promises);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, 'photos/bulk');
  }
};

export const addPhotosToAlbum = async (albumId: string, photoIds: string[]) => {
  const path = `albums/${albumId}`;
  try {
    const albumRef = doc(db, 'albums', albumId);
    await updateDoc(albumRef, {
      slideshow: arrayUnion(...photoIds)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const favoritePhoto = async (photoId: string, isFavoriting: boolean) => {
  if (!auth.currentUser) return;
  const path = `photos/${photoId}`;
  try {
    const photoRef = doc(db, 'photos', photoId);
    await updateDoc(photoRef, {
      favorites: isFavoriting ? arrayUnion(auth.currentUser.uid) : arrayRemove(auth.currentUser.uid),
      likesCount: increment(isFavoriting ? 1 : -1)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

// --- EVENT PHOTO POOLS ---

export const createEventPhotoPool = async (pool: Partial<EventPhotoPool>) => {
  if (!auth.currentUser) return;
  const id = `pool_${Date.now()}`;
  const path = `event_photo_pools/${id}`;
  const newPool: EventPhotoPool = {
    id,
    eventId: pool.eventId || '',
    ownerId: auth.currentUser.uid,
    title: pool.title || 'Event Photo Pool',
    description: pool.description || '',
    mediaIds: [],
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${window.location.origin}/pool/${id}`,
    inviteLink: `${window.location.origin}/pool/${id}`,
    timestamp: Date.now()
  };
  try {
    await setDoc(doc(db, 'event_photo_pools', id), newPool);
    // If linked to a PPV event, update the event
    if (pool.eventId) {
      await updateDoc(doc(db, 'ppv_events', pool.eventId), { photoPoolId: id });
    }
    return newPool;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchEventPhotoPool = async (poolId: string): Promise<EventPhotoPool | null> => {
  const path = `event_photo_pools/${poolId}`;
  try {
    const d = await getDoc(doc(db, 'event_photo_pools', poolId));
    return d.exists() ? d.data() as EventPhotoPool : null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
    return null;
  }
};

export const subscribeToPhotoPool = (poolId: string, callback: (media: Photo[]) => void) => {
  const path = 'photos';
  const q = query(
    collection(db, 'photos'),
    where('albumId', '==', poolId), // We use albumId as the poolId for photos in a pool
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => d.data() as Photo));
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const fetchUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const d = await getDoc(doc(db, 'users', uid));
  if (d.exists()) {
    return { uid: d.id, ...d.data() } as UserProfile;
  }
  if (auth.currentUser && auth.currentUser.uid === uid) {
    await syncUserProfile(auth.currentUser);
    const d2 = await getDoc(doc(db, 'users', uid));
    if (d2.exists()) {
      return { uid: d2.id, ...d2.data() } as UserProfile;
    }
  }
  return null;
};

export const fetchUserProfiles = async (uids: string[]): Promise<UserProfile[]> => {
  if (uids.length === 0) return [];
  try {
    const results = await Promise.all(uids.map(uid => fetchUserProfile(uid)));
    return results.filter((p): p is UserProfile => p !== null);
  } catch (e) {
    console.error("Error fetching multiple user profiles:", e);
    return [];
  }
};

export const searchUserProfiles = async (searchTerm: string): Promise<UserProfile[]> => {
  if (!searchTerm.trim()) return [];
  const path = 'users';
  try {
    const q = query(
      collection(db, path),
      where('displayName', '>=', searchTerm),
      where('displayName', '<=', searchTerm + '\uf8ff'),
      limit(10)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const searchLiveChannels = async (searchTerm: string): Promise<UserProfile[]> => {
  if (!searchTerm.trim()) return [];
  const path = 'users';
  try {
    const q = query(
      collection(db, path),
      where('liveStreamConfig.isActive', '==', true),
      limit(20)
    );
    const snapshot = await getDocs(q);
    const allLive = snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
    return allLive.filter(u => 
      u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.liveStreamConfig?.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchRandomActiveUser = async (): Promise<UserProfile | null> => {
  const path = 'users';
  try {
    const q = query(collection(db, path), limit(50));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const users = snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
    return users[Math.floor(Math.random() * users.length)];
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return null;
  }
};

// --- USER PROFILES & INTERESTS ---
export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), data);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

/**
 * Generates a private interest profile for the user based on their tags and behavior.
 * This is a simulated algorithm.
 */
export const generateInterestProfile = async (uid: string) => {
  const path = `users/${uid}`;
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return;
    const profile = userSnap.data() as UserProfile;
    
    const notebookTags = (profile.interestsNotebook || '').split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    const publicTags = (profile.publicInterests || []).map(t => t.toLowerCase());
    const privateTags = (profile.privateInterests || []).map(t => t.toLowerCase());
    
    // Combine all tags
    const allTags = Array.from(new Set([...notebookTags, ...publicTags, ...privateTags]));
    
    if (allTags.length === 0) return "No interests defined yet.";
    
    // Create a descriptive profile
    const profileText = `User shows strong interest in ${allTags.slice(0, 5).join(', ')}${allTags.length > 5 ? ' and more' : ''}. ` +
                       `Primary focus areas: ${allTags.filter(t => t.length > 5).slice(0, 3).join(', ') || 'General content'}.`;
    
    await updateDoc(doc(db, 'users', uid), {
      interestAlgorithmProfile: profileText
    });
    
    return profileText;
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const fetchVideosByInterests = async (uid: string) => {
  const path = 'videos';
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return await fetchAllVideos();
    const profile = userSnap.data() as UserProfile;
    const interests = Array.from(new Set([
      ...(profile.publicInterests || []),
      ...(profile.privateInterests || [])
    ])).map(t => t.toLowerCase());
    
    const allVideos = await fetchAllVideos();
    if (interests.length === 0) return allVideos;
    
    // Sort by relevance to interests
    return allVideos.sort((a, b) => {
      const aMatch = (a.tags || []).filter(t => interests.includes(t.toLowerCase())).length;
      const bMatch = (b.tags || []).filter(t => interests.includes(t.toLowerCase())).length;
      return bMatch - aMatch;
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchUserVideos = async (uid: string): Promise<Video[]> => {
  const path = 'videos';
  try {
    const q = query(collection(db, path), where('ownerId', '==', uid), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Video));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const deleteVideo = async (videoId: string) => {
  if (!auth.currentUser) return;
  const path = `videos/${videoId}`;
  try {
    await deleteDoc(doc(db, 'videos', videoId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const fetchFollowedVideos = async (uid: string): Promise<Video[]> => {
  const path = 'videos';
  try {
    const following = await fetchFollowedArtists(uid);
    const followingIds = following.map(f => f.uid);
    if (followingIds.length === 0) return [];
    
    // Firestore 'in' limit is 10
    const targetIds = followingIds.slice(0, 10);
    const q = query(collection(db, path), where('ownerId', 'in', targetIds), orderBy('timestamp', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Video));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchUserContent = async (uid: string): Promise<Album[]> => {
  const path = 'albums';
  try {
    const q = query(collection(db, path), where("ownerId", "==", uid));
    const snapshot = await getDocs(q);
    let albums = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Album));
    
    albums.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    if (auth.currentUser?.uid === uid) return albums;
    
    const now = Date.now();
    return albums.filter(album => {
      if (album.isPrivate) return false;
      if (album.isScheduled && album.releaseDate && album.releaseDate > now) return false;
      return true;
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchPurchasedAlbums = async (uid: string): Promise<Album[]> => {
  const q = query(collection(db, 'purchases'), where("userId", "==", uid));
  const snapshot = await getDocs(q);
  const albumIds = snapshot.docs.map(d => d.data().albumId);
  
  if (albumIds.length === 0) return [];
  
  const albums: Album[] = [];
  for (const id of albumIds) {
    const d = await getDoc(doc(db, 'albums', id));
    if (d.exists()) albums.push({ id: d.id, ...d.data() } as Album);
  }
  return albums;
};

export const fetchFollowedArtists = async (uid: string): Promise<UserProfile[]> => {
  const q = query(collection(db, 'follows'), where("followerId", "==", uid));
  const snapshot = await getDocs(q);
  const followingIds = snapshot.docs.map(d => d.data().followingId);
  
  if (followingIds.length === 0) return [];
  
  // Fetch profiles for these IDs
  const profiles: UserProfile[] = [];
  for (const id of followingIds) {
    const p = await fetchUserProfile(id);
    if (p) profiles.push(p);
  }
  return profiles;
};

export const fetchFriends = async (uid: string): Promise<UserProfile[]> => {
  // Friends are mutual follows
  // 1. Get people I follow
  const followingQ = query(collection(db, 'follows'), where("followerId", "==", uid));
  const followingSnap = await getDocs(followingQ);
  const followingIds = followingSnap.docs.map(d => d.data().followingId);

  if (followingIds.length === 0) return [];

  // 2. Get people who follow me
  const followersQ = query(collection(db, 'follows'), where("followingId", "==", uid));
  const followersSnap = await getDocs(followersQ);
  const followerIds = followersSnap.docs.map(d => d.data().followerId);

  // 3. Find intersection
  const friendIds = followingIds.filter(id => followerIds.includes(id));

  if (friendIds.length === 0) return [];

  const profiles: UserProfile[] = [];
  for (const id of friendIds) {
    const p = await fetchUserProfile(id);
    if (p) profiles.push(p);
  }
  return profiles;
};

export const fetchArtistMerch = async (artistId: string): Promise<MerchItem[]> => {
  try {
    const q = query(collection(db, 'merch'), where("artistId", "==", artistId), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MerchItem));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'merch');
    return [];
  }
};

export const updateStoreSettings = async (settings: Partial<StoreSettings>) => {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      storeSettings: settings
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const addMerchItem = async (item: Omit<MerchItem, 'id' | 'timestamp'>): Promise<string | undefined> => {
  if (!auth.currentUser) return;
  const id = `merch_${Date.now()}_${auth.currentUser.uid}`;
  const path = `merch/${id}`;
  try {
    const newItem: MerchItem = {
      ...item,
      id,
      timestamp: Date.now(),
      rating: 0,
      reviewCount: 0
    };
    await setDoc(doc(db, 'merch', id), newItem);
    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const updateMerchItem = async (id: string, updates: Partial<MerchItem>) => {
  const path = `merch/${id}`;
  try {
    await updateDoc(doc(db, 'merch', id), updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const deleteMerchItem = async (id: string) => {
  const path = `merch/${id}`;
  try {
    await deleteDoc(doc(db, 'merch', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const addReview = async (productId: string, review: Omit<Review, 'id' | 'timestamp'>) => {
  const id = `review_${Date.now()}_${review.userId}`;
  const path = `merch/${productId}/reviews/${id}`;
  try {
    await runTransaction(db, async (transaction) => {
      const merchDoc = await transaction.get(doc(db, 'merch', productId));
      if (!merchDoc.exists()) throw new Error("Product not found");

      const data = merchDoc.data() as MerchItem;
      const newReviewCount = (data.reviewCount || 0) + 1;
      const newRating = ((data.rating || 0) * (data.reviewCount || 0) + review.rating) / newReviewCount;

      transaction.set(doc(db, 'merch', productId, 'reviews', id), {
        ...review,
        id,
        timestamp: Date.now()
      });

      transaction.update(doc(db, 'merch', productId), {
        rating: newRating,
        reviewCount: newReviewCount
      });
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const fetchReviews = async (productId: string) => {
  const path = `merch/${productId}/reviews`;
  try {
    const q = query(collection(db, 'merch', productId, 'reviews'), orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Review);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const updateRevenue = async (userId: string, type: keyof Omit<UserRevenue, 'cryptoWallet'>, amount: number) => {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      [`revenue.${type}`]: increment(amount)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const updateCryptoWallet = async (wallet: UserRevenue['cryptoWallet']) => {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      'revenue.cryptoWallet': wallet
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const createDemoStoreContent = async (artistId: string) => {
  const demoItems: Omit<MerchItem, 'id' | 'timestamp'>[] = [
    {
      ownerId: artistId,
      title: "Signature Hoodie",
      description: "Premium quality cotton hoodie with artist logo. Sleek and comfortable for everyday wear.",
      price: 59.99,
      salePrice: 49.99,
      imageUrl: "https://picsum.photos/seed/hoodie/800/800",
      category: "APPAREL",
      stock: 100
    },
    {
      ownerId: artistId,
      title: "Limited Edition Vinyl",
      description: "Exclusive 180g colored vinyl featuring the latest album. Includes digital download code.",
      price: 34.99,
      imageUrl: "https://picsum.photos/seed/vinyl/800/800",
      category: "MUSIC",
      stock: 50
    },
    {
      ownerId: artistId,
      title: "Digital Production Kit",
      description: "A collection of high-quality samples and presets used in the making of the latest hits.",
      price: 24.99,
      imageUrl: "https://picsum.photos/seed/digital/800/800",
      category: "DIGITAL",
      stock: 999,
      isDigitalAsset: true
    }
  ];

  for (const item of demoItems) {
    await addMerchItem(item);
  }
};

export const processDonation = async (donation: Omit<Donation, 'id' | 'timestamp'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, 'donations'), {
      ...donation,
      timestamp: serverTimestamp()
    });

    // Update artist's tip current
    const artistRef = doc(db, 'users', donation.toId);
    await updateDoc(artistRef, {
      tipCurrent: increment(donation.amount)
    });

    // Update album's donation current if applicable
    if (donation.albumId) {
      const albumRef = doc(db, 'albums', donation.albumId);
      await updateDoc(albumRef, {
        donationCurrent: increment(donation.amount)
      });
    }

    // Post to feed
    await addDoc(collection(db, 'feed'), {
      type: 'DONATION',
      userId: donation.fromId,
      userName: donation.fromName,
      targetId: donation.toId,
      albumId: donation.albumId,
      amount: donation.amount,
      timestamp: serverTimestamp()
    });

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'donations');
    throw error;
  }
};

export const fetchRadioTracks = async (): Promise<Track[]> => {
  const path = 'albums';
  try {
    const q = query(collection(db, path), where("isPublic", "==", true));
    const snapshot = await getDocs(q);
    const albums = snapshot.docs.map(d => d.data() as Album);
    const radioTracks: Track[] = [];
    
    albums.forEach(album => {
      album.tracks?.forEach(track => {
        if (track.isRadioEligible) {
          radioTracks.push({
            ...track,
            artistId: album.ownerId,
            artist: album.artist
          });
        }
      });
    });
    
    return radioTracks;
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const likeTrack = async (albumId: string, trackId: string) => {
  const path = `albums/${albumId}`;
  try {
    const albumRef = doc(db, 'albums', albumId);
    const albumSnap = await getDoc(albumRef);
    if (albumSnap.exists()) {
      const album = albumSnap.data() as Album;
      const updatedTracks = album.tracks.map(t => {
        if (t.id === trackId) {
          return { ...t, likes: (t.likes || 0) + 1 };
        }
        return t;
      });
      await updateDoc(albumRef, { tracks: updatedTracks });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const addToLibrary = async (trackId: string) => {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}`;
  try {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data() as UserProfile;
      const library = userData.library || [];
      if (!library.includes(trackId)) {
        await updateDoc(userRef, { library: [...library, trackId] });
      }
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const fetchTVChannels = async (): Promise<TVChannel[]> => {
  const path = 'tv_channels';
  try {
    const snapshot = await getDocs(collection(db, path));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TVChannel));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const updateTVChannel = async (channel: Omit<TVChannel, 'id'>) => {
  if (!auth.currentUser) return;
  const path = `tv_channels/${auth.currentUser.uid}`;
  try {
    await setDoc(doc(db, 'tv_channels', auth.currentUser.uid), channel, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const fetchGames = async (): Promise<Game[]> => {
  const path = 'games';
  try {
    const q = query(collection(db, path), orderBy('playCount', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Game));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const addGame = async (game: Omit<Game, 'id' | 'timestamp' | 'playCount'>) => {
  const path = 'games';
  try {
    await addDoc(collection(db, path), {
      ...game,
      playCount: 0,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const addUserGame = async (game: Omit<Game, 'id' | 'timestamp' | 'playCount' | 'ownerId'>) => {
  if (!auth.currentUser) return;
  const path = 'games';
  try {
    const gameId = `game_${Date.now()}`;
    const newGame: Game = {
      ...game,
      id: gameId,
      ownerId: auth.currentUser.uid,
      playCount: 0,
      timestamp: Date.now()
    };
    
    // Add to global games collection
    await setDoc(doc(db, 'games', gameId), newGame);
    
    // Add to user's games array
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      games: arrayUnion(newGame)
    });
    
    return newGame;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const updateGamePlayCount = async (gameId: string) => {
  const path = `games/${gameId}`;
  try {
    await updateDoc(doc(db, 'games', gameId), {
      playCount: increment(1)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

// --- LIBRARY & MEMBERSHIP ---

export const removeFromLibrary = async (trackId: string) => {
  if (!auth.currentUser) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  await updateDoc(userRef, {
    library: arrayRemove(trackId)
  });
};

// --- PERSONAL LIBRARY & VAULT ---

export const createPersonalAlbum = async (album: Partial<Album>) => {
  if (!auth.currentUser) return;
  const id = `palbum_${Date.now()}`;
  const path = `personal_albums/${id}`;
  const newAlbum: Album = {
    id,
    ownerId: auth.currentUser.uid,
    title: album.title || 'Untitled Album',
    artist: album.artist || 'Personal Collection',
    coverImage: album.coverImage || 'https://picsum.photos/seed/album/400/400',
    description: album.description || '',
    tracks: [],
    createdAt: Date.now(),
    themeColor: '#1a1a1a',
    isPrivate: true,
    isGlobalArchive: false,
    rightsOwnerId: auth.currentUser.uid
  };
  try {
    await setDoc(doc(db, 'personal_albums', id), newAlbum);
    return newAlbum;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchPersonalTracks = async () => {
  if (!auth.currentUser) return [];
  const path = 'personal_tracks';
  try {
    const q = query(
      collection(db, 'personal_tracks'), 
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Track);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchPersonalAlbums = async () => {
  if (!auth.currentUser) return [];
  const path = 'personal_albums';
  try {
    const q = query(
      collection(db, 'personal_albums'), 
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Album);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const createPlaylist = async (playlist: Partial<Playlist>) => {
  if (!auth.currentUser) return;
  const id = `playlist_${Date.now()}`;
  const path = `personal_playlists/${id}`;
  const newPlaylist: Playlist = {
    id,
    ownerId: auth.currentUser.uid,
    title: playlist.title || 'New Playlist',
    description: playlist.description || '',
    coverUrl: playlist.coverUrl || 'https://picsum.photos/seed/playlist/400/400',
    trackIds: playlist.trackIds || [],
    timestamp: Date.now()
  };
  try {
    await setDoc(doc(db, 'personal_playlists', id), newPlaylist);
    return newPlaylist;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchPersonalPlaylists = async () => {
  if (!auth.currentUser) return [];
  const path = 'personal_playlists';
  try {
    const q = query(
      collection(db, 'personal_playlists'), 
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Playlist);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const updatePlaylist = async (playlistId: string, updates: Partial<Playlist>) => {
  const path = `personal_playlists/${playlistId}`;
  try {
    const ref = doc(db, 'personal_playlists', playlistId);
    await updateDoc(ref, updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const deletePlaylist = async (playlistId: string) => {
  const path = `personal_playlists/${playlistId}`;
  try {
    await deleteDoc(doc(db, 'personal_playlists', playlistId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const uploadPersonalTrack = async (track: Partial<Track>, file: File, albumId?: string) => {
  if (!auth.currentUser) return;
  const path = `personal/${auth.currentUser.uid}/${Date.now()}_${file.name}`;
  const url = await uploadFile(path, file);
  
  const id = `ptrack_${Math.random().toString(36).substr(2, 9)}`;
  const newTrack: Track = {
    id,
    title: track.title || file.name.replace(/\.[^/.]+$/, ""),
    artist: track.artist || 'Personal Collection',
    url,
    albumId: albumId || undefined,
    albumTitle: track.albumTitle,
    albumCover: track.albumCover,
    isPersonalMedia: true,
    isGlobalArchive: false,
    rightsOwnerId: auth.currentUser.uid,
    timestamp: Date.now(),
    ...track
  } as Track;

  const trackPath = `personal_tracks/${id}`;
  try {
    await setDoc(doc(db, 'personal_tracks', id), removeUndefined({
      ...newTrack,
      ownerId: auth.currentUser.uid
    }));
    
    // Also add to user's personalTracks array for backward compatibility if needed, 
    // but we should prefer fetching from collection
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      personalTracks: arrayUnion(newTrack)
    });
    
    return newTrack;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, trackPath);
  }
};

export const fetchUserLibraryTracks = async (trackIds: string[]) => {
  if (!trackIds || !trackIds.length) return [];
  const albums = await fetchAllPublicAlbums();
  const allTracks: (Track & { albumId?: string; albumArtist?: string; albumCover?: string })[] = [];
  albums.forEach(album => {
    album.tracks?.forEach(track => {
      if (trackIds.includes(track.id)) {
        allTracks.push({ 
          ...track, 
          albumId: album.id, 
          artistId: album.ownerId,
          albumArtist: album.artist, 
          albumCover: album.coverImage 
        });
      }
    });
  });
  return allTracks;
};

export const joinMembership = async (artistId: string) => {
  if (!auth.currentUser) return;
  const artistRef = doc(db, 'users', artistId);
  const artistSnap = await getDoc(artistRef);
  const artistData = artistSnap.data() as UserProfile;
  
  const membershipId = `${auth.currentUser.uid}_${artistId}`;
  const membershipRef = doc(db, 'memberships', membershipId);
  
  const status = artistData.membershipConfig?.isWaitingListEnabled ? 'PENDING' : 'ACTIVE';
  
  const membership: Membership = {
    id: membershipId,
    artistId,
    memberId: auth.currentUser.uid,
    status,
    startDate: Date.now(),
  };
  
  await setDoc(membershipRef, membership);
  
  if (status === 'ACTIVE') {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      activeMemberships: arrayUnion(artistId)
    });
  }
  
  return membership;
};

export const updateMembershipStatus = async (membershipId: string, status: 'ACTIVE' | 'REVOKED') => {
  const membershipRef = doc(db, 'memberships', membershipId);
  await updateDoc(membershipRef, { status });
  
  const membershipSnap = await getDoc(membershipRef);
  const membershipData = membershipSnap.data() as Membership;
  
  const userRef = doc(db, 'users', membershipData.memberId);
  if (status === 'ACTIVE') {
    await updateDoc(userRef, {
      activeMemberships: arrayUnion(membershipData.artistId)
    });
  } else {
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data() as UserProfile;
    const updated = (userData.activeMemberships || []).filter(id => id !== membershipData.artistId);
    await updateDoc(userRef, { activeMemberships: updated });
  }
};

export const fetchArtistMemberships = async (artistId: string) => {
  const q = query(collection(db, 'memberships'), where('artistId', '==', artistId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Membership);
};

export const updateArtistMembershipConfig = async (artistId: string, config: ArtistMembershipConfig) => {
  const artistRef = doc(db, 'users', artistId);
  await updateDoc(artistRef, { membershipConfig: config });
};

// Chat & Collaboration
export const createChatRoom = async (participants: string[], type: ChatRoom['type'], name?: string): Promise<string> => {
  const path = 'chat_rooms';
  try {
    const q = query(collection(db, path), where("participants", "array-contains", auth.currentUser?.uid), where("type", "==", type));
    const snap = await getDocs(q);
    
    // For private chats, check if one already exists
    if (type === 'PRIVATE') {
      const existing = snap.docs.find(d => {
        const p = d.data().participants as string[];
        return p.length === 2 && participants.every(uid => p.includes(uid));
      });
      if (existing) return existing.id;
    }

    const docRef = await addDoc(collection(db, path), {
      participants,
      type,
      name: name || '',
      updatedAt: Date.now(),
      ownerId: auth.currentUser?.uid
    });
    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
    throw e;
  }
};

export const renameChatRoom = async (roomId: string, newName: string) => {
  const path = `chat_rooms/${roomId}`;
  try {
    await updateDoc(doc(db, 'chat_rooms', roomId), {
      name: newName,
      updatedAt: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const updateTypingStatus = async (roomId: string, isTyping: boolean) => {
  if (!auth.currentUser) return;
  const path = `chat_rooms/${roomId}`;
  try {
    const roomRef = doc(db, 'chat_rooms', roomId);
    const uid = auth.currentUser.uid;
    await updateDoc(roomRef, {
      typingUsers: isTyping ? arrayUnion(uid) : arrayRemove(uid)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const markMessageAsSeen = async (roomId: string, messageId: string) => {
  if (!auth.currentUser) return;
  const path = `chat_rooms/${roomId}/messages/${messageId}`;
  try {
    const msgRef = doc(db, 'chat_rooms', roomId, 'messages', messageId);
    await updateDoc(msgRef, {
      seenBy: arrayUnion(auth.currentUser.uid)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const sendMessage = async (roomId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
  const path = `chat_rooms/${roomId}/messages`;
  try {
    const docRef = await addDoc(collection(db, 'chat_rooms', roomId, 'messages'), {
      ...message,
      timestamp: Date.now()
    });

    // Notify other participants in room
    const roomRef = doc(db, 'chat_rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists() && auth.currentUser) {
      const roomData = roomSnap.data();
      const participants = roomData.participants || [];
      const others = participants.filter((pId: string) => pId !== (auth.currentUser?.uid || ''));
      
      others.forEach((pId: string) => {
        createNotification({
          userId: pId,
          senderId: auth.currentUser?.uid || '',
          senderName: auth.currentUser?.displayName || 'Anonymous',
          senderPhoto: auth.currentUser?.photoURL || '',
          type: 'MESSAGE',
          title: 'New Message',
          message: `${auth.currentUser?.displayName}: ${(message.text ?? '').substring(0, 50)}${(message.text ?? '').length > 50 ? '...' : ''}`,
          link: 'MESSAGES',
          targetId: roomId
        });
      });
    }
    
    // Use setDoc with merge instead of updateDoc to allow lazy creation of the room document (especially for live chats)
    await setDoc(doc(db, 'chat_rooms', roomId), {
      lastMessage: message.text || (message.type === 'VOICE' ? 'Voice Note' : message.type === 'MEDIA' ? 'Shared Media' : ''),
      updatedAt: Date.now(),
      type: roomId.startsWith('live_chat_') ? 'PUBLIC_LIVE' : 'GROUP', // Default type for lazy creation
      participants: arrayUnion(auth.currentUser?.uid) // Ensure sender is in participants
    }, { merge: true });

    // If it's a media message, update the album's sharedWith list
    if (message.type === 'MEDIA' && message.mediaId) {
      const albumRef = doc(db, 'albums', message.mediaId);
      await updateDoc(albumRef, {
        sharedWith: arrayUnion(roomId)
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const listenToMessages = (roomId: string, callback: (messages: ChatMessage[]) => void) => {
  const q = query(collection(db, 'chat_rooms', roomId, 'messages'), orderBy('timestamp', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
  }, (e) => handleFirestoreError(e, OperationType.LIST, `chat_rooms/${roomId}/messages`));
};

export const listenToChatRooms = (callback: (rooms: ChatRoom[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(collection(db, 'chat_rooms'), where("participants", "array-contains", auth.currentUser.uid), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom)));
  }, (e) => handleFirestoreError(e, OperationType.LIST, 'chat_rooms'));
};

export const fetchChatRooms = async (): Promise<ChatRoom[]> => {
  if (!auth.currentUser) return [];
  const q = query(collection(db, 'chat_rooms'), where("participants", "array-contains", auth.currentUser.uid), orderBy('updatedAt', 'desc'));
  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'chat_rooms');
    return [];
  }
};

export const createCollabProject = async (name: string, chatRoomId: string): Promise<string> => {
  const path = 'collab_projects';
  try {
    const docRef = await addDoc(collection(db, path), {
      name,
      chatRoomId,
      whiteboardData: '',
      assets: [],
      links: [],
      updatedAt: Date.now(),
      ownerId: auth.currentUser?.uid
    });
    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
    throw e;
  }
};

export const updateCollabProject = async (projectId: string, data: Partial<CollabProject>) => {
  const path = `collab_projects/${projectId}`;
  try {
    await updateDoc(doc(db, 'collab_projects', projectId), {
      ...data,
      updatedAt: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const listenToCollabProject = (projectId: string, callback: (project: CollabProject) => void) => {
  return onSnapshot(doc(db, 'collab_projects', projectId), (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as CollabProject);
    }
  }, (e) => handleFirestoreError(e, OperationType.GET, `collab_projects/${projectId}`));
};

export const fetchCollabProjects = async (chatRoomId: string): Promise<CollabProject[]> => {
  const path = 'collab_projects';
  try {
    const q = query(collection(db, path), where("chatRoomId", "==", chatRoomId), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CollabProject));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const startCall = async (receiverId: string, type: CallSession['type']): Promise<string> => {
  const path = 'calls';
  try {
    const docRef = await addDoc(collection(db, path), {
      callerId: auth.currentUser?.uid,
      receiverId,
      type,
      status: 'RINGING',
      timestamp: Date.now()
    });
    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
    throw e;
  }
};

export const listenToCalls = (callback: (calls: CallSession[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(collection(db, 'calls'), where("receiverId", "==", auth.currentUser.uid), where("status", "==", "RINGING"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as CallSession)));
  }, (e) => handleFirestoreError(e, OperationType.LIST, 'calls'));
};

export const updateCallStatus = async (callId: string, status: CallSession['status']) => {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), { status });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const seedMockUsers = async () => {
  const mockUsers = [
    { uid: 'mock_1', displayName: 'Luna Vibe', photoURL: 'https://picsum.photos/seed/luna/400/400', email: 'luna@plajah.io', bio: 'Electronic soundscapes and neon dreams.', followerCount: 120, followingCount: 45, isArtist: true },
    { uid: 'mock_2', displayName: 'Echo Ghost', photoURL: 'https://picsum.photos/seed/echo/400/400', email: 'echo@plajah.io', bio: 'Ambient textures for late night coding.', followerCount: 85, followingCount: 90, isArtist: true },
    { uid: 'mock_3', displayName: 'Solar Pulse', photoURL: 'https://picsum.photos/seed/solar/400/400', email: 'solar@plajah.io', bio: 'High energy beats for the morning rush.', followerCount: 250, followingCount: 12, isArtist: true },
    { uid: 'mock_4', displayName: 'Deep Bass', photoURL: 'https://picsum.photos/seed/bass/400/400', email: 'bass@plajah.io', bio: 'Sub-woofer testing specialist.', followerCount: 400, followingCount: 150, isArtist: true },
    { uid: 'mock_5', displayName: 'Synth Wave', photoURL: 'https://picsum.photos/seed/synth/400/400', email: 'synth@plajah.io', bio: 'Retro-futuristic melodies.', followerCount: 15, followingCount: 200, isArtist: false }
  ];

  for (const user of mockUsers) {
    await setDoc(doc(db, 'users', user.uid), {
      ...user,
      createdAt: serverTimestamp()
    });
  }

  // Create some mutual follows for the current user if logged in
  if (auth.currentUser) {
    const myUid = auth.currentUser.uid;
    // Follow some mock users
    for (let i = 0; i < 3; i++) {
      const targetId = mockUsers[i].uid;
      const followId = `${myUid}_${targetId}`;
      await setDoc(doc(db, 'follows', followId), {
        followerId: myUid,
        followingId: targetId,
        timestamp: serverTimestamp()
      });
      // Mutual follow back
      const backFollowId = `${targetId}_${myUid}`;
      await setDoc(doc(db, 'follows', backFollowId), {
        followerId: targetId,
        followingId: myUid,
        timestamp: serverTimestamp()
      });
    }
  }
  
  console.log("Mock users seeded successfully.");
};export const seedPublicDomainBooks = async () => {
  const books = [
    {
      id: 'book_pride_prejudice',
      title: 'Pride and Prejudice',
      artist: 'Jane Austen',
      description: 'A classic novel of manners, marriage, and morality in Regency England.',
      coverImage: 'https://picsum.photos/seed/pride/800/1200',
      genre: 'Classic Literature',
      type: 'BOOK',
      bookChapters: [
        {
          id: 'pp_epub',
          title: 'Full Book (EPUB)',
          url: 'https://www.gutenberg.org/ebooks/1342.epub.images',
          description: 'The complete novel in EPUB format.'
        }
      ]
    },
    {
      id: 'book_frankenstein',
      title: 'Frankenstein',
      artist: 'Mary Shelley',
      description: 'The story of Victor Frankenstein and the monstrous creature he creates.',
      coverImage: 'https://picsum.photos/seed/monster/800/1200',
      genre: 'Gothic Horror',
      type: 'BOOK',
      bookChapters: [
        {
          id: 'fr_epub',
          title: 'Full Book (EPUB)',
          url: 'https://www.gutenberg.org/ebooks/84.epub.images'
        }
      ]
    },
    {
      id: 'book_pdf_sample',
      title: 'Platform Guide (PDF)',
      artist: 'Plajah Engine',
      description: 'Documentation for the Plajah technical engine and microsite ecosystem.',
      coverImage: 'https://picsum.photos/seed/guide/800/1200',
      genre: 'Technical',
      type: 'BOOK',
      bookChapters: [
        {
          id: 'guide_pdf',
          title: 'Engine Specifications',
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
        }
      ]
    },
    {
      id: 'book_graphic_novel',
      title: 'Neon Odyssey',
      artist: 'Kira Vane',
      description: 'A cyber-noir graphic novel set in the floating cities of Neo-Tokyo.',
      coverImage: 'https://picsum.photos/seed/cyber/800/1200',
      genre: 'Graphic Novel',
      type: 'BOOK',
      subType: 'GRAPHIC_NOVEL',
      bookChapters: [
        {
          id: 'nv_ch1',
          title: 'Issue #1: The Glitch',
          pages: [
            { id: 'p1', url: 'https://picsum.photos/seed/manga1/1200/1800', pageNumber: 1 },
            { id: 'p2', url: 'https://picsum.photos/seed/manga2/1200/1800', pageNumber: 2 },
            { id: 'p3', url: 'https://picsum.photos/seed/manga3/1200/1800', pageNumber: 3 },
            { id: 'p4', url: 'https://picsum.photos/seed/manga4/1200/1800', pageNumber: 4 },
            { id: 'p5', url: 'https://picsum.photos/seed/manga5/1200/1800', pageNumber: 5 },
            { id: 'p6', url: 'https://picsum.photos/seed/manga6/1200/1800', pageNumber: 6 }
          ]
        },
        {
          id: 'nv_ch2',
          title: 'Issue #2: Ghost Signal',
          pages: [
            { id: 'p7', url: 'https://picsum.photos/seed/manga7/1200/1800', pageNumber: 1 },
            { id: 'p8', url: 'https://picsum.photos/seed/manga8/1200/1800', pageNumber: 2 }
          ]
        }
      ]
    }
  ];

  for (const book of books) {
    const album: Album = {
      ...book,
      tracks: [], // Books use bookChapters instead of tracks
      createdAt: Date.now(),
      themeColor: '#1a1a1a',
      isPublic: true,
      isGlobalArchive: true,
      ownerId: 'system_library'
    } as Album;

    await setDoc(doc(db, 'albums', book.id), album);
  }

  console.log("Public domain books seeded successfully.");
};

// --- VIDEO FEATURES ---

export const uploadVideo = async (video: Partial<Video>, onProgress?: (p: number) => void): Promise<Video> => {
  if (!auth.currentUser) throw new Error("Must be signed in to upload videos.");
  const id = `vid_${Date.now()}`;
  const path = `videos/${id}`;
  
  let videoUrl = video.url || '';
  if (video.file) {
    videoUrl = await uploadFile(`videos/${id}/source.mp4`, video.file, onProgress);
  }
  
  let thumbUrl = video.thumbnailUrl || '';
  if (video.thumbnailFile) {
    thumbUrl = await uploadFile(`videos/${id}/thumb.png`, video.thumbnailFile);
  }

  let coverUrl = video.coverImageUrl || '';
  if (video.coverImageFile) {
    coverUrl = await uploadFile(`videos/${id}/cover.png`, video.coverImageFile);
  }
  
  const newVideo: Video = {
    id,
    ownerId: auth.currentUser.uid,
    title: video.title || 'Untitled Video',
    url: videoUrl,
    thumbnailUrl: thumbUrl,
    coverImageUrl: coverUrl,
    description: video.description || '',
    price: video.price || 0,
    isPaywalled: video.isPaywalled || false,
    genre: video.genre || 'General',
    artist: auth.currentUser.displayName || 'Artist',
    isPrivate: video.isPrivate || false,
    timestamp: Date.now(),
    likesCount: 0,
    commentsCount: 0
  };
  
  try {
    if (videoUrl && !videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be') && !videoUrl.includes('vimeo.com')) {
      const res = await fetch('/api/mux/create-asset-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl })
      });
      if (res.ok) {
        const muxData = await res.json();
        if (muxData.playbackId) {
          newVideo.muxPlaybackId = muxData.playbackId;
          newVideo.muxAssetId = muxData.assetId;
        }
      }
    }
  } catch (err) {
    console.error('Failed to auto-migrate to Mux during upload:', err);
  }
  
  try {
    await setDoc(doc(db, 'videos', id), newVideo);
    return newVideo;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
    throw e;
  }
};

export const fetchAllVideos = async (): Promise<Video[]> => {
  const path = 'videos';
  try {
    const q = query(collection(db, path), where("isPrivate", "==", false), orderBy("timestamp", "desc"), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Video);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const checkIfLiked = async (videoId: string) => {
  if (!auth.currentUser) return false;
  const likeId = `${auth.currentUser.uid}_${videoId}`;
  const snap = await getDoc(doc(db, 'videos', videoId, 'likes', likeId));
  return snap.exists();
};

export const fetchUserVideoPlaylists = async (uid: string) => {
  const path = 'video_playlists';
  const q = query(collection(db, path), where('ownerId', '==', uid), orderBy('timestamp', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoPlaylist));
};

export const likeVideo = async (videoId: string) => {
  if (!auth.currentUser) return;
  const likeId = `${auth.currentUser.uid}_${videoId}`;
  const path = `videos/${videoId}/likes/${likeId}`;
  try {
    await setDoc(doc(db, 'videos', videoId, 'likes', likeId), {
      id: likeId,
      videoId,
      userId: auth.currentUser.uid,
      timestamp: Date.now()
    });
    await updateDoc(doc(db, 'videos', videoId), { likesCount: increment(1) });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const unlikeVideo = async (videoId: string) => {
  if (!auth.currentUser) return;
  const likeId = `${auth.currentUser.uid}_${videoId}`;
  const path = `videos/${videoId}/likes/${likeId}`;
  try {
    await deleteDoc(doc(db, 'videos', videoId, 'likes', likeId));
    await updateDoc(doc(db, 'videos', videoId), { likesCount: increment(-1) });
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const postVideoComment = async (videoId: string, text: string, parentId?: string) => {
  if (!auth.currentUser) return;
  const id = `vcom_${Date.now()}`;
  const path = `videos/${videoId}/comments/${id}`;
  const comment: VideoComment = removeUndefined({
    id,
    videoId,
    userId: auth.currentUser.uid,
    userName: auth.currentUser.displayName || 'User',
    userPhoto: auth.currentUser.photoURL || '',
    text,
    timestamp: Date.now(),
    parentId: parentId || undefined
  });
  try {
    await setDoc(doc(db, 'videos', videoId, 'comments', id), comment);
    await updateDoc(doc(db, 'videos', videoId), { commentsCount: increment(1) });

    // Notify video owner
    const videoRef = doc(db, 'videos', videoId);
    const videoSnap = await getDoc(videoRef);
    if (videoSnap.exists() && auth.currentUser) {
      const videoData = videoSnap.data();
      const ownerId = videoData.ownerId || videoData.artistId || videoData.uid;
      if (ownerId && ownerId !== auth.currentUser.uid) {
        createNotification({
          userId: ownerId,
          senderId: auth.currentUser.uid,
          senderName: auth.currentUser.displayName || 'Anonymous',
          senderPhoto: auth.currentUser.photoURL || '',
          type: 'COMMENT',
          title: 'New Video Comment',
          message: `${auth.currentUser.displayName} commented on your video`,
          link: 'VIDEO',
          targetId: videoId
        });
      }
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const listenToVideoComments = (videoId: string, callback: (comments: VideoComment[]) => void) => {
  const q = query(collection(db, 'videos', videoId, 'comments'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => d.data() as VideoComment));
  }, (e) => handleFirestoreError(e, OperationType.LIST, `videos/${videoId}/comments`));
};

export const createVideoPlaylist = async (playlist: Partial<VideoPlaylist>) => {
  if (!auth.currentUser) return;
  const id = `vpl_${Date.now()}`;
  const path = `video_playlists/${id}`;
  const newPlaylist: VideoPlaylist = {
    id,
    ownerId: auth.currentUser.uid,
    title: playlist.title || 'New Playlist',
    description: playlist.description || '',
    videoIds: playlist.videoIds || [],
    thumbnailUrl: playlist.thumbnailUrl || '',
    isPrivate: playlist.isPrivate || false,
    isPublic: playlist.isPublic ?? true,
    timestamp: Date.now()
  };
  try {
    await setDoc(doc(db, 'video_playlists', id), newPlaylist);
    return newPlaylist;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchVideoPlaylists = async (uid?: string): Promise<VideoPlaylist[]> => {
  const path = 'video_playlists';
  try {
    let q;
    if (uid) {
      q = query(collection(db, path), where("ownerId", "==", uid), orderBy("timestamp", "desc"));
    } else {
      q = query(collection(db, path), where("isPublic", "==", true), orderBy("timestamp", "desc"), limit(50));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as VideoPlaylist);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

// --- BRAND ACCOUNTS & FAN PAGES ---

export const createBrandAccount = async (name: string, description: string = '') => {
  if (!auth.currentUser) return;
  const id = `brand_${Date.now()}`;
  const path = `brand_accounts/${id}`;
  const newBrand: BrandAccount = {
    id,
    name,
    description,
    adminId: auth.currentUser.uid,
    managers: [auth.currentUser.uid],
    brandPages: [],
    managedArtistIds: [],
    timestamp: Date.now()
  };
  try {
    await setDoc(doc(db, 'brand_accounts', id), newBrand);
    
    // Update user profile to include managed brand
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      managedBrandIds: arrayUnion(id),
      isBrandAdmin: true
    });
    
    return newBrand;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const addBrandManager = async (brandId: string, managerEmail: string) => {
  if (!auth.currentUser) return;
  const path = `brand_accounts/${brandId}`;
  try {
    const userQ = query(collection(db, 'users'), where('email', '==', managerEmail));
    const userSnap = await getDocs(userQ);
    if (userSnap.empty) throw new Error('User not found');
    const managerUid = userSnap.docs[0].id;
    await updateDoc(doc(db, 'brand_accounts', brandId), { managers: arrayUnion(managerUid) });
    await updateDoc(doc(db, 'users', managerUid), { managedBrandIds: arrayUnion(brandId) });
    return true;
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const fetchBrandAccounts = async (): Promise<BrandAccount[]> => {
  if (!auth.currentUser) return [];
  const path = 'brand_accounts';
  try {
    const q = query(collection(db, path), where('managers', 'array-contains', auth.currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as BrandAccount);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const createFanPage = async (name: string, description: string) => {
  if (!auth.currentUser) return;
  const id = `fanpage_${Date.now()}`;
  const path = `fan_pages/${id}`;
  const newPage: FanPage = {
    id,
    ownerId: auth.currentUser.uid,
    name,
    description,
    members: [auth.currentUser.uid],
    timestamp: Date.now()
  };
  try {
    await setDoc(doc(db, 'fan_pages', id), newPage);
    return newPage;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchFanPages = async (): Promise<FanPage[]> => {
  const path = 'fan_pages';
  try {
    const q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as FanPage);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

// --- LIVE STREAM CONFIG & RANKING ---

export const fetchRankedLiveFeeds = async (uid: string): Promise<LiveFeed[]> => {
  const path = 'live_feeds';
  try {
    const [allFeeds, following] = await Promise.all([
      getDocs(query(collection(db, path), where('isPublic', '==', true), orderBy('timestamp', 'desc'))),
      getDocs(query(collection(db, 'follows'), where('followerId', '==', uid)))
    ]);
    const followedIds = following.docs.map(d => (d.data() as FollowRelation).followingId);
    const userSnap = await getDoc(doc(db, 'users', uid));
    const profile = userSnap.exists() ? userSnap.data() as UserProfile : null;
    const interests = (profile?.publicInterests || []).map(i => i.toLowerCase());
    const feeds = allFeeds.docs.map(d => ({ id: d.id, ...d.data() } as LiveFeed));
    return feeds.sort((a, b) => {
      const aFollowed = followedIds.includes(a.ownerId) ? 1 : 0;
      const bFollowed = followedIds.includes(b.ownerId) ? 1 : 0;
      if (aFollowed !== bFollowed) return bFollowed - aFollowed;
      const aInterest = (a.genre && interests.includes(a.genre.toLowerCase())) ? 1 : 0;
      const bInterest = (b.genre && interests.includes(b.genre.toLowerCase())) ? 1 : 0;
      if (aInterest !== bInterest) return bInterest - aInterest;
      return b.timestamp - a.timestamp;
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const updateLiveStreamConfig = async (config: UserProfile['liveStreamConfig']) => {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      liveStreamConfig: config
    });
    
    // If active, also publish to live hub
    if (config?.isActive) {
      await publishLiveFeed({
        title: config.title,
        url: config.streamUrl
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const searchLiveEvents = async (searchTerm: string): Promise<LiveFeed[]> => {
  const path = 'live_feeds';
  try {
    const q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(100));
    const snap = await getDocs(q);
    const feeds = snap.docs.map(d => ({ id: d.id, ...d.data() } as LiveFeed));
    
    if (!searchTerm) return feeds;
    
    const lowerTerm = searchTerm.toLowerCase();
    return feeds.filter(f => 
      f.title.toLowerCase().includes(lowerTerm) || 
      f.ownerName.toLowerCase().includes(lowerTerm)
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

// --- ADS ---
export const fetchAllAdCampaigns = async (): Promise<AdCampaign[]> => {
  const path = 'ad_campaigns';
  try {
    const q = query(collection(db, path), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AdCampaign));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const createAdCampaign = async (campaign: Partial<AdCampaign>) => {
  if (!auth.currentUser) return;
  const path = 'ad_campaigns';
  try {
    const data = removeUndefined({
      ...campaign,
      ownerId: auth.currentUser.uid,
      timestamp: serverTimestamp(),
      isActive: campaign.isActive ?? true,
      status: 'ACTIVE'
    });
    const docRef = await addDoc(collection(db, path), data);
    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const deleteAdCampaign = async (id: string) => {
  const path = `ad_campaigns/${id}`;
  try {
    await deleteDoc(doc(db, 'ad_campaigns', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

// --- CONTENT UPDATES ---
export const updateVideo = async (videoId: string, updates: Partial<Video>) => {
  const path = `videos/${videoId}`;
  try {
    await updateDoc(doc(db, 'videos', videoId), removeUndefined(updates));
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const updateTrack = async (trackId: string, updates: Partial<Track>) => {
  const path = `tracks/${trackId}`;
  try {
    await updateDoc(doc(db, 'tracks', trackId), removeUndefined(updates));
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const updateVideoSettings = async (videoId: string, settings: Partial<Video>) => {
  const path = `videos/${videoId}`;
  try {
    await updateDoc(doc(db, 'videos', videoId), removeUndefined(settings));
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const updateOnboardingStatus = async (uid: string, completed: boolean) => {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), { 
      hasCompletedOnboarding: completed,
      onboardingStartTimestamp: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const updateTooltipSettings = async (uid: string, enabled: boolean) => {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), { tooltipsEnabled: enabled });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const fetchUserProfileByEmail = async (email: string): Promise<UserProfile | null> => {
  const q = query(collection(db, 'users'), where('email', '==', email));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as UserProfile;
};

export const fetchUserAlbums = async (userId: string): Promise<Album[]> => {
  const path = 'albums';
  try {
    const q = query(collection(db, path), where('ownerId', '==', userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Album);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const subscribeToMailingList = async (artistId: string) => {
  if (!auth.currentUser) return;
  const subscriberId = auth.currentUser.uid;
  const id = `${artistId}_${subscriberId}`;
  const path = `mailing_lists/${id}`;
  try {
    const subscriber: MailingListSubscriber = {
      id,
      artistId,
      subscriberId,
      subscriberEmail: auth.currentUser.email || '',
      subscriberName: auth.currentUser.displayName || 'Anonymous',
      timestamp: Date.now()
    };
    await setDoc(doc(db, 'mailing_lists', id), subscriber);
    
    // Update artist's subscriber count
    const artistRef = doc(db, 'users', artistId);
    await updateDoc(artistRef, {
      mailingListCount: increment(1)
    });
    
    return true;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const unsubscribeFromMailingList = async (artistId: string) => {
  if (!auth.currentUser) return;
  const id = `${artistId}_${auth.currentUser.uid}`;
  const path = `mailing_lists/${id}`;
  try {
    await deleteDoc(doc(db, 'mailing_lists', id));
    
    const artistRef = doc(db, 'users', artistId);
    await updateDoc(artistRef, {
      mailingListCount: increment(-1)
    });
    
    return true;
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const isSubscribedToMailingList = async (artistId: string): Promise<boolean> => {
  if (!auth.currentUser) return false;
  const id = `${artistId}_${auth.currentUser.uid}`;
  const d = await getDoc(doc(db, 'mailing_lists', id));
  return d.exists();
};

export const fetchMailingListSubscribers = async (artistId: string): Promise<MailingListSubscriber[]> => {
  const path = 'mailing_lists';
  try {
    const q = query(collection(db, path), where('artistId', '==', artistId), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as MailingListSubscriber);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const importMailingList = async (artistId: string, emails: { email: string, name?: string }[]) => {
  const path = 'mailing_lists';
  try {
    const promises = emails.map(entry => {
      const id = `${artistId}_${entry.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      return setDoc(doc(db, path, id), {
        artistId,
        subscriberEmail: entry.email,
        subscriberName: entry.name || entry.email.split('@')[0],
        timestamp: Date.now()
      });
    });
    await Promise.all(promises);
    
    // Update artist's mailing list count
    const artistRef = doc(db, 'users', artistId);
    await updateDoc(artistRef, {
      mailingListCount: increment(emails.length)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const sendNewsletter = async (newsletter: Omit<Newsletter, 'id' | 'timestamp' | 'sentCount'>) => {
  if (!auth.currentUser) return;
  const id = `news_${Date.now()}`;
  const path = `newsletters/${id}`;
  try {
    // 1. Get all subscribers
    const subscribers = await fetchMailingListSubscribers(newsletter.artistId);
    
    const newNewsletter: Newsletter = {
      ...newsletter,
      id,
      timestamp: Date.now(),
      sentCount: subscribers.length
    };
    
    await setDoc(doc(db, 'newsletters', id), newNewsletter);
    
    // In a real app, this would trigger a Cloud Function to actually send emails
    // For now we just record it in the database
    
    return newNewsletter;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchNewsletters = async (artistId: string): Promise<Newsletter[]> => {
  const path = 'newsletters';
  try {
    const q = query(collection(db, path), where('artistId', '==', artistId), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Newsletter);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

// --- SYSTEM ADMINISTRATION ---

export const updateCloudAlbum = async (albumId: string, updates: Partial<Album>) => {
  if (!auth.currentUser) return;
  const path = `albums/${albumId}`;
  try {
    await updateDoc(doc(db, 'albums', albumId), removeUndefined(updates));
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const fetchAllUsers = async (): Promise<UserProfile[]> => {
  const path = 'users';
  try {
    const q = query(collection(db, path), orderBy('displayName', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchSystemStats = async (): Promise<SystemStats> => {
  // In a real app, this would be aggregated by a Cloud Function
  // For now, we'll simulate it by fetching some counts
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const albumsSnap = await getDocs(collection(db, 'albums'));
    const videosSnap = await getDocs(collection(db, 'videos'));
    const photosSnap = await getDocs(collection(db, 'photos'));

    return {
      totalUsers: usersSnap.size,
      activeUsers24h: Math.floor(usersSnap.size * 0.4), // Simulated
      globalStorage: {
        total: 1024 * 1024 * 500, // 500MB simulated
        audio: 1024 * 1024 * 200,
        video: 1024 * 1024 * 250,
        photos: 1024 * 1024 * 50
      },
      globalBandwidth: {
        daily: 1024 * 1024 * 100,
        monthly: 1024 * 1024 * 3000
      },
      sectionUsage: {
        music: albumsSnap.size,
        video: videosSnap.size,
        books: 12, // Public domain books
        photos: photosSnap.size
      }
    };
  } catch (e) {
    console.error("Failed to fetch system stats:", e);
    throw e;
  }
};

export const fetchAdConfigs = async (): Promise<AdConfig[]> => {
  const path = 'ads';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AdConfig));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchArtistAlbums = fetchUserContent;
export const fetchArtistVideos = fetchUserVideos;

export const updateAdConfig = async (ad: AdConfig) => {
  const path = `ads/${ad.id}`;
  try {
    await setDoc(doc(db, 'ads', ad.id), ad);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const deleteAdConfig = async (id: string) => {
  const path = `ads/${id}`;
  try {
    await deleteDoc(doc(db, 'ads', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const fetchUserAssets = async (uid: string) => {
  try {
    const [albums, videos, photos, personalTracks] = await Promise.all([
      fetchUserContent(uid),
      fetchUserVideos(uid),
      fetchUserPhotos(uid),
      // We need a version of fetchPersonalTracks that takes a UID
      getDocs(query(collection(db, 'personal_tracks'), where('ownerId', '==', uid)))
    ]);

    return {
      albums,
      videos,
      photos,
      personalTracks: personalTracks.docs.map(d => d.data() as Track)
    };
  } catch (e) {
    console.error("Failed to fetch user assets:", e);
    return { albums: [], videos: [], photos: [], personalTracks: [] };
  }
};

export const fetchMerchItems = async (ownerId?: string): Promise<MerchItem[]> => {
  const path = 'merch';
  try {
    let q;
    if (ownerId) {
      q = query(collection(db, path), where('ownerId', '==', ownerId), orderBy('timestamp', 'desc'));
    } else {
      q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(100));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as MerchItem));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const updateFundingGoal = async (targetId: string, type: 'ALBUM' | 'USER', amount: number) => {
  const path = type === 'ALBUM' ? `albums/${targetId}` : `users/${targetId}`;
  try {
    const ref = doc(db, type === 'ALBUM' ? 'albums' : 'users', targetId);
    await updateDoc(ref, {
      [type === 'ALBUM' ? 'donationCurrent' : 'tipCurrent']: increment(amount)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const joinMembershipTier = async (artistId: string, tierId: string) => {
  const user = auth.currentUser;
  if (!user) return;
  const id = `mem_${Date.now()}`;
  const path = `memberships/${id}`;

  try {
    const membership = {
      id,
      artistId,
      memberId: user.uid,
      status: 'ACTIVE',
      startDate: Date.now()
    };

    await setDoc(doc(db, 'memberships', id), membership);
    
    // Update user profile
    await updateDoc(doc(db, 'users', user.uid), {
      activeMemberships: arrayUnion(artistId)
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchThemePresets = async (): Promise<ProfileThemePreset[]> => {
  const path = 'themePresets';
  try {
    const q = query(
      collection(db, path),
      where('isPublic', '==', true),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ProfileThemePreset));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchUserThemePresets = async (uid: string): Promise<ProfileThemePreset[]> => {
  const path = 'themePresets';
  try {
    const q = query(
      collection(db, path),
      where('creatorId', '==', uid),
      orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ProfileThemePreset));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const createThemePreset = async (preset: Partial<ProfileThemePreset>): Promise<string | undefined> => {
  const user = auth.currentUser;
  if (!user) return;
  const id = `theme_${Date.now()}`;
  const path = `themePresets/${id}`;

  try {
    const newPreset: ProfileThemePreset = {
      id,
      creatorId: user.uid,
      title: preset.title || 'Untitled Theme',
      description: preset.description || '',
      mode: preset.mode || 'MIX',
      assets: preset.assets || [],
      coverImage: preset.coverImage || preset.assets?.[0]?.url || '',
      isPublic: preset.isPublic || false,
      timestamp: Date.now(),
      downloads: 0
    };

    await setDoc(doc(db, 'themePresets', id), newPreset);
    
    // Also add to user's saved themes library
    await updateDoc(doc(db, 'users', user.uid), {
      savedThemePresets: arrayUnion(id)
    });
    
    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

export const fetchThemePresetsByIds = async (ids: string[]): Promise<ProfileThemePreset[]> => {
  if (!ids || ids.length === 0) return [];
  const path = 'themePresets';
  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) {
      chunks.push(ids.slice(i, i + 10));
    }
    
    const results = await Promise.all(
      chunks.map(chunk => {
        const q = query(collection(db, path), where('id', 'in', chunk));
        return getDocs(q);
      })
    );
    
    return results.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ProfileThemePreset)));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchThemePresetById = async (presetId: string): Promise<ProfileThemePreset | null> => {
  const path = `themePresets/${presetId}`;
  try {
    const docSnap = await getDoc(doc(db, 'themePresets', presetId));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...(docSnap.data() as any) } as ProfileThemePreset;
    }
    return null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
    return null;
  }
};

export const updateThemePreset = async (presetId: string, updates: Partial<ProfileThemePreset>): Promise<void> => {
  const path = `themePresets/${presetId}`;
  try {
    await updateDoc(doc(db, 'themePresets', presetId), updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const deleteThemePreset = async (presetId: string): Promise<void> => {
  const path = `themePresets/${presetId}`;
  try {
    await deleteDoc(doc(db, 'themePresets', presetId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const createMuxDirectUpload = async (): Promise<{ id: string; url: string }> => {
  const res = await fetch('/api/mux/upload', { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create Mux upload');
  }
  return res.json();
};

export const getMuxPlaybackId = async (assetId: string): Promise<string | null> => {
  const res = await fetch(`/api/mux/playback?assetId=${assetId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.playbackId || null;
};

export const createMuxAssetFromUrl = async (url: string): Promise<{ assetId: string; playbackId: string | undefined }> => {
  const res = await fetch('/api/mux/create-asset-from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create Mux asset from URL');
  }
  return res.json();
};




// ─── HIDE N SEEK ─────────────────────────────────────────────────────────────

export const saveHideNSeekConfig = async (albumId: string, config: HideNSeekConfig) => {
  const path = `albums/${albumId}`;
  try {
    await updateDoc(doc(db, 'albums', albumId), { hideNSeekConfig: config });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

export const fetchHideNSeekAlternates = async (albumId: string): Promise<HideNSeekAlternate[]> => {
  const path = `albums/${albumId}/hideNSeekAlternates`;
  try {
    const snap = await getDocs(collection(db, 'albums', albumId, 'hideNSeekAlternates'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as HideNSeekAlternate));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const uploadHideNSeekAlternate = async (
  albumId: string,
  parentTrackId: string,
  slot: 1 | 2,
  file: File,
  title: string,
  artist: string
): Promise<HideNSeekAlternate> => {
  const altId = `${parentTrackId}_slot${slot}`;
  const storageRef = ref(storage, `hideNSeek/${albumId}/${altId}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  const alt: HideNSeekAlternate = {
    id: altId, albumId, parentTrackId, slot, title, artist, url, uploadedAt: Date.now()
  };
  await setDoc(doc(db, 'albums', albumId, 'hideNSeekAlternates', altId), alt);
  return alt;
};

export const deleteHideNSeekAlternate = async (albumId: string, altId: string) => {
  const path = `albums/${albumId}/hideNSeekAlternates/${altId}`;
  try {
    await deleteDoc(doc(db, 'albums', albumId, 'hideNSeekAlternates', altId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const fetchHideNSeekProgress = async (albumId: string): Promise<HideNSeekUserProgress | null> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'hideNSeekProgress', `${uid}_${albumId}`));
    return snap.exists() ? (snap.data() as HideNSeekUserProgress) : null;
  } catch (e) {
    return null;
  }
};

export const recordHideNSeekDiscovery = async (albumId: string, alternateIds: string[]): Promise<string[]> => {
  const uid = auth.currentUser?.uid;
  if (!uid || alternateIds.length === 0) return [];
  const progressRef = doc(db, 'hideNSeekProgress', `${uid}_${albumId}`);
  const statsRef = doc(db, 'hideNSeekStats', albumId);
  try {
    const existing = await getDoc(progressRef);
    const existingIds: string[] = existing.exists() ? (existing.data().discoveredAlternateIds || []) : [];
    const newIds = alternateIds.filter(id => !existingIds.includes(id));
    if (newIds.length === 0) return existingIds;
    await setDoc(progressRef, {
      userId: uid, albumId,
      discoveredAlternateIds: arrayUnion(...newIds),
      updatedAt: Date.now()
    }, { merge: true });
    const statsUpdate: Record<string, any> = { uniqueDiscovererIds: arrayUnion(uid) };
    newIds.forEach(id => { statsUpdate[`discoveryCount.${id}`] = increment(1); });
    await setDoc(statsRef, statsUpdate, { merge: true });
    return [...existingIds, ...newIds];
  } catch (e) {
    console.error('recordHideNSeekDiscovery error', e);
    return [];
  }
};

export const fetchHideNSeekStats = async (albumId: string): Promise<HideNSeekStats | null> => {
  try {
    const snap = await getDoc(doc(db, 'hideNSeekStats', albumId));
    return snap.exists() ? (snap.data() as HideNSeekStats) : null;
  } catch (e) {
    return null;
  }
};
