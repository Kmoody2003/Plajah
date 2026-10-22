import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Users, Star, Home, Briefcase, EyeOff, ChevronRight, Newspaper, Clapperboard } from 'lucide-react';
import { auth } from '../../services/firebase';
import AudiencePicker from '../audience/AudiencePicker';
import AudienceListSheet, { type EditableList } from '../audience/AudienceListSheet';
import { AudienceIcon } from '../audience/AudienceIcon';
import {
  getAudienceDefaults, saveAudienceDefaults, getAudienceLists, describeAudience, syncMyAudiences,
  type AudienceDefaults, type AudienceLists, type AudienceSpec,
} from '../../services/audienceService';

/**
 * Settings → Privacy: "Who sees what" (Facebook-style).
 *   · Default audience for new posts and stories (Public, Followers, a list, Only me, or Custom)
 *   · Your lists: Close Friends, Family, Colleagues — plus Hidden from
 * Works alongside the Private account switch: a private account's widest audience is Followers.
 */
const AudienceSettings: React.FC = () => {
  const uid = auth.currentUser?.uid;
  const [defaults, setDefaults] = useState<AudienceDefaults | null>(null);
  const [lists, setLists] = useState<AudienceLists | null>(null);
  const [picking, setPicking] = useState<null | 'posts' | 'stories'>(null);
  const [editing, setEditing] = useState<EditableList | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    if (!uid) return;
    getAudienceDefaults(uid).then(setDefaults).catch(() => {});
    getAudienceLists(uid).then(setLists).catch(() => {});
  }, [uid]);
  useEffect(() => { load(); void syncMyAudiences().catch(() => {}); }, [load]);

  if (!uid) return null;

  const saveDefault = async (which: 'posts' | 'stories', spec: AudienceSpec) => {
    if (!defaults) return;
    const next = { ...defaults, [which]: spec };
    setDefaults(next);
    try { await saveAudienceDefaults(uid, next); setNote(''); }
    catch { setNote('Could not save your default audience. Try again.'); load(); }
  };

  const listRow = (id: EditableList, label: string, Icon: React.ComponentType<{ size?: number; className?: string }>, sub: string) => (
    <button key={id} onClick={() => setEditing(id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
      <Icon size={14} className="text-white/60" />
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-widest">{label}</span>
        <span className="block text-[10px] text-white/40">{sub}</span>
      </span>
      <span className="text-[11px] text-white/40">{lists ? lists[id].length : '…'}</span>
      <ChevronRight size={13} className="text-white/30" />
    </button>
  );

  const defaultRow = (which: 'posts' | 'stories', label: string, Icon: React.ComponentType<{ size?: number; className?: string }>) => (
    <button onClick={() => setPicking(which)} disabled={!defaults} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] disabled:opacity-50">
      <Icon size={14} className="text-white/60" />
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-widest">{label}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/55">
          {defaults && <AudienceIcon preset={defaults[which].preset} size={11} />}
          {defaults ? describeAudience(defaults[which]) : 'Loading…'}
        </span>
      </span>
      <ChevronRight size={13} className="text-white/30" />
    </button>
  );

  return (
    <div className="p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem] space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/25 flex items-center justify-center shrink-0">
          <Users size={15} className="text-[#FF8C00]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest">Who sees what</p>
          <p className="text-[10px] text-white/40 leading-relaxed mt-1">
            Choose who sees each post and story — Public, Followers, Close Friends, Family, Colleagues, Only me, or any
            combination (e.g. “Family and Close Friends except Colleagues”). These are your defaults; you can change the
            audience on every post. The database enforces it, so people outside the audience can’t open it at all.
          </p>
          {note && <p className="text-[10px] text-red-400 mt-1">{note}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 divide-y divide-white/5 overflow-hidden">
        {defaultRow('posts', 'Default for new posts', Newspaper)}
        {defaultRow('stories', 'Default for new stories', Clapperboard)}
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 px-1">Your lists</p>
        <div className="rounded-2xl border border-white/8 divide-y divide-white/5 overflow-hidden">
          {listRow('closeFriends', 'Close Friends', Star, 'Your inner circle — green ring on stories')}
          {listRow('family', 'Family', Home, 'Linked family is suggested first')}
          {listRow('colleagues', 'Colleagues', Briefcase, 'Work contacts')}
          {listRow('hiddenFrom', 'Hidden from', EyeOff, 'Never see your list posts or stories')}
        </div>
        <p className="text-[10px] text-white/35 mt-2 px-1">Lists are private and live: add someone and they can see what you’ve already shared with that list; remove them and they can’t.</p>
      </div>

      <AnimatePresence>
        {picking && defaults && (
          <AudiencePicker ownerId={uid} kind={picking === 'posts' ? 'default-post' : 'default-story'} value={defaults[picking]}
            onChange={spec => void saveDefault(picking, spec)} onClose={() => setPicking(null)} />
        )}
        {editing && (
          <AudienceListSheet ownerId={uid} list={editing} onClose={l => { if (l) setLists(l); setEditing(null); }} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AudienceSettings;
