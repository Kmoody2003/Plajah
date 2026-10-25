// GrantProfile — the one place an organization answers the questions every application asks.
// Values arrive pre-filled from the org page and the address; each shows where it came from, and
// nothing counts as final until a person confirms it.

import React, { useState } from 'react';
import { Check, Pencil, Info } from 'lucide-react';
import { FIELDS, displayValue, type FieldDef, type FieldGroup, type Profile } from '../../services/grants/profile';
import { EV, EvLabel } from './vellum';

const GROUPS: { key: FieldGroup; title: string; note?: string }[] = [
  { key: 'identity', title: 'Who you are' },
  { key: 'registration', title: 'Registrations & tax status', note: 'The slow ones. Start SAM.gov first.' },
  { key: 'address', title: 'Where you are' },
  { key: 'people', title: 'Who signs and who answers questions', note: 'Private to your organization\'s leaders. We never fill signatures or certifications.' },
  { key: 'capacity', title: 'Size and capacity' },
];

const SOURCE: Record<string, { label: string; tone: string }> = {
  platform: { label: 'From your page', tone: EV.violetText },
  derived: { label: 'From your address', tone: EV.violetText },
  suggested: { label: 'Suggested', tone: EV.warn },
  you: { label: 'Confirmed by you', tone: EV.success },
};

const input = { background: EV.chrome, color: EV.ink, border: `1px solid ${EV.line}` } as const;

const Row: React.FC<{ f: FieldDef; profile: Profile; onSave: (key: string, value: string) => Promise<void> }> = ({ f, profile, onSave }) => {
  const v = profile[f.key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (value: string) => {
    setBusy(true); setErr(null);
    try { await onSave(f.key, value); setEditing(false); } catch (e: any) { setErr(e?.message || 'Could not save'); } finally { setBusy(false); }
  };
  const start = () => { setDraft(v?.value ?? ''); setErr(null); setEditing(true); };

  return (
    <div className="py-3 border-b last:border-0" style={{ borderColor: EV.line }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold" style={{ color: EV.ink2 }}>{f.label}</p>
          {!editing && (
            <p className="text-sm mt-0.5 break-words" style={{ color: v ? EV.ink : EV.muted }}>
              {v ? displayValue(f.key, v.value) : 'Not answered yet'}
            </p>
          )}
          {v && !editing && <p className="text-[10px] mt-0.5" style={{ color: SOURCE[v.source].tone }}>{v.confirmed ? SOURCE.you.label : SOURCE[v.source].label}{!v.confirmed ? ' — confirm to use it' : ''}</p>}
        </div>
        {!editing && (
          <div className="flex gap-2 shrink-0">
            {v && !v.confirmed && (
              <button disabled={busy} onClick={() => save(v.value)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1" style={{ background: EV.violetWash, color: EV.violetText }}>
                <Check size={12} /> Confirm
              </button>
            )}
            <button onClick={start} className="px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1" style={{ background: EV.raised, color: EV.ink2 }}>
              <Pencil size={12} /> {v ? 'Edit' : 'Answer'}
            </button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-2 space-y-2">
          {f.kind === 'choice' && f.choices ? (
            <select value={draft} onChange={e => setDraft(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={input}>
              <option value="">Choose…</option>
              {f.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          ) : f.kind === 'longtext' ? (
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} className="w-full rounded-xl px-3 py-2 text-sm" style={input} />
          ) : (
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) save(draft); }}
                   className="w-full rounded-xl px-3 py-2 text-sm" style={input} autoFocus />
          )}
          {f.hint && <p className="text-[11px] leading-snug flex gap-1.5" style={{ color: EV.muted }}><Info size={11} className="mt-0.5 shrink-0" />{f.hint}</p>}
          {err && <p role="alert" className="text-[11px]" style={{ color: EV.warn }}>{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy || !draft.trim()} onClick={() => save(draft)} className="px-4 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-40" style={{ background: EV.brand, color: '#fff' }}>Save</button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-[12px]" style={{ color: EV.muted }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export const GrantProfile: React.FC<{ profile: Profile; onSave: (key: string, value: string) => Promise<void> }> = ({ profile, onSave }) => {
  const answered = FIELDS.filter(f => profile[f.key]).length;
  const confirmed = FIELDS.filter(f => profile[f.key]?.confirmed).length;
  return (
    <div className="space-y-5">
      <div className="ev-panel p-5">
        <p className="text-sm font-bold" style={{ color: EV.ink }}>Answer once, reuse everywhere.</p>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: EV.muted }}>
          Every application asks for these. We filled in what we could from your page and address — confirm each and add the rest.
          {' '}{answered} of {FIELDS.length} answered · {confirmed} confirmed.
        </p>
      </div>
      {GROUPS.map(g => (
        <div key={g.key} className="ev-panel p-5">
          <EvLabel>{g.title}</EvLabel>
          {g.note && <p className="text-[11px] mt-1" style={{ color: EV.muted }}>{g.note}</p>}
          <div className="mt-2">{FIELDS.filter(f => f.group === g.key).map(f => <Row key={f.key} f={f} profile={profile} onSave={onSave} />)}</div>
        </div>
      ))}
    </div>
  );
};

export default GrantProfile;
