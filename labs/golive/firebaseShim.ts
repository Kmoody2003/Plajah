// Lab-only stand-in for services/firebase: real exports, with the lab user as `auth` (labs/golive/labUser.ts) so modules that read services/firebase see someone signed in.
export * from '../../services/firebase';
import { labAuth } from './labUser';
export const auth: any = labAuth;
