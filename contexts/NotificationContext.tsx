import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppNotification } from '../types';
import { fetchNotifications, markNotificationAsRead, auth, db } from '../services/backendService';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, writeBatch, getDocs } from 'firebase/firestore';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid ?? null);
      if (user) {
        const unsubscribeNotifs = fetchNotifications(user.uid, (notifs) => {
          setNotifications(notifs);
          setIsLoading(false);
        });
        return () => unsubscribeNotifs();
      } else {
        setNotifications([]);
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = async (id: string) => {
    try {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const clearAll = useCallback(async () => {
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
