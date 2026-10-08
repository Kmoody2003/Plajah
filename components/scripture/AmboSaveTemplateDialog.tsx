// AmboSaveTemplateDialog — "Save as my template": name, description, tags and
// visibility. When opened on a template you own it offers Save changes
// (overwrite) and Save as new. Choosing "Share with people" opens the share
// dialog on the saved record.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X, Lock, Users, Globe, Loader2, CopyPlus } from 'lucide-react';
import { auth } from '../../services/backendService';
import { saveTemplate, type SavedTemplate, type TemplateKind, type TemplateVisibility } from '../../services/ambo/templateLibrary';
import { AmboShareDialog, useDialogEscape, dialogShell } from './AmboShareDialog';

const LILAC = '#D0BCFF', CYAN = '#00DAF3';

export type TemplatePayload = Pick<SavedTemplate, 'baseTemplateId' | 'theme' | 'fields' | 'overrides' | 'look' | 'thumb'>;

const VIS: Array<{ id: TemplateVisibility; label: string; hint: string; Icon: typeof Lock }> = [
  { id: 'private', label: 'Private', hint: 'Only you', Icon: Lock },
  { id: 'shared', label: 'Share with people', hint: 'People you pick', Icon: Users },
  { id: 'public', label: 'Community', hint: 'Anyone on Plajah', Icon: Globe },
];

export interface AmboSaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  kind: TemplateKind;
  /** A template the user owns, loaded in the editor — enables overwrite. */
  editing?: SavedTemplate | null;
  defaultName: string;
  /** Snapshot what is being saved (called on submit). */
  build: () => TemplatePayload | Promise<TemplatePayload>;
  onSaved?: (t: SavedTemplate) => void;
  shareWhere?: string;
}

export const AmboSaveTemplateDialog: React.FC<AmboSaveTemplateDialogProps> = ({ open, onClose, kind, editing, defaultName, build, onSaved, shareWhere }) => {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<TemplateVisibility>('private');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [shareRec, setShareRec] = useState<SavedTemplate | null>(null);
  const signedIn = !!auth.currentUser;
  useDialogEscape(open && !shareRec, onClose);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || defaultName);
    setDescription(editing?.description || '');
    setTags((editing?.tags || []).join(', '));
    setVisibility(editing?.visibility || 'private');
    setErr('');
  }, [open, editing?.id]);

  const submit = async (asNew: boolean) => {
    const nm = name.trim();
    if (!nm) { setErr('Give it a name.'); return; }
    setBusy(true); setErr('');
    try {
      const payload = await build();
      const keep = !asNew && editing ? { id: editing.id, createdAt: editing.createdAt, uses: editing.uses, sharedWith: editing.sharedWith, ownerName: editing.ownerName } : { sharedWith: [] as string[] };
      const rec = await saveTemplate({
        ...keep, ...payload, kind, name: nm,
        description: description.trim() || undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 12),
        visibility: signedIn ? visibility : 'private',
      });
      onSaved?.(rec);
      if (signedIn && visibility === 'shared') setShareRec(rec);
      else onClose();
    } catch (e: any) {
      setErr(e?.code === 'permission-denied' ? 'Not allowed to save here — check you are signed in to the owning account.'
        : /quota|exceed|size|too large/i.test(String(e?.message)) ? 'That template is too large to save (try a smaller thumbnail or shorter fields).'
        : `Couldn't save: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  if (!open || typeof document === 'undefined') return null;
  return (<>
    {!shareRec && createPortal(
      <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4" style={{ background: 'rgba(4,3,10,.55)' }} data-save-dialog
        onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-[min(440px,100%)] rounded-2xl text-white" style={dialogShell}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <Save size={15} style={{ color: LILAC }} />
            <div className="text-[12.5px] font-extrabold">{editing ? 'Save template' : 'Save as my template'}</div>
            <button onClick={onClose} className="ml-auto w-7 h-7 grid place-items-center rounded-lg hover:bg-white/10" aria-label="Close"><X size={14} /></button>
          </div>
          <div className="p-4 space-y-2.5">
            <label className="block">
              <span className="block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Name</span>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} data-save-name
                onKeyDown={e => { if (e.key === 'Enter') void submit(false); }}
                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-[#D0BCFF]/60" />
            </label>
            <label className="block">
              <span className="block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Description <span className="normal-case font-normal">(optional)</span></span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={400}
                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11.5px] outline-none resize-none focus:border-[#D0BCFF]/60" />
            </label>
            <label className="block">
              <span className="block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Tags <span className="normal-case font-normal">(comma separated)</span></span>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="easter, youth, warm"
                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11.5px] outline-none placeholder:text-white/25 focus:border-[#D0BCFF]/60" />
            </label>
            <div>
              <span className="block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Who can use it</span>
              <div className="grid grid-cols-3 gap-1.5">
                {VIS.map(v => {
                  const on = visibility === v.id, dis = !signedIn && v.id !== 'private';
                  return (
                    <button key={v.id} disabled={dis} onClick={() => setVisibility(v.id)} data-vis={v.id}
                      className="rounded-lg px-2 py-1.5 text-left disabled:opacity-35"
                      style={{ border: `1px solid ${on ? LILAC : 'rgba(255,255,255,.1)'}`, background: on ? 'rgba(208,188,255,.12)' : 'rgba(255,255,255,.03)' }}>
                      <span className="flex items-center gap-1 text-[10.5px] font-bold" style={{ color: on ? LILAC : '#fff' }}><v.Icon size={11} />{v.label}</span>
                      <span className="block text-[9px] text-white/40">{v.hint}</span>
                    </button>
                  );
                })}
              </div>
              {!signedIn && <div className="text-[9.5px] text-white/45 mt-1.5">Signed out: saved in this browser only. Sign in to keep templates on your account and share them.</div>}
            </div>
            {err && <div className="text-[10.5px] rounded-md px-2 py-1" style={{ color: '#FFB547', background: 'rgba(255,181,71,.08)' }}>{err}</div>}
          </div>
          <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2">
            <button onClick={onClose} className="h-8 px-3 rounded-lg text-[11px] font-bold bg-white/5 hover:bg-white/10">Cancel</button>
            {editing && (
              <button disabled={busy} onClick={() => void submit(true)} data-save-new className="ml-auto h-8 px-3 rounded-lg text-[11px] font-bold flex items-center gap-1 bg-white/5 hover:bg-white/10 disabled:opacity-40" style={{ color: CYAN }}>
                <CopyPlus size={12} />Save as new
              </button>
            )}
            <button disabled={busy} onClick={() => void submit(false)} data-save-commit
              className={`${editing ? '' : 'ml-auto '}h-8 px-4 rounded-lg text-[11.5px] font-extrabold flex items-center gap-1.5 disabled:opacity-40`}
              style={{ background: `linear-gradient(135deg, ${LILAC}, ${CYAN})`, color: '#0b0a12' }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{editing ? 'Save changes' : 'Save'}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
    <AmboShareDialog template={shareRec} where={shareWhere} onClose={() => { setShareRec(null); onClose(); }} />
  </>);
};

export default AmboSaveTemplateDialog;
