// SaveTemplateDialog — save the open Tela document as a template: for me, for the org (Content HQ),
// or for everyone on Plajah. Org documents shared to everyone follow the org's sharing policy and
// are stripped to the design first.
import React, { useEffect, useState } from 'react';
import type { TelaDoc } from '../../types';
import {
  CATEGORY_LABEL, getOrgTemplatePolicy, saveDocAsTemplate, shareDocToPlatform, sharingBlockedReason,
  type DocTemplateCategory, type OrgShareRole, type OrgTemplatePolicy,
} from '../../services/templates/docTemplateLibrary';
import { AN_CSS } from '../announcements/anStyles';

type Where = 'user' | 'org' | 'platform';

export default function SaveTemplateDialog({ doc, viewer, org, onClose }: {
  doc: TelaDoc;
  viewer: { uid: string; name: string };
  /** The org this document belongs to (its orgOrigin, or the Classwork context) and the viewer's role there. */
  org?: { orgId: string; orgName?: string; role: OrgShareRole; canSaveToOrg: boolean };
  onClose: () => void;
}) {
  const [name, setName] = useState(doc.title || 'Untitled template');
  const [category, setCategory] = useState<DocTemplateCategory>(doc.templatePreset?.templateId?.startsWith('flyer:') ? 'FLYER' : doc.assignmentFormat ? 'WORKSHEET' : 'DOCUMENT');
  const [description, setDescription] = useState('');
  const [where, setWhere] = useState<Where>('user');
  const [policy, setPolicy] = useState<OrgTemplatePolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (org) void getOrgTemplatePolicy(org.orgId).then(setPolicy); }, [org]);

  const blocked = where === 'platform' && org && policy ? sharingBlockedReason(policy, org.role) : null;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      if (where === 'platform') {
        const r = await shareDocToPlatform(doc, { name, category, description, ownerName: viewer.name, fromOrg: org ? { orgId: org.orgId, orgName: org.orgName, role: org.role, policy: policy || undefined } : undefined });
        setMsg({ ok: true, text: `${r.synced ? 'Shared with everyone' : 'Saved on this device; it will be shared once you’re signed in'}.${org ? ` Its words were swapped for placeholder text and its photos removed, so nothing from ${org.orgName || 'your org'} goes with it.` : ''}` });
      } else {
        const r = await saveDocAsTemplate(doc, { tier: where, name, category, description, orgId: org?.orgId, orgName: org?.orgName, ownerName: viewer.name });
        setMsg({ ok: true, text: where === 'org' ? `${r.synced ? 'Saved' : 'Saved on this device'} to the ${org?.orgName || 'org'} library in Content HQ.` : `${r.synced ? 'Saved' : 'Saved on this device'} to your templates.` });
      }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Couldn’t save this template.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="ce an overlay" role="dialog" aria-modal="true" aria-label="Save as template" onKeyDown={e => { if (e.key === 'Escape') onClose(); }} style={{ zIndex: 560 }}>
      <style>{AN_CSS}</style>
      <div className="box" style={{ width: 'min(560px,100%)' }}>
        <div className="row"><div className="grow"><div className="eyebrow">Template</div><h3 style={{ fontSize: '1.05rem', fontWeight: 900 }}>Save as template</h3></div><button type="button" className="btn sm" onClick={onClose}>Close</button></div>
        <label className="lbl">Name<input className="field" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
        <label className="lbl">Kind
          <select className="field" value={category} onChange={e => setCategory(e.target.value as DocTemplateCategory)}>
            {(Object.keys(CATEGORY_LABEL) as DocTemplateCategory[]).map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="lbl">What it’s for (optional)<input className="field" value={description} maxLength={160} onChange={e => setDescription(e.target.value)} /></label>
        <div className="stack" role="radiogroup" aria-label="Who can use it">
          <span className="lbl">Who can use it</span>
          {([['user', 'Just me', 'Only you see it, under Mine.'], ...(org?.canSaveToOrg ? [['org', org.orgName || 'Our org', 'Everyone who works in Content HQ for this org.']] : []), ['platform', 'Everyone on Plajah', org ? `A stripped copy: placeholder text, no photos, nothing from ${org.orgName || 'the org'}.` : 'Anyone can find it and make their own copy.']] as Array<[Where, string, string]>).map(([id, label, sub]) => (
            <button key={id} type="button" role="radio" aria-checked={where === id} className="card click" style={{ borderColor: where === id ? 'var(--orange)' : undefined }} onClick={() => { setWhere(id); setMsg(null); }}>
              <span className="t">{label}</span><span className="u">{sub}</span>
            </button>
          ))}
        </div>
        {blocked && <div className="err">{blocked}</div>}
        {msg && <div className={msg.ok ? 'okmsg' : 'err'} role="status">{msg.text}</div>}
        <div className="row"><button type="button" className="btn p" disabled={busy || !name.trim() || !!blocked || !!msg?.ok} onClick={() => void save()}>{busy ? 'Saving…' : 'Save template'}</button></div>
      </div>
    </div>
  );
}
