// OrgHub — create, manage, and view Organizations (Part 2, slice 2).
//
// One self-contained surface with three states: a list of the orgs you run, a
// create form, and a public org profile. Brand accounts are Organizations
// (orgType 'BRAND'); the same page will serve churches (orgType 'CHURCH') in Part 3.

import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Building2, Plus, ArrowLeft, Check, Globe, MapPin, Users, Star, Loader2, Camera, Pencil,
} from 'lucide-react';
import type { Organization, OrgMembership, OrgType } from '../types';
import {
  createOrganization, fetchUserOrganizations, fetchOrgMembers, updateOrganization,
} from '../services/organizationService';
import { uploadFile } from '../services/backendService';

const ORG_TYPES: { type: OrgType; label: string; blurb: string }[] = [
  { type: 'BRAND',        label: 'Brand',        blurb: 'A label, studio, or product brand with a roster + community.' },
  { type: 'BUSINESS',     label: 'Business',     blurb: 'A local or online business page with hours + storefront.' },
  { type: 'CHURCH',       label: 'Church',       blurb: 'A ministry with sub-groups, giving, and streaming.' },
  { type: 'NONPROFIT',    label: 'Nonprofit',    blurb: 'A cause or charity with members and fundraising.' },
  { type: 'LABEL',        label: 'Label',        blurb: 'A music/film label managing multiple artists.' },
  { type: 'TEAM',         label: 'Team',         blurb: 'A sports team or crew.' },
];

const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem]';
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';

interface OrgHubProps { user: any; onBack: () => void; initialOrgId?: string }

const OrgHub: React.FC<OrgHubProps> = ({ user, onBack, initialOrgId }) => {
  const [mode, setMode] = useState<'list' | 'create' | 'view'>(initialOrgId ? 'view' : 'list');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Organization | null>(null);

  const loadOrgs = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try { setOrgs(await fetchUserOrganizations(user.uid)); } catch { /* */ }
    setLoading(false);
  }, [user?.uid]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);
  useEffect(() => {
    if (initialOrgId) {
      import('../services/organizationService').then(m => m.fetchOrganization(initialOrgId)).then(o => { if (o) { setActive(o); setMode('view'); } });
    }
  }, [initialOrgId]);

  if (mode === 'create') {
    return <OrgCreator onCancel={() => setMode('list')} onCreated={(o) => { setActive(o); setMode('view'); loadOrgs(); }} />;
  }
  if (mode === 'view' && active) {
    return <OrgProfile org={active} isOwner={active.creatorId === user?.uid || !!active.admins?.includes(user?.uid)} onBack={() => { setActive(null); setMode('list'); }} />;
  }

  // ── List ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full p-6 lg:p-12 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest"><ArrowLeft size={14} /> Back</button>
        <button onClick={() => setMode('create')} className="flex items-center gap-2 px-5 py-2.5 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:brightness-110"><Plus size={14} /> New organization</button>
      </div>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-small-orange/15 rounded-2xl"><Building2 className="text-small-orange" size={24} /></div>
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-white leading-none">Your organizations</h1>
          <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mt-1">Brands, businesses, ministries — pages you run</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-white/30" size={28} /></div>
      ) : orgs.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <Building2 size={40} className="mx-auto text-white/15 mb-4" />
          <p className="text-white/50 font-bold mb-1">No organizations yet</p>
          <p className="text-[11px] text-white/30 mb-6">Create a brand, business, or ministry page — a parallel account with its own profile, staff, and community.</p>
          <button onClick={() => setMode('create')} className="px-6 py-3 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:brightness-110">Create your first</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {orgs.map(o => (
            <button key={o.id} onClick={() => { setActive(o); setMode('view'); }} className={`${card} p-5 text-left hover:bg-white/[0.06] transition-all flex items-center gap-4`}>
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
                {o.logoUrl ? <img src={o.logoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={20} className="text-white/30" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-black text-white truncate">{o.name}</p>
                  {o.isVerified && <Check size={13} className="text-small-orange shrink-0" />}
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-small-orange/70 mt-0.5">{o.orgType}</p>
                <p className="text-[11px] text-white/40 truncate mt-0.5">{o.tagline || o.about || '—'}</p>
              </div>
              <span className="text-[9px] font-bold text-white/30 flex items-center gap-1 shrink-0"><Users size={11} /> {o.memberCount ?? 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Create form ───────────────────────────────────────────────────────────────
const OrgCreator: React.FC<{ onCancel: () => void; onCreated: (o: Organization) => void }> = ({ onCancel, onCreated }) => {
  const [orgType, setOrgType] = useState<OrgType>('BRAND');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [about, setAbout] = useState('');
  const [category, setCategory] = useState('');
  const [website, setWebsite] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const org = await createOrganization({
        orgType, name: name.trim(), tagline: tagline.trim() || undefined, about: about.trim(),
        category: category.trim() || undefined,
        socialLinks: website.trim() ? { website: website.trim() } : undefined,
      });
      if (!org) { setBusy(false); return; }
      const patch: any = {};
      if (logoFile) patch.logoUrl = await uploadFile(`organizations/${org.id}/logo_${Date.now()}.png`, logoFile);
      if (coverFile) patch.coverUrl = await uploadFile(`organizations/${org.id}/cover_${Date.now()}.png`, coverFile);
      if (Object.keys(patch).length) { await updateOrganization(org.id, patch); Object.assign(org, patch); }
      onCreated(org);
    } catch (e) { setBusy(false); alert('Could not create the organization. Please try again.'); }
  };

  return (
    <div className="min-h-full p-6 lg:p-12 max-w-2xl mx-auto">
      <button onClick={onCancel} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest mb-8"><ArrowLeft size={14} /> Cancel</button>
      <h1 className="text-3xl font-black uppercase tracking-tight text-white mb-2">New organization</h1>
      <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-8">A parallel account — its own profile, staff & community</p>

      <div className="space-y-6">
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ORG_TYPES.map(t => (
              <button key={t.type} onClick={() => setOrgType(t.type)} title={t.blurb}
                className={`p-3 rounded-2xl border text-left transition-all ${orgType === t.type ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                <span className="text-[11px] font-black uppercase tracking-widest">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/30 mt-2">{ORG_TYPES.find(t => t.type === orgType)?.blurb}</p>
        </div>

        <div className="flex gap-4">
          <ImagePick label="Logo" file={logoFile} onPick={setLogoFile} round />
          <ImagePick label="Cover" file={coverFile} onPick={setCoverFile} />
        </div>

        <div><label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Organization name" className={field} /></div>
        <div><label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Tagline</label>
          <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="A short line under the name" className={field} /></div>
        <div><label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">About</label>
          <textarea value={about} onChange={e => setAbout(e.target.value)} rows={3} placeholder="What is this organization?" className={`${field} resize-none`} /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Category</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Music Label" className={field} /></div>
          <div><label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Website</label>
            <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" className={field} /></div>
        </div>

        <button onClick={submit} disabled={busy || !name.trim()} className="w-full py-4 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : <>Create organization</>}
        </button>
      </div>
    </div>
  );
};

const ImagePick: React.FC<{ label: string; file: File | null; onPick: (f: File) => void; round?: boolean }> = ({ label, file, onPick, round }) => (
  <label className="cursor-pointer">
    <span className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">{label}</span>
    <div className={`w-20 h-20 ${round ? 'rounded-full' : 'rounded-2xl'} bg-white/5 border border-white/10 grid place-items-center overflow-hidden hover:bg-white/10 transition-all`}>
      {file ? <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" /> : <Camera size={18} className="text-white/30" />}
    </div>
    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
  </label>
);

// ── Public / owner org profile ──────────────────────────────────────────────
const OrgProfile: React.FC<{ org: Organization; isOwner: boolean; onBack: () => void }> = ({ org, isOwner, onBack }) => {
  const [staff, setStaff] = useState<OrgMembership[]>([]);
  useEffect(() => { fetchOrgMembers(org.id).then(setStaff).catch(() => {}); }, [org.id]);

  return (
    <div className="min-h-full">
      {/* Cover */}
      <div className="relative h-48 lg:h-64 bg-gradient-to-br from-[#1a1030] to-[#2a1500] overflow-hidden">
        {org.coverUrl && <img src={org.coverUrl} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] to-transparent" />
        <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-2 px-3 py-2 bg-black/50 backdrop-blur rounded-full text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest"><ArrowLeft size={13} /> Back</button>
      </div>

      <div className="px-6 lg:px-12 max-w-5xl mx-auto">
        {/* Identity */}
        <div className="flex items-end gap-5 -mt-14 relative">
          <div className="w-28 h-28 rounded-3xl overflow-hidden bg-[#111] border-4 border-[#050505] grid place-items-center shrink-0">
            {org.logoUrl ? <img src={org.logoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={36} className="text-white/30" />}
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-4xl font-black uppercase tracking-tight text-white truncate">{org.name}</h1>
              {org.isVerified && <Check size={18} className="text-small-orange shrink-0" />}
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-small-orange/80 mt-1">{org.orgType}{org.category ? ` · ${org.category}` : ''}</p>
          </div>
          {isOwner && (
            <span className="pb-3 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/30"><Pencil size={11} /> You manage this</span>
          )}
        </div>

        {org.tagline && <p className="text-white/70 mt-4 text-sm font-medium">{org.tagline}</p>}
        {org.about && <p className="text-white/50 mt-3 text-sm leading-relaxed max-w-2xl">{org.about}</p>}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-4 mt-5 text-[11px] text-white/40">
          <span className="flex items-center gap-1.5"><Users size={13} /> {org.memberCount ?? 1} members</span>
          {org.socialLinks?.website && <a href={org.socialLinks.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-white"><Globe size={13} /> Website</a>}
          {org.location?.city && <span className="flex items-center gap-1.5"><MapPin size={13} /> {org.location.city}</span>}
        </div>

        {/* Staff / roster */}
        {staff.length > 0 && (
          <section className="mt-10">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2"><Star size={12} className="text-small-orange" /> Staff</h2>
            <div className="flex flex-wrap gap-3">
              {staff.map(m => (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/10">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0">
                    {m.photoUrl ? <img src={m.photoUrl} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-none">{m.displayName}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mt-1">{m.title || m.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Channels */}
        {org.channels && org.channels.length > 0 && (
          <section className="mt-10 pb-16">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Channels</h2>
            <div className="flex flex-wrap gap-2">
              {org.channels.map(c => (
                <span key={c.id} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/60">#{c.name}</span>
              ))}
            </div>
          </section>
        )}
        <div className="h-16" />
      </div>
    </div>
  );
};

export default OrgHub;
