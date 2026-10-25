// Entry points people can share: each main landing page of Plajah gets a link whose preview card
// names the service (server.ts mirrors this table for the /share?type=app card).
import type { AppView } from '../../types';

export interface ServiceShare { slug: string; name: string; blurb: string }

export const SERVICE_SHARE: Partial<Record<AppView, ServiceShare>> = {
  DASHBOARD:      { slug: 'home',     name: 'Plajah',          blurb: 'Music, video, film, books, live and community — one platform.' },
  MUSIC:          { slug: 'chora',    name: 'Chora',           blurb: 'Stream and release music, albums and mixes on Plajah.' },
  VIDEOS:         { slug: 'reello',   name: 'Reello',          blurb: 'Watch creator videos, shorts and live on Plajah Reello.' },
  MOVIES_TV:      { slug: 'cinema',   name: 'Cinema',          blurb: 'Films and series — classics, indies and originals on Plajah Cinema.' },
  BOOKS:          { slug: 'lorea',    name: 'Lorea',           blurb: 'Read free classics and creator books in the Lorea reader.' },
  PLAJAH_ELEVATE: { slug: 'elevate',  name: 'Plajah Elevate',  blurb: 'The home for churches, nonprofits, charities and cultural institutions.' },
  PLAJAH_SPORTS:  { slug: 'sports',   name: 'Plajah Sports',   blurb: 'Scores, standings, teams and live sports on Plajah.' },
  FEED:           { slug: 'social',   name: 'Plajah Social',   blurb: 'Posts, stories and conversations from the Plajah community.' },
  GAMES:          { slug: 'games',    name: 'Plajah Games',    blurb: 'Play games on Plajah.' },
  LIVE_HUB:       { slug: 'live',     name: 'Plajah Live',     blurb: 'Watch who is live on Plajah right now.' },
  APPS:           { slug: 'apps',     name: 'Plajah Apps',     blurb: 'Every Plajah app and studio in one place.' },
  MELOS:          { slug: 'chora-studio', name: 'Chora Studio', blurb: 'Music production, powered by Melos.' },
  FABULA:         { slug: 'fabula',   name: 'Fabula',          blurb: 'The AI film editor on Plajah.' },
  PLAJAH_PIXELS:  { slug: 'pixels',   name: 'Plajah Pixels',   blurb: 'Live visuals and VJ performance.' },
  ACADEMIA_HOME:  { slug: 'academia', name: 'Plajah Academia', blurb: 'Classes, assignments and learning on Plajah.' },
  PLAJAH_BUSINESS:{ slug: 'business', name: 'Plajah Business', blurb: 'Run your business on Plajah.' },
};
