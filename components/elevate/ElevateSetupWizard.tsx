// ElevateSetupWizard — kind → identity → departments → review → "invite your team".
// Creates a church / religious / cultural / non-profit / other org via elevateService.setupElevateOrg.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, Check, Loader2, Plus, X, Link2, EyeOff, Eye } from 'lucide-react';
import type { Organization, OrgType, Ministry } from '../../types';
import { ELEVATE_ORG_KINDS, defaultMinistries } from '../../services/elevateTemplates';
import { setupElevateOrg, newMinistry } from '../../services/elevateService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { uploadFile } from '../../services/backendService';
import { TYPE } from '../../src/lib/designSystem';

const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const lbl = 'text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block';

interface Props {
  user: any;
  onCancel: () => void;
  onCreated: (org: Organization) => void;
  initialType?: OrgType;
}

const Pick: React.FC<{ label: string; file: File | null; url?: string; onPick: (f: File) => void; round?: boolean }> = ({ label, file, url, onPick, round }) => {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : url), [file, url]);
  return (
    <label className="cursor-pointer">
      <span className={lbl}>{label}</span>
      <div className={`w-20 h-20 ${round ? 'rounded-full' : 'rounded-2xl'} bg-white/5 border border-white/10 grid place-items-center overflow-hidden hover:bg-white/10 transition-all`}>
        {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <Camera size={18} className="text-white/30" />}
      </div>
      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
    </label>
  );
};

const STEPS = ['Kind', 'Identity', 'Departments', 'Review'];

const ElevateSetupWizard: React.FC<Props> = ({ user, onCancel, onCreated, initialType }) => {
  const [step, setStep] = useState(initialType ? 1 : 0);
  const [orgType, setOrgType] = useState<OrgType>(initialType || 'CHURCH');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [about, setAbout] = useState('');
  const [kindLabel, setKindLabel] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [link, setLink] = useState(false);
  const [ministries, setMinistries] = useState<Ministry[]>(() => defaultMinistries(initialType || 'CHURCH'));
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Organization | null>(null);
  const [err, setErr] = useState('');

  const [prof, setProf] = useState<any>(user || null);
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, 'users', user.uid)).then(s => { if (s.exists()) setProf({ ...user, ...s.data() }); }).catch(() => {});
  }, [user?.uid]);
  const eligibleLink = !!prof && (prof.accountType === 'BRAND' || prof.accountType === 'ORGANIZATION' || !!prof.linkedOrgId);

  useEffect(() => { setMinistries(defaultMinistries(orgType)); }, [orgType]);

  const profileFill = () => {
    if (!prof) return;
    if (prof.displayName) setName(prof.displayName);
    if (prof.bio) setAbout(prof.bio);
    setLogoUrl(prof.photoURL || undefined);
    setCoverUrl(prof.headerImage || prof.coverUrl || undefined);
  };
  const toggleLink = () => { const v = !link; setLink(v); if (v) profileFill(); };

  const patchMin = (id: string, p: Partial<Ministry>) => setMinistries(ms => ms.map(m => (m.id === id ? { ...m, ...p } : m)));

  const finish = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      const stamp = Date.now();
      const tmp = `elevate_${user?.uid || 'u'}_${stamp}`;
      let logo = logoUrl; let cover = coverUrl;
      if (logoFile) logo = await uploadFile(`organizations/${tmp}/logo_${stamp}.png`, logoFile);
      if (coverFile) cover = await uploadFile(`organizations/${tmp}/cover_${stamp}.png`, coverFile);
      const org = await setupElevateOrg({
        orgType, name: name.trim(), tagline: tagline.trim() || undefined, about: about.trim(),
        denomination: orgType === 'CHURCH' || orgType === 'RELIGIOUS' ? (kindLabel.trim() || undefined) : undefined,
        orgKindLabel: kindLabel.trim() || undefined,
        logoUrl: logo, coverUrl: cover, linkAccount: link, ministries,
      });
      if (!org) { setErr('Could not create the organization. Please sign in and try again.'); setBusy(false); return; }
      setCreated(org);
    } catch { setErr('Could not create the organization. Please try again.'); }
    setBusy(false);
  };

  if (created) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-12 max-w-2xl mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 grid place-items-center mx-auto mb-6"><Check className="text-green-400" size={28} /></div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-white mb-2">{created.name} is live</h1>
        <p className={`${TYPE.labelMd} font-bold text-white/40 uppercase tracking-widest mb-8`}>{ministries.length} departments ready · you are the lead</p>
        <p className="text-sm text-white/60 mb-8">Next: invite your team — pastors, department heads, finance and volunteers — with a link, QR code or email.</p>
        <button onClick={() => onCreated(created)} className="px-8 py-4 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110">Next: invite your team</button>
      </div>
    );
  }

  const canNext = step === 0 || (step === 1 ? !!name.trim() : true);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-12 max-w-2xl mx-auto">
      <button onClick={step === 0 ? onCancel : () => setStep(s => s - 1)} className={`flex items-center gap-2 text-white/40 hover:text-white ${TYPE.labelMd} font-black uppercase tracking-widest mb-8`}>
        <ArrowLeft size={14} /> {step === 0 ? 'Cancel' : 'Back'}
      </button>
      <h1 className="text-3xl font-black uppercase tracking-tight text-white mb-2">Set up Plajah Elevate</h1>
      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= step ? 'bg-small-orange' : 'bg-white/10'}`} />
            <span className={`text-[9px] font-black uppercase tracking-widest ${i === step ? 'text-white' : 'text-white/30'}`}>{s}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {ELEVATE_ORG_KINDS.map(k => (
            <button key={k.orgType} onClick={() => { setOrgType(k.orgType); setStep(1); }}
              className={`p-5 rounded-3xl border text-left transition-all ${orgType === k.orgType ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
              <span className="text-sm font-black uppercase tracking-widest block mb-1">{k.label}</span>
              <span className={`text-xs ${orgType === k.orgType ? 'text-black/60' : 'text-white/40'}`}>{k.blurb}</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          {eligibleLink && (
            <button onClick={toggleLink} className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${link ? 'bg-small-orange/15 border-small-orange/50' : 'bg-white/5 border-white/10'}`}>
              <Link2 size={16} className={link ? 'text-small-orange' : 'text-white/40'} />
              <span className="flex-1">
                <span className="block text-xs font-black uppercase tracking-widest text-white">Link this account</span>
                <span className="block text-[11px] text-white/40">Populate from my account profile; logo and cover stay in sync.</span>
              </span>
              {link && <Check size={16} className="text-small-orange" />}
            </button>
          )}
          <div className="flex gap-4">
            <Pick label="Logo" file={logoFile} url={logoUrl} onPick={setLogoFile} round />
            <Pick label="Cover" file={coverFile} url={coverUrl} onPick={setCoverFile} />
          </div>
          <div><label className={lbl}>Name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Organization name" className={field} /></div>
          <div><label className={lbl}>Tagline</label><input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="A short line under the name" className={field} /></div>
          <div><label className={lbl}>{orgType === 'CHURCH' || orgType === 'RELIGIOUS' ? 'Denomination / tradition' : 'Kind of organization'}</label>
            <input value={kindLabel} onChange={e => setKindLabel(e.target.value)} placeholder={orgType === 'CHURCH' ? 'e.g. Non-denominational' : orgType === 'RELIGIOUS' ? 'e.g. Mosque, Synagogue, Temple' : orgType === 'CULTURAL' ? 'e.g. Art museum' : 'e.g. Food bank'} className={field} /></div>
          <div><label className={lbl}>About</label><textarea value={about} onChange={e => setAbout(e.target.value)} rows={3} placeholder="Who are you and what do you do?" className={`${field} resize-none`} /></div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="text-sm text-white/50 mb-4">Rename, remove or add departments and ministries. Internal ones are hidden from your public page.</p>
          <div className="space-y-2 mb-4">
            {ministries.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/10">
                <span className="text-lg">{m.iconEmoji || '•'}</span>
                <input value={m.name} onChange={e => patchMin(m.id, { name: e.target.value })} className="flex-1 bg-transparent text-xs font-bold text-white outline-none min-w-0" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 hidden sm:block">{m.kind === 'DEPARTMENT' ? 'Dept' : 'Ministry'}</span>
                <button onClick={() => patchMin(m.id, { isInternal: !m.isInternal })} title={m.isInternal ? 'Internal (hidden)' : 'Public'} className={m.isInternal ? 'text-small-orange' : 'text-white/30 hover:text-white'}>
                  {m.isInternal ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => setMinistries(ms => ms.filter(x => x.id !== m.id))} className="text-white/30 hover:text-red-400"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a department or ministry" className={field}
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { setMinistries(ms => [...ms, newMinistry(newName.trim(), 'MINISTRY', { order: ms.length })]); setNewName(''); } }} />
            <button onClick={() => { if (newName.trim()) { setMinistries(ms => [...ms, newMinistry(newName.trim(), 'MINISTRY', { order: ms.length })]); setNewName(''); } }}
              className="px-4 rounded-2xl bg-white/10 text-white hover:bg-white/20 shrink-0"><Plus size={16} /></button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 flex gap-4">
            {(logoFile || logoUrl) && <img src={logoFile ? URL.createObjectURL(logoFile) : logoUrl} alt="" className="w-16 h-16 rounded-full object-cover" />}
            <div className="min-w-0">
              <p className="text-lg font-black text-white truncate">{name}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-small-orange">{ELEVATE_ORG_KINDS.find(k => k.orgType === orgType)?.label}{kindLabel ? ` · ${kindLabel}` : ''}</p>
              {tagline && <p className="text-xs text-white/50 mt-1">{tagline}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ministries.map(m => <span key={m.id} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-white/70">{m.iconEmoji} {m.name}</span>)}
          </div>
          {link && <p className="text-[11px] text-white/40 flex items-center gap-2"><Link2 size={12} /> Linked to your account — logo/cover changes sync both ways.</p>}
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
      )}

      {step > 0 && (
        <button onClick={step === 3 ? finish : () => setStep(s => s + 1)} disabled={busy || !canNext}
          className="mt-8 w-full py-4 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : step === 3 ? 'Create organization' : 'Continue'}
        </button>
      )}
    </div>
  );
};

export default ElevateSetupWizard;
