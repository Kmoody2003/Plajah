import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppNotification } from '../types';
import { fetchNotifications, markNotificationAsRead, auth, db } from '../services/backendService';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, writeBatch, getDocs } from 'firebase/firestore';
import { getLocalNotifications, subscribeLocalNotifications, markLocalNotificationRead, clearLocalNotifications, isLocalNotificationId } from '../services/localNotifications';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [remote, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  // On-device notices (a new build waiting, a tour offer) share the list with server ones.
  const [localTick, setLocalTick] = useState(0);
  useEffect(() => subscribeLocalNotifications(() => setLocalTick(t => t + 1)), []);
  const notifications = React.useMemo(
    () => [...getLocalNotifications(currentUid), ...remote].sort((a, b) => b.timestamp - a.timestamp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remote, currentUid, localTick],
  );

  useEffect(() => {
    // onAuthStateChanged ignores a returned cleanup, so the old code leaked one notifications listener per
    // sign-in / account switch (and kept delivering the previous account's notifications). Track it here.
    let unsubscribeNotifs: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeNotifs?.();
      unsubscribeNotifs = null;
      setCurrentUid(user?.uid ?? null);
      if (user) {
        unsubscribeNotifs = fetchNotifications(user.uid, (notifs) => {
          setNotifications(notifs);
          setIsLoading(false);
        });
      } else {
        setNotifications([]);
        setIsLoading(false);
      }
    });

    return () => { unsubscribeAuth(); unsubscribeNotifs?.(); };
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = async (id: string) => {
    if (isLocalNotificationId(id)) { markLocalNotificationRead(id.slice('local:'.length)); return; }
    try {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const clearAll = useCallback(async () => {
    clearLocalNotifications();
    if (!currentUid) return;
    try {
      const q = query(collection(db, 'notifications'), where('userId', '==', currentUid));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setNotifications([]);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }, [currentUid]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, clearAll, isLoading }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
