import React from 'react';
import { Share2 } from 'lucide-react';
import ShareButton from './ShareButton';
import Portal from './Portal';
import { SERVICE_SHARE } from '../src/lib/serviceShare';
import { buildShareUrl, shareOrigin } from '../services/deepLinkService';
import type { AppView } from '../types';

/**
 * Share icon pinned to the top of every main landing page (Lorea, Reello, Chora, Cinema, Elevate…).
 * Shares that entry point's link, whose preview card names the service (server /share?type=app).
 * Renders nothing on views that are not a shareable entry point.
 */
const ServiceShareChip: React.FC<{ view: AppView; compact?: boolean }> = ({ view, compact }) => {
  const svc = SERVICE_SHARE[view];
  if (!svc) return null;
  const url = svc.slug === 'home' ? `${shareOrigin()}/` : buildShareUrl('app', svc.slug);
  return (
    <Portal>
      <div
        className="fixed z-[120] right-3 sm:right-4"
        style={{ top: compact ? 'calc(env(safe-area-inset-top) + 0.5rem)' : 'calc(env(safe-area-inset-top) + 3.75rem)' }}
      >
        <ShareButton
          title={svc.name}
          text={svc.blurb}
          url={url}
          iconSize={16}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/55 backdrop-blur-xl border border-white/15 text-white/85 hover:text-white hover:bg-black/75 shadow-lg transition-colors"
        />
      </div>
    </Portal>
  );
};

export default ServiceShareChip;
