import React, { useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { ArrowLeft, Play, Pause, Share2, Heart, LogIn, Grid3x3, Boxes, LayoutTemplate, Music2, Volume2 } from 'lucide-react';
import { PhotoGallery, Photo, GalleryComment, Album, Track } from '../../types';
import { fetchUserPhotos, fetchGlobalPhotos, fetchAlbumById } from '../../services/backendService';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import { addGalleryComment, listenGalleryComments, toggleGalleryLike } from '../../services/galleryService';
import GalleryModern from './GalleryModern';
import GalleryPortfolio from './GalleryPortfolio';

// three.js only ships when the visitor opens the Walk view
const GalleryWalk = lazy(() => import('./GalleryWalk'));

type ViewType = 'MODERN' | 'WALK' | 'PORTFOLIO';

interface GalleryViewProps {
  gallery: PhotoGallery;
  photos?: Photo[];
  onBack: () => void;
  onVisitUser?: (uid: string) => void;
  currentUser?: { uid: string; displayName?: string | null; photoURL?: string | null } | null;
  /** VRM avatar URL for the current visitor (from Avatar Studio); enables 3rd-person walk. */
  avatarVrmUrl?: string;
}

const LOW_VOLUME = 0.18;

const GalleryView: React.FC<GalleryViewProps> = ({ gallery, photos: photosProp, onBack, onVisitUser, currentUser, avatarVrmUrl }) => {
  const [photos, setPhotos] = useState<Photo[]>(photosProp || []);
  const [view, setView] = useState<ViewType>(gallery.viewType || 'MODERN');
  const [comments, setComments] = useState<GalleryComment[]>([]);
  const [draft, setDraft] = useState('');
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(gallery.likesCount || 0);
  const [shareMsg, setShareMsg] = useState('');

  const player = useGlobalPlayerState();
  const soundtrackAlbum = useRef<Album | null>(null);
  const startedSoundtrack = useRef(false);

  // ── resolve photos by photoIds when not supplied ─────────────────────────────
  useEffect(() => {
    if (photosProp && photosProp.length) { setPhotos(orderPhotos(photosProp, gallery)); return; }
    let alive = true;
    (async () => {
      let pool: Photo[] = [];
      if (gallery.ownerId) pool = await fetchUserPhotos(gallery.ownerId);
      if (!pool.length) pool = await fetchGlobalPhotos();
      const byId = new Map(pool.map(p => [p.id, p]));
      const picked = gallery.photoIds?.length
        ? gallery.photoIds.map(id => byId.get(id)).filter(Boolean) as Photo[]
        : pool;
      if (alive) setPhotos(orderPhotos(picked, gallery));
    })();
    return () => { alive = false; };
  }, [gallery, photosProp]);

  // ── live comments ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gallery.id) return;
    const unsub = listenGalleryComments(gallery.id, setComments);
    return () => unsub();
  }, [gallery.id]);

  // ── soundtrack: low volume by default, but never hijack existing playback ─────
  const hasSoundtrack = !!gallery.soundtrackAlbumId;

  const loadSoundtrackAlbum = async (): Promise<Album | null> => {
    if (soundtrackAlbum.current) return soundtrackAlbum.current;
    if (!gallery.soundtrackAlbumId) return null;
    const album = await fetchAlbumById(gallery.soundtrackAlbumId);
    soundtrackAlbum.current = album;
    return album;
  };

  const pickTrack = (album: Album): Track | null => {
    if (gallery.soundtrackTrackId) {
      const t = album.tracks?.find(tr => tr.id === gallery.soundtrackTrackId);
      if (t) return t;
    }
    return album.tracks?.[0] || null;
  };

  const startSoundtrack = async () => {
    const album = await loadSoundtrackAlbum();
    if (!album) return;
    const track = pickTrack(album);
    if (!track) return;
    player.setVolume(LOW_VOLUME);         // photos are the star — enter quietly
    player.playTrack(track, album, 'LIBRARY');
    startedSoundtrack.current = true;
  };

  // Auto-start quietly ONLY when nothing is already playing (don't hijack the user).
  useEffect(() => {
    if (!hasSoundtrack || startedSoundtrack.current) return;
    if (!player.isPlaying && !player.currentTrack) {
      void startSoundtrack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSoundtrack]);

  const soundtrackIsCurrent = startedSoundtrack.current &&
    !!player.currentTrack && (!gallery.soundtrackTrackId || player.currentTrack.id === gallery.soundtrackTrackId);

  const onMusicToggle = () => {
    if (soundtrackIsCurrent) player.togglePlay();
    else void startSoundtrack();   // explicit gallery play → adopt the soundtrack (allowed to take over)
  };

  // ── actions ───────────────────────────────────────────────────────────────────
  const onLike = () => {
    if (!currentUser) return;
    const next = !liked;
    setLiked(next);
    setLikes(c => Math.max(0, c + (next ? 1 : -1)));
    if (gallery.id) void toggleGalleryLike(gallery.id, next);
  };

  const onShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}?g=${gallery.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: gallery.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setShareMsg('Link copied');
      setTimeout(() => setShareMsg(''), 1800);
    } catch { /* user dismissed */ }
  };

  const onPost = async () => {
    if (!draft.trim() || !currentUser || !gallery.id) return;
    const text = draft.trim();
    setDraft('');
    await addGalleryComment(gallery.id, text, {
      name: currentUser.displayName || undefined,
      photo: currentUser.photoURL || undefined,
    });
  };

  const visibility = gallery.visibility || (gallery.isPublic ? 'PUBLIC' : 'PRIVATE');
  const cover = gallery.coverImage || photos[0]?.url;

  return (
    <div style={S.root}>
      <style>{css}</style>

      {/* top bar */}
      <div style={S.topbar}>
        <button style={S.back} onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <span style={S.brandKick}>Plajah · Gallery</span>
      </div>

      <div className="pjg-frame">
        {/* ── album-like cover / share header ── */}
        <div className="pjg-cover">
          <div className="pjg-cover-bg" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
          <div className="pjg-cover-scrim" />
          <div className="pjg-cover-art" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
          <div className="pjg-cover-meta">
            <div className="pjg-kick">Gallery{gallery.tagline ? ` · ${gallery.tagline}` : ''}</div>
            <h2 className="pjg-title">{gallery.title}</h2>
            {gallery.curatorName && (
              <div className="pjg-by">
                Curated by{' '}
                <b
                  style={{ color: 'var(--text-primary,#F6F1FB)', cursor: onVisitUser ? 'pointer' : 'default' }}
                  onClick={() => gallery.ownerId && onVisitUser?.(gallery.ownerId)}
                >{gallery.curatorName}</b>
              </div>
            )}
            <div className="pjg-chips">
              <span className="pjg-chip">🖼 {photos.length} photos</span>
              {hasSoundtrack && <span className="pjg-chip">♪ Soundtrack</span>}
              {!!gallery.models3d?.length && <span className="pjg-chip">◈ {gallery.models3d.length} 3D</span>}
              <span className="pjg-chip">{visibility === 'PUBLIC' ? '🌐 Public' : visibility === 'UNLISTED' ? '🔗 Unlisted' : '🔒 Private'}</span>
            </div>
          </div>
          <div className="pjg-cta">
            <button className="pjg-pill pjg-ghost" onClick={onLike} title={currentUser ? 'Like' : 'Sign in to like'}>
              <Heart size={14} fill={liked ? 'var(--pj-magenta,#D40055)' : 'none'} color={liked ? 'var(--pj-magenta,#D40055)' : 'currentColor'} /> {likes || ''}
            </button>
            <button className="pjg-pill" onClick={onShare}><Share2 size={14} /> {shareMsg || 'Share'}</button>
            <button className="pjg-pill pjg-brand" onClick={() => setView('WALK')}><LogIn size={14} /> Enter</button>
          </div>
        </div>

        {/* ── view switch ── */}
        <div className="pjg-vswitch">
          <button className={view === 'MODERN' ? 'on' : ''} onClick={() => setView('MODERN')}><Grid3x3 size={13} /> Modern</button>
          <button className={view === 'WALK' ? 'on' : ''} onClick={() => setView('WALK')}><Boxes size={13} /> Walk-in (3D)</button>
          <button className={view === 'PORTFOLIO' ? 'on' : ''} onClick={() => setView('PORTFOLIO')}><LayoutTemplate size={13} /> Portfolio</button>
        </div>

        {/* ── active view ── */}
        <div className="pjg-stage">
          {view === 'MODERN' && <GalleryModern photos={photos} />}
          {view === 'PORTFOLIO' && <GalleryPortfolio photos={photos} title={gallery.title} />}
          {view === 'WALK' && (
            <Suspense fallback={<div className="pjg-walk-loading">Loading the exhibition…</div>}>
              <GalleryWalk photos={photos} models3d={gallery.models3d} onExit={() => setView('MODERN')} avatarVrmUrl={avatarVrmUrl} />
            </Suspense>
          )}
        </div>

        {/* ── minimalist music bar ── */}
        {hasSoundtrack && (
          <div className="pjg-music">
            <div className="pjg-music-cv" style={soundtrackAlbum.current?.coverImage ? { backgroundImage: `url(${soundtrackAlbum.current.coverImage})` } : undefined}>
              {!soundtrackAlbum.current?.coverImage && <Music2 size={16} />}
            </div>
            <div className="pjg-music-tk">
              <div className="n">{soundtrackIsCurrent ? (player.currentTrack?.title || 'Soundtrack') : 'Soundtrack'}</div>
              <div className="s">Set by the curator · minimal by design</div>
            </div>
            <button className="pjg-music-play" onClick={onMusicToggle}>
              {soundtrackIsCurrent && player.isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <div className="pjg-music-vol">
              <Volume2 size={14} />
              <input
                type="range" min={0} max={1} step={0.01}
                value={player.volume}
                onChange={e => player.setVolume(parseFloat(e.target.value))}
                aria-label="Soundtrack volume"
              />
            </div>
            <span className="pjg-music-note">the photos lead — turn it up if you like</span>
          </div>
        )}

        {/* ── comments ── */}
        <div className="pjg-comments">
          <h3>On this gallery · {comments.length}</h3>
          {comments.map(c => (
            <div className="pjg-cmt" key={c.id}>
              <div className="pjg-cmt-a" style={c.authorPhoto ? { backgroundImage: `url(${c.authorPhoto})` } : undefined} />
              <div className="pjg-cmt-bd">
                <div className="who">{c.authorName || 'Someone'}</div>
                {c.text}
              </div>
            </div>
          ))}
          {comments.length === 0 && <div className="pjg-cmt-empty">Be the first to leave a note.</div>}

          {currentUser ? (
            <div className="pjg-cinput">
              <div className="pjg-cmt-a" style={currentUser.photoURL ? { backgroundImage: `url(${currentUser.photoURL})` } : undefined} />
              <input
                className="f"
                placeholder="Leave a note on the gallery…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onPost(); }}
              />
              <button className="pjg-pill pjg-brand" onClick={onPost}>Post</button>
            </div>
          ) : (
            <div className="pjg-cmt-empty">Sign in to join the conversation.</div>
          )}
        </div>
      </div>
    </div>
  );
};

function orderPhotos(list: Photo[], gallery: PhotoGallery): Photo[] {
  const order = gallery.order?.length ? gallery.order : gallery.photoIds;
  if (!order?.length) return list;
  const byId = new Map(list.map(p => [p.id, p]));
  const ordered = order.map(id => byId.get(id)).filter(Boolean) as Photo[];
  const extras = list.filter(p => !order.includes(p.id));
  return [...ordered, ...extras];
}

// ── styles (album-like dark surface, matching the mockup + --pj-* tokens) ──────
const S: Record<string, React.CSSProperties> = {
  root: { minHeight: '100%', background: 'var(--pj-bg,#050409)', color: 'var(--text-primary,#F6F1FB)', paddingBottom: 40 },
  topbar: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', maxWidth: 1160, margin: '0 auto' },
  back: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--pj-border,rgba(255,255,255,.14))', color: 'inherit', borderRadius: 9999, height: 34, padding: '0 14px', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer' },
  brandKick: { fontSize: '.62rem', fontWeight: 800, letterSpacing: '.28em', textTransform: 'uppercase', color: 'var(--pj-faint,#6E6480)' },
};

const css = `
  .pjg-frame{max-width:1160px;margin:0 auto;border:1px solid var(--pj-border,rgba(255,255,255,.08));border-radius:24px;overflow:hidden;box-shadow:var(--pj-elev-4,0 20px 48px rgba(0,0,0,.6));background:var(--pj-bg2,#0A0810)}
  .pjg-cover{display:flex;gap:18px;align-items:flex-end;padding:20px;position:relative;overflow:hidden}
  .pjg-cover-bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.5;filter:blur(18px)}
  .pjg-cover-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,4,9,.4),var(--pj-bg2,#0A0810))}
  .pjg-cover-art{width:120px;height:120px;border-radius:16px;flex:none;position:relative;z-index:2;box-shadow:0 12px 40px rgba(0,0,0,.6);border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));background-size:cover;background-position:center;background-color:#1a1622;background-image:var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055))}
  .pjg-cover-meta{position:relative;z-index:2;min-width:0}
  .pjg-kick{font-size:.6rem;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:var(--pj-cyan,#00DAF3)}
  .pjg-title{font-style:italic;font-size:clamp(1.5rem,3.5vw,2.2rem);margin:4px 0;line-height:.95;font-weight:900}
  .pjg-by{font-size:.82rem;color:var(--pj-muted,#A398B4)}
  .pjg-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
  .pjg-chip{font-size:.64rem;font-weight:700;padding:5px 10px;border-radius:9999px;border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));color:var(--pj-muted,#A398B4);display:inline-flex;gap:5px;align-items:center;white-space:nowrap}
  .pjg-cta{position:relative;z-index:2;margin-left:auto;display:flex;gap:8px;align-self:center;flex-wrap:wrap;justify-content:flex-end}
  .pjg-pill{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 15px;border-radius:9999px;font-weight:700;font-size:.78rem;border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));color:var(--text-primary,#F6F1FB);background:var(--pj-glass-3,rgba(255,255,255,.09));cursor:pointer;white-space:nowrap}
  .pjg-pill.pjg-brand{background:var(--pj-grad-warm,linear-gradient(135deg,#6B0099,#D40055,#FF8C00));border-color:transparent;color:#fff}
  .pjg-pill.pjg-ghost{background:transparent}
  .pjg-vswitch{display:flex;gap:5px;padding:10px 20px;border-top:1px solid var(--pj-border,rgba(255,255,255,.08));border-bottom:1px solid var(--pj-border,rgba(255,255,255,.08));background:rgba(0,0,0,.25)}
  .pjg-vswitch button{border:0;background:transparent;color:var(--pj-muted,#A398B4);font-weight:800;font-size:.72rem;letter-spacing:.04em;padding:8px 15px;border-radius:9999px;cursor:pointer;display:inline-flex;gap:7px;align-items:center}
  .pjg-vswitch button.on{color:#fff;background:var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055))}
  .pjg-stage{position:relative;min-height:200px}
  .pjg-walk-loading{height:460px;display:grid;place-items:center;color:var(--pj-faint,#6E6480);font-size:.8rem;letter-spacing:.1em;text-transform:uppercase}
  .pjg-music{display:flex;align-items:center;gap:12px;padding:10px 20px;border-top:1px solid var(--pj-border,rgba(255,255,255,.08));background:rgba(0,0,0,.35);flex-wrap:wrap}
  .pjg-music-cv{width:38px;height:38px;border-radius:8px;flex:none;background-size:cover;background-position:center;background:var(--pj-grad-ember,linear-gradient(135deg,#D40055,#FF8C00));display:grid;place-items:center;color:#fff}
  .pjg-music-tk{min-width:0;flex:1}
  .pjg-music-tk .n{font-weight:700;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pjg-music-tk .s{font-size:.66rem;color:var(--pj-faint,#6E6480)}
  .pjg-music-play{width:34px;height:34px;border-radius:50%;background:var(--pj-glass-3,rgba(255,255,255,.09));border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));display:grid;place-items:center;cursor:pointer;flex:none;color:inherit}
  .pjg-music-vol{display:flex;align-items:center;gap:6px;color:var(--pj-muted,#A398B4)}
  .pjg-music-vol input{width:90px;accent-color:var(--pj-cyan,#00DAF3)}
  .pjg-music-note{font-size:.6rem;color:var(--pj-faint,#6E6480);white-space:nowrap}
  .pjg-comments{padding:16px 20px 22px;border-top:1px solid var(--pj-border,rgba(255,255,255,.08))}
  .pjg-comments h3{font-style:italic;font-size:1rem;margin:0 0 12px;font-weight:900}
  .pjg-cmt{display:flex;gap:10px;margin-bottom:12px}
  .pjg-cmt-a{width:32px;height:32px;border-radius:50%;flex:none;background-size:cover;background-position:center;background:var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))}
  .pjg-cmt-bd{background:var(--pj-glass-1,rgba(255,255,255,.045));border:1px solid var(--pj-border,rgba(255,255,255,.08));border-radius:14px;padding:8px 12px;font-size:.82rem}
  .pjg-cmt-bd .who{font-weight:800;font-size:.74rem;margin-bottom:2px}
  .pjg-cmt-empty{color:var(--pj-faint,#6E6480);font-size:.8rem;padding:4px 0 10px}
  .pjg-cinput{display:flex;gap:9px;align-items:center;margin-top:6px}
  .pjg-cinput .f{flex:1;background:var(--pj-glass-1,rgba(255,255,255,.045));border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));border-radius:9999px;padding:9px 14px;color:var(--text-primary,#F6F1FB);font-size:.82rem;outline:none}
`;

export default GalleryView;
