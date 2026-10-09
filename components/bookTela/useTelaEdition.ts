import { useEffect, useState } from 'react';
import type { Album } from '../../types';
import type { ContentLicense } from '../../services/contentLicense';
import { chooseReaderMode, type BookTelaBundle } from '../../services/bookTela/upgrade';
import { loadReaderBundle } from '../../services/bookTela/upgradeStore';

export type TelaEdition =
  | { status: 'classic' }
  | { status: 'loading' }
  | { status: 'tela'; bundle: BookTelaBundle; pin: 'follow-latest' | 'pinned' };

/**
 * Decides whether Lorea should render this book through Tela, and which immutable version.
 *  - author and readers of FREE books follow the latest published version
 *  - paid books: a buyer is pinned to the newest version at or before their purchase (never later ones)
 *  - anything missing (flag off, no versions, bundle unreachable) resolves to the classic reader
 */
export function useTelaEdition(book: Album, o: { isOwner: boolean; isPaid: boolean; ownershipLoading: boolean; license: ContentLicense | null }): TelaEdition {
  const bt = book.bookTela;
  const [state, setState] = useState<TelaEdition>(() => (bt?.enabled ? { status: 'loading' } : { status: 'classic' }));
  const issuedAt = o.license?.issuedAt;
  useEffect(() => {
    let alive = true;
    if (!bt?.enabled || !bt.versions?.length) { setState({ status: 'classic' }); return; }
    if (o.isPaid && !o.isOwner && o.ownershipLoading) { setState({ status: 'loading' }); return; }
    const mode = chooseReaderMode({ versions: bt.versions, isOwner: o.isOwner, isPaid: o.isPaid, license: issuedAt != null ? { issuedAt } : null, telaEnabled: true });
    if (mode.mode === 'classic') { setState({ status: 'classic' }); return; }
    setState({ status: 'loading' });
    loadReaderBundle(book.id, mode.version.versionId).then(b => { if (alive) setState(b ? { status: 'tela', bundle: b, pin: mode.pin } : { status: 'classic' }); });
    return () => { alive = false; };
  }, [book.id, bt?.enabled, bt?.versions?.length, o.isOwner, o.isPaid, o.ownershipLoading, issuedAt]);
  return state;
}
