// Lab stand-in for services/firebase + services/backendService: the user is ?as=<uid> (dev only).
const q = new URLSearchParams(location.search);
const uid = q.get('as') || 'alice';
export const auth: any = {
  currentUser: { uid, isAnonymous: uid.startsWith('guest'), displayName: q.get('name') || uid, getIdToken: async () => uid },
};
export const db: any = { lab: true };
export const app: any = {};
