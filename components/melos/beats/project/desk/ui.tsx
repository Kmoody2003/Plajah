// Shared atoms for the Mastering Desk bays — the slab vocabulary the Pressing room already
// speaks (matte panels, small-caps labels, the editorial serif for things you read).

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { auth } from '../../../../../services/firebase';
import { uploadFile } from '../../../../../services/backendService';
import type { MasterProjectDoc } from '../../../../../services/melos/beats/masterProject';

export const SERIF = 'Georgia, "Times New Roman", serif';

export const inputCls = 'w-full h-8 px-2.5 rounded-[8px] bg-black/35 border border-white/10 text-[11.5px] text-white placeholder-white/25 outline-none focus:border-[#FF8C00]/60';
export const selectCls = 'w-full h-8 px-2 rounded-[8px] bg-black/40 border border-white/10 text-[11.5px] text-white outline-none';
export const btnCls = 'h-8 px-3 rounded-lg text-[11px] font-semibold border border-white/15 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 flex items-center gap-1.5';

export interface BayProps {
  project: MasterProjectDoc;
  mutate: (fn: (p: MasterProjectDoc) => void) => void;
  productionId?: string;
}

export const Panel: React.FC<{ title: string; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, hint, right, children, className = '' }) => (
  <section className={`rounded-[12px] border border-white/[0.1] bg-white/[0.03] p-3 ${className}`}>
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/40">{title}</span>
      {right}
    </div>
    {children}
    {hint && <p className="mt-2 text-[9.5px] leading-snug text-white/30">{hint}</p>}
  </section>
);

export const Field: React.FC<{ label: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className="text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-white/35">{label}</span>
    {children}
  </label>
);

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    className="flex items-start gap-2 text-left py-1"
    aria-pressed={on}
  >
    <span className="mt-0.5 w-7 h-4 rounded-full relative flex-none transition-colors" style={{ background: on ? '#06D6A0' : 'rgba(255,255,255,0.15)' }}>
      <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: on ? 14 : 2 }} />
    </span>
    <span className="min-w-0">
      <span className="block text-[11px] text-white/80">{label}</span>
      {hint && <span className="block text-[9.5px] text-white/35 leading-snug">{hint}</span>}
    </span>
  </button>
);

/** Comma/enter-separated tag input. */
export const TagInput: React.FC<{ value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }> = ({ value, onChange, placeholder, suggestions }) => {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange(Array.from(new Set([...value, ...parts])).slice(0, 12));
    setDraft('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1 items-center min-h-8 px-1.5 py-1 rounded-[8px] bg-black/35 border border-white/10">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 h-5 pl-2 pr-1 rounded-full bg-white/10 text-[10px] text-white/80">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-white/40 hover:text-white"><X size={9} /></button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)); }}
          onBlur={() => add(draft)}
          placeholder={value.length ? '' : placeholder}
          className="flex-1 min-w-[80px] bg-transparent text-[11px] text-white placeholder-white/25 outline-none"
        />
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {suggestions.filter((s) => !value.includes(s)).slice(0, 10).map((s) => (
            <button key={s} type="button" onClick={() => onChange([...value, s].slice(0, 12))} className="h-5 px-2 rounded-full border border-white/10 text-[9.5px] text-white/45 hover:text-white hover:border-white/30">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Put a desk asset somewhere durable: the signed-in user's storage under this production,
 * else a data URL (images only — small and self-contained) or a session-only object URL.
 */
export async function deskUpload(file: Blob, name: string, productionId?: string, onProgress?: (p: number) => void): Promise<{ url: string; durable: boolean }> {
  const uid = auth.currentUser?.uid;
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  if (uid) {
    try {
      const url = await uploadFile(`personal/${uid}/melos/${productionId || 'scratch'}/desk/${Date.now().toString(36)}_${safe}`, file, onProgress);
      if (url) return { url, durable: true };
    } catch { /* fall through */ }
  }
  if (file.type.startsWith('image/') && file.size < 1.5e6) {
    const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
    return { url, durable: true };
  }
  return { url: URL.createObjectURL(file), durable: false };
}
