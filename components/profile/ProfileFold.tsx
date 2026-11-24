import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A collapsed-by-default row for the profile Overview ("Radio presets · 5"). Native <details>, so it is
 * keyboard and screen-reader friendly with no extra state. The wrapped section renders unchanged once opened.
 */
const ProfileFold: React.FC<{
  title: string;
  hint?: string;
  count?: number | string;
  accent?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, hint, count, accent = 'linear-gradient(135deg,#6B0099,#D40055)', defaultOpen = false, children }) => (
  <details
    open={defaultOpen}
    className="group rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.025] overflow-hidden"
  >
    <summary className="flex h-[60px] cursor-pointer list-none items-center gap-3.5 px-5 [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00DAF3]">
      <span className="h-[34px] w-[34px] shrink-0 rounded-[11px]" style={{ background: accent }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-white">{title}</span>
        {hint && <span className="mt-1 block truncate text-[12px] text-white/60">{hint}</span>}
      </span>
      {count !== undefined && (
        <span className="inline-flex h-7 items-center rounded-full border border-white/15 bg-white/[0.06] px-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/80">
          {count}
        </span>
      )}
      <ChevronDown size={16} className="text-white/70 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="px-5 pb-6">{children}</div>
  </details>
);

export default ProfileFold;
