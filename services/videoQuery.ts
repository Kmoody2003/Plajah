// firestore.rules only allow a videos list that is provably public or the caller's own, so a query for
// someone's videos has to say so: the owner sees everything, everyone else asks for isPrivate == false.
import { where, type QueryConstraint } from 'firebase/firestore';
import { auth } from './firebase';

export const videosOwnedBy = (uid: string): QueryConstraint[] => [
  where('ownerId', '==', uid),
  ...(auth.currentUser?.uid === uid ? [] : [where('isPrivate', '==', false)]),
];
