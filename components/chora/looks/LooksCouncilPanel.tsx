// LooksCouncilPanel — "ask the Art Council for a look" for the track that is playing.
//
// Six directors each propose a look in their own lens, the strongest standing tension is named in their own
// words, and a synthesis keeps both voices (lead's picture + counterpoint's treatment — never an average).
// Preview puts a proposal on the stage (looksSession override); Save adds it to the Looks list; Pin makes it
// this track's default. Aria stays the only voice to the user — this panel is the room behind her, so copy is
// written as "the council" / the directors' epithets, never a separate bot persona.
//
// Portals to document.body (platform rule: ancestors with transforms re-anchor position:fixed).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Save, Pin, Loader2 } from 'lucide-react';
import { useGlobalPlayerState } from '../../../contexts/GlobalPlayerContext';
import { COUNCIL_DIRECTORS } from '../../../services/council/councilDirectors';
import { convene, defaultLookModel, type LookDeliberation, type DirectorLook } from '../../../services/shaders/looksCouncil';
import { resolveCover } from '../../../services/shaders/coverArt';
import { saveLook, pinLookForTrack, pinnedLookId } from '../../../services/shaders/looksLibrary';
import { setLookOverride, getLookOverride } from '../../../services/shaders/looksSession';
import { setLooksOverlay } from '../../../services/shaders/looksOverlay';
import type { ShaderLook } from '../../../services/shaders/shaderLooks';

export default function LooksCouncilPanel({ onClose }: { onClose: () => void }) {
  const gp = useGlobalPlayerState();
  const track = gp?.currentTrack ?? null;
  const album: any = gp?.currentAlbum ?? null;
  const coverUrl: string | undefined = album?.coverArt || album?.coverUrl || track?.images?.[0];
  const [state, setState] = useState<{ phase: 'convening' | 'done'; d?: LookDeliberation }>({ phase: 'convening' });
  const [note, setNote] = useState('');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const [previewId, setPreviewId] = useState<string | null>(getLookOverride()?.id ?? null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const cover = await resolveCover(coverUrl);
      const d = await convene({
        track: { title: track?.title, artist: track?.artist, genre: track?.genre },
        hasCover: cover.real,
        palette: cover.real ? cover.palette : undefined,
      }, { model: defaultLookModel });
      if (!dead) setState({ phase: 'done', d });
    })();
    return () => { dead = true; };
  }, [track?.id, coverUrl]);

  // Preview dresses the album art itself (and the FX stage's Looks engine, if that is what's open).
  const preview = (look: ShaderLook) => { setLookOverride(look); setLooksOverlay({ enabled: true }); setPreviewId(look.id); };
  const save = (look: ShaderLook) => { const s = saveLook(look); setNote(s ? `Saved “${s.name}” to Looks.` : 'That look could not be saved.'); return s; };
  const pin = (look: ShaderLook) => {
    if (!track) return;
    const s = save(look); if (!s) return;
    pinLookForTrack(track.id, s.id);
    setLookOverride(null); setLooksOverlay({ enabled: true, lookId: undefined }); // the pin now decides what the art wears
    setNote(`Pinned “${s.name}” as the default for “${track.title}”.`);
  };

  const d = state.d;
  const pinned = pinnedLookId(track?.id);

  const Row = ({ title, sub, look, badge, accent }: { title: string; sub: string; look: ShaderLook; badge?: string; accent?: boolean }) => (
    <div className={`rounded-xl border p-3 ${accent ? 'border-small-orange/50 bg-small-orange/5' : 'border-white/10 bg-white/[0.03]'} ${previewId === look.id ? 'ring-1 ring-white/40' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-14 h-14 rounded-lg border border-white/10" style={{ background: look.fallbackCss }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-white truncate">{title}</span>
            {badge && <span className="shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{badge}</span>}
            {pinned === look.id && <span className="shrink-0 text-[8px] font-black uppercase tracking-widest text-small-orange">pinned</span>}
          </div>
          <div className="text-[10px] font-bold text-white/70 truncate">{look.name}</div>
          <p className="mt-1 text-[10px] leading-snug text-white/50">{sub}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        <button onClick={() => preview(look)} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-widest cursor-pointer"><Play size={10} />Preview</button>
        <button onClick={() => save(look)} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-white text-[9px] font-black uppercase tracking-widest hover:bg-white/20 cursor-pointer"><Save size={10} />Save</button>
        {track && <button onClick={() => pin(look)} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-white text-[9px] font-black uppercase tracking-widest hover:bg-white/20 cursor-pointer"><Pin size={10} />Pin to track</button>}
      </div>
    </div>
  );

  return createPortal(
    // Docked, NOT modal: no backdrop, so the album art you are previewing stays visible and clickable.
    // Bottom sheet on phones (art keeps the top half), a right-hand card on desktop.
    <div className="fixed inset-x-0 bottom-0 z-[300] pointer-events-none flex justify-center sm:justify-end p-3" role="dialog" aria-label="Art Council looks"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="pointer-events-auto w-full sm:w-[26rem] max-h-[46vh] sm:max-h-[70vh] overflow-y-auto rounded-3xl bg-[#101014]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Art Council · Looks</div>
            <div className="text-sm font-black text-white">{track ? `A look for “${track.title}”` : 'A look for what’s playing'}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-white/10 text-white/70 hover:text-white flex items-center justify-center cursor-pointer"><X size={14} /></button>
        </div>

        {state.phase === 'convening' && (
          <div className="flex items-center gap-2 py-8 justify-center text-[11px] text-white/50"><Loader2 size={14} className="animate-spin" />The council is looking at the cover and the music…</div>
        )}

        {d && (
          <>
            {d.tension && (
              <blockquote className="border-l-2 border-small-orange/60 pl-3 text-[11px] italic text-white/70">
                <span className="not-italic font-black text-white/50 text-[9px] uppercase tracking-widest block mb-0.5">
                  {COUNCIL_DIRECTORS[d.tension.a].epithet} and {COUNCIL_DIRECTORS[d.tension.b].epithet} disagree
                </span>
                “{d.tension.line}”
              </blockquote>
            )}
            <Row accent title="The synthesis" badge="both voices" look={d.synthesis.look} sub={d.synthesis.note} />
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 pt-1">The six proposals</div>
            {d.proposals.map((p: DirectorLook) => (
              <Row key={p.directorId} title={COUNCIL_DIRECTORS[p.directorId].epithet} look={p.look}
                badge={p.source === 'ai' ? 'drafted' : 'house look'}
                sub={p.rationale + (p.issues.length ? ` · ${p.issues.length} note${p.issues.length > 1 ? 's' : ''} from the editor` : '')} />
            ))}
          </>
        )}
        {note && <div className="text-[10px] text-small-orange font-bold" role="status">{note}</div>}
      </div>
    </div>,
    document.body,
  );
}
