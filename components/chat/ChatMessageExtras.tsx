import React from 'react';
import { FileText, FileSpreadsheet, Presentation, FileArchive, FileAudio, FileVideo, File as FileIcon, Download, ExternalLink } from 'lucide-react';
import { formatBytes, type ChatAttachment, type AttachmentKind } from '../../services/chat/chatCore';

const KIND_ICON: Record<AttachmentKind, React.ComponentType<{ size?: number; className?: string }>> = {
  pdf: FileText, doc: FileText, text: FileText, sheet: FileSpreadsheet, slides: Presentation,
  archive: FileArchive, audio: FileAudio, video: FileVideo, image: FileIcon, file: FileIcon,
};
const KIND_LABEL: Record<AttachmentKind, string> = {
  pdf: 'PDF', doc: 'Document', text: 'Text', sheet: 'Spreadsheet', slides: 'Slides',
  archive: 'Archive', audio: 'Audio', video: 'Video', image: 'Image', file: 'File',
};

/** A shared file in a chat bubble: plays audio/video inline, opens everything else in a new tab. */
export const ChatAttachmentCard: React.FC<{ attachment: ChatAttachment }> = ({ attachment: a }) => {
  const Icon = KIND_ICON[a.kind] || FileIcon;
  return (
    <div className="flex flex-col gap-2 min-w-[220px] max-w-[min(300px,70vw)]">
      {a.kind === 'video' && (
        <video src={a.url} controls playsInline preload="metadata" className="rounded-xl w-full max-h-[260px] bg-black" />
      )}
      {a.kind === 'audio' && <audio src={a.url} controls preload="metadata" className="w-full" />}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center shrink-0">
          <Icon size={18} className="text-white/80" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight truncate" title={a.name}>{a.name}</p>
          <p className="text-[10px] text-white/50">{KIND_LABEL[a.kind]}{a.size ? ` · ${formatBytes(a.size)}` : ''}</p>
        </div>
        <a href={a.url} target="_blank" rel="noopener noreferrer" download={a.name}
          onClick={(e) => e.stopPropagation()}
          title={a.kind === 'pdf' ? 'Open' : 'Download'} aria-label={`Open ${a.name}`}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0">
          {a.kind === 'pdf' ? <ExternalLink size={14} /> : <Download size={14} />}
        </a>
      </div>
    </div>
  );
};

/** The card for the first link in a message. */
export const ChatLinkPreviewCard: React.FC<{
  preview: { url: string; title: string; description?: string; image?: string; siteName: string };
}> = ({ preview: p }) => (
  <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
    className="mt-2 flex gap-3 rounded-xl overflow-hidden border border-white/15 bg-black/20 hover:bg-black/30 transition-colors max-w-[min(320px,70vw)]">
    {p.image && <img src={p.image} alt="" loading="lazy" className="w-20 h-20 object-cover shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
    <div className="min-w-0 py-2 pr-3 pl-3 first:pl-3">
      <p className="text-[10px] uppercase tracking-wider text-white/45 truncate">{p.siteName}</p>
      <p className="text-[12px] font-semibold leading-snug line-clamp-2">{p.title}</p>
      {p.description && <p className="text-[11px] text-white/55 leading-snug line-clamp-2">{p.description}</p>}
    </div>
  </a>
);
