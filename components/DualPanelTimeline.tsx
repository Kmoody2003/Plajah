import React, { useRef, useState } from 'react';

interface PostWithAttachments {
  id: string;
  attachments?: { type: string; url: string; title?: string }[];
  authorName?: string;
}

interface DualPanelTimelineProps<T extends PostWithAttachments> {
  mode: 'SINGLE' | 'DUAL';
  syncScroll: boolean;
  posts: T[];
  renderPost: (post: T) => React.ReactNode;
  emptyState: React.ReactNode;
}

interface LightboxState {
  url: string;
  type: 'PHOTO' | 'VIDEO';
}

function DualPanelTimeline<T extends PostWithAttachments>({
  mode,
  syncScroll,
  posts,
  renderPost,
  emptyState,
}: DualPanelTimelineProps<T>) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const handleLeftScroll = () => {
    if (!syncScroll || isSyncingLeft.current) return;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const ratio = left.scrollTop / Math.max(1, left.scrollHeight - left.clientHeight);
    isSyncingRight.current = true;
    right.scrollTop = ratio * (right.scrollHeight - right.clientHeight);
    requestAnimationFrame(() => { isSyncingRight.current = false; });
  };

  const handleRightScroll = () => {
    if (!syncScroll || isSyncingRight.current) return;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const ratio = right.scrollTop / Math.max(1, right.scrollHeight - right.clientHeight);
    isSyncingLeft.current = true;
    left.scrollTop = ratio * (left.scrollHeight - left.clientHeight);
    requestAnimationFrame(() => { isSyncingLeft.current = false; });
  };

  if (mode === 'SINGLE') {
    if (posts.length === 0) return <>{emptyState}</>;
    return <div className="space-y-6">{posts.map(post => renderPost(post))}</div>;
  }

  // Collect all photo/video attachments
  const mediaItems: { type: 'PHOTO' | 'VIDEO'; url: string; authorName: string }[] = [];
  for (const post of posts) {
    for (const att of post.attachments || []) {
      if (att.type === 'PHOTO' || att.type === 'VIDEO') {
        mediaItems.push({
          type: att.type as 'PHOTO' | 'VIDEO',
          url: att.url,
          authorName: (post as any).authorName || '',
        });
      }
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-6 h-[calc(100vh-260px)]">
        {/* Left: posts */}
        <div className="flex flex-col min-h-0">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3 shrink-0">Posts</p>
          <div
            ref={leftRef}
            onScroll={handleLeftScroll}
            className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-6"
          >
            {posts.length === 0 ? emptyState : posts.map(post => renderPost(post))}
          </div>
        </div>

        {/* Right: media */}
        <div className="flex flex-col min-h-0">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3 shrink-0">Media</p>
          <div
            ref={rightRef}
            onScroll={handleRightScroll}
            className="flex-1 overflow-y-auto pr-2 scrollbar-hide"
          >
            {mediaItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[9px] font-black uppercase tracking-widest text-white/20 text-center">
                No media in this timeline
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {mediaItems.map((m, i) => (
                  <div
                    key={i}
                    className="rounded-2xl overflow-hidden aspect-square relative cursor-pointer group"
                    onClick={() => setLightbox({ url: m.url, type: m.type })}
                  >
                    {m.type === 'VIDEO' ? (
                      <video
                        src={m.url}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={m.url}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                        alt=""
                      />
                    )}
                    {m.authorName && (
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/40 flex items-end p-2 transition-opacity">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white truncate">{m.authorName}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
          {lightbox.type === 'VIDEO' ? (
            <video
              src={lightbox.url}
              className="max-w-full max-h-[90vh] rounded-2xl"
              controls
              autoPlay
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <img
              src={lightbox.url}
              className="max-w-full max-h-[90vh] rounded-2xl object-contain"
              alt=""
              onClick={e => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  );
}

export default DualPanelTimeline;
