// OrgHub — create, manage, and view Organizations (Part 2, slice 2).
//
// One self-contained surface with three states: a list of the orgs you run, a
// create form, and a public org profile. Brand accounts are Organizations
// (orgType 'BRAND'); the same page will serve churches (orgType 'CHURCH') in Part 3.

import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import CreateEventButton from './events/CreateEventButton';
import { motion } from 'motion/react';
import {
  Building2, Plus, ArrowLeft, Check, Globe, MapPin, Users, Star, Loader2, Camera, Pencil,
  Church, Clock, Gift, Trash2, Sparkles, MonitorPlay, Mail, HardDrive, Briefcase, Megaphone,
  KeyRound, UserCheck, Home, Image as ImageIcon, Calendar, Play, HandHeart, BookOpen,
  Heart, MessageSquare, Ticket, ExternalLink, Radio, NotebookPen, ArrowRight, ChevronLeft,
  ShoppingBag,
} from 'lucide-react';
import type { Organization, OrgMembership, OrgType, OrgRole, UserProfile } from '../types';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';
import { EV, EvScope, EvModeBar, EvHero, EvTabs, EvGallery, heroImage } from './elevate/vellum';
import {
  createOrganization, fetchUserOrganizations, fetchOrgMembers, updateOrganization,
  addOrgMember, removeOrgMember, setOrgMemberRole, fetchUnmigratedBrands, migrateLegacyBrands,
  createDemoChurch, fetchChurchDonations, sumDonationsByFund, openElevateGatewayModal,
} from '../services/organizationService';
import { uploadFile, searchUserProfiles, auth } from '../services/backendService';
import { connectStripe } from '../services/stripeService';
import ApplyModal from './business/ApplyModal';
import CareersView from './business/CareersView';
import { fetchOrgPostings } from '../services/hiringService';
import { orgCan } from '../services/orgPermissions';
import type { JobPosting, Video, Album, LiveFeed } from '../types';
import ElevateSetupWizard from './elevate/ElevateSetupWizard';
import DeleteOrgDialog from './elevate/DeleteOrgDialog';
import IdentityEditor from './elevate/IdentityEditor';
import ChurchGive from './ChurchGive';
import ChurchMasterControl from './ChurchMasterControl';
import ChurchDemoView from './ChurchDemoView';
import BusinessDemoView from './BusinessDemoView';
import { DEMO_BUSINESS_ORG, DEMO_BUSINESS_ID } from '../data/demoBusiness';
import ChurchPrayerWall from './ChurchPrayerWall';
import ChurchAnnouncements from './ChurchAnnouncements';
import ChurchEducation from './church/ChurchEducation';
import {
  DEMO_CHURCH, DEMO_CHURCH_ID, DEMO_CHURCH_FEED, DEMO_CHURCH_EVENTS,
  DEMO_CHURCH_ALBUMS, DEMO_CHURCH_VIDEOS, DEMO_CHURCH_LIBRARY, DEMO_CHURCH_STAFF,
} from '../data/demoShowcase';
import { elevateCan } from '../services/elevateRoles';
import { isElevateOrg, isFaithOrg, defaultMinistries } from '../services/elevateTemplates';
import { isDemoOrg } from '../services/elevateTruth';
import { followOrg, unfollowOrg, listenFollowedState } from '../services/orgFollowService';
import MinistryPage from './elevate/MinistryPage';
import OrgStoreSection from './elevate/OrgStoreSection';
import HostEventsPublic from './events/HostEventsPublic';
import OrgThread from './elevate/OrgThread';
import OrgMediaShelves from './elevate/OrgMediaShelves';
import RelloChurchViewer from './elevate/RelloChurchViewer';
// Operations side + public rosters + Church Member Hub (lazy so the public page never blocks on them).
const ElevateOps = lazy(() => import('./elevate/ElevateOps'));
const ElevateRosters = lazy(() => import('./elevate/ElevateRosters'));
const ChurchMemberHub = lazy(() => import('./elevate/ChurchMemberHub'));
const ElevateMobilizeHub = lazy(() => import('./elevate/ElevateMobilizeHub'));

const ORG_TYPES: { type: OrgType; label: string; blurb: string }[] = [
  { type: 'BRAND',        label: 'Brand',        blurb: 'A label, studio, or product brand with a roster + community.' },
  { type: 'BUSINESS',     label: 'Business',     blurb: 'A local or online business page with hours + storefront.' },
  { type: 'CHURCH',       label: 'Church',       blurb: 'A ministry with sub-groups, giving, and streaming.' },
  { type: 'RELIGIOUS',    label: 'Religious',    blurb: 'A mosque, temple, synagogue, or other faith community.' },
  { type: 'NONPROFIT',    label: 'Nonprofit',    blurb: 'A cause or charity with members and fundraising.' },
  { type: 'CULTURAL',     label: 'Cultural',     blurb: 'A museum, cultural center, or heritage institution.' },
  { type: 'LABEL',        label: 'Label',        blurb: 'A music/film label managing multiple artists.' },
  { type: 'TEAM',         label: 'Team',         blurb: 'A sports team or crew.' },
];

const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem]';
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';

interface OrgHubProps extends OrgMediaOpeners { user: any; onBack: () => void; /** Open straight into the Elevate setup wizard ("List your institution"). */ initialCreate?: boolean; initialOrgId?: string; initialGive?: boolean; initialContentHq?: boolean; onVisitUser?: (uid: string) => void }

/** Navigation handlers for the live/media blocks on an org page (wired from App). */
interface OrgMediaOpeners {
  onOpenVideo?: (video: Video) => void;
  onOpenAlbum?: (album: Album) => void;
  onOpenLive?: (feed: LiveFeed) => void;
  onOpenChannel?: (channelOwnerId: string, sourceId?: string) => void;
}

const OrgHub: React.FC<OrgHubProps> = ({ user, onBack, initialCreate, initialOrgId, initialGive, initialContentHq, onVisitUser, onOpenVideo, onOpenAlbum, onOpenLive, onOpenChannel }) => {
  const [mode, setMode] = useState<'list' | 'create' | 'view'>(initialOrgId ? 'view' : initialCreate ? 'create' : 'list');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Organization | null>(null);
  const [legacyCount, setLegacyCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [createFlow, setCreateFlow] = useState<null | 'elevate' | 'brand'>(initialCreate && !initialOrgId ? 'elevate' : null);
  const [deleting, setDeleting] = useState<Organization | null>(null);

  const loadOrgs = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      setOrgs(await fetchUserOrganizations(user.uid));
      setLegacyCount((await fetchUnmigratedBrands()).length);
    } catch { /* */ }
    setLoading(false);
  }, [user?.uid]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const importBrands = async () => {
    setImporting(true);
    try { await migrateLegacyBrands(); await loadOrgs(); } catch { /* */ }
    setImporting(false);
  };

  const spinUpDemoChurch = async () => {
    setImporting(true);
    try { const o = await createDemoChurch(); await loadOrgs(); if (o) { setActive(o); setMode('view'); } } catch { /* */ }
    setImporting(false);
  };
  useEffect(() => {
    if (!initialOrgId) return;
    // Always-on demo church — static, no Firestore, shows for everyone incl. guests.
    if (initialOrgId === DEMO_CHURCH_ID) { setActive(DEMO_CHURCH); setMode('view'); return; }
    if (initialOrgId === DEMO_BUSINESS_ID) { setActive(DEMO_BUSINESS_ORG); setMode('view'); return; }
    import('../services/organizationService').then(m => m.fetchOrganization(initialOrgId)).then(o => { if (o) { setActive(o); setMode('view'); } });
  }, [initialOrgId]);

  if (mode === 'create') {
    if (createFlow === 'elevate') {
      return <ElevateSetupWizard user={user} onCancel={() => { if (initialCreate) { onBack(); return; } setCreateFlow(null); setMode('list'); }} onCreated={(o) => { setCreateFlow(null); setActive(o); setMode('view'); loadOrgs(); }} />;
    }
    if (createFlow === null) {
      return (
        <div className="min-h-full p-4 sm:p-6 lg:p-12 max-w-2xl mx-auto">
          <button onClick={() => setMode('list')} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest mb-8"><ArrowLeft size={14} /> Cancel</button>
          <h1 className="text-3xl font-black uppercase tracking-tight text-white mb-8">New organization</h1>
          <div className="grid sm:grid-cols-2 gap-3">
            <button onClick={() => setCreateFlow('elevate')} className={`${card} p-6 text-left hover:bg-white/[0.06] transition-all`}>
              <Church size={22} className="text-small-orange mb-3" />
              <span className="block text-sm font-black uppercase tracking-widest text-white mb-1">Elevate</span>
              <span className="text-xs text-white/40">Church, religious, cultural, non-profit or other — with departments, roles and invites.</span>
            </button>
            <button onClick={() => setCreateFlow('brand')} className={`${card} p-6 text-left hover:bg-white/[0.06] transition-all`}>
              <Building2 size={22} className="text-small-orange mb-3" />
              <span className="block text-sm font-black uppercase tracking-widest text-white mb-1">Brand / Business</span>
              <span className="text-xs text-white/40">Brand, business, label or team page.</span>
            </button>
          </div>
        </div>
      );
    }
    return <OrgCreator onCancel={() => { setCreateFlow(null); setMode('list'); }} onCreated={(o) => { setCreateFlow(null); setActive(o); setMode('view'); loadOrgs(); }} />;
  }
  if (mode === 'view' && active) {
    // Demo orgs open a fully-populated tour. Church → ministry tour; everything else
    // (business pages) → the Customer / Employee / Admin business tour.
    if (active.isDemo) {
      const back = () => { setActive(null); setMode('list'); };
      const create = () => { setActive(null); setMode('create'); };
      return active.orgType === 'CHURCH'
        ? <ChurchDemoView onBack={back} onCreate={create} onVisitUser={onVisitUser} />
        : <BusinessDemoView onBack={back} onCreate={create} />;
    }
    return <OrgProfile org={active} isOwner={active.creatorId === user?.uid || !!active.admins?.includes(user?.uid)} initialGive={initialGive} initialContentHq={initialContentHq} onVisitUser={onVisitUser} onOpenVideo={onOpenVideo} onOpenAlbum={onOpenAlbum} onOpenLive={onOpenLive} onOpenChannel={onOpenChannel} onBack={() => { setActive(null); setMode('list'); if (initialOrgId) onBack(); }} onDeleted={() => { setActive(null); setMode('list'); loadOrgs(); if (initialCreate || initialOrgId) onBack(); }} />;
  }

  // ── List ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-12 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8 sm:mb-10">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest shrink-0"><ArrowLeft size={14} /> Back</button>
        <div className="flex flex-wrap items-center gap-2">
          {legacyCount > 0 && (
            <button onClick={importBrands} disabled={importing} className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-white/5 border border-white/15 rounded-full text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40">
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Building2 size={13} />} Import {legacyCount} brand{legacyCount > 1 ? 's' : ''}
            </button>
          )}
          <button onClick={() => { setActive(DEMO_BUSINESS_ORG); setMode('view'); }} className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-white/5 border border-white/15 rounded-full text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10"><Building2 size={14} /> Demo business</button>
          <button onClick={() => setMode('create')} className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:brightness-110"><Plus size={14} /> New organization</button>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-small-orange/15 rounded-2xl shrink-0"><Building2 className="text-small-orange" size={24} /></div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white leading-none truncate">Your organizations</h1>
          <p className={`${TYPE.labelMd} font-bold text-white/40 uppercase tracking-widest mt-1 truncate`}>Brands, businesses, ministries — pages you run</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-white/30" size={28} /></div>
      ) : orgs.length === 0 ? (
        <div className={`${card} p-6 sm:p-12 text-center`}>
          <Building2 size={40} className="mx-auto text-white/15 mb-4" />
          <p className="text-white/50 font-bold mb-1">No organizations yet</p>
          <p className="text-[11px] text-white/30 mb-6">Create a brand, business, or ministry page — a parallel account with its own profile, staff, and community.</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            <button onClick={() => setMode('create')} className="px-5 sm:px-6 py-3 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:brightness-110">Create your first</button>
            <button onClick={spinUpDemoChurch} disabled={importing} className="px-5 sm:px-6 py-3 bg-white/5 border border-white/15 text-white/70 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-40 flex items-center gap-2">
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Church size={13} />} Demo church
            </button>
            <button onClick={() => { setActive(DEMO_BUSINESS_ORG); setMode('view'); }} className="px-5 sm:px-6 py-3 bg-white/5 border border-white/15 text-white/70 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 flex items-center gap-2">
              <Building2 size={13} /> Demo business
            </button>
          </div>
        </div>
      ) : (
        <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="1rem">
          {orgs.map(o => (
            <div key={o.id} className="relative group">
            <button onClick={() => { setActive(o); setMode('view'); }} className={`${card} w-full p-5 text-left hover:bg-white/[0.06] transition-all flex items-center gap-4`}>
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
                {o.logoUrl ? <img src={o.logoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={20} className="text-white/30" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-black text-white truncate">{o.name}</p>
                  {o.isVerified && <Check size={13} className="text-small-orange shrink-0" />}
                </div>
                <p className={`${TYPE.labelSm} font-black uppercase tracking-widest text-small-orange/70 mt-0.5`}>{o.orgType}</p>
                <p className="type-body-sm text-white/40 truncate mt-0.5">{o.tagline || o.about || '—'}</p>
              </div>
              <span className={`${TYPE.labelSm} font-bold text-white/30 flex items-center gap-1 shrink-0 ${o.creatorId === user?.uid && !o.isDemo ? 'mr-8' : ''}`}><Users size={11} /> {o.memberCount ?? 1}</span>
            </button>
            {o.creatorId === user?.uid && !o.isDemo && (
              <button onClick={() => setDeleting(o)} title={`Delete ${o.name}`} aria-label={`Delete ${o.name}`}
                className="absolute top-1/2 -translate-y-1/2 right-4 p-2 rounded-full text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                <Trash2 size={15} />
              </button>
            )}
            </div>
          ))}
        </AdaptiveGrid>
      )}
      {deleting && <DeleteOrgDialog org={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); loadOrgs(); }} />}
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
    <div className="min-h-full p-4 sm:p-6 lg:p-12 max-w-2xl mx-auto">
      <button onClick={onCancel} className={`flex items-center gap-2 text-white/40 hover:text-white ${TYPE.labelMd} font-black uppercase tracking-widest mb-8`}><ArrowLeft size={14} /> Cancel</button>
      <h1 className="text-3xl font-black uppercase tracking-tight text-white mb-2">New organization</h1>
      <p className={`${TYPE.labelMd} font-bold text-white/40 uppercase tracking-widest mb-8`}>A parallel account — its own profile, staff & community</p>

      <div className="space-y-6">
        <div>
          <label className={`${TYPE.labelSm} font-black uppercase tracking-widest text-white/40 mb-2 block`}>Type</label>
          <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="0.5rem">
            {ORG_TYPES.map(t => (
              <button key={t.type} onClick={() => setOrgType(t.type)} title={t.blurb}
                className={`p-3 rounded-2xl border text-left transition-all ${orgType === t.type ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                <span className={`${TYPE.labelMd} font-black uppercase tracking-widest`}>{t.label}</span>
              </button>
            ))}
          </AdaptiveGrid>
          <p className={`${TYPE.labelMd} text-white/30 mt-2`}>{ORG_TYPES.find(t => t.type === orgType)?.blurb}</p>
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

type ElevateOrgTab = 'HOME' | 'MINISTRIES' | 'MOBILIZE' | 'PHOTOS' | 'EVENTS' | 'WATCH' | 'PRAYER' | 'LIBRARY' | 'STAFF' | 'GIVE' | 'SHOP';

function getElevateOrgTabs(orgType?: OrgType): { k: ElevateOrgTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] {
  const faith = isFaithOrg(orgType);
  if (faith) {
    return [
      { k: 'HOME',       label: 'Home',             icon: Home },
      { k: 'MINISTRIES', label: 'Ministries',       icon: Users },
      { k: 'MOBILIZE',   label: 'Serve & Action',   icon: Sparkles },
      { k: 'PHOTOS',     label: 'Photos',           icon: ImageIcon },
      { k: 'EVENTS',     label: 'Events',           icon: Calendar },
      { k: 'WATCH',      label: 'Watch',            icon: Play },
      { k: 'PRAYER',     label: 'Prayer',           icon: HandHeart },
      { k: 'LIBRARY',    label: 'Library',          icon: BookOpen },
      { k: 'STAFF',      label: 'Staff',            icon: Users },
      { k: 'GIVE',       label: 'Give',             icon: Gift },
      { k: 'SHOP',       label: 'Shop',             icon: ShoppingBag },
    ];
  }
  if (orgType === 'NONPROFIT') {
    return [
      { k: 'HOME',       label: 'Home',               icon: Home },
      { k: 'MINISTRIES', label: 'Programs',           icon: Users },
      { k: 'MOBILIZE',   label: 'Take Action',        icon: Sparkles },
      { k: 'PHOTOS',     label: 'Photos',             icon: ImageIcon },
      { k: 'EVENTS',     label: 'Events',             icon: Calendar },
      { k: 'WATCH',      label: 'Watch',              icon: Play },
      { k: 'PRAYER',     label: 'Community Wall',     icon: HandHeart },
      { k: 'LIBRARY',    label: 'Resources',          icon: BookOpen },
      { k: 'STAFF',      label: 'Leadership & Staff', icon: Users },
      { k: 'GIVE',       label: 'Donate',             icon: Gift },
      { k: 'SHOP',       label: 'Shop',               icon: ShoppingBag },
    ];
  }
  if (orgType === 'CULTURAL') {
    return [
      { k: 'HOME',       label: 'Home',                icon: Home },
      { k: 'MINISTRIES', label: 'Exhibits & Programs', icon: Users },
      { k: 'MOBILIZE',   label: 'Docents & Action',    icon: Sparkles },
      { k: 'PHOTOS',     label: 'Gallery',             icon: ImageIcon },
      { k: 'EVENTS',     label: 'Events',              icon: Calendar },
      { k: 'WATCH',      label: 'Watch',               icon: Play },
      { k: 'PRAYER',     label: 'Patron Wall',         icon: HandHeart },
      { k: 'LIBRARY',    label: 'Archives & Library',  icon: BookOpen },
      { k: 'STAFF',      label: 'Curators & Staff',    icon: Users },
      { k: 'GIVE',       label: 'Support',             icon: Gift },
      { k: 'SHOP',       label: 'Gift Shop',           icon: ShoppingBag },
    ];
  }
  return [
    { k: 'HOME',       label: 'Home',              icon: Home },
    { k: 'MINISTRIES', label: 'Departments',       icon: Users },
    { k: 'MOBILIZE',   label: 'Action & Shifts',   icon: Sparkles },
    { k: 'PHOTOS',     label: 'Photos',            icon: ImageIcon },
    { k: 'EVENTS',     label: 'Events',            icon: Calendar },
    { k: 'WATCH',      label: 'Watch',             icon: Play },
    { k: 'PRAYER',     label: 'Community',         icon: HandHeart },
    { k: 'LIBRARY',    label: 'Catalog & Library', icon: BookOpen },
    { k: 'STAFF',      label: 'Team & Staff',      icon: Users },
    { k: 'GIVE',       label: 'Support',           icon: Gift },
    { k: 'SHOP',       label: 'Shop',              icon: ShoppingBag },
  ];
}

const VIOLET = EV.violet;
const VIOLET_SOFT = EV.violetText;

// ── Public / owner org profile (Grace Chapel default layout for all Elevate & Org pages) ──
const OrgProfile: React.FC<{ org: Organization; isOwner: boolean; onBack: () => void; onDeleted?: () => void; initialGive?: boolean; initialContentHq?: boolean; onVisitUser?: (uid: string) => void; ownAccount?: boolean } & OrgMediaOpeners> = ({ org: initialOrg, isOwner, onBack, onDeleted, initialGive, initialContentHq, onVisitUser, onOpenVideo, onOpenAlbum, onOpenLive, onOpenChannel, ownAccount }) => {
  const [org, setOrg] = useState<Organization>(initialOrg);
  const [staff, setStaff] = useState<OrgMembership[]>([]);
  const [managing, setManaging] = useState(false);
  const [elevateLive, setElevateLive] = useState(false);
  const [giving, setGiving] = useState(!!initialGive);
  const [openings, setOpenings] = useState<JobPosting[]>([]);
  const [applyFor, setApplyFor] = useState<JobPosting | null>(null);
  const [showCareers, setShowCareers] = useState(false);
  const [fundGiven, setFundGiven] = useState<Record<string, number>>({});
  // Grace Chapel model: Public Page (with Hero + Sticky Tabs + Persistent Stream Carousel) is the default layout,
  // with Edition I Member Hub and Operations right in the top bar.
  const [view, setView] = useState<'member' | 'public' | 'ops'>(
    initialContentHq ? 'ops' : 'public'
  );
  const [tab, setTab] = useState<ElevateOrgTab>('HOME');
  const [following, setFollowing] = useState(false);
  const [openMinistry, setOpenMinistry] = useState<string | null>(null);
  useEffect(() => listenFollowedState(org.id, s => setFollowing(s.org)), [org.id]);
  const reloadStaff = useCallback(() => { fetchOrgMembers(org.id).then(setStaff).catch(() => {}); }, [org.id]);
  useEffect(() => { reloadStaff(); }, [reloadStaff]);
  useEffect(() => { fetchOrgPostings(org.id).then(ps => setOpenings(ps.filter(p => p.status === 'OPEN'))).catch(() => {}); }, [org.id]);
  useEffect(() => {
    if (isElevateOrg(org.orgType)) fetchChurchDonations(org.id).then(d => setFundGiven(sumDonationsByFund(d))).catch(() => {});
  }, [org.id, org.orgType]);

  const myMembership = staff.find(m => m.userId === auth.currentUser?.uid) ||
    (isOwner && auth.currentUser
      ? { id: '', orgId: org.id, userId: auth.currentUser.uid, role: 'OWNER' as OrgRole, status: 'ACTIVE' as const, displayName: '', joinedAt: 0 }
      : null);
  const elevate = isElevateOrg(org.orgType);
  const faith = isFaithOrg(org.orgType);
  const can = (p: Parameters<typeof elevateCan>[2]) => isOwner || elevateCan(myMembership, org, p);
  const hasOps = isOwner || (['MANAGE_ROSTER', 'MANAGE_MINISTRIES', 'MANAGE_INVITES', 'MANAGE_GIVING', 'VIEW_GIVING', 'VIEW_PRAYER', 'MANAGE_SERMONS', 'MANAGE_MEDIA', 'MODERATE_THREADS', 'MANAGE_STORE', 'MANAGE_EMPLOYEES', 'POST_AS_ORG'] as const).some(p => elevateCan(myMembership, org, p));
  const toggleFollow = async () => {
    if (!auth.currentUser) { alert('Sign in to follow.'); return; }
    try { following ? await unfollowOrg(org.id) : await followOrg(org.id); } catch (e: any) { alert(e?.message || 'Could not update follow.'); }
  };

  const orgTabs = getElevateOrgTabs(org.orgType);
  const ministriesLabel = orgTabs.find(t => t.k === 'MINISTRIES')?.label || 'Ministries';
  // Only the demo church borrows sample content; a real org shows what it has actually set up.
  const demo = isDemoOrg(org);
  const ownMinistries = (org.ministries || []).filter(m => !m.isInternal && !m.parentId);
  const effectiveMinistries = ownMinistries.length > 0 || !demo ? ownMinistries : defaultMinistries(org.orgType || 'CHURCH').filter(m => !m.isInternal);
  const effectiveServiceTimes = org.serviceTimes?.length ? org.serviceTimes : demo ? (DEMO_CHURCH.serviceTimes || []) : [];
  const effectiveGivingFunds = org.givingFunds?.length ? org.givingFunds : demo ? (DEMO_CHURCH.givingFunds || []) : [];
  const emptyNote = (text: string) => <div className="ev-panel p-6 text-[15px] text-[#A49CB2]">{text}</div>;

  if (managing && isOwner) {
    return <OrgManage org={org} staff={staff} onClose={() => setManaging(false)} onSaved={setOrg} reloadStaff={reloadStaff} onDeleted={onDeleted} />;
  }
  if (elevateLive && isOwner) {
    return <ChurchMasterControl church={org} onClose={() => setElevateLive(false)} defaultMode="elevate" />;
  }
  if (giving) {
    return <ChurchGive org={org} fundGiven={fundGiven} onClose={() => setGiving(false)} />;
  }
  if (showCareers) {
    return <CareersView org={org} onBack={() => setShowCareers(false)} />;
  }

  // Public page · Member home · Staff — identical on every Elevate / Org page (Grace Chapel model).
  const MODES = [
    { k: 'public', label: faith ? 'Public page' : `Public ${(org.orgKindLabel || 'page').toLowerCase()}` },
    { k: 'member', label: 'Member home' },
    ...(hasOps ? [{ k: 'ops', label: 'Staff' }] : []),
  ];
  const modeToggle = (
    <EvModeBar
      modes={MODES}
      value={view}
      onChange={k => setView(k as typeof view)}
      onBack={onBack}
      trailing={<>
        {hasOps && <CreateEventButton compact host={{ kind: 'org', id: org.id, label: org.name }} />}
        {ownAccount && (
          // This org page is the signed-in account's profile — switching to a non-org type restores the personal profile.
          <button onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'SETTINGS', params: { tab: 'ACCOUNT' } } }))}
            title="Change account type" className="ev-btn ev-btn-ghost" style={{ minHeight: 36, padding: '0 12px', fontSize: 13 }}>
            <KeyRound size={13} /> Account type
          </button>
        )}
        {isOwner && (
          <button onClick={() => setElevateLive(true)} className="ev-btn ev-btn-ghost" style={{ minHeight: 36, padding: '0 12px', fontSize: 13 }}>
            <Radio size={13} /> Elevate Live
          </button>
        )}
        {isOwner && (
          <button onClick={() => setManaging(true)} className="ev-btn ev-btn-ghost" style={{ minHeight: 36, padding: '0 12px', fontSize: 13 }}>
            <Pencil size={13} /> Manage
          </button>
        )}
      </>}
    />
  );

  if (view === 'ops' && hasOps) {
    return (
      <EvScope className="min-h-full">
        {modeToggle}
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-white/30" size={24} /></div>}>
          <div key="ops" className="ev-fade">
          <ElevateOps org={org} isOwner={isOwner} onClose={() => setView('public')} onOrgChange={setOrg} onVisitUser={onVisitUser} initialTool={initialContentHq ? 'hq' : undefined} />
          </div>
        </Suspense>
      </EvScope>
    );
  }

  if (view === 'member') {
    return (
      <EvScope className="min-h-full">
        {modeToggle}
        <div key="member" className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 ev-fade">
          <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-white/30" size={24} /></div>}>
            <ChurchMemberHub
              org={org}
              membership={myMembership}
              user={auth.currentUser}
              onOpenGive={() => setGiving(true)}
              onOpenMinistry={id => { setView('public'); setTab('MINISTRIES'); setOpenMinistry(id); }}
            />
          </Suspense>
        </div>
      </EvScope>
    );
  }

  const ministryOpen = openMinistry
    ? (org.ministries?.find(m => m.id === openMinistry) || effectiveMinistries.find(m => m.id === openMinistry))
    : undefined;
  const pill = { minHeight: 44 };

  return (
    <EvScope className="min-h-full">
      {modeToggle}

      {/* ── Hero: wordmark, display tagline, gatherings, the four relationships (follow · claim · join · give) ── */}
      <EvHero
        name={org.name}
        logoUrl={org.logoUrl}
        meta={[org.denomination || org.orgKindLabel, org.location?.city, `${org.memberCount ?? Math.max(1, staff.length)} members`].filter(Boolean).join(' · ')}
        tagline={org.tagline || `${org.name}. Welcome home.`}
        intro={org.tagline ? org.about : undefined}
        times={effectiveServiceTimes.map(s => ({ id: s.id, label: `${s.label}${s.isOnline ? ' · also online' : ''}`, day: s.day === 'Sunday' ? 'Sun' : s.day?.slice(0, 3), time: s.time }))}
        coverUrl={heroImage(org.coverUrl || (demo ? DEMO_CHURCH.coverUrl : undefined))}
        actions={<>
          {myMembership?.status === 'ACTIVE' ? (
            <span className="ev-btn" style={{ ...pill, background: 'rgba(127,216,176,0.12)', color: EV.success }}>
              <UserCheck size={14} /> Member{myMembership.memberNumber ? ` · ${myMembership.memberNumber}` : ''}
            </span>
          ) : myMembership?.status === 'PENDING' ? (
            <span className="ev-btn" style={{ ...pill, background: 'rgba(255,159,90,0.12)', color: EV.warn }}>
              <Clock size={14} /> Pending approval
            </span>
          ) : (
            <>
              <button onClick={() => openElevateGatewayModal({ orgKey: org.slug || org.id, mode: 'join' })} className="ev-btn ev-btn-primary">
                Join {org.name}
              </button>
              <button onClick={() => openElevateGatewayModal({ orgKey: org.slug || org.id, mode: 'claim' })} className="ev-btn ev-btn-ghost" title="Your church already added you — claim your seat">
                <KeyRound size={14} /> Claim my account
              </button>
            </>
          )}
          <button onClick={toggleFollow} title="Follow for public updates and streams (no approval required)" className="ev-btn ev-btn-ghost">
            {following ? <><Check size={14} /> Following</> : 'Follow'}
          </button>
          <button onClick={() => setGiving(true)} className="ev-btn ev-btn-light">
            <Gift size={14} /> {orgTabs.find(t => t.k === 'GIVE')?.label || 'Give'}
          </button>
          {org.socialLinks?.website && <a href={org.socialLinks.website} target="_blank" rel="noopener noreferrer" className="ev-btn" style={{ color: EV.violetText, paddingLeft: 6, paddingRight: 6, fontWeight: 500 }}><Globe size={14} /> Website</a>}
        </>}
      />

      {/* ── Sticky section tabs (names tailored to org type) ── */}
      <EvTabs tabs={orgTabs.map(t => ({ k: t.k, label: t.label }))} value={ministryOpen ? null : tab} onChange={k => { setTab(k as ElevateOrgTab); setOpenMinistry(null); }} top={52} />

      {/* ── Main Content Container with Persistent Live Stream Carousel Under the Tabs ── */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-10 space-y-8">
        {/* PERSISTENT LIVE STREAM THUMBNAIL CAROUSEL (Always mounted under the tabs so users can hop in and watch from anywhere on the org page without interrupting playback) */}
        {/* Always-on window: a live stream or the org's TV Live Hub+ channel plays here, muted. */}
        <RelloChurchViewer
          org={org}
          defaultPlayerExpanded={false}
          viewerIsOrgMember={myMembership?.status === 'ACTIVE'}
          onOpenOnAir={item => {
            if (item.feed) {
              if (onOpenLive) onOpenLive(item.feed);
              else window.dispatchEvent(new CustomEvent('PLAY_LIVE_FEED', { detail: { feed: item.feed } }));
            } else if (item.channel) onOpenChannel?.(item.channel.ownerId, item.channel.sourceId);
          }}
        />

        {applyFor && <ApplyModal posting={applyFor} orgName={org.name} onClose={() => setApplyFor(null)} />}

        <div key={openMinistry || tab} className="ev-fade space-y-8">
        {/* ── Ministry / Department Drill-Down (inline below the persistent stream carousel!) ── */}
        {ministryOpen ? (
          <div className="space-y-4">
            <MinistryPage
              org={org}
              ministry={ministryOpen}
              myMembership={myMembership}
              onBack={() => setOpenMinistry(null)}
              onVisitUser={onVisitUser}
              onOrgChange={setOrg}
            />
          </div>
        ) : (
          <>
            {/* ── TAB 1: HOME ── */}
            {tab === 'HOME' && (
              <AdaptiveGrid phone={1} tablet={1} desktop={3} gap="1.5rem">
                <div className="lg:col-span-2 space-y-5">
                  <ChurchAnnouncements orgId={org.id} orgName={org.name} orgPhoto={org.logoUrl || ''} isOwner={isOwner} canPost={can('POST_AS_ORG')} />
                  <OrgThread org={org} myMembership={myMembership} onVisitUser={onVisitUser} onOrgChange={setOrg} readOnly={!myMembership || myMembership.status !== 'ACTIVE'} />
                  {demo && <div className="space-y-3">
                    <p className={TYPE.labelSm} style={{ color: VIOLET_SOFT }}>Latest from {org.name}</p>
                    {DEMO_CHURCH_FEED.map(p => (
                      <div key={p.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                        <div className="flex items-center gap-2.5 mb-2">
                          <img src={p.authorPhoto} className="w-9 h-9 rounded-full object-cover border border-white/10" alt="" />
                          <div><p className={`${TYPE.titleSm} text-white`}>{p.author}</p><p className={`${TYPE.labelSm} text-white/35`}>{p.when} ago</p></div>
                        </div>
                        <p className="text-sm text-white/80 leading-relaxed">{p.text}</p>
                        {p.image && <img src={p.image} className="w-full max-h-72 object-cover rounded-xl mt-3 border border-white/10" alt="" loading="lazy" />}
                        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-white/6 text-white/40">
                          <span className="flex items-center gap-1.5 text-[11px] font-bold"><Heart size={13} /> {p.likes}</span>
                          <span className="flex items-center gap-1.5 text-[11px] font-bold"><MessageSquare size={13} /> {p.comments}</span>
                        </div>
                      </div>
                    ))}
                  </div>}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                    <p className={`${TYPE.labelMd} text-white/40 mb-3`}>
                      {faith ? 'Service times' : org.orgType === 'CULTURAL' ? 'Hours & Gatherings' : 'Schedule & Gatherings'}
                    </p>
                    {effectiveServiceTimes.length === 0 && (
                      <p className="text-sm text-[#A49CB2] m-0">{isOwner || hasOps ? 'Add your service times in Manage so visitors know when to come.' : 'Service times haven’t been posted yet.'}</p>
                    )}
                    {effectiveServiceTimes.map(s => (
                      <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-white/6 last:border-0">
                        <span className="type-body-md text-white/70">{s.label}</span>
                        <span className="type-body-sm font-black text-white tabular-nums">{s.day} · {s.time}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                    <p className={`${TYPE.labelMd} text-white/40 mb-3`}>Coming up</p>
                    {!demo ? (
                      <HostEventsPublic host={{ kind: 'org', id: org.id, name: org.name }} accent={VIOLET} limit={2} emptyText="Nothing on the calendar yet." onOpenEvent={() => setTab('EVENTS')} />
                    ) : (
                    <div className="space-y-2">
                      {DEMO_CHURCH_EVENTS.slice(0, 2).map(e => (
                        <button key={e.id} onClick={() => setTab('EVENTS')} className="w-full text-left flex items-center gap-2 group">
                          <img src={e.image} className="w-12 h-12 rounded-lg object-cover" alt="" />
                          <div className="min-w-0">
                            <p className="type-body-md font-bold text-white truncate group-hover:text-violet-300">{e.title}</p>
                            <p className="text-[10px] text-white/40">{e.date}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    )}
                  </div>

                  {openings.length > 0 && (
                    <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className={`${TYPE.labelMd} text-white/40`}>
                          {elevate ? 'Get Involved' : 'Careers'}
                        </p>
                        <button onClick={() => setShowCareers(true)} className="text-[9px] font-black uppercase tracking-widest text-small-orange">All →</button>
                      </div>
                      {openings.slice(0, 3).map(p => (
                        <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                          <span className="text-xs font-bold text-white truncate">{p.title}</span>
                          <button onClick={() => setApplyFor(p)} className="px-2.5 py-1 rounded-full bg-small-orange text-black text-[9px] font-black uppercase tracking-widest shrink-0">
                            {p.postingType === 'VOLUNTEER' ? 'Sign up' : 'Apply'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AdaptiveGrid>
            )}

            {/* ── TAB 2: MINISTRIES / PROGRAMS / EXHIBITS / DEPARTMENTS ── */}
            {tab === 'MINISTRIES' && effectiveMinistries.length === 0 && emptyNote(
              isOwner || hasOps ? `No ${ministriesLabel.toLowerCase()} yet. Add them in Staff → ${ministriesLabel}.` : `${org.name} hasn’t listed its ${ministriesLabel.toLowerCase()} yet.`
            )}
            {tab === 'MINISTRIES' && effectiveMinistries.length > 0 && (
              <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="0.75rem">
                {effectiveMinistries.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setOpenMinistry(m.id)}
                    className="text-left rounded-2xl p-5 bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.06] transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-3xl">{m.iconEmoji || '✨'}</span>
                      <span className={`${TYPE.labelSm} px-2 py-0.5 rounded-full`} style={{ color: VIOLET_SOFT, background: 'rgba(122, 31, 192,0.12)' }}>
                        Live space
                      </span>
                    </div>
                    <h4 className="text-base font-black text-white mb-0.5 group-hover:text-violet-200">{m.name}</h4>
                    {m.description && <p className="type-body-sm text-white/45 leading-snug mb-2">{m.description}</p>}
                    {m.meetingTime && <span className={`flex items-center gap-1 ${TYPE.labelMd} text-white/35`}><Clock size={10} /> {m.meetingTime}</span>}
                    <span className={`flex items-center gap-1 ${TYPE.labelMd} mt-3`} style={{ color: VIOLET_SOFT }}>
                      Open {ministriesLabel.toLowerCase()} space <ArrowRight size={11} />
                    </span>
                  </button>
                ))}
              </AdaptiveGrid>
            )}

            {/* ── TAB 2B: MOBILIZE, VOLUNTEER SHIFTS, SPOKES & COVENANTS ── */}
            {tab === 'MOBILIZE' && (
              <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" size={24} /></div>}>
                <ElevateMobilizeHub
                  org={org}
                  currentUserId={auth.currentUser?.uid || (demo ? 'demo-member-elena' : '')}
                  currentUserName={myMembership?.displayName || auth.currentUser?.displayName || (demo ? 'Elena Sterling' : 'Guest')}
                  currentUserEmail={auth.currentUser?.email || undefined}
                  canManage={hasOps}
                  initialContext="public"
                />
              </Suspense>
            )}

            {/* ── TAB 3: PHOTOS / GALLERY ── */}
            {tab === 'PHOTOS' && (
              <div className="space-y-8">
                <OrgMediaShelves org={org} isOwner={isOwner} canManage={can('MANAGE_CONTENT')} onOrgChange={setOrg} onVisitUser={onVisitUser} onOpenVideo={onOpenVideo} onOpenAlbum={onOpenAlbum} />
                {demo && <EvGallery albums={DEMO_CHURCH_ALBUMS} perAlbum={9} />}
              </div>
            )}

            {/* ── TAB 4: EVENTS ── */}
            {tab === 'EVENTS' && (
              <div className="space-y-4">
                {hasOps && (
                  <div className="flex justify-end">
                    <CreateEventButton host={{ kind: 'org', id: org.id, label: org.name }} />
                  </div>
                )}
                {!demo ? (
                  <HostEventsPublic host={{ kind: 'org', id: org.id, name: org.name }} accent={VIOLET} emptyText={hasOps ? 'No events yet. Create one, or start from a playbook in Staff → Events.' : 'No upcoming events right now. Check back soon.'} />
                ) : (
                <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="1rem">
                  {DEMO_CHURCH_EVENTS.map(e => (
                    <div key={e.id} className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10">
                      <img src={e.image} className="w-full h-40 object-cover" alt="" loading="lazy" />
                      <div className="p-4">
                        <div className={`flex items-center gap-2 ${TYPE.labelSm} mb-1`} style={{ color: VIOLET_SOFT }}><Calendar size={10} /> {e.date} · {e.time}</div>
                        <h4 className="text-base font-black text-white mb-1">{e.title}</h4>
                        <p className="type-body-md text-white/50 leading-snug mb-2">{e.blurb}</p>
                        <div className="flex items-center justify-between">
                          <span className={`flex items-center gap-1 ${TYPE.labelMd} text-white/40`}><MapPin size={10} /> {e.location}</span>
                          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${TYPE.labelMd} text-white`} style={{ background: VIOLET }}>
                            <Ticket size={11} /> {e.price === 'FREE' ? 'Reserve · Free' : `Tickets · $${e.price}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </AdaptiveGrid>
                )}
              </div>
            )}

            {/* ── TAB 5: WATCH ── */}
            {tab === 'WATCH' && (
              <div className="space-y-6">
                {faith && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('OPEN_FOLLOW_ALONG', { detail: {} }))}
                    className="w-full text-left p-4 rounded-2xl border transition-all hover:brightness-110"
                    style={{ borderColor: 'rgba(226, 194, 126,0.35)', background: 'linear-gradient(135deg, rgba(226, 194, 126,0.12), rgba(122, 31, 192,0.08))' }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Radio size={14} style={{ color: '#E2C27E' }} />
                      <span className={`${TYPE.labelMd} text-white`}>Follow along with the service</span>
                      <span className="ml-auto px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest" style={{ background: 'rgba(226, 194, 126,0.2)', color: '#E2C27E' }}>Live</span>
                    </div>
                    <p className="type-body-sm text-white/50 leading-relaxed">
                      Whether you’re in the room or watching from home, your phone turns to each passage as it’s read — and saves it to your notes with the moment it happened.
                    </p>
                  </button>
                )}
                <OrgMediaShelves org={org} isOwner={isOwner} canManage={can('MANAGE_CONTENT')} onOrgChange={setOrg} onVisitUser={onVisitUser} onOpenVideo={onOpenVideo} onOpenAlbum={onOpenAlbum} />
                {demo && <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="1rem">
                  {DEMO_CHURCH_VIDEOS.map(v => (
                    <div key={v.id} className="text-left group">
                      <div className="relative rounded-2xl overflow-hidden border border-white/10 aspect-video">
                        <img src={v.thumb} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" loading="lazy" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center"><Play size={20} className="text-white ml-0.5" /></div></div>
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-black text-white tabular-nums">{v.duration}</span>
                      </div>
                      <p className={`${TYPE.labelSm} mt-2`} style={{ color: VIOLET_SOFT }}>{v.series}</p>
                      <p className="text-sm font-bold text-white leading-tight">{v.title}</p>
                      <p className="text-[10px] text-white/35">{v.date}</p>
                    </div>
                  ))}
                </AdaptiveGrid>}
              </div>
            )}

            {/* ── TAB 6: PRAYER / COMMUNITY WALL ── */}
            {tab === 'PRAYER' && (
              <div className="max-w-3xl space-y-6">
                <ChurchPrayerWall orgId={org.id} isOwner={isOwner} canSeePrivate={can('VIEW_PRAYER')} canManage={can('MANAGE_PRAYER')} />
              </div>
            )}

            {/* ── TAB 7: LIBRARY / RESOURCES ── */}
            {tab === 'LIBRARY' && (
              <div className="space-y-8">
                {faith && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      { icon: BookOpen, title: 'Read Scripture', sub: 'KJV · Vulgate · Greek · Hebrew, side by side', ev: 'OPEN_BIBLE' },
                      { icon: Radio, title: 'Follow along', sub: 'Your phone turns to each passage in service', ev: 'OPEN_FOLLOW_ALONG' },
                      { icon: NotebookPen, title: 'Service notes', sub: 'Every passage you’ve been taught, by day', ev: 'OPEN_BIBLE' },
                    ].map(({ icon: Icon, title, sub, ev }) => (
                      <button
                        key={title}
                        onClick={() => window.dispatchEvent(new CustomEvent(ev, { detail: {} }))}
                        className="text-left p-3.5 rounded-2xl border transition-all hover:brightness-125"
                        style={{ borderColor: 'rgba(226, 194, 126,0.28)', background: 'rgba(226, 194, 126,0.05)' }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon size={14} style={{ color: '#E2C27E' }} />
                          <span className={`${TYPE.labelMd} text-white`}>{title}</span>
                        </div>
                        <p className="type-body-sm text-white/45 leading-snug">{sub}</p>
                      </button>
                    ))}
                  </div>
                )}

                {faith && (
                  <section aria-label="Classes and studies">
                    <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/50 mb-3">Classes and studies</h2>
                    <ChurchEducation church={org} canEdit={can('MANAGE_CONTENT')} />
                  </section>
                )}

                {demo && <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="type-title-sm text-white/55 max-w-md">A reading list curated by {org.name}, powered by Lorea.</p>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('OPEN_BIBLE', { detail: {} }))}
                      className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full ${TYPE.labelMd} text-white`}
                      style={{ background: 'rgba(122, 31, 192,0.15)', border: '1px solid rgba(122, 31, 192,0.3)' }}
                    >
                      <BookOpen size={12} style={{ color: VIOLET_SOFT }} /> Sacred Library <ExternalLink size={11} />
                    </button>
                  </div>
                  <AdaptiveGrid phone={2} tablet={4} desktop={5} gap="1rem">
                    {DEMO_CHURCH_LIBRARY.map(b => (
                      <div key={b.id} className="text-left group">
                        <div className="rounded-xl overflow-hidden border border-white/10 aspect-[3/4] shadow-lg">
                          <img src={b.cover} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" loading="lazy" />
                        </div>
                        <p className="type-body-md font-bold text-white leading-tight mt-2 line-clamp-2">{b.title}</p>
                        <p className="text-[10px] text-white/40">{b.author}</p>
                      </div>
                    ))}
                  </AdaptiveGrid>
                </div>}
              </div>
            )}

            {/* ── TAB 8: STAFF & LEADERSHIP ── */}
            {tab === 'STAFF' && (
              <div className="space-y-8">
                <Suspense fallback={null}><ElevateRosters org={org} onVisitUser={onVisitUser} /></Suspense>
                {staff.length > 0 ? (
                  <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem">
                    {staff.filter(m => m.status === 'ACTIVE').map(m => (
                      <div key={m.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 flex items-center gap-3">
                        <button
                          onClick={() => m.userId && onVisitUser?.(m.userId)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left group"
                        >
                          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/10 border border-white/10 shrink-0 grid place-items-center text-lg font-black text-white/50">
                            {(m.orgPhotoUrl || m.photoUrl) ? <img src={m.orgPhotoUrl || m.photoUrl} className="w-full h-full object-cover" alt="" /> : m.displayName.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-white truncate group-hover:text-violet-200">{m.displayName}</p>
                            <p className={`${TYPE.labelMd} mb-1`} style={{ color: VIOLET_SOFT }}>{m.title || m.role}</p>
                            {m.aboutInOrg && <p className="type-body-sm text-white/45 leading-snug line-clamp-2">{m.aboutInOrg}</p>}
                          </div>
                        </button>
                      </div>
                    ))}
                  </AdaptiveGrid>
                ) : !demo ? emptyNote(`${org.name} hasn’t listed its team yet.`) : (
                  <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem">
                    {DEMO_CHURCH_STAFF.map(s => (
                      <div key={s.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 flex items-center gap-3">
                        <img src={s.photo} className="w-14 h-14 rounded-2xl object-cover border border-white/10 shrink-0" alt="" loading="lazy" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-white truncate">{s.name}</p>
                          <p className={`${TYPE.labelMd} mb-1`} style={{ color: VIOLET_SOFT }}>{s.role}</p>
                          {s.bio && <p className="type-body-sm text-white/45 leading-snug line-clamp-2">{s.bio}</p>}
                        </div>
                      </div>
                    ))}
                  </AdaptiveGrid>
                )}
              </div>
            )}

            {/* ── TAB 9: GIVE / DONATE / SUPPORT ── */}
            {tab === 'GIVE' && (
              <div className="space-y-8">
                <div className="space-y-4 max-w-xl">
                  <p className="type-title-sm text-white/55">
                    {effectiveGivingFunds.length ? 'Give to a fund below — one-time or recurring.' : 'Give one-time or recurring.'} Direct payout to {org.name}.
                  </p>
                  {effectiveGivingFunds.length === 0 && (
                    <button onClick={() => setGiving(true)} className="ev-btn ev-btn-primary">
                      <Gift size={14} /> {orgTabs.find(t => t.k === 'GIVE')?.label || 'Give'} to {org.name}
                    </button>
                  )}
                  {effectiveGivingFunds.map(f => {
                    const raised = (f.raised || 0) + (fundGiven[f.name] || 0);
                    const pct = f.goal ? Math.min(100, Math.round((raised / f.goal) * 100)) : 0;
                    return (
                      <div key={f.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-black text-white">{f.name}</h4>
                          <button onClick={() => setGiving(true)} className={`px-4 py-1.5 rounded-full ${TYPE.labelMd} text-white`} style={{ background: VIOLET }}>
                            {orgTabs.find(t => t.k === 'GIVE')?.label || 'Give'}
                          </button>
                        </div>
                        {f.description && <p className="type-body-sm text-white/45 mb-3">{f.description}</p>}
                        {f.goal ? (
                          <>
                            <div className="h-2 rounded-full bg-black/40 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: VIOLET }} /></div>
                            <div className={`flex justify-between mt-1.5 ${TYPE.labelMd} text-white/40 tabular-nums`}>
                              <span style={{ color: VIOLET_SOFT }}>${raised.toLocaleString()} raised</span>
                              <span>of ${f.goal.toLocaleString()}</span>
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TAB 10: SHOP (org merch: same live catalog as the org's register, kiosk and screens) ── */}
            {tab === 'SHOP' && (
              <OrgStoreSection org={org} mode="public" canManage={can('MANAGE_STORE')} accent={VIOLET} onVisitUser={onVisitUser} onOrgChange={setOrg} />
            )}
          </>
        )}
        </div>
        <div className="h-16" />
      </div>
    </EvScope>
  );
};

// ── Owner management: edit details + staff/roles ────────────────────────────
const ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'STAFF', 'MODERATOR', 'MEMBER'];

const OrgManage: React.FC<{ org: Organization; staff: OrgMembership[]; onClose: () => void; onSaved: (o: Organization) => void; reloadStaff: () => void; onDeleted?: () => void }> = ({ org, staff, onClose, onSaved, reloadStaff, onDeleted }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = !org.isDemo && org.creatorId === auth.currentUser?.uid;
  const [name, setName] = useState(org.name);
  const [tagline, setTagline] = useState(org.tagline || '');
  const [about, setAbout] = useState(org.about || '');
  const [category, setCategory] = useState(org.category || '');
  const [website, setWebsite] = useState(org.socialLinks?.website || '');
  const [isPrivate, setIsPrivate] = useState(!!org.isPrivate);
  const [monthly, setMonthly] = useState<string>(org.monthlyPrice ? String(org.monthlyPrice) : '');
  const [givingUrl, setGivingUrl] = useState(org.givingUrl || '');
  const [ministries, setMinistries] = useState(org.ministries || []);
  const [services, setServices] = useState(org.serviceTimes || []);
  const [funds, setFunds] = useState(org.givingFunds || []);
  const [campuses, setCampuses] = useState(org.campuses || []);
  const [stripeAcct, setStripeAcct] = useState(org.stripeAccountId || '');
  const [newMin, setNewMin] = useState({ name: '', meetingTime: '' });
  const [newSvc, setNewSvc] = useState({ label: '', day: '', time: '' });
  const [newFund, setNewFund] = useState({ name: '', goal: '' });
  const [newCampus, setNewCampus] = useState({ name: '', location: '' });
  const isChurch = org.orgType === 'CHURCH';
  const busyId = () => Math.random().toString(36).slice(2, 9);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const saveDetails = async () => {
    setBusy(true);
    try {
      const patch: Partial<Organization> = {
        name: name.trim() || org.name, tagline: tagline.trim(), about: about.trim(),
        category: category.trim() || undefined, isPrivate,
        socialLinks: { ...(org.socialLinks || {}), website: website.trim() || undefined },
        monthlyPrice: monthly ? Number(monthly) : undefined,
        ...(isChurch ? { ministries, serviceTimes: services, givingFunds: funds, campuses, givingUrl: givingUrl.trim() || undefined, stripeAccountId: stripeAcct.trim() || undefined } : {}),
      };
      await updateOrganization(org.id, patch);
      onSaved({ ...org, ...patch } as Organization);
    } catch { alert('Could not save.'); }
    setBusy(false);
  };

  const doSearch = async () => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try { setResults((await searchUserProfiles(q.trim())).filter((u: any) => !staff.some(s => s.userId === u.uid)).slice(0, 6)); } catch { /* */ }
    setSearching(false);
  };

  const addStaff = async (u: any) => {
    await addOrgMember(org.id, { userId: u.uid, displayName: u.displayName || 'Member', photoUrl: u.photoURL, role: 'STAFF' });
    setQ(''); setResults([]); reloadStaff();
  };

  return (
    <div className="min-h-full p-6 lg:p-12 max-w-2xl mx-auto">
      <button onClick={onClose} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest mb-8"><ArrowLeft size={14} /> Done</button>
      <h1 className="text-3xl font-black uppercase tracking-tight text-white mb-1">Manage {org.name}</h1>
      <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-8">Details, membership & staff</p>

      <section className="space-y-4 mb-10">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Details</h2>
        <IdentityEditor org={org} onSaved={onSaved} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className={field} />
        <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Tagline" className={field} />
        <textarea value={about} onChange={e => setAbout(e.target.value)} rows={3} placeholder="About" className={`${field} resize-none`} />
        <div className="grid sm:grid-cols-2 gap-4">
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category" className={field} />
          <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Website" className={field} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <button onClick={() => setIsPrivate(p => !p)} className={`px-4 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${isPrivate ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{isPrivate ? 'Private' : 'Public'}</button>
          <input value={monthly} onChange={e => setMonthly(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Monthly membership $ (optional)" className={field} />
        </div>
        <button onClick={saveDetails} disabled={busy} className="w-full py-4 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save details'}
        </button>
      </section>

      {isChurch && (
        <section className="mb-10">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-3 flex items-center gap-2"><Church size={13} /> Church</h2>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-2"><Gift size={11} /> Giving funds</p>
          <div className="space-y-2 mb-3">
            {funds.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                <span className="flex-1 text-xs font-bold text-white">{f.name}{typeof f.goal === 'number' && f.goal > 0 ? <span className="text-white/30 font-medium"> · goal ${f.goal.toLocaleString()}</span> : ''}</span>
                <button onClick={() => setFunds(fs => fs.filter(x => x.id !== f.id))} className="text-white/30 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <input value={newFund.name} onChange={e => setNewFund(v => ({ ...v, name: e.target.value }))} placeholder="Fund name (e.g. Missions)" className={field} />
            <input value={newFund.goal} onChange={e => setNewFund(v => ({ ...v, goal: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Goal $ (opt)" className={`${field} max-w-[35%]`} />
            <button onClick={() => { if (newFund.name.trim()) { setFunds(fs => [...fs, { id: busyId(), name: newFund.name.trim(), goal: newFund.goal ? Number(newFund.goal) : undefined, raised: 0 }]); setNewFund({ name: '', goal: '' }); } }}
              className="px-4 rounded-2xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 shrink-0">Add</button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <input value={stripeAcct} onChange={e => setStripeAcct(e.target.value.trim())} placeholder="Stripe payout account (acct_…)" className={field} />
            <button type="button" onClick={async () => { const t = await auth.currentUser?.getIdToken(); if (t) connectStripe({ orgId: org.id, userIdToken: t }).catch(e => alert(e?.message || 'Could not start Stripe onboarding')); }}
              className="px-4 py-3 rounded-2xl bg-[#635bff] text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 shrink-0 whitespace-nowrap">Connect Stripe</button>
          </div>
          {stripeAcct && <p className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-3 flex items-center gap-1.5"><Check size={11} /> Payouts connected — giving routes to this account</p>}
          <input value={givingUrl} onChange={e => setGivingUrl(e.target.value)} placeholder="External giving link (optional — overrides native Stripe giving)" className={`${field} mb-5`} />

          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-2"><Church size={11} /> Ministries</p>
          <div className="space-y-2 mb-3">
            {ministries.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                <span className="flex-1 text-xs font-bold text-white">{m.name}{m.meetingTime ? <span className="text-white/30 font-medium"> · {m.meetingTime}</span> : ''}</span>
                <button onClick={() => setMinistries(ms => ms.filter(x => x.id !== m.id))} className="text-white/30 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-6">
            <input value={newMin.name} onChange={e => setNewMin(v => ({ ...v, name: e.target.value }))} placeholder="Ministry name" className={field} />
            <input value={newMin.meetingTime} onChange={e => setNewMin(v => ({ ...v, meetingTime: e.target.value }))} placeholder="Meets…" className={`${field} max-w-[40%]`} />
            <button onClick={() => { if (newMin.name.trim()) { setMinistries(ms => [...ms, { id: busyId(), name: newMin.name.trim(), meetingTime: newMin.meetingTime.trim() || undefined }]); setNewMin({ name: '', meetingTime: '' }); } }}
              className="px-4 rounded-2xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 shrink-0">Add</button>
          </div>

          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-2"><Clock size={11} /> Service times</p>
          <div className="space-y-2 mb-3">
            {services.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                <span className="flex-1 text-xs font-bold text-white">{s.label} <span className="text-white/30 font-medium">· {s.day} {s.time}</span></span>
                <button onClick={() => setServices(ss => ss.filter(x => x.id !== s.id))} className="text-white/30 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newSvc.label} onChange={e => setNewSvc(v => ({ ...v, label: e.target.value }))} placeholder="Label" className={field} />
            <input value={newSvc.day} onChange={e => setNewSvc(v => ({ ...v, day: e.target.value }))} placeholder="Day" className={`${field} max-w-[28%]`} />
            <input value={newSvc.time} onChange={e => setNewSvc(v => ({ ...v, time: e.target.value }))} placeholder="Time" className={`${field} max-w-[28%]`} />
            <button onClick={() => { if (newSvc.label.trim()) { setServices(ss => [...ss, { id: busyId(), label: newSvc.label.trim(), day: newSvc.day.trim(), time: newSvc.time.trim() }]); setNewSvc({ label: '', day: '', time: '' }); } }}
              className="px-4 rounded-2xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 shrink-0">Add</button>
          </div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 mt-6 flex items-center gap-2"><MonitorPlay size={11} /> Campuses (multi-site)</p>
          <div className="space-y-2 mb-3">
            {campuses.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                <span className="flex-1 text-xs font-bold text-white">{c.name}{c.location ? <span className="text-white/30 font-medium"> · {c.location}</span> : ''}</span>
                <button onClick={() => setCampuses(cs => cs.filter(x => x.id !== c.id))} className="text-white/30 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newCampus.name} onChange={e => setNewCampus(v => ({ ...v, name: e.target.value }))} placeholder="Campus name" className={field} />
            <input value={newCampus.location} onChange={e => setNewCampus(v => ({ ...v, location: e.target.value }))} placeholder="Location" className={`${field} max-w-[40%]`} />
            <button onClick={() => { if (newCampus.name.trim()) { setCampuses(cs => [...cs, { id: busyId(), name: newCampus.name.trim(), location: newCampus.location.trim() || undefined, isPrimary: cs.length === 0 }]); setNewCampus({ name: '', location: '' }); } }}
              className="px-4 rounded-2xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 shrink-0">Add</button>
          </div>

          <p className="text-[9px] text-white/30 mt-3">Ministries, service times, funds & campuses save with "Save details" above.</p>
        </section>
      )}

      <section>
        <h2 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-3">Staff</h2>
        <div className="flex gap-2 mb-4">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doSearch(); }} placeholder="Search people to add…" className={field} />
          <button onClick={doSearch} className="px-5 rounded-2xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 shrink-0">{searching ? '…' : 'Find'}</button>
        </div>
        {results.length > 0 && (
          <div className="mb-4 space-y-1">
            {results.map(u => (
              <div key={u.uid} className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.04] border border-white/10">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0">{u.photoURL && <img src={u.photoURL} alt="" className="w-full h-full object-cover" />}</div>
                <span className="flex-1 text-xs font-bold text-white truncate">{u.displayName}</span>
                <button onClick={() => addStaff(u)} className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-small-orange text-black hover:brightness-110">Add</button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {staff.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0">{m.photoUrl && <img src={m.photoUrl} alt="" className="w-full h-full object-cover" />}</div>
              <span className="flex-1 text-sm font-bold text-white truncate">{m.displayName}</span>
              <select value={m.role} disabled={m.role === 'OWNER'} onChange={async e => { await setOrgMemberRole(m.id, e.target.value as OrgRole); reloadStaff(); }}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-black text-white outline-none [&>option]:bg-[#0c0c0f] disabled:opacity-50">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {m.role !== 'OWNER' && (
                <button onClick={async () => { await removeOrgMember(m.id); reloadStaff(); }} className="text-white/30 hover:text-red-400 text-[9px] font-black uppercase tracking-widest">Remove</button>
              )}
            </div>
          ))}
        </div>
      </section>
      {canDelete && (
        <section className="mt-12 rounded-3xl border border-red-500/25 bg-red-500/[0.04] p-5">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1 flex items-center gap-2"><Trash2 size={12} /> Danger zone</h2>
          <p className="text-xs text-white/50 mb-4 leading-relaxed">Permanently delete {org.name}: its page, members, roles, invites and community. Financial records are sealed, not erased. You'll be asked to confirm.</p>
          <button onClick={() => setConfirmDelete(true)} className="px-5 py-2.5 rounded-full border border-red-500/40 text-red-300 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-widest transition-all">Delete this organization</button>
        </section>
      )}
      {confirmDelete && <DeleteOrgDialog org={org} onClose={() => setConfirmDelete(false)} onDeleted={() => { setConfirmDelete(false); onDeleted ? onDeleted() : onClose(); }} />}
      <div className="h-16" />
    </div>
  );
};

/** An ORGANIZATION account's profile page IS its org page: same hero, tabs, member hub and admin backend. */
export const OrgAccountPage: React.FC<{ orgId: string; onBack: () => void; onVisitUser?: (uid: string) => void; ownAccount?: boolean } & OrgMediaOpeners> = ({ orgId, onBack, ...rest }) => {
  const [org, setOrg] = useState<Organization | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    import('../services/organizationService').then(m => m.fetchOrganization(orgId)).then(o => { if (alive) setOrg(o); }).catch(() => { if (alive) setOrg(null); });
    return () => { alive = false; };
  }, [orgId]);
  if (org === undefined) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-white/30" size={28} /></div>;
  if (!org) return <div className="p-10 text-center text-white/50 text-sm">This organization page is no longer available.</div>;
  const uid = auth.currentUser?.uid;
  const isOwner = !!uid && (org.creatorId === uid || org.accountUid === uid || !!org.admins?.includes(uid));
  return <OrgProfile key={org.id} org={org} isOwner={isOwner} onBack={onBack} onDeleted={onBack} {...rest} />;
};

export default OrgHub;
