import React from 'react';
import { ExternalLink, Globe, Music2, Share2 } from 'lucide-react';
import type { UserProfile } from '../types';
import { invalidProfileLinks, normalizePublicProfileUrl, PROFILE_LINK_FIELDS } from '../services/socialLinks';

interface Props {
  value?: UserProfile['socialLinks'];
  onChange: (links: UserProfile['socialLinks']) => void;
}

const inputClass = 'w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all';

export default function ProfileLinksSettings({ value = {}, onChange }: Props) {
  const invalid = new Set(invalidProfileLinks(value));
  const renderGroup = (group: 'home' | 'social' | 'music', title: string, description: string, Icon: React.ComponentType<{ size?: number }>) => {
    const fields = PROFILE_LINK_FIELDS.filter(field => field.group === group);
    return <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0"><Icon size={17} /></span>
        <div><h4 className="text-sm font-black text-white">{title}</h4><p className="text-[11px] text-white/45 mt-0.5">{description}</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(field => {
          const raw = value?.[field.platform] || '';
          const bad = invalid.has(field.label);
          return <label key={field.platform} className={group === 'home' ? 'md:col-span-2' : ''}>
            <span className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-2">{field.label}</span>
            <div className="relative">
              <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={raw}
                onChange={event => onChange({ ...value, [field.platform]: event.target.value })}
                onBlur={event => { const normalized = normalizePublicProfileUrl(event.target.value); if (normalized) onChange({ ...value, [field.platform]: normalized }); }}
                placeholder={field.placeholder} aria-invalid={bad} aria-describedby={bad ? `profile-link-${field.platform}-error` : undefined}
                className={`${inputClass} pr-11 ${bad ? 'border-red-500/70 ring-1 ring-red-500/30' : ''}`} />
              {raw && !bad && <a href={normalizePublicProfileUrl(raw)} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${field.label} link`} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"><ExternalLink size={15} /></a>}
            </div>
            {bad && <span id={`profile-link-${field.platform}-error`} className="block text-[11px] text-red-400 mt-1 ml-2">Enter a public web address.</span>}
          </label>;
        })}
      </div>
    </section>;
  };
  return <div className="p-5 sm:p-8 bg-white/[0.035] rounded-[2.5rem] border border-white/10 space-y-8">
    <div><h3 className="text-xs font-black uppercase tracking-widest text-small-orange flex items-center gap-2"><Share2 size={14} /> Find me online</h3><p className="text-[11px] text-white/45 mt-2 max-w-2xl">Add public destinations where people can follow you, hear your work, watch your channel, or shop your catalog. These appear on your public profile.</p></div>
    {renderGroup('home', 'Your home on the web', 'A personal site, portfolio, or official homepage.', Globe)}
    <div className="border-t border-white/8" />
    {renderGroup('social', 'Social and video', 'Your public profiles and community destinations.', Share2)}
    <div className="border-t border-white/8" />
    {renderGroup('music', 'Listen and buy', 'Send listeners to your artist pages and music stores.', Music2)}
  </div>;
}
