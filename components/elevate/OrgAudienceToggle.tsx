// OrgAudienceToggle — "Public | Members" picker shown ONLY while posting as an org role.
// Public = public timeline, open comments. Members = readable by everyone, members + followers may comment.
import React from 'react';
import { Globe, Users } from 'lucide-react';

export type OrgPostAudience = 'PUBLIC' | 'MEMBERS';

const OrgAudienceToggle: React.FC<{ value: OrgPostAudience; onChange: (v: OrgPostAudience) => void; className?: string }> = ({ value, onChange, className = '' }) => (
  <div className={`flex items-center gap-1.5 ${className}`} title="Public: open to everyone. Members: everyone can read, only members & followers can comment.">
    <span className="text-[9px] font-black uppercase tracking-widest text-white/40 mr-1">Audience</span>
    {(['PUBLIC', 'MEMBERS'] as const).map(a => (
      <button key={a} type="button" onClick={() => onChange(a)}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${value === a ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
        {a === 'PUBLIC' ? <Globe size={10} /> : <Users size={10} />}{a === 'PUBLIC' ? 'Public' : 'Members'}
      </button>
    ))}
  </div>
);

export default OrgAudienceToggle;
