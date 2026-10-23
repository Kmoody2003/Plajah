// Artwork — the album's face. Three kinds, one square drop zone:
//
//   • Still: any image; a non-square one is fitted (cover-crop / contain-on-blur / stretch).
//   • Animated: a GIF or a ≤ 10 s loop (the Chora animated cover). It must match the cover's
//     square aspect — drop anything and the desk offers to fit it, or keeps it if it's square.
//   • Tela: open a Tela document as a tab right here in the desk, connected to this project.
//     Anything a Tela doc can hold can be the cover, interactive effects included; the desk
//     keeps a still of it for thumbnails and print.
//
// Back cover and disc face sit underneath for physical packaging.

import React, { Suspense, useCallback, useRef, useState } from 'react';
import { ImagePlus, Film, PenTool, Loader2, Check, Trash2, Sparkles, MousePointerClick } from 'lucide-react';
import { auth } from '../../../../../services/firebase';
import { deskOf, LOOP_MAX_SEC, type FitMode, type AnimatedCover } from '../../../../../services/melos/beats/releaseDesk';
import { newTelaId, saveTelaDoc, loadTelaDoc, publishTelaVersion } from '../../../../../services/telaStore';
import { image as telaImage, text as telaText, rect as telaRect } from '../../../../../services/tela/templateKit';
import { telaVectorSvg } from '../../../../../services/telaPageExport';
import type { TelaDoc, TelaVectorDevice } from '../../../../../types';
import { probeMedia, isSquare, squareStill, squareVideoLoop, squareGifLoop, fitRect, type MediaProbe } from './coverMotion';
import { Panel, Toggle, btnCls, SERIF, deskUpload, type BayProps } from './ui';

const TelaView = React.lazy(() => import('../../../../tela/TelaView'));
const TelaEmbed = React.lazy(() => import('../../../../tela/TelaEmbed'));

const COVER_SIDE = 1500;

type Pending = { file: File; probe: MediaProbe; target: 'still' | 'animated' };

/** Rasterise a Tela vector device to PNG. */
async function telaStill(device: TelaVectorDevice): Promise<Blob | null> {
  const url = URL.createObjectURL(new Blob([telaVectorSvg(device)], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = device.width; cv.height = device.height;
    cv.getContext('2d')!.drawImage(img, 0, 0);
    return await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

const FitPicker: React.FC<{ value: FitMode; onChange: (f: FitMode) => void }> = ({ value, onChange }) => (
  <div className="flex gap-1">
    {([['cover', 'Crop to fill'], ['contain', 'Fit on blur'], ['fill', 'Stretch']] as [FitMode, string][]).map(([f, label]) => (
      <button key={f} onClick={() => onChange(f)} className="h-7 px-2.5 rounded-lg text-[10.5px] border" style={value === f ? { color: '#fff', borderColor: '#00DAF3', background: 'rgba(0,218,243,0.12)' } : { color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.12)' }}>{label}</button>
    ))}
  </div>
);

export const ArtworkBay: React.FC<BayProps> = ({ project, mutate, productionId }) => {
  const art = project.desk?.artwork ?? {};
  const [tab, setTab] = useState<'cover' | 'tela'>('cover');
  const [pending, setPending] = useState<Pending | null>(null);
  const [fit, setFit] = useState<FitMode>('cover');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const stillRef = useRef<HTMLInputElement>(null);
  const motionRef = useRef<HTMLInputElement>(null);
  const packRef = useRef<HTMLInputElement>(null);
  const packTarget = useRef<'backCover' | 'discFace'>('backCover');
  const setArt = (fn: (a: NonNullable<ReturnType<typeof deskOf>['artwork']>) => void) => mutate((p) => { const d = deskOf(p); if (!d.artwork) d.artwork = {}; fn(d.artwork); });
  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 5000); };

  // ── drop handling ──
  const take = useCallback(async (file: File, target: 'still' | 'animated') => {
    try {
      const probe = await probeMedia(file);
      if (target === 'animated' && probe.kind === 'image') { flash('Animated covers are a GIF or a short video loop.'); return; }
      if (target === 'still' && probe.kind === 'video') target = 'animated';
      if (probe.kind === 'gif' && target === 'still') target = 'animated';
      setPending({ file, probe, target });
    } catch (e) { flash((e as Error).message); }
  }, []);

  const commit = useCallback(async () => {
    if (!pending) return;
    const { file, probe, target } = pending;
    const square = isSquare(probe.width, probe.height);
    try {
      if (target === 'still') {
        setBusy('Fitting the still…');
        const blob = square ? file : await squareStill(file, fit);
        const { url, durable } = await deskUpload(blob, file.name, productionId);
        mutate((p) => { p.coverImage = url; const d = deskOf(p); d.artwork = { ...(d.artwork ?? {}), primary: d.artwork?.primary ?? 'still' }; });
        flash(durable ? 'Cover set.' : 'Cover set for this session — sign in to keep it.');
      } else {
        const tooLong = probe.kind === 'video' && (probe.durationSec ?? 0) > LOOP_MAX_SEC + 0.05;
        let out: { blob: Blob; durationSec?: number; mime: string; kind: AnimatedCover['kind'] };
        if (square && !tooLong) {
          out = { blob: file, durationSec: probe.durationSec, mime: file.type, kind: probe.kind === 'gif' ? 'gif' : 'loop' };
        } else {
          setBusy(probe.kind === 'gif' ? 'Fitting the GIF to the square…' : 'Fitting the loop to the square…');
          const r = probe.kind === 'gif'
            ? await squareGifLoop(file, fit, (x) => setBusy(`Fitting… ${Math.round(x * 100)}%`))
            : await squareVideoLoop(file, fit, (x) => setBusy(`Fitting… ${Math.round(x * 100)}%`));
          out = { blob: r.blob, durationSec: r.durationSec, mime: r.blob.type || 'video/webm', kind: 'loop' };
        }
        setBusy('Uploading…');
        const ext = out.mime.includes('gif') ? 'gif' : out.mime.includes('mp4') ? 'mp4' : 'webm';
        const { url, durable } = await deskUpload(out.blob, `cover-loop.${ext}`, productionId);
        setArt((a) => {
          a.animated = { kind: out.kind, url, mime: out.mime, durationSec: out.durationSec, sourceW: probe.width, sourceH: probe.height, fit: square ? undefined : fit };
          a.primary = 'animated';
        });
        flash(durable ? 'Animated cover set — it plays on the album page.' : 'Animated cover set for this session only — sign in to keep it.');
      }
      setPending(null);
    } catch (e) {
      flash(`Couldn't fit that file: ${(e as Error).message}`);
    } finally { setBusy(null); }
  }, [pending, fit, productionId, mutate]);

  // ── Tela ──
  const ensureTelaDoc = useCallback(async (): Promise<string> => {
    if (art.tela?.docId) return art.tela.docId;
    setBusy('Opening a Tela document…');
    try {
      const now = Date.now();
      const objects = [telaRect(0, 0, COVER_SIDE, COVER_SIDE, '#120a1f', { label: 'Background', role: 'GROUND' })];
      if (project.coverImage) objects.push(telaImage(0, 0, COVER_SIDE, COVER_SIDE, project.coverImage, COVER_SIDE, COVER_SIDE, { label: 'Current cover' }));
      objects.push(telaText(90, COVER_SIDE - 260, COVER_SIDE - 180, project.publishing.title || 'Album Title', { size: 96, weight: 800, color: '#ffffff', label: 'Title' }));
      objects.push(telaText(90, COVER_SIDE - 140, COVER_SIDE - 180, project.publishing.artist || auth.currentUser?.displayName || 'Artist', { size: 48, weight: 500, color: '#D0BCFF', label: 'Artist' }));
      const device: TelaVectorDevice = { id: `dev_${now.toString(36)}`, type: 'VECTOR', name: 'Album cover', width: COVER_SIDE, height: COVER_SIDE, objects };
      const doc = {
        id: newTelaId(), ownerId: auth.currentUser?.uid || 'local', title: `${project.publishing.title || 'Album'} · Cover`, createdAt: now, updatedAt: now, bindings: [],
        frames: [{ id: `frame_${now.toString(36)}`, kind: 'SCREEN', preset: 'FREE', x: 0, y: 0, w: COVER_SIDE, h: COVER_SIDE, deviceIds: [device.id], label: 'Cover · 1:1' }],
        devices: { [device.id]: device },
      } as unknown as TelaDoc;
      await saveTelaDoc(doc);
      setArt((a) => { a.tela = { docId: doc.id, mode: 'follow-latest', frameId: doc.frames[0].id, interactive: false }; });
      return doc.id;
    } finally { setBusy(null); }
  }, [art.tela?.docId, project.coverImage, project.publishing, setArt]);

  const openTela = useCallback(async () => { await ensureTelaDoc(); setTab('tela'); }, [ensureTelaDoc]);

  /** Publish the doc's current state as the cover: a version for the live embed + a still. */
  const useTelaAsCover = useCallback(async () => {
    const id = art.tela?.docId; if (!id) return;
    setBusy('Publishing the Tela cover…');
    try {
      const doc = await loadTelaDoc(id);
      if (!doc) { flash('That Tela document is gone.'); return; }
      const frame = doc.frames.find((f) => f.id === art.tela?.frameId) ?? doc.frames[0];
      const device = frame && (doc.devices[frame.deviceIds?.[0] ?? ''] as TelaVectorDevice | undefined);
      let stillUrl = art.tela?.stillUrl;
      if (device?.type === 'VECTOR') {
        const png = await telaStill(device);
        if (png) stillUrl = (await deskUpload(png, 'tela-cover.png', productionId)).url;
      }
      const pubRes = await publishTelaVersion(doc, 'Album cover').catch(() => null);
      setArt((a) => {
        a.tela = { ...(a.tela ?? { docId: id, mode: 'follow-latest', interactive: false }), stillUrl, versionId: pubRes?.version?.versionId ?? a.tela?.versionId };
        a.primary = 'tela';
      });
      if (!project.coverImage && stillUrl) mutate((p) => { p.coverImage = stillUrl; });
      flash(device?.type === 'VECTOR' ? 'The Tela document is the cover.' : 'Linked — this frame has no vector device, so no still was made.');
    } finally { setBusy(null); }
  }, [art.tela, productionId, project.coverImage, mutate, setArt]);

  const pf = pending ? fitRect(pending.probe.width, pending.probe.height, 220, fit) : null;
  const primary = art.primary ?? (art.animated ? 'animated' : 'still');

  if (tab === 'tela' && art.tela?.docId) {
    return (
      <div className="flex flex-col h-[78vh] min-h-[520px] rounded-[12px] border border-white/10 overflow-hidden">
        <div className="flex items-center gap-2 px-3 h-10 border-b border-white/10 bg-[#0E0E13] flex-none">
          <button onClick={() => setTab('cover')} className="text-[11px] text-white/60 hover:text-white">← Artwork</button>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#D0BCFF]">Tela · Album Cover</span>
          <span className="text-[10px] text-white/35">connected to this project · square frame</span>
          <div className="flex-1" />
          {busy && <span className="text-[10px] font-mono text-[#FF8C00]">{busy}</span>}
          <button onClick={() => { void useTelaAsCover(); }} disabled={!!busy} className={btnCls} style={{ borderColor: 'rgba(212,0,85,0.5)', color: '#fff' }}><Check size={11} /> Use as album cover</button>
        </div>
        <div className="flex-1 min-h-0 relative">
          <Suspense fallback={<div className="h-full grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div>}>
            <TelaView initialDocId={art.tela.docId} onBack={() => setTab('cover')} />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-4">
      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="The album's face" hint="Chora covers are square. Whatever you choose here is what the album page shows.">
          <div className="flex gap-1 mb-3">
            {([['still', 'Still', !!project.coverImage], ['animated', 'Animated', !!art.animated], ['tela', 'Tela', !!art.tela?.docId]] as [NonNullable<typeof art.primary>, string, boolean][]).map(([k, label, has]) => (
              <button key={k} disabled={!has} onClick={() => setArt((a) => { a.primary = k; })}
                className="h-7 px-3 rounded-lg text-[10.5px] border disabled:opacity-30"
                style={primary === k ? { color: '#fff', borderColor: '#D40055', background: 'rgba(212,0,85,0.16)' } : { color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.12)' }}
              >{label}</button>
            ))}
          </div>
          {/* The square drop zone */}
          <div
            className="relative w-full max-w-[340px] aspect-square rounded-[14px] overflow-hidden border border-dashed border-white/20 bg-black/40 mx-auto"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void take(f, f.type.startsWith('image/') && f.type !== 'image/gif' ? 'still' : 'animated'); }}
          >
            {primary === 'animated' && art.animated ? (
              art.animated.kind === 'gif'
                ? <img src={art.animated.url} alt="Animated cover" className="w-full h-full object-cover" />
                : <video src={art.animated.url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
            ) : primary === 'tela' && art.tela?.docId ? (
              art.tela.interactive ? (
                <Suspense fallback={null}><TelaEmbed docId={art.tela.docId} mode={art.tela.mode} versionId={art.tela.versionId} frameId={art.tela.frameId} width={340} /></Suspense>
              ) : art.tela.stillUrl ? <img src={art.tela.stillUrl} alt="Tela cover" className="w-full h-full object-cover" /> : <div className="h-full grid place-items-center text-white/30 text-[11px]">Publish the Tela doc to see it here</div>
            ) : project.coverImage ? (
              <img src={project.coverImage} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className="h-full grid place-items-center text-center px-6">
                <div>
                  <ImagePlus size={26} className="mx-auto text-white/25" />
                  <p className="mt-2 text-[12px] text-white/40" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>Drop a cover, a GIF, or a ≤ 10 s loop</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
            <input ref={stillRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f, 'still'); e.target.value = ''; }} />
            <input ref={motionRef} type="file" accept="image/gif,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f, 'animated'); e.target.value = ''; }} />
            <button className={btnCls} onClick={() => stillRef.current?.click()}><ImagePlus size={11} /> Still cover</button>
            <button className={btnCls} onClick={() => motionRef.current?.click()}><Film size={11} /> GIF / 10 s loop</button>
            <button className={btnCls} onClick={() => { void openTela(); }} disabled={!!busy}><PenTool size={11} /> {art.tela?.docId ? 'Open Tela tab' : 'Design in Tela'}</button>
          </div>
          {note && <p className="mt-2 text-center text-[10.5px] text-[#FF8C00]">{note}</p>}
          {busy && !pending && <p className="mt-2 text-center text-[10.5px] font-mono text-[#FF8C00]">{busy}</p>}
        </Panel>

        {pending && (
          <Panel title={isSquare(pending.probe.width, pending.probe.height) ? 'Ready' : 'Fit to the square'}>
            <div className="flex gap-4 items-start flex-wrap">
              <div className="relative w-[220px] h-[220px] rounded-[10px] overflow-hidden bg-black border border-white/15 flex-none">
                {pf && (pending.probe.kind === 'video'
                  ? <video src={pending.probe.url} autoPlay muted loop playsInline className="absolute" style={{ left: pf.x, top: pf.y, width: pf.w, height: pf.h, objectFit: 'fill' }} />
                  : <img src={pending.probe.url} alt="" className="absolute" style={{ left: pf.x, top: pf.y, width: pf.w, height: pf.h, objectFit: 'fill' }} />)}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[11px] text-white/60">
                  {pending.probe.width}×{pending.probe.height}{pending.probe.durationSec ? ` · ${pending.probe.durationSec.toFixed(1)} s` : ''} — {isSquare(pending.probe.width, pending.probe.height) ? 'already square.' : 'not square; choose how it fills the cover.'}
                  {(pending.probe.durationSec ?? 0) > LOOP_MAX_SEC && ` Loops are capped at ${LOOP_MAX_SEC} s — the first ${LOOP_MAX_SEC} s are kept.`}
                </p>
                {!isSquare(pending.probe.width, pending.probe.height) && <FitPicker value={fit} onChange={setFit} />}
                {pending.probe.kind === 'gif' && !isSquare(pending.probe.width, pending.probe.height) && (
                  <p className="text-[9.5px] text-white/35">A refitted GIF is saved as a square video loop — it plays exactly like a GIF on the album page.</p>
                )}
                <div className="flex gap-1.5">
                  <button className={btnCls} onClick={() => { void commit(); }} disabled={!!busy} style={{ borderColor: 'rgba(212,0,85,0.5)', color: '#fff' }}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} {busy ?? (pending.target === 'still' ? 'Set as cover' : 'Set as animated cover')}
                  </button>
                  <button className={btnCls} onClick={() => setPending(null)} disabled={!!busy}>Cancel</button>
                </div>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Animated cover" hint={`GIFs and loops up to ${LOOP_MAX_SEC} s, square — they play muted and looped wherever the cover shows.`}
          right={art.animated ? <button onClick={() => setArt((a) => { a.animated = null; if (a.primary === 'animated') a.primary = 'still'; })} className="text-white/35 hover:text-[#EF4444]" aria-label="Remove animated cover"><Trash2 size={12} /></button> : null}>
          {art.animated ? (
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-black flex-none">
                {art.animated.kind === 'gif' ? <img src={art.animated.url} alt="" className="w-full h-full object-cover" /> : <video src={art.animated.url} autoPlay muted loop playsInline className="w-full h-full object-cover" />}
              </div>
              <div className="text-[11px] text-white/60 space-y-0.5">
                <div>{art.animated.kind === 'gif' ? 'GIF' : 'Video loop'} · {art.animated.durationSec ? `${art.animated.durationSec.toFixed(1)} s` : 'loop'}</div>
                {art.animated.sourceW && <div className="text-white/35">from {art.animated.sourceW}×{art.animated.sourceH}{art.animated.fit ? ` · ${art.animated.fit}` : ''}</div>}
              </div>
            </div>
          ) : <p className="text-[11px] text-white/35">None yet.</p>}
        </Panel>

        <Panel title="Tela cover" hint="The Tela tab edits the real document; “Use as album cover” publishes a version and keeps a still for thumbnails and print.">
          {art.tela?.docId ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button className={btnCls} onClick={() => setTab('tela')}><PenTool size={11} /> Open Tela tab</button>
                <button className={btnCls} onClick={() => { void useTelaAsCover(); }} disabled={!!busy}><Sparkles size={11} /> Use as album cover</button>
              </div>
              <Toggle on={!!art.tela.interactive} onChange={(v) => setArt((a) => { if (a.tela) a.tela.interactive = v; })} label="Play it live on the album page" hint="Interactive effects, animation and hover states run on the cover instead of the still." />
              <Toggle on={art.tela.mode === 'follow-latest'} onChange={(v) => setArt((a) => { if (a.tela) a.tela.mode = v ? 'follow-latest' : 'pinned'; })} label="Follow the latest version" hint="Off pins the version published last — later edits won't reach the album." />
              {art.tela.interactive && <p className="text-[9.5px] text-white/35 flex items-center gap-1"><MousePointerClick size={10} /> Listeners can interact with the cover.</p>}
            </div>
          ) : (
            <button className={btnCls} onClick={() => { void openTela(); }} disabled={!!busy}><PenTool size={11} /> Design the cover in Tela</button>
          )}
        </Panel>

        <Panel title="Packaging" hint="For CD inlays, vinyl jackets and J-cards — exported with the physical package metadata.">
          <input ref={packRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            const { url } = await deskUpload(f, f.name, productionId);
            const k = packTarget.current;
            setArt((a) => { a[k] = url; });
          }} />
          <div className="grid grid-cols-2 gap-3">
            {([['backCover', 'Back cover'], ['discFace', 'Disc / label face']] as const).map(([k, label]) => (
              <button key={k} onClick={() => { packTarget.current = k; packRef.current?.click(); }} className="aspect-square rounded-[10px] border border-dashed border-white/15 bg-black/30 overflow-hidden grid place-items-center text-[10.5px] text-white/40 hover:border-white/35">
                {art[k] ? <img src={art[k]} alt={label} className={`w-full h-full object-cover ${k === 'discFace' ? 'rounded-full' : ''}`} /> : label}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};
