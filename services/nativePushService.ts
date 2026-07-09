// Native (Capacitor) push notifications for the Android / Fire TV APK. The web build
// uses pushNotificationService.ts (Firebase JS SDK + service worker); inside the native
// WebView that path is unreliable, so on native we use @capacitor/push-notifications,
// which registers with FCM through google-services.json and delivers real system-tray
// notifications even when the app is killed.
//
// The device token is stored alongside the web token in users/{uid}.fcmTokens (a set),
// so the existing /api/push fan-out reaches every device a user owns with no server change.

import { getPlatformInfo } from '../hooks/usePlatform';
import { saveFcmToken, removeFcmToken, auth } from './backendService';

// Android notification channels — one per preference category so users can also tune
// them from the OS settings. Created once at register time. importance 5 = HIGH (heads-up).
const CHANNELS = [
  { id: 'messages', name: 'Messages', description: 'Direct messages and chat', importance: 5 as const },
  { id: 'social', name: 'Social', description: 'Likes, comments, follows and mentions', importance: 4 as const },
  { id: 'content', name: 'New content', description: 'New posts, videos and releases from people you follow', importance: 4 as const },
  { id: 'system', name: 'Updates', description: 'Account and system notifications', importance: 3 as const },
  { id: 'default', name: 'General', description: 'General notifications', importance: 4 as const },
];

let started = false;
let currentToken: string | null = null;

interface NativePushHandlers {
  /** Called when the user taps a notification. Receives the FCM data map (link, targetId, type, sender…). */
  onNavigate?: (data: Record<string, any>) => void;
  /** Called when a push arrives while the app is in the foreground. */
  onForeground?: (title: string, body: string, data: Record<string, any>) => void;
}

/**
 * Initializes native push on Android/Fire TV. No-op on web (the web build handles push
 * via pushNotificationService). Safe to call more than once — listeners are attached once.
 */
export const initNativePush = async (handlers: NativePushHandlers = {}): Promise<void> => {
  const platform = getPlatformInfo();
  if (!platform.isNative) return;           // web / PWA — not our path
  if (started) return;
  started = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // 1. Permission (Android 13+ shows the POST_NOTIFICATIONS prompt here).
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      started = false;                       // let a later attempt re-prompt
      return;
    }

    // 2. Create Android channels (harmless / ignored on platforms without channels).
    try {
      for (const ch of CHANNELS) {
        await PushNotifications.createChannel({
          id: ch.id,
          name: ch.name,
          description: ch.description,
          importance: ch.importance,
          visibility: 1,
          vibration: true,
          lights: true,
        });
      }
    } catch { /* createChannel is Android-only; ignore elsewhere */ }

    // 3. Register with APNs/FCM — resolves via the 'registration' listener below.
    await PushNotifications.register();

    // 4. Token → Firestore (same field the web token uses, so /api/push reaches this device).
    await PushNotifications.addListener('registration', (t) => {
      currentToken = t.value;
      const uid = auth.currentUser?.uid;
      if (uid) saveFcmToken(uid, t.value).catch(() => {});
    });

    await PushNotifications.addListener('registrationError', (e) => {
      console.warn('[NativePush] registration error:', e?.error);
    });

    // 5. Foreground arrival — the OS won't show a tray notification while the app is open,
    //    so surface an in-app toast instead (matches the web foreground behavior).
    await PushNotifications.addListener('pushNotificationReceived', (n) => {
      handlers.onForeground?.(n.title || 'Plajah', n.body || '', n.data || {});
    });

    // 6. Tap — deep-link using the same routing the in-app notification list uses.
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data || {};
      handlers.onNavigate?.(data);
    });
  } catch (e) {
    console.warn('[NativePush] init failed:', e);
    started = false;
  }
};

/** Clears the OS notification tray + resets the app icon badge (call when opening the app / hub). */
export const clearNativeBadge = async (): Promise<void> => {
  if (!getPlatformInfo().isNative) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllDeliveredNotifications();
  } catch { /* ignore */ }
};

/** Detaches this device's token from a user on sign-out (shared-device hygiene). */
export const unregisterNativePushForUser = async (uid: string): Promise<void> => {
  if (!getPlatformInfo().isNative || !currentToken) return;
  await removeFcmToken(uid, currentToken).catch(() => {});
};
