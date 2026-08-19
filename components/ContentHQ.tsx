import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, FileText, Image as ImageIcon, Film, Music, File as FileIcon, Upload,
  Trash2, RotateCcw, Search, Loader2, HardDrive, Library, ArrowLeft, Lock, ShieldAlert,
} from 'lucide-react';
import ContentAssetManager from './ContentAssetManager';
import { Album } from '../types';
import {
  listHqAssets, addHqAsset, deleteHqAsset, humanFileSize,
  type OrgAsset, type OwnerScope,
} from '../services/orgAssets';
import { restoreHqAsset } from '../services/hqCollaboration';
import HqReviewPanel from './HqReviewPanel';
import { fetchMySubscription } from '../services/subscriptionService';
import { resolveContentHqEntitlements } from '../services/contentHqEntitlements';
import type { ContentHqEntitlements } from '../services/contentHqEntitlements';

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

// Deep-link bridge: a `content-hq:<assetId>` notification (see hqCollaboration.requestHqReview)
// navigates to the right Content HQ surface, then calls openHqAsset() to focus that asset's
// review panel. The module-level latch covers the race where the target tab mounts *after*
// the event fires; the CustomEvent covers the case where it is already mounted.
let pendingHqAssetId: string | null = null;
export function openHqAsset(assetId: string): void {
  pendingHqAssetId = assetId;
  window.dispatchEvent(new CustomEvent('plajah:openHqAsset', { detail: { assetId } }));
}

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
  const [showTrash, setShowTrash] = useState(false);
  const [trashed, setTrashed] = useState<OrgAsset[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [proEnabled, setProEnabled] = useState(scope.kind === 'org');
  const [entitlements, setEntitlements] = useState<ContentHqEntitlements>(() =>
    resolveContentHqEntitlements(scope.kind === 'org' ? { organization: { id: scope.id } as any } : {}));
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try { setAssets(await listHqAssets(scope)); } catch { /* rules / offline */ }
    setLoading(false);
  };
  const loadTrash = async () => {
    try { setTrashed((await listHqAssets(scope, true)).filter(a => a.deletedAt)); } catch { /* rules / offline */ }
  };
  useEffect(() => { load(); }, [scope.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: focus a specific asset's review panel once it is loaded into this scope.
  useEffect(() => {
    const onOpen = (e: Event) => setPendingId((e as CustomEvent).detail?.assetId || null);
    window.addEventListener('plajah:openHqAsset', onOpen);
    if (pendingHqAssetId) { setPendingId(pendingHqAssetId); pendingHqAssetId = null; }
    return () => window.removeEventListener('plajah:openHqAsset', onOpen);
  }, []);
  useEffect(() => {
    if (!pendingId) return;
    const found = assets.find(a => a.id === pendingId);
    if (found) { setShowTrash(false); setDetail(found); setPendingId(null); }
  }, [pendingId, assets]);
  useEffect(() => {
    if (scope.kind === 'org') {
      const next = resolveContentHqEntitlements({ organization: { id: scope.id } as any });
      setEntitlements(next); setProEnabled(true); return;
    }
    fetchMySubscription().then(subscription => {
      const next = resolveContentHqEntitlements({ subscription });
      setEntitlements(next); setProEnabled(next.collaboration);
    }).catch(() => setProEnabled(false));
  }, [scope.kind, scope.id]);

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
    const used = assets.reduce((sum, a) => sum + (a.deletedAt ? 0 : Number(a.sizeBytes || 0)), 0);
    const incoming = files.reduce((sum, f) => sum + f.size, 0);
    const cap = entitlements.storageLimitGb * 1024 ** 3;
    if (cap > 0 && used + incoming > cap) {
      setNotice(`These files exceed your ${entitlements.storageLimitGb} GB Content HQ storage allowance.`);
      return;
    }
    setNotice('');
    const targetFolder = folder === 'ALL' ? undefined : folder;
    setUploading(files.map((f) => ({ name: f.name, pct: 0 })));
    for (const f of files) {
      try {
        await addHqAsset(scope, f, targetFolder, (pct) =>
          setUploading((prev) => prev.map((u) => (u.name === f.name ? { ...u, pct } : u))));
      } catch (e: any) {
        setUploading((prev) => prev.map((u) => (u.name === f.name ? { ...u, pct: -1 } : u)));
        if (String(e?.message || '').startsWith('STORAGE_CAP_EXCEEDED')) {
          const cap = String(e.message).split(':')[1] || `${entitlements.storageLimitGb} GB`;
          setNotice(`Upload rejected — your Content HQ storage allowance (${cap}) is full.`);
        }
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
        <button onClick={() => { const next = !showTrash; setShowTrash(next); if (next) loadTrash(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
            showTrash ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50 hover:text-white'
          }`}>
          <Trash2 className="w-4 h-4" /> Trash
        </button>
        <input ref={fileInput} type="file" multiple className="hidden"
          onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ''; }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-white/35 mb-3 px-1">
        <span>Unlimited projects · {entitlements.plan === 'FREE' ? 'Basic' : 'Pro collaboration'}</span>
        <span>{humanFileSize(assets.reduce((n, a) => n + Number(a.sizeBytes || 0), 0))} / {entitlements.storageLimitGb} GB</span>
      </div>
      {notice && <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">{notice}</div>}

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

      {/* grid / trash */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showTrash ? (
          trashed.length === 0 ? (
            <div className="grid place-items-center h-48 text-center text-white/30 text-sm px-8">Trash is empty. Deleted files are recoverable here for 30 days.</div>
          ) : (
            <div className="space-y-2">
              {trashed.map((a) => {
                const days = a.retentionDeleteAt ? Math.max(0, Math.ceil((a.retentionDeleteAt - Date.now()) / 86400000)) : 30;
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
                    <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: `${TEAL}12`, color: `${TEAL}99` }}>{assetIcon(a.kind)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold truncate">{a.name}</div>
                      <div className="text-[11px] text-red-300/70 mt-0.5">Deletes in {days} day{days === 1 ? '' : 's'} · {humanFileSize(a.sizeBytes)}</div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={async () => { await restoreHqAsset(a); await loadTrash(); await load(); }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest">
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </button>
                        <button onClick={async () => { if (confirm('Permanently delete this file? This cannot be undone.')) { await deleteHqAsset(a); await loadTrash(); } }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-red-300 hover:text-red-200 text-[10px] font-black uppercase tracking-widest">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : loading ? (
          <div className="grid place-items-center h-40 text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="grid place-items-center h-48 text-center text-white/30 text-sm px-8">
            {canEdit ? 'No files yet. Upload brand specs, documents, images, and media — private to this account.' : 'No files.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {shown.map((a) => (
              <button key={a.id} onClick={() => setDetail(a)}
                className="relative text-left p-4 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-colors">
                {a.scanStatus === 'QUARANTINED' && (
                  <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 text-[9px] font-black uppercase tracking-wider"><ShieldAlert className="w-3 h-3" /> Blocked</span>
                )}
                {a.scanStatus === 'PENDING' && (
                  <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 text-[9px] font-black uppercase tracking-wider"><Loader2 className="w-3 h-3 animate-spin" /> Scanning</span>
                )}
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
        <HqReviewPanel asset={detail} canEdit={canEdit} proEnabled={proEnabled}
          onClose={() => setDetail(null)} onChanged={() => { load(); loadTrash(); }} />
      )}
    </div>
  );
};

export default ContentHQ;
