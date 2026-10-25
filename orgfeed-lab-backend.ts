// Lab-only stand-in for the slice of services/backendService that OrgThread uses.
// ?member=0 renders the feed as a signed-in non-member; default is an active member.
const now = Date.now();
const mk = (id: string, text: string, aud: string, ago: number) => ({ id, text, orgAudience: aud, authorName: 'Grace Chapel', authorPhoto: '', authorId: 'u1', timestamp: now - ago * 60000, likesCount: 4, commentsCount: 2, likedBy: [], isPublic: aud !== 'INTERNAL' });
const PUBLIC = [mk('p1', 'Sunday at 10: we start the Gospel of John. Bring a friend.', 'PUBLIC', 30), mk('p2', 'Food pantry is open Tuesday 4-6 PM. Everyone welcome.', 'PUBLIC', 600)];
const INTERNAL = [mk('i1', 'Volunteer huddle moved to 9:15 this week. Parking team: use the east lot.', 'INTERNAL', 5), mk('i2', 'Prayer request for the Reyes family: surgery Thursday.', 'INTERNAL', 240)];
export const auth: any = { currentUser: { uid: 'lab-user' } };
export const listenToOrgThread = (_o: string, _x: any, cb: (p: any[]) => void) => { cb(PUBLIC); return () => {}; };
export const listenToOrgInternal = (_o: string, cb: (p: any[]) => void) => { cb(INTERNAL); return () => {}; };
export const createOrgPost = async () => undefined;
export const togglePostLike = async () => {};
export const deletePost = async () => {};
export const subscribeToPostComments = (_id: string, cb: (c: any[]) => void) => { cb([]); return () => {}; };
