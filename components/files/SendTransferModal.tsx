// components/files/SendTransferModal.tsx — Create expiring / passworded "Send" links & manage active transfers.

import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  FilePlus2,
  Link2,
  Lock,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { auth } from '../../services/backendService';
import { formatBytes } from '../../services/drive/client';
import { createTransfersApi, type SendTransferSummary } from '../../services/drive/transfersClient';
import { readStageItemAsFile } from '../../services/files/nativeFileBridges';
import type { StageMediaItem } from '../../services/files/unifiedVfs';

const transfersApi = createTransfersApi(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));

export interface SendTransferModalProps {
  open: boolean;
  onClose: () => void;
  initialLocalItems?: StageMediaItem[];
}

export const SendTransferModal: React.FC<SendTransferModalProps> = ({
  open,
  onClose,
  initialLocalItems = [],
}) => {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pendingStageItems, setPendingStageItems] = useState<StageMediaItem[]>(initialLocalItems);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [days, setDays] = useState<number>(7);
  const [password, setPassword] = useState('');
  const [maxDownloads, setMaxDownloads] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SendTransferSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPendingStageItems(initialLocalItems);
    setCreatedUrl(null);
    setError(null);
    setProgress(null);
    refreshHistory();
  }, [open, initialLocalItems]);

  const refreshHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await transfersApi.listMine();
      setHistory(res.transfers || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!open) return null;

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedId(key);
    window.setTimeout(() => setCopiedId(prev => (prev === key ? null : prev)), 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      setProgress({ pct: 2, label: 'Preparing local files…' });
      const resolvedFromStage = await Promise.all(pendingStageItems.map(item => readStageItemAsFile(item)));
      const allFiles = [...resolvedFromStage, ...selectedFiles];
      if (allFiles.length === 0) throw new Error('Pick at least one file to send.');

      const res = await transfersApi.sendFiles({
        files: allFiles,
        title: title.trim() || undefined,
        message: message.trim() || undefined,
        days,
        password: password || undefined,
        maxDownloads: maxDownloads ? Math.max(1, parseInt(maxDownloads, 10) || 1) : undefined,
        onProgress: (pct, label) => setProgress({ pct, label }),
      });

      setCreatedUrl(res.shareUrl);
      setSelectedFiles([]);
      setPendingStageItems([]);
      refreshHistory();
    } catch (err: any) {
      setError(err?.message || 'Transfer failed.');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await transfersApi.revoke(id);
      setHistory(h => h.filter(x => x.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Could not revoke transfer.');
    }
  };

  const totalPendingCount = selectedFiles.length + pendingStageItems.length;

  return (
    <div className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-[#10121b] text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Send size={17} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Plajah Send Transfers</h2>
              <p className="text-[11px] text-white/50">Expiring & password-protected delivery links</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white cursor-pointer">
            <X size={17} />
          </button>
        </div>

        <div className="px-5 pt-3 flex gap-2 border-b border-white/10">
          {(['new', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                tab === t ? 'border-amber-400 text-amber-300' : 'border-transparent text-white/55 hover:text-white'
              }`}
            >
              {t === 'new' ? 'New Transfer' : `Sent Links (${history.length})`}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200">{error}</div>
          )}

          {tab === 'new' ? (
            createdUrl ? (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 text-center">
                <Link2 size={28} className="mx-auto text-emerald-400" />
                <div className="text-sm font-bold">Transfer Link Ready</div>
                <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 font-mono text-xs break-all text-emerald-200">
                  {createdUrl}
                </div>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => handleCopy(createdUrl, 'created')}
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === 'created' ? <Check size={14} /> : <Copy size={14} />}
                    {copiedId === 'created' ? 'Copied Link' : 'Copy Link'}
                  </button>
                  <button
                    onClick={() => setCreatedUrl(null)}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold cursor-pointer"
                  >
                    Send Another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSend} className="space-y-3.5">
                <label className="block p-4 rounded-2xl border border-dashed border-white/20 hover:border-amber-400/60 bg-white/[0.03] text-center cursor-pointer transition">
                  <FilePlus2 size={22} className="mx-auto mb-1.5 text-amber-300" />
                  <div className="text-xs font-semibold">
                    {totalPendingCount > 0
                      ? `${totalPendingCount} file(s) staged — click to add more`
                      : 'Choose files to send (up to plan transfer cap)'}
                  </div>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      if (files.length) setSelectedFiles(prev => [...prev, ...files]);
                    }}
                  />
                </label>

                {totalPendingCount > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-1 text-xs">
                    {pendingStageItems.map((it, idx) => (
                      <div key={`st-${idx}`} className="px-3 py-1.5 rounded-lg bg-white/5 flex items-center justify-between">
                        <span className="truncate">{it.name} {it.size ? `(${formatBytes(it.size)})` : ''}</span>
                        <button
                          type="button"
                          onClick={() => setPendingStageItems(p => p.filter((_, i) => i !== idx))}
                          className="text-white/40 hover:text-red-300 ml-2 cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    {selectedFiles.map((f, idx) => (
                      <div key={`fl-${idx}`} className="px-3 py-1.5 rounded-lg bg-white/5 flex items-center justify-between">
                        <span className="truncate">{f.name} ({formatBytes(f.size)})</span>
                        <button
                          type="button"
                          onClick={() => setSelectedFiles(p => p.filter((_, i) => i !== idx))}
                          className="text-white/40 hover:text-red-300 ml-2 cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-white/55 mb-1">Title (optional)</label>
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Client Deliverables"
                      className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/55 mb-1 flex items-center gap-1">
                      <Clock size={11} /> Expires In
                    </label>
                    <select
                      value={days}
                      onChange={e => setDays(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value={7}>7 Days</option>
                      <option value={14}>14 Days (Plajah+)</option>
                      <option value={30}>30 Days (Plajah+)</option>
                      <option value={90}>90 Days (Pro)</option>
                      <option value={365}>365 Days (Pro)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-white/55 mb-1 flex items-center gap-1">
                      <Lock size={11} /> Password (Plus / Pro)
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Leave blank for open link"
                      className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/55 mb-1">Max Downloads (optional)</label>
                    <input
                      type="number"
                      min={1}
                      value={maxDownloads}
                      onChange={e => setMaxDownloads(e.target.value)}
                      placeholder="Unlimited"
                      className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-white/55 mb-1">Note for recipient</label>
                  <textarea
                    rows={2}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Optional message included on the download page…"
                    className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                {progress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-white/70">
                      <span>{progress.label}</span>
                      <span>{progress.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-amber-400 transition-all" style={{ width: `${progress.pct}%` }} />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sending || totalPendingCount === 0}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send size={14} /> {sending ? 'Uploading Transfer…' : 'Create Send Link'}
                </button>
              </form>
            )
          ) : (
            <div className="space-y-2.5">
              {loadingHistory ? (
                <div className="py-8 text-center text-xs text-white/50">Loading active links…</div>
              ) : history.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/50">No active Send links yet.</div>
              ) : (
                history.map(t => {
                  const link = `${typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com'}/?view=transfer&id=${encodeURIComponent(t.id)}`;
                  return (
                    <div key={t.id} className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <span className="truncate">{t.title || t.files[0]?.name || 'Transfer'}</span>
                          {t.passwordProtected && <Lock size={11} className="text-amber-300 shrink-0" />}
                        </div>
                        <div className="text-[10px] text-white/50 font-mono">
                          {t.files.length} file(s) • {formatBytes(t.totalBytes)} • {t.downloadCount} dl • exp {new Date(t.expiresAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleCopy(link, t.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === t.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          Copy
                        </button>
                        <button
                          onClick={() => handleRevoke(t.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-300 cursor-pointer"
                          title="Revoke and purge"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SendTransferModal;
