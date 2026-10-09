// Dev-only stand-in for services/backendService (aliased in evite-stage.vite.config.mjs).
export const fetchCreatorEvents = async (_uid: string) => [{ id: 'evt1', title: 'Night Fever · Rooftop', startDate: Date.now() + 20 * 864e5 }];
export const fetchPublicEvents = async () => [];
export const createClub = async (d: any) => ({ id: 'club_mock', ...d });
export const generateClubInviteToken = async () => 'MOCK1234';
export const createEventPhotoPool = async (d: any) => ({ id: 'pool_mock', ...d });
