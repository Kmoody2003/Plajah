// GenGallery — the gallery of generated work, as a view of Content HQ.
//
// It owns no files. It subscribes to a GalleryStore (services/generatedGallery), which is Content HQ's
// generated folder plus whatever was made in the last few seconds, and shows the slice its host asks
// for: the Generate panel passes "this shot / this production / everything"; Content HQ passes just
// "everything". The same component, the same records, in every place.
//
// Every item can be shared. Two routes, deliberately separate:
//   • the share icon — a link, for anywhere outside Plajah
//   • Post to Plajah — opens the Universal Post Composer with the image attached and a destination
//     picker (feed, clubs, sanctuaries, org feeds), the same flow academic assets use
// Either one first makes an unlisted public copy, because Content HQ files are private. Nothing about
// the prompt, production or shot is put into a share; the composer starts with the picture and a
// blank box.

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Send, Download, Trash2, X, Check, Film, Music, CloudOff, Loader2, Link2, CornerDownRight, FolderOpen, AlertTriangle } from 'lucide-react';
import {
  ensurePublicCopy, galleryFacets, matchesGalleryFilter, shareSeed,
  type GalleryFilter, type GalleryItem, type GalleryStore,
} from '../../services/generatedGallery';

const ShareToPlajahComposer = React.lazy(() => import('../ShareToPlajahComposer'));

/** The Plajah composer is a large piece of the main app with its own requirements. If it can't run
 *  where the gallery is hosted, that must cost the user a message — never the tool they were in. */
class ComposerBoundary extends React.Component<{ onFail: (reason: string) => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onFail(error?.message || 'unknown error'); }
  render() { return this.state.failed ? null : this.props.children; }
}

export interface GalleryScope { id: string; label: string; filter: GalleryFilter }

interface Props {
  store: GalleryStore;
  /** The slices this host offers, widest last. The first is shown initially. */
  scopes: GalleryScope[];
  /** Put an item to work where the gallery is hosted (lay it in the cut, attach it…). */
  onUse?: (item: GalleryItem, blob: Blob) => void | Promise<void>;
  useLabel?: string;
  /** Open the item's folder in Content HQ. */
  onOpenInHq?: (item: GalleryItem) => void;
  /** Upload a link-readable copy. Defaults to the owner's Plajah Photos library, unlisted. */
  publish?: (file: File, title: string) => Promise<{ url: string; photoId?: string } | undefined>;
  /** Replace the Plajah composer (used by tools that host their own). */
  onPostToPlajah?: (share: { item: GalleryItem; url: string; title: string }) => void;
  emptyHint?: string;
}

const VERDICT: Record<string, { label: string; color: string }> = {
  pass: { label: 'Matches', color: '#34d399' }, retry: { label: "Doesn't match", color: '#fb7185' }, review: { label: 'Worth a look', color: '#fbbf24' },
};

async function defaultPublish(file: File, title: string) {
  const { uploadPhoto } = await import('../../services/backendService');
  const photo = await uploadPhoto(file, { title, isPublic: false, isGalleryEligible: false });
  return photo ? { url: photo.url, photoId: photo.id } : undefined;
}

const Thumb: React.FC<{ item: GalleryItem; store: GalleryStore; fit?: 'cover' | 'contain' }> = ({ item, store, fit = 'cover' }) => {
  const [url, setUrl] = useState(item.previewUrl);
  useEffect(() => {
    let alive = true;
    if (item.previewUrl) { setUrl(item.previewUrl); return undefined; }
    void store.preview(item.id).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [item.id, item.previewUrl, store]);
  if (item.kind === 'audio') return <div className="gg-ph"><Music size={22} /></div>;
  if (!url) return <div className="gg-ph">{item.kind === 'video' ? <Film size={22} /> : <Loader2 size={18} className="gg-spin" />}</div>;
  return item.kind === 'video'
    ? <video src={url} muted playsInline preload="metadata" style={{ objectFit: fit }} />
    : <img src={url} alt={item.name} loading="lazy" style={{ objectFit: fit }} />;
};

const GenGallery: React.FC<Props> = ({ store, scopes, onUse, useLabel = 'Use', onOpenInHq, publish = defaultPublish, onPostToPlajah, emptyHint }) => {
  const [items, setItems] = useState<GalleryItem[]>(store.getItems());
  const [scopeId, setScopeId] = useState(scopes[0]?.id);
  const [verdict, setVerdict] = useState<GalleryFilter['verdict'] | ''>('');
  const [provider, setProvider] = useState('');
  const [text, setText] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');           // `${action}:${id}` while an action is in flight
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [composer, setComposer] = useState<{ item: GalleryItem; url: string; title: string } | null>(null);
  const noteTimer = useRef<any>(null);

  useEffect(() => store.subscribe(setItems), [store]);
  useEffect(() => () => clearTimeout(noteTimer.current), []);
  // If the host's scopes change (a different shot is selected), keep a valid one.
  useEffect(() => { if (!scopes.some((s) => s.id === scopeId)) setScopeId(scopes[0]?.id); }, [scopes, scopeId]);

  const say = (kind: 'ok' | 'err', t: string) => { setNote({ kind, text: t }); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(null), kind === 'ok' ? 2600 : 7000); };
  const scope = scopes.find((s) => s.id === scopeId) || scopes[0];
  const inScope = useMemo(() => items.filter((i) => matchesGalleryFilter(i, scope?.filter)), [items, scope]);
  const facets = useMemo(() => galleryFacets(inScope), [inScope]);
  const shown = useMemo(() => inScope.filter((i) => matchesGalleryFilter(i, { verdict: verdict || undefined, provider: provider || undefined, text: text || undefined })), [inScope, verdict, provider, text]);
  const open = openId ? items.find((i) => i.id === openId || i.hqAssetId === openId) : null;

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (e: any) { say('err', e?.message || 'That didn\'t work.'); }
    setBusy('');
  };
  const shareLink = (item: GalleryItem) => run(`share:${item.id}`, async () => {
    const url = await ensurePublicCopy(store, item.id, publish);
    const title = shareSeed(item).title;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share({ title, url }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
    }
    await navigator.clipboard.writeText(url);
    say('ok', 'Link copied — anyone with it can see this image.');
  });
  const postToPlajah = (item: GalleryItem) => run(`post:${item.id}`, async () => {
    const url = await ensurePublicCopy(store, item.id, publish);
    const share = { item, url, title: shareSeed(item).title };
    setOpenId(null);      // the composer takes the stage — the detail view must not sit over it
    if (onPostToPlajah) onPostToPlajah(share); else setComposer(share);
  });
  const use = (item: GalleryItem) => run(`use:${item.id}`, async () => { await onUse?.(item, await store.blob(item.id)); });
  const download = (item: GalleryItem) => run(`dl:${item.id}`, async () => {
    const url = URL.createObjectURL(await store.blob(item.id));
    const a = document.createElement('a'); a.href = url; a.download = item.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  const remove = (item: GalleryItem) => {
    if (!window.confirm(`Delete "${item.name}"${item.saved === 'hq' ? ' from Content HQ' : ''}? This can't be undone here.`)) return;
    void run(`rm:${item.id}`, async () => { await store.remove(item.id); setOpenId(null); });
  };

  const actions = (item: GalleryItem, full = false) => (
    <>
      <button className="gg-act" title="Share a link" aria-label={`Share a link to ${item.name}`} disabled={!!busy} onClick={(e) => { e.stopPropagation(); void shareLink(item); }}>
        {busy === `share:${item.id}` ? <Loader2 size={13} className="gg-spin" /> : item.generation.public ? <Link2 size={13} /> : <Share2 size={13} />}{full && ' Share link'}
      </button>
      <button className="gg-act plajah" title="Post to Plajah" aria-label={`Post ${item.name} to Plajah`} disabled={!!busy} onClick={(e) => { e.stopPropagation(); void postToPlajah(item); }}>
        {busy === `post:${item.id}` ? <Loader2 size={13} className="gg-spin" /> : <Send size={13} />}{full && ' Post to Plajah'}
      </button>
      {onUse && (
        <button className="gg-act" title={useLabel} aria-label={`${useLabel}: ${item.name}`} disabled={!!busy} onClick={(e) => { e.stopPropagation(); void use(item); }}>
          {busy === `use:${item.id}` ? <Loader2 size={13} className="gg-spin" /> : <CornerDownRight size={13} />}{full && ` ${useLabel}`}
        </button>
      )}
    </>
  );

  return (
    <div className="gg">
      <div className="gg-bar">
        <div className="gg-scopes" role="tablist" aria-label="Gallery scope">
          {scopes.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === scope?.id} className={`gg-chip ${s.id === scope?.id ? 'on' : ''}`} onClick={() => setScopeId(s.id)}>
              {s.label} <span>{items.filter((i) => matchesGalleryFilter(i, s.filter)).length}</span>
            </button>
          ))}
        </div>
        <input className="gg-search" placeholder="Search" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search generated work" />
      </div>
      {(facets.providers.length > 1 || Object.keys(facets.verdicts).some((v) => v !== 'unreviewed')) && (
        <div className="gg-filters">
          {(['pass', 'review', 'retry'] as const).filter((v) => facets.verdicts[v]).map((v) => (
            <button key={v} className={`gg-chip sm ${verdict === v ? 'on' : ''}`} onClick={() => setVerdict(verdict === v ? '' : v)}><i style={{ background: VERDICT[v].color }} /> {VERDICT[v].label} <span>{facets.verdicts[v]}</span></button>
          ))}
          {facets.providers.length > 1 && facets.providers.map(([id, name, n]) => (
            <button key={id} className={`gg-chip sm ${provider === id ? 'on' : ''}`} onClick={() => setProvider(provider === id ? '' : id)}>{name} <span>{n}</span></button>
          ))}
        </div>
      )}
      {!store.connected && <div className="gg-note warn"><CloudOff size={12} /> {store.offlineReason} Takes made now are kept for this session only.</div>}
      {note && <div className={`gg-note ${note.kind}`}>{note.kind === 'ok' ? <Check size={12} /> : <AlertTriangle size={12} />} {note.text}</div>}

      {!shown.length && <div className="gg-empty">{inScope.length ? 'Nothing matches those filters.' : (emptyHint || 'Nothing generated here yet. Takes appear the moment they come back, and are filed in Content HQ.')}</div>}
      <div className="gg-grid">
        {shown.map((item) => (
          <div key={item.id} className="gg-tile" role="button" tabIndex={0} onClick={() => setOpenId(item.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(item.id); }}>
            <Thumb item={item} store={store} />
            <div className="gg-badges">
              {item.generation.review && <span className="gg-badge" style={{ background: VERDICT[item.generation.review.verdict].color }} title={`${VERDICT[item.generation.review.verdict].label} · ${item.generation.review.score}/100`} />}
              {item.generation.board && <span className="gg-tag">board</span>}
              {(item.generation.attempt || 1) > 1 && <span className="gg-tag">take {item.generation.attempt}</span>}
              {item.saved === 'saving' && <span className="gg-tag"><Loader2 size={9} className="gg-spin" /> saving</span>}
              {item.saved === 'failed' && <span className="gg-tag bad" title={item.saveNote}>not saved</span>}
              {item.saved === 'local' && <span className="gg-tag" title={item.saveNote}>this session</span>}
            </div>
            <div className="gg-acts">{actions(item)}</div>
            <div className="gg-cap">{item.generation.slug ? `${item.generation.slug} · ` : ''}{item.generation.providerName || item.generation.provider}</div>
          </div>
        ))}
      </div>

      {open && (
        <div className="gg-light" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <div className="gg-sheet" role="dialog" aria-label={open.name}>
            <div className="gg-big"><Thumb item={open} store={store} fit="contain" /></div>
            <div className="gg-side">
              <div className="gg-head"><b>{open.name}</b><button className="gg-x" aria-label="Close" onClick={() => setOpenId(null)}><X size={15} /></button></div>
              <div className="gg-meta">
                <div><span>Model</span>{open.generation.providerName || open.generation.provider}{open.generation.local ? ' · your GPU' : ''}</div>
                {open.generation.productionTitle && <div><span>Production</span>{open.generation.productionTitle}{open.generation.slug ? ` · shot ${open.generation.slug}` : ''}</div>}
                {open.generation.sheetView && <div><span>Character sheet</span>{open.generation.sheetView.replace(/_/g, ' ')}</div>}
                {(open.generation.attempt || 1) > 1 && <div><span>Attempt</span>{open.generation.attempt}</div>}
                {open.generation.review && <div><span>Review</span><em style={{ color: VERDICT[open.generation.review.verdict].color }}>{VERDICT[open.generation.review.verdict].label}</em> · {open.generation.review.score}/100{open.generation.review.summary ? ` — ${open.generation.review.summary}` : ''}</div>}
                <div><span>Filed in</span>{open.saved === 'hq' ? <>Content HQ · {open.folder}</> : open.saved === 'saving' ? 'Saving to Content HQ…' : <em style={{ color: '#fbbf24' }}>{open.saveNote || 'Not saved'}</em>}</div>
                {open.generation.public && <div><span>Shared</span>An unlisted copy exists — anyone with the link can see it.</div>}
              </div>
              {open.generation.prompt && (
                <details className="gg-prompt"><summary>Prompt (only you see this)</summary><pre>{open.generation.prompt}</pre></details>
              )}
              <div className="gg-rowacts">{actions(open, true)}</div>
              <div className="gg-rowacts">
                <button className="gg-act" disabled={!!busy} onClick={() => void download(open)}><Download size={13} /> Download</button>
                {onOpenInHq && open.saved === 'hq' && <button className="gg-act" onClick={() => onOpenInHq(open)}><FolderOpen size={13} /> Open in Content HQ</button>}
                <button className="gg-act danger" disabled={!!busy} onClick={() => remove(open)}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {composer && (
        <ComposerBoundary onFail={() => { setComposer(null); say('err', 'The Plajah post composer couldn\'t open here. The link to this image is ready — use Share link, or post from the main Plajah app.'); }}>
        <Suspense fallback={null}>
          <ShareToPlajahComposer
            asset={{ kind: 'generated', title: composer.title, imageUrl: composer.item.kind === 'image' ? composer.url : undefined }}
            initialText=""
            attachments={[{ type: composer.item.kind === 'video' ? 'VIDEO' : 'PHOTO', url: composer.url, title: composer.title }]}
            accent="#a78bfa"
            onClose={() => setComposer(null)}
            onPosted={() => say('ok', 'Posted to Plajah.')}
          />
        </Suspense>
        </ComposerBoundary>
      )}

      <style>{`
        .gg{display:flex;flex-direction:column;gap:8px;min-width:0;color:#e7e5f0;font-size:12px}
        .gg-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .gg-scopes,.gg-filters{display:flex;gap:6px;flex-wrap:wrap}
        .gg-chip{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#b9b4cf;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer}
        .gg-chip.sm{padding:3px 8px;font-size:10.5px}
        .gg-chip.on{background:rgba(139,92,246,0.22);border-color:rgba(139,92,246,0.6);color:#ede9fe}
        .gg-chip span{opacity:.6;font-weight:500}
        .gg-chip i{width:7px;height:7px;border-radius:50%;display:inline-block}
        .gg-search{margin-left:auto;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e7e5f0;padding:5px 9px;font-size:11.5px;width:130px;max-width:100%}
        .gg-note{display:flex;gap:6px;align-items:flex-start;font-size:11px;line-height:1.45;border-radius:8px;padding:6px 9px}
        .gg-note.warn{color:#fcd34d;background:rgba(251,191,36,0.1)}.gg-note.ok{color:#6ee7b7;background:rgba(52,211,153,0.1)}.gg-note.err{color:#fecdd3;background:rgba(251,113,133,0.12)}
        .gg-empty{color:#9d98b3;text-align:center;padding:26px 10px;line-height:1.5}
        .gg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px}
        .gg-tile{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#0c0c14;border:1px solid rgba(255,255,255,0.08);cursor:pointer}
        .gg-tile:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}
        .gg-tile img,.gg-tile video{width:100%;height:100%;display:block}
        .gg-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#5b5675}
        .gg-badges{position:absolute;top:6px;left:6px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;right:6px}
        .gg-badge{width:10px;height:10px;border-radius:50%;border:2px solid rgba(0,0,0,0.55)}
        .gg-tag{display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;background:rgba(0,0,0,0.62);color:#e7e5f0;border-radius:5px;padding:2px 5px}
        .gg-tag.bad{color:#fecdd3}
        .gg-acts{position:absolute;right:6px;bottom:24px;display:flex;gap:4px}
        .gg-act{display:inline-flex;align-items:center;gap:5px;background:rgba(10,10,18,0.78);border:1px solid rgba(255,255,255,0.18);color:#f1eefb;border-radius:8px;padding:5px 7px;font-size:11px;font-weight:600;cursor:pointer}
        .gg-act:hover{background:rgba(40,36,60,0.95)}
        .gg-act.plajah{border-color:rgba(249,115,22,0.6);color:#fdba74}
        .gg-act.danger{color:#fda4af}
        .gg-act:disabled{opacity:.5;cursor:default}
        .gg-cap{position:absolute;left:0;right:0;bottom:0;padding:4px 7px;font-size:10px;color:#cfcbe0;background:linear-gradient(transparent,rgba(0,0,0,0.8));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .gg-spin{animation:gg-spin 1s linear infinite}@keyframes gg-spin{to{transform:rotate(360deg)}}
        .gg-light{position:fixed;inset:0;z-index:1200;background:rgba(4,4,10,0.84);display:flex;align-items:center;justify-content:center;padding:18px}
        .gg-sheet{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(250px,1fr);gap:0;width:min(1000px,100%);max-height:calc(100vh - 36px);background:#11111a;border:1px solid rgba(255,255,255,0.12);border-radius:14px;overflow:hidden}
        @media (max-width:720px){.gg-sheet{grid-template-columns:1fr;overflow:auto}}
        .gg-big{background:#07070c;min-height:240px;display:flex}
        .gg-big img,.gg-big video{width:100%;height:100%;max-height:calc(100vh - 36px)}
        .gg-side{padding:14px;display:flex;flex-direction:column;gap:10px;overflow:auto;min-width:0}
        .gg-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;overflow-wrap:anywhere}
        .gg-x{background:none;border:0;color:#9d98b3;cursor:pointer}
        .gg-meta{display:flex;flex-direction:column;gap:5px;font-size:11.5px;line-height:1.45;color:#d8d2ea}
        .gg-meta span{display:block;font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#8b86a3}
        .gg-meta em{font-style:normal;font-weight:700}
        .gg-prompt summary{cursor:pointer;color:#c4b5fd;font-size:11px}
        .gg-prompt pre{white-space:pre-wrap;word-break:break-word;font:11px/1.5 ui-monospace,Menlo,monospace;background:rgba(0,0,0,0.3);border-radius:7px;padding:8px;margin:6px 0 0;max-height:180px;overflow:auto}
        .gg-rowacts{display:flex;gap:6px;flex-wrap:wrap}
        .gg-rowacts .gg-act{background:rgba(255,255,255,0.05)}
      `}</style>
    </div>
  );
};

export default GenGallery;
