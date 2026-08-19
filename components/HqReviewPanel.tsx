import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock, Copy, Download, History, Link2, Loader2, MessageSquare, RefreshCw, Repeat, Send, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import type { HqActivityEvent, HqAssetVersion, HqComment, HqReviewRequest } from '../types';
import type { OrgAsset } from '../services/orgAssets';
import {
  addHqComment, addHqVersion, createHqShareLink, decideHqReview, listHqActivity, listHqComments,
  listHqReviews, listHqVersions, requestHqReview, resolveHqComment, revokeHqShareLink, setHqAssetStatus, trashHqAsset, updateHqRights,
} from '../services/hqCollaboration';
import { crossover } from '../services/crossover';
import type { MediaKind, Recipe } from '../services/crossover';
import { auth } from '../services/firebase';

type Tab = 'COMMENTS' | 'VERSIONS' | 'APPROVAL' | 'RIGHTS' | 'ACTIVITY';

// Crossover conversion presets, ported from the old ContentHQ AssetDetail. The source
// now comes from the AUTHENTICATED download endpoint (protected storage), not a public URL.
const CX_TARGETS: Partial<Record<MediaKind, { id: string; label: string; recipe: Recipe }[]>> = {
  image: [
    { id: 'webp', label: 'WebP (browser)', recipe: { containerId: 'webp', imageFormatId: 'webp', hwAccel: 'auto', qualityMode: 'crf' } },
    { id: 'png', label: 'PNG (browser)', recipe: { containerId: 'png', imageFormatId: 'png', hwAccel: 'auto', qualityMode: 'crf' } },
    { id: 'jpg', label: 'JPEG (browser)', recipe: { containerId: 'jpg', imageFormatId: 'jpg', hwAccel: 'auto', qualityMode: 'crf' } },
  ],
  audio: [
    { id: 'wav', label: 'WAV 16-bit (browser)', recipe: { containerId: 'wav', audioCodecId: 'pcm_s16le', hwAccel: 'auto', qualityMode: 'lossless', fixTimestamps: true } },
    { id: 'mp3', label: 'MP3 320k (cloud)', recipe: { containerId: 'mp3', audioCodecId: 'mp3', hwAccel: 'auto', qualityMode: 'bitrate', audioBitrate: '320k', fixTimestamps: true } },
  ],
  video: [
    { id: 'mp4', label: 'MP4 / H.264 (cloud)', recipe: { containerId: 'mp4', videoCodecId: 'h264', audioCodecId: 'aac', hwAccel: 'auto', qualityMode: 'crf', crf: 20, audioBitrate: '256k', fixTimestamps: true } },
    { id: 'prores', label: 'MOV / ProRes (cloud)', recipe: { containerId: 'mov', videoCodecId: 'prores', audioCodecId: 'pcm_s16le', hwAccel: 'none', qualityMode: 'lossless', fixTimestamps: true } },
  ],
};

const HqReviewPanel: React.FC<{
  asset: OrgAsset;
  canEdit: boolean;
  proEnabled?: boolean;
  onChanged?: () => void;
  onClose: () => void;
}> = ({ asset, canEdit, proEnabled = true, onChanged, onClose }) => {
  const [tab, setTab] = useState<Tab>('COMMENTS');
  const [versions, setVersions] = useState<HqAssetVersion[]>([]);
  const [comments, setComments] = useState<HqComment[]>([]);
  const [reviews, setReviews] = useState<HqReviewRequest[]>([]);
  const [activity, setActivity] = useState<HqActivityEvent[]>([]);
  const [comment, setComment] = useState('');
  const [reviewers, setReviewers] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mediaUrl, setMediaUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [shareOpts, setShareOpts] = useState({ allowComments: true, allowApproval: true, requireEmail: false, allowDownload: false });
  const [reviewLink, setReviewLink] = useState<{ shareId: string; reviewUrl: string; downloadUrl: string } | null>(null);
  const [copied, setCopied] = useState('');
  const media = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const versionInput = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const [v, c, r, a] = await Promise.all([
      listHqVersions(asset.id).catch(() => []), listHqComments(asset.id).catch(() => []),
      listHqReviews(asset.id).catch(() => []), listHqActivity(asset.id).catch(() => []),
    ]);
    setVersions(v); setComments(c); setReviews(r); setActivity(a);
  };
  useEffect(() => { reload(); }, [asset.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let objectUrl = '';
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/hq/assets/${encodeURIComponent(asset.id)}/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) { objectUrl = URL.createObjectURL(await res.blob()); setMediaUrl(objectUrl); }
      } catch { /* preview is optional; download still works */ }
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.id, asset.currentVersionId]);

  async function run(task: () => Promise<void>) {
    setBusy(true); setError('');
    try { await task(); await reload(); onChanged?.(); }
    catch (e: any) { setError(e?.message || 'That action could not be completed.'); }
    finally { setBusy(false); }
  }

  const currentVersion = versions.find(v => v.id === asset.currentVersionId) || versions[0];
  const currentTime = () => media.current?.currentTime || 0;

  async function submitComment() {
    if (!currentVersion || !comment.trim()) return;
    await run(async () => {
      await addHqComment({ assetId: asset.id, versionId: currentVersion.id, body: comment,
        visibility: 'EVERYONE', timeStartSeconds: ['video', 'audio'].includes(asset.kind) ? currentTime() : undefined }, asset);
      setComment('');
    });
  }

  async function uploadVersion(file?: File) {
    if (!file) return;
    await run(async () => { await addHqVersion(asset, file, undefined, setProgress); setProgress(0); });
  }

  async function askForReview() {
    const ids = reviewers.split(/[\s,]+/).filter(Boolean);
    await run(async () => {
      await requestHqReview(asset, ids, deadline ? new Date(deadline).getTime() : undefined);
      setReviewers(''); setDeadline('');
    });
  }

  async function download() {
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/hq/assets/${encodeURIComponent(asset.id)}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Download failed.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = asset.name; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { setError(e?.message || 'Download failed.'); } finally { setBusy(false); }
  }

  async function createShare() {
    await run(async () => {
      const { share: row, token } = await createHqShareLink(asset, { ...shareOpts,
        expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000 });
      const reviewUrl = `${location.origin}/review/${row.id}?t=${token}`;
      const downloadUrl = `${location.origin}/api/hq/share/${row.id}/${token}/download`;
      setReviewLink({ shareId: row.id, reviewUrl, downloadUrl });
      try { await navigator.clipboard?.writeText(reviewUrl); setCopied('review'); } catch { /* clipboard optional */ }
    });
  }

  async function copyLink(which: 'review' | 'download') {
    if (!reviewLink) return;
    try { await navigator.clipboard?.writeText(which === 'review' ? reviewLink.reviewUrl : reviewLink.downloadUrl); setCopied(which); } catch { /* */ }
  }

  async function revokeShare() {
    if (!reviewLink) return;
    if (!confirm('Revoke this link? Anyone holding it immediately loses access.')) return;
    await run(() => revokeHqShareLink(asset, reviewLink.shareId));
    setReviewLink(null); setCopied(''); setShowShare(false);
  }

  async function trash() {
    if (!confirm('Move this file to Trash? It stays recoverable for 30 days, then is permanently deleted.')) return;
    await run(() => trashHqAsset(asset));
    onClose();
  }

  // ── Convert (Crossover) ─────────────────────────────────────────────────────
  const convKind: MediaKind | null = asset.kind === 'image' ? 'image' : asset.kind === 'audio' ? 'audio' : asset.kind === 'video' ? 'video' : null;
  const convTargets = convKind ? CX_TARGETS[convKind] || [] : [];
  const [showConvert, setShowConvert] = useState(false);
  const [convTargetId, setConvTargetId] = useState(convTargets[0]?.id || '');
  const [converting, setConverting] = useState(false);
  const [convPct, setConvPct] = useState(0);
  const [convOut, setConvOut] = useState<{ url: string; name: string } | null>(null);
  const [convErr, setConvErr] = useState('');

  /** Load the current version as a File via the authenticated protected-storage endpoint. */
  async function fetchAssetFile(): Promise<File> {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/hq/assets/${encodeURIComponent(asset.id)}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Could not load this asset to convert.');
    const blob = await res.blob();
    return new File([blob], asset.name, { type: blob.type || asset.mimeType });
  }

  async function runConvert() {
    const t = convTargets.find(x => x.id === convTargetId);
    if (!t || !convKind) return;
    setConverting(true); setConvErr(''); setConvOut(null); setConvPct(0);
    try {
      const file = await fetchAssetFile();
      const r = await crossover.convert({ id: asset.id, name: asset.name, kind: convKind, sizeBytes: file.size, file },
        t.recipe, p => setConvPct(p.progress));
      setConvOut({ url: r.outputUrl, name: r.outputName });
    } catch (e: any) {
      setConvErr(e?.message === 'LIMIT_REACHED' ? 'Free conversion limit reached — upgrade to Plajah+.' : (e?.message || String(e)));
    } finally { setConverting(false); }
  }

  const tabs: [Tab, string, React.ComponentType<any>][] = [
    ['COMMENTS', 'Comments', MessageSquare], ['VERSIONS', 'Versions', History], ['APPROVAL', 'Approval', ShieldCheck],
    ['RIGHTS', 'Rights', Link2], ['ACTIVITY', 'Activity', Clock],
  ];

  return <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex justify-end" onClick={onClose}>
    <div className="w-full max-w-3xl h-full bg-[#0b0b10] border-l border-white/10 overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="sticky top-0 z-10 bg-[#0b0b10]/95 backdrop-blur px-5 py-4 border-b border-white/10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><div className="text-[10px] uppercase tracking-widest text-white/35">{asset.status || 'DRAFT'} · v{asset.versionCount || 1}</div>
            <h2 className="font-black text-xl truncate">{asset.name}</h2></div>
          <button onClick={download} className="p-2 rounded-full bg-white/5" title="Download original"><Download size={16}/></button>
          {convKind && <button onClick={() => setShowConvert(s => !s)} className={`p-2 rounded-full ${showConvert ? 'bg-[#34e0d0]/20 text-[#34e0d0]' : 'bg-white/5'}`} title="Convert with Crossover"><Repeat size={16}/></button>}
          {proEnabled && <button onClick={() => setShowShare(s => !s)} className={`p-2 rounded-full ${showShare ? 'bg-[#34e0d0]/20 text-[#34e0d0]' : 'bg-white/5'}`} title="Share a review link"><Link2 size={16}/></button>}
          {canEdit && <button onClick={trash} className="p-2 rounded-full bg-white/5 text-red-300" title="Move to Trash"><Trash2 size={16}/></button>}
          <button onClick={onClose} className="p-2"><X size={18}/></button>
        </div>
        {shareUrl && <div className="mt-2 text-[11px] text-emerald-300 truncate">Secure download link copied · expires in 14 days</div>}
        {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
      </div>

      {showShare && <div className="mx-5 mt-5 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
        <div className="flex items-center gap-2"><Link2 size={14} className="text-[#34e0d0]"/><p className="text-[10px] font-black uppercase tracking-widest text-white/70">External review link</p></div>
        <p className="text-[11px] text-white/45 leading-relaxed">Anyone with the link can review this asset — no Plajah account. Expires in 14 days; revoke anytime.</p>
        <div className="space-y-1.5">
          {([['allowComments', 'Allow comments'], ['allowApproval', 'Allow approve / request changes'], ['requireEmail', 'Require reviewer email'], ['allowDownload', 'Allow download of the original']] as const).map(([key, label]) =>
            <label key={key} className="flex items-center gap-2.5 text-xs text-white/70 cursor-pointer">
              <input type="checkbox" checked={shareOpts[key]} onChange={e => setShareOpts(o => ({ ...o, [key]: e.target.checked }))} className="accent-[#34e0d0]"/>
              {label}
            </label>)}
        </div>
        <button onClick={createShare} disabled={busy} className="w-full py-2.5 rounded-xl bg-[#34e0d0] text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={13} className="animate-spin"/> : <><Link2 size={13}/> Create review link</>}
        </button>
        {reviewLink && <div className="space-y-2 pt-1">
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-white/35 mb-1">Review link</div>
            <div className="flex items-center gap-2"><code className="flex-1 text-[10px] text-[#34e0d0] truncate">{reviewLink.reviewUrl}</code>
              <button onClick={() => copyLink('review')} className="p-1.5 rounded-lg bg-white/5" title="Copy review link">{copied === 'review' ? <Check size={12} className="text-emerald-300"/> : <Copy size={12}/>}</button></div>
          </div>
          {shareOpts.allowDownload && <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-white/35 mb-1">Direct download link</div>
            <div className="flex items-center gap-2"><code className="flex-1 text-[10px] text-white/60 truncate">{reviewLink.downloadUrl}</code>
              <button onClick={() => copyLink('download')} className="p-1.5 rounded-lg bg-white/5" title="Copy download link">{copied === 'download' ? <Check size={12} className="text-emerald-300"/> : <Copy size={12}/>}</button></div>
          </div>}
          <button onClick={revokeShare} className="text-[10px] font-black uppercase tracking-widest text-red-300">Revoke link</button>
        </div>}
      </div>}

      <div className="p-5">
        <div className="aspect-video bg-black rounded-2xl overflow-hidden grid place-items-center mb-5">
          {mediaUrl && asset.kind === 'image' && <img src={mediaUrl} className="max-w-full max-h-full object-contain" alt=""/>}
          {mediaUrl && asset.kind === 'video' && <video ref={media as any} src={mediaUrl} controls className="w-full h-full"/>}
          {mediaUrl && asset.kind === 'audio' && <audio ref={media as any} src={mediaUrl} controls className="w-4/5"/>}
          {!mediaUrl && <Loader2 className="animate-spin text-white/20"/>}
        </div>

        {convKind && showConvert && (
          <div className="mb-5 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex items-center gap-2"><Repeat size={14} className="text-[#34e0d0]"/><p className="text-[10px] font-black uppercase tracking-widest text-white/70">Convert with Crossover</p></div>
            <div className="flex gap-2">
              <select value={convTargetId} onChange={e => setConvTargetId(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-xs text-white outline-none [&>option]:bg-neutral-900">
                {convTargets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button onClick={runConvert} disabled={converting} className="px-4 py-2 rounded-xl bg-[#FF8C00] text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1.5">
                {converting ? <Loader2 size={13} className="animate-spin"/> : 'Convert'}
              </button>
            </div>
            {converting && <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#34e0d0]" style={{ width: `${convPct * 100}%` }}/></div>}
            {convOut && <a href={convOut.url} download={convOut.name} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#3ddc84]"><Download size={13}/> {convOut.name}</a>}
            {convErr && <p className="text-[10px] text-red-300 leading-relaxed">{convErr}</p>}
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto mb-5">
          {tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-wider ${tab === id ? 'bg-white text-black' : 'bg-white/5 text-white/45'}`}><Icon size={12}/>{label}</button>)}
        </div>

        {tab === 'COMMENTS' && <div className="space-y-3">
          {comments.map(c => <div key={c.id} className={`p-3 rounded-xl border ${c.resolved ? 'border-white/5 opacity-45' : 'border-white/10 bg-white/[.025]'}`}>
            <div className="flex gap-2 text-[11px]"><strong>{c.authorName}</strong>{c.timeStartSeconds !== undefined && <button onClick={() => { if (media.current) media.current.currentTime = c.timeStartSeconds!; }} className="text-orange-300">{Math.floor(c.timeStartSeconds / 60)}:{String(Math.floor(c.timeStartSeconds % 60)).padStart(2, '0')}</button>}<span className="ml-auto text-white/25">{new Date(c.createdAt).toLocaleString()}</span></div>
            <p className="text-sm mt-1 text-white/75">{c.body}</p>
            {!c.resolved && canEdit && <button onClick={() => run(() => resolveHqComment(c, asset))} className="mt-2 text-[10px] text-emerald-300">Resolve</button>}
          </div>)}
          <div className="flex gap-2"><input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitComment()} placeholder={['video','audio'].includes(asset.kind) ? 'Comment at current time…' : 'Leave feedback…'} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"/><button disabled={busy} onClick={submitComment} className="p-3 bg-orange-500 text-black rounded-xl"><Send size={15}/></button></div>
        </div>}

        {tab === 'VERSIONS' && <div className="space-y-2">
          {canEdit && proEnabled && <><button onClick={() => versionInput.current?.click()} className="w-full py-3 rounded-xl bg-orange-500 text-black text-xs font-black uppercase flex justify-center gap-2"><Upload size={14}/> Upload new version</button><input ref={versionInput} type="file" className="hidden" onChange={e => uploadVersion(e.target.files?.[0])}/>{progress > 0 && <div className="text-xs text-white/40">Uploading {Math.round(progress)}%</div>}</>}
          {versions.map(v => <div key={v.id} className="p-3 rounded-xl bg-white/[.035] flex items-center gap-3"><div className="font-black text-orange-300">v{v.version}</div><div className="min-w-0"><div className="text-sm truncate">{v.name}</div><div className="text-[10px] text-white/35">{v.uploadedByName || 'Member'} · {new Date(v.createdAt).toLocaleString()}</div></div>{v.id === asset.currentVersionId && <span className="ml-auto text-[9px] uppercase text-emerald-300">Current</span>}</div>)}
          {!proEnabled && <UpgradeNote/>}
        </div>}

        {tab === 'APPROVAL' && <div className="space-y-3">
          {canEdit && proEnabled && <div className="p-4 rounded-2xl bg-white/[.035] space-y-2"><div className="text-xs font-black uppercase">Request review</div><input value={reviewers} onChange={e => setReviewers(e.target.value)} placeholder="Reviewer user IDs, separated by commas" className="w-full bg-white/5 rounded-xl px-3 py-2 text-sm"/><input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full bg-white/5 rounded-xl px-3 py-2 text-sm"/><button onClick={askForReview} disabled={busy} className="w-full py-2 rounded-xl bg-white text-black text-xs font-black">Send request</button></div>}
          {reviews.map(r => <div key={r.id} className="p-4 rounded-2xl border border-white/10"><div className="flex"><strong className="text-sm">{r.status.replace('_',' ')}</strong><span className="ml-auto text-[10px] text-white/35">{r.deadlineAt ? `Due ${new Date(r.deadlineAt).toLocaleDateString()}` : 'No deadline'}</span></div><div className="text-xs text-white/45 mt-1">{Object.values(r.decisions).filter(x => x === 'APPROVED').length}/{r.reviewerUids.length} approved</div>{r.status === 'OPEN' && <div className="flex gap-2 mt-3"><button onClick={() => run(() => decideHqReview(r, asset, 'APPROVED'))} className="flex-1 py-2 rounded-xl bg-emerald-400 text-black text-xs font-black"><Check size={13} className="inline mr-1"/>Approve</button><button onClick={() => run(() => decideHqReview(r, asset, 'CHANGES_REQUESTED'))} className="flex-1 py-2 rounded-xl bg-amber-400 text-black text-xs font-black">Request changes</button></div>}</div>)}
          {asset.status === 'APPROVED' && canEdit && <button onClick={() => run(() => setHqAssetStatus(asset, 'DELIVERED'))} className="w-full py-3 rounded-xl bg-sky-400 text-black text-xs font-black uppercase">Mark delivered</button>}
          {!proEnabled && <UpgradeNote/>}
        </div>}

        {tab === 'RIGHTS' && <RightsForm asset={asset} canEdit={canEdit} onSave={rights => run(() => updateHqRights(asset, rights))}/>} 

        {tab === 'ACTIVITY' && <div className="space-y-2">{activity.map(a => <div key={a.id} className="flex gap-3 text-xs p-3 border-b border-white/5"><RefreshCw size={12} className="text-orange-300 mt-0.5"/><div><strong>{a.actorName || 'Member'}</strong> {a.action.toLowerCase().replaceAll('_',' ')}<div className="text-[10px] text-white/30 mt-0.5">{new Date(a.createdAt).toLocaleString()}</div></div></div>)}</div>}
      </div>
    </div>
  </div>;
};

const UpgradeNote = () => <div className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/5 text-xs text-white/55">Plajah+ unlocks versions, approvals, and external review links. Projects remain unlimited.</div>;

const RightsForm: React.FC<{ asset: OrgAsset; canEdit: boolean; onSave: (r: OrgAsset['rights']) => void }> = ({ asset, canEdit, onSave }) => {
  const [value, setValue] = useState(asset.rights || {});
  const field = (key: keyof NonNullable<OrgAsset['rights']>, placeholder: string) => <input disabled={!canEdit} value={String(value[key] || '')} onChange={e => setValue(v => ({ ...v, [key]: key === 'expiresAt' ? new Date(e.target.value).getTime() : e.target.value }))} placeholder={placeholder} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"/>;
  return <div className="space-y-2">{field('owner','Rights owner')}{field('license','License / release')}{field('territory','Territory')}{field('credits','Required credits')}{canEdit && <button onClick={() => onSave(value)} className="w-full py-3 bg-white text-black rounded-xl text-xs font-black">Save rights</button>}</div>;
};

export default HqReviewPanel;
