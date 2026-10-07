import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { DossierEntry } from '../../data/dossier/registry';
import { fetchHallFilm } from '../../services/dossier/experiences/experienceFilmClient';
import { selectFilmSource, type ExperienceFilmPublic } from '../../services/dossier/experiences/experienceModel';

/**
 * "Watch the film" for one exhibit. Prefers the Mux copy the platform admin published for this exhibit
 * (experienceFilms/{exhibitId}, readable by any visitor), played through the platform's Mux Player with captions, and
 * falls back to the live canvas film (DossierFilmPlayer) when:
 *   - nothing is published, the doc is malformed, or the read fails or is slow (offline, rules not deployed yet);
 *   - Mux playback errors, or does not start within LOAD_BUDGET_MS (for example an Android-TV WebView without MSE).
 * The canvas film is never removed; it is the original and the fallback.
 */
const DossierFilmPlayer = React.lazy(() => import('./DossierFilmPlayer'));
const MuxPlayer = React.lazy(() => import('@mux/mux-player-react'));

const LOAD_BUDGET_MS = 15000;
const WAIT_FOR_PUBLISHED_MS = 1500;

const CSS = `
.dfm{position:fixed;inset:0;z-index:80;background:#000;color:#f3ead8;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
.dfm mux-player,.dfm .dfm-player{width:100%;height:100%;--media-object-fit:contain;--controls-backdrop-color:rgba(0,0,0,.55)}
.dfm-top{position:absolute;top:0;left:0;right:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:linear-gradient(180deg,rgba(0,0,0,.7),rgba(0,0,0,0));pointer-events:none}
.dfm-top h2{margin:0;font:600 13px/1 'Inter';letter-spacing:.2em;text-transform:uppercase;color:var(--dfm-a,#d4a24c)}
.dfm-top button{pointer-events:auto;background:none;border:0;color:inherit;cursor:pointer;padding:6px;border-radius:8px;display:inline-flex}
.dfm-top button:hover{background:rgba(255,255,255,.1)}
.dfm-load{position:absolute;inset:0;display:grid;place-items:center;font:500 13px 'Inter';letter-spacing:.2em;text-transform:uppercase;color:var(--dfm-a,#d4a24c);pointer-events:none}
`;

interface Props {
  entry: DossierEntry;
  onClose: () => void;
}

export default function DossierFilmHost({ entry, onClose }: Props) {
  // `undefined` = still resolving; `null` = nothing usable published.
  const [published, setPublished] = useState<ExperienceFilmPublic | null | undefined>(undefined);
  const [muxFailed, setMuxFailed] = useState(false);

  useEffect(() => {
    let live = true;
    // The hall prefetches this when the exhibit opens, so this is normally an instant cache hit.
    Promise.race([fetchHallFilm(entry.id), new Promise<null>(r => setTimeout(() => r(null), WAIT_FOR_PUBLISHED_MS))])
      .then(f => { if (live) setPublished(f); });
    return () => { live = false; };
  }, [entry.id]);

  const source = useMemo(
    () => (published === undefined ? null : selectFilmSource({ published, hasCanvasFilm: !!entry.film, muxFailed })),
    [published, entry.film, muxFailed],
  );

  if (!source) {
    return (
      <div className="dfm" role="dialog" aria-label="Dossier film" style={{ '--dfm-a': entry.theme?.accent } as React.CSSProperties}>
        <style>{CSS}</style>
        <div className="dfm-load">Preparing the film</div>
      </div>
    );
  }
  if (source.kind === 'none') {
    return (
      <div className="dfm" role="alertdialog" aria-label="Dossier film unavailable">
        <style>{CSS}</style>
        <div className="dfm-top"><h2>A Plajah Dossier · Film</h2><button onClick={onClose} aria-label="Close film"><X size={20} /></button></div>
        <div className="dfm-load">The film could not be played right now</div>
      </div>
    );
  }
  if (source.kind === 'canvas') {
    return (
      <React.Suspense fallback={null}>
        <DossierFilmPlayer load={entry.film!} onClose={onClose} />
      </React.Suspense>
    );
  }
  return <MuxFilm source={source} entry={entry} onClose={onClose} onFail={() => setMuxFailed(true)} />;
}

function MuxFilm({ source, entry, onClose, onFail }: { source: Extract<ReturnType<typeof selectFilmSource>, { kind: 'mux' }>; entry: DossierEntry; onClose: () => void; onFail: () => void }) {
  const started = useRef(false);
  const { film } = source;
  useEffect(() => {
    // If Mux has not produced a frame inside the budget, hand over to the canvas film (when there is one).
    const t = window.setTimeout(() => { if (!started.current) onFail(); }, LOAD_BUDGET_MS);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="dfm" role="dialog" aria-label="Dossier film" style={{ '--dfm-a': entry.theme?.accent } as React.CSSProperties}>
      <style>{CSS}</style>
      <div className="dfm-top">
        <h2>A Plajah Dossier · Film</h2>
        <button onClick={onClose} aria-label="Close film"><X size={20} /></button>
      </div>
      <React.Suspense fallback={<div className="dfm-load">Preparing the film</div>}>
        <MuxPlayer
          className="dfm-player"
          playbackId={film.muxPlaybackId}
          streamType="on-demand"
          title={film.title || entry.title}
          poster={source.poster}
          accentColor={entry.theme?.accent || '#d4a24c'}
          autoPlay
          crossOrigin="anonymous"
          defaultHiddenCaptions={false}
          onLoadedData={() => { started.current = true; }}
          onPlaying={() => { started.current = true; }}
          onError={() => { if (!started.current) onFail(); }}
          onEnded={() => { /* stay on the last frame; the viewer closes the film */ }}
        >
          {film.captionsUrl && <track kind="subtitles" src={film.captionsUrl} srcLang="en" label="English" default />}
        </MuxPlayer>
      </React.Suspense>
    </div>
  );
}
