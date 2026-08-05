/**
 * StudentWall — the visible wall of published student work for a curriculum tag.
 *
 * Blueprint Part 2B ("make-your-own path"): lesson assignments across the Film /
 * Photography / Art / Chora schools publish with a school tag, and this is the surface
 * that reads them back, closing the loop.
 *
 * Mountable anywhere. Drop into a curriculum view with nothing but a tag:
 *
 *   <StudentWall tag="filmschool" />
 *   <StudentWall tag="photoschool" title="Module 3 · Light" lessonTag="photo-m3" max={12} />
 *   <StudentWall tag="artschool" variant="compact" onVisitUser={onVisitUser} />
 *
 * `StudentWallRow` is the horizontal discovery variant used in the feed.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, Play, ImageIcon, ChevronRight, X as XIcon, Loader2, Sparkles } from 'lucide-react';
import type { Post } from '../types';
import {
  listenToStudentWall,
  wallLabelFor,
  SCHOOL_WALL_TAGS,
  SCHOOL_WALL_META,
  type StudentWallOptions,
} from '../services/studentWall';
import PostCard from './PostCard';
import Portal from './Portal';

// ── helpers ──────────────────────────────────────────────────────────────────

/** First renderable image for a post tile; undefined when the post is text-only. */
function coverOf(post: Post): { url: string; isVideo: boolean } | undefined {
  const m = (post.media || []).find(x => x.type === 'PHOTO' || x.type === 'VIDEO' || x.type === 'GIF');
  if (!m) return undefined;
  const url = m.thumbnail || m.url;
  if (!url) return undefined;
  return { url, isVideo: m.type === 'VIDEO' };
}

// ── tile ─────────────────────────────────────────────────────────────────────

const WallTile: React.FC<{ post: Post; onOpen: () => void }> = ({ post, onOpen }) => {
  const cover = coverOf(post);
  return (
    <button
      onClick={onOpen}
      className="group relative w-full aspect-square rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03] text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-[0_8px_28px_rgba(0,0,0,0.4)]"
    >
      {cover ? (
        <img
          src={cover.url}
          alt={post.text?.slice(0, 60) || 'Student work'}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <p className="text-[11px] font-bold text-white/50 line-clamp-5 leading-snug text-center">
            {post.text || 'Untitled'}
          </p>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-90" />

      {cover?.isVideo && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 border border-white/20 backdrop-blur-sm flex items-center justify-center">
          <Play size={10} fill="currentColor" className="text-white ml-0.5" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-2.5 flex items-center gap-1.5 min-w-0">
        {post.authorPhoto ? (
          <img
            src={post.authorPhoto}
            alt=""
            className="w-5 h-5 rounded-full object-cover border border-white/20 flex-shrink-0"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex-shrink-0" />
        )}
        <span className="text-[10px] font-black uppercase tracking-widest text-white/80 truncate">
          {post.authorName}
        </span>
      </div>
    </button>
  );
};

// ── detail overlay ───────────────────────────────────────────────────────────

const WallDetail: React.FC<{ post: Post; onClose: () => void; onVisitUser?: (uid: string) => void }> = ({
  post, onClose, onVisitUser,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-start justify-center overflow-y-auto p-4 sm:p-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          className="w-full max-w-2xl my-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-end mb-2">
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Close"
            >
              <XIcon size={16} />
            </button>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#0b0b0d] overflow-hidden">
            <PostCard post={post} onVisitUser={onVisitUser} />
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
};

// ── main wall ────────────────────────────────────────────────────────────────

export interface StudentWallProps {
  /** Curriculum tag to read, e.g. 'filmschool' | 'photoschool' | 'artschool' | 'choraschool'. */
  tag: string;
  /** Heading override. Defaults to "<School> · Student Wall". */
  title?: string;
  /** Sub-heading override. */
  subtitle?: string;
  /** Narrow to one lesson within the school. */
  lessonTag?: string;
  /** Max tiles (default 24). */
  max?: number;
  /** 'grid' (default) fills the container; 'compact' is a denser 3-up. */
  variant?: 'grid' | 'compact';
  /** Hide the header when the host surface already provides one. */
  hideHeader?: boolean;
  onVisitUser?: (uid: string) => void;
  /** Render nothing at all when the wall is empty (for optional embeds). */
  hideWhenEmpty?: boolean;
  /** Called when the wall's post count settles — lets a host show/hide a nav entry. */
  onCount?: (count: number) => void;
  className?: string;
}

const StudentWall: React.FC<StudentWallProps> = ({
  tag,
  title,
  subtitle,
  lessonTag,
  max = 24,
  variant = 'grid',
  hideHeader = false,
  onVisitUser,
  hideWhenEmpty = false,
  onCount,
  className = '',
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Post | null>(null);

  useEffect(() => {
    if (!tag) { setPosts([]); setLoading(false); return; }
    setLoading(true);
    const opts: StudentWallOptions = { max, ...(lessonTag ? { lessonTag } : {}) };
    const unsub = listenToStudentWall(tag, next => {
      setPosts(next.slice(0, max));
      setLoading(false);
    }, opts);
    return () => { try { unsub(); } catch { /* already torn down */ } };
  }, [tag, lessonTag, max]);

  useEffect(() => { if (!loading) onCount?.(posts.length); }, [loading, posts.length, onCount]);

  const heading = title || `${wallLabelFor(tag)} · Student Wall`;
  const blurb = subtitle ?? SCHOOL_WALL_META[tag]?.blurb ?? 'Published work from the assignment';

  if (hideWhenEmpty && !loading && posts.length === 0) return null;

  return (
    <section className={`w-full min-w-0 ${className}`}>
      {!hideHeader && (
        <div className="flex items-end justify-between gap-3 mb-3 px-1">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/25 flex items-center gap-1.5 mb-1">
              <GraduationCap size={10} />
              Student Wall
            </p>
            <h3 className="text-[15px] font-black text-white leading-tight truncate">{heading}</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mt-0.5 truncate">{blurb}</p>
          </div>
          {!loading && posts.length > 0 && (
            <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-widest text-small-orange px-2.5 py-1 rounded-full bg-small-orange/10 border border-small-orange/20">
              {posts.length} {posts.length === 1 ? 'piece' : 'pieces'}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <Loader2 size={20} className="text-white/25 animate-spin" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20">Loading the wall</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="py-12 text-center rounded-3xl border border-dashed border-white/[0.07] bg-white/[0.015]">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={20} className="text-white/20" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/25">Wall is empty</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/15 mt-2">
            Publish your assignment with #{tag} to be first
          </p>
        </div>
      ) : (
        <div
          className={
            variant === 'compact'
              ? 'grid grid-cols-3 gap-2'
              : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5'
          }
        >
          {posts.map(p => (
            <WallTile key={p.id} post={p} onOpen={() => setActive(p)} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {active && <WallDetail post={active} onClose={() => setActive(null)} onVisitUser={onVisitUser} />}
      </AnimatePresence>
    </section>
  );
};

// ── feed discovery row ───────────────────────────────────────────────────────

const WallRowStrip: React.FC<{
  tag: string;
  onVisitUser?: (uid: string) => void;
  onOpen: (post: Post) => void;
  onCount: (tag: string, n: number) => void;
}> = ({ tag, onOpen, onCount }) => {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const unsub = listenToStudentWall(tag, next => setPosts(next.slice(0, 10)), { max: 10 });
    return () => { try { unsub(); } catch { /* already torn down */ } };
  }, [tag]);

  useEffect(() => { onCount(tag, posts.length); }, [tag, posts.length, onCount]);

  if (posts.length === 0) return null;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/45">{wallLabelFor(tag)}</span>
        <span className="text-[9px] font-black text-white/20">{posts.length}</span>
        <ChevronRight size={11} className="text-white/15" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x">
        {posts.map(p => {
          const cover = coverOf(p);
          return (
            <button
              key={p.id}
              onClick={() => onOpen(p)}
              className="group relative flex-shrink-0 w-28 h-36 rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.03] snap-start transition-all hover:-translate-y-0.5 hover:border-white/[0.16]"
            >
              {cover ? (
                <img
                  src={cover.url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-2">
                  <ImageIcon size={16} className="text-white/15" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/75 truncate">
                  {p.authorName}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface StudentWallRowProps {
  /** Tags to surface. Defaults to all four school tags. */
  tags?: readonly string[];
  onVisitUser?: (uid: string) => void;
  className?: string;
}

/**
 * Horizontal, feed-embeddable discovery row across several school walls.
 * Renders nothing until at least one wall has work, so a quiet feed stays quiet.
 */
export const StudentWallRow: React.FC<StudentWallRowProps> = ({
  tags = SCHOOL_WALL_TAGS,
  onVisitUser,
  className = '',
}) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Post | null>(null);

  const handleCount = useCallback((tag: string, n: number) => {
    setCounts(prev => (prev[tag] === n ? prev : { ...prev, [tag]: n }));
  }, []);

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  return (
    <div className={total === 0 ? 'hidden' : `w-full min-w-0 rounded-3xl border border-white/[0.06] bg-white/[0.015] p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/25 flex items-center gap-1.5">
            <GraduationCap size={10} />
            From the Schools
          </p>
          <h3 className="text-[14px] font-black text-white leading-tight mt-1">Student Walls</h3>
        </div>
        <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-widest text-small-orange px-2.5 py-1 rounded-full bg-small-orange/10 border border-small-orange/20">
          {total} published
        </span>
      </div>

      <div className="space-y-4">
        {tags.map(t => (
          <WallRowStrip key={t} tag={t} onOpen={setActive} onVisitUser={onVisitUser} onCount={handleCount} />
        ))}
      </div>

      <AnimatePresence>
        {active && <WallDetail post={active} onClose={() => setActive(null)} onVisitUser={onVisitUser} />}
      </AnimatePresence>
    </div>
  );
};

export default StudentWall;
