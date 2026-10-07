import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import type { UserProfile } from '../../types';
import { fetchFastChannelMeta, uploadChannelLogo, setChannelSubLogo, setChannelAccountLogo } from '../../services/backendService';
import { fastSourceKey, liveSourceKey, resolveChannelLogo, type OwnerBranding } from '../../services/fast/channelBranding';
import ChannelLogo from '../tv/ChannelLogo';

/**
 * Master Control › Channel logos. One row per channel the account shows in the TV+ guide: the
 * account default, the FAST channel, and each live source. A channel with no logo of its own uses
 * the account logo, then the profile photo, then the Plajah chevron — the same order the guide
 * applies, so what is previewed here is what viewers see.
 */
const ChannelLogoManager: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const uid = profile.uid;
  const [branding, setBranding] = useState<OwnerBranding>({ photoURL: profile.photoURL || undefined });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<string>('');

  useEffect(() => {
    let alive = true;
    void fetchFastChannelMeta(uid).then(m => {
      if (!alive) return;
      setBranding({ logoUrl: m?.logoUrl || undefined, subLogos: m?.subLogos, subNames: m?.subNames, photoURL: profile.photoURL || undefined });
    }).catch(() => {});
    return () => { alive = false; };
  }, [uid, profile.photoURL]);

  const liveFeeds = (profile.liveStreamConfig?.liveFeeds || []).filter(f => f?.url);
  const rows: { key: string; label: string; hint: string }[] = [
    { key: 'account', label: 'All my channels', hint: 'Default for any channel without its own logo. Falls back to your profile photo.' },
    { key: fastSourceKey(uid), label: 'FAST channel', hint: 'Your 24/7 scheduled channel.' },
    ...liveFeeds.map(f => ({ key: liveSourceKey(f.url), label: f.name || 'Live feed', hint: f.url })),
  ];

  const pick = (key: string) => { targetRef.current = key; setError(''); inputRef.current?.click(); };

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const key = targetRef.current;
    if (!file || !key) return;
    setBusy(key); setError('');
    try {
      const url = await uploadChannelLogo(uid, file);
      if (key === 'account') {
        await setChannelAccountLogo(uid, url);
        setBranding(b => ({ ...b, logoUrl: url }));
      } else {
        await setChannelSubLogo(uid, key, url);
        setBranding(b => ({ ...b, subLogos: { ...(b.subLogos || {}), [key]: url } }));
      }
    } catch (err: any) {
      setError(err?.message || 'Could not save the logo. Try again.');
    } finally { setBusy(null); }
  }, [uid]);

  const remove = async (key: string) => {
    setBusy(key); setError('');
    try {
      if (key === 'account') {
        await setChannelAccountLogo(uid, null);
        setBranding(b => ({ ...b, logoUrl: undefined }));
      } else {
        await setChannelSubLogo(uid, key, null);
        setBranding(b => { const next = { ...(b.subLogos || {}) }; delete next[key]; return { ...b, subLogos: next }; });
      }
    } catch { setError('Could not remove the logo. Try again.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
      <div>
        <h3 className="text-base font-black text-white tracking-tight">Channel Logos</h3>
        <p className="text-sm text-white/40 mt-0.5">Shown in the TV+ guide, on the dial and on shared links. No logo? Your profile photo, then the Plajah chevron.</p>
      </div>
      {error && <p role="alert" className="text-xs font-bold text-red-400">{error}</p>}
      <ul className="divide-y divide-white/5">
        {rows.map(r => {
          const own = r.key === 'account' ? branding.logoUrl : branding.subLogos?.[r.key];
          const shown = r.key === 'account'
            ? (branding.logoUrl || branding.photoURL)
            : resolveChannelLogo(branding, r.key);
          return (
            <li key={r.key} className="flex items-center gap-4 py-3">
              <ChannelLogo src={shown} name={r.label} size={48} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-white truncate">{r.label}</p>
                <p className="text-[11px] text-white/35 truncate">{own ? 'Custom logo' : r.hint}</p>
              </div>
              <button
                type="button"
                disabled={busy === r.key}
                onClick={() => pick(r.key)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-small-orange text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
              >
                {busy === r.key ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} {own ? 'Change' : 'Upload'}
              </button>
              {own && (
                <button
                  type="button"
                  disabled={busy === r.key}
                  onClick={() => void remove(r.key)}
                  aria-label={`Remove logo for ${r.label}`}
                  className="w-9 h-9 rounded-xl grid place-items-center bg-white/5 text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-50"
                ><Trash2 size={14} /></button>
              )}
            </li>
          );
        })}
      </ul>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onFile} />
    </div>
  );
};

export default ChannelLogoManager;
