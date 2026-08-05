// ─── Connect to World ─────────────────────────────────────────────────────────
// Shared, tool-agnostic modal. FABULA, Lorea (book + script), and any future
// writer drops this in to link its project to a Plajah World and exchange data
// through the World Hub. The tool owns its own mapping (onSync); this component
// owns world selection / creation, the private→public publish step, importing
// characters back, and surfacing duplicate/preview counts.

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Globe, Plus, Check, Loader2, X, ArrowRight, ArrowDownToLine, UploadCloud,
  Eye, GitMerge, Sparkles, AlertTriangle,
} from 'lucide-react';
import { auth } from '../../services/firebase';
import { fetchUserWorlds, createIPWorld } from '../../services/backendService';
import {
  publishSource, previewCounts, detectDuplicates,
  type UpsertReport,
} from '../../services/worldHub';
import type { IPWorld, WorldSourceApp } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  source: { app: WorldSourceApp; projectId: string; projectTitle?: string };
  /** Currently linked world id (persisted by the tool), or null. */
  connectedWorldId?: string | null;
  /** Persist the link on the tool's side (e.g. write worldId onto the production). */
  onConnected: (worldId: string | null) => void;
  /** Tool-specific: push this project's entities into the world as PRIVATE. */
  onSync: (worldId: string) => Promise<UpsertReport>;
  /** Optional reverse direction: pull world characters into the project. */
  onImport?: (worldId: string) => Promise<number>;
}

type Phase = 'pick' | 'create' | 'manage';

export default function ConnectToWorld({ open, onClose, source, connectedWorldId, onConnected, onSync, onImport }: Props) {
  const [worlds, setWorlds] = useState<IPWorld[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>(connectedWorldId ? 'manage' : 'pick');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<UpsertReport | null>(null);
  const [preview, setPreview] = useState<{ characters: number; lore: number } | null>(null);
  const [dupes, setDupes] = useState(0);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const connectedWorld = worlds.find(w => w.id === connectedWorldId) || null;
  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500); };

  const loadWorlds = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    try { setWorlds(await fetchUserWorlds(uid)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) { loadWorlds(); setPhase(connectedWorldId ? 'manage' : 'pick'); setReport(null); } }, [open, connectedWorldId, loadWorlds]);

  // Refresh preview + duplicate counts when managing a connected world.
  useEffect(() => {
    if (phase !== 'manage' || !connectedWorldId) return;
    let cancelled = false;
    Promise.all([
      previewCounts(connectedWorldId, source.projectId).catch(() => ({ characters: 0, lore: 0 })),
      detectDuplicates(connectedWorldId).catch(() => []),
    ]).then(([pc, dc]) => { if (!cancelled) { setPreview(pc); setDupes(dc.length); } });
    return () => { cancelled = true; };
  }, [phase, connectedWorldId, source.projectId, report]);

  const connect = (worldId: string) => { onConnected(worldId); setPhase('manage'); };

  const createWorld = async () => {
    if (!newName.trim()) return;
    setBusy('create');
    try {
      const w = await createIPWorld({ name: newName.trim(), worldType: 'FICTION', description: `World linked from ${source.projectTitle || 'a project'}` });
      if (w) { await loadWorlds(); connect(w.id); flash(true, `Created “${w.name}”.`); }
    } catch (e: any) { flash(false, e?.message || 'Could not create world'); }
    finally { setBusy(null); }
  };

  const doSync = async () => {
    if (!connectedWorldId) return;
    setBusy('sync');
    try {
      const r = await onSync(connectedWorldId);
      setReport(r);
      flash(true, `Synced ${r.total} item${r.total === 1 ? '' : 's'} as private.`);
    } catch (e: any) { flash(false, e?.message || 'Sync failed'); }
    finally { setBusy(null); }
  };

  const doPublish = async () => {
    if (!connectedWorldId) return;
    setBusy('publish');
    try {
      const n = await publishSource(connectedWorldId, source.app, source.projectId);
      flash(true, n ? `Published ${n} entr${n === 1 ? 'y' : 'ies'} to the public world.` : 'Nothing new to publish.');
    } catch (e: any) { flash(false, e?.message || 'Publish failed'); }
    finally { setBusy(null); }
  };

  const doImport = async () => {
    if (!connectedWorldId || !onImport) return;
    setBusy('import');
    try {
      const n = await onImport(connectedWorldId);
      flash(true, n ? `Imported ${n} character${n === 1 ? '' : 's'} from the world.` : 'No characters to import.');
    } catch (e: any) { flash(false, e?.message || 'Import failed'); }
    finally { setBusy(null); }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
          className="w-full max-w-lg bg-[#101012] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-7 pt-6 pb-5 border-b border-white/8 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF8C00] to-[#D40055] flex items-center justify-center">
              <Globe size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black text-white">Connect to World</h2>
              <p className="text-[11px] text-white/40 truncate">{source.projectTitle || 'This project'} · {source.app.replace('_', ' ').toLowerCase()}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50"><X size={16} /></button>
          </div>

          <div className="p-7">
            {/* ── Manage (connected) ── */}
            {phase === 'manage' && connectedWorldId && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <Check size={18} className="text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{connectedWorld?.name || 'Connected world'}</p>
                    <p className="text-[11px] text-white/40">Linked. New entries land private until you publish.</p>
                  </div>
                  <button onClick={() => { onConnected(null); setPhase('pick'); }} className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60">Unlink</button>
                </div>

                {/* Private / preview counts */}
                {preview && (preview.characters + preview.lore > 0) && (
                  <div className="flex items-center gap-2 text-[11px] text-white/50">
                    <Eye size={13} className="text-amber-400" />
                    <span><b className="text-white">{preview.characters + preview.lore}</b> private entr{preview.characters + preview.lore === 1 ? 'y' : 'ies'} only you can see ({preview.characters} characters · {preview.lore} world items)</span>
                  </div>
                )}
                {dupes > 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-orange-300">
                    <GitMerge size={13} /> <span><b>{dupes}</b> possible duplicate{dupes === 1 ? '' : 's'} to review in the world's Discarded/Merge panel.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2.5 pt-1">
                  <ActionBtn icon={<UploadCloud size={15} />} label="Sync this project → World (private)" hint="Push characters & world items in, as private" busy={busy === 'sync'} onClick={doSync} primary />
                  {onImport && <ActionBtn icon={<ArrowDownToLine size={15} />} label="Import characters from World" hint="Pull in characters created by other tools" busy={busy === 'import'} onClick={doImport} />}
                  <ActionBtn icon={<Sparkles size={15} />} label="Publish private entries → Public" hint="Make this project's world entries public" busy={busy === 'publish'} onClick={doPublish} />
                </div>

                {report && (
                  <div className="text-[11px] text-white/45 bg-white/[0.03] rounded-xl p-3">
                    Synced — {report.charactersCreated} new / {report.charactersUpdated} updated characters, {report.loreCreated} new / {report.loreUpdated} updated world items. All private; nothing was overwritten or deleted.
                  </div>
                )}
              </div>
            )}

            {/* ── Pick an existing world ── */}
            {phase === 'pick' && (
              <div className="space-y-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-white/30">Link to one of your worlds</p>
                {loading ? (
                  <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-white/30" /></div>
                ) : worlds.length ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {worlds.map(w => (
                      <button key={w.id} onClick={() => connect(w.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/8 hover:border-[#FF8C00]/40 hover:bg-white/[0.06] transition-all text-left group">
                        <div className="w-9 h-9 rounded-lg bg-cover bg-center bg-white/10 shrink-0" style={w.coverImage ? { backgroundImage: `url(${w.coverImage})` } : {}} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{w.name}</p>
                          <p className="text-[10px] text-white/35">{w.characterIds?.length || 0} characters · {w.worldType?.toLowerCase()}</p>
                        </div>
                        <ArrowRight size={15} className="text-white/20 group-hover:text-[#FF8C00] transition-colors" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/35 py-4 text-center">You don't have any worlds yet — create one below.</p>
                )}
                <button onClick={() => setPhase('create')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/15 text-white/50 hover:text-white hover:border-white/30 text-xs font-bold uppercase tracking-widest transition-all">
                  <Plus size={14} /> New World
                </button>
              </div>
            )}

            {/* ── Create a world ── */}
            {phase === 'create' && (
              <div className="space-y-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-white/30">Name your new world</p>
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createWorld(); }}
                  placeholder="e.g. The Ember Coast"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#FF8C00]/50" />
                <div className="flex gap-2">
                  <button onClick={() => setPhase('pick')} className="px-4 py-3 rounded-xl bg-white/5 text-white/50 text-xs font-bold hover:bg-white/10">Back</button>
                  <button onClick={createWorld} disabled={!newName.trim() || busy === 'create'}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FF8C00] text-black text-xs font-black uppercase tracking-widest hover:bg-[#ffa733] disabled:opacity-50 transition-all">
                    {busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />} Create & Link
                  </button>
                </div>
              </div>
            )}

            <AnimatePresence>
              {toast && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`mt-5 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ${toast.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                  {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {toast.msg}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ActionBtn({ icon, label, hint, busy, onClick, primary }: {
  icon: React.ReactNode; label: string; hint: string; busy: boolean; onClick: () => void; primary?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all disabled:opacity-50 ${primary ? 'bg-[#FF8C00]/15 border-[#FF8C00]/30 hover:bg-[#FF8C00]/25' : 'bg-white/[0.04] border-white/8 hover:bg-white/[0.07]'}`}>
      <span className={primary ? 'text-[#FF8C00]' : 'text-white/50'}>{busy ? <Loader2 size={15} className="animate-spin" /> : icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold text-white">{label}</span>
        <span className="block text-[10px] text-white/35">{hint}</span>
      </span>
    </button>
  );
}
