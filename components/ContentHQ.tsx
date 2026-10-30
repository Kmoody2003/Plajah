import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, FileText, Image as ImageIcon, Film, Music, File as FileIcon, Upload,
  Trash2, RotateCcw, Search, Loader2, HardDrive, Library, ArrowLeft, Lock, ShieldAlert,
  Sparkles, Eye, Layers, KeyRound, ExternalLink, LayoutTemplate, BookOpen,
} from 'lucide-react';
import { auth } from '../services/firebase';
import HqTemplatesTab from './templates/HqTemplatesTab';
import ContentAssetManager from './ContentAssetManager';
import { Album } from '../types';
import {
  listHqAssets, addHqAsset, deleteHqAsset, humanFileSize,
  getOrgDepartmentFolders, getOrgEducationFolderName, isOrgEducationFolderName,
  TEACHER_DOCUMENT_CLASS_FOLDERS, resolveDocumentClassFolder, isStandaloneTeacherScopeId,
  GREAT_FAITH_MINISTRIES_NAME, GREAT_FAITH_MINISTRIES_DEFAULT_ID,
  type OrgAsset, type OwnerScope,
} from '../services/orgAssets';
import { ensureAllDetectedLinksOnboarded, listIngestedUnits, type IngestedCurriculumUnit } from '../services/curriculumIngestionService';
import { restoreHqAsset, trashHqAsset } from '../services/hqCollaboration';
import HqReviewPanel from './HqReviewPanel';
import { fetchMySubscription } from '../services/subscriptionService';
import { resolveContentHqEntitlements } from '../services/contentHqEntitlements';
import type { ContentHqEntitlements } from '../services/contentHqEntitlements';
import { TelaDocumentPreviewModal } from './church/TelaDocumentPreviewModal';
import { openLessonLibrary } from '../services/lessonLibraryNav';

// ─────────────────────────────────────────────────────────────────────────
// Content HQ — an admin surface for an org OR a single account: a private
// Digital Asset Manager (arbitrary files / brand specs / documents, powered by
// services/orgAssets) plus the owner's published media library (the existing
// ContentAssetManager). Convert files in place via the Crossover engine.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  scope: OwnerScope;
  canEdit: boolean;
  /** Strictly true ONLY for Course Teachers/Instructors, Department Heads, and Department Admins. Defaults to `canEdit`. */
  canViewAnswerKey?: boolean;
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

const ContentHQ: React.FC<Props> = ({ scope, canEdit, canViewAnswerKey, mediaOwnerUid, onEditAlbum, onClose }) => {
  const [tab, setTab] = useState<'FILES' | 'MEDIA' | 'TEMPLATES'>('FILES');
  const allowAnswerKeys = canViewAnswerKey ?? canEdit;

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
          <div className="text-[11px] text-white/40 mt-0.5">{scope.label || (scope.kind === 'org' ? GREAT_FAITH_MINISTRIES_NAME : 'Account')} · private</div>
        </div>
        {!canEdit && <span className="ml-2 flex items-center gap-1 text-[10px] text-white/40"><Lock className="w-3 h-3" /> Read-only</span>}
        <div className="ml-auto flex gap-1.5 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => openLessonLibrary(scope.kind === 'org' && !isStandaloneTeacherScopeId(scope.id) ? { orgId: scope.id, orgName: scope.label } : { mine: true })}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest bg-[#34e0d0]/15 text-[#34e0d0] border border-[#34e0d0]/40 hover:bg-[#34e0d0]/25"
            title="Lessons, assignments and exams as Tela pages: preview, copy, assign and schedule"
          >
            <BookOpen className="w-3.5 h-3.5" /> Lesson Library
          </button>
          {([['FILES', 'Files & Docs', FolderOpen], ['MEDIA', 'Media Library', Library], ['TEMPLATES', 'Templates', LayoutTemplate]] as const).map(([id, label, Icon]) => (
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
          ? <HqFilesTab scope={scope} canEdit={canEdit} canViewAnswerKey={allowAnswerKeys} />
          : tab === 'TEMPLATES'
            ? <HqTemplatesTab scope={{ kind: scope.kind === 'org' && !isStandaloneTeacherScopeId(scope.id) ? 'org' : 'user', id: scope.id, label: scope.label }} canEdit={canEdit} viewer={{ uid: auth.currentUser?.uid || 'local', name: auth.currentUser?.displayName || 'You' }} />
            : <ContentAssetManager uid={mediaOwnerUid} onEditAlbum={onEditAlbum || (() => {})} />}
      </div>
    </div>
  );
};

// ── Files & Docs — the private DAM (exported so per-account dashboards can embed it) ──
export const HqFilesTab: React.FC<{
  scope: OwnerScope;
  canEdit: boolean;
  canViewAnswerKey?: boolean;
  defaultFolder?: string;
}> = ({ scope, canEdit, canViewAnswerKey, defaultFolder }) => {
  const allowAnswerKeyAccess = canViewAnswerKey ?? canEdit;
  const isUserScope = scope.kind === 'user' || isStandaloneTeacherScopeId(scope.id);
  const resolvedOrgName = scope.label || GREAT_FAITH_MINISTRIES_NAME;
  const orgEducationFolderName = getOrgEducationFolderName(resolvedOrgName);

  const normalizedInitialFolder = useMemo(() => {
    if (!defaultFolder || defaultFolder === 'ALL') return 'ALL';
    if (!isUserScope && isOrgEducationFolderName(defaultFolder, resolvedOrgName)) {
      return orgEducationFolderName;
    }
    return defaultFolder;
  }, [defaultFolder, isUserScope, resolvedOrgName, orgEducationFolderName]);

  const [assets, setAssets] = useState<OrgAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<string>(normalizedInitialFolder);
  const [docClassFilter, setDocClassFilter] = useState<string>('ALL');
  const [variantFilter, setVariantFilter] = useState<'ALL' | 'ORIGINAL_SOURCE' | 'TELA_DOCUMENT' | 'ANSWER_KEY'>('ALL');
  const [uploading, setUploading] = useState<{ name: string; pct: number }[]>([]);
  const [detail, setDetail] = useState<OrgAsset | null>(null);
  const [telaPreviewAsset, setTelaPreviewAsset] = useState<OrgAsset | null>(null);
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
    try {
      // Only an org's own id: a missing scope must not fall back to another org's library.
      if (!isUserScope && scope.id) {
        await ensureAllDetectedLinksOnboarded(
          scope.id,
          undefined,
          resolvedOrgName
        ).catch(() => {});
      }
      setAssets(await listHqAssets(scope));
    } catch { /* rules / offline */ }
    setLoading(false);
  };
  const loadTrash = async () => {
    try { setTrashed((await listHqAssets(scope, true)).filter(a => a.deletedAt)); } catch { /* rules / offline */ }
  };
  useEffect(() => { load(); }, [scope.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh when curriculum ingestion copies new Original + Tela Document pairs into orgAssets
  useEffect(() => {
    const onAssetsUpdated = () => { load(); };
    window.addEventListener('plajah:orgAssetsUpdated', onAssetsUpdated);
    return () => window.removeEventListener('plajah:orgAssetsUpdated', onAssetsUpdated);
  }, [scope.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Folder scopes:
  // - For standalone teachers (`isUserScope`): the 5 Document Class Folders (`Lessons & Course Resources`, `Assignments & Worksheets`, `Quizzes & Assessments`, `Syllabi & Master Source Docs`, `Answer Keys & Rubrics`)
  // - For organizations (`!isUserScope`): `<Organization Name> Education` + organization departments
  const departmentFolders = useMemo(() => {
    if (isUserScope) {
      return TEACHER_DOCUMENT_CLASS_FOLDERS
        .filter((f) => allowAnswerKeyAccess || !f.isAnswerKeyFolder)
        .map((f) => ({
          id: f.id,
          folderName: f.folderName,
          iconEmoji: f.iconEmoji,
          isChristianEd: true,
        }));
    }
    return getOrgDepartmentFolders(undefined, resolvedOrgName);
  }, [isUserScope, allowAnswerKeyAccess, resolvedOrgName]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    departmentFolders.forEach((d) => set.add(d.folderName));
    assets.forEach((a) => { if (a.folder) set.add(a.folder); });
    const ordered = [
      ...departmentFolders.map((d) => d.folderName),
      ...Array.from(set).filter((f) => !departmentFolders.some((d) => d.folderName === f)).sort(),
    ];
    return ['ALL', ...ordered];
  }, [assets, departmentFolders]);

  const visibleAssets = useMemo(
    () => (allowAnswerKeyAccess ? assets : assets.filter((a) => a.assetVariant !== 'ANSWER_KEY' && a.folder !== 'Answer Keys & Rubrics')),
    [assets, allowAnswerKeyAccess]
  );

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: visibleAssets.length };
    visibleAssets.forEach((a) => {
      const f = a.folder || 'Uncategorized';
      counts[f] = (counts[f] || 0) + 1;
    });
    return counts;
  }, [visibleAssets]);

  const docClassCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    visibleAssets.forEach((a) => {
      if (folder !== 'ALL' && a.folder !== folder) return;
      counts.ALL += 1;
      const dc =
        a.documentClassFolder ||
        resolveDocumentClassFolder({
          unitTitle: a.name,
          isAnswerKey: a.assetVariant === 'ANSWER_KEY',
        });
      counts[dc] = (counts[dc] || 0) + 1;
    });
    return counts;
  }, [visibleAssets, folder]);

  const shown = useMemo(() => visibleAssets.filter((a) => {
    const matchesFolder = folder === 'ALL' || a.folder === folder;
    if (!matchesFolder) return false;
    if (!isUserScope && docClassFilter !== 'ALL') {
      const dc =
        a.documentClassFolder ||
        resolveDocumentClassFolder({
          unitTitle: a.name,
          isAnswerKey: a.assetVariant === 'ANSWER_KEY',
        });
      if (dc !== docClassFilter) return false;
    }
    if (variantFilter !== 'ALL' && a.assetVariant !== variantFilter) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [visibleAssets, folder, isUserScope, docClassFilter, variantFilter, search]);

  // The library lesson an asset belongs to (its Original, Tela document or key), for "Assign to class".
  const lessonUnits = useMemo(() => listIngestedUnits(scope.id, undefined, scope.label), [scope.id, scope.label, assets]);
  const lessonFor = (a: OrgAsset): IngestedCurriculumUnit | undefined => {
    if (a.assetVariant === 'ANSWER_KEY') return undefined;
    return lessonUnits.find(u => u.originalAssetId === a.id || u.telaAssetId === a.id || (!!a.telaDocId && u.telaDocId === a.telaDocId));
  };

  // Resolve paired asset when previewing a curriculum item as a Tela Document
  const resolveTelaPreviewProps = (asset: OrgAsset) => {
    const paired = asset.pairedAssetId ? assets.find((x) => x.id === asset.pairedAssetId) : undefined;
    const telaDocId = asset.telaDocId || paired?.telaDocId;
    const originalAsset = asset.assetVariant === 'ORIGINAL_SOURCE' ? asset : (paired?.assetVariant === 'ORIGINAL_SOURCE' ? paired : asset);
    const answerKeyAsset = allowAnswerKeyAccess
      ? assets.find(
          (x) => x.assetVariant === 'ANSWER_KEY' && (x.telaDocId === telaDocId || x.pairedAssetId === asset.id)
        )
      : undefined;
    return {
      title: asset.name.replace(/\s*\((Original Source|Original Document|Interactive Tela Document|Teacher Answer Key)\)\s*$/i, ''),
      telaDocId,
      originalUrl: originalAsset?.sourceUrl || asset.sourceUrl || (asset as any).downloadUrl,
      originalText: originalAsset?.rawContentText || asset.rawContentText,
      answerKeyText: allowAnswerKeyAccess ? answerKeyAsset?.rawContentText : undefined,
      canViewAnswerKey: allowAnswerKeyAccess,
      orgName: resolvedOrgName,
      departmentFolder: asset.folder || (isUserScope ? 'Lessons & Course Resources' : orgEducationFolderName),
    };
  };

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
    setUploading(files.map((f) => ({ name: f.name, pct: 0 })));
    for (const f of files) {
      const targetFolder =
        folder !== 'ALL'
          ? folder
          : isUserScope
            ? resolveDocumentClassFolder({ unitTitle: f.name })
            : orgEducationFolderName;
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
      {/* Folder Scope Bar:
          - Standalone Teachers (`isUserScope`): Folders for each Document Class (Lessons & Course Resources, Assignments & Worksheets, Quizzes & Assessments, Syllabi & Master Source Docs, Answer Keys & Rubrics)
          - Organizations (`!isUserScope`): `<Organization Name> Education` + Organization Departments */}
      {departmentFolders.length > 0 && (
        <div className="mb-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">
                {isUserScope
                  ? `${resolvedOrgName} · Document Class Folders`
                  : `${resolvedOrgName} · Department Folder Scopes`}
              </span>
              <span className="text-[10px] text-white/40">
                {isUserScope
                  ? 'Every uploaded or extracted lesson, assignment, quiz, syllabus, or answer key is organized into its document class folder'
                  : `Select a department folder scope (e.g. ${orgEducationFolderName}) to manage Original Source, Interactive Tela & Answer Keys`}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {(
                [
                  ['ALL', 'All Variants'],
                  ['ORIGINAL_SOURCE', 'Original Docs'],
                  ['TELA_DOCUMENT', 'Tela Documents'],
                  ...(allowAnswerKeyAccess ? ([['ANSWER_KEY', 'Answer Keys (Teachers & Admins)']] as const) : []),
                ] as const
              ).map(([vId, vLabel]) => (
                <button
                  key={vId}
                  onClick={() => setVariantFilter(vId)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                    variantFilter === vId
                      ? 'bg-[#34e0d0]/20 text-[#34e0d0] border border-[#34e0d0]/40'
                      : 'bg-white/5 text-white/50 hover:text-white'
                  }`}
                >
                  {vLabel}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => {
                setFolder('ALL');
                setDocClassFilter('ALL');
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                folder === 'ALL'
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>{isUserScope ? 'All Document Classes' : 'All Departments'}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/20">
                {folderCounts.ALL || 0}
              </span>
            </button>
            {departmentFolders.map((dept) => {
              const count = folderCounts[dept.folderName] || 0;
              const active = folder === dept.folderName;
              const isEducationFolder = dept.isChristianEd || dept.folderName === orgEducationFolderName;
              return (
                <button
                  key={dept.id}
                  onClick={() => {
                    setFolder(dept.folderName);
                    setDocClassFilter('ALL');
                  }}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border ${
                    active
                      ? isEducationFolder
                        ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                        : 'bg-white/20 text-white border-white/30'
                      : isEducationFolder
                      ? 'bg-emerald-500/10 text-emerald-300/90 border-emerald-500/25 hover:bg-emerald-500/20'
                      : 'bg-white/5 text-white/55 border-transparent hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{dept.iconEmoji}</span>
                  <span>{dept.folderName}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30 text-white font-black">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Document Class Sub-Folders inside `<Organization Name> Education` */}
          {!isUserScope && (folder === 'ALL' || folder === orgEducationFolderName) && (
            <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 shrink-0 mr-1">
                {orgEducationFolderName} · Document Classes:
              </span>
              <button
                type="button"
                onClick={() => setDocClassFilter('ALL')}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                  docClassFilter === 'ALL'
                    ? 'bg-emerald-400 text-black'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                All Classes ({docClassCounts.ALL || 0})
              </button>
              {TEACHER_DOCUMENT_CLASS_FOLDERS.filter(
                (f) => allowAnswerKeyAccess || !f.isAnswerKeyFolder
              ).map((dc) => (
                <button
                  key={dc.id}
                  type="button"
                  onClick={() => setDocClassFilter(dc.folderName)}
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition ${
                    docClassFilter === dc.folderName
                      ? 'bg-emerald-400 text-black'
                      : 'bg-white/5 text-white/65 hover:text-white'
                  }`}
                >
                  <span>{dc.iconEmoji}</span>
                  <span>{dc.shortLabel}</span>
                  <span className="opacity-75">({docClassCounts[dc.folderName] || 0})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-white/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={folder === 'ALL' ? (isUserScope ? 'Search across all document class folders...' : 'Search files across all departments...') : `Search files in ${folder}...`}
            className="bg-transparent text-sm outline-none flex-1 text-white placeholder:text-white/30" />
        </div>
        {canEdit && (
          <button onClick={() => fileInput.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8C00] text-black text-xs font-black uppercase tracking-widest">
            <Upload className="w-4 h-4" /> Upload{folder !== 'ALL' ? ` to ${folder}` : ''}
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
        <span>
          {isUserScope
            ? `${resolvedOrgName} · Active Document Class Folder: ${folder === 'ALL' ? 'All Document Classes' : folder}`
            : `${resolvedOrgName} · Active Folder Scope: ${folder === 'ALL' ? 'All Departments' : folder}`}
        </span>
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
            {canEdit
              ? isUserScope
                ? `No files in ${folder === 'ALL' ? 'your Teacher Content HQ' : `"${folder}"`} yet. Upload or extract lessons, assignments, quizzes, syllabi, or answer keys from links/PDFs in Teacher Tools to automatically populate your Document Class folders.`
                : `No files in ${folder === 'ALL' ? 'this organization' : folder} yet. Upload brand specs, documents, or ingest ${orgEducationFolderName} curriculum to automatically populate both Original & Tela Document versions.`
              : 'No files.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map((a) => {
              const isTelaVariant = a.assetVariant === 'TELA_DOCUMENT';
              const isOriginalVariant = a.assetVariant === 'ORIGINAL_SOURCE';
              const isAnswerKeyVariant = a.assetVariant === 'ANSWER_KEY';
              const canPreviewAsTela = Boolean(
                a.telaDocId || a.assetVariant || a.rawContentText || isOrgEducationFolderName(a.folder, resolvedOrgName)
              );
              return (
                <div key={a.id} onClick={() => setDetail(a)}
                  className="relative text-left p-4 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-colors cursor-pointer flex flex-col justify-between">
                  <div>
                    {a.scanStatus === 'QUARANTINED' && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 text-[9px] font-black uppercase tracking-wider"><ShieldAlert className="w-3 h-3" /> Blocked</span>
                    )}
                    {a.scanStatus === 'PENDING' && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 text-[9px] font-black uppercase tracking-wider"><Loader2 className="w-3 h-3 animate-spin" /> Scanning</span>
                    )}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{
                        background: isTelaVariant ? 'rgba(16,185,129,0.16)' : isOriginalVariant ? 'rgba(56,189,248,0.16)' : `${TEAL}18`,
                        color: isTelaVariant ? '#34d399' : isOriginalVariant ? '#38bdf8' : TEAL,
                      }}>
                        {isTelaVariant ? <Layers className="w-5 h-5" /> : isAnswerKeyVariant ? <KeyRound className="w-5 h-5" /> : assetIcon(a.kind)}
                      </div>
                      {a.assetVariant && (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          isTelaVariant
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : isOriginalVariant
                            ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                            : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                        }`}>
                          {isTelaVariant ? 'Interactive Tela Doc' : isOriginalVariant ? 'Original Document' : 'Answer Key'}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] font-semibold line-clamp-2 leading-snug">{a.name}</div>
                    <div className="text-[11px] text-white/40 mt-1">{a.kind} · {humanFileSize(a.sizeBytes)}</div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {a.folder && (
                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-white/70 font-semibold">
                          {isOrgEducationFolderName(a.folder, resolvedOrgName)
                            ? `🎓 ${orgEducationFolderName}`
                            : a.folder}
                        </span>
                      )}
                      {!isUserScope && a.documentClassFolder && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-[9px] text-sky-200 font-semibold">
                          {a.documentClassFolder}
                        </span>
                      )}
                      {a.pairedAssetId && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-300 font-semibold">
                          ↔ Paired Copy
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action bar for Tela Document Preview + Source Link + Trash */}
                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-1.5">
                    {canEdit && lessonFor(a) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const u = lessonFor(a)!;
                          openLessonLibrary(isUserScope ? { mine: true, assignUnitIds: [u.id] } : { orgId: scope.id, orgName: scope.label, assignUnitIds: [u.id] });
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#34e0d0]/15 hover:bg-[#34e0d0]/25 border border-[#34e0d0]/35 text-[#34e0d0] text-[10px] font-black uppercase tracking-wider transition-colors"
                        title="Assign this lesson to a class and schedule it"
                      >
                        <BookOpen className="w-3.5 h-3.5" /> Assign to class
                      </button>
                    )}
                    {canPreviewAsTela ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTelaPreviewAsset(a);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 text-[10px] font-black uppercase tracking-wider transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Preview as Tela Doc
                      </button>
                    ) : <span />}
                    {a.sourceUrl && (
                      <a
                        href={a.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                        title="Open Original Source Link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {canEdit && (
                      <button onClick={async (e) => { e.stopPropagation(); if (confirm('Move this file to Trash? It stays recoverable for 30 days, then is permanently deleted.')) { await trashHqAsset(a); await load(); } }}
                        className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                        title="Move to Trash">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {detail && (
        <HqReviewPanel asset={detail} canEdit={canEdit} proEnabled={proEnabled}
          onClose={() => setDetail(null)} onChanged={() => { load(); loadTrash(); }} />
      )}

      {telaPreviewAsset && (
        <TelaDocumentPreviewModal
          isOpen={Boolean(telaPreviewAsset)}
          onClose={() => setTelaPreviewAsset(null)}
          {...resolveTelaPreviewProps(telaPreviewAsset)}
        />
      )}
    </div>
  );
};

export default ContentHQ;
