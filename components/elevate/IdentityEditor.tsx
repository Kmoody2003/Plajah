// IdentityEditor — replace an org's logo + cover. Uses updateOrgIdentity so a linked account's
// profile photo / cover change too.

import React, { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import type { Organization } from '../../types';
import { updateOrgIdentity } from '../../services/elevateService';
import { uploadFile } from '../../services/backendService';

const IdentityEditor: React.FC<{ org: Organization; onSaved: (o: Organization) => void }> = ({ org, onSaved }) => {
  const [busy, setBusy] = useState<'logo' | 'cover' | null>(null);

  const swap = async (kind: 'logo' | 'cover', file: File) => {
    setBusy(kind);
    try {
      const url = await uploadFile(`organizations/${org.id}/${kind}_${Date.now()}.png`, file);
      await updateOrgIdentity(org.id, kind === 'logo' ? { logoUrl: url } : { coverUrl: url });
      onSaved({ ...org, ...(kind === 'logo' ? { logoUrl: url } : { coverUrl: url }) });
    } catch { alert('Could not update the image.'); }
    setBusy(null);
  };

  const Tile = ({ kind, url, round }: { kind: 'logo' | 'cover'; url?: string; round?: boolean }) => (
    <label className="cursor-pointer block">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">{kind === 'logo' ? 'Logo' : 'Cover'}{org.accountUid ? ' · synced to account' : ''}</span>
      <div className={`relative ${round ? 'w-20 h-20 rounded-full' : 'w-full h-20 rounded-2xl'} bg-white/5 border border-white/10 grid place-items-center overflow-hidden hover:bg-white/10 transition-all`}>
        {url && <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <span className="relative z-10 p-2 rounded-full bg-black/50">{busy === kind ? <Loader2 size={16} className="animate-spin text-white" /> : <Camera size={16} className="text-white" />}</span>
      </div>
      <input type="file" accept="image/*" className="hidden" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; if (f) swap(kind, f); e.target.value = ''; }} />
    </label>
  );

  return (
    <div className="flex gap-4 items-end">
      <Tile kind="logo" url={org.logoUrl} round />
      <div className="flex-1"><Tile kind="cover" url={org.coverUrl} /></div>
    </div>
  );
};

export default IdentityEditor;
