import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  updateMetadata,
  getMetadata,
} from 'firebase/storage';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch,
  query, where, orderBy, limit, onSnapshot as rawOnSnapshot, Timestamp, increment,
  arrayUnion, arrayRemove, runTransaction, serverTimestamp, addDoc, or, getDocFromServer
} from 'firebase/firestore';

// Firestore's watch stream can corrupt itself after quota/permission errors
// (firebase-js-sdk bug: INTERNAL ASSERTION FAILED ca9/b815) and then throw
// SYNCHRONOUSLY from any later onSnapshot registration — crashing whatever
// React tree subscribed. Every subscription in this file goes through this
// guard: a failed registration logs and returns a no-op unsubscribe instead
// of taking down the UI. Realtime updates degrade; reading/playback survives.
const onSnapshot: typeof rawOnSnapshot = ((...args: any[]) => {
  try {
    return (rawOnSnapshot as any)(...args);
  } catch (e) {
    console.warn('[backendService] snapshot subscription failed:', (e as Error)?.message?.slice(0, 200));
    return () => {};
  }
}) as typeof rawOnSnapshot;
import {
  signInWithPopup,
  signInWithCredential,
  linkWithPopup,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  TwitterAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  signInAnonymously,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { db, storage, auth as firebaseAuth } from './firebase';
import { saveResumable, updateResumableProgress, clearResumable } from './resumableUpload';
import { registerTransfer, updateTransfer, removeTransfer } from './activeUpload';
export const auth = firebaseAuth;
export { db };

/**
 * Ensure we have *some* Firebase identity so spectator features (video-room
 * "watch" mode) can establish WebRTC signaling, which our rules gate on
 * `request.auth != null`. Returns the existing user if signed in, otherwise
 * mints an anonymous (guest) session. Guests are flagged `isAnonymous` so the
 * UI can keep them read-only (e.g. no chat posting). Requires Anonymous sign-in
 * to be enabled in Firebase Console → Authentication → Sign-in method.
 */
export const ensureGuestAuth = async (): Promise<User | null> => {
  if (auth.currentUser) return auth.currentUser;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (e) {
    console.warn('[backendService] anonymous sign-in failed:', (e as Error)?.message);
    return null;
  }
};

// ── Sacred Library: cloud-synced Bible notes (per user, per verse ref) ────────
export const loadBibleNotes = async (uid: string): Promise<Record<string, string>> => {
  try {
    const snap = await getDocs(query(collection(db, 'bibleNotes'), where('uid', '==', uid)));
    const out: Record<string, string> = {};
    snap.forEach(d => { const x = d.data() as any; if (x.ref) out[x.ref] = x.text || ''; });
    return out;
  } catch { return {}; }
};
export const saveBibleNote = async (uid: string, ref: string, text: string): Promise<void> => {
  const id = `${uid}__${ref}`;
  try {
    if (text.trim()) await setDoc(doc(db, 'bibleNotes', id), { uid, ref, text: text.slice(0, 5000), updatedAt: Date.now() });
    else await deleteDoc(doc(db, 'bibleNotes', id)).catch(() => {});
  } catch (e) { console.warn('[backendService] saveBibleNote failed:', (e as Error)?.message); }
};
import { Album, Comment, Track, UserProfile, FeedItem, LiveFeed, StreamArchive, Video, MerchItem, Donation, TVChannel, Game, Photo, PhotoAlbum, PhotoAlbum as PhotoAlbumType, EventPhotoPool, ChatMessage, ChatRoom, CollabProject, CallSession, Membership, ArtistMembershipConfig, PPVEvent, Classroom, Lesson, Assignment, Submission, ProgressReport, VideoChatSession, Playlist, VideoComment, VideoPlaylist, Post, PayItForwardPool, PayItForwardWinner, PayItForwardDonation, PayItForwardVault, Newsletter, MailingListSubscriber, SystemStats, AdConfig, Article, ArticleBlock, BrandAccount, FanPage, FollowRelation, AdCampaign, PartnerConfig, Review, UserRevenue, StoreSettings, PostThemeBackground, ClassroomModule, WebApp, AppReview, AppNotification, SystemSettingsConfig, AdRatioConfig, StationIDStinger, AutoFastChannelConfig, IPWorld, Character, LoreEntry, TimelineEvent, Universe, LiveTalk, SharedAsset, PrivateBoard, BoardItem, ProfileThemePreset, HideNSeekConfig, HideNSeekAlternate, HideNSeekUserProgress, HideNSeekStats, Story, Club, ClubMembership, ClubPost, ClubGalleryItem, ClubChatMessage, ClubEvent, ClubStickyNote, ClubRole, ClubType, FastChannel, ChannelSource, ChannelSourceSet, SavedFeed, FastChannelSchedule, FastChannelSlot, ChannelBumper, FastChannelAssetGrant, FastChannelLibraryEntry, EarlyAccessEntry, ReviewCode, EarlyAccessRequest, PodcastRssSettings, ImportedRssEpisode, AccountType, NotifyLevel } from '../types';
import { accountFlagUpdate } from './accountCapabilities';
// Creator Passport provenance (blueprint 1C.5) — attribution record, not crypto proof.
import { buildProvenance, stampVideo } from './creatorPassport';
// Education-chat safety (Phase C): student DM policy backstop on the write path.
import { canDM, isStudentAccount, classroomRoomId, classroomParticipants } from './educationChat';

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
      speakers: [{ uid: auth.currentUser.uid, name: auth.currentUser.displayName || 'Anonymous', photoURL: auth.currentUser.photoURL || '', isMuted: false }],
      listeners: [],
      sharedAssets: [],
      timestamp: Date.now()
    };
    await setDoc(docRef, removeUndefined(newTalk));
    
    // Notify followers
    notifyFollowers(auth.currentUser.uid, 'CONTENT', 'Live Talk Started', `${auth.currentUser.displayName} is LIVE now: ${newTalk.title}`, 'LIVETALK', docRef.id, { highlight: true });
    
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
      // `speakers` holds objects {uid,name,photoURL,isMuted} — push a real one, not a bare uid,
      // so promoted speakers carry their identity (matches the shape the room UI builds).
      const speaker = { uid: auth.currentUser.uid, name: auth.currentUser.displayName || 'Speaker', photoURL: auth.currentUser.photoURL || '', isMuted: false };
      await updateDoc(talkRef, {
        speakers: arrayUnion(speaker),
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
  const uid = auth.currentUser.uid;
  const path = `liveTalks/${talkId}`;
  try {
    const talkRef = doc(db, 'liveTalks', talkId);
    // `speakers` are OBJECTS, so arrayRemove(uid-string) never matched and a departing speaker's
    // tile/stream lingered forever. Read-modify-write to filter by uid; listeners are uid strings
    // so arrayRemove still works for them.
    const snap = await getDoc(talkRef);
    const speakers = Array.isArray((snap.data() as any)?.speakers)
      ? (snap.data() as any).speakers.filter((s: any) => (s?.uid ?? s) !== uid)
      : [];
    await updateDoc(talkRef, {
      speakers,
      listeners: arrayRemove(uid),
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

export const fetchWorldById = async (worldId: string): Promise<IPWorld | null> => {
  try {
    const snap = await getDoc(doc(db, 'worlds', worldId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as IPWorld;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `worlds/${worldId}`);
    return null;
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

/**
 * Every Character across all of a user's worlds — the pool of artist "personas" a
 * creator can credit a release to. Includes unpublished/private characters (onlyPublished
 * = false) since a persona may be work-in-progress, and drops discarded (merged) entries.
 * Each returned character carries its worldId so callers can round-trip to the world.
 */
export const fetchUserCharacters = async (uid: string): Promise<Character[]> => {
  try {
    const worlds = await fetchUserWorlds(uid);
    const perWorld = await Promise.all(
      worlds.map(w => fetchWorldCharacters(w.id, false).catch(() => [] as Character[]))
    );
    return perWorld.flat().filter(c => !c.discarded);
  } catch (e) {
    console.error('[fetchUserCharacters]', e);
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
      creatorId: world.creatorId || auth.currentUser?.uid || '',
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

    // Also publish characters, lore, and timeline events for this world (subcollections)
    const subCollections = ['characters', 'lore', 'timeline'];
    for (const collName of subCollections) {
      const q = collection(db, 'worlds', worldId, collName);
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
      isPublished: char.isPublished ?? true
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
      isPublished: lore.isPublished ?? true
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
      isPublished: event.isPublished ?? true,
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
  if (!auth.currentUser) throw new Error('Not authenticated');
  // Verify world exists. If creatorId is missing or blank (data from an older
  // creation path), patch it now so the Firestore rule's get() check passes.
  const worldSnap = await getDocFromServer(doc(db, 'worlds', timeline.worldId));
  if (!worldSnap.exists()) throw new Error(`World document not found (id: ${timeline.worldId}). Save the world first.`);
  const worldData = worldSnap.data();
  if (!worldData?.creatorId) {
    await updateDoc(doc(db, 'worlds', timeline.worldId), { creatorId: auth.currentUser.uid });
  } else if (worldData.creatorId !== auth.currentUser.uid) {
    throw new Error('You are not the creator of this world.');
  }
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

export const setVideoTimeline = async (videoId: string, timelineId: string | null) => {
  try {
    await updateDoc(doc(db, 'videos', videoId), { timelineId: timelineId ?? null });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `videos/${videoId}`);
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
    crossoverEnabled: true,
    updatedAt: Date.now()
  };
  try {
    const docSnap = await getDoc(doc(db, 'systemConfig', 'settings'));
    if (docSnap.exists()) {
      return docSnap.data() as SystemSettingsConfig;
    } else {
      // Only write the default doc if the user is authenticated (admin check skipped for speed)
      if (auth.currentUser) {
        setDoc(doc(db, 'systemConfig', 'settings'), defaultConfig).catch(() => {});
      }
      return defaultConfig;
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
    return defaultConfig;
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

// ── Landing Background ────────────────────────────────────────────────────────

export const fetchLandingBgConfig = async (): Promise<import('../types').LandingBgConfig | null> => {
  try {
    const snap = await getDoc(doc(db, 'systemConfig', 'landingBg'));
    return snap.exists() ? (snap.data() as import('../types').LandingBgConfig) : null;
  } catch {
    return null;
  }
};

export const saveLandingBgConfig = async (config: import('../types').LandingBgConfig): Promise<void> => {
  await setDoc(doc(db, 'systemConfig', 'landingBg'), config);
};

export const uploadLandingBgAsset = async (
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ url: string; thumbnailUrl?: string }> => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const path = `landing-bg/${Date.now()}_${file.name}`;
  const sRef = ref(storage, path);
  const task = uploadBytesResumable(sRef, file);
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed',
      snap => onProgress?.(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      reject,
      resolve
    );
  });
  const url = await getDownloadURL(task.snapshot.ref);
  return { url };
};

/** Upload one Fabula project asset (a local blob) to durable cloud storage and return its
 *  download URL, so the project's media is available on any device. Path is scoped to the
 *  signed-in user + project + asset id (stable — re-uploads overwrite the same object). */
export const uploadFabulaAsset = async (
  projectId: string,
  assetId: string,
  blob: Blob,
  filename?: string,
  onProgress?: (pct: number) => void
): Promise<string> => {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to sync');
  const ext = (filename?.split('.').pop() || blob.type.split('/')[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Under users/{uid}/** — the existing storage rule already lets the owner write here.
  const path = `users/${uid}/fabula/${projectId}/${assetId}.${ext || 'bin'}`;
  const sRef = ref(storage, path);
  const task = uploadBytesResumable(sRef, blob, blob.type ? { contentType: blob.type } : undefined);
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed',
      snap => onProgress?.(Math.round(snap.bytesTransferred / Math.max(1, snap.totalBytes) * 100)),
      reject, resolve);
  });
  return await getDownloadURL(task.snapshot.ref);
};

export const fetchSportsHeroConfig = async (): Promise<import('../types').SportsHeroConfig | null> => {
  try {
    const snap = await getDoc(doc(db, 'systemConfig', 'sportsHero'));
    return snap.exists() ? (snap.data() as import('../types').SportsHeroConfig) : null;
  } catch {
    return null;
  }
};

export const saveSportsHeroConfig = async (config: import('../types').SportsHeroConfig): Promise<void> => {
  await setDoc(doc(db, 'systemConfig', 'sportsHero'), config);
};

export const uploadSportsHeroAsset = async (
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ url: string }> => {
  const path = `sports-hero/${Date.now()}_${file.name}`;
  const sRef = ref(storage, path);
  const task = uploadBytesResumable(sRef, file);
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed',
      snap => onProgress?.(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      reject,
      resolve
    );
  });
  const url = await getDownloadURL(task.snapshot.ref);
  return { url };
};


// ── Club Cover Media ─────────────────────────────────────────────────────────

export interface ClubCoverMediaDoc {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
  order: number;
  uploadedAt: number;
}

export const uploadClubCoverMediaFile = async (
  file: File,
  order: number,
  onProgress?: (pct: number) => void,
): Promise<ClubCoverMediaDoc> => {
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = IMAGE_EXTS.includes(ext) ? 'image' : 'video';
  const slug = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
  const sRef = ref(storage, `club-cover-media/${slug}`);
  // Explicit contentType so Storage rules isAllowedContentType() check passes.
  const contentType = file.type || (type === 'video' ? 'video/mp4' : 'image/jpeg');
  const task = uploadBytesResumable(sRef, file, { contentType });
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed',
      snap => onProgress?.(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      reject,
      resolve,
    );
  });
  const url = await getDownloadURL(task.snapshot.ref);
  const docData: Omit<ClubCoverMediaDoc, 'id'> = {
    url, type, name: file.name, order, uploadedAt: Date.now(),
  };
  await setDoc(doc(db, 'clubCoverMedia', slug), docData);
  return { id: slug, ...docData };
};

export const deleteClubCoverMediaFile = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'clubCoverMedia', id));
};

export const saveClubCoverSettings = async (settings: {
  mode: 'off' | 'single' | 'slideshow';
  singleItemId?: string | null;
  slideshowOrder?: 'random' | 'sequential';
}): Promise<void> => {
  await setDoc(doc(db, 'clubCoverSettings', 'main'), settings, { merge: true });
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
// Resolve an author's education role (cached ~5min) so posts from schools/teachers/students —
// and participating parents — get tagged for the Academia school-community feed. NOT generic
// platform admins. Returns null for everyone else (their posts stay out of the school feed).
const _eduRoleCache = new Map<string, { role: Post['eduRole'] | null; at: number }>();
export const resolveEduRole = async (uid: string): Promise<Post['eduRole'] | null> => {
  const cached = _eduRoleCache.get(uid);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.role;
  let role: Post['eduRole'] | null = null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const d: any = snap.exists() ? snap.data() : {};
    const t = d.accountType;
    if (t === 'TEACHER' || d.isTeacher || (d.teacherVerification && d.teacherVerification !== 'UNVERIFIED')) role = 'TEACHER';
    else if (t === 'STUDENT' || t === 'CHILD' || d.childState === 'SCHOOL_PROVISIONED' || d.provisionedByTeacherUid) role = 'STUDENT';
    else if (d.isSchoolAdmin) role = 'SCHOOL';
    else if (t === 'PARENT') role = 'PARENT';
  } catch { /* non-fatal — just don't tag */ }
  _eduRoleCache.set(uid, { role, at: Date.now() });
  return role;
};

export const createPost = async (post: Partial<Post>) => {
  if (!auth.currentUser) return;
  const path = 'posts';
  const feedPath = 'feed';
  try {
    // "Operate as org": a caller may present the post as an organization the user
    // runs. authorId STAYS the user's uid (ownership + Storage/rules), while the
    // displayed name/photo become the org's + authorOrgId/authorIsOrg mark it.
    const orgId = (post as any).authorOrgId as string | undefined;
    const authorName = post.authorName || auth.currentUser.displayName || 'Anonymous';
    const authorPhoto = post.authorPhoto || auth.currentUser.photoURL || '';
    // Tag posts from education accounts so they surface in the Academia school-community feed.
    const eduRole = post.eduRole ?? (await resolveEduRole(auth.currentUser.uid).catch(() => null)) ?? undefined;
    const eduFields = eduRole ? { isEduPost: true, eduRole } : {};
    const postData = removeUndefined({
      ...post,
      text: post.text || '',
      authorId: auth.currentUser.uid,
      authorName,
      authorPhoto,
      ...eduFields,
      ...(orgId ? { authorIsOrg: true, authorOrgId: orgId } : {}),
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
      authorName,
      authorPhoto,
      ...(orgId ? { authorIsOrg: true, authorOrgId: orgId } : {}),
      type: mediaFeedType(post.media),
      content: post.text || '',
      timestamp: Date.now(),
      likesCount: 0,
      commentCount: 0,
      shareCount: 0,
      ...(firstImageUrl(post.media) ? { imageUrl: firstImageUrl(post.media) } : {}),
      ...(sanitizeMediaForWrite(post.media) ? { media: sanitizeMediaForWrite(post.media) } : {}),
      originalPostId: docRef.id
    }).catch(() => {});

    // Notify followers
    notifyFollowers(auth.currentUser.uid, 'CONTENT', 'New Post', `${auth.currentUser.displayName} shared a new post`, 'FEED', docRef.id);

    // Posting directly on someone else's feed/wall → notify that person specifically.
    const targetUid = (post as any).targetUserId as string | undefined;
    if (targetUid && targetUid !== auth.currentUser.uid) {
      createNotification({
        userId: targetUid,
        senderId: auth.currentUser.uid,
        senderName: authorName,
        senderPhoto: authorPhoto,
        type: 'CONTENT',
        title: 'New post on your feed',
        message: `${authorName} posted on your feed`,
        link: 'FEED',
        targetId: docRef.id,
      }).catch(() => {});
    }

    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

/**
 * Resolve a composer AssetEmbed into the post fields that render it. A shared ALBUM (Chora
 * music) becomes a full `albumEmbed` so PostCard shows the inline MiniMusicPlayer; every
 * platform asset also keeps a light `assetEmbed` reference so nothing is silently dropped.
 * (The three composer onPost handlers previously ignored assetEmbed entirely — music never
 * embedded in posts.)
 */
export const postFieldsForAssetEmbed = async (
  assetEmbed?: { type: string; id: string; title?: string; imageUrl?: string; subtitle?: string }
): Promise<Record<string, any>> => {
  if (!assetEmbed?.id) return {};
  const fields: Record<string, any> = { assetEmbed };
  if (assetEmbed.type === 'ALBUM') {
    try {
      const snap = await getDoc(doc(db, 'albums', assetEmbed.id));
      if (snap.exists()) { fields.albumEmbed = { id: snap.id, ...snap.data() }; fields.autoPlayEmbed = false; }
    } catch { /* keep the light reference card */ }
  }
  return fields;
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

export const addPostComment = async (
  postId: string, text: string, parentId?: string | null,
  videoUrl?: string, audioUrl?: string, gifUrl?: string, imageUrl?: string,
) => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const displayName = auth.currentUser.displayName || 'Anonymous';
  const commentData: Record<string, any> = {
    author: displayName,
    text: text.trim(),
    authorId: auth.currentUser.uid,
    authorName: displayName,
    authorPhoto: auth.currentUser.photoURL || '',
    uid: auth.currentUser.uid,
    timestamp: Date.now(),
    parentId: parentId || null,
    likedBy: [] as string[],
    likesCount: 0,
  };
  if (imageUrl) commentData.imageUrl = imageUrl;
  if (videoUrl) commentData.videoUrl = videoUrl;
  if (audioUrl) commentData.audioUrl = audioUrl;
  if (gifUrl)   commentData.gifUrl   = gifUrl;
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

// ─── CLUB POST COMMENTS ───────────────────────────────────────────────────────

export const subscribeToClubPostComments = (postId: string, callback: (comments: any[]) => void) => {
  const q = query(
    collection(db, 'clubPosts', postId, 'comments'),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => handleFirestoreError(err, OperationType.LIST, `clubPosts/${postId}/comments`));
};

export const addClubPostComment = async (
  postId: string, text: string, parentId?: string | null, gifUrl?: string,
) => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const displayName = auth.currentUser.displayName || 'Anonymous';
  const commentData: Record<string, any> = {
    author: displayName,
    text: text.trim(),
    authorId: auth.currentUser.uid,
    authorName: displayName,
    authorPhoto: auth.currentUser.photoURL || '',
    uid: auth.currentUser.uid,
    timestamp: Date.now(),
    parentId: parentId || null,
    likedBy: [],
    likesCount: 0,
  };
  if (gifUrl) commentData.gifUrl = gifUrl;
  const docRef = await addDoc(collection(db, 'clubPosts', postId, 'comments'), commentData);
  updateDoc(doc(db, 'clubPosts', postId), { commentCount: increment(1) }).catch(() => {});
  return { id: docRef.id, ...commentData };
};

export const deleteClubPostComment = async (postId: string, commentId: string) => {
  if (!auth.currentUser) return;
  await deleteDoc(doc(db, 'clubPosts', postId, 'comments', commentId));
  updateDoc(doc(db, 'clubPosts', postId), { commentCount: increment(-1) }).catch(() => {});
};

export const toggleClubPostCommentLike = async (postId: string, commentId: string) => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const ref = doc(db, 'clubPosts', postId, 'comments', commentId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const likedBy: string[] = snap.data().likedBy || [];
    const liked = likedBy.includes(uid);
    tx.update(ref, {
      likedBy: liked ? arrayRemove(uid) : arrayUnion(uid),
      likesCount: increment(liked ? -1 : 1),
    });
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

/** The Academia school-community feed: public posts from schools, teachers & students (and
 *  participating parents) across Plajah. Single-field `isEduPost==true` index (auto) + client
 *  sort — no composite index needed. Callers still run filterPostsForViewer for kid safety. */
export const listenToEduFeed = (callback: (posts: Post[]) => void) => {
  const q = query(collection(db, 'posts'), where('isEduPost', '==', true), limit(120));
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data(), sourceCollection: 'posts', timestamp: safeToMillis(d.data().timestamp) } as Post))
      .filter(p => p.timestamp > 0 && p.isPublic !== false)
      .sort((a, b) => b.timestamp - a.timestamp);
    callback(items);
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'posts'));
};

/** A guardian's lens: their own children's posts (authorId in childUids), regardless of privacy —
 *  the parent has visibility into their kids. `in` supports ≤10 ids; single-field authorId index. */
export const listenToChildrenPosts = (childUids: string[], callback: (posts: Post[]) => void) => {
  const ids = (childUids || []).filter(Boolean).slice(0, 10);
  if (!ids.length) { callback([]); return () => {}; }
  const q = query(collection(db, 'posts'), where('authorId', 'in', ids), limit(60));
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data(), sourceCollection: 'posts', timestamp: safeToMillis(d.data().timestamp) } as Post))
      .filter(p => p.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
    callback(items);
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'posts'));
};

/**
 * A business/organization's own feed. Posts made "as" the org (createPost with
 * authorOrgId) live in the shared `posts` collection; an org page surfaces its
 * feed by filtering to its id. Client-side sort avoids a composite index.
 */
export const listenToOrgPosts = (orgId: string, callback: (posts: Post[]) => void) => {
  const q = query(collection(db, 'posts'), where('authorOrgId', '==', orgId), limit(50));
  return onSnapshot(q, snapshot => {
    const items = snapshot.docs
      .map(d => ({ id: d.id, ...d.data(), sourceCollection: 'posts', timestamp: safeToMillis(d.data().timestamp) } as Post))
      .filter(p => p.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
    callback(items);
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'posts'));
};

/** Post as a business/organization the caller runs (appears on the org's feed + globally). */
export const createOrgPost = async (
  orgId: string, orgName: string, orgPhoto: string, post: Partial<Post>,
): Promise<string | undefined> =>
  createPost({ ...post, authorOrgId: orgId, authorName: orgName, authorPhoto: orgPhoto } as any);

/**
 * Genre-based FOR_YOU feed — no ML needed.
 * Strategy: query posts where genre matches any of the user's preferred genres.
 * Falls back to recency if no preferences are set.
 * Requires a Firestore index on: posts(genre ASC, timestamp DESC).
 * Add to firestore.indexes.json:
 *   { "collectionGroup":"posts","queryScope":"COLLECTION","fields":[{"fieldPath":"genre","order":"ASCENDING"},{"fieldPath":"timestamp","order":"DESCENDING"}] }
 */
export const listenToForYouPosts = (
  preferredGenres: string[],
  callback: (posts: Post[]) => void
): (() => void) => {
  if (!preferredGenres.length) {
    // No preferences → fall back to global feed
    return listenToGlobalPosts(callback);
  }
  // Firestore 'in' supports up to 10 values
  const genres = preferredGenres.slice(0, 10);
  const q = query(
    collection(db, 'posts'),
    where('genre', 'in', genres),
    orderBy('timestamp', 'desc'),
    limit(60)
  );
  return onSnapshot(q, snapshot => {
    const posts = snapshot.docs.map(d => ({
      id: d.id, ...d.data(),
      sourceCollection: 'posts',
      timestamp: safeToMillis(d.data().timestamp),
    } as Post)).filter(p => p.timestamp > 0).sort((a, b) => b.timestamp - a.timestamp);
    callback(posts);
  }, err => handleFirestoreError(err, OperationType.LIST, 'posts'));
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
    ownerId: auth.currentUser!.uid,
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
    ownerId: auth.currentUser!.uid,
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
  // Do NOT re-throw here — callers that need to propagate errors must do so explicitly with `throw e`.
  // Re-throwing here causes every `catch (e) { handleFirestoreError(...); return []; }` fallback to be dead code.
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
    // Try to guess from filename — exhaustive map so Firebase serves correct Content-Type
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      // Audio — lossy
      'mp3': 'audio/mpeg', 'mp2': 'audio/mpeg', 'mp1': 'audio/mpeg',
      'm4a': 'audio/mp4', 'aac': 'audio/aac',
      'ogg': 'audio/ogg', 'oga': 'audio/ogg', 'opus': 'audio/ogg; codecs=opus',
      'webm': 'audio/webm', 'weba': 'audio/webm',
      'wma': 'audio/x-ms-wma', 'ra': 'audio/x-realaudio', 'rm': 'audio/x-realaudio',
      'amr': 'audio/amr', 'gsm': 'audio/gsm',
      // Audio — lossless / PCM
      'wav': 'audio/wav', 'wave': 'audio/wav', 'bwf': 'audio/wav',
      'rf64': 'audio/wav', 'w64': 'audio/wav',
      'flac': 'audio/flac',
      'aiff': 'audio/aiff', 'aif': 'audio/aiff', 'aifc': 'audio/aiff',
      'alac': 'audio/mp4', 'ape': 'audio/x-ape',
      'wv': 'audio/x-wavpack', 'tta': 'audio/x-tta', 'tak': 'audio/x-tak',
      'shn': 'audio/x-shorten', 'caf': 'audio/x-caf',
      // Audio — surround / broadcast
      'ac3': 'audio/ac3', 'eac3': 'audio/eac3',
      'dts': 'audio/vnd.dts', 'dtshd': 'audio/vnd.dts.hd',
      'mpc': 'audio/x-musepack', 'mka': 'audio/x-matroska',
      // Audio — game / immersive
      'iamf': 'audio/iamf',
      // Audio — MIDI / tracker
      'mid': 'audio/midi', 'midi': 'audio/midi', 'kar': 'audio/midi',
      'mod': 'audio/x-mod', 'xm': 'audio/x-xm', 'it': 'audio/x-it', 's3m': 'audio/x-s3m',
      // Video
      'mp4': 'video/mp4', 'mov': 'video/quicktime', 'mkv': 'video/x-matroska',
      'm4v': 'video/mp4', 'avi': 'video/x-msvideo', 'wmv': 'video/x-ms-wmv',
      'ts': 'video/mp2t', 'm2ts': 'video/mp2t', 'mts': 'video/mp2t',
      // Image
      'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
      'gif': 'image/gif', 'webp': 'image/webp', 'avif': 'image/avif',
      'heic': 'image/heic', 'heif': 'image/heif', 'svg': 'image/svg+xml',
    };
    if (ext && mimeMap[ext]) {
      contentType = mimeMap[ext];
    } else {
      contentType = 'application/octet-stream';
    }
  }

  console.log(`Attempting upload to: ${sanitizedPath} (Type: ${contentType})`);
  console.log(`Current Origin: ${window.location.origin}`);

  // Ensure Firebase auth is restored before uploading. The app can render a user as "logged in"
  // from a cached profile while auth.currentUser is briefly null right after load → request.auth is
  // null in the Storage rules → storage/unauthorized (mislabeled "must be signed in"). Wait briefly
  // for restoration; only after that is "not signed in" genuinely true.
  if (!auth.currentUser) {
    await new Promise<void>((res) => {
      const unsub = onAuthStateChanged(auth, () => { unsub(); res(); });
      setTimeout(() => { try { unsub(); } catch { /* */ } res(); }, 6000);
    });
  }
  if (!auth.currentUser) {
    const e = new Error('You must be signed in to upload. Your session may have expired — please sign in again.');
    import('./errorReporting').then(m => m.reportError(e, { source: 'upload', context: `auth-missing · ${sanitizedPath}` })).catch(() => {});
    throw e;
  }

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
            import('./errorReporting').then(m => m.reportError(error, { source: 'upload', context: `storage/unauthorized · ${sanitizedPath} · signedIn=${!!auth.currentUser} · type=${contentType}` })).catch(() => {});
            reject(new Error("Storage permission denied. If you're signed in, please retry — your session may have just refreshed."));
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

// ─── Audio metadata fixer ─────────────────────────────────────────────────────

/**
 * Extract the Firebase Storage path from a Firebase download URL.
 * Returns null for non-Firebase or object-URL tracks.
 */
const storagePathFromUrl = (url: string): string | null => {
  try {
    // Firebase download URLs: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?...
    const match = url.match(/\/o\/([^?]+)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch { return null; }
};

/**
 * Fix the Content-Type metadata on an already-uploaded Firebase Storage file
 * without re-uploading the bytes. Safe to call fire-and-forget.
 * Returns the corrected MIME type, or null if not applicable/failed.
 */
export const fixTrackStorageMetadata = async (trackUrl: string): Promise<string | null> => {
  if (!trackUrl || trackUrl.startsWith('blob:') || !trackUrl.includes('firebasestorage.googleapis.com')) {
    return null;
  }
  try {
    const storagePath = storagePathFromUrl(trackUrl);
    if (!storagePath) return null;
    const storageRef = ref(storage, storagePath);
    const meta = await getMetadata(storageRef);
    const ext = (meta.name ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (!ext) return null;

    const MIME_MAP: Record<string, string> = {
      mp3: 'audio/mpeg', mp2: 'audio/mpeg', mp1: 'audio/mpeg',
      m4a: 'audio/mp4', aac: 'audio/aac',
      ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg; codecs=opus',
      webm: 'audio/webm', weba: 'audio/webm',
      wav: 'audio/wav', wave: 'audio/wav', bwf: 'audio/wav', rf64: 'audio/wav', w64: 'audio/wav',
      flac: 'audio/flac',
      aiff: 'audio/aiff', aif: 'audio/aiff', aifc: 'audio/aiff',
      alac: 'audio/mp4', ape: 'audio/x-ape', wv: 'audio/x-wavpack', tta: 'audio/x-tta',
      tak: 'audio/x-tak', shn: 'audio/x-shorten', caf: 'audio/x-caf',
      mka: 'audio/x-matroska', wma: 'audio/x-ms-wma', ra: 'audio/x-realaudio',
      ac3: 'audio/ac3', eac3: 'audio/eac3', dts: 'audio/vnd.dts', mpc: 'audio/x-musepack',
      amr: 'audio/amr', gsm: 'audio/gsm', iamf: 'audio/iamf',
      mid: 'audio/midi', midi: 'audio/midi',
    };

    const correctMime = MIME_MAP[ext];
    if (!correctMime) return null;

    const currentMime = meta.contentType ?? '';
    // Strip codec params before comparing
    const currentBase = currentMime.split(';')[0].trim();
    const correctBase = correctMime.split(';')[0].trim();

    if (currentBase === correctBase) return currentMime; // already correct

    console.info(`[Plajah Storage Fix] "${meta.name}": "${currentMime}" → "${correctMime}"`);
    await updateMetadata(storageRef, { contentType: correctMime });
    return correctMime;
  } catch (e) {
    // Non-fatal — metadata fix is best-effort
    console.warn('[Plajah Storage Fix] Could not update metadata:', e);
    return null;
  }
};

export interface TrackFixResult {
  trackId: string;
  title: string;
  url: string;
  previousMime: string | null;
  fixedMime: string | null;
  fixed: boolean;
  error?: string;
}

/**
 * Scan every track in an album and fix any wrong Content-Types in Firebase Storage.
 * Returns a per-track report. Pass onProgress to stream results as they come in.
 */
export const fixAlbumAudioMetadata = async (
  album: { id: string; tracks: { id: string; title: string; url: string }[] },
  onProgress?: (done: number, total: number, latest: TrackFixResult) => void
): Promise<TrackFixResult[]> => {
  const results: TrackFixResult[] = [];
  const tracks = album.tracks ?? [];

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const result: TrackFixResult = { trackId: t.id, title: t.title, url: t.url, previousMime: null, fixedMime: null, fixed: false };
    try {
      if (!t.url || t.url.startsWith('blob:') || !t.url.includes('firebasestorage.googleapis.com')) {
        result.error = 'Not a Firebase Storage URL — skipped';
      } else {
        const tPath = storagePathFromUrl(t.url);
        if (!tPath) { result.error = 'Could not parse storage path'; continue; }
        const storageRef = ref(storage, tPath);
        const meta = await getMetadata(storageRef);
        result.previousMime = meta.contentType ?? null;
        result.fixedMime = await fixTrackStorageMetadata(t.url);
        result.fixed = !!result.fixedMime && result.fixedMime !== result.previousMime;
      }
    } catch (e: any) {
      result.error = e?.message ?? String(e);
    }
    results.push(result);
    onProgress?.(i + 1, tracks.length, result);
  }

  const fixedCount = results.filter(r => r.fixed).length;
  console.info(`[Plajah Storage Fix] Album "${album.id}" — ${fixedCount}/${tracks.length} tracks corrected.`);
  return results;
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
      const d = docSnap.data();
      // Backfill the fields isValidUserProfile REQUIRES (uid/displayName/photoURL/
      // email). A profile clobbered by the old full-replace firestoreWrite loses
      // these, and then every owner update fails the rule → nothing persists.
      // Including uid + guaranteed non-null strings here self-heals it on login.
      const updates: Partial<UserProfile> = {
        uid: user.uid,
        displayName: user.displayName || d.displayName || 'Anonymous Artist',
        photoURL: (user.photoURL ?? d.photoURL ?? '') as string,
        email: user.email || d.email || '',
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
      timestamp: Date.now(),
      score: 0,
      scoreUpdatedAt: Date.now(),
      interactions: { deep: {}, medium: {}, base: {}, dmSharerIds: [] },
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

// ── Feed Scoring ──────────────────────────────────────────────────────────────

import {
  computeFeedScore,
  buildDebateSignals,
  emptyInteractions,
  type DeepAction, type MediumAction, type BaseAction,
  type PostInteractions, type CreatorSignals,
} from './feedScoreEngine';

type AnyAction = DeepAction | MediumAction | BaseAction;
type ActionBucket = 'deep' | 'medium' | 'base';

const ACTION_BUCKET_MAP: Record<AnyAction, ActionBucket> = {
  // deep
  SANCTUARY_SUBSCRIBE: 'deep', PITCH_DECK_CONVERT: 'deep', SEED_RAISER_CONTRIB: 'deep',
  TIP_DONATION: 'deep', PAY_IT_FORWARD: 'deep', BOOK_PURCHASE: 'deep',
  // medium
  FEDIVERSE_BROADCAST: 'medium', DM_SHARE: 'medium', LONG_COMMENT: 'medium',
  DEBATE_REPLY: 'medium',
  NATIVE_SHARE: 'medium', CLUB_SHARE: 'medium', BOOKMARK: 'medium', PLAYLIST_ADD: 'medium',
  // base
  LIKE: 'base', SONG_PLAY_START: 'base', SONG_PLAY_COMPLETE: 'base', DWELL_10S: 'base',
};

/** Record a single interaction on a feed post and re-derive the score. */
export const recordFeedInteraction = async (
  postId: string,
  action: AnyAction,
  sourceCollection: 'feed' | 'posts' = 'feed',
  opts?: { isDMShare?: boolean; sharerId?: string },
): Promise<void> => {
  if (!auth.currentUser) return;
  const path = sourceCollection;
  try {
    const ref = doc(db, path, postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const interactions: PostInteractions = data.interactions ?? emptyInteractions();
    const bucket = ACTION_BUCKET_MAP[action];

    // Increment the action counter in the appropriate bucket
    const currentCount = (interactions as any)[bucket][action] ?? 0;
    // Hard-cap dwell at 6 events client-side (60s max contribution)
    const newCount = action === 'DWELL_10S'
      ? Math.min(currentCount + 1, 6)
      : currentCount + 1;

    (interactions as any)[bucket][action] = newCount;

    // Track DM sharers for word-of-mouth detection
    if (opts?.isDMShare && opts.sharerId) {
      const dmSharerIds: string[] = interactions.dmSharerIds ?? [];
      if (!dmSharerIds.includes(opts.sharerId)) {
        dmSharerIds.push(opts.sharerId);
        interactions.dmSharerIds = dmSharerIds;
      }
    }

    // Recompute score using creator signals already stored on the doc
    const creatorSignals: CreatorSignals = data.creatorSignals ?? {
      hasPaidSanctuaryMembers: false, hasActivePitchDeck: false,
      hasActiveFundraiser: false, isNewProjectLaunch: false,
      isFediverseConnected: false, isVerifiedIndependent: false,
    };

    // Track comment author IDs for debate detection
    const isDiscourseAction = action === 'LONG_COMMENT' || action === 'DEBATE_REPLY';
    const uid = auth.currentUser?.uid;
    if (isDiscourseAction && uid) {
      const commentAuthorIds: string[] = interactions.commentAuthorIds ?? [];
      if (!commentAuthorIds.includes(uid)) {
        commentAuthorIds.push(uid);
        interactions.commentAuthorIds = commentAuthorIds;
      }
    }

    const debateSignals = buildDebateSignals(interactions);

    const newScore = computeFeedScore({
      interactions,
      createdAt: data.timestamp ?? Date.now(),
      creatorSignals,
      debateSignals,
      // δ_discovery = 1.0 server-side; applied client-side per viewer by useViewerDiscovery
    });

    await updateDoc(ref, {
      [`interactions.${bucket}.${action}`]: newCount,
      ...(opts?.isDMShare && opts.sharerId ? { 'interactions.dmSharerIds': arrayUnion(opts.sharerId) } : {}),
      ...(isDiscourseAction && uid ? { 'interactions.commentAuthorIds': arrayUnion(uid) } : {}),
      score: newScore,
      scoreUpdatedAt: Date.now(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `${path}/${postId}`);
  }
};

/** Attach creator signals to a post (call after Sanctuary/pitch deck state changes). */
export const updatePostCreatorSignals = async (
  postId: string,
  signals: CreatorSignals,
  sourceCollection: 'feed' | 'posts' = 'feed',
): Promise<void> => {
  try {
    const ref = doc(db, sourceCollection, postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const interactions: PostInteractions = data.interactions ?? emptyInteractions();
    const newScore = computeFeedScore({
      interactions, creatorSignals: signals,
      debateSignals: buildDebateSignals(interactions),
      createdAt: data.timestamp ?? Date.now(),
    });
    await updateDoc(ref, { creatorSignals: signals, score: newScore, scoreUpdatedAt: Date.now() });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `${sourceCollection}/${postId}`);
  }
};

// ── Post.media → FeedItem helpers ────────────────────────────────────────────
// The feed used to collapse a post's whole media[] into a single imageUrl, so
// videos rendered inside an <img> (broken → "text only") and multi-image posts
// lost everything but the first shot. These carry the intent through instead.
const mediaFeedType = (media: any): FeedItem['type'] => {
  if (!Array.isArray(media) || media.length === 0) return 'NEWS';
  return media.some((m: any) => m?.type === 'VIDEO') ? 'VIDEO' : 'PICTURE';
};
/** First still-image URL for the legacy imageUrl slot (skip videos — an <img>
 *  pointed at a video URL is exactly the broken thumbnail we're fixing). */
const firstImageUrl = (media: any): string | undefined => {
  if (!Array.isArray(media)) return undefined;
  const img = media.find((m: any) => m?.url && m.type !== 'VIDEO' && m.type !== 'AUDIO');
  return img?.url;
};
/** Firestore rejects `undefined` fields — strip them from each media item before
 *  mirroring into the feed collection. */
const sanitizeMediaForWrite = (media: any): any[] | undefined => {
  if (!Array.isArray(media) || media.length === 0) return undefined;
  return media.map((m: any) => {
    const out: any = {};
    for (const k of ['type', 'url', 'id', 'title', 'thumbnail'] as const) {
      if (m?.[k] !== undefined && m?.[k] !== null) out[k] = m[k];
    }
    if (m?.linkPreview) out.linkPreview = m.linkPreview;
    return out;
  });
};

export const fetchFeed = (callback: (items: FeedItem[]) => void) => {
  const feedPath = 'feed';
  const postsPath = 'posts';

  let feedItems: FeedItem[] = [];
  let postItems: FeedItem[] = [];

  const updateItems = () => {
    // Deduplicate by id
    const seen = new Set<string>();
    const combined = [...feedItems, ...postItems]
      .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return item.timestamp > 0; })
      // Primary sort: score descending; secondary: recency (so unscored legacy posts fall back to time)
      .sort((a, b) => {
        const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
        if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
        return b.timestamp - a.timestamp;
      });
    callback(combined.slice(0, 60));
  };

  // Prefer score-ordered query; fall back to timestamp for legacy docs that have no score field
  const feedQuery = query(collection(db, feedPath), orderBy('score', 'desc'), orderBy('timestamp', 'desc'), limit(60));
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
        type: mediaFeedType(data.media),
        imageUrl: firstImageUrl(data.media),
        media: Array.isArray(data.media) ? data.media : undefined,
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
      type: mediaFeedType(data.media),
      content: data.text || '',
      timestamp: data.timestamp || Date.now(),
      likesCount: data.likesCount || 0,
      commentCount: data.commentsCount || 0,
      shareCount: 0,
      ...(firstImageUrl(data.media) ? { imageUrl: firstImageUrl(data.media) } : {}),
      ...(sanitizeMediaForWrite(data.media) ? { media: sanitizeMediaForWrite(data.media) } : {}),
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
          type: mediaFeedType(data.media),
          imageUrl: firstImageUrl(data.media),
          media: Array.isArray(data.media) ? data.media : undefined,
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

  // 4. Upload Tracks — label by the actual content type, not always "Track"
  const itemNoun = album.subType === 'PODCAST' ? 'Episode'
    : album.type === 'VIDEO' ? 'Video'
    : album.type === 'PHOTO' ? 'Photo'
    : album.type === 'BOOK' ? 'Chapter'
    : 'Track';
  const finalTracks: Track[] = [];
  for (let i = 0; i < album.tracks.length; i++) {
    const track = album.tracks[i];
    const trackProgressBase = 20 + (i / album.tracks.length) * 60;

    if (track.file) {
      onProgress?.(`Transferring ${itemNoun} ${i + 1}/${album.tracks.length}`, Math.round(trackProgressBase));
      const gcsPath = `albums/${album.id}/tracks/${track.id}_${track.file.name}`;
      const url = await uploadFile(gcsPath, track.file);
      finalTracks.push({ ...track, url, file: undefined });
    } else {
      finalTracks.push(track);
    }
  }

  // ── SAFEGUARD: persist a resumable DRAFT the moment the heavy files are uploaded ──
  // The big cost (multi-hundred-MB film/track uploads) is done by here. The steps that
  // follow — Mux uploads, season episodes, AI metadata, the final write — are slower and
  // can fail or be interrupted (tab close, network drop). Write the album doc NOW as a
  // draft so the uploaded video is never orphaned: the creator just reopens the draft and
  // finishes. The final write below upgrades this same doc to its true published state.
  try {
    if (auth.currentUser && finalTracks.some(t => t.url)) {
      const draftDoc = removeUndefined({
        ...album,
        ownerId: auth.currentUser!.uid,
        coverImage: finalCover || album.coverImage || '',
        artistImage: finalArtistImg || finalCover || album.artistImage,
        tracks: finalTracks.map(t => { const { file, ...rest } = t; return { ...rest, rightsOwnerId: auth.currentUser?.uid }; }),
        slideshow: finalSlideshow,
        isDraft: true,
        createdAt: album.createdAt || Date.now(),
        // Strip File-bearing / not-yet-uploaded fields — the final write adds these.
        musicVideos: undefined,
        seasons: undefined,
        coverFile: undefined,
        artistFile: undefined,
        slideshowFiles: undefined,
      });
      await setDoc(doc(db, 'albums', album.id), draftDoc, { merge: true });
      onProgress?.('Draft saved — your upload is safe', Math.round(80));
    }
  } catch (e) {
    console.warn('[publishToCloud] draft safeguard write failed (non-fatal):', e);
  }

  // 5. Upload Music Videos
  const finalVideos: Video[] = [];
  const pendingMuxUploads: Array<{ videoId: string; uploadId: string }> = [];
  if (album.musicVideos && album.musicVideos.length > 0) {
    for (let i = 0; i < album.musicVideos.length; i++) {
      const video = album.musicVideos[i];
      let videoUrl = video.url;
      let thumbUrl = video.thumbnailUrl;

      if (video.file) {
        onProgress?.(`Uploading Video ${i + 1}/${album.musicVideos.length}`, 85);
        // Direct upload to Mux — browser → Mux, skipping Firebase Storage
        const uploadId = await uploadVideoFileMux(video.file);
        pendingMuxUploads.push({ videoId: video.id, uploadId });
        videoUrl = undefined; // playbackId will arrive via pollMuxUploadUntilReady
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

    // Canonical cross-service index record (media-library API Phase 1). Best-effort.
    import('./mediaAssets').then(m => m.upsertMediaAssetFromAlbum(cloudAlbum as any)).catch(() => {});

    // Trigger Cora beat analysis for MUSIC albums (fire-and-forget — never blocks publish)
    if (cloudAlbum.type === 'MUSIC' && cloudAlbum.tracks?.length) {
      (async () => {
        try {
          const token = await auth.currentUser!.getIdToken();
          const appUrl = (import.meta as any).env?.VITE_APP_URL ?? window.location.origin;
          await fetch(`${appUrl}/api/cora/analyze-album`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              albumId: album.id,
              ownerId: auth.currentUser!.uid,
              genre:   cloudAlbum.genre,
              tracks:  cloudAlbum.tracks.map((t: any) => ({
                id:       t.id,
                title:    t.title,
                artist:   t.artist,
                genre:    t.genre,
                duration: t.duration,
                lyrics:   t.lyrics,
              })),
            }),
          });
        } catch { /* analysis failure must never surface to the user */ }
      })();
    }

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
            // Reliable Taleo marker so a movie shows in Taleo regardless of its genre
            // (Taleo's genre-only filter missed movies tagged with a content genre).
            subType: 'MOVIE',
            // This whole block only runs when the creator opted into publishVideosToGallery
            // ("Also send to Reello"), so flag it so it ALSO appears in the Reello feed.
            isRello: true,
            timestamp: Date.now()
          } as any);
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
            isRello: true, // opted into the gallery/Reello via publishVideosToGallery
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
                subType: 'TV_SERIES',
                isRello: true, // opted into the gallery/Reello via publishVideosToGallery
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

      // Poll for playback IDs from direct Mux uploads (music videos uploaded via uploadVideoFileMux)
      for (const { videoId, uploadId } of pendingMuxUploads) {
        const docId = `sys_${cloudAlbum.id}_${videoId}`;
        pollMuxUploadUntilReady(uploadId, async (playbackId, assetId) => {
          try {
            await updateDoc(doc(db, videosCollectionPath, docId), { muxPlaybackId: playbackId, muxAssetId: assetId });
          } catch {}
        }, 60, 4000);
      }

      // Kick off Mux transcoding in background for URL-based videos (no direct upload)
      for (const v of videosToPublish) {
        const srcUrl = v.url ?? '';
        if (
          srcUrl &&
          !v.muxPlaybackId &&
          !srcUrl.includes('youtube.com') &&
          !srcUrl.includes('youtu.be') &&
          !srcUrl.includes('vimeo.com')
        ) {
          const videoId = v.id;
          (async () => {
            try {
              const muxData = await createMuxAssetFromUrl(srcUrl);
              await updateDoc(doc(db, videosCollectionPath, videoId), {
                ...(muxData.assetId   ? { muxAssetId: muxData.assetId }     : {}),
                ...(muxData.playbackId ? { muxPlaybackId: muxData.playbackId } : {}),
                muxUploadId: null,
              });
            } catch (err) {
              console.error('[Mux] Background transcoding failed for video', videoId, err);
            }
          })();
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

export const updateAccountType = async (type: AccountType) => {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}`;
  try {
    // Single source of truth: persist the enum AND the derived legacy booleans in
    // one write so accountType and isArtist/isBrandAdmin/… never drift (the old
    // version wrote only the enum, so Firestore's flags went stale forever).
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      accountType: type,
      ...accountFlagUpdate(type),
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

export const fetchWorldContentByWorldId = async (worldId: string): Promise<{ albums: Album[]; videos: Video[] }> => {
  try {
    const [albumSnap, videoSnap] = await Promise.all([
      getDocs(query(collection(db, 'albums'), where('worldId', '==', worldId), limit(20))),
      getDocs(query(collection(db, 'videos'), where('worldId', '==', worldId), where('isPrivate', '==', false), limit(20))),
    ]);
    return {
      albums: albumSnap.docs.map(d => ({ id: d.id, ...d.data() } as Album)),
      videos: videoSnap.docs.map(d => ({ id: d.id, ...d.data() } as Video)),
    };
  } catch {
    return { albums: [], videos: [] };
  }
};

export const fetchAlbumById = async (albumId: string): Promise<Album | null> => {
  try {
    const snap = await getDoc(doc(db, 'albums', albumId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Album) : null;
  } catch { return null; }
};

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

export const fetchPublicBooks = async (): Promise<Album[]> => {
  const path = 'albums';
  try {
    const q = query(
      collection(db, path),
      where('isPrivate', '==', false),
      where('type', '==', 'BOOK')
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Album))
      .filter(a => !a.isDraft && !a.isPrivate)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchUpcomingAlbums = async (): Promise<Album[]> => {
  const path = 'albums';
  try {
    const now = Date.now();
    const q = query(collection(db, path), where('isPrivate', '==', false), where('isScheduled', '==', true));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as Album))
      .filter(a => !a.isDraft && !!a.releaseDate && a.releaseDate > now && !!a.coverImage)
      .sort((a, b) => (a.releaseDate || 0) - (b.releaseDate || 0));
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
  // IMPORTANT: an equality filter (where) combined with orderBy on a *different*
  // field requires a composite index. We don't ship one for the per-item
  // `comments` subcollection, so that query would fail `failed-precondition`,
  // the snapshot would never deliver, and a just-posted comment would vanish.
  // Equality-only queries use the auto single-field index — so we filter on the
  // server and sort newest-first on the client. No composite index needed.
  if (videoId) {
    q = query(
      collection(db, parentCollection, parentId, "comments"),
      where("videoId", "==", videoId)
    );
  } else if (trackId || parentCollection === 'albums') {
    q = query(
      collection(db, parentCollection, parentId, "comments"),
      where("trackId", "==", trackId || "album")
    );
  } else {
    // For posts and feed, we just get all comments on the item (orderBy alone is
    // covered by the auto single-field index).
    q = query(
      collection(db, parentCollection, parentId, "comments"),
      orderBy("timestamp", "desc")
    );
  }
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Comment));
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // newest-first
    callback(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
};

export const postComment = async (parentId: string, comment: Omit<Comment, 'id'>, parentCollection: string = 'albums') => {
  const path = `${parentCollection}/${parentId}/comments`;
  try {
    const commentWithUid: Record<string, any> = {
      ...comment,
      uid: auth.currentUser?.uid || null,
      parentId: comment.parentId || null
    };
    // Firestore is initialized without `ignoreUndefinedProperties`, so writing an
    // `undefined` value (e.g. videoId on a track comment, or trackId on a video
    // comment) THROWS "Unsupported field value: undefined" — the comment never
    // persists and appears to "vanish" after posting. Strip undefined fields so
    // the write always succeeds and satisfies isValidComment (which also forbids
    // a `videoId`/`trackId` key that isn't a string).
    Object.keys(commentWithUid).forEach(k => { if (commentWithUid[k] === undefined) delete commentWithUid[k]; });
    await addDoc(collection(db, parentCollection, parentId, "comments"), commentWithUid);
    
    // Notify parent owner (content owner gets COMMENT notification)
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

    // Notify the author of the parent comment when this is a reply
    if (comment.parentId && auth.currentUser) {
      try {
        const parentCommentSnap = await getDoc(doc(db, parentCollection, parentId, 'comments', comment.parentId));
        if (parentCommentSnap.exists()) {
          const parentComment = parentCommentSnap.data();
          const replyTargetUid = parentComment.uid;
          if (replyTargetUid && replyTargetUid !== auth.currentUser.uid) {
            createNotification({
              userId: replyTargetUid,
              senderId: auth.currentUser.uid,
              senderName: auth.currentUser.displayName || 'Anonymous',
              senderPhoto: auth.currentUser.photoURL || '',
              type: 'COMMENT',
              title: 'New Reply',
              message: `${auth.currentUser.displayName} replied to your comment`,
              link: parentCollection === 'articles' ? 'READ' : 'ALBUM',
              targetId: parentId
            });
          }
        }
      } catch {}
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

export const loginWithGoogle = async (loginHint?: string): Promise<User | null> => {
  // Native (Capacitor) apps run inside a WebView, where Google refuses web-OAuth
  // popups (disallowed_useragent — "this browser or app may not be secure"). Use
  // the native Google Sign-In plugin to obtain a credential, then sign THAT into
  // the JS SDK so the rest of the app (which reads auth.currentUser) is unchanged.
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const res = await FirebaseAuthentication.signInWithGoogle();
      const idToken = res.credential?.idToken;
      if (!idToken) throw new Error('No idToken returned from native Google sign-in');
      const credential = GoogleAuthProvider.credential(idToken, (res.credential as any)?.accessToken);
      const result = await signInWithCredential(auth, credential);
      if (result.user) {
        try { await result.user.getIdToken(true); } catch { /* non-fatal */ }
        await syncUserProfile(result.user);
        return result.user;
      }
    } catch (error: any) {
      if (error?.code === 'auth/cancelled' || /cancel/i.test(error?.message || '')) return null;
      console.error('Native Google login failed:', error);
      void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'google-native', error, email: loginHint }));
      alert(`Google sign-in failed: ${error?.message || 'Unknown error'}. Please try again.`);
    }
    return null;
  }

  const provider = new GoogleAuthProvider();
  // Always force the account chooser (so a hot-switch never silently reuses the
  // currently-remembered Google session), and pre-select the target account when
  // switching to a known slot — this keeps each account siloed to the right user.
  provider.setCustomParameters(loginHint
    ? { prompt: 'select_account', login_hint: loginHint }
    : { prompt: 'select_account' });
  try {
    const result = await signInWithPopup(auth, provider);
    if (result.user) {
      // Mint a fresh token for the newly-active account immediately, so the very
      // next Storage/Firestore call is credentialed for THIS user, not the last one.
      try { await result.user.getIdToken(true); } catch { /* non-fatal */ }
      await syncUserProfile(result.user);
      return result.user;
    }
  } catch (error: any) {
    console.error("Google login failed:", error);
    void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'google', error, email: loginHint }));
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
  return null;
};

export const loginWithTwitter = async (): Promise<string | null> => {
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const res = await FirebaseAuthentication.signInWithTwitter();
      const credential = TwitterAuthProvider.credential(
        res.credential?.accessToken as string,
        (res.credential as any)?.secret as string,
      );
      const result = await signInWithCredential(auth, credential);
      if (result.user) {
        await syncUserProfile(result.user);
        const screenName = (res as any)?.additionalUserInfo?.username as string | undefined;
        if (screenName) {
          await updateDoc(doc(db, 'users', result.user.uid), { xHandle: screenName });
          return screenName;
        }
      }
      return null;
    } catch (error: any) {
      if (!/cancel/i.test(error?.message || '')) {
        console.error('Native Twitter login failed:', error);
        void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'twitter-native', error }));
        alert(`Twitter sign-in failed: ${error?.message || 'Unknown error'}.`);
      }
      return null;
    }
  }

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
    void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'twitter', error }));
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

export const loginWithFacebook = async () => {
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const res = await FirebaseAuthentication.signInWithFacebook();
      const credential = FacebookAuthProvider.credential(res.credential?.accessToken as string);
      const result = await signInWithCredential(auth, credential);
      if (result.user) await syncUserProfile(result.user);
    } catch (error: any) {
      if (!/cancel/i.test(error?.message || '')) {
        console.error('Native Facebook login failed:', error);
        void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'facebook-native', error }));
        alert(`Facebook sign-in failed: ${error?.message || 'Unknown error'}.`);
      }
    }
    return;
  }

  const provider = new FacebookAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    if (result.user) await syncUserProfile(result.user);
  } catch (error: any) {
    const code = error?.code || '';
    void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'facebook', error }));
    if (code === 'auth/account-exists-with-different-credential') {
      alert('An account already exists with this email. Sign in with your original method, then link Facebook from Account Settings.');
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      alert(`Facebook sign-in failed: ${error.message || 'Unknown error'}`);
    }
  }
};

export const loginWithMicrosoft = async () => {
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const res = await FirebaseAuthentication.signInWithMicrosoft();
      const oauth = new OAuthProvider('microsoft.com');
      const credential = oauth.credential({
        idToken: res.credential?.idToken,
        accessToken: res.credential?.accessToken,
      });
      const result = await signInWithCredential(auth, credential);
      if (result.user) await syncUserProfile(result.user);
    } catch (error: any) {
      if (!/cancel/i.test(error?.message || '')) {
        console.error('Native Microsoft login failed:', error);
        void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'microsoft-native', error }));
        alert(`Microsoft sign-in failed: ${error?.message || 'Unknown error'}.`);
      }
    }
    return;
  }

  const provider = new OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(auth, provider);
    if (result.user) await syncUserProfile(result.user);
  } catch (error: any) {
    const code = error?.code || '';
    void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'microsoft', error }));
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      alert(`Microsoft sign-in failed: ${error.message || 'Unknown error'}`);
    }
  }
};

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (result.user) await syncUserProfile(result.user);
    return result.user;
  } catch (error: any) {
    const code = error?.code || '';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      throw new Error('Invalid email or password.');
    }
    // Everything past this point is a system/config/network problem (not a user typo) — worth alerting on.
    void import('./errorReporting').then(m => m.reportLoginIssue({ provider: 'email', error, email }));
    if (code === 'auth/too-many-requests') {
      throw new Error('Too many attempts. Please try again later.');
    }
    throw new Error(error.message || 'Sign-in failed.');
  }
};

export const registerWithEmail = async (email: string, password: string, displayName: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    await syncUserProfile(result.user);
    return result.user;
  } catch (error: any) {
    const code = error?.code || '';
    if (code === 'auth/email-already-in-use') {
      throw new Error('This email is already registered. Try signing in instead.');
    } else if (code === 'auth/weak-password') {
      throw new Error('Password must be at least 6 characters.');
    }
    throw new Error(error.message || 'Registration failed.');
  }
};

export const sendPasswordReset = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
};

export const linkAuthProvider = async (providerName: 'GOOGLE' | 'TWITTER' | 'FACEBOOK' | 'MICROSOFT') => {
  if (!auth.currentUser) throw new Error('Not signed in');
  let provider;
  if (providerName === 'GOOGLE') provider = new GoogleAuthProvider();
  else if (providerName === 'TWITTER') provider = new TwitterAuthProvider();
  else if (providerName === 'FACEBOOK') provider = new FacebookAuthProvider();
  else provider = new OAuthProvider('microsoft.com');
  try {
    await linkWithPopup(auth.currentUser, provider);
  } catch (error: any) {
    const code = error?.code || '';
    if (code === 'auth/credential-already-in-use') {
      throw new Error('This account is already linked to a different Plajah user.');
    } else if (code === 'auth/provider-already-linked') {
      throw new Error('This provider is already linked to your account.');
    }
    throw error;
  }
};

export const logout = async () => {
  try {
    // Detach this device's push token from the user first, so after sign-out they
    // stop receiving pushes on a device that may now be used by someone else.
    const uid = auth.currentUser?.uid;
    if (uid && _thisDeviceToken) {
      await updateDoc(doc(db, 'users', uid), {
        fcmTokens: arrayRemove(_thisDeviceToken),
        fcmToken: null,
      }).catch(() => {});
    }
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
  }
};

export const onAuthUpdate = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      await syncUserProfile(user);
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
      ownerId: auth.currentUser!.uid,
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
    return await addDoc(collection(db, path), feedData);
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

// --- Stream Archives (rewatch / VOD after live ends) ---

export const saveStreamArchive = async (archive: Omit<StreamArchive, 'id'>): Promise<string | null> => {
  try {
    const ref = await addDoc(collection(db, 'stream_archives'), {
      ...archive,
      endedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'stream_archives');
    return null;
  }
};

export const fetchStreamArchives = async (limitCount = 24): Promise<StreamArchive[]> => {
  try {
    const q = query(collection(db, 'stream_archives'), orderBy('endedAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data(), endedAt: safeToMillis(d.data().endedAt), startedAt: d.data().startedAt || 0 } as StreamArchive));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'stream_archives');
    return [];
  }
};

export const fetchUserStreamArchives = async (userId: string): Promise<StreamArchive[]> => {
  try {
    const q = query(collection(db, 'stream_archives'), where('ownerId', '==', userId), orderBy('endedAt', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data(), endedAt: safeToMillis(d.data().endedAt), startedAt: d.data().startedAt || 0 } as StreamArchive));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'stream_archives');
    return [];
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

// --- Subscription bell (per-follow notify level) ---
// A follow with no notifyLevel behaves as 'ALL' so existing subscriptions keep working.

/** Set how loudly a followed creator may notify the caller. No-op if not following. */
export const setNotifyLevel = async (targetUserId: string, level: NotifyLevel): Promise<void> => {
  if (!auth.currentUser) return;
  const path = 'follows';
  const followId = `${auth.currentUser.uid}_${targetUserId}`;
  try {
    await setDoc(doc(db, path, followId), { notifyLevel: level }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

/** Read the caller's bell setting for a creator. Defaults to 'ALL'. */
export const getNotifyLevel = async (targetUserId: string): Promise<NotifyLevel> => {
  if (!auth.currentUser) return 'NONE';
  const followId = `${auth.currentUser.uid}_${targetUserId}`;
  try {
    const d = await getDoc(doc(db, 'follows', followId));
    if (!d.exists()) return 'NONE';
    return ((d.data() as any)?.notifyLevel as NotifyLevel) || 'ALL';
  } catch {
    return 'ALL';
  }
};

/**
 * Followers of `userId` paired with their bell level (missing === 'ALL').
 * Used by notifyFollowers to honour the bell without a second read per follower.
 */
export const fetchFollowersWithNotifyLevel = async (
  userId: string,
): Promise<{ followerId: string; notifyLevel: NotifyLevel }[]> => {
  const path = 'follows';
  try {
    const snapshot = await getDocs(query(collection(db, path), where('followingId', '==', userId)));
    return snapshot.docs.map(d => {
      const data = d.data() as any;
      return { followerId: data.followerId as string, notifyLevel: (data.notifyLevel as NotifyLevel) || 'ALL' };
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

// --- PUSH NOTIFICATIONS ---
// The FCM token for THIS device (web or native), remembered so sign-out can detach it
// from the user — otherwise a signed-out user keeps getting pushes on a shared device.
let _thisDeviceToken: string | null = null;

export const saveFcmToken = async (uid: string, token: string): Promise<void> => {
  _thisDeviceToken = token;
  try {
    await updateDoc(doc(db, 'users', uid), {
      fcmToken: token,               // legacy single-token field (kept for backward compat)
      fcmTokens: arrayUnion(token),  // multi-device set — web + every native install a user has
    });
  } catch {
    // Non-critical
  }
};

// Maps each notification type to a user-facing preference category + Android channel id.
const PUSH_CATEGORY: Record<string, 'messages' | 'social' | 'content' | 'system'> = {
  MESSAGE: 'messages',
  COMMENT: 'social', LIKE: 'social', FOLLOW: 'social',
  CONTENT: 'content',
  SYSTEM: 'system',
};

interface PushMeta {
  link?: string; type?: string; targetId?: string;
  senderId?: string; senderName?: string; senderPhoto?: string;
}

const sendPushToUser = async (uid: string, title: string, body: string, meta: PushMeta = {}): Promise<void> => {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const data = userSnap.data() || {};

    // Respect the recipient's notification preferences (master switch + per-category).
    const prefs = (data.notificationPrefs || {}) as Record<string, boolean>;
    if (prefs.push === false) return;
    const category = PUSH_CATEGORY[meta.type || 'SYSTEM'] || 'system';
    if (prefs[category] === false) return;

    // Fan out to every registered device: web FCM token + all native device tokens, de-duped.
    const tokens = Array.from(new Set<string>(
      [...((data.fcmTokens as string[]) || []), data.fcmToken as string].filter(Boolean)
    ));
    if (!tokens.length) return;

    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens, title, body,
        link: meta.link,
        channelId: category,
        // Forwarded in the FCM data payload so a native tap can deep-link exactly
        // like an in-app tap (handleNotificationNavigate reads link + targetId + type).
        targetId: meta.targetId, type: meta.type,
        senderId: meta.senderId, senderName: meta.senderName, senderPhoto: meta.senderPhoto,
      }),
    });

    // Prune any tokens FCM reports as permanently unregistered (app uninstalled /
    // token rotated) so we stop fanning out to dead devices. Results are index-aligned
    // with `tokens` because we send `tokens` only (no extra single `token`).
    const json = await res.json().catch(() => null) as { results?: Array<{ ok: boolean; stale?: boolean }> } | null;
    if (json?.results?.length === tokens.length) {
      const stale = tokens.filter((_, i) => json.results![i]?.stale);
      if (stale.length) {
        await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(...stale) }).catch(() => {});
      }
    }
  } catch {
    // Non-critical — push failures must never break the main flow
  }
};

/** Removes a device token on sign-out so a shared device stops receiving the prior user's pushes. */
export const removeFcmToken = async (uid: string, token: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
  } catch {
    // Non-critical
  }
};

/** Reads a user's saved notification preferences (empty object = all defaults / enabled). */
export const getNotificationPrefs = async (uid: string): Promise<Record<string, boolean>> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return (snap.data()?.notificationPrefs || {}) as Record<string, boolean>;
  } catch {
    return {};
  }
};

/**
 * Sends a test push to the signed-in user's own devices (every registered token).
 * Bypasses preference gating so a test always fires. Returns how many were accepted
 * by FCM and how many devices are registered — sent:0/total:0 means no device has
 * registered a token yet (install the app + allow notifications on that device first).
 */
export const sendTestPush = async (): Promise<{ sent: number; total: number }> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return { sent: 0, total: 0 };
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.data() || {};
    const tokens = Array.from(new Set<string>(
      [...((data.fcmTokens as string[]) || []), data.fcmToken as string].filter(Boolean)
    ));
    if (!tokens.length) return { sent: 0, total: 0 };
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens,
        title: 'Plajah',
        body: '🔔 Test notification — your push notifications are working!',
        link: 'FEED',
        channelId: 'system',
        type: 'SYSTEM',
        senderName: 'Plajah',
      }),
    });
    const json = await res.json().catch(() => null) as { sent?: number } | null;
    return { sent: json?.sent ?? 0, total: tokens.length };
  } catch {
    return { sent: 0, total: 0 };
  }
};

/**
 * Admin: broadcast a push to a single user (mode:'user' + uid) or to ALL users
 * (mode:'all'). Server verifies the caller's Firebase ID token + admin role before
 * fanning out. Returns delivery counts, or { error } on failure.
 */
export const sendAdminBroadcast = async (
  payload: { mode: 'user' | 'all'; uid?: string; title: string; body: string; link?: string }
): Promise<{ sent: number; total: number; recipients: number; devices: number } | { error: string }> => {
  if (!auth.currentUser) return { error: 'Not signed in' };
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch('/api/push/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { error: json?.error || `Request failed (HTTP ${res.status})` };
    return json;
  } catch (e: any) {
    return { error: e?.message || 'Request failed' };
  }
};

/** Persists a user's notification preferences (master + per-category push toggles). */
export const updateNotificationPrefs = async (uid: string, prefs: Record<string, boolean>): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), { notificationPrefs: prefs });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
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
    // Fire push in background — never await, never block the main flow. Pass the full
    // meta so native taps deep-link and per-category preferences are honored.
    sendPushToUser(notif.userId, notif.title, notif.message, {
      link: notif.link, type: notif.type, targetId: notif.targetId,
      senderId: notif.senderId, senderName: notif.senderName, senderPhoto: notif.senderPhoto,
    }).catch(() => {});
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

/** Sends the one-time welcome package as a SYSTEM message to the user's private system inbox room. */
export const sendSystemWelcomeDM = async (uid: string, displayName: string): Promise<void> => {
  const roomId = `system_inbox_${uid}`;
  try {
    // Upsert the system inbox room
    await setDoc(doc(db, 'chat_rooms', roomId), {
      id: roomId,
      type: 'SYSTEM_INBOX',
      name: 'Plajah',
      participants: [uid],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });

    const body = `Hey ${displayName?.split(' ')[0] || 'there'} 👋 Welcome to Plajah — and congratulations on your Pioneer Badge! 🏅

You're part of our earliest wave of creators and fans, and that means a lot to us.

Here's your starter pack:

🧭 Explore — Music, films, books, live talks, games. Every corner is built for discovery.
📤 Upload — Share your music, videos, and art. Your profile is your stage.
💬 Engage — Comment, react, and connect with creators who share your passion.
🐛 Report Issues — Use the Help Center to flag bugs or send feedback. Your voice shapes Plajah.

🎉 Stop by The Plajah Club — our community space for early members — to meet the team and fellow creators.

As an early access member, you may run into a bump or two. We truly appreciate your patience. Every piece of feedback helps us build something better.

Plajah exists to be the best place in the world for creators to share their work. We're building that together.

— The Plajah Team ❤️`;

    await addDoc(collection(db, 'chat_rooms', roomId, 'messages'), {
      senderId: 'plajah_system',
      senderName: 'Plajah',
      senderPhoto: 'https://plajah.com/icons/icon-192.png',
      text: body,
      type: 'SYSTEM',
      timestamp: Date.now(),
    });
  } catch (e) {
    console.warn('[Welcome DM]', e);
  }
};

export const notifyFollowers = async (
  senderId: string,
  type: AppNotification['type'],
  title: string,
  message: string,
  link?: string,
  targetId?: string,
  /** Mark this as a "highlight" (new upload / going live) so HIGHLIGHTS-bell followers get it. */
  opts?: { highlight?: boolean },
) => {
  try {
    const withLevels = await fetchFollowersWithNotifyLevel(senderId);
    const senderProfile = await fetchUserProfile(senderId);
    // Bell semantics: NONE never; HIGHLIGHTS only for highlight-flagged events; ALL always.
    const followers = withLevels
      .filter(f => f.notifyLevel !== 'NONE' && (f.notifyLevel !== 'HIGHLIGHTS' || !!opts?.highlight))
      .map(f => f.followerId);
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
      ownerId: auth.currentUser!.uid,
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

export const uploadWorldPhoto = async (
  file: File,
  worldId: string,
  opts: { title?: string; description?: string; addToLibrary?: boolean }
): Promise<Photo | undefined> => {
  if (!auth.currentUser) return;
  const id = `photo_${Date.now()}`;
  try {
    // Store under worlds/{worldId}/images in Firebase Storage so assets are world-scoped
    const storagePath = `worlds/${worldId}/images/${id}`;
    const url = await uploadFile(storagePath, file);
    const newPhoto: Photo = {
      id,
      url,
      ownerId: auth.currentUser!.uid,
      timestamp: Date.now(),
      isPublic: false,
      isGalleryEligible: false,
      mediaType: file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO',
      title: opts.title || file.name,
      description: opts.description || '',
      likesCount: 0,
      favorites: [],
      worldId,
      addedToLibrary: opts.addToLibrary ?? false,
    };
    await setDoc(doc(db, 'photos', id), newPhoto);
    return newPhoto;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `photos/${id}`);
  }
};

export const fetchWorldPhotos = async (worldId: string): Promise<Photo[]> => {
  try {
    const q = query(
      collection(db, 'photos'),
      where('worldId', '==', worldId),
      orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Photo);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'photos');
    return [];
  }
};

export const fetchUserWorldPhotos = async (uid: string): Promise<Photo[]> => {
  try {
    const q = query(collection(db, 'photos'), where('ownerId', '==', uid), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Photo).filter(p => !!p.worldId);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'photos');
    return [];
  }
};

export const createPhotoAlbum = async (album: Partial<PhotoAlbum>) => {
  if (!auth.currentUser) return;
  const id = `album_${Date.now()}`;
  const path = `photo_albums/${id}`;
  const newAlbum: PhotoAlbum = {
    id,
    ownerId: auth.currentUser!.uid,
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
    // Fall back to the doc id when the stored payload doesn't carry one — otherwise the
    // Content Manager would key photo assets on `undefined` and edits would target nothing.
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Photo) }));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

/** Edit a photo's own fields (title / description / visibility) from the Content Manager. */
export const updatePhoto = async (photoId: string, updates: Partial<Photo>) => {
  const path = `photos/${photoId}`;
  try {
    await updateDoc(doc(db, 'photos', photoId), removeUndefined(updates));
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
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
    ownerId: auth.currentUser!.uid,
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

export const subscribeToUserProfile = (
  uid: string,
  callback: (profile: UserProfile | null) => void
): (() => void) => {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      callback(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null);
    },
    () => callback(null)
  );
};

export const listenToUserProfile = (uid: string, callback: (profile: UserProfile | null) => void): (() => void) => {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    callback(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null);
  });
};

export const fetchUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const d = await getDoc(doc(db, 'users', uid));
  if (d.exists()) {
    const data = d.data();
    // Self-heal a profile clobbered by the old full-replace bug: if it's missing
    // the fields isValidUserProfile requires, owner updates silently fail and
    // "nothing persists." Re-sync (only for the signed-in owner) to backfill them.
    if (auth.currentUser?.uid === uid &&
        (!data.uid || !data.displayName || data.photoURL === undefined || data.email === undefined)) {
      await syncUserProfile(auth.currentUser).catch(() => {});
      const dh = await getDoc(doc(db, 'users', uid));
      if (dh.exists()) return { uid: dh.id, ...dh.data() } as UserProfile;
    }
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

// ── Display-name propagation ────────────────────────────────────────────────
// A user's display name is denormalized (copied) into many documents at creation
// time — a post stores `authorName`, a comment stores `userName`, a room stores
// `hostName`, etc. Changing `users/{uid}.displayName` alone leaves every old copy
// stale, so the new name never "reads everywhere". `propagateDisplayName` re-syncs
// those copies across the user's own content.
//
// DELIBERATELY EXCLUDED — these are INDEPENDENT identities, not the account name,
// and must never be overwritten by a display-name change:
//   • Artist / persona names: albums.artist, personal_albums.artist,
//     personal_tracks.artist, videos.artist, tracks[].artist. A user releases under
//     independent artist names / Worlds characters (see Album.artistCharacterId).
//   • Anonymous / alias flows: discussionPosts, discussionComments, sanctuary* —
//     the stored name may be a chosen alias, not the account name.
//   • Org / business / church entity names: notifications.senderName (often an org
//     or the literal 'Plajah'), brand_accounts, organizations, businessPages, etc.
//
// Firestore rules only let a user (or an admin, where the rule allows) write their
// own docs, so every target is queried strictly by its owner-uid field. Each target
// is committed independently and guarded — a permission failure on one collection is
// reported and never aborts the rest.
type DisplayNameSyncTarget = {
  collection: string;
  uidField: string;
  nameFields: string[];
  /** Skip an individual doc when this returns true (e.g. authored as an org / anonymously). */
  skip?: (data: any) => boolean;
};

const DISPLAY_NAME_SYNC_TARGETS: DisplayNameSyncTarget[] = [
  { collection: 'posts',              uidField: 'authorId',   nameFields: ['authorName'], skip: d => !!d.authorOrgId },
  { collection: 'feed',               uidField: 'authorId',   nameFields: ['authorName'], skip: d => !!d.authorOrgId },
  { collection: 'articles',           uidField: 'authorId',   nameFields: ['authorName'] },
  { collection: 'video_playlists',    uidField: 'ownerId',    nameFields: ['ownerName'] },
  { collection: 'communityPlaylists', uidField: 'ownerId',    nameFields: ['authorName'] },
  { collection: 'clubPosts',          uidField: 'authorId',   nameFields: ['authorName'] },
  { collection: 'clubGallery',        uidField: 'uploaderId', nameFields: ['uploaderName'] },
  { collection: 'clubChat',           uidField: 'senderId',   nameFields: ['senderName'] },
  { collection: 'clubMemberships',    uidField: 'userId',     nameFields: ['displayName'] },
  { collection: 'orgMemberships',     uidField: 'userId',     nameFields: ['displayName'] },
  { collection: 'liveTalks',          uidField: 'hostId',     nameFields: ['hostName'] },
  { collection: 'parties',            uidField: 'hostId',     nameFields: ['hostName'] },
  { collection: 'rooms',              uidField: 'hostId',     nameFields: ['hostName'] },
  { collection: 'live_feeds',         uidField: 'ownerId',    nameFields: ['ownerName'] },
  { collection: 'ppv_events',         uidField: 'ownerId',    nameFields: ['ownerName'] },
  { collection: 'classrooms',         uidField: 'ownerId',    nameFields: ['ownerName'] },
  { collection: 'churchPrayers',      uidField: 'authorId',   nameFields: ['authorName'], skip: d => d.isAnonymous === true },
];

export interface DisplayNameSyncResult {
  /** collection name → number of docs updated */
  updated: Record<string, number>;
  /** total docs updated across all collections */
  total: number;
  /** collections that could not be fully synced (permission / query error), with reason */
  skipped: string[];
}

/**
 * Re-sync a user's ACCOUNT display name across every denormalized copy on their own
 * content, and update the canonical `users/{uid}` doc (+ Firebase Auth profile when the
 * signed-in user is renaming themselves). Artist/persona, alias and org names are left
 * untouched by design (see the block comment above). Safe to run repeatedly — it only
 * writes docs whose stored name actually differs from the new one.
 */
export const propagateDisplayName = async (
  uid: string,
  newName: string,
): Promise<DisplayNameSyncResult> => {
  const result: DisplayNameSyncResult = { updated: {}, total: 0, skipped: [] };
  const name = (newName || '').trim();
  if (!uid || !name) return result;

  // 1) Canonical source of truth.
  try {
    await updateDoc(doc(db, 'users', uid), { displayName: name });
  } catch (e) {
    result.skipped.push(`users/${uid}: ${(e as any)?.message || e}`);
  }

  // 2) Firebase Auth profile — only mutable for the currently signed-in user.
  if (auth.currentUser && auth.currentUser.uid === uid) {
    try { await updateProfile(auth.currentUser, { displayName: name }); } catch { /* non-fatal */ }
  }

  // 3) Fan out to denormalized copies, one collection at a time (independently guarded).
  for (const target of DISPLAY_NAME_SYNC_TARGETS) {
    try {
      const snap = await getDocs(query(collection(db, target.collection), where(target.uidField, '==', uid)));
      let batch = writeBatch(db);
      let ops = 0, updatedHere = 0;
      for (const d of snap.docs) {
        const data = d.data() as any;
        if (target.skip?.(data)) continue;
        const changes: Record<string, string> = {};
        for (const f of target.nameFields) {
          if (data[f] !== undefined && data[f] !== name) changes[f] = name;
        }
        if (Object.keys(changes).length === 0) continue;
        batch.update(d.ref, changes);
        ops++; updatedHere++;
        if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
      }
      if (ops > 0) await batch.commit();
      if (updatedHere > 0) { result.updated[target.collection] = updatedHere; result.total += updatedHere; }
    } catch (e) {
      result.skipped.push(`${target.collection}: ${(e as any)?.message || e}`);
    }
  }

  return result;
};

/**
 * Server-side display-name resync (the Admin-SDK path). Covers what the client can't:
 * comment subcollections (collection-group scan) and — for admins — ANY user's content.
 * A normal user may call it for their OWN uid; the server rejects other targets unless admin.
 * Returns the total docs updated, or ok:false with a reason (endpoint 403/unavailable is non-fatal).
 */
export const serverResyncDisplayName = async (
  uid: string,
  newName: string,
): Promise<{ ok: boolean; total: number; error?: string }> => {
  try {
    const u = auth.currentUser;
    if (!u) return { ok: false, total: 0, error: 'not signed in' };
    const token = await u.getIdToken();
    const res = await fetch('/api/admin/resync-display-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uid, newName }),
    });
    if (!res.ok) return { ok: false, total: 0, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, total: Number(data.total) || 0 };
  } catch (e: any) {
    return { ok: false, total: 0, error: e?.message || String(e) };
  }
};

// ── Family / managed CHILD accounts ─────────────────────────────────────────
// Child accounts are Firestore-only profiles (no separate Firebase Auth login) owned by
// a guardian. Safe-by-default controls are applied at creation. The guardian switches
// into a child's "kids mode" in-session (the active-profile overlay in App.tsx).

/** Create a managed child profile under `guardianUid`. Returns the new profile. */
export const createChildProfile = async (
  guardianUid: string,
  data: { displayName: string; birthYear?: number; photoURL?: string }
): Promise<UserProfile | null> => {
  try {
    const childUid = `child_${guardianUid.slice(0, 6)}_${Math.random().toString(36).slice(2, 9)}`;
    const profile: UserProfile = {
      uid: childUid,
      displayName: data.displayName || 'Kid',
      photoURL: data.photoURL || '',
      email: '',
      isChild: true,
      accountType: 'CHILD',
      guardianUid,
      birthYear: data.birthYear,
      role: 'user',
      tier: 'FREE',
      followerCount: 0,
      followingCount: 0,
      createdAt: Date.now(),
      storageUsage: { total: 0, audio: 0, video: 0, photos: 0 },
      parentalControls: { adultFilter: true, maxMaturity: 'PG', hideAdultPosts: true, kidsMode: true },
    } as UserProfile;
    await setDoc(doc(db, 'users', childUid), profile);
    await updateDoc(doc(db, 'users', guardianUid), { childUids: arrayUnion(childUid) });
    return profile;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users (child of ${guardianUid})`);
    return null;
  }
};

/** All child profiles managed by this guardian. */
export const listChildProfiles = async (guardianUid: string): Promise<UserProfile[]> => {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('guardianUid', '==', guardianUid)));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }) as UserProfile);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'users (children)');
    return [];
  }
};

/** Remove a managed child profile + unlink it from the guardian. */
export const deleteChildProfile = async (guardianUid: string, childUid: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'users', childUid));
    await updateDoc(doc(db, 'users', guardianUid), { childUids: arrayRemove(childUid) });
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `users/${childUid}`);
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
  try {
    const q = query(collection(db, 'follows'), where("followerId", "==", uid), limit(100));
    const snapshot = await getDocs(q);
    const followingIds = snapshot.docs.map(d => d.data().followingId);
    if (followingIds.length === 0) return [];
    const results = await Promise.all(followingIds.map(id => fetchUserProfile(id).catch(() => null)));
    return results.filter((p): p is UserProfile => p !== null);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'follows');
    return [];
  }
};

export const fetchFriends = async (uid: string): Promise<UserProfile[]> => {
  try {
    const [followingSnap, followersSnap] = await Promise.all([
      getDocs(query(collection(db, 'follows'), where("followerId", "==", uid), limit(200))),
      getDocs(query(collection(db, 'follows'), where("followingId", "==", uid), limit(200))),
    ]);
    const followingIds = new Set(followingSnap.docs.map(d => d.data().followingId));
    const friendIds = followersSnap.docs.map(d => d.data().followerId).filter(id => followingIds.has(id));
    if (friendIds.length === 0) return [];
    const results = await Promise.all(friendIds.slice(0, 50).map(id => fetchUserProfile(id).catch(() => null)));
    return results.filter((p): p is UserProfile => p !== null);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'follows');
    return [];
  }
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

export const subscribeToPodcast = async (podcastId: string): Promise<void> => {
  if (!auth.currentUser) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  try {
    await updateDoc(userRef, { subscribedPodcastIds: arrayUnion(podcastId) });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `users/${auth.currentUser.uid}`);
  }
};

export const unsubscribeFromPodcast = async (podcastId: string): Promise<void> => {
  if (!auth.currentUser) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  try {
    await updateDoc(userRef, { subscribedPodcastIds: arrayRemove(podcastId) });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `users/${auth.currentUser.uid}`);
  }
};

export const fetchAlbumsByIds = async (ids: string[]): Promise<Album[]> => {
  if (!ids || ids.length === 0) return [];
  const results: Album[] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'albums', id));
        if (snap.exists()) results.push({ id: snap.id, ...snap.data() } as Album);
      } catch { /* skip missing */ }
    })
  );
  return results;
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
      ownerId: auth.currentUser!.uid,
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
    ownerId: auth.currentUser!.uid,
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
    // No orderBy — that would require a composite index (ownerId+timestamp) which,
    // if absent, makes the whole query fail silently and the locker looks empty.
    // Single-field where() is auto-indexed; sort newest-first in JS.
    const q = query(collection(db, 'personal_tracks'), where('ownerId', '==', auth.currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Track).sort((a, b) => ((b as any).timestamp || 0) - ((a as any).timestamp || 0));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const fetchPersonalAlbums = async () => {
  if (!auth.currentUser) return [];
  const path = 'personal_albums';
  try {
    const q = query(collection(db, 'personal_albums'), where('ownerId', '==', auth.currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Album).sort((a, b) => ((b as any).createdAt || 0) - ((a as any).createdAt || 0));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

/** Merge-update a locker track (e.g. enriched lyrics/art). Owner-gated by rules. */
export const updatePersonalTrack = async (id: string, updates: Partial<Track>) => {
  if (!auth.currentUser || !id) return;
  try {
    await setDoc(doc(db, 'personal_tracks', id), removeUndefined(updates as any), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `personal_tracks/${id}`);
  }
};

export const createPlaylist = async (playlist: Partial<Playlist>) => {
  if (!auth.currentUser) return;
  const id = `playlist_${Date.now()}`;
  const path = `personal_playlists/${id}`;
  const newPlaylist: Playlist = {
    id,
    ownerId: auth.currentUser!.uid,
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
    // No orderBy — avoids composite index requirement on named database; sort in JS instead
    const q = query(collection(db, 'personal_playlists'), where('ownerId', '==', auth.currentUser.uid));
    const snap = await getDocs(q);
    const playlists = snap.docs.map(d => d.data() as Playlist);
    return playlists.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
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

// ── Community Playlists ────────────────────────────────────────────────────────
// Shared to the public `communityPlaylists` collection with tags like
// 'workout', 'wellness', 'meditation', 'study', 'hype', 'chill', 'sleep'.

export const sharePlaylistToCommunity = async (
  playlist: Playlist,
  tags: string[],
) => {
  if (!auth.currentUser) return null;
  const u = auth.currentUser;
  const id = `cp_${playlist.id}_${u.uid}`;
  const doc_ = doc(db, 'communityPlaylists', id);
  const data = {
    ...playlist,
    id,
    ownerId: u.uid,
    authorName: u.displayName ?? 'Unknown',
    authorPhoto: u.photoURL ?? '',
    tags,
    likes: 0,
    plays: 0,
    isPublic: true,
    sharedAt: Date.now(),
    timestamp: Date.now(),
  };
  try {
    await setDoc(doc_, data);
    return data;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'communityPlaylists');
    return null;
  }
};

export const fetchCommunityPlaylistsByTag = async (tag: string, limitCount = 20) => {
  try {
    const q = query(
      collection(db, 'communityPlaylists'),
      where('isPublic', '==', true),
      where('tags', 'array-contains', tag),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data()) as import('../types').CommunityPlaylist[];
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'communityPlaylists');
    return [];
  }
};

export const fetchAllCommunityPlaylists = async (limitCount = 40) => {
  try {
    const q = query(
      collection(db, 'communityPlaylists'),
      where('isPublic', '==', true),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => d.data() as import('../types').CommunityPlaylist)
      .sort((a, b) => (b.sharedAt ?? 0) - (a.sharedAt ?? 0));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'communityPlaylists');
    return [];
  }
};

export const likeCommunityPlaylist = async (playlistId: string) => {
  try {
    await updateDoc(doc(db, 'communityPlaylists', playlistId), {
      likes: (await getDoc(doc(db, 'communityPlaylists', playlistId))).data()?.likes + 1 || 1,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `communityPlaylists/${playlistId}`);
  }
};

export const incrementPlaylistPlays = async (playlistId: string) => {
  try {
    const ref = doc(db, 'communityPlaylists', playlistId);
    const snap = await getDoc(ref);
    if (snap.exists()) await updateDoc(ref, { plays: (snap.data().plays ?? 0) + 1 });
  } catch {}
};

export const fetchMySharedPlaylists = async () => {
  if (!auth.currentUser) return [];
  try {
    const q = query(
      collection(db, 'communityPlaylists'),
      where('ownerId', '==', auth.currentUser.uid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => d.data() as import('../types').CommunityPlaylist)
      .sort((a, b) => (b.sharedAt ?? 0) - (a.sharedAt ?? 0));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'communityPlaylists');
    return [];
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
    // NOTE: the `personal_tracks` collection is the source of truth (fetchPersonalTracks).
    // We deliberately do NOT append to a `personalTracks` array on the user doc — a music
    // locker can hold thousands of tracks and that array would blow the 1MB doc limit
    // (and would leak private locker tracks into artist-mode displays).
    return newTrack;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, trackPath);
  }
};

/** Delete a track from the private music locker (personal_tracks). Owner-only. */
export const deletePersonalTrack = async (trackId: string) => {
  if (!auth.currentUser) return;
  try {
    await deleteDoc(doc(db, 'personal_tracks', trackId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `personal_tracks/${trackId}`);
  }
};

// ── Personal VIDEO locker (Plex-style: movies/TV the user owns → Taleo) ──────────
// Private to the owner (personal_videos, owner-only rules). Never shared.
export const uploadPersonalVideo = async (video: Partial<Video>, file: File): Promise<Video | undefined> => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const path = `personal/${uid}/videos/${Date.now()}_${file.name}`;
  const url = await uploadFile(path, file);
  const id = `pvid_${Math.random().toString(36).substr(2, 9)}`;
  const newVideo: Video = removeUndefined({
    id,
    ownerId: uid,
    title: video.title || file.name.replace(/\.[^/.]+$/, ''),
    category: video.category || 'MOVIE',
    isPersonalMedia: true,
    isPrivate: true,
    rightsOwnerId: uid,
    timestamp: Date.now(),
    ...video,
    url,               // uploaded URL wins over anything in `video`
  }) as Video;
  try {
    await setDoc(doc(db, 'personal_videos', id), removeUndefined({ ...newVideo, ownerId: uid }));
    return newVideo;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `personal_videos/${id}`);
  }
};

/** The owner's private movie/TV locker, newest first (no composite index needed). */
export const fetchPersonalVideos = async (): Promise<Video[]> => {
  if (!auth.currentUser) return [];
  try {
    const q = query(collection(db, 'personal_videos'), where('ownerId', '==', auth.currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Video).sort((a, b) => ((b as any).timestamp || 0) - ((a as any).timestamp || 0));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'personal_videos');
    return [];
  }
};

export const deletePersonalVideo = async (videoId: string) => {
  if (!auth.currentUser) return;
  try {
    await deleteDoc(doc(db, 'personal_videos', videoId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `personal_videos/${videoId}`);
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
    
    // Education safety backstop: a student can only DM their teachers/guardians (never other
    // students or strangers). Enforced in the UI too; this is defense-in-depth on the write path.
    if (type === 'PRIVATE' && participants.length === 2) {
      try {
        const [a, b] = await fetchUserProfiles(participants);
        if (isStudentAccount(a) || isStudentAccount(b)) {
          const decision = canDM(a, b);
          if (!decision.allowed) throw new Error(decision.reason || 'This message isn\'t allowed.');
        }
      } catch (guardErr) {
        if (guardErr instanceof Error && guardErr.message && !/index|permission|network/i.test(guardErr.message)) throw guardErr;
        // profile-fetch hiccup (not a policy block) — fall through and let normal creation proceed.
      }
    }

    // For private chats, check if one already exists
    if (type === 'PRIVATE' && participants.length === 2) {
      const existing = snap.docs.find(d => {
        const p = d.data().participants as string[];
        return p.length === 2 && participants.every(uid => p.includes(uid));
      });
      if (existing) return existing.id;
      // Deterministic id for a DM pair — concurrent creates converge on the SAME
      // doc (setDoc/merge) instead of racing into two rooms for the same pair.
      const dmId = 'dm_' + [...participants].sort().join('_');
      await setDoc(doc(db, path, dmId), {
        participants,
        type,
        name: name || '',
        updatedAt: Date.now(),
        ownerId: auth.currentUser?.uid,
      }, { merge: true });
      return dmId;
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

/**
 * Create or open a class group chat (CLASSROOM room). Deterministic id (class_<classId>) so the
 * teacher and every student converge on one thread. Membership = teacher + students. Safe to call
 * repeatedly; it merges the roster (arrayUnion) without clobbering existing messages/metadata.
 */
export const ensureClassroomRoom = async (
  classId: string,
  teacherUid: string,
  studentUids: string[],
  name?: string,
): Promise<string> => {
  const roomId = classroomRoomId(classId);
  try {
    await setDoc(doc(db, 'chat_rooms', roomId), {
      type: 'CLASSROOM',
      classId,
      name: name || 'Class Chat',
      ownerId: teacherUid,
      participants: arrayUnion(...classroomParticipants(teacherUid, studentUids)),
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `chat_rooms/${roomId}`);
  }
  return roomId;
};

export const deleteChatRoom = async (roomId: string): Promise<void> => {
  const path = `chat_rooms/${roomId}`;
  try {
    // Delete all messages in batches of 400 (Firestore batch limit is 500)
    const msgsSnap = await getDocs(collection(db, 'chat_rooms', roomId, 'messages'));
    const chunks: typeof msgsSnap.docs[] = [];
    for (let i = 0; i < msgsSnap.docs.length; i += 400) {
      chunks.push(msgsSnap.docs.slice(i, i + 400));
    }
    await Promise.all(chunks.map(chunk => {
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      return batch.commit();
    }));
    // Delete the room document itself
    await deleteDoc(doc(db, 'chat_rooms', roomId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
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
    // Read first to check burnAfterSeen flag — only triggers countdown when recipient (not sender) sees it
    const snap = await getDoc(msgRef);
    const data = snap.data();
    const uid = auth.currentUser.uid;
    const updates: Record<string, any> = { seenBy: arrayUnion(uid) };
    // If burn-after-read is armed and NOT yet stamped, set the 30s countdown now
    if (data?.burnAfterSeen && !data?.burnAfter && data?.senderId !== uid) {
      updates.burnAfter = Date.now() + 30_000;
    }
    await updateDoc(msgRef, updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
};

/**
 * Guardian CC (school transparency): if a student/child account is a participant in a chat room,
 * their guardian(s) are automatically added to the room so they see everything sent to OR by the
 * child — the COPPA/FERPA "parent has visibility" guarantee. Runs once per room (guarded by
 * `guardianCcResolved`); returns the guardian uids so the send path can also notify them.
 * A guardian who is already a participant (e.g. a parent↔teacher thread) is never re-added.
 */
export const ensureGuardianCc = async (
  roomId: string,
  roomData: { participants?: string[]; guardianCcResolved?: boolean; ccGuardianUids?: string[]; type?: string },
): Promise<string[]> => {
  // Guardian CC applies to 1:1/small threads only — never public live chat, and never the big
  // CLASSROOM announcement channels (CCing every student's parents would balloon the room).
  if (roomData.type === 'PUBLIC_LIVE' || roomData.type === 'CLASSROOM') return [];
  if (roomData.guardianCcResolved) return roomData.ccGuardianUids || [];
  const participants: string[] = roomData.participants || [];
  if (participants.length < 2) return []; // wait until both sides are present before resolving
  try {
    const profiles = await fetchUserProfiles(participants);
    const guardians = new Set<string>();
    for (const p of profiles) {
      const isStudent =
        (p as any).isChild || p.accountType === 'CHILD' || (p as any).accountType === 'STUDENT' ||
        (p as any).childState === 'SCHOOL_PROVISIONED';
      if (!isStudent) continue;
      if ((p as any).guardianUid) guardians.add((p as any).guardianUid);
      ((p as any).coGuardianUids || []).forEach((g: string) => g && guardians.add(g));
    }
    // Guardians not already in the room need adding as observers; the rest are already present.
    const toAdd = [...guardians].filter(g => g && !participants.includes(g));
    await updateDoc(doc(db, 'chat_rooms', roomId), {
      guardianCcResolved: true,
      ccGuardianUids: [...guardians],
      ...(toAdd.length ? { participants: arrayUnion(...toAdd) } : {}),
    });
    return [...guardians];
  } catch {
    return roomData.ccGuardianUids || [];
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
      // School transparency: make sure any student's guardian is CC'd onto this thread, then
      // fold the guardian uids into the recipient set so they're notified of this message too.
      const ccGuardians = await ensureGuardianCc(roomId, roomData as any);
      const participants: string[] = Array.from(new Set([...(roomData.participants || []), ...ccGuardians]));
      const others = participants.filter((pId: string) => pId !== (auth.currentUser?.uid || ''));

      others.forEach((pId: string) => {
        const isGuardianCopy = ccGuardians.includes(pId);
        createNotification({
          userId: pId,
          senderId: auth.currentUser?.uid || '',
          senderName: auth.currentUser?.displayName || 'Anonymous',
          senderPhoto: auth.currentUser?.photoURL || '',
          type: 'MESSAGE',
          title: isGuardianCopy ? 'Copied on your child\'s message' : 'New Message',
          message: `${auth.currentUser?.displayName}: ${(message.text ?? '').substring(0, 50)}${(message.text ?? '').length > 50 ? '...' : ''}`,
          link: 'MESSAGES',
          targetId: roomId
        });
      });
    }
    
    // Update room metadata — preserve existing type for already-created rooms (PRIVATE, GROUP, etc.)
    // Only default type for truly new rooms (lazy-created live chats that have no document yet)
    const existingType = roomSnap.exists() ? roomSnap.data().type : null;
    const roomType = existingType || (roomId.startsWith('live_chat_') ? 'PUBLIC_LIVE' : 'GROUP');
    await setDoc(doc(db, 'chat_rooms', roomId), {
      lastMessage: message.text || (message.type === 'VOICE' ? 'Voice Note' : message.type === 'MEDIA' ? 'Shared Media' : ''),
      updatedAt: Date.now(),
      type: roomType,
      // Always add sender to participants so Firestore security rules never block reads
      participants: arrayUnion(auth.currentUser?.uid),
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

/** Upsert a live_chat room document with song metadata so ChatSystem can show cover art. */
export const ensureLiveChatRoom = async (
  roomId: string,
  meta: { name: string; coverUrl?: string; mediaId?: string; mediaArtist?: string }
): Promise<void> => {
  if (!auth.currentUser) return;
  await setDoc(doc(db, 'chat_rooms', roomId), {
    type: 'PUBLIC_LIVE',
    name: meta.name,
    coverUrl: meta.coverUrl ?? null,
    mediaId: meta.mediaId ?? null,
    mediaTitle: meta.name,
    mediaArtist: meta.mediaArtist ?? null,
    participants: arrayUnion(auth.currentUser.uid),
    updatedAt: Date.now(),
  }, { merge: true });
};

/**
 * Persist intimate-mode settings on a chat room (shared: both participants read the same doc).
 * Merged onto chat_rooms/{roomId}; only defined keys are written (undefined would throw).
 */
export const updateRoomIntimate = async (
  roomId: string,
  patch: { isIntimate?: boolean; intimateBackgroundUrl?: string | null; intimateTheme?: string; intimatePetName?: string | null },
): Promise<void> => {
  if (!auth.currentUser) return;
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
  if (Object.keys(clean).length === 0) return;
  // No updatedAt bump — the existing doc already satisfies isValidChatRoom, and bumping would
  // reorder the DM list every time a couple tweaks their theme/background.
  await setDoc(doc(db, 'chat_rooms', roomId), clean, { merge: true });
};

export const listenToMessages = (roomId: string, callback: (messages: ChatMessage[]) => void) => {
  const q = query(collection(db, 'chat_rooms', roomId, 'messages'), orderBy('timestamp', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
  }, (e) => handleFirestoreError(e, OperationType.LIST, `chat_rooms/${roomId}/messages`));
};

/**
 * Collapse duplicate DM conversations. Two things cause dupes in the inbox:
 *  1. a race in createChatRoom can create two chat_room docs for the same pair,
 *  2. an onSnapshot listener can re-fire / re-register (React strict mode).
 * For PRIVATE rooms we key by the SORTED participant set so the same DM pair
 * shows once (keeping the most recently active doc); everything else keys by id.
 */
export const dedupeChatRooms = (rooms: ChatRoom[]): ChatRoom[] => {
  const byKey = new Map<string, ChatRoom>();
  for (const r of rooms) {
    const parts = Array.isArray(r.participants) ? r.participants : [];
    const key = r.type === 'PRIVATE' && parts.length
      ? 'dm:' + [...parts].sort().join('|')
      : 'id:' + r.id;
    const existing = byKey.get(key);
    if (!existing || (r.updatedAt || 0) > (existing.updatedAt || 0)) byKey.set(key, r);
  }
  return [...byKey.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
};

export const listenToChatRooms = (callback: (rooms: ChatRoom[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(collection(db, 'chat_rooms'), where("participants", "array-contains", auth.currentUser.uid), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(dedupeChatRooms(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom))));
  }, (e) => handleFirestoreError(e, OperationType.LIST, 'chat_rooms'));
};

export const fetchChatRooms = async (): Promise<ChatRoom[]> => {
  if (!auth.currentUser) return [];
  const q = query(collection(db, 'chat_rooms'), where("participants", "array-contains", auth.currentUser.uid), orderBy('updatedAt', 'desc'));
  try {
    const snap = await getDocs(q);
    return dedupeChatRooms(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom)));
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

export const startCall = async (
  receiverId: string,
  type: CallSession['type'],
  meta?: { roomId?: string; roomName?: string; callerName?: string; callerPhoto?: string },
): Promise<string> => {
  const path = 'calls';
  try {
    const docRef = await addDoc(collection(db, path), {
      callerId: auth.currentUser?.uid,
      receiverId,
      type,
      status: 'RINGING',
      timestamp: Date.now(),
      roomId: meta?.roomId || '',
      roomName: meta?.roomName || '',
      callerName: meta?.callerName || auth.currentUser?.displayName || 'Someone',
      callerPhoto: meta?.callerPhoto || auth.currentUser?.photoURL || '',
    });
    // Push notification so the callee is alerted even outside the app.
    try {
      await createNotification({
        userId: receiverId,
        senderId: auth.currentUser?.uid || '',
        senderName: meta?.callerName || auth.currentUser?.displayName || 'Someone',
        senderPhoto: meta?.callerPhoto || auth.currentUser?.photoURL || '',
        type: 'SYSTEM',
        title: `Incoming ${type === 'VIDEO' ? 'video' : 'voice'} call`,
        message: `${meta?.callerName || auth.currentUser?.displayName || 'Someone'} is calling you`,
        targetId: docRef.id,
      } as any);
    } catch { /* non-fatal */ }
    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
    throw e;
  }
};

/** The CALLER watches its own call doc to learn when it's answered / declined / missed. */
export const listenToCall = (callId: string, callback: (call: CallSession | null) => void) => {
  return onSnapshot(doc(db, 'calls', callId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as CallSession) : null);
  }, (e) => handleFirestoreError(e, OperationType.LIST, `calls/${callId}`));
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

// Upload a video file directly to Mux (browser → Mux, skipping Firebase Storage).
// Uses Mux's UpChunk for a RESUMABLE, chunked upload: multi-GB films survive
// dropped connections (each chunk auto-retries, the whole upload resumes from the
// last good chunk instead of restarting). This is what makes large professional
// uploads reliable — a single PUT would restart from 0% on any network blip.
// Returns the Mux upload ID so we can poll for the playback ID afterwards.
export const uploadVideoFileMux = async (
  file: File,
  onProgress?: (p: number) => void,
  existing?: { id: string; url: string },   // pass to RESUME an interrupted upload
): Promise<string> => {
  const { id: uploadId, url: uploadUrl } = existing ?? await createMuxDirectUpload();
  // Persist so a tab close / crash / network drop mid-upload can be resumed. The
  // Mux url is a resumable GCS endpoint, so re-running UpChunk against it continues
  // from the last byte instead of restarting.
  saveResumable({
    uploadId, uploadUrl,
    fileName: file.name, fileSize: file.size,
    title: file.name.replace(/\.[^.]+$/, ''),
    createdAt: Date.now(), progress: 0,
  });
  const UpChunk = await import('@mux/upchunk');
  await new Promise<void>((resolve, reject) => {
    const upload = UpChunk.createUpload({
      endpoint: uploadUrl,
      file,
      chunkSize: 30720,   // 30 MB chunks — good balance for big files on real networks
      attempts: 6,        // retry each chunk up to 6× before failing
      delayBeforeAttempt: 1, // seconds; UpChunk backs off between retries
    });
    // Expose live progress + Pause/Resume to the publish tray.
    registerTransfer({
      id: uploadId, fileName: file.name, progress: 0, paused: false,
      pause: () => { upload.pause(); updateTransfer(uploadId, { paused: true }); },
      resume: () => { upload.resume(); updateTransfer(uploadId, { paused: false }); },
    });
    upload.on('progress', (e: any) => { const p = Math.round(e.detail); if (onProgress) onProgress(p); updateResumableProgress(p); updateTransfer(uploadId, { progress: p }); });
    upload.on('success', () => { removeTransfer(uploadId); resolve(); });
    upload.on('error', (e: any) => { removeTransfer(uploadId); reject(new Error(e?.detail?.message || 'Mux upload failed')); });
  });
  clearResumable();
  return uploadId;
};

// Resume an interrupted film upload (from the persisted resumable entry + the
// re-selected file). Finishes the Mux upload to the SAME url, then creates the
// video doc owned by the current account and starts Mux transcode polling.
export const resumeVideoUpload = async (
  entry: { uploadId: string; uploadUrl: string; title: string },
  file: File,
  onProgress?: (p: number) => void,
): Promise<string | null> => {
  const uploaderUid = auth.currentUser?.uid;
  if (!uploaderUid) throw new Error('Sign in to resume your upload.');
  await uploadVideoFileMux(file, onProgress, { id: entry.uploadId, url: entry.uploadUrl });
  const id = `vid_${Date.now()}`;
  const newVideo = removeUndefined({
    id,
    ownerId: uploaderUid,
    title: entry.title || 'Untitled Video',
    url: '',
    muxUploadId: entry.uploadId,
    isPrivate: true,   // resumed uploads land as a private draft the owner can publish
    timestamp: Date.now(),
  });
  await setDoc(doc(db, 'videos', id), newVideo as any);
  pollMuxUploadUntilReady(entry.uploadId, async (playbackId, assetId) => {
    await updateDoc(doc(db, 'videos', id), { muxPlaybackId: playbackId, muxAssetId: assetId, muxUploadId: null }).catch(() => {});
  }, 450, 4000);
  return id;
};

export const uploadVideo = async (video: Partial<Video>, onProgress?: (p: number) => void): Promise<Video> => {
  if (!auth.currentUser) throw new Error("Must be signed in to upload videos.");
  // Pin ownership to the account that STARTED the upload. A large film can upload
  // for many minutes; if the user hot-switches accounts mid-upload we must NOT
  // re-own the video to whoever is active when it finishes — it stays with the
  // uploader until they delete it.
  const uploaderUid = auth.currentUser.uid;
  const id = `vid_${Date.now()}`;
  const path = `videos/${id}`;

  let videoUrl = video.url || '';
  let muxUploadId: string | undefined;
  if (video.file) {
    try {
      // Preferred path: upload directly to Mux (browser → Mux, no Firebase Storage hop)
      muxUploadId = await uploadVideoFileMux(video.file, onProgress);
    } catch {
      // Server not available in production — fall back to Firebase Storage,
      // then trigger Mux URL ingestion after the file is in Storage.
      videoUrl = await uploadFile(`videos/${id}/source.mp4`, video.file, onProgress);
    }
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
    ownerId: uploaderUid,
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
    commentsCount: 0,
    // Store the Mux direct-upload ID so we can resume polling if the tab is
    // refreshed before Mux finishes transcoding a large file.
    ...(muxUploadId ? { muxUploadId } : {}),
    // Real-time cloud recording (live replay) hands us the Mux playback id directly — no file
    // upload, so persist it here so the replay plays immediately.
    ...((video as any).muxPlaybackId ? { muxPlaybackId: (video as any).muxPlaybackId } : {}),
    // Saved live-stream replays surface in Reello's "Past Live Streams".
    ...(video.isLiveRecording ? { isLiveRecording: true } : {}),
    // Reello UGC marker — REQUIRED for the video to show in the Reello feed
    // (RelloView filters by isRello === true). Was being dropped here.
    ...(video.isRello ? { isRello: true } : {}),
    // Fabula-library marker — one uploaded file can surface in Reello, the Fabula
    // video bin, or both; these flags are the routing conditions.
    ...((video as any).isFabula ? { isFabula: true } : {}),
    // Taleo routing: MoviesTVView surfaces videos with subType MOVIE / TV_SERIES.
    ...((video as any).subType ? { subType: (video as any).subType } : {}),
    ...(Array.isArray(video.tags) && video.tags.length ? { tags: video.tags } : {}),
    ...(typeof video.duration === 'number' ? { duration: video.duration } : {}),
    // Remix lineage must survive the write — provenance below depends on it.
    ...(video.remixOfVideoId ? { remixOfVideoId: video.remixOfVideoId } : {}),
    // Creator Passport provenance (blueprint 1C.5). For an ORIGINAL upload the record
    // is knowable inline and costs nothing extra. A REMIX needs its source's origin,
    // which is an async read — that case is stamped just after the write below.
    // NB: this is an attribution record, NOT cryptographic proof — see
    // services/creatorPassport.ts before writing any UI copy about it.
    ...(video.remixOfVideoId ? {} : { provenance: buildProvenance({ videoId: id, ownerId: uploaderUid }) }),
  } as any;
  
  // Save to Firestore immediately so the creator can see the video right away.
  try {
    await setDoc(doc(db, 'videos', id), newVideo);
    // Remix uploads: resolve the source's origin and stamp provenance. Fire-and-forget —
    // a failed stamp must never fail an upload that already succeeded.
    if (video.remixOfVideoId) {
      stampVideo(id, uploaderUid, { remixOfVideoId: video.remixOfVideoId }).catch(() => {});
    }
    // New video is new content — notify the creator's followers (unless it's a private upload).
    if (!newVideo.isPrivate) {
      notifyFollowers(uploaderUid, 'CONTENT', 'New Video', `${auth.currentUser.displayName || 'A creator'} posted a new video: ${newVideo.title}`, 'FEED', id, { highlight: true });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
    throw e;
  }

  if (muxUploadId) {
    // Direct-upload path: poll Mux for the playback ID once the asset is ready.
    // 450 attempts × 4s = 30 minutes — enough for feature-length movie files.
    pollMuxUploadUntilReady(muxUploadId, async (playbackId, assetId) => {
      try {
        await updateDoc(doc(db, 'videos', id), {
          muxPlaybackId: playbackId,
          muxAssetId: assetId,
          muxUploadId: null, // clear once resolved
        });
      } catch {}
    }, 450, 4000);
  } else if (videoUrl && !videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be') && !videoUrl.includes('vimeo.com')) {
    // Firebase Storage fallback path — ingest the URL into Mux in the background.
    (async () => {
      try {
        const muxData = await createMuxAssetFromUrl(videoUrl);
        await updateDoc(doc(db, 'videos', id), {
          ...(muxData.assetId   ? { muxAssetId:    muxData.assetId    } : {}),
          ...(muxData.playbackId ? { muxPlaybackId: muxData.playbackId } : {}),
          muxUploadId: null,
        });
      } catch (err) {
        console.error('Background Mux transcoding failed for video', id, ':', err);
      }
    })();
  }

  return newVideo;
};

// --- Mux Live Streaming ---

const getRequiredIdToken = async (): Promise<string> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Sign in required.');
  return idToken;
};

/** Firebase ID token if the user is signed in, else null. Used by callers that
 *  can attach auth opportunistically (e.g. the Crossover cloud converter). */
export const getOptionalIdToken = async (): Promise<string | null> => {
  try { return (await auth.currentUser?.getIdToken()) || null; } catch { return null; }
};

export const createMuxLiveStream = async (): Promise<{
  streamId: string;
  streamKey: string;
  rtmpUrl: string;
  srtUrl: string;
  playbackId: string | null;
}> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/mux/live/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create live stream' }));
    throw new Error(err.error || 'Failed to create Mux live stream');
  }
  return res.json();
};

export const endMuxLiveStream = async (streamId: string): Promise<{ assetId: string | null; playbackId: string | null }> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/mux/live/${streamId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to end stream' }));
    throw new Error(err.error || 'Failed to end Mux live stream');
  }
  const data = await res.json();
  return { assetId: data.assetId ?? null, playbackId: data.playbackId ?? null };
};

export const getMuxLiveStreamStatus = async (streamId: string): Promise<{ status: string; playbackId: string | null }> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/mux/live/${streamId}/status`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch stream status');
  return res.json();
};

export const fetchAllVideos = async (): Promise<Video[]> => {
  const path = 'videos';
  try {
    // No orderBy — avoids composite index requirement on named database; sort in JS instead
    const q = query(collection(db, path), where("isPrivate", "==", false), limit(100));
    const snap = await getDocs(q);
    const videos = snap.docs.map(d => ({ id: d.id, ...d.data() } as Video));
    return videos.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

/** Fetch a single video by id — for deep links (fetchAllVideos only returns the
 *  recent-50, so a shared older video must be fetched directly). */
export const fetchVideoById = async (id: string): Promise<Video | null> => {
  try {
    const snap = await getDoc(doc(db, 'videos', id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Video) : null;
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, `videos/${id}`);
    return null;
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
  const uid = auth.currentUser.uid;
  const likeId = `${uid}_${videoId}`;
  const path = `videos/${videoId}/likes/${likeId}`;
  try {
    await setDoc(doc(db, 'videos', videoId, 'likes', likeId), {
      id: likeId,
      videoId,
      userId: uid,
      timestamp: Date.now()
    });
    await updateDoc(doc(db, 'videos', videoId), { likesCount: increment(1) });
    // Mirror into the owner's liked-videos list (powers the "Liked videos" surface).
    await setDoc(doc(db, 'users', uid, 'likedVideos', videoId), { videoId, timestamp: Date.now() }).catch(() => {});
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const unlikeVideo = async (videoId: string) => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const likeId = `${uid}_${videoId}`;
  const path = `videos/${videoId}/likes/${likeId}`;
  try {
    await deleteDoc(doc(db, 'videos', videoId, 'likes', likeId));
    await updateDoc(doc(db, 'videos', videoId), { likesCount: increment(-1) });
    await deleteDoc(doc(db, 'users', uid, 'likedVideos', videoId)).catch(() => {});
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

/** All videos the current user has liked, newest first (from the mirrored list). */
export const getLikedVideos = async (uid?: string): Promise<Video[]> => {
  const userId = uid || auth.currentUser?.uid;
  if (!userId) return [];
  try {
    const snap = await getDocs(query(collection(db, 'users', userId, 'likedVideos'), orderBy('timestamp', 'desc'), limit(60)));
    const ids = snap.docs.map(d => (d.data() as any).videoId).filter(Boolean);
    return fetchPlaylistVideos(ids);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, `users/${userId}/likedVideos`);
    return [];
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
  const newPlaylist: VideoPlaylist = removeUndefined({
    id,
    ownerId: auth.currentUser!.uid,
    ownerName: auth.currentUser.displayName || 'Creator',
    ownerPhoto: auth.currentUser.photoURL || '',
    title: playlist.title || 'New Playlist',
    description: playlist.description || '',
    videoIds: playlist.videoIds || [],
    thumbnailUrl: playlist.thumbnailUrl || '',
    isPrivate: playlist.isPrivate || false,
    isPublic: playlist.isPublic ?? true,
    unlisted: playlist.unlisted || false,
    system: playlist.system,
    updatedAt: Date.now(),
    timestamp: Date.now()
  }) as VideoPlaylist;
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
    // No orderBy — avoids composite index requirement on named database; sort in JS instead
    let q;
    if (uid) {
      q = query(collection(db, path), where("ownerId", "==", uid));
    } else {
      q = query(collection(db, path), where("isPublic", "==", true), limit(100));
    }
    const snap = await getDocs(q);
    const playlists = snap.docs.map(d => d.data() as VideoPlaylist);
    return playlists.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

/** Fetch a single video playlist by id (for the detail view + shared links). */
export const fetchVideoPlaylistById = async (playlistId: string): Promise<VideoPlaylist | null> => {
  try {
    const snap = await getDoc(doc(db, 'video_playlists', playlistId));
    return snap.exists() ? (snap.data() as VideoPlaylist) : null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `video_playlists/${playlistId}`);
    return null;
  }
};

/** Add a video to a playlist (YouTube "Save to…"). Sets the cover to the first video's thumb. */
export const addVideoToPlaylist = async (playlistId: string, video: Video | string): Promise<void> => {
  if (!auth.currentUser) return;
  const videoId = typeof video === 'string' ? video : video.id;
  const path = `video_playlists/${playlistId}`;
  try {
    const ref = doc(db, 'video_playlists', playlistId);
    const snap = await getDoc(ref);
    const cur = snap.data() as VideoPlaylist | undefined;
    const patch: any = { videoIds: arrayUnion(videoId), updatedAt: Date.now() };
    // First video becomes the cover if none set yet.
    if (cur && (!cur.videoIds || cur.videoIds.length === 0) && !cur.thumbnailUrl && typeof video !== 'string') {
      const thumb = (video as any).muxPlaybackId
        ? `https://image.mux.com/${(video as any).muxPlaybackId}/thumbnail.png?width=640&height=360&time=5`
        : video.thumbnailUrl || video.coverImageUrl || '';
      if (thumb) patch.thumbnailUrl = thumb;
    }
    await updateDoc(ref, patch);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

/** Remove a video from a playlist. */
export const removeVideoFromPlaylist = async (playlistId: string, videoId: string): Promise<void> => {
  if (!auth.currentUser) return;
  const path = `video_playlists/${playlistId}`;
  try {
    await updateDoc(doc(db, 'video_playlists', playlistId), { videoIds: arrayRemove(videoId), updatedAt: Date.now() });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

/** Patch a playlist's editable fields (title, description, privacy). */
export const updateVideoPlaylist = async (playlistId: string, patch: Partial<VideoPlaylist>): Promise<void> => {
  if (!auth.currentUser) return;
  const path = `video_playlists/${playlistId}`;
  try {
    await updateDoc(doc(db, 'video_playlists', playlistId), removeUndefined({ ...patch, updatedAt: Date.now() }) as any);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

/** Delete a playlist (system playlists like Watch Later are protected in the UI). */
export const deleteVideoPlaylist = async (playlistId: string): Promise<void> => {
  if (!auth.currentUser) return;
  const path = `video_playlists/${playlistId}`;
  try {
    await deleteDoc(doc(db, 'video_playlists', playlistId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

/** Find-or-create the caller's "Watch Later" system playlist, then add the video. */
export const addToWatchLater = async (video: Video | string): Promise<void> => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  try {
    const existing = (await fetchUserVideoPlaylists(uid)).find(p => p.system === 'WATCH_LATER');
    let plId = existing?.id;
    if (!plId) {
      const created = await createVideoPlaylist({ title: 'Watch Later', system: 'WATCH_LATER', isPublic: false, isPrivate: true } as any);
      plId = created?.id;
    }
    if (plId) await addVideoToPlaylist(plId, video);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'video_playlists/watch_later');
  }
};

/** The caller's "Watch Later" system playlist, or null if they've never saved anything. */
export const fetchWatchLaterPlaylist = async (): Promise<VideoPlaylist | null> => {
  if (!auth.currentUser) return null;
  try {
    const found = (await fetchUserVideoPlaylists(auth.currentUser.uid)).find(p => p.system === 'WATCH_LATER');
    return found || null;
  } catch {
    return null;
  }
};

/** Remove a video from Watch Later. Silent no-op when the playlist doesn't exist yet. */
export const removeFromWatchLater = async (videoId: string): Promise<void> => {
  const pl = await fetchWatchLaterPlaylist();
  if (pl?.id) await removeVideoFromPlaylist(pl.id, videoId);
};

/**
 * One-tap Watch Later toggle used by video cards.
 * Returns the resulting saved-state so the caller can flip its icon optimistically.
 */
export const toggleWatchLater = async (video: Video | string): Promise<boolean> => {
  if (!auth.currentUser) return false;
  const videoId = typeof video === 'string' ? video : video.id;
  const pl = await fetchWatchLaterPlaylist();
  if (pl?.videoIds?.includes(videoId)) {
    await removeVideoFromPlaylist(pl.id, videoId);
    return false;
  }
  await addToWatchLater(video);
  return true;
};

/** Hydrate a playlist's videoIds into full Video objects, preserving order. */
export const fetchPlaylistVideos = async (videoIds: string[]): Promise<Video[]> => {
  if (!videoIds?.length) return [];
  try {
    const results = await Promise.all(videoIds.map(id => fetchVideoById(id).catch(() => null)));
    return results.filter(Boolean) as Video[];
  } catch {
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

export const fetchAllPublicBrandAccounts = async (): Promise<BrandAccount[]> => {
  const path = 'brand_accounts';
  try {
    const q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as BrandAccount));
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
    ownerId: auth.currentUser!.uid,
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
      ownerId: auth.currentUser!.uid,
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

export const fetchFastChannelVideos = async (uid: string): Promise<Video[]> => {
  const path = 'videos';
  try {
    const q = query(collection(db, path), where('ownerId', '==', uid), where('allowInFastChannel', '==', true));
    const snap = await getDocs(q);
    const videos = snap.docs.map(d => ({ id: d.id, ...d.data() } as Video));
    return videos.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const updateFastChannelEnabled = async (uid: string, enabled: boolean) => {
  await updateUserProfile(uid, { fastChannelEnabled: enabled } as any);
};

// ── FAST CHANNEL SCHEDULE ─────────────────────────────────────────────────────

// ─── Channel sources + saved-feed library (channel_sources/{ownerId}) ──
/** The full set — sources (active broadcasts) + savedFeeds (the reusable library). */
export const fetchChannelSourceSet = async (uid: string): Promise<{ sources: ChannelSource[]; savedFeeds: SavedFeed[] }> => {
  try {
    const snap = await getDoc(doc(db, 'channel_sources', uid));
    const data = snap.exists() ? (snap.data() as ChannelSourceSet) : null;
    return {
      sources: Array.isArray(data?.sources) ? data!.sources : [],
      savedFeeds: Array.isArray(data?.savedFeeds) ? data!.savedFeeds : [],
    };
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `channel_sources/${uid}`);
    return { sources: [], savedFeeds: [] };
  }
};

/** Back-compat: just the active sources. */
export const fetchChannelSources = async (uid: string): Promise<ChannelSource[]> =>
  (await fetchChannelSourceSet(uid)).sources;

/** Every account's currently-live sources (EXTERNAL_LIVE / REELLO_LIVE, isActive) for the TV Live
 *  rails. Firestore can't query inside the `sources[]` array, so we page the collection and flatten
 *  client-side (small N). Members-only sources ride along; the player gates them at play time. */
export const fetchActiveLiveSources = async (max = 120): Promise<{ ownerId: string; source: ChannelSource }[]> => {
  try {
    const snap = await getDocs(query(collection(db, 'channel_sources'), limit(max)));
    const out: { ownerId: string; source: ChannelSource }[] = [];
    // A REELLO_LIVE source can be saved with a blank playback id and "use my active live stream" —
    // those need the owner's liveStreamConfig to become playable, so collect them for a second pass.
    const needResolve: { ownerId: string; source: ChannelSource }[] = [];
    snap.docs.forEach(d => {
      const set = d.data() as ChannelSourceSet;
      const ownerId = (set as any).ownerId || d.id;
      (set.sources || []).forEach(s => {
        if (!s.isActive || (s.type !== 'EXTERNAL_LIVE' && s.type !== 'REELLO_LIVE')) return;
        if (s.url || s.muxPlaybackId) out.push({ ownerId, source: s });
        else if (s.type === 'REELLO_LIVE') needResolve.push({ ownerId, source: s });
      });
    });

    // Fill blank REELLO_LIVE sources from each owner's active live stream (small N; unique owners).
    if (needResolve.length) {
      const owners = Array.from(new Set(needResolve.map(x => x.ownerId)));
      const configs = new Map<string, any>();
      await Promise.all(owners.map(async id => {
        try {
          const us = await getDoc(doc(db, 'users', id));
          configs.set(id, us.exists() ? (us.data() as any)?.liveStreamConfig : null);
        } catch { configs.set(id, null); }
      }));
      needResolve.forEach(({ ownerId, source }) => {
        const lc = configs.get(ownerId);
        if (!lc?.isActive) return;
        const muxPlaybackId = lc.muxPlaybackId || source.muxPlaybackId;
        const url = !muxPlaybackId ? (lc.streamUrl || source.url) : source.url;
        if (muxPlaybackId || url) out.push({ ownerId, source: { ...source, muxPlaybackId, url } });
      });
    }
    return out;
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'channel_sources(active)');
    return [];
  }
};

/** Persist sources + library. `maxSources` caps concurrent broadcasts (3 for a regular account,
 *  higher for BRAND/ORGANIZATION/PARTNER — the caller decides). The library is uncapped. */
export const saveChannelSources = async (ownerId: string, sources: ChannelSource[], savedFeeds: SavedFeed[] = [], maxSources = 3): Promise<void> => {
  try {
    const capped = (sources || []).slice(0, Math.max(1, maxSources)).map(s => removeUndefined({ ...s, updatedAt: Date.now() }));
    const feeds = (savedFeeds || []).map(f => removeUndefined(f));
    await setDoc(doc(db, 'channel_sources', ownerId), { ownerId, sources: capped, savedFeeds: feeds, updatedAt: Date.now() } as any);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `channel_sources/${ownerId}`);
    throw e;
  }
};

// ─── FAST channel identity (fast_channels/{ownerId}) ────────────────────────────
export const fetchFastChannelMeta = async (uid: string): Promise<FastChannel | null> => {
  try {
    const snap = await getDoc(doc(db, 'fast_channels', uid));
    return snap.exists() ? (snap.data() as FastChannel) : null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `fast_channels/${uid}`);
    return null;
  }
};

export const saveFastChannelMeta = async (channel: Partial<FastChannel> & { ownerId: string }): Promise<void> => {
  try {
    const now = Date.now();
    const existing = await fetchFastChannelMeta(channel.ownerId);
    const merged: FastChannel = {
      id: channel.ownerId,
      ownerId: channel.ownerId,
      name: channel.name ?? existing?.name ?? 'My Channel',
      number: channel.number ?? existing?.number,
      category: channel.category ?? existing?.category,
      logoUrl: channel.logoUrl ?? existing?.logoUrl,
      tagline: channel.tagline ?? existing?.tagline,
      description: channel.description ?? existing?.description,
      language: channel.language ?? existing?.language ?? 'en',
      isPublished: channel.isPublished ?? existing?.isPublished ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await setDoc(doc(db, 'fast_channels', channel.ownerId), removeUndefined(merged) as any);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `fast_channels/${channel.ownerId}`);
    throw e;
  }
};

export const fetchFastChannelSchedule = async (uid: string): Promise<FastChannelSchedule | null> => {
  try {
    const snap = await getDoc(doc(db, 'fast_channel_schedules', uid));
    if (snap.exists()) return snap.data() as FastChannelSchedule;
    return null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `fast_channel_schedules/${uid}`);
    return null;
  }
};

export const saveFastChannelSchedule = async (schedule: FastChannelSchedule): Promise<void> => {
  try {
    await setDoc(doc(db, 'fast_channel_schedules', schedule.userId), { ...schedule, lastUpdated: Date.now() });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `fast_channel_schedules/${schedule.userId}`);
    throw e;
  }
};

/**
 * The FAST-channel flywheel: when a live stream ends and its replay is saved, append it to the
 * owner's FAST channel so their channel keeps playing (an individual stream is attributed to the
 * user's channel, not a one-off guide row). Enables + publishes the channel on first use. Called
 * from the end-of-stream save when the "Add to my channel" toggle is on. Non-fatal.
 */
export const addReplayToFastChannel = async (uid: string, video: Partial<Video>): Promise<void> => {
  if (!uid || !video?.id) return;
  try {
    const durationSeconds = Math.max(1, Math.round((video as any).duration || 0)) || 1800;
    const slot: FastChannelSlot = {
      id: `v_${video.id}`,
      type: 'VIDEO',
      order: 0, // fixed below to the tail
      videoId: video.id,
      videoUrl: (video as any).muxPlaybackId ? `https://stream.mux.com/${(video as any).muxPlaybackId}.m3u8` : (video.url || ''),
      videoTitle: video.title || 'Live Replay',
      videoThumbnail: (video as any).thumbnailUrl || (video as any).coverImageUrl,
      videoDurationSeconds: durationSeconds,
    };
    const existing = await fetchFastChannelSchedule(uid).catch(() => null);
    let schedule: FastChannelSchedule;
    if (existing && Array.isArray(existing.slots)) {
      schedule = { ...existing, slots: [...existing.slots, { ...slot, order: existing.slots.length }] };
    } else {
      schedule = {
        userId: uid,
        slots: [{ ...slot, order: 0 }],
        adFrequencyMinutes: 0,
        adDurationSeconds: 0,
        commercialFree: true,
        loopSchedule: true,
        autoGenerated: false,
        includePublicDomain: false,
      } as FastChannelSchedule;
    }
    await saveFastChannelSchedule(schedule);
    // Enable + publish the channel so it appears in the Live Hub guide as the user's channel.
    await updateFastChannelEnabled(uid, true).catch(() => {});
    await saveFastChannelMeta({ ownerId: uid, isPublished: true }).catch(() => {});
  } catch (e) {
    console.warn('[fast] addReplayToFastChannel failed', e);
  }
};

export const scheduleLiveInterrupt = async (uid: string, scheduledAt: number, maxDurationSeconds: number, membersOnly = false): Promise<void> => {
  const scheduleRef = doc(db, 'fast_channel_schedules', uid);
  try {
    await updateDoc(scheduleRef, {
      pendingLiveInterrupt: { scheduledAt, maxDurationSeconds, membersOnly },
      lastUpdated: Date.now(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `fast_channel_schedules/${uid}`);
    throw e;
  }
};

export const clearLiveInterrupt = async (uid: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'fast_channel_schedules', uid), {
      pendingLiveInterrupt: null,
      lastUpdated: Date.now(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `fast_channel_schedules/${uid}`);
  }
};

/**
 * Auto-generates a looping 24/7 schedule from the user's FAST channel videos.
 * Inserts ad breaks at the configured frequency. Bumpers wrap each content block.
 */
export const autoGenerateFastChannelSchedule = async (uid: string): Promise<FastChannelSchedule> => {
  const [videos, bumpers, existing] = await Promise.all([
    fetchFastChannelVideos(uid),
    fetchChannelBumpers(uid),
    fetchFastChannelSchedule(uid),
  ]);

  const adFreq = existing?.adFrequencyMinutes ?? 20;
  const adDur = existing?.adDurationSeconds ?? 60;
  const commercialFree = existing?.commercialFree ?? false;   // no ad breaks when true
  const includePublicDomain = existing?.includePublicDomain ?? false;

  const slots: FastChannelSlot[] = [];
  let order = 0;
  let minutesSinceLastAd = 0;

  const introBumper = bumpers.find(b => b.type === 'INTRO');
  const outroBumper = bumpers.find(b => b.type === 'OUTRO');
  const stationId = bumpers.find(b => b.type === 'STATION_ID');

  // Station ID at start
  if (stationId) {
    slots.push({ id: `slot_${order}`, type: 'BUMPER', order, bumperId: stationId.id, bumperUrl: stationId.url, bumperTitle: stationId.title, bumperDurationSeconds: stationId.durationSeconds });
    order++;
  }

  for (const video of videos) {
    // Real per-asset duration drives the EPG/now-next and the deterministic player. Fall back to
    // 30 min only when a video genuinely carries no duration.
    const durationSec = Math.max(1, Math.round((video as any).duration || 0)) || 1800;
    const durationMins = durationSec / 60;

    // Intro bumper before each video
    if (introBumper) {
      slots.push({ id: `slot_${order}`, type: 'BUMPER', order, bumperId: introBumper.id, bumperUrl: introBumper.url, bumperTitle: introBumper.title, bumperDurationSeconds: introBumper.durationSeconds });
      order++;
    }

    // The video itself — prefer the Mux HLS rendition (smooth), else the raw url. (The old ternary
    // had an operator-precedence bug that produced stream.mux.com/undefined.m3u8 for raw uploads.)
    // When the channel opts to surface public-domain content, a CC0-licensed title is tagged as a
    // PUBLIC_DOMAIN slot (the player badges it and guides can categorise it) rather than a plain VIDEO.
    const isPD = includePublicDomain && (video as any).license === 'CC0';
    const videoSlot: FastChannelSlot = {
      id: `slot_${order}`,
      type: isPD ? 'PUBLIC_DOMAIN' : 'VIDEO',
      order,
      videoId: video.id,
      videoUrl: (video as any).muxPlaybackId ? `https://stream.mux.com/${(video as any).muxPlaybackId}.m3u8` : video.url,
      videoTitle: video.title,
      videoThumbnail: video.thumbnailUrl || video.coverImageUrl,
      videoDurationSeconds: durationSec,
      sourceUserId: uid,
      isPublicDomain: isPD || undefined,
    };
    // Copy ad markers from video metadata
    if (video.adMarkers?.length) {
      videoSlot.adMarkersSeconds = video.adMarkers.map(m => m.time);
    }
    slots.push(videoSlot);
    order++;

    // Outro bumper
    if (outroBumper) {
      slots.push({ id: `slot_${order}`, type: 'BUMPER', order, bumperId: outroBumper.id, bumperUrl: outroBumper.url, bumperTitle: outroBumper.title, bumperDurationSeconds: outroBumper.durationSeconds });
      order++;
    }

    minutesSinceLastAd += durationMins;
    if (!commercialFree && minutesSinceLastAd >= adFreq) {
      slots.push({ id: `slot_${order}`, type: 'AD_BREAK', order, adDurationSeconds: adDur });
      order++;
      minutesSinceLastAd = 0;
    }
  }

  const schedule: FastChannelSchedule = {
    userId: uid,
    slots,
    adFrequencyMinutes: adFreq,
    adDurationSeconds: adDur,
    commercialFree,
    loopSchedule: true,
    autoGenerated: true,
    includePublicDomain,
    lastUpdated: Date.now(),
  };

  await saveFastChannelSchedule(schedule);
  return schedule;
};

/**
 * One-tap FAST channel activation — the "don't make them think about it" path. Flipping the channel
 * ON should immediately give a creator a real, playable, published channel; everything after is
 * optional manual control (rearrange slots, prune videos, ads/bumpers in the manager).
 *   1. sets fastChannelEnabled (so it shows in the Live rails),
 *   2. creates the channel identity (fast_channels meta, published) if absent — powers the EPG +
 *      carriage feeds and a real channel name,
 *   3. seeds content: if nothing is opted in yet, auto-opts-in up to `seedLimit` of their most recent
 *      playable videos (they can toggle any off afterward),
 *   4. auto-generates the looping schedule.
 * Idempotent: re-running won't clobber a name they've set or re-seed once videos are opted in.
 */
export const activateFastChannel = async (
  uid: string,
  opts: { displayName?: string; seedLimit?: number } = {},
): Promise<{ schedule: FastChannelSchedule | null; seededVideoCount: number }> => {
  const seedLimit = Math.max(1, Math.min(opts.seedLimit ?? 100, 400)); // Firestore batch cap is 500
  await updateFastChannelEnabled(uid, true);

  // Channel identity — create once, never overwrite a name/logo they've already set.
  const meta = await fetchFastChannelMeta(uid);
  if (!meta) {
    await saveFastChannelMeta({
      ownerId: uid,
      name: opts.displayName ? `${opts.displayName}'s Channel` : 'My Channel',
      isPublished: true,
    });
  }

  // Seed content on first activation so the channel isn't empty — opt in recent playable videos.
  let optedIn = await fetchFastChannelVideos(uid);
  let seededVideoCount = 0;
  if (optedIn.length === 0) {
    const all = await fetchUserVideos(uid);
    const playable = all.filter(v => (v as any).muxPlaybackId || v.url).slice(0, seedLimit);
    if (playable.length) {
      const batch = writeBatch(db);
      playable.forEach(v => batch.update(doc(db, 'videos', v.id), { allowInFastChannel: true } as any));
      await batch.commit();
      optedIn = playable;
      seededVideoCount = playable.length;
    }
  }

  const schedule = optedIn.length > 0 ? await autoGenerateFastChannelSchedule(uid) : null;
  return { schedule, seededVideoCount };
};

// ── CHANNEL BUMPERS ───────────────────────────────────────────────────────────

export const fetchChannelBumpers = async (uid: string): Promise<ChannelBumper[]> => {
  try {
    const q = query(collection(db, 'channel_bumpers'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChannelBumper));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'channel_bumpers');
    return [];
  }
};

export const saveChannelBumper = async (bumper: Omit<ChannelBumper, 'id'> & { id?: string }): Promise<ChannelBumper> => {
  const id = bumper.id || `bumper_${auth.currentUser!.uid}_${Date.now()}`;
  const full: ChannelBumper = { ...bumper, id };
  try {
    await setDoc(doc(db, 'channel_bumpers', id), full);
    return full;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `channel_bumpers/${id}`);
    throw e;
  }
};

export const deleteChannelBumper = async (bumperId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'channel_bumpers', bumperId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `channel_bumpers/${bumperId}`);
  }
};

// ── FAST CHANNEL ASSET SHARING ────────────────────────────────────────────────

export const grantFastChannelAccess = async (grant: Omit<FastChannelAssetGrant, 'id' | 'timestamp'>): Promise<FastChannelAssetGrant> => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const id = `grant_${auth.currentUser.uid}_${grant.toUserId}_${Date.now()}`;
  const full: FastChannelAssetGrant = { ...grant, id, timestamp: Date.now() };
  try {
    await setDoc(doc(db, 'fast_channel_access', id), full);
    return full;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `fast_channel_access/${id}`);
    throw e;
  }
};

export const revokeGrantedFastChannelAccess = async (grantId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'fast_channel_access', grantId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `fast_channel_access/${grantId}`);
  }
};

/** Fetch all grants I have issued (from me → others) */
export const fetchMyFastChannelGrants = async (uid: string): Promise<FastChannelAssetGrant[]> => {
  try {
    const q = query(collection(db, 'fast_channel_access'), where('fromUserId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as FastChannelAssetGrant);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'fast_channel_access');
    return [];
  }
};

/** Fetch all assets that have been granted TO a given user's FAST channel */
export const fetchGrantedFastChannelAssets = async (uid: string): Promise<FastChannelAssetGrant[]> => {
  try {
    const [personal, global] = await Promise.all([
      getDocs(query(collection(db, 'fast_channel_access'), where('toUserId', '==', uid), where('isActive', '==', true))),
      getDocs(query(collection(db, 'fast_channel_access'), where('toUserId', '==', '*'), where('isActive', '==', true))),
    ]);
    return [
      ...personal.docs.map(d => d.data() as FastChannelAssetGrant),
      ...global.docs.map(d => d.data() as FastChannelAssetGrant),
    ];
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'fast_channel_access');
    return [];
  }
};

// ── FAST CHANNEL PLATFORM LIBRARY ─────────────────────────────────────────────

export const fetchFastChannelLibrary = async (): Promise<FastChannelLibraryEntry[]> => {
  try {
    const snap = await getDocs(collection(db, 'fast_channel_library'));
    return snap.docs.map(d => d.data() as FastChannelLibraryEntry);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'fast_channel_library');
    return [];
  }
};

export const addToFastChannelLibrary = async (video: Video, isPaid: boolean = false, pricePerMonth?: number): Promise<void> => {
  if (!auth.currentUser) return;
  const id = `lib_${video.id}`;
  const entry: FastChannelLibraryEntry = {
    id,
    videoId: video.id,
    videoTitle: video.title,
    videoUrl: video.url || '',
    thumbnailUrl: video.thumbnailUrl || video.coverImageUrl || '',
    genre: video.genre,
    tags: video.tags,
    ownerUserId: auth.currentUser.uid,
    ownerName: auth.currentUser.displayName || '',
    isPublicDomain: false,
    isPaid,
    pricePerMonth,
    timestamp: Date.now(),
  };
  try {
    await setDoc(doc(db, 'fast_channel_library', id), entry);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `fast_channel_library/${id}`);
  }
};

export const removeFromFastChannelLibrary = async (videoId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'fast_channel_library', `lib_${videoId}`));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `fast_channel_library/lib_${videoId}`);
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

/** A channel as a Live rail wants it: the branded identity (fast_channels doc, if any) plus the
 *  owner profile FastChannelPlayer needs to play it. Display fields fall back to the profile. */
export interface FastChannelListing {
  ownerId: string;
  name: string;
  number?: number;
  category?: string;
  logoUrl?: string;
  profile: UserProfile;
}

/**
 * Every creator whose FAST channel is switched on, as branded listings. Merges each owner's
 * fast_channels identity doc (name/number/category/logo) over the profile fallback, and drops any
 * channel explicitly unpublished. The owner profile rides along so a listing plays straight through
 * FastChannelPlayer.
 */
export const fetchAllFastChannels = async (max = 60): Promise<FastChannelListing[]> => {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('fastChannelEnabled', '==', true), limit(max)));
    const profiles = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) } as UserProfile));
    const metas = await Promise.all(profiles.map(p => fetchFastChannelMeta((p as any).uid).catch(() => null)));
    const listings: FastChannelListing[] = [];
    profiles.forEach((p, i) => {
      const m = metas[i];
      if (m && m.isPublished === false) return;   // explicitly unpublished → hide
      listings.push({
        ownerId: (p as any).uid,
        name: m?.name || ((p as any).displayName ? `${(p as any).displayName}'s Channel` : 'Channel'),
        number: m?.number,
        category: m?.category,
        logoUrl: m?.logoUrl || (p as any).photoURL || (p as any).headerImage,
        profile: p,
      });
    });
    // Guide-style ordering: numbered channels first (by number), then the rest by name.
    return listings.sort((a, b) =>
      (a.number ?? 9999) - (b.number ?? 9999) || a.name.localeCompare(b.name));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'users(fastChannelEnabled)');
    return [];
  }
};

export const fetchFeaturedProfiles = async (): Promise<UserProfile[]> => {
  try {
    const q = query(collection(db, 'users'), where('isArtist', '==', true), limit(30));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
      .filter(u => !!u.photoURL && !!u.displayName);
  } catch {
    return [];
  }
};

export const fetchLatestAlbumForUser = async (uid: string): Promise<Album | null> => {
  try {
    const q = query(collection(db, 'albums'), where('ownerId', '==', uid), limit(10));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const albums = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Album))
      .filter(a => a.isPublic !== false && (a.tracks?.length ?? 0) > 0);
    albums.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return albums[0] ?? null;
  } catch {
    return null;
  }
};

// ─── User Ad (Billboard Ad Creator) ────────────────────────────────────────

export const saveUserAd = async (
  ad: Partial<import('../types').UserAd> & { ownerId: string }
): Promise<string> => {
  const id = (ad as any).id || `uad_${Date.now()}`;
  const now = Date.now();
  const data = {
    ...ad,
    id,
    createdAt: (ad as any).createdAt || now,
    updatedAt: now,
    isActive: ad.isActive ?? true,
    profilePicX: ad.profilePicX ?? 50,
    profilePicY: ad.profilePicY ?? 40,
    backgroundType: ad.backgroundType ?? 'cover_art',
  };
  await setDoc(doc(db, 'userAds', id), data);
  return id;
};

export const loadUserAd = async (ownerId: string): Promise<import('../types').UserAd | null> => {
  try {
    const q = query(
      collection(db, 'userAds'),
      where('ownerId', '==', ownerId),
      where('isActive', '==', true),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as import('../types').UserAd;
  } catch {
    return null;
  }
};

export const deleteUserAd = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'userAds', id));
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
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/mux/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create Mux upload');
  }
  return res.json();
};

export const getMuxPlaybackId = async (assetId: string): Promise<string | null> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/mux/playback?assetId=${assetId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.playbackId || null;
};

// Poll Mux upload status until the asset is ready, then return the playback ID
export const pollMuxUploadUntilReady = async (
  uploadId: string,
  onReady: (playbackId: string, assetId: string) => void,
  maxAttempts = 30,
  intervalMs = 3000,
): Promise<void> => {
  let attempts = 0;
  const poll = async () => {
    try {
      const idToken = await getRequiredIdToken();
      const res = await fetch(`/api/mux/asset?uploadId=${uploadId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) return;
      const { status, assetId } = await res.json();
      if (status === 'asset_created' && assetId) {
        const playbackId = await getMuxPlaybackId(assetId);
        if (playbackId) { onReady(playbackId, assetId); return; }
      }
    } catch {}
    attempts++;
    if (attempts < maxAttempts) setTimeout(poll, intervalMs);
  };
  setTimeout(poll, intervalMs);
};

// Direct Mux API call — used as fallback when server.ts API is unreachable in production.
/*
const muxDirectCreateAsset = async (_url: string): Promise<{ assetId: string; playbackId: string | undefined } | null> => {
  return null;
  if (!tokenId || !tokenSecret) return null;
  try {
    const auth = 'Basic ' + btoa(`${tokenId}:${tokenSecret}`);
    const createRes = await fetch('https://api.mux.com/video/v1/assets', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ url }], playback_policy: ['public'] }),
    });
    if (!createRes.ok) return null;
    const data = await createRes.json();
    const assetId: string = data.data?.id;
    if (!assetId) return null;
    // Poll up to 90s for the asset to become ready so we get the playback ID immediately
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
        headers: { Authorization: auth },
      });
      if (!poll.ok) break;
      const pollData = await poll.json();
      const asset = pollData.data;
      if (asset?.status === 'ready') {
        return { assetId, playbackId: asset.playback_ids?.[0]?.id };
      }
      if (asset?.status === 'errored') break;
    }
    // Asset created but not yet ready — return assetId without playbackId;
    // VideoPlayer's onSnapshot listener will pick up the playbackId once polling finishes
    return { assetId, playbackId: undefined };
  } catch {
    return null;
  }
};
*/

/**
 * Finalize a real-time cloud recording: the server concatenates the segments already uploaded
 * live (liveRecordings/{streamId}/seg_*) and hands them to Mux — NO device upload. Returns the
 * Mux playback id + the assembled source URL. Throws if the server/segments aren't available, so
 * the caller can fall back to the on-device blob upload.
 */
export const finalizeLiveRecording = async (
  streamId: string,
): Promise<{ muxPlaybackId?: string; url?: string }> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/live/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ streamId }),
    signal: AbortSignal.timeout(240000), // concat + Mux ingest can take a bit
  });
  if (!res.ok) {
    let msg = 'Cloud finalize failed';
    try { msg = (await res.json()).error || msg; } catch { /* */ }
    throw new Error(msg);
  }
  return res.json();
};

export const createMuxAssetFromUrl = async (url: string): Promise<{ assetId: string; playbackId: string | undefined }> => {
  const idToken = await getRequiredIdToken();

  // Try the server-side route first (works when server.ts is running locally or deployed)
  try {
    const res = await fetch('/api/mux/create-asset-from-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(5000), // fast fail if server isn't there
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      return res.json();
    }
  } catch {
    // Server not available — fall through to direct Mux API call
  }
  throw new Error('Mux processing unavailable. Check the server MUX_TOKEN_ID/MUX_TOKEN_SECRET configuration.');
};

/**
 * Bulk-optimize a whole catalogue to Mux HLS so every raw upload streams smoothly (esp. on TV).
 * Sequential + gently paced so it never stampedes Mux, tolerant of individual failures, and writes
 * the playback id back per video as it resolves. Skips anything already on Mux, still uploading, or
 * an external embed (YouTube/Vimeo) that Mux can't ingest. Returns a summary.
 */
export const bulkOptimizeVideosToMux = async (
  videos: Video[],
  onProgress?: (done: number, total: number, currentTitle?: string) => void,
  gapMs = 800,
): Promise<{ eligible: number; optimized: number; failed: number }> => {
  const eligible = (videos || []).filter(v =>
    !v.muxPlaybackId && !(v as any).muxUploadId && !!v.url &&
    !v.url.includes('youtube.com') && !v.url.includes('youtu.be') && !v.url.includes('vimeo.com'),
  );
  let optimized = 0, failed = 0;
  for (let i = 0; i < eligible.length; i++) {
    const v = eligible[i];
    onProgress?.(i, eligible.length, v.title);
    try {
      const { assetId, playbackId } = await createMuxAssetFromUrl(v.url);
      if (playbackId || assetId) {
        await updateDoc(doc(db, 'videos', v.id), removeUndefined({ muxPlaybackId: playbackId, muxAssetId: assetId }) as any);
        optimized++;
      } else { failed++; }
    } catch { failed++; }
    if (i < eligible.length - 1) await new Promise(r => setTimeout(r, gapMs));
  }
  onProgress?.(eligible.length, eligible.length);
  return { eligible: eligible.length, optimized, failed };
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

// Assign an existing album track as a HNS slot alternate (no file upload needed)
export const assignTrackAsHnsSlot = async (
  albumId: string,
  parentTrackId: string,
  slot: 1 | 2,
  sourceTrack: { id: string; title: string; artist: string; url: string; duration?: number }
): Promise<HideNSeekAlternate> => {
  const altId = `${parentTrackId}_slot${slot}`;
  const alt: HideNSeekAlternate = {
    id: altId,
    albumId,
    parentTrackId,
    slot,
    title: sourceTrack.title,
    artist: sourceTrack.artist,
    url: sourceTrack.url,
    duration: sourceTrack.duration,
    uploadedAt: Date.now(),
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

// ─── STRIPE CONNECT — Creator Payouts ────────────────────────────────────────

export const startCreatorConnectOnboarding = async (): Promise<{ url: string; accountId: string }> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/stripe/connect/onboard', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUrl: window.location.origin }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Connect onboarding failed'); }
  return res.json();
};

export const fetchConnectStatus = async (): Promise<{
  connected: boolean; accountId?: string; onboarded?: boolean;
  chargesEnabled?: boolean; payoutsEnabled?: boolean; requiresAction?: boolean;
}> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/stripe/connect/status', {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return { connected: false };
  return res.json();
};

export const openStripeDashboard = async (): Promise<void> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/stripe/connect/dashboard-link', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error('Failed to get dashboard link');
  const { url } = await res.json();
  // Same-tab redirect — window.open() after an await is silently popup-blocked.
  if (url) window.location.href = url;
};

export const fetchCreatorEarnings = async (period: '7d' | '30d' | '90d' | '1y' = '30d') => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/stripe/earnings?period=${period}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch earnings');
  return res.json();
};

export const fetchCreatorSplitConfig = async () => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/stripe/split', {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return { recipients: [], appliesTo: [] };
  return res.json();
};

export const saveCreatorSplitConfig = async (
  recipients: Array<{ creatorUid: string; displayName: string; photoURL?: string; percentage: number }>,
  appliesTo: string[],
): Promise<void> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/stripe/split', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients, appliesTo }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save split config'); }
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

// ── Listen Counts ─────────────────────────────────────────────────────────────

export const incrementTrackPlay = async (trackId: string, albumId?: string): Promise<void> => {
  try {
    await setDoc(doc(db, 'track_stats', trackId), {
      trackId,
      albumId: albumId || null,
      playCount: increment(1),
      lastPlayed: Date.now(),
    }, { merge: true });
    if (albumId) {
      await updateDoc(doc(db, 'albums', albumId), { playCount: increment(1) });
    }
  } catch (_) {}
};

export const fetchTrackStats = async (trackIds: string[]): Promise<Record<string, number>> => {
  if (!trackIds.length) return {};
  try {
    const snaps = await Promise.all(trackIds.map(id => getDoc(doc(db, 'track_stats', id))));
    const result: Record<string, number> = {};
    snaps.forEach((snap, i) => {
      result[trackIds[i]] = snap.exists() ? (snap.data()?.playCount || 0) : 0;
    });
    return result;
  } catch (_) { return {}; }
};

// ── Playlist Track Management ─────────────────────────────────────────────────

export const addTrackToPlaylist = async (playlistId: string, track: Track): Promise<void> => {
  try {
    const ref = doc(db, 'personal_playlists', playlistId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Playlist;
    const existing = data.tracks || [];
    if (existing.some((t: Track) => t.id === track.id)) return;
    await updateDoc(ref, {
      tracks: [...existing, track],
      trackIds: arrayUnion(track.id),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `personal_playlists/${playlistId}`);
  }
};

// Add an external (Audius / archive) track to a playlist by converting it to Track format
export const addExternalTrackToPlaylist = async (
  playlistId: string,
  externalTrack: { id: string; title: string; artist: string; url: string; thumbnailUrl?: string; genre?: string; duration?: number }
): Promise<void> => {
  const track = {
    id: externalTrack.id,
    title: externalTrack.title,
    artist: externalTrack.artist,
    url: externalTrack.url,
    albumCover: externalTrack.thumbnailUrl ?? '',
    images: externalTrack.thumbnailUrl ? [externalTrack.thumbnailUrl] : [],
    genre: externalTrack.genre,
    duration: externalTrack.duration,
    isGlobalArchive: true,
  };
  return addTrackToPlaylist(playlistId, track as any);
};

export const removeTrackFromPlaylist = async (playlistId: string, trackId: string): Promise<void> => {
  try {
    const ref = doc(db, 'personal_playlists', playlistId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Playlist;
    await updateDoc(ref, {
      tracks: (data.tracks || []).filter((t: Track) => t.id !== trackId),
      trackIds: arrayRemove(trackId),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `personal_playlists/${playlistId}`);
  }
};

export const fetchPersonalPlaylist = async (playlistId: string): Promise<Playlist | null> => {
  try {
    const snap = await getDoc(doc(db, 'personal_playlists', playlistId));
    return snap.exists() ? (snap.data() as Playlist) : null;
  } catch (_) { return null; }
};

// ─── EARLY ACCESS & REVIEW CODES ──────────────────────────────────────────────

function makeCode(len = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export const generateReviewCode = async (
  albumId: string,
  label: string,
  maxUses = 1,
  expiresInDays?: number
): Promise<ReviewCode | null> => {
  if (!auth.currentUser) return null;
  const code = makeCode();
  const now = Date.now();
  const reviewCode: ReviewCode = {
    id: `rc_${now}`,
    albumId,
    code,
    label: label || `Review Code`,
    createdAt: now,
    expiresAt: expiresInDays ? now + expiresInDays * 86_400_000 : undefined,
    maxUses,
    useCount: 0,
    isRevoked: false,
  };
  try {
    const albumRef = doc(db, 'albums', albumId);
    await updateDoc(albumRef, {
      reviewCodes: arrayUnion(reviewCode),
      // earlyAccessEnabled is controlled explicitly by the creator toggle — not auto-set here
    });
    return reviewCode;
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `albums/${albumId}`);
    return null;
  }
};

export const revokeReviewCode = async (albumId: string, codeId: string): Promise<void> => {
  try {
    const albumRef = doc(db, 'albums', albumId);
    const snap = await getDoc(albumRef);
    if (!snap.exists()) return;
    const codes: ReviewCode[] = snap.data().reviewCodes || [];
    const updated = codes.map(c => c.id === codeId ? { ...c, isRevoked: true } : c);
    await updateDoc(albumRef, { reviewCodes: updated });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `albums/${albumId}`);
  }
};

export const addEarlyAccessUser = async (
  albumId: string,
  entry: { email?: string; uid?: string; displayName?: string; label?: string }
): Promise<void> => {
  const earlyEntry: EarlyAccessEntry = {
    ...entry,
    addedAt: Date.now(),
  };
  try {
    await updateDoc(doc(db, 'albums', albumId), {
      earlyAccessList: arrayUnion(earlyEntry),
      // earlyAccessEnabled is controlled explicitly by the creator toggle — not auto-set here
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `albums/${albumId}`);
  }
};

export const removeEarlyAccessUser = async (albumId: string, email?: string, uid?: string): Promise<void> => {
  try {
    const snap = await getDoc(doc(db, 'albums', albumId));
    if (!snap.exists()) return;
    const list: EarlyAccessEntry[] = snap.data().earlyAccessList || [];
    const updated = list.filter(e => {
      if (email && e.email === email) return false;
      if (uid && e.uid === uid) return false;
      return true;
    });
    await updateDoc(doc(db, 'albums', albumId), { earlyAccessList: updated });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `albums/${albumId}`);
  }
};

export const checkEarlyAccess = async (albumId: string): Promise<boolean> => {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, 'albums', albumId));
    if (!snap.exists()) return false;
    const data = snap.data();
    if (!data.earlyAccessEnabled) return true; // not restricted
    if (data.ownerId === user.uid) return true;  // owner always has access
    const list: EarlyAccessEntry[] = data.earlyAccessList || [];
    return list.some(e => e.uid === user.uid || e.email === user.email);
  } catch { return false; }
};

export const redeemReviewCode = async (code: string, albumId: string): Promise<boolean> => {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, 'albums', albumId));
    if (!snap.exists()) return false;
    const data = snap.data();
    const codes: ReviewCode[] = data.reviewCodes || [];
    const match = codes.find(c =>
      c.code === code.toUpperCase().trim() &&
      !c.isRevoked &&
      (c.maxUses === 0 || c.useCount < c.maxUses) &&
      (!c.expiresAt || c.expiresAt > Date.now())
    );
    if (!match) return false;
    // Increment use count
    const updatedCodes = codes.map(c => c.id === match.id ? { ...c, useCount: c.useCount + 1 } : c);
    const entry: EarlyAccessEntry = {
      uid: user.uid,
      email: user.email ?? undefined,
      displayName: user.displayName ?? undefined,
      addedAt: Date.now(),
      codeUsed: code.toUpperCase().trim(),
    };
    await updateDoc(doc(db, 'albums', albumId), {
      reviewCodes: updatedCodes,
      earlyAccessList: arrayUnion(entry),
    });
    return true;
  } catch { return false; }
};

// ─── Early Access Requests ────────────────────────────────────────────────────

export const requestEarlyAccess = async (
  albumId: string,
  albumTitle: string,
  albumCover: string | undefined,
  creatorId: string,
  message?: string
): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const docRef = doc(collection(db, 'earlyAccessRequests'));
    const request: EarlyAccessRequest = {
      id: docRef.id,
      albumId,
      albumTitle,
      albumCover,
      requesterId: user.uid,
      requesterName: user.displayName || 'User',
      requesterPhoto: user.photoURL || undefined,
      creatorId,
      status: 'PENDING',
      message: message || undefined,
      requestedAt: Date.now(),
    };
    await setDoc(docRef, removeUndefined(request));

    // Notify creator via DM
    const roomId = await createChatRoom([user.uid, creatorId], 'PRIVATE');
    await sendMessage(roomId, {
      senderId: 'system',
      senderName: 'Plajah',
      senderPhoto: '',
      type: 'ACTION',
      text: `${user.displayName || 'A user'} is requesting early access to "${albumTitle}"${message ? ` — "${message}"` : ''}.`,
      metadata: { action: 'EARLY_ACCESS_REQUEST', url: docRef.id },
    });

    return docRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'earlyAccessRequests');
    return null;
  }
};

export const fetchMyEarlyAccessRequest = async (albumId: string): Promise<EarlyAccessRequest | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const q = query(
      collection(db, 'earlyAccessRequests'),
      where('albumId', '==', albumId),
      where('requesterId', '==', user.uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as EarlyAccessRequest;
  } catch { return null; }
};

export const fetchEarlyAccessRequests = async (albumId: string): Promise<EarlyAccessRequest[]> => {
  try {
    const q = query(collection(db, 'earlyAccessRequests'), where('albumId', '==', albumId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as EarlyAccessRequest))
      .sort((a, b) => b.requestedAt - a.requestedAt);
  } catch { return []; }
};

export const grantEarlyAccessRequest = async (
  requestId: string,
  albumId: string,
  requesterId: string,
  requesterName: string
): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const code = makeCode();
    const now = Date.now();
    const reviewCode: ReviewCode = {
      id: `rc_req_${now}`,
      albumId,
      code,
      label: `Granted to ${requesterName}`,
      createdAt: now,
      maxUses: 1,
      useCount: 0,
      isRevoked: false,
    };
    // Add code to album (pre-redeemed for this user)
    const albumRef = doc(db, 'albums', albumId);
    const earlyEntry: EarlyAccessEntry = {
      uid: requesterId,
      displayName: requesterName,
      addedAt: now,
      label: 'Access Request',
      codeUsed: code,
    };
    await updateDoc(albumRef, {
      reviewCodes: arrayUnion(reviewCode),
      earlyAccessList: arrayUnion(earlyEntry),
    });
    // Update request status
    await updateDoc(doc(db, 'earlyAccessRequests', requestId), {
      status: 'GRANTED',
      generatedCode: code,
      respondedAt: now,
    });
    // Send code to requester via DM
    const roomId = await createChatRoom([user.uid, requesterId], 'PRIVATE');
    await sendMessage(roomId, {
      senderId: 'system',
      senderName: 'Plajah',
      senderPhoto: '',
      type: 'ACTION',
      text: `Your early access request was approved! Enter this code on the release page: ${code}`,
      metadata: { action: 'EARLY_ACCESS_CODE', url: albumId },
    });
    return code;
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, 'earlyAccessRequests');
    return null;
  }
};

export const denyEarlyAccessRequest = async (requestId: string): Promise<void> => {
  await updateDoc(doc(db, 'earlyAccessRequests', requestId), {
    status: 'DENIED',
    respondedAt: Date.now(),
  });
};

// ─── Stories ─────────────────────────────────────────────────────────────────
const STORIES_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const createStory = async (ownerId: string, data: Omit<Story, 'id' | 'ownerId' | 'timestamp' | 'expiresAt'>): Promise<string | null> => {
  try {
    const now = Date.now();
    const ref = doc(collection(db, 'stories'));
    const story: Story = { ...data, id: ref.id, ownerId, timestamp: now, expiresAt: now + STORIES_TTL_MS };
    await setDoc(ref, story);
    return ref.id;
  } catch (e) { console.error('createStory', e); return null; }
};

export const listenToFollowedStories = (followedUids: string[], callback: (stories: Story[]) => void) => {
  if (followedUids.length === 0) { callback([]); return () => {}; }
  const now = Date.now();
  const q = query(
    collection(db, 'stories'),
    where('ownerId', 'in', followedUids.slice(0, 30)),
    where('expiresAt', '>', now),
    orderBy('expiresAt'),
    orderBy('timestamp', 'desc'),
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => d.data() as Story)));
};

export const listenToUserStories = (uid: string, callback: (stories: Story[]) => void) => {
  const now = Date.now();
  const q = query(
    collection(db, 'stories'),
    where('ownerId', '==', uid),
    where('expiresAt', '>', now),
    orderBy('expiresAt'),
    orderBy('timestamp', 'desc'),
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => d.data() as Story)));
};

export const markStoryViewed = async (storyId: string, viewerId: string) => {
  try {
    await updateDoc(doc(db, 'stories', storyId), { viewerIds: arrayUnion(viewerId) });
  } catch (_) {}
};

export const deleteStory = async (storyId: string) => {
  try { await deleteDoc(doc(db, 'stories', storyId)); } catch (_) {}
};

export const uploadStoryMedia = async (file: File, ownerId: string): Promise<string | null> => {
  try {
    const path = `stories/${ownerId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch (e) { console.error('uploadStoryMedia', e); return null; }
};

// ─── CLUBS ────────────────────────────────────────────────────────────────────

export const createClub = async (data: Partial<Club>): Promise<Club | null> => {
  if (!auth.currentUser) return null;
  try {
    const docRef = doc(collection(db, 'clubs'));
    const now = Date.now();
    const club: Club = {
      id: docRef.id,
      name: data.name || 'Untitled Club',
      description: data.description || '',
      creatorId: auth.currentUser.uid,
      admins: [auth.currentUser.uid],
      moderators: [],
      category: data.category || 'General',
      tags: data.tags || [],
      isPrivate: data.isPrivate ?? false,
      joinProcess: data.joinProcess || 'AUTO',
      questionnaire: data.questionnaire,
      rules: data.rules,
      allowedAssetTypes: data.allowedAssetTypes || ['MUSIC', 'VIDEO', 'PHOTO', 'ARTICLE', 'BOOK', 'PLAYLIST', 'WORLD', 'LINK'],
      linksAllowed: data.linksAllowed ?? true,
      memberCount: 1,
      type: data.type || 'CLUB',
      coverImage: data.coverImage,
      iconImage: data.iconImage,
      customBackground: data.customBackground,
      customThemeId: data.customThemeId,
      customFont: data.customFont,
      hasLiveChat: data.hasLiveChat ?? true,
      hasMerchStore: data.hasMerchStore ?? false,
      hasExclusiveEvents: data.hasExclusiveEvents ?? true,
      monthlyPrice: data.monthlyPrice,
      yearlyPrice: data.yearlyPrice,
      charityGoal: data.charityGoal,
      charityRaised: data.charityRaised ?? 0,
      charityOrgName: data.charityOrgName,
      timestamp: now,
      updatedAt: now,
    };
    await setDoc(docRef, removeUndefined(club));
    const memberRef = doc(collection(db, 'clubMemberships'));
    await setDoc(memberRef, removeUndefined({
      id: memberRef.id,
      clubId: club.id,
      userId: auth.currentUser.uid,
      role: 'OWNER' as ClubRole,
      status: 'ACTIVE',
      displayName: auth.currentUser.displayName || 'Creator',
      photoUrl: auth.currentUser.photoURL || '',
      joinedAt: now,
    } as ClubMembership));
    return club;
  } catch (e: any) {
    console.error('createClub failed:', e);
    throw new Error(e?.message || 'Firestore write failed');
  }
};

export const updateClub = async (clubId: string, updates: Partial<Club>) => {
  await updateDoc(doc(db, 'clubs', clubId), { ...removeUndefined(updates), updatedAt: Date.now() });
};

export const deleteClub = async (clubId: string) => {
  await deleteDoc(doc(db, 'clubs', clubId));
};

export const fetchPublicClubs = async (category?: string): Promise<Club[]> => {
  // Avoid composite index requirement — filter/sort client-side
  const q = category && category !== 'All'
    ? query(collection(db, 'clubs'), where('isPrivate', '==', false), where('category', '==', category), limit(50))
    : query(collection(db, 'clubs'), where('isPrivate', '==', false), limit(50));
  const snap = await getDocs(q);
  const clubs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Club));
  return clubs.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
};

const DEMO_CLUBS: Omit<Club, 'id' | 'timestamp' | 'updatedAt'>[] = [
  {
    name: 'Plajah Music Collective',
    description: 'The premier community for music creators and fans on Plajah. Share tracks, collaborate on projects, and discover underground artists before they blow up. From bedroom producers to touring musicians — all genres welcome.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Music',
    tags: ['music', 'producers', 'artists', 'collaboration'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['MUSIC', 'VIDEO', 'PHOTO', 'PLAYLIST', 'LINK'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CLUB',
    hasLiveChat: true,
    hasMerchStore: true,
    hasExclusiveEvents: true,
    isDemo: true,
    coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&q=80',
    charityRaised: 0,
  },
  {
    name: 'Visual Artists United',
    description: 'A sanctuary for visual artists, illustrators, photographers, and digital creators. Share your work, give feedback, and connect with collectors and fans who appreciate the craft.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Art',
    tags: ['art', 'illustration', 'photography', 'digital', 'design'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['PHOTO', 'VIDEO', 'LINK', 'ARTICLE'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CLUB',
    hasLiveChat: true,
    hasMerchStore: true,
    hasExclusiveEvents: true,
    isDemo: true,
    coverImage: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=200&q=80',
    charityRaised: 0,
  },
  {
    name: 'Independent Film Society',
    description: 'Where independent filmmakers, cinematographers, and cinephiles unite. Screen your short films, discuss the craft, and find collaborators for your next project.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Film',
    tags: ['film', 'cinema', 'indie', 'screenwriting', 'directing'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['VIDEO', 'LINK', 'PHOTO', 'ARTICLE'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CLUB',
    hasLiveChat: true,
    hasMerchStore: false,
    hasExclusiveEvents: true,
    isDemo: true,
    coverImage: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=200&q=80',
    charityRaised: 0,
  },
  {
    name: 'Plajah Gaming League',
    description: 'Compete, stream, and connect with gamers across every platform and genre. Tournaments, live playthroughs, and community challenges. GG.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Gaming',
    tags: ['gaming', 'esports', 'streaming', 'tournaments', 'fps', 'rpg'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['VIDEO', 'LINK', 'PHOTO', 'ARTICLE'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CLUB',
    hasLiveChat: true,
    hasMerchStore: true,
    hasExclusiveEvents: true,
    isDemo: true,
    coverImage: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200&q=80',
    charityRaised: 0,
  },
  {
    name: 'The Literary Circle',
    description: 'For writers, poets, authors, and book lovers. Share chapters, get feedback, discuss literature, and find your next favorite read or writing partner.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Literature',
    tags: ['books', 'writing', 'poetry', 'authors', 'fiction'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['ARTICLE', 'BOOK', 'LINK', 'PHOTO'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CLUB',
    hasLiveChat: true,
    hasMerchStore: false,
    hasExclusiveEvents: true,
    isDemo: true,
    coverImage: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&q=80',
    charityRaised: 0,
  },
  {
    name: 'Tech Builders',
    description: 'Developers, designers, and digital makers building the future. Share side projects, discuss trends, collaborate on open source, and help each other ship.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Tech',
    tags: ['tech', 'coding', 'dev', 'ai', 'startups', 'design'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['LINK', 'ARTICLE', 'VIDEO', 'PHOTO'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CLUB',
    hasLiveChat: true,
    hasMerchStore: false,
    hasExclusiveEvents: true,
    isDemo: true,
    coverImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=200&q=80',
    charityRaised: 0,
  },
  {
    name: 'Global Sports Arena',
    description: 'All sports, all levels — from armchair fans to pro athletes. Live match reactions, highlights, fitness content, and sports debate from around the world.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Sports',
    tags: ['sports', 'fitness', 'football', 'basketball', 'soccer', 'athletics'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['VIDEO', 'PHOTO', 'LINK', 'ARTICLE'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CLUB',
    hasLiveChat: true,
    hasMerchStore: true,
    hasExclusiveEvents: true,
    isDemo: true,
    coverImage: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=200&q=80',
    charityRaised: 0,
  },
  {
    name: 'Lifestyle Creators Hub',
    description: 'Fashion, food, travel, wellness, and everything in between. Lifestyle creators sharing content, building brands, and connecting with an engaged audience.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Lifestyle',
    tags: ['lifestyle', 'fashion', 'food', 'travel', 'wellness', 'beauty'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['PHOTO', 'VIDEO', 'LINK', 'ARTICLE'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CLUB',
    hasLiveChat: true,
    hasMerchStore: true,
    hasExclusiveEvents: true,
    isDemo: true,
    coverImage: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=200&q=80',
    charityRaised: 0,
  },
  {
    name: 'Plajah Gives Back',
    description: 'A charity community raising funds and awareness for causes that matter. Every member, every post, every event moves the needle on real-world impact.',
    creatorId: '',
    admins: [],
    moderators: [],
    category: 'Charity',
    tags: ['charity', 'giving', 'community', 'nonprofit', 'impact'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['VIDEO', 'PHOTO', 'LINK', 'ARTICLE'],
    linksAllowed: true,
    memberCount: 0,
    type: 'CHARITY',
    hasLiveChat: true,
    hasMerchStore: false,
    hasExclusiveEvents: true,
    isDemo: true,
    charityGoal: 10000,
    charityRaised: 0,
    charityOrgName: 'Plajah Community Fund',
    coverImage: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=800&q=80',
    iconImage: 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=200&q=80',
  },
];

export const seedDemoClubs = async (): Promise<void> => {
  try {
    const existing = await getDocs(query(collection(db, 'clubs'), where('isDemo', '==', true), limit(1)));
    if (!existing.empty) return; // already seeded
    const now = Date.now();
    for (const club of DEMO_CLUBS) {
      const docRef = doc(collection(db, 'clubs'));
      await setDoc(docRef, removeUndefined({ ...club, id: docRef.id, timestamp: now, updatedAt: now }));
    }
  } catch (e) {
    console.warn('seedDemoClubs failed', e);
  }
};

export const claimClubAsFounder = async (clubId: string): Promise<boolean> => {
  if (!auth.currentUser) return false;
  try {
    const uid = auth.currentUser.uid;
    await updateDoc(doc(db, 'clubs', clubId), {
      creatorId: uid,
      admins: [uid],
      isDemo: false,
      updatedAt: Date.now(),
    });
    // Create an OWNER membership for the claimer
    const memberRef = doc(collection(db, 'clubMemberships'));
    await setDoc(memberRef, removeUndefined({
      id: memberRef.id,
      clubId,
      userId: uid,
      role: 'OWNER' as ClubRole,
      status: 'ACTIVE',
      displayName: auth.currentUser.displayName || 'Founder',
      photoUrl: auth.currentUser.photoURL || '',
      joinedAt: Date.now(),
    }));
    await updateDoc(doc(db, 'clubs', clubId), { memberCount: increment(1) });
    return true;
  } catch (e) {
    console.error('claimClubAsFounder', e);
    return false;
  }
};

export const fetchUserClubs = async (uid: string): Promise<Club[]> => {
  try {
    const q = query(collection(db, 'clubMemberships'), where('userId', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return [];
    const clubIds = snap.docs
      .filter(d => d.data().status === 'ACTIVE')
      .map(d => d.data().clubId as string);
    const clubs: Club[] = [];
    for (const cid of clubIds.slice(0, 10)) {
      const d = await getDoc(doc(db, 'clubs', cid));
      if (d.exists()) clubs.push({ id: d.id, ...d.data() } as Club);
    }
    return clubs;
  } catch (e) {
    console.error('fetchUserClubs failed:', e);
    return [];
  }
};

export const fetchClub = async (clubId: string): Promise<Club | null> => {
  const d = await getDoc(doc(db, 'clubs', clubId));
  return d.exists() ? ({ id: d.id, ...d.data() } as Club) : null;
};

export const getUserClubMembership = async (clubId: string, uid: string): Promise<ClubMembership | null> => {
  const q = query(collection(db, 'clubMemberships'), where('clubId', '==', clubId), where('userId', '==', uid));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as ClubMembership;
};

export const joinClub = async (clubId: string, role: ClubRole = 'MEMBER', answers?: string[]): Promise<ClubMembership | null> => {
  if (!auth.currentUser) return null;
  const club = await fetchClub(clubId);
  if (!club) return null;
  const existing = await getUserClubMembership(clubId, auth.currentUser.uid);
  if (existing) return existing;
  const memberRef = doc(collection(db, 'clubMemberships'));
  const status = club.joinProcess === 'AUTO' ? 'ACTIVE' : 'PENDING';
  const mem: ClubMembership = {
    id: memberRef.id,
    clubId,
    userId: auth.currentUser.uid,
    role,
    status,
    displayName: auth.currentUser.displayName || 'Member',
    photoUrl: auth.currentUser.photoURL || '',
    questionnaireAnswers: answers,
    joinedAt: Date.now(),
  };
  await setDoc(memberRef, removeUndefined(mem));
  if (status === 'ACTIVE') await updateDoc(doc(db, 'clubs', clubId), { memberCount: increment(1) });
  return mem;
};

export const leaveClub = async (clubId: string) => {
  if (!auth.currentUser) return;
  const mem = await getUserClubMembership(clubId, auth.currentUser.uid);
  if (!mem) return;
  await deleteDoc(doc(db, 'clubMemberships', mem.id));
  await updateDoc(doc(db, 'clubs', clubId), { memberCount: increment(-1) });
};

export const fetchClubMembers = async (clubId: string): Promise<ClubMembership[]> => {
  try {
    const q = query(collection(db, 'clubMemberships'), where('clubId', '==', clubId), limit(200));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ClubMembership))
      .filter(m => m.status === 'ACTIVE')
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  } catch (e) {
    console.error('[fetchClubMembers]', e);
    return [];
  }
};

export const updateMemberRole = async (membershipId: string, role: ClubRole) => {
  await updateDoc(doc(db, 'clubMemberships', membershipId), { role });
};

export const approveMember = async (membershipId: string, clubId: string) => {
  await updateDoc(doc(db, 'clubMemberships', membershipId), { status: 'ACTIVE' });
  await updateDoc(doc(db, 'clubs', clubId), { memberCount: increment(1) });
};

export const banMember = async (membershipId: string) => {
  await updateDoc(doc(db, 'clubMemberships', membershipId), { status: 'BANNED' });
};

// Club Posts
export const createClubPost = async (post: Partial<ClubPost>): Promise<ClubPost | null> => {
  if (!auth.currentUser) return null;
  const docRef = doc(collection(db, 'clubPosts'));
  const newPost: ClubPost = {
    id: docRef.id,
    clubId: post.clubId!,
    authorId: auth.currentUser.uid,
    authorName: auth.currentUser.displayName || 'Member',
    authorPhoto: auth.currentUser.photoURL || '',
    content: post.content || '',
    type: post.type || 'POST',
    attachments: post.attachments,
    likes: [],
    commentCount: 0,
    isPinned: post.isPinned ?? false,
    isBulletin: post.isBulletin ?? false,
    isNewArticle: post.isNewArticle ?? false,
    timestamp: Date.now(),
  };
  await setDoc(docRef, removeUndefined(newPost));
  return newPost;
};

export const listenToClubPosts = (clubId: string, callback: (posts: ClubPost[]) => void) => {
  const q = query(collection(db, 'clubPosts'), where('clubId', '==', clubId), limit(100));
  return onSnapshot(q, snap => {
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubPost));
    posts.sort((a, b) => {
      const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      return pinDiff !== 0 ? pinDiff : (b.timestamp || 0) - (a.timestamp || 0);
    });
    callback(posts);
  }, err => console.error('[listenToClubPosts]', err));
};

export const deleteClubPost = async (postId: string) => {
  await deleteDoc(doc(db, 'clubPosts', postId));
};

export const toggleClubPostLike = async (postId: string, uid: string, liked: boolean) => {
  await updateDoc(doc(db, 'clubPosts', postId), { likes: liked ? arrayRemove(uid) : arrayUnion(uid) });
};

export const pinClubPost = async (postId: string, pinned: boolean) => {
  await updateDoc(doc(db, 'clubPosts', postId), { isPinned: pinned });
};

// Club Gallery
export const addClubGalleryItem = async (item: Partial<ClubGalleryItem>): Promise<ClubGalleryItem | null> => {
  if (!auth.currentUser) return null;
  const docRef = doc(collection(db, 'clubGallery'));
  const newItem: ClubGalleryItem = {
    id: docRef.id,
    clubId: item.clubId!,
    uploaderId: auth.currentUser.uid,
    uploaderName: auth.currentUser.displayName || 'Member',
    uploaderPhoto: auth.currentUser.photoURL || '',
    type: item.type || 'PHOTO',
    url: item.url || '',
    thumbnailUrl: item.thumbnailUrl,
    title: item.title || '',
    description: item.description,
    assetId: item.assetId,
    likes: [],
    timestamp: Date.now(),
  };
  await setDoc(docRef, removeUndefined(newItem));
  return newItem;
};

export const fetchClubGallery = async (clubId: string): Promise<ClubGalleryItem[]> => {
  try {
    const q = query(collection(db, 'clubGallery'), where('clubId', '==', clubId), limit(60));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ClubGalleryItem))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (e) {
    console.error('[fetchClubGallery]', e);
    return [];
  }
};

export const deleteClubGalleryItem = async (itemId: string) => {
  await deleteDoc(doc(db, 'clubGallery', itemId));
};

// ── Club Events ───────────────────────────────────────────────────────────────

export const createClubEvent = async (
  // Accept the `eventType`/`date` aliases some callers (e.g. MovieUXView) use, plus the content-link
  // fields — previously these were silently dropped, so a scheduled movie watch party lost its date,
  // its linked movie, and defaulted to type LIVE_TALK.
  event: Partial<ClubEvent> & { eventType?: ClubEvent['type']; date?: number; rsvps?: string[] },
): Promise<ClubEvent | null> => {
  if (!auth.currentUser) return null;
  const docRef = doc(collection(db, 'clubEvents'));
  const newEvent: ClubEvent = {
    id: docRef.id,
    clubId: event.clubId!,
    hostId: auth.currentUser.uid,
    title: event.title || 'Untitled Event',
    description: event.description,
    type: event.type || event.eventType || 'LIVE_TALK',
    scheduledAt: event.scheduledAt || event.date || Date.now(),
    isExclusive: event.isExclusive ?? false,
    isActive: false,
    attendeeIds: event.rsvps || [],
    linkedContentId: event.linkedContentId,
    linkedContentTitle: event.linkedContentTitle,
    linkedContentThumb: event.linkedContentThumb,
    isVirtual: event.isVirtual,
    partyId: event.partyId,
    timestamp: Date.now(),
  };
  await setDoc(docRef, removeUndefined(newEvent));
  return newEvent;
};

export const fetchClubEvents = async (clubId: string): Promise<ClubEvent[]> => {
  try {
    const q = query(collection(db, 'clubEvents'), where('clubId', '==', clubId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ClubEvent))
      .sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'clubEvents');
    return [];
  }
};

export const deleteClubEvent = async (eventId: string): Promise<void> => {
  await deleteDoc(doc(db, 'clubEvents', eventId));
};

export const rsvpClubEvent = async (eventId: string, uid: string, attending: boolean): Promise<void> => {
  const ref = doc(db, 'clubEvents', eventId);
  await updateDoc(ref, {
    attendeeIds: attending ? arrayUnion(uid) : arrayRemove(uid),
  });
};

// Club Chat
export const sendClubChatMessage = async (clubId: string, content: string): Promise<void> => {
  if (!auth.currentUser) return;
  const docRef = doc(collection(db, 'clubChat'));
  await setDoc(docRef, removeUndefined({
    id: docRef.id,
    clubId,
    senderId: auth.currentUser.uid,
    senderName: auth.currentUser.displayName || 'Member',
    senderPhoto: auth.currentUser.photoURL || '',
    content,
    isSticky: false,
    timestamp: Date.now(),
  } as ClubChatMessage));
};

export const listenToClubChat = (clubId: string, callback: (msgs: ClubChatMessage[]) => void) => {
  const q = query(collection(db, 'clubChat'), where('clubId', '==', clubId), limit(200));
  return onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubChatMessage));
    msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    callback(msgs);
  }, err => console.error('[listenToClubChat]', err));
};

export const deleteClubChatMessage = async (msgId: string) => {
  await deleteDoc(doc(db, 'clubChat', msgId));
};

export const stickyClubChatMessage = async (msgId: string, sticky: boolean) => {
  await updateDoc(doc(db, 'clubChat', msgId), { isSticky: sticky });
};

export const uploadClubImage = async (file: File, clubId: string, type: 'cover' | 'icon'): Promise<string | null> => {
  try {
    const path = `clubs/${clubId}/${type}_${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch (e) { console.error('uploadClubImage', e); return null; }
};

// ── DISCUSSION FORUM ──────────────────────────────────────────────────────────

export const createDiscussionAlias = async (name: string, avatar?: string, bio?: string) => {
  if (!auth.currentUser) return null;
  const docRef = doc(collection(db, 'discussionAliases'));
  const alias = { id: docRef.id, userId: auth.currentUser.uid, name, avatar: avatar || '', bio: bio || '', timestamp: Date.now() };
  await setDoc(docRef, alias);
  return alias;
};

export const fetchMyDiscussionAliases = async () => {
  if (!auth.currentUser) return [];
  try {
    const q = query(collection(db, 'discussionAliases'), where('userId', '==', auth.currentUser.uid), limit(50));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)) as any[];
  } catch (e) {
    console.error('[fetchMyDiscussionAliases]', e);
    return [];
  }
};

export const fetchDiscussionBoards = async () => {
  try {
    const q = query(collection(db, 'discussionBoards'), limit(50));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.memberCount || 0) - (a.memberCount || 0)) as any[];
  } catch (e) {
    console.error('[fetchDiscussionBoards]', e);
    return [];
  }
};

export const createDiscussionBoard = async (name: string, description: string, tags: string[] = []) => {
  if (!auth.currentUser) return null;
  const docRef = doc(collection(db, 'discussionBoards'));
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const board = { id: docRef.id, name, slug, description, tags, creatorId: auth.currentUser.uid, memberCount: 1, postCount: 0, isNSFW: false, timestamp: Date.now() };
  await setDoc(docRef, board);
  return board;
};

export const fetchDiscussionPosts = async (boardId?: string, sortBy: 'hot' | 'new' | 'top' = 'hot') => {
  try {
    const q = boardId
      ? query(collection(db, 'discussionPosts'), where('boardId', '==', boardId), limit(100))
      : query(collection(db, 'discussionPosts'), limit(100));
    const snap = await getDocs(q);
    const posts = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as any[];
    if (sortBy === 'new') posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    else posts.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    return posts;
  } catch (e) {
    console.error('[fetchDiscussionPosts]', e);
    return [];
  }
};

export const createDiscussionPost = async (data: { boardId: string; boardName: string; title: string; body: string; aliasId?: string; displayName: string; displayPhoto?: string; isAnonymous: boolean; linkUrl?: string; imageUrls?: string[]; flair?: string }) => {
  if (!auth.currentUser) return null;
  const docRef = doc(collection(db, 'discussionPosts'));
  const post = {
    id: docRef.id, ...data,
    authorId: auth.currentUser.uid,
    upvotes: 0, downvotes: 0, commentCount: 0, isPinned: false,
    timestamp: Date.now(),
  };
  await setDoc(docRef, removeUndefined(post));
  try { await updateDoc(doc(db, 'discussionBoards', data.boardId), { postCount: increment(1) }); } catch {}
  return post;
};

export const voteDiscussionPost = async (postId: string, value: 1 | -1) => {
  if (!auth.currentUser) return;
  const voteId = `${auth.currentUser.uid}_post_${postId}`;
  const voteRef = doc(db, 'discussionVotes', voteId);
  const existing = await getDoc(voteRef);
  const postRef = doc(db, 'discussionPosts', postId);
  if (existing.exists() && existing.data().value === value) {
    await deleteDoc(voteRef);
    await updateDoc(postRef, { [value === 1 ? 'upvotes' : 'downvotes']: increment(-1) });
  } else {
    if (existing.exists()) {
      await updateDoc(postRef, { [existing.data().value === 1 ? 'upvotes' : 'downvotes']: increment(-1) });
    }
    await setDoc(voteRef, { id: voteId, userId: auth.currentUser.uid, targetId: postId, targetType: 'POST', value, timestamp: Date.now() });
    await updateDoc(postRef, { [value === 1 ? 'upvotes' : 'downvotes']: increment(1) });
  }
};

export const deleteDiscussionPost = async (postId: string) => {
  await deleteDoc(doc(db, 'discussionPosts', postId));
};

export const fetchDiscussionComments = async (postId: string) => {
  try {
    const q = query(collection(db, 'discussionComments'), where('postId', '==', postId), limit(200));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0)) as any[];
  } catch (e) {
    console.error('[fetchDiscussionComments]', e);
    return [];
  }
};

export const createDiscussionComment = async (data: { postId: string; body: string; parentCommentId?: string; aliasId?: string; displayName: string; displayPhoto?: string; isAnonymous: boolean; depth: number }) => {
  if (!auth.currentUser) return null;
  try {
    const docRef = doc(collection(db, 'discussionComments'));
    const comment = {
      id: docRef.id, ...data,
      authorId: auth.currentUser.uid,
      upvotes: 0, downvotes: 0, replyCount: 0,
      timestamp: Date.now(),
    };
    await setDoc(docRef, removeUndefined(comment));
    try { await updateDoc(doc(db, 'discussionPosts', data.postId), { commentCount: increment(1) }); } catch {}
    if (data.parentCommentId) {
      try { await updateDoc(doc(db, 'discussionComments', data.parentCommentId), { replyCount: increment(1) }); } catch {}
    }
    return comment;
  } catch (e) {
    console.error('[createDiscussionComment]', e);
    return null;
  }
};

export const voteDiscussionComment = async (commentId: string, value: 1 | -1) => {
  if (!auth.currentUser) return;
  const voteId = `${auth.currentUser.uid}_comment_${commentId}`;
  const voteRef = doc(db, 'discussionVotes', voteId);
  const existing = await getDoc(voteRef);
  const commentRef = doc(db, 'discussionComments', commentId);
  if (existing.exists() && existing.data().value === value) {
    await deleteDoc(voteRef);
    await updateDoc(commentRef, { [value === 1 ? 'upvotes' : 'downvotes']: increment(-1) });
  } else {
    if (existing.exists()) {
      await updateDoc(commentRef, { [existing.data().value === 1 ? 'upvotes' : 'downvotes']: increment(-1) });
    }
    await setDoc(voteRef, { id: voteId, userId: auth.currentUser.uid, targetId: commentId, targetType: 'COMMENT', value, timestamp: Date.now() });
    await updateDoc(commentRef, { [value === 1 ? 'upvotes' : 'downvotes']: increment(1) });
  }
};

// ── Club Invite Links ──────────────────────────────────────────────────────────

export const generateClubInviteToken = async (clubId: string): Promise<string> => {
  const token = Math.random().toString(36).slice(2, 10).toUpperCase();
  await updateDoc(doc(db, 'clubs', clubId), { inviteToken: token });
  return token;
};

export const joinClubByInviteToken = async (clubId: string, token: string): Promise<boolean> => {
  if (!auth.currentUser) return false;
  const clubDoc = await getDoc(doc(db, 'clubs', clubId));
  if (!clubDoc.exists()) return false;
  const club = clubDoc.data() as any;
  if (club.inviteToken !== token) return false;
  await joinClub(clubId, 'MEMBER');
  return true;
};

// ── Club Channels ─────────────────────────────────────────────────────────────

export const addClubChannel = async (clubId: string, channel: { name: string; type: string; description?: string; isReadOnly?: boolean }): Promise<void> => {
  const newChannel = { id: `ch_${Date.now()}`, ...channel, createdAt: Date.now() };
  const clubDoc = await getDoc(doc(db, 'clubs', clubId));
  const existing: any[] = clubDoc.data()?.channels ?? [];
  await updateDoc(doc(db, 'clubs', clubId), { channels: [...existing, newChannel] });
};

export const deleteClubChannel = async (clubId: string, channelId: string): Promise<void> => {
  const clubDoc = await getDoc(doc(db, 'clubs', clubId));
  const channels: any[] = (clubDoc.data()?.channels ?? []).filter((c: any) => c.id !== channelId);
  await updateDoc(doc(db, 'clubs', clubId), { channels });
};

// ── Club Analytics ────────────────────────────────────────────────────────────

export const fetchClubAnalytics = async (clubId: string) => {
  try {
    const [postsSnap, membersSnap, eventsSnap] = await Promise.all([
      getDocs(query(collection(db, 'clubPosts'), where('clubId', '==', clubId), limit(200))),
      getDocs(query(collection(db, 'clubMemberships'), where('clubId', '==', clubId))),
      getDocs(query(collection(db, 'clubEvents'), where('clubId', '==', clubId))),
    ]);
    const posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const members = membersSnap.docs.map(d => d.data() as any);
    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    return { posts, members, events };
  } catch (e) {
    console.error('[fetchClubAnalytics]', e);
    return { posts: [], members: [], events: [] };
  }
};

// ── Discussion real-time listeners ────────────────────────────────────────────

export const listenToDiscussionPosts = (boardId: string | null, callback: (posts: any[]) => void) => {
  const q = boardId
    ? query(collection(db, 'discussionPosts'), where('boardId', '==', boardId), limit(100))
    : query(collection(db, 'discussionPosts'), limit(100));
  return onSnapshot(q, snap => {
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    posts.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    callback(posts);
  }, err => console.error('[listenToDiscussionPosts]', err));
};

export const listenToDiscussionComments = (postId: string, callback: (comments: any[]) => void) => {
  const q = query(collection(db, 'discussionComments'), where('postId', '==', postId), limit(200));
  return onSnapshot(q, snap => {
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    comments.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    callback(comments);
  }, err => console.error('[listenToDiscussionComments]', err));
};

// ── Discussion moderation ─────────────────────────────────────────────────────

export const reportDiscussionPost = async (postId: string): Promise<void> => {
  if (!auth.currentUser) return;
  await updateDoc(doc(db, 'discussionPosts', postId), {
    reportedBy: arrayUnion(auth.currentUser.uid),
  });
};

export const reportDiscussionComment = async (commentId: string): Promise<void> => {
  if (!auth.currentUser) return;
  await updateDoc(doc(db, 'discussionComments', commentId), {
    reportedBy: arrayUnion(auth.currentUser.uid),
  });
};

export const removeDiscussionPost = async (postId: string, reason?: string): Promise<void> => {
  await updateDoc(doc(db, 'discussionPosts', postId), {
    isRemoved: true,
    removedReason: reason ?? 'Removed by moderator',
    body: '[removed]',
  });
};

export const removeDiscussionComment = async (commentId: string): Promise<void> => {
  await updateDoc(doc(db, 'discussionComments', commentId), {
    isRemoved: true,
    body: '[removed]',
  });
};

export const deleteDiscussionComment = async (commentId: string): Promise<void> => {
  await deleteDoc(doc(db, 'discussionComments', commentId));
};

export const pinDiscussionPost = async (postId: string, pinned: boolean): Promise<void> => {
  await updateDoc(doc(db, 'discussionPosts', postId), { isPinned: pinned });
};

export const fetchReportedDiscussionContent = async (boardId: string) => {
  try {
    const [postsSnap, commentsSnap] = await Promise.all([
      getDocs(query(collection(db, 'discussionPosts'), where('boardId', '==', boardId))),
      getDocs(query(collection(db, 'discussionComments'))),
    ]);
    const posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      .filter(p => (p.reportedBy?.length ?? 0) > 0 && !p.isRemoved);
    return { reportedPosts: posts };
  } catch (e) {
    return { reportedPosts: [] };
  }
};

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  id: string;
  title: string;
  type: 'VIDEO' | 'ALBUM';
  thumbnailUrl?: string;
  genre?: string;
  addedAt: number;
}

export const addToWatchlist = async (item: Omit<WatchlistItem, 'addedAt'>): Promise<void> => {
  if (!auth.currentUser) return;
  const ref = doc(db, 'users', auth.currentUser.uid, 'watchlist', item.id);
  await setDoc(ref, { ...item, addedAt: Date.now() });
};

export const removeFromWatchlist = async (itemId: string): Promise<void> => {
  if (!auth.currentUser) return;
  await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'watchlist', itemId));
};

export const fetchWatchlist = async (): Promise<WatchlistItem[]> => {
  if (!auth.currentUser) return [];
  try {
    const snap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'watchlist'));
    return snap.docs.map(d => d.data() as WatchlistItem).sort((a, b) => b.addedAt - a.addedAt);
  } catch { return []; }
};

export const isInWatchlist = async (itemId: string): Promise<boolean> => {
  if (!auth.currentUser) return false;
  try {
    const d = await getDoc(doc(db, 'users', auth.currentUser.uid, 'watchlist', itemId));
    return d.exists();
  } catch { return false; }
};

// ── Discussion posts linked to content ────────────────────────────────────────

export const fetchDiscussionPostsByContentId = async (contentId: string): Promise<any[]> => {
  try {
    const q = query(collection(db, 'discussionPosts'), where('linkedContentId', '==', contentId), limit(10));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.upvotes || 0) - (a.upvotes || 0));
  } catch { return []; }
};

// ── Club membership Stripe checkout ───────────────────────────────────────────

export const startClubMembershipCheckout = async (
  clubId: string,
  clubName: string,
  monthlyPrice: number,
  userIdToken: string,
): Promise<void> => {
  const res = await fetch('/api/stripe/club-membership', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userIdToken}` },
    body: JSON.stringify({ clubId, clubName, monthlyPrice }),
  });
  if (!res.ok) throw new Error('Failed to create club membership checkout');
  const { url } = await res.json();
  if (url) window.location.href = url;
};

// ─── EVENTS & TICKETING ───────────────────────────────────────────────────────

export const createOrUpdateEvent = async (event: any): Promise<string> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save event'); }
  const d = await res.json();
  return d.id;
};

export const fetchEvent = async (eventId: string): Promise<any> => {
  const res = await fetch(`/api/events/${eventId}`);
  if (!res.ok) return null;
  return res.json();
};

export const fetchPublicEvents = async (): Promise<any[]> => {
  const res = await fetch('/api/events/list');
  if (!res.ok) return [];
  const d = await res.json();
  return d.events ?? [];
};

export const fetchCreatorEvents = async (uid: string): Promise<any[]> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/events/creator/${uid}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return [];
  const d = await res.json();
  return d.events ?? [];
};

export const purchaseTickets = async (params: {
  eventId: string; tierId: string; quantity: number;
  holderName: string; holderEmail: string;
  physicalRequested?: boolean; customPackagingRequested?: boolean;
  shippingAddress?: any; promoCode?: string;
}): Promise<{ url: string }> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/events/${params.eventId}/tickets/purchase`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to initiate purchase'); }
  return res.json();
};

export const fetchMyTickets = async (): Promise<any[]> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return [];
  const d = await res.json();
  return d.tickets ?? [];
};

export const fetchTicket = async (ticketId: string): Promise<any> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/tickets/${ticketId}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return null;
  return res.json();
};

export const validateTicket = async (ticketId: string): Promise<{ valid: boolean; holderName?: string; tierName?: string; reason?: string }> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/tickets/${ticketId}/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return { valid: false, reason: 'Server error' };
  return res.json();
};

export const fetchEventAttendees = async (eventId: string): Promise<any[]> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/events/${eventId}/attendees`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return [];
  const d = await res.json();
  return d.attendees ?? [];
};

export const printTicket = async (ticketId: string, printerId: string, printNodeApiKey?: string, copies = 1): Promise<{ success: boolean; printJobId?: number }> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/tickets/${ticketId}/print`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ printerId, printNodeApiKey, copies }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Print failed'); }
  return res.json();
};

export const startKioskSession = async (eventId: string, deviceLabel?: string): Promise<string> => {
  const idToken = await getRequiredIdToken();
  const res = await fetch(`/api/events/${eventId}/kiosk/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceLabel }),
  });
  if (!res.ok) throw new Error('Failed to start kiosk session');
  const d = await res.json();
  return d.sessionId;
};

// ── Podcast RSS Settings ──────────────────────────────────────────────────────

export const savePodcastRssSettings = async (settings: Partial<PodcastRssSettings>): Promise<void> => {
  if (!auth.currentUser) return;
  try {
    await updateDoc(doc(db, 'users', auth.currentUser.uid), { podcastRss: settings });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `users/${auth.currentUser.uid}`);
  }
};

export const fetchPodcastRssSettings = async (uid?: string): Promise<PodcastRssSettings | null> => {
  const targetUid = uid ?? auth.currentUser?.uid;
  if (!targetUid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', targetUid));
    return (snap.data()?.podcastRss as PodcastRssSettings) ?? null;
  } catch {
    return null;
  }
};

export const syncImportedEpisodes = async (episodes: ImportedRssEpisode[]): Promise<void> => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const colRef = collection(db, 'podcastImports', uid, 'episodes');
  // Write episodes in batches of 500 (Firestore limit)
  const chunks: ImportedRssEpisode[][] = [];
  for (let i = 0; i < episodes.length; i += 500) {
    chunks.push(episodes.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(ep => {
      const safeId = ep.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `ep_${Date.now()}`;
      batch.set(doc(colRef, safeId), ep, { merge: true });
    });
    await batch.commit();
  }
  await updateDoc(doc(db, 'users', uid), {
    'podcastRss.lastSynced': Date.now(),
    'podcastRss.importedEpisodeCount': episodes.length,
  });
};

export const backfillMyAlbumArtistIds = async (): Promise<number> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;
  const snap = await getDocs(query(collection(db, 'albums'), where('ownerId', '==', uid)));
  let fixed = 0;
  for (const albumDoc of snap.docs) {
    const tracks: any[] = albumDoc.data().tracks ?? [];
    if (!tracks.some(t => !t.artistId)) continue;
    const updatedTracks = tracks.map(t => t.artistId ? t : { ...t, artistId: uid });
    await updateDoc(albumDoc.ref, { tracks: updatedTracks });
    fixed++;
  }
  return fixed;
};

export const fetchImportedEpisodes = async (uid: string): Promise<ImportedRssEpisode[]> => {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'podcastImports', uid, 'episodes'),
        orderBy('pubDate', 'desc'),
        limit(200)
      )
    );
    return snap.docs.map(d => d.data() as ImportedRssEpisode);
  } catch {
    return [];
  }
};
