/**
 * TelaForm — the input device (P1). Points at a Base in the same doc
 * (baseDeviceId) and renders that Base's fields as inputs; Submit appends a row
 * to the Base (ops-shaped, through the parent). Styled as a clean "form preview"
 * card consistent with the DS. When no Base is chosen it shows a picker of the
 * Bases in the document.
 */
import React, { useState } from 'react';
import { ClipboardList, Check, ChevronDown } from 'lucide-react';
import type { TelaBaseDevice, TelaField } from '../../types';

interface BaseOption { id: string; name: string; }

interface TelaFormProps {
  device: { id: string; type: 'FORM'; baseDeviceId?: string; title?: string };
  base: TelaBaseDevice | null;
  bases: BaseOption[];
  readOnly?: boolean;
  onSetBase: (baseDeviceId: string) => void;
  onSubmit: (values: Record<string, string>) => void;
}

const INK = '#1B1523';
const HAIR = '#E3DEEA';

const TelaForm: React.FC<TelaFormProps> = ({ device, base, bases, readOnly, onSetBase, onSubmit }) => {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState(false);

  const set = (fieldId: string, value: string) => setDraft(d => ({ ...d, [fieldId]: value }));

  const submit = () => {
    if (!base) return;
    const values: Record<string, string> = {};
    for (const f of base.fields) {
      const v = draft[f.id];
      if (v !== undefined && v !== '') values[f.id] = v;
    }
    onSubmit(values);
    setDraft({});
    setFlash(true);
    setTimeout(() => setFlash(false), 1400);
  };

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.02em', color: '#6E6480', marginBottom: 4 };
  const inputStyle: React.CSSProperties = { width: '100%', height: 36, padding: '0 11px', border: `1px solid ${HAIR}`, borderRadius: 9, background: '#fff', color: INK, font: 'inherit', fontSize: 13.5, outline: 'none' };

  const renderInput = (f: TelaField) => {
    const v = draft[f.id] ?? '';
    if (f.type === 'CHECKBOX') {
      const on = v === '1';
      return (
        <button
          type="button"
          onClick={() => set(f.id, on ? '' : '1')}
          style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${on ? 'var(--pj-purple,#6B0099)' : '#C9C2D6'}`, background: on ? 'var(--pj-purple,#6B0099)' : '#fff', cursor: 'pointer' }}
        >
          {on && <Check size={14} color="#fff" strokeWidth={3} />}
        </button>
      );
    }
    if (f.type === 'SELECT') {
      return (
        <select value={v} onChange={e => set(f.id, e.target.value)} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
          <option value="">Choose…</option>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <input
        type={f.type === 'DATE' ? 'date' : 'text'}
        inputMode={f.type === 'NUMBER' ? 'decimal' : undefined}
        value={v}
        onChange={e => set(f.id, e.target.value)}
        placeholder={f.type === 'NUMBER' ? '0' : ''}
        style={{ ...inputStyle, textAlign: f.type === 'NUMBER' ? 'right' : 'left', fontVariantNumeric: f.type === 'NUMBER' ? 'tabular-nums' : undefined }}
      />
    );
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'linear-gradient(180deg,#FBFAFD,#F3F0F8)', color: INK, fontFamily: 'var(--font-sans, system-ui, sans-serif)' }} className="custom-scrollbar">
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '26px 22px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, color: '#fff', background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }}>
            <ClipboardList size={16} />
          </span>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.01em' }}>{device.title || (base ? `${base.name || 'Base'} form` : 'Form')}</span>
        </div>

        {!base ? (
          <div style={{ marginTop: 16, padding: 16, border: `1px dashed ${HAIR}`, borderRadius: 12, background: '#fff' }}>
            <div style={{ fontSize: 12.5, color: '#6E6480', marginBottom: 10 }}>This form isn’t connected yet. Point it at a Base in this canvas.</div>
            {bases.length ? (
              <div style={{ position: 'relative' }}>
                <select
                  defaultValue=""
                  onChange={e => e.target.value && onSetBase(e.target.value)}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="" disabled>Choose a Base…</option>
                  {bases.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ChevronDown size={15} style={{ position: 'absolute', right: 10, top: 11, pointerEvents: 'none', color: '#A398B4' }} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#A398B4' }}>No Base in this canvas yet — add a Base device first.</div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: '#A398B4', marginBottom: 16 }}>Writes a new row into <b style={{ color: '#6E6480' }}>{base.name || 'the base'}</b>.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {base.fields.map(f => (
                <label key={f.id} style={{ display: 'block' }}>
                  <span style={labelStyle}>{f.name}</span>
                  {renderInput(f)}
                </label>
              ))}
              {!base.fields.length && <div style={{ fontSize: 12, color: '#A398B4' }}>The linked Base has no fields yet.</div>}
            </div>
            <button
              type="button"
              disabled={readOnly || !base.fields.length}
              onClick={submit}
              style={{ marginTop: 20, width: '100%', height: 42, borderRadius: 11, border: 'none', color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: '.01em', cursor: 'pointer', background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))', opacity: base.fields.length ? 1 : 0.5 }}
            >
              {flash ? 'Added ✓' : 'Submit'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default TelaForm;
