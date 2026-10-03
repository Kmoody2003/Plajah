/**
 * Plajah Home — Matter & SmartThings Live Camera Service
 * 
 * Supports Matter-certified video doorbells and security cameras
 * (Matter 1.3 / 1.4 Camera Cluster) as well as SmartThings Vision feeds.
 * 
 * Features:
 *  - Low-latency RTSP/WebRTC video stream ingest
 *  - Real-time motion and AI person/package detection telemetry
 *  - Scrim action overlay: 2-way audio intercom mic, snapshot, unlock door
 *  - Display routing: automatically pipe doorbell feed to nearby smart displays or TV
 */

export interface MatterCamera {
  id: string;
  name: string;
  location: string;
  status: 'live' | 'buffering' | 'offline';
  resolution: '1080p' | '2k' | '4k';
  streamUrl: string;
  posterUrl: string;
  hasTwoWayAudio: boolean;
  isMicActive?: boolean;
  batteryPercent?: number;
  isHardwired: boolean;
  associatedDoorLockId?: string; // e.g. front-door lock to trigger unlock right on the camera feed
  lastEvent?: {
    type: 'motion' | 'person' | 'package' | 'doorbell-press';
    timestamp: number;
    description: string;
  };
}

export const MOCK_MATTER_CAMERAS: MatterCamera[] = [
  {
    id: 'cam-front-door',
    name: 'Front Door // 4K Matter Cam',
    location: 'Exterior Porch',
    status: 'live',
    resolution: '4k',
    streamUrl: 'webrtc://home.plajah.local/live/front-door',
    posterUrl: '/assets/cameras/front-door-porch.jpg',
    hasTwoWayAudio: true,
    isHardwired: true,
    associatedDoorLockId: 'fd-lock',
    lastEvent: {
      type: 'person',
      timestamp: Date.now() - 120_000,
      description: 'Motion detected 2m ago',
    },
  },
  {
    id: 'cam-studio-workshop',
    name: 'Studio Workshop',
    location: 'Interior Studio',
    status: 'live',
    resolution: '1080p',
    streamUrl: 'webrtc://home.plajah.local/live/studio-workshop',
    posterUrl: '/assets/cameras/studio-workshop.jpg',
    hasTwoWayAudio: true,
    isHardwired: true,
    lastEvent: {
      type: 'motion',
      timestamp: Date.now() - 900_000,
      description: 'Motion detected 15m ago',
    },
  },
];

/**
 * Toggles 2-way audio intercom for a camera feed.
 */
export function toggleCameraMic(cameraId: string, active: boolean): boolean {
  console.log(`[MatterCamera] Setting 2-way audio mic on camera ${cameraId} to ${active}`);
  return active;
}

/**
 * Triggers snapshot capture and saves to Plajah Gallery.
 */
export async function captureCameraSnapshot(cameraId: string): Promise<string> {
  return `https://plajah.com/snapshots/${cameraId}-${Date.now()}.jpg`;
}
