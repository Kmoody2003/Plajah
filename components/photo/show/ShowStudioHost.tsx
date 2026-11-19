// Opens the Themed Shows studio over the current Photos view when photos are sent to a
// slideshow (file explorer, library grid). Mount once per surface that sends.

import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { auth } from '../../../services/firebase';
import { SEND_TO_SHOW_EVENT, forgetRecentShows, type SendToShowDetail } from '../../../services/slideshow/sendTo';

const ThemedShowStudio = lazy(() => import('../ThemedShowStudio'));

export default function ShowStudioHost() {
  const [open, setOpen] = useState<(SendToShowDetail & { key: number }) | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<SendToShowDetail>).detail;
      if (d?.items?.length) setOpen({ ...d, key: Date.now() });
    };
    window.addEventListener(SEND_TO_SHOW_EVENT, h);
    return () => window.removeEventListener(SEND_TO_SHOW_EVENT, h);
  }, []);

  if (!open) return null;
  const user = auth.currentUser;
  const target = open.target.kind === 'show' ? { id: open.target.show.id, where: open.target.show.where } : undefined;
  const close = () => { setOpen(null); forgetRecentShows(); };

  return (
    <div className="fixed inset-0 z-[280] bg-black/80 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal aria-label="Themed Shows">
      <div className="min-h-full p-3 md:p-5" style={{ background: 'var(--bg-color, #08090b)' }}>
        <Suspense fallback={<div className="flex items-center justify-center gap-2 py-32 type-body-md"><Loader2 className="animate-spin" size={18} /> Opening Themed Shows…</div>}>
          <ThemedShowStudio
            key={open.key}
            initial={open.items}
            openShow={target}
            owner={user && !user.isAnonymous ? { uid: user.uid, handle: user.displayName || undefined } : undefined}
            onClose={close}
          />
        </Suspense>
      </div>
    </div>
  );
}
