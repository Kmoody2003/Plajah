import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Search, Check, Loader2, Star, EyeOff, Home, Briefcase } from 'lucide-react';
import { fetchProfilesLite } from '../../services/socialSafetyService';
import {
  getAudienceLists, saveAudienceLists, audienceCandidates, familySuggestions, LIST_LABEL,
  type AudienceLists, type AudienceListId,
} from '../../services/audienceService';

// Edit one audience list — Close Friends, Family, Colleagues, or Hidden from — picking from your
// followers, the people you follow, and your family links. Lists are live: changes apply to
// earlier posts and stories shared with that list too (services/audienceService syncMyAudiences).

export type EditableList = AudienceListId | 'hiddenFrom';

const META: Record<EditableList, { title: string; hint: string; icon: React.ComponentType<{ size?: number; className?: string }>; tint: string }> = {
  closeFriends: { title: LIST_LABEL.closeFriends, icon: Star, tint: 'bg-green-500 border-green-500',
    hint: 'Your inner circle. Posts and stories you share to Close Friends only reach them. Nobody is told when you add or remove them.' },
  family: { title: LIST_LABEL.family, icon: Home, tint: 'bg-sky-500 border-sky-500',
    hint: 'Relatives you share family moments with. Your linked family (guardian, children, partner) is suggested first.' },
  colleagues: { title: LIST_LABEL.colleagues, icon: Briefcase, tint: 'bg-violet-500 border-violet-500',
    hint: 'Work contacts. Use it to share work updates — or to keep personal posts away from work with “Followers except Colleagues”.' },
  hiddenFrom: { title: 'Hidden from', icon: EyeOff, tint: 'bg-small-orange border-small-orange',
    hint: 'These people never see your posts shared to lists or your stories, including ones already up. Hiding anyone keeps a Public story to your followers.' },
};

interface Props {
  ownerId: string;
  list: EditableList;
  onClose: (lists: AudienceLists | null) => void;
}

const AudienceListSheet: React.FC<Props> = ({ ownerId, list, onClose }) => {
  const [lists, setLists] = useState<AudienceLists | null>(null);
  const [people, setPeople] = useState<Array<{ uid: string; displayName: string; photoURL: string; suggested?: boolean }>>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const meta = META[list];
  const Icon = meta.icon;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [l, candidates, fam] = await Promise.all([getAudienceLists(ownerId), audienceCandidates(ownerId), list === 'family' ? familySuggestions(ownerId) : Promise.resolve([])]);
      const uids = [...new Set([...l[list], ...fam, ...candidates])];
      const profiles = await fetchProfilesLite(uids);
      if (!alive) return;
      const famSet = new Set(fam);
      setLists(l);
      setPicked(new Set(l[list]));
      setPeople(profiles
        .map(p => ({ ...p, suggested: famSet.has(p.uid) }))
        .sort((a, b) => Number(!!b.suggested) - Number(!!a.suggested) || a.displayName.localeCompare(b.displayName)));
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
    if (!lists) return;
    setSaving(true); setFailed(false);
    const next: AudienceLists = { ...lists, [list]: [...picked] };
    try {
      await saveAudienceLists(ownerId, next);
      onClose(next);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[260] flex items-end md:items-center justify-center bg-black/70" onClick={() => onClose(null)}>
      <div className="w-full max-w-sm max-h-[85dvh] flex flex-col bg-[#111] rounded-t-3xl md:rounded-3xl border border-white/5 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="flex items-center gap-2 font-black text-xs uppercase tracking-[0.25em] text-white">
            <Icon size={14} className="text-white/70" /> {meta.title}
          </h3>
          <button onClick={() => onClose(null)} className="text-white/40 hover:text-white p-1" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="px-5 pt-3 text-[11px] text-white/45 leading-relaxed">{meta.hint}</p>
        <div className="px-5 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search people"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/20" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-white/40" /></div>
          ) : shown.length === 0 ? (
            <p className="text-center text-xs text-white/35 py-10">{people.length ? 'No matches.' : 'Follow people (or get followers) to build this list.'}</p>
          ) : shown.map(p => {
            const on = picked.has(p.uid);
            return (
              <button key={p.uid} onClick={() => toggle(p.uid)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 text-left">
                {p.photoURL ? <img src={p.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white">{(p.displayName || '?')[0]}</div>}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white truncate">{p.displayName}</span>
                  {p.suggested && <span className="block text-[10px] text-sky-300/80">Family link</span>}
                </span>
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${on ? meta.tint : 'border-white/25'}`}>
                  {on && <Check size={12} className="text-black" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="p-4 border-t border-white/5 space-y-2">
          {failed && <p className="text-xs text-red-400 text-center">Couldn’t save the list. Try again.</p>}
          <button onClick={save} disabled={saving || loading || !lists}
            className="w-full py-3 rounded-2xl bg-small-orange text-white font-black text-xs uppercase tracking-widest disabled:opacity-40">
            {saving ? 'Saving…' : `Done · ${picked.size}`}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default AudienceListSheet;
