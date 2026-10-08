/**
 * WeeklyRecapCard — "Your circle this week".
 *
 * Props:
 *   uid                signed-in user's uid (card renders nothing without it)
 *   displayName?/photo? used for the optional weekly digest notification
 *   hidden?            { has(uid) } blocked/muted set (useSocialSafety().hidden) excluded from "you may have missed"
 *   sendDigest?        default true: once a week (guarded by users/{uid}.lastDigestAt) also creates
 *                      an in-app notification, which the existing createNotification path pushes
 *   onOpenPost?(id) / onVisitUser?(uid)
 *
 * Shows only when there is something to say, and can be dismissed for the week.
 */
import React, { useEffect, useState } from 'react';
import { X, Users, MessageCircle, Heart } from 'lucide-react';
import { fetchWeeklyRecap, maybeSendWeeklyDigest } from '../../../services/retentionService';
import type { WeeklyRecap } from '../../../services/postingLogic';

export interface WeeklyRecapCardProps {
  uid?: string | null;
  displayName?: string;
  photo?: string;
  hidden?: { has(uid: string): boolean };
  sendDigest?: boolean;
  onOpenPost?: (postId: string) => void;
  onVisitUser?: (uid: string) => void;
  className?: string;
}

const weekId = () => `${new Date().getFullYear()}-${Math.floor(Date.now() / (7 * 86_400_000))}`;
const dismissKey = (uid: string) => `plajah.recap.dismissed.${uid}`;

const WeeklyRecapCard: React.FC<WeeklyRecapCardProps> = ({ uid, displayName = '', photo = '', hidden, sendDigest = true, onOpenPost, onVisitUser, className = '' }) => {
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);

  useEffect(() => {
    if (!uid) return;
    try { if (localStorage.getItem(dismissKey(uid)) === weekId()) return; } catch { /* ignore */ }
    let alive = true;
    fetchWeeklyRecap(uid, hidden).then(r => {
      if (!alive) return;
      if (r.hasContent) setRecap(r);
      if (sendDigest) void maybeSendWeeklyDigest(uid, displayName, photo, r);
    }).catch(() => {});
    return () => { alive = false; };
    // hidden is a Set that may change identity each render; intentionally keyed on uid only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (!uid || !recap) return null;
  const dismiss = () => { try { localStorage.setItem(dismissKey(uid), weekId()); } catch { /* ignore */ } setRecap(null); };

  return (
    <div className={`relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-4 sm:p-5 ${className}`}>
      <button onClick={dismiss} className="absolute top-3 right-3 p-1.5 rounded-xl text-white/30 hover:text-white hover:bg-white/8" aria-label="Dismiss"><X size={14} /></button>
      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-small-orange">This week</p>
      <h3 className="text-base font-black mt-0.5">Your circle this week</h3>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="rounded-2xl bg-white/[0.04] p-2.5 text-center">
          <Users size={14} className="mx-auto text-white/40" />
          <p className="text-lg font-black tabular-nums">{recap.newFollowerCount}</p>
          <p className="text-[9px] uppercase tracking-widest text-white/35">New followers</p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-2.5 text-center">
          <MessageCircle size={14} className="mx-auto text-white/40" />
          <p className="text-lg font-black tabular-nums">{recap.repliesReceived}</p>
          <p className="text-[9px] uppercase tracking-widest text-white/35">Replies</p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-2.5 text-center">
          <Heart size={14} className="mx-auto text-white/40" />
          <p className="text-lg font-black tabular-nums">{recap.likesReceived}</p>
          <p className="text-[9px] uppercase tracking-widest text-white/35">Likes</p>
        </div>
      </div>

      {recap.topPost && (
        <button onClick={() => onOpenPost?.(recap.topPost!.id)} className="mt-3 w-full text-left rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] p-3 transition-colors">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-0.5">Your top post</p>
          <p className="text-sm text-white/80 line-clamp-2">{recap.topPost.text || 'Media post'}</p>
          <p className="text-[10px] text-white/35 mt-1">{recap.topPost.likes} likes · {recap.topPost.replies} replies</p>
        </button>
      )}

      {recap.missed.length > 0 && (
        <div className="mt-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-1.5">You may have missed</p>
          <div className="space-y-1.5">
            {recap.missed.map(m => (
              <div key={m.postId} className="flex items-center gap-2 rounded-2xl bg-white/[0.03] p-2">
                <img
                  src={m.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.authorId}`}
                  alt="" loading="lazy" referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover shrink-0 cursor-pointer"
                  onClick={() => onVisitUser?.(m.authorId)}
                />
                <button onClick={() => onOpenPost?.(m.postId)} className="min-w-0 flex-1 text-left">
                  <p className="text-[11px] font-black truncate">{m.authorName}</p>
                  <p className="text-xs text-white/60 truncate">{m.text}</p>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyRecapCard;
