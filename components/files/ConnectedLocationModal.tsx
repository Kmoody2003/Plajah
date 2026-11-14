// components/files/ConnectedLocationModal.tsx — Add FTP / FTPS / FTPES / SFTP / WebDAV / SMB NAS
// or import FileZilla sitemanager.xml (auto-detected from %APPDATA%\FileZilla on Windows).

import React, { useState } from 'react';
import { FolderSync, Server, ShieldAlert, Upload, X } from 'lucide-react';
import type { ConnectedLocationMeta } from '../../services/files/unifiedVfs';
import { isWindowsApp } from '../../services/windowsBridgeService';
import { readDefaultWindowsFileZillaXml } from '../../services/files/windowsExplorerBridge';
import {
  importFileZillaSites,
  upsertConnectedLocation,
} from '../../services/storageConnectors/connectorRegistry';

export interface ConnectedLocationModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (created?: ConnectedLocationMeta) => void;
}

const DEFAULT_PORTS: Record<ConnectedLocationMeta['protocol'], number> = {
  ftp: 21,
  ftps: 990,
  ftpes: 21,
  sftp: 22,
  webdav: 80,
  webdavs: 443,
  smb: 445,
  s3: 443,
};

export const ConnectedLocationModal: React.FC<ConnectedLocationModalProps> = ({ open, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<ConnectedLocationMeta['protocol']>('sftp');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('');
  const [secret, setSecret] = useState('');
  const [remoteDir, setRemoteDir] = useState('/');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleProtocolChange = (p: ConnectedLocationMeta['protocol']) => {
    setProtocol(p);
    setPort(String(DEFAULT_PORTS[p] || 22));
    if (p === 'smb') setRemoteDir('\\Share');
    else if (remoteDir === '\\Share') setRemoteDir('/');
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) {
      setError('Enter a server hostname, IP, or SMB path.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await upsertConnectedLocation({
        name: name.trim() || `${host.trim()} (${protocol.toUpperCase()})`,
        protocol,
        host: host.trim().replace(/^\\\\/, ''),
        port: parseInt(port, 10) || DEFAULT_PORTS[protocol],
        user: user.trim(),
        remoteDir: remoteDir.trim() || '/',
        passive: true,
        source: 'manual',
        secret,
      });
      onSaved(created);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not save location.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportFileZillaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const xml = await file.text();
      const res = await importFileZillaSites(xml);
      setNote(
        `Imported ${res.imported.length} FileZilla site(s)${res.skipped ? ` (${res.skipped} skipped)` : ''}.${
          res.hadStoredPasswords ? ' Passwords stored safely in OS Credential Vault / session memory.' : ''
        }`,
      );
      onSaved(res.imported[0]);
    } catch (err: any) {
      setError(err?.message || 'Could not parse FileZilla XML.');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  const handleAutoDetectWindowsFileZilla = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await readDefaultWindowsFileZillaXml();
      if (!res.found || (!res.siteManagerXml && !res.recentServersXml)) {
        setNote('No local FileZilla sitemanager.xml / recentservers.xml found under %APPDATA%\\FileZilla.');
        return;
      }
      let count = 0;
      let last: ConnectedLocationMeta | undefined;
      for (const xml of [res.siteManagerXml, res.recentServersXml]) {
        if (!xml) continue;
        const out = await importFileZillaSites(xml);
        count += out.imported.length;
        if (out.imported[0]) last = out.imported[0];
      }
      setNote(`Auto-imported ${count} site(s) from Windows FileZilla profile. Secrets saved to Windows PasswordVault.`);
      onSaved(last);
    } catch (err: any) {
      setError(err?.message || 'FileZilla auto-import failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#10121b] text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <Server size={17} className="text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Connect Location / NAS / FileZilla</h2>
              <p className="text-[11px] text-white/50">FTP, FTPS, SFTP, WebDAV, or local network SMB</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white cursor-pointer">
            <X size={17} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* FileZilla Import Card */}
          <div className="p-3.5 rounded-2xl bg-sky-500/8 border border-sky-500/25 space-y-2.5">
            <div className="text-xs font-semibold flex items-center gap-1.5 text-sky-200">
              <FolderSync size={14} /> Import from FileZilla
            </div>
            <div className="flex flex-wrap gap-2">
              {isWindowsApp() && (
                <button
                  type="button"
                  onClick={handleAutoDetectWindowsFileZilla}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-xl bg-sky-500 text-black font-semibold text-xs hover:bg-sky-400 cursor-pointer"
                >
                  Auto-Import Windows FileZilla
                </button>
              )}
              <label className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Upload size={13} /> Import sitemanager.xml
                <input type="file" accept=".xml" className="hidden" onChange={handleImportFileZillaFile} />
              </label>
            </div>
          </div>

          {note && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">{note}</div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200 flex items-center gap-2">
              <ShieldAlert size={14} /> <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSaveManual} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-white/55 mb-1">Display Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Studio NAS / Production SFTP"
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/55 mb-1">Protocol</label>
                <select
                  value={protocol}
                  onChange={e => handleProtocolChange(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white"
                >
                  <option value="sftp">SFTP (SSH)</option>
                  <option value="ftpes">FTP Explicit TLS (FTPES)</option>
                  <option value="ftps">FTPS Implicit TLS</option>
                  <option value="ftp">FTP</option>
                  <option value="webdavs">WebDAV HTTPS (Synology / Nextcloud)</option>
                  <option value="webdav">WebDAV HTTP</option>
                  <option value="smb">SMB / Windows Network Share (\\host\share)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] text-white/55 mb-1">Host / IP / NAS Name</label>
                <input
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  placeholder={protocol === 'smb' ? 'nas-studio or 192.168.1.20' : 'files.example.com'}
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/55 mb-1">Port</label>
                <input
                  value={port}
                  onChange={e => setPort(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-white/55 mb-1">Username</label>
                <input
                  value={user}
                  onChange={e => setUser(e.target.value)}
                  placeholder="Optional for guest SMB / WebDAV"
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/55 mb-1">Password / Token (OS Vault only)</label>
                <input
                  type="password"
                  value={secret}
                  onChange={e => setSecret(e.target.value)}
                  placeholder="Stored encrypted on device"
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-white/55 mb-1">Initial Path / Share</label>
              <input
                value={remoteDir}
                onChange={e => setRemoteDir(e.target.value)}
                placeholder={protocol === 'smb' ? '\\SharedMedia' : '/dav/media'}
                className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black font-bold text-xs cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save & Connect Location'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ConnectedLocationModal;
