// HqTemplatesTab — Content HQ's Templates tab: the org's own templates (or the user's, in a personal
// HQ), a way into the full library, and, for org admins, the template sharing policy.
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { saveTelaDoc } from '../../services/telaStore';
import { CATEGORY_LABEL, TEMPLATES_CHANGED, deleteTemplateRecord, instantiateTemplate, listLibrary, type LibraryTemplate } from '../../services/templates/docTemplateLibrary';
import { AN_CSS } from '../announcements/anStyles';
import { Thumb } from './TemplateLibrary';
import OrgTemplatePolicyPanel from './OrgTemplatePolicyPanel';

const TemplateLibrary = lazy(() => import('./TemplateLibrary'));

export default function HqTemplatesTab({ scope, canEdit, viewer }: { scope: { kind: 'org' | 'user'; id: string; label?: string }; canEdit: boolean; viewer: { uid: string; name: string } }) {
  const isOrg = scope.kind === 'org';
  const [items, setItems] = useState<LibraryTemplate[] | null>(null);
  const [lib, setLib] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => void listLibrary({ uid: viewer.uid, orgId: isOrg ? scope.id : undefined }).then(l => { if (live) setItems(isOrg ? l.org : l.mine); });
    load();
    window.addEventListener(TEMPLATES_CHANGED, load);
    return () => { live = false; window.removeEventListener(TEMPLATES_CHANGED, load); };
  }, [scope.id, isOrg, viewer.uid]);

  const use = async (t: LibraryTemplate) => {
    const d = instantiateTemplate(t, viewer.uid);
    const withOrigin = isOrg ? { ...d, orgOrigin: { orgId: scope.id, orgName: scope.label } } : d;
    if ((await saveTelaDoc(withOrigin)).ok) window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: withOrigin.id, returnTo: { label: 'Content HQ' } } }));
  };

  return (
    <div className="ce an" style={{ height: '100%', overflow: 'auto', paddingBottom: 24 }}>
      <style>{AN_CSS}</style>
      <div className="row wrap">
        <div className="grow">
          <h3 style={{ fontSize: '1rem', fontWeight: 900 }}>{isOrg ? `${scope.label || 'Org'} templates` : 'My templates'}</h3>
          <div className="small">Lessons, worksheets, flyers and documents saved as templates. In Tela, use Templates › Save as template to add one.</div>
        </div>
        <button type="button" className="btn sm" onClick={() => setLib(true)}>Browse all templates</button>
      </div>
      {items === null && <p className="small">Loading…</p>}
      {items && !items.length && <div className="card"><div className="t">No templates yet</div><div className="u">Open any document in Tela and choose Templates › Save as template{isOrg ? ` › ${scope.label || 'Our org'}` : ''}.</div></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
        {(items || []).map(t => (
          <div key={t.key} className="card" style={{ alignContent: 'start' }}>
            <button type="button" onClick={() => void use(t)} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 6 }} aria-label={`Customize ${t.name}`}>
              <Thumb t={t} />
              <span className="t">{t.name}</span>
            </button>
            <span className="u">{CATEGORY_LABEL[t.category]}{t.by ? ` · ${t.by}` : ''}</span>
            {(canEdit || t.record?.ownerUid === viewer.uid) && t.record && <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => { if (confirm(`Delete “${t.name}”?`)) void deleteTemplateRecord(t.record!); }}>Delete</button>}
          </div>
        ))}
      </div>
      {isOrg && canEdit && <div className="panel"><div className="pb"><OrgTemplatePolicyPanel orgId={scope.id} orgName={scope.label} inline /></div></div>}
      {lib && <Suspense fallback={null}><TemplateLibrary orgId={isOrg ? scope.id : undefined} orgName={scope.label} viewer={viewer} isOrgAdmin={isOrg && canEdit} orgRole={canEdit ? 'admin' : 'member'} returnLabel="Content HQ" onClose={() => setLib(false)} /></Suspense>}
    </div>
  );
}
