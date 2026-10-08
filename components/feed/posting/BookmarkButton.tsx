/**
 * BookmarkButton — save / unsave a post (private to the viewer).
 *
 * Props:
 *   post        the Post (needs id, authorId; text/media/sourceCollection feed the snippet + score signal)
 *   size?       icon px (default 16)
 *   className?  extra classes
 * Optimistic; renders nothing when signed out. Emits the BOOKMARK feed-score signal on save.
 */
import React from 'react';
import { Bookmark } from 'lucide-react';
import type { Post } from '../../../types';
import { useBookmarks } from './useBookmarks';

const BookmarkButton: React.FC<{ post: Post; size?: number; className?: string }> = ({ post, size = 16, className = '' }) => {
  const { isBookmarked, toggle, uid } = useBookmarks();
  if (!uid) return null;
  const saved = isBookmarked(post.id);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); void toggle(post); }}
      aria-pressed={saved}
      title={saved ? 'Remove from saved' : 'Save'}
      className={`p-1.5 rounded-xl transition-all ${saved ? 'text-small-orange' : 'text-white/40 hover:text-white hover:bg-white/8'} ${className}`}
    >
      <Bookmark size={size} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
};

export default BookmarkButton;
