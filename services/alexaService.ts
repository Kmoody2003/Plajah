/**
 * Alexa Skill Fulfillment Handler for Chora (Plajah Music)
 *
 * Handles both Amazon Alexa-hosted skills (via API bridge) and direct HTTPS webhook requests.
 * Uses the AudioPlayer interface for streaming audio, playlist enqueuing, and voice controls.
 */

import * as nodeCrypto from 'crypto';

export interface ChoraVoiceTrack {
  id: string;
  title: string;
  artist: string;
  albumId: string;
  albumTitle?: string;
  index: number;
  url: string;
  cover?: string;
  subType?: string; // 'MIX' for Chora Mixes (DJ sets)
  genre?: string;
}

export interface AlexaSlot {
  name: string;
  value?: string;
  resolutions?: {
    resolutionsPerAuthority: Array<{
      values: Array<{ value: { name: string; id: string } }>;
    }>;
  };
}

export interface AlexaRequest {
  version: string;
  session?: {
    sessionId: string;
    application: { applicationId: string };
    user: { userId: string; accessToken?: string };
    new: boolean;
  };
  context?: {
    AudioPlayer?: {
      token?: string;
      offsetInMilliseconds?: number;
      playerActivity?: 'IDLE' | 'PAUSED' | 'PLAYING' | 'BUFFER_UNDERRUN' | 'FINISHED' | 'STOPPED';
    };
    System?: {
      device?: { deviceId: string; supportedInterfaces: Record<string, any> };
      application?: { applicationId: string };
      user?: { userId: string; accessToken?: string };
    };
  };
  request: {
    type: string;
    requestId: string;
    timestamp: string;
    locale?: string;
    intent?: {
      name: string;
      confirmationStatus?: string;
      slots?: Record<string, AlexaSlot>;
    };
    token?: string;
    offsetInMilliseconds?: number;
    error?: { type: string; message: string };
  };
}

export interface AlexaResponse {
  version: '1.0';
  sessionAttributes?: Record<string, any>;
  response: {
    outputSpeech?: {
      type: 'PlainText' | 'SSML';
      text?: string;
      ssml?: string;
    };
    card?: {
      type: 'Simple' | 'Standard';
      title: string;
      text?: string;
      content?: string;
      image?: { smallImageUrl?: string; largeImageUrl?: string };
    };
    directives?: any[];
    reprompt?: { outputSpeech: { type: 'PlainText'; text: string } };
    shouldEndSession: boolean;
  };
}

// ─── Builder helpers ───────────────────────────────────────────────────────────

export const alexaSpeak = (text: string, endSession = true): AlexaResponse => ({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text },
    shouldEndSession: endSession,
  },
});

export const alexaSpeakWithReprompt = (text: string, repromptText: string): AlexaResponse => ({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text },
    reprompt: { outputSpeech: { type: 'PlainText', text: repromptText } },
    shouldEndSession: false,
  },
});

export const alexaAudioPlay = (
  track: ChoraVoiceTrack,
  offset = 0,
  speechText?: string
): AlexaResponse => {
  const token = `${track.albumId}::${track.index}`;
  const resp: AlexaResponse = {
    version: '1.0',
    response: {
      directives: [
        {
          type: 'AudioPlayer.Play',
          playBehavior: 'REPLACE_ALL',
          audioItem: {
            stream: {
              url: track.url,
              token,
              offsetInMilliseconds: offset,
            },
            metadata: {
              title: track.title,
              subtitle: track.artist,
              ...(track.cover ? { art: { sources: [{ url: track.cover }] } } : {}),
            },
          },
        },
      ],
      shouldEndSession: true,
    },
  };

  if (speechText) {
    resp.response.outputSpeech = { type: 'PlainText', text: speechText };
  }

  if (track.cover) {
    resp.response.card = {
      type: 'Standard',
      title: track.title,
      text: track.artist,
      image: { smallImageUrl: track.cover, largeImageUrl: track.cover },
    };
  } else {
    resp.response.card = {
      type: 'Simple',
      title: track.title,
      content: track.artist,
    };
  }

  return resp;
};

export const alexaAudioEnqueue = (
  track: ChoraVoiceTrack,
  prevToken: string
): AlexaResponse => {
  const token = `${track.albumId}::${track.index}`;
  return {
    version: '1.0',
    response: {
      directives: [
        {
          type: 'AudioPlayer.Play',
          playBehavior: 'ENQUEUE',
          audioItem: {
            stream: {
              url: track.url,
              token,
              offsetInMilliseconds: 0,
              expectedPreviousToken: prevToken,
            },
            metadata: {
              title: track.title,
              subtitle: track.artist,
              ...(track.cover ? { art: { sources: [{ url: track.cover }] } } : {}),
            },
          },
        },
      ],
      shouldEndSession: true,
    },
  };
};

export const alexaAudioStop = (): AlexaResponse => ({
  version: '1.0',
  response: {
    directives: [{ type: 'AudioPlayer.Stop' }],
    shouldEndSession: true,
  },
});

// ─── Slot helper ───────────────────────────────────────────────────────────────

export const getSlotValue = (slots: Record<string, AlexaSlot> | undefined, name: string): string => {
  if (!slots) return '';
  const s = slots[name];
  return s?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name ?? s?.value ?? '';
};

// ─── Chora Catalog Search & Matching ──────────────────────────────────────────

export const scoreChoraMatch = (
  track: ChoraVoiceTrack,
  params: { song?: string; artist?: string; album?: string; genre?: string; isMix?: boolean }
): number => {
  let score = 0;
  const tTitle = (track.title || '').toLowerCase();
  const tArtist = (track.artist || '').toLowerCase();
  const tAlbum = (track.albumTitle || '').toLowerCase();

  // If requesting a mix, heavily prioritize mix tracks
  if (params.isMix) {
    if (track.subType === 'MIX' || tTitle.includes('mix') || tAlbum.includes('mix')) {
      score += 50;
    }
  }

  if (params.song) {
    const q = params.song.toLowerCase().trim();
    if (tTitle === q) score += 100;
    else if (tTitle.includes(q) || q.includes(tTitle)) score += 60;
    else {
      const words = q.split(/\s+/).filter(w => w.length > 2);
      score += words.filter(w => tTitle.includes(w)).length * 15;
    }
  }

  if (params.artist) {
    const aq = params.artist.toLowerCase().trim();
    if (tArtist === aq) score += 80;
    else if (tArtist.includes(aq) || aq.includes(tArtist)) score += 40;
    else {
      const words = aq.split(/\s+/).filter(w => w.length > 2);
      score += words.filter(w => tArtist.includes(w)).length * 10;
    }
  }

  if (params.album) {
    const alq = params.album.toLowerCase().trim();
    if (tAlbum === alq) score += 90;
    else if (tAlbum.includes(alq) || alq.includes(tAlbum)) score += 50;
  }

  return score;
};

export const searchChora = (
  tracks: ChoraVoiceTrack[],
  params: { song?: string; artist?: string; album?: string; genre?: string; isMix?: boolean }
): ChoraVoiceTrack | null => {
  if (!tracks.length) return null;

  // Filter for album specific start
  if (params.album) {
    const alq = params.album.toLowerCase().trim();
    const albumTracks = tracks.filter(t => (t.albumTitle || '').toLowerCase().includes(alq));
    if (albumTracks.length) {
      albumTracks.sort((a, b) => a.index - b.index);
      return albumTracks[0];
    }
  }

  const scored = tracks
    .map(t => ({ track: t, score: scoreChoraMatch(t, params) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.track || null;
};

export const getChoraTrackByToken = (
  tracks: ChoraVoiceTrack[],
  token: string,
  delta = 0
): ChoraVoiceTrack | null => {
  if (!token) return null;
  const [albumId, idxStr] = String(token).split('::');
  const idx = parseInt(idxStr, 10);
  if (!albumId || isNaN(idx)) return null;

  return tracks.find(t => t.albumId === albumId && t.index === idx + delta) || null;
};

// ─── Main Alexa Dispatcher ────────────────────────────────────────────────────

export const handleAlexaRequest = async (
  env: AlexaRequest,
  getTracks: () => Promise<ChoraVoiceTrack[]>
): Promise<AlexaResponse> => {
  const type = env.request?.type;

  // 1. Launch Request
  if (type === 'LaunchRequest') {
    return alexaSpeakWithReprompt(
      'Welcome to Plajah. What would you like to hear on Chora? You can ask me to play a song, an artist, an album, or a mix.',
      'What would you like me to play on Chora? Say a song or artist name.'
    );
  }

  // 2. Intent Request
  if (type === 'IntentRequest') {
    const intent = env.request.intent || { name: '' };
    const name = intent.name;
    const slots = intent.slots;

    if (name === 'PlaySongIntent') {
      const song = getSlotValue(slots, 'song');
      const artist = getSlotValue(slots, 'artist');
      if (!song) {
        return alexaSpeakWithReprompt(
          'What song would you like me to play?',
          'Say the song title to play on Chora.'
        );
      }
      const tracks = await getTracks();
      const match = searchChora(tracks, { song, artist });
      if (!match) {
        return alexaSpeak(`Sorry, I couldn't find ${song} on Chora.`);
      }
      return alexaAudioPlay(match, 0, `Playing ${match.title} by ${match.artist} on Chora.`);
    }

    if (name === 'PlayArtistIntent') {
      const artist = getSlotValue(slots, 'artist');
      if (!artist) {
        return alexaSpeakWithReprompt(
          'Which artist would you like to hear?',
          'Say the name of an artist on Chora.'
        );
      }
      const tracks = await getTracks();
      const match = searchChora(tracks, { artist });
      if (!match) {
        return alexaSpeak(`Sorry, I couldn't find music by ${artist} on Chora.`);
      }
      return alexaAudioPlay(match, 0, `Playing music by ${match.artist} on Chora.`);
    }

    if (name === 'PlayAlbumIntent') {
      const album = getSlotValue(slots, 'album');
      const artist = getSlotValue(slots, 'artist');
      if (!album) {
        return alexaSpeakWithReprompt(
          'Which album would you like to hear?',
          'Say an album name on Chora.'
        );
      }
      const tracks = await getTracks();
      const match = searchChora(tracks, { album, artist });
      if (!match) {
        return alexaSpeak(`Sorry, I couldn't find the album ${album} on Chora.`);
      }
      return alexaAudioPlay(match, 0, `Playing the album ${match.albumTitle || album} on Chora.`);
    }

    if (name === 'PlayMixIntent') {
      const genre = getSlotValue(slots, 'genre');
      const tracks = await getTracks();
      const match = searchChora(tracks, { isMix: true, genre }) || tracks[0];
      if (!match) {
        return alexaSpeak('Sorry, there are no Chora mixes available right now.');
      }
      return alexaAudioPlay(match, 0, `Playing ${match.title} on Chora.`);
    }

    if (name === 'WhatsPlayingIntent') {
      const ap = env.context?.AudioPlayer;
      if (!ap || !ap.token) {
        return alexaSpeak('Nothing is currently playing on Chora.');
      }
      const tracks = await getTracks();
      const track = getChoraTrackByToken(tracks, ap.token);
      if (!track) {
        return alexaSpeak('I cannot determine the current track.');
      }
      return alexaSpeak(`You are listening to ${track.title} by ${track.artist} on Chora.`);
    }

    // Playback Controls
    if (name === 'AMAZON.PauseIntent' || name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent') {
      return alexaAudioStop();
    }

    if (name === 'AMAZON.ResumeIntent') {
      const ap = env.context?.AudioPlayer;
      if (!ap?.token) {
        return alexaSpeak('There is nothing to resume on Chora.');
      }
      const tracks = await getTracks();
      const track = getChoraTrackByToken(tracks, ap.token);
      if (!track) {
        return alexaSpeak('Unable to resume playback.');
      }
      const offset = ap.offsetInMilliseconds || 0;
      return alexaAudioPlay(track, offset);
    }

    if (name === 'AMAZON.NextIntent') {
      const ap = env.context?.AudioPlayer;
      if (!ap?.token) {
        return alexaSpeak('Nothing is currently playing.');
      }
      const tracks = await getTracks();
      const nextTrack = getChoraTrackByToken(tracks, ap.token, 1);
      if (!nextTrack) {
        return alexaSpeak('That was the last track in this album.');
      }
      return alexaAudioPlay(nextTrack, 0);
    }

    if (name === 'AMAZON.PreviousIntent') {
      const ap = env.context?.AudioPlayer;
      if (!ap?.token) {
        return alexaSpeak('Nothing is currently playing.');
      }
      const tracks = await getTracks();
      const prevTrack = getChoraTrackByToken(tracks, ap.token, -1);
      if (!prevTrack) {
        return alexaSpeak('This is the first track.');
      }
      return alexaAudioPlay(prevTrack, 0);
    }

    if (name === 'AMAZON.StartOverIntent' || name === 'AMAZON.RepeatIntent') {
      const ap = env.context?.AudioPlayer;
      if (!ap?.token) return alexaSpeak('Nothing is playing.');
      const tracks = await getTracks();
      const currentTrack = getChoraTrackByToken(tracks, ap.token, 0);
      if (!currentTrack) return alexaSpeak('Unable to restart track.');
      return alexaAudioPlay(currentTrack, 0);
    }

    if (name === 'AMAZON.HelpIntent') {
      return alexaSpeakWithReprompt(
        'You can ask Chora to play a song, an artist, an album, or a DJ mix. Say pause, resume, or next anytime. What would you like to hear?',
        'What would you like to listen to on Chora?'
      );
    }

    return alexaSpeak("Sorry, I didn't catch that. You can ask Chora to play a song, artist, album, or mix.");
  }

  // 3. AudioPlayer Directives & Callbacks
  if (typeof type === 'string' && type.startsWith('AudioPlayer.')) {
    // Gapless album auto-advance: enqueue the next track as the current one nears its end
    if (type === 'AudioPlayer.PlaybackNearlyFinished') {
      const currentToken = env.request.token;
      if (currentToken) {
        const tracks = await getTracks();
        const nextTrack = getChoraTrackByToken(tracks, currentToken, 1);
        if (nextTrack) {
          return alexaAudioEnqueue(nextTrack, currentToken);
        }
      }
    }
    return { version: '1.0', response: { shouldEndSession: true } };
  }

  if (type === 'SessionEndedRequest') {
    return { version: '1.0', response: { shouldEndSession: true } };
  }

  return alexaSpeak('Sorry, something went wrong with Chora.');
};

// ─── Signature Verification for Direct Webhook Mode ────────────────────────────

const _alexaCerts = new Map<string, string>();

export const verifyAlexaSignature = async (
  certUrl: string,
  signature: string,
  body: Buffer
): Promise<boolean> => {
  try {
    const u = new URL(certUrl);
    if (
      u.protocol !== 'https:' ||
      u.hostname.toLowerCase() !== 's3.amazonaws.com' ||
      (u.port && u.port !== '443') ||
      !u.pathname.replace(/\/+/g, '/').startsWith('/echo.api/')
    ) {
      return false;
    }

    let pem = _alexaCerts.get(certUrl);
    if (!pem) {
      const r = await fetch(certUrl);
      if (!r.ok) return false;
      pem = await r.text();
      const x509 = new nodeCrypto.X509Certificate(pem);
      const now = new Date();
      if (new Date(x509.validFrom) > now || new Date(x509.validTo) < now) return false;
      if (!/echo-api\.amazon\.com/.test(`${x509.subjectAltName || ''}`)) return false;
      _alexaCerts.set(certUrl, pem);
    }

    const verifier = nodeCrypto.createVerify('RSA-SHA1');
    verifier.update(body);
    return verifier.verify(pem, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
};
