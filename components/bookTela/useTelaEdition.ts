import { useEffect, useState } from 'react';
import type { Album } from '../../types';
import type { ContentLicense } from '../../services/contentLicense';
import { chooseReaderMode, type BookTelaBundle } from '../../services/bookTela/upgrade';
import { loadReaderBundle } from '../../services/bookTela/upgradeStore';
import type { ReaderChoice } from '../../services/bookEditions/policy';
import { getPreferredVersion, VERSION_PREF_EVENT } from '../../services/bookEditions/readerPrefs';

export type TelaEdition =
  | { status: 'classic' }
  | { status: 'loading' }
  | { status: 'tela'; bundle: BookTelaBundle; pin: 'follow-latest' | 'pinned'; choice: ReaderChoice };

/**
 * Decides whether Lorea should render this book through Tela, and which immutable version
 * (services/bookEditions/policy.ts):
 *  - author and readers of FREE books follow the latest published version
 *  - buyers follow corrections/updates within the editions their licence covers (free new editions too)
 *    and may roll back to any of those versions (the choice is stored per device)
 *  - anything missing (flag off, no versions, bundle unreachable) resolves to the classic reader
 */
export function useTelaEdition(book: Album, o: { isOwner: boolean; isPaid: boolean; ownershipLoading: boolean; license: ContentLicense | null }): TelaEdition {
  const bt = book.bookTela;
  const [state, setState] = useState<TelaEdition>(() => (bt?.enabled ? { status: 'loading' } : { status: 'classic' }));
  const [preferred, setPreferred] = useState<string | null>(() => getPreferredVersion(book.id));
  useEffect(() => {
    setPreferred(getPreferredVersion(book.id));
    const on = (e: Event) => { if ((e as CustomEvent).detail?.bookId === book.id) setPreferred(getPreferredVersion(book.id)); };
    window.addEventListener(VERSION_PREF_EVENT, on);
    return () => window.removeEventListener(VERSION_PREF_EVENT, on);
  }, [book.id]);
  const lic = o.license as (ContentLicense & { editions?: number[]; versionAtPurchase?: string; revokedAt?: number | null }) | null;
  const licKey = lic ? `${lic.issuedAt}:${(lic.editions || []).join(',')}:${lic.revokedAt || ''}:${lic.expiresAt || ''}` : '';
  const versionsKey = (bt?.versions || []).map(v => `${v.versionId}:${(v as any).edition || 1}`).join('|');
  useEffect(() => {
    let alive = true;
    if (!bt?.enabled || !bt.versions?.length) { setState({ status: 'classic' }); return; }
    if (o.isPaid && !o.isOwner && o.ownershipLoading) { setState({ status: 'loading' }); return; }
    const mode = chooseReaderMode({
      versions: bt.versions, isOwner: o.isOwner, isPaid: o.isPaid, telaEnabled: true,
      license: lic ? { issuedAt: lic.issuedAt, editions: lic.editions, versionAtPurchase: lic.versionAtPurchase, expiresAt: lic.expiresAt, revokedAt: lic.revokedAt } : null,
      editions: (book as any).bookEditions, preferredVersionId: preferred,
    });
    if (mode.mode === 'classic') { setState({ status: 'classic' }); return; }
    setState({ status: 'loading' });
    loadReaderBundle(book.id, mode.version.versionId).then(b => { if (alive) setState(b ? { status: 'tela', bundle: b, pin: mode.pin, choice: mode.choice } : { status: 'classic' }); });
    return () => { alive = false; };
  }, [book.id, bt?.enabled, versionsKey, o.isOwner, o.isPaid, o.ownershipLoading, licKey, preferred]);
  return state;
}
