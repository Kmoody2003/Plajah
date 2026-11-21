// The one Public / Unlisted / Private chooser for every upload, edit and publish screen.
// Model + legacy-flag mapping live in services/visibility.ts.
import React from 'react';
import { Globe, Link2, Lock } from 'lucide-react';
import { VISIBILITY_COPY, type Visibility } from '../../services/visibility';

const ICON: Record<Visibility, React.FC<{ size?: number; className?: string }>> = { PUBLIC: Globe, UNLISTED: Link2, PRIVATE: Lock };
const ORDER: Visibility[] = ['PUBLIC', 'UNLISTED', 'PRIVATE'];

export const VisibilityPicker: React.FC<{
  value: Visibility;
  onChange: (v: Visibility) => void;
  /** Radio group name; must be unique on the page. */
  name: string;
  /** Accent for the selected card (hex). */
  accent?: string;
  /** Override the hint line per option (e.g. "watch" vs "read"). */
  hints?: Partial<Record<Visibility, string>>;
  compact?: boolean;
}> = ({ value, onChange, name, accent = '#00B4D8', hints, compact }) => (
  <div role="radiogroup" className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
    {ORDER.map(v => {
      const Icon = ICON[v]; const on = value === v;
      return (
        <label key={v}
          className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${on ? '' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
          style={on ? { borderColor: `${accent}99`, background: `${accent}1a` } : undefined}>
          <input type="radio" name={name} className="sr-only" checked={on} onChange={() => onChange(v)} />
          <Icon size={16} className="mt-0.5 shrink-0 text-white/80" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">{VISIBILITY_COPY[v].label}</span>
            {!compact && <span className="block text-xs text-white/50">{hints?.[v] ?? VISIBILITY_COPY[v].hint}</span>}
          </span>
        </label>
      );
    })}
  </div>
);

/** Small inline chip for share sheets and owner views: "Unlisted · only people with the link". */
export const VisibilityChip: React.FC<{ value: Visibility; className?: string }> = ({ value, className = '' }) => {
  if (value === 'PUBLIC') return null;
  const Icon = ICON[value];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${value === 'UNLISTED' ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border-white/15 bg-white/5 text-white/70'} ${className}`}>
      <Icon size={12} />
      {value === 'UNLISTED' ? 'Unlisted: only people with this link can open it' : 'Private: only you can open it'}
    </span>
  );
};

export default VisibilityPicker;
