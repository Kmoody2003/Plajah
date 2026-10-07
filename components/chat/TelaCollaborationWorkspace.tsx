import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import type { CollabProject, TelaDoc } from '../../types';
import { db } from '../../services/firebase';
import { collaborationTela, serializeCollaborationTela } from '../../services/collaborationTela';
import { saveTelaDoc } from '../../services/telaStore';
const TelaView = lazy(() => import('../tela/TelaView'));

export default function TelaCollaborationWorkspace({ project, onClose }: { project: CollabProject; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Edits save on this device. Share a checkpoint for collaborators.');
  const current = useRef<TelaDoc>(collaborationTela(project));
  const revision = useRef(project.telaRevision || 0);
  useEffect(() => {
    let live = true;
    saveTelaDoc(current.current).then(result => {
      if (!live) return;
      if (result.ok) setReady(true); else setError('Could not open the board in local storage.');
    }).catch(() => { if (live) setError('Could not open this Tela board.'); });
    return () => { live = false; };
  }, []);
  const checkpoint = async () => {
    setSaving(true); setError('');
    try {
      const document = serializeCollaborationTela(current.current);
      const nextRevision = await runTransaction(db, async transaction => {
        const target = doc(db, 'collab_projects', project.id);
        const snapshot = await transaction.get(target);
        if (!snapshot.exists()) throw new Error('This collaboration board was removed.');
        const latest = snapshot.data().telaRevision || 0;
        if (latest !== revision.current) throw new Error('A collaborator shared newer changes. Your local edits are saved; reopen the board to load their checkpoint before sharing.');
        transaction.update(target, { telaDocument: document, telaRevision: latest + 1, updatedAt: Date.now() });
        return latest + 1;
      });
      revision.current = nextRevision;
      setStatus(`Checkpoint ${nextRevision} shared with this chat.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not share this checkpoint.';
      if (message.startsWith('A collaborator shared')) {
        const draft = { ...current.current, id: `tela_collab_draft_${crypto.randomUUID()}`, title: `${current.current.title} · Conflict copy` };
        const result = await saveTelaDoc(draft);
        setError(`${message} ${result.ok ? 'A conflict copy is available in your Tela library.' : 'Keep this editor open to preserve your draft.'}`);
      } else setError(message);
    }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[350] bg-[#0a0a10] flex flex-col">
    <div className="flex flex-wrap items-center gap-3 p-3 border-b border-white/10 text-white">
      <button onClick={onClose} className="rounded-lg px-3 py-2 bg-white/10">Back to collaboration</button>
      <span className="flex-1 text-xs text-white/60">{status}</span>
      <button disabled={!ready || saving} onClick={() => void checkpoint()} className="rounded-lg px-3 py-2 bg-small-orange disabled:opacity-50">{saving ? 'Sharing…' : 'Share checkpoint'}</button>
      {error && <p role="alert" className="w-full text-xs text-red-300">{error}</p>}
    </div>
    <div className="flex-1 min-h-0">{ready ? <Suspense fallback={<p className="p-8">Opening Tela…</p>}><TelaView initialDocId={current.current.id} onDocumentChange={document => { current.current = document; }} /></Suspense> : <p className="p-8">Opening board…</p>}</div>
  </div>;
}
