// NewMemberWelcomeBadge — small "New here" chip shown next to people who joined < 14 days ago,
// so the community can spot newcomers and welcome them. Renders nothing for established members.
// Usage: <NewMemberWelcomeBadge profile={userProfile} />  (anywhere a name/avatar is shown)

import React from 'react';
import { Sparkles } from 'lucide-react';
import { ageDays, FRESH_DAYS, joinedLabel, type DiscoveryProfile } from '../../services/discoveryScoring';

export interface NewMemberWelcomeBadgeProps {
  /** Needs joinedAt or createdAt. */
  profile: Pick<DiscoveryProfile, 'uid' | 'displayName' | 'photoURL' | 'joinedAt' | 'createdAt'>;
  className?: string;
  /** Override "now" (tests / storybook). */
  now?: number;
}

const NewMemberWelcomeBadge: React.FC<NewMemberWelcomeBadgeProps> = ({ profile, className = '', now = Date.now() }) => {
  const age = ageDays(profile as DiscoveryProfile, now);
  if (age === null || age >= FRESH_DAYS) return null;
  return (
    <span
      title={`${joinedLabel(profile as DiscoveryProfile, now)} — say hi!`}
      className={`inline-flex items-center gap-1 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/40 text-[#FFB347] px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${className}`}
    >
      <Sparkles size={9} /> New here
    </span>
  );
};

export default NewMemberWelcomeBadge;
export { NewMemberWelcomeBadge };
