import React, { useEffect, useState } from 'react';
import { Music, Film, Clapperboard, FolderOpen, Lock, ExternalLink, Play, Download, Loader2 } from 'lucide-react';
import MiniMusicPlayer from '../MiniMusicPlayer';
import PostVideo from '../PostVideo';
import type { Album, Video } from '../../types';
import { embedKindLabel, embedShareUrl, type ChatEmbed } from '../../services/chat/chatEmbed';
import type { PublicTransferInfo } from '../../services/drive/transfersClient';
import { formatBytes } from '../../services/chat/chatCore';

// One shared item in a chat bubble, played or viewed in place — the same players the social feed
// uses (MiniMusicPlayer through the global player, PostVideo on Mux HLS). Each viewer resolves the
// item through their OWN read access; if they can't open it they get a card that links out.

type Resolved =
  | { state: 'loading' }
  | { state: 'album'; album: Album }
  | { state: 'video'; video: Video }
  | { state: 'film'; item: any; playable?: { url?: string; muxPlaybackId?: string; poster?: string } }
  | { state: 'transfer'; info: PublicTransferInfo }
  | { state: 'missing' };

const cache = new Map<string, Promise<Resolved>>();

async function resolveEmbed(e: ChatEmbed): Promise<Resolved> {
  const m = await import('../../services/backendService');
  switch (e.kind) {
    case 'ALBUM':
    case 'TRACK': {
      let album: Album | null = await m.fetchAlbumById(e.id).catch(() => null);
      if (!album) album = await m.fetchProjectFromCloud(e.id).catch(() => null);
      if (!album || !(album.tracks || []).length) return { state: 'missing' };
      if (e.kind === 'TRACK' && e.trackId) {
        const t = album.tracks.find(x => x.id === e.trackId);
        // A shared song plays that song: the card holds just it (the album opens from "Open").
        if (t) album = { ...album, tracks: [t] };
      }
      return { state: 'album', album };
    }
    case 'VIDEO':
    case 'REELLO': {
      const video = await m.fetchVideoById(e.id).catch(() => null);
      return video ? { state: 'video', video } : { state: 'missing' };
    }
    case 'MOVIE': {
      // Same order the /share?type=movie link uses: creator film (album), movie video, archive title.
      let item: any = await m.fetchProjectFromCloud(e.id).catch(() => null);
      if (!item) item = await m.fetchVideoById(e.id).catch(() => null);
      if (!item) {
        try {
          const arch = await import('../../services/archiveContentService');
          const raw = await arch.fetchArchiveVideoById(e.id);
          if (raw) item = arch.archiveVideoToAlbum(raw);
        } catch { /* not an archive title */ }
      }
      if (!item) return { state: 'missing' };
      // Free titles play right in the chat; anything sold/rented opens in Cinema, where checkout lives.
      const paid = Number(item.price || 0) > 0 || !!item.isPremium || !!item.requiresPurchase;
      let playable: { url?: string; muxPlaybackId?: string; poster?: string } | undefined;
      if (!paid) {
        const poster = item.thumbnailUrl || item.coverImage || e.imageUrl;
        if (item.muxPlaybackId || (item.url && /\.(m3u8|mp4|webm|mov)(\?|$)/i.test(item.url))) {
          playable = { url: item.url, muxPlaybackId: item.muxPlaybackId, poster };
        } else {
          const t = (item.tracks || []).find((x: any) => x.muxPlaybackId || x.videoUrl);
          if (t) playable = { url: t.videoUrl, muxPlaybackId: t.muxPlaybackId, poster };
        }
      }
      return { state: 'film', item, playable };
    }
    case 'TRANSFER': {
      const { createTransfersApi } = await import('../../services/drive/transfersClient');
      const info = await createTransfersApi(async () => null).inspectPublic(e.id, { inline: true }).catch(() => null);
      return info ? { state: 'transfer', info } : { state: 'missing' };
    }
  }
}

function useResolved(e: ChatEmbed): Resolved {
  const key = `${e.kind}:${e.id}:${e.trackId || ''}`;
  const [r, setR] = useState<Resolved>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    if (!cache.has(key)) cache.set(key, resolveEmbed(e).catch(() => ({ state: 'missing' } as Resolved)));
    cache.get(key)!.then(v => { if (live) setR(v); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return r;
}

const KIND_ICON: Record<ChatEmbed['kind'], React.ComponentType<{ size?: number; className?: string }>> = {
  ALBUM: Music, TRACK: Music, VIDEO: Film, REELLO: Clapperboard, MOVIE: Clapperboard, TRANSFER: FolderOpen,
};

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="w-[min(320px,72vw)] rounded-xl overflow-hidden" onClick={(ev) => ev.stopPropagation()}>{children}</div>
);

/** Title row + "Open" (opens the full page in Plajah). */
const Footer: React.FC<{ embed: ChatEmbed; title?: string; subtitle?: string; onOpen?: () => void }> = ({ embed, title, subtitle, onOpen }) => {
  const Icon = KIND_ICON[embed.kind];
  return (
    <div className="flex items-center gap-2 pt-2">
      <Icon size={13} className="text-white/50 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold leading-tight truncate">{title || embed.title || embedKindLabel(embed.kind)}</p>
        <p className="text-[10px] text-white/45 truncate">{[embedKindLabel(embed.kind), subtitle || embed.subtitle].filter(Boolean).join(' · ')}</p>
      </div>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase tracking-wider shrink-0">
          Open <ExternalLink size={10} />
        </button>
      ) : (
        <a href={embedShareUrl(embed)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase tracking-wider shrink-0">
          Open <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
};

const navigate = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail }));

const TransferBody: React.FC<{ embed: ChatEmbed; info: PublicTransferInfo }> = ({ embed, info }) => {
  if (info.passwordRequired || info.locked) {
    return (
      <a href={embedShareUrl(embed)} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 rounded-xl bg-black/25 hover:bg-black/35 transition-colors">
        <Lock size={16} className="text-white/60" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold truncate">{info.title || 'Shared files'}</p>
          <p className="text-[10px] text-white/50">{info.files.length} file{info.files.length === 1 ? '' : 's'} · password protected — open to unlock</p>
        </div>
      </a>
    );
  }
  const files = info.files.slice(0, 4);
  return (
    <div className="flex flex-col gap-2">
      {files.map(f => {
        const url = f.downloadUrl;
        const mime = (f.mime || '').toLowerCase();
        return (
          <div key={f.fileId} className="flex flex-col gap-1.5">
            {url && mime.startsWith('image/') && <img src={url} alt={f.name} loading="lazy" className="rounded-lg w-full max-h-[300px] object-cover bg-black/30" />}
            {url && mime.startsWith('video/') && <video src={url} controls playsInline preload="metadata" className="rounded-lg w-full max-h-[260px] bg-black" />}
            {url && mime.startsWith('audio/') && <audio src={url} controls preload="metadata" className="w-full" />}
            {url && mime === 'application/pdf' && <iframe src={url} title={f.name} className="w-full h-[260px] rounded-lg bg-white" />}
            <div className="flex items-center gap-2">
              <p className="text-[11px] truncate flex-1" title={f.name}>{f.name}</p>
              <span className="text-[10px] text-white/45 shrink-0">{formatBytes(f.size)}</span>
              {url && <a href={url} download={f.name} target="_blank" rel="noopener noreferrer" aria-label={`Download ${f.name}`} className="p-1 rounded bg-white/10 hover:bg-white/20"><Download size={11} /></a>}
            </div>
          </div>
        );
      })}
      {info.files.length > files.length && <p className="text-[10px] text-white/45">+{info.files.length - files.length} more</p>}
      {info.expiresAt > 0 && <p className="text-[10px] text-white/40">Link expires {new Date(info.expiresAt).toLocaleDateString()}</p>}
    </div>
  );
};

const ChatEmbedCard: React.FC<{ embed: ChatEmbed }> = ({ embed }) => {
  const r = useResolved(embed);
  const Icon = KIND_ICON[embed.kind];

  if (r.state === 'loading') {
    return (
      <Frame>
        <div className="flex items-center gap-3 p-3 bg-black/20 rounded-xl">
          {embed.imageUrl ? <img src={embed.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-white/10 grid place-items-center"><Icon size={16} className="text-white/50" /></div>}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold truncate">{embed.title || embedKindLabel(embed.kind)}</p>
            <p className="text-[10px] text-white/45 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Loading…</p>
          </div>
        </div>
      </Frame>
    );
  }

  if (r.state === 'missing') {
    return (
      <Frame>
        <a href={embedShareUrl(embed)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-black/20 hover:bg-black/30 rounded-xl transition-colors">
          <div className="w-12 h-12 rounded-lg bg-white/10 grid place-items-center shrink-0"><Icon size={16} className="text-white/50" /></div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold truncate">{embed.title || embedKindLabel(embed.kind)}</p>
            <p className="text-[10px] text-white/45">Not available to play here — open in Plajah</p>
          </div>
        </a>
      </Frame>
    );
  }

  if (r.state === 'album') {
    return (
      <Frame>
        <MiniMusicPlayer album={r.album} compact />
        <Footer embed={embed} title={embed.kind === 'TRACK' ? r.album.tracks[0]?.title : r.album.title} subtitle={r.album.artist}
          onOpen={() => navigate({ target: 'PLAYER', albumId: embed.id, trackId: embed.trackId })} />
      </Frame>
    );
  }

  if (r.state === 'video') {
    const v = r.video;
    return (
      <Frame>
        <div className="rounded-xl overflow-hidden bg-black">
          <PostVideo id={v.id} url={v.url} muxPlaybackId={v.muxPlaybackId} poster={v.thumbnailUrl} title={v.title} natural />
        </div>
        <Footer embed={embed} title={v.title} subtitle={v.artist}
          onOpen={() => window.dispatchEvent(new CustomEvent('plajah:open-video', { detail: { videoId: v.id } }))} />
      </Frame>
    );
  }

  if (r.state === 'film') {
    const it = r.item;
    const poster = r.playable?.poster || it.thumbnailUrl || it.coverImage || embed.imageUrl;
    const openFilm = () => window.dispatchEvent(new CustomEvent('plajah:open-movie', { detail: { id: embed.id } }));
    return (
      <Frame>
        {r.playable ? (
          <div className="rounded-xl overflow-hidden bg-black">
            <PostVideo url={r.playable.url} muxPlaybackId={r.playable.muxPlaybackId} poster={poster} title={it.title} natural />
          </div>
        ) : (
          <button type="button" onClick={openFilm} className="relative block w-full aspect-video rounded-xl overflow-hidden bg-black group">
            {poster && <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />}
            <span className="absolute inset-0 grid place-items-center">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 text-[11px] font-bold uppercase tracking-wider">
                <Play size={12} fill="currentColor" /> Watch in Cinema
              </span>
            </span>
          </button>
        )}
        <Footer embed={embed} title={it.title} subtitle={it.artist || it.genre} onOpen={openFilm} />
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="p-2.5 rounded-xl bg-black/20">
        <TransferBody embed={embed} info={r.info} />
      </div>
      <Footer embed={embed} title={r.info.title || embed.title || 'Shared files'} subtitle={`${r.info.files.length} file${r.info.files.length === 1 ? '' : 's'}`} />
    </Frame>
  );
};

export default ChatEmbedCard;
