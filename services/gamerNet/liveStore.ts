// Production GamerStore: Firestore REST through the service account (plajah-prod). server.ts passes its
// restCas factory so compare-and-swap uses the same updateTime preconditions as orders and staff seats.

import type { CasStore } from '../casCore';
import { fsGet, fsQuery, fsDelete } from '../firebaseAdminRest';
import { fsCreateOnce } from '../safety/safetyServerIo';
import type { GamerStore } from './store';

export function liveGamerStore(restCas: (collection: string) => CasStore): GamerStore {
  return {
    cas: restCas,
    get: (c, id) => fsGet(`${c}/${id}`),
    createOnce: (c, id, data) => fsCreateOnce(c, id, data),
    query: (c, filters, limit, orderBy) => fsQuery(c, filters, limit, orderBy),
    del: (c, id) => fsDelete(`${c}/${id}`),
  };
}
