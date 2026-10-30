// The signed-in lab user for this frame: ?as=viewer or ?who=b is the second person, else the first.
const q = new URLSearchParams(location.search);
const me = q.get('as') === 'viewer' || q.get('who') === 'b'
  ? { uid: 'lab-viewer', displayName: 'Lab Viewer' }
  : { uid: 'lab-host', displayName: 'Lab Host' };
export const labAuth: any = {
  currentUser: { ...me, photoURL: '', isAnonymous: false, email: `${me.uid}@lab.test`, getIdToken: async () => 'lab' },
  onAuthStateChanged: (cb: (u: unknown) => void) => { cb(labAuth.currentUser); return () => {}; },
};
