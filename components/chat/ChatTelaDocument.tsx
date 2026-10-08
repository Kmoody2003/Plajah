import React, { lazy, Suspense, useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ChatMessage, TelaDoc, TelaDocMeta } from '../../types';
import { auth, sendMessage } from '../../services/backendService';
import { encryptText, decryptText } from '../../services/cryptoService';
import { listTelaDocs, loadTelaDoc, saveTelaDoc } from '../../services/telaStore';
const TelaView = lazy(() => import('../tela/TelaView'));
const TelaEmbed = lazy(() => import('../tela/TelaEmbed'));

export function SendTelaDocument({ roomId }: { roomId: string }) {
  const [docs, setDocs] = useState<TelaDocMeta[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const share = async (id: string) => {
    const user = auth.currentUser; if (!user) return;
    setBusy(true); setError('');
    try {
      const document = await loadTelaDoc(id);
      if (!document) throw new Error('This document could not be opened.');
      const json = JSON.stringify(document);
      if (new TextEncoder().encode(json).length > 600_000) throw new Error('This document is too large to share inline. Use linked media instead of embedded images.');
      await sendMessage(roomId, { senderId: user.uid, senderName: user.displayName || 'You', senderPhoto: user.photoURL || '', type: 'MEDIA', mediaType: 'TELA', text: await encryptText(document.title || 'Tela document', roomId), telaDocument: await encryptText(json, roomId) });
      setDocs(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send this document.'); }
    finally { setBusy(false); }
  };
  return <div className="relative">
    <button type="button" title="Share Tela document" aria-label="Share Tela document" className="p-2 text-white/35 hover:text-small-orange rounded-xl" onClick={async () => {
      if (docs) { setDocs(null); return; }
      try { setDocs(await listTelaDocs()); } catch { setError('Could not list Tela documents.'); }
    }}><FileText size={19} /></button>
    {docs && createPortal(<div className="fixed inset-0 z-[450] flex items-center justify-center p-4">
      <button type="button" aria-label="Close Tela picker" onClick={() => setDocs(null)} className="absolute inset-0 bg-black/70" />
      <div className="relative w-80 max-w-full bg-[#111119] text-white p-4 rounded-2xl border border-white/15 shadow-2xl">
      <div className="flex justify-between items-center mb-2 text-xs font-semibold">Share a Tela snapshot<button type="button" onClick={() => setDocs(null)} aria-label="Close Tela picker"><X size={14} /></button></div>
      <div className="max-h-64 overflow-auto">{docs.map(document => <button type="button" disabled={busy} key={document.id} onClick={() => void share(document.id)} className="block w-full text-left p-2 text-xs hover:bg-white/10 rounded-lg truncate">{document.title}</button>)}{!docs.length && <p className="text-xs text-white/50">Create a document in Tela or a collaboration board first.</p>}</div>
      {error && <p role="alert" className="text-xs text-red-300 mt-2">{error}</p>}
      </div>
    </div>, document.body)}
  </div>;
}

export default function ChatTelaDocument({ message, roomId }: { message: ChatMessage; roomId: string }) {
  const [snapshot, setSnapshot] = useState<TelaDoc | null>(null);
  const [docId, setDocId] = useState('');
  const [error, setError] = useState('');
  const [editingCopy, setEditingCopy] = useState(false);
  useEffect(() => {
    let live = true;
    setDocId(''); setSnapshot(null); setError('');
    void (async () => {
      try {
        const json = await decryptText(message.telaDocument || '', roomId);
        const document = JSON.parse(json) as TelaDoc;
        if (!document?.devices || !Array.isArray(document.frames)) throw new Error('Invalid Tela document.');
        const local: TelaDoc = { ...document, id: `tela_chat_${roomId}_${message.id}` };
        if (live) setSnapshot(local);
      } catch { if (live) setError('This Tela document could not be opened.'); }
    })();
    return () => { live = false; };
  }, [message.id, message.telaDocument, roomId]);
  const openCopy = async () => {
    const document = snapshot; if (!document) return;
    const copy = { ...document, id: `tela_copy_${crypto.randomUUID()}`, ownerId: auth.currentUser?.uid || 'local', title: `${document.title} · Copy`, createdAt: Date.now(), updatedAt: Date.now() };
    const result = await saveTelaDoc(copy);
    if (result.ok) { setDocId(copy.id); setEditingCopy(true); } else setError('Could not create an editable copy.');
  };
  return <div className="w-64 max-w-full">
    <p className="flex items-center gap-2 text-xs font-semibold mb-2"><FileText size={14} /> {message.text || 'Tela document'}</p>
    {snapshot ? <Suspense fallback={<p className="text-xs">Opening Tela…</p>}><TelaEmbed docId={snapshot.id} snapshot={snapshot} mode="follow-latest" width={256} /></Suspense> : <p className="text-xs text-white/50">{error || 'Opening document…'}</p>}
    {snapshot && <button onClick={() => void openCopy()} className="text-xs mt-2 text-orange-300">Open editable copy</button>}
    {editingCopy && createPortal(<div className="fixed inset-0 z-[400] bg-[#0a0a10]"><Suspense fallback={<p className="p-8">Opening Tela…</p>}><TelaView initialDocId={docId} onBack={() => setEditingCopy(false)} /></Suspense></div>, document.body)}
  </div>;
}
