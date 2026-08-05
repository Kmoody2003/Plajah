// MediaPreloader — keeps every media clip in the launcher decoded and ready so
// firing a column swaps instantly and holds 60fps (no first-frame stall while a
// video fetches + decodes). It renders a hidden, 1px, muted <video preload=auto>
// / <img> for each unique media URL across all layers. The browser buffers them
// in the background; when a clip is fired into the LayerStack the data is already
// warm. Cheap: hidden elements, no autoplay, deduped by URL.

import React, { useMemo } from 'react';
import type { LauncherLayer } from './ClipLauncher';

const HIDDEN: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none',
  left: -9999, top: -9999,
};

const MediaPreloader: React.FC<{ layers: LauncherLayer[] }> = ({ layers }) => {
  // Unique media URLs (skip blob: — those are already in-memory and same-doc).
  const { videos, images } = useMemo(() => {
    const vids = new Set<string>();
    const imgs = new Set<string>();
    for (const layer of layers) {
      for (const clip of layer.clips) {
        if (!clip || clip.type !== 'media' || !clip.mediaUrl) continue;
        if (clip.mediaUrl.startsWith('blob:')) continue;
        (clip.mediaType === 'image' ? imgs : vids).add(clip.mediaUrl);
      }
    }
    return { videos: [...vids], images: [...imgs] };
  }, [layers]);

  if (!videos.length && !images.length) return null;

  return (
    <div aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      {videos.map(url => (
        <video key={url} src={url} preload="auto" muted playsInline style={HIDDEN} />
      ))}
      {images.map(url => (
        <img key={url} src={url} alt="" decoding="async" style={HIDDEN} />
      ))}
    </div>
  );
};

export default MediaPreloader;
