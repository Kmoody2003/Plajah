// ContactDrawer — one contact's profile, pipeline position, consent, custom fields, next action, quick
// logging, template sends and the activity timeline. Full-screen sheet on phones, right-hand drawer above.
import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Phone, StickyNote, Users, Trash2, Save, Send, Mail, Bell, FileText, Image as ImageIcon, ArrowRightLeft,
  ShoppingBag, CalendarDays, CheckSquare, Info, Loader2,
} from 'lucide-react';
import type { CrmActivity, CrmContact } from '../../types';
import type { CrmField, OpsPreset } from '../../services/opsPresets/types';
import {
  daysInStage, formatCents, fullName, isStale, stageOf, suggestedTemplates,
} from '../../services/crm/crmCore';
import { deleteContact, logActivity, saveContact, subscribeActivities } from '../../services/crm/crmService';
import { Field, relDays } from './crmTheme';

export interface ContactDrawerProps {
  businessId: string;
  contact: Partial<CrmContact>;
  preset: OpsPreset;
  currentUser: { uid: string; displayName?: string };
  mode: 'owner' | 'staff';
  onClose: () => void;
  onSaved?: (c: CrmContact, prev: CrmContact | null) => void;
  onSend: (contact: CrmContact, templateId?: string) => void;
}

const SOURCES: NonNullable<CrmContact['source']>[] = ['walk_in', 'website', 'pos', 'event', 'referral', 'social', 'ad', 'mail', 'import', 'phone', 'other'];
const SOURCE_LABEL: Record<string, string> = { walk_in: 'Walk-in', website: 'Website', pos: 'Point of sale', event: 'Event', referral: 'Referral', social: 'Social', ad: 'Ad', mail: 'Mail', import: 'Import', phone: 'Phone', other: 'Other' };

const ACT_ICON: Record<CrmActivity['kind'], React.ReactNode> = {
  note: <StickyNote size={16} />, call: <Phone size={16} />, email: <Mail size={16} />, push: <Bell size={16} />,
  letter: <FileText size={16} />, postcard: <ImageIcon size={16} />, meeting: <Users size={16} />, stage: <ArrowRightLeft size={16} />,
  sale: <ShoppingBag size={16} />, event: <CalendarDays size={16} />, task: <CheckSquare size={16} />, system: <Info size={16} />,
};

const toLocalInput = (t?: number) => {
  if (!t) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const ContactDrawer: React.FC<ContactDrawerProps> = ({ businessId, contact, preset, currentUser, mode, onClose, onSaved, onSend }) => {
  const [draft, setDraft] = useState<Partial<CrmContact>>(contact);
  const [saved, setSaved] = useState<CrmContact | null>(contact.id ? (contact as CrmContact) : null);
  const [dirty, setDirty] = useState(!contact.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [acts, setActs] = useState<CrmActivity[]>([]);
  const [logKind, setLogKind] = useState<'call' | 'note' | 'meeting' | null>(null);
  const [logText, setLogText] = useState('');
  const [tagInput, setTagInput] = useState('');
  const actor = { uid: currentUser.uid, displayName: currentUser.displayName };
  const now = Date.now();

  // Keep in sync with live updates when the user hasn't started editing.
  useEffect(() => { if (!dirty && contact.id) { setDraft(contact); setSaved(contact as CrmContact); } }, [contact, dirty]);

  useEffect(() => {
    if (!saved?.id) return;
    return subscribeActivities(businessId, saved.id, setActs, () => {});
  }, [businessId, saved?.id]);

  const set = <K extends keyof CrmContact>(k: K, v: CrmContact[K] | undefined) => { setDraft(d => ({ ...d, [k]: v })); setDirty(true); };
  const setAddr = (k: keyof NonNullable<CrmContact['address']>, v: string) => { setDraft(d => ({ ...d, address: { ...(d.address || {}), [k]: v } })); setDirty(true); };
  const setCustom = (id: string, v: string) => { setDraft(d => ({ ...d, custom: { ...(d.custom || {}), [id]: v } })); setDirty(true); };

  const pipelines = preset.crm.pipelines;
  const pipeline = pipelines.find(p => p.id === draft.pipelineId);
  const stage = saved && pipeline ? stageOf({ ...saved, pipelineId: draft.pipelineId, stageId: draft.stageId } as CrmContact, pipeline) : pipeline?.stages.find(s => s.id === draft.stageId);
  const stale = saved && stage ? isStale(saved, stage, now) : false;
  const allTags = useMemo(() => [...new Set([...(preset.crm.tags || []), ...(draft.tags || [])])], [preset.crm.tags, draft.tags]);
  const suggestions = useMemo(() => (saved && saved.stageId ? suggestedTemplates({ ...saved, ...draft } as CrmContact, preset, { on: 'stage_enter', pipelineId: saved.pipelineId, stageId: saved.stageId }) : []), [saved, draft, preset]);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const name = (draft.name || '').trim() || [draft.firstName, draft.lastName].filter(Boolean).join(' ').trim();
      if (!name && !draft.email && !draft.phone) throw new Error('Add a name, email or phone.');
      const next = await saveContact({ ...draft, name, businessId, ...(draft.id ? {} : { source: draft.source || 'other' }) }, actor, saved);
      onSaved?.(next, saved);
      setSaved(next); setDraft(next); setDirty(false);
    } catch (e: any) { setErr(e?.message || 'Save failed.'); }
    setBusy(false);
  };

  const remove = async () => {
    if (!saved || mode !== 'owner') return;
    if (!window.confirm(`Delete ${fullName(saved)}? Their timeline stays for your records.`)) return;
    setBusy(true);
    try { await deleteContact(saved.id); onClose(); } catch (e: any) { setErr(e?.message || 'Delete failed.'); setBusy(false); }
  };

  const submitLog = async () => {
    if (!saved || !logKind || !logText.trim()) return;
    setBusy(true);
    try {
      await logActivity({ businessId, contactId: saved.id, kind: logKind, summary: logText.trim().slice(0, 140), body: logText.trim().length > 140 ? logText.trim() : undefined, byUid: actor.uid, byName: actor.displayName });
      if (logKind !== 'note') {
        const next = await saveContact({ id: saved.id, businessId, lastContactAt: Date.now() }, actor, saved);
        setSaved(next); if (!dirty) setDraft(next);
      }
      setLogKind(null); setLogText('');
    } catch (e: any) { setErr(e?.message || 'Could not log that.'); }
    setBusy(false);
  };

  const toggleTag = (t: string) => set('tags', (draft.tags || []).includes(t) ? (draft.tags || []).filter(x => x !== t) : [...(draft.tags || []), t]);
  const addTag = () => { const t = tagInput.trim(); if (t && !(draft.tags || []).includes(t)) set('tags', [...(draft.tags || []), t]); setTagInput(''); };

  const renderCustom = (f: CrmField) => {
    const v = draft.custom?.[f.id] || '';
    if (f.type === 'select') {
      return (
        <select className="crm-input" value={v} onChange={e => setCustom(f.id, e.target.value)}>
          <option value="">—</option>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return <input className="crm-input crm-num" type={f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'currency' ? 'number' : 'text'} inputMode={f.type === 'currency' ? 'decimal' : undefined} value={v} onChange={e => setCustom(f.id, e.target.value)} />;
  };

  const stageLabel = (id?: string) => {
    for (const p of pipelines) { const s = p.stages.find(x => x.id === id); if (s) return s.label; }
    return id || '';
  };

  return (
    <div className="crm-overlay" role="dialog" aria-modal="true" aria-label={saved ? fullName(saved) : `New ${preset.crm.contactNoun}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="crm-sheet">
        <div className="crm-sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="crm-h crm-h2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{saved ? fullName(saved) : `New ${preset.crm.contactNoun}`}</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {stage && <span className={`crm-pill ${stage.kind === 'won' ? 'crm-pill-won' : stage.kind === 'lost' ? 'crm-pill-lost' : 'crm-pill-accent'}`}>{stage.label}</span>}
              {saved && stage && <span className="crm-pill crm-num">{daysInStage(saved, now)}d in stage</span>}
              {stale && <span className="crm-pill crm-pill-stale">Stale</span>}
              {saved?.totalSpend ? <span className="crm-pill crm-num">{formatCents(saved.totalSpend * 100)} spent</span> : null}
            </div>
          </div>
          <button className="crm-btn crm-btn-ghost crm-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {saved && (
          <div className="crm-section">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="crm-btn" aria-pressed={logKind === 'call'} onClick={() => setLogKind(logKind === 'call' ? null : 'call')}><Phone size={16} />Log call</button>
              <button className="crm-btn" onClick={() => setLogKind(logKind === 'note' ? null : 'note')}><StickyNote size={16} />Note</button>
              <button className="crm-btn" onClick={() => setLogKind(logKind === 'meeting' ? null : 'meeting')}><Users size={16} />Meeting</button>
              <button className="crm-btn crm-btn-primary" onClick={() => onSend({ ...saved, ...draft } as CrmContact)}><Send size={16} />Send</button>
            </div>
            {logKind && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea className="crm-input" rows={3} autoFocus placeholder={logKind === 'call' ? 'What did you talk about?' : logKind === 'meeting' ? 'Who met, what was decided?' : 'Note'} value={logText} onChange={e => setLogText(e.target.value)} style={{ minHeight: 88 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="crm-btn crm-btn-primary" disabled={!logText.trim() || busy} onClick={submitLog}>Save {logKind}</button>
                  <button className="crm-btn crm-btn-ghost" onClick={() => { setLogKind(null); setLogText(''); }}>Cancel</button>
                </div>
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="crm-note">
                <div style={{ marginBottom: 6 }}>Suggested for {stage?.label || 'this stage'}:</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {suggestions.map(t => <button key={t.id} className="crm-chip" onClick={() => onSend({ ...saved, ...draft } as CrmContact, t.id)}>{t.label}</button>)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="crm-section">
          <h3 className="crm-h crm-h3">Profile</h3>
          <div className="crm-grid2">
            <Field label="First name"><input className="crm-input" value={draft.firstName || ''} onChange={e => set('firstName', e.target.value)} /></Field>
            <Field label="Last name"><input className="crm-input" value={draft.lastName || ''} onChange={e => set('lastName', e.target.value)} /></Field>
          </div>
          <Field label="Display name" hint="Leave blank to use first + last."><input className="crm-input" value={draft.name || ''} onChange={e => set('name', e.target.value)} /></Field>
          <div className="crm-grid2">
            <Field label="Email"><input className="crm-input" type="email" inputMode="email" value={draft.email || ''} onChange={e => set('email', e.target.value)} /></Field>
            <Field label="Phone"><input className="crm-input" type="tel" inputMode="tel" value={draft.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
          </div>
          <div className="crm-grid2">
            <Field label="Company"><input className="crm-input" value={draft.company || ''} onChange={e => set('company', e.target.value)} /></Field>
            <Field label="Birthday"><input className="crm-input" type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(draft.birthday || '') ? draft.birthday : ''} onChange={e => set('birthday', e.target.value || undefined)} /></Field>
          </div>
          <Field label="Source">
            <select className="crm-input" value={draft.source || ''} onChange={e => set('source', (e.target.value || undefined) as CrmContact['source'])}>
              <option value="">—</option>
              {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </select>
          </Field>
        </div>

        <div className="crm-section">
          <h3 className="crm-h crm-h3">Pipeline</h3>
          <div className="crm-grid2">
            <Field label="Pipeline">
              <select className="crm-input" value={draft.pipelineId || ''} onChange={e => { const p = pipelines.find(x => x.id === e.target.value); setDraft(d => ({ ...d, pipelineId: p?.id, stageId: p?.stages[0]?.id })); setDirty(true); }}>
                <option value="">Not in a pipeline</option>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Stage">
              <select className="crm-input" value={draft.stageId || ''} disabled={!pipeline} onChange={e => set('stageId', e.target.value)}>
                {(pipeline?.stages || []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="crm-grid2">
            <Field label={pipeline?.valueLabel || 'Deal value ($)'}>
              <input className="crm-input crm-num" type="number" inputMode="decimal" min={0} step="0.01" value={draft.dealValueCents != null ? draft.dealValueCents / 100 : ''} onChange={e => set('dealValueCents', e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100))} />
            </Field>
            <Field label="Assigned to">
              <select className="crm-input" value={draft.assignedTo ? (draft.assignedTo === currentUser.uid ? 'me' : 'other') : ''} onChange={e => set('assignedTo', e.target.value === 'me' ? currentUser.uid : e.target.value === '' ? undefined : draft.assignedTo)}>
                <option value="">Unassigned</option>
                <option value="me">Me{currentUser.displayName ? ` (${currentUser.displayName})` : ''}</option>
                {draft.assignedTo && draft.assignedTo !== currentUser.uid && <option value="other">Someone else on the team</option>}
              </select>
            </Field>
          </div>
          <div className="crm-grid2">
            <Field label="Next action" hint={stage?.nextAction && !draft.nextAction ? `Suggested: ${stage.nextAction}` : undefined}>
              <input className="crm-input" value={draft.nextAction || ''} placeholder={stage?.nextAction || 'Call back, send quote…'} onChange={e => set('nextAction', e.target.value)} />
            </Field>
            <Field label="Due">
              <input className="crm-input" type="datetime-local" value={toLocalInput(draft.nextActionAt)} onChange={e => set('nextActionAt', e.target.value ? new Date(e.target.value).getTime() : undefined)} />
            </Field>
          </div>
        </div>

        {(preset.crm.fields || []).length > 0 && (
          <div className="crm-section">
            <h3 className="crm-h crm-h3">Details</h3>
            <div className="crm-grid2">
              {preset.crm.fields.map(f => <Field key={f.id} label={f.label}>{renderCustom(f)}</Field>)}
            </div>
          </div>
        )}

        <div className="crm-section">
          <h3 className="crm-h crm-h3">Mailing address</h3>
          <Field label="Street"><input className="crm-input" autoComplete="off" value={draft.address?.line1 || ''} onChange={e => setAddr('line1', e.target.value)} /></Field>
          <Field label="Apt, suite (optional)"><input className="crm-input" autoComplete="off" value={draft.address?.line2 || ''} onChange={e => setAddr('line2', e.target.value)} /></Field>
          <div className="crm-grid3">
            <Field label="City"><input className="crm-input" autoComplete="off" value={draft.address?.city || ''} onChange={e => setAddr('city', e.target.value)} /></Field>
            <Field label="State"><input className="crm-input" autoComplete="off" maxLength={3} value={draft.address?.region || ''} onChange={e => setAddr('region', e.target.value)} /></Field>
            <Field label="ZIP"><input className="crm-input crm-num" autoComplete="off" inputMode="numeric" value={draft.address?.postal || ''} onChange={e => setAddr('postal', e.target.value)} /></Field>
          </div>
        </div>

        <div className="crm-section">
          <h3 className="crm-h crm-h3">Consent</h3>
          <label className="crm-switch">
            <span><span style={{ display: 'block', fontWeight: 600 }}>Agreed to marketing</span><span className="crm-muted crm-small">Promotions by email, app and mail. Receipts and replies are always allowed.</span></span>
            <input type="checkbox" checked={!!draft.marketingOptIn} onChange={e => set('marketingOptIn', e.target.checked)} />
          </label>
          <label className="crm-switch">
            <span><span style={{ display: 'block', fontWeight: 600 }}>Do not mail</span><span className="crm-muted crm-small">Leaves them off letters, postcards and labels.</span></span>
            <input type="checkbox" checked={!!draft.mailOptOut} onChange={e => set('mailOptOut', e.target.checked)} />
          </label>
        </div>

        <div className="crm-section">
          <h3 className="crm-h crm-h3">Tags</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {allTags.map(t => <button key={t} className="crm-chip" aria-pressed={(draft.tags || []).includes(t)} onClick={() => toggleTag(t)}>{t}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="crm-input" placeholder="New tag" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
            <button className="crm-btn" disabled={!tagInput.trim()} onClick={addTag}>Add</button>
          </div>
          <Field label="Notes"><textarea className="crm-input" rows={4} value={draft.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
        </div>

        {saved && (
          <div className="crm-section">
            <h3 className="crm-h crm-h3">Timeline</h3>
            <div className="crm-muted crm-small crm-num">
              Added {relDays(saved.createdAt, now)} · last visit {relDays(saved.lastVisit, now)} · last contacted {relDays(saved.lastContactAt, now)}{saved.visitCount ? ` · ${saved.visitCount} visits` : ''}
            </div>
            {acts.length === 0 && <div className="crm-muted">Nothing logged yet.</div>}
            {acts.map(a => (
              <div key={a.id} className="crm-tl">
                <div className="crm-tl-dot">{ACT_ICON[a.kind] || <Info size={16} />}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {a.kind === 'stage' ? `${a.fromStageId ? `${stageLabel(a.fromStageId)} → ` : ''}${stageLabel(a.toStageId)}` : a.summary}
                    {a.amountCents ? <span className="crm-num"> · {formatCents(a.amountCents)}</span> : null}
                  </div>
                  {a.body && <div className="crm-muted crm-small" style={{ whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.body}</div>}
                  <div className="crm-muted crm-small">{new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{a.byName ? ` · ${a.byName}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="crm-sheet-foot">
          {err && <div className="crm-note crm-warn" role="alert" style={{ flexBasis: '100%' }}>{err}</div>}
          <button className="crm-btn crm-btn-primary" disabled={!dirty || busy} onClick={save} style={{ flex: 1 }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saved ? (dirty ? 'Save changes' : 'Saved') : `Add ${preset.crm.contactNoun}`}
          </button>
          {saved && mode === 'owner' && <button className="crm-btn crm-btn-danger" disabled={busy} onClick={remove} aria-label="Delete contact"><Trash2 size={16} /><span className="crm-hide-sm">Delete</span></button>}
        </div>
      </div>
    </div>
  );
};

export default ContactDrawer;
