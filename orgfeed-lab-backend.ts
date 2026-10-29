// Lab-only stand-in for the slice of services/backendService that OrgThread uses.
// ?member=0 renders the feed as a signed-in non-member; default is an active member.
const now = Date.now();
const mk = (id: string, text: string, aud: string, ago: number, dept?: string) => ({ id, text, orgAudience: aud, authorName: 'Grace Chapel', authorPhoto: '', authorId: 'u1', timestamp: now - ago * 60000, likesCount: 4, commentsCount: 2, likedBy: [], isPublic: aud !== 'INTERNAL' && aud !== 'DEPARTMENT', ...(dept ? { orgDepartmentId: dept } : {}) });
const PUBLIC = [mk('p1', 'Sunday at 10: we start the Gospel of John. Bring a friend.', 'PUBLIC', 30), mk('p2', 'Food pantry is open Tuesday 4-6 PM. Everyone welcome.', 'PUBLIC', 600), mk('p3', 'Youth lock-in is Friday night. Parents: permission slips at the welcome desk.', 'PUBLIC', 90, 'youth')];
const INTERNAL = [mk('i1', 'Volunteer huddle moved to 9:15 this week. Parking team: use the east lot.', 'INTERNAL', 5), mk('i2', 'Prayer request for the Reyes family: surgery Thursday.', 'INTERNAL', 240)];
const DEPT: Record<string, any[]> = {
  youth: [mk('d1', 'Leaders: lock-in check-in list is in the shared drive. Arrive by 6:30.', 'DEPARTMENT', 12, 'youth')],
  media: [mk('d2', 'Camera 2 battery is dead — charge before Sunday.', 'DEPARTMENT', 45, 'media')],
};
export const auth: any = { currentUser: { uid: 'lab-user' } };
export const listenToOrgThread = (_o: string, x: any, cb: (p: any[]) => void) => { cb(x?.departmentId ? PUBLIC.filter(p => p.orgDepartmentId === x.departmentId) : PUBLIC); return () => {}; };
export const listenToOrgInternal = (_o: string, cb: (p: any[]) => void) => { cb(INTERNAL); return () => {}; };
export const listenToOrgDepartmentInternal = (_o: string, d: string, cb: (p: any[]) => void) => { cb(DEPT[d] || []); return () => {}; };
export const createOrgPost = async (...a: any[]) => { console.log('[lab] createOrgPost', JSON.stringify(a[3])); return undefined; };
export const togglePostLike = async () => {};
export const deletePost = async () => {};
export const postFieldsForAssetEmbed = async () => ({});
export const subscribeToPostComments = (_id: string, cb: (c: any[]) => void) => { cb([]); return () => {}; };
