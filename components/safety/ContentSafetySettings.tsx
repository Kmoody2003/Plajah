/**
 * Content & Safety settings panel.
 *
 * Viewer controls: blur graphic content, blur 18+ content, Clean Speech
 * profanity filter, and the muted words/topics manager. Also surfaces the
 * community guidelines so every user knows what is never allowed.
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Shield, ShieldAlert, VolumeX, Sparkles, Plus, X, MessageSquareOff, BookOpenCheck } from 'lucide-react';
import {
  type SafetySettings, loadSafetySettings, saveSafetySettings,
  DEFAULT_SAFETY_SETTINGS, PROHIBITED_CONTENT, GUIDELINES_SUMMARY,
} from '../../services/contentSafetyService';

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button
    role="switch" aria-checked={on}
    onClick={() => onChange(!on)}
    className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${on ? 'bg-[#FF8C00]' : 'bg-white/10'}`}>
    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-1' : 'left-1'}`} />
  </button>
);

const SettingRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  on: boolean;
  onChange: (v: boolean) => void;
}> = ({ icon, title, description, on, onChange }) => (
  <div className="flex items-start gap-4 p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem]">
    <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/25 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-black uppercase tracking-widest">{title}</p>
      <p className="text-[10px] text-white/40 leading-relaxed mt-1">{description}</p>
    </div>
    <Toggle on={on} onChange={onChange} />
  </div>
);

const WordChips: React.FC<{
  label: string;
  placeholder: string;
  words: string[];
  onChange: (words: string[]) => void;
}> = ({ label, placeholder, words, onChange }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const w = draft.trim().toLowerCase();
    if (w && !words.includes(w)) onChange([...words, w]);
    setDraft('');
  };
  return (
    <div className="space-y-2.5">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</p>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-[#FF8C00]/50"
        />
        <button onClick={add}
          className="px-4 rounded-2xl bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[#FF8C00] hover:bg-[#FF8C00]/25 transition-colors">
          <Plus size={14} />
        </button>
      </div>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {words.map(w => (
            <span key={w} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60">
              {w}
              <button onClick={() => onChange(words.filter(x => x !== w))} className="text-white/30 hover:text-white">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      {words.length === 0 && (
        <p className="text-[9px] text-white/20">Nothing muted. Posts matching muted {label.toLowerCase()} stay in your feed but appear blurred until you choose to view them.</p>
      )}
    </div>
  );
};

export const ContentSafetySettings: React.FC = () => {
  const [settings, setSettings] = useState<SafetySettings>(DEFAULT_SAFETY_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSafetySettings().then(s => { setSettings(s); setLoaded(true); });
  }, []);

  const update = async (patch: Partial<SafetySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSafetySettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={18} className="text-[#FF8C00]" />
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest">Content & Safety</h3>
            <p className="text-[9px] text-white/35 uppercase tracking-widest mt-0.5">You control what you see</p>
          </div>
        </div>
        {saved && <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Saved ✓</span>}
      </div>

      {/* Sensitive content gates */}
      <div className="space-y-3">
        <SettingRow
          icon={<ShieldAlert size={15} className="text-[#FF8C00]" />}
          title="Blur graphic content"
          description="Posts labeled Graphic / Violence are blurred and ask before showing. Real-world gore is never allowed on Plajah — this covers artistic and fictional work."
          on={settings.blurGraphic}
          onChange={v => update({ blurGraphic: v })}
        />
        <SettingRow
          icon={<ShieldAlert size={15} className="text-[#FF8C00]" />}
          title="Blur 18+ content"
          description="Posts labeled Mature (18+) or Artistic Nudity are blurred and ask before showing. Pornography is never allowed."
          on={settings.blurAdult}
          onChange={v => update({ blurAdult: v })}
        />
        <SettingRow
          icon={<MessageSquareOff size={15} className="text-[#FF8C00]" />}
          title="Clean Speech filter"
          description="Automatically blurs profanity in posts, comments, and chat. Tap any filtered word to reveal it."
          on={settings.cleanSpeech}
          onChange={v => update({ cleanSpeech: v })}
        />
      </div>

      {/* Muted words & topics */}
      <div className="p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem] space-y-5">
        <div className="flex items-center gap-3">
          <VolumeX size={15} className="text-[#FF8C00]" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest">Muted words & topics</p>
            <p className="text-[10px] text-white/40 leading-relaxed mt-1">
              Posts that mention these stay in your feed, but the content is blurred with a note — you’ll see who posted, a brief description, and can unmute any single post.
            </p>
          </div>
        </div>
        <WordChips
          label="Words"
          placeholder="Add a word to mute…"
          words={settings.mutedWords}
          onChange={w => update({ mutedWords: w })}
        />
        <WordChips
          label="Topics"
          placeholder="Add a topic or phrase (e.g. election results)…"
          words={settings.mutedTopics}
          onChange={w => update({ mutedTopics: w })}
        />
      </div>

      {/* Community guidelines */}
      <div className="p-5 bg-[#FF8C00]/[0.05] border border-[#FF8C00]/20 rounded-[1.5rem] space-y-3">
        <div className="flex items-center gap-3">
          <BookOpenCheck size={15} className="text-[#FF8C00]" />
          <p className="text-xs font-black uppercase tracking-widest">Community Guidelines</p>
        </div>
        <p className="text-[10px] text-white/55 leading-relaxed">{GUIDELINES_SUMMARY}</p>
        <div className="space-y-2">
          {PROHIBITED_CONTENT.map(p => (
            <div key={p.id} className="flex items-start gap-2.5">
              <span className="text-red-400 text-[10px] font-black mt-0.5 shrink-0">✕</span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/70">{p.title}</p>
                <p className="text-[9px] text-white/40 leading-relaxed">{p.rule}</p>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-2.5 pt-1">
            <Sparkles size={11} className="text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-[9px] text-white/40 leading-relaxed">
              <span className="font-black uppercase tracking-widest text-white/70">Artistic expression is welcome.</span>{' '}
              Mark mature or graphic work with a content label when you post — viewers with filters on see a blur first and choose for themselves.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ContentSafetySettings;
