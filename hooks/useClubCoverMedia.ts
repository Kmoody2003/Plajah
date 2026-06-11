import { useState, useEffect } from 'react';
import { collection, doc, query, orderBy } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { db } from '../services/firebase';

export interface ClubCoverItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
  order: number;
}

export interface ClubCoverSettings {
  mode: 'off' | 'single' | 'slideshow';
  singleItemId: string | null;
  slideshowOrder: 'random' | 'sequential';
}

const SETTINGS_DEFAULTS: ClubCoverSettings = {
  mode: 'off',
  singleItemId: null,
  slideshowOrder: 'random',
};

export function useClubCoverMedia(): ClubCoverItem[] {
  const [items, setItems] = useState<ClubCoverItem[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'clubCoverMedia'), orderBy('order', 'asc'));
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubCoverItem)));
    }, () => setItems([]));
  }, []);

  return items;
}

export function useClubCoverSettings(): ClubCoverSettings {
  const [settings, setSettings] = useState<ClubCoverSettings>(SETTINGS_DEFAULTS);

  useEffect(() => {
    return onSnapshot(doc(db, 'clubCoverSettings', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSettings({
          mode: d.mode ?? 'off',
          singleItemId: d.singleItemId ?? null,
          slideshowOrder: d.slideshowOrder ?? 'random',
        });
      } else {
        setSettings(SETTINGS_DEFAULTS);
      }
    }, () => {});
  }, []);

  return settings;
}
