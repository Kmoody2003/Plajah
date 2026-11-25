// components/files/ConnectedLocationModal.tsx — Add or edit FTP / FTPS / FTPES / SFTP / WebDAV / SMB NAS
// or import FileZilla sitemanager.xml / export XML (auto-detected from %APPDATA%\FileZilla on Windows).

import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, FolderSync, Server, ShieldAlert, Trash2, Upload, X } from 'lucide-react';
import type { ConnectedLocationMeta } from '../../services/files/unifiedVfs';
import { isWindowsApp } from '../../services/windowsBridgeService';
import { readDefaultWindowsFileZillaXml } from '../../services/files/windowsExplorerBridge';
import {
  loadSavedConnectors,
  normalizeConnectorProtocol,
  parseFileZillaCandidates,
  removeConnectedLocation,
  resolveConnectorSecret,
  sanitizeConnectorHost,
  upsertConnectedLocation,
  type FileZillaSiteCandidate,
} from '../../services/storageConnectors/connectorRegistry';

export interface ConnectedLocationModalProps {
  open: boolean;
  initialLocation?: ConnectedLocationMeta | null;
  onClose: () => void;
  onSaved: (saved?: ConnectedLocationMeta, opts?: { connect?: boolean }) => void;
  onDeleted?: (id: string) => void;
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

const isFtpFamily = (p: ConnectedLocationMeta['protocol']) => p === 'ftp' || p === 'ftps' || p === 'ftpes';

export const ConnectedLocationModal: React.FC<ConnectedLocationModalProps> = ({
  open,
  initialLocation,
  onClose,
  onSaved,
  onDeleted,
}) => {
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [source, setSource] = useState<'filezilla' | 'manual'>('manual');
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<ConnectedLocationMeta['protocol']>('sftp');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('');
  const [account, setAccount] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [clearSecret, setClearSecret] = useState(false);
  const [remoteDir, setRemoteDir] = useState('/');
  const [passive, setPassive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [importedSites, setImportedSites] = useState<FileZillaSiteCandidate[]>([]);
  const [selectedImportIdx, setSelectedImportIdx] = useState<number>(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setError(null);
    setNote(null);
    setPasswordHint(null);
    setShowSecret(false);
    setClearSecret(false);
    setImportedSites([]);
    setSelectedImportIdx(0);

    if (initialLocation) {
      const normProto = normalizeConnectorProtocol(initialLocation.protocol) || 'ftp';
      setEditingId(initialLocation.id);
      setSource(initialLocation.source || 'manual');
      setName(initialLocation.name || '');
      setProtocol(normProto);
      setHost(initialLocation.host || '');
      setPort(String(initialLocation.port || DEFAULT_PORTS[normProto] || 21));
      setUser(initialLocation.user || '');
      setAccount(initialLocation.account || '');
      setRemoteDir(initialLocation.remoteDir || '/');
      setPassive(initialLocation.passive ?? true);
      setHasExistingSecret(Boolean(initialLocation.hasSecret));
      setSecret('');

      resolveConnectorSecret(initialLocation.id)
        .then(existingSecret => {
          if (cancelled) return;
          if (existingSecret) {
            setSecret(existingSecret);
            setHasExistingSecret(true);
          }
        })
        .catch(() => {});
    } else {
      setEditingId(undefined);
      setSource('manual');
      setName('');
      setProtocol('sftp');
      setHost('');
      setPort('22');
      setUser('');
      setAccount('');
      setSecret('');
      setHasExistingSecret(false);
      setRemoteDir('/');
      setPassive(true);
    }

    return () => {
      cancelled = true;
    };
  }, [open, initialLocation]);

  if (!open) return null;

  const isEditing = Boolean(initialLocation || editingId);

  const applyFileZillaCandidate = (site: FileZillaSiteCandidate, idx: number) => {
    setSelectedImportIdx(idx);
    setName(site.name || site.host);
    setProtocol(site.protocol);
    setHost(site.host);
    setPort(String(site.port || DEFAULT_PORTS[site.protocol] || 21));
    setUser(site.user || '');
    setAccount(site.account || '');
    setSecret(site.password ?? '');
    setClearSecret(false);
    setRemoteDir(site.remoteDir || '/');
    setPassive(site.passive ?? true);
    if (!initialLocation) {
      setSource('filezilla');
      const existing = loadSavedConnectors().find(
        e =>
          e.host === site.host &&
          e.port === site.port &&
          e.user === site.user &&
          (e.account || '') === (site.account || '') &&
          e.protocol === site.protocol,
      );
      setEditingId(existing?.id);
      setHasExistingSecret(Boolean(site.password || existing?.hasSecret));
    }
    setError(null);

    if (site.passwordState === 'master_password') {
      setPasswordHint('This FileZilla site uses a master password — enter the password below before connecting.');
    } else if (site.passwordState === 'not_saved' && site.logon !== 'anonymous') {
      setPasswordHint('No password was stored in the FileZilla file — enter it below if the server requires one.');
    } else if (site.passwordState === 'readable') {
      setPasswordHint('Password loaded from FileZilla XML. It will be saved securely in the OS Credential Vault / session memory.');
    } else {
      setPasswordHint(null);
    }
  };

  const handleProtocolChange = (nextProto: ConnectedLocationMeta['protocol']) => {
    const prevDefault = String(DEFAULT_PORTS[protocol] || 22);
    setProtocol(nextProto);
    if (!port.trim() || port.trim() === prevDefault) {
      setPort(String(DEFAULT_PORTS[nextProto] || 22));
    }
    if (nextProto === 'smb') setRemoteDir('\\Share');
    else if (remoteDir === '\\Share') setRemoteDir('/');
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedHost = sanitizeConnectorHost(host);
    if (!cleanedHost) {
      setError('Enter a server hostname, IP, or SMB path.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedPort = parseInt(port, 10) || DEFAULT_PORTS[protocol] || 21;
      const saved = await upsertConnectedLocation({
        id: editingId,
        name: name.trim() || `${cleanedHost} (${protocol.toUpperCase()})`,
        protocol,
        host: cleanedHost,
        port: parsedPort,
        user: user.trim(),
        account: isFtpFamily(protocol) ? account.trim() || undefined : undefined,
        remoteDir: remoteDir.trim() || '/',
        passive,
        source,
        secret: clearSecret ? undefined : secret,
        clearSecret,
      });
      onSaved(saved, { connect: true });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not save location.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllImported = async () => {
    if (importedSites.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const existing = loadSavedConnectors();
      const savedList: ConnectedLocationMeta[] = [];

      for (let i = 0; i < importedSites.length; i++) {
        const s = importedSites[i];
        const isSelected = i === selectedImportIdx;
        const targetHost = isSelected ? sanitizeConnectorHost(host) || s.host : s.host;
        const targetProto = isSelected ? protocol : s.protocol;
        const targetPort = isSelected ? parseInt(port, 10) || DEFAULT_PORTS[targetProto] || s.port : s.port;
        const targetUser = isSelected ? user.trim() : s.user;
        const targetAccount = isSelected
          ? (isFtpFamily(targetProto) ? account.trim() || undefined : undefined)
          : s.account;
        const targetName = isSelected ? name.trim() || s.name : s.name;
        const targetDir = isSelected ? remoteDir.trim() || '/' : s.remoteDir || '/';
        const targetPassive = isSelected ? passive : s.passive;
        const targetSecret = isSelected ? (clearSecret ? undefined : secret) : s.password;

        const dup = existing.find(
          e =>
            e.host === targetHost &&
            e.port === targetPort &&
            e.user === targetUser &&
            (e.account || '') === (targetAccount || '') &&
            e.protocol === targetProto,
        );
        const saved = await upsertConnectedLocation({
          id: isSelected ? editingId || dup?.id : dup?.id,
          name: targetName,
          protocol: targetProto,
          host: targetHost,
          port: targetPort,
          user: targetUser,
          account: targetAccount,
          remoteDir: targetDir,
          passive: targetPassive,
          source: 'filezilla',
          secret: targetSecret,
          clearSecret: isSelected ? clearSecret : false,
        });
        savedList.push(saved);
      }

      const selectedSaved = savedList[selectedImportIdx] || savedList[0];
      const selectedCandidate = importedSites[selectedImportIdx];
      const needsPassword =
        selectedCandidate &&
        selectedCandidate.logon !== 'anonymous' &&
        !secret.trim() &&
        !selectedSaved?.hasSecret;

      if (needsPassword) {
        setEditingId(selectedSaved?.id);
        setNote(`Saved all ${savedList.length} FileZilla sites. Enter a password below for "${selectedSaved.name}" and click Save & Connect, or close.`);
        onSaved(undefined, { connect: false });
      } else {
        onSaved(selectedSaved, { connect: true });
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Could not save imported FileZilla sites.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportFileZillaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const xml = await file.text();
      const parsed = parseFileZillaCandidates(xml);
      if (parsed.candidates.length === 0) {
        setImportedSites([]);
        if (parsed.unsupported.length > 0) {
          const unique = Array.from(new Set(parsed.unsupported)).join(', ');
          setError(`Found ${parsed.unsupported.length} site(s), but protocol(s) ${unique} are not supported here.`);
        } else {
          setError('No FTP / FTPS / SFTP / WebDAV sites were found in this XML file. Export from FileZilla Site Manager or pick sitemanager.xml.');
        }
        return;
      }

      setImportedSites(parsed.candidates);
      applyFileZillaCandidate(parsed.candidates[0], 0);
      if (parsed.candidates.length === 1) {
        setNote(
          `Loaded "${parsed.candidates[0].name}" from ${file.name}. Review the fields below and click ${
            isEditing ? 'Save Changes & Connect' : 'Save & Connect Location'
          }.`,
        );
      } else {
        setNote(
          `Loaded ${parsed.candidates.length} sites from ${file.name}${
            parsed.skipped ? ` (${parsed.skipped} skipped)` : ''
          }. Pick a site below to populate the form, or save all at once.`,
        );
      }
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
    setNote(null);
    try {
      const res = await readDefaultWindowsFileZillaXml();
      if (!res.found || (!res.siteManagerXml && !res.recentServersXml)) {
        setNote('No local FileZilla sitemanager.xml / recentservers.xml found under %APPDATA%\\FileZilla.');
        return;
      }

      const merged: FileZillaSiteCandidate[] = [];
      const seen = new Set<string>();
      let skipped = 0;

      for (const xml of [res.siteManagerXml, res.recentServersXml]) {
        if (!xml) continue;
        const parsed = parseFileZillaCandidates(xml);
        skipped += parsed.skipped;
        for (const c of parsed.candidates) {
          const key = `${c.protocol}|${c.host}|${c.port}|${c.user}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(c);
        }
      }

      if (merged.length === 0) {
        setError('Found Windows FileZilla files, but they contain no supported FTP/SFTP/WebDAV sites.');
        return;
      }

      setImportedSites(merged);
      applyFileZillaCandidate(merged[0], 0);
      setNote(
        `Detected ${merged.length} site(s) from Windows FileZilla${
          skipped ? ` (${skipped} skipped)` : ''
        }. Review below or click Save All.`,
      );
    } catch (err: any) {
      setError(err?.message || 'FileZilla auto-import failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLocation = async () => {
    if (!editingId) return;
    const ok = window.confirm(`Remove "${name || host}" from Connected Locations?`);
    if (!ok) return;
    setSaving(true);
    try {
      await removeConnectedLocation(editingId);
      onDeleted?.(editingId);
      onSaved(undefined, { connect: false });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not remove location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#10121b] text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Server size={17} className="text-sky-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">
                {initialLocation ? 'Edit Location Settings' : 'Connect Location / NAS / FileZilla'}
              </h2>
              <p className="text-[11px] text-white/50 truncate">
                {initialLocation
                  ? `${protocol.toUpperCase()} • ${host || initialLocation.host}:${port}`
                  : 'FTP, FTPS, SFTP, WebDAV, or local network SMB'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* FileZilla Import Card */}
          <div className="p-3.5 rounded-2xl bg-sky-500/8 border border-sky-500/25 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold flex items-center gap-1.5 text-sky-200">
                <FolderSync size={14} /> {initialLocation ? 'Reload from FileZilla XML' : 'Import from FileZilla'}
              </div>
              {importedSites.length > 1 && (
                <button
                  type="button"
                  onClick={handleSaveAllImported}
                  disabled={saving}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-[11px] cursor-pointer"
                >
                  Save All {importedSites.length} Sites
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {isWindowsApp() && (
                <button
                  type="button"
                  onClick={handleAutoDetectWindowsFileZilla}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-xl bg-sky-500 text-black font-semibold text-xs hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
                >
                  Auto-Import Windows FileZilla
                </button>
              )}
              <label className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Upload size={13} /> Import FileZilla XML
                <input type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={handleImportFileZillaFile} />
              </label>
            </div>

            {importedSites.length > 1 && (
              <div className="pt-1 space-y-1 max-h-36 overflow-y-auto">
                <div className="text-[10px] uppercase tracking-wider text-sky-200/70 font-semibold">
                  Select a site to populate the form below:
                </div>
                {importedSites.map((site, idx) => {
                  const active = idx === selectedImportIdx;
                  return (
                    <button
                      key={`${site.protocol}-${site.host}-${site.port}-${site.user}-${idx}`}
                      type="button"
                      onClick={() => applyFileZillaCandidate(site, idx)}
                      className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer border ${
                        active
                          ? 'bg-sky-500/25 border-sky-400/50 text-white'
                          : 'bg-black/30 border-white/8 text-white/75 hover:bg-white/10'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {site.folder.length > 0 ? `${site.folder.join(' / ')} / ` : ''}
                          {site.name}
                        </div>
                        <div className="text-[10px] font-mono text-white/50 truncate">
                          {site.protocol.toUpperCase()} • {site.user ? `${site.user}@` : ''}{site.host}:{site.port}
                        </div>
                      </div>
                      {active && <Check size={14} className="text-sky-300 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {note && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">{note}</div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200 flex items-center gap-2">
              <ShieldAlert size={14} className="shrink-0" /> <span>{error}</span>
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
                  onChange={e => handleProtocolChange(e.target.value as ConnectedLocationMeta['protocol'])}
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] text-white/55">Password / Token (OS Vault only)</label>
                  {hasExistingSecret && !clearSecret && (
                    <button
                      type="button"
                      onClick={() => {
                        setSecret('');
                        setClearSecret(true);
                      }}
                      className="text-[10px] text-red-300/80 hover:text-red-200 cursor-pointer"
                    >
                      Clear saved
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secret}
                    onChange={e => {
                      setSecret(e.target.value);
                      if (e.target.value) setClearSecret(false);
                    }}
                    placeholder={
                      hasExistingSecret && !clearSecret
                        ? 'Saved in vault (leave blank to keep)'
                        : 'Stored encrypted on device'
                    }
                    className="w-full px-3 py-2 pr-8 rounded-xl bg-black/45 border border-white/12 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/45 hover:text-white cursor-pointer"
                    title={showSecret ? 'Hide password' : 'Show password'}
                  >
                    {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            </div>

            {passwordHint && (
              <div className="text-[11px] text-amber-200/85 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                {passwordHint}
              </div>
            )}

            {isFtpFamily(protocol) && (
              <div>
                <label className="block text-[11px] text-white/55 mb-1">Account (FTP ACCT — optional)</label>
                <input
                  value={account}
                  onChange={e => setAccount(e.target.value)}
                  placeholder="Optional (used by FileZilla Account logon type)"
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white"
                />
              </div>
            )}

            <div className={isFtpFamily(protocol) ? 'grid grid-cols-1 sm:grid-cols-3 gap-3' : ''}>
              <div className={isFtpFamily(protocol) ? 'sm:col-span-2' : ''}>
                <label className="block text-[11px] text-white/55 mb-1">Initial Path / Share</label>
                <input
                  value={remoteDir}
                  onChange={e => setRemoteDir(e.target.value)}
                  placeholder={protocol === 'smb' ? '\\SharedMedia' : '/public_html'}
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white font-mono"
                />
              </div>
              {isFtpFamily(protocol) && (
                <div>
                  <label className="block text-[11px] text-white/55 mb-1">Transfer Mode</label>
                  <select
                    value={passive ? 'passive' : 'active'}
                    onChange={e => setPassive(e.target.value === 'passive')}
                    className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/12 text-xs text-white"
                  >
                    <option value="passive">Passive (PASV)</option>
                    <option value="active">Active (PORT)</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              {initialLocation && (
                <button
                  type="button"
                  onClick={handleDeleteLocation}
                  disabled={saving}
                  className="px-3.5 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={13} /> Remove
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black font-bold text-xs cursor-pointer"
              >
                {saving ? 'Saving…' : initialLocation ? 'Save Changes & Connect' : 'Save & Connect Location'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ConnectedLocationModal;
