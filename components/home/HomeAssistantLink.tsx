import React, { useEffect, useState } from 'react';
import { Home, Thermometer, Video, Check, AlertTriangle, Link2, Unlink } from 'lucide-react';
import { Button, Input, Surface } from '../ui';
import {
  loadHaConfig, saveHaConfig, clearHaConfig, testHaConnection, haErrorMessage, isNativeTransport,
  HaError, type HaConfig, type HaTestResult,
} from '../../services/home/homeAssistantService';

/**
 * Link Home Assistant: the hub that feeds real thermostats and cameras to the TV ambient dash.
 *
 * Phone / desktop first (typing a long-lived token with a TV remote is unreasonable). Flow:
 * URL + token → Test connection (lists the thermostats and cameras found) → Save.
 * Saved to users/{uid}/private/homeAssistant (owner-only); every device signed in to this account
 * then uses it, including the TV.
 */

const maskToken = (t: string) => (t.length > 12 ? `${t.slice(0, 6)}…${t.slice(-4)}` : '••••');

const HomeAssistantLink: React.FC = () => {
  const native = isNativeTransport();
  const [saved, setSaved] = useState<HaConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<HaTestResult | null>(null);
  const [error, setError] = useState<{ message: string; kind?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadHaConfig(true)
      .then(cfg => { if (alive) { setSaved(cfg); setEditing(!cfg); if (cfg) setBaseUrl(cfg.baseUrl); } })
      .catch(e => { if (alive) setError({ message: haErrorMessage(e) }); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  // Any edit invalidates a previous test.
  const onUrl = (v: string) => { setBaseUrl(v); setResult(null); setError(null); setNotice(null); };
  const onToken = (v: string) => { setToken(v); setResult(null); setError(null); setNotice(null); };

  const test = async () => {
    setTesting(true); setError(null); setResult(null); setNotice(null);
    try {
      setResult(await testHaConnection({ baseUrl, token }));
    } catch (e) {
      setError({ message: haErrorMessage(e), kind: e instanceof HaError ? e.kind : undefined });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const cfg = await saveHaConfig({ baseUrl, token });
      setSaved(cfg); setEditing(false); setToken(''); setResult(null);
      setNotice('Home Assistant linked. The TV ambient dash will show it within a couple of minutes.');
    } catch (e) {
      setError({ message: haErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    setSaving(true); setError(null);
    try {
      await clearHaConfig();
      setSaved(null); setEditing(true); setBaseUrl(''); setToken(''); setResult(null);
      setNotice('Home Assistant unlinked.');
    } catch (e) {
      setError({ message: haErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  // From a browser we cannot always reach a LAN address (mixed content / CORS); the TV app may still.
  const canSaveUntested = !!error && (error.kind === 'mixed-content' || error.kind === 'cors') && !!baseUrl.trim() && !!token.trim();

  return (
    <Surface className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#1a0026]/60 border border-[var(--pj-magenta)]/30 flex-shrink-0">
          <Home size={20} className="text-[var(--pj-orange)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">Home Assistant</div>
          <div className="text-xs text-white/60 leading-relaxed">
            Brings your real thermostat and cameras (Nest, Ecobee, Honeywell, Ring, UniFi, Reolink, Matter…) to the Plajah TV ambient dash.
          </div>
        </div>
        {saved && !editing && (
          <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-[var(--pj-success)] flex-shrink-0">
            <Check size={12} /> LINKED
          </span>
        )}
      </div>

      {!loaded ? (
        <div className="text-xs text-white/50">Loading…</div>
      ) : saved && !editing ? (
        <div className="flex flex-col gap-3">
          <div className="text-xs text-white/70 font-mono break-all">
            {saved.baseUrl} · token {maskToken(saved.token)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Link2 />} onClick={() => { setEditing(true); setBaseUrl(saved.baseUrl); setToken(''); setNotice(null); }}>
              Change
            </Button>
            <Button size="sm" variant="danger-quiet" icon={<Unlink />} loading={saving} onClick={unlink}>
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Input
            label="Home Assistant URL"
            placeholder="http://192.168.1.20:8123 or https://xxxx.ui.nabu.casa"
            value={baseUrl}
            onChange={e => onUrl(e.target.value)}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            hint={native
              ? 'This app connects straight to Home Assistant over your network. The TV must be able to reach this address.'
              : 'From a browser only an https:// address works, and Home Assistant must allow this site under "http: cors_allowed_origins" in configuration.yaml.'}
          />
          <Input
            label="Long-lived access token"
            type="password"
            placeholder="Paste the token"
            value={token}
            onChange={e => onToken(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            hint="In Home Assistant: your profile → Security → Long-lived access tokens → Create token. It is saved to your Plajah account and readable by your own signed-in devices."
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={testing} disabled={!baseUrl.trim() || !token.trim() || saving} onClick={test}>
              Test connection
            </Button>
            <Button size="sm" variant="primary" loading={saving} disabled={!result || testing} onClick={save}>
              Save
            </Button>
            {canSaveUntested && (
              <Button size="sm" variant="ghost" loading={saving} onClick={save}>
                Save anyway (for the TV app)
              </Button>
            )}
            {saved && (
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(null); setResult(null); }}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 text-xs text-[var(--pj-danger)] leading-relaxed">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error.message}</span>
        </div>
      )}
      {notice && <div className="text-xs text-[var(--pj-success)]">{notice}</div>}

      {result && (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 p-3 bg-black/20">
          <div className="text-xs text-[var(--pj-success)] font-bold flex items-center gap-1">
            <Check size={12} /> Connected{result.version ? ` to Home Assistant ${result.version}` : ''}
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/50 mb-1">Thermostats ({result.climates.length})</div>
            {result.climates.length ? result.climates.map((c, i) => (
              <div key={c.entityId} className="flex items-center gap-2 text-xs text-white/80 py-0.5">
                <Thermometer size={12} className="text-[var(--pj-orange)]" />
                <span className="truncate">{c.name}</span>
                <span className="text-white/50 ml-auto whitespace-nowrap">
                  {c.currentTemperature != null ? `${c.currentTemperature}${c.unit}` : '--'} · {c.hvacMode}{i === 0 ? ' · on TV' : ''}
                </span>
              </div>
            )) : <div className="text-xs text-white/50">None found.</div>}
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/50 mb-1">Cameras ({result.cameras.length})</div>
            {result.cameras.length ? result.cameras.map(c => (
              <div key={c.entityId} className="flex items-center gap-2 text-xs text-white/80 py-0.5">
                <Video size={12} className="text-[var(--pj-orange)]" />
                <span className="truncate">{c.name}</span>
                <span className="text-white/50 ml-auto whitespace-nowrap">{c.state}</span>
              </div>
            )) : <div className="text-xs text-white/50">None found.</div>}
          </div>
          <div className="text-[11px] text-white/50">The TV shows the first thermostat and up to two reachable cameras.</div>
        </div>
      )}
    </Surface>
  );
};

export default HomeAssistantLink;
