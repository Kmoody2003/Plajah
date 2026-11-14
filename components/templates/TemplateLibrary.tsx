// TemplateLibrary — the shared document template library: Platform (everyone), the org's own
// templates (Content HQ) and the user's. Pick one to customize it in Tela, or (pickOnly) hand it
// back to the caller, e.g. the announcement composer choosing a flyer design.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TelaDoc, TelaVectorObject } from '../../types';
import { TelaStaticSvg } from '../tela/TelaVector';
import { ensureFontsForObjects } from '../../services/tela/telaFonts';
import { frameObjects } from '../../services/living/runtime/objects';
import { saveTelaDoc } from '../../services/telaStore';
import {
  CATEGORY_LABEL, TEMPLATES_CHANGED, deleteTemplateRecord, getOrgTemplatePolicy, instantiateTemplate, listLibrary, shareDocToPlatform, sharingBlockedReason,
  type DocTemplateCategory, type LibraryTemplate, type OrgShareRole, type OrgTemplatePolicy, type TemplateShelf,
} from '../../services/templates/docTemplateLibrary';
import { AN_CSS } from '../announcements/anStyles';
import OrgTemplatePolicyPanel from './OrgTemplatePolicyPanel';

const thumbCache = new Map<string, { objects: TelaVectorObject[]; w: number; h: number }>();

function buildThumb(t: LibraryTemplate): { objects: TelaVectorObject[]; w: number; h: number } {
  try {
    if (t.flyer) return { objects: t.flyer.build({ headline: '', ...t.flyer.defaults, when: 'Day · time', where: 'Place' }).objects, w: t.flyer.width, h: t.flyer.height };
    if (t.design) return { objects: t.design.pages[0]?.build() || [], w: t.width, h: t.height };
    const d = JSON.parse(t.record!.bundleJson) as TelaDoc;
    const f = d.frames[0];
    return { objects: f ? frameObjects(d, f) : [], w: f?.w || t.width, h: f?.h || t.height };
  } catch { return { objects: [], w: t.width, h: t.height }; }
}

export function Thumb({ t }: { t: LibraryTemplate }) {
  const [built, setBuilt] = useState(() => thumbCache.get(t.key) || null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (built || !ref.current) return;
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      const v = buildThumb(t); ensureFontsForObjects(v.objects); thumbCache.set(t.key, v); setBuilt(v); io.disconnect();
    }, { rootMargin: '240px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [t, built]);
  return (
    <div ref={ref} style={{ aspectRatio: `${t.width} / ${t.height}`, maxHeight: 220, width: '100%', background: t.palette[0] || '#1a1626', borderRadius: 10, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
      {built && <TelaStaticSvg objects={built.objects} width={built.w} height={built.h} style={{ width: '100%', height: '100%', display: 'block' }} />}
    </div>
  );
}

const SHELVES: Array<{ id: TemplateShelf; label: string }> = [{ id: 'platform', label: 'Platform' }, { id: 'org', label: 'Our org' }, { id: 'mine', label: 'Mine' }];

export default function TemplateLibrary({ orgId, orgName, viewer, orgRole, isOrgAdmin, pickOnly, categories, onPick, onOpenDoc, onClose, returnLabel }: {
  orgId?: string; orgName?: string;
  viewer: { uid: string; name: string };
  /** The viewer's role in this org, for the template sharing policy. */
  orgRole?: OrgShareRole;
  isOrgAdmin?: boolean;
  pickOnly?: boolean;
  categories?: DocTemplateCategory[];
  onPick?: (t: LibraryTemplate) => void;
  /** Inside Tela: open the new copy in place instead of routing through the app. */
  onOpenDoc?: (docId: string) => void;
  onClose: () => void;
  returnLabel?: string;
}) {
  const [lib, setLib] = useState<Record<TemplateShelf, LibraryTemplate[]> | null>(null);
  const [shelf, setShelf] = useState<TemplateShelf>('platform');
  const [cat, setCat] = useState<DocTemplateCategory | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(48);
  const [policy, setPolicy] = useState<OrgTemplatePolicy | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => void listLibrary({ uid: viewer.uid, orgId }).then(l => { if (live) setLib(l); });
    load();
    window.addEventListener(TEMPLATES_CHANGED, load);
    return () => { live = false; window.removeEventListener(TEMPLATES_CHANGED, load); };
  }, [viewer.uid, orgId]);
  useEffect(() => { if (orgId) void getOrgTemplatePolicy(orgId).then(setPolicy); }, [orgId, policyOpen]);

  const list = useMemo(() => {
    const src = lib?.[shelf] || [];
    const needle = q.trim().toLowerCase();
    return src.filter(t => (!categories || categories.includes(t.category)) && (cat === 'ALL' || t.category === cat)
      && (!needle || `${t.name} ${t.group} ${t.description}`.toLowerCase().includes(needle)));
  }, [lib, shelf, cat, q, categories]);
  const cats = useMemo(() => {
    const s = new Set((lib?.[shelf] || []).filter(t => !categories || categories.includes(t.category)).map(t => t.category));
    return (Object.keys(CATEGORY_LABEL) as DocTemplateCategory[]).filter(c => s.has(c));
  }, [lib, shelf, categories]);

  const use = async (t: LibraryTemplate) => {
    if (pickOnly) { onPick?.(t); return; }
    const d = instantiateTemplate(t, viewer.uid);
    const withOrigin = orgId && shelf === 'org' ? { ...d, orgOrigin: { orgId, orgName } } : d;
    const r = await saveTelaDoc(withOrigin);
    if (!r.ok) { setMsg({ ok: false, text: 'Couldn’t make your copy. Try again.' }); return; }
    if (onOpenDoc) { onOpenDoc(withOrigin.id); return; }
    window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: withOrigin.id, returnTo: returnLabel ? { label: returnLabel } : undefined } }));
    onClose();
  };

  const share = async (t: LibraryTemplate) => {
    if (!t.record) return;
    setMsg(null);
    try {
      const d = JSON.parse(t.record.bundleJson) as TelaDoc;
      const fromOrgId = t.record.orgId || d.orgOrigin?.orgId;
      await shareDocToPlatform(d, { name: t.name, category: t.category, description: t.description, ownerName: viewer.name, fromOrg: fromOrgId ? { orgId: fromOrgId, orgName: t.record.orgName || d.orgOrigin?.orgName, role: orgRole || 'member', policy: fromOrgId === orgId ? policy || undefined : undefined } : undefined });
      setMsg({ ok: true, text: fromOrgId ? `Shared with everyone. Its words were swapped for placeholder text and its photos removed, so nothing from ${t.record.orgName || 'your org'} goes with it.` : 'Shared with everyone on Plajah.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Couldn’t share this template.' }); }
  };

  const shareBlocked = (t: LibraryTemplate) => {
    if (!t.record) return null;
    const from = t.record.orgId || (() => { try { return (JSON.parse(t.record!.bundleJson) as TelaDoc).orgOrigin?.orgId; } catch { return undefined; } })();
    if (!from || from !== orgId || !policy) return null;
    return sharingBlockedReason(policy, orgRole || 'member');
  };

  return (
    <div className="ce an overlay" role="dialog" aria-modal="true" aria-label="Template library" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <style>{AN_CSS}</style>
      <div className="box">
        <div className="row wrap">
          <div className="grow">
            <div className="eyebrow">Template library</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 900 }}>{pickOnly ? 'Pick a design' : 'Start from a template'}</h2>
          </div>
          {orgId && isOrgAdmin && !pickOnly && <button type="button" className="btn sm" onClick={() => setPolicyOpen(true)}>Template sharing…</button>}
          <button type="button" className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div className="row wrap">
          <div className="seg" role="group" aria-label="Shelf">
            {SHELVES.filter(s => s.id !== 'org' || orgId).map(s => <button key={s.id} type="button" aria-pressed={shelf === s.id} onClick={() => { setShelf(s.id); setCat('ALL'); setLimit(48); }}>{s.id === 'org' ? orgName || 'Our org' : s.label}{lib ? ` · ${lib[s.id].filter(t => !categories || categories.includes(t.category)).length}` : ''}</button>)}
          </div>
          <input className="field grow" style={{ maxWidth: 320 }} placeholder="Search templates" value={q} onChange={e => setQ(e.target.value)} aria-label="Search templates" />
        </div>
        {cats.length > 1 && (
          <div className="chips">
            <button type="button" className="chip" aria-pressed={cat === 'ALL'} onClick={() => setCat('ALL')}>All</button>
            {cats.map(c => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>)}
          </div>
        )}
        {msg && <div className={msg.ok ? 'okmsg' : 'err'} role="status">{msg.text}</div>}
        {!lib && <p className="small">Loading templates…</p>}
        {lib && !list.length && (
          <div className="card">
            <div className="t">{shelf === 'org' ? `No ${orgName || 'org'} templates yet` : shelf === 'mine' ? 'You haven’t saved any templates' : 'Nothing matches'}</div>
            <div className="u">{shelf === 'platform' ? 'Try another search or category.' : 'In Tela, open a document and use Template › Save as template. Org templates show up here and in Content HQ.'}</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
          {list.slice(0, limit).map(t => {
            const blocked = shareBlocked(t);
            return (
              <div key={t.key} className="card" style={{ alignContent: 'start' }}>
                <button type="button" onClick={() => void use(t)} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 6 }} aria-label={`${pickOnly ? 'Use' : 'Customize'} ${t.name}`}>
                  <Thumb t={t} />
                  <span className="t">{t.name}</span>
                </button>
                <span className="u">{CATEGORY_LABEL[t.category]} · {t.group}{t.pages > 1 ? ` · ${t.pages} pages` : ''}{t.by ? ` · ${t.by}` : ''}</span>
                {!pickOnly && t.record && t.shelf !== 'platform' && (
                  <div className="row wrap" style={{ gap: 4 }}>
                    <button type="button" className="btn sm" disabled={!!blocked} title={blocked || 'Share a copy with everyone on Plajah'} onClick={() => void share(t)}>Share to everyone</button>
                    {t.record.ownerUid === viewer.uid && <button type="button" className="btn sm" onClick={() => { if (confirm(`Delete “${t.name}”?`)) void deleteTemplateRecord(t.record!); }}>Delete</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {list.length > limit && <button type="button" className="btn sm" style={{ justifySelf: 'center' }} onClick={() => setLimit(l => l + 48)}>Show more ({list.length - limit} left)</button>}
      </div>
      {policyOpen && orgId && <OrgTemplatePolicyPanel orgId={orgId} orgName={orgName} onClose={() => setPolicyOpen(false)} />}
    </div>
  );
}
