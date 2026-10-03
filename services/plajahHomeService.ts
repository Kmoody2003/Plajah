/**
 * Plajah Home Service
 * 
 * Core service for the Plajah Home smart home controller module.
 * Manages rooms, devices, scenes, repurposed devices, intercom,
 * and digital picture frames.
 * 
 * Uses Firestore for persistence and real-time sync (`onSnapshot`).
 * Follows the same patterns as backendService.ts.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeviceType =
  | 'light'
  | 'thermostat'
  | 'speaker'
  | 'lock'
  | 'camera'
  | 'switch'
  | 'plug'
  | 'sensor'
  | 'blind'
  | 'fan'
  | 'display'
  | 'intercom'
  | 'digital-frame';

export type DeviceProtocol =
  | 'matter'
  | 'smartthings'
  | 'cast'
  | 'hue'
  | 'nanoleaf'
  | 'govee'
  | 'razer-chroma'
  | 'alexa'
  | 'dlna'
  | 'web-browser'    // Repurposed device running Plajah Home in browser
  | 'local-network'; // Direct LAN control

export type DeviceRole =
  | 'smart-display'
  | 'smart-speaker'
  | 'room-controller'
  | 'digital-frame'
  | 'intercom-station'
  | 'hub'
  | 'ambient-display';

export type SceneTrigger = 'manual' | 'time' | 'arrival' | 'departure' | 'voice' | 'aria-suggested';

export interface HomeDevice {
  id: string;
  roomId: string;
  name: string;
  type: DeviceType;
  protocol: DeviceProtocol;
  icon?: string;

  // Matter-specific
  matterNodeId?: string;
  matterEndpointId?: number;

  // SmartThings-specific
  smartThingsDeviceId?: string;
  smartThingsCapabilities?: string[];

  // Cast-specific
  castDeviceId?: string;

  // Repurposed device fields
  repurposedRole?: DeviceRole;
  originalDevice?: string;      // e.g., "Harman Kardon Invoke", "Xbox One", "Old Laptop"
  browserUrl?: string;           // URL the repurposed device is displaying

  // Current state (real-time via onSnapshot)
  state: DeviceState;
  lastSeen?: number;
}

export interface DeviceState {
  online: boolean;
  on?: boolean;
  brightness?: number;           // 0–100
  colorTemp?: number;            // Kelvin
  color?: string;                // hex
  temperature?: number;          // Current temp (thermostat)
  targetTemp?: number;           // Target temp
  humidity?: number;             // Percentage
  volume?: number;               // 0–100
  muted?: boolean;
  mediaTitle?: string;           // Now playing
  mediaArtist?: string;
  mediaArtUrl?: string;
  locked?: boolean;
  batteryLevel?: number;
  motionDetected?: boolean;

  // Digital frame state
  currentPhotoUrl?: string;
  currentAlbumName?: string;
  shuffleEnabled?: boolean;
  slideInterval?: number;        // Seconds between slides

  // Intercom state
  micActive?: boolean;
  speakerActive?: boolean;
  intercomChannel?: string;      // Which room/group it's broadcasting to
}

export interface HomeRoom {
  id: string;
  name: string;
  icon: string;                  // lucide icon name
  order: number;
  ambientColor?: string;         // Current ambient hex
  activeScene?: string;          // Active scene ID
  deviceIds: string[];
}

export interface HomeScene {
  id: string;
  name: string;
  icon: string;
  description?: string;
  trigger: SceneTrigger;
  deviceStates: {
    deviceId: string;
    state: Partial<DeviceState>;
  }[];
  ariaSuggested: boolean;
  ariaConfidence?: number;       // 0–1, how confident Aria is this pattern is real
  isActive: boolean;
}

export interface IntercomGroup {
  id: string;
  name: string;
  roomIds: string[];
  isActive: boolean;
  activeSpeakerId?: string;
}

export interface DigitalFrameAlbum {
  id: string;
  name: string;
  photos: {
    url: string;
    caption?: string;
    takenAt?: number;
  }[];
  shuffleEnabled: boolean;
  slideInterval: number;         // Seconds
  assignedDeviceIds: string[];
}

export interface PlajahHome {
  id: string;
  ownerId: string;
  name: string;
  rooms: HomeRoom[];
  scenes: HomeScene[];
  devices: HomeDevice[];
  repurposedDevices: HomeDevice[];
  intercomGroups: IntercomGroup[];
  frameAlbums: DigitalFrameAlbum[];
  smartThingsConnected: boolean;
  hubOnline: boolean;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

export const MOCK_ROOMS: HomeRoom[] = [
  { id: 'living-room', name: 'Living Room', icon: 'Sofa', order: 0, deviceIds: ['lr-light-1', 'lr-light-2', 'lr-speaker', 'lr-thermo'] },
  { id: 'kitchen', name: 'Kitchen', icon: 'CookingPot', order: 1, deviceIds: ['k-light-1', 'k-light-2', 'k-speaker'] },
  { id: 'bedroom', name: 'Bedroom', icon: 'Bed', order: 2, deviceIds: ['br-light', 'br-speaker', 'br-lock'] },
  { id: 'office', name: 'Office', icon: 'Monitor', order: 3, deviceIds: ['of-light', 'of-display'] },
  { id: 'bathroom', name: 'Bathroom', icon: 'Bath', order: 4, deviceIds: ['bath-light'] },
  { id: 'front-door', name: 'Front Door', icon: 'DoorOpen', order: 5, deviceIds: ['fd-camera', 'fd-lock'] },
];

export const MOCK_DEVICES: HomeDevice[] = [
  // Living Room
  { id: 'lr-light-1', roomId: 'living-room', name: 'Floor Lamp', type: 'light', protocol: 'hue', state: { online: true, on: true, brightness: 70, colorTemp: 3200 } },
  { id: 'lr-light-2', roomId: 'living-room', name: 'Ceiling Light', type: 'light', protocol: 'hue', state: { online: true, on: true, brightness: 50, colorTemp: 4000 } },
  { id: 'lr-speaker', roomId: 'living-room', name: 'JBL Authentics 200', type: 'speaker', protocol: 'cast', state: { online: true, on: true, volume: 45, mediaTitle: 'Midnight City', mediaArtist: 'M83', mediaArtUrl: '' } },
  { id: 'lr-thermo', roomId: 'living-room', name: 'Living Room Thermostat', type: 'thermostat', protocol: 'matter', state: { online: true, temperature: 72, targetTemp: 72, humidity: 45 } },
  // Kitchen
  { id: 'k-light-1', roomId: 'kitchen', name: 'Island Pendants', type: 'light', protocol: 'hue', state: { online: true, on: true, brightness: 85, colorTemp: 3500 } },
  { id: 'k-light-2', roomId: 'kitchen', name: 'Under Cabinet', type: 'light', protocol: 'nanoleaf', state: { online: true, on: false, brightness: 0 } },
  { id: 'k-speaker', roomId: 'kitchen', name: 'Samsung Music Frame', type: 'speaker', protocol: 'smartthings', state: { online: true, on: true, volume: 35, mediaTitle: 'Midnight City', mediaArtist: 'M83' } },
  // Bedroom
  { id: 'br-light', roomId: 'bedroom', name: 'Bedside Lamp', type: 'light', protocol: 'govee', state: { online: true, on: false, brightness: 0, color: '#D0BCFF' } },
  { id: 'br-speaker', roomId: 'bedroom', name: 'Bedroom Speaker', type: 'speaker', protocol: 'cast', state: { online: true, on: false, volume: 20 } },
  { id: 'br-lock', roomId: 'bedroom', name: 'Bedroom Lock', type: 'lock', protocol: 'matter', state: { online: true, locked: true } },
  // Office
  { id: 'of-light', roomId: 'office', name: 'Desk Lamp', type: 'light', protocol: 'hue', state: { online: true, on: true, brightness: 90, colorTemp: 5000 } },
  { id: 'of-display', roomId: 'office', name: 'Samsung The Frame', type: 'display', protocol: 'smartthings', state: { online: true, on: true } },
  // Bathroom
  { id: 'bath-light', roomId: 'bathroom', name: 'Vanity Light', type: 'light', protocol: 'hue', state: { online: true, on: false } },
  // Front Door
  { id: 'fd-camera', roomId: 'front-door', name: 'Doorbell Camera', type: 'camera', protocol: 'matter', state: { online: true, motionDetected: false } },
  { id: 'fd-lock', roomId: 'front-door', name: 'Front Door Lock', type: 'lock', protocol: 'matter', state: { online: true, locked: true, batteryLevel: 87 } },
];

export const MOCK_REPURPOSED_DEVICES: HomeDevice[] = [
  {
    id: 'rp-laptop', roomId: 'living-room', name: "Kenny's Old Laptop",
    type: 'display', protocol: 'web-browser',
    repurposedRole: 'smart-display', originalDevice: 'Dell Inspiron 15',
    browserUrl: 'https://home.plajah.com/display/living-room',
    state: { online: true, on: true },
    lastSeen: Date.now(),
  },
  {
    id: 'rp-xbox', roomId: 'living-room', name: 'Xbox One',
    type: 'display', protocol: 'web-browser',
    repurposedRole: 'hub', originalDevice: 'Xbox One S',
    browserUrl: 'https://home.plajah.com/hub',
    state: { online: true, on: true },
    lastSeen: Date.now(),
  },
  {
    id: 'rp-ipad', roomId: 'kitchen', name: 'Old iPad',
    type: 'display', protocol: 'web-browser',
    repurposedRole: 'room-controller', originalDevice: 'iPad Air 2',
    browserUrl: 'https://home.plajah.com/room/kitchen',
    state: { online: true, on: true },
    lastSeen: Date.now() - 300_000,
  },
  {
    id: 'rp-frame', roomId: 'bedroom', name: 'Bedroom Frame',
    type: 'digital-frame', protocol: 'dlna',
    repurposedRole: 'digital-frame', originalDevice: 'Old Android Tablet',
    state: {
      online: true, on: true,
      currentPhotoUrl: '/photos/sunset-beach.jpg',
      currentAlbumName: 'Summer Memories',
      shuffleEnabled: true,
      slideInterval: 30,
    },
    lastSeen: Date.now(),
  },
];

export const MOCK_SCENES: HomeScene[] = [
  { id: 'good-morning', name: 'Good Morning', icon: 'Sunrise', trigger: 'manual', deviceStates: [], ariaSuggested: false, isActive: false, description: 'Lights up, coffee maker on, news playing' },
  { id: 'work-mode', name: 'Work Mode', icon: 'Briefcase', trigger: 'manual', deviceStates: [], ariaSuggested: false, isActive: false, description: 'Office lights bright, music low, DND on' },
  { id: 'movie-night', name: 'Movie Night', icon: 'Clapperboard', trigger: 'manual', deviceStates: [], ariaSuggested: false, isActive: true, description: 'Lights dimmed, TV on, surround sound' },
  { id: 'dinner-party', name: 'Dinner Party', icon: 'Wine', trigger: 'manual', deviceStates: [], ariaSuggested: false, isActive: false, description: 'Warm lights, jazz playlist, dining ambiance' },
  { id: 'bedtime', name: 'Bedtime', icon: 'Moon', trigger: 'aria-suggested', deviceStates: [], ariaSuggested: true, ariaConfidence: 0.92, isActive: false, description: 'All lights off, doors locked, white noise' },
  { id: 'away', name: 'Away', icon: 'ShieldCheck', trigger: 'manual', deviceStates: [], ariaSuggested: false, isActive: false, description: 'Security armed, lights simulated, cameras active' },
];

export const MOCK_INTERCOM_GROUPS: IntercomGroup[] = [
  { id: 'all-rooms', name: 'All Rooms', roomIds: ['living-room', 'kitchen', 'bedroom', 'office', 'bathroom'], isActive: false },
  { id: 'downstairs', name: 'Downstairs', roomIds: ['living-room', 'kitchen'], isActive: false },
  { id: 'upstairs', name: 'Upstairs', roomIds: ['bedroom', 'office', 'bathroom'], isActive: false },
];

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Get room summary stats for dashboard display.
 */
export function getRoomSummary(room: HomeRoom, devices: HomeDevice[]): {
  lightsOn: number;
  totalLights: number;
  speakersPlaying: number;
  temperature?: number;
  isLocked?: boolean;
  hasMotion?: boolean;
} {
  const roomDevices = devices.filter(d => room.deviceIds.includes(d.id));
  const lights = roomDevices.filter(d => d.type === 'light');
  const speakers = roomDevices.filter(d => d.type === 'speaker');
  const thermostat = roomDevices.find(d => d.type === 'thermostat');
  const locks = roomDevices.filter(d => d.type === 'lock');
  const cameras = roomDevices.filter(d => d.type === 'camera');

  return {
    lightsOn: lights.filter(l => l.state.on).length,
    totalLights: lights.length,
    speakersPlaying: speakers.filter(s => s.state.on && s.state.mediaTitle).length,
    temperature: thermostat?.state.temperature,
    isLocked: locks.length > 0 ? locks.every(l => l.state.locked) : undefined,
    hasMotion: cameras.some(c => c.state.motionDetected),
  };
}

/**
 * Get now-playing info across all speakers in the home.
 */
export function getNowPlaying(devices: HomeDevice[]): {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  artUrl?: string;
  speakerCount: number;
  speakerNames: string[];
} {
  const playingSpeakers = devices.filter(
    d => d.type === 'speaker' && d.state.on && d.state.mediaTitle
  );
  if (playingSpeakers.length === 0) {
    return { isPlaying: false, speakerCount: 0, speakerNames: [] };
  }
  const primary = playingSpeakers[0];
  return {
    isPlaying: true,
    title: primary.state.mediaTitle,
    artist: primary.state.mediaArtist,
    artUrl: primary.state.mediaArtUrl,
    speakerCount: playingSpeakers.length,
    speakerNames: playingSpeakers.map(s => s.name),
  };
}

/**
 * Get count of online repurposed devices by role.
 */
export function getRepurposedDeviceStats(devices: HomeDevice[]): Record<DeviceRole, number> {
  const stats: Record<DeviceRole, number> = {
    'smart-display': 0,
    'smart-speaker': 0,
    'room-controller': 0,
    'digital-frame': 0,
    'intercom-station': 0,
    'hub': 0,
    'ambient-display': 0,
  };
  for (const d of devices) {
    if (d.repurposedRole && d.state.online) {
      stats[d.repurposedRole]++;
    }
  }
  return stats;
}

/**
 * Format a device role for display.
 */
export function formatDeviceRole(role: DeviceRole): string {
  const labels: Record<DeviceRole, string> = {
    'smart-display': 'Smart Display',
    'smart-speaker': 'Smart Speaker',
    'room-controller': 'Room Controller',
    'digital-frame': 'Digital Frame',
    'intercom-station': 'Intercom Station',
    'hub': 'Home Hub',
    'ambient-display': 'Ambient Display',
  };
  return labels[role] || role;
}

/**
 * Format "last seen" timestamp into human-readable relative time.
 */
export function formatLastSeen(timestamp?: number): string {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
