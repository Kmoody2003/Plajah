import React, { useEffect, useState } from 'react';
import { Megaphone, Heart, Send } from 'lucide-react';
import { Post } from '../types';
import { listenToOrgPosts, createOrgPost, togglePostLike } from '../services/backendService';
import { auth } from '../services/firebase';

// Real, persistent church announcements feed. Staff post announcements (as the
// church identity); members see them and can react. Backed by the shared posts
// collection via authorOrgId, so announcements also surface in the global feed.
const ChurchAnnouncements: React.FC<{ orgId: string; orgName: string; orgPhoto: string; isOwner?: boolean }> = ({ orgId, orgName, orgPhoto, isOwner }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const uid = auth.currentUser?.uid;

  useEffect(() => listenToOrgPosts(orgId, setPosts), [orgId]);

  const publish = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await createOrgPost(orgId, orgName, orgPhoto, { text: text.trim(), isPublic: true }); setText(''); }
    finally { setBusy(false); }
  };

  if (posts.length === 0 && !isOwner) return null;

  return (
    <section className="mt-10">
      <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2"><Megaphone size={12} className="text-small-orange" /> Announcements</h2>

      {isOwner && (
        <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 mb-4">
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            placeholder={`Post an announcement as ${orgName}…`}
            rows={2}
            className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-white/25"
          />
          <div className="flex justify-end pt-2 border-t border-white/8 mt-2">
            <button onClick={publish} disabled={!text.trim() || busy}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30">
              <Send size={11} /> Publish
            </button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="text-[11px] text-white/30 uppercase tracking-widest text-center py-6">No announcements yet</p>
      ) : (
        <div className="space-y-3">
          {posts.map(p => {
            const liked = !!uid && p.likedBy?.includes(uid);
            return (
              <div key={p.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <img src={p.authorPhoto || orgPhoto} className="w-6 h-6 rounded-full border border-white/10" alt="" />
                  <p className="text-[11px] font-black text-white">{p.authorName || orgName}<span className="text-white/30 font-bold"> · {new Date(p.timestamp).toLocaleDateString()}</span></p>
                </div>
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap mb-3">{p.text}</p>
                {p.media?.[0]?.url && <img src={p.media[0].url} className="rounded-xl border border-white/10 max-h-72 w-full object-cover mb-3" alt="" />}
                <button onClick={() => uid ? togglePostLike(p.id) : alert('Sign in to react.')}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-colors"
                  style={{ color: liked ? '#FF8C00' : 'rgba(255,255,255,0.4)' }}>
                  <Heart size={12} fill={liked ? '#FF8C00' : 'none'} /> {p.likesCount || 0}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ChurchAnnouncements;
