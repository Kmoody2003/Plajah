// Hosts the Themed Shows studio for the whole app (mounted once in App.tsx).
// Any surface calls openShowStudio() (services/slideshow/showStudioBus); the studio opens as
// an overlay above it and the finished show goes back to that caller.

import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { OPEN_SHOW_STUDIO, type OpenShowStudioDetail, type ShowStudioResult } from '../../services/slideshow/showStudioBus';
import type { ShowSourcePhoto } from './ThemedShowStudio';
import type { Photo, UserProfile } from '../../types';

const ThemedShowStudio = lazy(() => import('./ThemedShowStudio'));

const toShowSource = (p: Photo): ShowSourcePhoto => ({ id: p.id, url: p.url, title: p.title, caption: p.description, takenAt: p.timestamp });

export default function ShowStudioHost({ profile }: { profile: UserProfile | null }) {
  const [req, setReq] = useState<OpenShowStudioDetail | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<OpenShowStudioDetail>).detail;
      if (!d?.resolve) return;
      d.handled = true;
      // a second request replaces the first (the first caller gets null)
      setReq((prev) => { prev?.resolve(null); return d; });
    };
    window.addEventListener(OPEN_SHOW_STUDIO, h as EventListener);
    return () => window.removeEventListener(OPEN_SHOW_STUDIO, h as EventListener);
  }, []);

  useEffect(() => {
    if (!req) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [req]);

  if (!req) return null;
  const finish = (r: ShowStudioResult | null) => { req.resolve(r); setReq(null); };

  return (
    <div className="fixed inset-0 z-[400] overflow-y-auto" style={{ background: 'var(--surface, #0b0a0f)' }} role="dialog" aria-modal="true" aria-label="Themed Shows studio">
      <div className="max-w-[1600px] mx-auto p-3 sm:p-5">
        <Suspense fallback={<div className="flex items-center gap-2 type-body-sm p-6"><Loader2 size={14} className="animate-spin" /> Opening Themed Shows…</div>}>
          <ThemedShowStudio
            key={req.requestId}
            owner={profile ? { uid: profile.uid, handle: (profile as any).username || profile.displayName } : undefined}
            library={(profile?.photos || []).filter((p) => p.mediaType !== 'VIDEO').map(toShowSource)}
            openRef={req.open}
            publishOnDone={req.publish}
            doneLabel={req.doneLabel}
            returnLabel={req.returnLabel}
            onDone={(r) => finish(r)}
            onClose={() => finish(null)}
          />
        </Suspense>
      </div>
    </div>
  );
}
