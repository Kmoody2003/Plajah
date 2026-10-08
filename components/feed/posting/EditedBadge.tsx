/**
 * EditedBadge — small "Edited" chip next to a post's timestamp; tap to see the
 * previous versions (last 5 revisions, see Post.editHistory / editPostText).
 *
 * Props: post (needs text, modifiedAt?, editHistory?). Renders nothing for unedited posts.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Post } from '../../../types';
import { RichText } from '../../../src/lib/richText';

const fmt = (ts: number) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const EditHistorySheet: React.FC<{ post: Pick<Post, 'text' | 'modifiedAt' | 'editHistory'>; onClose: () => void }> = ({ post, onClose }) => {
  const past = [...(post.editHistory || [])].reverse();
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[80vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0c0c0c] border border-white/10 p-5 space-y-3" onClick={e => e.stopPropagation()} role="dialog" aria-label="Edit history">
        <div className="flex items-center">
          <h3 className="text-sm font-black uppercase tracking-widest">Edit history</h3>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/8" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="rounded-2xl border border-small-orange/30 bg-small-orange/5 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-small-orange mb-1">Current{post.modifiedAt ? ` · ${fmt(post.modifiedAt)}` : ''}</p>
          <div className="text-sm whitespace-pre-wrap break-words"><RichText text={post.text} scripture={false} /></div>
        </div>
        {past.length === 0 && <p className="text-xs text-white/35">Earlier versions were not kept for this post.</p>}
        {past.map((r, i) => (
          <div key={`${r.editedAt}-${i}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-1">Replaced {fmt(r.editedAt)}</p>
            <p className="text-sm text-white/70 whitespace-pre-wrap break-words">{r.text}</p>
          </div>
        ))}
        <p className="text-[10px] text-white/25">The 5 most recent previous versions are kept.</p>
      </div>
    </div>,
    document.body,
  );
};

const EditedBadge: React.FC<{ post: Post; className?: string }> = ({ post, className = '' }) => {
  const [open, setOpen] = useState(false);
  if (!post.modifiedAt && !post.editHistory?.length) return null;
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`text-[10px] text-white/35 hover:text-white/70 underline-offset-2 hover:underline ${className}`}
        title={post.modifiedAt ? `Edited ${fmt(post.modifiedAt)}` : 'Edited'}
      >
        Edited
      </button>
      {open && <EditHistorySheet post={post} onClose={() => setOpen(false)} />}
    </>
  );
};

export default EditedBadge;
