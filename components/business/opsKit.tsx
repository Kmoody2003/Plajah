// components/business/opsKit.tsx
// Plajah Business · Ops — tokens and primitives for small-business owner/staff surfaces and org growth
// tools. Dark chrome, Plajah purple→magenta→orange for the mark, orange for acting, the business's pack
// colour as a quiet accent, paper sheets for money and print. Sibling of components/elevate/vellum.tsx.

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import '../../styles/biz-ops.css';

export const BO = {
  chrome: '#0D0B10',
  panel: '#17141C',
  raised: '#211C28',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  ink: '#F4F0F7',
  ink2: '#D9D3E0',
  muted: '#A39BAE',
  purple: '#6B0099',
  magenta: '#D40055',
  orange: '#FF8C00',
  success: '#06D6A0',
  warn: '#F59E0B',
  danger: '#EF4444',
  paper: '#F6F2EC',
  paperInk: '#1D1922',
  paperMuted: '#6A6170',
  grad: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)',
} as const;

export const BO_FONT = {
  display: "'Bricolage Grotesque', Inter, system-ui, sans-serif",
  ui: 'Inter, system-ui, sans-serif',
} as const;

export const money = (dollars: number, opts: { cents?: boolean } = {}) =>
  `$${(dollars || 0).toLocaleString(undefined, { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 })}`;
export const moneyCents = (cents: number) => money((cents || 0) / 100);

/** Root of every business ops surface: tokens, voice, label floor, and the page accent. */
export const BoScope: React.FC<React.HTMLAttributes<HTMLDivElement> & { accent?: string }> = ({ className = '', accent, style, ...rest }) => (
  <div className={`bo-scope ${className}`} style={{ ...(accent ? { ['--bo-accent' as any]: accent } : {}), ...style }} {...rest} />
);

export const BoLabel: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className = '', style }) => (
  <div className={`bo-label ${className}`} style={style}>{children}</div>
);

/** Sticky top bar: back, the Owner / Staff / Public switch, and page actions. */
export const BoModeBar: React.FC<{
  modes: { k: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  onBack?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}> = ({ modes, value, onChange, onBack, leading, trailing }) => (
  <div className="sticky top-0 z-40 border-b" style={{ background: 'rgba(13,11,16,0.92)', borderColor: BO.line, backdropFilter: 'blur(16px)' }}>
    <div className="max-w-[1320px] mx-auto px-4 sm:px-8 flex flex-wrap items-center gap-x-6 gap-y-1">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 py-3 text-sm text-[#A39BAE] hover:text-white transition-colors">
          <ChevronLeft size={16} /> Back
        </button>
      )}
      {leading}
      <nav aria-label="View" className="flex flex-wrap gap-x-6 flex-1 min-w-0">
        {modes.map(m => (
          <button key={m.k} onClick={() => onChange(m.k)} className="bo-tab" aria-current={value === m.k ? 'page' : undefined}>{m.label}</button>
        ))}
      </nav>
      {trailing && <div className="flex items-center gap-2 py-2">{trailing}</div>}
    </div>
  </div>
);

/** Page head for an ops section: display title, one-line subtitle, actions on the right. */
export const BoSectionHead: React.FC<{ title: string; sub?: React.ReactNode; action?: React.ReactNode; size?: 'lg' | 'md' }> = ({ title, sub, action, size = 'lg' }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
    <div className="min-w-0">
      <h2 className="m-0 bo-display text-white" style={{ fontSize: size === 'lg' ? 'clamp(1.9rem, 3.4vw, 2.6rem)' : 'clamp(1.4rem, 2.6vw, 1.8rem)', lineHeight: 1.02 }}>{title}</h2>
      {sub && <p className="m-0 mt-2 text-[15px] text-[#A39BAE] max-w-2xl">{sub}</p>}
    </div>
    {action && <div className="flex flex-wrap gap-2">{action}</div>}
  </div>
);

/** KPI strip: big tabular numerals between hairlines, no boxes. */
export const BoKpiStrip: React.FC<{ items: { label: string; value: string; note?: string; tone?: 'up' | 'warn' | 'flat'; onClick?: () => void }[] }> = ({ items }) => (
  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: `1px solid ${BO.line}`, borderBottom: `1px solid ${BO.line}` }}>
    {items.map(k => {
      const Tag = (k.onClick ? 'button' : 'div') as any;
      return (
        <Tag key={k.label} onClick={k.onClick} className={`py-5 pr-4 flex flex-col gap-1 text-left ${k.onClick ? 'bo-row-link' : ''}`}>
          <div className="text-[13px] text-[#A39BAE]">{k.label}</div>
          <div className="bo-num text-white leading-[1.1]" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}>{k.value}</div>
          {k.note && <div className="text-[13px]" style={{ color: k.tone === 'up' ? BO.success : k.tone === 'warn' ? BO.warn : BO.muted }}>{k.note}</div>}
        </Tag>
      );
    })}
  </div>
);

/** Numbered list of jobs to do: the staff "today" board and the owner's next steps. */
export const BoTaskList: React.FC<{ items: { id: string; title: string; meta?: string; tone?: 'due' | 'ok' | 'idle'; action?: string; onClick?: () => void }[]; empty?: string }> = ({ items, empty }) => (
  items.length === 0 ? <p className="text-sm text-[#A39BAE] py-4">{empty || 'Nothing waiting.'}</p> : (
    <div className="bo-rule">
      {items.map((t, i) => (
        <button key={t.id} onClick={t.onClick} className="bo-row-link w-full text-left grid items-baseline gap-3 py-3.5 px-1" style={{ gridTemplateColumns: '32px minmax(0,1fr) auto' }}>
          <span className="bo-num text-[14px] text-[#A39BAE]">{String(i + 1).padStart(2, '0')}</span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-white truncate">{t.title}</span>
            {t.meta && <span className="block text-[13px] text-[#A39BAE] pt-0.5 truncate">{t.meta}</span>}
          </span>
          {t.action && <span className="text-[13px] font-semibold" style={{ color: t.tone === 'due' ? BO.orange : t.tone === 'ok' ? BO.success : BO.muted }}>{t.action}</span>}
        </button>
      ))}
    </div>
  )
);

/** Segmented control for sub-views inside a section. */
export const BoSegmented: React.FC<{ options: { k: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void }> = ({ options, value, onChange }) => (
  <div role="tablist" className="inline-flex flex-wrap gap-1 p-1 rounded-[14px]" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BO.line}` }}>
    {options.map(o => (
      <button key={o.k} role="tab" aria-selected={value === o.k} onClick={() => onChange(o.k)}
        className="min-h-[36px] px-3.5 rounded-[10px] text-[13px] font-medium transition-colors"
        style={value === o.k ? { background: BO.ink, color: BO.chrome } : { color: BO.ink2 }}>
        {o.label}{o.count != null && <span className="bo-num ml-1.5 opacity-60">{o.count}</span>}
      </button>
    ))}
  </div>
);

/** Small empty-state block with one action. */
export const BoEmpty: React.FC<{ title: string; body?: string; action?: React.ReactNode }> = ({ title, body, action }) => (
  <div className="bo-panel p-8 text-center flex flex-col items-center gap-3">
    <div className="bo-title text-xl text-white">{title}</div>
    {body && <p className="m-0 text-sm text-[#A39BAE] max-w-md">{body}</p>}
    {action}
  </div>
);
