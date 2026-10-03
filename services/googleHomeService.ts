/**
 * Google Home / Google Assistant Integration for Chora (Plajah Music)
 *
 * Provides two integration layers:
 *   1. Google Actions SDK — Conversational fulfillment webhook served at /api/google-action
 *      Supports "Hey Google, talk to Chora" → voice search & Audio Media playback on Nest / Google Home.
 *   2. Google Cast — Cast receiver metadata helpers for streaming from Plajah to Nest / Chromecast.
 */

import { ChoraVoiceTrack, searchChora, getChoraTrackByToken } from './alexaService.js';

// ─── Google Actions Fulfillment Types ─────────────────────────────────────────

export interface GoogleActionRequest {
  handler?: { name: string };
  intent: {
    name: string;
    params?: Record<string, { original?: string; resolved?: string }>;
  };
  scene?: { name: string; slots?: Record<string, any> };
  session?: {
    id: string;
    params?: Record<string, any>;
    languageCode?: string;
  };
  user?: {
    params?: Record<string, any>;
    accountLinkingStatus?: 'LINKED' | 'NOT_LINKED';
    locale?: string;
  };
  home?: { params?: Record<string, any> };
  device?: { capabilities?: string[] };
  context?: {
    media?: {
      progress?: string;
    };
  };
}

export interface GoogleSimpleResponse {
  speech: string;
  text?: string;
}

export interface GoogleActionResponse {
  session?: { params?: Record<string, any> };
  prompt?: {
    override?: boolean;
    firstSimple?: GoogleSimpleResponse;
    content?: {
      card?: {
        title: string;
        text: string;
        image?: { url: string; alt: string; height?: number; width?: number };
        button?: { name: string; open: { url: string } };
      };
      media?: {
        mediaType: 'AUDIO';
        startOffset?: string;
        mediaObjects: Array<{
          name: string;
          description?: string;
          url: string;
          image?: { large: { url: string; alt: string } };
        }>;
      };
      list?: {
        title?: string;
        items: Array<{ key: string }>;
      };
    };
    suggestions?: Array<{ title: string }>;
  };
}

// ─── Builder helpers ───────────────────────────────────────────────────────────

export const googleSimple = (speech: string, text?: string, suggestions?: string[]): GoogleActionResponse => ({
  prompt: {
    override: false,
    firstSimple: { speech, text: text ?? speech },
    suggestions: suggestions ? suggestions.map(title => ({ title })) : undefined,
  },
});

export const googleWithCard = (
  speech: string,
  card: NonNullable<NonNullable<GoogleActionResponse['prompt']>['content']>['card'],
  suggestions?: string[]
): GoogleActionResponse => ({
  prompt: {
    override: false,
    firstSimple: { speech },
    content: { card },
    suggestions: suggestions ? suggestions.map(title => ({ title })) : undefined,
  },
});

export const googleWithAudio = (
  speech: string,
  track: ChoraVoiceTrack,
  startOffset?: string,
  sessionParams?: Record<string, any>
): GoogleActionResponse => ({
  session: sessionParams ? { params: sessionParams } : undefined,
  prompt: {
    override: true,
    firstSimple: { speech, text: speech },
    content: {
      media: {
        mediaType: 'AUDIO',
        startOffset: startOffset || '0s',
        mediaObjects: [
          {
            name: track.title,
            description: `${track.artist}${track.albumTitle ? ` • ${track.albumTitle}` : ''}`,
            url: track.url,
            image: track.cover
              ? { large: { url: track.cover, alt: `${track.title} cover art` } }
              : undefined,
          },
        ],
      },
    },
    suggestions: [
      { title: 'Next track' },
      { title: 'Play another mix' },
      { title: 'Stop' },
    ],
  },
});

// ─── Main Google Action Handler ────────────────────────────────────────────────

export const handleGoogleActionRequest = async (
  body: GoogleActionRequest,
  getTracks: () => Promise<ChoraVoiceTrack[]>
): Promise<GoogleActionResponse> => {
  const intentName = body.intent?.name || 'actions.intent.MAIN';
  const params = body.intent?.params || {};

  const getParam = (key: string): string => {
    return params[key]?.resolved || params[key]?.original || '';
  };

  switch (intentName) {
    case 'actions.intent.MAIN':
    case 'WelcomeIntent':
      return googleSimple(
        'Welcome to Chora on Plajah! You can ask me to play a song, an artist, an album, or a DJ mix. What would you like to hear?',
        'Welcome to Chora on Plajah',
        ['Play music', 'Play a DJ mix', 'Help']
      );

    case 'PlayMusic':
    case 'PlaySong':
    case 'PlayArtist':
    case 'PlayAlbum':
    case 'PlayMix': {
      const song = getParam('song') || getParam('track');
      const artist = getParam('artist');
      const album = getParam('album');
      const genre = getParam('genre');
      const isMix = intentName === 'PlayMix' || getParam('type') === 'mix';

      const tracks = await getTracks();
      const match = searchChora(tracks, { song, artist, album, genre, isMix }) || (isMix ? tracks[0] : null);

      if (!match) {
        const queryDesc = song || artist || album || 'that';
        return googleSimple(
          `Sorry, I couldn't find ${queryDesc} on Chora. You can ask for another song, artist, or mix.`,
          `Could not find ${queryDesc} on Chora`,
          ['Play a mix', 'Play trending music']
        );
      }

      const speech = `Playing ${match.title} by ${match.artist} on Chora.`;
      const token = `${match.albumId}::${match.index}`;

      return googleWithAudio(speech, match, '0s', {
        currentTrackToken: token,
        currentAlbumId: match.albumId,
      });
    }

    case 'actions.intent.MEDIA_STATUS': {
      // Google Assistant notifies when media playback finishes
      const sessionParams = body.session?.params || {};
      const currentToken = sessionParams.currentTrackToken;
      if (currentToken) {
        const tracks = await getTracks();
        const nextTrack = getChoraTrackByToken(tracks, currentToken, 1);
        if (nextTrack) {
          const speech = `Up next: ${nextTrack.title} by ${nextTrack.artist}`;
          const nextToken = `${nextTrack.albumId}::${nextTrack.index}`;
          return googleWithAudio(speech, nextTrack, '0s', {
            currentTrackToken: nextToken,
            currentAlbumId: nextTrack.albumId,
          });
        }
      }
      return googleSimple('That was the last track in this album on Chora.');
    }

    case 'NextTrack': {
      const sessionParams = body.session?.params || {};
      const currentToken = sessionParams.currentTrackToken;
      const tracks = await getTracks();
      const nextTrack = currentToken ? getChoraTrackByToken(tracks, currentToken, 1) : tracks[0];
      if (!nextTrack) {
        return googleSimple('That was the last track in this album.');
      }
      const nextToken = `${nextTrack.albumId}::${nextTrack.index}`;
      return googleWithAudio(`Playing ${nextTrack.title} by ${nextTrack.artist}`, nextTrack, '0s', {
        currentTrackToken: nextToken,
        currentAlbumId: nextTrack.albumId,
      });
    }

    case 'PreviousTrack': {
      const sessionParams = body.session?.params || {};
      const currentToken = sessionParams.currentTrackToken;
      const tracks = await getTracks();
      const prevTrack = currentToken ? getChoraTrackByToken(tracks, currentToken, -1) : null;
      if (!prevTrack) {
        return googleSimple('This is the first track.');
      }
      const prevToken = `${prevTrack.albumId}::${prevTrack.index}`;
      return googleWithAudio(`Playing ${prevTrack.title} by ${prevTrack.artist}`, prevTrack, '0s', {
        currentTrackToken: prevToken,
        currentAlbumId: prevTrack.albumId,
      });
    }

    case 'actions.intent.NO_INPUT_1':
      return googleSimple("I didn't catch that. What song, artist, or mix would you like to hear on Chora?");

    case 'actions.intent.NO_INPUT_2':
    case 'actions.intent.CANCEL':
      return googleSimple('Goodbye from Chora on Plajah!', 'Goodbye');

    case 'actions.intent.HELP':
      return googleSimple(
        'You can say: play a song title, play an artist name, play an album, or play a DJ mix. What would you like to hear?',
        'Chora Voice Help',
        ['Play music', 'Play a mix', 'Stop']
      );

    default:
      return googleSimple("Sorry, I didn't catch that. Ask Chora to play a song, artist, or mix.");
  }
};

// ─── Google Cast helpers (for streaming directly to Google Home / Nest speakers) ───

export const CAST_APP_ID = 'CC1AD845'; // Default Media Receiver

export interface CastMediaParams {
  url: string;
  contentType: 'audio/mpeg' | 'video/mp4' | 'application/x-mpegURL';
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

export const buildCastMediaInfo = (params: CastMediaParams) => ({
  contentId: params.url,
  contentType: params.contentType,
  streamType: 'BUFFERED',
  metadata: {
    metadataType: params.contentType.startsWith('audio') ? 3 : 1,
    title: params.title,
    subtitle: params.subtitle ?? '',
    images: params.imageUrl ? [{ url: params.imageUrl }] : [],
  },
});
