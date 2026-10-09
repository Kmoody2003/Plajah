import React, { Suspense, useMemo } from 'react';
import { Printer } from 'lucide-react';
import type { BookDraft } from '../../services/bookmeta/types';
import { stripTags } from '../../services/bookmeta/util';
import { Card } from './ui';

/**
 * PRINT EDITION HOOK. Print-on-demand is owned by another team (services/pod, components/pod). This step
 * feature-detects components/pod/PrintEditionStep.tsx WITHOUT a hard import, so the book flow builds and runs whether or
 * not POD ships. The module's contract (per its header): `PrintEditionStep({ album: {id,title,artist,coverImage,
 * description,bookChapters?}, onSaved? })`, where `album.id` must be the id of a PUBLISHED album (editions are stored
 * against it).
 *
 * A submission has no album id until the author finishes publishing through AlbumCreator, so before that this step
 * shows an explanatory placeholder. Once a caller supplies `publishedAlbumId` (e.g. from My Books after publish) and the
 * module exists, the real builder mounts. Wiring `publishedAlbumId` through is the one remaining integration step.
 */
type PodModule = { PrintEditionStep?: React.ComponentType<any>; default?: React.ComponentType<any> };
const podModules = import.meta.glob('../pod/PrintEditionStep.tsx') as Record<string, () => Promise<PodModule>>;
export const hasPrintEdition = Object.keys(podModules).length > 0;

export default function PrintStep({ draft, publishedAlbumId }: { draft: BookDraft; publishedAlbumId?: string }) {
  const Lazy = useMemo(() => {
    const loader = Object.values(podModules)[0];
    return loader && publishedAlbumId
      ? React.lazy(async () => { const m = await loader(); return { default: (m.PrintEditionStep ?? m.default) as React.ComponentType<any> }; })
      : null;
  }, [publishedAlbumId]);

  if (Lazy && publishedAlbumId) {
    const album = { id: publishedAlbumId, title: draft.metadata.title, artist: draft.metadata.penName || draft.metadata.contributors.find(c => c.role === 'author')?.name, coverImage: draft.cover?.url, description: stripTags(draft.metadata.description) };
    return <Suspense fallback={<p className="text-sm text-white/50">Loading print options…</p>}><Lazy album={album} /></Suspense>;
  }
  return (
    <Card title="Print edition" subtitle="Optional. Your ebook does not depend on it.">
      <div className="flex gap-4 items-start">
        <Printer size={28} className="text-white/25 flex-shrink-0" />
        <div className="text-sm text-white/55 leading-snug space-y-2">
          <p>{hasPrintEdition
            ? 'Print editions attach to a published book. Finish publishing your ebook first, then add a paperback or hardcover from your book’s page.'
            : 'Paperback and hardcover print-on-demand is on its way. When it lands you will be able to turn this manuscript and cover into a print-ready edition.'}</p>
          <p className="text-white/35 text-xs">Print editions need their own ISBN and a wrap-around cover. Skip this step for now; you will not lose anything.</p>
        </div>
      </div>
    </Card>
  );
}
