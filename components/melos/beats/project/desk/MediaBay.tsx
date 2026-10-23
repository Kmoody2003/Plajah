// Media — the album's videos (music videos, visualizers, lyric videos, live, BTS, trailer)
// with a per-video "Reello" switch and an upload-now button, and the photo slideshow.

import React, { useRef, useState } from 'react';
import { Film, ImagePlus, Trash2, ChevronUp, ChevronDown, UploadCloud, Loader2, Check } from 'lucide-react';
import { uploadVideo } from '../../../../../services/backendService';
import { deskOf, deskUid, type DeskVideo, type DeskVideoKind } from '../../../../../services/melos/beats/releaseDesk';
import { Panel, Field, inputCls, selectCls, btnCls, deskUpload, type BayProps } from './ui';

const KINDS: [DeskVideoKind, string][] = [
  ['music-video', 'Music video'], ['visualizer', 'Visualizer'], ['lyric-video', 'Lyric video'],
  ['live', 'Live'], ['behind-the-scenes', 'Behind the scenes'], ['trailer', 'Trailer'],
];

export const MediaBay: React.FC<BayProps> = ({ project, mutate, productionId }) => {
  const videos = project.desk?.videos ?? [];
  const photos = project.desk?.slideshow ?? [];
  const [busy, setBusy] = useState<Record<string, string>>({});
  const files = useRef(new Map<string, File>()); // local files not yet on Reello
  const vRef = useRef<HTMLInputElement>(null);
  const pRef = useRef<HTMLInputElement>(null);
  const setDesk = (fn: (d: ReturnType<typeof deskOf>) => void) => mutate((p) => fn(deskOf(p)));
  const patchVideo = (id: string, patch: Partial<DeskVideo>) => setDesk((d) => { d.videos = (d.videos ?? []).map((v) => (v.id === id ? { ...v, ...patch } : v)); });

  const addVideos = async (list: FileList) => {
    for (const file of Array.from(list)) {
      const id = deskUid();
      files.current.set(id, file);
      setDesk((d) => { d.videos = [...(d.videos ?? []), { id, title: file.name.replace(/\.[^.]+$/, ''), kind: 'music-video', url: URL.createObjectURL(file), toReello: true }]; });
      setBusy((b) => ({ ...b, [id]: 'Uploading…' }));
      try {
        const { url, durable } = await deskUpload(file, file.name, productionId, (p) => setBusy((b) => ({ ...b, [id]: `Uploading ${Math.round(p)}%` })));
        if (durable) patchVideo(id, { url });
      } finally { setBusy((b) => { const n = { ...b }; delete n[id]; return n; }); }
    }
  };

  /** Publish one video to Reello now (Mux upload, isRello) — independent of the album publish. */
  const sendToReello = async (v: DeskVideo) => {
    setBusy((b) => ({ ...b, [v.id]: 'Sending to Reello…' }));
    try {
      const file = files.current.get(v.id);
      const created = await uploadVideo({
        title: v.title, description: `${project.publishing.title || 'Album'} — ${project.publishing.artist || ''}`.trim(),
        url: file ? undefined : v.url, file, thumbnail: v.thumbnail || project.coverImage || '', isRello: true,
        // A private release keeps its videos private too (and doesn't ping followers).
        isPrivate: project.desk?.release?.visibility === 'private' || project.desk?.release?.visibility === 'intimate',
      } as Parameters<typeof uploadVideo>[0], (p) => setBusy((b) => ({ ...b, [v.id]: `Reello ${Math.round(p)}%` })));
      patchVideo(v.id, { reelloVideoId: created.id, toReello: true });
    } catch (e) {
      setBusy((b) => ({ ...b, [v.id]: `Failed: ${(e as Error).message}` }));
      setTimeout(() => setBusy((b) => { const n = { ...b }; delete n[v.id]; return n; }), 5000);
      return;
    }
    setBusy((b) => { const n = { ...b }; delete n[v.id]; return n; });
  };

  const addPhotos = async (list: FileList) => {
    for (const file of Array.from(list)) {
      const { url } = await deskUpload(file, file.name, productionId);
      setDesk((d) => { d.slideshow = [...(d.slideshow ?? []), { id: deskUid(), url }]; });
    }
  };
  const movePhoto = (i: number, dir: -1 | 1) => setDesk((d) => {
    const arr = [...(d.slideshow ?? [])]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; d.slideshow = arr;
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
      <Panel title="Videos" hint="Videos marked Reello are uploaded to Reello when the album publishes; “Send now” puts one there immediately."
        right={<><input ref={vRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void addVideos(e.target.files); e.target.value = ''; }} /><button className={btnCls} onClick={() => vRef.current?.click()}><Film size={11} /> Add videos</button></>}>
        {videos.length === 0 && <p className="text-[11px] text-white/35">No videos yet.</p>}
        <div className="space-y-2">
          {videos.map((v) => (
            <div key={v.id} className="grid grid-cols-[96px_1fr] gap-3 rounded-[10px] border border-white/10 p-2">
              <video src={v.url} muted playsInline className="w-24 h-[54px] rounded-md bg-black object-cover" onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }} onMouseLeave={(e) => e.currentTarget.pause()} />
              <div className="min-w-0 space-y-1.5">
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <input className={inputCls} value={v.title} onChange={(e) => patchVideo(v.id, { title: e.target.value })} aria-label="Video title" />
                  <button onClick={() => setDesk((d) => { d.videos = (d.videos ?? []).filter((x) => x.id !== v.id); })} className="w-7 h-8 grid place-items-center text-white/30 hover:text-[#EF4444]" aria-label={`Remove ${v.title}`}><Trash2 size={12} /></button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select className={selectCls} value={v.kind} onChange={(e) => patchVideo(v.id, { kind: e.target.value as DeskVideoKind })} aria-label="Video kind">
                    {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <select className={selectCls} value={v.trackId ?? ''} onChange={(e) => patchVideo(v.id, { trackId: e.target.value || undefined })} aria-label="Linked song">
                    <option value="">Whole album</option>
                    {project.tracks.map((t, i) => <option key={t.id} value={t.id}>{i + 1}. {t.title}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-[10.5px] text-white/65">
                    <input type="checkbox" checked={v.toReello} onChange={(e) => patchVideo(v.id, { toReello: e.target.checked })} className="accent-[#D40055]" /> Reello
                  </label>
                  {v.reelloVideoId ? (
                    <span className="text-[10px] text-[#06D6A0] flex items-center gap-1"><Check size={10} /> On Reello</span>
                  ) : (
                    <button onClick={() => { void sendToReello(v); }} disabled={!!busy[v.id]} className="h-6 px-2 rounded-md text-[9.5px] font-bold border border-[#D40055]/40 text-[#ff5c93] hover:bg-[#D40055]/10 disabled:opacity-40 flex items-center gap-1">
                      {busy[v.id] ? <Loader2 size={9} className="animate-spin" /> : <UploadCloud size={9} />} {busy[v.id] ?? 'Send to Reello now'}
                    </button>
                  )}
                  {busy[v.id] && v.reelloVideoId && <span className="text-[9.5px] font-mono text-[#FF8C00]">{busy[v.id]}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Slideshow" hint="Photos that play with the album (and in Show Mode's slides). Turn the slideshow on in Release."
        right={<><input ref={pRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void addPhotos(e.target.files); e.target.value = ''; }} /><button className={btnCls} onClick={() => pRef.current?.click()}><ImagePlus size={11} /> Add photos</button></>}>
        {photos.length === 0 && <p className="text-[11px] text-white/35">No photos yet.</p>}
        <div className="grid grid-cols-2 gap-2">
          {photos.map((ph, i) => (
            <div key={ph.id} className="rounded-[10px] border border-white/10 overflow-hidden">
              <img src={ph.url} alt={ph.caption || `Slide ${i + 1}`} className="w-full aspect-video object-cover" />
              <div className="p-1.5 space-y-1">
                <input className={inputCls} value={ph.caption ?? ''} placeholder="Caption" onChange={(e) => setDesk((d) => { d.slideshow = (d.slideshow ?? []).map((x) => (x.id === ph.id ? { ...x, caption: e.target.value } : x)); })} />
                <Field label="">
                  <select className={selectCls} value={ph.trackId ?? ''} onChange={(e) => setDesk((d) => { d.slideshow = (d.slideshow ?? []).map((x) => (x.id === ph.id ? { ...x, trackId: e.target.value || undefined } : x)); })} aria-label="Show with song">
                    <option value="">Any song</option>
                    {project.tracks.map((t, k) => <option key={t.id} value={t.id}>{k + 1}. {t.title}</option>)}
                  </select>
                </Field>
                <div className="flex justify-between">
                  <div className="flex">
                    <button onClick={() => movePhoto(i, -1)} disabled={i === 0} className="text-white/35 hover:text-white disabled:opacity-20" aria-label="Move earlier"><ChevronUp size={13} /></button>
                    <button onClick={() => movePhoto(i, 1)} disabled={i === photos.length - 1} className="text-white/35 hover:text-white disabled:opacity-20" aria-label="Move later"><ChevronDown size={13} /></button>
                  </div>
                  <button onClick={() => setDesk((d) => { d.slideshow = (d.slideshow ?? []).filter((x) => x.id !== ph.id); })} className="text-white/30 hover:text-[#EF4444]" aria-label="Remove photo"><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};
