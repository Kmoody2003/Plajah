/**
 * Living pages inside the regular Lorea reader (BookReader -> ComicReader), so a living picture book feels like every other book:
 * same header, toolbar, page bar, table of contents and page turns. The Tela edition's pages are the same pages as the album's
 * flat images (one frame per page), so each image page can be swapped for its live version; a page with no living data keeps its image.
 * The living controls (sound, read to me, reduced motion, play again) sit in one bar under the reader toolbar.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Album } from '../../types';
import type { BookTelaBundle } from '../../services/bookTela/upgrade';
import type { BookAudioApi } from '../../services/living/contracts';
import { frameObjects, frameSize, hasLiving, livingPageFor } from '../../services/living/runtime/objects';
import { loadBookAudio } from '../../services/living/runtime/audioProvider';
import { isChildrensBook } from '../../services/living/audio/audience';
import TelaLivePage, { type TelaLivePageHandle } from './TelaLivePage';
import { LivingReaderBar, useLivingPrefs } from './LivingReaderBar';

/** True when this album is an image-page book whose Tela edition carries living pages one-to-one (the showcase books). */
export function isLivingPictureBook(album: Pick<Album, 'bookChapters'>, bundle: BookTelaBundle | null | undefined): boolean {
  const living = bundle?.doc?.living; if (!living || !bundle) return false;
  const pages = album.bookChapters?.[0]?.pages?.length ?? 0;
  return pages > 0 && album.bookChapters!.length === 1 && pages === bundle.doc.frames.length && living.pages.some(p => hasLiving(living, p.page));
}

const readJson = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export interface LivingPictureBook {
  /** The live version of page `i` (0-based), or null to keep the image. */
  livePage: (i: number, active: boolean) => React.ReactNode | null;
  /** Sound / read-to-me / motion / replay controls. */
  bar: React.ReactNode;
}

export function useLivingPictureBook(album: Album, bundle: BookTelaBundle | null | undefined, enabled: boolean, goTo: (index: number) => void): LivingPictureBook | null {
  const doc = bundle?.doc; const living = doc?.living;
  const on = enabled && !!doc && !!living;
  const lp = useLivingPrefs(living?.defaults ? { narrate: living.defaults.narrate } : undefined);
  const [audio, setAudio] = useState<BookAudioApi | null>(null);
  const liveRef = useRef<TelaLivePageHandle>(null);

  useEffect(() => {
    if (!on) return; let alive = true;
    void loadBookAudio(living!.scores).then(a => { if (alive) setAudio(a); });
    return () => { alive = false; };
  }, [on, living]);
  useEffect(() => { if (audio) audio.setGains({ music: living?.defaults?.musicGain, sfx: living?.defaults?.sfxGain }); }, [audio, living]);
  useEffect(() => { if (audio) audio.setMuted(!lp.soundOn); }, [audio, lp.soundOn]);
  useEffect(() => { (audio as { setAudience?: (a: 'children' | 'general') => void } | null)?.setAudience?.(isChildrensBook(album) ? 'children' : 'general'); }, [audio, album]);
  useEffect(() => () => { audio?.stopAll(); }, [audio]);

  const livePage = useCallback((i: number, active: boolean): React.ReactNode | null => {
    if (!on || !doc || !living) return null;
    const f = doc.frames[i]; if (!f || !hasLiving(living, i + 1)) return null;
    const objs = frameObjects(doc, f); if (!objs.length) return null;
    const size = frameSize(doc, f);
    return (
      <div key={f.id} data-living-page-frame={i + 1} className="rounded-lg shadow-2xl ring-1 ring-white/10 overflow-hidden"
        style={{ height: '100%', maxWidth: '100%', aspectRatio: `${size.width} / ${size.height}` }}>
        <TelaLivePage ref={active ? liveRef : undefined} objects={objs} width={size.width} height={size.height} living={livingPageFor(living, i + 1)!}
          audio={audio} reducedMotion={lp.reduced} soundEnabled={lp.soundOn} active={active} autoNarrate={lp.narrate === 'auto'} hints={lp.hints} label={f.label || undefined}
          onGoto={p => goTo(p === 'next' ? i + 1 : p === 'prev' ? i - 1 : p - 1)}
          onGoal={(pg, id) => { const k = `plajah-living-goals-${album.id}`; writeJson(k, { ...readJson<Record<string, number>>(k, {}), [`${pg}:${id}`]: Date.now() }); }} />
      </div>
    );
  }, [on, doc, living, audio, lp.reduced, lp.soundOn, lp.narrate, lp.hints, album.id, goTo]);

  if (!on) return null;
  return { livePage, bar: <LivingReaderBar flat prefs={lp} onReplay={() => liveRef.current?.replay()} onReadNow={() => liveRef.current?.narrate()} /> };
}
