import React from 'react';
import ChatForwardPicker from './ChatForwardPicker';
import { auth } from '../../services/firebase';
import { MAX_ATTACHMENT_BYTES, formatBytes } from '../../services/chat/chatCore';

// "Send in chat" for a personal file (Plajah Files / Drive / local). Up to 50 MB the file goes into
// the chat as an attachment and plays/views inline (images, video, audio, PDF). Bigger files go out as
// a Plajah Send transfer (7 days) — the chat bubble shows that transfer's files inline instead.

export interface SendableFile { name: string; url: string; mimeType?: string; size?: number }

async function toFile(f: SendableFile): Promise<File> {
  const res = await fetch(f.url);
  if (!res.ok) throw new Error('Could not read that file.');
  const blob = await res.blob();
  return new File([blob], f.name, { type: f.mimeType || blob.type || 'application/octet-stream' });
}

const SendFileToChat: React.FC<{ file: SendableFile; onClose: () => void; onSent?: (roomName: string) => void }> = ({ file, onClose, onSent }) => {
  if (!auth.currentUser) {
    return (
      <div className="fixed inset-0 z-[1010] grid place-items-center bg-black/70" onClick={onClose}>
        <p className="px-5 py-4 rounded-2xl bg-[#121212] border border-white/10 text-sm text-white">Sign in to send files in chat.</p>
      </div>
    );
  }
  return (
    <ChatForwardPicker
      heading="Send in chat"
      layer={1010}
      previewLabel={`${file.name}${file.size ? ` · ${formatBytes(file.size)}` : ''}`}
      onSend={async (roomId) => {
        const actions = await import('../../services/chat/chatActions');
        const f = await toFile(file);
        if (f.size < MAX_ATTACHMENT_BYTES) {
          await actions.sendFileToRoom(roomId, f);
          return;
        }
        const { createTransfersApi } = await import('../../services/drive/transfersClient');
        const api = createTransfersApi(async () => (await auth.currentUser?.getIdToken()) || null);
        const t = await api.sendFiles({ files: [f], title: f.name, days: 7 });
        await actions.sendEmbedToRoom(roomId, { kind: 'TRANSFER', id: t.transferId, title: f.name, subtitle: formatBytes(f.size) });
      }}
      onClose={onClose}
      onForwarded={(name) => { onSent?.(name); onClose(); }}
    />
  );
};

export default SendFileToChat;
