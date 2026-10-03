import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PROFILE, effectiveSchoolProfile, readLocalProfile, saveSchoolProfile, type SchoolProfile } from '../services/schoolProfile';

/**
 * The school profile that applies to the current learner or adult. Adults set it; students inherit
 * their guardian's (or teacher's). `fallbackUids` are extra places to look, e.g. a class teacher.
 */
export function useSchoolProfile(profile: any, fallbackUids: Array<string | undefined> = []) {
  const uid: string | undefined = profile?.uid;
  const [sp, setSp] = useState<SchoolProfile>(() => profile?.schoolProfile || readLocalProfile(uid) || DEFAULT_PROFILE);
  const [configured, setConfigured] = useState<boolean>(!!(profile?.schoolProfile || readLocalProfile(uid)));
  const key = fallbackUids.filter(Boolean).join(',');

  useEffect(() => {
    let alive = true;
    effectiveSchoolProfile(profile, fallbackUids).then(p => { if (alive) { setSp(p); setConfigured(p !== DEFAULT_PROFILE); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, profile?.guardianUid, profile?.schoolProfile?.updatedAt, key]);

  const update = useCallback(async (next: SchoolProfile) => {
    setSp(next); setConfigured(true);
    return saveSchoolProfile(next, uid);
  }, [uid]);

  return { sp, configured, update };
}
