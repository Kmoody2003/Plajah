// Lab-only stand-in for services/backendService: real exports, plus a signed-in user per frame
// (?as=host | ?as=viewer, or ?who=a | ?who=b) and no-op timeline/upload side effects so Go Live runs without Firebase.
// Firestore itself is the in-memory labs/golive/firestoreShim.ts. Wired by golive-lab.vite.config.mjs.
export * from '../../services/backendService';

import { labAuth } from './labUser';
export const auth: any = labAuth;

const log = (name: string) => async (...args: any[]) => { (window as any).goLiveLab?.calls.push({ name, args }); return { id: `lab-${name}-${Date.now()}` } as any; };
export const createPost = log('createPost');
export const updatePost = log('updatePost');
export const deletePost = log('deletePost');
export const notifyFollowers = log('notifyFollowers');
export const uploadVideo = log('uploadVideo');
export const finalizeLiveRecording = log('finalizeLiveRecording');
export const addReplayToFastChannel = log('addReplayToFastChannel');
export const allocateChannelNumber = log('allocateChannelNumber');
export const setChannelName = log('setChannelName');
export const scheduleLiveInterrupt = log('scheduleLiveInterrupt');
export const publishLiveFeed = log('publishLiveFeed');
export const deleteLiveFeed = log('deleteLiveFeed');

// The real createLiveTalk reads backendService's own Firebase auth (signed out here); same doc, lab user.
import { doc, collection, setDoc } from 'firebase/firestore';
export const createLiveTalk = async (talk: any) => {
  const ref = doc(collection({} as any, 'liveTalks'));
  const u = auth.currentUser;
  const t = {
    id: ref.id, hostId: u.uid, hostName: u.displayName, hostPhoto: '', title: talk.title || 'Live Talk',
    description: talk.description || '', topic: talk.topic || 'General', category: talk.category || 'Discussion',
    isActive: true, speakers: [{ uid: u.uid, name: u.displayName, photoURL: '', isMuted: false }], listeners: [], sharedAssets: [], timestamp: Date.now(),
  };
  await setDoc(ref, t);
  return t;
};
