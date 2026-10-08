import { db, auth } from './backendService';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc } from 'firebase/firestore';
import { Video, PremiereConfig, PremiereStatus } from '../types';

export interface StockPreRoll {
  id: string;
  title: string;
  durationSec: number;
  url: string;
  thumbnailUrl: string;
  description: string;
}

/** Built-in cinematic royalty-free pre-roll clips and countdown bumpers */
export const STOCK_PRE_ROLLS: StockPreRoll[] = [
  {
    id: 'pr_cinematic_4k',
    title: 'Plajah Cinematic Film Leader',
    durationSec: 10,
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
    description: 'Dynamic 10-second widescreen cinematic film countdown with studio sub-bass punch'
  },
  {
    id: 'pr_cyber_stinger',
    title: 'Cyberpunk Neon Stinger',
    durationSec: 15,
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&auto=format&fit=crop&q=80',
    description: 'High-energy electronic synthesizer pulse and futuristic particle visuals'
  },
  {
    id: 'pr_space_odyssey',
    title: 'Deep Space Cosmic Horizon',
    durationSec: 12,
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    description: 'Ambient celestial atmospheric fly-through with glowing stars and orbital reveal'
  },
];

/**
 * Calculates current real-time state of a premiere video.
 */
export function calculatePremiereState(
  video: Partial<Video>,
  currentTimeMs: number = Date.now()
): {
  status: PremiereStatus;
  secondsUntilStart: number;
  secondsUntilCountdown: number;
  countdownDurationSec: number;
  liveOffsetSec: number;
  totalDurationSec: number;
  isLive: boolean;
  isCountdown: boolean;
  isScheduled: boolean;
  isEnded: boolean;
} {
  const config = video.premiereConfig;
  const startTime = video.premiereStartTime || config?.premiereStartTime || 0;
  const countdownDurationSec = config?.countdownDurationSec || 120;
  const countdownDurationMs = countdownDurationSec * 1000;
  const totalDurationSec = (video.duration && video.duration > 0) ? video.duration : 180; // default 3 mins if duration not resolved
  const totalDurationMs = totalDurationSec * 1000;

  if (!video.isPremiere || !startTime) {
    return {
      status: 'ENDED',
      secondsUntilStart: 0,
      secondsUntilCountdown: 0,
      countdownDurationSec,
      liveOffsetSec: 0,
      totalDurationSec,
      isLive: false,
      isCountdown: false,
      isScheduled: false,
      isEnded: true,
    };
  }

  const diffFromStart = startTime - currentTimeMs; // Positive if in the future
  const secondsUntilStart = Math.ceil(diffFromStart / 1000);
  const diffFromCountdown = (startTime - countdownDurationMs) - currentTimeMs;
  const secondsUntilCountdown = Math.ceil(diffFromCountdown / 1000);

  if (diffFromStart > countdownDurationMs) {
    // Scheduled waiting room
    return {
      status: 'SCHEDULED',
      secondsUntilStart,
      secondsUntilCountdown,
      countdownDurationSec,
      liveOffsetSec: 0,
      totalDurationSec,
      isLive: false,
      isCountdown: false,
      isScheduled: true,
      isEnded: false,
    };
  } else if (diffFromStart > 0) {
    // Countdown / Pre-roll phase
    return {
      status: 'COUNTDOWN',
      secondsUntilStart,
      secondsUntilCountdown: 0,
      countdownDurationSec,
      liveOffsetSec: 0,
      totalDurationSec,
      isLive: false,
      isCountdown: true,
      isScheduled: false,
      isEnded: false,
    };
  } else {
    // Current time is past startTime
    const elapsedSinceStartSec = Math.abs(diffFromStart) / 1000;
    if (elapsedSinceStartSec < totalDurationSec) {
      // Synchronized LIVE Premiere broadcasting
      return {
        status: 'LIVE',
        secondsUntilStart: 0,
        secondsUntilCountdown: 0,
        countdownDurationSec,
        liveOffsetSec: elapsedSinceStartSec,
        totalDurationSec,
        isLive: true,
        isCountdown: false,
        isScheduled: false,
        isEnded: false,
      };
    } else {
      // Completed, available as regular on-demand VOD
      return {
        status: 'ENDED',
        secondsUntilStart: 0,
        secondsUntilCountdown: 0,
        countdownDurationSec,
        liveOffsetSec: totalDurationSec,
        totalDurationSec,
        isLive: false,
        isCountdown: false,
        isScheduled: false,
        isEnded: true,
      };
    }
  }
}

/**
 * Configure / Schedule a video as a Live Premiere in Firestore.
 */
export async function scheduleVideoPremiere(
  videoId: string,
  config: Partial<PremiereConfig>
): Promise<void> {
  const fullConfig: PremiereConfig = {
    isPremiere: true,
    premiereStartTime: config.premiereStartTime || (Date.now() + 10 * 60 * 1000), // Default 10 mins from now
    countdownDurationSec: config.countdownDurationSec ?? 120,
    countdownTheme: config.countdownTheme || 'cinematic',
    preRollUrl: config.preRollUrl || undefined,
    preRollTitle: config.preRollTitle || undefined,
    preRollDurationSec: config.preRollDurationSec || undefined,
    chatEnabled: config.chatEnabled ?? true,
    allowSeekAhead: config.allowSeekAhead ?? false,
    status: 'SCHEDULED',
    initialViewerCount: Math.floor(Math.random() * 25) + 12,
  };

  const videoRef = doc(db, 'videos', videoId);
  await updateDoc(videoRef, {
    isPremiere: true,
    premiereStartTime: fullConfig.premiereStartTime,
    premiereConfig: fullConfig,
    isScheduled: true,
    releaseDate: fullConfig.premiereStartTime,
  });
}

/**
 * Cancel or end a premiere early, reverting to normal VOD.
 */
export async function cancelVideoPremiere(videoId: string): Promise<void> {
  const videoRef = doc(db, 'videos', videoId);
  await updateDoc(videoRef, {
    isPremiere: false,
    'premiereConfig.status': 'ENDED',
    isScheduled: false,
  });
}

/**
 * Check if current user has requested a reminder for this premiere.
 */
export function isReminderSetLocally(videoId: string): boolean {
  try {
    return localStorage.getItem(`plajah_premiere_reminder_${videoId}`) === 'true';
  } catch {
    return false;
  }
}

/**
 * Toggle reminder status for a user, handling local storage and Firestore.
 */
export async function togglePremiereReminder(
  videoId: string,
  userId?: string
): Promise<boolean> {
  const current = isReminderSetLocally(videoId);
  const next = !current;

  try {
    localStorage.setItem(`plajah_premiere_reminder_${videoId}`, next ? 'true' : 'false');
  } catch {}

  // Request browser notification permission if setting reminder
  if (next && typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }
  }

  if (userId) {
    try {
      const videoRef = doc(db, 'videos', videoId);
      await updateDoc(videoRef, {
        'premiereConfig.remindUserIds': next ? arrayUnion(userId) : arrayRemove(userId)
      });
    } catch {
      // Fire-and-forget
    }
  }

  return next;
}
