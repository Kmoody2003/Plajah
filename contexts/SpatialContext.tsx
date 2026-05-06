import React, { createContext, useContext, useState, useEffect } from 'react';

import { fetchUserProfile, updateUserProfile, auth } from '../services/backendService';

interface SpatialContextType {
  isSpatialMode: boolean;
  toggleSpatialMode: () => void;
}

const SpatialContext = createContext<SpatialContextType | undefined>(undefined);

export const SpatialProvider: React.FC<{ children: React.ReactNode; initialValue?: boolean }> = ({ children, initialValue = false }) => {
  const [isSpatialMode, setIsSpatialMode] = useState(() => {
    const saved = localStorage.getItem('isSpatialMode');
    return saved !== null ? JSON.parse(saved) : initialValue;
  });

  const toggleSpatialMode = async () => {
    const newVal = !isSpatialMode;
    setIsSpatialMode(newVal);
    localStorage.setItem('isSpatialMode', JSON.stringify(newVal));
    
    // Sync to backend if user is logged in
    if (auth.currentUser) {
      try {
        const profile = await fetchUserProfile(auth.currentUser.uid);
        if (profile) {
          await updateUserProfile(auth.currentUser.uid, {
            ...profile,
            uiSettings: {
              ...profile.uiSettings,
              isSpatialModeEnabled: newVal
            }
          });
        }
      } catch (err) {
        console.error("Failed to sync spatial mode to backend", err);
      }
    }
  };

  // Performance optimization: Preload XR/3D modules when mode is requested
  useEffect(() => {
    if (isSpatialMode) {
      console.log("[Spatial] Optimizing network for 3D asset streams...");
      // In a real app, you could trigger dynamic imports here
    }
  }, [isSpatialMode]);

  return (
    <SpatialContext.Provider value={{ isSpatialMode, toggleSpatialMode }}>
      {children}
    </SpatialContext.Provider>
  );
};

export const useSpatial = () => {
  const context = useContext(SpatialContext);
  if (!context) {
    throw new Error('useSpatial must be used within a SpatialProvider');
  }
  return context;
};
