import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { updateUserProfile, generateInterestProfile, auth } from '../services/backendService';
import { Notebook, Sparkles, Plus, X, Lock, Globe, Save, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InterestsNotebookProps {
  profile: UserProfile;
  isOwner: boolean;
  onUpdate: (profile: UserProfile) => void;
}

const InterestsNotebook: React.FC<InterestsNotebookProps> = ({ profile, isOwner, onUpdate }) => {
  const [notebook, setNotebook] = useState(profile.interestsNotebook || '');
  const [publicInterests, setPublicInterests] = useState<string[]>(profile.publicInterests || []);
  const [privateInterests, setPrivateInterests] = useState<string[]>(profile.privateInterests || []);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [publicInput, setPublicInput] = useState('');
  const [privateInput, setPrivateInput] = useState('');

  const handleSave = async () => {
    if (!isOwner) return;
    setIsSaving(true);
    try {
      const updates = {
        interestsNotebook: notebook,
        publicInterests,
        privateInterests
      };
      await updateUserProfile(profile.uid, updates);
      onUpdate({ ...profile, ...updates });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!isOwner) return;
    setIsGenerating(true);
    try {
      const newProfile = await generateInterestProfile(profile.uid);
      if (newProfile) {
        onUpdate({ ...profile, interestAlgorithmProfile: newProfile });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const addInterest = (type: 'public' | 'private') => {
    const input = type === 'public' ? publicInput : privateInput;
    const set = type === 'public' ? setPublicInterests : setPrivateInterests;
    const current = type === 'public' ? publicInterests : privateInterests;

    if (input.trim() && !current.includes(input.trim())) {
      set([...current, input.trim()]);
      if (type === 'public') setPublicInput('');
      else setPrivateInput('');
    }
  };

  const removeInterest = (type: 'public' | 'private', tag: string) => {
    const set = type === 'public' ? setPublicInterests : setPrivateInterests;
    const current = type === 'public' ? publicInterests : privateInterests;
    set(current.filter(t => t !== tag));
  };

  return (
    <div className="space-y-12 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-black tracking-tightest uppercase mb-2 flex items-center gap-3">
            <Notebook className="text-small-orange" size={32} /> Interests Notebook
          </h2>
          <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Define your identity and discover relevant content</p>
        </div>
        {isOwner && (
          <div className="flex items-center gap-4">
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} />
              {isGenerating ? 'Analyzing...' : 'Refresh Profile'}
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all active:scale-95 disabled:opacity-50 shadow-xl"
            >
              <Save size={14} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left Column: Notebook & Algorithm */}
        <div className="space-y-12">
          {isOwner && (
            <section className="p-8 bg-white/[0.03] border border-white/10 rounded-[2.5rem] shadow-inner">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="text-white/20" size={16} />
                <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Private Notebook</h3>
              </div>
              <textarea 
                value={notebook}
                onChange={(e) => setNotebook(e.target.value)}
                disabled={!isOwner}
                placeholder="Jot down your interests, hobbies, and things you love. Our algorithm uses this to personalize your experience..."
                className="w-full h-64 bg-transparent border-none focus:outline-none text-sm font-medium leading-relaxed text-white/80 resize-none placeholder:text-white/10"
              />
            </section>
          )}

          <section className="p-8 bg-gradient-to-br from-small-orange/20 to-transparent border border-small-orange/20 rounded-[2.5rem]">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="text-small-orange" size={20} />
              <h3 className="text-xs font-black uppercase tracking-widest text-small-orange">Interest Profile (AI Generated)</h3>
            </div>
            <p className="text-sm font-bold text-white leading-relaxed italic">
              "{profile.interestAlgorithmProfile || "Algorithm is still learning about you. Add more tags to your notebook to generate a profile."}"
            </p>
          </section>
        </div>

        {/* Right Column: Tags */}
        <div className="space-y-12">
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="text-blue-400" size={18} />
                <h3 className="text-xs font-black uppercase tracking-widest">Public Interests</h3>
              </div>
              <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Visible to everyone</span>
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={publicInput}
                  onChange={(e) => setPublicInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addInterest('public')}
                  placeholder="Add public tag..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-3 text-xs font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                />
                <button onClick={() => addInterest('public')} className="p-3 bg-white text-black rounded-2xl"><Plus size={18} /></button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {publicInterests.map(tag => (
                <span key={tag} className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-2">
                  {tag}
                  {isOwner && <button onClick={() => removeInterest('public', tag)} className="hover:text-white"><X size={12} /></button>}
                </span>
              ))}
              {publicInterests.length === 0 && <p className="text-[10px] font-bold text-white/10 uppercase tracking-widest">No public interests defined</p>}
            </div>
          </section>

          {isOwner && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="text-red-400" size={18} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Private Interests</h3>
                </div>
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Only visible to you</span>
              </div>
              {isOwner && (
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={privateInput}
                    onChange={(e) => setPrivateInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addInterest('private')}
                    placeholder="Add private tag..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-3 text-xs font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                  />
                  <button onClick={() => addInterest('private')} className="p-3 bg-white text-black rounded-2xl"><Plus size={18} /></button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {privateInterests.map(tag => (
                  <span key={tag} className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-full text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
                    {tag}
                    {isOwner && <button onClick={() => removeInterest('private', tag)} className="hover:text-white"><X size={12} /></button>}
                  </span>
                ))}
                {privateInterests.length === 0 && <p className="text-[10px] font-bold text-white/10 uppercase tracking-widest">No private interests defined</p>}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterestsNotebook;
