// Pixels shows — one per song. Attach a saved Plajah Pixels project to a song (it plays from
// Pixels on the album), open Pixels to author one against the song, or bounce the show to an
// MP4 through Pixels' offline renderer with the song's MASTERED audio, then send it to Reello,
// hand it to Fabula as an editable sequence, or just download it.

import React, { useEffect, useState } from 'react';
import { Sparkles, Film, Download, UploadCloud, Clapperboard, Loader2, RefreshCw } from 'lucide-react';
import { auth } from '../../../../../services/firebase';
import { listCloudProjects, loadCloudProject, type CloudProjectMeta } from '../../../../plajahPixels/services/projectService';
import { renderTimeline } from '../../../../plajahPixels/engine/core/offlineRenderer';
import { snapshotFromColumn, makeBlock } from '../../../../plajahPixels/engine/timeline/sceneTimeline';
import { exportPixelsToFabula } from '../../../../../services/fabulaBridge';
import { uploadVideo } from '../../../../../services/backendService';
import { renderProjectTrack, decodeCtx, type ProjectTrack } from '../../../../../services/melos/beats/masterProject';
import { deskOf, type PixelsShowLink } from '../../../../../services/melos/beats/releaseDesk';
import type { MasteringState } from '../../../../../services/melos/beats/fx/mastering';
import { downloadBlob } from '../../../../../services/melos/beats/render';
import { Panel, selectCls, btnCls, type BayProps } from './ui';

export const PixelsBay: React.FC<BayProps & { albumPressing: MasteringState | null }> = ({ project, mutate, albumPressing }) => {
  const [projects, setProjects] = useState<CloudProjectMeta[] | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const links = project.desk?.pixels ?? {};
  const uid = auth.currentUser?.uid;
  const setLink = (trackId: string, patch: Partial<PixelsShowLink> | null) => mutate((p) => {
    const d = deskOf(p);
    const next = { ...(d.pixels ?? {}) };
    if (patch === null) delete next[trackId]; else next[trackId] = { ...(next[trackId] ?? {}), ...patch };
    d.pixels = next;
  });
  const status = (id: string, msg: string | null) => setBusy((b) => { const n = { ...b }; if (msg) n[id] = msg; else delete n[id]; return n; });

  const refresh = () => { if (uid) void listCloudProjects(uid).then(setProjects).catch(() => setProjects([])); };
  useEffect(refresh, [uid]);

  const author = (t: ProjectTrack) => {
    // Pixels takes a playable track; the locker copy is the one with a URL.
    window.dispatchEvent(new CustomEvent('OPEN_PLAJAH_PIXELS', {
      detail: {
        track: { id: t.id, title: t.title, artist: project.publishing.artist, url: t.sample.lockerUrl, duration: t.sample.durationSec, albumCover: project.coverImage },
        album: { title: project.publishing.title, artist: project.publishing.artist, coverImage: project.coverImage },
      },
    }));
  };

  /** Bounce the attached show against the mastered song → MP4. */
  const bounce = async (t: ProjectTrack, to: 'download' | 'reello' | 'fabula') => {
    const link = links[t.id];
    if (!uid || !link?.projectId) return;
    try {
      status(t.id, 'Loading the show…');
      const loaded = await loadCloudProject(uid, link.projectId);
      status(t.id, 'Pressing the song…');
      const master = await renderProjectTrack(t, albumPressing, { masterFx: project.masterFx });
      if (!master) { status(t.id, 'Song audio unavailable'); return; }
      const audioBuffer = await decodeCtx().decodeAudioData(await master.blob.arrayBuffer());
      const snapshot = snapshotFromColumn(loaded.layers ?? [], 0, t.title);
      const timeline = { duration: audioBuffer.duration, blocks: [makeBlock(snapshot, 0, audioBuffer.duration)] };
      if (to === 'fabula') {
        await exportPixelsToFabula({
          title: `${t.title} · Pixels`, scenes: [{ key: 's0', name: loaded.projectName || t.title, snapshot }], cuts: [{ sceneKey: 's0', t: 0 }],
          totalDuration: audioBuffer.duration, fps: 30, palette: (loaded.config as { colorPalette?: string[] })?.colorPalette,
          song: { name: t.title, url: t.sample.lockerUrl, duration: audioBuffer.duration },
        });
        setLink(t.id, { sentTo: 'fabula' });
        window.dispatchEvent(new CustomEvent('OPEN_FABULA'));
        return;
      }
      const blob = await renderTimeline({
        timeline, audioBuffer, config: loaded.config, width: 1920, height: 1080, fps: 30,
        onProgress: (p, stage) => status(t.id, `${stage} ${Math.round(p * 100)}%`),
      });
      if (!blob) { status(t.id, 'Render failed (this browser needs WebCodecs H.264)'); return; }
      if (to === 'download') { downloadBlob(blob, `${t.title} — Pixels.mp4`); setLink(t.id, { sentTo: 'download' }); return; }
      status(t.id, 'Sending to Reello…');
      const file = new File([blob], `${t.title} — Pixels.mp4`, { type: 'video/mp4' });
      const isPrivate = project.desk?.release?.visibility === 'private' || project.desk?.release?.visibility === 'intimate';
      const v = await uploadVideo({ title: `${t.title} (Visualizer)`, file, isRello: true, isPrivate, thumbnail: project.coverImage || '' } as Parameters<typeof uploadVideo>[0], (p) => status(t.id, `Reello ${Math.round(p)}%`));
      setLink(t.id, { sentTo: 'reello', renderedUrl: v.url });
    } catch (e) {
      status(t.id, `Failed: ${(e as Error).message}`);
      setTimeout(() => status(t.id, null), 6000);
      return;
    }
    status(t.id, null);
  };

  return (
    <Panel title="Pixels shows · per song" hint="An attached show plays from Pixels on the album page. Bounces use the song's mastered audio, so the MP4 sounds like the release."
      right={<button onClick={refresh} className="text-white/40 hover:text-white" aria-label="Refresh Pixels projects"><RefreshCw size={12} /></button>}>
      {!uid && <p className="text-[11px] text-white/35">Sign in to use your Pixels projects.</p>}
      <div className="space-y-2">
        {project.tracks.map((t, i) => {
          const link = links[t.id];
          return (
            <div key={t.id} className="grid grid-cols-[1fr_1.2fr_auto] gap-2 items-center rounded-[10px] border border-white/[0.08] p-2">
              <div className="min-w-0">
                <div className="text-[11.5px] text-white truncate"><span className="font-mono text-white/30 mr-1.5">{i + 1}</span>{t.title}</div>
                <div className="text-[9.5px] text-white/35">{link?.sentTo ? `last sent to ${link.sentTo}` : link?.projectId ? 'show attached' : 'auto-show (Pixels picks)'}</div>
              </div>
              <select className={selectCls} value={link?.projectId ?? ''} disabled={!projects} onChange={(e) => {
                const id = e.target.value;
                setLink(t.id, id ? { projectId: id, projectName: projects?.find((p) => p.id === id)?.projectName } : null);
              }} aria-label={`Pixels show for ${t.title}`}>
                <option value="">Auto-show</option>
                {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
              </select>
              <div className="flex gap-1">
                <button className={btnCls} onClick={() => author(t)} title="Open Pixels with this song to build its show" disabled={!t.sample.lockerUrl}><Sparkles size={11} /> Build</button>
                {link?.projectId && (
                  <>
                    <button className={btnCls} disabled={!!busy[t.id]} onClick={() => { void bounce(t, 'download'); }} title="Bounce an MP4"><Download size={11} /></button>
                    <button className={btnCls} disabled={!!busy[t.id]} onClick={() => { void bounce(t, 'reello'); }} title="Render and publish to Reello"><UploadCloud size={11} /></button>
                    <button className={btnCls} disabled={!!busy[t.id]} onClick={() => { void bounce(t, 'fabula'); }} title="Open in Fabula to edit"><Clapperboard size={11} /></button>
                  </>
                )}
              </div>
              {busy[t.id] && <div className="col-span-3 text-[10px] font-mono text-[#FF8C00] flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> {busy[t.id]}</div>}
            </div>
          );
        })}
        {!project.tracks.length && <p className="text-[11px] text-white/35 flex items-center gap-1"><Film size={11} /> No songs yet.</p>}
      </div>
    </Panel>
  );
};
