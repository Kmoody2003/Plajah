/**
 * Alexa Skill Fulfillment Handler
 *
 * Alexa sends signed HTTPS POST requests to /api/alexa (defined in server.ts).
 * This handles the Custom Skill (voice UI) and AudioPlayer directives (music playback).
 *
 * Alexa Skill setup (developer.amazon.com/alexa/console):
 *   - Skill name: "Plajah"
 *   - Invocation: "Plajah" or "my playlist"
 *   - Interface: AudioPlayer enabled
 *   - Endpoint: https://plajah.com/api/alexa
 *
 * For Alexa Music Skill (separate from Custom Skill):
 *   - Use the Music Skill API — it allows Alexa to natively control Plajah
 *     when users say "Alexa, play [artist] on Plajah"
 *   - Requires a separate skill manifest and catalog feed
 */

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
  context: {
    AudioPlayer?: {
      token?: string;
      offsetInMilliseconds?: number;
      playerActivity: 'IDLE' | 'PAUSED' | 'PLAYING' | 'BUFFER_UNDERRUN' | 'FINISHED' | 'STOPPED';
    };
    System: {
      device: { deviceId: string; supportedInterfaces: Record<string, any> };
      application: { applicationId: string };
      user: { userId: string; accessToken?: string };
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
      image?: { smallImageUrl: string; largeImageUrl: string };
    };
    directives?: any[];
    reprompt?: { outputSpeech: { type: 'PlainText'; text: string } };
    shouldEndSession: boolean;
  };
}

// ─── Builder helpers ───────────────────────────────────────────────────────────

export const speak = (text: string, endSession = true): AlexaResponse => ({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text },
    shouldEndSession: endSession,
  },
});

export const speakWithCard = (
  text: string,
  title: string,
  cardText: string,
  endSession = true
): AlexaResponse => ({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text },
    card: { type: 'Simple', title, content: cardText },
    shouldEndSession: endSession,
  },
});

export const audioPlay = (params: {
  url: string;
  token: string;
  title: string;
  artist: string;
  albumArt?: string;
  offsetMs?: number;
}): AlexaResponse => ({
  version: '1.0',
  response: {
    directives: [
      {
        type: 'AudioPlayer.Play',
        playBehavior: 'REPLACE_ALL',
        audioItem: {
          stream: {
            url: params.url,
            token: params.token,
            offsetInMilliseconds: params.offsetMs ?? 0,
          },
          metadata: {
            title: params.title,
            subtitle: params.artist,
            ...(params.albumArt && {
              art: { sources: [{ url: params.albumArt, widthPixels: 512, heightPixels: 512 }] },
              backgroundImage: { sources: [{ url: params.albumArt }] },
            }),
          },
        },
      },
    ],
    shouldEndSession: true,
  },
});

const audioStop = (): AlexaResponse => ({
  version: '1.0',
  response: {
    directives: [{ type: 'AudioPlayer.Stop' }],
    shouldEndSession: true,
  },
});

// ─── Slot helpers ──────────────────────────────────────────────────────────────

const slot = (slots: Record<string, AlexaSlot> | undefined, name: string): string => {
  if (!slots) return '';
  const s = slots[name];
  return s?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name ?? s?.value ?? '';
};

// ─── Intent handlers ───────────────────────────────────────────────────────────

type IntentHandler = (req: AlexaRequest) => Promise<AlexaResponse> | AlexaResponse;

const intentHandlers: Record<string, IntentHandler> = {
  PlayMusicIntent(req) {
    const artist = slot(req.request.intent?.slots, 'ArtistName');
    const track = slot(req.request.intent?.slots, 'TrackName');
    const query = artist || track;
    return speak(
      query
        ? `Playing ${query} on Plajah.`
        : 'Starting your Plajah music feed.',
      true
    );
  },

  PauseIntent: () => audioStop(),
  'AMAZON.PauseIntent': () => audioStop(),
  'AMAZON.StopIntent': () => audioStop(),
  'AMAZON.CancelIntent': () => audioStop(),

  'AMAZON.ResumeIntent': () =>
    speak('Resuming Plajah.', true),

  'AMAZON.NextIntent': () => ({
    version: '1.0',
    response: {
      directives: [{ type: 'AudioPlayer.ClearQueue', clearBehavior: 'CLEAR_ALL' }],
      shouldEndSession: true,
    },
  }),

  'AMAZON.HelpIntent': () =>
    speak(
      "You can say: play music, pause, resume, or play an artist name. What would you like to do?",
      false
    ),

  OpenFASTChannelIntent: () =>
    speakWithCard(
      "Opening your Plajah TV channel.",
      "Plajah TV",
      "Your 24/7 creator channel is live at plajah.com/tv",
      true
    ),
};

// ─── AudioPlayer event handlers ────────────────────────────────────────────────

const audioPlayerHandlers: Record<string, IntentHandler> = {
  'AudioPlayer.PlaybackStarted': () => ({ version: '1.0', response: { shouldEndSession: true } }),
  'AudioPlayer.PlaybackFinished': () => ({ version: '1.0', response: { shouldEndSession: true } }),
  'AudioPlayer.PlaybackStopped': () => ({ version: '1.0', response: { shouldEndSession: true } }),
  'AudioPlayer.PlaybackNearlyFinished': () => ({ version: '1.0', response: { shouldEndSession: true } }),
  'AudioPlayer.PlaybackFailed': () => ({ version: '1.0', response: { shouldEndSession: true } }),
};

// ─── Main handler ──────────────────────────────────────────────────────────────

export const handleAlexaRequest = async (body: AlexaRequest): Promise<AlexaResponse> => {
  const { request } = body;

  if (request.type === 'LaunchRequest') {
    return speak(
      "Welcome to Plajah. I can play music, start your feed, or open your TV channel. What would you like?",
      false
    );
  }

  if (request.type === 'IntentRequest' && request.intent) {
    const handler = intentHandlers[request.intent.name];
    if (handler) return handler(body);
    return speak("Sorry, I didn't catch that. Try saying play music or pause.", true);
  }

  if (request.type in audioPlayerHandlers) {
    return audioPlayerHandlers[request.type](body);
  }

  if (request.type === 'SessionEndedRequest') {
    return { version: '1.0', response: { shouldEndSession: true } };
  }

  return speak("Something went wrong. Please try again.", true);
};
