import { db, auth } from './backendService';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp,
  updateDoc,
  increment,
  onSnapshot as rawOnSnapshot
} from 'firebase/firestore';

// ── Types ──

export type PresetCategory =
  | 'slide'           // Full slide templates
  | 'lower_third'     // Lower third graphics
  | 'title'           // Title cards
  | 'background'      // Background images/videos/generators
  | 'overlay'         // Overlay graphics (clocks, logos, watermarks)
  | 'scripture'       // Scripture display templates
  | 'worship_lyric'   // Worship lyric layouts
  | 'announcement'    // Announcement templates
  | 'countdown'       // Countdown timer templates
  | 'social_wall'     // Social media wall layouts
  | 'signage'         // Digital signage templates
  | 'transition'      // Transition effects
  | 'theme'           // Complete theme packages
  | 'custom';         // User-created custom presets

export type PresetScope = 'platform' | 'organization' | 'personal';

export interface PresetTemplate {
  id: string;
  title: string;
  description?: string;
  category: PresetCategory;
  scope: PresetScope;
  
  // Creator info
  createdBy: string;       // uid
  createdByName?: string;
  orgId?: string;          // organization ID if org-scoped
  
  // Visual
  thumbnailUrl?: string;
  previewUrl?: string;     // animated preview or video
  
  // Template data — the actual content
  templateData: {
    // For slides: slide JSON, layers, text, backgrounds
    layers?: Array<{
      type: string;        // 'text' | 'image' | 'video' | 'shape' | 'generator'
      content?: string;
      style?: Record<string, any>;
      position?: { x: number; y: number; width: number; height: number };
      animation?: Record<string, any>;
    }>;
    // Background settings
    background?: {
      type: 'solid' | 'gradient' | 'image' | 'video' | 'generator';
      value: string;       // color, URL, or generator ID
      opacity?: number;
    };
    // Text styling defaults
    textStyle?: {
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: string;
      color?: string;
      textAlign?: string;
      textShadow?: string;
      lineHeight?: number;
    };
    // Transition
    transition?: {
      type: string;        // 'fade' | 'slide' | 'zoom' | 'wipe' | 'dissolve'
      duration: number;    // ms
      easing?: string;
    };
    // Resolution
    width?: number;
    height?: number;
    aspectRatio?: string;
    // Raw JSON for complex templates
    raw?: Record<string, any>;
  };
  
  // Tags for search/filter
  tags: string[];
  
  // Usage stats
  usageCount: number;
  favoriteCount: number;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  version: number;
  
  // Compatibility
  compatibleWith: ('ambo' | 'pixels' | 'tela')[];
}

export interface PresetCollection {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  presetIds: string[];
  scope: PresetScope;
  createdBy: string;
  orgId?: string;
  createdAt: number;
}

// ── Firestore Collections ──
const PRESETS_COL = 'preset_templates';
const COLLECTIONS_COL = 'preset_collections';

// ── CRUD Operations ──

export async function savePreset(preset: Omit<PresetTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'usageCount' | 'favoriteCount'>): Promise<string> {
  const user = auth.currentUser;
  if (!user && preset.scope !== 'platform') {
    throw new Error('Must be logged in to save presets');
  }
  
  const presetRef = doc(collection(db, PRESETS_COL));
  const now = Date.now();
  const newPreset: PresetTemplate = {
    ...preset,
    id: presetRef.id,
    usageCount: 0,
    favoriteCount: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(presetRef, newPreset);
  return presetRef.id;
}

export async function getPreset(id: string): Promise<PresetTemplate | null> {
  const docRef = doc(db, PRESETS_COL, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as PresetTemplate;
  }
  return null;
}

export async function deletePreset(id: string): Promise<void> {
  const docRef = doc(db, PRESETS_COL, id);
  await deleteDoc(docRef);
}

export async function updatePreset(id: string, updates: Partial<PresetTemplate>): Promise<void> {
  const docRef = doc(db, PRESETS_COL, id);
  const data = { ...updates, updatedAt: Date.now() };
  await updateDoc(docRef, data);
}

// ── Query Operations ──

export async function getPlatformPresets(category?: PresetCategory, limitCount: number = 50): Promise<PresetTemplate[]> {
  const colRef = collection(db, PRESETS_COL);
  const constraints: any[] = [where('scope', '==', 'platform')];
  if (category) constraints.push(where('category', '==', category));
  constraints.push(orderBy('usageCount', 'desc'), limit(limitCount));
  
  const q = query(colRef, ...constraints);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as PresetTemplate);
}

export async function getOrgPresets(orgId: string, category?: PresetCategory): Promise<PresetTemplate[]> {
  const colRef = collection(db, PRESETS_COL);
  const constraints: any[] = [where('scope', '==', 'organization'), where('orgId', '==', orgId)];
  if (category) constraints.push(where('category', '==', category));
  constraints.push(orderBy('updatedAt', 'desc'));
  
  const q = query(colRef, ...constraints);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as PresetTemplate);
}

export async function getPersonalPresets(category?: PresetCategory): Promise<PresetTemplate[]> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be logged in');

  const colRef = collection(db, PRESETS_COL);
  const constraints: any[] = [where('scope', '==', 'personal'), where('createdBy', '==', user.uid)];
  if (category) constraints.push(where('category', '==', category));
  constraints.push(orderBy('updatedAt', 'desc'));
  
  const q = query(colRef, ...constraints);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as PresetTemplate);
}

export async function searchPresets(searchQuery: string, scope?: PresetScope, category?: PresetCategory): Promise<PresetTemplate[]> {
  const colRef = collection(db, PRESETS_COL);
  const constraints: any[] = [];
  
  if (scope) constraints.push(where('scope', '==', scope));
  if (category) constraints.push(where('category', '==', category));
  
  const searchTerm = searchQuery.toLowerCase().trim();
  if (searchTerm) {
    constraints.push(where('tags', 'array-contains', searchTerm));
  }
  
  const q = query(colRef, ...constraints);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as PresetTemplate);
}

export async function getPopularPresets(category?: PresetCategory, limitCount: number = 10): Promise<PresetTemplate[]> {
  const colRef = collection(db, PRESETS_COL);
  const constraints: any[] = [];
  if (category) constraints.push(where('category', '==', category));
  constraints.push(orderBy('usageCount', 'desc'), limit(limitCount));
  
  const q = query(colRef, ...constraints);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as PresetTemplate);
}

// ── Real-time Listeners ──

export function listenToPresets(
  scope: PresetScope,
  category: PresetCategory | null,
  callback: (presets: PresetTemplate[]) => void,
  orgId?: string
): () => void {
  const colRef = collection(db, PRESETS_COL);
  const constraints: any[] = [where('scope', '==', scope)];
  
  if (category) constraints.push(where('category', '==', category));
  if (scope === 'organization' && orgId) constraints.push(where('orgId', '==', orgId));
  if (scope === 'personal') {
    const user = auth.currentUser;
    if (user) constraints.push(where('createdBy', '==', user.uid));
  }
  
  const q = query(colRef, ...constraints);
  return rawOnSnapshot(q, (snapshot) => {
    const presets = snapshot.docs.map(doc => doc.data() as PresetTemplate);
    callback(presets);
  });
}

// ── Collections ──

export async function saveCollection(presetCollection: Omit<PresetCollection, 'id' | 'createdAt'>): Promise<string> {
  const colRef = doc(collection(db, COLLECTIONS_COL));
  const newCol: PresetCollection = {
    ...presetCollection,
    id: colRef.id,
    createdAt: Date.now()
  };
  await setDoc(colRef, newCol);
  return colRef.id;
}

export async function getCollections(scope: PresetScope, orgId?: string): Promise<PresetCollection[]> {
  const colRef = collection(db, COLLECTIONS_COL);
  const constraints: any[] = [where('scope', '==', scope)];
  
  if (scope === 'organization' && orgId) constraints.push(where('orgId', '==', orgId));
  if (scope === 'personal') {
    const user = auth.currentUser;
    if (user) constraints.push(where('createdBy', '==', user.uid));
  }
  
  const q = query(colRef, ...constraints);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as PresetCollection);
}

export async function deleteCollection(id: string): Promise<void> {
  const docRef = doc(db, COLLECTIONS_COL, id);
  await deleteDoc(docRef);
}

// ── Usage Tracking ──

export async function trackPresetUsage(presetId: string): Promise<void> {
  const docRef = doc(db, PRESETS_COL, presetId);
  await updateDoc(docRef, { usageCount: increment(1) });
}

export async function togglePresetFavorite(presetId: string): Promise<boolean> {
  const docRef = doc(db, PRESETS_COL, presetId);
  await updateDoc(docRef, { favoriteCount: increment(1) });
  return true;
}

// ── Built-in Platform Presets ──

export function getBuiltInPresets(): PresetTemplate[] {
  const now = Date.now();
  
  const presets: PresetTemplate[] = [
    // Slide Templates
    {
      id: 'platform_slide_worship_modern',
      title: 'Modern Worship',
      description: 'Clean modern worship slide with subtle blurred background',
      category: 'slide',
      scope: 'platform',
      createdBy: 'system',
      tags: ['worship', 'modern', 'clean', 'lyrics'],
      usageCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      compatibleWith: ['ambo', 'pixels'],
      templateData: {
        background: { type: 'generator', value: 'blurred-waves', opacity: 1 },
        textStyle: { fontFamily: 'Inter', fontSize: 72, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', textShadow: '0 4px 12px rgba(0,0,0,0.5)' },
        transition: { type: 'dissolve', duration: 300 },
        layers: [
          { type: 'text', content: 'Worship Lyrics', position: { x: 10, y: 30, width: 80, height: 40 } }
        ]
      }
    },
    {
      id: 'platform_slide_corporate',
      title: 'Corporate Presentation',
      description: 'Professional layout for business presentations',
      category: 'slide',
      scope: 'platform',
      createdBy: 'system',
      tags: ['business', 'corporate', 'presentation'],
      usageCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      compatibleWith: ['ambo', 'pixels'],
      templateData: {
        background: { type: 'solid', value: '#F5F5F5', opacity: 1 },
        textStyle: { fontFamily: 'Roboto', fontSize: 48, fontWeight: '400', color: '#333333', textAlign: 'left' },
        transition: { type: 'slide', duration: 400 },
        layers: [
          { type: 'text', content: 'Title Here', style: { fontSize: 64, fontWeight: '700' }, position: { x: 5, y: 10, width: 90, height: 15 } },
          { type: 'text', content: 'Bullet points here...', position: { x: 5, y: 30, width: 90, height: 60 } }
        ]
      }
    },
    {
      id: 'platform_slide_cinematic',
      title: 'Cinematic Title',
      description: 'Dramatic bold title slide with dark background',
      category: 'slide',
      scope: 'platform',
      createdBy: 'system',
      tags: ['cinematic', 'title', 'dark', 'bold'],
      usageCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      compatibleWith: ['ambo', 'pixels'],
      templateData: {
        background: { type: 'image', value: 'url-to-dark-cinematic-bg', opacity: 0.8 },
        textStyle: { fontFamily: 'Montserrat', fontSize: 96, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', textShadow: '0 10px 20px rgba(0,0,0,0.8)' },
        transition: { type: 'fade', duration: 800 },
        layers: [
          { type: 'text', content: 'MAIN TITLE', position: { x: 0, y: 40, width: 100, height: 20 } }
        ]
      }
    },

    // Lower Thirds
    {
      id: 'platform_lower_third_news',
      title: 'News Ticker Lower Third',
      description: 'Professional news style lower third with primary and secondary text',
      category: 'lower_third',
      scope: 'platform',
      createdBy: 'system',
      tags: ['news', 'lower-third', 'broadcast'],
      usageCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      compatibleWith: ['ambo', 'pixels'],
      templateData: {
        layers: [
          { type: 'shape', style: { backgroundColor: '#003366' }, position: { x: 5, y: 80, width: 50, height: 10 } },
          { type: 'shape', style: { backgroundColor: '#FFCC00' }, position: { x: 5, y: 90, width: 50, height: 5 } },
          { type: 'text', content: 'JOHN DOE', style: { fontFamily: 'Arial', color: '#FFF', fontSize: 32, fontWeight: 'bold' }, position: { x: 7, y: 82, width: 46, height: 6 } },
          { type: 'text', content: 'Guest Speaker', style: { fontFamily: 'Arial', color: '#000', fontSize: 24 }, position: { x: 7, y: 91, width: 46, height: 4 } }
        ],
        transition: { type: 'slide', duration: 500 }
      }
    },
    
    // Background Generators
    {
      id: 'platform_bg_gradient_mesh',
      title: 'Gradient Mesh',
      description: 'Animated colorful gradient mesh',
      category: 'background',
      scope: 'platform',
      createdBy: 'system',
      tags: ['background', 'gradient', 'animated', 'colorful'],
      usageCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      compatibleWith: ['ambo', 'pixels'],
      templateData: {
        background: { type: 'generator', value: 'gradient-mesh-v1', opacity: 1 }
      }
    },

    // Scripture Display
    {
      id: 'platform_scripture_classic',
      title: 'Classic Scripture',
      description: 'Traditional scripture reading layout with reference at bottom',
      category: 'scripture',
      scope: 'platform',
      createdBy: 'system',
      tags: ['bible', 'scripture', 'reading', 'classic'],
      usageCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      compatibleWith: ['ambo', 'pixels'],
      templateData: {
        background: { type: 'image', value: 'url-to-parchment-bg', opacity: 1 },
        textStyle: { fontFamily: 'Georgia', fontSize: 56, fontWeight: 'normal', color: '#222222', textAlign: 'left', lineHeight: 1.4 },
        transition: { type: 'dissolve', duration: 400 },
        layers: [
          { type: 'text', content: '"In the beginning..."', position: { x: 10, y: 20, width: 80, height: 50 } },
          { type: 'text', content: 'Genesis 1:1', style: { fontSize: 36, fontWeight: 'bold', textAlign: 'right' }, position: { x: 10, y: 75, width: 80, height: 15 } }
        ]
      }
    },

    // Countdown
    {
      id: 'platform_countdown_minimal',
      title: 'Minimal Countdown',
      description: 'Clean center-aligned countdown timer',
      category: 'countdown',
      scope: 'platform',
      createdBy: 'system',
      tags: ['countdown', 'timer', 'minimal', 'clean'],
      usageCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      compatibleWith: ['ambo', 'pixels'],
      templateData: {
        background: { type: 'solid', value: '#111111', opacity: 1 },
        textStyle: { fontFamily: 'Roboto Mono', fontSize: 120, fontWeight: '300', color: '#FFFFFF', textAlign: 'center' },
        layers: [
          { type: 'text', content: '05:00', position: { x: 0, y: 40, width: 100, height: 20 } },
          { type: 'text', content: 'Starting soon', style: { fontFamily: 'Inter', fontSize: 32, fontWeight: '400', color: '#AAAAAA' }, position: { x: 0, y: 65, width: 100, height: 10 } }
        ]
      }
    }
  ];

  return presets;
}

export async function seedBuiltInPresets(): Promise<void> {
  const builtIns = getBuiltInPresets();
  for (const preset of builtIns) {
    const docRef = doc(db, PRESETS_COL, preset.id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, preset);
    }
  }
}
