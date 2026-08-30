import React, { useState, useEffect } from 'react';
import { Info, Play, BookOpen, Eye, ThumbsUp, MessageCircle, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchPublicStats, positiveShare, formatCount, type PublicStats,
} from '../services/publicStats';

// The 411 — the public, at-a-glance numbers for a piece of content.
//
// EVERYTHING HERE USED TO BE INVENTED. On open it ran
//   const pseudoRandomViews = Math.floor(Math.random() * 50000) + 1200;
// and rendered that as "Total Views", so the same title showed a different audience on every
// page load. "Positive Feedback" was the literal string 98% on every piece of content on the
// platform. Worst of the three, "Community Sentiment" printed invented pull-quotes —
// "A masterpiece that keeps giving," "Incredible execution" — formatted as if real people had
// said them about this specific work. Nobody had said anything.
//
// Now every number is read from `publicStats/{contentId}`, which only the server writes, from
// playback events the players actually emit. When a piece has no data yet it says so. A new
// upload legitimately reading "no plays yet" is worth more than a confident fabrication.

interface The411Props {
  itemId: string;
  itemType: 'MUSIC' | 'VIDEO' | 'MOVIE' | 'ARTICLE' | 'BOOK' | 'GAME';
  title: string;
  author: string;
  /** Engagement already loaded on the content doc — passed in rather than re-fetched. */
  likes?: number;
  comments?: number;
}

/** What the play counter is called for this kind of content, so the label reads naturally. */
const NOUN: Record<The411Props['itemType'], { count: string; verb: string }> = {
  MUSIC:   { count: 'Total Plays',  verb: 'listened to' },
  VIDEO:   { count: 'Total Views',  verb: 'watched' },
  MOVIE:   { count: 'Total Views',  verb: 'watched' },
  ARTICLE: { count: 'Total Reads',  verb: 'read' },
  BOOK:    { count: 'Total Reads',  verb: 'read' },
  GAME:    { count: 'Total Plays',  verb: 'played' },
};

const Stat: React.FC<{ icon: React.ReactNode; value: string; label: string }> = ({ icon, value, label }) => (
  <div className="flex items-center gap-3 text-white/80">
    {icon}
    <div>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">{label}</div>
    </div>
  </div>
);

const The411: React.FC<The411Props> = ({ itemId, itemType, title, author, likes, comments }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fetched on first open, not on mount — this panel sits on detail pages that render many
  // titles, and most are never expanded.
  useEffect(() => {
    if (!isOpen || loaded) return;
    let cancelled = false;
    setIsLoading(true);
    fetchPublicStats(itemId)
      .then(s => { if (!cancelled) { setStats(s); setLoaded(true); } })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, itemId, loaded]);

  // A new item resets the panel, so it can't show the previous title's numbers.
  useEffect(() => { setStats(null); setLoaded(false); }, [itemId]);

  const noun = NOUN[itemType] || NOUN.VIDEO;
  const plays = stats?.plays || 0;
  const score = positiveShare(stats);
  const ratingCount = (stats?.up || 0) + (stats?.down || 0);
  const likeCount = likes || 0;
  const commentCount = comments || 0;
  const hasAnything = plays > 0 || ratingCount > 0 || likeCount > 0 || commentCount > 0;

  const getIcon = () => {
    if (itemType === 'MUSIC' || itemType === 'GAME') return <Play size={16} />;
    if (itemType === 'ARTICLE' || itemType === 'BOOK') return <BookOpen size={16} />;
    return <Eye size={16} />;
  };

  return (
    <div className="my-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all text-xs font-black uppercase tracking-widest text-small-orange"
      >
        <Info size={16} />
        The 411
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-4"
          >
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 relative">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-8 h-8 rounded-full border-2 border-small-orange border-t-transparent animate-spin mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Gathering the 411...</p>
                </div>
              ) : !hasAnything ? (
                // No data is a real answer. Saying so is the honest version of what this panel
                // used to fill with random numbers.
                <div className="py-6 text-center space-y-2">
                  <p className="text-sm font-bold text-white/70">No activity yet</p>
                  <p className="text-xs text-white/40 leading-relaxed max-w-sm mx-auto">
                    Nobody has {noun.verb} “{title}” on Plajah yet. Counts appear here as soon as
                    they do.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-6 flex-wrap pb-6 border-b border-white/5">
                    {plays > 0 && (
                      <Stat icon={getIcon()} value={formatCount(plays)} label={noun.count} />
                    )}
                    {/* Only rendered once somebody has actually voted — a percentage computed
                        from zero votes is not 0%, it is nothing. */}
                    {score !== null && (
                      <Stat
                        icon={<ThumbsUp size={16} />}
                        value={`${score}%`}
                        label={`Liked · ${formatCount(ratingCount)} rating${ratingCount === 1 ? '' : 's'}`}
                      />
                    )}
                    {likeCount > 0 && (
                      <Stat icon={<Heart size={16} />} value={formatCount(likeCount)} label="Likes" />
                    )}
                    {commentCount > 0 && (
                      <Stat icon={<MessageCircle size={16} />} value={formatCount(commentCount)} label="Comments" />
                    )}
                  </div>

                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Summary</h4>
                    {/* Restates the counts above and nothing else. The old copy asserted the work
                        was "widely recognized for its unique approach and engaging style" — a
                        review of a piece nothing had measured. */}
                    <p className="text-sm font-medium leading-relaxed">
                      {plays > 0
                        ? <>“{title}”{author ? <> by {author}</> : null} has been {noun.verb}{' '}
                            {plays.toLocaleString()} time{plays === 1 ? '' : 's'} on Plajah.</>
                        : <>“{title}”{author ? <> by {author}</> : null} has not been {noun.verb} yet.</>}
                      {score !== null && (
                        <> {score}% of the {ratingCount.toLocaleString()} {ratingCount === 1 ? 'person' : 'people'} who rated it gave it a thumbs up.</>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default The411;
