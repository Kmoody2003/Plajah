import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Search, Check, Loader2, Star, EyeOff } from 'lucide-react';
import { fetchFollowers } from '../services/backendService';
import { fetchProfilesLite } from '../services/socialSafetyService';
import { getStoryCircle, saveStoryCircle, removeFromLiveStories, type StoryCircle } from '../services/storyAudience';

// Edit one of your story lists — Close Friends or Hide story from — picking from your followers
// (anyone already on the list stays listed even if they've since unfollowed, so they can be removed).

interface Props {
  ownerId: string;
  list: 'closeFriends' | 'hiddenFrom';
  onClose: (circle: StoryCircle) => void;
}

const COPY = {
  closeFriends: { title: 'Close Friends', hint: 'Only people on this list see stories you share to Close Friends. They won’t be told when you add or remove them.', icon: Star },
  hiddenFrom: { title: 'Hide story from', hint: 'These people won’t see any of your stories, including ones already up. Hiding from anyone keeps a public story to your followers.', icon: EyeOff },
} as const;

const StoryAudienceSheet: React.FC<Props> = ({ ownerId, list, onClose }) => {
  const [circle, setCircle] = useState<StoryCircle>({ closeFriends: [], hiddenFrom: [] });
  const [people, setPeople] = useState<Array<{ uid: string; displayName: string; photoURL: string }>>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const { title, hint, icon: Icon } = COPY[list];

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, followers] = await Promise.all([getStoryCircle(ownerId), fetchFollowers(ownerId)]);
      const uids = [...new Set([...c[list], ...followers])];
      const profiles = await fetchProfilesLite(uids);
      if (!alive) return;
      setCircle(c);
      setPicked(new Set(c[list]));
      setPeople(profiles.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setLoading(false);
    })().catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ownerId, list]);

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? people.filter(p => p.displayName.toLowerCase().includes(t)) : people;
  }, [people, term]);

  const toggle = (uid: string) => setPicked(prev => {
    const next = new Set(prev);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    return next;
  });

  const save = async () => {
    setSaving(true); setFailed(false);
    const next: StoryCircle = { ...circle, [list]: [...picked] };
    try {
      await saveStoryCircle(ownerId, next);
      // Hiding applies to stories that are already up, too.
      if (list === 'hiddenFrom') {
        const newlyHidden = [...picked].filter(u => !circle.hiddenFrom.includes(u));
        await Promise.all(newlyHidden.map(u => removeFromLiveStories(u).catch(() => {})));
      }
      onClose(next);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[210] flex items-end md:items-center justify-center bg-black/70">
      <div className="w-full max-w-sm max-h-[85dvh] flex flex-col bg-[#111] rounded-t-3xl md:rounded-3xl border border-white/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="flex items-center gap-2 font-black text-xs uppercase tracking-[0.25em] text-white">
            <Icon size={14} className={list === 'closeFriends' ? 'text-green-400' : 'text-white/60'} /> {title}
          </h3>
          <button onClick={() => onClose(circle)} className="text-white/40 hover:text-white p-1" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="px-5 pt-3 text-[11px] text-white/45 leading-relaxed">{hint}</p>
        <div className="px-5 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search followers"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/20" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-white/40" /></div>
          ) : shown.length === 0 ? (
            <p className="text-center text-xs text-white/35 py-10">{people.length ? 'No matches.' : 'No followers yet.'}</p>
          ) : shown.map(p => {
            const on = picked.has(p.uid);
            return (
              <button key={p.uid} onClick={() => toggle(p.uid)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 text-left">
                {p.photoURL ? <img src={p.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white">{(p.displayName || '?')[0]}</div>}
                <span className="flex-1 text-sm text-white truncate">{p.displayName}</span>
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${on ? (list === 'closeFriends' ? 'bg-green-500 border-green-500' : 'bg-small-orange border-small-orange') : 'border-white/25'}`}>
                  {on && <Check size={12} className="text-black" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="p-4 border-t border-white/5 space-y-2">
          {failed && <p className="text-xs text-red-400 text-center">Couldn’t save the list. Try again.</p>}
          <button onClick={save} disabled={saving || loading}
            className="w-full py-3 rounded-2xl bg-small-orange text-white font-black text-xs uppercase tracking-widest disabled:opacity-40">
            {saving ? 'Saving…' : `Done · ${picked.size}`}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default StoryAudienceSheet;
