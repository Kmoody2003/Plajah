// Exports the Halloween collection for the Ravencrest engine: the 13 films the experience
// places on roadside billboards and castle paintings (Pumpkin Patch hero + 12 curated).
// Usage: npx tsx scripts/ravencrest/exportFilms.ts  → public/games/ravencrest/films.json
import fs from 'node:fs';
import { CURATED_HALLOWEEN_FILMS, PUMPKIN_PATCH_HERO_ALBUM } from '../../services/archiveContentService';
import { getHalloweenStoryIntelBundle } from '../../data/halloweenStoryIntel';

const PP_ID = 'album_1787881859314_mlt23'; // matches PUMPKIN_PATCH_FILM_ID in HauntedCastleExhibition
const pp = getHalloweenStoryIntelBundle(PP_ID) as { report?: { logline?: string }; logline?: string } | undefined;
const films = [
  {
    id: PP_ID, hero: true, title: 'Pumpkin Patch', year: '2025', director: 'Brian James Gage', runtime: '',
    tagline: pp?.report?.logline || pp?.logline || 'Framed into District 13, Melvin Lester awakens dual plasma blades and his armored tank to rescue President Tepes before Wicked Witch Miriam breaches the human realm.',
    // Same cover the Plajah Cinema shows for the album; local copy if the remote can't texture.
    poster: PUMPKIN_PATCH_HERO_ALBUM.coverImage || '/covers/halloween/pumpkin-patch-cover.jpg',
    posterFallback: '/covers/halloween/pumpkin-patch-cover.jpg',
  },
  ...CURATED_HALLOWEEN_FILMS.slice(0, 12).map((f) => {
    const intel = getHalloweenStoryIntelBundle(f.identifier) as { report?: { logline?: string }; logline?: string } | undefined;
    return {
      id: f.identifier, hero: false, title: f.title, year: f.year || '', director: f.director || '', runtime: f.runtime || '',
      tagline: intel?.report?.logline || intel?.logline || f.description || '',
      poster: f.thumbnailUrl || '', // Plajah Cinema cover art
    };
  }),
];
fs.writeFileSync('public/games/ravencrest/films.json', JSON.stringify(films, null, 2));
console.log(`wrote ${films.length} films`, films.map((f) => f.title).join(' | '));
