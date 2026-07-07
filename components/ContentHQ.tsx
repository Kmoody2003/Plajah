import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  FolderOpen, FileText, Image as ImageIcon, Film, Music, File as FileIcon, Upload, Download,
  Trash2, Repeat, X, Search, Loader2, HardDrive, Library, ArrowLeft, Plus, Lock,
} from 'lucide-react';
import ContentAssetManager from './ContentAssetManager';
import { Album } from '../types';
import {
  listHqAssets, addHqAsset, deleteHqAsset, humanFileSize,
  type OrgAsset, type OwnerScope,
} from '../services/orgAssets';
import { crossover } from '../services/crossover';
import type { MediaKind, Recipe } from '../services/crossover';

// ─────────────────────────────────────────────────────────────────────────
// Content HQ — an admin surface for an org OR a single account: a private
// Digital Asset Manager (arbitrary files / brand specs / documents, powered by
// services/orgAssets) plus the owner's published media library (the existing
// ContentAssetManager). Convert files in place via the Crossover engine.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  scope: OwnerScope;
  canEdit: boolean;
  /** uid whose published albums/videos populate the Media Library tab. */
  mediaOwnerUid: string;
  onEditAlbum?: (album: Album) => void;
  onClose?: () => void;
}

const ORANGE = '#FF8C00';
const TEAL = '#34e0d0';

function assetIcon(kind: OrgAsset['kind'], cls = 'w-5 h-5') {
  if (kind === 'image') return <ImageIcon className={cls} />;
  if (kind === 'video') return <Film className={cls} />;
  if (kind === 'audio') return <Music className={cls} />;
  if (kind === 'pdf' || kind === 'doc') return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

const ContentHQ: React.FC<Props> = ({ scope, canEdit, mediaOwnerUid, onEditAlbum, onClose }) => {
  const [tab, setTab] = useState<'FILES' | 'MEDIA'>('FILES');

  return (
    <div className="flex flex-col h-full min-h-0 text-white">
      <div className="flex items-center gap-3 px-6 lg:px-8 py-4">
        {onClose && (
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
        )}
        <div className="w-8 h-8 rounded-xl grid place-items-center" style={{ background: `${ORANGE}22`, color: ORANGE }}>
          <HardDrive className="w-4 h-4" />
        </div>
        <div>
          <div className="text-lg font-black tracking-tight leading-none">Content HQ</div>
          <div className="text-[11px] text-white/40 mt-0.5">{scope.label || (scope.kind === 'org' ? 'Organization' : 'Account')} · private</div>
        </div>
        {!canEdit && <span className="ml-2 flex items-center gap-1 text-[10px] text-white/40"><Lock className="w-3 h-3" /> Read-only</span>}
        <div className="ml-auto flex gap-1.5">
          {([['FILES', 'Files & Docs', FolderOpen], ['MEDIA', 'Media Library', Library]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-colors ${
                tab === id ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:text-white'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-6 lg:px-8 pb-6">
        {tab === 'FILES'
          ? <HqFilesTab scope={scope} canEdit={canEdit} />
          : <ContentAssetManager uid={mediaOwnerUid} onEditAlbum={onEditAlbum || (() => {})} />}
      </div>
    </div>
  );
};

// ── Files & Docs — the private DAM (exported so per-account dashboards can embed it) ──
export const HqFilesTab: React.FC<{ scope: OwnerScope; canEdit: boolean }> = ({ scope, canEdit }) => {
  const [assets, setAssets] = useState<OrgAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<string>('ALL');
  const [uploading, setUploading] = useState<{ name: string; pct: number }[]>([]);
  const [detail, setDetail] = useState<OrgAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try { setAssets(await listHqAssets(scope)); } catch { /* rules / offline */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, [scope.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const folders = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a) => { if (a.folder) set.add(a.folder); });
    return ['ALL', ...Array.from(set).sort()];
  }, [assets]);

  const shown = useMemo(() => assets.filter((a) =>
    (folder === 'ALL' || a.folder === folder) &&
    (!search || a.name.toLowerCase().includes(search.toLowerCase()))
  ), [assets, folder, search]);

  async function onFiles(list: FileList | null) {
    if (!list || !canEdit) return;
    const files = Array.from(list);
    const targetFolder = folder === 'ALL' ? undefined : folder;
    setUploading(files.map((f) => ({ name: f.name, pct: 0 })));
    for (const f of files) {
      try {
        await addHqAsset(scope, f, targetFolder, (pct) =>
          setUploading((prev) => prev.map((u) => (u.name === f.name ? { ...u, pct } : u))));
      } catch (e: any) {
        setUploading((prev) => prev.map((u) => (u.name === f.name ? { ...u, pct: -1 } : u)));
      }
    }
    setUploading([]);
    load();
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-white/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files"
            className="bg-transparent text-sm outline-none flex-1 text-white placeholder:text-white/30" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {folders.map((f) => (
            <button key={f} onClick={() => setFolder(f)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                folder === f ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50 hover:text-white'
              }`}>
              {f === 'ALL' ? 'All' : f}
            </button>
          ))}
        </div>
        {canEdit && (
          <button onClick={() => fileInput.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8C00] text-black text-xs font-black uppercase tracking-widest">
            <Upload className="w-4 h-4" /> Upload
          </button>
        )}
        <input ref={fileInput} type="file" multiple className="hidden"
          onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ''; }} />
      </div>

      {/* upload progress */}
      {uploading.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {uploading.map((u) => (
            <div key={u.name} className="flex items-center gap-3 text-[11px] text-white/60">
              <span className="truncate max-w-[220px]">{u.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full" style={{ width: `${Math.max(0, u.pct)}%`, background: u.pct < 0 ? '#ff6b6b' : TEAL }} />
              </div>
              <span>{u.pct < 0 ? 'failed' : `${Math.round(u.pct)}%`}</span>
            </div>
          ))}
        </div>
      )}

      {/* grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="grid place-items-center h-40 text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="grid place-items-center h-48 text-center text-white/30 text-sm px-8">
            {canEdit ? 'No files yet. Upload brand specs, documents, images, and media — private to this account.' : 'No files.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {shown.map((a) => (
              <button key={a.id} onClick={() => setDetail(a)}
                className="text-left p-4 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-colors">
                <div className="w-10 h-10 rounded-xl grid place-items-center mb-3" style={{ background: `${TEAL}18`, color: TEAL }}>
                  {assetIcon(a.kind)}
                </div>
                <div className="text-[13px] font-semibold truncate">{a.name}</div>
                <div className="text-[11px] text-white/40 mt-0.5">{a.kind} · {humanFileSize(a.sizeBytes)}</div>
                {a.folder && <div className="text-[10px] text-white/30 mt-1">{a.folder}</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      {detail && (
        <AssetDetail asset={detail} canEdit={canEdit} onClose={() => setDetail(null)}
          onDeleted={() => { setDetail(null); load(); }} />
      )}
    </div>
  );
};

// ── File detail: download / convert / delete ───────────────────────────────
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

const AssetDetail: React.FC<{ asset: OrgAsset; canEdit: boolean; onClose: () => void; onDeleted: () => void }> = ({ asset, canEdit, onClose, onDeleted }) => {
  const convKind: MediaKind | null = asset.kind === 'image' ? 'image' : asset.kind === 'audio' ? 'audio' : asset.kind === 'video' ? 'video' : null;
  const targets = convKind ? CX_TARGETS[convKind] || [] : [];
  const [targetId, setTargetId] = useState(targets[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [outUrl, setOutUrl] = useState<{ url: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function convert() {
    const t = targets.find((x) => x.id === targetId);
    if (!t || !convKind) return;
    setBusy(true); setErr(null); setOutUrl(null); setPct(0);
    try {
      const blob = await (await fetch(asset.url)).blob();
      const file = new File([blob], asset.name, { type: blob.type || asset.mimeType });
      const r = await crossover.convert({ id: asset.id, name: asset.name, kind: convKind, sizeBytes: blob.size, file }, t.recipe, (p) => setPct(p.progress));
      setOutUrl({ url: r.outputUrl, name: r.outputName });
    } catch (e: any) {
      setErr(e?.message === 'LIMIT_REACHED' ? 'Free conversion limit reached — upgrade to Plajah+.' : (e?.message || String(e)));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="w-full max-w-md h-full bg-[#0c0c11] border-l border-white/10 overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{asset.kind} · {humanFileSize(asset.sizeBytes)}</span>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-4.5 h-4.5" /></button>
        </div>
        <div className="aspect-video rounded-2xl overflow-hidden bg-white/5 grid place-items-center">
          {asset.kind === 'image'
            ? <img src={asset.url} alt="" className="w-full h-full object-contain" />
            : <div className="text-white/20">{assetIcon(asset.kind, 'w-12 h-12')}</div>}
        </div>
        <h2 className="text-xl font-black break-words">{asset.name}</h2>

        <div className="flex gap-2">
          <a href={asset.url} download={asset.name} target="_blank" rel="noreferrer"
            className="flex-1 py-3 rounded-full bg-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Download
          </a>
          {canEdit && (
            <button onClick={async () => { if (confirm('Delete this file?')) { await deleteHqAsset(asset); onDeleted(); } }}
              className="px-4 py-3 rounded-full bg-white/10 text-[#ff6b6b] text-[10px] font-black uppercase tracking-widest flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {convKind && (
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
            <div className="flex items-center gap-2"><Repeat className="w-3.5 h-3.5 text-[#34e0d0]" /><p className="text-[10px] font-black uppercase tracking-widest text-white/70">Convert with Crossover</p></div>
            <div className="flex gap-2">
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-xs text-white outline-none [&>option]:bg-neutral-900">
                {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button onClick={convert} disabled={busy} className="px-4 py-2 rounded-xl bg-[#FF8C00] text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Convert'}
              </button>
            </div>
            {busy && <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#34e0d0]" style={{ width: `${pct * 100}%` }} /></div>}
            {outUrl && <a href={outUrl.url} download={outUrl.name} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#3ddc84]"><Download className="w-3.5 h-3.5" /> {outUrl.name}</a>}
            {err && <p className="text-[9px] text-[#ff6b6b] leading-relaxed">{err}</p>}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ContentHQ;
