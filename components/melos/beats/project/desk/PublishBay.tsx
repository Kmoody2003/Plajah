// Publish — the last bay. A readiness list drawn from everything the desk knows, then the two
// workflows: Chora (render every song through its pressing and open the Album Creator with the
// whole desk already filled in) and Audius (publish the Chora release to Audius once it exists).

import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, Circle, UploadCloud, Package, Radio, Loader2, ExternalLink } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../../services/firebase';
import { albumLayout } from '../../../../../services/melos/beats/masterProject';
import { checkPhysical, presetById, isValidIsrc } from '../../../../../services/melos/beats/releaseDesk';
import type { Album } from '../../../../../types';
import { buildShareUrl } from '../../../../../services/deepLinkService';
import { deskOf } from '../../../../../services/melos/beats/releaseDesk';
import { Panel, btnCls, inputCls, SERIF, type BayProps } from './ui';

const AudiusPublishModal = React.lazy(() => import('../../../../AudiusPublishModal'));

type Item = { label: string; state: 'done' | 'warn' | 'todo'; note?: string; bay?: string };

export const PublishBay: React.FC<BayProps & {
  busy: string | null;
  onPublishChora: () => void;
  onExportZip: () => void;
  onGoBay: (bay: string) => void;
  onLinkAlbum: (id: string) => void;
}> = ({ project, mutate, busy, onPublishChora, onExportZip, onGoBay, onLinkAlbum }) => {
  const desk = project.desk ?? {};
  const layout = albumLayout(project);
  const [audiusAlbum, setAudiusAlbum] = useState<Album | null>(null);
  const [loadingAudius, setLoadingAudius] = useState(false);
  const [linkId, setLinkId] = useState('');
  const albumId = desk.publish?.choraAlbumId;

  const synced = project.tracks.filter((t) => (t.timeCodedLyrics?.length ?? 0) > 0).length;
  const withLyrics = project.tracks.filter((t) => t.lyrics?.trim()).length;
  const isrcOk = project.tracks.filter((t) => isValidIsrc(t.meta?.isrc)).length;
  const credited = project.tracks.filter((t) => (t.meta?.credits?.length ?? 0) > 0).length;
  const physical = desk.physical ? checkPhysical(project, layout.tracks, presetById(desk.physical.presetId)) : [];
  const physErrors = physical.filter((c) => c.level === 'error').length;
  const n = project.tracks.length;

  const items: Item[] = [
    { label: 'Songs on the proof sheet', state: n ? 'done' : 'todo', note: n ? `${n} · ${Math.round(layout.totalSec / 60)} min` : undefined, bay: 'pressing' },
    { label: 'Title and artist', state: project.publishing.title && project.publishing.artist ? 'done' : 'todo', bay: 'credits' },
    { label: 'Cover', state: project.coverImage || desk.artwork?.animated || desk.artwork?.tela?.stillUrl ? 'done' : 'todo', note: desk.artwork?.primary ? `face: ${desk.artwork.primary}` : undefined, bay: 'artwork' },
    { label: 'Credits', state: credited === n && n ? 'done' : credited ? 'warn' : 'todo', note: `${credited}/${n} songs`, bay: 'credits' },
    { label: 'ISRCs', state: isrcOk === n && n ? 'done' : isrcOk ? 'warn' : 'todo', note: `${isrcOk}/${n} valid`, bay: 'credits' },
    { label: 'Lyrics synced', state: synced === withLyrics && withLyrics ? 'done' : synced ? 'warn' : 'todo', note: `${synced}/${withLyrics || n} with lyrics`, bay: 'pressing' },
    { label: 'Rights confirmed', state: desk.release?.rightsConfirmed ? 'done' : 'todo', bay: 'release' },
    ...(desk.physical ? [{ label: `Physical · ${presetById(desk.physical.presetId).label}`, state: (physErrors ? 'warn' : 'done') as Item['state'], note: physErrors ? `${physErrors} to fix` : 'ready', bay: 'physical' }] : []),
  ];

  const openAudius = async () => {
    if (!albumId) return;
    setLoadingAudius(true);
    try {
      const snap = await getDoc(doc(db, 'albums', albumId));
      if (snap.exists()) setAudiusAlbum({ ...(snap.data() as Album), id: albumId });
    } finally { setLoadingAudius(false); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-4">
      <Panel title="Readiness">
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.label}>
              <button onClick={() => it.bay && onGoBay(it.bay)} className="w-full flex items-center gap-2 py-1 text-left hover:bg-white/[0.03] rounded-md px-1">
                {it.state === 'done' ? <CheckCircle2 size={13} className="text-[#06D6A0]" /> : it.state === 'warn' ? <AlertTriangle size={13} className="text-[#F59E0B]" /> : <Circle size={13} className="text-white/25" />}
                <span className="text-[11.5px] text-white/80 flex-1">{it.label}</span>
                {it.note && <span className="text-[10px] font-mono text-white/35">{it.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Chora" hint="Renders every song through its inserts, pressing and the Suite, then opens the Album Creator with the desk's metadata, artwork, release options, media, visuals and show already set.">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={onPublishChora}
              disabled={!!busy || !n}
              className="h-9 px-4 rounded-full text-[11.5px] font-semibold text-white disabled:opacity-30 flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #6B0099, #D40055)', boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}
            ><UploadCloud size={13} /> {busy === 'publish' ? 'Pressing…' : albumId ? 'Publish an update to Chora' : 'Publish to Chora'}</button>
            <button onClick={onExportZip} disabled={!!busy || !n} className={btnCls}><Package size={12} /> {busy === 'zip' ? 'Rendering…' : 'Export master ZIP'}</button>
          </div>
          {albumId ? (
            <p className="mt-2 text-[10.5px] text-[#06D6A0] flex items-center gap-1"><CheckCircle2 size={11} /> On Chora · <span className="font-mono text-white/50">{albumId}</span>
              <a href={buildShareUrl('album', albumId)} target="_blank" rel="noreferrer" className="text-white/45 hover:text-white inline-flex items-center gap-0.5 ml-1"><ExternalLink size={10} /> open</a>
            </p>
          ) : (
            <div className="flex gap-1.5 mt-2 max-w-md">
              <input className={inputCls} placeholder="Already released? Paste its Chora album id" value={linkId} onChange={(e) => setLinkId(e.target.value.trim())} />
              <button className={btnCls} disabled={!linkId} onClick={() => onLinkAlbum(linkId)}>Link</button>
            </div>
          )}
        </Panel>

        <Panel title="Audius" hint="Audius publishes from the Chora release (its audio and metadata). Connect your Audius account in the next step.">
          {albumId ? (
            <button onClick={() => { void openAudius(); }} disabled={loadingAudius} className={btnCls}>
              {loadingAudius ? <Loader2 size={12} className="animate-spin" /> : <Radio size={12} />} Publish to Audius
            </button>
          ) : (
            <p className="text-[11.5px] text-white/45" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>
              Publish to Chora first — or switch on “Also publish to Audius” in Release and it goes out with the Chora publish.
            </p>
          )}
          {desk.publish?.audiusPermalink && (
            <a href={desk.publish.audiusPermalink} target="_blank" rel="noreferrer" className="mt-2 text-[10.5px] text-[#06D6A0] inline-flex items-center gap-1"><ExternalLink size={10} /> On Audius</a>
          )}
        </Panel>
      </div>

      {audiusAlbum && (
        <React.Suspense fallback={null}>
          <AudiusPublishModal
            album={audiusAlbum}
            onClose={() => setAudiusAlbum(null)}
            onPublished={(updated) => mutate((p) => {
              const d = deskOf(p);
              d.publish = { ...(d.publish ?? {}), audiusPermalink: updated.audiusPermalinks?.[0], audiusPublishedAt: Date.now() };
            })}
          />
        </React.Suspense>
      )}
    </div>
  );
};
