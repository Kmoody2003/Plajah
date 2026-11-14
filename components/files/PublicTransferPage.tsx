// components/files/PublicTransferPage.tsx — Account-free recipient page for expiring / passworded
// Plajah Drive "Send" links (?view=transfer&id=... or /transfer/:id).

import React, { useEffect, useState } from 'react';
import { Download, FileText, Lock, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import { createTransfersApi, type PublicTransferInfo } from '../../services/drive/transfersClient';
import { formatBytes } from '../../services/drive/client';

const publicApi = createTransfersApi(async () => null);

export const PublicTransferPage: React.FC<{ transferId: string }> = ({ transferId }) => {
  const [info, setInfo] = useState<PublicTransferInfo | null>(null);
  const [unlockToken, setUnlockToken] = useState<string | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    publicApi
      .inspectPublic(transferId, { token: unlockToken })
      .then(res => {
        if (alive) setInfo(res);
      })
      .catch((err: any) => {
        if (alive) setError(err?.message || 'Transfer link could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [transferId]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setUnlocking(true);
    setError(null);
    try {
      const res = await publicApi.verifyPassword(transferId, password);
      setUnlockToken(res.unlockToken);
      setInfo(res);
    } catch (err: any) {
      setError(err?.message || 'Incorrect password.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleDownload = async (fileId: string, fallbackUrl?: string) => {
    try {
      const fresh = await publicApi.inspectPublic(transferId, { token: unlockToken, countDownload: true });
      setInfo(fresh);
      const target = fresh.files.find(f => f.fileId === fileId)?.downloadUrl || fallbackUrl;
      if (target) window.open(target, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      if (fallbackUrl) window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      else setError(err?.message || 'Download unavailable.');
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] text-white flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#10121b] p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <ShieldCheck size={20} className="text-amber-400" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400">Plajah Send</div>
              <h1 className="text-lg font-bold leading-tight">{info?.title || 'Shared Files Transfer'}</h1>
            </div>
          </div>
          {info?.expiresAt && (
            <span className="text-[11px] text-white/55 flex items-center gap-1">
              <Clock size={12} /> Expires {new Date(info.expiresAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {loading && <div className="py-10 text-center text-sm text-white/60">Loading transfer…</div>}

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-500/12 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && info && (
          <>
            {info.message && (
              <p className="text-sm text-white/75 bg-white/5 rounded-2xl p-3.5 border border-white/8">
                {info.message}
              </p>
            )}

            <div className="text-xs text-white/50 flex items-center justify-between">
              <span>{info.files.length} file(s) • {formatBytes(info.totalBytes)}</span>
              {info.maxDownloads ? (
                <span>Downloads: {info.downloadCount} / {info.maxDownloads}</span>
              ) : (
                <span>{info.downloadCount} downloads</span>
              )}
            </div>

            {info.locked ? (
              <form onSubmit={handleUnlock} className="space-y-3 pt-2">
                <div className="text-xs text-white/75 flex items-center gap-1.5">
                  <Lock size={14} className="text-amber-400" />
                  This transfer is password-protected.
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter transfer password…"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={unlocking || !password}
                    className="px-4 py-2.5 rounded-xl bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                  >
                    {unlocking ? 'Unlocking…' : 'Unlock'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {info.files.map(f => (
                  <div
                    key={f.fileId}
                    className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size={18} className="text-amber-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{f.name}</div>
                        <div className="text-[11px] text-white/50 font-mono">{formatBytes(f.size)}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(f.fileId, f.downloadUrl)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Download size={13} /> Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-white/45">
          <span>Powered by Plajah Drive</span>
          <a href="/" className="text-amber-400 hover:underline">Open Plajah</a>
        </div>
      </div>
    </div>
  );
};

export default PublicTransferPage;
