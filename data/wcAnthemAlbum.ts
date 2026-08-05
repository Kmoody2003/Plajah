// Static World Cup 2026 National Anthems album — pre-built Album object
// that integrates with the standard PlayerView / AlbumView like any other project.
// Audio: local files in /public/audio/anthems/{teamId}.mp3 (CC BY 4.0, nationalanthems.info)
// Slideshow: flagcdn.com flag images for all 48 nations.

import type { Album, Track } from '../types';
import { WC26_TEAMS } from './worldCup2026';
import { ANTHEM_LYRICS, ANTHEM_AUDIO_PATH } from './anthemLyrics';

// WC26 team ID → ISO 3166-1 alpha-2 code for flagcdn.com
const TEAM_ISO2: Record<string, string> = {
  alg: 'dz', arg: 'ar', aus: 'au', aut: 'at', bel: 'be', bih: 'ba',
  bra: 'br', can: 'ca', civ: 'ci', cod: 'cd', col: 'co', cpv: 'cv',
  cro: 'hr', cuw: 'cw', cze: 'cz', egy: 'eg', eng: 'gb-eng', esp: 'es',
  fra: 'fr', ger: 'de', gha: 'gh', hai: 'ht', irn: 'ir', irq: 'iq',
  jpn: 'jp', jor: 'jo', kor: 'kr', ksa: 'sa', mar: 'ma', mex: 'mx',
  ned: 'nl', nga: 'ng', nor: 'no', nzl: 'nz', pan: 'pa', par: 'py',
  por: 'pt', qat: 'qa', rsa: 'za', sco: 'gb-sct', sen: 'sn', sui: 'ch',
  swe: 'se', tun: 'tn', tur: 'tr', ury: 'uy', usa: 'us', uzb: 'uz',
};

const flagUrl = (teamId: string) =>
  `https://flagcdn.com/w320/${TEAM_ISO2[teamId] ?? teamId}.png`;

const teamToTrack = (teamId: string, name: string, anthem: string): Track => ({
  id: `wc26-anthem-${teamId}`,
  title: anthem,
  artist: name,
  url: ANTHEM_AUDIO_PATH(teamId),
  lyrics: ANTHEM_LYRICS[teamId] ?? '',
  genre: 'National Anthem',
  images: [flagUrl(teamId)],
  albumId: 'wc2026-national-anthems',
  albumTitle: 'World Cup 2026 National Anthems',
  albumCover: flagUrl(teamId),
});

export const WC_ANTHEM_ALBUM: Album = {
  id: 'wc2026-national-anthems',
  title: 'World Cup 2026 National Anthems',
  artist: 'Various Nations',
  artistBio: '48 national anthems from every nation competing at FIFA World Cup 2026 in the USA, Canada & Mexico.',
  coverImage: flagUrl('usa'),
  description: 'Official national anthems of all 48 nations at FIFA World Cup 2026. Celebrate the countries of the world — in music.',
  linerNotes: 'Audio sourced from nationalanthems.info (CC BY 4.0). Lyrics in original language with English translations.',
  tracks: WC26_TEAMS.map(t => teamToTrack(t.id, t.name, t.anthem)),
  slideshow: WC26_TEAMS.map(t => flagUrl(t.id)),
  isSlideshowEnabled: true,
  createdAt: new Date('2026-06-09').getTime(),
  themeColor: '#FF8C00',
  isPublic: true,
  type: 'MUSIC',
  subType: 'PLAYLIST',
  genre: 'National Anthems',
  tags: ['World Cup', 'FIFA 2026', 'National Anthems', 'International'],
};
