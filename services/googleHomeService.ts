/**
 * Google Home / Google Assistant Integration
 *
 * Two layers:
 *   1. Google Actions SDK — conversational skill served at /api/google-action
 *      "Hey Google, talk to Plajah" → custom voice UI
 *
 *   2. Google Cast — already handled by useGoogleCast hook on the web side
 *      and PlajahCastOptionsProvider + PlajahMediaService on Android.
 *      This file provides the web-app-side Cast helpers.
 *
 * Setup:
 *   - Google Actions Console: console.actions.google.com
 *   - Enable: Actions on Google SDK → Conversational Actions
 *   - Fulfillment webhook: https://plajah.com/api/google-action
 *   - Deploy: gactions push && gactions deploy preview
 */

// ─── Google Actions fulfillment types ─────────────────────────────────────────

export interface GoogleActionRequest {
  handler: { name: string };
  intent: { name: string; params: Record<string, { original: string; resolved: string }> };
  scene: { name: string; slots?: any };
  session: { id: string; params: Record<string, any>; languageCode: string };
  user: {
    params: Record<string, any>;
    accountLinkingStatus?: 'LINKED' | 'NOT_LINKED';
    locale: string;
  };
  home: { params: Record<string, any> };
  device: { capabilities: string[] };
}

export interface GoogleSimpleResponse {
  speech: string;
  text?: string;
}

export interface GoogleActionResponse {
  session?: { params: Record<string, any> };
  prompt?: {
    override: boolean;
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

const simple = (speech: string, text?: string): GoogleActionResponse => ({
  prompt: {
    override: false,
    firstSimple: { speech, text: text ?? speech },
  },
});

const withCard = (
  speech: string,
  card: NonNullable<NonNullable<GoogleActionResponse['prompt']>['content']>['card']
): GoogleActionResponse => ({
  prompt: {
    override: false,
    firstSimple: { speech },
    content: { card },
  },
});

const withAudio = (
  speech: string,
  url: string,
  title: string,
  artist: string,
  artUrl?: string
): GoogleActionResponse => ({
  prompt: {
    override: true,
    firstSimple: { speech },
    content: {
      media: {
        mediaType: 'AUDIO',
        mediaObjects: [
          {
            name: title,
            description: artist,
            url,
            ...(artUrl && { image: { large: { url: artUrl, alt: title } } }),
          },
        ],
      },
    },
  },
});

// ─── Intent handlers ───────────────────────────────────────────────────────────

type ActionHandler = (req: GoogleActionRequest) => GoogleActionResponse;

const handlers: Record<string, ActionHandler> = {
  'actions.intent.MAIN': () =>
    simple(
      "Welcome to Plajah! I can play music, start your creator feed, or tell you what's trending. What would you like?",
      "Welcome to Plajah"
    ),

  'actions.intent.NO_INPUT_1': () =>
    simple("I didn't hear you. Try saying play music or start my feed."),

  'actions.intent.NO_INPUT_2': () =>
    simple("I still didn't hear you. Goodbye!", "Goodbye"),

  PlayMusic(req) {
    const artist = req.intent.params?.artist?.resolved ?? '';
    const track = req.intent.params?.track?.resolved ?? '';
    const query = artist || track;
    return simple(
      query ? `Playing ${query} on Plajah.` : 'Starting your Plajah music feed.'
    );
  },

  OpenFASTChannel: () =>
    withCard(
      "Opening your Plajah TV channel.",
      {
        title: "Plajah TV",
        text: "Your 24/7 creator channel is live.",
        button: { name: "Open Plajah TV", open: { url: "https://plajah.com/tv" } },
      }
    ),

  GetTrending: () =>
    withCard(
      "Here are the trending artists on Plajah right now.",
      {
        title: "Trending on Plajah",
        text: "Visit Plajah to see the full trending chart.",
        button: { name: "Open Plajah", open: { url: "https://plajah.com/explore" } },
      }
    ),

  'actions.intent.CANCEL': () =>
    simple("Goodbye! Come back to Plajah anytime.", "Goodbye"),

  'actions.intent.HELP': () =>
    simple(
      "You can say: play music, play an artist name, open my TV channel, or what's trending. What would you like to do?",
      "Plajah Help"
    ),
};

// ─── Main handler ──────────────────────────────────────────────────────────────

export const handleGoogleActionRequest = (body: GoogleActionRequest): GoogleActionResponse => {
  const handler = handlers[body.intent.name] ?? handlers['actions.intent.MAIN'];
  return handler(body);
};

// ─── Cast helpers (web-side, used with useGoogleCast hook) ─────────────────────

export const CAST_APP_ID = 'CC1AD845'; // Default Media Receiver — replace with custom app ID when built

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
