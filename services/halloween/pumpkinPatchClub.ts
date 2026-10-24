/**
 * pumpkinPatchClub.ts
 *
 * The official Pumpkin Patch Club. It belongs to the film's creator, Brian James Gage (full owner
 * control); an admin only seeds it (scripts/seedPumpkinPatchClub.ts). It is public, linked to his
 * Pumpkin Patch World and his Sanctuary, and has one room per Halloween fan-room team: choosing a
 * team in the fan room puts you in that team's room. His Sanctuary lists the same rooms.
 */

export const PUMPKIN_PATCH_CREATOR_UID = 'u4XNVf41QeQERFqO0CB8JEhegXz2';
export const PUMPKIN_PATCH_CLUB_ID = 'club_pumpkin_patch_official';
export const PUMPKIN_PATCH_WORLD_ID = 'world_pumpkin_patch_universe';
export const PUMPKIN_PATCH_FILM_ALBUM_ID = 'album_1787881859314_mlt23';

/** Team rooms, keyed by the fan room's team ids (HALLOWEEN_FACTIONS). */
export const PUMPKIN_PATCH_TEAM_ROOMS: Array<{
  teamId: string;
  channelId: string;
  name: string;
  emoji: string;
  description: string;
}> = [
  { teamId: 'district13', channelId: 'team_pumpkin_patch', name: '🎃 Team Pumpkin Patch', emoji: '🎃', description: 'District 13 Vigilantes — Melvin’s crew.' },
  { teamId: 'greencastle', channelId: 'team_miriams_army', name: '🧙‍♀️ Miriam’s Army', emoji: '🧙‍♀️', description: 'The Green Castle Army of the Wicked Witch Miriam.' },
  { teamId: 'bloodline', channelId: 'team_vampire_court', name: '🧛 Vampire Court', emoji: '🧛', description: 'The Order of Orlok & Tepes.' },
  { teamId: 'farmhouse', channelId: 'team_night_crew', name: '🧟 Night Crew', emoji: '🧟', description: 'The 1968 Farmhouse Survivors.' },
  { teamId: 'specters', channelId: 'team_ghost_club', name: '👻 Ghost Club', emoji: '👻', description: 'The Saltair Pavilion Specters.' },
];

export const teamRoomFor = (teamId: string) => PUMPKIN_PATCH_TEAM_ROOMS.find((r) => r.teamId === teamId) ?? null;

/** Open a club in the app, straight into one of its rooms (ClubDetailView picks the room up). */
export function openClubRoom(clubId: string, channelId?: string) {
  try {
    if (channelId) sessionStorage.setItem(`plajah:clubRoom:${clubId}`, channelId);
  } catch { /* storage blocked: the club still opens */ }
  window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'CLUBS', params: { clubId } } }));
}

/** Film art for the club page and gallery (served from the app's public folder). */
export const PUMPKIN_PATCH_CLUB_ART = {
  cover: '/covers/halloween/pumpkin-patch-still.jpg',
  icon: '/generated/comics/pumpkin_patch_v4/char_1_portrait.jpg',
  gallery: [
    { url: '/covers/halloween/pumpkin-patch-cover.jpg', title: 'Pumpkin Patch — poster' },
    { url: '/covers/halloween/pumpkin-patch-still.jpg', title: 'Pumpkin Patch — still' },
    { url: '/models/halloween/sheets/pumpkin_patch_sheet.jpg', title: 'Pumpkin Patch — character sheet' },
    { url: '/models/halloween/sheets/miriam_sheet.jpg', title: 'Wicked Witch Miriam — character sheet' },
    { url: '/models/halloween/sheets/stitch_and_robobones_sheet.jpg', title: 'Stitch & Robo-Bones — character sheet' },
    { url: '/models/halloween/sheets/monsters_sheet.jpg', title: 'The monsters — character sheet' },
    { url: '/models/halloween/sheets/survivors_sheet.jpg', title: 'The survivors — character sheet' },
    { url: '/models/halloween/sheets/tank_sheet.jpg', title: 'The war-rig tank — sheet' },
    { url: '/generated/comics/pumpkin_patch_v4/char_1_portrait.jpg', title: 'Melvin Lester — Pumpkin Patch' },
    { url: '/generated/comics/pumpkin_patch_v4/char_3_portrait.jpg', title: 'Wicked Witch Miriam' },
    { url: '/generated/comics/pumpkin_patch_v4/char_4_portrait.jpg', title: 'Stitch' },
    { url: '/generated/comics/pumpkin_patch_v4/char_5_portrait.jpg', title: 'Robo-Bones' },
    { url: '/generated/comics/pumpkin_patch_v4/char_6_portrait.jpg', title: 'Lil’ Boo' },
    { url: '/generated/comics/pumpkin_patch_v4/char_7_portrait.jpg', title: 'President Tepes' },
  ],
};
