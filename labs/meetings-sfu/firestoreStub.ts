// Lab stand-in for firebase/firestore: presence writes are no-ops (the SFU path doesn't need them to connect).
export const doc = (..._a: any[]) => ({ path: _a.slice(1).join('/') });
export const collection = (..._a: any[]) => ({ path: _a.slice(1).join('/') });
export const setDoc = async (..._a: any[]) => {};
export const updateDoc = async (..._a: any[]) => {};
export const addDoc = async (..._a: any[]) => ({ id: 'x' });
export const deleteDoc = async (..._a: any[]) => {};
export const getDocs = async (..._a: any[]) => ({ docs: [] });
export const onSnapshot = (..._a: any[]) => () => {};
export const serverTimestamp = () => Date.now();
