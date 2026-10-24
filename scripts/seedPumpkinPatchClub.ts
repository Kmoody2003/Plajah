// seedPumpkinPatchClub: set up the OFFICIAL Pumpkin Patch Club on Brian James Gage's account (admin seed).
//
//   npx tsx scripts/seedPumpkinPatchClub.ts              DRY RUN (default): reads his account/World/Sanctuary, writes NOTHING
//   npx tsx scripts/seedPumpkinPatchClub.ts --publish    writes the club, his OWNER membership, the art gallery and the links
//
// Everything is his: creatorId/admins/OWNER membership/gallery uploader are his uid, so he has full control in the app; the admin
// running this appears nowhere. The club is public, category Film (shows on the Cinema page), with one room per fan-room team
// (services/halloween/pumpkinPatchClub.ts). It is linked both ways to his Pumpkin Patch World (associatedClubIds) and his
// Sanctuary (linkedClubIds — the Sanctuary lists the club's team rooms). Re-running updates in place (stable ids, createdAt kept).
// Auth: the signed-in gcloud user (`gcloud auth print-access-token`), same as scripts/showcase/*. Writes go to the production database.
import { getDoc, putDoc, patchFields } from './showcase/gcp';
import {
  PUMPKIN_PATCH_CREATOR_UID as OWNER,
  PUMPKIN_PATCH_CLUB_ID as CLUB_ID,
  PUMPKIN_PATCH_WORLD_ID as WORLD_ID,
  PUMPKIN_PATCH_FILM_ALBUM_ID as FILM_ID,
  PUMPKIN_PATCH_TEAM_ROOMS,
  PUMPKIN_PATCH_CLUB_ART as ART,
} from '../services/halloween/pumpkinPatchClub';

const PUBLISH = process.argv.includes('--publish');

async function main() {
  const owner = await getDoc(`users/${OWNER}`);
  if (!owner) throw new Error(`users/${OWNER} not found`);
  console.log(`Owner: ${owner.displayName} (${OWNER})`);

  const existing = await getDoc(`clubs/${CLUB_ID}`);
  if (existing && existing.creatorId !== OWNER) throw new Error(`clubs/${CLUB_ID} belongs to ${existing.creatorId}; refusing to overwrite`);
  const world = await getDoc(`worlds/${WORLD_ID}`);
  const sanctuary = await getDoc(`sanctuaries/${OWNER}`);
  console.log(existing ? 'Club exists: will UPDATE it (createdAt, members, his edits to rooms kept).' : 'Will CREATE the club.');
  console.log(`World ${WORLD_ID}: ${world ? `found ("${world.name}", owner ${world.creatorId})` : 'NOT FOUND — link skipped'}`);
  console.log(`Sanctuary: ${sanctuary ? `found ("${sanctuary.name}") — will link the club` : 'none yet — will CREATE "Planet Ween Sanctuary" (public, free) on his account'}`);
  if (world && world.creatorId !== OWNER) throw new Error(`World ${WORLD_ID} belongs to ${world.creatorId}, not ${OWNER}`);

  const now = Date.now();
  const createdAt = (existing?.timestamp as number) || now;
  // Keep any rooms he added himself; (re)apply the official ones.
  const officialIds = new Set(['announcements', 'art', ...PUMPKIN_PATCH_TEAM_ROOMS.map((r) => r.channelId)]);
  const ownRooms = ((existing?.channels as any[]) ?? []).filter((c) => !officialIds.has(c.id));
  const channels = [
    { id: 'announcements', name: '📣 Announcements', type: 'ANNOUNCEMENT', description: 'News from Brian James Gage and the Pumpkin Patch team.', isReadOnly: true, createdAt },
    ...PUMPKIN_PATCH_TEAM_ROOMS.map((r) => ({ id: r.channelId, name: r.name, type: 'TEXT', description: r.description, createdAt })),
    { id: 'art', name: '🎨 Art & Stills', type: 'MEDIA', description: 'Character sheets, stills and fan art.', createdAt },
    ...ownRooms,
  ];

  const club = {
    ...(existing ?? {}),
    id: CLUB_ID,
    name: 'Pumpkin Patch Club (Official)',
    description:
      'The official club for Pumpkin Patch by Brian James Gage. Pick your team in the Halloween fan room — Team Pumpkin Patch, ' +
      'Miriam’s Army, Vampire Court, Night Crew or the Ghost Club — and meet your team here.',
    creatorId: OWNER,
    admins: Array.from(new Set([OWNER, ...((existing?.admins as string[]) ?? [])])),
    moderators: (existing?.moderators as string[]) ?? [],
    category: 'Film',
    tags: ['pumpkin patch', 'halloween', 'official', 'brian james gage', 'ravencrest'],
    isPrivate: false,
    joinProcess: 'AUTO',
    allowedAssetTypes: ['MUSIC', 'VIDEO', 'PHOTO', 'ARTICLE', 'BOOK', 'PLAYLIST', 'WORLD', 'LINK'],
    linksAllowed: true,
    memberCount: (existing?.memberCount as number) ?? 1,
    type: 'CLUB',
    coverImage: (existing?.coverImage as string) ?? ART.cover,
    iconImage: (existing?.iconImage as string) ?? ART.icon,
    hasLiveChat: true,
    hasMerchStore: false,
    hasExclusiveEvents: true,
    channels,
    // Official creator club: bound to his account, his World and his Sanctuary.
    isOfficial: true,
    worldId: WORLD_ID,
    sanctuaryId: OWNER,
    linkedFilmId: FILM_ID,
    teamRooms: Object.fromEntries(PUMPKIN_PATCH_TEAM_ROOMS.map((r) => [r.teamId, r.channelId])),
    timestamp: createdAt,
    updatedAt: now,
  };

  const membershipId = `${CLUB_ID}_${OWNER}`;
  const membership = {
    id: membershipId,
    clubId: CLUB_ID,
    userId: OWNER,
    role: 'OWNER',
    status: 'ACTIVE',
    displayName: owner.displayName || 'Brian James Gage',
    photoUrl: owner.photoURL || '',
    joinedAt: createdAt,
  };
  const gallery = ART.gallery.map((g, i) => ({
    id: `${CLUB_ID}_art_${String(i + 1).padStart(2, '0')}`,
    clubId: CLUB_ID,
    uploaderId: OWNER,
    uploaderName: owner.displayName || 'Brian James Gage',
    uploaderPhoto: owner.photoURL || '',
    type: 'PHOTO',
    url: g.url,
    thumbnailUrl: g.url,
    title: g.title,
    likes: [],
    timestamp: createdAt + i,
  }));

  console.log(`\nClub: "${club.name}" — ${channels.length} rooms: ${channels.map((c) => c.name).join(', ')}`);
  console.log(`Gallery: ${gallery.length} pieces of Pumpkin Patch art`);
  if (!PUBLISH) { console.log('\nDry run only: nothing was written. Re-run with --publish to write it.'); return; }

  await putDoc(`clubs/${CLUB_ID}`, club);
  await putDoc(`clubMemberships/${membershipId}`, membership);
  for (const g of gallery) await putDoc(`clubGallery/${g.id}`, g);
  if (world) {
    const ids = Array.from(new Set([...((world.associatedClubIds as string[]) ?? []), CLUB_ID]));
    await patchFields(`worlds/${WORLD_ID}`, { associatedClubIds: ids });
  }
  if (sanctuary) {
    const ids = Array.from(new Set([...((sanctuary.linkedClubIds as string[]) ?? []), CLUB_ID]));
    await patchFields(`sanctuaries/${OWNER}`, { linkedClubIds: ids, updatedAt: now });
  } else {
    // Same shape createOrUpdateSanctuary writes for a new one; he can rename/re-style it in the app.
    await putDoc(`sanctuaries/${OWNER}`, {
      id: OWNER,
      ownerId: OWNER,
      ownerType: 'USER',
      ownerName: owner.displayName || 'Brian James Gage',
      ownerPhoto: owner.photoURL || '',
      name: 'Planet Ween Sanctuary',
      tagline: 'Pumpkin Patch · the Planet Ween Universe',
      about: 'Home of Pumpkin Patch and the Planet Ween Universe by Brian James Gage. Your fan-room team has a room here.',
      bannerUrl: ART.cover,
      avatarUrl: ART.icon,
      category: 'Film',
      accentColor: '#F97316',
      visibility: 'PUBLIC',
      accessModel: 'FREE',
      memberCount: 0,
      contentCount: 0,
      isEnabled: true,
      linkedClubIds: [CLUB_ID],
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log('club, owner membership, gallery and World/Sanctuary links written');

  const back = await getDoc(`clubs/${CLUB_ID}`);
  const mem = await getDoc(`clubMemberships/${membershipId}`);
  console.log(`\nverified: creatorId=${back?.creatorId} isPrivate=${back?.isPrivate} rooms=${back?.channels?.length} owner role=${mem?.role}/${mem?.status}`);
  if (back?.creatorId !== OWNER || mem?.role !== 'OWNER') throw new Error('verification failed');
}
main().catch((e) => { console.error(e); process.exit(1); });
