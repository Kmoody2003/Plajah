import { useEffect, useState } from 'react';
import { auth } from '../../services/firebase';
import { gatedPathOf, isGatedRef } from '../../services/sanctuaryMediaCore';

/** A playable URL for a stored file reference. Old public URLs pass through; gated ones ask the server for a signed link. */
export function useGatedMedia(col: string, itemId: string, ref: string | undefined): string {
  const [url, setUrl] = useState(isGatedRef(ref) ? '' : ref || '');
  useEffect(() => {
    if (!isGatedRef(ref)) { setUrl(ref || ''); return; }
    let live = true;
    setUrl('');
    (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const r = await fetch('/api/sanctuary/media-ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ col, id: itemId, path: gatedPathOf(ref) }),
      });
      if (r.ok && live) setUrl((await r.json()).url || '');
    })().catch(() => {});
    return () => { live = false; };
  }, [col, itemId, ref]);
  return url;
}
