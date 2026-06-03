import { useState, useEffect, useCallback, useRef } from 'react';
import { Track } from '../types';
import { CastMediaParams, CAST_APP_ID, buildCastMediaInfo } from '../services/googleHomeService';

declare global {
  interface Window {
    __onGCastApiAvailable: (isAvailable: boolean) => void;
    chrome: any;
    cast: any;
  }
}

export interface CastQueueItem {
  url: string;
  contentType: CastMediaParams['contentType'];
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

export const useGoogleCast = () => {
  const [isCastAvailable, setIsCastAvailable] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null);
  const queueRef = useRef<CastQueueItem[]>([]);

  useEffect(() => {
    if (window.cast?.framework) {
      initializeCastApi();
    }
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) initializeCastApi();
    };
  }, []);

  const initializeCastApi = () => {
    const { cast, chrome } = window;
    if (!cast || !chrome) return;

    const ctx = cast.framework.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: CAST_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    ctx.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event: any) => {
        const state = event.sessionState;
        const SessionState = cast.framework.SessionState;
        if (state === SessionState.SESSION_STARTED || state === SessionState.SESSION_RESUMED) {
          const session = ctx.getCurrentSession();
          setCastDeviceName(session?.getCastDevice()?.friendlyName ?? null);
          setIsCasting(true);
        } else if (state === SessionState.SESSION_ENDED) {
          setCastDeviceName(null);
          setIsCasting(false);
        }
      }
    );

    setIsCastAvailable(true);
  };

  const getOrCreateSession = async (): Promise<any | null> => {
    const ctx = window.cast?.framework?.CastContext.getInstance();
    if (!ctx) return null;
    const existing = ctx.getCurrentSession();
    if (existing) return existing;
    try {
      await ctx.requestSession();
      return ctx.getCurrentSession();
    } catch (err: any) {
      if (err !== 'cancel') console.error('[Cast] Session request failed:', err);
      return null;
    }
  };

  /** Cast a single audio track (mirrors legacy API). */
  const castTrack = useCallback(async (track: Track) => {
    const session = await getOrCreateSession();
    if (!session) return;
    const { chrome } = window;
    const mediaInfo = new chrome.cast.media.MediaInfo(track.url, 'audio/mpeg');
    mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    mediaInfo.metadata.title = track.title;
    mediaInfo.metadata.artist = track.artist;
    if (track.albumCover) mediaInfo.metadata.images = [{ url: track.albumCover }];
    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    session.loadMedia(request).catch((err: any) =>
      console.error('[Cast] Load track error:', err)
    );
  }, []);

  /** Cast any media (video, audio, HLS) using CastMediaParams. */
  const castMedia = useCallback(async (params: CastMediaParams) => {
    const session = await getOrCreateSession();
    if (!session) return;
    const { chrome } = window;
    const info = buildCastMediaInfo(params);
    const mediaInfo = new chrome.cast.media.MediaInfo(info.contentId, info.contentType);
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = params.contentType.startsWith('audio')
      ? new chrome.cast.media.MusicTrackMediaMetadata()
      : new chrome.cast.media.MovieMediaMetadata();
    mediaInfo.metadata.title = params.title;
    if (params.subtitle) mediaInfo.metadata.subtitle = params.subtitle;
    if (params.imageUrl) mediaInfo.metadata.images = [{ url: params.imageUrl }];
    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    session.loadMedia(request).catch((err: any) =>
      console.error('[Cast] Load media error:', err)
    );
  }, []);

  /** Cast a queue of tracks (plays in order). */
  const castQueue = useCallback(async (items: CastQueueItem[]) => {
    const session = await getOrCreateSession();
    if (!session) return;
    queueRef.current = items;
    const { chrome } = window;
    const queueItems = items.map((item, i) => {
      const mi = new chrome.cast.media.MediaInfo(item.url, item.contentType);
      mi.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
      mi.metadata.title = item.title;
      if (item.subtitle) mi.metadata.artist = item.subtitle;
      if (item.imageUrl) mi.metadata.images = [{ url: item.imageUrl }];
      return new chrome.cast.media.QueueItem(mi, { itemId: i, autoplay: true });
    });
    const request = new chrome.cast.media.QueueLoadRequest(queueItems);
    session.queueLoad(request).catch((err: any) =>
      console.error('[Cast] Queue load error:', err)
    );
  }, []);

  const stopCasting = useCallback(() => {
    const ctx = window.cast?.framework?.CastContext.getInstance();
    ctx?.endCurrentSession(true);
  }, []);

  return {
    isCastAvailable,
    isCasting,
    castDeviceName,
    castTrack,
    castMedia,
    castQueue,
    stopCasting,
  };
};
