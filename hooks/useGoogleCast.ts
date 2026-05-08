import { useState, useEffect, useCallback } from 'react';
import { Track } from '../types';

declare global {
  interface Window {
    __onGCastApiAvailable: (isAvailable: boolean) => void;
    chrome: any;
    cast: any;
  }
}

export const useGoogleCast = () => {
  const [isCastAvailable, setIsCastAvailable] = useState(false);
  const [castSession, setCastSession] = useState<any>(null);
  const [isCasting, setIsCasting] = useState(false);

  useEffect(() => {
    if (window.cast && window.cast.framework) {
      initializeCastApi();
    }

    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) {
        initializeCastApi();
      }
    };
  }, []);

  const initializeCastApi = () => {
    const cast = window.cast;
    const chrome = window.chrome;
    
    if (!cast || !chrome) return;

    const sessionContext = cast.framework.CastContext.getInstance();
    sessionContext.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });

    sessionContext.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event: any) => {
        const state = event.sessionState;
        if (state === cast.framework.SessionState.SESSION_STARTED) {
          setCastSession(sessionContext.getCurrentSession());
          setIsCasting(true);
        } else if (state === cast.framework.SessionState.SESSION_ENDED) {
          setCastSession(null);
          setIsCasting(false);
        }
      }
    );

    setIsCastAvailable(true);
  };

  const castTrack = useCallback((track: Track) => {
    const cast = window.cast;
    const chrome = window.chrome;
    
    if (!cast || !chrome) return;

    const sessionContext = cast.framework.CastContext.getInstance();
    const session = sessionContext.getCurrentSession();

    if (!session) {
      sessionContext.requestSession().then(() => {
        const newSession = sessionContext.getCurrentSession();
        if (newSession) {
          loadMedia(newSession, track);
        }
      }).catch((err: any) => {
        // 'cancel' is a standard response when user closes the cast dialog
        if (err !== 'cancel') {
          console.error('Cast session request error:', err);
        }
      });
    } else {
      loadMedia(session, track);
    }
  }, []);

  const loadMedia = (session: any, track: Track) => {
    const chrome = window.chrome;
    const mediaInfo = new chrome.cast.media.MediaInfo(track.url, 'audio/mpeg');
    mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    mediaInfo.metadata.title = track.title;
    mediaInfo.metadata.artist = track.artist;
    if (track.albumCover) {
      mediaInfo.metadata.images = [{ url: track.albumCover }];
    }

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    session.loadMedia(request).then(
      () => console.log('Cast load success'),
      (errorCode: any) => console.error('Cast load error: ' + errorCode)
    );
  };

  const stopCasting = useCallback(() => {
    const cast = window.cast;
    if (!cast) return;
    const sessionContext = cast.framework.CastContext.getInstance();
    sessionContext.endCurrentSession(true);
  }, []);

  return {
    isCastAvailable,
    isCasting,
    castTrack,
    stopCasting
  };
};
