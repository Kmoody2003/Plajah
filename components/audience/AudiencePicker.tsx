import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, ChevronRight, Search, Pencil } from 'lucide-react';
import { AudienceIcon } from './AudienceIcon';
import AudienceListSheet, { type EditableList } from './AudienceListSheet';
import { fetchProfilesLite } from '../../services/socialSafetyService';
import {
  AUDIENCE_LISTS, LIST_LABEL, PRESET_LABEL, describeAudience, normalize,
  audienceCandidates, getAudienceLists, getAudienceDefaults, saveAudienceDefaults, isAccountPrivate,
  type AudienceSpec, type AudiencePreset, type AudienceListId, type AudienceLists, type CustomAudience,
} from '../../services/audienceService';

// "Who can see this?" — Facebook's audience selector. Presets, plus Custom: share with any mix
// of Followers / lists / specific people, except any lists / people. Used by the post composer,
// the story creator and Settings → Privacy (default audience).

interface Props {
  ownerId: string;
  kind: 'post' | 'story' | 'default-post' | 'default-story';
  value: AudienceSpec;
  onChange: (spec: AudienceSpec) => void;
  onClose: () => void;
}

const PRESET_HINT: Record<AudiencePreset, string> = {
  PUBLIC: 'Anyone on or off Plajah',
  FOLLOWERS: 'People who follow you',
  CLOSE_FRIENDS: 'Your Close Friends list',
  FAMILY: 'Your Family list',
  COLLEAGUES: 'Your Colleagues list',
  ONLY_ME: 'Only you',
  CUSTOM: 'Include and exclude lists and people',
};

const emptyCustom = (): CustomAudience => ({ followers: true, lists: [], people: [], exceptLists: [], exceptPeople: [] });

const AudiencePicker: React.FC<Props> = ({ ownerId, kind, value, onChange, onClose }) => {
  const [preset, setPreset] = useState<AudiencePreset>(value.preset);
  const [custom, setCustom] = useState<CustomAudience>(() => {
    if (value.preset !== 'CUSTOM') return emptyCustom();
    const { followers, lists, people, exceptLists, exceptPeople } = normalize(value);
    return { followers, lists, people, exceptLists, exceptPeople };
  });
  const [isPrivate, setIsPrivate] = useState(false);
  const [lists, setLists] = useState<AudienceLists | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);
  const [editing, setEditing] = useState<EditableList | null>(null);
  const [peoplePicker, setPeoplePicker] = useState<null | 'people' | 'exceptPeople'>(null);
  const isStory = kind === 'story' || kind === 'default-story';
  const isDefault = kind.startsWith('default');

  useEffect(() => {
    Promise.all([isAccountPrivate(ownerId), getAudienceLists(ownerId)]).then(([p, l]) => { setIsPrivate(p); setLists(l); }).catch(() => {});
  }, [ownerId]);

  const presets: AudiencePreset[] = isStory
    ? ['PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS', 'FAMILY', 'COLLEAGUES', 'CUSTOM']
    : ['PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS', 'FAMILY', 'COLLEAGUES', 'ONLY_ME', 'CUSTOM'];

  const spec: AudienceSpec = preset === 'CUSTOM' ? { preset, custom } : { preset };
  const count = (l: AudienceListId) => lists?.[l].length ?? 0;
  const presetList: Partial<Record<AudiencePreset, AudienceListId>> = { CLOSE_FRIENDS: 'closeFriends', FAMILY: 'family', COLLEAGUES: 'colleagues' };

  const done = async () => {
    // An empty list preset would share with nobody — build the list first.
    const need = presetList[preset];
    if (need && lists && lists[need].length === 0) { setEditing(need); return; }
    onChange(spec);
    if (makeDefault && !isDefault) {
      const d = await getAudienceDefaults(ownerId).catch(() => null);
      if (d) await saveAudienceDefaults(ownerId, isStory ? { ...d, stories: spec } : { ...d, posts: spec }).catch(() => {});
    }
    onClose();
  };

  const toggleIn = (key: 'lists' | 'exceptLists', l: AudienceListId) => setCustom(c => {
    const has = c[key].includes(l);
    const other = key === 'lists' ? 'exceptLists' : 'lists';
    return { ...c, [key]: has ? c[key].filter(x => x !== l) : [...c[key], l], [other]: c[other].filter(x => x !== l) };
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[250] flex items-end md:items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90dvh] flex flex-col bg-[#111] rounded-t-3xl md:rounded-3xl border border-white/5 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="font-black text-xs uppercase tracking-[0.25em] text-white">
            {isDefault ? (isStory ? 'Default story audience' : 'Default post audience') : 'Who can see this?'}
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {isPrivate && <p className="px-2 pb-2 text-[11px] text-white/45">Your account is private, so Public isn’t available — your followers are the widest audience.</p>}
          {presets.map(p => {
            const off = p === 'PUBLIC' && isPrivate;
            const list = presetList[p];
            return (
              <div key={p}>
                <button disabled={off} onClick={() => setPreset(p)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-colors disabled:opacity-30 ${preset === p ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}>
                  <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/80"><AudienceIcon preset={p} size={15} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-white">{PRESET_LABEL[p]}</span>
                    <span className="block text-[11px] text-white/40 truncate">
                      {list ? `${PRESET_HINT[p]} · ${count(list)} ${count(list) === 1 ? 'person' : 'people'}` : PRESET_HINT[p]}
                    </span>
                  </span>
                  {list && (
                    <span role="button" aria-label={`Edit ${LIST_LABEL[list]}`} onClick={e => { e.stopPropagation(); setEditing(list); }} className="p-1.5 text-white/35 hover:text-white"><Pencil size={13} /></span>
                  )}
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${preset === p ? 'bg-small-orange border-small-orange' : 'border-white/25'}`}>
                    {preset === p && <Check size={12} className="text-black" strokeWidth={3} />}
                  </span>
                </button>

                {p === 'CUSTOM' && preset === 'CUSTOM' && (
                  <div className="mx-2 mt-1 mb-2 p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Share with</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Chip on={custom.followers} onClick={() => setCustom(c => ({ ...c, followers: !c.followers }))}>Followers</Chip>
                        {AUDIENCE_LISTS.map(l => <Chip key={l} on={custom.lists.includes(l)} onClick={() => toggleIn('lists', l)}>{LIST_LABEL[l]}</Chip>)}
                        <Chip on={custom.people.length > 0} onClick={() => setPeoplePicker('people')}>
                          {custom.people.length ? `${custom.people.length} specific` : '+ Specific people'}
                        </Chip>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Don’t share with</p>
                      <div className="flex flex-wrap gap-1.5">
                        {AUDIENCE_LISTS.map(l => <Chip key={l} danger on={custom.exceptLists.includes(l)} onClick={() => toggleIn('exceptLists', l)}>{LIST_LABEL[l]}</Chip>)}
                        <Chip danger on={custom.exceptPeople.length > 0} onClick={() => setPeoplePicker('exceptPeople')}>
                          {custom.exceptPeople.length ? `${custom.exceptPeople.length} specific` : '+ Specific people'}
                        </Chip>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/55">Shared with: <span className="text-white">{describeAudience(spec)}</span></p>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={() => setEditing('hiddenFrom')} className="w-full flex items-center gap-2 px-3 py-3 mt-2 rounded-2xl text-left text-xs text-white/60 hover:text-white hover:bg-white/[0.04]">
            <span className="flex-1">Hidden from (never sees list posts or stories)</span>
            <span className="text-white/35">{lists?.hiddenFrom.length ?? 0}</span><ChevronRight size={13} className="text-white/30" />
          </button>
        </div>

        <div className="p-4 border-t border-white/5 space-y-3">
          {!isDefault && (
            <label className="flex items-center gap-2 text-[11px] text-white/55 cursor-pointer select-none">
              <input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} className="accent-[#ff8c00]" />
              Set as my default {isStory ? 'story' : 'post'} audience
            </label>
          )}
          <button onClick={done} className="w-full py-3 rounded-2xl bg-small-orange text-white font-black text-xs uppercase tracking-widest">Done</button>
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <AudienceListSheet ownerId={ownerId} list={editing} onClose={l => { if (l) setLists(l); setEditing(null); }} />
        )}
        {peoplePicker && (
          <PeoplePicker ownerId={ownerId} selected={custom[peoplePicker]}
            title={peoplePicker === 'people' ? 'Share with specific people' : 'Don’t share with'}
            onClose={sel => { if (sel) setCustom(c => ({ ...c, [peoplePicker]: sel, ...(peoplePicker === 'people' ? { exceptPeople: c.exceptPeople.filter(u => !sel.includes(u)) } : { people: c.people.filter(u => !sel.includes(u)) }) })); setPeoplePicker(null); }} />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Chip: React.FC<{ on: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, danger, onClick, children }) => (
  <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${on
    ? (danger ? 'bg-red-500/20 border-red-500/50 text-red-200' : 'bg-small-orange/20 border-small-orange/60 text-white')
    : 'border-white/10 text-white/50 hover:text-white hover:border-white/25'}`}>{children}</button>
);

/** Pick specific people from your followers / following / family. */
const PeoplePicker: React.FC<{ ownerId: string; selected: string[]; title: string; onClose: (sel: string[] | null) => void }> = ({ ownerId, selected, title, onClose }) => {
  const [people, setPeople] = useState<Array<{ uid: string; displayName: string; photoURL: string }>>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    audienceCandidates(ownerId).then(u => fetchProfilesLite([...new Set([...selected, ...u])]))
      .then(p => { if (alive) { setPeople(p.sort((a, b) => a.displayName.localeCompare(b.displayName))); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => { const t = term.trim().toLowerCase(); return t ? people.filter(p => p.displayName.toLowerCase().includes(t)) : people; }, [people, term]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[270] flex items-end md:items-center justify-center bg-black/70" onClick={() => onClose(null)}>
      <div className="w-full max-w-sm max-h-[85dvh] flex flex-col bg-[#111] rounded-t-3xl md:rounded-3xl border border-white/5 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="font-black text-xs uppercase tracking-[0.25em] text-white">{title}</h3>
          <button onClick={() => onClose(null)} className="text-white/40 hover:text-white p-1" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search people"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/20" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {loading ? <p className="text-center text-xs text-white/35 py-10">Loading…</p>
            : shown.length === 0 ? <p className="text-center text-xs text-white/35 py-10">No one to pick yet.</p>
            : shown.map(p => {
              const on = picked.has(p.uid);
              return (
                <button key={p.uid} onClick={() => setPicked(s => { const n = new Set(s); n.has(p.uid) ? n.delete(p.uid) : n.add(p.uid); return n; })}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 text-left">
                  {p.photoURL ? <img src={p.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white">{(p.displayName || '?')[0]}</div>}
                  <span className="flex-1 text-sm text-white truncate">{p.displayName}</span>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${on ? 'bg-small-orange border-small-orange' : 'border-white/25'}`}>{on && <Check size={12} className="text-black" strokeWidth={3} />}</span>
                </button>
              );
            })}
        </div>
        <div className="p-4 border-t border-white/5">
          <button onClick={() => onClose([...picked])} className="w-full py-3 rounded-2xl bg-small-orange text-white font-black text-xs uppercase tracking-widest">Done · {picked.size}</button>
        </div>
      </div>
    </motion.div>
  );
};

export default AudiencePicker;
