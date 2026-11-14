// OrgTemplatePolicyPanel — an org admin decides whether its people may share the org's documents as
// public templates, and which roles. Off by default. Shared copies are always stripped to the design.
import React, { useEffect, useState } from 'react';
import { ORG_SHARE_ROLES, defaultPolicy, getOrgTemplatePolicy, setOrgTemplatePolicy, type OrgTemplatePolicy } from '../../services/templates/docTemplateLibrary';
import { AN_CSS } from '../announcements/anStyles';

export default function OrgTemplatePolicyPanel({ orgId, orgName, onClose, inline }: { orgId: string; orgName?: string; onClose?: () => void; inline?: boolean }) {
  const [p, setP] = useState<OrgTemplatePolicy>(() => defaultPolicy(orgId));
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  useEffect(() => { void getOrgTemplatePolicy(orgId).then(x => { setP(x); setLoaded(true); }); }, [orgId]);

  const save = async () => {
    setState('saving');
    const r = await setOrgTemplatePolicy(p);
    setState(r.synced ? 'saved' : 'local');
  };

  const body = (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row wrap">
        <div className="grow">
          <div className="eyebrow">Content HQ · Template sharing</div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 900 }}>Can people share {orgName || 'this org'}’s documents with everyone?</h3>
        </div>
        {onClose && <button type="button" className="btn sm" onClick={onClose}>Close</button>}
      </div>
      <p className="small">Anyone can always save templates for themselves or for {orgName || 'the org'}. This decides whether a document made here can also go to the platform library for everyone on Plajah.</p>
      <label className="card click row" style={{ gap: 12 }}>
        <input type="checkbox" checked={p.allowPlatformSharing} disabled={!loaded} onChange={e => { setP({ ...p, allowPlatformSharing: e.target.checked }); setState('idle'); }} />
        <span className="grow"><span className="t">Allow sharing to the platform</span><br /><span className="u">Off by default.</span></span>
      </label>
      <fieldset disabled={!p.allowPlatformSharing} className="stack" style={{ border: 0, padding: 0, margin: 0, opacity: p.allowPlatformSharing ? 1 : .45 }}>
        <legend className="lbl" style={{ marginBottom: 6 }}>Who may share</legend>
        <div className="chips">
          {ORG_SHARE_ROLES.map(r => (
            <button key={r.id} type="button" className="chip" aria-pressed={p.roles[r.id]} onClick={() => { setP({ ...p, roles: { ...p.roles, [r.id]: !p.roles[r.id] } }); setState('idle'); }}>{r.label}</button>
          ))}
        </div>
      </fieldset>
      <div className="card">
        <div className="t">What leaves {orgName || 'the org'}</div>
        <div className="u">Only the design. Every word becomes placeholder Latin (lorem ipsum), photos and media become empty slots, and links, answer keys, lesson data and narration are removed before the copy is shared.</div>
      </div>
      <div className="row">
        <button type="button" className="btn p" disabled={!loaded || state === 'saving'} onClick={() => void save()}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
        {state === 'saved' && <span className="small">Saved.</span>}
        {state === 'local' && <span className="small">Saved on this device only — sign in as an org admin to apply it for everyone.</span>}
      </div>
    </div>
  );
  if (inline) return <div className="ce an"><style>{AN_CSS}</style>{body}</div>;
  return (
    <div className="ce an overlay" role="dialog" aria-modal="true" aria-label="Template sharing" style={{ zIndex: 540 }}>
      <style>{AN_CSS}</style>
      <div className="box" style={{ width: 'min(620px,100%)' }}>{body}</div>
    </div>
  );
}
