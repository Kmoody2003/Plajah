import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ExternalLink, Plus, Rss, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, Chip, Input, Surface, Textarea } from '../ui';
import { auth } from '../../services/backendService';
import { getJournalistBadge, newCredential, newPublication } from '../../services/journalist/newsroomStore';
import { slugify, mastheadProblems } from '../../services/journalist/publicationLogic';
import type { PressCredential, Publication } from '../../services/journalist/types';
import { useNewsroomList } from './useNewsroom';
import { passportIdFor } from '../../services/creatorPassport';

const ACCESS_LABEL: Record<Publication['access'], string> = { FREE: 'Free to read', SUBSCRIBERS: 'Subscribers (Plajah+ / creator subscription)', PAID_ISSUES: 'Paid issues (buy-to-own)' };

export const PublicationManager: React.FC<{ orgId?: string }> = ({ orgId }) => {
  const pubs = useNewsroomList<Publication>('publications', orgId);
  const creds = useNewsroomList<PressCredential>('press_credentials');
  const [name, setName] = useState('');
  const [sel, setSel] = useState('');
  const publication = pubs.items.find(p => p.id === sel);
  const [section, setSection] = useState('');
  const [editorName, setEditorName] = useState('');
  const [badge, setBadge] = useState<{ verified: boolean; outlet?: string } | null>(null);
  const [issuer, setIssuer] = useState('');
  const uid = auth.currentUser?.uid || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => { if (uid) getJournalistBadge(uid).then(setBadge); }, [uid]);
  const problems = useMemo(() => (publication ? mastheadProblems(publication) : []), [publication]);

  const create = () => {
    const n = name.trim(); if (!n) return;
    void pubs.save(newPublication(n, slugify(n), { orgId: orgId || undefined, editors: [{ uid, name: auth.currentUser?.displayName || 'Editor', title: 'Editor' }] }));
    setName('');
  };
  const upd = (patch: Partial<Publication>) => { if (publication) void pubs.save({ ...publication, ...patch }); };

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-[300px,1fr]">
        <div className="flex flex-col gap-3">
          <Surface level={2} className="flex gap-2 items-end">
            <Input label="New publication" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} className="flex-1" />
            <Button variant="primary" iconOnly aria-label="Create publication" icon={<Plus />} onClick={create} disabled={!name.trim()} />
          </Surface>
          <ul className="flex flex-col gap-2">
            {pubs.items.map(p => <li key={p.id}><button type="button" className="w-full text-left" onClick={() => setSel(p.id)}><Surface level={sel === p.id ? 3 : 1} className="!p-3"><p className="font-semibold">{p.name}</p><p className="text-[11px] opacity-60">/{p.slug} · {p.sections.length} sections</p></Surface></button></li>)}
            {pubs.items.length === 0 && <p className="text-sm opacity-60">A publication gives your articles a masthead: name, sections, editors, an RSS feed, and (optionally) a subscription.</p>}
          </ul>
        </div>

        {publication ? (
          <Surface level={1} className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Input label="Name" value={publication.name} onChange={e => upd({ name: e.target.value })} className="flex-1 min-w-[200px]" />
              <Input label="URL slug" value={publication.slug} onChange={e => upd({ slug: slugify(e.target.value) })} className="w-48" />
            </div>
            <Input label="Tagline" value={publication.tagline || ''} onChange={e => upd({ tagline: e.target.value })} />
            <Textarea label="Corrections policy (shown on the masthead page)" rows={2} placeholder="We correct errors openly. Every change to a published story is logged on the story." value={publication.correctionsPolicy || ''} onChange={e => upd({ correctionsPolicy: e.target.value })} />
            <Input label="Ethics / standards page URL" value={publication.ethicsUrl || ''} onChange={e => upd({ ethicsUrl: e.target.value })} />

            <div className="flex flex-col gap-2">
              <p className="pj-eyebrow">Sections</p>
              <div className="flex flex-wrap gap-2">
                {publication.sections.map(s => <Chip key={s} interactive onClick={() => upd({ sections: publication.sections.filter(x => x !== s) })} title="Remove section">{s} x</Chip>)}
              </div>
              <div className="flex gap-2 items-end"><Input label="Add section" value={section} onChange={e => setSection(e.target.value)} className="flex-1" /><Button variant="secondary" disabled={!section.trim()} onClick={() => { upd({ sections: [...publication.sections, section.trim()] }); setSection(''); }}>Add</Button></div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="pj-eyebrow">Editors on the masthead</p>
              {publication.editors.map((e, i) => <p key={`${e.uid}${i}`} className="text-sm flex items-center gap-2">{e.name}{e.title ? <span className="opacity-60">, {e.title}</span> : null}<Button size="xs" variant="danger-quiet" iconOnly aria-label="Remove editor" onClick={() => upd({ editors: publication.editors.filter((_, k) => k !== i) })}><Trash2 /></Button></p>)}
              <div className="flex gap-2 items-end"><Input label="Add an editor by name and title" placeholder="Jo Park, Managing editor" value={editorName} onChange={e => setEditorName(e.target.value)} className="flex-1" /><Button variant="secondary" disabled={!editorName.trim()} onClick={() => { const [n, ...t] = editorName.split(','); upd({ editors: [...publication.editors, { uid: '', name: n.trim(), title: t.join(',').trim() || undefined }] }); setEditorName(''); }}>Add</Button></div>
              <p className="text-[11px] opacity-60">Names here are display-only. They do not grant anyone access; org roles do that.</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="pj-eyebrow">Access</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ACCESS_LABEL) as Publication['access'][]).map(a => a === 'PAID_ISSUES'
                  ? <Chip key={a} title="Not wired yet" style={{ opacity: 0.5 }}>{ACCESS_LABEL[a]} (not available yet)</Chip>
                  : <Chip key={a} interactive selected={publication.access === a} onClick={() => upd({ access: a })}>{ACCESS_LABEL[a]}</Chip>)}
              </div>
              {publication.access === 'SUBSCRIBERS' && <p className="text-xs opacity-70">Uses Plajah+ and creator subscriptions. Readers without an active subscription see the summary and a subscribe prompt; the RSS feed carries the summary only for locked articles.</p>}
              {publication.access === 'PAID_ISSUES' && <p className="text-xs" style={{ color: '#FF8C00' }}>Paid issues are not wired. BuyToOwn and the server purchase route support film, book, album and track only; selling an issue needs an 'issue' kind added server-side. Until then, use Subscribers.</p>}
              <p className="text-[11px]" style={{ color: '#FF8C00' }}>Paywall enforcement is soft: locked article bodies are hidden by the app and left out of feeds, but the article text is still readable by anyone who queries the database directly. Do not put content here that must stay secret.</p>
            </div>

            {problems.length > 0 && <ul className="text-xs list-disc pl-5" style={{ color: '#FF8C00' }}>{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            <div className="pj-actions">
              <a className="pj-btn pj-btn--outline pj-btn--md" href={`${origin}/feeds/publication/${publication.slug}.rss`} target="_blank" rel="noopener noreferrer"><Rss size={14} /> RSS</a>
              <a className="pj-btn pj-btn--outline pj-btn--md" href={`${origin}/feeds/publication/${publication.slug}.atom`} target="_blank" rel="noopener noreferrer">Atom <ExternalLink size={12} /></a>
              <Button variant="danger-quiet" icon={<Trash2 />} onClick={() => { if (window.confirm(`Delete the publication "${publication.name}"? Articles stay; they just lose the masthead.`)) { void pubs.remove(publication.id); setSel(''); } }}>Delete</Button>
            </div>
          </Surface>
        ) : <Surface level={1}><p className="text-sm opacity-70">Create or choose a publication.</p></Surface>}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-black flex items-center gap-2"><ShieldCheck size={18} /> Press credentials and verified badge</h3>
        <Surface level={2} className="flex flex-col gap-2">
          <p className="text-sm flex items-center gap-2">
            {badge?.verified ? <><BadgeCheck size={16} style={{ color: '#06D6A0' }} /> Verified journalist{badge.outlet ? ` · ${badge.outlet}` : ''}</> : 'Not verified yet.'}
          </p>
          <p className="text-xs opacity-70">The badge is granted by Plajah staff after they review a credential. Adding one here does not verify you; it is self-asserted until reviewed. Your Creator Passport id ({passportIdFor(uid)}) is an attribution record, not a cryptographic identity.</p>
          <div className="flex flex-wrap gap-2 items-end">
            <Input label="Issuer (outlet, association, event)" value={issuer} onChange={e => setIssuer(e.target.value)} className="flex-1 min-w-[220px]" />
            <Button variant="secondary" disabled={!issuer.trim()} onClick={() => { void creds.save(newCredential(issuer.trim(), 'PRESS_CARD')); setIssuer(''); }}>Submit for review</Button>
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {creds.items.map(c => <li key={c.id} className="flex gap-2 items-center">{c.issuer}<Chip style={{ color: c.reviewStatus === 'APPROVED' ? '#06D6A0' : c.reviewStatus === 'REJECTED' ? '#FF5C6C' : '#9C96B4' }}>{c.reviewStatus.replace('_', ' ')}</Chip><Button size="xs" variant="danger-quiet" iconOnly aria-label="Remove credential" onClick={() => void creds.remove(c.id)}><Trash2 /></Button></li>)}
          </ul>
        </Surface>
      </section>
    </div>
  );
};

export default PublicationManager;
