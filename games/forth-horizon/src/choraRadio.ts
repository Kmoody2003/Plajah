/**
 * choraRadio.ts — Integrates Chora Music Artists & Albums, Plajah Virtual DJs (services/onair),
 * and the player's Plajah Profile favorite stations & internet radio presets into the car HUD.
 */

import { onAirNow, nextOnAir } from '../../../services/onair/station';
import { HOSTS } from '../../../services/onair/hosts';
import { VYRA } from '../../../services/onair/artists';
import type { PersonaSheet } from '../../../services/onair/types';

export interface RadioPreset {
  id: string;
  name: string;
  artist: string;
  album: string;
  hostName: string;
  tagline: string;
  accent: string;
  bpm: number;
  kind: 'plajah-fm' | 'chora-artist' | 'chora-techno' | 'chora-synth' | 'internet-radio';
  isProfileFavorite: boolean;
  streamUrl?: string;
  persona: PersonaSheet | null;
}

interface StoredRadioFavorite {
  id?: string;
  name?: string;
  artist?: string;
  album?: string;
  streamUrl?: string;
  url?: string;
  genre?: string;
  bpm?: number;
  accent?: string;
}

function loadProfileFavoriteStations(): RadioPreset[] {
  if (typeof window === 'undefined') return [];
  const keys = ['plajah_favorite_stations', 'chora_radio_favorites', 'plajah_profile_radio'];
  const out: RadioPreset[] = [];
  const seen = new Set<string>();

  const pushItem = (item: StoredRadioFavorite, idx: number) => {
    const name = (item.name || '').trim();
    const url = (item.streamUrl || item.url || '').trim();
    if (!name && !url) return;
    const id = item.id || `fav-${idx}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      name: name || `Favorite Stream ${idx + 1}`,
      artist: item.artist || 'Plajah Profile Favorite',
      album: item.album || item.genre || 'Internet Radio',
      hostName: 'Saved Profile Preset',
      tagline: url ? `Live Internet Radio · ${url}` : 'Pinned from your Plajah Chora profile',
      accent: item.accent || '#ffd166',
      bpm: item.bpm || 124,
      kind: url ? 'internet-radio' : 'chora-artist',
      isProfileFavorite: true,
      streamUrl: url || undefined,
      persona: null,
    });
  };

  try {
    const winProfile = (window as unknown as { __PLAJAH_PROFILE__?: { favoriteStations?: StoredRadioFavorite[] } }).__PLAJAH_PROFILE__;
    winProfile?.favoriteStations?.forEach((it, i) => pushItem(it, i));

    for (const k of keys) {
      const raw = window.localStorage?.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach((it, i) => pushItem(it, i));
    }
  } catch {
    // Ignore malformed localStorage entries
  }
  return out;
}

export class ChoraRadioManager {
  readonly presets: RadioPreset[] = [];
  private idx = 0;
  private streamEl: HTMLAudioElement | null = null;

  constructor() {
    this.rebuildPresets();
  }

  rebuildPresets(): void {
    this.presets.length = 0;
    const favorites = loadProfileFavoriteStations();
    this.presets.push(...favorites);

    const liveHost = onAirNow() ?? HOSTS[0];
    const upcoming = nextOnAir();
    const showName = liveHost.show?.name ?? 'Overnight Auto-Mix';
    const nextHint = upcoming ? ` · Next: ${upcoming.host.stageName} in ${upcoming.inHours}h` : '';

    this.presets.push(
      {
        id: 'plajah-fm',
        name: `Plajah FM · ${showName}`,
        artist: liveHost.stageName,
        album: 'Live Broadcast · Station Clock',
        hostName: `${liveHost.stageName} (Virtual DJ)`,
        tagline: `${liveHost.backstory.tagline}${nextHint}`,
        accent: liveHost.look.palette[0] ?? '#ff6b2b',
        bpm: 120,
        kind: 'plajah-fm',
        isProfileFavorite: false,
        persona: liveHost,
      },
      {
        id: 'chora-vyra',
        name: `Chora · ${VYRA.stageName} Radio`,
        artist: VYRA.stageName,
        album: 'Night Market Hum (Chora LP)',
        hostName: `${VYRA.stageName} (Chora Virtual Artist)`,
        tagline: VYRA.backstory.tagline,
        accent: VYRA.look.palette[0] ?? '#00F0FF',
        bpm: 126,
        kind: 'chora-artist',
        isProfileFavorite: false,
        persona: VYRA,
      },
      {
        id: 'chora-techno',
        name: 'Chora · Ironport Underground',
        artist: 'Chora Collective',
        album: 'Foundry 909 Sessions',
        hostName: 'Chora Direct · Detroit Techno (128 BPM)',
        tagline: 'Procedural 909 kick, acid bassline & warehouse hats.',
        accent: '#2ec4b6',
        bpm: 128,
        kind: 'chora-techno',
        isProfileFavorite: false,
        persona: null,
      },
      {
        id: 'chora-synth',
        name: 'Chora · Great Lakes Horizon',
        artist: 'Chora Sunset Unit',
        album: 'Lakeshore Drive Vol. 2',
        hostName: 'Chora Direct · Sunset Synthwave (112 BPM)',
        tagline: 'Warm analog arps & coastal cruise chords.',
        accent: '#ffd166',
        bpm: 112,
        kind: 'chora-synth',
        isProfileFavorite: false,
        persona: null,
      }
    );
  }

  get current(): RadioPreset {
    return this.presets[this.idx] ?? this.presets[0];
  }

  selectById(id: string): RadioPreset {
    const found = this.presets.findIndex((p) => p.id === id);
    if (found >= 0) {
      this.idx = found;
      this.syncStreamPlayback();
    }
    return this.current;
  }

  cycle(dir: 1 | -1): RadioPreset {
    this.idx = (this.idx + dir + this.presets.length) % this.presets.length;
    this.syncStreamPlayback();
    return this.current;
  }

  setPausedOrMuted(silent: boolean): void {
    if (!this.streamEl) return;
    this.streamEl.muted = silent;
  }

  private syncStreamPlayback(): void {
    const p = this.current;
    if (p.kind === 'internet-radio' && p.streamUrl && typeof Audio !== 'undefined') {
      if (!this.streamEl) {
        this.streamEl = new Audio();
        this.streamEl.crossOrigin = 'anonymous';
      }
      this.streamEl.src = p.streamUrl;
      void this.streamEl.play().catch(() => {});
    } else if (this.streamEl) {
      this.streamEl.pause();
    }
  }
}
