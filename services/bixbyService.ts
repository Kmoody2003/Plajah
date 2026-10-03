/**
 * Samsung Bixby Fulfillment Service for Chora (Plajah Music)
 *
 * Handles requests from Samsung Bixby Capsules on Samsung Galaxy devices,
 * Samsung Smart TVs, and Galaxy Watches.
 * Supports:
 *   - "Hi Bixby, ask Chora to play <song>"
 *   - "Hi Bixby, ask Chora to play music by <artist>"
 *   - "Hi Bixby, ask Chora to play a DJ mix"
 *   - "Hi Bixby, pause / resume / next track on Chora"
 */

import {
  ChoraVoiceTrack,
  searchChora,
  getChoraTrackByToken,
} from './alexaService.js';

export interface BixbyRequest {
  action?: string;
  intent?: string;
  params?: {
    song?: string;
    artist?: string;
    album?: string;
    genre?: string;
    type?: string;
    control?: 'PAUSE' | 'RESUME' | 'NEXT' | 'PREVIOUS' | 'STOP';
    token?: string;
    delta?: number;
  };
  device?: {
    deviceType?: 'MOBILE' | 'TV' | 'WATCH' | 'SPEAKER';
    locale?: string;
  };
}

export interface BixbyAudioItem {
  id: string;
  streamUrl: string;
  title: string;
  artist: string;
  albumTitle?: string;
  albumArtUrl?: string;
  durationMs?: number;
  token: string;
}

export interface BixbyResponse {
  status: 'SUCCESS' | 'NOT_FOUND' | 'ERROR';
  dialog: {
    speech: string;
    displayText?: string;
  };
  audioPlayer?: {
    action: 'PLAY' | 'STOP' | 'PAUSE' | 'RESUME' | 'ENQUEUE';
    item?: BixbyAudioItem;
    expectedPreviousToken?: string;
  };
  view?: {
    type: 'AUDIO_CARD' | 'LIST' | 'MESSAGE';
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    punchOutUrl?: string;
  };
}

export const formatBixbyAudioItem = (track: ChoraVoiceTrack): BixbyAudioItem => ({
  id: track.id,
  streamUrl: track.url,
  title: track.title,
  artist: track.artist,
  albumTitle: track.albumTitle,
  albumArtUrl: track.cover,
  token: `${track.albumId}::${track.index}`,
});

export const handleBixbyRequest = async (
  req: BixbyRequest,
  getTracks: () => Promise<ChoraVoiceTrack[]>
): Promise<BixbyResponse> => {
  const action = req.action || req.intent || 'PlaySong';
  const params = req.params || {};

  switch (action) {
    case 'PlaySong':
    case 'PlayMusic': {
      const { song, artist } = params;
      if (!song && !artist) {
        return {
          status: 'NOT_FOUND',
          dialog: {
            speech: 'What song or artist would you like to hear on Chora?',
            displayText: 'Say a song or artist on Chora',
          },
        };
      }

      const tracks = await getTracks();
      const match = searchChora(tracks, { song, artist });

      if (!match) {
        const queryText = song || artist || 'that';
        return {
          status: 'NOT_FOUND',
          dialog: {
            speech: `Sorry, I couldn't find ${queryText} on Chora.`,
            displayText: `Track not found: ${queryText}`,
          },
        };
      }

      const audioItem = formatBixbyAudioItem(match);
      return {
        status: 'SUCCESS',
        dialog: {
          speech: `Playing ${match.title} by ${match.artist} on Chora.`,
          displayText: `Playing ${match.title} • ${match.artist}`,
        },
        audioPlayer: {
          action: 'PLAY',
          item: audioItem,
        },
        view: {
          type: 'AUDIO_CARD',
          title: match.title,
          subtitle: match.artist,
          imageUrl: match.cover,
          punchOutUrl: `https://plajah.com/chora?track=${match.id}`,
        },
      };
    }

    case 'PlayArtist': {
      const { artist } = params;
      if (!artist) {
        return {
          status: 'NOT_FOUND',
          dialog: { speech: 'Which artist would you like to hear on Chora?' },
        };
      }

      const tracks = await getTracks();
      const match = searchChora(tracks, { artist });

      if (!match) {
        return {
          status: 'NOT_FOUND',
          dialog: { speech: `Sorry, I couldn't find songs by ${artist} on Chora.` },
        };
      }

      const audioItem = formatBixbyAudioItem(match);
      return {
        status: 'SUCCESS',
        dialog: { speech: `Playing music by ${match.artist} on Chora.` },
        audioPlayer: { action: 'PLAY', item: audioItem },
        view: {
          type: 'AUDIO_CARD',
          title: match.title,
          subtitle: match.artist,
          imageUrl: match.cover,
        },
      };
    }

    case 'PlayAlbum': {
      const { album, artist } = params;
      const tracks = await getTracks();
      const match = searchChora(tracks, { album, artist });

      if (!match) {
        return {
          status: 'NOT_FOUND',
          dialog: { speech: `Sorry, I couldn't find the album ${album || ''} on Chora.` },
        };
      }

      const audioItem = formatBixbyAudioItem(match);
      return {
        status: 'SUCCESS',
        dialog: { speech: `Playing the album ${match.albumTitle || album} on Chora.` },
        audioPlayer: { action: 'PLAY', item: audioItem },
        view: {
          type: 'AUDIO_CARD',
          title: match.title,
          subtitle: match.artist,
          imageUrl: match.cover,
        },
      };
    }

    case 'PlayMix': {
      const { genre } = params;
      const tracks = await getTracks();
      const match = searchChora(tracks, { isMix: true, genre }) || tracks[0];

      if (!match) {
        return {
          status: 'NOT_FOUND',
          dialog: { speech: 'No Chora mixes are currently available.' },
        };
      }

      const audioItem = formatBixbyAudioItem(match);
      return {
        status: 'SUCCESS',
        dialog: { speech: `Playing ${match.title} on Chora.` },
        audioPlayer: { action: 'PLAY', item: audioItem },
        view: {
          type: 'AUDIO_CARD',
          title: match.title,
          subtitle: 'Chora Mix',
          imageUrl: match.cover,
        },
      };
    }

    case 'ControlPlayback': {
      const control = params.control || 'STOP';
      if (control === 'PAUSE' || control === 'STOP') {
        return {
          status: 'SUCCESS',
          dialog: { speech: 'Paused Chora playback.' },
          audioPlayer: { action: 'PAUSE' },
        };
      }

      if (control === 'NEXT' && params.token) {
        const tracks = await getTracks();
        const nextTrack = getChoraTrackByToken(tracks, params.token, 1);
        if (nextTrack) {
          const item = formatBixbyAudioItem(nextTrack);
          return {
            status: 'SUCCESS',
            dialog: { speech: `Up next: ${nextTrack.title} by ${nextTrack.artist}` },
            audioPlayer: { action: 'PLAY', item },
          };
        }
        return {
          status: 'SUCCESS',
          dialog: { speech: 'That was the last track in this album.' },
        };
      }

      if (control === 'PREVIOUS' && params.token) {
        const tracks = await getTracks();
        const prevTrack = getChoraTrackByToken(tracks, params.token, -1);
        if (prevTrack) {
          const item = formatBixbyAudioItem(prevTrack);
          return {
            status: 'SUCCESS',
            dialog: { speech: `Playing ${prevTrack.title} by ${prevTrack.artist}` },
            audioPlayer: { action: 'PLAY', item },
          };
        }
        return {
          status: 'SUCCESS',
          dialog: { speech: 'This is the first track.' },
        };
      }

      return {
        status: 'SUCCESS',
        dialog: { speech: 'Resuming Chora.' },
        audioPlayer: { action: 'RESUME' },
      };
    }

    default:
      return {
        status: 'SUCCESS',
        dialog: {
          speech: 'Welcome to Chora on Plajah. You can ask Bixby to play a song, artist, album, or DJ mix.',
        },
      };
  }
};
