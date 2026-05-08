import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppNotification } from '../types';
import { fetchNotifications, markNotificationAsRead, auth } from '../services/backendService';
import { onAuthStateChanged } from 'firebase/auth';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
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
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, isLoading }}>
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
