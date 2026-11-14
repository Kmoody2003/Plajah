// Lab stand-in for services/firebase: a signed-in fake account, no Firebase project.
export const auth: any = { currentUser: { uid: 'lab-user', displayName: 'Kenne Lab', photoURL: '', getIdToken: async () => 'lab-token' } };
export const db: any = {};
export const storage: any = {};
export const app: any = {};
