import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { app } from './firebase';
import { db, auth } from './backendService';

const VAPID_KEY = (import.meta as any).env?.VITE_FCM_VAPID_KEY as string | undefined;

let _messaging: ReturnType<typeof getMessaging> | null = null;

const getMsg = () => {
  if (!_messaging) _messaging = getMessaging(app);
  return _messaging;
};

export const requestPushPermission = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
  if (!VAPID_KEY) {
    console.warn('[Push] VITE_FCM_VAPID_KEY not set — push notifications disabled. Add it to .env.local');
    return null;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const messaging = getMsg();
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: sw });
    if (token && auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { fcmToken: token }).catch(() => {});
    }
    return token || null;
  } catch (e) {
    console.warn('[Push] Token error:', e);
    return null;
  }
};

export const onForegroundMessage = (callback: (payload: MessagePayload) => void): (() => void) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return () => {};
  try {
    return onMessage(getMsg(), callback);
  } catch {
    return () => {};
  }
};
